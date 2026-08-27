// ==========================================
// TAJNÝ REŽIM LUBANOTE
// Heslo, šifrování, odemykání a auto-lock.
// Citlivá data se nesmí ukládat v plaintextu.
// ==========================================

// ==========================================
// TAJNÝ REŽIM – KONTROLA NASTAVENÍ
// Zjistí, jestli má přihlášený uživatel
// už vytvořené hlavní heslo.
// ==========================================

let tajnySifrovaciKlic = null;

/*
 * OFFLINE ODEMKNUTÍ TAJNÉHO REŽIMU
 * ---------------------------------
 * Hlavní heslo ani odvozený AES klíč se nikdy neukládají.
 * Lokálně uchováváme pouze stejné pomocné údaje, které jsou v
 * Supabase secret_settings: salt, verifier a počet KDF iterací.
 * Díky tomu lze správnost hesla ověřit a klíč odvodit i bez internetu.
 */
const SECRET_SETTINGS_CACHE_KEY =
  "lubanoteSecretSettingsV1";

const PENDING_SECRET_BACKUP_METADATA_KEY =
  "lubanotePendingSecretBackupMetadataV1";

function jePlatneTajneNastaveni(nastaveni) {
  return Boolean(
    nastaveni &&
    typeof nastaveni.salt === "string" &&
    nastaveni.salt.length > 0 &&
    typeof nastaveni.verifier === "string" &&
    nastaveni.verifier.length > 0 &&
    Number(nastaveni.kdf_iterations) > 0
  );
}

function nactiLokalniTajneNastaveni() {
  const raw = localStorage.getItem(
    SECRET_SETTINGS_CACHE_KEY
  );

  if (!raw) {
    return null;
  }

  try {
    const nastaveni = JSON.parse(raw);

    return jePlatneTajneNastaveni(nastaveni)
      ? nastaveni
      : null;
  } catch (error) {
    console.warn(
      "Lokální tajné nastavení je nečitelné:",
      error
    );
    return null;
  }
}

function ulozLokalniTajneNastaveni(
  nastaveni,
  userId = null
) {
  if (!jePlatneTajneNastaveni(nastaveni)) {
    return false;
  }

  localStorage.setItem(
    SECRET_SETTINGS_CACHE_KEY,
    JSON.stringify({
      userId:
        userId ||
        nastaveni.userId ||
        nastaveni.user_id ||
        null,
      salt: nastaveni.salt,
      verifier: nastaveni.verifier,
      kdf_iterations:
        Number(nastaveni.kdf_iterations)
    })
  );

  return true;
}


async function obnovTajneNastaveniZKompletniZalohy(
  nastaveni,
  user
) {
  if (
    !jePlatneTajneNastaveni(nastaveni) ||
    !user?.id ||
    !supabaseClient
  ) {
    return false;
  }

  const hodnoty = {
    salt: nastaveni.salt,
    verifier: nastaveni.verifier,
    kdf_iterations:
      Number(nastaveni.kdf_iterations)
  };

  const { data: existujici, error } =
    await supabaseClient
      .from("secret_settings")
      .select(
        "salt, verifier, kdf_iterations"
      )
      .eq("user_id", user.id)
      .maybeSingle();

  if (error) {
    console.error(
      "Kontrola tajného nastavení před obnovou selhala:",
      error.message
    );
    return false;
  }

  const nastaveniSeShoduje = Boolean(
    existujici &&
    existujici.salt === hodnoty.salt &&
    existujici.verifier ===
      hodnoty.verifier &&
    Number(existujici.kdf_iterations) ===
      hodnoty.kdf_iterations
  );

  if (existujici && !nastaveniSeShoduje) {
    console.error(
      "Tajné nastavení v účtu se liší od obnovované zálohy."
    );
    return false;
  }

  if (!existujici) {
    const { error: zapisError } =
      await supabaseClient
        .from("secret_settings")
        .insert({
          user_id: user.id,
          ...hodnoty
        });

    if (zapisError) {
      console.error(
        "Obnova tajného nastavení selhala:",
        zapisError.message
      );
      return false;
    }
  }

  return ulozLokalniTajneNastaveni(
    hodnoty,
    user.id
  );
}


