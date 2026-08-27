let activeArea = "private";
let activeTags = [];
let activeAreaFilter = "all";
let activeTagFilter = null;
let vytvarimeTajnyStitek = false;



const DEFAULT_TAGS = ["code", "důležité", "projekt"];
let syncedTags = [];


function normalizujStitekProZalohu(
  stitek,
  vychoziPoradi = 0
) {
  const name = String(
    stitek?.name || ""
  ).trim();

  if (!name) {
    return null;
  }

  const poradi = Number(
    stitek?.sort_order
  );

  return {
    name,
    is_secret:
      stitek?.is_secret === true,
    sort_order:
      Number.isFinite(poradi)
        ? poradi
        : vychoziPoradi
  };
}


function pripravStitkyProZalohu(stitky) {
  const podleNazvu = new Map();

  (Array.isArray(stitky) ? stitky : [])
    .forEach((stitek, index) => {
      const normalizovany =
        normalizujStitekProZalohu(
          stitek,
          index
        );

      if (!normalizovany) {
        return;
      }

      podleNazvu.set(
        normalizovany.name
          .toLocaleLowerCase("cs-CZ"),
        normalizovany
      );
    });

  return Array.from(podleNazvu.values())
    .sort(
      (a, b) =>
        a.sort_order - b.sort_order
    );
}


async function ziskejStitkyProKompletniZalohu() {
  if (
    !navigator.onLine ||
    !supabaseClient ||
    typeof getCurrentUser !== "function"
  ) {
    throw new Error(
      "Kompletní záloha potřebuje připojení k internetu pro bezpečné načtení všech štítků."
    );
  }

  const user = await getCurrentUser();

  if (!user?.id) {
    throw new Error(
      "Před kompletní zálohou se přihlas ke svému účtu LubaNote."
    );
  }

  const dotaz = supabaseClient
    .from("tags")
    .select(
      "name, is_secret, sort_order"
    )
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("sort_order", {
      ascending: true
    });

  const { data, error } =
    typeof sCasovymLimitem === "function"
      ? await sCasovymLimitem(
          dotaz,
          5000,
          "Načtení štítků pro zálohu"
        )
      : await dotaz;

  if (error || !Array.isArray(data)) {
    throw new Error(
      "Štítky se nepodařilo bezpečně načíst pro kompletní zálohu."
    );
  }

  syncedTags = data;

  return pripravStitkyProZalohu(data);
}


async function obnovStitkyZKompletniZalohy(
  stitky,
  user
) {
  const obnovovaneStitky =
    pripravStitkyProZalohu(stitky);

  if (
    !user?.id ||
    !supabaseClient
  ) {
    return false;
  }

  const { data: existujici, error } =
    await supabaseClient
      .from("tags")
      .select(
        "id, name, is_secret, sort_order, deleted_at"
      )
      .eq("user_id", user.id);

  if (error) {
    console.error(
      "Načtení štítků před obnovou selhalo:",
      error.message
    );
    return false;
  }

  const podleNazvu = new Map(
    (existujici || []).map((stitek) => [
      String(stitek.name || "")
        .trim()
        .toLocaleLowerCase("cs-CZ"),
      stitek
    ])
  );

  const noveStitky = [];

  for (const stitek of obnovovaneStitky) {
    const klic = stitek.name
      .toLocaleLowerCase("cs-CZ");

    const puvodni = podleNazvu.get(klic);

    if (!puvodni) {
      noveStitky.push({
        user_id: user.id,
        ...stitek
      });
      continue;
    }

    const { error: updateError } =
      await supabaseClient
        .from("tags")
        .update({
          name: stitek.name,
          is_secret: stitek.is_secret,
          sort_order: stitek.sort_order,
          deleted_at: null
        })
        .eq("id", puvodni.id);

    if (updateError) {
      console.error(
        "Obnova štítku selhala:",
        stitek.name,
        updateError.message
      );
      return false;
    }
  }

  if (noveStitky.length > 0) {
    const { error: insertError } =
      await supabaseClient
        .from("tags")
        .insert(noveStitky);

    if (insertError) {
      console.error(
        "Obnova nových štítků selhala:",
        insertError.message
      );
      return false;
    }
  }

  if (
    typeof loadTagsFromSupabase ===
    "function"
  ) {
    await loadTagsFromSupabase();
  }

  return true;
}
// ==========================================
// TAJNÝ REŽIM – STAV
// Záměrně se NEUKLÁDÁ do localStorage.
// Po restartu aplikace je vždy zamčený.
// ==========================================

