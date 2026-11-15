const searchNotes =
  document.getElementById("searchNotes");

const noSearchResults =
  document.getElementById("noSearchResults");

const clearSearchButton =
  document.getElementById("clearSearchButton");

const searchRow =
  searchNotes?.closest(".searchRow") || null;

function jeVyhledavaniRozsirene() {
  return Boolean(
    searchRow?.classList.contains("searchExpanded")
  );
}

function nastavRozsireneVyhledavani(rozsirene) {
  if (!searchRow) {
    return;
  }

  searchRow.classList.toggle(
    "searchExpanded",
    Boolean(rozsirene)
  );

  searchNotes?.setAttribute(
    "aria-expanded",
    rozsirene ? "true" : "false"
  );

  aktualizujTlacitkoMazaniVyhledavani();
}

// ==========================================
// OCHRANA VYHLEDÁVÁNÍ PROTI AUTOFILLU
//
// Přihlašovací údaje patří jen do loginu.
// Vyhledávání je po načtení readonly a odemkne
// se až po skutečné akci uživatele přímo v poli.
// Dokud uživatel vyhledávání neaktivuje,
// taskMatchesSearch ignoruje jakoukoli hodnotu,
// kterou by prohlížeč do inputu vložil sám.
// ==========================================

let vyhledavaniAktivovaneUzivatelem = false;

function aktualizujTlacitkoMazaniVyhledavani() {
  if (!clearSearchButton || !searchNotes) {
    return;
  }

  clearSearchButton.hidden =
    !jeVyhledavaniRozsirene() &&
    searchNotes.value.length === 0;
}

/* PATCH 619 – Empty-state je pouze stav skutečného hledání.
 * Po syncu / změně filtrů se karta může překreslit mimo search.js, proto
 * zprávu odvozujeme přímo z reálně vykreslených .taskCard. Tím se zároveň
 * na PC nepočítají prázdné masonry sloupce jako výsledky hledání. */
function aktualizujPrazdnyVysledekVyhledavani() {
  if (!noSearchResults) {
    return;
  }

  const maAktivniDotaz =
    jeAktivniVyhledavaciDotaz();

  const pocetViditelnychKaret =
    document.querySelectorAll(
      "#pinnedCards .taskCard"
    ).length;

  noSearchResults.hidden =
    !maAktivniDotaz ||
    pocetViditelnychKaret > 0;
}

function prekresliVysledkyVyhledavani() {
  // 699AN: měříme skutečnou cenu kompletního překreslení, ne délku dotazu.
  // Do diagnostiky se neposílá text ani identifikace poznámek.
  const start = performance.now();
  renderTasks();
  const renderMs = performance.now() - start;
  if (renderMs >= 100) {
    window.LubaNoteStartupDiag?.zapis?.(
      "PERF", `699AN SEARCH RENDER | ms=${Math.round(renderMs)} | apk=${window.Capacitor?.isNativePlatform?.() === true ? "Y" : "N"}`
    );
  }
  aktualizujPrazdnyVysledekVyhledavani();
}

/* 699D-AL – po ručním ověření plynulosti LubaKeyboard v APK 0.9.1283
 * nastavujeme nativní APK na 0 ms (setTimeout(0), nikoli synchronní render).
 * PC/web zůstává 200 ms. Rušení předchozího timeru a ochrany 699AM
 * zůstávají beze změny. Diagnostika nadále nabízí všech pět prodlev. */
const ODLOZENI_HLEDANI_699AN_MS =
  window.Capacitor?.isNativePlatform?.() === true ? 0 : 200;
let casovacHledani699AM = null;
// 699D-AJ: completion handshake for the real UI regression; no query content.
let pozadavekHledani699DAJ = 0;
let dokonceneHledani699DAJ = 0;
let mereniHledani699DAJ = null;
let aktivniVzorekHledani699DAJ = null;

function adminMuzeMeritHledani699DAJ() {
  try { return window.LubaNoteAdminTools?.isAllowed?.() === true; }
  catch (_error) { return false; }
}
function stavPrekresleniHledani699DAJ() {
  return { requested: pozadavekHledani699DAJ, completed: dokonceneHledani699DAJ,
    pending: casovacHledani699AM !== null };
}

function zrusOdlozeneHledani699AM() {
  const byloNaplanovano = casovacHledani699AM !== null;
  if (byloNaplanovano) clearTimeout(casovacHledani699AM);
  casovacHledani699AM = null;
  return byloNaplanovano;
}

