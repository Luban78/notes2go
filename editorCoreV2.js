/* ========================================
   LUBANOTE – EDITOR CORE V2 (LAB)
   FÁZE V2.2a: vlastní model segmentů + stabilní selection controller + logická velikost písma.

   DŮLEŽITÉ:
   - Tento modul NESMÍ měnit produkční editor ani ukládat poznámky.
   - Aktivuje se z Debug Hubu nebo přímo 5× rychlým tapem na „Připomínky“.
   - Zdrojem pravdy je `dokument`, DOM je jen vykreslení.
   - Logická velikost písma se NIKDY neurčuje z fyzického getComputedStyle().fontSize.
     Android/WebView může text systémově škálovat; model si stále drží např. 13/20 px.
   - Pro podporované beforeinput operace se vždy volá preventDefault(),
     takže WebView nesmí svévolně měnit strukturu dokumentu.
======================================== */

(() => {
  "use strict";

  const VERZE_MODELU = 2;
  const VELIKOSTI_PISMA = [12, 14, 16, 18, 20, 24, 28, 32];
  const PODPOROVANE_INPUTY = new Set([
    "insertText",
    "insertParagraph",
    "insertLineBreak",
    "deleteContentBackward",
    "deleteContentForward",
    "deleteWordBackward",
    "deleteWordForward"
  ]);

  const VYCHOZI_FORMAT = Object.freeze({
    tucne: false,
    kurziva: false,
    podtrzeni: false,
    velikost: null,
    barva: null,
    pozadi: null
  });

  let lab = null;
  let editor = null;
  let modelPanel = null;
  let stavEl = null;
  let velikostEl = null;
  let toolbarVelikosti = null;
  let zapisDebug = null;
  let dokument = null;
  let dalsiIdBloku = 1;
  let posledniPozice = { blok: 0, offset: 0 };
  let posledniVyber = null;
  let ulozenyFormatovaciVyber = null;
  let aktivniFormatPsani = null;
  let aktivniFormatPozice = "";
  let posluchace = [];
  let observerDomu = null;
  let casyRychlehoSpusteni = [];

  function noveIdBloku() {
    return `v2b-${Date.now().toString(36)}-${dalsiIdBloku++}`;
  }

  function cisloVelikosti(hodnota) {
    if (hodnota === null || hodnota === undefined || hodnota === "") return null;
    const cislo = Number(hodnota);
    return Number.isFinite(cislo) ? cislo : null;
  }

  function kopieFormatu(format = VYCHOZI_FORMAT) {
    return {
      tucne: Boolean(format?.tucne),
      kurziva: Boolean(format?.kurziva),
      podtrzeni: Boolean(format?.podtrzeni),
      velikost: cisloVelikosti(format?.velikost),
      barva: format?.barva ?? null,
      pozadi: format?.pozadi ?? null
    };
  }

  function stejneFormaty(a, b) {
    return Boolean(a?.tucne) === Boolean(b?.tucne)
      && Boolean(a?.kurziva) === Boolean(b?.kurziva)
      && Boolean(a?.podtrzeni) === Boolean(b?.podtrzeni)
      && (a?.velikost ?? null) === (b?.velikost ?? null)
      && (a?.barva ?? null) === (b?.barva ?? null)
      && (a?.pozadi ?? null) === (b?.pozadi ?? null);
  }

  function vytvorSegment(text = "", format = VYCHOZI_FORMAT) {
    return {
      text: String(text),
      format: kopieFormatu(format)
    };
  }

  function normalizujObsah(obsah) {
    const vystup = [];

    (Array.isArray(obsah) ? obsah : []).forEach((cast) => {
      if (!cast) return;
      const text = String(cast.text ?? "");
      const format = kopieFormatu(cast.format);
      if (!text) return;

      const posledni = vystup[vystup.length - 1];
      if (posledni && stejneFormaty(posledni.format, format)) {
        posledni.text += text;
      } else {
        vystup.push(vytvorSegment(text, format));
      }
    });

    return vystup.length ? vystup : [vytvorSegment("")];
  }

  function vytvorOdstavec(text = "", format = VYCHOZI_FORMAT) {
    return {
      id: noveIdBloku(),
      typ: "odstavec",
      zarovnani: "left",
      obsah: [vytvorSegment(text, format)]
    };
  }

  function vytvorOdstavecZObsahu(obsah, zarovnani = "left") {
    return {
      id: noveIdBloku(),
      typ: "odstavec",
      zarovnani,
      obsah: normalizujObsah(obsah)
    };
  }

  function zjistiZakladniVelikost() {
    const kandidati = [];

    try {
      kandidati.push(getComputedStyle(document.documentElement).getPropertyValue("--font-size"));
    } catch (_error) {}

    try {
      kandidati.push(getComputedStyle(document.body).getPropertyValue("--font-size"));
    } catch (_error) {}

    for (const hodnota of kandidati) {
      const cislo = Number.parseFloat(String(hodnota || "").trim());
      if (Number.isFinite(cislo) && cislo >= 8 && cislo <= 72) return cislo;
    }

    // LAB fallback je pouze při chybějící globální proměnné. V produkčním V2
    // bude základní velikost součástí nastavení dokumentu/profilu.
    return 16;
  }

  function vytvorDokument(texty = [""]) {
    const bloky = texty.length ? texty.map((text) => vytvorOdstavec(text)) : [vytvorOdstavec("")];
    return {
      verze: VERZE_MODELU,
      typ: "lubanote-dokument",
      nastaveni: {
        zakladniVelikost: zjistiZakladniVelikost()
      },
      bloky
    };
  }

  function zakladniVelikost() {
    const cislo = Number(dokument?.nastaveni?.zakladniVelikost);
    return Number.isFinite(cislo) && cislo >= 8 && cislo <= 72 ? cislo : 16;
  }

  function textBloku(blok) {
    return Array.isArray(blok?.obsah)
      ? blok.obsah.map((cast) => String(cast?.text ?? "")).join("")
      : "";
  }

  function nastavObsahBloku(blok, obsah) {
    blok.obsah = normalizujObsah(obsah);
  }

  function normalizujDokument() {
    if (!dokument || !Array.isArray(dokument.bloky)) {
      dokument = vytvorDokument();
    }

    if (!dokument.nastaveni || typeof dokument.nastaveni !== "object") {
      dokument.nastaveni = { zakladniVelikost: zjistiZakladniVelikost() };
    }

    if (!Number.isFinite(Number(dokument.nastaveni.zakladniVelikost))) {
      dokument.nastaveni.zakladniVelikost = zjistiZakladniVelikost();
    }

    dokument.verze = VERZE_MODELU;
    dokument.bloky = dokument.bloky.filter((blok) => blok && blok.typ === "odstavec");
    if (!dokument.bloky.length) dokument.bloky.push(vytvorOdstavec(""));

    dokument.bloky.forEach((blok) => {
      if (!blok.id) blok.id = noveIdBloku();
      if (!Array.isArray(blok.obsah)) blok.obsah = [vytvorSegment("")];
      blok.obsah = normalizujObsah(blok.obsah);
      blok.zarovnani ||= "left";
    });
  }

  function spocitejOffsetVBloku(blokEl, node, offset) {
    if (!blokEl || !node) return 0;

    const range = document.createRange();
    try {
      range.setStart(blokEl, 0);
      range.setEnd(node, offset);
      return range.toString().length;
    } catch (_error) {
      return 0;
    }
  }

  function domBodNaModel(node, offset) {
    if (!editor || !node) return null;

    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    const blokEl = element?.closest?.("[data-ln-v2-blok]");
    if (!blokEl || !editor.contains(blokEl)) return null;

    const blok = dokument.bloky.findIndex((polozka) => polozka.id === blokEl.dataset.lnV2Blok);
    if (blok < 0) return null;

    const delka = textBloku(dokument.bloky[blok]).length;
    const modelOffset = Math.max(0, Math.min(delka, spocitejOffsetVBloku(blokEl, node, offset)));
    return { blok, offset: modelOffset };
  }

  function porovnejPozice(a, b) {
    if (a.blok !== b.blok) return a.blok - b.blok;
    return a.offset - b.offset;
  }

  function klicPozice(pozice) {
    return `${pozice?.blok ?? -1}:${pozice?.offset ?? -1}`;
  }

  function klonVyberu(vyber) {
    if (!vyber) return null;
    return {
      zacatek: { ...vyber.zacatek },
      konec: { ...vyber.konec },
      sbaleny: Boolean(vyber.sbaleny)
    };
  }

  function vyberZPosledniPozice() {
    return {
      zacatek: { ...posledniPozice },
      konec: { ...posledniPozice },
      sbaleny: true
    };
  }

  function aktualniVyberModelu() {
    const vyber = window.getSelection();
    if (!vyber?.rangeCount) return posledniVyber ? klonVyberu(posledniVyber) : vyberZPosledniPozice();

    const range = vyber.getRangeAt(0);
    if (!editor?.contains(range.commonAncestorContainer)) {
      return posledniVyber ? klonVyberu(posledniVyber) : vyberZPosledniPozice();
    }

    let zacatek = domBodNaModel(range.startContainer, range.startOffset);
    let konec = domBodNaModel(range.endContainer, range.endOffset);
    if (!zacatek || !konec) return posledniVyber ? klonVyberu(posledniVyber) : vyberZPosledniPozice();

    if (porovnejPozice(zacatek, konec) > 0) {
      [zacatek, konec] = [konec, zacatek];
    }

    posledniPozice = { ...konec };
    posledniVyber = {
      zacatek,
      konec,
      sbaleny: zacatek.blok === konec.blok && zacatek.offset === konec.offset
    };

    // V2.2a: selection controller si drží vlastní modelový snapshot.
    // Nativní Android nabídka může DOM selection později skrýt nebo přesunout focus,
    // ale formátovací akce dál používají tento uložený rozsah.
    ulozenyFormatovaciVyber = klonVyberu(posledniVyber);
    return klonVyberu(posledniVyber);
  }

  function najdiDomBod(blokIndex, modelOffset) {
    const blok = dokument.bloky[blokIndex];
    if (!blok) return null;
    const blokEl = editor?.querySelector(`[data-ln-v2-blok="${CSS.escape(blok.id)}"]`);
    if (!blokEl) return null;

    const cil = Math.max(0, Math.min(textBloku(blok).length, modelOffset));
    const walker = document.createTreeWalker(blokEl, NodeFilter.SHOW_TEXT);
    let soucet = 0;
    let node = walker.nextNode();

    while (node) {
      const delka = node.nodeValue?.length || 0;
      if (cil <= soucet + delka) {
        return { node, offset: Math.max(0, cil - soucet) };
      }
      soucet += delka;
      node = walker.nextNode();
    }

    return { node: blokEl, offset: blokEl.childNodes.length };
  }

  function nastavVyberModelu(zacatek, konec = zacatek) {
    if (!editor) return;
    const domZacatek = najdiDomBod(zacatek.blok, zacatek.offset);
    const domKonec = najdiDomBod(konec.blok, konec.offset);
    if (!domZacatek || !domKonec) return;

    const range = document.createRange();
    range.setStart(domZacatek.node, domZacatek.offset);
    range.setEnd(domKonec.node, domKonec.offset);

    const vyber = window.getSelection();
    vyber.removeAllRanges();
    vyber.addRange(range);
    posledniPozice = { ...konec };
    posledniVyber = {
      zacatek: { ...zacatek },
      konec: { ...konec },
      sbaleny: zacatek.blok === konec.blok && zacatek.offset === konec.offset
    };
    ulozenyFormatovaciVyber = klonVyberu(posledniVyber);
  }

  function ziskejFormatovaciVyber() {
    return klonVyberu(
      ulozenyFormatovaciVyber
      || posledniVyber
      || aktualniVyberModelu()
      || vyberZPosledniPozice()
    );
  }

  function vykresliFormat(span, format) {
    const velikost = cisloVelikosti(format?.velikost);
    if (velikost !== null) {
      span.style.fontSize = `${velikost}px`;
      span.dataset.lnV2Velikost = String(velikost);
    } else {
      span.dataset.lnV2Velikost = "zaklad";
    }

    if (format?.tucne) span.style.fontWeight = "700";
    if (format?.kurziva) span.style.fontStyle = "italic";
    if (format?.podtrzeni) span.style.textDecoration = "underline";
    if (format?.barva) span.style.color = format.barva;
    if (format?.pozadi) span.style.backgroundColor = format.pozadi;
  }

  function vykresli(vyberNeboCaret = posledniVyber || posledniPozice) {
    if (!editor) return;
    normalizujDokument();

    const fragment = document.createDocumentFragment();

    dokument.bloky.forEach((blok) => {
      const radek = document.createElement("div");
      radek.className = "ln-v2-odstavec";
      radek.dataset.lnV2Blok = blok.id;
      radek.dataset.typ = blok.typ;
      radek.style.textAlign = blok.zarovnani || "left";

      const text = textBloku(blok);
      if (text) {
        blok.obsah.forEach((cast, index) => {
          if (!cast.text) return;
          const span = document.createElement("span");
          span.className = "ln-v2-cast";
          span.dataset.lnV2Segment = String(index);
          vykresliFormat(span, cast.format);
          span.appendChild(document.createTextNode(cast.text));
          radek.appendChild(span);
        });
      } else {
        const br = document.createElement("br");
        br.dataset.lnV2Prazdny = "1";
        radek.appendChild(br);
      }

      fragment.appendChild(radek);
    });

    observerDomu?.disconnect();
    editor.replaceChildren(fragment);
    editor.style.fontSize = `${zakladniVelikost()}px`;
    observerDomu?.observe(editor, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    });

    aktualizujModelPanel();

    let vyberKOprave = null;
    if (vyberNeboCaret?.zacatek && vyberNeboCaret?.konec) {
      vyberKOprave = klonVyberu(vyberNeboCaret);
    } else if (Number.isInteger(vyberNeboCaret?.blok)) {
      vyberKOprave = {
        zacatek: { ...vyberNeboCaret },
        konec: { ...vyberNeboCaret },
        sbaleny: true
      };
    }

    if (vyberKOprave) {
      posledniVyber = klonVyberu(vyberKOprave);
      queueMicrotask(() => {
        try {
          nastavVyberModelu(vyberKOprave.zacatek, vyberKOprave.konec);
          aktualizujToolbarVelikosti(vyberKOprave);
        } catch (_error) {
          // LAB nesmí ovlivnit produkční editor ani při chybě selection.
        }
      });
    } else {
      aktualizujToolbarVelikosti();
    }
  }

  function rozdelObsah(blok, offset) {
    const cil = Math.max(0, Math.min(textBloku(blok).length, offset));
    const vlevo = [];
    const vpravo = [];
    let pozice = 0;

    blok.obsah.forEach((cast) => {
      const text = String(cast.text ?? "");
      const konec = pozice + text.length;

      if (cil <= pozice) {
        if (text) vpravo.push(vytvorSegment(text, cast.format));
      } else if (cil >= konec) {
        if (text) vlevo.push(vytvorSegment(text, cast.format));
      } else {
        const mistni = cil - pozice;
        const levaCast = text.slice(0, mistni);
        const pravaCast = text.slice(mistni);
        if (levaCast) vlevo.push(vytvorSegment(levaCast, cast.format));
        if (pravaCast) vpravo.push(vytvorSegment(pravaCast, cast.format));
      }

      pozice = konec;
    });

    return { vlevo, vpravo };
  }

  function formatNaPozici(blok, offset) {
    if (!blok?.obsah?.length) return kopieFormatu();
    const delkaBloku = textBloku(blok).length;
    if (!delkaBloku) return kopieFormatu(blok.obsah[0]?.format);

    const cil = Math.max(0, Math.min(delkaBloku, offset));
    let pozice = 0;

    for (let index = 0; index < blok.obsah.length; index += 1) {
      const cast = blok.obsah[index];
      const konec = pozice + String(cast.text ?? "").length;
      if (cil >= pozice && (cil < konec || (cil === konec && index === blok.obsah.length - 1))) {
        return kopieFormatu(cast.format);
      }
      pozice = konec;
    }

    return kopieFormatu(blok.obsah[blok.obsah.length - 1]?.format);
  }

  function formatZDomBodu() {
    const vyber = window.getSelection();
    if (!vyber?.rangeCount) return null;
    const range = vyber.getRangeAt(0);
    if (!editor?.contains(range.startContainer)) return null;

    const element = range.startContainer.nodeType === Node.ELEMENT_NODE
      ? range.startContainer
      : range.startContainer.parentElement;
    const segmentEl = element?.closest?.("[data-ln-v2-segment]");
    const blokEl = element?.closest?.("[data-ln-v2-blok]");
    if (!segmentEl || !blokEl) return null;

    const blokIndex = dokument.bloky.findIndex((blok) => blok.id === blokEl.dataset.lnV2Blok);
    const segmentIndex = Number(segmentEl.dataset.lnV2Segment);
    return kopieFormatu(dokument.bloky[blokIndex]?.obsah?.[segmentIndex]?.format);
  }

  function smazVyber(vyber) {
    if (vyber.sbaleny) return { ...vyber.zacatek };

    const { zacatek, konec } = vyber;
    if (zacatek.blok === konec.blok) {
      const blok = dokument.bloky[zacatek.blok];
      const prvniRez = rozdelObsah(blok, zacatek.offset);
      const druhyRez = rozdelObsah(blok, konec.offset);
      nastavObsahBloku(blok, [...prvniRez.vlevo, ...druhyRez.vpravo]);
      return { ...zacatek };
    }

    const prvni = dokument.bloky[zacatek.blok];
    const posledni = dokument.bloky[konec.blok];
    const prvniRez = rozdelObsah(prvni, zacatek.offset);
    const posledniRez = rozdelObsah(posledni, konec.offset);
    nastavObsahBloku(prvni, [...prvniRez.vlevo, ...posledniRez.vpravo]);
    dokument.bloky.splice(zacatek.blok + 1, konec.blok - zacatek.blok);
    return { ...zacatek };
  }

  function vlozText(text, vyber, formatVlozeni = null) {
    const format = kopieFormatu(
      formatVlozeni
      || aktivniFormatPsani
      || formatZDomBodu()
      || formatNaPozici(dokument.bloky[vyber.zacatek.blok], vyber.zacatek.offset)
    );

    const caret = smazVyber(vyber);
    const blok = dokument.bloky[caret.blok];
    const rez = rozdelObsah(blok, caret.offset);
    nastavObsahBloku(blok, [...rez.vlevo, vytvorSegment(text, format), ...rez.vpravo]);
    return { blok: caret.blok, offset: caret.offset + text.length };
  }

  function vlozOdstavec(vyber) {
    const format = kopieFormatu(
      aktivniFormatPsani
      || formatZDomBodu()
      || formatNaPozici(dokument.bloky[vyber.zacatek.blok], vyber.zacatek.offset)
    );
    const caret = smazVyber(vyber);
    const blok = dokument.bloky[caret.blok];
    const rez = rozdelObsah(blok, caret.offset);
    nastavObsahBloku(blok, rez.vlevo);

    const novyObsah = rez.vpravo.length ? rez.vpravo : [vytvorSegment("", format)];
    const novy = vytvorOdstavecZObsahu(novyObsah, blok.zarovnani || "left");
    dokument.bloky.splice(caret.blok + 1, 0, novy);
    return { blok: caret.blok + 1, offset: 0 };
  }

  function predchoziGraphem(text, offset) {
    if (offset <= 0) return 0;
    if (typeof Intl?.Segmenter !== "function") return offset - 1;

    try {
      const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
      let predchozi = 0;
      for (const segment of segmenter.segment(text.slice(0, offset))) predchozi = segment.index;
      return predchozi;
    } catch (_error) {
      return offset - 1;
    }
  }

  function dalsiGraphem(text, offset) {
    if (offset >= text.length) return text.length;
    if (typeof Intl?.Segmenter !== "function") return offset + 1;

    try {
      const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
      const segmenty = Array.from(segmenter.segment(text.slice(offset)));
      const delka = segmenty[0]?.segment?.length || 1;
      return Math.min(text.length, offset + delka);
    } catch (_error) {
      return offset + 1;
    }
  }

  function smazZpet(vyber, celeSlovo = false) {
    if (!vyber.sbaleny) return smazVyber(vyber);

    const caret = vyber.zacatek;
    const blok = dokument.bloky[caret.blok];
    const text = textBloku(blok);

    if (caret.offset > 0) {
      let od = predchoziGraphem(text, caret.offset);
      if (celeSlovo) {
        const cast = text.slice(0, caret.offset);
        const match = cast.match(/(?:\s+|\S+)$/u);
        if (match) od = caret.offset - match[0].length;
      }
      return smazVyber({
        zacatek: { blok: caret.blok, offset: od },
        konec: { ...caret },
        sbaleny: false
      });
    }

    if (caret.blok === 0) return caret;

    const predchozi = dokument.bloky[caret.blok - 1];
    const predText = textBloku(predchozi);
    nastavObsahBloku(predchozi, [...predchozi.obsah, ...blok.obsah]);
    dokument.bloky.splice(caret.blok, 1);
    return { blok: caret.blok - 1, offset: predText.length };
  }

  function smazVpred(vyber, celeSlovo = false) {
    if (!vyber.sbaleny) return smazVyber(vyber);

    const caret = vyber.zacatek;
    const blok = dokument.bloky[caret.blok];
    const text = textBloku(blok);

    if (caret.offset < text.length) {
      let doPozice = dalsiGraphem(text, caret.offset);
      if (celeSlovo) {
        const cast = text.slice(caret.offset);
        const match = cast.match(/^(?:\s+|\S+)/u);
        if (match) doPozice = caret.offset + match[0].length;
      }
      return smazVyber({
        zacatek: { ...caret },
        konec: { blok: caret.blok, offset: doPozice },
        sbaleny: false
      });
    }

    if (caret.blok >= dokument.bloky.length - 1) return caret;

    const dalsi = dokument.bloky[caret.blok + 1];
    nastavObsahBloku(blok, [...blok.obsah, ...dalsi.obsah]);
    dokument.bloky.splice(caret.blok + 1, 1);
    return caret;
  }

  function vlozViceRadku(text, vyber) {
    const radky = String(text).replace(/\r\n?/g, "\n").split("\n");
    const format = kopieFormatu(
      aktivniFormatPsani
      || formatZDomBodu()
      || formatNaPozici(dokument.bloky[vyber.zacatek.blok], vyber.zacatek.offset)
    );
    let caret = smazVyber(vyber);

    caret = vlozText(radky.shift() || "", { zacatek: caret, konec: caret, sbaleny: true }, format);

    radky.forEach((radek) => {
      caret = vlozOdstavec({ zacatek: caret, konec: caret, sbaleny: true });
      caret = vlozText(radek, { zacatek: caret, konec: caret, sbaleny: true }, format);
    });

    return caret;
  }

  function nastavVelikostVBloku(blok, od, doPozice, velikost) {
    const odPozice = Math.max(0, Math.min(textBloku(blok).length, od));
    const konecPozice = Math.max(odPozice, Math.min(textBloku(blok).length, doPozice));
    if (odPozice === konecPozice) return;

    const vystup = [];
    let pozice = 0;

    blok.obsah.forEach((cast) => {
      const text = String(cast.text ?? "");
      const konec = pozice + text.length;
      const prekryvOd = Math.max(pozice, odPozice);
      const prekryvDo = Math.min(konec, konecPozice);

      if (prekryvOd >= prekryvDo) {
        if (text) vystup.push(vytvorSegment(text, cast.format));
      } else {
        const pred = text.slice(0, prekryvOd - pozice);
        const stred = text.slice(prekryvOd - pozice, prekryvDo - pozice);
        const po = text.slice(prekryvDo - pozice);

        if (pred) vystup.push(vytvorSegment(pred, cast.format));
        if (stred) {
          const novyFormat = kopieFormatu(cast.format);
          novyFormat.velikost = velikost;
          vystup.push(vytvorSegment(stred, novyFormat));
        }
        if (po) vystup.push(vytvorSegment(po, cast.format));
      }

      pozice = konec;
    });

    nastavObsahBloku(blok, vystup);
  }

  function aplikujVelikostNaVyber(vyber, velikost) {
    if (!vyber || vyber.sbaleny) return;

    for (let index = vyber.zacatek.blok; index <= vyber.konec.blok; index += 1) {
      const blok = dokument.bloky[index];
      const od = index === vyber.zacatek.blok ? vyber.zacatek.offset : 0;
      const doPozice = index === vyber.konec.blok ? vyber.konec.offset : textBloku(blok).length;
      nastavVelikostVBloku(blok, od, doPozice, velikost);
    }
  }

  function velikostiVeVyberu(vyber) {
    const hodnoty = new Set();
    let jeZaklad = true;

    if (!vyber) return { hodnoty, jeZaklad };

    if (vyber.sbaleny) {
      let format = null;
      if (aktivniFormatPsani && aktivniFormatPozice === klicPozice(vyber.zacatek)) {
        format = aktivniFormatPsani;
      } else {
        format = formatZDomBodu() || formatNaPozici(dokument.bloky[vyber.zacatek.blok], vyber.zacatek.offset);
      }
      const explicitni = cisloVelikosti(format?.velikost);
      jeZaklad = explicitni === null;
      hodnoty.add(jeZaklad ? zakladniVelikost() : explicitni);
      return { hodnoty, jeZaklad };
    }

    for (let index = vyber.zacatek.blok; index <= vyber.konec.blok; index += 1) {
      const blok = dokument.bloky[index];
      const od = index === vyber.zacatek.blok ? vyber.zacatek.offset : 0;
      const doPozice = index === vyber.konec.blok ? vyber.konec.offset : textBloku(blok).length;
      let pozice = 0;

      blok.obsah.forEach((cast) => {
        const konec = pozice + String(cast.text ?? "").length;
        if (Math.max(pozice, od) < Math.min(konec, doPozice)) {
          const explicitni = cisloVelikosti(cast.format?.velikost);
          const zaklad = explicitni === null;
          if (!zaklad) jeZaklad = false;
          hodnoty.add(zaklad ? zakladniVelikost() : explicitni);
        }
        pozice = konec;
      });
    }

    return { hodnoty, jeZaklad: jeZaklad && hodnoty.size === 1 };
  }

  function aktualizujToolbarVelikosti(vyber = posledniVyber || vyberZPosledniPozice()) {
    if (!velikostEl || !toolbarVelikosti || !dokument) return;

    const info = velikostiVeVyberu(vyber);
    const hodnoty = Array.from(info.hodnoty);
    const jedna = hodnoty.length === 1 ? hodnoty[0] : null;
    velikostEl.textContent = jedna == null ? "mix" : String(jedna);

    toolbarVelikosti.querySelectorAll("[data-v2-velikost]").forEach((tlacitko) => {
      const hodnota = tlacitko.dataset.v2Velikost;
      let aktivni = false;

      if (hodnota === "zaklad") {
        aktivni = info.jeZaklad;
        tlacitko.textContent = `Základ ${zakladniVelikost()}`;
      } else {
        aktivni = jedna != null && Number(hodnota) === jedna && !info.jeZaklad;
      }

      tlacitko.classList.toggle("aktivni", aktivni);
      tlacitko.setAttribute("aria-pressed", aktivni ? "true" : "false");
    });
  }

  function nastavVelikostZToolbaru(hodnota) {
    const vyber = ziskejFormatovaciVyber();
    if (!vyber) return;

    const velikost = hodnota === "zaklad" ? null : Number(hodnota);
    if (velikost !== null && (!Number.isFinite(velikost) || velikost < 8 || velikost > 72)) return;

    if (vyber.sbaleny) {
      const format = formatZDomBodu() || formatNaPozici(dokument.bloky[vyber.zacatek.blok], vyber.zacatek.offset);
      aktivniFormatPsani = kopieFormatu(format);
      aktivniFormatPsani.velikost = velikost;
      aktivniFormatPozice = klicPozice(vyber.zacatek);
      aktualizujToolbarVelikosti(vyber);
      nastavStav(
        velikost === null
          ? `Nově psaný text: základ ${zakladniVelikost()}`
          : `Nově psaný text: ${velikost}`
      );
      zapisDebug?.(`EDITOR V2 LAB | typing-size=${velikost ?? `base:${zakladniVelikost()}`}`);
      editor.focus({ preventScroll: true });
      nastavVyberModelu(vyber.zacatek, vyber.konec);
      return;
    }

    aplikujVelikostNaVyber(vyber, velikost);
    aktivniFormatPsani = null;
    aktivniFormatPozice = "";
    vykresli(vyber);
    nastavStav(
      velikost === null
        ? `Výběr vrácen na základní velikost ${zakladniVelikost()}`
        : `Velikost výběru nastavena na ${velikost}`
    );
    zapisDebug?.(
      `EDITOR V2 LAB | selection-size=${velikost ?? `base:${zakladniVelikost()}`} | ${vyber.zacatek.blok}:${vyber.zacatek.offset}-${vyber.konec.blok}:${vyber.konec.offset}`
    );
  }

  function zpracujBeforeInput(event) {
    if (!PODPOROVANE_INPUTY.has(event.inputType)) {
      // V2 LAB nikdy nepředá nepodporovaný zásah browseru.
      // Jinak by DOM přestal odpovídat našemu modelu.
      event.preventDefault();

      if (event.inputType === "insertFromPaste") return;

      const ime = event.inputType?.startsWith("insertComposition") || event.inputType?.includes("Composition");
      nastavStav(
        ime
          ? `IME/composition zatím není ve V2.2a podporováno: ${event.inputType}`
          : `V2.2a zablokoval nepodporovaný vstup: ${event.inputType || "neznámý"}`,
        true
      );
      zapisDebug?.(`EDITOR V2 LAB | BLOCK INPUT | ${event.inputType || "unknown"}`);
      return;
    }

    event.preventDefault();
    const vyber = aktualniVyberModelu();
    let caret = vyber.zacatek;

    if (event.inputType === "insertText") {
      caret = vlozText(event.data ?? "", vyber);
    } else if (event.inputType === "insertParagraph" || event.inputType === "insertLineBreak") {
      caret = vlozOdstavec(vyber);
    } else if (event.inputType === "deleteContentBackward") {
      caret = smazZpet(vyber, false);
    } else if (event.inputType === "deleteContentForward") {
      caret = smazVpred(vyber, false);
    } else if (event.inputType === "deleteWordBackward") {
      caret = smazZpet(vyber, true);
    } else if (event.inputType === "deleteWordForward") {
      caret = smazVpred(vyber, true);
    }

    aktivniFormatPozice = klicPozice(caret);
    const novyVyber = { zacatek: caret, konec: caret, sbaleny: true };
    vykresli(novyVyber);
    nastavStav(`Řízeno modelem: ${event.inputType}`);
    zapisDebug?.(`EDITOR V2 LAB | ${event.inputType} | blok=${caret.blok} offset=${caret.offset}`);
  }

  function zpracujPaste(event) {
    const text = event.clipboardData?.getData("text/plain");
    if (typeof text !== "string") return;
    event.preventDefault();
    const caret = vlozViceRadku(text, aktualniVyberModelu());
    const novyVyber = { zacatek: caret, konec: caret, sbaleny: true };
    vykresli(novyVyber);
    nastavStav("Vložení prostého textu řídil model");
    zapisDebug?.(`EDITOR V2 LAB | paste | chars=${text.length}`);
  }

  function overDomProtiModelu() {
    if (!editor || !dokument) return "editor/model není dostupný";
    const blokyDom = Array.from(editor.children);
    if (blokyDom.length !== dokument.bloky.length) return `počet bloků DOM=${blokyDom.length} model=${dokument.bloky.length}`;

    for (let b = 0; b < dokument.bloky.length; b += 1) {
      const blok = dokument.bloky[b];
      const blokEl = blokyDom[b];
      if (!blokEl?.matches?.(".ln-v2-odstavec[data-ln-v2-blok]")) return `blok ${b}: neplatný element`;
      if (blokEl.dataset.lnV2Blok !== blok.id) return `blok ${b}: jiné id`;
      if (blokEl.textContent !== textBloku(blok)) return `blok ${b}: jiný text`;

      if (!textBloku(blok)) {
        if (blokEl.children.length !== 1 || !blokEl.firstElementChild?.matches?.("br[data-ln-v2-prazdny]")) {
          return `blok ${b}: neplatný prázdný blok`;
        }
        continue;
      }

      const segmentyDom = Array.from(blokEl.children);
      const segmentyModel = blok.obsah.filter((cast) => cast.text);
      if (segmentyDom.length !== segmentyModel.length) return `blok ${b}: počet segmentů DOM=${segmentyDom.length} model=${segmentyModel.length}`;

      for (let s = 0; s < segmentyModel.length; s += 1) {
        const span = segmentyDom[s];
        const cast = segmentyModel[s];
        if (!span?.matches?.("span.ln-v2-cast[data-ln-v2-segment]")) return `blok ${b} segment ${s}: cizí DOM`;
        if (span.childNodes.length !== 1 || span.firstChild?.nodeType !== Node.TEXT_NODE) return `blok ${b} segment ${s}: cizí vnořený DOM`;
        if (span.textContent !== cast.text) return `blok ${b} segment ${s}: jiný text`;

        const modelVelikost = cisloVelikosti(cast.format?.velikost);
        const domVelikost = span.dataset.lnV2Velikost;
        if (modelVelikost !== null) {
          if (domVelikost !== String(modelVelikost) || span.style.fontSize !== `${modelVelikost}px`) {
            return `blok ${b} segment ${s}: jiná velikost DOM/model`;
          }
        } else if (domVelikost !== "zaklad" || span.style.fontSize) {
          return `blok ${b} segment ${s}: základní velikost má cizí inline styl`;
        }
      }
    }

    return "";
  }

  function kontrolaDomu() {
    const chyba = overDomProtiModelu();
    if (chyba) {
      nastavStav(`DOM GUARD: ${chyba}`, true);
      zapisDebug?.(`EDITOR V2 LAB | DOM GUARD FAIL | ${chyba}`);
      return false;
    }
    nastavStav("DOM čistý: přesně odpovídá V2 modelu");
    zapisDebug?.("EDITOR V2 LAB | DOM GUARD OK");
    return true;
  }

  function aktualizujModelPanel() {
    if (!modelPanel) return;
    modelPanel.textContent = JSON.stringify(dokument, null, 2);
  }

  function nastavStav(text, chyba = false) {
    if (!stavEl) return;
    stavEl.textContent = text;
    stavEl.classList.toggle("chyba", Boolean(chyba));
  }

  function poslouchej(target, typ, handler, options) {
    target.addEventListener(typ, handler, options);
    posluchace.push(() => target.removeEventListener(typ, handler, options));
  }

  function vytvorLab() {
    lab = document.createElement("section");
    lab.id = "ln-editor-v2-lab";
    lab.className = "ln-v2-lab";
    lab.innerHTML = `
      <header class="ln-v2-hlavicka">
        <div>
          <strong>Editor Core V2.2a · LAB</strong>
          <small>Izolovaný test · nic se neukládá do poznámek</small>
        </div>
        <button type="button" class="ln-v2-zavrit" data-v2-akce="zavrit" aria-label="Zavřít Editor Core V2">×</button>
      </header>

      <div class="ln-v2-info">
        <span class="ln-v2-badge">MODEL = ZDROJ PRAVDY</span>
        <span class="ln-v2-stav">Připraveno</span>
      </div>

      <div
        class="ln-v2-editor"
        contenteditable="true"
        role="textbox"
        aria-multiline="true"
        spellcheck="true"
        autocapitalize="sentences"
        data-ln-v2-editor
      ></div>

      <div class="ln-v2-akce">
        <button type="button" data-v2-akce="reset">Reset testu</button>
        <button type="button" data-v2-akce="model">Zobrazit model</button>
        <button type="button" data-v2-akce="dom">Kontrola DOM</button>
      </div>

      <pre class="ln-v2-model" hidden></pre>

      <div class="ln-v2-format" data-v2-toolbar-velikosti>
        <span class="ln-v2-format-hodnota">Velikost: <strong data-v2-aktualni-velikost>–</strong></span>
        <button type="button" data-v2-velikost="zaklad" aria-pressed="false">Základ</button>
        ${VELIKOSTI_PISMA.map((velikost) => `<button type="button" data-v2-velikost="${velikost}" aria-pressed="false">${velikost}</button>`).join("")}
      </div>

      <footer class="ln-v2-paticka">
        V2.2a: selection controller drží výběr v modelu a lišta velikostí je dole mimo nativní Android menu. Základní i explicitní velikost žije v modelu; DOM ji pouze vykreslí. B/I/U, barvy, obrázky, TODO, odkazy, IME a ukládání zůstávají vypnuté.
      </footer>
    `;

    document.body.appendChild(lab);
    editor = lab.querySelector("[data-ln-v2-editor]");
    modelPanel = lab.querySelector(".ln-v2-model");
    stavEl = lab.querySelector(".ln-v2-stav");
    velikostEl = lab.querySelector("[data-v2-aktualni-velikost]");
    toolbarVelikosti = lab.querySelector("[data-v2-toolbar-velikosti]");

    poslouchej(editor, "beforeinput", zpracujBeforeInput);
    poslouchej(editor, "paste", zpracujPaste);
    poslouchej(editor, "input", () => kontrolaDomu());

    poslouchej(document, "selectionchange", () => {
      if (!lab || lab.hidden || !editor) return;
      const vyber = window.getSelection();
      if (!vyber?.rangeCount) return;
      const range = vyber.getRangeAt(0);
      if (!editor.contains(range.commonAncestorContainer)) return;

      const predchoziKlic = klicPozice(posledniVyber?.konec);
      const modelovyVyber = aktualniVyberModelu();
      const novyKlic = klicPozice(modelovyVyber.konec);
      if (predchoziKlic && predchoziKlic !== novyKlic && aktivniFormatPozice !== novyKlic) {
        aktivniFormatPsani = null;
        aktivniFormatPozice = "";
      }
      aktualizujToolbarVelikosti(modelovyVyber);
    });

    // V2.2a – stabilní selection controller.
    // Před tapem na formátovací lištu zachytíme rozsah do našeho modelu.
    // Android může následně zavřít svou nativní nabídku nebo přesunout focus;
    // formátovací akce už nejsou závislé na živé DOM Selection.
    poslouchej(toolbarVelikosti, "pointerdown", (event) => {
      if (!event.target.closest("[data-v2-velikost]")) return;
      const vyber = aktualniVyberModelu();
      if (vyber) ulozenyFormatovaciVyber = klonVyberu(vyber);
    }, true);

    poslouchej(toolbarVelikosti, "click", (event) => {
      const tlacitko = event.target.closest("[data-v2-velikost]");
      if (!tlacitko) return;
      nastavVelikostZToolbaru(tlacitko.dataset.v2Velikost);
    });

    observerDomu = new MutationObserver((mutace) => {
      if (!editor || !mutace.length) return;
      const chyba = overDomProtiModelu();
      if (!chyba) return;
      nastavStav(`DOM GUARD: WebView změnil DOM mimo model · ${chyba} · vracím model`, true);
      zapisDebug?.(`EDITOR V2 LAB | DOM MUTATION OUTSIDE MODEL | count=${mutace.length} | ${chyba}`);
      vykresli(posledniVyber || posledniPozice);
    });
    observerDomu.observe(editor, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    });

    poslouchej(lab, "click", (event) => {
      const tlacitko = event.target.closest("[data-v2-akce]");
      if (!tlacitko) return;

      const akce = tlacitko.dataset.v2Akce;
      if (akce === "zavrit") {
        zavriLab();
      } else if (akce === "reset") {
        resetujTest();
      } else if (akce === "model") {
        modelPanel.hidden = !modelPanel.hidden;
        tlacitko.textContent = modelPanel.hidden ? "Zobrazit model" : "Skrýt model";
      } else if (akce === "dom") {
        kontrolaDomu();
      }
    });
  }

  function resetujTest() {
    dokument = vytvorDokument([
      "Toto je izolovaný Editor Core V2.",
      "Označ slovo velikost a změň mu velikost písma.",
      "Pak klikej mezi normálním a zvětšeným textem – číslo musí vždy pocházet z modelu."
    ]);
    posledniPozice = { blok: 1, offset: 0 };
    posledniVyber = {
      zacatek: { ...posledniPozice },
      konec: { ...posledniPozice },
      sbaleny: true
    };
    ulozenyFormatovaciVyber = klonVyberu(posledniVyber);
    aktivniFormatPsani = null;
    aktivniFormatPozice = "";
    vykresli(posledniVyber);
    nastavStav(`Test resetován · základní velikost modelu = ${zakladniVelikost()}`);
    editor.focus({ preventScroll: true });
    zapisDebug?.(`EDITOR V2 LAB | reset | base-size=${zakladniVelikost()}`);
  }

  function otevriLab(options = {}) {
    zapisDebug = typeof options.zapis === "function" ? options.zapis : null;

    if (!lab?.isConnected) vytvorLab();
    lab.hidden = false;
    lab.classList.add("otevreno");
    document.body.classList.add("ln-v2-lab-otevren");

    if (!dokument) resetujTest();
    else vykresli(posledniVyber || posledniPozice);

    editor.focus({ preventScroll: true });
    zapisDebug?.("EDITOR V2 LAB | OPEN V2.2a | produkční editor nedotčen");
    return true;
  }

  function zavriLab() {
    if (!lab) return;
    lab.hidden = true;
    lab.classList.remove("otevreno");
    document.body.classList.remove("ln-v2-lab-otevren");
    zapisDebug?.("EDITOR V2 LAB | CLOSE | model zůstává jen v RAM do resetu stránky");
  }

  function znicLab() {
    posluchace.splice(0).forEach((odpoj) => {
      try { odpoj(); } catch (_error) {}
    });
    observerDomu?.disconnect();
    observerDomu = null;
    lab?.remove();
    lab = null;
    editor = null;
    modelPanel = null;
    stavEl = null;
    velikostEl = null;
    toolbarVelikosti = null;
    dokument = null;
    posledniVyber = null;
    ulozenyFormatovaciVyber = null;
    aktivniFormatPsani = null;
    aktivniFormatPozice = "";
    zapisDebug = null;
    document.body.classList.remove("ln-v2-lab-otevren");
  }

  function skryjDebugPanelyProPrimeSpusteni() {
    // Přímý LAB launcher má být čistý: pokud byl předtím otevřen VD/Debug Hub,
    // zavřeme pouze jejich UI. Produkční moduly ani data tím neměníme.
    try { window.LubaNoteDebugHub?.stop?.(); } catch (_error) {}
    try { window.LubaNoteVisualDebug?.close?.(); } catch (_error) {}

    const debugHub = document.getElementById("ln-debug-hub");
    if (debugHub) debugHub.hidden = true;
  }

  function otevriLabPrimo() {
    skryjDebugPanelyProPrimeSpusteni();
    return otevriLab();
  }

  function pripojRychlySpoustec() {
    const tlacitko = document.getElementById("remindersModuleButton");
    if (!tlacitko || tlacitko.dataset.lnV2LabLauncher === "1") return;

    tlacitko.dataset.lnV2LabLauncher = "1";
    tlacitko.addEventListener("click", () => {
      const ted = performance.now();
      casyRychlehoSpusteni = casyRychlehoSpusteni.filter((cas) => ted - cas < 2200);
      casyRychlehoSpusteni.push(ted);

      if (casyRychlehoSpusteni.length < 5) return;
      casyRychlehoSpusteni = [];

      queueMicrotask(() => {
        otevriLabPrimo();
      });
    }, true);
  }

  pripojRychlySpoustec();

  window.LubaNoteEditorV2 = Object.freeze({
    verze: "V2.2a-LAB-369",
    otevriLab,
    otevriLabPrimo,
    zavriLab,
    znicLab,
    resetujTest,
    ziskejModel: () => (dokument ? structuredClone(dokument) : null)
  });
})();
