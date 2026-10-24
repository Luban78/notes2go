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


/* ==================================================
   PATCH 693A – PC: počty vedle názvů hlavních modulů.
   Pouze široký desktop; žádná změna mobilních záložek.
   Data se pouze čtou (Poznámky / Planner / Dokumenty).
================================================== */
(() => {
  if (!window.matchMedia("(min-width: 1100px) and (hover: hover) and (pointer: fine)").matches) return;

  const moduly = [
    ["notes", document.getElementById("notesModuleButton")],
    ["planner", document.getElementById("plannerModuleButton")],
    ["documents", document.getElementById("documentsModuleButton")]
  ];
  const pocitadla = Object.create(null);
  moduly.forEach(([klic, tlacitko]) => {
    if (!tlacitko) return;
    const cislo = document.createElement("span");
    cislo.className = "lnDesktopModuleCount693A";
    cislo.dataset.lnCountModule = klic;
    cislo.setAttribute("aria-hidden", "true");
    cislo.hidden = true; // Bezpečně neukazovat neznámé hodnoty jako nulu.
    tlacitko.querySelector(".moduleTabText")?.after(cislo);
    pocitadla[klic] = cislo;
  });

  function ukazPocet(klic, hodnota) {
    const cislo = pocitadla[klic];
    if (!cislo || !Number.isSafeInteger(hodnota) || hodnota < 0) return;
    cislo.textContent = new Intl.NumberFormat(
      window.LubaNoteI18n?.ziskejLocale?.() || "cs-CZ"
    ).format(hodnota);
    cislo.hidden = false;
  }

  function obnovPocetPoznamekAPlanu() {
    try {
      if (typeof loadTask !== "function") return;
      const poznamky = loadTask();
      if (!Array.isArray(poznamky)) return;
      const prostor = window.LubaNoteStorageScope?.ziskejAktivni?.() || "cloud";
      ukazPocet("notes", poznamky.filter((note) => (
        (window.LubaNoteStorageScope?.ziskej?.(note) ||
          (note?.storageScope === "local" ? "local" : "cloud")) === prostor
      )).length);
      // Planner má vlastní, deduplikovaný seznam (lokální + položky v poznámkách).
      if (typeof loadPlannedItems === "function") {
        const polozky = loadPlannedItems();
        if (Array.isArray(polozky)) ukazPocet("planner", polozky.length);
      }
    } catch (error) {
      console.warn("PC počítadla modulů: načtení počtu nebylo dostupné", error);
    }
  }

  let obnovitTimer = null;
  function naplanujObnoveni() {
    if (obnovitTimer !== null) clearTimeout(obnovitTimer);
    obnovitTimer = setTimeout(() => {
      obnovitTimer = null;
      obnovPocetPoznamekAPlanu();
    }, 160);
  }

  // renderTasks přestavuje karty po vytvoření, smazání i synchronizaci.
  const kartaKontejner = document.getElementById("pinnedLeft");
  if (kartaKontejner) {
    new MutationObserver(naplanujObnoveni).observe(kartaKontejner, {
      childList: true, subtree: false
    });
  }
  const storageIkona = document.getElementById("notesStorageScopeIcon");
  if (storageIkona) {
    new MutationObserver(naplanujObnoveni).observe(storageIkona, {
      attributes: true, attributeFilter: ["data-scope"]
    });
  }

  moduly.forEach(([, tlacitko]) => tlacitko?.addEventListener("click", naplanujObnoveni));
  window.addEventListener("lubanote:planner-changed", naplanujObnoveni);
  window.addEventListener("lubanote:language-change", naplanujObnoveni);
  window.addEventListener("focus", naplanujObnoveni);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) naplanujObnoveni();
  });

  // Počet souborů oznamuje existující knihovna Dokumentů po svém refreshi.
  window.addEventListener("lubanote:documents-count-changed-693A", (udalost) => {
    ukazPocet("documents", udalost.detail?.count);
  });

  naplanujObnoveni();
})();


