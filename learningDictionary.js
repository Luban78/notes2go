/* ==============================================================
   LUBANOTE – VÝUKA ANGLIČTINY / STUDIJNÍ SLOVNÍK (PATCH 658CC)
   --------------------------------------------------------------
   - samostatná data od osobního slovníku LubaKeyboard,
   - ukládání slov/frází z LubaReaderu včetně věty, knihy a kapitoly,
   - jednoduché kartičkové procvičování a statistika,
   - online překlad EN -> CS posílá pouze právě vybraný text,
   - žádný zásah do predikce LubaKeyboard ani dictionarySync.
   ============================================================== */
(() => {
  'use strict';

  const OWNER_KEY = 'lubanoteLocalOwnerUserId';
  const STORAGE_PREFIX = 'lubanote_english_learning_v1:';
  const MAX_ITEMS = 3000;
  const REVIEW_INTERVALS = [0, 1, 3, 7, 14, 30];

  const prvky = {};
  let aktivniTab = 'words';
  let aktivniKartaId = null;
  let prekladOdhalen = false;
  let trenink = null;
  let swipeStav = null;
  let swipeZamek = false;
  let potlacKlikDo = 0;
  let aktivniUtterance = null;
  let aktivniAudio = null;
  let audioContext = null;
  const audioUrlCache = new Map();
  const audioUrlPromises = new Map();
  const audioBufferCache = new Map();
  const audioBufferPromises = new Map();

  function ownerId() {
    return String(localStorage.getItem(OWNER_KEY) || 'local').trim() || 'local';
  }

  function storageKey() {
    return `${STORAGE_PREFIX}${ownerId()}`;
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

  function klicVyrazu(value) {
    return normalizujVyraz(value).toLocaleLowerCase('en-US');
  }

  function nacti() {
    try {
      const raw = JSON.parse(localStorage.getItem(storageKey()) || '[]');
      if (!Array.isArray(raw)) return [];
      return raw.map((item) => ({
        id: String(item?.id || uid()),
        term: normalizujVyraz(item?.term),
        translation: normalizujText(item?.translation, 240),
        context: normalizujText(item?.context, 480),
        bookTitle: normalizujText(item?.bookTitle, 180),
        chapterTitle: normalizujText(item?.chapterTitle, 180),
        createdAt: Number(item?.createdAt) || Date.now(),
        updatedAt: Number(item?.updatedAt) || Number(item?.createdAt) || Date.now(),
        level: Math.max(0, Math.min(5, Number(item?.level) || 0)),
        reviews: Math.max(0, Number(item?.reviews) || 0),
        correct: Math.max(0, Number(item?.correct) || 0),
        wrong: Math.max(0, Number(item?.wrong) || 0),
        nextReviewAt: Math.max(0, Number(item?.nextReviewAt) || 0),
        lastReviewedAt: Math.max(0, Number(item?.lastReviewedAt) || 0)
      })).filter((item) => item.term && item.translation);
    } catch (_error) {
      return [];
    }
  }

  function uloz(items) {
    try {
      localStorage.setItem(storageKey(), JSON.stringify((items || []).slice(0, MAX_ITEMS)));
      return true;
    } catch (error) {
      console.warn('Výukový slovník se nepodařilo uložit:', error);
      return false;
    }
  }

  function oznamZmenu(detail = {}) {
    window.dispatchEvent(new CustomEvent('lubanote:learning-dictionary-change', {
      detail: { ownerId: ownerId(), ...detail }
    }));
  }

  function vse() {
    return nacti().sort((a, b) => b.updatedAt - a.updatedAt);
  }

  function najdiPodleVyrazu(term) {
    const key = klicVyrazu(term);
    if (!key) return null;
    return nacti().find((item) => klicVyrazu(item.term) === key) || null;
  }

  function ulozPolozku(vstup = {}) {
    const term = normalizujVyraz(vstup.term);
    const translation = normalizujText(vstup.translation, 240);
    if (!term || !translation) return { ok: false, reason: 'missing' };

    const items = nacti();
    const key = klicVyrazu(term);
    const index = items.findIndex((item) => klicVyrazu(item.term) === key);
    const now = Date.now();

    if (index >= 0) {
      items[index] = {
        ...items[index],
        term,
        translation,
        context: normalizujText(vstup.context || items[index].context, 480),
        bookTitle: normalizujText(vstup.bookTitle || items[index].bookTitle, 180),
        chapterTitle: normalizujText(vstup.chapterTitle || items[index].chapterTitle, 180),
        updatedAt: now
      };
      if (!uloz(items)) return { ok: false, reason: 'storage' };
      oznamZmenu({ operation: 'update', id: items[index].id });
      return { ok: true, item: { ...items[index] }, updated: true };
    }

    const item = {
      id: uid(),
      term,
      translation,
      context: normalizujText(vstup.context, 480),
      bookTitle: normalizujText(vstup.bookTitle, 180),
      chapterTitle: normalizujText(vstup.chapterTitle, 180),
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
    if (!uloz(items)) return { ok: false, reason: 'storage' };
    oznamZmenu({ operation: 'insert', id: item.id });
    return { ok: true, item: { ...item }, updated: false };
  }

  function smazPolozku(id) {
    const before = nacti();
    const after = before.filter((item) => item.id !== String(id || ''));
    if (after.length === before.length) return false;
    if (!uloz(after)) return false;
    if (aktivniKartaId === id) aktivniKartaId = null;
    oznamZmenu({ operation: 'delete', id: String(id || '') });
    return true;
  }

  function bezpecnePrevedHtmlEntity(text) {
    const el = document.createElement('textarea');
    el.innerHTML = String(text || '');
    return el.value;
  }

  async function prelozEnCs(text) {
    const vyraz = normalizujVyraz(text);
    if (!vyraz) return { ok: false, error: 'Vyber slovo nebo frázi.' };
    if (vyraz.length > 160) return { ok: false, error: 'Pro překlad vyber kratší slovo nebo frázi.' };
    if (navigator.onLine === false) return { ok: false, error: 'Překlad potřebuje připojení k internetu.' };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    try {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(vyraz)}&langpair=en%7Ccs`;
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
      if (!translated || translated.toLocaleLowerCase('en-US') === vyraz.toLocaleLowerCase('en-US')) {
        return { ok: false, error: 'Automatický překlad se nepodařilo získat. Překlad můžeš dopsat ručně.' };
      }
      return { ok: true, translation: translated };
    } catch (error) {
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

  function anglickyHlas() {
    try {
      const voices = window.speechSynthesis?.getVoices?.() || [];
      return voices.find((voice) => /^en-GB$/i.test(voice.lang))
        || voices.find((voice) => /^en-US$/i.test(voice.lang))
        || voices.find((voice) => /^en[-_]/i.test(voice.lang))
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

  function pripravVyslovnost(text) {
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

  function zkusSpeechSynthesis(vyraz, button = null) {
    const synth = window.speechSynthesis;
    if (!synth || typeof SpeechSynthesisUtterance !== 'function') return false;

    try {
      synth.cancel();
      synth.resume?.();
      const utterance = new SpeechSynthesisUtterance(vyraz);
      aktivniUtterance = utterance;
      const voice = anglickyHlas();
      utterance.lang = voice?.lang || 'en-GB';
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

  function vyslov(text, button = null) {
    const vyraz = normalizujVyraz(text);
    if (!vyraz) return false;

    // 658CE – APK používá nativní Android TextToSpeech. WebView speechSynthesis
    // na některých zařízeních existuje, ale reálně nevydá zvuk. Nativní plugin
    // proto dostává přednost a webové cesty zůstávají jen jako fallback pro PWA/PC.
    const nativeTts = window.Capacitor?.Plugins?.LubaNoteTts;
    if (nativeTts?.speak) {
      signalizujVyslovnost(button, 'start');
      void nativeTts.speak({
        text: vyraz,
        language: 'en-GB',
        rate: 0.90,
        pitch: 1.0
      }).then(() => {
        signalizujVyslovnost(button, 'done');
      }).catch((error) => {
        console.warn('[LubaNote English] Nativní Android TTS selhal:', error);

        // Když telefon nemá použitelný anglický TTS hlas, zkusíme dosavadní
        // webovou cestu. AudioContext odemykáme ještě v návaznosti na tap.
        odemkniAudioContext();
        void prehrajAudioFallback(vyraz).then((ok) => {
          if (ok) {
            signalizujVyslovnost(button, 'done');
            return;
          }
          if (!zkusSpeechSynthesis(vyraz, button)) signalizujVyslovnost(button, 'error');
        });
      });
      return true;
    }

    // PC/PWA fallback – zachovává předchozí webovou výslovnost.
    const ctx = odemkniAudioContext();
    signalizujVyslovnost(button, 'start');
    void prehrajAudioFallback(vyraz).then((ok) => {
      if (ok) {
        signalizujVyslovnost(button, 'done');
        return;
      }
      if (!zkusSpeechSynthesis(vyraz, button)) signalizujVyslovnost(button, 'error');
    });

    return Boolean(ctx || window.speechSynthesis);
  }

  function pocetSlov() {
    return nacti().length;
  }

  function popisekPoctuSlov(count) {
    const n = Math.max(0, Number(count) || 0);
    if (n === 1) return '1 slovo';
    if (n >= 2 && n <= 4) return `${n} slova`;
    return `${n} slov`;
  }

  function nastavCount() {
    if (!prvky.count) return;
    const count = pocetSlov();
    prvky.count.textContent = count ? popisekPoctuSlov(count) : 'Otevřít';
  }

  function formatSource(item) {
    return [item.bookTitle, item.chapterTitle].filter(Boolean).join(' · ');
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
      speaker.addEventListener('click', (event) => { event.stopPropagation(); vyslov(item.term, speaker); });
      top.append(term, speaker);

      const translation = document.createElement('div');
      translation.className = 'learningDictionaryTranslation';
      translation.textContent = item.translation;
      row.append(top, translation);

      if (item.context) {
        const context = document.createElement('p');
        context.className = 'learningDictionaryContext';
        context.textContent = `“${item.context}”`;
        row.append(context);
      }

      const footer = document.createElement('div');
      footer.className = 'learningDictionaryRowFooter';
      const source = document.createElement('small');
      source.textContent = formatSource(item) || 'LubaReader';
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
      footer.append(source, del);
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
          prvky.practiceEmpty.textContent = 'Nejdřív si ulož alespoň jedno slovíčko z LubaReaderu.';
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
    prvky.practiceContext.textContent = item.context ? `“${item.context}”` : '';
    prvky.practiceContext.hidden = !prekladOdhalen || !item.context;
    prvky.practiceReveal.hidden = prekladOdhalen;
    prvky.practiceSource.textContent = formatSource(item);
    prvky.practiceSource.hidden = !prekladOdhalen || !formatSource(item);
    prvky.practiceCard.classList.toggle('answer-hidden', !prekladOdhalen);
    prvky.practiceCard.classList.toggle('answer-shown', prekladOdhalen);
    if (prvky.practiceHint) {
      prvky.practiceHint.hidden = false;
      prvky.practiceHint.textContent = prekladOdhalen
        ? '← Neumím   ·   přejeď kartou   ·   Umím →'
        : 'Klepni nebo přejeď kartou – nejdřív ukážu odpověď';
    }
    if (prvky.practiceSpeak) prvky.practiceSpeak.setAttribute('aria-label', `Přehrát výslovnost ${item.term}`);
    pripravVyslovnost(item.term);
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
    // takže uživatel vždy vidí český význam dřív, než karta zmizí.
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
      if (swipeZamek || !aktivniKartaId || event.button > 0 || event.target.closest('button')) return;
      swipeStav = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        dx: 0,
        dy: 0,
        horizontal: false
      };
      card.classList.add('is-swiping');
    });

    card.addEventListener('pointermove', (event) => {
      if (!swipeStav || swipeStav.id !== event.pointerId || swipeZamek) return;
      swipeStav.dx = event.clientX - swipeStav.x;
      swipeStav.dy = event.clientY - swipeStav.y;
      const ax = Math.abs(swipeStav.dx);
      const ay = Math.abs(swipeStav.dy);

      if (!swipeStav.horizontal) {
        if (ax < 8 && ay < 8) return;
        if (ay > ax * 1.15) return;
        if (ax >= 8 && ax >= ay * 0.9) {
          swipeStav.horizontal = true;
          try { card.setPointerCapture?.(event.pointerId); } catch (_error) {}
        } else {
          return;
        }
      }

      event.preventDefault();
      const rotate = Math.max(-7, Math.min(7, swipeStav.dx / 18));
      card.style.transform = `translateX(${swipeStav.dx}px) rotate(${rotate}deg)`;
      card.classList.toggle('swipe-right', swipeStav.dx > 18);
      card.classList.toggle('swipe-left', swipeStav.dx < -18);
    });

    const konec = (event) => {
      if (!swipeStav || swipeStav.id !== event.pointerId || swipeZamek) return;
      const { dx, dy, horizontal: horizontalLock } = swipeStav;
      swipeStav = null;
      const width = card.getBoundingClientRect().width;
      const threshold = Math.max(44, Math.min(68, width * 0.12));
      const horizontal = horizontalLock && Math.abs(dx) >= threshold && Math.abs(dx) > Math.abs(dy) * 0.95;
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
      if (!prekladOdhalen) odhalOdpoved();
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
    prvky.modal.hidden = false;
    document.body.classList.add('learning-dictionary-open');
    nastavTab(tab);
    nastavCount();
  }

  function zavri() {
    if (!prvky.modal) return;
    prvky.modal.hidden = true;
    document.body.classList.remove('learning-dictionary-open');
    window.LubaNoteKeyboard?.skryj?.();
  }

  function init() {
    Object.assign(prvky, {
      open: document.getElementById('openEnglishLearningButton'),
      count: document.getElementById('englishLearningCount'),
      modal: document.getElementById('englishLearningModal'),
      close: document.getElementById('closeEnglishLearningButton'),
      tabs: document.getElementById('englishLearningTabs'),
      wordsPanel: document.getElementById('englishLearningWordsPanel'),
      practicePanel: document.getElementById('englishLearningPracticePanel'),
      statsPanel: document.getElementById('englishLearningStatsPanel'),
      search: document.getElementById('englishLearningSearch'),
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
      statsTotal: document.getElementById('englishLearningStatsTotal'),
      statsMastered: document.getElementById('englishLearningStatsMastered'),
      statsDue: document.getElementById('englishLearningStatsDue'),
      statsReviews: document.getElementById('englishLearningStatsReviews')
    });

    prvky.open?.addEventListener('click', () => otevri('words'));
    prvky.close?.addEventListener('click', zavri);
    prvky.modal?.addEventListener('pointerdown', (event) => {
      if (event.target === prvky.modal) zavri();
    });
    prvky.tabs?.addEventListener('click', (event) => {
      const button = event.target.closest?.('[data-learning-tab]');
      if (button) nastavTab(button.dataset.learningTab);
    });
    prvky.search?.addEventListener('input', vykresliSlova);
    prvky.practiceReveal?.addEventListener('click', () => {
      odhalOdpoved();
    });
    prvky.practiceSpeak?.addEventListener('pointerdown', (event) => event.stopPropagation());
    prvky.practiceSpeak?.addEventListener('click', (event) => {
      event.stopPropagation();
      const item = vyberKartu();
      if (item) vyslov(item.term, prvky.practiceSpeak);
    });
    prvky.practiceNok?.addEventListener('click', () => {
      const ids = [...(trenink?.wrongIds || [])];
      if (!ids.length) return;
      zahajTrenink('wrong', ids);
      vykresliProcvičování();
    });
    initSwipe();
    try { window.speechSynthesis?.getVoices?.(); } catch (_error) {}

    window.addEventListener('lubanote:learning-dictionary-change', () => {
      nastavCount();
      if (!prvky.modal?.hidden) {
        if (aktivniTab === 'words') vykresliSlova();
        if (aktivniTab === 'practice') vykresliTreninkBar();
        if (aktivniTab === 'stats') vykresliStatistiky();
      }
    });
    nastavCount();
  }

  window.LubaNoteLearningDictionary = Object.freeze({
    vse,
    pocetSlov,
    najdiPodleVyrazu,
    ulozPolozku,
    smazPolozku,
    prelozEnCs,
    vyslov,
    otevri,
    zavri
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
