/*
 * LubaNote – viditelný stav synchronizace
 *
 * Modul pouze zobrazuje stav. Neprovádí žádnou synchronizaci.
 * Stav dostává přes událost "lubanote:sync-state".
 */
(() => {
  const statusText =
    document.getElementById("syncStatusText");

  if (!statusText) {
    return;
  }

  const STAVY = {
    synced: {
      klic: "sync.synced",
      fallback: "✓ Synchronizováno"
    },
    syncing: {
      klic: "sync.syncing",
      fallback: "⟳ Synchronizuji…"
    },
    pending: {
      klic: "sync.pending",
      fallback: "⏳ Čeká na synchronizaci"
    },
    "editor-wait": {
      klic: "sync.editorWait692U",
      fallback: "⏳ Čeká na editor"
    },
    local: {
      klic: "sync.localOnly",
      fallback: "📱 Pouze v zařízení"
    },
    "auth-expired": {
      klic: "sync.authExpired",
      fallback: "⚠ Přihlášení vypršelo"
    },
    conflict: {
      klic: "sync.conflict",
      fallback: "⚠ Konflikt"
    }
  };

  /* PATCH 554 – od prvního vykreslení ukazujeme čekající stav.
     Dříve mohl PC řádek zůstat úplně prázdný, dokud sync neposlal
     první událost. */
  let aktualniStav = "pending";
  let posledniStabilniStav = "pending";
  let pocetCizichEditoru692U = 0;

  function preloz(klic, fallback) {
    return (
      window.LubaNoteI18n?.t?.(klic, fallback) ||
      fallback
    );
  }

  function vykresli() {
    const definice = STAVY[aktualniStav];

    if (!definice) {
      statusText.hidden = true;
      statusText.removeAttribute("data-state");
      statusText.textContent = "";
      statusText.removeAttribute("title");
      return;
    }

    const text = preloz(
      definice.klic,
      definice.fallback
    );

    statusText.hidden = false;
    statusText.dataset.state = aktualniStav;
    if (aktualniStav === "editor-wait") {
      statusText.textContent = `${text} (${pocetCizichEditoru692U})`;
      statusText.title =
        `Ostatní poznámky byly zpracovány. ${pocetCizichEditoru692U} ` +
        "poznámka/poznámky čekají na uzavření editoru na jiném zařízení.";
    } else {
      statusText.textContent = text;
      statusText.title = text;
    }
  }

  /* 683BX – běžný uživatel RX/TX panel nevidí. Závažnější čekání
     na síť proto ukážeme samostatně, bez modalu a bez zásahu do editoru. */
  const upozorneni = document.createElement("div");
  upozorneni.className = "lnSyncRecoveryNotice683BX";
  upozorneni.hidden = true;
  upozorneni.setAttribute("role", "status");
  document.body.appendChild(upozorneni);
  let casovacUpozorneni = null;
  let sitoveZotaveniCeka = false;

  function skryjUpozorneni() {
    clearTimeout(casovacUpozorneni);
    casovacUpozorneni = null;
    upozorneni.hidden = true;
  }

  function vykresliUpozorneni() {
    if (!upozorneni.hidden) {
      upozorneni.textContent = preloz(
        "sync.pending", "⏳ Čeká na synchronizaci"
      );
    }
  }

  function naplanujUpozorneni(rychle = false) {
    if (aktualniStav !== "pending" || casovacUpozorneni ||
        !upozorneni.hidden) return;
    casovacUpozorneni = setTimeout(() => {
      casovacUpozorneni = null;
      if (aktualniStav !== "pending" ||
          window.LubaNoteStorageScope?.ziskejAktivni?.() === "local") return;
      upozorneni.hidden = false;
      vykresliUpozorneni();
    }, rychle ? 7000 : 25000);
  }

  window.addEventListener("lubanote:network-recovery-state", (event) => {
    sitoveZotaveniCeka = event?.detail?.stav === "pending";
    if (sitoveZotaveniCeka) {
      clearTimeout(casovacUpozorneni);
      casovacUpozorneni = null;
      naplanujUpozorneni(true);
    } else {
      skryjUpozorneni();
    }
  });

  function nastavStav(stav, detail = null) {
    const localAktivni =
      window.LubaNoteStorageScope
        ?.ziskejAktivni?.() === "local";

    /* PATCH 586 – doběh staršího cloud requestu nesmí po přepnutí
       přepsat LOCAL stav na „Synchronizováno“. Auth-expired zůstává
       nadřazený, protože účet je povinný i v režimu pouze zařízení. */
    if (
      localAktivni &&
      stav !== "auth-expired" &&
      stav !== "local"
    ) {
      aktualniStav = "local";
      vykresli();
      return;
    }

    if (stav === "restore") {
      aktualniStav = posledniStabilniStav;
      vykresli();
      if (aktualniStav !== "pending") skryjUpozorneni();
      return;
    }

    if (!(stav in STAVY)) {
      return;
    }
    if (stav === "editor-wait") {
      const count = Number(detail?.count);
      pocetCizichEditoru692U = Number.isInteger(count) && count > 0
        ? count : Math.max(1, pocetCizichEditoru692U);
    }

    if (
      stav === "syncing" &&
      aktualniStav !== "syncing"
    ) {
      posledniStabilniStav = aktualniStav;
    }

    if (
      stav === "synced" ||
      stav === "editor-wait" ||
      stav === "auth-expired" ||
      stav === "conflict"
    ) {
      posledniStabilniStav = stav;
    }

    aktualniStav = stav;
    vykresli();
    if (stav === "pending") {
      naplanujUpozorneni(sitoveZotaveniCeka);
    } else {
      skryjUpozorneni();
    }
  }

  window.addEventListener(
    "lubanote:sync-state",
    (event) => {
      nastavStav(event.detail?.stav, event.detail);
    }
  );

  /*
   * Supabase tuto událost vyšle pouze tehdy, když online kontrola
   * skutečně potvrdila chybějící session.
   */
  window.addEventListener(
    "lubanote:auth-expired",
    () => {
      nastavStav("auth-expired");
    }
  );

  window.addEventListener(
    "lubanote:language-change",
    () => {
      vykresli();
      vykresliUpozorneni();
    }
  );

  window.addEventListener(
    "lubanote:storage-scope-change",
    (event) => {
      if (event.detail?.scope === "local") {
        nastavStav("local");
      } else {
        nastavStav("pending");
      }
    }
  );

  /* První stav musí odpovídat i uloženému LOCAL prostoru. */
  if (
    window.LubaNoteStorageScope
      ?.ziskejAktivni?.() === "local"
  ) {
    aktualniStav = "local";
    posledniStabilniStav = "local";
  }

  vykresli();

  window.LubaNoteSyncStatus = {
    nastav: nastavStav,
    ziskejStav: () => aktualniStav
  };
})();

