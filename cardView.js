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
  changeViewButton.innerHTML =
    cardView === "grid" ?
    "☰" :
    `
        <span class="cardGridIcon">
          <span></span>
          <span></span>
          <span></span>
          <span></span>
        </span>
      `;
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

/* ==========================================
   RESPONSIVNÍ PŘECHOD MOBIL ↔ PC
   ========================================== */

const desktopCardLayoutMedia =
  window.matchMedia("(min-width: 900px)");

desktopCardLayoutMedia.addEventListener?.(
  "change",
  () => {
    renderTasks();
  }
);
