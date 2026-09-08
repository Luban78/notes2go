/* ============================================================
   LubaNote – IMAGE FLOW FIX V1
   ------------------------------------------------------------
   Řeší obecný problém obrázku na konci editovatelného obsahu:

   1) TODO
      Obrázek je příloha konkrétního TODO řádku. Pokud je vložen
      do posledního TODO a pod ním už žádný checkbox není,
      vytvoříme přes existující addTodoButton nový prázdný TODO.
      Pokud další TODO existuje, nic neduplikujeme.

   2) Hlavní rich-text editor
      Pokud je obrázek úplně poslední blok editoru, vytvoříme za
      ním prázdný editovatelný řádek, aby šlo pokračovat psaním.

   Fix se aktivuje jen po skutečném kliknutí na „Vložit obrázek“.
   Při pouhém otevření poznámky s existujícími obrázky nic nemění.
============================================================ */

(() => {
  const tlacitkoVlozitObrazek =
    document.getElementById("tlacitkoVlozitObrazek");

  const hlavniEditor =
    document.getElementById("modalRichText");

  const todoList =
    document.getElementById("todoList");

  const tlacitkoPridatTodo =
    document.getElementById("addTodoButton");

  if (!tlacitkoVlozitObrazek || !hlavniEditor) {
    return;
  }

  let pozorovatel = null;
  let casovac = null;
  let cekajiciVlozeni = null;

  function zrusCekani() {
    pozorovatel?.disconnect();
    pozorovatel = null;

    if (casovac !== null) {
      clearTimeout(casovac);
      casovac = null;
    }

    cekajiciVlozeni = null;
  }

  function ziskejEditorZeSelection() {
    const selection = window.getSelection();

    if (!selection || selection.rangeCount === 0) {
      return null;
    }

    const range = selection.getRangeAt(0);
    let uzel = range.startContainer;

    if (uzel?.nodeType === Node.TEXT_NODE) {
      uzel = uzel.parentElement;
    }

    if (!(uzel instanceof Element)) {
      return null;
    }

    return uzel.closest(
      ".todoRichTextInput.todoEditing, #modalRichText"
    );
  }

  function ziskejCilovyEditor() {
    /*
     * TODO editor má přednost. Toolbar už při pointerdown drží jeho
     * selection, ale na některých Android WebView je spolehlivější
     * použít i explicitní .todoEditing.
     */
    const aktivniTodo = document.querySelector(
      "#todoList .todoRichTextInput.todoEditing"
    );

    if (aktivniTodo) {
      return aktivniTodo;
    }

    const selectionEditor = ziskejEditorZeSelection();

    if (selectionEditor) {
      return selectionEditor;
    }

    return hlavniEditor;
  }

  function najdiNovyObrazek(mutations, stav) {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) {
          continue;
        }

        const kandidati = [];

        if (node.matches?.(".lubaNoteImage")) {
          kandidati.push(node);
        }

        kandidati.push(
          ...node.querySelectorAll?.(".lubaNoteImage") || []
        );

        for (const figure of kandidati) {
          if (
            stav.editor.contains(figure) &&
            !stav.puvodniObrazky.has(figure)
          ) {
            return figure;
          }
        }
      }
    }

    return null;
  }

  function jeTodoEditor(editor) {
    return Boolean(
      editor?.classList?.contains("todoRichTextInput")
    );
  }

  function najdiNasledujiciTodo(todoItem) {
    let dalsi = todoItem?.nextElementSibling || null;

    while (dalsi) {
      if (dalsi.classList?.contains("todoItem")) {
        return dalsi;
      }

      dalsi = dalsi.nextElementSibling;
    }

    return null;
  }

  function zajistiTodoPodObrazkem(editor) {
    if (!todoList || !tlacitkoPridatTodo) {
      return;
    }

    const todoItem = editor.closest(".todoItem");

    if (!todoItem || !todoList.contains(todoItem)) {
      return;
    }

    /*
     * Nejprve synchronně oznámíme změnu stávajícího TODO.
     * todos.js si tak uloží HTML s obrázkem ještě před případným
     * renderTodos(), který vyvolá přidání nového checkboxu.
     */
    editor.dispatchEvent(
      new Event("input", { bubbles: true })
    );

    if (najdiNasledujiciTodo(todoItem)) {
      return;
    }

    /*
     * Používáme jedinou existující oficiální cestu pro nový TODO.
     * Její handler vytvoří normalizovaný checkbox, renderuje seznam
     * a rovnou zavolá focusTodo() na novém řádku.
     */
    tlacitkoPridatTodo.click();
  }

  function jeKoreniInlineObsah(editor, uzel) {
    if (!uzel || uzel.parentNode !== editor) {
      return false;
    }

    if (uzel.nodeType === Node.TEXT_NODE) {
      return true;
    }

    if (!(uzel instanceof HTMLElement)) {
      return false;
    }

    if (
      uzel.classList.contains("lubaNoteImage") ||
      uzel.contentEditable === "false"
    ) {
      return false;
    }

    /*
     * Zvětšení / barva / B-I-U může kořenový text převést z TEXT_NODE
     * na inline <span> (případně jiný inline wrapper). Právě tento
     * rozdíl způsobil, že původní 0.9.304 fungovala jen pro obyčejný
     * text. Blokové prvky sem záměrně nepouštíme.
     */
    if (uzel.tagName === "BR") {
      return true;
    }

    const display = getComputedStyle(uzel).display;
    return display === "inline" || display === "inline-block";
  }

  function oddelKoreniTextPredObrazkem(editor, figure) {
    /*
     * Float obrázku nesmí zpětně obtékat text, který byl napsaný
     * PŘED vložením obrázku. Android WebView může takový řádek držet
     * přímo v kořeni editoru buď jako TEXT_NODE, nebo po formátování
     * jako jeden či více inline wrapperů (<span>...).
     *
     * Normalizujeme jen souvislý kořenový inline úsek bezprostředně
     * před NOVĚ vloženým figure. Uzly pouze přesuneme do vlastního
     * <div>; jejich obsah, styly a formátování neměníme. Existující
     * blokové řádky, obrázky, TODO/Bullet ani gesta zůstávají mimo.
     */
    if (!editor || !figure || figure.parentElement !== editor) {
      return;
    }

    let posledni = figure.previousSibling;

    while (
      posledni?.nodeType === Node.TEXT_NODE &&
      String(posledni.textContent || "").trim() === ""
    ) {
      posledni = posledni.previousSibling;
    }

    if (!jeKoreniInlineObsah(editor, posledni)) {
      return;
    }

    const maSkutecnyObsah =
      posledni.nodeType !== Node.TEXT_NODE ||
      String(posledni.textContent || "").trim() !== "";

    if (!maSkutecnyObsah) {
      return;
    }

    let prvni = posledni;
    let pred = prvni.previousSibling;

    while (jeKoreniInlineObsah(editor, pred)) {
      prvni = pred;
      pred = prvni.previousSibling;
    }

    const radekPredObrazkem = document.createElement("div");
    prvni.before(radekPredObrazkem);

    let uzel = prvni;

    while (uzel && uzel !== figure) {
      const dalsi = uzel.nextSibling;
      radekPredObrazkem.append(uzel);
      uzel = dalsi;
    }
  }

  function ziskejVrcholovyBlok(editor, figure) {
    let blok = figure;

    while (
      blok.parentElement &&
      blok.parentElement !== editor
    ) {
      blok = blok.parentElement;
    }

    return blok.parentElement === editor
      ? blok
      : null;
  }

  function oznacPuvodniRadekZaObrazkem(editor, blok) {
    if (!editor || !blok || blok.parentElement !== editor) {
      return null;
    }

    let uzel = blok.nextSibling;

    /*
     * Android WebView po vlozeni obrazku casto uz sam vytvori
     * prazdny pokracovaci radek <div><br></div>. Puvodni kod ho
     * povazoval jen za "nejaky editovatelny obsah" a vratil se,
     * takze radek nikdy nedostal clear: both. Po pozdejsim prepnuti
     * obrazku na 25/50 % + vlevo/vpravo pak text napsany do tohoto
     * radku zacal spravne podle CSS obtékat float a skocil vedle.
     *
     * Tento radek ale vznikl jako PUVODNI pokracovani pod obrazkem,
     * proto ho oznacime jako koncovy radek pod obrazkem. Radky pro
     * zamerne psani VEDLE floatu vytvari az imageFloatCaretFix.js
     * s tridou .lubaNoteImageTextLine a zustavaji bez clear.
     */
    while (
      uzel?.nodeType === Node.TEXT_NODE &&
      String(uzel.textContent || "").trim() === ""
    ) {
      uzel = uzel.nextSibling;
    }

    if (!uzel) {
      return null;
    }

    /*
     * Pokud je pokracovani primo v koreni jako text/span/mark,
     * zabalime pouze tento souvisly inline usek do vlastniho radku.
     * Obsah ani jeho formatovani nemenime.
     */
    if (jeKoreniInlineObsah(editor, uzel)) {
      const radek = document.createElement("div");
      radek.classList.add("lubaNoteImageBelowLine");
      radek.style.clear = "both";

      editor.insertBefore(radek, uzel);

      let aktualni = uzel;

      while (jeKoreniInlineObsah(editor, aktualni)) {
        const dalsi = aktualni.nextSibling;
        radek.append(aktualni);
        aktualni = dalsi;
      }

      if (!radek.firstChild) {
        radek.append(document.createElement("br"));
      }

      return radek;
    }

    if (!(uzel instanceof HTMLElement)) {
      return null;
    }

    if (
      uzel.parentElement !== editor ||
      uzel.classList.contains("lubaNoteImage") ||
      uzel.querySelector(".lubaNoteImage") ||
      uzel.contentEditable === "false" ||
      uzel.classList.contains("lubaNoteImageTextLine")
    ) {
      return null;
    }

    uzel.classList.add("lubaNoteImageBelowLine");
    uzel.style.clear = "both";
    return uzel;
  }

  function nastavKurzorDoRadku(radek) {
    try {
      const range = document.createRange();
      const selection = window.getSelection();

      range.selectNodeContents(radek);
      range.collapse(true);

      selection?.removeAllRanges();
      selection?.addRange(range);
    } catch (_) {
      // Focus editoru zůstává funkční i bez explicitního Range.
    }
  }

  function zajistiRadekZaObrazkem(editor, figure) {
    oddelKoreniTextPredObrazkem(editor, figure);

    const blok = ziskejVrcholovyBlok(editor, figure);

    if (!blok) {
      return;
    }

    const existujiciRadek =
      oznacPuvodniRadekZaObrazkem(editor, blok);

    if (existujiciRadek) {
      editor.dispatchEvent(
        new Event("input", { bubbles: true })
      );

      /*
       * Pokud WebView pripravil prazdny radek za novym obrazkem,
       * zachovame dosavadni UX a nechame v nem kurzor. U radku,
       * ktery uz obsahuje text, selection nemenime.
       */
      if (
        String(existujiciRadek.textContent || "").trim() === ""
      ) {
        try {
          editor.focus({ preventScroll: true });
        } catch (_) {
          editor.focus();
        }

        nastavKurzorDoRadku(existujiciRadek);
      }

      return;
    }

    const novyRadek = document.createElement("div");
    novyRadek.classList.add("lubaNoteImageBelowLine");
    novyRadek.append(document.createElement("br"));

    /*
     * U plovouciho obrazku musi byt tento konkretni radek skutecne
     * az POD obrazkem. Bez clear ho WebView drzi v toku vedle floatu
     * a pod obrazkem pak neni zadna nativne klikatelna caret pozice.
     * Radky pro zamerne psani VEDLE obrazku vytvari samostatne
     * imageFloatCaretFix.js pred timto koncovym radkem.
     */
    novyRadek.style.clear = "both";

    blok.insertAdjacentElement("afterend", novyRadek);

    editor.dispatchEvent(
      new Event("input", { bubbles: true })
    );

    try {
      editor.focus({ preventScroll: true });
    } catch (_) {
      editor.focus();
    }

    nastavKurzorDoRadku(novyRadek);
  }

  function dokonceno(figure, stav) {
    pozorovatel?.disconnect();
    pozorovatel = null;

    if (casovac !== null) {
      clearTimeout(casovac);
      casovac = null;
    }

    cekajiciVlozeni = null;

    /*
     * editorMedia dokončuje obrázek a jeho ovládání v tomtéž event
     * loopu. Dva RAF nechají doběhnout i TODO input logiku a layout.
     */
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!stav.editor.isConnected || !figure.isConnected) {
          return;
        }

        if (stav.jeTodo) {
          zajistiTodoPodObrazkem(stav.editor);
          return;
        }

        zajistiRadekZaObrazkem(
          stav.editor,
          figure
        );
      });
    });
  }

  function pripravCekaniNaObrazek() {
    zrusCekani();

    const editor = ziskejCilovyEditor();

    if (!editor) {
      return;
    }

    const stav = {
      editor,
      jeTodo: jeTodoEditor(editor),
      puvodniObrazky: new Set(
        editor.querySelectorAll(".lubaNoteImage")
      )
    };

    cekajiciVlozeni = stav;

    pozorovatel = new MutationObserver((mutations) => {
      if (cekajiciVlozeni !== stav) {
        return;
      }

      const figure = najdiNovyObrazek(
        mutations,
        stav
      );

      if (figure) {
        dokonceno(figure, stav);
      }
    });

    pozorovatel.observe(editor, {
      childList: true,
      subtree: true
    });

    /*
     * Když uživatel systémový výběr obrázku zruší, pozorovatel nesmí
     * zůstat aktivní do příštího vložení.
     */
    casovac = setTimeout(
      zrusCekani,
      120000
    );
  }

  /*
   * Capture listener běží ještě před původním handlerem toolbaru,
   * tedy před otevřením galerie / fotoaparátu.
   */
  tlacitkoVlozitObrazek.addEventListener(
    "click",
    pripravCekaniNaObrazek,
    true
  );

  window.LubaNoteImageFlowFix = {
    zrusCekani
  };
})();
