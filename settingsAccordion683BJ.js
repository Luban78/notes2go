/* LubaNote 683BJ — Nastaveni A3: jedina otevrena sekce, bez sipek a +/-.
 * Pouze preskupuje STAVAJICI DOM uzly (neklonuje a nemeni obsluhu nastaveni).
 */
(() => {
  'use strict';
  const modal = document.getElementById('settingsModal');
  const scroll = modal?.querySelector('.settingsScrollBody');
  if (!modal || !scroll || document.getElementById('ln683BJAccordion')) return;

  const PREKLADY = {
    cs: [
      ['Vzhled', 'Motiv, písmo, ikony', 'Zde nastavíš vzhled aplikace, velikost písma a ovládací ikony hlavní obrazovky.'],
      ['Editor a klávesnice', 'Psaní a chování editoru', 'Tady nastavíš klávesnici a místo, na kterém se poznámka po otevření zobrazí. Velikost zobrazení textu editoru a znaků LubaKeyboard lze nastavit zvlášť. Typ písma editoru si lze vybrat samostatně.'],
      ['Plán a připomínky', 'Odložení, připomenutí, úklid', 'Připomínky při plánování a odložení úkolů. Úklid po termínu řeší staré nedokončené položky Planneru a vypnutí jednorázových připomínek.'],
      ['Bezpečnost a přihlášení', 'Účet, hesla a ochrana dat', 'Zde najdeš přehled účtu, změnu přihlašovacího hesla a stav E2E. Hlavní šifrovací heslo se nemění; reset přihlášení automaticky neobnoví šifrovací klíče.'],
      ['Data, soubory a zálohy', 'Export, import, úložiště', 'Zálohy lze exportovat a importovat. Nastavení složek a bezpečný převod LOCAL ↔ SYNC budou připraveny až po samostatném ověření.'],
      ['Jazyk a výuka', 'Jazyk, slovník a slovíčka', 'Zde si vybereš jazyk LubaNote a otevřeš svůj slovník nebo výuku slovíček.'],
      ['Účet a sdílení', 'Uživatelské jméno a sdílení', 'Veřejné uživatelské jméno se používá ke sdílení. Tvůj e-mail se ostatním nezobrazuje.'],
      ['O aplikaci', 'Verze a informace', 'Informace o LubaNote a aktuální verzi aplikace.']
    ],
    en: [
      ['Appearance','Theme, text and icons','Configure the app theme, text size and home toolbar icons.'],
      ['Editor and keyboard','Writing and editor behavior','Keyboard and note opening position. Editor display text size and key-label size can be adjusted separately. Choose the editor font separately.'],
      ['Planner and reminders','Snooze, reminders and cleanup','Reminder defaults, snooze choices and handling of past-due planned items.'],
      ['Security and sign-in','Account, passwords and protection','Account status, sign-in password change and local E2E state. The main E2E password remains separate. Restoring sign-in does not restore encryption keys.'],
      ['Data, files and backups','Export, import and storage','Backups are available. Folder selection and safe LOCAL ↔ SYNC conversion need separate verification.'],
      ['Language and learning','Language, dictionary and words','Choose the app language, manage your dictionary and language learning.'],
      ['Account and sharing','Username and sharing','Your public username is used for sharing. Your email address is not public.'],
      ['About','Version and information','App version and information about LubaNote.']
    ],
    sk: [
      ['Vzhľad','Motív, písmo, ikony','Nastavenia motívu, veľkosti písma a ikon hlavnej obrazovky.'],
      ['Editor a klávesnica','Písanie a správanie editora','Klávesnica a poloha pri otvorení poznámky. Veľkosť zobrazenia textu editora a znakov LubaKeyboard nastavíš samostatne. Písmo editora si môžeš vybrať samostatne.'],
      ['Plán a pripomienky','Odloženie, upozornenia, čistenie','Nastavenia pripomienok, odkladania a starých plánovaných položiek.'],
      ['Bezpečnosť a prihlásenie','Účet, heslá a ochrana dát','Prehľad účtu, zmena prihlasovacieho hesla a stav E2E. Hlavné E2E heslo sa nemení. Reset prihlásenia neobnovuje kľúče.'],
      ['Dáta, súbory a zálohy','Export, import, úložisko','Zálohy sú k dispozícii. Priečinky a bezpečný prevod LOCAL ↔ SYNC vyžadujú overenie.'],
      ['Jazyk a výučba','Jazyk, slovník a slovíčka','Výber jazyka, vlastný slovník a výučba jazykov.'],
      ['Účet a zdieľanie','Používateľské meno a zdieľanie','Verejné meno slúži na zdieľanie, e-mail nie je verejný.'],
      ['O aplikácii','Verzia a informácie','Verzia a informácie o aplikácii.']
    ],
    de: [
      ['Darstellung','Design, Schrift und Symbole','Design, Schriftgröße und Symbole der Startseite.'],
      ['Editor und Tastatur','Schreiben und Editorverhalten','Tastatur und Öffnungsposition. Editor-Textanzeige und Tastenbeschriftungen lassen sich separat anpassen. Die Editor-Schriftart kann separat ausgewählt werden.'],
      ['Planung und Erinnerungen','Schlummern und Aufräumen','Erinnerungen, Schlummerfunktionen und abgelaufene Planungen.'],
      ['Sicherheit und Anmeldung','Konto und Datenschutz','Kontoübersicht, Anmeldepasswort ändern und lokaler E2E-Status. Das E2E-Hauptpasswort bleibt separat; Login-Reset stellt keine Schlüssel wieder her.'],
      ['Daten, Dateien und Backups','Export, Import, Speicher','Backups sind verfügbar. Ordner und LOCAL ↔ SYNC benötigen weitere Prüfung.'],
      ['Sprache und Lernen','Sprache und Wörterbuch','Sprache, persönliches Wörterbuch und Vokabeltraining.'],
      ['Konto und Teilen','Benutzername und Teilen','Der öffentliche Benutzername dient zum Teilen; Ihre E-Mail bleibt privat.'],
      ['Über die App','Version und Informationen','Version und Informationen zur App.']
    ],
    pl: [
      ['Wygląd','Motyw, tekst i ikony','Motyw aplikacji, rozmiar tekstu i ikony ekranu głównego.'],
      ['Edytor i klawiatura','Pisanie i działanie edytora','Klawiatura i pozycja otwierania notatki. Rozmiar tekstu w edytorze i oznaczeń klawiszy można ustawić oddzielnie. Czcionkę edytora można wybrać oddzielnie.'],
      ['Plan i przypomnienia','Drzemka i porządkowanie','Przypomnienia, odkładanie i przeterminowane elementy planu.'],
      ['Bezpieczeństwo i logowanie','Konto i ochrona danych','Stan konta, zmiana hasła logowania i stan E2E. Hasło główne E2E pozostaje oddzielne. Reset logowania nie przywraca kluczy.'],
      ['Dane, pliki i kopie','Eksport, import, pamięć','Kopie zapasowe są dostępne. Foldery i LOCAL ↔ SYNC wymagają testów.'],
      ['Język i nauka','Język, słownik i słówka','Język aplikacji, słownik i nauka języków.'],
      ['Konto i udostępnianie','Nazwa użytkownika','Publiczna nazwa służy do udostępniania. E-mail pozostaje prywatny.'],
      ['O aplikacji','Wersja i informacje','Wersja aplikacji i informacje.']
    ],
    es: [
      ['Apariencia','Tema, letra e iconos','Tema, tamaño del texto e iconos de la pantalla principal.'],
      ['Editor y teclado','Escritura y comportamiento','Teclado y posición al abrir notas. El tamaño visible del editor y de las letras del teclado se ajusta por separado. También puedes elegir el tipo de letra del editor.'],
      ['Plan y recordatorios','Posponer y limpiar','Recordatorios, aplazamientos y tareas vencidas.'],
      ['Seguridad e inicio de sesión','Cuenta y protección','Cuenta, cambio de contraseña de acceso y estado E2E local. La contraseña E2E es distinta; restablecer el acceso no restaura las claves.'],
      ['Datos, archivos y copias','Exportar, importar, almacenamiento','Las copias están disponibles. Carpetas y LOCAL ↔ SYNC requieren pruebas.'],
      ['Idioma y aprendizaje','Idioma y vocabulario','Idioma de la aplicación, diccionario y aprendizaje.'],
      ['Cuenta y compartir','Nombre de usuario','El nombre público se usa para compartir; tu correo sigue privado.'],
      ['Acerca de','Versión e información','Versión e información de la aplicación.']
    ]
  };

  // 683BR: Napoveda k jednotlivym polozkam - ne obecny text cele kategorie.
  const POLOZKOVA_NAPOVEDA = {
    cs: {
      delay: ['Rychlé odložení', 'Nastaví čtyři tlačítka v panelu připomínky. První tři volby jsou vlastní intervaly (1 až 10080 minut); čtvrtá je vždy Zítra s nastavitelným časem. Odložení se počítá od původního budoucího termínu, nebo od teď, pokud už připomínka prošla. Přesné datum a čas nastavíš přímo v panelu tlačítkem Termín.'],
      planning: ['Připomínka u nových termínů', 'Určuje výchozí zapnutí zvonku při vytváření nových plánovaných úkolů a termínů. Nezapíná zpětně upozornění existujícím položkám. Každý nový termín můžeš nastavit zvlášť.'],
      cleanup: ['Úklid po termínu', 'Po potvrzení pravidla se po nastaveném počtu dní odstraní staré NEDOKONČENÉ položky Planneru a vypnou prošlé jednorázové připomínky. Celé poznámky se nemažou, dokončené úkoly a opakované připomínky se touto funkcí neodstraňují. Volba Nikdy úklid vypne.']
    },
    en: {
      delay: ['Quick snooze', 'Sets four buttons in the reminder sheet. The first three use custom minute intervals (1–10080); the fourth always means tomorrow at a chosen time. Snoozing starts from the future due time, or now if overdue. For an exact date and time, use Date/Time in the sheet.'],
      planning: ['Reminders for new plans', 'Controls whether reminders default to on when creating new planned tasks and dates. Existing items are not changed. You can override this per item.'],
      cleanup: ['Overdue cleanup', 'After confirmation, removes old INCOMPLETE Planner items and switches off old one-time reminders after the selected days. It does not delete whole notes, completed tasks or repeating reminders. Never disables cleanup.']
    },
    sk: {
      delay: ['Rýchle odloženie', 'Štyri tlačidlá v okne pripomienky. Prvé tri voľby sú intervaly 1–10080 minút. Štvrtá je vždy Zajtra v zvolenom čase. Ak termín už prešiel, čas sa počíta od teraz. Presný dátum a čas nastavíš cez Termín.'],
      planning: ['Pripomienky pri nových termínoch', 'Určuje predvolené zapnutie pripomienky pri nových plánovaných úlohách a termínoch. Existujúce položky nemení.'],
      cleanup: ['Čistenie po termíne', 'Po potvrdení odstráni staré NEDOKONČENÉ položky Plánovača a vypne staré jednorazové pripomienky. Nemaže celé poznámky, dokončené úlohy ani opakované pripomienky. Nikdy čistenie vypne.']
    },
    de: {
      delay: ['Schnell schlummern', 'Vier Tasten im Erinnerungsfenster. Die ersten drei sind Minutenintervalle (1–10080), die vierte ist immer Morgen mit wählbarer Uhrzeit. Ist der Termin vorbei, gilt die Zeit ab jetzt. Ein genaues Datum/Uhrzeit lässt sich im Fenster einstellen.'],
      planning: ['Neue Termine erinnern', 'Legt fest, ob neue Planungen standardmäßig eine Erinnerung erhalten. Bestehende Einträge bleiben unverändert; jeder Termin ist einzeln anpassbar.'],
      cleanup: ['Überfälliges aufräumen', 'Nach Bestätigung werden alte UNERLEDIGTE Planner-Einträge entfernt und einmalige Erinnerungen deaktiviert. Ganze Notizen, erledigte Aufgaben und wiederkehrende Erinnerungen bleiben erhalten. Nie deaktiviert die Bereinigung.']
    },
    pl: {
      delay: ['Szybka drzemka', 'Cztery przyciski w oknie przypomnienia. Pierwsze trzy to interwały 1–10080 minut. Czwarta to zawsze jutro o wybranej godzinie. Po terminie czas liczy się od teraz. Dokładną datę i godzinę ustawisz w oknie.'],
      planning: ['Przypomnienia nowych terminów', 'Domyślnie włącza przypomnienia dla nowo planowanych zadań i terminów. Nie zmienia istniejących pozycji.'],
      cleanup: ['Porządki po terminie', 'Po potwierdzeniu usuwa stare NIEUKOŃCZONE pozycje Planu i wyłącza dawne jednorazowe przypomnienia. Nie usuwa całych notatek, ukończonych zadań ani przypomnień cyklicznych. Nigdy wyłącza czyszczenie.']
    },
    es: {
      delay: ['Posponer rápido', 'Cuatro botones en el recordatorio. Las tres primeras son intervalos de 1–10080 minutos. La cuarta es siempre mañana a la hora elegida. Si ya venció, se calcula desde ahora. La fecha y hora exactas se eligen en el panel.'],
      planning: ['Avisos en nuevos planes', 'Activa de forma predeterminada los avisos de nuevas tareas y fechas planificadas. No modifica elementos existentes.'],
      cleanup: ['Limpiar vencidos', 'Tras confirmar, elimina elementos ANTIGUOS E INCOMPLETOS del plan y desactiva recordatorios únicos vencidos. No borra notas enteras, tareas completadas ni recordatorios periódicos. Nunca desactiva la limpieza.']
    }
  };

  const svg = (paths) => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  const IKONY = [
    svg('<circle cx="12" cy="12" r="9"/><circle cx="7.5" cy="10" r="1"/><circle cx="11" cy="6.5" r="1"/><circle cx="16.5" cy="9" r="1"/><path d="M12.5 15c-3 1.7-1 4.5 1 4.5 3 0 4-4-1-5.4"/>'),
    svg('<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h1m3 0h1m3 0h1m3 0h1M6 12h1m3 0h1m3 0h1m3 0h1M7 16h10"/>'),
    svg('<rect x="3" y="4" width="15" height="16" rx="2"/><path d="M7 2v4m7-4v4M3 9h15"/><circle cx="17" cy="17" r="5"/><path d="M17 14v3l2 1"/>'),
    svg('<path d="m12 2 8 3v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5l8-3Z"/><rect x="9" y="11" width="6" height="5" rx="1"/><path d="M10 11V9a2 2 0 0 1 4 0v2"/>'),
    svg('<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 4 16 4 16 0V5M4 12v7c0 4 16 4 16 0v-7"/>'),
    svg('<path d="M4 5h10M9 3v3c0 6-2 9-6 12m3-8 7 8M14 13l4-9 4 9m-7-3h6"/>'),
    svg('<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M2 21v-2c0-4 3-6 7-6s7 2 7 6v2M16 15c4 0 6 2 6 6"/>'),
    svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.01"/>')
  ];
  const CONFIG = ['appearance', 'editor', 'reminders', 'security', 'data', 'language', 'sharing', 'about'];
  const puvodni = [...scroll.querySelectorAll(':scope > .settingsSection')];
  const vzhled = puvodni.find(s => s.querySelector('#openThemeModalButton'));
  const ikony = puvodni.find(s => s.classList.contains('lnToolbarSettingsSection'));
  const pripominky = puvodni.find(s => s.querySelector('#openReminderDelaySettingsButton'));
  const data = document.getElementById('dataSettingsSection');
  const oAplikaci = puvodni.find(s => s.querySelector('#settingsVersionValue'));
  if (![vzhled, ikony, pripominky, data, oAplikaci].every(Boolean)) return;

  const koren = document.createElement('div');
  koren.id = 'ln683BJAccordion';
  koren.className = 'ln683BJAccordion';
  const karty = [];
  const oblasti = {};
  const locale = () => {
    const hodnota = String(window.LubaNoteI18n?.ziskejLocale?.() || document.documentElement.lang || 'cs').slice(0,2).toLowerCase();
    return PREKLADY[hodnota] ? hodnota : 'en';
  };

  // Napoveda je skutecne samostatne tlacitko, nikoliv cast klikatelneho nadpisu.
  const napoveda = document.createElement('div');
  napoveda.className = 'ln683BJHelpOverlay';
  napoveda.hidden = true;
  napoveda.innerHTML = '<div class="ln683BJHelpBox" role="dialog" aria-modal="true" aria-labelledby="ln683BJHelpTitle"><h3 id="ln683BJHelpTitle"></h3><p id="ln683BJHelpText"></p><button type="button" id="ln683BJHelpClose">OK</button></div>';
  modal.append(napoveda);
  const zavriNapovedu = () => { napoveda.hidden = true; };
  napoveda.addEventListener('click', e => { if (e.target === napoveda) zavriNapovedu(); });
  napoveda.querySelector('#ln683BJHelpClose').addEventListener('click', zavriNapovedu);
  function otevriNapovedu(index, klicPolozky = null) {
    const polozka = klicPolozky
      ? (POLOZKOVA_NAPOVEDA[locale()] || POLOZKOVA_NAPOVEDA.cs)[klicPolozky]
      : (PREKLADY[locale()] || PREKLADY.cs)[index];
    napoveda.querySelector('#ln683BJHelpTitle').textContent = polozka[0];
    napoveda.querySelector('#ln683BJHelpText').textContent = polozka[klicPolozky ? 1 : 2];
    napoveda.hidden = false;
    napoveda.querySelector('#ln683BJHelpClose').focus();
  }

  CONFIG.forEach((typ,index) => {
    const card = document.createElement('section');
    card.className = 'ln683BJCard';
    card.dataset.ln683bjCategory = typ;
    const hlava = document.createElement('button');
    hlava.type = 'button';
    hlava.className = 'ln683BJHeading';
    hlava.setAttribute('aria-expanded','false');
    hlava.id = 'ln683BJHeading-' + typ;
    const telo = document.createElement('div');
    telo.className = 'ln683BJBody';
    telo.id = 'ln683BJBody-' + typ;
    telo.setAttribute('aria-hidden', 'true');
    telo.inert = true;
    const vnitrni = document.createElement('div');
    vnitrni.className = 'ln683BJBodyInner';
    telo.append(vnitrni);
    hlava.setAttribute('aria-controls', telo.id);
    const ikona = document.createElement('span');
    ikona.className = 'ln683BJIcon';
    ikona.innerHTML = IKONY[index];
    const texty = document.createElement('span');
    texty.className = 'ln683BJHeadingText';
    texty.innerHTML = '<strong></strong><small></small>';
    hlava.append(ikona,texty);
    const actions = document.createElement('span');
    actions.className = 'ln683BJHeadingActions';
    if (['security','data','sharing'].includes(typ)) {
      const info = document.createElement('button');
      info.type = 'button';
      info.className = 'ln683BJInfo';
      info.textContent = 'i';
      info.setAttribute('aria-label','Nápověda');
      info.addEventListener('click', () => otevriNapovedu(index));
      actions.append(info);
    }
    const headerWrap = document.createElement('div');
    headerWrap.className = 'ln683BJHeadRow';
    headerWrap.append(hlava, actions);
    card.append(headerWrap,telo);
    koren.append(card);
    karty.push({card,hlava,telo,texty,index});
    oblasti[typ] = vnitrni;
    hlava.addEventListener('click', () => {
      const otevirame = hlava.getAttribute('aria-expanded') !== 'true';
      karty.forEach(p => {
        const otevrena = otevirame && p.hlava === hlava;
        p.hlava.setAttribute('aria-expanded', String(otevrena));
        p.card.classList.toggle('ln683BJOpen', otevrena);
        p.telo.setAttribute('aria-hidden', String(!otevrena));
        p.telo.inert = !otevrena;
      });
    });
  });
  function aktualizujPreklady() {
    const preklady = PREKLADY[locale()] || PREKLADY.cs;
    karty.forEach(({texty,index}) => {
      texty.querySelector('strong').textContent = preklady[index][0];
      texty.querySelector('small').textContent = preklady[index][1];
    });
  }
  aktualizujPreklady();
  window.addEventListener('lubanote:language-change', aktualizujPreklady);

  const editorSekce = document.createElement('section');
  editorSekce.className = 'settingsSection ln683BJOriginal ln683BJEditorSection';
  const jazykSekce = document.createElement('section');
  jazykSekce.className = 'settingsSection ln683BJOriginal ln683BJLanguageSection';
  function prenes(id, doSekce) {
    const prvek = document.getElementById(id);
    const radek = prvek?.closest('.themeSetting');
    if (radek) doSekce.append(radek);
  }
  prenes('openKeyboardModeSettingsButton',editorSekce);
  prenes('openNoteOpenPositionButton',editorSekce);
  prenes('openLanguageModalButton',jazykSekce);
  prenes('openPersonalDictionaryButton',jazykSekce);
  prenes('openEnglishLearningButton',jazykSekce);

  [vzhled,ikony,pripominky,data,oAplikaci].forEach(s => s.classList.add('ln683BJOriginal'));
  oblasti.appearance.append(vzhled,ikony);
  oblasti.editor.append(editorSekce);
  oblasti.reminders.append(pripominky);
  oblasti.data.append(data);
  oblasti.language.append(jazykSekce);
  oblasti.about.append(oAplikaci);

  const planovano = document.createElement('p');
  planovano.className = 'ln683BJPlanned';
  oblasti.security.append(planovano);
  function aktualizujPlanovano() {
    const id = locale();
    planovano.textContent = ({
      cs:'Správa přihlášení, E2E hesla a biometrie bude doplněna po bezpečnostním auditu. Současné přihlášení a šifrování zůstávají beze změny.',
      en:'Account and E2E password settings will be added after a security review. Existing sign-in and encryption stay unchanged.',
      sk:'Prihlásenie a E2E heslo doplníme po bezpečnostnom audite. Existujúce šifrovanie sa nemení.',
      de:'Anmeldung und E2E-Kennwort folgen nach einer Sicherheitsprüfung. Bestehende Verschlüsselung bleibt unverändert.',
      pl:'Logowanie i hasło E2E dodamy po audycie bezpieczeństwa. Obecne szyfrowanie pozostaje bez zmian.',
      es:'Las opciones de acceso y E2E se añadirán tras una revisión. El cifrado actual no cambia.'
    })[id] || '';
  }
  aktualizujPlanovano();
  window.addEventListener('lubanote:language-change', aktualizujPlanovano);

  // Dynamicka sekce @username je vlozena sharingIdentity.js vedle #dataSettingsSection.
  // Preneseme JIZ existujici DOM uzel bez ztraty jeho listeneru, i kdyz vznikne pozdeji.
  function presunSdileni() {
    const sekce = document.getElementById('sharingIdentitySettingsSection');
    if (sekce && !oblasti.sharing.contains(sekce)) {
      sekce.classList.add('ln683BJOriginal');
      oblasti.sharing.append(sekce);
    }
  }
  presunSdileni();
  const observatorSdileni = new MutationObserver(() => presunSdileni());
  observatorSdileni.observe(scroll,{childList:true,subtree:true});

  // Rozsirené informace na kliknuti "i", nikoliv neexistujici akce.
  const radkove = [
    ['openReminderDelaySettingsButton',2,'delay'],
    ['openPlannerReminderDefaultButton',2,'planning'],
    ['openOverdueRetentionSettingsButton',2,'cleanup'],
    ['openNoteOpenPositionButton',1]
  ];
  radkove.forEach(([id,index,klicPolozky]) => {
    const radek = document.getElementById(id)?.closest('.themeSetting');
    const popisek = radek?.querySelector(':scope > span:first-child');
    if (!popisek) return;
    const info = document.createElement('button');
    info.type = 'button';
    info.className = 'ln683BJInfo ln683BJRowInfo';
    info.textContent = 'i';
    info.setAttribute('aria-label','Nápověda');
    info.addEventListener('click',e=>{e.stopPropagation();otevriNapovedu(index,klicPolozky);});
    // Info jako samostatny sibling: pri zmene jazyka i18n prepisuje textContent popisku.
    popisek.after(info);
  });

  scroll.append(koren);
  modal.classList.add('ln683BJEnabled');
  const visibility = new MutationObserver(() => {
    if (modal.hidden) {
      zavriNapovedu();
      karty.forEach(p => {
        p.hlava.setAttribute('aria-expanded','false');
        p.telo.setAttribute('aria-hidden', 'true');
        p.telo.inert = true;
        p.card.classList.remove('ln683BJOpen');
      });
    }
  });
  visibility.observe(modal,{attributes:true,attributeFilter:['hidden']});
  modal.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !napoveda.hidden) {
      e.stopPropagation();
      zavriNapovedu();
    }
  });
})();
