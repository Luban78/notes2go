(() => {
  "use strict";

  /* ==========================================
     LUBANOTE – OTEVŘÍT / ULOŽIT JAKO
     Samostatný dokumentový modul editoru.

     V2:
     - Otevřít: HTML / TXT
     - Uložit jako: HTML / TXT / PDF
     - Android: Storage Access Framework přes nativní plugin
     - Web/PC: File System Access API + bezpečný fallback
     - Secret: záměrně zakázáno
  ========================================== */

  const tlacitkoOtevrit =
    document.getElementById("tlacitkoOtevritDokument");

  const tlacitkoUlozit =
    document.getElementById("tlacitkoUlozitDokument");

  if (!tlacitkoOtevrit || !tlacitkoUlozit) {
    return;
  }

  const FORMAT_LUBANOTE_DOKUMENTU =
    "lubanote-document-v1";

  const MAX_VELIKOST_OTEVRENEHO_SOUBORU =
    20 * 1024 * 1024;

  const MAX_VELIKOST_PDF_WEB =
    100 * 1024 * 1024;

  let pdfViewerStav = null;
  let pdfViewerUrl = null;
  let pdfViewerRenderToken = 0;
  let pdfViewerPrvky = null;

  const PDF_ZOOM_MIN = 0.5;
  const PDF_ZOOM_MAX = 3;
  const PDF_NASTAVENI_KLIC = "lubanote_pdf_nastaveni_v1";

  let pdfUlozeniPrvky = null;
  let pdfNastaveniPrvky = null;

  function vychoziPdfNastaveni() {
    return {
      dvojtapFullscreen: true,
      pamatovatZoom: false,
      posledniZoom: 1
    };
  }

  function nactiPdfNastaveni() {
    const vychozi = vychoziPdfNastaveni();

    try {
      const ulozene = JSON.parse(
        localStorage.getItem(PDF_NASTAVENI_KLIC) || "null"
      );

      if (!ulozene || typeof ulozene !== "object") {
        return vychozi;
      }

      return {
        dvojtapFullscreen: ulozene.dvojtapFullscreen !== false,
        pamatovatZoom: ulozene.pamatovatZoom === true,
        posledniZoom: omezPdfZoom(ulozene.posledniZoom || 1)
      };
    } catch {
      return vychozi;
    }
  }

  function ulozPdfNastaveni(nastaveni) {
    try {
      localStorage.setItem(
        PDF_NASTAVENI_KLIC,
        JSON.stringify({
          dvojtapFullscreen: nastaveni.dvojtapFullscreen !== false,
          pamatovatZoom: nastaveni.pamatovatZoom === true,
          posledniZoom: omezPdfZoom(nastaveni.posledniZoom || 1)
        })
      );
    } catch {
      // Nastavení není kritické – viewer musí fungovat i bez localStorage.
    }
  }

  function ulozPosledniPdfZoom() {
    if (!pdfViewerStav?.native) {
      return;
    }

    const nastaveni = nactiPdfNastaveni();
    if (!nastaveni.pamatovatZoom) {
      return;
    }

    nastaveni.posledniZoom = omezPdfZoom(pdfViewerStav.zoom);
    ulozPdfNastaveni(nastaveni);
  }

  function jeSecretEditor() {
    return (
      secretTaskEnabled === true ||
      document.body.classList.contains("secretModeActive")
    );
  }

  function aktualizujDostupnost() {
    const skryt = jeSecretEditor();

    tlacitkoOtevrit.hidden = skryt;
    tlacitkoUlozit.hidden = skryt;
  }

  function ziskejNativniPlugin() {
    return window.Capacitor
      ?.Plugins
      ?.LubaNoteDocument || null;
  }

  function jePdfSoubor({ nazevSouboru = "", mimeType = "" } = {}) {
    return (
      /\.pdf$/i.test(String(nazevSouboru)) ||
      /application\/pdf/i.test(String(mimeType))
    );
  }

  function omezPdfZoom(hodnota) {
    return Math.max(
      PDF_ZOOM_MIN,
      Math.min(PDF_ZOOM_MAX, Number(hodnota) || 1)
    );
  }

  function vzdalenostDotyku(a, b) {
    return Math.hypot(
      Number(a?.clientX || 0) - Number(b?.clientX || 0),
      Number(a?.clientY || 0) - Number(b?.clientY || 0)
    );
  }

  function stredDotyku(a, b) {
    return {
      x: (Number(a?.clientX || 0) + Number(b?.clientX || 0)) / 2,
      y: (Number(a?.clientY || 0) + Number(b?.clientY || 0)) / 2
    };
  }

  function ziskejPdfViewportWidth() {
    if (!pdfViewerPrvky?.native) {
      return 280;
    }

    const styl = getComputedStyle(pdfViewerPrvky.native);
    const padding =
      (parseFloat(styl.paddingLeft) || 0) +
      (parseFloat(styl.paddingRight) || 0);

    return Math.max(280, pdfViewerPrvky.native.clientWidth - padding);
  }

  function aktualizujPdfVycentrovani() {
    if (!pdfViewerPrvky?.native || !pdfViewerPrvky?.image) {
      return;
    }

    const styl = getComputedStyle(pdfViewerPrvky.native);
    const paddingX =
      (parseFloat(styl.paddingLeft) || 0) +
      (parseFloat(styl.paddingRight) || 0);
    const paddingY =
      (parseFloat(styl.paddingTop) || 0) +
      (parseFloat(styl.paddingBottom) || 0);

    const dostupnaSirka = Math.max(
      0,
      pdfViewerPrvky.native.clientWidth - paddingX
    );
    const dostupnaVyska = Math.max(
      0,
      pdfViewerPrvky.native.clientHeight - paddingY
    );
    const sirkaStranky = Math.round(pdfViewerPrvky.image.offsetWidth || 0);
    const vyskaStranky = Math.round(pdfViewerPrvky.image.offsetHeight || 0);

    const centrovatVodorovne =
      sirkaStranky > 0 && sirkaStranky <= dostupnaSirka;
    const centrovatSvisle =
      vyskaStranky > 0 && vyskaStranky <= dostupnaVyska;

    pdfViewerPrvky.native.classList.toggle(
      'is-center-x',
      centrovatVodorovne
    );
    pdfViewerPrvky.native.classList.toggle(
      'is-center-y',
      centrovatSvisle
    );
  }

  function pockejNaNacteniPdfObrazku() {
    if (!pdfViewerPrvky?.image) {
      return Promise.resolve();
    }

    if (
      pdfViewerPrvky.image.complete &&
      pdfViewerPrvky.image.naturalWidth > 0
    ) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const dokoncit = () => {
        pdfViewerPrvky.image.removeEventListener('load', dokoncit);
        pdfViewerPrvky.image.removeEventListener('error', dokoncit);
        resolve();
      };

      pdfViewerPrvky.image.addEventListener('load', dokoncit, { once: true });
      pdfViewerPrvky.image.addEventListener('error', dokoncit, { once: true });
    });
  }

  function zajistiPdfViewer() {
    if (pdfViewerPrvky) {
      return pdfViewerPrvky;
    }

    const overlay = document.createElement("div");
    overlay.id = "pdfViewerOverlay";
    overlay.className = "pdfViewerOverlay";
    overlay.hidden = true;

    overlay.innerHTML = `
      <section class="pdfViewerPanel" role="dialog" aria-modal="true" aria-label="PDF prohlížeč">
        <header class="pdfViewerHeader">
          <button type="button" class="pdfViewerClose" aria-label="Zavřít PDF">←</button>
          <div class="pdfViewerTitle" title=""></div>
          <button type="button" class="pdfViewerSave" aria-label="Uložit kopii PDF">Uložit</button>
          <button type="button" class="pdfViewerSettings" aria-label="Nastavení PDF" title="Nastavení PDF">⚙</button>
          <button type="button" class="pdfViewerFullscreen" aria-label="Maximální zobrazení PDF" title="Celá obrazovka">⛶</button>
        </header>

        <div class="pdfViewerPageBar" hidden>
          <div class="pdfViewerPageGroup">
            <button type="button" class="pdfViewerPrev" aria-label="Předchozí strana">‹</button>
            <span class="pdfViewerPageValue">1 / 1</span>
            <button type="button" class="pdfViewerNext" aria-label="Další strana">›</button>
          </div>

          <button type="button" class="pdfViewerFit" aria-label="Přizpůsobit PDF na šířku" title="Přizpůsobit na šířku">Fit</button>

          <div class="pdfViewerZoom">
            <button type="button" class="pdfViewerZoomOut" aria-label="Zmenšit PDF">−</button>
            <span class="pdfViewerZoomValue">100 %</span>
            <button type="button" class="pdfViewerZoomIn" aria-label="Zvětšit PDF">+</button>
          </div>
        </div>

        <div class="pdfViewerBody">
          <div class="pdfViewerLoading" hidden>Načítám PDF…</div>
          <div class="pdfViewerNative" hidden>
            <img class="pdfViewerImage" alt="PDF strana" draggable="false">
          </div>
          <iframe class="pdfViewerFrame" title="PDF dokument" hidden></iframe>
        </div>

        <button type="button" class="pdfViewerFullscreenExit" aria-label="Opustit maximální zobrazení" hidden>←</button>
      </section>`;

    document.body.appendChild(overlay);

    const prvky = {
      overlay,
      panel: overlay.querySelector(".pdfViewerPanel"),
      close: overlay.querySelector(".pdfViewerClose"),
      title: overlay.querySelector(".pdfViewerTitle"),
      save: overlay.querySelector(".pdfViewerSave"),
      settings: overlay.querySelector(".pdfViewerSettings"),
      fullscreen: overlay.querySelector(".pdfViewerFullscreen"),
      fullscreenExit: overlay.querySelector(".pdfViewerFullscreenExit"),
      zoom: overlay.querySelector(".pdfViewerZoom"),
      zoomOut: overlay.querySelector(".pdfViewerZoomOut"),
      zoomIn: overlay.querySelector(".pdfViewerZoomIn"),
      zoomValue: overlay.querySelector(".pdfViewerZoomValue"),
      fit: overlay.querySelector(".pdfViewerFit"),
      pageBar: overlay.querySelector(".pdfViewerPageBar"),
      prev: overlay.querySelector(".pdfViewerPrev"),
      next: overlay.querySelector(".pdfViewerNext"),
      pageValue: overlay.querySelector(".pdfViewerPageValue"),
      body: overlay.querySelector(".pdfViewerBody"),
      loading: overlay.querySelector(".pdfViewerLoading"),
      native: overlay.querySelector(".pdfViewerNative"),
      image: overlay.querySelector(".pdfViewerImage"),
      frame: overlay.querySelector(".pdfViewerFrame")
    };

    prvky.close.addEventListener("click", () => {
      zavriPdfViewer();
    });

    prvky.save.addEventListener("click", () => {
      otevriPdfUlozeniModal();
    });

    prvky.settings.addEventListener("click", () => {
      otevriPdfNastaveniModal();
    });

    prvky.fullscreen.addEventListener("click", () => {
      nastavPdfFullscreen(true);
    });

    prvky.fullscreenExit.addEventListener("click", () => {
      nastavPdfFullscreen(false);
    });

    prvky.fit.addEventListener("click", () => {
      nastavPdfFit();
    });

    prvky.prev.addEventListener("click", () => {
      prejdiNaPdfStranku(-1);
    });

    prvky.next.addEventListener("click", () => {
      prejdiNaPdfStranku(1);
    });

    prvky.zoomOut.addEventListener("click", () => {
      zmenPdfZoom(-1);
    });

    prvky.zoomIn.addEventListener("click", () => {
      zmenPdfZoom(1);
    });

    /*
     * PDF – PINCH TO ZOOM
     * ==========================================
     * Během gesta NERENDERUJEME novou bitmapu na každý pohyb prstu.
     * Mění se pouze CSS šířka již vykreslené stránky. Teprve po puštění
     * prstů se z nativního PdfRendereru vyžádá ostrá varianta.
     * Tohle pravidlo neměnit na render-per-touchmove – na mobilu by to
     * bylo pomalé a mohlo by to přetížit paměť.
     */
    prvky.native.addEventListener(
      "touchstart",
      (event) => {
        if (!pdfViewerStav?.native || event.touches.length !== 2) {
          return;
        }

        event.preventDefault();

        const a = event.touches[0];
        const b = event.touches[1];
        const vzdalenost = vzdalenostDotyku(a, b);

        if (vzdalenost < 10) {
          return;
        }

        const stred = stredDotyku(a, b);
        const rect = prvky.native.getBoundingClientRect();
        const imageRect = prvky.image.getBoundingClientRect();
        const sirka = Math.max(1, imageRect.width);
        const vyska = Math.max(1, imageRect.height);

        pdfViewerStav.pinch = {
          vzdalenost,
          zoom: pdfViewerStav.zoom,
          aktualniZoom: pdfViewerStav.zoom,
          lokalniX: stred.x - rect.left,
          lokalniY: stred.y - rect.top,
          bodX: Math.max(0, Math.min(1, (stred.x - imageRect.left) / sirka)),
          bodY: Math.max(0, Math.min(1, (stred.y - imageRect.top) / vyska))
        };

        pdfViewerStav.posledniTap = null;
        pdfViewerStav.blokujTapDo = performance.now() + 500;
        prvky.native.classList.add("is-pinching");
      },
      { passive: false }
    );

    prvky.native.addEventListener(
      "touchmove",
      (event) => {
        const pinch = pdfViewerStav?.pinch;

        if (!pdfViewerStav?.native || !pinch || event.touches.length < 2) {
          return;
        }

        event.preventDefault();

        const a = event.touches[0];
        const b = event.touches[1];
        const pomer = vzdalenostDotyku(a, b) / pinch.vzdalenost;
        const zoom = omezPdfZoom(pinch.zoom * pomer);
        const viewportWidth = ziskejPdfViewportWidth();

        pinch.aktualniZoom = zoom;
        prvky.image.style.width = `${Math.round(viewportWidth * zoom)}px`;
        prvky.zoomValue.textContent = `${Math.round(zoom * 100)} %`;

        /* Zachová bod PDF pod středem dvou prstů. */
        const cilX =
          prvky.image.offsetLeft +
          pinch.bodX * prvky.image.offsetWidth;
        const cilY =
          prvky.image.offsetTop +
          pinch.bodY * prvky.image.offsetHeight;

        prvky.native.scrollLeft = Math.max(0, cilX - pinch.lokalniX);
        prvky.native.scrollTop = Math.max(0, cilY - pinch.lokalniY);
      },
      { passive: false }
    );

    const dokoncitPinch = () => {
      const pinch = pdfViewerStav?.pinch;

      if (!pdfViewerStav?.native || !pinch) {
        return;
      }

      pdfViewerStav.zoom = omezPdfZoom(pinch.aktualniZoom);
      ulozPosledniPdfZoom();
      pdfViewerStav.pinch = null;
      pdfViewerStav.blokujTapDo = performance.now() + 500;
      prvky.native.classList.remove("is-pinching");
      aktualizujPdfOvladani();

      vykresliAktualniPdfStranku({ zachovatPozici: true })
        .catch((error) => {
          console.error("PDF pinch zoom selhal:", error);
        });
    };

    prvky.native.addEventListener("touchend", (event) => {
      if (pdfViewerStav?.pinch && event.touches.length < 2) {
        dokoncitPinch();
      }
    });

    prvky.native.addEventListener("touchcancel", dokoncitPinch);

    /*
     * 2× tap – maximalizace PDF.
     * Jednoduchý tap nic nemění. Pohyb prstu nad 14 px se počítá jako
     * scroll, ne jako tap, takže běžné posouvání stránky zůstává nedotčené.
     */
    let pointerTap = null;

    prvky.native.addEventListener("pointerdown", (event) => {
      if (!pdfViewerStav?.native || event.pointerType !== "touch") {
        return;
      }

      pointerTap = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        cas: performance.now(),
        pohyb: false
      };
    });

    prvky.native.addEventListener("pointermove", (event) => {
      if (!pointerTap || pointerTap.id !== event.pointerId) {
        return;
      }

      if (
        Math.hypot(
          event.clientX - pointerTap.x,
          event.clientY - pointerTap.y
        ) > 14
      ) {
        pointerTap.pohyb = true;
      }
    });

    prvky.native.addEventListener("pointercancel", () => {
      pointerTap = null;
    });

    prvky.native.addEventListener("pointerup", (event) => {
      if (
        !pdfViewerStav?.native ||
        !pointerTap ||
        pointerTap.id !== event.pointerId ||
        pointerTap.pohyb ||
        performance.now() - pointerTap.cas > 320 ||
        pdfViewerStav.pinch ||
        performance.now() < Number(pdfViewerStav.blokujTapDo || 0)
      ) {
        pointerTap = null;
        return;
      }

      const ted = performance.now();
      const posledni = pdfViewerStav.posledniTap;
      const jeDvojtap =
        posledni &&
        ted - posledni.cas <= 360 &&
        Math.hypot(
          event.clientX - posledni.x,
          event.clientY - posledni.y
        ) <= 38;

      if (jeDvojtap) {
        pdfViewerStav.posledniTap = null;

        if (nactiPdfNastaveni().dvojtapFullscreen) {
          nastavPdfFullscreen(!pdfViewerStav.fullscreen);
        }
      } else {
        pdfViewerStav.posledniTap = {
          x: event.clientX,
          y: event.clientY,
          cas: ted
        };
      }

      pointerTap = null;
    });

    const zpracujKlavesyPdf = (event) => {
      if (!pdfViewerStav) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();

        if (pdfViewerStav.fullscreen) {
          nastavPdfFullscreen(false);
        } else {
          zavriPdfViewer();
        }
        return;
      }

      if (pdfViewerStav.native && event.key === "ArrowLeft") {
        event.preventDefault();
        prejdiNaPdfStranku(-1);
      }

      if (pdfViewerStav.native && event.key === "ArrowRight") {
        event.preventDefault();
        prejdiNaPdfStranku(1);
      }

      if (pdfViewerStav.native && (event.key === "+" || event.key === "=")) {
        event.preventDefault();
        zmenPdfZoom(1);
      }

      if (pdfViewerStav.native && event.key === "-") {
        event.preventDefault();
        zmenPdfZoom(-1);
      }
    };

    document.addEventListener("keydown", zpracujKlavesyPdf, true);

    pdfViewerPrvky = prvky;
    return prvky;
  }

  function aktualizujPdfOvladani() {
    if (!pdfViewerStav || !pdfViewerPrvky) {
      return;
    }

    const {
      pageCount = 1,
      pageIndex = 0,
      zoom = 1
    } = pdfViewerStav;

    pdfViewerPrvky.pageValue.textContent =
      `${pageIndex + 1} / ${pageCount}`;

    pdfViewerPrvky.prev.disabled = pageIndex <= 0;
    pdfViewerPrvky.next.disabled = pageIndex >= pageCount - 1;
    pdfViewerPrvky.zoomValue.textContent =
      `${Math.round(zoom * 100)} %`;
    pdfViewerPrvky.zoomOut.disabled = zoom <= PDF_ZOOM_MIN + 0.01;
    pdfViewerPrvky.zoomIn.disabled = zoom >= PDF_ZOOM_MAX - 0.01;
    pdfViewerPrvky.fit.classList.toggle(
      "active",
      Math.abs(zoom - 1) < 0.01
    );
  }

  async function vykresliAktualniPdfStranku({ zachovatPozici = false } = {}) {
    if (!pdfViewerStav?.native || !pdfViewerPrvky) {
      return;
    }

    const plugin = ziskejNativniPlugin();

    if (!plugin?.vykresliPdfStranku) {
      throw new Error("Nativní PDF renderer není dostupný.");
    }

    const token = ++pdfViewerRenderToken;
    const viewportWidth = ziskejPdfViewportWidth();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const targetWidth = Math.min(2600, Math.max(520,
      Math.round(viewportWidth * pdfViewerStav.zoom * pixelRatio)
    ));

    const scrollLeft = pdfViewerPrvky.native.scrollLeft;
    const scrollTop = pdfViewerPrvky.native.scrollTop;

    pdfViewerPrvky.loading.hidden = false;
    pdfViewerPrvky.image.classList.add("is-loading");

    const vysledek = await plugin.vykresliPdfStranku({
      index: pdfViewerStav.pageIndex,
      targetWidth
    });

    if (token !== pdfViewerRenderToken || !pdfViewerStav?.native) {
      return;
    }

    if (!vysledek?.dataUrl) {
      throw new Error("PDF stránka nemá obrazová data.");
    }

    pdfViewerPrvky.image.src = vysledek.dataUrl;
    pdfViewerPrvky.image.style.width =
      `${Math.round(viewportWidth * pdfViewerStav.zoom)}px`;

    await pockejNaNacteniPdfObrazku();
    aktualizujPdfVycentrovani();

    pdfViewerPrvky.loading.hidden = true;
    pdfViewerPrvky.image.classList.remove("is-loading");

    pdfViewerPrvky.native.scrollTo({
      top: zachovatPozici ? scrollTop : 0,
      left: zachovatPozici ? scrollLeft : 0,
      behavior: "auto"
    });
  }

  async function prejdiNaPdfStranku(posun) {
    if (!pdfViewerStav?.native) {
      return;
    }

    const dalsi = Math.max(0, Math.min(
      pdfViewerStav.pageCount - 1,
      pdfViewerStav.pageIndex + posun
    ));

    if (dalsi === pdfViewerStav.pageIndex) {
      return;
    }

    pdfViewerStav.pageIndex = dalsi;
    aktualizujPdfOvladani();

    try {
      await vykresliAktualniPdfStranku();
    } catch (error) {
      console.error("PDF stránku se nepodařilo vykreslit:", error);
      zobrazChybu("PDF", "Stránku se nepodařilo zobrazit.");
    }
  }

  async function nastavPdfZoom(zoom, { zachovatPozici = true } = {}) {
    if (!pdfViewerStav?.native) {
      return;
    }

    const novyZoom = omezPdfZoom(zoom);

    if (Math.abs(novyZoom - pdfViewerStav.zoom) < 0.005) {
      aktualizujPdfOvladani();
      return;
    }

    pdfViewerStav.zoom = novyZoom;
    ulozPosledniPdfZoom();
    aktualizujPdfOvladani();

    try {
      await vykresliAktualniPdfStranku({ zachovatPozici });
    } catch (error) {
      console.error("PDF zoom selhal:", error);
    }
  }

  async function zmenPdfZoom(smer) {
    if (!pdfViewerStav?.native) {
      return;
    }

    const urovne = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];
    let nejblizsiIndex = 0;
    let nejmensiRozdil = Infinity;

    urovne.forEach((hodnota, index) => {
      const rozdil = Math.abs(hodnota - pdfViewerStav.zoom);
      if (rozdil < nejmensiRozdil) {
        nejmensiRozdil = rozdil;
        nejblizsiIndex = index;
      }
    });

    const novyIndex = Math.max(0, Math.min(
      urovne.length - 1,
      nejblizsiIndex + smer
    ));

    await nastavPdfZoom(urovne[novyIndex], {
      zachovatPozici: true
    });
  }

  async function nastavPdfFit() {
    await nastavPdfZoom(1, { zachovatPozici: false });
  }

  async function nastavPdfFullscreen(ano) {
    if (!pdfViewerStav || !pdfViewerPrvky) {
      return;
    }

    const fullscreen = ano === true;
    pdfViewerStav.fullscreen = fullscreen;
    pdfViewerPrvky.overlay.classList.toggle("is-fullscreen", fullscreen);
    pdfViewerPrvky.fullscreenExit.hidden = !fullscreen;
    pdfViewerPrvky.fullscreen.setAttribute(
      "aria-pressed",
      fullscreen ? "true" : "false"
    );

    if (!pdfViewerStav.native) {
      return;
    }

    /*
     * Po změně dostupného prostoru přepočítáme bitmapu až v dalším frame,
     * jinak by clientWidth ještě odpovídal starému layoutu.
     */
    await new Promise((resolve) => requestAnimationFrame(resolve));

    try {
      await vykresliAktualniPdfStranku({ zachovatPozici: false });
    } catch (error) {
      console.error("PDF fullscreen render selhal:", error);
    }
  }

  async function ulozPdfPresWebZVieweru(file, nazevSouboru) {
    if (!(file instanceof Blob)) {
      throw new Error("PDF data nejsou dostupná.");
    }

    if (typeof window.showSaveFilePicker === "function") {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: nazevSouboru || "dokument.pdf",
          types: [
            {
              description: "PDF dokument",
              accept: {
                "application/pdf": [".pdf"]
              }
            }
          ]
        });

        const zapis = await handle.createWritable();
        await zapis.write(file);
        await zapis.close();
        return true;
      } catch (error) {
        if (error?.name === "AbortError") {
          return false;
        }
        throw error;
      }
    }

    const url = URL.createObjectURL(file);
    const odkaz = document.createElement("a");
    odkaz.href = url;
    odkaz.download = nazevSouboru || "dokument.pdf";
    odkaz.hidden = true;
    document.body.appendChild(odkaz);
    odkaz.click();
    odkaz.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    return true;
  }

  function normalizujNazevPdf(nazev = "") {
    let vysledek = bezpecnyNazevSouboru(nazev || "dokument.pdf");

    if (!/\.pdf$/i.test(vysledek)) {
      vysledek += ".pdf";
    }

    return vysledek;
  }

  function zajistiPdfUlozeniModal() {
    if (pdfUlozeniPrvky) {
      return pdfUlozeniPrvky;
    }

    const modal = document.createElement("div");
    modal.className = "pdfLubaModal";
    modal.hidden = true;
    modal.innerHTML = `
      <section class="pdfLubaDialog" role="dialog" aria-modal="true" aria-label="Uložit PDF">
        <div class="pdfLubaDialogHeader">
          <div class="pdfLubaDialogIcon" aria-hidden="true">💾</div>
          <div>
            <h3>Uložit PDF</h3>
            <p>Vyber název souboru. V dalším kroku zvolíš místo v telefonu.</p>
          </div>
        </div>

        <label class="pdfLubaField">
          <span>Název souboru</span>
          <input class="pdfLubaFileName" type="text" autocomplete="off" spellcheck="false" inputmode="text">
        </label>

        <div class="pdfLubaActions">
          <button type="button" class="pdfLubaSecondary pdfLubaCancel">Zrušit</button>
          <button type="button" class="pdfLubaPrimary pdfLubaConfirm">Uložit PDF</button>
        </div>
      </section>`;

    document.body.appendChild(modal);

    const prvky = {
      modal,
      input: modal.querySelector(".pdfLubaFileName"),
      cancel: modal.querySelector(".pdfLubaCancel"),
      confirm: modal.querySelector(".pdfLubaConfirm")
    };

    const zavrit = () => {
      modal.hidden = true;
    };

    prvky.cancel.addEventListener("click", zavrit);
    modal.addEventListener("pointerdown", (event) => {
      if (event.target === modal) {
        zavrit();
      }
    });

    prvky.confirm.addEventListener("click", async () => {
      const nazev = normalizujNazevPdf(prvky.input.value);
      prvky.input.value = nazev;
      modal.hidden = true;
      await ulozPdfZVieweru(nazev);
    });

    prvky.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        prvky.confirm.click();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        zavrit();
      }
    });

    pdfUlozeniPrvky = prvky;
    return prvky;
  }

  function otevriPdfUlozeniModal() {
    if (!pdfViewerStav) {
      return;
    }

    const prvky = zajistiPdfUlozeniModal();
    prvky.input.value = normalizujNazevPdf(
      pdfViewerStav.nazevSouboru || "dokument.pdf"
    );
    prvky.modal.hidden = false;

    requestAnimationFrame(() => {
      prvky.input.focus({ preventScroll: true });
      const konec = prvky.input.value.replace(/\.pdf$/i, "").length;
      try {
        prvky.input.setSelectionRange(0, konec);
      } catch {
        prvky.input.select();
      }
    });
  }

  function zajistiPdfNastaveniModal() {
    if (pdfNastaveniPrvky) {
      return pdfNastaveniPrvky;
    }

    const modal = document.createElement("div");
    modal.className = "pdfLubaModal";
    modal.hidden = true;
    modal.innerHTML = `
      <section class="pdfLubaDialog pdfLubaSettingsDialog" role="dialog" aria-modal="true" aria-label="Nastavení PDF">
        <div class="pdfLubaDialogHeader">
          <div class="pdfLubaDialogIcon" aria-hidden="true">⚙️</div>
          <div>
            <h3>Nastavení PDF</h3>
            <p>Platí pro PDF prohlížeč v LubaNote.</p>
          </div>
        </div>

        <div class="pdfLubaSettingsList">
          <button type="button" class="pdfLubaSettingRow" data-setting="dvojtapFullscreen" role="switch" aria-checked="true">
            <span>
              <strong>2× tap → celá obrazovka</strong>
              <small>Dvojtap přepne maximální zobrazení PDF.</small>
            </span>
            <span class="pdfLubaSwitch" aria-hidden="true"><i></i></span>
          </button>

          <button type="button" class="pdfLubaSettingRow" data-setting="pamatovatZoom" role="switch" aria-checked="false">
            <span>
              <strong>Zapamatovat poslední zoom</strong>
              <small>Další PDF se otevře se stejným přiblížením.</small>
            </span>
            <span class="pdfLubaSwitch" aria-hidden="true"><i></i></span>
          </button>
        </div>

        <div class="pdfLubaActions">
          <button type="button" class="pdfLubaPrimary pdfLubaSettingsClose">Hotovo</button>
        </div>
      </section>`;

    document.body.appendChild(modal);

    const prvky = {
      modal,
      rows: [...modal.querySelectorAll(".pdfLubaSettingRow")],
      close: modal.querySelector(".pdfLubaSettingsClose")
    };

    const zavrit = () => {
      modal.hidden = true;
    };

    prvky.close.addEventListener("click", zavrit);
    modal.addEventListener("pointerdown", (event) => {
      if (event.target === modal) {
        zavrit();
      }
    });

    prvky.rows.forEach((row) => {
      row.addEventListener("click", () => {
        const klic = row.dataset.setting;
        const nastaveni = nactiPdfNastaveni();

        if (klic === "dvojtapFullscreen") {
          nastaveni.dvojtapFullscreen = !nastaveni.dvojtapFullscreen;
        }

        if (klic === "pamatovatZoom") {
          nastaveni.pamatovatZoom = !nastaveni.pamatovatZoom;
          if (nastaveni.pamatovatZoom && pdfViewerStav?.native) {
            nastaveni.posledniZoom = omezPdfZoom(pdfViewerStav.zoom);
          }
        }

        ulozPdfNastaveni(nastaveni);
        aktualizujPdfNastaveniModal();
      });
    });

    pdfNastaveniPrvky = prvky;
    return prvky;
  }

  function aktualizujPdfNastaveniModal() {
    if (!pdfNastaveniPrvky) {
      return;
    }

    const nastaveni = nactiPdfNastaveni();

    pdfNastaveniPrvky.rows.forEach((row) => {
      const klic = row.dataset.setting;
      const aktivni = klic === "dvojtapFullscreen"
        ? nastaveni.dvojtapFullscreen
        : nastaveni.pamatovatZoom;

      row.classList.toggle("active", aktivni);
      row.setAttribute("aria-checked", aktivni ? "true" : "false");
    });
  }

  function otevriPdfNastaveniModal() {
    if (!pdfViewerStav?.native) {
      return;
    }

    const prvky = zajistiPdfNastaveniModal();
    aktualizujPdfNastaveniModal();
    prvky.modal.hidden = false;
  }

  async function ulozPdfZVieweru(nazevSouboru) {
    if (!pdfViewerStav || !pdfViewerPrvky || pdfViewerPrvky.save.disabled) {
      return;
    }

    const nazev = normalizujNazevPdf(
      nazevSouboru || pdfViewerStav.nazevSouboru || "dokument.pdf"
    );

    pdfViewerPrvky.save.disabled = true;
    pdfViewerPrvky.save.classList.add("is-saving");

    try {
      let ulozeno = false;

      if (pdfViewerStav.native) {
        const plugin = ziskejNativniPlugin();

        if (!plugin?.ulozOtevrenePdf) {
          throw new Error("Nativní uložení otevřeného PDF není dostupné.");
        }

        const vysledek = await plugin.ulozOtevrenePdf({
          nazevSouboru: nazev
        });
        ulozeno = vysledek?.saved === true;
      } else {
        ulozeno = await ulozPdfPresWebZVieweru(
          pdfViewerStav.file,
          nazev
        );
      }

      if (ulozeno && typeof zobrazZpravuAplikace === "function") {
        zobrazZpravuAplikace("PDF", "PDF bylo uloženo.");
      }
    } catch (error) {
      console.error("Uložení otevřeného PDF selhalo:", error);
      zobrazChybu("PDF", "PDF se nepodařilo uložit.");
    } finally {
      pdfViewerPrvky.save.disabled = false;
      pdfViewerPrvky.save.classList.remove("is-saving");
    }
  }

  async function otevriPdfViewer(soubor) {
    const prvky = zajistiPdfViewer();
    modalRichText?.blur();

    prvky.title.textContent = soubor.nazevSouboru || "PDF dokument";
    prvky.title.title = soubor.nazevSouboru || "PDF dokument";
    prvky.overlay.hidden = false;
    prvky.overlay.classList.remove("is-fullscreen");
    prvky.fullscreenExit.hidden = true;
    document.body.classList.add("pdfViewerOpen");

    if (soubor.native === true) {
      const pdfNastaveni = nactiPdfNastaveni();

      pdfViewerStav = {
        native: true,
        pageCount: Math.max(1, Number(soubor.pageCount) || 1),
        pageIndex: 0,
        zoom: pdfNastaveni.pamatovatZoom
          ? omezPdfZoom(pdfNastaveni.posledniZoom)
          : 1,
        fullscreen: false,
        pinch: null,
        posledniTap: null,
        blokujTapDo: 0,
        nazevSouboru: soubor.nazevSouboru || "dokument.pdf"
      };

      prvky.frame.hidden = true;
      prvky.native.hidden = false;
      prvky.pageBar.hidden = false;
      prvky.settings.hidden = false;
      aktualizujPdfOvladani();

      try {
        await vykresliAktualniPdfStranku();
      } catch (error) {
        await zavriPdfViewer();
        throw error;
      }

      return;
    }

    pdfViewerStav = {
      native: false,
      fullscreen: false,
      file: soubor.file,
      nazevSouboru: soubor.nazevSouboru || "dokument.pdf"
    };
    prvky.native.hidden = true;
    prvky.pageBar.hidden = true;
    prvky.settings.hidden = true;
    prvky.loading.hidden = true;
    prvky.frame.hidden = false;

    if (pdfViewerUrl) {
      URL.revokeObjectURL(pdfViewerUrl);
    }

    pdfViewerUrl = URL.createObjectURL(soubor.file);
    prvky.frame.src = pdfViewerUrl;
  }

  async function zavriPdfViewer() {
    if (!pdfViewerPrvky || !pdfViewerStav) {
      return false;
    }

    const byloNativni = pdfViewerStav.native === true;
    pdfViewerRenderToken += 1;
    pdfViewerStav = null;

    pdfViewerPrvky.overlay.hidden = true;
    pdfUlozeniPrvky && (pdfUlozeniPrvky.modal.hidden = true);
    pdfNastaveniPrvky && (pdfNastaveniPrvky.modal.hidden = true);
    pdfViewerPrvky.overlay.classList.remove("is-fullscreen");
    pdfViewerPrvky.fullscreenExit.hidden = true;
    pdfViewerPrvky.loading.hidden = true;
    pdfViewerPrvky.image.removeAttribute("src");
    pdfViewerPrvky.image.style.removeProperty("width");
    pdfViewerPrvky.image.classList.remove("is-loading");
    pdfViewerPrvky.native.classList.remove(
      "is-pinching",
      "is-center-x",
      "is-center-y"
    );
    pdfViewerPrvky.frame.src = "about:blank";
    document.body.classList.remove("pdfViewerOpen");

    if (pdfViewerUrl) {
      URL.revokeObjectURL(pdfViewerUrl);
      pdfViewerUrl = null;
    }

    if (byloNativni) {
      try {
        await ziskejNativniPlugin()?.zavriPdf?.();
      } catch (error) {
        console.warn("PDF renderer se nepodařilo zavřít:", error);
      }
    }

    return true;
  }

  function jeNativniAndroid() {
    try {
      if (typeof window.Capacitor?.getPlatform === "function") {
        return window.Capacitor.getPlatform() === "android";
      }
    } catch {
      // fallback níže
    }

    return Boolean(ziskejNativniPlugin());
  }

  function zobrazChybu(nadpis, text) {
    if (typeof zobrazZpravuAplikace === "function") {
      zobrazZpravuAplikace(nadpis, text);
      return;
    }

    alert(`${nadpis}\n\n${text}`);
  }

  function bezpecnyNazevSouboru(nazev = "") {
    const vycisteny = String(nazev)
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
      .replace(/\s+/g, " ")
      .replace(/[. ]+$/g, "")
      .trim()
      .slice(0, 100);

    return vycisteny || "LubaNote-poznamka";
  }

  function nazevBezPripony(nazev = "") {
    return String(nazev)
      .replace(/\.[^.]+$/u, "")
      .trim();
  }

  function escapujHtml(text = "") {
    const prvek = document.createElement("div");
    prvek.textContent = String(text);
    return prvek.innerHTML;
  }

  function pripravJsonDoHtml(data) {
    return JSON.stringify(data)
      .replace(/</g, "\\u003c")
      .replace(/>/g, "\\u003e")
      .replace(/&/g, "\\u0026");
  }

  function ziskejAktualniTodos() {
    try {
      blurSelectedTodoEditor?.();
    } catch {
      // TODO nemusí být právě aktivní.
    }

    return Array.isArray(activeTodos)
      ? activeTodos.map((todo) => ({
          ...todo,
          text: String(todo?.text ?? ""),
          html: String(todo?.html ?? ""),
          completed: todo?.completed === true
        }))
      : [];
  }

  function vytvorDataDokumentu() {
    const title =
      ziskejNazevPoznamkyZEditoru().trim();

    const todos = ziskejAktualniTodos();

    return {
      format: FORMAT_LUBANOTE_DOKUMENTU,
      version: 1,
      exportedAt: new Date().toISOString(),
      title,
      richContent: modalRichText.innerHTML,
      plainText: modalRichText.innerText,
      todos,
      date: modalDate.value || "",
      time: modalTime.value || ""
    };
  }

  function vytvorTodoHtmlProDokument(todo) {
    const stav = todo?.completed === true;
    const obsah = todo?.html
      ? String(todo.html)
      : escapujHtml(todo?.text || "");

    return `
      <li class="ln-doc-todo${stav ? " is-done" : ""}">
        <span class="ln-doc-check" aria-hidden="true">${stav ? "☑" : "☐"}</span>
        <span class="ln-doc-todo-text">${obsah}</span>
      </li>`;
  }

  function vytvorHtmlDokument(data) {
    const nazev = data.title || "LubaNote poznámka";
    const datum = [data.date, data.time]
      .filter(Boolean)
      .join(" ");

    const todoSekce = data.todos.length
      ? `
        <section class="ln-doc-todos">
          <h2>Úkoly</h2>
          <ul>
            ${data.todos.map(vytvorTodoHtmlProDokument).join("")}
          </ul>
        </section>`
      : "";

    const metadata = pripravJsonDoHtml(data);

    return `<!doctype html>
<html lang="cs">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="generator" content="LubaNote">
  <title>${escapujHtml(nazev)}</title>
  <style>
    :root { color-scheme: light dark; }
    body {
      max-width: 900px;
      margin: 0 auto;
      padding: 32px 22px 56px;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.55;
    }
    h1 { margin: 0 0 6px; line-height: 1.2; }
    .ln-doc-date { opacity: .65; margin-bottom: 28px; }
    .ln-doc-content img { max-width: 100%; height: auto; }
    .ln-doc-content figure { max-width: 100%; margin-left: 0; margin-right: 0; }
    .ln-doc-todos { margin-top: 34px; padding-top: 18px; border-top: 1px solid currentColor; }
    .ln-doc-todos ul { list-style: none; padding: 0; }
    .ln-doc-todo { display: flex; gap: 10px; align-items: flex-start; margin: 8px 0; }
    .ln-doc-todo.is-done .ln-doc-todo-text { text-decoration: line-through; opacity: .65; }
    .ln-doc-check { flex: 0 0 auto; }
    .noteInternalLink { text-decoration: underline; }
  </style>
</head>
<body>
  <header>
    <h1>${escapujHtml(nazev)}</h1>
    ${datum ? `<div class="ln-doc-date">${escapujHtml(datum)}</div>` : ""}
  </header>
  <main>
    <article class="ln-doc-content">${data.richContent || ""}</article>
    ${todoSekce}
  </main>
  <script id="lubanote-document-data" type="application/json">${metadata}<\/script>
</body>
</html>`;
  }

  function vytvorPdfHtmlDokument(data) {
    /*
     * PDF se tiskne z čistého dokumentového HTML, nikoli z celé obrazovky
     * LubaNote. Tím se do PDF nedostane toolbar, modaly ani navigace.
     */
    const html = vytvorHtmlDokument(data);

    const tiskCss = `
    @page { size: A4; margin: 14mm; }
    html, body { background: #fff !important; color: #111; }
    body { max-width: none; margin: 0; padding: 0; }
    .ln-doc-content, .ln-doc-todos { break-inside: auto; }
    .ln-doc-content img, .ln-doc-content figure { break-inside: avoid; }
    .ln-doc-todo { break-inside: avoid; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    `;

    return html
      .replace('</style>', `${tiskCss}</style>`)
      .replace(
        /\s*<script id="lubanote-document-data"[\s\S]*?<\/script>/i,
        ''
      );
  }

  async function ulozPdfPresWeb(data) {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.width = "1px";
    iframe.style.height = "1px";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";

    const html = vytvorPdfHtmlDokument(data);

    return await new Promise((resolve, reject) => {
      let dokonceno = false;

      const uklid = (vysledek) => {
        if (dokonceno) {
          return;
        }

        dokonceno = true;
        iframe.remove();
        resolve(vysledek);
      };

      iframe.addEventListener(
        "load",
        () => {
          try {
            const okno = iframe.contentWindow;

            if (!okno || typeof okno.print !== "function") {
              throw new Error("Tiskový dialog není v tomto prohlížeči dostupný.");
            }

            const spustTisk = () => {
              try {
                okno.focus();

                const poTisku = () => {
                  okno.removeEventListener?.("afterprint", poTisku);
                  uklid(true);
                };

                okno.addEventListener?.("afterprint", poTisku);
                okno.print();

                /*
                 * Některé mobilní prohlížeče afterprint neposílají.
                 * Iframe proto po návratu z dialogu uklidíme záložním timerem.
                 */
                setTimeout(() => uklid(true), 2500);
              } catch (error) {
                iframe.remove();
                reject(error);
              }
            };

            const dokument = iframe.contentDocument;
            const obrazky = [
              ...(dokument?.images || [])
            ];

            const cekaniNaObrazky = obrazky
              .filter((img) => !img.complete)
              .map(
                (img) =>
                  new Promise((hotovo) => {
                    img.addEventListener("load", hotovo, { once: true });
                    img.addEventListener("error", hotovo, { once: true });
                  })
              );

            Promise.all(cekaniNaObrazky).then(spustTisk);
          } catch (error) {
            iframe.remove();
            reject(error);
          }
        },
        { once: true }
      );

      iframe.srcdoc = html;
      document.body.appendChild(iframe);
    });
  }

  function vytvorTxtDokument(data) {
    const casti = [];

    if (data.title) {
      casti.push(data.title);
      casti.push("=".repeat(Math.min(60, Math.max(3, data.title.length))));
      casti.push("");
    }

    if (data.plainText.trim()) {
      casti.push(data.plainText.trimEnd());
    }

    if (data.todos.length) {
      if (casti.length) {
        casti.push("");
      }

      casti.push("Úkoly:");

      data.todos.forEach((todo) => {
        casti.push(
          `${todo.completed ? "[x]" : "[ ]"} ${todo.text || ""}`
        );
      });
    }

    return casti.join("\n");
  }

  async function ulozPresWeb({ obsah, nazevSouboru, mimeType, pripona }) {
    if (typeof window.showSaveFilePicker === "function") {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: nazevSouboru,
          types: [
            {
              description: pripona === ".html"
                ? "HTML dokument"
                : "Textový dokument",
              accept: {
                [mimeType]: [pripona]
              }
            }
          ]
        });

        const zapis = await handle.createWritable();
        await zapis.write(obsah);
        await zapis.close();

        return true;
      } catch (error) {
        if (error?.name === "AbortError") {
          return false;
        }

        throw error;
      }
    }

    const blob = new Blob([obsah], {
      type: `${mimeType};charset=utf-8`
    });

    const url = URL.createObjectURL(blob);
    const odkaz = document.createElement("a");
    odkaz.href = url;
    odkaz.download = nazevSouboru;
    odkaz.hidden = true;

    document.body.appendChild(odkaz);
    odkaz.click();
    odkaz.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }

  async function ulozDokument(format) {
    if (jeSecretEditor()) {
      zobrazChybu(
        "Uložit jako",
        "Secret poznámku nelze ukládat do externího dokumentu. Secret režim zůstává oddělený."
      );
      return;
    }

    const data = vytvorDataDokumentu();
    const zaklad = bezpecnyNazevSouboru(data.title);
    const plugin = ziskejNativniPlugin();

    if (format === "pdf") {
      const nazevSouboru = `${zaklad}.pdf`;
      const html = vytvorPdfHtmlDokument(data);

      if (jeNativniAndroid() && plugin?.ulozPdf) {
        const vysledek = await plugin.ulozPdf({
          html,
          nazevSouboru
        });

        return vysledek?.saved === true;
      }

      return await ulozPdfPresWeb(data);
    }

    const jeHtml = format === "html";
    const pripona = jeHtml ? ".html" : ".txt";
    const mimeType = jeHtml ? "text/html" : "text/plain";
    const obsah = jeHtml
      ? vytvorHtmlDokument(data)
      : vytvorTxtDokument(data);

    const nazevSouboru = `${zaklad}${pripona}`;

    if (jeNativniAndroid() && plugin?.ulozDokument) {
      const vysledek = await plugin.ulozDokument({
        obsah,
        nazevSouboru,
        mimeType
      });

      return vysledek?.saved === true;
    }

    return await ulozPresWeb({
      obsah,
      nazevSouboru,
      mimeType,
      pripona
    });
  }

  function vyberSouborFallback() {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".html,.htm,.txt,.pdf,text/html,text/plain,application/pdf";
      input.hidden = true;

      const uklid = () => {
        input.remove();
      };

      input.addEventListener(
        "change",
        async () => {
          const file = input.files?.[0] || null;

          if (!file) {
            uklid();
            resolve(null);
            return;
          }

          const pdf = jePdfSoubor({
            nazevSouboru: file.name,
            mimeType: file.type || ""
          });

          const limit = pdf
            ? MAX_VELIKOST_PDF_WEB
            : MAX_VELIKOST_OTEVRENEHO_SOUBORU;

          if (file.size > limit) {
            uklid();
            zobrazChybu(
              "Otevřít dokument",
              pdf
                ? "PDF je příliš velké. Maximální velikost ve webové verzi je 100 MB."
                : "Soubor je příliš velký. Maximální velikost je 20 MB."
            );
            resolve(null);
            return;
          }

          try {
            if (pdf) {
              uklid();
              resolve({
                typ: "pdf",
                file,
                nazevSouboru: file.name,
                mimeType: file.type || "application/pdf"
              });
              return;
            }

            const obsah = await file.text();
            uklid();
            resolve({
              typ: "text",
              obsah,
              nazevSouboru: file.name,
              mimeType: file.type || ""
            });
          } catch {
            uklid();
            resolve(null);
          }
        },
        { once: true }
      );

      document.body.appendChild(input);
      input.click();
    });
  }

  async function otevriPresWeb() {
    if (typeof window.showOpenFilePicker === "function") {
      try {
        const [handle] = await window.showOpenFilePicker({
          multiple: false,
          types: [
            {
              description: "HTML, text nebo PDF",
              accept: {
                "text/html": [".html", ".htm"],
                "text/plain": [".txt"],
                "application/pdf": [".pdf"]
              }
            }
          ]
        });

        if (!handle) {
          return null;
        }

        const file = await handle.getFile();

        const pdf = jePdfSoubor({
          nazevSouboru: file.name,
          mimeType: file.type || ""
        });

        const limit = pdf
          ? MAX_VELIKOST_PDF_WEB
          : MAX_VELIKOST_OTEVRENEHO_SOUBORU;

        if (file.size > limit) {
          zobrazChybu(
            "Otevřít dokument",
            pdf
              ? "PDF je příliš velké. Maximální velikost ve webové verzi je 100 MB."
              : "Soubor je příliš velký. Maximální velikost je 20 MB."
          );
          return null;
        }

        if (pdf) {
          return {
            typ: "pdf",
            file,
            nazevSouboru: file.name,
            mimeType: file.type || "application/pdf"
          };
        }

        return {
          typ: "text",
          obsah: await file.text(),
          nazevSouboru: file.name,
          mimeType: file.type || ""
        };
      } catch (error) {
        if (error?.name === "AbortError") {
          return null;
        }

        throw error;
      }
    }

    return await vyberSouborFallback();
  }

  async function vyberDokumentKOtevreni() {
    const plugin = ziskejNativniPlugin();

    if (jeNativniAndroid() && plugin?.otevriDokument) {
      const vysledek = await plugin.otevriDokument();

      if (!vysledek || vysledek.canceled === true) {
        return null;
      }

      if (vysledek.typ === "pdf") {
        return {
          typ: "pdf",
          native: true,
          pageCount: vysledek.pageCount || 1,
          nazevSouboru: vysledek.nazevSouboru || "dokument.pdf",
          mimeType: vysledek.mimeType || "application/pdf"
        };
      }

      if (typeof vysledek.obsah !== "string") {
        return null;
      }

      return {
        typ: "text",
        obsah: vysledek.obsah,
        nazevSouboru: vysledek.nazevSouboru || "dokument",
        mimeType: vysledek.mimeType || ""
      };
    }

    return await otevriPresWeb();
  }

  function sanitizujHtml(html = "") {
    const sablona = document.createElement("template");
    sablona.innerHTML = String(html);

    sablona.content
      .querySelectorAll(
        "script, iframe, object, embed, form, input, textarea, select, option, button, meta, link, base"
      )
      .forEach((prvek) => prvek.remove());

    sablona.content
      .querySelectorAll("*")
      .forEach((prvek) => {
        [...prvek.attributes].forEach((atribut) => {
          const jmeno = atribut.name.toLowerCase();
          const hodnota = atribut.value.trim();

          if (jmeno.startsWith("on")) {
            prvek.removeAttribute(atribut.name);
            return;
          }

          if (
            (jmeno === "href" || jmeno === "src") &&
            /^javascript:/i.test(hodnota)
          ) {
            prvek.removeAttribute(atribut.name);
            return;
          }

          if (
            jmeno === "style" &&
            /(expression\s*\(|url\s*\(\s*["']?javascript:)/i.test(hodnota)
          ) {
            prvek.removeAttribute("style");
          }
        });
      });

    return sablona.innerHTML;
  }

  function textNaHtml(text = "") {
    const radky = String(text)
      .replace(/\r\n?/g, "\n")
      .split("\n");

    return radky
      .map((radek) =>
        radek.length
          ? `<div>${escapujHtml(radek)}</div>`
          : "<div><br></div>"
      )
      .join("");
  }

  function normalizujTodosZeSouboru(todos) {
    if (!Array.isArray(todos)) {
      return [];
    }

    return todos.map((todo) => ({
      ...todo,
      id:
        typeof todo?.id === "string" && todo.id
          ? todo.id
          : crypto.randomUUID(),
      text: String(todo?.text ?? ""),
      html: sanitizujHtml(todo?.html || ""),
      completed: todo?.completed === true
    }));
  }

  function parsujDokument(soubor) {
    const obsah = String(soubor?.obsah ?? "");
    const nazevSouboru = String(
      soubor?.nazevSouboru || "dokument"
    );

    const jeHtml =
      /\.html?$/i.test(nazevSouboru) ||
      /text\/html/i.test(soubor?.mimeType || "") ||
      /^\s*<!doctype\s+html/i.test(obsah) ||
      /^\s*<html[\s>]/i.test(obsah);

    if (!jeHtml) {
      return {
        title: nazevBezPripony(nazevSouboru) || "Nový dokument",
        richContent: textNaHtml(obsah),
        todos: [],
        date: "",
        time: ""
      };
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(obsah, "text/html");

    const metadataElement =
      doc.getElementById("lubanote-document-data");

    if (metadataElement?.textContent) {
      try {
        const data = JSON.parse(metadataElement.textContent);

        if (data?.format === FORMAT_LUBANOTE_DOKUMENTU) {
          return {
            title: String(data.title || ""),
            richContent: sanitizujHtml(data.richContent || ""),
            todos: normalizujTodosZeSouboru(data.todos),
            date: String(data.date || ""),
            time: String(data.time || "")
          };
        }
      } catch (error) {
        console.warn(
          "Metadata LubaNote dokumentu nešla načíst, použiji běžný HTML import.",
          error
        );
      }
    }

    doc.querySelectorAll(
      "script, style, iframe, object, embed, form, input, textarea, select, option, button, meta, link, base"
    ).forEach((prvek) => prvek.remove());

    const prvniH1 = doc.body?.querySelector("h1");
    const title =
      String(doc.title || "").trim() ||
      String(prvniH1?.textContent || "").trim() ||
      nazevBezPripony(nazevSouboru) ||
      "Nový dokument";

    if (prvniH1) {
      prvniH1.remove();
    }

    return {
      title,
      richContent: sanitizujHtml(doc.body?.innerHTML || ""),
      todos: [],
      date: "",
      time: ""
    };
  }

  function nastavAktualniDatumCasProNovyDokument() {
    const ted = new Date();
    const rok = ted.getFullYear();
    const mesic = String(ted.getMonth() + 1).padStart(2, "0");
    const den = String(ted.getDate()).padStart(2, "0");
    const hodiny = String(ted.getHours()).padStart(2, "0");
    const minuty = String(ted.getMinutes()).padStart(2, "0");

    modalDate.value = `${rok}-${mesic}-${den}`;
    modalTime.value = `${hodiny}:${minuty}`;
  }

  function pripravPrazdnyNovyEditor() {
    zahajEditorSession(null);
    taskModal.removeAttribute("data-task-id");
    zahajDraftNovePoznamky();
    activeTaskIndex = null;

    secretTaskEnabled = false;
    favoriteEnabled = false;
    reminderEnabled = false;

    priorityTaskButton?.classList.remove("active");
    secretTaskButton?.classList.remove("active");

    aktualizujIkonuTajnePoznamky?.();
    updateReminderButton?.(false);

    activeArea = "private";
    activeTags = [];
    updateTagMenuUI?.();
    closeTagMenu?.();

    editorRepeat = null;

    nastavNazevPoznamkyVEditoru("");
    modalText.value = "";
    modalRichText.innerHTML = "";
    modalText.hidden = true;
    modalRichText.hidden = false;

    resetTodos?.();
    RichTextColors?.reset?.();

    document
      .getElementById("plannedTextLinks")
      ?.replaceChildren();

    const planned =
      document.getElementById("plannedTextLinks");

    if (planned) {
      planned.hidden = true;
    }

    nastavAktualniDatumCasProNovyDokument();
    aktualizujPopiskyDataCasu?.();
    updateModalWeekday?.();

    /*
     * Otisk ukládáme ještě v prázdném stavu. Importovaný obsah pak
     * bude správně považovaný za změnu a při zavření se nabídne uložení
     * do LubaNote.
     */
    puvodniOtiskEditoru = vytvorOtiskEditoru();
  }

  function vlozDokumentDoNovehoEditoru(data) {
    pripravPrazdnyNovyEditor();

    nastavNazevPoznamkyVEditoru(data.title || "");
    modalRichText.innerHTML = sanitizujHtml(
      data.richContent || ""
    );

    loadTodos?.(data.todos || []);

    if (/^\d{4}-\d{2}-\d{2}$/.test(data.date || "")) {
      modalDate.value = data.date;
    }

    if (/^\d{2}:\d{2}$/.test(data.time || "")) {
      modalTime.value = data.time;
    }

    aktualizujPopiskyDataCasu?.();
    updateModalWeekday?.();
    resetujSbaleniNazvuEditoru?.();

    taskModal.hidden = false;
    taskModal.classList.add("show");
    document.body.classList.add("noScroll");

    /*
     * Záměrně NEFOCUSUJEME editor. Otevření dokumentu tedy nevyvolá
     * mobilní klávesnici, dokud uživatel sám neklepne do textu.
     */
    modalRichText.blur();

    document.dispatchEvent(
      new CustomEvent("lubanote:dokument-otevren")
    );
  }

  async function otevriDokument() {
    if (jeSecretEditor()) {
      zobrazChybu(
        "Otevřít dokument",
        "Externí dokumenty nejsou v Secret režimu dostupné. Secret zůstává oddělený."
      );
      return;
    }

    let soubor = null;

    try {
      soubor = await vyberDokumentKOtevreni();
    } catch (error) {
      console.error("Otevření dokumentu selhalo:", error);
      zobrazChybu(
        "Otevřít dokument",
        "Soubor se nepodařilo otevřít."
      );
      return;
    }

    if (!soubor) {
      return;
    }

    if (soubor.typ === "pdf") {
      try {
        await otevriPdfViewer(soubor);
      } catch (error) {
        console.error("PDF se nepodařilo otevřít:", error);
        zobrazChybu(
          "Otevřít PDF",
          "PDF se nepodařilo zobrazit. Soubor může být poškozený nebo chráněný heslem."
        );
      }
      return;
    }

    let data;

    try {
      data = parsujDokument(soubor);
    } catch (error) {
      console.error("Čtení dokumentu selhalo:", error);
      zobrazChybu(
        "Otevřít dokument",
        "Obsah souboru není možné bezpečně načíst."
      );
      return;
    }

    /*
     * Pokud má právě otevřená normální poznámka neuložené změny,
     * nejdřív je bezpečně uložíme do LubaNote. Teprve potom otevřeme
     * externí dokument jako NOVOU nesmazanou/nezávislou poznámku.
     */
    if (bylEditorZmenen?.()) {
      await ulozAZavriEditor("normal");

      if (taskModal.classList.contains("show")) {
        return;
      }
    }

    vlozDokumentDoNovehoEditoru(data);
  }

  function otevriVolbuUlozeni() {
    if (jeSecretEditor()) {
      zobrazChybu(
        "Uložit jako",
        "Secret poznámku nelze ukládat do externího dokumentu."
      );
      return;
    }

    if (typeof window.otevriVyberovyModal === "function") {
      window.otevriVyberovyModal({
        nadpis: "Uložit jako",
        moznosti: [
          {
            hodnota: "html",
            popisek: "HTML – zachovat formátování"
          },
          {
            hodnota: "txt",
            popisek: "TXT – prostý text"
          },
          {
            hodnota: "pdf",
            popisek: "PDF – hotový dokument"
          }
        ],
        poVyberu: async (format) => {
          try {
            await ulozDokument(format);
          } catch (error) {
            console.error("Uložení dokumentu selhalo:", error);
            zobrazChybu(
              "Uložit jako",
              "Dokument se nepodařilo uložit."
            );
          }
        }
      });
      return;
    }

    ulozDokument("html").catch((error) => {
      console.error("Uložení dokumentu selhalo:", error);
      zobrazChybu(
        "Uložit jako",
        "Dokument se nepodařilo uložit."
      );
    });
  }

  [tlacitkoOtevrit, tlacitkoUlozit].forEach((tlacitko) => {
    tlacitko.addEventListener("pointerdown", (event) => {
      event.preventDefault();
    });
  });

  tlacitkoOtevrit.addEventListener("click", otevriDokument);
  tlacitkoUlozit.addEventListener("click", otevriVolbuUlozeni);

  /*
   * Secret může být zapnut/vypnut i během otevřeného editoru.
   * Tlačítka proto průběžně synchronizujeme bez zásahu do secret.js.
   */
  const observer = new MutationObserver(() => {
    aktualizujDostupnost();
  });

  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ["class"]
  });

  observer.observe(taskModal, {
    attributes: true,
    attributeFilter: ["hidden", "class", "data-task-id"]
  });

  secretTaskButton?.addEventListener("click", () => {
    queueMicrotask(aktualizujDostupnost);
  });

  const puvodniAndroidZpet =
    window.LubaNoteZpracujAndroidZpet;

  window.LubaNoteZpracujAndroidZpet = function () {
    if (pdfViewerStav) {
      if (pdfViewerStav.fullscreen) {
        nastavPdfFullscreen(false);
      } else {
        zavriPdfViewer();
      }
      return true;
    }

    if (typeof puvodniAndroidZpet === "function") {
      return puvodniAndroidZpet();
    }

    return false;
  };

  aktualizujDostupnost();

  window.LubaNoteDocuments = {
    otevriDokument,
    ulozDokument,
    parsujDokument,
    vytvorDataDokumentu,
    vytvorPdfHtmlDokument,
    otevriPdfViewer,
    zavriPdfViewer
  };
})();
