(async () => {
  const decreaseFontButton =
    document.getElementById("decreaseFontButton");

  const increaseFontButton =
    document.getElementById("increaseFontButton");

  const fontSizeValue =
    document.getElementById("fontSizeValue");

  const openThemeModalButton =
    document.getElementById("openThemeModalButton");

  const currentThemeLabel =
    document.getElementById("currentThemeLabel");

  const openIconStyleModalButton =
    document.getElementById("openIconStyleModalButton");

  const currentIconStyleLabel =
    document.getElementById("currentIconStyleLabel");

  const openReminderDelaySettingsButton =
  document.getElementById(
    "openReminderDelaySettingsButton"
  );
  
  const settingsModal =
    document.getElementById("settingsModal");

  const closeSettingsButton =
    document.getElementById("closeSettingsButton");

  const settingsOpenButton =
    document.getElementById("fontSizeSettingsButton");

  const settingsMainMenu =
    document.getElementById("mainMenu");

  const settingsExportButton =
    document.getElementById("settingsExportButton");

  const settingsImportButton =
    document.getElementById("settingsImportButton");

  const importFile =
    document.getElementById("importFile");

/*  const motivy = [
    {
      hodnota: "light",
      popisek: "Světlý"
    },
    {
      hodnota: "dark",
      popisek: "Tmavý"
    },
    {
      hodnota: "cappuccino",
      popisek: "Cappuccino"
    }
  ];
  */
  const nactenaTemata = await nactiTemata();

//console.log(nactenaTemata);


const motivy = nactenaTemata.map(tema => ({
  hodnota: tema.id,
  popisek: tema.nazev
}));


  let currentFontSize = Number(
    localStorage.getItem("fontSize") || 16
  );

  if (!Number.isFinite(currentFontSize)) {
    currentFontSize = 16;
  }

  currentFontSize = Math.min(
    20,
    Math.max(13, currentFontSize)
  );

  function applyFontSize() {
    document.documentElement.style.setProperty(
      "--font-size",
      `${currentFontSize}px`
    );

    fontSizeValue.textContent =
      `${currentFontSize} px`;
  }

  function applyTheme(theme) {
  const tridyTemat = [...document.body.classList]
    .filter(trida => trida.startsWith("theme-"));

  document.body.classList.remove(...tridyTemat);

  if (theme !== "light") {
    document.body.classList.add(`theme-${theme}`);
  }
}

openReminderDelaySettingsButton?.addEventListener(
  "click",
  () => {
    const ulozeneRychleOdlozeni =
      JSON.parse(
        localStorage.getItem("rychleOdlozeni")
      ) || {
        volba1: "15",
        volba2: "30",
        volba3: "60",
        volba4: "tomorrow"
      };

    const ziskejPopisek = (
      hodnota,
      moznosti
    ) => {
      const nalezenaMoznost =
        moznosti.find(
          (moznost) =>
            moznost.hodnota === hodnota
        );

      return nalezenaMoznost
        ? nalezenaMoznost.popisek
        : hodnota;
    };

    const moznostiVolba1 = [
      { hodnota: "5", popisek: "5 minut" },
      { hodnota: "10", popisek: "10 minut" },
      { hodnota: "15", popisek: "15 minut" },
      { hodnota: "30", popisek: "30 minut" },
      { hodnota: "60", popisek: "1 hodina" }
    ];

    const moznostiVolba2 = [
      { hodnota: "5", popisek: "5 minut" },
      { hodnota: "10", popisek: "10 minut" },
      { hodnota: "15", popisek: "15 minut" },
      { hodnota: "30", popisek: "30 minut" },
      { hodnota: "60", popisek: "1 hodina" }
    ];

    const moznostiVolba3 = [
      { hodnota: "15", popisek: "15 minut" },
      { hodnota: "30", popisek: "30 minut" },
      { hodnota: "60", popisek: "1 hodina" },
      { hodnota: "120", popisek: "2 hodiny" },
      { hodnota: "180", popisek: "3 hodiny" }
    ];

    const moznostiVolba4 = [
      { hodnota: "tomorrow", popisek: "Zítra 8:00" },
      { hodnota: "120", popisek: "2 hodiny" },
      { hodnota: "180", popisek: "3 hodiny" }
    ];

    otevriNastavovaciModal({
      nadpis: "Rychlé odložení",

      polozky: [
        {
          klic: "volba1",
          popisek: "1. volba",
          hodnota:
            ulozeneRychleOdlozeni.volba1,
          zobrazeni: ziskejPopisek(
            ulozeneRychleOdlozeni.volba1,
            moznostiVolba1
          ),
          moznosti: moznostiVolba1
        },

        {
          klic: "volba2",
          popisek: "2. volba",
          hodnota:
            ulozeneRychleOdlozeni.volba2,
          zobrazeni: ziskejPopisek(
            ulozeneRychleOdlozeni.volba2,
            moznostiVolba2
          ),
          moznosti: moznostiVolba2
        },

        {
          klic: "volba3",
          popisek: "3. volba",
          hodnota:
            ulozeneRychleOdlozeni.volba3,
          zobrazeni: ziskejPopisek(
            ulozeneRychleOdlozeni.volba3,
            moznostiVolba3
          ),
          moznosti: moznostiVolba3
        },

        {
          klic: "volba4",
          popisek: "4. volba",
          hodnota:
            ulozeneRychleOdlozeni.volba4,
          zobrazeni: ziskejPopisek(
            ulozeneRychleOdlozeni.volba4,
            moznostiVolba4
          ),
          moznosti: moznostiVolba4
        }
      ],

      poUlozeni: (hodnoty) => {
        localStorage.setItem(
          "rychleOdlozeni",
          JSON.stringify(hodnoty)
        );

        /*console.log(
          "Uložené rychlé odložení:",
          hodnoty
        );*/
      }
    });
  }
);
  function ziskejPopisekMotivu(hodnota) {
    return (
      motivy.find(
        (motiv) => motiv.hodnota === hodnota
      )?.popisek || "Světlý"
    );
  }

  function nastavPopisekMotivu(hodnota) {
    if (!currentThemeLabel) {
      return;
    }

    currentThemeLabel.textContent =
      ziskejPopisekMotivu(hodnota);
  }

  const stylyIkon = [
    {
      hodnota: "auto",
      popisek: "Automaticky"
    },
    {
      hodnota: "classic",
      popisek: "Původní ikony"
    },
    {
      hodnota: "svg",
      popisek: "SVG ikony"
    }
  ];

  function ziskejPopisekStyluIkon(hodnota) {
    return (
      stylyIkon.find(
        (styl) => styl.hodnota === hodnota
      )?.popisek || "Automaticky"
    );
  }

  function nastavPopisekStyluIkon(hodnota) {
    if (!currentIconStyleLabel) {
      return;
    }

    currentIconStyleLabel.textContent =
      ziskejPopisekStyluIkon(hodnota);
  }

  function otevriModalStyluIkon() {
    if (
      typeof window.otevriVyberovyModal !==
      "function"
    ) {
      return;
    }

    const ulozenyStyl =
      window.LubaNoteIcons?.ziskejStylIkon?.() ||
      "auto";

    window.otevriVyberovyModal({
      nadpis: "Styl ikon",
      moznosti: stylyIkon,
      vybranaHodnota: ulozenyStyl,
      poVyberu: (novyStyl) => {
        window.LubaNoteIcons?.nastavStylIkon?.(
          novyStyl
        );

        nastavPopisekStyluIkon(novyStyl);
      }
    });
  }

  function otevriModalMotivu() {
    if (
      typeof window.otevriVyberovyModal !==
      "function"
    ) {
      console.error(
        "Chybí choiceModal.js – výběrový modal nelze otevřít."
      );
      return;
    }

    const ulozenyMotiv =
      localStorage.getItem("theme") || "light";

    window.otevriVyberovyModal({
      nadpis: "Barevný motiv",
      moznosti: motivy,
      vybranaHodnota: ulozenyMotiv,
      poVyberu: (novyMotiv) => {
        applyTheme(novyMotiv);
        localStorage.setItem(
          "theme",
          novyMotiv
        );
        nastavPopisekMotivu(novyMotiv);
      }
    });
  }

  applyFontSize();

  const ulozenyMotiv =
    localStorage.getItem("theme") || "light";

  applyTheme(ulozenyMotiv);
  nastavPopisekMotivu(ulozenyMotiv);

  const ulozenyStylIkon =
    window.LubaNoteIcons?.ziskejStylIkon?.() ||
    "auto";

  nastavPopisekStyluIkon(ulozenyStylIkon);

  increaseFontButton.addEventListener("click", () => {
    currentFontSize = Math.min(
      currentFontSize + 1,
      20
    );

    localStorage.setItem(
      "fontSize",
      currentFontSize
    );

    applyFontSize();
  });

  decreaseFontButton.addEventListener("click", () => {
    currentFontSize = Math.max(
      currentFontSize - 1,
      13
    );

    localStorage.setItem(
      "fontSize",
      currentFontSize
    );

    applyFontSize();
  });

  openThemeModalButton?.addEventListener(
    "click",
    otevriModalMotivu
  );

  openIconStyleModalButton?.addEventListener(
    "click",
    otevriModalStyluIkon
  );

  window.addEventListener(
    "lubanote:icon-style-change",
    () => {
      nastavPopisekStyluIkon(
        window.LubaNoteIcons?.ziskejStylIkon?.() ||
        "auto"
      );
    }
  );

  settingsOpenButton.addEventListener("click", () => {
    settingsModal.hidden = false;
    settingsMainMenu.hidden = true;
  });

  closeSettingsButton.addEventListener("click", () => {
    settingsModal.hidden = true;
  });

  settingsExportButton.addEventListener(
    "click",
    exportTasks
  );

  settingsImportButton.addEventListener("click", () => {
    importFile.click();
  });
})();
