/* ==========================================
   LUBANOTE – KALENDÁŘ / PLÁN
   ========================================== */

const calendarScreen =
  document.getElementById("calendarScreen");

const calendarGrid =
  document.getElementById("calendarGrid");

const calendarMonthTitle =
  document.getElementById("calendarMonthTitle");

const calendarSelectedDate =
  document.getElementById("calendarSelectedDate");

const calendarDayItems =
  document.getElementById("calendarDayItems");

const calendarPrevMonth =
  document.getElementById("calendarPrevMonth");

const calendarNextMonth =
  document.getElementById("calendarNextMonth");


const calendarSelectedDateButton =
  document.getElementById("calendarSelectedDate");

const dayDetailScreen =
  document.getElementById("dayDetailScreen");

const dayDetailTitle =
  document.getElementById("dayDetailTitle");

const dayDetailItems =
  document.getElementById("dayDetailItems");

const dayDetailBackButton =
  document.getElementById("dayDetailBackButton");

const plannerAddTaskButton =
  document.getElementById(
    "plannerAddTaskButton"
  );

const dayDetailAddTaskButton =
  document.getElementById(
    "dayDetailAddTaskButton"
  );

const recurringOverviewButton =
  document.getElementById(
    "recurringOverviewButton"
  );

const recurringOverviewScreen =
  document.getElementById(
    "recurringOverviewScreen"
  );

const recurringOverviewBackButton =
  document.getElementById(
    "recurringOverviewBackButton"
  );

const recurringOverviewItems =
  document.getElementById(
    "recurringOverviewItems"
  );
  
 const calendarWeekNumber =
  document.getElementById(
    "calendarWeekNumber"
  ); 
  

function ziskejCisloTydne(datum) {
  /*
   * ISO 8601 týden počítáme v UTC.
   *
   * Původní výpočet používal lokální půlnoc. Mezi 1. lednem
   * a letním časem je ale rozdíl v UTC offsetu o jednu hodinu.
   * Odečtení dvou lokálních Date proto mohlo dát o zlomek dne méně
   * a Math.floor() posunul pondělí na předchozí týden.
   *
   * Příklad: pondělí 31. 8. 2026 je správně ISO týden 36.
   */
  const kopie =
    new Date(
      Date.UTC(
        datum.getFullYear(),
        datum.getMonth(),
        datum.getDate()
      )
    );

  const den =
    kopie.getUTCDay() || 7;

  kopie.setUTCDate(
    kopie.getUTCDate() + 4 - den
  );

  const zacatekRoku =
    new Date(
      Date.UTC(
        kopie.getUTCFullYear(),
        0,
        1
      )
    );

  const rozdilDni =
    Math.floor(
      (kopie - zacatekRoku) /
      86400000
    );

  return Math.ceil(
    (rozdilDni + 1) / 7
  );
}


function datumProInput(datum) {
  return [
    datum.getFullYear(),
    String(datum.getMonth() + 1).padStart(2, "0"),
    String(datum.getDate()).padStart(2, "0")
  ].join("-");
}


function otevriNovyUkolProVybranyDen() {
  const tlacitkoPridat =
    document.getElementById("addTaskButton");

  if (!tlacitkoPridat) {
    return;
  }

  /*
   * Použijeme stejný editor jako tlačítko + v Poznámkách,
   * ale Planner mu hned předvyplní vybraný den a zapne termín.
   * Díky tomu se uložená poznámka okamžitě stane úkolem v Plánu.
   */
  tlacitkoPridat.click();

  if (typeof modalDate !== "undefined") {
    modalDate.value =
      datumProInput(calendarSelectedDay);
  }

  if (typeof plannedEnabled !== "undefined") {
    plannedEnabled = true;
  }

  const vychoziPripominka =
    window.LubaNotePlannerPreferences
      ?.ziskejVychoziPripominku?.() === true;

  if (typeof reminderEnabled !== "undefined") {
    reminderEnabled = vychoziPripominka;
  }

  if (typeof updateReminderButton === "function") {
    updateReminderButton(vychoziPripominka);
  }

  if (
    vychoziPripominka &&
    typeof requestNotificationPermission === "function"
  ) {
    void requestNotificationPermission();
  }

  if (
    typeof aktualizujPopiskyDataCasu ===
    "function"
  ) {
    aktualizujPopiskyDataCasu();
  }

  if (typeof updateModalWeekday === "function") {
    updateModalWeekday();
  }

  /* Předvyplněný den a zapnutý termín jsou výchozí stav,
     ne uživatelská změna – Back tedy bez další editace neotravuje
     dialogem Uložit / Neukládat. */
  if (
    typeof vytvorOtiskEditoru === "function" &&
    typeof puvodniOtiskEditoru !== "undefined"
  ) {
    puvodniOtiskEditoru =
      vytvorOtiskEditoru();
  }
}


