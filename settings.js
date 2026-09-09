(async () => {
  const decreaseFontButton =
    document.getElementById("decreaseFontButton");

  const increaseFontButton =
    document.getElementById("increaseFontButton");

  const fontSizeValue =
    document.getElementById("fontSizeValue");

  const openThemeModalButton =
    document.getElementById("openThemeModalButton");

  const currentThemeLabel =
    document.getElementById("currentThemeLabel");

  const openIconStyleModalButton =
    document.getElementById("openIconStyleModalButton");

  const currentIconStyleLabel =
    document.getElementById("currentIconStyleLabel");

  const openReminderDelaySettingsButton =
  document.getElementById(
    "openReminderDelaySettingsButton"
  );

  const openOverdueRetentionSettingsButton =
    document.getElementById(
      "openOverdueRetentionSettingsButton"
    );

  const overdueRetentionValue =
    document.getElementById(
      "overdueRetentionValue"
    );

  const REMINDER_OVERDUE_RETENTION_KEY =
    "reminderOverdueRetentionDays";

  const REMINDER_OVERDUE_RETENTION_CONFIRMED_KEY =
    "reminderOverdueRetentionConfirmed";

  const PLANNER_REMINDER_PREFERENCE_KEY =
    "lubanotePlannerReminderPreferenceV1";
  const PLANNER_REMINDER_REMOTE_KEY =
    "lubanote_planner_reminder_preference_v1";

  let plannerPreferenceUserId = null;

  const openPlannerReminderDefaultButton =
    document.getElementById(
      "openPlannerReminderDefaultButton"
    );

  const plannerReminderDefaultValue =
    document.getElementById(
      "plannerReminderDefaultValue"
    );

  function ziskejLokalniPlannerPreference() {
    try {
      const raw = localStorage.getItem(
        PLANNER_REMINDER_PREFERENCE_KEY
      );

      if (!raw) {
        return null;
      }

      const data = JSON.parse(raw);

      if (typeof data?.enabled !== "boolean") {
        return null;
      }

      if (
        plannerPreferenceUserId &&
        data.userId &&
        data.userId !== plannerPreferenceUserId
      ) {
        return null;
      }

      return {
        enabled: data.enabled,
        updatedAt:
          typeof data.updatedAt === "string"
            ? data.updatedAt
            : "1970-01-01T00:00:00.000Z",
        userId:
          typeof data.userId === "string"
            ? data.userId
            : null
      };
    } catch (_) {
      return null;
    }
  }

  function ulozLokalniPlannerPreference(preference) {
    localStorage.setItem(
      PLANNER_REMINDER_PREFERENCE_KEY,
      JSON.stringify(preference)
    );
  }

  function ziskejVychoziPlannerReminder() {
    return ziskejLokalniPlannerPreference()?.enabled === true;
  }

  function nastavPopisekPlannerReminderu() {
    if (!plannerReminderDefaultValue) {
      return;
    }

    plannerReminderDefaultValue.textContent =
      ziskejVychoziPlannerReminder()
        ? "Zapnuto"
        : "Vypnuto";
  }

  async function synchronizujPlannerPreference() {
    if (
      !navigator.onLine ||
      typeof supabaseClient === "undefined" ||
      !supabaseClient?.auth
    ) {
      nastavPopisekPlannerReminderu();
      return false;
    }

    try {
      const { data, error } =
        await supabaseClient.auth.getUser();

      if (error || !data?.user) {
        nastavPopisekPlannerReminderu();
        return false;
      }

      plannerPreferenceUserId = data.user.id || null;

      let local = ziskejLokalniPlannerPreference();
      const remoteRaw =
        data.user.user_metadata?.[
          PLANNER_REMINDER_REMOTE_KEY
        ] || null;

      const remote =
        typeof remoteRaw?.enabled === "boolean"
          ? {
              enabled: remoteRaw.enabled,
              updatedAt:
                typeof remoteRaw.updatedAt === "string"
                  ? remoteRaw.updatedAt
                  : "1970-01-01T00:00:00.000Z",
              userId: plannerPreferenceUserId
            }
          : null;

      /*
       * Lokální preference je navázaná na účet. Při odhlášení a
       * přihlášení jiného uživatele nesmíme jeho výchozí volbu přenést
       * do cizího user_metadata. Starší záznam bez userId si při prvním
       * úspěšném syncu bezpečně přivlastní právě přihlášený účet.
       */
      if (local && !local.userId && plannerPreferenceUserId) {
        local = {
          ...local,
          userId: plannerPreferenceUserId
        };
        ulozLokalniPlannerPreference(local);
      }

      if (!local && !remote) {
        nastavPopisekPlannerReminderu();
        return true;
      }

      if (!local && remote) {
        ulozLokalniPlannerPreference(remote);
        nastavPopisekPlannerReminderu();
        return true;
      }

      const localCas = Date.parse(local.updatedAt) || 0;
      const remoteCas = Date.parse(remote?.updatedAt || "") || 0;

      if (remote && remoteCas > localCas) {
        ulozLokalniPlannerPreference(remote);
        nastavPopisekPlannerReminderu();
        return true;
      }

      if (!remote || localCas > remoteCas) {
        const { error: updateError } =
          await supabaseClient.auth.updateUser({
            data: {
              [PLANNER_REMINDER_REMOTE_KEY]: {
                enabled: local.enabled,
                updatedAt: local.updatedAt
              }
            }
          });

        if (updateError) {
          throw updateError;
        }
      }

      nastavPopisekPlannerReminderu();
      return true;
    } catch (error) {
      console.warn(
        "Synchronizace výchozí Planner připomínky byla odložena:",
        error
      );
      nastavPopisekPlannerReminderu();
      return false;
    }
  }

  async function nastavVychoziPlannerReminder(enabled) {
    const preference = {
      enabled: enabled === true,
      updatedAt: new Date().toISOString(),
      userId: plannerPreferenceUserId
    };

    ulozLokalniPlannerPreference(preference);
    nastavPopisekPlannerReminderu();

    window.dispatchEvent(
      new CustomEvent(
        "lubanote:planner-reminder-preference-change",
        { detail: { enabled: preference.enabled } }
      )
    );

    void synchronizujPlannerPreference();
    return preference.enabled;
  }

  window.LubaNotePlannerPreferences = {
    ziskejVychoziPripominku: ziskejVychoziPlannerReminder,
    nastavVychoziPripominku: nastavVychoziPlannerReminder,
    synchronizuj: synchronizujPlannerPreference
  };
  
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

/*  const motivy = [
    {
      hodnota: "light",
      popisek: "Světlý"
    },
    {
      hodnota: "dark",
      popisek: "Tmavý"
    },
    {
      hodnota: "cappuccino",
      popisek: "Cappuccino"
    }
  ];
  */
  const nactenaTemata = await nactiTemata();

//console.log(nactenaTemata);


const motivy = nactenaTemata.map(tema => ({
  hodnota: tema.id,
  popisek: tema.nazev
}));


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
  const tridyTemat = [...document.body.classList]
    .filter(trida => trida.startsWith("theme-"));

  document.body.classList.remove(...tridyTemat);

  if (theme !== "light") {
    document.body.classList.add(`theme-${theme}`);
  }
}

  function prelozNastaveni(klic, vychozi, parametry = {}) {
    return (
      window.LubaNoteI18n?.t?.(
        klic,
        vychozi,
        parametry
      ) || vychozi
    );
  }

  function ziskejPopisekRetence(hodnota) {
    if (hodnota === "never") {
      return prelozNastaveni(
        "settings.overdueNever",
        "Nikdy"
      );
    }

    const dny = Number(hodnota) || 30;

    return prelozNastaveni(
      "settings.overdueDays",
      `${dny} dní`,
      { count: dny }
    );
  }

  function nastavPopisekRetence() {
    if (!overdueRetentionValue) {
      return;
    }

    const hodnota =
      localStorage.getItem(
        REMINDER_OVERDUE_RETENTION_KEY
      ) || "30";

    const potvrzeno =
      localStorage.getItem(
        REMINDER_OVERDUE_RETENTION_CONFIRMED_KEY
      ) === "true";

    const zaklad = ziskejPopisekRetence(hodnota);

    overdueRetentionValue.textContent =
      potvrzeno
        ? zaklad
        : `${zaklad} (${prelozNastaveni(
            "settings.overdueConfirm",
            "potvrdit"
          )})`;
  }

  function otevriNastaveniRetencePoTerminu() {
    const hodnota =
      localStorage.getItem(
        REMINDER_OVERDUE_RETENTION_KEY
      ) || "30";

    const moznosti = [
      { hodnota: "never", popisek: ziskejPopisekRetence("never") },
      { hodnota: "7", popisek: ziskejPopisekRetence("7") },
      { hodnota: "14", popisek: ziskejPopisekRetence("14") },
      { hodnota: "30", popisek: ziskejPopisekRetence("30") },
      { hodnota: "60", popisek: ziskejPopisekRetence("60") },
      { hodnota: "90", popisek: ziskejPopisekRetence("90") }
    ];

    otevriNastavovaciModal({
      nadpis: prelozNastaveni(
        "settings.overdueRetention",
        "Mazat po termínu"
      ),
      polozky: [
        {
          klic: "retence",
          popisek: prelozNastaveni(
            "settings.overdueRetention",
            "Mazat po termínu"
          ),
          hodnota,
          zobrazeni: ziskejPopisekRetence(hodnota),
          moznosti
        }
      ],
      poUlozeni: (hodnoty) => {
        const novaHodnota =
          hodnoty?.retence || "30";

        localStorage.setItem(
          REMINDER_OVERDUE_RETENTION_KEY,
          novaHodnota
        );

        localStorage.setItem(
          REMINDER_OVERDUE_RETENTION_CONFIRMED_KEY,
          "true"
        );

        nastavPopisekRetence();

        window.LubaNoteReminders
          ?.vycistiStarePoTerminu?.({
            vynutit: true
          });
      }
    });
  }

  nastavPopisekRetence();
  nastavPopisekPlannerReminderu();

  openPlannerReminderDefaultButton
    ?.addEventListener("click", () => {
      const aktualni =
        ziskejVychoziPlannerReminder()
          ? "on"
          : "off";

      otevriNastavovaciModal({
        nadpis: "Plánování",
        polozky: [
          {
            klic: "plannerReminder",
            popisek: "Automaticky připomenout",
            hodnota: aktualni,
            zobrazeni:
              aktualni === "on"
                ? "Zapnuto"
                : "Vypnuto",
            moznosti: [
              { hodnota: "off", popisek: "Vypnuto" },
              { hodnota: "on", popisek: "Zapnuto" }
            ]
          }
        ],
        poUlozeni: (hodnoty) => {
          void nastavVychoziPlannerReminder(
            hodnoty?.plannerReminder === "on"
          );
        }
      });
    });

  [
    "lubanote:supabase-ready",
    "lubanote:auth-valid"
  ].forEach((nazevUdalosti) => {
    window.addEventListener(
      nazevUdalosti,
      () => void synchronizujPlannerPreference()
    );
  });

  window.addEventListener(
    "online",
    () => void synchronizujPlannerPreference()
  );

  openOverdueRetentionSettingsButton
    ?.addEventListener(
      "click",
      otevriNastaveniRetencePoTerminu
    );

openReminderDelaySettingsButton?.addEventListener(
  "click",
  () => {
    const ulozeneRychleOdlozeni =
      JSON.parse(
        localStorage.getItem("rychleOdlozeni")
      ) || {
        volba1: "15",
        volba2: "30",
        volba3: "60",
        volba4: "tomorrow"
      };

    const ziskejPopisek = (
      hodnota,
      moznosti
    ) => {
      const nalezenaMoznost =
        moznosti.find(
          (moznost) =>
            moznost.hodnota === hodnota
        );

      return nalezenaMoznost
        ? nalezenaMoznost.popisek
        : hodnota;
    };

    const moznostiVolba1 = [
      { hodnota: "5", popisek: "5 minut" },
      { hodnota: "10", popisek: "10 minut" },
      { hodnota: "15", popisek: "15 minut" },
      { hodnota: "30", popisek: "30 minut" },
      { hodnota: "60", popisek: "1 hodina" }
    ];

    const moznostiVolba2 = [
      { hodnota: "5", popisek: "5 minut" },
      { hodnota: "10", popisek: "10 minut" },
      { hodnota: "15", popisek: "15 minut" },
      { hodnota: "30", popisek: "30 minut" },
      { hodnota: "60", popisek: "1 hodina" }
    ];

    const moznostiVolba3 = [
      { hodnota: "15", popisek: "15 minut" },
      { hodnota: "30", popisek: "30 minut" },
      { hodnota: "60", popisek: "1 hodina" },
      { hodnota: "120", popisek: "2 hodiny" },
      { hodnota: "180", popisek: "3 hodiny" }
    ];

    const moznostiVolba4 = [
      { hodnota: "tomorrow", popisek: "Zítra 8:00" },
      { hodnota: "120", popisek: "2 hodiny" },
      { hodnota: "180", popisek: "3 hodiny" }
    ];

    otevriNastavovaciModal({
      nadpis: "Rychlé odložení",

      polozky: [
        {
          klic: "volba1",
          popisek: "1. volba",
          hodnota:
            ulozeneRychleOdlozeni.volba1,
          zobrazeni: ziskejPopisek(
            ulozeneRychleOdlozeni.volba1,
            moznostiVolba1
          ),
          moznosti: moznostiVolba1
        },

        {
          klic: "volba2",
          popisek: "2. volba",
          hodnota:
            ulozeneRychleOdlozeni.volba2,
          zobrazeni: ziskejPopisek(
            ulozeneRychleOdlozeni.volba2,
            moznostiVolba2
          ),
          moznosti: moznostiVolba2
        },

        {
          klic: "volba3",
          popisek: "3. volba",
          hodnota:
            ulozeneRychleOdlozeni.volba3,
          zobrazeni: ziskejPopisek(
            ulozeneRychleOdlozeni.volba3,
            moznostiVolba3
          ),
          moznosti: moznostiVolba3
        },

        {
          klic: "volba4",
          popisek: "4. volba",
          hodnota:
            ulozeneRychleOdlozeni.volba4,
          zobrazeni: ziskejPopisek(
            ulozeneRychleOdlozeni.volba4,
            moznostiVolba4
          ),
          moznosti: moznostiVolba4
        }
      ],

      poUlozeni: (hodnoty) => {
        localStorage.setItem(
          "rychleOdlozeni",
          JSON.stringify(hodnoty)
        );

        /*console.log(
          "Uložené rychlé odložení:",
          hodnoty
        );*/
      }
    });
  }
);
  function ziskejPopisekMotivu(hodnota) {
    const popisek =
      motivy.find(
        (motiv) => motiv.hodnota === hodnota
      )?.popisek || "Světlý";

    return (
      window.LubaNoteI18n?.prelozText?.(popisek) ||
      popisek
    );
  }

  function nastavPopisekMotivu(hodnota) {
    if (!currentThemeLabel) {
      return;
    }

    currentThemeLabel.textContent =
      ziskejPopisekMotivu(hodnota);
  }

  /*
   * V nastavení nabízíme jen dvě skutečné volby.
   * Interní stav "auto" zůstává kvůli výchozímu chování:
   * - mobil / APK -> původní ikony
   * - desktop     -> SVG ikony
   *
   * Jakmile uživatel něco zvolí, uloží se explicitně
   * "classic" nebo "svg".
   */
  const stylyIkon = [
    {
      hodnota: "classic",
      popisek: "Původní ikony"
    },
    {
      hodnota: "svg",
      popisek: "SVG ikony"
    }
  ];

  function ziskejEfektivniStylIkonProNastaveni(hodnota) {
    if (hodnota === "classic" || hodnota === "svg") {
      return hodnota;
    }

    return (
      window.LubaNoteIcons?.ziskejEfektivniStylIkon?.() ||
      (window.innerWidth >= 900 ? "svg" : "classic")
    );
  }

  function ziskejPopisekStyluIkon(hodnota) {
    const efektivniStyl =
      ziskejEfektivniStylIkonProNastaveni(hodnota);

    const popisek =
      stylyIkon.find(
        (styl) => styl.hodnota === efektivniStyl
      )?.popisek || "Původní ikony";

    return (
      window.LubaNoteI18n?.prelozText?.(popisek) ||
      popisek
    );
  }

  function nastavPopisekStyluIkon(hodnota) {
    if (!currentIconStyleLabel) {
      return;
    }

    currentIconStyleLabel.textContent =
      ziskejPopisekStyluIkon(hodnota);
  }

  function otevriModalStyluIkon() {
    if (
      typeof window.otevriVyberovyModal !==
      "function"
    ) {
      return;
    }

    const ulozenyStyl =
      window.LubaNoteIcons?.ziskejStylIkon?.() ||
      "auto";

    const vybranyStyl =
      ziskejEfektivniStylIkonProNastaveni(
        ulozenyStyl
      );

    window.otevriVyberovyModal({
      nadpis: "Styl ikon",
      moznosti: stylyIkon,
      vybranaHodnota: vybranyStyl,
      poVyberu: (novyStyl) => {
        window.LubaNoteIcons?.nastavStylIkon?.(
          novyStyl
        );

        nastavPopisekStyluIkon(novyStyl);
      }
    });
  }

  function otevriModalMotivu() {
    if (
      typeof window.otevriVyberovyModal !==
      "function"
    ) {
      console.error(
        "Chybí choiceModal.js – výběrový modal nelze otevřít."
      );
      return;
    }

    const ulozenyMotiv =
      localStorage.getItem("theme") || "light";

    window.otevriVyberovyModal({
      nadpis: "Barevný motiv",
      moznosti: motivy,
      vybranaHodnota: ulozenyMotiv,
      poVyberu: (novyMotiv) => {
        applyTheme(novyMotiv);
        localStorage.setItem(
          "theme",
          novyMotiv
        );
        nastavPopisekMotivu(novyMotiv);
      }
    });
  }

  applyFontSize();

  const ulozenyMotiv =
    localStorage.getItem("theme") || "light";

  applyTheme(ulozenyMotiv);
  nastavPopisekMotivu(ulozenyMotiv);

  const ulozenyStylIkon =
    window.LubaNoteIcons?.ziskejStylIkon?.() ||
    "auto";

  nastavPopisekStyluIkon(ulozenyStylIkon);

  increaseFontButton.addEventListener("click", () => {
    currentFontSize = Math.min(
      currentFontSize + 1,
      20
    );

    localStorage.setItem(
      "fontSize",
      currentFontSize
    );

    applyFontSize();
  });

  decreaseFontButton.addEventListener("click", () => {
    currentFontSize = Math.max(
      currentFontSize - 1,
      13
    );

    localStorage.setItem(
      "fontSize",
      currentFontSize
    );

    applyFontSize();
  });

  openThemeModalButton?.addEventListener(
    "click",
    otevriModalMotivu
  );

  openIconStyleModalButton?.addEventListener(
    "click",
    otevriModalStyluIkon
  );

  window.addEventListener(
    "lubanote:icon-style-change",
    () => {
      nastavPopisekStyluIkon(
        window.LubaNoteIcons?.ziskejStylIkon?.() ||
        "auto"
      );

      nastavPopisekRetence();
    }
  );

  window.addEventListener(
    "lubanote:language-change",
    () => {
      nastavPopisekMotivu(
        localStorage.getItem("theme") || "light"
      );

      nastavPopisekStyluIkon(
        window.LubaNoteIcons?.ziskejStylIkon?.() ||
        "auto"
      );
    }
  );

  settingsOpenButton.addEventListener("click", () => {
    settingsModal.hidden = false;
    settingsMainMenu.hidden = true;
  });

  closeSettingsButton.addEventListener("click", () => {
    settingsModal.hidden = true;
  });

  settingsExportButton.addEventListener(
    "click",
    exportTasks
  );

  settingsImportButton.addEventListener("click", () => {
    if (
      window.Capacitor?.isNativePlatform?.() === true &&
      typeof importTasksApk === "function"
    ) {
      importTasksApk();
      return;
    }

    importFile.click();
  });
})();
