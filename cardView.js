const changeViewButton =
  document.getElementById("changeViewButton");

let cardView =
  localStorage.getItem("cardView") || "grid";


function applyCardView() {
  pinnedCards.classList.toggle(
    "listView",
    cardView === "list"
  );
}






function updateCardViewButton() {
  changeViewButton.textContent =
    cardView === "grid" ? "☰" : "▦";
}

changeViewButton.addEventListener("click", () => {
  cardView =
    cardView === "grid" ?
    "list" :
    "grid";
  
  localStorage.setItem(
  "cardView",
  cardView
);

applyCardView();
renderTasks();
updateCardViewButton();
});

applyCardView();
updateCardViewButton();