let tajnyRezimOdemceny = false;

// ==========================================
// VÝCHOZÍ ŠTÍTKY – JEDNORÁZOVÉ ZALOŽENÍ
// Výchozí štítky vytvoří pouze tehdy,
// pokud v Supabase nikdy neexistovaly.
// Smazaný štítek se proto znovu nevytvoří.
// ==========================================
let filtrTajnychPoznamekAktivni = false;
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
const secretMenuModal =
  document.getElementById("secretMenuModal");

const closeSecretMenuButton =
  document.getElementById("closeSecretMenuButton");
const areaFilterButtons =
  document.querySelectorAll("[data-area-filter]");

const tagTaskButton =
  document.getElementById("tagTaskButton");

const tagMenu =
  document.getElementById("tagMenu");

const favoriteFilterButton =
  document.getElementById("favoriteFilterButton");
const secretFilterButton =
  document.getElementById("secretFilterButton");
  
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

const secretUnlockModal =
  document.getElementById("secretUnlockModal");

const secretUnlockInput =
  document.getElementById("secretUnlockInput");

const closeSecretUnlockButton =
  document.getElementById("closeSecretUnlockButton");

const cancelSecretUnlockButton =
  document.getElementById("cancelSecretUnlockButton");

const confirmSecretUnlockButton =
  document.getElementById("confirmSecretUnlockButton");
  
const secretUnlockTitle =
  document.getElementById("secretUnlockTitle");

const secretUnlockDescription =
  document.getElementById("secretUnlockDescription");

const secretUnlockConfirmInput =
  document.getElementById("secretUnlockConfirmInput");
  
const lockSecretModeButton =
  document.getElementById("lockSecretModeButton");

const deleteTagConfirmModal =
  document.getElementById("deleteTagConfirmModal");

const deleteTagConfirmText =
  document.getElementById("deleteTagConfirmText");

const cancelDeleteTagButton =
  document.getElementById("cancelDeleteTagButton");

const confirmDeleteTagButton =
  document.getElementById("confirmDeleteTagButton");

const createSecretTagButton =
  document.getElementById("createSecretTagButton");
const newTagModalTitle =
  document.getElementById("newTagModalTitle");
  
  
  
  
  
  
  









/*
 * Trvalá tlačítka Secret modalů registrujeme jen jednou.
 * Dříve se jejich listenery přidávaly při každém renderTagFilters(),
 * takže se s každým překreslením vrstvily a aplikace zpomalovala.
 */
closeSecretUnlockButton?.addEventListener(
  "click",
  () => {
    secretUnlockModal.hidden = true;
    secretUnlockInput.value = "";
  }
);

lockSecretModeButton?.addEventListener(
  "click",
  () => {
    if (typeof zamkniTajnyRezim === "function") {
      zamkniTajnyRezim(false);
    }
  }
);

cancelSecretUnlockButton?.addEventListener(
  "click",
  () => {
    secretUnlockModal.hidden = true;
    secretUnlockInput.value = "";
  }
);

closeSecretMenuButton?.addEventListener(
  "click",
  () => {
    secretMenuModal.hidden = true;
  }
);


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

