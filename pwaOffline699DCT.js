/* 699D-CU: Offline app shell and safe reconnect for Android/iOS PWA only.
   Data/E2E storage and synchronization remain owned by the existing modules.
   Never stores user data, tokens, API responses, or decrypted notes. */
(() => {
  'use strict';

  const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches ||
    navigator.standalone === true;
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!standalone || !mobile || window.Capacitor?.isNativePlatform?.() ||
      !window.isSecureContext || !('serviceWorker' in navigator)) return;

  const WORKER_URL = './luba-webpush-sw.js?v=699D-CU-pwa-reconnect';
  const WARM = 'LUBANOTE_PWA_SHELL_WARM_699DCT';
  const STATUS = 'LUBANOTE_PWA_SHELL_STATUS_699DCT';
  const DIAG_KEY = 'lnPwaOfflineDiag699DCT';
  const DIAG_STATES = new Set([
    'START','SW_READY','SW_REGISTER_ERROR','WARM_SENT','WARM_NO_WORKER',
    'CACHE_READY','CACHE_INCOMPLETE','CACHE_ERROR','ONLINE','OFFLINE',
    'RECOVER_START','RECOVER_OK','RECOVER_DEFER','RECOVER_PAUSE'
  ]);
  let registration = null;
  let timer = null;
  let lastWarm = 0;
  let ready = false;
  let assetCount = 0;
  let missingCount = 0;
  let fallbackCount = 0;
  let recoveryWanted = navigator.onLine === false;
  let recoveryTimer = null;
  let recoveryRunning = false;
  let recoveryAttempt = 0;
  const RECOVERY_DELAYS = [2200,5000,10000,20000,40000,60000];

  function trace(stage) {
    if (!DIAG_STATES.has(stage)) return;
    try {
      const raw = JSON.parse(localStorage.getItem(DIAG_KEY) || '[]');
      const rows = Array.isArray(raw) ? raw.filter(row => row &&
        Number.isSafeInteger(row.at) && DIAG_STATES.has(row.stage)
      ).slice(-29) : [];
      rows.push({at:Date.now(),stage});
      localStorage.setItem(DIAG_KEY,JSON.stringify(rows));
    } catch (_) {}
    try {window.LubaNoteStartupDiag?.zapis?.('PWA-OFFLINE','699D-CU '+stage);} catch (_) {}
  }

  function assets() {
    const root = new URL('./',document.baseURI);
    const urls = new Set([
      new URL('index.html',root).href,
      new URL('build-version.js',root).href,
      new URL('manifest.webmanifest',root).href,
      new URL('icons/lubanote-192.png',root).href,
      new URL('icons/lubanote-512.png',root).href
    ]);
    const elements = document.querySelectorAll(
      'script[src],link[rel="stylesheet"][href],link[rel="manifest"][href],link[rel="icon"][href]'
    );
    for (const element of elements) {
      const value = element.getAttribute('src') || element.getAttribute('href');
      if (!value) continue;
      try {
        const url = new URL(value,document.baseURI);
        // The SW performs an independent, stricter validation of every URL.
        if (url.origin === location.origin && url.pathname.startsWith(root.pathname))
          urls.add(url.href);
      } catch (_) {}
    }
    return [...urls];
  }

  function warm(force = false) {
    if (!navigator.onLine) return;
    const now = Date.now();
    if (!force && now-lastWarm < 60000) return;
    const worker = registration?.active || navigator.serviceWorker.controller;
    if (!worker) {trace('WARM_NO_WORKER');return;}
    lastWarm = now;
    try {
      worker.postMessage({type:WARM,urls:assets()});
      trace('WARM_SENT');
    } catch (_) {trace('CACHE_ERROR');}
  }

  function queueWarm(delay = 1800, force = false) {
    clearTimeout(timer);
    timer = setTimeout(()=>warm(force),delay);
  }

  function stavSync() {
    try {return window.LubaNoteSyncStatus?.ziskejStav?.() || 'unknown';}
    catch (_) {return 'unknown';}
  }

  function dokoncitObnovu() {
    clearTimeout(recoveryTimer);
    recoveryTimer = null;
    recoveryWanted = false;
    recoveryAttempt = 0;
    trace('RECOVER_OK');
  }

  function naplanujObnovu(delay = null, force = false) {
    if (!recoveryWanted || document.hidden || recoveryRunning) return;
    if (recoveryTimer != null && !force) return;
    clearTimeout(recoveryTimer);
    const ms = delay ?? RECOVERY_DELAYS[
      Math.min(recoveryAttempt,RECOVERY_DELAYS.length-1)];
    recoveryTimer = setTimeout(()=>{
      recoveryTimer = null;
      void provedObnovu();
    },ms);
  }

  async function provedObnovu() {
    if (!recoveryWanted || recoveryRunning || document.hidden) return;
    const stav = stavSync();
    if (stav === 'synced' || stav === 'local') {
      dokoncitObnovu();
      return;
    }
    // A conflict, foreign-editor lease or a changed E2E password needs the
    // existing human confirmation. Retry must never bypass those guards.
    if (stav === 'conflict' || stav === 'editor-wait' ||
        window.LubaNoteE2EDeviceGuard688T?.jeBlokovano?.()) {
      trace('RECOVER_PAUSE');
      return;
    }
    if (!navigator.onLine) {
      naplanujObnovu(10000);
      return;
    }
    const obnovAuth = window.LubaNoteSupabase?.obnovPrihlaseniPoNavratuPwa;
    const spustSync = window.LubaNoteSync?.spustBezpecne;
    if (typeof obnovAuth !== 'function' || typeof spustSync !== 'function') {
      naplanujObnovu(3000);
      return;
    }
    recoveryRunning = true;
    trace('RECOVER_START');
    let hotovo = false;
    try {
      // The existing auth/owner/E2E checks must succeed BEFORE safe sync.
      // Both functions keep their own single-flight protection and local queue.
      if (await obnovAuth() === true) {
        hotovo = await spustSync() === true;
      }
    } catch (_) {/* Network/auth errors leave saved edits pending. */}
    finally {recoveryRunning = false;}
    if (!recoveryWanted) return; // A successful sync event already finished it.
    if (hotovo || stavSync() === 'synced') {
      dokoncitObnovu();
    } else if (window.LubaNoteE2EDeviceGuard688T?.jeBlokovano?.()) {
      trace('RECOVER_PAUSE');
    } else {
      trace('RECOVER_DEFER');
      recoveryAttempt++;
      naplanujObnovu();
    }
  }

  navigator.serviceWorker.addEventListener('message',event => {
    if (event?.data?.type !== STATUS) return;
    const info = event.data;
    ready = info.ready === true;
    assetCount = Number.isSafeInteger(info.cached) ? Math.min(999,info.cached) : 0;
    missingCount = Number.isSafeInteger(info.missing) ? Math.min(999,info.missing) : 0;
    fallbackCount = Number.isSafeInteger(info.fallback) ? Math.min(999,info.fallback) : 0;
    trace(ready ? 'CACHE_READY' : 'CACHE_INCOMPLETE');
    if (!ready && missingCount > 0) {
      // navigator.onLine may remain true after an Android offline launch.
      recoveryWanted = true;
      naplanujObnovu(3500);
    }
  });
  navigator.serviceWorker.addEventListener('controllerchange',()=>queueWarm(250,true));

  // Safe report for the existing 'Zkopirovat diagnostiku' action.
  window.LubaNotePwaOffline699DCT = Object.freeze({
    report() {
      let rows = [];
      try {
        const raw = JSON.parse(localStorage.getItem(DIAG_KEY) || '[]');
        if (Array.isArray(raw)) rows = raw.filter(row => row &&
          Number.isSafeInteger(row.at) && row.at > Date.now()-7*86400000 &&
          DIAG_STATES.has(row.stage)).slice(-30);
      } catch (_) {}
      return ['--- PWA OFFLINE 699D-CU ---',
        `SW: ${registration?.active ? 'aktivni' : 'ceka'} | offline soubory: ${ready ? 'pripraveny' : 'cekaji'}`,
        `Soubory v posledni kontrole: ${assetCount} | chybi: ${missingCount} | verzovane varianty: ${fallbackCount}`,
        `Obnova site: ${recoveryWanted ? `ceka (pokus ${recoveryAttempt + 1})` : 'klid'}`,
        ...rows.map(row=>`${new Date(row.at).toISOString()} | ${row.stage}`),
        '--- KONEC PWA OFFLINE ---'].join('\n');
    }
  });

  async function start() {
    trace('START');
    try {
      registration = await navigator.serviceWorker.register(WORKER_URL,{
        scope:'./',updateViaCache:'none'
      });
      await navigator.serviceWorker.ready;
      trace('SW_READY');
      queueWarm(250,true);
    } catch (_) {trace('SW_REGISTER_ERROR');}
  }

  window.addEventListener('online',()=>{
    trace('ONLINE');queueWarm(2000,true);
    recoveryWanted = true;
    recoveryAttempt = 0;
    naplanujObnovu(1700,true);
  });
  window.addEventListener('offline',()=>{
    trace('OFFLINE');
    recoveryWanted = true;
    clearTimeout(recoveryTimer);
    recoveryTimer = null;
  });
  window.addEventListener('pageshow',()=>{
    queueWarm(1500);
    if (recoveryWanted) naplanujObnovu(2000);
  });
  window.addEventListener('lubanote:sync-state',event=>{
    if (event?.detail?.stav === 'synced' && recoveryWanted) dokoncitObnovu();
  });
  document.addEventListener('visibilitychange',()=>{
    if (!document.hidden) {
      queueWarm(1500);
      if (recoveryWanted) naplanujObnovu(1500);
    }
  });
  // A PWA can have stale navigator.onLine=true without a browser "online"
  // event. Only a persistent pending state after bootstrap enables fallback
  // retries; an ordinary clean online start produces no additional requests.
  setTimeout(()=>{
    if (stavSync() === 'pending') {
      recoveryWanted = true;
      naplanujObnovu(1200);
    }
  },12000);
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded',()=>{void start();},{once:true});
  else void start();
})();
