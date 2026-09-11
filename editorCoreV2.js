/* ========================================
   LUBANOTE – EDITOR CORE V2 (LAB)
   FÁZE V2.9: vlastní model + LubaNote Bridge TEST mode + internetové odkazy jako atribut segmentu.

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
  const LIMIT_HISTORIE = 100;
  const PALETA_BAREV = [
    { hodnota: "#ef4444", nazev: "červená" },
    { hodnota: "#f59e0b", nazev: "oranžová" },
    { hodnota: "#eab308", nazev: "žlutá" },
    { hodnota: "#22c55e", nazev: "zelená" },
    { hodnota: "#3b82f6", nazev: "modrá" },
    { hodnota: "#a855f7", nazev: "fialová" }
  ];
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
    pozadi: null,
    stylTextu: null,
    odkaz: null
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
  let aktivniFormatZdroj = ""; // "uzivatel" = výslovně zapnuto toolbar-em, "zdedeny" = např. delete-affinity
  let posluchace = [];
  let observerDomu = null;
  let casyRychlehoSpusteni = [];
  let historieZpet = [];
  let historieVpred = [];
  let tlacitkoUndo = null;
  let tlacitkoRedo = null;
  let vlozenyHostitel = null;
  let vlozenyRezim = false;

  function noveIdBloku() {
    return `v2b-${Date.now().toString(36)}-${dalsiIdBloku++}`;
  }

  function klonDat(hodnota) {
    try {
      return structuredClone(hodnota);
    } catch (_error) {
      return JSON.parse(JSON.stringify(hodnota));
    }
  }

  function vytvorSnapshotHistorie(vyber = null) {
    const selection = klonVyberu(vyber || posledniVyber || vyberZPosledniPozice());
    return {
      dokument: klonDat(dokument),
      posledniPozice: { ...posledniPozice },
      posledniVyber: selection,
      ulozenyFormatovaciVyber: klonVyberu(ulozenyFormatovaciVyber),
      aktivniFormatPsani: aktivniFormatPsani ? kopieFormatu(aktivniFormatPsani) : null,
      aktivniFormatPozice: String(aktivniFormatPozice || ""),
      aktivniFormatZdroj: String(aktivniFormatZdroj || "")
    };
  }

  function otiskDokumentu(doc = dokument) {
    try {
      return JSON.stringify(doc);
    } catch (_error) {
      return "";
    }
  }

  function aktualizujTlacitkaHistorie() {
    if (tlacitkoUndo) {
      tlacitkoUndo.disabled = historieZpet.length === 0;
      tlacitkoUndo.setAttribute("aria-disabled", historieZpet.length === 0 ? "true" : "false");
      tlacitkoUndo.title = historieZpet.length ? `Undo · ${historieZpet.length}` : "Undo není k dispozici";
    }
    if (tlacitkoRedo) {
      tlacitkoRedo.disabled = historieVpred.length === 0;
      tlacitkoRedo.setAttribute("aria-disabled", historieVpred.length === 0 ? "true" : "false");
      tlacitkoRedo.title = historieVpred.length ? `Redo · ${historieVpred.length}` : "Redo není k dispozici";
    }
  }

  function ulozZmenuDoHistorie(snapshotPred, popis) {
    if (!snapshotPred?.dokument) return false;
    if (otiskDokumentu(snapshotPred.dokument) === otiskDokumentu(dokument)) return false;

    historieZpet.push({ ...snapshotPred, popis: String(popis || "změna") });
    if (historieZpet.length > LIMIT_HISTORIE) historieZpet.shift();
    historieVpred = [];
    aktualizujTlacitkaHistorie();
    return true;
  }

  function obnovSnapshotHistorie(snapshot) {
    if (!snapshot?.dokument) return false;

    dokument = klonDat(snapshot.dokument);
    posledniPozice = snapshot.posledniPozice ? { ...snapshot.posledniPozice } : { blok: 0, offset: 0 };
    posledniVyber = klonVyberu(snapshot.posledniVyber) || vyberZPosledniPozice();
    ulozenyFormatovaciVyber = klonVyberu(snapshot.ulozenyFormatovaciVyber) || klonVyberu(posledniVyber);
    aktivniFormatPsani = snapshot.aktivniFormatPsani ? kopieFormatu(snapshot.aktivniFormatPsani) : null;
    aktivniFormatPozice = String(snapshot.aktivniFormatPozice || "");
    aktivniFormatZdroj = String(snapshot.aktivniFormatZdroj || "");

    vykresli(posledniVyber);
    aktualizujTlacitkaHistorie();
    return true;
  }

  function vratHistoriiZpet() {
    if (!historieZpet.length) {
      nastavStav("Undo: není co vrátit");
      return false;
    }

    const cil = historieZpet.pop();
    const aktualni = vytvorSnapshotHistorie(posledniVyber);
    historieVpred.push({ ...aktualni, popis: cil.popis || "změna" });
    if (historieVpred.length > LIMIT_HISTORIE) historieVpred.shift();

    obnovSnapshotHistorie(cil);
    nastavStav(`Undo: ${cil.popis || "změna"}`);
    zapisDebug?.(`EDITOR V2 LAB | UNDO | ${cil.popis || "zmena"} | undo=${historieZpet.length} redo=${historieVpred.length}`);
    return true;
  }

  function vratHistoriiVpred() {
    if (!historieVpred.length) {
      nastavStav("Redo: není co znovu provést");
      return false;
    }

    const cil = historieVpred.pop();
    const aktualni = vytvorSnapshotHistorie(posledniVyber);
    historieZpet.push({ ...aktualni, popis: cil.popis || "změna" });
    if (historieZpet.length > LIMIT_HISTORIE) historieZpet.shift();

    obnovSnapshotHistorie(cil);
    nastavStav(`Redo: ${cil.popis || "změna"}`);
    zapisDebug?.(`EDITOR V2 LAB | REDO | ${cil.popis || "zmena"} | undo=${historieZpet.length} redo=${historieVpred.length}`);
    return true;
  }

  function cisloVelikosti(hodnota) {
    if (hodnota === null || hodnota === undefined || hodnota === "") return null;
    const cislo = Number(hodnota);
    return Number.isFinite(cislo) ? cislo : null;
  }

  function normalizujStylTextu(hodnota) {
    const styl = String(hodnota || "").trim().toLowerCase();
    return ["h1", "h2", "h3"].includes(styl) ? styl : null;
  }

  function normalizujInternetovouAdresu(hodnota) {
    const raw = String(hodnota || "").trim();
    if (!raw) return null;

    let kandidat = raw;
    if (!/^https?:\/\//i.test(kandidat)) kandidat = `https://${kandidat}`;

    try {
      const url = new URL(kandidat);
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
      return url.href;
    } catch (_error) {
      return null;
    }
  }

  function kopieFormatu(format = VYCHOZI_FORMAT) {
    return {
      tucne: Boolean(format?.tucne),
      kurziva: Boolean(format?.kurziva),
      podtrzeni: Boolean(format?.podtrzeni),
      velikost: cisloVelikosti(format?.velikost),
      barva: format?.barva ?? null,
      pozadi: format?.pozadi ?? null,
      stylTextu: normalizujStylTextu(format?.stylTextu),
      odkaz: normalizujInternetovouAdresu(format?.odkaz)
    };
  }

  function stejneFormaty(a, b) {
    return Boolean(a?.tucne) === Boolean(b?.tucne)
      && Boolean(a?.kurziva) === Boolean(b?.kurziva)
      && Boolean(a?.podtrzeni) === Boolean(b?.podtrzeni)
      && (a?.velikost ?? null) === (b?.velikost ?? null)
      && (a?.barva ?? null) === (b?.barva ?? null)
      && (a?.pozadi ?? null) === (b?.pozadi ?? null)
      && normalizujStylTextu(a?.stylTextu) === normalizujStylTextu(b?.stylTextu)
      && normalizujInternetovouAdresu(a?.odkaz) === normalizujInternetovouAdresu(b?.odkaz);
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
      blok.zarovnani = normalizujZarovnani(blok.zarovnani);
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

    // V2.3: selection controller si drží vlastní modelový snapshot.
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

    const stylTextu = normalizujStylTextu(format?.stylTextu);
    span.dataset.lnV2StylTextu = stylTextu || "text";
    if (stylTextu) span.classList.add("ln-v2-nadpis", `ln-v2-${stylTextu}`);

    const odkaz = normalizujInternetovouAdresu(format?.odkaz);
    span.dataset.lnV2Odkaz = odkaz || "";
    if (odkaz) {
      span.classList.add("ln-v2-odkaz");
      span.setAttribute("role", "link");
      span.setAttribute("aria-label", `Internetový odkaz: ${odkaz}`);
    }
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

  // V2.6b – aktivní formát má jasný původ.
  // „uzivatel“ = uživatel jej výslovně zapnul tlačítkem a může psát více slov;
  // „zdedeny“ = formát vznikl automaticky (např. delete-affinity po mazání).
  // Mezerník zděděný formát UKONČÍ: samotná mezera se vloží bez zděděného
  // formátu a další text už pokračuje normálně. Výslovně zapnutý formát
  // mezerník neruší. Díky tomu se barva/B/I/U/velikost nemůže náhodně
  // přenášet za formátované slovo, ale ručně zapnuté B/I/U může běžet přes větu.
  function jeWhitespaceText(text) {
    return typeof text === "string" && text.length > 0 && /^\s+$/u.test(text);
  }

  function jePoziceNaHraniciFormatu(blok, offset) {
    if (!blok?.obsah?.length) return false;
    const delka = textBloku(blok).length;
    const cil = Math.max(0, Math.min(delka, offset));

    // Začátek/konec formátovaného obsahu je také hranice vůči okolnímu
    // základnímu textu – mezera tam nemá formát samovolně prodlužovat.
    if (cil === 0 || cil === delka) return true;

    let pozice = 0;
    for (let i = 0; i < blok.obsah.length - 1; i += 1) {
      pozice += String(blok.obsah[i]?.text ?? "").length;
      if (cil === pozice) return true;
    }
    return false;
  }

  function vlozText(text, vyber, formatVlozeni = null) {
    const blokPredVlozenim = dokument.bloky[vyber.zacatek.blok];
    const jeWhitespace = jeWhitespaceText(text);
    const aktivniJeRucni = Boolean(
      aktivniFormatPsani
      && aktivniFormatPozice === klicPozice(vyber.zacatek)
      && aktivniFormatZdroj === "uzivatel"
    );
    const aktivniJeZdedeny = Boolean(
      aktivniFormatPsani
      && aktivniFormatPozice === klicPozice(vyber.zacatek)
      && aktivniFormatZdroj === "zdedeny"
    );
    const whitespaceNaHranici = Boolean(
      !formatVlozeni
      && !aktivniJeRucni
      && vyber?.sbaleny
      && jeWhitespace
      && (aktivniJeZdedeny || jePoziceNaHraniciFormatu(blokPredVlozenim, vyber.zacatek.offset))
    );

    const format = kopieFormatu(
      formatVlozeni
      || (aktivniJeRucni ? aktivniFormatPsani : null)
      || (whitespaceNaHranici ? VYCHOZI_FORMAT : null)
      || aktivniFormatPsani
      || formatZDomBodu()
      || formatNaPozici(blokPredVlozenim, vyber.zacatek.offset)
    );

    const caret = smazVyber(vyber);
    const blok = dokument.bloky[caret.blok];
    const rez = rozdelObsah(blok, caret.offset);
    nastavObsahBloku(blok, [...rez.vlevo, vytvorSegment(text, format), ...rez.vpravo]);

    // Zděděný formát končí prvním mezerníkem. Ručně zapnutý formát pokračuje.
    if (jeWhitespace && aktivniJeZdedeny) {
      aktivniFormatPsani = null;
      aktivniFormatPozice = "";
      aktivniFormatZdroj = "";
      zapisDebug?.("EDITOR V2 LAB | SPACE RESET inherited-format");
    }

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

  // V2.5a – formát nového textu po mazání nesmí být odvozen z náhodné
  // strany hranice, na které po Backspace/Delete zůstane caret.
  // Zachováme formát obsahu, který uživatel právě maže. Díky tomu např.
  // mazání normálního slova až k obarvenému slovu nepřenese barvu na novou mezeru.
  function formatMazanyZpet(vyber, celeSlovo = false) {
    if (!vyber?.sbaleny) return null;

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
      return formatNaPozici(blok, od);
    }

    // Při mazání hranice odstavců přichází uživatel z aktuálního bloku,
    // proto zachováme jeho první formát, ne formát konce předchozího bloku.
    if (caret.blok > 0) return formatNaPozici(blok, 0);
    return null;
  }

  function formatMazanyVpred(vyber, celeSlovo = false) {
    if (!vyber?.sbaleny) return null;

    const caret = vyber.zacatek;
    const blok = dokument.bloky[caret.blok];
    const text = textBloku(blok);

    if (caret.offset < text.length) return formatNaPozici(blok, caret.offset);

    if (caret.blok < dokument.bloky.length - 1) {
      return formatNaPozici(dokument.bloky[caret.blok + 1], 0);
    }
    return null;
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

  function normalizujCssBarvu(hodnota) {
    if (!hodnota) return "";
    const test = document.createElement("span");
    test.style.color = String(hodnota);
    return test.style.color || "";
  }

  function nastavBarvuVBloku(blok, od, doPozice, klic, hodnota) {
    if (!["barva", "pozadi"].includes(klic)) return;

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
          novyFormat[klic] = hodnota || null;
          vystup.push(vytvorSegment(stred, novyFormat));
        }
        if (po) vystup.push(vytvorSegment(po, cast.format));
      }

      pozice = konec;
    });

    nastavObsahBloku(blok, vystup);
  }

  function aplikujBarvuNaVyber(vyber, klic, hodnota) {
    if (!vyber || vyber.sbaleny || !["barva", "pozadi"].includes(klic)) return;

    for (let index = vyber.zacatek.blok; index <= vyber.konec.blok; index += 1) {
      const blok = dokument.bloky[index];
      const od = index === vyber.zacatek.blok ? vyber.zacatek.offset : 0;
      const doPozice = index === vyber.konec.blok ? vyber.konec.offset : textBloku(blok).length;
      nastavBarvuVBloku(blok, od, doPozice, klic, hodnota);
    }
  }

  function hodnotyBarevVeVyberu(vyber, klic) {
    const hodnoty = new Set();
    if (!vyber || !["barva", "pozadi"].includes(klic)) return hodnoty;

    if (vyber.sbaleny) {
      let format = null;
      if (aktivniFormatPsani && aktivniFormatPozice === klicPozice(vyber.zacatek)) {
        format = aktivniFormatPsani;
      } else {
        format = formatZDomBodu() || formatNaPozici(dokument.bloky[vyber.zacatek.blok], vyber.zacatek.offset);
      }
      hodnoty.add(format?.[klic] || "zaklad");
      return hodnoty;
    }

    for (let index = vyber.zacatek.blok; index <= vyber.konec.blok; index += 1) {
      const blok = dokument.bloky[index];
      const od = index === vyber.zacatek.blok ? vyber.zacatek.offset : 0;
      const doPozice = index === vyber.konec.blok ? vyber.konec.offset : textBloku(blok).length;
      let pozice = 0;

      blok.obsah.forEach((cast) => {
        const konec = pozice + String(cast.text ?? "").length;
        if (Math.max(pozice, od) < Math.min(konec, doPozice)) {
          hodnoty.add(cast.format?.[klic] || "zaklad");
        }
        pozice = konec;
      });
    }

    return hodnoty;
  }

  function nastavBooleanFormatVBloku(blok, od, doPozice, klic, hodnota) {
    if (!['tucne', 'kurziva', 'podtrzeni'].includes(klic)) return;

    const odPozice = Math.max(0, Math.min(textBloku(blok).length, od));
    const konecPozice = Math.max(odPozice, Math.min(textBloku(blok).length, doPozice));
    if (odPozice === konecPozice) return;

    const vystup = [];
    let pozice = 0;

    blok.obsah.forEach((cast) => {
      const text = String(cast.text ?? '');
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
          novyFormat[klic] = Boolean(hodnota);
          vystup.push(vytvorSegment(stred, novyFormat));
        }
        if (po) vystup.push(vytvorSegment(po, cast.format));
      }

      pozice = konec;
    });

    nastavObsahBloku(blok, vystup);
  }

  function aplikujBooleanFormatNaVyber(vyber, klic, hodnota) {
    if (!vyber || vyber.sbaleny) return;

    for (let index = vyber.zacatek.blok; index <= vyber.konec.blok; index += 1) {
      const blok = dokument.bloky[index];
      const od = index === vyber.zacatek.blok ? vyber.zacatek.offset : 0;
      const doPozice = index === vyber.konec.blok ? vyber.konec.offset : textBloku(blok).length;
      nastavBooleanFormatVBloku(blok, od, doPozice, klic, hodnota);
    }
  }

  function stavBooleanFormatuVeVyberu(vyber, klic) {
    if (!vyber || !['tucne', 'kurziva', 'podtrzeni'].includes(klic)) return 'off';

    if (vyber.sbaleny) {
      let format = null;
      if (aktivniFormatPsani && aktivniFormatPozice === klicPozice(vyber.zacatek)) {
        format = aktivniFormatPsani;
      } else {
        format = formatZDomBodu() || formatNaPozici(dokument.bloky[vyber.zacatek.blok], vyber.zacatek.offset);
      }
      return Boolean(format?.[klic]) ? 'on' : 'off';
    }

    let maZapnuto = false;
    let maVypnuto = false;

    for (let index = vyber.zacatek.blok; index <= vyber.konec.blok; index += 1) {
      const blok = dokument.bloky[index];
      const od = index === vyber.zacatek.blok ? vyber.zacatek.offset : 0;
      const doPozice = index === vyber.konec.blok ? vyber.konec.offset : textBloku(blok).length;
      let pozice = 0;

      blok.obsah.forEach((cast) => {
        const konec = pozice + String(cast.text ?? '').length;
        if (Math.max(pozice, od) < Math.min(konec, doPozice)) {
          if (cast.format?.[klic]) maZapnuto = true;
          else maVypnuto = true;
        }
        pozice = konec;
      });
    }

    if (maZapnuto && maVypnuto) return 'mix';
    return maZapnuto ? 'on' : 'off';
  }

  function aktualizujToolbarBIU(vyber = posledniVyber || vyberZPosledniPozice()) {
    if (!toolbarVelikosti || !dokument) return;

    toolbarVelikosti.querySelectorAll('[data-v2-format]').forEach((tlacitko) => {
      const klic = tlacitko.dataset.v2Format;
      const stav = stavBooleanFormatuVeVyberu(vyber, klic);
      const aktivni = stav === 'on';
      const smisene = stav === 'mix';

      tlacitko.classList.toggle('aktivni', aktivni);
      tlacitko.classList.toggle('smisene', smisene);
      tlacitko.setAttribute('aria-pressed', smisene ? 'mixed' : (aktivni ? 'true' : 'false'));
    });
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

  function aktualizujToolbarBarev(vyber = posledniVyber || vyberZPosledniPozice()) {
    if (!toolbarVelikosti || !dokument) return;

    ["barva", "pozadi"].forEach((klic) => {
      const hodnoty = Array.from(hodnotyBarevVeVyberu(vyber, klic));
      const jedna = hodnoty.length === 1 ? hodnoty[0] : null;
      const popisek = toolbarVelikosti.querySelector(`[data-v2-barva-stav="${klic}"]`);
      if (popisek) {
        popisek.textContent = jedna === null ? "mix" : (jedna === "zaklad" ? "výchozí" : jedna);
      }

      toolbarVelikosti.querySelectorAll(`[data-v2-barva="${klic}"]`).forEach((tlacitko) => {
        const hodnota = tlacitko.dataset.v2Hodnota || "zaklad";
        const aktivni = jedna !== null && hodnota === jedna;
        tlacitko.classList.toggle("aktivni", aktivni);
        tlacitko.setAttribute("aria-pressed", aktivni ? "true" : "false");
      });
    });
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

    aktualizujToolbarBIU(vyber);
    aktualizujToolbarBarev(vyber);
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
      aktivniFormatZdroj = "uzivatel";
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

    const snapshotPred = vytvorSnapshotHistorie(vyber);
    aplikujVelikostNaVyber(vyber, velikost);
    ulozZmenuDoHistorie(snapshotPred, velikost === null ? "základní velikost" : `velikost ${velikost}`);
    aktivniFormatPsani = null;
    aktivniFormatPozice = "";
    aktivniFormatZdroj = "";
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

  function nastavBarvuZToolbaru(klic, hodnota) {
    if (!["barva", "pozadi"].includes(klic)) return;
    const vyber = ziskejFormatovaciVyber();
    if (!vyber) return;

    const novaHodnota = hodnota === "zaklad" ? null : String(hodnota || "");
    const nazev = klic === "barva" ? "Barva textu" : "Pozadí textu";

    if (vyber.sbaleny) {
      let format = null;
      if (aktivniFormatPsani && aktivniFormatPozice === klicPozice(vyber.zacatek)) {
        format = aktivniFormatPsani;
      } else {
        format = formatZDomBodu() || formatNaPozici(dokument.bloky[vyber.zacatek.blok], vyber.zacatek.offset);
      }

      aktivniFormatPsani = kopieFormatu(format);
      aktivniFormatPsani[klic] = novaHodnota;
      aktivniFormatPozice = klicPozice(vyber.zacatek);
      aktivniFormatZdroj = "uzivatel";
      aktualizujToolbarVelikosti(vyber);
      nastavStav(`${nazev} pro nově psaný text: ${novaHodnota || "výchozí"}`);
      zapisDebug?.(`EDITOR V2 LAB | typing-${klic}=${novaHodnota || "default"}`);
      editor.focus({ preventScroll: true });
      nastavVyberModelu(vyber.zacatek, vyber.konec);
      return;
    }

    const snapshotPred = vytvorSnapshotHistorie(vyber);
    aplikujBarvuNaVyber(vyber, klic, novaHodnota);
    ulozZmenuDoHistorie(snapshotPred, klic === "barva" ? "barva textu" : "pozadí textu");
    aktivniFormatPsani = null;
    aktivniFormatPozice = "";
    aktivniFormatZdroj = "";
    vykresli(vyber);
    nastavStav(`${nazev} výběru: ${novaHodnota || "výchozí"}`);
    zapisDebug?.(
      `EDITOR V2 LAB | selection-${klic}=${novaHodnota || "default"} | ${vyber.zacatek.blok}:${vyber.zacatek.offset}-${vyber.konec.blok}:${vyber.konec.offset}`
    );
  }

  function prepniBooleanFormatZToolbaru(klic) {
    if (!['tucne', 'kurziva', 'podtrzeni'].includes(klic)) return;
    const vyber = ziskejFormatovaciVyber();
    if (!vyber) return;

    const nazvy = {
      tucne: 'Tučné',
      kurziva: 'Kurzíva',
      podtrzeni: 'Podtržení'
    };

    if (vyber.sbaleny) {
      let format = null;
      if (aktivniFormatPsani && aktivniFormatPozice === klicPozice(vyber.zacatek)) {
        format = aktivniFormatPsani;
      } else {
        format = formatZDomBodu() || formatNaPozici(dokument.bloky[vyber.zacatek.blok], vyber.zacatek.offset);
      }

      aktivniFormatPsani = kopieFormatu(format);
      aktivniFormatPsani[klic] = !Boolean(aktivniFormatPsani[klic]);
      aktivniFormatPozice = klicPozice(vyber.zacatek);
      aktivniFormatZdroj = "uzivatel";
      aktualizujToolbarVelikosti(vyber);
      nastavStav(`${nazvy[klic]} pro nově psaný text: ${aktivniFormatPsani[klic] ? 'zapnuto' : 'vypnuto'}`);
      zapisDebug?.(`EDITOR V2 LAB | typing-${klic}=${aktivniFormatPsani[klic] ? 'on' : 'off'}`);
      editor.focus({ preventScroll: true });
      nastavVyberModelu(vyber.zacatek, vyber.konec);
      return;
    }

    const stav = stavBooleanFormatuVeVyberu(vyber, klic);
    const novaHodnota = stav !== 'on';
    const snapshotPred = vytvorSnapshotHistorie(vyber);
    aplikujBooleanFormatNaVyber(vyber, klic, novaHodnota);
    ulozZmenuDoHistorie(snapshotPred, `${nazvy[klic]} ${novaHodnota ? "zapnout" : "vypnout"}`);
    aktivniFormatPsani = null;
    aktivniFormatPozice = '';
    aktivniFormatZdroj = '';
    vykresli(vyber);
    nastavStav(`${nazvy[klic]} výběru: ${novaHodnota ? 'zapnuto' : 'vypnuto'}`);
    zapisDebug?.(
      `EDITOR V2 LAB | selection-${klic}=${novaHodnota ? 'on' : 'off'} | ${vyber.zacatek.blok}:${vyber.zacatek.offset}-${vyber.konec.blok}:${vyber.konec.offset}`
    );
  }

  function nastavOdkazVBloku(blok, od, doPozice, url) {
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
          novyFormat.odkaz = normalizujInternetovouAdresu(url);
          vystup.push(vytvorSegment(stred, novyFormat));
        }
        if (po) vystup.push(vytvorSegment(po, cast.format));
      }

      pozice = konec;
    });

    nastavObsahBloku(blok, vystup);
  }

  function textVeVyberu(vyber) {
    if (!vyber || vyber.sbaleny) return "";
    const casti = [];

    for (let index = vyber.zacatek.blok; index <= vyber.konec.blok; index += 1) {
      const blok = dokument.bloky[index];
      const text = textBloku(blok);
      const od = index === vyber.zacatek.blok ? vyber.zacatek.offset : 0;
      const doPozice = index === vyber.konec.blok ? vyber.konec.offset : text.length;
      casti.push(text.slice(od, doPozice));
    }

    return casti.join("\n");
  }

  function odkazyVeVyberu(vyber) {
    const hodnoty = new Set();
    if (!vyber) return hodnoty;

    if (vyber.sbaleny) {
      let format = null;
      if (aktivniFormatPsani && aktivniFormatPozice === klicPozice(vyber.zacatek)) {
        format = aktivniFormatPsani;
      } else {
        format = formatZDomBodu() || formatNaPozici(dokument.bloky[vyber.zacatek.blok], vyber.zacatek.offset);
      }
      hodnoty.add(normalizujInternetovouAdresu(format?.odkaz) || "zaklad");
      return hodnoty;
    }

    for (let index = vyber.zacatek.blok; index <= vyber.konec.blok; index += 1) {
      const blok = dokument.bloky[index];
      const od = index === vyber.zacatek.blok ? vyber.zacatek.offset : 0;
      const doPozice = index === vyber.konec.blok ? vyber.konec.offset : textBloku(blok).length;
      let pozice = 0;

      blok.obsah.forEach((cast) => {
        const konec = pozice + String(cast.text ?? "").length;
        if (Math.max(pozice, od) < Math.min(konec, doPozice)) {
          hodnoty.add(normalizujInternetovouAdresu(cast.format?.odkaz) || "zaklad");
        }
        pozice = konec;
      });
    }

    return hodnoty;
  }

  function ziskejInfoOdkazu() {
    const vyber = ziskejFormatovaciVyber();
    if (!vyber) return { text: "", url: "", sbaleny: true, mix: false };
    const hodnoty = Array.from(odkazyVeVyberu(vyber));
    return {
      text: textVeVyberu(vyber),
      url: hodnoty.length === 1 && hodnoty[0] !== "zaklad" ? hodnoty[0] : "",
      sbaleny: Boolean(vyber.sbaleny),
      mix: hodnoty.length > 1,
      viceBloku: !vyber.sbaleny && vyber.zacatek.blok !== vyber.konec.blok
    };
  }

  function nastavOdkazZToolbaru(urlHodnota, textHodnota = "") {
    const url = normalizujInternetovouAdresu(urlHodnota);
    const vyber = ziskejFormatovaciVyber();
    if (!url || !vyber) {
      nastavStav("Odkaz: neplatná internetová adresa", true);
      return false;
    }

    if (!vyber.sbaleny && vyber.zacatek.blok !== vyber.konec.blok) {
      nastavStav("Odkaz zatím označ jen v jednom odstavci.", true);
      return false;
    }

    const puvodniText = textVeVyberu(vyber);
    const pozadovanyText = String(textHodnota || "").trim() || puvodniText || url;
    const snapshotPred = vytvorSnapshotHistorie(vyber);

    if (!vyber.sbaleny && pozadovanyText === puvodniText) {
      nastavOdkazVBloku(
        dokument.bloky[vyber.zacatek.blok],
        vyber.zacatek.offset,
        vyber.konec.offset,
        url
      );
      ulozZmenuDoHistorie(snapshotPred, "internetový odkaz");
      aktivniFormatPsani = null;
      aktivniFormatPozice = "";
      aktivniFormatZdroj = "";
      vykresli(vyber);
      editor?.focus({ preventScroll: true });
      nastavStav(`Odkaz nastaven: ${url}`);
      zapisDebug?.(`EDITOR V2 LAB | link apply | ${url}`);
      return true;
    }

    const formatZaklad = kopieFormatu(
      aktivniFormatPsani
      || formatZDomBodu()
      || formatNaPozici(dokument.bloky[vyber.zacatek.blok], vyber.zacatek.offset)
    );
    const formatOdkazu = kopieFormatu(formatZaklad);
    formatOdkazu.odkaz = url;
    const formatMezery = kopieFormatu(formatZaklad);
    formatMezery.odkaz = null;

    let caret = smazVyber(vyber);
    caret = vlozText(
      pozadovanyText,
      { zacatek: caret, konec: caret, sbaleny: true },
      formatOdkazu
    );
    caret = vlozText(
      " ",
      { zacatek: caret, konec: caret, sbaleny: true },
      formatMezery
    );

    const novyVyber = { zacatek: caret, konec: caret, sbaleny: true };
    ulozZmenuDoHistorie(snapshotPred, "vložit internetový odkaz");
    aktivniFormatPsani = null;
    aktivniFormatPozice = "";
    aktivniFormatZdroj = "";
    vykresli(novyVyber);
    editor?.focus({ preventScroll: true });
    nastavStav(`Odkaz vložen: ${url}`);
    zapisDebug?.(`EDITOR V2 LAB | link insert | ${url}`);
    return true;
  }

  function nastavStylTextuVBloku(blok, od, doPozice, stylTextu) {
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
          novyFormat.stylTextu = normalizujStylTextu(stylTextu);
          vystup.push(vytvorSegment(stred, novyFormat));
        }
        if (po) vystup.push(vytvorSegment(po, cast.format));
      }

      pozice = konec;
    });

    nastavObsahBloku(blok, vystup);
  }

  function aplikujStylTextuNaVyber(vyber, stylTextu) {
    if (!vyber || vyber.sbaleny) return;

    for (let index = vyber.zacatek.blok; index <= vyber.konec.blok; index += 1) {
      const blok = dokument.bloky[index];
      const od = index === vyber.zacatek.blok ? vyber.zacatek.offset : 0;
      const doPozice = index === vyber.konec.blok ? vyber.konec.offset : textBloku(blok).length;
      nastavStylTextuVBloku(blok, od, doPozice, stylTextu);
    }
  }

  function hodnotyStyluTextuVeVyberu(vyber) {
    const hodnoty = new Set();
    if (!vyber) return hodnoty;

    if (vyber.sbaleny) {
      let format = null;
      if (aktivniFormatPsani && aktivniFormatPozice === klicPozice(vyber.zacatek)) {
        format = aktivniFormatPsani;
      } else {
        format = formatZDomBodu() || formatNaPozici(dokument.bloky[vyber.zacatek.blok], vyber.zacatek.offset);
      }
      hodnoty.add(normalizujStylTextu(format?.stylTextu) || "div");
      return hodnoty;
    }

    for (let index = vyber.zacatek.blok; index <= vyber.konec.blok; index += 1) {
      const blok = dokument.bloky[index];
      const od = index === vyber.zacatek.blok ? vyber.zacatek.offset : 0;
      const doPozice = index === vyber.konec.blok ? vyber.konec.offset : textBloku(blok).length;
      let pozice = 0;

      blok.obsah.forEach((cast) => {
        const konec = pozice + String(cast.text ?? "").length;
        if (Math.max(pozice, od) < Math.min(konec, doPozice)) {
          hodnoty.add(normalizujStylTextu(cast.format?.stylTextu) || "div");
        }
        pozice = konec;
      });
    }

    return hodnoty;
  }

  function nastavStylTextuZToolbaru(hodnota) {
    const vyber = ziskejFormatovaciVyber();
    if (!vyber) return false;

    if (vyber.sbaleny) {
      nastavStav("Pro H1/H2/H3 nejdřív označ text.");
      zapisDebug?.("EDITOR V2 LAB | heading blocked: collapsed selection");
      return false;
    }

    const stylTextu = normalizujStylTextu(hodnota);
    const snapshotPred = vytvorSnapshotHistorie(vyber);
    aplikujStylTextuNaVyber(vyber, stylTextu);
    const zmeneno = ulozZmenuDoHistorie(snapshotPred, stylTextu ? `styl ${stylTextu.toUpperCase()}` : "styl Text");
    aktivniFormatPsani = null;
    aktivniFormatPozice = "";
    aktivniFormatZdroj = "";
    vykresli(vyber);
    nastavStav(stylTextu ? `Styl výběru: ${stylTextu.toUpperCase()}` : "Styl výběru: Text");
    zapisDebug?.(`EDITOR V2 LAB | text-style=${stylTextu || "div"} | ${vyber.zacatek.blok}:${vyber.zacatek.offset}-${vyber.konec.blok}:${vyber.konec.offset}`);
    return zmeneno;
  }

  function blokyZarovnaniVeVyberu(vyber) {
    const hodnoty = new Set();
    if (!vyber || !dokument?.bloky?.length) return hodnoty;

    const od = Math.max(0, Math.min(dokument.bloky.length - 1, vyber.zacatek.blok));
    const doBloku = Math.max(od, Math.min(dokument.bloky.length - 1, vyber.konec.blok));
    for (let index = od; index <= doBloku; index += 1) {
      hodnoty.add(normalizujZarovnani(dokument.bloky[index]?.zarovnani));
    }
    return hodnoty;
  }

  function nastavZarovnaniZToolbaru(hodnota) {
    const vyber = ziskejFormatovaciVyber();
    if (!vyber || !dokument?.bloky?.length) return false;

    const zarovnani = normalizujZarovnani(hodnota);
    const od = Math.max(0, Math.min(dokument.bloky.length - 1, vyber.zacatek.blok));
    const doBloku = Math.max(od, Math.min(dokument.bloky.length - 1, vyber.konec.blok));
    const snapshotPred = vytvorSnapshotHistorie(vyber);

    for (let index = od; index <= doBloku; index += 1) {
      dokument.bloky[index].zarovnani = zarovnani;
    }

    const zmeneno = ulozZmenuDoHistorie(snapshotPred, `zarovnání ${zarovnani}`);
    vykresli(vyber);
    nastavStav(`Zarovnání odstavce: ${zarovnani}`);
    zapisDebug?.(`EDITOR V2 LAB | align=${zarovnani} | blocks=${od}-${doBloku}`);
    return zmeneno;
  }

  function zpracujBeforeInput(event) {
    if (event.inputType === "historyUndo") {
      event.preventDefault();
      vratHistoriiZpet();
      return;
    }

    if (event.inputType === "historyRedo") {
      event.preventDefault();
      vratHistoriiVpred();
      return;
    }

    if (!PODPOROVANE_INPUTY.has(event.inputType)) {
      // V2 LAB nikdy nepředá nepodporovaný zásah browseru.
      // Jinak by DOM přestal odpovídat našemu modelu.
      event.preventDefault();

      if (event.inputType === "insertFromPaste") return;

      const ime = event.inputType?.startsWith("insertComposition") || event.inputType?.includes("Composition");
      nastavStav(
        ime
          ? `IME/composition zatím není ve V2.4 podporováno: ${event.inputType}`
          : `V2.4 zablokoval nepodporovaný vstup: ${event.inputType || "neznámý"}`,
        true
      );
      zapisDebug?.(`EDITOR V2 LAB | BLOCK INPUT | ${event.inputType || "unknown"}`);
      return;
    }

    event.preventDefault();
    const vyber = aktualniVyberModelu();
    const snapshotPred = vytvorSnapshotHistorie(vyber);
    let caret = vyber.zacatek;
    let formatPoMazani = null;

    if (event.inputType === "insertText") {
      caret = vlozText(event.data ?? "", vyber);
    } else if (event.inputType === "insertParagraph" || event.inputType === "insertLineBreak") {
      caret = vlozOdstavec(vyber);
    } else if (event.inputType === "deleteContentBackward") {
      formatPoMazani = formatMazanyZpet(vyber, false);
      caret = smazZpet(vyber, false);
    } else if (event.inputType === "deleteContentForward") {
      formatPoMazani = formatMazanyVpred(vyber, false);
      caret = smazVpred(vyber, false);
    } else if (event.inputType === "deleteWordBackward") {
      formatPoMazani = formatMazanyZpet(vyber, true);
      caret = smazZpet(vyber, true);
    } else if (event.inputType === "deleteWordForward") {
      formatPoMazani = formatMazanyVpred(vyber, true);
      caret = smazVpred(vyber, true);
    }

    ulozZmenuDoHistorie(snapshotPred, event.inputType);

    if (formatPoMazani) {
      aktivniFormatPsani = kopieFormatu(formatPoMazani);
      aktivniFormatPozice = klicPozice(caret);
      aktivniFormatZdroj = "zdedeny";
      zapisDebug?.(`EDITOR V2 LAB | DELETE AFFINITY | ${event.inputType} | format=${JSON.stringify(aktivniFormatPsani)}`);
    } else if (String(event.inputType || "").startsWith("delete")) {
      aktivniFormatPsani = null;
      aktivniFormatPozice = klicPozice(caret);
      aktivniFormatZdroj = "";
    } else {
      // Psaní/Enter nesmí shodit ručně zapnutý formát. VlozText() sám
      // zruší pouze zděděný formát, když narazí na první mezerník.
      aktivniFormatPozice = klicPozice(caret);
    }
    const novyVyber = { zacatek: caret, konec: caret, sbaleny: true };
    vykresli(novyVyber);
    nastavStav(`Řízeno modelem: ${event.inputType}`);
    zapisDebug?.(`EDITOR V2 LAB | ${event.inputType} | blok=${caret.blok} offset=${caret.offset}`);
  }

  function zpracujPaste(event) {
    const text = event.clipboardData?.getData("text/plain");
    if (typeof text !== "string") return;
    event.preventDefault();
    const vyber = aktualniVyberModelu();
    const snapshotPred = vytvorSnapshotHistorie(vyber);
    const caret = vlozViceRadku(text, vyber);
    ulozZmenuDoHistorie(snapshotPred, "vložit text");
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
      const modelZarovnani = normalizujZarovnani(blok.zarovnani);
      const domZarovnani = normalizujZarovnani(blokEl.style.textAlign || "left");
      if (domZarovnani !== modelZarovnani) return `blok ${b}: jiné zarovnání DOM/model`;
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

        const modelTucne = Boolean(cast.format?.tucne);
        const modelKurziva = Boolean(cast.format?.kurziva);
        const modelPodtrzeni = Boolean(cast.format?.podtrzeni);
        if ((span.style.fontWeight === "700") !== modelTucne) {
          return `blok ${b} segment ${s}: jiné tučné DOM/model`;
        }
        if ((span.style.fontStyle === "italic") !== modelKurziva) {
          return `blok ${b} segment ${s}: jiná kurzíva DOM/model`;
        }
        if ((span.style.textDecoration === "underline") !== modelPodtrzeni) {
          return `blok ${b} segment ${s}: jiné podtržení DOM/model`;
        }

        const modelBarva = normalizujCssBarvu(cast.format?.barva);
        const modelPozadi = normalizujCssBarvu(cast.format?.pozadi);
        if (span.style.color !== modelBarva) {
          return `blok ${b} segment ${s}: jiná barva textu DOM/model`;
        }
        if (span.style.backgroundColor !== modelPozadi) {
          return `blok ${b} segment ${s}: jiné pozadí textu DOM/model`;
        }

        const modelStylTextu = normalizujStylTextu(cast.format?.stylTextu);
        if (span.dataset.lnV2StylTextu !== (modelStylTextu || "text")) {
          return `blok ${b} segment ${s}: jiný styl textu DOM/model`;
        }
        if (modelStylTextu) {
          if (!span.classList.contains("ln-v2-nadpis") || !span.classList.contains(`ln-v2-${modelStylTextu}`)) {
            return `blok ${b} segment ${s}: chybí třída nadpisu`;
          }
        } else if (span.classList.contains("ln-v2-nadpis")) {
          return `blok ${b} segment ${s}: cizí nadpisová třída`;
        }

        const modelOdkaz = normalizujInternetovouAdresu(cast.format?.odkaz) || "";
        if ((span.dataset.lnV2Odkaz || "") !== modelOdkaz) {
          return `blok ${b} segment ${s}: jiný odkaz DOM/model`;
        }
        if (span.classList.contains("ln-v2-odkaz") !== Boolean(modelOdkaz)) {
          return `blok ${b} segment ${s}: jiný stav odkazu DOM/model`;
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

  function normalizujZarovnani(hodnota) {
    const zarovnani = String(hodnota || "").trim().toLowerCase();
    if (["left", "center", "right", "justify"].includes(zarovnani)) return zarovnani;
    if (zarovnani === "start") return "left";
    if (zarovnani === "end") return "right";
    return "left";
  }

  function vycistiCssBarvu(hodnota) {
    const text = String(hodnota || "").trim();
    if (!text || text === "transparent" || text === "rgba(0, 0, 0, 0)") return null;
    return text;
  }

  function formatZInlineElementu(element, puvodniFormat) {
    const format = kopieFormatu(puvodniFormat);
    if (!(element instanceof Element)) return format;

    const tag = element.tagName.toLowerCase();
    if (tag === "a") format.odkaz = normalizujInternetovouAdresu(element.getAttribute("href"));
    if (tag === "b" || tag === "strong") format.tucne = true;
    if (tag === "i" || tag === "em") format.kurziva = true;
    if (tag === "u") format.podtrzeni = true;

    if (element.classList?.contains("editorTextNormalni")) {
      format.stylTextu = null;
    } else if (element.classList?.contains("editorNadpis")) {
      if (element.classList.contains("h1")) format.stylTextu = "h1";
      else if (element.classList.contains("h2")) format.stylTextu = "h2";
      else if (element.classList.contains("h3")) format.stylTextu = "h3";
    }

    const dataVelikost = cisloVelikosti(element.getAttribute("data-velikost-pisma"));
    const inlineText = String(element.style?.fontSize || "").trim();
    const inlineCislo = Number.parseFloat(inlineText);
    const inlineVelikost = Number.isFinite(inlineCislo) ? inlineCislo : null;
    if (dataVelikost !== null) format.velikost = dataVelikost;
    else if (inlineVelikost !== null) format.velikost = inlineVelikost;

    const weight = String(element.style?.fontWeight || "").toLowerCase();
    if (weight === "bold" || Number.parseInt(weight, 10) >= 600) format.tucne = true;
    if (String(element.style?.fontStyle || "").toLowerCase() === "italic") format.kurziva = true;
    if (String(element.style?.textDecoration || "").toLowerCase().includes("underline")) format.podtrzeni = true;

    const barva = vycistiCssBarvu(element.style?.color);
    const pozadi = vycistiCssBarvu(element.style?.backgroundColor || element.style?.background);
    if (barva) format.barva = barva;
    if (pozadi) format.pozadi = pozadi;

    return format;
  }

  function importujInlineUzly(rodic, zakladniFormat, vystup, nepodporovane) {
    const povoleneInline = new Set(["span", "font", "b", "strong", "i", "em", "u", "mark", "a"]);

    Array.from(rodic?.childNodes || []).forEach((uzel) => {
      if (uzel.nodeType === Node.TEXT_NODE) {
        if (uzel.nodeValue) vystup.push(vytvorSegment(uzel.nodeValue, zakladniFormat));
        return;
      }

      if (uzel.nodeType !== Node.ELEMENT_NODE) return;
      const tag = uzel.tagName.toLowerCase();

      if (tag === "br") {
        vystup.push(vytvorSegment("\n", zakladniFormat));
        return;
      }

      if (!povoleneInline.has(tag)) {
        nepodporovane.add(tag);
        return;
      }

      if (tag === "a") {
        const jeSpecialniInterni = uzel.classList.contains("noteInternalLink") || uzel.classList.contains("plannedTextLink");
        const href = normalizujInternetovouAdresu(uzel.getAttribute("href"));
        if (jeSpecialniInterni || !href) {
          nepodporovane.add(jeSpecialniInterni ? "interní odkaz" : "a[href]");
          return;
        }
      }

      const format = formatZInlineElementu(uzel, zakladniFormat);
      importujInlineUzly(uzel, format, vystup, nepodporovane);
    });
  }

  function vytvorModelZHtml(html, plainText = "") {
    const sablona = document.createElement("template");
    const vstup = String(html || "");
    sablona.innerHTML = vstup || "";

    const nepodporovane = new Set();
    const bloky = [];
    const rootInline = [];
    const flushRootInline = () => {
      if (!rootInline.length) return;
      bloky.push(vytvorOdstavecZObsahu(rootInline.splice(0), "left"));
    };

    const blokoveTagy = new Set(["div", "p", "h1", "h2", "h3"]);
    const inlineTagy = new Set(["span", "font", "b", "strong", "i", "em", "u", "mark", "a"]);

    Array.from(sablona.content.childNodes).forEach((uzel) => {
      if (uzel.nodeType === Node.TEXT_NODE) {
        if (uzel.nodeValue && uzel.nodeValue.trim() !== "") {
          rootInline.push(vytvorSegment(uzel.nodeValue, VYCHOZI_FORMAT));
        }
        return;
      }

      if (uzel.nodeType !== Node.ELEMENT_NODE) return;
      const tag = uzel.tagName.toLowerCase();

      if (tag === "br") {
        flushRootInline();
        bloky.push(vytvorOdstavec(""));
        return;
      }

      if (inlineTagy.has(tag)) {
        if (tag === "a") {
          const jeSpecialniInterni = uzel.classList.contains("noteInternalLink") || uzel.classList.contains("plannedTextLink");
          const href = normalizujInternetovouAdresu(uzel.getAttribute("href"));
          if (jeSpecialniInterni || !href) {
            nepodporovane.add(jeSpecialniInterni ? "interní odkaz" : "a[href]");
            return;
          }
        }
        importujInlineUzly(uzel, formatZInlineElementu(uzel, VYCHOZI_FORMAT), rootInline, nepodporovane);
        return;
      }

      flushRootInline();

      if (!blokoveTagy.has(tag)) {
        nepodporovane.add(tag);
        return;
      }

      const obsah = [];
      const blokovyFormat = kopieFormatu(VYCHOZI_FORMAT);
      if (["h1", "h2", "h3"].includes(tag)) blokovyFormat.stylTextu = tag;
      importujInlineUzly(uzel, blokovyFormat, obsah, nepodporovane);
      if (obsah.length === 1 && obsah[0]?.text === "\n") obsah.length = 0;
      const zarovnani = normalizujZarovnani(uzel.style?.textAlign || uzel.getAttribute("align"));
      bloky.push(vytvorOdstavecZObsahu(obsah, zarovnani));
    });

    flushRootInline();

    if (nepodporovane.size) {
      return {
        ok: false,
        nepodporovane: Array.from(nepodporovane).sort(),
        model: null
      };
    }

    if (!bloky.length) {
      const radky = String(plainText || "").split(/\r?\n/);
      (radky.length ? radky : [""]).forEach((radek) => bloky.push(vytvorOdstavec(radek)));
    }

    return {
      ok: true,
      nepodporovane: [],
      model: {
        verze: VERZE_MODELU,
        bloky
      }
    };
  }

  function exportujHtmlZModelu(doc = dokument) {
    const obal = document.createElement("div");
    (doc?.bloky || []).forEach((blok) => {
      const radek = document.createElement("div");
      const zarovnani = normalizujZarovnani(blok?.zarovnani);
      if (zarovnani !== "left") radek.style.textAlign = zarovnani;

      const segmenty = Array.isArray(blok?.obsah) ? blok.obsah : [];
      const maText = segmenty.some((cast) => String(cast?.text || "").length > 0);
      if (!maText) {
        radek.appendChild(document.createElement("br"));
      } else {
        segmenty.forEach((cast) => {
          const text = String(cast?.text ?? "");
          if (!text) return;
          const format = kopieFormatu(cast?.format);
          const maFormat = Boolean(
            format.tucne || format.kurziva || format.podtrzeni ||
            format.velikost !== null || format.barva || format.pozadi || format.stylTextu || format.odkaz
          );
          if (!maFormat) {
            radek.appendChild(document.createTextNode(text));
            return;
          }

          const inline = document.createElement(format.odkaz ? "a" : "span");
          if (format.odkaz) {
            inline.classList.add("lubaNoteInternetLink");
            inline.dataset.lubanoteLink = "true";
            inline.href = format.odkaz;
            inline.target = "_blank";
            inline.rel = "noopener noreferrer";
          }
          if (format.velikost !== null) {
            inline.dataset.velikostPisma = String(format.velikost);
            inline.style.fontSize = `${format.velikost}px`;
          }
          if (format.tucne) inline.style.fontWeight = "700";
          if (format.kurziva) inline.style.fontStyle = "italic";
          if (format.podtrzeni) inline.style.textDecoration = "underline";
          if (format.barva) inline.style.color = format.barva;
          if (format.pozadi) inline.style.backgroundColor = format.pozadi;
          if (format.stylTextu) inline.classList.add("editorNadpis", format.stylTextu);
          inline.textContent = text;
          radek.appendChild(inline);
        });
      }
      obal.appendChild(radek);
    });
    return obal.innerHTML;
  }

  function exportujProstyTextZModelu(doc = dokument) {
    return (doc?.bloky || []).map((blok) => textBloku(blok)).join("\n");
  }

  function nastavDokumentProHost(model) {
    dokument = klonDat(model);
    normalizujDokument();
    posledniPozice = { blok: 0, offset: 0 };
    posledniVyber = { zacatek: { ...posledniPozice }, konec: { ...posledniPozice }, sbaleny: true };
    ulozenyFormatovaciVyber = klonVyberu(posledniVyber);
    aktivniFormatPsani = null;
    aktivniFormatPozice = "";
    aktivniFormatZdroj = "";
    historieZpet = [];
    historieVpred = [];
    vykresli(posledniVyber);
    aktualizujTlacitkaHistorie();
  }

  function otevriVHostu(hostitel, model) {
    if (!(hostitel instanceof Element) || !model?.bloky) return false;
    if (!lab?.isConnected) vytvorLab();

    vlozenyHostitel = hostitel;
    vlozenyRezim = true;
    lab.classList.add("ln-v2-vlozeny");
    hostitel.appendChild(lab);
    lab.hidden = false;
    lab.classList.add("otevreno");
    document.body.classList.remove("ln-v2-lab-otevren");
    nastavDokumentProHost(model);
    editor.focus({ preventScroll: true });
    return true;
  }

  function zavriVHostu() {
    if (!lab || !vlozenyRezim) return;
    lab.hidden = true;
    lab.classList.remove("otevreno", "ln-v2-vlozeny");
    document.body.appendChild(lab);
    vlozenyHostitel = null;
    vlozenyRezim = false;
  }

  function zachytAktualniVyber() {
    if (!editor || !dokument) return null;
    const vyber = aktualniVyberModelu();
    if (vyber) ulozenyFormatovaciVyber = klonVyberu(vyber);
    return klonVyberu(vyber);
  }

  function ziskejStavFormatu() {
    if (!dokument) return null;
    const vyber = ziskejFormatovaciVyber() || vyberZPosledniPozice();
    const velikosti = Array.from(velikostiVeVyberu(vyber).hodnoty);
    const barvy = Array.from(hodnotyBarevVeVyberu(vyber, "barva"));
    const pozadi = Array.from(hodnotyBarevVeVyberu(vyber, "pozadi"));
    const zarovnani = Array.from(blokyZarovnaniVeVyberu(vyber));
    const stylyTextu = Array.from(hodnotyStyluTextuVeVyberu(vyber));
    const odkazy = Array.from(odkazyVeVyberu(vyber));
    return {
      velikost: velikosti.length === 1 ? velikosti[0] : "mix",
      tucne: stavBooleanFormatuVeVyberu(vyber, "tucne"),
      kurziva: stavBooleanFormatuVeVyberu(vyber, "kurziva"),
      podtrzeni: stavBooleanFormatuVeVyberu(vyber, "podtrzeni"),
      barva: barvy.length === 1 ? barvy[0] : "mix",
      pozadi: pozadi.length === 1 ? pozadi[0] : "mix",
      zarovnani: zarovnani.length === 1 ? zarovnani[0] : "mix",
      stylTextu: stylyTextu.length === 1 ? stylyTextu[0] : "mix",
      odkaz: odkazy.length === 1 ? odkazy[0] : "mix"
    };
  }

  function vytvorLab() {
    lab = document.createElement("section");
    lab.id = "ln-editor-v2-lab";
    lab.className = "ln-v2-lab";
    lab.innerHTML = `
      <header class="ln-v2-hlavicka">
        <div>
          <strong>Editor Core V2.9 · LAB</strong>
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
        <button type="button" data-v2-akce="undo" data-v2-historie="undo" aria-label="Vrátit zpět" disabled>↶ Undo</button>
        <button type="button" data-v2-akce="redo" data-v2-historie="redo" aria-label="Provést znovu" disabled>↷ Redo</button>
        <button type="button" data-v2-akce="reset">Reset testu</button>
        <button type="button" data-v2-akce="model">Zobrazit model</button>
        <button type="button" data-v2-akce="dom">Kontrola DOM</button>
      </div>

      <pre class="ln-v2-model" hidden></pre>

      <div class="ln-v2-format" data-v2-toolbar-velikosti>
        <button type="button" class="ln-v2-format-biu" data-v2-format="tucne" aria-pressed="false" aria-label="Tučné"><strong>B</strong></button>
        <button type="button" class="ln-v2-format-biu" data-v2-format="kurziva" aria-pressed="false" aria-label="Kurzíva"><em>I</em></button>
        <button type="button" class="ln-v2-format-biu" data-v2-format="podtrzeni" aria-pressed="false" aria-label="Podtržení"><u>U</u></button>
        <span class="ln-v2-format-oddeleni" aria-hidden="true"></span>
        <span class="ln-v2-format-hodnota">Velikost: <strong data-v2-aktualni-velikost>–</strong></span>
        <button type="button" data-v2-velikost="zaklad" aria-pressed="false">Základ</button>
        ${VELIKOSTI_PISMA.map((velikost) => `<button type="button" data-v2-velikost="${velikost}" aria-pressed="false">${velikost}</button>`).join("")}
        <span class="ln-v2-format-oddeleni" aria-hidden="true"></span>
        <span class="ln-v2-barva-popisek">Text: <strong data-v2-barva-stav="barva">výchozí</strong></span>
        <button type="button" class="ln-v2-barva-reset" data-v2-barva="barva" data-v2-hodnota="zaklad" aria-label="Výchozí barva textu" aria-pressed="false">A</button>
        ${PALETA_BAREV.map(({ hodnota, nazev }) => `<button type="button" class="ln-v2-barva-vzorek" data-v2-barva="barva" data-v2-hodnota="${hodnota}" aria-label="Barva textu ${nazev}" aria-pressed="false"><span style="--ln-v2-vzorek:${hodnota}"></span></button>`).join("")}
        <span class="ln-v2-format-oddeleni" aria-hidden="true"></span>
        <span class="ln-v2-barva-popisek">Pozadí: <strong data-v2-barva-stav="pozadi">výchozí</strong></span>
        <button type="button" class="ln-v2-barva-reset ln-v2-barva-reset-pozadi" data-v2-barva="pozadi" data-v2-hodnota="zaklad" aria-label="Výchozí pozadí textu" aria-pressed="false">A</button>
        ${PALETA_BAREV.map(({ hodnota, nazev }) => `<button type="button" class="ln-v2-barva-vzorek" data-v2-barva="pozadi" data-v2-hodnota="${hodnota}" aria-label="Pozadí textu ${nazev}" aria-pressed="false"><span style="--ln-v2-vzorek:${hodnota}"></span></button>`).join("")}
      </div>

      <footer class="ln-v2-paticka">
        V2.9: internetové odkazy jsou atribut segmentu modelu; v editačním DOMu jsou inertní a při exportu se převádějí na kompatibilní &lt;a&gt;. Obrázky, TODO a IME zatím zůstávají vypnuté.
      </footer>
    `;

    document.body.appendChild(lab);
    editor = lab.querySelector("[data-ln-v2-editor]");
    modelPanel = lab.querySelector(".ln-v2-model");
    stavEl = lab.querySelector(".ln-v2-stav");
    velikostEl = lab.querySelector("[data-v2-aktualni-velikost]");
    toolbarVelikosti = lab.querySelector("[data-v2-toolbar-velikosti]");
    tlacitkoUndo = lab.querySelector('[data-v2-historie="undo"]');
    tlacitkoRedo = lab.querySelector('[data-v2-historie="redo"]');

    poslouchej(editor, "beforeinput", zpracujBeforeInput);
    poslouchej(editor, "paste", zpracujPaste);
    poslouchej(editor, "keydown", (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const klavesa = String(event.key || "").toLowerCase();
      if (klavesa === "z") {
        event.preventDefault();
        if (event.shiftKey) vratHistoriiVpred();
        else vratHistoriiZpet();
      } else if (klavesa === "y") {
        event.preventDefault();
        vratHistoriiVpred();
      }
    });
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
        aktivniFormatZdroj = "";
      }
      aktualizujToolbarVelikosti(modelovyVyber);
    });

    // V2.3 – stabilní selection controller.
    // Před tapem na formátovací lištu zachytíme rozsah do našeho modelu.
    // Android může následně zavřít svou nativní nabídku nebo přesunout focus;
    // formátovací akce už nejsou závislé na živé DOM Selection.
    poslouchej(toolbarVelikosti, "pointerdown", (event) => {
      if (!event.target.closest("[data-v2-velikost], [data-v2-format], [data-v2-barva]")) return;
      const vyber = aktualniVyberModelu();
      if (vyber) ulozenyFormatovaciVyber = klonVyberu(vyber);
    }, true);

    poslouchej(toolbarVelikosti, "click", (event) => {
      const tlacitkoVelikosti = event.target.closest("[data-v2-velikost]");
      if (tlacitkoVelikosti) {
        nastavVelikostZToolbaru(tlacitkoVelikosti.dataset.v2Velikost);
        return;
      }

      const tlacitkoBarvy = event.target.closest("[data-v2-barva]");
      if (tlacitkoBarvy) {
        nastavBarvuZToolbaru(tlacitkoBarvy.dataset.v2Barva, tlacitkoBarvy.dataset.v2Hodnota);
        return;
      }

      const tlacitkoFormatu = event.target.closest("[data-v2-format]");
      if (tlacitkoFormatu) {
        prepniBooleanFormatZToolbaru(tlacitkoFormatu.dataset.v2Format);
      }
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
      if (akce === "undo") {
        vratHistoriiZpet();
      } else if (akce === "redo") {
        vratHistoriiVpred();
      } else if (akce === "zavrit") {
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
      "Označ část textu a vyzkoušej tučné, kurzívu a podtržení.",
      "Kombinuj B/I/U s různými velikostmi – vše musí zůstat v modelu.",
      "Vyzkoušej barvu textu i pozadí a potom je vrať na výchozí."
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
    aktivniFormatZdroj = "";
    historieZpet = [];
    historieVpred = [];
    vykresli(posledniVyber);
    aktualizujTlacitkaHistorie();
    nastavStav(`Test resetován · základní velikost modelu = ${zakladniVelikost()}`);
    editor.focus({ preventScroll: true });
    zapisDebug?.(`EDITOR V2 LAB | reset | base-size=${zakladniVelikost()}`);
  }

  function otevriLab(options = {}) {
    zapisDebug = typeof options.zapis === "function" ? options.zapis : null;

    if (!lab?.isConnected) vytvorLab();
    if (vlozenyRezim) zavriVHostu();
    if (lab.parentElement !== document.body) document.body.appendChild(lab);
    lab.classList.remove("ln-v2-vlozeny");
    lab.hidden = false;
    lab.classList.add("otevreno");
    document.body.classList.add("ln-v2-lab-otevren");

    if (!dokument) resetujTest();
    else vykresli(posledniVyber || posledniPozice);

    editor.focus({ preventScroll: true });
    zapisDebug?.("EDITOR V2 LAB | OPEN V2.9 | produkční editor nedotčen");
    return true;
  }

  function zavriLab() {
    if (!lab) return;
    if (vlozenyRezim) {
      zavriVHostu();
      return;
    }
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
    tlacitkoUndo = null;
    tlacitkoRedo = null;
    historieZpet = [];
    historieVpred = [];
    dokument = null;
    posledniVyber = null;
    ulozenyFormatovaciVyber = null;
    aktivniFormatPsani = null;
    aktivniFormatPozice = "";
    aktivniFormatZdroj = "";
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
        if (typeof window.LubaNoteEditorV2Bridge?.prepniTestRezim === "function") {
          window.LubaNoteEditorV2Bridge.prepniTestRezim();
          return;
        }
        otevriLabPrimo();
      });
    }, true);
  }

  pripojRychlySpoustec();

  window.LubaNoteEditorV2 = Object.freeze({
    verze: "V2.9-LINKS-380",
    otevriLab,
    otevriLabPrimo,
    zavriLab,
    znicLab,
    resetujTest,
    importujHtml: vytvorModelZHtml,
    exportujHtml: () => exportujHtmlZModelu(),
    exportujProstyText: () => exportujProstyTextZModelu(),
    otevriVHostu,
    zavriVHostu,
    zachytAktualniVyber,
    nastavVelikost: nastavVelikostZToolbaru,
    prepniFormat: prepniBooleanFormatZToolbaru,
    nastavBarvu: nastavBarvuZToolbaru,
    nastavZarovnani: nastavZarovnaniZToolbaru,
    nastavStylTextu: nastavStylTextuZToolbaru,
    nastavOdkaz: nastavOdkazZToolbaru,
    ziskejInfoOdkazu,
    undo: vratHistoriiZpet,
    redo: vratHistoriiVpred,
    kontrolaDomu,
    ziskejStavFormatu,
    ziskejModel: () => (dokument ? structuredClone(dokument) : null)
  });
})();
