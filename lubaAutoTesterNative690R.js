/* 690U – Native WebView delivery diagnostics (NOT native selection test) in the running Android APK.
 * Ephemeral diagnostic surface; no note, database or persistent state is accessed.
 * This probes Java MotionEvent -> WebView -> TRUSTED DOM event delivery.
 * It does NOT prove physical fingers, Android OS selection handles, or app editor UI.
 */
(() => {
  'use strict';
  const CASES = [
    ['native-webview-tap', 'Android WebView – skutečné doručení klepnutí', 'tap'],
    ['native-webview-doubletap', 'Android WebView – skutečné doručení dvojklepnutí', 'doubletap'],
    ['native-webview-swipe', 'Android WebView – doručení tažení prstem', 'swipe'],
    ['native-webview-longpress', 'Android WebView – doručení dlouhého stisku', 'longpress']
  ];
  let busy = false;
  const blocked = why => CASES.map(([id, name]) => ({
    id, name, kind: 'ANDROID_WEBVIEW_NATIVE_MOTIONEVENT', status: 'NATIVE_BLOCKED',
    ms: 0, detail: String(why || 'native_unavailable').slice(0, 240)
  }));
  const plugin = () => window.Capacitor?.Plugins?.LubaNoteNativeTester;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  async function runRepeated(shouldContinue = () => true, onProgress = () => {}, repeats = 1) {
    if (busy) return blocked('already_running');
    busy = true;
    const results = [];
    const n = Math.max(1, Math.min(50, Math.trunc(Number(repeats) || 1)));
    let surface = null;
    try {
      if (window.LubaNoteAdminTools?.isAllowed?.() !== true) return blocked('admin_required');
      if (!window.Capacitor?.isNativePlatform?.() || !plugin()) {
        return blocked('Android APK native plugin unavailable – web/PC cannot prove native touch');
      }
      const env = await plugin().environment();
      if (!env?.nativeDispatch) return blocked('native_dispatch_unavailable');
      // Stage is at viewport level to receive real WebView MotionEvent dispatch.
      surface = document.createElement('section');
      surface.id = 'lat-native-surface';
      surface.setAttribute('aria-label', 'Izolovaný test Android WebView');
      // 690X: This measures transport ONLY; never invoke WebView system selection.
      surface.style.cssText = [
        'position:fixed!important', 'z-index:2147483640!important',
        'left:50%!important', 'transform:translateX(-50%)!important',
        'top:clamp(70px,22dvh,150px)!important',
        'width:min(82vw,320px)!important','height:132px!important',
        'padding:12px!important','border-radius:12px!important',
        'border:2px solid #32ca89!important','background:#14271f!important',
        'color:#daf5e4!important','box-sizing:border-box!important',
        'font:16px/1.5 system-ui,sans-serif!important',
        'user-select:none!important','-webkit-user-select:none!important',
        '-webkit-touch-callout:none!important','touch-action:none!important','overflow:hidden!important'
      ].join(';');
      surface.innerHTML = '<strong>TEST DORUČENÍ DOTYKŮ</strong>' +
        '<p style="margin:8px 0;color:#c1dfce;-webkit-user-select:none;user-select:none">' +
        'Není to test označování textu. Náš vlastní výběr se zkouší v editoru.</p>';
      const events = [];
      for (const name of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
        surface.addEventListener(name, event => {
          events.push({ name, trusted: event.isTrusted, at: performance.now() });
          if (events.length > 250) events.shift();
          event.stopPropagation();
        }, { passive: true });
      }
      surface.addEventListener('click', event => event.stopPropagation());
      surface.addEventListener('selectstart', event => { if(event.cancelable) event.preventDefault(); }, {passive:false});
      document.body.append(surface);
      await sleep(160);
      if (surface.getBoundingClientRect().bottom > innerHeight) {
        return blocked('native_stage_not_fully_visible');
      }
      for (const [id, name, gesture] of CASES) {
        let pass = 0, fail = 0, reason = '', elapsed = 0;
        for (let i = 1; i <= n; i++) {
          if (!shouldContinue()) return [...results, ...blocked('cancelled').filter(x => !results.some(r => r.id === x.id))];
          onProgress(`Android WebView ${i}/${n}: ${gesture}`);
          const beginning = performance.now();
          events.length = 0;
          window.getSelection()?.removeAllRanges();
          try {
            // Native receives ONLY fractions of the verified stage; caller
            // cannot supply arbitrary screen coordinates.
            const response = await plugin().gesture({ type: gesture, x: 0.38, y: 0.47 });
            await sleep(100);
            const trusted = name => events.filter(e => e.name === name && e.trusted).length;
            const starts = trusted('touchstart'), ends = trusted('touchend');
            const terminations = ends + trusted('touchcancel');
            const moves = trusted('touchmove');
            if (response?.delivery !== 'WEBVIEW_DISPATCH_TOUCH_EVENT') throw Error('native_ack_missing');
            if (starts < (gesture === 'doubletap' ? 2 : 1)) throw Error(`trusted_touchstart_missing_${starts}`);
            if (terminations < (gesture === 'doubletap' ? 2 : 1)) throw Error(`trusted_touch_termination_missing_${terminations}`);
            if (gesture === 'swipe' && moves < 2) throw Error(`trusted_touchmove_missing_${moves}`);
            pass++;
          } catch (error) {
            fail++;
            if (!reason) reason = String(error?.message || error).slice(0, 180);
          }
          elapsed += performance.now() - beginning;
        }
        results.push({
          id, name, kind: 'ANDROID_WEBVIEW_NATIVE_MOTIONEVENT',
          status: fail ? 'NATIVE_FAIL' : 'NATIVE_PASS',
          ms: Math.round(elapsed),
          detail: `${pass}/${n} PASS, ${fail} FAIL. ` + (reason ? 'První chyba: ' + reason + '. ' : '') +
            'Java MotionEvent -> skutečné WebView -> isTrusted touch události; ' +
            'pouze doručení vstupu; LubaNote vlastní výběr a caret ověřují ui-own-* testy v běžném editoru.'
        });
      }
      return results;
    } catch (error) {
      return [...results, ...blocked(error?.message || 'native_suite_exception').filter(x => !results.some(r => r.id === x.id))];
    } finally {
      // Clear any OS selection left by older WebView before OWN LubaNote tests.
      try { window.getSelection()?.removeAllRanges?.(); } catch (_error) {}
      surface?.remove();
      busy = false;
    }
  }
  window.LubaNoteAutoTesterNative690R = Object.freeze({ runRepeated });
})();
