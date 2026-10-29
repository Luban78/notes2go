const tagsT = (klic, zaloha, hodnoty = {}) =>
  window.LubaNoteI18n?.t?.(klic, zaloha, hodnoty) || zaloha;

let activeArea = "private";
let activeTags = [];
let activeAreaFilter = "all";
let activeTagFilter = null;
let vytvarimeTajnyStitek = false;



const DEFAULT_TAGS = ["code", "důležité", "projekt"];
let syncedTags = [];

/*
 * PATCH 591 – LOCAL ŠTÍTKY JSOU SAMOSTATNÁ DEVICE-ONLY DATA.
 * ----------------------------------------------------------
 * V prostoru 📱 Toto zařízení nesmí vytvoření / přejmenování / barva /
 * pořadí / smazání štítku volat tabulku public.tags. Lokální štítky mají
 * vlastní malý registr v localStorage, svázaný se stejným ownerem jako
 * lokální poznámky. Cloudové a lokální štítky se záměrně nemíchají.
 *
 * Secret LOCAL štítky se do registru NIKDY neukládají pod plaintext názvem.
 * Ukládá se pouze AES-GCM encrypted_name a technické __secret_tag_<id>.
 */
const LOCAL_TAGS_STORAGE_KEY = "lubanoteLocalTagsV1";
const LOCAL_TAGS_OWNER_KEY = "lubanoteLocalOwnerUserId";

function jeAktivniLokalniProstorStitku() {
  return (
    window.LubaNoteStorageScope
      ?.ziskejAktivni?.() === "local"
  );
}

function jeLokalniStitek(tag) {
  return (
    tag?.local_only === true ||
    tag?.storageScope === "local"
  );
}

function jeLokalniPoznamkaProStitky(note) {
  try {
    if (
      window.LubaNoteStorageScope
        ?.jePouzeLokalni?.(note) === true
    ) {
      return true;
    }
  } catch (_error) {}

  return note?.storageScope === "local";
}

function patriPoznamkaKeStitkuPodleProstoru(note, tag) {
  return (
    jeLokalniPoznamkaProStitky(note) ===
    jeLokalniStitek(tag)
  );
}

function ziskejOwnerIdLokalnichStitku() {
  return String(
    localStorage.getItem(LOCAL_TAGS_OWNER_KEY) || ""
  ).trim();
}

function nactiSyroveLokalniStitky() {
  const ownerId = ziskejOwnerIdLokalnichStitku();

  if (!ownerId) {
    return [];
  }

  try {
    const raw = localStorage.getItem(
      LOCAL_TAGS_STORAGE_KEY
    );

    if (!raw) {
      return [];
    }

    const payload = JSON.parse(raw);

    if (
      !payload ||
      String(payload.userId || "") !== ownerId ||
      !Array.isArray(payload.tags)
    ) {
      return [];
    }

    return payload.tags
      .filter((tag) => tag && tag.id)
      .map((tag, index) => {
        const poradi = Number(tag.sort_order);
        const jeTajny = tag.is_secret === true;
        const id = String(tag.id);

        return {
          id,
          user_id: ownerId,
          name: jeTajny
            ? `__secret_tag_${id}`
            : String(tag.name || "").trim(),
          encrypted_name:
            tag.encrypted_name || null,
          is_secret: jeTajny,
          sort_order: Number.isFinite(poradi)
            ? poradi
            : index,
          color: String(tag.color || "system"),
          created_at: tag.created_at || null,
          local_only: true
        };
      })
      .filter((tag) =>
        tag.is_secret === true || Boolean(tag.name)
      )
      .sort(
        (a, b) =>
          Number(a.sort_order || 0) -
          Number(b.sort_order || 0)
      );
  } catch (error) {
    console.warn(
      "LOCAL registr štítků se nepodařilo načíst:",
      error
    );
    return [];
  }
}

function ulozSyroveLokalniStitky(
  stitky,
  userId = ""
) {
  const ownerId = String(
    userId || ziskejOwnerIdLokalnichStitku()
  ).trim();
  const existujiciOwner =
    ziskejOwnerIdLokalnichStitku();

  if (
    !ownerId ||
    (existujiciOwner && existujiciOwner !== ownerId)
  ) {
    return false;
  }

  try {
    localStorage.setItem(
      LOCAL_TAGS_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        userId: ownerId,
        savedAt: new Date().toISOString(),
        tags: Array.isArray(stitky) ? stitky : []
      })
    );

    return true;
  } catch (error) {
    console.error(
      "LOCAL registr štítků se nepodařilo uložit:",
      error
    );
    return false;
  }
}

function doplnLokalniLegacyStitkyZPoznamek() {
  const ownerId = ziskejOwnerIdLokalnichStitku();

  if (
    !ownerId ||
    typeof loadTask !== "function"
  ) {
    return false;
  }

  let poznamky = [];

  try {
    poznamky = loadTask();
  } catch (_error) {
    return false;
  }

  const syrove = nactiSyroveLokalniStitky();
  const znameNazvy = new Set(
    syrove
      .filter((tag) => tag.is_secret !== true)
      .map((tag) =>
        String(tag.name || "")
          .trim()
          .toLocaleLowerCase("cs-CZ")
      )
      .filter(Boolean)
  );

  let dalsiPoradi = syrove.reduce(
    (maximum, tag) => {
      const poradi = Number(tag?.sort_order);
      return Number.isFinite(poradi)
        ? Math.max(maximum, poradi + 1)
        : maximum;
    },
    syrove.length
  );
  let zmeneno = false;

  for (const poznamka of poznamky) {
    /*
     * Secret poznámka je záměrně vynechaná: její názvy štítků nesmíme
     * nikdy migrovat jako plaintext do běžného LOCAL registru.
     */
    if (
      !jeLokalniPoznamkaProStitky(poznamka) ||
      poznamka?.isSecret === true
    ) {
      continue;
    }

    for (const nazev of (poznamka?.tags || [])) {
      const cistyNazev = String(nazev || "")
        .trim()
        .replace(/\s+/g, " ");
      const klic = cistyNazev
        .toLocaleLowerCase("cs-CZ");

      if (!cistyNazev || znameNazvy.has(klic)) {
        continue;
      }

      const id = crypto.randomUUID();
      syrove.push({
        id,
        user_id: ownerId,
        name: cistyNazev,
        encrypted_name: null,
        is_secret: false,
        sort_order: dalsiPoradi++,
        color: "system",
        created_at: new Date().toISOString()
      });
      znameNazvy.add(klic);
      zmeneno = true;
    }
  }

  if (!zmeneno) {
    return false;
  }

  return ulozSyroveLokalniStitky(
    syrove,
    ownerId
  );
}

async function pripravLokalniStitkyProPamet() {
  const syrove = nactiSyroveLokalniStitky();
  const vysledek = [];

  for (const tag of syrove) {
    if (tag.is_secret !== true) {
      vysledek.push({
        ...tag,
        local_only: true
      });
      continue;
    }

    let skutecnyNazev = "";

    if (
      tajnyRezimOdemceny &&
      tag.encrypted_name &&
      typeof desifrujNazevTajnehoStitku ===
        "function"
    ) {
      try {
        skutecnyNazev =
          await desifrujNazevTajnehoStitku(
            tag.encrypted_name,
            tag.id
          );
      } catch (error) {
        console.warn(
          "LOCAL Secret štítek se nepodařilo dešifrovat:",
          tag.id,
          error
        );
      }
    }

    vysledek.push({
      ...tag,
      name: String(skutecnyNazev || ""),
      local_only: true
    });
  }

  return vysledek;
}

async function aplikujLokalniStitkyDoPameti({
  prekreslit = true
} = {}) {
  /* PATCH 591: jednorázově převezmi staré LOCAL názvy z běžných poznámek. */
  doplnLokalniLegacyStitkyZPoznamek();
  syncedTags = await pripravLokalniStitkyProPamet();

  if (prekreslit) {
    if (typeof renderTagFilters === "function") {
      renderTagFilters();
    }

    if (typeof renderTasks === "function") {
      renderTasks();
    }
  }

  return syncedTags;
}

function pripravLokalniStitkyZUlozenePameti() {
  const ownerId = ziskejOwnerIdLokalnichStitku();

  return syncedTags
    .filter((tag) => jeLokalniStitek(tag))
    .map((tag, index) => {
      const id = String(tag.id || "").trim();
      const jeTajny = tag.is_secret === true;
      const poradi = Number(tag.sort_order);

      if (!id) {
        return null;
      }

      return {
        id,
        user_id: ownerId,
        name: jeTajny
          ? `__secret_tag_${id}`
          : String(tag.name || "").trim(),
        encrypted_name:
          jeTajny ? (tag.encrypted_name || null) : null,
        is_secret: jeTajny,
        sort_order: Number.isFinite(poradi)
          ? poradi
          : index,
        color: String(tag.color || "system"),
        created_at:
          tag.created_at || new Date().toISOString()
      };
    })
    .filter(Boolean);
}

function ulozLokalniStitkyZPameti(userId = "") {
  return ulozSyroveLokalniStitky(
    pripravLokalniStitkyZUlozenePameti(),
    userId
  );
}

/*
 * PATCH 597 – kompletní záloha LOCAL štítků.
 * -------------------------------------------
 * Cloudové štítky zůstávají v publicTags / secretTagRecords.
 * Device-only štítky se exportují samostatně a při obnově se nikdy
 * neposílají do public.tags. Secret LOCAL názvy zůstávají AES-GCM.
 */
function ziskejLokalniStitkyProKompletniZalohuV1(
  userId = ""
) {
  const ownerId = ziskejOwnerIdLokalnichStitku();
  const ocekavanyOwner = String(userId || "").trim();

  if (
    ownerId &&
    ocekavanyOwner &&
    ownerId !== ocekavanyOwner
  ) {
    throw new Error(
      "LOCAL štítky patří jinému účtu. Záloha byla bezpečně zastavena."
    );
  }

  doplnLokalniLegacyStitkyZPoznamek();

  const syrove = nactiSyroveLokalniStitky();
  const publicTags = [];
  const secretTagRecords = [];

  for (const tag of syrove) {
    const id = String(tag?.id || "").trim();
    const poradi = Number(tag?.sort_order);

    if (!id) {
      continue;
    }

    if (tag.is_secret === true) {
      const encryptedName = tag.encrypted_name;

      if (
        !encryptedName ||
        typeof encryptedName !== "object" ||
        encryptedName.algorithm !== "AES-GCM" ||
        !encryptedName.iv ||
        !encryptedName.ciphertext
      ) {
        throw new Error(
          "Secret LOCAL štítek nemá platná šifrovaná data. Záloha byla bezpečně zastavena."
        );
      }

      secretTagRecords.push({
        id,
        encrypted_name: encryptedName,
        is_secret: true,
        sort_order: Number.isFinite(poradi) ? poradi : 0,
        color: String(tag?.color || "system"),
        created_at: tag?.created_at || null
      });
      continue;
    }

    const name = String(tag?.name || "").trim();

    if (!name) {
      continue;
    }

    publicTags.push({
      id,
      name,
      is_secret: false,
      sort_order: Number.isFinite(poradi) ? poradi : 0,
      color: String(tag?.color || "system"),
      created_at: tag?.created_at || null
    });
  }

  return {
    publicTags,
    secretTagRecords
  };
}


