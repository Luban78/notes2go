let activeArea = "private";
let activeTags = [];
let activeAreaFilter = "all";
let activeTagFilter = null;

const DEFAULT_TAGS = ["code", "důležité", "projekt"];
let syncedTags = [];

// ==========================================
// VÝCHOZÍ ŠTÍTKY – JEDNORÁZOVÉ ZALOŽENÍ
// Výchozí štítky vytvoří pouze tehdy,
// pokud v Supabase nikdy neexistovaly.
// Smazaný štítek se proto znovu nevytvoří.
// ==========================================

async function zajistiVychoziStitkyVSupabase(user) {
  const { data, error } = await supabaseClient
    .from("tags")
    .select("name, deleted_at");

  if (error) {
    console.error(
      "Načtení výchozích štítků se nepodařilo:",
      error.message
    );
    return;
  }

  const existujiciNazvy = (data || []).map(
    (tag) => tag.name.trim().toLowerCase()
  );

  const chybejiciStitky = DEFAULT_TAGS.filter(
    (tag) =>
      !existujiciNazvy.includes(
        tag.toLowerCase()
      )
  );

  if (chybejiciStitky.length === 0) {
    return;
  }

  const noveStitky = chybejiciStitky.map(
    (tag, index) => ({
      user_id: user.id,
      name: tag,
      is_secret: false,
      sort_order: (data || []).length + index
    })
  );

  const { error: insertError } =
    await supabaseClient
      .from("tags")
      .insert(noveStitky);

  if (insertError) {
    console.error(
      "Vytvoření výchozích štítků se nepodařilo:",
      insertError.message
    );
  }
}

const areaFilterButtons =
  document.querySelectorAll("[data-area-filter]");

const tagTaskButton =
  document.getElementById("tagTaskButton");

const tagMenu =
  document.getElementById("tagMenu");

const favoriteFilterButton =
  document.getElementById("favoriteFilterButton");

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
//const tagMessageModal = document.getElementById("tagMessageModal");
//const tagMessageText = document.getElementById("tagMessageText");
//const closeTagMessageButton = document.getElementById("closeTagMessageButton");

const deleteTagConfirmModal =
  document.getElementById("deleteTagConfirmModal");

const deleteTagConfirmText =
  document.getElementById("deleteTagConfirmText");

const cancelDeleteTagButton =
  document.getElementById("cancelDeleteTagButton");

const confirmDeleteTagButton =
  document.getElementById("confirmDeleteTagButton");

let tagKeSmazani = null;

// ==========================================
// SPRÁVA ŠTÍTKŮ – MODAL
// ==========================================

const manageTagsMenuButton =
  document.getElementById("manageTagsMenuButton");

const manageTagsModal =
  document.getElementById("manageTagsModal");

const closeManageTagsButton =
  document.getElementById("closeManageTagsButton");

const manageTagsList =
  document.getElementById("manageTagsList");



let favoriteFilterActive = false;

favoriteFilterButton?.addEventListener("click", () => {
  favoriteFilterActive =
    !favoriteFilterActive;

  favoriteFilterButton.classList.toggle(
    "active",
    favoriteFilterActive
  );

  renderTasks();
});


cancelDeleteTagButton?.addEventListener("click", () => {
  deleteTagConfirmModal.hidden = true;
  tagKeSmazani = null;
});

confirmDeleteTagButton?.addEventListener("click", async () => {
  if (!tagKeSmazani) {
    return;
  }

  const uspesne = await smazStitek(
    tagKeSmazani
  );

  if (!uspesne) {
    return;
  }

  deleteTagConfirmModal.hidden = true;
  tagKeSmazani = null;

  vykresliSpravuStitku();
});

manageTagsMenuButton?.addEventListener("click", () => {
  vykresliSpravuStitku();
  manageTagsModal.hidden = false;
  mainMenu.hidden = true;
});

closeManageTagsButton?.addEventListener("click", () => {
  manageTagsModal.hidden = true;
});

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
  
  zobrazZpravuAplikace(
    "Štítky",
    "Štítek s tímto názvem už existuje."
  );
  
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

  await zajistiVychoziStitkyVSupabase(user);

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

// ==========================================
// SPRÁVA ŠTÍTKŮ – VYKRESLENÍ SEZNAMU
// ==========================================

function vykresliSpravuStitku() {
  manageTagsList.innerHTML = "";

  syncedTags.forEach((tag) => {
    const radek = document.createElement("div");

    radek.className = "manageTagRow";

    const nazev = document.createElement("span");
    nazev.className = "manageTagName";
    nazev.textContent = tag.name;

    const akce = document.createElement("div");
    akce.className = "manageTagActions";

    const upravitTlacitko = document.createElement("button");
    upravitTlacitko.type = "button";
    upravitTlacitko.textContent = "✏️";
    upravitTlacitko.setAttribute(
      "aria-label",

      `Přejmenovat štítek ${tag.name}`
    );
    let vstup = null;

    upravitTlacitko.addEventListener("click", async () => {
      if (!vstup) {
        vstup = document.createElement("input");

        vstup.type = "text";
        vstup.value = tag.name;
        vstup.maxLength = 24;
        vstup.className = "manageTagRenameInput";

        nazev.replaceWith(vstup);

        upravitTlacitko.textContent = "✔️";

        vstup.focus();
        vstup.select();

        return;
      }

      const uspesne = await prejmenujStitek(
        tag,
        vstup.value
      );

      if (uspesne) {
        vykresliSpravuStitku();
      }
    });

    const smazatTlacitko = document.createElement("button");
    smazatTlacitko.type = "button";
    smazatTlacitko.textContent = "🗑️";
    smazatTlacitko.setAttribute(
      "aria-label",
      `Smazat štítek ${tag.name}`
    );

    smazatTlacitko.addEventListener("click", () => {
      tagKeSmazani = tag;

      deleteTagConfirmText.textContent =
        `Opravdu chceš smazat štítek „${tag.name}“?`;

      deleteTagConfirmModal.hidden = false;
    });

    akce.append(
      upravitTlacitko,
      smazatTlacitko
    );

    radek.append(
      nazev,
      akce
    );

    manageTagsList.append(radek);
  });
}


