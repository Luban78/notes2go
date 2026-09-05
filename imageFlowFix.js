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

  function maEditovatelnyObsahZa(blok) {
    let uzel = blok?.nextSibling || null;

    while (uzel) {
      if (uzel.nodeType === Node.TEXT_NODE) {
        if (String(uzel.textContent || "").trim() !== "") {
          return true;
        }

        uzel = uzel.nextSibling;
        continue;
      }

      if (uzel instanceof HTMLElement) {
        if (
          !uzel.classList.contains("lubaNoteImage") &&
          uzel.contentEditable !== "false"
        ) {
          return true;
        }
      }

      uzel = uzel.nextSibling;
    }

    return false;
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
    const blok = ziskejVrcholovyBlok(editor, figure);

    if (!blok || maEditovatelnyObsahZa(blok)) {
      return;
    }

    const novyRadek = document.createElement("div");
    novyRadek.append(document.createElement("br"));

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
