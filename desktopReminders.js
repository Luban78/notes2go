/* ==================================================
   LubaNote – PC Připomínky / časová osa
   PATCH 658AH
   --------------------------------------------------
   Pouze desktop. Mobilní obrazovka Připomínek zůstává
   na původním rendereru a původním DOM.
================================================== */
(() => {
  "use strict";

  const desktopRezim = window.matchMedia(
    "(min-width: 1100px) and (hover: hover) and (pointer: fine)"
  );

  if (!desktopRezim.matches) return;

  const screen = document.getElementById("remindersScreen");
  const puvodniToolbar = screen?.querySelector(".remindersToolbar");
  const puvodniGroups = screen?.querySelector(".remindersGroups");
  const remindersModuleButton = document.getElementById("remindersModuleButton");
  const plannerAddTaskButton = document.getElementById("plannerAddTaskButton");
  const recurringOverviewButton = document.getElementById("recurringOverviewButton");

  if (!screen || !puvodniToolbar || !puvodniGroups) return;
  if (document.getElementById("desktopRemindersTimeline")) return;

  const STAV = {
    rezim: "all",
    hledani: "",
    aktivniSkupina: 0
  };

  const dnes = () => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  };

  const zacatekDne = (datum) =>
    new Date(datum.getFullYear(), datum.getMonth(), datum.getDate());

  const konecDne = (datum) => {
    const d = zacatekDne(datum);
    d.setDate(d.getDate() + 1);
    return d;
  };

  const klicDne = (datum) => {
    const y = datum.getFullYear();
    const m = String(datum.getMonth() + 1).padStart(2, "0");
    const d = String(datum.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  function zacatekTydne(datum) {
    const d = zacatekDne(datum);
    const den = d.getDay() || 7;
    d.setDate(d.getDate() - den + 1);
    return d;
  }

  function konecTydne(datum) {
    const d = zacatekTydne(datum);
    d.setDate(d.getDate() + 7);
    return d;
  }

  function formatSkupiny(datum) {
    const text = datum.toLocaleDateString(
      window.LubaNoteI18n?.ziskejLocale?.() || "cs-CZ",
      { weekday: "long", day: "numeric", month: "numeric", year: "numeric" }
    );
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function vytvorTlacitko(rezim, ikona, text) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "desktopReminderFilterButton";
    button.dataset.desktopReminderMode = rezim;
    button.innerHTML = `
      <span class="desktopReminderFilterIcon" data-luba-icon="${ikona}" aria-hidden="true"></span>
      <span class="desktopReminderFilterText">${text}</span>
      <span class="desktopReminderFilterCount" data-count-for="${rezim}"></span>`;
    return button;
  }

  const layout = document.createElement("div");
  layout.id = "desktopRemindersTimeline";
  layout.className = "desktopRemindersLayout";

  const filtry = document.createElement("aside");
  filtry.className = "desktopRemindersFilterPanel";
  filtry.innerHTML = `
    <h2>Filtry</h2>
    <label class="desktopReminderSearch">
      <span data-luba-icon="hledat" aria-hidden="true"></span>
      <input id="desktopReminderSearchInput" type="search" placeholder="Hledat připomínku…" autocomplete="off" spellcheck="false">
    </label>
    <div class="desktopReminderFilterList" aria-label="Filtry připomínek"></div>`;

  const filterList = filtry.querySelector(".desktopReminderFilterList");
  [
    ["all", "zvonek", "Vše"],
    ["today", "kalendar", "Dnes"],
    ["tomorrow", "kalendar", "Zítra"],
    ["week", "kalendar", "Tento týden"],
    ["work", "prace", "Práce"],
    ["private", "soukrome", "Domov"],
    ["overdue", "hodiny", "Po termínu"]
  ].forEach(([rezim, ikona, text]) => {
    filterList.appendChild(vytvorTlacitko(rezim, ikona, text));
  });

  const recurring = vytvorTlacitko("recurring", "opakovat", "Opakované");
  recurring.classList.add("desktopReminderFilterSecondary");
  filterList.appendChild(recurring);

  const timeline = document.createElement("section");
  timeline.className = "desktopRemindersTimelinePanel";
  timeline.innerHTML = `
    <header class="desktopRemindersTimelineHeader">
      <h2>Připomínky</h2>
      <div class="desktopReminderTimelineActions">
        <button id="desktopReminderPrev" type="button" aria-label="Předchozí den">‹</button>
        <button id="desktopReminderToday" type="button">Dnes</button>
        <button id="desktopReminderNext" type="button" aria-label="Další den">›</button>
        <button id="desktopReminderDateButton" type="button" aria-label="Vybrat datum">
          <span data-luba-icon="kalendar" aria-hidden="true"></span>
        </button>
        <input id="desktopReminderDateInput" class="desktopReminderDateInput" type="date" tabindex="-1" aria-hidden="true">
        <button id="desktopReminderAdd" class="desktopReminderAdd" type="button"><span aria-hidden="true">＋</span> Přidat</button>
      </div>
    </header>
    <div id="desktopReminderTimelineScroll" class="desktopReminderTimelineScroll"></div>`;

  layout.append(filtry, timeline);
  screen.appendChild(layout);
  document.body.classList.add("desktopRemindersTimelineReady");

  const searchInput = filtry.querySelector("#desktopReminderSearchInput");
  const scroll = timeline.querySelector("#desktopReminderTimelineScroll");
  const prevButton = timeline.querySelector("#desktopReminderPrev");
  const todayButton = timeline.querySelector("#desktopReminderToday");
  const nextButton = timeline.querySelector("#desktopReminderNext");
  const dateButton = timeline.querySelector("#desktopReminderDateButton");
  const dateInput = timeline.querySelector("#desktopReminderDateInput");
  const addButton = timeline.querySelector("#desktopReminderAdd");

  function vsechnyPolozky() {
    try {
      if (typeof getReminderEntries === "function") {
        return getReminderEntries();
      }
    } catch (_error) {}
    return [];
  }

  function odpovidaHledani(entry) {
    const dotaz = STAV.hledani.trim().toLocaleLowerCase("cs-CZ");
    if (!dotaz) return true;
    return `${entry.title || ""} ${entry.preview || ""}`
      .toLocaleLowerCase("cs-CZ")
      .includes(dotaz);
  }

  function polozkyProRezim(vsechny) {
    const now = new Date();
    const dnesStart = dnes();
    const zitraStart = new Date(dnesStart);
    zitraStart.setDate(zitraStart.getDate() + 1);
    const pozitriStart = new Date(zitraStart);
    pozitriStart.setDate(pozitriStart.getDate() + 1);
    const tydenStart = zacatekTydne(dnesStart);
    const tydenEnd = konecTydne(dnesStart);

    return vsechny
      .filter(odpovidaHledani)
      .filter((entry) => {
        const d = new Date(entry.date);
        if (Number.isNaN(d.getTime())) return false;

        switch (STAV.rezim) {
          case "today":
            return d >= dnesStart && d < zitraStart;
          case "tomorrow":
            return d >= zitraStart && d < pozitriStart;
          case "week":
            return d >= now && d >= tydenStart && d < tydenEnd;
          case "work":
            return d >= now && entry.area === "work";
          case "private":
            return d >= now && entry.area !== "work";
          case "overdue":
            return d < now;
          case "all":
          default:
            return d >= now;
        }
      })
      .sort((a, b) => {
        const rozdil = new Date(a.date) - new Date(b.date);
        return STAV.rezim === "overdue" ? -rozdil : rozdil;
      });
  }

  function spocitej(vsechny) {
    const now = new Date();
    const ds = dnes();
    const zs = new Date(ds); zs.setDate(zs.getDate() + 1);
    const ps = new Date(zs); ps.setDate(ps.getDate() + 1);
    const ts = zacatekTydne(ds), te = konecTydne(ds);
    const budouci = vsechny.filter(e => new Date(e.date) >= now);
    return {
      all: budouci.length,
      today: vsechny.filter(e => { const d=new Date(e.date); return d>=ds&&d<zs; }).length,
      tomorrow: vsechny.filter(e => { const d=new Date(e.date); return d>=zs&&d<ps; }).length,
      week: vsechny.filter(e => { const d=new Date(e.date); return d>=now&&d>=ts&&d<te; }).length,
      work: budouci.filter(e => e.area === "work").length,
      private: budouci.filter(e => e.area !== "work").length,
      overdue: vsechny.filter(e => new Date(e.date) < now).length
    };
  }

  function aktualizujFiltry(vsechny) {
    const pocty = spocitej(vsechny);
    filtry.querySelectorAll("[data-desktop-reminder-mode]").forEach((button) => {
      const rezim = button.dataset.desktopReminderMode;
      button.classList.toggle("active", rezim === STAV.rezim);
      const count = button.querySelector(`[data-count-for="${rezim}"]`);
      if (count && Object.prototype.hasOwnProperty.call(pocty, rezim)) {
        count.textContent = `(${pocty[rezim]})`;
      }
    });
  }

  function vytvorRadek(entry, overdue = false) {
    let row = null;
    try {
      if (typeof createReminderRow === "function") {
        row = createReminderRow(entry, false, overdue);
      }
    } catch (_error) {}
    if (!row) return null;

    row.classList.add("desktopReminderTimelineRow");
    row.dataset.desktopReminderDate = klicDne(new Date(entry.date));

    const badge = document.createElement("span");
    badge.className = `desktopReminderAreaBadge ${entry.area === "work" ? "is-work" : "is-private"}`;
    badge.textContent = entry.area === "work" ? "Práce" : "Domov";

    if (entry.sourceType === "recurring-note") {
      const repeat = document.createElement("span");
      repeat.className = "desktopReminderRepeatBadge";
      repeat.textContent = "Opakované";
      row.insertBefore(repeat, row.querySelector(".reminderItemMenu"));
    }

    row.insertBefore(badge, row.querySelector(".reminderItemMenu"));
    return row;
  }

  function vykresli() {
    const vsechny = vsechnyPolozky();
    aktualizujFiltry(vsechny);
    const polozky = polozkyProRezim(vsechny);

    scroll.innerHTML = "";
    STAV.aktivniSkupina = 0;

    if (!polozky.length) {
      const empty = document.createElement("div");
      empty.className = "desktopRemindersEmpty";
      empty.innerHTML = `<strong>Nic tu není</strong><span>Pro tento filtr nejsou žádné připomínky.</span>`;
      scroll.appendChild(empty);
      return;
    }

    const groups = new Map();
    polozky.forEach((entry) => {
      const d = new Date(entry.date);
      const key = klicDne(d);
      if (!groups.has(key)) groups.set(key, { date: zacatekDne(d), entries: [] });
      groups.get(key).entries.push(entry);
    });

    for (const [key, group] of groups) {
      const section = document.createElement("section");
      section.className = "desktopReminderDayGroup";
      section.dataset.dayKey = key;

      const h = document.createElement("h3");
      h.className = "desktopReminderDayTitle";
      h.innerHTML = `<span>${formatSkupiny(group.date)}</span><small>(${group.entries.length})</small>`;
      section.appendChild(h);

      const rows = document.createElement("div");
      rows.className = "desktopReminderDayRows";
      group.entries.forEach((entry) => {
        const row = vytvorRadek(entry, STAV.rezim === "overdue");
        if (row) rows.appendChild(row);
      });
      section.appendChild(rows);
      scroll.appendChild(section);
    }
  }

  function skupiny() {
    return Array.from(scroll.querySelectorAll(".desktopReminderDayGroup"));
  }

  function prejdiNaSkupinu(index) {
    const seznam = skupiny();
    if (!seznam.length) return;
    STAV.aktivniSkupina = Math.min(seznam.length - 1, Math.max(0, index));
    seznam[STAV.aktivniSkupina].scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function prejdiNaDatum(value) {
    if (!value) return;
    const seznam = skupiny();
    const index = seznam.findIndex((g) => g.dataset.dayKey === value);
    if (index >= 0) {
      prejdiNaSkupinu(index);
      return;
    }
    const d = new Date(`${value}T00:00:00`);
    if (!Number.isNaN(d.getTime())) {
      STAV.rezim = d < dnes() ? "overdue" : "all";
      vykresli();
      requestAnimationFrame(() => {
        const nove = skupiny();
        const i = nove.findIndex((g) => g.dataset.dayKey >= value);
        prejdiNaSkupinu(i >= 0 ? i : nove.length - 1);
      });
    }
  }

  filterList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-desktop-reminder-mode]");
    if (!button) return;
    const rezim = button.dataset.desktopReminderMode;
    if (rezim === "recurring") {
      recurringOverviewButton?.click();
      return;
    }
    STAV.rezim = rezim || "all";
    vykresli();
  });

  searchInput.addEventListener("input", () => {
    STAV.hledani = searchInput.value || "";
    vykresli();
  });

  prevButton.addEventListener("click", () => prejdiNaSkupinu(STAV.aktivniSkupina - 1));
  nextButton.addEventListener("click", () => prejdiNaSkupinu(STAV.aktivniSkupina + 1));
  todayButton.addEventListener("click", () => prejdiNaDatum(klicDne(dnes())));
  dateButton.addEventListener("click", () => {
    dateInput.value = klicDne(dnes());
    if (typeof dateInput.showPicker === "function") dateInput.showPicker();
    else dateInput.click();
  });
  dateInput.addEventListener("change", () => prejdiNaDatum(dateInput.value));
  addButton.addEventListener("click", () => plannerAddTaskButton?.click());

  remindersModuleButton?.addEventListener("click", () => requestAnimationFrame(vykresli));

  let observerTimer = 0;
  const observer = new MutationObserver(() => {
    clearTimeout(observerTimer);
    observerTimer = window.setTimeout(() => {
      if (!screen.hidden) vykresli();
    }, 30);
  });
  observer.observe(puvodniGroups, { childList: true, subtree: true });

  window.addEventListener("lubanote:desktop-planner-visual-change", () => {
    if (!screen.hidden) requestAnimationFrame(vykresli);
  });

  window.LubaNoteIcons?.naplnDeklarovaneIkony?.(layout);
  vykresli();
})();
