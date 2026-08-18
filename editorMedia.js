/* ==================================================
   LUBANOTE – OBRÁZKY A INTERNETOVÉ ODKAZY V EDITORU

   Tento soubor řeší pouze obsah vkládaný do rich-text
   editoru:
   - vložení obrázku z telefonu / počítače,
   - zmenšení obrázku před uložením,
   - vložení internetového odkazu,
   - otevření uloženého odkazu,
   - odstranění vloženého obrázku.

   Obrázky se ukládají přímo do richContent jako
   komprimovaný WEBP data URL. Díky tomu fungují offline
   a u tajné poznámky zůstávají uvnitř šifrovaných dat.
================================================== */

(() => {
  const moreOptionsButton =
    document.getElementById("moreOptionsButton");

  const modalRichText =
    document.getElementById("modalRichText");

  if (!moreOptionsButton || !modalRichText) {
    return;
  }

  let ulozenyRozsahEditoru = null;
  let linkModal = null;
  let linkTextInput = null;
  let linkUrlInput = null;

  const imageInput = document.createElement("input");
  imageInput.type = "file";
  imageInput.accept = "image/*";
  imageInput.hidden = true;
  imageInput.setAttribute("aria-hidden", "true");
  document.body.append(imageInput);


  /* ==========================================
     VÝBĚR / KURZOR V RICH-TEXT EDITORU
  ========================================== */

  function jeUzelVEditoru(node) {
    if (!node) {
      return false;
    }

    const element =
      node.nodeType === Node.TEXT_NODE
        ? node.parentElement
        : node;

    return Boolean(
      element &&
      (
        element === modalRichText ||
        modalRichText.contains(element)
      )
    );
  }

  function jeRozsahVEditoru(range) {
    return Boolean(
      range &&
      jeUzelVEditoru(range.startContainer) &&
      jeUzelVEditoru(range.endContainer)
    );
  }

  function ulozAktualniRozsahEditoru() {
    const selection = window.getSelection();

    if (
      !selection ||
      selection.rangeCount === 0
    ) {
      return false;
    }

    const range = selection.getRangeAt(0);

    if (!jeRozsahVEditoru(range)) {
      return false;
    }

    ulozenyRozsahEditoru = range.cloneRange();
    return true;
  }

  function ziskejPlatnyUlozenyRozsah() {
    if (
      ulozenyRozsahEditoru &&
      jeRozsahVEditoru(ulozenyRozsahEditoru)
    ) {
      return ulozenyRozsahEditoru.cloneRange();
    }

    const range = document.createRange();
    range.selectNodeContents(modalRichText);
    range.collapse(false);
    return range;
  }

  function nastavKurzorZaUzel(node) {
    if (!node?.parentNode) {
      return;
    }

    const range = document.createRange();
    range.setStartAfter(node);
    range.collapse(true);

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    ulozenyRozsahEditoru = range.cloneRange();
  }

  document.addEventListener(
    "selectionchange",
    ulozAktualniRozsahEditoru
  );

  [
    "keyup",
    "mouseup",
    "touchend",
    "input",
    "focus"
  ].forEach((eventName) => {
    modalRichText.addEventListener(
      eventName,
      ulozAktualniRozsahEditoru
    );
  });

  /* Pointerdown proběhne ještě před ztrátou výběru po klepnutí na ⋮. */
  moreOptionsButton.addEventListener(
    "pointerdown",
    ulozAktualniRozsahEditoru
  );


  /* ==========================================
     SPOLEČNÉ POMOCNÉ FUNKCE
  ========================================== */

  function jeTodoRezimAktivni() {
    return Boolean(
      window.LubaNoteTodos
        ?.jeTodoRezimAktivni?.()
    );
  }

  function zobrazMediaZpravu(nadpis, text) {
    if (
      typeof window.zobrazZpravuAplikace ===
      "function"
    ) {
      window.zobrazZpravuAplikace(
        nadpis,
        text
      );
      return;
    }

    console.warn(`${nadpis}: ${text}`);
  }

  function vlozUzelDoEditoru(
    node,
    { nahradVyber = false } = {}
  ) {
    const range = ziskejPlatnyUlozenyRozsah();

    modalRichText.focus();

    if (nahradVyber && !range.collapsed) {
      range.deleteContents();
    } else {
      range.collapse(false);
    }

    range.insertNode(node);
    modalRichText.normalize();

    nastavKurzorZaUzel(node);

    modalRichText.dispatchEvent(
      new Event("input", { bubbles: true })
    );
  }


  /* ==========================================
     OBRÁZKY
  ========================================== */

  function nactiSouborJakoDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);

      reader.readAsDataURL(file);
    });
  }

  function nactiObrazek(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();

      image.onload = () => resolve(image);
      image.onerror = () => reject(
        new Error("Obrázek se nepodařilo načíst.")
      );

      image.src = dataUrl;
    });
  }

  function vykresliObrazekDoWebp(
    image,
    maxRozmer,
    kvalita
  ) {
    const puvodniSirka =
      image.naturalWidth || image.width;
    const puvodniVyska =
      image.naturalHeight || image.height;

    const nejvetsiStrana = Math.max(
      puvodniSirka,
      puvodniVyska
    );

    const pomer = Math.min(
      1,
      maxRozmer / nejvetsiStrana
    );

    const sirka = Math.max(
      1,
      Math.round(puvodniSirka * pomer)
    );

    const vyska = Math.max(
      1,
      Math.round(puvodniVyska * pomer)
    );

    const canvas = document.createElement("canvas");
    canvas.width = sirka;
    canvas.height = vyska;

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error(
        "Obrázek se nepodařilo připravit."
      );
    }

    context.drawImage(
      image,
      0,
      0,
      sirka,
      vyska
    );

    return canvas.toDataURL(
      "image/webp",
      kvalita
    );
  }

  async function pripravObrazekProPoznamku(file) {
    if (!file?.type?.startsWith("image/")) {
      throw new Error(
        "Vybraný soubor není obrázek."
      );
    }

    const originalDataUrl =
      await nactiSouborJakoDataUrl(file);

    const image =
      await nactiObrazek(originalDataUrl);

    /*
     * Data URL ukládáme přímo do poznámky. Proto držíme
     * obrázek rozumně malý, aby localStorage a synchronizace
     * zůstaly rychlé i na telefonu.
     */
    const pokusy = [
      { maxRozmer: 1280, kvalita: 0.78 },
      { maxRozmer: 1080, kvalita: 0.72 },
      { maxRozmer: 900, kvalita: 0.68 },
      { maxRozmer: 760, kvalita: 0.64 }
    ];

    let vysledek = "";

    for (const pokus of pokusy) {
      vysledek = vykresliObrazekDoWebp(
        image,
        pokus.maxRozmer,
        pokus.kvalita
      );

      /* přibližně do 500 kB binárních dat */
      if (vysledek.length <= 700000) {
        break;
      }
    }

    if (!vysledek) {
      throw new Error(
        "Obrázek se nepodařilo připravit."
      );
    }

    return vysledek;
  }

  function vytvorBlokObrazku(dataUrl, fileName = "") {
    const figure = document.createElement("figure");
    figure.className = "lubaNoteImage";
    figure.dataset.lubanoteImage = "true";
    figure.contentEditable = "false";

    const image = document.createElement("img");
    image.src = dataUrl;
    image.alt = fileName
      ? `Obrázek: ${fileName}`
      : "Obrázek v poznámce";
    image.loading = "lazy";
    image.draggable = false;

    const removeButton =
      document.createElement("button");
    removeButton.type = "button";
    removeButton.className =
      "lubaNoteImageRemove";
    removeButton.setAttribute(
      "aria-label",
      "Odstranit obrázek"
    );
    removeButton.contentEditable = "false";

    figure.append(
      image,
      removeButton
    );

    return figure;
  }

  async function vlozVybranyObrazek(file) {
    if (!file) {
      return;
    }

    try {
      const dataUrl =
        await pripravObrazekProPoznamku(file);

      const figure = vytvorBlokObrazku(
        dataUrl,
        file.name
      );

      vlozUzelDoEditoru(figure);
    } catch (error) {
      console.error(
        "Vložení obrázku se nepodařilo:",
        error
      );

      zobrazMediaZpravu(
        "Obrázek se nepodařilo vložit",
        error?.message ||
          "Zkus vybrat jiný obrázek."
      );
    } finally {
      imageInput.value = "";
    }
  }

  imageInput.addEventListener("change", () => {
    const file = imageInput.files?.[0] || null;
    void vlozVybranyObrazek(file);
  });


  /* ==========================================
     INTERNETOVÉ ODKAZY
  ========================================== */

  function normalizujInternetovouAdresu(value) {
    const raw = String(value || "").trim();

    if (!raw) {
      return "";
    }

    let candidate = raw;

    if (!/^https?:\/\//i.test(candidate)) {
      candidate = `https://${candidate}`;
    }

    try {
      const url = new URL(candidate);

      if (
        url.protocol !== "http:" &&
        url.protocol !== "https:"
      ) {
        return "";
      }

      return url.href;
    } catch {
      return "";
    }
  }

  function ziskejTextAktualnihoVyberu() {
    const range = ziskejPlatnyUlozenyRozsah();

    if (range.collapsed) {
      return "";
    }

    return range.toString().trim();
  }

  function vytvorLinkModalPokudChybi() {
    if (linkModal) {
      return;
    }

    linkModal = document.createElement("div");
    linkModal.className = "editorLinkModal";
    linkModal.hidden = true;

    const dialog = document.createElement("div");
    dialog.className = "editorLinkDialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute(
      "aria-labelledby",
      "editorLinkTitle"
    );

    const title = document.createElement("h3");
    title.id = "editorLinkTitle";
    title.textContent = "🔗 Internetový odkaz";

    const textLabel = document.createElement("label");
    textLabel.textContent = "Text odkazu";

    linkTextInput = document.createElement("input");
    linkTextInput.type = "text";
    linkTextInput.placeholder =
      "např. OpenAI";
    linkTextInput.autocomplete = "off";

    textLabel.append(linkTextInput);

    const urlLabel = document.createElement("label");
    urlLabel.textContent = "Internetová adresa";

    linkUrlInput = document.createElement("input");
    linkUrlInput.type = "url";
    linkUrlInput.placeholder =
      "https://example.com";
    linkUrlInput.autocomplete = "off";
    linkUrlInput.inputMode = "url";

    urlLabel.append(linkUrlInput);

    const actions = document.createElement("div");
    actions.className = "editorLinkActions";

    const cancelButton =
      document.createElement("button");
    cancelButton.type = "button";
    cancelButton.textContent = "Zrušit";

    const saveButton =
      document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "primary";
    saveButton.textContent = "🔗 Vložit";

    actions.append(
      cancelButton,
      saveButton
    );

    dialog.append(
      title,
      textLabel,
      urlLabel,
      actions
    );

    linkModal.append(dialog);
    document.body.append(linkModal);

    function zavriLinkModal() {
      linkModal.hidden = true;
    }

    function ulozOdkaz() {
      const url = normalizujInternetovouAdresu(
        linkUrlInput.value
      );

      if (!url) {
        zobrazMediaZpravu(
          "Neplatná adresa",
          "Zadej platnou internetovou adresu."
        );
        return;
      }

      const vybranyText =
        ziskejTextAktualnihoVyberu();

      const text =
        linkTextInput.value.trim() ||
        vybranyText ||
        url;

      const anchor = document.createElement("a");
      anchor.className =
        "lubaNoteInternetLink";
      anchor.dataset.lubanoteLink = "true";
      anchor.href = url;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.textContent = text;

      vlozUzelDoEditoru(
        anchor,
        {
          nahradVyber: Boolean(vybranyText)
        }
      );

      /* Mezera za odkazem usnadní pokračování v psaní. */
      const mezera = document.createTextNode(" ");
      anchor.after(mezera);
      nastavKurzorZaUzel(mezera);

      zavriLinkModal();
    }

    cancelButton.addEventListener(
      "click",
      zavriLinkModal
    );

    saveButton.addEventListener(
      "click",
      ulozOdkaz
    );

    linkUrlInput.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          ulozOdkaz();
        }
      }
    );

    linkModal.addEventListener("click", (event) => {
      if (event.target === linkModal) {
        zavriLinkModal();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (
        event.key === "Escape" &&
        linkModal &&
        !linkModal.hidden
      ) {
        zavriLinkModal();
      }
    });
  }

  function otevriLinkModal() {
    vytvorLinkModalPokudChybi();

    const vybranyText =
      ziskejTextAktualnihoVyberu();

    linkTextInput.value = vybranyText;
    linkUrlInput.value = "";

    /* Pokud uživatel označil přímo URL, použijeme ji i jako adresu. */
    if (
      vybranyText &&
      /^(https?:\/\/|www\.)/i.test(vybranyText)
    ) {
      linkUrlInput.value = vybranyText;
    }

    linkModal.hidden = false;

    requestAnimationFrame(() => {
      if (vybranyText) {
        linkUrlInput.focus();
      } else {
        linkTextInput.focus();
      }
    });
  }


  /* ==========================================
     MENU ⋮ V EDITORU
  ========================================== */

  moreOptionsButton.addEventListener(
    "click",
    () => {
      if (jeTodoRezimAktivni()) {
        zobrazMediaZpravu(
          "Vkládání do textu poznámky",
          "Obrázek nebo internetový odkaz vlož do běžného textu poznámky. TODO řádky zůstávají samostatné úkoly."
        );
        return;
      }

      if (
        typeof window.otevriVyberovyModal !==
        "function"
      ) {
        return;
      }

      window.otevriVyberovyModal({
        nadpis: "Vložit do poznámky",
        zavritPoVyberu: false,
        moznosti: [
          {
            hodnota: "image",
            popisek: "🖼️ Obrázek"
          },
          {
            hodnota: "link",
            popisek: "🔗 Internetový odkaz"
          }
        ],
        poVyberu: (hodnota) => {
          window.zavriVyberovyModal?.();

          if (hodnota === "image") {
            setTimeout(() => {
              imageInput.click();
            }, 0);
            return;
          }

          if (hodnota === "link") {
            setTimeout(() => {
              otevriLinkModal();
            }, 0);
          }
        }
      });
    }
  );


  /* ==========================================
     AKCE NAD ULOŽENÝM OBRÁZKEM / ODKAZEM
  ========================================== */

  modalRichText.addEventListener(
    "click",
    (event) => {
      const removeButton =
        event.target.closest?.(
          ".lubaNoteImageRemove"
        );

      if (removeButton) {
        event.preventDefault();
        event.stopPropagation();

        const figure = removeButton.closest(
          ".lubaNoteImage"
        );

        figure?.remove();
        modalRichText.normalize();
        ulozenyRozsahEditoru = null;

        modalRichText.dispatchEvent(
          new Event("input", { bubbles: true })
        );
        return;
      }

      const link = event.target.closest?.(
        "a.lubaNoteInternetLink"
      );

      if (!link) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const href = normalizujInternetovouAdresu(
        link.getAttribute("href")
      );

      if (!href) {
        return;
      }

      window.open(
        href,
        "_blank",
        "noopener,noreferrer"
      );
    }
  );


  window.LubaNoteEditorMedia = {
    maVlozenyObsah: () =>
      Boolean(
        modalRichText.querySelector(
          ".lubaNoteImage, a.lubaNoteInternetLink"
        )
      ),

    vlozObrazek: () => imageInput.click(),
    otevriOdkaz: otevriLinkModal
  };
})();
