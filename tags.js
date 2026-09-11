let activeArea = "private";
let activeTags = [];
let activeAreaFilter = "all";
let activeTagFilter = null;
let vytvarimeTajnyStitek = false;



const DEFAULT_TAGS = ["code", "důležité", "projekt"];
let syncedTags = [];

/*
 * Poslední štítek vytvořený přímo v editoru.
 * Editor má maximálně tři řádky štítků, proto ho po vytvoření
 * držíme hned za tlačítkem „+ Nový štítek“, aby nezapadl na konec.
 * Po restartu aplikace se pořadí vrátí k běžnému pořadí štítků.
 */
let posledniStitekVytvorenyVEditoru = "";


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

  const id = String(
    stitek?.id || ""
  ).trim();

  return {
    ...(id ? { id } : {}),
    name,
    is_secret: stitek?.is_secret === true,
    sort_order: Number.isFinite(poradi) ?
      poradi :
      vychoziPoradi,
    color: String(stitek?.color || "system")
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

    const typ = normalizovany.is_secret ?
      "secret" :
      "public";

    podleNazvu.set(
      `${typ}:${normalizovany.name
        .toLocaleLowerCase("cs-CZ")}`,
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
      "id, name, encrypted_name, is_secret, sort_order, color"
    )
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("sort_order", {
      ascending: true
    });

  const { data, error } =
  typeof sCasovymLimitem === "function" ?
    await sCasovymLimitem(
      dotaz,
      5000,
      "Načtení štítků pro zálohu"
    ) :
    await dotaz;

  if (error || !Array.isArray(data)) {
    throw new Error(
      "Štítky se nepodařilo bezpečně načíst pro kompletní zálohu."
    );
  }

  const stitkyProZalohu = [];

  for (const tag of data) {
    if (tag.is_secret !== true) {
      stitkyProZalohu.push({
        id: tag.id,
        name: tag.name,
        is_secret: false,
        sort_order: tag.sort_order,
        color: tag.color
      });
      continue;
    }

    if (
      !tajnyRezimOdemceny ||
      typeof tajnySifrovaciKlic === "undefined" ||
      !tajnySifrovaciKlic ||
      typeof desifrujNazevTajnehoStitku !== "function"
    ) {
      throw new Error(
        "Nejdřív odemkni tajný režim. Tajné štítky musí být v kompletní záloze bezpečně zašifrované."
      );
    }

    if (!tag.encrypted_name) {
      throw new Error(
        "Tajný štítek nemá platný šifrovaný název. Záloha byla bezpečně zastavena."
      );
    }

    let skutecnyNazev;

    try {
      skutecnyNazev =
        await desifrujNazevTajnehoStitku(
          tag.encrypted_name,
          tag.id
        );
    } catch (error) {
      console.error(
        "Dešifrování tajného štítku pro zálohu selhalo:",
        error
      );

      throw new Error(
        "Tajný štítek se nepodařilo bezpečně připravit pro zálohu."
      );
    }

    stitkyProZalohu.push({
      id: tag.id,
      name: skutecnyNazev,
      is_secret: true,
      sort_order: tag.sort_order,
      color: tag.color
    });
  }

  /*
   * Důležité: data načtená přímo ze Supabase
   * NEPŘEPISUJÍ syncedTags. U tajných štítků je
   * name pouze technický identifikátor.
   */
  return pripravStitkyProZalohu(
    stitkyProZalohu
  );
}


