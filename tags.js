let activeArea = "private";
let activeTags = [];
let activeAreaFilter = "all";
let activeTagFilter = null;

const DEFAULT_TAGS = ["code", "důležité", "projekt"];
let syncedTags = [];

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

const tagOptions =
  document.querySelector(".tagOptions");

const createTagButton =
  document.getElementById("createTagButton");

const newTagRow =
  document.getElementById("newTagRow");

const newTagInput =
  document.getElementById("newTagInput");

const saveNewTagButton = document.getElementById("saveNewTagButton");

const cancelNewTagButton =
  document.getElementById("cancelNewTagButton");

const tagFilterButtons =
  document.getElementById("tagFilterButtons");


const newTagModalInput = document.getElementById("newTagModalInput");

const cancelNewTagModalButton =
  document.getElementById("cancelNewTagModalButton");
const tagMessageModal = document.getElementById("tagMessageModal");
const tagMessageText = document.getElementById("tagMessageText");
const closeTagMessageButton = document.getElementById("closeTagMessageButton");

cancelNewTagModalButton.addEventListener("click", () => {
  newTagModal.hidden = true;
});

cancelNewTagButton.addEventListener("click", () => {
  newTagModal.hidden = true;
});

saveNewTagModalButton.addEventListener("click", async () => {
  const name = newTagModalInput.value.trim();

  if (!name) {
    return;
  }
  const tagAlreadyExists = syncedTags.some((tag) =>
  tag.name.trim().toLowerCase() === name.toLowerCase()
);

if (tagAlreadyExists) {
  newTagModal.hidden = true;
  
  tagMessageText.textContent = "Štítek s tímto názvem už existuje.";
  tagMessageModal.hidden = false;
  
  return;
}

  const user = await getCurrentUser();

  if (!user) {
    return;
  }

  const { error } = await supabaseClient
    .from("tags")
    .insert({
      user_id: user.id,
      name: name,
      is_secret: false,
      sort_order: syncedTags.length
    });

  if (error) {
    console.error("Tag insert error:", error.message);
    return;
  }

  newTagModal.hidden = true;

  await loadTagsFromSupabase();
});


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
  closeNewTagEditor();
}

function normalizeTagName(tag) {
  return tag.trim().replace(/\s+/g, " ");
}



async function loadTagsFromSupabase() {
  const user = await getCurrentUser();

  if (!user) {
    return;
  }

  const { data, error } = await supabaseClient
    .from("tags")
    .select("*")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Tag download error:", error.message);
    return;
  }

  syncedTags = data || [];
  renderTagFilters();
}



function getAllTags() {
  const noteTags = loadTask()
    .flatMap((task) => task.tags || []);
  
  const cloudTags = syncedTags.map((tag) => tag.name);
  
  return [...new Set([...noteTags, ...cloudTags])];
}


function getAvailableTags() {
  return [...new Set([
    ...DEFAULT_TAGS,
    ...getAllTags(),
    ...activeTags
  ])];
}

function renderTagMenuTags() {
  const availableTags = getAvailableTags();

  tagOptions
    .querySelectorAll("[data-tag]")
    .forEach((button) => button.remove());

  availableTags.forEach((tag) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.tag = tag;
    button.textContent = tag;
    button.classList.toggle("active", activeTags.includes(tag));

    tagOptions.insertBefore(button, createTagButton);
  });
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

  renderTagMenuTags();
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
  
  const addTagButton = document.createElement("button");

addTagButton.classList.add("categoryTab");
addTagButton.textContent = "+";
addTagButton.addEventListener("click", () => {
  const newTagModal = document.getElementById("newTagModal");
  const newTagModalInput = document.getElementById("newTagModalInput");
  
  newTagModal.hidden = false;
  newTagModalInput.value = "";
  newTagModalInput.focus();
});

tagFilterButtons.append(addTagButton);
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

function openNewTagEditor() {
  if (activeTags.length >= 2) {
    alert("Poznámka může mít maximálně 2 štítky. Nejdřív jeden odeber.");
    return;
  }

  newTagRow.hidden = false;
  createTagButton.hidden = true;
  newTagInput.value = "";
  newTagInput.focus();
}

function closeNewTagEditor() {
  newTagRow.hidden = true;
  createTagButton.hidden = false;
  newTagInput.value = "";
}

function createNewTag() {
  if (activeTags.length >= 2) {
    alert("Poznámka může mít maximálně 2 štítky. Nejdřív jeden odeber.");
    closeNewTagEditor();
    return;
  }

  const newTag = normalizeTagName(newTagInput.value);

  if (!newTag) {
    newTagInput.focus();
    return;
  }

  const existingTag = getAvailableTags().find(
    (tag) => tag.toLocaleLowerCase("cs-CZ") ===
      newTag.toLocaleLowerCase("cs-CZ")
  );

  const tagToUse = existingTag || newTag;

  if (!activeTags.includes(tagToUse)) {
    activeTags.push(tagToUse);
  }

  closeNewTagEditor();
  updateTagMenuUI();
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

  if (!tagMenu.hidden) {
    updateTagMenuUI();
  }
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

tagOptions.addEventListener("click", (event) => {
  const button = event.target.closest("[data-tag]");

  if (!button) {
    return;
  }

  toggleTag(button.dataset.tag);
  updateTagMenuUI();
});

createTagButton.addEventListener("click", openNewTagEditor);
saveNewTagButton.addEventListener("click", createNewTag);
cancelNewTagButton.addEventListener("click", closeNewTagEditor);


newTagInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    createNewTag();
  }

  if (event.key === "Escape") {
    closeNewTagEditor();
  }
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

closeTagMessageButton.addEventListener("click", () => {
  tagMessageModal.hidden = true;
});