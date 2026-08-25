(() => {
  /* ==========================================
     LUBANOTE – VLASTNÍ NABÍDKA VÝBĚRU TEXTU

     Chování:
     - 1× tap = pouze kurzor / editace
     - 2× tap na slovo = nativní označení slova -> naše menu
     - rozsah lze dál upravit systémovými úchyty
     - long-press už NEPATŘÍ výběru textu; používají ho řádkové prvky
       (bullet / TODO) pro aktivaci režimu přesunu
     - APK používá Capacitor Clipboard
     - Preview zkusí Web Clipboard API, případně interní dočasnou schránku
  ========================================== */

    const jeDesktop =
    window.matchMedia(
      "(hover: hover) and (pointer: fine)"
    ).matches;

  if (jeDesktop) {
    return;
  }

  const editorTextu =
    document.getElementById("modalRichText");

  const selectionMenu =
    document.getElementById("selectionMenu");

  const tlacitkoVyjmout =
    document.getElementById("selectionVyjmout");

  const tlacitkoKopirovat =
    document.getElementById("selectionKopirovat");

  const tlacitkoVlozit =
    document.getElementById("selectionVlozit");

  const tlacitkoVybratVse =
    document.getElementById("selectionVybratVse");

  const schrankaCapacitor =
    window.Capacitor?.Plugins?.Clipboard;

  if (!editorTextu || !selectionMenu) {
    return;
  }

  let ulozenyRozsah = null;
  let aktivniTextarea = null;
  let ulozenyVyberTextarea = null;
  let lokalniSchranka = "";

  /*
   * Android WebView někdy dokončí označení slova až několik ms po
   * selectionchange. Krátké odložení zabrání tomu, aby naše menu
   * vyhodnotilo výběr ještě ve stavu „jen kurzor“.
   */
  let casovacAktualizaceVyberu = null;


  /* ==========================================
     POMOCNÉ FUNKCE PRO RANGE / EDITOR
  ========================================== */

  function jeUzelVEditoru(uzel) {
    if (!uzel) {
      return false;
    }

    const prvek =
      uzel.nodeType === Node.ELEMENT_NODE
        ? uzel
        : uzel.parentElement;

    return Boolean(
      prvek &&
      (prvek === editorTextu || editorTextu.contains(prvek))
    );
  }


  function jeRozsahVEditoru(rozsah) {
    if (!rozsah) {
      return false;
    }

    return (
      jeUzelVEditoru(rozsah.startContainer) &&
      jeUzelVEditoru(rozsah.endContainer)
    );
  }


  function ulozRozsah(rozsah) {
    if (!jeRozsahVEditoru(rozsah)) {
      return false;
    }

    ulozenyRozsah =
      rozsah.cloneRange();

    return true;
  }


  function obnovUlozenyRozsah() {
    if (!ulozenyRozsah) {
      return false;
    }

    const vyber =
      window.getSelection();

    if (!vyber) {
      return false;
    }

    try {
      vyber.removeAllRanges();
      vyber.addRange(ulozenyRozsah);
      return true;
    } catch (chyba) {
      console.warn(
        "LubaNote: nepodařilo se obnovit výběr.",
        chyba
      );

      return false;
    }
  }


  function zjistiObdelnikRozsahu(rozsah) {
    if (!rozsah) {
      return null;
    }

    const obdelnik =
      rozsah.getBoundingClientRect();

    if (
      obdelnik &&
      (
        obdelnik.width ||
        obdelnik.height ||
        obdelnik.left ||
        obdelnik.top
      )
    ) {
      return obdelnik;
    }

    const obdelniky =
      rozsah.getClientRects();

    return obdelniky?.[0] ?? null;
  }


  function jeTodoTextarea(prvek) {
    return Boolean(
      prvek?.matches?.(
        ".todoTextInput.todoEditing"
      )
    );
  }


  function ulozVyberTextarea(textarea) {
    if (!jeTodoTextarea(textarea)) {
      return false;
    }

    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? start;

    aktivniTextarea = textarea;
    ulozenyVyberTextarea = {
      start,
      end
    };

    return true;
  }


  function obnovVyberTextarea() {
    if (
      !aktivniTextarea ||
      !ulozenyVyberTextarea ||
      !document.contains(aktivniTextarea)
    ) {
      return false;
    }

    try {
      aktivniTextarea.focus({
        preventScroll: true
      });
    } catch {
      aktivniTextarea.focus();
    }

    aktivniTextarea.setSelectionRange(
      ulozenyVyberTextarea.start,
      ulozenyVyberTextarea.end
    );

    return true;
  }


  /* ==========================================
     ZOBRAZENÍ / POZICE MENU
  ========================================== */

  function skryjMenu() {
    selectionMenu.hidden = true;

    tlacitkoVyjmout?.removeAttribute("hidden");
    tlacitkoKopirovat?.removeAttribute("hidden");

    aktivniTextarea = null;
    ulozenyVyberTextarea = null;
  }


  function nastavTlacitkaMenu(maOznaceni) {
    if (tlacitkoVyjmout) {
      tlacitkoVyjmout.hidden = !maOznaceni;
    }

    if (tlacitkoKopirovat) {
      tlacitkoKopirovat.hidden = !maOznaceni;
    }
  }


  function pozicujMenu({ rozsah = null, bod = null } = {}) {
    const obdelnik =
      rozsah
        ? zjistiObdelnikRozsahu(rozsah)
        : null;

    const stredX =
      bod?.x ??
      (obdelnik
        ? obdelnik.left + obdelnik.width / 2
        : window.innerWidth / 2);

    const horniBod =
      bod?.y ??
      obdelnik?.top ??
      0;

    const dolniBod =
      bod?.y ??
      obdelnik?.bottom ??
      horniBod;

    requestAnimationFrame(() => {
      const menuSirka =
        selectionMenu.offsetWidth;

      const menuVyska =
        selectionMenu.offsetHeight;

      const viewport =
        window.visualViewport;

      const viewportVlevo =
        viewport?.offsetLeft ?? 0;

      const viewportNahore =
        viewport?.offsetTop ?? 0;

      const viewportSirka =
        viewport?.width ?? window.innerWidth;

      const viewportVyska =
        viewport?.height ?? window.innerHeight;

      const mezera = 8;

      let vlevo =
        stredX - menuSirka / 2;

      vlevo = Math.max(
        viewportVlevo + 8,
        Math.min(
          vlevo,
          viewportVlevo +
            viewportSirka -
            menuSirka -
            8
        )
      );

      const mistoNad =
        horniBod -
        viewportNahore;

      const mistoPod =
        viewportNahore +
        viewportVyska -
        dolniBod;

      let nahore;

      if (
        mistoNad >=
        menuVyska + mezera + 8
      ) {
        nahore =
          horniBod -
          menuVyska -
          mezera;
      } else if (
        mistoPod >=
        menuVyska + mezera + 8
      ) {
        nahore =
          dolniBod + mezera;
      } else {
        nahore =
          viewportNahore +
          viewportVyska -
          menuVyska -
          8;
      }

      /*
       * SPCK Preview má vlastní systémovou Android nabídku.
       * V Preview naši nabídku posuneme níž, aby ji systémová
       * nepřekrývala. V APK je Capacitor Clipboard dostupný,
       * takže se tento posun nepoužije.
       */
      if (!schrankaCapacitor) {
        nahore = Math.min(
          dolniBod + 120,
          viewportNahore +
            viewportVyska -
            menuVyska -
            8
        );
      }

      selectionMenu.style.left =
        `${Math.round(vlevo)}px`;

      selectionMenu.style.top =
        `${Math.round(nahore)}px`;
    });
  }


  function zobrazMenuProOznaceni(rozsah) {
    if (!ulozRozsah(rozsah)) {
      return;
    }

    aktivniTextarea = null;
    ulozenyVyberTextarea = null;

    nastavTlacitkaMenu(true);
    selectionMenu.hidden = false;

    pozicujMenu({ rozsah });
  }


  function zobrazMenuProTextarea(textarea) {
    if (!ulozVyberTextarea(textarea)) {
      return;
    }

    const { start, end } =
      ulozenyVyberTextarea;

    if (start === end) {
      skryjMenu();
      return;
    }

    nastavTlacitkaMenu(true);
    selectionMenu.hidden = false;

    const rect =
      textarea.getBoundingClientRect();

    pozicujMenu({
      bod: {
        x: rect.left + rect.width / 2,
        y: rect.top
      }
    });
  }



  /* ==========================================
     SCHRÁNKA
  ========================================== */

  async function zapisDoSchranky(text) {
    if (!text) {
      return false;
    }

    if (schrankaCapacitor) {
      await schrankaCapacitor.write({
        string: text
      });

      lokalniSchranka = text;
      return true;
    }

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        lokalniSchranka = text;
        return true;
      } catch (_chyba) {
        // SPCK Preview nemusí webovou schránku povolit.
      }
    }

    /* Fallback pro ladění v Preview. */
    lokalniSchranka = text;
    return true;
  }


  async function prectiZeSchranky() {
    if (schrankaCapacitor) {
      const obsah =
        await schrankaCapacitor.read();

      const text =
        obsah?.value ?? "";

      if (text) {
        lokalniSchranka = text;
      }

      return text;
    }

    if (navigator.clipboard?.readText) {
      try {
        const text =
          await navigator.clipboard.readText();

        if (text) {
          lokalniSchranka = text;
        }

        return text;
      } catch (_chyba) {
        // Použijeme interní schránku Preview.
      }
    }

    return lokalniSchranka;
  }


  /* ==========================================
     ZMĚNY EDITORU
  ========================================== */

  function oznamZmenuEditoru(
    inputType,
    data = null
  ) {
    try {
      editorTextu.dispatchEvent(
        new InputEvent(
          "input",
          {
            bubbles: true,
            inputType,
            data
          }
        )
      );
    } catch (_chyba) {
      editorTextu.dispatchEvent(
        new Event(
          "input",
          { bubbles: true }
        )
      );
    }
  }


  function smazAktualniOznaceni() {
    if (!obnovUlozenyRozsah()) {
      return false;
    }

    let provedeno = false;

    try {
      provedeno =
        document.execCommand(
          "delete",
          false,
          null
        );
    } catch (_chyba) {
      provedeno = false;
    }

    if (provedeno) {
      return true;
    }

    try {
      const rozsah =
        window.getSelection()?.getRangeAt(0);

      if (!rozsah) {
        return false;
      }

      rozsah.deleteContents();
      rozsah.collapse(true);

      const vyber =
        window.getSelection();

      vyber?.removeAllRanges();
      vyber?.addRange(rozsah);

      ulozenyRozsah =
        rozsah.cloneRange();

      oznamZmenuEditoru(
        "deleteContentBackward"
      );

      return true;
    } catch (_chyba) {
      return false;
    }
  }


  function vlozTextDoEditoru(text) {
    if (!text || !obnovUlozenyRozsah()) {
      return false;
    }

    editorTextu.focus({
      preventScroll: true
    });

    try {
      const vyber =
        window.getSelection();

      if (!vyber || vyber.rangeCount === 0) {
        return false;
      }

      const rozsah =
        vyber.getRangeAt(0);

      if (!jeRozsahVEditoru(rozsah)) {
        return false;
      }

      rozsah.deleteContents();

      /*
       * Vlastní schránka LubaNote ukládá čistý text. Při vložení ho
       * nesmíme nechat zdědit z případného starého <span style="font-size">,
       * ve kterém zrovna leží kurzor. Jinak stejný zkopírovaný text může
       * po vložení dostat jinou velikost než běžný text editoru.
       *
       * Tento span používá základní typografii editoru, ale uživatel ho
       * může později normálně označit a změnit velikost toolbar-em.
       */
      const vlozenyText =
        document.createElement("span");

      vlozenyText.className =
        "lubaNoteVlozenyText";

      vlozenyText.textContent = text;

      rozsah.insertNode(vlozenyText);
      rozsah.setStartAfter(vlozenyText);
      rozsah.collapse(true);

      vyber.removeAllRanges();
      vyber.addRange(rozsah);

      ulozenyRozsah =
        rozsah.cloneRange();

      oznamZmenuEditoru(
        "insertText",
        text
      );

      return true;
    } catch (_chyba) {
      return false;
    }
  }


  function sklapniVyberNaKonec() {
    if (!ulozenyRozsah) {
      return;
    }

    try {
      const rozsah =
        ulozenyRozsah.cloneRange();

      rozsah.collapse(false);

      ulozenyRozsah =
        rozsah.cloneRange();

      const vyber =
        window.getSelection();

      vyber?.removeAllRanges();
      vyber?.addRange(rozsah);
    } catch (_chyba) {
      // Není kritické.
    }
  }


  function ziskejTextTextareaVyberu() {
    if (
      !aktivniTextarea ||
      !ulozenyVyberTextarea
    ) {
      return "";
    }

    return aktivniTextarea.value.slice(
      ulozenyVyberTextarea.start,
      ulozenyVyberTextarea.end
    );
  }


  function nahradTextareaVyber(text) {
    if (!obnovVyberTextarea()) {
      return false;
    }

    const textarea = aktivniTextarea;
    const start = ulozenyVyberTextarea.start;
    const end = ulozenyVyberTextarea.end;

    textarea.setRangeText(
      text,
      start,
      end,
      "end"
    );

    ulozenyVyberTextarea = {
      start: textarea.selectionStart ?? start,
      end: textarea.selectionEnd ?? start
    };

    try {
      textarea.dispatchEvent(
        new InputEvent(
          "input",
          {
            bubbles: true,
            inputType: text
              ? "insertText"
              : "deleteContentBackward",
            data: text || null
          }
        )
      );
    } catch {
      textarea.dispatchEvent(
        new Event(
          "input",
          { bubbles: true }
        )
      );
    }

    return true;
  }


  function sklapniTextareaVyberNaKonec() {
    if (
      !aktivniTextarea ||
      !ulozenyVyberTextarea
    ) {
      return;
    }

    const konec =
      ulozenyVyberTextarea.end;

    aktivniTextarea.setSelectionRange(
      konec,
      konec
    );

    ulozenyVyberTextarea = {
      start: konec,
      end: konec
    };
  }


  /* ==========================================
     TLAČÍTKA MENU
  ========================================== */

  selectionMenu
    .querySelectorAll("button")
    .forEach(tlacitko => {
      /* Klik na menu nesmí zrušit uložený Range. */
      tlacitko.addEventListener(
        "pointerdown",
        event => {
          event.preventDefault();
        }
      );
    });


  tlacitkoKopirovat?.addEventListener(
    "click",
    async () => {
      const text =
        aktivniTextarea
          ? ziskejTextTextareaVyberu().trim()
          : ulozenyRozsah
              ?.toString()
              ?.trim();

      if (!text) {
        return;
      }

      try {
        await zapisDoSchranky(text);

        if (aktivniTextarea) {
          sklapniTextareaVyberNaKonec();
        } else {
          sklapniVyberNaKonec();
        }

        skryjMenu();
      } catch (chyba) {
        console.error(
          "Kopírování se nepodařilo:",
          chyba
        );
      }
    }
  );


  tlacitkoVyjmout?.addEventListener(
    "click",
    async () => {
      const text =
        aktivniTextarea
          ? ziskejTextTextareaVyberu().trim()
          : ulozenyRozsah
              ?.toString()
              ?.trim();

      if (!text) {
        return;
      }

      try {
        await zapisDoSchranky(text);

        const smazano = aktivniTextarea
          ? nahradTextareaVyber("")
          : smazAktualniOznaceni();

        if (smazano) {
          skryjMenu();
        }
      } catch (chyba) {
        console.error(
          "Vyjmutí se nepodařilo:",
          chyba
        );
      }
    }
  );


  tlacitkoVlozit?.addEventListener(
    "click",
    async () => {
      if (!ulozenyRozsah && !aktivniTextarea) {
        return;
      }

      try {
        const text =
          await prectiZeSchranky();

        if (!text) {
          skryjMenu();
          return;
        }

        const vlozeno = aktivniTextarea
          ? nahradTextareaVyber(text)
          : vlozTextDoEditoru(text);

        if (vlozeno) {
          skryjMenu();
        }
      } catch (chyba) {
        console.error(
          "Vložení se nepodařilo:",
          chyba
        );
      }
    }
  );


  tlacitkoVybratVse?.addEventListener(
    "click",
    () => {
      if (aktivniTextarea) {
        aktivniTextarea.setSelectionRange(
          0,
          aktivniTextarea.value.length
        );

        ulozenyVyberTextarea = {
          start: 0,
          end: aktivniTextarea.value.length
        };

        zobrazMenuProTextarea(
          aktivniTextarea
        );
        return;
      }

      const rozsah =
        document.createRange();

      rozsah.selectNodeContents(
        editorTextu
      );

      ulozenyRozsah =
        rozsah.cloneRange();

      const vyber =
        window.getSelection();

      vyber?.removeAllRanges();
      vyber?.addRange(rozsah);

      nastavTlacitkaMenu(true);
      selectionMenu.hidden = false;
      pozicujMenu({ rozsah });
    }
  );


  /* ==========================================
     BĚŽNÉ OZNAČENÍ TEXTU

     Jednotné pravidlo LubaNote:
     - 1× tap = kurzor / editace
     - 2× tap = nativní výběr slova
     - long-press zde neřešíme; patří řádkovým prvkům pro MOVE MODE

     Android WebView může nejdřív nahlásit samotný kurzor a teprve
     o pár ms později skutečný výběr slova. Proto stav nečteme
     okamžitě v první selectionchange události.
  ========================================== */

  function aktualizujMenuPodleVyberu() {
    if (casovacAktualizaceVyberu) {
      clearTimeout(casovacAktualizaceVyberu);
    }

    requestAnimationFrame(() => {
      casovacAktualizaceVyberu = setTimeout(() => {
        casovacAktualizaceVyberu = null;

        const textarea =
          jeTodoTextarea(document.activeElement)
            ? document.activeElement
            : null;

        if (textarea) {
          if (
            (textarea.selectionStart ?? 0) !==
            (textarea.selectionEnd ?? 0)
          ) {
            zobrazMenuProTextarea(textarea);
          } else {
            skryjMenu();
          }

          return;
        }

        const vyber =
          window.getSelection();

        if (
          !vyber ||
          vyber.rangeCount === 0
        ) {
          skryjMenu();
          return;
        }

        const rozsah =
          vyber.getRangeAt(0);

        if (!jeRozsahVEditoru(rozsah)) {
          skryjMenu();
          return;
        }

        if (rozsah.collapsed) {
          /*
           * Jednoduchý tap znamená pouze editaci. Nabídku ukážeme
           * až při skutečně označeném textu.
           */
          skryjMenu();
          return;
        }

        zobrazMenuProOznaceni(rozsah);
      }, 40);
    });
  }


  document.addEventListener(
    "selectionchange",
    aktualizujMenuPodleVyberu
  );


  document.addEventListener(
    "select",
    event => {
      if (jeTodoTextarea(event.target)) {
        zobrazMenuProTextarea(
          event.target
        );
      }
    },
    true
  );


  /*
   * Nativní Android/Chrome kontextovou nabídku blokujeme jen tehdy,
   * když už v editoru skutečně existuje označený text. Samotný
   * long-press si tak mohou bezpečně převzít bullet/TODO řádky.
   */
  editorTextu.addEventListener(
    "contextmenu",
    event => {
      const vyber =
        window.getSelection();

      const rozsah =
        vyber?.rangeCount
          ? vyber.getRangeAt(0)
          : null;

      const maOznaceniVEditoru =
        Boolean(
          rozsah &&
          jeRozsahVEditoru(rozsah) &&
          !rozsah.collapsed
        );

      if (maOznaceniVEditoru) {
        event.preventDefault();
      }
    }
  );


  document.addEventListener(
    "contextmenu",
    event => {
      const textarea =
        event.target.closest?.(
          ".todoTextInput.todoEditing"
        );

      if (
        textarea &&
        (textarea.selectionStart ?? 0) !==
          (textarea.selectionEnd ?? 0)
      ) {
        event.preventDefault();
      }
    },
    true
  );


  /* ==========================================
     ZAVÍRÁNÍ MENU
  ========================================== */

  document.addEventListener(
    "pointerdown",
    event => {
      if (
        selectionMenu.hidden ||
        selectionMenu.contains(event.target) ||
        editorTextu.contains(event.target)
      ) {
        return;
      }

      skryjMenu();
    },
    true
  );


  editorTextu.addEventListener(
    "input",
    () => {
      if (!selectionMenu.hidden) {
        skryjMenu();
      }
    }
  );


  window.addEventListener(
    "scroll",
    skryjMenu,
    true
  );


  window.visualViewport?.addEventListener(
    "resize",
    () => {
      if (!selectionMenu.hidden) {
        skryjMenu();
      }
    }
  );
})();
