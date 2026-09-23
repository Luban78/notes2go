/* ==================================================
   LubaNote – PC Planner Visual Lab
   PATCH 658AF
================================================== */
(() => {
  "use strict";

  const KLIC = "lubanoteDesktopPlannerVisualTuningV1";
  const VYCHOZI = {
    kalendar: {
      sirkaScreenu: 1160,
      podilKalendare: 60,
      sirkaMrizky: 620,
      vyskaDne: 54,
      mezeraDni: 5,
      radiusDne: 10,
      pismoDne: 16
    },
    agenda: {
      sloupce: 1,
      padding: 12,
      radius: 14,
      pismo: 15,
      paddingRadku: 7,
      mezeraRadku: 9,
      sirkaCasu: 62
    },
    subnav: {
      vyska: 50,
      radius: 12,
      mezera: 10
    }
  };

  const LIMITY = {
    sirkaScreenu: [900, 1450],
    podilKalendare: [48, 70],
    sirkaMrizky: [480, 760],
    vyskaDne: [38, 78],
    mezeraDni: [0, 14],
    radiusDne: [0, 24],
    pismoDne: [12, 22],
    agendaPadding: [4, 24],
    agendaRadius: [0, 28],
    agendaPismo: [12, 21],
    agendaPaddingRadku: [2, 16],
    agendaMezeraRadku: [4, 18],
    sirkaCasu: [48, 90],
    subnavVyska: [38, 68],
    subnavRadius: [0, 24],
    subnavMezera: [0, 24]
  };

  const kopie = (o) => JSON.parse(JSON.stringify(o));
  const omez = (v, min, max, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };

  function nacti() {
    const stav = kopie(VYCHOZI);
    try {
      const raw = JSON.parse(localStorage.getItem(KLIC) || "null") || {};
      const k = raw.kalendar || {};
      const a = raw.agenda || {};
      const s = raw.subnav || {};
      stav.kalendar.sirkaScreenu = omez(k.sirkaScreenu, ...LIMITY.sirkaScreenu, stav.kalendar.sirkaScreenu);
      stav.kalendar.podilKalendare = omez(k.podilKalendare, ...LIMITY.podilKalendare, stav.kalendar.podilKalendare);
      stav.kalendar.sirkaMrizky = omez(k.sirkaMrizky, ...LIMITY.sirkaMrizky, stav.kalendar.sirkaMrizky);
      stav.kalendar.vyskaDne = omez(k.vyskaDne, ...LIMITY.vyskaDne, stav.kalendar.vyskaDne);
      stav.kalendar.mezeraDni = omez(k.mezeraDni, ...LIMITY.mezeraDni, stav.kalendar.mezeraDni);
      stav.kalendar.radiusDne = omez(k.radiusDne, ...LIMITY.radiusDne, stav.kalendar.radiusDne);
      stav.kalendar.pismoDne = omez(k.pismoDne, ...LIMITY.pismoDne, stav.kalendar.pismoDne);
      stav.agenda.sloupce = Number(a.sloupce) === 2 ? 2 : 1;
      stav.agenda.padding = omez(a.padding, ...LIMITY.agendaPadding, stav.agenda.padding);
      stav.agenda.radius = omez(a.radius, ...LIMITY.agendaRadius, stav.agenda.radius);
      stav.agenda.pismo = omez(a.pismo, ...LIMITY.agendaPismo, stav.agenda.pismo);
      stav.agenda.paddingRadku = omez(a.paddingRadku, ...LIMITY.agendaPaddingRadku, stav.agenda.paddingRadku);
      stav.agenda.mezeraRadku = omez(a.mezeraRadku, ...LIMITY.agendaMezeraRadku, stav.agenda.mezeraRadku);
      stav.agenda.sirkaCasu = omez(a.sirkaCasu, ...LIMITY.sirkaCasu, stav.agenda.sirkaCasu);
      stav.subnav.vyska = omez(s.vyska, ...LIMITY.subnavVyska, stav.subnav.vyska);
      stav.subnav.radius = omez(s.radius, ...LIMITY.subnavRadius, stav.subnav.radius);
      stav.subnav.mezera = omez(s.mezera, ...LIMITY.subnavMezera, stav.subnav.mezera);
    } catch (_error) {}
    return stav;
  }

  let stav = nacti();
  function px(v) { return `${Number(v)}px`; }
  function uloz() { try { localStorage.setItem(KLIC, JSON.stringify(stav)); } catch (_error) {} }

  function aplikuj() {
    const root = document.documentElement;
    if (!root) return;
    root.style.setProperty("--ln-dpv-screen-width", px(stav.kalendar.sirkaScreenu));
    root.style.setProperty("--ln-dpv-calendar-share", `${stav.kalendar.podilKalendare}%`);
    root.style.setProperty("--ln-dpv-grid-width", px(stav.kalendar.sirkaMrizky));
    root.style.setProperty("--ln-dpv-day-height", px(stav.kalendar.vyskaDne));
    root.style.setProperty("--ln-dpv-day-gap", px(stav.kalendar.mezeraDni));
    root.style.setProperty("--ln-dpv-day-radius", px(stav.kalendar.radiusDne));
    root.style.setProperty("--ln-dpv-day-font", px(stav.kalendar.pismoDne));
    root.style.setProperty("--ln-dpv-agenda-columns", String(stav.agenda.sloupce));
    root.style.setProperty("--ln-dpv-agenda-pad", px(stav.agenda.padding));
    root.style.setProperty("--ln-dpv-agenda-radius", px(stav.agenda.radius));
    root.style.setProperty("--ln-dpv-item-font", px(stav.agenda.pismo));
    root.style.setProperty("--ln-dpv-item-pad-y", px(stav.agenda.paddingRadku));
    root.style.setProperty("--ln-dpv-item-gap", px(stav.agenda.mezeraRadku));
    root.style.setProperty("--ln-dpv-time-width", px(stav.agenda.sirkaCasu));
    root.style.setProperty("--ln-dpv-subnav-height", px(stav.subnav.vyska));
    root.style.setProperty("--ln-dpv-subnav-radius", px(stav.subnav.radius));
    root.style.setProperty("--ln-dpv-subnav-gap", px(stav.subnav.mezera));
  }

  function oznam() {
    uloz(); aplikuj();
    window.dispatchEvent(new CustomEvent("lubanote:desktop-planner-visual-change", { detail: kopie(stav) }));
  }

  function nastav(sekce, klic, hodnota) {
    if (!stav[sekce] || !(klic in stav[sekce])) return false;
    if (sekce === "agenda" && klic === "sloupce") {
      stav.agenda.sloupce = Number(hodnota) === 2 ? 2 : 1;
    } else {
      const mapa = {
        sirkaScreenu: LIMITY.sirkaScreenu, podilKalendare: LIMITY.podilKalendare,
        sirkaMrizky: LIMITY.sirkaMrizky, vyskaDne: LIMITY.vyskaDne,
        mezeraDni: LIMITY.mezeraDni, radiusDne: LIMITY.radiusDne,
        pismoDne: LIMITY.pismoDne, padding: LIMITY.agendaPadding,
        radius: sekce === "agenda" ? LIMITY.agendaRadius : LIMITY.subnavRadius,
        pismo: LIMITY.agendaPismo, paddingRadku: LIMITY.agendaPaddingRadku,
        mezeraRadku: LIMITY.agendaMezeraRadku, sirkaCasu: LIMITY.sirkaCasu,
        vyska: LIMITY.subnavVyska, mezera: LIMITY.subnavMezera
      };
      const lim = mapa[klic];
      if (!lim) return false;
      stav[sekce][klic] = omez(hodnota, ...lim, stav[sekce][klic]);
    }
    oznam(); return true;
  }

  function obnovVychozi() { stav = kopie(VYCHOZI); oznam(); }

  window.LubaNoteDesktopPlannerVisualTuning = {
    ziskejStav: () => kopie(stav),
    ziskejVychozi: () => kopie(VYCHOZI),
    nastav,
    obnovVychozi,
    aplikuj
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", aplikuj, { once: true });
  else aplikuj();
})();
