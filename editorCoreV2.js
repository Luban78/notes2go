/* ========================================
   LUBANOTE – EDITOR CORE V2 (LAB)
   FÁZE V2.14b: seznamový popup v toolbaru + přesné zarovnání značek.

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

  const VERZE_MODELU = 5;
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
  let vybranyObrazekId = "";

  /* ==========================================
     V2.12 – MODEL DRAG & MOVE OBRÁZKU

     Gesto záměrně kopíruje odladěný produkční UX:
     - krátký tap = výběr obrázku,
     - dlouhý stisk 650 ms = připraveno k přesunu,
     - pohyb až po long-pressu = drag,
     - před long-pressem zůstává přirozený scroll,
     - horizontální místo puštění určí vlevo / střed / vpravo.

     ZÁSADNÍ rozdíl proti starému editoru: během dragu se NEMĚNÍ DOM
     dokumentu. Cíl se pouze počítá a při puštění se atomicky upraví
     `dokument.bloky`; DOM se potom celý vykreslí z modelu.
  ========================================== */
  const DELKA_DLOUHEHO_STISKU_V2_OBRAZKU = 650;
  const VZDALENOST_ZRUSENI_V2_LONGPRESS = 20;
  const VZDALENOST_START_V2_DRAG = 6;
  let v2DragObrazku = null;
  let v2DragCasovac = null;
  let v2DropIndicator = null;
  let v2MoveHint = null;
  let v2AutoScrollRaf = null;
  let potlacKlikV2ObrazkuDo = 0;

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

  function normalizujUrovenBulletu(hodnota) {
    const cislo = Number.parseInt(hodnota, 10);
    if (!Number.isFinite(cislo)) return 0;
    return Math.max(0, Math.min(6, cislo));
  }

  function vytvorSeznamovyBlokZObsahu(obsah, typ = "bullet", uroven = 0, zarovnani = "left") {
    const normalizovanyTyp = typ === "ordered" ? "ordered" : "bullet";
    return {
      id: noveIdBloku(),
      typ: normalizovanyTyp,
      uroven: normalizujUrovenBulletu(uroven),
      zarovnani,
      obsah: normalizujObsah(obsah)
    };
  }

  function vytvorBulletZObsahu(obsah, uroven = 0, zarovnani = "left") {
    return vytvorSeznamovyBlokZObsahu(obsah, "bullet", uroven, zarovnani);
  }

  function vytvorCislovanyZObsahu(obsah, uroven = 0, zarovnani = "left") {
    return vytvorSeznamovyBlokZObsahu(obsah, "ordered", uroven, zarovnani);
  }

  function jeBulletBlok(blok) {
    return blok?.typ === "bullet";
  }

  function jeCislovanyBlok(blok) {
    return blok?.typ === "ordered";
  }

  function jeSeznamovyBlok(blok) {
    return jeBulletBlok(blok) || jeCislovanyBlok(blok);
  }

  function jeTextovyBlok(blok) {
    return blok?.typ === "odstavec" || jeSeznamovyBlok(blok);
  }

  function jeObrazkovyBlok(blok) {
    return blok?.typ === "obrazek";
  }

  function normalizujVelikostObrazku(hodnota) {
    const text = String(hodnota ?? "").trim().toLowerCase();
    if (!text || text === "prizpusobit") return "prizpusobit";
    const cislo = Number.parseFloat(text);
    if (!Number.isFinite(cislo)) return "prizpusobit";
    return String(Math.max(10, Math.min(100, Math.round(cislo))));
  }

  function normalizujZarovnaniObrazku(hodnota) {
    const text = String(hodnota || "").trim().toLowerCase();
    return ["vlevo", "stred", "vpravo"].includes(text) ? text : "stred";
  }

  function vytvorBlokObrazku({
    zdroj = "",
    alt = "Obrázek v poznámce",
    attachmentId = "",
    velikost = "prizpusobit",
    zarovnani = "stred"
  } = {}) {
    return {
      id: noveIdBloku(),
      typ: "obrazek",
      zdroj: String(zdroj || ""),
      alt: String(alt || "Obrázek v poznámce"),
      attachmentId: String(attachmentId || ""),
      velikost: normalizujVelikostObrazku(velikost),
      zarovnani: normalizujZarovnaniObrazku(zarovnani)
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
    if (!jeTextovyBlok(blok)) return;
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
    dokument.bloky = dokument.bloky.filter((blok) =>
      blok && (blok.typ === "odstavec" || blok.typ === "bullet" || blok.typ === "ordered" || blok.typ === "obrazek")
    );
    if (!dokument.bloky.length) dokument.bloky.push(vytvorOdstavec(""));

    dokument.bloky.forEach((blok) => {
      if (!blok.id) blok.id = noveIdBloku();

      if (jeObrazkovyBlok(blok)) {
        blok.zdroj = String(blok.zdroj || "");
        blok.alt = String(blok.alt || "Obrázek v poznámce");
        blok.attachmentId = String(blok.attachmentId || "");
        blok.velikost = normalizujVelikostObrazku(blok.velikost);
        blok.zarovnani = normalizujZarovnaniObrazku(blok.zarovnani);
        delete blok.obsah;
        return;
      }

      const puvodniTyp = blok.typ === "bullet" ? "bullet" : (blok.typ === "ordered" ? "ordered" : "odstavec");
      blok.typ = puvodniTyp;
      if (!Array.isArray(blok.obsah)) blok.obsah = [vytvorSegment("")];
      blok.obsah = normalizujObsah(blok.obsah);
      blok.zarovnani = normalizujZarovnani(blok.zarovnani);
      if (puvodniTyp === "bullet" || puvodniTyp === "ordered") {
        blok.uroven = normalizujUrovenBulletu(blok.uroven);
      } else {
        delete blok.uroven;
      }
    });

    /* V2.14a – úroveň seznamu je čistě modelová. Zabráníme neplatnému skoku
       o více úrovní; první položka po běžném odstavci začíná na úrovni 0.
       Stejné pravidlo platí pro odrážky i číslovaný seznam. */
    let predchoziSeznamUroven = null;
    dokument.bloky.forEach((blok) => {
      if (!jeSeznamovyBlok(blok)) {
        predchoziSeznamUroven = null;
        return;
      }
      let uroven = normalizujUrovenBulletu(blok.uroven);
      if (predchoziSeznamUroven === null) uroven = 0;
      else uroven = Math.min(uroven, predchoziSeznamUroven + 1);
      blok.uroven = uroven;
      predchoziSeznamUroven = uroven;
    });

    /* Caret musí mít vždy alespoň jeden skutečný textový blok. */
    if (!dokument.bloky.some(jeTextovyBlok)) {
      dokument.bloky.push(vytvorOdstavec(""));
    }
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

  function vykresliObrazkovyBlok(blok) {
    const figure = document.createElement("figure");
    figure.className = "ln-v2-obrazek lubaNoteImage";
    figure.dataset.lnV2Obrazek = blok.id;
    figure.dataset.lubanoteImage = "true";
    figure.dataset.velikost = normalizujVelikostObrazku(blok.velikost);
    figure.dataset.zarovnani = normalizujZarovnaniObrazku(blok.zarovnani);
    figure.style.setProperty(
      "--ln-v2-obrazek-sirka",
      figure.dataset.velikost === "prizpusobit" ? "100%" : `${figure.dataset.velikost}%`
    );
    if (blok.attachmentId) figure.dataset.attachmentId = blok.attachmentId;
    figure.contentEditable = "false";
    figure.tabIndex = 0;

    const image = document.createElement("img");
    image.src = blok.zdroj;
    image.alt = blok.alt || "Obrázek v poznámce";
    image.loading = "lazy";
    image.draggable = false;
    image.tabIndex = -1;
    image.dataset.velikost = figure.dataset.velikost;
    image.dataset.zarovnani = figure.dataset.zarovnani;

    const settingsButton = document.createElement("button");
    settingsButton.type = "button";
    settingsButton.className = "lubaNoteImageSettings ln-v2-obrazek-nastaveni";
    settingsButton.dataset.v2ImageSettings = blok.id;
    settingsButton.setAttribute("aria-label", "Nastavení obrázku");
    settingsButton.contentEditable = "false";
    if (window.LubaNoteIcons?.nastavJenIkonu) {
      window.LubaNoteIcons.nastavJenIkonu(settingsButton, "nastaveni", ["editorImageControlSvgIcon"]);
    } else {
      settingsButton.textContent = "⚙";
    }

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "lubaNoteImageRemove ln-v2-obrazek-smazat";
    removeButton.dataset.v2ImageRemove = blok.id;
    removeButton.setAttribute("aria-label", "Odstranit obrázek");
    removeButton.contentEditable = "false";
    if (window.LubaNoteIcons?.nastavJenIkonu) {
      window.LubaNoteIcons.nastavJenIkonu(removeButton, "zavrit", ["editorImageControlSvgIcon"]);
    } else {
      removeButton.textContent = "×";
    }

    figure.append(image, settingsButton, removeButton);
    return figure;
  }

  function vykresli(vyberNeboCaret = posledniVyber || posledniPozice) {
    if (!editor) return;
    normalizujDokument();

    const fragment = document.createDocumentFragment();

    const cislovani = [];
    let predchoziBylCislovany = false;

    dokument.bloky.forEach((blok) => {
      if (jeObrazkovyBlok(blok)) {
        fragment.appendChild(vykresliObrazkovyBlok(blok));
        predchoziBylCislovany = false;
        cislovani.length = 0;
        return;
      }

      const radek = document.createElement("div");
      const seznamovaTrida = jeBulletBlok(blok)
        ? " ln-v2-bullet"
        : (jeCislovanyBlok(blok) ? " ln-v2-ordered" : "");
      radek.className = `ln-v2-odstavec${seznamovaTrida}`;
      radek.dataset.lnV2Blok = blok.id;
      radek.dataset.typ = blok.typ;
      radek.style.textAlign = blok.zarovnani || "left";
      if (jeSeznamovyBlok(blok)) {
        const uroven = normalizujUrovenBulletu(blok.uroven);
        radek.dataset.lnV2BulletUroven = String(uroven);
        radek.style.setProperty("--ln-v2-bullet-indent", `${30 + (uroven * 24)}px`);

        if (jeCislovanyBlok(blok)) {
          if (!predchoziBylCislovany) cislovani.length = 0;
          cislovani.length = uroven + 1;
          cislovani[uroven] = (Number(cislovani[uroven]) || 0) + 1;
          for (let i = 0; i < uroven; i += 1) {
            if (!Number(cislovani[i])) cislovani[i] = 1;
          }
          radek.dataset.lnV2ListLabel = `${cislovani[uroven]}.`;
          predchoziBylCislovany = true;
        } else {
          predchoziBylCislovany = false;
          cislovani.length = 0;
        }
      } else {
        predchoziBylCislovany = false;
        cislovani.length = 0;
      }

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
    if (!jeTextovyBlok(blok)) return { vlevo: [], vpravo: [] };
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
    if (!jeTextovyBlok(blok) || !blok?.obsah?.length) return kopieFormatu();
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
    if (!jeTextovyBlok(blok) || !blok?.obsah?.length) return false;
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

    /* V2.14a – Enter na prázdné položce ukončí odrážky i číslovaný seznam.
       WebView do struktury seznamu vůbec nezasahuje. */
    if (jeSeznamovyBlok(blok) && textBloku(blok).length === 0) {
      const uroven = normalizujUrovenBulletu(blok.uroven);
      if (uroven > 0) {
        blok.uroven = uroven - 1;
      } else {
        blok.typ = "odstavec";
        delete blok.uroven;
        blok.zarovnani = normalizujZarovnani(blok.zarovnani);
      }
      return { blok: caret.blok, offset: 0 };
    }

    const rez = rozdelObsah(blok, caret.offset);
    nastavObsahBloku(blok, rez.vlevo);

    const novyObsah = rez.vpravo.length ? rez.vpravo : [vytvorSegment("", format)];
    const novy = jeSeznamovyBlok(blok)
      ? vytvorSeznamovyBlokZObsahu(novyObsah, blok.typ, blok.uroven, blok.zarovnani || "left")
      : vytvorOdstavecZObsahu(novyObsah, blok.zarovnani || "left");
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

    /* V2.14a – Backspace na začátku položky seznamu nevytváří browserový DOM.
       Na úrovni 0 seznam zruší a zachová text; vnořená položka se nejprve vysune. */
    if (jeSeznamovyBlok(blok)) {
      const uroven = normalizujUrovenBulletu(blok.uroven);
      if (uroven > 0) blok.uroven = uroven - 1;
      else {
        blok.typ = "odstavec";
        delete blok.uroven;
      }
      return caret;
    }

    if (caret.blok === 0) return caret;

    const predchozi = dokument.bloky[caret.blok - 1];

    /* Obrázek je atomický modelový blok. Backspace na začátku textu za
       obrázkem odstraní právě tento blok a caret nechá na začátku textu. */
    if (jeObrazkovyBlok(predchozi)) {
      dokument.bloky.splice(caret.blok - 1, 1);
      vybranyObrazekId = "";
      return { blok: caret.blok - 1, offset: 0 };
    }

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

    /* Delete na konci textu před obrázkem odstraní atomický image blok. */
    if (jeObrazkovyBlok(dalsi)) {
      dokument.bloky.splice(caret.blok + 1, 1);
      vybranyObrazekId = "";
      return caret;
    }

    nastavObsahBloku(blok, [...blok.obsah, ...dalsi.obsah]);
    dokument.bloky.splice(caret.blok + 1, 1);
    return caret;
  }

  function najdiTextovyBlokOd(index, smer = 1) {
    if (!dokument?.bloky?.length) return -1;
    const krok = smer < 0 ? -1 : 1;
    let i = Math.max(0, Math.min(dokument.bloky.length - 1, Number(index) || 0));
    while (i >= 0 && i < dokument.bloky.length) {
      if (jeTextovyBlok(dokument.bloky[i])) return i;
      i += krok;
    }
    return -1;
  }

  function vlozObrazekZToolbaru(data = {}) {
    if (!dokument?.bloky?.length) return false;

    const zdroj = String(data.zdroj || data.dataUrl || "").trim();
    if (!zdroj) {
      nastavStav("Obrázek: chybí zdroj", true);
      return false;
    }

    const vyber = ziskejFormatovaciVyber() || vyberZPosledniPozice();
    if (!vyber) return false;

    /* Stejně jako starý LubaNote obrázek označený text nemaže – vloží se
       na konec aktuálního výběru. V2 pak přesně rozdělí modelový odstavec. */
    let cil = { ...(vyber.konec || vyber.zacatek) };
    if (!jeTextovyBlok(dokument.bloky[cil.blok])) {
      const nejblizsi = najdiTextovyBlokOd(cil.blok, 1);
      const zaloha = nejblizsi >= 0 ? nejblizsi : najdiTextovyBlokOd(cil.blok, -1);
      if (zaloha < 0) return false;
      cil = { blok: zaloha, offset: textBloku(dokument.bloky[zaloha]).length };
    }

    const blok = dokument.bloky[cil.blok];
    const delka = textBloku(blok).length;
    cil.offset = Math.max(0, Math.min(delka, Number(cil.offset) || 0));

    const snapshotPred = vytvorSnapshotHistorie(vyber);
    const obrazek = vytvorBlokObrazku({
      zdroj,
      alt: data.alt || (data.fileName ? `Obrázek: ${data.fileName}` : "Obrázek v poznámce"),
      attachmentId: data.attachmentId || "",
      velikost: data.velikost || "prizpusobit",
      zarovnani: data.zarovnani || "stred"
    });

    let novaPozice;

    if (delka === 0) {
      const novyRadek = vytvorOdstavec("");
      dokument.bloky.splice(cil.blok, 1, obrazek, novyRadek);
      novaPozice = { blok: cil.blok + 1, offset: 0 };
    } else if (cil.offset <= 0) {
      const novyRadek = vytvorOdstavec("");
      dokument.bloky.splice(cil.blok, 0, obrazek, novyRadek);
      novaPozice = { blok: cil.blok + 1, offset: 0 };
    } else if (cil.offset >= delka) {
      const novyRadek = vytvorOdstavec("");
      dokument.bloky.splice(cil.blok + 1, 0, obrazek, novyRadek);
      novaPozice = { blok: cil.blok + 2, offset: 0 };
    } else {
      const rez = rozdelObsah(blok, cil.offset);
      nastavObsahBloku(blok, rez.vlevo);
      const novyRadek = vytvorOdstavec("");
      const blokZa = vytvorOdstavecZObsahu(
        rez.vpravo.length ? rez.vpravo : [vytvorSegment("")],
        blok.zarovnani || "left"
      );
      dokument.bloky.splice(cil.blok + 1, 0, obrazek, novyRadek, blokZa);
      novaPozice = { blok: cil.blok + 2, offset: 0 };
    }

    vybranyObrazekId = obrazek.id;
    aktivniFormatPsani = null;
    aktivniFormatPozice = "";
    aktivniFormatZdroj = "";
    const novyVyber = { zacatek: novaPozice, konec: novaPozice, sbaleny: true };
    ulozenyFormatovaciVyber = klonVyberu(novyVyber);
    ulozZmenuDoHistorie(snapshotPred, "vložit obrázek");
    vykresli(novyVyber);
    nastavStav("Obrázek vložen jako samostatný V2 modelový blok");
    zapisDebug?.(`EDITOR V2 | image insert | block=${obrazek.id}`);
    return true;
  }

  function smazObrazekZModelu(obrazekId) {
    const id = String(obrazekId || "");
    const index = dokument?.bloky?.findIndex((blok) => jeObrazkovyBlok(blok) && blok.id === id) ?? -1;
    if (index < 0) return false;

    const snapshotPred = vytvorSnapshotHistorie(posledniVyber || vyberZPosledniPozice());
    dokument.bloky.splice(index, 1);
    if (!dokument.bloky.some(jeTextovyBlok)) dokument.bloky.push(vytvorOdstavec(""));

    let cil = najdiTextovyBlokOd(Math.min(index, dokument.bloky.length - 1), 1);
    if (cil < 0) cil = najdiTextovyBlokOd(Math.max(0, index - 1), -1);
    if (cil < 0) cil = 0;
    const pozice = { blok: cil, offset: 0 };
    const novyVyber = { zacatek: pozice, konec: pozice, sbaleny: true };

    vybranyObrazekId = "";
    ulozenyFormatovaciVyber = klonVyberu(novyVyber);
    ulozZmenuDoHistorie(snapshotPred, "smazat obrázek");
    vykresli(novyVyber);
    editor?.focus({ preventScroll: true });
    nastavStav("Obrázek odstraněn z V2 modelu");
    zapisDebug?.(`EDITOR V2 | image delete | block=${id}`);
    return true;
  }

  function ziskejNastaveniObrazku(obrazekId = vybranyObrazekId) {
    const id = String(obrazekId || "");
    const blok = dokument?.bloky?.find((polozka) => jeObrazkovyBlok(polozka) && polozka.id === id);
    if (!blok) return null;

    return {
      id: blok.id,
      zdroj: String(blok.zdroj || ""),
      alt: String(blok.alt || "Obrázek v poznámce"),
      attachmentId: String(blok.attachmentId || ""),
      velikost: normalizujVelikostObrazku(blok.velikost),
      zarovnani: normalizujZarovnaniObrazku(blok.zarovnani)
    };
  }

  function nastavOrezanyZdrojObrazku(obrazekId, novyZdroj) {
    const id = String(obrazekId || vybranyObrazekId || "");
    const blok = dokument?.bloky?.find((polozka) => jeObrazkovyBlok(polozka) && polozka.id === id);
    if (!blok) return false;

    const zdroj = String(novyZdroj || "").trim();
    if (!zdroj || zdroj === blok.zdroj) return false;

    const snapshotPred = vytvorSnapshotHistorie(posledniVyber || vyberZPosledniPozice());
    blok.zdroj = zdroj;

    /* Ořez vytváří novou obrazovou variantu. Původní attachmentId už neodpovídá
       novým pixelům, proto jej ve V2 TEST kopii odpojíme. Undo obnoví celý
       původní blok včetně attachmentId ze snapshotu historie. */
    blok.attachmentId = "";
    vybranyObrazekId = id;

    ulozZmenuDoHistorie(snapshotPred, "oříznout obrázek");
    vykresli(posledniVyber || posledniPozice);

    queueMicrotask(() => {
      const figure = Array.from(editor?.querySelectorAll?.(".ln-v2-obrazek[data-ln-v2-obrazek]") || [])
        .find((polozka) => polozka.dataset.lnV2Obrazek === id);
      if (!figure) return;
      try { figure.focus({ preventScroll: true }); } catch (_error) { figure.focus(); }
    });

    nastavStav("Obrázek oříznut ve V2 modelové kopii");
    zapisDebug?.(`EDITOR V2 | image crop | block=${id}`);
    return true;
  }

  function nastavNastaveniObrazku(obrazekId, hodnoty = {}) {
    const id = String(obrazekId || vybranyObrazekId || "");
    const blok = dokument?.bloky?.find((polozka) => jeObrazkovyBlok(polozka) && polozka.id === id);
    if (!blok) return false;

    const novaVelikost = normalizujVelikostObrazku(hodnoty.velikost ?? blok.velikost);
    const noveZarovnani = normalizujZarovnaniObrazku(hodnoty.zarovnani ?? blok.zarovnani);

    if (novaVelikost === blok.velikost && noveZarovnani === blok.zarovnani) return true;

    const snapshotPred = vytvorSnapshotHistorie(posledniVyber || vyberZPosledniPozice());
    blok.velikost = novaVelikost;
    blok.zarovnani = noveZarovnani;
    vybranyObrazekId = id;

    ulozZmenuDoHistorie(snapshotPred, "nastavení obrázku");
    vykresli(posledniVyber || posledniPozice);

    queueMicrotask(() => {
      const figure = Array.from(editor?.querySelectorAll?.(".ln-v2-obrazek[data-ln-v2-obrazek]") || [])
        .find((polozka) => polozka.dataset.lnV2Obrazek === id);
      if (!figure) return;
      try { figure.focus({ preventScroll: true }); } catch (_error) { figure.focus(); }
    });

    nastavStav(`Obrázek: ${novaVelikost === "prizpusobit" ? "přizpůsobit" : `${novaVelikost} %`} · ${noveZarovnani}`);
    zapisDebug?.(`EDITOR V2 | image settings | block=${id} | size=${novaVelikost} | align=${noveZarovnani}`);
    return true;
  }

  function zrusV2DragCasovac() {
    if (v2DragCasovac !== null) clearTimeout(v2DragCasovac);
    v2DragCasovac = null;
  }

  function zajistiV2DropIndicator() {
    if (v2DropIndicator?.isConnected) return v2DropIndicator;
    v2DropIndicator = document.createElement("div");
    v2DropIndicator.className = "lubaNoteImageDropIndicator ln-v2-image-drop-indicator";
    v2DropIndicator.hidden = true;
    v2DropIndicator.setAttribute("aria-hidden", "true");
    document.body.append(v2DropIndicator);
    return v2DropIndicator;
  }

  function zajistiV2MoveHint() {
    if (v2MoveHint?.isConnected) return v2MoveHint;
    v2MoveHint = document.createElement("div");
    v2MoveHint.className = "lubaNoteImageMoveHint ln-v2-image-move-hint";
    v2MoveHint.textContent = "↕";
    v2MoveHint.hidden = true;
    v2MoveHint.setAttribute("aria-hidden", "true");
    document.body.append(v2MoveHint);
    return v2MoveHint;
  }

  function schovejV2DragPomucky() {
    if (v2DropIndicator) v2DropIndicator.hidden = true;
    if (v2MoveHint) v2MoveHint.hidden = true;
  }

  function zobrazV2MoveHint(clientX, clientY, jeDotyk) {
    const hint = zajistiV2MoveHint();
    hint.style.left = `${Math.round(clientX)}px`;
    hint.style.top = `${Math.round(jeDotyk ? clientY - 65 : clientY)}px`;
    hint.style.transform = "translate(-50%, -50%)";
    hint.hidden = false;
  }

  function urciV2ZarovnaniZBodu(clientX) {
    const rect = editor?.getBoundingClientRect?.();
    if (!rect?.width) return "stred";
    const pomer = (clientX - rect.left) / rect.width;
    if (pomer < 0.38) return "vlevo";
    if (pomer > 0.62) return "vpravo";
    return "stred";
  }

  function caretRangeZBoduV2(clientX, clientY) {
    try {
      if (typeof document.caretRangeFromPoint === "function") {
        return document.caretRangeFromPoint(clientX, clientY);
      }
      if (typeof document.caretPositionFromPoint === "function") {
        const pozice = document.caretPositionFromPoint(clientX, clientY);
        if (!pozice) return null;
        const range = document.createRange();
        range.setStart(pozice.offsetNode, pozice.offset);
        range.collapse(true);
        return range;
      }
    } catch (_error) {}
    return null;
  }

  function cilV2PresunuZBodu(clientX, clientY) {
    if (!editor || !v2DragObrazku) return null;

    const prvek = document.elementFromPoint(clientX, clientY);
    const figure = prvek?.closest?.(".ln-v2-obrazek[data-ln-v2-obrazek]");
    if (
      figure &&
      editor.contains(figure) &&
      figure.dataset.lnV2Obrazek !== v2DragObrazku.obrazekId
    ) {
      const rect = figure.getBoundingClientRect();
      const za = clientY >= rect.top + rect.height / 2;
      return {
        typ: "obrazek",
        cilId: figure.dataset.lnV2Obrazek,
        za,
        y: za ? rect.bottom : rect.top
      };
    }

    const range = caretRangeZBoduV2(clientX, clientY);
    if (range && editor.contains(range.commonAncestorContainer)) {
      const pozice = domBodNaModel(range.startContainer, range.startOffset);
      if (pozice && jeTextovyBlok(dokument.bloky[pozice.blok])) {
        const blok = dokument.bloky[pozice.blok];
        let y = clientY;
        try {
          const r = range.getBoundingClientRect();
          if (r && Number.isFinite(r.top)) y = r.bottom || r.top;
        } catch (_error) {}
        return {
          typ: "text",
          cilId: blok.id,
          offset: pozice.offset,
          y
        };
      }
    }

    /* Fallback mezi přímými bloky – používá pouze stabilní ID modelu. */
    const deti = Array.from(editor.children).filter((el) =>
      el.dataset?.lnV2Obrazek !== v2DragObrazku.obrazekId
    );
    for (const el of deti) {
      const rect = el.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        return {
          typ: "pred",
          cilId: el.dataset?.lnV2Blok || el.dataset?.lnV2Obrazek || "",
          y: rect.top
        };
      }
    }

    const rectEditor = editor.getBoundingClientRect();
    return {
      typ: "konec",
      y: Math.min(rectEditor.bottom - 4, Math.max(rectEditor.top + 4, clientY))
    };
  }

  function zobrazV2DropIndicator(clientX, cil) {
    if (!editor || !cil) return;
    const marker = zajistiV2DropIndicator();
    const rect = editor.getBoundingClientRect();
    const odsazeni = 6;
    marker.style.left = `${Math.round(rect.left + odsazeni)}px`;
    marker.style.width = `${Math.max(20, Math.round(rect.width - odsazeni * 2))}px`;
    marker.style.top = `${Math.round(cil.y)}px`;
    const relativniX = Math.max(
      0,
      Math.min(rect.width - odsazeni * 2, clientX - (rect.left + odsazeni))
    );
    marker.style.setProperty("--luba-note-drop-x", `${Math.round(relativniX)}px`);
    marker.hidden = false;
  }

  function aktualizujV2CilPresunu(clientX, clientY) {
    if (!v2DragObrazku?.aktivni) return;
    v2DragObrazku.lastX = clientX;
    v2DragObrazku.lastY = clientY;
    v2DragObrazku.cil = cilV2PresunuZBodu(clientX, clientY);
    zobrazV2DropIndicator(clientX, v2DragObrazku.cil);
  }

  function ziskejV2AutoScrollKrok(clientY) {
    const rect = editor?.getBoundingClientRect?.();
    if (!rect?.height) return 0;
    const zona = Math.min(86, Math.max(58, rect.height * 0.16));
    const maximalniKrok = 16;
    if (clientY < rect.top + zona) {
      const sila = Math.min(1, Math.max(0, (rect.top + zona - clientY) / zona));
      return -maximalniKrok * sila;
    }
    if (clientY > rect.bottom - zona) {
      const sila = Math.min(1, Math.max(0, (clientY - (rect.bottom - zona)) / zona));
      return maximalniKrok * sila;
    }
    return 0;
  }

  function zastavV2AutoScroll() {
    if (v2AutoScrollRaf !== null) cancelAnimationFrame(v2AutoScrollRaf);
    v2AutoScrollRaf = null;
  }

  function krokV2AutoScroll() {
    v2AutoScrollRaf = null;
    if (!v2DragObrazku?.aktivni || !editor) return;
    const krok = ziskejV2AutoScrollKrok(v2DragObrazku.lastY);
    if (Math.abs(krok) < 0.2) return;
    const pred = editor.scrollTop;
    const maximum = Math.max(0, editor.scrollHeight - editor.clientHeight);
    editor.scrollTop = Math.max(0, Math.min(maximum, pred + krok));
    if (Math.abs(editor.scrollTop - pred) < 0.1) return;
    aktualizujV2CilPresunu(v2DragObrazku.lastX, v2DragObrazku.lastY);
    v2AutoScrollRaf = requestAnimationFrame(krokV2AutoScroll);
  }

  function aktualizujV2AutoScroll(clientX, clientY) {
    if (!v2DragObrazku?.aktivni) {
      zastavV2AutoScroll();
      return;
    }
    v2DragObrazku.lastX = clientX;
    v2DragObrazku.lastY = clientY;
    if (Math.abs(ziskejV2AutoScrollKrok(clientY)) < 0.2) {
      zastavV2AutoScroll();
      return;
    }
    if (v2AutoScrollRaf === null) v2AutoScrollRaf = requestAnimationFrame(krokV2AutoScroll);
  }

  function jePrazdnyV2TextovyBlok(blok) {
    return jeTextovyBlok(blok) && textBloku(blok) === "";
  }

  function najdiIndexBlokuPodleId(id) {
    return dokument?.bloky?.findIndex((blok) => blok?.id === id) ?? -1;
  }

  function vlozPresouvanyV2ObrazekDoCile(obrazek, cil) {
    if (!obrazek) return -1;

    if (cil?.typ === "text") {
      const index = najdiIndexBlokuPodleId(cil.cilId);
      const blok = dokument.bloky[index];
      if (index >= 0 && jeTextovyBlok(blok)) {
        const delka = textBloku(blok).length;
        const offset = Math.max(0, Math.min(delka, Number(cil.offset) || 0));
        if (offset <= 0) {
          dokument.bloky.splice(index, 0, obrazek);
          return index;
        }
        if (offset >= delka) {
          dokument.bloky.splice(index + 1, 0, obrazek);
          return index + 1;
        }

        const rez = rozdelObsah(blok, offset);
        nastavObsahBloku(blok, rez.vlevo);
        const blokZa = vytvorOdstavecZObsahu(
          rez.vpravo.length ? rez.vpravo : [vytvorSegment("")],
          blok.zarovnani || "left"
        );
        dokument.bloky.splice(index + 1, 0, obrazek, blokZa);
        return index + 1;
      }
    }

    if (cil?.typ === "obrazek") {
      const index = najdiIndexBlokuPodleId(cil.cilId);
      if (index >= 0) {
        const kam = cil.za ? index + 1 : index;
        dokument.bloky.splice(kam, 0, obrazek);
        return kam;
      }
    }

    if (cil?.typ === "pred") {
      const index = najdiIndexBlokuPodleId(cil.cilId);
      if (index >= 0) {
        dokument.bloky.splice(index, 0, obrazek);
        return index;
      }
    }

    dokument.bloky.push(obrazek);
    return dokument.bloky.length - 1;
  }

  function presunV2ObrazekDoCile(obrazekId, cil, clientX, zachovatVyberObrazku = false) {
    const zdrojIndex = dokument?.bloky?.findIndex(
      (blok) => jeObrazkovyBlok(blok) && blok.id === obrazekId
    ) ?? -1;
    if (zdrojIndex < 0) return false;

    const snapshotPred = vytvorSnapshotHistorie(posledniVyber || vyberZPosledniPozice());
    const obrazek = dokument.bloky[zdrojIndex];
    const puvodniPrazdny = jePrazdnyV2TextovyBlok(dokument.bloky[zdrojIndex + 1])
      ? dokument.bloky[zdrojIndex + 1].id
      : "";

    dokument.bloky.splice(zdrojIndex, 1);

    obrazek.zarovnani = urciV2ZarovnaniZBodu(clientX);
    let novyIndex = vlozPresouvanyV2ObrazekDoCile(obrazek, cil);

    /* Stejně jako odladěný produkční drag uklidíme prázdný řádek, který byl
       pouze technicky za PŮVODNÍ pozicí obrázku. Děláme to až PO vložení:
       pokud je právě tento řádek novým cílem, obrázek před ním zůstane a
       řádek se správně zachová jako editovatelná pozice za obrázkem. */
    if (puvodniPrazdny) {
      const prazdnyIndex = najdiIndexBlokuPodleId(puvodniPrazdny);
      if (
        prazdnyIndex >= 0 &&
        jePrazdnyV2TextovyBlok(dokument.bloky[prazdnyIndex]) &&
        !jeObrazkovyBlok(dokument.bloky[prazdnyIndex - 1])
      ) {
        dokument.bloky.splice(prazdnyIndex, 1);
      }
    }

    if (!dokument.bloky.some(jeTextovyBlok)) dokument.bloky.push(vytvorOdstavec(""));
    if (jeObrazkovyBlok(dokument.bloky[dokument.bloky.length - 1])) {
      dokument.bloky.push(vytvorOdstavec(""));
    }

    novyIndex = dokument.bloky.findIndex((blok) => blok.id === obrazekId);
    let caretIndex = najdiTextovyBlokOd(Math.min(novyIndex + 1, dokument.bloky.length - 1), 1);
    if (caretIndex < 0) caretIndex = najdiTextovyBlokOd(Math.max(0, novyIndex - 1), -1);
    if (caretIndex < 0) caretIndex = 0;
    const caret = {
      blok: caretIndex,
      offset: caretIndex > novyIndex ? 0 : textBloku(dokument.bloky[caretIndex]).length
    };
    const novyVyber = { zacatek: caret, konec: caret, sbaleny: true };

    vybranyObrazekId = zachovatVyberObrazku ? obrazekId : "";
    posledniPozice = { ...caret };
    posledniVyber = klonVyberu(novyVyber);
    ulozenyFormatovaciVyber = klonVyberu(novyVyber);
    aktivniFormatPsani = null;
    aktivniFormatPozice = "";
    aktivniFormatZdroj = "";

    const zmeneno = ulozZmenuDoHistorie(snapshotPred, "přesun obrázku");
    vykresli(novyVyber);

    queueMicrotask(() => {
      if (zachovatVyberObrazku) {
        const figure = Array.from(editor?.querySelectorAll?.(".ln-v2-obrazek[data-ln-v2-obrazek]") || [])
          .find((polozka) => polozka.dataset.lnV2Obrazek === obrazekId);
        if (!figure) return;
        try { figure.focus({ preventScroll: true }); } catch (_error) { figure.focus(); }
        return;
      }
      try { editor?.focus({ preventScroll: true }); } catch (_error) { editor?.focus(); }
      nastavVyberModelu(caret);
    });

    nastavStav(zmeneno ? `Obrázek přesunut · ${obrazek.zarovnani}` : "Obrázek zůstal na stejné pozici");
    zapisDebug?.(`EDITOR V2 | image drag | block=${obrazekId} | changed=${zmeneno ? "Y" : "N"} | align=${obrazek.zarovnani}`);
    return true;
  }

  function vzdalenostV2Drag(clientX, clientY) {
    if (!v2DragObrazku) return 0;
    return Math.hypot(clientX - v2DragObrazku.startX, clientY - v2DragObrazku.startY);
  }

  function pripravV2DlouhyStisk(typ, image, clientX, clientY, pointerId = null, touchId = null) {
    zrusV2Drag();
    const figure = image?.closest?.(".ln-v2-obrazek[data-ln-v2-obrazek]");
    if (!figure) return;

    v2DragObrazku = {
      typ,
      obrazekId: figure.dataset.lnV2Obrazek || "",
      image,
      figure,
      pointerId,
      touchId,
      startX: clientX,
      startY: clientY,
      lastX: clientX,
      lastY: clientY,
      scrollTopPred: editor?.scrollTop || 0,
      pripraven: false,
      aktivni: false,
      cil: null,
      puvodneVybrany: vybranyObrazekId === (figure.dataset.lnV2Obrazek || "")
    };

    v2DragCasovac = setTimeout(() => {
      v2DragCasovac = null;
      if (!v2DragObrazku || !v2DragObrazku.figure?.isConnected) {
        zrusV2Drag();
        return;
      }
      v2DragObrazku.pripraven = true;
      v2DragObrazku.scrollTopPred = editor?.scrollTop || 0;
      editor?.classList.add("lubaNoteImageMoveReady");
      zobrazV2MoveHint(clientX, clientY, typ === "touch");
      nastavStav("Přesun obrázku připraven · táhni a pusť na cílovém místě");
    }, DELKA_DLOUHEHO_STISKU_V2_OBRAZKU);
  }

  function spustV2Drag(clientX, clientY) {
    if (!v2DragObrazku?.pripraven || v2DragObrazku.aktivni) return;
    v2DragObrazku.aktivni = true;
    v2DragObrazku.figure.classList.add("lubaNoteImageDragging");
    editor?.classList.add("lubaNoteImageDragMode");
    if (v2DragObrazku.pointerId !== null) {
      try { v2DragObrazku.image?.setPointerCapture?.(v2DragObrazku.pointerId); } catch (_error) {}
    }
    aktualizujV2CilPresunu(clientX, clientY);
  }

  function zrusV2Drag() {
    zrusV2DragCasovac();
    zastavV2AutoScroll();
    if (v2DragObrazku?.pointerId !== null) {
      try { v2DragObrazku?.image?.releasePointerCapture?.(v2DragObrazku.pointerId); } catch (_error) {}
    }
    v2DragObrazku?.figure?.classList?.remove("lubaNoteImageDragging");
    editor?.classList?.remove("lubaNoteImageDragMode", "lubaNoteImageMoveReady");
    schovejV2DragPomucky();
    v2DragObrazku = null;
  }

  function dokoncV2Drag(clientX, clientY, ulozit) {
    if (!v2DragObrazku) return false;
    const drag = v2DragObrazku;
    const aktivni = drag.aktivni;
    const cil = drag.cil || cilV2PresunuZBodu(clientX, clientY);
    const obrazekId = drag.obrazekId;
    const puvodneVybrany = Boolean(drag.puvodneVybrany);

    zrusV2DragCasovac();
    zastavV2AutoScroll();
    if (drag.pointerId !== null) {
      try { drag.image?.releasePointerCapture?.(drag.pointerId); } catch (_error) {}
    }
    drag.figure?.classList?.remove("lubaNoteImageDragging");
    editor?.classList?.remove("lubaNoteImageDragMode", "lubaNoteImageMoveReady");
    schovejV2DragPomucky();
    v2DragObrazku = null;

    if (aktivni && ulozit) {
      potlacKlikV2ObrazkuDo = performance.now() + 650;
      return presunV2ObrazekDoCile(obrazekId, cil, clientX, puvodneVybrany);
    }

    if (drag.pripraven) potlacKlikV2ObrazkuDo = performance.now() + 650;
    return false;
  }

  function zpracujV2TouchMove(event) {
    if (v2DragObrazku?.typ !== "touch") return;
    const dotyk = Array.from(event.touches || []).find((t) => t.identifier === v2DragObrazku.touchId);
    if (!dotyk) return;
    const vzdalenost = vzdalenostV2Drag(dotyk.clientX, dotyk.clientY);

    if (!v2DragObrazku.pripraven) {
      if (vzdalenost > VZDALENOST_ZRUSENI_V2_LONGPRESS) zrusV2Drag();
      return;
    }

    event.preventDefault();
    if (!v2DragObrazku.aktivni && editor) editor.scrollTop = v2DragObrazku.scrollTopPred;
    zobrazV2MoveHint(dotyk.clientX, dotyk.clientY, true);
    if (!v2DragObrazku.aktivni && vzdalenost >= VZDALENOST_START_V2_DRAG) {
      spustV2Drag(dotyk.clientX, dotyk.clientY);
    }
    if (v2DragObrazku?.aktivni) {
      aktualizujV2CilPresunu(dotyk.clientX, dotyk.clientY);
      aktualizujV2AutoScroll(dotyk.clientX, dotyk.clientY);
    }
  }

  function zpracujV2TouchEnd(event) {
    if (v2DragObrazku?.typ !== "touch") return;
    const dotyk = Array.from(event.changedTouches || []).find((t) => t.identifier === v2DragObrazku.touchId);
    if (!dotyk) return;
    if (v2DragObrazku.pripraven) event.preventDefault();
    dokoncV2Drag(dotyk.clientX, dotyk.clientY, true);
  }

  function zpracujV2PointerMove(event) {
    if (v2DragObrazku?.typ !== "pointer" || v2DragObrazku.pointerId !== event.pointerId) return;
    const vzdalenost = vzdalenostV2Drag(event.clientX, event.clientY);
    if (!v2DragObrazku.pripraven) {
      if (vzdalenost > VZDALENOST_ZRUSENI_V2_LONGPRESS) zrusV2Drag();
      return;
    }
    event.preventDefault();
    if (!v2DragObrazku.aktivni && editor) editor.scrollTop = v2DragObrazku.scrollTopPred;
    zobrazV2MoveHint(event.clientX, event.clientY, false);
    if (!v2DragObrazku.aktivni && vzdalenost >= VZDALENOST_START_V2_DRAG) {
      spustV2Drag(event.clientX, event.clientY);
    }
    if (v2DragObrazku?.aktivni) {
      aktualizujV2CilPresunu(event.clientX, event.clientY);
      aktualizujV2AutoScroll(event.clientX, event.clientY);
    }
  }

  function zpracujV2PointerEnd(event) {
    if (v2DragObrazku?.typ !== "pointer" || v2DragObrazku.pointerId !== event.pointerId) return;
    if (v2DragObrazku.pripraven) event.preventDefault();
    dokoncV2Drag(event.clientX, event.clientY, true);
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
    if (!jeTextovyBlok(blok)) return;
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
    if (!jeTextovyBlok(blok)) return;
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
      if (!jeTextovyBlok(blok)) continue;
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
    if (!jeTextovyBlok(blok)) return;
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
      if (!jeTextovyBlok(blok)) continue;
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
      if (!jeTextovyBlok(blok)) continue;
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
    if (!jeTextovyBlok(blok)) return;
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
      if (!jeTextovyBlok(blok)) continue;
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
    if (!jeTextovyBlok(blok)) return;
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
      if (!jeTextovyBlok(blok)) continue;
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
      const blok = dokument.bloky[index];
      if (!jeTextovyBlok(blok)) continue;
      hodnoty.add(normalizujZarovnani(blok.zarovnani));
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
      if (!jeTextovyBlok(dokument.bloky[index])) continue;
      dokument.bloky[index].zarovnani = zarovnani;
    }

    const zmeneno = ulozZmenuDoHistorie(snapshotPred, `zarovnání ${zarovnani}`);
    vykresli(vyber);
    nastavStav(`Zarovnání odstavce: ${zarovnani}`);
    zapisDebug?.(`EDITOR V2 LAB | align=${zarovnani} | blocks=${od}-${doBloku}`);
    return zmeneno;
  }

  function stavSeznamuVeVyberu(vyber) {
    if (!vyber || !dokument?.bloky?.length) return "off";

    const od = Math.max(0, Math.min(dokument.bloky.length - 1, vyber.zacatek.blok));
    const doBloku = Math.max(od, Math.min(dokument.bloky.length - 1, vyber.konec.blok));
    const typy = new Set();

    for (let index = od; index <= doBloku; index += 1) {
      const blok = dokument.bloky[index];
      if (!jeTextovyBlok(blok)) continue;
      typy.add(jeBulletBlok(blok) ? "bullet" : (jeCislovanyBlok(blok) ? "ordered" : "off"));
    }

    if (!typy.size) return "off";
    if (typy.size > 1) return "mix";
    return Array.from(typy)[0];
  }

  function stavBulletVeVyberu(vyber) {
    const stav = stavSeznamuVeVyberu(vyber);
    if (stav === "mix") return "mix";
    return stav === "off" ? "off" : "on";
  }

  function nastavSeznamZToolbaru(hodnota) {
    const vyber = ziskejFormatovaciVyber();
    if (!vyber || !dokument?.bloky?.length) return false;

    const cilovyTyp = hodnota === "ordered" ? "ordered" : (hodnota === "bullet" ? "bullet" : "off");
    const od = Math.max(0, Math.min(dokument.bloky.length - 1, vyber.zacatek.blok));
    const doBloku = Math.max(od, Math.min(dokument.bloky.length - 1, vyber.konec.blok));
    const textoveIndexy = [];
    for (let index = od; index <= doBloku; index += 1) {
      if (jeTextovyBlok(dokument.bloky[index])) textoveIndexy.push(index);
    }
    if (!textoveIndexy.length) return false;

    /* 🔒 V2.14a – typ seznamu NESMÍ měnit formát textových segmentů.
       Přepnutí odrážka / číslování / běžný text mění pouze vlastnost bloku.
       Zvlášť u sbaleného caretu zachováváme i aktivní formát psaní; jeho
       vynulování dříve odhalilo podkladový explicitní font a toolbar skočil
       např. ze základních 13 na 16. */
    const formatPred = vyber.sbaleny
      ? kopieFormatu(
          (aktivniFormatPsani && aktivniFormatPozice === klicPozice(vyber.zacatek))
            ? aktivniFormatPsani
            : (formatZDomBodu() || formatNaPozici(dokument.bloky[vyber.zacatek.blok], vyber.zacatek.offset))
        )
      : null;
    const zdrojFormatuPred = aktivniFormatZdroj;
    const snapshotPred = vytvorSnapshotHistorie(vyber);

    let zmenenoTypem = false;
    textoveIndexy.forEach((index) => {
      const blok = dokument.bloky[index];
      const novyTyp = cilovyTyp === "off" ? "odstavec" : cilovyTyp;
      if (blok.typ === novyTyp) return;
      zmenenoTypem = true;
      blok.typ = novyTyp;
      if (cilovyTyp === "off") delete blok.uroven;
      else blok.uroven = jeSeznamovyBlok(blok) ? normalizujUrovenBulletu(blok.uroven) : 0;
    });

    if (!zmenenoTypem) {
      vykresli(vyber);
      return false;
    }

    normalizujDokument();
    const popis = cilovyTyp === "bullet"
      ? "odrážkový seznam"
      : (cilovyTyp === "ordered" ? "číslovaný seznam" : "zrušit seznam");
    const zmeneno = ulozZmenuDoHistorie(snapshotPred, popis);

    if (vyber.sbaleny && formatPred) {
      aktivniFormatPsani = formatPred;
      aktivniFormatPozice = klicPozice(vyber.zacatek);
      aktivniFormatZdroj = zdrojFormatuPred || "zdedeny";
    } else {
      aktivniFormatPsani = null;
      aktivniFormatPozice = "";
      aktivniFormatZdroj = "";
    }

    vykresli(vyber);
    nastavStav(
      cilovyTyp === "bullet"
        ? "Odrážkový seznam nastaven v modelu"
        : (cilovyTyp === "ordered" ? "Číslovaný seznam nastaven v modelu" : "Seznam zrušen v modelu")
    );
    zapisDebug?.(`EDITOR V2 | list type=${cilovyTyp} | blocks=${textoveIndexy.join(",")}`);
    return zmeneno;
  }

  function prepniBulletZToolbaru() {
    const vyber = ziskejFormatovaciVyber();
    const stav = stavSeznamuVeVyberu(vyber);
    return nastavSeznamZToolbaru(stav === "bullet" ? "off" : "bullet");
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

      if (jeObrazkovyBlok(blok)) {
        if (!blokEl?.matches?.("figure.ln-v2-obrazek.lubaNoteImage[data-ln-v2-obrazek]")) {
          return `blok ${b}: neplatný image element`;
        }
        if (blokEl.dataset.lnV2Obrazek !== blok.id) return `blok ${b}: jiné image id`;
        if (blokEl.dataset.velikost !== normalizujVelikostObrazku(blok.velikost)) {
          return `blok ${b}: jiná velikost obrázku DOM/model`;
        }
        if (blokEl.dataset.zarovnani !== normalizujZarovnaniObrazku(blok.zarovnani)) {
          return `blok ${b}: jiné zarovnání obrázku DOM/model`;
        }
        const image = blokEl.querySelector(":scope > img");
        if (!image) return `blok ${b}: chybí img`;
        if (String(image.getAttribute("src") || "") !== String(blok.zdroj || "")) {
          return `blok ${b}: jiný zdroj obrázku DOM/model`;
        }
        if (String(image.getAttribute("alt") || "") !== String(blok.alt || "Obrázek v poznámce")) {
          return `blok ${b}: jiný alt obrázku DOM/model`;
        }
        continue;
      }

      if (!blokEl?.matches?.(".ln-v2-odstavec[data-ln-v2-blok]")) return `blok ${b}: neplatný element`;
      if (blokEl.dataset.lnV2Blok !== blok.id) return `blok ${b}: jiné id`;
      if ((blokEl.dataset.typ || "odstavec") !== blok.typ) return `blok ${b}: jiný typ DOM/model`;
      if (jeSeznamovyBlok(blok)) {
        const ocekavanaTrida = jeCislovanyBlok(blok) ? "ln-v2-ordered" : "ln-v2-bullet";
        if (!blokEl.classList.contains(ocekavanaTrida)) return `blok ${b}: chybí seznamová třída`;
        if (blokEl.dataset.lnV2BulletUroven !== String(normalizujUrovenBulletu(blok.uroven))) {
          return `blok ${b}: jiná úroveň seznamu DOM/model`;
        }
      } else if (blokEl.classList.contains("ln-v2-bullet") || blokEl.classList.contains("ln-v2-ordered")) {
        return `blok ${b}: cizí seznamová třída`;
      }
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

  function importujSeznamDoModelu(seznam, uroven, bloky, nepodporovane) {
    if (!(seznam instanceof Element)) return;
    const tagSeznamu = seznam.tagName.toLowerCase();
    if (tagSeznamu !== "ul" && tagSeznamu !== "ol") return;
    const typSeznamu = tagSeznamu === "ol" ? "ordered" : "bullet";
    const povoleneInline = new Set(["span", "font", "b", "strong", "i", "em", "u", "mark", "a", "br"]);

    Array.from(seznam.children).forEach((li) => {
      if (li.tagName?.toLowerCase() !== "li") {
        nepodporovane.add(li.tagName?.toLowerCase?.() || "prvek v seznamu");
        return;
      }

      const obsah = [];
      const docasny = document.createElement("span");
      Array.from(li.childNodes).forEach((uzel) => {
        if (uzel.nodeType === Node.TEXT_NODE) {
          docasny.appendChild(uzel.cloneNode(true));
          return;
        }
        if (uzel.nodeType !== Node.ELEMENT_NODE) return;
        const tag = uzel.tagName.toLowerCase();
        if (tag === "ul" || tag === "ol") return;
        if (tag === "figure" || tag === "img") {
          nepodporovane.add("obrázek v seznamu");
          return;
        }
        if (!povoleneInline.has(tag)) {
          nepodporovane.add(`${tag} v seznamu`);
          return;
        }
        docasny.appendChild(uzel.cloneNode(true));
      });

      importujInlineUzly(docasny, VYCHOZI_FORMAT, obsah, nepodporovane);
      const zarovnani = normalizujZarovnani(li.style?.textAlign || li.getAttribute("align"));
      bloky.push(vytvorSeznamovyBlokZObsahu(obsah, typSeznamu, uroven, zarovnani));

      Array.from(li.children)
        .filter((dite) => ["ul", "ol"].includes(dite.tagName?.toLowerCase()))
        .forEach((vnoreny) => importujSeznamDoModelu(vnoreny, uroven + 1, bloky, nepodporovane));
    });
  }

  function vytvorObrazkovyBlokZHtml(element, nepodporovane) {
    if (!(element instanceof Element)) return null;
    const image = element.tagName?.toLowerCase() === "img"
      ? element
      : element.querySelector("img");
    const zdroj = String(image?.getAttribute("src") || "").trim();
    if (!image || !zdroj) {
      nepodporovane?.add("obrázek bez zdroje");
      return null;
    }

    let velikost = element.dataset?.velikost || image.dataset?.velikost || "";
    if (!velikost) {
      const sirka = String(element.style?.width || image.style?.width || "").trim();
      const match = sirka.match(/^([0-9]+(?:\.[0-9]+)?)%$/);
      if (match) velikost = match[1];
    }

    let zarovnani = element.dataset?.zarovnani || image.dataset?.zarovnani || "";
    if (!zarovnani) {
      const float = String(element.style?.float || "").toLowerCase();
      if (float === "left") zarovnani = "vlevo";
      else if (float === "right") zarovnani = "vpravo";
      else zarovnani = "stred";
    }

    return vytvorBlokObrazku({
      zdroj,
      alt: image.getAttribute("alt") || "Obrázek v poznámce",
      attachmentId: element.dataset?.attachmentId || "",
      velikost: velikost || "prizpusobit",
      zarovnani
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

      if (tag === "ul" || tag === "ol") {
        flushRootInline();
        importujSeznamDoModelu(uzel, 0, bloky, nepodporovane);
        return;
      }

      if (
        (tag === "figure" && uzel.classList.contains("lubaNoteImage"))
        || tag === "img"
      ) {
        flushRootInline();
        const obrazek = vytvorObrazkovyBlokZHtml(uzel, nepodporovane);
        if (obrazek) bloky.push(obrazek);
        return;
      }

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

  function vlozSegmentyDoExportElementu(cil, blok) {
    const segmenty = Array.isArray(blok?.obsah) ? blok.obsah : [];
    const maText = segmenty.some((cast) => String(cast?.text || "").length > 0);
    if (!maText) {
      cil.appendChild(document.createElement("br"));
      return;
    }

    segmenty.forEach((cast) => {
      const text = String(cast?.text ?? "");
      if (!text) return;
      const format = kopieFormatu(cast?.format);
      const maFormat = Boolean(
        format.tucne || format.kurziva || format.podtrzeni ||
        format.velikost !== null || format.barva || format.pozadi || format.stylTextu || format.odkaz
      );
      if (!maFormat) {
        cil.appendChild(document.createTextNode(text));
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
      cil.appendChild(inline);
    });
  }

  function exportujBehSeznamu(obal, beh) {
    if (!beh.length) return;

    const stack = [];

    const vytvorSeznam = (typ) => document.createElement(typ === "ordered" ? "ol" : "ul");

    beh.forEach((blok) => {
      let uroven = normalizujUrovenBulletu(blok.uroven);
      const typ = jeCislovanyBlok(blok) ? "ordered" : "bullet";

      if (!stack.length) {
        const seznam = vytvorSeznam(typ);
        obal.appendChild(seznam);
        stack.push({ typ, seznam, posledniLi: null });
        uroven = 0;
      }

      uroven = Math.min(uroven, stack.length);

      while (stack.length - 1 > uroven) stack.pop();

      while (stack.length - 1 < uroven) {
        const rodic = stack[stack.length - 1];
        if (!rodic?.posledniLi) {
          uroven = stack.length - 1;
          break;
        }
        const seznam = vytvorSeznam(typ);
        rodic.posledniLi.appendChild(seznam);
        stack.push({ typ, seznam, posledniLi: null });
      }

      let aktualni = stack[uroven];
      if (!aktualni || aktualni.typ !== typ) {
        const seznam = vytvorSeznam(typ);
        if (uroven === 0) {
          obal.appendChild(seznam);
        } else {
          const rodic = stack[uroven - 1];
          if (!rodic?.posledniLi) {
            uroven = 0;
            obal.appendChild(seznam);
          } else {
            rodic.posledniLi.appendChild(seznam);
          }
        }
        stack.length = uroven;
        stack.push({ typ, seznam, posledniLi: null });
        aktualni = stack[uroven];
      }

      const li = document.createElement("li");
      const zarovnani = normalizujZarovnani(blok.zarovnani);
      if (zarovnani !== "left") li.style.textAlign = zarovnani;
      vlozSegmentyDoExportElementu(li, blok);
      aktualni.seznam.appendChild(li);
      aktualni.posledniLi = li;
    });
  }

  function exportujHtmlZModelu(doc = dokument) {
    const obal = document.createElement("div");
    const bloky = Array.isArray(doc?.bloky) ? doc.bloky : [];

    for (let index = 0; index < bloky.length; index += 1) {
      const blok = bloky[index];

      if (jeSeznamovyBlok(blok)) {
        const beh = [];
        while (index < bloky.length && jeSeznamovyBlok(bloky[index])) {
          beh.push(bloky[index]);
          index += 1;
        }
        index -= 1;
        exportujBehSeznamu(obal, beh);
        continue;
      }

      if (jeObrazkovyBlok(blok)) {
        const figure = document.createElement("figure");
        figure.className = "lubaNoteImage";
        figure.dataset.lubanoteImage = "true";
        figure.dataset.velikost = normalizujVelikostObrazku(blok.velikost);
        figure.dataset.zarovnani = normalizujZarovnaniObrazku(blok.zarovnani);
        if (blok.attachmentId) figure.dataset.attachmentId = blok.attachmentId;
        figure.contentEditable = "false";

        const image = document.createElement("img");
        image.setAttribute("src", String(blok.zdroj || ""));
        image.alt = blok.alt || "Obrázek v poznámce";
        image.loading = "lazy";
        image.draggable = false;
        image.tabIndex = -1;
        image.dataset.velikost = figure.dataset.velikost;
        image.dataset.zarovnani = figure.dataset.zarovnani;
        figure.appendChild(image);
        obal.appendChild(figure);
        continue;
      }

      const radek = document.createElement("div");
      const zarovnani = normalizujZarovnani(blok?.zarovnani);
      if (zarovnani !== "left") radek.style.textAlign = zarovnani;
      vlozSegmentyDoExportElementu(radek, blok);
      obal.appendChild(radek);
    }
    return obal.innerHTML;
  }

  function exportujProstyTextZModelu(doc = dokument) {
    return (doc?.bloky || []).map((blok) => textBloku(blok)).join("\n");
  }

  function nastavDokumentProHost(model) {
    dokument = klonDat(model);
    normalizujDokument();
    const prvniTextovy = dokument.bloky.findIndex(jeTextovyBlok);
    posledniPozice = { blok: prvniTextovy >= 0 ? prvniTextovy : 0, offset: 0 };
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
    vybranyObrazekId = "";
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
      odkaz: odkazy.length === 1 ? odkazy[0] : "mix",
      bullet: stavBulletVeVyberu(vyber),
      seznam: stavSeznamuVeVyberu(vyber)
    };
  }

  function vytvorLab() {
    lab = document.createElement("section");
    lab.id = "ln-editor-v2-lab";
    lab.className = "ln-v2-lab";
    lab.innerHTML = `
      <header class="ln-v2-hlavicka">
        <div>
          <strong>Editor Core V2.14b · LAB</strong>
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
        V2.14b: odrážky i číslovaný seznam jsou vlastní bloky modelu. Volba typu je přímo v toolbar popupu a značky seznamu jsou zarovnané na první textový řádek. Vnoření UI, drag seznamu, TODO a IME zatím zůstávají vypnuté.
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

    poslouchej(editor, "touchstart", (event) => {
      if (event.touches?.length !== 1) return;
      const image = event.target.closest?.(".ln-v2-obrazek img");
      if (!image || !editor.contains(image)) return;
      const dotyk = event.touches[0];
      pripravV2DlouhyStisk(
        "touch",
        image,
        dotyk.clientX,
        dotyk.clientY,
        null,
        dotyk.identifier
      );
    }, { passive: false });

    poslouchej(document, "touchmove", zpracujV2TouchMove, { passive: false });
    poslouchej(document, "touchend", zpracujV2TouchEnd, { passive: false });
    poslouchej(document, "touchcancel", () => zrusV2Drag(), { passive: false });

    poslouchej(editor, "pointerdown", (event) => {
      if (event.pointerType === "touch") return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const image = event.target.closest?.(".ln-v2-obrazek img");
      if (!image || !editor.contains(image)) return;
      pripravV2DlouhyStisk(
        "pointer",
        image,
        event.clientX,
        event.clientY,
        event.pointerId,
        null
      );
    });

    poslouchej(document, "pointermove", zpracujV2PointerMove, { passive: false });
    poslouchej(document, "pointerup", zpracujV2PointerEnd, { passive: false });
    poslouchej(document, "pointercancel", (event) => {
      if (v2DragObrazku?.typ === "pointer" && v2DragObrazku.pointerId === event.pointerId) {
        zrusV2Drag();
      }
    });

    poslouchej(editor, "dragstart", (event) => {
      if (event.target.closest?.(".ln-v2-obrazek")) event.preventDefault();
    });

    poslouchej(editor, "contextmenu", (event) => {
      if (!event.target.closest?.(".ln-v2-obrazek")) return;
      event.preventDefault();
      event.stopPropagation();
    });

    poslouchej(editor, "click", (event) => {
      if (performance.now() < potlacKlikV2ObrazkuDo && event.target.closest?.(".ln-v2-obrazek")) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const smazat = event.target.closest?.("[data-v2-image-remove]");
      if (smazat) {
        event.preventDefault();
        event.stopPropagation();
        smazObrazekZModelu(smazat.dataset.v2ImageRemove);
        return;
      }

      const figure = event.target.closest?.(".ln-v2-obrazek[data-ln-v2-obrazek]");
      if (!figure || !editor.contains(figure)) return;
      event.preventDefault();
      vybranyObrazekId = figure.dataset.lnV2Obrazek || "";
      figure.focus({ preventScroll: true });
      nastavStav("Obrázek V2 vybrán · ⚙ nastavení · ✕ odstraní modelový blok");
    });

    poslouchej(editor, "beforeinput", zpracujBeforeInput);
    poslouchej(editor, "paste", zpracujPaste);
    poslouchej(editor, "keydown", (event) => {
      const aktivniFigure = document.activeElement?.closest?.(".ln-v2-obrazek[data-ln-v2-obrazek]");
      if (aktivniFigure && (event.key === "Backspace" || event.key === "Delete")) {
        event.preventDefault();
        smazObrazekZModelu(aktivniFigure.dataset.lnV2Obrazek);
        return;
      }

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
    zapisDebug?.("EDITOR V2 LAB | OPEN V2.14b | produkční editor nedotčen");
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
    zrusV2Drag();
    v2DropIndicator?.remove();
    v2MoveHint?.remove();
    v2DropIndicator = null;
    v2MoveHint = null;
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
    verze: "V2.14b-LISTS-388",
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
    prepniBullet: prepniBulletZToolbaru,
    nastavSeznam: nastavSeznamZToolbaru,
    nastavStylTextu: nastavStylTextuZToolbaru,
    nastavOdkaz: nastavOdkazZToolbaru,
    ziskejInfoOdkazu,
    vlozObrazek: vlozObrazekZToolbaru,
    smazObrazek: smazObrazekZModelu,
    ziskejNastaveniObrazku,
    nastavOrezanyZdrojObrazku,
    nastavNastaveniObrazku,
    undo: vratHistoriiZpet,
    redo: vratHistoriiVpred,
    kontrolaDomu,
    ziskejStavFormatu,
    ziskejModel: () => (dokument ? structuredClone(dokument) : null)
  });
})();
