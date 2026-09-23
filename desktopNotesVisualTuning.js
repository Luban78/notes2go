/* ==================================================
   LubaNote – PC živé ladění hlavní plochy Poznámek
   PATCH 658AC – plný Visual Lab
================================================== */
(() => {
  "use strict";

  const KLIC_V2 = "lubanoteDesktopNotesVisualTuningV2";
  const KLIC_V1 = "lubanoteDesktopNotesVisualTuningV1";
  const PRVKY = ["modules", "traffic", "search", "primary", "actions", "tags", "cards", "fab"];
  const POVOLENE_REZIMY = new Set(["dark", "light", "legacy"]);

  const VYCHOZI = {
    vybranyPrvek: "search",
    prvky: {
      modules: { borderZapnuty: true, borderSirka: 1, borderRezim: "legacy", borderSila: 18, radius: 13, velikost: 54 },
      traffic: { borderZapnuty: true, borderSirka: 1, borderRezim: "legacy", borderSila: 18, radius: 12, velikost: 22 },
      search: { borderZapnuty: true, borderSirka: 1, borderRezim: "legacy", borderSila: 18, radius: 13, velikost: 420 },
      primary: { borderZapnuty: true, borderSirka: 1, borderRezim: "legacy", borderSila: 18, radius: 13, velikost: 50, ikonaVelikost: 22, ikonaTloustka: 1.5 },
      actions: { borderZapnuty: true, borderSirka: 1, borderRezim: "legacy", borderSila: 18, radius: 13, velikost: 50, ikonaVelikost: 22, ikonaTloustka: 1.5 },
      tags: { borderZapnuty: true, borderSirka: 1, borderRezim: "legacy", borderSila: 18, radius: 11, velikost: 38 },
      cards: { borderZapnuty: true, borderSirka: 1, borderRezim: "dark", borderSila: 18, radius: 17, velikost: 16 },
      fab: { borderZapnuty: true, borderSirka: 1, borderRezim: "legacy", borderSila: 18, radius: 30, velikost: 60 }
    },
    layout: {
      offsetY: 0,
      toolbarVyska: 50,
      toolbarMezera: 8,
      filtryMezera: 7,
      toolbarStitkyMezera: 8,
      stitkyMezera: 8,
      stitkyKartyMezera: 10,
      kartySloupceMezera: 14,
      kartyRadkyMezera: 14
    }
  };

  const LIMITY = {
    borderSirka: [0.5, 8], borderSila: [0, 70], radius: [0, 44],
    modulesVelikost: [42, 76], trafficVelikost: [16, 42], searchVelikost: [220, 700],
    primaryVelikost: [38, 76], actionsVelikost: [38, 76], tagsVelikost: [28, 58],
    cardsVelikost: [8, 30], fabVelikost: [48, 88], ikonaVelikost: [14, 32], ikonaTloustka: [0.8, 2.4],
    offsetY: [-20, 30], toolbarVyska: [38, 72], toolbarMezera: [0, 22], filtryMezera: [0, 18],
    toolbarStitkyMezera: [0, 24], stitkyMezera: [0, 20], stitkyKartyMezera: [0, 36],
    kartySloupceMezera: [0, 36], kartyRadkyMezera: [0, 36]
  };

  function kopie(o) { return JSON.parse(JSON.stringify(o)); }
  function omezCislo(v, min, max, fallback) {
    const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  }
  function limitVelikosti(id) { return LIMITY[`${id}Velikost`] || [10, 100]; }

  function normalizujPrvek(id, vstup, fallback) {
    const v = vstup && typeof vstup === "object" ? vstup : {};
    const out = {
      borderZapnuty: typeof v.borderZapnuty === "boolean" ? v.borderZapnuty : fallback.borderZapnuty,
      borderSirka: omezCislo(v.borderSirka, ...LIMITY.borderSirka, fallback.borderSirka),
      borderRezim: POVOLENE_REZIMY.has(v.borderRezim) ? v.borderRezim : fallback.borderRezim,
      borderSila: omezCislo(v.borderSila, ...LIMITY.borderSila, fallback.borderSila),
      radius: omezCislo(v.radius, ...LIMITY.radius, fallback.radius),
      velikost: omezCislo(v.velikost, ...limitVelikosti(id), fallback.velikost)
    };
    if (id === "primary" || id === "actions") {
      out.ikonaVelikost = omezCislo(v.ikonaVelikost, ...LIMITY.ikonaVelikost, fallback.ikonaVelikost);
      out.ikonaTloustka = omezCislo(v.ikonaTloustka, ...LIMITY.ikonaTloustka, fallback.ikonaTloustka);
    }
    return out;
  }

  function nacti() {
    let raw = null;
    try { raw = localStorage.getItem(KLIC_V2); } catch (_e) {}
    if (raw) {
      try {
        const u = JSON.parse(raw); const s = kopie(VYCHOZI);
        if (PRVKY.includes(u?.vybranyPrvek)) s.vybranyPrvek = u.vybranyPrvek;
        for (const id of PRVKY) s.prvky[id] = normalizujPrvek(id, u?.prvky?.[id], VYCHOZI.prvky[id]);
        const l = u?.layout || {};
        for (const k of Object.keys(VYCHOZI.layout)) s.layout[k] = omezCislo(l[k], ...LIMITY[k], VYCHOZI.layout[k]);
        return s;
      } catch (_e) {}
    }

    const s = kopie(VYCHOZI);
    try {
      const oldRaw = localStorage.getItem(KLIC_V1);
      if (!oldRaw) return s;
      const old = JSON.parse(oldRaw);
      if (old?.prvky?.toolbar) {
        s.layout.toolbarVyska = omezCislo(old.prvky.toolbar.velikost, ...LIMITY.toolbarVyska, s.layout.toolbarVyska);
        s.layout.toolbarMezera = omezCislo(old.prvky.toolbar.mezera, ...LIMITY.toolbarMezera, s.layout.toolbarMezera);
        s.prvky.actions.radius = omezCislo(old.prvky.toolbar.radius, ...LIMITY.radius, s.prvky.actions.radius);
      }
      if (old?.prvky?.search) {
        s.prvky.search.velikost = omezCislo(old.prvky.search.velikost, ...LIMITY.searchVelikost, s.prvky.search.velikost);
        s.prvky.search.radius = omezCislo(old.prvky.search.radius, ...LIMITY.radius, s.prvky.search.radius);
      }
      if (old?.prvky?.filters) {
        s.prvky.primary.velikost = omezCislo(old.prvky.filters.velikost, ...LIMITY.primaryVelikost, s.prvky.primary.velikost);
        s.prvky.primary.radius = omezCislo(old.prvky.filters.radius, ...LIMITY.radius, s.prvky.primary.radius);
        s.layout.filtryMezera = omezCislo(old.prvky.filters.mezera, ...LIMITY.filtryMezera, s.layout.filtryMezera);
      }
      if (old?.prvky?.tags) {
        s.prvky.tags.velikost = omezCislo(old.prvky.tags.velikost, ...LIMITY.tagsVelikost, s.prvky.tags.velikost);
        s.prvky.tags.radius = omezCislo(old.prvky.tags.radius, ...LIMITY.radius, s.prvky.tags.radius);
        s.layout.stitkyMezera = omezCislo(old.prvky.tags.mezera, ...LIMITY.stitkyMezera, s.layout.stitkyMezera);
      }
      if (old?.prvky?.cards) {
        s.prvky.cards.velikost = omezCislo(old.prvky.cards.velikost, ...LIMITY.cardsVelikost, s.prvky.cards.velikost);
        s.prvky.cards.radius = omezCislo(old.prvky.cards.radius, ...LIMITY.radius, s.prvky.cards.radius);
        s.layout.kartyRadkyMezera = omezCislo(old.prvky.cards.mezera, ...LIMITY.kartyRadkyMezera, s.layout.kartyRadkyMezera);
        s.layout.kartySloupceMezera = s.layout.kartyRadkyMezera;
      }
    } catch (_e) {}
    return s;
  }

  let stav = nacti();
  function uloz() { try { localStorage.setItem(KLIC_V2, JSON.stringify(stav)); } catch (_e) {} }
  function px(v) { return `${Number(v)}px`; }

  function borderVars(root, body, id, d) {
    const p = `--ln-dnv-${id}`;
    const sila = Math.round(d.borderSila * 10) / 10;
    root.style.setProperty(`${p}-border-width`, px(d.borderSirka));
    root.style.setProperty(`${p}-border-strength`, `${sila}%`);
    root.style.setProperty(`${p}-border-base`, `${Math.max(0, 100 - sila)}%`);
    root.style.setProperty(`${p}-radius`, px(d.radius));
    root.style.setProperty(`${p}-size`, px(d.velikost));
    body.dataset[`lnDnv${id[0].toUpperCase()}${id.slice(1)}Border`] = d.borderZapnuty ? "on" : "off";
    body.dataset[`lnDnv${id[0].toUpperCase()}${id.slice(1)}Mode`] = d.borderRezim;
    if (id === "primary" || id === "actions") {
      root.style.setProperty(`${p}-icon-size`, px(d.ikonaVelikost));
      root.style.setProperty(`${p}-icon-stroke`, String(d.ikonaTloustka));
    }
  }

  function aplikuj() {
    const root = document.documentElement, body = document.body;
    if (!root || !body) return kopie(stav);
    for (const id of PRVKY) borderVars(root, body, id, stav.prvky[id]);
    for (const [k,v] of Object.entries(stav.layout)) root.style.setProperty(`--ln-dnv-layout-${k}`, px(v));
    return kopie(stav);
  }

  function oznam() { uloz(); aplikuj(); window.dispatchEvent(new CustomEvent("lubanote:desktop-notes-visual-tuning-change", { detail: kopie(stav) })); }
  function nastavVybranyPrvek(id) { if (!PRVKY.includes(id)) return false; stav.vybranyPrvek = id; oznam(); return true; }
  function nastavPrvekHodnotu(id, klic, hodnota) {
    if (!PRVKY.includes(id)) return false;
    const d = stav.prvky[id];
    if (klic === "borderZapnuty") d[klic] = Boolean(hodnota);
    else if (klic === "borderRezim") { if (!POVOLENE_REZIMY.has(hodnota)) return false; d[klic] = hodnota; }
    else if (klic === "borderSirka") d[klic] = omezCislo(hodnota, ...LIMITY.borderSirka, d[klic]);
    else if (klic === "borderSila") d[klic] = omezCislo(hodnota, ...LIMITY.borderSila, d[klic]);
    else if (klic === "radius") d[klic] = omezCislo(hodnota, ...LIMITY.radius, d[klic]);
    else if (klic === "velikost") d[klic] = omezCislo(hodnota, ...limitVelikosti(id), d[klic]);
    else if ((id === "primary" || id === "actions") && klic === "ikonaVelikost") d[klic] = omezCislo(hodnota, ...LIMITY.ikonaVelikost, d[klic]);
    else if ((id === "primary" || id === "actions") && klic === "ikonaTloustka") d[klic] = omezCislo(hodnota, ...LIMITY.ikonaTloustka, d[klic]);
    else return false;
    oznam(); return true;
  }
  function nastavLayoutHodnotu(klic, hodnota) {
    if (!(klic in VYCHOZI.layout) || !LIMITY[klic]) return false;
    stav.layout[klic] = omezCislo(hodnota, ...LIMITY[klic], stav.layout[klic]); oznam(); return true;
  }
  function obnovVybranyPrvek() { const id = stav.vybranyPrvek; if (!PRVKY.includes(id)) return false; stav.prvky[id] = kopie(VYCHOZI.prvky[id]); oznam(); return true; }
  function obnovVychozi() { const vyber = stav.vybranyPrvek; stav = kopie(VYCHOZI); if (PRVKY.includes(vyber)) stav.vybranyPrvek = vyber; oznam(); return true; }

  window.LubaNoteDesktopNotesVisualTuning = {
    ziskejStav: () => kopie(stav), ziskejVychozi: () => kopie(VYCHOZI), ziskejLimity: () => kopie(LIMITY),
    nastavVybranyPrvek, nastavPrvekHodnotu, nastavLayoutHodnotu, obnovVybranyPrvek, obnovVychozi, aplikuj
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", aplikuj, { once: true }); else aplikuj();
})();
