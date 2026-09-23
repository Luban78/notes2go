/* ==================================================
   LubaNote – živé ladění vzhledu Dokumentů
   PATCH 658T
================================================== */
(() => {
  "use strict";

  const KLIC = "lubanoteDocumentsVisualTuningV1";
  const PRVKY = [
    "sectionBlocks",
    "folderCards",
    "searchBox",
    "fileFilters",
    "fileRows"
  ];

  const VYCHOZI = {
    vybranyPrvek: "fileRows",
    prvky: {
      sectionBlocks: { velikost: 12, radius: 20, mezera: 10 },
      folderCards: { velikost: 64, radius: 15, mezera: 6 },
      searchBox: { velikost: 40, radius: 13, mezera: 7 },
      fileFilters: { velikost: 32, radius: 999, mezera: 6 },
      fileRows: { velikost: 8, radius: 15, mezera: 8 }
    }
  };

  const LIMITY = {
    sectionBlocks: { velikost: [6, 22], radius: [0, 28], mezera: [0, 24] },
    folderCards: { velikost: [48, 96], radius: [0, 28], mezera: [0, 18] },
    searchBox: { velikost: [34, 58], radius: [0, 24], mezera: [0, 18] },
    fileFilters: { velikost: [26, 48], radius: [0, 999], mezera: [0, 18] },
    fileRows: { velikost: [2, 18], radius: [0, 26], mezera: [0, 18] }
  };

  function kopie(o) { return JSON.parse(JSON.stringify(o)); }
  function omezCislo(h, min, max, fallback) {
    const n = Number(h);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function nacti() {
    try {
      const raw = localStorage.getItem(KLIC);
      if (!raw) return kopie(VYCHOZI);
      const ulozeny = JSON.parse(raw);
      const stav = kopie(VYCHOZI);
      if (PRVKY.includes(ulozeny?.vybranyPrvek)) stav.vybranyPrvek = ulozeny.vybranyPrvek;
      for (const id of PRVKY) {
        const vstup = ulozeny?.prvky?.[id] || {};
        const limit = LIMITY[id];
        stav.prvky[id] = {
          velikost: omezCislo(vstup.velikost, ...limit.velikost, VYCHOZI.prvky[id].velikost),
          radius: omezCislo(vstup.radius, ...limit.radius, VYCHOZI.prvky[id].radius),
          mezera: omezCislo(vstup.mezera, ...limit.mezera, VYCHOZI.prvky[id].mezera)
        };
      }
      return stav;
    } catch (_error) {
      return kopie(VYCHOZI);
    }
  }

  let stav = nacti();
  function uloz() { try { localStorage.setItem(KLIC, JSON.stringify(stav)); } catch (_error) {} }
  function px(n) { return `${Number(n)}px`; }

  function aplikuj() {
    const root = document.documentElement;
    if (!root) return;
    root.style.setProperty("--ln-dv-section-pad", px(stav.prvky.sectionBlocks.velikost));
    root.style.setProperty("--ln-dv-section-radius", px(stav.prvky.sectionBlocks.radius));
    root.style.setProperty("--ln-dv-section-gap", px(stav.prvky.sectionBlocks.mezera));

    root.style.setProperty("--ln-dv-folder-height", px(stav.prvky.folderCards.velikost));
    root.style.setProperty("--ln-dv-folder-radius", px(stav.prvky.folderCards.radius));
    root.style.setProperty("--ln-dv-folder-gap", px(stav.prvky.folderCards.mezera));

    root.style.setProperty("--ln-dv-search-height", px(stav.prvky.searchBox.velikost));
    root.style.setProperty("--ln-dv-search-radius", px(stav.prvky.searchBox.radius));
    root.style.setProperty("--ln-dv-search-gap", px(stav.prvky.searchBox.mezera));

    root.style.setProperty("--ln-dv-filter-height", px(stav.prvky.fileFilters.velikost));
    root.style.setProperty("--ln-dv-filter-radius", px(stav.prvky.fileFilters.radius));
    root.style.setProperty("--ln-dv-filter-gap", px(stav.prvky.fileFilters.mezera));

    root.style.setProperty("--ln-dv-file-pad-y", px(stav.prvky.fileRows.velikost));
    root.style.setProperty("--ln-dv-file-radius", px(stav.prvky.fileRows.radius));
    root.style.setProperty("--ln-dv-file-gap", px(stav.prvky.fileRows.mezera));
  }

  function oznam() {
    uloz();
    aplikuj();
    window.dispatchEvent(new CustomEvent("lubanote:documents-visual-tuning-change", { detail: kopie(stav) }));
  }

  function nastavVybranyPrvek(id) {
    if (!PRVKY.includes(id)) return false;
    stav.vybranyPrvek = id;
    oznam();
    return true;
  }

  function nastavPrvekHodnotu(id, klic, hodnota) {
    if (!PRVKY.includes(id) || !["velikost","radius","mezera"].includes(klic)) return false;
    const limit = LIMITY[id]?.[klic];
    if (!limit) return false;
    stav.prvky[id][klic] = omezCislo(hodnota, ...limit, stav.prvky[id][klic]);
    oznam();
    return true;
  }

  function obnovVybranyPrvek() {
    const id = stav.vybranyPrvek;
    if (!PRVKY.includes(id)) return false;
    stav.prvky[id] = kopie(VYCHOZI.prvky[id]);
    oznam();
    return true;
  }

  function obnovVychozi() {
    stav = kopie(VYCHOZI);
    oznam();
    return true;
  }

  window.LubaNoteDocumentsVisualTuning = {
    ziskejStav: () => kopie(stav),
    ziskejVychozi: () => kopie(VYCHOZI),
    ziskejLimity: () => kopie(LIMITY),
    nastavVybranyPrvek,
    nastavPrvekHodnotu,
    obnovVybranyPrvek,
    obnovVychozi,
    aplikuj
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", aplikuj, { once: true });
  } else {
    aplikuj();
  }
})();
