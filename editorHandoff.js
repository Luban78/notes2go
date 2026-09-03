/* ==================================================
   LUBANOTE – BEZPEČNÉ PŘEDÁNÍ EDITORU MEZI ZAŘÍZENÍMI

   Samostatný modul. Obsah poznámky neposílá přes Realtime.
   Realtime používá pouze jako řídicí kanál pro žádost o předání.
   Trvalý obsah dál ukládá existující revizní sync v sync.js.
   ================================================== */

function ziskejDeviceIdEditoru() {
  if (
    typeof window.LubaNoteSync?.ziskejDeviceId ===
      "function"
  ) {
    return window.LubaNoteSync.ziskejDeviceId();
  }

  /* Fallback používá stejný klíč jako sync.js. */
  let deviceId =
    localStorage.getItem("lubanoteDeviceId");

  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(
      "lubanoteDeviceId",
      deviceId
    );
  }

  return deviceId;
}

/* ==========================================
   PŘEDÁNÍ OTEVŘENÉHO EDITORU MEZI ZAŘÍZENÍMI – V1

   Princip:
   - jedna uložená poznámka může mít právě jednoho aktivního editora,
   - druhé zařízení ji neotevře dřív, než původní zařízení
     bezpečně uloží, synchronizuje a předá vlastnictví,
   - samotný obsah poznámky se přes Realtime neposílá;
     Realtime nese jen řídicí informaci o předání,
   - skutečný obsah zůstává v běžném revizním syncu.
   ========================================== */

const EDITOR_LEASE_SECONDS = 120;
const EDITOR_HEARTBEAT_MS = 20000;
const EDITOR_HANDOFF_TIMEOUT_MS = 45000;
const EDITOR_HANDOFF_POLL_MS = 450;

let aktivniVzdalenyEditor = null;
let editorHeartbeatTimer = null;
let editorRealtimeKanal = null;
let editorRealtimeUserId = null;
let probihaZpracovaniPredani = false;
const probihajiciPripravyEditoru = new Map();
const probihajiciUvolneniEditoru = new Map();
const EDITOR_PENDING_RELEASE_STORAGE_KEY =
  "lubanotePendingEditorReleasesV1";

function nactiCekajiciUvolneniEditoru() {
  try {
    const raw = localStorage.getItem(
      EDITOR_PENDING_RELEASE_STORAGE_KEY
    );

    const parsed = raw ? JSON.parse(raw) : [];

    return Array.isArray(parsed)
      ? parsed.filter((item) => (
          item?.noteId &&
          item?.deviceId &&
          item?.sessionId
        ))
      : [];
  } catch {
    return [];
  }
}

function ulozCekajiciUvolneniEditoru(zaznamy) {
  try {
    if (!Array.isArray(zaznamy) || zaznamy.length === 0) {
      localStorage.removeItem(
        EDITOR_PENDING_RELEASE_STORAGE_KEY
      );
      return;
    }

    localStorage.setItem(
      EDITOR_PENDING_RELEASE_STORAGE_KEY,
      JSON.stringify(zaznamy)
    );
  } catch {
    // Koordinační fronta nesmí zablokovat editor.
  }
}

function pridejCekajiciUvolneniEditoru(session) {
  if (!session?.noteId || !session?.sessionId) {
    return;
  }

  const zaznamy = nactiCekajiciUvolneniEditoru()
    .filter((item) => !(
      item.noteId === session.noteId &&
      item.sessionId === session.sessionId
    ));

  zaznamy.push({
    noteId: session.noteId,
    deviceId: ziskejDeviceIdEditoru(),
    sessionId: session.sessionId,
    createdAt: new Date().toISOString()
  });

  ulozCekajiciUvolneniEditoru(zaznamy);
}

function odeberCekajiciUvolneniEditoru(
  noteId,
  sessionId
) {
  const zaznamy = nactiCekajiciUvolneniEditoru()
    .filter((item) => !(
      item.noteId === noteId &&
      item.sessionId === sessionId
    ));

  ulozCekajiciUvolneniEditoru(zaznamy);
}

