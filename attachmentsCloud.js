/* ==================================================
   LUBANOTE – CLOUDOVÉ PŘÍLOHY – FÁZE B 

   697J: Nešifrovaný JPEG cloud-shadow upload byl zrušen.
   Ponecháváme kompatibilitu pro čtení, metadata a mazání starých příloh.
   Nová média jdou výhradně přes E2E payload v poznámce.
================================================== */

(() => {
  const BUCKET = "lubanote-attachments";
  const FAZE_CLOUD = "cloud_shadow_v1";

  const probihajiciUploady = new Map();

  /*
   * LOCAL SCOPE 590 – TVRDÁ CLOUDOVÁ POJISTKA PRO PŘÍLOHY.
   * ------------------------------------------------------
   * Lokální poznámka smí mít obrázky/přílohy ve své device-only cache,
   * ale žádná attachment servisní cesta kvůli ní nesmí volat RPC ani
   * Supabase Storage. Tento guard je záměrně přímo v cloudové vrstvě,
   * aby ochrana nezávisela na tom, odkud byla služba zavolána.
   */
  function jePoznamkaPouzeLokalni(note) {
    try {
      if (
        window.LubaNoteStorageScope
          ?.jePouzeLokalni?.(note) === true
      ) {
        return true;
      }
    } catch (_error) {}

    return note?.storageScope === "local";
  }

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

  function poznamkaObsahujeE2EInlineFotografii(note) {
    try {
      if (window.LubaNoteMediaCrypto?.maPlaintextFotografie) {
        return window.LubaNoteMediaCrypto.maPlaintextFotografie(note) === true;
      }
    } catch (_error) {}

    const html = [
      note?.richContent,
      ...(Array.isArray(note?.todos) ? note.todos.map((todo) => todo?.html) : [])
    ];

    return html.some((text) =>
      typeof text === "string" &&
      /<img\b[^>]*\bsrc\s*=\s*["']data:image\//i.test(text)
    );
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

  /* 697J: Faze B JPEG Storage uploader je DEFINITIVNE zakazany.
   * Predchozi implementace prenesla zaznam.blob.arrayBuffer() bez sifrovani.
   * Historicke objekty lze stale cist a mazat; nikdy nevytvaret nove.
   * Guard zustava i na teto vnitrni urovni pro pripad zmeny call-site. */
  async function nahrajJednuPrilohu(attachmentId, noteId) {
    return {
      ok: false,
      skipped: true,
      reason: "plaintext_storage_upload_disabled_697J",
      attachmentId: String(attachmentId || ""),
      noteId: String(noteId || "")
    };
  }

  async function zajistiStinovePrilohyPoznamkyVCloudu(note) {
    /* I stare Data URL / data-attachment-id musi prejit jen pres E2E
     * cloudovy JSON, nikdy pres raw JPEG Storage. Zde neprovadime zadne RPC. */
    return {
      ok: true,
      skipped: true,
      reason: "plaintext_storage_upload_disabled_697J",
      count: 0
    };
  }

  async function oznacPrilohyPoznamkyJakoAktivni(note) {
    if (jePoznamkaPouzeLokalni(note)) {
      return true;
    }

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

  async function synchronizujReferencePrilohPoznamky(note) {
    if (jePoznamkaPouzeLokalni(note)) {
      return {
        ok: true,
        skipped: true,
        reason: "local_only"
      };
    }

    if (
      !note?.id ||
      note.isSecret === true ||
      !navigator.onLine
    ) {
      return {
        ok: false,
        skipped: true
      };
    }

    if (!await pripravCloud()) {
      return {
        ok: false,
        reason: "cloud_unavailable"
      };
    }

    const ids = ziskejAttachmentIdsZPoznamky(note);

    try {
      const { data, error } =
        await supabaseClient.rpc(
          "lubanote_sync_note_attachment_refs",
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
      const cekajiciSmazaniIds = Array.isArray(
        data?.pending_delete_ids
      )
        ? data.pending_delete_ids
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

      for (const id of cekajiciSmazaniIds) {
        try {
          await window.LubaNoteAttachmentsLocal
            ?.smazPrilohu?.(id);
        } catch {
          // Server už attachment označil. Lokální orphan se může uklidit později.
        }
      }

      return {
        ok: data?.ok === true,
        activatedIds: aktivovaneIds,
        pendingDeleteIds: cekajiciSmazaniIds
      };
    } catch (error) {
      console.warn(
        "LubaNote attachments: synchronizace referencí příloh se nepodařila.",
        error
      );

      return {
        ok: false,
        reason: "rpc_failed",
        error
      };
    }
  }

  async function zpracujStinovePrilohyPoznamekVCloudu(notes) {
    /* Fronta historickych shadow JPEG zustava jen lokalni diagnostikou. */
    return {
      ok: true,
      skipped: true,
      reason: "plaintext_storage_upload_disabled_697J",
      zpracovano: 0,
      neuspesne: 0
    };
  }

  async function vycistiCloudovePrilohyPoProdleve(limit = 20, moznosti = {}) {
    if (!navigator.onLine) {
      return {
        ok: false,
        skipped: true,
        reason: "offline"
      };
    }

    if (!await pripravCloud()) {
      return {
        ok: false,
        reason: "cloud_unavailable"
      };
    }

    const bezpecnyLimit = Math.max(
      1,
      Math.min(Number(limit) || 20, 100)
    );

    /*
     * PATCH 612A – expirace Dema nesmí oslabit běžný attachment cleanup.
     * Standardní cesta proto zůstává beze změny. Pouze explicitní
     * post-Demo smazání používá vlastní serverové RPC, které samo ověří,
     * že přihlášený účet je opravdu expirované Demo.
     */
    const jePostDemoCleanup = moznosti?.postDemo === true;
    const claimRpc = jePostDemoCleanup
      ? "lubanote_claim_my_expired_demo_attachment_deletes"
      : "lubanote_claim_pending_attachment_deletes";
    const confirmRpc = jePostDemoCleanup
      ? "lubanote_confirm_my_expired_demo_attachment_deleted"
      : "lubanote_confirm_attachment_deleted";
    const releaseRpc = jePostDemoCleanup
      ? "lubanote_release_my_expired_demo_attachment_delete_claim"
      : "lubanote_release_attachment_delete_claim";

    try {
      const { data, error } =
        await supabaseClient.rpc(
          claimRpc,
          { p_limit: bezpecnyLimit }
        );

      if (error) {
        throw error;
      }

      if (data?.ok !== true) {
        return {
          ok: false,
          reason: data?.reason || "claim_failed"
        };
      }

      const claimed = Array.isArray(data?.claimed)
        ? data.claimed
        : [];
      const vysledky = [];

      for (const claim of claimed) {
        const attachmentId = String(claim?.id || "");
        const storagePath = String(claim?.storage_path || "");
        const claimToken = String(claim?.claim_token || "");

        if (!attachmentId || !storagePath || !claimToken) {
          vysledky.push({
            id: attachmentId,
            ok: false,
            reason: "invalid_claim_payload"
          });
          continue;
        }

        try {
          /*
           * FYZICKÉ smazání MUSÍ jít přes Storage API.
           * Serverová DELETE RLS policy pustí jen vlastní objekt,
           * který má stále platný stav deleting + claim lease.
           */
          const { error: chybaSmazani } =
            await supabaseClient.storage
              .from(BUCKET)
              .remove([storagePath]);

          if (chybaSmazani) {
            throw chybaSmazani;
          }

          const { data: potvrzeni, error: chybaPotvrzeni } =
            await supabaseClient.rpc(
              confirmRpc,
              {
                p_attachment_id: attachmentId,
                p_claim_token: claimToken
              }
            );

          if (chybaPotvrzeni) {
            throw chybaPotvrzeni;
          }

          if (potvrzeni?.ok !== true) {
            throw new Error(
              `Potvrzení smazání selhalo: ${potvrzeni?.reason || "unknown"}`
            );
          }

          try {
            await window.LubaNoteAttachmentsLocal
              ?.smazPrilohu?.(attachmentId);
          } catch {
            // Cloud je autorita; lokální orphan se uklidí později.
          }

          vysledky.push({
            id: attachmentId,
            ok: true,
            status: "deleted"
          });
        } catch (errorSmazani) {
          try {
            await supabaseClient.rpc(
              releaseRpc,
              {
                p_attachment_id: attachmentId,
                p_claim_token: claimToken
              }
            );
          } catch {
            // Claim má 30min lease a server jej umí později obnovit.
          }

          console.warn(
            "LubaNote attachments: fyzické smazání přílohy se dokončí později.",
            attachmentId,
            errorSmazani
          );

          vysledky.push({
            id: attachmentId,
            ok: false,
            reason: errorSmazani?.message || "delete_failed"
          });
        }
      }

      return {
        ok: vysledky.every((polozka) => polozka.ok === true),
        graceDays: Number(data?.grace_days) || 7,
        claimed: claimed.length,
        deleted: vysledky.filter((polozka) => polozka.ok === true).length,
        vysledky
      };
    } catch (error) {
      console.warn(
        "LubaNote attachments: cleanup cloudových příloh se nepodařilo spustit.",
        error
      );

      return {
        ok: false,
        reason: "cleanup_failed",
        error
      };
    }
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
    synchronizujReferencePrilohPoznamky,
    zpracujStinovePrilohyPoznamekVCloudu,
    vycistiCloudovePrilohyPoProdleve,
    ziskejCloudDiagnostiku
  };
})();