async function zasifrujMetadataKompletniZalohy(
  metadata
) {
  if (!tajnySifrovaciKlic) {
    throw new Error(
      "Tajný režim musí být před kompletní zálohou odemčený."
    );
  }

  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(
    new Uint8Array(12)
  );

  const additionalData = encoder.encode(
    "LubaNote-complete-backup-metadata-v1"
  );

  const plaintext = encoder.encode(
    JSON.stringify(metadata || {})
  );

  const encrypted =
    await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData
      },
      tajnySifrovaciKlic,
      plaintext
    );

  return {
    version: 1,
    algorithm: "AES-GCM",
    iv: bytesToBase64(
      new Uint8Array(iv)
    ),
    ciphertext: bytesToBase64(
      new Uint8Array(encrypted)
    )
  };
}


async function desifrujMetadataKompletniZalohy(
  encryptedData
) {
  if (
    !tajnySifrovaciKlic ||
    encryptedData?.algorithm !== "AES-GCM" ||
    !encryptedData?.iv ||
    !encryptedData?.ciphertext
  ) {
    throw new Error(
      "Šifrovaná metadata zálohy nejsou dostupná."
    );
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const decrypted =
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: base64ToBytes(
          encryptedData.iv
        ),
        additionalData: encoder.encode(
          "LubaNote-complete-backup-metadata-v1"
        )
      },
      tajnySifrovaciKlic,
      base64ToBytes(
        encryptedData.ciphertext
      )
    );

  return JSON.parse(
    decoder.decode(decrypted)
  );
}


function ulozCekajiciTajnaMetadataZeZalohy(
  encryptedData,
  ownerUserId = null
) {
  if (!encryptedData) {
    localStorage.removeItem(
      PENDING_SECRET_BACKUP_METADATA_KEY
    );
    return;
  }

  localStorage.setItem(
    PENDING_SECRET_BACKUP_METADATA_KEY,
    JSON.stringify({
      ownerUserId,
      encryptedData
    })
  );
}


async function obnovCekajiciTajnaMetadataZeZalohy() {
  const raw = localStorage.getItem(
    PENDING_SECRET_BACKUP_METADATA_KEY
  );

  if (!raw || !tajnySifrovaciKlic) {
    return true;
  }

  try {
    const cekajici = JSON.parse(raw);
    const user = await getCurrentUser();

    if (!user?.id || !navigator.onLine) {
      return false;
    }

    if (
      cekajici.ownerUserId &&
      cekajici.ownerUserId !== user.id
    ) {
      throw new Error(
        "Tajná metadata patří jinému účtu."
      );
    }

    const metadata =
      await desifrujMetadataKompletniZalohy(
        cekajici.encryptedData
      );

    const stitky = Array.isArray(
      metadata?.tags
    )
      ? metadata.tags.map((stitek) => ({
          ...stitek,
          is_secret: true
        }))
      : [];

    if (
      typeof obnovStitkyZKompletniZalohy !==
      "function"
    ) {
      return false;
    }

    const obnoveno =
      await obnovStitkyZKompletniZalohy(
        stitky,
        user
      );

    if (!obnoveno) {
      return false;
    }

    localStorage.removeItem(
      PENDING_SECRET_BACKUP_METADATA_KEY
    );

    return true;
  } catch (error) {
    console.error(
      "Obnova tajných metadat ze zálohy selhala:",
      error
    );
    return false;
  }
}

function existujiLokalniTajnaData() {
  const sifrovane =
    typeof nactiSifrovaneTajneZaznamy === "function"
      ? nactiSifrovaneTajneZaznamy()
      : [];

  const legacy =
    typeof nactiStarePlaintextTajnePoznamky === "function"
      ? nactiStarePlaintextTajnePoznamky()
      : [];

  return sifrovane.length > 0 || legacy.length > 0;
}