async function odesliJednoUvolneniEditoru(session) {
  if (
    !session?.noteId ||
    !session?.deviceId ||
    !session?.sessionId ||
    !navigator.onLine
  ) {
    return false;
  }

  const pripraven =
    await pripravSupabaseProEditorHandoff();

  if (!pripraven) {
    return false;
  }

  try {
    const { data, error } =
      await supabaseClient.rpc(
        "lubanote_release_note_editor",
        {
          p_note_id: session.noteId,
          p_device_id: session.deviceId,
          p_session_id: session.sessionId
        }
      );

    if (error) {
      console.warn(
        "Editor release error:",
        error.message
      );
      return false;
    }

    /*
     * false znamená typicky, že řádek už neexistuje nebo session
     * mezitím legitimně přešla jinam. V obou případech už tuto
     * starou lokální session není co uvolňovat.
     */
    odeberCekajiciUvolneniEditoru(
      session.noteId,
      session.sessionId
    );

    return data === true || data === false;
  } catch (error) {
    console.warn(
      "Editor release selhal:",
      error
    );
    return false;
  }
}

async function odesliCekajiciUvolneniEditoru(
  pouzeNoteId = null
) {
  if (!navigator.onLine) {
    return false;
  }

  const zaznamy = nactiCekajiciUvolneniEditoru()
    .filter((item) => (
      !pouzeNoteId ||
      item.noteId === pouzeNoteId
    ));

  if (zaznamy.length === 0) {
    return true;
  }

  let vseHotovo = true;

  for (const session of zaznamy) {
    const hotovo =
      await odesliJednoUvolneniEditoru(session);

    if (!hotovo) {
      vseHotovo = false;
    }
  }

  return vseHotovo;
}

function ziskejEditorHandoffModal() {
  let modal = document.getElementById(
    "editorHandoffModal"
  );

  if (modal) {
    return modal;
  }

  modal = document.createElement("div");
  modal.id = "editorHandoffModal";
  modal.className = "appMessageModal";
  modal.hidden = true;

  /*
   * Musí být nad fullscreen náhledem obrázku, PDF viewerem i
   * selection handly. Neměníme kvůli tomu globální style.css.
   */
  modal.style.zIndex = "1100000";

  const dialog = document.createElement("div");
  dialog.className = "appMessageDialog";

  const nadpis = document.createElement("h3");
  nadpis.id = "editorHandoffTitle";

  const text = document.createElement("p");
  text.id = "editorHandoffText";

  const akce = document.createElement("div");
  akce.className = "appMessageActions";

  const zrusit = document.createElement("button");
  zrusit.id = "editorHandoffCancelButton";
  zrusit.type = "button";
  zrusit.textContent = "Zrušit";

  const potvrdit = document.createElement("button");
  potvrdit.id = "editorHandoffConfirmButton";
  potvrdit.type = "button";
  potvrdit.textContent = "Uložit tam a převzít";
  potvrdit.style.background = "var(--color-accent)";
  potvrdit.style.color = "var(--color-accent-text)";

  akce.append(zrusit, potvrdit);
  dialog.append(nadpis, text, akce);
  modal.append(dialog);
  document.body.append(modal);

  return modal;
}

function nastavEditorHandoffModal({
  nadpis,
  text,
  cekani = false,
  pouzeOk = false
}) {
  const modal = ziskejEditorHandoffModal();
  const title = modal.querySelector(
    "#editorHandoffTitle"
  );
  const zprava = modal.querySelector(
    "#editorHandoffText"
  );
  const zrusit = modal.querySelector(
    "#editorHandoffCancelButton"
  );
  const potvrdit = modal.querySelector(
    "#editorHandoffConfirmButton"
  );

  title.textContent = nadpis || "Upozornění";
  zprava.textContent = text || "";

  zrusit.disabled = cekani;
  potvrdit.disabled = cekani;

  if (pouzeOk) {
    zrusit.hidden = true;
    potvrdit.hidden = false;
    potvrdit.disabled = false;
    potvrdit.textContent = "OK";
  } else {
    zrusit.hidden = false;
    potvrdit.hidden = false;
    potvrdit.textContent = cekani
      ? "Probíhá předání…"
      : "Uložit tam a převzít";
  }

  modal.hidden = false;
  return modal;
}

function skryjEditorHandoffModal() {
  const modal = document.getElementById(
    "editorHandoffModal"
  );

  if (modal) {
    modal.hidden = true;
  }
}