function naplanujOdlozeneHledani699AM() {
  const nahrazuje = zrusOdlozeneHledani699AM();
  const cislo = ++pozadavekHledani699DAJ;
  // Diagnostic override only while its explicit admin panel is open.
  const m = mereniHledani699DAJ && adminMuzeMeritHledani699DAJ()
    && !document.hidden && vyhledavaniAktivovaneUzivatelem ? mereniHledani699DAJ : null;
  const prodleva = m ? m.delay : ODLOZENI_HLEDANI_699AN_MS;
  const zadano = m ? performance.now() : 0;
  const epoch = m?.epoch;
  const group = m?.group(prodleva);
  if (m) {
    group.inputs++;
    if (nahrazuje && m.pending === cislo - 1 && m.pendingGroup === group) group.superseded++;
    m.pending = cislo;
    m.pendingGroup = group;
  }
  casovacHledani699AM = setTimeout(() => {
    casovacHledani699AM = null;
    const merit = m && mereniHledani699DAJ === m && epoch === m.epoch &&
      !document.hidden && adminMuzeMeritHledani699DAJ();
    if (m?.pending === cislo) { m.pending = 0; m.pendingGroup = null; }
    const drag = window.LubaNoteCardDrag?.jeAktivni?.() === true;
    const vzorek = merit ? { wait: performance.now() - zadano, filter: 0, calls: 0,
      hits: 0, render: 0, total: 0, cards: 0, frame: null } : null;
    const start = merit ? performance.now() : 0;
    if (vzorek) aktivniVzorekHledani699DAJ = vzorek;
    try {
      prekresliVysledkyVyhledavani();
      // renderTasks can defer while a drag is active. Never report that as
      // completed; the regression will time out rather than pass stale DOM.
      if (!drag) dokonceneHledani699DAJ = cislo;
    } catch (error) {
      if (vzorek) { group.errors++; m.update(); }
      throw error;
    } finally { aktivniVzorekHledani699DAJ = null; }
    if (!vzorek) return;
    if (drag) { group.deferred++; m.update(); return; }
    vzorek.render = performance.now() - start;
    vzorek.total = performance.now() - zadano;
    vzorek.cards = document.querySelectorAll('#pinnedCards .taskCard').length;
    group.samples.push(vzorek);
    if (group.samples.length > 120) group.samples.shift();
    m.update();
    // Two RAF callbacks bracket a potential paint; not physical display latency.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (mereniHledani699DAJ !== m || epoch !== m.epoch || !adminMuzeMeritHledani699DAJ() ||
          pozadavekHledani699DAJ !== cislo || document.hidden) return;
      vzorek.frame = performance.now() - zadano;
      m.update();
    }));
  }, prodleva);
}

function aktivujVyhledavaniUzivatelem() {
  if (!searchNotes) {
    return;
  }

  if (!vyhledavaniAktivovaneUzivatelem) {
    /*
     * Pokud prohlížeč ještě před kliknutím vložil
     * do pole e-mail nebo jiný autofill, zahodíme ho.
     */
    searchNotes.value = "";
  }

  vyhledavaniAktivovaneUzivatelem = true;
  searchNotes.readOnly = false;
}

function pripravVyhledavaniPoKliknuti() {
  if (!searchNotes) {
    return;
  }

  /*
   * PATCH 658CF – na mobilu se hledání po klepnutí roztáhne
   * přes celou dostupnou šířku a dočasně překryje akční ikony.
   */
  nastavRozsireneVyhledavani(true);

  /*
   * Kliknutí pouze připraví input pro psaní.
   * Ještě NEŘÍKÁME, že uživatel něco napsal.
   *
   * Chrome tak nemůže svůj autofill vydávat
   * za skutečný dotaz uživatele.
   */
  if (!vyhledavaniAktivovaneUzivatelem) {
    searchNotes.value = "";
  }

  searchNotes.readOnly = false;
}

function zajistiCisteNeaktivniVyhledavani() {
  if (!searchNotes) {
    return;
  }

  if (vyhledavaniAktivovaneUzivatelem) {
    return;
  }

  searchNotes.value = "";

  /*
   * Pokud je uživatel právě uvnitř vyhledávání,
   * necháme pole odemčené pro psaní.
   *
   * Autofill se tak smaže, ale uživateli
   * nezavřeme pole pod rukama.
   */
  searchNotes.readOnly =
    document.activeElement !== searchNotes;

  noSearchResults.hidden = true;
  aktualizujTlacitkoMazaniVyhledavani();
}

function jeAktivniVyhledavaciDotaz() {
  return Boolean(
    vyhledavaniAktivovaneUzivatelem &&
    searchNotes &&
    searchNotes.value.trim().length > 0
  );
}

/*
 * PATCH 539 – Skryté musí zůstat dohledatelné.
 * Filtr Skryté se na tento malý veřejný kontrakt ptá místo toho,
 * aby četl hodnotu inputu bez ochrany proti browser autofillu.
 */
window.LubaNoteSearch =
  window.LubaNoteSearch || {};
window.LubaNoteSearch.jeAktivniDotaz =
  jeAktivniVyhledavaciDotaz;
window.LubaNoteSearch.aktualizujPrazdnyVysledek =
  aktualizujPrazdnyVysledekVyhledavani;
window.LubaNoteSearch.stavPrekresleni = stavPrekresleniHledani699DAJ;

/* Render karet probíhá i ze sync/shared vrstev. MutationObserver zde pouze
 * přepočítá zprávu; data ani render nikdy nespouští, takže nevytváří loop. */
const kontejnerKaretProEmptyState =
  document.getElementById("pinnedCards");

if (
  kontejnerKaretProEmptyState &&
  typeof MutationObserver === "function"
) {
  new MutationObserver(() => {
    aktualizujPrazdnyVysledekVyhledavani();
  }).observe(kontejnerKaretProEmptyState, {
    childList: true,
    subtree: true
  });
}

