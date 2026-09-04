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
const LUBANOTE_AUTH_BLOCKED_KEY = "lubanoteAuthBlocked";
const LUBANOTE_LOCAL_OWNER_KEY = "lubanoteLocalOwnerUserId";
const SUPABASE_PROJECT_REF = "nwdacgigplofksexssws";
const SUPABASE_AUTH_STORAGE_KEY =
  `sb-${SUPABASE_PROJECT_REF}-auth-token`;
const SUPABASE_LIBRARY_URL =
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.8/dist/umd/supabase.js";

/*
 * Do vydání s vlastní doménou používáme jako návrat po potvrzení
 * e-mailu veřejnou GitHub Pages adresu LubaNote. Nesmíme spoléhat
 * na obecnou Site URL Supabase, protože ta může skončit na kořeni
 * luban78.github.io místo /notes2go/.
 */
const LUBANOTE_AUTH_RETURN_PARAM =
  "lubanote_email_confirmed";

const LUBANOTE_AUTH_REDIRECT_URL =
  "https://luban78.github.io/notes2go/?lubanote_email_confirmed=1";

/*
 * Výsledek potvrzovacího e-mailu musíme rozlišit od skutečně
 * vypršelé Supabase session. Potvrzovací odkaz se může otevřít
 * v interním prohlížeči Gmailu / jiné e-mailové aplikace, kde
 * nejsou stejné auth údaje jako v původní kartě. Bez tohoto markeru
 * by LubaNote mohla chybně zobrazit hlášku o vypršené synchronizaci.
 */
function nactiAuthNavratZAdresy() {
  const url = new URL(window.location.href);
  const hash = String(url.hash || "");
  const hashParams = new URLSearchParams(
    hash.startsWith("#") ? hash.slice(1) : hash
  );

  const potvrzenyEmail =
    url.searchParams.get(LUBANOTE_AUTH_RETURN_PARAM) === "1";

  const errorCode = String(
    url.searchParams.get("error_code") ||
    hashParams.get("error_code") ||
    ""
  ).trim();

  const maAuthChybu = Boolean(
    url.searchParams.get("error") ||
    hashParams.get("error") ||
    errorCode
  );

  let zmenenaAdresa = false;

  if (url.searchParams.has(LUBANOTE_AUTH_RETURN_PARAM)) {
    url.searchParams.delete(LUBANOTE_AUTH_RETURN_PARAM);
    zmenenaAdresa = true;
  }

  /*
   * Pokud jde o náš návrat po potvrzení e-mailu, uživatele stejně
   * necháme znovu přihlásit heslem. Případný PKCE kód / auth tokeny
   * proto nesmí zůstat viset v adresním řádku ani historii.
   */
  if (potvrzenyEmail) {
    for (const klic of [
      "code",
      "token",
      "token_hash",
      "type",
      "access_token",
      "refresh_token",
      "expires_in",
      "expires_at",
      "token_type"
    ]) {
      if (url.searchParams.has(klic)) {
        url.searchParams.delete(klic);
        zmenenaAdresa = true;
      }
    }

    if (
      url.hash &&
      (
        hashParams.has("access_token") ||
        hashParams.has("refresh_token") ||
        hashParams.has("type")
      )
    ) {
      url.hash = "";
      zmenenaAdresa = true;
    }
  }

  for (const klic of [
    "error",
    "error_code",
    "error_description"
  ]) {
    if (url.searchParams.has(klic)) {
      url.searchParams.delete(klic);
      zmenenaAdresa = true;
    }
  }

  if (maAuthChybu && url.hash) {
    url.hash = "";
    zmenenaAdresa = true;
  }

  if (zmenenaAdresa) {
    window.history.replaceState(
      null,
      document.title,
      `${url.pathname}${url.search}${url.hash}`
    );
  }

  return {
    potvrzenyEmail,
    maAuthChybu,
    errorCode
  };
}