async function nactiTajneNastaveniZCloudu() {
  if (!navigator.onLine) {
    return {
      stav: "offline",
      data: null
    };
  }

  try {
    const user = await getCurrentUser();

    if (!user || !supabaseClient) {
      return {
        stav: "nedostupne",
        data: null
      };
    }

    const dotaz = supabaseClient
      .from("secret_settings")
      .select(
        "salt, verifier, kdf_iterations"
      )
      .eq("user_id", user.id)
      .maybeSingle();

    const { data, error } =
      typeof sCasovymLimitem === "function"
        ? await sCasovymLimitem(
            dotaz,
            5000,
            "Načtení tajného nastavení"
          )
        : await dotaz;

    if (error) {
      console.warn(
        "Načtení tajného nastavení z cloudu se nepodařilo:",
        error.message
      );

      return {
        stav: "chyba",
        data: null
      };
    }

    if (!data) {
      const lokalni =
        nactiLokalniTajneNastaveni();

      /*
       * Pokud se na stejném zařízení přihlásí jiný účet, nesmí
       * zdědit offline verifier předchozího uživatele.
       */
      if (
        lokalni?.userId &&
        lokalni.userId !== user.id
      ) {
        localStorage.removeItem(
          SECRET_SETTINGS_CACHE_KEY
        );
      }

      return {
        stav: "nenastaveno",
        data: null
      };
    }

    const lokalniData = {
      userId: user.id,
      salt: data.salt,
      verifier: data.verifier,
      kdf_iterations:
        Number(data.kdf_iterations)
    };

    if (!jePlatneTajneNastaveni(lokalniData)) {
      return {
        stav: "chyba",
        data: null
      };
    }

    ulozLokalniTajneNastaveni(
      lokalniData,
      user.id
    );

    return {
      stav: "ok",
      data: lokalniData
    };
  } catch (error) {
    console.warn(
      "Načtení tajného nastavení z cloudu selhalo:",
      error?.message || error
    );

    return {
      stav: "chyba",
      data: null
    };
  }
}

async function ziskejTajneNastaveniProOdemknuti() {
  const lokalni =
    nactiLokalniTajneNastaveni();

  if (lokalni) {
    return lokalni;
  }

  const cloud =
    await nactiTajneNastaveniZCloudu();

  return cloud.stav === "ok"
    ? cloud.data
    : null;
}
async function vytvorSifrovaciKlicZHesla(
  heslo,
  saltBase64,
  iterace = 600000
) {
  const encoder = new TextEncoder();

  const puvodniSalt =
    Uint8Array.from(
      atob(saltBase64),
      (char) => char.charCodeAt(0)
    );

  const prefixSifrovani =
    encoder.encode(
      "LubaNote-encryption-v1"
    );

  const saltBytes =
    new Uint8Array(
      prefixSifrovani.length +
      puvodniSalt.length
    );

  saltBytes.set(prefixSifrovani, 0);

  saltBytes.set(
    puvodniSalt,
    prefixSifrovani.length
  );

  const keyMaterial =
    await crypto.subtle.importKey(
      "raw",
      encoder.encode(heslo),
      "PBKDF2",
      false,
      ["deriveKey"]
    );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: iterace,
      hash: "SHA-256"
    },
    keyMaterial,
    {
      name: "AES-GCM",
      length: 256
    },
    false,
    [
      "encrypt",
      "decrypt"
    ]
  );
}
let secretAutoLockTimer = null;

const SECRET_AUTO_LOCK_TIME = 5 * 60 * 1000;

//const SECRET_AUTO_LOCK_TIME =
 // 10 * 1000;
  
  function spustSecretAutoLock() {
  clearTimeout(secretAutoLockTimer);

  if (!tajnyRezimOdemceny) {
    return;
  }

  secretAutoLockTimer = setTimeout(() => {
    zamkniTajnyRezimAutomaticky();
  }, SECRET_AUTO_LOCK_TIME);
}


function resetSecretAutoLock() {
  if (!tajnyRezimOdemceny) {
    return;
  }

  spustSecretAutoLock();
}
function obnovObrazovkyPoZmeneTajnehoRezimu() {
  if (typeof renderTasks === "function") {
    renderTasks();
  }

  if (typeof renderRemindersScreen === "function") {
    renderRemindersScreen();
  }

  if (typeof renderCalendar === "function") {
    renderCalendar();
  }
}