function taskMatchesSearch(task) {
  /*
   * Bez výslovné akce uživatele vyhledávání
   * nikdy nesmí filtrovat karty. Toto je hlavní
   * pojistka proti browser/password-manager autofillu.
   */
  if (!vyhledavaniAktivovaneUzivatelem) {
    return true;
  }

  const searchText =
    searchNotes.value
      .trim()
      .toLowerCase();

  if (!searchText) {
    return true;
  }

  const vzorek = aktivniVzorekHledani699DAJ;
  if (!vzorek) return odpovidaHledanemuTextu699DAJ(task, searchText);
  const start = performance.now();
  const shoda = odpovidaHledanemuTextu699DAJ(task, searchText);
  vzorek.filter += performance.now() - start;
  vzorek.calls++;
  if (shoda) vzorek.hits++;
  return shoda;
}

// Same text matching semantics; also used by RAM-only scaling comparison.
function odpovidaHledanemuTextu699DAJ(task, searchText) {
  const title =
    (task.title || "").toLowerCase();

  const note =
    (task.note || "").toLowerCase();

  const todos =
    (task.todos || [])
      .map((todo) => todo.text || "")
      .join(" ")
      .toLowerCase();

  return (
    title.includes(searchText) ||
    note.includes(searchText) ||
    todos.includes(searchText)
  );
}

/*
 * Myš / dotyk: odemkneme pole ještě před focusem.
 * Klávesnice: při Tabu zůstane readonly, první
 * klávesa ho odemkne ještě před vložením znaku.
 */
searchNotes.addEventListener(
  "pointerdown",
  pripravVyhledavaniPoKliknuti
);

/* 683AM: v kompaktnim mobilnim radku zustava lupicka klikatelna,
   i kdyz nove tlacitko zmensi samotnou textovou cast hledani. */
searchRow?.querySelector(".searchIcon")?.addEventListener("pointerdown", (event) => {
  // 683AQ: dotyk na ikone nesmi po focusu textoveho pole vyvolat blur.
  // Jinak se prazdne hledani hned sbali a pouze problikne.
  if (event.cancelable) event.preventDefault();
  pripravVyhledavaniPoKliknuti();
  searchNotes.focus();
});

searchNotes.addEventListener(
  "keydown",
  (event) => {
    /* Textarea je použita schválně: Chrome Password Manager ji
       neklasifikuje jako přihlašovací textové pole. Enter však
       nesmí vytvořit nový řádek ve vyhledávání. */
    if (event.key === "Enter") {
      event.preventDefault();
    }

    aktivujVyhledavaniUzivatelem();
  }
);

/*
 * Mobilní klávesnice nemusí vždy poslat keydown.
 * Skutečné psaní ale pošle beforeinput.
 *
 * Chrome autofill typicky používá jinou cestu,
 * takže ho tím neoznačíme jako uživatelské psaní.
 */
searchNotes.addEventListener(
  "beforeinput",
  (event) => {
    if (
      event.inputType === "insertText" ||
      event.inputType === "insertCompositionText" ||
      event.inputType === "insertFromPaste"
    ) {
      aktivujVyhledavaniUzivatelem();
    }
  }
);

searchNotes.addEventListener("input", () => {
  if (!vyhledavaniAktivovaneUzivatelem) {
    zajistiCisteNeaktivniVyhledavani();
    aktualizujTlacitkoMazaniVyhledavani();
    naplanujOdlozeneHledani699AM();
    return;
  }

  // Text a krizkovy ovladac se meni hned; drahy render karet az po pauze.
  aktualizujTlacitkoMazaniVyhledavani();
  naplanujOdlozeneHledani699AM();
});

function zavriVyhledavaniKrizkem699AM() {
  if (!searchNotes) return;
  const byloVyhledavaniAktivni = vyhledavaniAktivovaneUzivatelem;
  const meloText = searchNotes.value.length > 0;
  const bylCekajiciRender = zrusOdlozeneHledani699AM();

  searchNotes.value = "";
  vyhledavaniAktivovaneUzivatelem = false;
  searchNotes.readOnly = true;

  // 540/699AM – schovat klavesnici JESTE pred blur, ktery jinak prazdne
  // hledani sbali a odebere krizek z DOM pred dorucenim udalosti click.
  window.LubaNoteKeyboard?.skryj?.();
  searchNotes.blur();
  nastavRozsireneVyhledavani(false);
  clearSearchButton.hidden = true;

  // Pokud nebyl zadany jediny znak, nebyl zadny filtr ani duvod znovu
  // renderovat vsechny karty – pri zavreni prazdneho hledani jen schovat IME.
  if (byloVyhledavaniAktivni || meloText || bylCekajiciRender) {
    prekresliVysledkyVyhledavani();
  } else {
    aktualizujPrazdnyVysledekVyhledavani();
  }
}

// Na Android WebView pointerdown predchazi automatickemu blur textoveho pole.
// Zavreni provedeme uz zde – necekame na click, ktery se pri prazdnem poli
// mohl ztratit, protoze blur mezitim skryl tlacitko.
clearSearchButton?.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  if (event.cancelable) event.preventDefault();
  zavriVyhledavaniKrizkem699AM();
});

