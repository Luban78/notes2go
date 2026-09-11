/* ========================================
   LUBANOTE – EDITOR CORE V2 BRIDGE / TEST MODE
   FÁZE V2.6

   BEZPEČNOSTNÍ PRAVIDLA:
   - Produkční #modalRichText se NIKDY nepřepisuje V2 obsahem.
   - V2 pracuje v samostatném hostiteli uvnitř reálného editoru LubaNote.
   - Fajfka uloží pouze lokální V2 TEST KOPII a originál zavře beze změny.
   - Sdílené, Secret, nové a zatím nepodporované poznámky se ve V2 neupravují.
   - 5× tap na Připomínky zapíná/vypíná tento TEST režim.
======================================== */

(() => {
  "use strict";

  const KLIC_REZIMU = "ln_editor_v2_test_mode";
  const KLIC_KOPIE = "ln_editor_v2_test_copy:";

  const taskModal = document.getElementById("taskModal");
  const modalRichText = document.getElementById("modalRichText");
  const modalTitle = document.getElementById("modalTitle");
  const editorBackButton = document.getElementById("editorBackButton");

  if (!taskModal || !modalRichText || !modalTitle || !editorBackButton) {
    return;
  }

  let aktivni = false;
  let aktivniNoteId = null;
  let zdrojoveHtml = "";
  let puvodniTitleContenteditable = null;
  let preskocCaptureFajfky = false;
  let hostitel = null;
  let badge = null;
  let toast = null;
  let observer = null;
  let posledniAktivaceToken = 0;
  let pozastavAktivaci = false;

  const podporovaneAkce = new Set([
    "tlacitkoZpet",
    "tlacitkoZnovu",
    "tlacitkoTucne",
    "tlacitkoKurziva",
    "tlacitkoPodtrzeni"
  ]);

  const nepodporovaneAkce = new Set([
    "tlacitkoNadpis",
    "tlacitkoZarovnaniTextu",
    "tlacitkoVlozitObrazek",
    "tlacitkoVlozitOdkaz",
    "tlacitkoOtevritDokument",
    "tlacitkoUlozitDokument",
    "tlacitkoBullet",
    "addTodoButton",
    "planSelectionButton",
    "shareNoteButton",
    "secretTaskButton",
    "pinTaskButton",
    "reminderButton",
    "categoryTaskButton",
    "priorityTaskButton",
    "tagTaskButton",
    "deleteTaskButton",
    "modalDateButton",
    "modalTimeButton"
  ]);

  function core() {
    return window.LubaNoteEditorV2 || null;
  }

  function jeTestRezimZapnuty() {
    try {
      return sessionStorage.getItem(KLIC_REZIMU) === "1";
    } catch (_error) {
      return false;
    }
  }

  function nastavTestRezim(zapnuto) {
    try {
      if (zapnuto) sessionStorage.setItem(KLIC_REZIMU, "1");
      else sessionStorage.removeItem(KLIC_REZIMU);
    } catch (_error) {}
  }

  function vytvorPomocneUi() {
    if (!hostitel) {
      hostitel = document.createElement("div");
      hostitel.id = "modalRichTextV2Host";
      hostitel.className = "modalRichTextV2Host";
      hostitel.hidden = true;
      modalRichText.insertAdjacentElement("afterend", hostitel);
    }

    if (!badge) {
      badge = document.createElement("div");
      badge.id = "lnV2TestBadge";
      badge.className = "lnV2TestBadge";
      badge.textContent = "V2 TEST · KOPIE";
      badge.hidden = true;
      taskModal.querySelector(".modalContent")?.appendChild(badge);
    }

    if (!toast) {
      toast = document.createElement("div");
      toast.id = "lnV2BridgeToast";
      toast.className = "lnV2BridgeToast";
      toast.hidden = true;
      document.body.appendChild(toast);
    }
  }

  let toastTimer = null;
  function zobrazToast(text, chyba = false) {
    vytvorPomocneUi();
    if (!toast) return;
    toast.textContent = String(text || "");
    toast.classList.toggle("chyba", Boolean(chyba));
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      if (toast) toast.hidden = true;
    }, 2600);
  }

  function jeEditorOtevreny() {
    return !taskModal.hidden && taskModal.classList.contains("show");
  }

  function ziskejNoteId() {
    return String(taskModal.dataset.taskId || "").trim();
  }

  function jeZakazanyKontext() {
    if (taskModal.classList.contains("sharingEditorMode")) {
      return "Sdílené poznámky zatím V2 TEST neupravuje.";
    }
    if (!ziskejNoteId()) {
      return "Nové poznámky zatím V2 TEST neupravuje.";
    }
    if (
      document.body.classList.contains("secretModeActive") ||
      document.getElementById("secretTaskButton")?.classList.contains("active")
    ) {
      return "Secret poznámky zatím V2 TEST neupravuje.";
    }
    return "";
  }

  function klicKopie(noteId) {
    return `${KLIC_KOPIE}${noteId}`;
  }

  function nactiTestKopii(noteId, sourceHtml) {
    try {
      const raw = localStorage.getItem(klicKopie(noteId));
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data?.model || data.sourceHtml !== sourceHtml) return null;
      return data;
    } catch (_error) {
      return null;
    }
  }

  function ulozTestKopii() {
    if (!aktivni || !aktivniNoteId || !core()?.ziskejModel) return false;
    try {
      const model = core().ziskejModel();
      localStorage.setItem(
        klicKopie(aktivniNoteId),
        JSON.stringify({
          version: 1,
          noteId: aktivniNoteId,
          sourceHtml: zdrojoveHtml,
          savedAt: new Date().toISOString(),
          model
        })
      );
      return true;
    } catch (error) {
      console.warn("Editor V2 TEST: testovací kopii se nepodařilo uložit.", error);
      return false;
    }
  }

  function obnovToolbar() {
    if (!aktivni) return;
    const stav = core()?.ziskejStavFormatu?.();
    if (!stav) return;

    const velikost = document.getElementById("tlacitkoVelikostPisma");
    if (velikost) velikost.textContent = String(stav.velikost ?? "–");

    [
      ["tlacitkoTucne", "tucne"],
      ["tlacitkoKurziva", "kurziva"],
      ["tlacitkoPodtrzeni", "podtrzeni"]
    ].forEach(([id, klic]) => {
      const button = document.getElementById(id);
      if (!button) return;
      const hodnota = stav[klic];
      button.classList.toggle("active", hodnota === "on");
      button.classList.toggle("lnV2Mixed", hodnota === "mix");
      button.setAttribute("aria-pressed", hodnota === "mix" ? "mixed" : (hodnota === "on" ? "true" : "false"));
    });

    const textColorLine = document.querySelector("#textColorButton .textColorLine");
    if (textColorLine) {
      textColorLine.style.backgroundColor = stav.barva && stav.barva !== "mix" && stav.barva !== "zaklad"
        ? stav.barva
        : "";
    }
  }

  function zavriPanelyFormatu() {
    ["editorPanelVelikost", "textColorPanel", "textColorPalette", "editorPanelStyl", "editorPanelZarovnani"].forEach((id) => {
      const panel = document.getElementById(id);
      if (panel) panel.hidden = true;
    });
  }

  function prepniPanel(id) {
    const panel = document.getElementById(id);
    if (!panel) return;
    const budeOtevreny = panel.hidden;
    zavriPanelyFormatu();
    panel.hidden = !budeOtevreny;
  }

  function zajistiV2VolbyToolbaru() {
    const panelVelikost = document.querySelector("#editorPanelVelikost .editorPanelScroll");
    if (panelVelikost && !panelVelikost.querySelector("[data-ln-v2-zaklad-velikost]")) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "editorPanelVolba editorVelikostPisma lnV2OnlyControl";
      button.dataset.velikost = "zaklad";
      button.dataset.lnV2ZakladVelikost = "1";
      button.textContent = "Základ";
      panelVelikost.prepend(button);
    }

    const panelBarva = document.getElementById("textColorPanel");
    if (panelBarva && !panelBarva.querySelector("[data-ln-v2-reset-text-color]")) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "lnV2TextColorReset lnV2OnlyControl";
      button.dataset.textColor = "zaklad";
      button.dataset.lnV2ResetTextColor = "1";
      button.setAttribute("aria-label", "Výchozí barva textu");
      button.textContent = "A↺";
      panelBarva.prepend(button);
    }
  }

  function nastavOchranuUi(zapnout) {
    if (zapnout) {
      puvodniTitleContenteditable = modalTitle.getAttribute("contenteditable");
      modalTitle.setAttribute("contenteditable", "false");
      modalTitle.setAttribute("aria-readonly", "true");
      return;
    }

    if (puvodniTitleContenteditable === null) modalTitle.removeAttribute("contenteditable");
    else modalTitle.setAttribute("contenteditable", puvodniTitleContenteditable);
    modalTitle.removeAttribute("aria-readonly");
    puvodniTitleContenteditable = null;
  }

  function deaktivuj({ ulozitKopii = false } = {}) {
    if (!aktivni) return;
    if (ulozitKopii) ulozTestKopii();

    core()?.zavriVHostu?.();
    aktivni = false;
    aktivniNoteId = null;
    zdrojoveHtml = "";
    taskModal.classList.remove("editorV2TestMode");
    modalRichText.hidden = false;
    if (hostitel) hostitel.hidden = true;
    if (badge) badge.hidden = true;
    nastavOchranuUi(false);
    zavriPanelyFormatu();
  }

  function aktivujProOtevrenouPoznamku() {
    if (pozastavAktivaci) return false;
    if (!jeTestRezimZapnuty() || !jeEditorOtevreny()) return false;
    if (aktivni && aktivniNoteId === ziskejNoteId()) return true;

    const zakaz = jeZakazanyKontext();
    if (zakaz) {
      zobrazToast(zakaz, true);
      return false;
    }

    const api = core();
    if (!api?.importujHtml || !api?.otevriVHostu) {
      zobrazToast("Editor Core V2 není dostupný.", true);
      return false;
    }

    vytvorPomocneUi();
    zajistiV2VolbyToolbaru();
    const noteId = ziskejNoteId();
    const sourceHtml = modalRichText.innerHTML;
    const importVysledek = api.importujHtml(sourceHtml, modalRichText.innerText);

    if (!importVysledek?.ok) {
      const prvky = importVysledek?.nepodporovane?.join(", ") || "neznámý prvek";
      zobrazToast(`V2 TEST tuto poznámku zatím neotevře: ${prvky}`, true);
      return false;
    }

    const kopie = nactiTestKopii(noteId, sourceHtml);
    const model = kopie?.model || importVysledek.model;

    if (aktivni) deaktivuj();

    aktivni = true;
    aktivniNoteId = noteId;
    zdrojoveHtml = sourceHtml;
    taskModal.classList.add("editorV2TestMode");
    modalRichText.hidden = true;
    hostitel.hidden = false;
    badge.hidden = false;
    badge.textContent = kopie ? "V2 TEST · TEST KOPIE" : "V2 TEST · KOPIE";
    nastavOchranuUi(true);

    if (!api.otevriVHostu(hostitel, model)) {
      deaktivuj();
      zobrazToast("V2 TEST se nepodařilo připojit do editoru.", true);
      return false;
    }

    obnovToolbar();
    zobrazToast(kopie ? "V2 TEST: načtena testovací kopie" : "V2 TEST: originál je chráněný");
    return true;
  }

  function prepniTestRezim() {
    const zapnout = !jeTestRezimZapnuty();
    nastavTestRezim(zapnout);

    if (!zapnout) {
      if (aktivni) deaktivuj({ ulozitKopii: true });
      zobrazToast("Editor V2 TEST vypnut");
      return false;
    }

    zobrazToast("Editor V2 TEST zapnut · originály se nemění");
    if (jeEditorOtevreny()) {
      queueMicrotask(() => aktivujProOtevrenouPoznamku());
    }
    return true;
  }

  function zpracujToolbarCapture(event) {
    if (!aktivni) return;
    const cil = event.target.closest("button, [data-velikost], [data-text-color], [data-highlight-color], [data-highlight-remove]");
    if (!cil || !taskModal.contains(cil)) return;

    const id = cil.id || "";

    if (id === "editorBackButton") {
      if (preskocCaptureFajfky) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const ulozeno = ulozTestKopii();
      pozastavAktivaci = true;
      deaktivuj();
      preskocCaptureFajfky = true;
      queueMicrotask(() => {
        try {
          editorBackButton.click();
        } finally {
          preskocCaptureFajfky = false;
          setTimeout(() => { pozastavAktivaci = false; }, 0);
        }
      });
      zobrazToast(ulozeno ? "V2 TEST kopie uložena · originál beze změny" : "V2 TEST zavřen · originál beze změny");
      return;
    }

    if (id === "editorToolbarToggle") {
      return;
    }

    if (id === "tlacitkoVelikostPisma") {
      event.preventDefault();
      event.stopImmediatePropagation();
      core()?.zachytAktualniVyber?.();
      prepniPanel("editorPanelVelikost");
      return;
    }

    if (cil.matches(".editorVelikostPisma[data-velikost]")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      core()?.zachytAktualniVyber?.();
      core()?.nastavVelikost?.(cil.dataset.velikost);
      document.getElementById("editorPanelVelikost").hidden = true;
      obnovToolbar();
      return;
    }

    if (id === "textColorButton") {
      event.preventDefault();
      event.stopImmediatePropagation();
      core()?.zachytAktualniVyber?.();
      prepniPanel("textColorPanel");
      return;
    }

    if (cil.matches("#textColorPanel [data-text-color]")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      core()?.nastavBarvu?.("barva", cil.dataset.textColor || "zaklad");
      document.getElementById("textColorPanel").hidden = true;
      obnovToolbar();
      return;
    }

    if (id === "colorTaskButton") {
      event.preventDefault();
      event.stopImmediatePropagation();
      core()?.zachytAktualniVyber?.();
      prepniPanel("textColorPalette");
      return;
    }

    if (cil.matches("#textColorPalette [data-highlight-color]")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      core()?.nastavBarvu?.("pozadi", cil.dataset.highlightColor || "zaklad");
      document.getElementById("textColorPalette").hidden = true;
      obnovToolbar();
      return;
    }

    if (cil.matches("#textColorPalette [data-highlight-remove]")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      core()?.nastavBarvu?.("pozadi", "zaklad");
      document.getElementById("textColorPalette").hidden = true;
      obnovToolbar();
      return;
    }

    if (podporovaneAkce.has(id)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      core()?.zachytAktualniVyber?.();
      if (id === "tlacitkoZpet") core()?.undo?.();
      else if (id === "tlacitkoZnovu") core()?.redo?.();
      else if (id === "tlacitkoTucne") core()?.prepniFormat?.("tucne");
      else if (id === "tlacitkoKurziva") core()?.prepniFormat?.("kurziva");
      else if (id === "tlacitkoPodtrzeni") core()?.prepniFormat?.("podtrzeni");
      obnovToolbar();
      return;
    }

    if (nepodporovaneAkce.has(id) || cil.closest("#editorToolsToolbar")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      zobrazToast("V2 TEST: tato funkce ještě není připojená");
    }
  }

  document.addEventListener("pointerdown", (event) => {
    if (!aktivni) return;
    if (event.target.closest(".editorQuickToolbar, .editorToolbarPanel, .editorBottomBar")) {
      core()?.zachytAktualniVyber?.();
    }
  }, true);

  document.addEventListener("click", zpracujToolbarCapture, true);

  document.addEventListener("keydown", (event) => {
    if (!aktivni || event.key !== "Escape") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    editorBackButton.click();
  }, true);

  document.addEventListener("selectionchange", () => {
    if (!aktivni) return;
    const vyber = window.getSelection();
    if (!vyber?.rangeCount) return;
    const range = vyber.getRangeAt(0);
    if (!hostitel?.contains(range.commonAncestorContainer)) return;
    requestAnimationFrame(obnovToolbar);
  });

  function sledujEditor() {
    observer = new MutationObserver(() => {
      if (pozastavAktivaci) return;
      if (!jeEditorOtevreny()) {
        if (aktivni) deaktivuj();
        return;
      }

      if (!jeTestRezimZapnuty()) return;
      const token = ++posledniAktivaceToken;
      queueMicrotask(() => {
        if (token !== posledniAktivaceToken) return;
        aktivujProOtevrenouPoznamku();
      });
    });

    observer.observe(taskModal, {
      attributes: true,
      attributeFilter: ["class", "hidden", "data-task-id"]
    });
  }

  vytvorPomocneUi();
  sledujEditor();

  window.LubaNoteEditorV2Bridge = Object.freeze({
    verze: "V2.6-BRIDGE-375",
    prepniTestRezim,
    jeTestRezimZapnuty,
    aktivujProOtevrenouPoznamku,
    ulozTestKopii,
    jeAktivni: () => aktivni
  });
})();
