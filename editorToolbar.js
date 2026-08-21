(() => {
  /* ==========================================
     LUBANOTE – MOBILNÍ EDITOR TOOLBAR
     Jeden vodorovně posuvný řádek + plovoucí panely.
  ========================================== */

  const tlacitkoToolbar =
    document.getElementById("editorToolbarToggle");

  const rychlyToolbar =
    document.getElementById("editorQuickToolbar");

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






  let ulozenyVyberTextu = null;
  let otevrenyPanel = null;
  let aktivniSpoustecPanelu = null;

  if (
    !tlacitkoToolbar ||
    !rychlyToolbar ||
    !horniLista ||
    !datumCas ||
    !editorTextu
  ) {
    return;
  }
  
  
function zrusVlastniVyberTextu() {
  window.CSS?.highlights?.delete(
    NAZEV_VLASTNIHO_VYBERU
  );

  ulozenyVyberTextu = null;
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


  function ulozVyberTextu() {
    const vyber = window.getSelection();

    if (
      !vyber ||
      vyber.rangeCount === 0 ||
      !jeUzelVEditoru(vyber.anchorNode)
    ) {
      return false;
    }

    ulozenyVyberTextu =
      vyber.getRangeAt(0).cloneRange();

    return true;
  }


  function obnovVyberTextu() {
    if (!ulozenyVyberTextu) {
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
    obnovVyberTextu();

    editorTextu.focus({
      preventScroll: true
    });
  }


  /* ==========================================
     HLAVNÍ TOOLBAR
  ========================================== */

  function zavriVsechnyPanely() {
    [
      panelVelikost,
      panelStyl,
      panelZarovnani
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


  function nastavToolbar(otevreny) {
    rychlyToolbar.hidden = !otevreny;
    datumCas.hidden = otevreny;

    if (tlacitkoPripominky) {
      tlacitkoPripominky.hidden = otevreny;
    }

    tlacitkoToolbar.classList.toggle(
      "active",
      otevreny
    );

    tlacitkoToolbar.setAttribute(
      "aria-expanded",
      String(otevreny)
    );

    tlacitkoToolbar.setAttribute(
      "aria-pressed",
      String(otevreny)
    );

    tlacitkoToolbar.setAttribute(
      "aria-label",
      otevreny
        ? "Zavřít editační nástroje"
        : "Otevřít editační nástroje"
    );

    if (!otevreny) {
      zavriVsechnyPanely();
      rychlyToolbar.scrollLeft = 0;
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

    ulozVyberTextu();
    aktualizujStavFormatovani();
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
      
      const vyber =
  window.getSelection();

let prvek =
  vyber?.anchorNode;

if (
  prvek?.nodeType === Node.TEXT_NODE
) {
  prvek =
    prvek.parentElement;
}

const jeNadpis =
  prvek instanceof Element &&
  !!prvek.closest(
    ".editorNadpis.h1, .editorNadpis.h2, .editorNadpis.h3"
  );

nastavStavTlacitka(
  tlacitkoNadpis,
  jeNadpis
);
    } catch (_chyba) {
      // Některé WebView queryCommandState nepodporují spolehlivě.
    }
    
    
    
    


    const velikost =
      zjistiVelikostPodKurzorem();

    if (velikost) {
      tlacitkoVelikostPisma.textContent = velikost;
      oznacAktivniVelikost(velikost);
    }
  }


  /* ==========================================
     UDÁLOSTI – TOOLBAR
  ========================================== */

  tlacitkoToolbar.addEventListener(
    "click",
    () => {
      nastavToolbar(
        rychlyToolbar.hidden
      );
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
          nastavToolbar(false);
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


  nastavToolbar(false);
  
  
  panelBarvaTextu
  ?.querySelectorAll("[data-text-color]")
  .forEach(tlacitko => {
    tlacitko.addEventListener(
      "click",
      () => {
        const barva =
          tlacitko.dataset.textColor;
        
        obnovVyberTextu();
        
        if (barva === "default") {
          document.execCommand(
            "foreColor",
            false,
            "inherit"
          );
        } else {
          document.execCommand(
            "foreColor",
            false,
            barva
          );
        }
        
        zavriVsechnyPanely();
      }
    );
  });
  
  
  
  
})();



function zjistiNadpisPodKurzorem() {
  const vyber =
    window.getSelection();

  if (
    !vyber ||
    vyber.rangeCount === 0
  ) {
    return null;
  }

  let prvek =
    vyber
      .getRangeAt(0)
      .startContainer;

  if (
    prvek?.nodeType === Node.TEXT_NODE
  ) {
    prvek =
      prvek.parentElement;
  }

  if (!(prvek instanceof Element)) {
    return null;
  }

  return prvek.closest(
    ".editorNadpis"
  );
}
