(() => {
  /* ==========================================
     PRVKY HLAVNÍHO TOOLBARU
  ========================================== */

  const tlacitkoToolbar =
    document.getElementById("editorToolbarToggle");

  const rychlyToolbar =
    document.getElementById("editorQuickToolbar");

  const datumCas =
    document.querySelector(".dateTimeInputs");

  const tlacitkoPripominky =
    document.getElementById("reminderButton");

  const editorTextu =
    document.getElementById("modalRichText");


  /* ==========================================
     PRVNÍ ÚROVEŇ
  ========================================== */

  const prvniUrovenToolbaru =
    document.getElementById("editorToolbarPrvniUroven");

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

  const tlacitkoDruhaUroven =
    document.getElementById("tlacitkoDruhaUroven");


  /* ==========================================
     DRUHÁ ÚROVEŇ
  ========================================== */

  const druhaUrovenToolbaru =
    document.getElementById("editorToolbarDruhaUroven");

  const tlacitkoPrvniUroven =
    document.getElementById("tlacitkoPrvniUroven");

  const tlacitkoVelikostPisma =
    document.getElementById("tlacitkoVelikostPisma");

  const tlacitkoVlozitObrazek =
    document.getElementById("tlacitkoVlozitObrazek");

  const tlacitkoVlozitOdkaz =
    document.getElementById("tlacitkoVlozitOdkaz");


  /* ==========================================
     VÝBĚR VELIKOSTI PÍSMA
  ========================================== */

  const toolbarVelikosti =
    document.getElementById("editorToolbarVelikosti");

  const tlacitkoZpetZVelikosti =
    document.getElementById("tlacitkoZpetZVelikosti");

  const tlacitkaVelikosti =
    document.querySelectorAll(".editorVelikostPisma");


  /* ==========================================
     ULOŽENÝ VÝBĚR TEXTU
  ========================================== */

  let ulozenyVyberTextu = null;


  function ulozVyberTextu() {
    const vyber = window.getSelection();

    if (!vyber || vyber.rangeCount === 0) {
      ulozenyVyberTextu = null;
      return;
    }

    ulozenyVyberTextu =
      vyber.getRangeAt(0).cloneRange();
  }


  function obnovVyberTextu() {
    if (!ulozenyVyberTextu) {
      return;
    }

    const vyber = window.getSelection();

    if (!vyber) {
      return;
    }

    vyber.removeAllRanges();
    vyber.addRange(ulozenyVyberTextu);
  }


  /* ==========================================
     KONTROLA ZÁKLADNÍCH PRVKŮ
  ========================================== */

  if (
    !tlacitkoToolbar ||
    !rychlyToolbar ||
    !datumCas
  ) {
    return;
  }


  /* ==========================================
     PŘEPÍNÁNÍ ÚROVNÍ
  ========================================== */

  function zobrazPrvniUroven() {
    if (prvniUrovenToolbaru) {
      prvniUrovenToolbaru.hidden = false;
    }

    if (druhaUrovenToolbaru) {
      druhaUrovenToolbaru.hidden = true;
    }

    if (toolbarVelikosti) {
      toolbarVelikosti.hidden = true;
    }
  }


  function zobrazDruhouUroven() {
    if (prvniUrovenToolbaru) {
      prvniUrovenToolbaru.hidden = true;
    }

    if (druhaUrovenToolbaru) {
      druhaUrovenToolbaru.hidden = false;
    }

    if (toolbarVelikosti) {
      toolbarVelikosti.hidden = true;
    }
  }


  function zobrazVelikostiPisma() {
    if (prvniUrovenToolbaru) {
      prvniUrovenToolbaru.hidden = true;
    }

    if (druhaUrovenToolbaru) {
      druhaUrovenToolbaru.hidden = true;
    }

    if (toolbarVelikosti) {
      toolbarVelikosti.hidden = false;
    }
  }


  /* ==========================================
     OTEVŘENÍ / ZAVŘENÍ TOOLBARU
  ========================================== */

  function nastavToolbar(otevreny) {
    rychlyToolbar.hidden = !otevreny;
    datumCas.hidden = otevreny;

    if (tlacitkoPripominky) {
      tlacitkoPripominky.hidden = otevreny;
    }

    tlacitkoToolbar.textContent =
      otevreny ? "⌃" : "⌄";

    tlacitkoToolbar.setAttribute(
      "aria-label",
      otevreny
        ? "Zavřít editační nástroje"
        : "Otevřít editační nástroje"
    );

    tlacitkoToolbar.setAttribute(
      "aria-expanded",
      String(otevreny)
    );

    zobrazPrvniUroven();
  }


  /* ==========================================
     HISTORIE
  ========================================== */

  function provedHistorii(prikaz) {
    if (!editorTextu || editorTextu.hidden) {
      return;
    }

    editorTextu.focus({
      preventScroll: true
    });

    try {
      document.execCommand(
        prikaz,
        false,
        null
      );
    } catch (chyba) {
      console.warn(
        `Historii editoru se nepodařilo provést: ${prikaz}`,
        chyba
      );
    }
  }


  /* ==========================================
     FORMÁTOVÁNÍ TEXTU
  ========================================== */

  function provedFormatovani(prikaz) {
    if (!editorTextu || editorTextu.hidden) {
      return;
    }

    editorTextu.focus({
      preventScroll: true
    });

    try {
      document.execCommand(
        prikaz,
        false,
        null
      );
    } catch (chyba) {
      console.warn(
        `Formátování se nepodařilo provést: ${prikaz}`,
        chyba
      );
    }
  }


  /* ==========================================
     HLAVNÍ ŠIPKA TOOLBARU
  ========================================== */

  tlacitkoToolbar.addEventListener(
    "click",
    () => {
      nastavToolbar(
        rychlyToolbar.hidden
      );
    }
  );


  /* ==========================================
     UNDO / REDO
  ========================================== */

  tlacitkoZpet?.addEventListener(
    "click",
    () => {
      provedHistorii("undo");
    }
  );


  tlacitkoZnovu?.addEventListener(
    "click",
    () => {
      provedHistorii("redo");
    }
  );


  /* ==========================================
     B / I / U
  ========================================== */

  tlacitkoTucne?.addEventListener(
    "click",
    () => {
      provedFormatovani("bold");
    }
  );


  tlacitkoKurziva?.addEventListener(
    "click",
    () => {
      provedFormatovani("italic");
    }
  );


  tlacitkoPodtrzeni?.addEventListener(
    "click",
    () => {
      provedFormatovani("underline");
    }
  );


  /* ==========================================
     PRVNÍ → DRUHÁ ÚROVEŇ
  ========================================== */

  tlacitkoDruhaUroven?.addEventListener(
    "click",
    () => {
      zobrazDruhouUroven();
    }
  );


  /* ==========================================
     DRUHÁ → PRVNÍ ÚROVEŇ
  ========================================== */

  tlacitkoPrvniUroven?.addEventListener(
    "click",
    () => {
      zobrazPrvniUroven();
    }
  );


  /* ==========================================
     OBRÁZEK
  ========================================== */

  tlacitkoVlozitObrazek?.addEventListener(
    "click",
    () => {
      window.vlozObrazekDoPoznamky?.();
    }
  );


  /* ==========================================
     ODKAZ
  ========================================== */

  tlacitkoVlozitOdkaz?.addEventListener(
    "click",
    () => {
      window.vlozOdkazDoPoznamky?.();
    }
  );


  /* ==========================================
     OTEVŘENÍ VÝBĚRU VELIKOSTI
  ========================================== */

  tlacitkoVelikostPisma?.addEventListener(
    "click",
    () => {
      ulozVyberTextu();

      window
        .getSelection()
        ?.removeAllRanges();

      zobrazVelikostiPisma();
    }
  );


  /* ==========================================
     ZPĚT Z VÝBĚRU VELIKOSTI
  ========================================== */

  tlacitkoZpetZVelikosti?.addEventListener(
    "click",
    () => {
      zobrazDruhouUroven();
    }
  );


  /* ==========================================
     NASTAVENÍ VELIKOSTI PÍSMA
  ========================================== */

  tlacitkaVelikosti.forEach(
    tlacitko => {
      tlacitko.addEventListener(
        "click",
        () => {
          const hodnota =
            tlacitko.dataset.velikost;

          if (!hodnota || !editorTextu) {
            return;
          }

          obnovVyberTextu();

          editorTextu.focus({
            preventScroll: true
          });

          document.execCommand(
            "fontSize",
            false,
            "7"
          );

          editorTextu
            .querySelectorAll(
              'font[size="7"]'
            )
            .forEach(prvek => {
              prvek.removeAttribute(
                "size"
              );

              prvek.style.fontSize =
                `${hodnota}px`;
            });

          if (tlacitkoVelikostPisma) {
            tlacitkoVelikostPisma.textContent =
              hodnota;
          }

          zobrazDruhouUroven();
        }
      );
    }
  );


  /* ==========================================
     VÝCHOZÍ STAV
  ========================================== */

  nastavToolbar(false);
})();