function zobrazEditorHandoffInfo(
  nadpis,
  text
) {
  return new Promise((resolve) => {
    const modal = nastavEditorHandoffModal({
      nadpis,
      text,
      pouzeOk: true
    });

    const potvrdit = modal.querySelector(
      "#editorHandoffConfirmButton"
    );

    const hotovo = () => {
      potvrdit.removeEventListener(
        "click",
        hotovo
      );
      skryjEditorHandoffModal();
      resolve(false);
    };

    potvrdit.addEventListener(
      "click",
      hotovo,
      { once: true }
    );
  });
}

function zeptejSeNaPredaniEditoru() {
  return new Promise((resolve) => {
    const modal = nastavEditorHandoffModal({
      nadpis: "Poznámka je otevřená jinde",
      text:
        "Tato poznámka je právě otevřená na jiném zařízení. LubaNote ji tam může bezpečně uložit, synchronizovat a zavřít. Potom se otevře zde."
    });

    const zrusit = modal.querySelector(
      "#editorHandoffCancelButton"
    );
    const potvrdit = modal.querySelector(
      "#editorHandoffConfirmButton"
    );

    const uklid = () => {
      zrusit.removeEventListener(
        "click",
        zruseno
      );
      potvrdit.removeEventListener(
        "click",
        potvrzeno
      );
    };

    const zruseno = () => {
      uklid();
      skryjEditorHandoffModal();
      resolve(false);
    };

    const potvrzeno = () => {
      uklid();
      nastavEditorHandoffModal({
        nadpis: "Přebírám poznámku",
        text:
          "Čekám, až druhé zařízení uloží poslední změny, dokončí synchronizaci a editor bezpečně zavře…",
        cekani: true
      });
      resolve(true);
    };

    zrusit.addEventListener(
      "click",
      zruseno,
      { once: true }
    );
    potvrdit.addEventListener(
      "click",
      potvrzeno,
      { once: true }
    );
  });
}

async function pripravSupabaseProEditorHandoff() {
  if (!navigator.onLine) {
    return false;
  }

  if (
    typeof window.LubaNoteSupabase
      ?.pripravClient === "function"
  ) {
    const pripraven =
      await window.LubaNoteSupabase
        .pripravClient();

    if (!pripraven) {
      return false;
    }
  }

  return Boolean(
    typeof supabaseClient !== "undefined" &&
    supabaseClient
  );
}

function zastavEditorHeartbeat() {
  clearInterval(editorHeartbeatTimer);
  editorHeartbeatTimer = null;
}

async function obnovEditorLease() {
  const session = aktivniVzdalenyEditor;

  if (!session || !navigator.onLine) {
    return false;
  }

  const { data, error } =
    await supabaseClient.rpc(
      "lubanote_refresh_note_editor",
      {
        p_note_id: session.noteId,
        p_device_id: ziskejDeviceIdEditoru(),
        p_session_id: session.sessionId,
        p_lease_seconds:
          EDITOR_LEASE_SECONDS
      }
    );

  if (error) {
    console.warn(
      "Editor lease refresh error:",
      error.message
    );
    return false;
  }

  if (data !== true) {
    zastavEditorHeartbeat();
    aktivniVzdalenyEditor = null;

    window.dispatchEvent(
      new CustomEvent(
        "lubanote:editor-ownership-lost"
      )
    );

    return false;
  }

  return true;
}

function spustEditorHeartbeat() {
  zastavEditorHeartbeat();

  editorHeartbeatTimer = setInterval(
    () => {
      obnovEditorLease().catch(
        (error) => {
          console.warn(
            "Editor heartbeat selhal:",
            error
          );
        }
      );
    },
    EDITOR_HEARTBEAT_MS
  );
}