async function ziskejStitkyProKompletniZalohuV4() {
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
      "id, name, encrypted_name, is_secret, sort_order, color"
    )
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("sort_order", {
      ascending: true
    });

  const { data, error } =
  typeof sCasovymLimitem === "function" ?
    await sCasovymLimitem(
      dotaz,
      5000,
      "Načtení štítků pro zálohu V4"
    ) :
    await dotaz;

  if (error || !Array.isArray(data)) {
    throw new Error(
      "Štítky se nepodařilo bezpečně načíst pro kompletní zálohu."
    );
  }

  const verejneStitky = [];
  const sifrovaneTajneStitky = [];

  for (const tag of data) {
    if (tag.is_secret !== true) {
      const normalizovany = normalizujStitekProZalohu({
        id: tag.id,
        name: tag.name,
        is_secret: false,
        sort_order: tag.sort_order,
        color: tag.color
      });

      if (normalizovany) {
        verejneStitky.push(normalizovany);
      }

      continue;
    }

    if (!tag.id || !tag.encrypted_name) {
      throw new Error(
        "Tajný štítek nemá platná šifrovaná data. Záloha byla bezpečně zastavena."
      );
    }

    const poradi = Number(tag.sort_order);

    sifrovaneTajneStitky.push({
      id: String(tag.id),
      encrypted_name: tag.encrypted_name,
      is_secret: true,
      sort_order: Number.isFinite(poradi) ?
        poradi :
        0,
      color: String(tag.color || "system")
    });
  }

  return {
    publicTags: pripravStitkyProZalohu(verejneStitky),
    secretTagRecords: sifrovaneTajneStitky
  };
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
      "id, name, encrypted_name, is_secret, sort_order, color, deleted_at"
    )
    .eq("user_id", user.id);

  if (error) {
    console.error(
      "Načtení štítků před obnovou selhalo:",
      error.message
    );
    return false;
  }

  const existujiciStitky =
    Array.isArray(existujici) ?
      existujici :
      [];

  const verejnePodleNazvu = new Map(
    existujiciStitky
      .filter(
        (stitek) => stitek.is_secret !== true
      )
      .map((stitek) => [
        String(stitek.name || "")
          .trim()
          .toLocaleLowerCase("cs-CZ"),
        stitek
      ])
  );

  const tajnePodleId = new Map(
    existujiciStitky
      .filter(
        (stitek) => stitek.is_secret === true
      )
      .map((stitek) => [
        String(stitek.id || ""),
        stitek
      ])
  );

  const tajnePodleNazvu = new Map();

  const obnovujeSeTajnyStitek =
    obnovovaneStitky.some(
      (stitek) => stitek.is_secret === true
    );

  if (obnovujeSeTajnyStitek) {
    if (
      !tajnyRezimOdemceny ||
      typeof tajnySifrovaciKlic === "undefined" ||
      !tajnySifrovaciKlic ||
      typeof zasifrujNazevTajnehoStitku !== "function" ||
      typeof desifrujNazevTajnehoStitku !== "function"
    ) {
      console.error(
        "Obnova tajných štítků vyžaduje odemčený tajný režim."
      );
      return false;
    }

    for (const tag of existujiciStitky) {
      if (
        tag.is_secret !== true ||
        !tag.encrypted_name
      ) {
        continue;
      }

      try {
        const nazev =
          await desifrujNazevTajnehoStitku(
            tag.encrypted_name,
            tag.id
          );

        tajnePodleNazvu.set(
          String(nazev || "")
            .trim()
            .toLocaleLowerCase("cs-CZ"),
          tag
        );
      } catch (error) {
        console.warn(
          "Existující tajný štítek se nepodařilo porovnat při obnově:",
          tag.id,
          error
        );
      }
    }
  }

  for (const stitek of obnovovaneStitky) {
    if (stitek.is_secret === true) {
      const zalozeneId = String(
        stitek.id || ""
      ).trim();

      const klicNazvu = stitek.name
        .toLocaleLowerCase("cs-CZ");

      const puvodni =
        (zalozeneId &&
          tajnePodleId.get(zalozeneId)) ||
        tajnePodleNazvu.get(klicNazvu) ||
        null;

      const tagId =
        puvodni?.id ||
        zalozeneId ||
        crypto.randomUUID();

      const zasifrovanyNazev =
        await zasifrujNazevTajnehoStitku(
          stitek.name,
          tagId
        );

      const dataProUlozeni = {
        name: `__secret_tag_${tagId}`,
        encrypted_name: zasifrovanyNazev,
        is_secret: true,
        sort_order: stitek.sort_order,
        color: stitek.color,
        deleted_at: null
      };

      if (puvodni) {
        const { error: updateError } =
        await supabaseClient
          .from("tags")
          .update(dataProUlozeni)
          .eq("id", puvodni.id)
          .eq("user_id", user.id);

        if (updateError) {
          console.error(
            "Obnova tajného štítku selhala:",
            stitek.name,
            updateError.message
          );
          return false;
        }
      } else {
        const { error: insertError } =
        await supabaseClient
          .from("tags")
          .insert({
            id: tagId,
            user_id: user.id,
            ...dataProUlozeni
          });

        if (insertError) {
          console.error(
            "Obnova nového tajného štítku selhala:",
            insertError.message
          );
          return false;
        }
      }

      continue;
    }

    const klic = stitek.name
      .toLocaleLowerCase("cs-CZ");

    const puvodni =
      verejnePodleNazvu.get(klic);

    if (puvodni) {
      const { error: updateError } =
      await supabaseClient
        .from("tags")
        .update({
          name: stitek.name,
          is_secret: false,
          sort_order: stitek.sort_order,
          color: stitek.color,
          deleted_at: null
        })
        .eq("id", puvodni.id)
        .eq("user_id", user.id);

      if (updateError) {
        console.error(
          "Obnova veřejného štítku selhala:",
          stitek.name,
          updateError.message
        );
        return false;
      }

      continue;
    }

    const dataNovehoStitku = {
      user_id: user.id,
      name: stitek.name,
      is_secret: false,
      sort_order: stitek.sort_order,
      color: stitek.color,
      deleted_at: null
    };

    if (stitek.id) {
      dataNovehoStitku.id = stitek.id;
    }

    const { error: insertError } =
      await supabaseClient
        .from("tags")
        .insert(dataNovehoStitku);

    if (insertError) {
      console.error(
        "Obnova nového veřejného štítku selhala:",
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


async function obnovStitkyZKompletniZalohyV4(
  verejneStitky,
  secretTagRecords,
  user
) {
  if (!user?.id || !supabaseClient) {
    return false;
  }

  if (!await obnovStitkyZKompletniZalohy(
    verejneStitky,
    user
  )) {
    return false;
  }

  const sifrovane = Array.isArray(secretTagRecords)
    ? secretTagRecords
    : [];

  if (sifrovane.length === 0) {
    return true;
  }

  const { data: existujici, error } =
    await supabaseClient
      .from("tags")
      .select("id, user_id, is_secret")
      .eq("user_id", user.id);

  if (error) {
    console.error(
      "Načtení tajných štítků před obnovou V4 selhalo:",
      error.message
    );
    return false;
  }

  const existujiciPodleId = new Map(
    (Array.isArray(existujici) ? existujici : [])
      .filter((stitek) => stitek?.id)
      .map((stitek) => [String(stitek.id), stitek])
  );

  for (const zaznam of sifrovane) {
    const id = String(zaznam?.id || "").trim();
    const encryptedName = zaznam?.encrypted_name;
    const poradi = Number(zaznam?.sort_order);

    if (
      !id ||
      zaznam?.is_secret !== true ||
      !encryptedName ||
      typeof encryptedName !== "object" ||
      encryptedName.algorithm !== "AES-GCM" ||
      !encryptedName.iv ||
      !encryptedName.ciphertext
    ) {
      console.error(
        "Tajný štítek V4 nemá platná šifrovaná data.",
        zaznam
      );
      return false;
    }

    const dataProUlozeni = {
      name: `__secret_tag_${id}`,
      encrypted_name: encryptedName,
      is_secret: true,
      sort_order: Number.isFinite(poradi) ? poradi : 0,
      color: String(zaznam?.color || "system"),
      deleted_at: null
    };

    if (existujiciPodleId.has(id)) {
      const { error: updateError } =
        await supabaseClient
          .from("tags")
          .update(dataProUlozeni)
          .eq("id", id)
          .eq("user_id", user.id);

      if (updateError) {
        console.error(
          "Obnova tajného štítku V4 selhala:",
          id,
          updateError.message
        );
        return false;
      }
    } else {
      const { error: insertError } =
        await supabaseClient
          .from("tags")
          .insert({
            id,
            user_id: user.id,
            ...dataProUlozeni
          });

      if (insertError) {
        console.error(
          "Obnova nového tajného štítku V4 selhala:",
          id,
          insertError.message
        );
        return false;
      }
    }
  }

  if (
    typeof loadTagsFromSupabase === "function"
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
async function zajistiVychoziStitkyVSupabase(
  user,
  prednacteneStitky = null
) {
  /*
   * Start optimalizace 2:
   * loadTagsFromSupabase() už má při běžném startu načtený celý seznam
   * štítků. Použijeme stejná data i pro kontrolu výchozích štítků,
   * místo druhého samostatného GET na tabulku tags.
   *
   * Samostatný dotaz zůstává jako fallback pro případ, že tuto funkci
   * někdy zavolá jiná cesta bez přednačtených dat.
   */
  let data = Array.isArray(prednacteneStitky)
    ? prednacteneStitky
    : null;

  if (!data) {
    const vysledek = await supabaseClient
      .from("tags")
      .select("name, deleted_at");

    if (vysledek.error) {
      console.error(
        "Načtení výchozích štítků se nepodařilo:",
        vysledek.error.message
      );
      return false;
    }

    data = vysledek.data || [];
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
    return false;
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
    return false;
  }

  /*
   * Jen při opravdu prvním založení výchozích štítků je potřeba
   * jednorázově načíst seznam znovu, aby nově vložené řádky byly
   * okamžitě v UI. U běžného startu se druhý GET už neprovede.
   */
  return true;
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

const tagScrollButton =
  document.getElementById("tagScrollButton");

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
    
    filtrTajnychPoznamekAktivni = !filtrTajnychPoznamekAktivni;
    
    secretFilterButton.classList.toggle(
      "active",
      filtrTajnychPoznamekAktivni
    );
    renderTasks();
  }
);

let favoriteFilterActive = false;

favoriteFilterButton?.addEventListener("click", () => {
  favoriteFilterActive = !favoriteFilterActive;
  
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

newTagModalInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    saveNewTagModalButton.click();
  }
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
      vytvarimeTajnyStitek ?
      "Tajné štítky" :
      "Štítky",
      "Štítek s tímto názvem už existuje."
    );
    
    vytvarimeTajnyStitek = false;
    return;
  }
  
  saveNewTagModalButton.disabled = true;
  
  const puvodniText =
    saveNewTagModalButton.textContent;
  
  saveNewTagModalButton.textContent =
    "Ukládám…";
  
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


/* ==========================================
   EDITOR – RYCHLÉ ROLOVÁNÍ ŠTÍTKŮ NA MOBILU
   ========================================== */

function aktualizujSipkuRolovaniStitku() {
  if (!tagScrollButton || !tagOptions) {
    return;
  }

  if (
    window.innerWidth >= 900 ||
    tagMenu.hidden
  ) {
    tagScrollButton.hidden = true;
    return;
  }

  const maximalniPosun = Math.max(
    0,
    tagOptions.scrollHeight - tagOptions.clientHeight
  );

  const lzeRolovat = maximalniPosun > 3;

  tagScrollButton.hidden = !lzeRolovat;

  if (!lzeRolovat) {
    return;
  }

  const jsmeDole =
    tagOptions.scrollTop >= maximalniPosun - 3;

  tagScrollButton.dataset.smer =
    jsmeDole ? "nahoru" : "dolu";

  tagScrollButton.textContent =
    jsmeDole ? "↑" : "↓";

  tagScrollButton.setAttribute(
    "aria-label",
    jsmeDole ?
      "Posunout štítky nahoru" :
      "Posunout štítky dolů"
  );
}


function narolujStitkyNahoru({
  plynule = false
} = {}) {
  if (!tagOptions) {
    return;
  }

  tagOptions.scrollTo({
    top: 0,
    behavior: plynule ? "smooth" : "auto"
  });

  requestAnimationFrame(
    aktualizujSipkuRolovaniStitku
  );
}


function normalizeTagName(tag) {
  return tag.trim().replace(/\s+/g, " ");
}


/*
 * START CACHE ŠTÍTKŮ V1
 *
 * Barvy a názvy veřejných štítků se mezi starty téměř nemění, ale
 * jejich síťové načtení dosud blokovalo splash o ~150 ms. Pro již
 * ověřenou instalaci proto držíme poslední bezpečný snapshot v
 * localStorage a server ho po UI READY pouze obnoví.
 *
 * DŮLEŽITÉ: dešifrovaný název tajného štítku se do cache NIKDY
 * neukládá. Tajný název zůstává prázdný, encrypted_name může zůstat
 * uložený stejně jako v Supabase.
 */
const TAG_START_CACHE_KEY = "lubanoteTagsStartCacheV1";

function pripravBezpecneStitkyProStartCache(stitky) {
  return (Array.isArray(stitky) ? stitky : []).map((tag) => {
    const kopie = { ...tag };

    if (kopie.is_secret === true) {
      kopie.name = "";
    }

    return kopie;
  });
}

function ulozStitkyDoStartCache(userId, stitky = syncedTags) {
  if (!userId) {
    return false;
  }

  try {
    localStorage.setItem(
      TAG_START_CACHE_KEY,
      JSON.stringify({
        userId: String(userId),
        savedAt: new Date().toISOString(),
        tags: pripravBezpecneStitkyProStartCache(stitky)
      })
    );

    return true;
  } catch (error) {
    console.warn("Cache štítků se nepodařilo uložit:", error);
    return false;
  }
}

function nactiStitkyZeStartCache(userId) {
  if (!userId) {
    return false;
  }

  try {
    const raw = localStorage.getItem(TAG_START_CACHE_KEY);

    if (!raw) {
      return false;
    }

    const cache = JSON.parse(raw);

    if (
      !cache ||
      String(cache.userId || "") !== String(userId) ||
      !Array.isArray(cache.tags)
    ) {
      return false;
    }

    syncedTags = pripravBezpecneStitkyProStartCache(cache.tags);

    if (typeof renderTagFilters === "function") {
      renderTagFilters();
    }

    if (typeof renderTasks === "function") {
      renderTasks();
    }

    return true;
  } catch (error) {
    console.warn("Cache štítků se nepodařilo načíst:", error);
    return false;
  }
}

window.LubaNoteTagsStartCache = {
  nacti: nactiStitkyZeStartCache
};


function shrnutiVdBarevStitku() {
  const stitky = Array.isArray(syncedTags) ? syncedTags : [];
  const barevneStitky = stitky.filter((tag) => {
    const barva = String(tag?.color || "system");
    return barva !== "system" && barva !== "";
  }).length;

  let poznamky = [];
  try {
    poznamky = typeof loadTask === "function" ? loadTask() : [];
  } catch (_error) {
    poznamky = [];
  }

  const sHlavnimStitkem = poznamky.filter((task) =>
    Array.isArray(task?.tags) && task.tags.length > 0
  );

  const hlavniStitekMaBarvu = sHlavnimStitkem.filter((task) => {
    try {
      return ziskejBarvuStitku(task.tags[0]) !== "system";
    } catch (_error) {
      return false;
    }
  }).length;

  let kartyCelkem = 0;
  let kartyBarevne = 0;

  try {
    const karty = Array.from(document.querySelectorAll(".taskCard"));
    kartyCelkem = karty.length;
    kartyBarevne = karty.filter((karta) =>
      Boolean(karta.dataset?.barvaKarty)
    ).length;
  } catch (_error) {
    // Diagnostika nesmí ovlivnit aplikaci.
  }

  return `tags=${stitky.length} coloredTags=${barevneStitky} ` +
    `notes=${poznamky.length} taggedNotes=${sHlavnimStitkem.length} ` +
    `resolvedColored=${hlavniStitekMaBarvu} ` +
    `cards=${kartyCelkem} coloredCards=${kartyBarevne}`;
}

function zapisVdBarevStitku(faze, detail = "") {
  window.LubaNoteStartupDiag?.zapis?.(
    "TAG-VD",
    `${faze} | ${shrnutiVdBarevStitku()}${detail ? ` | ${detail}` : ""}`
  );
}

/* Pouze čtecí diagnostika pro kompaktní TAG-VD report. */
window.LubaNoteTagColorVD = {
  shrnuti: shrnutiVdBarevStitku
};

async function loadTagsFromSupabase() {
  zapisVdBarevStitku(
    "LOAD START",
    `online=${navigator.onLine}`
  );

  const user = await getCurrentUser();
  
  if (!user) {
    return false;
  }

  /*
   * Start optimalizace 2:
   * Jeden GET načte aktivní i historicky smazané štítky. Smazané řádky
   * potřebujeme pouze k pravidlu „smazaný výchozí štítek znovu
   * nevytvářej“. Dříve se kvůli tomu dělaly dva GETy za sebou.
   */
  let { data, error } = await supabaseClient
    .from("tags")
    .select("*")
    .order("sort_order", { ascending: true });

  window.LubaNoteStartupDiag?.zapis?.(
    "TAG-VD",
    `LOAD QUERY | rows=${Array.isArray(data) ? data.length : 0} ` +
      `error=${error ? String(error.message || "ANO") : "NE"}`
  );
  
  if (error) {
    console.error("Tag download error:", error.message);
    zapisVdBarevStitku(
      "LOAD FAIL",
      `error=${String(error.message || "neznamy")}`
    );
    return false;
  }

  const vytvorenyVychoziStitky =
    await zajistiVychoziStitkyVSupabase(
      user,
      data || []
    );

  if (vytvorenyVychoziStitky) {
    const opakovaneNacteni = await supabaseClient
      .from("tags")
      .select("*")
      .order("sort_order", { ascending: true });

    if (opakovaneNacteni.error) {
      console.error(
        "Tag download po vytvoření výchozích štítků selhal:",
        opakovaneNacteni.error.message
      );
      return false;
    }

    data = opakovaneNacteni.data || [];
  }

  const aktivniStitky = (data || []).filter(
    (tag) => !tag.deleted_at
  );
  const nacteneStitky = [];
  
  for (const tag of aktivniStitky) {
    /*
     * Veřejný štítek má normální název.
     */
    if (tag.is_secret !== true) {
      nacteneStitky.push(tag);
      continue;
    }
    
    /*
     * Tajný štítek se v zamčeném režimu
     * nesmí dostat do paměti pod skutečným názvem.
     */
    if (
      !tajnyRezimOdemceny ||
      !tag.encrypted_name
    ) {
      nacteneStitky.push({
        ...tag,
        name: ""
      });
      
      continue;
    }
    
    /*
     * Secret je odemčený:
     * název dešifrujeme pouze do paměti.
     */
    try {
      const desifrovanyNazev =
        await desifrujNazevTajnehoStitku(
          tag.encrypted_name,
          tag.id
        );
      
      nacteneStitky.push({
        ...tag,
        name: desifrovanyNazev
      });
    } catch (error) {
      console.error(
        "Dešifrování tajného štítku selhalo:",
        error
      );
      
      nacteneStitky.push({
        ...tag,
        name: ""
      });
    }
  }
  
  syncedTags = nacteneStitky;
  zapisVdBarevStitku("LOAD APPLIED");

  /*
   * Cache ukládáme až po úspěšném serverovém načtení. Funkce ji před
   * zápisem znovu sanitizuje, takže plaintext Secret názvu neunikne.
   */
  ulozStitkyDoStartCache(user.id, syncedTags);

renderTagFilters();

/*
 * Barvy karet závisejí na barvách štítků.
 * Pokud se štítky načetly až po prvním
 * vykreslení karet, musíme karty překreslit.
 */
if (
  typeof renderTasks === "function"
) {
  renderTasks();
}

zapisVdBarevStitku("LOAD RENDERED");
return true;
}

// ==========================================
// ŠTÍTKY NA HLAVNÍ PLOŠE – DRAG & MOVE POŘADÍ
// ==========================================

/*
 * Jeden způsob řazení štítků:
 * long-press přímo na štítku v horní liště, stejně jako u karet.
 * Správa štítků slouží jen pro barvu / přejmenování / smazání.
 */
let presunHornihoStitku = null;
let presunHornihoStitkuAutoScroll = 0;
let poradiStitkuSeUklada = false;
let blokovatKlikHornihoStitkuDo = 0;

const CAS_LONG_PRESS_STITKU = 430;
const POHYB_PRED_LONG_PRESS_STITKU = 16;
const POHYB_PO_PREHOZENI_STITKU = 10;
const OKRAJ_AUTO_SCROLL_STITKU = 72;
const MAX_AUTO_SCROLL_STITKU = 16;
const ODSAZENI_GHOSTU_NAD_PRSTEM = 18;

/*
 * Legacy štítky mohou existovat jen v poznámkách a nemít ještě vlastní
 * řádek v tabulce tags. Bez id/sort_order je nelze trvale přesouvat.
 * Při prvním stisku takový běžný štítek jednorázově doplníme do Supabase.
 * Mapa brání dvojitému INSERTu při souběhu touch/pointer událostí.
 */
const zajisteniLegacyStitkuProDrag = new Map();

function normalizujNazevStitkuProDrag(nazev) {
  return String(nazev || "")
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("cs-CZ");
}

function najdiZaznamHornihoStitku(button) {
  if (!button) {
    return null;
  }

  const id = String(button.dataset.tagId || "").trim();

  if (id) {
    const podleId = syncedTags.find(
      (tag) => String(tag?.id || "") === id
    );

    if (podleId) {
      return podleId;
    }
  }

  const hledanyNazev = normalizujNazevStitkuProDrag(
    button.dataset.tagFilter || button.textContent
  );

  if (!hledanyNazev) {
    return null;
  }

  const podleNazvu = syncedTags.find((tag) =>
    normalizujNazevStitkuProDrag(tag?.name) === hledanyNazev
  ) || null;

  if (podleNazvu?.id) {
    button.dataset.tagId = String(podleNazvu.id);
  }

  return podleNazvu;
}

async function zajistiZaznamHornihoStitkuProDrag(button) {
  const existujici = najdiZaznamHornihoStitku(button);

  if (existujici?.id) {
    return existujici;
  }

  const nazev = String(
    button?.dataset?.tagFilter || button?.textContent || ""
  ).trim();
  const klic = normalizujNazevStitkuProDrag(nazev);

  if (!nazev || !klic) {
    return null;
  }

  if (zajisteniLegacyStitkuProDrag.has(klic)) {
    return zajisteniLegacyStitkuProDrag.get(klic);
  }

  const promise = (async () => {
    const user = await getCurrentUser();

    if (!user?.id) {
      return null;
    }

    /*
     * Nejprve zkusíme přesný řádek dohledat v cloudu. Mohl vzniknout
     * na jiném zařízení a lokální syncedTags ho ještě nemusí znát.
     */
    const nalezeny = await supabaseClient
      .from("tags")
      .select("id, user_id, name, encrypted_name, is_secret, sort_order, color, deleted_at")
      .eq("user_id", user.id)
      .eq("name", nazev)
      .is("deleted_at", null)
      .maybeSingle();

    let zaznam = nalezeny?.data || null;

    if (!zaznam && !nalezeny?.error) {
      const dalsiPoradi = syncedTags.reduce(
        (maximum, tag) => {
          const poradi = Number(tag?.sort_order);
          return Number.isFinite(poradi)
            ? Math.max(maximum, poradi + 1)
            : maximum;
        },
        syncedTags.length
      );

      const vlozeny = await supabaseClient
        .from("tags")
        .insert({
          user_id: user.id,
          name: nazev,
          is_secret: false,
          sort_order: dalsiPoradi
        })
        .select("id, user_id, name, encrypted_name, is_secret, sort_order, color, deleted_at")
        .single();

      if (vlozeny?.error) {
        console.error(
          "Doplnění legacy štítku pro přesun selhalo:",
          vlozeny.error.message
        );
        return null;
      }

      zaznam = vlozeny?.data || null;
    }

    if (!zaznam?.id) {
      if (nalezeny?.error) {
        console.error(
          "Dohledání legacy štítku pro přesun selhalo:",
          nalezeny.error.message
        );
      }
      return null;
    }

    const uzJeLokalne = syncedTags.some(
      (tag) => String(tag?.id || "") === String(zaznam.id)
    );

    if (!uzJeLokalne) {
      syncedTags.push(zaznam);
      syncedTags.sort((a, b) =>
        Number(a?.sort_order || 0) - Number(b?.sort_order || 0)
      );
    }

    if (button?.isConnected) {
      button.dataset.tagId = String(zaznam.id);
    }

    return zaznam;
  })().finally(() => {
    zajisteniLegacyStitkuProDrag.delete(klic);
  });

  zajisteniLegacyStitkuProDrag.set(klic, promise);
  return promise;
}

function pripravIdVsemHornimStitkum() {
  if (!tagFilterButtons) {
    return;
  }

  tagFilterButtons
    .querySelectorAll(".categoryTab[data-tag-filter]")
    .forEach((button) => {
      najdiZaznamHornihoStitku(button);
    });
}

function sestavNovePoradiStitku(poradiViditelnychId) {
  const mapaStitku = new Map(
    syncedTags.map((tag) => [String(tag.id), tag])
  );

  const viditelnaId = new Set(
    poradiViditelnychId.map(String)
  );

  let indexViditelneho = 0;

  return syncedTags.map((tag) => {
    if (!viditelnaId.has(String(tag.id))) {
      return tag;
    }

    const dalsiId = String(
      poradiViditelnychId[indexViditelneho++] || ""
    );

    return mapaStitku.get(dalsiId) || tag;
  });
}

async function ulozPoradiStitku(poradiViditelnychId) {
  if (
    poradiStitkuSeUklada ||
    !Array.isArray(poradiViditelnychId) ||
    poradiViditelnychId.length < 2
  ) {
    return true;
  }

  const puvodniStitky = syncedTags.slice();
  const serazeneStitky = sestavNovePoradiStitku(
    poradiViditelnychId
  );

  const zmeny = serazeneStitky
    .map((tag, index) => ({
      tag,
      novePoradi: index,
      puvodniPoradi: Number(
        puvodniStitky.find(
          (puvodni) => puvodni.id === tag.id
        )?.sort_order
      )
    }))
    .filter(({ novePoradi, puvodniPoradi }) =>
      !Number.isFinite(puvodniPoradi) ||
      novePoradi !== puvodniPoradi
    );

  if (zmeny.length === 0) {
    return true;
  }

  const user = await getCurrentUser();

  if (!user?.id) {
    renderTagFilters();
    return false;
  }

  poradiStitkuSeUklada = true;

  const ukonciCekani =
    window.LubaNoteUI?.zacniCekaniAkce?.(
      "Ukládám pořadí štítků…",
      350
    ) || (() => {});

  try {
    const vysledky = await Promise.all(
      zmeny.map(async (zmena) => {
        const { error } = await supabaseClient
          .from("tags")
          .update({
            sort_order: zmena.novePoradi
          })
          .eq("id", zmena.tag.id)
          .eq("user_id", user.id);

        return {
          ...zmena,
          error
        };
      })
    );

    const neuspesne = vysledky.filter(
      (vysledek) => Boolean(vysledek.error)
    );

    if (neuspesne.length > 0) {
      await Promise.allSettled(
        vysledky
          .filter((vysledek) => !vysledek.error)
          .map((vysledek) =>
            supabaseClient
              .from("tags")
              .update({
                sort_order: Number.isFinite(
                  vysledek.puvodniPoradi
                )
                  ? vysledek.puvodniPoradi
                  : 0
              })
              .eq("id", vysledek.tag.id)
              .eq("user_id", user.id)
          )
      );

      console.error(
        "Uložení pořadí štítků se nepodařilo:",
        neuspesne.map((vysledek) =>
          vysledek.error?.message || "Neznámá chyba"
        )
      );

      syncedTags = puvodniStitky;
      renderTagFilters();

      zobrazZpravuAplikace(
        "Štítky",
        "Pořadí štítků se nepodařilo uložit."
      );

      return false;
    }

    syncedTags = serazeneStitky.map(
      (tag, index) => ({
        ...tag,
        sort_order: index
      })
    );

    if (typeof ulozStitkyDoStartCache === "function") {
      ulozStitkyDoStartCache(user.id, syncedTags);
    }

    renderTagFilters();
    return true;
  } finally {
    ukonciCekani();
    poradiStitkuSeUklada = false;
  }
}

function ziskejHorniScrollStitku() {
  return tagFilterButtons?.closest(".categoryTabs") || null;
}

function ziskejPoradiHornichStitku() {
  pripravIdVsemHornimStitkum();

  return Array.from(
    tagFilterButtons.querySelectorAll(
      ".categoryTab[data-tag-filter]"
    )
  )
    .map((button) => {
      const zaznam = najdiZaznamHornihoStitku(button);
      return zaznam?.id ? String(zaznam.id) : "";
    })
    .filter(Boolean);
}

function zastavAutoScrollHornichStitku() {
  if (presunHornihoStitkuAutoScroll) {
    cancelAnimationFrame(presunHornihoStitkuAutoScroll);
    presunHornihoStitkuAutoScroll = 0;
  }
}

function prehodHorniStitekPodleX(button, clientX) {
  if (!button || !tagFilterButtons || !presunHornihoStitku) {
    return;
  }

  const stav = presunHornihoStitku;

  /*
   * Stejná pojistka jako u card-drag loop guardu: po změně slotu
   * musí prst skutečně pokračovat, aby nový layout okamžitě
   * nepřehodil štítek zpět pod nehybným prstem.
   */
  if (
    Number.isFinite(stav.lockX) &&
    Math.abs(clientX - stav.lockX) < POHYB_PO_PREHOZENI_STITKU
  ) {
    return;
  }

  const ostatni = Array.from(
    tagFilterButtons.querySelectorAll(
      ".categoryTab[data-tag-filter]"
    )
  ).filter((jiny) => jiny !== button);

  const predKtery = ostatni.find((jiny) => {
    const rect = jiny.getBoundingClientRect();
    return clientX < rect.left + rect.width / 2;
  });

  const puvodniPred = button.nextElementSibling;

  if (predKtery) {
    tagFilterButtons.insertBefore(button, predKtery);
  } else {
    const novy = tagFilterButtons.querySelector(
      ".newTagFilterButton"
    );
    tagFilterButtons.insertBefore(button, novy || null);
  }

  if (button.nextElementSibling !== puvodniPred) {
    stav.zmeneno = true;
    stav.lockX = clientX;
  }
}

function spustAutoScrollHornichStitku() {
  if (presunHornihoStitkuAutoScroll) {
    return;
  }

  const krok = () => {
    presunHornihoStitkuAutoScroll = 0;

    const stav = presunHornihoStitku;
    const scroll = ziskejHorniScrollStitku();

    if (!stav || !scroll) {
      return;
    }

    const rect = scroll.getBoundingClientRect();
    const x = stav.posledniX;
    let rychlost = 0;

    if (x < rect.left + OKRAJ_AUTO_SCROLL_STITKU) {
      const pomer = Math.min(
        1,
        (rect.left + OKRAJ_AUTO_SCROLL_STITKU - x) /
          OKRAJ_AUTO_SCROLL_STITKU
      );
      rychlost = -Math.max(
        3,
        Math.round(MAX_AUTO_SCROLL_STITKU * pomer)
      );
    } else if (x > rect.right - OKRAJ_AUTO_SCROLL_STITKU) {
      const pomer = Math.min(
        1,
        (x - (rect.right - OKRAJ_AUTO_SCROLL_STITKU)) /
          OKRAJ_AUTO_SCROLL_STITKU
      );
      rychlost = Math.max(
        3,
        Math.round(MAX_AUTO_SCROLL_STITKU * pomer)
      );
    }

    if (rychlost !== 0) {
      scroll.scrollLeft += rychlost;
      prehodHorniStitekPodleX(stav.button, x);
      presunHornihoStitkuAutoScroll = requestAnimationFrame(krok);
    }
  };

  presunHornihoStitkuAutoScroll = requestAnimationFrame(krok);
}

function pohniGhostemHornihoStitku(clientX, clientY) {
  const stav = presunHornihoStitku;

  if (!stav) {
    return;
  }

  stav.posledniX = clientX;
  stav.posledniY = clientY;

  if (stav.ghost) {
    const sirkaGhostu = Number(stav.ghostWidth) || stav.ghost.offsetWidth || 0;
    const vyskaGhostu = Number(stav.ghostHeight) || stav.ghost.offsetHeight || 0;

    /*
     * Drag preview držíme NAD prstem, ne přímo pod ním.
     * Uživatel tak po celou dobu vidí název/barvu štítku i cílové místo.
     * Horizontálně je ghost vystředěný na prst, svisle končí kousek nad ním.
     */
    stav.ghost.style.left = `${Math.round(clientX - sirkaGhostu / 2)}px`;
    stav.ghost.style.top = `${Math.round(
      clientY - vyskaGhostu - ODSAZENI_GHOSTU_NAD_PRSTEM
    )}px`;
  }

  prehodHorniStitekPodleX(stav.button, clientX);
  zastavAutoScrollHornichStitku();
  spustAutoScrollHornichStitku();
}

function zahajPresunHornihoStitku(
  button,
  clientX,
  clientY,
  vstup,
  id
) {
  if (
    presunHornihoStitku ||
    poradiStitkuSeUklada ||
    !button?.isConnected
  ) {
    return false;
  }

  const zaznamStitku = najdiZaznamHornihoStitku(button);

  if (!zaznamStitku?.id) {
    return false;
  }

  button.dataset.tagId = String(zaznamStitku.id);

  const rect = button.getBoundingClientRect();
  const ghost = button.cloneNode(true);

  ghost.classList.remove("active");
  ghost.classList.add("lubaTagDragGhost");
  ghost.style.width = `${Math.round(rect.width)}px`;
  ghost.style.height = `${Math.round(rect.height)}px`;
  ghost.style.left = `${Math.round(clientX - rect.width / 2)}px`;
  ghost.style.top = `${Math.round(
    clientY - rect.height - ODSAZENI_GHOSTU_NAD_PRSTEM
  )}px`;

  document.body.append(ghost);
  button.classList.add("lubaTagDragSource");
  document.body.classList.add("lubaTagDragMode");

  presunHornihoStitku = {
    button,
    ghost,
    vstup,
    id,
    ghostWidth: rect.width,
    ghostHeight: rect.height,
    posledniX: clientX,
    posledniY: clientY,
    lockX: null,
    zmeneno: false,
    puvodniPoradi: ziskejPoradiHornichStitku()
  };

  try {
    navigator.vibrate?.(18);
  } catch (_) {
    // Haptika není podmínkou funkce.
  }

  return true;
}

async function dokoncitPresunHornihoStitku({ zrusit = false } = {}) {
  const stav = presunHornihoStitku;

  if (!stav) {
    return;
  }

  zastavAutoScrollHornichStitku();
  presunHornihoStitku = null;
  document.body.classList.remove("lubaTagDragMode");

  stav.button?.classList.remove("lubaTagDragSource");
  stav.ghost?.remove();

  /* Long-press/drop nesmí po puštění aktivovat filtr. */
  blokovatKlikHornihoStitkuDo = Date.now() + 650;

  if (zrusit) {
    renderTagFilters();
    return;
  }

  const novePoradi = ziskejPoradiHornichStitku();

  if (
    !stav.zmeneno ||
    novePoradi.join("|") === stav.puvodniPoradi.join("|")
  ) {
    return;
  }

  await ulozPoradiStitku(novePoradi);
}

function nastavDragHornihoStitku(button) {
  if (!button || button.dataset.tagDragReady === "true") {
    return;
  }

  button.dataset.tagDragReady = "true";

  let pointerId = null;
  let pointerStartX = 0;
  let pointerStartY = 0;
  let pointerX = 0;
  let pointerY = 0;
  let pointerTimer = 0;

  let touchId = null;
  let touchStartX = 0;
  let touchStartY = 0;
  let touchX = 0;
  let touchY = 0;
  let touchTimer = 0;
  let touchListenery = false;
  let touchAktivovan = false;

  const zrusPointerTimer = () => {
    if (pointerTimer) {
      clearTimeout(pointerTimer);
      pointerTimer = 0;
    }
  };

  const najdiTouch = (seznam) =>
    Array.from(seznam || []).find(
      (dotyk) => dotyk.identifier === touchId
    ) || null;

  const odeberTouchListenery = () => {
    if (!touchListenery) {
      return;
    }

    document.removeEventListener(
      "touchmove",
      zpracujTouchMove,
      true
    );
    document.removeEventListener(
      "touchend",
      zpracujTouchEnd,
      true
    );
    document.removeEventListener(
      "touchcancel",
      zpracujTouchCancel,
      true
    );
    touchListenery = false;
  };

  const vycistiTouch = () => {
    if (touchTimer) {
      clearTimeout(touchTimer);
      touchTimer = 0;
    }
    touchId = null;
    touchAktivovan = false;
    odeberTouchListenery();
  };

  function zpracujTouchMove(event) {
    if (touchId === null) {
      return;
    }

    const dotyk = najdiTouch(event.touches);
    if (!dotyk) {
      return;
    }

    touchX = dotyk.clientX;
    touchY = dotyk.clientY;

    const vzdalenost = Math.hypot(
      touchX - touchStartX,
      touchY - touchStartY
    );

    const aktivni =
      presunHornihoStitku?.button === button &&
      presunHornihoStitku?.vstup === "touch" &&
      presunHornihoStitku?.id === touchId;

    if (!touchAktivovan && !aktivni) {
      if (vzdalenost > POHYB_PRED_LONG_PRESS_STITKU) {
        vycistiTouch();
      }
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (aktivni) {
      pohniGhostemHornihoStitku(touchX, touchY);
    }
  }

  function zpracujTouchEnd(event) {
    if (touchId === null) {
      return;
    }

    const dotyk = najdiTouch(event.changedTouches);
    if (!dotyk) {
      return;
    }

    const aktivni =
      presunHornihoStitku?.button === button &&
      presunHornihoStitku?.vstup === "touch" &&
      presunHornihoStitku?.id === touchId;

    if (aktivni || touchAktivovan) {
      event.preventDefault();
      event.stopPropagation();
    }

    if (aktivni) {
      void dokoncitPresunHornihoStitku();
    }

    vycistiTouch();
  }

  function zpracujTouchCancel() {
    const aktivni =
      presunHornihoStitku?.button === button &&
      presunHornihoStitku?.vstup === "touch" &&
      presunHornihoStitku?.id === touchId;

    if (aktivni) {
      void dokoncitPresunHornihoStitku({ zrusit: true });
    }

    vycistiTouch();
  }

  button.addEventListener(
    "touchstart",
    (event) => {
      if (
        event.touches.length !== 1 ||
        presunHornihoStitku ||
        poradiStitkuSeUklada
      ) {
        return;
      }

      const dotyk = event.touches[0];
      touchId = dotyk.identifier;
      touchStartX = dotyk.clientX;
      touchStartY = dotyk.clientY;
      touchX = touchStartX;
      touchY = touchStartY;
      touchAktivovan = false;

      const pripravZaznam =
        zajistiZaznamHornihoStitkuProDrag(button);

      if (!touchListenery) {
        document.addEventListener(
          "touchmove",
          zpracujTouchMove,
          { passive: false, capture: true }
        );
        document.addEventListener(
          "touchend",
          zpracujTouchEnd,
          { passive: false, capture: true }
        );
        document.addEventListener(
          "touchcancel",
          zpracujTouchCancel,
          { passive: false, capture: true }
        );
        touchListenery = true;
      }

      touchTimer = setTimeout(async () => {
        const puvodniTouchId = touchId;

        if (puvodniTouchId === null) {
          return;
        }

        const zaznam = await pripravZaznam;

        if (
          touchId !== puvodniTouchId ||
          !zaznam?.id
        ) {
          return;
        }

        touchAktivovan = zahajPresunHornihoStitku(
          button,
          touchX,
          touchY,
          "touch",
          touchId
        );
      }, CAS_LONG_PRESS_STITKU);
    },
    { passive: true }
  );

  button.addEventListener("pointerdown", (event) => {
    if (
      event.pointerType === "touch" ||
      event.button !== 0 ||
      presunHornihoStitku ||
      poradiStitkuSeUklada
    ) {
      return;
    }

    pointerId = event.pointerId;
    pointerStartX = event.clientX;
    pointerStartY = event.clientY;
    pointerX = pointerStartX;
    pointerY = pointerStartY;

    const pripravZaznam =
      zajistiZaznamHornihoStitkuProDrag(button);

    pointerTimer = setTimeout(async () => {
      const puvodniPointerId = pointerId;

      if (puvodniPointerId === null) {
        return;
      }

      const zaznam = await pripravZaznam;

      if (
        pointerId !== puvodniPointerId ||
        !zaznam?.id
      ) {
        return;
      }

      const aktivovano = zahajPresunHornihoStitku(
        button,
        pointerX,
        pointerY,
        event.pointerType || "pointer",
        pointerId
      );

      if (aktivovano) {
        try {
          button.setPointerCapture(pointerId);
        } catch (_) {
          // Pointer capture není podmínkou funkce.
        }
      }
    }, CAS_LONG_PRESS_STITKU);
  });

  button.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch" || event.pointerId !== pointerId) {
      return;
    }

    pointerX = event.clientX;
    pointerY = event.clientY;

    const aktivni =
      presunHornihoStitku?.button === button &&
      presunHornihoStitku?.id === pointerId;

    if (aktivni) {
      event.preventDefault();
      pohniGhostemHornihoStitku(pointerX, pointerY);
      return;
    }

    if (
      Math.hypot(
        pointerX - pointerStartX,
        pointerY - pointerStartY
      ) > POHYB_PRED_LONG_PRESS_STITKU
    ) {
      zrusPointerTimer();
    }
  });

  button.addEventListener("pointerup", (event) => {
    if (event.pointerType === "touch" || event.pointerId !== pointerId) {
      return;
    }

    zrusPointerTimer();

    const aktivni =
      presunHornihoStitku?.button === button &&
      presunHornihoStitku?.id === pointerId;

    if (aktivni) {
      event.preventDefault();
      void dokoncitPresunHornihoStitku();
    }

    pointerId = null;
  });

  button.addEventListener("pointercancel", (event) => {
    if (event.pointerType === "touch" || event.pointerId !== pointerId) {
      return;
    }

    zrusPointerTimer();

    const aktivni =
      presunHornihoStitku?.button === button &&
      presunHornihoStitku?.id === pointerId;

    if (aktivni) {
      void dokoncitPresunHornihoStitku({ zrusit: true });
    }

    pointerId = null;
  });

  button.addEventListener("contextmenu", (event) => {
    if (presunHornihoStitku?.button === button) {
      event.preventDefault();
    }
  });
}

// ==========================================
// SPRÁVA ŠTÍTKŮ – VYKRESLENÍ SEZNAMU
// ==========================================

function vykresliSpravuStitku() {
  manageTagsList.innerHTML = "";
  
  const viditelneStitky = syncedTags.filter(
    (tag) =>
    tajnyRezimOdemceny ||
    tag.is_secret !== true
  );
  
  viditelneStitky.forEach((tag) => {
    const radek = document.createElement("div");
    
    radek.className = "manageTagRow";
    radek.dataset.tagId = String(tag.id || "");

    if (tag.is_secret === true) {
      radek.classList.add("secretManageTagRow");
    }
    
    const nazev = document.createElement("span");
    nazev.className = "manageTagName";
    nazev.textContent = tag.name;
    
    const akce = document.createElement("div");
    akce.className = "manageTagActions";
    
    const barvaTlacitko = document.createElement("button");
    barvaTlacitko.type = "button";
    barvaTlacitko.className = "manageTagColorButton";
    barvaTlacitko.dataset.tagColor =
      tag.color || "system";
    
    barvaTlacitko.setAttribute(
      "aria-label",
      `Barva štítku ${tag.name}`
    );
    barvaTlacitko.addEventListener("click", () => {
      const staraPaleta =
        radek.querySelector(".manageTagColorPalette");
      
      document
        .querySelectorAll(".manageTagColorPalette")
        .forEach((paleta) => {
          if (!radek.contains(paleta)) {
            paleta.remove();
          }
        });
      
      if (staraPaleta) {
        staraPaleta.remove();
        return;
      }
      
      const paleta = document.createElement("div");
      paleta.className = "manageTagColorPalette";
      
      [
        "cervena",
        "oranzova",
        "zluta",
        "zelena",
        "tyrkysova",
        "modra",
        "fialova",
        "ruzova"
      ].forEach((barva) => {
        const volba = document.createElement("button");
        
        volba.type = "button";
        volba.className = "manageTagColorOption";
        volba.dataset.tagColor = barva;
        
        volba.setAttribute(
          "aria-label",
          `Nastavit barvu štítku na ${barva}`
        );
        
        volba.addEventListener("click", async () => {
          volba.disabled = true;
          
          const uspesne = await zmenBarvuStitku(
            tag,
            barva
          );
          
          if (uspesne) {
            vykresliSpravuStitku();
          } else {
            volba.disabled = false;
          }
        });
        
        paleta.append(volba);
      });
      
      radek.append(paleta);
    });
    
    const upravitTlacitko = document.createElement("button");
    upravitTlacitko.type = "button";
    if (window.LubaNoteIcons?.nastavJenIkonu) {
      window.LubaNoteIcons.nastavJenIkonu(
        upravitTlacitko,
        "upravit",
        ["manageTagActionIcon"]
      );
    }
    upravitTlacitko.setAttribute(
      "aria-label",
      
      `Přejmenovat štítek ${tag.name}`
    );
    let vstup = null;
    
    upravitTlacitko.addEventListener("click", async () => {
      if (!vstup) {
        vstup = document.createElement("textarea");
        vstup.rows = 1;
        vstup.value = tag.name;
        vstup.maxLength = 24;
        vstup.className = "manageTagRenameInput";
        vstup.autocomplete = "one-time-code";
        vstup.setAttribute("data-form-type", "other");
        vstup.setAttribute("data-lpignore", "true");
        vstup.setAttribute("data-1p-ignore", "true");
        vstup.setAttribute("data-bwignore", "true");

        vstup.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            upravitTlacitko.click();
          }
        });
        
        nazev.replaceWith(vstup);
        
        if (window.LubaNoteIcons?.nastavJenIkonu) {
          window.LubaNoteIcons.nastavJenIkonu(
            upravitTlacitko,
            "hotovo",
            ["manageTagActionIcon"]
          );
        }
        
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
    if (window.LubaNoteIcons?.nastavJenIkonu) {
      window.LubaNoteIcons.nastavJenIkonu(
        smazatTlacitko,
        "smazat",
        ["manageTagActionIcon"]
      );
    }
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
      barvaTlacitko,
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

async function zmenBarvuStitku(tag, novaBarva) {
  const user = await getCurrentUser();
  
  if (!user) {
    return false;
  }
  
  const { error } = await supabaseClient
    .from("tags")
    .update({
      color: novaBarva
    })
    .eq("id", tag.id)
    .eq("user_id", user.id);
  
  if (error) {
    console.error(
      "Změna barvy štítku se nepodařila:",
      error.message
    );
    
    return false;
  }
  
  syncedTags = syncedTags.map(
    (aktualniTag) =>
    aktualniTag.id === tag.id ?
    {
      ...aktualniTag,
      color: novaBarva
    } :
    aktualniTag
  );
  
  return true;
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
  
  let dataProUlozeni;

if (tag.is_secret === true) {
  if (
    !tajnyRezimOdemceny ||
    !tajnySifrovaciKlic
  ) {
    zobrazZpravuAplikace(
      "Tajné štítky",
      "Nejdřív odemkni tajný režim."
    );
    
    return false;
  }
  
  const zasifrovanyNazev =
    await zasifrujNazevTajnehoStitku(
      novyNazev,
      tag.id
    );
  
  dataProUlozeni = {
    encrypted_name: zasifrovanyNazev
  };
} else {
  dataProUlozeni = {
    name: novyNazev
  };
}

const { error } = await supabaseClient
  .from("tags")
  .update(dataProUlozeni)
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
        tag.name.toLowerCase() ?
        novyNazev :
        nazev
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
    aktualniTag.id === tag.id ?
    {
      ...aktualniTag,
      name: novyNazev
    } :
    aktualniTag
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
  
  /*
   * Pořadí horních štítků musí vycházet z uloženého pořadí
   * syncedTags (sort_order), ne z pořadí karet. Drag karty mění
   * pořadí loadTask(), takže pokud byly noteTags první, štítky
   * při každém přesunu karty vizuálně přeskakovaly.
   *
   * Cloud/synced pořadí je autorita. Případné staré/legacy štítky,
   * které ještě v syncedTags nejsou, pouze doplníme nakonec.
   */
  return [
    ...new Set([
      ...cloudTags,
      ...visibleNoteTags
    ])
  ];
}

function ziskejBarvuStitku(nazevStitku) {
  const stitek = syncedTags.find(
    (tag) =>
    tag.name.trim().toLowerCase() ===
    nazevStitku.trim().toLowerCase()
  );
  
  return stitek?.color || "system";
}

function vycistiTajneStitkyPoZamknuti() {
  /* Tajný filtr nesmí po zamknutí zůstat aktivní. */
  if (
    activeTagFilter !== null &&
    jeTajnyStitek(activeTagFilter)
  ) {
    activeTagFilter = null;
  }
  
  /* Tajné štítky odstraníme i z právě rozpracovaného výběru. */
  activeTags = activeTags.filter(
    (nazevStitku) =>
    !jeTajnyStitek(nazevStitku)
  );
  
  /* Zavřít nabídku štítků v editoru. */
  if (typeof closeTagMenu === "function") {
    closeTagMenu();
  }
  
  /* Odstranit už vykreslené názvy štítků z DOM. */
  tagOptions
    ?.querySelectorAll("[data-tag]")
    .forEach((tlacitko) => {
      tlacitko.remove();
    });
  
  /* Zrušit případné mazání štítku. */
  if (deleteTagConfirmModal) {
    deleteTagConfirmModal.hidden = true;
  }
  
  if (deleteTagConfirmText) {
    deleteTagConfirmText.textContent = "";
  }
  
  tagKeSmazani = null;
  
  /* Správu štítků znovu vykreslit už v zamčeném režimu. */
  if (
    manageTagsModal &&
    !manageTagsModal.hidden
  ) {
    vykresliSpravuStitku();
  } else if (manageTagsList) {
    manageTagsList.innerHTML = "";
  }
  /*
   * Po zamknutí odstraníme dešifrované názvy
   * tajných štítků také z paměti aplikace.
   */
  syncedTags = syncedTags.map((tag) =>
    tag.is_secret === true ?
    {
      ...tag,
      name: ""
    } :
    tag
  );
  /* Horní filtry znovu vykreslit bez Secret štítků. */
  renderTagFilters();
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

/*
 * Secret štítky pro editor načítáme přímo z cloudu až ve chvíli,
 * kdy je Secret odemčený a právě editovaná poznámka je tajná.
 * Nejsme tak závislí na tom, v jakém stavu zrovna zůstalo syncedTags
 * po zamknutí / odemknutí.
 */
async function ziskejTajneStitkyProEditor() {
  if (
    !tajnyRezimOdemceny ||
    !secretTaskEnabled
  ) {
    return [];
  }

  const user = await getCurrentUser();

  if (!user?.id || !supabaseClient) {
    return [];
  }

  const { data, error } = await supabaseClient
    .from("tags")
    .select(
      "id, user_id, name, encrypted_name, is_secret, sort_order, color, deleted_at"
    )
    .eq("user_id", user.id)
    .eq("is_secret", true)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error(
      "Načtení tajných štítků pro editor selhalo:",
      error.message
    );
    return [];
  }

  const nazvy = [];

  for (const tag of (data || [])) {
    /*
     * Legacy tajný štítek bez encrypted_name záměrně neukazujeme.
     * Otevřený plaintext název se nesmí vrátit do Secret UI.
     */
    if (!tag.encrypted_name) {
      continue;
    }

    try {
      const desifrovanyNazev =
        await desifrujNazevTajnehoStitku(
          tag.encrypted_name,
          tag.id
        );

      const cistyNazev = String(
        desifrovanyNazev || ""
      ).trim();

      if (!cistyNazev) {
        continue;
      }

      const pametovyTag = {
        ...tag,
        name: cistyNazev
      };

      const index = syncedTags.findIndex(
        (polozka) => polozka.id === tag.id
      );

      if (index >= 0) {
        syncedTags[index] = pametovyTag;
      } else {
        syncedTags.push(pametovyTag);
      }

      nazvy.push(cistyNazev);
    } catch (error) {
      console.error(
        "Dešifrování tajného štítku pro editor selhalo:",
        tag.id,
        error
      );
    }
  }

  return nazvy;
}

async function renderTagMenuTags() {
  /*
   * Editor používá stejný seznam štítků
   * jako zbytek aplikace.
   *
   * Secret štítek se zobrazí pouze:
   * - při odemčeném Secret režimu
   * - v Secret poznámce
   */
  const availableTags =
    getAvailableTags().filter((tag) => {
      const cistyNazev =
        String(tag || "").trim();
      
      if (!cistyNazev) {
        return false;
      }
      
      const stitek = syncedTags.find(
        (polozka) =>
        String(polozka.name || "")
        .trim()
        .toLowerCase() ===
        cistyNazev.toLowerCase()
      );
      
      const jeTajny =
        stitek?.is_secret === true;
      
      if (jeTajny) {
        return tajnyRezimOdemceny;
      }
      
      return true;
    });

  /*
   * Editor má jen tři řádky štítků, proto musí být nejdůležitější
   * ovládání vždy na začátku:
   * 1. + Nový štítek
   * 2. štítek právě vytvořený v editoru
   * 3. ostatní štítky v dosavadním pořadí
   *
   * Dřívější pokus určoval „nejnovější“ podle sort_order. To není
   * spolehlivé, protože starší štítky mohou mít vyšší sort_order.
   * Teď si pamatujeme přímo konkrétní štítek vytvořený v editoru.
   */
  const preferovanyNazev = String(
    posledniStitekVytvorenyVEditoru || ""
  ).trim();

  const preferovanyJeDostupny =
    Boolean(preferovanyNazev) &&
    availableTags.some((tag) =>
      String(tag || "")
        .trim()
        .toLocaleLowerCase("cs-CZ") ===
      preferovanyNazev.toLocaleLowerCase("cs-CZ")
    );

  const serazeneStitky = preferovanyJeDostupny ? [
    preferovanyNazev,
    ...availableTags.filter((tag) =>
      String(tag || "")
        .trim()
        .toLocaleLowerCase("cs-CZ") !==
      preferovanyNazev.toLocaleLowerCase("cs-CZ")
    )
  ] : availableTags;
  
  tagOptions
    .querySelectorAll("[data-tag]")
    .forEach((button) => {
      button.remove();
    });

  /* + Nový štítek musí být vždy úplně první. */
  tagOptions.prepend(createTagButton);

  let posledniTlacitko = createTagButton;
  
  serazeneStitky.forEach((tag) => {
    const button =
      document.createElement("button");
    
    button.type = "button";
    button.dataset.tag = tag;
    
    button.dataset.tagColor =
      ziskejBarvuStitku(tag);
    
    button.textContent = tag;
    
    button.classList.toggle(
      "active",
      activeTags.includes(tag)
    );
    
    if (jeTajnyStitek(tag)) {
      button.classList.add(
        "secretTagOption"
      );
    }

    posledniTlacitko.insertAdjacentElement(
      "afterend",
      button
    );

    posledniTlacitko = button;
  });

  requestAnimationFrame(
    aktualizujSipkuRolovaniStitku
  );
}
async function updateTagMenuUI() {
  areaButtons.forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.area === activeArea
    );
  });

  if (window.LubaNoteIcons?.nastavJenIkonu) {
    window.LubaNoteIcons.nastavJenIkonu(
      categoryTaskButton,
      activeArea === "work" ? "prace" : "soukrome",
      ["editorBottomSvgIcon"]
    );
  }

  await renderTagMenuTags();
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

  /*
   * Pokud má toto Android zařízení biometrické odemykání už
   * nastavené, nejdřív zkusíme otisk. Heslový modal je až bezpečný
   * fallback při zrušení, chybě nebo nedostupné biometrii.
   */
  if (
    maHeslo &&
    window.LubaNoteSecretBiometric
      ?.zkusAutomatickeOdemknuti
  ) {
    const biometrie =
      await window.LubaNoteSecretBiometric
        .zkusAutomatickeOdemknuti();

    if (biometrie?.odemceno) {
      return;
    }
  }
  
  secretUnlockInput.value = "";
  secretUnlockConfirmInput.value = "";
  
  if (maHeslo) {
    if (window.LubaNoteIcons?.nastavObsahSIkonou) {
      window.LubaNoteIcons.nastavObsahSIkonou(
        secretUnlockTitle,
        "zamek",
        "Odemknout tajný režim"
      );
    } else {
      secretUnlockTitle.textContent =
        "Odemknout tajný režim";
    }
    
    secretUnlockDescription.textContent =
      "Zadej hlavní heslo.";
    
    secretUnlockConfirmInput.hidden = true;
    
    if (window.LubaNoteIcons?.nastavObsahSIkonou) {
      window.LubaNoteIcons.nastavObsahSIkonou(
        confirmSecretUnlockButton,
        "odemceno",
        "Odemknout"
      );
    } else {
      confirmSecretUnlockButton.textContent =
        "Odemknout";
    }
  } else {
    if (window.LubaNoteIcons?.nastavObsahSIkonou) {
      window.LubaNoteIcons.nastavObsahSIkonou(
        secretUnlockTitle,
        "zamek",
        "Vytvořit hlavní heslo"
      );
    } else {
      secretUnlockTitle.textContent =
        "Vytvořit hlavní heslo";
    }
    
    secretUnlockDescription.textContent =
      "Vytvoř hlavní heslo pro tajné poznámky.";
    
    secretUnlockConfirmInput.hidden = false;
    
    if (window.LubaNoteIcons?.nastavObsahSIkonou) {
      window.LubaNoteIcons.nastavObsahSIkonou(
        confirmSecretUnlockButton,
        "zamek",
        "Vytvořit heslo"
      );
    } else {
      confirmSecretUnlockButton.textContent =
        "Vytvořit heslo";
    }
  }
  
  secretUnlockModal.hidden = false;

  const stavBiometrie =
    await window.LubaNoteSecretBiometric
      ?.aktualizujUI?.({ maHeslo });

  /*
   * Po zrušení automatického otisku nevyvoláme hned klávesnici.
   * Uživatel může otisk zopakovat nebo teprve tapnout do hesla.
   */
  if (!stavBiometrie?.configured) {
    secretUnlockInput.focus();
  }
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
    const zaznamStitku = syncedTags.find(
      (polozka) =>
        String(polozka?.name || "")
          .trim()
          .toLocaleLowerCase("cs-CZ") ===
        String(tag || "")
          .trim()
          .toLocaleLowerCase("cs-CZ")
    );
    
    button.classList.add("categoryTab");
    button.textContent = tag;
    button.dataset.tagFilter = tag;
    button.dataset.tagColor =
      ziskejBarvuStitku(tag);

    if (zaznamStitku?.id) {
      button.dataset.tagId = String(zaznamStitku.id);
    }

    /*
     * Drag listener patří na KAŽDÝ horní štítek. ID se při long-pressu
     * znovu dohledá ze syncedTags, takže později vykreslené / cacheované
     * štítky nezůstanou bez přesunu jen proto, že ID nebylo při prvním
     * renderu ještě připojené.
     */
    nastavDragHornihoStitku(button);
    
    if (jeTajnyStitek(tag)) {
      button.classList.add("secretTagFilter");
    }
    
    tagFilterButtons.append(button);
  });
  
  const addTagButton = document.createElement("button");
  
  addTagButton.classList.add(
    "categoryTab",
    "newTagFilterButton"
  );
  addTagButton.textContent =
    window.LubaNoteI18n?.t?.(
      "editor.newTag",
      "+ Nový štítek"
    ) || "+ Nový štítek";
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
    newTagModalTitle.textContent =
      window.LubaNoteI18n?.t?.(
        "tags.new",
        "Nový štítek"
      ) || "Nový štítek";
    newTagModalTitle.classList.remove(
      "lubaHasIcon",
      "lubaIconOnlyContent"
    );
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

