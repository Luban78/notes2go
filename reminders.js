/* ==================================================
   LUBANOTE – PŘIPOMÍNKY
   - systémová Android upozornění
   - přehled aktivních připomínek
   - filtry pracovní / soukromé
   - rychlé odložení a změna času
================================================== */

async function requestNotificationPermission() {
  const LocalNotifications =
    window.Capacitor?.Plugins?.LocalNotifications;

  if (!LocalNotifications) {
    return;
  }

  await LocalNotifications.requestPermissions();
  await createReminderChannel();
}


async function createReminderChannel() {
  const LocalNotifications =
    window.Capacitor?.Plugins?.LocalNotifications;

  if (!LocalNotifications) {
    return;
  }

  await LocalNotifications.createChannel({
    id: "reminders",
    name: "Připomínky LubaNote",
    description: "Upozornění na naplánované poznámky",
    importance: 5,
    visibility: 1,
    vibration: true
  });
}


async function scheduleNotification(
  notificationId,
  title,
  dateTime,
  noteText = ""
) {
  const LocalNotifications =
    window.Capacitor?.Plugins?.LocalNotifications;

  if (!LocalNotifications) {
    return;
  }

  const cleanText =
    noteText
      .replace(/\s+/g, " ")
      .trim();

  const shortText =
    cleanText.length > 140
      ? `${cleanText.slice(0, 140)}…`
      : cleanText;

  await LocalNotifications.schedule({
    notifications: [
      {
        title: title || "LubaNote",

        body:
          shortText ||
          "Máš naplánovanou poznámku.",

        largeBody:
          cleanText ||
          "Máš naplánovanou poznámku.",

        id: notificationId,
        channelId: "reminders",

        schedule: {
          at: new Date(dateTime)
        }
      }
    ]
  });
}


async function cancelNotification(notificationId) {
  const LocalNotifications =
    window.Capacitor?.Plugins?.LocalNotifications;

  if (!LocalNotifications || !notificationId) {
    return;
  }

  await LocalNotifications.cancel({
    notifications: [
      {
        id: notificationId
      }
    ]
  });
}


function updateReminderButton(enabled) {
  const button =
    document.getElementById("reminderButton");

  button?.classList.toggle("active", enabled);
}


const editorReminderButton =
  document.getElementById("reminderButton");

editorReminderButton?.addEventListener("click", () => {
  const modalDate =
    document.getElementById("modalDate");

  const modalTime =
    document.getElementById("modalTime");

  if (!modalDate?.value || !modalTime?.value) {
    alert("Nejdřív nastav datum a čas upozornění.");
    return;
  }

  reminderEnabled = !reminderEnabled;

  if (reminderEnabled) {
    requestNotificationPermission();
  }

  updateReminderButton(reminderEnabled);
});


createReminderChannel();


/* ==================================================
   DATA PRO OBRAZOVKU PŘIPOMÍNEK
================================================== */

let activeReminderFilter = "all";
let selectedReminderTaskId = null;


function getActiveReminders() {
  const now = new Date();

  return loadTask()
    .filter((task) => {
      if (
        task.reminder !== true ||
        !task.date
      ) {
        return false;
      }

      const reminderDate =
        new Date(task.date);

      if (reminderDate < now) {
        return false;
      }

      const taskArea =
        task.area || "private";

      if (
        activeReminderFilter !== "all" &&
        taskArea !== activeReminderFilter
      ) {
        return false;
      }

      return true;
    })
    .sort((a, b) => {
      return new Date(a.date) -
        new Date(b.date);
    });
}


function formatReminderLocalDateTime(date) {
  const year = date.getFullYear();
  const month =
    String(date.getMonth() + 1).padStart(2, "0");
  const day =
    String(date.getDate()).padStart(2, "0");
  const hours =
    String(date.getHours()).padStart(2, "0");
  const minutes =
    String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}


function getReminderTaskById(taskId) {
  return loadTask().find(
    (task) => task.id === taskId
  ) || null;
}


/* ==================================================
   RYCHLÉ ODLOŽENÍ / ZMĚNA ČASU
================================================== */

const reminderQuickMenu =
  document.getElementById("reminderQuickMenu");

const reminderQuickTitle =
  document.getElementById("reminderQuickTitle");

const reminderQuickDate =
  document.getElementById("reminderQuickDate");

const reminderQuickTime =
  document.getElementById("reminderQuickTime");


function closeReminderQuickMenu() {
  if (!reminderQuickMenu) {
    return;
  }

  reminderQuickMenu.hidden = true;
  selectedReminderTaskId = null;
}


