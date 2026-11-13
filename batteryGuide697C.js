/* 699D-K – kontrola spolehlivosti Android připomínek.
 * Pouze čtení oprávnění a navigace do nastavení po kliknutí uživatele.
 * Žádná změna alarmů, synchronizace, E2E, úložiště ani plánovače.
 * HyperOS/OEM profil nelze spolehlivě číst přes veřejné Android API;
 * proto nikdy nezaměňujeme systémové oprávnění za potvrzené OEM nastavení.
 */
(() => {
  'use strict';
  const plugin = window.Capacitor?.Plugins?.LubaNoteFcmToken;
  if (!window.Capacitor?.isNativePlatform?.() || !plugin) return;

  const KONTROLA_KEY = 'lubanoteBattery699DKVerifiedAt';
  const ODLOZENI_KEY = 'lubanoteBattery699DKLaterAt';
  const DEN = 24 * 60 * 60 * 1000;
  const sedmDni = 7 * DEN;
  let kontrolaBezi = false;
  let posledniKontrola = 0;
  let posledniStav = null;
  let otevrenModal = false;
  let uvodniModal = false;
  let uiPripraveno = false;

  const casZPameti = key => {
    try { return Number(localStorage.getItem(key)) || 0; }
    catch (_) { return 0; }
  };
  const zapisCas = key => {
    try { localStorage.setItem(key, String(Date.now())); } catch (_) {}
  };
  const datum = ms => new Date(ms).toLocaleDateString('cs-CZ');

  async function prectiStav() {
    const [alarm, info, nativniReport] = await Promise.all([
      plugin.getExactAlarmStatus ? plugin.getExactAlarmStatus().catch(() => null) : Promise.resolve(null),
      plugin.getBatterySettingsInfo697A ? plugin.getBatterySettingsInfo697A().catch(() => null) : Promise.resolve(null),
      plugin.getAlarmDiagnostics692X ? plugin.getAlarmDiagnostics692X().catch(() => null) : Promise.resolve(null)
    ]);
    // 692X: z pevné stavové hlavičky čteme jen dvě povolené boolean hodnoty.
    // Vlastní texty diagnostiky ani ID alarmů nikam neposíláme/neudržujeme.
    const hlavicka = String(nativniReport?.report || '').slice(0, 550);
    const baterie = /\bbatteryExempt=(true|false)\b/.exec(hlavicka);
    const presneVReportu = /\bexactAllowed=(true|false)\b/.exec(hlavicka);
    const maker = `${info?.manufacturer || ''} ${info?.brand || ''}`.toLowerCase();
    const xiaomi = /xiaomi|redmi|poco|blackshark/.test(maker);
    const exact = typeof alarm?.allowed === 'boolean' ? alarm.allowed :
      presneVReportu ? presneVReportu[1] === 'true' : null;
    const exempt = baterie ? baterie[1] === 'true' : null;
    const potvrzeno = casZPameti(KONTROLA_KEY);
    const cerstve = potvrzeno > 0 && Date.now() - potvrzeno < sedmDni;
    return { exact, exempt, xiaomi, potvrzeno, cerstve };
  }

  function popisStavu(s) {
    if (s.exact === false) return {
      zavaznost: 'kriticke',
      kratky: 'Přesné alarmy jsou zakázané',
      detail: 'Android aktuálně nepovoluje přesné alarmy. Připomínky mohou přijít pozdě nebo vůbec.'
    };
    if (s.exempt === false) return {
      zavaznost: 'kriticke',
      kratky: 'Pozor: omezení baterie',
      detail: 'Android nepotvrdil výjimku z optimalizace baterie. Připomínky se mohou zpozdit. Zkontroluj také vnitřní nastavení výrobce.'
    };
    if (s.xiaomi && !s.cerstve) return {
      zavaznost: 'overit',
      kratky: 'Neověřené nastavení HyperOS',
      detail: 'HyperOS může mít uvnitř zapnutého přepínače ještě volbu „Optimalizováno“. Aplikace tuto volbu nedokáže bezpečně přečíst.'
    };
    if (s.xiaomi) return {
      zavaznost: 'rucne',
      kratky: `HyperOS ověřeno uživatelem ${datum(s.potvrzeno)}`,
      detail: 'Poslední ruční kontrola platí pro daný okamžik. HyperOS může později nastavení změnit.'
    };
    if (s.exact === null || s.exempt === null) return {
      zavaznost: 'overit',
      kratky: 'Část oprávnění nelze ověřit',
      detail: 'Aplikace nemá potvrzený úplný stav nastavení baterie a přesných alarmů.'
    };
    return {
      zavaznost: 'rucne',
      kratky: 'Systémová oprávnění jsou dostupná',
      detail: 'Android potvrzuje přesné alarmy a výjimku z optimalizace. Další omezení výrobce nemusí být zjistitelná.'
    };
  }

  function napoveda(s) {
    return s.xiaomi
      ? 'Na otevřené systémové obrazovce klepni NA CELÝ ŘÁDEK „Povolit používání aplikace na pozadí“ (nejen na již zapnutý přepínač). V další obrazovce musí být zaškrtnuto „Neomezeno“, NE „Optimalizováno“. Další obrazovka může vyžadovat klepnutí na šipku >.'
      : 'V nastavení baterie pro LubaNote zvol neomezený běh na pozadí, pokud jej telefon umožňuje.';
  }

  async function otevriBaterii() {
    if (typeof plugin.openBatterySettings697A !== 'function') return;
    try {
      const vysledek = await plugin.openBatterySettings697A();
      // Intent nemusí otevřít přímo vnitřní volbu výrobce; trasa není důkaz oprávnění.
      window.LubaNoteStartupDiag?.zapis?.('REM-BATTERY',
        `699D-K SETTINGS OPEN | route=${String(vysledek?.route || 'unknown')}`);
    } catch (e) {
      window.otevriPotvrzovaciModalLubaNote?.({
        nadpis: 'Nastavení baterie',
        text: 'Nastavení se nepodařilo otevřít automaticky. Otevři Nastavení telefonu → Aplikace → LubaNote → Spotřeba baterie aplikací.',
        popisekPotvrdit: 'Rozumím'
      });
    }
  }

  function vykresliStav(s) {
    const puvodni = document.getElementById('openBatterySettings697D');
    if (!puvodni) return;
    let radek = document.getElementById('lnBatteryStatus699DK');
    if (!radek) {
      radek = document.createElement('div');
      radek.id = 'lnBatteryStatus699DK';
      radek.className = 'themeSetting';
      const nazev = document.createElement('span');
      nazev.textContent = 'Spolehlivost upozornění';
      const tlacitko = document.createElement('button');
      tlacitko.type = 'button';
      tlacitko.className = 'themeSelectButton';
      tlacitko.id = 'lnBatteryStatusButton699DK';
      tlacitko.addEventListener('click', () => { void zobrazStav(false); });
      radek.append(nazev, tlacitko);
      puvodni.closest('.themeSetting')?.insertAdjacentElement('afterend', radek);
    }
    const info = popisStavu(s);
    const tlacitko = document.getElementById('lnBatteryStatusButton699DK');
    if (!tlacitko) return;
    tlacitko.textContent = (info.zavaznost === 'kriticke' ? '⚠️ ' :
      info.zavaznost === 'overit' ? '❔ ' : '✓ ') + info.kratky;
    tlacitko.setAttribute('aria-label', `Spolehlivost upozornění: ${info.kratky}. Zobrazit postup opravy.`);
  }

  async function zobrazStav(automaticky = false) {
    if (otevrenModal || document.hidden ||
        document.querySelector?.('.choiceModal:not([hidden])') ||
        typeof window.otevriVyberovyModal !== 'function') return;
    let s = posledniStav;
    if (!s) {
      try { s = await prectiStav(); } catch (_) { return; }
      posledniStav = s;
    }
    if (document.hidden) return;
    const info = popisStavu(s);
    if (automaticky) {
      if (uvodniModal || info.zavaznost === 'rucne') return;
      // 695Q modal ma prednost, pokud je jiz otevren; jinak varujeme i
      // po jeho drivejsim odlozeni, aby 'Pozdeji' neskrylo kriticky stav.
      if (info.zavaznost === 'overit' && Date.now() - casZPameti(ODLOZENI_KEY) < DEN) return;
    }
    const moznosti = [];
    if (s.exact === false && typeof plugin.openExactAlarmSettings695Q === 'function') {
      moznosti.push({hodnota:'alarm',popisek:'Otevřít nastavení přesných alarmů'});
    }
    moznosti.push({hodnota:'baterie',popisek:'Otevřít nastavení baterie'});
    if (s.xiaomi && s.exact !== false && s.exempt !== false) {
      moznosti.push({hodnota:'potvrdit',popisek:'Zkontroloval jsem: Neomezeno'});
    }
    moznosti.push({hodnota:'pozdeji',popisek:'Později'});
    const otevreno = window.otevriVyberovyModal({
      nadpis: info.zavaznost === 'kriticke' ? '⚠️ Připomínky nejsou spolehlivě chráněné' : 'Kontrola připomínek',
      popis: info.detail + '\n\n' + napoveda(s) +
        '\n\nZapnutý přepínač sám o sobě nestačí. LubaNote nemůže změnit soukromé nastavení HyperOS automaticky.',
      moznosti,
      poVyberu: async (akce) => {
        if (akce === 'alarm') await plugin.openExactAlarmSettings695Q();
        if (akce === 'baterie') await otevriBaterii();
        if (akce === 'potvrdit') {
          zapisCas(KONTROLA_KEY);
          posledniStav = null;
          posledniKontrola = 0;
          setTimeout(() => { void prover(); }, 400);
        }
        if (akce === 'pozdeji') zapisCas(ODLOZENI_KEY);
      }
    });
    if (otevreno !== false) {
      // Choice modal vrací void; souběh omezíme aktuální relací a časem.
      otevrenModal = true;
      if (automaticky) uvodniModal = true;
      setTimeout(() => { otevrenModal = false; }, 1500);
    }
  }

  async function prover(zkusUpozornit = false) {
    if (kontrolaBezi || document.hidden || Date.now() - posledniKontrola < 6000) return;
    kontrolaBezi = true;
    posledniKontrola = Date.now();
    try {
      const s = await prectiStav();
      posledniStav = s;
      vykresliStav(s);
      if (zkusUpozornit) void zobrazStav(true);
    } catch (e) {
      console.warn('699D-K: stav baterie se nepodařilo načíst', e);
    } finally { kontrolaBezi = false; }
  }

  document.getElementById('openBatterySettings697D')?.addEventListener('click', () => {
    void zobrazStav(false);
  });
  window.addEventListener('lubanote:splash-ready', () => {
    uiPripraveno = true;
    setTimeout(() => { void prover(true); }, 3000);
  });
  window.addEventListener('focus', () => { if (uiPripraveno) void prover(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && uiPripraveno) void prover();
  });
})();
