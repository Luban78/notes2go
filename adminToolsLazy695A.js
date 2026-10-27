/* 695A – lazy, server-admin-gated supplementary tools. No startup initialization.
 * StartupDiagnostics remains independent so timing survives until DH is opened.
 */
(() => {
  'use strict';
  if (window.LubaNoteAdminLazy695A) return;

  const assets = {
    svg: ['adminSvgStudio693R.css?v=696A-svg-cloud-drafts', 'adminSvgStudio693R.js?v=696A-svg-cloud-drafts'],
    visual: ['visualDebug.css?v=658be-global-rem-font-scale', 'visualDebug.js?v=690Q-dock-verification'],
    hub: ['debugHub.css?v=695C-compact', 'debugHub.js?v=695C-compact']
  };
  const jobs = new Map();

  function allowed() {
    try { return window.LubaNoteAdminTools?.isAllowed?.() === true; }
    catch (_) { return false; }
  }

  function inject(tag, attr, url) {
    return new Promise((resolve, reject) => {
      const el = document.createElement(tag);
      if (tag === 'link') el.rel = 'stylesheet';
      el.onload = () => resolve();
      el.onerror = () => { el.remove(); reject(new Error('Admin tool asset unavailable: ' + url.split('?')[0])); };
      el[attr] = url;
      document.head.appendChild(el);
    });
  }

  function ensure(key) {
    if (!allowed()) return Promise.reject(new Error('Admin access required'));
    if (!assets[key]) return Promise.reject(new Error('Unknown admin tool'));
    if (!jobs.has(key)) {
      const [css, js] = assets[key];
      const job = inject('link', 'href', css)
        .then(() => inject('script', 'src', js))
        // 695C: the concise SYNC/REM report is a DH-only helper, not a boot asset.
        .then(() => key === 'hub'
          ? inject('script', 'src', 'lubaDebugSyncBrief691BA.js?v=695C-hub-only')
          : undefined)
        .catch(error => { jobs.delete(key); throw error; });
      jobs.set(key, job);
    }
    return jobs.get(key);
  }

  async function ensureSvgStudio() {
    await ensure('svg');
    // 695D: remove historical pan diagnostic panel (not the Pan tool).
    document.getElementById('lnSvgDiag693Z')?.remove();
  }
  async function ensureVisualDebug() { await ensure('visual'); }
  async function showDock() {
    if (!allowed()) return false;
    try {
      await ensureVisualDebug();
      if (!allowed()) return false;
      return window.LubaNoteVisualDebug?.showDock?.() === true;
    } catch (error) { console.warn('Admin dock 695A:', error); return false; }
  }
  async function openVisualDebug() {
    if (!allowed()) return false;
    try {
      await ensureVisualDebug();
      if (!allowed()) return false;
      return window.LubaNoteVisualDebug?.open?.() === true;
    } catch (error) { console.warn('Visual Debug 695A:', error); return false; }
  }
  async function openDebugHub() {
    if (!allowed()) return false;
    try {
      // Dock is part of Visual Debug; load it before opening Debug Hub.
      await showDock();
      if (!allowed()) return false;
      await ensure('hub');
      if (!allowed()) return false;
      return window.LubaNoteDebugHub?.open?.() === true;
    } catch (error) { console.warn('Debug Hub 695A:', error); return false; }
  }
  window.LubaNoteAdminLazy695A = Object.freeze({
    ensureSvgStudio, ensureVisualDebug, showDock, openVisualDebug, openDebugHub
  });
})();