function openReminderQuickMenu(task) {
  if (!reminderQuickMenu || !task) {
    return;
  }

  selectedReminderTaskId = task.id;

  if (reminderQuickTitle) {
    reminderQuickTitle.textContent =
      task.title || "Bez názvu";
  }

  const date = new Date(task.date);

  if (reminderQuickDate) {
    reminderQuickDate.value =
      formatReminderLocalDateTime(date)
        .slice(0, 10);
  }

  if (reminderQuickTime) {
    reminderQuickTime.value =
      formatReminderLocalDateTime(date)
        .slice(11, 16);
  }

  reminderQuickMenu.hidden = false;
}


async function saveReminderDate(taskId, newDate) {
  const tasks = loadTask();
  const index = tasks.findIndex(
    (task) => task.id === taskId
  );

  if (index === -1) {
    return;
  }

  const currentTask = tasks[index];

  if (!currentTask.notificationId) {
    currentTask.notificationId =
      Date.now() % 2147483647;
  }

  /* Nejdřív zrušíme původní naplánované upozornění. */
  await cancelNotification(
    currentTask.notificationId
  );

  const updatedTask = {
    ...currentTask,
    date: formatReminderLocalDateTime(newDate),
    reminder: true,
    updatedAt: new Date().toISOString()
  };

  updateTask(index, updatedTask);

  await scheduleNotification(
    updatedTask.notificationId,
    updatedTask.title,
    updatedTask.date,
    updatedTask.note
  );

  if (
    typeof uploadLocalNoteToSupabase === "function"
  ) {
    await uploadLocalNoteToSupabase(updatedTask);
  }

  if (typeof renderTasks === "function") {
    renderTasks();
  }

  renderRemindersScreen();
  closeReminderQuickMenu();
}


async function postponeReminder(minutes) {
  const task =
    getReminderTaskById(selectedReminderTaskId);

  if (!task) {
    return;
  }

  const newDate = new Date(task.date);

  newDate.setMinutes(
    newDate.getMinutes() + minutes
  );

  await saveReminderDate(task.id, newDate);
}


async function postponeReminderToTomorrowMorning() {
  const task =
    getReminderTaskById(selectedReminderTaskId);

  if (!task) {
    return;
  }

  const tomorrow = new Date();

  tomorrow.setDate(
    tomorrow.getDate() + 1
  );

  tomorrow.setHours(8, 0, 0, 0);

  await saveReminderDate(
    task.id,
    tomorrow
  );
}


async function saveCustomReminderDate() {
  const task =
    getReminderTaskById(selectedReminderTaskId);

  if (
    !task ||
    !reminderQuickDate?.value ||
    !reminderQuickTime?.value
  ) {
    return;
  }

  const newDate = new Date(
    `${reminderQuickDate.value}T${reminderQuickTime.value}`
  );

  if (Number.isNaN(newDate.getTime())) {
    return;
  }

  if (newDate <= new Date()) {
    alert("Připomínka musí být nastavena do budoucna.");
    return;
  }

  await saveReminderDate(
    task.id,
    newDate
  );
}


async function disableSelectedReminder() {
  const tasks = loadTask();
  const index = tasks.findIndex(
    (task) => task.id === selectedReminderTaskId
  );

  if (index === -1) {
    return;
  }

  const currentTask = tasks[index];

  await cancelNotification(
    currentTask.notificationId
  );

  const updatedTask = {
    ...currentTask,
    reminder: false,
    updatedAt: new Date().toISOString()
  };

  updateTask(index, updatedTask);

  if (
    typeof uploadLocalNoteToSupabase === "function"
  ) {
    await uploadLocalNoteToSupabase(updatedTask);
  }

  if (typeof renderTasks === "function") {
    renderTasks();
  }

  renderRemindersScreen();
  closeReminderQuickMenu();
}


/* ==================================================
   VYKRESLENÍ OBRAZOVKY PŘIPOMÍNEK
================================================== */

