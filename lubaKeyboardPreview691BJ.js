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


/* 691BK – Move overlay UX (visual-only), separate from 691BJ keyboard code.
 * The index.html already loads this module; do not touch Core V2 gesture
 * recognizers, note model, selection or persistence.
 *  - Suppress the own caret/handles from long-press MOVE takeover until
 *    the next genuine input gesture.
 *  - Clamp the visual drag label to screen and ellipsize long ToDo text.
 */
(() => {
  'use strict';
  const STYLE_ID = 'ln-v2-move-ux-style-691BK';
  const SUSPEND_CLASS = 'ln-v2-move-caret-suspended-691BK';
  const TEXT_CLASS = 'ln-v2-drag-label-text-691BK';
  const SELECTOR = '.ln-v2-list-drag-preview';

  function init() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      body.${SUSPEND_CLASS} .ln-v2-luba-caret,
      body.${SUSPEND_CLASS} .ln-v2-single-caret-handle,
      body.${SUSPEND_CLASS} .ln-v2-selection-handle-custom,
      body.${SUSPEND_CLASS} .ln-v2-selection-magnifier {
        display: none !important;
        visibility: hidden !important;
      }
      ${SELECTOR} {
        box-sizing: border-box !important;
        width: max-content !important;
        max-width: min(76vw, 360px, calc(100vw - 24px)) !important;
        white-space: normal !important;
        overflow: visible !important; /* action label ::after stays visible */
      }
      ${SELECTOR} > .${TEXT_CLASS} {
        display: block;
        min-width: 0;
        max-width: 100%;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
    `;
    document.head.appendChild(style);

    // This event is already emitted by the shipped Core V2 at LONGPRESS_READY,
    // before the first drag movement. Does not change model or gesture handling.
    document.addEventListener('lubanote:v2-list-move-takeover', () => {
      document.body.classList.add(SUSPEND_CLASS);
    });

    document.addEventListener('pointerdown', event => {
      if (!document.body.classList.contains(SUSPEND_CLASS)) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (event.pointerType === 'touch' && !event.isPrimary) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const editor = target.closest('.ln-v2-editor');
      // Never re-enable during the current MOVE gesture or on its release.
      if (editor && !editor.classList.contains('ln-v2-list-drag-mode')) {
        document.body.classList.remove(SUSPEND_CLASS);
      } else if (target.closest('#lubaKeyboard') &&
                 !document.querySelector('.ln-v2-editor.ln-v2-list-drag-mode')) {
        // Typing a new character is also a deliberate request for a caret.
        document.body.classList.remove(SUSPEND_CLASS);
      }
    }, true);

    let preview = null;
    let previewObserver = null;
    function fitPreview() {
      if (!preview || !preview.isConnected || preview.hidden) return;
      const already = preview.children.length === 1 &&
        preview.firstElementChild?.classList.contains(TEXT_CLASS);
      if (!already) {
        // Core V2 writes only preview.textContent, never HTML. Keep it that way.
        const span = document.createElement('span');
        span.className = TEXT_CLASS;
        span.textContent = preview.textContent;
        preview.replaceChildren(span);
      }
      const r = preview.getBoundingClientRect();
      const viewportWidth = Math.min(window.innerWidth, document.documentElement.clientWidth);
      if (!(r.width > 0 && viewportWidth > 40)) return;
      const margin = 9;
      let delta = 0;
      if (r.left < margin) delta = margin - r.left;
      else if (r.right > viewportWidth - margin) delta = viewportWidth - margin - r.right;
      const old = Number.parseFloat(preview.style.left);
      if (Math.abs(delta) > 0.75 && Number.isFinite(old)) {
        const next = old + delta;
        if (Math.abs(next - old) > 0.75) preview.style.left = `${next.toFixed(1)}px`;
      }
    }
    function connectPreview() {
      const found = document.querySelector(SELECTOR);
      if (!found || found === preview) return;
      previewObserver?.disconnect();
      preview = found;
      previewObserver = new MutationObserver(fitPreview);
      previewObserver.observe(preview, {
        attributes: true,
        attributeFilter: ['style', 'class', 'hidden'],
        childList: true
      });
      fitPreview();
    }
    connectPreview();
    // Core V2 creates the drag preview lazily on the first MOVE. Watch only
    // direct body children; no editor mutation observation or polling.
    const finder = new MutationObserver(connectPreview);
    finder.observe(document.body, {childList: true});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, {once: true});
  } else {
    init();
  }
})();
