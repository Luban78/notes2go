/* ============================================================
   LubaNote – IMAGE FLOAT CARET FIX V4
   ------------------------------------------------------------
   Úzký doplněk pouze pro hlavní rich-text editor.

   Problém:
   Vedle 25/50% plovoucího obrázku existuje po vložení jen jeden
   skutečný prázdný editovatelný řádek. Android WebView proto umí
   umístit kurzor pouze do prvního řádku vedle obrázku; vizuálně
   volné místo níže žádnou caret pozici nemá.

   Řešení:
   Když uživatel klepne na prázdnou plochu hlavního editoru vedle
   plovoucího obrázku, vytvoříme jen tolik skutečných prázdných
   .lubaNoteImageTextLine řádků, kolik je potřeba k dosažení výšky
   klepnutí, a kurzor vložíme do příslušného řádku.

   DŮLEŽITÉ:
   - neběží v TODO editoru,
   - neběží uvnitř Bulletu,
   - nereaguje na tap přímo na obrázek,
   - nemění editorMedia.js ani jeho 1×/2× tap a drag logiku,
   - nic nedělá u 100% / centrovaného obrázku,
   - V4 navíc při tapu těsně POD floatem umí chybějící koncový řádek bezpečně doplnit.
============================================================ */

(() => {
  const hlavniEditor =
    document.getElementById("modalRichText");

  if (!hlavniEditor) {
    return;
  }

  const TRIDA_RADKU = "lubaNoteImageTextLine";
  const TRIDA_RADKU_POD_OBRAZKEM = "lubaNoteImageBelowLine";
  const MAX_NOVYCH_RADKU = 24;

  function jePlovouciObrazek(figure) {
    if (
      !figure?.classList?.contains("lubaNoteImage") ||
      figure.parentElement !== hlavniEditor
    ) {
      return false;
    }

    const zarovnani =
      figure.dataset.zarovnani ||
      figure.querySelector("img")?.dataset?.zarovnani ||
      "stred";

    const velikost =
      figure.dataset.velikost ||
      figure.querySelector("img")?.dataset?.velikost ||
      "prizpusobit";

    const cisloVelikosti = Number(velikost);

    return Boolean(
      (zarovnani === "vlevo" || zarovnani === "vpravo") &&
      velikost !== "prizpusobit" &&
      Number.isFinite(cisloVelikosti) &&
      cisloVelikosti < 100
    );
  }

  function najdiObrazekVedleBodu(clientX, clientY) {
    const editorRect =
      hlavniEditor.getBoundingClientRect();

    const obrazky = [
      ...hlavniEditor.children
    ].filter(jePlovouciObrazek);

    for (const figure of obrazky) {
      const rect = figure.getBoundingClientRect();

      if (
        clientY < rect.top ||
        clientY > rect.bottom
      ) {
        continue;
      }

      const zarovnani =
        figure.dataset.zarovnani ||
        figure.querySelector("img")?.dataset?.zarovnani ||
        "stred";

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

  function vytvorPrazdnyRadek() {
    const radek = document.createElement("div");
    radek.className = TRIDA_RADKU;
    radek.append(document.createElement("br"));
    return radek;
  }

  function ziskejSouvisleRadkyZaObrazkem(figure) {
    const radky = [];
    let uzel = figure.nextElementSibling;

    while (uzel?.classList?.contains(TRIDA_RADKU)) {
      radky.push(uzel);
      uzel = uzel.nextElementSibling;
    }

    return radky;
  }

  function jePrazdnyPrimeRadek(uzel) {
    if (!(uzel instanceof HTMLElement)) {
      return false;
    }

    if (uzel.parentElement !== hlavniEditor) {
      return false;
    }

    if (
      uzel.classList.contains("lubaNoteImage") ||
      uzel.contentEditable === "false" ||
      uzel.querySelector(
        ".lubaNoteImage, img, a, button, input, textarea, [contenteditable='false']"
      )
    ) {
      return false;
    }

    return String(uzel.textContent || "").trim() === "";
  }

  function patriRadekKPlovoucimuObrazku(radek) {
    let uzel = radek?.previousElementSibling || null;

    while (uzel?.classList?.contains(TRIDA_RADKU)) {
      uzel = uzel.previousElementSibling;
    }

    return jePlovouciObrazek(uzel);
  }

  function najdiPlovouciObrazekNadBodem(clientX, clientY) {
    const editorRect =
      hlavniEditor.getBoundingClientRect();

    if (
      clientX < editorRect.left ||
      clientX > editorRect.right ||
      clientY < editorRect.top ||
      clientY > editorRect.bottom
    ) {
      return null;
    }

    const lineHeight = Number.parseFloat(
      getComputedStyle(hlavniEditor).lineHeight
    );

    const maxVzdalenostPod = Math.max(
      48,
      Number.isFinite(lineHeight)
        ? lineHeight * 2.5
        : 60
    );

    let nejblizsi = null;
    let nejmensiVzdalenost = Infinity;

    for (const figure of [
      ...hlavniEditor.children
    ].filter(jePlovouciObrazek)) {
      const rect = figure.getBoundingClientRect();
      const vzdalenost = clientY - rect.bottom;

      if (
        vzdalenost < -1 ||
        vzdalenost > maxVzdalenostPod
      ) {
        continue;
      }

      if (vzdalenost < nejmensiVzdalenost) {
        nejblizsi = figure;
        nejmensiVzdalenost = vzdalenost;
      }
    }

    return nejblizsi;
  }

  function najdiNeboVytvorRadekPodObrazkem(figure) {
    if (!jePlovouciObrazek(figure)) {
      return null;
    }

    let posledni = figure;
    let uzel = figure.nextElementSibling;

    /*
     * Řádky vytvořené 0.9.305 jsou záměrně text VEDLE obrázku.
     * Koncový řádek pod obrázkem proto patří až za celý tento souvislý blok.
     */
    while (uzel?.classList?.contains(TRIDA_RADKU)) {
      posledni = uzel;
      uzel = uzel.nextElementSibling;
    }

    if (
      uzel?.classList?.contains(TRIDA_RADKU_POD_OBRAZKEM) &&
      jePrazdnyPrimeRadek(uzel)
    ) {
      uzel.style.clear = "both";
      return { radek: uzel, zmeneno: false };
    }

    /*
     * Starší poznámka může mít za floatem obyčejný prázdný <div><br>,
     * ale bez naší značky. Nejdřív znovu použijeme právě ten; žádný nový
     * obsah nevytváříme, jen z něj uděláme skutečný koncový řádek pod floatem.
     */
    if (jePrazdnyPrimeRadek(uzel)) {
      uzel.classList.add(TRIDA_RADKU_POD_OBRAZKEM);
      uzel.style.clear = "both";
      return { radek: uzel, zmeneno: true };
    }

    /*
     * VD potvrdil případ, kdy pod floatem není vůbec žádný caret cíl
     * (below=none, candidate=null, tap přitom míří na kořen editoru).
     * Teprve v tomto přesně omezeném případě vytvoříme jediný řádek.
     */
    const novyRadek = document.createElement("div");
    novyRadek.classList.add(TRIDA_RADKU_POD_OBRAZKEM);
    novyRadek.style.clear = "both";
    novyRadek.append(document.createElement("br"));
    posledni.after(novyRadek);

    return { radek: novyRadek, zmeneno: true };
  }

  function nastavKurzorDoRadku(radek) {
    if (!radek?.isConnected) {
      return false;
    }

    try {
      hlavniEditor.focus({ preventScroll: true });
    } catch (_) {
      hlavniEditor.focus();
    }

    const range = document.createRange();
    range.selectNodeContents(radek);
    range.collapse(true);

    const selection = window.getSelection();

    if (!selection) {
      return false;
    }

    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }

  function najdiNeboVytvorRadekProBod(
    figure,
    clientY
  ) {
    const figureRect = figure.getBoundingClientRect();
    const cilY = Math.min(
      Math.max(clientY, figureRect.top),
      figureRect.bottom
    );

    const radky =
      ziskejSouvisleRadkyZaObrazkem(figure);

    let vytvoreno = 0;

    if (radky.length === 0) {
      const prvni = vytvorPrazdnyRadek();
      figure.after(prvni);
      radky.push(prvni);
      vytvoreno += 1;
    }

    for (const radek of radky) {
      const rect = radek.getBoundingClientRect();

      if (
        cilY >= rect.top - 1 &&
        cilY <= rect.bottom + 1
      ) {
        return { radek, vytvoreno };
      }
    }

    let posledni = radky[radky.length - 1];

    while (vytvoreno < MAX_NOVYCH_RADKU) {
      const posledniRect =
        posledni.getBoundingClientRect();

      if (cilY <= posledniRect.bottom + 1) {
        return { radek: posledni, vytvoreno };
      }

      const novy = vytvorPrazdnyRadek();
      posledni.after(novy);
      posledni = novy;
      vytvoreno += 1;

      const novyRect = novy.getBoundingClientRect();

      if (
        cilY >= novyRect.top - 1 &&
        cilY <= novyRect.bottom + 1
      ) {
        return { radek: novy, vytvoreno };
      }
    }

    return { radek: posledni, vytvoreno };
  }

  hlavniEditor.addEventListener(
    "click",
    (event) => {
      /*
       * editorMedia.js už před tímto listenerem zpracuje svůj běžný
       * click. My zasahujeme jen do prázdné plochy kořene editoru.
       * Tap na obrázek, text, Bullet, link, ovládání atd. se nás netýká.
       */
      /*
       * 0.9.304 za obrázkem záměrně vytváří skutečný prázdný
       * <div><br></div>, aby bylo kam pokračovat po obrázku.
       * Po doplnění řádků 0.9.305 se tento blok přirozeně odsune
       * až pod float. Android WebView ale někdy tap na prázdný blok
       * nepromění na caret. Pokud uživatel klepne právě na tento
       * prázdný přímý řádek navazující na float obrázek, pouze do něj
       * explicitně nastavíme kurzor. DOM ani obsah tím neměníme.
       */
      const cilovyElement =
        event.target instanceof Element
          ? event.target
          : null;

      const radekPodObrazkem =
        cilovyElement?.closest?.(
          `.${TRIDA_RADKU_POD_OBRAZKEM}`
        ) || null;

      if (
        jePrazdnyPrimeRadek(radekPodObrazkem) &&
        patriRadekKPlovoucimuObrazku(radekPodObrazkem)
      ) {
        nastavKurzorDoRadku(radekPodObrazkem);
        return;
      }

      if (event.target !== hlavniEditor) {
        return;
      }

      const figure = najdiObrazekVedleBodu(
        event.clientX,
        event.clientY
      );

      if (!figure) {
        const figureNadBodem =
          najdiPlovouciObrazekNadBodem(
            event.clientX,
            event.clientY
          );

        if (!figureNadBodem) {
          return;
        }

        const vysledekPod =
          najdiNeboVytvorRadekPodObrazkem(
            figureNadBodem
          );

        if (!vysledekPod?.radek) {
          return;
        }

        if (vysledekPod.zmeneno) {
          hlavniEditor.dispatchEvent(
            new Event("input", { bubbles: true })
          );
        }

        nastavKurzorDoRadku(vysledekPod.radek);
        return;
      }

      const vysledek = najdiNeboVytvorRadekProBod(
        figure,
        event.clientY
      );

      if (!vysledek?.radek) {
        return;
      }

      if (vysledek.vytvoreno > 0) {
        hlavniEditor.dispatchEvent(
          new Event("input", { bubbles: true })
        );
      }

      nastavKurzorDoRadku(vysledek.radek);
    }
  );
})();