/*
 * 699D-F – uživatelský report pro čisté PROD i DEV.
 * POUZE POZOROVÁNÍ: žádný fetch wrapper, žádné RPC, žádné čtení poznámek,
 * žádné ovlivnění auth/sync. Do reportu smí vstoupit jen předem určené
 * typy stavů a HTTP kódy; nikdy obsah chyb, URL, těla požadavků či ID.
 */
(() => {
  'use strict';
  if (window.LubaNoteSupportDiagnostics699DF) return;

  const LIMIT = 80;
  const ULOZISTE = 'lnSupportEvents699DF';
  const ROK = 24 * 60 * 60 * 1000;
  const platneStavy = new Set([
    'synced', 'syncing', 'pending', 'local', 'auth-expired',
    'conflict', 'editor-wait', 'restore'
  ]);
  const znamyBackend = Object.freeze({
    lubanoteProduction: 'LubaServer PROD',
    lubanoteServer: 'LubaServer TEST',
    supabaseCloud: 'Supabase Cloud',
    dynamicProduction: 'dynamický VPS'
  });
  const HTTP = Object.freeze({
    '/control/v1/status': 'CONTROL status',
    '/auth/v1/token': 'AUTH token',
    '/auth/v1/user': 'AUTH user',
    '/rest/v1/secret_settings': 'E2E nastavení',
    '/rest/v1/rpc/lubanote_get_note_change_head': 'SYNC změnová hlavička',
    '/rest/v1/rpc/lubanote_get_private_sync_fingerprint': 'SYNC fingerprint',
    '/rest/v1/rpc/lubanote_get_private_bootstrap_manifest': 'SYNC manifest',
    '/rest/v1/rpc/lubanote_get_notes_by_ids_safe': 'SYNC poznámky',
    '/rest/v1/rpc/save_note_safe': 'SYNC zápis',
    '/rest/v1/rpc/lubanote_get_my_access': 'AUTH přístup',
    '/rest/v1/rpc/lubanote_get_account_cloud_usage_v1': 'STATUS kvóta'
  });
  let zaznamy = [];
  let stavSync = 'pending';
  let stavE2E = 'nezjištěno';
  let stavAuth = 'neověřeno';

  function pripis(typ, popis) {
    const polozka = {
      at: Date.now(),
      typ,
      popis
    };
    zaznamy.push(polozka);
    if (zaznamy.length > LIMIT) zaznamy = zaznamy.slice(-LIMIT);
    try {
      localStorage.setItem(ULOZISTE, JSON.stringify(zaznamy));
    } catch (_) { /* Report funguje i bez storage. */ }
  }

  /* Historie z lokálního úložiště může být pozměněna. Povolujeme
     výhradně přesné hodnoty z našeho slovníku – nikdy cizí text. */
  function povolenaHistorie(x) {
    if (!x || !Number.isFinite(x.at) || x.at > Date.now() ||
        Date.now() - x.at >= ROK || typeof x.popis !== 'string') return false;
    const p = x.popis;
    switch (x.typ) {
      case 'APP': return ['diagnostika spuštěna','pozadí','popředí'].includes(p);
      case 'AUTH': return ['session vypršela','účet aktivní'].includes(p);
      case 'E2E': return ['hlavní heslo potvrzeno','ROOT READY','ROOT NOT READY',
        'ověření epochy selhalo'].includes(p);
      case 'SYNC': return platneStavy.has(p) ||
        /^(?:cílená fronta \d{1,4}|lokální konflikt \d{1,3}|(?:start|reconcile) (?:OK|FALSE|CHYBA))$/.test(p);
      case 'HTTP': return Object.values(HTTP).some(label =>
        p.startsWith(`${label} `) && /^(?:[1-5]\d\d|nezjištěn)$/.test(p.slice(label.length + 1)));
      case 'SÍŤ': return p === 'online' || p === 'offline';
      case 'CHYBA': return /^(?:nenačtený (?:SCRIPT|LINK)|JavaScript (?:TypeError|ReferenceError|SyntaxError|RangeError|SecurityError|chyba)|neobsloužená Promise)$/.test(p);
      default: return false;
    }
  }
  try {
    const ulozene = JSON.parse(localStorage.getItem(ULOZISTE) || '[]');
    if (Array.isArray(ulozene)) zaznamy = ulozene.filter(povolenaHistorie).slice(-LIMIT);
  } catch (_) { zaznamy = []; }

  const bezpecnaVerze = () => {
    const verze = String(window.LUBANOTE_VERSION || '');
    return /^\d{1,4}\.\d{1,4}\.\d{1,7}$/.test(verze) ? verze : 'nezjištěna';
  };
  const platforma = () => {
    const ua = navigator.userAgent || '';
    const android = /Android\s+(\d{1,2})/.exec(ua);
    const chrome = /(?:Chrome|CriOS)\/(\d{1,3})/.exec(ua);
    return `Android ${android ? android[1] : '—'} | WebView/Chrome ${chrome ? chrome[1] : '—'}`;
  };
  const backend = () => {
    try {
      const id = window.LubaNoteBackendConfig?.nactiAktivniProfil?.()?.id;
      return Object.prototype.hasOwnProperty.call(znamyBackend,id)
        ? znamyBackend[id] : 'nezjištěn';
    } catch (_) { return 'nezjištěn'; }
  };

  /* NIKDY nepřebíráme event.detail do výpisu – může obsahovat data. */
  window.addEventListener('lubanote:sync-state', e => {
    const s = e?.detail?.stav;
    if (!platneStavy.has(s)) return;
    stavSync = s;
    pripis('SYNC', s);
  });
  window.addEventListener('lubanote:auth-expired', () => {
    stavAuth = 'vypršelo';
    pripis('AUTH', 'session vypršela');
  });
  window.addEventListener('lubanote:account-active', () => {
    stavAuth = 'aktivní';
    pripis('AUTH', 'účet aktivní');
  });
  window.addEventListener('lubanote:master-password-ready', () => {
    stavE2E = 'hlavní heslo potvrzeno';
    pripis('E2E', 'hlavní heslo potvrzeno');
  });
  window.addEventListener('lubanote:e2e-core-state', e => {
    const ready = e?.detail?.ready;
    if (ready === true) {
      stavE2E = 'klíč připraven';
      pripis('E2E', 'ROOT READY');
    } else if (ready === false) {
      stavE2E = 'klíč nepřipraven';
      pripis('E2E', 'ROOT NOT READY');
    }
  });
  window.addEventListener('online', () => pripis('SÍŤ', 'online'));
  window.addEventListener('offline', () => pripis('SÍŤ', 'offline'));
  document.addEventListener('visibilitychange', () => {
    pripis('APP', document.visibilityState === 'hidden' ? 'pozadí' : 'popředí');
  });
  window.addEventListener('error', e => {
    if (e.target !== window) {
      const tag = e.target?.tagName;
      if (tag === 'SCRIPT' || tag === 'LINK') pripis('CHYBA', `nenačtený ${tag}`);
      return;
    }
    const name = e.error?.name;
    const allowed = new Set(['TypeError','ReferenceError','SyntaxError','RangeError','SecurityError']);
    pripis('CHYBA', allowed.has(name) ? `JavaScript ${name}` : 'JavaScript chyba');
  }, true);
  window.addEventListener('unhandledrejection', () => {
    pripis('CHYBA', 'neobsloužená Promise');
  });

  /* Read-only PerformanceResourceTiming: žádné obalování fetch(),
     žádné změny síťového provozu. responseStatus může být při CORS = 0;
     v takovém případě uvádíme pouze endpointovou kategorii. */
  try {
    if (typeof PerformanceObserver === 'function' &&
        PerformanceObserver.supportedEntryTypes?.includes('resource')) {
      const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          let kategorie;
          try {
            const url = new URL(entry.name, location.href);
            kategorie = HTTP[url.pathname];
          } catch (_) { continue; }
          if (!kategorie) continue;
          const status = Number(entry.responseStatus);
          const http = Number.isInteger(status) && status >= 100 && status <= 599
            ? String(status) : 'nezjištěn';
          pripis('HTTP', `${kategorie} ${http}`);
        }
      });
      observer.observe({type:'resource', buffered:true});
    }
  } catch (_) { /* WebView bez této API: stavové události fungují dál. */ }

  /* DEV Debug Hub může mít podrobnější log, ale z něj kopírujeme jen
     přesně známé výrazy a čísla. Nikdy raw řádek, noteId ani URL. */
  function prevezmiBezpecnyDevRadek(raw) {
    if (typeof raw !== 'string') return;
    const queue = /\bTARGET QUEUE\s*\|\s*count=(\d{1,4})/.exec(raw);
    if (queue) return pripis('SYNC', `cílená fronta ${Number(queue[1])}`);
    const copies = /\b(?:TARGET CONFLICT RESOLVED|699D-D CONFLICT LOCAL-ONLY|699D-D TARGET CONFLICT PRESERVED LOCAL)\b[^\r\n]*?copies=(\d{1,3})/.exec(raw);
    if (copies) return pripis('SYNC', `lokální konflikt ${Number(copies[1])}`);
    const start = /\bSTART SYNC FLOW\s*\|\s*(OK|FALSE|CHYBA)\b/.exec(raw);
    if (start) return pripis('SYNC', `start ${start[1]}`);
    const reconcile = /\bV2 EXISTING RECONCILE\s*\|\s*(OK|FALSE|CHYBA)\b/.exec(raw);
    if (reconcile) return pripis('SYNC', `reconcile ${reconcile[1]}`);
    if (raw.includes('688T EPOCH READ FAILED')) return pripis('E2E', 'ověření epochy selhalo');
  }
  try {
    const dev = window.LubaNoteStartupDiag;
    if (typeof dev?.priRadku === 'function') {
      dev.priRadku(prevezmiBezpecnyDevRadek);
      dev.radky?.().forEach(prevezmiBezpecnyDevRadek);
    }
  } catch (_) { /* DEV log není součást čisté PROD. */ }

  pripis('APP', 'diagnostika spuštěna');

  function report() {
    const flavour = ['PROD', 'DEV'].includes(window.LUBANOTE_BUILD_FLAVOR)
      ? window.LUBANOTE_BUILD_FLAVOR : 'nezjištěn';
    const generovano = new Date().toISOString();
    const nejpozdeji = Date.now() - ROK;
    return [
      'LUBANOTE – PODPŮRNÁ DIAGNOSTIKA 699D-F',
      `Vygenerováno UTC: ${generovano}`,
      `Verze: ${bezpecnaVerze()} | sestavení: ${flavour}`,
      `Zařízení: ${platforma()}`,
      `Backend: ${backend()} | síť: ${navigator.onLine ? 'online' : 'offline'}`,
      `Stav účtu: ${stavAuth} | E2E: ${stavE2E} | sync: ${stavSync}`,
      `Přihlašovací brána: ${document.body.classList.contains('authPending') ? 'aktivní' : 'otevřená aplikace'}`,
      `Dialog E2E hesla: ${document.getElementById('secretUnlockModal')?.hidden === false ? 'zobrazen' : 'nezobrazen'}`,
      'HTTP kódy se zobrazí pouze pokud je WebView dovoluje číst.',
      'Bez hesel, tokenů, e-mailů, ID a obsahu poznámek.',
      '--- POSLEDNÍ TECHNICKÉ UDÁLOSTI ---',
      ...zaznamy.filter(x => x.at >= nejpozdeji).slice(-LIMIT).map(x => {
        return `${new Date(x.at).toISOString()} | ${x.typ} | ${x.popis}`;
      }),
      '--- KONEC ---'
    ].join('\n');
  }

  let okno = null;
  let textarea = null;
  let copyStatus = null;
  let puvodniFocus = null;

  async function zkopiruj() {
    const content = report();
    if (textarea) textarea.value = content;
    let done = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(content);
        done = true;
      }
    } catch (_) { /* Android WebView může clipboard odmítnout. */ }
    if (!done && textarea) {
      textarea.focus();
      textarea.select();
      try { done = document.execCommand('copy') === true; } catch (_) {}
    }
    if (copyStatus) {
      copyStatus.textContent = done ? 'Diagnostika zkopírována.' :
        'Kopírování není dostupné. Podrž text a zkopíruj ho ručně.';
    }
    return done;
  }

  function zavri() {
    if (!okno) return;
    okno.hidden = true;
    try { puvodniFocus?.focus?.({preventScroll:true}); } catch (_) {}
  }

  function otevri() {
    if (!okno) vytvorOkno();
    puvodniFocus = document.activeElement;
    textarea.value = report();
    copyStatus.textContent = '';
    okno.hidden = false;
    okno.querySelector('[data-ln-support-copy]')?.focus();
  }

  function vytvorOkno() {
    if (okno) return;
    okno = document.createElement('div');
    okno.className = 'lnSupportOverlay699DF';
    okno.hidden = true;
    okno.innerHTML = `<section class="lnSupportBox699DF" role="dialog" aria-modal="true" aria-labelledby="lnSupportTitle699DF">
      <header><strong id="lnSupportTitle699DF">Diagnostika LubaNote</strong>
      <button type="button" data-ln-support-close aria-label="Zavřít diagnostiku">×</button></header>
      <p>Technický výpis pro řešení potíží. Bez obsahu poznámek a přihlašovacích údajů. Nikam se automaticky neodesílá.</p>
      <textarea readonly rows="13" aria-label="Technický report LubaNote" spellcheck="false"></textarea>
      <div class="lnSupportActions699DF"><button type="button" data-ln-support-copy>Zkopírovat diagnostiku</button>
      <button type="button" data-ln-support-close>Zavřít</button></div>
      <p class="lnSupportCopyState699DF" role="status" aria-live="polite"></p>
      </section>`;
    document.body.appendChild(okno);
    textarea = okno.querySelector('textarea');
    copyStatus = okno.querySelector('.lnSupportCopyState699DF');
    okno.querySelector('[data-ln-support-copy]').addEventListener('click', () => {void zkopiruj();});
    okno.querySelectorAll('[data-ln-support-close]').forEach(el => el.addEventListener('click', zavri));
    okno.addEventListener('click', e => {if (e.target === okno) zavri();});
  }

  function pripojOvladani() {
    if (!document.body) return;
    const style = document.createElement('style');
    style.id = 'lnSupportStyle699DF';
    style.textContent = `
      .lnSupportOverlay699DF[hidden],#lnSupportAuth699DF[hidden]{display:none!important}
      .lnSupportOverlay699DF{position:fixed;inset:0;z-index:2147483000;display:flex;justify-content:center;align-items:center;padding:12px;box-sizing:border-box;background:rgba(0,0,0,.76)}
      .lnSupportBox699DF{box-sizing:border-box;width:min(100%,560px);max-height:calc(100dvh - 24px);overflow:auto;background:var(--color-surface,#172b34);color:var(--color-text,#fff);border:1px solid var(--color-border,#667);border-radius:16px;padding:16px;font:14px/1.45 system-ui,sans-serif}
      .lnSupportBox699DF header{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:18px}
      .lnSupportBox699DF header button{font-size:26px;background:transparent;color:inherit;border:0;min-width:42px;min-height:42px}
      .lnSupportBox699DF p{margin:10px 0}
      .lnSupportBox699DF textarea{width:100%;min-height:200px;max-height:48dvh;box-sizing:border-box;resize:vertical;border:1px solid var(--color-border,#667);border-radius:8px;padding:10px;background:var(--color-background,#0a1e29);color:var(--color-text,#fff);font:12px/1.45 ui-monospace,monospace}
      .lnSupportActions699DF{display:flex;flex-wrap:wrap;gap:9px;margin-top:12px}
      .lnSupportActions699DF button,.lnSupportButton699DF{padding:10px 12px;min-height:40px;border-radius:10px;border:1px solid var(--color-border,#667);background:var(--color-surface,#18333f);color:var(--color-text,#fff);font:600 13px system-ui,sans-serif}
      .lnSupportActions699DF button:first-child{background:var(--color-accent,#237aa5);color:#fff}
      /* 699D-F1 – tlačítko reportu ve Stavu LubaNote má stejné téma jako Aktualizovat.
         Pouze vzhled: žádný zásah do reportu, auth ani syncu. */
      #lnSupportStatus699DF{appearance:none;box-sizing:border-box;max-width:100%;
        min-height:42px;padding:10px 11px;border:0;border-radius:11px;
        background:var(--color-accent,#237aa5);color:var(--color-on-accent,#fff);
        font:600 .9rem/1.2 system-ui,sans-serif;text-align:center;
        white-space:normal;overflow-wrap:normal;cursor:pointer}
      #lnSupportStatus699DF:focus-visible{outline:2px solid var(--color-text,#fff);outline-offset:2px}
      .lnSupportCopyState699DF{min-height:20px}
      #lnSupportAuth699DF{position:fixed;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:2147482990;box-shadow:0 2px 10px #0007}
    `;
    document.head.appendChild(style);

    const actions = document.querySelector('.lnCloudUsageActions699AR');
    if (actions && !document.getElementById('lnSupportStatus699DF')) {
      const b = document.createElement('button');
      b.id = 'lnSupportStatus699DF';
      b.type = 'button';
      b.textContent = 'Zkopírovat diagnostiku';
      b.addEventListener('click', () => {otevri();void zkopiruj();});
      actions.insertBefore(b, actions.firstChild);
    }

    /* Přístup i při chybě přihlášení nebo během povinného E2E dialogu. */
    if (!document.getElementById('lnSupportAuth699DF')) {
      const b = document.createElement('button');
      b.id = 'lnSupportAuth699DF';
      b.type = 'button';
      b.className = 'lnSupportButton699DF';
      b.textContent = 'Diagnostika';
      b.addEventListener('click', otevri);
      document.body.appendChild(b);
    }
    const loginBtn = document.getElementById('lnSupportAuth699DF');
    const login = document.getElementById('loginScreen');
    const aktualizujViditelnost = () => {
      loginBtn.hidden = !document.body.classList.contains('authPending') &&
        (!login || login.hidden);
    };
    aktualizujViditelnost();
    if (typeof MutationObserver === 'function') {
      const obs = new MutationObserver(aktualizujViditelnost);
      obs.observe(document.body,{attributes:true,attributeFilter:['class']});
      if (login) obs.observe(login,{attributes:true,attributeFilter:['hidden']});
    }
    /* Android Back má při otevřené diagnostice zavřít tento výpis,
       nikoli přihlašovací formulář nebo jiné okno pod ním. */
    const staryBack = window.LubaNoteZpracujAndroidZpet;
    window.LubaNoteZpracujAndroidZpet = function(...args) {
      if (okno && !okno.hidden) {zavri();return true;}
      return typeof staryBack === 'function' ? staryBack.apply(this,args) : false;
    };
  }

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !okno || okno.hidden) return;
    e.preventDefault();e.stopImmediatePropagation();zavri();
  }, true);
  window.addEventListener('lubanote:report-open', otevri);
  window.LubaNoteSupportDiagnostics699DF = Object.freeze({otevri,zkopiruj,report});
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', pripojOvladani, {once:true});
  } else {
    pripojOvladani();
  }
})();
