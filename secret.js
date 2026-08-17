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
  const user = await getCurrentUser();

  if (!user) {
    return false;
  }

  const { data, error } = await supabaseClient
    .from("secret_settings")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error(
      "Kontrola tajného režimu se nepodařila:",
      error.message
    );

    return false;
  }

  return Boolean(data);
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

  return true;
}

// ==========================================
// TAJNÝ REŽIM – SKUTEČNÉ ODEMKNUTÍ
// Ze správného hesla vytvoří AES klíč,
// uloží ho pouze do paměti aplikace
// a zobrazí filtr tajných poznámek.
// ==========================================

async function odemkniTajnyRezimSifrovacimKlicem(heslo) {
  const user = await getCurrentUser();

  if (!user) {
    return false;
  }

  const { data, error } = await supabaseClient
    .from("secret_settings")
    .select("salt, kdf_iterations")
    .eq("user_id", user.id)
    .single();

  if (error) {
    console.error(
      "Načtení nastavení pro šifrovací klíč se nepodařilo:",
      error.message
    );

    return false;
  }

  tajnySifrovaciKlic =
    await vytvorSifrovaciKlicZHesla(
      heslo,
      data.salt,
      data.kdf_iterations
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

  confirmSecretUnlockButton.disabled = true;

  const uspesne =
    await vytvorNoveTajneNastaveni(heslo);

  confirmSecretUnlockButton.disabled = false;

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
    
    confirmSecretUnlockButton.disabled = true;
    
    const spravneHeslo =
      await overHlavniHeslo(heslo);
    
    confirmSecretUnlockButton.disabled = false;
    
    if (!spravneHeslo) {
      zobrazZpravuAplikace(
        "Tajný režim",
        "Hlavní heslo není správné."
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
    secretUnlockModal.hidden = true;

    zobrazZpravuAplikace(
      "Tajný režim",
      "Tajný režim je odemčený."
    );
  }
);

// ==========================================
// TAJNÝ REŽIM – OVĚŘENÍ HLAVNÍHO HESLA
// ==========================================

async function overHlavniHeslo(heslo) {
  const user = await getCurrentUser();

  if (!user) {
    return false;
  }

  const { data, error } = await supabaseClient
    .from("secret_settings")
    .select(
      "salt, verifier, kdf_iterations"
    )
    .eq("user_id", user.id)
    .single();

  if (error) {
    console.error(
      "Načtení tajného nastavení se nepodařilo:",
      error.message
    );

    return false;
  }

  const vypocitanyVerifier =
    await vytvorVerifierZHesla(
      heslo,
      data.salt,
      data.kdf_iterations
    );

  return vypocitanyVerifier === data.verifier;
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
