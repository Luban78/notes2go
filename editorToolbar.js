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
      jeDotyk ? 42 : 28;

    const dosahVpravo =
      jeDotyk ? 8 : 0;

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
     * čas → text → další nástroje
     */
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
      tlacitkoToolbar.textContent = "☷";

      tlacitkoToolbar.setAttribute(
        "aria-label",
        "Otevřít další nástroje"
      );
    }

    if (jsouNastroje) {
      tlacitkoToolbar.textContent = "🕒";

      tlacitkoToolbar.setAttribute(
        "aria-label",
        "Zobrazit datum a čas"
      );
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

    pripravEditorProFormatovani();

    document.execCommand(
      "fontSize",
      false,
      "7"
    );

    editorTextu
      .querySelectorAll('font[size="7"]')
      .forEach(prvek => {
        prvek.removeAttribute("size");
        prvek.style.fontSize = `${hodnota}px`;
        prvek.dataset.velikostPisma = hodnota;
      });

    tlacitkoVelikostPisma.textContent = hodnota;

    ulozVyberTextu();
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

    let aktualniPrvek = prvek;

    while (
      aktualniPrvek &&
      aktualniPrvek !== editorTextu
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
        ".lubaNoteImage, .lubaNoteImageSettings, .lubaNoteImageRemove"
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

    if (
      !vyber ||
      vyber.rangeCount === 0
    ) {
      return;
    }

    const rozsah = vyber.getRangeAt(0);
    const cilovyEditor =
      ziskejEditorFormatovaniProRozsah(rozsah);

    if (
      !cilovyEditor?.matches?.(
        ".todoRichTextInput.todoEditing"
      )
    ) {
      return;
    }

    ulozVyberTextu();

    /*
     * Android nesmí při stisku tlačítka převést focus z TODO
     * na toolbar a zahodit označený Range. Click se vyvolá dál.
     */
    event.preventDefault();
  }


  [
    tlacitkoToolbar,
    tlacitkoTucne,
    tlacitkoKurziva,
    tlacitkoPodtrzeni,
    tlacitkoBarvaTextu
  ].forEach(tlacitko => {
    tlacitko?.addEventListener(
      "pointerdown",
      zachovejTodoVyberPredKlikem
    );
  });


  panelBarvaTextu?.addEventListener(
    "pointerdown",
    event => {
      if (
        ulozenyEditorTextu?.matches?.(
          ".todoRichTextInput.todoEditing"
        ) &&
        event.target.closest?.(
          "[data-text-color]"
        )
      ) {
        event.preventDefault();
      }
    }
  );


  /* ==========================================
     UDÁLOSTI – TOOLBAR
  ========================================== */

  tlacitkoToolbar.addEventListener(
    "click",
    () => {
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
      provedPrikaz("undo");
    }
  );


  tlacitkoZnovu?.addEventListener(
    "click",
    () => {
      provedPrikaz("redo");
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

     1× tap / klik = editace
     2× tap / klik = nativní výběr slova
     long-press kdekoliv v <li> = MOVE MODE
     po aktivaci MOVE MODE lze řádek táhnout kdekoliv
     tap na samotnou kulku mimo MOVE MODE = sbalit / rozbalit
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
        uklidTazeniBulletu({
          zrusVyber: true,
          oznamZmenu: true
        });
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
          nastavToolbar("cas");
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
          zavriVsechnyPanely();
        }
      );
    });




})();
