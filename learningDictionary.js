/* ==============================================================
   LUBANOTE – VÝUKA JAZYKŮ / STUDIJNÍ SLOVNÍK (PATCH 658CQ)
   --------------------------------------------------------------
   - studijní slovník je oddělený od osobního slovníku LubaKeyboard,
   - podporované výukové jazyky kopírují produkční jazyky LubaKeyboard V1,
   - každý jazyk má vlastní balíček slovíček, trénink a statistiky,
   - překlad se řídí aktivním výukovým jazykem a jazykem aplikace,
   - slovíčka lze přidat z LubaReaderu, z poznámky i ručně,
   - nativní Android TTS používá locale aktivního výukového jazyka.
   ============================================================== */
(() => {
  'use strict';

  const OWNER_KEY = 'lubanoteLocalOwnerUserId';
  const STORAGE_PREFIX = 'lubanote_language_learning_v2:';
  const LEGACY_EN_STORAGE_PREFIX = 'lubanote_english_learning_v1:';
  const LANGUAGE_KEY_PREFIX = 'lubanote_language_learning_active_v1:';
  const SEED_KEY_PREFIX = 'lubanote_language_learning_seed_658cg:';
  const MIGRATION_KEY_PREFIX = 'lubanote_language_learning_migrated_en_v2:';
  const SEED_SYNC_MIGRATION_PREFIX = 'lubanote_language_learning_seed_sync_660b:';
  const MAX_ITEMS = 3000;
  const REVIEW_INTERVALS = [0, 1, 3, 7, 14, 30];

  const JAZYKY = Object.freeze({
    cs: { id: 'cs', nazev: 'Čeština', badge: 'CS', locale: 'cs-CZ' },
    sk: { id: 'sk', nazev: 'Slovenčina', badge: 'SK', locale: 'sk-SK' },
    en: { id: 'en', nazev: 'English', badge: 'EN', locale: 'en-US' },
    de: { id: 'de', nazev: 'Deutsch', badge: 'DE', locale: 'de-DE' },
    pl: { id: 'pl', nazev: 'Polski', badge: 'PL', locale: 'pl-PL' },
    es: { id: 'es', nazev: 'Español', badge: 'ES', locale: 'es-ES' }
  });
  const PORADI_JAZYKU = Object.freeze(['cs', 'sk', 'en', 'de', 'pl', 'es']);

  /* Testovací startovní sada – přesně 10 položek pro každý produkční jazyk.
     U cizích jazyků jsou překlady do češtiny; u češtiny do angličtiny,
     aby byla i česká sada skutečně použitelná k procvičování. */
  const TESTOVACI_SLOVA = Object.freeze({
    cs: [
      ['dům', 'house'], ['práce', 'work'], ['kniha', 'book'], ['čas', 'time'], ['rodina', 'family'],
      ['voda', 'water'], ['cesta', 'journey'], ['přítel', 'friend'], ['učit se', 'to learn'], ['rozumět', 'to understand']
    ],
    sk: [
      ['dom', 'dům'], ['práca', 'práce'], ['kniha', 'kniha'], ['čas', 'čas'], ['rodina', 'rodina'],
      ['voda', 'voda'], ['cesta', 'cesta'], ['priateľ', 'přítel'], ['učiť sa', 'učit se'], ['rozumieť', 'rozumět']
    ],
    en: [
      ['habit', 'zvyk'], ['difficult', 'obtížný'], ['improve', 'zlepšit'], ['effort', 'úsilí'], ['journey', 'cesta'],
      ['choose', 'vybrat'], ['remember', 'pamatovat si'], ['achieve', 'dosáhnout'], ['change', 'změna'], ['focus', 'soustředit se']
    ],
    de: [
      ['Gewohnheit', 'zvyk'], ['schwierig', 'obtížný'], ['verbessern', 'zlepšit'], ['Anstrengung', 'úsilí'], ['Reise', 'cesta'],
      ['wählen', 'vybrat'], ['erinnern', 'pamatovat si'], ['erreichen', 'dosáhnout'], ['Veränderung', 'změna'], ['konzentrieren', 'soustředit se']
    ],
    pl: [
      ['nawyk', 'zvyk'], ['trudny', 'obtížný'], ['poprawić', 'zlepšit'], ['wysiłek', 'úsilí'], ['podróż', 'cesta'],
      ['wybierać', 'vybrat'], ['pamiętać', 'pamatovat si'], ['osiągnąć', 'dosáhnout'], ['zmiana', 'změna'], ['skupiać się', 'soustředit se']
    ],
    es: [
      ['hábito', 'zvyk'], ['difícil', 'obtížný'], ['mejorar', 'zlepšit'], ['esfuerzo', 'úsilí'], ['viaje', 'cesta'],
      ['elegir', 'vybrat'], ['recordar', 'pamatovat si'], ['lograr', 'dosáhnout'], ['cambio', 'změna'], ['concentrarse', 'soustředit se']
    ]
  });

  const prvky = {};
  let aktivniTab = 'words';
  let aktivniJazyk = 'en';
  let aktivniKartaId = null;
  let prekladOdhalen = false;
  let trenink = null;
  let swipeStav = null;
  let swipeZamek = false;
  let potlacKlikDo = 0;
  let aktivniUtterance = null;
  let aktivniAudio = null;
  let audioContext = null;
  let dialogStav = null;
  let dialogAutoCloseTimer = null;
  const audioUrlCache = new Map();
  const audioUrlPromises = new Map();
  const audioBufferCache = new Map();
  const audioBufferPromises = new Map();

  function ownerId() {
    return String(localStorage.getItem(OWNER_KEY) || 'local').trim() || 'local';
  }

  function platnyJazyk(id) {
    const key = String(id || '').toLowerCase();
    return JAZYKY[key] ? key : 'en';
  }

  function storageKey(jazyk = aktivniJazyk) {
    return `${STORAGE_PREFIX}${ownerId()}:${platnyJazyk(jazyk)}`;
  }

  function languageKey() {
    return `${LANGUAGE_KEY_PREFIX}${ownerId()}`;
  }

  function seedKey() {
    return `${SEED_KEY_PREFIX}${ownerId()}`;
  }

  function migrationKey() {
    return `${MIGRATION_KEY_PREFIX}${ownerId()}`;
  }

  function seedSyncMigrationKey() {
    return `${SEED_SYNC_MIGRATION_PREFIX}${ownerId()}`;
  }

  function uid() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `learn-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function normalizujText(value, max = 200) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
  }

  function normalizujVyraz(value) {
    return normalizujText(value, 160)
      .replace(/^[\s“”„\"'‘’.,;:!?()[\]{}]+|[\s“”„\"'‘’.,;:!?()[\]{}]+$/g, '')
      .trim();
  }

  function zkratKontext(value, term = '', maxWords = 18, maxChars = 190) {
    const text = normalizujText(value, 1600);
    if (!text) return '';

    const termKey = normalizujVyraz(term).toLocaleLowerCase('cs-CZ');
    const sentences = text.match(/[^.!?…]+(?:[.!?…]+|$)/g)?.map((part) => part.trim()).filter(Boolean) || [text];
    let chosen = sentences.find((part) => termKey && part.toLocaleLowerCase('cs-CZ').includes(termKey)) || sentences[0] || text;
    chosen = normalizujText(chosen, 1200);

    const words = chosen.split(/\s+/).filter(Boolean);
    if (words.length <= maxWords && chosen.length <= maxChars) return chosen;

    let center = -1;
    if (termKey) {
      const lowerWords = words.map((word) => normalizujVyraz(word).toLocaleLowerCase('cs-CZ'));
      center = lowerWords.findIndex((word, index) => {
        if (word === termKey || word.includes(termKey) || termKey.includes(word)) return true;
        const phrase = normalizujVyraz(words.slice(index, index + 4).join(' ')).toLocaleLowerCase('cs-CZ');
        return phrase.includes(termKey);
      });
    }
    if (center < 0) center = Math.floor(words.length / 2);

    let start = Math.max(0, center - Math.floor(maxWords / 2));
    let end = Math.min(words.length, start + maxWords);
    start = Math.max(0, end - maxWords);
    let short = words.slice(start, end).join(' ');
    if (short.length > maxChars) short = short.slice(0, maxChars).trimEnd();
    if (start > 0) short = `…${short}`;
    if (end < words.length || short.length < chosen.length - 1) short = `${short}…`;
    return short;
  }

  function klicVyrazu(value, jazyk = aktivniJazyk) {
    const locale = JAZYKY[platnyJazyk(jazyk)]?.locale || 'en-US';
    return normalizujVyraz(value).toLocaleLowerCase(locale);
  }

  function jazykAplikace() {
    const app = String(window.LubaNoteI18n?.ziskejJazyk?.() || 'cs').toLowerCase();
    return JAZYKY[app] ? app : 'cs';
  }

  function prekladovyJazykPro(jazyk = aktivniJazyk) {
    const source = platnyJazyk(jazyk);
    const app = jazykAplikace();
    if (app !== source) return app;
    return source === 'en' ? 'cs' : 'en';
  }

  function jazykInfo(id = aktivniJazyk) {
    return JAZYKY[platnyJazyk(id)];
  }

  function popisJazykovehoSmeru(jazyk = aktivniJazyk, cil = prekladovyJazykPro(jazyk)) {
    const source = jazykInfo(jazyk);
    const target = jazykInfo(cil);
    return `${source.badge} ${source.nazev} → ${target.badge} ${target.nazev}`;
  }

  function parseItems(raw, jazyk = aktivniJazyk) {
    if (!Array.isArray(raw)) return [];
    const source = platnyJazyk(jazyk);
    return raw.map((item) => ({
      id: String(item?.id || uid()),
      language: platnyJazyk(item?.language || source),
      translationLanguage: platnyJazyk(item?.translationLanguage || prekladovyJazykPro(source)),
      term: normalizujVyraz(item?.term),
      translation: normalizujText(item?.translation, 240),
      context: normalizujText(item?.context, 480),
      bookTitle: normalizujText(item?.bookTitle, 180),
      chapterTitle: normalizujText(item?.chapterTitle, 180),
      sourceType: normalizujText(item?.sourceType, 40) || 'manual',
      createdAt: Number(item?.createdAt) || Date.now(),
      updatedAt: Number(item?.updatedAt) || Number(item?.createdAt) || Date.now(),
      level: Math.max(0, Math.min(5, Number(item?.level) || 0)),
      reviews: Math.max(0, Number(item?.reviews) || 0),
      correct: Math.max(0, Number(item?.correct) || 0),
      wrong: Math.max(0, Number(item?.wrong) || 0),
      nextReviewAt: Math.max(0, Number(item?.nextReviewAt) || 0),
      lastReviewedAt: Math.max(0, Number(item?.lastReviewedAt) || 0)
    })).filter((item) => item.term && item.translation);
  }

  function nacti(jazyk = aktivniJazyk) {
    try {
      const raw = JSON.parse(localStorage.getItem(storageKey(jazyk)) || '[]');
      return parseItems(raw, jazyk);
    } catch (_error) {
      return [];
    }
  }

  function uloz(items, jazyk = aktivniJazyk) {
    try {
      localStorage.setItem(storageKey(jazyk), JSON.stringify((items || []).slice(0, MAX_ITEMS)));
      return true;
    } catch (error) {
      console.warn('Výukový slovník se nepodařilo uložit:', error);
      return false;
    }
  }

  function migrujAnglickySlovnik() {
    if (localStorage.getItem(migrationKey()) === '1') return;

    const legacyKey = `${LEGACY_EN_STORAGE_PREFIX}${ownerId()}`;
    let legacy = [];
    try { legacy = JSON.parse(localStorage.getItem(legacyKey) || '[]'); } catch (_error) {}

    if (Array.isArray(legacy) && legacy.length) {
      const current = nacti('en');
      const existing = new Set(current.map((item) => klicVyrazu(item.term, 'en')));
      const merged = [...current];
      parseItems(legacy, 'en').forEach((item) => {
        const key = klicVyrazu(item.term, 'en');
        if (!key || existing.has(key)) return;
        existing.add(key);
        merged.push({ ...item, language: 'en', translationLanguage: 'cs', sourceType: item.sourceType || 'reader' });
      });
      if (merged.length !== current.length) uloz(merged, 'en');
    }

    // Migrace je jednorázová. Starý 658BZ/CF storage zůstává jen jako bezpečná záloha,
    // ale po smazání slovíčka už se nesmí při dalším startu znovu přidat.
    localStorage.setItem(migrationKey(), '1');
  }

  function stabilniSeedId(jazyk, term) {
    const source = platnyJazyk(jazyk);
    const key = klicVyrazu(term, source);
    return `seed:${source}:${key}`.slice(0, 160);
  }

  /* PATCH 660B – testovací sada musí mít na všech zařízeních stejné ID.
     Jinak by první cloudový bootstrap vytvořil stejné výrazy několikrát.
     U dosud netrénovaných seedů používáme stabilní čas 1, aby čerstvě
     vytvořený seed na novém zařízení nepřepsal starší skutečný pokrok
     stažený z cloudu. */
  function migrujSeedIdProSync() {
    if (localStorage.getItem(seedSyncMigrationKey()) === '1') return;

    PORADI_JAZYKU.forEach((jazyk) => {
      const allowed = new Map(
        (TESTOVACI_SLOVA[jazyk] || []).map(([term]) => [
          klicVyrazu(term, jazyk),
          stabilniSeedId(jazyk, term)
        ])
      );
      const items = nacti(jazyk);
      let zmena = false;
      const seen = new Set();
      const next = [];

      items.forEach((item) => {
        const key = klicVyrazu(item.term, jazyk);
        const stableId = item.sourceType === 'seed' ? allowed.get(key) : '';
        let copy = item;
        if (stableId) {
          copy = { ...item, id: stableId };
          const bezPokroku =
            Number(copy.reviews || 0) === 0 &&
            Number(copy.correct || 0) === 0 &&
            Number(copy.wrong || 0) === 0 &&
            Number(copy.level || 0) === 0 &&
            Number(copy.lastReviewedAt || 0) === 0;
          if (bezPokroku) {
            copy.createdAt = 1;
            copy.updatedAt = 1;
          }
          if (copy.id !== item.id || copy.createdAt !== item.createdAt || copy.updatedAt !== item.updatedAt) zmena = true;
        }

        const dedupeKey = `${copy.language}|${copy.id}`;
        if (seen.has(dedupeKey)) {
          zmena = true;
          return;
        }
        seen.add(dedupeKey);
        next.push(copy);
      });

      if (zmena) uloz(next, jazyk);
    });

    localStorage.setItem(seedSyncMigrationKey(), '1');
  }

  function vlozTestovaciSadu() {
    if (localStorage.getItem(seedKey()) === '1') return;

    PORADI_JAZYKU.forEach((jazyk) => {
      const items = nacti(jazyk);
      const existing = new Set(items.map((item) => klicVyrazu(item.term, jazyk)));
      const target = jazyk === 'cs' ? 'en' : 'cs';
      (TESTOVACI_SLOVA[jazyk] || []).forEach(([term, translation], index) => {
        const key = klicVyrazu(term, jazyk);
        if (!key || existing.has(key)) return;
        existing.add(key);
        items.push({
          id: stabilniSeedId(jazyk, term),
          language: jazyk,
          translationLanguage: target,
          term,
          translation,
          context: '',
          bookTitle: 'Testovací sada LubaNote',
          chapterTitle: '',
          sourceType: 'seed',
          createdAt: 1,
          updatedAt: 1,
          level: 0,
          reviews: 0,
          correct: 0,
          wrong: 0,
          nextReviewAt: 0,
          lastReviewedAt: 0
        });
      });
      uloz(items, jazyk);
    });

    localStorage.setItem(seedKey(), '1');
  }

  function oznamZmenu(detail = {}) {
    window.dispatchEvent(new CustomEvent('lubanote:learning-dictionary-change', {
      detail: { ownerId: ownerId(), language: detail.language || aktivniJazyk, source: 'local', ...detail }
    }));
  }

  function vse(jazyk = aktivniJazyk) {
    return nacti(jazyk).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  function najdiPodleVyrazu(term, jazyk = aktivniJazyk) {
    const source = platnyJazyk(jazyk);
    const key = klicVyrazu(term, source);
    if (!key) return null;
    return nacti(source).find((item) => klicVyrazu(item.term, source) === key) || null;
  }

  function ulozPolozku(vstup = {}) {
    const language = platnyJazyk(vstup.language || aktivniJazyk);
    const translationLanguage = platnyJazyk(vstup.translationLanguage || prekladovyJazykPro(language));
    const term = normalizujVyraz(vstup.term);
    const translation = normalizujText(vstup.translation, 240);
    if (!term || !translation) return { ok: false, reason: 'missing' };

    const items = nacti(language);
    const key = klicVyrazu(term, language);
    const index = items.findIndex((item) => klicVyrazu(item.term, language) === key);
    const now = Date.now();

    if (index >= 0) {
      items[index] = {
        ...items[index],
        language,
        translationLanguage,
        term,
        translation,
        context: zkratKontext(vstup.context || items[index].context, term),
        bookTitle: normalizujText(vstup.bookTitle || items[index].bookTitle, 180),
        chapterTitle: normalizujText(vstup.chapterTitle || items[index].chapterTitle, 180),
        sourceType: normalizujText(vstup.sourceType || items[index].sourceType, 40) || 'manual',
        updatedAt: now
      };
      if (!uloz(items, language)) return { ok: false, reason: 'storage' };
      oznamZmenu({ operation: 'update', id: items[index].id, language });
      return { ok: true, item: { ...items[index] }, updated: true };
    }

    const item = {
      id: uid(),
      language,
      translationLanguage,
      term,
      translation,
      context: zkratKontext(vstup.context, term),
      bookTitle: normalizujText(vstup.bookTitle, 180),
      chapterTitle: normalizujText(vstup.chapterTitle, 180),
      sourceType: normalizujText(vstup.sourceType, 40) || 'manual',
      createdAt: now,
      updatedAt: now,
      level: 0,
      reviews: 0,
      correct: 0,
      wrong: 0,
      nextReviewAt: 0,
      lastReviewedAt: 0
    };

    items.unshift(item);
    if (!uloz(items, language)) return { ok: false, reason: 'storage' };
    oznamZmenu({ operation: 'insert', id: item.id, language });
    return { ok: true, item: { ...item }, updated: false };
  }

  function smazPolozku(id, jazyk = aktivniJazyk) {
    const source = platnyJazyk(jazyk);
    const before = nacti(source);
    const after = before.filter((item) => item.id !== String(id || ''));
    if (after.length === before.length) return false;
    if (!uloz(after, source)) return false;
    if (source === aktivniJazyk && aktivniKartaId === id) aktivniKartaId = null;
    oznamZmenu({ operation: 'delete', id: String(id || ''), language: source });
    return true;
  }

  /* PATCH 660B – aplikuje serverové delta řádky přímo do lokálního
     studijního slovníku bez vytvoření nové lokální dirty změny. */
  function aplikujCloudoveZmenyProSync(rows = [], dirtyIds = []) {
    const dirty = new Set((Array.isArray(dirtyIds) ? dirtyIds : []).map((id) => String(id || '')));
    const cache = new Map();
    const touched = new Set();
    let changed = false;

    const itemsFor = (jazyk) => {
      const source = platnyJazyk(jazyk);
      if (!cache.has(source)) cache.set(source, nacti(source));
      return cache.get(source);
    };

    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const id = String(row?.item_id || row?.itemId || '').trim();
      const language = platnyJazyk(row?.language || 'en');
      if (!id || dirty.has(id)) return;

      const items = itemsFor(language);
      const index = items.findIndex((item) => item.id === id);
      if (row?.deleted === true) {
        if (index >= 0) {
          items.splice(index, 1);
          if (aktivniKartaId === id) aktivniKartaId = null;
          changed = true;
          touched.add(language);
        }
        return;
      }

      const remote = {
        id,
        language,
        translationLanguage: platnyJazyk(row?.translation_language || row?.translationLanguage || prekladovyJazykPro(language)),
        term: normalizujVyraz(row?.term),
        translation: normalizujText(row?.translation, 240),
        context: normalizujText(row?.context, 480),
        bookTitle: normalizujText(row?.book_title ?? row?.bookTitle, 180),
        chapterTitle: normalizujText(row?.chapter_title ?? row?.chapterTitle, 180),
        sourceType: normalizujText(row?.source_type ?? row?.sourceType, 40) || 'manual',
        createdAt: Math.max(0, Number(row?.created_at_ms ?? row?.createdAt) || 0),
        updatedAt: Math.max(0, Number(row?.client_updated_at_ms ?? row?.updatedAt) || 0),
        level: Math.max(0, Math.min(5, Number(row?.level) || 0)),
        reviews: Math.max(0, Number(row?.reviews) || 0),
        correct: Math.max(0, Number(row?.correct) || 0),
        wrong: Math.max(0, Number(row?.wrong) || 0),
        nextReviewAt: Math.max(0, Number(row?.next_review_at_ms ?? row?.nextReviewAt) || 0),
        lastReviewedAt: Math.max(0, Number(row?.last_reviewed_at_ms ?? row?.lastReviewedAt) || 0)
      };

      if (!remote.term || !remote.translation) return;

      if (index >= 0) items[index] = remote;
      else items.push(remote);
      changed = true;
      touched.add(language);
    });

    touched.forEach((jazyk) => uloz(cache.get(jazyk), jazyk));
    if (changed) oznamZmenu({ operation: 'cloud-apply', source: 'cloud' });
    return changed;
  }

  function bezpecnePrevedHtmlEntity(text) {
    const el = document.createElement('textarea');
    el.innerHTML = String(text || '');
    return el.value;
  }

  async function preloz(text, sourceLanguage = aktivniJazyk, targetLanguage = prekladovyJazykPro(sourceLanguage)) {
    const vyraz = normalizujVyraz(text);
    const source = platnyJazyk(sourceLanguage);
    const target = platnyJazyk(targetLanguage);
    if (!vyraz) return { ok: false, error: 'Vyber slovo nebo frázi.' };
    if (vyraz.length > 160) return { ok: false, error: 'Pro překlad vyber kratší slovo nebo frázi.' };
    if (source === target) return { ok: false, error: 'Zdrojový a cílový jazyk musí být rozdílný.' };
    if (navigator.onLine === false) return { ok: false, error: 'Překlad potřebuje připojení k internetu.' };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    try {
      const pair = `${source}|${target}`;
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(vyraz)}&langpair=${encodeURIComponent(pair)}`;
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'omit',
        cache: 'no-store',
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const translated = normalizujText(
        bezpecnePrevedHtmlEntity(data?.responseData?.translatedText || ''),
        240
      );
      if (!translated || translated.toLocaleLowerCase(JAZYKY[target].locale) === vyraz.toLocaleLowerCase(JAZYKY[source].locale)) {
        return { ok: false, error: 'Automatický překlad se nepodařilo získat. Překlad můžeš dopsat ručně.' };
      }
      return { ok: true, translation: translated, sourceLanguage: source, targetLanguage: target };
    } catch (_error) {
      const offline = navigator.onLine === false;
      return {
        ok: false,
        error: offline
          ? 'Překlad potřebuje připojení k internetu.'
          : 'Online překlad teď není dostupný. Překlad můžeš dopsat ručně.'
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async function prelozEnCs(text) {
    return preloz(text, 'en', 'cs');
  }

  function hlasProJazyk(jazyk = aktivniJazyk) {
    try {
      const source = platnyJazyk(jazyk);
      const locale = JAZYKY[source].locale;
      const voices = window.speechSynthesis?.getVoices?.() || [];
      return voices.find((voice) => String(voice.lang || '').toLowerCase() === locale.toLowerCase())
        || voices.find((voice) => String(voice.lang || '').toLowerCase().startsWith(`${source}-`))
        || voices.find((voice) => String(voice.lang || '').toLowerCase() === source)
        || null;
    } catch (_error) {
      return null;
    }
  }

  async function najdiAudioUrlSlova(slovo) {
    const key = normalizujVyraz(slovo).toLocaleLowerCase('en-US');
    if (!key || /\s/.test(key)) return '';
    if (audioUrlCache.has(key)) return audioUrlCache.get(key) || '';
    if (audioUrlPromises.has(key)) return audioUrlPromises.get(key);

    const promise = (async () => {
      try {
        const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(key)}`, {
          method: 'GET',
          credentials: 'omit',
          cache: 'force-cache'
        });
        if (!response.ok) {
          audioUrlCache.set(key, '');
          return '';
        }
        const data = await response.json();
        const entries = Array.isArray(data) ? data : [];
        const urls = entries.flatMap((entry) => Array.isArray(entry?.phonetics) ? entry.phonetics : [])
          .map((phonetic) => String(phonetic?.audio || '').trim())
          .filter(Boolean);
        const preferred = urls.find((url) => /-uk\.|_uk\.|-gb\.|_gb\./i.test(url)) || urls[0] || '';
        const url = preferred.startsWith('//') ? `https:${preferred}` : preferred;
        audioUrlCache.set(key, url);
        return url;
      } catch (_error) {
        audioUrlCache.set(key, '');
        return '';
      } finally {
        audioUrlPromises.delete(key);
      }
    })();

    audioUrlPromises.set(key, promise);
    return promise;
  }

  function pripravVyslovnost(text, jazyk = aktivniJazyk) {
    if (platnyJazyk(jazyk) !== 'en') return;
    const slova = normalizujVyraz(text).match(/[A-Za-z]+(?:['’\-][A-Za-z]+)*/g) || [];
    slova.slice(0, 8).forEach((slovo) => { void najdiAudioUrlSlova(slovo); });
  }

  function odemkniAudioContext() {
    try {
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextCtor) return null;
      if (!audioContext || audioContext.state === 'closed') audioContext = new AudioContextCtor();
      if (audioContext.state === 'suspended') {
        const resumePromise = audioContext.resume();
        if (resumePromise?.catch) resumePromise.catch(() => {});
      }
      return audioContext;
    } catch (_error) {
      return null;
    }
  }

  async function nactiAudioBuffer(url) {
    const key = String(url || '').trim();
    if (!key) return null;
    if (audioBufferCache.has(key)) return audioBufferCache.get(key) || null;
    if (audioBufferPromises.has(key)) return audioBufferPromises.get(key);

    const promise = (async () => {
      try {
        const ctx = audioContext || odemkniAudioContext();
        if (!ctx) return null;
        const response = await fetch(key, {
          method: 'GET',
          credentials: 'omit',
          cache: 'force-cache',
          mode: 'cors'
        });
        if (!response.ok) return null;
        const bytes = await response.arrayBuffer();
        const buffer = await ctx.decodeAudioData(bytes.slice(0));
        audioBufferCache.set(key, buffer);
        return buffer;
      } catch (error) {
        console.warn('[LubaNote English] WebAudio decode selhal:', error);
        return null;
      } finally {
        audioBufferPromises.delete(key);
      }
    })();

    audioBufferPromises.set(key, promise);
    return promise;
  }

  async function prehrajPresWebAudio(urls) {
    const seznam = (urls || []).filter(Boolean);
    const ctx = audioContext || odemkniAudioContext();
    if (!ctx || !seznam.length) return false;

    try {
      if (ctx.state === 'suspended') await ctx.resume();
      const buffers = (await Promise.all(seznam.map(nactiAudioBuffer))).filter(Boolean);
      if (!buffers.length) return false;

      let startAt = ctx.currentTime + 0.025;
      let posledniKonec = startAt;
      for (const buffer of buffers) {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(startAt);
        posledniKonec = startAt + buffer.duration;
        startAt = posledniKonec + 0.055;
      }

      await new Promise((resolve) => {
        const delay = Math.max(40, Math.ceil((posledniKonec - ctx.currentTime) * 1000) + 40);
        setTimeout(resolve, delay);
      });
      return true;
    } catch (error) {
      console.warn('[LubaNote English] WebAudio playback selhal:', error);
      return false;
    }
  }

  async function prehrajAudioUrlSekvenci(urls) {
    const seznam = (urls || []).filter(Boolean);
    if (!seznam.length) return false;

    // Primárně používáme Web Audio. AudioContext je odemčen přímo tapnutím na 🔊,
    // takže skutečný zvuk může začít i po asynchronním stažení MP3 bez blokace autoplay.
    if (await prehrajPresWebAudio(seznam)) return true;

    // Záloha pro prohlížeče/WebView bez použitelného Web Audio.
    try {
      aktivniAudio?.pause?.();
      for (const url of seznam) {
        await new Promise((resolve) => {
          const audio = aktivniAudio || new Audio();
          aktivniAudio = audio;
          audio.preload = 'auto';
          audio.onended = resolve;
          audio.onerror = resolve;
          audio.src = url;
          audio.currentTime = 0;
          const promise = audio.play();
          if (promise?.catch) promise.catch(resolve);
        });
      }
      aktivniAudio = null;
      return true;
    } catch (_error) {
      aktivniAudio = null;
      return false;
    }
  }

  async function prehrajAudioFallback(text) {
    const slova = normalizujVyraz(text).match(/[A-Za-z]+(?:['’\-][A-Za-z]+)*/g) || [];
    if (!slova.length) return false;
    const urls = await Promise.all(slova.slice(0, 8).map(najdiAudioUrlSlova));
    // Když pro některé slovo výslovnost chybí, přehrajeme dostupná slova;
    // u běžných anglických výrazů dictionaryapi vrací audio pro většinu položek.
    return prehrajAudioUrlSekvenci(urls.filter(Boolean));
  }

  function signalizujVyslovnost(button, stav = 'start') {
    if (!button) return;
    clearTimeout(button._learningSpeakTimer);
    button.classList.toggle('is-speaking', stav === 'start');
    button.classList.toggle('is-unavailable', stav === 'error');
    button.textContent = stav === 'error' ? '🔇' : '🔊';
    if (stav !== 'start') {
      button._learningSpeakTimer = setTimeout(() => {
        button.classList.remove('is-speaking', 'is-unavailable');
        button.textContent = '🔊';
      }, stav === 'error' ? 1100 : 350);
    }
  }

  function zkusSpeechSynthesis(vyraz, button = null, jazyk = aktivniJazyk) {
    const synth = window.speechSynthesis;
    if (!synth || typeof SpeechSynthesisUtterance !== 'function') return false;

    try {
      const source = platnyJazyk(jazyk);
      synth.cancel();
      synth.resume?.();
      const utterance = new SpeechSynthesisUtterance(vyraz);
      aktivniUtterance = utterance;
      const voice = hlasProJazyk(source);
      utterance.lang = voice?.lang || JAZYKY[source].locale;
      if (voice) utterance.voice = voice;
      utterance.rate = 0.9;
      utterance.pitch = 1;
      utterance.volume = 1;
      utterance.onstart = () => signalizujVyslovnost(button, 'start');
      utterance.onend = () => {
        if (aktivniUtterance === utterance) aktivniUtterance = null;
        signalizujVyslovnost(button, 'done');
      };
      utterance.onerror = () => {
        if (aktivniUtterance === utterance) aktivniUtterance = null;
        signalizujVyslovnost(button, 'error');
      };
      synth.speak(utterance);
      return true;
    } catch (_error) {
      return false;
    }
  }

  async function diagnostickyZvuk(button = null) {
    signalizujVyslovnost(button, 'start');
    try {
      const ctx = odemkniAudioContext();
      if (!ctx) throw new Error('AudioContext není dostupný');
      if (ctx.state === 'suspended') await ctx.resume();

      // Čistě lokální tón: žádný internet, TTS ani MP3. Ověří samotný audio výstup APK/WebView.
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(660, ctx.currentTime);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.32);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.34);
      oscillator.onended = () => signalizujVyslovnost(button, 'done');
      return true;
    } catch (error) {
      console.warn('[LubaNote English] Diagnostický tón selhal:', error);
      signalizujVyslovnost(button, 'error');
      return false;
    }
  }

  function vyslov(text, button = null, jazyk = aktivniJazyk) {
    const vyraz = normalizujVyraz(text);
    if (!vyraz) return false;
    const source = platnyJazyk(jazyk);
    const locale = JAZYKY[source].locale;

    // APK: nativní Android TextToSpeech – stejný bridge jako v 658CE,
    // pouze locale už není natvrdo angličtina.
    const nativeTts = window.Capacitor?.Plugins?.LubaNoteTts;
    if (nativeTts?.speak) {
      signalizujVyslovnost(button, 'start');
      void nativeTts.speak({
        text: vyraz,
        language: locale,
        rate: 0.90,
        pitch: 1.0
      }).then(() => {
        signalizujVyslovnost(button, 'done');
      }).catch((error) => {
        console.warn(`[LubaNote Learning] Nativní TTS (${source}) selhal:`, error);
        if (source === 'en') {
          odemkniAudioContext();
          void prehrajAudioFallback(vyraz).then((ok) => {
            if (ok) signalizujVyslovnost(button, 'done');
            else if (!zkusSpeechSynthesis(vyraz, button, source)) signalizujVyslovnost(button, 'error');
          });
        } else if (!zkusSpeechSynthesis(vyraz, button, source)) {
          signalizujVyslovnost(button, 'error');
        }
      });
      return true;
    }

    // PC/PWA: pro angličtinu zachováme kvalitní audio slovníku, ostatní
    // jazyky používají speechSynthesis se správným locale.
    if (source === 'en') {
      const ctx = odemkniAudioContext();
      signalizujVyslovnost(button, 'start');
      void prehrajAudioFallback(vyraz).then((ok) => {
        if (ok) signalizujVyslovnost(button, 'done');
        else if (!zkusSpeechSynthesis(vyraz, button, source)) signalizujVyslovnost(button, 'error');
      });
      return Boolean(ctx || window.speechSynthesis);
    }

    signalizujVyslovnost(button, 'start');
    if (!zkusSpeechSynthesis(vyraz, button, source)) signalizujVyslovnost(button, 'error');
    return Boolean(window.speechSynthesis);
  }

  function pocetSlov(jazyk = aktivniJazyk) {
    return nacti(jazyk).length;
  }

  function pocetSlovCelkem() {
    return PORADI_JAZYKU.reduce((sum, jazyk) => sum + pocetSlov(jazyk), 0);
  }

  function popisekPoctuSlov(count) {
    const n = Math.max(0, Number(count) || 0);
    if (n === 1) return '1 slovo';
    if (n >= 2 && n <= 4) return `${n} slova`;
    return `${n} slov`;
  }

  function jeDesktopTrainer() {
    try {
      return Boolean(window.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches);
    } catch (_error) {
      return false;
    }
  }

  function zavriJazykoveMenu() {
    if (!prvky.languageButtons || !prvky.languageCurrent) return;
    prvky.languageButtons.hidden = true;
    prvky.languageCurrent.setAttribute('aria-expanded', 'false');
  }

  function prepniJazykoveMenu() {
    if (!prvky.languageButtons || !prvky.languageCurrent) return;
    const otevrit = prvky.languageButtons.hidden;
    prvky.languageButtons.hidden = !otevrit;
    prvky.languageCurrent.setAttribute('aria-expanded', otevrit ? 'true' : 'false');
  }

  function vykresliJazykovyStav() {
    const source = jazykInfo(aktivniJazyk);

    prvky.languageButtons?.querySelectorAll?.('[data-learning-language]').forEach((button) => {
      const active = button.dataset.learningLanguage === aktivniJazyk;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      const count = button.querySelector('.learningLanguageCount');
      if (count) count.textContent = String(pocetSlov(button.dataset.learningLanguage));
    });

    if (prvky.languageCurrentBadge) prvky.languageCurrentBadge.textContent = source.badge;
    if (prvky.languageCurrentName) prvky.languageCurrentName.textContent = source.nazev;
    if (prvky.languageCurrent) {
      prvky.languageCurrent.title = `Změnit jazyk – ${source.nazev}`;
      prvky.languageCurrent.setAttribute('aria-label', `Jazyk k procvičování: ${source.nazev}. Klepnutím změnit.`);
    }
    if (prvky.manualAdd) {
      prvky.manualAdd.title = `Přidat slovíčko – ${source.nazev}`;
    }
  }

  function nastavAktivniJazyk(jazyk, { ulozitVolbu = true } = {}) {
    const novy = platnyJazyk(jazyk);
    if (novy === aktivniJazyk) {
      vykresliJazykovyStav();
      zavriJazykoveMenu();
      return novy;
    }

    aktivniJazyk = novy;
    if (ulozitVolbu) localStorage.setItem(languageKey(), aktivniJazyk);
    trenink = null;
    aktivniKartaId = null;
    prekladOdhalen = false;
    if (prvky.search) prvky.search.value = '';
    vykresliJazykovyStav();

    if (!prvky.modal?.hidden) {
      if (aktivniTab === 'words') vykresliSlova();
      if (aktivniTab === 'practice') {
        zahajTrenink('all');
        vykresliProcvičování();
      }
      if (aktivniTab === 'stats') vykresliStatistiky();
    }
    return novy;
  }

  function vykresliJazyky() {
    if (!prvky.languageButtons) return;
    prvky.languageButtons.replaceChildren();
    PORADI_JAZYKU.forEach((jazyk) => {
      const info = jazykInfo(jazyk);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'learningLanguageButton';
      button.dataset.learningLanguage = jazyk;
      button.innerHTML = `<span class="learningLanguageBadge">${info.badge}</span><span class="learningLanguageName">${info.nazev}</span><small class="learningLanguageCount">${pocetSlov(jazyk)}</small>`;
      button.addEventListener('click', () => {
        nastavAktivniJazyk(jazyk);
        zavriJazykoveMenu();
      });
      prvky.languageButtons.append(button);
    });
    vykresliJazykovyStav();
  }

  function nastavCount() {
    if (!prvky.count) return;
    const count = pocetSlovCelkem();
    prvky.count.textContent = count ? `${count} slov` : 'Otevřít';
    vykresliJazykovyStav();
  }

  function formatSource(item) {
    return normalizujText(item?.bookTitle, 180);
  }

  function zavriPolozkuDialog() {
    if (!prvky.entryModal) return;
    clearTimeout(dialogAutoCloseTimer);
    dialogAutoCloseTimer = null;
    prvky.entryModal.hidden = true;
    dialogStav = null;
    window.LubaNoteKeyboard?.skryj?.();
  }

  function nastavDialogStatus(text, typ = '') {
    if (!prvky.entryStatus) return;
    prvky.entryStatus.textContent = String(text || '');
    prvky.entryStatus.dataset.state = String(typ || '');
  }

  async function spustDialogPreklad({ autoSave = false } = {}) {
    if (!dialogStav || !prvky.entryTerm || !prvky.entryTranslation) return;
    const term = normalizujVyraz(prvky.entryTerm.value);
    if (!term) {
      nastavDialogStatus('Nejdřív napiš nebo vyber slovo či frázi.', 'error');
      prvky.entryTerm.focus?.();
      return;
    }

    const language = platnyJazyk(dialogStav.language || aktivniJazyk);
    const target = prekladovyJazykPro(language);
    dialogStav.language = language;
    dialogStav.translationLanguage = target;
    prvky.entryTranslate.disabled = true;
    prvky.entrySave.disabled = true;
    nastavDialogStatus(`Překládám · ${popisJazykovehoSmeru(language, target)}…`, 'loading');

    const result = await preloz(term, language, target);
    if (!dialogStav || dialogStav.language !== language) return;
    prvky.entryTranslate.disabled = false;
    prvky.entrySave.disabled = false;

    if (!result?.ok || !result.translation) {
      nastavDialogStatus(result?.error || 'Překlad se nepodařilo získat.', 'error');
      return;
    }

    prvky.entryTranslation.value = result.translation;
    nastavDialogStatus('Překlad můžeš před uložením upravit.', 'ok');
    if (autoSave) ulozDialogPolozku({ automaticky: true });
  }

  function ulozDialogPolozku({ automaticky = false } = {}) {
    if (!dialogStav || !prvky.entryTerm || !prvky.entryTranslation) return null;
    const term = normalizujVyraz(prvky.entryTerm.value);
    const translation = normalizujText(prvky.entryTranslation.value, 240);
    if (!term) {
      nastavDialogStatus('Doplň slovo nebo frázi.', 'error');
      prvky.entryTerm.focus?.();
      return null;
    }
    if (!translation) {
      nastavDialogStatus('Doplň překlad nebo klepni na Přeložit.', 'error');
      prvky.entryTranslation.focus?.();
      return null;
    }

    const language = platnyJazyk(dialogStav.language || aktivniJazyk);
    const translationLanguage = platnyJazyk(dialogStav.translationLanguage || prekladovyJazykPro(language));
    let result = null;
    if (dialogStav.editingId) {
      const items = nacti(language);
      const index = items.findIndex((item) => item.id === dialogStav.editingId);
      if (index >= 0) {
        const duplicateIndex = items.findIndex((item, i) => i !== index && klicVyrazu(item.term, language) === klicVyrazu(term, language));
        if (duplicateIndex >= 0) {
          nastavDialogStatus('Takové slovíčko už v tomto jazyku máš.', 'error');
          return { ok: false, reason: 'duplicate' };
        }
        items[index] = {
          ...items[index],
          language,
          translationLanguage,
          term,
          translation,
          context: zkratKontext(prvky.entryContext?.value || '', term),
          bookTitle: normalizujText(prvky.entrySource?.value ?? dialogStav.bookTitle ?? items[index].bookTitle, 180),
          chapterTitle: dialogStav.chapterTitle || items[index].chapterTitle || '',
          sourceType: dialogStav.sourceType || items[index].sourceType || 'manual',
          updatedAt: Date.now()
        };
        if (!uloz(items, language)) {
          nastavDialogStatus('Slovíčko se nepodařilo uložit.', 'error');
          return { ok: false, reason: 'storage' };
        }
        oznamZmenu({ operation: 'update', id: items[index].id, language });
        result = { ok: true, item: { ...items[index] }, updated: true };
      }
    }

    if (!result) {
      result = ulozPolozku({
        term,
        translation,
        language,
        translationLanguage,
        context: zkratKontext(prvky.entryContext?.value || dialogStav.context || '', term),
        bookTitle: normalizujText(prvky.entrySource?.value ?? dialogStav.bookTitle ?? '', 180),
        chapterTitle: dialogStav.chapterTitle || '',
        sourceType: dialogStav.sourceType || 'manual'
      });
    }

    if (!result?.ok) {
      nastavDialogStatus('Slovíčko se nepodařilo uložit.', 'error');
      return result;
    }

    prvky.entrySave.textContent = result.updated ? 'Aktualizováno ✓' : 'Uloženo ✓';
    nastavDialogStatus(
      automaticky
        ? `Automaticky uloženo · ${jazykInfo(language).nazev}`
        : (result.updated ? 'Slovíčko bylo aktualizováno.' : `Uloženo · ${jazykInfo(language).nazev}`),
      'ok'
    );
    nastavCount();
    if (!prvky.modal?.hidden && aktivniTab === 'words' && language === aktivniJazyk) vykresliSlova();

    // 658CH – po úspěšném uložení necháme potvrzení jednu sekundu čitelné
    // a dialog potom automaticky zavřeme. Platí i pro auto-save ze selection menu.
    const stavPoUlozeni = dialogStav;
    clearTimeout(dialogAutoCloseTimer);
    dialogAutoCloseTimer = setTimeout(() => {
      if (dialogStav === stavPoUlozeni && prvky.entryModal && !prvky.entryModal.hidden) {
        zavriPolozkuDialog();
      }
    }, 1000);
    return result;
  }

  function otevriPolozkuDialog(options = {}) {
    if (!prvky.entryModal) return false;
    clearTimeout(dialogAutoCloseTimer);
    dialogAutoCloseTimer = null;
    const language = platnyJazyk(options.language || aktivniJazyk);
    const translationLanguage = platnyJazyk(options.translationLanguage || prekladovyJazykPro(language));
    const term = normalizujVyraz(options.term || '');
    const editingId = String(options.editingId || '');
    const existing = editingId
      ? nacti(language).find((item) => item.id === editingId) || null
      : (term ? najdiPodleVyrazu(term, language) : null);

    dialogStav = {
      language,
      translationLanguage,
      editingId: existing?.id || editingId || '',
      context: zkratKontext(options.context ?? existing?.context, term),
      bookTitle: normalizujText(options.bookTitle ?? existing?.bookTitle, 180),
      chapterTitle: normalizujText(options.chapterTitle ?? existing?.chapterTitle, 180),
      sourceType: normalizujText(options.sourceType ?? existing?.sourceType, 40) || 'manual'
    };

    if (prvky.entryTitle) {
      prvky.entryTitle.textContent = options.title || (editingId ? 'Upravit slovíčko' : (term ? 'Překlad a slovník' : 'Přidat slovíčko'));
    }
    if (prvky.entryLanguage) prvky.entryLanguage.textContent = popisJazykovehoSmeru(language, translationLanguage);
    if (prvky.entryTerm) {
      prvky.entryTerm.value = term;
      prvky.entryTerm.readOnly = Boolean(options.lockTerm);
    }
    if (prvky.entryTranslation) prvky.entryTranslation.value = normalizujText(options.translation ?? existing?.translation, 240);
    if (prvky.entryContext) prvky.entryContext.value = zkratKontext(options.context ?? existing?.context ?? dialogStav.context, term);
    if (prvky.entrySource) prvky.entrySource.value = normalizujText(options.bookTitle ?? existing?.bookTitle ?? dialogStav.bookTitle, 180);
    if (prvky.entrySave) {
      prvky.entrySave.disabled = false;
      prvky.entrySave.textContent = editingId ? 'Uložit změny' : (existing ? 'Aktualizovat' : '＋ Uložit do slovníku');
    }
    if (prvky.entryTranslate) prvky.entryTranslate.disabled = false;

    prvky.entryModal.hidden = false;
    if (editingId && existing) {
      nastavDialogStatus(`Upravuješ položku · ${jazykInfo(language).nazev}`, '');
    } else if (existing) {
      nastavDialogStatus(`Toto slovíčko už máš v balíčku ${jazykInfo(language).nazev}.`, 'ok');
    } else {
      nastavDialogStatus(`Studijní balíček · ${popisJazykovehoSmeru(language, translationLanguage)}`, '');
    }

    if (options.autoTranslate && !existing) {
      requestAnimationFrame(() => { void spustDialogPreklad({ autoSave: Boolean(options.autoSave) }); });
    } else if (options.autoSave && existing) {
      nastavDialogStatus(`Už je uložené · ${jazykInfo(language).nazev}`, 'ok');
    } else if (!term) {
      setTimeout(() => prvky.entryTerm?.focus?.(), 40);
    }
    return true;
  }

  function vykresliSlova() {
    if (!prvky.list) return;
    const query = normalizujText(prvky.search?.value, 120).toLocaleLowerCase('cs-CZ');
    const items = vse().filter((item) => {
      if (!query) return true;
      return `${item.term} ${item.translation} ${item.context}`.toLocaleLowerCase('cs-CZ').includes(query);
    });

    prvky.list.replaceChildren();
    items.forEach((item) => {
      const row = document.createElement('article');
      row.className = 'learningDictionaryRow';

      const top = document.createElement('div');
      top.className = 'learningDictionaryRowTop';
      const term = document.createElement('strong');
      term.textContent = item.term;
      const speaker = document.createElement('button');
      speaker.type = 'button';
      speaker.className = 'learningDictionarySpeak';
      speaker.textContent = '🔊';
      speaker.setAttribute('aria-label', `Přehrát výslovnost ${item.term}`);
      speaker.addEventListener('pointerdown', (event) => event.stopPropagation());
      speaker.addEventListener('click', (event) => { event.stopPropagation(); vyslov(item.term, speaker, item.language || aktivniJazyk); });
      top.append(term, speaker);

      const translation = document.createElement('div');
      translation.className = 'learningDictionaryTranslation';
      translation.textContent = item.translation;
      row.append(top, translation);

      if (item.context) {
        const context = document.createElement('p');
        context.className = 'learningDictionaryContext';
        context.textContent = `“${zkratKontext(item.context, item.term)}”`;
        row.append(context);
      }

      const footer = document.createElement('div');
      footer.className = 'learningDictionaryRowFooter';
      const source = document.createElement('small');
      source.textContent = formatSource(item) || (item.sourceType === 'note' ? 'Poznámka' : item.sourceType === 'seed' ? 'Testovací sada LubaNote' : 'Ručně přidáno');
      const actions = document.createElement('div');
      actions.className = 'learningDictionaryRowActions';

      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'learningDictionaryEdit';
      edit.textContent = 'Upravit';
      edit.addEventListener('click', () => {
        otevriPolozkuDialog({
          editingId: item.id,
          language: item.language || aktivniJazyk,
          translationLanguage: item.translationLanguage || prekladovyJazykPro(item.language || aktivniJazyk),
          term: item.term,
          translation: item.translation,
          context: item.context || '',
          bookTitle: item.bookTitle || '',
          chapterTitle: item.chapterTitle || '',
          sourceType: item.sourceType || 'manual',
          title: 'Upravit slovíčko'
        });
      });

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'learningDictionaryDelete';
      del.textContent = 'Smazat';
      del.addEventListener('click', () => {
        if (!smazPolozku(item.id)) return;
        vykresliSlova();
        vykresliStatistiky();
        nastavCount();
      });
      actions.append(edit, del);
      footer.append(source, actions);
      row.append(footer);
      prvky.list.append(row);
    });

    if (prvky.empty) prvky.empty.hidden = items.length > 0;
  }

  function seradKarty(items) {
    const now = Date.now();
    return [...items].sort((a, b) => {
      const aDue = !a.nextReviewAt || a.nextReviewAt <= now ? 0 : 1;
      const bDue = !b.nextReviewAt || b.nextReviewAt <= now ? 0 : 1;
      return aDue - bDue || a.level - b.level || a.nextReviewAt - b.nextReviewAt || a.updatedAt - b.updatedAt;
    });
  }

  function zahajTrenink(mode = 'all', ids = null) {
    const items = seradKarty(nacti());
    const povolene = new Set(items.map((item) => item.id));
    const queue = Array.isArray(ids)
      ? ids.filter((id, index, all) => povolene.has(id) && all.indexOf(id) === index)
      : items.map((item) => item.id);

    trenink = {
      mode: mode === 'wrong' ? 'wrong' : 'all',
      ids: queue,
      index: 0,
      ok: 0,
      nok: 0,
      wrongIds: []
    };
    aktivniKartaId = queue[0] || null;
    prekladOdhalen = false;
  }

  function vyberKartu() {
    const items = nacti();
    if (!items.length) return null;
    if (!trenink) zahajTrenink('all');
    if (!trenink?.ids?.length || trenink.index >= trenink.ids.length) return null;
    const id = trenink.ids[trenink.index];
    const item = items.find((entry) => entry.id === id) || null;
    aktivniKartaId = item?.id || null;
    return item;
  }

  function vykresliTreninkBar() {
    if (!prvky.practiceSummary) return;
    const totalWords = pocetSlov();
    const sessionTotal = trenink?.ids?.length || 0;
    const done = Math.min(sessionTotal, (trenink?.ok || 0) + (trenink?.nok || 0));
    prvky.practiceSummary.hidden = totalWords === 0;
    if (prvky.practiceTotal) {
      prvky.practiceTotal.textContent = trenink?.mode === 'wrong'
        ? `Opakuji ${sessionTotal} NOK`
        : `Učím se ${popisekPoctuSlov(totalWords)}`;
    }
    if (prvky.practicePosition) prvky.practicePosition.textContent = `${done} / ${sessionTotal}`;
    if (prvky.practiceProgress) {
      const pct = sessionTotal ? Math.round((done / sessionTotal) * 100) : 0;
      prvky.practiceProgress.style.width = `${pct}%`;
    }
    if (prvky.practiceOk) prvky.practiceOk.textContent = `${trenink?.ok || 0} OK`;
    if (prvky.practiceNok) {
      prvky.practiceNok.textContent = `${trenink?.nok || 0} NOK`;
      prvky.practiceNok.disabled = !(trenink?.wrongIds?.length);
      prvky.practiceNok.title = trenink?.wrongIds?.length ? 'Procvičit jen slovíčka, která neumím' : 'Zatím žádná chyba';
    }
  }

  function vykresliProcvičování() {
    if (!prvky.practiceCard) return;
    if (!trenink && nacti().length) zahajTrenink('all');
    const item = vyberKartu();
    vykresliTreninkBar();

    const maSlova = pocetSlov() > 0;
    const hotovo = maSlova && trenink && trenink.index >= trenink.ids.length;
    prvky.practiceEmpty.hidden = Boolean(item);
    prvky.practiceCard.hidden = !item;

    if (!item) {
      if (prvky.practiceEmpty) {
        if (!maSlova) {
          prvky.practiceEmpty.textContent = `Nejdřív si přidej alespoň jedno slovíčko pro ${jazykInfo(aktivniJazyk).nazev}.`;
        } else if (hotovo && trenink.nok > 0) {
          prvky.practiceEmpty.textContent = `Trénink hotový 💪 ${trenink.ok} OK · ${trenink.nok} NOK. Klepni nahoře na červené NOK a projedou jen chyby.`;
        } else if (hotovo) {
          prvky.practiceEmpty.textContent = 'Trénink hotový 🥳 Všechna slovíčka byla OK.';
        }
      }
      return;
    }

    aktivniKartaId = item.id;
    prvky.practiceTerm.textContent = item.term;
    prvky.practiceTranslation.textContent = item.translation;
    prvky.practiceTranslation.hidden = !prekladOdhalen;
    const kratkyKontext = zkratKontext(item.context, item.term);
    prvky.practiceContext.textContent = kratkyKontext ? `“${kratkyKontext}”` : '';
    prvky.practiceContext.hidden = !prekladOdhalen || !kratkyKontext;
    prvky.practiceReveal.hidden = prekladOdhalen;
    prvky.practiceSource.textContent = formatSource(item);
    prvky.practiceSource.hidden = !prekladOdhalen || !formatSource(item);
    prvky.practiceCard.classList.toggle('answer-hidden', !prekladOdhalen);
    prvky.practiceCard.classList.toggle('answer-shown', prekladOdhalen);
    const desktop = jeDesktopTrainer();
    if (prvky.practiceDesktopActions) {
      prvky.practiceDesktopActions.hidden = !(desktop && prekladOdhalen);
    }
    if (prvky.practiceHint) {
      prvky.practiceHint.hidden = false;
      prvky.practiceHint.textContent = desktop
        ? (prekladOdhalen
          ? 'Klikni na kartu nebo Umím pro další slovo · Neumím vrátí slovo do NOK'
          : 'Klikni na kartu – nejdřív ukážu odpověď')
        : (prekladOdhalen
          ? '← Neumím   ·   přejeď kartou   ·   Umím →'
          : 'Klepni nebo přejeď kartou – nejdřív ukážu odpověď');
    }
    if (prvky.practiceSpeak) prvky.practiceSpeak.setAttribute('aria-label', `Přehrát výslovnost ${item.term}`);
    pripravVyslovnost(item.term, item.language || aktivniJazyk);
  }

  function ohodnotKartu(vysledek) {
    const items = nacti();
    const index = items.findIndex((item) => item.id === aktivniKartaId);
    if (index < 0 || !trenink) return;
    const item = { ...items[index] };
    const now = Date.now();
    item.reviews += 1;
    item.lastReviewedAt = now;

    if (vysledek === 'know') {
      item.level = Math.min(5, item.level + 1);
      item.correct += 1;
      trenink.ok += 1;
      const days = REVIEW_INTERVALS[item.level] || 30;
      item.nextReviewAt = now + days * 24 * 60 * 60 * 1000;
    } else {
      item.level = 0;
      item.wrong += 1;
      trenink.nok += 1;
      if (!trenink.wrongIds.includes(item.id)) trenink.wrongIds.push(item.id);
      item.nextReviewAt = now + 10 * 60 * 1000;
    }

    item.updatedAt = now;
    items[index] = item;
    uloz(items);
    oznamZmenu({ operation: 'review', id: item.id, result: vysledek });

    trenink.index += 1;
    aktivniKartaId = trenink.ids[trenink.index] || null;
    prekladOdhalen = false;
    vykresliProcvičování();
    vykresliStatistiky();
  }

  function odhalOdpoved() {
    if (prekladOdhalen || !aktivniKartaId) return false;
    prekladOdhalen = true;
    vykresliProcvičování();
    return true;
  }

  function resetSwipeVzhled() {
    if (!prvky.practiceCard) return;
    prvky.practiceCard.classList.remove('is-swiping', 'swipe-right', 'swipe-left');
    prvky.practiceCard.style.transition = 'none';
    prvky.practiceCard.style.transform = '';
    prvky.practiceCard.style.opacity = '';
    requestAnimationFrame(() => { if (prvky.practiceCard) prvky.practiceCard.style.transition = ''; });
  }

  function dokonciSwipe(vysledek, smer) {
    if (swipeZamek || !prvky.practiceCard || !aktivniKartaId) return;
    swipeZamek = true;
    potlacKlikDo = Date.now() + 360;

    // První gesto odpověď pouze odkryje. Hodnocení se zapíše až druhým gestem,
    // takže uživatel vždy vidí překlad dřív, než karta zmizí.
    if (!prekladOdhalen) {
      odhalOdpoved();
      prvky.practiceCard.style.transition = 'transform 155ms ease-out';
      prvky.practiceCard.style.transform = '';
      prvky.practiceCard.classList.remove('swipe-right', 'swipe-left');
      setTimeout(() => {
        resetSwipeVzhled();
        swipeZamek = false;
      }, 160);
      return;
    }

    const width = Math.max(window.innerWidth, prvky.practiceCard.getBoundingClientRect().width) + 120;
    prvky.practiceCard.style.transition = 'transform 170ms ease-out, opacity 170ms ease-out';
    prvky.practiceCard.style.transform = `translateX(${smer * width}px) rotate(${smer * 7}deg)`;
    prvky.practiceCard.style.opacity = '0.18';
    setTimeout(() => {
      resetSwipeVzhled();
      ohodnotKartu(vysledek);
      swipeZamek = false;
    }, 175);
  }

  function initSwipe() {
    const card = prvky.practiceCard;
    if (!card) return;

    card.addEventListener('pointerdown', (event) => {
      if (jeDesktopTrainer()) return;
      if (swipeZamek || !aktivniKartaId || event.button > 0 || event.target.closest('.learningDictionarySpeak, .englishLearningPracticeDesktopActions button')) return;
      swipeStav = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        dx: 0,
        dy: 0,
        horizontal: false
      };
      try { card.setPointerCapture?.(event.pointerId); } catch (_error) {}
      card.classList.add('is-swiping');
    });

    card.addEventListener('pointermove', (event) => {
      if (!swipeStav || swipeStav.id !== event.pointerId || swipeZamek) return;
      swipeStav.dx = event.clientX - swipeStav.x;
      swipeStav.dy = event.clientY - swipeStav.y;
      const ax = Math.abs(swipeStav.dx);
      const ay = Math.abs(swipeStav.dy);

      if (!swipeStav.horizontal) {
        if (ax < 5 && ay < 5) return;
        // Mobilní gesto bývá lehce šikmé. Upřednostníme vodorovný swipe,
        // jakmile je vodorovná složka zřetelná, ale čistý vertikální scroll necháme být.
        if (ay > ax * 1.7 && ay > 12) return;
        if (ax >= 6 && ax >= ay * 0.68) {
          swipeStav.horizontal = true;
        } else {
          return;
        }
      }

      event.preventDefault();
      const rotate = Math.max(-7, Math.min(7, swipeStav.dx / 18));
      card.style.transform = `translateX(${swipeStav.dx}px) rotate(${rotate}deg)`;
      card.classList.toggle('swipe-right', swipeStav.dx > 14);
      card.classList.toggle('swipe-left', swipeStav.dx < -14);
    });

    const konec = (event) => {
      if (!swipeStav || swipeStav.id !== event.pointerId || swipeZamek) return;
      const { dx, dy, horizontal: horizontalLock } = swipeStav;
      swipeStav = null;
      const width = card.getBoundingClientRect().width;
      const threshold = Math.max(30, Math.min(48, width * 0.085));
      const horizontal = horizontalLock && Math.abs(dx) >= threshold && Math.abs(dx) > Math.abs(dy) * 0.7;
      if (horizontal) {
        event.preventDefault();
        dokonciSwipe(dx > 0 ? 'know' : 'wrong', dx > 0 ? 1 : -1);
      } else {
        card.style.transition = 'transform 145ms ease-out';
        card.style.transform = '';
        card.classList.remove('swipe-right', 'swipe-left');
        setTimeout(resetSwipeVzhled, 150);
      }
    };

    card.addEventListener('pointerup', konec);
    card.addEventListener('pointercancel', (event) => {
      if (!swipeStav || swipeStav.id !== event.pointerId) return;
      swipeStav = null;
      resetSwipeVzhled();
    });

    card.addEventListener('click', (event) => {
      if (event.target.closest('button') || Date.now() < potlacKlikDo) return;
      if (!prekladOdhalen) {
        odhalOdpoved();
        return;
      }
      if (jeDesktopTrainer()) ohodnotKartu('know');
    });
  }

  function vykresliStatistiky() {
    if (!prvky.statsTotal) return;
    const items = nacti();
    const now = Date.now();
    const totalReviews = items.reduce((sum, item) => sum + item.reviews, 0);
    const mastered = items.filter((item) => item.level >= 3).length;
    const due = items.filter((item) => !item.nextReviewAt || item.nextReviewAt <= now).length;
    prvky.statsTotal.textContent = String(items.length);
    prvky.statsMastered.textContent = String(mastered);
    prvky.statsDue.textContent = String(due);
    prvky.statsReviews.textContent = String(totalReviews);
  }

  function nastavTab(tab) {
    const predchoziTab = aktivniTab;
    aktivniTab = ['words', 'practice', 'stats'].includes(tab) ? tab : 'words';
    prvky.tabs?.querySelectorAll?.('[data-learning-tab]').forEach((button) => {
      const active = button.dataset.learningTab === aktivniTab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    if (prvky.wordsPanel) prvky.wordsPanel.hidden = aktivniTab !== 'words';
    if (prvky.practicePanel) prvky.practicePanel.hidden = aktivniTab !== 'practice';
    if (prvky.statsPanel) prvky.statsPanel.hidden = aktivniTab !== 'stats';
    if (aktivniTab === 'words') vykresliSlova();
    if (aktivniTab === 'practice') {
      if (!trenink || predchoziTab !== 'practice' && trenink.ids.length === 0) zahajTrenink('all');
      prekladOdhalen = false;
      vykresliProcvičování();
    }
    if (aktivniTab === 'stats') vykresliStatistiky();
  }

  function otevri(tab = 'words') {
    if (!prvky.modal) return;
    zavriJazykoveMenu();
    prvky.modal.hidden = false;
    document.body.classList.add('learning-dictionary-open');
    nastavTab(tab);
    nastavCount();
  }

  function zavri() {
    if (!prvky.modal) return;
    zavriJazykoveMenu();
    prvky.modal.hidden = true;
    document.body.classList.remove('learning-dictionary-open');
    window.LubaNoteKeyboard?.skryj?.();
  }

  function zpracujSystemoveZpet() {
    if (prvky.entryModal && !prvky.entryModal.hidden) {
      zavriPolozkuDialog();
      return true;
    }
    if (prvky.languageButtons && !prvky.languageButtons.hidden) {
      zavriJazykoveMenu();
      return true;
    }
    if (prvky.modal && !prvky.modal.hidden) {
      zavri();
      return true;
    }
    return false;
  }

  function init() {
    aktivniJazyk = platnyJazyk(localStorage.getItem(languageKey()) || 'en');
    migrujAnglickySlovnik();
    migrujSeedIdProSync();
    vlozTestovaciSadu();

    Object.assign(prvky, {
      open: document.getElementById('openEnglishLearningButton'),
      headerOpen: document.getElementById('englishLearningHeaderButton'),
      count: document.getElementById('englishLearningCount'),
      modal: document.getElementById('englishLearningModal'),
      close: document.getElementById('closeEnglishLearningButton'),
      languageCurrent: document.getElementById('englishLearningLanguageCurrent'),
      languageCurrentBadge: document.getElementById('englishLearningLanguageCurrentBadge'),
      languageCurrentName: document.getElementById('englishLearningLanguageCurrentName'),
      languageButtons: document.getElementById('englishLearningLanguageButtons'),
      tabs: document.getElementById('englishLearningTabs'),
      wordsPanel: document.getElementById('englishLearningWordsPanel'),
      practicePanel: document.getElementById('englishLearningPracticePanel'),
      statsPanel: document.getElementById('englishLearningStatsPanel'),
      search: document.getElementById('englishLearningSearch'),
      manualAdd: document.getElementById('englishLearningManualAdd'),
      list: document.getElementById('englishLearningList'),
      empty: document.getElementById('englishLearningEmpty'),
      practiceCard: document.getElementById('englishLearningPracticeCard'),
      practiceEmpty: document.getElementById('englishLearningPracticeEmpty'),
      practiceTerm: document.getElementById('englishLearningPracticeTerm'),
      practiceSpeak: document.getElementById('englishLearningPracticeSpeak'),
      practiceTranslation: document.getElementById('englishLearningPracticeTranslation'),
      practiceContext: document.getElementById('englishLearningPracticeContext'),
      practiceSource: document.getElementById('englishLearningPracticeSource'),
      practiceReveal: document.getElementById('englishLearningPracticeReveal'),
      practiceSummary: document.getElementById('englishLearningPracticeSummary'),
      practiceTotal: document.getElementById('englishLearningPracticeTotal'),
      practicePosition: document.getElementById('englishLearningPracticePosition'),
      practiceProgress: document.getElementById('englishLearningPracticeProgress'),
      practiceOk: document.getElementById('englishLearningPracticeOk'),
      practiceNok: document.getElementById('englishLearningPracticeNok'),
      practiceHint: document.getElementById('englishLearningPracticeHint'),
      practiceDesktopActions: document.getElementById('englishLearningPracticeDesktopActions'),
      practiceWrong: document.getElementById('englishLearningPracticeWrong'),
      practiceKnow: document.getElementById('englishLearningPracticeKnow'),
      statsTotal: document.getElementById('englishLearningStatsTotal'),
      statsMastered: document.getElementById('englishLearningStatsMastered'),
      statsDue: document.getElementById('englishLearningStatsDue'),
      statsReviews: document.getElementById('englishLearningStatsReviews'),
      entryModal: document.getElementById('languageLearningEntryModal'),
      entryTitle: document.getElementById('languageLearningEntryTitle'),
      entryLanguage: document.getElementById('languageLearningEntryLanguage'),
      entryClose: document.getElementById('languageLearningEntryClose'),
      entryTerm: document.getElementById('languageLearningEntryTerm'),
      entryTranslation: document.getElementById('languageLearningEntryTranslation'),
      entryContext: document.getElementById('languageLearningEntryContext'),
      entrySource: document.getElementById('languageLearningEntrySource'),
      entryStatus: document.getElementById('languageLearningEntryStatus'),
      entryTranslate: document.getElementById('languageLearningEntryTranslate'),
      entrySave: document.getElementById('languageLearningEntrySave')
    });

    vykresliJazyky();

    prvky.open?.addEventListener('click', () => otevri('words'));
    prvky.headerOpen?.addEventListener('click', () => otevri('practice'));
    prvky.close?.addEventListener('click', zavri);
    prvky.languageCurrent?.addEventListener('click', (event) => {
      event.stopPropagation();
      prepniJazykoveMenu();
    });
    prvky.modal?.addEventListener('pointerdown', (event) => {
      if (event.target === prvky.modal) {
        zavri();
        return;
      }
      if (!prvky.languageButtons?.hidden && !event.target.closest?.('.learningLanguagePickerWrap')) {
        zavriJazykoveMenu();
      }
    });
    prvky.tabs?.addEventListener('click', (event) => {
      const button = event.target.closest?.('[data-learning-tab]');
      if (button) nastavTab(button.dataset.learningTab);
    });
    prvky.search?.addEventListener('input', vykresliSlova);
    prvky.manualAdd?.addEventListener('click', () => {
      otevriPolozkuDialog({
        language: aktivniJazyk,
        sourceType: 'manual',
        title: `Přidat slovíčko · ${jazykInfo(aktivniJazyk).nazev}`
      });
    });

    prvky.entryClose?.addEventListener('click', zavriPolozkuDialog);
    prvky.entryModal?.addEventListener('pointerdown', (event) => {
      if (event.target === prvky.entryModal) zavriPolozkuDialog();
    });
    prvky.entryTranslate?.addEventListener('click', () => { void spustDialogPreklad(); });
    prvky.entrySave?.addEventListener('click', () => { ulozDialogPolozku(); });
    prvky.entryTerm?.addEventListener('input', () => {
      if (prvky.entrySave) prvky.entrySave.textContent = '＋ Uložit do slovníku';
    });
    prvky.entryTranslation?.addEventListener('input', () => {
      if (prvky.entrySave) prvky.entrySave.textContent = '＋ Uložit do slovníku';
    });

    prvky.entryContext?.addEventListener('input', () => {
      if (prvky.entrySave) prvky.entrySave.textContent = dialogStav?.editingId ? 'Uložit změny' : '＋ Uložit do slovníku';
    });
    prvky.entrySource?.addEventListener('input', () => {
      if (prvky.entrySave) prvky.entrySave.textContent = dialogStav?.editingId ? 'Uložit změny' : '＋ Uložit do slovníku';
    });

    // 658CR – při otevřené LubaKeyboard udržíme právě upravované pole
    // viditelné uvnitř scrollovatelného dialogu. Druhý průchod počká, až se
    // klávesnice definitivně změří a modal dostane finální výšku.
    [prvky.entryTerm, prvky.entryTranslation, prvky.entryContext, prvky.entrySource]
      .filter(Boolean)
      .forEach((pole) => {
        pole.addEventListener('focus', () => {
          const zobrazPole = () => {
            if (!prvky.entryModal || prvky.entryModal.hidden) return;
            const radek = pole.closest?.('.languageLearningEntryField') || pole;
            try { radek.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); } catch (_error) {}
          };
          setTimeout(zobrazPole, 70);
          setTimeout(zobrazPole, 260);
        });
      });

    prvky.practiceReveal?.addEventListener('click', () => {
      odhalOdpoved();
    });
    prvky.practiceSpeak?.addEventListener('pointerdown', (event) => event.stopPropagation());
    prvky.practiceSpeak?.addEventListener('click', (event) => {
      event.stopPropagation();
      const item = vyberKartu();
      if (item) vyslov(item.term, prvky.practiceSpeak, item.language || aktivniJazyk);
    });
    prvky.practiceNok?.addEventListener('click', () => {
      const ids = [...(trenink?.wrongIds || [])];
      if (!ids.length) return;
      zahajTrenink('wrong', ids);
      vykresliProcvičování();
    });
    prvky.practiceWrong?.addEventListener('click', () => {
      if (prekladOdhalen && aktivniKartaId) ohodnotKartu('wrong');
    });
    prvky.practiceKnow?.addEventListener('click', () => {
      if (prekladOdhalen && aktivniKartaId) ohodnotKartu('know');
    });
    initSwipe();
    try { window.speechSynthesis?.getVoices?.(); } catch (_error) {}

    window.addEventListener('lubanote:learning-dictionary-change', () => {
      nastavCount();
      vykresliJazykovyStav();
      if (!prvky.modal?.hidden) {
        if (aktivniTab === 'words') vykresliSlova();
        if (aktivniTab === 'practice') vykresliTreninkBar();
        if (aktivniTab === 'stats') vykresliStatistiky();
      }
    });
    window.addEventListener('lubanote:language-change', vykresliJazykovyStav);
    nastavCount();
  }

  window.LubaNoteLearningDictionary = Object.freeze({
    vse,
    pocetSlov,
    pocetSlovCelkem,
    najdiPodleVyrazu,
    ulozPolozku,
    smazPolozku,
    preloz,
    prelozEnCs,
    vyslov,
    otevri,
    zavri,
    otevriPolozkuDialog,
    zavriPolozkuDialog,
    zpracujSystemoveZpet,
    ziskejAktivniJazyk: () => aktivniJazyk,
    nastavAktivniJazyk,
    ziskejJazyky: () => PORADI_JAZYKU.map((id) => ({ ...JAZYKY[id] })),
    ziskejJazykInfo: (id) => ({ ...jazykInfo(id) }),
    ziskejPrekladovyJazyk: (id = aktivniJazyk) => prekladovyJazykPro(id),
    popisJazykovehoSmeru,
    aplikujCloudoveZmenyProSync
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