async function pripravRealtimeKanalEditoru() {
  const user = await getCurrentUser();

  if (!user) {
    return false;
  }

  if (
    editorRealtimeKanal &&
    editorRealtimeUserId === user.id
  ) {
    return true;
  }

  if (editorRealtimeKanal) {
    try {
      await supabaseClient.removeChannel(
        editorRealtimeKanal
      );
    } catch {
      // Starý kanál nesmí blokovat nový.
    }
  }

  editorRealtimeUserId = user.id;

  editorRealtimeKanal = supabaseClient
    .channel(
      `lubanote-editor-handoff-${user.id}`
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "note_editor_sessions",
        filter: `user_id=eq.${user.id}`
      },
      (payload) => {
        const row = payload?.new;

        if (!row) {
          return;
        }

        zpracujEditorSessionUpdate(row)
          .catch((error) => {
            console.error(
              "Zpracování předání editoru selhalo:",
              error
            );
          });
      }
    );

  return await new Promise((resolve) => {
    let hotovo = false;

    const dokoncit = (vysledek) => {
      if (hotovo) {
        return;
      }
      hotovo = true;
      resolve(vysledek);
    };

    const timer = setTimeout(
      () => dokoncit(false),
      3500
    );

    editorRealtimeKanal.subscribe(
      (stav) => {
        if (stav === "SUBSCRIBED") {
          clearTimeout(timer);
          dokoncit(true);
        }

        if (
          stav === "CHANNEL_ERROR" ||
          stav === "TIMED_OUT" ||
          stav === "CLOSED"
        ) {
          clearTimeout(timer);
          dokoncit(false);
        }
      }
    );
  });
}

async function aktivujVzdalenyEditorSession(
  noteId,
  sessionId
) {
  aktivniVzdalenyEditor = {
    noteId,
    sessionId
  };

  spustEditorHeartbeat();

  /*
   * Realtime kanál musí být připravený ještě před tím,
   * než uživateli dovolíme editor používat. Jinak by mohlo
   * druhé zařízení odeslat žádost o předání do mezery,
   * kdy první zařízení ještě neposlouchá.
   */
  const kanalPripraven =
    await pripravRealtimeKanalEditoru();

  if (!kanalPripraven) {
    console.warn(
      "Realtime kanál předání editoru není připravený."
    );
  }

  return true;
}

async function ziskejServerovouEditorSession(
  noteId
) {
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  const { data, error } = await supabaseClient
    .from("note_editor_sessions")
    .select(
      "user_id,note_id,owner_device_id,owner_session_id,lease_until,takeover_request_id,takeover_device_id,takeover_session_id,takeover_status,takeover_error"
    )
    .eq("user_id", user.id)
    .eq("note_id", noteId)
    .maybeSingle();

  if (error) {
    console.warn(
      "Načtení editor session selhalo:",
      error.message
    );
    return null;
  }

  return data || null;
}

async function claimEditorSession(
  noteId,
  sessionId
) {
  const { data, error } =
    await supabaseClient.rpc(
      "lubanote_claim_note_editor",
      {
        p_note_id: noteId,
        p_device_id: ziskejDeviceIdEditoru(),
        p_session_id: sessionId,
        p_lease_seconds:
          EDITOR_LEASE_SECONDS
      }
    );

  if (error) {
    console.error(
      "Editor claim error:",
      error.message
    );
    return {
      acquired: false,
      error: true
    };
  }

  return data || {
    acquired: false
  };
}

async function pozadejOPredaniEditoru(
  noteId,
  requestId,
  novaSessionId
) {
  const { data, error } =
    await supabaseClient.rpc(
      "lubanote_request_note_editor_takeover",
      {
        p_note_id: noteId,
        p_request_id: requestId,
        p_requester_device_id:
          ziskejDeviceIdEditoru(),
        p_requester_session_id:
          novaSessionId
      }
    );

  if (error) {
    console.error(
      "Editor takeover request error:",
      error.message
    );
    return {
      ok: false,
      reason: "rpc_error"
    };
  }

  return data || {
    ok: false
  };
}

async function zrusPozadavekNaPredaniEditoru(
  noteId,
  requestId,
  novaSessionId
) {
  const { data, error } =
    await supabaseClient.rpc(
      "lubanote_cancel_note_editor_takeover",
      {
        p_note_id: noteId,
        p_request_id: requestId,
        p_requester_device_id:
          ziskejDeviceIdEditoru(),
        p_requester_session_id:
          novaSessionId
      }
    );

  if (error) {
    console.warn(
      "Editor takeover cancel error:",
      error.message
    );
    return {
      cancelled: false,
      acquired: false,
      error: true
    };
  }

  return data || {
    cancelled: false,
    acquired: false
  };
}

