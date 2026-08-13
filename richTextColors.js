/* ==================================================
   LUBANOTE – BAREVNÉ ZVÝRAZŇOVÁNÍ TEXTU

   Tento soubor řeší pouze:
   - uložení označeného úseku rich-textu,
   - otevření palety bez zavření klávesnice,
   - obarvení / přebarvení libovolného výběru,
   - úplné odstranění barvy z výběru,
   - synchronizaci plain-text kopie pro starší funkce.

   Ostatní logika editoru zůstává v script.js.
================================================== */

window.RichTextColors = (() => {
  const colorTaskButton =
    document.getElementById("colorTaskButton");

  const textColorPalette =
    document.getElementById("textColorPalette");

  let savedRange = null;
  let selectionLocked = false;


  /* ==========================================
     KONTROLA A ULOŽENÍ VÝBĚRU
     ========================================== */

  function isRangeInsideEditor(range) {
    if (!range) {
      return false;
    }

    const startNode =
      range.startContainer.nodeType === Node.TEXT_NODE
        ? range.startContainer.parentElement
        : range.startContainer;

    const endNode =
      range.endContainer.nodeType === Node.TEXT_NODE
        ? range.endContainer.parentElement
        : range.endContainer;

    return Boolean(
      startNode &&
      endNode &&
      modalRichText.contains(startNode) &&
      modalRichText.contains(endNode)
    );
  }


  function getTextOffset(node, offset) {
    const probe = document.createRange();
    probe.selectNodeContents(modalRichText);

    try {
      probe.setEnd(node, offset);
      return probe.toString().length;
    } catch {
      return null;
    }
  }


  function getSelectionSnapshot() {
    if (
      !savedRange ||
      savedRange.collapsed ||
      !isRangeInsideEditor(savedRange)
    ) {
      return null;
    }

    const range = savedRange.cloneRange();
    const text = range.toString();

    if (!text.trim()) {
      return null;
    }

    return {
      range,
      text,
      start: getTextOffset(
        range.startContainer,
        range.startOffset
      ),
      end: getTextOffset(
        range.endContainer,
        range.endOffset
      )
    };
  }


  function saveCurrentSelection(force = false) {
    /*
     * Jakmile je otevřená paleta, Android může ještě několikrát
     * vyvolat selectionchange a zmenšit původní výběr.
     * Proto po otevření palety výběr zamkneme.
     */
    if (selectionLocked && !force) {
      return false;
    }

    const selection = window.getSelection();

    if (
      !selection ||
      selection.rangeCount === 0 ||
      selection.isCollapsed
    ) {
      return false;
    }

    const range = selection.getRangeAt(0);

    if (!isRangeInsideEditor(range)) {
      return false;
    }

    savedRange = range.cloneRange();
    return true;
  }


  function clearSelection() {
    savedRange = null;
    selectionLocked = false;
  }


  /* ==========================================
     POMOCNÉ FUNKCE PRO HTML ZVÝRAZNĚNÍ
     ========================================== */

  function unwrapHighlightMarks(root) {
    const marks = Array.from(
      root.querySelectorAll(
        "mark.richTextHighlight"
      )
    ).reverse();

    marks.forEach((mark) => {
      const parent = mark.parentNode;

      if (!parent) {
        return;
      }

      while (mark.firstChild) {
        parent.insertBefore(
          mark.firstChild,
          mark
        );
      }

      mark.remove();
    });
  }


  function wrapTextNodesWithColor(root, color) {
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT
    );

    const textNodes = [];
    let node = walker.nextNode();

    while (node) {
      if (node.data.length > 0) {
        textNodes.push(node);
      }

      node = walker.nextNode();
    }

    textNodes.forEach((textNode) => {
      if (!textNode.parentNode) {
        return;
      }

      const mark =
        document.createElement("mark");

      mark.className =
        "richTextHighlight";

      mark.style.backgroundColor = color;

      textNode.parentNode.insertBefore(
        mark,
        textNode
      );

      mark.append(textNode);
    });
  }


  function cleanupHighlightMarkup() {
    modalRichText
      .querySelectorAll(
        "mark.richTextHighlight:empty"
      )
      .forEach((mark) => mark.remove());

    modalRichText.normalize();
  }


  /* ==========================================
     JEDNOTNÁ ÚPRAVA VYBRANÉHO ÚSEKU

     Nejdřív vybraný kus vyjmeme z DOM.
     Uvnitř něj odstraníme všechny staré <mark>.
     Potom buď přidáme jednu novou barvu,
     nebo jej vložíme zpět bez barvy.

     Díky tomu funguje i výběr:
     - přes několik různých barev,
     - jen přes část už obarveného slova,
     - přes více řádků.
     ========================================== */

  function transformSelection(color = null) {
    const snapshot = getSelectionSnapshot();

    if (!snapshot) {
      return false;
    }

    const range = snapshot.range.cloneRange();

    /*
     * extractContents() bezpečně rozdělí i <mark>,
     * který je označen jen částečně.
     */
    const fragment = range.extractContents();

    /* Ve vybraném úseku odstraníme staré barvy. */
    unwrapHighlightMarks(fragment);

    /* Pokud byla zvolena barva, obarvíme celý výběr znovu. */
    if (color) {
      wrapTextNodesWithColor(
        fragment,
        color
      );
    }

    /* Vrátíme upravený obsah přesně na původní místo. */
    range.insertNode(fragment);

    cleanupHighlightMarkup();
    syncPlainText();

    window.getSelection()
      ?.removeAllRanges();

    savedRange = null;
    selectionLocked = false;
    textColorPalette.hidden = true;

    return true;
  }


  function applyColor(color) {
    return transformSelection(color);
  }


  function removeColor() {
    return transformSelection(null);
  }


  /* ==========================================
     KOMPATIBILNÍ PLAIN-TEXT KOPIE
     ========================================== */

  function syncPlainText() {
    modalText.value =
      modalRichText.innerText;
  }


  /* ==========================================
     PALETA – KLÁVESNICE MUSÍ ZŮSTAT OTEVŘENÁ
     ========================================== */

  colorTaskButton.addEventListener(
    "pointerdown",
    (event) => {
      /*
       * Uložíme přesný výběr JEŠTĚ před tím, než Android
       * začne reagovat na klepnutí na tlačítko palety.
       */
      saveCurrentSelection(true);
      selectionLocked = true;
      event.preventDefault();
    }
  );


  textColorPalette.addEventListener(
    "pointerdown",
    (event) => {
      if (event.target.closest("button")) {
        event.preventDefault();
      }
    }
  );


  colorTaskButton.addEventListener(
    "click",
    () => {
      const willOpen =
        textColorPalette.hidden;

      textColorPalette.hidden = !willOpen;
      selectionLocked = willOpen;
    }
  );


  textColorPalette.addEventListener(
    "click",
    (event) => {
      const removeButton =
        event.target.closest(
          "[data-highlight-remove]"
        );

      if (removeButton) {
        removeColor();
        return;
      }

      const colorButton =
        event.target.closest(
          "[data-highlight-color]"
        );

      if (!colorButton) {
        return;
      }

      applyColor(
        colorButton.dataset.highlightColor
      );
    }
  );


  /* Android i desktop: zapamatujeme každý platný výběr v editoru. */
  document.addEventListener(
    "selectionchange",
    saveCurrentSelection
  );


  /* Při normálním psaní udržujeme plain-text kopii aktuální. */
  modalRichText.addEventListener(
    "input",
    syncPlainText
  );


  /* ==========================================
     VEŘEJNÉ API PRO script.js A planner.js
     ========================================== */

  function reset() {
    savedRange = null;
    selectionLocked = false;
    textColorPalette.hidden = true;
  }


  return {
    getSelectionSnapshot,
    captureCurrentSelection: () =>
      saveCurrentSelection(true),
    clearSelection,
    reset,
    syncPlainText,
    applyColor,
    removeColor
  };
})();
