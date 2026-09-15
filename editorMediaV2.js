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

  async function vlozSoubor(file) {
    if (!file || probihaVlozeni) return false;
    if (bridge()?.jeAktivni?.() !== true) return false;

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

  function zavriNahledObrazku() {
    nahledObrazku?.remove();
    nahledObrazku = null;
    document.body.classList.remove("lubaNoteImagePreviewOpen");
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
    otevriNahledObrazku,
    zavriNahledObrazku
  });
})();
