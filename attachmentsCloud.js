/* ==================================================
   LUBANOTE – CLOUDOVÉ PŘÍLOHY – FÁZE B

   Cloudová STÍNOVÁ vrstva:
   - nové normální obrázky mají dál Data URL v poznámce,
   - jejich JPEG Blob se navíc bezpečně rezervuje a uploaduje
     do privátního Supabase Storage,
   - Storage chyba zatím NESMÍ zablokovat původní sync poznámky,
   - Secret se v této fázi vůbec nezpracovává.
================================================== */

(() => {
  const BUCKET = "lubanote-attachments";
  const FAZE_CLOUD = "cloud_shadow_v1";

  const probihajiciUploady = new Map();

  function najdiAttachmentIdsVHtml(html, cil) {
    if (typeof html !== "string" || !html) {
      return;
    }

    const regex = /data-attachment-id\s*=\s*["']([^"']+)["']/gi;
    let shoda;

    while ((shoda = regex.exec(html)) !== null) {
      const id = String(shoda[1] || "").trim();

      if (id) {
        cil.add(id);
      }
    }
  }

  function ziskejAttachmentIdsZPoznamky(note) {
    const ids = new Set();

    najdiAttachmentIdsVHtml(
      note?.richContent,
      ids
    );

    for (const todo of Array.isArray(note?.todos) ? note.todos : []) {
      najdiAttachmentIdsVHtml(
        todo?.html,
        ids
      );
    }

    return Array.from(ids);
  }

  async function pripravCloud() {
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
    } else if (
      typeof pripravSupabaseClient === "function"
    ) {
      const pripraven =
        await pripravSupabaseClient();

      if (!pripraven) {
        return false;
      }
    }

    return Boolean(
      typeof supabaseClient !== "undefined" &&
      supabaseClient
    );
  }

  function jeChybaDuplicitnihoUploadu(error) {
    const text = String(
      error?.message ||
      error?.error ||
      error ||
      ""
    ).toLowerCase();

    return (
      text.includes("duplicate") ||
      text.includes("already exists") ||
      text.includes("resource already exists")
    );
  }

  async function zaznamenejChybu(
    attachmentId,
    error
  ) {
    const lokalni =
      window.LubaNoteAttachmentsLocal;

    const zprava = String(
      error?.message || error || "Neznámá chyba"
    );

    try {
      const zaznam =
        await lokalni?.nactiPrilohu?.(attachmentId);

      const pocetPokusu =
        Number(zaznam?.cloudAttempts) || 0;

      await lokalni?.upravPrilohu?.(
        attachmentId,
        {
          cloudState: "pending_upload",
          lastCloudError: zprava,
          cloudAttempts: pocetPokusu + 1,
          lastCloudAttemptAt:
            new Date().toISOString()
        }
      );

      const fronta =
        await lokalni?.aktualizujUpload?.(
          attachmentId,
          {
            stav: "pending_upload",
            posledniChyba: zprava,
            pocetPokusu: pocetPokusu + 1
          }
        );

      if (!fronta) {
        await lokalni?.zaradUpload?.({
          attachmentId,
          noteId: zaznam?.noteId || null
        });
      }
    } catch (lokalniError) {
      console.warn(
        "LubaNote attachments: cloudovou chybu se nepodařilo zapsat lokálně.",
        lokalniError
      );
    }
  }

  async function nahrajJednuPrilohu(
    attachmentId,
    noteId
  ) {
    if (!attachmentId || !noteId) {
      return {
        ok: false,
        reason: "missing_identity"
      };
    }

    if (probihajiciUploady.has(attachmentId)) {
      return probihajiciUploady.get(attachmentId);
    }

    const promise = (async () => {
      const lokalni =
        window.LubaNoteAttachmentsLocal;

      if (!lokalni?.nactiPrilohu) {
        return {
          ok: false,
          reason: "local_module_missing"
        };
      }

      const zaznam =
        await lokalni.nactiPrilohu(attachmentId);

      /*
       * FÁZE A vytvořila shadow_v1 záznamy. Ty jsou pouze
       * stará diagnostická cache a do nového JPEG Storage je
       * automaticky neposíláme.
       */
      if (!zaznam || zaznam.faze !== FAZE_CLOUD) {
        return {
          ok: true,
          skipped: true,
          reason: "not_phase_b_attachment"
        };
      }

      if (!zaznam.blob) {
        return {
          ok: false,
          reason: "local_blob_missing"
        };
      }

      if (
        zaznam.cloudState === "uploaded" ||
        zaznam.cloudState === "active"
      ) {
        if (zaznam.noteId !== noteId) {
          await lokalni.upravPrilohu(
            attachmentId,
            { noteId }
          );
        }

        return {
          ok: true,
          storagePath: zaznam.storagePath || "",
          alreadyUploaded: true
        };
      }

      if (!await pripravCloud()) {
        return {
          ok: false,
          reason: "cloud_unavailable"
        };
      }

      const mimeType =
        zaznam.mimeType || zaznam.blob.type || "image/jpeg";

      if (mimeType !== "image/jpeg") {
        throw new Error(
          `Fáze B očekává image/jpeg, lokálně je ${mimeType}.`
        );
      }

      await lokalni.upravPrilohu(
        attachmentId,
        {
          noteId,
          cloudState: "reserving",
          lastCloudAttemptAt:
            new Date().toISOString()
        }
      );

      await lokalni.aktualizujUpload?.(
        attachmentId,
        {
          noteId,
          stav: "reserving",
          posledniChyba: ""
        }
      );

      const { data: rezervace, error: chybaRezervace } =
        await supabaseClient.rpc(
          "lubanote_reserve_attachment",
          {
            p_attachment_id: attachmentId,
            p_note_id: noteId,
            p_declared_bytes: Number(zaznam.blob.size) || 0,
            p_mime_type: mimeType
          }
        );

      if (chybaRezervace) {
        throw chybaRezervace;
      }

      if (rezervace?.ok !== true) {
        const duvod =
          rezervace?.reason || "reservation_denied";
        const error = new Error(
          rezervace?.message ||
          `Rezervace přílohy byla odmítnuta: ${duvod}`
        );
        error.code = duvod;
        throw error;
      }

      const storagePath =
        rezervace.storage_path ||
        zaznam.storagePath ||
        "";

      if (!storagePath) {
        throw new Error(
          "Server nevrátil cestu pro Storage."
        );
      }

      await lokalni.upravPrilohu(
        attachmentId,
        {
          noteId,
          storagePath,
          cloudState: "uploading"
        }
      );

      await lokalni.aktualizujUpload?.(
        attachmentId,
        {
          noteId,
          stav: "uploading",
          posledniChyba: ""
        }
      );

      if (rezervace.already_uploaded !== true) {
        const buffer =
          await zaznam.blob.arrayBuffer();

        const { error: chybaUploadu } =
          await supabaseClient.storage
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
        await supabaseClient.rpc(
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
          potvrzeni?.message ||
          `Upload přílohy nebyl potvrzen: ${potvrzeni?.reason || "unknown"}`
        );
        error.code = potvrzeni?.reason || "confirm_failed";
        throw error;
      }

      const uploadedAt =
        new Date().toISOString();

      await lokalni.upravPrilohu(
        attachmentId,
        {
          noteId,
          storagePath,
          cloudState: "uploaded",
          uploadedAt,
          lastCloudError: ""
        }
      );

      await lokalni.aktualizujUpload?.(
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
        sizeBytes: Number(potvrzeni.size_bytes) ||
          Number(zaznam.blob.size) || 0
      };
    })().catch(async (error) => {
      await zaznamenejChybu(
        attachmentId,
        error
      );

      console.warn(
        "LubaNote attachments: cloudový upload přílohy selhal (Fáze B stín, poznámka zůstává bezpečná v Data URL).",
        attachmentId,
        error
      );

      return {
        ok: false,
        reason: error?.code || "upload_failed",
        error
      };
    }).finally(() => {
      probihajiciUploady.delete(attachmentId);
    });

    probihajiciUploady.set(
      attachmentId,
      promise
    );

    return promise;
  }

  async function zajistiStinovePrilohyPoznamkyVCloudu(note) {
    if (!note || note.isSecret === true) {
      return {
        ok: true,
        skipped: true,
        count: 0
      };
    }

    const ids = ziskejAttachmentIdsZPoznamky(note);

    if (ids.length === 0) {
      return {
        ok: true,
        count: 0
      };
    }

    const vysledky = [];

    for (const id of ids) {
      const vysledek = await nahrajJednuPrilohu(
        id,
        note.id
      );
      vysledky.push({ id, ...vysledek });
    }

    return {
      ok: vysledky.every(
        (polozka) => polozka.ok === true
      ),
      count: vysledky.length,
      vysledky
    };
  }

  async function oznacPrilohyPoznamkyJakoAktivni(note) {
    if (
      !note?.id ||
      note.isSecret === true ||
      !navigator.onLine
    ) {
      return false;
    }

    const ids = ziskejAttachmentIdsZPoznamky(note);

    if (ids.length === 0) {
      return true;
    }

    if (!await pripravCloud()) {
      return false;
    }

    try {
      const { data, error } =
        await supabaseClient.rpc(
          "lubanote_activate_note_attachments",
          {
            p_note_id: note.id,
            p_attachment_ids: ids
          }
        );

      if (error) {
        throw error;
      }

      const aktivovaneIds = Array.isArray(data?.activated_ids)
        ? data.activated_ids
        : [];

      for (const id of aktivovaneIds) {
        try {
          await window.LubaNoteAttachmentsLocal
            ?.upravPrilohu?.(
              id,
              {
                cloudState: "active",
                activatedAt:
                  new Date().toISOString(),
                lastCloudError: ""
              }
            );
        } catch {
          // Cloud je autorita; lokální status se může opravit později.
        }
      }

      return data?.ok === true;
    } catch (error) {
      console.warn(
        "LubaNote attachments: aktivace cloudových příloh se nepodařila.",
        error
      );
      return false;
    }
  }

  async function zpracujStinovePrilohyPoznamekVCloudu(notes) {
    const seznam = Array.isArray(notes) ? notes : [];
    let zpracovano = 0;
    let neuspesne = 0;

    for (const note of seznam) {
      if (!note?.id || note.isSecret === true) {
        continue;
      }

      const ids = ziskejAttachmentIdsZPoznamky(note);

      if (ids.length === 0) {
        continue;
      }

      const stav =
        await zajistiStinovePrilohyPoznamkyVCloudu(note);

      zpracovano += Number(stav?.count) || 0;

      if (stav?.ok !== true) {
        neuspesne += 1;
      }
    }

    return {
      ok: neuspesne === 0,
      zpracovano,
      neuspesne
    };
  }

  async function ziskejCloudDiagnostiku() {
    if (!await pripravCloud()) {
      return {
        dostupne: false,
        reason: "cloud_unavailable"
      };
    }

    try {
      const { data, error } =
        await supabaseClient.rpc(
          "lubanote_get_attachment_usage"
        );

      if (error) {
        throw error;
      }

      return {
        dostupne: true,
        ...(data || {})
      };
    } catch (error) {
      return {
        dostupne: false,
        reason: "rpc_failed",
        chyba: error?.message || String(error)
      };
    }
  }

  window.LubaNoteAttachmentsCloud = {
    bucket: BUCKET,
    ziskejAttachmentIdsZPoznamky,
    zajistiStinovePrilohyPoznamkyVCloudu,
    oznacPrilohyPoznamkyJakoAktivni,
    zpracujStinovePrilohyPoznamekVCloudu,
    ziskejCloudDiagnostiku
  };
})();
