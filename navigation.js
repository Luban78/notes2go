/* ==================================================
   HLAVNÍ NAVIGACE LUBANOTE
   - hlavní moduly Poznámky / Plán / Dokumenty
   - Připomínky zůstávají samostatná obrazovka uvnitř Plánu
   - servisní menu pod třemi tečkami
================================================== */

(() => {
  const notesButton =
    document.getElementById("notesModuleButton");

  const plannerButton =
    document.getElementById("plannerModuleButton");

  const documentsButton =
    document.getElementById("documentsModuleButton");

  /* Kompatibilní ID zůstává zachované kvůli notifikacím
     a openReminderCenterEntry() v reminders.js. */
  const remindersButton =
    document.getElementById("remindersModuleButton");

  const plannerCalendarTabButton =
    document.getElementById("plannerCalendarTabButton");

  const plannerSubnav =
    document.getElementById("plannerSubnav");

  const addTaskButton =
    document.getElementById("addTaskButton");

  const recurringOverviewScreen =
    document.getElementById("recurringOverviewScreen");

  const notesScreen =
    document.querySelector(".app");

  const searchRow =
    document.querySelector(".searchRow");

  const categoryTabs =
    document.querySelector(".categoryTabs");

  const remindersScreen =
    document.getElementById("remindersScreen");

  const documentsScreen =
    document.getElementById("documentsScreen");


  function setActiveModule(activeButton) {
    [notesButton, plannerButton, documentsButton]
      .filter(Boolean)
      .forEach((button) => {
        const isActive =
          button === activeButton;

        button.classList.toggle(
          "active",
          isActive
        );

        if (isActive) {
          button.setAttribute(
            "aria-current",
            "page"
          );
        } else {
          button.removeAttribute(
            "aria-current"
          );
        }
      });
  }


  function setPlannerSubtab(activeButton) {
    [plannerCalendarTabButton, remindersButton]
      .filter(Boolean)
      .forEach((button) => {
        const isActive =
          button === activeButton;

        button.classList.toggle(
          "active",
          isActive
        );

        if (isActive) {
          button.setAttribute(
            "aria-current",
            "page"
          );
        } else {
          button.removeAttribute(
            "aria-current"
          );
        }
      });
  }


  function hideAllMainScreens() {
    notesScreen.hidden = true;
    calendarScreen.hidden = true;
    remindersScreen.hidden = true;
    documentsScreen.hidden = true;
    dayDetailScreen.hidden = true;
    recurringOverviewScreen.hidden = true;
  }


  /* ------------------------------
     POZNÁMKY
  ------------------------------ */

  notesButton.addEventListener("click", () => {
    closeMainMenu();

    hideAllMainScreens();

    notesScreen.hidden = false;
    searchRow.hidden = false;
    categoryTabs.hidden = false;
    addTaskButton.hidden = false;
    plannerSubnav.hidden = true;

    setActiveModule(notesButton);
  });


  /* ------------------------------
     PLÁN / KALENDÁŘ
  ------------------------------ */

  function otevriPlannerKalendar() {
    closeMainMenu();

    hideAllMainScreens();

    notesScreen.hidden = true;
    searchRow.hidden = true;
    categoryTabs.hidden = true;
    addTaskButton.hidden = true;

    plannerSubnav.hidden = false;
    calendarScreen.hidden = false;

    calendarCurrentDate = new Date();
    calendarSelectedDay = new Date();

    setActiveModule(plannerButton);
    setPlannerSubtab(plannerCalendarTabButton);

    renderCalendar();
  }

  plannerButton.addEventListener(
    "click",
    otevriPlannerKalendar
  );

  plannerCalendarTabButton?.addEventListener(
    "click",
    otevriPlannerKalendar
  );


  /* ------------------------------
     PLÁN / PŘIPOMÍNKY
     Stará obrazovka Připomínek zůstává beze změny.
  ------------------------------ */

  remindersButton?.addEventListener("click", () => {
    closeMainMenu();

    hideAllMainScreens();

    notesScreen.hidden = true;
    searchRow.hidden = true;
    categoryTabs.hidden = true;
    addTaskButton.hidden = true;

    plannerSubnav.hidden = false;
    remindersScreen.hidden = false;

    setActiveModule(plannerButton);
    setPlannerSubtab(remindersButton);

    renderRemindersScreen();
  });


  /* ------------------------------
     DOKUMENTY
     FÁZE 1: pouze samostatný hlavní modul / shell.
  ------------------------------ */

  documentsButton?.addEventListener("click", () => {
    closeMainMenu();

    hideAllMainScreens();

    notesScreen.hidden = true;
    searchRow.hidden = true;
    categoryTabs.hidden = true;
    addTaskButton.hidden = true;
    plannerSubnav.hidden = true;

    documentsScreen.hidden = false;

    setActiveModule(documentsButton);
  });


  const menuButton =
    document.getElementById("mainMenuButton");

  const menu =
    document.getElementById("mainMenu");

  const settingsButton =
    document.getElementById("fontSizeSettingsButton");

  const backupRestoreButton =
    document.getElementById("backupRestoreButton");

  const aboutButton =
    document.getElementById("aboutAppButton");

  const logoutButton =
    document.getElementById("logoutButton");

  const settingsModal =
    document.getElementById("settingsModal");

  const dataSettingsSection =
    document.getElementById("dataSettingsSection");

  const aboutModal =
    document.getElementById("aboutModal");

  const openAboutFromSettingsButton =
    document.getElementById(
      "openAboutFromSettingsButton"
    );

  const closeAboutButton =
    document.getElementById("closeAboutButton");

  const toast =
    document.getElementById("appToast");

  let toastTimer = null;



  openAboutFromSettingsButton?.addEventListener(
    "click",
    () => {
      settingsModal.hidden = true;
      aboutModal.hidden = false;
    }
  );

  function closeMainMenu() {
    menu.hidden = true;
    menuButton.setAttribute("aria-expanded", "false");
  }

  function showToast(message) {
    clearTimeout(toastTimer);

    toast.textContent = message;
    toast.hidden = false;

    toastTimer = setTimeout(() => {
      toast.hidden = true;
    }, 1800);
  }


  /* script.js menu otevře/zavře; tady jen synchronizujeme aria stav. */
  menuButton.addEventListener("click", () => {
    menuButton.setAttribute(
      "aria-expanded",
      String(!menu.hidden)
    );
  });

  /* Kliknutí mimo menu jej zavře. */
  document.addEventListener("click", (event) => {
    if (
      menu.hidden ||
      menu.contains(event.target) ||
      menuButton.contains(event.target)
    ) {
      return;
    }

    closeMainMenu();
  });

  /* Nastavení otevírá settings.js; tady jen zavřeme menu korektně. */
  settingsButton.addEventListener("click", () => {
    closeMainMenu();
  });

  /* Záloha a obnova otevře rovnou datovou část Nastavení. */
  backupRestoreButton.addEventListener("click", () => {
    closeMainMenu();
    settingsModal.hidden = false;

    requestAnimationFrame(() => {
      dataSettingsSection?.scrollIntoView({
        block: "start"
      });
    });
  });

  /* O aplikaci. */
  aboutButton.addEventListener("click", () => {
    closeMainMenu();
    aboutModal.hidden = false;
  });

  closeAboutButton.addEventListener("click", () => {
    aboutModal.hidden = true;
  });

  aboutModal.addEventListener("click", (event) => {
    if (event.target === aboutModal) {
      aboutModal.hidden = true;
    }
  });

  /* Odhlášení ze Supabase bez mazání lokálních poznámek. */
  logoutButton.addEventListener("click", async () => {
    closeMainMenu();

    if (!navigator.onLine) {
      showToast("Odhlášení vyžaduje internet");
      return;
    }

    const pripraven =
      typeof window.LubaNoteSupabase
        ?.pripravClient === "function"
        ? await window.LubaNoteSupabase.pripravClient()
        : Boolean(supabaseClient);

    if (!pripraven || !supabaseClient) {
      showToast("Synchronizace není dostupná");
      return;
    }

    const { error } =
      await supabaseClient.auth.signOut();

    if (error) {
      console.error("Logout error:", error.message);
      showToast("Odhlášení se nepodařilo");
      return;
    }

    window.LubaNoteSupabase
      ?.zrusPredchoziPrihlaseni?.();

    if (
      typeof window.LubaNoteSupabase
        ?.zobrazPrihlaseni === "function"
    ) {
      window.LubaNoteSupabase.zobrazPrihlaseni(
        "",
        false
      );
    }
  });
})();
