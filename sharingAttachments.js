/* ============================================================
   LubaNote – S2E SHARED ATTACHMENTS CLIENT V1
   ------------------------------------------------------------
   - new shared images keep the existing Data URL in note content
   - uploader's JPEG shadow Blob is reserved/uploaded under uploader
   - shared reserve requires exact active shared editor lock
   - foreign storage paths are never requested or exposed
   - after shared save the server parses canonical note data itself
     and activates / marks removed attachment refs across uploaders
============================================================ */

(() => {
  const BUCKET = "lubanote-attachments";
  const FAZE_CLOUD = "cloud_shadow_v1";

  const probihajiciUploady = new Map();

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

  function ziskejAttachmentIds(note) {
    if (
      typeof window.LubaNoteAttachmentsCloud
        ?.ziskejAttachmentIdsZPoznamky === "function"
    ) {
      return window.LubaNoteAttachmentsCloud
        .ziskejAttachmentIdsZPoznamky(note);
    }

    const ids = new Set();
    const pridejZHtml = (html) => {
      if (typeof html !== "string" || !html) {
        return;
      }

      const regex = /data-attachment-id\s*=\s*["']([^"']+)["']/gi;
      let shoda;

      while ((shoda = regex.exec(html)) !== null) {
        const id = String(shoda[1] || "").trim();
        if (id) {
          ids.add(id);
        }
      }
    };

    pridejZHtml(note?.richContent);

    for (const todo of Array.isArray(note?.todos) ? note.todos : []) {
      pridejZHtml(todo?.html);
    }

    return Array.from(ids);
  }

  function jeChybaDuplicitnihoUploadu(error) {
    const text = String(
      error?.message || error?.error || error || ""
    ).toLowerCase();

    return (
      text.includes("duplicate") ||
      text.includes("already exists") ||
      text.includes("resource already exists")
    );
  }

  async function aktualizujLokalniStav(id, zmeny) {
    try {
      await window.LubaNoteAttachmentsLocal
        ?.upravPrilohu?.(id, zmeny);
    } catch (_) {
      // Server je autorita; lokální diagnostický stav se může opravit později.
    }
  }

  async function aktualizujLokalniFrontu(id, zmeny) {
    try {
      await window.LubaNoteAttachmentsLocal
        ?.aktualizujUpload?.(id, zmeny);
    } catch (_) {
      // Fronta je podpůrná cache a nesmí rozbít shared save.
    }
  }

  async function nahrajJednuSdilenouPrilohu(
    attachmentId,
    noteId,
    session
  ) {
    if (!attachmentId || !noteId || !session) {
      return {
        ok: false,
        reason: "missing_identity"
      };
    }

    if (probihajiciUploady.has(attachmentId)) {
      return probihajiciUploady.get(attachmentId);
    }

    const promise = (async () => {
      const lokalni = window.LubaNoteAttachmentsLocal;

      if (!lokalni?.nactiPrilohu) {
        return {
          ok: false,
          reason: "local_module_missing"
        };
      }

      const zaznam = await lokalni.nactiPrilohu(attachmentId);

      /*
       * Cizí attachment nebo starší attachment nemusí být v lokální
       * cache tohoto uživatele. To je správně: jeho cloudový objekt
       * vlastní původní uploader a zůstane nedotčený.
       */
      if (!zaznam) {
        return {
          ok: true,
          skipped: true,
          reason: "not_local_uploader"
        };
      }

      if (zaznam.faze !== FAZE_CLOUD) {
        return {
          ok: true,
          skipped: true,
          reason: "not_phase_b_attachment"
        };
      }

      if (
        zaznam.cloudState === "uploaded" ||
        zaznam.cloudState === "active"
      ) {
        if (zaznam.noteId !== noteId) {
          await aktualizujLokalniStav(
            attachmentId,
            { noteId }
          );
        }

        return {
          ok: true,
          alreadyUploaded: true,
          storagePath: zaznam.storagePath || ""
        };
      }

      if (!(zaznam.blob instanceof Blob) || zaznam.blob.size <= 0) {
        return {
          ok: false,
          reason: "local_blob_missing"
        };
      }

      const mimeType = String(
        zaznam.mimeType || zaznam.blob.type || "image/jpeg"
      ).toLowerCase();

      if (mimeType !== "image/jpeg") {
        return {
          ok: false,
          reason: "invalid_mime_type"
        };
      }

      const klient = await zajistiSupabase();

      if (!klient) {
        return {
          ok: false,
          reason: "cloud_unavailable"
        };
      }

      await aktualizujLokalniStav(
        attachmentId,
        {
          noteId,
          cloudState: "reserving",
          lastCloudAttemptAt: new Date().toISOString(),
          lastCloudError: ""
        }
      );

      await aktualizujLokalniFrontu(
        attachmentId,
        {
          noteId,
          stav: "reserving",
          posledniChyba: ""
        }
      );

      const { data: rezervace, error: chybaRezervace } =
        await klient.rpc(
          "lubanote_reserve_shared_attachment",
          {
            p_attachment_id: attachmentId,
            p_note_id: noteId,
            p_declared_bytes: Number(zaznam.blob.size) || 0,
            p_mime_type: mimeType,
            p_device_id: session.deviceId,
            p_session_id: session.sessionId
          }
        );

      if (chybaRezervace) {
        throw chybaRezervace;
      }

      if (rezervace?.ok !== true) {
        const error = new Error(
          rezervace?.reason || "shared_attachment_reservation_denied"
        );
        error.code = rezervace?.reason || "reservation_denied";
        throw error;
      }

      const storagePath = String(
        rezervace.storage_path || zaznam.storagePath || ""
      );

      if (!storagePath) {
        throw new Error("shared_attachment_storage_path_missing");
      }

      await aktualizujLokalniStav(
        attachmentId,
        {
          noteId,
          storagePath,
          cloudState: "uploading"
        }
      );

      await aktualizujLokalniFrontu(
        attachmentId,
        {
          noteId,
          stav: "uploading",
          posledniChyba: ""
        }
      );

      if (rezervace.already_uploaded !== true) {
        const buffer = await zaznam.blob.arrayBuffer();

        const { error: chybaUploadu } =
          await klient.storage
            .from(BUCKET)
            .upload(
              storagePath,
              buffer,
              {
                contentType: "image/jpeg",
                cacheControl: "3600",
                upsert: false
              }
            );

        if (
          chybaUploadu &&
          !jeChybaDuplicitnihoUploadu(chybaUploadu)
        ) {
          throw chybaUploadu;
        }
      }

      const { data: potvrzeni, error: chybaPotvrzeni } =
        await klient.rpc(
          "lubanote_confirm_attachment",
          {
            p_attachment_id: attachmentId
          }
        );

      if (chybaPotvrzeni) {
        throw chybaPotvrzeni;
      }

      if (potvrzeni?.ok !== true) {
        const error = new Error(
          potvrzeni?.reason || "shared_attachment_confirm_failed"
        );
        error.code = potvrzeni?.reason || "confirm_failed";
        throw error;
      }

      const uploadedAt = new Date().toISOString();

      await aktualizujLokalniStav(
        attachmentId,
        {
          noteId,
          storagePath,
          cloudState: "uploaded",
          uploadedAt,
          lastCloudError: ""
        }
      );

      await aktualizujLokalniFrontu(
        attachmentId,
        {
          noteId,
          stav: "uploaded",
          posledniChyba: ""
        }
      );

      return {
        ok: true,
        storagePath,
        sizeBytes:
          Number(potvrzeni?.size_bytes) ||
          Number(zaznam.blob.size) ||
          0
      };
    })()
      .catch(async (error) => {
        const zprava = String(
          error?.message || error || "shared_attachment_upload_failed"
        );

        await aktualizujLokalniStav(
          attachmentId,
          {
            cloudState: "pending_upload",
            lastCloudError: zprava,
            lastCloudAttemptAt: new Date().toISOString()
          }
        );

        await aktualizujLokalniFrontu(
          attachmentId,
          {
            stav: "pending_upload",
            posledniChyba: zprava
          }
        );

        console.warn(
          "Sdílený attachment: upload selhal.",
          attachmentId,
          error
        );

        return {
          ok: false,
          reason: error?.code || error?.message || "upload_failed",
          error
        };
      })
      .finally(() => {
        probihajiciUploady.delete(attachmentId);
      });

    probihajiciUploady.set(attachmentId, promise);
    return promise;
  }

  async function pripravPredSharedSave(note, session) {
    if (!note?.id) {
      return {
        ok: false,
        reason: "note_missing"
      };
    }

    if (!navigator.onLine) {
      return {
        ok: false,
        reason: "offline"
      };
    }

    const ids = ziskejAttachmentIds(note);

    if (ids.length === 0) {
      return {
        ok: true,
        count: 0,
        uploaded: 0
      };
    }

    const vysledky = [];

    for (const id of ids) {
      const vysledek = await nahrajJednuSdilenouPrilohu(
        id,
        note.id,
        session
      );

      vysledky.push({ id, ...vysledek });
    }

    const neuspesne = vysledky.filter(
      (polozka) => polozka.ok !== true
    );

    return {
      ok: neuspesne.length === 0,
      count: ids.length,
      uploaded: vysledky.filter(
        (polozka) =>
          polozka.ok === true &&
          polozka.skipped !== true &&
          polozka.alreadyUploaded !== true
      ).length,
      vysledky,
      neuspesne
    };
  }

  async function synchronizujPoSharedSave(noteId) {
    if (!noteId || !navigator.onLine) {
      return {
        ok: false,
        reason: "offline_or_missing_note"
      };
    }

    const klient = await zajistiSupabase();

    if (!klient) {
      return {
        ok: false,
        reason: "cloud_unavailable"
      };
    }

    try {
      const { data, error } = await klient.rpc(
        "lubanote_sync_shared_note_attachment_refs",
        {
          p_note_id: noteId
        }
      );

      if (error) {
        throw error;
      }

      const aktivovaneIds = Array.isArray(data?.activated_ids)
        ? data.activated_ids
        : [];

      const cekajiciSmazaniIds = Array.isArray(data?.pending_delete_ids)
        ? data.pending_delete_ids
        : [];

      for (const id of aktivovaneIds) {
        await aktualizujLokalniStav(
          id,
          {
            cloudState: "active",
            activatedAt: new Date().toISOString(),
            lastCloudError: ""
          }
        );
      }

      /*
       * Server vrací detailní pending_delete ID jen pro attachmenty
       * aktuálního uživatele. Cizí uploader tedy zůstává zcela skrytý.
       */
      for (const id of cekajiciSmazaniIds) {
        try {
          await window.LubaNoteAttachmentsLocal
            ?.smazPrilohu?.(id);
        } catch (_) {
          // Serverový stav je už správný.
        }
      }

      return {
        ok: data?.ok === true,
        activatedIds: aktivovaneIds,
        pendingDeleteIds: cekajiciSmazaniIds
      };
    } catch (error) {
      console.warn(
        "Sdílený attachment: synchronizace referencí po save selhala.",
        error
      );

      return {
        ok: false,
        reason: "sync_refs_failed",
        error
      };
    }
  }

  window.LubaNoteSharingAttachments = {
    ziskejAttachmentIds,
    pripravPredSharedSave,
    synchronizujPoSharedSave
  };
})();
