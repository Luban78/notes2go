/* ============================================================
   LubaNote – S2C SHARED NOTES READ-ONLY CLIENT V1
   ------------------------------------------------------------
   - načítá přijaté shared notes přes S1C RPC
   - drží je v oddělené per-user cache (nikdy v savedTask)
   - private sync/storage proto zůstává nedotčený
   - přikreslí shared karty do hlavního seznamu
   - otevře bezpečný fullscreen read-only náhled
   - offline zobrazí poslední autorizovanou cache
   - shared editace / editor lock přijde až v dalším kroku
============================================================ */

(() => {
  const CACHE_PREFIX = "lubanoteSharedNotesV1:";
  const LOCAL_OWNER_KEY = "lubanoteLocalOwnerUserId";
  const POLL_MS = 60_000;

  const pinnedCards = document.getElementById("pinnedCards");
  const pinnedLeft = document.getElementById("pinnedLeft");
  const pinnedRight = document.getElementById("pinnedRight");

  let aktualniUserId = localStorage.getItem(LOCAL_OWNER_KEY) || null;
  let sdilenePoznamky = [];
  let viewer = null;
  let viewerNoteId = null;
  let pollTimer = null;
  let probihajiciNacteni = null;
  let puvodniRenderTasks = null;
  let puvodniAndroidZpet = null;

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

  function ziskejUserId() {
    return aktualniUserId || localStorage.getItem(LOCAL_OWNER_KEY) || null;
  }

  function cacheKey(userId = ziskejUserId()) {
    return userId ? `${CACHE_PREFIX}${userId}` : null;
  }

  function normalizujUsername(hodnota) {
    const text = String(hodnota || "").trim().replace(/^@+/, "");
    return text ? `@${text}` : "@?";
  }

  function nactiCache() {
    const userId = ziskejUserId();
    const klic = cacheKey(userId);

    if (!userId || !klic) {
      return [];
    }

    try {
      const raw = localStorage.getItem(klic);
      const zaznam = raw ? JSON.parse(raw) : null;

      if (
        !zaznam ||
        zaznam.userId !== userId ||
        !Array.isArray(zaznam.notes)
      ) {
        return [];
      }

      return zaznam.notes
        .filter((note) => note?.id)
        .map((note) => ({
          ...note,
          __lubanoteShared: true,
          isSecret: false
        }));
    } catch (error) {
      console.warn("Sdílení: cache shared notes se nepodařilo načíst.", error);
      return [];
    }
  }

  function ulozCache(notes) {
    const userId = ziskejUserId();
    const klic = cacheKey(userId);

    if (!userId || !klic) {
      return;
    }

    try {
      localStorage.setItem(
        klic,
        JSON.stringify({
          userId,
          fetchedAt: new Date().toISOString(),
          notes: Array.isArray(notes) ? notes : []
        })
      );
    } catch (error) {
      console.warn("Sdílení: cache shared notes se nepodařilo uložit.", error);
    }
  }

  function ziskejRadkyZRcp(data) {
    if (!data) {
      return [];
    }

    if (Array.isArray(data)) {
      if (
        data.length === 1 &&
        data[0] &&
        typeof data[0] === "object" &&
        Array.isArray(data[0].notes)
      ) {
        return data[0].notes;
      }

      if (data.every((row) => row && typeof row === "object")) {
        return data;
      }

      return [];
    }

    if (typeof data === "object" && Array.isArray(data.notes)) {
      return data.notes;
    }

    return [];
  }

  function prevedRadekNaPoznamku(row) {
    if (!row || typeof row !== "object") {
      return null;
    }

    const data =
      row.data && typeof row.data === "object" && !Array.isArray(row.data)
        ? row.data
        : {};

    const id = String(row.note_id ?? data.id ?? "").trim();

    if (!id) {
      return null;
    }

    return {
      ...data,
      id,
      updatedAt: row.updated_at ?? data.updatedAt ?? null,
      isSecret: false,

      __lubanoteShared: true,
      __lubanoteSharedOwnerUsername: normalizujUsername(
        row.owner_username ?? row.ownerUsername
      ),
      __lubanoteSharedRole: String(row.role || "editor"),
      __lubanoteSharedRevision: Number(row.revision ?? 0) || 0,
      __lubanoteSharedAcceptedAt: row.accepted_at ?? null
    };
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

  function projdeAktualnimiFiltry(note) {
    try {
      if (
        typeof taskMatchesArea === "function" &&
        !taskMatchesArea(note)
      ) {
        return false;
      }

      if (
        typeof taskMatchesFavorite === "function" &&
        !taskMatchesFavorite(note)
      ) {
        return false;
      }

      if (
        typeof taskMatchesSecret === "function" &&
        !taskMatchesSecret(note)
      ) {
        return false;
      }

      if (
        typeof taskMatchesTag === "function" &&
        !taskMatchesTag(note)
      ) {
        return false;
      }

      if (
        typeof taskMatchesSearch === "function" &&
        !taskMatchesSearch(note)
      ) {
        return false;
      }
    } catch (error) {
      console.warn("Sdílení: filtr shared note selhal.", error);
    }

    return true;
  }

  function seradSharedNotes(notes) {
    const polozky = notes.map((task, originalIndex) => ({
      task,
      originalIndex
    }));

    if (typeof porovnejKartyProZobrazeni === "function") {
      try {
        return polozky
          .sort(porovnejKartyProZobrazeni)
          .map(({ task }) => task);
      } catch (_) {
        // bezpečný fallback níže
      }
    }

    return polozky
      .sort((a, b) =>
        String(b.task?.updatedAt || "").localeCompare(
          String(a.task?.updatedAt || "")
        )
      )
      .map(({ task }) => task);
  }

  function pripojKartuDoLayoutu(card) {
    if (!pinnedCards || !pinnedLeft || !pinnedRight) {
      return;
    }

    pinnedCards.hidden = false;

    const listMode = localStorage.getItem("cardView") === "list";
    const desktopCardLayout = window.matchMedia("(min-width: 900px)").matches;

    if (desktopCardLayout && !listMode) {
      let desktopSloupce = pinnedLeft.querySelectorAll(".desktopMasonryColumn");

      if (desktopSloupce.length === 0) {
        for (let i = 0; i < 4; i++) {
          const sloupec = document.createElement("div");
          sloupec.className = "desktopMasonryColumn";
          pinnedLeft.append(sloupec);
        }

        desktopSloupce = pinnedLeft.querySelectorAll(".desktopMasonryColumn");
      }

      const pocetKaret = pinnedLeft.querySelectorAll(".taskCard").length;
      desktopSloupce[pocetKaret % 4].append(card);
      return;
    }

    if (listMode) {
      pinnedLeft.append(card);
      return;
    }

    const pocetKaret =
      pinnedLeft.children.length + pinnedRight.children.length;

    if (pocetKaret % 2 === 0) {
      pinnedLeft.append(card);
    } else {
      pinnedRight.append(card);
    }
  }

  function vytvorNahledTextu(note) {
    const todos = Array.isArray(note.todos) ? note.todos : [];

    if (todos.length > 0) {
      return todos
        .slice(0, 3)
        .map((todo) =>
          `${todo?.completed ? "☑" : "☐"} ${String(todo?.text || "")}`
        )
        .join("\n");
    }

    return String(note.note || "");
  }

  function vytvorSharedKartu(note) {
    const card = document.createElement("div");
    card.className = "taskCard sharingSharedCard";
    card.dataset.sharedNoteId = note.id;

    const heading = document.createElement("h3");

    const ikona = document.createElement("span");
    ikona.className = "sharingSharedCardIcon";
    ikona.textContent = "👥";
    ikona.setAttribute("aria-hidden", "true");

    heading.append(
      ikona,
      document.createTextNode(note.title || t("sharing.sharedUntitled", "Bez názvu"))
    );

    const meta = document.createElement("p");
    meta.className = "sharingSharedCardMeta";
    meta.textContent = t(
      "sharing.sharedCardMeta",
      "Sdíleno · {owner} · pouze pro čtení",
      { owner: note.__lubanoteSharedOwnerUsername || "@?" }
    );

    const tags = document.createElement("div");
    tags.className = "taskTags";

    (Array.isArray(note.tags) ? note.tags : []).forEach((tag) => {
      const badge = document.createElement("span");
      badge.className = "taskTag";
      badge.textContent = String(tag);
      tags.append(badge);
    });

    const text = document.createElement("p");
    text.className = "taskNoteText";
    text.textContent = vytvorNahledTextu(note);

    const date = document.createElement("p");

    if (note.date) {
      const datum = new Date(note.date);
      date.textContent = Number.isNaN(datum.getTime())
        ? ""
        : datum.toLocaleString(
            window.LubaNoteI18n?.ziskejLocale?.() || "cs-CZ",
            {
              day: "numeric",
              month: "numeric",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit"
            }
          );
    } else {
      date.textContent = "";
    }

    card.append(heading, meta, tags, text, date);

    if (note.completed === true) {
      card.classList.add("completed");
    }

    card.addEventListener("click", () => {
      if (
        typeof rezimVyberuKaret !== "undefined" &&
        rezimVyberuKaret === true
      ) {
        return;
      }

      otevriReadOnly(note.id);
    });

    return card;
  }

  function vykresliSdileneKarty() {
    if (!pinnedCards || !pinnedLeft || !pinnedRight) {
      return;
    }

    document
      .querySelectorAll(".sharingSharedCard")
      .forEach((card) => card.remove());

    const visible = seradSharedNotes(sdilenePoznamky)
      .filter(projdeAktualnimiFiltry);

    for (const note of visible) {
      pripojKartuDoLayoutu(vytvorSharedKartu(note));
    }
  }

  function bezpecneHtml(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${String(html || "")}</div>`, "text/html");
    const root = doc.body.firstElementChild;

    if (!root) {
      return "";
    }

    root
      .querySelectorAll("script,style,iframe,object,embed,form,input,textarea,select,button,meta,base,link")
      .forEach((el) => el.remove());

    root.querySelectorAll("*").forEach((el) => {
      for (const attr of [...el.attributes]) {
        const name = attr.name.toLowerCase();
        const value = String(attr.value || "").trim();
        const lower = value.toLowerCase();

        if (name.startsWith("on")) {
          el.removeAttribute(attr.name);
          continue;
        }

        if ((name === "href" || name === "src") && lower.startsWith("javascript:")) {
          el.removeAttribute(attr.name);
          continue;
        }

        if (
          name === "style" &&
          (lower.includes("url(") || lower.includes("expression(") || lower.includes("javascript:"))
        ) {
          el.removeAttribute("style");
        }
      }

      if (el.tagName === "A") {
        el.setAttribute("rel", "noopener noreferrer");
      }
    });

    return root.innerHTML;
  }

  function vytvorViewer() {
    if (viewer) {
      return viewer;
    }

    const overlay = document.createElement("section");
    overlay.className = "sharingReadOnlyViewer";
    overlay.hidden = true;
    overlay.setAttribute("aria-label", t("sharing.readOnlyTitle", "Sdílená poznámka"));

    const header = document.createElement("header");
    header.className = "sharingReadOnlyHeader";

    const close = document.createElement("button");
    close.type = "button";
    close.className = "sharingReadOnlyClose";
    close.textContent = "×";
    close.setAttribute("aria-label", t("sharing.close", "Zavřít"));

    const hlavickaText = document.createElement("div");
    hlavickaText.className = "sharingReadOnlyHeaderText";

    const title = document.createElement("h2");
    const meta = document.createElement("p");

    hlavickaText.append(title, meta);
    header.append(close, hlavickaText);

    const body = document.createElement("div");
    body.className = "sharingReadOnlyBody";

    const content = document.createElement("div");
    content.className = "sharingReadOnlyContent";

    const todoSection = document.createElement("section");
    todoSection.className = "sharingReadOnlyTodos";

    const todoTitle = document.createElement("h3");
    const todoList = document.createElement("div");
    todoList.className = "sharingReadOnlyTodoList";

    todoSection.append(todoTitle, todoList);
    body.append(content, todoSection);
    overlay.append(header, body);
    document.body.append(overlay);

    close.addEventListener("click", zavriReadOnly);

    viewer = {
      overlay,
      close,
      title,
      meta,
      body,
      content,
      todoSection,
      todoTitle,
      todoList
    };

    return viewer;
  }

  function aplikujViewerPreklady() {
    if (!viewer) {
      return;
    }

    viewer.close.setAttribute("aria-label", t("sharing.close", "Zavřít"));
    viewer.todoTitle.textContent = t("sharing.readOnlyTodos", "Úkoly");

    if (viewerNoteId) {
      const note = sdilenePoznamky.find((item) => item.id === viewerNoteId);
      if (note) {
        viewer.meta.textContent = t(
          "sharing.readOnlyMeta",
          "{owner} · pouze pro čtení",
          { owner: note.__lubanoteSharedOwnerUsername || "@?" }
        );
      }
    }
  }

  function naplnViewer(note) {
    const modal = vytvorViewer();

    modal.title.textContent = note.title || t("sharing.sharedUntitled", "Bez názvu");
    modal.meta.textContent = t(
      "sharing.readOnlyMeta",
      "{owner} · pouze pro čtení",
      { owner: note.__lubanoteSharedOwnerUsername || "@?" }
    );

    const html = String(note.richContent || "").trim();

    if (html) {
      modal.content.innerHTML = bezpecneHtml(html);
    } else {
      modal.content.textContent = String(note.note || "");
    }

    modal.todoList.innerHTML = "";

    const todos = Array.isArray(note.todos) ? note.todos : [];
    modal.todoSection.hidden = todos.length === 0;
    modal.todoTitle.textContent = t("sharing.readOnlyTodos", "Úkoly");

    for (const todo of todos) {
      const row = document.createElement("div");
      row.className = "sharingReadOnlyTodo";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = todo?.completed === true;
      checkbox.disabled = true;
      checkbox.setAttribute("aria-hidden", "true");

      const text = document.createElement("div");
      text.className = "sharingReadOnlyTodoText";

      if (String(todo?.html || "").trim()) {
        text.innerHTML = bezpecneHtml(todo.html);
      } else {
        text.textContent = String(todo?.text || "");
      }

      row.append(checkbox, text);
      modal.todoList.append(row);
    }
  }

  function otevriReadOnly(noteId) {
    const note = sdilenePoznamky.find((item) => item.id === noteId);

    if (!note) {
      return;
    }

    viewerNoteId = noteId;
    const modal = vytvorViewer();
    naplnViewer(note);
    modal.overlay.hidden = false;
    document.body.classList.add("sharingReadOnlyOpen");
  }

  function zavriReadOnly() {
    if (!viewer) {
      return;
    }

    viewer.overlay.hidden = true;
    viewerNoteId = null;
    document.body.classList.remove("sharingReadOnlyOpen");
  }

  async function obnovZeServeru({ tichy = false, vykreslit = true } = {}) {
    const userId = ziskejUserId();

    if (!userId) {
      sdilenePoznamky = [];
      if (vykreslit) vykresliSdileneKarty();
      return [];
    }

    if (!navigator.onLine) {
      sdilenePoznamky = nactiCache();
      if (vykreslit) vykresliSdileneKarty();
      return sdilenePoznamky;
    }

    if (probihajiciNacteni) {
      return probihajiciNacteni;
    }

    probihajiciNacteni = (async () => {
      try {
        const klient = await zajistiSupabase();

        if (!klient) {
          throw new Error("supabase_unavailable");
        }

        const { data, error } = await klient.rpc(
          "lubanote_get_shared_notes_safe"
        );

        if (error) {
          throw error;
        }

        const nove = ziskejRadkyZRcp(data)
          .map(prevedRadekNaPoznamku)
          .filter(Boolean);

        /*
         * Účet se mohl během await změnit. Výsledek starého účtu
         * nikdy nesmíme uložit pod cache nového účtu.
         */
        if (ziskejUserId() !== userId) {
          return sdilenePoznamky;
        }

        sdilenePoznamky = nove;
        ulozCache(nove);

        if (vykreslit) {
          if (typeof window.renderTasks === "function") {
            window.renderTasks();
          } else {
            vykresliSdileneKarty();
          }
        }

        window.dispatchEvent(
          new CustomEvent("lubanote:shared-notes-updated", {
            detail: {
              count: nove.length,
              userId
            }
          })
        );

        return nove;
      } catch (error) {
        if (!tichy) {
          console.error("Sdílení: shared notes se nepodařilo načíst.", error);
        }

        /* Síťová/krátkodobá chyba nesmí smazat funkční offline cache. */
        sdilenePoznamky = nactiCache();

        if (vykreslit) {
          if (typeof window.renderTasks === "function") {
            window.renderTasks();
          } else {
            vykresliSdileneKarty();
          }
        }

        return sdilenePoznamky;
      } finally {
        probihajiciNacteni = null;
      }
    })();

    return probihajiciNacteni;
  }

  function obalRenderTasks() {
    if (
      puvodniRenderTasks ||
      typeof window.renderTasks !== "function"
    ) {
      return;
    }

    puvodniRenderTasks = window.renderTasks;

    window.renderTasks = function (...args) {
      const vysledek = puvodniRenderTasks.apply(this, args);
      vykresliSdileneKarty();
      return vysledek;
    };
  }

  function obalAndroidBack() {
    if (puvodniAndroidZpet || typeof window.LubaNoteZpracujAndroidZpet !== "function") {
      return;
    }

    puvodniAndroidZpet = window.LubaNoteZpracujAndroidZpet;

    window.LubaNoteZpracujAndroidZpet = function () {
      if (viewer && !viewer.overlay.hidden) {
        zavriReadOnly();
        return true;
      }

      return puvodniAndroidZpet();
    };
  }

  function spustPolling() {
    clearInterval(pollTimer);

    pollTimer = setInterval(() => {
      if (
        !document.hidden &&
        navigator.onLine &&
        ziskejUserId()
      ) {
        obnovZeServeru({ tichy: true, vykreslit: true });
      }
    }, POLL_MS);
  }

  function nastavUcet(userId) {
    aktualniUserId = userId || localStorage.getItem(LOCAL_OWNER_KEY) || null;
    sdilenePoznamky = nactiCache();

    if (typeof window.renderTasks === "function") {
      window.renderTasks();
    } else {
      vykresliSdileneKarty();
    }

    if (aktualniUserId && navigator.onLine) {
      obnovZeServeru({ tichy: true, vykreslit: true });
    }
  }

  obalRenderTasks();
  obalAndroidBack();

  sdilenePoznamky = nactiCache();
  vykresliSdileneKarty();
  spustPolling();

  window.addEventListener("lubanote:account-active", (event) => {
    nastavUcet(event.detail?.userId || null);
  });

  window.addEventListener("lubanote:auth-expired", () => {
    aktualniUserId = null;
    sdilenePoznamky = [];
    zavriReadOnly();

    if (typeof window.renderTasks === "function") {
      window.renderTasks();
    }
  });

  window.addEventListener("lubanote:sharing-changed", () => {
    obnovZeServeru({ tichy: true, vykreslit: true });
  });

  window.addEventListener("online", () => {
    obnovZeServeru({ tichy: true, vykreslit: true });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      sdilenePoznamky = nactiCache();

      if (typeof window.renderTasks === "function") {
        window.renderTasks();
      }

      if (navigator.onLine) {
        obnovZeServeru({ tichy: true, vykreslit: true });
      }
    }
  });

  window.addEventListener("lubanote:language-change", () => {
    aplikujViewerPreklady();

    if (typeof window.renderTasks === "function") {
      window.renderTasks();
    }
  });

  window.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key === "Escape" &&
        viewer &&
        !viewer.overlay.hidden
      ) {
        event.preventDefault();
        event.stopPropagation();
        zavriReadOnly();
      }
    },
    true
  );

  /*
   * Pokud už je účet při načtení modulu známý, použijeme cache hned
   * a online stav poté autoritativně obnovíme ze serveru.
   */
  if (aktualniUserId && navigator.onLine) {
    obnovZeServeru({ tichy: true, vykreslit: true });
  }

  window.LubaNoteSharingNotes = {
    obnovZeServeru,
    vykresliSdileneKarty,
    ziskejSdilenePoznamky: () => [...sdilenePoznamky],
    jeSdilenaPoznamka: (noteId) =>
      sdilenePoznamky.some((note) => note.id === noteId),
    otevriReadOnly,
    zavriReadOnly
  };
})();
