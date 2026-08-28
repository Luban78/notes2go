/* ==================================================
   LubaNote – DESKTOP NAVIGACE
   --------------------------------------------------
   Pouze propojuje nový desktop sidebar s existujícími
   tlačítky a funkcemi aplikace. Mobilní APK neovlivňuje.
================================================== */

(() => {
  const desktopRezim = window.matchMedia(
    "(min-width: 1100px) and (hover: hover) and (pointer: fine)"
  );

  if (!desktopRezim.matches) {
    return;
  }

  const notesModuleButton =
    document.getElementById("notesModuleButton");

  const favoriteFilterButton =
    document.getElementById("favoriteFilterButton");

  const secretFilterButton =
    document.getElementById("secretFilterButton");

  const allNotesButton =
    document.querySelector('[data-area-filter="all"]');

  const manageTagsMenuButton =
    document.getElementById("manageTagsMenuButton");

  const settingsButton =
    document.getElementById("fontSizeSettingsButton");

  const backupButton =
    document.getElementById("backupRestoreButton");

  const desktopHomeButton =
    document.getElementById("desktopHomeButton");

  const desktopAllNotesButton =
    document.getElementById("desktopAllNotesButton");

  const desktopFavoriteButton =
    document.getElementById("desktopFavoriteButton");

  const desktopTagsButton =
    document.getElementById("desktopTagsButton");

  const desktopSettingsButton =
    document.getElementById("desktopSettingsButton");

  const desktopBackupButton =
    document.getElementById("desktopBackupButton");

  const sidebarButtons = [
    desktopHomeButton,
    desktopAllNotesButton,
    desktopFavoriteButton,
    desktopTagsButton,
    desktopSettingsButton,
    desktopBackupButton
  ].filter(Boolean);

  function nastavAktivniSidebar(button) {
    sidebarButtons.forEach((polozka) => {
      polozka.classList.toggle(
        "active",
        polozka === button
      );
    });
  }

  function otevriPoznamky() {
    if (!notesModuleButton?.classList.contains("active")) {
      notesModuleButton?.click();
    }
  }

  function vypniSpecialniFiltry() {
    if (favoriteFilterButton?.classList.contains("active")) {
      favoriteFilterButton.click();
    }

    if (
      secretFilterButton &&
      !secretFilterButton.hidden &&
      secretFilterButton.classList.contains("active")
    ) {
      secretFilterButton.click();
    }
  }

  function zobrazVsechnyPoznamky(sidebarButton) {
    otevriPoznamky();
    vypniSpecialniFiltry();
    allNotesButton?.click();
    nastavAktivniSidebar(sidebarButton);
  }

  desktopHomeButton?.addEventListener("click", () => {
    zobrazVsechnyPoznamky(desktopHomeButton);
  });

  desktopAllNotesButton?.addEventListener("click", () => {
    zobrazVsechnyPoznamky(desktopAllNotesButton);
  });

  desktopFavoriteButton?.addEventListener("click", () => {
    otevriPoznamky();

    if (
      secretFilterButton &&
      !secretFilterButton.hidden &&
      secretFilterButton.classList.contains("active")
    ) {
      secretFilterButton.click();
    }

    allNotesButton?.click();

    if (!favoriteFilterButton?.classList.contains("active")) {
      favoriteFilterButton?.click();
    }

    nastavAktivniSidebar(desktopFavoriteButton);
  });

  desktopTagsButton?.addEventListener("click", () => {
    otevriPoznamky();
    manageTagsMenuButton?.click();
    nastavAktivniSidebar(desktopTagsButton);
  });

  desktopSettingsButton?.addEventListener("click", () => {
    settingsButton?.click();
    nastavAktivniSidebar(desktopSettingsButton);
  });

  desktopBackupButton?.addEventListener("click", () => {
    backupButton?.click();
    nastavAktivniSidebar(desktopBackupButton);
  });

  favoriteFilterButton?.addEventListener("click", () => {
    if (favoriteFilterButton.classList.contains("active")) {
      nastavAktivniSidebar(desktopFavoriteButton);
    }
  });
})();
