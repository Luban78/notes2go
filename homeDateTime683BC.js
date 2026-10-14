/* 683BC – datum a zivy cas nad tremi moduly.
 * Lokalni cas zarizeni, respektuje jazyk LubaNote. Bez site a bez uloziste.
 * Nezasahuje do editoru, planovace, notifikaci ani konfigurace 683BB.
 */
(() => {
  "use strict";
  const datum = document.getElementById("lnHomeDate683BC");
  const cas = document.getElementById("lnHomeTime683BC");
  if (!datum || !cas) return;

  let casovac = null;
  let posledniDen = "";
  let posledniJazyk = "";

  function jazyk() {
    const jazykAplikace = window.LubaNoteI18n?.ziskejLocale?.();
    return String(jazykAplikace || document.documentElement.lang || "cs");
  }

  function vykresli() {
    const ted = new Date();
    const locale = jazyk();
    // Na pruchodu pulnoci i po prepnuti jazyka se datum znovu zformatuje.
    const den = `${ted.getFullYear()}-${ted.getMonth()}-${ted.getDate()}`;
    if (den !== posledniDen || locale !== posledniJazyk) {
      posledniDen = den;
      posledniJazyk = locale;
      const textData = new Intl.DateTimeFormat(locale, {
        weekday: "short", day: "numeric", month: "numeric"
      }).format(ted);
      // Zacatek nazvu dne velkym pismenem; ostatni lokalni format zachovat.
      datum.textContent = textData.charAt(0).toLocaleUpperCase(locale) + textData.slice(1);
    }
    cas.textContent = new Intl.DateTimeFormat(locale, {
      hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).format(ted);
    datum.dateTime = [ted.getFullYear(),
      String(ted.getMonth() + 1).padStart(2, "0"),
      String(ted.getDate()).padStart(2, "0")].join("-");
    cas.dateTime = [String(ted.getHours()).padStart(2, "0"),
      String(ted.getMinutes()).padStart(2, "0")].join(":");
  }

  function naplanuj() {
    if (casovac !== null) clearTimeout(casovac);
    vykresli();
    // Aktualizace na zacatku dalsi minuty; pri navratu do APK ihned.
    const prodleva = Math.max(100, 60000 - (Date.now() % 60000) + 180);
    casovac = setTimeout(naplanuj, prodleva);
  }

  // 683BG – datum/cas se schovaji pri systemove liste nebo jinem
  // prekryti Android okna. RX panel se resi samostatne ciste CSS.
  // Nemenime rozlozeni ani hodnoty Visual Debug Generated CSS.
  const horniRadek = document.getElementById("lnHomeDateTime683BC");
  let androidOknoAktivni = true;
  let webOknoAktivni = true;
  // 683BH: transientni Android status bar muze byt videt i pri zachovanem fokusu.
  let androidSystemovaListaViditelna = false;
  let obnoveniCekani = null;

  function aplikujSkryti() {
    if (!horniRadek) return;
    horniRadek.classList.toggle(
      "ln683BG-system-overlay",
      document.hidden || !androidOknoAktivni || !webOknoAktivni || androidSystemovaListaViditelna
    );
  }

  function zrusObnoveni() {
    if (obnoveniCekani !== null) clearTimeout(obnoveniCekani);
    obnoveniCekani = null;
  }

  function obnovPoSystemoveAnimaci() {
    zrusObnoveni();
    // Android animaci zabalene listy dokoncuje az po navratu fokusu.
    obnoveniCekani = setTimeout(() => {
      obnoveniCekani = null;
      aplikujSkryti();
    }, 220);
  }

  // Presny signal z Android MainActivity.onWindowFocusChanged().
  window.addEventListener("lubanote:android-window-focus", (udalost) => {
    androidOknoAktivni = udalost.detail?.focused === true;
    if (androidOknoAktivni) {
      webOknoAktivni = true;
      obnovPoSystemoveAnimaci();
    } else {
      zrusObnoveni();
      aplikujSkryti();
    }
  });

  // 683BH: Android WindowInsets.Type.statusBars() umi hlasit i prechodne
  // zobrazeni systemove listy, kdy onWindowFocusChanged vubec neprijde.
  // Dalsi overlay stavy (RX panel, blur) zustavaji nezavisle.
  window.addEventListener("lubanote:android-statusbar-visibility", (udalost) => {
    androidSystemovaListaViditelna = udalost.detail?.visible === true;
    zrusObnoveni();
    aplikujSkryti();
  });

  // Fallback pro PWA / prohlizec a prechod mimo WebView.
  window.addEventListener("blur", () => {
    webOknoAktivni = false;
    zrusObnoveni();
    aplikujSkryti();
  });
  window.addEventListener("focus", () => {
    webOknoAktivni = true;
    obnovPoSystemoveAnimaci();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) naplanuj();
    if (document.hidden) {
      zrusObnoveni();
      aplikujSkryti();
    } else {
      obnovPoSystemoveAnimaci();
    }
  });
  aplikujSkryti();
  window.addEventListener("pageshow", naplanuj);
  // i18n.js pri zmene jazyka meni atribut lang na <html>.
  new MutationObserver(() => vykresli()).observe(document.documentElement, {
    attributes: true, attributeFilter: ["lang"]
  });
  naplanuj();
})();
