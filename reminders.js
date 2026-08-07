


function updateReminderButton(enabled) {
  const reminderButton = document.getElementById("reminderButton");
  
  reminderButton.classList.toggle("active", enabled);
}

reminderButton.addEventListener("click", () => {
  if (!modalDate.value || !modalTime.value) {
  alert("Nejdřív nastav datum a čas upozornění.");
  return;
}
  reminderEnabled = !reminderEnabled;

  if (reminderEnabled) {
    reminderButton.classList.add("active");
  } else {
    updateReminderButton(false);
  }
});