const lubanoteAuthNavrat = nactiAuthNavratZAdresy();

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
  /*
   * Pending / rejected / suspended účet nesmí použít offline-first
   * vstup do lokální aplikace jen proto, že Supabase drží session.
   */
  if (
    localStorage.getItem(LUBANOTE_AUTH_BLOCKED_KEY) === "1"
  ) {
    return false;
  }

  if (
    localStorage.getItem(LUBANOTE_AUTH_OK_KEY) === "1"
  ) {
    return true;
  }

  /*
   * Přechod pro instalace vytvořené před zavedením
   * LUBANOTE_AUTH_OK_KEY. Supabase má svou session v localStorage.
   * Nová registrace si vždy nastaví BLOCKED marker, takže tato
   * legacy větev pending účet nepropustí.
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
  localStorage.removeItem(
    LUBANOTE_AUTH_BLOCKED_KEY
  );
}

function oznacBlokovanePrihlaseni() {
  localStorage.removeItem(
    LUBANOTE_AUTH_OK_KEY
  );
  localStorage.setItem(
    LUBANOTE_AUTH_BLOCKED_KEY,
    "1"
  );
}

function zrusPredchoziPrihlaseni() {
  localStorage.removeItem(
    LUBANOTE_AUTH_OK_KEY
  );
  localStorage.removeItem(
    LUBANOTE_AUTH_BLOCKED_KEY
  );
}

function overNeboNastavVlastnikaLokalnichDat(userId) {
  const id = String(userId || "").trim();

  if (!id) {
    return false;
  }

  const ulozeny = String(
    localStorage.getItem(LUBANOTE_LOCAL_OWNER_KEY) || ""
  ).trim();

  if (!ulozeny) {
    localStorage.setItem(
      LUBANOTE_LOCAL_OWNER_KEY,
      id
    );
    return true;
  }

  return ulozeny === id;
}

function migrujVlastnikaZeStavajiciSession() {
  if (
    localStorage.getItem(LUBANOTE_AUTH_OK_KEY) !== "1" ||
    localStorage.getItem(LUBANOTE_LOCAL_OWNER_KEY)
  ) {
    return;
  }

  try {
    const raw = localStorage.getItem(
      SUPABASE_AUTH_STORAGE_KEY
    );

    if (!raw) {
      return;
    }

    const session = JSON.parse(raw);
    const userId = String(
      session?.user?.id ||
      session?.currentSession?.user?.id ||
      ""
    ).trim();

    if (userId) {
      localStorage.setItem(
        LUBANOTE_LOCAL_OWNER_KEY,
        userId
      );
    }
  } catch (error) {
    console.warn(
      "Migrace vlastníka lokálních dat byla přeskočena:",
      error
    );
  }
}

migrujVlastnikaZeStavajiciSession();

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
    /*
     * Při obnovené Supabase session po startu aplikace
     * může getUser() krátce vrátit null / selhat dřív, než
     * se dokončí obnova auth stavu. getSession() ale už v tu
     * chvíli obsahuje lokálně obnoveného uživatele.
     *
     * Právě to způsobovalo, že GIPA i čerstvě spuštěná APK
     * po restartu nenačetly štítky ani nespustily sync, ale
     * po odhlášení a novém přihlášení vše fungovalo.
     */
    const {
      data: { session }
    } = await sCasovymLimitem(
      supabaseClient.auth.getSession(),
      5000,
      "Načtení přihlášené session"
    );

    if (session?.user) {
      return session.user;
    }

    /*
     * Fallback pro čerstvé přihlášení / neobvyklý stav.
     */
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

const loginModeSwitch =
  document.getElementById("loginModeSwitch");

const loginModeSignIn =
  document.getElementById("loginModeSignIn");

const loginModeRegister =
  document.getElementById("loginModeRegister");

const loginTitle =
  document.getElementById("loginTitle");

const loginCredentialsFields =
  document.getElementById("loginCredentialsFields");

const loginEmail =
  document.getElementById("loginEmail");

const loginPassword =
  document.getElementById("loginPassword");

const loginPasswordConfirm =
  document.getElementById("loginPasswordConfirm");

const loginButton =
  document.getElementById("loginButton");

const loginMessage =
  document.getElementById("loginMessage");

const accountStatusPanel =
  document.getElementById("accountStatusPanel");

const accountStatusText =
  document.getElementById("accountStatusText");

const accountStatusRefresh =
  document.getElementById("accountStatusRefresh");

const accountStatusSignOut =
  document.getElementById("accountStatusSignOut");

let aktualniRezimAuth = "login";
let aktualniStavUctu = null;

function tAuth(klic, zaloha = "") {
  return window.LubaNoteI18n?.t?.(klic, zaloha) || zaloha || klic;
}

function setLoginMessage(message = "", isError = false) {
  delete loginMessage.dataset.i18nKey;
  loginMessage.dataset.i18nSource = message;
  loginMessage.textContent =
    window.LubaNoteI18n?.prelozText?.(message) || message;
  loginMessage.classList.toggle("error", isError);
}

