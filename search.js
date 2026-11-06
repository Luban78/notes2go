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

/* 699AN – 200 ms pro PC (rychle vykreslování), 550 ms pro nativní APK.
 * Při typickém psaní na mobilu je prodleva mezi znaky často přes 200 ms:
 * předchozí časovač spouštěl celý render karet mezi jednotlivými klávesami.
 * Text vstupuje do pole okamžitě, přepočet výsledků běží po pauze.
 * Vždy se ruší předchozí timer; ochrany 699AM zůstávají. */
const ODLOZENI_HLEDANI_699AN_MS =
  window.Capacitor?.isNativePlatform?.() === true ? 550 : 200;
let casovacHledani699AM = null;

function zrusOdlozeneHledani699AM() {
  const byloNaplanovano = casovacHledani699AM !== null;
  if (byloNaplanovano) clearTimeout(casovacHledani699AM);
  casovacHledani699AM = null;
  return byloNaplanovano;
}

function naplanujOdlozeneHledani699AM() {
  zrusOdlozeneHledani699AM();
  casovacHledani699AM = setTimeout(() => {
    casovacHledani699AM = null;
    prekresliVysledkyVyhledavani();
  }, ODLOZENI_HLEDANI_699AN_MS);
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
