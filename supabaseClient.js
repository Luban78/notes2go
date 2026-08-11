const SUPABASE_URL =
  "https://nwdacgigplofksexssws.supabase.co/";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_VQpvaA0VAOcSxLtTG8Zr5Q_USIiro0c";
  
const supabaseClient =
  supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );
  
//console.log("Supabase client:", supabaseClient);

async function checkSupabaseSession() {
  const {
    data: { session }
  } = await supabaseClient.auth.getSession();

  /*console.log(
    "Supabase session:",
    session ? "AKTIVNÍ" : "NENÍ"
  );*/
}


async function getCurrentUser() {
  const {
    data: { user }
  } = await supabaseClient.auth.getUser();

  return user;
}


checkSupabaseSession();

async function testCurrentUser() {
  const user = await getCurrentUser();

/*  console.log(
    "Current user:",
    user ? user.id : "NENÍ"
  );*/
}

testCurrentUser();

async function insertTestNote() {
  const user = await getCurrentUser();

  if (!user) {
    console.log("Test note: uživatel není přihlášen");
    return;
  }

  const { error } =
    await supabaseClient
      .from("notes")
      .insert({
        user_id: user.id,
        data: {
          title: "Test Supabase",
          note: "První poznámka z LubanNote"
        }
      });

  if (error) {
    console.log("Test note: CHYBA", error.message);
  } else {
    console.log("Test note: ULOŽENA");
  }
}

//insertTestNote();

async function loadNotesFromSupabase() {
  const { data, error } =
    await supabaseClient
      .from("notes")
      .select("*")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });

  if (error) {
    console.log("Load notes: CHYBA", error.message);
    return;
  }

  console.log("Load notes: OK", data);
}

//loadNotesFromSupabase();

const loginScreen =
  document.getElementById("loginScreen");

const loginEmail =
  document.getElementById("loginEmail");

const loginPassword =
  document.getElementById("loginPassword");

const loginButton =
  document.getElementById("loginButton");

const loginMessage =
  document.getElementById("loginMessage");
  
async function updateLoginScreen() {
  const {
    data: { session }
  } = await supabaseClient.auth.getSession();

  loginScreen.hidden = !!session;
}

updateLoginScreen();

loginButton.addEventListener("click", async () => {
  const email = loginEmail.value.trim();
  const password = loginPassword.value;

  const { error } =
    await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

  if (error) {
    console.log("Login CHYBA:", error.message);
    return;
  }

  loginScreen.hidden = true;

  await syncNotes();
});