// Fallback pro Enter/Space, pristupnost a programove vyvolany click.
clearSearchButton?.addEventListener("click", () => {
  if (!jeVyhledavaniRozsirene() &&
      !vyhledavaniAktivovaneUzivatelem && !searchNotes.value) return;
  zavriVyhledavaniKrizkem699AM();
});

/*
 * Jakmile uživatel opustí prázdné vyhledávání,
 * ochranu znovu zapneme. Prohlížeč tak nemá
 * dlouhodobě otevřené textové pole pro autofill.
 */
searchNotes.addEventListener("blur", () => {
  if (searchNotes.value.trim()) {
    return;
  }

  // Pri odchodu z prazdneho pole nesmi zustat cekat render starych vysledku.
  const bylCekajiciRender = zrusOdlozeneHledani699AM();
  vyhledavaniAktivovaneUzivatelem = false;
  searchNotes.readOnly = true;
  nastavRozsireneVyhledavani(false);
  if (bylCekajiciRender) prekresliVysledkyVyhledavani();
});

/* 696U: On a cold load script.js has already rendered the cards once.
 * pageshow(persisted=false) must not synchronously rebuild the entire list.
 * BFCache restores and any previously user-activated search still need the
 * old redraw so stale search filters cannot survive a navigation.
 */
window.addEventListener("pageshow", (event) => {
  zrusOdlozeneHledani699AM();
  const bylAktivniDotaz696U = vyhledavaniAktivovaneUzivatelem;
  vyhledavaniAktivovaneUzivatelem = false;
  nastavRozsireneVyhledavani(false);
  zajistiCisteNeaktivniVyhledavani();
  if (event.persisted === true || bylAktivniDotaz696U) {
    prekresliVysledkyVyhledavani();
  } else {
    aktualizujPrazdnyVysledekVyhledavani();
    window.LubaNoteStartupDiag?.zapis?.(
      "PERF", "696U SEARCH FIRST PAGESHOW | no duplicate cards render"
    );
  }
});

/*
 * Návrat do aplikace z jiné záložky / pozadí.
 * Pokud uživatel zrovna nemá aktivní vlastní dotaz,
 * odstraníme případný pozdní autofill bez timeoutů.
 */
document.addEventListener("visibilitychange", () => {
  if (
    document.visibilityState === "visible" &&
    !vyhledavaniAktivovaneUzivatelem
  ) {
    // 685N: pri neaktivnim hledani zbytecny renderTasks() prekresloval
    // cely strom poznamek pri kazdem navratu Android WebView z pozadi.
    // Vymazani pripadneho autofillu zustava; seznam se nemusi menit,
    // protoze aktivni hledaci filtr zde neexistuje.
    zajistiCisteNeaktivniVyhledavani();
    const androidWebView685N = /Android/i.test(navigator.userAgent || "") &&
      /(?:; wv\)|\bwv\b)/i.test(navigator.userAgent || "");
    if (androidWebView685N) {
      aktualizujPrazdnyVysledekVyhledavani();
    } else {
      prekresliVysledkyVyhledavani();
    }
  }
});


/* ==========================================
   SECRET – VYČIŠTĚNÍ HLEDÁNÍ PŘI ZAMKNUTÍ
   ========================================== */

function vycistiVyhledavaniPoZamknutiTajnehoRezimu() {
  if (!searchNotes) {
    return;
  }

  zrusOdlozeneHledani699AM();
  searchNotes.value = "";
  searchNotes.readOnly = true;
  vyhledavaniAktivovaneUzivatelem = false;
  nastavRozsireneVyhledavani(false);

  if (noSearchResults) {
    noSearchResults.hidden = true;
  }

  aktualizujTlacitkoMazaniVyhledavani();
}


/* ==========================================
   ZVÝRAZNĚNÍ HLEDANÉHO TEXTU PO OTEVŘENÍ KARTY
   ========================================== */

const LUBANOTE_SEARCH_HIGHLIGHT = "lubanote-search-hit";

function ziskejAktivniHledanyText() {
  if (
    !vyhledavaniAktivovaneUzivatelem ||
    !searchNotes
  ) {
    return "";
  }

  return searchNotes.value.trim();
}

function zrusZvyrazneniVyhledavaniVEditoru() {
  if (
    window.CSS?.highlights &&
    typeof CSS.highlights.delete === "function"
  ) {
    CSS.highlights.delete(
      LUBANOTE_SEARCH_HIGHLIGHT
    );
  }

  const titleInput =
    document.getElementById("modalTitle");

  titleInput?.classList.remove(
    "searchTitleMatch"
  );
}