async function oznacPredaniJakoSelhane(
  row,
  duvod
) {
  try {
    await supabaseClient.rpc(
      "lubanote_fail_note_editor_takeover",
      {
        p_note_id: row.note_id,
        p_owner_device_id:
          ziskejDeviceIdEditoru(),
        p_owner_session_id:
          row.owner_session_id,
        p_request_id:
          row.takeover_request_id,
        p_error: String(
          duvod || "safe_save_failed"
        ).slice(0, 500)
      }
    );
  } catch (error) {
    console.warn(
      "Zápis selhání předání editoru selhal:",
      error
    );
  }
}

async function dokonciPredaniEditoru(row) {
  const { data, error } =
    await supabaseClient.rpc(
      "lubanote_complete_note_editor_takeover",
      {
        p_note_id: row.note_id,
        p_owner_device_id:
          ziskejDeviceIdEditoru(),
        p_owner_session_id:
          row.owner_session_id,
        p_request_id:
          row.takeover_request_id,
        p_lease_seconds:
          EDITOR_LEASE_SECONDS
      }
    );

  if (error) {
    console.error(
      "Dokončení předání editoru selhalo:",
      error.message
    );
    return false;
  }

  return data === true;
}

async function zpracujEditorSessionUpdate(row) {
  if (
    probihaZpracovaniPredani ||
    !aktivniVzdalenyEditor ||
    row.note_id !==
      aktivniVzdalenyEditor.noteId ||
    row.owner_device_id !== ziskejDeviceIdEditoru() ||
    row.owner_session_id !==
      aktivniVzdalenyEditor.sessionId ||
    row.takeover_status !== "requested" ||
    !row.takeover_request_id
  ) {
    return;
  }

  probihaZpracovaniPredani = true;

  nastavEditorHandoffModal({
    nadpis: "Poznámka se otevírá jinde",
    text:
      "Ukládám poslední změny a dokončuji synchronizaci. Po bezpečném uložení se tento editor automaticky zavře.",
    cekani: true
  });

  /*
   * Pokud byl nad editorem otevřen fullscreen obrázek nebo PDF,
   * handoff modal je překryje a tyto pomocné viewery bezpečně zavřeme.
   * Samotného editorMedia.js ani jeho gest se nedotýkáme.
   */
  document.querySelector(
    ".lubaNoteImagePreviewClose"
  )?.click();

  document.getElementById(
    "selectionMenu"
  )?.setAttribute("hidden", "");

  try {
    await window.LubaNoteDocuments
      ?.zavriPdfViewer?.();
  } catch {
    // Viewer nesmí zablokovat bezpečné uložení poznámky.
  }

  try {
    const api =
      window.LubaNoteEditorPredani;

    if (
      !api ||
      typeof api.ulozAktivniEditorProPredani !==
        "function" ||
      typeof api.zavriAktivniEditorPoPredani !==
        "function"
    ) {
      throw new Error(
        "Editor API pro bezpečné předání není dostupné."
      );
    }

    const ulozeno =
      await api.ulozAktivniEditorProPredani(
        row.note_id
      );

    if (ulozeno !== true) {
      throw new Error(
        "Poznámku se nepodařilo bezpečně synchronizovat."
      );
    }

    /*
     * Poslední heartbeat nesmí závodit s atomickým převodem ownera.
     * Během běžného ukládání heartbeat běží dál, ale těsně před
     * COMPLETE ho zastavíme. Pokud server převod odmítne, v catch
     * ho znovu spustíme a původní editor zůstane vlastníkem.
     */
    zastavEditorHeartbeat();

    const predano =
      await dokonciPredaniEditoru(row);

    if (!predano) {
      if (aktivniVzdalenyEditor) {
        spustEditorHeartbeat();
      }

      throw new Error(
        "Server nepotvrdil předání editoru."
      );
    }

    /*
     * Server už vlastníka převedl na nové zařízení.
     * Starý klient svou session jen zapomene; serverový release
     * by v této chvíli nesměl smazat právě převedeného ownera.
     */
    aktivniVzdalenyEditor = null;

    api.zavriAktivniEditorPoPredani(
      row.note_id
    );

    skryjEditorHandoffModal();

    if (
      typeof window.zobrazPotvrzeniAkce ===
      "function"
    ) {
      window.zobrazPotvrzeniAkce(
        "Poznámka byla uložena a předána"
      );
    }
  } catch (error) {
    console.error(
      "Bezpečné předání poznámky selhalo:",
      error
    );

    await oznacPredaniJakoSelhane(
      row,
      error?.message || "safe_save_failed"
    );

    if (
      aktivniVzdalenyEditor?.noteId === row.note_id &&
      aktivniVzdalenyEditor?.sessionId === row.owner_session_id &&
      !editorHeartbeatTimer
    ) {
      spustEditorHeartbeat();
    }

    await zobrazEditorHandoffInfo(
      "Předání se nezdařilo",
      "Poznámka zůstala na tomto zařízení otevřená, protože se ji nepodařilo bezpečně uložit a synchronizovat."
    );
  } finally {
    probihaZpracovaniPredani = false;
  }
}

