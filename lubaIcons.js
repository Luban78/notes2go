/* ==================================================
   LubaNote – JEDNOTNÁ SVG KNIHOVNA IKON
   --------------------------------------------------
   - používá se na mobilu, v APK i na desktopu
   - bez externí knihovny a bez síťových požadavků
   - barva se dědí přes currentColor
   - jeden zdroj ikon pro celou aplikaci
================================================== */

(() => {
  const SVG_NS = "http://www.w3.org/2000/svg";

  /* ==================================================
     PŘEPÍNAČ IKON
     --------------------------------------------------
     false = na mobilu / v APK použít původní emoji ikony
     true  = na mobilu / v APK použít nové SVG ikony

     Desktop používá SVG vždy.
  ================================================== */
  const POUZIVAT_NOVE_SVG_IKONY_NA_MOBILU = false;
  const DESKTOP_BREAKPOINT = 900;

  const puvodniMobilniIkony = {
    domov: "🏠",
    poznamky: "📝",
    modulPoznamky: "📝",
    kalendar: "📅",
    zvonek: "🔔",
    hledat: "⌕",
    oblibene: "⭐",
    stitky: "🏷️",
    nastaveni: "⚙️",
    zaloha: "💾",
    prace: "💼",
    soukrome: "🏠",
    pripnout: "📌",
    zamek: "🔒",
    odemceno: "🔓",
    opakovat: "🔁",
    mrizka: "▦",
    seznam: "☷",
    vice: "⋮",
    razeni: "↕️",
    info: "ℹ️",
    odhlasit: "🚪",
    smazat: "🗑️",
    upozorneni: "⚠️",
    hodiny: "⏰",
    hotovo: "✅",
    zavrit: "✕",
    paleta: "🎨",
    upravit: "✏️",
    plus: "➕",
    vypnoutZvonek: "🔕",
    obrazek: "🖼️",
    fotoaparat: "📷",
    odkaz: "🔗",
    todo: "☐",
    dokument: "📄",
    obnovit: "↻",
    zpet: "←",
    odepnout: "📍",
    oznacit: "☑️",
    sipkaVlevo: "‹",
    sipkaVpravo: "›",
    minus: "−",
    odrazky: "•"
  };

  function jeDesktop() {
    return window.matchMedia(
      `(min-width: ${DESKTOP_BREAKPOINT}px)`
    ).matches;
  }

  function pouzitSvgIkony() {
    return (
      jeDesktop() ||
      POUZIVAT_NOVE_SVG_IKONY_NA_MOBILU
    );
  }

  function ziskejPuvodniMobilniIkonu(nazev) {
    return puvodniMobilniIkony[nazev] || "•";
  }

  const definiceIkon = {
    domov: [
      ["path", { d: "M3.5 10.8 12 3.8l8.5 7" }],
      ["path", { d: "M5.5 9.8V20h13V9.8" }],
      ["path", { d: "M9.2 20v-6.2h5.6V20" }]
    ],

    poznamky: [
      ["path", { d: "M7 3.5h8.3L19 7.2V20.5H7z" }],
      ["path", { d: "M15.2 3.5v3.8H19" }],
      ["path", { d: "M10 11h6" }],
      ["path", { d: "M10 14.5h6" }],
      ["path", { d: "M10 18h4" }],
      ["path", { d: "M4.5 6.2v13.3" }]
    ],

    modulPoznamky: [
      ["path", { d: "M6.2 4h8.5L18 7.3v12.2H6.2z" }],
      ["path", { d: "M14.7 4v3.4H18" }],
      ["path", { d: "m9.4 15.7.7-2.7 6.3-6.3a1.45 1.45 0 0 1 2.05 2.05l-6.3 6.3-2.75.65Z" }]
    ],

    kalendar: [
      ["rect", { x: "3.5", y: "5.5", width: "17", height: "15", rx: "2.4" }],
      ["path", { d: "M7.5 3.2v4.2" }],
      ["path", { d: "M16.5 3.2v4.2" }],
      ["path", { d: "M3.5 9.5h17" }],
      ["path", { d: "M8 13h.01" }],
      ["path", { d: "M12 13h.01" }],
      ["path", { d: "M16 13h.01" }],
      ["path", { d: "M8 17h.01" }],
      ["path", { d: "M12 17h.01" }]
    ],

    zvonek: [
      ["path", { d: "M18.2 9.7a6.2 6.2 0 0 0-12.4 0c0 5.6-2.3 6.4-2.3 8.1h17c0-1.7-2.3-2.5-2.3-8.1Z" }],
      ["path", { d: "M9.5 20.2a2.9 2.9 0 0 0 5 0" }]
    ],

    hledat: [
      ["circle", { cx: "10.5", cy: "10.5", r: "6.2" }],
      ["path", { d: "m15.2 15.2 5 5" }]
    ],

    oblibene: [
      ["path", { d: "m12 3.4 2.66 5.38 5.94.86-4.3 4.2 1.02 5.92L12 16.96 6.68 19.76l1.02-5.92-4.3-4.2 5.94-.86L12 3.4Z" }]
    ],

    stitky: [
      ["path", { d: "M4 5.2v6.1l7.7 7.7a2 2 0 0 0 2.8 0l4.5-4.5a2 2 0 0 0 0-2.8L11.3 4H5.2A1.2 1.2 0 0 0 4 5.2Z" }],
      ["circle", { cx: "7.7", cy: "7.7", r: "1.25" }]
    ],

    nastaveni: [
      ["circle", { cx: "12", cy: "12", r: "3.1" }],
      ["path", { d: "M19.4 13.6a7.8 7.8 0 0 0 .05-3.1l2-1.55-2-3.45-2.45 1a8.6 8.6 0 0 0-2.7-1.55L14 2.35h-4l-.35 2.6A8.6 8.6 0 0 0 7 6.5l-2.45-1-2 3.45 2 1.55a7.8 7.8 0 0 0 0 3.1l-2 1.55 2 3.45 2.45-1a8.6 8.6 0 0 0 2.65 1.55l.35 2.5h4l.35-2.5A8.6 8.6 0 0 0 17 17.6l2.45 1 2-3.45-2.05-1.55Z" }]
    ],

    zaloha: [
      ["rect", { x: "4", y: "5", width: "16", height: "15", rx: "2.2" }],
      ["path", { d: "M4 9h16" }],
      ["path", { d: "M9 13h6" }],
      ["path", { d: "M12 13v4.2" }],
      ["path", { d: "m9.8 15.2 2.2 2.2 2.2-2.2" }],
      ["path", { d: "M8 5V3.2h8V5" }]
    ],

    prace: [
      ["rect", { x: "3.5", y: "7.2", width: "17", height: "12.3", rx: "2.2" }],
      ["path", { d: "M8.2 7.2V5.3c0-.9.7-1.6 1.6-1.6h4.4c.9 0 1.6.7 1.6 1.6v1.9" }],
      ["path", { d: "M3.5 11.5c2.8 1.6 5.6 2.4 8.5 2.4s5.7-.8 8.5-2.4" }],
      ["path", { d: "M10.2 13.6v2h3.6v-2" }]
    ],

    soukrome: [
      ["path", { d: "M3.7 10.8 12 4l8.3 6.8" }],
      ["path", { d: "M5.7 9.9V20h12.6V9.9" }],
      ["path", { d: "M9.3 20v-5.7h5.4V20" }]
    ],

    pripnout: [
      ["path", { d: "m8.2 3.7 8.1 8.1" }],
      ["path", { d: "m13.7 4.3 6 6-3.4 1.1-4.9 4.9-1.1 3.4-6-6 3.4-1.1 4.9-4.9 1.1-3.4Z" }],
      ["path", { d: "m8.6 15.4-5.3 5.3" }]
    ],

    zamek: [
      ["rect", { x: "5.2", y: "10.2", width: "13.6", height: "10", rx: "2.3" }],
      ["path", { d: "M8.2 10.2V7.6a3.8 3.8 0 0 1 7.6 0v2.6" }],
      ["circle", { cx: "12", cy: "15.1", r: "1" }]
    ],

    odemceno: [
      ["rect", { x: "5.2", y: "10.2", width: "13.6", height: "10", rx: "2.3" }],
      ["path", { d: "M9 10.2V7.8a3.8 3.8 0 0 1 7.2-1.7" }],
      ["circle", { cx: "12", cy: "15.1", r: "1" }]
    ],

    opakovat: [
      ["path", { d: "M17.8 7.2H8.1a4.6 4.6 0 0 0-4.6 4.6" }],
      ["path", { d: "m15.2 4.6 2.6 2.6-2.6 2.6" }],
      ["path", { d: "M6.2 16.8h9.7a4.6 4.6 0 0 0 4.6-4.6" }],
      ["path", { d: "m8.8 19.4-2.6-2.6 2.6-2.6" }]
    ],

    mrizka: [
      ["rect", { x: "4", y: "4", width: "6", height: "6", rx: "1" }],
      ["rect", { x: "14", y: "4", width: "6", height: "6", rx: "1" }],
      ["rect", { x: "4", y: "14", width: "6", height: "6", rx: "1" }],
      ["rect", { x: "14", y: "14", width: "6", height: "6", rx: "1" }]
    ],

    seznam: [
      ["path", { d: "M9 6h11" }],
      ["path", { d: "M9 12h11" }],
      ["path", { d: "M9 18h11" }],
      ["circle", { cx: "4.5", cy: "6", r: "1" }],
      ["circle", { cx: "4.5", cy: "12", r: "1" }],
      ["circle", { cx: "4.5", cy: "18", r: "1" }]
    ],

    vice: [
      ["circle", { cx: "12", cy: "5", r: "1.25", fill: "currentColor", stroke: "none" }],
      ["circle", { cx: "12", cy: "12", r: "1.25", fill: "currentColor", stroke: "none" }],
      ["circle", { cx: "12", cy: "19", r: "1.25", fill: "currentColor", stroke: "none" }]
    ],

    razeni: [
      ["path", { d: "M8 5v14" }],
      ["path", { d: "m5 8 3-3 3 3" }],
      ["path", { d: "M16 19V5" }],
      ["path", { d: "m13 16 3 3 3-3" }]
    ],

    info: [
      ["circle", { cx: "12", cy: "12", r: "9" }],
      ["path", { d: "M12 10.5v6" }],
      ["path", { d: "M12 7.3h.01" }]
    ],

    odhlasit: [
      ["path", { d: "M10 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H10" }],
      ["path", { d: "M14 8l4 4-4 4" }],
      ["path", { d: "M18 12H9" }]
    ],

    smazat: [
      ["path", { d: "M4.5 7h15" }],
      ["path", { d: "M9 7V4.5h6V7" }],
      ["path", { d: "m7 7 .8 13h8.4L17 7" }],
      ["path", { d: "M10 11v5" }],
      ["path", { d: "M14 11v5" }]
    ],

    upozorneni: [
      ["path", { d: "M10.2 4.2 2.9 17a2 2 0 0 0 1.75 3h14.7a2 2 0 0 0 1.75-3L13.8 4.2a2 2 0 0 0-3.6 0Z" }],
      ["path", { d: "M12 9v4.2" }],
      ["path", { d: "M12 16.5h.01" }]
    ],

    hodiny: [
      ["circle", { cx: "12", cy: "12", r: "8.7" }],
      ["path", { d: "M12 7.2v5.2l3.4 2" }]
    ],

    hotovo: [
      ["circle", { cx: "12", cy: "12", r: "9" }],
      ["path", { d: "m7.7 12.2 2.7 2.8 5.9-6" }]
    ],

    zavrit: [
      ["path", { d: "m6 6 12 12" }],
      ["path", { d: "M18 6 6 18" }]
    ],

    paleta: [
      ["path", { d: "M12 3.3a8.8 8.8 0 1 0 0 17.6h1.4a1.9 1.9 0 0 0 0-3.8h-1.1a1.8 1.8 0 0 1 0-3.6h2.4A5.9 5.9 0 0 0 20.5 8 8.8 8.8 0 0 0 12 3.3Z" }],
      ["circle", { cx: "7.5", cy: "10.1", r: ".8", fill: "currentColor", stroke: "none" }],
      ["circle", { cx: "9.7", cy: "6.9", r: ".8", fill: "currentColor", stroke: "none" }],
      ["circle", { cx: "14", cy: "6.5", r: ".8", fill: "currentColor", stroke: "none" }],
      ["circle", { cx: "16.6", cy: "9.5", r: ".8", fill: "currentColor", stroke: "none" }]
    ],

    upravit: [
      ["path", { d: "M4.5 19.5 5.4 15 15.7 4.7a2 2 0 0 1 2.8 2.8L8.2 17.8l-3.7 1.7Z" }],
      ["path", { d: "m13.9 6.5 3.6 3.6" }]
    ],

    plus: [
      ["path", { d: "M12 5v14" }],
      ["path", { d: "M5 12h14" }]
    ],

    vypnoutZvonek: [
      ["path", { d: "M17.8 10.1a6 6 0 0 0-9.9-4.6" }],
      ["path", { d: "M5.8 9.7c0 5.6-2.3 6.4-2.3 8.1h13.9" }],
      ["path", { d: "M9.5 20.2a2.9 2.9 0 0 0 5 0" }],
      ["path", { d: "m4 4 16 16" }]
    ],

    obrazek: [
      ["rect", { x: "3.5", y: "4.5", width: "17", height: "15", rx: "2.2" }],
      ["circle", { cx: "9", cy: "9.2", r: "1.6" }],
      ["path", { d: "m5.5 17 4.2-4.2 3.1 3.1 2.1-2.1 3.6 3.2" }]
    ],

    fotoaparat: [
      ["path", { d: "M5 7.5h3l1.4-2.2h5.2L16 7.5h3a2 2 0 0 1 2 2v8.2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9.5a2 2 0 0 1 2-2Z" }],
      ["circle", { cx: "12", cy: "13.2", r: "3.3" }]
    ],

    odkaz: [
      ["path", { d: "M9.8 14.2 14.2 9.8" }],
      ["path", { d: "M7.1 16.9 5.6 18.4a3.2 3.2 0 0 1-4.5-4.5l3-3a3.2 3.2 0 0 1 4.5 0" }],
      ["path", { d: "m16.9 7.1 1.5-1.5a3.2 3.2 0 1 1 4.5 4.5l-3 3a3.2 3.2 0 0 1-4.5 0" }]
    ],

    todo: [
      ["rect", { x: "4", y: "4.5", width: "16", height: "15", rx: "2.3" }],
      ["path", { d: "m7.5 11.8 2 2 3.6-4" }],
      ["path", { d: "M14.5 10h2.5" }],
      ["path", { d: "M14.5 14h2.5" }]
    ],

    dokument: [
      ["path", { d: "M6 3.5h8.5L19 8v12.5H6z" }],
      ["path", { d: "M14.5 3.5V8H19" }],
      ["path", { d: "M9 12h6" }],
      ["path", { d: "M9 15.5h6" }]
    ],

    obnovit: [
      ["path", { d: "M20 7.5V3.8l-3.1 3.1" }],
      ["path", { d: "M19.1 7A8 8 0 1 0 20 14" }]
    ],

    zpet: [
      ["path", { d: "m10 6-6 6 6 6" }],
      ["path", { d: "M4 12h10.5a5.5 5.5 0 0 1 5.5 5.5" }]
    ],

    odepnout: [
      ["path", { d: "m8.2 3.7 8.1 8.1" }],
      ["path", { d: "m13.7 4.3 6 6-3.4 1.1-4.9 4.9-1.1 3.4-6-6 3.4-1.1 4.9-4.9 1.1-3.4Z" }],
      ["path", { d: "m8.6 15.4-5.3 5.3" }],
      ["path", { d: "m4 4 16 16" }]
    ],

    oznacit: [
      ["rect", { x: "4", y: "4", width: "16", height: "16", rx: "2.5" }],
      ["path", { d: "m7.5 12 2.7 2.7 6.3-6.2" }]
    ],

    sipkaVlevo: [
      ["path", { d: "m14.5 5-7 7 7 7" }]
    ],

    sipkaVpravo: [
      ["path", { d: "m9.5 5 7 7-7 7" }]
    ],

    minus: [
      ["path", { d: "M5 12h14" }]
    ],

    odrazky: [
      ["circle", { cx: "5", cy: "7", r: "1", fill: "currentColor", stroke: "none" }],
      ["circle", { cx: "5", cy: "12", r: "1", fill: "currentColor", stroke: "none" }],
      ["circle", { cx: "5", cy: "17", r: "1", fill: "currentColor", stroke: "none" }],
      ["path", { d: "M9 7h10" }],
      ["path", { d: "M9 12h10" }],
      ["path", { d: "M9 17h10" }]
    ]
  };

  function nastavAtributy(element, atributy = {}) {
    Object.entries(atributy).forEach(([nazev, hodnota]) => {
      element.setAttribute(nazev, hodnota);
    });
  }

  function vytvorSvgIkonu(nazev, tridy = []) {
    const definice = definiceIkon[nazev];

    if (!definice) {
      return null;
    }

    const svg = document.createElementNS(SVG_NS, "svg");

    nastavAtributy(svg, {
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.85",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
      focusable: "false"
    });

    svg.classList.add("lubaSvgIcon", ...tridy.filter(Boolean));

    definice.forEach(([typ, atributy]) => {
      const cast = document.createElementNS(SVG_NS, typ);
      nastavAtributy(cast, atributy);
      svg.append(cast);
    });

    return svg;
  }

  function nastavVzhledHostitele(hostitel, nazev) {
    if (!hostitel) {
      return null;
    }

    hostitel.dataset.lubaIcon = nazev;
    hostitel.classList.add("lubaIconHost");
    hostitel.setAttribute("aria-hidden", "true");

    if (pouzitSvgIkony()) {
      const svg = vytvorSvgIkonu(nazev);

      hostitel.classList.remove("lubaEmojiIcon");
      hostitel.style.removeProperty("width");
      hostitel.style.removeProperty("height");
      hostitel.style.removeProperty("min-width");
      hostitel.style.removeProperty("min-height");
      hostitel.style.removeProperty("font-size");
      hostitel.style.removeProperty("line-height");

      if (svg) {
        hostitel.replaceChildren(svg);
      } else {
        hostitel.replaceChildren();
      }

      return hostitel;
    }

    hostitel.replaceChildren(
      document.createTextNode(
        ziskejPuvodniMobilniIkonu(nazev)
      )
    );

    hostitel.classList.add("lubaEmojiIcon");

    /*
     * Původní emoji se mají řídit velikostí písma, ne pevnými
     * rozměry SVG hostitele. Inline hodnoty přebijí naše obecné
     * SVG width/height pouze v mobilním režimu.
     */
    hostitel.style.width = "auto";
    hostitel.style.height = "auto";
    hostitel.style.minWidth = "0";
    hostitel.style.minHeight = "0";
    hostitel.style.fontSize = "1em";
    hostitel.style.lineHeight = "1";

    return hostitel;
  }

  function vytvorHostitele(nazev, tridy = []) {
    const hostitel = document.createElement("span");
    hostitel.classList.add(...tridy.filter(Boolean));

    return nastavVzhledHostitele(
      hostitel,
      nazev
    );
  }

  function vlozIkonu(cil, nazev, tridyHostitele = []) {
    if (!cil) {
      return null;
    }

    cil.classList.add(
      ...tridyHostitele.filter(Boolean)
    );

    return nastavVzhledHostitele(cil, nazev);
  }

  function nastavObsahSIkonou(
    cil,
    nazev,
    text = "",
    tridyHostitele = []
  ) {
    if (!cil) {
      return null;
    }

    const hostitel = vytvorHostitele(
      nazev,
      ["lubaInlineIcon", ...tridyHostitele.filter(Boolean)]
    );

    if (!hostitel) {
      return null;
    }

    cil.replaceChildren(hostitel);

    cil.classList.toggle("lubaHasIcon", text !== "");
    cil.classList.toggle("lubaIconOnlyContent", text === "");

    if (text !== "") {
      const popisek = document.createElement("span");
      popisek.className = "lubaIconLabel";
      popisek.textContent = text;
      cil.append(popisek);
    }

    return cil;
  }

  function nastavJenIkonu(
    cil,
    nazev,
    tridyHostitele = []
  ) {
    return nastavObsahSIkonou(
      cil,
      nazev,
      "",
      tridyHostitele
    );
  }

  function naplnDeklarovaneIkony(root = document) {
    root.querySelectorAll("[data-luba-icon]").forEach((hostitel) => {
      const nazev = hostitel.dataset.lubaIcon;

      if (!nazev) {
        return;
      }

      nastavVzhledHostitele(
        hostitel,
        nazev
      );
    });
  }

  function obnovVsechnyIkonyPoZmeneSiritky() {
    naplnDeklarovaneIkony(document);
  }

  window.LubaNoteIcons = {
    vytvorSvgIkonu,
    vytvorHostitele,
    vlozIkonu,
    nastavObsahSIkonou,
    nastavJenIkonu,
    naplnDeklarovaneIkony,
    pouzitSvgIkony,
    pouzivaSvgNaMobilu: () =>
      POUZIVAT_NOVE_SVG_IKONY_NA_MOBILU,
    seznamIkon: () => Object.keys(definiceIkon)
  };

  naplnDeklarovaneIkony();

  window.matchMedia(
    `(min-width: ${DESKTOP_BREAKPOINT}px)`
  ).addEventListener(
    "change",
    obnovVsechnyIkonyPoZmeneSiritky
  );
})();
