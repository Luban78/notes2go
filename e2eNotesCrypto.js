/* LubaNote 685A – priprava E2E obalky bez zapojeni do Sync.
 * Tento modul NIC neposila, nezapisuje ani nemigruje. Zapojeni cteni,
 * zapisu, konfliktu a sdileni prijde az po samostatnem regresnim testu.
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
        typeof obalka.keyId !== "string") {
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

  window.LubaNoteNotesCrypto = Object.freeze({
    verze: "685A-PREPARATION",
    jeObalka,
    zasifruj,
    desifruj,
    selfTest
  });
})();
