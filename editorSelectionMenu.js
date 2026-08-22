(() => {
  /* ==========================================
     LUBANOTE – VLASTNÍ NABÍDKA VÝBĚRU TEXTU

     Chování:
     - běžný tap = pouze kurzor, žádné menu
     - long-press na textu = Android označí text -> naše menu
     - long-press přímo na existujícím kurzoru = Vložit | Vše
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

  const DELKA_DLOUHEHO_STISKU = 520;
  const MAX_POHYB_DLOUHEHO_STISKU = 14;
  const MAX_VZDALENOST_OD_KURZORU = 34;

  let ulozenyRozsah = null;
  let lokalniSchranka = "";

  let casovacDlouhehoStisku = null;
  let kandidatDlouhehoStisku = false;
  let dlouhyStiskSpusten = false;
  let zablokujKlikPoDlouhemStisku = false;

  let rozsahKurzoruPredStiskem = null;
  let bodStisku = null;


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


  /* ==========================================
     ZOBRAZENÍ / POZICE MENU
  ========================================== */

  function skryjMenu() {
    selectionMenu.hidden = true;

    tlacitkoVyjmout?.removeAttribute("hidden");
    tlacitkoKopirovat?.removeAttribute("hidden");
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

    nastavTlacitkaMenu(true);
    selectionMenu.hidden = false;

    pozicujMenu({ rozsah });
  }


  function zobrazMenuProKurzor(rozsah, bod) {
    if (!ulozRozsah(rozsah)) {
      return;
    }

    nastavTlacitkaMenu(false);
    selectionMenu.hidden = false;

    pozicujMenu({
      rozsah,
      bod
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

    let provedeno = false;

    try {
      provedeno =
        document.execCommand(
          "insertText",
          false,
          text
        );
    } catch (_chyba) {
      provedeno = false;
    }

    if (provedeno) {
      const vyber =
        window.getSelection();

      if (
        vyber &&
        vyber.rangeCount > 0 &&
        jeRozsahVEditoru(vyber.getRangeAt(0))
      ) {
        ulozenyRozsah =
          vyber.getRangeAt(0).cloneRange();
      }

      return true;
    }

    try {
      const vyber =
        window.getSelection();

      if (!vyber || vyber.rangeCount === 0) {
        return false;
      }

      const rozsah =
        vyber.getRangeAt(0);

      rozsah.deleteContents();

      const textovyUzel =
        document.createTextNode(text);

      rozsah.insertNode(textovyUzel);
      rozsah.setStartAfter(textovyUzel);
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
        ulozenyRozsah
          ?.toString()
          ?.trim();

      if (!text) {
        return;
      }

      try {
        await zapisDoSchranky(text);
        skryjMenu();
        sklapniVyberNaKonec();
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
        ulozenyRozsah
          ?.toString()
          ?.trim();

      if (!text) {
        return;
      }

      try {
        await zapisDoSchranky(text);

        if (smazAktualniOznaceni()) {
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
      if (!ulozenyRozsah) {
        return;
      }

      try {
        const text =
          await prectiZeSchranky();

        if (!text) {
          skryjMenu();
          return;
        }

        if (vlozTextDoEditoru(text)) {
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
  ========================================== */

  document.addEventListener(
    "selectionchange",
    () => {
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

      if (!jeRozsahVEditoru(rozsah)) {
        skryjMenu();
        return;
      }

      if (rozsah.collapsed) {
        /*
         * Běžný tap = jen kurzor.
         * Menu se smí ukázat pouze naším skutečným long-pressem
         * přímo na existujícím kurzoru.
         */
        if (!dlouhyStiskSpusten) {
          skryjMenu();
        }

        return;
      }

      if (kandidatDlouhehoStisku) {
        return;
      }

      zobrazMenuProOznaceni(rozsah);
    }
  );


  /* ==========================================
     LONG-PRESS PŘÍMO NA EXISTUJÍCÍM KURZORU

     Android jinak může začít označovat nejbližší slovo.
     Pokud ale uživatel dlouze drží přímo na existujícím
     kurzoru, zablokujeme vznik výběru a otevřeme pouze
     Vložit | Vše.
  ========================================== */

  function vzdalenost(
    prvni,
    druha
  ) {
    return Math.hypot(
      prvni.x - druha.x,
      prvni.y - druha.y
    );
  }


  function bodKurzoru(rozsah) {
    const obdelnik =
      zjistiObdelnikRozsahu(rozsah);

    if (!obdelnik) {
      return null;
    }

    return {
      x: obdelnik.left,
      y:
        obdelnik.top +
        Math.max(obdelnik.height / 2, 1)
    };
  }


  function zrusCasovacDlouhehoStisku() {
    if (casovacDlouhehoStisku) {
      clearTimeout(
        casovacDlouhehoStisku
      );
    }

    casovacDlouhehoStisku = null;
  }


  function ukonciKandidataDlouhehoStisku() {
    zrusCasovacDlouhehoStisku();
    kandidatDlouhehoStisku = false;
    rozsahKurzoruPredStiskem = null;
    bodStisku = null;
  }


  editorTextu.addEventListener(
    "pointerdown",
    event => {
      if (
        event.pointerType &&
        event.pointerType !== "touch" &&
        event.pointerType !== "pen"
      ) {
        return;
      }

      dlouhyStiskSpusten = false;

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

      if (
        !rozsah.collapsed ||
        !jeRozsahVEditoru(rozsah)
      ) {
        return;
      }

      const kurzor =
        bodKurzoru(rozsah);

      if (!kurzor) {
        return;
      }

      const dotyk = {
        x: event.clientX,
        y: event.clientY
      };

      if (
        vzdalenost(kurzor, dotyk) >
        MAX_VZDALENOST_OD_KURZORU
      ) {
        return;
      }

      kandidatDlouhehoStisku = true;
      rozsahKurzoruPredStiskem =
        rozsah.cloneRange();
      bodStisku = dotyk;

      zrusCasovacDlouhehoStisku();

      casovacDlouhehoStisku =
        setTimeout(
          () => {
            if (
              !kandidatDlouhehoStisku ||
              !rozsahKurzoruPredStiskem
            ) {
              return;
            }

            dlouhyStiskSpusten = true;
            zablokujKlikPoDlouhemStisku = true;

            const vyberAktualni =
              window.getSelection();

            vyberAktualni?.removeAllRanges();
            vyberAktualni?.addRange(
              rozsahKurzoruPredStiskem
            );

            zobrazMenuProKurzor(
              rozsahKurzoruPredStiskem,
              bodStisku
            );

            zrusCasovacDlouhehoStisku();
          },
          DELKA_DLOUHEHO_STISKU
        );
    },
    { passive: true }
  );


  editorTextu.addEventListener(
    "pointermove",
    event => {
      if (
        !kandidatDlouhehoStisku ||
        !bodStisku
      ) {
        return;
      }

      const aktualniBod = {
        x: event.clientX,
        y: event.clientY
      };

      if (
        vzdalenost(
          bodStisku,
          aktualniBod
        ) > MAX_POHYB_DLOUHEHO_STISKU
      ) {
        ukonciKandidataDlouhehoStisku();
      }
    },
    { passive: true }
  );


  /*
   * Klíčová část: pokud long-press začíná přímo na existujícím
   * kurzoru, nenecháme WebView označit nejbližší slovo.
   */
  editorTextu.addEventListener(
    "selectstart",
    event => {
      if (kandidatDlouhehoStisku) {
        event.preventDefault();
      }
    }
  );


  editorTextu.addEventListener(
    "pointerup",
    () => {
      if (!dlouhyStiskSpusten) {
        ukonciKandidataDlouhehoStisku();
        return;
      }

      kandidatDlouhehoStisku = false;
      rozsahKurzoruPredStiskem = null;
      bodStisku = null;
    }
  );


  editorTextu.addEventListener(
    "pointercancel",
    () => {
      ukonciKandidataDlouhehoStisku();
      dlouhyStiskSpusten = false;
    }
  );


  editorTextu.addEventListener(
    "click",
    event => {
      if (!zablokujKlikPoDlouhemStisku) {
        return;
      }

      zablokujKlikPoDlouhemStisku = false;
      event.preventDefault();
      event.stopPropagation();
    },
    true
  );


  /* contextmenu po našem long-pressu nesmí otevřít další nabídku. */
  editorTextu.addEventListener(
    "contextmenu",
    event => {
      if (
        dlouhyStiskSpusten ||
        kandidatDlouhehoStisku
      ) {
        event.preventDefault();
      }
    }
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
