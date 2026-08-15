(() => {
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

  const motivy = [
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
    document.body.classList.remove(
      "theme-dark",
      "theme-cappuccino"
    );

    if (theme !== "light") {
      document.body.classList.add(`theme-${theme}`);
    }
  }

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
