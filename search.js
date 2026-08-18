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
