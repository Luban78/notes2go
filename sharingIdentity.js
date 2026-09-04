/* ============================================================
   LubaNote – S2A SHARING IDENTITY CLIENT V1
   ------------------------------------------------------------
   - zobrazuje @username v Nastavení
   - umožní @username nastavit / změnit
   - používá pouze bezpečné serverové RPC ze S1A
   - e-mail se nikde nezveřejňuje
   - offline pouze zobrazí poslední lokálně známý @username
   - nemění sync, editor ani sdílené poznámky
============================================================ */

(() => {
  const CACHE_PREFIX = "lubanoteSharingProfileV1:";
  const LOCAL_OWNER_KEY = "lubanoteLocalOwnerUserId";

  let aktualniUserId = null;
  let aktualniUsername = null;
  let modal = null;
  let modalInput = null;
  let modalChyba = null;
  let modalPotvrdit = null;
  let hodnotaUsername = null;

  function t(klic, zaloha) {
    return window.LubaNoteI18n?.t?.(klic, zaloha) || zaloha;
  }

  function normalizujUsername(hodnota) {
    return String(hodnota || "")
      .trim()
      .replace(/^@+/, "");
  }

  function platnyUsername(hodnota) {
    return /^[A-Za-z0-9_.-]{3,30}$/.test(
      normalizujUsername(hodnota)
    );
  }

  function zjistiUserId() {
    return aktualniUserId ||
      localStorage.getItem(LOCAL_OWNER_KEY) ||
      null;
  }

  function cacheKey(userId = zjistiUserId()) {
    return userId ? `${CACHE_PREFIX}${userId}` : null;
  }

  function nactiCache() {
    const klic = cacheKey();

    if (!klic) {
      return null;
    }

    try {
      const raw = localStorage.getItem(klic);
      const data = raw ? JSON.parse(raw) : null;

      if (!data || data.userId !== zjistiUserId()) {
        return null;
      }

      return {
        userId: data.userId,
        username: normalizujUsername(data.username) || null
      };
    } catch (error) {
      console.warn("Sdílení: cache profilu se nepodařilo načíst.", error);
      return null;
    }
  }

  function ulozCache(username) {
    const userId = zjistiUserId();
    const klic = cacheKey(userId);

    if (!userId || !klic) {
      return;
    }

    try {
      localStorage.setItem(
        klic,
        JSON.stringify({
          userId,
          username: normalizujUsername(username) || null,
          updatedAt: new Date().toISOString()
        })
      );
    } catch (error) {
      console.warn("Sdílení: cache profilu se nepodařilo uložit.", error);
    }
  }

  function ziskejUsernameZRpc(data) {
    if (!data) {
      return null;
    }

    if (Array.isArray(data)) {
      return ziskejUsernameZRpc(data[0]);
    }

    if (typeof data === "string") {
      return normalizujUsername(data) || null;
    }

    if (typeof data !== "object") {
      return null;
    }

    const kandidat =
      data.username ??
      data.user_name ??
      data.profile?.username ??
      data.profil?.username ??
      null;

    return normalizujUsername(kandidat) || null;
  }

  async function zajistiSupabase() {
    if (typeof supabaseClient !== "undefined" && supabaseClient) {
      return supabaseClient;
    }

    if (typeof pripravSupabaseClient === "function") {
      const pripraven = await pripravSupabaseClient();

      if (pripraven && typeof supabaseClient !== "undefined") {
        return supabaseClient;
      }
    }

    return null;
  }

  function nastavUsernameDoUi(username) {
    aktualniUsername = normalizujUsername(username) || null;

    if (!hodnotaUsername) {
      return;
    }

    hodnotaUsername.textContent = aktualniUsername
      ? `@${aktualniUsername}`
      : t("sharing.usernameUnset", "Nastavit");

    hodnotaUsername.classList.toggle(
      "sharingUsernameUnset",
      !aktualniUsername
    );
  }

  function nastavChybu(text = "") {
    if (!modalChyba) {
      return;
    }

    modalChyba.textContent = text;
    modalChyba.hidden = !text;
  }

  function vytvorNastaveni() {
    if (document.getElementById("sharingIdentitySettingsSection")) {
      hodnotaUsername =
        document.getElementById("sharingUsernameValue");
      return;
    }

    const dataSekce =
      document.getElementById("dataSettingsSection");

    if (!dataSekce) {
      return;
    }

    const sekce = document.createElement("section");
    sekce.id = "sharingIdentitySettingsSection";
    sekce.className = "settingsSection";

    const nadpis = document.createElement("h3");
    nadpis.id = "sharingIdentitySettingsTitle";

    const radek = document.createElement("div");
    radek.className = "themeSetting sharingIdentitySetting";

    const popisek = document.createElement("span");
    popisek.id = "sharingUsernameLabel";

    const tlacitko = document.createElement("button");
    tlacitko.id = "sharingUsernameButton";
    tlacitko.type = "button";
    tlacitko.className = "themeSelectButton sharingUsernameButton";

    hodnotaUsername = document.createElement("span");
    hodnotaUsername.id = "sharingUsernameValue";

    const sipka = document.createElement("span");
    sipka.className = "themeSelectArrow lubaActionIcon";
    sipka.dataset.lubaIcon = "sipkaVpravo";
    sipka.setAttribute("aria-hidden", "true");

    tlacitko.append(hodnotaUsername, sipka);
    radek.append(popisek, tlacitko);
    sekce.append(nadpis, radek);

    dataSekce.before(sekce);

    window.LubaNoteIcons?.naplnDeklarovaneIkony?.(sekce);

    tlacitko.addEventListener("click", otevriUsernameModal);

    aplikujPrekladyUi();

    const cache = nactiCache();
    nastavUsernameDoUi(cache?.username || null);
  }

  function vytvorModal() {
    if (modal) {
      return;
    }

    modal = document.createElement("div");
    modal.className = "sharingIdentityModal";
    modal.hidden = true;

    const karta = document.createElement("div");
    karta.className = "sharingIdentityCard";
    karta.setAttribute("role", "dialog");
    karta.setAttribute("aria-modal", "true");
    karta.setAttribute("aria-labelledby", "sharingIdentityModalTitle");

    const hlavicka = document.createElement("div");
    hlavicka.className = "sharingIdentityHeader";

    const nadpis = document.createElement("h3");
    nadpis.id = "sharingIdentityModalTitle";

    const zavrit = document.createElement("button");
    zavrit.type = "button";
    zavrit.className = "sharingIdentityClose lubaIconOnlyButton";
    zavrit.setAttribute("aria-label", "Zavřít");

    if (window.LubaNoteIcons?.nastavJenIkonu) {
      window.LubaNoteIcons.nastavJenIkonu(
        zavrit,
        "zavrit",
        ["sharingIdentityCloseIcon"]
      );
    } else {
      zavrit.textContent = "×";
    }

    hlavicka.append(nadpis, zavrit);

    const popis = document.createElement("p");
    popis.id = "sharingIdentityDescription";
    popis.className = "sharingIdentityDescription";

    const pole = document.createElement("label");
    pole.className = "sharingIdentityField";

    const prefix = document.createElement("span");
    prefix.className = "sharingIdentityPrefix";
    prefix.textContent = "@";

    modalInput = document.createElement("input");
    modalInput.id = "sharingIdentityInput";
    modalInput.type = "text";
    modalInput.maxLength = 30;
    modalInput.autocomplete = "off";
    modalInput.autocapitalize = "none";
    modalInput.spellcheck = false;

    pole.append(prefix, modalInput);

    modalChyba = document.createElement("p");
    modalChyba.className = "sharingIdentityError";
    modalChyba.setAttribute("role", "alert");
    modalChyba.hidden = true;

    const akce = document.createElement("div");
    akce.className = "sharingIdentityActions";

    const zrusit = document.createElement("button");
    zrusit.id = "sharingIdentityCancel";
    zrusit.type = "button";
    zrusit.className = "sharingIdentitySecondary";

    modalPotvrdit = document.createElement("button");
    modalPotvrdit.id = "sharingIdentitySave";
    modalPotvrdit.type = "button";
    modalPotvrdit.className = "sharingIdentityPrimary";

    akce.append(zrusit, modalPotvrdit);
    karta.append(hlavicka, popis, pole, modalChyba, akce);
    modal.append(karta);
    document.body.append(modal);

    zavrit.addEventListener("click", zavriUsernameModal);
    zrusit.addEventListener("click", zavriUsernameModal);
    modalPotvrdit.addEventListener("click", ulozUsername);

    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        zavriUsernameModal();
      }
    });

    modalInput.addEventListener("input", () => {
      modalInput.value = modalInput.value.replace(/^@+/, "");
      nastavChybu();
    });

    modalInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        ulozUsername();
      }
    });

    aplikujPrekladyUi();
  }

  function aplikujPrekladyUi() {
    const nadpisSekce =
      document.getElementById("sharingIdentitySettingsTitle");
    const label =
      document.getElementById("sharingUsernameLabel");
    const title =
      document.getElementById("sharingIdentityModalTitle");
    const description =
      document.getElementById("sharingIdentityDescription");
    const cancel =
      document.getElementById("sharingIdentityCancel");
    const save =
      document.getElementById("sharingIdentitySave");

    if (nadpisSekce) {
      nadpisSekce.textContent =
        t("sharing.settingsTitle", "Sdílení");
    }

    if (label) {
      label.textContent =
        t("sharing.usernameLabel", "Uživatelské jméno");
    }

    if (title) {
      title.textContent =
        t("sharing.usernameModalTitle", "Uživatelské jméno pro sdílení");
    }

    if (description) {
      description.textContent = t(
        "sharing.usernameDescription",
        "Ostatní tě najdou pouze přes přesné @username. Tvůj e-mail se při sdílení nezobrazuje."
      );
    }

    if (modalInput) {
      modalInput.placeholder =
        t("sharing.usernamePlaceholder", "např. Lubomir");
    }

    if (cancel) {
      cancel.textContent =
        t("sharing.usernameCancel", "Zrušit");
    }

    if (save) {
      save.textContent =
        t("sharing.usernameSave", "Uložit");
    }

    nastavUsernameDoUi(aktualniUsername);
  }

  function otevriUsernameModal() {
    vytvorModal();
    nastavChybu();

    modalInput.value = aktualniUsername || "";
    modal.hidden = false;

    requestAnimationFrame(() => {
      modalInput.focus();
      modalInput.select();
    });
  }

  function zavriUsernameModal() {
    if (!modal) {
      return;
    }

    modal.hidden = true;
    nastavChybu();
  }

  async function nactiProfil({ tichy = false } = {}) {
    const userId = zjistiUserId();

    if (!userId) {
      nastavUsernameDoUi(null);
      return null;
    }

    const cache = nactiCache();

    if (cache) {
      nastavUsernameDoUi(cache.username);
    }

    if (!navigator.onLine) {
      return cache;
    }

    try {
      const klient = await zajistiSupabase();

      if (!klient) {
        throw new Error("supabase_unavailable");
      }

      const { data, error } = await klient.rpc(
        "lubanote_get_my_profile"
      );

      if (error) {
        throw error;
      }

      const username = ziskejUsernameZRpc(data);
      nastavUsernameDoUi(username);
      ulozCache(username);

      return {
        userId,
        username
      };
    } catch (error) {
      if (!tichy) {
        console.error(
          "Sdílení: profil se nepodařilo načíst.",
          error
        );
      }

      return cache;
    }
  }

  function zpravaProChybuUsername(error) {
    const text = String(
      error?.message ||
      error?.details ||
      error?.hint ||
      ""
    ).toLowerCase();

    if (
      error?.code === "23505" ||
      text.includes("username_taken") ||
      text.includes("already exists") ||
      text.includes("duplicate") ||
      text.includes("unique")
    ) {
      return t(
        "sharing.usernameTaken",
        "Toto @username už používá někdo jiný."
      );
    }

    if (
      text.includes("invalid_username") ||
      text.includes("username_invalid")
    ) {
      return t(
        "sharing.usernameInvalid",
        "Použij 3–30 znaků: písmena, čísla, tečku, pomlčku nebo podtržítko."
      );
    }

    return t(
      "sharing.usernameSaveFailed",
      "Uživatelské jméno se nepodařilo uložit."
    );
  }

  async function ulozUsername() {
    if (!modalInput || !modalPotvrdit) {
      return;
    }

    const username = normalizujUsername(modalInput.value);

    if (!platnyUsername(username)) {
      nastavChybu(
        t(
          "sharing.usernameInvalid",
          "Použij 3–30 znaků: písmena, čísla, tečku, pomlčku nebo podtržítko."
        )
      );
      return;
    }

    if (!navigator.onLine) {
      nastavChybu(
        t(
          "sharing.usernameOffline",
          "Nastavení @username vyžaduje připojení k internetu."
        )
      );
      return;
    }

    modalPotvrdit.disabled = true;
    const puvodniText = modalPotvrdit.textContent;
    modalPotvrdit.textContent =
      t("sharing.usernameSaving", "Ukládám…");
    nastavChybu();

    try {
      const klient = await zajistiSupabase();

      if (!klient) {
        throw new Error("supabase_unavailable");
      }

      const { error } = await klient.rpc(
        "lubanote_set_my_username",
        {
          p_username: username
        }
      );

      if (error) {
        throw error;
      }

      /*
       * Nezávisíme na konkrétním return shape SET RPC.
       * Po úspěšném zápisu načteme profil z autoritativního GET RPC.
       */
      const profil = await nactiProfil({ tichy: false });

      if (!profil?.username) {
        throw new Error("username_not_returned_after_save");
      }

      zavriUsernameModal();
    } catch (error) {
      console.error(
        "Sdílení: @username se nepodařilo uložit.",
        error
      );

      nastavChybu(
        zpravaProChybuUsername(error)
      );
    } finally {
      modalPotvrdit.disabled = false;
      modalPotvrdit.textContent =
        puvodniText || t("sharing.usernameSave", "Uložit");
    }
  }

  function resetProJinyUcet() {
    aktualniUsername = null;
    nastavUsernameDoUi(null);
  }

  vytvorNastaveni();

  const cache = nactiCache();
  nastavUsernameDoUi(cache?.username || null);

  window.addEventListener(
    "lubanote:account-active",
    (event) => {
      const novyUserId = event.detail?.userId || null;

      if (novyUserId !== aktualniUserId) {
        aktualniUserId = novyUserId;
        resetProJinyUcet();
      }

      const profilCache = nactiCache();
      nastavUsernameDoUi(profilCache?.username || null);

      nactiProfil({ tichy: true });
    }
  );

  window.addEventListener(
    "lubanote:auth-expired",
    () => {
      aktualniUserId = null;
      resetProJinyUcet();
    }
  );

  window.addEventListener(
    "lubanote:language-change",
    aplikujPrekladyUi
  );

  window.addEventListener(
    "online",
    () => {
      if (zjistiUserId()) {
        nactiProfil({ tichy: true });
      }
    }
  );

  window.LubaNoteSharingIdentity = {
    nactiProfil,
    otevriUsernameModal,
    ziskejUsername: () => aktualniUsername
  };
})();
