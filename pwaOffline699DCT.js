/* 699D-CT: Offline app shell for installed Android/iOS PWA only.
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

  const WORKER_URL = './luba-webpush-sw.js?v=699D-CT-offline-shell';
  const WARM = 'LUBANOTE_PWA_SHELL_WARM_699DCT';
  const STATUS = 'LUBANOTE_PWA_SHELL_STATUS_699DCT';
  const DIAG_KEY = 'lnPwaOfflineDiag699DCT';
  const DIAG_STATES = new Set([
    'START','SW_READY','SW_REGISTER_ERROR','WARM_SENT','WARM_NO_WORKER',
    'CACHE_READY','CACHE_INCOMPLETE','CACHE_ERROR','ONLINE','OFFLINE'
  ]);
  let registration = null;
  let timer = null;
  let lastWarm = 0;
  let ready = false;
  let assetCount = 0;
  let missingCount = 0;

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
    try {window.LubaNoteStartupDiag?.zapis?.('PWA-OFFLINE','699D-CT '+stage);} catch (_) {}
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

  navigator.serviceWorker.addEventListener('message',event => {
    if (event?.data?.type !== STATUS) return;
    const info = event.data;
    ready = info.ready === true;
    assetCount = Number.isSafeInteger(info.cached) ? Math.min(999,info.cached) : 0;
    missingCount = Number.isSafeInteger(info.missing) ? Math.min(999,info.missing) : 0;
    trace(ready ? 'CACHE_READY' : 'CACHE_INCOMPLETE');
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
      return ['--- PWA OFFLINE 699D-CT ---',
        `SW: ${registration?.active ? 'aktivni' : 'ceka'} | offline soubory: ${ready ? 'pripraveny' : 'cekaji'}`,
        `Soubory v posledni kontrole: ${assetCount} | chybi: ${missingCount}`,
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

  window.addEventListener('online',()=>{trace('ONLINE');queueWarm(2000,true);});
  window.addEventListener('offline',()=>trace('OFFLINE'));
  window.addEventListener('pageshow',()=>queueWarm(1500));
  document.addEventListener('visibilitychange',()=>{
    if (!document.hidden) queueWarm(1500);
  });
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded',()=>{void start();},{once:true});
  else void start();
})();
