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

    return najdiSdilenouPoznamku(noteId);
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

      const lock = await ziskejLock(note);

      if (lock?.acquired !== true) {
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
            note,
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

      /*
       * S2E – nové obrázky, které vložil tento uživatel, musí být
       * před shared save bezpečně rezervované a uploadnuté pod jeho
       * vlastním účtem. Cizí attachmenty se z lokální cache nečtou.
       */
      if (
        typeof window.LubaNoteSharingAttachments
          ?.pripravPredSharedSave === "function"
      ) {
        const pripravaPriloh =
          await window.LubaNoteSharingAttachments
            .pripravPredSharedSave(
              snapshot.data,
              session
            );

        if (pripravaPriloh?.ok !== true) {
          zobrazZpravu(
            t("sharing.readOnlyTitle", "Sdílená poznámka"),
            "Obrázek se nepodařilo bezpečně uložit do cloudu. Editor zůstal otevřený; zkontroluj připojení a zkus Uložit znovu."
          );

          return {
            ok: false,
            reason:
              pripravaPriloh?.reason ||
              pripravaPriloh?.neuspesne?.[0]?.reason ||
              "shared_attachment_prepare_failed"
          };
        }
      }

      const klient = await zajistiSupabase();

      if (!klient) {
        throw new Error("supabase_unavailable");
      }

      const { data: vysledek, error } = await klient.rpc(
        "lubanote_save_shared_note_safe",
        {
          p_note_id: session.noteId,
          p_data: snapshot.data,
          p_expected_revision:
            snapshot.context.revision,
          p_device_id: session.deviceId,
          p_session_id: session.sessionId
        }
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
    jeAktivni: () => !!aktivniSession,
    ziskejSession: () => aktivniSession
      ? { ...aktivniSession }
      : null
  };
})();