plannerAddTaskButton?.addEventListener(
  "click",
  otevriNovyUkolProVybranyDen
);

dayDetailAddTaskButton?.addEventListener(
  "click",
  otevriNovyUkolProVybranyDen
);


recurringOverviewButton?.addEventListener(
  "click",
  () => {
    renderRecurringOverview();

    const remindersScreen =
      document.getElementById(
        "remindersScreen"
      );

    calendarScreen.hidden = true;
    dayDetailScreen.hidden = true;

    if (remindersScreen) {
      remindersScreen.hidden = true;
    }

    recurringOverviewScreen.hidden = false;
  }
);

recurringOverviewBackButton?.addEventListener(
  "click",
  () => {
    const remindersScreen =
      document.getElementById(
        "remindersScreen"
      );

    recurringOverviewScreen.hidden = true;

    if (remindersScreen) {
      remindersScreen.hidden = false;
    }

    if (
      typeof renderRemindersScreen ===
      "function"
    ) {
      renderRemindersScreen();
    }
  }
);  


calendarSelectedDateButton?.addEventListener(
  "click",
  () => {
    if (!dayDetailScreen) {
      return;
    }

    calendarScreen.hidden = true;
    dayDetailScreen.hidden = false;

    if (dayDetailTitle) {
      dayDetailTitle.textContent =
        calendarSelectedDateButton.textContent;
    }

    if (dayDetailItems) {
      renderCalendarItems(
        dayDetailItems
      );
    }
  }
);


dayDetailBackButton?.addEventListener(
  "click",
  () => {
    dayDetailScreen.hidden = true;
    calendarScreen.hidden = false;
  }
);



let calendarCurrentDate = new Date();
let calendarSelectedDay = new Date();


function formatCalendarDate(date) {
  return date.toLocaleDateString(
    window.LubaNoteI18n?.ziskejLocale?.() || "cs-CZ",
    {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    }
  );
}



function loadCalendarItems() {
  const notes = loadTask();
  const validNoteIds = new Set(
    notes
      .filter((note) => note?.id)
      .map((note) => note.id)
  );

  /* Samostatné Planner položky zůstávají pro označený text a TODO. */
  const items = loadPlannedItems().filter(
    (item) =>
      item?.sourceNoteId &&
      validNoteIds.has(item.sourceNoteId)
  );

  notes.forEach((note) => {
    if (
      !note?.id ||
      note.isSecret === true ||
      note.completed === true ||
      !note.date
    ) {
      return;
    }

    /* Celá opakovaná poznámka je sama úkolem.
       Nevytváříme pro ni druhou Planner položku. */
    if (note.repeat?.enabled === true) {
      items.push({
        id: `repeat-note-${note.id}`,
        sourceNoteId: note.id,
        text: note.title || "Bez názvu",
        plannedAt: note.date,
        completed: false,
        sourceType: "recurring-note",
        repeat: note.repeat,
        reminder: note.reminder === true
      });

      return;
    }

    if (
      note.planned === true ||
      note.reminder === true
    ) {
      items.push({
        id: `planned-note-${note.id}`,
        sourceNoteId: note.id,
        text: note.title || "Bez názvu",
        plannedAt: note.date,
        completed: false,
        sourceType:
          note.reminder === true
            ? "reminder"
            : "planned-note",
        reminder: note.reminder === true
      });
    }
  });

  return items;
}


