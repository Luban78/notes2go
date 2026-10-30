/* ============================================================
   LubaNote – S2E SHARED ATTACHMENTS CLIENT V1
   ------------------------------------------------------------
   - 697J: JPEG shadow uploader permanently disabled (no plaintext Storage)
   - shared E2E media remains in canonical note JSON
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

  /* 697J: Zadny JPEG shadow blob pro sdilene poznamky nesmi opustit
   * zarizeni nezasifrovany. Shared E2E media zustava v JSON poznamky. */
  async function nahrajJednuSdilenouPrilohu(attachmentId, noteId, session) {
    return {
      ok: false,
      skipped: true,
      reason: "plaintext_storage_upload_disabled_697J"
    };
  }

  async function pripravPredSharedSave(note, session) {
    if (!note?.id) {
      return {
        ok: false,
        reason: "note_missing"
      };
    }

    /* PATCH 551 – osobní media klíč nelze bezpečně sdílet s jiným
       uživatelem. Dokud Shared handoff nedostane vlastní E2E key wrapping,
       nesmí shared save vytvořit nový plaintext JPEG v cloudu. EditorMedia
       nové vložení blokuje už v UI; tohle je druhá serverová pojistka pro
       import/starší cestu. */
    const maInlineFotografii = [
      note?.richContent,
      ...(Array.isArray(note?.todos) ? note.todos.map((todo) => todo?.html) : [])
    ].some((html) =>
      typeof html === "string" &&
      /<img\b[^>]*\bsrc\s*=\s*["']data:image\//i.test(html)
    );

    if (maInlineFotografii) {
      return {
        ok: false,
        reason: "shared_media_e2e_pending"
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
