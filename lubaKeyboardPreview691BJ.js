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


/* 691BK/691BL – Move overlay UX (visual-only), separate from 691BJ keyboard code.
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

    /* 691BL: A new tap must first MOVE the model caret before we display it.
       Core V2 processes own-caret taps on touchend, then draws in rAF.
       Releasing our visibility guard on pointerdown exposed the OLD handle
       for a frame (691BK regression). Gesture/model code is untouched. */
    let pendingTap691BL = null;
    let restoreEpoch691BL = 0;
    const isSuspended691BL = () => document.body.classList.contains(SUSPEND_CLASS);
    const getCaretRange691BL = (editor) => {
      const selection = window.getSelection();
      if (!selection?.rangeCount || !selection.isCollapsed) return null;
      const range = selection.getRangeAt(0);
      if (!editor?.contains(range.startContainer)) return null;
      return { node: range.startContainer, offset: range.startOffset, range };
    };
    const textEditor691BL = (target) => {
      const element = target?.nodeType === 3 ? target.parentElement : target;
      if (!(element instanceof Element)) return null;
      const editor = element.closest('.ln-v2-editor');
      if (!editor || editor.classList.contains('ln-v2-list-drag-mode')) return null;
      if (element.closest('button, figure, img, input, textarea, select, a[href], .noteInternalLink, .plannedTextLink, .ln-v2-odkaz, [data-v2-list-marker], [data-v2-list-toggle], [data-v2-todo-check], [contenteditable="false"]')) return null;
      return editor;
    };
    function resumeAfterReposition691BL(tap) {
      if (!tap) return;
      const epoch = ++restoreEpoch691BL;
      const check = (retries) => {
        requestAnimationFrame(() => {
          if (epoch !== restoreEpoch691BL || !isSuspended691BL() ||
              !tap.editor.isConnected || tap.editor.classList.contains('ln-v2-list-drag-mode')) return;
          const state = getCaretRange691BL(tap.editor);
          if (!state) return;
          const moved = !tap.before || state.node !== tap.before.node || state.offset !== tap.before.offset;
          let near = false;
          try {
            const rect = state.range.getBoundingClientRect();
            near = Math.abs(rect.left - tap.x) < 42 &&
              Math.abs(rect.top + rect.height / 2 - tap.y) < 38;
          } catch (_error) {}
          if (!moved && !near) return; // Do not reveal the old caret.

          /* The Android own caret is attached to its current paragraph in
             Core V2's rAF. Wait until that paragraph matches the new Range. */
          if (tap.editor.dataset.lnV2OwnCaretOnly === '1') {
            const nodeEl = state.node.nodeType === 3 ? state.node.parentElement : state.node;
            const selectedRow = nodeEl?.closest?.('[data-ln-v2-blok]');
            const caretEl = document.querySelector('.ln-v2-luba-caret');
            const caretRow = caretEl?.closest?.('[data-ln-v2-blok]');
            if (!selectedRow || !caretEl || caretEl.hidden || caretRow !== selectedRow) {
              if (retries > 0) check(retries - 1);
              return;
            }
          }
          document.body.classList.remove(SUSPEND_CLASS);
        });
      };
      /* Two frames: first lets Core V2 commit the new model position,
         second lets its visual caret/handle catch up. */
      requestAnimationFrame(() => check(4));
    }

    document.addEventListener('lubanote:v2-list-move-takeover', () => {
      restoreEpoch691BL++;
      pendingTap691BL = null;
    });

    document.addEventListener('touchstart', event => {
      pendingTap691BL = null;
      if (!isSuspended691BL() || event.touches?.length !== 1 ||
          event.changedTouches?.length !== 1) return;
      const editor = textEditor691BL(event.target);
      if (!editor) return;
      const touch = event.changedTouches[0];
      pendingTap691BL = { editor, id: touch.identifier, x: touch.clientX,
        y: touch.clientY, scroll: editor.scrollTop, at: performance.now(),
        before: getCaretRange691BL(editor) };
    }, { capture: true, passive: true });

    document.addEventListener('touchend', event => {
      const tap = pendingTap691BL;
      pendingTap691BL = null;
      if (!tap || !isSuspended691BL()) return;
      const touch = Array.from(event.changedTouches || [])
        .find(item => item.identifier === tap.id);
      if (!touch || event.touches?.length ||
          performance.now() - tap.at > 330 ||
          Math.hypot(touch.clientX - tap.x, touch.clientY - tap.y) > 12 ||
          Math.abs(tap.editor.scrollTop - tap.scroll) > 3 ||
          !textEditor691BL(event.target)) return;
      resumeAfterReposition691BL(tap);
    }, { capture: true, passive: true });
    document.addEventListener('touchcancel', () => {
      pendingTap691BL = null;
    }, { capture: true, passive: true });

    /* Desktop mouse: editor selection is processed on click. Same guard. */
    let mouseTap691BL = null;
    document.addEventListener('pointerdown', event => {
      if (event.pointerType === 'touch' || event.button !== 0 || !isSuspended691BL()) return;
      const editor = textEditor691BL(event.target);
      mouseTap691BL = editor ? {editor, x:event.clientX, y:event.clientY,
        at:performance.now(), before:getCaretRange691BL(editor)} : null;
    }, true);
    document.addEventListener('click', event => {
      const tap = mouseTap691BL;
      mouseTap691BL = null;
      if (!tap || !isSuspended691BL() || !textEditor691BL(event.target) ||
          Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 12 ||
          performance.now() - tap.at > 330) return;
      resumeAfterReposition691BL(tap);
    }, false);

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
