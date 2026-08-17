const searchNotes =
  document.getElementById("searchNotes");
// ==========================================
// OCHRANA VYHLEDÁVÁNÍ PROTI AUTOFILLU
// Chrome někdy do vyhledávání automaticky
// vloží uložený e-mail. Při startu aplikace
// proto vyhledávání vždy vyčistíme.
// ==========================================

function vycistiAutofillVyhledavani() {
  if (!searchNotes) {
    return;
  }

  searchNotes.value = "";

  searchNotes.dispatchEvent(
    new Event("input", {
      bubbles: true
    })
  );
}

window.addEventListener(
  "pageshow",
  () => {
    vycistiAutofillVyhledavani();

    setTimeout(
      vycistiAutofillVyhledavani,
      300
    );

    setTimeout(
      vycistiAutofillVyhledavani,
      1000
    );
  }
);

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
