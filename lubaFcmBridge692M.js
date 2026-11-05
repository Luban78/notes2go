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

  /* 695Q: Opravneni presnych alarmu se zobrazuje az po startu aplikace,
   * uvnitr existujiciho choiceModal. Native plugin pouze overi stav a
   * na vyslovne potvrzeni otevre Android nastaveni. Zadny novy modal.
   * Po "Pozdeji" neopakovat po kazdem getToken/resume; maximalne jednou
   * behem jednoho spusteni a nejdrive za 24 hodin. */
  let uiPripravenoProAlarm695Q = false;
  let dotazNaAlarmPraveBezi695Q = false;
  let alarmModalZobrazen695Q = false;
  const ALARM_ODLOZENI_KEY_695Q = 'lubanoteExactAlarmDeferred695Q';
  async function nabidniNastaveniAlarmu695Q() {
    if (!isNative || !uiPripravenoProAlarm695Q || document.hidden ||
        dotazNaAlarmPraveBezi695Q || alarmModalZobrazen695Q ||
        typeof window.otevriPotvrzovaciModalLubaNote !== 'function' ||
        typeof plugin.getExactAlarmStatus !== 'function' ||
        typeof plugin.openExactAlarmSettings695Q !== 'function') return;
    dotazNaAlarmPraveBezi695Q = true;
    try {
      const session = await currentSession();
      if (!session?.user?.id || document.hidden) return;
      const status = await plugin.getExactAlarmStatus();
      if (status?.allowed !== false || Number(status?.androidApi || 0) < 31) return;
      let posledniOdlozeni = 0;
      try { posledniOdlozeni = Number(localStorage.getItem(ALARM_ODLOZENI_KEY_695Q)) || 0; }
      catch (_) {}
      if (posledniOdlozeni > 0 && Date.now() - posledniOdlozeni < 24 * 60 * 60 * 1000) return;
      if (document.hidden || alarmModalZobrazen695Q) return;
      const otevreno = window.otevriPotvrzovaciModalLubaNote({
        nadpis: 'Připomínky LubaNote',
        text: 'Pro spolehlivé doručení připomínek je potřeba povolit přesné alarmy.\n' +
          'Teď jsou v telefonu vypnuté, takže se připomínky mohou zpozdit.\n' +
          'Chceš otevřít nastavení „Budíky a připomínky“?',
        popisekZrusit: 'Později',
        popisekPotvrdit: 'Otevřít nastavení',
        poZruseni: () => {
          try { localStorage.setItem(ALARM_ODLOZENI_KEY_695Q, String(Date.now())); }
          catch (_) {}
        },
        poPotvrzeni: async () => {
          await plugin.openExactAlarmSettings695Q();
        }
      });
      if (otevreno) alarmModalZobrazen695Q = true;
    } catch (error) {
      console.warn('LubaNote: kontrola přesných alarmů selhala', error);
    } finally { dotazNaAlarmPraveBezi695Q = false; }
  }
  window.addEventListener('lubanote:splash-ready', () => {
    uiPripravenoProAlarm695Q = true;
    // Nechat aplikaci nejdrive dokoncit prvni vykresleni.
    setTimeout(() => { void nabidniNastaveniAlarmu695Q(); }, 350);
  });


  /* 699AC: Android may refuse a new alarm when its per-app alarm quota is
   * exhausted. Only show a LubaNote modal for a CONFIRMED native limit error.
   * The native timestamp survives a killed APK; UI waits until ready/visible.
   * Never change or delete reminders automatically. */
  const LIMIT_SHOWN_KEY_699AC = 'lubanoteAlarmLimitShown699AC';
  const LIMIT_FAILURE_KEY_699AC = 'lubanoteAlarmLimitFailureShown699AC';
  let kontrolaLimituBezi699AC = false;
  async function upozorniNaLimitAlarmu699AC() {
    if (!isNative || !uiPripravenoProAlarm695Q || document.hidden ||
        kontrolaLimituBezi699AC ||
        typeof plugin.getAlarmLimitFailure699AC !== 'function' ||
        typeof window.otevriPotvrzovaciModalLubaNote !== 'function') return;
    kontrolaLimituBezi699AC = true;
    try {
      const result = await plugin.getAlarmLimitFailure699AC();
      const failureMs = Number(result?.lastFailureMs || 0);
      if (!Number.isSafeInteger(failureMs) || failureMs <= 0 ||
          failureMs > Date.now() + 60000) return;
      let shownAt = 0;
      let shownFailure = 0;
      try {
        shownAt = Number(localStorage.getItem(LIMIT_SHOWN_KEY_699AC)) || 0;
        shownFailure = Number(localStorage.getItem(LIMIT_FAILURE_KEY_699AC)) || 0;
      } catch (_) {}
      if (failureMs <= shownFailure ||
          (shownAt > 0 && Date.now() - shownAt < 24 * 60 * 60 * 1000)) return;
      if (document.hidden || !document.getElementById('remindersModuleButton')) return;
      const opened = window.otevriPotvrzovaciModalLubaNote({
        nadpis: 'Limit připomínek Androidu',
        text: 'Android odmítl naplánovat další připomínku, protože byl dosažen limit současně naplánovaných alarmů (obvykle 500 na aplikaci).\n\n' +
          'Poznámka zůstává uložená, ale její upozornění nemusí zazvonit. Vypni nebo smaž nepotřebné připomínky a potom plánování zopakuj.',
        popisekZrusit: 'Rozumím',
        popisekPotvrdit: 'Otevřít připomínky',
        poPotvrzeni: () => {
          document.getElementById('remindersModuleButton')?.click();
        }
      });
      // Save only after the existing LubaNote modal actually opened.
      if (opened) {
        try {
          localStorage.setItem(LIMIT_SHOWN_KEY_699AC, String(Date.now()));
          localStorage.setItem(LIMIT_FAILURE_KEY_699AC, String(failureMs));
        } catch (_) {}
        window.LubaNoteStartupDiag?.zapis?.('REM-LIMIT', '699AC ANDROID LIMIT WARNING SHOWN');
      }
    } catch (_) { /* Native bridge may be unavailable during startup. */ }
    finally { kontrolaLimituBezi699AC = false; }
  }
  window.addEventListener('lubanote:splash-ready', () => {
    setTimeout(() => { void upozorniNaLimitAlarmu699AC(); }, 850);
  });

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
  async function checkRemoteOpen692T(nativeTap693G = false) {
    // 693G: On warm notification tap the Activity can wake this bridge even
    // before document visibility/focus events. Do not defer the native tap.
    if (!isNative || (document.hidden && !nativeTap693G) ||
        typeof plugin.getPendingRemoteOpen !== 'function') return;
    try {
      const tap = await plugin.getPendingRemoteOpen();
      if (!tap?.pending || !/^[\w:-]{1,128}$/.test(String(tap.noteId || ''))) return;
      const token = String(tap.token || '');
      if (!token || (token === lastRemoteOpenToken && Date.now() - lastRemoteOpenSentAt < 30000)) return;
      lastRemoteOpenToken = token;
      lastRemoteOpenSentAt = Date.now();
      window.LubaNoteStartupDiag?.zapis?.('REM-TAP', '696X REMOTE TAP DELIVERED | pending=true');
      window.dispatchEvent(new CustomEvent('lubanote:remote-reminder-open', {detail: tap}));
    } catch { /* available after native app init */ }
  }
  // 699Z: The warm Activity can resume before WebView is ready to invoke
  // the Capacitor bridge. Retry ONLY reading the persisted tap token.
  // 699Y owns idempotence and successful ACK; this never schedules alarms.
  let generaceKontrolyKliknuti699Z = 0;
  function proverKlikPoNavratu699Z() {
    const generace = ++generaceKontrolyKliknuti699Z;
    for (const delay of [0, 250, 750, 1800]) {
      setTimeout(() => {
        if (generace !== generaceKontrolyKliknuti699Z) return;
        void checkRemoteOpen692T(true);
      }, delay);
    }
  }
  // 693G/696X: Direct onNewIntent -> WebView signal for a warm Android tap.
  window.addEventListener('lubanote:native-reminder-tap-693G', () => {
    window.LubaNoteStartupDiag?.zapis?.('REM-TAP', '699Z NATIVE TAP SIGNAL');
    proverKlikPoNavratu699Z();
  });
  // 696X: Backup when Android restores focus after the notification shade.
  // Does not start sync, reschedule alarms, or touch the current note.
  window.addEventListener('lubanote:android-window-focus', event => {
    if (event?.detail?.focused === true) void checkRemoteOpen692T(true);
  });
  async function resume() {
    void checkRemoteOpen692T();
    // 692V: Index pre-existing local alarms BEFORE a pending FCM sync. This
    // restores ownership after an APK upgrade without changing their schedule.
    try { await window.LubaNoteReminders?.obnovIndexLokalnichAlarmu692V?.(); }
    catch (_) { /* native registration remains best effort */ }
    await registerToken();
    void nabidniNastaveniAlarmu695Q();
    void upozorniNaLimitAlarmu699AC();
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
          // 699W: one next recurring occurrence; Android receiver chains the rest.
          for (const date of window.LubaNoteRecurring.vypocitejBudouciTerminy(note.date,note.repeat,1,new Date()) || []) {
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
          // Rule is metadata only (no note body). Android can rearm offline
          // for months/years without keeping 32 future OS alarm slots.
          repeat: note?.isSecret!==true && note?.completed!==true &&
            note?.reminder===true && note?.repeat?.enabled===true
            ? (window.LubaNoteRecurring?.kopirujRepeat?.(note.repeat) || note.repeat) : null,
          baseAt: note?.date && note?.repeat?.enabled===true
            ? new Date(note.date).getTime() : null,
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