async function cekejNaPrevzetiEditoru({
  noteId,
  requestId,
  novaSessionId
}) {
  const start = Date.now();

  while (
    Date.now() - start <
    EDITOR_HANDOFF_TIMEOUT_MS
  ) {
    const row =
      await ziskejServerovouEditorSession(
        noteId
      );

    if (!row) {
      /*
       * Původní zařízení mohlo mezitím editor samo zavřít.
       * Zkusíme proto session atomicky získat pro sebe.
       */
      const claim = await claimEditorSession(
        noteId,
        novaSessionId
      );

      if (claim?.acquired === true) {
        return {
          ok: true,
          acquired: true
        };
      }
    } else {
      if (
        row.owner_device_id === ziskejDeviceIdEditoru() &&
        row.owner_session_id === novaSessionId
      ) {
        return {
          ok: true,
          acquired: true
        };
      }

      if (
        row.takeover_request_id === requestId &&
        row.takeover_status === "failed"
      ) {
        return {
          ok: false,
          reason: "remote_save_failed",
          error: row.takeover_error || null
        };
      }

      if (
        row.takeover_request_id &&
        row.takeover_request_id !== requestId
      ) {
        return {
          ok: false,
          reason: "request_replaced"
        };
      }
    }

    await new Promise((resolve) =>
      setTimeout(
        resolve,
        EDITOR_HANDOFF_POLL_MS
      )
    );
  }

  /*
   * DŮLEŽITÝ RACE GUARD:
   * samotný timeout nesmí jen odejít. Původní zařízení může právě
   * dokončovat poslední síťový zápis. Request proto atomicky zrušíme.
   * Pokud už server mezitím vlastnictví převedl, cancel nám to vrátí
   * jako acquired=true a převzetí dokončíme místo falešného timeoutu.
   */
  const zruseni =
    await zrusPozadavekNaPredaniEditoru(
      noteId,
      requestId,
      novaSessionId
    );

  if (zruseni?.acquired === true) {
    return {
      ok: true,
      acquired: true
    };
  }

  if (zruseni?.owner_missing === true) {
    const claim = await claimEditorSession(
      noteId,
      novaSessionId
    );

    if (claim?.acquired === true) {
      return {
        ok: true,
        acquired: true
      };
    }
  }

  /*
   * Když cancel kvůli síťové chybě nemohl potvrdit stav, provedeme
   * poslední čtení. Nikdy ale neprohlásíme převzetí za úspěšné jen
   * podle času – skutečným ownerem musí být naše session.
   */
  const finalRow =
    await ziskejServerovouEditorSession(
      noteId
    );

  if (
    finalRow?.owner_device_id === ziskejDeviceIdEditoru() &&
    finalRow?.owner_session_id === novaSessionId
  ) {
    return {
      ok: true,
      acquired: true
    };
  }

  return {
    ok: false,
    reason: "timeout"
  };
}

