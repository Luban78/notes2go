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
  reminderButton.classList.toggle("active", enabled);
}

reminderButton.addEventListener("click", () => {
  if (!modalDate.value || !modalTime.value) {
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
      
      return reminderDate >= now;
    })
    .sort((a, b) => {
      return new Date(a.date) -
        new Date(b.date);
    });
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
  
  const now =
    new Date();
  
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
  
  
  function createReminderRow(task) {
    const item =
      document.createElement("div");
    
    item.className =
      "reminderItem";
    
    const date =
      new Date(task.date);
    
    const timeText =
      date.toLocaleTimeString(
        "cs-CZ",
        {
          hour: "2-digit",
          minute: "2-digit"
        }
      );
    
    const areaIcon =
      task.area === "work" ?
      "💼" :
      "🏠";
    
    const title =
      task.title ||
      "Bez názvu";
    
    const preview =
      task.note ?
      task.note
      .replace(/\s+/g, " ")
      .trim() :
      "";
    
    item.innerHTML = `
      <div class="reminderItemTime">
        ${timeText}
      </div>

      <div class="reminderItemContent">
        <div class="reminderItemTitle">
          <span>${areaIcon}</span>
          <span>${title}</span>
        </div>

        ${
          preview
            ? `<div class="reminderItemPreview">
                ${preview}
              </div>`
            : ""
        }
      </div>

      <button
        type="button"
        class="reminderItemMenu"
        aria-label="Další možnosti"
      >
        ⋮
      </button>
    `;
    
    return item;
  }
  
  
  reminders.forEach((task) => {
    const date =
      new Date(task.date);
    
    const row =
      createReminderRow(task);
    
    if (
      date >= todayStart &&
      date < tomorrowStart
    ) {
      todayList.append(row);
      
      return;
    }
    
    if (
      date >= tomorrowStart &&
      date < dayAfterTomorrow
    ) {
      tomorrowList.append(row);
      
      return;
    }
    
    laterList.append(row);
  });
  
  
  if (!todayList.children.length) {
    todayList.innerHTML =
      `<p class="remindersEmpty">
        Žádné připomínky.
      </p>`;
  }
  
  if (!tomorrowList.children.length) {
    tomorrowList.innerHTML =
      `<p class="remindersEmpty">
        Žádné připomínky.
      </p>`;
  }
  
  if (!laterList.children.length) {
    laterList.innerHTML =
      `<p class="remindersEmpty">
        Žádné připomínky.
      </p>`;
  }
}