function setLoginMessageKey(
  klic,
  zaloha,
  isError = false
) {
  loginMessage.dataset.i18nKey = klic;
  loginMessage.dataset.i18nSource = "";
  loginMessage.textContent = tAuth(klic, zaloha);
  loginMessage.classList.toggle("error", isError);
}

function oznamPlatnePrihlaseni() {
  window.dispatchEvent(
    new CustomEvent("lubanote:auth-valid")
  );
}

function oznamSplashPripravenyBezCloudovehoStartu() {
  window.dispatchEvent(
    new CustomEvent("lubanote:splash-ready")
  );
}

function nastavRezimAuth(
  rezim,
  { zachovatZpravu = false } = {}
) {
  aktualniRezimAuth =
    rezim === "register" ? "register" : "login";

  const registrace = aktualniRezimAuth === "register";

  loginModeSignIn.classList.toggle("active", !registrace);
  loginModeRegister.classList.toggle("active", registrace);

  loginModeSignIn.setAttribute(
    "aria-selected",
    String(!registrace)
  );
  loginModeRegister.setAttribute(
    "aria-selected",
    String(registrace)
  );

  loginPasswordConfirm.hidden = !registrace;
  loginPasswordConfirm.disabled = !registrace;

  loginEmail.name = registrace ? "email" : "username";
  loginPassword.name = registrace
    ? "new-password"
    : "password";

  loginEmail.setAttribute(
    "autocomplete",
    registrace ? "email" : "username"
  );

  loginPassword.setAttribute(
    "autocomplete",
    registrace ? "new-password" : "current-password"
  );

  loginPasswordConfirm.setAttribute(
    "autocomplete",
    "new-password"
  );

  if (!registrace) {
    loginPasswordConfirm.value = "";
  }

  aktualizujAuthTexty();

  if (!zachovatZpravu) {
    setLoginMessage();
  }
}

function textStavuUctu(stav) {
  switch (stav?.account_status) {
    case "pending":
      return {
        title: tAuth(
          "login.pendingTitle",
          "Účet čeká na schválení"
        ),
        text: tAuth(
          "login.pendingText",
          "Registrace je hotová. Až správce účet schválí, LubaNote se odemkne."
        )
      };

    case "rejected":
      return {
        title: tAuth(
          "login.rejectedTitle",
          "Registrace nebyla schválena"
        ),
        text: tAuth(
          "login.rejectedText",
          "Tento účet nebyl schválen."
        )
      };

    case "suspended":
      return {
        title: tAuth(
          "login.suspendedTitle",
          "Účet je pozastavený"
        ),
        text: tAuth(
          "login.suspendedText",
          "Přístup k LubaNote je dočasně pozastavený."
        )
      };

    default:
      return {
        title: tAuth(
          "login.unavailableTitle",
          "Účet není dostupný"
        ),
        text: tAuth(
          "login.unavailableText",
          "Přístup k účtu se nepodařilo ověřit. Zkus kontrolu znovu."
        )
      };
  }
}

function aktualizujAuthTexty() {
  if (!accountStatusPanel.hidden && aktualniStavUctu) {
    const texty = textStavuUctu(aktualniStavUctu);
    loginTitle.textContent = texty.title;
    accountStatusText.textContent = texty.text;
    return;
  }

  const registrace = aktualniRezimAuth === "register";

  loginTitle.textContent = registrace
    ? tAuth("login.registerTitle", "Registrace")
    : tAuth("login.title", "Přihlášení");

  loginButton.textContent = registrace
    ? tAuth("login.registerSubmit", "Registrovat")
    : tAuth("login.submit", "Přihlásit se");
}

function zobrazLokalniAplikaci() {
  loginScreen.hidden = true;

  /*
   * Důležité pro Chrome Password Manager:
   * po přihlášení login formulář nejen skryjeme,
   * ale úplně ho odpojíme z aktivního DOM.
   * Reference i event listenery zůstávají zachované
   * a při odhlášení ho zase vložíme zpět.
   */
  loginForm.setAttribute("inert", "");
  loginEmail.disabled = true;
  loginPassword.disabled = true;
  loginPasswordConfirm.disabled = true;
  loginPassword.value = "";
  loginPasswordConfirm.value = "";

  if (loginForm.isConnected) {
    loginForm.remove();
  }

  document.body.classList.remove(
    "authPending"
  );
}

