/* LubaNote 683BT - safe account settings. No E2E secret/key modification. */
(() => {
  'use strict';
  const accordion = document.getElementById('ln683BJAccordion');
  const modalSettings = document.getElementById('settingsModal');
  const body = document.getElementById('ln683BJBody-security')?.querySelector('.ln683BJBodyInner');
  const header = document.getElementById('ln683BJHeading-security');
  if (!accordion || !body || !header || document.getElementById('ln683BTSecurity')) return;

  const texts = {
    cs: {biometric:'Biometrie Secret',biometricActive:'Zapnuto',biometricOff:'Vypnuto',biometricUnavailable:'Nedostupná',biometricHelp:'Biometrické odemykání se týká režimu Secret v Android APK, ne přihlášení k celému účtu. Nastavení zapnutí nebo vypnutí zůstává ve stávajícím odemykání Secret.',
      account: 'Přihlášený účet', loading: 'Zjišťuji…', notLogged: 'Nepřihlášeno', offline: 'Účet nelze právě ověřit',
      loginPass: 'Přihlašovací heslo', change: 'Změnit', e2eStatus: 'E2E šifrování', ready: 'Klíč připraven', unverified: 'Stav zatím neověřen',
      mainPass: 'Hlavní E2E heslo', info: 'Informace', recovery: 'Zapomenuté heslo',
      passwordTitle: 'Změna přihlašovacího hesla', passwordHint: 'Mění se pouze heslo k účtu. Hlavní E2E heslo a šifrovací klíče zůstanou beze změny. Může být vyžadováno nové přihlášení na dalších zařízeních.',
      newPassword: 'Nové přihlašovací heslo (min. 10 znaků)', again: 'Zopakuj nové heslo', cancel: 'Zrušit', save: 'Změnit heslo',
      passwordMismatch: 'Hesla se neshodují.', passwordShort: 'Zadej alespoň 10 znaků.', passwordNeedOnline: 'Změna hesla vyžaduje internet a platné přihlášení.',
      passwordFailed: 'Změna se nezdařila. Heslo nebylo potvrzeno jako změněné. Zkus to později.',
      passwordSuccess: 'Přihlašovací heslo bylo změněno. E2E heslo zůstává stejné.', ok: 'OK',
      loginHelp: 'Přihlašovací heslo patří k účtu LubaNote. Změníš ho zde při platném přihlášení; hlavní E2E heslo se tím nemění.',
      e2eHelp: 'Toto je pouze místní stav dostupnosti šifrovacího klíče. Zelený stav neověřuje zálohu ani možnost obnovy klíče na jiném zařízení.',
      mainHelp: 'Hlavní E2E heslo je oddělené od přihlašovacího hesla. Bez ověřeného obnovovacího mechanismu nelze slibovat obnovení zašifrovaných dat. V této verzi ho zde z bezpečnostních důvodů neměníme.',
      recoveryHelp: 'Na e-mail ti můžeme poslat jednorázový odkaz na www.lubanote.com pro nastavení nového přihlašovacího hesla. Neobnovuje hlavní E2E heslo ani šifrovací klíče.'
    },
    en: {biometric:'Secret biometrics',biometricActive:'On',biometricOff:'Off',biometricUnavailable:'Unavailable',biometricHelp:'Biometric unlock applies only to Secret mode on Android, not to the whole account sign-in. Enable or disable it from the existing Secret unlock screen.',account:'Signed-in account',loading:'Checking…',notLogged:'Not signed in',offline:'Account not currently verified',loginPass:'Sign-in password',change:'Change',e2eStatus:'E2E encryption',ready:'Key ready',unverified:'Status not verified',mainPass:'Main E2E password',info:'Information',recovery:'Forgot password',passwordTitle:'Change sign-in password',passwordHint:'Changes only the account password, not your main E2E password or encryption keys. Other devices may need to sign in again.',newPassword:'New sign-in password (at least 10 characters)',again:'Repeat new password',cancel:'Cancel',save:'Change password',passwordMismatch:'Passwords do not match.',passwordShort:'Use at least 10 characters.',passwordNeedOnline:'Internet and a valid login are required.',passwordFailed:'Password change could not be confirmed. Please try again later.',passwordSuccess:'Sign-in password changed. E2E password is unchanged.',ok:'OK',loginHelp:'Your sign-in password belongs to your LubaNote account. Changing it does not change the main E2E password.',e2eHelp:'This shows only local key availability, not whether keys can be recovered on another device.',mainHelp:'The main E2E password is separate from your account password. Encrypted data cannot be promised recoverable without a verified recovery mechanism. It is not changed here.',recoveryHelp:'A single-use link can be emailed to open www.lubanote.com and choose a new account password. It does not restore the main E2E password or encryption keys.'},
    sk: {biometric:'Biometria Secret',biometricActive:'Zapnutá',biometricOff:'Vypnutá',biometricUnavailable:'Nedostupná',biometricHelp:'Biometria slúži len na odomknutie režimu Secret v Androide, nie na prihlásenie do celého účtu. Spravuje sa pri odomykaní Secret.',account:'Prihlásený účet',loading:'Zisťujem…',notLogged:'Neprihlásené',offline:'Účet nemožno overiť',loginPass:'Prihlasovacie heslo',change:'Zmeniť',e2eStatus:'E2E šifrovanie',ready:'Kľúč pripravený',unverified:'Stav neoverený',mainPass:'Hlavné E2E heslo',info:'Informácie',recovery:'Zabudnuté heslo',passwordTitle:'Zmena prihlasovacieho hesla',passwordHint:'Mení sa len heslo k účtu, nie hlavné E2E heslo ani šifrovacie kľúče.',newPassword:'Nové heslo (min. 10 znakov)',again:'Zopakuj nové heslo',cancel:'Zrušiť',save:'Zmeniť heslo',passwordMismatch:'Heslá sa nezhodujú.',passwordShort:'Aspoň 10 znakov.',passwordNeedOnline:'Vyžaduje internet a prihlásenie.',passwordFailed:'Zmena hesla sa nepodarila.',passwordSuccess:'Prihlasovacie heslo zmenené. E2E heslo ostáva.',ok:'OK',loginHelp:'Prihlasovacie heslo patrí k účtu LubaNote. Hlavné E2E heslo sa nemení.',e2eHelp:'Iba lokálny stav kľúča, nie potvrdenie jeho obnoviteľnosti.',mainHelp:'Hlavné E2E heslo je oddelené a bez obnovy kľúčov nemožno sľúbiť obnovu dát. Tu ho nemeníme.',recoveryHelp:'Jednorazový odkaz na nové heslo príde e-mailom a otvorí www.lubanote.com. Neobnovuje hlavné E2E heslo ani kľúče.'},
    de: {biometric:'Secret-Biometrie',biometricActive:'Aktiv',biometricOff:'Inaktiv',biometricUnavailable:'Nicht verfügbar',biometricHelp:'Biometrie betrifft nur Secret unter Android, nicht die Kontoanmeldung. Sie wird weiter über die Secret-Entsperrung eingestellt.',account:'Angemeldetes Konto',loading:'Prüfe…',notLogged:'Nicht angemeldet',offline:'Konto nicht geprüft',loginPass:'Anmeldepasswort',change:'Ändern',e2eStatus:'E2E-Verschlüsselung',ready:'Schlüssel bereit',unverified:'Nicht geprüft',mainPass:'E2E-Hauptpasswort',info:'Information',recovery:'Passwort vergessen',passwordTitle:'Anmeldepasswort ändern',passwordHint:'Ändert nur das Kontopasswort, nicht das E2E-Hauptpasswort oder Schlüssel.',newPassword:'Neues Passwort (mind. 10 Zeichen)',again:'Passwort wiederholen',cancel:'Abbrechen',save:'Passwort ändern',passwordMismatch:'Passwörter stimmen nicht überein.',passwordShort:'Mindestens 10 Zeichen.',passwordNeedOnline:'Internet und Anmeldung erforderlich.',passwordFailed:'Änderung konnte nicht bestätigt werden.',passwordSuccess:'Anmeldepasswort geändert. E2E bleibt unverändert.',ok:'OK',loginHelp:'Das Anmeldepasswort gehört zum LubaNote-Konto. Das E2E-Hauptpasswort bleibt unverändert.',e2eHelp:'Nur lokaler Schlüsselstatus, keine Garantie für Wiederherstellung.',mainHelp:'Das E2E-Passwort ist unabhängig. Ohne geprüfte Wiederherstellung kann die Datenrettung nicht garantiert werden. Hier keine Änderung.',recoveryHelp:'Ein einmaliger Link führt über www.lubanote.com zum neuen Anmeldepasswort. Das E2E-Passwort und die Schlüssel werden damit nicht wiederhergestellt.'},
    pl: {biometric:'Biometria Secret',biometricActive:'Włączona',biometricOff:'Wyłączona',biometricUnavailable:'Niedostępna',biometricHelp:'Biometria dotyczy tylko trybu Secret na Androidzie, a nie logowania do całego konta. Ustawienia pozostają przy odblokowaniu Secret.',account:'Zalogowane konto',loading:'Sprawdzam…',notLogged:'Nie zalogowano',offline:'Nie można zweryfikować',loginPass:'Hasło logowania',change:'Zmień',e2eStatus:'Szyfrowanie E2E',ready:'Klucz gotowy',unverified:'Niezweryfikowane',mainPass:'Główne hasło E2E',info:'Informacje',recovery:'Zapomniane hasło',passwordTitle:'Zmiana hasła logowania',passwordHint:'Zmienia tylko hasło konta, nie główne hasło E2E ani klucze.',newPassword:'Nowe hasło (min. 10 znaków)',again:'Powtórz nowe hasło',cancel:'Anuluj',save:'Zmień hasło',passwordMismatch:'Hasła są różne.',passwordShort:'Co najmniej 10 znaków.',passwordNeedOnline:'Wymaga internetu i logowania.',passwordFailed:'Nie potwierdzono zmiany hasła.',passwordSuccess:'Hasło logowania zmienione. E2E bez zmian.',ok:'OK',loginHelp:'Hasło logowania należy do konta LubaNote. Hasło E2E nie zmienia się.',e2eHelp:'Tylko lokalny stan klucza, bez gwarancji odzyskania.',mainHelp:'Hasło E2E jest niezależne. Bez sprawdzonego mechanizmu nie gwarantujemy odzyskania danych. Tutaj bez zmian.',recoveryHelp:'Jednorazowy link e-mail otwiera www.lubanote.com, gdzie można ustawić nowe hasło. Nie odzyskuje hasła E2E ani kluczy.'},
    es: {biometric:'Biometría Secret',biometricActive:'Activada',biometricOff:'Desactivada',biometricUnavailable:'No disponible',biometricHelp:'La biometría solo desbloquea Secret en Android, no el inicio de sesión de la cuenta. Se configura desde la pantalla Secret.',account:'Cuenta conectada',loading:'Comprobando…',notLogged:'Sin sesión',offline:'Cuenta sin verificar',loginPass:'Contraseña de acceso',change:'Cambiar',e2eStatus:'Cifrado E2E',ready:'Clave disponible',unverified:'Estado sin verificar',mainPass:'Contraseña E2E principal',info:'Información',recovery:'Olvidé mi contraseña',passwordTitle:'Cambiar contraseña de acceso',passwordHint:'Solo cambia la contraseña de la cuenta, no la contraseña E2E ni las claves.',newPassword:'Nueva contraseña (mín. 10 caracteres)',again:'Repite la contraseña',cancel:'Cancelar',save:'Cambiar contraseña',passwordMismatch:'Las contraseñas no coinciden.',passwordShort:'Usa 10 caracteres como mínimo.',passwordNeedOnline:'Se requiere conexión e inicio de sesión.',passwordFailed:'No se pudo confirmar el cambio.',passwordSuccess:'Contraseña de acceso cambiada; E2E sin cambios.',ok:'OK',loginHelp:'La contraseña de acceso pertenece a la cuenta LubaNote. No cambia la principal E2E.',e2eHelp:'Solo estado local de la clave, no garantía de recuperación.',mainHelp:'La contraseña E2E es distinta. Sin recuperación verificada no se puede garantizar el acceso a datos cifrados. No se cambia aquí.',recoveryHelp:'Un enlace de un solo uso abrirá www.lubanote.com para crear otra contraseña. No recupera la contraseña principal E2E ni las claves.'}
  };
  const lang = () => {
    const l = String(window.LubaNoteI18n?.ziskejLocale?.() || document.documentElement.lang || 'cs').slice(0,2).toLowerCase();
    return texts[l] ? l : 'en';
  };
  const t = k => texts[lang()][k];

  const recoveryTexts = {
    cs:{action:'Poslat odkaz', title:'Obnova přihlašovacího hesla', hint:'Pošleme jednorázový odkaz na tvůj e-mail. Nové heslo zadáš na www.lubanote.com. Hlavní E2E heslo a klíče tím neobnovíš.', email:'E-mail účtu', send:'Odeslat e-mail', waiting:'Odesílám…', sent:'Pokud je účet s touto adresou registrován a e-mailové doručování funguje, přijde zpráva s odkazem. Zkontroluj i spam.', failed:'Odeslání se nepodařilo ověřit. Zkontroluj připojení a zkus to později.', invalid:'Zadej platnou e-mailovou adresu.', link:'Zapomenuté heslo?', noLink:'Změnit čas?'},
    en:{action:'Email link',title:'Reset sign-in password',hint:'We will email a one-time link to www.lubanote.com. This cannot restore your main E2E password or keys.',email:'Account email',send:'Send email',waiting:'Sending…',sent:'If the account exists and email delivery is available, a link will arrive. Check your spam folder too.',failed:'Could not confirm email delivery. Check your connection and try later.',invalid:'Enter a valid email address.',link:'Forgot password?'},
    sk:{action:'Poslať odkaz',title:'Obnova prihlasovacieho hesla',hint:'Jednorazový odkaz pošleme e-mailom na www.lubanote.com. Hlavné E2E heslo ani kľúče to neobnoví.',email:'E-mail účtu',send:'Poslať e-mail',waiting:'Odosielam…',sent:'Ak účet existuje a pošta funguje, odkaz príde na e-mail. Skontroluj aj spam.',failed:'Nepodarilo sa potvrdiť odoslanie. Skús to neskôr.',invalid:'Zadaj platný e-mail.',link:'Zabudnuté heslo?'},
    de:{action:'Link senden',title:'Anmeldepasswort zurücksetzen',hint:'Ein Einmal-Link führt zu www.lubanote.com. E2E-Hauptpasswort und Schlüssel werden nicht wiederhergestellt.',email:'E-Mail des Kontos',send:'E-Mail senden',waiting:'Sende…',sent:'Wenn das Konto existiert und der Mailversand funktioniert, kommt ein Link. Prüfe auch den Spamordner.',failed:'Versand konnte nicht bestätigt werden. Bitte später versuchen.',invalid:'Gültige E-Mail eingeben.',link:'Passwort vergessen?'},
    pl:{action:'Wyślij link',title:'Odzyskaj hasło logowania',hint:'Wyślemy jednorazowy link do www.lubanote.com. Nie przywróci on hasła E2E ani kluczy.',email:'E-mail konta',send:'Wyślij e-mail',waiting:'Wysyłanie…',sent:'Jeśli konto istnieje i poczta działa, link przyjdzie na e-mail. Sprawdź spam.',failed:'Nie udało się potwierdzić wysyłki. Spróbuj ponownie.',invalid:'Wpisz poprawny e-mail.',link:'Nie pamiętasz hasła?'},
    es:{action:'Enviar enlace',title:'Recuperar contraseña de acceso',hint:'Enviaremos un enlace de un solo uso a www.lubanote.com. No recupera la contraseña E2E ni las claves.',email:'Correo de la cuenta',send:'Enviar correo',waiting:'Enviando…',sent:'Si existe la cuenta y funciona el correo, llegará un enlace. Revisa spam también.',failed:'No se pudo confirmar el envío. Inténtalo más tarde.',invalid:'Introduce un correo válido.',link:'¿Olvidaste tu contraseña?'}
  };
  const rt = k => (recoveryTexts[lang()] || recoveryTexts.cs)[k];

  const root = document.createElement('div');
  root.id = 'ln683BTSecurity';
  const elements = {};
  function addRow(id, kind) {
    const row = document.createElement('div');
    row.className = 'ln683BTSecurityRow';
    const title = document.createElement('span');
    title.className = 'ln683BTSecurityLabel';
    const right = document.createElement(kind === 'action' ? 'button' : 'span');
    right.className = 'ln683BTSecurityValue';
    if (kind === 'action') right.type = 'button';
    const info = document.createElement('button');
    info.type = 'button';
    info.className = 'ln683BJInfo ln683BTSecurityInfo';
    info.textContent = 'i';
    info.addEventListener('click', () => showInfo(t(id === 'account' ? 'account' : id === 'loginPass' ? 'loginPass' : id === 'e2eStatus' ? 'e2eStatus' : id), t(id === 'loginPass' ? 'loginHelp' : id === 'e2eStatus' ? 'e2eHelp' : id === 'mainPass' ? 'mainHelp' : id === 'biometric' ? 'biometricHelp' : 'recoveryHelp')));
    if (id === 'account') info.hidden = true;
    row.append(title, right, info);
    root.append(row);
    elements[id] = {row,title,right,info};
  }
  addRow('account', 'value');
  addRow('loginPass', 'action');
  addRow('e2eStatus', 'value');
  addRow('biometric', 'value');
  addRow('mainPass', 'value');
  addRow('recovery', 'action');
  body.querySelector('.ln683BJPlanned')?.remove();
  body.append(root);

  const overlay = document.createElement('div');
  overlay.className = 'ln683BTSecurityOverlay';
  overlay.hidden = true;
  overlay.setAttribute('aria-hidden', 'true');
  const dialog = document.createElement('div');
  dialog.className = 'ln683BTSecurityDialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  const heading = document.createElement('h3');
  const description = document.createElement('p');
  const form = document.createElement('form');
  form.noValidate = true;
  const inputNew = document.createElement('input');
  const inputAgain = document.createElement('input');
  const inputEmail = document.createElement('input');
  inputEmail.type='email'; inputEmail.autocomplete='email'; inputEmail.inputMode='email'; inputEmail.required=true; inputEmail.className='ln683BTSecurityPassword'; inputEmail.setAttribute('aria-label','E-mail');
  for (const field of [inputNew,inputAgain]) {
    field.type = 'password'; field.autocomplete = 'new-password'; field.required = true;
    field.minLength = 10; field.className = 'ln683BTSecurityPassword';
    field.autocapitalize = 'off'; field.spellcheck = false;
  }
  const labelNew = document.createElement('label');
  const labelAgain = document.createElement('label');
  const labelEmail = document.createElement('label');
  labelEmail.append(inputEmail);
  labelNew.append(inputNew); labelAgain.append(inputAgain);
  const message = document.createElement('p'); message.className='ln683BTSecurityMessage'; message.hidden=true;
  const actions = document.createElement('div'); actions.className='ln683BTSecurityActions';
  const cancel = document.createElement('button'); cancel.type='button';
  const submit = document.createElement('button'); submit.type='submit';
  actions.append(cancel,submit);
  form.append(labelNew,labelAgain,labelEmail,message,actions);
  dialog.append(heading,description,form);
  overlay.append(dialog);
  document.body.append(overlay);
  let view = 'info';
  const close = () => {
    overlay.hidden = true; overlay.setAttribute('aria-hidden','true');
    overlay.removeAttribute('data-ln683by-recovery-login');
    inputNew.value=''; inputAgain.value=''; inputEmail.value=''; message.textContent=''; message.hidden=true;
    cancel.disabled=false;
    submit.disabled=false;
    try { window.LubaNoteKeyboard?.skryjPoZavreniModalu?.(); } catch (_) {}
  };
  cancel.addEventListener('click',close);
  overlay.addEventListener('click',e => { if(e.target === overlay && !submit.disabled) close(); });
  document.addEventListener('keydown',e => {
    if(e.key === 'Escape' && !overlay.hidden && !submit.disabled){e.stopPropagation();close();}
  });
  function setMessage(value) { message.textContent=value; message.hidden=!value; }
  function showInfo(title, info) {
    view='info'; heading.textContent=title; description.textContent=info;
    form.hidden=false; labelNew.hidden=true; labelAgain.hidden=true;labelEmail.hidden=true;
    cancel.hidden=true; submit.hidden=false; submit.type='button'; submit.textContent=t('ok');
    setMessage('');
    overlay.hidden=false; overlay.setAttribute('aria-hidden','false');
    try {window.LubaNoteKeyboard?.skryjProModal?.();}catch(_){}
  }
  submit.addEventListener('click', () => { if(view==='info') close(); });
  function showPassword() {
    view='password';heading.textContent=t('passwordTitle');description.textContent=t('passwordHint');
    form.hidden=false;labelNew.hidden=false;labelAgain.hidden=false;labelEmail.hidden=true;
    cancel.hidden=false; submit.hidden=false;submit.type='submit';
    labelNew.childNodes[0]?.nodeType === Node.TEXT_NODE && labelNew.childNodes[0].remove();
    labelAgain.childNodes[0]?.nodeType === Node.TEXT_NODE && labelAgain.childNodes[0].remove();
    labelNew.prepend(document.createTextNode(t('newPassword')));
    labelAgain.prepend(document.createTextNode(t('again')));
    cancel.textContent=t('cancel');submit.textContent=t('save');setMessage('');
    overlay.hidden=false;overlay.setAttribute('aria-hidden','false');
    try {window.LubaNoteKeyboard?.skryjProModal?.();}catch(_){}
  }
  function showRecovery(prefill='') {
    // The login privacy gate hides all top-level modals by default.
    // Opt out only for the recovery dialog opened on the visible signed-out login screen.
    const signedOutLogin = document.getElementById('loginScreen');
    if (signedOutLogin && !signedOutLogin.hidden && document.body.classList.contains('authPending')) {
      overlay.setAttribute('data-ln683by-recovery-login', '');
    } else {
      overlay.removeAttribute('data-ln683by-recovery-login');
    }
    view='recovery'; heading.textContent=rt('title'); description.textContent=rt('hint');
    form.hidden=false; labelNew.hidden=true; labelAgain.hidden=true; labelEmail.hidden=false;
    labelEmail.replaceChildren(document.createTextNode(rt('email')),inputEmail);
    inputEmail.value=String(prefill || elements.account.right.dataset.email || document.getElementById('loginEmail')?.value || '').trim();
    cancel.hidden=false;cancel.disabled=false;cancel.textContent=t('cancel');
    submit.hidden=false;submit.disabled=false;submit.type='submit';submit.textContent=rt('send');
    setMessage('');overlay.hidden=false;overlay.setAttribute('aria-hidden','false');
    try {window.LubaNoteKeyboard?.skryjProModal?.();}catch(_){}
  }
  async function requestRecovery(event){
    event.preventDefault();
    const email=inputEmail.value.trim();
    if(!inputEmail.validity.valid || !email || email.length>254){setMessage(rt('invalid'));return;}
    if(!navigator.onLine){setMessage(t('passwordNeedOnline'));return;}
    submit.disabled=true;cancel.disabled=true;submit.textContent=rt('waiting');
    try {
      const ready=await window.LubaNoteSupabase?.pripravClient?.();
      if(!ready || typeof supabaseClient==='undefined' || !supabaseClient?.auth)throw new Error('auth_unavailable');
      const {error}=await supabaseClient.auth.resetPasswordForEmail(email,{
        redirectTo:'https://www.lubanote.com/reset-password.html'
      });
      if(error)throw error;
      // Keep response identical for existing and unknown addresses. Do not log email/tokens.
      setMessage(rt('sent')); submit.hidden=true;
    }catch(_){ setMessage(rt('failed')); }
    finally {submit.disabled=false;cancel.disabled=false;submit.textContent=rt('send');}
  }
  // Also available on the signed-out login screen.
  const loginScreen=document.getElementById('loginScreen');
  const loginContainer=document.getElementById('loginCredentialsFields');
  if(loginScreen && loginContainer && !document.getElementById('ln683BVForgotLogin')){
    const forgot=document.createElement('button');forgot.type='button';forgot.id='ln683BVForgotLogin';
    forgot.className='ln683BVForgotLogin';forgot.textContent=rt('link');
    forgot.addEventListener('click',()=>showRecovery(document.getElementById('loginEmail')?.value));
    loginContainer.append(forgot);
    const syncLogin=()=>{forgot.hidden=document.getElementById('loginModeRegister')?.getAttribute('aria-selected')==='true';forgot.textContent=rt('link');};
    new MutationObserver(syncLogin).observe(document.getElementById('loginModeRegister'),{attributes:true,attributeFilter:['aria-selected']});
    window.addEventListener('lubanote:language-change',syncLogin);
    syncLogin();
  }
  async function changePassword(e) {
    e.preventDefault();
    if(view==='recovery') { await requestRecovery(e);return; }
    if(view!=='password') return;
    const password = inputNew.value;
    if(Array.from(password).length < 10){setMessage(t('passwordShort'));return;}
    if(password!==inputAgain.value){setMessage(t('passwordMismatch'));return;}
    if(!navigator.onLine){setMessage(t('passwordNeedOnline'));return;}
    submit.disabled=true;cancel.disabled=true;
    try {
      const ready = await window.LubaNoteSupabase?.pripravClient?.();
      if(!ready || typeof supabaseClient==='undefined' || !supabaseClient?.auth) throw new Error('auth_unavailable');
      const {data,error}=await supabaseClient.auth.getUser();
      if(error || !data?.user?.id) throw new Error('no_verified_session');
      const {error:updateError}=await supabaseClient.auth.updateUser({password});
      if(updateError) throw updateError;
      close();
      showInfo(t('passwordTitle'),t('passwordSuccess'));
    } catch (error) {
      // Deliberately do not log password, auth tokens, server error internals or sensitive state.
      setMessage(t('passwordFailed'));
    } finally { submit.disabled=false;cancel.disabled=false; }
  }
  form.addEventListener('submit',changePassword);
  elements.loginPass.right.addEventListener('click',showPassword);
  elements.recovery.right.addEventListener('click',()=>showRecovery());
  elements.account.right.addEventListener('click',()=>{const email=elements.account.right.dataset.email;if(email)showInfo(t('account'),email);});
  elements.account.right.setAttribute('role','button');elements.account.right.tabIndex=0;
  elements.account.right.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&elements.account.right.dataset.email){e.preventDefault();showInfo(t('account'),elements.account.right.dataset.email);}});
  function refreshE2e(){
    const state=window.LubaNoteE2ECore?.getStav?.();
    elements.e2eStatus.right.textContent=state?.ready === true ? t('ready') : t('unverified');
  }
  async function refreshBiometric(){
    elements.biometric.right.textContent=t('loading');
    try {
      const api=window.LubaNoteSecretBiometric;
      if(!api?.zjistiStav){elements.biometric.right.textContent=t('biometricUnavailable');return;}
      const state=await api.zjistiStav();
      elements.biometric.right.textContent=!state?.available ? t('biometricUnavailable') :
        state.configured ? t('biometricActive') : t('biometricOff');
    } catch(_) {elements.biometric.right.textContent=t('biometricUnavailable');}
  }
  function applyLabels(){
    for (const [id,el] of Object.entries(elements)) el.title.textContent=t(id);
    elements.loginPass.right.textContent=t('change');
    elements.biometric.right.textContent=t('loading');
    elements.mainPass.right.textContent=t('info');
    elements.recovery.right.textContent=rt('action');
    elements.account.right.textContent=elements.account.right.dataset.email || t('loading');
    refreshE2e();
    for(const [id,el] of Object.entries(elements)) el.info.setAttribute('aria-label',t('info')+': '+t(id));
  }
  async function refreshAccount(){
    if (!elements.account.right.dataset.email) elements.account.right.textContent=t('loading');
    if (!navigator.onLine) {
      elements.account.right.textContent=t('offline');
      delete elements.account.right.dataset.email;
      return;
    }
    try {
      const ready=await window.LubaNoteSupabase?.pripravClient?.();
      if(!ready || typeof supabaseClient==='undefined'||!supabaseClient?.auth) throw new Error('no_auth');
      const {data,error}=await supabaseClient.auth.getUser();
      if(error) throw error;
      const email=data?.user?.email || '';
      elements.account.right.dataset.email=email;
      elements.account.right.textContent=email || t('notLogged');
    } catch(_) {
      elements.account.right.textContent=t('offline');
      delete elements.account.right.dataset.email;
    }
  }
  header.addEventListener('click', () => {
    if(header.getAttribute('aria-expanded')==='true') {
      applyLabels(); void refreshAccount(); void refreshBiometric();
    }
  });
  window.addEventListener('lubanote:e2e-core-state',refreshE2e);
  window.addEventListener('lubanote:language-change',applyLabels);
  new MutationObserver(() => {if(modalSettings.hidden)close();}).observe(modalSettings,{attributes:true,attributeFilter:['hidden']});
  applyLabels();
})();
