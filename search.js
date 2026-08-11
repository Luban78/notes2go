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
  renderTasks();

  const visibleCardCount =
    pinnedLeft.children.length +
    pinnedRight.children.length;

  noSearchResults.hidden = visibleCardCount !== 0;
});
