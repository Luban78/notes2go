/* ==================================================
   LubaNote – Poznámky / horní fade při scrollu
   PATCH 658AP
================================================== */
(() => {
  "use strict";

  const MOBIL = window.matchMedia("(max-width: 720px)");
  const app = document.querySelector("main.app");
  const notesButton = document.getElementById("notesModuleButton");

  if (!app) return;

  function aktualizuj() {
    const notesAktivni = notesButton?.classList.contains("active") === true;
    const maScroll = MOBIL.matches && notesAktivni && app.scrollTop > 1;
    app.classList.toggle("lubaNotesScrolled", maScroll);
  }

  app.addEventListener("scroll", aktualizuj, { passive: true });
  MOBIL.addEventListener?.("change", aktualizuj);

  // Přepínání modulů mění aktivní stav tlačítka asynchronně přes existující navigaci.
  document.getElementById("notesModuleButton")?.addEventListener("click", () => {
    requestAnimationFrame(aktualizuj);
  });
  document.getElementById("plannerModuleButton")?.addEventListener("click", () => {
    requestAnimationFrame(aktualizuj);
  });
  document.getElementById("documentsModuleButton")?.addEventListener("click", () => {
    requestAnimationFrame(aktualizuj);
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", aktualizuj, { once: true });
  } else {
    aktualizuj();
  }
})();