function pripravLoginFormular() {
  /*
   * PRIVACY LOCK:
   * Lokální poznámky zůstávají po odhlášení uložené kvůli offline-first
   * režimu, ale při loginu nesmí být ani na jediný frame viditelné.
   * Třídu odstraní výhradně zobrazLokalniAplikaci() po povolení účtu.
   */
  document.body.classList.add("authPending");

  if (!loginForm.isConnected) {
    loginScreen.append(loginForm);
  }

  loginForm.removeAttribute("inert");
  loginEmail.disabled = false;
  loginPassword.disabled = false;

  loginModeSwitch.hidden = false;
  loginCredentialsFields.hidden = false;
  accountStatusPanel.hidden = true;
  aktualniStavUctu = null;

  loginScreen.hidden = false;
}

function zobrazPrihlaseni(
  message = "",
  isError = true
) {
  pripravLoginFormular();
  nastavRezimAuth("login", {
    zachovatZpravu: true
  });

  if (message) {
    setLoginMessage(message, isError);
  } else {
    setLoginMessage();
  }
}

function zobrazStavUctu(stav) {
  /* Stejný privacy lock platí i pro pending/rejected/suspended obrazovku. */
  document.body.classList.add("authPending");

  if (!loginForm.isConnected) {
    loginScreen.append(loginForm);
  }

  loginForm.removeAttribute("inert");
  loginScreen.hidden = false;

  loginModeSwitch.hidden = true;
  loginCredentialsFields.hidden = true;
  accountStatusPanel.hidden = false;

  aktualniStavUctu = stav || {
    account_status: "unavailable"
  };

  setLoginMessage();
  aktualizujAuthTexty();
}

function zobrazVyprselePrihlaseni() {
  window.dispatchEvent(
    new CustomEvent("lubanote:auth-expired")
  );

  zobrazPrihlaseni(
    "Přihlášení vypršelo. Přihlas se znovu, aby mohla pokračovat synchronizace. Tvoje lokální data zůstala zachována.",
    true
  );
}

async function nactiStavPristupu() {
  const {
    data,
    error
  } = await sCasovymLimitem(
    supabaseClient.rpc("lubanote_get_my_access"),
    7000,
    "Ověření stavu účtu"
  );

  if (error) {
    throw error;
  }

  return data || {
    ok: false,
    reason: "access_not_configured"
  };
}

async function odhlasPoKonfliktuVlastnika() {
  try {
    await supabaseClient.auth.signOut();
  } catch (error) {
    console.warn(
      "Sign-out after local owner mismatch skipped:",
      error
    );
  }

  zrusPredchoziPrihlaseni();
  zobrazPrihlaseni();
  setLoginMessageKey(
    "login.localOwnerMismatch",
    "Toto zařízení obsahuje lokální data jiného LubaNote účtu. Kvůli bezpečnosti se účty na stejné instalaci nesmí míchat.",
    true
  );
  oznamSplashPripravenyBezCloudovehoStartu();
}

async function povolAktivniUcet(
  user,
  { spustitSync = true } = {}
) {
  if (
    !overNeboNastavVlastnikaLokalnichDat(user?.id)
  ) {
    await odhlasPoKonfliktuVlastnika();
    return false;
  }

  oznacPredchoziPrihlaseni();
  setLoginMessage();
  zobrazLokalniAplikaci();

  /*
   * C3 Admin Dashboard a další účetní UI dostanou signál až poté,
   * co server skutečně povolil aktivní účet. Samotná session nestačí.
   */
  window.dispatchEvent(
    new CustomEvent("lubanote:account-active", {
      detail: {
        userId: user?.id || null
      }
    })
  );

  if (
    typeof loadTagsFromSupabase === "function"
  ) {
    await loadTagsFromSupabase();
  }

  oznamPlatnePrihlaseni();

  if (!spustitSync) {
    return true;
  }

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

  return true;
}

async function zpracujStavPrihlasenehoUzivatele(
  user,
  { spustitSync = true } = {}
) {
  const stav = await nactiStavPristupu();

  if (
    stav?.ok === true &&
    stav.account_status === "active" &&
    stav.plan_active === true
  ) {
    return povolAktivniUcet(user, {
      spustitSync
    });
  }

  oznacBlokovanePrihlaseni();

  zobrazStavUctu({
    ...stav,
    account_status:
      stav?.account_status || "unavailable"
  });

  oznamSplashPripravenyBezCloudovehoStartu();
  return false;
}

