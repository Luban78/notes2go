const searchNotes =
  document.getElementById("searchNotes");
  
const noSearchResults =
  document.getElementById("noSearchResults");



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
    
  const todos =
  (task.todos || [])
  .map((todo) => todo.text || "")
  .join(" ")
  .toLowerCase();
  

  return (
  title.includes(searchText) ||
  note.includes(searchText) ||
  todos.includes(searchText)
);
}




searchNotes.addEventListener("input", () => {
  console.log("SEARCH EVENT");
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
const visibleCardCount =
  pinnedLeft.children.length +
  pinnedRight.children.length;
  
  noSearchResults.hidden =
  visibleCardCount !== 0;
/*  
  console.log(
  "karty:",
  visibleCardCount,
  "hidden:",
  noSearchResults.hidden
);
console.log(
  "display:",
  getComputedStyle(noSearchResults).display
);
console.log(
  noSearchResults.getBoundingClientRect()
);
console.log(
  "skrytý rodič:",
  noSearchResults.closest("[hidden]")
);*/
});