/* ========================================
   LUBANOTE – EDITOR MEDIA / CORE V2 ONLY
   HARD CUT 528

   - žádný přímý zápis do editorového DOM,
   - obrázek jde po přípravě výhradně přes Core V2 Bridge,
   - běžná poznámka: JPEG max 1280 px / quality 0.70 + shadow attachment,
   - Secret: komprimovaný Data URL bez plaintext attachment cache,
   - fullscreen náhled zůstává UI vrstva mimo model.
======================================== */
(() => {
  "use strict";

  const imageInput = document.createElement("input");
  imageInput.type = "file";
  imageInput.accept = "image/*";
  imageInput.hidden = true;
  imageInput.setAttribute("aria-hidden", "true");

  const cameraInput = document.createElement("input");
  cameraInput.type = "file";
  cameraInput.accept = "image/*";
  cameraInput.capture = "environment";
  cameraInput.hidden = true;
  cameraInput.setAttribute("aria-hidden", "true");

  document.body.append(imageInput, cameraInput);

  let nahledObrazku = null;
  let uklidPinchNahledu = null;
  let probihaVlozeni = false;

  function bridge() {
    return window.LubaNoteEditorV2Bridge || null;
  }

  function jeTajnaPoznamka() {
    try {
      if (typeof secretTaskEnabled !== "undefined") {
        return secretTaskEnabled === true;
      }
    } catch (_error) {}

    return document.body.classList.contains("secretModeActive");
  }

  function ziskejNoteId() {
    const modal = document.getElementById("taskModal");
    return modal?.dataset?.taskId || modal?.dataset?.draftTaskId || null;
  }

  function nactiSouborJakoDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("Soubor se nepodařilo načíst."));
      reader.readAsDataURL(file);
    });
  }

  function nactiObrazek(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Obrázek se nepodařilo dekódovat."));
      image.src = dataUrl;
    });
  }

  function vykresliDoDataUrl(image, { maxRozmer, mimeType, kvalita }) {
    const puvodniSirka = Math.max(1, Number(image.naturalWidth || image.width || 1));
    const puvodniVyska = Math.max(1, Number(image.naturalHeight || image.height || 1));
    const pomer = Math.min(1, Number(maxRozmer || 1280) / Math.max(puvodniSirka, puvodniVyska));
    const sirka = Math.max(1, Math.round(puvodniSirka * pomer));
    const vyska = Math.max(1, Math.round(puvodniVyska * pomer));

    const canvas = document.createElement("canvas");
    canvas.width = sirka;
    canvas.height = vyska;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("Obrázek se nepodařilo připravit.");

    if (mimeType === "image/jpeg") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, sirka, vyska);
    }

    context.drawImage(image, 0, 0, sirka, vyska);
    return canvas.toDataURL(mimeType, kvalita);
  }

  async function pripravObrazek(file) {
    if (!file?.type?.startsWith("image/")) {
      throw new Error("Vybraný soubor není obrázek.");
    }

    const original = await nactiSouborJakoDataUrl(file);
    const image = await nactiObrazek(original);

    if (!jeTajnaPoznamka()) {
      return vykresliDoDataUrl(image, {
        maxRozmer: 1280,
        mimeType: "image/jpeg",
        kvalita: 0.70
      });
    }

    /* Secret zůstává bez plaintext attachment cache. Velikost držíme pod
       kontrolou několika postupně úspornějšími WebP variantami. */
    const pokusy = [
      [1280, 0.78],
      [1080, 0.72],
      [900, 0.68],
      [760, 0.64]
    ];

    let vysledek = "";
    for (const [maxRozmer, kvalita] of pokusy) {
      vysledek = vykresliDoDataUrl(image, {
        maxRozmer,
        mimeType: "image/webp",
        kvalita
      });
      if (vysledek.length <= 700000) break;
    }

    if (!vysledek) throw new Error("Obrázek se nepodařilo připravit.");
    return vysledek;
  }

  function noveAttachmentId() {
    return crypto.randomUUID?.() || `attachment-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  async function ulozShadowAttachment(dataUrl, file) {
    if (jeTajnaPoznamka()) return "";

    const api = window.LubaNoteAttachmentsLocal;
    if (!api?.ulozCloudovouStinovouPrilohuZDataUrl) return "";

    const id = noveAttachmentId();
    try {
      await api.ulozCloudovouStinovouPrilohuZDataUrl({
        id,
        dataUrl,
        noteId: ziskejNoteId(),
        fileName: file?.name || ""
      });
      return id;
    } catch (error) {
      console.warn("LubaNote attachments: shadow kopie obrázku selhala.", error);
      return "";
    }
  }

  function jeAktivniSdilenaPoznamka() {
    const modal = document.getElementById("taskModal");
    const noteId = ziskejNoteId();

    if (modal?.classList?.contains("sharingEditorMode")) {
      return true;
    }

    try {
      return Boolean(
        noteId &&
        window.LubaNoteSharingNotes?.jeSdilenaPoznamka?.(noteId) === true
      );
    } catch (_error) {
      return false;
    }
  }

  function zajistiKlicProBeznyObrazek({ otevritModal = false } = {}) {
    if (jeTajnaPoznamka()) return true;

    if (jeAktivniSdilenaPoznamka()) {
      window.zobrazZpravuAplikace?.(
        "Šifrované fotografie",
        "Fotografie ve sdílených poznámkách zatím nelze bezpečně vložit. Shared media dostanou vlastní E2E klíč v části Shared handoff."
      );
      return false;
    }

    const mediaCrypto = window.LubaNoteMediaCrypto;

    if (mediaCrypto?.jeKlicDostupny?.() === true) {
      return true;
    }

    mediaCrypto?.oznamNutneOdemceni?.(otevritModal);
    return false;
  }

  async function vlozSoubor(file) {
    if (!file || probihaVlozeni) return false;
    if (bridge()?.jeAktivni?.() !== true) return false;
    /* PATCH 551: i po otevření pickeru mohl mezitím Secret auto-locknout.
       Běžná fotografie se proto nesmí ani lokálně připravit k cloud syncu,
       dokud není device media klíč odvozený z hlavního Secret hesla dostupný. */
    if (!zajistiKlicProBeznyObrazek({ otevritModal: true })) return false;

    probihaVlozeni = true;
    const ukonciCekani = window.LubaNoteUI?.zacniCekaniAkce?.("Připravuji obrázek…", 250) || (() => {});

    try {
      const dataUrl = await pripravObrazek(file);
      const attachmentId = await ulozShadowAttachment(dataUrl, file);
      const vlozeno = bridge()?.vlozPripravenyObrazek?.({
        dataUrl,
        fileName: file.name || "",
        alt: file.name ? `Obrázek: ${file.name}` : "Obrázek v poznámce",
        attachmentId,
        velikost: "prizpusobit",
        zarovnani: "stred"
      }) === true;

      if (!vlozeno && attachmentId) {
        try { await window.LubaNoteAttachmentsLocal?.smazPrilohu?.(attachmentId); } catch (_error) {}
      }

      return vlozeno;
    } catch (error) {
      console.error("LubaNote Core V2: vložení obrázku selhalo.", error);
      window.zobrazZpravuAplikace?.("Obrázek", error?.message || "Obrázek se nepodařilo vložit.");
      return false;
    } finally {
      ukonciCekani();
      probihaVlozeni = false;
      imageInput.value = "";
      cameraInput.value = "";
    }
  }

  imageInput.addEventListener("change", () => void vlozSoubor(imageInput.files?.[0] || null));
  cameraInput.addEventListener("change", () => void vlozSoubor(cameraInput.files?.[0] || null));

  function otevriGalerii() {
    if (bridge()?.jeAktivni?.() !== true) return;
    imageInput.value = "";
    imageInput.click();
  }

  function otevriFotoaparat() {
    if (bridge()?.jeAktivni?.() !== true) return;
    cameraInput.value = "";
    cameraInput.click();
  }

  function otevriVyberZdroje() {
    if (bridge()?.jeAktivni?.() !== true) return;

    /* PATCH 551 – fotografie běžné poznámky používá media klíč odvozený
       ze stejného hlavního hesla jako Secret. Pokud je zamčený, otevřeme odemknutí a uživatel po
       úspěchu znovu klepne na vložení obrázku. File picker se tak nikdy
       nespouští v režimu, který by později mohl vytvořit plaintext cloud. */
    if (!zajistiKlicProBeznyObrazek({ otevritModal: true })) return;

    if (typeof window.otevriVyberovyModal === "function") {
      window.otevriVyberovyModal({
        nadpis: "Vložit obrázek",
        moznosti: [
          { hodnota: "galerie", popisek: "Galerie", ikona: "obrazek" },
          { hodnota: "fotoaparat", popisek: "Fotoaparát", ikona: "fotoaparat" }
        ],
        poVyberu: (hodnota) => {
          if (hodnota === "fotoaparat") otevriFotoaparat();
          else otevriGalerii();
        }
      });
      return;
    }

    otevriGalerii();
  }

  /* ========================================
     FIX 536 – FULLSCREEN PINCH-TO-ZOOM
     Dvěma prsty lze obrázek plynule zvětšit/zmenšit. Po zvětšení jej lze
     jedním prstem posouvat. Nejde o page zoom; mění se jen fullscreen img.
  ======================================== */
  function zapojPinchZoomNahledu(nahled) {
    if (!nahled) return () => {};

    const body = document.body;
    const ukazatele = new Map();
    let meritko = 1;
    let posunX = 0;
    let posunY = 0;
    let pinchStart = null;
    let panStart = null;

    const omez = (hodnota, min, max) => Math.min(max, Math.max(min, hodnota));
    const vzdalenost = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
    const stred = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

    const vykresli = () => {
      nahled.style.transform = `translate3d(${posunX}px, ${posunY}px, 0) scale(${meritko})`;
      nahled.classList.toggle("lubaNoteImagePreviewImgZoomed", meritko > 1.01);
    };

    const pripravPanZeZbyvajiciho = () => {
      if (ukazatele.size !== 1 || meritko <= 1.01) {
        panStart = null;
        return;
      }
      const bod = Array.from(ukazatele.values())[0];
      panStart = { x: bod.x, y: bod.y, posunX, posunY };
    };

    const pointerDown = (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      ukazatele.set(event.pointerId, { x: event.clientX, y: event.clientY });
      try { nahled.setPointerCapture?.(event.pointerId); } catch (_error) {}

      if (ukazatele.size >= 2) {
        const [a, b] = Array.from(ukazatele.values()).slice(0, 2);
        pinchStart = {
          vzdalenost: Math.max(1, vzdalenost(a, b)),
          stred: stred(a, b),
          meritko,
          posunX,
          posunY
        };
        panStart = null;
        body.classList.add("lubaNoteImagePreviewPinching");
      } else if (meritko > 1.01) {
        pripravPanZeZbyvajiciho();
      }
    };

    const pointerMove = (event) => {
      if (!ukazatele.has(event.pointerId)) return;
      ukazatele.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (ukazatele.size >= 2 && pinchStart) {
        event.preventDefault();
        const [a, b] = Array.from(ukazatele.values()).slice(0, 2);
        const aktualniStred = stred(a, b);
        const pomer = vzdalenost(a, b) / pinchStart.vzdalenost;
        meritko = omez(pinchStart.meritko * pomer, 1, 6);
        posunX = pinchStart.posunX + (aktualniStred.x - pinchStart.stred.x);
        posunY = pinchStart.posunY + (aktualniStred.y - pinchStart.stred.y);
        if (meritko <= 1.01) {
          meritko = 1;
          posunX = 0;
          posunY = 0;
        }
        vykresli();
        return;
      }

      if (ukazatele.size === 1 && meritko > 1.01 && panStart) {
        event.preventDefault();
        posunX = panStart.posunX + (event.clientX - panStart.x);
        posunY = panStart.posunY + (event.clientY - panStart.y);
        vykresli();
      }
    };

    const pointerKonec = (event) => {
      ukazatele.delete(event.pointerId);
      try { nahled.releasePointerCapture?.(event.pointerId); } catch (_error) {}
      if (ukazatele.size < 2) {
        pinchStart = null;
        body.classList.remove("lubaNoteImagePreviewPinching");
      }
      pripravPanZeZbyvajiciho();
      if (ukazatele.size === 0 && meritko <= 1.01) {
        meritko = 1;
        posunX = 0;
        posunY = 0;
        vykresli();
      }
    };

    nahled.addEventListener("pointerdown", pointerDown);
    nahled.addEventListener("pointermove", pointerMove);
    nahled.addEventListener("pointerup", pointerKonec);
    nahled.addEventListener("pointercancel", pointerKonec);

    return () => {
      body.classList.remove("lubaNoteImagePreviewPinching");
      nahled.removeEventListener("pointerdown", pointerDown);
      nahled.removeEventListener("pointermove", pointerMove);
      nahled.removeEventListener("pointerup", pointerKonec);
      nahled.removeEventListener("pointercancel", pointerKonec);
      ukazatele.clear();
    };
  }

  function zavriNahledObrazku() {
    try { uklidPinchNahledu?.(); } catch (_error) {}
    uklidPinchNahledu = null;
    nahledObrazku?.remove();
    nahledObrazku = null;
    document.body.classList.remove("lubaNoteImagePreviewOpen");
    document.body.classList.remove("lubaNoteImagePreviewPinching");
  }

  function otevriNahledObrazku(image) {
    if (!image?.src) return;
    try { window.LubaNoteKeyboard?.skryj?.(); } catch (_error) {}
    zavriNahledObrazku();

    const overlay = document.createElement("div");
    overlay.className = "lubaNoteImagePreview";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Náhled obrázku");

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
    document.body.classList.add("lubaNoteImagePreviewOpen");
    nahledObrazku = overlay;
    uklidPinchNahledu = zapojPinchZoomNahledu(nahled);

    zavrit.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      zavriNahledObrazku();
    });
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) zavriNahledObrazku();
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && nahledObrazku) {
      event.preventDefault();
      event.stopImmediatePropagation();
      zavriNahledObrazku();
    }
  }, true);

  /* Při přepnutí aktuální poznámky na Secret zrušíme shadow attachment IDs
     přímo v modelu a plaintext cache best-effort odstraníme. */
  document.getElementById("secretTaskButton")?.addEventListener("click", () => {
    queueMicrotask(async () => {
      if (!jeTajnaPoznamka()) return;
      const ids = window.LubaNoteEditorV2?.odpojAttachmentIds?.() || [];
      for (const id of ids) {
        try { await window.LubaNoteAttachmentsLocal?.smazPrilohu?.(id); } catch (_error) {}
      }
    });
  });

  window.vlozObrazekDoPoznamky = otevriVyberZdroje;
  window.LubaNoteEditorMediaV2 = Object.freeze({
    maVlozenyObsah: () => bridge()?.ziskejObsahProProdukci?.()?.maMedia === true,
    vlozObrazek: otevriVyberZdroje,
    vlozObrazekZGalerie: otevriGalerii,
    vyfotObrazek: otevriFotoaparat,

    /* PATCH 609 – PC clipboard image
       Ctrl+V z Core V2 nesmí obcházet media pipeline. Kopírovaný obrázek
       proto prochází stejnou kompresí, E2E kontrolou, shadow attachmentem
       a modelovým vložením jako Galerie/Fotoaparát. */
    vlozObrazekZeSchranky: (file) => vlozSoubor(file),

    otevriNahledObrazku,
    zavriNahledObrazku
  });
})();
