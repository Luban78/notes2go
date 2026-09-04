/*
 * LubaNote – jazykový motor
 *
 * Překlady nejsou v tomto souboru. Každý jazyk žije ve vlastním
 * lang-xx.js souboru a zaregistruje se do window.LubaNoteLanguagePacks.
 */
(() => {
  const KLIC_ULOZENI = "lubaNoteLanguage";

  const balicky = new Map(
    (window.LubaNoteLanguagePacks || []).map(
      (balicek) => [balicek.id, balicek]
    )
  );

  let aktualniJazykId = null;

  const textoveVazby = [
    ["#loginTitle", "login.title"],
    ["#loginButton", "login.submit"],
    ["#loginModeSignIn", "login.modeSignIn"],
    ["#loginModeRegister", "login.modeRegister"],
    ["#accountStatusRefresh", "login.checkStatus"],
    ["#accountStatusSignOut", "menu.logout"],

    ["#desktopHomeButton span:last-child", "nav.home"],
    ["#desktopAllNotesButton span:last-child", "nav.allNotes"],
    ["#desktopFavoriteButton span:last-child", "nav.favorites"],
    ["#desktopTagsButton span:last-child", "nav.tags"],
    ["#desktopSettingsButton span:last-child", "nav.settings"],
    ["#desktopBackupButton span:last-child", "nav.backup"],

    ["#notesModuleButton .moduleTabText", "modules.notes"],
    ["#plannerModuleButton .moduleTabText", "modules.planner"],
    ["#remindersModuleButton .moduleTabText", "modules.reminders"],

    ["#fontSizeSettingsButton .mainMenuLabel", "nav.settings"],
    ["#manageTagsMenuButton .mainMenuLabel", "menu.manageTags"],
    ["#backupRestoreButton .mainMenuLabel", "nav.backup"],
    ["#aboutAppButton .mainMenuLabel", "menu.about"],
    ["#logoutButton .mainMenuLabel", "menu.logout"],

    [".categoryTabs > .categoryTab[data-area-filter='all']", "filter.all"],
    [".categoryTabs > .categoryTab[data-area-filter='work'] span:last-child", "filter.work"],
    [".categoryTabs > .categoryTab[data-area-filter='private'] span:last-child", "filter.private"],
    ["#noSearchResults", "search.none"],

    [".calendarWeekdays span:nth-child(1)", "weekday.mo"],
    [".calendarWeekdays span:nth-child(2)", "weekday.tu"],
    [".calendarWeekdays span:nth-child(3)", "weekday.we"],
    [".calendarWeekdays span:nth-child(4)", "weekday.th"],
    [".calendarWeekdays span:nth-child(5)", "weekday.fr"],
    [".calendarWeekdays span:nth-child(6)", "weekday.sa"],
    [".calendarWeekdays span:nth-child(7)", "weekday.su"],
    ["#calendarSelectedDate", "calendar.selectedDay"],
    ["#dayDetailTitle", "calendar.selectedDay"],
    ["#recurringOverviewScreen .recurringOverviewHeader h2", "recurring.title"],

    [".remindersFilter[data-reminder-filter='all']", "filter.all"],
    [".remindersStatusTab[data-reminder-status='active']", "reminders.active"],
    [
      ".remindersStatusTab[data-reminder-status='overdue']",
      "reminders.overdue",
      null,
      "leadingText"
    ],
    [".remindersOverdueGroup h3", "reminders.overdue"],
    ["#remindersToday", "reminders.today", null, "parentHeading"],
    ["#remindersTomorrow", "reminders.tomorrow", null, "parentHeading"],
    ["#remindersLater", "reminders.later", null, "parentHeading"],
    ["#reminderQuickLabel", "reminders.label"],
    ["#reminderQuickTitle", "reminders.untitled"],
    ["#reminderTomorrowMorningButton", "reminders.tomorrow8"],
    ["#reminderQuickDateLabel", "reminders.date"],
    ["#reminderQuickTimeLabel", "reminders.time"],
    ["#reminderQuickDone span:last-child", "reminders.done"],
    ["#reminderQuickDelete span:last-child", "reminders.delete"],
    ["#reminderQuickOpen span:last-child", "reminders.openNote"],
    ["#reminderQuickTurnOff span:last-child", "reminders.turnOff"],

    ["#modalDateLabel", "editor.date"],
    ["#modalTimeLabel", "editor.time"],
    ["#tagPanel h3", "editor.tags"],
    ["#newTagButton span:last-child", "editor.newTag"],
    ["#noteBacklinksTitle", "backlinks.title", { count: 0 }],

    ["#cardMenu [data-card-action='plan'] span:last-child", "actions.term"],
    ["#cardMenu [data-card-action='pin'] span:last-child", "actions.pin"],
    ["#cardMenu [data-card-action='delete'] span:last-child", "actions.delete"],
    ["#cardMenu [data-card-action='more'] span:last-child", "actions.more"],
    ["#deleteConfirmModal h3", "trash.moveTitle"],
    ["#deleteConfirmModal p", "trash.moveMessage"],
    ["#cancelDeleteButton", "actions.cancel"],
    ["#confirmDeleteButton span:last-child", "trash.moveAction"],
    ["#trashTitle", "trash.title"],
    ["#trashInfo", "trash.autoDeleteInfo"],
    ["#trashEmpty", "trash.empty"],
    ["#trashConfirmModal h3", "trash.deleteForeverTitle"],
    ["#trashConfirmText", "trash.deleteConfirm"],
    ["#trashConfirmCancel", "actions.cancel"],
    ["#trashConfirmDelete span:last-child", "trash.deleteForever"],

    ["#timePickerModal h2", "timePicker.title"],
    [".timeRepeatHeading", "repeat.title"],
    ["[data-repeat-preset='none']", "repeat.no"],
    ["[data-repeat-preset='daily']", "repeat.daily"],
    ["[data-repeat-preset='weekly1']", "repeat.weekly"],
    ["[data-repeat-preset='weekly2']", "repeat.twoWeeks"],
    ["[data-repeat-preset='monthly']", "repeat.monthly"],
    ["#timeRepeatSummary", "repeat.none"],
    ["#timeRepeatDays [data-repeat-day='1']", "weekday.mo"],
    ["#timeRepeatDays [data-repeat-day='2']", "weekday.tu"],
    ["#timeRepeatDays [data-repeat-day='3']", "weekday.we"],
    ["#timeRepeatDays [data-repeat-day='4']", "weekday.th"],
    ["#timeRepeatDays [data-repeat-day='5']", "weekday.fr"],
    ["#timeRepeatDays [data-repeat-day='6']", "weekday.sa"],
    ["#timeRepeatDays [data-repeat-day='0']", "weekday.su"],

    ["#plannerModal h2", "planner.plan"],
    ["#plannerDateLabel", "editor.date"],
    ["#plannerTimeLabel", "editor.time"],
    ["#savePlannerButton span:last-child", "planner.plan"],
    ["#cancelPlannerButton", "actions.cancel"],
    ["#plannerModal label:nth-of-type(1)", "editor.date"],
    ["#plannerModal label:nth-of-type(2)", "editor.time"],

    ["#settingsModal .settingsHeader h2", "settings.title"],
    ["#settingsModal .settingsSection:nth-of-type(1) > h3", "settings.appearance"],
    ["#settingsModal .fontSizeSetting > span:first-child", "settings.fontSize"],
    ["#openThemeModalButton" , "theme.dark", null, "themeLabel"],
    ["#settingsModal .themeSetting:has(#openThemeModalButton) > span:first-child", "settings.theme"],
    ["#settingsModal .themeSetting:has(#openIconStyleModalButton) > span:first-child", "settings.iconStyle"],
    ["#settingsModal .settingsSection:nth-of-type(2) > h3", "settings.reminders"],
    ["#settingsModal .themeSetting:has(#openReminderDelaySettingsButton) > span:first-child", "settings.quickDelay"],
    ["#openReminderDelaySettingsButton span:first-child", "settings.configure"],
    ["#overdueRetentionSettingLabel", "settings.overdueRetention"],
    ["#dataSettingsSection h3", "settings.data"],
    ["#settingsExportButton", "settings.export"],
    ["#settingsImportButton", "settings.import"],
    ["#settingsModal .settingsSection:last-of-type > h3", "settings.about"],
    ["#settingsModal .themeSetting:has(#settingsVersionValue) > span:first-child", "settings.version"],
    ["#settingsModal .themeSetting:has(#openAboutFromSettingsButton) > span:first-child", "settings.appInfo"],
    ["#openAboutFromSettingsButton span:first-child", "settings.open"],
    ["#settingsLanguageLabel", "language.label"],

    ["#aboutModal p", "about.description"],
    ["#newTagModalTitle", "tags.new"],
    ["#saveNewTagButton", "tags.add"],
    ["#cancelNewTagModalButton", "actions.cancel"],
    ["#saveNewTagModalButton", "actions.create"],
    ["#manageTagsModal h2", "tags.manage"],
    ["#deleteTagConfirmModal h3", "tags.deleteTitle"],

    ["#appMessageTitle", "message.notice"],
    ["#appMessageSaveButton", "actions.save"],
    ["#appMessageDiscardButton", "actions.discard"],
    ["#closeAppMessageButton", "actions.ok"],
    ["#appMessageSecretButton span:last-child", "secret.saveSecret"],
    ["#appMessageNormalButton span:last-child", "secret.saveNormal"],
    ["#actionStatusText", "status.done"],

    ["#secretSaveAsSecretButton span:last-child", "secret.saveSecret"],
    ["#secretSaveNormalButton span:last-child", "secret.saveNormal"],
    ["#secretUnlockTitle span:last-child", "secret.mode"],
    ["#secretUnlockDescription", "secret.enterMain"],
    ["#secretBiometricUnlockButton span:last-child", "secret.fingerprint"],
    ["#secretBiometricEnableRow strong", "secret.nextFingerprint"],
    ["#secretBiometricEnableRow small", "secret.thisDevice"],
    ["#cancelSecretUnlockButton", "actions.cancel"],
    ["#confirmSecretUnlockButton span:last-child", "secret.unlock"],
    ["#secretMenuModal h3 span:last-child", "secret.tags"],
    ["#createSecretTagButton span:last-child", "secret.createTag"],
    ["#disableSecretBiometricButton span:last-child", "secret.disableFingerprint"],
    ["#lockSecretModeButton span:last-child", "secret.lock"],

    ["#selectionVyjmout", "selection.cut"],
    ["#selectionKopirovat", "selection.copy"],
    ["#selectionVlozit", "selection.paste"],
    ["#selectionVybratVse", "selection.all"]
  ];

  const atributoveVazby = [
    ["#appSplash", "aria-label", "login.loading"],
    ["#loginEmail", "placeholder", "login.email"],
    ["#loginPassword", "placeholder", "login.password"],
    ["#loginPasswordConfirm", "placeholder", "login.passwordAgain"],
    ["#desktopSidebar", "aria-label", "nav.quick"],
    [".desktopSidebarNav:first-of-type", "aria-label", "nav.quick"],
    [".desktopSidebarNavSecondary", "aria-label", "nav.tools"],
    [".moduleTabs", "aria-label", "modules.aria"],
    ["#searchNotes", "placeholder", "search.placeholder"],
    ["#searchNotes", "aria-label", "search.aria"],
    ["#clearSearchButton", "aria-label", "search.clear"],
    ["#changeViewButton", "aria-label", "search.view"],
    ["#mainMenuButton", "aria-label", "search.menu"],
    [".categoryTabs", "aria-label", "filter.aria"],
    ["#cardSelectionCompactClose", "aria-label", "filter.finishSelection"],
    ["#favoriteFilterButton", "aria-label", "filter.favorite"],
    ["#trashFilterButton", "aria-label", "trash.title"],
    ["#trashBackButton", "aria-label", "trash.close"],
    ["#secretFilterButton", "aria-label", "filter.secret"],

    ["#calendarPrevMonth", "aria-label", "calendar.previousMonth"],
    ["#calendarNextMonth", "aria-label", "calendar.nextMonth"],
    ["#plannerAddTaskButton", "aria-label", "calendar.addSelected"],
    ["#dayDetailBackButton", "aria-label", "calendar.back"],
    ["#dayDetailAddTaskButton", "aria-label", "calendar.addDay"],
    ["#recurringOverviewBackButton", "aria-label", "recurring.back"],
    ["#recurringOverviewButton", "aria-label", "recurring.show"],
    [".remindersFilter[data-reminder-filter='work']", "aria-label", "filter.work"],
    [".remindersFilter[data-reminder-filter='private']", "aria-label", "filter.private"],
    ["#closeReminderQuickMenu", "aria-label", "reminders.close"],
    ["#reminderQuickDateButton", "aria-label", "reminders.selectDate"],
    ["#reminderQuickTimeButton", "aria-label", "reminders.selectTime"],

    ["#editorToolbarToggle", "aria-label", "editor.openTools"],
    ["#editorQuickToolbar", "aria-label", "editor.formatting"],
    ["#editorToolsToolbar", "aria-label", "editor.moreTools"],
    ["#tlacitkoZpet", "aria-label", "editor.undo"],
    ["#tlacitkoZpet", "title", "editor.undo"],
    ["#tlacitkoZnovu", "aria-label", "editor.redo"],
    ["#tlacitkoZnovu", "title", "editor.redo"],
    ["#tlacitkoTucne", "aria-label", "editor.bold"],
    ["#tlacitkoKurziva", "aria-label", "editor.italic"],
    ["#tlacitkoPodtrzeni", "aria-label", "editor.underline"],
    ["#tlacitkoVelikostPisma", "aria-label", "editor.fontSize"],
    ["#tlacitkoNadpis", "aria-label", "editor.textStyle"],
    ["#textColorButton", "aria-label", "editor.textColor"],
    [".textColorWhite", "aria-label", "editor.white"],
    [".textColorBlack", "aria-label", "editor.black"],
    ["#tlacitkoZarovnaniTextu", "aria-label", "editor.align"],
    [".editorZarovnaniTextu[data-zarovnani='left']", "aria-label", "editor.alignLeft"],
    [".editorZarovnaniTextu[data-zarovnani='center']", "aria-label", "editor.alignCenter"],
    [".editorZarovnaniTextu[data-zarovnani='right']", "aria-label", "editor.alignRight"],
    ["#tlacitkoVlozitObrazek", "aria-label", "editor.insertImage"],
    ["#tlacitkoVlozitOdkaz", "aria-label", "editor.insertWebLink"],
    ["#tlacitkoVlozitOdkaz", "title", "editor.webLink"],
    ["#tlacitkoOtevritDokument", "aria-label", "editor.openDocument"],
    ["#tlacitkoOtevritDokument", "title", "editor.openDocument"],
    ["#tlacitkoUlozitDokument", "aria-label", "editor.saveAs"],
    ["#tlacitkoUlozitDokument", "title", "editor.saveAs"],
    ["#tlacitkoBullet", "aria-label", "editor.bullets"],
    ["#tlacitkoBullet", "title", "editor.bullets"],
    ["#modalDateButton", "aria-label", "editor.selectDate"],
    ["#modalTimeButton", "aria-label", "editor.selectTime"],
    ["#pinTaskButton", "aria-label", "editor.pin"],
    ["#reminderButton", "aria-label", "editor.reminder"],
    ["#noteLinkBackButton", "aria-label", "editor.backLink"],
    ["#modalTitle", "aria-label", "editor.titleAria"],
    ["#modalTitle", "data-placeholder", "editor.titlePlaceholder"],
    ["#modalText", "placeholder", "editor.notePlaceholder"],
    ["#newTagInput", "placeholder", "tags.name"],
    ["#newTagModalInput", "placeholder", "tags.name"],
    ["#secretTaskButton", "aria-label", "editor.secret"],
    ["#noteBacklinksSection", "aria-label", "backlinks.aria"],
    ["#tagScrollButton", "aria-label", "editor.tags"],
    ["#cancelNewTagButton", "aria-label", "editor.cancelNewTag"],
    ["#editorBackButton", "aria-label", "editor.saveClose"],
    ["#categoryTaskButton", "aria-label", "editor.area"],
    ["#priorityTaskButton", "aria-label", "editor.priority"],
    ["#colorTaskButton", "aria-label", "editor.color"],
    ["#tagTaskButton", "aria-label", "editor.tags"],
    ["#planSelectionButton", "aria-label", "editor.planSelection"],
    ["#addTodoButton", "aria-label", "editor.addTodo"],
    ["#deleteTaskButton", "aria-label", "editor.deleteNote"],

    ["#closeTimePickerButton", "aria-label", "timePicker.close"],
    ["#timePickerClock", "aria-label", "timePicker.clock"],
    [".timeRepeatPresets", "aria-label", "repeat.aria"],
    ["#closePlannerButton", "aria-label", "planner.close"],
    ["#plannerDateButton", "aria-label", "planner.selectDate"],
    ["#plannerTimeButton", "aria-label", "planner.selectTime"],

    ["#closeSettingsButton", "aria-label", "settings.close"],
    ["#decreaseFontButton", "aria-label", "settings.decreaseFont"],
    ["#increaseFontButton", "aria-label", "settings.increaseFont"],
    ["#closeAboutButton", "aria-label", "about.close"],
    ["#addTaskButton", "aria-label", "addNote"],
    ["#closeManageTagsButton", "aria-label", "tags.closeManage"],
    ["#closeSecretUnlockButton", "aria-label", "secret.close"],
    ["#secretUnlockInput", "placeholder", "secret.mainPassword"],
    ["#secretUnlockConfirmInput", "placeholder", "secret.passwordAgain"]
  ];

  const pickerLogin = () =>
    document.getElementById("loginLanguagePicker");

  const popisekNastaveni = () =>
    document.getElementById("currentLanguageLabel");

  function ziskejBalicek(id = aktualniJazykId) {
    return balicky.get(id) || balicky.values().next().value || null;
  }

  function dosad(text, hodnoty = {}) {
    return String(text ?? "").replace(
      /\{([^}]+)\}/g,
      (_, klic) =>
        Object.prototype.hasOwnProperty.call(hodnoty, klic)
          ? String(hodnoty[klic])
          : `{${klic}}`
    );
  }

  function t(klic, zaloha = "", hodnoty = {}) {
    const balicek = ziskejBalicek();
    const cesky = balicky.get("cs");

    const text =
      balicek?.preklady?.[klic] ??
      cesky?.preklady?.[klic] ??
      zaloha ??
      klic;

    return dosad(text, hodnoty);
  }

  function prelozText(text) {
    if (!text) {
      return text;
    }

    const balicek = ziskejBalicek();
    return balicek?.texty?.[String(text)] ?? String(text);
  }

  function aplikujTextoveVazby() {
    textoveVazby.forEach((vazba) => {
      const [selector, klic, hodnoty, special] = vazba;

      let elementy = [];

      try {
        elementy = document.querySelectorAll(selector);
      } catch (error) {
        console.warn("i18n: neplatný selector", selector, error);
        return;
      }

      elementy.forEach((element) => {
        if (special === "themeLabel") {
          return;
        }

        if (special === "parentHeading") {
          const nadpis = element.previousElementSibling;

          if (nadpis) {
            nadpis.textContent = t(
              klic,
              nadpis.textContent,
              hodnoty || {}
            );
          }

          return;
        }

        if (special === "leadingText") {
          const textovyUzel = [...element.childNodes].find(
            (uzel) =>
              uzel.nodeType === Node.TEXT_NODE &&
              String(uzel.nodeValue || "").trim()
          );

          if (textovyUzel) {
            textovyUzel.nodeValue =
              ` ${t(klic, textovyUzel.nodeValue.trim(), hodnoty || {})} `;
          }

          return;
        }

        element.textContent = t(klic, element.textContent, hodnoty || {});
      });
    });
  }

  function aplikujAtributoveVazby() {
    atributoveVazby.forEach(([selector, atribut, klic]) => {
      let elementy = [];

      try {
        elementy = document.querySelectorAll(selector);
      } catch (error) {
        console.warn("i18n: neplatný selector", selector, error);
        return;
      }

      elementy.forEach((element) => {
        element.setAttribute(
          atribut,
          t(klic, element.getAttribute(atribut) || "")
        );
      });
    });
  }

  function aktualizujDynamickePopisky() {
    const currentThemeLabel =
      document.getElementById("currentThemeLabel");

    const theme = localStorage.getItem("theme") || "light";

    if (currentThemeLabel) {
      if (theme === "light") {
        currentThemeLabel.textContent = t("theme.light", "Světlý");
      } else if (theme === "dark") {
        currentThemeLabel.textContent = t("theme.dark", "Tmavý");
      }
    }

    const currentIconStyleLabel =
      document.getElementById("currentIconStyleLabel");

    if (currentIconStyleLabel) {
      const styl =
        window.LubaNoteIcons?.ziskejEfektivniStylIkon?.() ||
        (window.innerWidth >= 900 ? "svg" : "classic");

      currentIconStyleLabel.textContent =
        styl === "svg"
          ? t("icons.svg", "SVG ikony")
          : t("icons.classic", "Původní ikony");
    }

    const label = popisekNastaveni();
    const balicek = ziskejBalicek();

    if (label && balicek) {
      label.textContent = `${balicek.vlajka || ""} ${balicek.nazev}`.trim();
    }
  }

  function aplikujPreklady() {
    const balicek = ziskejBalicek();

    if (!balicek) {
      return;
    }

    document.documentElement.lang = balicek.id;
    aplikujTextoveVazby();
    aplikujAtributoveVazby();
    aktualizujDynamickePopisky();
    vykresliLoginJazyky();
  }

  function vychoziJazyk() {
    const ulozeny = localStorage.getItem(KLIC_ULOZENI);

    if (ulozeny && balicky.has(ulozeny)) {
      return ulozeny;
    }

    const systemovy =
      String(navigator.language || "")
        .toLowerCase();

    const primarniKod =
      systemovy.split("-")[0];

    if (primarniKod && balicky.has(primarniKod)) {
      return primarniKod;
    }

    if (balicky.has("en")) {
      return "en";
    }

    return balicky.keys().next().value || "cs";
  }

  function nastavJazyk(id, { ulozit = true } = {}) {
    if (!balicky.has(id)) {
      return false;
    }

    aktualniJazykId = id;

    if (ulozit) {
      localStorage.setItem(KLIC_ULOZENI, id);
    }

    aplikujPreklady();

    window.dispatchEvent(
      new CustomEvent("lubanote:language-change", {
        detail: {
          id,
          locale: ziskejLocale()
        }
      })
    );

    return true;
  }

  function vykresliLoginJazyky() {
    const picker = pickerLogin();

    if (!picker) {
      return;
    }

    picker.replaceChildren();

    [...balicky.values()].forEach((balicek) => {
      const tlacitko = document.createElement("button");
      tlacitko.type = "button";
      tlacitko.className = "loginLanguageButton";
      tlacitko.dataset.language = balicek.id;
      tlacitko.setAttribute(
        "aria-pressed",
        balicek.id === aktualniJazykId ? "true" : "false"
      );

      if (balicek.id === aktualniJazykId) {
        tlacitko.classList.add("active");
      }

      const vlajka = document.createElement("span");
      vlajka.className = "loginLanguageFlag";
      vlajka.textContent = balicek.vlajka || "🌐";
      vlajka.setAttribute("aria-hidden", "true");

      const nazev = document.createElement("span");
      nazev.textContent = balicek.nazev;

      tlacitko.append(vlajka, nazev);

      tlacitko.addEventListener("click", () => {
        nastavJazyk(balicek.id);
      });

      picker.append(tlacitko);
    });

    picker.setAttribute("aria-label", t("language.choose", "Vyber jazyk"));
  }

  function otevriVyberJazyka() {
    if (typeof window.otevriVyberovyModal !== "function") {
      return;
    }

    window.otevriVyberovyModal({
      nadpis: t("language.choose", "Vyber jazyk"),
      vybranaHodnota: aktualniJazykId,
      moznosti: [...balicky.values()].map((balicek) => ({
        hodnota: balicek.id,
        popisek: `${balicek.vlajka || "🌐"} ${balicek.nazev}`
      })),
      poVyberu: (id) => {
        nastavJazyk(id);
      }
    });
  }

  function ziskejLocale() {
    return ziskejBalicek()?.locale || "cs-CZ";
  }

  function ziskejJazyky() {
    return [...balicky.values()].map((balicek) => ({
      id: balicek.id,
      nazev: balicek.nazev,
      kratkyNazev: balicek.kratkyNazev,
      vlajka: balicek.vlajka,
      locale: balicek.locale
    }));
  }

  function ziskejJazyk() {
    return aktualniJazykId;
  }

  window.LubaNoteI18n = {
    t,
    prelozText,
    nastavJazyk,
    ziskejJazyk,
    ziskejJazyky,
    ziskejLocale,
    aplikujPreklady
  };

  aktualniJazykId = vychoziJazyk();
  aplikujPreklady();

  document
    .getElementById("openLanguageModalButton")
    ?.addEventListener("click", otevriVyberJazyka);
})();
