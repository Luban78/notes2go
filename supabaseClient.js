const SUPABASE_URL =
  "https://nwdacgigplofksexssws.supabase.co/";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_VQpvaA0VAOcSxLtTG8Zr5Q_USIiro0c";

/*
 * OFFLINE-FIRST START LUBANOTE
 * ----------------------------
 * Supabase je synchronizace, ne podmínka pro otevření aplikace.
 * Knihovna se proto načítá až tehdy, když je internet dostupný.
 * Při offline startu se už dříve přihlášenému uživateli okamžitě
 * zobrazí lokální data a synchronizace se zkusí po návratu internetu.
 */
const LUBANOTE_AUTH_OK_KEY = "lubanoteAuthOk";
const SUPABASE_PROJECT_REF = "nwdacgigplofksexssws";
const SUPABASE_AUTH_STORAGE_KEY =
  `sb-${SUPABASE_PROJECT_REF}-auth-token`;
const SUPABASE_LIBRARY_URL =
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.8/dist/umd/supabase.js";

let supabaseClient = null;
let nacitaniSupabaseKnihovny = null;

function sCasovymLimitem(promise, timeoutMs, popis) {
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new Error(`${popis} překročil časový limit.`)
      );
    }, timeoutMs);
  });

  return Promise.race([
    promise,
    timeoutPromise
  ]).finally(() => {
    clearTimeout(timeoutId);
  });
}

function existujePredchoziPrihlaseni() {
  if (
    localStorage.getItem(LUBANOTE_AUTH_OK_KEY) === "1"
  ) {
    return true;
  }

  /*
   * Přechod pro instalace vytvořené před zavedením
   * LUBANOTE_AUTH_OK_KEY. Supabase má svou session v localStorage.
   */
  return Boolean(
    localStorage.getItem(SUPABASE_AUTH_STORAGE_KEY)
  );
}

function oznacPredchoziPrihlaseni() {
  localStorage.setItem(
    LUBANOTE_AUTH_OK_KEY,
    "1"
  );
}

function zrusPredchoziPrihlaseni() {
  localStorage.removeItem(
    LUBANOTE_AUTH_OK_KEY
  );
}

function vytvorSupabaseClientPokudLze() {
  if (supabaseClient) {
    return true;
  }

  if (
    !window.supabase ||
    typeof window.supabase.createClient !== "function"
  ) {
    return false;
  }

  supabaseClient =
    window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false
        }
      }
    );

  window.dispatchEvent(
    new CustomEvent("lubanote:supabase-ready")
  );

  return true;
}

async function pripravSupabaseClient() {
  if (vytvorSupabaseClientPokudLze()) {
    return true;
  }

  if (!navigator.onLine) {
    return false;
  }

  if (nacitaniSupabaseKnihovny) {
    return nacitaniSupabaseKnihovny;
  }

  nacitaniSupabaseKnihovny =
    new Promise((resolve) => {
      const existujiciScript =
        document.getElementById("supabaseRuntimeScript");

      if (existujiciScript) {
        existujiciScript.remove();
      }

      const script =
        document.createElement("script");

      script.id = "supabaseRuntimeScript";
      script.src = SUPABASE_LIBRARY_URL;
      script.async = true;

      const timeoutId = setTimeout(() => {
        script.remove();
        resolve(false);
      }, 7000);

      script.addEventListener(
        "load",
        () => {
          clearTimeout(timeoutId);
          resolve(
            vytvorSupabaseClientPokudLze()
          );
        },
        { once: true }
      );

      script.addEventListener(
        "error",
        () => {
          clearTimeout(timeoutId);
          script.remove();
          resolve(false);
        },
        { once: true }
      );

      document.head.appendChild(script);
    }).finally(() => {
      nacitaniSupabaseKnihovny = null;
    });

  return nacitaniSupabaseKnihovny;
}

async function getCurrentUser() {
  if (!navigator.onLine) {
    return null;
  }

  const pripraven =
    await pripravSupabaseClient();

  if (!pripraven || !supabaseClient) {
    return null;
  }

  try {
    const {
      data: { user }
    } = await sCasovymLimitem(
      supabaseClient.auth.getUser(),
      5000,
      "Ověření uživatele"
    );

    return user || null;
  } catch (error) {
    console.warn(
      "User check skipped:",
      error.message
    );
    return null;
  }
}

const loginScreen =
  document.getElementById("loginScreen");

const loginForm =
  document.getElementById("loginForm");

const loginEmail =
  document.getElementById("loginEmail");

const loginPassword =
  document.getElementById("loginPassword");

const loginButton =
  document.getElementById("loginButton");

const loginMessage =
  document.getElementById("loginMessage");

function setLoginMessage(message = "", isError = false) {
  loginMessage.textContent = message;
  loginMessage.classList.toggle("error", isError);
}

function oznamPlatnePrihlaseni() {
  window.dispatchEvent(
    new CustomEvent("lubanote:auth-valid")
  );
}

function zobrazLokalniAplikaci() {
  loginScreen.hidden = true;

  /*
   * Po přihlášení skutečně deaktivujeme
   * credential inputy.
   *
   * Nestačí je pouze schovat přes hidden,
   * protože Chrome Password Manager je jinak
   * stále může považovat za aktivní login formulář.
   */
  loginForm.setAttribute("inert", "");

  loginEmail.disabled = true;
  loginPassword.disabled = true;

  loginEmail.removeAttribute("name");
  loginPassword.removeAttribute("name");

  loginEmail.setAttribute(
    "autocomplete",
    "off"
  );

  loginPassword.setAttribute(
    "autocomplete",
    "off"
  );

  loginPassword.value = "";

  document.body.classList.remove(
    "authPending"
  );
}





