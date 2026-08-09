/* ========================================
   NASTAVENÍ NOTES2GO
======================================== */

(() => {

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


})();