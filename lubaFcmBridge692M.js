/* 692M: background FCM signal -> resume existing V2 sync. No note plaintext in push.
   Android's data message is NOT a substitute for running JS in the background. */
(() => {
  'use strict';
  const endpoint = 'lubanote-fcm';
  const plugin = window.Capacitor?.Plugins?.LubaNoteFcmToken || null;
  const isNative = Boolean(plugin && window.Capacitor?.isNativePlatform?.());
  const apiHost = (() => {
    try {return new URL(SUPABASE_URL).hostname;} catch {return '';}
  })();
  if (apiHost !== 'api.lubanote.com' && apiHost !== 'test.lubanote.com') return;

  let registeredToken = '';
  let registeredUser = '';
  let registrationBusy = false;
  let pendingBusy = false;
  let wakeTimer = null;
  let lastWake = 0;

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
      if (saved?.registered) {
        registeredToken = token;
        registeredUser = session.user.id;
      }
    } catch { /* retry upon next focus or auth event */ }
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
      const restored = await window.LubaNoteReminders?.obnovPoSynchronizaci?.(null);
      if (restored !== true) return;
      await plugin.ackPendingSync({generation:String(pending.generation || '')});
    } catch { /* keep pending flag; try after next foreground */ }
    finally {pendingBusy = false;}
  }

  async function resume() {
    await registerToken();
    await checkPendingSync();
  }
  function scheduleResume() {setTimeout(() => {void resume();},400);}
  window.addEventListener('lubanote:auth-valid', scheduleResume);
  window.addEventListener('online', scheduleResume);
  window.addEventListener('focus', scheduleResume);
  window.addEventListener('pageshow', scheduleResume);
  document.addEventListener('visibilitychange', () => {if (!document.hidden) scheduleResume();});

  // Desktop sends a wake signal only when a confirmed cloud write may affect
  // reminders. Other note edits remain on the existing Realtime transport.
  if (!isNative) {
    let oldReminderNotes = new Set();
    function reminderIds() {
      try {
        return new Set((typeof loadTask === 'function' ? loadTask() : [])
          .filter(note => note?.id && (note?.reminder === true || Boolean(note?.notificationId) ||
            note?.plannedItems?.some?.(p => p?.plannedAt)))
          .map(note => String(note.id)));
      } catch {return new Set();}
    }
    oldReminderNotes = reminderIds();
    window.addEventListener('lubanote:cloud-write-confirmed', event => {
      const id = String(event?.detail?.noteId || '');
      if (!id) return;
      const current = reminderIds();
      const touched = current.has(id) || oldReminderNotes.has(id) ||
        (typeof loadTask === 'function' && !loadTask().some(note => String(note?.id) === id));
      oldReminderNotes = current;
      if (!touched) return;
      clearTimeout(wakeTimer);
      wakeTimer = setTimeout(async () => {
        // Bound request frequency; backend also enforces atomic rate limiting.
        if (Date.now() - lastWake < 21000) return;
        const response = await invoke({action:'wake',deviceId:deviceId() || ''});
        if (response?.ok === true) lastWake = Date.now();
      },1200);
    });
  }
  scheduleResume();
  // A cold WebView may initialize auth/sync after this optional script.
  setTimeout(scheduleResume, 3500);
  setTimeout(scheduleResume, 10000);
})();
