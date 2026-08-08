/* ========================================
   OBLAST A ŠTÍTKY POZNÁMKY
======================================== */

let activeArea = "private";
let activeTags = [];
let activeAreaFilter = "all";
let activeTagFilter = null;

const areaFilterButtons =
  document.querySelectorAll("[data-area-filter]");
  
areaFilterButtons.forEach(button => {
  button.addEventListener("click", () => {
    activeAreaFilter = button.dataset.areaFilter;

    if (activeAreaFilter === "all") {
      activeTagFilter = null;
    }
    updateTagFilterUI();

    updateAreaFilterUI();
    renderTasks();
  });
});

function updateAreaFilterUI() {
  areaFilterButtons.forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.areaFilter === activeAreaFilter
    );
  });
}

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

function taskMatchesArea(task) {
  if (activeAreaFilter === "all") {
    return true;
  }

  const taskArea = task.area || "private";

  return taskArea === activeAreaFilter;
}

function taskMatchesTag(task) {
  if (activeTagFilter === null) {
    return true;
  }

  const taskTags = task.tags || [];

  return taskTags.includes(activeTagFilter);
}

function getAllTags() {
  const tasks = loadTask();
  const allTags = tasks.flatMap(task => task.tags || []);

  return [...new Set(allTags)];
}

const tagFilterButtons =
  document.getElementById("tagFilterButtons");

function renderTagFilters() {
  tagFilterButtons.innerHTML = "";

  const tags = getAllTags();

  tags.forEach(tag => {
    const button = document.createElement("button");

    button.classList.add("categoryTab");
    button.textContent = tag;
    button.dataset.tagFilter = tag;

    tagFilterButtons.append(button);
  });
}
renderTagFilters();

tagFilterButtons.addEventListener("click", (event) => {
  const button = event.target.closest("[data-tag-filter]");
  
  if (!button) {
    return;
  }
  
  activeTagFilter =
  activeTagFilter === button.dataset.tagFilter ?
  null :
  button.dataset.tagFilter;
  
  updateTagFilterUI();
  
  renderTasks();
});

function updateTagFilterUI() {
  tagFilterButtons
    .querySelectorAll("[data-tag-filter]")
    .forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.tagFilter === activeTagFilter
      );
    });
}