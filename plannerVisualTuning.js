/* ==================================================
   LubaNote – živé ladění vzhledu Plánu / Připomínek
   PATCH 658S

   Admin-only Visual Lab. Hodnoty jsou lokální pro zařízení.
   Nemění data, sync ani cloud. V APK ladí pouze mobilní layout.
================================================== */
(() => {
  "use strict";

  const KLIC = "lubanotePlannerVisualTuningV1";
  const PRVKY = [
    "subnav",
    "days",
    "agendaHeader",
    "agendaItems",
    "reminderAreaFilters",
    "reminderStatus",
    "reminderItems"
  ];

  const VYCHOZI = {
    vybranyPrvek: "reminderItems",
    ikony: {
      plan: false,
      pripominky: false,
      velikost: 18,
      tloustka: 1.85
    },
    prvky: {
      subnav: { velikost: 42, radius: 10, mezera: 9 },
      days: { velikost: 40, radius: 12, mezera: 4 },
      agendaHeader: { velikost: 52, radius: 14, mezera: 8 },
      agendaItems: { velikost: 2, radius: 0, mezera: 0 },
      reminderAreaFilters: { velikost: 42, radius: 15, mezera: 14 },
      reminderStatus: { velikost: 7, radius: 10, mezera: 18 },
      reminderItems: { velikost: 10, radius: 10, mezera: 5 }
    }
  };

  const LIMITY = {
    subnav: { velikost: [36, 58], radius: [0, 24], mezera: [0, 18] },
    days: { velikost: [30, 54], radius: [0, 22], mezera: [0, 12] },
    agendaHeader: { velikost: [44, 70], radius: [0, 24], mezera: [0, 20] },
    agendaItems: { velikost: [2, 18], radius: [0, 18], mezera: [0, 14] },
    reminderAreaFilters: { velikost: [34, 56], radius: [0, 24], mezera: [0, 18] },
    reminderStatus: { velikost: [2, 14], radius: [0, 20], mezera: [0, 18] },
    reminderItems: { velikost: [4, 20], radius: [0, 26], mezera: [0, 18] },
    ikonaVelikost: [12, 28],
    ikonaTloustka: [0.8, 2.4]
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

      if (PRVKY.includes(ulozeny?.vybranyPrvek)) {
        stav.vybranyPrvek = ulozeny.vybranyPrvek;
      }

      for (const id of PRVKY) {
        const vstup = ulozeny?.prvky?.[id] || {};
        const limit = LIMITY[id];
        stav.prvky[id] = {
          velikost: omezCislo(
            vstup.velikost,
            ...limit.velikost,
            VYCHOZI.prvky[id].velikost
          ),
          radius: omezCislo(
            vstup.radius,
            ...limit.radius,
            VYCHOZI.prvky[id].radius
          ),
          mezera: omezCislo(
            vstup.mezera,
            ...limit.mezera,
            VYCHOZI.prvky[id].mezera
          )
        };
      }

      const ikony = ulozeny?.ikony || {};
      stav.ikony.plan =
        typeof ikony.plan === "boolean" ? ikony.plan : VYCHOZI.ikony.plan;
      stav.ikony.pripominky =
        typeof ikony.pripominky === "boolean"
          ? ikony.pripominky
          : VYCHOZI.ikony.pripominky;
      stav.ikony.velikost = omezCislo(
        ikony.velikost,
        ...LIMITY.ikonaVelikost,
        VYCHOZI.ikony.velikost
      );
      stav.ikony.tloustka = omezCislo(
        ikony.tloustka,
        ...LIMITY.ikonaTloustka,
        VYCHOZI.ikony.tloustka
      );

      return stav;
    } catch (_error) {
      return kopie(VYCHOZI);
    }
  }

  let stav = nacti();

  function uloz() {
    try {
      localStorage.setItem(KLIC, JSON.stringify(stav));
    } catch (_error) {}
  }

  function px(n) {
    return `${Number(n)}px`;
  }

  function aplikuj() {
    const root = document.documentElement;
    if (!root) return;

    root.style.setProperty("--ln-pv-subnav-height", px(stav.prvky.subnav.velikost));
    root.style.setProperty("--ln-pv-subnav-radius", px(stav.prvky.subnav.radius));
    root.style.setProperty("--ln-pv-subnav-gap", px(stav.prvky.subnav.mezera));

    root.style.setProperty("--ln-pv-day-height", px(stav.prvky.days.velikost));
    root.style.setProperty("--ln-pv-day-radius", px(stav.prvky.days.radius));
    root.style.setProperty("--ln-pv-day-gap", px(stav.prvky.days.mezera));

    root.style.setProperty("--ln-pv-agenda-header-height", px(stav.prvky.agendaHeader.velikost));
    root.style.setProperty("--ln-pv-agenda-header-radius", px(stav.prvky.agendaHeader.radius));
    root.style.setProperty("--ln-pv-agenda-header-gap", px(stav.prvky.agendaHeader.mezera));

    root.style.setProperty("--ln-pv-agenda-item-pad-y", px(stav.prvky.agendaItems.velikost));
    root.style.setProperty("--ln-pv-agenda-item-radius", px(stav.prvky.agendaItems.radius));
    root.style.setProperty("--ln-pv-agenda-item-gap", px(stav.prvky.agendaItems.mezera));

    root.style.setProperty("--ln-pv-rem-area-height", px(stav.prvky.reminderAreaFilters.velikost));
    root.style.setProperty("--ln-pv-rem-area-radius", px(stav.prvky.reminderAreaFilters.radius));
    root.style.setProperty("--ln-pv-rem-area-gap", px(stav.prvky.reminderAreaFilters.mezera));

    root.style.setProperty("--ln-pv-rem-status-pad-y", px(stav.prvky.reminderStatus.velikost));
    root.style.setProperty("--ln-pv-rem-status-radius", px(stav.prvky.reminderStatus.radius));
    root.style.setProperty("--ln-pv-rem-status-gap", px(stav.prvky.reminderStatus.mezera));

    root.style.setProperty("--ln-pv-rem-item-pad-y", px(stav.prvky.reminderItems.velikost));
    root.style.setProperty("--ln-pv-rem-item-radius", px(stav.prvky.reminderItems.radius));
    root.style.setProperty("--ln-pv-rem-item-gap", px(stav.prvky.reminderItems.mezera));

    root.style.setProperty("--ln-pv-icon-size", px(stav.ikony.velikost));
    root.style.setProperty("--ln-pv-icon-stroke", String(stav.ikony.tloustka));

    if (document.body) {
      document.body.classList.toggle("ln-pv-hide-plan-icons", stav.ikony.plan !== true);
      document.body.classList.toggle(
        "ln-pv-hide-reminder-icons",
        stav.ikony.pripominky !== true
      );
    }
  }

  function oznam() {
    uloz();
    aplikuj();
    window.dispatchEvent(
      new CustomEvent("lubanote:planner-visual-tuning-change", {
        detail: kopie(stav)
      })
    );
  }

  function nastavVybranyPrvek(id) {
    if (!PRVKY.includes(id)) return false;
    stav.vybranyPrvek = id;
    oznam();
    return true;
  }

  function nastavPrvekHodnotu(id, klic, hodnota) {
    if (!PRVKY.includes(id) || !["velikost", "radius", "mezera"].includes(klic)) {
      return false;
    }
    const limit = LIMITY[id]?.[klic];
    if (!limit) return false;
    stav.prvky[id][klic] = omezCislo(
      hodnota,
      ...limit,
      stav.prvky[id][klic]
    );
    oznam();
    return true;
  }

  function nastavIkony(klic, hodnota) {
    if (klic === "plan" || klic === "pripominky") {
      stav.ikony[klic] = Boolean(hodnota);
    } else if (klic === "velikost") {
      stav.ikony.velikost = omezCislo(
        hodnota,
        ...LIMITY.ikonaVelikost,
        stav.ikony.velikost
      );
    } else if (klic === "tloustka") {
      stav.ikony.tloustka = omezCislo(
        hodnota,
        ...LIMITY.ikonaTloustka,
        stav.ikony.tloustka
      );
    } else {
      return false;
    }
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

  window.LubaNotePlannerVisualTuning = {
    ziskejStav: () => kopie(stav),
    ziskejVychozi: () => kopie(VYCHOZI),
    ziskejLimity: () => kopie(LIMITY),
    nastavVybranyPrvek,
    nastavPrvekHodnotu,
    nastavIkony,
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
