/* ========================================
   LUBANOTE – EDITOR CORE V2
   FÁZE V2.20b: návrat odladěného row-wide long-press MOVE + arbitráž selection.

   🔒 FROZEN PRINCIPY CORE V2:
   - Zdrojem pravdy je vždy `dokument`; DOM je pouze jeho projekce a vstupní vrstva.
   - Ukládání/synchronizaci vlastní produkční LubaNote pipeline přes Bridge.
   - 5× tap na Připomínky je nouzový přepínač V2 / Legacy, ne druhý datový režim.
   - Logická velikost písma se NIKDY neurčuje z fyzického getComputedStyle().fontSize.
     Android/WebView může text systémově škálovat; model si stále drží např. 13/20 px.
   - Pro podporované beforeinput operace se standardně volá preventDefault().
     Jediná řízená výjimka je FIX 434 pro starý Android WebView během živé
     composition; DOM Guard ji povolí jen do compositionend a změnu pak
     atomicky převede zpět do modelu.
   - Modelové vlastnosti (formát, odkazy, plánované backlinky, seznamy, TODO, obrázky)
     se nesmí nahrazovat přímými DOM mutacemi mimo Core V2.
======================================== */

(() => {
  "use strict";

  const VERZE_MODELU = 8;
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
    "insertCompositionText",
    "insertFromComposition",
    "deleteCompositionText",
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
    odkaz: null,
    interniOdkazId: null,
    interniOdkazNazev: null,
    planOdkazId: null,
    kod: false
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
  let ulozenyPlanovaciVyber = null;

  /*
   * 🔒 ANDROID IME KOMPATIBILITA – FIX 432–434
   *
   * Novější WebView zvládáme čistě modelově. Starší Android WebView (ověřeno
   * na Chrome/WebView 103) ale po KAŽDÉM modelovém překreslení znovu restartuje
   * composition. To vede k řetězci compositionstart -> input -> render ->
   * compositionstart a výsledkem je nestabilní Gboard, ztracený click toolbaru
   * i problémy se selection.
   *
   * FIX 434 proto pro starší Android WebView používá omezenou "nativní IME
   * transakci": během composition dovolíme WebView dočasně upravit DOM jen
   * uvnitř aktuálního textového bloku, DOM Guard tuto chvíli nevrací změny a
   * po compositionend převedeme JEDINÝ minimální rozdíl zpět do modelu. Potom
   * DOM znovu vykreslíme z modelu. Zdroj pravdy tedy zůstává model, pouze během
   * živé composition existuje krátké řízené okno DOM vstupu.
   */
  let v2ImeKompozice = null;

  const v2ImeNativniStaryAndroid = (() => {
    const ua = String(navigator.userAgent || "");
    if (!/Android/i.test(ua) || !/;\s*wv\)/i.test(ua)) return false;
    const shoda = ua.match(/Chrome\/(\d+)/i);
    const major = Number(shoda?.[1] || 0);
    return major > 0 && major <= 110;
  })();

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

  /*
   * V2 – 2× tap na obrázek používá STEJNÝ fullscreen náhled jako
   * produkční Legacy editor. Nevytvářet druhý image viewer: zoom, zavření
   * a safe-area chování mají zůstat na jednom místě v editorMedia.js.
   */
  const DVOJTAP_V2_OBRAZKU_MS = 430;
  const DVOJTAP_V2_OBRAZKU_VZDALENOST = 42;
  let posledniTapV2Obrazku = null;

  /* ==========================================
     V2.15 – KOMPLETNÍ MOVE SYSTÉM SEZNAMŮ

     Stejně jako u Image Drag se během gesta NEMĚNÍ DOM dokumentu.
     Long-press pouze vybere položku, drop atomicky změní `dokument.bloky`.
     Přesouvá se vždy celý podstrom (rodič + jeho vnořené děti).
  ========================================== */
  const DELKA_LONG_PRESS_SEZNAMU = 420;
  const MAX_POHYB_LONG_PRESS_SEZNAMU = 20;
  const START_DRAG_SEZNAMU = 7;
  const PRAH_VNOR_SEZNAMU = 38;
  let v2DragSeznamu = null;
  let v2DragSeznamCasovac = null;
  let v2ListDropIndicator = null;
  let v2ListDragPreview = null;
  let v2ListAutoScrollRaf = null;
  let vybranaPolozkaSeznamuId = "";
  let potlacKlikSeznamuDo = 0;

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

  function normalizujIdOdkazu(hodnota) {
    const id = String(hodnota || "").trim();
    return id || null;
  }

  function ziskejNazevPoznamkyProInterniOdkaz(noteId, fallback = "") {
    const id = normalizujIdOdkazu(noteId);
    if (!id) return String(fallback || "").trim();
    try {
      if (typeof loadTask === "function") {
        const cil = loadTask().find((poznamka) =>
          poznamka?.id && String(poznamka.id) === id && poznamka.isSecret !== true
        );
        if (cil) return String(cil.title || "").trim() || "Bez názvu";
      }
    } catch (_error) {}
    return String(fallback || "").trim() || "⚠ Smazaná poznámka";
  }

  function jePlanovanaPolozkaDokoncena(plannedItemId) {
    const id = normalizujIdOdkazu(plannedItemId);
    if (!id) return false;
    try {
      if (typeof loadPlannedItems === "function") {
        return loadPlannedItems().some((item) => String(item?.id || "") === id && item?.completed === true);
      }
    } catch (_error) {}
    return false;
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
      odkaz: normalizujInternetovouAdresu(format?.odkaz),
      interniOdkazId: normalizujIdOdkazu(format?.interniOdkazId),
      interniOdkazNazev: String(format?.interniOdkazNazev || "").trim() || null,
      planOdkazId: normalizujIdOdkazu(format?.planOdkazId),
      kod: format?.kod === true
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
      && normalizujInternetovouAdresu(a?.odkaz) === normalizujInternetovouAdresu(b?.odkaz)
      && normalizujIdOdkazu(a?.interniOdkazId) === normalizujIdOdkazu(b?.interniOdkazId)
      && String(a?.interniOdkazNazev || "") === String(b?.interniOdkazNazev || "")
      && normalizujIdOdkazu(a?.planOdkazId) === normalizujIdOdkazu(b?.planOdkazId)
      && Boolean(a?.kod) === Boolean(b?.kod);
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
      sbaleno: false,
      zarovnani,
      obsah: normalizujObsah(obsah),
      obrazky: []
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

  function vytvorTodoZObsahu(obsah, hotovo = false, zarovnani = "left") {
    return {
      id: noveIdBloku(),
      typ: "todo",
      hotovo: hotovo === true,
      zarovnani,
      obsah: normalizujObsah(obsah),
      obrazky: [],
      zvyrazneni: ""
    };
  }

  function jeTodoBlok(blok) {
    return blok?.typ === "todo";
  }

  function jeTextovyBlok(blok) {
    return blok?.typ === "odstavec" || jeSeznamovyBlok(blok) || jeTodoBlok(blok);
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
      blok && (blok.typ === "odstavec" || blok.typ === "bullet" || blok.typ === "ordered" || blok.typ === "todo" || blok.typ === "obrazek")
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

      const puvodniTyp = blok.typ === "bullet"
        ? "bullet"
        : (blok.typ === "ordered" ? "ordered" : (blok.typ === "todo" ? "todo" : "odstavec"));
      blok.typ = puvodniTyp;
      if (!Array.isArray(blok.obsah)) blok.obsah = [vytvorSegment("")];
      blok.obsah = normalizujObsah(blok.obsah);
      blok.zarovnani = normalizujZarovnani(blok.zarovnani);
      if (puvodniTyp === "bullet" || puvodniTyp === "ordered" || puvodniTyp === "todo") {
        delete blok.legacyBlockquote;
        delete blok.legacyPre;
        delete blok.legacyHr;
        if (puvodniTyp === "bullet" || puvodniTyp === "ordered") {
          blok.uroven = normalizujUrovenBulletu(blok.uroven);
          blok.sbaleno = Boolean(blok.sbaleno);
          delete blok.hotovo;
          delete blok.zvyrazneni;
        } else {
          blok.hotovo = blok.hotovo === true || blok.completed === true;
          blok.zvyrazneni = String(blok.zvyrazneni || blok.highlightColor || "");
          delete blok.completed;
          delete blok.highlightColor;
          delete blok.uroven;
          delete blok.sbaleno;
        }
        blok.obrazky = (Array.isArray(blok.obrazky) ? blok.obrazky : [])
          .filter((obrazek) => obrazek && String(obrazek.zdroj || "").trim())
          .map((obrazek) => ({
            id: obrazek.id || noveIdBloku(),
            typ: "obrazek",
            zdroj: String(obrazek.zdroj || ""),
            alt: String(obrazek.alt || "Obrázek v poznámce"),
            attachmentId: String(obrazek.attachmentId || ""),
            velikost: normalizujVelikostObrazku(obrazek.velikost),
            zarovnani: normalizujZarovnaniObrazku(obrazek.zarovnani)
          }));
      } else {
        delete blok.uroven;
        delete blok.sbaleno;
        delete blok.obrazky;
        delete blok.hotovo;
        delete blok.zvyrazneni;
        blok.legacyBlockquote = blok.legacyBlockquote === true;
        blok.legacyPre = blok.legacyPre === true;
        blok.legacyHr = blok.legacyHr === true;
        if (blok.legacyHr && textBloku(blok).trim()) blok.legacyHr = false;
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
    if (format?.kod) {
      span.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      span.dataset.lnV2Kod = "1";
    } else {
      span.dataset.lnV2Kod = "0";
    }

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

    const interniId = normalizujIdOdkazu(format?.interniOdkazId);
    span.dataset.lnV2NoteId = interniId || "";
    if (interniId) {
      const nazev = ziskejNazevPoznamkyProInterniOdkaz(interniId, format?.interniOdkazNazev);
      span.classList.add("noteInternalLink");
      span.dataset.noteId = interniId;
      span.dataset.noteTitle = nazev;
      span.setAttribute("role", "link");
      span.setAttribute("aria-label", `Interní odkaz na poznámku ${nazev}`);
      span.setAttribute("contenteditable", "false");
    }

    const planId = normalizujIdOdkazu(format?.planOdkazId);
    span.dataset.lnV2PlanId = planId || "";
    if (planId) {
      span.classList.add("plannedTextLink");
      span.dataset.plannedItemId = planId;
      span.setAttribute("aria-label", "Otevřít naplánovaný úkol");
      if (jePlanovanaPolozkaDokoncena(planId)) {
        span.classList.add("plannedTextLinkCompleted");
      }
    }
  }

  function vykresliObrazkovyBlok(blok, jeVSeznamu = false) {
    const figure = document.createElement("figure");
    figure.className = `ln-v2-obrazek lubaNoteImage${jeVSeznamu ? " ln-v2-list-image" : ""}`;
    figure.dataset.lnV2Obrazek = blok.id;
    figure.dataset.lubanoteImage = "true";
    if (jeVSeznamu) figure.dataset.bulletMedia = "true";
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
    const typyCislovani = [];
    let skryvaUroven = null;

    dokument.bloky.forEach((blok, indexBloku) => {
      if (jeObrazkovyBlok(blok)) {
        fragment.appendChild(vykresliObrazkovyBlok(blok));
        cislovani.length = 0;
        typyCislovani.length = 0;
        return;
      }

      const radek = document.createElement("div");
      const seznamovaTrida = jeBulletBlok(blok)
        ? " ln-v2-bullet"
        : (jeCislovanyBlok(blok) ? " ln-v2-ordered" : (jeTodoBlok(blok) ? " ln-v2-todo" : ""));
      radek.className = `ln-v2-odstavec${seznamovaTrida}`;
      if (jeTodoBlok(blok) && blok.hotovo) radek.classList.add("ln-v2-todo-hotovo");
      radek.dataset.lnV2Blok = blok.id;
      radek.dataset.typ = blok.typ;
      /* Unicode/RTL: každý blok si směr určí podle prvního silného znaku.
         Latinka zůstává LTR, arabština/hebrejština se vykreslí RTL. */
      radek.setAttribute("dir", "auto");
      radek.style.unicodeBidi = "plaintext";
      radek.style.textAlign = blok.zarovnani || "left";
      if (blok.legacyBlockquote === true) {
        radek.style.borderLeft = "3px solid currentColor";
        radek.style.paddingLeft = "12px";
        radek.style.opacity = "0.92";
      }
      if (blok.legacyPre === true) {
        radek.style.whiteSpace = "pre-wrap";
        radek.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
        radek.style.padding = "8px 10px";
        radek.style.borderRadius = "8px";
        radek.style.background = "color-mix(in srgb, currentColor 7%, transparent)";
      }
      if (blok.legacyHr === true) {
        radek.style.borderTop = "1px solid currentColor";
        radek.style.minHeight = "12px";
        radek.style.marginTop = "8px";
      }
      if (jeSeznamovyBlok(blok)) {
        const uroven = normalizujUrovenBulletu(blok.uroven);
        radek.dataset.lnV2BulletUroven = String(uroven);
        radek.style.setProperty("--ln-v2-bullet-indent", `${30 + (uroven * 24)}px`);

        if (skryvaUroven !== null) {
          if (uroven > skryvaUroven) radek.hidden = true;
          else skryvaUroven = null;
        }

        const dalsi = dokument.bloky[indexBloku + 1];
        const maDeti = Boolean(
          jeSeznamovyBlok(dalsi) &&
          normalizujUrovenBulletu(dalsi.uroven) > uroven
        );
        radek.dataset.lnV2ListHasChildren = maDeti ? "1" : "0";
        radek.dataset.lnV2ListCollapsed = maDeti && blok.sbaleno ? "1" : "0";
        if (vybranaPolozkaSeznamuId === blok.id) radek.classList.add("ln-v2-list-move-selected");
        if (maDeti && blok.sbaleno) skryvaUroven = uroven;

        cislovani.length = Math.min(cislovani.length, uroven + 1);
        typyCislovani.length = Math.min(typyCislovani.length, uroven + 1);
        if (jeCislovanyBlok(blok)) {
          if (typyCislovani[uroven] !== "ordered") cislovani[uroven] = 0;
          cislovani[uroven] = (Number(cislovani[uroven]) || 0) + 1;
          typyCislovani[uroven] = "ordered";
          radek.dataset.lnV2ListLabel = `${cislovani[uroven]}.`;
        } else {
          typyCislovani[uroven] = "bullet";
          cislovani[uroven] = 0;
        }
      } else {
        cislovani.length = 0;
        typyCislovani.length = 0;
      }

      if (jeTodoBlok(blok)) {
        radek.dataset.lnV2TodoCompleted = blok.hotovo ? "1" : "0";
        const checkbox = document.createElement("button");
        checkbox.type = "button";
        checkbox.className = "ln-v2-todo-check";
        checkbox.dataset.v2TodoCheck = blok.id;
        checkbox.contentEditable = "false";
        checkbox.setAttribute("role", "checkbox");
        checkbox.setAttribute("aria-checked", blok.hotovo ? "true" : "false");
        checkbox.setAttribute("aria-label", blok.hotovo ? "Označit TODO jako nehotové" : "Označit TODO jako hotové");
        radek.appendChild(checkbox);
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

      if ((jeSeznamovyBlok(blok) || jeTodoBlok(blok)) && Array.isArray(blok.obrazky)) {
        blok.obrazky.forEach((obrazek) => {
          radek.appendChild(vykresliObrazkovyBlok(obrazek, true));
        });
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

    // Interní odkaz je atomický prvek. Nově psaný text vedle něj nikdy
    // nesmí samovolně převzít jeho identitu.
    if (format.interniOdkazId) {
      format.interniOdkazId = null;
      format.interniOdkazNazev = null;
    }

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

    /* V2.16 – TODO je samostatná položka stejně jako v produkčním LubaNote.
       Enter vždy rozdělí aktuální TODO na dvě položky; nový checkbox začíná
       jako nehotový. Prázdný TODO proto Enterem nezmizí ani se nemění na text. */
    if (jeTodoBlok(blok)) {
      const rez = rozdelObsah(blok, caret.offset);
      nastavObsahBloku(blok, rez.vlevo);
      const novyObsah = rez.vpravo.length ? rez.vpravo : [vytvorSegment("", format)];
      const novy = vytvorTodoZObsahu(novyObsah, false, blok.zarovnani || "left");
      dokument.bloky.splice(caret.blok + 1, 0, novy);
      return { blok: caret.blok + 1, offset: 0 };
    }

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
    const jeSeznam = jeSeznamovyBlok(blok);
    const novy = jeSeznam
      ? vytvorSeznamovyBlokZObsahu(novyObsah, blok.typ, blok.uroven, blok.zarovnani || "left")
      : vytvorOdstavecZObsahu(novyObsah, blok.zarovnani || "left");

    /* V2.15 – děti v plochém modelu musí zůstat bezprostředně za rodičem.
       Nový sourozenec se proto u položky s podstromem vloží AŽ za celý
       podstrom, ne mezi rodiče a jeho děti. */
    const vlozitNa = jeSeznam
      ? rozsahPodstromuSeznamu(caret.blok).do + 1
      : caret.blok + 1;
    dokument.bloky.splice(vlozitNa, 0, novy);
    return { blok: vlozitNa, offset: 0 };
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

  function rozsahInternihoOdkazuNaHranici(blok, offset, smer) {
    if (!jeTextovyBlok(blok)) return null;
    const cil = Math.max(0, Math.min(textBloku(blok).length, offset));
    let pozice = 0;
    for (const cast of blok.obsah || []) {
      const text = String(cast?.text || "");
      const konec = pozice + text.length;
      const jeInterni = Boolean(normalizujIdOdkazu(cast?.format?.interniOdkazId));
      if (jeInterni) {
        if (smer < 0 && konec === cil) return { od: pozice, do: konec };
        if (smer > 0 && pozice === cil) return { od: pozice, do: konec };
      }
      pozice = konec;
    }
    return null;
  }

  function smazZpet(vyber, celeSlovo = false) {
    if (!vyber.sbaleny) return smazVyber(vyber);

    const caret = vyber.zacatek;
    const blok = dokument.bloky[caret.blok];
    const text = textBloku(blok);

    if (caret.offset > 0) {
      const interniAtom = rozsahInternihoOdkazuNaHranici(blok, caret.offset, -1);
      if (interniAtom) {
        return smazVyber({
          zacatek: { blok: caret.blok, offset: interniAtom.od },
          konec: { blok: caret.blok, offset: interniAtom.do },
          sbaleny: false
        });
      }
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

    /* V2.16 – produkční TODO používá dvoukrokové mazání:
       poslední znak -> prázdný TODO zůstane; další Backspace na prázdném TODO
       odstraní celý checkbox. Neprázdný TODO na offsetu 0 se s předchozím
       řádkem automaticky neslučuje. Obrázkový TODO se Backspacem nemaže. */
    if (jeTodoBlok(blok)) {
      if (textBloku(blok).length === 0 && !(Array.isArray(blok.obrazky) && blok.obrazky.length)) {
        dokument.bloky.splice(caret.blok, 1);
        if (!dokument.bloky.some(jeTextovyBlok)) dokument.bloky.push(vytvorOdstavec(""));
        const cil = najdiTextovyBlokOd(Math.min(caret.blok, dokument.bloky.length - 1), -1);
        const index = cil >= 0 ? cil : najdiTextovyBlokOd(0, 1);
        return { blok: Math.max(0, index), offset: index >= 0 ? textBloku(dokument.bloky[index]).length : 0 };
      }
      return caret;
    }

    /* V2.14a – Backspace na začátku položky seznamu nevytváří browserový DOM.
       Na úrovni 0 seznam zruší a zachová text; vnořená položka se nejprve vysune. */
    if (jeSeznamovyBlok(blok)) {
      const uroven = normalizujUrovenBulletu(blok.uroven);
      if (uroven > 0) {
        /* Vysunujeme vždy celý podstrom, jinak by děti po Backspace
           zůstaly na staré úrovni a změnily rodiče. */
        const rozsah = rozsahPodstromuSeznamu(caret.blok);
        for (let i = rozsah.od; i <= rozsah.do; i += 1) {
          dokument.bloky[i].uroven = Math.max(0, normalizujUrovenBulletu(dokument.bloky[i].uroven) - 1);
        }
      } else {
        prevedPolozkuSeznamuNaOdstavec(caret.blok);
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
      const interniAtom = rozsahInternihoOdkazuNaHranici(blok, caret.offset, 1);
      if (interniAtom) {
        return smazVyber({
          zacatek: { blok: caret.blok, offset: interniAtom.od },
          konec: { blok: caret.blok, offset: interniAtom.do },
          sbaleny: false
        });
      }
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

    /* TODO řádky jsou samostatné editory i v produkčním LubaNote. Delete na
       konci položky proto nesmí spolknout následující checkbox. */
    if (jeTodoBlok(blok)) return caret;

    const dalsi = dokument.bloky[caret.blok + 1];

    /* Delete na konci textu před obrázkem odstraní atomický image blok. */
    if (jeObrazkovyBlok(dalsi)) {
      dokument.bloky.splice(caret.blok + 1, 1);
      vybranyObrazekId = "";
      return caret;
    }

    /*
     * V2.15 – hranice hierarchie seznamu je modelová, ne browserová.
     * Parent nesmí Delete-em spolknout své dítě ani položku z vyšší
     * úrovně. Stejně hlubokého sourozence ale spojit můžeme; případné
     * děti další položky tím přirozeně přejdou pod sloučenou položku.
     */
    if (jeSeznamovyBlok(blok) && jeSeznamovyBlok(dalsi)) {
      const uroven = normalizujUrovenBulletu(blok.uroven);
      const dalsiUroven = normalizujUrovenBulletu(dalsi.uroven);
      if (dalsiUroven !== uroven) return caret;
    } else if (!jeTextovyBlok(dalsi)) {
      return caret;
    }

    nastavObsahBloku(blok, [...blok.obsah, ...dalsi.obsah]);
    if (jeSeznamovyBlok(blok) && jeSeznamovyBlok(dalsi) && Array.isArray(dalsi.obrazky) && dalsi.obrazky.length) {
      if (!Array.isArray(blok.obrazky)) blok.obrazky = [];
      blok.obrazky.push(...dalsi.obrazky.map((obrazek) => klonDat(obrazek)));
    }
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

  function najdiObrazekVModelu(obrazekId) {
    const id = String(obrazekId || "");
    if (!id || !Array.isArray(dokument?.bloky)) return null;

    for (let i = 0; i < dokument.bloky.length; i += 1) {
      const blok = dokument.bloky[i];
      if (jeObrazkovyBlok(blok) && blok.id === id) {
        return { obrazek: blok, topLevel: true, blokIndex: i, vlastnik: null, prilohaIndex: -1 };
      }
      if ((jeSeznamovyBlok(blok) || jeTodoBlok(blok)) && Array.isArray(blok.obrazky)) {
        const prilohaIndex = blok.obrazky.findIndex((obrazek) => obrazek?.id === id);
        if (prilohaIndex >= 0) {
          return {
            obrazek: blok.obrazky[prilohaIndex],
            topLevel: false,
            blokIndex: i,
            vlastnik: blok,
            prilohaIndex
          };
        }
      }
    }
    return null;
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

    /* V2.15 – obrázek uvnitř seznamu patří přímo k položce.
       Není samostatným dokumentovým blokem a při drag & move se tedy
       přesune společně s celou položkou i jejími dětmi. */
    if (jeSeznamovyBlok(blok) || jeTodoBlok(blok)) {
      if (!Array.isArray(blok.obrazky)) blok.obrazky = [];
      blok.obrazky.push(obrazek);
      novaPozice = { blok: cil.blok, offset: delka };
      vybranyObrazekId = obrazek.id;
      const novyVyber = { zacatek: novaPozice, konec: novaPozice, sbaleny: true };
      posledniPozice = { ...novaPozice };
      posledniVyber = klonVyberu(novyVyber);
      ulozenyFormatovaciVyber = klonVyberu(novyVyber);
      aktivniFormatPsani = null;
      aktivniFormatPozice = "";
      aktivniFormatZdroj = "";
      ulozZmenuDoHistorie(snapshotPred, "vložit obrázek do seznamu");
      vykresli(novyVyber);
      nastavStav(jeTodoBlok(blok) ? "Obrázek připojen k TODO" : "Obrázek připojen k položce seznamu");
      zapisDebug?.(`EDITOR V2 | list image insert | owner=${blok.id} | image=${obrazek.id}`);
      return true;
    }

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
    const nalezeny = najdiObrazekVModelu(id);
    if (!nalezeny) return false;

    const snapshotPred = vytvorSnapshotHistorie(posledniVyber || vyberZPosledniPozice());
    let cil = nalezeny.blokIndex;

    if (nalezeny.topLevel) {
      dokument.bloky.splice(nalezeny.blokIndex, 1);
      if (!dokument.bloky.some(jeTextovyBlok)) dokument.bloky.push(vytvorOdstavec(""));
      cil = najdiTextovyBlokOd(Math.min(nalezeny.blokIndex, dokument.bloky.length - 1), 1);
      if (cil < 0) cil = najdiTextovyBlokOd(Math.max(0, nalezeny.blokIndex - 1), -1);
      if (cil < 0) cil = 0;
    } else {
      nalezeny.vlastnik.obrazky.splice(nalezeny.prilohaIndex, 1);
    }

    const pozice = {
      blok: Math.max(0, cil),
      offset: Math.min(textBloku(dokument.bloky[Math.max(0, cil)]).length, posledniVyber?.konec?.offset ?? 0)
    };
    const novyVyber = { zacatek: pozice, konec: pozice, sbaleny: true };

    vybranyObrazekId = "";
    posledniPozice = { ...pozice };
    posledniVyber = klonVyberu(novyVyber);
    ulozenyFormatovaciVyber = klonVyberu(novyVyber);
    ulozZmenuDoHistorie(snapshotPred, nalezeny.topLevel ? "smazat obrázek" : "smazat obrázek ze seznamu");
    vykresli(novyVyber);
    editor?.focus({ preventScroll: true });
    nastavStav(nalezeny.topLevel ? "Obrázek odstraněn z V2 modelu" : "Obrázek odstraněn z položky seznamu");
    zapisDebug?.(`EDITOR V2 | image delete | image=${id} | list=${nalezeny.topLevel ? "N" : "Y"}`);
    return true;
  }

  function ziskejNastaveniObrazku(obrazekId = vybranyObrazekId) {
    const nalezeny = najdiObrazekVModelu(String(obrazekId || ""));
    const blok = nalezeny?.obrazek;
    if (!blok) return null;

    return {
      id: blok.id,
      zdroj: String(blok.zdroj || ""),
      alt: String(blok.alt || "Obrázek v poznámce"),
      attachmentId: String(blok.attachmentId || ""),
      velikost: normalizujVelikostObrazku(blok.velikost),
      zarovnani: normalizujZarovnaniObrazku(blok.zarovnani),
      vSeznamu: !nalezeny.topLevel
    };
  }

  function nastavOrezanyZdrojObrazku(obrazekId, novyZdroj) {
    const id = String(obrazekId || vybranyObrazekId || "");
    const nalezeny = najdiObrazekVModelu(id);
    const blok = nalezeny?.obrazek;
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
    const nalezeny = najdiObrazekVModelu(id);
    const blok = nalezeny?.obrazek;
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

    /* Obrázek uvnitř seznamu je příloha položky a přesouvá se pouze
       společně s celou položkou. Samostatný image drag zde záměrně vypínáme. */
    if (figure.classList.contains("ln-v2-list-image")) return;

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

  function aplikujSpecialniFormatNaRozsah(blok, od, doPozice, upravFormat) {
    if (!jeTextovyBlok(blok) || typeof upravFormat !== "function") return;
    const zacatek = Math.max(0, Math.min(textBloku(blok).length, od));
    const konec = Math.max(zacatek, Math.min(textBloku(blok).length, doPozice));
    if (zacatek === konec) return;

    const vystup = [];
    let pozice = 0;
    blok.obsah.forEach((cast) => {
      const text = String(cast.text ?? "");
      const castKonec = pozice + text.length;
      if (castKonec <= zacatek || pozice >= konec) {
        if (text) vystup.push(vytvorSegment(text, cast.format));
      } else {
        const lokalniOd = Math.max(0, zacatek - pozice);
        const lokalniDo = Math.min(text.length, konec - pozice);
        const pred = text.slice(0, lokalniOd);
        const stred = text.slice(lokalniOd, lokalniDo);
        const po = text.slice(lokalniDo);
        if (pred) vystup.push(vytvorSegment(pred, cast.format));
        if (stred) {
          const novyFormat = kopieFormatu(cast.format);
          upravFormat(novyFormat);
          vystup.push(vytvorSegment(stred, novyFormat));
        }
        if (po) vystup.push(vytvorSegment(po, cast.format));
      }
      pozice = castKonec;
    });
    nastavObsahBloku(blok, vystup);
  }

  function vlozInterniOdkazZAutocomplete(poznamka, spoust) {
    if (!poznamka?.id || !spoust?.textNode || !editor?.contains(spoust.textNode)) return false;
    const zacatek = domBodNaModel(spoust.textNode, spoust.startOffset);
    const konec = domBodNaModel(spoust.textNode, spoust.endOffset);
    if (!zacatek || !konec || zacatek.blok !== konec.blok) return false;

    const nazev = String(poznamka.title || "").trim() || "Bez názvu";
    const vyber = { zacatek, konec, sbaleny: false };
    const snapshotPred = vytvorSnapshotHistorie(vyber);
    const format = kopieFormatu(formatNaPozici(dokument.bloky[zacatek.blok], zacatek.offset));
    format.odkaz = null;
    format.interniOdkazId = String(poznamka.id);
    format.interniOdkazNazev = nazev;
    format.planOdkazId = null;

    const formatMezery = kopieFormatu(format);
    formatMezery.interniOdkazId = null;
    formatMezery.interniOdkazNazev = null;

    const caret = smazVyber(vyber);
    const blok = dokument.bloky[caret.blok];
    const rez = rozdelObsah(blok, caret.offset);
    nastavObsahBloku(blok, [
      ...rez.vlevo,
      vytvorSegment(nazev, format),
      vytvorSegment(" ", formatMezery),
      ...rez.vpravo
    ]);

    const novyCaret = { blok: caret.blok, offset: caret.offset + nazev.length + 1 };
    posledniPozice = { ...novyCaret };
    posledniVyber = { zacatek: { ...novyCaret }, konec: { ...novyCaret }, sbaleny: true };
    ulozenyFormatovaciVyber = klonVyberu(posledniVyber);
    aktivniFormatPsani = kopieFormatu(formatMezery);
    aktivniFormatPozice = klicPozice(novyCaret);
    aktivniFormatZdroj = "zdedeny";
    ulozZmenuDoHistorie(snapshotPred, "interní odkaz");
    vykresli(novyCaret);
    return true;
  }

  function absolutniOffsetPozice(pozice) {
    let soucet = 0;
    const cilBlok = Math.max(0, Math.min(dokument.bloky.length - 1, Number(pozice?.blok) || 0));
    for (let i = 0; i < cilBlok; i += 1) {
      soucet += textBloku(dokument.bloky[i]).length + 1;
    }
    return soucet + Math.max(0, Number(pozice?.offset) || 0);
  }

  /* ==========================================
     V2.20 – VLASTNÍ LUBANOTE SELECTION MENU

     UI panel (Vyjmout / Kopírovat / Vložit / Vše) vlastní Bridge, ale
     veškeré změny obsahu musí jít přes MODEL. Tyto funkce jsou jediná
     povolená cesta pro cut/paste/select-all z V2 selection menu.
  ========================================== */

  function ziskejVyberProSelectionMenu() {
    return klonVyberu(
      ulozenyFormatovaciVyber
      || posledniVyber
      || aktualniVyberModelu()
      || vyberZPosledniPozice()
    );
  }

  function ziskejTextVyberuProSelectionMenu() {
    const vyber = ziskejVyberProSelectionMenu();
    return vyber && !vyber.sbaleny ? textVeVyberu(vyber) : "";
  }

  function ziskejRichVyberProSelectionMenu() {
    const vyber = ziskejVyberProSelectionMenu();
    if (!vyber || vyber.sbaleny || vyber.zacatek.blok !== vyber.konec.blok) return null;

    const blok = dokument.bloky[vyber.zacatek.blok];
    if (!jeTextovyBlok(blok)) return null;

    const prvniRez = rozdelObsah(blok, vyber.zacatek.offset);
    const docasnyBlok = { ...blok, obsah: prvniRez.vpravo };
    const druhaDelka = Math.max(0, vyber.konec.offset - vyber.zacatek.offset);
    const druhyRez = rozdelObsah(docasnyBlok, druhaDelka);
    const obsah = normalizujObsah(druhyRez.vlevo).filter((cast) => String(cast.text || "").length);
    const text = obsah.map((cast) => String(cast.text || "")).join("");
    if (!text) return null;

    return {
      verze: 1,
      text,
      obsah: obsah.map((cast) => vytvorSegment(String(cast.text || ""), cast.format))
    };
  }

  function sklapniVyberNaKonecProSelectionMenu() {
    const vyber = ziskejVyberProSelectionMenu();
    if (!vyber) return false;
    const konec = { ...vyber.konec };
    nastavVyberModelu(konec, konec);
    return true;
  }

  function vyjmiVyberProSelectionMenu() {
    const vyber = ziskejVyberProSelectionMenu();
    if (!vyber || vyber.sbaleny) return { ok: false, text: "" };

    const text = textVeVyberu(vyber);
    if (!text) return { ok: false, text: "" };

    const snapshotPred = vytvorSnapshotHistorie(vyber);
    const caret = smazVyber(vyber);
    ulozZmenuDoHistorie(snapshotPred, "vyjmout text");
    aktivniFormatPozice = klicPozice(caret);
    const novyVyber = { zacatek: caret, konec: caret, sbaleny: true };
    vykresli(novyVyber);
    oznamModelovyTextovyVstup("deleteByCut");
    return { ok: true, text };
  }

  function vlozRichVyberProSelectionMenu(fragment) {
    if (!fragment || fragment.verze !== 1 || !Array.isArray(fragment.obsah) || !fragment.obsah.length) return false;
    const vyber = ziskejVyberProSelectionMenu();
    if (!vyber) return false;

    const snapshotPred = vytvorSnapshotHistorie(vyber);
    const caret = smazVyber(vyber);
    const blok = dokument.bloky[caret.blok];
    if (!jeTextovyBlok(blok)) return false;

    const rez = rozdelObsah(blok, caret.offset);
    const vlozene = fragment.obsah.map((cast) => vytvorSegment(String(cast.text || ""), cast.format));
    nastavObsahBloku(blok, [...rez.vlevo, ...vlozene, ...rez.vpravo]);
    const delka = vlozene.reduce((soucet, cast) => soucet + String(cast.text || "").length, 0);
    const novaPozice = { blok: caret.blok, offset: caret.offset + delka };
    ulozZmenuDoHistorie(snapshotPred, "vložit formátovaný text");
    aktivniFormatPozice = klicPozice(novaPozice);
    const novyVyber = { zacatek: novaPozice, konec: novaPozice, sbaleny: true };
    vykresli(novyVyber);
    oznamModelovyTextovyVstup("insertFromPaste");
    return true;
  }

  function vlozTextProSelectionMenu(text) {
    if (typeof text !== "string" || !text.length) return false;
    const vyber = ziskejVyberProSelectionMenu();
    if (!vyber) return false;

    const snapshotPred = vytvorSnapshotHistorie(vyber);
    const caret = vlozViceRadku(text, vyber);
    ulozZmenuDoHistorie(snapshotPred, "vložit text");
    aktivniFormatPozice = klicPozice(caret);
    const novyVyber = { zacatek: caret, konec: caret, sbaleny: true };
    vykresli(novyVyber);
    oznamModelovyTextovyVstup("insertFromPaste");
    return true;
  }

  function vyberVseProSelectionMenu() {
    /* FIX 434: na starém Androidu musí při programovém Vše zůstat fokus v
       contenteditable. Jinak Range existuje, ale systém jej vizuálně nezvýrazní. */
    try { editor?.focus({ preventScroll: true }); } catch (_error) {}

    const prvni = dokument.bloky.findIndex(jeTextovyBlok);
    let posledni = -1;
    for (let i = dokument.bloky.length - 1; i >= 0; i -= 1) {
      if (jeTextovyBlok(dokument.bloky[i])) {
        posledni = i;
        break;
      }
    }
    if (prvni < 0 || posledni < 0) return false;

    const zacatek = { blok: prvni, offset: 0 };
    const konec = { blok: posledni, offset: textBloku(dokument.bloky[posledni]).length };
    nastavVyberModelu(zacatek, konec);
    return true;
  }

  function zrusVyberNaBoduProSelectionMenu(clientX, clientY) {
    if (!editor || !Number.isFinite(Number(clientX)) || !Number.isFinite(Number(clientY))) return false;

    let node = null;
    let offset = 0;
    if (typeof document.caretPositionFromPoint === "function") {
      const caret = document.caretPositionFromPoint(Number(clientX), Number(clientY));
      node = caret?.offsetNode || null;
      offset = caret?.offset ?? 0;
    } else if (typeof document.caretRangeFromPoint === "function") {
      const range = document.caretRangeFromPoint(Number(clientX), Number(clientY));
      node = range?.startContainer || null;
      offset = range?.startOffset ?? 0;
    }

    if (!node || !editor.contains(node)) return false;
    const pozice = domBodNaModel(node, offset);
    if (!pozice) return false;

    nastavVyberModelu(pozice, pozice);
    aktivniFormatPsani = null;
    aktivniFormatPozice = klicPozice(pozice);
    aktivniFormatZdroj = "";
    aktualizujToolbarVelikosti(posledniVyber);
    return true;
  }

  function ziskejPlanovaciKontext() {
    const vyber = ziskejFormatovaciVyber();
    if (!vyber) return { ok: false, duvod: "Nebyl nalezen výběr textu." };

    /*
     * V2.20 – TODO MÁ PŘEDNOST PŘED OBECNÝM TEXTOVÝM VÝBĚREM.
     *
     * Pokud je caret NEBO označený text uvnitř jedné TODO položky, plánuje se
     * vždy celá TODO položka přes její stabilní todoId. Dříve se označené slovo
     * uvnitř TODO chybně klasifikovalo jako `selection`. Poznámka s TODO ale
     * ukládá text v `note.todos` a její `richContent` je prázdný, takže následná
     * synchronizace správně odstranila takovou „selection“ Planner položku jako
     * backlink, který v richContent neexistuje. Výsledkem byl podtržený text v
     * editoru, ale žádný úkol v Planneru.
     *
     * TOTO PRAVIDLO NEMĚNIT bez regresního testu TODO → Planner.
     */
    if (vyber.zacatek.blok === vyber.konec.blok) {
      const todoBlok = dokument.bloky[vyber.zacatek.blok];
      if (jeTodoBlok(todoBlok)) {
        const text = textBloku(todoBlok).trim();
        if (!text) return { ok: false, duvod: "Prázdné TODO nelze naplánovat." };
        ulozenyPlanovaciVyber = null;
        return { ok: true, typ: "todo", text, todoId: todoBlok.id };
      }
    }

    if (!vyber.sbaleny) {
      const text = textVeVyberu(vyber).trim();
      if (!text) return { ok: false, duvod: "Označ text, který chceš naplánovat." };
      if (vyber.zacatek.blok !== vyber.konec.blok) {
        const bloky = dokument.bloky.slice(vyber.zacatek.blok, vyber.konec.blok + 1);
        if (bloky.some((blok) => jeSeznamovyBlok(blok) || jeTodoBlok(blok))) {
          return { ok: false, duvod: "Pro plánování označ text jedné položky seznamu." };
        }
      }
      ulozenyPlanovaciVyber = klonVyberu(vyber);
      return {
        ok: true,
        typ: "selection",
        text,
        start: absolutniOffsetPozice(vyber.zacatek),
        end: absolutniOffsetPozice(vyber.konec)
      };
    }

    return { ok: false, duvod: "Nejdřív označ text, který chceš naplánovat." };
  }

  function obalPlanovaciVyber(plannedItemId) {
    const id = normalizujIdOdkazu(plannedItemId);
    const vyber = klonVyberu(ulozenyPlanovaciVyber);
    if (!id || !vyber || vyber.sbaleny) return false;

    const snapshotPred = vytvorSnapshotHistorie(vyber);
    for (let index = vyber.zacatek.blok; index <= vyber.konec.blok; index += 1) {
      const blok = dokument.bloky[index];
      if (!jeTextovyBlok(blok)) return false;
      const od = index === vyber.zacatek.blok ? vyber.zacatek.offset : 0;
      const doPozice = index === vyber.konec.blok ? vyber.konec.offset : textBloku(blok).length;
      aplikujSpecialniFormatNaRozsah(blok, od, doPozice, (format) => {
        format.planOdkazId = id;
      });
    }
    ulozZmenuDoHistorie(snapshotPred, "plánovaný odkaz");
    vykresli(vyber);
    ulozenyPlanovaciVyber = null;
    return true;
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
          novyFormat.interniOdkazId = null;
          novyFormat.interniOdkazNazev = null;
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

  function stavTodoVeVyberu(vyber) {
    if (!vyber || !dokument?.bloky?.length) return "off";
    const od = Math.max(0, Math.min(dokument.bloky.length - 1, vyber.zacatek.blok));
    const doBloku = Math.max(od, Math.min(dokument.bloky.length - 1, vyber.konec.blok));
    const hodnoty = new Set();
    for (let index = od; index <= doBloku; index += 1) {
      const blok = dokument.bloky[index];
      if (!jeTextovyBlok(blok)) continue;
      hodnoty.add(jeTodoBlok(blok) ? "on" : "off");
    }
    if (!hodnoty.size) return "off";
    return hodnoty.size > 1 ? "mix" : Array.from(hodnoty)[0];
  }

  function prepniTodoHotovo(todoId) {
    const id = String(todoId || "");
    const index = dokument?.bloky?.findIndex((blok) => jeTodoBlok(blok) && blok.id === id) ?? -1;
    if (index < 0) return false;
    const snapshotPred = vytvorSnapshotHistorie(posledniVyber || vyberZPosledniPozice());
    const blok = dokument.bloky[index];
    blok.hotovo = !Boolean(blok.hotovo);
    const zmeneno = ulozZmenuDoHistorie(snapshotPred, blok.hotovo ? "TODO hotovo" : "TODO znovu aktivní");
    vykresli(posledniVyber || vyberZPosledniPozice());
    nastavStav(blok.hotovo ? "TODO označeno jako hotové" : "TODO označeno jako nehotové");
    return zmeneno;
  }

  function prevedBlokNaTodo(blok) {
    if (!blok || jeObrazkovyBlok(blok)) return null;
    const obrazky = Array.isArray(blok.obrazky) ? blok.obrazky.map((obrazek) => klonDat(obrazek)) : [];
    blok.typ = "todo";
    blok.hotovo = false;
    blok.zvyrazneni = "";
    blok.obrazky = obrazky;
    delete blok.uroven;
    delete blok.sbaleno;
    return blok;
  }

  /* ============================================================
     🔒 V2.21 – TODO JE TYP BLOKU, NE REŽIM CELÉ POZNÁMKY

     Původní V2.16 ještě kopírovala starý binární režim: první klik na TODO
     převedl celý dokument a další klik přidával checkbox na konec. To je v
     rozporu s cílem Editor Core V2 – jedna poznámka smí libovolně kombinovat
     běžný text, Bullet/číslovaný seznam, TODO i obrázky.

     Pravidlo toolbaru je proto stejné jako u seznamu:
       - caret = mění se pouze aktuální textový blok,
       - výběr přes více bloků = mění se pouze vybrané textové bloky,
       - jsou-li všechny vybrané bloky TODO, klik aktivní TODO vypne,
       - jinak se vybrané bloky převedou na TODO.

     TOTO PRAVIDLO NEMĚNIT zpět na "TODO režim celé poznámky".
  ============================================================ */

  function prevedTodoNaOdstavec(index) {
    const blok = dokument?.bloky?.[index];
    if (!jeTodoBlok(blok)) return 0;

    const obrazky = Array.isArray(blok.obrazky) ? blok.obrazky.splice(0) : [];
    blok.typ = "odstavec";
    delete blok.hotovo;
    delete blok.zvyrazneni;
    delete blok.obrazky;

    if (obrazky.length) dokument.bloky.splice(index + 1, 0, ...obrazky);
    return obrazky.length;
  }

  function prevedPolozkuSeznamuNaTodo(index) {
    const blok = dokument?.bloky?.[index];
    if (!jeSeznamovyBlok(blok)) return false;

    const uroven = normalizujUrovenBulletu(blok.uroven);
    const rozsah = rozsahPodstromuSeznamu(index);

    /* Odpojením rodiče nesmí jeho děti zůstat viset na neexistující úrovni.
       Stejná normalizace se používá při převodu seznamu na běžný text, jen
       obrázky zůstávají u položky a stávají se přílohami TODO. */
    for (let i = index + 1; i <= rozsah.do; i += 1) {
      const dite = dokument.bloky[i];
      if (!jeSeznamovyBlok(dite)) continue;
      dite.uroven = Math.max(0, normalizujUrovenBulletu(dite.uroven) - (uroven + 1));
    }

    let i = rozsah.do + 1;
    while (i < dokument.bloky.length && jeSeznamovyBlok(dokument.bloky[i])) {
      const puvodni = normalizujUrovenBulletu(dokument.bloky[i].uroven);
      if (uroven > 0 && puvodni < uroven) break;
      if (uroven > 0) dokument.bloky[i].uroven = Math.max(0, puvodni - uroven);
      i += 1;
      if (uroven === 0 && puvodni === 0) break;
    }

    prevedBlokNaTodo(blok);
    return true;
  }

  function pridejTodoZToolbaru() {
    if (!dokument?.bloky?.length) return false;

    const vyber = ziskejFormatovaciVyber() || vyberZPosledniPozice();
    const od = Math.max(0, Math.min(dokument.bloky.length - 1, vyber?.zacatek?.blok ?? 0));
    const doBloku = Math.max(od, Math.min(dokument.bloky.length - 1, vyber?.konec?.blok ?? od));
    const textoveIndexy = [];
    for (let index = od; index <= doBloku; index += 1) {
      if (jeTextovyBlok(dokument.bloky[index])) textoveIndexy.push(index);
    }
    if (!textoveIndexy.length) return false;

    const vseTodo = textoveIndexy.every((index) => jeTodoBlok(dokument.bloky[index]));
    const cilTodo = !vseTodo;
    const snapshotPred = vytvorSnapshotHistorie(vyber);
    const startId = dokument.bloky[vyber.zacatek.blok]?.id || "";
    const endId = dokument.bloky[vyber.konec.blok]?.id || startId;
    let zmenenoTypem = false;

    if (cilTodo) {
      textoveIndexy.forEach((index) => {
        const blok = dokument.bloky[index];
        if (!blok || jeTodoBlok(blok)) return;
        if (jeSeznamovyBlok(blok)) prevedPolozkuSeznamuNaTodo(index);
        else prevedBlokNaTodo(blok);
        zmenenoTypem = true;
      });
    } else {
      /* Obrázky se při vypnutí TODO mění na top-level Image Blocky. Jdeme
         odzadu, aby vložené obrázky neposunuly indexy dalších TODO položek. */
      [...textoveIndexy].reverse().forEach((index) => {
        if (!jeTodoBlok(dokument.bloky[index])) return;
        prevedTodoNaOdstavec(index);
        zmenenoTypem = true;
      });
    }

    if (!zmenenoTypem) return false;

    normalizujDokument();
    let startIndex = najdiIndexBlokuPodleId(startId);
    let endIndex = najdiIndexBlokuPodleId(endId);
    if (startIndex < 0) startIndex = Math.max(0, Math.min(od, dokument.bloky.length - 1));
    if (endIndex < 0) endIndex = startIndex;
    if (endIndex < startIndex) [startIndex, endIndex] = [endIndex, startIndex];

    const vyberPo = {
      zacatek: {
        blok: startIndex,
        offset: Math.min(vyber.zacatek.offset, textBloku(dokument.bloky[startIndex]).length)
      },
      konec: {
        blok: endIndex,
        offset: Math.min(vyber.konec.offset, textBloku(dokument.bloky[endIndex]).length)
      },
      sbaleny: vyber.sbaleny && startIndex === endIndex && vyber.zacatek.offset === vyber.konec.offset
    };

    posledniVyber = klonVyberu(vyberPo);
    posledniPozice = { ...vyberPo.konec };
    ulozenyFormatovaciVyber = klonVyberu(vyberPo);
    aktivniFormatPsani = null;
    aktivniFormatPozice = klicPozice(vyberPo.konec);
    aktivniFormatZdroj = "";

    const zmeneno = ulozZmenuDoHistorie(snapshotPred, cilTodo ? "převést výběr na TODO" : "vypnout TODO");
    vykresli(vyberPo);
    nastavStav(cilTodo ? "Vybraný blok převeden na TODO" : "TODO vypnuto – pokračuj běžným textem");
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

  function prevedPolozkuSeznamuNaOdstavec(index) {
    const blok = dokument?.bloky?.[index];
    if (!jeSeznamovyBlok(blok)) return 0;

    const uroven = normalizujUrovenBulletu(blok.uroven);
    const rozsah = rozsahPodstromuSeznamu(index);
    const obrazky = Array.isArray(blok.obrazky) ? blok.obrazky.splice(0) : [];

    /* Položka se stane běžným odstavcem. Její děti už pod ní nemohou
       zůstat jako vnořený seznam, proto z nich uděláme nový kořenový
       seznam a zachováme jejich vzájemnou hloubku. */
    for (let i = index + 1; i <= rozsah.do; i += 1) {
      const dite = dokument.bloky[i];
      if (!jeSeznamovyBlok(dite)) continue;
      dite.uroven = Math.max(0, normalizujUrovenBulletu(dite.uroven) - (uroven + 1));
    }

    /* Pokud jsme rozpojili vnořenou větev, i následující sourozenci stejného
       původního rodiče musí začít jako nový kořenový běh seznamu. */
    let i = rozsah.do + 1;
    while (i < dokument.bloky.length && jeSeznamovyBlok(dokument.bloky[i])) {
      const puvodni = normalizujUrovenBulletu(dokument.bloky[i].uroven);
      if (uroven > 0 && puvodni < uroven) break;
      if (uroven > 0) dokument.bloky[i].uroven = Math.max(0, puvodni - uroven);
      i += 1;
      if (uroven === 0 && puvodni === 0) break;
    }

    blok.typ = "odstavec";
    delete blok.uroven;
    delete blok.sbaleno;
    delete blok.obrazky;

    /* Obrázkové přílohy se nikdy nezahazují. Po zrušení seznamu se z nich
       stanou stejné top-level Image Blocky, jaké používá zbytek V2. */
    if (obrazky.length) dokument.bloky.splice(index + 1, 0, ...obrazky);
    return obrazky.length;
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
    const startId = dokument.bloky[vyber.zacatek.blok]?.id || "";
    const endId = dokument.bloky[vyber.konec.blok]?.id || startId;

    let zmenenoTypem = false;
    if (cilovyTyp === "off") {
      /* Jdeme odzadu, protože odpojené obrázky se vkládají jako samostatné
         bloky a nesmí nám posunout indexy položek, které teprve měníme. */
      [...textoveIndexy].reverse().forEach((index) => {
        const blok = dokument.bloky[index];
        if (!jeSeznamovyBlok(blok)) return;
        prevedPolozkuSeznamuNaOdstavec(index);
        zmenenoTypem = true;
      });
    } else {
      textoveIndexy.forEach((index) => {
        const blok = dokument.bloky[index];
        if (!blok || blok.typ === cilovyTyp) return;
        zmenenoTypem = true;
        const bylTodo = jeTodoBlok(blok);
        blok.typ = cilovyTyp;
        blok.uroven = jeSeznamovyBlok(blok) ? normalizujUrovenBulletu(blok.uroven) : 0;
        blok.sbaleno = Boolean(blok.sbaleno);
        if (!Array.isArray(blok.obrazky)) blok.obrazky = [];
        if (bylTodo) {
          delete blok.hotovo;
          delete blok.zvyrazneni;
        }
      });
    }

    if (!zmenenoTypem) {
      vykresli(vyber);
      return false;
    }

    normalizujDokument();
    const startIndex = Math.max(0, najdiIndexBlokuPodleId(startId));
    const endIndex = Math.max(startIndex, najdiIndexBlokuPodleId(endId));
    const vyberPo = {
      zacatek: { blok: startIndex, offset: Math.min(vyber.zacatek.offset, textBloku(dokument.bloky[startIndex]).length) },
      konec: { blok: endIndex, offset: Math.min(vyber.konec.offset, textBloku(dokument.bloky[endIndex]).length) },
      sbaleny: vyber.sbaleny && startIndex === endIndex && vyber.zacatek.offset === vyber.konec.offset
    };
    const popis = cilovyTyp === "bullet"
      ? "odrážkový seznam"
      : (cilovyTyp === "ordered" ? "číslovaný seznam" : "zrušit seznam");
    const zmeneno = ulozZmenuDoHistorie(snapshotPred, popis);

    if (vyberPo.sbaleny && formatPred) {
      aktivniFormatPsani = formatPred;
      aktivniFormatPozice = klicPozice(vyberPo.zacatek);
      aktivniFormatZdroj = zdrojFormatuPred || "zdedeny";
    } else {
      aktivniFormatPsani = null;
      aktivniFormatPozice = "";
      aktivniFormatZdroj = "";
    }

    posledniVyber = klonVyberu(vyberPo);
    posledniPozice = { ...vyberPo.konec };
    ulozenyFormatovaciVyber = klonVyberu(vyberPo);
    vykresli(vyberPo);
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

  function rozsahPodstromuSeznamu(index) {
    const blok = dokument?.bloky?.[index];
    if (!jeSeznamovyBlok(blok)) return { od: index, do: index };
    const uroven = normalizujUrovenBulletu(blok.uroven);
    let konec = index;
    for (let i = index + 1; i < dokument.bloky.length; i += 1) {
      const dalsi = dokument.bloky[i];
      if (!jeSeznamovyBlok(dalsi)) break;
      if (normalizujUrovenBulletu(dalsi.uroven) <= uroven) break;
      konec = i;
    }
    return { od: index, do: konec };
  }

  function maPolozkaSeznamuDeti(index) {
    const blok = dokument?.bloky?.[index];
    const dalsi = dokument?.bloky?.[index + 1];
    return Boolean(
      jeSeznamovyBlok(blok) &&
      jeSeznamovyBlok(dalsi) &&
      normalizujUrovenBulletu(dalsi.uroven) > normalizujUrovenBulletu(blok.uroven)
    );
  }

  function prepniSbaleniSeznamuPodleId(id) {
    const index = najdiIndexBlokuPodleId(String(id || ""));
    if (index < 0 || !maPolozkaSeznamuDeti(index)) return false;
    const blok = dokument.bloky[index];
    blok.sbaleno = !Boolean(blok.sbaleno);
    vybranaPolozkaSeznamuId = "";
    vykresli(posledniVyber || vyberZPosledniPozice());
    nastavStav(blok.sbaleno ? "Větev seznamu sbalena" : "Větev seznamu rozbalena");
    return true;
  }

  function predchoziSourozenecSeznamu(index) {
    const blok = dokument?.bloky?.[index];
    if (!jeSeznamovyBlok(blok)) return -1;
    const uroven = normalizujUrovenBulletu(blok.uroven);
    for (let i = index - 1; i >= 0; i -= 1) {
      const pred = dokument.bloky[i];
      if (!jeSeznamovyBlok(pred)) break;
      const u = normalizujUrovenBulletu(pred.uroven);
      if (u < uroven) break;
      if (u === uroven) return i;
    }
    return -1;
  }

  function zmenUrovenPodstromu(index, smer, popis = "změna úrovně seznamu") {
    const blok = dokument?.bloky?.[index];
    if (!jeSeznamovyBlok(blok)) return false;
    const puvodni = normalizujUrovenBulletu(blok.uroven);
    let nova = puvodni;

    if (smer > 0) {
      if (puvodni >= 6 || predchoziSourozenecSeznamu(index) < 0) return false;
      nova = puvodni + 1;
    } else {
      if (puvodni <= 0) return false;
      nova = puvodni - 1;
    }

    const snapshotPred = vytvorSnapshotHistorie(posledniVyber || vyberZPosledniPozice());
    const rozsah = rozsahPodstromuSeznamu(index);
    const rozdil = nova - puvodni;
    for (let i = rozsah.od; i <= rozsah.do; i += 1) {
      dokument.bloky[i].uroven = normalizujUrovenBulletu(
        normalizujUrovenBulletu(dokument.bloky[i].uroven) + rozdil
      );
    }
    normalizujDokument();
    ulozZmenuDoHistorie(snapshotPred, popis);
    vykresli(posledniVyber || vyberZPosledniPozice());
    nastavStav(smer > 0 ? "Položka zanořena" : "Položka vysunuta");
    return true;
  }

  function jeV2KlikNaZnacceSeznamu(radek, clientX, rozsirit = true) {
    if (!radek || !Number.isFinite(clientX)) return false;
    const rect = radek.getBoundingClientRect();
    const uroven = normalizujUrovenBulletu(radek.dataset.lnV2BulletUroven);
    const odsazeni = 30 + (uroven * 24);
    const stred = rect.left + odsazeni - 15;
    const pul = rozsirit ? 22 : 14;
    return clientX >= stred - pul && clientX <= stred + pul;
  }

  function jePrvekMimoV2SeznamMove(target) {
    return Boolean(target?.closest?.(
      ".ln-v2-obrazek, .lubaNoteImageSettings, .lubaNoteImageRemove, .ln-v2-odkaz, a[href], button"
    ));
  }

  /*
   * 🔒 FROZEN UX – MOBILE MOVE vs. TEXT SELECTION
   *
   * ODLADĚNÉ CHOVÁNÍ LUBANOTE:
   * - krátký tap / 2× tap na text = normální caret a výběr textu,
   * - skutečný long-press KDEKOLIV NA ŘÁDKU Bullet/TODO = MOVE,
   * - obrázky, odkazy a ovládací tlačítka mají vlastní interakce a MOVE nespouští.
   *
   * Na telefonu NESMÍ být MOVE omezen jen na malou značku • / 1. / checkbox.
   * Prst by značku zakryl a ovládání by bylo zbytečně nepřesné. Rozlišení dělá
   * časovač long-pressu + práh pohybu, ne místo dotyku. Tohle pravidlo neměnit
   * bez cíleného mobilního regresního testu selection + drag + zanoření.
   */
  function jeV2MoveZonaSeznamu(target, radek) {
    if (!radek || !editor?.contains(radek)) return false;
    return !jePrvekMimoV2SeznamMove(target);
  }

  /*
   * 🔒 V2.20b – BRIDGE smí potlačit selection až po SKUTEČNÉM long-pressu.
   * Samotná existence čekajícího kandidáta po touchstartu není MOVE; jinak by
   * capture selection vrstva znovu zablokovala 1×/2× tap na text řádku.
   */
  function jeV2InterakcePresunuSeznamu() {
    return Boolean(v2DragSeznamu?.pripraven || v2DragSeznamu?.aktivni);
  }

  function jeV2CilPresunuSeznamu(target) {
    const radek = target?.closest?.(
      ".ln-v2-odstavec.ln-v2-bullet, .ln-v2-odstavec.ln-v2-ordered, .ln-v2-odstavec.ln-v2-todo"
    );
    return Boolean(radek && editor?.contains(radek) && jeV2MoveZonaSeznamu(target, radek));
  }

  function zrusVyberMoveSeznamuPokudMimo(target) {
    if (!vybranaPolozkaSeznamuId || !editor) return;
    const radek = target?.closest?.(".ln-v2-odstavec.ln-v2-bullet, .ln-v2-odstavec.ln-v2-ordered, .ln-v2-odstavec.ln-v2-todo");
    if (radek?.dataset?.lnV2Blok === vybranaPolozkaSeznamuId) return;
    Array.from(editor.querySelectorAll(".ln-v2-list-move-selected")).forEach((el) => {
      el.classList.remove("ln-v2-list-move-selected");
    });
    vybranaPolozkaSeznamuId = "";
  }

  function zrusV2SeznamCasovac() {
    if (v2DragSeznamCasovac !== null) clearTimeout(v2DragSeznamCasovac);
    v2DragSeznamCasovac = null;
  }

  function zajistiV2ListDropIndicator() {
    if (v2ListDropIndicator?.isConnected) return v2ListDropIndicator;
    v2ListDropIndicator = document.createElement("div");
    v2ListDropIndicator.className = "ln-v2-list-drop-indicator";
    v2ListDropIndicator.hidden = true;
    v2ListDropIndicator.setAttribute("aria-hidden", "true");
    document.body.appendChild(v2ListDropIndicator);
    return v2ListDropIndicator;
  }

  function zajistiV2ListDragPreview() {
    if (v2ListDragPreview?.isConnected) return v2ListDragPreview;
    v2ListDragPreview = document.createElement("div");
    v2ListDragPreview.className = "ln-v2-list-drag-preview";
    v2ListDragPreview.hidden = true;
    v2ListDragPreview.setAttribute("aria-hidden", "true");
    document.body.appendChild(v2ListDragPreview);
    return v2ListDragPreview;
  }

  function schovejV2ListDragPomucky() {
    if (v2ListDropIndicator) v2ListDropIndicator.hidden = true;
    if (v2ListDragPreview) {
      v2ListDragPreview.hidden = true;
      v2ListDragPreview.classList.remove("chce-zanorit", "chce-vysunout");
    }
  }

  function zastavV2ListAutoScroll() {
    if (v2ListAutoScrollRaf !== null) cancelAnimationFrame(v2ListAutoScrollRaf);
    v2ListAutoScrollRaf = null;
  }

  function krokV2ListAutoScroll() {
    v2ListAutoScrollRaf = null;
    if (!v2DragSeznamu?.aktivni || !editor) return;
    const krok = ziskejV2AutoScrollKrok(v2DragSeznamu.lastY);
    if (Math.abs(krok) < 0.2) return;
    const pred = editor.scrollTop;
    const maximum = Math.max(0, editor.scrollHeight - editor.clientHeight);
    editor.scrollTop = Math.max(0, Math.min(maximum, pred + krok));
    if (Math.abs(editor.scrollTop - pred) < 0.1) return;
    aktualizujV2DragSeznamu(v2DragSeznamu.lastX, v2DragSeznamu.lastY, false);
    v2ListAutoScrollRaf = requestAnimationFrame(krokV2ListAutoScroll);
  }

  function aktualizujV2ListAutoScroll(clientY) {
    if (!v2DragSeznamu?.aktivni) {
      zastavV2ListAutoScroll();
      return;
    }
    if (Math.abs(ziskejV2AutoScrollKrok(clientY)) < 0.2) {
      zastavV2ListAutoScroll();
      return;
    }
    if (v2ListAutoScrollRaf === null) {
      v2ListAutoScrollRaf = requestAnimationFrame(krokV2ListAutoScroll);
    }
  }

  function zrusV2DragSeznamu({ zachovatVyber = false } = {}) {
    zrusV2SeznamCasovac();
    zastavV2ListAutoScroll();
    v2DragSeznamu?.radek?.classList?.remove("ln-v2-list-dragging");
    editor?.classList?.remove("ln-v2-list-drag-mode");
    schovejV2ListDragPomucky();
    v2DragSeznamu = null;
    if (!zachovatVyber) vybranaPolozkaSeznamuId = "";
  }

  function aktivujV2MoveSeznamu() {
    if (!v2DragSeznamu?.radek?.isConnected) return;
    v2DragSeznamu.pripraven = true;
    vybranaPolozkaSeznamuId = v2DragSeznamu.blokId;
    v2DragSeznamu.radek.classList.add("ln-v2-list-move-selected");
    try { window.getSelection()?.removeAllRanges(); } catch (_error) {}
    try { editor?.blur(); } catch (_error) {}
    try { navigator.vibrate?.(18); } catch (_error) {}
    nastavStav("Položka seznamu připravena k přesunu · táhni řádek");
  }

  function pripravV2LongPressSeznamu(typ, radek, clientX, clientY, pointerId = null, touchId = null, okamzite = false) {
    zrusV2DragSeznamu({ zachovatVyber: true });
    const blokId = radek?.dataset?.lnV2Blok || "";
    if (!blokId || najdiIndexBlokuPodleId(blokId) < 0) return;
    v2DragSeznamu = {
      typ, radek, blokId, pointerId, touchId,
      startX: clientX, startY: clientY, lastX: clientX, lastY: clientY,
      pripraven: false, aktivni: false, cil: null
    };
    if (okamzite) {
      aktivujV2MoveSeznamu();
      return;
    }
    v2DragSeznamCasovac = setTimeout(() => {
      v2DragSeznamCasovac = null;
      aktivujV2MoveSeznamu();
    }, DELKA_LONG_PRESS_SEZNAMU);
  }

  function vzdalenostV2ListDrag(x, y) {
    if (!v2DragSeznamu) return 0;
    return Math.hypot(x - v2DragSeznamu.startX, y - v2DragSeznamu.startY);
  }

  function spustV2DragSeznamu(x, y) {
    if (!v2DragSeznamu?.pripraven || v2DragSeznamu.aktivni) return;
    v2DragSeznamu.aktivni = true;
    v2DragSeznamu.radek.classList.add("ln-v2-list-dragging");
    editor?.classList.add("ln-v2-list-drag-mode");
    const preview = zajistiV2ListDragPreview();
    const index = najdiIndexBlokuPodleId(v2DragSeznamu.blokId);
    preview.textContent = index >= 0 ? (textBloku(dokument.bloky[index]).trim() || "Položka seznamu") : "Položka seznamu";
    preview.hidden = false;
    aktualizujV2DragSeznamu(x, y);
  }

  function viditelneV2ListRadkyMimoPodstrom() {
    if (!v2DragSeznamu?.blokId || !editor) return [];
    const index = najdiIndexBlokuPodleId(v2DragSeznamu.blokId);
    if (index < 0) return [];
    const rozsah = rozsahPodstromuSeznamu(index);
    const idcka = new Set(dokument.bloky.slice(rozsah.od, rozsah.do + 1).map((blok) => blok.id));
    return Array.from(editor.querySelectorAll(".ln-v2-odstavec.ln-v2-bullet, .ln-v2-odstavec.ln-v2-ordered, .ln-v2-odstavec.ln-v2-todo"))
      .filter((radek) => !radek.hidden && !idcka.has(radek.dataset.lnV2Blok));
  }

  function cilV2DragSeznamuZBodu(clientY) {
    const radky = viditelneV2ListRadkyMimoPodstrom();
    if (!radky.length) return null;
    let predchoziId = "";
    for (const radek of radky) {
      const rect = radek.getBoundingClientRect();
      const stred = rect.top + rect.height / 2;
      if (clientY < stred) {
        return { id: radek.dataset.lnV2Blok, za: false, y: rect.top, predchoziId };
      }
      predchoziId = radek.dataset.lnV2Blok || predchoziId;
    }
    const posledni = radky[radky.length - 1];
    const rect = posledni.getBoundingClientRect();
    return { id: posledni.dataset.lnV2Blok, za: true, y: rect.bottom, predchoziId: posledni.dataset.lnV2Blok };
  }

  function aktualizujV2DragSeznamu(x, y, riditAutoScroll = true) {
    if (!v2DragSeznamu?.aktivni) return;
    v2DragSeznamu.lastX = x;
    v2DragSeznamu.lastY = y;
    const cil = cilV2DragSeznamuZBodu(y);
    v2DragSeznamu.cil = cil;

    const indicator = zajistiV2ListDropIndicator();
    if (cil) {
      const rect = editor.getBoundingClientRect();
      indicator.style.left = `${Math.round(rect.left + 10)}px`;
      indicator.style.width = `${Math.max(20, Math.round(rect.width - 20))}px`;
      indicator.style.top = `${Math.round(cil.y)}px`;
      indicator.hidden = false;
    } else {
      indicator.hidden = true;
    }

    const preview = zajistiV2ListDragPreview();
    preview.style.left = `${x}px`;
    preview.style.top = `${y - 92}px`;
    const dx = x - v2DragSeznamu.startX;
    const zdrojIndex = najdiIndexBlokuPodleId(v2DragSeznamu.blokId);
    const jeTodoDrag = zdrojIndex >= 0 && jeTodoBlok(dokument.bloky[zdrojIndex]);
    preview.classList.toggle("chce-zanorit", !jeTodoDrag && dx > PRAH_VNOR_SEZNAMU);
    preview.classList.toggle("chce-vysunout", !jeTodoDrag && dx < -PRAH_VNOR_SEZNAMU);
    if (riditAutoScroll) aktualizujV2ListAutoScroll(y);
  }

  function presunV2SeznamovyPodstrom(drag) {
    if (!drag?.blokId || !drag?.cil) return false;
    const zdroj = najdiIndexBlokuPodleId(drag.blokId);
    if (zdroj < 0) return false;
    const snapshotPred = vytvorSnapshotHistorie(posledniVyber || vyberZPosledniPozice());

    /* TODO je plochý seznam stejně jako v produkčním editoru. Používá stejné
       long-press/ghost/drop UX, ale horizontální tažení nikdy nemění úroveň. */
    if (jeTodoBlok(dokument.bloky[zdroj])) {
      const puvodniOffset = posledniVyber?.konec?.blok === zdroj ? posledniVyber.konec.offset : 0;
      const [polozka] = dokument.bloky.splice(zdroj, 1);
      let cilIndex = dokument.bloky.findIndex((blok) => blok.id === drag.cil.id);
      if (cilIndex < 0) {
        dokument.bloky.splice(Math.min(zdroj, dokument.bloky.length), 0, polozka);
        return false;
      }
      let vlozitNa = drag.cil.za ? cilIndex + 1 : cilIndex;
      dokument.bloky.splice(vlozitNa, 0, polozka);
      normalizujDokument();
      const novyIndex = najdiIndexBlokuPodleId(drag.blokId);
      const pozice = { blok: novyIndex, offset: Math.min(textBloku(dokument.bloky[novyIndex]).length, puvodniOffset) };
      const vyber = { zacatek: pozice, konec: pozice, sbaleny: true };
      posledniPozice = { ...pozice };
      posledniVyber = klonVyberu(vyber);
      ulozenyFormatovaciVyber = klonVyberu(vyber);
      vybranaPolozkaSeznamuId = drag.blokId;
      const zmeneno = ulozZmenuDoHistorie(snapshotPred, "přesun TODO");
      vykresli(vyber);
      nastavStav("TODO přesunuto");
      return zmeneno;
    }
    const puvodniUroven = normalizujUrovenBulletu(dokument.bloky[zdroj].uroven);
    const puvodniOffset = posledniVyber?.konec?.blok === zdroj ? posledniVyber.konec.offset : 0;
    const rozsah = rozsahPodstromuSeznamu(zdroj);
    const skupina = dokument.bloky.splice(rozsah.od, rozsah.do - rozsah.od + 1);

    let cilIndex = dokument.bloky.findIndex((blok) => blok.id === drag.cil.id);
    if (cilIndex < 0) {
      dokument.bloky.splice(rozsah.od, 0, ...skupina);
      return false;
    }
    let vlozitNa = cilIndex;
    if (drag.cil.za) {
      const cilRozsah = rozsahPodstromuSeznamu(cilIndex);
      vlozitNa = cilRozsah.do + 1;
    }

    const dx = drag.lastX - drag.startX;
    let novaUroven = puvodniUroven;
    if (dx > PRAH_VNOR_SEZNAMU) {
      const predId = drag.cil.predchoziId || (drag.cil.za ? drag.cil.id : "");
      const predIndex = dokument.bloky.findIndex((blok) => blok.id === predId);
      if (predIndex >= 0 && jeSeznamovyBlok(dokument.bloky[predIndex])) {
        novaUroven = Math.min(6, normalizujUrovenBulletu(dokument.bloky[predIndex].uroven) + 1);
      }
    } else if (dx < -PRAH_VNOR_SEZNAMU) {
      novaUroven = Math.max(0, puvodniUroven - 1);
    } else {
      const pred = dokument.bloky[vlozitNa - 1];
      if (!jeSeznamovyBlok(pred)) novaUroven = 0;
      else novaUroven = Math.min(puvodniUroven, normalizujUrovenBulletu(pred.uroven) + 1);
    }

    const posun = novaUroven - puvodniUroven;
    skupina.forEach((blok) => {
      if (jeSeznamovyBlok(blok)) blok.uroven = normalizujUrovenBulletu(normalizujUrovenBulletu(blok.uroven) + posun);
    });
    dokument.bloky.splice(vlozitNa, 0, ...skupina);
    normalizujDokument();

    const novyIndex = najdiIndexBlokuPodleId(drag.blokId);
    const pozice = { blok: Math.max(0, novyIndex), offset: Math.max(0, Math.min(textBloku(dokument.bloky[novyIndex]).length, puvodniOffset)) };
    const vyber = { zacatek: pozice, konec: pozice, sbaleny: true };
    posledniPozice = { ...pozice };
    posledniVyber = klonVyberu(vyber);
    ulozenyFormatovaciVyber = klonVyberu(vyber);
    vybranaPolozkaSeznamuId = "";
    ulozZmenuDoHistorie(snapshotPred, "přesun položky seznamu");
    vykresli(vyber);
    nastavStav(`Položka přesunuta · úroveň ${normalizujUrovenBulletu(dokument.bloky[novyIndex]?.uroven)}`);
    return true;
  }

  function dokoncV2DragSeznamu(x, y, ulozit) {
    if (!v2DragSeznamu) return false;
    const drag = v2DragSeznamu;
    if (drag.aktivni) aktualizujV2DragSeznamu(x, y);
    const aktivni = drag.aktivni;
    let zmeneno = false;
    if (ulozit && aktivni) zmeneno = presunV2SeznamovyPodstrom(drag);
    if (aktivni) potlacKlikSeznamuDo = performance.now() + 500;
    zrusV2DragSeznamu({ zachovatVyber: false });
    if (aktivni && zmeneno) {
      vykresli(posledniVyber || vyberZPosledniPozice());
    }
    return aktivni;
  }

  function najdiDotykV2Seznamu(dotyky, id) {
    return Array.from(dotyky || []).find((dotyk) => dotyk.identifier === id) || null;
  }

  function zpracujV2ListTouchMove(event) {
    if (!v2DragSeznamu || v2DragSeznamu.typ !== "touch") return;
    const dotyk = najdiDotykV2Seznamu(event.touches, v2DragSeznamu.touchId);
    if (!dotyk) return;

    if (!v2DragSeznamu.pripraven) {
      if (vzdalenostV2ListDrag(dotyk.clientX, dotyk.clientY) > MAX_POHYB_LONG_PRESS_SEZNAMU) {
        zrusV2DragSeznamu({ zachovatVyber: true });
      }
      return;
    }

    event.preventDefault();
    if (!v2DragSeznamu.aktivni && vzdalenostV2ListDrag(dotyk.clientX, dotyk.clientY) >= START_DRAG_SEZNAMU) {
      spustV2DragSeznamu(dotyk.clientX, dotyk.clientY);
    }
    if (v2DragSeznamu?.aktivni) aktualizujV2DragSeznamu(dotyk.clientX, dotyk.clientY);
  }

  function zpracujV2ListTouchEnd(event) {
    if (!v2DragSeznamu || v2DragSeznamu.typ !== "touch") return;
    const dotyk = najdiDotykV2Seznamu(event.changedTouches, v2DragSeznamu.touchId);
    if (!dotyk) return;
    zrusV2SeznamCasovac();

    if (v2DragSeznamu.aktivni) {
      event.preventDefault();
      dokoncV2DragSeznamu(dotyk.clientX, dotyk.clientY, true);
      return;
    }

    if (v2DragSeznamu.pripraven) {
      /* Long-press na značce bez pohybu není trvalý MOVE mód.
         Po puštění se vše vrátí do běžné editace, aby další 1×/2× tap
         nikdy nebyl blokovaný starým stavem přesunu. */
      potlacKlikSeznamuDo = performance.now() + 350;
      zrusV2DragSeznamu({ zachovatVyber: false });
      return;
    }

    /* Krátký tap je normální editace/selection. MOVE MODE vznikne až
       skutečným long-pressem na značce/checkboxu. */
    zrusV2DragSeznamu({ zachovatVyber: false });
  }

  function zpracujV2ListPointerMove(event) {
    if (!v2DragSeznamu || v2DragSeznamu.typ !== "pointer" || v2DragSeznamu.pointerId !== event.pointerId) return;
    if (!v2DragSeznamu.pripraven) {
      if (vzdalenostV2ListDrag(event.clientX, event.clientY) > MAX_POHYB_LONG_PRESS_SEZNAMU) {
        zrusV2DragSeznamu({ zachovatVyber: true });
      }
      return;
    }
    event.preventDefault();
    if (!v2DragSeznamu.aktivni && vzdalenostV2ListDrag(event.clientX, event.clientY) >= START_DRAG_SEZNAMU) {
      spustV2DragSeznamu(event.clientX, event.clientY);
    }
    if (v2DragSeznamu?.aktivni) aktualizujV2DragSeznamu(event.clientX, event.clientY);
  }

  function zpracujV2ListPointerEnd(event) {
    if (!v2DragSeznamu || v2DragSeznamu.typ !== "pointer" || v2DragSeznamu.pointerId !== event.pointerId) return;
    zrusV2SeznamCasovac();
    if (v2DragSeznamu.aktivni) {
      event.preventDefault();
      dokoncV2DragSeznamu(event.clientX, event.clientY, true);
      return;
    }
    if (v2DragSeznamu.pripraven) {
      potlacKlikSeznamuDo = performance.now() + 350;
      zrusV2DragSeznamu({ zachovatVyber: false });
      return;
    }
    zrusV2DragSeznamu({ zachovatVyber: false });
  }

  function zapisV2ImeDiag(typ, event = null, stav = "") {
    /*
     * DIAG 431 – pouze diagnostika Android IME.
     * NEMĚNÍ model, selection ani browserové chování. Záznam se posílá
     * jako CustomEvent do Debug Hubu, takže nezahlcuje běžnou konzoli.
     */
    const data = event?.data == null
      ? "-"
      : JSON.stringify(String(event.data).replace(/\n/g, "\\n"));
    const inputType = event?.inputType || "-";
    const composing = Boolean(event?.isComposing);
    const target = event?.target;
    const targetPopis = target
      ? `${target.tagName || target.nodeName || "?"}${target.id ? `#${target.id}` : ""}${target.classList?.length ? `.${Array.from(target.classList).slice(0, 3).join(".")}` : ""}`
      : "-";
    const editable = Boolean(editor?.isContentEditable);
    const aktivni = Boolean(editor && (document.activeElement === editor || editor.contains(document.activeElement)));

    try {
      document.dispatchEvent(new CustomEvent("lubanote:v2-ime-debug", {
        bubbles: false,
        detail: {
          text: `${typ} | inputType=${inputType} | data=${data} | composing=${composing} | editable=${editable} | activeInEditor=${aktivni} | target=${targetPopis}${stav ? ` | ${stav}` : ""}`
        }
      }));
    } catch (_error) {}
  }

  function jeV2ImeInput(inputType = "") {
    return inputType === "insertCompositionText"
      || inputType === "insertFromComposition"
      || inputType === "deleteCompositionText";
  }

  function zacniV2ImeKompozici() {
    if (v2ImeKompozice?.aktivni) return v2ImeKompozice;

    const vyber = aktualniVyberModelu();
    if (!vyber || vyber.zacatek.blok !== vyber.konec.blok) return null;

    const blokIndex = vyber.zacatek.blok;
    const blok = dokument?.bloky?.[blokIndex];
    if (!jeTextovyBlok(blok)) return null;

    const celyText = textBloku(blok);
    const zacatek = Math.max(0, Math.min(celyText.length, vyber.zacatek.offset));
    const konec = Math.max(zacatek, Math.min(celyText.length, vyber.konec.offset));

    if (v2ImeNativniStaryAndroid) {
      v2ImeKompozice = {
        aktivni: true,
        nativni: true,
        blok: blokIndex,
        blokId: String(blok.id || ""),
        puvodniTextBloku: celyText,
        puvodniVyber: klonVyberu(vyber),
        snapshotPred: vytvorSnapshotHistorie(vyber),
        zmeneno: false
      };
      zapisV2ImeDiag(
        "native-start",
        null,
        `blok=${blokIndex} start=${zacatek} end=${konec}`
      );
      return v2ImeKompozice;
    }

    v2ImeKompozice = {
      aktivni: true,
      nativni: false,
      blok: blokIndex,
      zacatek,
      text: celyText.slice(zacatek, konec),
      puvodniCaret: konec,
      snapshotPred: vytvorSnapshotHistorie(vyber),
      zmeneno: false,
      rozsahZImeDat: false
    };
    return v2ImeKompozice;
  }


  function zkusNajitV2ImeRozsahZDat(data) {
    const stav = v2ImeKompozice;
    if (!stav?.aktivni || stav.zmeneno || stav.text) return;

    const hodnota = String(data ?? "");
    if (!hodnota) return;

    const blok = dokument?.bloky?.[stav.blok];
    if (!jeTextovyBlok(blok)) return;

    const text = textBloku(blok);
    const caret = Math.max(0, Math.min(text.length, stav.puvodniCaret));
    let zacatek = -1;

    // Typický Android 12 / WebView 103: compositionupdate obsahuje celé slovo
    // bezprostředně PŘED caretem. Tohle je případ potvrzený Debug Hubem 431.
    const pred = caret - hodnota.length;
    if (pred >= 0 && text.slice(pred, caret) === hodnota) {
      zacatek = pred;
    } else if (text.slice(caret, caret + hodnota.length) === hodnota) {
      // Některé IME drží skládáný rozsah napravo od caretu.
      zacatek = caret;
    } else {
      // Poslední bezpečný fallback: přijmeme jen výskyt, který se caretu dotýká.
      const kandidat = text.lastIndexOf(hodnota, caret);
      if (kandidat >= 0 && kandidat <= caret && kandidat + hodnota.length >= caret) {
        zacatek = kandidat;
      }
    }

    if (zacatek < 0) return;
    stav.zacatek = zacatek;
    stav.text = hodnota;
    stav.rozsahZImeDat = true;
    zapisV2ImeDiag("range", null, `blok=${stav.blok} start=${stav.zacatek} len=${stav.text.length}`);
  }

  function minimalniRozdilTextu(staryText, novyText) {
    const stary = String(staryText ?? "");
    const novy = String(novyText ?? "");
    let prefix = 0;
    const maxPrefix = Math.min(stary.length, novy.length);
    while (prefix < maxPrefix && stary[prefix] === novy[prefix]) prefix += 1;

    let suffix = 0;
    const maxSuffix = Math.min(stary.length - prefix, novy.length - prefix);
    while (
      suffix < maxSuffix
      && stary[stary.length - 1 - suffix] === novy[novy.length - 1 - suffix]
    ) {
      suffix += 1;
    }

    return {
      prefix,
      staryKonec: stary.length - suffix,
      novyKonec: novy.length - suffix,
      vlozit: novy.slice(prefix, novy.length - suffix)
    };
  }

  function ziskejV2ImeTextZDom(stav) {
    if (!stav?.nativni || !editor || !stav.blokId) return null;
    const radek = editor.querySelector(
      `[data-ln-v2-blok="${CSS.escape(stav.blokId)}"]`
    );
    if (!radek) return null;

    /*
     * Text čteme z dočasného DOM řádku, ale ignorujeme ovládací prvky a
     * obrázky. Bullet značky jsou CSS, TODO checkbox nemá text, takže tímto
     * získáme přesně uživatelský text bloku i po zásahu starého WebView.
     */
    const kopie = radek.cloneNode(true);
    kopie
      .querySelectorAll('button, figure, [contenteditable="false"]')
      .forEach((prvek) => prvek.remove());
    return String(kopie.textContent || "").replace(/\r/g, "");
  }

  function dokoncV2ImeNativniKompozici(duvod = "compositionend") {
    const stav = v2ImeKompozice;
    if (!stav?.aktivni || !stav.nativni) return false;

    const blok = dokument?.bloky?.[stav.blok];
    const novyTextBloku = ziskejV2ImeTextZDom(stav);

    if (!jeTextovyBlok(blok) || novyTextBloku === null) {
      v2ImeKompozice = null;
      vykresli(posledniVyber || posledniPozice);
      zapisV2ImeDiag("native-finalize", null, `reason=${duvod} fallback=render`);
      return false;
    }

    const puvodniText = String(stav.puvodniTextBloku || "");
    const rozdil = minimalniRozdilTextu(puvodniText, novyTextBloku);
    const zacatekZmeny = rozdil.prefix;
    const konecZmeny = rozdil.staryKonec;
    const maSkutecnouZmenu =
      zacatekZmeny !== konecZmeny || Boolean(rozdil.vlozit);

    if (!maSkutecnouZmenu) {
      /*
       * Stejný text = pouze IME echo / selection interakce. DOM nepřekreslujeme,
       * protože by starý Android znovu schoval vizuální označení textu.
       */
      v2ImeKompozice = null;
      zapisV2ImeDiag(
        "native-finalize",
        null,
        `reason=${duvod} changed=false blok=${stav.blok}`
      );
      return true;
    }

    const vyber = {
      zacatek: { blok: stav.blok, offset: zacatekZmeny },
      konec: { blok: stav.blok, offset: konecZmeny },
      sbaleny: zacatekZmeny === konecZmeny
    };
    const format = formatNaPozici(blok, zacatekZmeny);
    const caret = vlozText(rozdil.vlozit, vyber, format);
    stav.zmeneno = true;
    ulozZmenuDoHistorie(stav.snapshotPred, "IME psaní");

    const novyVyber = { zacatek: caret, konec: caret, sbaleny: true };
    posledniPozice = { ...caret };
    posledniVyber = klonVyberu(novyVyber);
    ulozenyFormatovaciVyber = klonVyberu(novyVyber);
    aktivniFormatPozice = klicPozice(caret);

    /* Stav ukončíme PŘED renderem, aby DOM Guard zase normálně hlídal model. */
    v2ImeKompozice = null;
    vykresli(novyVyber);
    oznamModelovyTextovyVstup("insertCompositionText");
    nastavStav("Řízeno modelem: Android IME commit");
    zapisV2ImeDiag(
      "native-finalize",
      null,
      `reason=${duvod} changed=true blok=${stav.blok} start=${zacatekZmeny} del=${konecZmeny - zacatekZmeny} ins=${rozdil.vlozit.length}`
    );
    return true;
  }

  function aplikujV2ImeText(data, inputType = "insertCompositionText") {
    const stav = zacniV2ImeKompozici();
    if (!stav) return false;

    const novyText = inputType === "deleteCompositionText" ? "" : String(data ?? "");
    const blok = dokument?.bloky?.[stav.blok];
    if (!jeTextovyBlok(blok)) return false;

    const rozdil = minimalniRozdilTextu(stav.text, novyText);
    const zacatekZmeny = stav.zacatek + rozdil.prefix;
    const konecZmeny = stav.zacatek + rozdil.staryKonec;

    const maSkutecnouZmenu = zacatekZmeny !== konecZmeny || Boolean(rozdil.vlozit);

    if (maSkutecnouZmenu) {
      const vyber = {
        zacatek: { blok: stav.blok, offset: zacatekZmeny },
        konec: { blok: stav.blok, offset: konecZmeny },
        sbaleny: zacatekZmeny === konecZmeny
      };

      // Formát bereme přímo z modelu v místě skutečné změny. Nesmíme se zde
      // spoléhat na DOM caret – Android IME jej během composition může přesouvat.
      const format = formatNaPozici(blok, zacatekZmeny);
      vlozText(rozdil.vlozit, vyber, format);
      stav.zmeneno = true;
    }

    stav.text = novyText;

    /*
     * FIX 433 – Android 12 / WebView 103 po označení textu často spustí
     * composition cyklus jen jako IME echo a pošle STEJNÝ text, který už je
     * v označeném rozsahu. To není editace.
     *
     * 🔒 Při nulové změně NESMÍME volat vykresli() ani
     * oznamModelovyTextovyVstup(). Překreslení by sbalilo živý výběr na caret
     * a produkční V2 Bridge by následně zavřel vlastní LubaNote selection menu.
     * Stav composition si pouze zapamatujeme a čekáme na skutečný rozdíl.
     */
    if (!maSkutecnouZmenu) {
      zapisDebug?.(`EDITOR V2 | IME ECHO NO-OP | ${inputType}`);
      return true;
    }

    const caret = { blok: stav.blok, offset: stav.zacatek + novyText.length };
    const novyVyber = { zacatek: caret, konec: caret, sbaleny: true };
    posledniPozice = { ...caret };
    posledniVyber = klonVyberu(novyVyber);
    ulozenyFormatovaciVyber = klonVyberu(novyVyber);
    aktivniFormatPozice = klicPozice(caret);

    vykresli(novyVyber);
    oznamModelovyTextovyVstup(inputType);
    nastavStav(`Řízeno modelem: ${inputType}`);
    zapisDebug?.(`EDITOR V2 | IME ${inputType} | blok=${caret.blok} offset=${caret.offset}`);
    return true;
  }

  function dokoncV2ImeKompozici(duvod = "compositionend") {
    const stav = v2ImeKompozice;
    if (!stav?.aktivni) return false;

    if (stav.nativni) {
      return dokoncV2ImeNativniKompozici(duvod);
    }

    if (stav.zmeneno) {
      ulozZmenuDoHistorie(stav.snapshotPred, "IME psaní");
    }

    zapisV2ImeDiag(
      "finalize",
      null,
      `reason=${duvod} changed=${stav.zmeneno} blok=${stav.blok} start=${stav.zacatek} len=${stav.text.length}`
    );
    v2ImeKompozice = null;
    return true;
  }

  function zpracujBeforeInput(event) {
    zapisV2ImeDiag(
      "beforeinput",
      event,
      PODPOROVANE_INPUTY.has(event.inputType) ? "supported=true" : "supported=false"
    );

    if (jeV2ImeInput(event.inputType)) {
      if (v2ImeNativniStaryAndroid) {
        /*
         * FIX 434: na starém Android WebView necháme živou composition projít
         * nativně do DOM a model aktualizujeme jednou při jejím ukončení.
         * PreventDefault zde úmyslně NENÍ.
         */
        zacniV2ImeKompozici();
        return;
      }

      // Novější WebView: composition zůstává plně modelová.
      event.preventDefault();
      aplikujV2ImeText(event.data, event.inputType);
      if (event.inputType === "insertFromComposition") dokoncV2ImeKompozici("insertFromComposition");
      return;
    }

    // Pokud IME skončilo bez compositionend a přichází normální vstup, uzavřeme
    // předchozí kompozici jako jednu Undo operaci ještě před další změnou.
    if (v2ImeKompozice?.aktivni) dokoncV2ImeKompozici(`beforeinput:${event.inputType || "unknown"}`);

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
    oznamModelovyTextovyVstup(event.inputType);
    nastavStav(`Řízeno modelem: ${event.inputType}`);
    zapisDebug?.(`EDITOR V2 LAB | ${event.inputType} | blok=${caret.blok} offset=${caret.offset}`);
  }

  /* ==========================================
     LUBANOTE – VLASTNÍ KLÁVESNICE / UNICODE INPUT

     Vlastní mobilní klávesnice neposílá text přes contenteditable/IME.
     Každý příkaz jde přímo do modelu V2. Díky tomu je tato cesta stejná
     pro Android, iOS i libovolné Unicode písmo.

     OCHRANNÉ PRAVIDLO:
     DOM se nikdy nesmí stát zdrojem dat pro vlastní klávesnici.
     ========================================== */

  function ziskejKontextVlastniKlavesnice() {
    if (!dokument || !editor) return null;

    const vyber =
      aktualniVyberModelu() ||
      posledniVyber ||
      vyberZPosledniPozice();

    if (!vyber || !vyber.sbaleny) return null;

    const caret = { ...vyber.konec };
    const blok = dokument.bloky[caret.blok];
    if (!jeTextovyBlok(blok)) return null;

    const text = textBloku(blok);
    const predCaret = text.slice(0, caret.offset);
    const poCaretu = text.slice(caret.offset);

    let predMatch = null;
    let poMatch = null;
    let predchoziMatch = null;
    try {
      predMatch = predCaret.match(/([\p{L}\p{M}\p{N}'’\-]+)$/u);
      poMatch = poCaretu.match(/^([\p{L}\p{M}\p{N}'’\-]+)/u);
    } catch (_error) {
      predMatch = predCaret.match(/([A-Za-zÀ-ž0-9'’\-]+)$/);
      poMatch = poCaretu.match(/^([A-Za-zÀ-ž0-9'’\-]+)/);
    }

    const prefix = predMatch?.[1] || "";
    const suffix = poMatch?.[1] || "";
    const zacatek = Math.max(0, caret.offset - prefix.length);
    const konec = Math.min(text.length, caret.offset + suffix.length);

    const predSlovem = text.slice(0, zacatek);
    try {
      predchoziMatch = predSlovem.match(/([\p{L}\p{M}\p{N}'’\-]+)[^\p{L}\p{M}\p{N}'’\-]*$/u);
    } catch (_error) {
      predchoziMatch = predSlovem.match(/([A-Za-zÀ-ž0-9'’\-]+)[^A-Za-zÀ-ž0-9'’\-]*$/);
    }

    return {
      blok: caret.blok,
      offset: caret.offset,
      zacatek,
      konec,
      prefix,
      suffix,
      celeSlovo: text.slice(zacatek, konec),
      predchoziSlovo: predchoziMatch?.[1] || "",
      textPredCaretem: predCaret
    };
  }

  function provedPrikazVlastniKlavesnice(typ, data = "") {
    if (!dokument || !editor) return false;

    if (v2ImeKompozice?.aktivni) {
      dokoncV2ImeKompozici("luba-keyboard");
    }

    if (typ === "undo") return vratHistoriiZpet();
    if (typ === "redo") return vratHistoriiVpred();

    let vyber =
      aktualniVyberModelu() ||
      posledniVyber ||
      vyberZPosledniPozice();

    if (!vyber) return false;

    /* PATCH 445 – predikční lišta LubaKeyboard.
       Přijetí návrhu nahrazuje celé rozepsané slovo jedním modelovým krokem,
       takže nevznikne několik Undo záznamů za jednotlivé Backspace/znaky. */
    if (typ === "suggestion") {
      const navrh = String(data ?? "").trim();
      const kontext = ziskejKontextVlastniKlavesnice();
      if (!navrh || !kontext) return false;

      const rozsah = {
        zacatek: { blok: kontext.blok, offset: kontext.zacatek },
        konec: { blok: kontext.blok, offset: kontext.konec },
        sbaleny: kontext.zacatek === kontext.konec
      };
      const snapshotPred = vytvorSnapshotHistorie(rozsah);
      const caret = vlozText(`${navrh} `, rozsah);

      ulozZmenuDoHistorie(snapshotPred, "LubaKeyboard návrh slova");
      aktivniFormatPozice = klicPozice(caret);

      const novyVyber = { zacatek: { ...caret }, konec: { ...caret }, sbaleny: true };
      posledniPozice = { ...caret };
      posledniVyber = klonVyberu(novyVyber);
      ulozenyFormatovaciVyber = klonVyberu(novyVyber);

      vykresli(novyVyber);
      oznamModelovyTextovyVstup("insertReplacementText");
      nastavStav("LubaKeyboard: návrh slova");
      zapisDebug?.(`EDITOR V2 | LubaKeyboard | suggestion=${navrh} | blok=${caret.blok} offset=${caret.offset}`);
      return true;
    }

    if (typ === "left" || typ === "right") {
      let pozice;

      if (!vyber.sbaleny) {
        pozice = typ === "left" ? { ...vyber.zacatek } : { ...vyber.konec };
      } else {
        pozice = { ...vyber.konec };
        const blok = dokument.bloky[pozice.blok];

        if (jeTextovyBlok(blok)) {
          const textBlokuAktualni = textBloku(blok);

          if (typ === "left") {
            if (pozice.offset > 0) {
              pozice.offset = predchoziGraphem(textBlokuAktualni, pozice.offset);
            } else {
              const pred = najdiTextovyBlokOd(pozice.blok - 1, -1);
              if (pred >= 0) {
                pozice = { blok: pred, offset: textBloku(dokument.bloky[pred]).length };
              }
            }
          } else if (pozice.offset < textBlokuAktualni.length) {
            pozice.offset = dalsiGraphem(textBlokuAktualni, pozice.offset);
          } else {
            const dalsi = najdiTextovyBlokOd(pozice.blok + 1, 1);
            if (dalsi >= 0) pozice = { blok: dalsi, offset: 0 };
          }
        }
      }

      nastavVyberModelu(pozice, pozice);
      posledniPozice = { ...pozice };
      posledniVyber = { zacatek: { ...pozice }, konec: { ...pozice }, sbaleny: true };
      aktivniFormatPozice = klicPozice(pozice);
      aktualizujToolbarVelikosti(posledniVyber);
      return true;
    }

    const snapshotPred = vytvorSnapshotHistorie(vyber);
    let caret = { ...vyber.zacatek };
    let formatPoMazani = null;
    let inputType = "insertText";

    if (typ === "text") {
      const vlozenyText = String(data ?? "");
      if (!vlozenyText) return false;
      caret = vlozText(vlozenyText, vyber);
      inputType = "insertText";
    } else if (typ === "space") {
      caret = vlozText(" ", vyber);
      inputType = "insertText";
    } else if (typ === "enter") {
      caret = vlozOdstavec(vyber);
      inputType = "insertParagraph";
    } else if (typ === "backspace") {
      formatPoMazani = formatMazanyZpet(vyber, false);
      caret = smazZpet(vyber, false);
      inputType = "deleteContentBackward";
    } else if (typ === "delete") {
      formatPoMazani = formatMazanyVpred(vyber, false);
      caret = smazVpred(vyber, false);
      inputType = "deleteContentForward";
    } else {
      return false;
    }

    ulozZmenuDoHistorie(snapshotPred, `LubaKeyboard ${inputType}`);

    if (formatPoMazani) {
      aktivniFormatPsani = kopieFormatu(formatPoMazani);
      aktivniFormatPozice = klicPozice(caret);
      aktivniFormatZdroj = "zdedeny";
    } else if (typ === "backspace" || typ === "delete") {
      aktivniFormatPsani = null;
      aktivniFormatPozice = klicPozice(caret);
      aktivniFormatZdroj = "";
    } else {
      aktivniFormatPozice = klicPozice(caret);
    }

    const novyVyber = { zacatek: { ...caret }, konec: { ...caret }, sbaleny: true };
    posledniPozice = { ...caret };
    posledniVyber = klonVyberu(novyVyber);
    ulozenyFormatovaciVyber = klonVyberu(novyVyber);

    vykresli(novyVyber);
    oznamModelovyTextovyVstup(inputType);
    nastavStav(`LubaKeyboard: ${inputType}`);
    zapisDebug?.(`EDITOR V2 | LubaKeyboard | ${inputType} | blok=${caret.blok} offset=${caret.offset}`);
    return true;
  }


  function oznamModelovyTextovyVstup(inputType = "") {
    /*
     * V2 záměrně preventDefault()uje browserový beforeinput, takže Android
     * nemusí následně vyvolat nativní `input`/`keyup`. Funkce typu [[ autocomplete
     * proto dostanou vlastní neutrální signál až po obnovení selection z modelu.
     * Nejde o zdroj dat – pouze o oznámení, že modelový text se právě změnil.
     */
    queueMicrotask(() => {
      if (!editor?.isConnected) return;
      editor.dispatchEvent(new CustomEvent("lubanote:v2-model-input", {
        bubbles: true,
        detail: { inputType: String(inputType || "") }
      }));
    });
  }

  function dokoncImePredExterniAkci() {
    if (!v2ImeKompozice?.aktivni) return true;

    /*
     * Toolbar / Uložit může být na starém Androidu první prvek, na který
     * uživatel sáhne během stále otevřené Gboard composition. Blur ji nechá
     * WebView uzavřít; pokud ji neuzavře samo, převezmeme aktuální DOM stav
     * synchronně, aby save nikdy neexportoval rozpracovanou hodnotu.
     */
    if (v2ImeKompozice.nativni && document.activeElement === editor) {
      try { editor.blur(); } catch (_error) {}
    }

    if (!v2ImeKompozice?.aktivni) return true;
    return dokoncV2ImeKompozici("external-action") !== false;
  }

  function zpracujPaste(event) {
    if (v2ImeKompozice?.aktivni) dokoncV2ImeKompozici("paste");
    const text = event.clipboardData?.getData("text/plain");
    if (typeof text !== "string") return;
    event.preventDefault();
    const vyber = aktualniVyberModelu();
    const snapshotPred = vytvorSnapshotHistorie(vyber);
    const caret = vlozViceRadku(text, vyber);
    ulozZmenuDoHistorie(snapshotPred, "vložit text");
    const novyVyber = { zacatek: caret, konec: caret, sbaleny: true };
    vykresli(novyVyber);
    oznamModelovyTextovyVstup("insertFromPaste");
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
      } else if (jeTodoBlok(blok)) {
        if (!blokEl.classList.contains("ln-v2-todo")) return `blok ${b}: chybí TODO třída`;
        if (blokEl.dataset.lnV2TodoCompleted !== (blok.hotovo ? "1" : "0")) return `blok ${b}: jiný TODO stav DOM/model`;
        const checkbox = blokEl.querySelector(':scope > .ln-v2-todo-check[data-v2-todo-check]');
        if (!checkbox || checkbox.dataset.v2TodoCheck !== blok.id) return `blok ${b}: chybí TODO checkbox`;
        if (checkbox.getAttribute("aria-checked") !== (blok.hotovo ? "true" : "false")) return `blok ${b}: jiné aria-checked TODO`;
      } else if (blokEl.classList.contains("ln-v2-bullet") || blokEl.classList.contains("ln-v2-ordered") || blokEl.classList.contains("ln-v2-todo")) {
        return `blok ${b}: cizí seznamová/TODO třída`;
      }
      const modelZarovnani = normalizujZarovnani(blok.zarovnani);
      const domZarovnani = normalizujZarovnani(blokEl.style.textAlign || "left");
      if (domZarovnani !== modelZarovnani) return `blok ${b}: jiné zarovnání DOM/model`;

      /*
       * V2.15 – seznam může mít uvnitř řádku také obrázkové přílohy.
       * Text proto NESMÍME porovnávat přes `blokEl.textContent`: tlačítka
       * obrázku nebo budoucí pomocné UI nejsou součástí modelového textu.
       * Zdroj pravdy jsou pouze přímé `.ln-v2-cast` segmenty.
       */
      const primeDeti = Array.from(blokEl.children);
      const segmentyDom = primeDeti.filter((dite) =>
        dite.matches?.("span.ln-v2-cast[data-ln-v2-segment]")
      );
      const prazdneBr = primeDeti.filter((dite) =>
        dite.matches?.("br[data-ln-v2-prazdny]")
      );
      const obrazkyDom = primeDeti.filter((dite) =>
        dite.matches?.("figure.ln-v2-obrazek.ln-v2-list-image[data-ln-v2-obrazek]")
      );
      const todoCheckboxy = primeDeti.filter((dite) =>
        dite.matches?.("button.ln-v2-todo-check[data-v2-todo-check]")
      );
      const povoleneDeti = new Set([...segmentyDom, ...prazdneBr, ...obrazkyDom, ...todoCheckboxy]);
      if (primeDeti.some((dite) => !povoleneDeti.has(dite))) {
        return `blok ${b}: cizí přímý DOM prvek`;
      }

      const domText = segmentyDom.map((span) => span.textContent || "").join("");
      if (domText !== textBloku(blok)) return `blok ${b}: jiný text`;

      const obrazkyModel = (jeSeznamovyBlok(blok) || jeTodoBlok(blok)) && Array.isArray(blok.obrazky)
        ? blok.obrazky
        : [];
      if (obrazkyDom.length !== obrazkyModel.length) {
        return `blok ${b}: počet obrázků DOM=${obrazkyDom.length} model=${obrazkyModel.length}`;
      }
      for (let oi = 0; oi < obrazkyModel.length; oi += 1) {
        const figure = obrazkyDom[oi];
        const obrazekModel = obrazkyModel[oi];
        if (figure.dataset.lnV2Obrazek !== obrazekModel.id) {
          return `blok ${b} obrázek ${oi}: jiné id`;
        }
        if (figure.dataset.velikost !== normalizujVelikostObrazku(obrazekModel.velikost)) {
          return `blok ${b} obrázek ${oi}: jiná velikost DOM/model`;
        }
        if (figure.dataset.zarovnani !== normalizujZarovnaniObrazku(obrazekModel.zarovnani)) {
          return `blok ${b} obrázek ${oi}: jiné zarovnání DOM/model`;
        }
        const image = figure.querySelector(":scope > img");
        if (!image) return `blok ${b} obrázek ${oi}: chybí img`;
        if (String(image.getAttribute("src") || "") !== String(obrazekModel.zdroj || "")) {
          return `blok ${b} obrázek ${oi}: jiný zdroj DOM/model`;
        }
        if (String(image.getAttribute("alt") || "") !== String(obrazekModel.alt || "Obrázek v poznámce")) {
          return `blok ${b} obrázek ${oi}: jiný alt DOM/model`;
        }
      }

      if (!textBloku(blok)) {
        if (prazdneBr.length !== 1 || segmentyDom.length !== 0) {
          return `blok ${b}: neplatný prázdný blok`;
        }
        continue;
      }
      if (prazdneBr.length) return `blok ${b}: neočekávaný prázdný řádek`;

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

        const modelInterniId = normalizujIdOdkazu(cast.format?.interniOdkazId) || "";
        if ((span.dataset.lnV2NoteId || "") !== modelInterniId) {
          return `blok ${b} segment ${s}: jiný interní odkaz DOM/model`;
        }
        if (span.classList.contains("noteInternalLink") !== Boolean(modelInterniId)) {
          return `blok ${b} segment ${s}: jiný stav interního odkazu DOM/model`;
        }
        const modelPlanId = normalizujIdOdkazu(cast.format?.planOdkazId) || "";
        if ((span.dataset.lnV2PlanId || "") !== modelPlanId) {
          return `blok ${b} segment ${s}: jiný plánovaný odkaz DOM/model`;
        }
        if (span.classList.contains("plannedTextLink") !== Boolean(modelPlanId)) {
          return `blok ${b} segment ${s}: jiný stav plánovaného odkazu DOM/model`;
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
    if (element.classList?.contains("noteInternalLink") || element.hasAttribute("data-note-id")) {
      format.interniOdkazId = normalizujIdOdkazu(element.dataset?.noteId);
      format.interniOdkazNazev = String(element.dataset?.noteTitle || element.textContent || "").trim() || null;
      format.odkaz = null;
    }
    if (element.classList?.contains("plannedTextLink") || element.hasAttribute("data-planned-item-id")) {
      format.planOdkazId = normalizujIdOdkazu(element.dataset?.plannedItemId);
    }
    if (tag === "a" && !format.interniOdkazId) format.odkaz = normalizujInternetovouAdresu(element.getAttribute("href"));
    if (tag === "b" || tag === "strong") format.tucne = true;
    if (tag === "i" || tag === "em") format.kurziva = true;
    if (tag === "u") format.podtrzeni = true;
    if (tag === "code") format.kod = true;
    if (/monospace|consolas|menlo|courier/i.test(String(element.style?.fontFamily || ""))) {
      format.kod = true;
    }

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
    const povoleneInline = new Set(["span", "font", "b", "strong", "i", "em", "u", "mark", "a", "code"]);
    const uzly = Array.from(rodic?.childNodes || []);

    const pridejLegacyNovyRadek = () => {
      const posledni = vystup[vystup.length - 1];
      if (!posledni || !String(posledni.text || "").endsWith("\n")) {
        vystup.push(vytvorSegment("\n", zakladniFormat));
      }
    };

    uzly.forEach((uzel, index) => {
      if (uzel.nodeType === Node.TEXT_NODE) {
        if (uzel.nodeValue) {
          const format = kopieFormatu(zakladniFormat);
          const text = format.interniOdkazId
            ? ziskejNazevPoznamkyProInterniOdkaz(format.interniOdkazId, format.interniOdkazNazev || uzel.nodeValue)
            : uzel.nodeValue;
          if (format.interniOdkazId) format.interniOdkazNazev = text;
          vystup.push(vytvorSegment(text, format));
        }
        return;
      }

      if (uzel.nodeType !== Node.ELEMENT_NODE) return;
      const tag = uzel.tagName.toLowerCase();

      if (tag === "br") {
        vystup.push(vytvorSegment("\n", zakladniFormat));
        return;
      }

      /*
       * Legacy contenteditable někdy uložil nový řádek jako vnořený
       * <div> uvnitř jiného textového bloku. Pro V2 to není nový typ
       * obsahu, jen hranice řádku. Jednoduchý vnořený DIV proto bezpečně
       * zploštíme na newline + jeho inline obsah. Pokud uvnitř leží něco
       * složitějšího (seznam, obrázek...), rekurze to dál označí jako
       * nepodporované a ochranný fallback zůstane zachovaný.
       */
      if (tag === "div" || tag === "p") {
        if (vystup.length) {
          pridejLegacyNovyRadek();
        }

        importujInlineUzly(
          uzel,
          formatZInlineElementu(uzel, zakladniFormat),
          vystup,
          nepodporovane
        );

        const maDalsiObsah = uzly.slice(index + 1).some((dalsi) => {
          if (dalsi.nodeType === Node.TEXT_NODE) {
            return String(dalsi.nodeValue || "").length > 0;
          }
          return dalsi.nodeType === Node.ELEMENT_NODE;
        });

        if (maDalsiObsah) {
          pridejLegacyNovyRadek();
        }
        return;
      }

      if (!povoleneInline.has(tag)) {
        nepodporovane.add(tag);
        return;
      }

      if (tag === "a") {
        const jeInterni = uzel.classList.contains("noteInternalLink") || uzel.hasAttribute("data-note-id");
        const jePlan = uzel.classList.contains("plannedTextLink") || uzel.hasAttribute("data-planned-item-id");
        const href = normalizujInternetovouAdresu(uzel.getAttribute("href"));
        if (!jeInterni && !jePlan && !href) {
          nepodporovane.add("a[href]");
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
    const povoleneInline = new Set(["span", "font", "b", "strong", "i", "em", "u", "mark", "a", "br", "code"]);

    Array.from(seznam.children).forEach((li) => {
      if (li.tagName?.toLowerCase() !== "li") {
        nepodporovane.add(li.tagName?.toLowerCase?.() || "prvek v seznamu");
        return;
      }

      const obsah = [];
      const obrazky = [];
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
          const obrazek = vytvorObrazkovyBlokZHtml(uzel, nepodporovane);
          if (obrazek) obrazky.push(obrazek);
          return;
        }
        if (
          tag === "div" &&
          (uzel.dataset?.bulletMediaLine === "true" || uzel.classList?.contains("lubaNoteBulletImageTextLine"))
        ) {
          /* Produkční editor drží za obrázkem technický editovatelný řádek.
             Prázdný <br> není obsah a do V2 modelu se nesmí změnit na dva
             nové řádky. Pokud na něm uživatel skutečně napsal text, obsah
             bezpečně zachováme jako pokračování položky. */
          const maSkutecnyObsah = Boolean(String(uzel.textContent || "").length);
          if (maSkutecnyObsah) {
            docasny.appendChild(document.createElement("br"));
            Array.from(uzel.childNodes).forEach((dite) => {
              if (dite.nodeType === Node.ELEMENT_NODE && dite.tagName?.toLowerCase() === "br") return;
              docasny.appendChild(dite.cloneNode(true));
            });
          }
          return;
        }
        if (tag === "p" || tag === "div") {
          if (docasny.childNodes.length) docasny.appendChild(document.createElement("br"));
          Array.from(uzel.childNodes).forEach((dite) => {
            docasny.appendChild(dite.cloneNode(true));
          });
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
      const blok = vytvorSeznamovyBlokZObsahu(obsah, typSeznamu, uroven, zarovnani);
      blok.sbaleno = Boolean(
        li.classList.contains("bulletSbaleny") ||
        Array.from(li.children).some((dite) => ["ul", "ol"].includes(dite.tagName?.toLowerCase()) && dite.hidden)
      );
      blok.obrazky = obrazky;
      bloky.push(blok);

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

  function importujWrapperSObrazkyDoModelu(element, bloky, nepodporovane, zakladniFormat = VYCHOZI_FORMAT) {
    if (!(element instanceof Element)) return false;

    const obsah = [];
    const docasny = document.createElement("span");
    const zarovnani = normalizujZarovnani(
      element.style?.textAlign || element.getAttribute("align")
    );

    const flushText = () => {
      if (!docasny.childNodes.length) return;

      obsah.length = 0;
      importujInlineUzly(
        docasny,
        zakladniFormat,
        obsah,
        nepodporovane
      );
      docasny.replaceChildren();

      if (obsah.length === 1 && obsah[0]?.text === "\n") {
        obsah.length = 0;
      }

      if (obsah.length) {
        bloky.push(vytvorOdstavecZObsahu(obsah.splice(0), zarovnani));
      }
    };

    const zpracuj = (uzel) => {
      if (uzel.nodeType === Node.TEXT_NODE) {
        docasny.appendChild(uzel.cloneNode(true));
        return;
      }

      if (uzel.nodeType !== Node.ELEMENT_NODE) return;

      const tag = uzel.tagName.toLowerCase();

      if (tag === "figure" || tag === "img") {
        flushText();
        const obrazek = vytvorObrazkovyBlokZHtml(uzel, nepodporovane);
        if (obrazek) bloky.push(obrazek);
        return;
      }

      if (
        ["div", "p", "section", "article"].includes(tag) &&
        uzel.querySelector?.("figure, img")
      ) {
        flushText();
        const format = kopieFormatu(zakladniFormat);
        if (["h1", "h2", "h3"].includes(tag)) format.stylTextu = tag;
        importujWrapperSObrazkyDoModelu(
          uzel,
          bloky,
          nepodporovane,
          format
        );
        return;
      }

      docasny.appendChild(uzel.cloneNode(true));
    };

    Array.from(element.childNodes).forEach(zpracuj);
    flushText();
    return true;
  }

  function importujTodoElementDoModelu(element, bloky, nepodporovane) {
    if (!(element instanceof Element)) return;

    const obsah = [];
    const obrazky = [];
    const docasny = document.createElement("span");
    const povoleneInline = new Set(["span", "font", "b", "strong", "i", "em", "u", "mark", "a", "br", "code"]);

    Array.from(element.childNodes).forEach((uzel) => {
      if (uzel.nodeType === Node.TEXT_NODE) {
        docasny.appendChild(uzel.cloneNode(true));
        return;
      }
      if (uzel.nodeType !== Node.ELEMENT_NODE) return;
      const tag = uzel.tagName.toLowerCase();
      if (tag === "figure" || tag === "img") {
        const obrazek = vytvorObrazkovyBlokZHtml(uzel, nepodporovane);
        if (obrazek) obrazky.push(obrazek);
        return;
      }
      if (tag === "div" && (uzel.dataset?.bulletMediaLine === "true" || uzel.classList?.contains("lubaNoteBulletImageTextLine"))) {
        if (String(uzel.textContent || "").length) {
          docasny.appendChild(document.createElement("br"));
          Array.from(uzel.childNodes).forEach((dite) => {
            if (dite.nodeType === Node.ELEMENT_NODE && dite.tagName?.toLowerCase() === "br") return;
            docasny.appendChild(dite.cloneNode(true));
          });
        }
        return;
      }
      if (tag === "p" || tag === "div") {
        if (docasny.childNodes.length) docasny.appendChild(document.createElement("br"));
        Array.from(uzel.childNodes).forEach((dite) => docasny.appendChild(dite.cloneNode(true)));
        return;
      }
      if (!povoleneInline.has(tag)) {
        nepodporovane.add(`${tag} v TODO`);
        return;
      }
      docasny.appendChild(uzel.cloneNode(true));
    });

    importujInlineUzly(docasny, VYCHOZI_FORMAT, obsah, nepodporovane);
    if (!obsah.length) obsah.push(vytvorSegment("", VYCHOZI_FORMAT));
    const blok = vytvorTodoZObsahu(
      obsah,
      element.dataset?.completed === "true",
      normalizujZarovnani(element.style?.textAlign || element.getAttribute("align"))
    );
    blok.obrazky = obrazky;
    blok.zvyrazneni = String(element.dataset?.highlightColor || "");
    if (element.dataset?.todoId) blok.id = String(element.dataset.todoId);
    bloky.push(blok);
  }

  function vytvorModelZTodos(todos = []) {
    const nepodporovane = new Set();
    const bloky = [];
    const povoleneInline = new Set(["span", "font", "b", "strong", "i", "em", "u", "mark", "a", "br", "code"]);

    (Array.isArray(todos) ? todos : []).forEach((todo) => {
      const obsah = [];
      const obrazky = [];
      const html = String(todo?.html || "");

      if (html) {
        const sablona = document.createElement("template");
        sablona.innerHTML = html;
        const docasny = document.createElement("span");
        Array.from(sablona.content.childNodes).forEach((uzel) => {
          if (uzel.nodeType === Node.TEXT_NODE) {
            docasny.appendChild(uzel.cloneNode(true));
            return;
          }
          if (uzel.nodeType !== Node.ELEMENT_NODE) return;
          const tag = uzel.tagName.toLowerCase();
          if (tag === "figure" || tag === "img") {
            const obrazek = vytvorObrazkovyBlokZHtml(uzel, nepodporovane);
            if (obrazek) obrazky.push(obrazek);
            return;
          }
          if (tag === "div" && (uzel.dataset?.bulletMediaLine === "true" || uzel.classList?.contains("lubaNoteBulletImageTextLine"))) {
            if (String(uzel.textContent || "").length) {
              docasny.appendChild(document.createElement("br"));
              Array.from(uzel.childNodes).forEach((dite) => {
                if (dite.nodeType === Node.ELEMENT_NODE && dite.tagName?.toLowerCase() === "br") return;
                docasny.appendChild(dite.cloneNode(true));
              });
            }
            return;
          }
          if (tag === "p" || tag === "div") {
            if (docasny.childNodes.length) docasny.appendChild(document.createElement("br"));
            Array.from(uzel.childNodes).forEach((dite) => docasny.appendChild(dite.cloneNode(true)));
            return;
          }
          if (!povoleneInline.has(tag)) {
            nepodporovane.add(`${tag} v TODO`);
            return;
          }
          docasny.appendChild(uzel.cloneNode(true));
        });
        importujInlineUzly(docasny, VYCHOZI_FORMAT, obsah, nepodporovane);
      }

      if (!obsah.length) obsah.push(vytvorSegment(String(todo?.text || ""), VYCHOZI_FORMAT));
      const blok = vytvorTodoZObsahu(obsah, todo?.completed === true, "left");
      blok.obrazky = obrazky;
      blok.zvyrazneni = String(todo?.highlightColor || "");
      if (todo?.id) blok.id = String(todo.id);
      bloky.push(blok);
    });

    if (nepodporovane.size) {
      return { ok: false, nepodporovane: Array.from(nepodporovane).sort(), model: null };
    }
    if (!bloky.length) bloky.push(vytvorTodoZObsahu([vytvorSegment("")], false, "left"));
    return {
      ok: true,
      nepodporovane: [],
      model: {
        verze: VERZE_MODELU,
        typ: "lubanote-dokument",
        nastaveni: { zakladniVelikost: zjistiZakladniVelikost() },
        bloky
      }
    };
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
    const inlineTagy = new Set(["span", "font", "b", "strong", "i", "em", "u", "mark", "a", "code"]);

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

      if (uzel.dataset?.lubanoteV2Todo === "true") {
        flushRootInline();
        importujTodoElementDoModelu(uzel, bloky, nepodporovane);
        return;
      }

      if (
        (tag === "figure" && Boolean(uzel.querySelector("img")))
        || tag === "img"
      ) {
        flushRootInline();
        const obrazek = vytvorObrazkovyBlokZHtml(uzel, nepodporovane);
        if (obrazek) bloky.push(obrazek);
        return;
      }

      if (tag === "blockquote" || tag === "pre") {
        flushRootInline();
        const obsah = [];
        const format = kopieFormatu(VYCHOZI_FORMAT);
        if (tag === "pre") format.kod = true;
        importujInlineUzly(uzel, format, obsah, nepodporovane);
        const blok = vytvorOdstavecZObsahu(obsah, normalizujZarovnani(uzel.style?.textAlign || uzel.getAttribute("align")));
        if (tag === "blockquote") blok.legacyBlockquote = true;
        if (tag === "pre") blok.legacyPre = true;
        bloky.push(blok);
        return;
      }

      if (tag === "hr") {
        flushRootInline();
        const blok = vytvorOdstavec("");
        blok.legacyHr = true;
        bloky.push(blok);
        return;
      }

      if (tag === "br") {
        flushRootInline();
        bloky.push(vytvorOdstavec(""));
        return;
      }

      if (inlineTagy.has(tag)) {
        if (tag === "a") {
          const jeInterni = uzel.classList.contains("noteInternalLink") || uzel.hasAttribute("data-note-id");
          const jePlan = uzel.classList.contains("plannedTextLink") || uzel.hasAttribute("data-planned-item-id");
          const href = normalizujInternetovouAdresu(uzel.getAttribute("href"));
          if (!jeInterni && !jePlan && !href) {
            nepodporovane.add("a[href]");
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

      const blokovyFormat = kopieFormatu(VYCHOZI_FORMAT);
      if (["h1", "h2", "h3"].includes(tag)) blokovyFormat.stylTextu = tag;

      /*
       * Legacy poznámky mohou mít obrázek zabalený uvnitř DIV/P wrapperu.
       * V2.21 původně uměl FIGURE jen na root úrovni, takže takový wrapper
       * skončil ve fallbacku „figure“. Rozdělíme wrapper v pořadí
       * text -> obrázek -> text a každý obrázek převedeme na V2 Image Block.
       */
      if (uzel.querySelector?.("figure, img")) {
        importujWrapperSObrazkyDoModelu(
          uzel,
          bloky,
          nepodporovane,
          blokovyFormat
        );
        return;
      }

      const obsah = [];
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
      const puvodniText = String(cast?.text ?? "");
      if (!puvodniText) return;
      const format = kopieFormatu(cast?.format);
      const interniId = normalizujIdOdkazu(format.interniOdkazId);
      const planId = normalizujIdOdkazu(format.planOdkazId);
      const text = interniId
        ? ziskejNazevPoznamkyProInterniOdkaz(interniId, format.interniOdkazNazev || puvodniText)
        : puvodniText;
      const maFormat = Boolean(
        format.tucne || format.kurziva || format.podtrzeni ||
        format.velikost !== null || format.barva || format.pozadi || format.stylTextu || format.odkaz ||
        format.kod || interniId || planId
      );
      if (!maFormat) {
        cil.appendChild(document.createTextNode(text));
        return;
      }

      let inline;
      if (interniId) {
        inline = document.createElement("span");
        inline.classList.add("noteInternalLink");
        inline.dataset.noteId = interniId;
        inline.dataset.noteTitle = text;
        inline.setAttribute("contenteditable", "false");
        inline.setAttribute("role", "link");
        inline.setAttribute("aria-label", `Interní odkaz na poznámku ${text}`);
      } else if (format.odkaz) {
        inline = document.createElement("a");
        inline.classList.add("lubaNoteInternetLink");
        inline.dataset.lubanoteLink = "true";
        inline.href = format.odkaz;
        inline.target = "_blank";
        inline.rel = "noopener noreferrer";
      } else if (format.kod) {
        inline = document.createElement("code");
      } else {
        inline = document.createElement("span");
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

      if (planId) {
        const plan = document.createElement("span");
        plan.className = "plannedTextLink";
        plan.dataset.plannedItemId = planId;
        plan.setAttribute("aria-label", "Otevřít naplánovaný úkol");
        if (jePlanovanaPolozkaDokoncena(planId)) plan.classList.add("plannedTextLinkCompleted");
        plan.appendChild(inline);
        cil.appendChild(plan);
      } else {
        cil.appendChild(inline);
      }
    });
  }

  function vytvorExportFigureObrazku(blok, jeVSeznamu = false) {
    const figure = document.createElement("figure");
    figure.className = "lubaNoteImage";
    figure.dataset.lubanoteImage = "true";
    if (jeVSeznamu) figure.dataset.bulletMedia = "true";
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
    return figure;
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
        stack.push({ typ, seznam, posledniLi: null, posledniBlok: null });
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
        if (rodic.posledniBlok?.sbaleno) seznam.hidden = true;
        rodic.posledniLi.appendChild(seznam);
        stack.push({ typ, seznam, posledniLi: null, posledniBlok: null });
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
            if (rodic.posledniBlok?.sbaleno) seznam.hidden = true;
            rodic.posledniLi.appendChild(seznam);
          }
        }
        stack.length = uroven;
        stack.push({ typ, seznam, posledniLi: null, posledniBlok: null });
        aktualni = stack[uroven];
      }

      const li = document.createElement("li");
      const zarovnani = normalizujZarovnani(blok.zarovnani);
      if (zarovnani !== "left") li.style.textAlign = zarovnani;
      if (blok.sbaleno) li.classList.add("bulletSbaleny");
      vlozSegmentyDoExportElementu(li, blok);
      if (Array.isArray(blok.obrazky) && blok.obrazky.length) {
        blok.obrazky.forEach((obrazek) => li.appendChild(vytvorExportFigureObrazku(obrazek, true)));
        const radekZa = document.createElement("div");
        radekZa.className = "lubaNoteImageBelowLine lubaNoteBulletImageTextLine";
        radekZa.dataset.bulletMediaLine = "true";
        radekZa.appendChild(document.createElement("br"));
        li.appendChild(radekZa);
      }
      aktualni.seznam.appendChild(li);
      aktualni.posledniLi = li;
      aktualni.posledniBlok = blok;
    });
  }

  function exportujTodosZModelu(doc = dokument) {
    const vysledek = [];
    (Array.isArray(doc?.bloky) ? doc.bloky : []).forEach((blok) => {
      if (!jeTodoBlok(blok)) return;
      const obal = document.createElement("div");
      vlozSegmentyDoExportElementu(obal, blok);
      if (obal.children.length === 1 && obal.firstElementChild?.tagName === "BR") obal.innerHTML = "";
      if (Array.isArray(blok.obrazky)) {
        blok.obrazky.forEach((obrazek) => obal.appendChild(vytvorExportFigureObrazku(obrazek, true)));
      }
      vysledek.push({
        id: blok.id,
        text: textBloku(blok),
        html: obal.innerHTML,
        completed: blok.hotovo === true,
        highlightColor: String(blok.zvyrazneni || "")
      });
    });
    return vysledek;
  }

  function exportujHtmlZModelu(doc = dokument) {
    const obal = document.createElement("div");
    const bloky = Array.isArray(doc?.bloky) ? doc.bloky : [];

    for (let index = 0; index < bloky.length; index += 1) {
      const blok = bloky[index];

      if (jeTodoBlok(blok)) {
        const radek = document.createElement("div");
        radek.dataset.lubanoteV2Todo = "true";
        radek.dataset.todoId = blok.id;
        radek.dataset.completed = blok.hotovo ? "true" : "false";
        if (blok.zvyrazneni) radek.dataset.highlightColor = String(blok.zvyrazneni);
        vlozSegmentyDoExportElementu(radek, blok);
        if (Array.isArray(blok.obrazky)) blok.obrazky.forEach((obrazek) => radek.appendChild(vytvorExportFigureObrazku(obrazek, true)));
        obal.appendChild(radek);
        continue;
      }

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
        obal.appendChild(vytvorExportFigureObrazku(blok, false));
        continue;
      }

      if (blok.legacyHr === true && !textBloku(blok).trim()) {
        obal.appendChild(document.createElement("hr"));
        continue;
      }

      const tagRadku = blok.legacyPre === true
        ? "pre"
        : (blok.legacyBlockquote === true ? "blockquote" : "div");
      const radek = document.createElement(tagRadku);
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

    /* LubaKeyboard musí mít možnost potlačit systémové IME ještě PŘED
       prvním focusem editoru. Tím starý Android ani iOS nestihne otevřít
       vlastní klávesnici mezi vytvořením editoru a MutationObserverem. */
    window.LubaNoteKeyboard?.pripravEditor?.(editor);

    editor.focus({ preventScroll: true });
    return true;
  }

  function zavriVHostu() {
    if (!lab || !vlozenyRezim) return;
    zrusV2DragSeznamu();

    /* PATCH 442 – LubaKeyboard žije mimo DOM editoru (přímo v body).
       Při uložení/zavření V2 hostu ji proto zavřeme výslovně, jinak by po
       zmizení editoru mohla zůstat viset nad seznamem poznámek. */
    window.LubaNoteKeyboard?.skryj?.();

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
      seznam: stavSeznamuVeVyberu(vyber),
      todo: stavTodoVeVyberu(vyber)
    };
  }

  function vytvorLab() {
    lab = document.createElement("section");
    lab.id = "ln-editor-v2-lab";
    lab.className = "ln-v2-lab";
    lab.innerHTML = `
      <header class="ln-v2-hlavicka">
        <div>
          <strong>Editor Core V2.16 · LAB</strong>
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
        V2.16: kompletní modelový TODO systém – checkbox, Hotovo, Enter/Backspace, rich text, obrázek, long-press drag, Undo/Redo a import existujících TODO. Planner zůstává v TEST režimu záměrně odpojený.
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
      zrusVyberMoveSeznamuPokudMimo(event.target);
      const radek = event.target.closest?.(".ln-v2-odstavec.ln-v2-bullet, .ln-v2-odstavec.ln-v2-ordered, .ln-v2-odstavec.ln-v2-todo");
      if (!radek || !editor.contains(radek) || jePrvekMimoV2SeznamMove(event.target)) return;
      const dotyk = event.touches[0];
      pripravV2LongPressSeznamu(
        "touch", radek, dotyk.clientX, dotyk.clientY, null, dotyk.identifier, false
      );
    }, { passive: false });

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
    poslouchej(document, "touchmove", zpracujV2ListTouchMove, { passive: false });
    poslouchej(document, "touchend", zpracujV2ListTouchEnd, { passive: false });
    poslouchej(document, "touchcancel", () => zrusV2DragSeznamu({ zachovatVyber: true }), { passive: false });

    poslouchej(editor, "pointerdown", (event) => {
      if (event.pointerType === "touch") return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      zrusVyberMoveSeznamuPokudMimo(event.target);
      const radek = event.target.closest?.(".ln-v2-odstavec.ln-v2-bullet, .ln-v2-odstavec.ln-v2-ordered, .ln-v2-odstavec.ln-v2-todo");
      if (!radek || !editor.contains(radek) || jePrvekMimoV2SeznamMove(event.target)) return;
      /* Desktop pointer zachovává klik na značku pro sbalení větve; mobilní
         touch má odladěný long-press kdekoliv na řádku. */
      if (jeV2KlikNaZnacceSeznamu(radek, event.clientX, false)) return;
      pripravV2LongPressSeznamu("pointer", radek, event.clientX, event.clientY, event.pointerId, null, false);
    });

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
    poslouchej(document, "pointermove", zpracujV2ListPointerMove, { passive: false });
    poslouchej(document, "pointerup", zpracujV2ListPointerEnd, { passive: false });
    poslouchej(document, "pointercancel", (event) => {
      if (v2DragSeznamu?.typ === "pointer" && v2DragSeznamu.pointerId === event.pointerId) {
        zrusV2DragSeznamu({ zachovatVyber: true });
      }
    });

    poslouchej(editor, "dragstart", (event) => {
      if (event.target.closest?.(".ln-v2-obrazek")) event.preventDefault();
    });

    poslouchej(editor, "contextmenu", (event) => {
      const seznamRadek = event.target.closest?.(".ln-v2-odstavec.ln-v2-bullet, .ln-v2-odstavec.ln-v2-ordered, .ln-v2-odstavec.ln-v2-todo");
      if (seznamRadek && (v2DragSeznamu?.radek === seznamRadek || vybranaPolozkaSeznamuId === seznamRadek.dataset.lnV2Blok)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (!event.target.closest?.(".ln-v2-obrazek")) return;
      event.preventDefault();
      event.stopPropagation();
    });

    poslouchej(editor, "click", (event) => {
      const seznamRadek = event.target.closest?.(".ln-v2-odstavec.ln-v2-bullet, .ln-v2-odstavec.ln-v2-ordered, .ln-v2-odstavec.ln-v2-todo");
      if (seznamRadek && editor.contains(seznamRadek) && performance.now() < potlacKlikSeznamuDo) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const todoCheckbox = event.target.closest?.("[data-v2-todo-check]");
      if (todoCheckbox && editor.contains(todoCheckbox)) {
        event.preventDefault();
        event.stopPropagation();
        prepniTodoHotovo(todoCheckbox.dataset.v2TodoCheck);
        return;
      }

      if (seznamRadek && editor.contains(seznamRadek)) {
        const indexSeznamu = najdiIndexBlokuPodleId(seznamRadek.dataset.lnV2Blok || "");
        if (indexSeznamu >= 0 && jeSeznamovyBlok(dokument.bloky[indexSeznamu]) && jeV2KlikNaZnacceSeznamu(seznamRadek, event.clientX, true)) {
          const index = indexSeznamu;
          if (index >= 0 && maPolozkaSeznamuDeti(index)) {
            event.preventDefault();
            event.stopPropagation();
            prepniSbaleniSeznamuPodleId(seznamRadek.dataset.lnV2Blok);
            return;
          }
        }
        if (vybranaPolozkaSeznamuId === seznamRadek.dataset.lnV2Blok) {
          event.preventDefault();
          return;
        }
      }
      if (performance.now() < potlacKlikV2ObrazkuDo && event.target.closest?.(".ln-v2-obrazek")) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const smazat = event.target.closest?.("[data-v2-image-remove]");
      if (smazat) {
        event.preventDefault();
        event.stopPropagation();
        posledniTapV2Obrazku = null;
        smazObrazekZModelu(smazat.dataset.v2ImageRemove);
        return;
      }

      const figure = event.target.closest?.(".ln-v2-obrazek[data-ln-v2-obrazek]");
      if (!figure || !editor.contains(figure)) {
        posledniTapV2Obrazku = null;
        return;
      }

      const obrazek = event.target.closest?.(".ln-v2-obrazek img");

      if (obrazek) {
        const ted = performance.now();
        const id = figure.dataset.lnV2Obrazek || "";
        const predchozi = posledniTapV2Obrazku;
        const jeDvojtap = Boolean(
          predchozi &&
          predchozi.id === id &&
          ted - predchozi.cas <= DVOJTAP_V2_OBRAZKU_MS &&
          Math.hypot(
            event.clientX - predchozi.x,
            event.clientY - predchozi.y
          ) <= DVOJTAP_V2_OBRAZKU_VZDALENOST
        );

        if (jeDvojtap) {
          event.preventDefault();
          event.stopPropagation();
          posledniTapV2Obrazku = null;
          vybranyObrazekId = "";
          window.LubaNoteEditorMedia?.otevriNahledObrazku?.(obrazek);
          return;
        }

        posledniTapV2Obrazku = {
          id,
          cas: ted,
          x: event.clientX,
          y: event.clientY
        };
      } else {
        posledniTapV2Obrazku = null;
      }

      event.preventDefault();
      vybranyObrazekId = figure.dataset.lnV2Obrazek || "";
      figure.focus({ preventScroll: true });
      nastavStav("Obrázek V2 vybrán · 2× tap náhled · ⚙ nastavení · ✕ odstraní modelový blok");
    });

    poslouchej(editor, "compositionstart", (event) => {
      zapisV2ImeDiag("compositionstart", event);
      zacniV2ImeKompozici();
    });
    poslouchej(editor, "compositionupdate", (event) => {
      zapisV2ImeDiag("compositionupdate", event);
      const stav = zacniV2ImeKompozici();
      if (!stav?.nativni) {
        zkusNajitV2ImeRozsahZDat(event.data);
      }
    });
    poslouchej(editor, "compositionend", (event) => {
      zapisV2ImeDiag("compositionend", event);

      if (v2ImeKompozice?.nativni) {
        /*
         * DOM finální hodnotu potvrzuje WebView až v rámci stejného eventového
         * cyklu. Microtask mu nechá dokončit nativní commit a teprve potom
         * převádíme změnu zpět do modelu.
         */
        queueMicrotask(() => dokoncV2ImeKompozici("compositionend"));
        return;
      }

      // Modelový režim novějších WebView – fallback pro chybějící beforeinput.
      if (v2ImeKompozice?.aktivni && !v2ImeKompozice.zmeneno && event.data != null) {
        zkusNajitV2ImeRozsahZDat(event.data);
        aplikujV2ImeText(event.data, "insertCompositionText");
      }
      dokoncV2ImeKompozici("compositionend");
    });
    poslouchej(editor, "beforeinput", zpracujBeforeInput);
    poslouchej(editor, "paste", zpracujPaste);
    poslouchej(editor, "keydown", (event) => {
      if (event.key === "Tab") {
        const vyber = aktualniVyberModelu() || posledniVyber;
        const index = vyber?.konec?.blok ?? -1;
        if (index >= 0 && jeSeznamovyBlok(dokument?.bloky?.[index])) {
          event.preventDefault();
          zmenUrovenPodstromu(index, event.shiftKey ? -1 : 1, event.shiftKey ? "vysunout položku" : "zanořit položku");
          return;
        }
      }

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
    poslouchej(editor, "input", (event) => {
      zapisV2ImeDiag("input", event);
      if (v2ImeKompozice?.nativni) return;
      kontrolaDomu();
    });

    poslouchej(document, "selectionchange", () => {
      if (!lab || lab.hidden || !editor) return;
      if (v2ImeKompozice?.nativni) return;
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
      /* FIX 434: starý Android má během živé composition krátké povolené DOM
         okno. Model jej převezme atomicky při compositionend. */
      if (v2ImeKompozice?.nativni) return;
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
    zapisDebug?.("EDITOR V2 LAB | OPEN V2.16 COMPLETE TODO | produkční editor nedotčen");
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
    zrusV2DragSeznamu();
    v2DropIndicator?.remove();
    v2MoveHint?.remove();
    v2DropIndicator = null;
    v2MoveHint = null;
    v2ListDropIndicator?.remove();
    v2ListDragPreview?.remove();
    v2ListDropIndicator = null;
    v2ListDragPreview = null;
    v2ListAutoScrollRaf = null;
    vybranaPolozkaSeznamuId = "";
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
    v2ImeKompozice = null;
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
        if (typeof window.LubaNoteEditorV2Bridge?.prepniLegacyRezim === "function") {
          window.LubaNoteEditorV2Bridge.prepniLegacyRezim();
          return;
        }
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
    verze: "V2.21-MIXED-BLOCKS-399",
    otevriLab,
    otevriLabPrimo,
    zavriLab,
    znicLab,
    resetujTest,
    importujHtml: vytvorModelZHtml,
    importujTodos: vytvorModelZTodos,
    exportujHtml: () => exportujHtmlZModelu(),
    exportujTodos: () => exportujTodosZModelu(),
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
    pridejTodo: pridejTodoZToolbaru,
    prepniTodoHotovo,
    nastavStylTextu: nastavStylTextuZToolbaru,
    nastavOdkaz: nastavOdkazZToolbaru,
    ziskejInfoOdkazu,
    vlozInterniOdkazZAutocomplete,
    ziskejPlanovaciKontext,
    obalPlanovaciVyber,
    ziskejTextVyberuProSelectionMenu,
    ziskejRichVyberProSelectionMenu,
    sklapniVyberNaKonecProSelectionMenu,
    vyjmiVyberProSelectionMenu,
    vlozRichVyberProSelectionMenu,
    vlozTextProSelectionMenu,
    vyberVseProSelectionMenu,
    zrusVyberNaBoduProSelectionMenu,
    jeInterakcePresunuSeznamu: jeV2InterakcePresunuSeznamu,
    jeCilPresunuSeznamu: jeV2CilPresunuSeznamu,
    vlozObrazek: vlozObrazekZToolbaru,
    smazObrazek: smazObrazekZModelu,
    ziskejNastaveniObrazku,
    nastavOrezanyZdrojObrazku,
    nastavNastaveniObrazku,
    undo: vratHistoriiZpet,
    redo: vratHistoriiVpred,
    kontrolaDomu,
    ziskejStavFormatu,
    ziskejModel: () => (dokument ? structuredClone(dokument) : null),
    dokoncImePredExterniAkci,
    jeImeKompoziceAktivni: () => Boolean(v2ImeKompozice?.aktivni),
    provedPrikazVlastniKlavesnice,
    ziskejKontextVlastniKlavesnice,
    ziskejEditorElement: () => editor
  });
})();
