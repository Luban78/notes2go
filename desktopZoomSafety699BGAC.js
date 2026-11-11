/* =============================================================
   699BG-AC – ochrana před rozpadlým PC rozložením při velkém zoomu.

   Neomezuje prohlížeč. Sleduje skutečnou šířku pracovní plochy
   a rozměry horních modulů. Pod 900 CSS px již neplatí testované
   PC rozložení 150 % (699BG-AB), proto zobrazí velké upozornění.

   Bez zásahu do APK/mobilu, synchronizace, editoru či nastavení.
   ============================================================= */
(() => {
  "use strict";

  const MODAL_ID = "lnPcZoomSafety699BGAC";
  const DESKTOP_MIN_WIDTH = 900;
  const desktopPointer = window.matchMedia(
    "(hover: hover) and (pointer: fine)"
  );
  const modulIds = [
    "notesModuleButton",
    "plannerModuleButton",
    "documentsModuleButton"
  ];

  let modal = null;
  let predchoziFokus = null;
  let naplanovano = false;

  function jeSkutecnePC() {
    // I při externí myši nepovažujeme mobil ani tablet za desktop.
    if (!desktopPointer.matches) return false;
    if (document.body.classList.contains("nativeApp")) return false;
    if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "")) return false;
    try {
      if (window.Capacitor?.isNativePlatform?.() === true) return false;
    } catch (_) { /* starší Capacitor */ }
    return true;
  }

  function vytvorModal() {
    if (modal) return modal;
    modal = document.createElement("section");
    modal.id = MODAL_ID;
    modal.hidden = true;
    modal.tabIndex = -1;
    modal.setAttribute("role", "alertdialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "lnPcZoomSafetyTitle699BGAC");
    modal.setAttribute("aria-describedby", "lnPcZoomSafetyText699BGAC");
    // Obsah je statický, nepochází od uživatele ani z poznámek.
    modal.innerHTML = `
      <div class="lnPcZoomSafetyCard699BGAC">
        <div class="lnPcZoomSafetySymbol699BGAC" aria-hidden="true">↔</div>
        <h2 id="lnPcZoomSafetyTitle699BGAC">Příliš velké zvětšení stránky</h2>
        <p id="lnPcZoomSafetyText699BGAC">
          Pro zachování správného rozložení a funkčnosti LubaNote
          prosím zmenši stránku v prohlížeči.
        </p>
        <p class="lnPcZoomSafetyHint699BGAC">
          Stiskni <kbd>Ctrl</kbd> + <kbd>−</kbd>, případně zvětši okno prohlížeče.
        </p>
        <p class="lnPcZoomSafetyFoot699BGAC">
          Upozornění samo zmizí, jakmile bude mít LubaNote opět dost prostoru.
        </p>
      </div>`;
    document.body.appendChild(modal);
    return modal;
  }

  function prilisVelkeTlacitko() {
    // Záložní kontrola skutečného zalomení / přetečení i nad hranicí.
    // Běžná 40–54px tlačítka a jejich odznaky nevyvolají varování.
    return modulIds.some((id) => {
      const tlacitko = document.getElementById(id);
      if (!tlacitko || tlacitko.getClientRects().length === 0) return false;
      const vyska = tlacitko.getBoundingClientRect().height;
      return vyska > 76 || (
        tlacitko.clientHeight > 0 &&
        tlacitko.scrollHeight > tlacitko.clientHeight + 18
      );
    });
  }

  function melByBytModalViditelny() {
    if (!jeSkutecnePC()) return false;
    const navigace = document.querySelector(".homeHeader nav.moduleTabs");
    if (!navigace || navigace.getClientRects().length === 0) return false;

    // innerWidth odpovídá hranici CSS @media i při viditelném scrollbar.
    // clientWidth by u stránky s kartami mohl chybně odečíst 15px.
    const sirka = window.innerWidth || document.documentElement.clientWidth;
    // Právě zde desktop ztrácí CSS 900–1099: stejná technická hranice
    // pro různé displeje, Windows DPI i zoom Chromu.
    return sirka < DESKTOP_MIN_WIDTH || prilisVelkeTlacitko();
  }

  function aktualizuj() {
    naplanovano = false;
    const zobrazit = melByBytModalViditelny();
    if (!zobrazit && !modal) return;
    const prvek = vytvorModal();
    if (zobrazit && prvek.hidden) {
      predchoziFokus = document.activeElement;
      prvek.hidden = false;
      prvek.focus({ preventScroll: true });
    } else if (!zobrazit && !prvek.hidden) {
      prvek.hidden = true;
      if (predchoziFokus?.isConnected &&
          typeof predchoziFokus.focus === "function") {
        predchoziFokus.focus({ preventScroll: true });
      }
      predchoziFokus = null;
    }
  }

  function naplanujKontrolu() {
    if (naplanovano) return;
    naplanovano = true;
    window.requestAnimationFrame(aktualizuj);
  }

  function start() {
    // Ctrl +/- v Chromu mění CSS viewport a vyvolá resize; modal tedy
    // automaticky zmizí bez obnovení stránky po návratu na vhodnou šířku.
    window.addEventListener("resize", naplanujKontrolu, { passive: true });
    window.addEventListener("orientationchange", naplanujKontrolu, { passive: true });
    window.visualViewport?.addEventListener("resize", naplanujKontrolu, { passive: true });
    desktopPointer.addEventListener?.("change", naplanujKontrolu);
    // Nativní režim nebo změna profilu UI může třídu body změnit až
    // po inicializaci – upozornění se v takové chvíli musí stáhnout.
    new MutationObserver(naplanujKontrolu).observe(document.body, {
      attributes: true,
      attributeFilter: ["class"]
    });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) naplanujKontrolu();
    });
    const navigace = document.querySelector(".homeHeader nav.moduleTabs");
    if (navigace && typeof ResizeObserver === "function") {
      const observer = new ResizeObserver(naplanujKontrolu);
      observer.observe(navigace);
      modulIds.forEach((id) => {
        const tlacitko = document.getElementById(id);
        if (tlacitko) observer.observe(tlacitko);
      });
    }
    naplanujKontrolu();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
