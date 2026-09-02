/*
 * LubaNote – viditelný stav synchronizace
 *
 * Modul pouze zobrazuje stav. Neprovádí žádnou synchronizaci.
 * Stav dostává přes událost "lubanote:sync-state".
 */
(() => {
  const statusText =
    document.getElementById("syncStatusText");

  if (!statusText) {
    return;
  }

  const STAVY = {
    synced: {
      klic: "sync.synced",
      fallback: "✓ Synchronizováno"
    },
    syncing: {
      klic: "sync.syncing",
      fallback: "⟳ Synchronizuji…"
    },
    "auth-expired": {
      klic: "sync.authExpired",
      fallback: "⚠ Přihlášení vypršelo"
    },
    conflict: {
      klic: "sync.conflict",
      fallback: "⚠ Konflikt"
    }
  };

  let aktualniStav = null;
  let posledniStabilniStav = null;

  function preloz(klic, fallback) {
    return (
      window.LubaNoteI18n?.t?.(klic, fallback) ||
      fallback
    );
  }

  function vykresli() {
    const definice = STAVY[aktualniStav];

    if (!definice) {
      statusText.hidden = true;
      statusText.removeAttribute("data-state");
      statusText.textContent = "";
      statusText.removeAttribute("title");
      return;
    }

    const text = preloz(
      definice.klic,
      definice.fallback
    );

    statusText.hidden = false;
    statusText.dataset.state = aktualniStav;
    statusText.textContent = text;
    statusText.title = text;
  }

  function nastavStav(stav) {
    if (stav === "restore") {
      aktualniStav = posledniStabilniStav;
      vykresli();
      return;
    }

    if (!(stav in STAVY)) {
      return;
    }

    if (
      stav === "syncing" &&
      aktualniStav !== "syncing"
    ) {
      posledniStabilniStav = aktualniStav;
    }

    if (
      stav === "synced" ||
      stav === "auth-expired" ||
      stav === "conflict"
    ) {
      posledniStabilniStav = stav;
    }

    aktualniStav = stav;
    vykresli();
  }

  window.addEventListener(
    "lubanote:sync-state",
    (event) => {
      nastavStav(event.detail?.stav);
    }
  );

  /*
   * Supabase tuto událost vyšle pouze tehdy, když online kontrola
   * skutečně potvrdila chybějící session.
   */
  window.addEventListener(
    "lubanote:auth-expired",
    () => {
      nastavStav("auth-expired");
    }
  );

  window.addEventListener(
    "lubanote:language-change",
    () => {
      vykresli();
    }
  );

  window.LubaNoteSyncStatus = {
    nastav: nastavStav,
    ziskejStav: () => aktualniStav
  };
})();
