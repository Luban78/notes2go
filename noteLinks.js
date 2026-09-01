/* ========================================
   LUBANOTE – INTERNÍ ODKAZY NA POZNÁMKY V1
   ========================================

   V1 záměrně podporuje pouze hlavní rich-text editor.
   TODO, bullety, navigace po kliknutí a backlinky přijdou
   v dalších samostatných verzích.
*/
(() => {
  "use strict";

  const editor = document.getElementById("modalRichText");

  if (!editor) {
    return;
  }

  const MAX_VYSLEDKU = 8;
  const MAX_DELKA_DOTAZU = 80;

  let panel = null;
  let seznam = null;
  let aktualniVysledky = [];
  let aktivniIndex = 0;
  let posledniSpoust = null;

  function bezDiakritiky(text) {
    return String(text || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("cs-CZ");
  }

  function ziskejNazevPoznamky(poznamka) {
    const title = String(poznamka?.title || "").trim();
    return title || "Bez názvu";
  }

  function ziskejAktivniPoznamkuId() {
    try {
      if (
        typeof activeTaskId !== "undefined" &&
        activeTaskId
      ) {
        return String(activeTaskId);
      }
    } catch (_) {
      // activeTaskId nemusí být v daném buildu dostupné.
    }

    return null;
  }

  function nactiKandidaty(dotaz) {
    if (typeof loadTask !== "function") {
      return [];
    }

    const aktivniId = ziskejAktivniPoznamkuId();
    const normalizovanyDotaz = bezDiakritiky(dotaz);

    const kandidati = loadTask()
      .filter((poznamka) => {
        if (!poznamka?.id) {
          return false;
        }

        /*
         * V1 nikdy nenabízí Secret poznámky – ani když je trezor
         * právě odemčený. Secret propojení je samostatná budoucí verze.
         */
        if (poznamka.isSecret === true) {
          return false;
        }

        if (aktivniId && String(poznamka.id) === aktivniId) {
          return false;
        }

        return true;
      })
      .map((poznamka) => {
        const nazev = ziskejNazevPoznamky(poznamka);
        const normalizovanyNazev = bezDiakritiky(nazev);

        let skore = 3;

        if (normalizovanyDotaz) {
          if (normalizovanyNazev.startsWith(normalizovanyDotaz)) {
            skore = 0;
          } else if (normalizovanyNazev.includes(normalizovanyDotaz)) {
            skore = 1;
          } else {
            return null;
          }
        }

        return {
          poznamka,
          nazev,
          skore,
          updatedAt: new Date(
            poznamka.updatedAt || 0
          ).getTime() || 0
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.skore !== b.skore) {
          return a.skore - b.skore;
        }

        if (normalizovanyDotaz) {
          const delkaRozdil =
            a.nazev.length - b.nazev.length;

          if (delkaRozdil !== 0) {
            return delkaRozdil;
          }
        }

        return b.updatedAt - a.updatedAt;
      });

    return kandidati.slice(0, MAX_VYSLEDKU);
  }

  function vytvorPanel() {
    if (panel) {
      return panel;
    }

    panel = document.createElement("div");
    panel.id = "noteLinkAutocomplete";
    panel.className = "noteLinkAutocomplete";
    panel.hidden = true;
    panel.setAttribute("role", "listbox");
    panel.setAttribute(
      "aria-label",
      "Vybrat poznámku pro interní odkaz"
    );

    seznam = document.createElement("div");
    seznam.className = "noteLinkAutocompleteList";
    panel.append(seznam);
    document.body.append(panel);

    panel.addEventListener("pointerdown", (event) => {
      const tlacitko = event.target.closest(
        ".noteLinkAutocompleteItem"
      );

      if (!tlacitko) {
        return;
      }

      /* Zachová caret v editoru, aby šlo přesně nahradit [[dotaz. */
      event.preventDefault();

      const index = Number(tlacitko.dataset.index);

      if (Number.isInteger(index)) {
        vlozVybranouPoznamku(index);
      }
    });

    return panel;
  }

  function zavriPanel() {
    if (!panel) {
      return;
    }

    panel.hidden = true;
    panel.replaceChildren();
    seznam = null;
    aktualniVysledky = [];
    aktivniIndex = 0;
    posledniSpoust = null;
  }

  function jeVBeznemTextu(node) {
    const element =
      node?.nodeType === Node.ELEMENT_NODE
        ? node
        : node?.parentElement;

    if (!element || !editor.contains(element)) {
      return false;
    }

    /* V1 – bullet editor přijde až ve verzi 2. */
    if (element.closest("li")) {
      return false;
    }

    if (
      element.closest(
        ".lubaNoteImage, figure, .noteInternalLink"
      )
    ) {
      return false;
    }

    return true;
  }

  function ziskejSpoustUCursoru() {
    const selection = window.getSelection();

    if (
      !selection ||
      selection.rangeCount === 0 ||
      !selection.isCollapsed
    ) {
      return null;
    }

    const range = selection.getRangeAt(0);

    if (!editor.contains(range.startContainer)) {
      return null;
    }

    if (!jeVBeznemTextu(range.startContainer)) {
      return null;
    }

    /*
     * Při normálním psaní contenteditable drží právě psaný text
     * v jednom textovém uzlu. To je pro V1 záměrně nejbezpečnější:
     * nezasahujeme přes hranice formátovaných elementů.
     */
    if (range.startContainer.nodeType !== Node.TEXT_NODE) {
      return null;
    }

    const textNode = range.startContainer;
    const caretOffset = range.startOffset;
    const predKurzorem = textNode.data.slice(0, caretOffset);

    const match = predKurzorem.match(
      /\[\[([^\[\]\n]{0,80})$/
    );

    if (!match) {
      return null;
    }

    const dotaz = match[1];

    if (dotaz.length > MAX_DELKA_DOTAZU) {
      return null;
    }

    const startOffset = caretOffset - match[0].length;

    return {
      textNode,
      startOffset,
      endOffset: caretOffset,
      dotaz,
      range: range.cloneRange()
    };
  }

  function ziskejCaretRect(spoust) {
    const range = document.createRange();
    range.setStart(spoust.textNode, spoust.endOffset);
    range.collapse(true);

    let rect = range.getBoundingClientRect();

    if (!rect || (!rect.width && !rect.height)) {
      rect = editor.getBoundingClientRect();
    }

    return rect;
  }

  function formatMeta(poznamka) {
    const casti = [];

    if (poznamka?.area === "work") {
      casti.push("Pracovní");
    } else if (poznamka?.area === "private") {
      casti.push("Soukromé");
    }

    if (poznamka?.updatedAt) {
      const datum = new Date(poznamka.updatedAt);

      if (!Number.isNaN(datum.getTime())) {
        casti.push(
          datum.toLocaleDateString("cs-CZ", {
            day: "numeric",
            month: "numeric"
          })
        );
      }
    }

    return casti.join(" • ");
  }

  function renderujVysledky() {
    vytvorPanel();

    if (!seznam) {
      seznam = document.createElement("div");
      seznam.className = "noteLinkAutocompleteList";
      panel.append(seznam);
    }

    seznam.replaceChildren();

    if (aktualniVysledky.length === 0) {
      const prazdne = document.createElement("div");
      prazdne.className = "noteLinkAutocompleteEmpty";
      prazdne.textContent = "Žádná odpovídající poznámka";
      seznam.append(prazdne);
      return;
    }

    aktualniVysledky.forEach((vysledek, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "noteLinkAutocompleteItem";
      button.dataset.index = String(index);
      button.setAttribute("role", "option");
      button.setAttribute(
        "aria-selected",
        index === aktivniIndex ? "true" : "false"
      );

      const nazev = document.createElement("span");
      nazev.className = "noteLinkAutocompleteTitle";
      nazev.textContent = vysledek.nazev;

      const metaText = formatMeta(vysledek.poznamka);

      if (metaText) {
        const meta = document.createElement("span");
        meta.className = "noteLinkAutocompleteMeta";
        meta.textContent = metaText;
        button.append(nazev, meta);
      } else {
        button.append(nazev);
      }

      seznam.append(button);
    });
  }

  function aktualizujAktivniPolozku() {
    if (!panel || panel.hidden) {
      return;
    }

    panel
      .querySelectorAll(".noteLinkAutocompleteItem")
      .forEach((button, index) => {
        const aktivni = index === aktivniIndex;
        button.classList.toggle("active", aktivni);
        button.setAttribute(
          "aria-selected",
          aktivni ? "true" : "false"
        );

        if (aktivni) {
          button.scrollIntoView({ block: "nearest" });
        }
      });
  }

  function umistiPanel() {
    if (!panel || panel.hidden || !posledniSpoust) {
      return;
    }

    const rect = ziskejCaretRect(posledniSpoust);
    const viewportWidth =
      window.visualViewport?.width || window.innerWidth;
    const viewportHeight =
      window.visualViewport?.height || window.innerHeight;

    const sirka = Math.min(360, Math.max(240, viewportWidth - 24));
    const odsazeni = 8;

    panel.style.width = `${sirka}px`;

    let left = rect.left;
    left = Math.max(12, Math.min(left, viewportWidth - sirka - 12));

    /* Nejdřív zkusíme panel pod caret. */
    let top = rect.bottom + odsazeni;
    const odhadVysky = Math.min(
      320,
      58 * Math.max(1, aktualniVysledky.length) + 8
    );

    if (top + odhadVysky > viewportHeight - 12) {
      top = Math.max(12, rect.top - odhadVysky - odsazeni);
    }

    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
  }

  function otevriNeboAktualizujPanel() {
    const spoust = ziskejSpoustUCursoru();

    if (!spoust) {
      zavriPanel();
      return;
    }

    posledniSpoust = spoust;
    aktualniVysledky = nactiKandidaty(spoust.dotaz);
    aktivniIndex = 0;

    vytvorPanel();
    panel.hidden = false;
    renderujVysledky();
    aktualizujAktivniPolozku();
    requestAnimationFrame(umistiPanel);
  }

  function vytvorInterniOdkaz(poznamka) {
    const link = document.createElement("span");
    link.className = "noteInternalLink";
    link.dataset.noteId = String(poznamka.id);
    link.dataset.noteTitle = ziskejNazevPoznamky(poznamka);
    link.setAttribute("contenteditable", "false");
    link.setAttribute("role", "link");
    link.setAttribute(
      "aria-label",
      `Interní odkaz na poznámku ${ziskejNazevPoznamky(poznamka)}`
    );
    link.textContent = ziskejNazevPoznamky(poznamka);
    return link;
  }

  function vlozVybranouPoznamku(index) {
    const vysledek = aktualniVysledky[index];
    const spoust = posledniSpoust;

    if (!vysledek || !spoust) {
      return;
    }

    if (
      !spoust.textNode?.isConnected ||
      !editor.contains(spoust.textNode)
    ) {
      zavriPanel();
      return;
    }

    const range = document.createRange();

    try {
      range.setStart(spoust.textNode, spoust.startOffset);
      range.setEnd(spoust.textNode, spoust.endOffset);
    } catch (_) {
      zavriPanel();
      return;
    }

    const link = vytvorInterniOdkaz(vysledek.poznamka);
    const mezera = document.createTextNode(" ");

    range.deleteContents();
    range.insertNode(mezera);
    range.insertNode(link);

    const selection = window.getSelection();
    const caretRange = document.createRange();
    caretRange.setStartAfter(mezera);
    caretRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(caretRange);

    zavriPanel();
    editor.focus({ preventScroll: true });

    editor.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: null
      })
    );
  }

  function posunAktivni(smer) {
    if (aktualniVysledky.length === 0) {
      return;
    }

    aktivniIndex =
      (aktivniIndex + smer + aktualniVysledky.length) %
      aktualniVysledky.length;

    aktualizujAktivniPolozku();
  }

  editor.addEventListener("input", () => {
    otevriNeboAktualizujPanel();
  });

  editor.addEventListener("keyup", (event) => {
    if (
      event.key === "ArrowUp" ||
      event.key === "ArrowDown" ||
      event.key === "Enter" ||
      event.key === "Escape"
    ) {
      return;
    }

    if (!panel || panel.hidden) {
      otevriNeboAktualizujPanel();
    }
  });

  editor.addEventListener(
    "keydown",
    (event) => {
      if (!panel || panel.hidden) {
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        posunAktivni(1);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        posunAktivni(-1);
        return;
      }

      if (event.key === "Enter") {
        if (aktualniVysledky.length > 0) {
          event.preventDefault();
          event.stopPropagation();
          vlozVybranouPoznamku(aktivniIndex);
        }
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        zavriPanel();
      }
    },
    true
  );

  editor.addEventListener("scroll", () => {
    if (panel && !panel.hidden) {
      requestAnimationFrame(umistiPanel);
    }
  });

  window.addEventListener("resize", () => {
    if (panel && !panel.hidden) {
      requestAnimationFrame(umistiPanel);
    }
  });

  window.visualViewport?.addEventListener("resize", () => {
    if (panel && !panel.hidden) {
      requestAnimationFrame(umistiPanel);
    }
  });

  document.addEventListener("pointerdown", (event) => {
    if (!panel || panel.hidden) {
      return;
    }

    if (panel.contains(event.target) || editor.contains(event.target)) {
      return;
    }

    zavriPanel();
  });

  /*
   * V1 záměrně nepřidává navigaci po kliknutí.
   * Kliknutí jen chrání atomický link před editací; skutečné otevření
   * cílové poznámky bude samostatná V3 s historií a Back navigací.
   */
  editor.addEventListener("click", (event) => {
    const link = event.target.closest?.(".noteInternalLink");

    if (!link) {
      return;
    }

    event.preventDefault();
  });

  window.LubaNoteNoteLinks = {
    verze: 1,
    zavriAutocomplete: zavriPanel,
    normalizujVyhledavani: bezDiakritiky
  };
})();
