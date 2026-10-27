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
  let ucetAktivni = false;

  try {
    panelViditelnyUzivatelem =
      localStorage.getItem(SYNC_TRAFFIC_VISIBLE_KEY) !== "0";
  } catch (_error) {}

  /*
   * PATCH 679C – RX/TX/E panel vlastni i skutecny DOM stav `hidden`.
   * Driv o nem rozhodoval neprimo supabaseClient.js pri refreshi stavu uctu.
   * Po backend handoffu mohl byt prepinac spravne Zapnuto, ale HTML atribut
   * `hidden` zustal viset. Panel se ted po potvrzeni aktivniho uctu zobrazi
   * deterministicky a pri odhlaseni / blokaci se zase skryje.
   */
  function aplikujViditelnostPanelu() {
    document.body?.classList.toggle(
      "lubaSyncTrafficUserHidden",
      !panelViditelnyUzivatelem
    );

    if (barEl) {
      const maBytViditelny =
        panelViditelnyUzivatelem && ucetAktivni;

      barEl.hidden = !maBytViditelny;

      if (maBytViditelny) {
        barEl.removeAttribute("aria-hidden");
      } else {
        barEl.setAttribute("aria-hidden", "true");
      }
    }
  }

  function nastavAktivniUcet(hodnota) {
    ucetAktivni = Boolean(hodnota);
    aplikujViditelnostPanelu();
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

      if (
        window.LubaNoteBackendConfig?.jeBackendPozadavek
      ) {
        return window.LubaNoteBackendConfig.jeBackendPozadavek(
          url
        );
      }

      /* Fallback pro případ staré cache bez backendConfig.js. */
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
    "lubanote:account-active",
    () => nastavAktivniUcet(true)
  );

  [
    "lubanote:auth-required",
    "lubanote:auth-expired",
    "lubanote:account-blocked",
    "lubanote:account-access-denied"
  ].forEach((nazevUdalosti) => {
    window.addEventListener(
      nazevUdalosti,
      () => nastavAktivniUcet(false)
    );
  });

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



/* 695O – RX/TX/E: pasivni casova osa od startu az po skutecne zmizeni splash.
 * Pouze diagnostika; nezahajuje sync, necte obsah poznamek a nepridava RPC.
 * Napojeni na jiz existujici LubaNoteStartupDiag (stejna data jako Debug Hub). */
