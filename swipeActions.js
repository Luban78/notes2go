/* ==========================================
   LUBANOTE – SWIPE AKCE
   Doprava = Hotovo / Vrátit.
   Doleva = Smazat (přes existující LubaNote potvrzení).
   ========================================== */

(() => {
  const MIN_ZAMEK_OSY = 8;
  const OKRAJ_SYSTEMOVEHO_GESTA = 24;
  const PRAH_POMER = 0.38;
  const MIN_PRAH = 82;
  const MAX_DOBA_BLOKACE_KLIKU = 180;
  const MIN_DOBA_PO_AKCI_BEZ_DALSIHO_SWIPE = 450;

  function jeInteraktivniPrvek(target) {
    return Boolean(
      target?.closest?.(
        "button, a, input, textarea, select, [contenteditable='true'], [role='button']"
      )
    );
  }

  function vytvorPozadi(
    element,
    {
      trida,
      ikona,
      text,
      zarovnani = "left"
    }
  ) {
    let pozadi = element.querySelector(
      `:scope > .${trida}`
    );

    if (pozadi) {
      return pozadi;
    }

    pozadi = document.createElement("div");
    pozadi.className = `${trida} lubaSwipeActionBackground`;
    pozadi.dataset.zarovnani = zarovnani;

    const ikonaHostitel = document.createElement("span");
    ikonaHostitel.className = "lubaSwipeActionIcon";

    if (window.LubaNoteIcons?.vlozIkonu) {
      window.LubaNoteIcons.vlozIkonu(
        ikonaHostitel,
        ikona
      );
    } else {
      ikonaHostitel.textContent =
        ikona === "smazat" ? "🗑" : "✓";
    }

    const textHostitel = document.createElement("span");
    textHostitel.className = "lubaSwipeActionText";
    textHostitel.textContent = text;

    pozadi.append(
      ikonaHostitel,
      textHostitel
    );

    element.prepend(pozadi);
    return pozadi;
  }

  function nastavPravePozadi(
    pozadi,
    jeHotovo,
    muzeVratit
  ) {
    if (!pozadi) {
      return;
    }

    const ikonaHostitel = pozadi.querySelector(
      ".lubaSwipeActionIcon"
    );
    const textHostitel = pozadi.querySelector(
      ".lubaSwipeActionText"
    );

    const vratit = jeHotovo && muzeVratit;

    if (window.LubaNoteIcons?.vlozIkonu && ikonaHostitel) {
      ikonaHostitel.replaceChildren();
      window.LubaNoteIcons.vlozIkonu(
        ikonaHostitel,
        vratit ? "zpet" : "hotovo"
      );
    } else if (ikonaHostitel) {
      ikonaHostitel.textContent = vratit ? "↩" : "✓";
    }

    if (textHostitel) {
      textHostitel.textContent = vratit
        ? "Vrátit"
        : "Hotovo";
    }
  }

  function pridejHotovo(
    element,
    {
      onComplete,
      onRestore = null,
      onDelete = null,
      isCompleted = () => false,
      isDisabled = () => false,
      isDeleteDisabled = () => false
    } = {}
  ) {
    if (
      !element ||
      element.dataset.lubaSwipeDone === "true" ||
      typeof onComplete !== "function"
    ) {
      return;
    }

    element.dataset.lubaSwipeDone = "true";
    element.classList.add("lubaSwipeDoneTarget");

    const pravePozadi = vytvorPozadi(
      element,
      {
        trida: "lubaSwipeDoneBackground",
        ikona: "hotovo",
        text: "Hotovo",
        zarovnani: "left"
      }
    );

    const levePozadi =
      typeof onDelete === "function"
        ? vytvorPozadi(
            element,
            {
              trida: "lubaSwipeDeleteBackground",
              ikona: "smazat",
              text: "Smazat",
              zarovnani: "right"
            }
          )
        : null;

    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let posledniX = 0;
    let osa = null;
    let aktivni = false;
    let blokovatKlik = false;
    let casovacBlokaceKliku = null;
    let gestoUzamcenoDo = 0;

    const ukonciBlokaciKliku = () => {
      if (casovacBlokaceKliku) {
        clearTimeout(casovacBlokaceKliku);
        casovacBlokaceKliku = null;
      }

      blokovatKlik = false;
    };

    const reset = () => {
      element.style.setProperty("--luba-swipe-x", "0px");
      element.classList.remove(
        "lubaSwipeDragging",
        "lubaSwipeDoneDragging",
        "lubaSwipeDeleteDragging",
        "lubaSwipeDoneCommitted",
        "lubaSwipeDeleteCommitted"
      );
      pointerId = null;
      osa = null;
      aktivni = false;
    };

    element.addEventListener("luba:card-drag-takeover", () => {
      const zachycenyPointer = pointerId;

      ukonciBlokaciKliku();

      try {
        if (
          zachycenyPointer !== null &&
          element.hasPointerCapture?.(zachycenyPointer)
        ) {
          element.releasePointerCapture?.(zachycenyPointer);
        }
      } catch (_) {
        // Drag si pointer převezme hned poté.
      }

      reset();
    });

    const oznacKlikPoGestu = () => {
      blokovatKlik = true;

      if (casovacBlokaceKliku) {
        clearTimeout(casovacBlokaceKliku);
      }

      casovacBlokaceKliku = setTimeout(() => {
        blokovatKlik = false;
        casovacBlokaceKliku = null;
      }, MAX_DOBA_BLOKACE_KLIKU);
    };

    element.addEventListener("pointerdown", (event) => {
      /*
       * Pokud po předchozím swipe nevznikl syntetický click,
       * nový skutečný pointerdown musí starou blokaci okamžitě zrušit.
       * Tím další tap už nikdy „nezmizí“.
       */
      ukonciBlokaciKliku();

      if (
        performance.now() < gestoUzamcenoDo ||
        event.button !== 0 ||
        event.pointerType === "mouse" ||
        document.body.classList.contains("lubaCardDragMode") ||
        isDisabled() ||
        jeInteraktivniPrvek(event.target) ||
        event.clientX <= OKRAJ_SYSTEMOVEHO_GESTA ||
        event.clientX >=
          window.innerWidth - OKRAJ_SYSTEMOVEHO_GESTA
      ) {
        return;
      }

      const jeHotovo = isCompleted() === true;
      const muzeVratit =
        jeHotovo && typeof onRestore === "function";

      nastavPravePozadi(
        pravePozadi,
        jeHotovo,
        muzeVratit
      );

      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      posledniX = startX;
      osa = null;
      aktivni = true;
    });

    element.addEventListener(
      "pointermove",
      (event) => {
        if (!aktivni || event.pointerId !== pointerId) {
          return;
        }

        if (
          document.body.classList.contains("lubaCardDragMode") ||
          element.classList.contains("lubaCardDragActive") ||
          isDisabled()
        ) {
          reset();
          return;
        }

        const dx = event.clientX - startX;
        const dy = event.clientY - startY;
        posledniX = event.clientX;

        if (!osa) {
          if (
            Math.abs(dx) < MIN_ZAMEK_OSY &&
            Math.abs(dy) < MIN_ZAMEK_OSY
          ) {
            return;
          }

          if (Math.abs(dy) >= Math.abs(dx)) {
            reset();
            return;
          }

          if (dx > 0) {
            const jeHotovo = isCompleted() === true;

            if (
              jeHotovo &&
              typeof onRestore !== "function"
            ) {
              reset();
              return;
            }

            osa = "right";
            element.classList.add(
              "lubaSwipeDragging",
              "lubaSwipeDoneDragging"
            );
          } else {
            if (
              typeof onDelete !== "function" ||
              isDeleteDisabled()
            ) {
              reset();
              return;
            }

            osa = "left";
            element.classList.add(
              "lubaSwipeDragging",
              "lubaSwipeDeleteDragging"
            );
          }

          try {
            element.setPointerCapture?.(event.pointerId);
          } catch (_) {
            // Pointer capture není pro gesto nutný.
          }
        }

        if (osa !== "right" && osa !== "left") {
          return;
        }

        const sirka = Math.max(
          1,
          element.getBoundingClientRect().width
        );
        const posun = Math.max(
          -sirka,
          Math.min(dx, sirka)
        );

        element.style.setProperty(
          "--luba-swipe-x",
          `${Math.round(posun)}px`
        );

        event.preventDefault();
      },
      { passive: false }
    );

    const dokoncitGesto = async (event) => {
      if (!aktivni || event.pointerId !== pointerId) {
        return;
      }

      if (
        document.body.classList.contains("lubaCardDragMode") ||
        element.classList.contains("lubaCardDragActive") ||
        isDisabled()
      ) {
        reset();
        return;
      }

      const dx = posledniX - startX;
      const sirka = Math.max(
        1,
        element.getBoundingClientRect().width
      );
      const prah = Math.max(
        MIN_PRAH,
        sirka * PRAH_POMER
      );
      const horizontalniPohyb =
        Math.abs(dx) > MIN_ZAMEK_OSY;
      const potvrzeno =
        (osa === "right" || osa === "left") &&
        Math.abs(dx) >= prah;

      if (horizontalniPohyb) {
        oznacKlikPoGestu();
      }

      if (!potvrzeno) {
        reset();
        return;
      }

      const smer = osa;
      gestoUzamcenoDo =
        performance.now() +
        MIN_DOBA_PO_AKCI_BEZ_DALSIHO_SWIPE;

      element.classList.remove(
        "lubaSwipeDoneDragging",
        "lubaSwipeDeleteDragging"
      );
      element.classList.add(
        smer === "right"
          ? "lubaSwipeDoneCommitted"
          : "lubaSwipeDeleteCommitted"
      );
      element.style.setProperty(
        "--luba-swipe-x",
        `${Math.round(
          smer === "right" ? sirka : -sirka
        )}px`
      );

      pointerId = null;
      osa = null;
      aktivni = false;

      try {
        if (smer === "right") {
          if (
            isCompleted() === true &&
            typeof onRestore === "function"
          ) {
            await onRestore();
          } else {
            await onComplete();
          }
        } else if (typeof onDelete === "function") {
          await onDelete();
        }
      } catch (error) {
        console.error("Swipe akce selhala:", error);
      } finally {
        if (element.isConnected) {
          setTimeout(reset, 120);
        }
      }
    };

    element.addEventListener("pointerup", dokoncitGesto);
    element.addEventListener("pointercancel", (event) => {
      if (event.pointerId === pointerId) {
        reset();
      }
    });

    element.addEventListener(
      "click",
      (event) => {
        if (!blokovatKlik) {
          return;
        }

        ukonciBlokaciKliku();
        event.preventDefault();
        event.stopImmediatePropagation();
      },
      true
    );
  }

  window.LubaNoteSwipe = {
    pridejHotovo,
    pridejAkce: pridejHotovo
  };
})();
