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

async function scheduleNotification(notificationId, title, dateTime) {
  const LocalNotifications =
    window.Capacitor?.Plugins?.LocalNotifications;

  if (!LocalNotifications) {
    return;
  }

  await LocalNotifications.schedule({
    notifications: [
      {
        title: title || "LubaNote",
        body: "Máš naplánovanou poznámku.",
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
