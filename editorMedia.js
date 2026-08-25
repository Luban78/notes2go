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
  const modalRichText =
    document.getElementById("modalRichText");

  const rychlyToolbar =
    document.getElementById("editorQuickToolbar");
  
  if (!modalRichText) {
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

  let selectedImage = null;

  /*
   * Ovládání obrázku je záměrně jednoduché:
   * 1. jeden klik obrázek označí,
   * 2. zobrazí se ⚙ nastavení + ✕ smazání,
   * 3. označený obrázek lze dalším tahem přesunout.
   *
   * Long-press už nepoužíváme. Na webu tím zároveň nevzniká konflikt
   * s nativní nabídkou Chrome (Google Lens / stáhnout obrázek...).
   */
  let oznacenyObrazekProPresun = null;
  let stisknutyObrazek = null;
  let stisknutyPointerId = null;
  let presouvanyObrazek = null;
  let presouvanyFigure = null;
  let presouvanyPointerId = null;
  let presunObrazkuAktivni = false;
  let cilPresunuObrazku = null;
  let puvodniPrazdnyRadekObrazku = null;
  let ukazatelPresunuObrazku = null;

  const IMAGE_DRAG_START_DISTANCE = 9;

  function ziskejBlokObrazku(image) {
    return image?.closest?.(".lubaNoteImage") || null;
  }

  function vytvorTlacitkoNastaveniObrazku() {
    const tlacitko = document.createElement("button");
    tlacitko.type = "button";
    tlacitko.className = "lubaNoteImageSettings";
    tlacitko.setAttribute(
      "aria-label",
      "Nastavení obrázku"
    );
    tlacitko.contentEditable = "false";
    return tlacitko;
  }

  function zajistiOvladaniObrazku(figure) {
    if (!figure) {
      return;
    }

    figure.contentEditable = "false";

    const image = figure.querySelector("img");

    if (image) {
      image.draggable = false;

      if (!image.hasAttribute("tabindex")) {
        image.setAttribute("tabindex", "-1");
      }
    }

    if (!figure.querySelector(".lubaNoteImageSettings")) {
      const tlacitkoNastaveni =
        vytvorTlacitkoNastaveniObrazku();

      const removeButton = figure.querySelector(
        ".lubaNoteImageRemove"
      );

      if (removeButton) {
        figure.insertBefore(
          tlacitkoNastaveni,
          removeButton
        );
      } else {
        figure.append(tlacitkoNastaveni);
      }
    }
  }

  function oznacObrazekProPresun(image) {
    if (!image) {
      oznacenyObrazekProPresun = null;
      selectedImage = null;
      return;
    }

    const figure = ziskejBlokObrazku(image);
    zajistiOvladaniObrazku(figure);

    oznacenyObrazekProPresun = image;
    selectedImage = image;

    /*
     * Focus používáme jen jako dočasný vizuální stav.
     * Nevkládáme do richContent žádnou pomocnou selected třídu,
     * takže se zvýraznění nikdy neuloží do poznámky.
     */
    if (!image.hasAttribute("tabindex")) {
      image.setAttribute("tabindex", "-1");
    }

    try {
      image.focus({ preventScroll: true });
    } catch (_) {
      image.focus();
    }
  }

  function zrusOznaceniObrazkuProPresun() {
    if (
      oznacenyObrazekProPresun &&
      document.activeElement ===
        oznacenyObrazekProPresun
    ) {
      oznacenyObrazekProPresun.blur();
    }

    oznacenyObrazekProPresun = null;
    selectedImage = null;
  }

  function jeObrazekOznacenyProPresun(image) {
    return Boolean(
      image &&
      oznacenyObrazekProPresun === image &&
      document.activeElement === image
    );
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

  function ziskejPrimehoPotomkaEditoru(element) {
    let aktualni = element;

    while (
      aktualni &&
      aktualni !== modalRichText &&
      aktualni.parentNode !== modalRichText
    ) {
      aktualni = aktualni.parentNode;
    }

    if (
      aktualni &&
      aktualni.parentNode === modalRichText
    ) {
      return aktualni;
    }

    return null;
  }

  function zajistiUkazatelPresunuObrazku() {
    if (ukazatelPresunuObrazku?.isConnected) {
      return ukazatelPresunuObrazku;
    }

    ukazatelPresunuObrazku =
      document.createElement("div");

    ukazatelPresunuObrazku.className =
      "lubaNoteImageDropIndicator";

    ukazatelPresunuObrazku.hidden = true;
    ukazatelPresunuObrazku.setAttribute(
      "aria-hidden",
      "true"
    );

    document.body.append(
      ukazatelPresunuObrazku
    );

    return ukazatelPresunuObrazku;
  }

  function schovejUkazatelPresunuObrazku() {
    if (ukazatelPresunuObrazku) {
      ukazatelPresunuObrazku.hidden = true;
    }
  }

  function urciZarovnaniPodlePozice(clientX) {
    const rect =
      modalRichText.getBoundingClientRect();

    if (!rect.width) {
      return "stred";
    }

    const pomer =
      (clientX - rect.left) / rect.width;

    if (pomer < 0.38) {
      return "vlevo";
    }

    if (pomer > 0.62) {
      return "vpravo";
    }

    return "stred";
  }

  function ziskejRozsahZBoduPresunu(
    clientX,
    clientY
  ) {
    let range = null;

    if (
      typeof document.caretRangeFromPoint ===
      "function"
    ) {
      range = document.caretRangeFromPoint(
        clientX,
        clientY
      );
    } else if (
      typeof document.caretPositionFromPoint ===
      "function"
    ) {
      const pozice =
        document.caretPositionFromPoint(
          clientX,
          clientY
        );

      if (pozice) {
        range = document.createRange();
        range.setStart(
          pozice.offsetNode,
          pozice.offset
        );
        range.collapse(true);
      }
    }

    if (!range || !jeRozsahVEditoru(range)) {
      return null;
    }

    const startElement =
      range.startContainer.nodeType === Node.TEXT_NODE
        ? range.startContainer.parentElement
        : range.startContainer;

    if (
      presouvanyFigure &&
      startElement &&
      presouvanyFigure.contains(startElement)
    ) {
      return null;
    }

    range.collapse(true);
    return range;
  }

  function ziskejRectUzluProPresun(uzel) {
    if (!uzel?.isConnected) {
      return null;
    }

    if (uzel.nodeType === Node.ELEMENT_NODE) {
      return uzel.getBoundingClientRect();
    }

    try {
      const range = document.createRange();
      range.selectNode(uzel);
      return range.getBoundingClientRect();
    } catch (_) {
      return null;
    }
  }

  function vytvorNahradniRozsahPresunu(clientY) {
    const range = document.createRange();

    const uzly = [
      ...modalRichText.childNodes
    ].filter((uzel) => uzel !== presouvanyFigure);

    if (uzly.length === 0) {
      range.selectNodeContents(modalRichText);
      range.collapse(false);
      return range;
    }

    for (const uzel of uzly) {
      const rect = ziskejRectUzluProPresun(uzel);

      if (!rect) {
        continue;
      }

      if (clientY < rect.top + rect.height / 2) {
        range.setStartBefore(uzel);
        range.collapse(true);
        return range;
      }
    }

    range.setStartAfter(uzly[uzly.length - 1]);
    range.collapse(true);
    return range;
  }

  function ziskejYProUkazatelPresunu(
    range,
    clientY
  ) {
    try {
      const rect = range?.getBoundingClientRect?.();

      if (
        rect &&
        Number.isFinite(rect.top) &&
        (rect.height > 0 || rect.width > 0)
      ) {
        return rect.bottom || rect.top;
      }
    } catch (_) {
      /* Některé prázdné caret pozice nemají vlastní rect. */
    }

    const editorRect =
      modalRichText.getBoundingClientRect();

    return Math.max(
      editorRect.top + 4,
      Math.min(clientY, editorRect.bottom - 4)
    );
  }

  function najdiCilPresunuObrazku(
    clientX,
    clientY
  ) {
    const range =
      ziskejRozsahZBoduPresunu(
        clientX,
        clientY
      ) || vytvorNahradniRozsahPresunu(clientY);

    return {
      range: range.cloneRange(),
      y: ziskejYProUkazatelPresunu(
        range,
        clientY
      )
    };
  }

  function maFragmentSkutecnyObsah(fragment) {
    if (!fragment) {
      return false;
    }

    if (fragment.textContent.trim() !== "") {
      return true;
    }

    return Boolean(
      fragment.querySelector?.(
        "img, figure, a[href], ul, ol, li, table"
      )
    );
  }

  function vlozFigureNaPresnouPozici(
    figure,
    range,
    clientY
  ) {
    if (!figure || !range || !jeRozsahVEditoru(range)) {
      modalRichText.append(figure);
      return;
    }

    const cilovyRange = range.cloneRange();
    cilovyRange.collapse(true);

    const primyUzel =
      ziskejPrimehoPotomkaEditoru(
        cilovyRange.startContainer
      );

    /* Caret leží přímo mezi kořenovými uzly editoru. */
    if (!primyUzel) {
      if (cilovyRange.startContainer === modalRichText) {
        const index = Math.min(
          cilovyRange.startOffset,
          modalRichText.childNodes.length
        );

        const pred = modalRichText.childNodes[index] || null;
        modalRichText.insertBefore(figure, pred);
        return;
      }

      modalRichText.append(figure);
      return;
    }

    if (primyUzel === figure) {
      return;
    }

    /* Přetažení přes jiný obrázek = před / za něj podle výšky prstu. */
    if (
      primyUzel.nodeType === Node.ELEMENT_NODE &&
      primyUzel.classList?.contains("lubaNoteImage")
    ) {
      const rect = primyUzel.getBoundingClientRect();

      if (clientY < rect.top + rect.height / 2) {
        primyUzel.before(figure);
      } else {
        primyUzel.after(figure);
      }
      return;
    }

    /* Prázdný řádek je skutečné připravené drop místo. */
    if (
      primyUzel.nodeType === Node.ELEMENT_NODE &&
      jePrazdnyRadekZaObrazkem(primyUzel)
    ) {
      primyUzel.before(figure);
      return;
    }

    /* Kořenový textový uzel umí Range rozdělit přímo. */
    if (primyUzel.nodeType === Node.TEXT_NODE) {
      cilovyRange.insertNode(figure);
      return;
    }

    if (primyUzel.nodeType !== Node.ELEMENT_NODE) {
      primyUzel.before?.(figure);
      return;
    }

    /*
     * Drop uvnitř odstavce / DIVu: rozdělíme blok přesně v caret pozici.
     * Obrázek se tak může vložit i doprostřed hotového textu, ne jen před
     * nebo za celý blok. Následující část textu pak může přirozeně obtékat
     * menší obrázek vlevo / vpravo.
     */
    try {
      const predRozsah = document.createRange();
      predRozsah.selectNodeContents(primyUzel);
      predRozsah.setEnd(
        cilovyRange.startContainer,
        cilovyRange.startOffset
      );

      const zaRozsah = document.createRange();
      zaRozsah.setStart(
        cilovyRange.startContainer,
        cilovyRange.startOffset
      );
      zaRozsah.setEnd(
        primyUzel,
        primyUzel.childNodes.length
      );

      const obsahPred = predRozsah.cloneContents();
      const obsahZa = zaRozsah.cloneContents();
      const maPred = maFragmentSkutecnyObsah(obsahPred);
      const maZa = maFragmentSkutecnyObsah(obsahZa);

      if (!maPred && maZa) {
        primyUzel.before(figure);
        return;
      }

      if (maPred && !maZa) {
        primyUzel.after(figure);
        return;
      }

      if (!maPred && !maZa) {
        primyUzel.before(figure);
        return;
      }

      const fragmentZa = zaRozsah.extractContents();
      const blokZa = primyUzel.cloneNode(false);

      /* ID nesmí být po rozdělení bloku duplicitní. */
      blokZa.removeAttribute?.("id");
      blokZa.append(fragmentZa);

      primyUzel.after(figure, blokZa);
    } catch (error) {
      console.warn(
        "Přesné vložení obrázku se nepodařilo, používám nejbližší pozici.",
        error
      );
      primyUzel.after(figure);
    }
  }

  function posunEditorPriPresunuObrazku(clientY) {
    const rect =
      modalRichText.getBoundingClientRect();

    const zona = 64;
    const maximalniKrok = 18;

    if (clientY < rect.top + zona) {
      const sila = Math.min(
        1,
        Math.max(
          0,
          (rect.top + zona - clientY) / zona
        )
      );

      modalRichText.scrollTop -=
        maximalniKrok * sila;
      return;
    }

    if (clientY > rect.bottom - zona) {
      const sila = Math.min(
        1,
        Math.max(
          0,
          (clientY - (rect.bottom - zona)) / zona
        )
      );

      modalRichText.scrollTop +=
        maximalniKrok * sila;
    }
  }

  function aktualizujUkazatelPresunuObrazku(
    clientX,
    clientY
  ) {
    cilPresunuObrazku =
      najdiCilPresunuObrazku(
        clientX,
        clientY
      );

    const marker =
      zajistiUkazatelPresunuObrazku();

    const editorRect =
      modalRichText.getBoundingClientRect();

    const odsazeni = 6;

    marker.style.left =
      `${Math.round(editorRect.left + odsazeni)}px`;

    marker.style.width =
      `${Math.max(
        20,
        Math.round(editorRect.width - odsazeni * 2)
      )}px`;

    marker.style.top =
      `${Math.round(cilPresunuObrazku.y)}px`;

    const relativniX = Math.max(
      0,
      Math.min(
        editorRect.width - odsazeni * 2,
        clientX - (editorRect.left + odsazeni)
      )
    );

    marker.style.setProperty(
      "--luba-note-drop-x",
      `${Math.round(relativniX)}px`
    );

    marker.hidden = false;
  }

  function spustPresunObrazku(
    event,
    image
  ) {
    const figure = ziskejBlokObrazku(image);

    if (
      !figure ||
      !jeObrazekOznacenyProPresun(image)
    ) {
      return false;
    }

    presouvanyObrazek = image;
    presouvanyFigure = figure;
    presouvanyPointerId = event.pointerId;
    presunObrazkuAktivni = true;
    cilPresunuObrazku = null;

    const dalsi = figure.nextElementSibling;

    puvodniPrazdnyRadekObrazku =
      jePrazdnyRadekZaObrazkem(dalsi)
        ? dalsi
        : null;

    figure.classList.add(
      "lubaNoteImageDragging"
    );

    modalRichText.classList.add(
      "lubaNoteImageDragMode"
    );

    try {
      image.setPointerCapture(event.pointerId);
    } catch (_) {
      /* Starší WebView nemusí pointer capture podporovat. */
    }

    aktualizujUkazatelPresunuObrazku(
      event.clientX,
      event.clientY
    );

    event.preventDefault();
    return true;
  }

  function zajistiRadekZaPoslednimObrazkem(
    figure
  ) {
    if (!figure?.isConnected) {
      return;
    }

    if (figure.nextSibling) {
      return;
    }

    figure.after(
      vytvorRadekProTextZaObrazkem()
    );
  }

  function uklidPuvodniPrazdnyRadek() {
    const radek = puvodniPrazdnyRadekObrazku;

    if (
      !radek?.isConnected ||
      !jePrazdnyRadekZaObrazkem(radek)
    ) {
      return;
    }

    const predchozi = radek.previousElementSibling;

    if (
      !predchozi?.classList?.contains(
        "lubaNoteImage"
      )
    ) {
      radek.remove();
    }
  }

  function provedPresunObrazku(event) {
    if (
      !presunObrazkuAktivni ||
      !presouvanyFigure
    ) {
      return;
    }

    const figure = presouvanyFigure;
    const image = presouvanyObrazek;
    const cil = cilPresunuObrazku;

    if (cil?.range) {
      vlozFigureNaPresnouPozici(
        figure,
        cil.range,
        event.clientY
      );
    } else {
      modalRichText.append(figure);
    }

    /*
     * Horizontální místo puštění určí obtékání. Vertikální místo je už
     * přesná caret pozice v textu. Obrázek zůstává součástí toku dokumentu
     * a nerozbije responzivitu mezi telefonem a PC.
     */
    nastavZarovnaniObrazku(
      image,
      figure,
      urciZarovnaniPodlePozice(
        event.clientX
      )
    );

    uklidPuvodniPrazdnyRadek();
    zajistiRadekZaPoslednimObrazkem(
      figure
    );

    /*
     * Záměrně NEVOLÁME modalRichText.normalize(). U contenteditable může
     * po přesunu média spojit textové uzly s rozdílným inline formátováním
     * a změnit tím velikost části textu.
     */
    oznamZmenuObrazku();
  }

  function ukonciPresunObrazku(
    event,
    ulozitPresun
  ) {
    if (!presunObrazkuAktivni) {
      return false;
    }

    if (
      presouvanyPointerId !== null &&
      event?.pointerId !== undefined &&
      event.pointerId !== presouvanyPointerId
    ) {
      return false;
    }

    if (ulozitPresun && event) {
      provedPresunObrazku(event);
    }

    presouvanyFigure?.classList.remove(
      "lubaNoteImageDragging"
    );

    modalRichText.classList.remove(
      "lubaNoteImageDragMode"
    );

    try {
      presouvanyObrazek?.releasePointerCapture?.(
        presouvanyPointerId
      );
    } catch (_) {
      /* Pointer capture už mohl být uvolněn systémem. */
    }

    schovejUkazatelPresunuObrazku();

    /* Po přesunu zůstane obrázek označený pro další doladění. */
    if (presouvanyObrazek?.isConnected) {
      oznacObrazekProPresun(
        presouvanyObrazek
      );
    }

    presouvanyObrazek = null;
    presouvanyFigure = null;
    presouvanyPointerId = null;
    presunObrazkuAktivni = false;
    cilPresunuObrazku = null;
    puvodniPrazdnyRadekObrazku = null;
    stisknutyObrazek = null;
    stisknutyPointerId = null;

    return true;
  }

  modalRichText.addEventListener(
    "pointerdown",
    (event) => {
      const obrazek = event.target.closest?.(
        ".lubaNoteImage img"
      );

      if (!obrazek) {
        stisknutyObrazek = null;
        stisknutyPointerId = null;
        return;
      }

      imagePressStartX = event.clientX;
      imagePressStartY = event.clientY;
      selectedImage = obrazek;
      stisknutyObrazek = obrazek;
      stisknutyPointerId = event.pointerId;
    }
  );

  modalRichText.addEventListener(
    "pointermove",
    (event) => {
      if (presunObrazkuAktivni) {
        posunEditorPriPresunuObrazku(
          event.clientY
        );

        aktualizujUkazatelPresunuObrazku(
          event.clientX,
          event.clientY
        );
        event.preventDefault();
        return;
      }

      if (
        !stisknutyObrazek ||
        stisknutyPointerId !== event.pointerId
      ) {
        return;
      }

      const distanceX = Math.abs(
        event.clientX - imagePressStartX
      );

      const distanceY = Math.abs(
        event.clientY - imagePressStartY
      );

      const vzdalenost = Math.hypot(
        distanceX,
        distanceY
      );

      if (
        vzdalenost < IMAGE_DRAG_START_DISTANCE
      ) {
        return;
      }

      /*
       * První tap jen označí obrázek. Drag se spustí až dalším gestem
       * na již označeném obrázku, takže běžný scroll přes neoznačené
       * médium zůstává přirozený.
       */
      if (
        !jeObrazekOznacenyProPresun(
          stisknutyObrazek
        )
      ) {
        return;
      }

      spustPresunObrazku(
        event,
        stisknutyObrazek
      );
    }
  );

  modalRichText.addEventListener(
    "pointerup",
    (event) => {
      if (ukonciPresunObrazku(event, true)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      stisknutyObrazek = null;
      stisknutyPointerId = null;
    }
  );

  modalRichText.addEventListener(
    "pointercancel",
    (event) => {
      ukonciPresunObrazku(event, false);
      stisknutyObrazek = null;
      stisknutyPointerId = null;
    }
  );

  /*
   * Zakážeme vestavěný HTML drag obrázku. Jinak může desktopový browser
   * místo našeho figure přesunu začít táhnout samotný <img> element.
   */
  modalRichText.addEventListener(
    "dragstart",
    (event) => {
      if (event.target.closest?.(".lubaNoteImage")) {
        event.preventDefault();
      }
    }
  );

  /*
   * Webová verze: Chrome na Androidu jinak po dlouhém stisku obrázku
   * otevře vlastní menu (Lens / kopírovat / stáhnout). V editoru máme
   * vlastní ovládání, takže nativní context menu potlačíme jen na obrázku.
   */
  modalRichText.addEventListener(
    "contextmenu",
    (event) => {
      if (event.target.closest?.(".lubaNoteImage")) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
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
  
  function nastavKurzorPodleBodu(clientX, clientY) {
    let range = null;

    if (
      typeof document.caretRangeFromPoint ===
      "function"
    ) {
      range = document.caretRangeFromPoint(
        clientX,
        clientY
      );
    } else if (
      typeof document.caretPositionFromPoint ===
      "function"
    ) {
      const pozice =
        document.caretPositionFromPoint(
          clientX,
          clientY
        );

      if (pozice) {
        range = document.createRange();
        range.setStart(
          pozice.offsetNode,
          pozice.offset
        );
        range.collapse(true);
      }
    }

    if (!range || !jeRozsahVEditoru(range)) {
      return false;
    }

    const selection = window.getSelection();

    if (!selection) {
      return false;
    }

    selection.removeAllRanges();
    selection.addRange(range);
    ulozenyRozsahEditoru = range.cloneRange();

    return true;
  }

  function najdiPlovouciObrazekVedleBodu(
    clientX,
    clientY
  ) {
    const editorRect =
      modalRichText.getBoundingClientRect();

    const obrazky = [
      ...modalRichText.children
    ].filter((uzel) =>
      uzel.classList?.contains(
        "lubaNoteImage"
      )
    );

    for (const figure of obrazky) {
      const image = figure.querySelector("img");

      if (!image) {
        continue;
      }

      const velikost =
        ziskejAktualniVelikostObrazku(
          image,
          figure
        );

      const zarovnani =
        ziskejAktualniZarovnaniObrazku(
          image,
          figure
        );

      const cisloVelikosti = Number(velikost);

      if (
        zarovnani === "stred" ||
        velikost === "prizpusobit" ||
        !Number.isFinite(cisloVelikosti) ||
        cisloVelikosti >= 100
      ) {
        continue;
      }

      const rect = figure.getBoundingClientRect();

      if (
        clientY < rect.top ||
        clientY > rect.bottom
      ) {
        continue;
      }

      if (
        zarovnani === "vlevo" &&
        clientX > rect.right + 3 &&
        clientX < editorRect.right
      ) {
        return figure;
      }

      if (
        zarovnani === "vpravo" &&
        clientX < rect.left - 3 &&
        clientX > editorRect.left
      ) {
        return figure;
      }
    }

    return null;
  }

  function zajistiRadekVedleObrazkuPodleBodu(
    clientX,
    clientY
  ) {
    const figure = najdiPlovouciObrazekVedleBodu(
      clientX,
      clientY
    );

    if (!figure) {
      return null;
    }

    const dalsi = figure.nextElementSibling;

    if (
      dalsi?.classList?.contains(
        "lubaNoteImageTextLine"
      )
    ) {
      return dalsi;
    }

    /*
     * Vizuálně volné místo vedle float obrázku samo o sobě není
     * kurzorová pozice. Vytvoříme proto skutečný editovatelný řádek
     * PŘED následujícím blokem (např. 100% obrázkem). Text pak
     * přirozeně obtéká vedle menšího obrázku a další blok zůstane pod.
     */
    const radek = vytvorRadekProTextZaObrazkem();
    figure.after(radek);
    oznamZmenuObrazku();

    return radek;
  }

  /*
   * Jeden klik obrázek označí. Teprve potom se ukážou ⚙ a ✕ a druhým
   * gestem lze obrázek přetáhnout. Kliknutí do prázdného místa vedle
   * menšího obrázku vytvoří / použije skutečný textový řádek.
   */
  modalRichText.addEventListener(
    "click",
    (event) => {
      if (presunObrazkuAktivni) {
        return;
      }

      const obrazek = event.target.closest?.(
        ".lubaNoteImage img"
      );

      if (obrazek) {
        event.preventDefault();
        oznacObrazekProPresun(obrazek);
        return;
      }

      /* Ovládací tlačítka si zpracují vlastní listener níže. */
      if (
        event.target.closest?.(
          ".lubaNoteImageSettings, .lubaNoteImageRemove"
        )
      ) {
        return;
      }

      zrusOznaceniObrazkuProPresun();

      if (event.target !== modalRichText) {
        return;
      }

      const radekVedle =
        zajistiRadekVedleObrazkuPodleBodu(
          event.clientX,
          event.clientY
        );

      if (radekVedle) {
        nastavKurzorDoRadku(radekVedle);
        return;
      }

      nastavKurzorPodleBodu(
        event.clientX,
        event.clientY
      );
    }
  );

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
  
  /* Pointerdown proběhne ještě před ztrátou výběru po klepnutí na toolbar. */
  rychlyToolbar?.addEventListener(
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

  /*
   * Obrázek je blok s contenteditable=false. Samotný kurzor nastavený
   * "za figure" není na některých Android WebView dostatečný a klávesnice
   * pak nemá skutečný editovatelný řádek, do kterého může psát.
   * Proto za obrázky držíme normální prázdný řádek s <br>.
   */
  function vytvorRadekProTextZaObrazkem() {
    const radek = document.createElement("div");
    radek.className = "lubaNoteImageTextLine";
    radek.append(document.createElement("br"));
    return radek;
  }

  function jePrazdnyRadekZaObrazkem(radek) {
    if (!radek?.classList?.contains("lubaNoteImageTextLine")) {
      return false;
    }

    return radek.textContent.trim() === "";
  }

  function najdiRadekZaObrazkemVRozsahu(range) {
    if (!range?.collapsed) {
      return null;
    }

    const startNode = range.startContainer;
    const startElement =
      startNode.nodeType === Node.ELEMENT_NODE
        ? startNode
        : startNode.parentElement;

    const radek = startElement?.closest?.(
      ".lubaNoteImageTextLine"
    );

    if (
      !radek ||
      !modalRichText.contains(radek) ||
      !jePrazdnyRadekZaObrazkem(radek)
    ) {
      return null;
    }

    return radek;
  }

  function nastavKurzorDoRadku(radek) {
    if (!radek?.isConnected) {
      return;
    }

    modalRichText.focus();

    const range = document.createRange();
    range.selectNodeContents(radek);
    range.collapse(true);

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    ulozenyRozsahEditoru = range.cloneRange();
  }

  function vlozObrazekDoEditoru(figure) {
    const range = ziskejPlatnyUlozenyRozsah();
    const existujiciRadek =
      najdiRadekZaObrazkemVRozsahu(range);

    modalRichText.focus();

    if (existujiciRadek) {
      /*
       * Typický případ druhého obrázku: kurzor stojí v prázdném řádku
       * vytvořeném za prvním obrázkem. Druhý figure vložíme PŘED tento
       * řádek, takže oba obrázky zůstanou sourozenci a 50/50 layout se
       * nerozbije. Řádek pak dál slouží pro psaní pod dvojicí.
       */
      existujiciRadek.before(figure);
      nastavKurzorDoRadku(existujiciRadek);
    } else {
      range.collapse(false);
      range.insertNode(figure);

      const radek = vytvorRadekProTextZaObrazkem();
      figure.after(radek);

      nastavKurzorDoRadku(radek);
    }

    /*
     * Android občas přepne focus během návratu z výběru souboru.
     * Ještě jednou po vykreslení potvrdíme kurzor v editovatelném řádku.
     */
    requestAnimationFrame(() => {
      const radek = figure.nextElementSibling;

      if (
        jePrazdnyRadekZaObrazkem(radek)
      ) {
        nastavKurzorDoRadku(radek);
      }
    });

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
    image.tabIndex = -1;
    image.dataset.velikost = "prizpusobit";
    image.dataset.zarovnani = "stred";
    
    
    const settingsButton =
      vytvorTlacitkoNastaveniObrazku();

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
      settingsButton,
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
      
      vlozObrazekDoEditoru(figure);
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
    const soubor =
      event.clipboardData?.files?.[0];

    if (soubor?.type.startsWith("image/")) {
      event.preventDefault();

      void vlozVybranyObrazek(soubor);
      return;
    }

    const html =
      event.clipboardData?.getData("text/html") || "";

    const text =
      event.clipboardData?.getData("text/plain") || "";

    if (!html && !text) {
      return;
    }

    event.preventDefault();

    /*
     * Text vložený do LubaNote nesmí přinést cizí velikost/font ani
     * zdědit velikost ze starého inline span-u v místě kurzoru.
     * Zachováváme významové formátování (B/I/U, odkazy, seznamy, barvy),
     * ale typografii velikosti necháváme řídit LubaNote.
     */
    if (html) {
      const docasnyObal =
        document.createElement("div");

      docasnyObal.innerHTML = html;

      docasnyObal
        .querySelectorAll("*")
        .forEach(prvek => {
          prvek.style.removeProperty("font");
          prvek.style.removeProperty("font-size");
          prvek.style.removeProperty("font-family");
          prvek.style.removeProperty("line-height");
          prvek.style.removeProperty("letter-spacing");

          prvek.removeAttribute("size");
          prvek.removeAttribute("face");
          prvek.removeAttribute("data-velikost-pisma");

          if (!prvek.getAttribute("style")?.trim()) {
            prvek.removeAttribute("style");
          }
        });

      /*
       * Kořenové uzly dostanou základní typografii LubaNote. Díky tomu
       * ani vložení dovnitř starého zvětšeného span-u nezvětší nový text.
       */
      [...docasnyObal.childNodes]
        .forEach(uzel => {
          if (uzel.nodeType === Node.TEXT_NODE) {
            if (!uzel.textContent) {
              return;
            }

            const span =
              document.createElement("span");

            span.className =
              "lubaNoteVlozenyText";

            uzel.replaceWith(span);
            span.append(uzel);
            return;
          }

          if (uzel instanceof HTMLElement) {
            uzel.classList.add(
              "lubaNoteVlozenyText"
            );
          }
        });

      document.execCommand(
        "insertHTML",
        false,
        docasnyObal.innerHTML
      );

      return;
    }

    /*
     * Android / některé schránky poskytují jen text/plain. I ten vložíme
     * přes neutrální span, jinak by execCommand/default paste mohl zdědit
     * velikost písma z místa, kde právě stojí kurzor.
     */
    const vyber =
      window.getSelection();

    if (!vyber || vyber.rangeCount === 0) {
      return;
    }

    const rozsah =
      vyber.getRangeAt(0);

    rozsah.deleteContents();

    const vlozenyText =
      document.createElement("span");

    vlozenyText.className =
      "lubaNoteVlozenyText";

    vlozenyText.textContent = text;

    rozsah.insertNode(vlozenyText);
    rozsah.setStartAfter(vlozenyText);
    rozsah.collapse(true);

    vyber.removeAllRanges();
    vyber.addRange(rozsah);

    modalRichText.dispatchEvent(
      new Event("input", { bubbles: true })
    );
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
     VKLÁDÁNÍ MÉDIÍ Z TOOLBARU
  ========================================== */

  window.vlozObrazekDoPoznamky = () => {
    if (jeTodoRezimAktivni()) {
      zobrazMediaZpravu(
        "Vkládání do textu poznámky",
        "Obrázek nebo internetový odkaz vlož do běžného textu poznámky. TODO řádky zůstávají samostatné úkoly."
      );
      return;
    }

    imageInput.click();
  };

  window.vlozOdkazDoPoznamky = () => {
    if (jeTodoRezimAktivni()) {
      zobrazMediaZpravu(
        "Vkládání do textu poznámky",
        "Obrázek nebo internetový odkaz vlož do běžného textu poznámky. TODO řádky zůstávají samostatné úkoly."
      );
      return;
    }

    otevriLinkModal();
  };

  /* ==========================================
     BACKSPACE NA ZAČÁTKU ŘÁDKU

     Android WebView / Chromium může při Backspace na začátku textového
     bloku sloučit blok s předchozím a současně převzít jeho inline
     typografii (např. 20 px). To se projevovalo přesně tak, že po
     odstranění prázdné mezery text náhle zvětšil velikost i line-height.

     Když je těsně před aktuálním textem opravdu jen prázdný editovatelný
     blok (<div><br></div>, prázdný řádek za obrázkem apod.), odstraníme
     pouze tento prázdný blok sami. Aktuální textový blok se vůbec
     neslučuje, takže si zachová svoji velikost a další formátování.
  ========================================== */

  function jePrazdnyEditacniBlok(uzel) {
    if (!uzel) {
      return false;
    }

    if (uzel.nodeType === Node.TEXT_NODE) {
      return uzel.textContent
        .replace(/\u200B/g, "")
        .trim() === "";
    }

    if (!(uzel instanceof HTMLElement)) {
      return false;
    }

    if (
      uzel.matches(
        ".lubaNoteImage, img, a[href], ul, ol, li, table"
      ) ||
      uzel.querySelector(
        ".lubaNoteImage, img, a[href], ul, ol, li, table"
      )
    ) {
      return false;
    }

    return uzel.textContent
      .replace(/\u200B/g, "")
      .trim() === "";
  }

  function jeKurzorNaZacatkuBloku(range, blok) {
    if (!range?.collapsed || !blok) {
      return false;
    }

    try {
      const predKurzorem = document.createRange();
      predKurzorem.selectNodeContents(blok);
      predKurzorem.setEnd(
        range.startContainer,
        range.startOffset
      );

      const fragment =
        predKurzorem.cloneContents();

      if (
        fragment.textContent
          .replace(/\u200B/g, "")
          .trim() !== ""
      ) {
        return false;
      }

      return !fragment.querySelector?.(
        ".lubaNoteImage, img, a[href], ul, ol, li, table"
      );
    } catch (_) {
      return false;
    }
  }

  function najdiPredchoziObsahovyUzel(uzel) {
    let predchozi = uzel?.previousSibling || null;

    while (
      predchozi?.nodeType === Node.TEXT_NODE &&
      predchozi.textContent.trim() === ""
    ) {
      predchozi = predchozi.previousSibling;
    }

    return predchozi;
  }

  /*
   * Android někdy při druhém Backspace na hranici text ↔ obrázek
   * vytvoří Range jinak, než očekává běžná bloková logika. Proto
   * kontrolujeme i SKUTEČNÝ DOM uzel bezprostředně před caretem.
   *
   * První Backspace může normálně odstranit <br> / prázdný řádek.
   * Jakmile je ale přímo před caretem contenteditable=false figure,
   * další Backspace zastavíme. Obrázek má vlastní tlačítko ✕.
   */
  function najdiUzelTesnePredKurzorem(range) {
    if (!range?.collapsed) {
      return null;
    }

    let uzel = range.startContainer;
    const offset = range.startOffset;

    if (uzel.nodeType === Node.TEXT_NODE) {
      /* Uvnitř textu nejsme na mediální hranici. */
      if (offset > 0) {
        return null;
      }
    } else if (uzel.nodeType === Node.ELEMENT_NODE) {
      if (offset > 0) {
        return uzel.childNodes[offset - 1] || null;
      }
    }

    while (uzel && uzel !== modalRichText) {
      if (uzel.previousSibling) {
        return uzel.previousSibling;
      }

      uzel = uzel.parentNode;
    }

    return null;
  }

  function jeUzelObrazkovaHranice(uzel) {
    if (!uzel) {
      return false;
    }

    if (uzel.nodeType === Node.TEXT_NODE) {
      return false;
    }

    if (!(uzel instanceof Element)) {
      return false;
    }

    return Boolean(
      uzel.matches?.(".lubaNoteImage") ||
      uzel.closest?.(".lubaNoteImage") ||
      uzel.querySelector?.(":scope > .lubaNoteImage")
    );
  }

  function zablokujBackspacePresObrazek(event) {
    const vyber = window.getSelection();

    if (!vyber || vyber.rangeCount === 0) {
      return false;
    }

    const range = vyber.getRangeAt(0);

    if (
      !range.collapsed ||
      !jeRozsahVEditoru(range)
    ) {
      return false;
    }

    const uzelPredKurzorem =
      najdiUzelTesnePredKurzorem(range);

    if (!jeUzelObrazkovaHranice(uzelPredKurzorem)) {
      return false;
    }

    event.preventDefault();
    event.stopPropagation?.();

    const zachovanyRange = range.cloneRange();

    requestAnimationFrame(() => {
      if (!zachovanyRange.startContainer?.isConnected) {
        return;
      }

      const aktualniVyber = window.getSelection();
      aktualniVyber?.removeAllRanges();
      aktualniVyber?.addRange(zachovanyRange);
      ulozenyRozsahEditoru = zachovanyRange.cloneRange();
    });

    return true;
  }

  /* Desktop / HW klávesnice. Na Androidu je hlavní pojistka beforeinput níže. */
  modalRichText.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Backspace") {
        zablokujBackspacePresObrazek(event);
      }
    },
    true
  );

  modalRichText.addEventListener(
    "beforeinput",
    (event) => {
      if (
        !String(event.inputType || "").startsWith("delete") ||
        event.isComposing
      ) {
        return;
      }

      /*
       * Nejdřív zkusíme přímou DOM hranici. Tohle pokrývá i Android
       * WebView případy, kdy caret neleží v očekávaném přímém bloku.
       */
      if (zablokujBackspacePresObrazek(event)) {
        return;
      }

      const vyber = window.getSelection();

      if (
        !vyber ||
        vyber.rangeCount === 0
      ) {
        return;
      }

      const range = vyber.getRangeAt(0);

      if (
        !range.collapsed ||
        !jeRozsahVEditoru(range)
      ) {
        return;
      }

      const aktualniBlok =
        ziskejPrimehoPotomkaEditoru(
          range.startContainer
        );

      if (
        !aktualniBlok ||
        aktualniBlok.classList?.contains(
          "lubaNoteImage"
        ) ||
        !jeKurzorNaZacatkuBloku(
          range,
          aktualniBlok
        )
      ) {
        return;
      }

      const predchoziBlok =
        najdiPredchoziObsahovyUzel(
          aktualniBlok
        );

      /*
       * 1) Před textem je skutečný prázdný řádek.
       *    Odstraníme jen ten a nenecháme WebView slučovat bloky.
       */
      if (jePrazdnyEditacniBlok(predchoziBlok)) {
        event.preventDefault();

        const zachovanyRange =
          range.cloneRange();

        predchoziBlok.remove();

        if (
          zachovanyRange.startContainer?.isConnected
        ) {
          vyber.removeAllRanges();
          vyber.addRange(zachovanyRange);
          ulozenyRozsahEditoru =
            zachovanyRange.cloneRange();
        }

        modalRichText.dispatchEvent(
          new Event("input", { bubbles: true })
        );
        return;
      }

      /*
       * 2) Před textem už je přímo obrázek.
       *
       * Druhý Backspace na této hranici už nemá žádný prázdný text,
       * který by mohl bezpečně smazat. Chromium by se proto pokusilo
       * spojit textový blok přes contenteditable=false <figure> a na
       * Androidu při tom dokázalo převzít cizí font-size / line-height
       * (typicky skok 16 -> 20 px).
       *
       * Obrázek se maže vlastním tlačítkem X, takže Backspace přes tuto
       * mediální hranici záměrně zastavíme a zachováme kurzor i styl.
       */
      if (
        predchoziBlok instanceof HTMLElement &&
        predchoziBlok.classList.contains(
          "lubaNoteImage"
        )
      ) {
        event.preventDefault();

        const zachovanyRange =
          range.cloneRange();

        if (
          zachovanyRange.startContainer?.isConnected
        ) {
          vyber.removeAllRanges();
          vyber.addRange(zachovanyRange);
          ulozenyRozsahEditoru =
            zachovanyRange.cloneRange();
        }
      }
    }
  );

  /* ==========================================
     AKCE NAD ULOŽENÝM OBRÁZKEM / ODKAZEM
  ========================================== */
  
  modalRichText.addEventListener(
    "click",
    (event) => {
      const settingsButton =
        event.target.closest?.(
          ".lubaNoteImageSettings"
        );

      if (settingsButton) {
        event.preventDefault();
        event.stopPropagation();

        const figure = settingsButton.closest(
          ".lubaNoteImage"
        );
        const image = figure?.querySelector("img");

        if (image) {
          oznacObrazekProPresun(image);
          otevriNastaveniObrazku(image);
        }
        return;
      }

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

        if (
          figure &&
          ziskejBlokObrazku(
            oznacenyObrazekProPresun
          ) === figure
        ) {
          zrusOznaceniObrazkuProPresun();
        }
        
        /*
         * Při smazání obrázku odstraňujeme pouze samotný figure.
         * modalRichText.normalize() zde záměrně NEVOLÁME:
         * v contenteditable může po zásahu do média změnit hranice
         * textových uzlů a WebView pak někdy převezme sousední
         * inline formátování (např. jinou velikost písma).
         */
        figure?.remove();
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