/* ==================================================
   LubaNote – živé ladění vzhledu hlavní plochy Poznámek
   PATCH 658L

   Admin-only Visual Lab. Hodnoty jsou lokální pro zařízení.
   Nemění data, sync ani cloud. Po finálním odsouhlasení lze vybrané
   hodnoty převést na pevný finální vzhled a panel zjednodušit.
================================================== */
(() => {
  const KLIC_V3 = "lubanoteNotesVisualTuningV3";
  const KLIC_V2 = "lubanoteNotesVisualTuningV2";

  const PRVKY = [
    "cards",
    "tags",
    "primary",
    "search",
    "actions",
    "traffic",
    "modules",
    "fab"
  ];

  const POVOLENE_REZIMY = new Set(["dark", "light", "legacy"]);

  const VYCHOZI = {
    vybranyPrvek: "cards",
    prvky: {
      cards: {
        borderZapnuty: true,
        borderSirka: 2,
        borderRezim: "dark",
        borderSila: 18,
        radius: 22,
        velikost: 18
      },
      tags: {
        borderZapnuty: true,
        borderSirka: 2,
        borderRezim: "dark",
        borderSila: 18,
        radius: 15,
        velikost: 42
      },
      primary: {
        borderZapnuty: true,
        borderSirka: 1,
        borderRezim: "legacy",
        borderSila: 18,
        radius: 15,
        velikost: 42,
        ikonaVelikost: 27,
        klasickaIkonaVelikost: 20,
        ikonaTloustka: 1.25
      },
      search: {
        borderZapnuty: true,
        borderSirka: 1,
        borderRezim: "legacy",
        borderSila: 18,
        radius: 14,
        velikost: 42
      },
      actions: {
        borderZapnuty: true,
        borderSirka: 1,
        borderRezim: "legacy",
        borderSila: 18,
        radius: 14,
        velikost: 42
      },
      traffic: {
        borderZapnuty: true,
        borderSirka: 1,
        borderRezim: "legacy",
        borderSila: 18,
        radius: 12,
        velikost: 46
      },
      modules: {
        borderZapnuty: true,
        borderSirka: 1,
        borderRezim: "legacy",
        borderSila: 18,
        radius: 12,
        velikost: 52
      },
      fab: {
        borderZapnuty: true,
        borderSirka: 1,
        borderRezim: "legacy",
        borderSila: 18,
        radius: 35,
        velikost: 70
      }
    },
    layout: {
      offsetY: 13,
      akceFiltryMezera: 5,
      filtrMezera: 5,
      stitkyMezera: 5,
      radkyMezera: 5,
      stitkyKartyMezera: 5,
      kartySloupceMezera: 5,
      kartyRadkyMezera: 5
    }
  };

  const LIMITY = {
    borderSirka: [0.5, 8],
    borderSila: [0, 70],
    radius: [0, 44],
    cardsVelikost: [10, 26],
    tagsVelikost: [30, 56],
    primaryVelikost: [30, 56],
    primaryIkonaVelikost: [14, 32],
    primaryKlasickaIkonaVelikost: [14, 28],
    primaryIkonaTloustka: [0.8, 2.2],
    searchVelikost: [34, 58],
    actionsVelikost: [34, 58],
    trafficVelikost: [40, 64],
    modulesVelikost: [42, 68],
    fabVelikost: [48, 88],
    offsetY: [-16, 16],
    akceFiltryMezera: [0, 20],
    filtrMezera: [2, 14],
    stitkyMezera: [2, 16],
    radkyMezera: [0, 20],
    stitkyKartyMezera: [0, 40],
    kartySloupceMezera: [0, 30],
    kartyRadkyMezera: [2, 24]
  };

  function kopie(objekt) {
    return JSON.parse(JSON.stringify(objekt));
  }

  function omezCislo(hodnota, min, max, fallback) {
    const cislo = Number(hodnota);
    if (!Number.isFinite(cislo)) return fallback;
    return Math.min(max, Math.max(min, cislo));
  }

  function nactiJson() {
    try {
      const rawV3 = localStorage.getItem(KLIC_V3);
      if (rawV3) {
        const data = JSON.parse(rawV3);
        if (data && typeof data === "object") return data;
      }

      /* 658C: automatická migrace hodnot z Visual Lab 658B. */
      const rawV2 = localStorage.getItem(KLIC_V2);
      if (!rawV2) return null;
      const data = JSON.parse(rawV2);
      return data && typeof data === "object" ? data : null;
    } catch (_error) {
      return null;
    }
  }

  function nactiLegacy658A(stav) {
    /* Jednorázová kompatibilita: pokud uživatel v 658A něco ladil,
       převezmeme hodnoty do karet i štítků. */
    try {
      const maNove =
        localStorage.getItem(KLIC_V3) !== null ||
        localStorage.getItem(KLIC_V2) !== null;
      if (maNove) return;

      const enabled = localStorage.getItem("lubanoteNotesBorderEnabledV1");
      const width = localStorage.getItem("lubanoteNotesBorderWidthV1");
      const mode = localStorage.getItem("lubanoteNotesBorderModeV1");
      const strength = localStorage.getItem("lubanoteNotesBorderStrengthV1");
      const controls = localStorage.getItem("lubanoteNotesControlsBorderV1");

      if ([enabled, width, mode, strength, controls].every((x) => x === null)) {
        return;
      }

      for (const id of ["cards", "tags"]) {
        if (enabled !== null) stav.prvky[id].borderZapnuty = enabled !== "0";
        if (width !== null) {
          stav.prvky[id].borderSirka = omezCislo(
            width,
            ...LIMITY.borderSirka,
            stav.prvky[id].borderSirka
          );
        }
        if (mode && POVOLENE_REZIMY.has(mode)) stav.prvky[id].borderRezim = mode;
        if (strength !== null) {
          stav.prvky[id].borderSila = omezCislo(
            strength,
            ...LIMITY.borderSila,
            stav.prvky[id].borderSila
          );
        }
      }

      if (controls !== null) {
        const zapnuto = controls !== "0";
        stav.prvky.search.borderZapnuty = zapnuto;
        stav.prvky.actions.borderZapnuty = zapnuto;
      }
    } catch (_error) {}
  }

  function normalizujPrvek(id, vstup, fallback) {
    const v = vstup && typeof vstup === "object" ? vstup : {};
    const limitVelikosti = LIMITY[`${id}Velikost`] || [20, 100];
    const vysledek = {
      borderZapnuty:
        typeof v.borderZapnuty === "boolean"
          ? v.borderZapnuty
          : fallback.borderZapnuty,
      borderSirka: omezCislo(
        v.borderSirka,
        ...LIMITY.borderSirka,
        fallback.borderSirka
      ),
      borderRezim: POVOLENE_REZIMY.has(v.borderRezim)
        ? v.borderRezim
        : fallback.borderRezim,
      borderSila: omezCislo(
        v.borderSila,
        ...LIMITY.borderSila,
        fallback.borderSila
      ),
      radius: omezCislo(
        v.radius,
        ...LIMITY.radius,
        fallback.radius
      ),
      velikost: omezCislo(
        v.velikost,
        ...limitVelikosti,
        fallback.velikost
      )
    };

    if (id === "primary") {
      vysledek.ikonaVelikost = omezCislo(
        v.ikonaVelikost,
        ...LIMITY.primaryIkonaVelikost,
        fallback.ikonaVelikost
      );
      vysledek.klasickaIkonaVelikost = omezCislo(
        v.klasickaIkonaVelikost,
        ...LIMITY.primaryKlasickaIkonaVelikost,
        fallback.klasickaIkonaVelikost
      );
      vysledek.ikonaTloustka = omezCislo(
        v.ikonaTloustka,
        ...LIMITY.primaryIkonaTloustka,
        fallback.ikonaTloustka
      );
    }

    return vysledek;
  }

  function vytvorStav() {
    const stav = kopie(VYCHOZI);
    nactiLegacy658A(stav);

    const ulozeny = nactiJson();
    if (!ulozeny) return stav;

    if (PRVKY.includes(ulozeny.vybranyPrvek)) {
      stav.vybranyPrvek = ulozeny.vybranyPrvek;
    }

    for (const id of PRVKY) {
      stav.prvky[id] = normalizujPrvek(
        id,
        ulozeny.prvky?.[id],
        VYCHOZI.prvky[id]
      );
    }

    const l = ulozeny.layout || {};
    stav.layout.offsetY = omezCislo(
      l.offsetY,
      ...LIMITY.offsetY,
      VYCHOZI.layout.offsetY
    );
    stav.layout.akceFiltryMezera = omezCislo(
      l.akceFiltryMezera,
      ...LIMITY.akceFiltryMezera,
      VYCHOZI.layout.akceFiltryMezera
    );
    stav.layout.filtrMezera = omezCislo(
      l.filtrMezera,
      ...LIMITY.filtrMezera,
      VYCHOZI.layout.filtrMezera
    );
    stav.layout.stitkyMezera = omezCislo(
      l.stitkyMezera,
      ...LIMITY.stitkyMezera,
      VYCHOZI.layout.stitkyMezera
    );
    stav.layout.radkyMezera = omezCislo(
      l.radkyMezera,
      ...LIMITY.radkyMezera,
      VYCHOZI.layout.radkyMezera
    );
    stav.layout.stitkyKartyMezera = omezCislo(
      l.stitkyKartyMezera,
      ...LIMITY.stitkyKartyMezera,
      VYCHOZI.layout.stitkyKartyMezera
    );
    stav.layout.kartySloupceMezera = omezCislo(
      l.kartySloupceMezera,
      ...LIMITY.kartySloupceMezera,
      VYCHOZI.layout.kartySloupceMezera
    );
    stav.layout.kartyRadkyMezera = omezCislo(
      l.kartyRadkyMezera,
      ...LIMITY.kartyRadkyMezera,
      VYCHOZI.layout.kartyRadkyMezera
    );

    /* 658C: hledání a akční ikony jsou jeden vizuální řádek.
       Při migraci starších hodnot sjednotíme jejich výšku na větší z nich. */
    const horniVyska = Math.max(
      stav.prvky.search.velikost,
      stav.prvky.actions.velikost
    );
    stav.prvky.search.velikost = horniVyska;
    stav.prvky.actions.velikost = horniVyska;

    return stav;
  }

  const stav = vytvorStav();

  function uloz() {
    try {
      localStorage.setItem(KLIC_V3, JSON.stringify(stav));
    } catch (_error) {}
  }

  function nastavCssPrvek(root, body, id, data) {
    const prefix = `--luba-notes-${id}`;
    const sila = Math.round(data.borderSila * 10) / 10;
    const zaklad = Math.max(0, 100 - sila);

    root.style.setProperty(`${prefix}-border-width`, `${data.borderSirka}px`);
    root.style.setProperty(`${prefix}-border-strength`, `${sila}%`);
    root.style.setProperty(`${prefix}-border-base`, `${zaklad}%`);
    root.style.setProperty(`${prefix}-radius`, `${data.radius}px`);
    root.style.setProperty(`${prefix}-size`, `${data.velikost}px`);

    body.dataset[`lubaNotes${id[0].toUpperCase()}${id.slice(1)}BorderMode`] =
      data.borderRezim;
    body.dataset[`lubaNotes${id[0].toUpperCase()}${id.slice(1)}Border`] =
      data.borderZapnuty ? "on" : "off";
  }

  function aplikujPrimarySvgFiltry() {
    const data = stav.prvky.primary;
    const svgVelikost = `${data.ikonaVelikost}px`;
    const klasickaVelikost = `${data.klasickaIkonaVelikost}px`;
    const tloustka = `${data.ikonaTloustka}px`;

    document
      .querySelectorAll(".categoryTabs > button.categoryTabIconOnly .categoryTabIcon")
      .forEach((hostitel) => {
        const svg = hostitel.querySelector(".lubaSvgIcon");

        if (!svg) {
          hostitel.style.setProperty("font-size", klasickaVelikost, "important");
          hostitel.style.setProperty("width", klasickaVelikost, "important");
          hostitel.style.setProperty("height", klasickaVelikost, "important");
          return;
        }

        hostitel.style.removeProperty("font-size");
        hostitel.style.setProperty("width", svgVelikost, "important");
        hostitel.style.setProperty("height", svgVelikost, "important");
        svg.style.setProperty("width", svgVelikost, "important");
        svg.style.setProperty("height", svgVelikost, "important");
        svg.style.setProperty("stroke-width", tloustka, "important");
      });
  }

  function aplikuj({ oznamit = true } = {}) {
    const root = document.documentElement;
    const body = document.body;
    if (!root || !body) return kopie(stav);

    for (const id of PRVKY) {
      nastavCssPrvek(root, body, id, stav.prvky[id]);
    }

    root.style.setProperty(
      "--luba-notes-primary-icon-size",
      `${stav.prvky.primary.ikonaVelikost}px`
    );
    root.style.setProperty(
      "--luba-notes-primary-classic-icon-size",
      `${stav.prvky.primary.klasickaIkonaVelikost}px`
    );
    root.style.setProperty(
      "--luba-notes-primary-icon-stroke",
      `${stav.prvky.primary.ikonaTloustka}px`
    );

    root.style.setProperty(
      "--luba-notes-layout-offset-y",
      `${stav.layout.offsetY}px`
    );
    root.style.setProperty(
      "--luba-notes-layout-actions-filters-gap",
      `${stav.layout.akceFiltryMezera}px`
    );
    root.style.setProperty(
      "--luba-notes-layout-filter-gap",
      `${stav.layout.filtrMezera}px`
    );
    root.style.setProperty(
      "--luba-notes-layout-tags-gap",
      `${stav.layout.stitkyMezera}px`
    );
    root.style.setProperty(
      "--luba-notes-layout-row-gap",
      `${stav.layout.radkyMezera}px`
    );
    root.style.setProperty(
      "--luba-notes-top-control-size",
      `${Math.max(stav.prvky.search.velikost, stav.prvky.actions.velikost)}px`
    );
    root.style.setProperty(
      "--luba-notes-layout-tags-cards-gap",
      `${stav.layout.stitkyKartyMezera}px`
    );
    root.style.setProperty(
      "--luba-notes-layout-card-column-gap",
      `${stav.layout.kartySloupceMezera}px`
    );
    root.style.setProperty(
      "--luba-notes-layout-card-row-gap",
      `${stav.layout.kartyRadkyMezera}px`
    );

    aplikujPrimarySvgFiltry();

    if (oznamit) {
      window.dispatchEvent(
        new CustomEvent("lubanote:notes-visual-tuning-change", {
          detail: kopie(stav)
        })
      );
    }

    return kopie(stav);
  }

  function nastavVybranyPrvek(id) {
    if (!PRVKY.includes(id)) return kopie(stav);
    stav.vybranyPrvek = id;
    uloz();
    return aplikuj();
  }

  function nastavPrvekHodnotu(id, klic, hodnota) {
    if (!PRVKY.includes(id) || !Object.hasOwn(stav.prvky[id], klic)) {
      return kopie(stav);
    }

    const cil = stav.prvky[id];

    if (klic === "borderZapnuty") {
      cil[klic] = Boolean(hodnota);
    } else if (klic === "borderRezim") {
      cil[klic] = POVOLENE_REZIMY.has(String(hodnota))
        ? String(hodnota)
        : VYCHOZI.prvky[id].borderRezim;
    } else if (klic === "borderSirka") {
      cil[klic] = omezCislo(
        hodnota,
        ...LIMITY.borderSirka,
        VYCHOZI.prvky[id].borderSirka
      );
    } else if (klic === "borderSila") {
      cil[klic] = omezCislo(
        hodnota,
        ...LIMITY.borderSila,
        VYCHOZI.prvky[id].borderSila
      );
    } else if (klic === "radius") {
      cil[klic] = omezCislo(
        hodnota,
        ...LIMITY.radius,
        VYCHOZI.prvky[id].radius
      );
    } else if (klic === "velikost") {
      const lim = LIMITY[`${id}Velikost`] || [20, 100];
      const novaVelikost = omezCislo(
        hodnota,
        ...lim,
        VYCHOZI.prvky[id].velikost
      );
      cil[klic] = novaVelikost;

      /* Hledání a akční tlačítka tvoří jeden řádek. Jejich výška se
         proto ladí společně, aby při zvětšení ikon nevznikl schod. */
      if (id === "search" || id === "actions") {
        stav.prvky.search.velikost = novaVelikost;
        stav.prvky.actions.velikost = novaVelikost;
      }
    } else if (id === "primary" && klic === "ikonaVelikost") {
      cil[klic] = omezCislo(
        hodnota,
        ...LIMITY.primaryIkonaVelikost,
        VYCHOZI.prvky.primary.ikonaVelikost
      );
    } else if (id === "primary" && klic === "klasickaIkonaVelikost") {
      cil[klic] = omezCislo(
        hodnota,
        ...LIMITY.primaryKlasickaIkonaVelikost,
        VYCHOZI.prvky.primary.klasickaIkonaVelikost
      );
    } else if (id === "primary" && klic === "ikonaTloustka") {
      cil[klic] = omezCislo(
        hodnota,
        ...LIMITY.primaryIkonaTloustka,
        VYCHOZI.prvky.primary.ikonaTloustka
      );
    }

    uloz();
    return aplikuj();
  }

  function nastavLayoutHodnotu(klic, hodnota) {
    if (!Object.hasOwn(stav.layout, klic) || !LIMITY[klic]) {
      return kopie(stav);
    }

    stav.layout[klic] = omezCislo(
      hodnota,
      ...LIMITY[klic],
      VYCHOZI.layout[klic]
    );
    uloz();
    return aplikuj();
  }

  function obnovVybranyPrvek() {
    const id = stav.vybranyPrvek;
    stav.prvky[id] = kopie(VYCHOZI.prvky[id]);
    uloz();
    return aplikuj();
  }

  function obnovVychozi() {
    const puvodniVyber = stav.vybranyPrvek;
    const novy = kopie(VYCHOZI);
    novy.vybranyPrvek = PRVKY.includes(puvodniVyber)
      ? puvodniVyber
      : VYCHOZI.vybranyPrvek;

    Object.assign(stav, novy);
    uloz();
    return aplikuj();
  }

  /* Zachování 658A API pro případ, že by ho někde používal starší kód. */
  function nastavBorderZapnuty(hodnota) {
    for (const id of ["cards", "tags"]) {
      stav.prvky[id].borderZapnuty = Boolean(hodnota);
    }
    uloz();
    return aplikuj();
  }

  function nastavBorderSirku(hodnota) {
    for (const id of ["cards", "tags"]) {
      stav.prvky[id].borderSirka = omezCislo(
        hodnota,
        ...LIMITY.borderSirka,
        stav.prvky[id].borderSirka
      );
    }
    uloz();
    return aplikuj();
  }

  function nastavBorderRezim(hodnota) {
    const rezim = POVOLENE_REZIMY.has(String(hodnota))
      ? String(hodnota)
      : "dark";
    for (const id of ["cards", "tags"]) {
      stav.prvky[id].borderRezim = rezim;
    }
    uloz();
    return aplikuj();
  }

  function nastavBorderSilu(hodnota) {
    for (const id of ["cards", "tags"]) {
      stav.prvky[id].borderSila = omezCislo(
        hodnota,
        ...LIMITY.borderSila,
        stav.prvky[id].borderSila
      );
    }
    uloz();
    return aplikuj();
  }

  function nastavOvladaciBorder(hodnota) {
    for (const id of ["search", "actions"]) {
      stav.prvky[id].borderZapnuty = Boolean(hodnota);
    }
    uloz();
    return aplikuj();
  }

  window.addEventListener("lubanote:icon-style-change", () => {
    requestAnimationFrame(() => aplikuj({ oznamit: false }));
  });

  window.LubaNoteNotesVisualTuning = {
    ziskejStav: () => kopie(stav),
    ziskejVychozi: () => kopie(VYCHOZI),
    ziskejLimity: () => kopie(LIMITY),
    ziskejPrvky: () => [...PRVKY],
    nastavVybranyPrvek,
    nastavPrvekHodnotu,
    nastavLayoutHodnotu,
    obnovVybranyPrvek,
    obnovVychozi,
    aplikuj,
    nastavBorderZapnuty,
    nastavBorderSirku,
    nastavBorderRezim,
    nastavBorderSilu,
    nastavOvladaciBorder
  };

  aplikuj({ oznamit: false });
})();
