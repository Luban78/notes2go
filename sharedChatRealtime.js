/* ============================================================
   LubaNote – Shared / Chat Realtime Signal V1
   PATCH 621
   ------------------------------------------------------------
   - žádný periodický polling,
   - Realtime přenáší pouze malý head: sekvence + UUID entity,
   - obsah poznámky ani text chat zprávy přes Realtime nejde,
   - po reconnect/resume se načte jediný malý head řádek,
   - konkrétní Shared/Chat moduly pak použijí své bezpečné RPC.
   ============================================================ */

(() => {
  "use strict";

  const TABULKA = "lubanote_realtime_heads";
  const KANAL_PREFIX = "lubanote-shared-chat-head";
  const LOCAL_PREFIX = "lubanoteRealtimeHead621:";

  let aktualniUserId = null;
  let realtimeKanal = null;
  let realtimeUserId = null;
  let pripravaKanalu = null;
  let kontrolaHead = null;

  function diagnostika(typ, text) {
    try {
      window.LubaNoteStartupDiag?.zapis?.(typ, text);
    } catch (_) {
      // Diagnostika nesmí ovlivnit Realtime.
    }
  }

  function klicHead(userId) {
    return userId ? `${LOCAL_PREFIX}${userId}` : null;
  }

  function normalizujHead(row) {
    return {
      shared: Math.max(0, Number(row?.shared_seq) || 0),
      chat: Math.max(0, Number(row?.chat_seq) || 0),
      invitation: Math.max(0, Number(row?.invitation_seq) || 0),
      sharedNoteId: row?.shared_note_id || null,
      chatThreadId: row?.chat_thread_id || null,
      invitationNoteId: row?.invitation_note_id || null
    };
  }

  function nactiLokalniHead(userId) {
    const klic = klicHead(userId);
    if (!klic) return null;

    try {
      const raw = localStorage.getItem(klic);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return {
        shared: Math.max(0, Number(parsed?.shared) || 0),
        chat: Math.max(0, Number(parsed?.chat) || 0),
        invitation: Math.max(0, Number(parsed?.invitation) || 0)
      };
    } catch (_) {
      return null;
    }
  }

  function ulozLokalniHead(userId, head) {
    const klic = klicHead(userId);
    if (!klic) return;

    try {
      localStorage.setItem(
        klic,
        JSON.stringify({
          shared: head.shared,
          chat: head.chat,
          invitation: head.invitation
        })
      );
    } catch (_) {
      // Head je pouze reconnect pojistka; localStorage chyba není blocker.
    }
  }

  function emituj(nazev, detail) {
    window.dispatchEvent(new CustomEvent(nazev, { detail }));
  }

  function zpracujHead(row, { zivySignal = false } = {}) {
    const userId = aktualniUserId;
    if (!userId) return;

    const novy = normalizujHead(row);
    const stary = nactiLokalniHead(userId);

    /*
     * Úplně první instalace nemá lokální cursor. Startovní Shared/Chat
     * moduly už stejně provedou svůj jednorázový bootstrap, proto staré
     * historické sekvence pouze uložíme a nevyrábíme duplicitní download.
     */
    if (!stary && !zivySignal) {
      ulozLokalniHead(userId, novy);
      diagnostika(
        "RT",
        `SHARED CHAT HEAD INIT | s=${novy.shared} c=${novy.chat} i=${novy.invitation}`
      );
      return;
    }

    const predchozi = stary || { shared: 0, chat: 0, invitation: 0 };

    if (novy.shared > predchozi.shared) {
      emituj("lubanote:shared-realtime-signal", {
        seq: novy.shared,
        gap: novy.shared - predchozi.shared,
        noteId: novy.sharedNoteId,
        source: zivySignal ? "realtime" : "head"
      });
    }

    if (novy.chat > predchozi.chat) {
      emituj("lubanote:chat-realtime-signal", {
        seq: novy.chat,
        gap: novy.chat - predchozi.chat,
        threadId: novy.chatThreadId,
        source: zivySignal ? "realtime" : "head"
      });
    }

    if (novy.invitation > predchozi.invitation) {
      emituj("lubanote:invitation-realtime-signal", {
        seq: novy.invitation,
        gap: novy.invitation - predchozi.invitation,
        noteId: novy.invitationNoteId,
        source: zivySignal ? "realtime" : "head"
      });
    }

    ulozLokalniHead(userId, novy);
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

  async function nactiServerovyHead(userId) {
    if (!userId || !navigator.onLine) return null;

    const klient = await zajistiSupabase();
    if (!klient) return null;

    const { data, error } = await klient
      .from(TABULKA)
      .select(
        "shared_seq,chat_seq,invitation_seq,shared_note_id,chat_thread_id,invitation_note_id"
      )
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;

    return data || {
      shared_seq: 0,
      chat_seq: 0,
      invitation_seq: 0,
      shared_note_id: null,
      chat_thread_id: null,
      invitation_note_id: null
    };
  }

  async function zkontrolujHead() {
    const userId = aktualniUserId;
    if (!userId || !navigator.onLine) return false;

    if (kontrolaHead) return kontrolaHead;

    kontrolaHead = (async () => {
      try {
        const row = await nactiServerovyHead(userId);
        if (!row || aktualniUserId !== userId) return false;
        zpracujHead(row, { zivySignal: false });
        return true;
      } catch (error) {
        console.warn("Shared/Chat Realtime: head check selhal.", error);
        return false;
      } finally {
        kontrolaHead = null;
      }
    })();

    return kontrolaHead;
  }

  async function odstranKanal() {
    const kanal = realtimeKanal;
    realtimeKanal = null;
    realtimeUserId = null;
    pripravaKanalu = null;

    if (!kanal) return;

    try {
      const klient = await zajistiSupabase();
      await klient?.removeChannel?.(kanal);
    } catch (_) {
      // Starý kanál nesmí blokovat nový účet/reconnect.
    }
  }

  async function pripravKanal(userId = aktualniUserId) {
    if (!userId || !navigator.onLine) return false;

    if (realtimeKanal && realtimeUserId === userId) {
      return true;
    }

    if (pripravaKanalu) return pripravaKanalu;

    pripravaKanalu = (async () => {
      const klient = await zajistiSupabase();
      if (!klient || aktualniUserId !== userId) return false;

      if (realtimeKanal && realtimeUserId !== userId) {
        await odstranKanal();
      }

      const kanal = klient.channel(`${KANAL_PREFIX}-${userId}`);

      kanal.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: TABULKA,
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          if (aktualniUserId !== userId) return;

          const row = payload?.new;
          if (!row || typeof row !== "object") return;

          zpracujHead(row, { zivySignal: true });
        }
      );

      const prihlasen = await new Promise((resolve) => {
        let hotovo = false;

        const dokoncit = (ok) => {
          if (hotovo) return;
          hotovo = true;
          clearTimeout(timer);
          resolve(ok);
        };

        const timer = setTimeout(() => dokoncit(false), 4000);

        kanal.subscribe((stav) => {
          if (stav === "SUBSCRIBED") {
            dokoncit(true);
            return;
          }

          if (
            stav === "CHANNEL_ERROR" ||
            stav === "TIMED_OUT" ||
            stav === "CLOSED"
          ) {
            if (hotovo) {
              if (realtimeKanal === kanal) {
                realtimeKanal = null;
                realtimeUserId = null;
              }
              return;
            }
            dokoncit(false);
          }
        });
      });

      if (!prihlasen) {
        try {
          await klient.removeChannel(kanal);
        } catch (_) {}
        return false;
      }

      if (aktualniUserId !== userId) {
        try {
          await klient.removeChannel(kanal);
        } catch (_) {}
        return false;
      }

      realtimeKanal = kanal;
      realtimeUserId = userId;
      diagnostika("RT", "SHARED CHAT REALTIME | SUBSCRIBED");
      await zkontrolujHead();
      return true;
    })();

    try {
      return await pripravaKanalu;
    } finally {
      pripravaKanalu = null;
    }
  }

  async function aktivujProUcet(userId) {
    const novyUserId = userId || null;

    if (aktualniUserId && aktualniUserId !== novyUserId) {
      await odstranKanal();
    }

    aktualniUserId = novyUserId;
    if (!aktualniUserId) return;

    await pripravKanal(aktualniUserId);
  }

  window.addEventListener("lubanote:account-active", (event) => {
    void aktivujProUcet(event.detail?.userId || null);
  });

  window.addEventListener("lubanote:auth-expired", () => {
    aktualniUserId = null;
    void odstranKanal();
  });

  window.addEventListener("online", () => {
    if (!aktualniUserId) return;
    void pripravKanal(aktualniUserId).then(() => zkontrolujHead());
  });

  document.addEventListener("visibilitychange", () => {
    if (
      document.visibilityState === "visible" &&
      navigator.onLine &&
      aktualniUserId
    ) {
      void pripravKanal(aktualniUserId).then(() => zkontrolujHead());
    }
  });

  window.LubaNoteSharedChatRealtime = {
    ensure: () => pripravKanal(aktualniUserId),
    checkHead: zkontrolujHead
  };
})();
