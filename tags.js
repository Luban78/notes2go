/* ========================================
   OBLAST A ŠTÍTKY POZNÁMKY
======================================== */

let activeArea = "private";
let activeTags = [];


/* Nastavení oblasti poznámky */

function setActiveArea(area) {
  activeArea = area;
}


/* Přidání / odebrání štítku */

function toggleTag(tag) {
  if (activeTags.includes(tag)) {
    activeTags = activeTags.filter(
      currentTag => currentTag !== tag
    );
    return;
  }
  
  if (activeTags.length >= 2) {
    return;
  }
  
  activeTags.push(tag);
}


/* ========================================
   PRVKY EDITORU
======================================== */

const tagTaskButton =
  document.getElementById("tagTaskButton");

const tagMenu =
  document.getElementById("tagMenu");

const tagModalTitle =
  document.getElementById("modalTitle");

const tagModalText =
  document.getElementById("modalText");

const areaButtons =
  document.querySelectorAll("[data-area]");

const tagButtons =
  document.querySelectorAll("[data-tag]");


/* ========================================
   OTEVŘENÍ / ZAVŘENÍ MENU
======================================== */

function closeTagMenu() {
  tagMenu.hidden = true;
}

tagTaskButton.addEventListener("click", () => {
  tagMenu.hidden = !tagMenu.hidden;
});

tagModalTitle.addEventListener(
  "pointerdown",
  closeTagMenu
);

tagModalText.addEventListener(
  "pointerdown",
  closeTagMenu
);


/* ========================================
   VÝBĚR OBLASTI
======================================== */

areaButtons.forEach(button => {
  button.addEventListener("click", () => {
    setActiveArea(button.dataset.area);
    updateTagMenuUI();
  });
});


/* ========================================
   VÝBĚR ŠTÍTKŮ
======================================== */

tagButtons.forEach(button => {
  button.addEventListener("click", () => {
    toggleTag(button.dataset.tag);
    updateTagMenuUI();
  });
});


/* ========================================
   VZHLED AKTIVNÍCH VOLEB
======================================== */

function updateTagMenuUI() {
  areaButtons.forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.area === activeArea
    );
    const categoryTaskButton =
  document.getElementById("categoryTaskButton");

categoryTaskButton.textContent =
  activeArea === "work" ? "💼" : "🏠";
  });
  
  tagButtons.forEach(button => {
    button.classList.toggle(
      "active",
      activeTags.includes(button.dataset.tag)
    );
  });
}


/* První nastavení vzhledu */

updateTagMenuUI();