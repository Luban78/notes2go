/* 691BJ – LubaKeyboard: immediate pressed-letter preview.
 * Overlay only. Does NOT enter text, alter prediction, caret, selection,
 * long-press character variants, keyboard layout or sync.
 * Loaded after lubaKeyboard.js; no changes to its event handling.
 */
(() => {
  "use strict";
  const STYLE_ID = "ln-lk-preview-style-691BJ";
  const PREVIEW_ID = "ln-lk-press-preview-691BJ";

  const css = `
    #${PREVIEW_ID}[hidden] { display: none !important; }
    #${PREVIEW_ID} {
      position: fixed;
      z-index: 2147482550;
      pointer-events: none !important;
      user-select: none;
      -webkit-user-select: none;
      box-sizing: border-box;
      display: grid;
      place-items: center;
      height: 56px;
      padding: 3px;
      border-radius: 13px 13px 9px 9px;
      border: 1px solid var(--color-accent, #7444dc);
      background: var(--color-surface, #272130);
      background: color-mix(in srgb, var(--color-accent, #7444dc) 65%, var(--color-surface, #272130));
      color: #fff;
      font: 650 28px/1 system-ui, sans-serif;
      box-shadow: 0 7px 17px rgba(0,0,0,.35);
      transform: translate(-50%, -100%);
      -webkit-transform: translate(-50%, -100%);
    }
    #${PREVIEW_ID}::after {
      content: "";
      position: absolute;
      left: calc(50% - 6px);
      bottom: -5px;
      width: 10px;
      height: 10px;
      background: inherit;
      transform: rotate(45deg);
      border-radius: 1px;
    }

    /* The original :active may linger after pointerup in Android WebView.
       For text keys, use our synchronous pressed class instead. */
    #lubaKeyboard .ln-lk-key[data-lk-action="text"]:active:not(.ln-lk-preview-pressed) {
      background: var(--color-surface, #272130) !important;
      background: linear-gradient(180deg,
        color-mix(in srgb, var(--color-surface, #272130) 84%, white 8%),
        color-mix(in srgb, var(--color-surface, #272130) 96%, #000 4%)) !important;
      color: var(--color-text, #fff) !important;
      transform: none !important;
    }
    #lubaKeyboard .ln-lk-key[data-lk-action="text"].ln-lk-preview-pressed {
      background: var(--color-accent, #7444dc) !important;
      background: color-mix(in srgb, var(--color-accent, #7444dc) 58%, var(--color-surface, #222)) !important;
      color: #fff !important;
      transform: translateY(1px);
    }
  `;

  function init() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);

    const bubble = document.createElement("div");
    bubble.id = PREVIEW_ID;
    bubble.hidden = true;
    bubble.setAttribute("aria-hidden", "true");
    document.body.appendChild(bubble);

    let pressed = null;
    let pointerId = null;
    let longPressTimer = null;

    function clearPreview() {
      if (longPressTimer !== null) clearTimeout(longPressTimer);
      longPressTimer = null;
      pressed?.classList.remove("ln-lk-preview-pressed");
      pressed = null;
      pointerId = null;
      bubble.hidden = true;
      bubble.textContent = "";
    }

    document.addEventListener("pointerdown", event => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const key = target.closest("#lubaKeyboard .ln-lk-key[data-lk-action='text']");
      if (!key) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (event.pointerType === "touch" && !event.isPrimary) return;
      const panel = document.getElementById("lubaKeyboard");
      if (!panel || panel.hidden) return;

      clearPreview();
      const value = String(key.dataset.lkValue || "");
      if (!value || Array.from(value).length > 2) return;
      const r = key.getBoundingClientRect();
      if (r.width < 12 || r.height < 12) return;

      pressed = key;
      pointerId = event.pointerId;
      bubble.textContent = value;
      bubble.style.width = Math.max(42, Math.min(74, r.width + 15)) + "px";
      bubble.style.left = (r.left + r.width / 2) + "px";
      bubble.style.top = Math.max(65, r.top - 8) + "px";
      key.classList.add("ln-lk-preview-pressed");
      bubble.hidden = false;
      // The existing alternate-character popup starts after 420 ms.
      // Hide the simple key preview before that popup is presented.
      longPressTimer = setTimeout(clearPreview, 390);
    }, { capture: true, passive: true });

    // Capture phase precedes LubaKeyboard's own pointerup handler, which
    // writes the character into the editor. Never show a delayed flash.
    document.addEventListener("pointerup", event => {
      if (pointerId === event.pointerId) clearPreview();
    }, true);
    document.addEventListener("pointercancel", event => {
      if (pointerId === event.pointerId) clearPreview();
    }, true);
    window.addEventListener("blur", clearPreview);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) clearPreview();
    });
    window.addEventListener("lubanote:luba-keyboard-state", event => {
      if (event.detail?.open === false) clearPreview();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