function najdiRozsahyTextuProVyhledavani(
  container,
  hledanyText
) {
  if (!container || !hledanyText) {
    return [];
  }

  const textNodes = [];
  let spojenyText = "";

  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT
  );

  let node = walker.nextNode();

  while (node) {
    const value = node.nodeValue || "";

    if (value) {
      textNodes.push({
        node,
        start: spojenyText.length,
        end: spojenyText.length + value.length
      });

      spojenyText += value;
    }

    node = walker.nextNode();
  }

  if (!spojenyText) {
    return [];
  }

  const haystack = spojenyText.toLocaleLowerCase("cs-CZ");
  const needle = hledanyText.toLocaleLowerCase("cs-CZ");

  if (!needle) {
    return [];
  }

  const ranges = [];
  let searchFrom = 0;

  while (searchFrom <= haystack.length - needle.length) {
    const matchStart = haystack.indexOf(
      needle,
      searchFrom
    );

    if (matchStart === -1) {
      break;
    }

    const matchEnd = matchStart + needle.length;

    const startInfo = textNodes.find(info =>
      matchStart >= info.start &&
      matchStart < info.end
    );

    const endInfo = [...textNodes]
      .reverse()
      .find(info =>
        matchEnd > info.start &&
        matchEnd <= info.end
      );

    if (startInfo && endInfo) {
      const range = document.createRange();

      range.setStart(
        startInfo.node,
        matchStart - startInfo.start
      );

      range.setEnd(
        endInfo.node,
        matchEnd - endInfo.start
      );

      ranges.push(range);
    }

    searchFrom = matchStart + needle.length;
  }

  return ranges;
}

function zvyrazniAktualniVyhledavaniVEditoru() {
  zrusZvyrazneniVyhledavaniVEditoru();

  const hledanyText =
    ziskejAktivniHledanyText();

  // 699AP: při otevření poznámky z hlavního hledání se dočasně
  // zviditelní i text pod sbaleným Bulletem; po zavření se stav vrátí.
  window.LubaNoteEditorFind?.nastavDocasneRozbaleni?.("hlavni", Boolean(hledanyText));

  if (!hledanyText) {
    return;
  }

  const titleInput =
    document.getElementById("modalTitle");

  const editorCoreV2 =
    window.LubaNoteEditorV2?.ziskejEditorElement?.() || null;

  const hledanyTextLower =
    hledanyText.toLocaleLowerCase("cs-CZ");

  const textNazvu = titleInput
    ? String(
        "value" in titleInput
          ? titleInput.value
          : titleInput.textContent || ""
      )
    : "";

  if (
    textNazvu
      .toLocaleLowerCase("cs-CZ")
      .includes(hledanyTextLower)
  ) {
    /*
     * U shody v názvu zvýrazníme bezpečně celé pole bez zásahu
     * do jeho hodnoty nebo pozice kurzoru.
     */
    titleInput.classList.add(
      "searchTitleMatch"
    );
  }

  const ranges = [];

  if (editorCoreV2) {
    ranges.push(
      ...najdiRozsahyTextuProVyhledavani(
        editorCoreV2,
        hledanyText
      )
    );
  }

  if (
    ranges.length > 0 &&
    window.CSS?.highlights &&
    typeof Highlight !== "undefined"
  ) {
    CSS.highlights.set(
      LUBANOTE_SEARCH_HIGHLIGHT,
      new Highlight(...ranges)
    );
  }

  const firstRange = ranges[0];

  if (!firstRange) {
    return;
  }

  const firstElement =
    firstRange.startContainer.parentElement;

  requestAnimationFrame(() => {
    firstElement?.scrollIntoView({
      block: "center",
      behavior: "smooth"
    });
  });
}

window.ziskejAktivniHledanyText =
  ziskejAktivniHledanyText;

window.zrusZvyrazneniVyhledavaniVEditoru =
  zrusZvyrazneniVyhledavaniVEditoru;

window.zvyrazniAktualniVyhledavaniVEditoru =
  zvyrazniAktualniVyhledavaniVEditoru;


/* 699D-AK – guided/manual and automatic search benchmark, admin only.
   In-memory measurements; no explicit writes to notes, storage or server.
   Automated inputs are synthetic; actual keyboard responsiveness is manual. */
