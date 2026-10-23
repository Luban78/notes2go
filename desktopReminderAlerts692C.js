/* 692C – PC popup + missed reminder bell. Uses existing LubaNote reminder store/actions.
   No independent reminder DB, writes only via saveReminderDate / savePlannedReminderDate. */
(() => {
  "use strict";
  if (window.Capacitor?.isNativePlatform?.()) return;
  const desktop = window.matchMedia("(min-width: 1100px) and (hover: hover) and (pointer: fine)");
  if (!desktop.matches) return;
  const bell = document.getElementById("lnPcReminderBell692C");
  const badge = document.getElementById("lnPcReminderCount692C");
  if (!bell || !badge) return;

  const center = document.createElement("section");
  center.id = "lnPcReminderCenter692C";
  center.hidden = true;
  center.setAttribute("role", "dialog");
  center.setAttribute("aria-label", "Zmeškané připomínky");
  center.innerHTML = `
    <div class="lnPcReminderCenterHead692C">
      <strong>Zmeškané připomínky <span id="lnPcReminderCenterCount692C"></span></strong>
      <button type="button" class="lnPcReminderCenterClose692C" aria-label="Zavřít přehled">×</button>
    </div>
    <div class="lnPcReminderList692C"></div>
    <div class="lnPcReminderCenterFoot692C">
      <button type="button" class="lnPcReminderGo692C">Otevřít Připomínky</button>
      <button type="button" class="lnPcReminderPermission692C" hidden>Povolit oznámení i na jiné kartě</button>
    </div>
    <div class="lnPcReminderMuted692C lnPcReminderPermissionInfo692C"></div>`;
  const toast = document.createElement("aside");
  toast.id = "lnPcReminderToast692C";
  toast.hidden = true;
  toast.setAttribute("role", "status");
  toast.innerHTML = `
    <div class="lnPcReminderToastHead692C"><span>🔔 Připomínka · LubaNote</span><time class="lnPcReminderToastTime692C"></time></div>
    <button class="lnPcReminderOpen692C" type="button" title="Otevřít poznámku">
      <span class="lnPcReminderToastTitle692C"></span>
      <span class="lnPcReminderToastSub692C">Kliknutím otevřeš poznámku</span>
    </button>
    <div class="lnPcReminderSnoozeChoices692C" hidden>
      <button type="button" data-pc-snooze="15">15 min</button>
      <button type="button" data-pc-snooze="60">1 hodina</button>
      <button type="button" data-pc-snooze="tomorrow">Zítra</button>
    </div>
    <div class="lnPcReminderError692C" hidden></div>
    <div class="lnPcReminderToastActions692C">
      <button class="lnPcReminderDismiss692C" type="button">Zavřít</button>
      <button class="lnPcReminderSnooze692C" type="button" aria-expanded="false">Odložit</button>
    </div>`;
  // Browser permissions need a real click. Offer a small in-app window after sign-in.
  const permissionPrompt = document.createElement("section");
  permissionPrompt.id = "lnPcReminderPermissionPrompt692D";
  permissionPrompt.hidden = true;
  permissionPrompt.setAttribute("role", "dialog");
  permissionPrompt.setAttribute("aria-labelledby", "lnPcReminderPermissionTitle692D");
  permissionPrompt.innerHTML = `
    <strong id="lnPcReminderPermissionTitle692D">🔔 Upozornění LubaNote na PC</strong>
    <p>Povol oznámení, abys připomínky viděl i při práci na jiné kartě Chromu.</p>
    <div class="lnPcReminderPermissionActions692D">
      <button class="lnPcReminderPermissionLater692D" type="button">Teď ne</button>
      <button class="lnPcReminderPermissionAllow692D" type="button">Povolit oznámení</button>
    </div>`;
  document.body.append(center, toast, permissionPrompt);

  const centerList = center.querySelector(".lnPcReminderList692C");
  const centerCount = center.querySelector("#lnPcReminderCenterCount692C");
  const permissionButton = center.querySelector(".lnPcReminderPermission692C");
  const permissionInfo = center.querySelector(".lnPcReminderPermissionInfo692C");
  const permissionAllow = permissionPrompt.querySelector(".lnPcReminderPermissionAllow692D");
  const permissionLater = permissionPrompt.querySelector(".lnPcReminderPermissionLater692D");
  const openToast = toast.querySelector(".lnPcReminderOpen692C");
  const toastTitle = toast.querySelector(".lnPcReminderToastTitle692C");
  const toastTime = toast.querySelector(".lnPcReminderToastTime692C");
  const snooze = toast.querySelector(".lnPcReminderSnooze692C");
  const choices = toast.querySelector(".lnPcReminderSnoozeChoices692C");
  const error = toast.querySelector(".lnPcReminderError692C");
  const memoryKey = "lnPcReminderShown692C-v1";
  const shown = new Set();
  try {
    const saved = JSON.parse(sessionStorage.getItem(memoryKey) || "[]");
    if (Array.isArray(saved)) saved.slice(-250).forEach((key) => shown.add(String(key)));
  } catch (_) {}
  function remember(key) {
    shown.add(key);
    if (shown.size > 260) shown.delete(shown.values().next().value);
    try { sessionStorage.setItem(memoryKey, JSON.stringify([...shown])); } catch (_) {}
  }
  const keyOf = entry => `${entry.kind}:${entry.id}:${entry.date}`;
  let due = [];
  let active = null;
  let saving = false;
  let initialized = false;
  let lastSyncState = "pending";
  let systemNotice = null;

  // The read flag belongs to this browser and logged-in account. It never
  // edits a note, marks a Planner task complete, or changes the due date.
  const acknowledged = new Set();
  let accountId = null;
  let lastAccountCheck = 0;
  let accountCheck = null;
  const readKey = id => `lnPcReminderRead692D:${id}`;
  const permissionChoiceKey = id => `lnPcReminderPermission692D:${id}`;
  const unread = () => due.filter(entry => !acknowledged.has(keyOf(entry)));

  function loadAcknowledged(id) {
    acknowledged.clear();
    if (!id) return;
    try {
      const saved = JSON.parse(localStorage.getItem(readKey(id)) || "[]");
      if (Array.isArray(saved)) saved.slice(-600).forEach(key => {
        if (typeof key === "string" && key.length <= 400) acknowledged.add(key);
      });
    } catch (_) {}
  }
  function markRead(entry) {
    if (!entry || !accountId) return;
    acknowledged.add(keyOf(entry));
    while (acknowledged.size > 600) acknowledged.delete(acknowledged.values().next().value);
    try { localStorage.setItem(readKey(accountId), JSON.stringify([...acknowledged])); } catch (_) {}
    refreshBell();
    if (!center.hidden) renderCenter();
  }
  function permissionSupported() {
    return window.isSecureContext && "Notification" in window;
  }
  function offerPermission() {
    if (!accountId || !ready() || document.hidden ||
        !permissionSupported() || Notification.permission !== "default") return;
    let ignored = false;
    try { ignored = localStorage.getItem(permissionChoiceKey(accountId)) === "later"; } catch (_) {}
    if (!ignored) permissionPrompt.hidden = false;
  }
  function setAccount(id) {
    if (id === accountId) return;
    accountId = id;
    if (!id) lastAccountCheck = 0;
    loadAcknowledged(id);
    permissionPrompt.hidden = true;
    if (id) offerPermission();
    refreshBell();
    if (!center.hidden) renderCenter();
  }
  // Supabase session is used only to scope local UI acknowledgements to the
  // current account. No new remote writes, RPC, or authentication changes.
  function checkAccount(force = false) {
    if (!ready()) return Promise.resolve();
    if (accountCheck) return accountCheck;
    if (!force && Date.now() - lastAccountCheck < 30000) return Promise.resolve();
    const client = typeof supabaseClient !== "undefined" ? supabaseClient : window.supabaseClient;
    if (typeof client?.auth?.getSession !== "function") return Promise.resolve();
    lastAccountCheck = Date.now();
    accountCheck = Promise.resolve().then(() => client.auth.getSession())
      .then(({ data, error }) => {
        if (error) return;
        setAccount(data?.session?.user?.id || null);
        offerPermission();
      })
      .catch(() => {})
      .finally(() => { accountCheck = null; });
    return accountCheck;
  }

  const niceDate = value => {
    const dt = new Date(value);
    if (!Number.isFinite(dt.getTime())) return "—";
    return dt.toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
  };
  function ready() {
    return desktop.matches && !document.body.classList.contains("authPending") &&
      lastSyncState !== "auth-expired" &&
      typeof getReminderEntries === "function" && typeof loadTask === "function";
  }
  // For recurrence, the original reminder listing intentionally selects the NEXT future date.
  // The PC notifier needs the LAST already due occurrence (only within the previous 7 days).
  function latestRecurringDue(note, now) {
    const next = window.LubaNoteRecurring?.vypocitejPristiTermin;
    if (typeof next !== "function" || !note?.date || !note?.repeat?.enabled) return null;
    let cursor = new Date(now - 8 * 86400000);
    let latest = null;
    for (let i = 0; i < 20; i++) {
      const candidate = next(note.date, note.repeat, cursor);
      if (!(candidate instanceof Date) || !Number.isFinite(candidate.getTime())) break;
      if (candidate.getTime() > now) break;
      latest = candidate;
      cursor = new Date(candidate.getTime() + 1000);
    }
    return latest && latest.getTime() >= now - 7 * 86400000 ? latest : null;
  }
  function getDue() {
    const now = Date.now();
    const notes = new Map((loadTask() || []).filter(note => note?.id).map(note => [note.id, note]));
    return getReminderEntries("all")
      .filter(entry => {
        const source = notes.get(entry.sourceNoteId);
        return source && source.isSecret !== true &&
          (entry.kind !== "note" || source.completed !== true);
      })
      .map(entry => {
        if (entry.kind === "note" && entry.sourceType === "recurring-note") {
          const latest = latestRecurringDue(notes.get(entry.id), now);
          return latest ? { ...entry, date: latest.toISOString() } : null;
        }
        return entry;
      })
      .filter(entry => entry && Number.isFinite(new Date(entry.date).getTime()) && new Date(entry.date).getTime() <= now)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }
  function refreshBell() {
    const count = unread().length;
    badge.textContent = count > 99 ? "99+" : String(count);
    badge.hidden = count === 0;
    bell.setAttribute("aria-label", `Nepřečtené zmeškané připomínky: ${count}`);
    centerCount.textContent = `(${count})`;
  }
  function closeCenter() {
    center.hidden = true;
    bell.setAttribute("aria-expanded", "false");
  }
  function renderCenter() {
    // Popover starts directly underneath the bell, even if the header moves.
    const box = bell.getBoundingClientRect();
    center.style.top = `${Math.max(8, Math.min(window.innerHeight - 175, box.bottom + 10))}px`;
    center.style.right = `${Math.max(12, Math.round(window.innerWidth - box.right))}px`;
    refreshBell();
    centerList.replaceChildren();
    const unreadEntries = unread();
    if (unreadEntries.length === 0) {
      const empty = document.createElement("p");
      empty.className = "lnPcReminderMuted692C";
      empty.textContent = "Všechny připomínky jsou přečtené. Aktivní úkoly zůstávají v Připomínkách. ✓";
      centerList.append(empty);
    }
    unreadEntries.slice(0, 15).forEach(entry => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "lnPcReminderListItem692C";
      const title = document.createElement("span");
      title.className = "lnPcReminderListTitle692C";
      title.textContent = entry.title || "Bez názvu";
      const date = document.createElement("span");
      date.className = "lnPcReminderListDate692C";
      date.textContent = niceDate(entry.date);
      item.append(title, date);
      item.addEventListener("click", () => void openEntry(entry));
      centerList.append(item);
    });
    if (unreadEntries.length > 15) {
      const rest = document.createElement("p");
      rest.className = "lnPcReminderMuted692C";
      rest.textContent = `Dalších ${unreadEntries.length - 15} nepřečtených v Připomínkách.`;
      centerList.append(rest);
    }
    if ("Notification" in window && window.isSecureContext) {
      const state = Notification.permission;
      permissionButton.hidden = state !== "default";
      permissionInfo.textContent = state === "denied"
        ? "Oznámení na jiné kartě zablokoval prohlížeč nebo jeho správce. Upozornění uvnitř LubaNote fungují dál."
        : state === "granted"
          ? "Oznámení na jiné kartě jsou povolena."
          : "Upozornění na jiné kartě můžeš povolit tlačítkem.";
    } else {
      permissionButton.hidden = true;
      permissionInfo.textContent = "Oznámení fungují při otevřené kartě LubaNote.";
    }
  }
  function hideToast() {
    toast.hidden = true;
    choices.hidden = true;
    snooze.setAttribute("aria-expanded", "false");
    error.hidden = true;
    active = null;
    try { systemNotice?.close(); } catch (_) {}
    systemNotice = null;
  }
  async function openEntry(entry) {
    if (!entry) return;
    closeCenter();
    try {
      const noteId = entry.sourceNoteId || entry.id;
      let result;
      if (entry.kind === "planned" && typeof openPlannedSourceInEditor === "function") {
        result = await openPlannedSourceInEditor(entry.id);
      } else if (typeof openTaskEditorById === "function") {
        result = await openTaskEditorById(noteId);
      } else return;
      // Read is confirmed only when the intended editor is actually visible.
      const visibleEditor = document.getElementById("taskModal");
      const opened = result !== false && visibleEditor?.hidden === false &&
        String(visibleEditor?.dataset?.taskId || "") === String(noteId);
      if (!opened) return;
      if (active && keyOf(active) === keyOf(entry)) hideToast();
      await checkAccount(true);
      markRead(entry);
    } catch (err) { console.warn("692D: Nelze otevrit poznamku", err); }
  }
  function notifyOtherTab(entry) {
    if (!document.hidden || !("Notification" in window) || Notification.permission !== "granted") return;
    try {
      systemNotice?.close();
      systemNotice = new Notification("LubaNote · Připomínka", {
        body: String(entry.title || "Naplánovaný úkol").slice(0, 160),
        tag: `ln-692C-${entry.kind}-${entry.id}`
      });
      systemNotice.onclick = () => { window.focus(); void openEntry(entry); try { systemNotice?.close(); } catch (_) {} };
    } catch (err) { console.warn("692C: Oznámení prohlížeče není dostupné", err); }
  }
  function showToast(entry) {
    if (active || !entry) return;
    active = entry;
    toastTitle.textContent = entry.title || "Bez názvu";
    toastTime.textContent = niceDate(entry.date);
    error.hidden = true;
    choices.hidden = true;
    snooze.setAttribute("aria-expanded", "false");
    toast.hidden = false;
    remember(keyOf(entry));
    notifyOtherTab(entry);
  }
  function scan() {
    if (!ready()) {
      if (!document.body.classList.contains("authPending") && lastSyncState !== "auth-expired") return;
      due = [];
      refreshBell();
      closeCenter();
      hideToast();
      permissionPrompt.hidden = true;
      setAccount(null);
      initialized = false;
      return;
    }
    void checkAccount();
    try { due = getDue(); } catch (err) {
      console.warn("692C: Cteni pripominek se odlozilo", err);
      return;
    }
    refreshBell();
    if (!center.hidden) renderCenter();
    if (active && !due.some(entry => keyOf(entry) === keyOf(active))) hideToast();
    if (!initialized) {
      initialized = true;
      // First load: don't flood the screen with older missed reminders.
      const pending = unread();
      const latest = pending.find(entry => !shown.has(keyOf(entry)) && Date.now() - new Date(entry.date).getTime() <= 86400000);
      pending.forEach(entry => { if (!latest || keyOf(entry) !== keyOf(latest)) remember(keyOf(entry)); });
      if (latest) showToast(latest);
      return;
    }
    if (!active && !saving) {
      const next = unread().find(entry => !shown.has(keyOf(entry)));
      if (next) showToast(next);
    }
  }
  bell.addEventListener("click", event => {
    event.stopPropagation();
    if (center.hidden) { scan(); renderCenter(); center.hidden = false; bell.setAttribute("aria-expanded", "true"); }
    else closeCenter();
  });
  center.querySelector(".lnPcReminderCenterClose692C").addEventListener("click", closeCenter);
  center.querySelector(".lnPcReminderGo692C").addEventListener("click", () => {
    closeCenter();
    document.getElementById("remindersModuleButton")?.click();
  });
  function requestDesktopPermission() {
    if (!permissionSupported() || Notification.permission !== "default") return;
    // IMPORTANT: invoke requestPermission synchronously inside click.
    let response;
    try { response = Notification.requestPermission(); }
    catch (_) { permissionPrompt.hidden = true; return; }
    Promise.resolve(response).then(result => {
      permissionPrompt.hidden = true;
      if (result === "denied" && accountId) {
        try { localStorage.setItem(permissionChoiceKey(accountId), "later"); } catch (_) {}
      }
      if (!center.hidden) renderCenter();
    }).catch(() => { permissionPrompt.hidden = true; });
  }
  permissionButton.addEventListener("click", requestDesktopPermission);
  permissionAllow.addEventListener("click", requestDesktopPermission);
  permissionLater.addEventListener("click", () => {
    permissionPrompt.hidden = true;
    if (accountId) {
      try { localStorage.setItem(permissionChoiceKey(accountId), "later"); } catch (_) {}
    }
  });
  document.addEventListener("pointerdown", event => {
    if (!center.hidden && !center.contains(event.target) && !bell.contains(event.target)) closeCenter();
  });
  document.addEventListener("keydown", event => { if (event.key === "Escape") closeCenter(); });
  openToast.addEventListener("click", () => void openEntry(active));
  // Also open the note on a click into the card surface, but never on action buttons.
  toast.addEventListener("click", event => {
    if (event.target.closest("button") || !active) return;
    void openEntry(active);
  });
  toast.querySelector(".lnPcReminderDismiss692C").addEventListener("click", hideToast);
  snooze.addEventListener("click", () => {
    if (!active || saving) return;
    choices.hidden = !choices.hidden;
    snooze.setAttribute("aria-expanded", String(!choices.hidden));
  });
  choices.addEventListener("click", async event => {
    const btn = event.target.closest("[data-pc-snooze]");
    if (!btn || !active || saving) return;
    const entry = active;
    // Refresh before write: don't change a reminder already moved/deleted on another device.
    scan();
    if (!active || !due.some(candidate => keyOf(candidate) === keyOf(entry))) return;
    const action = btn.dataset.pcSnooze;
    let target;
    if (action === "tomorrow") {
      const next = window.LubaNoteTomorrowSnooze683BT?.nextDate;
      if (typeof next !== "function") { error.textContent = "Volba Zítra není dostupná."; error.hidden = false; return; }
      let pref = null;
      try { pref = JSON.parse(localStorage.getItem("rychleOdlozeni") || "null")?.volba4; } catch (_) {}
      target = next(pref);
    } else {
      target = new Date(Date.now() + Number(action) * 60000);
    }
    if (!(target instanceof Date) || !Number.isFinite(target.getTime()) || target.getTime() <= Date.now()) return;
    saving = true;
    error.hidden = true;
    choices.querySelectorAll("button").forEach(button => button.disabled = true);
    try {
      const ok = entry.kind === "planned"
        ? await savePlannedReminderDate(entry.id, target)
        : await saveReminderDate(entry.id, target);
      if (ok) hideToast();
      else { error.textContent = "Odložení se nepodařilo. Zkus to znovu."; error.hidden = false; }
    } catch (err) {
      console.error("692C: Chyba odlozeni", err);
      error.textContent = "Odložení se nepodařilo. Zkus to znovu.";
      error.hidden = false;
    } finally {
      saving = false;
      choices.querySelectorAll("button").forEach(button => button.disabled = false);
      scan();
    }
  });
  window.addEventListener("lubanote:sync-state", event => {
    const state = event.detail?.stav;
    if (state === "restore") return;
    if (typeof state === "string") lastSyncState = state;
    scan();
  });
  window.addEventListener("focus", () => { scan(); void checkAccount(true); });
  window.addEventListener("online", scan);
  document.addEventListener("visibilitychange", () => {
    scan();
    if (!document.hidden) { void checkAccount(true); offerPermission(); }
  });
  window.setInterval(scan, 12000);
  window.setTimeout(scan, 500);
})();
