/* ============================================================
   LubaNote – S2D.1 SHARED EDITOR CLIENT V1
   ------------------------------------------------------------
   - shared note remains outside savedTask/private sync
   - claims server editor lock before opening editor
   - 20s heartbeat renews 120s lease
   - stale lock can be safely reclaimed
   - active foreign editor remains read-only
   - saves through lubanote_save_shared_note_safe()
   - releases lock when editor closes
   - live takeover request comes in S2D.2
   - S2E uploads new shared images through uploader-owned Storage
============================================================ */

(() => {
  const LEASE_SECONDS = 120;
  const HEARTBEAT_MS = 20_000;

  let aktivniSession = null;
  let heartbeatTimer = null;
  let probihaUlozeni = false;
  let probihaOtevreni = false;

  function t(klic, zaloha, promenne = null) {
    const fn = window.LubaNoteI18n?.t;

    if (typeof fn === "function") {
      try {
        return promenne
          ? fn(klic, zaloha, promenne)
          : fn(klic, zaloha);
      } catch (_) {
        return zaloha;
      }
    }

    if (!promenne) {
      return zaloha;
    }

    return String(zaloha).replace(/\{(\w+)\}/g, (_, key) =>
      promenne[key] ?? `{${key}}`
    );
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

  function ziskejDeviceId() {
    if (
      typeof window.LubaNoteSync?.ziskejDeviceId ===
      "function"
    ) {
      return window.LubaNoteSync.ziskejDeviceId();
    }

    let deviceId = localStorage.getItem("lubanoteDeviceId");

    if (!deviceId) {
      deviceId = crypto.randomUUID();
      localStorage.setItem("lubanoteDeviceId", deviceId);
    }

    return deviceId;
  }

  function vytvorSessionId() {
    return (
      crypto.randomUUID?.() ||
      `shared-editor-${Date.now()}-${Math.random()
        .toString(16)
        .slice(2)}`
    );
  }

  function zobrazZpravu(nadpis, text) {
    window.LubaNoteSharedEditorHost
      ?.zobrazZpravu?.(nadpis, text);
  }

  function obsahujeInlineFotografii(note) {
    return [
      note?.richContent,
      ...(Array.isArray(note?.todos)
        ? note.todos.map((todo) => todo?.html)
        : [])
    ].some((html) =>
      typeof html === "string" &&
      /<img\b[^>]*\bsrc\s*=\s*["']data:image\//i.test(html)
    );
  }

  function oznamBlokovanouSharedFotografii() {
    zobrazZpravu(
      t("sharing.readOnlyTitle", "Sdílená poznámka"),
      "Fotografie ve sdílených poznámkách zatím nelze bezpečně uložit. Shared media dostanou vlastní E2E klíč v části Shared handoff."
    );
  }

  function zastavHeartbeat() {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  async function obnovLease() {
    const session = aktivniSession;

    if (!session || !navigator.onLine) {
      return false;
    }

    const klient = await zajistiSupabase();

    if (!klient) {
      return false;
    }

    const { data, error } = await klient.rpc(
      "lubanote_refresh_shared_note_editor",
      {
        p_note_id: session.noteId,
        p_device_id: session.deviceId,
        p_session_id: session.sessionId,
        p_lease_seconds: LEASE_SECONDS
      }
    );

    if (error || data !== true) {
      return false;
    }

    return true;
  }

  async function zpracujZtratuLocku() {
    if (!aktivniSession) {
      return;
    }

    aktivniSession = null;
    zastavHeartbeat();

    window.LubaNoteSharedEditorHost
      ?.zavriPoZtrateLocku?.();

    zobrazZpravu(
      t("sharing.readOnlyTitle", "Sdílená poznámka"),
      t(
        "sharing.sharedEditorLockLost",
        "Editor lock už není platný. Sdílený editor byl bezpečně zavřen."
      )
    );
  }

  function spustHeartbeat() {
    zastavHeartbeat();

    heartbeatTimer = setInterval(async () => {
      if (!aktivniSession) {
        zastavHeartbeat();
        return;
      }

      if (!navigator.onLine) {
        return;
      }

      try {
        const ok = await obnovLease();

        if (!ok) {
          await zpracujZtratuLocku();
        }
      } catch (error) {
        console.warn(
          "Sdílený editor: heartbeat selhal.",
          error
        );
      }
    }, HEARTBEAT_MS);
  }

  function najdiSdilenouPoznamku(noteId) {
    return window.LubaNoteSharingNotes
      ?.ziskejSdilenePoznamky?.()
      ?.find((note) => note?.id === noteId) || null;
  }

  async function nactiAktualniSdilenouPoznamku(noteId) {
    if (!noteId) {
      return null;
    }

    try {
      await window.LubaNoteSharingNotes
        ?.obnovZeServeru?.({
          tichy: true,
          vykreslit: false
        });
    } catch (_) {
      // Autoritativní claim níže ještě ověří oprávnění.
    }

    const note = najdiSdilenouPoznamku(noteId);
    return note?.__lubanoteSharedE2ELocked === true ? null : note;
  }

  async function ziskejLock(note) {
    const klient = await zajistiSupabase();

    if (!klient) {
      throw new Error("supabase_unavailable");
    }

    const deviceId = ziskejDeviceId();
    const sessionId = vytvorSessionId();

    const { data: claim, error } = await klient.rpc(
      "lubanote_claim_shared_note_editor",
      {
        p_note_id: note.id,
        p_device_id: deviceId,
        p_session_id: sessionId,
        p_lease_seconds: LEASE_SECONDS
      }
    );

    if (error) {
      throw error;
    }

    if (claim?.acquired === true) {
      return {
        acquired: true,
        deviceId,
        sessionId
      };
    }

    if (claim?.stale === true) {
      const { data: force, error: forceError } = await klient.rpc(
        "lubanote_force_claim_stale_shared_note_editor",
        {
          p_note_id: note.id,
          p_device_id: deviceId,
          p_session_id: sessionId,
          p_lease_seconds: LEASE_SECONDS
        }
      );

      if (forceError) {
        throw forceError;
      }

      if (force?.acquired === true) {
        return {
          acquired: true,
          deviceId,
          sessionId
        };
      }

      return {
        acquired: false,
        editorUsername:
          force?.editor_username ||
          claim?.editor_username ||
          "@?"
      };
    }

    return {
      acquired: false,
      editorUsername:
        claim?.editor_username || "@?"
    };
  }

  function vytvorKanonickaSharedData(note) {
    const data = {
      ...(note && typeof note === "object" ? note : {})
    };

    /*
     * Data vrácená shared RPC obsahují i klientská pomocná pole.
     * Ta se nikdy nesmí zapsat zpět do notes.data.
     */
    Object.keys(data).forEach((klic) => {
      if (klic.startsWith("__lubanoteShared") &&
          klic !== "__lubanoteSharedContentE2E") {
        delete data[klic];
      }
    });

    data.isSecret = false;
    return data;
  }

  /* 699D-BW: shared E2E pouziva novy RPC, ktery prijima VYHRADNE dve
   * kryptograficke obalky. Personalni udaje nesmi propadnout do p_data
   * stavajiciho plaintext shared RPC. */
  async function ulozSdilenouPoznamkuNaServer(
    klient, note, cloudData, expectedRevision, lock, trashAction = null
  ) {
    if (note?.__lubanoteSharedContentE2E !== true) {
      return await klient.rpc("lubanote_save_shared_note_safe", {
        p_note_id: note.id,
        p_data: cloudData,
        p_expected_revision: expectedRevision,
        p_device_id: lock.deviceId,
        p_session_id: lock.sessionId
      });
    }

    const obalka = {};
    for (const klic of [
      "__lubanoteSharedContentE2E", "version", "keyVersion",
      "algorithm", "iv", "ciphertext"
    ]) {
      obalka[klic] = cloudData?.[klic];
    }
    if (obalka.__lubanoteSharedContentE2E !== true ||
        obalka.algorithm !== "AES-256-GCM" || !obalka.iv || !obalka.ciphertext) {
      throw new Error("shared_e2e_save_envelope_missing");
    }
    const noteCrypto = window.LubaNoteNotesCrypto;
    const { data: auth, error: authError } = await klient.auth.getUser();
    const userId = auth?.user?.id;
    if (authError || !userId || !noteCrypto?.zasifruj) {
      throw new Error("shared_e2e_personal_crypto_unavailable");
    }
    const osobni = { id: note.id, isSecret: false };
    for (const klic of [
      "date", "reminder", "favorite", "notificationId", "area", "pinned",
      "tags", "repeat", "plannedItems", "completed", "planned"
    ]) {
      if (Object.prototype.hasOwnProperty.call(note, klic)) {
        osobni[klic] = note[klic];
      }
    }
    const soukromaObalka = await noteCrypto.zasifruj(osobni, userId);
    return await klient.rpc("lubanote_save_shared_note_e2e_v1", {
      p_note_id: note.id,
      p_shared_envelope: obalka,
      p_personal_envelope: soukromaObalka,
      p_expected_revision: expectedRevision,
      p_device_id: lock.deviceId,
      p_session_id: lock.sessionId,
      p_trash_action: trashAction
    });
  }

  async function uvolniDocasnySharedLock(noteId, lock) {
    if (!noteId || !lock?.deviceId || !lock?.sessionId) {
      return;
    }

    try {
      const klient = await zajistiSupabase();
      if (!klient) return;

      await klient.rpc(
        "lubanote_release_shared_note_editor",
        {
          p_note_id: noteId,
          p_device_id: lock.deviceId,
          p_session_id: lock.sessionId
        }
      );
    } catch (error) {
      console.warn(
        "Sdílení: dočasný shared lock se nepodařilo uvolnit.",
        error
      );
    }
  }

  async function ulozVlastniSharedZmenuBezEditoru(
    noteId,
    upravData
  ) {
    if (!noteId) {
      return { handled: false, ok: false, reason: "missing_note_id" };
    }

    if (!navigator.onLine) {
      zobrazZpravu(
        t("sharing.readOnlyTitle", "Sdílená poznámka"),
        "Změna sdílené poznámky vyžaduje připojení k internetu."
      );
      return { handled: true, ok: false, reason: "offline" };
    }

    let note = null;
    let lock = null;

    try {
      note = await nactiAktualniSdilenouPoznamku(noteId);

      if (!note || note.__lubanoteSharedRole !== "owner") {
        return { handled: false, ok: false, reason: "not_owned_shared" };
      }

      lock = await ziskejLock(note);

      if (lock?.acquired !== true) {
        window.LubaNoteSharingNotes
          ?.nastavAktivniEditor?.(
            note.id,
            lock?.editorUsername || "@?"
          );

        zobrazZpravu(
          t("sharing.readOnlyTitle", "Sdílená poznámka"),
          t(
            "sharing.sharedEditorBusy",
            "Poznámku právě upravuje {username}. Zatím ji můžeš pouze číst.",
            { username: lock?.editorUsername || "@?" }
          )
        );
        return { handled: true, ok: false, reason: "shared_editor_busy" };
      }

      const klient = await zajistiSupabase();
      if (!klient) {
        throw new Error("supabase_unavailable");
      }

      const cas = new Date().toISOString();
      const data = vytvorKanonickaSharedData(note);

      if (typeof upravData === "function") {
        upravData(data, cas);
      }

      data.id = note.id;
      data.updatedAt = cas;
      data.isSecret = false;

      const dataProCloud = await window.LubaNoteSharedMediaCrypto
        ?.pripravSdilenouPoznamkuProCloud?.(data) || data;

      const trashAction = note.__lubanoteSharedContentE2E === true
        ? (data.trashedAt && !note.trashedAt ? "trash" :
           !data.trashedAt && note.trashedAt ? "restore" : null)
        : null;
      const { data: vysledek, error } = await ulozSdilenouPoznamkuNaServer(
        klient, data, dataProCloud,
        Number(note.__lubanoteSharedRevision) || 0, lock, trashAction
      );

      if (error) {
        throw error;
      }

      if (vysledek?.ok !== true) {
        throw new Error(
          vysledek?.reason || "shared_save_rejected"
        );
      }

      /* 699D-CG: Server potvrdi Shared trash/restore, ale private
       * savedTask zustava zamerne beze zmeny. Promitneme potvrzeny
       * stav do Shared cache HNED, i kdyby nasledujici refresh selhal.
       * Zadny zapis stare soukrome E2E obalky do private syncu. */
      if (trashAction || data.trashedAt !== note.trashedAt) {
        window.LubaNoteSharingNotes
          ?.nastavStavKoseVlastniSdilenePoznamky?.(
            note.id, data.trashedAt || null
          );
      }

      await window.LubaNoteSharingNotes
        ?.obnovZeServeru?.({
          tichy: true,
          vykreslit: true
        });

      try {
        await window.LubaNoteSync?.spustRychle?.();
      } catch (error) {
        console.warn(
          "Sdílení: owner sync po serverové změně se dokončí později.",
          error
        );
      }

      window.dispatchEvent(
        new CustomEvent("lubanote:shared-note-saved", {
          detail: {
            noteId: note.id,
            revision:
              Number(vysledek?.revision) ||
              Number(note.__lubanoteSharedRevision) ||
              0
          }
        })
      );

      return {
        handled: true,
        ok: true,
        noteId: note.id,
        revision: Number(vysledek?.revision) || 0
      };
    } catch (error) {
      console.error(
        "Sdílení: serverová změna vlastní shared poznámky selhala:",
        error
      );

      zobrazZpravu(
        t("sharing.readOnlyTitle", "Sdílená poznámka"),
        "Změnu sdílené poznámky se nepodařilo bezpečně uložit."
      );

      return {
        handled: !!note && note.__lubanoteSharedRole === "owner",
        ok: false,
        reason: error?.message || "shared_owner_change_failed"
      };
    } finally {
      await uvolniDocasnySharedLock(noteId, lock);
    }
  }

  /* ============================================================
     PATCH 668B – TRVALÉ SMAZÁNÍ VLASTNÍ SHARED POZNÁMKY
     ------------------------------------------------------------
     „Trvale smazat“ používá v celé LubaNote serverový tombstone.
     U vlastní Shared poznámky ale před tombstonem musíme nejdřív
     autoritativně ukončit všechny vztahy sdílení. Jinak by private
     delete správně narazil na serverový shared guard a poznámka by
     se po syncu mohla znovu objevit.

     Bezpečné pořadí:
       1) zrušit pending invitations,
       2) odebrat všechny collaboratory (server zároveň revoke-ne
          jejich key envelope),
       3) znovu ověřit, že nezůstal žádný vztah,
       4) refreshnout Shared cache a ověřit Shared -> Private,
       5) načíst aktuální private revision pro následný tombstone.

     Při jakékoli nejistotě se delete NEPROVEDE a poznámka zůstane
     v Koši. Částečně provedený revoke je bezpečný – pouze zúží
     přístup, nikdy nemaže obsah poznámky.
  ============================================================ */
  function ziskejRadkyProSharedDelete(data, klice = []) {
    if (!data) {
      return [];
    }

    if (Array.isArray(data)) {
      if (
        data.length === 1 &&
        data[0] &&
        typeof data[0] === "object"
      ) {
        for (const klic of klice) {
          if (Array.isArray(data[0][klic])) {
            return data[0][klic];
          }
        }
      }

      return data;
    }

    if (typeof data === "object") {
      for (const klic of klice) {
        if (Array.isArray(data[klic])) {
          return data[klic];
        }
      }
    }

    return [];
  }

  function normalizujUsernameProSharedDelete(hodnota) {
    return String(hodnota || "")
      .trim()
      .replace(/^@+/, "");
  }

  async function nactiVztahyProSharedDelete(klient, noteId) {
    const [collabResponse, pendingResponse] = await Promise.all([
      klient.rpc(
        "lubanote_get_note_collaborators",
        { p_note_id: noteId }
      ),
      klient.rpc(
        "lubanote_get_note_pending_invitations",
        { p_note_id: noteId }
      )
    ]);

    if (collabResponse.error) {
      throw collabResponse.error;
    }

    if (pendingResponse.error) {
      throw pendingResponse.error;
    }

    return {
      collaborators: ziskejRadkyProSharedDelete(
        collabResponse.data,
        ["collaborators", "users"]
      ),
      pending: ziskejRadkyProSharedDelete(
        pendingResponse.data,
        ["invitations", "pending"]
      )
    };
  }

  /* 699D-BW: po odvolani posledniho sdileni musi byt aktualni E2E
   * shared obsah znovu zasifrovan Root Key vlastnika. Pouzit puvodni
   * private ciphertext by znamenalo ztratu editaci spolupracovnika. */
  async function bezpecneUkonciSdileniE2E(noteId, { synchronizovat = true } = {}) {
    if (!navigator.onLine) throw new Error("shared_e2e_detach_offline");
    const klient = await zajistiSupabase();
    if (!klient) throw new Error("supabase_unavailable");
    const note = await nactiAktualniSdilenouPoznamku(noteId);
    if (!note || note.__lubanoteSharedContentE2E !== true) {
      return { handled: false, ok: true };
    }
    if (note.__lubanoteSharedRole !== "owner") {
      throw new Error("shared_e2e_detach_not_owner");
    }

    const vztahy = await nactiVztahyProSharedDelete(klient, noteId);
    if (vztahy.pending.length || vztahy.collaborators.some(
      row => String(row?.role || "").toLowerCase() !== "owner"
    )) {
      return { handled: true, ok: false, reason: "sharing_still_active" };
    }

    const noteCrypto = window.LubaNoteNotesCrypto;
    const sharedCrypto = window.LubaNoteSharedMediaCrypto;
    const { data: auth, error: authError } = await klient.auth.getUser();
    const userId = auth?.user?.id;
    if (authError || !userId || !noteCrypto?.zasifruj ||
        !sharedCrypto?.desifrujSdilenouPoznamkuZCloudu) {
      throw new Error("shared_e2e_detach_crypto_unavailable");
    }
    const obsah = await sharedCrypto.desifrujSdilenouPoznamkuZCloudu(note);
    const { data: puvodniRows, error: puvodniError } = await klient.rpc(
      "lubanote_get_notes_by_ids_safe", { p_note_ids: [noteId] }
    );
    if (puvodniError) throw puvodniError;
    const puvodniRow = Array.isArray(puvodniRows)
      ? puvodniRows.find(row => String(row?.id || "") === noteId &&
          row?.user_id === userId)
      : null;
    if (!puvodniRow?.data ||
        Number(puvodniRow.revision) !== Number(note.__lubanoteSharedRevision)) {
      throw new Error("shared_e2e_detach_stale_revision");
    }
    const puvodniSoukroma = await noteCrypto.desifruj(
      puvodniRow.data, userId, noteId
    );
    const soukroma = {
      ...puvodniSoukroma,
      id: noteId,
      updatedAt: new Date().toISOString(),
      isSecret: false,
      title: obsah.title || "",
      note: obsah.note || "",
      richContent: obsah.richContent || "",
      todos: Array.isArray(obsah.todos) ? obsah.todos : []
    };
    for (const pole of [
      "date", "reminder", "favorite", "notificationId", "area", "pinned",
      "tags", "repeat", "plannedItems", "completed", "planned"
    ]) {
      if (Object.prototype.hasOwnProperty.call(note, pole)) {
        soukroma[pole] = note[pole];
      }
    }
    if (note.trashedAt) soukroma.trashedAt = note.trashedAt;

    const obalka = await noteCrypto.zasifruj(soukroma, userId);
    const { data: vysledek, error } = await klient.rpc(
      "lubanote_detach_shared_e2e_v1", {
        p_note_id: noteId,
        p_expected_revision: Number(note.__lubanoteSharedRevision) || 0,
        p_private_envelope: obalka
      }
    );
    if (error || vysledek?.ok !== true) {
      throw error || new Error(vysledek?.reason || "shared_e2e_detach_rejected");
    }
    await window.LubaNoteSharingNotes?.obnovZeServeru?.({
      tichy: true, vykreslit: true
    });
    if (synchronizovat) {
      try {
        await window.LubaNoteSync?.spustRychle?.();
      } catch (syncError) {
        console.warn("Sdílení: private sync po bezpečném odpojení počká.", syncError);
      }
    }
    return { handled: true, ok: true };
  }

  async function odpojVlastniSdilenouPoznamkuPredTrvalymSmazanim(
    noteId
  ) {
    if (!noteId) {
      return {
        handled: false,
        ok: false,
        reason: "missing_note_id"
      };
    }

    if (!navigator.onLine) {
      zobrazZpravu(
        t("sharing.readOnlyTitle", "Sdílená poznámka"),
        "Trvalé smazání sdílené poznámky vyžaduje připojení k internetu."
      );

      return {
        handled: true,
        ok: false,
        reason: "offline"
      };
    }

    let note = null;

    try {
      note = await nactiAktualniSdilenouPoznamku(noteId);

      if (!note || note.__lubanoteSharedRole !== "owner") {
        return {
          handled: false,
          ok: false,
          reason: "not_owned_shared"
        };
      }

      const klient = await zajistiSupabase();
      if (!klient) {
        throw new Error("supabase_unavailable");
      }

      const vztahy = await nactiVztahyProSharedDelete(
        klient,
        noteId
      );

      /* Nejdřív zavřeme všechny dosud nepřijaté cesty ke sdílení. */
      for (const row of vztahy.pending) {
        const invitationId = row?.invitation_id ?? row?.id;

        if (!invitationId) {
          throw new Error("shared_delete_invitation_id_missing");
        }

        const { data, error } = await klient.rpc(
          "lubanote_cancel_note_invitation",
          { p_invitation_id: invitationId }
        );

        if (error) {
          throw error;
        }

        if (data?.ok === false) {
          throw new Error(
            data.reason || "shared_delete_cancel_invitation_failed"
          );
        }
      }

      /* Potom revoke všech aktivních collaboratorů. Owner se nikdy nemaže. */
      for (const row of vztahy.collaborators) {
        const role = String(row?.role || "editor").toLowerCase();
        if (role === "owner") {
          continue;
        }

        const username = normalizujUsernameProSharedDelete(
          row?.username ?? row?.user_name
        );

        if (!username) {
          throw new Error("shared_delete_collaborator_username_missing");
        }

        const { data, error } = await klient.rpc(
          "lubanote_remove_note_collaborator",
          {
            p_note_id: noteId,
            p_username: username
          }
        );

        if (error) {
          throw error;
        }

        if (data?.ok === false) {
          throw new Error(
            data.reason || "shared_delete_remove_collaborator_failed"
          );
        }
      }

      /* Autoritativní kontrola po revoke – nic nesmíme pouze předpokládat. */
      const kontrola = await nactiVztahyProSharedDelete(
        klient,
        noteId
      );

      const zbyvajiciCollaboratori = kontrola.collaborators.filter(
        (row) => String(row?.role || "editor").toLowerCase() !== "owner"
      );

      if (
        zbyvajiciCollaboratori.length > 0 ||
        kontrola.pending.length > 0
      ) {
        throw new Error("shared_delete_relationships_remain");
      }

      if (note.__lubanoteSharedContentE2E === true) {
        const odpojeni = await bezpecneUkonciSdileniE2E(noteId, {
          synchronizovat: false
        });
        if (odpojeni.ok !== true) {
          throw new Error(odpojeni.reason || "shared_e2e_detach_failed");
        }
      } else {
        await window.LubaNoteSharingNotes
          ?.obnovZeServeru?.({
            tichy: true,
            vykreslit: false
          });
      }

      if (
        window.LubaNoteSharingNotes
          ?.jeVlastniSdilenaPoznamka?.(noteId) === true
      ) {
        throw new Error("shared_delete_still_classified_as_shared");
      }

      /*
       * Po Shared -> Private načteme přesnou aktuální serverovou revizi.
       * Shared save se záměrně nepromítá do private sync meta, takže
       * stará lokální revize by mohla způsobit delete_revision_mismatch.
       */
      const { data: privateRows, error: privateError } =
        await klient.rpc(
          "lubanote_get_notes_by_ids_safe",
          { p_note_ids: [noteId] }
        );

      if (privateError) {
        throw privateError;
      }

      const privateRow = (Array.isArray(privateRows) ? privateRows : [])
        .find((row) => String(row?.id || row?.note_id || "") === String(noteId));

      const expectedRevision = Number(privateRow?.revision);

      if (
        !privateRow ||
        privateRow?.deleted_at ||
        !Number.isFinite(expectedRevision)
      ) {
        throw new Error("shared_delete_private_revision_unavailable");
      }

      return {
        handled: true,
        ok: true,
        noteId,
        expectedRevision
      };
    } catch (error) {
      console.error(
        "Sdílení: příprava Shared poznámky na trvalé smazání selhala:",
        error
      );

      zobrazZpravu(
        t("sharing.readOnlyTitle", "Sdílená poznámka"),
        "Sdílení se nepodařilo bezpečně ukončit. Poznámka zůstala v Koši."
      );

      return {
        handled: !!note && note.__lubanoteSharedRole === "owner",
        ok: false,
        reason:
          error?.message || "shared_delete_detach_failed"
      };
    }
  }

  async function presunVlastniSdilenouPoznamkuDoKose(noteId) {
    return await ulozVlastniSharedZmenuBezEditoru(
      noteId,
      (data, cas) => {
        data.trashedAt = cas;
      }
    );
  }

  async function obnovVlastniSdilenouPoznamkuZKose(noteId) {
    return await ulozVlastniSharedZmenuBezEditoru(
      noteId,
      (data) => {
        delete data.trashedAt;
      }
    );
  }

  async function otevriSdilenouEditaci(noteId) {
    if (probihaOtevreni) {
      return false;
    }

    if (!navigator.onLine) {
      zobrazZpravu(
        t("sharing.readOnlyTitle", "Sdílená poznámka"),
        t(
          "sharing.sharedEditorOffline",
          "Sdílenou poznámku lze upravovat jen online."
        )
      );
      return false;
    }

    if (
      typeof window.LubaNoteSharedEditorHost
        ?.otevriSdilenouPoznamku !==
      "function"
    ) {
      return false;
    }

    probihaOtevreni = true;

    const ukonciCekani =
      window.LubaNoteUI?.zacniCekaniAkce?.(
        t(
          "sharing.sharedEditorOpening",
          "Otevírám sdílený editor…"
        ),
        180
      ) || (() => {});

    try {
      const note =
        await nactiAktualniSdilenouPoznamku(noteId);

      if (!note) {
        zobrazZpravu(
          t("sharing.readOnlyTitle", "Sdílená poznámka"),
          t(
            "sharing.loadFailed",
            "Data sdílení se nepodařilo načíst."
          )
        );
        return false;
      }

      const noteProEditor = await window.LubaNoteSharedMediaCrypto
        ?.desifrujSdilenouPoznamkuZCloudu?.(note) || note;

      const lock = await ziskejLock(note);

      if (lock?.acquired !== true) {
        window.LubaNoteSharingNotes
          ?.nastavAktivniEditor?.(
            note.id,
            lock?.editorUsername || "@?"
          );

        /*
         * S2E.1: Pokud poznámku drží jiný editor, nesmíme uživatele
         * po zavření informačního dialogu nechat zpět na seznamu karet.
         * Nejdřív otevřeme autoritativní read-only viewer a teprve nad něj
         * zobrazíme hlášku. Po potvrzení OK tak uživatel rovnou pokračuje
         * ve čtení sdílené poznámky.
         */
        window.LubaNoteSharingNotes
          ?.otevriReadOnly?.(note.id);

        zobrazZpravu(
          t("sharing.readOnlyTitle", "Sdílená poznámka"),
          t(
            "sharing.sharedEditorBusy",
            "Poznámku právě upravuje {username}. Zatím ji můžeš pouze číst.",
            {
              username:
                lock?.editorUsername || "@?"
            }
          )
        );
        return false;
      }

      window.LubaNoteSharingNotes
        ?.zrusAktivniEditor?.(note.id);

      aktivniSession = {
        noteId: note.id,
        deviceId: lock.deviceId,
        sessionId: lock.sessionId,
        revision:
          Number(note.__lubanoteSharedRevision) || 0
      };

      const otevreno =
        window.LubaNoteSharedEditorHost
          .otevriSdilenouPoznamku(
            noteProEditor,
            {
              revision:
                aktivniSession.revision,
              ownerUsername:
                note.__lubanoteSharedOwnerUsername,
              role:
                note.__lubanoteSharedRole
            }
          );

      if (otevreno !== true) {
        await uvolniSdilenyEditor(note.id);
        return false;
      }

      window.LubaNoteSharingNotes
        ?.zavriReadOnly?.();

      spustHeartbeat();
      return true;
    } catch (error) {
      console.error(
        "Sdílený editor se nepodařilo otevřít:",
        error
      );

      zobrazZpravu(
        t("sharing.readOnlyTitle", "Sdílená poznámka"),
        t(
          "sharing.loadFailed",
          "Data sdílení se nepodařilo načíst."
        )
      );

      return false;
    } finally {
      ukonciCekani();
      probihaOtevreni = false;
    }
  }

  async function ulozAZavriSdilenyEditor(
    moznosti = {}
  ) {
    if (probihaUlozeni) {
      return {
        ok: false,
        reason: "save_in_progress"
      };
    }

    const session = aktivniSession;
    const host = window.LubaNoteSharedEditorHost;

    if (!session || !host?.vytvorDataProUlozeni) {
      return {
        ok: false,
        reason: "shared_editor_session_missing"
      };
    }

    if (!navigator.onLine) {
      zobrazZpravu(
        t("sharing.readOnlyTitle", "Sdílená poznámka"),
        t(
          "sharing.sharedEditorOffline",
          "Sdílenou poznámku lze upravovat jen online."
        )
      );

      return {
        ok: false,
        reason: "offline"
      };
    }

    probihaUlozeni = true;

    const ukonciCekani =
      window.LubaNoteUI?.zacniCekaniAkce?.(
        "Ukládám sdílenou poznámku…",
        180
      ) || (() => {});

    try {
      const leaseOk = await obnovLease();

      if (!leaseOk) {
        await zpracujZtratuLocku();
        return {
          ok: false,
          reason: "shared_editor_lock_lost"
        };
      }

      const snapshot = host.vytvorDataProUlozeni();

      if (!snapshot?.data || !snapshot?.context) {
        throw new Error("shared_snapshot_missing");
      }

      const dataProCloud = await window.LubaNoteSharedMediaCrypto
        ?.pripravSdilenouPoznamkuProCloud?.(snapshot.data) || snapshot.data;

      const klient = await zajistiSupabase();

      if (!klient) {
        throw new Error("supabase_unavailable");
      }

      const { data: vysledek, error } = await ulozSdilenouPoznamkuNaServer(
        klient, snapshot.data, dataProCloud, snapshot.context.revision,
        { deviceId: session.deviceId, sessionId: session.sessionId }
      );

      if (error) {
        throw error;
      }

      if (vysledek?.ok !== true) {
        if (vysledek?.conflict === true) {
          zobrazZpravu(
            t("sharing.readOnlyTitle", "Sdílená poznámka"),
            t(
              "sharing.sharedEditorConflict",
              "Na serveru je novější verze poznámky. Editor zůstal otevřený; zavři jej bez uložení a otevři poznámku znovu."
            )
          );

          return {
            ok: false,
            reason:
              vysledek?.reason || "revision_conflict"
          };
        }

        throw new Error(
          vysledek?.reason ||
          "shared_save_rejected"
        );
      }

      session.revision =
        Number(vysledek.revision) ||
        session.revision;

      host.aktualizujRevision?.(
        session.revision
      );

      /*
       * Až po úspěšném canonical shared save necháme server z notes.data
       * sám vyhodnotit attachment reference napříč všemi uploadery.
       * Tím se odstranění cizího obrázku nikdy neřeší přes jeho storage
       * path v klientu.
       */
      if (
        typeof window.LubaNoteSharingAttachments
          ?.synchronizujPoSharedSave === "function"
      ) {
        const syncPriloh =
          await window.LubaNoteSharingAttachments
            .synchronizujPoSharedSave(
              session.noteId
            );

        if (syncPriloh?.ok !== true) {
          console.warn(
            "Sdílený editor: reference obrázků se dokončí při dalším online uložení.",
            syncPriloh
          );
        }
      }

      const zavreno =
        moznosti?.nezavirat === true
          ? true
          : host.zavriPoUlozeni?.();

      if (moznosti?.nezavirat !== true) {
        /* release probíhá přes host close -> uvolniSdilenyEditor() */
        setTimeout(() => {
          window.LubaNoteSharingNotes
            ?.obnovZeServeru?.({
              tichy: true,
              vykreslit: true
            });

          /*
           * Vlastník má shared note stále i v běžném lokálním seznamu
           * kvůli Planneru/reminderům. Po shared save proto hned stáhneme
           * novou serverovou revizi do této lokální kopie. Sync už díky
           * owner-shared guardu nevytvoří konfliktní kopii ani nic neposílá
           * zpět přes private save_note_safe().
           */
          window.LubaNoteSync
            ?.spustRychle?.()
            ?.catch?.((error) => {
              console.warn(
                "Sdílený editor: následný owner sync se dokončí později.",
                error
              );
            });
        }, 120);
      }

      window.dispatchEvent(
        new CustomEvent(
          "lubanote:shared-note-saved",
          {
            detail: {
              noteId: session.noteId,
              revision: session.revision
            }
          }
        )
      );

      if (
        moznosti?.nezavirat !== true &&
        zavreno === true
      ) {
        window.LubaNoteUI
          ?.zobrazPotvrzeniAkce?.(
            t(
              "sharing.sharedEditorSaved",
              "Sdílená poznámka byla uložena."
            )
          );
      }

      return {
        ok: true,
        noteId: session.noteId,
        revision: session.revision
      };
    } catch (error) {
      console.error(
        "Uložení sdílené poznámky selhalo:",
        error
      );

      if (moznosti?.tichyRezim !== true) {
        zobrazZpravu(
          t("sharing.readOnlyTitle", "Sdílená poznámka"),
          t(
            "sharing.sharedEditorSaveFailed",
            "Sdílenou poznámku se nepodařilo bezpečně uložit. Editor zůstal otevřený."
          )
        );
      }

      return {
        ok: false,
        reason:
          error?.message || "shared_save_failed",
        error
      };
    } finally {
      ukonciCekani();
      probihaUlozeni = false;
    }
  }

  async function uvolniSdilenyEditor(noteId = null) {
    const session = aktivniSession;

    if (
      !session ||
      (noteId && session.noteId !== noteId)
    ) {
      return false;
    }

    aktivniSession = null;
    zastavHeartbeat();
    window.LubaNoteSharingNotes
      ?.zrusAktivniEditor?.(session.noteId);

    if (!navigator.onLine) {
      return false;
    }

    try {
      const klient = await zajistiSupabase();

      if (!klient) {
        return false;
      }

      const { data, error } = await klient.rpc(
        "lubanote_release_shared_note_editor",
        {
          p_note_id: session.noteId,
          p_device_id: session.deviceId,
          p_session_id: session.sessionId
        }
      );

      if (error) {
        console.warn(
          "Sdílený editor: release selhal.",
          error
        );
        return false;
      }

      return data === true || data === false;
    } catch (error) {
      console.warn(
        "Sdílený editor: release selhal.",
        error
      );
      return false;
    }
  }

  window.addEventListener("offline", () => {
    /*
     * Offline samotný editor okamžitě nezavíráme; uživatel může text
     * zkopírovat. Uložit ale nepovolíme a heartbeat se po návratu sítě
     * musí znovu autoritativně ověřit.
     */
  });

  window.addEventListener("online", async () => {
    if (!aktivniSession) {
      return;
    }

    try {
      const ok = await obnovLease();
      if (!ok) {
        await zpracujZtratuLocku();
      }
    } catch (_) {
      // Další heartbeat rozhodne autoritativně.
    }
  });

  window.LubaNoteSharedEditor = {
    otevriSdilenouEditaci,
    ulozAZavriSdilenyEditor,
    uvolniSdilenyEditor,
    presunVlastniSdilenouPoznamkuDoKose,
    obnovVlastniSdilenouPoznamkuZKose,
    odpojVlastniSdilenouPoznamkuPredTrvalymSmazanim,
    bezpecneUkonciSdileniE2E,
    jeAktivni: () => !!aktivniSession,
    ziskejSession: () => aktivniSession
      ? { ...aktivniSession }
      : null
  };
})();
