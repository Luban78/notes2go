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

    if (syncId) {
      const body =
        init?.body !== undefined
          ? init.body
          : input instanceof Request
            ? null
            : null;

      pridejTx(odhadVelikostiTela(body), syncId);
    }

    const response = await puvodniFetch(input, init);

    if (syncId) {
      try {
        const contentLengthHeader =
          response.headers.get("content-length");
        const contentLength =
          contentLengthHeader !== null &&
          contentLengthHeader !== ""
            ? Number(contentLengthHeader)
            : Number.NaN;

        if (Number.isFinite(contentLength) && contentLength >= 0) {
          pridejRx(contentLength, syncId);
        } else {
          response
            .clone()
            .arrayBuffer()
            .then((buffer) => {
              pridejRx(buffer.byteLength, syncId);
            })
            .catch(() => {});
        }
      } catch {
        // Měření nesmí nikdy ovlivnit vlastní Supabase request.
      }
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
    () => vykresli()
  );

  window.LubaNoteSyncTraffic = {
    fetch: mereneFetch,
    zacniSync,
    dokonciSync,
    nastavEgressZbyvaBajtu,
    nastavEgressZbyvaGB,
    stav: () => ({
      aktivni: hloubkaSyncu > 0,
      rx: hloubkaSyncu > 0 ? aktualniRx : posledniRx,
      tx: hloubkaSyncu > 0 ? aktualniTx : posledniTx,
      egressZbyvaBajtu
    })
  };

  vykresli();
})();