function jePolozkaProDatum(item, dateKey) {
  if (
    item?.sourceType === "recurring-note" &&
    item.repeat?.enabled === true
  ) {
    return window.LubaNoteRecurring
      ?.jeDatumVOpakovani?.(
        dateKey,
        item.repeat
      ) === true;
  }

  return item?.plannedAt?.startsWith(dateKey) === true;
}



function renderCalendar() {
  calendarGrid.innerHTML = "";

  const year =
    calendarCurrentDate.getFullYear();

  const month =
    calendarCurrentDate.getMonth();

  const firstDay =
    new Date(year, month, 1);

  const lastDay =
    new Date(year, month + 1, 0);

  calendarMonthTitle.textContent =
    firstDay.toLocaleDateString(
      window.LubaNoteI18n?.ziskejLocale?.() || "cs-CZ",
      {
        month: "long",
        year: "numeric"
      }
    );

  let startOffset =
    firstDay.getDay() - 1;

  if (startOffset < 0) {
    startOffset = 6;
  }

  for (let i = 0; i < startOffset; i++) {
    const empty =
      document.createElement("div");

    calendarGrid.append(empty);
  }

  const plannedItems = loadCalendarItems();

  for (
    let day = 1;
    day <= lastDay.getDate();
    day++
  ) {
    const date =
      new Date(year, month, day);

    const button =
      document.createElement("button");

    button.type = "button";
    button.className = "calendarDay";
    button.textContent = day;

    const dateKey =
      `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    const hasItems =
      plannedItems.some(
        item =>
          jePolozkaProDatum(
            item,
            dateKey
          )
      );

    if (hasItems) {
      button.classList.add("hasItems");
    }

    const today = new Date();

    if (
      date.toDateString() ===
      today.toDateString()
    ) {
      button.classList.add("today");
    }

    if (
      date.toDateString() ===
      calendarSelectedDay.toDateString()
    ) {
      button.classList.add("selected");
    }

    button.addEventListener(
      "click",
      () => {
        calendarSelectedDay = date;

        renderCalendar();
        renderCalendarAgenda();
      }
    );

    calendarGrid.append(button);
  }

  renderCalendarAgenda();

  if (
    dayDetailScreen &&
    dayDetailScreen.hidden === false &&
    dayDetailItems
  ) {
    renderCalendarItems(dayDetailItems);
  }
}


function renderCalendarItems(targetElement) {
  targetElement.innerHTML = "";

  const year =
    calendarSelectedDay.getFullYear();

  const month =
    String(
      calendarSelectedDay.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      calendarSelectedDay.getDate()
    ).padStart(2, "0");

  const dateKey =
    `${year}-${month}-${day}`;

  const items =
    loadCalendarItems()
      .filter(
        item =>
          jePolozkaProDatum(
            item,
            dateKey
          )
      )
      .sort(
        (a, b) =>
          a.plannedAt.localeCompare(
            b.plannedAt
          )
      );

  if (items.length === 0) {
    targetElement.textContent =
      "Na tento den není nic naplánováno.";

    return;
  }

  items.forEach((item) => {
    const row =
      document.createElement("div");

    row.className =
      "calendarAgendaItem";

    if (item.completed === true) {
      row.classList.add("completed");
    }

    const efektivniTermin =
      item.sourceType === "recurring-note"
        ? `${dateKey}T${item.plannedAt.slice(11, 16)}`
        : item.plannedAt;

    const time =
      document.createElement("div");

    time.className =
      "calendarAgendaTime";

    time.textContent =
      efektivniTermin.slice(11, 16);

    const text =
      document.createElement("div");

    text.className =
      "calendarAgendaText";

    text.textContent =
      item.text;

    const maPripominku =
      item.sourceType === "recurring-note" ||
      item.sourceType === "reminder" ||
      item.sourceType === "planned-note"
        ? item.reminder === true
        : window.LubaNoteReminders
            ?.jePlanovanaPripominkaZapnuta?.(item) === true;

    if (maPripominku) {
      const bellIcon =
        window.LubaNoteIcons?.vytvorHostitele?.(
          "zvonek",
          ["calendarAgendaReminderIcon"]
        );

      if (bellIcon) {
        text.append(
          document.createTextNode(" "),
          bellIcon
        );
      }
    }

    if (
      item.sourceType === "recurring-note"
    ) {
      const repeatIcon =
        window.LubaNoteIcons?.vytvorHostitele?.(
          "opakovat",
          ["calendarAgendaRepeatIcon"]
        );

      if (repeatIcon) {
        text.append(
          document.createTextNode(" "),
          repeatIcon
        );
      }
    }

    const menuButton =
      document.createElement("button");
    menuButton.type = "button";
    menuButton.className =
      "calendarAgendaMenu lubaIconOnlyButton";
    menuButton.setAttribute(
      "aria-label",
      `Akce pro ${item.text || "úkol"}`
    );

    window.LubaNoteIcons?.nastavJenIkonu?.(
      menuButton,
      "vice",
      ["calendarAgendaMenuIcon"]
    );

    const jeCelaPoznamka = [
      "recurring-note",
      "reminder",
      "planned-note"
    ].includes(item.sourceType);

    const reminderKind =
      jeCelaPoznamka ? "note" : "planned";
    const reminderId =
      jeCelaPoznamka
        ? item.sourceNoteId
        : item.id;

    menuButton.addEventListener(
      "click",
      (event) => {
        event.stopPropagation();
        window.LubaNoteReminders
          ?.otevriMenuPlanovace?.(
            reminderKind,
            reminderId,
            efektivniTermin
          );
      }
    );

    row.append(time, text, menuButton);

    window.LubaNoteSwipe?.pridejHotovo?.(
      row,
      {
        isCompleted: () => item.completed === true,
        onComplete: async () => {
          await window.LubaNoteReminders
            ?.prepniDokonceniPolozkyGestem?.(
              reminderKind,
              reminderId,
              efektivniTermin,
              "planner"
            );

          setTimeout(() => {
            if (targetElement.isConnected) {
              renderCalendarItems(targetElement);
            }
          }, 160);
        },
        onRestore: async () => {
          await window.LubaNoteReminders
            ?.prepniDokonceniPolozkyGestem?.(
              reminderKind,
              reminderId,
              efektivniTermin,
              "planner"
            );

          setTimeout(() => {
            if (targetElement.isConnected) {
              renderCalendarItems(targetElement);
            }
          }, 160);
        },
        onDelete: () => {
          window.LubaNoteReminders
            ?.otevriSmazaniPolozkyGestem?.(
              reminderKind,
              reminderId,
              efektivniTermin,
              "planner"
            );
        }
      }
    );

    row.addEventListener("click", async () => {
      await openTaskEditorById(item.sourceNoteId);

      if (
        document.getElementById("taskModal")
          ?.dataset?.taskId !==
          String(item.sourceNoteId)
      ) {
        return;
      }

      setTimeout(() => {
        const plannedLink =
          modalRichText.querySelector(
            `[data-planned-item-id="${item.id}"]`
          );

        if (!plannedLink) {
          return;
        }

        const editorRect =
          modalRichText.getBoundingClientRect();

        const linkRect =
          plannedLink.getBoundingClientRect();

        const targetTop =
          modalRichText.scrollTop +
          (linkRect.top - editorRect.top) -
          (modalRichText.clientHeight / 2) +
          (linkRect.height / 2);

        modalRichText.scrollTo({
          top: Math.max(0, targetTop),
          behavior: "smooth"
        });

      }, 150);
    });

    targetElement.append(row);
  });
}

function renderCalendarAgenda() {
  calendarSelectedDate.textContent =
    formatCalendarDate(
      calendarSelectedDay
    );
    if (calendarWeekNumber) {
  const cisloTydne =
    ziskejCisloTydne(calendarSelectedDay);

  calendarWeekNumber.textContent =
    window.LubaNoteI18n?.t?.(
      "calendar.weekNumber",
      `${cisloTydne}. týden`,
      { value: cisloTydne }
    ) || `${cisloTydne}. týden`;
}

  renderCalendarItems(
    calendarDayItems
  );
}


calendarPrevMonth.addEventListener(
  "click",
  () => {
    calendarCurrentDate.setMonth(
      calendarCurrentDate.getMonth() - 1
    );

    renderCalendar();
  }
);


calendarNextMonth.addEventListener(
  "click",
  () => {
    calendarCurrentDate.setMonth(
      calendarCurrentDate.getMonth() + 1
    );

    renderCalendar();
  }
);

function renderRecurringOverview() {
  recurringOverviewItems.innerHTML = "";

  const opakovanePoznamky =
    loadTask().filter(
      (note) =>
        note?.id &&
        note.isSecret !== true &&
        note.completed !== true &&
        note.date &&
        note.repeat?.enabled === true
    );

  if (opakovanePoznamky.length === 0) {
    recurringOverviewItems.textContent =
      window.LubaNoteI18n?.t?.(
        "recurring.none",
        "Žádné opakované úkoly."
      ) || "Žádné opakované úkoly.";

    return;
  }

  opakovanePoznamky.forEach((note) => {
    const radek =
      document.createElement("button");

    radek.type = "button";
    radek.className =
      "recurringOverviewItem";

    const nazev =
      document.createElement("div");

    nazev.className =
      "recurringOverviewItemTitle";

    nazev.textContent =
      note.title ||
      window.LubaNoteI18n?.t?.(
        "reminders.untitled",
        "Bez názvu"
      ) ||
      "Bez názvu";

    const popis =
      document.createElement("div");

    popis.className =
      "recurringOverviewItemRule";

    popis.textContent =
      window.LubaNoteRecurring
        ?.formatujPravidlo?.(note.repeat) ||
      window.LubaNoteI18n?.t?.(
        "recurring.repeat",
        "Opakování"
      ) ||
      "Opakování";

    const priste =
      document.createElement("div");

    priste.className =
      "recurringOverviewItemNext";

    const dalsiDatum =
      window.LubaNoteRecurring
        ?.vypocitejPristiTermin?.(
          note.date,
          note.repeat,
          new Date()
        ) || null;

    if (dalsiDatum) {
      const locale =
        window.LubaNoteI18n?.ziskejLocale?.() ||
        "cs-CZ";

      const datumCas =
        `${dalsiDatum.toLocaleDateString(locale)} • ${
          dalsiDatum.toLocaleTimeString(locale, {
            hour: "2-digit",
            minute: "2-digit"
          })
        }`;

      priste.textContent =
        window.LubaNoteI18n?.t?.(
          "recurring.next",
          `Příště: ${datumCas}`,
          { value: datumCas }
        ) || `Příště: ${datumCas}`;
    } else {
      priste.textContent =
        window.LubaNoteI18n?.t?.(
          "recurring.noNext",
          "Série už nemá další termín."
        ) || "Série už nemá další termín.";
    }

    radek.append(
      nazev,
      popis,
      priste
    );

    radek.addEventListener("click", () => {
      openTaskEditorById(note.id);
    });

    recurringOverviewItems.append(radek);
  });
}



window.addEventListener(
  "lubanote:language-change",
  () => {
    if (typeof renderCalendar === "function") {
      renderCalendar();
    }

    if (
      recurringOverviewScreen &&
      !recurringOverviewScreen.hidden &&
      typeof renderRecurringOverview === "function"
    ) {
      renderRecurringOverview();
    }
  }
);


window.LubaNoteCalendar = {
  ...(window.LubaNoteCalendar || {}),
  obnovPoZmene: () => {
    renderCalendar();
  }
};
