(() => {
  /* ==========================================
     LUBANOTE – VLASTNÍ NABÍDKA VÝBĚRU TEXTU

     Chování:
     - 1× tap = pouze kurzor / editace
     - 2× tap na slovo = vlastní spolehlivé označení slova -> naše menu
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
   * Android WebView neumí spolehlivě označit slovo nativním dvojtapem
   * ve všech řádcích contenteditable editoru. Dvojtap proto detekuje
   * LubaNote samo a vytvoří Range přesně ve slově pod prstem.
   */
  const MAX_CAS_DVOJTAPU = 330;
  const MAX_VZDALENOST_DVOJTAPU = 34;
  const MAX_DELKA_JEDNOHO_TAPU = 300;
  const MAX_POHYB_JEDNOHO_TAPU = 16;

  let zacatekTapuEditoru = null;
  let posledniTapEditoru = null;
  let ignorujKlikPoDvojtapuDo = 0;

  let menuProKurzorAktivni = false;
  let bodMenuKurzor = null;

  let menuProTextareaKurzorAktivni = false;
  let bodMenuTextareaKurzor = null;

  let levyUchytVyberu = null;
  let pravyUchytVyberu = null;
  let tazenyUchytVyberu = null;

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

  function skryjUchytyVyberu() {
    levyUchytVyberu?.setAttribute("hidden", "");
    pravyUchytVyberu?.setAttribute("hidden", "");
    tazenyUchytVyberu = null;
  }


  function skryjMenu() {
    selectionMenu.hidden = true;

    tlacitkoVyjmout?.removeAttribute("hidden");
    tlacitkoKopirovat?.removeAttribute("hidden");

    aktivniTextarea = null;
    ulozenyVyberTextarea = null;

    menuProKurzorAktivni = false;
    bodMenuKurzor = null;

    menuProTextareaKurzorAktivni = false;
    bodMenuTextareaKurzor = null;

    skryjUchytyVyberu();
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

      selectionMenu.style.left =
        `${Math.round(vlevo)}px`;

      selectionMenu.style.top =
        `${Math.round(nahore)}px`;
    });
  }



  function zjistiBodOkrajeRozsahu(
    rozsah,
    jeKonec = false
  ) {
    if (!rozsah) {
      return null;
    }

    const sbalenyRozsah =
      rozsah.cloneRange();

    sbalenyRozsah.collapse(!jeKonec);

    const primeObdelniky =
      Array.from(
        sbalenyRozsah.getClientRects()
      );

    const primyObdelnik =
      primeObdelniky.find(
        obdelnik => obdelnik.height > 0
      ) ??
      sbalenyRozsah.getBoundingClientRect();

    if (primyObdelnik?.height > 0) {
      return {
        x: primyObdelnik.left,
        y: primyObdelnik.bottom
      };
    }

    const kontejner =
      jeKonec
        ? rozsah.endContainer
        : rozsah.startContainer;

    const offset =
      jeKonec
        ? rozsah.endOffset
        : rozsah.startOffset;

    if (
      kontejner?.nodeType ===
      Node.TEXT_NODE
    ) {
      const text =
        kontejner.textContent ?? "";

      let startZnaku =
        jeKonec
          ? offset - 1
          : offset;

      if (
        startZnaku < 0 ||
        startZnaku >= text.length
      ) {
        startZnaku =
          jeKonec
            ? Math.min(
              Math.max(0, offset),
              Math.max(0, text.length - 1)
            )
            : Math.max(
              0,
              Math.min(
                offset - 1,
                text.length - 1
              )
            );
      }

      if (
        text.length > 0 &&
        startZnaku >= 0 &&
        startZnaku < text.length
      ) {
        const znakRozsah =
          document.createRange();

        znakRozsah.setStart(
          kontejner,
          startZnaku
        );

        znakRozsah.setEnd(
          kontejner,
          startZnaku + 1
        );

        const obdelnik =
          znakRozsah.getBoundingClientRect();

        if (obdelnik?.height > 0) {
          return {
            x: jeKonec
              ? obdelnik.right
              : obdelnik.left,
            y: obdelnik.bottom
          };
        }
      }
    }

    const obdelniky =
      Array.from(
        rozsah.getClientRects()
      ).filter(
        obdelnik => obdelnik.height > 0
      );

    if (!obdelniky.length) {
      return null;
    }

    const obdelnik =
      jeKonec
        ? obdelniky[
        obdelniky.length - 1
        ]
        : obdelniky[0];

    return {
      x: jeKonec
        ? obdelnik.right
        : obdelnik.left,
      y: obdelnik.bottom
    };
  }


  function zajistiUchytyVyberu() {
    if (
      levyUchytVyberu &&
      pravyUchytVyberu
    ) {
      return;
    }

    function vytvorUchyt(strana) {
      const uchyt =
        document.createElement("div");

      uchyt.className =
        `selectionHandle selectionHandle${strana}`;

      uchyt.dataset.strana =
        strana;

      uchyt.setAttribute(
        "aria-hidden",
        "true"
      );

      uchyt.hidden = true;

      document.body.appendChild(
        uchyt
      );

      uchyt.addEventListener(
        "pointerdown",
        event => {
          event.preventDefault();
          event.stopPropagation();

          tazenyUchytVyberu =
            strana;

          try {
            uchyt.setPointerCapture(
              event.pointerId
            );
          } catch {
            // Není kritické.
          }
        }
      );

      uchyt.addEventListener(
        "pointermove",
        event => {
          if (
            tazenyUchytVyberu !==
            strana
          ) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();

          const caretRozsah =
            najdiCaretRozsahVBodu(
              event.clientX,
              event.clientY - 18
            );

          if (
            !caretRozsah ||
            !jeRozsahVEditoru(
              caretRozsah
            )
          ) {
            return;
          }

          const aktualniRozsah =
            ulozenyRozsah
              ?.cloneRange();

          if (
            !aktualniRozsah ||
            aktualniRozsah.collapsed
          ) {
            return;
          }

          try {
            if (strana === "Start") {
              const konecRozsahu =
                aktualniRozsah
                  .cloneRange();

              konecRozsahu.collapse(
                false
              );

              if (
                konecRozsahu.comparePoint(
                  caretRozsah.startContainer,
                  caretRozsah.startOffset
                ) > 0
              ) {
                return;
              }

              aktualniRozsah.setStart(
                caretRozsah.startContainer,
                caretRozsah.startOffset
              );
            } else {
              const zacatekRozsahu =
                aktualniRozsah
                  .cloneRange();

              zacatekRozsahu.collapse(
                true
              );

              if (
                zacatekRozsahu.comparePoint(
                  caretRozsah.startContainer,
                  caretRozsah.startOffset
                ) < 0
              ) {
                return;
              }

              aktualniRozsah.setEnd(
                caretRozsah.startContainer,
                caretRozsah.startOffset
              );
            }

            if (aktualniRozsah.collapsed) {
              return;
            }

            const vyber =
              window.getSelection();

            vyber?.removeAllRanges();
            vyber?.addRange(
              aktualniRozsah
            );

            ulozenyRozsah =
              aktualniRozsah
                .cloneRange();

            menuProKurzorAktivni =
              false;

            nastavTlacitkaMenu(true);
            selectionMenu.hidden =
              false;

            zobrazUchytyVyberu(
              aktualniRozsah
            );

            pozicujMenu({
              rozsah: aktualniRozsah
            });
          } catch (_chyba) {
            // Při rychlém přesunu přes složitější HTML
            // prostě ponecháme poslední platný Range.
          }
        }
      );

      const ukonciTazeni =
        event => {
          if (
            tazenyUchytVyberu !==
            strana
          ) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();

          tazenyUchytVyberu = null;

          if (
            ulozenyRozsah &&
            !ulozenyRozsah.collapsed
          ) {
            zobrazUchytyVyberu(
              ulozenyRozsah
            );

            pozicujMenu({
              rozsah:
                ulozenyRozsah
            });
          }
        };

      uchyt.addEventListener(
        "pointerup",
        ukonciTazeni
      );

      uchyt.addEventListener(
        "pointercancel",
        () => {
          tazenyUchytVyberu = null;
        }
      );

      return uchyt;
    }

    levyUchytVyberu =
      vytvorUchyt("Start");

    pravyUchytVyberu =
      vytvorUchyt("End");
  }


  function zobrazUchytyVyberu(
    rozsah
  ) {
    if (
      !rozsah ||
      rozsah.collapsed ||
      !jeRozsahVEditoru(rozsah)
    ) {
      skryjUchytyVyberu();
      return;
    }

    zajistiUchytyVyberu();

    const zacatek =
      zjistiBodOkrajeRozsahu(
        rozsah,
        false
      );

    const konec =
      zjistiBodOkrajeRozsahu(
        rozsah,
        true
      );

    if (!zacatek || !konec) {
      skryjUchytyVyberu();
      return;
    }

    levyUchytVyberu.style.left =
      `${Math.round(zacatek.x)}px`;

    levyUchytVyberu.style.top =
      `${Math.round(zacatek.y)}px`;

    pravyUchytVyberu.style.left =
      `${Math.round(konec.x)}px`;

    pravyUchytVyberu.style.top =
      `${Math.round(konec.y)}px`;

    levyUchytVyberu.hidden = false;
    pravyUchytVyberu.hidden = false;
  }


  function zobrazMenuProKurzorVBodu(
    x,
    y
  ) {
    const rozsah =
      najdiCaretRozsahVBodu(x, y);

    if (
      !rozsah ||
      !jeRozsahVEditoru(rozsah)
    ) {
      return false;
    }

    const kurzorRozsah =
      rozsah.cloneRange();

    kurzorRozsah.collapse(true);

    try {
      editorTextu.focus({
        preventScroll: true
      });
    } catch {
      editorTextu.focus();
    }

    const vyber =
      window.getSelection();

    if (!vyber) {
      return false;
    }

    vyber.removeAllRanges();
    vyber.addRange(
      kurzorRozsah
    );

    ulozRozsah(
      kurzorRozsah
    );

    aktivniTextarea = null;
    ulozenyVyberTextarea = null;

    menuProTextareaKurzorAktivni = false;
    bodMenuTextareaKurzor = null;

    menuProKurzorAktivni = true;
    bodMenuKurzor = { x, y };

    nastavTlacitkaMenu(false);
    skryjUchytyVyberu();

    selectionMenu.hidden = false;

    pozicujMenu({
      bod: bodMenuKurzor
    });

    return true;
  }


  function zobrazMenuProOznaceni(rozsah) {
    if (!ulozRozsah(rozsah)) {
      return;
    }

    aktivniTextarea = null;
    ulozenyVyberTextarea = null;

    menuProKurzorAktivni = false;
    bodMenuKurzor = null;

    menuProTextareaKurzorAktivni = false;
    bodMenuTextareaKurzor = null;

    nastavTlacitkaMenu(true);
    selectionMenu.hidden = false;

    zobrazUchytyVyberu(rozsah);
    pozicujMenu({ rozsah });
  }


  function zobrazMenuProKurzorTextarea(
    textarea,
    x,
    y
  ) {
    if (!ulozVyberTextarea(textarea)) {
      return false;
    }

    menuProKurzorAktivni = false;
    bodMenuKurzor = null;

    menuProTextareaKurzorAktivni = true;
    bodMenuTextareaKurzor = { x, y };

    nastavTlacitkaMenu(false);
    skryjUchytyVyberu();

    selectionMenu.hidden = false;

    pozicujMenu({
      bod: bodMenuTextareaKurzor
    });

    return true;
  }


  function zobrazMenuProTextarea(textarea) {
    /*
     * Nejdřív si musíme zapamatovat, zda je pro TUTO textarea
     * záměrně otevřený kurzorový režim Vložit / Vše.
     * ulozVyberTextarea() pak aktualizuje selectionStart/End, ale
     * kurzorový režim nesmíme shodit dřív, než zjistíme, jestli je
     * výběr stále collapsed.
     */
    const zachovejKurzoroveMenu =
      menuProTextareaKurzorAktivni &&
      aktivniTextarea === textarea;

    const ulozenyBodKurzorovehoMenu =
      bodMenuTextareaKurzor;

    if (!ulozVyberTextarea(textarea)) {
      return;
    }

    menuProKurzorAktivni = false;
    bodMenuKurzor = null;

    skryjUchytyVyberu();

    const { start, end } =
      ulozenyVyberTextarea;

    if (start === end) {
      if (zachovejKurzoroveMenu) {
        menuProTextareaKurzorAktivni = true;
        bodMenuTextareaKurzor =
          ulozenyBodKurzorovehoMenu;

        nastavTlacitkaMenu(false);
        selectionMenu.hidden = false;

        if (bodMenuTextareaKurzor) {
          pozicujMenu({
            bod: bodMenuTextareaKurzor
          });
        }

        return;
      }

      menuProTextareaKurzorAktivni = false;
      bodMenuTextareaKurzor = null;
      skryjMenu();
      return;
    }

    menuProTextareaKurzorAktivni = false;
    bodMenuTextareaKurzor = null;

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


  function vyberVsechnyTodoPolozky() {
    const todoList =
      document.getElementById("todoList");

    if (!todoList) {
      return false;
    }

    const todoPolozky =
      todoList.querySelectorAll(
        ".todoItem"
      );

    if (!todoPolozky.length) {
      return false;
    }

    todoList.classList.add(
      "todoVyberVse"
    );

    return true;
  }

  tlacitkoVybratVse?.addEventListener(
    "click",
    () => {
      if (aktivniTextarea) {
        if (vyberVsechnyTodoPolozky()) {
          nastavTlacitkaMenu(true);

          selectionMenu.hidden = false;

          return;
        }
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

      zobrazMenuProOznaceni(
        rozsah
      );
    }
  );


  /* ==========================================
     BĚŽNÉ OZNAČENÍ TEXTU

     Jednotné pravidlo LubaNote:
     - 1× tap = kurzor / editace
     - 2× tap = LubaNote vybere celé slovo pod prstem
     - long-press zde neřešíme; patří řádkovým prvkům pro MOVE MODE

     Android WebView se na nativní dvojtap nedá spolehlivě použít:
     v některých řádcích nechá pouze kurzor. Proto druhý tap poznáme
     sami a vytvoříme DOM Range přímo ve slově pod souřadnicí dotyku.
  ========================================== */

  function jePrvekMimoTextovyDvojtap(prvek) {
    return Boolean(
      prvek?.closest?.(
        ".lubaNoteImage, .lubaNoteImageSettings, .lubaNoteImageRemove, button, input, textarea, select"
      )
    );
  }


  function jeBodNaKulce(polozka, x) {
    if (!polozka) {
      return false;
    }

    const pozice =
      polozka.getBoundingClientRect();

    /*
     * Stejná oblast jako u bullet click logiky. Na kulce má přednost
     * sbalit / rozbalit, ne výběr slova.
     */
    const presah =
      window.innerWidth < 900
        ? 40
        : 28;

    return (
      x >= pozice.left - presah &&
      x <= pozice.left + 4
    );
  }


  function najdiCaretRozsahVBodu(x, y) {
    if (typeof document.caretRangeFromPoint === "function") {
      const rozsah =
        document.caretRangeFromPoint(x, y);

      if (rozsah) {
        return rozsah;
      }
    }

    if (typeof document.caretPositionFromPoint === "function") {
      const pozice =
        document.caretPositionFromPoint(x, y);

      if (!pozice?.offsetNode) {
        return null;
      }

      const rozsah =
        document.createRange();

      try {
        rozsah.setStart(
          pozice.offsetNode,
          pozice.offset
        );
        rozsah.collapse(true);
        return rozsah;
      } catch (_chyba) {
        return null;
      }
    }

    return null;
  }


  function najdiTextovyUzelProSlovo(rozsah) {
    if (!rozsah) {
      return null;
    }

    if (
      rozsah.startContainer.nodeType ===
      Node.TEXT_NODE
    ) {
      return {
        uzel: rozsah.startContainer,
        offset: rozsah.startOffset
      };
    }

    const kontejner =
      rozsah.startContainer;

    if (kontejner.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }

    const deti =
      Array.from(kontejner.childNodes);

    const kandidati = [
      deti[rozsah.startOffset] ?? null,
      deti[rozsah.startOffset - 1] ?? null
    ];

    for (const kandidat of kandidati) {
      if (kandidat?.nodeType === Node.TEXT_NODE) {
        return {
          uzel: kandidat,
          offset:
            kandidat === deti[rozsah.startOffset]
              ? 0
              : kandidat.textContent.length
        };
      }
    }

    return null;
  }


  function jeZnakSlova(znak) {
    return /[\p{L}\p{N}_]/u.test(
      znak || ""
    );
  }


  function najdiIndexSlovaPodBodem(
    textovyUzel,
    caretOffset,
    x,
    y
  ) {
    const text =
      textovyUzel?.textContent ?? "";

    if (!text) {
      return null;
    }

    const kandidati =
      new Set([
        caretOffset,
        caretOffset - 1,
        caretOffset + 1,
        caretOffset - 2
      ]);

    let nejlepsi = null;

    for (const index of kandidati) {
      if (
        index < 0 ||
        index >= text.length ||
        !jeZnakSlova(text[index])
      ) {
        continue;
      }

      const znakRozsah =
        document.createRange();

      try {
        znakRozsah.setStart(
          textovyUzel,
          index
        );

        znakRozsah.setEnd(
          textovyUzel,
          index + 1
        );
      } catch {
        continue;
      }

      const obdelniky =
        Array.from(
          znakRozsah.getClientRects()
        );

      for (const obdelnik of obdelniky) {
        /*
         * Vodorovně nesmíme přidávat žádnou toleranci.
         * Mezera mezi slovy má vlastní šířku a předchozí ±2 px
         * zasahovaly do sousedních písmen. Dvojtap na mezeru pak
         * omylem vybral levé nebo pravé slovo místo nabídky
         * Vložit / Vše. Svislá rezerva nevadí, protože pouze
         * usnadňuje zásah stejného řádku.
         */
        const rezervaY = 4;

        const jeVBodu =
          x >= obdelnik.left &&
          x <= obdelnik.right &&
          y >= obdelnik.top - rezervaY &&
          y <= obdelnik.bottom + rezervaY;

        if (!jeVBodu) {
          continue;
        }

        const stredX =
          obdelnik.left +
          obdelnik.width / 2;

        const stredY =
          obdelnik.top +
          obdelnik.height / 2;

        const vzdalenost =
          Math.hypot(
            x - stredX,
            y - stredY
          );

        if (
          !nejlepsi ||
          vzdalenost <
          nejlepsi.vzdalenost
        ) {
          nejlepsi = {
            index,
            vzdalenost
          };
        }
      }
    }

    return nejlepsi?.index ?? null;
  }


  function najdiHraniceSlova(text, pozice) {
    if (
      !text ||
      pozice == null ||
      pozice < 0 ||
      pozice >= text.length ||
      !jeZnakSlova(text[pozice])
    ) {
      return null;
    }

    if (typeof Intl?.Segmenter === "function") {
      const segmenter =
        new Intl.Segmenter(
          "cs",
          { granularity: "word" }
        );

      const segment =
        [...segmenter.segment(text)]
          .find(cast => (
            cast.isWordLike &&
            pozice >= cast.index &&
            pozice <
            cast.index + cast.segment.length
          ));

      if (segment) {
        return {
          start: segment.index,
          end:
            segment.index +
            segment.segment.length
        };
      }
    }

    let start = pozice;
    let end = pozice + 1;

    while (
      start > 0 &&
      jeZnakSlova(text[start - 1])
    ) {
      start -= 1;
    }

    while (
      end < text.length &&
      jeZnakSlova(text[end])
    ) {
      end += 1;
    }

    return { start, end };
  }


  function vyberSlovoVBodu(x, y) {
    const caretRozsah =
      najdiCaretRozsahVBodu(x, y);

    if (
      !caretRozsah ||
      !jeRozsahVEditoru(caretRozsah)
    ) {
      return false;
    }

    const textovyBod =
      najdiTextovyUzelProSlovo(caretRozsah);

    if (
      !textovyBod?.uzel ||
      !jeUzelVEditoru(textovyBod.uzel)
    ) {
      return false;
    }

    const text =
      textovyBod.uzel.textContent ?? "";

    const indexSlova =
      najdiIndexSlovaPodBodem(
        textovyBod.uzel,
        textovyBod.offset,
        x,
        y
      );

    const hranice =
      najdiHraniceSlova(
        text,
        indexSlova
      );

    if (!hranice) {
      return false;
    }

    const rozsah =
      document.createRange();

    rozsah.setStart(
      textovyBod.uzel,
      hranice.start
    );

    rozsah.setEnd(
      textovyBod.uzel,
      hranice.end
    );

    try {
      editorTextu.focus({
        preventScroll: true
      });
    } catch {
      editorTextu.focus();
    }

    const vyber =
      window.getSelection();

    if (!vyber) {
      return false;
    }

    vyber.removeAllRanges();
    vyber.addRange(rozsah);

    ulozRozsah(rozsah);
    zobrazMenuProOznaceni(rozsah);

    return true;
  }


  editorTextu.addEventListener(
    "touchstart",
    event => {
      if (
        event.touches.length !== 1 ||
        jePrvekMimoTextovyDvojtap(event.target)
      ) {
        zacatekTapuEditoru = null;
        return;
      }

      if (menuProKurzorAktivni) {
        skryjMenu();
      }

      const dotyk =
        event.touches[0];

      zacatekTapuEditoru = {
        id: dotyk.identifier,
        x: dotyk.clientX,
        y: dotyk.clientY,
        cas: performance.now()
      };
    },
    { passive: true }
  );


  editorTextu.addEventListener(
    "touchend",
    event => {
      if (!zacatekTapuEditoru) {
        return;
      }

      const dotyk =
        Array.from(event.changedTouches).find(
          kandidat =>
            kandidat.identifier ===
            zacatekTapuEditoru.id
        );

      if (!dotyk) {
        zacatekTapuEditoru = null;
        return;
      }

      const ted =
        performance.now();

      const delkaTapu =
        ted - zacatekTapuEditoru.cas;

      const pohyb =
        Math.hypot(
          dotyk.clientX - zacatekTapuEditoru.x,
          dotyk.clientY - zacatekTapuEditoru.y
        );

      const polozka =
        event.target.closest?.("li");

      const jeKratkyTap =
        delkaTapu <= MAX_DELKA_JEDNOHO_TAPU &&
        pohyb <= MAX_POHYB_JEDNOHO_TAPU &&
        !jeBodNaKulce(
          polozka,
          dotyk.clientX
        );

      zacatekTapuEditoru = null;

      if (!jeKratkyTap) {
        posledniTapEditoru = null;
        return;
      }

      const jeDruhyTap = Boolean(
        posledniTapEditoru &&
        ted - posledniTapEditoru.cas <=
        MAX_CAS_DVOJTAPU &&
        Math.hypot(
          dotyk.clientX - posledniTapEditoru.x,
          dotyk.clientY - posledniTapEditoru.y
        ) <= MAX_VZDALENOST_DVOJTAPU
      );

      if (!jeDruhyTap) {
        posledniTapEditoru = {
          x: dotyk.clientX,
          y: dotyk.clientY,
          cas: ted
        };
        return;
      }

      posledniTapEditoru = null;

      const vybrano =
        vyberSlovoVBodu(
          dotyk.clientX,
          dotyk.clientY
        );

      const zobrazenoMenuKurzor =
        vybrano
          ? false
          : zobrazMenuProKurzorVBodu(
            dotyk.clientX,
            dotyk.clientY
          );

      if (
        !vybrano &&
        !zobrazenoMenuKurzor
      ) {
        return;
      }

      /*
       * Druhý syntetický click Androidu by jinak mohl nový Range
       * nebo kurzor znovu přepsat.
       */
      event.preventDefault();
      ignorujKlikPoDvojtapuDo =
        performance.now() + 380;
    },
    { passive: false }
  );


  editorTextu.addEventListener(
    "click",
    event => {
      if (
        performance.now() >=
        ignorujKlikPoDvojtapuDo
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
    },
    true
  );


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
            return;
          }

          if (
            menuProTextareaKurzorAktivni &&
            aktivniTextarea === textarea
          ) {
            ulozVyberTextarea(textarea);
            nastavTlacitkaMenu(false);
            skryjUchytyVyberu();
            selectionMenu.hidden = false;

            if (bodMenuTextareaKurzor) {
              pozicujMenu({
                bod: bodMenuTextareaKurzor
              });
            }

            return;
          }

          skryjMenu();
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
          if (menuProKurzorAktivni) {
            ulozRozsah(rozsah);
            nastavTlacitkaMenu(false);
            skryjUchytyVyberu();
            selectionMenu.hidden = false;

            if (bodMenuKurzor) {
              pozicujMenu({
                bod: bodMenuKurzor
              });
            }

            return;
          }

          /*
           * Jednoduchý tap znamená pouze editaci.
           * Nabídku u kurzoru otevírá až dvojtap mimo slovo.
           */
          skryjMenu();
          return;
        }

        zobrazMenuProOznaceni(rozsah);
      }, 40);
    });
  }


  document.addEventListener(
    "lubanote:todo-kurzor-menu",
    event => {
      const textarea =
        event.detail?.textarea;

      if (!jeTodoTextarea(textarea)) {
        return;
      }

      zobrazMenuProKurzorTextarea(
        textarea,
        event.detail?.x ??
        textarea.getBoundingClientRect().left,
        event.detail?.y ??
        textarea.getBoundingClientRect().top
      );
    }
  );


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