(() => {
  const volby = [0, 100, 200, 350, 550];
  const fmt = v => Number.isFinite(v) ? v.toFixed(1) : 'N/A';
  function stats(values) {
    const valid = values.filter(Number.isFinite).sort((a,b)=>a-b);
    if (!valid.length) return 'N/A';
    return `${fmt(valid.reduce((a,b)=>a+b,0)/valid.length)}/${fmt(valid[Math.ceil(valid.length*.95)-1])}/${fmt(valid.at(-1))}`;
  }
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  function groupFor(groups, delay) {
    if (!groups.has(delay)) groups.set(delay,{inputs:0,superseded:0,deferred:0,errors:0,interrupted:0,samples:[],lag:[],rounds:0});
    return groups.get(delay);
  }
  function invalidate(m) {
    if (m.pendingGroup && m.pending === pozadavekHledani699DAJ && casovacHledani699AM !== null) {
      m.pendingGroup.interrupted++;
    }
    m.epoch++;
    m.pending = 0;
    m.pendingGroup = null;
  }
  function owns(run) {
    return run && run.expected !== null && vyhledavaniAktivovaneUzivatelem && searchNotes.value === run.expected;
  }
  function restore(m) {
    const run = m.restoreRun;
    if (!run) return;
    m.restoreRun = null;
    if (owns(run)) zavriVyhledavaniKrizkem699AM();
    run.expected = null;
  }
  function stopAuto(m, reason, deferRestore = document.hidden) {
    const run = m.run;
    if (!run) return;
    invalidate(m);
    m.run = null;
    m.autoState = 'INTERRUPTED';
    m.delay = ODLOZENI_HLEDANI_699AN_MS;
    m.notice = reason;
    if (owns(run)) {
      zrusOdlozeneHledani699AM(); // only a query created by this diagnostic
      m.restoreRun = run;
      if (!deferRestore) restore(m);
    }
  }
  function close() {
    const m = mereniHledani699DAJ;
    if (!m) return;
    mereniHledani699DAJ = null;
    stopAuto(m, 'Test ukončen.');
    // For a true unload there is no usable page to restore. If the page is
    // still visible (e.g. opening another diagnostics panel), restore now.
    if (!document.hidden) restore(m);
    m.panel.remove();
  }
  function visible(el) {
    return !!el && !el.hidden && el.getClientRects().length > 0;
  }
  function safeScreen() {
    return !document.hidden && adminMuzeMeritHledani699DAJ() &&
      visible(searchNotes) && visible(document.getElementById('pinnedCards')) &&
      !visible(document.getElementById('taskModal')) &&
      !document.body.classList.contains('secretModeActive') &&
      ![...document.querySelectorAll('[aria-modal="true"]')].some(visible) &&
      window.LubaNoteCardDrag?.jeAktivni?.() !== true;
  }
  async function runAuto(m) {
    if (m.run || mereniHledani699DAJ !== m) return;
    if (!safeScreen() || jeAktivniVyhledavaciDotaz() || searchNotes.value ||
        jeVyhledavaniRozsirene() || casovacHledani699AM !== null) {
      m.notice = 'Otevři seznam poznámek, ukonči hledání křížkem a zavři ostatní okna.';
      m.update(); return;
    }
    invalidate(m);
    m.autoGroups.clear();
    m.autoState = 'RUNNING';
    m.notice = '';
    const run = {expected:null};
    m.run = run;
    const order = [ODLOZENI_HLEDANI_699AN_MS, ...volby.filter(v=>v!==ODLOZENI_HLEDANI_699AN_MS)];
    m.autoOrder = order;
    const check = () => {
      if (mereniHledani699DAJ !== m || m.run !== run || !safeScreen()) throw Error('interrupted');
      if (run.expected === null ? !!searchNotes.value : !owns(run)) throw Error('search_changed');
    };
    try {
      for (const [i,delay] of order.entries()) {
        check();
        m.delay = delay;
        m.progress = `${i+1}/${order.length} · ${delay} ms`;
        const g = m.group(delay);
        m.update();
        // Same two prefixes and target cadence for every delay. No actual
        // key presses or IME are generated, and no user's query is reused.
        for (const [word,cadence] of [['práce',180],['termín',300]]) {
          check();
          const base = performance.now();
          for (let n=1;n<=word.length;n++) {
            const target = base + (n-1)*cadence;
            if (n>1) await pause(Math.max(0,target-performance.now()));
            check();
            g.lag.push(Math.max(0,performance.now()-target));
            aktivujVyhledavaniUzivatelem();
            // Do not focus the real input or launch the mobile keyboard.
            run.expected = word.slice(0,n);
            searchNotes.value = run.expected;
            searchNotes.dispatchEvent(new Event('input',{bubbles:true}));
          }
          const expected = pozadavekHledani699DAJ;
          const deadline = performance.now()+8000;
          do {
            await pause(50); check();
            if (pozadavekHledani699DAJ !== expected) throw Error('search_changed');
            if (performance.now()>deadline) throw Error('render_timeout');
          } while (casovacHledani699AM !== null || dokonceneHledani699DAJ !== expected);
          // Allow the existing two-frame proxy to complete before clearing.
          await pause(100); check();
          g.rounds++;
          zavriVyhledavaniKrizkem699AM();
          run.expected = null;
          await pause(150); check();
        }
      }
      m.autoState = 'COMPLETE';
      m.notice = 'Hotovo. Zkopíruj report. Pro ověření klávesnice zkus ještě ruční psaní.';
      m.run = null;
      m.delay = ODLOZENI_HLEDANI_699AN_MS;
      m.update();
    } catch (error) {
      if (m.run !== run) return; // Already stopped by a real user action or lifecycle event.
      stopAuto(m, error?.message === 'render_timeout' ?
        'Test nedokončen: čekání na vykreslení. Zkopíruj částečný report.' :
        'Test přerušen. Částečný report zůstal, celý test můžeš spustit znovu.');
      m.update();
    }
  }
  function open() {
    if (!adminMuzeMeritHledani699DAJ() || !searchNotes) return false;
    if (mereniHledani699DAJ) return true;
    const panel = document.createElement('section');
    panel.id = 'ln-search-benchmark-699daj';
    panel.setAttribute('aria-label','Výkon hledání');
    // Keep the diagnostic independently readable under custom themes.
    panel.style.cssText = 'position:fixed;z-index:2147483602;top:100px;right:8px;width:min(310px,calc(100vw - 16px));box-sizing:border-box;max-height:55vh;overflow:auto;padding:9px;border:1px solid #629a83;border-radius:12px;background:#172c24;color:#e5fff0;font:13px/1.3 system-ui;box-shadow:0 4px 16px #0006';
    panel.innerHTML = `<div data-drag style="touch-action:none;cursor:move;font-weight:700;padding:6px 0">⠿ Výkon hledání · 699D-AK</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin:6px 0"><button type="button" data-auto>▶ Spustit celý test</button><button type="button" data-stop disabled>Zastavit</button></div>
      <small>Automaticky porovná 5 prodlev na skutečných kartách. Během testu nepiš ani neklikej mimo panel.</small>
      <div data-status style="white-space:pre-line;margin:6px 0" role="status"></div>
      <div><strong>Ruční ověření klávesnice (volitelné)</strong></div><div data-delays style="display:flex;flex-wrap:wrap;gap:4px;margin:6px 0"></div>
      <small>Vyber prodlevu, napiš běžný dotaz a ověř plynulost. Před změnou prodlevy ukonči hledání křížkem.</small>
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px"><button type="button" data-ram>RAM 100/500/1000</button><button type="button" data-copy>Kopírovat report</button><button type="button" data-close>Zavřít</button></div>`;
    const groups = new Map();
    const buttons = new Map();
    const m = {
      panel, delay: ODLOZENI_HLEDANI_699AN_MS, groups, autoGroups:new Map(), autoOrder:[],
      pending: 0, pendingGroup:null, epoch:0, ram: [], run:null, restoreRun:null,
      autoState:'NOT_RUN', notice:'', progress:'',
      group(delay) { return groupFor(m.run ? m.autoGroups : groups,delay); },
      update() {
        if (mereniHledani699DAJ !== m) return;
        if (!adminMuzeMeritHledani699DAJ()) { close(); return; }
        const g = (m.run ? m.autoGroups : groups).get(m.delay), last = g?.samples.at(-1);
        panel.querySelector('[data-status]').textContent =
          (m.run ? `Automatický test ${m.progress}` : `Ruční prodleva: ${m.delay} ms`) +
          (g ? `\n${g.samples.length} renderů / ${g.inputs} vstupů` : '') +
          (last ? `\nČekání ${fmt(last.wait)} · render ${fmt(last.render)} ms\nCelkem ${fmt(last.total)} ms · ${last.cards} karet` : '') +
          (m.notice ? `\n${m.notice}` : '') + (m.ram.length ? '\nRAM měření hotovo.' : '');
        for (const [delay,button] of buttons) {
          button.setAttribute('aria-pressed',String(delay===m.delay));
          button.disabled = !!m.run;
        }
        for (const selector of ['[data-auto]','[data-ram]','[data-copy]']) panel.querySelector(selector).disabled = !!m.run;
        panel.querySelector('[data-stop]').disabled = !m.run;
      }
    };
    function buttonStyle(button) {
      button.style.cssText='min-height:36px;padding:4px 8px;background:#284b3a;color:#ecfff3;border:1px solid #689680;border-radius:7px;font:inherit';
    }
    for (const delay of volby) {
      const button = document.createElement('button'); button.type='button'; button.textContent=String(delay);
      buttonStyle(button); buttons.set(delay,button);
      button.addEventListener('click',()=>{ if (!adminMuzeMeritHledani699DAJ()) return close();
        if (casovacHledani699AM !== null || jeAktivniVyhledavaciDotaz()) {
          panel.querySelector('[data-status]').textContent='Nejprve ukonči hledání křížkem.'; return;
        }
        if (m.run) return;
        m.delay=delay;m.notice='';m.update(); });
      panel.querySelector('[data-delays]').append(button);
    }
    const drag = panel.querySelector('[data-drag]');
    let move = null;
    drag.addEventListener('pointerdown',e=>{const r=panel.getBoundingClientRect();move={id:e.pointerId,x:e.clientX-r.left,y:e.clientY-r.top};drag.setPointerCapture(e.pointerId);e.preventDefault();});
    drag.addEventListener('pointermove',e=>{if(move?.id!==e.pointerId)return;panel.style.right='auto';panel.style.left=`${Math.max(-panel.offsetWidth+50,Math.min(innerWidth-50,e.clientX-move.x))}px`;panel.style.top=`${Math.max(0,Math.min(innerHeight-40,e.clientY-move.y))}px`;});
    for(const ev of ['pointerup','pointercancel','lostpointercapture']) drag.addEventListener(ev,()=>{move=null;});
    panel.querySelectorAll('button').forEach(buttonStyle);
    // Keep focus in the real search until a deliberate panel action. Clicking
    // measurement controls must not type into or modify a user's search.
    panel.querySelector('[data-close]').addEventListener('click',close);
    panel.querySelector('[data-auto]').addEventListener('click',()=>{void runAuto(m);});
    panel.querySelector('[data-stop]').addEventListener('click',()=>{stopAuto(m,'Test zastaven. Částečný report zůstal.');m.update();});
    panel.querySelector('[data-ram]').addEventListener('click',()=>{
      if (!adminMuzeMeritHledani699DAJ()) return close();
      if (casovacHledani699AM !== null || jeAktivniVyhledavaciDotaz()) {panel.querySelector('[data-status]').textContent='Nejprve ukonči hledání křížkem.';return;}
      const body = ('Modelovy text poznamky s ukolem a terminem. '.repeat(80));
      m.ram = [100,500,1000].map(count=>{
        const fixture = Array.from({length:count},(_,i)=>({title:`Test ${i}`,note:body+(i%10===0?' marker699daj':''),todos:Array.from({length:6},()=>({text:'modelovy ukol'}))}));
        const run=()=>{let hits=0;for(const task of fixture)if(odpovidaHledanemuTextu699DAJ(task,'marker699daj'))hits++;return hits;};
        run();run();const ms=[];let hits=0;
        for(let i=0;i<12;i++){const t=performance.now();hits=run();ms.push(performance.now()-t);}
        return {count, hits, ms:stats(ms)};
      });m.update();
    });
    panel.querySelector('[data-copy]').addEventListener('click',async()=>{
      if (!adminMuzeMeritHledani699DAJ()) return close();
      if (m.run) return;
      const lines=['LUBANOTE SEARCH / 699D-AK',`build=${window.LUBANOTE_VERSION||'?'} default=${ODLOZENI_HLEDANI_699AN_MS}ms`,
        'Actual renderTasks calls; times avg/p95/max ms. Filter is nested in render. Frame is a two-rAF proxy, may be missing. Cards are DOM count. No query, IDs or note content in report.',
        '0ms = setTimeout(0); current filters/data may change; background measurements are excluded.',
        `AUTO_STATE=${m.autoState} ORDER=${m.autoOrder.join(',')}`,
        'AUTO: synthetic DOM input, two bursts (5/6 chars, target 180/300ms). inputLag = scheduler delay proxy, not keyboard latency.'];
      function appendGroups(mode,map) {
        for(const [delay,g] of [...map].sort((a,b)=>a[0]-b[0])){
          const samples=g.samples;lines.push(`${mode} DELAY=${delay} inputs=${g.inputs} superseded=${g.superseded} rendered=${samples.length} deferred=${g.deferred} errors=${g.errors} interrupted=${g.interrupted} rounds=${g.rounds}`);
          for(const name of ['wait','filter','render','total','frame'])lines.push(` ${name}=${stats(samples.map(s=>s[name]))} n=${samples.filter(s=>Number.isFinite(s[name])).length}`);
          if(mode==='AUTO')lines.push(` inputLag=${stats(g.lag)} n=${g.lag.length}`);
          lines.push(` calls=${samples.map(s=>s.calls).join(',')} hits=${samples.map(s=>s.hits).join(',')} cards=${samples.map(s=>s.cards).join(',')}`);
        }
      }
      appendGroups('AUTO',m.autoGroups);
      lines.push('MANUAL: actual input; physical typing experience must be judged by user.');
      appendGroups('MANUAL',groups);
      lines.push('RAM: synthetic text match only, no cards, no storage. 12 runs per size.');
      for(const r of m.ram)lines.push(`RAM count=${r.count} hits=${r.hits} matchMs=${r.ms}`);
      try{await navigator.clipboard.writeText(lines.join('\n'));panel.querySelector('[data-status]').textContent='Report zkopírován.';}
      catch(_error){const area=document.createElement('textarea');area.value=lines.join('\n');area.readOnly=true;area.style.cssText='width:100%;height:120px';panel.append(area);area.select();try{if(document.execCommand('copy')){area.remove();panel.querySelector('[data-status]').textContent='Report zkopírován.';}}catch(_){}}
    });
    mereniHledani699DAJ=m;document.body.append(panel);m.update();return true;
  }
  window.LubaNoteSearchBenchmark699DAJ=Object.freeze({open,close});
  function suspend() {
    const m = mereniHledani699DAJ;
    if (!m) return;
    m.panel.hidden = true;
    if (m.run) stopAuto(m,'Test přerušen přechodem na pozadí. Částečný report zůstal.',true);
    else invalidate(m);
  }
  function resume() {
    const m = mereniHledani699DAJ;
    if (!m || document.hidden) return;
    if (!adminMuzeMeritHledani699DAJ()) return close();
    restore(m);
    m.panel.hidden = false;
    // Rotation/resize while backgrounded must not leave the drag handle unreachable.
    const r = m.panel.getBoundingClientRect();
    if (r.top > innerHeight-40 || r.left > innerWidth-50 || r.right < 50) {
      m.panel.style.left='auto';m.panel.style.right='8px';m.panel.style.top='100px';
    }
    m.update();
  }
  window.addEventListener('pagehide',event=>{if(event.persisted) suspend();else close();});
  window.addEventListener('pageshow',resume);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();else resume();});
  // An actual user action outside the panel interrupts the controlled replay
  // before it can overwrite the user's search or act on a stale test screen.
  function userAction(event) {
    const m = mereniHledani699DAJ;
    if (!m?.run || !event.isTrusted || m.panel.contains(event.target)) return;
    stopAuto(m,'Test přerušen tvým ovládáním. Částečný report zůstal.');
    m.update();
  }
  document.addEventListener('pointerdown',userAction,true);
  document.addEventListener('keydown',userAction,true);
  searchNotes?.addEventListener('input',event=>{
    const m=mereniHledani699DAJ;
    if (!m?.run || (!event.isTrusted && owns(m.run))) return;
    stopAuto(m,'Test přerušen změnou hledání. Částečný report zůstal.');
    m.update();
  },true);
})();
