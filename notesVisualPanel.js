/* ==================================================
   LubaNote – plovoucí živé ladění hlavního screenu Poznámky
   PATCH 658D

   Otevírá se z Admin Dashboardu a zůstává nad hlavním screenem,
   podobně jako Visual Debug. Hodnoty mění pouze lokální tuning API.
================================================== */
(() => {
  "use strict";

  const PANEL_ID = "ln-nvt-panel";
  const STORAGE_POS = "lubanoteNotesVisualPanelPosV1";
  const META = {
    cards: { label: "Karty poznámek", size: "Vnitřní odsazení", min: 10, max: 26 },
    tags: { label: "Vlastní štítky", size: "Výška štítku", min: 30, max: 56 },
    primary: { label: "Hlavní filtry", size: "Výška filtru", min: 30, max: 56 },
    search: { label: "Hledání", size: "Výška horního řádku", min: 34, max: 58 },
    actions: { label: "Horní akční ikony", size: "Výška horního řádku", min: 34, max: 58 },
    traffic: { label: "RX/TX/E panel", size: "Minimální výška", min: 40, max: 64 },
    modules: { label: "Poznámky / Plán / Dokumenty", size: "Výška tlačítka", min: 42, max: 68 },
    fab: { label: "Plovoucí +", size: "Velikost +", min: 48, max: 88 }
  };

  let panel = null;
  let telo = null;
  let refs = {};
  let jeOtevreny = false;
  let jeMinimalizovany = false;
  let drag = null;

  function t(klic, vychozi) {
    return window.LubaNoteI18n?.t?.(klic, vychozi) || vychozi;
  }

  function api() {
    return window.LubaNoteNotesVisualTuning || null;
  }

  function povoleno() {
    return window.LubaNoteAdminTools?.isAllowed?.() === true;
  }

  function formatCislo(hodnota, jednotka = "px") {
    const n = Number(hodnota ?? 0);
    const text = Number.isInteger(n) ? String(n) : n.toFixed(1);
    return `${text} ${jednotka}`;
  }

  function rangeRadek({ id, label, min, max, step = 1, unit = "px" }) {
    return `
      <label class="ln-nvt-row" for="${id}">
        <span class="ln-nvt-label">${label}</span>
        <span class="ln-nvt-range-line">
          <output class="ln-nvt-original" data-original-for="${id}">Pův. —</output>
          <input id="${id}" type="range" min="${min}" max="${max}" step="${step}">
          <output class="ln-nvt-current" data-current-for="${id}">—</output>
        </span>
      </label>`;
  }

  function vytvorPanel() {
    if (panel) return panel;

    panel = document.createElement("section");
    panel.id = PANEL_ID;
    panel.hidden = true;
    panel.innerHTML = `
      <header class="ln-nvt-head">
        <div class="ln-nvt-title">
          <strong>🎛️ Poznámky – živé ladění</strong>
          <small id="ln-nvt-subtitle">Hlavní screen</small>
        </div>
        <button id="ln-nvt-minimize" class="ln-nvt-icon" type="button" aria-label="Minimalizovat">—</button>
        <button id="ln-nvt-close" class="ln-nvt-icon" type="button" aria-label="Zavřít">×</button>
      </header>
      <div class="ln-nvt-body">
        <label class="ln-nvt-row">
          <span class="ln-nvt-label">Prvek</span>
          <select id="ln-nvt-target" class="ln-nvt-select">
            ${Object.entries(META).map(([id, m]) => `<option value="${id}">${m.label}</option>`).join("")}
          </select>
        </label>

        <div class="ln-nvt-actions">
          <button id="ln-nvt-border" type="button">Border: Zapnuto</button>
          <button id="ln-nvt-reset-target" type="button">Reset prvku</button>
        </div>

        <label class="ln-nvt-row">
          <span class="ln-nvt-label">Odstín borderu</span>
          <select id="ln-nvt-mode" class="ln-nvt-select">
            <option value="dark">Tmavší barva</option>
            <option value="light">Světlejší barva</option>
            <option value="legacy">Původní</option>
          </select>
        </label>

        ${rangeRadek({ id: "ln-nvt-width", label: "Šířka borderu", min: 0.5, max: 8, step: 0.5 })}
        ${rangeRadek({ id: "ln-nvt-strength", label: "Síla odstínu", min: 0, max: 70, unit: "%" })}
        ${rangeRadek({ id: "ln-nvt-radius", label: "Zaoblení rohů", min: 0, max: 44 })}
        ${rangeRadek({ id: "ln-nvt-size", label: "Velikost prvku", min: 10, max: 88 })}

        <div class="ln-nvt-section-title">Rozložení hlavního screenu</div>
        ${rangeRadek({ id: "ln-nvt-offset", label: "Posun obsahu Y", min: -16, max: 16 })}
        ${rangeRadek({ id: "ln-nvt-filter-gap", label: "Mezera hlavních filtrů", min: 2, max: 14 })}
        ${rangeRadek({ id: "ln-nvt-row-gap", label: "Mezera filtry ↕ štítky", min: 0, max: 20 })}
        ${rangeRadek({ id: "ln-nvt-tags-gap", label: "Mezera mezi štítky", min: 2, max: 16 })}
        ${rangeRadek({ id: "ln-nvt-card-col-gap", label: "Mezera sloupců karet", min: 0, max: 30 })}
        ${rangeRadek({ id: "ln-nvt-card-row-gap", label: "Mezera řádků karet", min: 2, max: 24 })}

        <div class="ln-nvt-actions ln-nvt-actions-bottom">
          <button id="ln-nvt-reset-all" type="button">Vše výchozí</button>
          <button id="ln-nvt-center" type="button">Panel doprostřed</button>
        </div>
      </div>`;

    document.body.appendChild(panel);
    telo = panel.querySelector(".ln-nvt-body");
    refs = {
      head: panel.querySelector(".ln-nvt-head"),
      subtitle: panel.querySelector("#ln-nvt-subtitle"),
      minimize: panel.querySelector("#ln-nvt-minimize"),
      close: panel.querySelector("#ln-nvt-close"),
      target: panel.querySelector("#ln-nvt-target"),
      border: panel.querySelector("#ln-nvt-border"),
      resetTarget: panel.querySelector("#ln-nvt-reset-target"),
      mode: panel.querySelector("#ln-nvt-mode"),
      width: panel.querySelector("#ln-nvt-width"),
      strength: panel.querySelector("#ln-nvt-strength"),
      radius: panel.querySelector("#ln-nvt-radius"),
      size: panel.querySelector("#ln-nvt-size"),
      sizeLabel: panel.querySelector('label[for="ln-nvt-size"] .ln-nvt-label'),
      offset: panel.querySelector("#ln-nvt-offset"),
      filterGap: panel.querySelector("#ln-nvt-filter-gap"),
      rowGap: panel.querySelector("#ln-nvt-row-gap"),
      tagsGap: panel.querySelector("#ln-nvt-tags-gap"),
      cardColGap: panel.querySelector("#ln-nvt-card-col-gap"),
      cardRowGap: panel.querySelector("#ln-nvt-card-row-gap"),
      resetAll: panel.querySelector("#ln-nvt-reset-all"),
      center: panel.querySelector("#ln-nvt-center")
    };

    registrujUdalosti();
    obnovPozici();
    aktualizuj();
    return panel;
  }

  function nastavRange(input, aktualni, puvodni, unit = "px") {
    if (!input) return;
    input.value = String(aktualni);
    const original = panel.querySelector(`[data-original-for="${input.id}"]`);
    const current = panel.querySelector(`[data-current-for="${input.id}"]`);
    const fmt = value => unit === "%" ? `${Math.round(Number(value ?? 0))} %` : formatCislo(value, unit);
    if (original) original.textContent = `Pův. ${fmt(puvodni)}`;
    if (current) current.textContent = fmt(aktualni);
  }

  function aktualizuj() {
    if (!panel) return;
    const a = api();
    const stav = a?.ziskejStav?.();
    const vychozi = a?.ziskejVychozi?.();
    if (!stav?.prvky || !stav?.layout || !vychozi?.prvky || !vychozi?.layout) return;

    const id = stav.vybranyPrvek || "cards";
    const prvek = stav.prvky[id] || stav.prvky.cards;
    const orig = vychozi.prvky[id] || vychozi.prvky.cards;
    const meta = META[id] || META.cards;

    refs.target.value = id;
    refs.subtitle.textContent = meta.label;
    refs.border.textContent = `Border: ${prvek.borderZapnuty ? "Zapnuto" : "Vypnuto"}`;
    refs.border.setAttribute("aria-pressed", String(prvek.borderZapnuty === true));
    refs.mode.value = prvek.borderRezim || "legacy";

    refs.size.min = String(meta.min);
    refs.size.max = String(meta.max);
    refs.sizeLabel.textContent = meta.size;

    nastavRange(refs.width, prvek.borderSirka, orig.borderSirka);
    nastavRange(refs.strength, prvek.borderSila, orig.borderSila, "%");
    nastavRange(refs.radius, prvek.radius, orig.radius);
    nastavRange(refs.size, prvek.velikost, orig.velikost);

    nastavRange(refs.offset, stav.layout.offsetY, vychozi.layout.offsetY);
    nastavRange(refs.filterGap, stav.layout.filtrMezera, vychozi.layout.filtrMezera);
    nastavRange(refs.rowGap, stav.layout.radkyMezera, vychozi.layout.radkyMezera);
    nastavRange(refs.tagsGap, stav.layout.stitkyMezera, vychozi.layout.stitkyMezera);
    nastavRange(refs.cardColGap, stav.layout.kartySloupceMezera, vychozi.layout.kartySloupceMezera);
    nastavRange(refs.cardRowGap, stav.layout.kartyRadkyMezera, vychozi.layout.kartyRadkyMezera);
  }

  function nastavPrvek(klic, hodnota) {
    const a = api();
    const id = a?.ziskejStav?.()?.vybranyPrvek || "cards";
    a?.nastavPrvekHodnotu?.(id, klic, hodnota);
  }

  function nastavLayout(klic, hodnota) {
    api()?.nastavLayoutHodnotu?.(klic, hodnota);
  }

  function registrujUdalosti() {
    refs.close.addEventListener("click", zavri);
    refs.minimize.addEventListener("click", () => {
      jeMinimalizovany = !jeMinimalizovany;
      panel.classList.toggle("ln-nvt-minimized", jeMinimalizovany);
      refs.minimize.textContent = jeMinimalizovany ? "+" : "—";
    });
    refs.target.addEventListener("change", () => api()?.nastavVybranyPrvek?.(refs.target.value));
    refs.border.addEventListener("click", () => {
      const stav = api()?.ziskejStav?.();
      const id = stav?.vybranyPrvek;
      const prvek = id ? stav?.prvky?.[id] : null;
      if (id && prvek) api()?.nastavPrvekHodnotu?.(id, "borderZapnuty", !prvek.borderZapnuty);
    });
    refs.resetTarget.addEventListener("click", () => api()?.obnovVybranyPrvek?.());
    refs.mode.addEventListener("change", () => nastavPrvek("borderRezim", refs.mode.value));
    refs.width.addEventListener("input", () => nastavPrvek("borderSirka", refs.width.value));
    refs.strength.addEventListener("input", () => nastavPrvek("borderSila", refs.strength.value));
    refs.radius.addEventListener("input", () => nastavPrvek("radius", refs.radius.value));
    refs.size.addEventListener("input", () => nastavPrvek("velikost", refs.size.value));
    refs.offset.addEventListener("input", () => nastavLayout("offsetY", refs.offset.value));
    refs.filterGap.addEventListener("input", () => nastavLayout("filtrMezera", refs.filterGap.value));
    refs.rowGap.addEventListener("input", () => nastavLayout("radkyMezera", refs.rowGap.value));
    refs.tagsGap.addEventListener("input", () => nastavLayout("stitkyMezera", refs.tagsGap.value));
    refs.cardColGap.addEventListener("input", () => nastavLayout("kartySloupceMezera", refs.cardColGap.value));
    refs.cardRowGap.addEventListener("input", () => nastavLayout("kartyRadkyMezera", refs.cardRowGap.value));
    refs.resetAll.addEventListener("click", () => api()?.obnovVychozi?.());
    refs.center.addEventListener("click", vycentruj);

    refs.head.addEventListener("pointerdown", zacniDrag);
    window.addEventListener("pointermove", tahni);
    window.addEventListener("pointerup", ukonciDrag);
    window.addEventListener("pointercancel", ukonciDrag);
    window.addEventListener("lubanote:notes-visual-tuning-change", aktualizuj);
    window.addEventListener("resize", omezDoViewportu);
  }

  function zacniDrag(event) {
    if (event.button !== undefined && event.button !== 0) return;
    if (event.target.closest("button, select, input")) return;
    const rect = panel.getBoundingClientRect();
    drag = {
      pointerId: event.pointerId,
      dx: event.clientX - rect.left,
      dy: event.clientY - rect.top
    };
    refs.head.setPointerCapture?.(event.pointerId);
    panel.classList.add("ln-nvt-dragging");
    event.preventDefault();
  }

  function hranicePanelu() {
    const sirka = panel?.offsetWidth || 0;
    const vyska = panel?.offsetHeight || 0;
    /* 658D: panel lze odsunout částečně mimo viewport, ale vždy
       necháme viditelný kus hlavičky, aby šel bezpečně přitáhnout zpět. */
    const viditelneX = Math.min(72, Math.max(52, Math.round(sirka * 0.2)));
    const viditelneY = 48;
    return {
      minX: Math.min(0, viditelneX - sirka),
      maxX: Math.max(0, window.innerWidth - viditelneX),
      minY: 0,
      maxY: Math.max(0, window.innerHeight - viditelneY)
    };
  }

  function tahni(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const lim = hranicePanelu();
    const left = Math.min(lim.maxX, Math.max(lim.minX, event.clientX - drag.dx));
    const top = Math.min(lim.maxY, Math.max(lim.minY, event.clientY - drag.dy));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
  }

  function ukonciDrag(event) {
    if (!drag || (event && event.pointerId !== drag.pointerId)) return;
    drag = null;
    panel.classList.remove("ln-nvt-dragging");
    ulozPozici();
  }

  function ulozPozici() {
    if (!panel) return;
    try {
      const rect = panel.getBoundingClientRect();
      localStorage.setItem(STORAGE_POS, JSON.stringify({ left: rect.left, top: rect.top }));
    } catch (_error) {}
  }

  function obnovPozici() {
    if (!panel) return;
    try {
      const raw = localStorage.getItem(STORAGE_POS);
      if (!raw) return;
      const pos = JSON.parse(raw);
      if (!Number.isFinite(pos?.left) || !Number.isFinite(pos?.top)) return;
      panel.style.left = `${pos.left}px`;
      panel.style.top = `${pos.top}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      requestAnimationFrame(omezDoViewportu);
    } catch (_error) {}
  }

  function omezDoViewportu() {
    if (!panel || panel.hidden) return;
    const rect = panel.getBoundingClientRect();
    const lim = hranicePanelu();
    const left = Math.min(lim.maxX, Math.max(lim.minX, rect.left));
    const top = Math.min(lim.maxY, Math.max(lim.minY, rect.top));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
  }

  function vycentruj() {
    if (!panel) return;
    const left = Math.max(8, (window.innerWidth - panel.offsetWidth) / 2);
    const top = Math.max(8, Math.min(110, (window.innerHeight - panel.offsetHeight) / 2));
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
    ulozPozici();
  }

  function otevri() {
    if (!povoleno()) return false;
    vytvorPanel();
    panel.hidden = false;
    jeOtevreny = true;
    aktualizuj();
    requestAnimationFrame(omezDoViewportu);
    window.dispatchEvent(new CustomEvent("lubanote:notes-visual-panel-change", { detail: { open: true } }));
    return true;
  }

  function zavri() {
    if (!panel) return false;
    panel.hidden = true;
    jeOtevreny = false;
    window.dispatchEvent(new CustomEvent("lubanote:notes-visual-panel-change", { detail: { open: false } }));
    return true;
  }

  function prepni() {
    return jeOtevreny ? zavri() : otevri();
  }

  window.LubaNoteNotesVisualPanel = {
    open: otevri,
    close: zavri,
    toggle: prepni,
    isOpen: () => jeOtevreny,
    refresh: aktualizuj,
    center: vycentruj
  };
})();