// ==========================================
// SPRÁVA ŠTÍTKŮ – PŘEJMENOVÁNÍ
// Změní název štítku v Supabase
// a ve všech poznámkách, které ho používají.
// ==========================================

async function prejmenujStitek(tag, novyNazev) {
  const user = await getCurrentUser();

  if (!user) {
    return false;
  }

  novyNazev = normalizeTagName(novyNazev);

  if (!novyNazev) {
    return false;
  }

  if (
    novyNazev.toLowerCase() ===
    tag.name.toLowerCase()
  ) {
    return true;
  }

  const uzExistuje = syncedTags.some(
    (jinyTag) =>
      jinyTag.id !== tag.id &&
      jinyTag.name.toLowerCase() ===
      novyNazev.toLowerCase()
  );

  if (uzExistuje) {
    zobrazZpravuAplikace(
  "Štítky",
  "Štítek s tímto názvem už existuje."
);

    return false;
  }

  const { error } = await supabaseClient
    .from("tags")
    .update({
      name: novyNazev
    })
    .eq("id", tag.id)
    .eq("user_id", user.id);

  if (error) {
    console.error(
      "Přejmenování štítku se nepodařilo:",
      error.message
    );

    return false;
  }

  const poznamky = loadTask();
  const zmenenePoznamky = [];

  poznamky.forEach((poznamka) => {
    const puvodniStitky =
      poznamka.tags || [];

    const obsahujeStitek =
      puvodniStitky.some(
        (nazev) =>
          nazev.toLowerCase() ===
          tag.name.toLowerCase()
      );

    if (!obsahujeStitek) {
      return;
    }

    poznamka.tags =
      puvodniStitky.map((nazev) =>
        nazev.toLowerCase() ===
          tag.name.toLowerCase()
          ? novyNazev
          : nazev
      );

    poznamka.updatedAt =
      new Date().toISOString();

    zmenenePoznamky.push(poznamka);
  });

  if (zmenenePoznamky.length > 0) {
    saveAllTasks(poznamky);

    for (const poznamka of zmenenePoznamky) {
      await uploadLocalNoteToSupabase(
        poznamka
      );
    }
  }

  await loadTagsFromSupabase();

  renderTasks();

  return true;
}

// ==========================================
// SPRÁVA ŠTÍTKŮ – SMAZÁNÍ
// Nastaví deleted_at v Supabase
// a odebere štítek ze všech poznámek.
// ==========================================

async function smazStitek(tag) {
  const user = await getCurrentUser();

  if (!user) {
    return false;
  }

  const deletedAt = new Date().toISOString();

  const { error } = await supabaseClient
    .from("tags")
    .update({
      deleted_at: deletedAt
    })
    .eq("id", tag.id)
    .eq("user_id", user.id);

  if (error) {
    console.error(
      "Smazání štítku se nepodařilo:",
      error.message
    );

    return false;
  }

  const poznamky = loadTask();
  const zmenenePoznamky = [];

  poznamky.forEach((poznamka) => {
    const puvodniStitky =
      poznamka.tags || [];

    const noveStitky =
      puvodniStitky.filter(
        (nazev) =>
          nazev.toLowerCase() !==
          tag.name.toLowerCase()
      );

    if (
      noveStitky.length ===
      puvodniStitky.length
    ) {
      return;
    }

    poznamka.tags = noveStitky;
    poznamka.updatedAt =
      new Date().toISOString();

    zmenenePoznamky.push(poznamka);
  });

  if (zmenenePoznamky.length > 0) {
    saveAllTasks(poznamky);

    for (const poznamka of zmenenePoznamky) {
      await uploadLocalNoteToSupabase(
        poznamka
      );
    }
  }

  await loadTagsFromSupabase();

  renderTasks();

  return true;
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

function taskMatchesFavorite(task) {
  if (!favoriteFilterActive) {
    return true;
  }

  return task.favorite === true;
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
    zobrazZpravuAplikace(
  "Štítky",
  "Poznámka může mít maximálně 2 štítky. Nejdřív jeden odeber."
);
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
    zobrazZpravuAplikace(
  "Štítky",
  "Poznámka může mít maximálně 2 štítky. Nejdřív jeden odeber."
);
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

categoryTaskButton.addEventListener("click", () => {
  activeArea =
    activeArea === "work"
      ? "private"
      : "work";

  updateTagMenuUI();
});





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
  
  const tag = button.dataset.tag;
  
  const jeAktivni =
    activeTags.includes(tag);
  
  if (
    !jeAktivni &&
    activeTags.length >= 2
  ) {
    zobrazZpravuAplikace(
      "Štítky",
      "Poznámka může mít maximálně 2 štítky. Nejdřív jeden odeber."
    );
    
    return;
  }
  
  toggleTag(tag);
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

