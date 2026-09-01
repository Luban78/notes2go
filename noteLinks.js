/* ========================================
   LUBANOTE – INTERNÍ ODKAZY NA POZNÁMKY
   ========================================

   V2 rozšiřuje společný [[ engine na:
   - hlavní rich-text editor,
   - bullety uvnitř hlavního editoru,
   - rich-text TODO položky.

   Navigace A → B → C a návratový řádek z V3 zůstávají zachované.
   Skutečné backlinky „Odkazuje sem“ přijdou v další samostatné verzi.
*/
(() => {
  "use strict";

  const editor = document.getElementById("modalRichText");

  if (!editor) {
    return;
  }

  const MAX_VYSLEDKU = 8;
  const MAX_DELKA_DOTAZU = 80;

  let panel = null;
  let seznam = null;
  let aktualniVysledky = [];
  let aktivniIndex = 0;
  let posledniSpoust = null;

  function bezDiakritiky(text) {
    return String(text || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("cs-CZ");
  }

  function ziskejNazevPoznamky(poznamka) {
    const title = String(poznamka?.title || "").trim();
    return title || "Bez názvu";
  }

  function ziskejAktivniPoznamkuId() {
    try {
      if (
        typeof activeTaskId !== "undefined" &&
        activeTaskId
      ) {
        return String(activeTaskId);
      }
    } catch (_) {
      // activeTaskId nemusí být v daném buildu dostupné.
    }

    /*
     * Fallback pro okamžik, kdy editor už má načtenou poznámku,
     * ale globální activeTaskId ještě není / už není dostupné.
     */
    const taskModalElement =
      document.getElementById("taskModal");
    const modalTaskId = String(
      taskModalElement?.dataset?.taskId || ""
    ).trim();

    return modalTaskId || null;
  }

  function nactiKandidaty(dotaz) {
    if (typeof loadTask !== "function") {
      return [];
    }

    const aktivniId = ziskejAktivniPoznamkuId();
    const normalizovanyDotaz = bezDiakritiky(dotaz);

    const kandidati = loadTask()
      .filter((poznamka) => {
        if (!poznamka?.id) {
          return false;
        }

        /*
         * V1 nikdy nenabízí Secret poznámky – ani když je trezor
         * právě odemčený. Secret propojení je samostatná budoucí verze.
         */
        if (poznamka.isSecret === true) {
          return false;
        }

        if (aktivniId && String(poznamka.id) === aktivniId) {
          return false;
        }

        return true;
      })
      .map((poznamka) => {
        const nazev = ziskejNazevPoznamky(poznamka);
        const normalizovanyNazev = bezDiakritiky(nazev);

        let skore = 3;

        if (normalizovanyDotaz) {
          if (normalizovanyNazev.startsWith(normalizovanyDotaz)) {
            skore = 0;
          } else if (normalizovanyNazev.includes(normalizovanyDotaz)) {
            skore = 1;
          } else {
            return null;
          }
        }

        return {
          poznamka,
          nazev,
          skore,
          updatedAt: new Date(
            poznamka.updatedAt || 0
          ).getTime() || 0
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.skore !== b.skore) {
          return a.skore - b.skore;
        }

        if (normalizovanyDotaz) {
          const delkaRozdil =
            a.nazev.length - b.nazev.length;

          if (delkaRozdil !== 0) {
            return delkaRozdil;
          }
        }

        return b.updatedAt - a.updatedAt;
      });

    return kandidati.slice(0, MAX_VYSLEDKU);
  }

  function vytvorPanel() {
    if (panel) {
      return panel;
    }

    panel = document.createElement("div");
    panel.id = "noteLinkAutocomplete";
    panel.className = "noteLinkAutocomplete";
    panel.hidden = true;
    panel.setAttribute("role", "listbox");
    panel.setAttribute(
      "aria-label",
      "Vybrat poznámku pro interní odkaz"
    );

    seznam = document.createElement("div");
    seznam.className = "noteLinkAutocompleteList";
    panel.append(seznam);
    document.body.append(panel);

    /*
     * Mobil: položku nesmíme vybírat už při pointerdown.
     * Jinak první pohyb prstu při scrollování okamžitě vloží položku.
     * Výběr proto provedeme až při pointerup a jen pokud se prst/myš
     * prakticky nepohnuly.
     */
    let vyberPointer = null;

    panel.addEventListener("pointerdown", (event) => {
      const tlacitko = event.target.closest(
        ".noteLinkAutocompleteItem"
      );

      if (!tlacitko) {
        vyberPointer = null;
        return;
      }

      vyberPointer = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        index: Number(tlacitko.dataset.index),
        presunuto: false
      };

      /* U myši zachováme caret v editoru. Touch musí zůstat scrollovatelný. */
      if (event.pointerType === "mouse") {
        event.preventDefault();
      }
    });

    panel.addEventListener("pointermove", (event) => {
      if (
        !vyberPointer ||
        vyberPointer.pointerId !== event.pointerId
      ) {
        return;
      }

      const dx = event.clientX - vyberPointer.x;
      const dy = event.clientY - vyberPointer.y;

      if (Math.hypot(dx, dy) > 8) {
        vyberPointer.presunuto = true;
      }
    });

    panel.addEventListener("pointerup", (event) => {
      if (
        !vyberPointer ||
        vyberPointer.pointerId !== event.pointerId
      ) {
        return;
      }

      const stav = vyberPointer;
      vyberPointer = null;

      if (
        stav.presunuto ||
        !Number.isInteger(stav.index)
      ) {
        return;
      }

      event.preventDefault();
      vlozVybranouPoznamku(stav.index);
    });

    panel.addEventListener("pointercancel", () => {
      vyberPointer = null;
    });

    return panel;
  }

  function zavriPanel() {
    if (!panel) {
      return;
    }

    panel.hidden = true;
    panel.replaceChildren();
    seznam = null;
    aktualniVysledky = [];
    aktivniIndex = 0;
    posledniSpoust = null;
  }

  function jeTodoRichTextEditor(element) {
    return Boolean(
      element?.classList?.contains("todoRichTextInput")
    );
  }

  function jePodporovanyEditor(element) {
    if (!element) {
      return false;
    }

    return (
      element === editor ||
      jeTodoRichTextEditor(element)
    );
  }

  function ziskejEditorProNode(node) {
    const element =
      node?.nodeType === Node.ELEMENT_NODE
        ? node
        : node?.parentElement;

    if (!element) {
      return null;
    }

    const todoEditor = element.closest?.(
      ".todoRichTextInput"
    );

    if (todoEditor && jePodporovanyEditor(todoEditor)) {
      return todoEditor;
    }

    if (editor.contains(element)) {
      return editor;
    }

    return null;
  }

  function jeVPodporovanemTextu(node, cilovyEditor) {
    const element =
      node?.nodeType === Node.ELEMENT_NODE
        ? node
        : node?.parentElement;

    if (
      !element ||
      !cilovyEditor ||
      !cilovyEditor.contains(element)
    ) {
      return false;
    }

    /*
     * V2: <li> už je povolené. Záměrně ale nikdy nevstupujeme do
     * obrázků, figure, hotového interního odkazu ani dalších atomických
     * prvků. Samotný [[ výraz musí zůstat v jednom textovém uzlu.
     */
    if (
      element.closest(
        ".lubaNoteImage, figure, .noteInternalLink, " +
        ".plannedTextLink, .lubaNoteInternetLink, a[href]"
      )
    ) {
      return false;
    }

    return true;
  }

  function ziskejSpoustUCursoru(cilovyEditor = null) {
    const selection = window.getSelection();

    if (
      !selection ||
      selection.rangeCount === 0 ||
      !selection.isCollapsed
    ) {
      return null;
    }

    const range = selection.getRangeAt(0);

    const skutecnyEditor =
      cilovyEditor ||
      ziskejEditorProNode(range.startContainer);

    if (
      !jePodporovanyEditor(skutecnyEditor) ||
      !skutecnyEditor.contains(range.startContainer)
    ) {
      return null;
    }

    if (
      !jeVPodporovanemTextu(
        range.startContainer,
        skutecnyEditor
      )
    ) {
      return null;
    }

    /*
     * Při normálním psaní contenteditable drží právě psaný text
     * v jednom textovém uzlu. To je pro V1 záměrně nejbezpečnější:
     * nezasahujeme přes hranice formátovaných elementů.
     */
    if (range.startContainer.nodeType !== Node.TEXT_NODE) {
      return null;
    }

    const textNode = range.startContainer;
    const caretOffset = range.startOffset;
    const predKurzorem = textNode.data.slice(0, caretOffset);

    const match = predKurzorem.match(
      /\[\[([^\[\]\n]{0,80})$/
    );

    if (!match) {
      return null;
    }

    const dotaz = match[1];

    if (dotaz.length > MAX_DELKA_DOTAZU) {
      return null;
    }

    const startOffset = caretOffset - match[0].length;

    return {
      editor: skutecnyEditor,
      textNode,
      startOffset,
      endOffset: caretOffset,
      dotaz,
      range: range.cloneRange()
    };
  }

  function ziskejCaretRect(spoust) {
    const textNode = spoust.textNode;
    const offset = spoust.endOffset;
    const range = document.createRange();

    range.setStart(textNode, offset);
    range.collapse(true);

    let rect = range.getClientRects()?.[0] || range.getBoundingClientRect();

    if (rect && (rect.height || rect.width)) {
      return rect;
    }

    /*
     * Android/WebView někdy vrátí u collapsed range nulový obdélník.
     * Nechceme v takovém případě použít celý editor (panel pak skočí
     * přes obrazovku), ale změříme poslední znak těsně před caretem.
     */
    if (offset > 0) {
      const znakRange = document.createRange();
      znakRange.setStart(textNode, offset - 1);
      znakRange.setEnd(textNode, offset);
      const znakRect =
        znakRange.getClientRects()?.[0] ||
        znakRange.getBoundingClientRect();

      if (znakRect && (znakRect.height || znakRect.width)) {
        return {
          left: znakRect.right,
          right: znakRect.right,
          top: znakRect.top,
          bottom: znakRect.bottom,
          width: 0,
          height: znakRect.height
        };
      }
    }

    /* Poslední bezpečný fallback: levý horní roh skutečného řádku editoru. */
    const editorRect =
      spoust.editor?.getBoundingClientRect?.() ||
      editor.getBoundingClientRect();
    return {
      left: editorRect.left + 16,
      right: editorRect.left + 16,
      top: editorRect.top + 16,
      bottom: editorRect.top + 40,
      width: 0,
      height: 24
    };
  }

  function formatMeta(poznamka) {
    const casti = [];

    if (poznamka?.area === "work") {
      casti.push("Pracovní");
    } else if (poznamka?.area === "private") {
      casti.push("Soukromé");
    }

    if (poznamka?.updatedAt) {
      const datum = new Date(poznamka.updatedAt);

      if (!Number.isNaN(datum.getTime())) {
        casti.push(
          datum.toLocaleDateString("cs-CZ", {
            day: "numeric",
            month: "numeric"
          })
        );
      }
    }

    return casti.join(" • ");
  }

  function renderujVysledky() {
    vytvorPanel();

    if (!seznam) {
      seznam = document.createElement("div");
      seznam.className = "noteLinkAutocompleteList";
      panel.append(seznam);
    }

    seznam.replaceChildren();

    if (aktualniVysledky.length === 0) {
      const prazdne = document.createElement("div");
      prazdne.className = "noteLinkAutocompleteEmpty";
      prazdne.textContent = "Žádná odpovídající poznámka";
      seznam.append(prazdne);
      return;
    }

    aktualniVysledky.forEach((vysledek, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "noteLinkAutocompleteItem";
      button.dataset.index = String(index);
      button.setAttribute("role", "option");
      button.setAttribute(
        "aria-selected",
        index === aktivniIndex ? "true" : "false"
      );

      const nazev = document.createElement("span");
      nazev.className = "noteLinkAutocompleteTitle";
      nazev.textContent = vysledek.nazev;

      const metaText = formatMeta(vysledek.poznamka);

      if (metaText) {
        const meta = document.createElement("span");
        meta.className = "noteLinkAutocompleteMeta";
        meta.textContent = metaText;
        button.append(nazev, meta);
      } else {
        button.append(nazev);
      }

      seznam.append(button);
    });
  }

  function aktualizujAktivniPolozku() {
    if (!panel || panel.hidden) {
      return;
    }

    panel
      .querySelectorAll(".noteLinkAutocompleteItem")
      .forEach((button, index) => {
        const aktivni = index === aktivniIndex;
        button.classList.toggle("active", aktivni);
        button.setAttribute(
          "aria-selected",
          aktivni ? "true" : "false"
        );

        if (aktivni) {
          button.scrollIntoView({ block: "nearest" });
        }
      });
  }

  function umistiPanel() {
    if (!panel || panel.hidden || !posledniSpoust) {
      return;
    }

    const rect = ziskejCaretRect(posledniSpoust);
    const vv = window.visualViewport;

    const viewportLeft = vv?.offsetLeft || 0;
    const viewportTop = vv?.offsetTop || 0;
    const viewportWidth = vv?.width || window.innerWidth;
    const viewportHeight = vv?.height || window.innerHeight;
    const viewportRight = viewportLeft + viewportWidth;
    const viewportBottom = viewportTop + viewportHeight;

    /*
     * Mobilní V1: panel má přibližně polovinu viditelné šířky.
     * Na velmi úzkém displeji držíme použitelné minimum, na tabletu/PC
     * ho nenecháme zbytečně široký.
     */
    const jeMobil = viewportWidth <= 899;
    const sirka = jeMobil
      ? Math.min(280, Math.max(170, viewportWidth * 0.52))
      : Math.min(360, Math.max(240, viewportWidth * 0.34));
    const odsazeni = 6;
    const okraj = 10;

    panel.style.width = `${Math.round(sirka)}px`;

    /* Panel začíná u caretu a jen se ořízne o pravý okraj viewportu. */
    let left = rect.left;
    left = Math.max(
      viewportLeft + okraj,
      Math.min(left, viewportRight - sirka - okraj)
    );

    /* Vždy přímo POD aktuálním textem/caretem – už nepřeskakujeme nad něj. */
    const top = Math.max(
      viewportTop + okraj,
      rect.bottom + odsazeni
    );

    /*
     * Výška se přizpůsobí prostoru nad klávesnicí. Seznam má vlastní
     * scroll a standardně ukazuje zhruba 3–4 položky.
     */
    const dostupnaVyska = Math.max(
      96,
      viewportBottom - top - okraj
    );
    const maxVyska = Math.min(230, dostupnaVyska);

    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
    panel.style.maxHeight = `${Math.round(maxVyska)}px`;
  }

  function otevriNeboAktualizujPanel(cilovyEditor = null) {
    const spoust = ziskejSpoustUCursoru(cilovyEditor);

    if (!spoust) {
      zavriPanel();
      return;
    }

    posledniSpoust = spoust;
    aktualniVysledky = nactiKandidaty(spoust.dotaz);
    aktivniIndex = 0;

    vytvorPanel();
    panel.hidden = false;
    renderujVysledky();
    aktualizujAktivniPolozku();
    requestAnimationFrame(umistiPanel);
  }

  function vytvorInterniOdkaz(poznamka) {
    const link = document.createElement("span");
    link.className = "noteInternalLink";
    link.dataset.noteId = String(poznamka.id);
    link.dataset.noteTitle = ziskejNazevPoznamky(poznamka);
    link.setAttribute("contenteditable", "false");
    link.setAttribute("role", "link");
    link.setAttribute(
      "aria-label",
      `Interní odkaz na poznámku ${ziskejNazevPoznamky(poznamka)}`
    );
    link.textContent = ziskejNazevPoznamky(poznamka);
    return link;
  }

  function vlozVybranouPoznamku(index) {
    const vysledek = aktualniVysledky[index];
    const spoust = posledniSpoust;

    if (!vysledek || !spoust) {
      return;
    }

    const cilovyEditor = spoust.editor;

    if (
      !spoust.textNode?.isConnected ||
      !cilovyEditor?.isConnected ||
      !cilovyEditor.contains(spoust.textNode)
    ) {
      zavriPanel();
      return;
    }

    const range = document.createRange();

    try {
      range.setStart(spoust.textNode, spoust.startOffset);
      range.setEnd(spoust.textNode, spoust.endOffset);
    } catch (_) {
      zavriPanel();
      return;
    }

    const link = vytvorInterniOdkaz(vysledek.poznamka);
    const mezera = document.createTextNode(" ");

    range.deleteContents();
    range.insertNode(mezera);
    range.insertNode(link);

    const selection = window.getSelection();
    const caretRange = document.createRange();
    caretRange.setStartAfter(mezera);
    caretRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(caretRange);

    zavriPanel();

    try {
      cilovyEditor.focus({ preventScroll: true });
    } catch (_) {
      cilovyEditor.focus();
    }

    cilovyEditor.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: null
      })
    );
  }

  function posunAktivni(smer) {
    if (aktualniVysledky.length === 0) {
      return;
    }

    aktivniIndex =
      (aktivniIndex + smer + aktualniVysledky.length) %
      aktualniVysledky.length;

    aktualizujAktivniPolozku();
  }

  function patriPanelEditoru(cilovyEditor) {
    return Boolean(
      posledniSpoust?.editor &&
      posledniSpoust.editor === cilovyEditor
    );
  }

  function obsluzKeydownAutocomplete(event, cilovyEditor) {
    if (
      !panel ||
      panel.hidden ||
      !patriPanelEditoru(cilovyEditor)
    ) {
      return false;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      event.stopPropagation();
      posunAktivni(1);
      return true;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      posunAktivni(-1);
      return true;
    }

    if (event.key === "Enter") {
      if (aktualniVysledky.length > 0) {
        event.preventDefault();
        event.stopPropagation();
        vlozVybranouPoznamku(aktivniIndex);
      }

      return true;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      zavriPanel();
      return true;
    }

    return false;
  }

  /* ---------- HLAVNÍ EDITOR + BULLETY ---------- */

  editor.addEventListener("input", () => {
    otevriNeboAktualizujPanel(editor);
  });

  editor.addEventListener("keyup", (event) => {
    if (
      event.key === "ArrowUp" ||
      event.key === "ArrowDown" ||
      event.key === "Enter" ||
      event.key === "Escape"
    ) {
      return;
    }

    if (!panel || panel.hidden) {
      otevriNeboAktualizujPanel(editor);
    }
  });

  editor.addEventListener(
    "keydown",
    (event) => {
      obsluzKeydownAutocomplete(event, editor);
    },
    true
  );

  /* ---------- TODO RICH-TEXT – dynamické editory ---------- */

  document.addEventListener(
    "input",
    (event) => {
      const todoEditor = event.target?.closest?.(
        ".todoRichTextInput"
      );

      if (!todoEditor) {
        return;
      }

      otevriNeboAktualizujPanel(todoEditor);
    },
    true
  );

  document.addEventListener(
    "keyup",
    (event) => {
      const todoEditor = event.target?.closest?.(
        ".todoRichTextInput"
      );

      if (!todoEditor) {
        return;
      }

      if (
        event.key === "ArrowUp" ||
        event.key === "ArrowDown" ||
        event.key === "Enter" ||
        event.key === "Escape"
      ) {
        return;
      }

      if (!panel || panel.hidden) {
        otevriNeboAktualizujPanel(todoEditor);
      }
    },
    true
  );

  document.addEventListener(
    "keydown",
    (event) => {
      const todoEditor = event.target?.closest?.(
        ".todoRichTextInput"
      );

      if (!todoEditor) {
        return;
      }

      obsluzKeydownAutocomplete(
        event,
        todoEditor
      );
    },
    true
  );

  /* ---------- POZICE PANELU ---------- */

  editor.addEventListener("scroll", () => {
    if (panel && !panel.hidden) {
      requestAnimationFrame(umistiPanel);
    }
  });

  document.addEventListener(
    "scroll",
    () => {
      if (panel && !panel.hidden) {
        requestAnimationFrame(umistiPanel);
      }
    },
    true
  );

  window.addEventListener("resize", () => {
    if (panel && !panel.hidden) {
      requestAnimationFrame(umistiPanel);
    }
  });

  window.visualViewport?.addEventListener("resize", () => {
    if (panel && !panel.hidden) {
      requestAnimationFrame(umistiPanel);
    }
  });

  document.addEventListener("pointerdown", (event) => {
    if (!panel || panel.hidden) {
      return;
    }

    const aktivniEditor = posledniSpoust?.editor;

    if (
      panel.contains(event.target) ||
      aktivniEditor?.contains?.(event.target)
    ) {
      return;
    }

    zavriPanel();
  });

  /* ========================================
     V3 – INTERNÍ NAVIGACE + HISTORIE
     ========================================

     A → B → C
     V C se zobrazí: ← B
     Po návratu v B: ← A

     Skutečné backlinky „Odkazuje sem“ jsou samostatná další verze.
  */

  const noteLinkBackRow =
    document.getElementById("noteLinkBackRow");
  const noteLinkBackButton =
    document.getElementById("noteLinkBackButton");
  const noteLinkBackTitle =
    document.getElementById("noteLinkBackTitle");
  const taskModalElement =
    document.getElementById("taskModal");
  const modalTitleElement =
    document.getElementById("modalTitle");

  let historieInterniNavigace = [];
  let aktivniInterniCilId = null;
  let probihaInterniPrepnuti = false;

  function zobrazNedostupnyInterniOdkaz() {
    if (typeof zobrazZpravuAplikace === "function") {
      zobrazZpravuAplikace(
        "Interní odkaz",
        "Cílová poznámka už není dostupná."
      );
    }
  }

  function najdiCilovouPoznamku(noteId) {
    if (!noteId || typeof loadTask !== "function") {
      return null;
    }

    return loadTask().find(
      (poznamka) =>
        String(poznamka?.id || "") === String(noteId)
    ) || null;
  }

  function ziskejNazevAktualniPoznamky(noteId) {
    const aktivniId = ziskejAktivniPoznamkuId();

    if (
      noteId &&
      aktivniId &&
      String(noteId) === String(aktivniId)
    ) {
      const nazevZEditoru = String(
        modalTitleElement?.textContent || ""
      ).trim();

      if (nazevZEditoru) {
        return nazevZEditoru;
      }
    }

    const poznamka = najdiCilovouPoznamku(noteId);
    return poznamka
      ? ziskejNazevPoznamky(poznamka)
      : "Předchozí poznámka";
  }

  function skryjInterniNavrat() {
    if (!noteLinkBackRow) {
      return;
    }

    noteLinkBackRow.hidden = true;

    if (noteLinkBackTitle) {
      noteLinkBackTitle.textContent = "";
    }
  }

  function aktualizujInterniNavrat() {
    if (
      !noteLinkBackRow ||
      !noteLinkBackButton ||
      !noteLinkBackTitle
    ) {
      return;
    }

    const aktivniId = ziskejAktivniPoznamkuId();
    const posledni =
      historieInterniNavigace[
        historieInterniNavigace.length - 1
      ];

    if (
      !aktivniId ||
      !aktivniInterniCilId ||
      String(aktivniId) !== String(aktivniInterniCilId) ||
      !posledni
    ) {
      skryjInterniNavrat();
      return;
    }

    /*
     * Název čteme z aktuálních dat, takže když se zdrojová poznámka
     * mezitím přejmenuje, řádek návratu ukáže nový název.
     */
    const aktualniZdroj = najdiCilovouPoznamku(posledni.id);
    const nazev = aktualniZdroj
      ? ziskejNazevPoznamky(aktualniZdroj)
      : posledni.nazev || "Předchozí poznámka";

    noteLinkBackTitle.textContent = nazev;
    noteLinkBackButton.setAttribute(
      "aria-label",
      `Zpět na poznámku ${nazev}`
    );
    noteLinkBackRow.hidden = false;
  }

  function resetujInterniNavigaci() {
    historieInterniNavigace = [];
    aktivniInterniCilId = null;
    skryjInterniNavrat();
  }

  function odfokusujEditorPredNavigaci() {
    try {
      editor.blur();
      document.activeElement?.blur?.();
      window.getSelection()?.removeAllRanges();
    } catch (_) {
      // Odfokusování nesmí zablokovat navigaci.
    }
  }

  function otevriPoznamkuBezKlavesnice(ciloveId) {
    if (typeof openTaskEditorById !== "function") {
      console.warn(
        "Interní odkaz: openTaskEditorById není dostupné."
      );
      return false;
    }

    aktivniInterniCilId = String(ciloveId);
    odfokusujEditorPredNavigaci();
    openTaskEditorById(ciloveId);

    requestAnimationFrame(() => {
      odfokusujEditorPredNavigaci();
      aktualizujInterniNavrat();
    });

    return true;
  }

  async function pripravPrepnutiZAktualniPoznamky() {
    let jeEditorZmenen = true;

    if (typeof bylEditorZmenen === "function") {
      jeEditorZmenen = bylEditorZmenen();
    }

    if (!jeEditorZmenen) {
      return true;
    }

    if (typeof ulozAZavriEditor !== "function") {
      console.warn(
        "Interní odkaz: ulozAZavriEditor není dostupné."
      );
      return false;
    }

    const puvodniId = ziskejAktivniPoznamkuId();

    await ulozAZavriEditor();

    /*
     * Když uložení čeká na volbu nebo selže, původní editor zůstane
     * otevřený. Navigaci v takovém případě zastavíme.
     */
    if (taskModalElement?.classList?.contains("show")) {
      return false;
    }

    if (
      puvodniId &&
      ziskejAktivniPoznamkuId() === String(puvodniId)
    ) {
      return false;
    }

    return true;
  }

  async function otevriInterniOdkaz(link) {
    if (probihaInterniPrepnuti) {
      return;
    }

    const ciloveId = String(
      link?.dataset?.noteId || ""
    ).trim();

    if (!ciloveId) {
      return;
    }

    const cilovaPoznamka = najdiCilovouPoznamku(ciloveId);

    /* Secret cíl V3 stále nikdy neprozrazujeme ani neotevíráme. */
    if (!cilovaPoznamka || cilovaPoznamka.isSecret === true) {
      zobrazNedostupnyInterniOdkaz();
      return;
    }

    const zdrojoveId = ziskejAktivniPoznamkuId();

    if (zdrojoveId && String(zdrojoveId) === ciloveId) {
      return;
    }

    const zdrojovyNazev = zdrojoveId
      ? ziskejNazevAktualniPoznamky(zdrojoveId)
      : "";

    probihaInterniPrepnuti = true;
    zavriPanel();

    try {
      const muzemePrepnout =
        await pripravPrepnutiZAktualniPoznamky();

      if (!muzemePrepnout) {
        return;
      }

      /* Cíl mohl být během ukládání/synchronizace odstraněn. */
      const aktualniCil = najdiCilovouPoznamku(ciloveId);

      if (!aktualniCil || aktualniCil.isSecret === true) {
        zobrazNedostupnyInterniOdkaz();
        return;
      }

      if (zdrojoveId) {
        historieInterniNavigace.push({
          id: String(zdrojoveId),
          nazev: zdrojovyNazev || "Předchozí poznámka"
        });
      }

      otevriPoznamkuBezKlavesnice(ciloveId);
    } catch (error) {
      console.error(
        "Otevření interního odkazu selhalo:",
        error
      );
    } finally {
      probihaInterniPrepnuti = false;
      requestAnimationFrame(aktualizujInterniNavrat);
    }
  }

  async function vratSeNaPredchoziPoznamku() {
    if (
      probihaInterniPrepnuti ||
      historieInterniNavigace.length === 0
    ) {
      return;
    }

    const posledni =
      historieInterniNavigace[
        historieInterniNavigace.length - 1
      ];

    const cil = najdiCilovouPoznamku(posledni.id);

    if (!cil || cil.isSecret === true) {
      historieInterniNavigace.pop();
      aktualizujInterniNavrat();
      zobrazNedostupnyInterniOdkaz();
      return;
    }

    probihaInterniPrepnuti = true;
    zavriPanel();

    try {
      const muzemePrepnout =
        await pripravPrepnutiZAktualniPoznamky();

      if (!muzemePrepnout) {
        return;
      }

      const aktualniCil = najdiCilovouPoznamku(posledni.id);

      if (!aktualniCil || aktualniCil.isSecret === true) {
        historieInterniNavigace.pop();
        zobrazNedostupnyInterniOdkaz();
        return;
      }

      historieInterniNavigace.pop();
      otevriPoznamkuBezKlavesnice(posledni.id);
    } catch (error) {
      console.error(
        "Návrat interní navigací selhal:",
        error
      );
    } finally {
      probihaInterniPrepnuti = false;
      requestAnimationFrame(aktualizujInterniNavrat);
    }
  }

  /*
   * V2: interní odkaz může být v hlavním textu, bulletu i TODO.
   * Posloucháme v capture fázi, aby TODO tap nejdřív neotevřel editaci
   * a bullet tap nespustil své vlastní gesto.
   */
  (taskModalElement || document).addEventListener(
    "click",
    (event) => {
      const link = event.target.closest?.(
        ".noteInternalLink"
      );

      if (!link) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      void otevriInterniOdkaz(link);
    },
    true
  );

  noteLinkBackButton?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void vratSeNaPredchoziPoznamku();
  });

  /*
   * Když uživatel poznámku otevře normálně z karty, Planneru,
   * připomínky apod., nejde o pokračování interní cesty a starou
   * historii zahodíme. Při našem interním přepnutí je ochranný flag
   * aktivní, takže krátké zavření editoru během uložení historii nemaže.
   */
  if (taskModalElement) {
    const observerNavigace = new MutationObserver(() => {
      requestAnimationFrame(() => {
        if (probihaInterniPrepnuti) {
          aktualizujInterniNavrat();
          return;
        }

        const jeOtevreny =
          !taskModalElement.hidden &&
          taskModalElement.classList.contains("show");

        if (!jeOtevreny) {
          resetujInterniNavigaci();
          return;
        }

        const aktivniId = ziskejAktivniPoznamkuId();

        if (
          aktivniInterniCilId &&
          aktivniId &&
          String(aktivniId) === String(aktivniInterniCilId)
        ) {
          aktualizujInterniNavrat();
          return;
        }

        if (
          historieInterniNavigace.length > 0 ||
          aktivniInterniCilId
        ) {
          resetujInterniNavigaci();
          return;
        }

        skryjInterniNavrat();
      });
    });

    observerNavigace.observe(taskModalElement, {
      attributes: true,
      attributeFilter: ["class", "hidden", "data-task-id"]
    });
  }

  window.LubaNoteNoteLinks = {
    verze: "3.1-v2",
    zavriAutocomplete: zavriPanel,
    normalizujVyhledavani: bezDiakritiky,
    aktualizujInterniNavrat,
    resetujInterniNavigaci
  };
})();