/* PATCH 693B – desktop-only přesun existujících ovládacích prvků. */
(() => {
  if (!matchMedia("(min-width: 1100px) and (hover: hover) and (pointer: fine)").matches) return;
  const $ = (selector) => document.querySelector(selector);
  const toolbar = $(".searchRow");
  const filters = $(".desktopCategoryActions");
  const actions = $(".searchActions");
  const status = $("#lnDesktopStatus692A");
  if (!toolbar || !filters || !actions || !status) return;

  // Přesouváme skutečné uzly v DOM: listenery i nastavení zůstávají funkční.
  const moon = $("#quickThemeButton");
  const bell = $("#lnPcReminderBell692C");
  if (moon && bell) status.insertBefore(moon, bell);

  const orderedFilters = [
    '[data-area-filter="all"]',
    '[data-area-filter="work"]',
    '[data-area-filter="private"]',
    '#favoriteFilterButton',
    '#hiddenFilterButton',
    '#trashFilterButton'
  ];
  orderedFilters.forEach((selector) => {
    const node = $(selector);
    if (node) filters.appendChild(node);
  });
  // Tajné poznámky nesmí zmizet: zůstávají jako doplňkový filtr.
  const secret = $("#secretFilterButton");
  if (secret) filters.appendChild(secret);

  const newTag = document.createElement("button");
  newTag.type = "button";
  newTag.id = "lnDesktopNewTag693B";
  newTag.textContent = "Nový štítek";
  newTag.title = "Vytvořit nový štítek";
  newTag.setAttribute("aria-label", "Nový štítek");
  newTag.addEventListener("click", () => {
    const original = $("#tagFilterButtons .newTagFilterButton");
    if (original) original.click();
    else $("#manageTagsMenuButton")?.click();
  });
  filters.appendChild(newTag);

  // Slovník, sdílení a chat jsou původní funkční tlačítka.
  ["englishLearningHeaderButton", "sharingInvitationsButton", "chatButton", "changeViewButton"]
    .forEach((id) => {
      const button = document.getElementById(id);
      if (button) actions.appendChild(button);
    });

  const view = $("#changeViewButton");
  if (view) {
    view.title = "Přepnout 4 / 3 sloupce";
    view.setAttribute("aria-label", "Přepnout 4 / 3 sloupce");

  }

  // Pouze aktivní lokální prostor: cloudová kvóta nemá smysl.
  const sync = $("#lnDesktopSync692A");
  const refreshScope = () => {
    const local = window.LubaNoteStorageScope?.ziskejAktivni?.() === "local";
    document.body.classList.toggle("lnDesktopLocal693B", local);
    if (local && sync && sync.textContent.includes("▣ Pouze v zařízení")) {
      sync.textContent = "📱 Pouze v zařízení";
    }
  };
  refreshScope();
  const scopeIcon = $("#notesStorageScopeIcon");
  if (scopeIcon) new MutationObserver(refreshScope).observe(scopeIcon, {
    attributes: true, attributeFilter: ["data-scope", "class", "title"]
  });
  const scopeMenu = $("#storageScopeMenuButton");
  scopeMenu?.addEventListener("click", () => setTimeout(refreshScope, 250));
  window.addEventListener("focus", refreshScope);
  window.addEventListener("lubanote:sync-state", refreshScope);
  // Po přepnutí úložiště se aktualizuje i při změně textu stavu.
  if (sync) new MutationObserver(refreshScope).observe(sync, {childList:true, characterData:true, subtree:true});
})();

/* 693D – samostatné PC tlačítko pro cyklické procházení skutečných témat. */
(() => {
  const media = matchMedia("(min-width:1100px) and (hover:hover) and (pointer:fine)");
  if (!media.matches) return;
  const moon = document.getElementById("quickThemeButton");
  if (!moon || !moon.parentNode) return;
  const button = document.createElement("button");
  button.type = "button";
  button.id = "lnDesktopThemeCycle693D";
  button.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a9 9 0 0 0 0 18h1.5a2 2 0 0 0 1.4-3.4 1.7 1.7 0 0 1 1.2-2.9h1.5A4.4 4.4 0 0 0 22 10.3 9.2 9.2 0 0 0 12 3Z"/><circle cx="7.5" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="11" cy="6.8" r="1" fill="currentColor" stroke="none"/><circle cx="16.2" cy="8.2" r="1" fill="currentColor" stroke="none"/><circle cx="7.8" cy="15" r="1" fill="currentColor" stroke="none"/></svg>';
  button.title = "Další barevný motiv";
  button.setAttribute("aria-label","Přepnout na další barevný motiv");
  moon.parentNode.insertBefore(button, moon);
  button.addEventListener("click", async () => {
    if (typeof nactiTemata !== "function") return;
    const available = await nactiTemata();
    const themes = (Array.isArray(available) ? available : [])
      .filter(item => item && typeof item.id === "string" && item.id.length);
    if (!themes.length) return;
    const old = localStorage.getItem("theme") || "light";
    const at = themes.findIndex(item => item.id === old);
    const next = themes[(at + 1) % themes.length];
    // Stejná pravidla aplikace motivu jako v settings.js, bez nového registru témat.
    for (const name of [...document.body.classList]) {
      if (name.startsWith("theme-")) document.body.classList.remove(name);
    }
    if (next.id !== "light") document.body.classList.add("theme-" + next.id);
    localStorage.setItem("theme",next.id);
    localStorage.setItem(
      ["light","cappuccino"].includes(next.id)
        ? "lubanote_quick_theme_day_v1"
        : "lubanote_quick_theme_night_v1",
      next.id
    );
    const label = document.getElementById("currentThemeLabel");
    if (label) label.textContent = next.nazev || next.id;
    const dark = !["light","cappuccino"].includes(next.id);
    moon.dataset.quickThemeMode = dark ? "night" : "day";
    moon.title = dark ? "Zapnout denní režim" : "Zapnout noční režim";
    moon.setAttribute("aria-label",moon.title);
    button.title = `Motiv: ${next.nazev || next.id} – další motiv`;
  });
})();

/* 693E – širší klikací plochy filtrů, beze změny mobilu. */
(() => {
  if (!matchMedia("(min-width:1100px) and (hover:hover) and (pointer:fine)").matches) return;
  const buttons = [
    ...document.querySelectorAll(".desktopCategoryActions > button"),
    ...["englishLearningHeaderButton","sharingInvitationsButton","chatButton"]
      .map(id => document.getElementById(id)).filter(Boolean)
  ];
  for (const button of buttons) {
    const width = button.getBoundingClientRect().width;
    if (width > 0) {
      button.style.setProperty("min-width", `${Math.ceil(width + 5)}px`, "important");
      button.style.setProperty("box-sizing", "border-box", "important");
    }
  }
})();
