/* ==================================================
   LubaNote – PC živé ladění hlavní plochy Poznámek
   PATCH 658Z
================================================== */
(() => {
  "use strict";

  const KLIC = "lubanoteDesktopNotesVisualTuningV1";
  const PRVKY = ["toolbar", "search", "filters", "tags", "cards"];

  const VYCHOZI = {
    vybranyPrvek: "toolbar",
    prvky: {
      toolbar: { velikost: 50, radius: 13, mezera: 8 },
      search: { velikost: 420, radius: 13, mezera: 15 },
      filters: { velikost: 50, radius: 13, mezera: 7 },
      tags: { velikost: 38, radius: 11, mezera: 8 },
      cards: { velikost: 16, radius: 17, mezera: 14 }
    }
  };

  const LIMITY = {
    toolbar: { velikost: [38, 70], radius: [0, 24], mezera: [0, 20] },
    search: { velikost: [220, 700], radius: [0, 24], mezera: [0, 30] },
    filters: { velikost: [38, 72], radius: [0, 24], mezera: [0, 18] },
    tags: { velikost: [28, 58], radius: [0, 24], mezera: [0, 20] },
    cards: { velikost: [8, 30], radius: [0, 30], mezera: [0, 30] }
  };

  function kopie(objekt) {
    return JSON.parse(JSON.stringify(objekt));
  }

  function omezCislo(hodnota, min, max, fallback) {
    const cislo = Number(hodnota);
    if (!Number.isFinite(cislo)) return fallback;
    return Math.min(max, Math.max(min, cislo));
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
        const lim = LIMITY[id];
        stav.prvky[id] = {
          velikost: omezCislo(vstup.velikost, ...lim.velikost, VYCHOZI.prvky[id].velikost),
          radius: omezCislo(vstup.radius, ...lim.radius, VYCHOZI.prvky[id].radius),
          mezera: omezCislo(vstup.mezera, ...lim.mezera, VYCHOZI.prvky[id].mezera)
        };
      }
      return stav;
    } catch (_error) {
      return kopie(VYCHOZI);
    }
  }

  let stav = nacti();

  function uloz() {
    try { localStorage.setItem(KLIC, JSON.stringify(stav)); } catch (_error) {}
  }

  function px(cislo) { return `${Number(cislo)}px`; }

  function aplikuj() {
    const root = document.documentElement;
    if (!root) return kopie(stav);

    root.style.setProperty("--ln-dnv-toolbar-height", px(stav.prvky.toolbar.velikost));
    root.style.setProperty("--ln-dnv-toolbar-radius", px(stav.prvky.toolbar.radius));
    root.style.setProperty("--ln-dnv-toolbar-gap", px(stav.prvky.toolbar.mezera));

    root.style.setProperty("--ln-dnv-search-width", px(stav.prvky.search.velikost));
    root.style.setProperty("--ln-dnv-search-radius", px(stav.prvky.search.radius));
    root.style.setProperty("--ln-dnv-search-pad-x", px(stav.prvky.search.mezera));

    root.style.setProperty("--ln-dnv-filter-width", px(stav.prvky.filters.velikost));
    root.style.setProperty("--ln-dnv-filter-radius", px(stav.prvky.filters.radius));
    root.style.setProperty("--ln-dnv-filter-gap", px(stav.prvky.filters.mezera));

    root.style.setProperty("--ln-dnv-tag-height", px(stav.prvky.tags.velikost));
    root.style.setProperty("--ln-dnv-tag-radius", px(stav.prvky.tags.radius));
    root.style.setProperty("--ln-dnv-tag-gap", px(stav.prvky.tags.mezera));

    root.style.setProperty("--ln-dnv-card-padding", px(stav.prvky.cards.velikost));
    root.style.setProperty("--ln-dnv-card-radius", px(stav.prvky.cards.radius));
    root.style.setProperty("--ln-dnv-card-gap", px(stav.prvky.cards.mezera));

    return kopie(stav);
  }

  function oznam() {
    uloz();
    aplikuj();
    window.dispatchEvent(new CustomEvent("lubanote:desktop-notes-visual-tuning-change", { detail: kopie(stav) }));
  }

  function nastavVybranyPrvek(id) {
    if (!PRVKY.includes(id)) return false;
    stav.vybranyPrvek = id;
    oznam();
    return true;
  }

  function nastavPrvekHodnotu(id, klic, hodnota) {
    if (!PRVKY.includes(id) || !["velikost", "radius", "mezera"].includes(klic)) return false;
    const lim = LIMITY[id]?.[klic];
    if (!lim) return false;
    stav.prvky[id][klic] = omezCislo(hodnota, ...lim, stav.prvky[id][klic]);
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
    const vyber = stav.vybranyPrvek;
    stav = kopie(VYCHOZI);
    if (PRVKY.includes(vyber)) stav.vybranyPrvek = vyber;
    oznam();
    return true;
  }

  window.LubaNoteDesktopNotesVisualTuning = {
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
