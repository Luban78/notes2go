/*
 * LubaNote – měření datového provozu synchronizace
 *
 * Měří aplikační HTTP payloady, které procházejí přes Supabase klienta.
 * Nejde o fakturační metriku Supabase: transportní hlavičky, komprese a
 * Realtime WebSocket mohou skutečný billing egress mírně změnit.
 *
 * DŮLEŽITÉ:
 * - měření je centrální přes custom fetch v supabaseClient.js,
 * - sync používá vnořené zacniSync()/dokonciSync(), takže fingerprint +
 *   následný plný sync tvoří jednu souvislou měřenou operaci,
 * - pole Egress je připravené pro budoucí bezpečný serverový zdroj;
 *   klient do sebe NESMÍ dostat Supabase Management API token.
 */
(() => {
  const rxEl = document.getElementById("syncTrafficRx");
  const txEl = document.getElementById("syncTrafficTx");
  const egressEl = document.getElementById("syncTrafficEgress");
  const barEl = document.getElementById("syncTrafficBar");

  const SYNC_TRAFFIC_VISIBLE_KEY = "lubanoteSyncTrafficVisibleV1";
  let panelViditelnyUzivatelem = true;

  try {
    panelViditelnyUzivatelem =
      localStorage.getItem(SYNC_TRAFFIC_VISIBLE_KEY) !== "0";
  } catch (_error) {}

  function aplikujViditelnostPanelu() {
    document.body?.classList.toggle(
      "lubaSyncTrafficUserHidden",
      !panelViditelnyUzivatelem
    );

    if (barEl) {
      if (panelViditelnyUzivatelem) {
        barEl.removeAttribute("aria-hidden");
      } else {
        barEl.setAttribute("aria-hidden", "true");
      }
    }
  }

  function nastavPanelViditelny(hodnota) {
    panelViditelnyUzivatelem = Boolean(hodnota);

    try {
      localStorage.setItem(
        SYNC_TRAFFIC_VISIBLE_KEY,
        panelViditelnyUzivatelem ? "1" : "0"
      );
    } catch (_error) {}

    aplikujViditelnostPanelu();

    window.dispatchEvent(
      new CustomEvent("lubanote:sync-traffic-visibility-change", {
        detail: { visible: panelViditelnyUzivatelem }
      })
    );

    return panelViditelnyUzivatelem;
  }

  aplikujViditelnostPanelu();

  const puvodniFetch = window.fetch.bind(window);
  const encoder = new TextEncoder();

  let hloubkaSyncu = 0;
  let aktivniSyncId = 0;
  let posledniSyncId = 0;
  let aktualniRx = 0;
  let aktualniTx = 0;
  let posledniRx = 0;
  let posledniTx = 0;
  let egressZbyvaBajtu = null;
  let egressZdroj = "";

  /*
   * DIAG 606 – pasivní audit Supabase requestů.
   *
   * Kritický cíl: zjistit, odkud přesně pochází velký RX po přepnutí
   * 📱 -> ☁️. Diagnostika NEMĚNÍ routing ani timing syncu, neukládá
   * hlavičky, tokeny ani request body. Drží pouze metadata requestu,
   * stav sync scope a skutečně přijaté/odeslané bajty.
   */
  const RX_DIAG_MAX_REQUESTU = 320;
  const RX_DIAG_MAX_UDALOSTI = 180;
  const rxDiagStart = performance.now();
  const rxDiagRequesty = [];
  const rxDiagUdalosti = [];
  let rxDiagSekvence = 0;
  let rxDiagCelkemRx = 0;
  let rxDiagCelkemTx = 0;

  function rxDiagCas() {
    return Math.max(0, Math.round(performance.now() - rxDiagStart));
  }

  function rxDiagTrim(pole, max) {
    if (pole.length > max) {
      pole.splice(0, pole.length - max);
    }
  }

  function rxDiagPopisUrl(input) {
    try {
      const raw =
        typeof input === "string"
          ? input
          : input?.url;

      const url = new URL(raw, window.location.href);
      const casti = url.pathname.split("/").filter(Boolean);

      const rpcIndex = casti.indexOf("rpc");
      if (rpcIndex >= 0 && casti[rpcIndex + 1]) {
        return `rpc:${casti[rpcIndex + 1]}`;
      }

      const restIndex = casti.indexOf("rest");
      if (
        restIndex >= 0 &&
        casti[restIndex + 1] === "v1" &&
        casti[restIndex + 2]
      ) {
        return `rest:${casti[restIndex + 2]}`;
      }

      const storageIndex = casti.indexOf("storage");
      if (storageIndex >= 0) {
        const objektIndex = casti.indexOf("object");
        if (objektIndex >= 0) {
          const bucket =
            casti[objektIndex + 2] ||
            casti[objektIndex + 1] ||
            "?";
          return `storage:${bucket}`;
        }
        return "storage";
      }

      const authIndex = casti.indexOf("auth");
      if (authIndex >= 0) {
        const v1Index = casti.indexOf("v1", authIndex);
        return `auth:${casti[v1Index + 1] || "request"}`;
      }

      return url.pathname || "/";
    } catch {
      return "unknown";
    }
  }

  function rxDiagUdalost(text) {
    rxDiagUdalosti.push({
      t: rxDiagCas(),
      text: String(text || "")
    });
    rxDiagTrim(rxDiagUdalosti, RX_DIAG_MAX_UDALOSTI);
  }

  function rxDiagZalozRequest(input, init, tx, syncId) {
    const metoda = String(
      init?.method ||
      (input instanceof Request ? input.method : "") ||
      "GET"
    ).toUpperCase();

    const zaznam = {
      id: ++rxDiagSekvence,
      t: rxDiagCas(),
      route: rxDiagPopisUrl(input),
      method: metoda,
      syncId: Number(syncId) || 0,
      syncDepth: hloubkaSyncu,
      scope:
        window.LubaNoteStorageScope?.ziskejAktivni?.() === "local"
          ? "local"
          : "cloud",
      tx: Math.max(0, Number(tx) || 0),
      rx: null,
      status: null,
      ms: null,
      error: ""
    };

    rxDiagCelkemTx += zaznam.tx;
    rxDiagRequesty.push(zaznam);
    rxDiagTrim(rxDiagRequesty, RX_DIAG_MAX_REQUESTU);
    return zaznam;
  }

  function rxDiagDokonciRequest(zaznam, { status, rx, ms, error } = {}) {
    if (!zaznam) return;

    if (Number.isFinite(Number(status))) {
      zaznam.status = Number(status);
    }

    if (Number.isFinite(Number(ms))) {
      zaznam.ms = Math.max(0, Math.round(Number(ms)));
    }

    if (Number.isFinite(Number(rx))) {
      const novaRx = Math.max(0, Number(rx) || 0);
      const melaRx =
        zaznam.rx !== null &&
        Number.isFinite(Number(zaznam.rx));

      if (!melaRx) {
        rxDiagCelkemRx += novaRx;
      } else {
        rxDiagCelkemRx += novaRx - Number(zaznam.rx || 0);
      }
      zaznam.rx = novaRx;
    }

    if (error) {
      zaznam.error = String(error);
    }
  }

  function rxDiagSnapshot() {
    const podleRoute = new Map();

    for (const row of rxDiagRequesty) {
      const key = `${row.method} ${row.route}`;
      const souhrn = podleRoute.get(key) || {
        key,
        count: 0,
        rx: 0,
        tx: 0,
        pendingRx: 0
      };

      souhrn.count += 1;
      souhrn.tx += Math.max(0, Number(row.tx) || 0);

      if (
        row.rx !== null &&
        Number.isFinite(Number(row.rx))
      ) {
        souhrn.rx += Math.max(0, Number(row.rx) || 0);
      } else {
        souhrn.pendingRx += 1;
      }

      podleRoute.set(key, souhrn);
    }

    return {
      sinceMs: rxDiagCas(),
      totalRx: rxDiagCelkemRx,
      totalTx: rxDiagCelkemTx,
      activeSyncDepth: hloubkaSyncu,
      activeSyncId: aktivniSyncId,
      lastSyncId: posledniSyncId,
      currentSyncRx: aktualniRx,
      currentSyncTx: aktualniTx,
      lastSyncRx: posledniRx,
      lastSyncTx: posledniTx,
      requests: rxDiagRequesty.map((row) => ({ ...row })),
      events: rxDiagUdalosti.map((row) => ({ ...row })),
      byRoute: Array.from(podleRoute.values())
        .sort((a, b) => (b.rx - a.rx) || (b.count - a.count))
    };
  }

  function jeSupabasePozadavek(input) {
    try {
      const url =
        typeof input === "string"
          ? input
          : input?.url;

      if (!url) return false;

      const parsed = new URL(url, window.location.href);
      return parsed.hostname.endsWith(".supabase.co");
    } catch {
      return false;
    }
  }

  function velikostTextu(text) {
    try {
      return encoder.encode(String(text)).byteLength;
    } catch {
      return String(text).length;
    }
  }

  function odhadVelikostiTela(body) {
    if (body == null) return 0;

    if (typeof body === "string") {
      return velikostTextu(body);
    }

    if (body instanceof URLSearchParams) {
      return velikostTextu(body.toString());
    }

    if (body instanceof Blob) {
      return Number(body.size) || 0;
    }

    if (body instanceof ArrayBuffer) {
      return body.byteLength;
    }

    if (ArrayBuffer.isView(body)) {
      return body.byteLength;
    }

    /*
     * U FormData nelze před odesláním bezpečně zjistit přesnou velikost
     * multipart obálky. Sečteme proto pouze známé hodnoty polí/souborů.
     */
    if (body instanceof FormData) {
      let soucet = 0;
      for (const [klic, hodnota] of body.entries()) {
        soucet += velikostTextu(klic);
        soucet +=
          hodnota instanceof Blob
            ? Number(hodnota.size) || 0
            : velikostTextu(hodnota);
      }
      return soucet;
    }

    return 0;
  }

  function formatBajtu(bytes) {
    const hodnota = Math.max(0, Number(bytes) || 0);

    if (hodnota < 1000) {
      return `${Math.round(hodnota)} B`;
    }

    if (hodnota < 1000 * 1000) {
      return `${(hodnota / 1000).toFixed(1).replace(".", ",")} kB`;
    }

    if (hodnota < 1000 * 1000 * 1000) {
      return `${(hodnota / 1000 / 1000).toFixed(2).replace(".", ",")} MB`;
    }

    return `${(hodnota / 1000 / 1000 / 1000).toFixed(2).replace(".", ",")} GB`;
  }

  function vykresli() {
    const localAktivni =
      window.LubaNoteStorageScope
        ?.ziskejAktivni?.() === "local";

    /* PATCH 586 – v LOCAL prostoru nesmí stará čísla z posledního
       cloud syncu vypadat jako právě probíhající přenos. */
    if (localAktivni) {
      if (rxEl) rxEl.textContent = "↓ —";
      if (txEl) txEl.textContent = "↑ —";
      if (egressEl) {
        egressEl.textContent = "E —";
        egressEl.title = "Obsahový cloud sync je vypnutý.";
      }

      if (barEl) {
        barEl.classList.remove("syncTrafficBarActive");
        barEl.dataset.syncActive = "0";
        barEl.dataset.storageScope = "local";
      }
      return;
    }

    if (barEl) {
      delete barEl.dataset.storageScope;
    }

    const rx = hloubkaSyncu > 0 ? aktualniRx : posledniRx;
    const tx = hloubkaSyncu > 0 ? aktualniTx : posledniTx;

    if (rxEl) rxEl.textContent = `↓ ${formatBajtu(rx)}`;
    if (txEl) txEl.textContent = `↑ ${formatBajtu(tx)}`;

    if (barEl) {
      barEl.classList.toggle(
        "syncTrafficBarActive",
        hloubkaSyncu > 0
      );
      barEl.dataset.syncActive =
        hloubkaSyncu > 0 ? "1" : "0";
    }

    if (egressEl) {
      if (Number.isFinite(egressZbyvaBajtu)) {
        egressEl.textContent =
          `E ${formatBajtu(egressZbyvaBajtu)}`;
        egressEl.title = egressZdroj
          ? `Zbývající egress · ${egressZdroj}`
          : "Zbývající egress";
      } else {
        /*
         * PATCH 565 – bez Management API tokenu nesmíme v PWA/APK číst
         * billing quota Supabase. Aby pole E nebylo navždy jen „—“,
         * zobrazujeme bezpečný aplikační odhad egressu právě probíhající /
         * poslední synchronizace. Pro naše sync requesty je to přijatý RX
         * payload ze Supabase. Nejde o fakturační metriku – transportní
         * hlavičky, komprese a Realtime mohou billing mírně změnit.
         */
        egressEl.textContent = `E≈ ${formatBajtu(rx)}`;
        egressEl.title =
          "Odhad egressu této synchronizace podle RX ze Supabase; nejde o billing quota Supabase.";
      }
    }
  }

  function zacniSync() {
    if (hloubkaSyncu === 0) {
      aktivniSyncId += 1;
      aktualniRx = 0;
      aktualniTx = 0;
      rxDiagUdalost(`SYNC START | id=${aktivniSyncId}`);
    }

    hloubkaSyncu += 1;
    vykresli();
  }

  function dokonciSync() {
    if (hloubkaSyncu <= 0) {
      hloubkaSyncu = 0;
      vykresli();
      return;
    }

    hloubkaSyncu -= 1;

    if (hloubkaSyncu === 0) {
      posledniSyncId = aktivniSyncId;
      posledniRx = aktualniRx;
      posledniTx = aktualniTx;
      rxDiagUdalost(
        `SYNC END | id=${posledniSyncId} | rx=${Math.round(posledniRx)} | tx=${Math.round(posledniTx)}`
      );
    }

    vykresli();
  }

  function pridejTx(bytes, syncId) {
    const hodnota = Math.max(0, Number(bytes) || 0);

    if (!syncId || hodnota <= 0) return;

    if (syncId === aktivniSyncId) {
      aktualniTx += hodnota;

      if (hloubkaSyncu === 0 && posledniSyncId === syncId) {
        posledniTx = aktualniTx;
      }
    } else if (syncId === posledniSyncId) {
      posledniTx += hodnota;
    }

    vykresli();
  }

  function pridejRx(bytes, syncId) {
    const hodnota = Math.max(0, Number(bytes) || 0);

    if (!syncId || hodnota <= 0) return;

    if (syncId === aktivniSyncId) {
      aktualniRx += hodnota;

      if (hloubkaSyncu === 0 && posledniSyncId === syncId) {
        posledniRx = aktualniRx;
      }
    } else if (syncId === posledniSyncId) {
      posledniRx += hodnota;
    }

    vykresli();
  }

  async function mereneFetch(input, init = {}) {
    const merit = jeSupabasePozadavek(input);
    const syncId =
      merit && hloubkaSyncu > 0
        ? aktivniSyncId
        : 0;

    const body =
      init?.body !== undefined
        ? init.body
        : input instanceof Request
          ? null
          : null;

    const tx = merit
      ? odhadVelikostiTela(body)
      : 0;

    const audit = merit
      ? rxDiagZalozRequest(input, init, tx, syncId)
      : null;

    if (syncId && tx > 0) {
      pridejTx(tx, syncId);
    }

    const zacatek = performance.now();

    let response;

    try {
      response = await puvodniFetch(input, init);
    } catch (error) {
      rxDiagDokonciRequest(audit, {
        ms: performance.now() - zacatek,
        error: error?.message || error
      });
      throw error;
    }

    if (!merit) {
      return response;
    }

    try {
      const contentLengthHeader =
        response.headers.get("content-length");
      const contentLength =
        contentLengthHeader !== null &&
        contentLengthHeader !== ""
          ? Number(contentLengthHeader)
          : Number.NaN;

      if (Number.isFinite(contentLength) && contentLength >= 0) {
        if (syncId) {
          pridejRx(contentLength, syncId);
        }

        rxDiagDokonciRequest(audit, {
          status: response.status,
          rx: contentLength,
          ms: performance.now() - zacatek
        });
      } else {
        /*
         * clone() NESTAHUJE odpověď znovu; pouze pasivně změří již přijaté
         * tělo. Běží mimo await, takže diagnostika nezdržuje vlastní sync.
         */
        response
          .clone()
          .arrayBuffer()
          .then((buffer) => {
            if (syncId) {
              pridejRx(buffer.byteLength, syncId);
            }

            rxDiagDokonciRequest(audit, {
              status: response.status,
              rx: buffer.byteLength,
              ms: performance.now() - zacatek
            });
          })
          .catch((error) => {
            rxDiagDokonciRequest(audit, {
              status: response.status,
              ms: performance.now() - zacatek,
              error: `measure:${error?.message || error}`
            });
          });
      }
    } catch (error) {
      rxDiagDokonciRequest(audit, {
        status: response.status,
        ms: performance.now() - zacatek,
        error: `headers:${error?.message || error}`
      });
    }

    return response;
  }

  function nastavEgressZbyvaBajtu(bytes, zdroj = "") {
    const cislo = Number(bytes);
    egressZbyvaBajtu =
      Number.isFinite(cislo) && cislo >= 0
        ? cislo
        : null;
    egressZdroj = String(zdroj || "");
    vykresli();
  }

  function nastavEgressZbyvaGB(gb, zdroj = "") {
    const cislo = Number(gb);
    nastavEgressZbyvaBajtu(
      Number.isFinite(cislo)
        ? cislo * 1000 * 1000 * 1000
        : null,
      zdroj
    );
  }

  window.addEventListener(
    "lubanote:storage-scope-change",
    (event) => {
      rxDiagUdalost(
        `SCOPE CHANGE | ${String(event.detail?.scope || "?")}`
      );
      vykresli();
    }
  );

  window.LubaNoteSyncRxDiag = {
    snapshot: rxDiagSnapshot,
    clear: () => {
      rxDiagRequesty.length = 0;
      rxDiagUdalosti.length = 0;
      rxDiagCelkemRx = 0;
      rxDiagCelkemTx = 0;
      rxDiagSekvence = 0;
      rxDiagUdalost("DIAG CLEAR");
    }
  };

  rxDiagUdalost("DIAG 606 READY");

  window.LubaNoteSyncTraffic = {
    fetch: mereneFetch,
    zacniSync,
    dokonciSync,
    nastavEgressZbyvaBajtu,
    nastavEgressZbyvaGB,
    jePanelViditelny: () => panelViditelnyUzivatelem,
    nastavPanelViditelny,
    stav: () => ({
      aktivni: hloubkaSyncu > 0,
      rx: hloubkaSyncu > 0 ? aktualniRx : posledniRx,
      tx: hloubkaSyncu > 0 ? aktualniTx : posledniTx,
      egressZbyvaBajtu
    })
  };

  vykresli();
})();
