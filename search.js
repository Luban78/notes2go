const searchNotes =
  document.getElementById("searchNotes");

const noSearchResults =
  document.getElementById("noSearchResults");

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

function prekresliVysledkyVyhledavani() {
  renderTasks();

  const visibleCardCount =
    pinnedLeft.children.length +
    pinnedRight.children.length;

  noSearchResults.hidden =
    visibleCardCount !== 0;
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

function zajistiCisteNeaktivniVyhledavani() {
  if (!searchNotes) {
    return;
  }

  if (vyhledavaniAktivovaneUzivatelem) {
    return;
  }

  searchNotes.value = "";
  searchNotes.readOnly = true;
  noSearchResults.hidden = true;
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
  aktivujVyhledavaniUzivatelem
);

searchNotes.addEventListener(
  "keydown",
  aktivujVyhledavaniUzivatelem
);

searchNotes.addEventListener("input", () => {
  if (!vyhledavaniAktivovaneUzivatelem) {
    zajistiCisteNeaktivniVyhledavani();
    prekresliVysledkyVyhledavani();
    return;
  }

  prekresliVysledkyVyhledavani();
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

  vyhledavaniAktivovaneUzivatelem = false;
  searchNotes.readOnly = true;
});

window.addEventListener("pageshow", () => {
  vyhledavaniAktivovaneUzivatelem = false;
  zajistiCisteNeaktivniVyhledavani();
  prekresliVysledkyVyhledavani();
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
    zajistiCisteNeaktivniVyhledavani();
    prekresliVysledkyVyhledavani();
  }
});


/* ==========================================
   SECRET – VYČIŠTĚNÍ HLEDÁNÍ PŘI ZAMKNUTÍ
   ========================================== */

function vycistiVyhledavaniPoZamknutiTajnehoRezimu() {
  if (!searchNotes) {
    return;
  }

  searchNotes.value = "";
  searchNotes.readOnly = true;
  vyhledavaniAktivovaneUzivatelem = false;

  if (noSearchResults) {
    noSearchResults.hidden = true;
  }
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

  const modalRichText =
    document.getElementById("modalRichText");

  const todoList =
    document.getElementById("todoList");

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

  if (todoList && !todoList.hidden) {
    todoList
      .querySelectorAll(".todoTextValue")
      .forEach(element => {
        ranges.push(
          ...najdiRozsahyTextuProVyhledavani(
            element,
            hledanyText
          )
        );
      });
  } else if (
    modalRichText &&
    !modalRichText.hidden
  ) {
    ranges.push(
      ...najdiRozsahyTextuProVyhledavani(
        modalRichText,
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