async function overChybejiciSessionAProbudLogin() {
  if (!navigator.onLine) {
    return false;
  }

  const pripraven = await pripravSupabaseClient();

  if (!pripraven || !supabaseClient) {
    return false;
  }

  try {
    const {
      data: { session }
    } = await sCasovymLimitem(
      supabaseClient.auth.getSession(),
      5000,
      "Ověření přihlášené session"
    );

    if (session?.user) {
      return true;
    }

    if (existujePredchoziPrihlaseni()) {
      zobrazVyprselePrihlaseni();
    }

    return false;
  } catch (error) {
    /*
     * Síťová chyba nebo timeout není totéž jako potvrzeně chybějící
     * session. Offline-first aplikaci kvůli tomu nevyhazujeme na login.
     */
    console.warn(
      "Kontrola session pro synchronizaci byla odložena:",
      error.message
    );
    return false;
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
    } else {
      /*
       * Dříve přihlášený uživatel zůstává v offline-first režimu
       * na lokálních datech. Není důvod držet splash až do fallbacku.
       */
      oznamSplashPripravenyBezCloudovehoStartu();
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

    if (session?.user) {
      return await zpracujStavPrihlasenehoUzivatele(
        session.user,
        { spustitSync: true }
      );
    }

    /*
     * Máme internet, Supabase odpovědělo a session opravdu chybí.
     * Dříve přihlášeného uživatele už nesmíme nechat v aplikaci
     * s dojmem, že cloud funguje. Lokální data ale nemažeme.
     */
    if (existujePredchoziPrihlaseni()) {
      zobrazVyprselePrihlaseni();
    } else if (zobrazitLoginPriNeuspechu) {
      zobrazPrihlaseni();
    } else {
      oznamSplashPripravenyBezCloudovehoStartu();
    }

    return false;
  } catch (error) {
    console.warn(
      "Login session check skipped:",
      error.message
    );

    if (zobrazitLoginPriNeuspechu) {
      zobrazPrihlaseni();
      setLoginMessageKey(
        "login.accountCheckFailed",
        "Stav účtu se nepodařilo ověřit. Zkus to znovu.",
        true
      );
    } else {
      oznamSplashPripravenyBezCloudovehoStartu();
    }

    return false;
  }
}

async function updateLoginScreen() {
  /*
   * Potvrzení e-mailu je samostatný auth návrat, ne vypršení session.
   * Vždy ukážeme čisté přihlášení a nikdy kvůli tomu neodemykáme
   * lokální data předchozího účtu.
   */
  if (lubanoteAuthNavrat.maAuthChybu) {
    zrusPredchoziPrihlaseni();
    zobrazPrihlaseni("", false);
    setLoginMessageKey(
      "login.emailLinkInvalid",
      "Potvrzovací odkaz už byl použit nebo vypršel. Pokud je e-mail potvrzený, přihlas se.",
      true
    );
    oznamSplashPripravenyBezCloudovehoStartu();
    return;
  }

  if (lubanoteAuthNavrat.potvrzenyEmail) {
    zrusPredchoziPrihlaseni();
    zobrazPrihlaseni("", false);
    setLoginMessageKey(
      "login.emailConfirmed",
      "E-mail byl potvrzen. Teď se přihlas.",
      false
    );
    oznamSplashPripravenyBezCloudovehoStartu();
    return;
  }

  const maPredchoziPrihlaseni =
    existujePredchoziPrihlaseni();

  /*
   * Klíčová offline-first větev:
   * dříve schválený uživatel dostane lokální aplikaci ihned.
   * Síťové ověření proběhne pouze na pozadí.
   */
  if (maPredchoziPrihlaseni) {
    zobrazLokalniAplikaci();

    if (navigator.onLine) {
      /*
       * Online start nechá splash zakrývat aplikaci, dokud sync.js
       * nenačte poznámky i štítky a nevyšle lubanote:splash-ready.
       */
      overPrihlaseniOnline({
        zobrazitLoginPriNeuspechu: false
      });
    } else {
      /* Offline nemá na co čekat: lokální karty už jsou vykreslené. */
      oznamSplashPripravenyBezCloudovehoStartu();
    }

    return;
  }

  if (!navigator.onLine) {
    zobrazPrihlaseni(
      "První přihlášení vyžaduje připojení k internetu."
    );
    oznamSplashPripravenyBezCloudovehoStartu();
    return;
  }

  /* Ani při pomalém / nefunkčním internetu nezůstane černá obrazovka. */
  zobrazPrihlaseni(
    "Ověřuji přihlášení…",
    false
  );

  /*
   * Uživatel bez uloženého přihlášení musí vidět login hned.
   * Splash tedy není podmíněný synchronizací, která ještě nemůže běžet.
   */
  oznamSplashPripravenyBezCloudovehoStartu();

  await overPrihlaseniOnline({
    zobrazitLoginPriNeuspechu: true
  });
}