(() => {
  "use strict";
  if (window.LubaNoteStartTimeline695O) return;
  const stavovyText = document.getElementById("syncStatusText");
  const popisek = document.querySelector("#syncTrafficBar .syncTrafficLabel");
  const diagnostika = window.LubaNoteStartupDiag;
  if (!stavovyText || !diagnostika?.radky || !diagnostika?.priRadku) return;

  const zaznamy = [];
  let uiPripraveno = false;
  let splashPryc = false;
  let pridanPrirozenyStart = false;
  let okno = null;
  let predesleZamereni = null;
  let rozbaleno = false;

  function rozparsuj(radek) {
    const m = /^\s*(\d+)\s+ms\s*\|\s*([^|]+?)\s*\|\s*(.*)$/.exec(String(radek));
    if (!m) return null;
    return { t: Number(m[1]), typ: m[2].trim(), zprava: m[3].trim(), raw: String(radek) };
  }
  function vlozRadek(radek) {
    if (splashPryc || zaznamy.length >= 520) return;
    const zaznam = rozparsuj(radek);
    if (!zaznam) return;
    zaznamy.push(zaznam);
    if (zaznam.typ === "EVENT" && zaznam.zprava.includes("UI READY / splash-ready")) {
      uiPripraveno = true;
    }
    if (zaznam.zprava.includes("695O SPLASH REMOVED")) splashPryc = true;
    if (okno && !okno.hidden && (zaznam.typ === "EVENT" || zaznam.typ === "FAST" ||
        zaznam.typ === "V2" || zaznam.typ === "STORAGE" || zaznam.typ === "END")) {
      requestAnimationFrame(vykresli);
    }
  }
  diagnostika.radky().forEach(vlozRadek);
  diagnostika.priRadku(vlozRadek);

  // Sledujeme skutecne odstraneni splash: UI READY je pripravenost dat,
  // ale pismo, 2x requestAnimationFrame a CSS transition mohou trvat dale.
  const splash = document.getElementById("appSplash");
  if (splash && !splash.classList.contains("appSplashHidden")) {
    const observerStavu = new MutationObserver(() => {
      if (splash.classList.contains("appSplashHidden") && !pridanPrirozenyStart) {
        pridanPrirozenyStart = true;
        diagnostika.zapis("EVENT", "695O SPLASH HIDE START");
        observerStavu.disconnect();
      }
    });
    observerStavu.observe(splash, { attributes: true, attributeFilter: ["class"] });
  }
  if (splash?.parentNode) {
    const rodic = splash.parentNode;
    const observerZmizeni = new MutationObserver(() => {
      if (splash.isConnected) return;
      diagnostika.zapis("EVENT", "695O SPLASH REMOVED");
      observerZmizeni.disconnect();
    });
    observerZmizeni.observe(rodic, { childList: true });
  }

  const css = document.createElement("style");
  css.id = "lnSyncTimelineStyle695O";
  css.textContent = `
    #syncStatusText.lnStartTraceTrigger695O,
    #syncTrafficBar .syncTrafficLabel.lnStartTraceTrigger695O {
      cursor:pointer; text-decoration:underline dotted; text-underline-offset:3px;
      -webkit-tap-highlight-color:transparent;
    }
    #syncStatusText.lnStartTraceTrigger695O:focus-visible,
    #syncTrafficBar .syncTrafficLabel.lnStartTraceTrigger695O:focus-visible {
      outline:2px solid var(--color-accent);outline-offset:2px;border-radius:4px;
    }
    .lnStartTrace695O[hidden] {display:none!important}
    .lnStartTrace695O { position:fixed;inset:0;z-index:30020;
      display:flex;align-items:center;justify-content:center;
      box-sizing:border-box;padding:max(12px,env(safe-area-inset-top)) 12px max(12px,env(safe-area-inset-bottom));
      background:rgba(0,0,0,.69);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);
      color:var(--color-text);font:14px/1.5 system-ui,-apple-system,sans-serif; }
    .lnStartTraceBox695O {box-sizing:border-box;width:min(100%,640px);max-height:94dvh;
      min-height:0;display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--color-border);
      border-radius:18px;background:var(--color-surface);box-shadow:0 18px 55px #0007;}
    .lnStartTraceHead695O {display:flex;align-items:center;gap:8px;flex:0 0 auto;
      padding:13px 14px 11px;border-bottom:1px solid var(--color-border);}
    .lnStartTraceHead695O strong{flex:1;font-size:17px;line-height:1.25}
    .lnStartTrace695O button {color:var(--color-text);font:inherit;
      border:1px solid var(--color-border);background:var(--color-background);
      border-radius:9px;min-height:36px;padding:6px 10px;cursor:pointer;}
    .lnStartTraceHead695O button {flex:0 0 auto}
    .lnStartTraceScroll695O {min-height:0;overflow:auto;overscroll-behavior:contain;padding:13px 14px 18px;}
    .lnStartTraceCards695O{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:12px;}
    .lnStartTraceCard695O{border:1px solid var(--color-border);border-radius:12px;padding:10px;min-width:0;}
    .lnStartTraceCard695O b{display:block;color:var(--color-accent);font-size:23px;font-variant-numeric:tabular-nums}
    .lnStartTraceCard695O span{display:block;font-size:12px;opacity:.84}
    .lnStartTrace695O h3{font-size:15px;margin:16px 0 7px;}
    .lnStartTrace695O p{margin:7px 0;color:var(--color-text);opacity:.87;font-size:12px;line-height:1.5;}
    .lnStartTraceList695O{display:flex;flex-direction:column;gap:8px;}
    .lnStartTraceStep695O{display:grid;grid-template-columns:68px minmax(0,1fr);gap:10px;
      border:1px solid var(--color-border);border-radius:11px;padding:9px 10px;}
    .lnStartTraceTime695O{font-size:13px;font-weight:750;color:var(--color-accent);font-variant-numeric:tabular-nums;white-space:nowrap;}
    .lnStartTraceStep695O strong{font-size:13px;display:block}
    .lnStartTraceStep695O small{font-size:11px;opacity:.76;display:block;margin-top:2px}
    .lnStartTraceStep695O p{margin:3px 0 0}
    .lnStartTraceWarn695O{border-left:3px solid var(--color-accent);padding:7px 9px;
      background:var(--color-background);border-radius:5px}
    .lnStartTraceExtra695O{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0;}
    .lnStartTraceExtra695O button{flex:1}
    .lnStartTraceEvents695O{display:none;flex-direction:column;gap:5px;margin-top:10px}
    .lnStartTraceEvents695O[data-expanded="true"]{display:flex}
    .lnStartTraceEvent695O{padding:7px 9px;background:var(--color-background);border-radius:8px;}
    .lnStartTraceEvent695O code{display:block;overflow-wrap:anywhere;font-size:11px;line-height:1.5;
      white-space:pre-wrap;color:var(--color-text);}
    .lnStartTraceEvent695O span{font-size:11px;opacity:.77}
    .lnStartTraceNote695O{font-size:11px;opacity:.74}
    @media(max-width:440px){.lnStartTrace695O{padding:7px}.lnStartTraceBox695O{max-height:96dvh}
      .lnStartTraceHead695O{padding:10px 9px}.lnStartTraceHead695O strong{font-size:15px}
      .lnStartTraceScroll695O{padding:10px}.lnStartTraceStep695O{grid-template-columns:61px minmax(0,1fr);gap:7px;}}
  `;
  document.head.appendChild(css);

  function format(ms) {
    if (!Number.isFinite(ms) || ms < 0) return "—";
    return ms < 1000 ? `${Math.round(ms)} ms` :
      `${(ms / 1000).toLocaleString("cs-CZ", { maximumFractionDigits: 2 })} s`;
  }
  function popis(radek) {
    const s = radek.zprava;
    if (/APP START/.test(s)) return "Začátek měření při spuštění JavaScriptu. Nejde ještě o hotovou aplikaci.";
    if (/DOM CONTENT LOADED/.test(s)) return "Prohlížeč dokončil sestavení HTML. Další skripty a data se mohou dál načítat.";
    if (/WINDOW LOAD/.test(s)) return "Dokončilo se načtení základních webových zdrojů stránky.";
    if (/REGULAR INDEXEDDB CACHE READY/.test(s)) return "Načtena místní databáze poznámek z IndexedDB, která dovoluje používat aplikaci i bez internetu.";
    if (/NATIVE NETWORK/.test(s)) return "Android potvrdil stav internetového připojení.";
    if (/CONTROL \|/.test(s)) return "Server potvrdil provozní režim a aktivní backend.";
    if (/START SYNC FLOW/.test(s)) return "Začíná úvodní kontrola účtu a synchronizace.";
    if (/FAST SYNC CHECK/.test(s)) return "Malá kontrola uloženého lokálního stavu a serverového otisku. Při shodě se obsah poznámek nestahuje.";
    if (/PRIVATE SYNC SKIP/.test(s)) return "Otisky se shodují: obsah poznámek není potřeba načítat ani porovnávat jednotlivě.";
    if (/REMOTE DELTA APPLIED/.test(s)) return "Byly načteny jen změněné serverové poznámky, ne všechno znovu.";
    if (/RECONCILE/.test(s)) return "Opravné porovnání serverových a místních revizí; je dražší než Fast Sync.";
    if (/TAG START CACHE HIT/.test(s)) return "Barvy a štítky jsou dostupné z místní cache; není nutné čekat na jejich stažení.";
    if (/TAG START CACHE MISS/.test(s)) return "Místní cache štítků chybí, takže může být nutné čekat na server.";
    if (/ONBOARDING DEFERRED/.test(s)) return "Kontrola uvítací poznámky byla odložena až po zobrazení aplikace.";
    if (/STORAGE.*OVERFLOW SAVE/.test(`${radek.typ} ${s}`)) return "Plná data byla zapsána do IndexedDB. Jde o lokální zápis, nikoli o odeslání do cloudu.";
    if (/E2E.*ROOT READY/.test(`${radek.typ} ${s}`)) return "Šifrovací klíč je připraven, obsah se nemá posílat bez ověření ochrany.";
    if (/UI READY \/ splash-ready/.test(s)) return "Aplikace oznámila, že obsah je připraven a může začít skrývat úvodní obrazovku.";
    if (/695O SPLASH HIDE START/.test(s)) return "Úvodní obrazovka se začala vizuálně skrývat. Mohou zbývat CSS animace.";
    if (/695O SPLASH REMOVED/.test(s)) return "Úvodní obrazovka skutečně zmizela z DOM. Aplikace je viditelná.";
    if (/AUTH user/.test(s)) return "Ověření přihlášeného uživatele vůči serveru.";
    if (/get_my_access/.test(s)) return "Kontrola oprávnění účtu k používání LubaNote.";
    if (/get_private_sync_fingerprint/.test(s)) return "Dotaz na malý otisk serverových dat pro rychlé rozhodnutí, zda je potřeba něco synchronizovat.";
    if (/get_private_bootstrap_manifest/.test(s)) return "Dotaz na serverový seznam metadat poznámek, nikoliv jejich plný obsah.";
    if (/get_note_changes_since/.test(s)) return "Dotaz na seznam změn od poslední potvrzené serverové události.";
    if (/get_notes_by_ids_safe/.test(s)) return "Stažení obsahu pouze vybraných změněných poznámek.";
    if (/REST tags/.test(s)) return "Čtení štítků a barev ze serveru.";
    if (/CORE V2 IMG/.test(s)) return "Bezpečné ověření nebo obnova obrázků uvnitř poznámky.";
    if (/SPLASH/.test(s)) return "Událost připravenosti nebo zobrazení aplikace.";
    if (/^HTTP/.test(s)) return "Síťový požadavek; jeho odezva může běžet souběžně s jinými kroky.";
    return "Diagnostická událost aplikace. U časového rozboru jde o okamžik zaznamenání, nikoliv vždy o samostatnou práci.";
  }

  function vyberKlicove(body) {
    const klicove = [];
    const pravidla = [
      ["MARK", /APP START/, "Start aplikace"],
      ["MARK", /DOM CONTENT LOADED/, "HTML připraveno"],
      ["STORAGE", /REGULAR INDEXEDDB CACHE READY/, "Místní poznámky načteny"],
      ["START", /^START SYNC FLOW$/, "Začala kontrola synchronizace"],
      ["END", /^HTTP #\d+ GET AUTH user \|/, "Uživatel ověřen"],
      ["END", /^HTTP #\d+ POST RPC lubanote_get_my_access \|/, "Oprávnění účtu ověřeno"],
      ["START", /^FAST SYNC CHECK$/, "Fast Sync zahájen"],
      ["END", /^FAST SYNC CHECK \|/, "Fast Sync dokončen"],
      ["V2", /REMOTE DELTA APPLIED/, "Staženy změněné poznámky"],
      ["V2", /RECONCILE PLAN/, "Naplánováno opravné porovnání"],
      ["V2", /RECONCILE COMPLETE/, "Opravné porovnání dokončeno"],
      ["FAST", /TAG START CACHE (HIT|MISS)/, "Štítky připraveny"],
      ["EVENT", /UI READY \/ splash-ready/, "Obsah připraven (UI READY)"],
      ["EVENT", /695O SPLASH HIDE START/, "Splash se skrývá"],
      ["EVENT", /695O SPLASH REMOVED/, "Splash zmizel"]
    ];
    const videne = new Set();
    for (const [typ, regex, nazev] of pravidla) {
      const matches = body.filter(r => r.typ === typ && regex.test(r.zprava));
      for (const row of matches) {
        // Start/END pokud se opakují, zobrazíme každé opakování.
        const id = `${row.t}|${typ}|${row.zprava}`;
        if (videne.has(id)) continue;
        videne.add(id);
        klicove.push({...row, nazev});
      }
    }
    return klicove.sort((a,b)=>a.t-b.t);
  }

  function vytvor(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = String(text);
    return el;
  }

  function model() {
    const hotovo = zaznamy.find(z => z.typ === "EVENT" && z.zprava.includes("UI READY / splash-ready"));
    const odstraneno = zaznamy.find(z => z.zprava.includes("695O SPLASH REMOVED"));
    const skryvani = zaznamy.find(z => z.zprava.includes("695O SPLASH HIDE START"));
    const limit = hotovo?.t ?? Number.POSITIVE_INFINITY;
    const pred = zaznamy.filter(z => z.t <= limit);
    return { hotovo, odstraneno, skryvani, pred, klicove:vyberKlicove(zaznamy.filter(z => z.t <= (odstraneno?.t ?? limit))) };
  }

  function vytvorOkno() {
    if (okno) return;
    okno = vytvor("div","lnStartTrace695O");
    okno.id="lnStartupTimeline695O";
    okno.hidden = true;
    okno.innerHTML =
      '<section class="lnStartTraceBox695O" role="dialog" aria-modal="true" aria-labelledby="lnStartTraceTitle695O">' +
      '<header class="lnStartTraceHead695O"><strong id="lnStartTraceTitle695O">Start aplikace · časový rozbor</strong>' +
      '<button type="button" data-copy> Kopírovat vše </button><button type="button" data-close aria-label="Zavřít">✕</button></header>' +
      '<div class="lnStartTraceScroll695O" data-body></div></section>';
    document.body.appendChild(okno);
    const zavri=()=>{okno.hidden=true;predesleZamereni?.focus?.();};
    okno.querySelector("[data-close]").addEventListener("click",zavri);
    okno.addEventListener("click",e=>{if(e.target===okno)zavri();});
    document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!okno.hidden)zavri();});
    okno.querySelector("[data-copy]").addEventListener("click",async e=>{
      const txt=report();
      let copied=false;
      try{await navigator.clipboard.writeText(txt);copied=true;}catch(_){}
      if(!copied){const t=document.createElement("textarea");t.value=txt;t.style.position="fixed";
        t.style.opacity="0";document.body.appendChild(t);t.select();
        try{copied=document.execCommand("copy");}catch(_){}
        t.remove();
      }
      const btn=e.currentTarget;
      btn.textContent=copied?"Zkopírováno ✓":"Kopírování není dostupné";
      setTimeout(()=>{btn.textContent="Kopírovat vše";},2200);
    });
  }

  function report() {
    const m=model();
    const hotovo=m.hotovo ? format(m.hotovo.t) : "stále čeká";
    const videt=m.odstraneno ? format(m.odstraneno.t) : "nezaznamenáno";
    return [
      "LUBANOTE 695O – ÚPLNÝ ČASOVÝ ROZBOR STARTU",
      `Obsah připraven (UI READY): ${hotovo}`,
      `Splash odstraněn: ${videt}`,
      "",
      "DŮLEŽITÉ MÍLNÍKY",
      ...m.klicove.map((z,i)=>`${format(z.t)} | ${z.nazev} | od předchozího ${i?format(z.t-m.klicove[i-1].t):"—"} | ${popis(z)}`),
      "",
      "VŠECHNY DIAGNOSTICKÉ UDÁLOSTI DO UI READY",
      ...m.pred.map(z=>`${z.raw}\n  Co to znamená: ${popis(z)}`),
      "",
      "Úseky mohou běžet souběžně. Čas mezi milníky není vždy dobou práce jediného kroku."
    ].join("\n");
  }

  function vykresli() {
    if (!okno || okno.hidden) return;
    const out=okno.querySelector("[data-body]");
    const m=model();
    const y=out.scrollTop;
    const fragment=document.createDocumentFragment();

    const cards=vytvor("div","lnStartTraceCards695O");
    for(const [label,value] of [
      ["Obsah připraven (UI READY)",m.hotovo?format(m.hotovo.t):"čeká…"],
      ["Splash skutečně zmizel",m.odstraneno?format(m.odstraneno.t):m.skryvani?"probíhá…":"čeká…"]
    ]) {
      const box=vytvor("div","lnStartTraceCard695O");
      box.append(vytvor("b","",value),vytvor("span","",label));
      cards.appendChild(box);
    }
    fragment.append(cards,vytvor("p","","Časy jsou od startu diagnostiky (0 ms). Milníky se mohou překrývat se síťovými požadavky. UI READY znamená připravená data; skutečné zmizení splash měříme zvlášť."));
    fragment.appendChild(vytvor("h3","","Hlavní kroky startu"));
    const list=vytvor("div","lnStartTraceList695O");
    m.klicove.forEach((z,i)=>{
      const item=vytvor("div","lnStartTraceStep695O");
      const vlevo=vytvor("div","lnStartTraceTime695O",format(z.t));
      const vpravo=vytvor("div");
      vpravo.append(
        vytvor("strong","",z.nazev),
        vytvor("small","",i?`Od předchozího bodu: ${format(z.t-m.klicove[i-1].t)}`:"Začátek měření"),
        vytvor("p","",popis(z))
      );
      if(z.typ==="END" && z.zprava.includes("FAST SYNC CHECK")){
        const match=/\|\s*(\d+)\s*ms/.exec(z.zprava);
        if(match)vpravo.appendChild(vytvor("small","","Skutečně naměřená délka Fast Sync: "+format(Number(match[1]))));
      }
      item.append(vlevo,vpravo);list.appendChild(item);
    });
    if(!m.klicove.length)list.append(vytvor("p","","Záznam startu zatím není k dispozici."));
    fragment.appendChild(list);

    const mezery=[];
    for(let i=1;i<m.klicove.length;i++){
      const pred=m.klicove[i-1],po=m.klicove[i];
      if(po.t-pred.t>=600 && (!m.hotovo || pred.t<m.hotovo.t)){
        mezery.push({a:pred,b:po,ms:po.t-pred.t});
      }
    }
    if(mezery.length){
      fragment.appendChild(vytvor("h3","","Nejdelší mezery mezi měřenými milníky"));
      for(const gap of mezery.sort((a,b)=>b.ms-a.ms).slice(0,5)){
        fragment.appendChild(vytvor("p","lnStartTraceWarn695O",`${format(gap.ms)}: ${gap.a.nazev} → ${gap.b.nazev}. V této době mohou běžet i další souběžné kroky; není to automaticky čas vykonávání jedné funkce.`));
      }
    }
    const count=m.pred.length;
    fragment.appendChild(vytvor("h3","",`Úplný rozpis do UI READY (${count} událostí)`));
    fragment.appendChild(vytvor("p","","Každá událost obsahuje přesný okamžik, původní diagnostický řádek a vysvětlení. Rozpis nic znovu nesynchronizuje."));
    const actions=vytvor("div","lnStartTraceExtra695O");
    const toggle=vytvor("button","",rozbaleno?"Sbalit všechny události":"Zobrazit všechny události");
    toggle.type="button";
    toggle.addEventListener("click",()=>{rozbaleno=!rozbaleno;vykresli();});
    actions.appendChild(toggle);
    fragment.appendChild(actions);
    const detail=vytvor("div","lnStartTraceEvents695O");
    detail.dataset.expanded=String(rozbaleno);
    if(rozbaleno){
      for(const z of m.pred) {
        const item=vytvor("div","lnStartTraceEvent695O");
        item.append(vytvor("code","",z.raw),vytvor("span","",popis(z)));
        detail.appendChild(item);
      }
    }
    fragment.appendChild(detail);
    fragment.append(vytvor("p","lnStartTraceNote695O","Pasivní diagnostika. Nezobrazuje obsah poznámek, hesla ani šifrovací klíče. Nemění pořadí síťových operací."));
    out.replaceChildren(fragment);
    out.scrollTop=y;
  }

  function otevri() {
    vytvorOkno();
    predesleZamereni=document.activeElement;
    okno.hidden=false;
    vykresli();
    okno.querySelector("[data-close]")?.focus?.();
  }
  for(const el of [stavovyText,popisek]){
    if(!el)continue;
    el.classList.add("lnStartTraceTrigger695O");
    el.setAttribute("role","button");
    el.setAttribute("tabindex","0");
    el.setAttribute("aria-label","Zobrazit časový rozbor startu LubaNote");
    el.setAttribute("aria-hidden","false");
    el.addEventListener("click",otevri);
    el.addEventListener("keydown",e=>{
      if(e.key==="Enter"||e.key===" "){e.preventDefault();otevri();}
    });
  }
  window.LubaNoteStartTimeline695O = Object.freeze({
    otevri, model, report, parse: rozparsuj
  });
})();
