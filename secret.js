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
  secretFilterButton.hidden = false;

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

