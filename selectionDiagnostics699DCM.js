/* 699D-CM – pasivní a obsahově bezpečná diagnostika mobilního výběru.
 * Společná pro APK i PWA. Bez načítání textu, identit, ID, sítě a úložiště.
 * Žádné preventDefault, změny focusu, selection ani časování editoru. */
(() => {
  "use strict";
  if (window.LubaNoteSelectionDiag699DCM) return;

  const START = performance.now();
  const MAX = 100;
  const zaznamy = [];
  let posledniPointer = null;
  let posledniTap = null;
  let posledniVyber = 0;
  let posledniMenu = 0;
  let posledniEngine = 0;
  let vyberTimer = null;

  function editor() {
    const modal = document.getElementById("taskModal");
    if (!modal || modal.hidden || !modal.classList.contains("show")) return null;
    const aktivni = window.LubaNoteEditorV2?.ziskejEditorElement?.();
    return aktivni?.isConnected && modal.contains(aktivni) ? aktivni : null;
  }

  function typCile(cil, aktivniEditor) {
    const el = cil?.nodeType === 1 ? cil : cil?.parentElement;
    if (!el?.closest) return "other";
    if (el.closest(".ln-v2-selection-handle-custom")) return "selection-handle";
    if (el.closest(".ln-v2-single-caret-handle")) return "caret-handle";
    if (el.closest("#selectionMenu")) return "selection-menu";
    if (el.closest(".ln-luba-keyboard")) return "luba-keyboard";
    if (el.closest(".ln-v2-obrazek,figure,img")) return "image";
    if (el.closest("[data-v2-list-marker],[data-v2-list-toggle],[data-v2-todo-check]")) return "list-control";
    if (el.closest("button,input,textarea,select,a[href]")) return "control";
    if (aktivniEditor?.contains(el)) return "editor-text";
    return "other";
  }

  function vyberStav(aktivniEditor) {
    try {
      const sel = window.getSelection?.();
      if (!sel?.rangeCount) return "none";
      const range = sel.getRangeAt(0);
      if (aktivniEditor && (!aktivniEditor.contains(range.startContainer) ||
          !aktivniEditor.contains(range.endContainer))) return "outside";
      return range.collapsed ? "caret" : "range";
    } catch (_) { return "error"; }
  }

  function snapshot() {
    const ed = editor();
    const menu = document.getElementById("selectionMenu");
    const klavesnice = document.querySelector(".ln-luba-keyboard:not([hidden])");
    const pocetUchytu = document.querySelectorAll(".ln-v2-selection-handle-custom:not([hidden])").length;
    const bridge = window.LubaNoteEditorV2Bridge?.diagnostikaVyberu699DCM?.() || {};
    return [
      `editor=${ed ? "Y" : "N"}`,
      `native=${vyberStav(ed)}`,
      `custom=${ed?.classList.contains("ln-v2-selection-custom-active") ? "Y" : "N"}`,
      `handles=${pocetUchytu}`,
      `ownCaret=${ed?.dataset?.lnV2OwnCaretOnly === "1" ? "Y" : "N"}`,
      `editable=${ed?.getAttribute("contenteditable") || "-"}`,
      `menu=${!menu ? "none" : menu.hidden ? "hidden" : menu.dataset.lnV2Owner === "1" ? "v2" : "other"}`,
      `expanded=${menu?.classList.contains("selectionMenuRozsirene") ? "Y" : "N"}`,
      `keyboard=${klavesnice ? "Y" : "N"}`,
      `eligible=${bridge.mobileEligible === true ? "Y" : "N"}`,
      `desktop=${bridge.desktop === true ? "Y" : "N"}`,
      `highlight=${bridge.highlight === true ? "Y" : "N"}`,
      `range=${bridge.customRange === true ? "Y" : "N"}`,
      `drag=${bridge.handleDrag === true ? "Y" : "N"}`,
      `blocked=${bridge.menuBlocked === true ? "Y" : "N"}`,
      `move=${bridge.listMove === true ? "Y" : "N"}`,
      `cooldown=${Math.max(0, Math.round(Number(bridge.cooldownMs) || 0))}`
    ].join(" ");
  }

  function zapis(kod, detail = "") {
    const zaznam = {
      at: Math.round(performance.now() - START),
      kod: String(kod || "EVENT").replace(/[^A-Z0-9_\-]/gi, "_").slice(0, 50),
      // Interní detaily smí obsahovat jen pevné technické kódy/čísla.
      detail: String(detail || "").replace(/[^A-Za-z0-9_ =:.,|\/-]/g, "").slice(0, 130),
      stav: snapshot()
    };
    zaznamy.push(zaznam);
    if (zaznamy.length > MAX) zaznamy.shift();
  }

  function vEditoru(cil) {
    const ed = editor();
    return Boolean(ed && (ed.contains(cil) ||
      (cil?.nodeType === 1 && typCile(cil, ed) === "selection-handle")));
  }

  document.addEventListener("pointerdown", (ev) => {
    if (!vEditoru(ev.target)) return;
    posledniPointer = { id: ev.pointerId, at: performance.now(), x: ev.clientX, y: ev.clientY };
    zapis("POINTER_DOWN", `type=${ev.pointerType || "-"} target=${typCile(ev.target, editor())} cancelable=${ev.cancelable ? 1 : 0}`);
  }, { capture: true, passive: true });

  document.addEventListener("pointerup", (ev) => {
    if (!vEditoru(ev.target)) return;
    const ted = performance.now();
    const prvni = posledniPointer?.id === ev.pointerId ? posledniPointer : null;
    posledniPointer = null;
    const hold = prvni ? Math.round(ted - prvni.at) : -1;
    const move = prvni ? Math.round(Math.hypot(ev.clientX - prvni.x, ev.clientY - prvni.y)) : -1;
    const dt = posledniTap && posledniTap.typ === ev.pointerType ? Math.round(ted - posledniTap.at) : -1;
    if (hold >= 0 && hold < 350 && move >= 0 && move < 14) posledniTap = { typ: ev.pointerType, at: ted };
    else posledniTap = null;
    zapis("POINTER_UP", `type=${ev.pointerType || "-"} hold=${hold} move=${move} between=${dt} target=${typCile(ev.target, editor())}`);
  }, { capture: true, passive: true });

  document.addEventListener("pointercancel", (ev) => {
    if (!vEditoru(ev.target)) return;
    posledniPointer = null;
    zapis("POINTER_CANCEL", `type=${ev.pointerType || "-"}`);
  }, { capture: true, passive: true });

  for (const typ of ["touchstart", "touchend", "touchcancel", "dblclick", "contextmenu", "selectstart"]) {
    document.addEventListener(typ, (ev) => {
      if (!vEditoru(ev.target)) return;
      zapis(typ.toUpperCase(), `target=${typCile(ev.target, editor())} touches=${ev.touches?.length ?? "-"} prevented=${ev.defaultPrevented ? 1 : 0}`);
    }, { capture: true, passive: true });
  }

  for (const typ of ["focusin", "focusout"]) {
    document.addEventListener(typ, ev => {
      if (vEditoru(ev.target)) zapis(typ.toUpperCase(), `target=${typCile(ev.target, editor())}`);
    }, { capture: true, passive: true });
  }

  window.visualViewport?.addEventListener("resize", () => {
    if (editor()) zapis("VISUAL_VIEWPORT_RESIZE",
      `width=${Math.round(window.visualViewport.width)} height=${Math.round(window.visualViewport.height)}`);
  }, { passive: true });

  document.addEventListener("selectionchange", () => {
    const ed = editor();
    if (!ed) return;
    const stav = vyberStav(ed);
    const ted = performance.now();
    if (stav !== "range" && (!posledniTap || ted - posledniTap.at > 650)) return;
    if (ted - posledniVyber > 90) {
      posledniVyber = ted;
      zapis("SELECTION_CHANGE");
    }
    if (vyberTimer) clearTimeout(vyberTimer);
    vyberTimer = setTimeout(() => {
      vyberTimer = null;
      if (editor()) zapis("SELECTION_SETTLED_180MS");
    }, 180);
  }, { passive: true });

  document.addEventListener("lubanote:v2-selection-debug-state", (ev) => {
    const ted = performance.now();
    if (ted - posledniEngine < 150) return;
    posledniEngine = ted;
    const d = ev.detail || {};
    zapis("BRIDGE_ENGINE", `engine=${String(d.engine || "-").slice(0,12)} drag=${d.dragging ? 1 : 0} side=${String(d.side || "-").slice(0,7)}`);
  });

  const menu = document.getElementById("selectionMenu");
  if (menu && typeof MutationObserver === "function") {
    new MutationObserver(() => {
      if (!editor() || performance.now() - posledniMenu < 90) return;
      posledniMenu = performance.now();
      // Rozměry měříme jen při změně menu, nikdy v každém vstupním dotyku.
      let overlap = "-";
      if (!menu.hidden) {
        const r = menu.getBoundingClientRect();
        const uchyty = document.querySelectorAll(".ln-v2-selection-handle-custom:not([hidden])");
        overlap = Array.from(uchyty).some(el => {
          const h = el.getBoundingClientRect();
          return h.width > 0 && h.height > 0 && h.left < r.right && h.right > r.left &&
            h.top < r.bottom && h.bottom > r.top;
        }) ? "Y" : "N";
      }
      zapis("MENU_CHANGED", `overlap=${overlap}`);
    }).observe(menu, { attributes: true, attributeFilter: ["hidden", "class", "style"] });
    menu.addEventListener("click", (ev) => {
      if (!editor()) return;
      const action = ev.target?.closest?.("#selectionVice") ? "more" :
        ev.target?.closest?.("#selectionZpet") ? "back" : "action";
      zapis("MENU_CLICK", `action=${action}`);
    }, { capture: true, passive: true });
  }

  function report() {
    const pwa = window.matchMedia?.("(display-mode: standalone)")?.matches === true;
    const coarse = window.matchMedia?.("(pointer: coarse)")?.matches === true;
    const fine = window.matchMedia?.("(hover: hover) and (pointer: fine)")?.matches === true;
    const android = /Android/i.test(String(navigator.userAgent || ""));
    const apk = document.body?.classList?.contains("nativeApp") === true;
    const chrome = String(navigator.userAgent || "").match(/(?:Chrome|Chromium)\/(\d+)/i)?.[1] || "-";
    return [
      "LUBANOTE 699D-CM – VYBER TEXTU",
      `verze=${window.LUBANOTE_VERSION || "-"} cas=${new Date().toISOString()}`,
      `rezim=${apk ? "APK" : pwa ? "PWA" : "WEB"} android=${android ? "Y" : "N"} chrome=${chrome} pointerCoarse=${coarse ? "Y" : "N"} desktopFine=${fine ? "Y" : "N"}`,
      `CSS.highlights=${window.CSS?.highlights ? "Y" : "N"} Highlight=${typeof window.Highlight === "function" ? "Y" : "N"} caretFromPoint=${typeof document.caretPositionFromPoint === "function" ? "Y" : "N"}`,
      `aktualniStav: ${snapshot()}`,
      `udalosti: ${zaznamy.length}/${MAX}`,
      "---",
      ...(zaznamy.length ? zaznamy.map(z => `${String(z.at).padStart(7)}ms | ${z.kod} | ${z.detail} | ${z.stav}`) : ["Zatim zadne dotyky v otevrenem Core V2 editoru. Otevri poznamku a zopakuj vyber."]),
      "---",
      "Bez obsahu poznamek, nazvu, ID, uctu, hesel a tokenu. Pouze pasivni mereni."
    ].join("\n");
  }

  window.LubaNoteSelectionDiag699DCM = Object.freeze({ report, zapis });
})();