async function pripravOtevreniEditoru(noteId) {
  if (!noteId) {
    return true;
  }

  /*
   * Pokud jsme stejnou poznámku před chvílí zavřeli, počkáme na
   * dokončení jejího serverového release. Tím se rychlé znovuotevření
   * na stejném zařízení nesplete s editorem na jiném zařízení.
   */
  const probihajiciUvolneni =
    probihajiciUvolneniEditoru.get(noteId);

  if (probihajiciUvolneni) {
    try {
      await probihajiciUvolneni;
    } catch {
      // Následující claim stav znovu ověří na serveru.
    }
  }

  await odesliCekajiciUvolneniEditoru(
    noteId
  );

  if (
    aktivniVzdalenyEditor?.noteId === noteId
  ) {
    return true;
  }

  if (probihajiciPripravyEditoru.has(noteId)) {
    return await probihajiciPripravyEditoru.get(
      noteId
    );
  }

  const priprava = (async () => {
    /*
     * Offline-first zůstává zachovaný. Bez internetu editor otevřeme
     * stejně jako dnes a případnou pozdější kolizi stále chrání
     * serverová revision logika.
     */
    if (!navigator.onLine) {
      return true;
    }

    const pripraven =
      await pripravSupabaseProEditorHandoff();

    if (!pripraven) {
      return true;
    }

    /*
     * Poslouchat musíme ještě PŘED claimem. Tím odstraníme krátké
     * okno, ve kterém by druhé zařízení mohlo požádat o předání
     * dřív, než původní editor začne Realtime UPDATE přijímat.
     */
    const realtimePripraven =
      await pripravRealtimeKanalEditoru();

    if (!realtimePripraven) {
      console.warn(
        "Realtime předání editoru není dostupné; zůstává revision ochrana."
      );
      return true;
    }

    const novaSessionId = crypto.randomUUID();
    const claim = await claimEditorSession(
      noteId,
      novaSessionId
    );

    if (claim?.acquired === true) {
      await aktivujVzdalenyEditorSession(
        noteId,
        novaSessionId
      );
      return true;
    }

    if (claim?.error === true) {
      /*
       * Chyba nové doplňkové vrstvy nesmí zablokovat celý editor.
       * Revision ochrana dál zůstává posledním airbagem.
       */
      return true;
    }

    if (claim?.stale === true) {
      await zobrazEditorHandoffInfo(
        "Druhé zařízení neodpovídá",
        "Poznámka byla otevřená na jiném zařízení, ale jeho editor už neobnovuje spojení. LubaNote ji z bezpečnostních důvodů automaticky nepřevzalo, aby se neztratily případné neuložené změny."
      );
      return false;
    }

    const chcePrevzit =
      await zeptejSeNaPredaniEditoru();

    if (!chcePrevzit) {
      return false;
    }

    const requestId = crypto.randomUUID();
    const pozadavek =
      await pozadejOPredaniEditoru(
        noteId,
        requestId,
        novaSessionId
      );

    if (pozadavek?.ok !== true) {
      /*
       * Původní zařízení mohlo poznámku zavřít právě ve chvíli,
       * kdy už byl potvrzovací modal otevřený. V takovém případě
       * není důvod hlásit chybu – session zkusíme získat přímo.
       */
      if (pozadavek?.reason === "owner_missing") {
        const novyClaim =
          await claimEditorSession(
            noteId,
            novaSessionId
          );

        if (novyClaim?.acquired === true) {
          await aktivujVzdalenyEditorSession(
            noteId,
            novaSessionId
          );

          const synchronizovano =
            await window.LubaNoteSync
              ?.synchronizujPoznamkyTed?.(
                noteId
              );

          if (!synchronizovano) {
            await uvolniEditorPoznamky(noteId);
            skryjEditorHandoffModal();
            await zobrazEditorHandoffInfo(
              "Synchronizace se nezdařila",
              "Druhé zařízení už editor zavřelo, ale toto zařízení nedokázalo stáhnout potvrzenou verzi. Zkus poznámku otevřít znovu."
            );
            return false;
          }

          skryjEditorHandoffModal();
          return true;
        }
      }

      skryjEditorHandoffModal();

      if (pozadavek?.reason === "owner_stale") {
        await zobrazEditorHandoffInfo(
          "Druhé zařízení neodpovídá",
          "Bezpečné předání nebylo spuštěno, protože původní zařízení už neodpovídá."
        );
      } else if (pozadavek?.reason === "handoff_busy") {
        await zobrazEditorHandoffInfo(
          "Probíhá jiné předání",
          "Tuto poznámku právě přebírá jiné zařízení. Počkej na dokončení a potom ji otevři znovu."
        );
      } else {
        await zobrazEditorHandoffInfo(
          "Předání se nezdařilo",
          "Nepodařilo se odeslat bezpečný požadavek na uložení a zavření poznámky na druhém zařízení."
        );
      }

      return false;
    }

    const prevzeti =
      await cekejNaPrevzetiEditoru({
        noteId,
        requestId,
        novaSessionId
      });

    if (prevzeti?.ok !== true) {
      skryjEditorHandoffModal();

      await zobrazEditorHandoffInfo(
        "Předání se nedokončilo",
        prevzeti?.reason ===
          "remote_save_failed"
          ? "Druhé zařízení poznámku nezavřelo, protože se mu nepodařilo bezpečně dokončit synchronizaci."
          : "Druhé zařízení nepotvrdilo bezpečné uložení a zavření včas. Poznámka zde proto nebyla otevřena."
      );

      return false;
    }

    await aktivujVzdalenyEditorSession(
      noteId,
      novaSessionId
    );

    const synchronizovano =
      await window.LubaNoteSync
        ?.synchronizujPoznamkyTed?.(noteId);

    if (!synchronizovano) {
      await uvolniEditorPoznamky(noteId);
      skryjEditorHandoffModal();

      await zobrazEditorHandoffInfo(
        "Synchronizace se nezdařila",
        "Původní zařízení poznámku bezpečně uložilo, ale toto zařízení nedokázalo stáhnout potvrzenou verzi. Zkus poznámku otevřít znovu."
      );

      return false;
    }

    skryjEditorHandoffModal();

    if (
      typeof window.zobrazPotvrzeniAkce ===
      "function"
    ) {
      window.zobrazPotvrzeniAkce(
        "Poznámka byla bezpečně převzata"
      );
    }

    return true;
  })();

  probihajiciPripravyEditoru.set(
    noteId,
    priprava
  );

  try {
    return await priprava;
  } finally {
    probihajiciPripravyEditoru.delete(noteId);
  }
}