async function zamkniTajnyRezim(automaticky = false) {
  /*
   * Rozpracovanou tajnou poznámku nejdřív bezpečně uložíme do
   * ciphertextu. Až potom odstraníme plaintext z DOM a zahodíme klíč.
   */
  let autoSaveResult = null;

  if (
    typeof ulozOtevrenouTajnouPoznamkuPredZamknutim === "function"
  ) {
    try {
      autoSaveResult =
        await ulozOtevrenouTajnouPoznamkuPredZamknutim();
    } catch (error) {
      console.error(
        "Uložení tajné poznámky před zamknutím se nepodařilo:",
        error
      );
    }
  }

  if (typeof zavriTajnyEditorPriZamknuti === "function") {
    zavriTajnyEditorPriZamknuti();
  }

  /*
   * Při zamknutí odstraníme i pomocná UI, která mohla zobrazovat
   * plaintext tajné poznámky mimo hlavní editor.
   */
  if (typeof closeReminderQuickMenu === "function") {
    closeReminderQuickMenu();
  }

  if (typeof closePlanner === "function") {
    closePlanner();
  }

  if (
    typeof vycistiVyhledavaniPoZamknutiTajnehoRezimu === "function"
  ) {
    vycistiVyhledavaniPoZamknutiTajnehoRezimu();
  }

  tajnySifrovaciKlic = null;
  tajnyRezimOdemceny = false;
  filtrTajnychPoznamekAktivni = false;

  if (typeof vycistiDesifrovaneTajnePoznamky === "function") {
    vycistiDesifrovaneTajnePoznamky();
  }

  secretFilterButton?.classList.remove("active");

  if (secretFilterButton) {
    secretFilterButton.hidden = true;
  }

  if (secretTaskButton) {
    secretTaskButton.hidden = true;
  }

  if (typeof secretMenuModal !== "undefined" && secretMenuModal) {
    secretMenuModal.hidden = true;
  }

  document.body.classList.remove("secretModeActive");

  clearTimeout(secretAutoLockTimer);
  secretAutoLockTimer = null;

  obnovObrazovkyPoZmeneTajnehoRezimu();

  /* Cloud upload už používá hotový ciphertext a nepotřebuje AES klíč. */
  if (
    autoSaveResult?.encryptedRecord &&
    typeof uploadEncryptedSecretRecordToSupabase === "function"
  ) {
    uploadEncryptedSecretRecordToSupabase(
      autoSaveResult.encryptedRecord
    );
  }

  zobrazZpravuAplikace(
    "Tajný režim",
    automaticky
      ? "Tajný režim byl automaticky zamčen."
      : "Tajný režim byl zamčen."
  );
}

function zamkniTajnyRezimAutomaticky() {
  zamkniTajnyRezim(true);
}

async function maNastaveneTajneHeslo() {
  /*
   * Jakmile máme lokální verifier, internet už pro rozhodnutí
   * „odemknout vs. vytvořit heslo“ nepotřebujeme.
   */
  if (nactiLokalniTajneNastaveni()) {
    return true;
  }

  /*
   * Starší instalace po aktualizaci ještě nemusí mít cache nastavení.
   * Pokud ale na zařízení existují tajná data, hlavní heslo evidentně
   * už existovalo. Nikdy proto offline nenabídneme vytvoření nového.
   */
  if (!navigator.onLine) {
    return existujiLokalniTajnaData();
  }

  const cloud =
    await nactiTajneNastaveniZCloudu();

  if (cloud.stav === "ok") {
    return true;
  }

  if (cloud.stav === "nenastaveno") {
    return false;
  }

  /* Při síťové chybě je bezpečnější předpokládat existující heslo. */
  return true;
}



// ==========================================
// TAJNÝ REŽIM – POMOCNÉ KRYPTografické FUNKCE
// ==========================================

function bytesToBase64(bytes) {
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary);
}