function obnovLokalniStitkyZKompletniZalohyV1(
  publicTags,
  secretTagRecords,
  user
) {
  const userId = String(user?.id || "").trim();

  if (!userId) {
    return false;
  }

  const existujiciOwner =
    ziskejOwnerIdLokalnichStitku();

  if (existujiciOwner && existujiciOwner !== userId) {
    console.error(
      "Obnova LOCAL štítků byla zastavena: vlastník zařízení nesouhlasí."
    );
    return false;
  }

  const verejne = Array.isArray(publicTags)
    ? publicTags
    : [];
  const tajne = Array.isArray(secretTagRecords)
    ? secretTagRecords
    : [];

  const ids = new Set();
  const zaznamy = [];

  for (const [index, tag] of verejne.entries()) {
    const id = String(tag?.id || "").trim();
    const name = String(tag?.name || "").trim();
    const poradi = Number(tag?.sort_order);

    if (
      !id ||
      !name ||
      tag?.is_secret === true ||
      ids.has(id)
    ) {
      return false;
    }

    ids.add(id);
    zaznamy.push({
      id,
      user_id: userId,
      name,
      encrypted_name: null,
      is_secret: false,
      sort_order: Number.isFinite(poradi) ? poradi : index,
      color: String(tag?.color || "system"),
      created_at: tag?.created_at || null
    });
  }

  for (const [index, tag] of tajne.entries()) {
    const id = String(tag?.id || "").trim();
    const encryptedName = tag?.encrypted_name;
    const poradi = Number(tag?.sort_order);

    if (
      !id ||
      ids.has(id) ||
      tag?.is_secret !== true ||
      !encryptedName ||
      typeof encryptedName !== "object" ||
      encryptedName.algorithm !== "AES-GCM" ||
      !encryptedName.iv ||
      !encryptedName.ciphertext
    ) {
      return false;
    }

    ids.add(id);
    zaznamy.push({
      id,
      user_id: userId,
      name: `__secret_tag_${id}`,
      encrypted_name: encryptedName,
      is_secret: true,
      sort_order: Number.isFinite(poradi)
        ? poradi
        : verejne.length + index,
      color: String(tag?.color || "system"),
      created_at: tag?.created_at || null
    });
  }

  if (!existujiciOwner) {
    localStorage.setItem(
      LOCAL_TAGS_OWNER_KEY,
      userId
    );
  }

  return ulozSyroveLokalniStitky(
    zaznamy,
    userId
  );
}

