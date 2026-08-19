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
  
  
  
  
  
  const moznostiVelikostiObrazku = [
    {
      hodnota: "prizpusobit",
      popisek: "Přizpůsobit editoru"
    },
    {
      hodnota: "100",
      popisek: "100 %"
    },
    {
      hodnota: "75",
      popisek: "75 %"
    },
    {
      hodnota: "50",
      popisek: "50 %"
    },
    {
      hodnota: "25",
      popisek: "25 %"
    },
    {
      hodnota: "vlastni",
      popisek: "Vlastní"
    }
  ];

  const moznostiZarovnaniObrazku = [
    {
      hodnota: "vlevo",
      popisek: "Vlevo"
    },
    {
      hodnota: "stred",
      popisek: "Na střed"
    },
    {
      hodnota: "vpravo",
      popisek: "Vpravo"
    }
  ];

  let imageLongPressTimer = null;
  let imagePressStartX = 0;
  let imagePressStartY = 0;
  let selectedImage = null;

  const IMAGE_LONG_PRESS_CANCEL_DISTANCE = 20;
  const IMAGE_LONG_PRESS_TIME = 600;

  function ziskejBlokObrazku(image) {
    return image?.closest?.(".lubaNoteImage") || null;
  }

  function ziskejAktualniVelikostObrazku(image, figure) {
    const inlineSirka = String(
      figure?.style?.width || ""
    ).trim();

    const procenta = inlineSirka.match(
      /^(\d+(?:\.\d+)?)%$/
    );

    if (procenta) {
      const cislo = Number(procenta[1]);

      if (
        Number.isFinite(cislo) &&
        cislo >= 10 &&
        cislo <= 100
      ) {
        return String(cislo);
      }
    }

    const ulozenaVelikost =
      figure?.dataset?.velikost ||
      image?.dataset?.velikost;

    if (ulozenaVelikost === "prizpusobit") {
      return "prizpusobit";
    }

    const cislo = Number(ulozenaVelikost);

    if (
      Number.isFinite(cislo) &&
      cislo >= 10 &&
      cislo <= 100
    ) {
      return String(cislo);
    }

    return "prizpusobit";
  }

  function ziskejPopisekVelikostiObrazku(velikost) {
    const moznost = moznostiVelikostiObrazku.find(
      (polozka) => polozka.hodnota === velikost
    );

    if (moznost) {
      return moznost.popisek;
    }

    const cislo = Number(velikost);

    if (
      Number.isFinite(cislo) &&
      cislo >= 10 &&
      cislo <= 100
    ) {
      return `${cislo} %`;
    }

    return "Přizpůsobit editoru";
  }

  function ziskejPopisekZarovnaniObrazku(zarovnani) {
    const moznost = moznostiZarovnaniObrazku.find(
      (polozka) => polozka.hodnota === zarovnani
    );

    return moznost?.popisek || "Na střed";
  }

  function ziskejAktualniZarovnaniObrazku(image, figure) {
    const ulozeneZarovnani = figure?.dataset?.zarovnani;

    if (
      ulozeneZarovnani === "vlevo" ||
      ulozeneZarovnani === "stred" ||
      ulozeneZarovnani === "vpravo"
    ) {
      return ulozeneZarovnani;
    }

    /* Starší obrázky nemají data-zarovnani na figure.
       Jejich původní CSS je centrovalo pomocí margin: auto. */
    if (
      !figure?.style?.marginLeft &&
      !figure?.style?.marginRight
    ) {
      return "stred";
    }

    if (
      figure.style.marginLeft === "auto" &&
      figure.style.marginRight === "0px"
    ) {
      return "vpravo";
    }

    if (
      figure.style.marginLeft === "0px" &&
      figure.style.marginRight === "auto"
    ) {
      return "vlevo";
    }

    return image?.dataset?.zarovnani || "stred";
  }

  function oznamZmenuObrazku() {
    modalRichText.dispatchEvent(
      new Event("input", { bubbles: true })
    );
  }

  function nastavZarovnaniObrazku(
    image,
    figure,
    zarovnani
  ) {
    if (!image || !figure) {
      return;
    }

    image.dataset.zarovnani = zarovnani;
    figure.dataset.zarovnani = zarovnani;

    if (zarovnani === "vlevo") {
      figure.style.marginLeft = "0px";
      figure.style.marginRight = "auto";
      return;
    }

    if (zarovnani === "vpravo") {
      figure.style.marginLeft = "auto";
      figure.style.marginRight = "0px";
      return;
    }

    figure.style.marginLeft = "auto";
    figure.style.marginRight = "auto";
  }

  function nastavVelikostObrazku(
    image,
    figure,
    velikost
  ) {
    if (!image || !figure) {
      return false;
    }

    if (velikost === "prizpusobit") {
      figure.style.removeProperty("width");
      figure.dataset.velikost = "prizpusobit";
      image.dataset.velikost = "prizpusobit";
      return true;
    }

    const cislo = Number(velikost);

    if (
      Number.isNaN(cislo) ||
      cislo < 10 ||
      cislo > 100
    ) {
      return false;
    }

    figure.style.width = `${cislo}%`;
    figure.dataset.velikost = String(cislo);
    image.dataset.velikost = String(cislo);

    return true;
  }

  function otevriNastaveniObrazku(image) {
    const figure = ziskejBlokObrazku(image);

    if (!figure) {
      return;
    }

    if (
      typeof window.otevriNastavovaciModal !==
      "function"
    ) {
      console.error(
        "Chybí choiceModal.js – nastavení obrázku nelze otevřít."
      );
      return;
    }

    selectedImage = image;

    const aktualniVelikost =
      ziskejAktualniVelikostObrazku(
        image,
        figure
      );

    const aktualniZarovnani =
      ziskejAktualniZarovnaniObrazku(
        image,
        figure
      );

    window.otevriNastavovaciModal({
      nadpis: "Obrázek",
      polozky: [
        {
          klic: "velikost",
          popisek: "Velikost",
          hodnota: aktualniVelikost,
          zobrazeni:
            ziskejPopisekVelikostiObrazku(
              aktualniVelikost
            ),
          moznosti: moznostiVelikostiObrazku,
          vlastniVstup: {
            spoustecHodnota: "vlastni",
            nadpis: "Vlastní velikost",
            popisek: "Šířka obrázku v procentech",
            min: 10,
            max: 100,
            krok: 1,
            vychoziHodnota: 50,
            vytvorZobrazeni: (hodnota) =>
              `${hodnota} %`
          }
        },
        {
          klic: "zarovnani",
          popisek: "Zarovnání",
          hodnota: aktualniZarovnani,
          zobrazeni:
            ziskejPopisekZarovnaniObrazku(
              aktualniZarovnani
            ),
          moznosti: moznostiZarovnaniObrazku
        }
      ],
      poUlozeni: (hodnoty) => {
        const velikostNastavena =
          nastavVelikostObrazku(
            selectedImage,
            figure,
            hodnoty.velikost
          );

        if (!velikostNastavena) {
          return;
        }

        nastavZarovnaniObrazku(
          selectedImage,
          figure,
          hodnoty.zarovnani
        );

        oznamZmenuObrazku();
      }
    });
  }

  modalRichText.addEventListener(
    "pointerdown",
    (event) => {
      const obrazek = event.target.closest?.(
        ".lubaNoteImage img"
      );

      if (!obrazek) {
        return;
      }

      clearTimeout(imageLongPressTimer);

      imagePressStartX = event.clientX;
      imagePressStartY = event.clientY;
      selectedImage = obrazek;

      imageLongPressTimer = setTimeout(() => {
        imageLongPressTimer = null;
        otevriNastaveniObrazku(obrazek);
      }, IMAGE_LONG_PRESS_TIME);
    }
  );

  modalRichText.addEventListener(
    "pointermove",
    (event) => {
      if (!imageLongPressTimer) {
        return;
      }

      const distanceX =
        Math.abs(
          event.clientX - imagePressStartX
        );

      const distanceY =
        Math.abs(
          event.clientY - imagePressStartY
        );

      if (
        distanceX >
          IMAGE_LONG_PRESS_CANCEL_DISTANCE ||
        distanceY >
          IMAGE_LONG_PRESS_CANCEL_DISTANCE
      ) {
        clearTimeout(imageLongPressTimer);
        imageLongPressTimer = null;
      }
    }
  );

  function zrusLongPressObrazku() {
    clearTimeout(imageLongPressTimer);
    imageLongPressTimer = null;
  }

  modalRichText.addEventListener(
    "pointerup",
    zrusLongPressObrazku
  );

  modalRichText.addEventListener(
    "pointercancel",
    zrusLongPressObrazku
  );

  modalRichText.addEventListener(
    "pointerleave",
    zrusLongPressObrazku
  );

  /* ==========================================
     VÝBĚR / KURZOR V RICH-TEXT EDITORU
  ========================================== */
  
  function jeUzelVEditoru(node) {
    if (!node) {
      return false;
    }
    
    const element =
      node.nodeType === Node.TEXT_NODE ?
      node.parentElement :
      node;
    
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
    node, { nahradVyber = false } = {}
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
    figure.dataset.velikost = "prizpusobit";
    figure.dataset.zarovnani = "stred";
    figure.contentEditable = "false";
    
    const image = document.createElement("img");
    image.src = dataUrl;
    image.alt = fileName ?
      `Obrázek: ${fileName}` :
      "Obrázek v poznámce";
    image.loading = "lazy";
    image.draggable = false;
    image.dataset.velikost = "prizpusobit";
    image.dataset.zarovnani = "stred";
    
    
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
  
  modalRichText.addEventListener("paste", (event) => {
    const soubor = event.clipboardData?.files?.[0];
    
    if (!soubor) {
      return;
    }
    
    if (!soubor.type.startsWith("image/")) {
      return;
    }
    
    event.preventDefault();
    
    void vlozVybranyObrazek(soubor);
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
        }],
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