async function vytvorVerifierZHesla(
  heslo,
  saltBase64,
  iterace = 600000
) {
  const encoder = new TextEncoder();

  const puvodniSalt =
  Uint8Array.from(
    atob(saltBase64),
    (char) => char.charCodeAt(0)
  );

const prefixVerifieru =
  new TextEncoder().encode(
    "LubaNote-verifier-v1"
  );

const saltBytes =
  new Uint8Array(
    prefixVerifieru.length +
    puvodniSalt.length
  );

saltBytes.set(prefixVerifieru, 0);
saltBytes.set(
  puvodniSalt,
  prefixVerifieru.length
);

  const keyMaterial =
    await crypto.subtle.importKey(
      "raw",
      encoder.encode(heslo),
      "PBKDF2",
      false,
      ["deriveBits"]
    );

  const derivedBits =
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: saltBytes,
        iterations: iterace,
        hash: "SHA-256"
      },
      keyMaterial,
      256
    );

  return bytesToBase64(
    new Uint8Array(derivedBits)
  );
}


async function vytvorNoveTajneNastaveni(heslo) {
  const user = await getCurrentUser();

  if (!user) {
    return false;
  }

  const saltBytes =
    crypto.getRandomValues(
      new Uint8Array(16)
    );

  const salt =
    bytesToBase64(saltBytes);

  const iterace = 600000;

  const verifier =
    await vytvorVerifierZHesla(
      heslo,
      salt,
      iterace
    );

  const { error } = await supabaseClient
    .from("secret_settings")
    .insert({
      user_id: user.id,
      salt: salt,
      verifier: verifier,
      kdf_iterations: iterace
    });

  if (error) {
    console.error(
      "Vytvoření tajného nastavení se nepodařilo:",
      error.message
    );

    return false;
  }

  /*
   * Po prvním vytvoření uložíme jen salt + verifier + iterace.
   * Samotné heslo ani AES klíč se do úložiště nikdy nezapisují.
   */
  ulozLokalniTajneNastaveni(
    {
      salt,
      verifier,
      kdf_iterations: iterace
    },
    user.id
  );

  return true;
}

// ==========================================
// TAJNÝ REŽIM – SKUTEČNÉ ODEMKNUTÍ
// Ze správného hesla vytvoří AES klíč,
// uloží ho pouze do paměti aplikace
// a zobrazí filtr tajných poznámek.
// ==========================================

async function odemkniTajnyRezimSifrovacimKlicem(heslo) {
  const nastaveni =
    await ziskejTajneNastaveniProOdemknuti();

  if (!nastaveni) {
    console.error(
      "Tajné nastavení není dostupné pro odvození šifrovacího klíče."
    );
    return false;
  }

  tajnySifrovaciKlic =
    await vytvorSifrovaciKlicZHesla(
      heslo,
      nastaveni.salt,
      nastaveni.kdf_iterations
    );

  tajnyRezimOdemceny = true;
  spustSecretAutoLock();

  document.body.classList.add(
    "secretModeActive"
  );

  secretFilterButton.hidden = false;
  secretTaskButton.hidden = false;

  /* Nejdřív dešifrujeme lokální trezor pouze do paměti. */
  if (typeof nactiTajnePoznamkyZLocalStorage === "function") {
    await nactiTajnePoznamkyZLocalStorage();
  }

  /*
   * Potom stáhneme cloud. syncNotes umí tajné řádky držet šifrované
   * i při zamknutí a po odemknutí je bezpečně dešifruje do paměti.
   */
  if (typeof syncNotes === "function") {
    await syncNotes();
  } else {
    obnovObrazovkyPoZmeneTajnehoRezimu();
  }

  /*
   * Tajné názvy štítků jsou v kompletní záloze také zašifrované.
   * Obnovíme je až po úspěšném odvození klíče ze správného hesla.
   */
  await obnovCekajiciTajnaMetadataZeZalohy();

  /*
   * Po aktualizaci okamžitě uklidíme i případné starší systémové
   * notifikace tajných poznámek, které mohly vzniknout před zavedením
   * pravidla SECRET = absolutní ticho.
   */
  if (
    typeof zrusSystemoveNotifikaceTajnychPoznamek === "function"
  ) {
    await zrusSystemoveNotifikaceTajnychPoznamek();
  }

  return true;
}


// ==========================================
// TAJNÝ REŽIM – VYTVOŘENÍ HLAVNÍHO HESLA
// Zkontroluje obě hesla a uloží do Supabase
// pouze salt + verifier. Samotné heslo se
// nikam neukládá ani neposílá.
// ==========================================

