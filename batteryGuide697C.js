/* 697C: One-time, opt-in battery setup guide for Android APK.
   Uses the verified 697A native route; never changes alarm scheduling. */
(() => {
  'use strict';
  const plugin = window.Capacitor?.Plugins?.LubaNoteFcmToken;
  if (!window.Capacitor?.isNativePlatform?.() ||
      typeof plugin?.openBatterySettings697A !== 'function') return;
  const key = 'lubanoteBatteryGuide697CShown';
  let busy = false;
  let shownThisLaunch = false;

  async function offer() {
    if (busy || shownThisLaunch || document.hidden ||
        typeof window.otevriPotvrzovaciModalLubaNote !== 'function') return;
    try { if (localStorage.getItem(key)) return; } catch (_) { return; }
    busy = true;
    try {
      // The existing exact-alarm permission guide has priority.
      if (typeof plugin.getExactAlarmStatus === 'function') {
        const status = await plugin.getExactAlarmStatus();
        if (status?.allowed === false) return;
      }
      const info = typeof plugin.getBatterySettingsInfo697A === 'function'
        ? await plugin.getBatterySettingsInfo697A() : {};
      const manufacturer = String(info?.manufacturer || '').toLowerCase();
      const brand = String(info?.brand || '').toLowerCase();
      const xiaomi = /xiaomi|redmi|poco/.test(manufacturer + ' ' + brand);
      const instructions = xiaomi
        ? 'V otevřeném nastavení LubaNote klepni na šipku u „Povolit používání aplikace na pozadí“ a zvol „Neomezeno“.'
        : 'V otevřeném systémovém nastavení LubaNote povol neomezený běh na pozadí, pokud tuto možnost telefon nabízí.';
      if (document.hidden) return;
      const opened = window.otevriPotvrzovaciModalLubaNote({
        nadpis: 'Spolehlivé připomínky',
        text: 'Aby připomínky chodily i při zamčeném telefonu, doporučujeme zkontrolovat omezení baterie.\n\n' +
          instructions + '\n\nNastavení změníš pouze ty v telefonu.',
        popisekZrusit: 'Později',
        popisekPotvrdit: 'Otevřít nastavení',
        poZruseni: () => {
          try { localStorage.setItem(key, 'later'); } catch (_) {}
        },
        poPotvrzeni: async () => {
          try {
            await plugin.openBatterySettings697A();
            try { localStorage.setItem(key, 'opened'); } catch (_) {}
          } catch (error) {
            console.warn('LubaNote 697C: nastavení baterie nelze otevřít', error);
          }
        }
      });
      if (opened) shownThisLaunch = true;
    } catch (error) {
      console.warn('LubaNote 697C: průvodce baterií', error);
    } finally { busy = false; }
  }
  window.addEventListener('lubanote:splash-ready', () => {
    setTimeout(() => { void offer(); }, 2800);
  });
})();
