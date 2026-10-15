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
    pending: {
      klic: "sync.pending",
      fallback: "⏳ Čeká na synchronizaci"
    },
    local: {
      klic: "sync.localOnly",
      fallback: "📱 Pouze v zařízení"
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

  /* PATCH 554 – od prvního vykreslení ukazujeme čekající stav.
     Dříve mohl PC řádek zůstat úplně prázdný, dokud sync neposlal
     první událost. */
  let aktualniStav = "pending";
  let posledniStabilniStav = "pending";

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

  /* 683BX – běžný uživatel RX/TX panel nevidí. Závažnější čekání
     na síť proto ukážeme samostatně, bez modalu a bez zásahu do editoru. */
  const upozorneni = document.createElement("div");
  upozorneni.className = "lnSyncRecoveryNotice683BX";
  upozorneni.hidden = true;
  upozorneni.setAttribute("role", "status");
  document.body.appendChild(upozorneni);
  let casovacUpozorneni = null;
  let sitoveZotaveniCeka = false;

  function skryjUpozorneni() {
    clearTimeout(casovacUpozorneni);
    casovacUpozorneni = null;
    upozorneni.hidden = true;
  }

  function vykresliUpozorneni() {
    if (!upozorneni.hidden) {
      upozorneni.textContent = preloz(
        "sync.pending", "⏳ Čeká na synchronizaci"
      );
    }
  }

  function naplanujUpozorneni(rychle = false) {
    if (aktualniStav !== "pending" || casovacUpozorneni ||
        !upozorneni.hidden) return;
    casovacUpozorneni = setTimeout(() => {
      casovacUpozorneni = null;
      if (aktualniStav !== "pending" ||
          window.LubaNoteStorageScope?.ziskejAktivni?.() === "local") return;
      upozorneni.hidden = false;
      vykresliUpozorneni();
    }, rychle ? 7000 : 25000);
  }

  window.addEventListener("lubanote:network-recovery-state", (event) => {
    sitoveZotaveniCeka = event?.detail?.stav === "pending";
    if (sitoveZotaveniCeka) {
      clearTimeout(casovacUpozorneni);
      casovacUpozorneni = null;
      naplanujUpozorneni(true);
    } else {
      skryjUpozorneni();
    }
  });

  function nastavStav(stav) {
    const localAktivni =
      window.LubaNoteStorageScope
        ?.ziskejAktivni?.() === "local";

    /* PATCH 586 – doběh staršího cloud requestu nesmí po přepnutí
       přepsat LOCAL stav na „Synchronizováno“. Auth-expired zůstává
       nadřazený, protože účet je povinný i v režimu pouze zařízení. */
    if (
      localAktivni &&
      stav !== "auth-expired" &&
      stav !== "local"
    ) {
      aktualniStav = "local";
      vykresli();
      return;
    }

    if (stav === "restore") {
      aktualniStav = posledniStabilniStav;
      vykresli();
      if (aktualniStav !== "pending") skryjUpozorneni();
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
    if (stav === "pending") {
      naplanujUpozorneni(sitoveZotaveniCeka);
    } else {
      skryjUpozorneni();
    }
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
      vykresliUpozorneni();
    }
  );

  window.addEventListener(
    "lubanote:storage-scope-change",
    (event) => {
      if (event.detail?.scope === "local") {
        nastavStav("local");
      } else {
        nastavStav("pending");
      }
    }
  );

  /* První stav musí odpovídat i uloženému LOCAL prostoru. */
  if (
    window.LubaNoteStorageScope
      ?.ziskejAktivni?.() === "local"
  ) {
    aktualniStav = "local";
    posledniStabilniStav = "local";
  }

  vykresli();

  window.LubaNoteSyncStatus = {
    nastav: nastavStav,
    ziskejStav: () => aktualniStav
  };
})();
