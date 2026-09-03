/* ============================================================
   LUBANOTE – REALTIME SIGNÁL PRO OKAMŽITÝ SYNC

   Účel:
   - po potvrzeném zápisu poznámky do Supabase pošle ostatním
     právě připojeným zařízením pouze malý signál „cloud se změnil“,
   - obsah poznámky se přes Realtime nikdy neposílá,
   - přijímající zařízení použije existující bezpečný revizní sync,
   - více rychlých změn se sloučí do jednoho syncu,
   - poznámku, kterou právě vlastní editor na jiném zařízení,
     necháme na pokoji a zkusíme ji dorovnat po uvolnění lease.
   ============================================================ */

(() => {
  "use strict";

  const KANAL_PREFIX = "lubanote-sync-signal";
  const UDALOST_ZAPISU = "lubanote:cloud-write-confirmed";
  const ZPOZDENI_ODESLANI_MS = 120;
  const ZPOZDENI_PRIJMU_MS = 260;
  const ZPOZDENI_BLOKOVANE_POZNAMKY_MS = 700;
  const ZPOZDENI_OPAKOVANI_PO_CHYBE_MS = 1200;

  let realtimeKanal = null;
  let realtimeUserId = null;
  let realtimePriprava = null;

  let casovacOdeslani = null;
  let cekajiciLokalniZapisy = new Map();
  let poradiLokalnihoZapisu = 0;

  let casovacVzdalenySync = null;
  let probihajiciVzdalenySync = null;
  let cekajiciVzdalenyId = new Map();
  let poradiVzdalenychSignalu = 0;
  let cekajiciGlobalniSignal = 0;

  function ziskejDeviceId() {
    const zApi =
      window.LubaNoteSync?.ziskejDeviceId?.();

    if (zApi) {
      return zApi;
    }

    try {
      let deviceId =
        localStorage.getItem("lubanoteDeviceId");

      if (!deviceId) {
        deviceId = crypto.randomUUID();
        localStorage.setItem(
          "lubanoteDeviceId",
          deviceId
        );
      }

      return deviceId;
    } catch {
      return null;
    }
  }

  async function ziskejUzivatele() {
    if (typeof getCurrentUser !== "function") {
      return null;
    }

    try {
      return await getCurrentUser();
    } catch {
      return null;
    }
  }

  async function odstranRealtimeKanal() {
    const staryKanal = realtimeKanal;

    realtimeKanal = null;
    realtimeUserId = null;
    realtimePriprava = null;

    if (!staryKanal) {
      return;
    }

    try {
      await supabaseClient?.removeChannel?.(
        staryKanal
      );
    } catch {
      // Starý kanál nesmí blokovat další připojení.
    }
  }

  function zpracujVzdalenySignal(payload) {
    const data = payload?.payload || payload || {};
    const vlastniDeviceId = ziskejDeviceId();

    if (
      data.deviceId &&
      vlastniDeviceId &&
      data.deviceId === vlastniDeviceId
    ) {
      return;
    }

    const noteIds = Array.isArray(data.noteIds)
      ? data.noteIds.filter(Boolean)
      : [];

    poradiVzdalenychSignalu += 1;
    const poradi = poradiVzdalenychSignalu;

    if (noteIds.length === 0) {
      cekajiciGlobalniSignal = poradi;
    } else {
      noteIds.forEach((id) => {
        cekajiciVzdalenyId.set(id, poradi);
      });
    }

    naplanujVzdalenySync(
      ZPOZDENI_PRIJMU_MS
    );
  }

  async function pripravRealtimeKanal() {
    if (!navigator.onLine) {
      return false;
    }

    if (
      typeof supabaseClient === "undefined" ||
      !supabaseClient
    ) {
      return false;
    }

    const user = await ziskejUzivatele();

    if (!user?.id) {
      return false;
    }

    if (
      realtimeKanal &&
      realtimeUserId === user.id
    ) {
      return true;
    }

    if (realtimePriprava) {
      return realtimePriprava;
    }

    realtimePriprava = (async () => {
      if (
        realtimeKanal &&
        realtimeUserId !== user.id
      ) {
        await odstranRealtimeKanal();
      }

      const kanal = supabaseClient.channel(
        `${KANAL_PREFIX}-${user.id}`,
        {
          config: {
            broadcast: {
              self: false,
              ack: true
            }
          }
        }
      );

      kanal.on(
        "broadcast",
        { event: "notes-changed" },
        zpracujVzdalenySignal
      );

      const prihlasen = await new Promise(
        (resolve) => {
          let hotovo = false;

          const dokoncit = (vysledek) => {
            if (hotovo) {
              return;
            }

            hotovo = true;
            clearTimeout(timer);
            resolve(vysledek);
          };

          const timer = setTimeout(
            () => dokoncit(false),
            3500
          );

          kanal.subscribe((stav) => {
            if (stav === "SUBSCRIBED") {
              dokoncit(true);
              return;
            }

            if (
              stav === "CHANNEL_ERROR" ||
              stav === "TIMED_OUT" ||
              stav === "CLOSED"
            ) {
              if (hotovo) {
                /*
                 * Kanál mohl spadnout až dlouho po úspěšném připojení.
                 * Reference se vynuluje, aby focus/online mohl vytvořit
                 * nový kanál místo falešného dojmu, že stále posloucháme.
                 */
                if (realtimeKanal === kanal) {
                  realtimeKanal = null;
                  realtimeUserId = null;
                }
                return;
              }

              dokoncit(false);
            }
          });
        }
      );

      if (!prihlasen) {
        try {
          await supabaseClient.removeChannel(
            kanal
          );
        } catch {
          // Neúspěšný kanál jen zahodíme.
        }

        return false;
      }

      realtimeKanal = kanal;
      realtimeUserId = user.id;
      return true;
    })();

    try {
      return await realtimePriprava;
    } finally {
      realtimePriprava = null;
    }
  }

  function naplanujOdeslaniSignalu(zpozdeni) {
    clearTimeout(casovacOdeslani);

    casovacOdeslani = setTimeout(
      () => {
        casovacOdeslani = null;

        odesliCekajiciSignal()
          .then((odeslano) => {
            if (
              odeslano !== true &&
              cekajiciLokalniZapisy.size > 0 &&
              navigator.onLine
            ) {
              naplanujOdeslaniSignalu(
                ZPOZDENI_OPAKOVANI_PO_CHYBE_MS
              );
            }
          })
          .catch((error) => {
            console.warn(
              "Realtime oznámení změny poznámky selhalo:",
              error
            );

            if (
              cekajiciLokalniZapisy.size > 0 &&
              navigator.onLine
            ) {
              naplanujOdeslaniSignalu(
                ZPOZDENI_OPAKOVANI_PO_CHYBE_MS
              );
            }
          });
      },
      Math.max(0, Number(zpozdeni) || 0)
    );
  }

  function pridejPotvrzenyLokalniZapis(detail) {
    const noteId = detail?.noteId;

    if (!noteId) {
      return;
    }

    poradiLokalnihoZapisu += 1;

    cekajiciLokalniZapisy.set(
      noteId,
      {
        revision:
          Number.isFinite(Number(detail?.revision))
            ? Number(detail.revision)
            : null,
        poradi: poradiLokalnihoZapisu
      }
    );

    naplanujOdeslaniSignalu(
      ZPOZDENI_ODESLANI_MS
    );
  }

  async function odesliCekajiciSignal() {
    if (cekajiciLokalniZapisy.size === 0) {
      return true;
    }

    const kanalPripraven =
      await pripravRealtimeKanal();

    if (!kanalPripraven || !realtimeKanal) {
      return false;
    }

    const snapshot = new Map(
      cekajiciLokalniZapisy
    );

    const noteIds = Array.from(snapshot.keys());
    const revisions = Object.fromEntries(
      Array.from(snapshot.entries()).map(
        ([noteId, zaznam]) => [
          noteId,
          zaznam?.revision ?? null
        ]
      )
    );

    const vysledek = await realtimeKanal.send({
      type: "broadcast",
      event: "notes-changed",
      payload: {
        deviceId: ziskejDeviceId(),
        noteIds,
        revisions,
        sentAt: new Date().toISOString()
      }
    });

    if (vysledek !== "ok") {
      return false;
    }

    snapshot.forEach((zaznam, noteId) => {
      if (
        cekajiciLokalniZapisy.get(noteId)?.poradi ===
          zaznam?.poradi
      ) {
        cekajiciLokalniZapisy.delete(noteId);
      }
    });

    if (cekajiciLokalniZapisy.size > 0) {
      naplanujOdeslaniSignalu(
        ZPOZDENI_ODESLANI_MS
      );
    }

    return true;
  }

  function naplanujVzdalenySync(zpozdeni) {
    clearTimeout(casovacVzdalenySync);

    casovacVzdalenySync = setTimeout(
      () => {
        casovacVzdalenySync = null;

        spustVzdalenySync().catch(
          (error) => {
            console.warn(
              "Realtime vynucený sync selhal:",
              error
            );
          }
        );
      },
      Math.max(0, Number(zpozdeni) || 0)
    );
  }

  async function ziskejBlokovanePoznamky() {
    const fn =
      window.LubaNoteSync
        ?.ziskejIdPoznamekEditovanychJinde;

    if (typeof fn !== "function") {
      return new Set();
    }

    try {
      const vysledek = await fn();
      return vysledek instanceof Set
        ? vysledek
        : new Set();
    } catch {
      return new Set();
    }
  }

  async function spustVzdalenySync() {
    if (probihajiciVzdalenySync) {
      return probihajiciVzdalenySync;
    }

    if (
      cekajiciGlobalniSignal === 0 &&
      cekajiciVzdalenyId.size === 0
    ) {
      return true;
    }

    if (!navigator.onLine) {
      return false;
    }

    probihajiciVzdalenySync = (async () => {
      const blokovane =
        await ziskejBlokovanePoznamky();

      const snapshotId = new Map(
        cekajiciVzdalenyId
      );
      const snapshotGlobalni =
        cekajiciGlobalniSignal;

      const neblokovaneId = Array.from(
        snapshotId.keys()
      ).filter((id) => !blokovane.has(id));

      const vsechnySignalovaneJsouBlokovane =
        snapshotGlobalni === 0 &&
        snapshotId.size > 0 &&
        neblokovaneId.length === 0;

      if (vsechnySignalovaneJsouBlokovane) {
        naplanujVzdalenySync(
          ZPOZDENI_BLOKOVANE_POZNAMKY_MS
        );
        return false;
      }

      const syncFn =
        window.LubaNoteSync
          ?.synchronizujPoznamkyTed;

      if (typeof syncFn !== "function") {
        naplanujVzdalenySync(
          ZPOZDENI_OPAKOVANI_PO_CHYBE_MS
        );
        return false;
      }

      const synchronizovano =
        await syncFn();

      if (synchronizovano !== true) {
        naplanujVzdalenySync(
          ZPOZDENI_OPAKOVANI_PO_CHYBE_MS
        );
        return false;
      }

      if (
        snapshotGlobalni !== 0 &&
        cekajiciGlobalniSignal === snapshotGlobalni
      ) {
        cekajiciGlobalniSignal = 0;
      }

      neblokovaneId.forEach((id) => {
        const snapshotPoradi =
          snapshotId.get(id);

        if (
          cekajiciVzdalenyId.get(id) ===
            snapshotPoradi
        ) {
          cekajiciVzdalenyId.delete(id);
        }
      });

      const staleBlokovaneId = Array.from(
        snapshotId.keys()
      ).filter((id) => blokovane.has(id));

      if (staleBlokovaneId.length > 0) {
        naplanujVzdalenySync(
          ZPOZDENI_BLOKOVANE_POZNAMKY_MS
        );
      } else if (
        cekajiciGlobalniSignal !== 0 ||
        cekajiciVzdalenyId.size > 0
      ) {
        /*
         * Během právě dokončeného syncu mohl dorazit další novější
         * Realtime signál. Jeho pořadí se neshoduje se snapshotem,
         * proto zůstalo ve frontě a hned provedeme další dorovnání.
         */
        naplanujVzdalenySync(
          ZPOZDENI_PRIJMU_MS
        );
      }

      return true;
    })();

    try {
      return await probihajiciVzdalenySync;
    } finally {
      probihajiciVzdalenySync = null;
    }
  }

  async function pockejNaCerstvouPoznamkuPredOtevrenim(
    noteId
  ) {
    if (!noteId) {
      return true;
    }

    for (let pokus = 0; pokus < 3; pokus += 1) {
      const maCekajiciSignal =
        cekajiciGlobalniSignal !== 0 ||
        cekajiciVzdalenyId.has(noteId);

      if (!maCekajiciSignal) {
        return true;
      }

      /*
       * Pokud poznámku stále vlastní jiné zařízení, nesmíme čekáním
       * předběhnout handoff. Otevření pokračuje a editorHandoff.js
       * uživateli nabídne bezpečné uložení a převzetí.
       */
      const blokovane =
        await ziskejBlokovanePoznamky();

      if (blokovane.has(noteId)) {
        return true;
      }

      clearTimeout(casovacVzdalenySync);
      casovacVzdalenySync = null;

      const synchronizovano =
        await spustVzdalenySync();

      if (synchronizovano !== true) {
        break;
      }
    }

    const staleCeka =
      cekajiciGlobalniSignal !== 0 ||
      cekajiciVzdalenyId.has(noteId);

    if (!staleCeka) {
      return true;
    }

    if (
      typeof window.zobrazZpravuAplikace ===
        "function"
    ) {
      window.zobrazZpravuAplikace(
        "Synchronizace",
        "LubaNote ví, že je v cloudu novější verze této poznámky, ale teď se ji nepodařilo bezpečně stáhnout. Zkus poznámku otevřít znovu za chvíli."
      );
    }

    return false;
  }

  window.addEventListener(
    UDALOST_ZAPISU,
    (event) => {
      pridejPotvrzenyLokalniZapis(
        event?.detail || {}
      );
    }
  );

  window.addEventListener(
    "lubanote:auth-valid",
    () => {
      setTimeout(() => {
        pripravRealtimeKanal().catch(() => {});
      }, 0);
    }
  );

  window.addEventListener(
    "lubanote:auth-expired",
    () => {
      odstranRealtimeKanal().catch(() => {});
    }
  );

  window.addEventListener(
    "online",
    () => {
      setTimeout(() => {
        pripravRealtimeKanal().then(() => {
          if (
            cekajiciGlobalniSignal !== 0 ||
            cekajiciVzdalenyId.size > 0
          ) {
            naplanujVzdalenySync(180);
          }

          if (cekajiciLokalniZapisy.size > 0) {
            naplanujOdeslaniSignalu(0);
          }
        });
      }, 300);
    }
  );

  window.addEventListener(
    "focus",
    () => {
      if (!realtimeKanal && navigator.onLine) {
        pripravRealtimeKanal().catch(() => {});
      }
    }
  );

  setTimeout(() => {
    pripravRealtimeKanal().catch(() => {});
  }, 0);

  window.LubaNoteSyncRealtime = {
    priprav: pripravRealtimeKanal,
    pockejPredOtevrenim:
      pockejNaCerstvouPoznamkuPredOtevrenim,
    spustCekajiciSync: spustVzdalenySync,
    ziskejCekajiciId: () =>
      Array.from(cekajiciVzdalenyId.keys())
  };
})();
