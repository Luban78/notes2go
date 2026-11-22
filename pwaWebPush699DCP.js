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
  const setHint = value => {hint.textContent = value;};
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
      registration = await navigator.serviceWorker.register('./luba-webpush-sw.js',{
        scope:'./',updateViaCache:'none'
      });
      await navigator.serviceWorker.ready;
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
    } catch (_) {setHint('Nepodařilo se připravit službu oznámení PWA.');}
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
    } catch (_) {setHint('Povolení nebo registrace se nezdařila. Zkus to znovu.');}
    finally {busy = false;render();}
  });
  window.addEventListener('lubanote:sync-state',event => {
    lastSyncState = String(event?.detail?.stav || 'pending');
    if (lastSyncState === 'synced') queueSync(1800);
  });
  window.addEventListener('lubanote:cloud-write-confirmed',()=>queueSync(1500));
  window.addEventListener('online',()=>queueSync(3000));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden) queueSync(3000);});
  window.addEventListener('pageshow',()=>queueSync(3500));
  setTimeout(()=>{void start();},700);
})();
