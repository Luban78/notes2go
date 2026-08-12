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

  const plannedItems =
    loadPlannedItems();

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
          item.plannedAt?.startsWith(dateKey)
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


function renderCalendarAgenda() {
  calendarSelectedDate.textContent =
    formatCalendarDate(
      calendarSelectedDay
    );

  calendarDayItems.innerHTML = "";

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
    loadPlannedItems()
      .filter(
        item =>
          item.plannedAt?.startsWith(dateKey)
      )
      .sort(
        (a, b) =>
          a.plannedAt.localeCompare(
            b.plannedAt
          )
      );

  if (items.length === 0) {
    calendarDayItems.textContent =
      "Na tento den není nic naplánováno.";

    return;
  }

  items.forEach((item) => {
    const row =
      document.createElement("div");

    row.className =
      "calendarAgendaItem";

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

    row.append(time, text);

    calendarDayItems.append(row);
  });
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