/* ==============================================================
   LUBANOTE – VÝUKA ANGLIČTINY / STUDIJNÍ SLOVNÍK (PATCH 658BZ)
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

  function vyslov(text) {
    const vyraz = normalizujVyraz(text);
    if (!vyraz || !window.speechSynthesis || typeof SpeechSynthesisUtterance !== 'function') return false;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(vyraz);
      utterance.lang = 'en-US';
      utterance.rate = 0.88;
      window.speechSynthesis.speak(utterance);
      return true;
    } catch (_error) {
      return false;
    }
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
      speaker.addEventListener('click', () => vyslov(item.term));
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

  function vyberKartu() {
    const items = nacti();
    if (!items.length) return null;
    const now = Date.now();
    const sorted = [...items].sort((a, b) => {
      const aDue = !a.nextReviewAt || a.nextReviewAt <= now ? 0 : 1;
      const bDue = !b.nextReviewAt || b.nextReviewAt <= now ? 0 : 1;
      return aDue - bDue || a.level - b.level || a.nextReviewAt - b.nextReviewAt || a.updatedAt - b.updatedAt;
    });
    const current = sorted.find((item) => item.id === aktivniKartaId);
    return current || sorted[0];
  }

  function vykresliProcvičování() {
    if (!prvky.practiceCard) return;
    const item = vyberKartu();
    prvky.practiceEmpty.hidden = Boolean(item);
    prvky.practiceCard.hidden = !item;
    if (!item) return;

    aktivniKartaId = item.id;
    prvky.practiceTerm.textContent = item.term;
    prvky.practiceTranslation.textContent = item.translation;
    prvky.practiceTranslation.hidden = !prekladOdhalen;
    prvky.practiceContext.textContent = item.context ? `“${item.context}”` : '';
    prvky.practiceContext.hidden = !prekladOdhalen || !item.context;
    prvky.practiceReveal.hidden = prekladOdhalen;
    prvky.practiceActions.hidden = !prekladOdhalen;
    prvky.practiceSource.textContent = formatSource(item);
    prvky.practiceSource.hidden = !prekladOdhalen || !formatSource(item);
  }

  function ohodnotKartu(vysledek) {
    const items = nacti();
    const index = items.findIndex((item) => item.id === aktivniKartaId);
    if (index < 0) return;
    const item = { ...items[index] };
    const now = Date.now();
    item.reviews += 1;
    item.lastReviewedAt = now;

    if (vysledek === 'know') {
      item.level = Math.min(5, item.level + 1);
      item.correct += 1;
      const days = REVIEW_INTERVALS[item.level] || 30;
      item.nextReviewAt = now + days * 24 * 60 * 60 * 1000;
    } else if (vysledek === 'again') {
      item.level = Math.max(0, item.level - 1);
      item.nextReviewAt = now + 12 * 60 * 60 * 1000;
    } else {
      item.level = 0;
      item.wrong += 1;
      item.nextReviewAt = now + 10 * 60 * 1000;
    }

    item.updatedAt = now;
    items[index] = item;
    uloz(items);
    oznamZmenu({ operation: 'review', id: item.id, result: vysledek });

    const ostatni = items
      .filter((x) => x.id !== item.id)
      .sort((a, b) => a.level - b.level || a.nextReviewAt - b.nextReviewAt || a.updatedAt - b.updatedAt);
    aktivniKartaId = ostatni[0]?.id || item.id;
    prekladOdhalen = false;
    vykresliProcvičování();
    vykresliStatistiky();
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
      practiceTranslation: document.getElementById('englishLearningPracticeTranslation'),
      practiceContext: document.getElementById('englishLearningPracticeContext'),
      practiceSource: document.getElementById('englishLearningPracticeSource'),
      practiceReveal: document.getElementById('englishLearningPracticeReveal'),
      practiceActions: document.getElementById('englishLearningPracticeActions'),
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
      prekladOdhalen = true;
      vykresliProcvičování();
    });
    prvky.practiceTerm?.addEventListener('click', () => {
      const item = vyberKartu();
      if (item) vyslov(item.term);
    });
    document.getElementById('englishLearningPracticeWrong')?.addEventListener('click', () => ohodnotKartu('wrong'));
    document.getElementById('englishLearningPracticeAgain')?.addEventListener('click', () => ohodnotKartu('again'));
    document.getElementById('englishLearningPracticeKnow')?.addEventListener('click', () => ohodnotKartu('know'));

    window.addEventListener('lubanote:learning-dictionary-change', () => {
      nastavCount();
      if (!prvky.modal?.hidden) {
        if (aktivniTab === 'words') vykresliSlova();
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
