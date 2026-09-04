/* ============================================================
   LubaNote – S3D CHAT CLIENT V1
   ------------------------------------------------------------
   Backend:
   - S3A trusted contacts
   - S3B send/read messages
   - S3C unread/read receipts + delete for both

   Klient:
   - 💬 badge nepřečtených zpráv
   - seznam důvěryhodných kontaktů
   - 1:1 chat
   - polling bez zásahu do note syncu
   - odesílání plain-text zpráv
   - read receipt
   - smazání vlastní zprávy pro oba přes LubaNote modal
============================================================ */

(() => {
  const LOCAL_OWNER_KEY = "lubanoteLocalOwnerUserId";
  const POLL_BADGE_MS = 10_000;
  const POLL_THREAD_MS = 3_000;

  const chatButton = document.getElementById("chatButton");
  const chatBadge = document.getElementById("chatBadge");

  let aktualniUserId = localStorage.getItem(LOCAL_OWNER_KEY) || null;
  let kontakty = [];
  let contactsModal = null;
  let threadModal = null;
  let deleteModal = null;
  let otevrenyKontakt = null;
  let globalPollTimer = null;
  let threadPollTimer = null;
  let probihajiciKontakty = null;
  let probihajiciZpravy = null;
  let odesilam = false;
  let mazu = false;
  let puvodniAndroidZpet = null;

  function t(klic, zaloha, promenne = null) {
    const fn = window.LubaNoteI18n?.t;

    if (typeof fn === "function") {
      try {
        return promenne
          ? fn(klic, zaloha, promenne)
          : fn(klic, zaloha);
      } catch (_) {
        return doplnPromenne(zaloha, promenne);
      }
    }

    return doplnPromenne(zaloha, promenne);
  }

  function doplnPromenne(text, promenne) {
    if (!promenne) return String(text || "");

    return String(text || "").replace(/\{(\w+)\}/g, (_, key) =>
      promenne[key] ?? `{${key}}`
    );
  }

  function ziskejUserId() {
    return aktualniUserId || localStorage.getItem(LOCAL_OWNER_KEY) || null;
  }

  function normalizujUsername(value) {
    const text = String(value || "").trim().replace(/^@+/, "");
    return text ? `@${text}` : "";
  }

  function stejnyUsername(a, b) {
    return normalizujUsername(a).toLocaleLowerCase() ===
      normalizujUsername(b).toLocaleLowerCase();
  }

  function rozbalJsonRpc(data) {
    if (data == null) return null;

    if (Array.isArray(data)) {
      if (data.length === 1 && data[0] && typeof data[0] === "object") {
        const row = data[0];
        const values = Object.values(row);

        if (values.length === 1 && values[0] && typeof values[0] === "object") {
          return values[0];
        }

        return row;
      }

      return data;
    }

    return data;
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

  async function rpc(nazev, parametry = undefined) {
    const klient = await zajistiSupabase();
    if (!klient) throw new Error("supabase_unavailable");

    const response = parametry === undefined
      ? await klient.rpc(nazev)
      : await klient.rpc(nazev, parametry);

    if (response.error) throw response.error;

    return rozbalJsonRpc(response.data);
  }

  function vytvorUuid() {
    if (typeof crypto?.randomUUID === "function") {
      return crypto.randomUUID();
    }

    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
  }

  function nastavBadge(pocet) {
    const count = Math.max(0, Number(pocet) || 0);

    if (!chatBadge || !chatButton) return;

    chatBadge.textContent = count > 99 ? "99+" : String(count);
    chatBadge.hidden = count === 0;
    chatButton.classList.toggle("hasUnread", count > 0);
  }

  function formatCas(value) {
    if (!value) return "";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleString(
      window.LubaNoteI18n?.ziskejLocale?.() || "cs-CZ",
      {
        day: "numeric",
        month: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }
    );
  }

  function vytvorContactsModal() {
    if (contactsModal) return contactsModal;

    const overlay = document.createElement("section");
    overlay.className = "chatContactsModal";
    overlay.hidden = true;
    overlay.setAttribute("aria-label", t("chat.contactsTitle", "Zprávy"));

    const card = document.createElement("div");
    card.className = "chatContactsCard";

    const header = document.createElement("header");
    header.className = "chatContactsHeader";

    const title = document.createElement("h3");
    title.textContent = t("chat.contactsTitle", "Zprávy");

    const close = document.createElement("button");
    close.type = "button";
    close.className = "chatCloseButton";
    close.textContent = "×";
    close.setAttribute("aria-label", t("chat.close", "Zavřít"));

    header.append(title, close);

    const status = document.createElement("p");
    status.className = "chatStatus";
    status.hidden = true;

    const list = document.createElement("div");
    list.className = "chatContactsList";

    card.append(header, status, list);
    overlay.append(card);
    document.body.append(overlay);

    close.addEventListener("click", zavriKontakty);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) zavriKontakty();
    });

    contactsModal = { overlay, card, title, close, status, list };
    return contactsModal;
  }

  function nastavContactStatus(text = "", typ = "") {
    const modal = vytvorContactsModal();
    modal.status.textContent = text;
    modal.status.hidden = !text;
    modal.status.dataset.typ = typ;
  }

  function vykresliKontakty() {
    const modal = vytvorContactsModal();
    modal.list.innerHTML = "";

    if (!kontakty.length) {
      const empty = document.createElement("p");
      empty.className = "chatEmptyState";
      empty.textContent = t(
        "chat.contactsEmpty",
        "Zatím nemáš žádný chat kontakt. Kontakt vznikne po přijetí sdílení poznámky."
      );
      modal.list.append(empty);
      return;
    }

    for (const kontakt of kontakty) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "chatContactRow";

      const avatar = document.createElement("span");
      avatar.className = "chatContactAvatar";
      avatar.textContent = "@";
      avatar.setAttribute("aria-hidden", "true");

      const text = document.createElement("span");
      text.className = "chatContactText";

      const username = document.createElement("strong");
      username.textContent = normalizujUsername(kontakt.username) || "@?";

      const meta = document.createElement("span");
      const blocked = kontakt.blocked_by_me || kontakt.has_blocked_me;

      if (blocked) {
        meta.textContent = t("chat.blocked", "Chat je blokovaný");
      } else if (kontakt.last_message_at) {
        meta.textContent = t(
          "chat.lastMessageAt",
          "Poslední zpráva {time}",
          { time: formatCas(kontakt.last_message_at) }
        );
      } else {
        meta.textContent = t("chat.ready", "Můžete si napsat");
      }

      text.append(username, meta);

      const unread = Math.max(0, Number(kontakt.unread_count) || 0);
      const badge = document.createElement("span");
      badge.className = "chatContactUnread";
      badge.textContent = unread > 99 ? "99+" : String(unread);
      badge.hidden = unread === 0;

      row.append(avatar, text, badge);
      row.addEventListener("click", () => otevriThread(kontakt));
      modal.list.append(row);
    }
  }

  function vytvorThreadModal() {
    if (threadModal) return threadModal;

    const overlay = document.createElement("section");
    overlay.className = "chatThreadOverlay";
    overlay.hidden = true;
    overlay.setAttribute("aria-label", t("chat.threadAria", "Chat"));

    const card = document.createElement("div");
    card.className = "chatThreadCard";

    const header = document.createElement("header");
    header.className = "chatThreadHeader";

    const back = document.createElement("button");
    back.type = "button";
    back.className = "chatBackButton";
    back.textContent = "‹";
    back.setAttribute("aria-label", t("chat.back", "Zpět"));

    const titleWrap = document.createElement("div");
    titleWrap.className = "chatThreadTitleWrap";

    const title = document.createElement("h3");
    const subtitle = document.createElement("span");

    titleWrap.append(title, subtitle);

    const close = document.createElement("button");
    close.type = "button";
    close.className = "chatCloseButton";
    close.textContent = "×";
    close.setAttribute("aria-label", t("chat.close", "Zavřít"));

    header.append(back, titleWrap, close);

    const status = document.createElement("p");
    status.className = "chatThreadStatus";
    status.hidden = true;

    const messages = document.createElement("div");
    messages.className = "chatMessages";
    messages.setAttribute("role", "log");
    messages.setAttribute("aria-live", "polite");

    const composer = document.createElement("div");
    composer.className = "chatComposer";

    const input = document.createElement("textarea");
    input.rows = 1;
    input.maxLength = 4000;
    input.placeholder = t("chat.messagePlaceholder", "Napsat zprávu…");
    input.setAttribute("aria-label", t("chat.messagePlaceholder", "Napsat zprávu…"));
    input.autocomplete = "off";

    const send = document.createElement("button");
    send.type = "button";
    send.className = "chatSendButton";
    send.textContent = t("chat.send", "Odeslat");

    composer.append(input, send);
    card.append(header, status, messages, composer);
    overlay.append(card);
    document.body.append(overlay);

    back.addEventListener("click", () => {
      zavriThread({ otevritKontakty: true });
    });

    close.addEventListener("click", () => {
      zavriThread({ otevritKontakty: false });
      zavriKontakty();
    });

    send.addEventListener("click", odesliZpravu);

    input.addEventListener("input", () => {
      upravVyskuComposeru();
      nastavComposerStav();
    });

    input.addEventListener("keydown", (event) => {
      if (
        event.key === "Enter" &&
        (event.ctrlKey || event.metaKey)
      ) {
        event.preventDefault();
        odesliZpravu();
      }
    });

    threadModal = {
      overlay,
      card,
      header,
      back,
      title,
      subtitle,
      close,
      status,
      messages,
      composer,
      input,
      send
    };

    return threadModal;
  }

  function nastavThreadStatus(text = "", typ = "") {
    const modal = vytvorThreadModal();
    modal.status.textContent = text;
    modal.status.hidden = !text;
    modal.status.dataset.typ = typ;
  }

  function upravVyskuComposeru() {
    if (!threadModal) return;

    const input = threadModal.input;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  }

  function nastavComposerStav() {
    if (!threadModal) return;

    const blocked = !!(
      otevrenyKontakt?.blocked_by_me ||
      otevrenyKontakt?.has_blocked_me
    );

    const offline = !navigator.onLine;
    const empty = !String(threadModal.input.value || "").trim();

    threadModal.input.disabled = blocked || offline || odesilam;
    threadModal.send.disabled = blocked || offline || empty || odesilam;

    if (blocked) {
      threadModal.input.placeholder = t("chat.blocked", "Chat je blokovaný");
    } else if (offline) {
      threadModal.input.placeholder = t("chat.offline", "Chat vyžaduje připojení k internetu.");
    } else {
      threadModal.input.placeholder = t("chat.messagePlaceholder", "Napsat zprávu…");
    }
  }

  function jeScrollUspodu(element) {
    if (!element) return true;
    return element.scrollHeight - element.scrollTop - element.clientHeight < 80;
  }

  function scrollDolů() {
    if (!threadModal) return;
    threadModal.messages.scrollTop = threadModal.messages.scrollHeight;
  }

  function vykresliZpravy(rows, { zachovatScroll = true } = {}) {
    const modal = vytvorThreadModal();
    const zustatDole = !zachovatScroll || jeScrollUspodu(modal.messages);

    modal.messages.innerHTML = "";

    if (!rows.length) {
      const empty = document.createElement("p");
      empty.className = "chatEmptyMessages";
      empty.textContent = t("chat.messagesEmpty", "Zatím tu nejsou žádné zprávy.");
      modal.messages.append(empty);
    }

    for (const message of rows) {
      const row = document.createElement("div");
      row.className = `chatMessageRow ${message.mine ? "mine" : "other"}`;

      const bubble = document.createElement("div");
      bubble.className = "chatMessageBubble";
      if (message.deleted) bubble.classList.add("deleted");

      const body = document.createElement("div");
      body.className = "chatMessageBody";
      body.textContent = message.deleted
        ? t("chat.deletedPlaceholder", "Zpráva byla smazána")
        : String(message.body || "");

      const meta = document.createElement("div");
      meta.className = "chatMessageMeta";

      const time = document.createElement("span");
      time.textContent = formatCas(message.created_at);
      meta.append(time);

      if (message.mine) {
        const receipt = document.createElement("span");
        receipt.className = "chatReadReceipt";
        receipt.textContent = message.read_at
          ? t("chat.read", "Přečteno")
          : t("chat.sent", "Odesláno");
        meta.append(receipt);
      }

      bubble.append(body, meta);

      if (message.mine && !message.deleted) {
        const actions = document.createElement("button");
        actions.type = "button";
        actions.className = "chatMessageDeleteButton";
        actions.textContent = "⋮";
        actions.setAttribute("aria-label", t("chat.deleteMessage", "Smazat zprávu"));
        actions.addEventListener("click", (event) => {
          event.stopPropagation();
          otevriDeleteModal(message.id);
        });
        bubble.append(actions);
      }

      row.append(bubble);
      modal.messages.append(row);
    }

    requestAnimationFrame(() => {
      if (zustatDole) scrollDolů();
    });
  }

  function vytvorDeleteModal() {
    if (deleteModal) return deleteModal;

    const overlay = document.createElement("section");
    overlay.className = "chatDeleteModal";
    overlay.hidden = true;

    const card = document.createElement("div");
    card.className = "chatDeleteCard";

    const title = document.createElement("h3");
    title.textContent = t("chat.deleteTitle", "Smazat zprávu?");

    const text = document.createElement("p");
    text.textContent = t(
      "chat.deleteText",
      "Zpráva se smaže pro oba účastníky a zůstane po ní jen informace, že byla smazána."
    );

    const actions = document.createElement("div");
    actions.className = "chatDeleteActions";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "chatSecondaryButton";
    cancel.textContent = t("chat.cancel", "Zrušit");

    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className = "chatDangerButton";
    confirm.textContent = t("chat.deleteForBoth", "Smazat pro oba");

    actions.append(cancel, confirm);
    card.append(title, text, actions);
    overlay.append(card);
    document.body.append(overlay);

    cancel.addEventListener("click", zavriDeleteModal);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay && !mazu) zavriDeleteModal();
    });

    deleteModal = {
      overlay,
      card,
      title,
      text,
      cancel,
      confirm,
      messageId: null
    };

    return deleteModal;
  }

  function otevriDeleteModal(messageId) {
    const modal = vytvorDeleteModal();
    modal.messageId = messageId;
    modal.overlay.hidden = false;
    modal.confirm.disabled = false;
    modal.cancel.disabled = false;
    modal.confirm.textContent = t("chat.deleteForBoth", "Smazat pro oba");

    modal.confirm.onclick = () => smazZpravu(messageId);
  }

  function zavriDeleteModal() {
    if (!deleteModal || mazu) return;
    deleteModal.overlay.hidden = true;
    deleteModal.messageId = null;
  }

  async function smazZpravu(messageId) {
    if (mazu || !messageId || !navigator.onLine) return;

    mazu = true;
    const modal = vytvorDeleteModal();
    modal.confirm.disabled = true;
    modal.cancel.disabled = true;
    modal.confirm.textContent = t("chat.deleting", "Mažu…");

    try {
      const data = await rpc(
        "lubanote_delete_chat_message",
        { p_message_id: messageId }
      );

      if (data?.ok === false) {
        throw new Error(data.reason || "delete_failed");
      }

      mazu = false;
      zavriDeleteModal();
      await nactiZpravy({ tichy: true, zachovatScroll: true });
      await obnovGlobalniStav({ tichy: true });
    } catch (error) {
      console.error("Chat: smazání zprávy selhalo.", error);
      mazu = false;
      modal.confirm.disabled = false;
      modal.cancel.disabled = false;
      modal.confirm.textContent = t("chat.deleteForBoth", "Smazat pro oba");
      nastavThreadStatus(t("chat.deleteFailed", "Zprávu se nepodařilo smazat."), "error");
      zavriDeleteModal();
    }
  }

  async function nactiKontakty({ tichy = false } = {}) {
    const userId = ziskejUserId();
    if (!userId || !navigator.onLine) return kontakty;

    if (probihajiciKontakty) return probihajiciKontakty;

    probihajiciKontakty = (async () => {
      try {
        const data = await rpc("lubanote_get_my_chat_contacts");

        if (ziskejUserId() !== userId) return kontakty;

        if (data?.ok === false) {
          throw new Error(data.reason || "contacts_failed");
        }

        kontakty = Array.isArray(data?.contacts) ? data.contacts : [];

        if (contactsModal && !contactsModal.overlay.hidden) {
          vykresliKontakty();
          nastavContactStatus("");
        }

        if (otevrenyKontakt) {
          const novy = kontakty.find((k) => k.thread_id === otevrenyKontakt.thread_id);
          if (novy) {
            otevrenyKontakt = { ...otevrenyKontakt, ...novy };
            nastavComposerStav();
          }
        }

        return kontakty;
      } catch (error) {
        if (!tichy) console.error("Chat: kontakty se nepodařilo načíst.", error);

        if (contactsModal && !contactsModal.overlay.hidden) {
          nastavContactStatus(
            t("chat.loadFailed", "Chat se nepodařilo načíst."),
            "error"
          );
        }

        return kontakty;
      } finally {
        probihajiciKontakty = null;
      }
    })();

    return probihajiciKontakty;
  }

  async function nactiUnread({ tichy = false } = {}) {
    if (!ziskejUserId() || !navigator.onLine) return 0;

    try {
      const data = await rpc("lubanote_get_chat_unread_summary");
      if (data?.ok === false) throw new Error(data.reason || "unread_failed");

      const total = Math.max(0, Number(data?.total_unread) || 0);
      nastavBadge(total);
      return total;
    } catch (error) {
      if (!tichy) console.error("Chat: unread stav se nepodařilo načíst.", error);
      return 0;
    }
  }

  async function obnovGlobalniStav({ tichy = false } = {}) {
    if (!ziskejUserId() || !navigator.onLine) return;
    await Promise.all([
      nactiUnread({ tichy }),
      nactiKontakty({ tichy })
    ]);
  }

  async function otevriKontakty() {
    const modal = vytvorContactsModal();
    modal.overlay.hidden = false;
    document.body.classList.add("chatUiOpen");

    if (!navigator.onLine) {
      vykresliKontakty();
      nastavContactStatus(
        t("chat.offline", "Chat vyžaduje připojení k internetu."),
        "error"
      );
      return;
    }

    nastavContactStatus(t("chat.loading", "Načítám…"));
    await nactiKontakty({ tichy: false });
    vykresliKontakty();
    nastavContactStatus("");
    await nactiUnread({ tichy: true });
  }

  function zavriKontakty() {
    if (!contactsModal) return;
    contactsModal.overlay.hidden = true;

    if (!threadModal || threadModal.overlay.hidden) {
      document.body.classList.remove("chatUiOpen");
    }
  }

  async function otevriThread(kontakt) {
    if (!kontakt?.thread_id) return;

    otevrenyKontakt = { ...kontakt };

    const modal = vytvorThreadModal();
    modal.title.textContent = normalizujUsername(kontakt.username) || "@?";
    modal.subtitle.textContent = kontakt.blocked_by_me || kontakt.has_blocked_me
      ? t("chat.blocked", "Chat je blokovaný")
      : t("chat.trustedContact", "Kontakt ze sdílení");
    modal.messages.innerHTML = "";
    modal.input.value = "";
    upravVyskuComposeru();
    nastavComposerStav();
    nastavThreadStatus("");

    if (contactsModal) contactsModal.overlay.hidden = true;
    modal.overlay.hidden = false;
    document.body.classList.add("chatUiOpen");

    await nactiZpravy({ tichy: false, zachovatScroll: false });
    spustThreadPolling();
  }

  function zavriThread({ otevritKontakty = false } = {}) {
    if (threadModal) threadModal.overlay.hidden = true;
    otevrenyKontakt = null;
    clearInterval(threadPollTimer);
    threadPollTimer = null;
    if (deleteModal && !deleteModal.overlay.hidden && !mazu) zavriDeleteModal();

    if (otevritKontakty) {
      const modal = vytvorContactsModal();
      modal.overlay.hidden = false;
      vykresliKontakty();
    } else if (!contactsModal || contactsModal.overlay.hidden) {
      document.body.classList.remove("chatUiOpen");
    }
  }

  async function nactiZpravy({ tichy = false, zachovatScroll = true } = {}) {
    if (!otevrenyKontakt?.thread_id || !navigator.onLine) {
      nastavComposerStav();
      if (!navigator.onLine) {
        nastavThreadStatus(t("chat.offline", "Chat vyžaduje připojení k internetu."), "error");
      }
      return [];
    }

    if (probihajiciZpravy) return probihajiciZpravy;

    const threadId = otevrenyKontakt.thread_id;

    probihajiciZpravy = (async () => {
      try {
        const data = await rpc(
          "lubanote_get_chat_messages",
          {
            p_thread_id: threadId,
            p_limit: 200
          }
        );

        if (!otevrenyKontakt || otevrenyKontakt.thread_id !== threadId) {
          return [];
        }

        if (data?.ok === false) {
          throw new Error(data.reason || "messages_failed");
        }

        const rows = Array.isArray(data?.messages) ? data.messages : [];
        const thread = data?.thread || {};

        otevrenyKontakt = {
          ...otevrenyKontakt,
          blocked_by_me: !!thread.blocked_by_me,
          has_blocked_me: !!thread.has_blocked_me,
          username: thread.username || otevrenyKontakt.username
        };

        if (threadModal && !threadModal.overlay.hidden) {
          threadModal.title.textContent = normalizujUsername(otevrenyKontakt.username) || "@?";
          threadModal.subtitle.textContent = otevrenyKontakt.blocked_by_me || otevrenyKontakt.has_blocked_me
            ? t("chat.blocked", "Chat je blokovaný")
            : t("chat.trustedContact", "Kontakt ze sdílení");
          vykresliZpravy(rows, { zachovatScroll });
          nastavThreadStatus("");
          nastavComposerStav();
        }

        const maUnread = rows.some((message) =>
          !message.mine && !message.deleted && !message.read_at
        );

        if (maUnread) {
          try {
            const mark = await rpc(
              "lubanote_mark_chat_read",
              { p_thread_id: threadId }
            );

            if (mark?.ok !== false && Number(mark?.marked_count || 0) > 0) {
              await obnovGlobalniStav({ tichy: true });
            }
          } catch (error) {
            if (!tichy) console.warn("Chat: označení zpráv jako přečtené selhalo.", error);
          }
        }

        return rows;
      } catch (error) {
        if (!tichy) console.error("Chat: zprávy se nepodařilo načíst.", error);
        nastavThreadStatus(t("chat.loadMessagesFailed", "Zprávy se nepodařilo načíst."), "error");
        return [];
      } finally {
        probihajiciZpravy = null;
      }
    })();

    return probihajiciZpravy;
  }

  async function odesliZpravu() {
    if (
      odesilam ||
      !otevrenyKontakt?.thread_id ||
      !threadModal ||
      !navigator.onLine
    ) {
      return;
    }

    const body = String(threadModal.input.value || "").trim();
    if (!body) return;

    if (body.length > 4000) {
      nastavThreadStatus(t("chat.tooLong", "Zpráva je příliš dlouhá."), "error");
      return;
    }

    const clientMessageId = vytvorUuid();
    const threadId = otevrenyKontakt.thread_id;

    odesilam = true;
    threadModal.send.textContent = t("chat.sending", "Odesílám…");
    nastavComposerStav();
    nastavThreadStatus("");

    try {
      const data = await rpc(
        "lubanote_send_chat_message",
        {
          p_thread_id: threadId,
          p_client_message_id: clientMessageId,
          p_body: body
        }
      );

      if (data?.ok === false) {
        const reason = String(data.reason || "send_failed");

        if (reason === "chat_blocked") {
          throw new Error("chat_blocked");
        }

        throw new Error(reason);
      }

      if (!otevrenyKontakt || otevrenyKontakt.thread_id !== threadId) return;

      threadModal.input.value = "";
      upravVyskuComposeru();
      await nactiZpravy({ tichy: true, zachovatScroll: false });
      await obnovGlobalniStav({ tichy: true });
    } catch (error) {
      console.error("Chat: odeslání zprávy selhalo.", error);
      const blocked = String(error?.message || "").includes("chat_blocked");
      nastavThreadStatus(
        blocked
          ? t("chat.blocked", "Chat je blokovaný")
          : t("chat.sendFailed", "Zprávu se nepodařilo odeslat."),
        "error"
      );
    } finally {
      odesilam = false;
      if (threadModal) {
        threadModal.send.textContent = t("chat.send", "Odeslat");
        nastavComposerStav();
      }
    }
  }

  async function openChatWithUsername(username) {
    const hledany = normalizujUsername(username);

    if (!hledany) return false;

    if (!navigator.onLine) {
      await otevriKontakty();
      return false;
    }

    await nactiKontakty({ tichy: true });
    const kontakt = kontakty.find((item) => stejnyUsername(item.username, hledany));

    if (!kontakt) {
      const modal = vytvorContactsModal();
      modal.overlay.hidden = false;
      document.body.classList.add("chatUiOpen");
      vykresliKontakty();
      nastavContactStatus(
        t("chat.contactNotFound", "Chat kontakt zatím není dostupný."),
        "error"
      );
      return false;
    }

    await otevriThread(kontakt);
    return true;
  }

  function spustThreadPolling() {
    clearInterval(threadPollTimer);

    threadPollTimer = setInterval(() => {
      if (
        !document.hidden &&
        navigator.onLine &&
        otevrenyKontakt?.thread_id
      ) {
        nactiZpravy({ tichy: true, zachovatScroll: true });
      }
    }, POLL_THREAD_MS);
  }

  function spustGlobalPolling() {
    clearInterval(globalPollTimer);

    globalPollTimer = setInterval(() => {
      if (!document.hidden && navigator.onLine && ziskejUserId()) {
        obnovGlobalniStav({ tichy: true });
      }
    }, POLL_BADGE_MS);
  }

  function aplikujPreklady() {
    if (chatButton) {
      const aria = t("chat.buttonAria", "Zprávy");
      chatButton.setAttribute("aria-label", aria);
      chatButton.title = aria;
    }

    if (contactsModal) {
      contactsModal.title.textContent = t("chat.contactsTitle", "Zprávy");
      contactsModal.close.setAttribute("aria-label", t("chat.close", "Zavřít"));
      if (!contactsModal.overlay.hidden) vykresliKontakty();
    }

    if (threadModal) {
      threadModal.back.setAttribute("aria-label", t("chat.back", "Zpět"));
      threadModal.close.setAttribute("aria-label", t("chat.close", "Zavřít"));
      threadModal.input.setAttribute("aria-label", t("chat.messagePlaceholder", "Napsat zprávu…"));
      threadModal.send.textContent = odesilam
        ? t("chat.sending", "Odesílám…")
        : t("chat.send", "Odeslat");
      nastavComposerStav();
    }

    if (deleteModal) {
      deleteModal.title.textContent = t("chat.deleteTitle", "Smazat zprávu?");
      deleteModal.text.textContent = t(
        "chat.deleteText",
        "Zpráva se smaže pro oba účastníky a zůstane po ní jen informace, že byla smazána."
      );
      deleteModal.cancel.textContent = t("chat.cancel", "Zrušit");
      deleteModal.confirm.textContent = mazu
        ? t("chat.deleting", "Mažu…")
        : t("chat.deleteForBoth", "Smazat pro oba");
    }
  }

  function obalAndroidBack() {
    if (
      puvodniAndroidZpet ||
      typeof window.LubaNoteZpracujAndroidZpet !== "function"
    ) {
      return;
    }

    puvodniAndroidZpet = window.LubaNoteZpracujAndroidZpet;

    window.LubaNoteZpracujAndroidZpet = function () {
      if (deleteModal && !deleteModal.overlay.hidden && !mazu) {
        zavriDeleteModal();
        return true;
      }

      if (threadModal && !threadModal.overlay.hidden) {
        zavriThread({ otevritKontakty: true });
        return true;
      }

      if (contactsModal && !contactsModal.overlay.hidden) {
        zavriKontakty();
        return true;
      }

      return puvodniAndroidZpet();
    };
  }

  chatButton?.addEventListener("click", otevriKontakty);

  window.addEventListener("lubanote:account-active", (event) => {
    aktualniUserId = event.detail?.userId || localStorage.getItem(LOCAL_OWNER_KEY) || null;
    kontakty = [];
    nastavBadge(0);
    zavriThread({ otevritKontakty: false });
    zavriKontakty();

    if (aktualniUserId && navigator.onLine) {
      obnovGlobalniStav({ tichy: true });
    }
  });

  window.addEventListener("lubanote:auth-expired", () => {
    aktualniUserId = null;
    kontakty = [];
    nastavBadge(0);
    zavriThread({ otevritKontakty: false });
    zavriKontakty();
  });

  window.addEventListener("lubanote:sharing-changed", () => {
    if (navigator.onLine && ziskejUserId()) {
      obnovGlobalniStav({ tichy: true });
    }
  });

  window.addEventListener("lubanote:language-change", aplikujPreklady);

  window.addEventListener("online", () => {
    nastavComposerStav();
    if (ziskejUserId()) obnovGlobalniStav({ tichy: true });
    if (otevrenyKontakt?.thread_id) nactiZpravy({ tichy: true, zachovatScroll: true });
  });

  window.addEventListener("offline", () => {
    nastavComposerStav();
    if (threadModal && !threadModal.overlay.hidden) {
      nastavThreadStatus(t("chat.offline", "Chat vyžaduje připojení k internetu."), "error");
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (
      document.visibilityState === "visible" &&
      navigator.onLine &&
      ziskejUserId()
    ) {
      obnovGlobalniStav({ tichy: true });
      if (otevrenyKontakt?.thread_id) {
        nactiZpravy({ tichy: true, zachovatScroll: true });
      }
    }
  });

  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape") return;

      if (deleteModal && !deleteModal.overlay.hidden && !mazu) {
        event.preventDefault();
        event.stopPropagation();
        zavriDeleteModal();
        return;
      }

      if (threadModal && !threadModal.overlay.hidden) {
        event.preventDefault();
        event.stopPropagation();
        zavriThread({ otevritKontakty: true });
        return;
      }

      if (contactsModal && !contactsModal.overlay.hidden) {
        event.preventDefault();
        event.stopPropagation();
        zavriKontakty();
      }
    },
    true
  );

  obalAndroidBack();
  aplikujPreklady();
  spustGlobalPolling();

  if (aktualniUserId && navigator.onLine) {
    obnovGlobalniStav({ tichy: true });
  }

  window.LubaNoteChat = {
    openContacts: otevriKontakty,
    openChatWithUsername,
    refresh: () => obnovGlobalniStav({ tichy: true }),
    getContacts: () => kontakty.map((item) => ({ ...item })),
    close: () => {
      zavriThread({ otevritKontakty: false });
      zavriKontakty();
    }
  };
})();