function createReminderRow(task, showDate = false) {
  const item =
    document.createElement("div");

  item.className = "reminderItem";
  item.dataset.taskId = task.id;

  const date = new Date(task.date);

  const time =
    document.createElement("div");

  time.className = "reminderItemTime";

  if (showDate) {
    const dateLine =
      document.createElement("span");

    dateLine.className =
      "reminderItemDateLine";

    dateLine.textContent =
      date.toLocaleDateString(
        "cs-CZ",
        {
          weekday: "short",
          day: "numeric",
          month: "numeric"
        }
      );

    time.append(dateLine);
  }

  const timeLine =
    document.createElement("span");

  timeLine.textContent =
    date.toLocaleTimeString(
      "cs-CZ",
      {
        hour: "2-digit",
        minute: "2-digit"
      }
    );

  time.append(timeLine);

  const content =
    document.createElement("div");

  content.className =
    "reminderItemContent";

  const title =
    document.createElement("div");

  title.className =
    "reminderItemTitle";

  const icon =
    document.createElement("span");

  icon.className =
    "reminderItemArea";

  icon.textContent =
    task.area === "work" ? "💼" : "🏠";

  const titleText =
    document.createElement("span");

  titleText.textContent =
    task.title || "Bez názvu";

  title.append(icon, titleText);
  content.append(title);

  const preview =
    (task.note || "")
      .replace(/\s+/g, " ")
      .trim();

  if (preview) {
    const previewElement =
      document.createElement("div");

    previewElement.className =
      "reminderItemPreview";

    previewElement.textContent = preview;
    content.append(previewElement);
  }

  const menuButton =
    document.createElement("button");

  menuButton.type = "button";
  menuButton.className =
    "reminderItemMenu";
  menuButton.setAttribute(
    "aria-label",
    `Upravit připomínku ${task.title || "Bez názvu"}`
  );
  menuButton.textContent = "⋮";

  menuButton.addEventListener(
    "click",
    (event) => {
      event.stopPropagation();
      openReminderQuickMenu(task);
    }
  );

  item.addEventListener("click", () => {
    if (
      typeof openTaskEditorById === "function"
    ) {
      openTaskEditorById(task.id);
    }
  });

  item.append(
    time,
    content,
    menuButton
  );

  return item;
}


function renderRemindersScreen() {
  const todayList =
    document.getElementById("remindersToday");

  const tomorrowList =
    document.getElementById("remindersTomorrow");

  const laterList =
    document.getElementById("remindersLater");

  if (
    !todayList ||
    !tomorrowList ||
    !laterList
  ) {
    return;
  }

  todayList.innerHTML = "";
  tomorrowList.innerHTML = "";
  laterList.innerHTML = "";

  const reminders =
    getActiveReminders();

  const now = new Date();

  const todayStart =
    new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );

  const tomorrowStart =
    new Date(todayStart);

  tomorrowStart.setDate(
    tomorrowStart.getDate() + 1
  );

  const dayAfterTomorrow =
    new Date(todayStart);

  dayAfterTomorrow.setDate(
    dayAfterTomorrow.getDate() + 2
  );

  reminders.forEach((task) => {
    const date = new Date(task.date);

    if (
      date >= todayStart &&
      date < tomorrowStart
    ) {
      todayList.append(
        createReminderRow(task)
      );
      return;
    }

    if (
      date >= tomorrowStart &&
      date < dayAfterTomorrow
    ) {
      tomorrowList.append(
        createReminderRow(task)
      );
      return;
    }

    laterList.append(
      createReminderRow(task, true)
    );
  });

  if (!todayList.children.length) {
    todayList.innerHTML =
      `<p class="remindersEmpty">Žádné připomínky.</p>`;
  }

  if (!tomorrowList.children.length) {
    tomorrowList.innerHTML =
      `<p class="remindersEmpty">Žádné připomínky.</p>`;
  }

  if (!laterList.children.length) {
    laterList.innerHTML =
      `<p class="remindersEmpty">Žádné připomínky.</p>`;
  }
}


/* ==================================================
   OVLÁDÁNÍ FILTRŮ A RYCHLÉHO MENU
================================================== */

document
  .querySelectorAll(".remindersFilter")
  .forEach((button) => {
    button.addEventListener("click", () => {
      activeReminderFilter =
        button.dataset.reminderFilter || "all";

      document
        .querySelectorAll(".remindersFilter")
        .forEach((filterButton) => {
          filterButton.classList.toggle(
            "active",
            filterButton === button
          );
        });

      renderRemindersScreen();
    });
  });


document
  .getElementById("closeReminderQuickMenu")
  ?.addEventListener(
    "click",
    closeReminderQuickMenu
  );


reminderQuickMenu?.addEventListener(
  "click",
  (event) => {
    if (event.target === reminderQuickMenu) {
      closeReminderQuickMenu();
    }
  }
);


document
  .querySelectorAll("[data-reminder-delay]")
  .forEach((button) => {
    button.addEventListener("click", async () => {
      const minutes = Number(
        button.dataset.reminderDelay
      );

      if (!Number.isFinite(minutes)) {
        return;
      }

      await postponeReminder(minutes);
    });
  });


document
  .getElementById("reminderTomorrowMorningButton")
  ?.addEventListener(
    "click",
    postponeReminderToTomorrowMorning
  );


document
  .getElementById("saveReminderQuickDateButton")
  ?.addEventListener(
    "click",
    saveCustomReminderDate
  );


document
  .getElementById("disableReminderButton")
  ?.addEventListener(
    "click",
    disableSelectedReminder
  );


document
  .getElementById("openReminderNoteButton")
  ?.addEventListener("click", () => {
    const taskId = selectedReminderTaskId;

    closeReminderQuickMenu();

    if (
      taskId &&
      typeof openTaskEditorById === "function"
    ) {
      openTaskEditorById(taskId);
    }
  });
