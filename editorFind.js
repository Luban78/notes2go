(() => {
  "use strict";

  const NAZEV_HIGHLIGHT_VSE = "lubanote-find-all";
  const NAZEV_HIGHLIGHT_AKTUALNI = "lubanote-find-current";

  const taskModal = document.getElementById("taskModal");
  const tlacitko = document.getElementById("editorFindButton");
  const panel = document.getElementById("editorFindBar");
  const vstup = document.getElementById("editorFindInput");
  const pocitadlo = document.getElementById("editorFindCount");
  const predchozi = document.getElementById("editorFindPrev");
  const dalsi = document.getElementById("editorFindNext");
  const zavrit = document.getElementById("editorFindClose");

  if (!taskModal || !tlacitko || !panel || !vstup || !pocitadlo || !predchozi || !dalsi || !zavrit) {
    return;
  }

  let vysledky = [];
  let aktualniIndex = -1;
  let observerEditoru = null;
  let debounceTimer = 0;

  function editor() {
    return taskModal.querySelector(".ln-v2-editor[data-ln-v2-editor]");
  }

  function jeOtevrene() {
    return !panel.hidden;
  }

  function podporujeHighlight() {
    return Boolean(window.CSS?.highlights && typeof window.Highlight === "function");
  }

  function smazHighlighty() {
    if (!podporujeHighlight()) return;
    CSS.highlights.delete(NAZEV_HIGHLIGHT_VSE);
    CSS.highlights.delete(NAZEV_HIGHLIGHT_AKTUALNI);
  }

  function textoveUzly(koren) {
    if (!koren) return [];
    const uzly = [];
    const walker = document.createTreeWalker(koren, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node?.data) return NodeFilter.FILTER_REJECT;
        const rodic = node.parentElement;
        if (!rodic) return NodeFilter.FILTER_REJECT;
        if (rodic.closest("[contenteditable='false'], script, style")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    let node;
    while ((node = walker.nextNode())) uzly.push(node);
    return uzly;
  }

  function rozsahProPozici(uzly, zacatek, konec) {
    let offset = 0;
    let startNode = null;
    let startOffset = 0;
    let endNode = null;
    let endOffset = 0;

    for (const node of uzly) {
      const delka = node.data.length;
      const dalsiOffset = offset + delka;

      if (!startNode && zacatek >= offset && zacatek < dalsiOffset) {
        startNode = node;
        startOffset = zacatek - offset;
      }

      if (konec > offset && konec <= dalsiOffset) {
        endNode = node;
        endOffset = konec - offset;
        break;
      }

      offset = dalsiOffset;
    }

    if (!startNode || !endNode) return null;

    const range = document.createRange();
    try {
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);
      return range;
    } catch (_error) {
      return null;
    }
  }

  function aktualizujPocitadlo() {
    if (!vysledky.length) {
      pocitadlo.textContent = vstup.value.trim() ? "0 / 0" : "";
      predchozi.disabled = true;
      dalsi.disabled = true;
      return;
    }

    pocitadlo.textContent = `${aktualniIndex + 1} / ${vysledky.length}`;
    const lzeNavigovat = vysledky.length > 1;
    predchozi.disabled = !lzeNavigovat;
    dalsi.disabled = !lzeNavigovat;
  }

  function vykresliHighlighty() {
    smazHighlighty();
    if (!podporujeHighlight() || !vysledky.length) return;

    const vse = new Highlight(...vysledky);
    CSS.highlights.set(NAZEV_HIGHLIGHT_VSE, vse);

    if (aktualniIndex >= 0 && vysledky[aktualniIndex]) {
      CSS.highlights.set(
        NAZEV_HIGHLIGHT_AKTUALNI,
        new Highlight(vysledky[aktualniIndex])
      );
    }
  }

  function posunNaAktualni() {
    const range = vysledky[aktualniIndex];
    if (!range) return;

    requestAnimationFrame(() => {
      const rect = range.getBoundingClientRect();
      // PATCH 675A – skutečný scroll vlastní Core V2 editor.
      // .modalContent má overflow:hidden, proto na něm scrollTo nic nedělal.
      const scroller = editor();
      if (!scroller || !rect || (!rect.width && !rect.height)) return;

      const scrollerRect = scroller.getBoundingClientRect();
      const odsazeniNahore = 18;
      const odsazeniDole = 24;
      const viditelnyTop = scrollerRect.top + odsazeniNahore;
      const viditelnyBottom = scrollerRect.bottom - odsazeniDole;

      if (rect.top < viditelnyTop || rect.bottom > viditelnyBottom) {
        const cil = scroller.scrollTop
          + (rect.top - scrollerRect.top)
          - Math.max(odsazeniNahore, scroller.clientHeight * 0.38);
        scroller.scrollTo({ top: Math.max(0, cil), behavior: "smooth" });
      }
    });
  }

  function obnovVysledky({ zachovatIndex = false, neposouvat = false } = {}) {
    const koren = editor();
    const dotaz = vstup.value.trim();
    const puvodniIndex = aktualniIndex;

    vysledky = [];
    aktualniIndex = -1;
    smazHighlighty();

    if (!koren || !dotaz) {
      aktualizujPocitadlo();
      return;
    }

    const uzly = textoveUzly(koren);
    const celyText = uzly.map((node) => node.data).join("");
    const hledany = dotaz.toLocaleLowerCase("cs-CZ");
    const prohledavany = celyText.toLocaleLowerCase("cs-CZ");

    let pozice = 0;
    while (pozice <= prohledavany.length - hledany.length) {
      const nalezeno = prohledavany.indexOf(hledany, pozice);
      if (nalezeno < 0) break;
      const range = rozsahProPozici(uzly, nalezeno, nalezeno + hledany.length);
      if (range) vysledky.push(range);
      pozice = nalezeno + Math.max(1, hledany.length);
      if (vysledky.length >= 500) break;
    }

    if (vysledky.length) {
      aktualniIndex = zachovatIndex
        ? Math.min(Math.max(0, puvodniIndex), vysledky.length - 1)
        : 0;
    }

    aktualizujPocitadlo();
    vykresliHighlighty();
    if (!neposouvat && aktualniIndex >= 0) posunNaAktualni();
  }

  function prejdi(smer) {
    if (!vysledky.length) return;
    aktualniIndex = (aktualniIndex + smer + vysledky.length) % vysledky.length;
    aktualizujPocitadlo();
    vykresliHighlighty();
    posunNaAktualni();
  }

  function sledujObsahEditoru() {
    observerEditoru?.disconnect();
    observerEditoru = null;
    const koren = editor();
    if (!koren) return;

    observerEditoru = new MutationObserver(() => {
      if (!jeOtevrene()) return;
      clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        obnovVysledky({ zachovatIndex: true, neposouvat: true });
      }, 120);
    });

    observerEditoru.observe(koren, {
      subtree: true,
      childList: true,
      characterData: true
    });
  }

  function otevri() {
    panel.hidden = false;
    tlacitko.setAttribute("aria-pressed", "true");
    sledujObsahEditoru();
    window.setTimeout(() => {
      try {
        vstup.focus({ preventScroll: true });
        vstup.click();
      } catch (_error) {}
    }, 0);
  }

  function zavriPanel() {
    if (!jeOtevrene()) return false;
    panel.hidden = true;
    tlacitko.setAttribute("aria-pressed", "false");
    smazHighlighty();
    vysledky = [];
    aktualniIndex = -1;
    aktualizujPocitadlo();
    observerEditoru?.disconnect();
    observerEditoru = null;
    clearTimeout(debounceTimer);
    return true;
  }

  tlacitko.addEventListener("click", () => {
    if (jeOtevrene()) {
      zavriPanel();
    } else {
      otevri();
    }
  });

  vstup.addEventListener("input", () => obnovVysledky());
  predchozi.addEventListener("click", () => prejdi(-1));
  dalsi.addEventListener("click", () => prejdi(1));
  zavrit.addEventListener("click", () => zavriPanel());

  document.addEventListener("keydown", (event) => {
    if (!jeOtevrene()) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      zavriPanel();
      return;
    }
    if (event.key === "Enter" && document.activeElement === vstup) {
      event.preventDefault();
      prejdi(event.shiftKey ? -1 : 1);
    }
  }, true);

  new MutationObserver(() => {
    if (taskModal.hidden && jeOtevrene()) zavriPanel();
  }).observe(taskModal, { attributes: true, attributeFilter: ["hidden"] });

  window.LubaNoteEditorFind = Object.freeze({
    jeOtevrene,
    otevri,
    zavri: zavriPanel,
    zpracujSystemoveZpet: zavriPanel
  });
})();