async function provedPrihlaseni(email, password) {
  if (!email || !password) {
    setLoginMessageKey(
      "login.enterCredentials",
      "Vyplň e-mail i heslo.",
      true
    );
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
  setLoginMessageKey(
    "login.signingIn",
    "Přihlašuji…"
  );

  try {
    const pripraven =
      await pripravSupabaseClient();

    if (!pripraven || !supabaseClient) {
      throw new Error(
        "Nepodařilo se načíst synchronizační službu."
      );
    }

    const {
      data,
      error
    } = await sCasovymLimitem(
      supabaseClient.auth.signInWithPassword({
        email,
        password
      }),
      12000,
      "Přihlášení"
    );

    if (error) {
      if (
        String(error.message || "")
          .toLowerCase()
          .includes("email not confirmed")
      ) {
        setLoginMessageKey(
          "login.emailNotConfirmed",
          "E-mail ještě není potvrzený. Otevři potvrzovací odkaz v e-mailu a pak se přihlas znovu.",
          true
        );
        return;
      }

      throw error;
    }

    /*
     * Úspěšná Auth session ještě není oprávnění k datům LubaNote.
     * Nejdřív musí projít serverová kontrola account_status.
     */
    oznacBlokovanePrihlaseni();

    loginPassword.value = "";
    loginPasswordConfirm.value = "";

    await zpracujStavPrihlasenehoUzivatele(
      data?.user,
      { spustitSync: true }
    );
  } catch (error) {
    setLoginMessageKey(
      "login.signInFailed",
      "Přihlášení se nezdařilo. Zkontroluj e-mail, heslo a připojení.",
      true
    );
    console.error("Login error:", error);
  } finally {
    loginButton.disabled = false;
  }
}

async function provedRegistraci(
  email,
  password,
  passwordConfirm
) {
  if (!email || !password || !passwordConfirm) {
    setLoginMessageKey(
      "login.enterRegistration",
      "Vyplň e-mail, heslo i heslo znovu.",
      true
    );
    return;
  }

  if (password !== passwordConfirm) {
    setLoginMessageKey(
      "login.passwordMismatch",
      "Zadaná hesla se neshodují.",
      true
    );
    return;
  }

  if (password.length < 8) {
    setLoginMessageKey(
      "login.passwordTooShort",
      "Heslo musí mít alespoň 8 znaků.",
      true
    );
    return;
  }

  if (!navigator.onLine) {
    setLoginMessageKey(
      "login.registrationOnline",
      "Registrace vyžaduje připojení k internetu.",
      true
    );
    return;
  }

  loginButton.disabled = true;
  setLoginMessageKey(
    "login.registering",
    "Registruji…"
  );

  try {
    const pripraven =
      await pripravSupabaseClient();

    if (!pripraven || !supabaseClient) {
      throw new Error(
        "Nepodařilo se načíst synchronizační službu."
      );
    }

    const {
      data,
      error
    } = await sCasovymLimitem(
      supabaseClient.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: LUBANOTE_AUTH_REDIRECT_URL
        }
      }),
      15000,
      "Registrace"
    );

    if (error) {
      throw error;
    }

    if (
      data?.user &&
      Array.isArray(data.user.identities) &&
      data.user.identities.length === 0
    ) {
      nastavRezimAuth("login", {
        zachovatZpravu: true
      });
      setLoginMessageKey(
        "login.alreadyRegistered",
        "Tento e-mail už je zaregistrovaný. Použij Přihlášení.",
        true
      );
      return;
    }

    /*
     * Nový Auth účet serverový trigger vždy založí jako PENDING.
     * Dokud server nepotvrdí ACTIVE, nikdy nenastavujeme offline-first
     * marker pro vstup do lokální aplikace.
     */
    oznacBlokovanePrihlaseni();

    loginPassword.value = "";
    loginPasswordConfirm.value = "";

    if (data?.session?.user) {
      await zpracujStavPrihlasenehoUzivatele(
        data.session.user,
        { spustitSync: false }
      );
      return;
    }

    nastavRezimAuth("login", {
      zachovatZpravu: true
    });
    loginEmail.value = email;
    setLoginMessageKey(
      "login.registrationCreated",
      "Registrace byla vytvořena. Potvrď e-mail a potom se přihlas.",
      false
    );
  } catch (error) {
    setLoginMessageKey(
      "login.registrationFailed",
      "Registrace se nezdařila. Zkontroluj e-mail, heslo a připojení.",
      true
    );
    console.error("Registration error:", error);
  } finally {
    loginButton.disabled = false;
  }
}

