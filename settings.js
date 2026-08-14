(() => {
  const decreaseFontButton =
    document.getElementById("decreaseFontButton");

  const increaseFontButton =
    document.getElementById("increaseFontButton");

  const fontSizeValue =
    document.getElementById("fontSizeValue");

  const themeButtons =
    document.querySelectorAll("[data-theme]");

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

  applyFontSize();
  applyTheme(localStorage.getItem("theme") || "light");

  increaseFontButton.addEventListener("click", () => {
    currentFontSize = Math.min(currentFontSize + 1, 20);
    localStorage.setItem("fontSize", currentFontSize);
    applyFontSize();
  });

  decreaseFontButton.addEventListener("click", () => {
    currentFontSize = Math.max(currentFontSize - 1, 13);
    localStorage.setItem("fontSize", currentFontSize);
    applyFontSize();
  });

  settingsOpenButton.addEventListener("click", () => {
    settingsModal.hidden = false;
    settingsMainMenu.hidden = true;
  });

  closeSettingsButton.addEventListener("click", () => {
    settingsModal.hidden = true;
  });

  settingsExportButton.addEventListener("click", exportTasks);

  settingsImportButton.addEventListener("click", () => {
    importFile.click();
  });

  themeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const selectedTheme = button.dataset.theme;
      applyTheme(selectedTheme);
      localStorage.setItem("theme", selectedTheme);
    });
  });
})();