async function vytvorHlavniHesloZModalu() {
  const heslo =
    secretUnlockInput.value;

  const potvrzeniHesla =
    secretUnlockConfirmInput.value;

  if (heslo.length < 8) {
    zobrazZpravuAplikace(
      "Tajný režim",
      "Hlavní heslo musí mít alespoň 8 znaků."
    );

    return;
  }

  if (heslo !== potvrzeniHesla) {
    zobrazZpravuAplikace(
      "Tajný režim",
      "Zadaná hesla se neshodují."
    );

    return;
  }

  const uspesne =
    await vytvorNoveTajneNastaveni(heslo);

  if (!uspesne) {
    zobrazZpravuAplikace(
      "Tajný režim",
      "Hlavní heslo se nepodařilo vytvořit."
    );

    return;
  }

  const odemceno =
    await odemkniTajnyRezimSifrovacimKlicem(heslo);

  if (!odemceno) {
    zobrazZpravuAplikace(
      "Tajný režim",
      "Tajný režim se nepodařilo odemknout."
    );

    return;
  }

  secretUnlockInput.value = "";
  secretUnlockConfirmInput.value = "";
  secretUnlockModal.hidden = true;

  zobrazZpravuAplikace(
    "Tajný režim",
    "Tajný režim je odemčený."
  );
}


confirmSecretUnlockButton?.addEventListener(
  "click",
  async () => {
    if (confirmSecretUnlockButton.disabled) {
      return;
    }

    const puvodniTextTlacitka =
      confirmSecretUnlockButton.textContent;

    confirmSecretUnlockButton.disabled = true;
    confirmSecretUnlockButton.textContent =
      "⏳ Pracuji…";

    const ukonciCekani =
      window.LubaNoteUI?.zacniCekaniAkce?.(
        "Odemykám tajný režim…",
        250
      ) || (() => {});

    try {
      const maHeslo =
        await maNastaveneTajneHeslo();

      if (!maHeslo) {
        await vytvorHlavniHesloZModalu();
        return;
      }

      const heslo =
        secretUnlockInput.value;

      if (!heslo) {
        zobrazZpravuAplikace(
          "Tajný režim",
          "Zadej hlavní heslo."
        );

        return;
      }

      const spravneHeslo =
        await overHlavniHeslo(heslo);

      if (spravneHeslo === null) {
        zobrazZpravuAplikace(
          "Tajný režim",
          "Offline odemknutí na tomto zařízení ještě není připravené. Připoj se jednou k internetu, otevři tajný režim a potom bude fungovat i bez připojení. Tvoje tajné poznámky nejsou smazané."
        );

        return;
      }

      if (!spravneHeslo) {
        zobrazZpravuAplikace(
          "Tajný režim",
          "Hlavní heslo není správné."
        );

        return;
      }

      const odemceno =
        await odemkniTajnyRezimSifrovacimKlicem(
          heslo
        );

      if (!odemceno) {
        zobrazZpravuAplikace(
          "Tajný režim",
          "Tajný režim se nepodařilo odemknout."
        );

        return;
      }

      secretUnlockInput.value = "";
      secretUnlockModal.hidden = true;

      zobrazZpravuAplikace(
        "Tajný režim",
        "Tajný režim je odemčený."
      );
    } catch (error) {
      console.error(
        "Odemknutí tajného režimu selhalo:",
        error
      );

      zobrazZpravuAplikace(
        "Tajný režim",
        "Tajný režim se nepodařilo odemknout."
      );
    } finally {
      ukonciCekani();
      confirmSecretUnlockButton.disabled = false;
      confirmSecretUnlockButton.textContent =
        puvodniTextTlacitka;
    }
  }
);

// ==========================================
// TAJNÝ REŽIM – OVĚŘENÍ HLAVNÍHO HESLA
// ==========================================

