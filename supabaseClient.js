const SUPABASE_URL =
  "https://nwdacgigplofksexssws.supabase.co/";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_VQpvaA0VAOcSxLtTG8Zr5Q_USIiro0c";

const supabaseClient =
  supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );

async function getCurrentUser() {
  const {
    data: { user }
  } = await supabaseClient.auth.getUser();

  return user;
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

async function updateLoginScreen() {
  try {
    const {
      data: { session }
    } = await supabaseClient.auth.getSession();

    loginScreen.hidden = !!session;
  } catch (error) {
    loginScreen.hidden = false;
    setLoginMessage(
      "Nepodařilo se ověřit přihlášení. Zkontroluj připojení k internetu.",
      true
    );
    console.error("Login session error:", error);
  } finally {
    document.body.classList.remove("authPending");
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = loginEmail.value.trim();
  const password = loginPassword.value;

  if (!email || !password) {
    setLoginMessage("Vyplň e-mail i heslo.", true);
    return;
  }

  loginButton.disabled = true;
  setLoginMessage("Přihlašuji…");

  const { error } =
    await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

  if (error) {
    loginButton.disabled = false;
    setLoginMessage(
      "Přihlášení se nezdařilo. Zkontroluj e-mail, heslo a připojení.",
      true
    );
    return;
  }

  loginPassword.value = "";
  setLoginMessage();
  loginScreen.hidden = true;
  loginButton.disabled = false;

  await syncNotes();
});

updateLoginScreen();