loginModeSignIn.addEventListener("click", () => {
  nastavRezimAuth("login");
});

loginModeRegister.addEventListener("click", () => {
  nastavRezimAuth("register");
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = loginEmail.value.trim();
  const password = loginPassword.value;

  if (aktualniRezimAuth === "register") {
    await provedRegistraci(
      email,
      password,
      loginPasswordConfirm.value
    );
    return;
  }

  await provedPrihlaseni(email, password);
});

accountStatusRefresh.addEventListener(
  "click",
  async () => {
    if (!navigator.onLine) {
      setLoginMessageKey(
        "login.accountCheckFailed",
        "Stav účtu se nepodařilo ověřit. Zkus to znovu.",
        true
      );
      return;
    }

    accountStatusRefresh.disabled = true;
    setLoginMessage();

    try {
      const pripraven = await pripravSupabaseClient();

      if (!pripraven || !supabaseClient) {
        throw new Error("Supabase unavailable");
      }

      const {
        data: { session }
      } = await sCasovymLimitem(
        supabaseClient.auth.getSession(),
        5000,
        "Kontrola session"
      );

      if (!session?.user) {
        zrusPredchoziPrihlaseni();
        zobrazPrihlaseni();
        return;
      }

      const povolen =
        await zpracujStavPrihlasenehoUzivatele(
          session.user,
          { spustitSync: true }
        );

      if (
        !povolen &&
        aktualniStavUctu?.account_status === "pending"
      ) {
        setLoginMessageKey(
          "login.stillPending",
          "Účet stále čeká na schválení.",
          false
        );
      }
    } catch (error) {
      console.warn("Account status refresh failed:", error);
      setLoginMessageKey(
        "login.accountCheckFailed",
        "Stav účtu se nepodařilo ověřit. Zkus to znovu.",
        true
      );
    } finally {
      accountStatusRefresh.disabled = false;
    }
  }
);

accountStatusSignOut.addEventListener(
  "click",
  async () => {
    accountStatusSignOut.disabled = true;

    try {
      const pripraven = await pripravSupabaseClient();

      if (pripraven && supabaseClient) {
        await supabaseClient.auth.signOut();
      }
    } catch (error) {
      console.warn("Pending account sign-out skipped:", error);
    } finally {
      zrusPredchoziPrihlaseni();
      accountStatusSignOut.disabled = false;
      zobrazPrihlaseni();
    }
  }
);

window.addEventListener("lubanote:language-change", () => {
  const klic = loginMessage.dataset.i18nKey || "";
  const zdroj = loginMessage.dataset.i18nSource || "";

  if (klic) {
    loginMessage.textContent = tAuth(klic, loginMessage.textContent);
  } else if (zdroj) {
    loginMessage.textContent =
      window.LubaNoteI18n?.prelozText?.(zdroj) || zdroj;
  }

  aktualizujAuthTexty();
});

window.LubaNoteSupabase = {
  pripravClient: pripravSupabaseClient,
  jePripraven: () => Boolean(supabaseClient),
  maPredchoziPrihlaseni:
    existujePredchoziPrihlaseni,
  zrusPredchoziPrihlaseni,
  zobrazPrihlaseni,
  overChybejiciSessionAProbudLogin,
  nactiStavPristupu
};

window.addEventListener(
  "lubanote:auth-required",
  () => {
    overChybejiciSessionAProbudLogin();
  }
);

window.addEventListener("online", () => {
  /*
   * Když se internet vrátí po offline startu,
   * načteme Supabase a obnovíme session bez restartu aplikace.
   */
  overPrihlaseniOnline({
    zobrazitLoginPriNeuspechu: false
  });
});

aktualizujAuthTexty();
updateLoginScreen();
