/* 699D-CP: Isolated Web Push for installed Android PWA. No APK/PC side effects.
   Only opaque hashes and future UTC dates leave the browser; never E2E contents. */
(() => {
  'use strict';
  const isAndroid = /Android/i.test(navigator.userAgent);
  const isInstalled = window.matchMedia?.('(display-mode: standalone)')?.matches ||
    navigator.standalone === true;
  if (!isAndroid || !isInstalled || window.Capacitor?.isNativePlatform?.()) return;
  const button = document.getElementById('lnPwaPushButton699DCP');
  const row = document.getElementById('lnPwaPushRow699DCP');
  const hint = document.getElementById('lnPwaPushHint699DCP');
  if (!button || !row || !hint) return;
  row.hidden = false;
  const supported = window.isSecureContext && 'serviceWorker' in navigator &&
    'PushManager' in window && 'Notification' in window && !!window.crypto?.subtle;
  let registration = null;
  let publicKey = null;
  let enabled = false;
  let busy = false;
  let accountId = '';
  // May load after initial startup sync; unknown is allowed once authPending ends.
  let lastSyncState = 'unknown';
  let timer = null;
  let revisionBusy = false;
  // 699D-CQ: The server and push payload contain only hashes and times.
  // Keep the same anonymous pairs locally so a tap can find the decrypted
  // reminder after a cold PWA launch, including AFTER the scheduled time.
  const TAP_PARAM = 'lnPwaReminder';
  const TAP_MESSAGE = 'LUBANOTE_PWA_REMINDER_TAP';
  const TAP_POLL = 'LUBANOTE_PWA_REMINDER_POLL';
  const TAP_ACK = 'LUBANOTE_PWA_REMINDER_ACK';
  const TAP_STATUS = 'LUBANOTE_PWA_REMINDER_STATUS_699DCS';
  const TAP_MAP_PREFIX = 'lnPwaPushTapMap699DCQ:';
  const TAP_MAX_AGE = 7 * 86400000;
  const TAP_DIAG_KEY = 'lnPwaPushTapDiag699DCS';
  const TAP_DIAG_LIMIT = 70;
  const TAP_DIAG_STAGES = new Set([
    'CLIENT_READY','WORKER_REGISTERED','WORKER_REGISTER_FAILED',
    'POLL_SENT','POLL_NO_WORKER','POLL_FAILED','POLL_NO_REPLY',
    'WORKER_CS_EMPTY','WORKER_CS_PENDING','TAP_FROM_MESSAGE',
    'TAP_FROM_URL','TAP_INVALID','TAP_RECEIVED','TAP_ALREADY_OPENED',
    'WAIT_SESSION','WAIT_AUTH','WAIT_REMINDER_API','WAIT_ENTRIES',
    'LOCAL_MAP_FOUND','LOCAL_MAP_MISSING','REMINDERS_EMPTY',
    'REMINDER_MATCHED','REMINDER_NOT_MATCHED','REMINDER_NOT_ACTIVE',
    'MODAL_OPENED','MODAL_NOT_OPENED','OPEN_EXCEPTION','TAP_TIMEOUT',
    'TAP_ACK_SENT'
  ]);
  let pendingTap = null;
  let tapTimer = null;
  let openingTap = false;
  let pollSequence = 0;
  const openedTaps = new Set();
  const setHint = value => {hint.textContent = value;};
  function safeTapDiagRows() {
    try {
      const data = JSON.parse(localStorage.getItem(TAP_DIAG_KEY) || '[]');
      return Array.isArray(data) ? data.filter(row => row &&
        Number.isSafeInteger(row.at) && row.at > Date.now()-7*86400000 &&
        row.at < Date.now()+60000 && TAP_DIAG_STAGES.has(row.stage)
      ).slice(-TAP_DIAG_LIMIT) : [];
    } catch (_) {return [];}
  }
  const traceTap = stage => {
    if (!TAP_DIAG_STAGES.has(stage)) return;
    try {
      const rows = safeTapDiagRows();
      rows.push({at:Date.now(),stage});
      localStorage.setItem(TAP_DIAG_KEY,JSON.stringify(rows.slice(-TAP_DIAG_LIMIT)));
    } catch (_) {}
    try {window.LubaNoteStartupDiag?.zapis?.('PWA-TAP','699D-CS '+stage);} catch (_) {}
  };
  // Only fixed event codes and timestamps. No account/note IDs, title, body,
  // opaque notification hash, token, URL, or reminder date in the report.
  window.LubaNotePwaTapDiagnostics699DCS = Object.freeze({
    report() {
      const rows = safeTapDiagRows();
      return ['--- PWA KLEPNUTI NA OZNAMENI 699D-CS ---',
        'Rezim: samostatna Android PWA; pouze stavy predani, bez soukromych dat.',
        ...rows.map(row=>`${new Date(row.at).toISOString()} | ${row.stage}`),
        '--- KONEC PWA KLEPNUTI ---'].join('\n');
    }
  });
  function sendToTapWorker(type,key = undefined) {
    try {
      const worker = registration?.active || navigator.serviceWorker?.controller;
      if (!worker) return false;
      worker.postMessage(key ? {type,key} : {type});
      return true;
    } catch (_) {return false;}
  }
  function pollTapWorker() {
    const sequence = ++pollSequence;
    if (!sendToTapWorker(TAP_POLL)) {
      traceTap('POLL_NO_WORKER');
      return;
    }
    traceTap('POLL_SENT');
    setTimeout(()=>{if (pollSequence === sequence) traceTap('POLL_NO_REPLY');},6000);
  }
  traceTap('CLIENT_READY');
  const client = () => typeof supabaseClient !== 'undefined' ? supabaseClient : window.supabaseClient;
  const hex = bytes => Array.from(new Uint8Array(bytes), x=>x.toString(16).padStart(2,'0')).join('');
  function bytesOf(base64url) {
    const value = base64url.replace(/-/g,'+').replace(/_/g,'/');
    const binary = atob(value + '='.repeat((4 - value.length % 4) % 4));
    return Uint8Array.from(binary, char=>char.charCodeAt(0));
  }
  function localDeviceId() {
    try {
      const key = 'lnPwaPushDevice699DCP';
      let id = localStorage.getItem(key);
      if (!/^[a-zA-Z0-9:_-]{8,128}$/.test(String(id || ''))) {
        id = `pwa-${crypto.randomUUID()}`;
        localStorage.setItem(key,id);
      }
      return id;
    } catch {return null;}
  }
  async function session() {
    try {
      const response = await client()?.auth?.getSession?.();
      return response?.data?.session?.access_token ? response.data.session : null;
    } catch {return null;}
  }
  async function invoke(body) {
    if (!navigator.onLine) throw new Error('OFFLINE');
    const result = await client()?.functions?.invoke?.('lubanote-pwa-push',{body});
    if (!result || result.error || result.data?.ok !== true)
      throw new Error(result?.data?.error || 'PWA_SERVER_UNAVAILABLE');
    return result.data;
  }
  function render() {
    button.disabled = busy || !supported || (!enabled && !publicKey);
    button.textContent = busy ? 'Pracuji…' : enabled ? 'Vypnout oznámení PWA' : 'Zapnout oznámení PWA';
    if (!supported) setHint('Tento prohlížeč nepodporuje Web Push.');
  }
  async function config() {
    try {
      const response = await invoke({action:'config'});
      publicKey = response.publicKey;
      return !!publicKey;
    } catch {setHint('Web Push na serveru zatím není připravený.'); return false;}
    finally {render();}
  }
  function serialize(subscription) {
    const raw = subscription?.toJSON?.() || {};
    return {endpoint:raw.endpoint,keys:raw.keys};
  }
  async function registerOnServer(subscription) {
    const sess = await session();
    const deviceId = localDeviceId();
    if (!sess || !deviceId) throw new Error('AUTH_REQUIRED');
    accountId = sess.user.id;
    await invoke({action:'subscribe',deviceId,subscription:serialize(subscription)});
  }
  async function hashKey(input) {
    return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input))).slice(0,40);
  }
  function storedTapRows(userId) {
    try {
      const raw = JSON.parse(localStorage.getItem(TAP_MAP_PREFIX+userId) || '[]');
      return Array.isArray(raw) ? raw.filter(row =>
        row && /^[a-f0-9]{40}$/.test(row.k) && Number.isSafeInteger(row.t) &&
        row.t > Date.now()-TAP_MAX_AGE && row.t < Date.now()+366*86400000
      ) : [];
    } catch (_) {return [];}
  }
  function rememberTapRows(userId, jobs) {
    try {
      const rows = new Map();
      for (const row of [...storedTapRows(userId),...jobs]) {
        rows.set(row.k,{k:row.k,t:row.t});
      }
      // Keep recent fired reminders too: a freshly synchronized future-only
      // schedule must not erase a notification the user has yet to tap.
      const kept = [...rows.values()].sort((a,b)=>a.t-b.t).slice(-1000);
      localStorage.setItem(TAP_MAP_PREFIX+userId,JSON.stringify(kept));
    } catch (_) {/* Registration and delivery must not depend on storage quota. */}
  }
  function queueTap(delay = 400) {
    clearTimeout(tapTimer);
    tapTimer = setTimeout(()=>{void openPendingTap();},delay);
  }
  function receiveTap(key) {
    if (!/^[a-f0-9]{40}$/.test(String(key || ''))) {
      traceTap('TAP_INVALID');return;
    }
    if (openedTaps.has(key)) {
      traceTap('TAP_ALREADY_OPENED');
      sendToTapWorker(TAP_ACK,key);return;
    }
    traceTap('TAP_RECEIVED');
    if (pendingTap?.key !== key) pendingTap = {key,started:Date.now(),seen:new Set()};
    queueTap(100);
  }
  function tracePending(pending, stage) {
    if (!pending.seen.has(stage)) {
      pending.seen.add(stage);
      traceTap(stage);
    }
  }
  async function openPendingTap() {
    const pending = pendingTap;
    if (!pending || openingTap) return;
    if (Date.now()-pending.started > 60000) {
      pendingTap = null;
      tracePending(pending,'TAP_TIMEOUT');
      setHint('Klepnutí na PWA oznámení: nepodařilo se dohledat termín.');
      return;
    }
    openingTap = true;
    let opened = false;
    try {
      const sess = await session();
      if (!sess?.user?.id) {tracePending(pending,'WAIT_SESSION');return;}
      if (document.body.classList.contains('authPending')) {
        tracePending(pending,'WAIT_AUTH');return;
      }
      if (typeof getReminderEntries !== 'function' ||
          typeof getReminderEntry !== 'function' ||
          typeof openReminderCenterEntry !== 'function') {
        tracePending(pending,'WAIT_REMINDER_API');return;
      }
      const match = storedTapRows(sess.user.id).find(row=>row.k===pending.key);
      tracePending(pending,match?'LOCAL_MAP_FOUND':'LOCAL_MAP_MISSING');
      const entries = getReminderEntries('all');
      if (!Array.isArray(entries)) {tracePending(pending,'WAIT_ENTRIES');return;}
      if (!entries.length) tracePending(pending,'REMINDERS_EMPTY');
      let found = false;
      for (const entry of entries) {
        if (pendingTap !== pending || !entry?.reminder || !entry?.id ||
            !['note','planned'].includes(entry.kind)) break;
        const recurring = entry.sourceType === 'recurring-note';
        const currentTime = new Date(entry.date).getTime();
        // Existing scheduled notifications may predate the local tap map.
        // A non-recurring reminder can still be matched by its own date.
        const timestamp = match?.t ?? (!recurring ? currentTime : NaN);
        if (!Number.isSafeInteger(timestamp)) continue;
        if (!recurring && (!Number.isFinite(currentTime) ||
            Math.abs(currentTime-timestamp) > 60000)) continue;
        // Recompute the anonymous key in the user's LOCAL decrypted data.
        // Neither the SW nor the server receives a note or Planner ID.
        const computed = await hashKey(`${entry.kind}:${String(entry.id)}:${timestamp}`);
        if (computed !== pending.key) continue;
        found = true;
        tracePending(pending,'REMINDER_MATCHED');
        const current = getReminderEntry(entry.kind,entry.id);
        if (!current?.reminder || current.completed) {
          tracePending(pending,'REMINDER_NOT_ACTIVE');break;
        }
        const options = recurring && typeof formatReminderLocalDateTime === 'function'
          ? {dateOverride:formatReminderLocalDateTime(new Date(timestamp))} : undefined;
        opened = openReminderCenterEntry(current,options) === true;
        tracePending(pending,opened?'MODAL_OPENED':'MODAL_NOT_OPENED');
        break;
      }
      if (!found && entries.length) tracePending(pending,'REMINDER_NOT_MATCHED');
    } catch (_) {tracePending(pending,'OPEN_EXCEPTION');}
    finally {
      openingTap = false;
      if (opened && pendingTap === pending) {
        openedTaps.add(pending.key);
        sendToTapWorker(TAP_ACK,pending.key);
        traceTap('TAP_ACK_SENT');
        pendingTap = null;
      } else if (pendingTap === pending) queueTap(500);
    }
  }
  navigator.serviceWorker?.addEventListener?.('message',event => {
    if (event?.data?.type === TAP_STATUS && event.data.revision === '699D-CS') {
      ++pollSequence;
      traceTap(event.data.pending?'WORKER_CS_PENDING':'WORKER_CS_EMPTY');
    }
    if (event?.data?.type === TAP_MESSAGE) {
      traceTap('TAP_FROM_MESSAGE');
      receiveTap(event.data.key);
    }
  });
  navigator.serviceWorker?.addEventListener?.('controllerchange',() => {
    setTimeout(pollTapWorker,150);
  });
  // For a closed PWA, notificationclick opens this URL. Clear only our own
  // parameter; preserve history.state used by the Android PWA Back handler.
  try {
    const url = new URL(location.href);
    const key = url.searchParams.get(TAP_PARAM);
    if (key) {
      traceTap('TAP_FROM_URL');
      url.searchParams.delete(TAP_PARAM);
      history.replaceState(history.state,'',url.href);
      receiveTap(key);
    }
  } catch (_) {}
  function reminderDates() {
    if (typeof getReminderEntries !== 'function' || typeof loadTask !== 'function') return null;
    const notes = loadTask() || [];
    if (!Array.isArray(notes)) return null;
    const byId = new Map(notes.filter(n=>n?.id).map(n=>[String(n.id),n]));
    const entries = getReminderEntries('all') || [];
    if (!Array.isArray(entries)) return null;
    const now = Date.now();
    const out = [];
    for (const entry of entries) {
      const note = byId.get(String(entry?.sourceNoteId || ''));
      if (!note || note.isSecret === true || note.completed === true) continue;
      const identity = `${entry.kind}:${String(entry.id || '')}`;
      if (entry.kind === 'note' && note.repeat?.enabled === true) {
        if (!window.LubaNoteRecurring?.vypocitejBudouciTerminy) continue;
        try {
          for (const date of window.LubaNoteRecurring.vypocitejBudouciTerminy(note.date,note.repeat,40,new Date()) || []) {
            const timestamp = new Date(date).getTime();
            if (timestamp > now + 3000 && timestamp < now + 366 * 86400000)
              out.push({identity,timestamp});
          }
        } catch (_) {/* Fail closed on invalid recurrence. */}
      } else {
        const timestamp = new Date(entry.date).getTime();
        if (Number.isSafeInteger(timestamp) && timestamp > now + 3000 &&
            timestamp < now + 366 * 86400000) out.push({identity,timestamp});
      }
    }
    // Explicit bounded projection, no note titles, text, users or plain note IDs.
    return out.sort((a,b)=>a.timestamp-b.timestamp).slice(0,350);
  }
  function revision() {
    const key = `lnPwaPushRev699DCP:${accountId}`;
    const previous = Number(localStorage.getItem(key) || '0');
    const next = Math.max(Date.now(),Number.isSafeInteger(previous) ? previous+1 : 0);
    localStorage.setItem(key,String(next));
    return next;
  }
  async function syncSchedule() {
    if (revisionBusy || !enabled || !navigator.onLine ||
        !['synced','unknown'].includes(lastSyncState)) return;
    const sess = await session();
    if (!sess?.user?.id || sess.user.id !== accountId || document.body.classList.contains('authPending')) return;
    const entries = reminderDates();
    if (!entries) return;
    revisionBusy = true;
    try {
      const jobs = [];
      for (const entry of entries) {
        jobs.push({k:await hashKey(`${entry.identity}:${entry.timestamp}`),t:entry.timestamp});
      }
      const deviceId = localDeviceId();
      if (!deviceId) return;
      const value = await invoke({action:'sync',deviceId,revision:revision(),jobs});
      rememberTapRows(sess.user.id,jobs);
      setHint(`Aktivní: ${value.scheduled} naplánovaných připomínek v PWA.`);
    } catch (_) {setHint('Plán připomínek se neodeslal. Zkus obnovení synchronizace.');}
    finally {revisionBusy = false;}
  }
  function queueSync(delay = 1200) {
    clearTimeout(timer);
    timer = setTimeout(()=>{void syncSchedule();},delay);
  }
  async function start() {
    render();
    if (!supported) return;
    try {
      registration = await navigator.serviceWorker.register('./luba-webpush-sw.js?v=699D-CT-offline-shell',{
        scope:'./',updateViaCache:'none'
      });
      traceTap('WORKER_REGISTERED');
      await navigator.serviceWorker.ready;
      pollTapWorker();
      const current = await registration.pushManager.getSubscription();
      const sess = await session();
      if (!sess) {setHint('Přihlas se pro nastavení PWA oznámení.');return;}
      accountId = sess.user.id;
      if (current && Notification.permission === 'granted') {
        try {
          await registerOnServer(current);
          enabled = true;
          setHint('Oznámení PWA jsou aktivní.');
          queueSync(3000);
        } catch {setHint('Registrace PWA na serveru není dostupná.');}
      } else if (Notification.permission === 'denied') {
        setHint('Oznámení jsou v Androidu zakázaná. Povol je v nastavení aplikace.');
      } else {
        setHint('Zapnutím dostaneš připomínky i při zavřené PWA.');
      }
      await config();
    } catch (_) {
      traceTap('WORKER_REGISTER_FAILED');
      setHint('Nepodařilo se připravit službu oznámení PWA.');
    }
    finally {render();}
  }
  button.addEventListener('click',async () => {
    if (busy || !supported) return;
    busy = true;
    render();
    try {
      if (enabled) {
        const deviceId = localDeviceId();
        if (deviceId) await invoke({action:'unsubscribe',deviceId});
        await (await registration.pushManager.getSubscription())?.unsubscribe();
        enabled = false;
        setHint('Oznámení PWA jsou vypnutá.');
        return;
      }
      // Ask inside the actual user gesture, before any network awaits.
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setHint('Android nepovolil oznámení.');return;
      }
      if (!registration || !publicKey) throw new Error('NOT_READY');
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly:true,applicationServerKey:bytesOf(publicKey)
      });
      await registerOnServer(subscription);
      enabled = true;
      setHint('Oznámení PWA zapnutá. Synchronizuji termíny…');
      queueSync(50);
    } catch (error) {setHint('Chyba PWA: ' + String(error?.message || error));}
    finally {busy = false;render();}
  });
  window.addEventListener('lubanote:sync-state',event => {
    lastSyncState = String(event?.detail?.stav || 'pending');
    if (lastSyncState === 'synced') queueSync(1800);
  });
  window.addEventListener('lubanote:cloud-write-confirmed',()=>queueSync(1500));
  window.addEventListener('online',()=>queueSync(3000));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden) {queueSync(3000);pollTapWorker();if(pendingTap) queueTap(100);}});
  window.addEventListener('pageshow',()=>{queueSync(3500);pollTapWorker();if(pendingTap) queueTap(100);});
  setTimeout(()=>{void start();},700);
})();


