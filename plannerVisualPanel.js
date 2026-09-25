/* ==================================================
   LubaNote – plovoucí živé ladění Plánu / Připomínek
   PATCH 658S
================================================== */
(() => {
  "use strict";

  const PANEL_ID = "ln-pvt-panel";
  const STORAGE_POS = "lubanotePlannerVisualPanelPosV1";

  const META = {
    subnav: {
      label: "Kalendář / Připomínky",
      size: "Výška tlačítek",
      sizeMin: 36,
      sizeMax: 58,
      radius: "Zaoblení tlačítek",
      radiusMin: 0,
      radiusMax: 24,
      gap: "Mezera mezi tlačítky",
      gapMin: 0,
      gapMax: 18
    },
    days: {
      label: "Dny kalendáře",
      size: "Výška dne",
      sizeMin: 30,
      sizeMax: 54,
      radius: "Zaoblení dne",
      radiusMin: 0,
      radiusMax: 22,
      gap: "Mezera mezi dny",
      gapMin: 0,
      gapMax: 12
    },
    agendaHeader: {
      label: "Lišta vybraného dne",
      size: "Výška lišty",
      sizeMin: 44,
      sizeMax: 70,
      radius: "Zaoblení lišty",
      radiusMin: 0,
      radiusMax: 24,
      gap: "Mezera datum / týden / +",
      gapMin: 0,
      gapMax: 20
    },
    agendaItems: {
      label: "Položky Plánu",
      size: "Svislé odsazení řádku",
      sizeMin: 2,
      sizeMax: 18,
      radius: "Zaoblení řádku",
      radiusMin: 0,
      radiusMax: 18,
      gap: "Mezera mezi řádky",
      gapMin: 0,
      gapMax: 14
    },
    reminderAreaFilters: {
      label: "Filtry Vše / Práce / Domov",
      size: "Výška filtrů",
      sizeMin: 34,
      sizeMax: 56,
      radius: "Zaoblení filtrů",
      radiusMin: 0,
      radiusMax: 24,
      gap: "Mezera filtrů",
      gapMin: 0,
      gapMax: 18
    },
    reminderStatus: {
      label: "Aktivní / Po termínu",
      size: "Svislé odsazení tlačítek",
      sizeMin: 2,
      sizeMax: 14,
      radius: "Zaoblení tlačítek",
      radiusMin: 0,
      radiusMax: 20,
      gap: "Mezera tlačítek",
      gapMin: 0,
      gapMax: 18
    },
    reminderItems: {
      label: "Karty Připomínek",
      size: "Svislé odsazení karty",
      sizeMin: 4,
      sizeMax: 20,
      radius: "Zaoblení karty",
      radiusMin: 0,
      radiusMax: 26,
      gap: "Mezera mezi kartami",
      gapMin: 0,
      gapMax: 18
    }
  };

  let panel = null;
  let refs = {};
  let drag = null;
  let jeOtevreny = false;
  let jeMinimalizovany = false;

  function api() {
    return window.LubaNotePlannerVisualTuning || null;
  }

  function povoleno() {
    return window.LubaNoteAdminTools?.isAllowed?.() === true;
  }

  function formatCislo(hodnota, jednotka = "px") {
    const n = Number(hodnota ?? 0);
    const text = Number.isInteger(n)
      ? String(n)
      : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
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
          <strong>📅 Plán – živé ladění</strong>
          <small id="ln-pvt-subtitle">Kalendář / Připomínky</small>
        </div>
        <button id="ln-pvt-minimize" class="ln-nvt-icon" type="button" aria-label="Minimalizovat">—</button>
        <button id="ln-pvt-close" class="ln-nvt-icon" type="button" aria-label="Zavřít">×</button>
      </header>
      <div class="ln-nvt-body">
        <label class="ln-nvt-row">
          <span class="ln-nvt-label">Prvek</span>
          <select id="ln-pvt-target" class="ln-nvt-select">
            ${Object.entries(META)
              .map(([id, m]) => `<option value="${id}">${m.label}</option>`)
              .join("")}
          </select>
        </label>

        <div class="ln-nvt-actions">
          <button id="ln-pvt-plan-icons" type="button">Ikony Plán: Zapnuto</button>
          <button id="ln-pvt-reminder-icons" type="button">Ikony Připomínky: Zapnuto</button>
        </div>

        ${rangeRadek({ id: "ln-pvt-size", label: "Velikost", min: 2, max: 70 })}
        ${rangeRadek({ id: "ln-pvt-radius", label: "Zaoblení", min: 0, max: 26 })}
        ${rangeRadek({ id: "ln-pvt-gap", label: "Mezera", min: 0, max: 20 })}

        <div class="ln-nvt-section-title">Metadata ikony</div>
        ${rangeRadek({ id: "ln-pvt-icon-size", label: "Velikost SVG ikony", min: 12, max: 28 })}
        ${rangeRadek({ id: "ln-pvt-classic-icon-size", label: "Velikost běžné / emoji ikony", min: 12, max: 26 })}
        ${rangeRadek({ id: "ln-pvt-icon-stroke", label: "Tloušťka SVG čáry", min: 0.8, max: 2.4, step: 0.05 })}

        <div class="ln-nvt-actions ln-nvt-actions-bottom">
          <button id="ln-pvt-reset-target" type="button">Reset prvku</button>
          <button id="ln-pvt-copy" type="button">Kopírovat nastavení</button>
          <button id="ln-pvt-reset-all" type="button">Vše výchozí</button>
          <button id="ln-pvt-center" type="button">Panel doprostřed</button>
        </div>
      </div>`;

    document.body.appendChild(panel);
    refs = {
      head: panel.querySelector(".ln-nvt-head"),
      subtitle: panel.querySelector("#ln-pvt-subtitle"),
      minimize: panel.querySelector("#ln-pvt-minimize"),
      close: panel.querySelector("#ln-pvt-close"),
      target: panel.querySelector("#ln-pvt-target"),
      planIcons: panel.querySelector("#ln-pvt-plan-icons"),
      reminderIcons: panel.querySelector("#ln-pvt-reminder-icons"),
      size: panel.querySelector("#ln-pvt-size"),
      sizeLabel: panel.querySelector('label[for="ln-pvt-size"] .ln-nvt-label'),
      radius: panel.querySelector("#ln-pvt-radius"),
      radiusLabel: panel.querySelector('label[for="ln-pvt-radius"] .ln-nvt-label'),
      gap: panel.querySelector("#ln-pvt-gap"),
      gapLabel: panel.querySelector('label[for="ln-pvt-gap"] .ln-nvt-label'),
      iconSize: panel.querySelector("#ln-pvt-icon-size"),
      classicIconSize: panel.querySelector("#ln-pvt-classic-icon-size"),
      iconStroke: panel.querySelector("#ln-pvt-icon-stroke"),
      resetTarget: panel.querySelector("#ln-pvt-reset-target"),
      copy: panel.querySelector("#ln-pvt-copy"),
      resetAll: panel.querySelector("#ln-pvt-reset-all"),
      center: panel.querySelector("#ln-pvt-center")
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
    if (original) original.textContent = `Pův. ${formatCislo(puvodni, unit)}`;
    if (current) current.textContent = formatCislo(aktualni, unit);
  }

  function aktualizuj() {
    if (!panel) return;
    const stav = api()?.ziskejStav?.();
    const vychozi = api()?.ziskejVychozi?.();
    if (!stav?.prvky || !stav?.ikony || !vychozi?.prvky || !vychozi?.ikony) return;

    const id = stav.vybranyPrvek || "subnav";
    const prvek = stav.prvky[id] || stav.prvky.subnav;
    const orig = vychozi.prvky[id] || vychozi.prvky.subnav;
    const meta = META[id] || META.subnav;

    refs.target.value = id;
    refs.subtitle.textContent = meta.label;

    refs.size.min = String(meta.sizeMin);
    refs.size.max = String(meta.sizeMax);
    refs.sizeLabel.textContent = meta.size;
    refs.radius.min = String(meta.radiusMin);
    refs.radius.max = String(meta.radiusMax);
    refs.radiusLabel.textContent = meta.radius;
    refs.gap.min = String(meta.gapMin);
    refs.gap.max = String(meta.gapMax);
    refs.gapLabel.textContent = meta.gap;

    nastavRange(refs.size, prvek.velikost, orig.velikost);
    nastavRange(refs.radius, prvek.radius, orig.radius);
    nastavRange(refs.gap, prvek.mezera, orig.mezera);
    nastavRange(refs.iconSize, stav.ikony.velikost, vychozi.ikony.velikost);
    nastavRange(refs.classicIconSize, stav.ikony.klasickaVelikost, vychozi.ikony.klasickaVelikost);
    nastavRange(refs.iconStroke, stav.ikony.tloustka, vychozi.ikony.tloustka);

    refs.planIcons.textContent = `Ikony Plán: ${stav.ikony.plan ? "Zapnuto" : "Vypnuto"}`;
    refs.planIcons.setAttribute("aria-pressed", String(stav.ikony.plan === true));
    refs.reminderIcons.textContent = `Ikony Připomínky: ${stav.ikony.pripominky ? "Zapnuto" : "Vypnuto"}`;
    refs.reminderIcons.setAttribute("aria-pressed", String(stav.ikony.pripominky === true));
  }

  function nastavPrvek(klic, hodnota) {
    const a = api();
    const id = a?.ziskejStav?.()?.vybranyPrvek || "subnav";
    a?.nastavPrvekHodnotu?.(id, klic, hodnota);
  }

  function prostredi() {
    try {
      if (window.Capacitor?.isNativePlatform?.()) return "APK/WebView";
    } catch (_error) {}
    return "WEB";
  }

  function tema() {
    return Array.from(document.body?.classList || [])
      .find((x) => x.startsWith("theme-")) || "theme-neznámé";
  }

  function vytvorExport() {
    return [
      "LUBANOTE PLANNER VISUAL LAB EXPORT",
      `verze: ${window.LUBANOTE_VERSION || "DEV"}`,
      `prostředí: ${prostredi()}`,
      `téma: ${tema()}`,
      `čas: ${new Date().toISOString()}`,
      "",
      "AKTUÁLNÍ NASTAVENÍ:",
      JSON.stringify(api()?.ziskejStav?.() || {}, null, 2)
    ].join("\n");
  }

  function fallbackKopie(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (_error) { ok = false; }
    textarea.remove();
    return ok;
  }

  async function zkopirujText(text) {
    const cap = window.Capacitor?.Plugins?.Clipboard;
    if (cap?.write) {
      try {
        await cap.write({ string: text });
        return true;
      } catch (_error) {}
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_error) {}
    return fallbackKopie(text);
  }

  async function zkopirujNastaveni() {
    const ok = await zkopirujText(vytvorExport());
    if (!refs.copy) return;
    const puvodni = refs.copy.textContent;
    refs.copy.textContent = ok ? "Zkopírováno ✓" : "Kopírování selhalo";
    setTimeout(() => {
      if (refs.copy) refs.copy.textContent = puvodni;
    }, 1400);
  }

  function registrujUdalosti() {
    refs.close.addEventListener("click", zavri);
    refs.minimize.addEventListener("click", () => {
      jeMinimalizovany = !jeMinimalizovany;
      panel.classList.toggle("ln-nvt-minimized", jeMinimalizovany);
      refs.minimize.textContent = jeMinimalizovany ? "+" : "—";
    });
    refs.target.addEventListener("change", () => api()?.nastavVybranyPrvek?.(refs.target.value));
    refs.planIcons.addEventListener("click", () => {
      const stav = api()?.ziskejStav?.();
      api()?.nastavIkony?.("plan", !(stav?.ikony?.plan === true));
    });
    refs.reminderIcons.addEventListener("click", () => {
      const stav = api()?.ziskejStav?.();
      api()?.nastavIkony?.("pripominky", !(stav?.ikony?.pripominky === true));
    });
    refs.size.addEventListener("input", () => nastavPrvek("velikost", refs.size.value));
    refs.radius.addEventListener("input", () => nastavPrvek("radius", refs.radius.value));
    refs.gap.addEventListener("input", () => nastavPrvek("mezera", refs.gap.value));
    refs.iconSize.addEventListener("input", () => api()?.nastavIkony?.("velikost", refs.iconSize.value));
    refs.classicIconSize.addEventListener("input", () => api()?.nastavIkony?.("klasickaVelikost", refs.classicIconSize.value));
    refs.iconStroke.addEventListener("input", () => api()?.nastavIkony?.("tloustka", refs.iconStroke.value));
    refs.resetTarget.addEventListener("click", () => api()?.obnovVybranyPrvek?.());
    refs.copy.addEventListener("click", zkopirujNastaveni);
    refs.resetAll.addEventListener("click", () => api()?.obnovVychozi?.());
    refs.center.addEventListener("click", vycentruj);

    refs.head.addEventListener("pointerdown", zacniDrag);
    window.addEventListener("pointermove", tahni);
    window.addEventListener("pointerup", ukonciDrag);
    window.addEventListener("pointercancel", ukonciDrag);
    window.addEventListener("lubanote:planner-visual-tuning-change", aktualizuj);
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
    panel.style.left = `${Math.min(lim.maxX, Math.max(lim.minX, rect.left))}px`;
    panel.style.top = `${Math.min(lim.maxY, Math.max(lim.minY, rect.top))}px`;
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
    return true;
  }

  function zavri() {
    if (!panel) return false;
    panel.hidden = true;
    jeOtevreny = false;
    return true;
  }

  function prepni() {
    return jeOtevreny ? zavri() : otevri();
  }

  window.LubaNotePlannerVisualPanel = {
    open: otevri,
    close: zavri,
    toggle: prepni,
    isOpen: () => jeOtevreny,
    refresh: aktualizuj,
    center: vycentruj
  };
})();