secretFilterButton?.addEventListener(
  "click",
  () => {
    if (!tajnyRezimOdemceny) {
      return;
    }

    filtrTajnychPoznamekAktivni =
      !filtrTajnychPoznamekAktivni;

    secretFilterButton.classList.toggle(
      "active",
      filtrTajnychPoznamekAktivni
    );
    renderTasks();
  }
);

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
  if (!tagKeSmazani || confirmDeleteTagButton.disabled) {
    return;
  }

  confirmDeleteTagButton.disabled = true;

  const ukonciCekani =
    window.LubaNoteUI?.zacniCekaniAkce?.(
      "Mažu štítek…",
      300
    ) || (() => {});

  try {
    const uspesne = await smazStitek(
      tagKeSmazani
    );

    if (!uspesne) {
      return;
    }

    deleteTagConfirmModal.hidden = true;
    tagKeSmazani = null;

    vykresliSpravuStitku();
  } finally {
    ukonciCekani();
    confirmDeleteTagButton.disabled = false;
  }
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

  if (!name || saveNewTagModalButton.disabled) {
    return;
  }

  const tagAlreadyExists = syncedTags.some((tag) =>
    tag.name.trim().toLowerCase() === name.toLowerCase()
  );

  if (tagAlreadyExists) {
    newTagModal.hidden = true;

    zobrazZpravuAplikace(
      vytvarimeTajnyStitek
        ? "Tajné štítky"
        : "Štítky",
      "Štítek s tímto názvem už existuje."
    );

    vytvarimeTajnyStitek = false;
    return;
  }

  saveNewTagModalButton.disabled = true;

  const puvodniText =
    saveNewTagModalButton.textContent;

  saveNewTagModalButton.textContent =
    "⏳ Ukládám…";

  const ukonciCekani =
    window.LubaNoteUI?.zacniCekaniAkce?.(
      "Ukládám štítek…",
      300
    ) || (() => {});

  try {
    if (vytvarimeTajnyStitek) {
      const uspesne =
        await vytvorTajnyStitek(name);

      if (!uspesne) {
        return;
      }

      newTagModal.hidden = true;
      vytvarimeTajnyStitek = false;

      await loadTagsFromSupabase();
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
      console.error(
        "Tag insert error:",
        error.message
      );
      return;
    }

    newTagModal.hidden = true;
    await loadTagsFromSupabase();
  } finally {
    ukonciCekani();
    saveNewTagModalButton.disabled = false;
    saveNewTagModalButton.textContent =
      puvodniText;
  }
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

      upravitTlacitko.disabled = true;

      const ukonciCekani =
        window.LubaNoteUI?.zacniCekaniAkce?.(
          "Přejmenovávám štítek…",
          300
        ) || (() => {});

      try {
        const uspesne = await prejmenujStitek(
          tag,
          vstup.value
        );

        if (uspesne) {
          vykresliSpravuStitku();
        }
      } finally {
        ukonciCekani();
        upravitTlacitko.disabled = false;
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

async function ulozPoznamkyPoZmeneStitku(poznamky) {
  if (
    window.LubaNoteSync
      ?.provedLokalniZmenuASynchronizuj
  ) {
    return await window.LubaNoteSync
      .provedLokalniZmenuASynchronizuj(
        () => saveAllTasks(poznamky)
      );
  }

  const vysledek = await saveAllTasks(poznamky);

  if (
    navigator.onLine &&
    typeof uploadLocalNoteToSupabase === "function"
  ) {
    const zmenene = poznamky.filter(
      (poznamka) => poznamka?.id
    );

    setTimeout(() => {
      Promise.allSettled(
        zmenene.map((poznamka) =>
          uploadLocalNoteToSupabase(poznamka)
        )
      );
    }, 0);
  }

  return vysledek;
}

function obnovStitkyNaPozadi() {
  setTimeout(() => {
    loadTagsFromSupabase().catch((error) => {
      console.warn(
        "Obnovení štítků z cloudu bylo odloženo:",
        error
      );
    });
  }, 0);
}

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
    await ulozPoznamkyPoZmeneStitku(
      poznamky
    );
  }

  syncedTags = syncedTags.map(
    (aktualniTag) =>
      aktualniTag.id === tag.id
        ? {
            ...aktualniTag,
            name: novyNazev
          }
        : aktualniTag
  );

  renderTagFilters();
  requestAnimationFrame(renderTasks);
  obnovStitkyNaPozadi();

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
    await ulozPoznamkyPoZmeneStitku(
      poznamky
    );
  }

  syncedTags = syncedTags.filter(
    (aktualniTag) => aktualniTag.id !== tag.id
  );

  renderTagFilters();
  requestAnimationFrame(renderTasks);
  obnovStitkyNaPozadi();

  return true;
}


function getAllTags() {
  const noteTags = loadTask()
    .flatMap((task) => task.tags || []);
  
  const cloudTags = syncedTags
    .filter((tag) => {
      if (tajnyRezimOdemceny) {
        return true;
      }
      
      return tag.is_secret !== true;
    })
    .map((tag) => tag.name);
  
  const secretTagNames = new Set(
    syncedTags
    .filter((tag) => tag.is_secret === true)
    .map((tag) => tag.name)
  );
  
  const visibleNoteTags = noteTags.filter((tagName) => {
    if (tajnyRezimOdemceny) {
      return true;
    }
    
    return !secretTagNames.has(tagName);
  });
  
  return [
    ...new Set([
      ...visibleNoteTags,
      ...cloudTags
    ])
  ];
}



// ==========================================
// TAJNÉ ŠTÍTKY – KONTROLA TYPU ŠTÍTKU
// Vrátí true, pokud je štítek v Supabase
// označený jako tajný.
// ==========================================

function jeTajnyStitek(nazevStitku) {
  const tag = syncedTags.find(
    (tag) =>
      tag.name.trim().toLowerCase() ===
      nazevStitku.trim().toLowerCase()
  );

  return tag?.is_secret === true;
}

