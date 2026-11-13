/* 699D-L – Problémy LubaNote. Kontrolní centrum oprávnění Androidu.
 * Pouze read-only kontroly; systémová změna jen po stisku Opravit.
 * Bez změn připomínek, FCM, synchronizace, E2E a samotných alarmů.
 */
(() => {
  'use strict';
  if (!window.Capacitor?.isNativePlatform?.()) return;
  const plugin = window.Capacitor?.Plugins?.LubaNoteFcmToken;
  const menu = document.getElementById('mainMenu');
  if (!plugin || !menu || document.getElementById('ln699DLProblemsMenu')) return;
  const t = (cs, en) => (window.LubaNoteI18n?.ziskejJazyk?.() || 'cs') === 'cs' ? cs : en;
  let current = null;
  let busy = false;
  let lastCheck = 0;
  let visible = false;
  let modal = null;
  let model = {screen: 'list', detail: null};
  const errors = [];

  // Guides are advisory: system screen names depend on device and OS version.
  // No Android or manufacturer-specific hidden setting is reported as verified.
  const guides = {
    samsung: 'Nastavení → Baterie → Limity využití na pozadí → Aplikace, které nikdy nespí → + → LubaNote. Zkontroluj také seznam Spící / Hluboce spící aplikace.',
    xiaomi: 'Nastavení → Aplikace → Správa aplikací → LubaNote → Baterie. Pokud vidíš „Povolit používání aplikace na pozadí“, klepni na CELÝ ŘÁDEK, nejen na přepínač. V další nabídce vyber „Neomezeno“ místo „Optimalizováno“.',
    pixel: 'Nastavení → Aplikace → LubaNote → Využití baterie aplikací → Povolit používání na pozadí → otevři také detail a vyber „Bez omezení“, pokud je dostupný.',
    oneplus: 'Nastavení → Aplikace → LubaNote → Využití baterie → Povolit aktivitu na pozadí / Bez optimalizace. V nastavení automatického spouštění ověř povolení LubaNote.',
    oppo: 'Nastavení → Aplikace → Správa aplikací → LubaNote → Využití baterie → Povolit aktivitu na pozadí. Ověř také automatické spouštění, pokud je dostupné.',
    realme: 'Nastavení → Aplikace → Správa aplikací → LubaNote → Využití baterie → Povolit aktivitu na pozadí. U starších systémů otevři Optimalizace baterie a nastav Bez omezení.',
    vivo: 'Nastavení → Baterie → Správa spotřeby na pozadí → LubaNote → Povolit provoz na pozadí. Zkontroluj také automatické spouštění.',
    huawei: 'Nastavení → Aplikace → Spuštění aplikací → LubaNote → vypni Automaticky spravovat a povol Automatické spuštění, Sekundární spuštění a Běh na pozadí.',
    honor: 'Nastavení → Aplikace → Spuštění aplikací → LubaNote → Ručně spravovat → povol Automatické spuštění, Sekundární spuštění a Běh na pozadí, pokud tyto volby existují.',
    motorola: 'Nastavení → Aplikace → LubaNote → Baterie / Využití baterie aplikací → Bez omezení. Vypni případné automatické omezení aplikace.',
    sony: 'Nastavení → Aplikace → LubaNote → Baterie → Neomezeno / Bez omezení. Ověř, zda není zapnutý STAMINA režim.',
    asus: 'Nastavení → Baterie → Správce automatického spouštění → povol LubaNote. V informacích o aplikaci zkontroluj optimalizaci baterie.',
    nothing: 'Nastavení → Aplikace → LubaNote → Využití baterie aplikací → Povolit na pozadí / Bez omezení, pokud jsou volby dostupné.'
  };
  const brandOf = (raw) => {
    const s = String(raw || '').toLowerCase();
    if (/redmi|poco|xiaomi|blackshark/.test(s)) return 'xiaomi';
    if (/samsung/.test(s)) return 'samsung';
    if (/google|pixel/.test(s)) return 'pixel';
    for (const b of ['oneplus','oppo','realme','vivo','huawei','honor','motorola','sony','asus','nothing']) {
      if (s.includes(b)) return b;
    }
    return 'other';
  };
  const note = (parent, tag, txt, className) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    el.textContent = txt;
    parent.append(el);
    return el;
  };
  const button = (parent, label, fn, kind = 'normal') => {
    const el = note(parent, 'button', label, 'ln699DLAction ln699DL-' + kind);
    el.type = 'button';
    el.addEventListener('click', fn);
    return el;
  };
  const reports = (s) => {
    if (!s) return [];
    const out = [];
    if (s.notificationsAllowed === false) out.push({id:'notifications',label:t('Oznámení jsou vypnutá','Notifications are disabled'),
      message:t('LubaNote nemůže zobrazovat připomínky.','LubaNote cannot show reminders.')});
    if (s.exactAllowed === false) out.push({id:'exact',label:t('Přesné alarmy nejsou povolené','Exact alarms are not allowed'),
      message:t('Android může plánované upozornění výrazně zpozdit.','Android may delay time-critical reminders.')});
    if (s.batteryExempt === false) out.push({id:'battery',label:t('Omezení baterie je aktivní','Battery optimization is enabled'),
      message:t('Není potvrzena systémová výjimka z optimalizace. Výrobce může mít další vlastní omezení.','System battery exemption is missing. Manufacturer restrictions may also apply.')});
    return out;
  };
  const refreshMenu = () => {
    const c = reports(current).length;
    window.LubaNoteProblems699DL.count = c;
    menuLabel.textContent = `${t('Problémy','Problems')} (${c})`;
    window.dispatchEvent(new CustomEvent('lubanote:problems-updated', {detail:{count:c}}));
  };
  async function status() {
    let result = null;
    if (typeof plugin.getReminderHealth699DL === 'function') {
      try { result = await plugin.getReminderHealth699DL(); } catch (_) {}
    }
    // Older APK: read only what can be confirmed; unknown is NOT 'all OK'.
    if (!result) {
      const [exact, notif, info] = await Promise.all([
        plugin.getExactAlarmStatus?.().catch(() => null),
        window.Capacitor?.Plugins?.LocalNotifications?.checkPermissions?.().catch(() => null),
        plugin.getBatterySettingsInfo697A?.().catch(() => null)
      ]);
      result = {exactAllowed: typeof exact?.allowed === 'boolean' ? exact.allowed : null,
        notificationsAllowed: notif?.display === 'granted' ? true : notif?.display === 'denied' ? false : null,
        batteryExempt: null, manufacturer: info?.manufacturer || '', brand: info?.brand || '',
        model: info?.model || '', nativeHealthAvailable: false};
    } else result.nativeHealthAvailable = true;
    result.brandKey = brandOf([result.manufacturer,result.brand,result.model].join(' '));
    return result;
  }
  async function refresh(force = false) {
    if (busy || document.hidden || (!force && Date.now()-lastCheck < 2500)) return;
    busy = true;
    try { current = await status(); lastCheck = Date.now(); refreshMenu(); if (visible) draw(); }
    catch (error) { errors.push(String(error?.message || error)); if (errors.length > 3) errors.shift(); }
    finally { busy = false; }
  }

  const menuButton = document.createElement('button');
  menuButton.id = 'ln699DLProblemsMenu';
  menuButton.type = 'button';
  menuButton.setAttribute('role','menuitem');
  const menuIcon = note(menuButton,'span','🛡️','mainMenuIcon');
  menuIcon.setAttribute('aria-hidden','true');
  const menuLabel = note(menuButton,'span',t('Problémy (0)','Problems (0)'),'mainMenuLabel');
  const conflict = document.getElementById('ln699DJConflictsButton');
  if (conflict?.parentElement === menu) conflict.after(menuButton);
  else document.getElementById('storageScopeMenuButton')?.after(menuButton);

  const style = document.createElement('style');
  style.id = 'ln699DLStyle';
  style.textContent = `
    #ln699DLOverlay[hidden]{display:none!important}
    #ln699DLOverlay{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;padding:14px;box-sizing:border-box}
    #ln699DLWindow{background:var(--color-background,#202126);color:var(--color-text,#fff);border:1px solid var(--color-border,#777);border-radius:17px;width:min(530px,100%);max-height:85dvh;overflow:auto;padding:17px;box-sizing:border-box;box-shadow:0 20px 50px #0008}
    #ln699DLWindow button{font:inherit;cursor:pointer}
    .ln699DLHead{display:flex;align-items:center;gap:10px;margin-bottom:12px}
    .ln699DLHead strong{flex:1;font-size:1.06rem}
    .ln699DLClose{background:transparent;color:inherit;border:0;padding:6px;min-width:35px;min-height:35px}
    .ln699DLItem{border:1px solid var(--color-border,#777);border-radius:11px;padding:12px;margin:10px 0;background:var(--color-surface,#303039)}
    .ln699DLItem strong{display:block;margin-bottom:7px}
    .ln699DLItem p{font-size:.92rem;line-height:1.5;margin:7px 0}
    .ln699DLButtons{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
    .ln699DLAction{padding:9px 13px;min-height:42px;border-radius:9px;border:1px solid var(--color-border,#777);background:var(--color-surface,#373741);color:var(--color-text,#fff);text-align:left}
    .ln699DL-primary{background:var(--color-accent,#458ab0);color:var(--color-background,#fff);font-weight:700}
    .ln699DLMuted{opacity:.83;font-size:.89rem;line-height:1.55;white-space:pre-line}
    .ln699DLGood{color:var(--color-success,#76c9a8)}
    #ln699DLWindow .ln699DLAction:focus-visible{outline:2px solid var(--color-accent,#6499ed)}
  `;
  document.head.append(style);
  const overlay = document.createElement('div');
  overlay.id = 'ln699DLOverlay'; overlay.hidden = true;
  overlay.setAttribute('role','presentation');
  const dialog = document.createElement('div');
  dialog.id = 'ln699DLWindow'; dialog.setAttribute('role','dialog'); dialog.setAttribute('aria-modal','true');
  overlay.append(dialog); document.body.append(overlay);
  overlay.addEventListener('click', (e) => {if(e.target===overlay) close();});
  document.addEventListener('keydown', (e)=>{if(e.key==='Escape' && visible) close();});
  function close() { visible=false; overlay.hidden=true; dialog.replaceChildren(); }
  function header(title) {
    dialog.replaceChildren();
    const h=note(dialog,'div','','ln699DLHead');
    note(h,'strong',title);
    button(h,'✕',close,'close').classList.add('ln699DLClose');
  }
  function guideFor(s, id) {
    if (id==='exact') return t('Nastavení telefonu → Aplikace → Speciální přístup → Budíky a připomenutí → LubaNote → Povolit. Názvy závisí na verzi Androidu.',
      'Settings → Apps → Special app access → Alarms & reminders → LubaNote → Allow.');
    if (id==='notifications') return t('Nastavení telefonu → Aplikace → LubaNote → Oznámení → Povolit. Ověř také kategorii připomínek.',
      'Settings → Apps → LubaNote → Notifications → Allow. Check the reminder channel too.');
    const device = (s?.brandKey || 'other');
    return guides[device] || t('Nastavení telefonu → Aplikace → LubaNote → Baterie / Využití baterie aplikací → Bez omezení. Pokud není volba vidět, v Nastavení vyhledej „optimalizace baterie“ nebo „běh na pozadí“.',
      'Settings → Apps → LubaNote → Battery / App battery usage → Unrestricted. Search settings for battery optimization or background usage.');
  }
  function info(id) {
    model = {screen:'info',detail:id};
    draw();
  }
  async function repair(id) {
    if (typeof plugin.openReminderPermission699DL !== 'function') {
      info(id); return;
    }
    try {
      const r = await plugin.openReminderPermission699DL({kind:id});
      if (r?.opened !== true) info(id);
      else setTimeout(() => {void refresh(true);}, 500);
    } catch (_) { info(id); }
  }
  function draw() {
    if (!visible) return;
    const problems=reports(current);
    if (model.screen==='info') {
      header(t('Jak opravit nastavení','How to fix the setting'));
      const label = model.detail==='battery' ? t('Běh na pozadí','Background activity') :
        model.detail==='exact' ? t('Přesné alarmy','Exact alarms') : t('Oznámení','Notifications');
      note(dialog,'h3',label);
      const s=current;
      if (s) note(dialog,'p',`${s.manufacturer || s.brand || t('Android telefon','Android phone')} ${s.model || ''} · Android ${s.androidApi || '?'}`,'ln699DLMuted');
      note(dialog,'p',guideFor(s,model.detail),'ln699DLMuted');
      note(dialog,'p',t('Postup je orientační. Výrobci a aktualizace mohou názvy položek změnit. Pokud přesná stránka není dostupná, LubaNote ji nebude nahrazovat matoucí obrazovkou informací o aplikaci.',
        'Steps vary by manufacturer and Android version. LubaNote will not substitute an unrelated settings page.'),'ln699DLMuted');
      const actions=note(dialog,'div','','ln699DLButtons');
      button(actions,t('Zpět','Back'),()=>{model={screen:'list'};draw();});
      if (model.detail!=='battery') button(actions,t('Otevřít nastavení','Open settings'),()=>{void repair(model.detail);},'primary');
      // Manufacturer-specific background controls have no verified cross-device deep link.
      return;
    }
    header(t('Problémy LubaNote','LubaNote problems'));
    if (!current) note(dialog,'p',t('Zjišťuji stav oprávnění…','Checking permissions…'),'ln699DLMuted');
    if (current && !current.nativeHealthAvailable) note(dialog,'p',t('Úplná nativní kontrola v této APK není dostupná. Aktualizuj APK, stav baterie zatím nelze potvrdit.',
      'Full native checks are unavailable in this APK. Battery status cannot be confirmed.'),'ln699DLMuted');
    if (current && problems.length===0) note(dialog,'p',t('✓ Žádný z kontrolovaných systémových zákazů nebyl zjištěn.',
      '✓ No blocked system permissions detected.'),'ln699DLGood');
    for (const item of problems) {
      const b=note(dialog,'section','','ln699DLItem');
      note(b,'strong','⚠️ '+item.label);
      note(b,'p',item.message);
      const row=note(b,'div','','ln699DLButtons');
      button(row,t('Opravit','Fix'),()=>{void repair(item.id);},'primary');
      button(row,'ⓘ Info',()=>info(item.id));
    }
    const b=note(dialog,'section','','ln699DLItem');
    note(b,'strong',t('Další omezení telefonu','Other device restrictions'));
    note(b,'p',t('Výrobce může používat další skrytou optimalizaci, kterou standardní Android API neumí ověřit. Její vypnutí nelze prohlásit za potvrzené.',
      'Manufacturers may enforce restrictions that Android does not report. Their status cannot be verified automatically.'));
    const row=note(b,'div','','ln699DLButtons');
    button(row,'ⓘ '+t('Návod pro můj telefon','Guide for my phone'),()=>info('battery'));
    const end=note(dialog,'div','','ln699DLButtons');
    button(end,t('Zkontrolovat znovu','Check again'),()=>{void refresh(true);},'primary');
  }
  function open() {
    menu.hidden = true;
    document.getElementById('mainMenuButton')?.setAttribute('aria-expanded','false');
    model = {screen:'list',detail:null};
    visible=true; overlay.hidden=false; draw();
    void refresh(true);
  }
  menuButton.addEventListener('click',open);
  // The old settings shortcut no longer opens ambiguous vendor app-info screens.
  document.getElementById('openBatterySettings697D')?.addEventListener('click',(e)=>{
    e.preventDefault(); e.stopImmediatePropagation(); open();
  },true);
  window.LubaNoteProblems699DL = {ready:true,count:0,open,refresh:()=>refresh(true)};
  window.addEventListener('lubanote:splash-ready',()=>{void refresh(true);});
  window.addEventListener('lubanote:account-active',()=>{void refresh(true);});
  window.addEventListener('focus',()=>{void refresh();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden) void refresh(true);});
  window.addEventListener('lubanote:language-change',()=>{refreshMenu();if(visible)draw();});
  void refresh(true);
})();