async function ulozBeznyStitekZeEditoru(nazev) {
  const novyNazev = normalizeTagName(nazev);

  if (!novyNazev) {
    return null;
  }

  /*
   * Pokud štítek už opravdu existuje v centrálním seznamu,
   * nic znovu nevytváříme. Vrátíme jeho uložený název,
   * aby se zachovalo původní psaní velkých/malých písmen.
   */
  const existujiciStitek = syncedTags.find(
    (tag) =>
      tag.is_secret !== true &&
      String(tag.name || "")
        .trim()
        .toLocaleLowerCase("cs-CZ") ===
      novyNazev.toLocaleLowerCase("cs-CZ")
  );

  if (existujiciStitek) {
    return existujiciStitek.name;
  }

  const user = await getCurrentUser();

  if (!user) {
    zobrazZpravuAplikace(
      "Štítky",
      "Nový štítek se nepodařilo uložit."
    );
    return null;
  }

  const { error } = await supabaseClient
    .from("tags")
    .insert({
      user_id: user.id,
      name: novyNazev,
      is_secret: false,
      sort_order: syncedTags.length
    });

  if (error) {
    console.error(
      "Vytvoření štítku z editoru selhalo:",
      error.message
    );

    zobrazZpravuAplikace(
      "Štítky",
      "Nový štítek se nepodařilo uložit. Zkontroluj připojení a zkus to znovu."
    );
    return null;
  }

  /*
   * Důležité: nový štítek musí být hned součástí syncedTags.
   * Díky tomu se objeví ve Správě štítků, ve filtrech a nezmizí
   * ani po odebrání z právě editované poznámky.
   */
  await loadTagsFromSupabase();

  const ulozenyStitek = syncedTags.find(
    (tag) =>
      tag.is_secret !== true &&
      String(tag.name || "")
        .trim()
        .toLocaleLowerCase("cs-CZ") ===
      novyNazev.toLocaleLowerCase("cs-CZ")
  );

  const ulozenyNazev =
    ulozenyStitek?.name || novyNazev;

  posledniStitekVytvorenyVEditoru =
    ulozenyNazev;

  return ulozenyNazev;
}

