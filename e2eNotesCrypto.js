/* LubaNote 685B – priprava BEZPECNEHO CTENI E2E obalky v private Sync.
 * Zapis obsahu zustava legacy; pri cteni chraneneho cloudu se pripadny
 * plaintext re-upload stejneho ID zastavi. Zadne migrace ani DB zmeny.
 */
(() => {
  "use strict";

  const VERZE = 1;
  const DOMENA = "private-notes-v1";
  const PREFIX = "LubaNote-private-note-v1";
  const TEXT = new TextEncoder();
  const DEKODER = new TextDecoder("utf-8", { fatal: true });
  const MAX_BAJTU = 25 * 1024 * 1024;
  let posledniTestovanyKlic = null;
  let probihaTest = false;
  let posledniTest685B = null;
  let probihaTest685B = false;
  const chranenaCloudId = new Set();

  function chyba(kod, zprava) {
    const vysledek = new Error(zprava);
    vysledek.code = kod;
    return vysledek;
  }

  function overId(hodnota, nazev) {
    if (typeof hodnota !== "string" ||
        !/^[a-zA-Z0-9_-]{8,128}$/.test(hodnota)) {
      throw chyba("E2E_INVALID_ID", `Neplatne ${nazev}.`);
    }
    return hodnota;
  }

  function doBase64(bajty) {
    let retezec = "";
    for (let i = 0; i < bajty.length; i += 16384) {
      retezec += String.fromCharCode(...bajty.subarray(i, i + 16384));
    }
    return btoa(retezec);
  }

  function zBase64(retezec) {
    if (typeof retezec !== "string" ||
        retezec.length === 0 ||
        retezec.length > Math.ceil(MAX_BAJTU * 4 / 3) + 128 ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(retezec)) {
      throw chyba("E2E_INVALID_ENVELOPE", "Neplatne base64 sifrovane obalky.");
    }
    const binarni = atob(retezec);
    const bajty = new Uint8Array(binarni.length);
    for (let i = 0; i < binarni.length; i++) {
      bajty[i] = binarni.charCodeAt(i);
    }
    return bajty;
  }

  function vytvorAAD(userId, noteId, keyId) {
    return TEXT.encode(`${PREFIX}:${userId}:${noteId}:${keyId}`);
  }

  async function nactiKlic(userId) {
    const core = window.LubaNoteE2ECore;
    if (!core?.getStav || !core?.odvodDomenovyKlic) {
      throw chyba("E2E_CORE_MISSING", "E2E Core neni dostupny.");
    }
    let stav = core.getStav();
    if (stav?.ready !== true || stav.userId !== userId) {
      if (typeof core.pripravRootKlicProUcet !== "function") {
        throw chyba("E2E_ROOT_LOCKED", "E2E Root Key neni odemceny.");
      }
      stav = await core.pripravRootKlicProUcet(userId);
    }
    if (stav?.ready !== true || stav.userId !== userId || !stav.keyId) {
      throw chyba("E2E_ROOT_LOCKED", "E2E Root Key neni odemceny pro ucet.");
    }
    const klic = await core.odvodDomenovyKlic(DOMENA);
    const kontrola = core.getStav();
    if (kontrola?.ready !== true ||
        kontrola.userId !== userId ||
        kontrola.keyId !== stav.keyId) {
      throw chyba("E2E_ACCOUNT_CHANGED", "Pri sifrovani se zmenil ucet nebo klic.");
    }
    return { klic, keyId: stav.keyId };
  }

  function jeObalka(hodnota) {
    return Boolean(hodnota && typeof hodnota === "object" &&
      !Array.isArray(hodnota) && hodnota.__lubanoteE2ENote === true);
  }

  async function zasifruj(poznamka, userId) {
    if (!poznamka || typeof poznamka !== "object" ||
        Array.isArray(poznamka) || poznamka.isSecret === true ||
        jeObalka(poznamka)) {
      throw chyba("E2E_INVALID_NOTE", "Ocekavana bezna plaintext poznamka.");
    }
    const vlastnik = overId(userId, "user ID");
    const noteId = overId(poznamka.id, "note ID");
    const json = JSON.stringify(poznamka);
    if (!json) {
      throw chyba("E2E_INVALID_NOTE", "Poznamku nelze serializovat.");
    }
    const otevrenyText = TEXT.encode(json);
    if (otevrenyText.byteLength > MAX_BAJTU) {
      throw chyba("E2E_TOO_LARGE", "Poznamka presahuje limit E2E obalky.");
    }
    const { klic, keyId } = await nactiKlic(vlastnik);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new Uint8Array(await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: vytvorAAD(vlastnik, noteId, keyId), tagLength: 128 },
      klic,
      otevrenyText
    ));
    return {
      __lubanoteE2ENote: true,
      version: VERZE,
      algorithm: "AES-256-GCM",
      keyId,
      iv: doBase64(iv),
      ciphertext: doBase64(data)
    };
  }

  async function desifruj(obalka, userId, noteId) {
    const vlastnik = overId(userId, "user ID");
    const id = overId(noteId, "note ID");
    if (!jeObalka(obalka) || obalka.version !== VERZE ||
        obalka.algorithm !== "AES-256-GCM" ||
        typeof obalka.keyId !== "string" ||
        Object.keys(obalka).sort().join(",") !==
          "__lubanoteE2ENote,algorithm,ciphertext,iv,keyId,version") {
      throw chyba("E2E_INVALID_ENVELOPE", "Nepodporovana E2E obalka.");
    }
    const { klic, keyId } = await nactiKlic(vlastnik);
    if (obalka.keyId !== keyId) {
      throw chyba("E2E_WRONG_ROOT_KEY", "Obalka patri jinemu E2E Root Key.");
    }
    const iv = zBase64(obalka.iv);
    const data = zBase64(obalka.ciphertext);
    if (iv.length !== 12 || data.length < 16 || data.length > MAX_BAJTU + 16) {
      throw chyba("E2E_INVALID_ENVELOPE", "Nespravna delka IV nebo ciphertextu.");
    }
    let otevrenyText;
    try {
      otevrenyText = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv, additionalData: vytvorAAD(vlastnik, id, keyId), tagLength: 128 },
        klic,
        data
      );
    } catch (_error) {
      throw chyba("E2E_AUTH_FAILED", "Nelze overit pravost zasifrovane poznamky.");
    }
    let poznamka;
    try {
      poznamka = JSON.parse(DEKODER.decode(otevrenyText));
    } catch (_error) {
      throw chyba("E2E_INVALID_PAYLOAD", "Neplatny obsah desifrovane poznamky.");
    }
    if (!poznamka || typeof poznamka !== "object" ||
        Array.isArray(poznamka) || poznamka.id !== id ||
        poznamka.isSecret === true || jeObalka(poznamka)) {
      throw chyba("E2E_INVALID_PAYLOAD", "Nesouhlasi identita desifrovane poznamky.");
    }
    return poznamka;
  }

  /*
   * 685B: v serverovem JSONB se smi objevit E2E obalka.
   * Zasifrovana poznamka se NIKDY nesmi vydavat za beznou prazdnou
   * poznamku pri chybe klice, verze, identity ani autentizace.
   */
  function maRezervovanyE2EMarker(data) {
    return Boolean(data && typeof data === "object" &&
      !Array.isArray(data) &&
      Object.prototype.hasOwnProperty.call(data, "__lubanoteE2ENote"));
  }

  function jeChraneneCloudId(noteId) {
    return chranenaCloudId.has(String(noteId || ""));
  }

  /* 687C: potvrzeni E2E stavu po uspesnem sifrovanem zapisu nebo
   * po explicitnim DOWNGRADE_BLOCKED ze serveroveho guardu.
   * V pameti udrzime ID chranene i bez noveho cloud readu. */
  function oznacChraneneCloudIdPoGuardu(noteId) {
    chranenaCloudId.add(overId(String(noteId || ""), "note ID"));
  }

  async function pripravCloudRadkyProCteni(rows, userId) {
    if (!Array.isArray(rows)) {
      throw chyba("E2E_INVALID_ROWS", "Ocekavany seznam cloudovych radku.");
    }
    if (!rows.some(row => !row?.deleted_at && maRezervovanyE2EMarker(row?.data))) {
      return rows;
    }

    const vlastnik = overId(userId, "user ID");
    const vysledek = [];
    let pocetDesifrovanych = 0;

    for (const row of rows) {
      if (!row || row.deleted_at || !maRezervovanyE2EMarker(row.data)) {
        vysledek.push(row);
        continue;
      }
      const id = overId(row.id, "note ID");
      if (row.user_id != null && String(row.user_id) !== vlastnik) {
        throw chyba("E2E_OWNER_MISMATCH", "Cloudovy radek nepatri prihlasenemu uctu.");
      }
      /* Pred decryptem zablokovat downgradovaci zapis pro dane ID,
         a to i kdyz chybi klic nebo se overeni ciphertextu nezdari. */
      chranenaCloudId.add(id);
      /* Zaznam s markerem, ale chybnou/nepodporovanou obalkou
         MUSI skoncit chybou, nikdy plaintext fallbackem. */
      if (!jeObalka(row.data)) {
        throw chyba("E2E_INVALID_ENVELOPE", "Neplatny E2E marker poznámky.");
      }
      const poznamka = await desifruj(row.data, vlastnik, id);
      if (poznamka.id !== id || poznamka.isSecret === true) {
        throw chyba("E2E_INVALID_PAYLOAD", "Nesouhlasi identita poznamky.");
      }
      /* Jiz rozpoznanou E2E poznamku 685B NESMI zapsat zpet jako
         plaintext. Ochrana funguje i po pripadnem lokalnim editovani. */
      pocetDesifrovanych++;
      vysledek.push({ ...row, data: poznamka });
    }

    if (pocetDesifrovanych > 0) {
      window.LubaNoteStartupDiag?.zapis?.(
        "E2E", `685B CLOUD READ | decrypted=${pocetDesifrovanych} | write-guard=ON`
      );
    }
    return vysledek;
  }

  async function selfTestCloudRead(userId) {
    const vlastnik = overId(userId, "user ID");
    const id = "685B-self-test-note";
    const testovaci = { id, isSecret: false, title: "685B_ONLY_RAM", note: "685B_PAYLOAD" };
    const obalka = await zasifruj(testovaci, vlastnik);
    const normalni = { id: "685B-legacy-note", data: { id: "685B-legacy-note", note: "legacy" } };
    const vysledek = await pripravCloudRadkyProCteni([
      normalni, { id, user_id: vlastnik, data: obalka }
    ], vlastnik);
    if (vysledek.length !== 2 || vysledek[0] !== normalni ||
        JSON.stringify(vysledek[1].data) !== JSON.stringify(testovaci) ||
        !jeChraneneCloudId(id)) {
      throw chyba("E2E_READ_SELFTEST_FAILED", "Roundtrip cloud read selhal.");
    }
    let chyby = 0;
    for (const test of [
      { id: "other-note-id", user_id: vlastnik, data: obalka },
      { id, user_id: "other-account", data: obalka },
      { id, user_id: vlastnik, data: { ...obalka, ciphertext: obalka.ciphertext.slice(0, -4) + "AAAA" } },
      { id, user_id: vlastnik, data: { ...obalka, __lubanoteE2ENote: false } }
    ]) {
      try {
        await pripravCloudRadkyProCteni([test], vlastnik);
      } catch (_) {
        chyby++;
      }
    }
    if (chyby !== 4) {
      throw chyba("E2E_READ_SELFTEST_FAILED", "Neplatny cloudovy radek nebyl odmitnut.");
    }
    return { ok: true, module: "685B" };
  }

  async function selfTest(userId) {
    const vlastnik = overId(userId, "user ID");
    const id = "685A-self-test-note";
    const zkusebni = { id, isSecret: false, title: "E2E_CHECK_ONLY", note: "test", todos: [{ text: "x" }] };
    const obalka = await zasifruj(zkusebni, vlastnik);
    if (JSON.stringify(obalka).includes("E2E_CHECK_ONLY")) {
      throw chyba("E2E_PLAINTEXT_LEAK", "Obalka obsahuje plaintext.");
    }
    const zpet = await desifruj(obalka, vlastnik, id);
    if (JSON.stringify(zpet) !== JSON.stringify(zkusebni)) {
      throw chyba("E2E_ROUNDTRIP_FAILED", "E2E roundtrip selhal.");
    }
    return { ok: true, module: "685A", keyId: obalka.keyId };
  }

  /* Samotest pouze v RAM a v diagnostice. Zadne DB cteni/zapisy. */
  window.addEventListener("lubanote:e2e-core-state", (udalost) => {
    const stav = udalost?.detail;
    if (!stav?.ready || !stav.userId || !stav.keyId) return;
    const identita = `${stav.userId}:${stav.keyId}`;
    if (probihaTest || identita === posledniTestovanyKlic) return;
    probihaTest = true;
    void selfTest(stav.userId).then(() => {
      posledniTestovanyKlic = identita;
      window.LubaNoteStartupDiag?.zapis?.("E2E", "685A NOTES ENVELOPE SELF TEST PASS (RAM ONLY)");
    }).catch((error) => {
      window.LubaNoteStartupDiag?.zapis?.("E2E", `685A NOTES ENVELOPE SELF TEST FAIL | ${error.code || "unknown"}`);
    }).finally(() => { probihaTest = false; });
  });

  window.addEventListener("lubanote:e2e-core-state", (udalost) => {
    const stav = udalost?.detail;
    if (!stav?.ready || !stav.userId || !stav.keyId) return;
    const identita = `${stav.userId}:${stav.keyId}`;
    if (probihaTest685B || identita === posledniTest685B) return;
    probihaTest685B = true;
    void selfTestCloudRead(stav.userId).then(() => {
      posledniTest685B = identita;
      window.LubaNoteStartupDiag?.zapis?.("E2E", "685B CLOUD READ SELF TEST PASS (RAM ONLY)");
    }).catch((error) => {
      window.LubaNoteStartupDiag?.zapis?.("E2E", `685B CLOUD READ SELF TEST FAIL | ${error.code || "unknown"}`);
    }).finally(() => { probihaTest685B = false; });
  });

  window.LubaNoteNotesCrypto = Object.freeze({
    verze: "685D-PRIVATE-WRITE",
    jeObalka,
    maRezervovanyE2EMarker,
    jeChraneneCloudId,
    oznacChraneneCloudIdPoGuardu,
    zasifruj,
    desifruj,
    pripravCloudRadkyProCteni,
    selfTest,
    selfTestCloudRead
  });
})();