async function overHlavniHeslo(heslo) {
  let nastaveni =
    nactiLokalniTajneNastaveni();

  /*
   * Bez lokální cache ji při online provozu jednou stáhneme.
   * Po tomto úspěšném načtení už další odemykání funguje offline.
   */
  if (!nastaveni) {
    const cloud =
      await nactiTajneNastaveniZCloudu();

    if (cloud.stav !== "ok") {
      return null;
    }

    nastaveni = cloud.data;
  }

  let vypocitanyVerifier =
    await vytvorVerifierZHesla(
      heslo,
      nastaveni.salt,
      nastaveni.kdf_iterations
    );

  if (vypocitanyVerifier === nastaveni.verifier) {
    return true;
  }

  /*
   * Pokud se lokální nastavení někdy změní na jiném zařízení,
   * při online provozu ho jednou obnovíme, než prohlásíme heslo
   * za chybné. Offline zůstává výsledek čistě lokální.
   */
  if (navigator.onLine) {
    const cloud =
      await nactiTajneNastaveniZCloudu();

    if (cloud.stav === "ok") {
      nastaveni = cloud.data;

      vypocitanyVerifier =
        await vytvorVerifierZHesla(
          heslo,
          nastaveni.salt,
          nastaveni.kdf_iterations
        );

      return vypocitanyVerifier === nastaveni.verifier;
    }
  }

  return false;
}

async function pripravOfflineTajnyRezim() {
  if (!navigator.onLine) {
    return;
  }

  try {
    await nactiTajneNastaveniZCloudu();
  } catch (error) {
    console.warn(
      "Příprava offline tajného režimu byla přeskočena:",
      error
    );
  }
}

window.addEventListener(
  "online",
  pripravOfflineTajnyRezim
);

window.addEventListener(
  "online",
  () => {
    if (tajnyRezimOdemceny) {
      obnovCekajiciTajnaMetadataZeZalohy();
    }
  }
);

window.addEventListener(
  "lubanote:supabase-ready",
  pripravOfflineTajnyRezim
);

/* Při běžném online startu připravíme cache automaticky na pozadí. */
if (navigator.onLine) {
  setTimeout(
    pripravOfflineTajnyRezim,
    0
  );
}

[
  "pointerdown",
  "keydown",
  "touchstart"
].forEach((eventName) => {
  document.addEventListener(
    eventName,
    resetSecretAutoLock,
    {
      passive: true
    }
  );
});




// ==========================================
// TAJNÉ POZNÁMKY – AES-GCM ŠIFROVÁNÍ
// Citlivý obsah se šifruje ještě v zařízení.
// ==========================================

function base64ToBytes(base64) {
  return Uint8Array.from(
    atob(base64),
    (char) => char.charCodeAt(0)
  );
}


async function zasifrujTajnouPoznamku(poznamka) {
  if (!tajnySifrovaciKlic) {
    throw new Error(
      "Tajný režim není odemčený."
    );
  }

  if (!poznamka?.id) {
    throw new Error(
      "Poznámka nemá platné ID."
    );
  }

  const encoder = new TextEncoder();

  /*
   * Pro každé šifrování vytvoříme nový IV.
   * 12 bytů = 96 bitů.
   */
  const iv =
    crypto.getRandomValues(
      new Uint8Array(12)
    );

  /*
   * ID poznámky nevkládáme dovnitř ciphertextu
   * jako tajemství. Použijeme ho jako
   * autentizovaná doplňková data.
   */
  const additionalData =
    encoder.encode(
      `LubaNote-secret-note-v1:${poznamka.id}`
    );

  const plaintext =
    encoder.encode(
      JSON.stringify(poznamka)
    );

  const encrypted =
    await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData
      },
      tajnySifrovaciKlic,
      plaintext
    );

  return {
    version: 1,
    algorithm: "AES-GCM",
    iv: bytesToBase64(
      new Uint8Array(iv)
    ),
    ciphertext: bytesToBase64(
      new Uint8Array(encrypted)
    )
  };
}


async function desifrujTajnouPoznamku(
  encryptedData,
  noteId
) {
  if (!tajnySifrovaciKlic) {
    throw new Error(
      "Tajný režim není odemčený."
    );
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const iv =
    base64ToBytes(
      encryptedData.iv
    );

  const ciphertext =
    base64ToBytes(
      encryptedData.ciphertext
    );

  const additionalData =
    encoder.encode(
      `LubaNote-secret-note-v1:${noteId}`
    );

  const decrypted =
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData
      },
      tajnySifrovaciKlic,
      ciphertext
    );

  return JSON.parse(
    decoder.decode(decrypted)
  );
}
