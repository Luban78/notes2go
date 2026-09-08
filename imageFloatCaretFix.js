/* ============================================================
   LubaNote – IMAGE FLOAT CARET FIX V3
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
   - V3 cílí jen na označený koncový řádek pod floatem a přijme i tap na jeho <br>.
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


  const imageVD = {
    radky: [],
    max: 120
  };

  function zapisVD(text) {
    const radek = `${Math.round(performance.now())} ms | ${text}`;
    imageVD.radky.push(radek);
    if (imageVD.radky.length > imageVD.max) {
      imageVD.radky.shift();
    }
    try {
      window.LubaNoteStartupDiag?.zapis?.("IMG-VD", text);
    } catch (_) {}
  }

  function popisElementu(el) {
    if (!(el instanceof Element)) return String(el?.nodeName || el || "null");
    const id = el.id ? `#${el.id}` : "";
    const cls = [...el.classList].slice(0, 4).map(x => `.${x}`).join("");
    return `${el.tagName.toLowerCase()}${id}${cls}`;
  }

  function popisRect(el) {
    if (!el?.getBoundingClientRect) return "none";
    const r = el.getBoundingClientRect();
    return `x=${Math.round(r.left)}..${Math.round(r.right)} y=${Math.round(r.top)}..${Math.round(r.bottom)} h=${Math.round(r.height)}`;
  }

  function popisSelection() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return "none";
    const a = sel.anchorNode;
    const p = a?.nodeType === Node.TEXT_NODE ? a.parentElement : a;
    return `${popisElementu(p)} off=${sel.anchorOffset} text=${JSON.stringify(String(a?.textContent || "").slice(0, 24))}`;
  }

  function snapshotVD(event, faze) {
    const x = Math.round(event?.clientX ?? -1);
    const y = Math.round(event?.clientY ?? -1);
    const podPrstem = document.elementFromPoint?.(x, y) || null;
    const below = [...hlavniEditor.querySelectorAll(`.${TRIDA_RADKU_POD_OBRAZKEM}`)];
    const posledniBelow = below[below.length - 1] || null;
    const figs = [...hlavniEditor.children].filter(el => el.classList?.contains("lubaNoteImage"));
    const figText = figs.map((f, i) => {
      const z = f.dataset.zarovnani || f.querySelector("img")?.dataset?.zarovnani || "?";
      const v = f.dataset.velikost || f.querySelector("img")?.dataset?.velikost || "?";
      return `f${i}[${z}/${v} ${popisRect(f)}]`;
    }).join(" ") || "none";
    let belowText = "none";
    if (posledniBelow) {
      const cs = getComputedStyle(posledniBelow);
      belowText = `${popisElementu(posledniBelow)} ${popisRect(posledniBelow)} clear=${cs.clear} disp=${cs.display} pe=${cs.pointerEvents} ce=${posledniBelow.contentEditable || "inherit"}`;
    }
    zapisVD(`${faze} | xy=${x},${y} target=${popisElementu(event?.target)} efp=${popisElementu(podPrstem)} | editor ${popisRect(hlavniEditor)} | below=${belowText} | figs=${figText} | sel=${popisSelection()}`);
  }

  window.LubaNoteImageCaretVD = {
    radky: () => [...imageVD.radky],
    report: () => [
      "LUBANOTE IMG-VD COMPACT REPORT",
      ...imageVD.radky
    ].join("\n")
  };

  zapisVD("DIAGNOSTIKA AKTIVNI | behavior=0.9.308 unchanged");

  hlavniEditor.addEventListener("pointerdown", (event) => {
    snapshotVD(event, "POINTERDOWN CAPTURE");
  }, true);

  hlavniEditor.addEventListener("click", (event) => {
    snapshotVD(event, "CLICK CAPTURE");
  }, true);

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
      zapisVD(`CLICK BUBBLE START | target=${popisElementu(event.target)} xy=${Math.round(event.clientX)},${Math.round(event.clientY)}`);
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

      const jePrazdnyBelow = jePrazdnyPrimeRadek(radekPodObrazkem);
      const patriBelow = patriRadekKPlovoucimuObrazku(radekPodObrazkem);

      zapisVD(`BELOW TEST | candidate=${popisElementu(radekPodObrazkem)} prazdny=${jePrazdnyBelow} patri=${patriBelow} rect=${popisRect(radekPodObrazkem)}`);

      if (jePrazdnyBelow && patriBelow) {
        const ok = nastavKurzorDoRadku(radekPodObrazkem);
        zapisVD(`BELOW CARET | ok=${ok} sel=${popisSelection()}`);
        setTimeout(() => zapisVD(`BELOW CARET +50ms | sel=${popisSelection()}`), 50);
        return;
      }

      if (event.target !== hlavniEditor) {
        zapisVD(`EXIT NONROOT | target=${popisElementu(event.target)}`);
        return;
      }

      const figure = najdiObrazekVedleBodu(
        event.clientX,
        event.clientY
      );

      if (!figure) {
        zapisVD(`ROOT NO FIGURE | xy=${Math.round(event.clientX)},${Math.round(event.clientY)}`);
        return;
      }

      zapisVD(`ROOT FIGURE | ${popisRect(figure)}`);

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

      const okCaret = nastavKurzorDoRadku(vysledek.radek);
      zapisVD(`SIDE CARET | ok=${okCaret} created=${vysledek.vytvoreno} row=${popisRect(vysledek.radek)} sel=${popisSelection()}`);
    }
  );
})();
