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

  /* PATCH 658X – desktop Poznámky / varianta A
     První řádek: kratší hledání + systémové filtry + akce.
     Druhý řádek: pouze uživatelské štítky přes celou šířku.
     Přesouváme skutečné DOM uzly, takže jejich existující listenery zůstávají zachované. */
  const searchRow = document.querySelector(".searchRow");
  const searchActions = document.querySelector(".searchActions");
  const categoryTabs = document.querySelector(".categoryTabs");

  function sestavDesktopNotesToolbar() {
    if (!searchRow || !searchActions || !categoryTabs) return;
    if (searchRow.querySelector(".desktopCategoryActions")) return;

    const desktopCategoryActions = document.createElement("div");
    desktopCategoryActions.className = "desktopCategoryActions";
    desktopCategoryActions.setAttribute("aria-label", "Rychlé filtry poznámek");

    const kategorie = Array.from(
      categoryTabs.querySelectorAll(":scope > .categoryTab")
    );

    kategorie.forEach((tlacitko) => {
      desktopCategoryActions.appendChild(tlacitko);
    });

    searchRow.insertBefore(desktopCategoryActions, searchActions);
    document.body.classList.add("desktopNotesToolbarA");
  }

  sestavDesktopNotesToolbar();

  /* PATCH 658AB – PC: vodorovné rolování uživatelských štítků kolečkem.
     Scrollbar zůstává vizuálně skrytý, ale běžné kolečko / touchpad
     posune řádek štítků do stran. Na krajích necháme událost projít dál,
     aby se stránka mohla normálně svisle rolovat. */
  const tagFilterButtons = document.getElementById("tagFilterButtons");

  tagFilterButtons?.addEventListener(
    "wheel",
    (event) => {
      if (!document.body.classList.contains("desktopNotesToolbarA")) return;
      if (tagFilterButtons.hidden) return;

      const maxScroll = Math.max(
        0,
        tagFilterButtons.scrollWidth - tagFilterButtons.clientWidth
      );
      if (maxScroll <= 1) return;

      const delta =
        Math.abs(event.deltaX) > Math.abs(event.deltaY)
          ? event.deltaX
          : event.deltaY;
      if (!delta) return;

      const pred = tagFilterButtons.scrollLeft;
      const cil = Math.min(maxScroll, Math.max(0, pred + delta));

      if (Math.abs(cil - pred) < 0.5) return;

      tagFilterButtons.scrollLeft = cil;
      event.preventDefault();
    },
    { passive: false }
  );

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