function zobrazPrihlaseni(
  message = "",
  isError = true
) {
  loginForm.removeAttribute("inert");

  loginEmail.disabled = false;
  loginPassword.disabled = false;

  loginEmail.name = "username";
  loginPassword.name = "password";

  loginEmail.setAttribute(
    "autocomplete",
    "username"
  );

  loginPassword.setAttribute(
    "autocomplete",
    "current-password"
  );
  loginScreen.hidden = false;
  document.body.classList.remove("authPending");

  if (message) {
    setLoginMessage(message, isError);
  }
}

async function overPrihlaseniOnline({
  zobrazitLoginPriNeuspechu = false
} = {}) {
  if (!navigator.onLine) {
    return false;
  }

  const pripraven =
    await pripravSupabaseClient();

  if (!pripraven || !supabaseClient) {
    if (zobrazitLoginPriNeuspechu) {
      zobrazPrihlaseni(
        "Nepodařilo se připojit k synchronizaci. Zkus to znovu po připojení k internetu."
      );
    }
    return false;
  }

  try {
    const {
      data: { session }
    } = await sCasovymLimitem(
      supabaseClient.auth.getSession(),
      5000,
      "Ověření přihlášení"
    );

    if (session) {
      oznacPredchoziPrihlaseni();
      setLoginMessage();
      zobrazLokalniAplikaci();



      if (
        typeof loadTagsFromSupabase === "function"
      ) {
        await loadTagsFromSupabase();
      }

      /* sync.js může při prvním načtení doběhnout dřív než
         obnovení Supabase session. Tato událost spustí druhý,
         už autentizovaný pokus a tím odstraní rozdíl mezi
         anonymním oknem a běžným dlouhodobým Chrome profilem. */
      oznamPlatnePrihlaseni();

      return true;
    }

    if (zobrazitLoginPriNeuspechu) {
      zobrazPrihlaseni();
    }

    return false;
  } catch (error) {
    console.warn(
      "Login session check skipped:",
      error.message
    );

    if (zobrazitLoginPriNeuspechu) {
      zobrazPrihlaseni(
        "Ověření přihlášení se nepodařilo."
      );
    }

    return false;
  }
}

async function updateLoginScreen() {
  const maPredchoziPrihlaseni =
    existujePredchoziPrihlaseni();

  /*
   * Klíčová offline-first větev:
   * dříve přihlášený uživatel dostane lokální aplikaci ihned.
   * Síťové ověření proběhne pouze na pozadí.
   */
  if (maPredchoziPrihlaseni) {
    zobrazLokalniAplikaci();

    if (navigator.onLine) {
      overPrihlaseniOnline({
        zobrazitLoginPriNeuspechu: false
      });
    }

    return;
  }

  if (!navigator.onLine) {
    zobrazPrihlaseni(
      "První přihlášení vyžaduje připojení k internetu."
    );
    return;
  }

  /* Ani při pomalém / nefunkčním internetu nezůstane černá obrazovka. */
  zobrazPrihlaseni(
    "Ověřuji přihlášení…",
    false
  );

  await overPrihlaseniOnline({
    zobrazitLoginPriNeuspechu: true
  });
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = loginEmail.value.trim();
  const password = loginPassword.value;

  if (!email || !password) {
    setLoginMessage("Vyplň e-mail i heslo.", true);
    return;
  }

  if (!navigator.onLine) {
    setLoginMessage(
      "Přihlášení vyžaduje internet. Lokální aplikace funguje offline až po prvním úspěšném přihlášení.",
      true
    );
    return;
  }

  loginButton.disabled = true;
  setLoginMessage("Přihlašuji…");

  try {
    const pripraven =
      await pripravSupabaseClient();

    if (!pripraven || !supabaseClient) {
      throw new Error(
        "Nepodařilo se načíst synchronizační službu."
      );
    }

    const { error } =
      await sCasovymLimitem(
        supabaseClient.auth.signInWithPassword({
          email,
          password
        }),
        12000,
        "Přihlášení"
      );

    if (error) {
      throw error;
    }

    oznacPredchoziPrihlaseni();
    loginPassword.value = "";
    setLoginMessage();
    zobrazLokalniAplikaci();

    if (
      typeof loadTagsFromSupabase === "function"
    ) {
      await loadTagsFromSupabase();
    }

    oznamPlatnePrihlaseni();

    if (
      typeof window.LubaNoteSync
        ?.spustBezpecne === "function"
    ) {
      window.LubaNoteSync.spustBezpecne();
    } else if (typeof syncNotes === "function") {
      syncNotes().catch((error) => {
        console.warn(
          "Initial sync skipped:",
          error
        );
      });
    }
  } catch (error) {
    setLoginMessage(
      "Přihlášení se nezdařilo. Zkontroluj e-mail, heslo a připojení.",
      true
    );
    console.error("Login error:", error);
  } finally {
    loginButton.disabled = false;
  }
});

window.LubaNoteSupabase = {
  pripravClient: pripravSupabaseClient,
  jePripraven: () => Boolean(supabaseClient),
  maPredchoziPrihlaseni:
    existujePredchoziPrihlaseni,
  zrusPredchoziPrihlaseni
};

window.addEventListener("online", () => {
  /*
   * Když se internet vrátí po offline startu,
   * načteme Supabase a obnovíme session bez restartu aplikace.
   */
  overPrihlaseniOnline({
    zobrazitLoginPriNeuspechu: false
  });
});

updateLoginScreen();
