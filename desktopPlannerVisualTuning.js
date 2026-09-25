/* ==================================================
   LubaNote – PC Planner Visual Lab
   PATCH 658BJ
================================================== */
(() => {
  "use strict";

  const KLIC = "lubanoteDesktopPlannerVisualTuningV3";
  const VYCHOZI = {
    kalendar: {
      sirkaScreenu: 1248,
      podilKalendare: 51,
      sirkaMrizky: 570,
      vyskaDne: 64,
      mezeraDni: 9,
      radiusDne: 10,
      pismoDne: 20
    },
    agenda: {
      sloupce: 1,
      padding: 12,
      radius: 14,
      pismo: 15,
      paddingRadku: 7,
      minVyskaRadku: 48,
      mezeraRadku: 9,
      sirkaCasu: 62
    },
    subnav: {
      vyska: 54,
      radius: 13,
      mezera: 12,
      pismo: 16
    },
    pripominky: {
      sirkaFiltru: 232,
      vyskaRadku: 54,
      pismoRadku: 16,
      pismoCasu: 16,
      pismoSkupiny: 17,
      mezeraSkupin: 17,
      radiusRadku: 11
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
    agendaMinVyskaRadku: [38, 76],
    agendaMezeraRadku: [4, 18],
    sirkaCasu: [48, 90],
    subnavVyska: [38, 68],
    subnavRadius: [0, 24],
    subnavMezera: [0, 24],
    subnavPismo: [12, 22],
    reminderSirkaFiltru: [190, 320],
    reminderVyskaRadku: [44, 82],
    reminderPismoRadku: [13, 22],
    reminderPismoCasu: [13, 22],
    reminderPismoSkupiny: [14, 24],
    reminderMezeraSkupin: [8, 30],
    reminderRadiusRadku: [0, 22]
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
      const r = raw.pripominky || {};
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
      stav.agenda.minVyskaRadku = omez(a.minVyskaRadku, ...LIMITY.agendaMinVyskaRadku, stav.agenda.minVyskaRadku);
      stav.agenda.mezeraRadku = omez(a.mezeraRadku, ...LIMITY.agendaMezeraRadku, stav.agenda.mezeraRadku);
      stav.agenda.sirkaCasu = omez(a.sirkaCasu, ...LIMITY.sirkaCasu, stav.agenda.sirkaCasu);
      stav.subnav.vyska = omez(s.vyska, ...LIMITY.subnavVyska, stav.subnav.vyska);
      stav.subnav.radius = omez(s.radius, ...LIMITY.subnavRadius, stav.subnav.radius);
      stav.subnav.mezera = omez(s.mezera, ...LIMITY.subnavMezera, stav.subnav.mezera);
      stav.subnav.pismo = omez(s.pismo, ...LIMITY.subnavPismo, stav.subnav.pismo);
      stav.pripominky.sirkaFiltru = omez(r.sirkaFiltru, ...LIMITY.reminderSirkaFiltru, stav.pripominky.sirkaFiltru);
      stav.pripominky.vyskaRadku = omez(r.vyskaRadku, ...LIMITY.reminderVyskaRadku, stav.pripominky.vyskaRadku);
      stav.pripominky.pismoRadku = omez(r.pismoRadku, ...LIMITY.reminderPismoRadku, stav.pripominky.pismoRadku);
      stav.pripominky.pismoCasu = omez(r.pismoCasu, ...LIMITY.reminderPismoCasu, stav.pripominky.pismoCasu);
      stav.pripominky.pismoSkupiny = omez(r.pismoSkupiny, ...LIMITY.reminderPismoSkupiny, stav.pripominky.pismoSkupiny);
      stav.pripominky.mezeraSkupin = omez(r.mezeraSkupin, ...LIMITY.reminderMezeraSkupin, stav.pripominky.mezeraSkupin);
      stav.pripominky.radiusRadku = omez(r.radiusRadku, ...LIMITY.reminderRadiusRadku, stav.pripominky.radiusRadku);
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
    root.style.setProperty("--ln-dpv-item-min-height", px(stav.agenda.minVyskaRadku));
    root.style.setProperty("--ln-dpv-item-gap", px(stav.agenda.mezeraRadku));
    root.style.setProperty("--ln-dpv-time-width", px(stav.agenda.sirkaCasu));
    root.style.setProperty("--ln-dpv-subnav-height", px(stav.subnav.vyska));
    root.style.setProperty("--ln-dpv-subnav-radius", px(stav.subnav.radius));
    root.style.setProperty("--ln-dpv-subnav-gap", px(stav.subnav.mezera));
    root.style.setProperty("--ln-dpv-subnav-font", px(stav.subnav.pismo));
    root.style.setProperty("--ln-dpr-filter-width", px(stav.pripominky.sirkaFiltru));
    root.style.setProperty("--ln-dpr-row-min-height", px(stav.pripominky.vyskaRadku));
    root.style.setProperty("--ln-dpr-row-font", px(stav.pripominky.pismoRadku));
    root.style.setProperty("--ln-dpr-time-font", px(stav.pripominky.pismoCasu));
    root.style.setProperty("--ln-dpr-group-font", px(stav.pripominky.pismoSkupiny));
    root.style.setProperty("--ln-dpr-group-gap", px(stav.pripominky.mezeraSkupin));
    root.style.setProperty("--ln-dpr-row-radius", px(stav.pripominky.radiusRadku));
  }

  function oznam() {
    uloz(); aplikuj();
    window.dispatchEvent(new CustomEvent("lubanote:desktop-planner-visual-change", { detail: kopie(stav) }));
  }

  function synchronizujTextVisual(sekce, klic, pxHodnota) {
    const mapa = {
      "kalendar:pismoDne": "pcCalendarDay",
      "agenda:pismo": "pcAgendaItem",
      "subnav:pismo": "pcPlannerTabs",
      "pripominky:pismoRadku": "pcReminderTitle",
      "pripominky:pismoCasu": "pcReminderTime",
      "pripominky:pismoSkupiny": "pcReminderGroup"
    };
    const textId = mapa[`${sekce}:${klic}`];
    if (!textId) return;
    const rootPx = Number.parseFloat(
      window.getComputedStyle(document.documentElement).fontSize
    ) || 16;
    const rem = Number(pxHodnota) / rootPx;
    if (!Number.isFinite(rem)) return;
    window.LubaNoteTextVisualTuning?.nastavHodnotu?.(
      "desktop",
      textId,
      Number(rem.toFixed(4))
    );
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
        pismo: sekce === "subnav" ? LIMITY.subnavPismo : LIMITY.agendaPismo,
        paddingRadku: LIMITY.agendaPaddingRadku,
        minVyskaRadku: LIMITY.agendaMinVyskaRadku,
        mezeraRadku: LIMITY.agendaMezeraRadku, sirkaCasu: LIMITY.sirkaCasu,
        vyska: LIMITY.subnavVyska, mezera: LIMITY.subnavMezera,
        sirkaFiltru: LIMITY.reminderSirkaFiltru,
        vyskaRadku: LIMITY.reminderVyskaRadku,
        pismoRadku: LIMITY.reminderPismoRadku,
        pismoCasu: LIMITY.reminderPismoCasu,
        pismoSkupiny: LIMITY.reminderPismoSkupiny,
        mezeraSkupin: LIMITY.reminderMezeraSkupin,
        radiusRadku: LIMITY.reminderRadiusRadku
      };
      const lim = mapa[klic];
      if (!lim) return false;
      stav[sekce][klic] = omez(hodnota, ...lim, stav[sekce][klic]);
    }
    synchronizujTextVisual(sekce, klic, stav[sekce][klic]);
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
