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

  /*
   * Odkaz může nově vzniknout nejen v hlavním rich-text editoru,
   * ale i v právě editovaném TODO. Range si musíme uložit ještě
   * před otevřením modalu, protože focus následně přejde do polí
   * „Text odkazu“ / „Internetová adresa“.
   */
  let cilovyEditorOdkazu = null;
  let ulozenyRozsahOdkazu = null;
  
  const imageInput = document.createElement("input");
  imageInput.type = "file";
  imageInput.accept = "image/*";
  imageInput.hidden = true;
  imageInput.setAttribute("aria-hidden", "true");
  document.body.append(imageInput);

  /*
   * Samostatný input pro fotoaparát. `capture=environment` požádá Android
   * WebView o zadní kameru, ale fotografie pak projde úplně stejnou
   * kompresí a vkládáním jako obrázek vybraný z galerie.
   * Nevyžaduje druhý systém práce s obrázky ani nový formát poznámky.
   */
  const cameraInput = document.createElement("input");
  cameraInput.type = "file";
  cameraInput.accept = "image/*";
  cameraInput.setAttribute("capture", "environment");
  cameraInput.hidden = true;
  cameraInput.setAttribute("aria-hidden", "true");
  document.body.append(cameraInput);
  
  
  
  
  
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
   * Obrázek má dvě ZCELA ODDĚLENÁ gesta:
   *
   * 1. krátký tap = zapnout / vypnout ovládání obrázku,
   * 2. dlouhý stisk + stále držený prst = přesun obrázku.
   *
   * Přesun se nikdy nesmí odvozovat od toho, zda je obrázek právě
   * označený. Tím zůstává běžný scroll přes obrázek přirozený a tap
   * na ovládání nemůže omylem přejít do drag režimu.
   */
  let oznacenyObrazekProPresun = null;

  let presouvanyObrazek = null;
  let presouvanyFigure = null;
  let presouvanyPointerId = null;
  let presunObrazkuAktivni = false;
  let cilPresunuObrazku = null;
  let puvodniPrazdnyRadekObrazku = null;
  let ukazatelPresunuObrazku = null;

  /* Velikost obrázku je vždy relativní procento šířky editoru. */

  /* Fullscreen viewer v kódu zůstává, ale na obrázek už není navázaný
   * žádný dvojtap. Uživatel chce druhý tap použít pro odznačení. */
  let nahledObrazku = null;

  /*
   * Dlouhý stisk funguje stejným principem jako přesun TODO:
   * - před vypršením času se pohyb bere jako normální scroll,
   * - po vypršení času se ukáže značka přesunu,
   * - dokud prst / tlačítko zůstává dole, lze obrázek přesouvat,
   * - po puštění přesun okamžitě končí.
   */
  const DELKA_DLOUHEHO_STISKU_OBRAZKU = 650;
  const VZDALENOST_ZRUSENI_DLOUHEHO_STISKU = 20;
  const VZDALENOST_START_PRESUNU_OBRAZKU = 6;

  let casovacDlouhehoStiskuObrazku = null;
  let cekajiciTypPresunuObrazku = null;
  let cekajiciObrazek = null;
  let cekajiciPointerId = null;
  let cekajiciTouchId = null;
  let zacatekStiskuObrazkuX = 0;
  let zacatekStiskuObrazkuY = 0;
  let presunObrazkuPripraven = false;
  let scrollTopPredPresunemObrazku = 0;
  let potlacKlikObrazkuDo = 0;
  let napovedaPresunuObrazku = null;

  /*
   * Automatický posun editoru během SKUTEČNÉHO drag & drop.
   *
   * Důležité:
   * - před long-pressem zůstává běžný nativní scroll,
   * - po long-pressu a zahájení přesunu blokujeme nativní scroll,
   * - pokud držíme obrázek u horního / dolního okraje editoru,
   *   posouváme obsah pouze řízeně přes scrollTop.
   *
   * Tím lze obrázek přenést i k textu mimo právě viditelnou část,
   * aniž by se zároveň pral nativní Android scroll s drag gestem.
   */
  let posledniXPresunuObrazku = null;
  let posledniYPresunuObrazku = null;
  let animaceAutoScrollObrazku = null;

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

    window.LubaNoteIcons?.nastavJenIkonu?.(
      tlacitko,
      "nastaveni",
      ["editorImageControlSvgIcon"]
    );

    return tlacitko;
  }

  function zajistiOvladaniObrazku(figure) {
    if (!figure) {
      return;
    }

    figure.contentEditable = "false";
    obnovPreferovanouSirkuObrazku(figure);

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
      oznacenyObrazekProPresun === image
    );
  }

  /*
   * JEDINÁ velikost obrázku pro všechna zařízení.
   *
   * Ukládáme pouze relativní hodnotu v procentech do data-velikost.
   * To znamená například:
   * - 25 % = čtvrtina šířky editoru na PC i v APK,
   * - 50 % = polovina šířky editoru na PC i v APK,
   * - 100 % / "prizpusobit" = celá šířka aktuálního editoru.
   *
   * Neexistuje samostatná PC a mobilní velikost. Staré dočasné
   * data-velikost-mobil z předchozího patche pouze migrujeme jako
   * fallback, pokud by data-velikost úplně chybělo, a pak ho odstraníme.
   */
  function ziskejJednotnouVelikostObrazku(
    image,
    figure
  ) {
    const kandidati = [
      figure?.dataset?.velikost,
      image?.dataset?.velikost
    ];

    for (const hodnota of kandidati) {
      if (hodnota === "prizpusobit") {
        return "prizpusobit";
      }

      const cislo = Number(hodnota);
      if (
        Number.isFinite(cislo) &&
        cislo >= 10 &&
        cislo <= 100
      ) {
        return String(cislo);
      }
    }

    /*
     * Jednorázová kompatibilita s V2/V3: pokud by standardní hodnota
     * chyběla, vezmeme starou mobilní hodnotu jako společnou. Jakmile
     * se obrázek aplikuje, data-velikost-mobil se odstraní.
     */
    const stareMobilniHodnoty = [
      figure?.dataset?.velikostMobil,
      image?.dataset?.velikostMobil
    ];

    for (const hodnota of stareMobilniHodnoty) {
      if (hodnota === "prizpusobit") {
        return "prizpusobit";
      }

      const cislo = Number(hodnota);
      if (
        Number.isFinite(cislo) &&
        cislo >= 10 &&
        cislo <= 100
      ) {
        return String(cislo);
      }
    }

    /* Kompatibilita s velmi starými poznámkami pouze s inline width. */
    const inlineSirka = String(
      figure?.style?.width || ""
    ).trim();

    let procenta = inlineSirka.match(
      /^(\d+(?:\.\d+)?)%$/
    );

    if (!procenta) {
      procenta = inlineSirka.match(
        /^calc\((\d+(?:\.\d+)?)%\s*-/
      );
    }

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

    return "prizpusobit";
  }

  function aplikujAktualniVelikostObrazku(
    image,
    figure
  ) {
    if (!image || !figure) {
      return;
    }

    const velikost =
      ziskejJednotnouVelikostObrazku(
        image,
        figure
      );

    /*
     * data-velikost je jediný zdroj pravdy pro PC, web i APK.
     * Zároveň uklidíme dočasná mobilní/pixelová metadata z V1–V3,
     * aby už nikdy nemohla přebít relativní procentní velikost.
     */
    figure.dataset.velikost = velikost;
    image.dataset.velikost = velikost;

    delete figure.dataset.velikostMobil;
    delete image.dataset.velikostMobil;
    delete figure.dataset.sirkaPx;
    delete image.dataset.sirkaPx;

    figure.style.removeProperty(
      "--luba-note-image-sirka-mobil"
    );
    figure.style.removeProperty(
      "--luba-note-image-sirka-px"
    );

    const zarovnani =
      figure.dataset.zarovnani ||
      image.dataset.zarovnani ||
      "stred";

    const jePlnaSirka =
      velikost === "prizpusobit" ||
      Number(velikost) >= 100;

    let sirka = jePlnaSirka
      ? "100%"
      : `${Number(velikost)}%`;

    /* Dva 50% plovoucí obrázky se vejdou vedle sebe i s mezerou. */
    if (
      !jePlnaSirka &&
      Number(velikost) === 50 &&
      (zarovnani === "vlevo" ||
        zarovnani === "vpravo")
    ) {
      sirka = "calc(50% - 4px)";
    }

    /*
     * Inline !important drží stejné procento i v Android WebView.
     * Hodnota je ale pořád relativní k šířce AKTUÁLNÍHO editoru,
     * nikoli k pixelům konkrétního zařízení.
     */
    figure.style.setProperty(
      "width",
      sirka,
      "important"
    );
    figure.style.setProperty(
      "max-width",
      "100%",
      "important"
    );

    if (jePlnaSirka) {
      figure.style.setProperty(
        "float",
        "none",
        "important"
      );
      figure.style.setProperty("clear", "both");
      figure.style.setProperty(
        "margin",
        "14px auto",
        "important"
      );
      return;
    }

    if (zarovnani === "vlevo") {
      figure.style.setProperty(
        "float",
        "left",
        "important"
      );
      figure.style.setProperty("clear", "none");
      figure.style.setProperty(
        "margin",
        "2px 4px 6px 0",
        "important"
      );
      return;
    }

    if (zarovnani === "vpravo") {
      figure.style.setProperty(
        "float",
        "right",
        "important"
      );
      figure.style.setProperty("clear", "none");
      figure.style.setProperty(
        "margin",
        "2px 0 6px 4px",
        "important"
      );
      return;
    }

    figure.style.setProperty(
      "float",
      "none",
      "important"
    );
    figure.style.setProperty("clear", "both");
    figure.style.setProperty(
      "margin",
      "14px auto",
      "important"
    );
  }

  /*
   * Starý název funkce ponecháváme kvůli kompatibilitě s existujícími
   * voláními. Pixelovou šířku už neukládá – pouze znovu aplikuje
   * společnou procentní velikost.
   */
  function ulozPreferovanouSirkuObrazku(
    image,
    figure
  ) {
    aplikujAktualniVelikostObrazku(
      image,
      figure
    );
  }

  function obnovPreferovanouSirkuObrazku(figure) {
    if (!figure) {
      return;
    }

    const image = figure.querySelector("img");

    if (!image) {
      return;
    }

    aplikujAktualniVelikostObrazku(
      image,
      figure
    );
  }

  function ziskejAktualniVelikostObrazku(image, figure) {
    return ziskejJednotnouVelikostObrazku(
      image,
      figure
    );
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

    /*
     * Zarovnání i šířku nastavíme jedním společným výpočtem.
     * Je tak stejné v PC, SPCK i nativním Android WebView.
     */
    aplikujAktualniVelikostObrazku(
      image,
      figure
    );
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
      figure.dataset.velikost = "prizpusobit";
      image.dataset.velikost = "prizpusobit";

      /* Dočasné oddělené mobilní nastavení z V2/V3 rušíme. */
      delete figure.dataset.velikostMobil;
      delete image.dataset.velikostMobil;

      aplikujAktualniVelikostObrazku(
        image,
        figure
      );
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

    /*
     * Jedna společná relativní hodnota. 50 % znamená polovinu editoru
     * na PC, ve SPCK i v APK – bez jakéhokoli dalšího nastavování.
     */
    figure.dataset.velikost = String(cislo);
    image.dataset.velikost = String(cislo);

    delete figure.dataset.velikostMobil;
    delete image.dataset.velikostMobil;

    aplikujAktualniVelikostObrazku(
      image,
      figure
    );

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
        /*
         * Nastavení patří přesně obrázku, pro který byl modal otevřen.
         * Nepoužíváme zde proměnnou selectedImage – ta slouží hlavně
         * pro výběr/přesun a Android může její stav během práce s
         * překryvným modalem změnit společně s focusem.
         */
        if (!image.isConnected || !figure.isConnected) {
          return;
        }

        const velikostNastavena =
          nastavVelikostObrazku(
            image,
            figure,
            hodnoty.velikost
          );

        if (!velikostNastavena) {
          return;
        }

        nastavZarovnaniObrazku(
          image,
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

  function ziskejKrokAutoScrollObrazku(clientY) {
    const rect =
      modalRichText.getBoundingClientRect();

    /*
     * Okrajová zóna je dost velká pro prst na mobilu, ale nezasahuje
     * zbytečně hluboko do textu. Rychlost roste směrem k okraji.
     */
    const zona = Math.min(
      86,
      Math.max(58, rect.height * 0.16)
    );
    const maximalniKrok = 16;

    if (clientY < rect.top + zona) {
      const sila = Math.min(
        1,
        Math.max(
          0,
          (rect.top + zona - clientY) / zona
        )
      );

      return -maximalniKrok * sila;
    }

    if (clientY > rect.bottom - zona) {
      const sila = Math.min(
        1,
        Math.max(
          0,
          (clientY - (rect.bottom - zona)) / zona
        )
      );

      return maximalniKrok * sila;
    }

    return 0;
  }

  function zastavAutoScrollObrazku() {
    if (animaceAutoScrollObrazku !== null) {
      cancelAnimationFrame(
        animaceAutoScrollObrazku
      );
    }

    animaceAutoScrollObrazku = null;
    posledniXPresunuObrazku = null;
    posledniYPresunuObrazku = null;
  }

  function provedKrokAutoScrollObrazku() {
    animaceAutoScrollObrazku = null;

    if (
      !presunObrazkuAktivni ||
      posledniXPresunuObrazku === null ||
      posledniYPresunuObrazku === null
    ) {
      return;
    }

    const krok =
      ziskejKrokAutoScrollObrazku(
        posledniYPresunuObrazku
      );

    if (Math.abs(krok) < 0.2) {
      return;
    }

    const pred =
      modalRichText.scrollTop;

    const maximum = Math.max(
      0,
      modalRichText.scrollHeight -
        modalRichText.clientHeight
    );

    modalRichText.scrollTop = Math.max(
      0,
      Math.min(
        maximum,
        pred + krok
      )
    );

    const po =
      modalRichText.scrollTop;

    if (Math.abs(po - pred) < 0.1) {
      /*
       * Jsme na začátku / konci dokumentu. Další frame nemá smysl,
       * ale při novém pohybu prstu / myši se může auto-scroll znovu
       * spustit opačným směrem.
       */
      return;
    }

    /*
     * Po posunu obsahu se pod stejným bodem prstu nachází jiný text.
     * Proto cíl přesunu přepočítáme i bez dalšího pointermove/touchmove.
     */
    aktualizujUkazatelPresunuObrazku(
      posledniXPresunuObrazku,
      posledniYPresunuObrazku
    );

    animaceAutoScrollObrazku =
      requestAnimationFrame(
        provedKrokAutoScrollObrazku
      );
  }

  function posunEditorPriPresunuObrazku(
    clientX,
    clientY
  ) {
    if (!presunObrazkuAktivni) {
      zastavAutoScrollObrazku();
      return;
    }

    posledniXPresunuObrazku = clientX;
    posledniYPresunuObrazku = clientY;

    const krok =
      ziskejKrokAutoScrollObrazku(clientY);

    if (Math.abs(krok) < 0.2) {
      if (animaceAutoScrollObrazku !== null) {
        cancelAnimationFrame(
          animaceAutoScrollObrazku
        );
        animaceAutoScrollObrazku = null;
      }
      return;
    }

    if (animaceAutoScrollObrazku === null) {
      animaceAutoScrollObrazku =
        requestAnimationFrame(
          provedKrokAutoScrollObrazku
        );
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

    /*
     * Dlouhý stisk je sám o sobě oprávnění k přesunu. Obrázek nemusí
     * být předem označený jedním tapem – výběr pro ⚙ / ✕ a drag jsou
     * dvě nezávislé funkce.
     */
    if (!figure) {
      return false;
    }

    /*
     * Obrázek vložený do bulletu je příloha konkrétní položky.
     * Samotný bullet se už spolehlivě přesouvá jako celek, takže
     * obrázek uvnitř něj nepovolujeme vytáhnout mimo <li>.
     * Velikost, zarovnání i odstranění obrázku zůstávají dostupné
     * přes běžné ovládání obrázku.
     */
    if (figure.closest("li")) {
      return false;
    }

    presouvanyObrazek = image;
    presouvanyFigure = figure;
    presouvanyPointerId =
      event?.pointerId ?? null;
    presunObrazkuAktivni = true;
    cilPresunuObrazku = null;
    zastavAutoScrollObrazku();

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

    if (presouvanyPointerId !== null) {
      try {
        image.setPointerCapture(
          presouvanyPointerId
        );
      } catch (_) {
        /* Starší WebView nemusí pointer capture podporovat. */
      }
    }

    aktualizujUkazatelPresunuObrazku(
      event.clientX,
      event.clientY
    );

    event.preventDefault?.();
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

    /*
     * Nejdřív zastavíme řízený posun editoru, aby už po puštění
     * nemohl doběhnout další animation frame.
     */
    zastavAutoScrollObrazku();

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

    if (presouvanyPointerId !== null) {
      try {
        presouvanyObrazek?.releasePointerCapture?.(
          presouvanyPointerId
        );
      } catch (_) {
        /* Pointer capture už mohl být uvolněn systémem. */
      }
    }

    schovejUkazatelPresunuObrazku();
    schovejNapoveduPresunuObrazku();

    /*
     * Výběr obrázku pro ⚙ / ✕ záměrně NEMĚNÍME. Long-press je čistě
     * přesunové gesto a po puštění má zůstat přesně takový výběr, jaký
     * byl před začátkem přesunu.
     */

    presouvanyObrazek = null;
    presouvanyFigure = null;
    presouvanyPointerId = null;
    presunObrazkuAktivni = false;
    cilPresunuObrazku = null;
    puvodniPrazdnyRadekObrazku = null;

    return true;
  }

  function zrusCasovacDlouhehoStiskuObrazku() {
    if (casovacDlouhehoStiskuObrazku !== null) {
      clearTimeout(casovacDlouhehoStiskuObrazku);
    }

    casovacDlouhehoStiskuObrazku = null;
  }

  function zajistiNapoveduPresunuObrazku() {
    if (napovedaPresunuObrazku?.isConnected) {
      return napovedaPresunuObrazku;
    }

    napovedaPresunuObrazku =
      document.createElement("div");

    napovedaPresunuObrazku.className =
      "lubaNoteImageMoveHint";
    napovedaPresunuObrazku.textContent = "↕";
    napovedaPresunuObrazku.hidden = true;
    napovedaPresunuObrazku.setAttribute(
      "aria-hidden",
      "true"
    );

    document.body.append(
      napovedaPresunuObrazku
    );

    return napovedaPresunuObrazku;
  }

  function zobrazNapoveduPresunuObrazku(
    clientX,
    clientY,
    typPresunu = cekajiciTypPresunuObrazku
  ) {
    const napoveda =
      zajistiNapoveduPresunuObrazku();

    const jeDotyk =
      typPresunu === "touch";

    /*
     * Mobil / tablet:
     * - značka je vodorovně přesně nad středem prstu,
     * - je posunutá o 65 px nahoru, aby ji prst nezakrýval.
     *
     * PC / myš / pero:
     * - střed značky je přesně v bodě kliknutí / držení.
     */
    napoveda.style.left =
      `${Math.round(clientX)}px`;
    napoveda.style.top =
      `${Math.round(
        jeDotyk
          ? clientY - 65
          : clientY
      )}px`;
    napoveda.style.transform =
      "translate(-50%, -50%)";
    napoveda.hidden = false;
  }

  function schovejNapoveduPresunuObrazku() {
    if (napovedaPresunuObrazku) {
      napovedaPresunuObrazku.hidden = true;
    }
  }

  function odemkniScrollPoPresunuObrazku() {
    modalRichText.classList.remove(
      "lubaNoteImageMoveReady"
    );
  }

  function vycistiCekajiciPresunObrazku() {
    zrusCasovacDlouhehoStiskuObrazku();
    odemkniScrollPoPresunuObrazku();
    schovejNapoveduPresunuObrazku();

    cekajiciTypPresunuObrazku = null;
    cekajiciObrazek = null;
    cekajiciPointerId = null;
    cekajiciTouchId = null;
    presunObrazkuPripraven = false;
  }

  function pripravDlouhyStiskObrazku(
    typ,
    obrazek,
    clientX,
    clientY,
    pointerId = null,
    touchId = null
  ) {
    vycistiCekajiciPresunObrazku();

    cekajiciTypPresunuObrazku = typ;
    cekajiciObrazek = obrazek;
    cekajiciPointerId = pointerId;
    cekajiciTouchId = touchId;
    zacatekStiskuObrazkuX = clientX;
    zacatekStiskuObrazkuY = clientY;
    presunObrazkuPripraven = false;

    casovacDlouhehoStiskuObrazku =
      setTimeout(() => {
        casovacDlouhehoStiskuObrazku = null;

        if (
          !cekajiciObrazek?.isConnected ||
          cekajiciObrazek !== obrazek
        ) {
          vycistiCekajiciPresunObrazku();
          return;
        }

        /*
         * Teprve TADY přechází gesto ze scrollu do MOVE MODE.
         * Do tohoto okamžiku jsme nevolali preventDefault(), takže
         * rychlý tah přes obrázek zůstává normálním scrollováním APK.
         */
        presunObrazkuPripraven = true;
        scrollTopPredPresunemObrazku =
          modalRichText.scrollTop;

        modalRichText.classList.add(
          "lubaNoteImageMoveReady"
        );

        zobrazNapoveduPresunuObrazku(
          clientX,
          clientY
        );
      }, DELKA_DLOUHEHO_STISKU_OBRAZKU);
  }

  function vzdalenostOdZacatkuObrazku(
    clientX,
    clientY
  ) {
    return Math.hypot(
      clientX - zacatekStiskuObrazkuX,
      clientY - zacatekStiskuObrazkuY
    );
  }

  /* ---------- APK / DOTYK ---------- */

  function najdiSledovanyDotykObrazku(
    seznamDotyku
  ) {
    if (cekajiciTouchId === null) {
      return null;
    }

    return [...seznamDotyku].find(
      dotyk =>
        dotyk.identifier === cekajiciTouchId
    ) || null;
  }

  function odeberTouchListeneryObrazku() {
    document.removeEventListener(
      "touchmove",
      zpracujPohybDotykuObrazku
    );
    document.removeEventListener(
      "touchend",
      zpracujKonecDotykuObrazku
    );
    document.removeEventListener(
      "touchcancel",
      zpracujZruseniDotykuObrazku
    );
  }

  function zpracujPohybDotykuObrazku(event) {
    if (cekajiciTypPresunuObrazku !== "touch") {
      return;
    }

    const dotyk = najdiSledovanyDotykObrazku(
      event.touches
    );

    if (!dotyk) {
      return;
    }

    const vzdalenost =
      vzdalenostOdZacatkuObrazku(
        dotyk.clientX,
        dotyk.clientY
      );

    if (!presunObrazkuPripraven) {
      /* Pohyb před long-pressem = běžný scroll, ne přesun. */
      if (
        vzdalenost >
        VZDALENOST_ZRUSENI_DLOUHEHO_STISKU
      ) {
        vycistiCekajiciPresunObrazku();
        odeberTouchListeneryObrazku();
      }

      return;
    }

    /*
     * Long-press už proběhl. Od tohoto okamžiku pohyb patří jen obrázku.
     * Zároveň držíme scrollTop na stejné hodnotě jako pojistku proti
     * Android WebView – obsah editoru se při dragování nesmí rozjet.
     */
    event.preventDefault();

    /*
     * Dokud se drag skutečně nerozběhl, držíme scroll na místě.
     * Jakmile je obrázek v MOVE režimu, nativní scroll je stále
     * blokovaný, ale okrajový auto-scroll už smí měnit scrollTop.
     */
    if (!presunObrazkuAktivni) {
      modalRichText.scrollTop =
        scrollTopPredPresunemObrazku;
    }

    zobrazNapoveduPresunuObrazku(
      dotyk.clientX,
      dotyk.clientY
    );

    if (!presunObrazkuAktivni) {
      if (
        vzdalenost <
        VZDALENOST_START_PRESUNU_OBRAZKU
      ) {
        return;
      }

      spustPresunObrazku(
        {
          clientX: dotyk.clientX,
          clientY: dotyk.clientY,
          pointerId: null,
          preventDefault() {}
        },
        cekajiciObrazek
      );
    }

    if (presunObrazkuAktivni) {
      aktualizujUkazatelPresunuObrazku(
        dotyk.clientX,
        dotyk.clientY
      );

      posunEditorPriPresunuObrazku(
        dotyk.clientX,
        dotyk.clientY
      );
    }
  }

  function zpracujKonecDotykuObrazku(event) {
    if (cekajiciTypPresunuObrazku !== "touch") {
      return;
    }

    const dotyk = najdiSledovanyDotykObrazku(
      event.changedTouches
    );

    if (!dotyk) {
      return;
    }

    if (presunObrazkuAktivni) {
      event.preventDefault();
      ukonciPresunObrazku(
        {
          clientX: dotyk.clientX,
          clientY: dotyk.clientY
        },
        true
      );
      potlacKlikObrazkuDo =
        performance.now() + 650;
    } else if (presunObrazkuPripraven) {
      /* Long-press bez pohybu nic nepřesune a nesmí vyvolat tap. */
      event.preventDefault();
      potlacKlikObrazkuDo =
        performance.now() + 650;
    }

    vycistiCekajiciPresunObrazku();
    odeberTouchListeneryObrazku();
  }

  function zpracujZruseniDotykuObrazku() {
    if (presunObrazkuAktivni) {
      ukonciPresunObrazku(null, false);
    }

    vycistiCekajiciPresunObrazku();
    odeberTouchListeneryObrazku();
  }

  modalRichText.addEventListener(
    "touchstart",
    (event) => {
      if (event.touches.length !== 1) {
        return;
      }

      const obrazek = event.target.closest?.(
        ".lubaNoteImage img"
      );

      if (!obrazek) {
        return;
      }

      /* Obrázek uvnitř bulletu se přesouvá jen spolu s celým bulletem. */
      if (ziskejBlokObrazku(obrazek)?.closest("li")) {
        return;
      }

      const dotyk = event.touches[0];

      pripravDlouhyStiskObrazku(
        "touch",
        obrazek,
        dotyk.clientX,
        dotyk.clientY,
        null,
        dotyk.identifier
      );

      document.addEventListener(
        "touchmove",
        zpracujPohybDotykuObrazku,
        { passive: false }
      );
      document.addEventListener(
        "touchend",
        zpracujKonecDotykuObrazku,
        { passive: false }
      );
      document.addEventListener(
        "touchcancel",
        zpracujZruseniDotykuObrazku,
        { passive: false }
      );
    },
    { passive: false }
  );

  /* ---------- PC / MYŠ / PERO ---------- */

  function odeberPointerListeneryObrazku() {
    document.removeEventListener(
      "pointermove",
      zpracujPohybPointeruObrazku
    );
    document.removeEventListener(
      "pointerup",
      zpracujKonecPointeruObrazku
    );
    document.removeEventListener(
      "pointercancel",
      zpracujZruseniPointeruObrazku
    );
  }

  function zpracujPohybPointeruObrazku(event) {
    if (
      cekajiciTypPresunuObrazku !== "pointer" ||
      cekajiciPointerId !== event.pointerId
    ) {
      return;
    }

    const vzdalenost =
      vzdalenostOdZacatkuObrazku(
        event.clientX,
        event.clientY
      );

    if (!presunObrazkuPripraven) {
      if (
        vzdalenost >
        VZDALENOST_ZRUSENI_DLOUHEHO_STISKU
      ) {
        vycistiCekajiciPresunObrazku();
        odeberPointerListeneryObrazku();
      }

      return;
    }

    event.preventDefault();

    if (!presunObrazkuAktivni) {
      modalRichText.scrollTop =
        scrollTopPredPresunemObrazku;
    }

    zobrazNapoveduPresunuObrazku(
      event.clientX,
      event.clientY
    );

    if (!presunObrazkuAktivni) {
      if (
        vzdalenost <
        VZDALENOST_START_PRESUNU_OBRAZKU
      ) {
        return;
      }

      spustPresunObrazku(
        event,
        cekajiciObrazek
      );
    }

    if (presunObrazkuAktivni) {
      aktualizujUkazatelPresunuObrazku(
        event.clientX,
        event.clientY
      );

      posunEditorPriPresunuObrazku(
        event.clientX,
        event.clientY
      );
    }
  }

  function zpracujKonecPointeruObrazku(event) {
    if (
      cekajiciTypPresunuObrazku !== "pointer" ||
      cekajiciPointerId !== event.pointerId
    ) {
      return;
    }

    if (presunObrazkuAktivni) {
      event.preventDefault();
      ukonciPresunObrazku(event, true);
      potlacKlikObrazkuDo =
        performance.now() + 650;
    } else if (presunObrazkuPripraven) {
      event.preventDefault();
      potlacKlikObrazkuDo =
        performance.now() + 650;
    }

    vycistiCekajiciPresunObrazku();
    odeberPointerListeneryObrazku();
  }

  function zpracujZruseniPointeruObrazku(event) {
    if (
      cekajiciTypPresunuObrazku !== "pointer" ||
      cekajiciPointerId !== event.pointerId
    ) {
      return;
    }

    if (presunObrazkuAktivni) {
      ukonciPresunObrazku(event, false);
    }

    vycistiCekajiciPresunObrazku();
    odeberPointerListeneryObrazku();
  }

  modalRichText.addEventListener(
    "pointerdown",
    (event) => {
      /* Dotyk má vlastní Touch Events větev výše. */
      if (event.pointerType === "touch") {
        return;
      }

      if (
        event.pointerType === "mouse" &&
        event.button !== 0
      ) {
        return;
      }

      const obrazek = event.target.closest?.(
        ".lubaNoteImage img"
      );

      if (!obrazek) {
        return;
      }

      /* Obrázek uvnitř bulletu se přesouvá jen spolu s celým bulletem. */
      if (ziskejBlokObrazku(obrazek)?.closest("li")) {
        return;
      }

      pripravDlouhyStiskObrazku(
        "pointer",
        obrazek,
        event.clientX,
        event.clientY,
        event.pointerId,
        null
      );

      document.addEventListener(
        "pointermove",
        zpracujPohybPointeruObrazku
      );
      document.addEventListener(
        "pointerup",
        zpracujKonecPointeruObrazku
      );
      document.addEventListener(
        "pointercancel",
        zpracujZruseniPointeruObrazku
      );
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

  function zavriNahledObrazku() {
    if (!nahledObrazku) {
      return;
    }

    nahledObrazku.remove();
    nahledObrazku = null;
    document.body.classList.remove(
      "lubaNoteImagePreviewOpen"
    );
  }

  function otevriNahledObrazku(image) {
    if (!image?.src) {
      return;
    }

    zavriNahledObrazku();

    const overlay = document.createElement("div");
    overlay.className = "lubaNoteImagePreview";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute(
      "aria-label",
      "Náhled obrázku"
    );

    const nahled = document.createElement("img");
    nahled.className = "lubaNoteImagePreviewImg";
    nahled.src = image.currentSrc || image.src;
    nahled.alt = image.alt || "Obrázek v poznámce";
    nahled.draggable = false;

    const zavrit = document.createElement("button");
    zavrit.type = "button";
    zavrit.className = "lubaNoteImagePreviewClose";
    zavrit.setAttribute("aria-label", "Zavřít náhled");
    zavrit.textContent = "×";

    overlay.append(nahled, zavrit);
    document.body.append(overlay);
    document.body.classList.add(
      "lubaNoteImagePreviewOpen"
    );
    nahledObrazku = overlay;

    zavrit.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      zavriNahledObrazku();
    });

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        zavriNahledObrazku();
      }
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && nahledObrazku) {
      event.preventDefault();
      zavriNahledObrazku();
    }
  });

  /*
   * Tap je přepínač ovládání obrázku:
   * - 1. tap = označit + zobrazit ⚙ / ✕,
   * - 2. tap na stejný obrázek = odznačit.
   *
   * Žádný dvojtap na obrázku nepoužíváme. Přesun je samostatné gesto
   * dlouhý stisk + držení + pohyb.
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

        if (
          performance.now() < potlacKlikObrazkuDo
        ) {
          return;
        }

        if (jeObrazekOznacenyProPresun(obrazek)) {
          zrusOznaceniObrazkuProPresun();
        } else {
          oznacObrazekProPresun(obrazek);
        }

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

  function ziskejElementProBulletZUzelu(uzel) {
    if (!uzel) {
      return null;
    }

    return uzel.nodeType === Node.ELEMENT_NODE
      ? uzel
      : uzel.parentElement;
  }

  function ziskejBulletProRozsah(range) {
    if (!range || !jeRozsahVEditoru(range)) {
      return null;
    }

    const startElement =
      ziskejElementProBulletZUzelu(
        range.startContainer
      );

    const endElement =
      ziskejElementProBulletZUzelu(
        range.endContainer
      );

    const startBullet =
      startElement?.closest?.("li") || null;

    const endBullet =
      endElement?.closest?.("li") || null;

    if (
      !startBullet ||
      startBullet !== endBullet ||
      !modalRichText.contains(startBullet)
    ) {
      return null;
    }

    return startBullet;
  }

  function ziskejPrimyVnorenySeznam(bullet) {
    if (!bullet) {
      return null;
    }

    return Array.from(bullet.children).find(
      (prvek) =>
        prvek.tagName === "UL" ||
        prvek.tagName === "OL"
    ) || null;
  }

  function vlozObrazekDoBulletu(figure, bullet) {
    if (!figure || !bullet) {
      return false;
    }

    /*
     * Obrázek patří k celé položce bulletu. Vkládáme ho proto jako
     * přímého potomka <li>, nikdy dovnitř <span>/<b>/<a>. Tím zůstane
     * HTML seznamu stabilní i po změně formátování textu.
     *
     * Případný vnořený <ul> držíme vždy až ZA obrázkem a textovým
     * řádkem. Při přesunu bulletu se tak obrázek i všechny děti
     * přenesou společně s rodičovskou položkou.
     */
    figure.dataset.bulletMedia = "true";

    const vnorenySeznam =
      ziskejPrimyVnorenySeznam(bullet);

    const prazdnyRadek =
      Array.from(bullet.children).find(
        (prvek) =>
          jePrazdnyRadekZaObrazkem(prvek) &&
          prvek.dataset.bulletMediaLine === "true"
      ) || null;

    if (prazdnyRadek) {
      bullet.insertBefore(figure, prazdnyRadek);
      nastavKurzorDoRadku(prazdnyRadek);
    } else {
      const radek =
        vytvorRadekProTextZaObrazkem();

      radek.classList.add(
        "lubaNoteBulletImageTextLine"
      );
      radek.dataset.bulletMediaLine = "true";

      if (vnorenySeznam) {
        bullet.insertBefore(figure, vnorenySeznam);
        bullet.insertBefore(radek, vnorenySeznam);
      } else {
        bullet.append(figure, radek);
      }

      nastavKurzorDoRadku(radek);
    }

    requestAnimationFrame(() => {
      const radek =
        Array.from(bullet.children).find(
          (prvek) =>
            prvek.dataset?.bulletMediaLine ===
              "true"
        );

      if (radek) {
        nastavKurzorDoRadku(radek);
      }
    });

    modalRichText.dispatchEvent(
      new Event("input", { bubbles: true })
    );

    return true;
  }

  function jeEditorPredPrvnimObrazkemPrazdny() {
    return Boolean(
      modalRichText.textContent.trim() === "" &&
      !modalRichText.querySelector(".lubaNoteImage")
    );
  }

  function zachovejNazevPoPrvnimObrazku(figure) {
    const zachovej = () => {
      window.LubaNoteEditorUI
        ?.zachovejViditelnyNazev?.(900);
    };

    zachovej();

    const image = figure?.querySelector("img");

    /*
     * Data-URL obrázek se v Android WebView může dopočítat až po
     * vložení do DOM. Jeho pozdní změna výšky umí znovu posunout
     * scroll editoru, proto ochranu názvu obnovíme i po načtení média.
     */
    if (image && !image.complete) {
      image.addEventListener(
        "load",
        zachovej,
        { once: true }
      );
    }
  }

  function vlozObrazekDoEditoru(figure) {
    const editorBylPredVlozenimPrazdny =
      jeEditorPredPrvnimObrazkemPrazdny();

    if (editorBylPredVlozenimPrazdny) {
      zachovejNazevPoPrvnimObrazku(figure);
    }

    const range = ziskejPlatnyUlozenyRozsah();

    const bullet =
      ziskejBulletProRozsah(range);

    if (bullet) {
      vlozObrazekDoBulletu(figure, bullet);
      return;
    }

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

      if (editorBylPredVlozenimPrazdny) {
        window.LubaNoteEditorUI
          ?.zachovejViditelnyNazev?.(900);
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

    window.LubaNoteIcons?.nastavJenIkonu?.(
      removeButton,
      "zavrit",
      ["editorImageControlSvgIcon"]
    );
    
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
      /* Stejný soubor lze díky resetu vybrat / vyfotit znovu. */
      imageInput.value = "";
      cameraInput.value = "";
    }
  }
  
  imageInput.addEventListener("change", () => {
    const file = imageInput.files?.[0] || null;
    void vlozVybranyObrazek(file);
  });

  cameraInput.addEventListener("change", () => {
    const file = cameraInput.files?.[0] || null;
    void vlozVybranyObrazek(file);
  });
  
  /* ==========================================
     VKLÁDÁNÍ ZE SCHRÁNKY – VŽDY ČISTÝ TEXT
     ========================================== */

  function ziskejProstyTextZeSchranky(event) {
    const schrankka = event.clipboardData;

    if (!schrankka) {
      return "";
    }

    const prostyText =
      schrankka.getData("text/plain") || "";

    if (prostyText) {
      return prostyText;
    }

    /*
     * Některé WebView / weby dodají jen text/html.
     * HTML nikdy nevkládáme – použijeme z něj pouze viditelný text.
     */
    const html =
      schrankka.getData("text/html") || "";

    if (!html) {
      return "";
    }

    const docasnyObal =
      document.createElement("div");

    docasnyObal.innerHTML = html;

    return (
      docasnyObal.innerText ||
      docasnyObal.textContent ||
      ""
    );
  }

  function vlozProstyTextDoEditoru(editor, text) {
    if (!editor || typeof text !== "string") {
      return false;
    }

    const vyber = window.getSelection();

    if (!vyber || vyber.rangeCount === 0) {
      return false;
    }

    const rozsah = vyber.getRangeAt(0);
    const spolecnyUzel = rozsah.commonAncestorContainer;

    if (
      spolecnyUzel !== editor &&
      !editor.contains(spolecnyUzel)
    ) {
      return false;
    }

    rozsah.deleteContents();

    const vlozenyText =
      document.createElement("span");

    vlozenyText.className =
      "lubaNoteVlozenyText";

    /*
     * Pokud má celé TODO vlastní zvýraznění, zachováme ho.
     * Jinak čistý vložený text používá pozadí aktuálního editoru.
     * Tím se překryje i případné staré zvýraznění nadřazeného span-u.
     */
    const vlastniPozadiEditoru =
      editor.style?.backgroundColor || "";

    vlozenyText.style.setProperty(
      "--luba-vlozeny-text-pozadi",
      vlastniPozadiEditoru ||
      "var(--color-editor-background)"
    );

    const radky =
      text.replace(/\r\n?/g, "\n").split("\n");

    radky.forEach((radek, index) => {
      if (index > 0) {
        vlozenyText.append(
          document.createElement("br")
        );
      }

      vlozenyText.append(
        document.createTextNode(radek)
      );
    });

    rozsah.insertNode(vlozenyText);
    rozsah.setStartAfter(vlozenyText);
    rozsah.collapse(true);

    vyber.removeAllRanges();
    vyber.addRange(rozsah);

    editor.dispatchEvent(
      new Event("input", { bubbles: true })
    );

    return true;
  }

  modalRichText.addEventListener("paste", (event) => {
    const soubor =
      event.clipboardData?.files?.[0];

    /*
     * Obrázky vložené přímo ze schránky zůstávají podporované.
     * Text / HTML ale vždy pokračuje jako čistý text níže.
     */
    if (soubor?.type.startsWith("image/")) {
      event.preventDefault();

      void vlozVybranyObrazek(soubor);
      return;
    }

    const text =
      ziskejProstyTextZeSchranky(event);

    if (!text) {
      return;
    }

    event.preventDefault();
    vlozProstyTextDoEditoru(modalRichText, text);
  });

  /*
   * TODO rich-text editory vznikají dynamicky až při vykreslení položek,
   * proto jejich paste zachytáváme delegovaně na documentu.
   */
  document.addEventListener("paste", (event) => {
    const cil = event.target;

    if (!(cil instanceof Element)) {
      return;
    }

    const todoEditor =
      cil.closest(".todoRichTextInput");

    if (!todoEditor) {
      return;
    }

    const text =
      ziskejProstyTextZeSchranky(event);

    /*
     * TODO nepodporuje obrázky ze schránky. Pokud schránka obsahuje
     * jen obrázek / jiná netextová data, nenecháme WebView vložit HTML.
     */
    event.preventDefault();

    if (!text) {
      return;
    }

    vlozProstyTextDoEditoru(todoEditor, text);
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
  
  function jeRozsahVKonkretnimEditoru(range, editor) {
    if (!range || !editor?.isConnected) {
      return false;
    }

    const jeUzelUvnit = (node) => {
      const element =
        node?.nodeType === Node.TEXT_NODE
          ? node.parentElement
          : node;

      return Boolean(
        element &&
        (element === editor || editor.contains(element))
      );
    };

    return (
      jeUzelUvnit(range.startContainer) &&
      jeUzelUvnit(range.endContainer)
    );
  }

  function ziskejAktivniTodoEditorProOdkaz() {
    return document.querySelector(
      ".todoRichTextInput.todoEditing"
    );
  }

  function pripravCilOdkazu() {
    const todoEditor =
      ziskejAktivniTodoEditorProOdkaz();

    if (todoEditor) {
      const vyber = window.getSelection();
      let range = null;

      if (vyber?.rangeCount > 0) {
        const kandidat = vyber.getRangeAt(0);

        if (
          jeRozsahVKonkretnimEditoru(
            kandidat,
            todoEditor
          )
        ) {
          range = kandidat.cloneRange();
        }
      }

      /*
       * Když uživatel nic neoznačil, vloží se odkaz na konec
       * právě editovaného TODO. To odpovídá fallbacku hlavního
       * editoru a hlavně nikdy neskočí do jiné poznámky.
       */
      if (!range) {
        range = document.createRange();
        range.selectNodeContents(todoEditor);
        range.collapse(false);
      }

      cilovyEditorOdkazu = todoEditor;
      ulozenyRozsahOdkazu = range;
      return;
    }

    cilovyEditorOdkazu = modalRichText;
    ulozenyRozsahOdkazu =
      ziskejPlatnyUlozenyRozsah();
  }

  function ziskejRozsahOdkazu() {
    if (
      cilovyEditorOdkazu &&
      ulozenyRozsahOdkazu &&
      jeRozsahVKonkretnimEditoru(
        ulozenyRozsahOdkazu,
        cilovyEditorOdkazu
      )
    ) {
      return ulozenyRozsahOdkazu.cloneRange();
    }

    cilovyEditorOdkazu = modalRichText;
    ulozenyRozsahOdkazu =
      ziskejPlatnyUlozenyRozsah();

    return ulozenyRozsahOdkazu.cloneRange();
  }

  function ziskejTextAktualnihoVyberu() {
    const range = ziskejRozsahOdkazu();
    
    if (range.collapsed) {
      return "";
    }
    
    return range.toString().trim();
  }

  function vlozOdkazDoTodoEditoru(
    anchor,
    { nahradVyber = false } = {}
  ) {
    const editor = cilovyEditorOdkazu;
    const range = ziskejRozsahOdkazu();

    if (
      !editor?.matches?.(
        ".todoRichTextInput"
      ) ||
      !jeRozsahVKonkretnimEditoru(
        range,
        editor
      )
    ) {
      return false;
    }

    if (nahradVyber && !range.collapsed) {
      range.deleteContents();
    } else {
      range.collapse(false);
    }

    range.insertNode(anchor);

    /* Mezera za odkazem usnadní pokračování v psaní. */
    const mezera = document.createTextNode(" ");
    anchor.after(mezera);

    editor.normalize();

    /*
     * TODO input listener okamžitě synchronizuje text + HTML
     * do activeTodos a překreslí čtecí podobu řádku.
     */
    editor.dispatchEvent(
      new Event("input", { bubbles: true })
    );

    return true;
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

    if (window.LubaNoteIcons?.nastavObsahSIkonou) {
      window.LubaNoteIcons.nastavObsahSIkonou(
        title,
        "odkaz",
        "Internetový odkaz",
        ["editorLinkTitleIcon"]
      );
    } else {
      title.textContent = "Internetový odkaz";
    }
    
    const textLabel = document.createElement("label");
    textLabel.textContent = "Text odkazu";
    
    linkTextInput = document.createElement("textarea");
    linkTextInput.rows = 1;
    linkTextInput.placeholder =
      "např. OpenAI";
    linkTextInput.autocomplete = "one-time-code";
    linkTextInput.setAttribute("data-form-type", "other");
    linkTextInput.setAttribute("data-lpignore", "true");
    linkTextInput.setAttribute("data-1p-ignore", "true");
    linkTextInput.setAttribute("data-bwignore", "true");
    
    textLabel.append(linkTextInput);
    
    const urlLabel = document.createElement("label");
    urlLabel.textContent = "Internetová adresa";
    
    linkUrlInput = document.createElement("textarea");
    linkUrlInput.rows = 1;
    linkUrlInput.placeholder =
      "https://example.com";
    linkUrlInput.autocomplete = "one-time-code";
    linkUrlInput.inputMode = "url";
    linkUrlInput.setAttribute("data-form-type", "other");
    linkUrlInput.setAttribute("data-lpignore", "true");
    linkUrlInput.setAttribute("data-1p-ignore", "true");
    linkUrlInput.setAttribute("data-bwignore", "true");
    
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
    saveButton.className = "primary lubaHasIcon";

    if (window.LubaNoteIcons?.nastavObsahSIkonou) {
      window.LubaNoteIcons.nastavObsahSIkonou(
        saveButton,
        "odkaz",
        "Vložit",
        ["editorLinkActionIcon"]
      );
    } else {
      saveButton.textContent = "Vložit";
    }
    
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
      
      const jeTodoOdkaz = Boolean(
        cilovyEditorOdkazu?.matches?.(
          ".todoRichTextInput"
        )
      );

      if (jeTodoOdkaz) {
        const vlozeno = vlozOdkazDoTodoEditoru(
          anchor,
          {
            nahradVyber: Boolean(vybranyText)
          }
        );

        if (!vlozeno) {
          zobrazMediaZpravu(
            "Odkaz se nepodařilo vložit",
            "Zkus znovu otevřít TODO položku a označit text."
          );
          return;
        }
      } else {
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
      }
      
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
    
    linkTextInput.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          linkUrlInput.focus();
        }
      }
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
    /*
     * Cíl a Range ukládáme ještě před tím, než modal převezme focus.
     * Funguje tedy stejně označený text i pouhý kurzor.
     */
    pripravCilOdkazu();
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

  function otevriGaleriiObrazku() {
    imageInput.value = "";
    imageInput.click();
  }

  function otevriFotoaparatObrazku() {
    cameraInput.value = "";
    cameraInput.click();
  }

  function otevriVyberZdrojeObrazku() {
    if (jeTodoRezimAktivni()) {
      zobrazMediaZpravu(
        "Vkládání do textu poznámky",
        "Obrázek nebo internetový odkaz vlož do běžného textu poznámky. TODO řádky zůstávají samostatné úkoly."
      );
      return;
    }

    /*
     * Jeden vstup v toolbaru, dvě přirozené cesty. V obou případech se
     * použije stejný editorMedia pipeline: komprese -> figure -> drag -> sync.
     */
    if (typeof window.otevriVyberovyModal === "function") {
      window.otevriVyberovyModal({
        nadpis: "Vložit obrázek",
        moznosti: [
          {
            hodnota: "galerie",
            popisek: "Galerie",
            ikona: "obrazek"
          },
          {
            hodnota: "fotoaparat",
            popisek: "Fotoaparát",
            ikona: "fotoaparat"
          }
        ],
        poVyberu: (hodnota) => {
          if (hodnota === "fotoaparat") {
            otevriFotoaparatObrazku();
            return;
          }

          otevriGaleriiObrazku();
        }
      });
      return;
    }

    /* Bez choiceModal.js zůstane bezpečný původní fallback. */
    otevriGaleriiObrazku();
  }

  window.vlozObrazekDoPoznamky =
    otevriVyberZdrojeObrazku;

  window.vlozOdkazDoPoznamky = () => {
    /*
     * Odkazy jsou povolené i v TODO. Obrázky zůstávají nadále
     * omezené na hlavní text poznámky.
     */
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
   * BACKSPACE U OBRÁZKU – OPRAVA ANDROID WEBVIEW TYPOGRAFIE
   *
   * Diagnostika ukázala přesnou příčinu zvětšování textu:
   * Android WebView při nativním spojení bloků vytvoří kolem textu nový
   * anonymní <span> a zapíše do něj už ZVĚTŠENOU vykreslenou hodnotu,
   * například font-size: 16.25px. WebView pak na tento inline údaj znovu
   * aplikuje systémové zvětšení textu (např. 125 %), takže výsledkem je
   * 20.3125px.
   *
   * Záměrná velikost nastavená toolbar-em LubaNote je vždy označena
   * data-velikost-pisma. Proto po nativním delete/backspace odstraníme
   * pouze typografické inline vlastnosti z anonymního SPANu přímo kolem
   * kurzoru, pokud takové označení nemá. Barvy, B/I/U, odkazy a ostatní
   * významové formátování tím zůstávají nedotčené.
   */

  function opravWebViewTypografiiUKurzoru() {
    const vyber = window.getSelection();

    if (
      !vyber ||
      vyber.rangeCount === 0 ||
      !jeRozsahVEditoru(vyber.getRangeAt(0))
    ) {
      return false;
    }

    let prvek = vyber.anchorNode;

    if (prvek?.nodeType === Node.TEXT_NODE) {
      prvek = prvek.parentElement;
    }

    let necoOpraveno = false;

    while (
      prvek instanceof HTMLElement &&
      prvek !== modalRichText
    ) {
      if (
        prvek.tagName === "SPAN" &&
        !prvek.hasAttribute("data-velikost-pisma")
      ) {
        const maPodezrelouTypografii =
          Boolean(prvek.style.fontSize) ||
          Boolean(prvek.style.lineHeight) ||
          Boolean(prvek.style.letterSpacing) ||
          prvek.style.fontFamily === "inherit";

        if (maPodezrelouTypografii) {
          prvek.style.removeProperty("font-size");
          prvek.style.removeProperty("line-height");
          prvek.style.removeProperty("letter-spacing");

          if (prvek.style.fontFamily === "inherit") {
            prvek.style.removeProperty("font-family");
          }

          if (
            prvek.style.backgroundColor === "transparent" ||
            prvek.style.backgroundColor === "rgba(0, 0, 0, 0)"
          ) {
            prvek.style.removeProperty("background-color");
          }

          if (!prvek.getAttribute("style")?.trim()) {
            prvek.removeAttribute("style");
          }

          necoOpraveno = true;
        }
      }

      prvek = prvek.parentElement;
    }

    return necoOpraveno;
  }

  /*
   * PO nativním Backspace/Delete necháme WebView normálně spojit bloky,
   * ale ještě v capture fázi odstraníme jeho uměle vytvořenou typografii.
   */
  modalRichText.addEventListener(
    "input",
    (event) => {
      const typVstupu = String(event.inputType || "");

      if (
        !typVstupu.startsWith("delete") ||
        event.isComposing
      ) {
        return;
      }

      if (!opravWebViewTypografiiUKurzoru()) {
        return;
      }

      requestAnimationFrame(() => {
        document.dispatchEvent(
          new Event("selectionchange")
        );
      });
    },
    true
  );

  /*
   * První Backspace na začátku textového bloku dál řešíme sami pouze
   * tehdy, když je před ním SKUTEČNĚ prázdný editovatelný řádek.
   * Druhý Backspace už nijak neblokujeme – nativní spojení proběhne a
   * výše uvedená oprava odstraní jen WebView-em vložený font-size.
   */
  modalRichText.addEventListener(
    "beforeinput",
    (event) => {
      const typVstupu = String(event.inputType || "");

      if (
        !typVstupu.includes("Backward") ||
        event.isComposing
      ) {
        return;
      }

      const vyber = window.getSelection();

      if (!vyber || vyber.rangeCount === 0) {
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

      if (!jePrazdnyEditacniBlok(predchoziBlok)) {
        return;
      }

      event.preventDefault();

      const zachovanyRange = range.cloneRange();
      predchoziBlok.remove();

      if (zachovanyRange.startContainer?.isConnected) {
        vyber.removeAllRanges();
        vyber.addRange(zachovanyRange);
        ulozenyRozsahEditoru =
          zachovanyRange.cloneRange();
      }

      modalRichText.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          inputType: "deleteContentBackward"
        })
      );
    },
    true
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
  
  
  /*
   * Rich-content se při otevření poznámky vkládá přes innerHTML.
   * Observer proto doplní responzivní šířku i starším uloženým
   * obrázkům, aniž bychom museli měnit formát celé poznámky.
   */
  const observerObrazku = new MutationObserver((zmeny) => {
    for (const zmena of zmeny) {
      for (const uzel of zmena.addedNodes) {
        if (!(uzel instanceof Element)) {
          continue;
        }

        const figures = [];

        if (uzel.matches?.(".lubaNoteImage")) {
          figures.push(uzel);
        }

        figures.push(
          ...uzel.querySelectorAll?.(
            ".lubaNoteImage"
          ) || []
        );

        for (const figure of figures) {
          obnovPreferovanouSirkuObrazku(figure);
        }
      }
    }
  });

  observerObrazku.observe(modalRichText, {
    childList: true,
    subtree: true
  });

  for (const figure of modalRichText.querySelectorAll(
    ".lubaNoteImage"
  )) {
    obnovPreferovanouSirkuObrazku(figure);
  }

  window.LubaNoteEditorMedia = {
    maVlozenyObsah: () =>
      Boolean(
        modalRichText.querySelector(
          ".lubaNoteImage, a.lubaNoteInternetLink"
        )
      ),
    
    vlozObrazek: otevriVyberZdrojeObrazku,
    vlozObrazekZGalerie: otevriGaleriiObrazku,
    vyfotObrazek: otevriFotoaparatObrazku,
    otevriOdkaz: otevriLinkModal
  };
})();