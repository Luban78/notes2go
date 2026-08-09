/* ========================================
   NASTAVENÍ NOTES2GO
======================================== */

(() => {
  const decreaseFontButton =
  document.getElementById("decreaseFontButton");

const increaseFontButton =
  document.getElementById("increaseFontButton");

const fontSizeValue =
  document.getElementById("fontSizeValue");
  
const themeButtons =
  document.querySelectorAll("[data-theme]");
  
let currentFontSize = 16;
const savedFontSize =
  localStorage.getItem("fontSize");

if (savedFontSize) {
  currentFontSize = Number(savedFontSize);

  document.documentElement.style.setProperty(
    "--font-size",
    `${currentFontSize}px`
  );

  fontSizeValue.textContent =
    `${currentFontSize} px`;
}
increaseFontButton.addEventListener("click", () => {
  currentFontSize = Math.min(currentFontSize + 1, 28);
  
  localStorage.setItem("fontSize", currentFontSize);
  

  document.documentElement.style.setProperty(
    "--font-size",
    `${currentFontSize}px`
  );

  fontSizeValue.textContent =
    `${currentFontSize} px`;
});

const savedTheme =
  localStorage.getItem("theme");

if (savedTheme === "dark") {
  document.body.classList.add("theme-dark");
}


decreaseFontButton.addEventListener("click", () => {
  currentFontSize = Math.max(currentFontSize - 1, 12);
  
  localStorage.setItem("fontSize", currentFontSize);

  document.documentElement.style.setProperty(
    "--font-size",
    `${currentFontSize}px`
  );

  fontSizeValue.textContent =
    `${currentFontSize} px`;
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

  settingsOpenButton.addEventListener("click", () => {
    settingsModal.hidden = false;
    settingsMainMenu.hidden = true;
  });


  closeSettingsButton.addEventListener("click", () => {
    settingsModal.hidden = true;
  });
  
  settingsExportButton.addEventListener("click", () => {
  exportTasks();
});

settingsImportButton.addEventListener("click", () => {
  importFile.click();
});

themeButtons.forEach(button => {
  button.addEventListener("click", () => {
    const selectedTheme = button.dataset.theme;
    
    document.body.classList.remove(
      "theme-dark",
      "theme-cappuccino"
    );
    
    if (selectedTheme !== "light") {
      document.body.classList.add(
        `theme-${selectedTheme}`
      );
    }
    
    localStorage.setItem(
      "theme",
      selectedTheme
    );
  });
});



})();