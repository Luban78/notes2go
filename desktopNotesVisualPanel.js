/* ==================================================
   LubaNote – plovoucí PC Visual Lab Poznámek
   PATCH 658Z
================================================== */
(() => {
  "use strict";

  const PANEL_ID = "ln-dnvt-panel";
  const STORAGE_POS = "lubanoteDesktopNotesVisualPanelPosV1";

  const META = {
    toolbar: {
      label: "Horní lišta",
      size: "Výška hledání + akcí",
      sizeMin: 38, sizeMax: 70,
      radius: "Zaoblení akčních tlačítek",
      radiusMin: 0, radiusMax: 24,
      gap: "Mezera prvků v řádku",
      gapMin: 0, gapMax: 20
    },
    search: {
      label: "Hledání",
      size: "Šířka hledání",
      sizeMin: 220, sizeMax: 700,
      radius: "Zaoblení hledání",
      radiusMin: 0, radiusMax: 24,
      gap: "Vnitřní odsazení X",
      gapMin: 0, gapMax: 30
    },
    filters: {
      label: "Vše / ⭐ / Koš / oko / Práce / Domů",
      size: "Šířka filtru",
      sizeMin: 38, sizeMax: 72,
      radius: "Zaoblení filtrů",
      radiusMin: 0, radiusMax: 24,
      gap: "Mezera mezi filtry",
      gapMin: 0, gapMax: 18
    },
    tags: {
      label: "Štítky",
      size: "Výška štítku",
      sizeMin: 28, sizeMax: 58,
      radius: "Zaoblení štítku",
      radiusMin: 0, radiusMax: 24,
      gap: "Mezera mezi štítky",
      gapMin: 0, gapMax: 20
    },
    cards: {
      label: "Karty poznámek",
      size: "Vnitřní odsazení karty",
      sizeMin: 8, sizeMax: 30,
      radius: "Zaoblení karty",
      radiusMin: 0, radiusMax: 30,
      gap: "Mezera mezi kartami",
      gapMin: 0, gapMax: 30
    }
  };

  let panel = null;
  let refs = {};
  let drag = null;
  let jeOtevreny = false;
  let jeMinimalizovany = false;

  function api() { return window.LubaNoteDesktopNotesVisualTuning || null; }
  function povoleno() { return window.LubaNoteAdminTools?.isAllowed?.() === true; }

  function formatCislo(hodnota) {
    const n = Number(hodnota ?? 0);
    return `${Number.isInteger(n) ? n : n.toFixed(1)} px`;
  }

  function rangeRadek({ id, label, min, max, step = 1 }) {
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
          <strong>🖥️ Poznámky PC – živé ladění</strong>
          <small id="ln-dnvt-subtitle">Horní lišta</small>
        </div>
        <button id="ln-dnvt-minimize" class="ln-nvt-icon" type="button" aria-label="Minimalizovat">—</button>
        <button id="ln-dnvt-close" class="ln-nvt-icon" type="button" aria-label="Zavřít">×</button>
      </header>
      <div class="ln-nvt-body">
        <label class="ln-nvt-row">
          <span class="ln-nvt-label">Prvek</span>
          <select id="ln-dnvt-target" class="ln-nvt-select">
            ${Object.entries(META).map(([id, m]) => `<option value="${id}">${m.label}</option>`).join("")}
          </select>
        </label>

        ${rangeRadek({ id: "ln-dnvt-size", label: "Velikost", min: 8, max: 700 })}
        ${rangeRadek({ id: "ln-dnvt-radius", label: "Zaoblení", min: 0, max: 30 })}
        ${rangeRadek({ id: "ln-dnvt-gap", label: "Mezera", min: 0, max: 30 })}

        <div class="ln-nvt-actions ln-nvt-actions-bottom">
          <button id="ln-dnvt-reset-target" type="button">Reset prvku</button>
          <button id="ln-dnvt-copy" type="button">Kopírovat nastavení</button>
          <button id="ln-dnvt-reset-all" type="button">Vše výchozí</button>
          <button id="ln-dnvt-center" type="button">Panel doprostřed</button>
        </div>
      </div>`;

    document.body.appendChild(panel);
    refs = {
      head: panel.querySelector(".ln-nvt-head"),
      subtitle: panel.querySelector("#ln-dnvt-subtitle"),
      minimize: panel.querySelector("#ln-dnvt-minimize"),
      close: panel.querySelector("#ln-dnvt-close"),
      target: panel.querySelector("#ln-dnvt-target"),
      size: panel.querySelector("#ln-dnvt-size"),
      sizeLabel: panel.querySelector('label[for="ln-dnvt-size"] .ln-nvt-label'),
      radius: panel.querySelector("#ln-dnvt-radius"),
      radiusLabel: panel.querySelector('label[for="ln-dnvt-radius"] .ln-nvt-label'),
      gap: panel.querySelector("#ln-dnvt-gap"),
      gapLabel: panel.querySelector('label[for="ln-dnvt-gap"] .ln-nvt-label'),
      resetTarget: panel.querySelector("#ln-dnvt-reset-target"),
      copy: panel.querySelector("#ln-dnvt-copy"),
      resetAll: panel.querySelector("#ln-dnvt-reset-all"),
      center: panel.querySelector("#ln-dnvt-center")
    };
    registrujUdalosti();
    obnovPozici();
    aktualizuj();
    return panel;
  }

  function nastavRange(input, aktualni, puvodni) {
    if (!input) return;
    input.value = String(aktualni);
    const original = panel.querySelector(`[data-original-for="${input.id}"]`);
    const current = panel.querySelector(`[data-current-for="${input.id}"]`);
    if (original) original.textContent = `Pův. ${formatCislo(puvodni)}`;
    if (current) current.textContent = formatCislo(aktualni);
  }

  function aktualizuj() {
    if (!panel) return;
    const stav = api()?.ziskejStav?.();
    const vychozi = api()?.ziskejVychozi?.();
    if (!stav?.prvky || !vychozi?.prvky) return;

    const id = stav.vybranyPrvek || "toolbar";
    const meta = META[id] || META.toolbar;
    const prvek = stav.prvky[id] || stav.prvky.toolbar;
    const orig = vychozi.prvky[id] || vychozi.prvky.toolbar;

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
  }

  function nastavPrvek(klic, hodnota) {
    const a = api();
    const id = a?.ziskejStav?.()?.vybranyPrvek || "toolbar";
    a?.nastavPrvekHodnotu?.(id, klic, hodnota);
  }

  function tema() {
    return Array.from(document.body?.classList || []).find(x => x.startsWith("theme-")) || "theme-neznámé";
  }

  function vytvorExport() {
    return [
      "LUBANOTE DESKTOP NOTES VISUAL LAB EXPORT",
      `verze: ${window.LUBANOTE_VERSION || "DEV"}`,
      "prostředí: PC/Web",
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
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (_error) {}
    textarea.remove();
    return ok;
  }

  async function zkopirujText(text) {
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
    const puvodni = refs.copy.textContent;
    refs.copy.textContent = ok ? "Zkopírováno ✓" : "Kopírování selhalo";
    setTimeout(() => { if (refs.copy) refs.copy.textContent = puvodni; }, 1400);
  }

  function registrujUdalosti() {
    refs.close.addEventListener("click", zavri);
    refs.minimize.addEventListener("click", () => {
      jeMinimalizovany = !jeMinimalizovany;
      panel.classList.toggle("ln-nvt-minimized", jeMinimalizovany);
      refs.minimize.textContent = jeMinimalizovany ? "+" : "—";
    });
    refs.target.addEventListener("change", () => api()?.nastavVybranyPrvek?.(refs.target.value));
    refs.size.addEventListener("input", () => nastavPrvek("velikost", refs.size.value));
    refs.radius.addEventListener("input", () => nastavPrvek("radius", refs.radius.value));
    refs.gap.addEventListener("input", () => nastavPrvek("mezera", refs.gap.value));
    refs.resetTarget.addEventListener("click", () => api()?.obnovVybranyPrvek?.());
    refs.copy.addEventListener("click", zkopirujNastaveni);
    refs.resetAll.addEventListener("click", () => api()?.obnovVychozi?.());
    refs.center.addEventListener("click", vycentruj);
    refs.head.addEventListener("pointerdown", zacniDrag);
    window.addEventListener("pointermove", tahni);
    window.addEventListener("pointerup", ukonciDrag);
    window.addEventListener("pointercancel", ukonciDrag);
    window.addEventListener("lubanote:desktop-notes-visual-tuning-change", aktualizuj);
    window.addEventListener("resize", omezDoViewportu);
  }

  function zacniDrag(event) {
    if (event.button !== undefined && event.button !== 0) return;
    if (event.target.closest("button, select, input")) return;
    const rect = panel.getBoundingClientRect();
    drag = { pointerId: event.pointerId, dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    refs.head.setPointerCapture?.(event.pointerId);
    panel.classList.add("ln-nvt-dragging");
    event.preventDefault();
  }

  function hranicePanelu() {
    const sirka = panel?.offsetWidth || 0;
    const viditelneX = Math.min(72, Math.max(52, Math.round(sirka * 0.2)));
    return {
      minX: Math.min(0, viditelneX - sirka),
      maxX: Math.max(0, window.innerWidth - viditelneX),
      minY: 0,
      maxY: Math.max(0, window.innerHeight - 48)
    };
  }

  function tahni(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const lim = hranicePanelu();
    panel.style.left = `${Math.min(lim.maxX, Math.max(lim.minX, event.clientX - drag.dx))}px`;
    panel.style.top = `${Math.min(lim.maxY, Math.max(lim.minY, event.clientY - drag.dy))}px`;
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
    panel.style.left = `${Math.max(8, (window.innerWidth - panel.offsetWidth) / 2)}px`;
    panel.style.top = `${Math.max(8, Math.min(110, (window.innerHeight - panel.offsetHeight) / 2))}px`;
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

  window.LubaNoteDesktopNotesVisualPanel = {
    open: otevri,
    close: zavri,
    toggle: () => jeOtevreny ? zavri() : otevri(),
    isOpen: () => jeOtevreny,
    refresh: aktualizuj,
    center: vycentruj
  };
})();
