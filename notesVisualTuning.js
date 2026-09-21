/* ==================================================
   LubaNote – živé ladění vzhledu hlavní plochy Poznámek
   PATCH 658A

   Interní/admin tuning. Hodnoty jsou lokální pro zařízení a nemění
   obsah poznámek ani synchronizaci. Po finálním odsouhlasení se mohou
   použít jako pevné výchozí hodnoty.
================================================== */
(() => {
  const KLIC = {
    borderZapnuty: "lubanoteNotesBorderEnabledV1",
    borderSirka: "lubanoteNotesBorderWidthV1",
    borderRezim: "lubanoteNotesBorderModeV1",
    borderSila: "lubanoteNotesBorderStrengthV1",
    ovladaciBorder: "lubanoteNotesControlsBorderV1"
  };

  const VYCHOZI = {
    borderZapnuty: true,
    borderSirka: 2,
    borderRezim: "dark",
    borderSila: 18,
    ovladaciBorder: true
  };

  const POVOLENE_REZIMY = new Set([
    "dark",
    "light",
    "legacy"
  ]);

  function omezCislo(hodnota, min, max, fallback) {
    const cislo = Number(hodnota);
    if (!Number.isFinite(cislo)) return fallback;
    return Math.min(max, Math.max(min, cislo));
  }

  function nactiBoolean(klic, fallback) {
    try {
      const hodnota = localStorage.getItem(klic);
      if (hodnota === null) return fallback;
      return hodnota !== "0";
    } catch (_error) {
      return fallback;
    }
  }

  function nactiText(klic, fallback) {
    try {
      return localStorage.getItem(klic) ?? fallback;
    } catch (_error) {
      return fallback;
    }
  }

  const stav = {
    borderZapnuty: nactiBoolean(
      KLIC.borderZapnuty,
      VYCHOZI.borderZapnuty
    ),
    borderSirka: omezCislo(
      nactiText(KLIC.borderSirka, VYCHOZI.borderSirka),
      0.5,
      6,
      VYCHOZI.borderSirka
    ),
    borderRezim: nactiText(
      KLIC.borderRezim,
      VYCHOZI.borderRezim
    ),
    borderSila: omezCislo(
      nactiText(KLIC.borderSila, VYCHOZI.borderSila),
      0,
      60,
      VYCHOZI.borderSila
    ),
    ovladaciBorder: nactiBoolean(
      KLIC.ovladaciBorder,
      VYCHOZI.ovladaciBorder
    )
  };

  if (!POVOLENE_REZIMY.has(stav.borderRezim)) {
    stav.borderRezim = VYCHOZI.borderRezim;
  }

  function uloz(klic, hodnota) {
    try {
      localStorage.setItem(klic, String(hodnota));
    } catch (_error) {}
  }

  function kopieStavu() {
    return { ...stav };
  }

  function aplikuj({ oznamit = true } = {}) {
    const root = document.documentElement;
    const body = document.body;
    const sila = Math.round(stav.borderSila * 10) / 10;
    const zaklad = Math.max(0, 100 - sila);

    root.style.setProperty(
      "--luba-notes-border-width",
      `${stav.borderSirka}px`
    );
    root.style.setProperty(
      "--luba-notes-border-strength",
      `${sila}%`
    );
    root.style.setProperty(
      "--luba-notes-border-base",
      `${zaklad}%`
    );

    if (body) {
      body.dataset.lubaNotesBorderMode = stav.borderRezim;
      body.classList.toggle(
        "lubaNotesBordersOff",
        !stav.borderZapnuty
      );
      body.classList.toggle(
        "lubaNotesControlBordersOff",
        !stav.ovladaciBorder
      );
    }

    if (oznamit) {
      window.dispatchEvent(
        new CustomEvent("lubanote:notes-visual-tuning-change", {
          detail: kopieStavu()
        })
      );
    }

    return kopieStavu();
  }

  function nastavBorderZapnuty(hodnota) {
    stav.borderZapnuty = Boolean(hodnota);
    uloz(KLIC.borderZapnuty, stav.borderZapnuty ? "1" : "0");
    return aplikuj();
  }

  function nastavBorderSirku(hodnota) {
    stav.borderSirka = omezCislo(
      hodnota,
      0.5,
      6,
      VYCHOZI.borderSirka
    );
    uloz(KLIC.borderSirka, stav.borderSirka);
    return aplikuj();
  }

  function nastavBorderRezim(hodnota) {
    const rezim = String(hodnota || "");
    stav.borderRezim = POVOLENE_REZIMY.has(rezim)
      ? rezim
      : VYCHOZI.borderRezim;
    uloz(KLIC.borderRezim, stav.borderRezim);
    return aplikuj();
  }

  function nastavBorderSilu(hodnota) {
    stav.borderSila = omezCislo(
      hodnota,
      0,
      60,
      VYCHOZI.borderSila
    );
    uloz(KLIC.borderSila, stav.borderSila);
    return aplikuj();
  }

  function nastavOvladaciBorder(hodnota) {
    stav.ovladaciBorder = Boolean(hodnota);
    uloz(KLIC.ovladaciBorder, stav.ovladaciBorder ? "1" : "0");
    return aplikuj();
  }

  function obnovVychozi() {
    Object.assign(stav, VYCHOZI);
    uloz(KLIC.borderZapnuty, "1");
    uloz(KLIC.borderSirka, VYCHOZI.borderSirka);
    uloz(KLIC.borderRezim, VYCHOZI.borderRezim);
    uloz(KLIC.borderSila, VYCHOZI.borderSila);
    uloz(KLIC.ovladaciBorder, "1");
    return aplikuj();
  }

  window.LubaNoteNotesVisualTuning = {
    ziskejStav: kopieStavu,
    nastavBorderZapnuty,
    nastavBorderSirku,
    nastavBorderRezim,
    nastavBorderSilu,
    nastavOvladaciBorder,
    obnovVychozi,
    aplikuj
  };

  aplikuj({ oznamit: false });
})();
