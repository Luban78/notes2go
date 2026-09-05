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

  /*
   * V nativní Android APK už WebView zobrazuje vlastní systémové
   * úchyty výběru. LubaNote tedy nesmí kreslit druhý pár přes ně.
   * Programové označení slova i naše menu zůstávají zachované.
   */
  const jeNativniAndroid =
    window.Capacitor?.getPlatform?.() === "android" ||
    window.Capacitor?.isNativePlatform?.() === true;

  if (!editorTextu || !selectionMenu) {
    return;
  }

  let ulozenyRozsah = null;
  let aktivniRichEditor = null;
  let aktivniTextarea = null;
  let ulozenyVyberTextarea = null;
  let lokalniSchranka = "";
  let lokalniRichSchranka = null;

  /*
   * Android WebView neumí spolehlivě označit slovo nativním dvojtapem
   * ve všech řádcích contenteditable editoru. Dvojtap proto detekuje
   * LubaNote samo a vytvoří Range přesně ve slově pod prstem.
   */
  const MAX_CAS_DVOJTAPU = 330;
  const MAX_VZDALENOST_DVOJTAPU = 34;
  const MAX_DELKA_JEDNOHO_TAPU = 300;
  const MAX_POHYB_JEDNOHO_TAPU = 16;
  const REZERVA_MEZERY_EDITORU_X = 10;

  let zacatekTapuEditoru = null;
  let posledniTapEditoru = null;
  let ignorujKlikPoDvojtapuDo = 0;

  /* TODO používá stejný dvojtap jako normální rich-text editor. */
  let zacatekTapuTodo = null;
  let posledniTapTodo = null;
  let ignorujKlikTodoPoDvojtapuDo = 0;

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

  function ziskejPrvekZUzlu(uzel) {
    if (!uzel) {
      return null;
    }

    return uzel.nodeType === Node.ELEMENT_NODE
      ? uzel
      : uzel.parentElement;
  }


  function ziskejRichEditorProUzel(uzel) {
    const prvek = ziskejPrvekZUzlu(uzel);

    if (!prvek) {
      return null;
    }

    if (
      prvek === editorTextu ||
      editorTextu.contains(prvek)
    ) {
      return editorTextu;
    }

    const todoEditor = prvek.closest?.(
      ".todoRichTextInput.todoEditing"
    );

    if (
      todoEditor &&
      document.contains(todoEditor)
    ) {
      return todoEditor;
    }

    return null;
  }


  function ziskejRichEditorProRozsah(rozsah) {
    if (!rozsah) {
      return null;
    }

    const editorStart =
      ziskejRichEditorProUzel(rozsah.startContainer);

    const editorEnd =
      ziskejRichEditorProUzel(rozsah.endContainer);

    const editor =
      editorStart && editorStart === editorEnd
        ? editorStart
        : null;

    /*
     * Stabilizace V1:
     * V Android APK ponecháváme nativní systémové úchyty výběru,
     * ale akční menu Vyjmout/Kopírovat/Vložit/Vše zůstává naše.
     * Android WebView totiž v našem full-screen editoru nativní
     * akční lištu nezobrazuje spolehlivě.
     */
    return editor;
  }


  function jeUzelVEditoru(uzel) {
    return Boolean(
      ziskejRichEditorProUzel(uzel)
    );
  }


  function jeRozsahVEditoru(rozsah) {
    return Boolean(
      ziskejRichEditorProRozsah(rozsah)
    );
  }


  function ulozRozsah(rozsah) {
    const cilovyEditor =
      ziskejRichEditorProRozsah(rozsah);

    if (!cilovyEditor) {
      return false;
    }

    ulozenyRozsah =
      rozsah.cloneRange();

    aktivniRichEditor = cilovyEditor;

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
    const todoList =
  document.getElementById("todoList");

todoList?.classList.remove(
  "todoVyberVse"
);

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

    /*
     * Android APK už kreslí vlastní systémové úchyty.
     * V hlavním Standard/Bullet editoru tedy naše druhé úchyty
     * nikdy nevykreslujeme. Menu ale zůstává aktivní.
     */
    const editorRozsahu =
      ziskejRichEditorProRozsah(rozsah);

    if (jeNativniAndroid && editorRozsahu === editorTextu) {
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
    y,
    vynucenyRozsah = null,
    vynucenyEditor = null
  ) {
    const rozsah =
      vynucenyRozsah ??
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

    const cilovyEditor =
      vynucenyEditor ??
      ziskejRichEditorProRozsah(kurzorRozsah);

    if (
      !cilovyEditor ||
      ziskejRichEditorProRozsah(kurzorRozsah) !== cilovyEditor
    ) {
      return false;
    }

    try {
      cilovyEditor.focus({
        preventScroll: true
      });
    } catch {
      cilovyEditor.focus();
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




  function vytvorRichKopiiZRozsahu(rozsah, text) {
    if (!rozsah || rozsah.collapsed || !text) {
      return null;
    }

    try {
      const fragment = rozsah.cloneContents();
      const obal = document.createElement("div");
      obal.appendChild(fragment);

      /*
       * Obrázky/attachmenty mají vlastní lifecycle a nesmí se
       * duplikovat prostým HTML copy/paste. Pro ně zatím použijeme
       * bezpečný plain-text fallback.
       */
      if (
        obal.querySelector(
          ".lubaNoteImage, figure, img, [data-attachment-id]"
        )
      ) {
        return null;
      }

      const html = obal.innerHTML;

      if (!html) {
        return null;
      }

      return {
        text,
        html
      };
    } catch (_chyba) {
      return null;
    }
  }


  function vlozRichHtmlDoEditoru(html, textProInput = "") {
    if (!html || !obnovUlozenyRozsah()) {
      return false;
    }

    const cilovyEditor =
      aktivniRichEditor ??
      ziskejRichEditorProRozsah(ulozenyRozsah) ??
      editorTextu;

    try {
      cilovyEditor.focus({
        preventScroll: true
      });
    } catch {
      cilovyEditor.focus();
    }

    try {
      const vyber = window.getSelection();

      if (!vyber || vyber.rangeCount === 0) {
        return false;
      }

      const rozsah = vyber.getRangeAt(0);

      if (!jeRozsahVEditoru(rozsah)) {
        return false;
      }

      rozsah.deleteContents();

      const fragment =
        rozsah.createContextualFragment(html);

      const posledniUzel =
        fragment.lastChild;

      if (!posledniUzel) {
        return false;
      }

      rozsah.insertNode(fragment);

      const novyRozsah = document.createRange();
      novyRozsah.setStartAfter(posledniUzel);
      novyRozsah.collapse(true);

      vyber.removeAllRanges();
      vyber.addRange(novyRozsah);

      ulozenyRozsah =
        novyRozsah.cloneRange();

      oznamZmenuEditoru(
        "insertText",
        textProInput || null
      );

      return true;
    } catch (chyba) {
      console.warn(
        "LubaNote: rich vložení selhalo, použije se plain text.",
        chyba
      );
      return false;
    }
  }


  /* ==========================================
     ZMĚNY EDITORU
  ========================================== */

  function oznamZmenuEditoru(
    inputType,
    data = null
  ) {
    const cilovyEditor =
      aktivniRichEditor ??
      ziskejRichEditorProRozsah(ulozenyRozsah) ??
      editorTextu;

    try {
      cilovyEditor.dispatchEvent(
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
      cilovyEditor.dispatchEvent(
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

    const cilovyEditor =
      aktivniRichEditor ??
      ziskejRichEditorProRozsah(ulozenyRozsah) ??
      editorTextu;

    try {
      cilovyEditor.focus({
        preventScroll: true
      });
    } catch {
      cilovyEditor.focus();
    }

    try {
      const vyber = window.getSelection();

      if (!vyber || vyber.rangeCount === 0) {
        return false;
      }

      const rozsah = vyber.getRangeAt(0);

      if (!jeRozsahVEditoru(rozsah)) {
        return false;
      }

      /*
       * NEKOPÍRUJEME ručně computed style. To umělo v Android WebView
       * v některých stavech vzít velikost z jiného rodiče a vložený
       * text byl menší nebo naopak větší.
       *
       * insertText se chová jako normální psaní na aktuálním caret-u:
       * zahodí zdrojové HTML, ale zachová právě aktivní typografický
       * kontext editoru. Přesně to chceme od „Vložit jako čistý text“.
       */
      let vlozenoNativne = false;

      try {
        vlozenoNativne =
          document.execCommand(
            "insertText",
            false,
            text
          );
      } catch {
        vlozenoNativne = false;
      }

      if (!vlozenoNativne) {
        /*
         * Bezpečný fallback: obyčejný textový uzel bez vlastního span-u
         * a bez font-size. Browser tak stále zdědí styl okolí.
         */
        const aktualniRozsah =
          window.getSelection()?.getRangeAt(0);

        if (!aktualniRozsah) {
          return false;
        }

        aktualniRozsah.deleteContents();

        const textovyUzel =
          document.createTextNode(text);

        aktualniRozsah.insertNode(textovyUzel);
        aktualniRozsah.setStartAfter(textovyUzel);
        aktualniRozsah.collapse(true);

        vyber.removeAllRanges();
        vyber.addRange(aktualniRozsah);
      }

      const novyVyber = window.getSelection();
      if (novyVyber?.rangeCount) {
        ulozenyRozsah =
          novyVyber.getRangeAt(0).cloneRange();
      }

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

  function ziskejTextCelehoTodo() {
  const todoList =
    document.getElementById("todoList");

  if (!todoList) {
    return "";
  }

  const todoPolozky =
    todoList.querySelectorAll(
      ".todoItem"
    );

  return Array.from(todoPolozky)
    .map((polozka) => {
      const richText =
        polozka.querySelector(
          ".todoRichTextInput"
        );

      if (richText) {
        return richText.textContent ?? "";
      }

      const textarea =
        polozka.querySelector(
          ".todoTextInput"
        );

      if (textarea) {
        return textarea.value;
      }

      const zobrazenyText =
        polozka.querySelector(
          ".todoTextDisplay"
        );

      return zobrazenyText
        ?.textContent ?? "";
    })
    .join("\n")
    .trim();
}

  tlacitkoKopirovat?.addEventListener(
  "click",
  async () => {
    const todoList =
      document.getElementById("todoList");

    const jeVybraneCeleTodo =
      todoList?.classList.contains(
        "todoVyberVse"
      );

    const text =
      jeVybraneCeleTodo
        ? ziskejTextCelehoTodo()
        : aktivniTextarea
          ? ziskejTextTextareaVyberu()
          : ulozenyRozsah
            ?.toString();

    if (!text) {
      return;
    }

    const richKopie =
      !jeVybraneCeleTodo &&
      !aktivniTextarea &&
      ulozenyRozsah
        ? vytvorRichKopiiZRozsahu(
            ulozenyRozsah,
            text
          )
        : null;

    try {
      await zapisDoSchranky(text);
      lokalniRichSchranka = richKopie;

      if (jeVybraneCeleTodo) {
        todoList.classList.remove(
          "todoVyberVse"
        );
      } else if (aktivniTextarea) {
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
          ? ziskejTextTextareaVyberu()
          : ulozenyRozsah
            ?.toString();

      if (!text) {
        return;
      }

      const richKopie =
        !aktivniTextarea && ulozenyRozsah
          ? vytvorRichKopiiZRozsahu(
              ulozenyRozsah,
              text
            )
          : null;

      try {
        await zapisDoSchranky(text);
        lokalniRichSchranka = richKopie;

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

        const pouzijRichVlozeni =
          !aktivniTextarea &&
          lokalniRichSchranka?.html &&
          lokalniRichSchranka.text === text;

        let vlozeno = false;

        if (aktivniTextarea) {
          vlozeno = nahradTextareaVyber(text);
        } else if (pouzijRichVlozeni) {
          vlozeno = vlozRichHtmlDoEditoru(
            lokalniRichSchranka.html,
            text
          );

          if (!vlozeno) {
            vlozeno = vlozTextDoEditoru(text);
          }
        } else {
          vlozeno = vlozTextDoEditoru(text);
        }

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
      const aktivniTodoEditor =
        aktivniRichEditor?.matches?.(
          ".todoRichTextInput.todoEditing"
        )
          ? aktivniRichEditor
          : null;

      const todoEditorProVse =
        aktivniTodoEditor || aktivniTextarea;

      if (todoEditorProVse) {
        if (vyberVsechnyTodoPolozky()) {
          nastavTlacitkaMenu(true);

          selectionMenu.hidden = false;

          const rect =
            todoEditorProVse.getBoundingClientRect();

          pozicujMenu({
            bod: {
              x: rect.left + rect.width / 2,
              y: rect.top
            }
          });

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


  function najdiKurzorMezeryPoblizBodu(
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
        caretOffset - 2,
        caretOffset + 2
      ]);

    let nejlepsi = null;

    for (const index of kandidati) {
      const znak = text[index];

      if (
        index < 0 ||
        index >= text.length ||
        !/\s/u.test(znak || "") ||
        znak === "\n" ||
        znak === "\r"
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
        const rezervaY = 4;

        const jePoblizMezery =
          x >=
          obdelnik.left -
          REZERVA_MEZERY_EDITORU_X &&
          x <=
          obdelnik.right +
          REZERVA_MEZERY_EDITORU_X &&
          y >= obdelnik.top - rezervaY &&
          y <= obdelnik.bottom + rezervaY;

        if (!jePoblizMezery) {
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
          nejlepsi &&
          vzdalenost >=
          nejlepsi.vzdalenost
        ) {
          continue;
        }

        const kurzorRozsah =
          document.createRange();

        try {
          kurzorRozsah.setStart(
            textovyUzel,
            x <= stredX
              ? index
              : index + 1
          );
          kurzorRozsah.collapse(true);
        } catch {
          continue;
        }

        nejlepsi = {
          rozsah: kurzorRozsah,
          vzdalenost
        };
      }
    }

    return nejlepsi?.rozsah ?? null;
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


  function vyberSlovoVBodu(
    x,
    y,
    vynucenyEditor = null,
    vynucenyTextovyBod = null
  ) {
    const caretRozsah =
      najdiCaretRozsahVBodu(x, y);

    const cilovyEditor =
      vynucenyEditor ??
      ziskejRichEditorProRozsah(caretRozsah);

    if (
      !caretRozsah ||
      !cilovyEditor ||
      ziskejRichEditorProRozsah(caretRozsah) !== cilovyEditor
    ) {
      return false;
    }

    const textovyBod =
      vynucenyTextovyBod ??
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
      cilovyEditor.focus({
        preventScroll: true
      });
    } catch {
      cilovyEditor.focus();
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

      const caretRozsah =
        najdiCaretRozsahVBodu(
          dotyk.clientX,
          dotyk.clientY
        );

      const textovyBod =
        najdiTextovyUzelProSlovo(
          caretRozsah
        );

      const kurzorMezery =
        textovyBod?.uzel &&
        jeUzelVEditoru(textovyBod.uzel)
          ? najdiKurzorMezeryPoblizBodu(
            textovyBod.uzel,
            textovyBod.offset,
            dotyk.clientX,
            dotyk.clientY
          )
          : null;

      const vybrano =
        kurzorMezery
          ? false
          : vyberSlovoVBodu(
            dotyk.clientX,
            dotyk.clientY
          );

      const zobrazenoMenuKurzor =
        vybrano
          ? false
          : zobrazMenuProKurzorVBodu(
            dotyk.clientX,
            dotyk.clientY,
            kurzorMezery
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


  /* ==========================================
     TODO RICH-TEXT – STEJNÝ DVOJTAP JAKO POZNÁMKA

     Normální editor výše zůstává beze změny. TODO používá stejný
     algoritmus, ale události posloucháme delegovaně na #todoList,
     protože jednotlivé TODO editory vznikají dynamicky.
  ========================================== */

  const todoListProVyber =
    document.getElementById("todoList");


  function ziskejTextovyUzelZPotomka(
    prvek,
    odKonce = false
  ) {
    if (!prvek) {
      return null;
    }

    if (prvek.nodeType === Node.TEXT_NODE) {
      return prvek;
    }

    if (prvek.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }

    const walker = document.createTreeWalker(
      prvek,
      NodeFilter.SHOW_TEXT
    );

    if (!odKonce) {
      return walker.nextNode();
    }

    let posledni = null;
    let uzel = walker.nextNode();

    while (uzel) {
      posledni = uzel;
      uzel = walker.nextNode();
    }

    return posledni;
  }


  function najdiTextovyUzelProTodoSlovo(
    rozsah,
    todoEditor
  ) {
    const primy =
      najdiTextovyUzelProSlovo(rozsah);

    if (
      primy?.uzel &&
      todoEditor.contains(primy.uzel)
    ) {
      return primy;
    }

    const kontejner = rozsah?.startContainer;

    if (
      !kontejner ||
      kontejner.nodeType !== Node.ELEMENT_NODE
    ) {
      return null;
    }

    const deti = Array.from(kontejner.childNodes);

    const zaKurzorem =
      deti[rozsah.startOffset] ?? null;

    const predKurzorem =
      deti[rozsah.startOffset - 1] ?? null;

    const uzelZa =
      ziskejTextovyUzelZPotomka(
        zaKurzorem,
        false
      );

    if (uzelZa && todoEditor.contains(uzelZa)) {
      return {
        uzel: uzelZa,
        offset: 0
      };
    }

    const uzelPred =
      ziskejTextovyUzelZPotomka(
        predKurzorem,
        true
      );

    if (uzelPred && todoEditor.contains(uzelPred)) {
      return {
        uzel: uzelPred,
        offset: uzelPred.textContent?.length ?? 0
      };
    }

    return null;
  }


  function ziskejTodoCilDvojtapu(target) {
    const textovyPrvek =
      target?.closest?.(
        ".todoTextDisplay, .todoRichTextInput"
      );

    const todoItem =
      textovyPrvek?.closest?.(".todoItem");

    if (!textovyPrvek || !todoItem) {
      return null;
    }

    return {
      textovyPrvek,
      todoItem,
      todoId: todoItem.dataset.todoId ?? ""
    };
  }


  todoListProVyber?.addEventListener(
    "touchstart",
    event => {
      if (event.touches.length !== 1) {
        zacatekTapuTodo = null;
        return;
      }

      const cil =
        ziskejTodoCilDvojtapu(event.target);

      if (!cil) {
        zacatekTapuTodo = null;
        return;
      }

      const dotyk = event.touches[0];

      zacatekTapuTodo = {
        id: dotyk.identifier,
        todoId: cil.todoId,
        x: dotyk.clientX,
        y: dotyk.clientY,
        cas: performance.now()
      };
    },
    { passive: true }
  );


  todoListProVyber?.addEventListener(
    "touchend",
    event => {
      if (!zacatekTapuTodo) {
        return;
      }

      const dotyk =
        Array.from(event.changedTouches).find(
          kandidat =>
            kandidat.identifier ===
            zacatekTapuTodo.id
        );

      if (!dotyk) {
        zacatekTapuTodo = null;
        return;
      }

      const ted = performance.now();

      const delkaTapu =
        ted - zacatekTapuTodo.cas;

      const pohyb = Math.hypot(
        dotyk.clientX - zacatekTapuTodo.x,
        dotyk.clientY - zacatekTapuTodo.y
      );

      const todoId = zacatekTapuTodo.todoId;
      zacatekTapuTodo = null;

      if (
        delkaTapu > MAX_DELKA_JEDNOHO_TAPU ||
        pohyb > MAX_POHYB_JEDNOHO_TAPU
      ) {
        posledniTapTodo = null;
        return;
      }

      const jeDruhyTap = Boolean(
        posledniTapTodo &&
        posledniTapTodo.todoId === todoId &&
        ted - posledniTapTodo.cas <=
          MAX_CAS_DVOJTAPU &&
        Math.hypot(
          dotyk.clientX - posledniTapTodo.x,
          dotyk.clientY - posledniTapTodo.y
        ) <= MAX_VZDALENOST_DVOJTAPU
      );

      if (!jeDruhyTap) {
        posledniTapTodo = {
          todoId,
          x: dotyk.clientX,
          y: dotyk.clientY,
          cas: ted
        };
        return;
      }

      posledniTapTodo = null;

      const todoItem =
        Array.from(
          todoListProVyber.querySelectorAll(
            ".todoItem"
          )
        ).find(
          polozka =>
            polozka.dataset.todoId === todoId
        ) ?? null;

      const todoEditor =
        todoItem?.querySelector(
          ".todoRichTextInput.todoEditing"
        );

      if (!todoEditor) {
        return;
      }

      const caretRozsah =
        najdiCaretRozsahVBodu(
          dotyk.clientX,
          dotyk.clientY
        );

      if (
        !caretRozsah ||
        ziskejRichEditorProRozsah(caretRozsah) !==
          todoEditor
      ) {
        return;
      }

      const textovyBod =
        najdiTextovyUzelProTodoSlovo(
          caretRozsah,
          todoEditor
        );

      const kurzorMezery =
        textovyBod?.uzel
          ? najdiKurzorMezeryPoblizBodu(
              textovyBod.uzel,
              textovyBod.offset,
              dotyk.clientX,
              dotyk.clientY
            )
          : null;

      const vybrano =
        kurzorMezery
          ? false
          : vyberSlovoVBodu(
              dotyk.clientX,
              dotyk.clientY,
              todoEditor,
              textovyBod
            );

      const zobrazenoMenuKurzor =
        vybrano
          ? false
          : zobrazMenuProKurzorVBodu(
              dotyk.clientX,
              dotyk.clientY,
              kurzorMezery,
              todoEditor
            );

      if (
        !vybrano &&
        !zobrazenoMenuKurzor
      ) {
        return;
      }

      /*
       * Stejně jako u normální poznámky zablokujeme druhý nativní tap,
       * aby Android nad naším Range neotevřel vlastní lištu.
       */
      event.preventDefault();

      ignorujKlikTodoPoDvojtapuDo =
        performance.now() + 380;
    },
    { passive: false }
  );


  todoListProVyber?.addEventListener(
    "click",
    event => {
      if (
        performance.now() >=
          ignorujKlikTodoPoDvojtapuDo
      ) {
        return;
      }

      if (!ziskejTodoCilDvojtapu(event.target)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
    },
    true
  );


  todoListProVyber?.addEventListener(
    "dblclick",
    event => {
      if (
        event.target.closest?.(
          ".todoRichTextInput.todoEditing"
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
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
      const todoRichEditor =
        event.target.closest?.(
          ".todoRichTextInput.todoEditing"
        );

      if (todoRichEditor) {
        const vyber = window.getSelection();
        const rozsah =
          vyber?.rangeCount
            ? vyber.getRangeAt(0)
            : null;

        if (
          rozsah &&
          ziskejRichEditorProRozsah(rozsah) ===
            todoRichEditor &&
          !rozsah.collapsed
        ) {
          event.preventDefault();
          return;
        }
      }

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
        jeUzelVEditoru(event.target) ||
        event.target.closest?.(".selectionHandle")
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


  todoListProVyber?.addEventListener(
    "input",
    event => {
      if (
        event.target.matches?.(
          ".todoRichTextInput.todoEditing"
        ) &&
        !selectionMenu.hidden
      ) {
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
