const searchNotes =
  document.getElementById("searchNotes");

function taskMatchesSearch(task) {
  const searchText =
    searchNotes.value
      .trim()
      .toLowerCase();

  if (!searchText) {
    return true;
  }

  const title =
    (task.title || "").toLowerCase();

  const note =
    (task.note || "").toLowerCase();

  return (
    title.includes(searchText) ||
    note.includes(searchText)
  );
}

searchNotes.addEventListener("input", () => {
  const searchText =
    searchNotes.value
      .trim()
      .toLowerCase();
  const tasks = loadTask();
  
  const filteredTasks = tasks.filter((task) => {
  const title =
    (task.title || "").toLowerCase();
  
  const note =
    (task.note || "").toLowerCase();
  
  return (
    title.includes(searchText) ||
    note.includes(searchText)
  );
});
console.log(
  filteredTasks.map((task) => task.title)
);
renderTasks();
});