async function createNewTag() {
  if (
    activeTags.length >= 2 ||
    saveNewTagButton.disabled
  ) {
    if (activeTags.length >= 2) {
      zobrazZpravuAplikace(
        "Štítky",
        "Poznámka může mít maximálně 2 štítky. Nejdřív jeden odeber."
      );
      closeNewTagEditor();
    }
    return;
  }

  const newTag = normalizeTagName(newTagInput.value);

  if (!newTag) {
    newTagInput.focus();
    return;
  }

  saveNewTagButton.disabled = true;

  const ukonciCekani =
    window.LubaNoteUI?.zacniCekaniAkce?.(
      "Ukládám štítek…",
      300
    ) || (() => {});

  try {
    const tagToUse =
      await ulozBeznyStitekZeEditoru(newTag);

    if (!tagToUse) {
      newTagInput.focus();
      return;
    }

    if (!activeTags.includes(tagToUse)) {
      activeTags.push(tagToUse);
    }

    closeNewTagEditor();
    await updateTagMenuUI();
    narolujStitkyNahoru();
  } finally {
    ukonciCekani();
    saveNewTagButton.disabled = false;
  }
}

categoryTaskButton.addEventListener("click", () => {
  activeArea =
    activeArea === "work" ?
    "private" :
    "work";
  
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

tagTaskButton.addEventListener("click", async () => {
  tagMenu.hidden = !tagMenu.hidden;
  
  if (!tagMenu.hidden) {
    await updateTagMenuUI();

    /*
     * Každé nové otevření štítků začíná nahoře.
     * + Nový štítek a právě vytvořený štítek jsou tak vždy viditelné.
     */
    narolujStitkyNahoru();
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

tagOptions.addEventListener(
  "scroll",
  aktualizujSipkuRolovaniStitku,
  { passive: true }
);

window.addEventListener(
  "resize",
  aktualizujSipkuRolovaniStitku
);

tagScrollButton?.addEventListener("click", () => {
  const maximalniPosun = Math.max(
    0,
    tagOptions.scrollHeight - tagOptions.clientHeight
  );

  if (maximalniPosun <= 3) {
    aktualizujSipkuRolovaniStitku();
    return;
  }

  const smerNahoru =
    tagScrollButton.dataset.smer === "nahoru";

  tagOptions.scrollTo({
    top: smerNahoru ? 0 : maximalniPosun,
    behavior: "smooth"
  });
});


tagOptions.addEventListener("click", (event) => {
  const button = event.target.closest("[data-tag]");
  
  if (!button) {
    return;
  }
  
  const tag = button.dataset.tag;
  
  /*
 * Tajný štítek může patřit pouze tajné poznámce.
 * Pokud ho uživatel zvolí v odemčeném Secret režimu,
 * editor poznámku automaticky přepne na Secret.
 */
if (
  jeTajnyStitek(tag) &&
  !secretTaskEnabled
) {
  secretTaskButton?.click();
}
  
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
    
    if (window.LubaNoteIcons?.nastavObsahSIkonou) {
      window.LubaNoteIcons.nastavObsahSIkonou(
        newTagModalTitle,
        "zamek",
        window.LubaNoteI18n?.t?.(
          "tags.newSecret",
          "Nový tajný štítek"
        ) || "Nový tajný štítek"
      );
    } else {
      newTagModalTitle.textContent =
        window.LubaNoteI18n?.t?.(
          "tags.newSecret",
          "Nový tajný štítek"
        ) || "Nový tajný štítek";
    }
    
    newTagModal.hidden = false;
    newTagModalInput.value = "";
    newTagModalInput.focus();
  }
);



















tagFilterButtons.addEventListener("click", async (event) => {
  if (
    Date.now() < blokovatKlikHornihoStitkuDo ||
    presunHornihoStitku
  ) {
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }
  
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
    activeTagFilter === vybranyStitek ?
    null :
    vybranyStitek;
  
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

  if (
    !tajnyRezimOdemceny ||
    !tajnySifrovaciKlic
  ) {
    zobrazZpravuAplikace(
      "Tajné štítky",
      "Nejdřív odemkni tajný režim."
    );

    return false;
  }

  const novyNazev =
    normalizeTagName(nazev);

  if (!novyNazev) {
    return false;
  }

  const uzExistuje = syncedTags.some(
    (tag) =>
      String(tag.name || "")
        .trim()
        .toLowerCase() ===
      novyNazev.toLowerCase()
  );

  if (uzExistuje) {
    zobrazZpravuAplikace(
      "Tajné štítky",
      "Štítek s tímto názvem už existuje."
    );

    return false;
  }

  /*
   * ID vytvoříme ještě před šifrováním,
   * protože je součástí AES-GCM
   * additionalData.
   */
  const tagId = crypto.randomUUID();

  const zasifrovanyNazev =
    await zasifrujNazevTajnehoStitku(
      novyNazev,
      tagId
    );

  /*
   * Sloupec name zůstává pouze jako
   * necitlivý technický identifikátor.
   * Skutečný název je pouze v encrypted_name.
   */
  const technickyNazev =
    `__secret_tag_${tagId}`;

  const { error } = await supabaseClient
    .from("tags")
    .insert({
      id: tagId,
      user_id: user.id,
      name: technickyNazev,
      encrypted_name: zasifrovanyNazev,
      is_secret: true,
      sort_order: syncedTags.length,
      color: "system"
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

window.addEventListener(
  "lubanote:language-change",
  () => {
    if (typeof renderTagFilters === "function") {
      renderTagFilters();
    }
  }
);
