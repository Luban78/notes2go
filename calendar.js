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
  const kopie =
    new Date(
      datum.getFullYear(),
      datum.getMonth(),
      datum.getDate()
    );

  const den =
    kopie.getDay() || 7;

  kopie.setDate(
    kopie.getDate() + 4 - den
  );

  const zacatekRoku =
    new Date(
      kopie.getFullYear(),
      0,
      1
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


recurringOverviewButton?.addEventListener(
  "click",
  () => {
    renderRecurringOverview();

    calendarScreen.hidden = true;
    recurringOverviewScreen.hidden = false;
  }
);

recurringOverviewBackButton?.addEventListener(
  "click",
  () => {
    recurringOverviewScreen.hidden = true;
    calendarScreen.hidden = false;
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
    "cs-CZ",
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
        repeat: note.repeat
      });

      return;
    }

    if (note.reminder === true) {
      items.push({
        id: `reminder-${note.id}`,
        sourceNoteId: note.id,
        text: note.title || "Bez názvu",
        plannedAt: note.date,
        completed: false,
        sourceType: "reminder"
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
      "cs-CZ",
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

    const time =
      document.createElement("div");

    time.className =
      "calendarAgendaTime";

    time.textContent =
      item.plannedAt.slice(11, 16);

    const text =
      document.createElement("div");

    text.className =
      "calendarAgendaText";

    text.textContent =
      item.text;

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

    row.append(time, text);

    row.addEventListener("click", () => {
      openTaskEditorById(item.sourceNoteId);

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
  calendarWeekNumber.textContent =
    `T${ziskejCisloTydne(
      calendarSelectedDay
    )}`;
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
      "Žádné opakované úkoly.";

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
      note.title || "Bez názvu";

    const popis =
      document.createElement("div");

    popis.className =
      "recurringOverviewItemRule";

    popis.textContent =
      window.LubaNoteRecurring
        ?.formatujPravidlo?.(note.repeat) ||
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

    priste.textContent = dalsiDatum
      ? `Příště: ${dalsiDatum.toLocaleDateString("cs-CZ")} • ${dalsiDatum.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}`
      : "Série už nemá další termín.";

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

