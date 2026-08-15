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
    poVyberu = null
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

          zavriVyberovyModal();
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
})();
