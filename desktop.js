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


/* ==================================================
   PATCH 658AE – DESKTOP SIDEBAR / MAIN MENU MERGE
   --------------------------------------------------
   PC only: schová horní tlačítko ⋮ a přesune zbývající
   položky z hlavní nabídky do levého sidebaru.
   Duplicitní první blok Domů/Všechny/Oblíbené/Štítky
   zůstává na PC skrytý. Admin Dashboard je vždy poslední.
================================================== */

(() => {
  const desktopRezim = window.matchMedia(
    "(min-width: 1100px) and (hover: hover) and (pointer: fine)"
  );

  if (!desktopRezim.matches) {
    return;
  }

  const notesModuleButton = document.getElementById("notesModuleButton");
  const desktopSidebarSecondary = document.querySelector(
    ".desktopSidebarNavSecondary"
  );
  const mainMenuButton = document.getElementById("mainMenuButton");
  const mainMenu = document.getElementById("mainMenu");

  const sourceCardSortButton = document.getElementById("cardSortButton");
  const sourceCardSortLabel = document.getElementById("cardSortMenuLabel");
  const sourceStorageButton = document.getElementById("storageScopeMenuButton");
  const sourceStorageLabel = document.getElementById("storageScopeMenuLabel");
  const sourceManageTagsButton = document.getElementById("manageTagsMenuButton");
  const sourceAboutButton = document.getElementById("aboutAppButton");
  const sourceLogoutButton = document.getElementById("logoutButton");
  const sourceSettingsButton = document.getElementById("fontSizeSettingsButton");
  const sourceBackupButton = document.getElementById("backupRestoreButton");
  const sourceAdminButton = document.getElementById("adminDashboardButton");

  const desktopSettingsButton = document.getElementById("desktopSettingsButton");
  const desktopBackupButton = document.getElementById("desktopBackupButton");
  const desktopAdminDashboardButton = document.getElementById(
    "desktopAdminDashboardButton"
  );

  if (!desktopSidebarSecondary) return;

  function otevriPoznamkyNaPozadi() {
    if (!notesModuleButton?.classList.contains("active")) {
      notesModuleButton.click();
    }
  }

  function vytvorSidebarTlacitko(id, iconName, labelText, extraClass = "") {
    let button = document.getElementById(id);
    if (button) return button;

    button = document.createElement("button");
    button.id = id;
    button.type = "button";
    button.className = `desktopSidebarButton ${extraClass}`.trim();

    const icon = document.createElement("span");
    icon.className = "desktopSidebarIcon";
    icon.setAttribute("data-luba-icon", iconName);
    icon.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.textContent = labelText;

    button.append(icon, label);
    return button;
  }

  function nastavLabel(button, text) {
    const label = button?.querySelector("span:last-child");
    if (label) {
      label.textContent = text || "";
    }
  }

  const desktopManageTagsButton = vytvorSidebarTlacitko(
    "desktopManageTagsButton",
    "stitky",
    "Správa štítků"
  );

  const desktopAboutButton = vytvorSidebarTlacitko(
    "desktopAboutButton",
    "info",
    "O aplikaci"
  );

  const desktopCardSortButton = vytvorSidebarTlacitko(
    "desktopCardSortButton",
    "razeni",
    sourceCardSortLabel?.textContent?.trim() || "Nové karty: nahoře"
  );

  const desktopStorageButton = vytvorSidebarTlacitko(
    "desktopStorageButton",
    "obnovit",
    sourceStorageLabel?.textContent?.trim() || "Úložiště: Synchronizované"
  );

  const desktopLogoutButton = vytvorSidebarTlacitko(
    "desktopLogoutButton",
    "odhlasit",
    "Odhlásit se",
    "desktopSidebarButtonDanger"
  );

  const divider = document.getElementById("desktopSidebarMergedDivider") || (() => {
    const el = document.createElement("div");
    el.id = "desktopSidebarMergedDivider";
    el.className = "desktopSidebarDivider desktopSidebarDividerCompact";
    el.setAttribute("aria-hidden", "true");
    return el;
  })();

  // Poskládat kompletní desktop nástroje do levého panelu.
  // Admin Dashboard zůstává schválně úplně poslední.
  const poradi = [
    desktopSettingsButton,
    desktopManageTagsButton,
    desktopBackupButton,
    desktopAboutButton,
    desktopCardSortButton,
    desktopStorageButton,
    divider,
    desktopLogoutButton,
    desktopAdminDashboardButton
  ].filter(Boolean);

  poradi.forEach((node) => {
    desktopSidebarSecondary.appendChild(node);
  });

  // Dynamické položky vznikají až po startu lubaIcons.js, proto je
  // po vložení do sidebaru explicitně naplníme. Bez toho zůstávaly
  // jejich ikony na PC prázdné.
  window.LubaNoteIcons?.naplnDeklarovaneIkony?.(desktopSidebarSecondary);

  function synchronizujDynamickePopisky() {
    nastavLabel(
      desktopCardSortButton,
      sourceCardSortLabel?.textContent?.trim() || "Nové karty: nahoře"
    );
    nastavLabel(
      desktopStorageButton,
      sourceStorageLabel?.textContent?.trim() || "Úložiště: Synchronizované"
    );
  }

  synchronizujDynamickePopisky();

  const observerOptions = { childList: true, characterData: true, subtree: true };
  if (sourceCardSortLabel) {
    new MutationObserver(synchronizujDynamickePopisky).observe(
      sourceCardSortLabel,
      observerOptions
    );
  }
  if (sourceStorageLabel) {
    new MutationObserver(synchronizujDynamickePopisky).observe(
      sourceStorageLabel,
      observerOptions
    );
  }

  function synchronizujAdminViditelnost() {
    if (!desktopAdminDashboardButton) return;
    desktopAdminDashboardButton.hidden = !!sourceAdminButton?.hidden;
  }

  synchronizujAdminViditelnost();
  if (sourceAdminButton) {
    new MutationObserver(synchronizujAdminViditelnost).observe(
      sourceAdminButton,
      { attributes: true, attributeFilter: ["hidden"] }
    );
  }

  desktopManageTagsButton?.addEventListener("click", () => {
    otevriPoznamkyNaPozadi();
    sourceManageTagsButton?.click();
  });

  desktopAboutButton?.addEventListener("click", () => {
    sourceAboutButton?.click();
  });

  desktopCardSortButton?.addEventListener("click", () => {
    otevriPoznamkyNaPozadi();
    sourceCardSortButton?.click();
    synchronizujDynamickePopisky();
  });

  desktopStorageButton?.addEventListener("click", () => {
    otevriPoznamkyNaPozadi();
    sourceStorageButton?.click();
    synchronizujDynamickePopisky();
  });

  desktopLogoutButton?.addEventListener("click", () => {
    sourceLogoutButton?.click();
  });

  if (mainMenuButton) {
    mainMenuButton.hidden = true;
    mainMenuButton.setAttribute("aria-hidden", "true");
    mainMenuButton.setAttribute("tabindex", "-1");
  }
  if (mainMenu) {
    mainMenu.hidden = true;
    mainMenu.setAttribute("aria-hidden", "true");
  }
})();
