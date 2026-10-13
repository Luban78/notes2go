/* 683BB – Nastaveni viditelnosti ovladacu domovske listy.
 * Vsechny volby defaultne zapnute; meni se jen viditelnost, ne akce tlacitek.
 * Volba "lupa" skryva pouze ikonu uvnitr vyhledavaciho pole,
 * vlastni vyhledavani i servisni menu zustavaji trvale dostupne.
 */
(() => {
  "use strict";

  const KLIC = "lubanote_home_toolbar_visibility_683BB_v1";
  const CILE = {
    lupa: ".searchRow .searchBox > .searchIcon",
    motiv: "#quickThemeButton",
    karty: "#changeViewButton",
    slovicka: "#englishLearningHeaderButton",
    pozvanky: "#sharingInvitationsButton",
    chat: "#chatButton"
  };
  const NAZVY = Object.keys(CILE);

  const PREKLADY = {
    cs: {
      title: "Ikony na hlavní obrazovce",
      hint: "Skryté ikony nezabírají místo. Pole hledání se roztáhne.",
      lupa: "Lupa ve vyhledávání", motiv: "Denní/noční režim",
      karty: "Rozložení karet", slovicka: "Výuka jazyků",
      pozvanky: "Pozvánky", chat: "Chat"
    },
    en: {
      title: "Home screen icons",
      hint: "Hidden icons take up no space. The search field expands.",
      lupa: "Search icon", motiv: "Day/night mode",
      karty: "Card layout", slovicka: "Language learning",
      pozvanky: "Invitations", chat: "Chat"
    },
    sk: {
      title: "Ikony na hlavnej obrazovke",
      hint: "Skryté ikony nezaberajú miesto. Pole vyhľadávania sa rozšíri.",
      lupa: "Lupa vo vyhľadávaní", motiv: "Denný/nočný režim",
      karty: "Rozloženie kariet", slovicka: "Výučba jazykov",
      pozvanky: "Pozvánky", chat: "Chat"
    },
    de: {
      title: "Symbole auf dem Startbildschirm",
      hint: "Ausgeblendete Symbole belegen keinen Platz. Die Suche wird breiter.",
      lupa: "Suchsymbol", motiv: "Tag-/Nachtmodus",
      karty: "Kartenlayout", slovicka: "Sprachen lernen",
      pozvanky: "Einladungen", chat: "Chat"
    },
    pl: {
      title: "Ikony na ekranie głównym",
      hint: "Ukryte ikony nie zajmują miejsca. Pole wyszukiwania się rozszerza.",
      lupa: "Ikona wyszukiwania", motiv: "Tryb dzienny/nocny",
      karty: "Układ kart", slovicka: "Nauka języków",
      pozvanky: "Zaproszenia", chat: "Czat"
    },
    es: {
      title: "Iconos de la pantalla principal",
      hint: "Los iconos ocultos no ocupan espacio. El campo de búsqueda se amplía.",
      lupa: "Icono de búsqueda", motiv: "Modo día/noche",
      karty: "Diseño de tarjetas", slovicka: "Aprendizaje de idiomas",
      pozvanky: "Invitaciones", chat: "Chat"
    }
  };

  const NASTAVENI = {};
  for (const nazev of NAZVY) NASTAVENI[nazev] = true;
  try {
    const ulozene = JSON.parse(localStorage.getItem(KLIC) || "null");
    if (ulozene && typeof ulozene === "object" && !Array.isArray(ulozene)) {
      for (const nazev of NAZVY) {
        if (typeof ulozene[nazev] === "boolean") NASTAVENI[nazev] = ulozene[nazev];
      }
    }
  } catch (_) {
    /* Napr. soukromy rezim nebo stary neplatny zapis: zachovat vychozi UI. */
  }

  function nastavViditelnost() {
    const radek = document.querySelector(".searchRow");
    if (!radek) return;
    for (const nazev of NAZVY) {
      const prvek = document.querySelector(CILE[nazev]);
      if (!prvek) continue;
      prvek.classList.toggle("ln-toolbar-683BB-hidden", !NASTAVENI[nazev]);
    }
    // Sirka .searchActions byla drive fixne 199px v chat.css.
    // Jen pri skryte ikone se ma prepocitat podle skutecne viditelnych tlacitek.
    radek.classList.toggle("ln-toolbar-683BB-customized", NAZVY.some(nazev => !NASTAVENI[nazev]));
  }

  function nastavPreklady() {
    const jazyk = window.LubaNoteI18n?.ziskejJazyk?.() || "cs";
    const texty = PREKLADY[jazyk] || PREKLADY.cs;
    const nadpis = document.getElementById("lnToolbarSettingsTitle");
    const napoveda = document.getElementById("lnToolbarSettingsHint");
    if (nadpis) nadpis.textContent = texty.title;
    if (napoveda) napoveda.textContent = texty.hint;
    for (const nazev of NAZVY) {
      const prvek = document.querySelector(`[data-ln-toolbar-label="${nazev}"]`);
      if (prvek) prvek.textContent = texty[nazev];
    }
  }

  for (const nazev of NAZVY) {
    const vstup = document.querySelector(`[data-ln-toolbar-option="${nazev}"]`);
    if (!vstup) continue;
    vstup.checked = NASTAVENI[nazev];
    vstup.addEventListener("change", () => {
      NASTAVENI[nazev] = vstup.checked;
      nastavViditelnost();
      try { localStorage.setItem(KLIC, JSON.stringify(NASTAVENI)); } catch (_) {}
    });
  }
  nastavViditelnost();
  nastavPreklady();
  window.addEventListener("lubanote:language-change", nastavPreklady);
})();
