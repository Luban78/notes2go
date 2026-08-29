const changeViewButton =
  document.getElementById("changeViewButton");

const cardSortButton =
  document.getElementById("cardSortButton");

const cardSortMenuLabel =
  document.getElementById("cardSortMenuLabel");

let cardView =
  localStorage.getItem("cardView") || "grid";

function applyCardView() {
  pinnedCards.classList.toggle(
    "listView",
    cardView === "list"
  );
}

function updateCardViewButton() {
  const pouzitSvg =
    window.LubaNoteIcons?.pouzitSvgIkony?.() === true;

  if (!pouzitSvg) {
    /*
     * Původní přepínač LubaNote – vracíme přesně jeho
     * původní vzhled.
     */
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

    return;
  }

  const nazevIkony =
    cardView === "grid" ?
      "seznam" :
      "mrizka";

  const hostitel =
    window.LubaNoteIcons?.vytvorHostitele(
      nazevIkony,
      ["searchActionIcon"]
    );

  if (hostitel) {
    changeViewButton.replaceChildren(hostitel);
  }
}

function ziskejSmerRazeniKaretProMenu() {
  return localStorage.getItem(
    "cardSortDirection"
  ) === "asc"
    ? "asc"
    : "desc";
}

function aktualizujPopisekRazeniKaret() {
  if (!cardSortMenuLabel) {
    return;
  }

  cardSortMenuLabel.textContent =
    ziskejSmerRazeniKaretProMenu() === "asc"
      ? "Řazení: nejstarší nahoře"
      : "Řazení: nejnovější nahoře";
}

cardSortButton?.addEventListener(
  "click",
  () => {
    if (typeof mainMenu !== "undefined") {
      mainMenu.hidden = true;
    }

    if (
      typeof window.otevriVyberovyModal !==
      "function"
    ) {
      return;
    }

    window.otevriVyberovyModal({
      nadpis: "Řazení karet",
      vybranaHodnota:
        ziskejSmerRazeniKaretProMenu(),
      moznosti: [
        {
          hodnota: "desc",
          popisek: "Nejnovější nahoře"
        },
        {
          hodnota: "asc",
          popisek: "Nejstarší nahoře"
        }
      ],
      poVyberu: (novySmer) => {
        localStorage.setItem(
          "cardSortDirection",
          novySmer === "asc"
            ? "asc"
            : "desc"
        );

        aktualizujPopisekRazeniKaret();
        renderTasks();
      }
    });
  }
);

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

window.addEventListener(
  "lubanote:icon-style-change",
  updateCardViewButton
);

applyCardView();
updateCardViewButton();
aktualizujPopisekRazeniKaret();

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
