/* 699U – dočasná read-only diagnostika dotykové odezvy LubaKeyboard.
 * Pouze poslouchá události a čte stav stávající 691BJ bubliny.
 * Nevypíná duchy, neupravuje styly kláves, nic nevkládá do editoru.
 * Není součástí finálního vydání: odebrat při vyhodnocení diagnostiky.
 */
(() => {
  'use strict';
  const PREVIEW_ID = 'ln-lk-press-preview-691BJ';
  const STYLE_ID = 'ln-lk-699u-style';
  const BOX_ID = 'ln-lk-699u-info';
  let active = null;
  let bubble = null;
  let box = null;
  let keyWatcher = null;
  let pendingWrite = false;
  const now = () => performance.now();
  const rel = (t, start) => t == null || start == null ? '—' : Math.round(t - start) + ' ms';
  const lag = (ev) => {
    const d = now() - ev.timeStamp;
    return Number.isFinite(d) && d >= -2 && d < 10000 ? Math.max(0, Math.round(d)) + ' ms' : 'n/a';
  };
  const keyName = (k) => String(k?.dataset?.lkValue || '?').slice(0, 3);
  function isVisible() { return Boolean(bubble && !bubble.hidden); }
  function keyIsDown(s) { return Boolean(s?.key?.classList?.contains('ln-lk-preview-pressed')); }
  function screenLine() {
    const s = active;
    if (!s) return '699U · Stiskni písmeno a pusť prst.\nMěřím uvolnění a zmizení ducha, FPS neměním.';
    const release = s.pointerUp ?? s.touchEnd ?? s.cancel;
    const releaseText = release == null ? 'ZATÍM NENÍ' : rel(release, s.down);
    const hideText = s.hide == null ? 'ZATÍM NE' : `${rel(s.hide, s.down)} (od uvolnění ${rel(s.hide, release)})`;
    const upLag = s.pointerLag || s.touchLag || '—';
    const rafText = s.frame1 == null ? 'čekám' : rel(s.frame1, release);
    const on = isVisible() ? 'VIDITELNÝ' : 'SKRYTÝ';
    const pressed = keyIsDown(s) ? 'ZAPNUTÉ' : 'VYPNUTÉ';
    return '699U  klávesa ' + s.name + ' · prst puštěn: ' + releaseText +
      '\nUP událost: ' + (s.pointerUp ? 'pointerup' : s.touchEnd ? 'touchend' : s.cancel ? 'cancel' : 'žádná') + ' · zpoždění vstupu: ' + upLag +
      '\nDuch SKRYT: ' + hideText + ' · 1. RAF: ' + rafText +
      '\nStav NYNÍ: duch ' + on + ' · stisk ' + pressed + (s.relit ? ' · ZNOVU ZAPNUTO!' : '') +
      '\nSled: ' + s.events.slice(-8).join(' > ');
  }
  function write() { if (box) box.textContent = screenLine(); }
  function scheduleWrite() {
    if (pendingWrite) return;
    pendingWrite = true;
    requestAnimationFrame(() => { pendingWrite = false; write(); });
  }
  function stamp(s, name, time) {
    if (!s) return;
    s.events.push(name + (time == null ? '' : ':' + rel(time, s.down)));
    if (s.events.length > 16) s.events.shift();
  }
  function watchKey(s) {
    keyWatcher?.disconnect();
    keyWatcher = new MutationObserver(() => {
      if (active !== s) return;
      if ((s.pointerUp != null || s.touchEnd != null) && keyIsDown(s)) s.relit = true;
      scheduleWrite();
    });
    keyWatcher.observe(s.key, { attributes: true, attributeFilter: ['class'] });
  }
  function finishInput(kind, ev) {
    const s = active;
    if (!s) return;
    if (kind.startsWith('P') && s.pointerId !== ev.pointerId) return;
    if (kind.startsWith('T') && s.touchId != null &&
        !Array.from(ev.changedTouches || []).some(t => t.identifier === s.touchId)) return;
    if (kind.startsWith('T') && s.touchId == null && ev.touches?.length !== 0) return;
    const t = now();
    if (kind === 'P↑' && s.pointerUp == null) { s.pointerUp = t; s.pointerLag = lag(ev); }
    if (kind === 'T↑' && s.touchEnd == null) { s.touchEnd = t; s.touchLag = lag(ev); }
    if ((kind === 'P×' || kind === 'T×') && s.cancel == null) s.cancel = t;
    stamp(s,kind,t);
    // 691BJ's window capture handlers were registered before 699U.
    // They should have hidden the ghost already at this exact moment.
    if (!isVisible() && s.hide == null && s.show != null) s.hide = t;
    const release = s.pointerUp ?? s.touchEnd ?? s.cancel;
    // RAF is the beginning of a render frame, not proof of actual pixel presentation.
    if (release != null && !s.rafScheduled) {
      s.rafScheduled = true;
      requestAnimationFrame(() => {
        s.frame1 = now();
        if (active !== s) return;
        write();
        requestAnimationFrame(() => {
          if (active !== s) return;
          s.frame2 = now();
          write();
        });
      });
    }
    scheduleWrite();
  }
  function init() {
    if (document.getElementById(BOX_ID)) return;
    bubble = document.getElementById(PREVIEW_ID);
    if (!bubble) return;  // original preview script was not initialized
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `#${BOX_ID} {
      position: fixed; left: 7px; bottom: clamp(260px, 44vh, 470px);
      z-index: 2147483550; pointer-events: none;
      max-width: calc(100vw - 14px); padding: 7px 9px;
      border: 1px solid #59debe; border-radius: 8px;
      color: #fff; background: rgba(6,23,30,.94);
      font: 500 11px/1.35 ui-monospace, monospace;
      letter-spacing: .05px; white-space: pre-wrap;
      box-shadow: 0 2px 9px rgba(0,0,0,.3);
      user-select: none; -webkit-user-select: none;
    }`;
    document.head.appendChild(style);
    box = document.createElement('div');
    box.id = BOX_ID;
    box.setAttribute('aria-hidden', 'true');
    box.textContent = screenLine();
    document.body.appendChild(box);

    // Only observe the existing preview's hidden flag, not whole editor or DOM.
    const previewWatcher = new MutationObserver(() => {
      const s = active;
      if (!s) return;
      const t = now();
      if (isVisible()) {
        if (s.show == null) { s.show = t; stamp(s, 'DUCH+', t); }
      } else if (s.hide == null && s.show != null) {
        s.hide = t;
        stamp(s, 'DUCH-', t);
      }
      scheduleWrite();
    });
    previewWatcher.observe(bubble, { attributes: true, attributeFilter: ['hidden'] });

    window.addEventListener('pointerdown', ev => {
      const key = ev.target instanceof Element
        ? ev.target.closest('#lubaKeyboard .ln-lk-key[data-lk-action="text"]') : null;
      if (!key || (ev.pointerType === 'mouse' && ev.button !== 0) ||
          (ev.pointerType === 'touch' && !ev.isPrimary)) return;
      const panel = document.getElementById('lubaKeyboard');
      if (!panel || panel.hidden) return;
      const s = {
        key, name: keyName(key), pointerId: ev.pointerId, touchId: null,
        down: now(), pointerUp: null, touchEnd: null, cancel: null,
        pointerLag: null, touchLag: null, show: null, hide: null,
        frame1: null, frame2: null, rafScheduled: false, relit: false, events: []
      };
      active = s;
      watchKey(s);
      stamp(s,'P↓',s.down);
      // The original preview's document pointerdown listener runs after ours.
      // Its show mutation will be reported by previewWatcher.
      scheduleWrite();
    }, true);
    window.addEventListener('touchstart', ev => {
      const s = active;
      if (!s || s.touchId != null) return;
      for (const t of Array.from(ev.changedTouches || [])) {
        if (t.target === s.key || s.key.contains(t.target)) {
          s.touchId = t.identifier;
          stamp(s,'T↓',now());
          break;
        }
      }
    }, { capture: true, passive: true });
    window.addEventListener('pointerup', ev => finishInput('P↑', ev), true);
    window.addEventListener('pointercancel', ev => finishInput('P×', ev), true);
    window.addEventListener('touchend', ev => finishInput('T↑', ev), {capture: true, passive: true});
    window.addEventListener('touchcancel', ev => finishInput('T×', ev), {capture: true, passive: true});
    window.addEventListener('blur', () => { if (active) stamp(active,'BLUR',now()); scheduleWrite(); });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, {once: true});
  } else init();
})();
