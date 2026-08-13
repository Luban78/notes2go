let activeArea = "private";
let activeTags = [];
let activeAreaFilter = "all";
let activeTagFilter = null;

const areaFilterButtons =
  document.querySelectorAll("[data-area-filter]");

const tagTaskButton =
  document.getElementById("tagTaskButton");

const tagMenu =
  document.getElementById("tagMenu");

const tagModalTitle =
  document.getElementById("modalTitle");

const tagModalText =
  document.getElementById("modalText");

const tagModalRichText =
  document.getElementById("modalRichText");

const categoryTaskButton =
  document.getElementById("categoryTaskButton");

const areaButtons =
  document.querySelectorAll("[data-area]");

const tagButtons =
  document.querySelectorAll("[data-tag]");

const tagFilterButtons =
  document.getElementById("tagFilterButtons");

function updateAreaFilterUI() {
  areaFilterButtons.forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.areaFilter === activeAreaFilter
    );
  });
}

function setActiveArea(area) {
  activeArea = area;
}

function toggleTag(tag) {
  if (activeTags.includes(tag)) {
    activeTags = activeTags.filter(
      (currentTag) => currentTag !== tag
    );
    return;
  }

  if (activeTags.length < 2) {
    activeTags.push(tag);
  }
}

function closeTagMenu() {
  tagMenu.hidden = true;
}

function updateTagMenuUI() {
  areaButtons.forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.area === activeArea
    );
  });

  categoryTaskButton.textContent =
    activeArea === "work" ? "💼" : "🏠";

  tagButtons.forEach((button) => {
    button.classList.toggle(
      "active",
      activeTags.includes(button.dataset.tag)
    );
  });
}

function taskMatchesArea(task) {
  if (activeAreaFilter === "all") {
    return true;
  }

  return (task.area || "private") === activeAreaFilter;
}

function taskMatchesTag(task) {
  if (activeTagFilter === null) {
    return true;
  }

  return (task.tags || []).includes(activeTagFilter);
}

function getAllTags() {
  const allTags = loadTask()
    .flatMap((task) => task.tags || []);

  return [...new Set(allTags)];
}

function renderTagFilters() {
  tagFilterButtons.innerHTML = "";

  const tags = getAllTags();

  if (
    activeTagFilter !== null &&
    !tags.includes(activeTagFilter)
  ) {
    activeTagFilter = null;
  }

  tags.forEach((tag) => {
    const button = document.createElement("button");

    button.classList.add("categoryTab");
    button.textContent = tag;
    button.dataset.tagFilter = tag;

    tagFilterButtons.append(button);
  });
}

function updateTagFilterUI() {
  tagFilterButtons
    .querySelectorAll("[data-tag-filter]")
    .forEach((button) => {
      button.classList.toggle(
        "active",
        button.dataset.tagFilter === activeTagFilter
      );
    });
}

areaFilterButtons.forEach((button) => {
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

tagTaskButton.addEventListener("click", () => {
  tagMenu.hidden = !tagMenu.hidden;
});

tagModalTitle.addEventListener("pointerdown", closeTagMenu);
tagModalText.addEventListener("pointerdown", closeTagMenu);
tagModalRichText.addEventListener("pointerdown", closeTagMenu);

areaButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setActiveArea(button.dataset.area);
    updateTagMenuUI();
  });
});

tagButtons.forEach((button) => {
  button.addEventListener("click", () => {
    toggleTag(button.dataset.tag);
    updateTagMenuUI();
  });
});

tagFilterButtons.addEventListener("click", (event) => {
  const button = event.target.closest("[data-tag-filter]");

  if (!button) {
    return;
  }

  activeTagFilter =
    activeTagFilter === button.dataset.tagFilter
      ? null
      : button.dataset.tagFilter;

  updateTagFilterUI();
  renderTasks();
});

updateTagMenuUI();
renderTagFilters();
