const changeViewButton = document.getElementById("changeViewButton");
const cardSortButton = document.getElementById("cardSortButton");
const cardSortMenuLabel = document.getElementById("cardSortMenuLabel");
let cardView = localStorage.getItem("cardView") || "grid";
function applyCardView() {
  pinnedCards.classList.toggle("listView", cardView === "list");
}
function updateCardViewButton() {
  const desktop693C = window.matchMedia("(min-width: 1100px) and (hover: hover) and (pointer: fine)").matches;
  if (desktop693C) {
    // 4 columns = 8 squares; 3 columns = 6 squares. Current mode, not next mode.
    const columns = cardView === "list" ? 3 : 4;
    const squares = columns * 2;
    const xStep = 7;
    const yStep = 8;
    const width = 4 * xStep - 2;
    const rects = Array.from({length:squares}, (_,i) =>
      `<rect x="${(i % columns)*xStep+1}" y="${Math.floor(i/columns)*yStep+1}" width="5" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="1.35"/>`
    ).join("");
    changeViewButton.innerHTML = `<svg class="lnColumnsIcon693C" viewBox="0 0 ${width+2} 16" width="42" height="24" aria-hidden="true">${rects}</svg>`;
    changeViewButton.title = `Zobrazeny ${columns} sloupce – přepnout na ${columns === 4 ? 3 : 4}`;
    changeViewButton.setAttribute("aria-label",changeViewButton.title);
    return;
  }
  const pouzitSvg = window.LubaNoteIcons?.pouzitSvgIkony?.() === true;
  if (!pouzitSvg) {
    changeViewButton.innerHTML = cardView === "grid" ? "☰" :
      `<span class="cardGridIcon"><span></span><span></span><span></span><span></span></span>`;
    return;
  }
  const nazevIkony = cardView === "grid" ? "seznam" : "mrizka";
  const hostitel = window.LubaNoteIcons?.vytvorHostitele(nazevIkony,["searchActionIcon"]);
  if (hostitel) changeViewButton.replaceChildren(hostitel);
}
function ziskejSmerRazeniKaretProMenu() {
  return localStorage.getItem("cardSortDirection") === "asc" ? "asc" : "desc";
}
function aktualizujPopisekRazeniKaret() {
  if (!cardSortMenuLabel) return;
  cardSortMenuLabel.textContent = ziskejSmerRazeniKaretProMenu() === "asc" ?
    (window.LubaNoteI18n?.t?.("sort.labelOldest","Nové karty: dole") || "Nové karty: dole") :
    (window.LubaNoteI18n?.t?.("sort.labelNewest","Nové karty: nahoře") || "Nové karty: nahoře");
}
cardSortButton?.addEventListener("click", () => {
  if (typeof mainMenu !== "undefined") mainMenu.hidden = true;
  if (typeof window.otevriVyberovyModal !== "function") return;
  window.otevriVyberovyModal({
    nadpis: window.LubaNoteI18n?.t?.("sort.title","Umístění nových karet") || "Umístění nových karet",
    vybranaHodnota: ziskejSmerRazeniKaretProMenu(),
    moznosti: [
      {hodnota:"desc",popisek:window.LubaNoteI18n?.t?.("sort.newest","Nové karty nahoru") || "Nové karty nahoru"},
      {hodnota:"asc",popisek:window.LubaNoteI18n?.t?.("sort.oldest","Starší karty nahoru") || "Starší karty nahoru"}
    ],
    poVyberu: (novySmer) => {
      localStorage.setItem("cardSortDirection",novySmer === "asc" ? "asc" : "desc");
      aktualizujPopisekRazeniKaret();
      renderTasks();
    }
  });
});
changeViewButton.addEventListener("click", () => {
  cardView = cardView === "grid" ? "list" : "grid";
  localStorage.setItem("cardView",cardView);
  applyCardView();
  renderTasks();
  updateCardViewButton();
});
window.addEventListener("lubanote:icon-style-change",updateCardViewButton);
applyCardView();
updateCardViewButton();
aktualizujPopisekRazeniKaret();
const desktopCardLayoutMedia = window.matchMedia("(min-width: 900px)");
desktopCardLayoutMedia.addEventListener?.("change", () => {renderTasks();updateCardViewButton();});
window.matchMedia("(min-width: 1100px) and (hover: hover) and (pointer: fine)")
  .addEventListener?.("change",updateCardViewButton);
window.addEventListener("lubanote:language-change",aktualizujPopisekRazeniKaret);
