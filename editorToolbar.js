(() => {
  /* ==========================================
     LUBANOTE – MOBILNÍ EDITOR TOOLBAR
     Jeden vodorovně posuvný řádek + plovoucí panely.
  ========================================== */

  const tlacitkoToolbar =
    document.getElementById("editorToolbarToggle");

  const rychlyToolbar =
    document.getElementById("editorQuickToolbar");

  const editorToolsToolbar =
    document.getElementById(
      "editorToolsToolbar"
    );



  const horniLista =
    document.querySelector(".editorTopBar");

  const datumCas =
    document.querySelector(".dateTimeInputs");

  const tlacitkoPripominky =
    document.getElementById("reminderButton");

  const editorTextu =
    document.getElementById("modalRichText");

  const modalUkolu =
    document.getElementById("taskModal");

  const tlacitkoZpet =
    document.getElementById("tlacitkoZpet");

  const tlacitkoZnovu =
    document.getElementById("tlacitkoZnovu");

  const tlacitkoTucne =
    document.getElementById("tlacitkoTucne");

  const tlacitkoKurziva =
    document.getElementById("tlacitkoKurziva");

  const tlacitkoPodtrzeni =
    document.getElementById("tlacitkoPodtrzeni");

  const tlacitkoVelikostPisma =
    document.getElementById("tlacitkoVelikostPisma");

  const tlacitkoNadpis =
    document.getElementById("tlacitkoNadpis");

  const tlacitkoBarvaTextu =
    document.getElementById("textColorButton");

  const tlacitkoZarovnaniTextu =
    document.getElementById("tlacitkoZarovnaniTextu");

  const tlacitkoVlozitObrazek =
    document.getElementById("tlacitkoVlozitObrazek");

  const tlacitkoVlozitOdkaz =
    document.getElementById("tlacitkoVlozitOdkaz");

  const panelVelikost =
    document.getElementById("editorPanelVelikost");

  const panelStyl =
    document.getElementById("editorPanelStyl");

  const panelBarvaTextu =
    document.getElementById("textColorPanel");

  const panelZarovnani =
    document.getElementById("editorPanelZarovnani");

  const tlacitkaVelikosti =
    document.querySelectorAll(".editorVelikostPisma");

  const tlacitkaStylu =
    document.querySelectorAll(".editorStylTextu");

  const tlacitkaZarovnani =
    document.querySelectorAll(".editorZarovnaniTextu");

  const NAZEV_VLASTNIHO_VYBERU =
    "luba-toolbar-vyber";

  const tlacitkoBullet =
    document.getElementById("tlacitkoBullet");






  let ulozenyVyberTextu = null;
  let ulozenyEditorTextu = null;
  let otevrenyPanel = null;
  let aktivniSpoustecPanelu = null;

  let tazenaPolozka = null;
  let zacatekTazeniX = 0;
  let zacatekTazeniY = 0;
  let probihaTazeni = false;
  let tazenyPointerId = null;
  let tazenyDotykId = null;
  let casPoslednihoTazeniBulletu = 0;
  let casPoslednihoLongPressBulletu = 0;

  let vybranaPolozkaProPresun = null;
  let casovacLongPressBulletu = null;
  let kandidatLongPressBulletu = null;
  let kandidatPointerIdBulletu = null;
  let kandidatDotykIdBulletu = null;
  let kandidatStartXBulletu = 0;
  let kandidatStartYBulletu = 0;

  const DELKA_LONG_PRESS_BULLETU = 420;
  const MAX_POHYB_LONG_PRESS_BULLETU = 20;

  let nahledTazenePolozky = null;


  function jeDesktopEditor() {
    return window.innerWidth >= 900;
  }

  /*
   * S2D.1c – sdílený editor nemá osobní datum/čas.
   * Na mobilu proto používá jen dva smysluplné režimy:
   * textové formátování <-> další sdílené nástroje.
   */
  function jeSdilenyEditor() {
    return modalUkolu?.classList.contains(
      "sharingEditorMode"
    ) === true;
  }


  /*
   * S2D.1d – vyvážené rozložení shared toolbaru.
   *
   * V běžném editoru necháváme původní DOM přesně tak, jak je.
   * Ve shared editoru přesuneme část textových nástrojů do druhé
   * stránky toolbaru, aby první stránka nemusela rolovat a druhá
   * nezůstala skoro prázdná.
   *
   * Strana 1:
   *   zpět, znovu, B, I, U, velikost
   *
   * Strana 2:
   *   styl H, barva textu, zarovnání, obrázek, odkaz, uložit jako, odrážky
   */
  const sdileneToolbarPrvky = [
    tlacitkoNadpis,
    panelBarvaTextu,
    tlacitkoBarvaTextu,
    tlacitkoZarovnaniTextu,
    tlacitkoVlozitObrazek,
    tlacitkoVlozitOdkaz
  ].filter(Boolean);

  const sdileneToolbarPozice = new Map();

  sdileneToolbarPrvky.forEach((prvek, index) => {
    const znacka = document.createComment(
      `luba-shared-toolbar-${index}`
    );

    prvek.parentNode?.insertBefore(znacka, prvek);

    sdileneToolbarPozice.set(
      prvek,
      znacka
    );
  });

  let sdileneToolbarRozlozeniAktivni = false;

  function pripravSdileneToolbarRozlozeni() {
    if (
      sdileneToolbarRozlozeniAktivni ||
      !editorToolsToolbar
    ) {
      return;
    }

    sdileneToolbarPrvky.forEach((prvek) => {
      editorToolsToolbar.appendChild(prvek);
    });

    sdileneToolbarRozlozeniAktivni = true;
  }

  function obnovPuvodniToolbarRozlozeni() {
    if (!sdileneToolbarRozlozeniAktivni) {
      return;
    }

    sdileneToolbarPrvky.forEach((prvek) => {
      const znacka =
        sdileneToolbarPozice.get(prvek);

      if (!znacka?.parentNode) {
        return;
      }

      znacka.parentNode.insertBefore(
        prvek,
        znacka.nextSibling
      );
    });

    sdileneToolbarRozlozeniAktivni = false;
  }

  if (
    !tlacitkoToolbar ||
    !rychlyToolbar ||
    !horniLista ||
    !datumCas ||
    !editorTextu
  ) {
    return;
  }

  function jePoziceNaKulce(
    polozka,
    x,
    jeDotyk = false
  ) {
    const pozice =
      polozka.getBoundingClientRect();

    /*
     * Myš je přesná, prst ne. Na mobilu proto používáme větší
     * neviditelnou zónu kolem kulky, aniž bychom zvětšovali samotnou
     * odrážku.
     */
    const dosahVlevo =
      jeDotyk ? 42 : 48;

    const dosahVpravo =
      jeDotyk ? 8 : 10;

    return (
      x >= pozice.left - dosahVlevo &&
      x <= pozice.left + dosahVpravo
    );
  }


  function zrusVlastniVyberTextu() {
    window.CSS?.highlights?.delete(
      NAZEV_VLASTNIHO_VYBERU
    );

    ulozenyVyberTextu = null;
    ulozenyEditorTextu = null;
  }

  function ulozVyberTextu() {
    const vyber = window.getSelection();

    if (!vyber || vyber.rangeCount === 0) {
      ulozenyVyberTextu = null;
      return false;
    }

    ulozenyVyberTextu =
      vyber.getRangeAt(0).cloneRange();

    return true;
  }

  function ziskejTextPolozkyProNahled(polozka) {
    const kopie =
      polozka.cloneNode(true);

    kopie
      .querySelectorAll("ul, ol")
      .forEach((seznam) => seznam.remove());

    return (
      kopie.textContent.trim() ||
      "Položka seznamu"
    );
  }


  function vytvorNahledTazenePolozky(polozka) {
    if (jeDesktopEditor()) {
      return;
    }

    odstranNahledTazenePolozky();

    nahledTazenePolozky =
      document.createElement("div");

    nahledTazenePolozky.className =
      "bulletDragPreview";

    nahledTazenePolozky.textContent =
      ziskejTextPolozkyProNahled(polozka);

    document.body.appendChild(
      nahledTazenePolozky
    );
  }


  function posunNahledTazenePolozky(x, y) {
    if (!nahledTazenePolozky) {
      return;
    }

    nahledTazenePolozky.style.left =
      `${x}px`;

    /*
     * Náhled zvedneme dost vysoko nad prst, aby uživatel viděl
     * taženou položku i cílovou čáru.
     */
    nahledTazenePolozky.style.top =
      `${y - 92}px`;
  }


  function odstranNahledTazenePolozky() {
    nahledTazenePolozky?.remove();
    nahledTazenePolozky = null;
  }


  function zobrazVlastniVyberTextu() {
    if (
      !ulozenyVyberTextu ||
      !window.CSS?.highlights ||
      typeof window.Highlight !== "function"
    ) {
      return false;
    }

    CSS.highlights.set(
      NAZEV_VLASTNIHO_VYBERU,
      new Highlight(ulozenyVyberTextu)
    );

    return true;
  }

  function skryjAndroidVyber() {
    if (!ulozVyberTextu()) {
      return;
    }

    zobrazVlastniVyberTextu();

    window
      .getSelection()
      ?.removeAllRanges();
  }
  /* ==========================================
     VÝBĚR TEXTU
  ========================================== */

  function jeUzelVEditoru(uzel) {
    /*
     * Stejná kontrola pro hlavní rich-text i právě editované TODO.
     * Dříve se zde uznával jen editorTextu, takže selectionchange
     * v TODO vůbec neaktualizoval B / I / U / velikost / zarovnání.
     */
    return Boolean(
      ziskejEditorFormatovaniProUzel(uzel)
    );
  }


  function ziskejEditorFormatovaniProUzel(uzel) {
    if (!uzel) {
      return null;
    }

    const prvek =
      uzel.nodeType === Node.ELEMENT_NODE
        ? uzel
        : uzel.parentElement;

    if (!prvek) {
      return null;
    }

    if (
      prvek === editorTextu ||
      editorTextu.contains(prvek)
    ) {
      return editorTextu;
    }

    return prvek.closest?.(
      ".todoRichTextInput.todoEditing"
    ) || null;
  }


  function ziskejEditorFormatovaniProRozsah(rozsah) {
    if (!rozsah) {
      return null;
    }

    const zacatek = ziskejEditorFormatovaniProUzel(
      rozsah.startContainer
    );

    const konec = ziskejEditorFormatovaniProUzel(
      rozsah.endContainer
    );

    return zacatek && zacatek === konec
      ? zacatek
      : null;
  }


  function ulozVyberTextu() {
    const vyber = window.getSelection();

    if (
      !vyber ||
      vyber.rangeCount === 0
    ) {
      return false;
    }

    const rozsah = vyber.getRangeAt(0);
    const cilovyEditor =
      ziskejEditorFormatovaniProRozsah(rozsah);

    if (!cilovyEditor) {
      return false;
    }

    ulozenyVyberTextu =
      rozsah.cloneRange();

    ulozenyEditorTextu =
      cilovyEditor;

    return true;
  }


  function obnovVyberTextu() {
    if (
      !ulozenyVyberTextu ||
      !ulozenyEditorTextu?.isConnected
    ) {
      return false;
    }

    const vyber = window.getSelection();

    if (!vyber) {
      return false;
    }

    vyber.removeAllRanges();
    vyber.addRange(ulozenyVyberTextu);

    return true;
  }


  function pripravEditorProFormatovani() {
    const cilovyEditor =
      ulozenyEditorTextu || editorTextu;

    /*
     * Normální poznámku necháváme přesně ve starém pořadí,
     * protože její toolbar je dlouhodobě odladěný.
     */
    if (cilovyEditor === editorTextu) {
      obnovVyberTextu();

      editorTextu.focus({
        preventScroll: true
      });

      return editorTextu;
    }

    try {
      cilovyEditor.focus({
        preventScroll: true
      });
    } catch {
      cilovyEditor.focus();
    }

    obnovVyberTextu();
    return cilovyEditor;
  }


  function synchronizujTodoPoFormatovani(editor) {
    if (
      editor?.matches?.(
        ".todoRichTextInput.todoEditing"
      )
    ) {
      editor.dispatchEvent(
        new Event("input", { bubbles: true })
      );
    }
  }


  function jeTodoEditorFormatovani(editor) {
    return Boolean(
      editor?.matches?.(
        ".todoRichTextInput.todoEditing"
      )
    );
  }


  /* ==========================================
     DESKTOP – ZACHOVÁNÍ VÝBĚRU TAŽENÍM MYŠI

     Některý následný listener může po mouse/pointer up zkolabovat
     nativní Selection na kurzor. Během tažení proto průběžně držíme
     poslední platný Range a po puštění myši ho obnovíme jen tehdy,
     když skutečný výběr mezitím zmizel.

     Platí pro hlavní editor i právě editované TODO.
  ========================================== */

  let desktopVyberMysi = null;

  function ulozDesktopVyberBehemTazeni() {
    if (!desktopVyberMysi) {
      return;
    }

    const vyber = window.getSelection();

    if (
      !vyber ||
      vyber.rangeCount === 0 ||
      vyber.isCollapsed
    ) {
      return;
    }

    const rozsah =
      vyber.getRangeAt(0);

    const cilovyEditor =
      ziskejEditorFormatovaniProRozsah(
        rozsah
      );

    if (
      !cilovyEditor ||
      cilovyEditor !==
        desktopVyberMysi.editor
    ) {
      return;
    }

    desktopVyberMysi.rozsah =
      rozsah.cloneRange();
  }


  document.addEventListener(
    "pointerdown",
    event => {
      if (
        !jeDesktopEditor() ||
        event.pointerType !== "mouse" ||
        event.button !== 0
      ) {
        return;
      }

      const cilovyEditor =
        ziskejEditorFormatovaniProUzel(
          event.target
        );

      if (!cilovyEditor) {
        desktopVyberMysi = null;
        return;
      }

      desktopVyberMysi = {
        pointerId: event.pointerId,
        editor: cilovyEditor,
        rozsah: null
      };
    },
    true
  );


  document.addEventListener(
    "selectionchange",
    ulozDesktopVyberBehemTazeni
  );


  window.addEventListener(
    "pointerup",
    event => {
      const stav =
        desktopVyberMysi;

      if (
        !stav ||
        event.pointerId !== stav.pointerId
      ) {
        return;
      }

      /*
       * Ještě na pointerup může být nativní Range správný,
       * proto ho uložíme naposledy před ukončením sledování.
       */
      ulozDesktopVyberBehemTazeni();

      desktopVyberMysi = null;

      const ulozenyRozsah =
        stav.rozsah?.cloneRange();

      if (
        !ulozenyRozsah ||
        ulozenyRozsah.collapsed ||
        !stav.editor?.isConnected
      ) {
        return;
      }

      /*
       * Počkáme, až doběhnou všechny pointerup/mouseup listenery.
       * Pokud výběr zůstal v pořádku, vůbec do něj nezasahujeme.
       */
      requestAnimationFrame(() => {
        const aktualniVyber =
          window.getSelection();

        const aktualniRozsah =
          aktualniVyber?.rangeCount
            ? aktualniVyber.getRangeAt(0)
            : null;

        const aktualniEditor =
          ziskejEditorFormatovaniProRozsah(
            aktualniRozsah
          );

        if (
          aktualniRozsah &&
          !aktualniRozsah.collapsed &&
          aktualniEditor === stav.editor
        ) {
          return;
        }

        try {
          stav.editor.focus({
            preventScroll: true
          });
        } catch {
          stav.editor.focus();
        }

        const vyber =
          window.getSelection();

        if (!vyber) {
          return;
        }

        try {
          vyber.removeAllRanges();
          vyber.addRange(
            ulozenyRozsah
          );

          ulozenyVyberTextu =
            ulozenyRozsah.cloneRange();

          ulozenyEditorTextu =
            stav.editor;

          aktualizujStavFormatovani();
        } catch (chyba) {
          console.warn(
            "LubaNote: nepodařilo se obnovit desktopový výběr.",
            chyba
          );
        }
      });
    },
    true
  );


  window.addEventListener(
    "pointercancel",
    event => {
      if (
        desktopVyberMysi?.pointerId ===
        event.pointerId
      ) {
        desktopVyberMysi = null;
      }
    },
    true
  );


  function zachovejVyberTodoPoFormatovani(editor) {
    if (!jeTodoEditorFormatovani(editor)) {
      return;
    }

    /*
     * TODO je na rozdíl od hlavního editoru schované při blur.
     * Po formátování proto znovu uložíme aktuální Range, obnovíme
     * ho a necháme focus v TODO. Uživatel tak pořád vidí, CO upravuje,
     * a může na stejný výběr hned navázat dalším B / I / U / barvou.
     */
    ulozVyberTextu();

    try {
      editor.focus({ preventScroll: true });
    } catch {
      editor.focus();
    }

    obnovVyberTextu();
  }


  /* ==========================================
     TODO – VLASTNÍ UNDO / REDO HISTORIE

     Hlavní editor necháváme na nativním browser undo přes execCommand.
     TODO je ale dynamický contenteditable a část změn (barvy, velikost,
     vlastní obaly) vzniká přes JS. Tyto změny se v Android WebView
     do nativní undo historie nezapisují spolehlivě, proto má TODO
     vlastní lehkou historii HTML snapshotů.
  ========================================== */

  const historieTodoEditoru = new WeakMap();
  let obnovujemeHistoriiTodo = false;


  function ziskejOffsetVyberuTodo(editor, uzel, offset) {
    if (!editor || !uzel) {
      return null;
    }

    const rozsah = document.createRange();
    rozsah.selectNodeContents(editor);

    try {
      rozsah.setEnd(uzel, offset);
      return rozsah.toString().length;
    } catch {
      return null;
    }
  }


  function ziskejVyberProHistoriiTodo(editor) {
    const vyber = window.getSelection();

    if (
      !editor ||
      !vyber ||
      vyber.rangeCount === 0
    ) {
      return null;
    }

    const rozsah = vyber.getRangeAt(0);

    if (
      !editor.contains(rozsah.startContainer) ||
      !editor.contains(rozsah.endContainer)
    ) {
      return null;
    }

    const start = ziskejOffsetVyberuTodo(
      editor,
      rozsah.startContainer,
      rozsah.startOffset
    );

    const end = ziskejOffsetVyberuTodo(
      editor,
      rozsah.endContainer,
      rozsah.endOffset
    );

    if (start === null || end === null) {
      return null;
    }

    return { start, end };
  }


  function vytvorSnapshotTodo(editor) {
    return {
      html: editor?.innerHTML ?? "",
      vyber: ziskejVyberProHistoriiTodo(editor)
    };
  }


  function zajistiHistoriiTodo(editor) {
    if (!jeTodoEditorFormatovani(editor)) {
      return null;
    }

    let historie = historieTodoEditoru.get(editor);

    if (!historie) {
      historie = {
        zaznamy: [vytvorSnapshotTodo(editor)],
        index: 0
      };

      historieTodoEditoru.set(editor, historie);
    }

    return historie;
  }


  function ulozSnapshotTodo(editor) {
    if (
      obnovujemeHistoriiTodo ||
      !jeTodoEditorFormatovani(editor)
    ) {
      return;
    }

    const historie = zajistiHistoriiTodo(editor);

    if (!historie) {
      return;
    }

    const snapshot = vytvorSnapshotTodo(editor);
    const aktualni = historie.zaznamy[historie.index];

    if (aktualni?.html === snapshot.html) {
      /*
       * HTML se nezměnilo, ale kurzor/výběr ano. Ten si aktualizujeme,
       * aby se po undo/redo vrátil na přirozené místo.
       */
      aktualni.vyber = snapshot.vyber;
      return;
    }

    historie.zaznamy.splice(historie.index + 1);
    historie.zaznamy.push(snapshot);

    /* Historie nemusí růst bez omezení. */
    if (historie.zaznamy.length > 100) {
      historie.zaznamy.shift();
    } else {
      historie.index += 1;
    }

    if (historie.zaznamy.length === 100) {
      historie.index = historie.zaznamy.length - 1;
    }
  }


  function nastavVyberTodoPodleOffsetu(editor, start, end) {
    if (!editor) {
      return false;
    }

    const delkaTextu = editor.textContent?.length ?? 0;
    const bezpecnyStart = Math.max(0, Math.min(start ?? delkaTextu, delkaTextu));
    const bezpecnyEnd = Math.max(bezpecnyStart, Math.min(end ?? bezpecnyStart, delkaTextu));

    const walker = document.createTreeWalker(
      editor,
      NodeFilter.SHOW_TEXT
    );

    let startUzel = null;
    let startOffset = 0;
    let endUzel = null;
    let endOffset = 0;
    let soucet = 0;
    let uzel = walker.nextNode();

    while (uzel) {
      const delka = uzel.textContent?.length ?? 0;
      const konec = soucet + delka;

      if (!startUzel && bezpecnyStart <= konec) {
        startUzel = uzel;
        startOffset = Math.max(0, bezpecnyStart - soucet);
      }

      if (!endUzel && bezpecnyEnd <= konec) {
        endUzel = uzel;
        endOffset = Math.max(0, bezpecnyEnd - soucet);
        break;
      }

      soucet = konec;
      uzel = walker.nextNode();
    }

    if (!startUzel || !endUzel) {
      const rozsah = document.createRange();
      rozsah.selectNodeContents(editor);
      rozsah.collapse(false);

      const vyber = window.getSelection();
      vyber?.removeAllRanges();
      vyber?.addRange(rozsah);
      return true;
    }

    const rozsah = document.createRange();
    rozsah.setStart(startUzel, startOffset);
    rozsah.setEnd(endUzel, endOffset);

    const vyber = window.getSelection();
    vyber?.removeAllRanges();
    vyber?.addRange(rozsah);
    return true;
  }


  function obnovSnapshotTodo(editor, snapshot) {
    if (!editor || !snapshot) {
      return false;
    }

    obnovujemeHistoriiTodo = true;

    try {
      editor.innerHTML = snapshot.html;

      try {
        editor.focus({ preventScroll: true });
      } catch {
        editor.focus();
      }

      if (snapshot.vyber) {
        nastavVyberTodoPodleOffsetu(
          editor,
          snapshot.vyber.start,
          snapshot.vyber.end
        );
      } else {
        nastavVyberTodoPodleOffsetu(
          editor,
          editor.textContent?.length ?? 0,
          editor.textContent?.length ?? 0
        );
      }

      /*
       * todos.js si z input události obnoví text + html v activeTodos
       * i náhled řádku. Během tohoto dispatch historie nový záznam
       * nevytváří, protože pouze přehráváme existující snapshot.
       */
      editor.dispatchEvent(
        new Event("input", { bubbles: true })
      );
    } finally {
      obnovujemeHistoriiTodo = false;
    }

    ulozVyberTextu();
    zachovejVyberTodoPoFormatovani(editor);
    aktualizujStavFormatovani();
    return true;
  }


  function provedHistoriiTodo(smer) {
    const editor = ulozenyEditorTextu;

    if (!jeTodoEditorFormatovani(editor)) {
      return false;
    }

    const historie = zajistiHistoriiTodo(editor);

    if (!historie) {
      return false;
    }

    const novyIndex = historie.index + smer;

    if (
      novyIndex < 0 ||
      novyIndex >= historie.zaznamy.length
    ) {
      return true;
    }

    historie.index = novyIndex;

    return obnovSnapshotTodo(
      editor,
      historie.zaznamy[historie.index]
    );
  }


  document.addEventListener(
    "focusin",
    event => {
      const editor = event.target?.closest?.(
        ".todoRichTextInput.todoEditing"
      );

      if (editor) {
        zajistiHistoriiTodo(editor);
      }
    },
    true
  );


  document.addEventListener(
    "input",
    event => {
      const editor = event.target?.matches?.(
        ".todoRichTextInput.todoEditing"
      )
        ? event.target
        : null;

      if (editor) {
        ulozSnapshotTodo(editor);
      }
    }
  );


  /* ==========================================
     HLAVNÍ TOOLBAR
  ========================================== */

  function zavriVsechnyPanely() {
    [
      panelVelikost,
      panelStyl,
      panelZarovnani,
      panelBarvaTextu
    ].forEach(panel => {
      if (panel) {
        panel.hidden = true;
        panel.style.removeProperty("left");
        panel.style.removeProperty("--panel-sipka-x");
      }
    });

    [
      tlacitkoVelikostPisma,
      tlacitkoNadpis,
      tlacitkoZarovnaniTextu
    ].forEach(tlacitko => {
      tlacitko?.classList.remove("active");
      tlacitko?.setAttribute("aria-expanded", "false");
    });

    otevrenyPanel = null;
    aktivniSpoustecPanelu = null;
  }


  let rezimToolbaru = "cas";

  function nastavToolbar(rezim) {
    if (jeSdilenyEditor()) {
      pripravSdileneToolbarRozlozeni();
    } else {
      obnovPuvodniToolbarRozlozeni();
    }

    /*
     * DESKTOP:
     * využijeme šířku a ukážeme vše najednou.
     */
    if (jeDesktopEditor()) {
      rezimToolbaru = "desktop";

      datumCas.hidden = false;
      rychlyToolbar.hidden = false;
      editorToolsToolbar.hidden = false;

      tlacitkoToolbar.hidden = true;

      if (tlacitkoPripominky) {
        tlacitkoPripominky.hidden = false;
      }

      zavriVsechnyPanely();

      return;
    }


    /*
     * MOBIL:
     * běžný editor: čas → text → další nástroje
     * shared editor: text ↔ další nástroje
     */
    if (
      jeSdilenyEditor() &&
      rezim === "cas"
    ) {
      rezim = "text";
    }

    rezimToolbaru = rezim;

    const jeCas =
      rezim === "cas";

    const jeText =
      rezim === "text";

    const jsouNastroje =
      rezim === "nastroje";


    tlacitkoToolbar.hidden = false;

    datumCas.hidden =
      !jeCas;

    rychlyToolbar.hidden =
      !jeText;

    editorToolsToolbar.hidden =
      !jsouNastroje;


    if (tlacitkoPripominky) {
      tlacitkoPripominky.hidden =
        !jeCas;
    }


    tlacitkoToolbar.classList.toggle(
      "active",
      !jeCas
    );


    if (jeCas) {
      tlacitkoToolbar.textContent = "Aa";

      tlacitkoToolbar.setAttribute(
        "aria-label",
        "Otevřít textové nástroje"
      );
    }

    if (jeText) {
      if (window.LubaNoteIcons?.nastavJenIkonu) {
        window.LubaNoteIcons.nastavJenIkonu(
          tlacitkoToolbar,
          "odrazky",
          ["editorModeSvgIcon"]
        );
      } else {
        tlacitkoToolbar.textContent = "Nástroje";
      }

      tlacitkoToolbar.setAttribute(
        "aria-label",
        "Otevřít další nástroje"
      );
    }

    if (jsouNastroje) {
      /*
       * Shared editor nemá osobní datum/čas.
       * Druhá stránka proto vrací jasné Aa místo ikony hodin.
       */
      if (jeSdilenyEditor()) {
        tlacitkoToolbar.textContent = "Aa";

        tlacitkoToolbar.setAttribute(
          "aria-label",
          "Zpět na formátování textu"
        );
      } else {
        if (window.LubaNoteIcons?.nastavJenIkonu) {
          window.LubaNoteIcons.nastavJenIkonu(
            tlacitkoToolbar,
            "hodiny",
            ["editorModeSvgIcon"]
          );
        } else {
          tlacitkoToolbar.textContent = "Čas";
        }

        tlacitkoToolbar.setAttribute(
          "aria-label",
          "Zobrazit datum a čas"
        );
      }
    }


    tlacitkoToolbar.setAttribute(
      "aria-expanded",
      String(!jeCas)
    );

    tlacitkoToolbar.setAttribute(
      "aria-pressed",
      String(!jeCas)
    );


    zavriVsechnyPanely();

    if (!jeText) {
      rychlyToolbar.scrollLeft = 0;
    }

    if (!jsouNastroje) {
      editorToolsToolbar.scrollLeft = 0;
    }
  }


  /* ==========================================
     PLOVOUCÍ PANELY
  ========================================== */

  function pozicujPanel(panel, spoustec) {
    if (!panel || !spoustec) {
      return;
    }

    requestAnimationFrame(() => {
      const listaRect =
        horniLista.getBoundingClientRect();

      const spoustecRect =
        spoustec.getBoundingClientRect();

      const panelRect =
        panel.getBoundingClientRect();

      const okraj = 6;
      const stredSpoustece =
        spoustecRect.left -
        listaRect.left +
        spoustecRect.width / 2;

      let vlevo =
        stredSpoustece - panelRect.width / 2;

      vlevo = Math.max(
        okraj,
        Math.min(
          vlevo,
          listaRect.width - panelRect.width - okraj
        )
      );

      const sipkaX = Math.max(
        16,
        Math.min(
          stredSpoustece - vlevo,
          panelRect.width - 16
        )
      );

      panel.style.left = `${vlevo}px`;
      panel.style.setProperty(
        "--panel-sipka-x",
        `${sipkaX}px`
      );
    });
  }


  function prepniPanel(panel, spoustec) {
    if (!panel || !spoustec) {
      return;
    }

    const uzJeOtevreny =
      otevrenyPanel === panel && !panel.hidden;

    zavriVsechnyPanely();

    if (uzJeOtevreny) {
      return;
    }

    ulozVyberTextu();

    panel.hidden = false;
    otevrenyPanel = panel;
    aktivniSpoustecPanelu = spoustec;

    spoustec.classList.add("active");
    spoustec.setAttribute("aria-expanded", "true");

    pozicujPanel(panel, spoustec);
  }

  editorTextu?.addEventListener("pointerdown", () => {
    zrusVlastniVyberTextu();
  });
  /* ==========================================
     EXEC COMMAND POMOCNÍCI
  ========================================== */

  function provedPrikaz(prikaz, hodnota = null) {
    const cilovyEditor =
      pripravEditorProFormatovani();

    try {
      document.execCommand(
        prikaz,
        false,
        hodnota
      );
    } catch (chyba) {
      console.warn(
        `Formátování se nepodařilo provést: ${prikaz}`,
        chyba
      );
    }

    synchronizujTodoPoFormatovani(
      cilovyEditor
    );

    ulozVyberTextu();
    zachovejVyberTodoPoFormatovani(
      cilovyEditor
    );
    aktualizujStavFormatovani();
  }

  function prepniSbaleniPolozky(polozka) {
    if (!polozka) {
      return;
    }

    const vnorenySeznam =
      Array.from(polozka.children).find(
        (potomek) => potomek.tagName === "UL"
      );

    if (!vnorenySeznam) {
      return;
    }

    const jeSbaleny =
      vnorenySeznam.hidden;

    vnorenySeznam.hidden =
      !jeSbaleny;

    polozka.classList.toggle(
      "bulletSbaleny",
      !jeSbaleny
    );
  }






  function nastavVelikostPisma(hodnota) {
    if (!hodnota) {
      return;
    }

    const cilovyEditor =
      pripravEditorProFormatovani();

    document.execCommand(
      "fontSize",
      false,
      "7"
    );

    /*
     * Dříve se <font size="7"> převáděl na px pouze v hlavním
     * editoru. V TODO proto například volba 18 skončila jako obří
     * browserová velikost 7. Převádíme vždy jen editor, který se
     * právě formátuje.
     */
    (cilovyEditor || editorTextu)
      .querySelectorAll('font[size="7"]')
      .forEach(prvek => {
        prvek.removeAttribute("size");
        prvek.style.fontSize = `${hodnota}px`;
        prvek.dataset.velikostPisma = hodnota;
      });

    synchronizujTodoPoFormatovani(
      cilovyEditor
    );

    tlacitkoVelikostPisma.textContent = hodnota;

    ulozVyberTextu();
    zachovejVyberTodoPoFormatovani(
      cilovyEditor
    );
    oznacAktivniVelikost(hodnota);
    zavriVsechnyPanely();
  }


  function nastavStylTextu(styl) {
    if (!styl || !ulozenyVyberTextu) {
      return;
    }

    obnovVyberTextu();

    const vyber =
      window.getSelection();

    if (
      !vyber ||
      vyber.rangeCount === 0
    ) {
      return;
    }

    const rozsah =
      vyber.getRangeAt(0);

    if (rozsah.collapsed) {
      return;
    }

    const obal =
      document.createElement("span");

    if (styl === "div") {
      obal.className =
        "editorTextNormalni";
    } else {
      obal.className =
        `editorNadpis ${styl}`;
    }

    const obsah =
      rozsah.extractContents();

    obal.appendChild(obsah);
    rozsah.insertNode(obal);

    const novyRozsah =
      document.createRange();

    novyRozsah.selectNodeContents(
      obal
    );

    vyber.removeAllRanges();
    vyber.addRange(
      novyRozsah
    );

    ulozenyVyberTextu =
      novyRozsah.cloneRange();

    editorTextu.dispatchEvent(
      new Event(
        "input",
        {
          bubbles: true
        }
      )
    );

    zavriVsechnyPanely();
    aktualizujStavFormatovani();
  }


  function nastavZarovnani(zarovnani) {
    const prikazy = {
      left: "justifyLeft",
      center: "justifyCenter",
      right: "justifyRight"
    };

    const prikaz = prikazy[zarovnani];

    if (!prikaz) {
      return;
    }

    provedPrikaz(prikaz);
    zavriVsechnyPanely();
    aktualizujStavFormatovani();
  }


  /* ==========================================
     VIZUÁLNÍ STAV FORMÁTOVÁNÍ
  ========================================== */

  function nastavStavTlacitka(
    tlacitko,
    aktivni
  ) {
    if (!tlacitko) {
      return;
    }

    tlacitko.classList.toggle(
      "active",
      Boolean(aktivni)
    );

    tlacitko.setAttribute(
      "aria-pressed",
      String(Boolean(aktivni))
    );
  }


  function oznacAktivniVelikost(hodnota) {
    tlacitkaVelikosti.forEach(tlacitko => {
      tlacitko.classList.toggle(
        "active",
        tlacitko.dataset.velikost === String(hodnota)
      );
    });
  }


  function zjistiVelikostPodKurzorem() {
    const vyber = window.getSelection();

    if (!vyber || vyber.rangeCount === 0) {
      return null;
    }

    let prvek = vyber.anchorNode;

    if (prvek?.nodeType === Node.TEXT_NODE) {
      prvek = prvek.parentElement;
    }

    if (!(prvek instanceof Element)) {
      return null;
    }

    const prvekSVelikosti =
      prvek.closest("[data-velikost-pisma]");

    if (prvekSVelikosti) {
      return prvekSVelikosti.dataset.velikostPisma;
    }

    const velikost =
      parseFloat(
        getComputedStyle(prvek).fontSize
      );

    if (!Number.isFinite(velikost)) {
      return null;
    }

    return String(Math.round(velikost));
  }


  function zjistiStylTextuPodKurzorem() {
    const vyber = window.getSelection();

    if (
      !vyber ||
      vyber.rangeCount === 0 ||
      !jeUzelVEditoru(vyber.anchorNode)
    ) {
      return "div";
    }

    let prvek = vyber.anchorNode;

    if (prvek?.nodeType === Node.TEXT_NODE) {
      prvek = prvek.parentElement;
    }

    if (!(prvek instanceof Element)) {
      return "div";
    }

    const cilovyEditor =
      ziskejEditorFormatovaniProUzel(
        vyber.anchorNode
      ) || editorTextu;

    let aktualniPrvek = prvek;

    while (
      aktualniPrvek &&
      aktualniPrvek !== cilovyEditor
    ) {
      if (
        aktualniPrvek.classList.contains(
          "editorTextNormalni"
        )
      ) {
        return "div";
      }

      if (
        aktualniPrvek.classList.contains(
          "editorNadpis"
        )
      ) {
        if (aktualniPrvek.classList.contains("h1")) {
          return "h1";
        }

        if (aktualniPrvek.classList.contains("h2")) {
          return "h2";
        }

        if (aktualniPrvek.classList.contains("h3")) {
          return "h3";
        }
      }

      aktualniPrvek =
        aktualniPrvek.parentElement;
    }

    return "div";
  }


  function oznacAktivniStylTextu(styl) {
    tlacitkaStylu.forEach(tlacitko => {
      tlacitko.classList.toggle(
        "active",
        tlacitko.dataset.styl === styl
      );
    });
  }


  function zjistiZarovnaniPodKurzorem() {
    const vyber = window.getSelection();

    if (
      !vyber ||
      vyber.rangeCount === 0 ||
      !jeUzelVEditoru(vyber.anchorNode)
    ) {
      return "left";
    }

    let prvek = vyber.anchorNode;

    if (prvek?.nodeType === Node.TEXT_NODE) {
      prvek = prvek.parentElement;
    }

    if (!(prvek instanceof Element)) {
      return "left";
    }

    const zarovnani =
      getComputedStyle(prvek).textAlign;

    if (zarovnani === "center") {
      return "center";
    }

    if (
      zarovnani === "right" ||
      zarovnani === "end"
    ) {
      return "right";
    }

    return "left";
  }

  function zrusBulletDropIndikator() {
    editorTextu
      .querySelectorAll(
        ".bulletDropBefore, .bulletDropAfter"
      )
      .forEach((prvek) => {
        prvek.classList.remove(
          "bulletDropBefore",
          "bulletDropAfter"
        );
      });
  }


  function zahajVzhledTazeniBulletu(x, y) {
    if (!tazenaPolozka) {
      return;
    }

    probihaTazeni = true;

    tazenaPolozka.classList.add(
      "bulletDragging"
    );

    tazenaPolozka.parentElement?.classList.add(
      "bulletDragActive"
    );

    if (!nahledTazenePolozky) {
      vytvorNahledTazenePolozky(
        tazenaPolozka
      );
    }

    posunNahledTazenePolozky(x, y);

    const vyber =
      window.getSelection();

    if (vyber && !vyber.isCollapsed) {
      vyber.removeAllRanges();
    }
  }


  function presunBulletPodlePozice(x, y) {
    if (!tazenaPolozka) {
      return;
    }
    
    const posunX =
  x - zacatekTazeniX;

const chceZanorit =
  posunX > 36;

const chceVysunout =
  posunX < -36;

nahledTazenePolozky?.classList.toggle(
  "bulletChceZanorit",
  chceZanorit
);

nahledTazenePolozky?.classList.toggle(
  "bulletChceVysunout",
  chceVysunout
);

    posunNahledTazenePolozky(x, y);
    
    
    
    zrusBulletDropIndikator();

    const seznam =
      tazenaPolozka.parentElement;

    if (!seznam) {
      return;
    }

    const polozky =
      Array.from(seznam.children).filter(
        (prvek) =>
          prvek.tagName === "LI" &&
          prvek !== tazenaPolozka
      );

    for (const polozka of polozky) {
      const pozice =
        polozka.getBoundingClientRect();

      const stred =
        pozice.top +
        pozice.height / 2;

      if (y < stred) {
        polozka.classList.add(
          "bulletDropBefore"
        );

        seznam.insertBefore(
          tazenaPolozka,
          polozka
        );

        return;
      }
    }

    const posledniPolozka =
      polozky[polozky.length - 1];

    if (posledniPolozka) {
      posledniPolozka.classList.add(
        "bulletDropAfter"
      );
    }

    seznam.appendChild(
      tazenaPolozka
    );
  }


  function zrusCasovacLongPressBulletu() {
    if (casovacLongPressBulletu !== null) {
      clearTimeout(casovacLongPressBulletu);
    }

    casovacLongPressBulletu = null;
    kandidatLongPressBulletu = null;
    kandidatPointerIdBulletu = null;
    kandidatDotykIdBulletu = null;
  }


  function zrusVyberPolozkyProPresun() {
    vybranaPolozkaProPresun?.classList.remove(
      "bulletMoveSelected"
    );

    vybranaPolozkaProPresun = null;
    editorTextu.classList.remove(
      "bulletMoveMode"
    );
  }


  function aktivujPolozkuProPresun(polozka) {
    if (!polozka) {
      return;
    }

    if (vybranaPolozkaProPresun !== polozka) {
      zrusVyberPolozkyProPresun();
    }

    vybranaPolozkaProPresun = polozka;

    polozka.classList.add(
      "bulletMoveSelected"
    );

    editorTextu.classList.add(
      "bulletMoveMode"
    );

    /*
     * Long-press znamená práci s celým řádkem, ne výběr textu.
     * Zrušíme proto případný nativní výběr a schováme klávesnici.
     */
    window.getSelection()?.removeAllRanges();
    zrusVlastniVyberTextu();

    try {
      editorTextu.blur();
    } catch (_) {
      /* Blur není pro MOVE MODE kritický. */
    }

    if (navigator.vibrate) {
      navigator.vibrate(18);
    }
  }


  function jePrvekMimoBulletMove(target) {
    return Boolean(
      target?.closest?.(
        ".lubaNoteImage, .lubaNoteImageSettings, .lubaNoteImageRemove, " +
        ".plannedTextLink, .lubaNoteInternetLink, .noteInternalLink, a[href]"
      )
    );
  }


  function oznamPresunBulletu() {
    try {
      editorTextu.dispatchEvent(
        new InputEvent(
          "input",
          {
            bubbles: true,
            inputType: "insertFromDrop"
          }
        )
      );
    } catch (_) {
      editorTextu.dispatchEvent(
        new Event(
          "input",
          { bubbles: true }
        )
      );
    }
  }
  function vysunTazenouPolozku() {
  if (!tazenaPolozka) {
    return false;
  }

  const vnorenySeznam =
    tazenaPolozka.parentElement;

  if (
    !vnorenySeznam ||
    vnorenySeznam.tagName !== "UL"
  ) {
    return false;
  }

  const rodicovskaPolozka =
    vnorenySeznam.parentElement;

  if (
    !rodicovskaPolozka ||
    rodicovskaPolozka.tagName !== "LI"
  ) {
    return false;
  }

  const nadrazenySeznam =
    rodicovskaPolozka.parentElement;

  if (
    !nadrazenySeznam ||
    nadrazenySeznam.tagName !== "UL"
  ) {
    return false;
  }

  nadrazenySeznam.insertBefore(
    tazenaPolozka,
    rodicovskaPolozka.nextSibling
  );

  const maJesteDeti =
    Array.from(
      vnorenySeznam.children
    ).some(
      (prvek) =>
        prvek.tagName === "LI"
    );

  if (!maJesteDeti) {
    vnorenySeznam.remove();

    rodicovskaPolozka.classList.remove(
      "bulletSbaleny"
    );
  }

  return true;
}
  function zanorTazenouPolozku() {
  if (!tazenaPolozka) {
    return false;
  }

  const predchoziPolozka =
    tazenaPolozka.previousElementSibling;

  if (
    !predchoziPolozka ||
    predchoziPolozka.tagName !== "LI"
  ) {
    return false;
  }

  let vnorenySeznam =
    Array.from(
      predchoziPolozka.children
    ).find(
      (prvek) =>
        prvek.tagName === "UL"
    );

  if (!vnorenySeznam) {
    vnorenySeznam =
      document.createElement("ul");

    predchoziPolozka.appendChild(
      vnorenySeznam
    );
  }

  vnorenySeznam.hidden = false;

  predchoziPolozka.classList.remove(
    "bulletSbaleny"
  );

  vnorenySeznam.appendChild(
    tazenaPolozka
  );

  return true;
}


  function uklidTazeniBulletu({
    zrusVyber = true,
    oznamZmenu = false
  } = {}) {
    if (probihaTazeni) {
      casPoslednihoTazeniBulletu =
        Date.now();
    }

    zrusBulletDropIndikator();

    if (tazenaPolozka) {
      tazenaPolozka.classList.remove(
        "bulletDragging"
      );

      tazenaPolozka.parentElement?.classList.remove(
        "bulletDragActive"
      );
    }

    odstranNahledTazenePolozky();

    tazenaPolozka = null;
    tazenyPointerId = null;
    tazenyDotykId = null;
    probihaTazeni = false;

    if (zrusVyber) {
      zrusVyberPolozkyProPresun();
    }

    if (oznamZmenu) {
      oznamPresunBulletu();
    }
  }


  function oznacAktivniZarovnani(zarovnani) {
    tlacitkaZarovnani.forEach(tlacitko => {
      tlacitko.classList.toggle(
        "active",
        tlacitko.dataset.zarovnani === zarovnani
      );
    });
  }


  function aktualizujStavFormatovani() {
    const vyber = window.getSelection();

    if (
      !vyber ||
      !vyber.anchorNode ||
      !jeUzelVEditoru(vyber.anchorNode)
    ) {
      return;
    }

    try {
      nastavStavTlacitka(
        tlacitkoTucne,
        document.queryCommandState("bold")
      );

      nastavStavTlacitka(
        tlacitkoKurziva,
        document.queryCommandState("italic")
      );

      nastavStavTlacitka(
        tlacitkoPodtrzeni,
        document.queryCommandState("underline")
      );
    } catch (_chyba) {
      // Některé WebView queryCommandState nepodporují spolehlivě.
    }

    const stylTextu =
      zjistiStylTextuPodKurzorem();

    oznacAktivniStylTextu(stylTextu);

    nastavStavTlacitka(
      tlacitkoNadpis,
      stylTextu !== "div"
    );

    const zarovnani =
      zjistiZarovnaniPodKurzorem();

    oznacAktivniZarovnani(zarovnani);

    const velikost =
      zjistiVelikostPodKurzorem();

    if (velikost) {
      tlacitkoVelikostPisma.textContent = velikost;
      oznacAktivniVelikost(velikost);
    }
  }


  function zachovejTodoVyberPredKlikem(event) {
    const vyber = window.getSelection();

    let cilovyEditor = null;

    if (
      vyber &&
      vyber.rangeCount > 0
    ) {
      const rozsah = vyber.getRangeAt(0);

      cilovyEditor =
        ziskejEditorFormatovaniProRozsah(rozsah);

      if (jeTodoEditorFormatovani(cilovyEditor)) {
        ulozVyberTextu();
      }
    }

    /*
     * U vysouvacích panelů může být nativní Selection záměrně
     * schované funkcí skryjAndroidVyber(). V tom okamžiku už Range
     * není ve window.getSelection(), ale pořád ho bezpečně držíme
     * v ulozenyVyberTextu. I v tomto stavu musíme zabránit blur TODO.
     */
    const mameUlozenyTodoVyber = Boolean(
      jeTodoEditorFormatovani(ulozenyEditorTextu) &&
      ulozenyVyberTextu
    );

    if (
      !jeTodoEditorFormatovani(cilovyEditor) &&
      !mameUlozenyTodoVyber
    ) {
      return;
    }

    /*
     * Android nesmí při stisku tlačítka převést focus z TODO
     * na toolbar a zahodit označený Range. Click se vyvolá dál.
     */
    event.preventDefault();
  }


  [
    tlacitkoToolbar,
    rychlyToolbar,
    panelVelikost,
    panelStyl,
    panelZarovnani,
    panelBarvaTextu
  ].forEach(prvekToolbaru => {
    prvekToolbaru?.addEventListener(
      "pointerdown",
      zachovejTodoVyberPredKlikem
    );
  });


  /*
   * Důležité pro contenteditable TODO:
   * pointerdown na libovolném ovládacím prvku horního toolbaru
   * nesmí přesunout focus z TODO. Kdyby došlo k blur, todos.js
   * přepne rich editor zpět na display a uživatel ztratí viditelný
   * výběr přesně ve chvíli, kdy ho chce formátovat.
   *
   * Listener na kontejnerech pokrývá i volby ve vysouvacích panelech
   * (velikost, H, zarovnání, barva), ne jen B / I / U.
   */


  /* ==========================================
     UDÁLOSTI – TOOLBAR
  ========================================== */

  tlacitkoToolbar.addEventListener(
    "click",
    () => {
      /*
       * Ve shared editoru není osobní režim datum/čas.
       * Přepínáme proto jen text <-> nástroje a nevytvoříme
       * už nikdy prázdnou horní lištu s osamoceným Aa.
       */
      if (jeSdilenyEditor()) {
        nastavToolbar(
          rezimToolbaru === "text"
            ? "nastroje"
            : "text"
        );
        return;
      }

      if (rezimToolbaru === "cas") {
        nastavToolbar("text");
        return;
      }

      if (rezimToolbaru === "text") {
        nastavToolbar("nastroje");
        return;
      }

      nastavToolbar("cas");
    }
  );


  tlacitkoZpet?.addEventListener(
    "click",
    () => {
      /* TODO má vlastní spolehlivou historii, hlavní editor zůstává beze změny. */
      if (!provedHistoriiTodo(-1)) {
        provedPrikaz("undo");
      }
    }
  );


  tlacitkoZnovu?.addEventListener(
    "click",
    () => {
      /* TODO má vlastní spolehlivou historii, hlavní editor zůstává beze změny. */
      if (!provedHistoriiTodo(1)) {
        provedPrikaz("redo");
      }
    }
  );


  tlacitkoTucne?.addEventListener(
    "click",
    () => {
      ulozVyberTextu();
      provedPrikaz("bold");
    }
  );


  tlacitkoKurziva?.addEventListener(
    "click",
    () => {
      ulozVyberTextu();
      provedPrikaz("italic");
    }
  );


  tlacitkoPodtrzeni?.addEventListener(
    "click",
    () => {
      ulozVyberTextu();
      provedPrikaz("underline");
    }
  );


  tlacitkoVelikostPisma?.addEventListener(
    "click",
    () => {
      skryjAndroidVyber();
      prepniPanel(
        panelVelikost,
        tlacitkoVelikostPisma
      );
    }
  );


  tlacitkoNadpis?.addEventListener(
    "click",
    () => {
      skryjAndroidVyber();

      prepniPanel(
        panelStyl,
        tlacitkoNadpis
      );
    }
  );

  tlacitkoBarvaTextu?.addEventListener(
    "click",
    () => {
      prepniPanel(
        panelBarvaTextu,
        tlacitkoBarvaTextu
      );
    }
  );


  tlacitkoZarovnaniTextu?.addEventListener(
    "click",
    () => {
      prepniPanel(
        panelZarovnani,
        tlacitkoZarovnaniTextu
      );
    }
  );


  tlacitkoVlozitObrazek?.addEventListener(
    "click",
    () => {
      zavriVsechnyPanely();
      window.vlozObrazekDoPoznamky?.();
    }
  );


  tlacitkoVlozitOdkaz?.addEventListener(
    "click",
    () => {
      zavriVsechnyPanely();
      window.vlozOdkazDoPoznamky?.();
    }
  );

  /* ==========================================
     BULLET – JEDNOTNÉ OVLÁDÁNÍ ŘÁDKU

     MOBIL / TABLET:
     1× tap = editace
     2× tap = nativní výběr slova
     long-press kdekoliv v <li> = MOVE MODE
     po aktivaci MOVE MODE lze řádek táhnout kdekoliv

     DESKTOP:
     klik na kulku = sbalit / rozbalit
     chycení kulky + drag = přesun
     drag doprava / doleva = zanořit / vynořit
     ========================================== */

  function spustLongPressBulletu({
    polozka,
    x,
    y,
    pointerId = null,
    dotykId = null
  }) {
    zrusCasovacLongPressBulletu();

    kandidatLongPressBulletu = polozka;
    kandidatPointerIdBulletu = pointerId;
    kandidatDotykIdBulletu = dotykId;
    kandidatStartXBulletu = x;
    kandidatStartYBulletu = y;

    casovacLongPressBulletu = setTimeout(() => {
      const kandidat =
        kandidatLongPressBulletu;

      if (!kandidat) {
        return;
      }

      casovacLongPressBulletu = null;
      casPoslednihoLongPressBulletu =
        Date.now();

      aktivujPolozkuProPresun(
        kandidat
      );

      /*
       * Prst / myš mohou po long-pressu rovnou pokračovat v pohybu.
       * Pokud uživatel prst pustí, položka zůstane pouze označená a
       * lze ji chytit znovu kdekoliv v řádku.
       */
      tazenaPolozka = kandidat;
      zacatekTazeniX = kandidatStartXBulletu;
      zacatekTazeniY = kandidatStartYBulletu;
      tazenyPointerId =
        kandidatPointerIdBulletu;
      tazenyDotykId =
        kandidatDotykIdBulletu;
      probihaTazeni = false;

      if (tazenyPointerId !== null) {
        try {
          kandidat.setPointerCapture(
            tazenyPointerId
          );
        } catch (_) {
          /* Pointer capture není pro MOVE MODE povinný. */
        }
      }

      kandidatLongPressBulletu = null;
      kandidatPointerIdBulletu = null;
      kandidatDotykIdBulletu = null;
    }, DELKA_LONG_PRESS_BULLETU);
  }


  function zrusLongPressPriPohybu(x, y) {
    if (
      casovacLongPressBulletu === null ||
      !kandidatLongPressBulletu
    ) {
      return false;
    }

    const vzdalenost =
      Math.hypot(
        x - kandidatStartXBulletu,
        y - kandidatStartYBulletu
      );

    if (
      vzdalenost <=
      MAX_POHYB_LONG_PRESS_BULLETU
    ) {
      return false;
    }

    zrusCasovacLongPressBulletu();
    return true;
  }


  function pripravAktivniBulletProTazeni(
    polozka,
    x,
    y,
    { pointerId = null, dotykId = null } = {}
  ) {
    if (
      !polozka ||
      vybranaPolozkaProPresun !== polozka
    ) {
      return false;
    }

    tazenaPolozka = polozka;
    zacatekTazeniX = x;
    zacatekTazeniY = y;
    tazenyPointerId = pointerId;
    tazenyDotykId = dotykId;
    probihaTazeni = false;

    return true;
  }


  /* ---------- MYŠ / PERO ---------- */

  editorTextu.addEventListener(
    "pointerdown",
    (udalost) => {
      if (udalost.pointerType === "touch") {
        return;
      }

      if (
        udalost.button !== undefined &&
        udalost.button !== 0
      ) {
        return;
      }

      const polozka =
        udalost.target.closest?.("li");

      if (
        !polozka ||
        !editorTextu.contains(polozka) ||
        jePrvekMimoBulletMove(udalost.target)
      ) {
        return;
      }

      /*
       * DESKTOP:
       * Celé ovládání bulletu patří jen samotné odrážce.
       * Text řádku necháváme browseru, takže lze normálně označovat
       * text myší bez aktivace MOVE MODE.
       *
       * - klik na odrážku = sbalit / rozbalit
       * - chycení odrážky + drag = přesun řádku
       * - drag doprava / doleva = zanořit / vynořit
       */
      if (jeDesktopEditor()) {
        const jeNaKulce = jePoziceNaKulce(
          polozka,
          udalost.clientX,
          false
        );

        if (!jeNaKulce) {
          return;
        }

        tazenaPolozka = polozka;
        zacatekTazeniX = udalost.clientX;
        zacatekTazeniY = udalost.clientY;
        tazenyPointerId = udalost.pointerId;
        tazenyDotykId = null;
        probihaTazeni = false;

        try {
          polozka.setPointerCapture(
            udalost.pointerId
          );
        } catch (_) {
          /* Pointer capture není povinný. */
        }

        return;
      }

      /* Mobil / tablet si ponechává současný long-press MOVE MODE. */
      if (
        vybranaPolozkaProPresun === polozka
      ) {
        pripravAktivniBulletProTazeni(
          polozka,
          udalost.clientX,
          udalost.clientY,
          { pointerId: udalost.pointerId }
        );

        try {
          polozka.setPointerCapture(
            udalost.pointerId
          );
        } catch (_) {
          /* Pointer capture není povinný. */
        }

        return;
      }

      spustLongPressBulletu({
        polozka,
        x: udalost.clientX,
        y: udalost.clientY,
        pointerId: udalost.pointerId
      });
    }
  );


  editorTextu.addEventListener(
    "pointermove",
    (udalost) => {
      if (udalost.pointerType === "touch") {
        return;
      }

      if (
        kandidatPointerIdBulletu ===
        udalost.pointerId
      ) {
        zrusLongPressPriPohybu(
          udalost.clientX,
          udalost.clientY
        );
      }

      if (
        !tazenaPolozka ||
        tazenyPointerId !== udalost.pointerId
      ) {
        return;
      }

      const rozdilX =
        udalost.clientX - zacatekTazeniX;

      const rozdilY =
        udalost.clientY - zacatekTazeniY;

      if (
        !probihaTazeni &&
        Math.hypot(rozdilX, rozdilY) < 6
      ) {
        return;
      }

      udalost.preventDefault();

      if (!probihaTazeni) {
        zahajVzhledTazeniBulletu(
          udalost.clientX,
          udalost.clientY
        );
      }

      presunBulletPodlePozice(
        udalost.clientX,
        udalost.clientY
      );
    }
  );


  window.addEventListener(
    "pointerup",
    (udalost) => {
      if (udalost.pointerType === "touch") {
        return;
      }

      if (
        kandidatPointerIdBulletu ===
        udalost.pointerId
      ) {
        zrusCasovacLongPressBulletu();
        return;
      }

      if (
        tazenyPointerId !== null &&
        udalost.pointerId !== tazenyPointerId
      ) {
        return;
      }

      if (!tazenaPolozka) {
        return;
      }

      if (probihaTazeni) {
        const posunX =
          udalost.clientX - zacatekTazeniX;

        const chceZanorit =
          posunX > 36;

        const chceVysunout =
          posunX < -36;

        /*
         * Na desktopu dříve pointerup pouze ukončil drag a horizontální
         * změna úrovně se vůbec neprovedla. Stejnou logiku jako na
         * dotyku teď dokončíme i pro myš / pero.
         */
        if (
          chceZanorit ||
          chceVysunout
        ) {
          tazenaPolozka?.parentElement?.classList.remove(
            "bulletDragActive"
          );
        }

        if (chceZanorit) {
          zanorTazenouPolozku();
        } else if (chceVysunout) {
          vysunTazenouPolozku();
        }

        uklidTazeniBulletu({
          zrusVyber: true,
          oznamZmenu: true
        });
        return;
      }

      if (jeDesktopEditor()) {
        /*
         * Pouhý klik na odrážku není MOVE MODE. Jen uvolníme připravený
         * drag a následný click listener provede sbalení / rozbalení.
         */
        tazenaPolozka = null;
        tazenyPointerId = null;
        return;
      }

      /* Long-press proběhl, ale uživatel zatím netáhl. MOVE MODE zůstává. */
      tazenaPolozka = null;
      tazenyPointerId = null;
      casPoslednihoLongPressBulletu =
        Date.now();
    }
  );


  window.addEventListener(
    "pointercancel",
    (udalost) => {
      if (udalost.pointerType === "touch") {
        return;
      }

      if (
        kandidatPointerIdBulletu ===
        udalost.pointerId
      ) {
        zrusCasovacLongPressBulletu();
      }

      if (
        tazenyPointerId !== null &&
        udalost.pointerId === tazenyPointerId
      ) {
        uklidTazeniBulletu({
          zrusVyber: false
        });
      }
    }
  );


  /* ---------- TOUCH ---------- */

  function najdiDotykPodleId(dotyky, id) {
    return Array.from(dotyky).find(
      (dotyk) => dotyk.identifier === id
    ) || null;
  }


  editorTextu.addEventListener(
    "touchstart",
    (udalost) => {
      if (udalost.touches.length !== 1) {
        zrusCasovacLongPressBulletu();
        return;
      }

      const polozka =
        udalost.target.closest?.("li");

      if (
        !polozka ||
        !editorTextu.contains(polozka) ||
        jePrvekMimoBulletMove(udalost.target)
      ) {
        return;
      }

      const dotyk =
        udalost.touches[0];

      if (
        vybranaPolozkaProPresun === polozka
      ) {
        /*
         * MOVE MODE už je aktivní. Od této chvíle patří gesto přesunu,
         * proto můžeme scroll bezpečně zablokovat už na touchstart.
         */
        udalost.preventDefault();

        pripravAktivniBulletProTazeni(
          polozka,
          dotyk.clientX,
          dotyk.clientY,
          { dotykId: dotyk.identifier }
        );
        return;
      }

      spustLongPressBulletu({
        polozka,
        x: dotyk.clientX,
        y: dotyk.clientY,
        dotykId: dotyk.identifier
      });
    },
    { passive: false }
  );


  editorTextu.addEventListener(
    "touchmove",
    (udalost) => {
      if (
        kandidatDotykIdBulletu !== null
      ) {
        const kandidatDotyk =
          najdiDotykPodleId(
            udalost.touches,
            kandidatDotykIdBulletu
          );

        if (kandidatDotyk) {
          const zruseno =
            zrusLongPressPriPohybu(
              kandidatDotyk.clientX,
              kandidatDotyk.clientY
            );

          if (zruseno) {
            return;
          }
        }
      }

      if (
        !tazenaPolozka ||
        tazenyDotykId === null
      ) {
        return;
      }

      const dotyk =
        najdiDotykPodleId(
          udalost.touches,
          tazenyDotykId
        );

      if (!dotyk) {
        return;
      }

      udalost.preventDefault();

      const rozdilX =
        dotyk.clientX - zacatekTazeniX;

      const rozdilY =
        dotyk.clientY - zacatekTazeniY;

      if (
        !probihaTazeni &&
        Math.hypot(rozdilX, rozdilY) < 8
      ) {
        return;
      }

      if (!probihaTazeni) {
        zahajVzhledTazeniBulletu(
          dotyk.clientX,
          dotyk.clientY
        );
      }

      presunBulletPodlePozice(
        dotyk.clientX,
        dotyk.clientY
      );
    },
    { passive: false }
  );


  editorTextu.addEventListener(
    "touchend",
    (udalost) => {
      if (
        kandidatDotykIdBulletu !== null
      ) {
        const kratkyDotyk =
          najdiDotykPodleId(
            udalost.changedTouches,
            kandidatDotykIdBulletu
          );

        if (kratkyDotyk) {
          zrusCasovacLongPressBulletu();
          return;
        }
      }

      if (tazenyDotykId === null) {
        return;
      }

      const dotyk =
        najdiDotykPodleId(
          udalost.changedTouches,
          tazenyDotykId
        );

      if (!dotyk) {
        return;
      }

      udalost.preventDefault();

      if (probihaTazeni) {
  const posunX =
    dotyk.clientX - zacatekTazeniX;
  
  const chceZanorit =
    posunX > 36;
  
  const chceVysunout =
    posunX < -36;
  
  if (
    chceZanorit ||
    chceVysunout
  ) {
    tazenaPolozka?.parentElement?.classList.remove(
      "bulletDragActive"
    );
  }
  
  if (chceZanorit) {
    zanorTazenouPolozku();
  } else if (chceVysunout) {
    vysunTazenouPolozku();
  }
  
  uklidTazeniBulletu({
    zrusVyber: true,
    oznamZmenu: true
  });
  
  return;
}

      /*
       * Long-press pouze aktivoval MOVE MODE. Prst lze pustit a
       * označená položka zůstane připravená na další drag.
       */
      tazenaPolozka = null;
      tazenyDotykId = null;
      casPoslednihoLongPressBulletu =
        Date.now();
    },
    { passive: false }
  );


  editorTextu.addEventListener(
    "touchcancel",
    () => {
      zrusCasovacLongPressBulletu();

      if (tazenaPolozka) {
        uklidTazeniBulletu({
          zrusVyber: false
        });
      }
    },
    { passive: false }
  );


  /* Aktivní MOVE MODE zruší tap/klik mimo vybraný řádek. */
  document.addEventListener(
    "pointerdown",
    (udalost) => {
      if (!vybranaPolozkaProPresun) {
        return;
      }

      if (
        vybranaPolozkaProPresun.contains(
          udalost.target
        )
      ) {
        return;
      }

      zrusVyberPolozkyProPresun();
    },
    true
  );


  /* Během MOVE MODE a long-pressu nesmí vyskočit nativní menu Androidu. */
  editorTextu.addEventListener(
    "contextmenu",
    (udalost) => {
      const polozka =
        udalost.target.closest?.("li");

      if (
        polozka &&
        (
          vybranaPolozkaProPresun === polozka ||
          kandidatLongPressBulletu === polozka ||
          tazenaPolozka === polozka
        )
      ) {
        udalost.preventDefault();
      }
    }
  );


  tlacitkoBullet?.addEventListener(
    "click",
    () => {
      const vyber = window.getSelection();

      let poziceKurzoru = null;

      if (
        vyber &&
        vyber.rangeCount > 0 &&
        jeUzelVEditoru(vyber.anchorNode)
      ) {
        poziceKurzoru =
          vyber.getRangeAt(0).cloneRange();
      }

      provedPrikaz(
        "insertUnorderedList"
      );

      if (poziceKurzoru) {
        requestAnimationFrame(() => {
          const aktualniVyber =
            window.getSelection();

          if (!aktualniVyber) {
            return;
          }

          try {
            aktualniVyber.removeAllRanges();
            aktualniVyber.addRange(
              poziceKurzoru
            );

            ulozVyberTextu();
          } catch (chyba) {
            console.warn(
              "Kurzor po vytvoření odrážek nešel obnovit.",
              chyba
            );
          }
        });
      }
    }
  );



  editorTextu.addEventListener(
    "click",
    (udalost) => {
      /*
       * Po long-pressu nebo skutečném dragu nesmí syntetický click
       * otevřít editaci ani omylem sbalit větev.
       */
      if (
        Date.now() - casPoslednihoTazeniBulletu < 300 ||
        Date.now() - casPoslednihoLongPressBulletu < 450
      ) {
        udalost.preventDefault();
        udalost.stopPropagation();
        return;
      }

      const polozka =
        udalost.target.closest("li");

      if (
        !polozka ||
        !editorTextu.contains(polozka)
      ) {
        return;
      }

      /*
       * Označený řádek je v MOVE MODE. Dokud jej uživatel nedropne
       * nebo neklepne mimo něj, nedáváme klik zpět editoru.
       */
      if (
        vybranaPolozkaProPresun === polozka
      ) {
        udalost.preventDefault();
        return;
      }

      const klikNaKulku =
        jePoziceNaKulce(
          polozka,
          udalost.clientX,
          !jeDesktopEditor()
        );

      if (!klikNaKulku) {
        return;
      }

      udalost.preventDefault();

      prepniSbaleniPolozky(
        polozka
      );
      
      const vyber =
  window.getSelection();

if (vyber) {
  vyber.removeAllRanges();
}
    }
  );


  tlacitkaVelikosti.forEach(
    tlacitko => {
      tlacitko.addEventListener(
        "click",
        () => {
          nastavVelikostPisma(
            tlacitko.dataset.velikost
          );
        }
      );
    }
  );


  tlacitkaStylu.forEach(
    tlacitko => {
      tlacitko.addEventListener(
        "click",
        () => {
          nastavStylTextu(
            tlacitko.dataset.styl
          );
        }
      );
    }
  );


  tlacitkaZarovnani.forEach(
    tlacitko => {
      tlacitko.addEventListener(
        "click",
        () => {
          nastavZarovnani(
            tlacitko.dataset.zarovnani
          );
        }
      );
    }
  );


  /* Klik mimo plovoucí panel jej zavře. */
  document.addEventListener(
    "pointerdown",
    event => {
      if (!otevrenyPanel) {
        return;
      }

      if (
        otevrenyPanel.contains(event.target) ||
        aktivniSpoustecPanelu?.contains(event.target)
      ) {
        return;
      }

      zavriVsechnyPanely();
    },
    true
  );


  /* Změna výběru průběžně aktualizuje B/I/U a číslo velikosti. */
  document.addEventListener(
    "selectionchange",
    () => {
      aktualizujStavFormatovani();
    }
  );


  editorTextu.addEventListener(
    "keyup",
    aktualizujStavFormatovani
  );


  editorTextu.addEventListener(
    "pointerup",
    aktualizujStavFormatovani
  );


  rychlyToolbar.addEventListener(
    "scroll",
    () => {
      if (
        otevrenyPanel &&
        aktivniSpoustecPanelu
      ) {
        pozicujPanel(
          otevrenyPanel,
          aktivniSpoustecPanelu
        );
      }
    },
    { passive: true }
  );


  window.addEventListener(
    "resize",
    () => {
      if (
        otevrenyPanel &&
        aktivniSpoustecPanelu
      ) {
        pozicujPanel(
          otevrenyPanel,
          aktivniSpoustecPanelu
        );
      }
    }
  );


  /* Při otevření editoru začínáme vždy v kompaktním stavu. */
  if (modalUkolu) {
    const pozorovatelModalu =
      new MutationObserver(() => {
        if (!modalUkolu.hidden) {
          nastavToolbar(
            jeSdilenyEditor()
              ? "text"
              : "cas"
          );
        } else {
          zavriVsechnyPanely();
        }
      });

    pozorovatelModalu.observe(
      modalUkolu,
      {
        attributes: true,
        attributeFilter: ["hidden"]
      }
    );
  }


  nastavToolbar("cas");


  panelBarvaTextu
    ?.querySelectorAll("[data-text-color]")
    .forEach(tlacitko => {
      tlacitko.addEventListener(
        "click",
        () => {
          const barva =
            tlacitko.dataset.textColor;

          const cilovyEditor =
            pripravEditorProFormatovani();

          if (barva === "default") {
            const barvaMotivu =
              getComputedStyle(
                cilovyEditor || editorTextu
              ).color;

            document.execCommand(
              "foreColor",
              false,
              barvaMotivu
            );
          } else {
            document.execCommand(
              "foreColor",
              false,
              barva
            );
          }

          synchronizujTodoPoFormatovani(
            cilovyEditor
          );

          ulozVyberTextu();
          zachovejVyberTodoPoFormatovani(
            cilovyEditor
          );
          aktualizujStavFormatovani();
          zavriVsechnyPanely();
        }
      );
    });




})();