// ==========================================
// TAJNÉ POZNÁMKY – KONTROLA POZNÁMKY
// Poznámka je tajná, pokud obsahuje
// alespoň jeden tajný štítek.
// ==========================================

function jeTajnaPoznamka(poznamka) {
  return poznamka.isSecret === true;
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

// ==========================================
// TAJNÉ POZNÁMKY – FILTROVÁNÍ
// Zamčený režim tajné poznámky vždy skryje.
// Odemčený režim je zobrazí a 🔓 může
// vyfiltrovat pouze tajné poznámky.
// ==========================================

function taskMatchesSecret(task) {
  const jeTajna =
    jeTajnaPoznamka(task);

  if (!tajnyRezimOdemceny) {
    return !jeTajna;
  }

  if (filtrTajnychPoznamekAktivni) {
    return jeTajna;
  }

  return true;
}

function taskMatchesTag(task) {
  if (activeTagFilter === null) {
    return true;
  }

  return (task.tags || []).includes(activeTagFilter);
}


// ==========================================
// TAJNÉ ŠTÍTKY – OTEVŘENÍ TAJNÉ NABÍDKY
// Tuto funkci používá long press
// nahoře i v editoru poznámky.
// ==========================================

async function otevriTajneStitky() {
  if (tajnyRezimOdemceny) {
  secretMenuModal.hidden = false;
  return;
}
  
  const maHeslo =
    await maNastaveneTajneHeslo();
  
  secretUnlockInput.value = "";
  secretUnlockConfirmInput.value = "";
  
  if (maHeslo) {
    secretUnlockTitle.textContent =
      "🔒 Odemknout tajný režim";
    
    secretUnlockDescription.textContent =
      "Zadej hlavní heslo.";
    
    secretUnlockConfirmInput.hidden = true;
    
    confirmSecretUnlockButton.textContent =
      "🔓 Odemknout";
  } else {
    secretUnlockTitle.textContent =
      "🔐 Vytvořit hlavní heslo";
    
    secretUnlockDescription.textContent =
      "Vytvoř hlavní heslo pro tajné poznámky.";
    
    secretUnlockConfirmInput.hidden = false;
    
    confirmSecretUnlockButton.textContent =
      "🔐 Vytvořit heslo";
  }
  
  secretUnlockModal.hidden = false;
  secretUnlockInput.focus();
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
  addTagButton.textContent = "+ Nový štítek";
  let casovacHornihoTajnehoStisku = null;
let horniTajnyLongPressSpusten = false;
let horniStiskStartX = 0;
let horniStiskStartY = 0;


addTagButton.addEventListener("pointerdown", (event) => {
  horniStiskStartX = event.clientX;
  horniStiskStartY = event.clientY;
  
  horniTajnyLongPressSpusten = false;
  
  clearTimeout(casovacHornihoTajnehoStisku);
  
  casovacHornihoTajnehoStisku = setTimeout(() => {
    horniTajnyLongPressSpusten = true;
    otevriTajneStitky();
  }, 600);
});

addTagButton.addEventListener("pointermove", (event) => {
  const vzdalenostX =
    Math.abs(event.clientX - horniStiskStartX);
  
  const vzdalenostY =
    Math.abs(event.clientY - horniStiskStartY);
  
  if (
    vzdalenostX > 20 ||
    vzdalenostY > 20
  ) {
    clearTimeout(casovacHornihoTajnehoStisku);
  }
});

addTagButton.addEventListener("pointerup", () => {
  clearTimeout(casovacHornihoTajnehoStisku);
});

addTagButton.addEventListener("pointercancel", () => {
  clearTimeout(casovacHornihoTajnehoStisku);
});


addTagButton.addEventListener("click", () => {
  vytvarimeTajnyStitek = false;
  newTagModalTitle.textContent = "Nový štítek";
  if (horniTajnyLongPressSpusten) {
    horniTajnyLongPressSpusten = false;
    return;
  }
  
  const newTagModal =
    document.getElementById("newTagModal");
  
  const newTagModalInput =
    document.getElementById("newTagModalInput");
  
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

// ==========================================
// TAJNÉ ŠTÍTKY – LONG PRESS NA NOVÝ ŠTÍTEK
// Stejný princip jako dlouhý stisk na kartách.
// Krátký klik = běžný nový štítek.
// Dlouhý stisk = nabídka tajných štítků.
// ==========================================

let casovacTajnehoStisku = null;
let tajnyLongPressSpusten = false;
let stitekPressStartX = 0;
let stitekPressStartY = 0;

const CAS_TAJNEHO_STISKU = 600;
const VZDALENOST_ZRUSENI_TAJNEHO_STISKU = 20;

createTagButton.addEventListener("pointerdown", (event) => {
  stitekPressStartX = event.clientX;
  stitekPressStartY = event.clientY;
  tajnyLongPressSpusten = false;

  clearTimeout(casovacTajnehoStisku);

  casovacTajnehoStisku = setTimeout(() => {
    tajnyLongPressSpusten = true;

    zobrazZpravuAplikace(
      "Tajné štítky",
      "Dlouhý stisk funguje."
    );
  }, CAS_TAJNEHO_STISKU);
});

createTagButton.addEventListener("pointermove", (event) => {
  const vzdalenostX =
    Math.abs(event.clientX - stitekPressStartX);

  const vzdalenostY =
    Math.abs(event.clientY - stitekPressStartY);

  if (
    vzdalenostX > VZDALENOST_ZRUSENI_TAJNEHO_STISKU ||
    vzdalenostY > VZDALENOST_ZRUSENI_TAJNEHO_STISKU
  ) {
    clearTimeout(casovacTajnehoStisku);
  }
});

createTagButton.addEventListener("pointerup", () => {
  clearTimeout(casovacTajnehoStisku);
});

createTagButton.addEventListener("pointercancel", () => {
  clearTimeout(casovacTajnehoStisku);
});

createTagButton.addEventListener("click", () => {
  if (tajnyLongPressSpusten) {
    tajnyLongPressSpusten = false;
    return;
  }

  openNewTagEditor();
});

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

createSecretTagButton?.addEventListener(
  "click",
  () => {
    vytvarimeTajnyStitek = true;
    secretMenuModal.hidden = true;
    
    newTagModalTitle.textContent =
      "🔐 Nový tajný štítek";
    
    newTagModal.hidden = false;
    newTagModalInput.value = "";
    newTagModalInput.focus();
  }
);























tagFilterButtons.addEventListener("click", async (event) => {

  const button = event.target.closest("[data-tag-filter]");

  if (!button) {
    return;
  }

  const vybranyStitek =
    button.dataset.tagFilter;


  /*
   * HROMADNÉ PŘIŘAZENÍ ŠTÍTKU
   *
   * Původní štítky vybraných karet se záměrně nahradí
   * právě jedním nově zvoleným štítkem.
   * Uložení i následný sync řeší společná bezpečná cesta
   * v script.js + sync.js, bez přímých jednotlivých uploadů.
   */
  if (rezimVyberuKaret) {
    const vysledek =
      await provedHromadnouZmenuVybranychKaret(
        (ukol) => {
          ukol.tags = [vybranyStitek];
        }
      );

    if (!vysledek?.lokalneUlozeno) {
      console.error(
        "Hromadné přiřazení štítku se nepodařilo lokálně uložit."
      );

      return;
    }

    const pocetOznacenych =
      vysledek.pocet;

    ukonciRezimVyberuKaret();

    zobrazPotvrzeniAkce(
      `Štítek „${vybranyStitek}“ přiřazen ${pocetOznacenych} kartám`
    );

    return;
  }


  /* Normální filtrování štítků */
  activeTagFilter =
    activeTagFilter === vybranyStitek
      ? null
      : vybranyStitek;

  updateTagFilterUI();

  renderTasks();

});

updateTagMenuUI();
renderTagFilters();

// ==========================================
// TAJNÉ ŠTÍTKY – VYTVOŘENÍ
// Uloží nový štítek do Supabase
// s příznakem is_secret = true.
// ==========================================

async function vytvorTajnyStitek(nazev) {
  const user = await getCurrentUser();

  if (!user) {
    return false;
  }

  const novyNazev =
    normalizeTagName(nazev);

  if (!novyNazev) {
    return false;
  }

  const uzExistuje = syncedTags.some(
    (tag) =>
      tag.name.trim().toLowerCase() ===
      novyNazev.toLowerCase()
  );

  if (uzExistuje) {
    zobrazZpravuAplikace(
      "Tajné štítky",
      "Štítek s tímto názvem už existuje."
    );

    return false;
  }

  const { error } = await supabaseClient
    .from("tags")
    .insert({
      user_id: user.id,
      name: novyNazev,
      is_secret: true,
      sort_order: syncedTags.length
    });

  if (error) {
    console.error(
      "Vytvoření tajného štítku se nepodařilo:",
      error.message
    );

    return false;
  }

  await loadTagsFromSupabase();

  return true;
}
