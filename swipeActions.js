/* ==========================================
   LUBANOTE – SWIPE AKCE
   Bezpečný swipe doprava = Hotovo.
   ========================================== */

(() => {
  const MIN_ZAMEK_OSY = 8;
  const LEVY_OKRAJ_SYSTEMU = 24;
  const PRAH_POMER = 0.38;
  const MIN_PRAH = 82;

  function jeInteraktivniPrvek(target) {
    return Boolean(
      target?.closest?.(
        "button, a, input, textarea, select, [contenteditable='true'], [role='button']"
      )
    );
  }

  function pridejPozadi(element) {
    let pozadi = element.querySelector(
      ":scope > .lubaSwipeDoneBackground"
    );

    if (pozadi) {
      return pozadi;
    }

    pozadi = document.createElement("div");
    pozadi.className = "lubaSwipeDoneBackground";

    const ikona =
      window.LubaNoteIcons?.vytvorHostitele?.(
        "hotovo",
        ["lubaSwipeDoneIcon"]
      );

    if (ikona) {
      pozadi.append(ikona);
    } else {
      const fallback = document.createElement("span");
      fallback.textContent = "✓";
      pozadi.append(fallback);
    }

    const text = document.createElement("span");
    text.textContent = "Hotovo";
    pozadi.append(text);

    element.prepend(pozadi);
    return pozadi;
  }

  function pridejHotovo(
    element,
    {
      onComplete,
      isDisabled = () => false
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
    pridejPozadi(element);

    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let posledniX = 0;
    let osa = null;
    let aktivni = false;
    let blokovatKlik = false;

    const reset = () => {
      element.style.setProperty("--luba-swipe-x", "0px");
      element.classList.remove("lubaSwipeDoneDragging");
      pointerId = null;
      osa = null;
      aktivni = false;
    };

    element.addEventListener("pointerdown", (event) => {
      if (
        event.button !== 0 ||
        event.pointerType === "mouse" ||
        isDisabled() ||
        jeInteraktivniPrvek(event.target) ||
        event.clientX <= LEVY_OKRAJ_SYSTEMU
      ) {
        return;
      }

      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      posledniX = startX;
      osa = null;
      aktivni = true;
    });

    element.addEventListener("pointermove", (event) => {
      if (!aktivni || event.pointerId !== pointerId) {
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
          osa = "vertical";
          reset();
          return;
        }

        if (dx <= 0) {
          osa = "left";
          reset();
          return;
        }

        osa = "right";
        element.classList.add("lubaSwipeDoneDragging");

        try {
          element.setPointerCapture?.(event.pointerId);
        } catch (_) {
          // Pointer capture není pro gesto nutný.
        }
      }

      if (osa !== "right") {
        return;
      }

      const sirka = Math.max(1, element.getBoundingClientRect().width);
      const posun = Math.min(Math.max(0, dx), sirka);
      element.style.setProperty(
        "--luba-swipe-x",
        `${Math.round(posun)}px`
      );

      event.preventDefault();
    }, { passive: false });

    const dokoncitGesto = async (event) => {
      if (!aktivni || event.pointerId !== pointerId) {
        return;
      }

      const dx = Math.max(0, posledniX - startX);
      const sirka = Math.max(1, element.getBoundingClientRect().width);
      const prah = Math.max(MIN_PRAH, sirka * PRAH_POMER);
      const potvrzeno = osa === "right" && dx >= prah;

      if (osa === "right" && dx > MIN_ZAMEK_OSY) {
        blokovatKlik = true;
        setTimeout(() => {
          blokovatKlik = false;
        }, 350);
      }

      if (!potvrzeno) {
        reset();
        return;
      }

      element.classList.add("lubaSwipeDoneCommitted");
      element.style.setProperty(
        "--luba-swipe-x",
        `${Math.round(sirka)}px`
      );

      pointerId = null;
      osa = null;
      aktivni = false;

      try {
        await onComplete();
      } catch (error) {
        console.error("Swipe Hotovo selhalo:", error);
        element.classList.remove("lubaSwipeDoneCommitted");
        reset();
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

        blokovatKlik = false;
        event.preventDefault();
        event.stopImmediatePropagation();
      },
      true
    );
  }

  window.LubaNoteSwipe = {
    pridejHotovo
  };
})();
