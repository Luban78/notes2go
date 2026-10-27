(() => {
  const choiceT = (klic, zaloha, hodnoty = {}) =>
    window.LubaNoteI18n?.t?.(klic, zaloha, hodnoty) || zaloha;

  let modal = null;
  let dialog = null;
  let nadpisElement = null;
  let moznostiElement = null;
  let zavritTlacitko = null;
  let predchoziFokus = null;

  /* FIX 530 – jednotný modalový kontrakt: modal se otevře bez klávesnice.
     Uživatel ji vyvolá až tapem do konkrétního inputu/textarea. */
  function pripravKlavesniciProModal() {
    try {
      window.LubaNoteKeyboard?.skryjProModal?.();
    } catch (_error) {}
  }
  
  function vytvorModalPokudChybi() {
    if (modal) {
      return;
    }
    
    modal = document.createElement("div");
    modal.className = "choiceModal";
    modal.hidden = true;
    
    dialog = document.createElement("div");
    dialog.className = "choiceDialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    
    const hlavicka = document.createElement("div");
    hlavicka.className = "choiceDialogHeader";
    
    nadpisElement = document.createElement("h3");
    nadpisElement.className = "choiceDialogTitle";
    
    zavritTlacitko = document.createElement("button");
    zavritTlacitko.type = "button";
    zavritTlacitko.className = "choiceDialogClose";
    zavritTlacitko.setAttribute("aria-label", choiceT("actions.close", "Zavřít"));

    if (window.LubaNoteIcons?.nastavJenIkonu) {
      window.LubaNoteIcons.nastavJenIkonu(
        zavritTlacitko,
        "zavrit",
        ["choiceCloseSvgIcon"]
      );
    }
    
    moznostiElement = document.createElement("div");
    moznostiElement.className = "choiceDialogOptions";
    
    hlavicka.append(
      nadpisElement,
      zavritTlacitko
    );
    
    dialog.append(
      hlavicka,
      moznostiElement
    );
    
    modal.append(dialog);
    document.body.append(modal);
    
    zavritTlacitko.addEventListener(
      "click",
      zavriVyberovyModal
    );
    
    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        zavriVyberovyModal();
      }
    });
    
    document.addEventListener("keydown", (event) => {
      if (
        event.key === "Escape" &&
        modal &&
        !modal.hidden
      ) {
        zavriVyberovyModal();
      }
    });
  }
  
  function zavriVyberovyModal() {
    if (!modal) {
      return;
    }
    
    modal.hidden = true;
    moznostiElement.replaceChildren();
    
    if (
      predchoziFokus &&
      typeof predchoziFokus.focus === "function"
    ) {
      predchoziFokus.focus();
    }
    
    /* FIX 533 – stejný close kontrakt jako globální modalový hlídač.
       Až po návratu focusu, aby obnovené textové pole neotevřelo klávesnici. */
    try {
      window.LubaNoteKeyboard?.skryjPoZavreniModalu?.();
    } catch (_error) {}

    predchoziFokus = null;
  }
  
  function otevriVyberovyModal({
    nadpis = choiceT("choice.selectOption", "Vyberte možnost"),
    moznosti = [],
    vybranaHodnota = null,
    poVyberu = null,
    zavritPoVyberu = true
  } = {}) {
    vytvorModalPokudChybi();
    
    predchoziFokus = document.activeElement;
    nadpisElement.textContent = nadpis;
    moznostiElement.replaceChildren();
    
    moznosti.forEach((moznost) => {
      const tlacitko = document.createElement("button");
      tlacitko.type = "button";
      tlacitko.className = "choiceDialogOption";

      if (
        moznost.ikona &&
        window.LubaNoteIcons?.nastavObsahSIkonou
      ) {
        window.LubaNoteIcons.nastavObsahSIkonou(
          tlacitko,
          moznost.ikona,
          moznost.popisek || "",
          ["choiceOptionSvgIcon"]
        );
      } else {
        tlacitko.textContent = moznost.popisek;
      }
      
      if (moznost.hodnota === vybranaHodnota) {
        tlacitko.classList.add("active");
        tlacitko.setAttribute("aria-pressed", "true");
      } else {
        tlacitko.setAttribute("aria-pressed", "false");
      }
      
      tlacitko.addEventListener("click", async () => {
        moznostiElement
          .querySelectorAll(".choiceDialogOption")
          .forEach((jineTlacitko) => {
            jineTlacitko.classList.remove("active");
            jineTlacitko.setAttribute(
              "aria-pressed",
              "false"
            );
          });
        
        tlacitko.classList.add("active");
        tlacitko.setAttribute("aria-pressed", "true");
        tlacitko.disabled = true;
        
        try {
          if (typeof poVyberu === "function") {
            await poVyberu(
              moznost.hodnota,
              moznost
            );
          }
          
          if (zavritPoVyberu) {
            if (zavritPoVyberu) {
              zavriVyberovyModal();
            }
          }
        } catch (error) {
          console.error(
            "Výběrový modal: akci se nepodařilo dokončit.",
            error
          );
          tlacitko.disabled = false;
        }
      });
      
      moznostiElement.append(tlacitko);
    });
    
    pripravKlavesniciProModal();
    modal.hidden = false;
    
    requestAnimationFrame(() => {
      const aktivniTlacitko =
        moznostiElement.querySelector(
          ".choiceDialogOption.active"
        );
      
      const prvniTlacitko =
        moznostiElement.querySelector(
          ".choiceDialogOption"
        );
      
      (aktivniTlacitko || prvniTlacitko)?.focus();
    });
  }
  
  window.otevriVyberovyModal =
    otevriVyberovyModal;
  
  window.zavriVyberovyModal =
    zavriVyberovyModal;
  
  
  
  
  
  function otevriCiselnyModal({
    nadpis = choiceT("choice.enterValue", "Zadejte hodnotu"),
    popisek = choiceT("choice.value", "Hodnota"),
    hodnota = "",
    min = null,
    max = null,
    krok = "1",
    poPotvrzeni = null,
    poZruseni = null
  } = {}) {
    vytvorModalPokudChybi();

    predchoziFokus = document.activeElement;
    nadpisElement.textContent = nadpis;
    moznostiElement.replaceChildren();

    const pole = document.createElement("div");
    pole.className = "choiceDialogField";

    const label = document.createElement("label");
    label.className = "choiceDialogFieldLabel";
    label.textContent = popisek;

    const input = document.createElement("input");
    input.className = "choiceDialogInput";
    input.type = "number";
    input.inputMode = "decimal";
    input.value = String(hodnota ?? "");
    input.step = String(krok ?? "1");

    if (min !== null && min !== undefined) {
      input.min = String(min);
    }

    if (max !== null && max !== undefined) {
      input.max = String(max);
    }

    const chyba = document.createElement("div");
    chyba.className = "choiceDialogError";
    chyba.hidden = true;

    label.append(input);
    pole.append(label, chyba);

    const akce = document.createElement("div");
    akce.className = "choiceDialogActions";

    const zrusitTlacitko = document.createElement("button");
    zrusitTlacitko.type = "button";
    zrusitTlacitko.className = "choiceDialogSecondary";
    zrusitTlacitko.textContent = choiceT("actions.cancel", "Zrušit");

    const potvrditTlacitko = document.createElement("button");
    potvrditTlacitko.type = "button";
    potvrditTlacitko.className = "choiceDialogSave";
    potvrditTlacitko.textContent = choiceT("actions.apply", "Použít");

    akce.append(
      zrusitTlacitko,
      potvrditTlacitko
    );

    moznostiElement.append(
      pole,
      akce
    );

    const vratitSe = () => {
      if (typeof poZruseni === "function") {
        poZruseni();
        return;
      }

      zavriVyberovyModal();
    };

    const potvrdit = async () => {
      const cislo = Number(
        String(input.value).trim()
      );

      if (!Number.isFinite(cislo)) {
        chyba.textContent = choiceT("choice.validNumber", "Zadej platné číslo.");
        chyba.hidden = false;
        input.focus();
        return;
      }

      if (min !== null && cislo < Number(min)) {
        chyba.textContent = choiceT("choice.minimum", `Minimum je ${min}.`, { value: min });
        chyba.hidden = false;
        input.focus();
        return;
      }

      if (max !== null && cislo > Number(max)) {
        chyba.textContent = choiceT("choice.maximum", `Maximum je ${max}.`, { value: max });
        chyba.hidden = false;
        input.focus();
        return;
      }

      chyba.hidden = true;
      potvrditTlacitko.disabled = true;

      try {
        if (typeof poPotvrzeni === "function") {
          await poPotvrzeni(cislo);
        } else {
          zavriVyberovyModal();
        }
      } catch (error) {
        console.error(
          "Číselný modal: potvrzení se nepodařilo.",
          error
        );
        potvrditTlacitko.disabled = false;
      }
    };

    zrusitTlacitko.addEventListener(
      "click",
      vratitSe
    );

    potvrditTlacitko.addEventListener(
      "click",
      potvrdit
    );

    input.addEventListener("input", () => {
      chyba.hidden = true;
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void potvrdit();
      }
    });

    pripravKlavesniciProModal();
    modal.hidden = false;
    /* FIX 530 – žádný autofocus. Tap do pole je jediný okamžik, kdy se má
       po otevření modalu znovu objevit systémová klávesnice. */
  }

  /* 683BU – čtvrtá předvolba používá JIŽ EXISTUJÍCÍ LubaNote ciferník.
   * Žádný input[type=time]: ten v APK spouštěl systémové Android hodiny.
   * Editorový čas, repeat a plánování se nemění. */
  function otevriCasovyModal({ hodnota, poPotvrzeni, poZruseni } = {}) {
    vytvorModalPokudChybi();
    const otevritCifernik = window.otevriVlastniVyberCasu;
    const picker = document.getElementById("timePickerModal");
    const zavrit = document.getElementById("closeTimePickerButton");
    const zrusit = document.getElementById("timePickerCancelButton");

    // Bez připojeného editorového ciferníku nic neotevírej a zachovej nabídku.
    if (typeof otevritCifernik !== "function" || !picker || !zavrit || !zrusit) {
      console.error("LubaNote: vlastní ciferník času není dostupný.");
      if (typeof poZruseni === "function") poZruseni();
      return;
    }

    const vychoziCas = /^([01]\d|2[0-3]):[0-5]\d$/.test(hodnota || "") ? hodnota : "08:00";
    // Editorový picker používá objekt s .value; není potřeba skutečný input.
    const docasnyCas = { value: vychoziCas };
    let hotovo = false;

    const odebratPosluchace = () => {
      zavrit.removeEventListener("click", priZruseni);
      zrusit.removeEventListener("click", priZruseni);
    };
    const priZruseni = () => {
      if (hotovo) return;
      hotovo = true;
      odebratPosluchace();
      // Standardní handler ciferníku okno schovává.
      if (typeof poZruseni === "function") poZruseni();
      else modal.hidden = false;
    };
    const priVyberu = (cas) => {
      if (hotovo) return;
      hotovo = true;
      odebratPosluchace();
      if (typeof poPotvrzeni === "function") {
        poPotvrzeni(cas);
      } else {
        modal.hidden = false;
      }
    };

    // Choice modal je nad ciferníkem (z-index 10000 > 7200).
    // Dočasně jej schováme, po výběru či zrušení obnovíme pracovní hodnoty.
    modal.hidden = true;
    zavrit.addEventListener("click", priZruseni);
    zrusit.addEventListener("click", priZruseni);
    try {
      otevritCifernik({
        input: docasnyCas,
        povolOpakovani: false,
        poVyberu: priVyberu
      });
    } catch (error) {
      hotovo = true;
      odebratPosluchace();
      modal.hidden = false;
      console.error("LubaNote: otevření ciferníku se nezdařilo.", error);
      if (typeof poZruseni === "function") poZruseni();
    }
  }

  function otevriNastavovaciModal({
    nadpis = choiceT("settings.title", "Nastavení"),
    polozky = [],
    poUlozeni = null
  } = {}) {
    vytvorModalPokudChybi();

    predchoziFokus = document.activeElement;
    nadpisElement.textContent = nadpis;
    moznostiElement.replaceChildren();

    const pracovniHodnoty = {};

    polozky.forEach((polozka) => {
      pracovniHodnoty[polozka.klic] =
        polozka.hodnota;

      const radek = document.createElement("button");
      radek.type = "button";
      radek.className =
        "choiceDialogOption choiceDialogSettingRow";

      const popisek = document.createElement("span");
      popisek.className = "choiceDialogSettingLabel";
      popisek.textContent = polozka.popisek;

      const hodnota = document.createElement("span");
      hodnota.className = "choiceDialogSettingValue";
      hodnota.textContent = polozka.zobrazeni;

      radek.append(
        popisek,
        hodnota
      );

      radek.addEventListener("click", () => {
        otevriVyberovyModal({
          zavritPoVyberu: false,
          nadpis: polozka.popisek,
          moznosti: polozka.moznosti,
          vybranaHodnota: pracovniHodnoty[polozka.klic],

          poVyberu: (novaHodnota, moznost) => {
            const vlastniVstup =
              polozka.vlastniVstup;

            const spoustecVlastnihoVstupu =
              vlastniVstup?.spoustecHodnota ||
              "vlastni";

            const casovyVstup = polozka.casovyVstup;
            if (casovyVstup && novaHodnota === (casovyVstup.spoustecHodnota || "upravit_cas")) {
              otevriCasovyModal({
                nadpis: casovyVstup.nadpis || polozka.popisek,
                popisek: casovyVstup.popisek,
                hodnota: (typeof casovyVstup.ziskejCas === "function"
                  ? casovyVstup.ziskejCas(pracovniHodnoty[polozka.klic])
                  : String(pracovniHodnoty[polozka.klic] || "").slice(-5)) || casovyVstup.vychoziHodnota,
                poPotvrzeni: (cas) => {
                  const nova = casovyVstup.vytvorHodnotu(cas);
                  pracovniHodnoty[polozka.klic] = nova;
                  polozka.hodnota = nova;
                  polozka.zobrazeni = casovyVstup.vytvorZobrazeni(nova);
                  otevriNastavovaciModal({ nadpis, polozky, poUlozeni });
                },
                poZruseni: () => otevriNastavovaciModal({ nadpis, polozky, poUlozeni })
              });
              return;
            }

            if (
              vlastniVstup &&
              novaHodnota === spoustecVlastnihoVstupu
            ) {
              const soucasneCislo = Number(
                pracovniHodnoty[polozka.klic]
              );

              const vychoziHodnota =
                Number.isFinite(soucasneCislo) ?
                String(soucasneCislo) :
                String(
                  vlastniVstup.vychoziHodnota ??
                  "50"
                );

              otevriCiselnyModal({
                nadpis:
                  vlastniVstup.nadpis ||
                  polozka.popisek,
                popisek:
                  vlastniVstup.popisek ||
                  choiceT("choice.value", "Hodnota"),
                hodnota: vychoziHodnota,
                min: vlastniVstup.min,
                max: vlastniVstup.max,
                krok: vlastniVstup.krok || "1",

                poPotvrzeni: (cislo) => {
                  const vyslednaHodnota =
                    String(cislo);

                  pracovniHodnoty[polozka.klic] =
                    vyslednaHodnota;

                  polozka.hodnota =
                    vyslednaHodnota;

                  polozka.zobrazeni =
                    typeof vlastniVstup.vytvorZobrazeni ===
                    "function" ?
                    vlastniVstup.vytvorZobrazeni(
                      vyslednaHodnota
                    ) :
                    vyslednaHodnota;

                  otevriNastavovaciModal({
                    nadpis,
                    polozky,
                    poUlozeni
                  });
                },

                poZruseni: () => {
                  otevriNastavovaciModal({
                    nadpis,
                    polozky,
                    poUlozeni
                  });
                }
              });

              return;
            }

            pracovniHodnoty[polozka.klic] =
              novaHodnota;

            polozka.hodnota =
              novaHodnota;

            polozka.zobrazeni =
              moznost.popisek;

            otevriNastavovaciModal({
              nadpis,
              polozky,
              poUlozeni
            });
          }
        });
      });

      moznostiElement.append(radek);
    });

    const ulozitTlacitko =
      document.createElement("button");

    ulozitTlacitko.type = "button";
    ulozitTlacitko.className =
      "choiceDialogSave";

    ulozitTlacitko.textContent = choiceT("actions.save", "Uložit");

    ulozitTlacitko.addEventListener(
      "click",
      async () => {
        try {
          if (typeof poUlozeni === "function") {
            await poUlozeni(pracovniHodnoty);
          }

          zavriVyberovyModal();
        } catch (error) {
          console.error(
            "Nastavovací modal: uložení se nepodařilo.",
            error
          );
        }
      }
    );

    moznostiElement.append(
      ulozitTlacitko
    );

    pripravKlavesniciProModal();
    modal.hidden = false;
  }

  /* 695Q: Jednoduche potvrzeni pouziva existujici choiceModal / choiceDialog.
   * Nove modalove DOM, styly, globalni klavesnice ani Android dialog nevznikaji. */
  function otevriPotvrzovaciModalLubaNote({
    nadpis = "Upozornění",
    text = "",
    popisekZrusit = "Později",
    popisekPotvrdit = "Otevřít nastavení",
    poZruseni = null,
    poPotvrzeni = null
  } = {}) {
    vytvorModalPokudChybi();
    // Nezamenovat jiny prave otevreny modal (datum, nastaveni, volba).
    if (!modal.hidden) return false;
    predchoziFokus = document.activeElement;
    nadpisElement.textContent = nadpis;
    moznostiElement.replaceChildren();

    const zprava = document.createElement("p");
    zprava.className = "choiceDialogFieldLabel";
    zprava.style.whiteSpace = "pre-line";
    zprava.textContent = text;

    const akce = document.createElement("div");
    akce.className = "choiceDialogActions";
    const pozdeji = document.createElement("button");
    pozdeji.type = "button";
    pozdeji.className = "choiceDialogSecondary";
    pozdeji.textContent = popisekZrusit;
    const potvrdit = document.createElement("button");
    potvrdit.type = "button";
    potvrdit.className = "choiceDialogSave";
    potvrdit.textContent = popisekPotvrdit;

    pozdeji.addEventListener("click", () => {
      try { poZruseni?.(); } finally { zavriVyberovyModal(); }
    });
    potvrdit.addEventListener("click", async () => {
      potvrdit.disabled = true;
      try {
        if (typeof poPotvrzeni === "function") await poPotvrzeni();
        zavriVyberovyModal();
      } catch (error) {
        console.warn("LubaNote: otevření nastavení přesných alarmů selhalo", error);
        potvrdit.disabled = false;
      }
    });
    akce.append(pozdeji, potvrdit);
    moznostiElement.append(zprava, akce);
    pripravKlavesniciProModal();
    modal.hidden = false;
    // Zadaná funkce neotevírá klávesnici.
    return true;
  }

  window.otevriPotvrzovaciModalLubaNote = otevriPotvrzovaciModalLubaNote;

  window.otevriVyberovyModal =
    otevriVyberovyModal;
  
  window.zavriVyberovyModal =
    zavriVyberovyModal;
  
  window.otevriNastavovaciModal =
    otevriNastavovaciModal;

  window.otevriCiselnyModal =
    otevriCiselnyModal;
  
})();