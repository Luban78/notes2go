/* ==================================================
   LubaNote – TEXTY / plovoucí živé ladění typografie
   PATCH 658AX
================================================== */
(() => {
  "use strict";

  const PANEL_ID = "ln-tvt-panel";
  const STORAGE_POS = "lubanoteTextVisualPanelPosV1";
  const STORAGE_SIZE = "lubanoteTextVisualPanelSizeV1";
  let panel = null;
  let refs = {};
  let drag = null;
  let resize = null;
  let jeOtevreny = false;
  let jeMinimalizovany = false;

  function api() {
    return window.LubaNoteTextVisualTuning || null;
  }

  function povoleno() {
    return window.LubaNoteAdminTools?.isAllowed?.() === true;
  }

  function formatRem(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    return `${n.toFixed(2)} rem`;
  }

  function currentPlatform() {
    return api()?.ziskejStav?.()?.selectedPlatform ||
      (api()?.jeDesktop?.() ? "desktop" : "mobile");
  }

  function currentGroup() {
    const stav = api()?.ziskejStav?.();
    const platform = currentPlatform();
    return stav?.selectedGroup?.[platform] || "";
  }

  function platformConfig(platform) {
    return api()?.ziskejKonfig?.()?.[platform] || null;
  }

  function groupConfig(platform, groupId) {
    return platformConfig(platform)?.groups?.find((g) => g.id === groupId) || null;
  }

  function vytvorPanel() {
    if (panel) return panel;

    panel = document.createElement("section");
    panel.id = PANEL_ID;
    panel.hidden = true;
    panel.innerHTML = `
      <header class="ln-nvt-head">
        <div class="ln-nvt-title">
          <strong>🔤 Texty – živé ladění</strong>
          <small id="ln-tvt-subtitle">Načítám…</small>
        </div>
        <button id="ln-tvt-minimize" class="ln-nvt-icon" type="button" aria-label="Minimalizovat">—</button>
        <button id="ln-tvt-close" class="ln-nvt-icon" type="button" aria-label="Zavřít">×</button>
      </header>

      <div class="ln-nvt-body ln-tvt-body">
        <div class="ln-tvt-top-grid">
          <label class="ln-nvt-row">
            <span class="ln-nvt-label">Platforma</span>
            <select id="ln-tvt-platform" class="ln-nvt-select">
              <option value="mobile">Mobil / APK</option>
              <option value="desktop">PC / Desktop</option>
            </select>
          </label>

          <label class="ln-nvt-row">
            <span class="ln-nvt-label">Skupina textů</span>
            <select id="ln-tvt-group" class="ln-nvt-select"></select>
          </label>
        </div>

        <div id="ln-tvt-platform-note" class="ln-tvt-platform-note" hidden></div>
        <div id="ln-tvt-list" class="ln-tvt-list"></div>

        <div class="ln-nvt-actions ln-nvt-actions-bottom ln-tvt-actions">
          <button id="ln-tvt-reset-group" type="button">Reset skupiny</button>
          <button id="ln-tvt-reset-platform" type="button">Reset platformy</button>
          <button id="ln-tvt-copy" type="button">Kopírovat nastavení</button>
          <button id="ln-tvt-reset-all" type="button">Vše výchozí</button>
          <button id="ln-tvt-center" type="button">Panel doprostřed</button>
        </div>
      </div>
      <div id="ln-tvt-resize" class="ln-tvt-resize-handle" role="button" aria-label="Změnit velikost panelu" title="Táhni pro změnu velikosti">⌟</div>`;

    document.body.appendChild(panel);

    refs = {
      head: panel.querySelector(".ln-nvt-head"),
      subtitle: panel.querySelector("#ln-tvt-subtitle"),
      minimize: panel.querySelector("#ln-tvt-minimize"),
      close: panel.querySelector("#ln-tvt-close"),
      platform: panel.querySelector("#ln-tvt-platform"),
      group: panel.querySelector("#ln-tvt-group"),
      note: panel.querySelector("#ln-tvt-platform-note"),
      list: panel.querySelector("#ln-tvt-list"),
      resetGroup: panel.querySelector("#ln-tvt-reset-group"),
      resetPlatform: panel.querySelector("#ln-tvt-reset-platform"),
      copy: panel.querySelector("#ln-tvt-copy"),
      resetAll: panel.querySelector("#ln-tvt-reset-all"),
      center: panel.querySelector("#ln-tvt-center"),
      resize: panel.querySelector("#ln-tvt-resize")
    };

    registrujUdalosti();
    obnovPozici();
    obnovVelikost();
    render();
    return panel;
  }

  function renderGroupOptions() {
    const platform = currentPlatform();
    const cfg = platformConfig(platform);
    if (!cfg) return;
    const selected = currentGroup();
    refs.group.innerHTML = cfg.groups
      .map((group) => `<option value="${group.id}">${group.label} (${group.items.length})</option>`)
      .join("");
    refs.group.value = selected;
  }

  function controlHtml(item, value) {
    return `
      <div class="ln-tvt-control" data-text-id="${item.id}">
        <div class="ln-tvt-control-head">
          <strong>${item.label}</strong>
          <span>Pův. ${formatRem(item.vychozi)}</span>
        </div>
        <div class="ln-tvt-control-line">
          <input class="ln-tvt-range" type="range"
            min="${item.min}" max="${item.max}" step="${item.step}" value="${value}"
            data-role="range" aria-label="${item.label}">
          <input class="ln-tvt-number" type="number"
            min="${item.min}" max="${item.max}" step="${item.step}" value="${Number(value).toFixed(2)}"
            data-role="number" aria-label="${item.label} v rem">
          <span class="ln-tvt-unit">rem</span>
          <button class="ln-tvt-reset-one" type="button" data-role="reset" title="Reset této položky" aria-label="Reset ${item.label}">↺</button>
        </div>
      </div>`;
  }

  function renderList() {
    const a = api();
    const stav = a?.ziskejStav?.();
    if (!stav) return;
    const platform = currentPlatform();
    const groupId = currentGroup();
    const group = groupConfig(platform, groupId);
    if (!group) return;

    refs.list.innerHTML = group.items
      .map((item) => controlHtml(item, stav.values?.[platform]?.[item.id] ?? item.vychozi))
      .join("");

    refs.list.querySelectorAll(".ln-tvt-control").forEach((row) => {
      const id = row.dataset.textId;
      const range = row.querySelector('[data-role="range"]');
      const number = row.querySelector('[data-role="number"]');
      const reset = row.querySelector('[data-role="reset"]');

      const applyValue = (raw) => {
        if (!a?.nastavHodnotu?.(platform, id, raw)) return;
        const newValue = a.ziskejStav()?.values?.[platform]?.[id];
        if (Number.isFinite(Number(newValue))) {
          range.value = String(newValue);
          number.value = Number(newValue).toFixed(2);
        }
      };

      range.addEventListener("input", () => applyValue(range.value));
      number.addEventListener("input", () => applyValue(number.value));
      number.addEventListener("change", () => applyValue(number.value));
      reset.addEventListener("click", () => {
        a.resetPolozky?.(platform, id);
        renderList();
      });
    });
  }

  function renderPlatformNote() {
    const selected = currentPlatform();
    const real = api()?.jeDesktop?.() ? "desktop" : "mobile";
    const mismatch = selected !== real;
    refs.note.hidden = !mismatch;
    refs.note.textContent = mismatch
      ? selected === "desktop"
        ? "PC hodnoty ukládáš správně, ale živě se projeví až na PC."
        : "Mobilní hodnoty ukládáš správně, ale živě se projeví až v APK / mobilním layoutu."
      : "";
  }

  function render() {
    if (!panel) return;
    const a = api();
    const stav = a?.ziskejStav?.();
    if (!stav) return;

    const platform = currentPlatform();
    refs.platform.value = platform;
    renderGroupOptions();
    renderPlatformNote();
    renderList();

    const group = groupConfig(platform, currentGroup());
    const total = a?.ziskejPocetPolozek?.(platform) ?? 0;
    refs.subtitle.textContent = `${platformConfig(platform)?.label || platform} · ${group?.label || ""} · celkem ${total} položek`;
  }

  function prostredi() {
    try {
      if (window.Capacitor?.isNativePlatform?.()) return "APK/WebView";
    } catch (_error) {}
    return api()?.jeDesktop?.() ? "PC/Web" : "WEB/Mobil";
  }

  function tema() {
    return Array.from(document.body?.classList || []).find((x) => x.startsWith("theme-")) || "theme-neznámé";
  }

  function vytvorExport() {
    const stav = api()?.ziskejStav?.() || {};
    return [
      "LUBANOTE TEXT VISUAL LAB EXPORT",
      `verze: ${window.LUBANOTE_VERSION || "DEV"}`,
      `prostředí: ${prostredi()}`,
      `téma: ${tema()}`,
      `čas: ${new Date().toISOString()}`,
      "jednotky: rem",
      "",
      "AKTUÁLNÍ NASTAVENÍ:",
      JSON.stringify(api()?.ziskejEfektivniHodnoty?.() || { mobile: {}, desktop: {} }, null, 2)
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
    try {
      ok = document.execCommand("copy");
    } catch (_error) {
      ok = false;
    }
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
    const old = refs.copy.textContent;
    refs.copy.textContent = ok ? "Zkopírováno ✓" : "Kopírování selhalo";
    setTimeout(() => {
      if (refs.copy) refs.copy.textContent = old;
    }, 1400);
  }

  function registrujUdalosti() {
    refs.close.addEventListener("click", zavri);
    refs.minimize.addEventListener("click", () => {
      jeMinimalizovany = !jeMinimalizovany;
      panel.classList.toggle("ln-nvt-minimized", jeMinimalizovany);
      refs.minimize.textContent = jeMinimalizovany ? "+" : "—";
    });

    refs.platform.addEventListener("change", () => {
      api()?.nastavPlatform?.(refs.platform.value);
      render();
    });

    refs.group.addEventListener("change", () => {
      api()?.nastavSkupinu?.(currentPlatform(), refs.group.value);
      render();
    });

    refs.resetGroup.addEventListener("click", () => {
      api()?.resetSkupiny?.(currentPlatform(), currentGroup());
      render();
    });

    refs.resetPlatform.addEventListener("click", () => {
      api()?.resetPlatformy?.(currentPlatform());
      render();
    });

    refs.resetAll.addEventListener("click", () => {
      api()?.resetVse?.();
      render();
    });

    refs.copy.addEventListener("click", zkopirujNastaveni);
    refs.center.addEventListener("click", vycentruj);

    refs.head.addEventListener("pointerdown", zacniDrag);
    refs.resize?.addEventListener("pointerdown", zacniResize);
    window.addEventListener("pointermove", tahni);
    window.addEventListener("pointermove", menVelikost);
    window.addEventListener("pointerup", ukonciDrag);
    window.addEventListener("pointerup", ukonciResize);
    window.addEventListener("pointercancel", ukonciDrag);
    window.addEventListener("pointercancel", ukonciResize);
    window.addEventListener("resize", () => {
      renderPlatformNote();
      omezDoViewportu();
    });
    window.addEventListener("lubanote:text-visual-tuning-change", () => {
      if (jeOtevreny) aktualizujHodnotyBezPrekresleni();
    });
  }

  function aktualizujHodnotyBezPrekresleni() {
    const stav = api()?.ziskejStav?.();
    if (!stav || !panel) return;
    const platform = currentPlatform();
    panel.querySelectorAll(".ln-tvt-control").forEach((row) => {
      const id = row.dataset.textId;
      const value = stav.values?.[platform]?.[id];
      if (!Number.isFinite(Number(value))) return;
      const range = row.querySelector('[data-role="range"]');
      const number = row.querySelector('[data-role="number"]');
      if (range) range.value = String(value);
      if (number && document.activeElement !== number) number.value = Number(value).toFixed(2);
    });
  }

  function zavriOstatniPanely() {
    window.LubaNoteNotesVisualPanel?.close?.();
    window.LubaNotePlannerVisualPanel?.close?.();
    window.LubaNoteDocumentsVisualPanel?.close?.();
    window.LubaNoteDesktopNotesVisualPanel?.close?.();
    window.LubaNoteDesktopPlannerVisualPanel?.close?.();
  }

  function otevriZAdmina() {
    if (!povoleno()) return false;
    zavriOstatniPanely();
    const ok = otevri();
    if (ok) {
      document.getElementById("closeAdminDashboardButton")?.click?.();
    }
    return ok;
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
    const width = panel?.offsetWidth || 0;
    const visibleX = Math.min(80, Math.max(56, Math.round(width * 0.18)));
    const visibleY = 48;
    return {
      minX: Math.min(0, visibleX - width),
      maxX: Math.max(0, window.innerWidth - visibleX),
      minY: 0,
      maxY: Math.max(0, window.innerHeight - visibleY)
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

  function zacniResize(event) {
    if (!panel || (event.button !== undefined && event.button !== 0)) return;
    const rect = panel.getBoundingClientRect();
    resize = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      width: rect.width,
      height: rect.height
    };
    panel.classList.add("ln-tvt-resizing", "ln-tvt-custom-size");
    refs.resize?.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }

  function menVelikost(event) {
    if (!resize || event.pointerId !== resize.pointerId || !panel) return;
    const rect = panel.getBoundingClientRect();
    const minWidth = Math.min(300, Math.max(260, window.innerWidth - 16));
    const maxWidth = Math.max(minWidth, window.innerWidth - Math.max(8, rect.left));
    const minHeight = 210;
    const maxHeight = Math.max(minHeight, window.innerHeight - Math.max(8, rect.top));
    const width = Math.max(minWidth, Math.min(maxWidth, resize.width + event.clientX - resize.startX));
    const height = Math.max(minHeight, Math.min(maxHeight, resize.height + event.clientY - resize.startY));
    panel.style.width = `${Math.round(width)}px`;
    panel.style.height = `${Math.round(height)}px`;
    panel.style.maxHeight = "none";
    event.preventDefault();
  }

  function ukonciResize(event) {
    if (!resize || (event && event.pointerId !== resize.pointerId)) return;
    resize = null;
    panel?.classList.remove("ln-tvt-resizing");
    ulozVelikost();
  }

  function ulozVelikost() {
    if (!panel || !panel.classList.contains("ln-tvt-custom-size")) return;
    try {
      const rect = panel.getBoundingClientRect();
      localStorage.setItem(STORAGE_SIZE, JSON.stringify({ width: rect.width, height: rect.height }));
    } catch (_error) {}
  }

  function obnovVelikost() {
    if (!panel) return;
    try {
      const raw = localStorage.getItem(STORAGE_SIZE);
      if (!raw) return;
      const size = JSON.parse(raw);
      if (!Number.isFinite(size?.width) || !Number.isFinite(size?.height)) return;
      panel.classList.add("ln-tvt-custom-size");
      panel.style.width = `${Math.round(size.width)}px`;
      panel.style.height = `${Math.round(size.height)}px`;
      panel.style.maxHeight = "none";
    } catch (_error) {}
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
    let rect = panel.getBoundingClientRect();
    if (panel.classList.contains("ln-tvt-custom-size")) {
      const maxWidth = Math.max(260, window.innerWidth - 16);
      const maxHeight = Math.max(210, window.innerHeight - 16);
      if (rect.width > maxWidth) panel.style.width = `${Math.round(maxWidth)}px`;
      if (rect.height > maxHeight) panel.style.height = `${Math.round(maxHeight)}px`;
      rect = panel.getBoundingClientRect();
    }
    const lim = hranicePanelu();
    panel.style.left = `${Math.min(lim.maxX, Math.max(lim.minX, rect.left))}px`;
    panel.style.top = `${Math.min(lim.maxY, Math.max(lim.minY, rect.top))}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
  }

  function vycentruj() {
    if (!panel) return;
    const left = Math.max(8, (window.innerWidth - panel.offsetWidth) / 2);
    const top = Math.max(8, Math.min(96, (window.innerHeight - panel.offsetHeight) / 2));
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
    render();
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

  window.LubaNoteTextVisualPanel = {
    open: otevri,
    close: zavri,
    toggle: prepni,
    isOpen: () => jeOtevreny,
    refresh: render,
    center: vycentruj
  };

  function bindAdminButton() {
    const button = document.getElementById("adminTextVisualToolButton");
    if (!button || button.dataset.lnTextBound === "1") return;
    button.dataset.lnTextBound = "1";
    button.addEventListener("click", otevriZAdmina);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindAdminButton, { once: true });
  } else {
    bindAdminButton();
  }
})();
