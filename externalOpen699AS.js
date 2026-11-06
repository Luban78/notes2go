/* 699AS – Android Open With: pouze uzivatelem predane content://, read-only import. */
(() => {
  "use strict";
  if (!window.Capacitor?.isNativePlatform?.()) return;
  let zpracovavam = false;
  let generace = 0;
  let timer = 0;
  const log = (message) => window.LubaNoteStartupDiag?.zapis?.("EXTERNAL-OPEN", message);

  async function prectiBinarnyDokument(plugin, meta) {
    const token = String(meta.token || "");
    const size = Number(meta.sizeBytes);
    if (!token || !Number.isInteger(size) || size < 0 || size > 100 * 1024 * 1024) {
      throw new Error("invalid_external_file_metadata");
    }
    const casti = [];
    let offset = 0;
    try {
      while (offset < size) {
        const odpoved = await plugin.prectiExterniBlok699AS({ token, offset, maxBytes: 128 * 1024 });
        const raw = atob(String(odpoved?.base64 || ""));
        const bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
        const next = Number(odpoved?.nextOffset);
        if (!Number.isInteger(next) || next <= offset || next > size || raw.length !== next - offset) {
          throw new Error("invalid_external_file_chunk");
        }
        casti.push(bytes);
        offset = next;
      }
      const nazev = String(meta.nazevSouboru || "dokument").replace(/[\\/]/g, "_");
      const mime = String(meta.mimeType || "application/octet-stream");
      return new File(casti, nazev, { type: mime });
    } finally {
      try { await plugin.ukonciExterniSoubor699AS({ token }); } catch (_error) {}
    }
  }

  async function vyzvedni() {
    if (zpracovavam) return;
    const plugin = window.Capacitor?.Plugins?.LubaNoteDocument;
    if (!plugin?.prevzmiExterniSoubor699AS) return;
    if (!window.LubaNoteDocuments?.otevriExterniText699AS ||
        !window.LubaNoteDocumentsHub?.otevriExterniSoubor699AS) return;
    zpracovavam = true;
    try {
      const meta = await plugin.prevzmiExterniSoubor699AS();
      if (meta?.pending !== true) return;
      let ok = false;
      if (meta.typ === "pdf") {
        await window.LubaNoteDocuments.otevriPdfViewer({
          typ: "pdf", native: true, pageCount: meta.pageCount || 1,
          nazevSouboru: meta.nazevSouboru || "dokument.pdf", mimeType: "application/pdf"
        });
        ok = true;
      } else if (meta.typ === "text") {
        ok = window.LubaNoteDocuments.otevriExterniText699AS(meta) === true;
      } else if (["docx", "doc", "epub", "sql"].includes(meta.typ)) {
        const soubor = await prectiBinarnyDokument(plugin, meta);
        ok = await window.LubaNoteDocumentsHub.otevriExterniSoubor699AS(soubor);
      }
      log(`RESULT | ${ok ? "OK" : "NOT_OPENED"} | type=${String(meta.typ || "unknown")}`);
    } catch (error) {
      console.error("699AS externi otevreni selhalo", error);
      log(`ERROR | ${String(error?.message || "unknown").slice(0,120)}`);
      window.zobrazZpravuAplikace?.("Otevřít dokument", "Soubor se nepodařilo otevřít. Zkus jej vybrat znovu.");
    } finally {
      zpracovavam = false;
    }
  }

  function naplanuj() {
    clearTimeout(timer);
    const moje = ++generace;
    timer = setTimeout(() => {
      if (moje !== generace) return;
      void vyzvedni();
    }, 280);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", naplanuj, { once: true });
  } else {
    naplanuj();
  }
  window.addEventListener("lubanote:external-document-699AS", naplanuj);
  window.addEventListener("lubanote:account-active", naplanuj);
})();
