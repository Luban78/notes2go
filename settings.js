(() => {
  const decreaseFontButton =
    document.getElementById("decreaseFontButton");

  const increaseFontButton =
    document.getElementById("increaseFontButton");

  const fontSizeValue =
    document.getElementById("fontSizeValue");

const openThemeModalButton =
  document.getElementById("openThemeModalButton");

const themeModal =
  document.getElementById("themeModal");

const closeThemeModalButton =
  document.getElementById("closeThemeModalButton");

openThemeModalButton?.addEventListener("click", () => {
  themeModal.hidden = false;
});

closeThemeModalButton?.addEventListener("click", () => {
  themeModal.hidden = true;
});

themeModal?.addEventListener("click", (event) => {
  if (event.target === themeModal) {
    themeModal.hidden = true;
  }
});

const themeOptionButtons =
  document.querySelectorAll("[data-theme-option]");

const currentThemeLabel =
  document.getElementById("currentThemeLabel");

themeOptionButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const selectedTheme =
      button.dataset.themeOption;

    applyTheme(selectedTheme);

    localStorage.setItem(
      "theme",
      selectedTheme
    );

    if (currentThemeLabel) {
      if (selectedTheme === "light") {
        currentThemeLabel.textContent = "Světlý";
      }

      if (selectedTheme === "dark") {
        currentThemeLabel.textContent = "Tmavý";
      }

      if (selectedTheme === "cappuccino") {
        currentThemeLabel.textContent = "Cappuccino";
      }
    }

    themeOptionButtons.forEach((option) => {
      option.classList.remove("active");
    });

    button.classList.add("active");

    themeModal.hidden = true;
  });
});

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

const ulozenyMotiv =
  localStorage.getItem("theme") || "light";

applyTheme(ulozenyMotiv);

if (currentThemeLabel) {
  if (ulozenyMotiv === "light") {
    currentThemeLabel.textContent = "Světlý";
  }
  
  if (ulozenyMotiv === "dark") {
    currentThemeLabel.textContent = "Tmavý";
  }
  
  if (ulozenyMotiv === "cappuccino") {
    currentThemeLabel.textContent = "Cappuccino";
  }
}

themeOptionButtons.forEach((button) => {
  button.classList.toggle(
    "active",
    button.dataset.themeOption === ulozenyMotiv
  );
});
  
  

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

  
})();
