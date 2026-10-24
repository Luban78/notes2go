/* 692O: FCM background alarm bridge. Only timestamps and numeric Android IDs cross
   the relay; note titles, note bodies and E2E secrets NEVER leave encrypted sync. */
(() => {
  'use strict';
  const endpoint = 'lubanote-fcm';
  const plugin = window.Capacitor?.Plugins?.LubaNoteFcmToken || null;
  const isNative = Boolean(plugin && window.Capacitor?.isNativePlatform?.());
  const apiHost = (() => {try {return new URL(SUPABASE_URL).hostname;} catch {return '';}})();
  if (apiHost !== 'api.lubanote.com' && apiHost !== 'test.lubanote.com') return;
  let registeredToken = '';
  let registeredUser = '';
  let registrationBusy = false;
  let pendingBusy = false;
  let lastWake = 0;
  const pendingUpdates = new Map();
  const perNoteRevisions = new Map();

  function deviceId() {
    try {
      const id = window.LubaNoteSync?.ziskejDeviceId?.() || localStorage.getItem('lubanoteDeviceId');
      return /^[\w:-]{8,128}$/.test(String(id || '')) ? String(id) : null;
    } catch {return null;}
  }
  async function currentSession() {
    try {
      const response = await supabaseClient?.auth?.getSession?.();
      return response?.data?.session?.access_token ? response.data.session : null;
    } catch {return null;}
  }
  async function invoke(body) {
    if (!navigator.onLine || !supabaseClient?.functions?.invoke) return null;
    if (!(await currentSession())) return null;
    try {
      const answer = await supabaseClient.functions.invoke(endpoint, {body});
      if (answer.error || answer.data?.ok !== true) return null;
      return answer.data;
    } catch {return null;}
  }
  async function registerToken() {
    if (!isNative || registrationBusy || !navigator.onLine) return;
    const session = await currentSession();
    const id = deviceId();
    if (!session?.user?.id || !id) return;
    registrationBusy = true;
    try {
      const result = await plugin.getToken();
      const token = String(result?.token || '');
      if (!token) return;
      if (registeredToken === token && registeredUser === session.user.id) return;
      const saved = await invoke({action:'register',deviceId:id,token});
      if (saved?.registered) {registeredToken = token; registeredUser = session.user.id;}
    } catch { /* retry on resume */ }
    finally {registrationBusy = false;}
  }
  async function checkPendingSync() {
    if (!isNative || pendingBusy || !navigator.onLine || document.hidden) return;
    if (!(await currentSession())) return;
    pendingBusy = true;
    try {
      const pending = await plugin.getPendingSync();
      if (!pending?.pending) return;
      const synced = await window.LubaNoteSync?.synchronizujPoznamkyTed?.();
      if (synced !== true) return;
      const changedIds = Array.isArray(pending.noteIds) && pending.noteIds.length > 0
        ? pending.noteIds.filter(id=>typeof id==='string') : null;
      // For touched notes use the incremental restore path. It cancels stale
      // Capacitor storage records even if native FCM already cancelled the
      // underlying PendingIntent (full restore preflight may otherwise skip).
      const restored = await window.LubaNoteReminders?.obnovPoSynchronizaci?.(changedIds);
      if (restored !== true) return;
      await plugin.ackPendingSync({generation:String(pending.generation || '')});
    } catch { /* keep pending signal */ }
    finally {pendingBusy = false;}
  }
  // 692T: Native notification taps survive process death. Dispatch only the
  // identifiers, never note text; the original reminders.js opens its own UI.
  let lastRemoteOpenToken = '';
  let lastRemoteOpenSentAt = 0;
  async function checkRemoteOpen692T() {
    if (!isNative || document.hidden || typeof plugin.getPendingRemoteOpen !== 'function') return;
    try {
      const tap = await plugin.getPendingRemoteOpen();
      if (!tap?.pending || !/^[\w:-]{1,128}$/.test(String(tap.noteId || ''))) return;
      const token = String(tap.token || '');
      if (!token || (token === lastRemoteOpenToken && Date.now() - lastRemoteOpenSentAt < 30000)) return;
      lastRemoteOpenToken = token;
      lastRemoteOpenSentAt = Date.now();
      window.dispatchEvent(new CustomEvent('lubanote:remote-reminder-open', {detail: tap}));
    } catch { /* available after native app init */ }
  }
  async function resume() {
    void checkRemoteOpen692T();
    // 692V: Index pre-existing local alarms BEFORE a pending FCM sync. This
    // restores ownership after an APK upgrade without changing their schedule.
    try { await window.LubaNoteReminders?.obnovIndexLokalnichAlarmu692V?.(); }
    catch (_) { /* native registration remains best effort */ }
    await registerToken();
    await checkPendingSync();
    void checkRemoteOpen692T();
  }
  function scheduleResume() {setTimeout(() => {void resume();},400);}
  window.addEventListener('lubanote:auth-valid', scheduleResume);
  window.addEventListener('online', scheduleResume);
  window.addEventListener('focus', scheduleResume);
  window.addEventListener('pageshow', scheduleResume);
  document.addEventListener('visibilitychange', () => {if (!document.hidden) scheduleResume();});

  /* Snapshot only the scheduling metadata necessary to cancel superseded alarms.
     No note text ever enters these objects or the FCM data payload. */
  function recurringId(noteId, iso) {
    const text = `${noteId}|${iso}`;
    let hash = 2166136261;
    for (let i=0;i<text.length;i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash,16777619);
    }
    return ((hash >>> 0) % 2147483646) + 1;
  }
  const snapshot = note => {
    const ids = [];
    if (Number.isInteger(Number(note?.notificationId)) && Number(note.notificationId) > 0)
      ids.push(Number(note.notificationId));
    if (note?.reminder === true && note?.repeat?.enabled === true && note?.date &&
        window.LubaNoteRecurring?.vypocitejBudouciTerminy) {
      try {
        const terms = window.LubaNoteRecurring.vypocitejBudouciTerminy(note.date,note.repeat,32,new Date()) || [];
        terms.forEach((term,index) => {
          if (index !== 0 || !note.notificationId)
            ids.push(recurringId(String(note.id),term.toISOString()));
        });
      } catch {/* no extra cancel IDs if recurring calc unavailable */}
    }
    for (const item of (Array.isArray(note?.plannedItems) ? note.plannedItems : [])) {
      const id = Number(item?.notificationId);
      if (Number.isInteger(id) && id > 0) ids.push(id);
    }
    return Array.from(new Set(ids)).slice(0, 128);
  };
  const snapshots = new Map();
  function collectSnapshots() {
    try {
      for (const note of (typeof loadTask === 'function' ? loadTask() : [])) {
        if (note?.id) snapshots.set(String(note.id), snapshot(note));
      }
    } catch {/* app not initialized yet */}
  }
  function futureTime(input) {
    const n = new Date(input).getTime();
    return Number.isSafeInteger(n) && n > Date.now() + 1000 &&
      n < Date.now() + 366 * 24 * 3600 * 1000 ? n : null;
  }
  function alarmProjection(note) {
    if (!note || note.isSecret === true || note.completed === true) return [];
    const items = [];
    if (note.reminder === true && note.date) {
      if (note.repeat?.enabled === true && window.LubaNoteRecurring?.vypocitejBudouciTerminy) {
        try {
          for (const date of window.LubaNoteRecurring.vypocitejBudouciTerminy(note.date,note.repeat,32,new Date()) || []) {
            const at = futureTime(date);
            if (at) items.push(at);
          }
        } catch {/* never send a possibly wrong recurring alarm */}
      } else if (note.notificationId) {
        const at = futureTime(note.date);
        if (at) items.push(at);
      }
    }
    for (const item of (Array.isArray(note.plannedItems) ? note.plannedItems : [])) {
      if (item?.completed === true || !item?.notificationId || item?.reminder === false) continue;
      const at = futureTime(item.plannedAt);
      if (at) items.push(at);
    }
    return Array.from(new Set(items)).sort((a,b) => a-b).slice(0,48);
  }
  function nextRevision(noteId) {
    const rev = Math.max(Date.now(), (perNoteRevisions.get(noteId) || 0) + 1);
    perNoteRevisions.set(noteId, rev);
    return rev;
  }
  if (!isNative) {
    collectSnapshots();
    window.addEventListener('lubanote:cloud-write-confirmed', event => {
      const id = String(event?.detail?.noteId || '');
      if (!/^[\w:-]{1,128}$/.test(id)) return;
      // Collapse multiple confirmations for the same note, but never suppress a
      // separate note's change, including deletions and Planner edits.
      clearTimeout(pendingUpdates.get(id));
      pendingUpdates.set(id, setTimeout(async () => {
        pendingUpdates.delete(id);
        const note = (typeof loadTask === 'function' ? loadTask() : []).find(n => String(n?.id) === id) || null;
        const oldIds = snapshots.get(id) || [];
        const currentIds = snapshot(note);
        const meaningful = !note || oldIds.length > 0 || currentIds.length > 0 ||
          note?.reminder === true || note?.plannedItems?.some?.(p => p?.plannedAt);
        snapshots.set(id, currentIds);
        if (!meaningful) return;
        const response = await invoke({
          action:'alarm_update',deviceId:deviceId() || '',noteId:id,
          revision:nextRevision(id),at:alarmProjection(note),
          // Only ordinary notes. E2E content is intentionally disclosed as a
          // short notification preview to the user's own FCM devices.
          title: note && note.isSecret !== true ? String(note.title || 'LubaNote').slice(0,120) : '',
          preview: note && note.isSecret !== true ? String(note.note || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g,' ').trim().slice(0,160) : '',
          cancel:Array.from(new Set([...oldIds,...currentIds])).slice(0,128)
        });
        // If a newer Android hasn't registered, its next foreground sync is
        // the original reconciliation path. Report failure by keeping the old
        // cancel set for the next edit; do NOT fake delivery.
        if (!response?.ok) snapshots.set(id, Array.from(new Set([...oldIds,...currentIds])));
      },1200));
    });
  }
  scheduleResume();
  setTimeout(scheduleResume,3500);
  setTimeout(scheduleResume,10000);
})();
