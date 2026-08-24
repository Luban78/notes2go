/* ==================================================
   HLAVNÍ NAVIGACE LUBANOTE
   - moduly Poznámky / Plán / Připomínky
   - servisní menu pod třemi tečkami
   - odhlášení a obrazovka O aplikaci
================================================== */

(() => {
  const notesButton =
    document.getElementById("notesModuleButton");

  const plannerButton =
    document.getElementById("plannerModuleButton");

  const remindersButton =
    document.getElementById("remindersModuleButton");

  const addTaskButton =
    document.getElementById("addTaskButton");

  const recurringOverviewScreen =
    document.getElementById("recurringOverviewScreen");


  /* ==================================================
   PŘEPÍNÁNÍ MODULŮ
   Poznámky ↔ Plán
================================================== */

  const notesScreen =
    document.querySelector(".app");

  const searchRow =
    document.querySelector(".searchRow");

  const categoryTabs =
    document.querySelector(".categoryTabs");

  const remindersScreen =
    document.getElementById("remindersScreen");


  function setActiveModule(activeButton) {
    [notesButton, plannerButton, remindersButton]
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


  /* ------------------------------
     POZNÁMKY
  ------------------------------ */

  notesButton.addEventListener("click", () => {
    closeMainMenu();

    notesScreen.hidden = false;
    searchRow.hidden = false;
    categoryTabs.hidden = false;
    addTaskButton.hidden = false;

    calendarScreen.hidden = true;
    remindersScreen.hidden = true;
    dayDetailScreen.hidden = true;
    recurringOverviewScreen.hidden = true;

    setActiveModule(notesButton);
  });

  /* ------------------------------
     PLÁN
  ------------------------------ */

  plannerButton.addEventListener("click", () => {
    closeMainMenu();

    notesScreen.hidden = true;
    searchRow.hidden = true;
    categoryTabs.hidden = true;
    addTaskButton.hidden = true;

    calendarScreen.hidden = false;
    remindersScreen.hidden = true;
    dayDetailScreen.hidden = true;
    recurringOverviewScreen.hidden = true;

    calendarCurrentDate = new Date();
    calendarSelectedDay = new Date();

    setActiveModule(plannerButton);

    renderCalendar();
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

  /* ------------------------------
     PŘIPOMÍNKY
  ------------------------------ */

  remindersButton.addEventListener("click", () => {
    closeMainMenu();

    notesScreen.hidden = true;
    searchRow.hidden = true;
    categoryTabs.hidden = true;
    addTaskButton.hidden = true;

    calendarScreen.hidden = true;
    remindersScreen.hidden = false;
    dayDetailScreen.hidden = true;
    recurringOverviewScreen.hidden = true;

    setActiveModule(remindersButton);

    renderRemindersScreen();
  });



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

    const loginScreen =
      document.getElementById("loginScreen");

    const loginPassword =
      document.getElementById("loginPassword");

    const loginMessage =
      document.getElementById("loginMessage");

    loginPassword.value = "";
    loginMessage.textContent = "";
    loginMessage.classList.remove("error");
    loginScreen.hidden = false;
  });
})();