async function vytvorLokalniStitek(
  nazev,
  {
    tajny = false,
    userId = "",
    barva = "system",
    prekreslit = true
  } = {}
) {
  const cistyNazev = String(nazev || "")
    .trim()
    .replace(/\s+/g, " ");

  if (!cistyNazev) {
    return null;
  }

  let ownerId = String(userId || "").trim();

  if (!ownerId && typeof getCurrentUser === "function") {
    const user = await getCurrentUser();
    ownerId = String(user?.id || "").trim();
  }

  if (!ownerId) {
    return null;
  }

  const existujiciOwner =
    ziskejOwnerIdLokalnichStitku();

  if (
    existujiciOwner &&
    existujiciOwner !== ownerId
  ) {
    console.warn(
      "LOCAL štítek nebyl uložen: vlastník zařízení nesouhlasí."
    );
    return null;
  }

  const uzExistuje = syncedTags.find((tag) =>
    String(tag?.name || "")
      .trim()
      .toLocaleLowerCase("cs-CZ") ===
    cistyNazev.toLocaleLowerCase("cs-CZ")
  );

  if (uzExistuje) {
    return uzExistuje;
  }

  const syrove = nactiSyroveLokalniStitky();
  const tagId = crypto.randomUUID();
  const dalsiPoradi = syrove.reduce(
    (maximum, tag) => {
      const poradi = Number(tag?.sort_order);
      return Number.isFinite(poradi)
        ? Math.max(maximum, poradi + 1)
        : maximum;
    },
    syrove.length
  );

  let encryptedName = null;

  if (tajny) {
    if (
      !tajnyRezimOdemceny ||
      !tajnySifrovaciKlic ||
      typeof zasifrujNazevTajnehoStitku !==
        "function"
    ) {
      return null;
    }

    encryptedName =
      await zasifrujNazevTajnehoStitku(
        cistyNazev,
        tagId
      );
  }

  const novyZaznam = {
    id: tagId,
    user_id: ownerId,
    name: tajny
      ? `__secret_tag_${tagId}`
      : cistyNazev,
    encrypted_name: encryptedName,
    is_secret: tajny,
    sort_order: dalsiPoradi,
    color: barva,
    created_at: new Date().toISOString()
  };

  if (!ulozSyroveLokalniStitky(
    [...syrove, novyZaznam],
    ownerId
  )) {
    return null;
  }

  await aplikujLokalniStitkyDoPameti({
    prekreslit
  });

  return syncedTags.find(
    (tag) => String(tag?.id || "") === tagId
  ) || null;
}

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

  /* 696W – výchozí štítky se založí opravdu JEN na prázdném účtu.
   * Dříve se doplňovaly podle chybějícího názvu. Po přejmenování
   * "Důležité" -> "Tůležité" tak vznikl nový štítek "důležité".
   * Existence libovolného záznamu (včetně soft-deleted) znamená,
   * že účet už prošel založením. Nepřidávat výchozí štítky zpět.
   */
  if (data.length > 0) {
    return false;
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
const hiddenFilterButton =
  document.getElementById("hiddenFilterButton");
const secretFilterButton =
  document.getElementById("secretFilterButton");

const tagModalTitle =
  document.getElementById("modalTitle");

const tagModalEditorHost =
  document.getElementById("modalRichTextV2Host");

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
 * PATCH 556 – POVINNÉ HLAVNÍ HESLO PO PRVNÍM PŘIHLÁŠENÍ
 * ------------------------------------------------------
 * Nový (nebo starší dosud nemigrovaný) účet bez secret_settings
 * nesmí vstoupit do aplikace dřív, než vytvoří hlavní heslo.
 * Používáme stejný modal a stejnou kryptografii jako Secret režim;
 * nevzniká žádné druhé heslo ani druhý kryptosystém.
 */
let povinneHlavniHesloAktivni = false;
let povinneHlavniHesloRezim = null;

function jePovinneHlavniHesloAktivni() {
  return povinneHlavniHesloAktivni === true;
}

function ziskejRezimPovinnehoHlavnihoHesla() {
  return povinneHlavniHesloRezim;
}

function nastavPovinneHlavniHeslo(aktivni, rezim = "vytvorit") {
  povinneHlavniHesloAktivni = aktivni === true;
  povinneHlavniHesloRezim = povinneHlavniHesloAktivni
    ? (rezim === "zarizeni" ? "zarizeni" : "vytvorit")
    : null;

  document.body.classList.toggle(
    "masterPasswordRequired",
    povinneHlavniHesloAktivni
  );

  if (closeSecretUnlockButton) {
    closeSecretUnlockButton.hidden =
      povinneHlavniHesloAktivni;
  }

  if (cancelSecretUnlockButton) {
    cancelSecretUnlockButton.hidden =
      povinneHlavniHesloAktivni;
  }

  if (!povinneHlavniHesloAktivni) {
    return;
  }

  /* PATCH 559 – povinný gate má dva režimy:
     1) první zařízení nového účtu = vytvoření hlavního hesla,
     2) další nové zařízení = jednorázové zadání EXISTUJÍCÍHO hesla.
     Sync se v obou případech spustí až po úspěšném dokončení gate. */
  const jeNoveZarizeni =
    povinneHlavniHesloRezim === "zarizeni";

  secretUnlockInput.value = "";
  secretUnlockConfirmInput.value = "";
  secretUnlockConfirmInput.hidden = jeNoveZarizeni;

  /* Povinné připojení zařízení nikdy neobcházíme biometrikou.
     Biometrie se může nastavit až později uvnitř Secret režimu. */
  const biometricButton =
    document.getElementById("secretBiometricUnlockButton");
  const biometricStatus =
    document.getElementById("secretBiometricStatus");
  const biometricEnableRow =
    document.getElementById("secretBiometricEnableRow");

  if (biometricButton) biometricButton.hidden = true;
  if (biometricStatus) biometricStatus.hidden = true;
  if (biometricEnableRow) biometricEnableRow.hidden = true;

  const nadpis = jeNoveZarizeni
    ? tagsT("secret.deviceUnlockTitle", "Odemkni toto zařízení")
    : tagsT("secret.createMainTitle", "Vytvoř hlavní heslo");
  const textTlacitka = jeNoveZarizeni
    ? tagsT("secret.unlockContinue", "Odemknout a pokračovat")
    : tagsT("secret.createContinue", "Vytvořit a pokračovat");

  if (window.LubaNoteIcons?.nastavObsahSIkonou) {
    window.LubaNoteIcons.nastavObsahSIkonou(
      secretUnlockTitle,
      "zamek",
      nadpis
    );
    window.LubaNoteIcons.nastavObsahSIkonou(
      confirmSecretUnlockButton,
      "zamek",
      textTlacitka
    );
  } else {
    secretUnlockTitle.textContent = nadpis;
    confirmSecretUnlockButton.textContent = textTlacitka;
  }

  secretUnlockDescription.textContent = jeNoveZarizeni
    ? tagsT("secret.deviceUnlockDescription", "Tento účet už hlavní heslo má. Zadej ho jednou, aby LubaNote bezpečně připravila Secret režim a E2E fotografie na tomto zařízení. Teprve potom se spustí synchronizace.")
    : tagsT("secret.createMainDescription", "Než začneš LubaNote používat, vytvoř hlavní heslo. Chrání Secret režim a E2E šifrované fotografie. Není to přihlašovací heslo a LubaNote ho neukládá do cloudu.");

  secretUnlockModal.hidden = false;

  requestAnimationFrame(() => {
    secretUnlockInput?.focus?.();
  });
}

window.LubaNoteMasterPasswordOnboarding = {
  zobraz: (rezim = "vytvorit") =>
    nastavPovinneHlavniHeslo(true, rezim),
  dokonceno: () => nastavPovinneHlavniHeslo(false),
  jeAktivni: jePovinneHlavniHesloAktivni,
  rezim: ziskejRezimPovinnehoHlavnihoHesla
};

window.addEventListener(
  "lubanote:master-password-required",
  (event) => nastavPovinneHlavniHeslo(
    true,
    event?.detail?.mode === "zarizeni"
      ? "zarizeni"
      : "vytvorit"
  )
);
















/*
 * Trvalá tlačítka Secret modalů registrujeme jen jednou.
 * Dříve se jejich listenery přidávaly při každém renderTagFilters(),
 * takže se s každým překreslením vrstvily a aplikace zpomalovala.
 */
closeSecretUnlockButton?.addEventListener(
  "click",
  () => {
    if (jePovinneHlavniHesloAktivni()) {
      return;
    }

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
    if (jePovinneHlavniHesloAktivni()) {
      return;
    }

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

let hiddenFilterActive = false;

function vypniFiltrSkrytych() {
  if (!hiddenFilterActive) {
    return;
  }

  hiddenFilterActive = false;
  hiddenFilterButton?.classList.remove("active");
  updateAreaFilterUI();
}

function nastavFiltrSkrytych(aktivni) {
  hiddenFilterActive = aktivni === true;
  hiddenFilterButton?.classList.toggle(
    "active",
    hiddenFilterActive
  );
}

hiddenFilterButton?.addEventListener("click", () => {
  const novyStav = !hiddenFilterActive;

  nastavFiltrSkrytych(novyStav);

  /*
   * PATCH 541 – systémová oblast vždy ruší běžný štítek.
   * Skryté se nesmí nečekaně kombinovat s dříve zapnutým štítkem,
   * a to ani při opětovném vypnutí oka.
   */
  activeTagFilter = null;

  if (novyStav) {
    /* Skryté je samostatná systémová oblast, ne kombinace běžných filtrů. */
    activeAreaFilter = "all";
    favoriteFilterActive = false;
    filtrTajnychPoznamekAktivni = false;

    favoriteFilterButton?.classList.remove("active");
    secretFilterButton?.classList.remove("active");
  }

  updateTagFilterUI();
  updateAreaFilterUI();
  renderTasks();
});

secretFilterButton?.addEventListener(
  "click",
  () => {
    if (!tajnyRezimOdemceny) {
      return;
    }

    vypniFiltrSkrytych();
    
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
  vypniFiltrSkrytych();
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
      tagsT("tags.deleting", "Mažu štítek…"),
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
  const novaBarva = ziskejBarvuNovehoStitku683AE();
  
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
        ? tagsT("secret.tags", "Tajné štítky")
        : tagsT("editor.tags", "Štítky"),
      tagsT("tags.duplicate", "Štítek s tímto názvem už existuje.")
    );
    
    vytvarimeTajnyStitek = false;
    return;
  }
  
  saveNewTagModalButton.disabled = true;
  
  const puvodniText =
    saveNewTagModalButton.textContent;
  
  saveNewTagModalButton.textContent =
    tagsT("tags.savingShort", "Ukládám…");
  
  const ukonciCekani =
    window.LubaNoteUI?.zacniCekaniAkce?.(
      tagsT("tags.saving", "Ukládám štítek…"),
      300
    ) || (() => {});
  
  try {
    if (vytvarimeTajnyStitek) {
      const uspesne =
        await vytvorTajnyStitek(name, novaBarva);
      
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

    /* PATCH 591: nový běžný štítek v 📱 prostoru zůstává jen v zařízení. */
    if (jeAktivniLokalniProstorStitku()) {
      const lokalniStitek = await vytvorLokalniStitek(
        name,
        { userId: user.id, barva: novaBarva }
      );

      if (!lokalniStitek) {
        return;
      }

      newTagModal.hidden = true;
      return;
    }
    
    const { error } = await supabaseClient
      .from("tags")
      .insert({
        user_id: user.id,
        name: name,
        is_secret: false,
        sort_order: syncedTags.length,
        color: novaBarva
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
      !hiddenFilterActive &&
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
    jsmeDole
      ? tagsT("tags.moveUp", "Posunout štítky nahoru")
      : tagsT("tags.moveDown", "Posunout štítky dolů")
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
  /* PATCH 591: LOCAL registry nikdy nesmí přepsat cloudovou start cache. */
  if (jeAktivniLokalniProstorStitku()) {
    return false;
  }

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

  /*
   * PATCH 591: při startu v 📱 prostoru nesmíme ani na okamžik vložit
   * cloudové štítky do LOCAL UI. Veřejné LOCAL štítky načteme hned;
   * Secret názvy se doplní až po odemknutí přes loadTagsFromSupabase().
   */
  if (jeAktivniLokalniProstorStitku()) {
    doplnLokalniLegacyStitkyZPoznamek();
    syncedTags = nactiSyroveLokalniStitky().map((tag) => ({
      ...tag,
      name: tag.is_secret === true ? "" : tag.name,
      local_only: true
    }));

    if (typeof renderTagFilters === "function") {
      renderTagFilters();
    }

    if (typeof renderTasks === "function") {
      renderTasks();
    }

    return true;
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

  /*
   * PATCH 591 – LOCAL prostor má vlastní autoritu štítků.
   * Tato větev je záměrně PŘED getCurrentUser() a před jakýmkoliv
   * Supabase dotazem. Background refresh ani Secret unlock tak v 📱
   * prostoru nemůže sáhnout na public.tags.
   */
  if (jeAktivniLokalniProstorStitku()) {
    await aplikujLokalniStitkyDoPameti();
    zapisVdBarevStitku("LOAD LOCAL");
    return true;
  }

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
  
  // 696S: A network refresh often returns exactly the cached palette.
  // Don't rebuild 70+ cards if names, membership and colors did not change.
  // Compare presentation fields only; timestamps alone do not alter cards.
  const podpisBarevKaret696S = list => JSON.stringify((list||[]).map(tag=>[
    tag?.id??null,tag?.name??'',tag?.color??'system',
    tag?.is_secret===true,tag?.deleted_at??null
  ]));
  const prekreslitKarty696S =
    podpisBarevKaret696S(syncedTags)!==podpisBarevKaret696S(nacteneStitky);
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
if (typeof renderTasks === "function" && prekreslitKarty696S) {
  renderTasks();
} else if (!prekreslitKarty696S) {
  window.LubaNoteStartupDiag?.zapis?.('TAG-VD',
    '696S CARDS RENDER SKIP | same tag colors/names as cache');
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
const POSUN_GHOSTU_DESKTOP_NAHORU = 10;

function zapisTagDragDiag(text) {
  try {
    document.dispatchEvent(
      new CustomEvent("lubanote:tag-drag-debug", {
        detail: {
          text: String(text || "")
        }
      })
    );
  } catch (_) {
    // Diagnostika nikdy nesmí ovlivnit drag.
  }
}

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

  /*
   * PATCH 591: legacy štítek z LOCAL poznámky se při long-pressu doplní
   * pouze do lokálního registru. Původní cloudová cesta se vůbec nespustí.
   */
  if (jeAktivniLokalniProstorStitku()) {
    const lokalniPromise = (async () => {
      const user = await getCurrentUser();

      if (!user?.id) {
        return null;
      }

      return await vytvorLokalniStitek(
        nazev,
        {
          userId: user.id,
          prekreslit: false
        }
      );
    })().finally(() => {
      zajisteniLegacyStitkuProDrag.delete(klic);
    });

    zajisteniLegacyStitkuProDrag.set(
      klic,
      lokalniPromise
    );
    return lokalniPromise;
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

  /* PATCH 591: pořadí LOCAL štítků se zapisuje jen do device registru. */
  if (jeAktivniLokalniProstorStitku()) {
    syncedTags = serazeneStitky.map(
      (tag, index) => ({
        ...tag,
        sort_order: index,
        local_only: true
      })
    );

    if (!ulozLokalniStitkyZPameti()) {
      syncedTags = puvodniStitky;
      renderTagFilters();
      zobrazZpravuAplikace(
        tagsT("editor.tags", "Štítky"),
        tagsT("tags.orderSaveFailed", "Pořadí lokálních štítků se nepodařilo uložit.")
      );
      return false;
    }

    renderTagFilters();
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
      tagsT("tags.savingOrder", "Ukládám pořadí štítků…"),
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
        tagsT("editor.tags", "Štítky"),
        tagsT("tags.orderSaveFailed", "Pořadí štítků se nepodařilo uložit.")
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
  /* PATCH 658 – na mobilu mají štítky vlastní druhý řádek a vlastní
     horizontální scroll. Na desktopu zůstává původní scroll rodiče. */
  if (
    tagFilterButtons &&
    tagFilterButtons.scrollWidth > tagFilterButtons.clientWidth + 1
  ) {
    return tagFilterButtons;
  }

  return tagFilterButtons?.closest(".categoryTabs") || null;
}

function ziskejPoradiHornichStitku(stavPresunu = null) {
  pripravIdVsemHornimStitkum();

  /*
   * PC používá od 425 stejný bezpečný princip jako drag karet:
   * zdrojové tlačítko během přesunu NIKDY fyzicky nepřehazujeme v DOM.
   * V seznamu se pohybuje jen inertní placeholder. Při čtení pořadí proto
   * placeholder zastupuje id právě taženého štítku a původní zdroj přeskočíme.
   *
   * Tím se vyhneme Chromium NotFoundError z insertBefore(), který vznikal,
   * když browser při přesunu fokusovaného BUTTONu změnil DOM uprostřed operace.
   */
  if (
    stavPresunu?.placeholder?.parentElement === tagFilterButtons &&
    stavPresunu?.button
  ) {
    const zdrojovyZaznam = najdiZaznamHornihoStitku(stavPresunu.button);
    const zdrojoveId = zdrojovyZaznam?.id
      ? String(zdrojovyZaznam.id)
      : "";

    return Array.from(tagFilterButtons.children)
      .map((prvek) => {
        if (prvek === stavPresunu.button) {
          return "";
        }

        if (prvek === stavPresunu.placeholder) {
          return zdrojoveId;
        }

        if (!prvek.matches?.(".categoryTab[data-tag-filter]")) {
          return "";
        }

        const zaznam = najdiZaznamHornihoStitku(prvek);
        return zaznam?.id ? String(zaznam.id) : "";
      })
      .filter(Boolean);
  }

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

  /*
   * Desktop: přesouvá se pouze placeholder, nikdy fokusovaný BUTTON.
   * Touch ponecháváme beze změny, protože na mobilu byl drag potvrzen funkční.
   */
  const presouvanyPrvek =
    stav.placeholder?.parentElement === tagFilterButtons
      ? stav.placeholder
      : button;

  const ostatni = Array.from(
    tagFilterButtons.querySelectorAll(
      ".categoryTab[data-tag-filter]"
    )
  ).filter(
    (jiny) =>
      jiny !== button &&
      jiny.parentElement === tagFilterButtons
  );

  const predKtery = ostatni.find((jiny) => {
    const rect = jiny.getBoundingClientRect();
    return clientX < rect.left + rect.width / 2;
  });

  const puvodniPred = presouvanyPrvek.nextElementSibling;

  if (predKtery?.parentElement === tagFilterButtons) {
    tagFilterButtons.insertBefore(presouvanyPrvek, predKtery);
  } else {
    const novy = tagFilterButtons.querySelector(
      ":scope > .newTagFilterButton"
    );
    tagFilterButtons.insertBefore(presouvanyPrvek, novy || null);
  }

  if (presouvanyPrvek.nextElementSibling !== puvodniPred) {
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
     * Mobil: ghost zůstává celý nad prstem, aby jej prst nezakrýval.
     * PC: kurzor je přesný a malý, proto ghost držíme jen mírně nad myší
     * (střed štítku cca 10 px nad kurzorem), ne celý štítek vysoko nad ní.
     */
    stav.ghost.style.left = `${Math.round(clientX - sirkaGhostu / 2)}px`;
    const ghostTop =
      stav.vstup === "touch"
        ? clientY - vyskaGhostu - ODSAZENI_GHOSTU_NAD_PRSTEM
        : clientY - vyskaGhostu / 2 - POSUN_GHOSTU_DESKTOP_NAHORU;
    stav.ghost.style.top = `${Math.round(ghostTop)}px`;
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
  const jeDesktop = vstup !== "touch";
  let placeholder = null;

  ghost.classList.remove("active");
  ghost.classList.add("lubaTagDragGhost");
  ghost.style.width = `${Math.round(rect.width)}px`;
  ghost.style.height = `${Math.round(rect.height)}px`;
  ghost.style.left = `${Math.round(clientX - rect.width / 2)}px`;
  const ghostTop = jeDesktop
    ? clientY - rect.height / 2 - POSUN_GHOSTU_DESKTOP_NAHORU
    : clientY - rect.height - ODSAZENI_GHOSTU_NAD_PRSTEM;
  ghost.style.top = `${Math.round(ghostTop)}px`;

  /*
   * PC – FIX 425 / STEJNÝ PRINCIP JAKO KARTY
   * ==========================================
   * Původní tlačítko zůstává po celou dobu připojené na stejném místě v DOM.
   * Z flow ho pouze vizuálně vyjmeme a jeho slot zastoupí inertní placeholder.
   * Při dragování se přehazuje VÝHRADNĚ placeholder.
   *
   * Důvod: konzole prokázala NotFoundError přímo na insertBefore(button,...).
   * Přesun fokusovaného BUTTONu může v Chromium během interního blur kroku
   * změnit DOM a insertBefore pak pracuje s uzlem, který už není tam, kde čeká.
   * Card drag tento problém nemá právě proto, že přesouvá placeholder.
   */
  if (jeDesktop && button.parentElement === tagFilterButtons) {
    placeholder = button.cloneNode(false);
    placeholder.removeAttribute("id");
    placeholder.removeAttribute("data-tag-filter");
    placeholder.removeAttribute("data-tag-id");
    placeholder.removeAttribute("data-tag-color");
    placeholder.removeAttribute("data-tag-drag-ready");
    placeholder.classList.remove(
      "active",
      "lubaTagDragSource"
    );
    placeholder.classList.add("lubaTagDragPlaceholder");
    placeholder.textContent = "";
    placeholder.setAttribute("aria-hidden", "true");
    Object.assign(placeholder.style, {
      width: `${Math.round(rect.width)}px`,
      minWidth: `${Math.round(rect.width)}px`,
      maxWidth: `${Math.round(rect.width)}px`,
      height: `${Math.round(rect.height)}px`,
      visibility: "hidden",
      pointerEvents: "none",
      flex: "0 0 auto"
    });

    tagFilterButtons.insertBefore(placeholder, button);

    /*
     * Originál neskrýváme přes display:none/visibility:hidden, aby browser
     * nemusel měnit focus. Pouze ho vyjmeme z layoutu a zprůhledníme.
     */
    Object.assign(button.style, {
      position: "fixed",
      left: `${Math.round(rect.left)}px`,
      top: `${Math.round(rect.top)}px`,
      width: `${Math.round(rect.width)}px`,
      height: `${Math.round(rect.height)}px`,
      margin: "0",
      opacity: "0",
      pointerEvents: "none",
      zIndex: "-1"
    });
  }

  document.body.append(ghost);
  button.classList.add("lubaTagDragSource");
  document.body.classList.add("lubaTagDragMode");

  presunHornihoStitku = {
    button,
    ghost,
    placeholder,
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

  zapisTagDragDiag(
    `FINISH_CALL drag=${Boolean(stav)} cancel=${zrusit} ` +
    `id=${stav?.id ?? "NONE"} changed=${stav?.zmeneno ?? "NONE"}`
  );

  if (!stav) {
    return;
  }

  /*
   * U desktop placeholderu musíme pořadí přečíst ještě před úklidem DOM.
   * Placeholder v tomto okamžiku reprezentuje tažený štítek na cílovém místě.
   */
  const novePoradi = zrusit
    ? null
    : ziskejPoradiHornichStitku(stav);

  zastavAutoScrollHornichStitku();
  presunHornihoStitku = null;
  document.body.classList.remove("lubaTagDragMode");

  stav.button?.classList.remove("lubaTagDragSource");
  stav.ghost?.remove();
  zapisTagDragDiag(
    `CLEANUP id=${stav.id ?? "NONE"} ghostConnected=${Boolean(stav.ghost?.isConnected)} ` +
    `placeholder=${Boolean(stav.placeholder)}`
  );

  /* Long-press/drop nesmí po puštění aktivovat filtr. */
  blokovatKlikHornihoStitkuDo = Date.now() + 650;

  if (zrusit) {
    renderTagFilters();
    return;
  }

  if (
    !stav.zmeneno ||
    !Array.isArray(novePoradi) ||
    novePoradi.join("|") === stav.puvodniPoradi.join("|")
  ) {
    /* Desktop zdroj/placeholder obnovíme čistým renderem i bez změny pořadí. */
    if (stav.placeholder) {
      renderTagFilters();
    }
    return;
  }

  try {
    await ulozPoradiStitku(novePoradi);
  } finally {
    /*
     * ulozPoradiStitku() běžně render provede samo. Tohle je pojistka pro
     * předčasný return/neočekávanou výjimku, aby nikdy nezůstal skrytý zdroj.
     */
    if (stav.placeholder?.isConnected || stav.button?.classList.contains("lubaTagDragSource")) {
      renderTagFilters();
    }
  }
}


/*
 * DESKTOP DRAG ŠTÍTKŮ – STEJNÝ INPUT LIFECYCLE JAKO KARTY
 * ========================================================
 * Karty používají jeden globální pointer lifecycle. Desktop štítků musí
 * fungovat stejně: pointer sledujeme od DOWN až po UP/CANCEL na documentu,
 * ne přes listenery přidávané až na konkrétním tlačítku po long-pressu.
 * Tím se drag neztratí, když browser během držení změní event target.
 */
const aktivniPointeryHornichStitku = new Set();
let desktopStitekPointer = null;

function zrusDesktopTimerStitku() {
  if (desktopStitekPointer?.timer) {
    clearTimeout(desktopStitekPointer.timer);
    desktopStitekPointer.timer = 0;
  }
}

function vycistiDesktopPointerStitku() {
  zrusDesktopTimerStitku();
  desktopStitekPointer = null;
}

function pripravDesktopDragHornihoStitku(button, event) {
  zapisTagDragDiag(
    `DOWN name=${button?.dataset?.tagFilter || button?.textContent || "?"} ` +
    `id=${event?.pointerId ?? "?"} buttons=${event?.buttons ?? "?"}`
  );

  if (
    !button?.isConnected ||
    event.pointerType === "touch" ||
    event.button !== 0 ||
    presunHornihoStitku ||
    poradiStitkuSeUklada
  ) {
    return;
  }

  /* Jeden desktop pointer = jeden drag pokus. */
  if (desktopStitekPointer) {
    vycistiDesktopPointerStitku();
  }

  const stav = {
    button,
    pointerId: event.pointerId,
    pointerType: event.pointerType || "mouse",
    startX: event.clientX,
    startY: event.clientY,
    x: event.clientX,
    y: event.clientY,
    timer: 0
  };

  desktopStitekPointer = stav;
  zapisTagDragDiag(
    `ARM id=${stav.pointerId} @${Math.round(stav.startX)},${Math.round(stav.startY)}`
  );

  stav.timer = setTimeout(async () => {
    zapisTagDragDiag(
      `TIMER id=${stav.pointerId} activePointer=${aktivniPointeryHornichStitku.has(stav.pointerId)} ` +
      `sameState=${desktopStitekPointer === stav}`
    );
    if (
      desktopStitekPointer !== stav ||
      !aktivniPointeryHornichStitku.has(stav.pointerId)
    ) {
      return;
    }

    /*
     * Záznam štítku dohledáváme až PO skutečném long-pressu.
     * Krátký desktop klik tak nikdy nespouští žádnou drag přípravu
     * ani cloudovou práci navíc.
     */
    const zaznam = await zajistiZaznamHornihoStitkuProDrag(button);
    zapisTagDragDiag(
      `READY id=${stav.pointerId} tagId=${zaznam?.id || "NONE"} ` +
      `activePointer=${aktivniPointeryHornichStitku.has(stav.pointerId)} ` +
      `sameState=${desktopStitekPointer === stav}`
    );

    if (
      desktopStitekPointer !== stav ||
      !aktivniPointeryHornichStitku.has(stav.pointerId) ||
      !zaznam?.id
    ) {
      return;
    }

    const aktivovano = zahajPresunHornihoStitku(
      button,
      stav.x,
      stav.y,
      stav.pointerType,
      stav.pointerId
    );
    zapisTagDragDiag(
      `START id=${stav.pointerId} ok=${aktivovano} ` +
      `drag=${Boolean(presunHornihoStitku)} @${Math.round(stav.x)},${Math.round(stav.y)}`
    );

    if (aktivovano) {
      /*
       * PC – FIX 425
       * ============
       * Desktop štítků teď používá stejný bezpečný princip jako karty:
       * originál zůstává připojený, pořadí mění pouze placeholder.
       * Globální document pointer lifecycle už stačí, takže pointer capture
       * záměrně nepoužíváme ani po této změně.
       */
      zapisTagDragDiag(`NO_CAPTURE id=${stav.pointerId} reason=placeholder-drag`);
    }
  }, CAS_LONG_PRESS_STITKU);
}

document.addEventListener(
  "pointerdown",
  (event) => {
    if (event.pointerType !== "touch") {
      aktivniPointeryHornichStitku.add(event.pointerId);
    }
  },
  true
);

document.addEventListener(
  "pointermove",
  (event) => {
    const stav = desktopStitekPointer;

    if (
      !stav ||
      event.pointerType === "touch" ||
      event.pointerId !== stav.pointerId
    ) {
      return;
    }

    stav.x = event.clientX;
    stav.y = event.clientY;

    const aktivni =
      presunHornihoStitku?.button === stav.button &&
      presunHornihoStitku?.id === stav.pointerId;

    if (aktivni) {
      event.preventDefault();
      event.stopPropagation();

      const tedDiag = performance.now();
      if (!stav.posledniDiagMove || tedDiag - stav.posledniDiagMove > 250) {
        stav.posledniDiagMove = tedDiag;
        zapisTagDragDiag(
          `MOVE id=${stav.pointerId} @${Math.round(stav.x)},${Math.round(stav.y)} buttons=${event.buttons}`
        );
      }

      /*
       * DESKTOP FAILSAFE:
       * Některé Chromium/WebView kombinace mohou při přesunu přes
       * horizontálně scrollovaný pás ztratit pointerup. Pokud už levé
       * tlačítko fyzicky není dole, drag nesmí zůstat viset.
       */
      if ((event.buttons & 1) === 0) {
        void dokoncitPresunHornihoStitku();
        vycistiDesktopPointerStitku();
        return;
      }

      pohniGhostemHornihoStitku(stav.x, stav.y);
      return;
    }

    if (
      Math.hypot(
        stav.x - stav.startX,
        stav.y - stav.startY
      ) > POHYB_PRED_LONG_PRESS_STITKU
    ) {
      zrusDesktopTimerStitku();
    }
  },
  { capture: true, passive: false }
);

document.addEventListener(
  "pointerup",
  (event) => {
    aktivniPointeryHornichStitku.delete(event.pointerId);

    if (event.pointerType === "touch") {
      return;
    }

    const stav = desktopStitekPointer;
    const aktivniDrag = presunHornihoStitku;

    zapisTagDragDiag(
      `UP eventId=${event.pointerId} helperId=${stav?.pointerId ?? "NONE"} ` +
      `dragId=${aktivniDrag?.id ?? "NONE"} drag=${Boolean(aktivniDrag)} buttons=${event.buttons}`
    );

    /*
     * PC – KRITICKÝ FAILSAFE 422
     * ========================================
     * Debug Hub prokázal, že Chrome pointerup normálně doručí, ale
     * pomocný desktopStitekPointer může být v tu chvíli už ztracený,
     * zatímco skutečný drag (presunHornihoStitku + ghost) stále žije.
     *
     * Proto ukončení dragu NESMÍ záviset na existenci pomocného stavu.
     * Zdroj pravdy pro aktivní drag je presunHornihoStitku.
     */
    if (
      aktivniDrag &&
      aktivniDrag.vstup !== "touch" &&
      aktivniDrag.id === event.pointerId
    ) {
      event.preventDefault();
      event.stopPropagation();
      pohniGhostemHornihoStitku(event.clientX, event.clientY);
      void dokoncitPresunHornihoStitku();
    }

    if (stav && event.pointerId === stav.pointerId) {
      stav.x = event.clientX;
      stav.y = event.clientY;
      zrusDesktopTimerStitku();

      try {
        if (stav.button?.hasPointerCapture?.(stav.pointerId)) {
          stav.button.releasePointerCapture?.(stav.pointerId);
        }
      } catch (_) {}

      vycistiDesktopPointerStitku();
    }
  },
  { capture: true, passive: false }
);

/*
 * PC fallback mimo Pointer Events.
 * Chrome běžně vyšle pointerup + mouseup. Kdyby pointerup z nějakého
 * důvodu chyběl, mouseup vždy uklidí aktivní ghost. Díky kontrole stavu
 * je dvojité dokončení neškodné.
 */
document.addEventListener(
  "mouseup",
  (event) => {
    if (event.button !== 0) {
      return;
    }

    const stav = desktopStitekPointer;
    const aktivniDrag = presunHornihoStitku;

    zapisTagDragDiag(
      `MOUSEUP helperId=${stav?.pointerId ?? "NONE"} ` +
      `dragId=${aktivniDrag?.id ?? "NONE"} drag=${Boolean(aktivniDrag)} buttons=${event.buttons}`
    );

    /* Druhá nezávislá pojistka pro browsery, kde se pointer stav rozpojí. */
    if (aktivniDrag && aktivniDrag.vstup !== "touch") {
      event.preventDefault();
      event.stopPropagation();
      pohniGhostemHornihoStitku(event.clientX, event.clientY);
      void dokoncitPresunHornihoStitku();
    }

    if (stav) {
      zrusDesktopTimerStitku();
      aktivniPointeryHornichStitku.delete(stav.pointerId);
      vycistiDesktopPointerStitku();
    }
  },
  { capture: true, passive: false }
);

document.addEventListener(
  "mousemove",
  (event) => {
    const stav = desktopStitekPointer;
    if (!stav) {
      return;
    }

    stav.x = event.clientX;
    stav.y = event.clientY;

    const aktivni =
      presunHornihoStitku?.button === stav.button &&
      presunHornihoStitku?.id === stav.pointerId;

    if (!aktivni) {
      return;
    }

    if ((event.buttons & 1) === 0) {
      void dokoncitPresunHornihoStitku();
      vycistiDesktopPointerStitku();
      return;
    }

    event.preventDefault();
    pohniGhostemHornihoStitku(event.clientX, event.clientY);
  },
  { capture: true, passive: false }
);

document.addEventListener(
  "pointercancel",
  (event) => {
    aktivniPointeryHornichStitku.delete(event.pointerId);

    const stav = desktopStitekPointer;
    if (!stav || event.pointerId !== stav.pointerId) {
      return;
    }

    const aktivni =
      presunHornihoStitku?.button === stav.button &&
      presunHornihoStitku?.id === stav.pointerId;

    if (aktivni) {
      zapisTagDragDiag(`CANCEL eventId=${event.pointerId} reason=pointercancel`);
      void dokoncitPresunHornihoStitku({ zrusit: true });
    }

    vycistiDesktopPointerStitku();
  },
  true
);

window.addEventListener(
  "blur",
  () => {
    const stav = desktopStitekPointer;
    if (!stav) {
      return;
    }

    aktivniPointeryHornichStitku.delete(stav.pointerId);

    const aktivni =
      presunHornihoStitku?.button === stav.button &&
      presunHornihoStitku?.id === stav.pointerId;

    if (aktivni) {
      zapisTagDragDiag(`CANCEL id=${stav.pointerId} reason=window-blur`);
      void dokoncitPresunHornihoStitku({ zrusit: true });
    }

    vycistiDesktopPointerStitku();
  },
  true
);

function nastavDragHornihoStitku(button) {
  if (!button || button.dataset.tagDragReady === "true") {
    return;
  }

  button.dataset.tagDragReady = "true";

  let touchId = null;
  let touchStartX = 0;
  let touchStartY = 0;
  let touchX = 0;
  let touchY = 0;
  let touchTimer = 0;
  let touchListenery = false;
  let touchAktivovan = false;

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
    pripravDesktopDragHornihoStitku(button, event);
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
    aplikujKontrastStitku683AB(barvaTlacitko, tag.color || "system");
    
    barvaTlacitko.setAttribute(
      "aria-label",
      tagsT("tags.colorAria", "Barva štítku {name}", { name: tag.name })
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
      
      BARVY_PALETY_STITKU_683AE.forEach((barva, index) => {
        const volba = document.createElement("button");
        
        volba.type = "button";
        volba.className = "manageTagColorOption";
        volba.dataset.tagColor = barva;
        volba.dataset.lubaChosen = String(tag.color === barva);
        volba.setAttribute("aria-pressed", String(tag.color === barva));
        const popisBarvy = popisOdstinu683AE(index);
        volba.setAttribute(
          "aria-label",
          tagsT("tags.setColorAria", "Nastavit barvu štítku na {color}", { color: popisBarvy })
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

      // 683AE – první ovládací prvek zároveň náhled aktuální barvy štítku.
      const vlastniBarva = vytvorTlacitkoVlastniBarvy683AE(tag.color || "system", () => {
        otevriVyberBarvyStitku683AC(tag);
      });
      paleta.prepend(vlastniBarva);

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
      tagsT("tags.renameAria", "Přejmenovat štítek {name}", { name: tag.name })
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
        vstup.setAttribute("data-luba-keyboard-field", "tag-rename");
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
          tagsT("tags.renaming", "Přejmenovávám štítek…"),
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
      tagsT("tags.deleteAria", "Smazat štítek {name}", { name: tag.name })
    );
    
    smazatTlacitko.addEventListener("click", () => {
      tagKeSmazani = tag;
      
      deleteTagConfirmText.textContent =
        tagsT("tags.deleteConfirm", "Opravdu chceš smazat štítek „{name}“?", { name: tag.name });
      
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
  /* PATCH 591: barva LOCAL štítku nikdy nevolá public.tags. */
  if (jeLokalniStitek(tag)) {
    const puvodniStitky = syncedTags.slice();

    syncedTags = syncedTags.map(
      (aktualniTag) =>
      aktualniTag.id === tag.id ?
      {
        ...aktualniTag,
        color: novaBarva,
        local_only: true
      } :
      aktualniTag
    );

    if (!ulozLokalniStitkyZPameti()) {
      syncedTags = puvodniStitky;
      return false;
    }

    renderTagFilters();

    if (typeof renderTasks === "function") {
      renderTasks();
    }

    return true;
  }

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

  /*
   * PATCH 548 – barva štítku se musí projevit okamžitě i bez reloadu.
   * Současně obnovíme bezpečnou start cache a ostatním právě připojeným
   * zařízením pošleme jen malý realtime signál; žádné poznámky se kvůli
   * tomu nestahují. Přijímač obnoví pouze malou tabulku tags.
   */
  ulozStitkyDoStartCache(user.id, syncedTags);
  renderTagFilters();

  if (typeof renderTasks === "function") {
    renderTasks();
  }

  Promise.resolve(
    window.LubaNoteSyncRealtime
      ?.oznamZmenuStitku?.({
        tagId: tag.id,
        reason: "color"
      })
  ).catch((error) => {
    console.warn(
      "Realtime oznámení změny štítku selhalo:",
      error
    );
  });
  
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
      tagsT("editor.tags", "Štítky"),
      tagsT("tags.duplicate", "Štítek s tímto názvem už existuje.")
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
        tagsT("secret.tags", "Tajné štítky"),
        tagsT("tags.unlockFirst", "Nejdřív odemkni tajný režim.")
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

  const lokalniStitek = jeLokalniStitek(tag);

  if (lokalniStitek) {
    /*
     * PATCH 591: LOCAL přejmenování mění pouze device registr.
     * U Secret štítku zůstává v localStorage jen encrypted_name.
     */
    const puvodniStitky = syncedTags.slice();

    syncedTags = syncedTags.map(
      (aktualniTag) =>
      aktualniTag.id === tag.id ?
      {
        ...aktualniTag,
        name: novyNazev,
        ...(tag.is_secret === true
          ? { encrypted_name: dataProUlozeni.encrypted_name }
          : {}),
        local_only: true
      } :
      aktualniTag
    );

    if (!ulozLokalniStitkyZPameti(user.id)) {
      syncedTags = puvodniStitky;
      return false;
    }
  } else {
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
  }
  
  const poznamky = loadTask();
  const zmenenePoznamky = [];
  
  poznamky.forEach((poznamka) => {
    /*
     * PATCH 591: stejnojmenný štítek v druhém prostoru je jiná entita.
     * LOCAL správa proto nesmí měnit cloudovou poznámku a obráceně.
     */
    if (!patriPoznamkaKeStitkuPodleProstoru(
      poznamka,
      tag
    )) {
      return;
    }

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

  if (!lokalniStitek) {
    syncedTags = syncedTags.map(
      (aktualniTag) =>
      aktualniTag.id === tag.id ?
      {
        ...aktualniTag,
        name: novyNazev
      } :
      aktualniTag
    );
  }
  
  renderTagFilters();
  requestAnimationFrame(renderTasks);

  if (!lokalniStitek) {
    obnovStitkyNaPozadi();
  }
  
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

  const lokalniStitek = jeLokalniStitek(tag);

  if (!lokalniStitek) {
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
  }
  
  const poznamky = loadTask();
  const zmenenePoznamky = [];
  
  poznamky.forEach((poznamka) => {
    /* PATCH 591: mažeme štítek jen z poznámek stejného prostoru. */
    if (!patriPoznamkaKeStitkuPodleProstoru(
      poznamka,
      tag
    )) {
      return;
    }

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
  
  const puvodniStitky = syncedTags.slice();

  syncedTags = syncedTags.filter(
    (aktualniTag) => aktualniTag.id !== tag.id
  );

  if (
    lokalniStitek &&
    !ulozLokalniStitkyZPameti(user.id)
  ) {
    syncedTags = puvodniStitky;
    return false;
  }
  
  renderTagFilters();
  requestAnimationFrame(renderTasks);

  if (!lokalniStitek) {
    obnovStitkyNaPozadi();
  }
  
  return true;
}

function getAllTags() {
  /*
   * PATCH 591: horní lišta i editor berou legacy názvy jen z právě
   * aktivního prostoru. Stejnojmenný cloud/LOCAL štítek se tak nemíchá.
   */
  const lokalniProstor = jeAktivniLokalniProstorStitku();
  const noteTags = loadTask()
    .filter((task) =>
      jeLokalniPoznamkaProStitky(task) === lokalniProstor
    )
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


/* PATCH 683AC – vlastní výběr barvy LubaNote pro mobil i PC.
 * Pouze vrstva UI: zapisuje přes stávající zmenBarvuStitku (LOCAL/SYNC).
 * Žádný nativní input[type=color], žádné průběžné zápisy do DB.
 */
function lubaHslNaHex683AC(h, s, l) {
  h = (((Number(h) % 360) + 360) % 360) / 360;
  s = Math.max(0, Math.min(100, Number(s))) / 100;
  l = Math.max(0, Math.min(100, Number(l))) / 100;
  const a = s * Math.min(l, 1 - l);
  const kanal = (n) => {
    const k = (n + h * 12) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return "#" + [kanal(0), kanal(8), kanal(4)]
    .map((n) => n.toString(16).padStart(2, "0")).join("");
}

function lubaHexNaHsl683AC(hex) {
  if (!jeVlastniBarvaStitku683AB(hex)) return [185, 76, 47];
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = rgb;
  const maxi = Math.max(...rgb), mini = Math.min(...rgb);
  const delta = maxi - mini;
  let h = 0, s = 0;
  const l = (maxi + mini) / 2;
  if (delta > 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    switch (maxi) {
      case r: h = ((g - b) / delta) % 6; break;
      case g: h = (b - r) / delta + 2; break;
      default: h = (r - g) / delta + 4;
    }
    h = (h * 60 + 360) % 360;
  }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}

function otevriVyberBarvyStitku683AC(tag, priVyberu = null) {
  // Při dalším otevření nikdy nezůstane staré dialogové okno.
  document.querySelector(".lubaTagColorOverlay683AC")?.remove();
  const puvodni = jeVlastniBarvaStitku683AB(tag.color)
    ? tag.color : (podkladStitku683AB(tag.color) || "#19b7c8");
  let [h, s, l] = lubaHexNaHsl683AC(puvodni);
  let zmenenoUzivatelem = false;
  // Při barvě z předvolené palety se UI otevře v jejím odstínu.
  const overlay = document.createElement("div");
  overlay.className = "lubaTagColorOverlay683AC";
  overlay.setAttribute("role", "presentation");
  const dialog = document.createElement("section");
  dialog.className = "lubaTagColorDialog683AC";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  const nadpisId = "lubaTagColorTitle683AC";
  dialog.setAttribute("aria-labelledby", nadpisId);

  const hlavicka = document.createElement("div");
  hlavicka.className = "lubaTagColorHeader683AC";
  const titulek = document.createElement("h2");
  titulek.id = nadpisId;
  titulek.textContent = tagsT("tags.colorPickerTitle", "Vlastní barva");
  const zavrit = document.createElement("button");
  zavrit.type = "button";
  zavrit.className = "lubaTagColorClose683AC";
  zavrit.textContent = "×";
  zavrit.setAttribute("aria-label", tagsT("tags.colorPickerCancel", "Zrušit"));
  hlavicka.append(titulek, zavrit);

  const nahledBox = document.createElement("div");
  nahledBox.className = "lubaTagColorPreview683AC";
  const barevny = document.createElement("div");
  barevny.className = "lubaTagColorSample683AC";
  barevny.textContent = tag.name;
  const hexHodnota = document.createElement("span");
  hexHodnota.className = "lubaTagColorHex683AC";
  nahledBox.append(barevny, hexHodnota);

  const controls = document.createElement("div");
  controls.className = "lubaTagColorControls683AC";
  const range = (key, fallback, max, value) => {
    const box = document.createElement("label");
    box.className = "lubaTagColorControl683AC";
    const popis = document.createElement("span");
    popis.textContent = tagsT(key, fallback);
    const ovladac = document.createElement("input");
    ovladac.type = "range";
    ovladac.min = "0";
    ovladac.max = String(max);
    ovladac.step = "1";
    ovladac.value = String(value);
    ovladac.setAttribute("aria-label", popis.textContent);
    box.append(popis, ovladac);
    controls.append(box);
    return ovladac;
  };
  const odstin = range("tags.colorPickerHue", "Odstín", 359, h);
  const sytost = range("tags.colorPickerSaturation", "Sytost", 100, s);
  const svetlost = range("tags.colorPickerLightness", "Světlost", 100, l);

  const paticka = document.createElement("div");
  paticka.className = "lubaTagColorFooter683AC";
  const zrusit = document.createElement("button");
  zrusit.type = "button";
  zrusit.className = "lubaTagColorCancel683AC";
  zrusit.textContent = tagsT("tags.colorPickerCancel", "Zrušit");
  const potvrdit = document.createElement("button");
  potvrdit.type = "button";
  potvrdit.className = "lubaTagColorSave683AC";
  potvrdit.textContent = tagsT("tags.colorPickerSave", "Nastavit");
  paticka.append(zrusit, potvrdit);
  dialog.append(hlavicka, nahledBox, controls, paticka);
  overlay.append(dialog);
  document.body.append(overlay);

  function obnovNahled() {
    h = Number(odstin.value);
    s = Number(sytost.value);
    l = Number(svetlost.value);
    const barva = zmenenoUzivatelem
      ? lubaHslNaHex683AC(h, s, l) : puvodni;
    barevny.style.backgroundColor = barva;
    barevny.style.color = barvaTextuStitku683AB(barva);
    hexHodnota.textContent = barva.toUpperCase();
    odstin.style.background = "linear-gradient(to right, #ff4a4a, #ffdf50, #48df68, #43dbe9, #547bff, #bf50ff, #ff4a75)";
    sytost.style.background = `linear-gradient(to right, hsl(${h}, 0%, ${l}%), hsl(${h}, 100%, ${l}%))`;
    svetlost.style.background = `linear-gradient(to right, #000000, hsl(${h}, ${s}%, 50%), #ffffff)`;
  }
  [odstin, sytost, svetlost].forEach((input) => {
    input.addEventListener("input", () => {
      zmenenoUzivatelem = true;
      obnovNahled();
    });
  });
  obnovNahled();

  let uklada = false;
  const puvodniFocus = document.activeElement;
  function zavri() {
    if (uklada) return;
    overlay.remove();
    document.removeEventListener("keydown", escapeHandler);
    if (puvodniFocus?.isConnected) {
      try { puvodniFocus.focus({ preventScroll: true }); } catch (_) {}
    }
  }
  function escapeHandler(event) {
    if (event.key === "Escape") { event.preventDefault(); zavri(); }
  }
  document.addEventListener("keydown", escapeHandler);
  zavrit.addEventListener("click", zavri);
  zrusit.addEventListener("click", zavri);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) zavri();
  });
  potvrdit.addEventListener("click", async () => {
    if (uklada) return;
    const nova = zmenenoUzivatelem
      ? lubaHslNaHex683AC(h, s, l) : puvodni;
    if (!jeVlastniBarvaStitku683AB(nova)) return;
    uklada = true;
    potvrdit.disabled = true;
    potvrdit.textContent = tagsT("tags.savingShort", "Ukládám…");
    let ulozeno = false;
    try {
      ulozeno = typeof priVyberu === "function"
        ? await priVyberu(nova)
        : await zmenBarvuStitku(tag, nova);
    }
    finally {
      uklada = false;
      potvrdit.disabled = false;
      potvrdit.textContent = tagsT("tags.colorPickerSave", "Nastavit");
    }
    if (ulozeno) {
      zavri();
      if (typeof priVyberu !== "function") vykresliSpravuStitku();
    }
  });
  // Vynecháme automatické otevření klávesnice v APK.
}


/* 683AE – osm pevných ID, ale odstíny vznikají z aktuálního motivu.
   Výběr vlastní barvy před vytvořením NIKDY nezapisuje do databáze. */
const BARVY_PALETY_STITKU_683AE = [
  "cervena", "oranzova", "zluta", "zelena",
  "tyrkysova", "modra", "fialova", "ruzova"
];
let barvaProNovyStitek683AE = "system";

function popisOdstinu683AE(index) {
  return tagsT("tags.shadeNumber", "Odstín {number}", {number: index + 1});
}

function aplikujNahledVlastnihoTlacitka683AE(tlacitko, barva) {
  if (!tlacitko) return;
  const pozadi = podkladStitku683AB(barva);
  tlacitko.dataset.lubaPreviewColor683ae = String(barva || "system");
  if (pozadi) {
    tlacitko.style.setProperty("--luba-preview-color-683AE", pozadi);
    tlacitko.style.setProperty("--luba-preview-text-683AE", barvaTextuStitku683AB(pozadi));
  } else {
    tlacitko.style.removeProperty("--luba-preview-color-683AE");
    const accent = getComputedStyle(document.body).getPropertyValue("--color-accent").trim();
    tlacitko.style.setProperty("--luba-preview-text-683AE", /^#[0-9a-fA-F]{6}$/.test(accent)
      ? barvaTextuStitku683AB(accent) : "#ffffff");
  }
}

function vytvorTlacitkoVlastniBarvy683AE(barva, onClick) {
  const tlacitko = document.createElement("button");
  tlacitko.type = "button";
  tlacitko.className = "manageTagCustomColorButton";
  tlacitko.setAttribute("aria-label", tagsT("tags.customColor", "Vlastní barva"));
  tlacitko.title = tagsT("tags.customColor", "Vlastní barva");
  const plus = document.createElement("span");
  plus.className = "manageTagCustomPlus";
  plus.textContent = "+";
  plus.setAttribute("aria-hidden", "true");
  const napis = document.createElement("span");
  napis.textContent = tagsT("tags.customColorShort", "Vlastní");
  tlacitko.append(plus, napis);
  aplikujNahledVlastnihoTlacitka683AE(tlacitko, barva);
  tlacitko.addEventListener("click", onClick);
  return tlacitko;
}

function obnovPaletuNovehoStitku683AE() {
  const paleta = document.getElementById("newTagColorPalette683AE");
  if (!paleta) return;
  const title = document.getElementById("newTagColorTitle683AE");
  if (title) title.textContent = tagsT("tags.chooseColor", "Barva štítku");
  paleta.replaceChildren();
  const vlastni = vytvorTlacitkoVlastniBarvy683AE(barvaProNovyStitek683AE, () => {
    const jmeno = String(newTagModalInput?.value || "").trim() || tagsT("tags.new", "Nový štítek");
    otevriVyberBarvyStitku683AC({name:jmeno, color:barvaProNovyStitek683AE}, async (barva) => {
      barvaProNovyStitek683AE = barva;
      obnovPaletuNovehoStitku683AE();
      return true;
    });
  });
  paleta.append(vlastni);
  BARVY_PALETY_STITKU_683AE.forEach((barva, index) => {
    const volba = document.createElement("button");
    volba.type = "button";
    volba.className = "manageTagColorOption";
    volba.dataset.tagColor = barva;
    volba.dataset.lubaChosen = String(barvaProNovyStitek683AE === barva);
    const popis = popisOdstinu683AE(index);
    volba.title = popis;
    volba.setAttribute("aria-label", popis);
    volba.setAttribute("aria-pressed", String(barvaProNovyStitek683AE === barva));
    volba.addEventListener("click", () => {
      barvaProNovyStitek683AE = barva;
      obnovPaletuNovehoStitku683AE();
    });
    paleta.append(volba);
  });
}

function otevriBarevnyVyberNovehoStitku683AE() {
  barvaProNovyStitek683AE = "system";
  obnovPaletuNovehoStitku683AE();
}

function ziskejBarvuNovehoStitku683AE() {
  const barva = String(barvaProNovyStitek683AE || "system");
  return BARVY_PALETY_STITKU_683AE.includes(barva) || jeVlastniBarvaStitku683AB(barva)
    ? barva : "system";
}

/* PATCH 683AB – barvy štítků a čitelný kontrast.
 * Vlastní barva se ukládá do stejného pole color jako předvolené odstíny.
 * Nepoužívat neověřené CSS řetězce, jen přesný formát #RRGGBB.
 */
const LUBA_BARVY_STITKU_683AB = new Set([
  "cervena", "oranzova", "zluta", "zelena",
  "tyrkysova", "modra", "fialova", "ruzova"
]);

function jeVlastniBarvaStitku683AB(barva) {
  return /^#[0-9a-fA-F]{6}$/.test(String(barva || ""));
}

function podkladStitku683AB(barva) {
  const hodnota = String(barva || "");
  if (jeVlastniBarvaStitku683AB(hodnota)) {
    return hodnota;
  }
  if (!LUBA_BARVY_STITKU_683AB.has(hodnota)) {
    return null;
  }
  const styl = getComputedStyle(document.body || document.documentElement);
  const zTematu = styl.getPropertyValue(`--card-${hodnota}`).trim();
  return /^#[0-9a-fA-F]{6}$/.test(zTematu) ? zTematu : null;
}

function barvaTextuStitku683AB(pozadi) {
  if (!/^#[0-9a-fA-F]{6}$/.test(String(pozadi || ""))) return "";
  const kanal = (pozice) => {
    const hodnota = parseInt(pozadi.slice(pozice, pozice + 2), 16) / 255;
    return hodnota <= 0.04045
      ? hodnota / 12.92
      : Math.pow((hodnota + 0.055) / 1.055, 2.4);
  };
  const jas = 0.2126 * kanal(1) + 0.7152 * kanal(3) + 0.0722 * kanal(5);
  // WCAG: větší kontrast má černý text od hodnoty luminance ~0.179.
  return jas > 0.179 ? "#000000" : "#ffffff";
}

/* 696O – KONTRAST STAVOVÝCH IKON KARET (V1)
 * Barva nadpisu již používá WCAG kontrast k barvě karty (683AB).
 * Ikony dosud používaly barvy motivu, které na vlastních světlých
 * kartách mizely. Neodbarvovat je plošně na černou/bílou: zachovat
 * rozlišení žluté hvězdy/zvonku, připínáčku a ostatních stavů.
 * Nejmenší potřebná změna odstínu směrem k černé nebo bílé nastaví
 * kontrast >= 4,5 : 1 (malá 16px ikona, tenký připínáček 5,5).
 * Výchozí barvy jsou stejné
 * jako u dosavadních CSS pravidel; upravují se jen podle podkladu.
 */
function lubaKanalyBarvy696O(barva) {
  const hodnota = String(barva || "").trim();
  const hex = /^#([0-9a-fA-F]{6})$/.exec(hodnota);
  if (hex) return [0, 2, 4].map(i => parseInt(hex[1].slice(i, i + 2), 16));
  const kratka = /^#([0-9a-fA-F]{3})$/.exec(hodnota);
  if (kratka) return [...kratka[1]].map(c => parseInt(c + c, 16));
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(?:1(?:\.0+)?|0?\.\d+))?\s*\)$/i.exec(hodnota);
  if (rgb) {
    const v = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
    return v.every(n => n <= 255) ? v : null;
  }
  return null;
}
function lubaLuminance696O(rgb) {
  const lin = rgb.map(c => {
    const x = c / 255;
    return x <= .04045 ? x / 12.92 : Math.pow((x + .055) / 1.055, 2.4);
  });
  return .2126 * lin[0] + .7152 * lin[1] + .0722 * lin[2];
}
function lubaKontrast696O(a, b) {
  const aa = lubaLuminance696O(a), bb = lubaLuminance696O(b);
  return (Math.max(aa, bb) + .05) / (Math.min(aa, bb) + .05);
}
function lubaHex696O(rgb) {
  return '#' + rgb.map(n => Math.round(n).toString(16).padStart(2, '0')).join('');
}
function lubaMix696O(a, b, podilA) {
  const v1 = lubaKanalyBarvy696O(a), v2 = lubaKanalyBarvy696O(b);
  if (!v1 || !v2) return a;
  return lubaHex696O(v1.map((n, i) => n * podilA + v2[i] * (1 - podilA)));
}
function lubaBarvaKontrastniIkony696O(vychozi, podklad, minKontrast = 4.5) {
  const barva = lubaKanalyBarvy696O(vychozi);
  const pozadi = lubaKanalyBarvy696O(podklad);
  if (!barva || !pozadi) return vychozi;
  if (lubaKontrast696O(barva, pozadi) >= minKontrast) return lubaHex696O(barva);

  // Stejná světlá/tmavá logika, kterou již používá text štítku.
  // Minimální přimíchání černé/bílé zachová barevný charakter ikony.
  const smer = lubaLuminance696O(pozadi) > .179 ? 0 : 255;
  let lo = 0, hi = 1;
  for (let i = 0; i < 15; i++) {
    const mid = (lo + hi) / 2;
    const upravena = barva.map(c => c * (1 - mid) + smer * mid);
    if (lubaKontrast696O(upravena, pozadi) >= minKontrast) hi = mid;
    else lo = mid;
  }
  // Zaokrouhlení kanálů může kontrast nepatrně snížit.
  const podil = Math.min(1, hi + .012);
  return lubaHex696O(barva.map(c => c * (1 - podil) + smer * podil));
}
/* 696Q – rychlý kontrast ikon: společná paleta na motiv a barvu karty.
 * Jediné CSS pravidlo na typ ikony (nikoliv desítky pravidel na barvy karet).
 * Žádné getComputedStyle v renderovací smyčce a žádné zápisy SVG ikon.
 */
const lubaTridyIkon696Q = [
  "taskCardIconPin", "taskCardIconFavorite", "taskCardIconSharing",
  "taskCardIconSecret", "taskCardIconArea", "taskCardIconReminder",
  "taskCardIconRepeat"
];
const lubaCachePalet696Q = new Map();
let lubaMotivIkon696Q = "";
let lubaStylIkon696Q = null;
let lubaPodkladyMotivu696Q = null;
let lubaVychoziIkony696Q = null;
function lubaKlicMotivuIkon696Q() {
  const telo=document.body,html=document.documentElement;
  const nazvy=node=>Array.from(node?.classList||[]).filter(n=>n.startsWith("theme-")).sort().join(".");
  return [nazvy(telo),nazvy(html),telo?.getAttribute("data-theme")||"",html?.getAttribute("data-theme")||""].join("|");
}
function lubaBezpecnaBarvaIkon696Q(v) {
  const s=String(v||"system");
  return s==="system"||LUBA_BARVY_STITKU_683AB.has(s)||jeVlastniBarvaStitku683AB(s)?s:"system";
}
function lubaPripravKontrastIkonKaret696Q(noveBarvy=[]) {
  if(!lubaStylIkon696Q) {
    lubaStylIkon696Q=document.createElement("style");
    lubaStylIkon696Q.id="lubaKontrastIkon696Q";
    lubaStylIkon696Q.textContent=lubaTridyIkon696Q.map(cls=>
      `.taskCard .${cls}{color:var(--luba-icon-${cls}-696Q,inherit);}`).join("\n");
    document.head.appendChild(lubaStylIkon696Q);
  }
  const motiv=lubaKlicMotivuIkon696Q();
  if(motiv!==lubaMotivIkon696Q || !lubaPodkladyMotivu696Q) {
    lubaMotivIkon696Q=motiv;
    lubaCachePalet696Q.clear();
    const styl=getComputedStyle(document.body||document.documentElement);
    const prom=k=>styl.getPropertyValue(k).trim();
    const platna=(v,nahrada)=>lubaKanalyBarvy696O(v)?v:nahrada;
    const akcentText=platna(prom("--color-accent-text"),"#4c7f99");
    const akcent=platna(prom("--color-accent"),"#2c96ad");
    const sekundarni=platna(prom("--color-text-secondary"),"#6e8896");
    lubaPodkladyMotivu696Q=Object.create(null);
    for(const barva of LUBA_BARVY_STITKU_683AB) {
      const p=prom(`--card-${barva}`);
      if(/^#[0-9a-fA-F]{6}$/.test(p))lubaPodkladyMotivu696Q[barva]=p;
    }
    lubaPodkladyMotivu696Q.system=platna(prom("--color-surface"),"#ffffff");
    lubaVychoziIkony696Q={
      taskCardIconPin:lubaMix696O(akcentText,"#ff537b",.68),
      taskCardIconFavorite:"#ddb12b",
      taskCardIconSharing:akcentText,
      taskCardIconSecret:akcentText,
      taskCardIconArea:lubaMix696O(sekundarni,akcent,.76),
      taskCardIconReminder:"#dca72d",
      taskCardIconRepeat:akcentText
    };
  }
  for(const puvodni of noveBarvy) {
    const barva=lubaBezpecnaBarvaIkon696Q(puvodni);
    if(lubaCachePalet696Q.has(barva))continue;
    const bg=jeVlastniBarvaStitku683AB(barva)?barva:lubaPodkladyMotivu696Q[barva];
    if(!lubaKanalyBarvy696O(bg))continue;
    const paleta=Object.create(null);
    for(const cls of lubaTridyIkon696Q) {
      paleta[cls]=lubaBarvaKontrastniIkony696O(
        lubaVychoziIkony696Q[cls],bg,cls==="taskCardIconPin"?5.5:4.5);
    }
    lubaCachePalet696Q.set(barva,paleta);
  }
}
function aplikujKontrastIkonKarty696O(karta,barvaKarty="system") {
  if(!karta)return;
  const barva=lubaBezpecnaBarvaIkon696Q(barvaKarty);
  if(!lubaCachePalet696Q.has(barva)||lubaKlicMotivuIkon696Q()!==lubaMotivIkon696Q)
    lubaPripravKontrastIkonKaret696Q([barva]);
  const paleta=lubaCachePalet696Q.get(barva);
  if(!paleta)return;
  // Karta je při renderTasks ještě mimo DOM. Práce = pouze sedm rychlých
  // CSS proměnných na hostiteli, žádné jednotlivé ikony ani čtení layoutu.
  for(const cls of lubaTridyIkon696Q) {
    const key=`--luba-icon-${cls}-696Q`;
    if(karta.style.getPropertyValue(key)!==paleta[cls])
      karta.style.setProperty(key,paleta[cls]);
  }
}

function aplikujKontrastStitku683AB(prvek, barva, karta = false) {
  if (!prvek) return;
  const pozadi = podkladStitku683AB(barva);
  if (!pozadi) return;
  if (jeVlastniBarvaStitku683AB(barva)) {
    if (karta) {
      prvek.style.setProperty("--luba-card-bg", pozadi);
    } else {
      prvek.style.setProperty("background-color", pozadi);
    }
  }
  const barvaTextu = barvaTextuStitku683AB(pozadi);
  if (karta) {
    prvek.style.setProperty("--luba-tag-text-683AB", barvaTextu);
    // 683AD: čip uvnitř barevné karty potřebuje vlastní čitelný podklad.
    // U světlé karty použij bílý nádech, u tmavé černý;
    // samotný text čipu vždy zdědí ověřený kontrast karty.
    prvek.style.setProperty("--luba-tag-chip-tint-683AD",
      barvaTextu === "#ffffff" ? "#000000" : "#ffffff");
    prvek.dataset.lubaTagContrast = "card";
    aplikujKontrastIkonKarty696O(prvek, barva);
  } else {
    prvek.style.setProperty("color", barvaTextu, "important");
  }
}

function obnovKontrastStitkuPoTematu683AB() {
  lubaPripravKontrastIkonKaret696Q();
  document.querySelectorAll(".categoryTab[data-tag-color], .tagOptions button[data-tag-color], .manageTagColorButton[data-tag-color]")
    .forEach((prvek) => aplikujKontrastStitku683AB(prvek, prvek.dataset.tagColor));
  document.querySelectorAll(".taskCard[data-barva-karty]")
    .forEach((prvek) => aplikujKontrastStitku683AB(prvek, prvek.dataset.barvaKarty, true));
  // 696Q: systémové karty mají kontrast v sedmi CSS proměnných na kartě,
  // přepočítat při změně motivu (ne během běžného renderTasks).
  document.querySelectorAll(".taskCard:not([data-barva-karty])")
    .forEach(prvek=>aplikujKontrastIkonKarty696O(prvek,"system"));
  document.querySelectorAll(".manageTagCustomColorButton[data-luba-preview-color683ae]")
    .forEach((prvek) => aplikujNahledVlastnihoTlacitka683AE(prvek, prvek.dataset.lubaPreviewColor683ae));
  // Tlačítka vytváření jsou navázána na motiv, bez natvrdo fialové barvy.
  const accent = getComputedStyle(document.body).getPropertyValue("--color-accent").trim();
  const naAkcentu = /^#[0-9a-fA-F]{6}$/.test(accent)
    ? barvaTextuStitku683AB(accent) : "#ffffff";
  document.body.style.setProperty("--luba-on-accent-683AE", naAkcentu);
}

(function hlidejKontrastStitkuPriZmeneTematu683AB() {
  if (!document.body || typeof MutationObserver !== "function") return;
  let ceka = false;
  const naplanuj = () => {
    if (ceka) return;
    ceka = true;
    requestAnimationFrame(() => {
      ceka = false;
      obnovKontrastStitkuPoTematu683AB();
    });
  };
  const observer = new MutationObserver(naplanuj);
  observer.observe(document.body, {attributes: true, attributeFilter: ["class", "data-theme"]});
  observer.observe(document.documentElement, {attributes: true, attributeFilter: ["class", "data-theme"]});
})();

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
  /* 696W – původní výchozí názvy nesmějí zůstávat ve výběru
   * poté, co je uživatel přejmenuje nebo smaže.
   * Skutečné štítky jsou v syncedTags (getAllTags) a poznámkách.
   */
  return [...new Set([
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

  /* PATCH 591: Secret LOCAL editor čte pouze šifrovaný device registr. */
  if (jeAktivniLokalniProstorStitku()) {
    await aplikujLokalniStitkyDoPameti({
      prekreslit: false
    });

    return syncedTags
      .filter((tag) =>
        tag.is_secret === true &&
        Boolean(String(tag.name || "").trim())
      )
      .map((tag) => String(tag.name).trim());
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
    aplikujKontrastStitku683AB(button, button.dataset.tagColor);

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
    /* PATCH 658BU – Oblast v editorovém toolbaru se po každém přepnutí
     * skládá znovu přes nastavJenIkonu(). Tím vznikal nový hostitel pouze
     * s třídou editorBottomSvgIcon, zatímco 658BS/658BT velikost a barvu
     * záměrně řídí přes .lubaActionIcon. Proto kufr/domeček jako jediné
     * zůstávaly malé a bílé. Přidáním stejné základní třídy se zapojí do
     * existujícího editorového stylu bez zásahu do ikon jinde v aplikaci. */
    window.LubaNoteIcons.nastavJenIkonu(
      categoryTaskButton,
      activeArea === "work" ? "prace" : "soukrome",
      ["lubaActionIcon", "editorBottomSvgIcon"]
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

function taskMatchesHidden(task) {
  const jeSkryta = Boolean(task?.hiddenAt);

  /*
   * PATCH 539 – Skryté je mezisklad, ne slepá ulička pro Search.
   * - oko Skryté: zobrazujeme pouze skryté karty,
   * - aktivní uživatelský Search: prohledává i skryté karty,
   * - bez Search: skryté z běžného seznamu dál vůbec neukazujeme.
   *
   * Secret/oblast/štítky se filtrují samostatně dál v renderTasks(),
   * takže tato výjimka neobchází žádnou bezpečnostní vrstvu.
   */
  if (hiddenFilterActive) {
    return jeSkryta;
  }

  if (window.LubaNoteSearch?.jeAktivniDotaz?.()) {
    return true;
  }

  return !jeSkryta;
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
        tagsT("secret.unlockMode", "Odemknout tajný režim")
      );
    } else {
      secretUnlockTitle.textContent =
        tagsT("secret.unlockMode", "Odemknout tajný režim");
    }
    
    secretUnlockDescription.textContent =
      tagsT("secret.enterMain", "Zadej hlavní heslo.");
    
    secretUnlockConfirmInput.hidden = true;
    
    if (window.LubaNoteIcons?.nastavObsahSIkonou) {
      window.LubaNoteIcons.nastavObsahSIkonou(
        confirmSecretUnlockButton,
        "odemceno",
        tagsT("secret.unlock", "Odemknout")
      );
    } else {
      confirmSecretUnlockButton.textContent =
        tagsT("secret.unlock", "Odemknout");
    }
  } else {
    if (window.LubaNoteIcons?.nastavObsahSIkonou) {
      window.LubaNoteIcons.nastavObsahSIkonou(
        secretUnlockTitle,
        "zamek",
        tagsT("secret.createMainTitle", "Vytvořit hlavní heslo")
      );
    } else {
      secretUnlockTitle.textContent =
        tagsT("secret.createMainTitle", "Vytvořit hlavní heslo");
    }
    
    secretUnlockDescription.textContent =
      tagsT("secret.createMainForNotes", "Vytvoř hlavní heslo pro tajné poznámky.");
    
    secretUnlockConfirmInput.hidden = false;
    
    if (window.LubaNoteIcons?.nastavObsahSIkonou) {
      window.LubaNoteIcons.nastavObsahSIkonou(
        confirmSecretUnlockButton,
        "zamek",
        tagsT("secret.createPassword", "Vytvořit heslo")
      );
    } else {
      confirmSecretUnlockButton.textContent =
        tagsT("secret.createPassword", "Vytvořit heslo");
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
    aplikujKontrastStitku683AB(button, button.dataset.tagColor);

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
    otevriBarevnyVyberNovehoStitku683AE();
    /* FIX 532 – modal se otevírá bez focusu/klávesnice. Uživatel ji otevře až tapem do pole. */
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
      tagsT("editor.tags", "Štítky"),
      tagsT("tags.maxTwo", "Poznámka může mít maximálně 2 štítky. Nejdřív jeden odeber.")
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
      tagsT("editor.tags", "Štítky"),
      tagsT("tags.newSaveFailed", "Nový štítek se nepodařilo uložit.")
    );
    return null;
  }

  /* PATCH 591: inline vytvoření štítku v LOCAL editoru nesmí do cloudu. */
  if (jeAktivniLokalniProstorStitku()) {
    const lokalniStitek = await vytvorLokalniStitek(
      novyNazev,
      { userId: user.id }
    );

    if (!lokalniStitek) {
      zobrazZpravuAplikace(
        tagsT("editor.tags", "Štítky"),
        tagsT("tags.newLocalSaveFailed", "Nový lokální štítek se nepodařilo uložit.")
      );
      return null;
    }

    const ulozenyNazev = lokalniStitek.name || novyNazev;
    posledniStitekVytvorenyVEditoru = ulozenyNazev;
    return ulozenyNazev;
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
      tagsT("editor.tags", "Štítky"),
      tagsT("tags.newSaveFailedConnection", "Nový štítek se nepodařilo uložit. Zkontroluj připojení a zkus to znovu.")
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
        tagsT("editor.tags", "Štítky"),
        tagsT("tags.maxTwo", "Poznámka může mít maximálně 2 štítky. Nejdřív jeden odeber.")
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
      tagsT("tags.saving", "Ukládám štítek…"),
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
    vypniFiltrSkrytych();

    const vybranaOblast =
      button.dataset.areaFilter || "all";

    /*
     * PATCH 548 – Home / Work fungují jako přepínače.
     * Druhý klik na právě aktivní oblast vrátí hlavní seznam na Vše.
     * Tlačítko Vše samotné zůstává idempotentní.
     */
    activeAreaFilter =
      vybranaOblast !== "all" &&
      activeAreaFilter === vybranaOblast
        ? "all"
        : vybranaOblast;

    /*
     * PATCH 541 – Home / Work / Vše jsou hlavní oblasti.
     * Přepnutí oblasti vždy ukončí předchozí filtrování běžným štítkem.
     */
    activeTagFilter = null;

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

tagModalTitle?.addEventListener("pointerdown", closeTagMenu);
tagModalEditorHost?.addEventListener("pointerdown", closeTagMenu);

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
      tagsT("editor.tags", "Štítky"),
      tagsT("tags.maxTwo", "Poznámka může mít maximálně 2 štítky. Nejdřív jeden odeber.")
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
      tagsT("secret.tags", "Tajné štítky"),
      tagsT("tags.longPressWorks", "Dlouhý stisk funguje.")
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
    otevriBarevnyVyberNovehoStitku683AE();
    /* FIX 532 – modal se otevírá bez focusu/klávesnice. Uživatel ji otevře až tapem do pole. */
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
      tagsT("tags.assignedMany", "Štítek „{name}“ přiřazen {count} kartám", {
        name: vybranyStitek,
        count: pocetOznacenych
      })
    );
    
    return;
  }
  
  
  /* Normální filtrování štítků */
  vypniFiltrSkrytych();
  activeTagFilter =
    activeTagFilter === vybranyStitek ?
    null :
    vybranyStitek;
  
  updateTagFilterUI();
  
  renderTasks();

  /* 693P: Zmena vlastniho stitku = nova sada karet, zacni od zacatku.
   * 693H pro presun do Kose zustava beze zmeny a tam pozici zachovava. */
  const seznamKaret693P = document.querySelector(".app");
  if (seznamKaret693P) {
    seznamKaret693P.scrollTop = 0;
    requestAnimationFrame(() => {
      if (seznamKaret693P.isConnected) seznamKaret693P.scrollTop = 0;
    });
  }
  
});

updateTagMenuUI();
renderTagFilters();

// ==========================================
// TAJNÉ ŠTÍTKY – VYTVOŘENÍ
// Uloží nový štítek do Supabase
// s příznakem is_secret = true.
// ==========================================

async function vytvorTajnyStitek(nazev, barva = "system") {
  const user = await getCurrentUser();

  if (!user) {
    return false;
  }

  if (
    !tajnyRezimOdemceny ||
    !tajnySifrovaciKlic
  ) {
    zobrazZpravuAplikace(
      tagsT("secret.tags", "Tajné štítky"),
      tagsT("tags.unlockFirst", "Nejdřív odemkni tajný režim.")
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
      tagsT("secret.tags", "Tajné štítky"),
      tagsT("tags.duplicate", "Štítek s tímto názvem už existuje.")
    );

    return false;
  }

  /*
   * PATCH 591: Secret LOCAL štítek ukládáme pouze do device registru.
   * Plaintext název se do localStorage nedostane; registr drží pouze
   * AES-GCM encrypted_name + technické ID.
   */
  if (jeAktivniLokalniProstorStitku()) {
    const lokalniStitek = await vytvorLokalniStitek(
      novyNazev,
      { tajny: true, userId: user.id, barva }
    );

    return Boolean(lokalniStitek);
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
      color: barva
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
  "lubanote:storage-scope-change",
  () => {
    /*
     * PATCH 591: každý prostor má vlastní seznam štítků. Filtr ani
     * rozpracovaný výběr štítků se mezi ☁️ a 📱 nepřenáší.
     */
    activeTagFilter = null;
    activeTags = [];
    posledniStitekVytvorenyVEditoru = "";

    /* Nedovolíme ani krátké promíchání seznamu mezi prostory. */
    syncedTags = [];
    if (typeof renderTagFilters === "function") {
      renderTagFilters();
    }

    Promise.resolve(loadTagsFromSupabase())
      .catch((error) => {
        console.warn(
          "Přepnutí registru štítků podle úložiště selhalo:",
          error
        );
      });
  }
);

window.addEventListener(
  "lubanote:language-change",
  () => {
    if (typeof renderTagFilters === "function") {
      renderTagFilters();
    }
  }
);
