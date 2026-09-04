/* ============================================================
   LubaNote – S2B SHARE MODAL + INVITATIONS CLIENT V1
   ------------------------------------------------------------
   - owner může z otevřené běžné poznámky poslat pozvánku
   - Share modal ukáže collaborators + pending invitations
   - hlavní ✉️ tlačítko ukáže počet příchozích pozvánek
   - příjemce může Accept / Decline
   - zatím NEMĚNÍ lokální notes/sync/editor
   - shared note se po accept začne načítat až v S2C
============================================================ */

(() => {
  const LOCAL_OWNER_KEY = "lubanoteLocalOwnerUserId";
  const POLL_MS = 60_000;

  const taskModal = document.getElementById("taskModal");
  const shareNoteButton = document.getElementById("shareNoteButton");
  const invitationsButton = document.getElementById("sharingInvitationsButton");
  const invitationsBadge = document.getElementById("sharingInvitationsBadge");

  let aktualniUserId = localStorage.getItem(LOCAL_OWNER_KEY) || null;
  let shareModal = null;
  let invitationsModal = null;
  let shareNoteId = null;
  let shareBusy = false;
  let inviteBusy = false;
  let pollTimer = null;

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

  function normalizujUsername(hodnota) {
    return String(hodnota || "")
      .trim()
      .replace(/^@+/, "");
  }

  function zobrazUsername(hodnota) {
    const username = normalizujUsername(hodnota);
    return username ? `@${username}` : "@?";
  }

  function platnyUsername(hodnota) {
    return /^[A-Za-z0-9_.-]{3,30}$/.test(
      normalizujUsername(hodnota)
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

  function ziskejAktualniUserId() {
    return aktualniUserId || localStorage.getItem(LOCAL_OWNER_KEY) || null;
  }

  function ziskejAktualniPoznamku() {
    const noteId = taskModal?.dataset?.taskId || null;

    if (!noteId || typeof loadTask !== "function") {
      return null;
    }

    try {
      return loadTask().find((task) => task?.id === noteId) || null;
    } catch (_) {
      return null;
    }
  }

  function aktualizujShareButton() {
    if (!shareNoteButton) {
      return;
    }

    const task = ziskejAktualniPoznamku();
    const jeOtevrenyEditor = !!taskModal && !taskModal.hidden;
    const lzeSdilet =
      jeOtevrenyEditor &&
      !!task?.id &&
      task.isSecret !== true;

    shareNoteButton.hidden = !lzeSdilet;
    shareNoteButton.textContent = t("sharing.shareButton", "Sdílet");
    shareNoteButton.setAttribute(
      "aria-label",
      t("sharing.shareButton", "Sdílet")
    );
  }

  function nastavBadge(pocet) {
    if (!invitationsBadge) {
      return;
    }

    const n = Math.max(0, Number(pocet) || 0);

    invitationsBadge.textContent = n > 99 ? "99+" : String(n);
    invitationsBadge.hidden = n === 0;
    invitationsButton?.classList.toggle("hasInvitations", n > 0);
  }

  function ziskejRadky(data, klice = []) {
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

  function chybaText(error) {
    return String(
      error?.message ||
      error?.details ||
      error?.hint ||
      error ||
      ""
    ).toLowerCase();
  }

  function zpravaProSendChybu(error) {
    const text = chybaText(error);

    if (text.includes("username") && text.includes("required")) {
      return t(
        "sharing.shareUsernameMissing",
        "Nejdřív si v Nastavení nastav vlastní @username."
      );
    }

    if (
      text.includes("not_found") ||
      text.includes("user_not_found") ||
      text.includes("invitee_not_found")
    ) {
      return t(
        "sharing.shareUserNotFound",
        "Uživatel s tímto přesným @username nebyl nalezen."
      );
    }

    if (text.includes("self")) {
      return t(
        "sharing.shareSelf",
        "Poznámku nemůžeš sdílet sám se sebou."
      );
    }

    if (text.includes("already_collaborator")) {
      return t(
        "sharing.shareAlreadyCollaborator",
        "Tento uživatel už poznámku sdílí."
      );
    }

    if (
      text.includes("pending") ||
      text.includes("duplicate") ||
      error?.code === "23505"
    ) {
      return t(
        "sharing.shareAlreadyPending",
        "Tomuto uživateli už čeká pozvánka."
      );
    }

    if (text.includes("secret")) {
      return t(
        "sharing.shareSecretBlocked",
        "Tajné poznámky se zatím sdílet nedají."
      );
    }

    return t(
      "sharing.shareSendFailed",
      "Pozvánku se nepodařilo odeslat."
    );
  }

  function vytvorOverlay(trida) {
    const overlay = document.createElement("div");
    overlay.className = `sharingModal ${trida}`;
    overlay.hidden = true;
    document.body.append(overlay);
    return overlay;
  }

  function vytvorHlavicku(titleId) {
    const hlavicka = document.createElement("div");
    hlavicka.className = "sharingModalHeader";

    const nadpis = document.createElement("h3");
    nadpis.id = titleId;

    const zavrit = document.createElement("button");
    zavrit.type = "button";
    zavrit.className = "sharingModalClose";
    zavrit.setAttribute("aria-label", t("sharing.close", "Zavřít"));
    zavrit.textContent = "×";

    hlavicka.append(nadpis, zavrit);

    return { hlavicka, nadpis, zavrit };
  }

  function vytvorShareModal() {
    if (shareModal) {
      return shareModal;
    }

    const overlay = vytvorOverlay("sharingShareModal");
    const karta = document.createElement("div");
    karta.className = "sharingModalCard sharingShareCard";
    karta.setAttribute("role", "dialog");
    karta.setAttribute("aria-modal", "true");
    karta.setAttribute("aria-labelledby", "sharingShareTitle");

    const { hlavicka, nadpis, zavrit } =
      vytvorHlavicku("sharingShareTitle");

    const noteTitle = document.createElement("div");
    noteTitle.className = "sharingNoteName";

    const popis = document.createElement("p");
    popis.className = "sharingModalDescription";

    const formular = document.createElement("div");
    formular.className = "sharingInviteForm";

    const pole = document.createElement("label");
    pole.className = "sharingInviteField";

    const prefix = document.createElement("span");
    prefix.textContent = "@";
    prefix.className = "sharingInvitePrefix";

    const input = document.createElement("input");
    input.id = "sharingInviteUsername";
    input.type = "text";
    input.maxLength = 30;
    input.autocomplete = "off";
    input.autocapitalize = "none";
    input.spellcheck = false;

    pole.append(prefix, input);

    const send = document.createElement("button");
    send.type = "button";
    send.className = "sharingPrimaryButton";

    formular.append(pole, send);

    const stav = document.createElement("p");
    stav.className = "sharingModalStatus";
    stav.hidden = true;
    stav.setAttribute("role", "status");

    const collaboratorsSection = document.createElement("section");
    collaboratorsSection.className = "sharingListSection";

    const collaboratorsTitle = document.createElement("h4");
    const collaboratorsList = document.createElement("div");
    collaboratorsList.className = "sharingPeopleList";

    collaboratorsSection.append(
      collaboratorsTitle,
      collaboratorsList
    );

    const pendingSection = document.createElement("section");
    pendingSection.className = "sharingListSection";

    const pendingTitle = document.createElement("h4");
    const pendingList = document.createElement("div");
    pendingList.className = "sharingPeopleList";

    pendingSection.append(pendingTitle, pendingList);

    karta.append(
      hlavicka,
      noteTitle,
      popis,
      formular,
      stav,
      collaboratorsSection,
      pendingSection
    );

    overlay.append(karta);

    shareModal = {
      overlay,
      karta,
      nadpis,
      zavrit,
      noteTitle,
      popis,
      formular,
      input,
      send,
      stav,
      collaboratorsTitle,
      collaboratorsList,
      pendingSection,
      pendingTitle,
      pendingList
    };

    zavrit.addEventListener("click", zavriShareModal);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        zavriShareModal();
      }
    });

    input.addEventListener("input", () => {
      input.value = input.value.replace(/^@+/, "");
      nastavShareStatus("");
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        odesliPozvanku();
      }
    });

    send.addEventListener("click", odesliPozvanku);

    aplikujPreklady();
    return shareModal;
  }

  function nastavShareStatus(text, typ = "") {
    const modal = vytvorShareModal();

    modal.stav.textContent = text || "";
    modal.stav.hidden = !text;
    modal.stav.dataset.typ = typ;
  }

  function aktualniShareTask() {
    if (!shareNoteId || typeof loadTask !== "function") {
      return null;
    }

    try {
      return loadTask().find((task) => task?.id === shareNoteId) || null;
    } catch (_) {
      return null;
    }
  }

  async function otevriShareModal() {
    const task = ziskejAktualniPoznamku();

    if (!task?.id) {
      return;
    }

    if (task.isSecret === true) {
      return;
    }

    shareNoteId = task.id;
    const modal = vytvorShareModal();

    modal.noteTitle.textContent = task.title || t(
      "sharing.shareModalTitle",
      "Sdílet poznámku"
    );
    modal.input.value = "";
    nastavShareStatus("");
    modal.overlay.hidden = false;

    aplikujPreklady();
    requestAnimationFrame(() => modal.input.focus());

    await nactiShareData();
  }

  function zavriShareModal() {
    if (!shareModal) {
      return;
    }

    shareModal.overlay.hidden = true;
    shareNoteId = null;
    nastavShareStatus("");
  }

  function renderPrazdny(list, text) {
    list.innerHTML = "";
    const empty = document.createElement("p");
    empty.className = "sharingEmptyState";
    empty.textContent = text;
    list.append(empty);
  }

  function renderCollaborators(rows) {
    const modal = vytvorShareModal();
    modal.collaboratorsList.innerHTML = "";

    if (!rows.length) {
      renderPrazdny(
        modal.collaboratorsList,
        t("sharing.collaboratorsEmpty", "Zatím žádní spolupracovníci.")
      );
      return;
    }

    for (const row of rows) {
      const item = document.createElement("div");
      item.className = "sharingPersonRow";

      const info = document.createElement("div");
      info.className = "sharingPersonInfo";

      const username = document.createElement("strong");
      username.textContent = zobrazUsername(
        row.username ?? row.user_name
      );

      const role = document.createElement("span");
      const rawRole = String(row.role || "editor").toLowerCase();
      role.textContent = rawRole === "owner"
        ? t("sharing.ownerRole", "Vlastník")
        : t("sharing.editorRole", "Editor");

      info.append(username, role);
      item.append(info);
      modal.collaboratorsList.append(item);
    }
  }

  function renderPending(rows) {
    const modal = vytvorShareModal();
    modal.pendingList.innerHTML = "";

    if (!rows.length) {
      renderPrazdny(
        modal.pendingList,
        t("sharing.pendingEmpty", "Žádné čekající pozvánky.")
      );
      return;
    }

    for (const row of rows) {
      const item = document.createElement("div");
      item.className = "sharingPersonRow";

      const info = document.createElement("div");
      info.className = "sharingPersonInfo";

      const username = document.createElement("strong");
      username.textContent = zobrazUsername(row.username);

      const stav = document.createElement("span");
      stav.textContent = t("sharing.pendingTitle", "Čekající pozvánky");

      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "sharingSmallButton";
      cancel.textContent = t("sharing.cancelInvitation", "Zrušit");

      cancel.addEventListener("click", async () => {
        const invitationId = row.invitation_id ?? row.id;
        if (!invitationId || cancel.disabled) {
          return;
        }

        cancel.disabled = true;

        try {
          const klient = await zajistiSupabase();
          if (!klient) throw new Error("supabase_unavailable");

          const { data, error } = await klient.rpc(
            "lubanote_cancel_note_invitation",
            { p_invitation_id: invitationId }
          );

          if (error) throw error;
          if (data?.ok === false) throw new Error(data.reason || "cancel_failed");

          await nactiShareData();
        } catch (error) {
          console.error("Sdílení: pozvánku se nepodařilo zrušit.", error);
          nastavShareStatus(
            t("sharing.cancelFailed", "Pozvánku se nepodařilo zrušit."),
            "error"
          );
        } finally {
          cancel.disabled = false;
        }
      });

      info.append(username, stav);
      item.append(info, cancel);
      modal.pendingList.append(item);
    }
  }

  async function nactiShareData() {
    if (!shareNoteId || !shareModal) {
      return;
    }

    if (!navigator.onLine) {
      nastavShareStatus(
        t("sharing.shareOffline", "Sdílení vyžaduje připojení k internetu."),
        "error"
      );
      return;
    }

    const noteIdPriStartu = shareNoteId;
    renderPrazdny(
      shareModal.collaboratorsList,
      t("sharing.loading", "Načítám…")
    );
    renderPrazdny(
      shareModal.pendingList,
      t("sharing.loading", "Načítám…")
    );

    try {
      const klient = await zajistiSupabase();
      if (!klient) throw new Error("supabase_unavailable");

      const collaboratorsPromise = klient.rpc(
        "lubanote_get_note_collaborators",
        { p_note_id: noteIdPriStartu }
      );

      const pendingPromise = klient.rpc(
        "lubanote_get_note_pending_invitations",
        { p_note_id: noteIdPriStartu }
      );

      const [collabResponse, pendingResponse] =
        await Promise.all([collaboratorsPromise, pendingPromise]);

      if (shareNoteId !== noteIdPriStartu) {
        return;
      }

      if (collabResponse.error) throw collabResponse.error;
      if (pendingResponse.error) throw pendingResponse.error;

      renderCollaborators(
        ziskejRadky(collabResponse.data, ["collaborators", "users"])
      );

      renderPending(
        ziskejRadky(pendingResponse.data, ["invitations", "pending"])
      );
    } catch (error) {
      console.error("Sdílení: Share modal data se nepodařilo načíst.", error);
      renderPrazdny(
        shareModal.collaboratorsList,
        t("sharing.loadFailed", "Data sdílení se nepodařilo načíst.")
      );
      renderPrazdny(
        shareModal.pendingList,
        t("sharing.loadFailed", "Data sdílení se nepodařilo načíst.")
      );
      nastavShareStatus(
        t("sharing.loadFailed", "Data sdílení se nepodařilo načíst."),
        "error"
      );
    }
  }

  async function odesliPozvanku() {
    const modal = vytvorShareModal();
    const username = normalizujUsername(modal.input.value);

    if (shareBusy || !shareNoteId) {
      return;
    }

    if (!platnyUsername(username)) {
      nastavShareStatus(
        t("sharing.shareInvalidUsername", "Zadej platné @username."),
        "error"
      );
      return;
    }

    if (!navigator.onLine) {
      nastavShareStatus(
        t("sharing.shareOffline", "Sdílení vyžaduje připojení k internetu."),
        "error"
      );
      return;
    }

    shareBusy = true;
    modal.send.disabled = true;
    const puvodniText = modal.send.textContent;
    modal.send.textContent = t("sharing.shareSending", "Odesílám…");
    nastavShareStatus("");

    try {
      const klient = await zajistiSupabase();
      if (!klient) throw new Error("supabase_unavailable");

      const { data, error } = await klient.rpc(
        "lubanote_send_note_invitation",
        {
          p_note_id: shareNoteId,
          p_username: username
        }
      );

      if (error) throw error;
      if (data?.ok === false) throw new Error(data.reason || "send_failed");

      modal.input.value = "";
      nastavShareStatus(
        t("sharing.shareSendSuccess", "Pozvánka byla odeslána."),
        "success"
      );

      await nactiShareData();
    } catch (error) {
      console.error("Sdílení: pozvánku se nepodařilo odeslat.", error);
      nastavShareStatus(zpravaProSendChybu(error), "error");
    } finally {
      shareBusy = false;
      modal.send.disabled = false;
      modal.send.textContent = puvodniText || t("sharing.shareSend", "Poslat pozvánku");
    }
  }

  function vytvorInvitationsModal() {
    if (invitationsModal) {
      return invitationsModal;
    }

    const overlay = vytvorOverlay("sharingIncomingModal");
    const karta = document.createElement("div");
    karta.className = "sharingModalCard sharingIncomingCard";
    karta.setAttribute("role", "dialog");
    karta.setAttribute("aria-modal", "true");
    karta.setAttribute("aria-labelledby", "sharingIncomingTitle");

    const { hlavicka, nadpis, zavrit } =
      vytvorHlavicku("sharingIncomingTitle");

    const toolbar = document.createElement("div");
    toolbar.className = "sharingIncomingToolbar";

    const refresh = document.createElement("button");
    refresh.type = "button";
    refresh.className = "sharingSmallButton";

    toolbar.append(refresh);

    const stav = document.createElement("p");
    stav.className = "sharingModalStatus";
    stav.hidden = true;
    stav.setAttribute("role", "status");

    const list = document.createElement("div");
    list.className = "sharingInvitationsList";

    karta.append(hlavicka, toolbar, stav, list);
    overlay.append(karta);

    invitationsModal = {
      overlay,
      karta,
      nadpis,
      zavrit,
      refresh,
      stav,
      list
    };

    zavrit.addEventListener("click", zavriInvitationsModal);
    refresh.addEventListener("click", () => nactiPrichoziPozvanky({ zobrazNacitani: true }));
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        zavriInvitationsModal();
      }
    });

    aplikujPreklady();
    return invitationsModal;
  }

  function nastavInvitationStatus(text, typ = "") {
    const modal = vytvorInvitationsModal();
    modal.stav.textContent = text || "";
    modal.stav.hidden = !text;
    modal.stav.dataset.typ = typ;
  }

  async function otevriInvitationsModal() {
    const modal = vytvorInvitationsModal();
    modal.overlay.hidden = false;
    nastavInvitationStatus("");
    aplikujPreklady();
    await nactiPrichoziPozvanky({ zobrazNacitani: true });
  }

  function zavriInvitationsModal() {
    if (invitationsModal) {
      invitationsModal.overlay.hidden = true;
      nastavInvitationStatus("");
    }
  }

  function invitationTitle(row) {
    return String(
      row.note_title ??
      row.title ??
      row.note_name ??
      ""
    ).trim() || "Poznámka";
  }

  function invitationInviter(row) {
    return zobrazUsername(
      row.inviter_username ??
      row.username ??
      row.inviter
    );
  }

  function renderIncoming(rows) {
    const modal = vytvorInvitationsModal();
    modal.list.innerHTML = "";

    if (!rows.length) {
      const empty = document.createElement("p");
      empty.className = "sharingEmptyState sharingIncomingEmpty";
      empty.textContent = t(
        "sharing.invitationsEmpty",
        "Nemáš žádné čekající pozvánky."
      );
      modal.list.append(empty);
      return;
    }

    for (const row of rows) {
      const invitationId = row.invitation_id ?? row.id;
      const card = document.createElement("article");
      card.className = "sharingInvitationCard";

      const title = document.createElement("strong");
      title.className = "sharingInvitationTitle";
      title.textContent = invitationTitle(row);

      const inviter = document.createElement("span");
      inviter.className = "sharingInvitationInviter";
      inviter.textContent = t(
        "sharing.invitedBy",
        "Zve {username}",
        { username: invitationInviter(row) }
      );

      const actions = document.createElement("div");
      actions.className = "sharingInvitationActions";

      const decline = document.createElement("button");
      decline.type = "button";
      decline.className = "sharingSecondaryButton";
      decline.textContent = t("sharing.decline", "Odmítnout");

      const accept = document.createElement("button");
      accept.type = "button";
      accept.className = "sharingPrimaryButton";
      accept.textContent = t("sharing.accept", "Přijmout");

      async function respond(action) {
        if (!invitationId || inviteBusy) return;

        if (!navigator.onLine) {
          nastavInvitationStatus(
            t("sharing.shareOffline", "Sdílení vyžaduje připojení k internetu."),
            "error"
          );
          return;
        }

        inviteBusy = true;
        accept.disabled = true;
        decline.disabled = true;
        nastavInvitationStatus(
          t("sharing.responding", "Zpracovávám…")
        );

        try {
          const klient = await zajistiSupabase();
          if (!klient) throw new Error("supabase_unavailable");

          let response = await klient.rpc(
            "lubanote_respond_note_invitation",
            {
              p_invitation_id: invitationId,
              p_action: action
            }
          );

          /*
           * S1B je stabilní, ale klient je tolerantní k původnímu názvu
           * druhého SQL parametru (p_response), pokud byl backend nasazen
           * v této variantě. Nejde o obcházení serverových pravidel.
           */
          if (
            response.error &&
            (
              response.error.code === "PGRST202" ||
              String(response.error.message || "")
                .toLowerCase()
                .includes("could not find the function")
            )
          ) {
            response = await klient.rpc(
              "lubanote_respond_note_invitation",
              {
                p_invitation_id: invitationId,
                p_response: action
              }
            );
          }

          const { data, error } = response;

          if (error) throw error;
          if (data?.ok === false) throw new Error(data.reason || "respond_failed");

          nastavInvitationStatus(
            action === "accept"
              ? t("sharing.invitationAccepted", "Pozvánka byla přijata.")
              : t("sharing.invitationDeclined", "Pozvánka byla odmítnuta."),
            "success"
          );

          await nactiPrichoziPozvanky({ zobrazNacitani: false });
        } catch (error) {
          console.error("Sdílení: pozvánku se nepodařilo zpracovat.", error);
          nastavInvitationStatus(
            t("sharing.invitationResponseFailed", "Pozvánku se nepodařilo zpracovat."),
            "error"
          );
        } finally {
          inviteBusy = false;
          accept.disabled = false;
          decline.disabled = false;
        }
      }

      accept.addEventListener("click", () => respond("accept"));
      decline.addEventListener("click", () => respond("decline"));

      actions.append(decline, accept);
      card.append(title, inviter, actions);
      modal.list.append(card);
    }
  }

  async function nactiPrichoziPozvanky({ zobrazNacitani = false } = {}) {
    if (!ziskejAktualniUserId()) {
      nastavBadge(0);
      return [];
    }

    if (!navigator.onLine) {
      if (zobrazNacitani && invitationsModal && !invitationsModal.overlay.hidden) {
        nastavInvitationStatus(
          t("sharing.shareOffline", "Sdílení vyžaduje připojení k internetu."),
          "error"
        );
      }
      return [];
    }

    if (zobrazNacitani && invitationsModal && !invitationsModal.overlay.hidden) {
      invitationsModal.list.innerHTML = "";
      const loading = document.createElement("p");
      loading.className = "sharingEmptyState";
      loading.textContent = t("sharing.loading", "Načítám…");
      invitationsModal.list.append(loading);
    }

    try {
      const klient = await zajistiSupabase();
      if (!klient) throw new Error("supabase_unavailable");

      const { data, error } = await klient.rpc(
        "lubanote_get_my_pending_invitations"
      );

      if (error) throw error;

      const rows = ziskejRadky(data, ["invitations", "pending"]);
      nastavBadge(rows.length);

      if (invitationsModal && !invitationsModal.overlay.hidden) {
        renderIncoming(rows);
      }

      return rows;
    } catch (error) {
      console.error("Sdílení: příchozí pozvánky se nepodařilo načíst.", error);

      if (invitationsModal && !invitationsModal.overlay.hidden) {
        renderIncoming([]);
        nastavInvitationStatus(
          t("sharing.loadFailed", "Data sdílení se nepodařilo načíst."),
          "error"
        );
      }

      return [];
    }
  }

  function aplikujPreklady() {
    if (shareNoteButton) {
      shareNoteButton.textContent = t("sharing.shareButton", "Sdílet");
    }

    if (invitationsButton) {
      invitationsButton.setAttribute(
        "aria-label",
        t("sharing.invitationsAria", "Pozvánky ke sdílení")
      );
      invitationsButton.title = t("sharing.invitationsAria", "Pozvánky ke sdílení");
    }

    if (shareModal) {
      shareModal.nadpis.textContent = t("sharing.shareModalTitle", "Sdílet poznámku");
      shareModal.popis.textContent = t(
        "sharing.shareModalDescription",
        "Pozvi uživatele zadáním přesného @username."
      );
      shareModal.input.placeholder = t(
        "sharing.shareInputPlaceholder",
        "např. LubaNoteDemo"
      );
      if (!shareBusy) {
        shareModal.send.textContent = t("sharing.shareSend", "Poslat pozvánku");
      }
      shareModal.collaboratorsTitle.textContent = t(
        "sharing.collaboratorsTitle",
        "Spolupracovníci"
      );
      shareModal.pendingTitle.textContent = t(
        "sharing.pendingTitle",
        "Čekající pozvánky"
      );
      shareModal.zavrit.setAttribute("aria-label", t("sharing.close", "Zavřít"));
    }

    if (invitationsModal) {
      invitationsModal.nadpis.textContent = t(
        "sharing.invitationsTitle",
        "Pozvánky ke sdílení"
      );
      invitationsModal.refresh.textContent = t("sharing.refresh", "Obnovit");
      invitationsModal.zavrit.setAttribute("aria-label", t("sharing.close", "Zavřít"));
    }

    aktualizujShareButton();
  }

  function spustPolling() {
    clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      if (!document.hidden && navigator.onLine && ziskejAktualniUserId()) {
        nactiPrichoziPozvanky({ zobrazNacitani: false });
      }
    }, POLL_MS);
  }

  shareNoteButton?.addEventListener("click", otevriShareModal);
  invitationsButton?.addEventListener("click", otevriInvitationsModal);

  if (taskModal) {
    const observer = new MutationObserver(aktualizujShareButton);
    observer.observe(taskModal, {
      attributes: true,
      attributeFilter: ["hidden", "class", "data-task-id", "data-draft-task-id"]
    });
  }

  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape") {
        return;
      }

      if (shareModal && !shareModal.overlay.hidden) {
        event.preventDefault();
        event.stopPropagation();
        zavriShareModal();
        return;
      }

      if (invitationsModal && !invitationsModal.overlay.hidden) {
        event.preventDefault();
        event.stopPropagation();
        zavriInvitationsModal();
      }
    },
    true
  );

  window.addEventListener("lubanote:account-active", (event) => {
    aktualniUserId = event.detail?.userId || localStorage.getItem(LOCAL_OWNER_KEY) || null;
    nastavBadge(0);
    nactiPrichoziPozvanky({ zobrazNacitani: false });
  });

  window.addEventListener("lubanote:auth-expired", () => {
    aktualniUserId = null;
    nastavBadge(0);
    zavriShareModal();
    zavriInvitationsModal();
  });

  window.addEventListener("lubanote:language-change", aplikujPreklady);

  window.addEventListener("online", () => {
    if (ziskejAktualniUserId()) {
      nactiPrichoziPozvanky({ zobrazNacitani: false });
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && navigator.onLine && ziskejAktualniUserId()) {
      nactiPrichoziPozvanky({ zobrazNacitani: false });
      aktualizujShareButton();
    }
  });

  aplikujPreklady();
  aktualizujShareButton();
  spustPolling();

  if (ziskejAktualniUserId() && navigator.onLine) {
    nactiPrichoziPozvanky({ zobrazNacitani: false });
  }

  window.LubaNoteSharingInvitations = {
    obnovPozvanky: () => nactiPrichoziPozvanky({ zobrazNacitani: false }),
    otevriPozvanky: otevriInvitationsModal,
    otevriSdileni: otevriShareModal,
    aktualizujTlacitko: aktualizujShareButton
  };
})();
