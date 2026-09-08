/* ============================================================
   LubaNote – ENTER VISUAL FORMAT RESET V1
   ------------------------------------------------------------
   Úzký fix pouze pro hlavní rich-text editor (#modalRichText).

   Problém:
   Android WebView po Enteru na KONCI obarveného / zvýrazněného /
   zvětšeného textu vytvoří nový prázdný řádek uvnitř kopie
   původních inline wrapperů. Další psaní proto zdědí barvu,
   zvýraznění i velikost.

   Řešení:
   Necháme WebView provést Enter normálně. Až po insertParagraph
   zkontrolujeme NOVÝ PRÁZDNÝ řádek pod kurzorem. Pokud v něm
   skutečně zůstala vizuální inline stopa (barva / pozadí /
   velikost / richTextHighlight), odstraníme pouze obsah těchto
   prázdných wrapperů a necháme čisté <br>. Předchozí text,
   výběry, B/I/U, TODO, Bullet ani media gesta se nemění.
============================================================ */

(() => {
  const editor = document.getElementById("modalRichText");

  if (!editor) {
    return;
  }

  let cekaNaEnter = false;

  function jeSelectionVEditoru() {
    const selection = window.getSelection();

    if (
      !selection ||
      selection.rangeCount === 0 ||
      !selection.isCollapsed
    ) {
      return false;
    }

    const range = selection.getRangeAt(0);
    let uzel = range.startContainer;

    if (uzel === editor) {
      return true;
    }

    if (uzel?.nodeType === Node.TEXT_NODE) {
      uzel = uzel.parentElement;
    }

    return Boolean(
      uzel instanceof Node && editor.contains(uzel)
    );
  }

  function ziskejHorniRadekPodKurzorem() {
    const selection = window.getSelection();

    if (
      !selection ||
      selection.rangeCount === 0 ||
      !selection.isCollapsed
    ) {
      return null;
    }

    const range = selection.getRangeAt(0);
    let uzel = range.startContainer;

    /*
     * WebView může po Enteru držet caret přímo v kořeni editoru.
     * V tom případě vezmeme nejbližší child podle offsetu.
     */
    if (uzel === editor) {
      const offset = range.startOffset;
      uzel =
        editor.childNodes[offset] ||
        editor.childNodes[offset - 1] ||
        null;
    }

    if (!uzel) {
      return null;
    }

    if (uzel.nodeType === Node.TEXT_NODE) {
      uzel = uzel.parentElement;
    }

    if (!(uzel instanceof HTMLElement)) {
      return null;
    }

    while (
      uzel.parentElement &&
      uzel.parentElement !== editor
    ) {
      uzel = uzel.parentElement;
    }

    return uzel.parentElement === editor
      ? uzel
      : null;
  }

  function jeRadekPrazdny(radek) {
    if (!(radek instanceof HTMLElement)) {
      return false;
    }

    if (String(radek.textContent || "").trim() !== "") {
      return false;
    }

    return !radek.querySelector(
      ".lubaNoteImage, img, a, button, input, textarea, " +
      "video, audio, iframe, [contenteditable='false']"
    );
  }

  function maVizualniStopu(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    if (element.classList.contains("richTextHighlight")) {
      return true;
    }

    if (element.tagName === "FONT") {
      return true;
    }

    const styl = element.style;

    return Boolean(
      styl.color ||
      styl.background ||
      styl.backgroundColor ||
      styl.fontSize
    );
  }

  function maPrenesenouVizualniStopu(radek) {
    if (maVizualniStopu(radek)) {
      return true;
    }

    return [...radek.querySelectorAll("*")]
      .some(maVizualniStopu);
  }

  function vycistiVizualniStylRadku(radek) {
    /*
     * Radek je v tuto chvíli prokazatelně prázdný. Proto je
     * nejbezpečnější odstranit jen jeho prázdné inline wrappery
     * a ponechat samotný top-level blok i jeho případné třídy.
     */
    radek.replaceChildren(document.createElement("br"));

    /*
     * Kdyby WebView přenesl vizuální styl přímo na blok, smažeme
     * jen čtyři vlastnosti, kterých se tento bug týká. Žádné jiné
     * layoutové / editorové styly se nedotknou.
     */
    radek.classList.remove("richTextHighlight");
    radek.style.removeProperty("color");
    radek.style.removeProperty("background");
    radek.style.removeProperty("background-color");
    radek.style.removeProperty("font-size");
  }

  function nastavKurzorNaZacatek(radek) {
    const selection = window.getSelection();

    if (!selection || !radek?.isConnected) {
      return;
    }

    const range = document.createRange();
    range.selectNodeContents(radek);
    range.collapse(true);

    selection.removeAllRanges();
    selection.addRange(range);
  }

  function opravNovyRadekPoEnteru() {
    const radek = ziskejHorniRadekPodKurzorem();

    if (
      !radek ||
      !jeRadekPrazdny(radek) ||
      !maPrenesenouVizualniStopu(radek)
    ) {
      return;
    }

    vycistiVizualniStylRadku(radek);
    nastavKurzorNaZacatek(radek);
  }

  editor.addEventListener("beforeinput", (event) => {
    if (
      event.inputType === "insertParagraph" &&
      jeSelectionVEditoru()
    ) {
      cekaNaEnter = true;
    }
  });

  /* Fallback pro WebView verze, které beforeinput nehlásí spolehlivě. */
  editor.addEventListener("keydown", (event) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      jeSelectionVEditoru()
    ) {
      cekaNaEnter = true;
    }
  });

  editor.addEventListener("input", (event) => {
    const jeEnter =
      event.inputType === "insertParagraph" ||
      cekaNaEnter;

    cekaNaEnter = false;

    if (!jeEnter) {
      return;
    }

    /* DOM po insertParagraph už je hotový; jen očistíme nový prázdný řádek. */
    queueMicrotask(opravNovyRadekPoEnteru);
  });
})();
