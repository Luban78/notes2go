/* 699D-CE – pouze nainstalovana Android PWA, nikoli APK/WebView.
 *
 * Chrome po navratu z minimalizace muze znovu navazat InputConnection
 * k puvodnimu contenteditable a zobrazit Gboard nad LubaKeyboard, prestože
 * ma editor inputmode=none. PWA nema nativni hideIme plugin z APK.
 *
 * Pred odchodem odpojime fokus i editable InputConnection. Po navratu
 * vratime puvodni atribut, ale zamerne NEREFOCUSUJEME: Chrome by znovu
 * mohl vyvolat Gboard. LubaKeyboard uz je otevrena a zapisuje do modelu;
 * dalsi skutecny tap do textu obnovi fokus bez systemove klavesnice.
 */
(() => {
  "use strict";

  const ua = String(navigator.userAgent || "");
  const jeAndroidPwa = /Android/i.test(ua) &&
    window.matchMedia?.("(display-mode: standalone)")?.matches === true &&
    !/;\s*wv\)/i.test(ua) &&
    !window.Capacitor?.isNativePlatform?.() &&
    !document.body?.classList?.contains("nativeApp");

  if (!jeAndroidPwa) return;

  let predOdchodem = null;
  let cekaniNaNavrat = false;
  let navratTimer = 0;

  function jeVlastniKlavesniceAktivni() {
    return window.LubaNoteKeyboard?.ziskejZdroj?.() === "luba" &&
      window.LubaNoteKeyboard?.jeOtevrena?.() === true;
  }

  function jeEditorovePole(cil) {
    if (!cil?.isConnected) return false;
    const jeTelo = cil.matches?.(".ln-v2-editor[data-ln-v2-editor]") === true;
    const jeNazev = cil.id === "modalTitle";
    if (!jeTelo && !jeNazev) return false;
    const modal = cil.closest?.(".taskModal");
    return Boolean(modal && !modal.hidden);
  }

  function zapis(udalost) {
    try { window.LubaNoteStartupDiag?.zapis?.("PWA-IME", `699D-CE ${udalost}`); }
    catch (_error) {}
  }

  function predBackgroundem() {
    cekaniNaNavrat = true;
    clearTimeout(navratTimer);
    navratTimer = 0;
    if (predOdchodem || !jeVlastniKlavesniceAktivni()) return;

    const cil = document.activeElement;
    if (!jeEditorovePole(cil)) return;

    predOdchodem = {
      cil,
      editable: cil.getAttribute("contenteditable")
    };

    // Nejprve odstranime InputConnection, az pak muze Chrome aplikaci uspat.
    cil.setAttribute("inputmode", "none");
    cil.setAttribute("virtualkeyboardpolicy", "manual");
    cil.setAttribute("contenteditable", "false");
    try { cil.blur(); } catch (_error) {}
    zapis("BACKGROUND_DETACH");
  }

  function dokonceniNavratu() {
    navratTimer = 0;
    if (document.visibilityState === "hidden") return;
    if (!cekaniNaNavrat) return;
    cekaniNaNavrat = false;

    const stav = predOdchodem;
    predOdchodem = null;
    if (!stav?.cil?.isConnected) {
      // Fallback: pri odchodu nemusel byt fokus v editoru, ale Chrome jej
      // mohl pri navratu sam znovu zapnout. Bez zmeny jakehokoli atributu.
      if (jeVlastniKlavesniceAktivni() && jeEditorovePole(document.activeElement)) {
        try { document.activeElement.blur(); } catch (_error) {}
        zapis("FOREGROUND_FALLBACK_BLUR");
      }
      return;
    }

    const cil = stav.cil;
    // Chrome muze stary fokus obnovit samo. Zrusime ho pred editovatelnosti.
    if (document.activeElement === cil) {
      try { cil.blur(); } catch (_error) {}
    }

    if (stav.editable == null) cil.removeAttribute("contenteditable");
    else cil.setAttribute("contenteditable", stav.editable);

    // Zdroj klavesnice se mohl mezitim zmenit; v tom pripade jeho rezim
    // neprepisujeme. To je dulezite pro explicitne zvolenou Gboard.
    if (window.LubaNoteKeyboard?.ziskejZdroj?.() === "luba") {
      cil.setAttribute("inputmode", "none");
      cil.setAttribute("virtualkeyboardpolicy", "manual");
    }

    zapis("FOREGROUND_RESTORE_NO_FOCUS");
  }

  function naplanujNavrat() {
    if (!cekaniNaNavrat || document.visibilityState === "hidden") return;
    clearTimeout(navratTimer);
    // Pockame na dokonceni obnovy okna Chrome; nevolame editor.focus().
    navratTimer = setTimeout(dokonceniNavratu, 180);
  }

  // Blur okna typicky predchazi visibilitychange=hidden.
  window.addEventListener("blur", predBackgroundem, true);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") predBackgroundem();
    else naplanujNavrat();
  }, true);
  window.addEventListener("pagehide", predBackgroundem, true);
  document.addEventListener("freeze", predBackgroundem, true);
  window.addEventListener("focus", naplanujNavrat, true);
  window.addEventListener("pageshow", naplanujNavrat, true);
})();