async function uvolniEditorPoznamky(noteId) {
  const session = aktivniVzdalenyEditor;

  if (
    !session ||
    (noteId && session.noteId !== noteId)
  ) {
    return false;
  }

  zastavEditorHeartbeat();
  aktivniVzdalenyEditor = null;

  const releaseSession = {
    noteId: session.noteId,
    deviceId: ziskejDeviceIdEditoru(),
    sessionId: session.sessionId
  };

  /*
   * Release zapisujeme do malé lokální fronty ještě před síťovým
   * požadavkem. Když uživatel zavře editor právě offline nebo aplikaci
   * síť přeruší, další online návrat může starou session uklidit.
   */
  pridejCekajiciUvolneniEditoru(
    releaseSession
  );

  const prace =
    odesliJednoUvolneniEditoru(
      releaseSession
    );

  probihajiciUvolneniEditoru.set(
    session.noteId,
    prace
  );

  try {
    return await prace;
  } finally {
    if (
      probihajiciUvolneniEditoru.get(
        session.noteId
      ) === prace
    ) {
      probihajiciUvolneniEditoru.delete(
        session.noteId
      );
    }
  }
}


window.LubaNoteEditorHandoff = {
  pripravOtevreniEditoru,
  uvolniEditorPoznamky
};

function obnovKoordinaciEditoruPoNavratu() {
  if (!navigator.onLine) {
    return;
  }

  obnovEditorLease().catch(() => {});
  odesliCekajiciUvolneniEditoru()
    .catch(() => {});
}

window.addEventListener(
  "lubanote:auth-valid",
  () => {
    setTimeout(
      obnovKoordinaciEditoruPoNavratu,
      80
    );
  }
);

window.addEventListener(
  "online",
  () => {
    setTimeout(
      obnovKoordinaciEditoruPoNavratu,
      500
    );
  }
);

window.addEventListener(
  "focus",
  obnovKoordinaciEditoruPoNavratu
);

window.addEventListener(
  "pageshow",
  obnovKoordinaciEditoruPoNavratu
);

if (
  typeof document !== "undefined" &&
  typeof document.addEventListener === "function"
) {
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.visibilityState === "visible") {
        obnovKoordinaciEditoruPoNavratu();
      }
    }
  );
}
