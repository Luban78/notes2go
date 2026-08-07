console.log("Capacitor:", window.Capacitor);
console.log(
  "LocalNotifications:",
  window.Capacitor?.Plugins?.LocalNotifications
);


// 1. Požádá Android o povolení zobrazovat notifikace
async function requestNotificationPermission() {
  const LocalNotifications =
    window.Capacitor?.Plugins?.LocalNotifications;

  if (!LocalNotifications) {
    console.log("Local Notifications nejsou dostupné.");
    return;
  }

  const permission =
    await LocalNotifications.requestPermissions();

  console.log("Povolení notifikací:", permission);
}


// 2. Naplánuje konkrétní notifikaci na datum a čas
async function scheduleNotification(notificationId, title, dateTime) {
  const LocalNotifications =
    window.Capacitor?.Plugins?.LocalNotifications;

  if (!LocalNotifications) {
    console.log("Local Notifications nejsou dostupné.");
    return;
  }

  const notificationDate = new Date(dateTime);

  await LocalNotifications.schedule({
    notifications: [
      {
        title: title || "Notes2Go",
        body: "Máš naplánovanou poznámku.",
        id: notificationId,
        schedule: {
          at: notificationDate
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

// 3. Mění vzhled zvonku podle toho,
// jestli je připomínka zapnutá nebo vypnutá
function updateReminderButton(enabled) {
  const reminderButton =
    document.getElementById("reminderButton");

  reminderButton.classList.toggle("active", enabled);
}


// 4. Kliknutí na zvonek
reminderButton.addEventListener("click", () => {

  // Bez data a času reminder nedovolíme zapnout
  if (!modalDate.value || !modalTime.value) {
    alert("Nejdřív nastav datum a čas upozornění.");
    return;
  }

  // Přepne stav true / false
  reminderEnabled = !reminderEnabled;

  if (reminderEnabled) {

    // Při zapnutí požádáme Android o povolení
    requestNotificationPermission();

    // Zvonek se zvýrazní
    updateReminderButton(true);

  } else {

    // Při vypnutí se zvýraznění odstraní
    updateReminderButton(false);
  }
});