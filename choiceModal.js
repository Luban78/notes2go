(() => {
  let modal = null;
  let dialog = null;
  let nadpisElement = null;
  let moznostiElement = null;
  let zavritTlacitko = null;
  let predchoziFokus = null;
  
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
    zavritTlacitko.setAttribute("aria-label", "Zavřít");
    zavritTlacitko.textContent = "✕";
    
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
    
    predchoziFokus = null;
  }
  
  function otevriVyberovyModal({
    nadpis = "Vyberte možnost",
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
      tlacitko.textContent = moznost.popisek;
      
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
    nadpis = "Zadejte hodnotu",
    popisek = "Hodnota",
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
    zrusitTlacitko.textContent = "Zrušit";

    const potvrditTlacitko = document.createElement("button");
    potvrditTlacitko.type = "button";
    potvrditTlacitko.className = "choiceDialogSave";
    potvrditTlacitko.textContent = "Použít";

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
        chyba.textContent = "Zadej platné číslo.";
        chyba.hidden = false;
        input.focus();
        return;
      }

      if (min !== null && cislo < Number(min)) {
        chyba.textContent = `Minimum je ${min}.`;
        chyba.hidden = false;
        input.focus();
        return;
      }

      if (max !== null && cislo > Number(max)) {
        chyba.textContent = `Maximum je ${max}.`;
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

    modal.hidden = false;

    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  }

  function otevriNastavovaciModal({
    nadpis = "Nastavení",
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
                  "Hodnota",
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

    ulozitTlacitko.textContent = "Uložit";

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

    modal.hidden = false;
  }

  window.otevriVyberovyModal =
    otevriVyberovyModal;
  
  window.zavriVyberovyModal =
    zavriVyberovyModal;
  
  window.otevriNastavovaciModal =
    otevriNastavovaciModal;

  window.otevriCiselnyModal =
    otevriCiselnyModal;
  
})();