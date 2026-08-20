(() => {
  const tlacitkoToolbar =
    document.getElementById("editorToolbarToggle");
  
  const rychlyToolbar =
    document.getElementById("editorQuickToolbar");
  
  const datumCas =
    document.querySelector(".dateTimeInputs");
  
  const tlacitkoPripominky =
    document.getElementById("reminderButton");
  
  const tlacitkoVlozitObrazek =
    document.getElementById("tlacitkoVlozitObrazek");
  
  const tlacitkoVlozitOdkaz =
    document.getElementById("tlacitkoVlozitOdkaz");
  
  const tlacitkoZpet =
    document.getElementById("tlacitkoZpet");
  
  const tlacitkoZnovu =
    document.getElementById("tlacitkoZnovu");
  
  const editorTextu =
    document.getElementById("modalRichText");
  
  const prvniUrovenToolbaru =
    document.getElementById("editorToolbarPrvniUroven");
  
  const druhaUrovenToolbaru =
    document.getElementById("editorToolbarDruhaUroven");
  
  const tlacitkoDruhaUroven =
    document.getElementById("tlacitkoDruhaUroven");
  
  const tlacitkoPrvniUroven =
    document.getElementById("tlacitkoPrvniUroven");
  
  
  if (!tlacitkoToolbar || !rychlyToolbar || !datumCas) {
    return;
  }
  
  
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
      otevreny ?
      "Zavřít editační nástroje" :
      "Otevřít editační nástroje"
    );
    
    tlacitkoToolbar.setAttribute(
      "aria-expanded",
      String(otevreny)
    );
  }
  
  
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
  
  
  tlacitkoToolbar.addEventListener("click", () => {
    nastavToolbar(rychlyToolbar.hidden);
  });
  
  
  tlacitkoVlozitObrazek?.addEventListener(
    "click",
    () => {
      window.vlozObrazekDoPoznamky?.();
    }
  );
  
  
  tlacitkoVlozitOdkaz?.addEventListener(
    "click",
    () => {
      window.vlozOdkazDoPoznamky?.();
    }
  );
  
  
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
  
  
  tlacitkoDruhaUroven?.addEventListener(
    "click",
    () => {
      prvniUrovenToolbaru.hidden = true;
      druhaUrovenToolbaru.hidden = false;
    }
  );
  
  
  tlacitkoPrvniUroven?.addEventListener(
    "click",
    () => {
      druhaUrovenToolbaru.hidden = true;
      prvniUrovenToolbaru.hidden = false;
    }
  );
  
  
  nastavToolbar(false);
})();