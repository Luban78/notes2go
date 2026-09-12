/* ==============================================================
   LUBANOTE – LUBAKBOARD SLIDE ALT (PATCH 446)

   Vlastní mobilní klávesnice pro Editor Core V2.

   ARCHITEKTURA
   - systémové IME NENÍ zdrojem textu v režimu LubaKeyboard,
   - každý znak / příkaz jde přímo do modelu Editor Core V2,
   - klávesnice je Unicode-first: model umí vložit libovolný Unicode znak,
   - jazykové moduly řeší jen rozložení / skládání znaků,
   - složité jazyky mohou mít vlastní compose vrstvu (Pinyin, Hangul),
   - režim Unicode U+ je univerzální fallback pro jakýkoli znak,
   - desktop se tímto souborem nemění.

   DŮLEŽITÉ
   Tohle je vstupní vrstva. Selection/caret/save/shared-lock jsou oddělené
   části editoru a tento soubor je záměrně nepřepisuje.
   ============================================================== */
(() => {
  "use strict";

  const ULOZ_LAYOUT = "lubanote_lubakeyboard_layout_v1";
  const ULOZ_REZIM = "lubanote_lubakeyboard_mode_v1";
  const ULOZ_RECENT = "lubanote_lubakeyboard_recent_v1";
  const ULOZ_NAVRHY = "lubanote_lubakeyboard_learned_words_v1";

  /* PATCH 445 – základ predikčního řádku.
     Jádro je jazykově neutrální; jednotlivé jazyky mohou mít vlastní
     frekvenční slovník. Uživatelova slova se průběžně učí lokálně.
     Čeština a angličtina mají v první verzi malý offline seed slovník. */
  const SLOVNIK_NAVRHU = Object.freeze({
    cs: Object.freeze((
      "a aby ale ano asi až bez bude budu byl byla bylo byly bych bychom byste být co což do dobře " +
      "dnes ještě ho i jak jako je jeho jejím jen jde jsem jsme jsou když kde kdo která které který " +
      "má mám máme máte mezi mít moc může můžeme musí na nad nám ne nebo než nic nový nové o od pak " +
      "po pod podle pořád potom pro proč před při přes se si s jsem jsme jsou tak taky tam teď ten tento " +
      "to toho tom tomu tu už v vám ve velmi víc více vše všechny z za ze že " +
      "ahoj aplikace barva čeština česká české českou diakritika editor funguje klávesnice LubaNote " +
      "mobil mobilní nápověda nápovědy návrh návrhy obrázek obrázku poznámka poznámky psaní řádek " +
      "sdílení standardní systémová systémové test testovací testo těsto těstoviny text tlačítko " +
      "uložit vložení výběr znaky znaků"
    ).split(/\s+/).filter(Boolean)),
    en: Object.freeze((
      "a about after again all also an and any are as at back be because been before but by can could " +
      "day do does done each editor first for from get good had has have he hello her here him his how " +
      "i if in into is it its just keyboard know like make me more my new no not note notes now of on " +
      "one only or other our out over people please right see she so some standard system test text than " +
      "that the their them then there these they thing this time to up use very was we well were what " +
      "when where which who will with word words would you your"
    ).split(/\s+/).filter(Boolean))
  });

  const JE_MOBILNI = (() => {
    const ua = String(navigator.userAgent || "");
    const dotyk = Number(navigator.maxTouchPoints || 0) > 0;
    const coarse = window.matchMedia?.("(pointer: coarse)")?.matches === true;
    return /Android|iPhone|iPad|iPod/i.test(ua) || (dotyk && coarse && Math.min(screen.width, screen.height) < 1200);
  })();

  if (!JE_MOBILNI) return;

  const LATIN_ALT = Object.freeze({
    a: "áàâäãåāăąǎạảấầẩẫậắằẳẵặæ",
    c: "čçćĉċ",
    d: "ďđð",
    e: "éěèêëēĕėęẻẹếềểễệ",
    g: "ğĝġģ",
    h: "ĥħ",
    i: "íìîïīĭįıỉị",
    j: "ĵ",
    k: "ķ",
    l: "ľĺļł",
    n: "ňñńņŋ",
    o: "óòôöõōŏőøơǒọỏốồổỗộớờởỡợœ",
    r: "řŕŗ",
    s: "šśŝşșß",
    t: "ťţțþ",
    u: "úůùûüūŭűųưǔụủứừửữự",
    w: "ŵ",
    y: "ýÿŷỳỷỹỵ",
    z: "žźż"
  });

  /*
   * PATCH 442 – standardní české rozložení bez samostatné řady diakritiky.
   * České znaky patří pod long-press základního písmene stejně jako na
   * běžných mobilních klávesnicích. První položka je pro češtinu ta
   * nejběžnější varianta, další Unicode varianty zůstávají dostupné.
   */
  const CESKE_ALT = Object.freeze({
    /*
     * PATCH 444 – český long-press držíme v rozsahu běžné mobilní
     * klávesnice. Nezobrazujeme celý Unicode katalog; nabídka má být
     * krátká, čitelná a použitelná palcem. Pořadí upřednostňuje český znak.
     */
    a: "áàâäãåāæ",
    c: "čćç",
    d: "ď",
    e: "ěéèêëēėę",
    i: "íìîïīį",
    l: "ľł",
    n: "ňńñ",
    o: "óòôöõøōœ",
    r: "ř",
    s: "šśß",
    t: "ť",
    u: "úůùûüū",
    y: "ýÿ",
    z: "žźż"
  });

  /* Dlouhý stisk tečky – kompaktní interpunkční paleta podle běžného
     mobilního vzoru. Uživatel ji chce jako systémovou 4×4 bublinu. */
  const TECKA_ALT = Object.freeze([
    "&", "%", "+", '"',
    "-", ":", "'", "@",
    ";", "/", "(", ")",
    "#", "!", ",", "?"
  ]);

  /*
   * PATCH 448 – tečka má vlastní třířádkovou interpunkční paletu.
   * Klávesa . je vpravo, proto jsou běžné znaky v každé řadě řazené
   * tak, aby výchozí kotva byla na PRAVÉM konci a celý výběr šel udělat
   * přirozeným tahem hlavně doleva – bez narážení prstu do hrany displeje.
   */
  const TECKA_ALT_RADKY = Object.freeze({
    top: Object.freeze([")", "(", "/", "#", "@"]),
    middle: Object.freeze(["&", "%", "+", "-", '"', "'"]),
    bottom: Object.freeze([":", ";", "?", "!", ","])
  });

  const segmenter = (() => {
    try { return new Intl.Segmenter(undefined, { granularity: "grapheme" }); }
    catch (_error) { return null; }
  })();

  function znaky(text) {
    const value = String(text || "");
    if (!segmenter) return Array.from(value);
    return Array.from(segmenter.segment(value), (item) => item.segment);
  }

  function radek(text) {
    return znaky(text);
  }

  const LAYOUTY = Object.freeze({
    cs: {
      id: "cs", skupina: "Latinka", nazev: "Čeština", badge: "CS", locale: "cs-CZ",
      rows: [radek("qwertzuiop"), radek("asdfghjkl"), radek("yxcvbnm")],
      alt: CESKE_ALT, shift: true, standardMobile: true
    },
    en: {
      id: "en", skupina: "Latinka", nazev: "English", badge: "EN", locale: "en-US",
      rows: [radek("qwertyuiop"), radek("asdfghjkl"), radek("zxcvbnm")],
      alt: LATIN_ALT, shift: true, standardMobile: true
    },
    de: {
      id: "de", skupina: "Latinka", nazev: "Deutsch", badge: "DE", locale: "de-DE",
      rows: [radek("qwertzuiopü"), radek("asdfghjklöä"), radek("yxcvbnm")],
      extra: znaky("ßéèç"), alt: LATIN_ALT, shift: true
    },
    fr: {
      id: "fr", skupina: "Latinka", nazev: "Français", badge: "FR", locale: "fr-FR",
      rows: [radek("azertyuiop"), radek("qsdfghjklm"), radek("wxcvbn")],
      extra: znaky("éèêëàâîïôùûüçœ"), alt: LATIN_ALT, shift: true
    },
    es: {
      id: "es", skupina: "Latinka", nazev: "Español", badge: "ES", locale: "es-ES",
      rows: [radek("qwertyuiop"), radek("asdfghjklñ"), radek("zxcvbnm")],
      extra: znaky("áéíóúü¿¡"), alt: LATIN_ALT, shift: true
    },
    pl: {
      id: "pl", skupina: "Latinka", nazev: "Polski", badge: "PL", locale: "pl-PL",
      rows: [radek("qwertyuiop"), radek("asdfghjkl"), radek("zxcvbnm")],
      extra: znaky("ąćęłńóśźż"), alt: LATIN_ALT, shift: true
    },
    tr: {
      id: "tr", skupina: "Latinka", nazev: "Türkçe", badge: "TR", locale: "tr-TR",
      rows: [radek("qwertyuıopğü"), radek("asdfghjklşi"), radek("zxcvbnmöç")],
      alt: LATIN_ALT, shift: true
    },
    vi: {
      id: "vi", skupina: "Latinka", nazev: "Tiếng Việt", badge: "VI", locale: "vi-VN",
      rows: [radek("qwertyuiop"), radek("asdfghjkl"), radek("zxcvbnm")],
      extra: znaky("ăâêôơưđ"), alt: LATIN_ALT, shift: true
    },
    ru: {
      id: "ru", skupina: "Azbuka", nazev: "Русский", badge: "РУ", locale: "ru-RU",
      rows: [radek("йцукенгшщзхъ"), radek("фывапролджэ"), radek("ячсмитьбю")],
      shift: true
    },
    uk: {
      id: "uk", skupina: "Azbuka", nazev: "Українська", badge: "УК", locale: "uk-UA",
      rows: [radek("йцукенгшщзхї"), radek("фівапролджє"), radek("ячсмитьбю")],
      extra: znaky("ґ'"), shift: true
    },
    el: {
      id: "el", skupina: "Řečtina", nazev: "Ελληνικά", badge: "ΕΛ", locale: "el-GR",
      rows: [radek("ερτυθιοπ"), radek("ασδφγηξκλ"), radek("ζχψωβνμ")],
      extra: znaky("ςάέήίόύώϊϋΐΰ"), shift: true
    },
    ar: {
      id: "ar", skupina: "Arabské písmo", nazev: "العربية", badge: "ع", locale: "ar", dir: "rtl",
      rows: [radek("ضصثقفغعهخحجد"), radek("شسيبلاتنمكط"), radek("ئءؤرلاىةوزظ")],
      extra: znaky("ًٌٍَُِّْـ"), shift: false
    },
    fa: {
      id: "fa", skupina: "Arabské písmo", nazev: "فارسی", badge: "فا", locale: "fa", dir: "rtl",
      rows: [radek("ضصثقفغعهخحجچ"), radek("شسیبلاتنمکگ"), radek("ظطزرذدپوژ")],
      extra: znaky("آأإؤئۀیكکپگچژ‌"), shift: false
    },
    he: {
      id: "he", skupina: "Hebrejština", nazev: "עברית", badge: "ע", locale: "he", dir: "rtl",
      rows: [radek("קראטוןםפ"), radek("שדגכעיחלךף"), radek("זסבהנמצתץ")],
      extra: znaky("׳״־"), shift: false
    },
    hi: {
      id: "hi", skupina: "Dévanágarí", nazev: "हिन्दी", badge: "हि", locale: "hi-IN", dense: true,
      rows: [
        znaky("अआइईउऊएऐओऔऋ"),
        znaky("कखगघङचछजझञ"),
        znaky("टठडढणतथदधन"),
        znaky("पफबभमयरलवशषसह")
      ],
      extra: znaky("ािीुूृेैोौंःँ्"), shift: false
    },
    th: {
      id: "th", skupina: "Thajština", nazev: "ไทย", badge: "TH", locale: "th-TH", dense: true,
      rows: [radek("ๆไำพะัีรนยบล"), radek("ฟหกดเ้่าสวง"), radek("ผปแอิืทมใฝ")],
      extra: znaky("ๅภถุึคตจขชๆ๐๑๒๓๔๕๖๗๘๙"), shift: false
    },
    ja: {
      id: "ja", skupina: "Japonština", nazev: "日本語 かな", badge: "かな", locale: "ja-JP", grid: true,
      rows: [
        znaky("あいうえお"), znaky("かきくけこ"), znaky("さしすせそ"), znaky("たちつてと"),
        znaky("なにぬねの"), znaky("はひふへほ"), znaky("まみむめも"), znaky("やゆよ"),
        znaky("らりるれろ"), znaky("わをん")
      ],
      extra: znaky("ぁぃぅぇぉゃゅょっー、。？！"),
      alt: {
        か: "が", き: "ぎ", く: "ぐ", け: "げ", こ: "ご",
        さ: "ざ", し: "じ", す: "ず", せ: "ぜ", そ: "ぞ",
        た: "だ", ち: "ぢ", つ: "づっ", て: "で", と: "ど",
        は: "ばぱ", ひ: "びぴ", ふ: "ぶぷ", へ: "べぺ", ほ: "ぼぽ",
        や: "ゃ", ゆ: "ゅ", よ: "ょ", あ: "ぁ", い: "ぃ", う: "ぅ", え: "ぇ", お: "ぉ"
      },
      shift: "katakana"
    },
    ko: {
      id: "ko", skupina: "Korejština", nazev: "한국어", badge: "한", locale: "ko-KR", compose: "hangul",
      rows: [radek("ㅂㅈㄷㄱㅅㅛㅕㅑㅐㅔ"), radek("ㅁㄴㅇㄹㅎㅗㅓㅏㅣ"), radek("ㅋㅌㅊㅍㅠㅜㅡ")],
      shift: "hangul"
    },
    zh: {
      id: "zh", skupina: "Čínština", nazev: "中文 · 拼音", badge: "中", locale: "zh-CN", compose: "pinyin",
      rows: [radek("qwertyuiop"), radek("asdfghjkl"), radek("zxcvbnm")],
      shift: false
    },
    emoji: {
      id: "emoji", skupina: "Symboly", nazev: "Emoji", badge: "😊", locale: "", grid: true,
      rows: [
        znaky("😀😃😄😁😆😅😂🤣😊🙂🙃😉😍🥰😘😎🤓🥳🤩"),
        znaky("🤔🫡🤗🤭🫢😴😭🥺😡🤯😱😇🤠👻💩🤖👽"),
        znaky("👍👎👌✌️🤞🤟🤘👏🙌🫶💪🙏👋🤝❤️💜💙💚💛"),
        znaky("🔥✨⭐🌟💫⚡☀️🌙🌈❄️☕🍺🍕🍔🍎🎂🎁🎉"),
        znaky("✅❌⚠️❗❓💡📌📎✏️📝📅⏰🔒🔓🔔📷🖼️📄"),
        znaky("🚗🚲✈️🚀🏠🏢🌍🗺️🎵🎹🎧⚽🏆💻📱⌚🔧⚙️")
      ],
      shift: false
    },
    unicode: {
      id: "unicode", skupina: "Symboly", nazev: "Unicode U+", badge: "U+", locale: "", compose: "unicode",
      rows: [], shift: false
    }
  });

  const PINYIN = Object.freeze({
    ni: "你妳尼呢泥逆拟", hao: "好号浩豪郝毫", wo: "我握窝卧沃", shi: "是时事十市使世式识师诗", de: "的得德地", bu: "不部步布补", zai: "在再载灾", ren: "人认任仁", zhong: "中种重众终钟", guo: "国过果锅郭", men: "们门闷", ta: "他她它塔", you: "有又友右由游", he: "和喝河合何核", le: "了乐勒", ma: "吗妈马嘛麻", shen: "什神深身", me: "么", yi: "一以已意衣易医义", ge: "个各歌哥格", zhe: "这着者折", na: "那哪拿纳", lai: "来赖莱", qu: "去取区曲", shang: "上商尚伤", xia: "下夏吓", da: "大达打", xiao: "小笑校晓", tian: "天田填甜", di: "地第低底", ai: "爱矮挨哎", xin: "心新信辛", shui: "水谁睡税", huo: "火或活货", mu: "木目母暮", jin: "今进金近", tu: "图土兔途", ri: "日", yue: "月越约", nian: "年念", ming: "明名命", zuo: "做作坐左", xie: "谢写些鞋", qing: "请情青清", wen: "问文闻温", kan: "看刊砍", chi: "吃持迟", xiang: "想向象香", yao: "要药摇", neng: "能", hui: "会回灰", hen: "很恨", dou: "都斗豆", ye: "也夜业", mei: "没美每妹", jia: "家加假价", xue: "学雪血", sheng: "生声省", gong: "工公功共", kai: "开凯", dian: "点电店", hua: "话花华画", che: "车彻", qian: "前钱千", hou: "后候", li: "里理力立", wai: "外", chang: "长常场唱", duan: "短段端", gao: "高告搞", kuai: "快块", man: "慢满", duo: "多", shao: "少", dui: "对队", cuo: "错", keyi: ["可以"], meiyou: ["没有"], nihao: ["你好"], xiexie: ["谢谢"], zaijian: ["再见"], zhongguo: ["中国"], women: ["我们"], nimen: ["你们"], shijie: ["世界"], pengyou: ["朋友"], jintian: ["今天"], mingtian: ["明天"]
  });

  const H_L = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
  const H_V = ["ㅏ","ㅐ","ㅑ","ㅒ","ㅓ","ㅔ","ㅕ","ㅖ","ㅗ","ㅘ","ㅙ","ㅚ","ㅛ","ㅜ","ㅝ","ㅞ","ㅟ","ㅠ","ㅡ","ㅢ","ㅣ"];
  const H_T = ["","ㄱ","ㄲ","ㄳ","ㄴ","ㄵ","ㄶ","ㄷ","ㄹ","ㄺ","ㄻ","ㄼ","ㄽ","ㄾ","ㄿ","ㅀ","ㅁ","ㅂ","ㅄ","ㅅ","ㅆ","ㅇ","ㅈ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
  const H_SIMPLE_T = new Set(["ㄱ","ㄲ","ㄴ","ㄷ","ㄹ","ㅁ","ㅂ","ㅅ","ㅆ","ㅇ","ㅈ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"]);
  const H_V_COMBINE = Object.freeze({ "ㅗㅏ":"ㅘ", "ㅗㅐ":"ㅙ", "ㅗㅣ":"ㅚ", "ㅜㅓ":"ㅝ", "ㅜㅔ":"ㅞ", "ㅜㅣ":"ㅟ", "ㅡㅣ":"ㅢ" });
  const H_SHIFT = Object.freeze({ "ㅂ":"ㅃ", "ㅈ":"ㅉ", "ㄷ":"ㄸ", "ㄱ":"ㄲ", "ㅅ":"ㅆ", "ㅐ":"ㅒ", "ㅔ":"ㅖ" });

  let panel = null;
  let telo = null;
  let composeBox = null;
  let candidates = null;
  let navrhyBox = null;
  let jazykButton = null;
  let otevritButton = null;
  let chooser = null;
  let altPopup = null;
  let aktivniEditor = null;
  let layoutId = nactiLayout();
  let mode = "letters";
  let symbolPage = 0;
  let shift = false;
  let caps = false;
  let longPressTimer = null;
  let longPressUsed = false;
  let longPressPointerId = null;
  let longPressStartX = 0;
  let longPressStartY = 0;
  let altAktivniRadek = "bottom";
  let altRadkyElementy = { top: [], middle: [], bottom: [] };
  let altKotvaIndex = { top: 0, middle: 0, bottom: 0 };
  let aktivniAltVolba = null;
  let posledniAltVolba = null;
  let repeatTimer = null;
  let repeatInterval = null;
  let pinyinBuffer = "";
  let unicodeBuffer = "";
  let hangulPrefix = "";
  let hangulState = { L: null, V: null, T: null };
  let observer = null;
  let systemovyEditor = null;
  let recent = nactiRecent();
  let naucenaSlova = nactiNaucenaSlova();

  function core() {
    return window.LubaNoteEditorV2 || null;
  }

  function nactiLayout() {
    const saved = localStorage.getItem(ULOZ_LAYOUT);
    if (saved && LAYOUTY[saved]) return saved;
    const lang = String(navigator.language || "").toLowerCase();
    if (lang.startsWith("cs") || lang.startsWith("sk")) return "cs";
    if (lang.startsWith("de")) return "de";
    if (lang.startsWith("fr")) return "fr";
    if (lang.startsWith("es")) return "es";
    if (lang.startsWith("pl")) return "pl";
    if (lang.startsWith("tr")) return "tr";
    if (lang.startsWith("vi")) return "vi";
    if (lang.startsWith("ru")) return "ru";
    if (lang.startsWith("uk")) return "uk";
    if (lang.startsWith("el")) return "el";
    if (lang.startsWith("ar")) return "ar";
    if (lang.startsWith("fa")) return "fa";
    if (lang.startsWith("he")) return "he";
    if (lang.startsWith("hi")) return "hi";
    if (lang.startsWith("th")) return "th";
    if (lang.startsWith("ja")) return "ja";
    if (lang.startsWith("ko")) return "ko";
    if (lang.startsWith("zh")) return "zh";
    return "en";
  }

  function nactiRecent() {
    try {
      const value = JSON.parse(localStorage.getItem(ULOZ_RECENT) || "[]");
      return Array.isArray(value) ? value.filter((x) => typeof x === "string").slice(0, 24) : [];
    } catch (_error) {
      return [];
    }
  }

  function nactiNaucenaSlova() {
    try {
      const value = JSON.parse(localStorage.getItem(ULOZ_NAVRHY) || "{}");
      return value && typeof value === "object" ? value : {};
    } catch (_error) {
      return {};
    }
  }

  function ulozNaucenaSlova() {
    try { localStorage.setItem(ULOZ_NAVRHY, JSON.stringify(naucenaSlova)); } catch (_error) {}
  }

  function lowerLocale(value, layout = aktualniLayout()) {
    try { return String(value || "").toLocaleLowerCase(layout.locale || undefined); }
    catch (_error) { return String(value || "").toLowerCase(); }
  }

  function bezDiakritiky(value) {
    try { return String(value || "").normalize("NFD").replace(/\p{M}+/gu, ""); }
    catch (_error) { return String(value || ""); }
  }

  function jeSlovoProUceni(value) {
    const slovo = String(value || "").trim();
    if (slovo.length < 2 || slovo.length > 40) return false;
    try { return /^[\p{L}\p{M}][\p{L}\p{M}'’\-]*$/u.test(slovo); }
    catch (_error) { return /^[A-Za-zÀ-ž][A-Za-zÀ-ž'’\-]*$/.test(slovo); }
  }

  function naucSlovo(value, bonus = 1) {
    const layout = aktualniLayout();
    const slovo = String(value || "").trim();
    if (!jeSlovoProUceni(slovo)) return;
    const key = lowerLocale(slovo, layout);
    const id = layout.id || "en";
    const mapa = naucenaSlova[id] && typeof naucenaSlova[id] === "object" ? naucenaSlova[id] : {};
    mapa[key] = {
      word: slovo,
      count: Math.min(9999, Number(mapa[key]?.count || 0) + Math.max(1, Number(bonus || 1)))
    };
    const entries = Object.entries(mapa)
      .sort((a, b) => Number(b[1]?.count || 0) - Number(a[1]?.count || 0))
      .slice(0, 320);
    naucenaSlova[id] = Object.fromEntries(entries);
    ulozNaucenaSlova();
  }

  function naucAktualniSlovo() {
    const kontext = core()?.ziskejKontextVlastniKlavesnice?.();
    const slovo = kontext?.celeSlovo || kontext?.prefix || "";
    if (slovo) naucSlovo(slovo, 2);
  }

  function zachovejVelikost(prefix, navrh, layout) {
    const vstup = String(prefix || "");
    const out = String(navrh || "");
    if (!vstup || !out) return out;
    const upper = localUpper(vstup, layout);
    if (vstup === upper && vstup !== lowerLocale(vstup, layout)) return localUpper(out, layout);
    const prvni = Array.from(vstup)[0] || "";
    if (prvni && prvni === localUpper(prvni, layout) && prvni !== lowerLocale(prvni, layout)) {
      const chars = Array.from(out);
      chars[0] = localUpper(chars[0], layout);
      return chars.join("");
    }
    return out;
  }

  function vychoziNavrhy(layout) {
    const naucene = Object.values(naucenaSlova[layout.id] || {})
      .sort((a, b) => Number(b?.count || 0) - Number(a?.count || 0))
      .map((x) => x?.word)
      .filter(Boolean);
    const fallback = layout.id === "cs" ? ["a", "je", "se"]
      : layout.id === "en" ? ["the", "and", "I"] : [];
    return [...naucene, ...fallback].filter((x, i, arr) => arr.indexOf(x) === i).slice(0, 3);
  }

  function vypocitejNavrhy() {
    const layout = aktualniLayout();
    if (mode !== "letters" || layout.compose || layout.id === "emoji" || layout.id === "unicode") return [];

    const kontext = core()?.ziskejKontextVlastniKlavesnice?.();
    const prefix = String(kontext?.prefix || "");
    if (!prefix) return vychoziNavrhy(layout);

    const key = lowerLocale(prefix, layout);
    const keyBez = bezDiakritiky(key);
    const mapa = naucenaSlova[layout.id] || {};
    const kandidati = [];
    const seen = new Set();

    const pridej = (word, score = 0) => {
      const raw = String(word || "").trim();
      if (!raw) return;
      const lower = lowerLocale(raw, layout);
      const lowerBez = bezDiakritiky(lower);
      if (!lower.startsWith(key) && !lowerBez.startsWith(keyBez)) return;
      const id = lower;
      if (seen.has(id)) return;
      seen.add(id);
      kandidati.push({ word: raw, score });
    };

    /* První položka odpovídá systémovým klávesnicím: to, co uživatel
       skutečně napsal, zůstává vždy přijatelné i bez automatické opravy. */
    pridej(prefix, 100000);

    Object.values(mapa).forEach((entry) => {
      const count = Number(entry?.count || 0);
      pridej(entry?.word, 50000 + count * 100 - String(entry?.word || "").length);
    });

    (SLOVNIK_NAVRHU[layout.id] || []).forEach((word, index) => {
      const lower = lowerLocale(word, layout);
      const exactAccent = lower.startsWith(key) ? 1000 : 600;
      const exactWord = bezDiakritiky(lower) === keyBez ? 1500 : 0;
      pridej(word, exactAccent + exactWord - index * 0.01 - word.length * 0.1);
    });

    return kandidati
      .sort((a, b) => b.score - a.score || a.word.length - b.word.length)
      .map((x) => zachovejVelikost(prefix, x.word, layout))
      .filter((x, i, arr) => arr.indexOf(x) === i)
      .slice(0, 3);
  }

  function aktualizujNavrhy() {
    if (!navrhyBox) return;
    const layout = aktualniLayout();
    const podporovano = mode === "letters" && !layout.compose && layout.id !== "emoji" && layout.id !== "unicode";
    navrhyBox.hidden = !podporovano;
    navrhyBox.replaceChildren();
    if (!podporovano) return;

    const navrhy = vypocitejNavrhy();
    while (navrhy.length < 3) navrhy.push("");
    navrhy.slice(0, 3).forEach((value, index) => {
      const b = button(value || " ", "suggestion", value, `ln-lk-suggestion ln-lk-suggestion-${index + 1}`,
        value ? `Návrh slova: ${value}` : "Prázdný návrh");
      if (!value) b.disabled = true;
      navrhyBox.appendChild(b);
    });
  }

  function ulozRecent(text) {
    for (const znak of Array.from(String(text || ""))) {
      if (!znak.trim() || /^[\x20-\x7E]$/.test(znak)) continue;
      recent = [znak, ...recent.filter((x) => x !== znak)].slice(0, 24);
    }
    try { localStorage.setItem(ULOZ_RECENT, JSON.stringify(recent)); } catch (_error) {}
  }

  function aktualniLayout() {
    return LAYOUTY[layoutId] || LAYOUTY.en;
  }

  function jeEditorV2(el) {
    return Boolean(el?.matches?.(".ln-v2-editor[data-ln-v2-editor]") && el.isConnected);
  }

  function najdiEditor() {
    const zApi = core()?.ziskejEditorElement?.();
    if (jeEditorV2(zApi) && zApi.offsetParent !== null) return zApi;
    return Array.from(document.querySelectorAll(".ln-v2-editor[data-ln-v2-editor]"))
      .find((el) => el.offsetParent !== null) || null;
  }

  function haptic() {
    try { navigator.vibrate?.(7); } catch (_error) {}
  }

  function schovejSystemovou() {
    try { navigator.virtualKeyboard?.hide?.(); } catch (_error) {}
  }

  function pripravEditor(editor) {
    if (!jeEditorV2(editor)) return;
    aktivniEditor = editor;

    /* Dočasný systémový režim platí do blur tohoto konkrétního editoru. */
    if (editor === systemovyEditor) return;
    editor.setAttribute("inputmode", "none");
    editor.setAttribute("autocorrect", "off");
    editor.setAttribute("autocomplete", "off");
    editor.setAttribute("autocapitalize", "off");
    editor.setAttribute("spellcheck", "false");
    editor.setAttribute("virtualkeyboardpolicy", "manual");
    editor.dataset.lubaKeyboard = "universal-v1";

    if (editor.dataset.lubaKeyboardEvents === "1") return;
    editor.dataset.lubaKeyboardEvents = "1";

    const aktivuj = () => {
      aktivniEditor = editor;
      zobraz();
      requestAnimationFrame(schovejSystemovou);
      setTimeout(schovejSystemovou, 50);
      setTimeout(schovejSystemovou, 160);
    };

    editor.addEventListener("focus", aktivuj, true);
    editor.addEventListener("pointerup", aktivuj, true);
    editor.addEventListener("touchend", aktivuj, { capture: true, passive: true });
  }

  function nastavVysku() {
    if (!panel || panel.hidden) return;
    const height = Math.ceil(panel.getBoundingClientRect().height || 0);
    document.documentElement.style.setProperty("--ln-lk-height", `${height}px`);
  }

  function button(label, action, value = "", classes = "", aria = "") {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `ln-lk-key ${classes}`.trim();
    b.dataset.lkAction = action;
    if (value !== "") b.dataset.lkValue = value;
    b.textContent = label;
    b.tabIndex = -1;
    if (aria) b.setAttribute("aria-label", aria);
    return b;
  }

  function localUpper(value, layout) {
    try { return value.toLocaleUpperCase(layout.locale || undefined); }
    catch (_error) { return value.toUpperCase(); }
  }

  function kanaKatakana(value) {
    return Array.from(value).map((c) => {
      const cp = c.codePointAt(0);
      return cp >= 0x3041 && cp <= 0x3096 ? String.fromCodePoint(cp + 0x60) : c;
    }).join("");
  }

  function zobrazHodnotu(raw, layout) {
    if (layout.shift === "katakana" && (shift || caps)) return kanaKatakana(raw);
    if (layout.shift === "hangul" && (shift || caps)) return H_SHIFT[raw] || raw;
    if (layout.shift === true && (shift || caps)) return localUpper(raw, layout);
    return raw;
  }

  function altPro(raw, layout) {
    const alt = layout.alt?.[raw];
    if (!alt) return [];
    let values = znaky(String(alt));
    if ((shift || caps) && layout.shift === true) values = values.map((x) => localUpper(x, layout));
    if ((shift || caps) && layout.shift === "katakana") values = values.map(kanaKatakana);
    return values;
  }

  function pridejRadek(values, layout, classes = "", options = {}) {
    const row = document.createElement("div");
    const standard = options.standard === true;
    const rowIndex = Number.isInteger(options.rowIndex) ? options.rowIndex : -1;
    row.className = `ln-lk-row ${classes}`.trim();
    if (standard) {
      row.classList.add("ln-lk-standard-row", `ln-lk-standard-row-${rowIndex + 1}`);
    }
    if (layout.dir === "rtl") row.dir = "rtl";

    /* PATCH 443 – na třetím standardním řádku je Shift stejně jako
       na běžné mobilní klávesnici. Všechny písmenové klávesy mají
       stejnou šířku; pouze Shift a Backspace jsou funkční klávesy. */
    if (standard && rowIndex === 2) {
      const shiftLabel = shift || caps ? "⇧" : "⇧";
      row.appendChild(button(shiftLabel, "shift", "", `ln-lk-standard-side ln-lk-shift-key ${(shift || caps) ? "is-active" : ""}`, "Shift"));
    }

    for (const raw of values) {
      const value = zobrazHodnotu(raw, layout);
      const alts = altPro(raw, layout);
      const classesKey = `${alts.length ? "has-alt" : ""} ${standard ? "ln-lk-letter-key" : ""}`.trim();
      const b = button(value, "text", value, classesKey, value);
      if (alts.length) b.dataset.lkAlt = JSON.stringify(alts);
      row.appendChild(b);
    }

    if (standard && rowIndex === 2) {
      row.appendChild(button("⌫", "backspace", "", "ln-lk-standard-side ln-lk-back-key", "Backspace"));
    }

    telo.appendChild(row);
  }

  function vykresliLetters() {
    const layout = aktualniLayout();
    telo.classList.toggle("is-grid", layout.grid === true);
    telo.classList.toggle("is-dense", layout.dense === true);
    telo.dataset.dir = layout.dir || "ltr";

    if (layout.id === "unicode") {
      vykresliUnicode();
      return;
    }

    const standard = layout.standardMobile === true && layout.rows.length === 3;
    telo.classList.toggle("is-standard", standard);

    /* PATCH 443 – stejně jako referenční systémová klávesnice uživatele
       má základní české/anglické rozložení samostatnou číselnou řadu. */
    if (standard) {
      pridejRadek(radek("1234567890"), { id: "standard-numbers" }, "ln-lk-standard-number-row", { standard: true, rowIndex: -1 });
    }

    layout.rows.forEach((values, rowIndex) => {
      pridejRadek(values, layout, layout.grid ? "ln-lk-grid-row" : "", { standard, rowIndex });
    });

    if (Array.isArray(layout.extra) && layout.extra.length) {
      const extra = document.createElement("div");
      extra.className = "ln-lk-row ln-lk-extra";
      extra.dir = layout.dir || "ltr";
      for (const raw of layout.extra) {
        const value = zobrazHodnotu(raw, layout);
        const alts = altPro(raw, layout);
        const b = button(value, "text", value, `ln-lk-small ${alts.length ? "has-alt" : ""}`, value);
        if (alts.length) b.dataset.lkAlt = JSON.stringify(alts);
        extra.appendChild(b);
      }
      telo.appendChild(extra);
    }
  }

  function vykresliSymbols() {
    const layout = aktualniLayout();
    const standard = layout.standardMobile === true;
    telo.classList.remove("is-grid", "is-dense");
    telo.classList.toggle("is-standard", standard);
    telo.classList.toggle("is-standard-symbols", standard);

    /* PATCH 444 – pořadí znaků vychází z Android Czech keyboard mapy
       Unicode CLDR. Stránka 1 = běžné symboly, stránka 2 = rozšířené. */
    const rows = symbolPage === 0 ? [
      znaky("1234567890"),
      ["@", "#", "$", "%", "&", "-", "+", "(", ")"],
      ["*", '"', "'", ":", ";", "!", "?"],
      ["_", "/", ",", "."]
    ] : [
      ["~", "`", "|", "•", "√", "Π", "÷", "×", "¶", "∆"],
      ["£", "¢", "€", "¥", "^", "°", "=", "{", "}"],
      ["\\", "©", "®", "™", "℅", "[", "]"],
      ["<", ">", ",", "."]
    ];

    rows.forEach((values, rowIndex) => {
      pridejRadek(values, { id: "symbols" }, `ln-lk-symbol-row ln-lk-symbol-row-${rowIndex + 1}`);
    });
  }

  function vykresliUnicode() {
    telo.classList.remove("is-grid", "is-dense");
    const rows = [["1","2","3","4","5","6","7","8"], ["9","0","A","B","C","D","E","F"]];
    for (const vals of rows) {
      const row = document.createElement("div");
      row.className = "ln-lk-row";
      vals.forEach((x) => row.appendChild(button(x, "unicode-hex", x)));
      telo.appendChild(row);
    }
    const actions = document.createElement("div");
    actions.className = "ln-lk-row";
    actions.append(
      button("⌫", "unicode-back", "", "ln-lk-wide", "Smazat číslici kódu"),
      button("Vložit U+", "unicode-insert", "", "ln-lk-space", "Vložit Unicode znak"),
      button("Vyčistit", "unicode-clear", "", "ln-lk-wide", "Vyčistit Unicode kód")
    );
    telo.appendChild(actions);
    if (recent.length) {
      const rec = document.createElement("div");
      rec.className = "ln-lk-row ln-lk-extra";
      recent.forEach((x) => rec.appendChild(button(x, "text", x, "ln-lk-small")));
      telo.appendChild(rec);
    }
  }

  function vykresliBottom() {
    const layout = aktualniLayout();
    const row = document.createElement("div");
    const standard = layout.standardMobile === true;
    row.className = `ln-lk-row ln-lk-bottom ${standard ? "ln-lk-bottom-standard" : ""}`.trim();

    if (standard) {
      /* PATCH 444 – jazyk už má vlastní tlačítko nahoře, proto ve spodní
         řadě není duplicitní globus. ?123 se v symbolové vrstvě správně
         změní na ABC, ne na volbu jazyka. */
      if (mode === "letters") {
        row.appendChild(button("?123", "symbols", "", "ln-lk-std-symbols", "Čísla a symboly"));
      } else {
        row.appendChild(button("ABC", "symbols", "", "ln-lk-std-symbols", "Zpět na písmena"));
        row.appendChild(button(symbolPage === 0 ? "=\\<" : "?123", "symbols-more", "", "ln-lk-std-more", "Další symboly"));
      }
      row.appendChild(button(",", "text", ",", "ln-lk-std-punct", "Čárka"));
      row.appendChild(button("mezera", "space", "", "ln-lk-space ln-lk-std-space", "Mezera"));
      const tecka = button(".", "text", ".", "ln-lk-std-punct has-alt", "Tečka – podržením další znaky");
      tecka.dataset.lkAlt = JSON.stringify(TECKA_ALT);
      row.appendChild(tecka);
      row.appendChild(button("↵", "enter", "", "ln-lk-enter ln-lk-std-enter", "Enter"));
      telo.appendChild(row);
      return;
    }

    /* Jazyk se přepíná horním tlačítkem i u ostatních layoutů. */
    if (layout.shift && mode === "letters" && layout.id !== "unicode") {
      const label = layout.shift === "katakana" ? (shift || caps ? "カナ" : "かな") : "⇧";
      row.appendChild(button(label, "shift", "", `ln-lk-fn ${(shift || caps) ? "is-active" : ""}`, "Shift"));
    } else {
      row.appendChild(button(mode === "symbols" ? "ABC" : "123", "symbols", "", "ln-lk-fn", "Písmena a symboly"));
    }

    row.appendChild(button("←", "left", "", "ln-lk-nav", "Kurzor vlevo"));
    row.appendChild(button(layout.dir === "rtl" ? "مسافة" : "mezera", "space", "", "ln-lk-space", "Mezera"));
    row.appendChild(button("→", "right", "", "ln-lk-nav", "Kurzor vpravo"));
    row.appendChild(button("⌫", "backspace", "", "ln-lk-back", "Backspace"));
    row.appendChild(button("↵", "enter", "", "ln-lk-enter", "Enter"));
    telo.appendChild(row);
  }

  function vykresliKlavesnici() {
    if (!telo) return;
    telo.replaceChildren();
    const layout = aktualniLayout();
    if (jazykButton) jazykButton.textContent = `${layout.badge} · ${layout.nazev}`;
    panel?.setAttribute("data-layout", layout.id);
    panel?.setAttribute("dir", "ltr");

    if (mode === "symbols" && layout.id !== "unicode") vykresliSymbols();
    else vykresliLetters();
    vykresliBottom();
    aktualizujCompose();
    aktualizujNavrhy();
    requestAnimationFrame(nastavVysku);
  }

  function pinyinCandidates() {
    const key = pinyinBuffer.toLowerCase().replace(/[^a-z]/g, "");
    if (!key) return [];
    const exact = PINYIN[key] || "";
    if (Array.isArray(exact)) return exact.slice(0, 10);
    return Array.from(exact).slice(0, 10);
  }

  function composeHangulChar() {
    const { L, V, T } = hangulState;
    if (L == null && V == null) return "";
    if (L != null && V != null) {
      return String.fromCodePoint(0xAC00 + (L * 21 + V) * 28 + (T || 0));
    }
    if (L != null) return H_L[L] || "";
    if (V != null) return H_V[V] || "";
    return "";
  }

  function hangulText() {
    return hangulPrefix + composeHangulChar();
  }

  function unicodePreview() {
    if (!unicodeBuffer) return "";
    const cp = Number.parseInt(unicodeBuffer, 16);
    if (!Number.isFinite(cp) || cp < 0 || cp > 0x10FFFF || (cp >= 0xD800 && cp <= 0xDFFF)) return "neplatný kód";
    try { return String.fromCodePoint(cp); } catch (_error) { return "neplatný kód"; }
  }

  function aktualizujCompose() {
    if (!composeBox || !candidates) return;
    candidates.replaceChildren();
    const layout = aktualniLayout();
    let text = "";
    let kandidati = [];

    if (layout.compose === "pinyin") {
      text = pinyinBuffer ? `拼音: ${pinyinBuffer}` : "Pinyin – napiš výslovnost a vyber znak";
      kandidati = pinyinCandidates();
    } else if (layout.compose === "hangul") {
      text = hangulText() ? `조합: ${hangulText()}` : "Hangul – skládání slabik probíhá uvnitř LubaKeyboard";
    } else if (layout.compose === "unicode") {
      const preview = unicodePreview();
      text = unicodeBuffer ? `U+${unicodeBuffer.toUpperCase()}  ${preview}` : "Unicode – zadej hex kód znaku (např. 4F60 = 你)";
    }

    composeBox.hidden = !layout.compose;
    composeBox.querySelector(".ln-lk-compose-text").textContent = text;

    if (kandidati.length) {
      kandidati.forEach((value, index) => {
        const b = button(value, "candidate", value, "ln-lk-candidate", `Kandidát ${index + 1}: ${value}`);
        candidates.appendChild(b);
      });
    }
  }

  function nastavLayout(id) {
    if (!LAYOUTY[id]) return;
    flushCompose("switch-layout", false);
    layoutId = id;
    mode = "letters";
    shift = false;
    caps = false;
    localStorage.setItem(ULOZ_LAYOUT, id);
    zavriChooser();
    vykresliKlavesnici();
  }

  function skupinyLayoutu() {
    const map = new Map();
    Object.values(LAYOUTY).forEach((layout) => {
      if (!map.has(layout.skupina)) map.set(layout.skupina, []);
      map.get(layout.skupina).push(layout);
    });
    return map;
  }

  function otevriChooser() {
    if (!chooser) return;
    chooser.replaceChildren();
    const head = document.createElement("div");
    head.className = "ln-lk-chooser-head";
    head.innerHTML = `<strong>Jazyk a písmo</strong><span>Unicode fallback zpřístupní libovolný znak.</span>`;
    chooser.appendChild(head);

    for (const [name, layouts] of skupinyLayoutu()) {
      const section = document.createElement("section");
      section.className = "ln-lk-layout-group";
      const title = document.createElement("div");
      title.className = "ln-lk-layout-group-title";
      title.textContent = name;
      const grid = document.createElement("div");
      grid.className = "ln-lk-layout-grid";
      layouts.forEach((layout) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = `ln-lk-layout-choice ${layout.id === layoutId ? "is-active" : ""}`;
        b.dataset.lkLayout = layout.id;
        b.tabIndex = -1;
        b.innerHTML = `<span class="ln-lk-layout-badge">${layout.badge}</span><span>${layout.nazev}</span>`;
        grid.appendChild(b);
      });
      section.append(title, grid);
      chooser.appendChild(section);
    }

    const footer = document.createElement("div");
    footer.className = "ln-lk-chooser-footer";
    const system = document.createElement("button");
    system.type = "button";
    system.className = "ln-lk-system-choice";
    system.dataset.lkSystem = "1";
    system.textContent = "Dočasně použít systémovou klávesnici";
    footer.appendChild(system);
    chooser.appendChild(footer);
    chooser.hidden = false;
    requestAnimationFrame(nastavVysku);
  }

  function zavriChooser() {
    if (chooser) chooser.hidden = true;
  }

  function systemMode() {
    flushCompose("system-mode", false);
    zavriChooser();
    skryj();
    const editor = aktivniEditor || najdiEditor();
    if (!editor) return;
    editor.setAttribute("inputmode", "text");
    editor.setAttribute("autocorrect", "on");
    editor.setAttribute("autocapitalize", "sentences");
    editor.setAttribute("spellcheck", "true");
    systemovyEditor = editor;
    try { editor.focus({ preventScroll: true }); } catch (_error) {}

    editor.addEventListener("blur", () => {
      if (systemovyEditor !== editor) return;
      systemovyEditor = null;
      pripravEditor(editor);
    }, { once: true });
  }

  function insertCore(text) {
    const api = core();
    if (!api?.provedPrikazVlastniKlavesnice || !text) return false;
    const ok = api.provedPrikazVlastniKlavesnice("text", text) !== false;
    if (ok) ulozRecent(text);
    return ok;
  }

  function commandCore(type, value = "") {
    const api = core();
    if (!api?.provedPrikazVlastniKlavesnice) return false;
    return api.provedPrikazVlastniKlavesnice(type, value) !== false;
  }

  function flushPinyin(useCandidate = true) {
    if (!pinyinBuffer) return "";
    let output = pinyinBuffer;
    const cands = pinyinCandidates();
    if (useCandidate && cands.length) output = cands[0];
    pinyinBuffer = "";
    insertCore(output);
    return output;
  }

  function hangulFlushCurrent() {
    const current = composeHangulChar();
    if (current) hangulPrefix += current;
    hangulState = { L: null, V: null, T: null };
  }

  function flushHangul() {
    const value = hangulText();
    hangulPrefix = "";
    hangulState = { L: null, V: null, T: null };
    if (value) insertCore(value);
    return value;
  }

  function flushCompose(reason = "", useCandidate = true) {
    const layout = aktualniLayout();
    if (layout.compose === "pinyin") flushPinyin(useCandidate);
    else if (layout.compose === "hangul") flushHangul();
    else if (layout.compose === "unicode" && reason === "hide") unicodeBuffer = "";
    aktualizujCompose();
  }

  function hangulInput(jamo) {
    const cIndex = H_L.indexOf(jamo);
    const vIndex = H_V.indexOf(jamo);

    if (cIndex >= 0) {
      if (hangulState.L == null && hangulState.V == null) {
        hangulState.L = cIndex;
      } else if (hangulState.L != null && hangulState.V == null) {
        hangulFlushCurrent();
        hangulState.L = cIndex;
      } else if (hangulState.L != null && hangulState.V != null && !hangulState.T) {
        if (H_SIMPLE_T.has(jamo)) {
          hangulState.T = H_T.indexOf(jamo);
        } else {
          hangulFlushCurrent();
          hangulState.L = cIndex;
        }
      } else {
        hangulFlushCurrent();
        hangulState.L = cIndex;
      }
    } else if (vIndex >= 0) {
      if (hangulState.L == null && hangulState.V == null) {
        hangulState.L = H_L.indexOf("ㅇ");
        hangulState.V = vIndex;
      } else if (hangulState.L != null && hangulState.V == null) {
        hangulState.V = vIndex;
      } else if (hangulState.L != null && hangulState.V != null && !hangulState.T) {
        const combined = H_V_COMBINE[`${H_V[hangulState.V]}${jamo}`];
        if (combined) {
          hangulState.V = H_V.indexOf(combined);
        } else {
          hangulFlushCurrent();
          hangulState.L = H_L.indexOf("ㅇ");
          hangulState.V = vIndex;
        }
      } else if (hangulState.L != null && hangulState.V != null && hangulState.T) {
        const finalJamo = H_T[hangulState.T];
        const nextL = H_L.indexOf(finalJamo);
        hangulState.T = null;
        hangulFlushCurrent();
        hangulState.L = nextL >= 0 ? nextL : H_L.indexOf("ㅇ");
        hangulState.V = vIndex;
      }
    } else {
      flushHangul();
      insertCore(jamo);
    }

    aktualizujCompose();
  }

  function hangulBackspace() {
    const s = hangulState;
    if (s.T) s.T = null;
    else if (s.V != null) s.V = null;
    else if (s.L != null) s.L = null;
    else if (hangulPrefix) hangulPrefix = Array.from(hangulPrefix).slice(0, -1).join("");
    else commandCore("backspace");
    aktualizujCompose();
  }

  function unicodeInsert() {
    if (!unicodeBuffer) return;
    const cp = Number.parseInt(unicodeBuffer, 16);
    if (!Number.isFinite(cp) || cp < 0 || cp > 0x10FFFF || (cp >= 0xD800 && cp <= 0xDFFF)) {
      panel?.classList.add("ln-lk-error");
      setTimeout(() => panel?.classList.remove("ln-lk-error"), 350);
      return;
    }
    insertCore(String.fromCodePoint(cp));
    unicodeBuffer = "";
    aktualizujCompose();
  }

  function textAction(value) {
    const layout = aktualniLayout();
    if (layout.compose === "pinyin" && /^[A-Za-z]$/.test(value)) {
      pinyinBuffer += value.toLowerCase();
      aktualizujCompose();
      return;
    }
    if (layout.compose === "hangul") {
      hangulInput(value);
      return;
    }
    insertCore(value);
    if (shift && !caps) {
      shift = false;
      vykresliKlavesnici();
    }
  }

  function spaceAction() {
    const layout = aktualniLayout();
    if (!layout.compose) naucAktualniSlovo();
    if (layout.compose === "pinyin" && pinyinBuffer) {
      flushPinyin(true);
      aktualizujCompose();
      return;
    }
    if (layout.compose === "hangul" && hangulText()) flushHangul();
    commandCore("space");
    aktualizujCompose();
  }

  function enterAction() {
    if (!aktualniLayout().compose) naucAktualniSlovo();
    flushCompose("enter", true);
    commandCore("enter");
  }

  function backspaceAction() {
    const layout = aktualniLayout();
    if (layout.compose === "pinyin" && pinyinBuffer) {
      pinyinBuffer = pinyinBuffer.slice(0, -1);
      aktualizujCompose();
      return;
    }
    if (layout.compose === "unicode" && unicodeBuffer) {
      unicodeBuffer = unicodeBuffer.slice(0, -1);
      aktualizujCompose();
      return;
    }
    if (layout.compose === "hangul") {
      hangulBackspace();
      return;
    }
    commandCore("backspace");
  }

  function moveAction(type) {
    flushCompose("move", false);
    commandCore(type);
  }

  function candidateAction(value) {
    if (!value) return;
    pinyinBuffer = "";
    insertCore(value);
    aktualizujCompose();
  }

  function suggestionAction(value) {
    const navrh = String(value || "").trim();
    if (!navrh) return;
    naucSlovo(navrh, 4);
    commandCore("suggestion", navrh);
    aktualizujNavrhy();
  }

  function shiftAction() {
    const now = performance.now();
    const last = Number(panel?.dataset.lastShift || 0);
    panel.dataset.lastShift = String(now);
    if (now - last < 360) {
      caps = !caps;
      shift = caps;
    } else if (caps) {
      caps = false;
      shift = false;
    } else {
      shift = !shift;
    }
    vykresliKlavesnici();
  }

  function symbolsAction() {
    flushCompose("symbols", false);
    mode = mode === "symbols" ? "letters" : "symbols";
    symbolPage = 0;
    shift = false;
    caps = false;
    vykresliKlavesnici();
  }

  function symbolsMoreAction() {
    if (mode !== "symbols") return;
    symbolPage = symbolPage === 0 ? 1 : 0;
    vykresliKlavesnici();
  }

  function provedAkci(action, value = "") {
    haptic();
    switch (action) {
      case "text": textAction(value); break;
      case "space": spaceAction(); break;
      case "enter": enterAction(); break;
      case "backspace": backspaceAction(); break;
      case "left": moveAction("left"); break;
      case "right": moveAction("right"); break;
      case "undo": flushCompose("undo", false); commandCore("undo"); break;
      case "redo": flushCompose("redo", false); commandCore("redo"); break;
      case "shift": shiftAction(); break;
      case "symbols": symbolsAction(); break;
      case "symbols-more": symbolsMoreAction(); break;
      case "chooser": chooser?.hidden ? otevriChooser() : zavriChooser(); break;
      case "hide": skryj(); break;
      case "candidate": candidateAction(value); break;
      case "suggestion": suggestionAction(value); break;
      case "unicode-hex": unicodeBuffer = (unicodeBuffer + value).slice(0, 6); aktualizujCompose(); break;
      case "unicode-back": unicodeBuffer = unicodeBuffer.slice(0, -1); aktualizujCompose(); break;
      case "unicode-clear": unicodeBuffer = ""; aktualizujCompose(); break;
      case "unicode-insert": unicodeInsert(); break;
      default: break;
    }
    requestAnimationFrame(() => {
      try { aktivniEditor?.focus({ preventScroll: true }); } catch (_error) {}
      schovejSystemovou();
    });
  }

  function oznacAltVolbu(volba, vibruj = false) {
    if (!altPopup) return;
    const nova = volba?.matches?.(".ln-lk-alt-key") ? volba : null;
    altPopup.querySelectorAll(".ln-lk-alt-key.is-slide-selected")
      .forEach((el) => el.classList.remove("is-slide-selected"));
    altPopup.querySelectorAll(".ln-lk-alt-row.is-active-row")
      .forEach((el) => el.classList.remove("is-active-row"));
    aktivniAltVolba = nova;
    if (nova) {
      nova.classList.add("is-slide-selected");
      nova.closest(".ln-lk-alt-row")?.classList.add("is-active-row");
      if (vibruj && nova !== posledniAltVolba) {
        try { navigator.vibrate?.(3); } catch (_error) {}
      }
    }
    posledniAltVolba = nova;
  }

  /*
   * PATCH 447 – AXIS ALT GESTURE
   * ----------------------------
   * Po long-pressu se prst NESMÍ honit za bublinou. Výběr je relativní
   * k místu původního dotyku stejně jako na systémových klávesnicích:
   *   - vodorovný pohyb vybírá znak v aktuální řadě,
   *   - malý pohyb nahoru přepne do horní řady,
   *   - návrat dolů přepne zpět do spodní řady,
   *   - uvolnění prstu vloží právě označený znak.
   * Souřadnice samotných tlačítek popupu proto nejsou pro gesto zdrojem
   * pravdy; popup je jen vizuální projekce výběru.
   */
  function altVolbaPodPrstem(x, y) {
    if (!altPopup || altPopup.hidden) return null;

    const maHorni = altRadkyElementy.top.length > 0;
    const maStredni = altRadkyElementy.middle.length > 0;
    const dy = y - longPressStartY;

    if (maStredni) {
      /*
       * PATCH 448 – interpunkce má tři výškové zóny.
       * Prst zůstává nad původní tečkou: malý pohyb nahoru = prostřední
       * řada, větší pohyb nahoru = horní řada. X dál vybírá znak.
       * Hystereze zabraňuje přeskakování při chvění palce.
       */
      if (altAktivniRadek === "bottom") {
        if (dy <= -46) altAktivniRadek = "top";
        else if (dy <= -16) altAktivniRadek = "middle";
      } else if (altAktivniRadek === "middle") {
        if (dy <= -46) altAktivniRadek = "top";
        else if (dy >= -8) altAktivniRadek = "bottom";
      } else if (altAktivniRadek === "top") {
        if (dy >= -36) altAktivniRadek = dy >= -8 ? "bottom" : "middle";
      }
    } else if (maHorni) {
      /* Běžná písmena zůstávají ve dvou řadách jako v 447. */
      if (altAktivniRadek === "bottom" && dy <= -20) {
        altAktivniRadek = "top";
      } else if (altAktivniRadek === "top" && dy >= -7) {
        altAktivniRadek = "bottom";
      }
    } else {
      altAktivniRadek = "bottom";
    }

    const radek = altRadkyElementy[altAktivniRadek] || [];
    if (!radek.length) return null;

    /* Interpunkce je u pravého okraje – menší krok dává pohodlnější výběr. */
    const KROK_X = maStredni ? 24 : 27;
    const dx = x - longPressStartX;
    const kotva = altKotvaIndex[altAktivniRadek] || 0;
    const index = Math.max(0, Math.min(radek.length - 1, kotva + Math.round(dx / KROK_X)));
    return radek[index] || null;
  }

  function sledujAltPrst(event) {
    if (!longPressUsed || !altPopup || altPopup.hidden) return false;
    if (longPressPointerId != null && event.pointerId !== longPressPointerId) return false;
    const volba = altVolbaPodPrstem(event.clientX, event.clientY);
    if (volba) oznacAltVolbu(volba, true);
    return true;
  }

  function potvrditAltPrstem(event) {
    if (!longPressUsed || !altPopup || altPopup.hidden) return false;
    if (longPressPointerId != null && event.pointerId !== longPressPointerId) return false;
    const volba = altVolbaPodPrstem(event.clientX, event.clientY) || aktivniAltVolba;
    if (volba?.dataset.lkAction) {
      provedAkci(volba.dataset.lkAction, volba.dataset.lkValue || "");
    }
    zavriAlt();
    longPressUsed = false;
    longPressPointerId = null;
    aktivniAltVolba = null;
    posledniAltVolba = null;
    return true;
  }

  function otevriAlt(buttonEl) {
    if (!altPopup || !buttonEl?.dataset.lkAlt) return false;
    let values = [];
    try { values = JSON.parse(buttonEl.dataset.lkAlt); } catch (_error) {}
    if (!Array.isArray(values) || !values.length) return false;

    const jeInterpunkce = String(buttonEl.dataset.lkValue || buttonEl.textContent || "") === ".";

    altPopup.replaceChildren();
    altPopup.classList.toggle("is-punctuation", jeInterpunkce);
    altPopup.classList.toggle("is-three-rows", jeInterpunkce);

    const vytvorRadek = (typ, hodnoty, preferovanaHodnota = null) => {
      if (!hodnoty.length) return [];
      const radekEl = document.createElement("div");
      radekEl.className = `ln-lk-alt-row ln-lk-alt-row-${typ}`;
      radekEl.dataset.lkAltRow = typ;
      radekEl.style.setProperty("--ln-lk-alt-row-cols", String(hodnoty.length));
      const elementy = hodnoty.map((value, index) => {
        const volba = button(value, "text", value, "ln-lk-alt-key");
        volba.dataset.lkAltRow = typ;
        volba.dataset.lkAltIndex = String(index);
        volba.setAttribute("aria-label", `Varianta ${value}`);
        if (value === preferovanaHodnota) volba.classList.add("is-preferred");
        radekEl.appendChild(volba);
        return volba;
      });
      altPopup.appendChild(radekEl);
      return elementy;
    };

    altRadkyElementy = { top: [], middle: [], bottom: [] };

    if (jeInterpunkce) {
      /*
       * PATCH 448 – tečka: 3 krátké řady místo širokého panelu.
       * DOM pořadí je horní → prostřední → spodní; gesto začíná dole.
       */
      altRadkyElementy.top = vytvorRadek("top", [...TECKA_ALT_RADKY.top]);
      altRadkyElementy.middle = vytvorRadek("middle", [...TECKA_ALT_RADKY.middle]);
      altRadkyElementy.bottom = vytvorRadek("bottom", [...TECKA_ALT_RADKY.bottom], ",");

      /* Tečka je u pravého okraje. Kotva na pravém konci znamená, že
         všechny znaky jsou dosažitelné tahem doleva bez cesty za displej. */
      altKotvaIndex = {
        top: Math.max(0, altRadkyElementy.top.length - 1),
        middle: Math.max(0, altRadkyElementy.middle.length - 1),
        bottom: Math.max(0, altRadkyElementy.bottom.length - 1)
      };
      altAktivniRadek = "bottom";
    } else {
      /* PATCH 447 – písmena zůstávají ve dvou řadách. */
      const pocetSpodni = values.length <= 4 ? values.length : Math.ceil(values.length / 2);
      const spodniRaw = values.slice(0, pocetSpodni);
      const horniRaw = values.slice(pocetSpodni);

      let spodni = spodniRaw.slice();
      if (spodni.length >= 3) {
        const preferovana = spodni.shift();
        const stred = Math.floor(spodniRaw.length / 2) - (spodniRaw.length % 2 === 0 ? 1 : 0);
        spodni.splice(Math.max(0, stred), 0, preferovana);
      }

      altRadkyElementy.top = vytvorRadek("top", horniRaw);
      altRadkyElementy.bottom = vytvorRadek("bottom", spodni, values[0]);

      const prefIndex = Math.max(0, altRadkyElementy.bottom.findIndex((el) => el.classList.contains("is-preferred")));
      altKotvaIndex = {
        bottom: prefIndex,
        middle: 0,
        top: altRadkyElementy.top.length ? Math.floor((altRadkyElementy.top.length - 1) / 2) : 0
      };
      altAktivniRadek = "bottom";
    }

    const rect = buttonEl.getBoundingClientRect();
    altPopup.hidden = false;
    altPopup.style.right = "auto";
    altPopup.style.left = "6px";
    altPopup.style.bottom = `${Math.max(58, window.innerHeight - rect.top + 7)}px`;

    requestAnimationFrame(() => {
      if (!altPopup || altPopup.hidden) return;
      const box = altPopup.getBoundingClientRect();
      const sirka = Math.min(box.width || 0, window.innerWidth - 12);

      let left;
      if (jeInterpunkce) {
        /* Panel je celý nalevo od tečky; odpovídá i směru gesta. */
        const kotvaX = rect.left + rect.width / 2;
        left = kotvaX - sirka + 24;
      } else {
        const stred = rect.left + rect.width / 2;
        left = stred - sirka / 2;
      }
      left = Math.max(6, Math.min(window.innerWidth - sirka - 6, left));
      altPopup.style.left = `${Math.round(left)}px`;
    });

    longPressUsed = true;
    const vychozi = jeInterpunkce
      ? altRadkyElementy.bottom[altKotvaIndex.bottom]
      : altRadkyElementy.bottom[altKotvaIndex.bottom] || altRadkyElementy.bottom[0];
    oznacAltVolbu(vychozi, false);
    return true;
  }

  function zavriAlt() {
    if (altPopup) altPopup.hidden = true;
    altRadkyElementy = { top: [], middle: [], bottom: [] };
    altKotvaIndex = { top: 0, middle: 0, bottom: 0 };
    altAktivniRadek = "bottom";
    aktivniAltVolba = null;
    posledniAltVolba = null;
  }

  function startLongPress(buttonEl, event = null) {
    clearTimeout(longPressTimer);
    longPressUsed = false;
    longPressPointerId = event?.pointerId ?? null;
    longPressStartX = Number(event?.clientX || 0);
    longPressStartY = Number(event?.clientY || 0);
    altAktivniRadek = "bottom";
    aktivniAltVolba = null;
    posledniAltVolba = null;
    if (!buttonEl?.dataset.lkAlt) return;
    longPressTimer = setTimeout(() => {
      otevriAlt(buttonEl);
      haptic();
    }, 420);
  }

  function stopLongPress() {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }

  function startRepeat(action) {
    if (!["backspace", "left", "right"].includes(action)) return;
    stopRepeat();
    repeatTimer = setTimeout(() => {
      repeatInterval = setInterval(() => provedAkci(action), 68);
    }, 430);
  }

  function stopRepeat() {
    clearTimeout(repeatTimer);
    clearInterval(repeatInterval);
    repeatTimer = null;
    repeatInterval = null;
  }

  function vytvorPanel() {
    if (panel?.isConnected) return;

    panel = document.createElement("section");
    panel.id = "lubaKeyboard";
    panel.className = "ln-luba-keyboard";
    panel.hidden = true;
    panel.setAttribute("aria-label", "LubaNote vlastní klávesnice");
    panel.innerHTML = `
      <div class="ln-lk-top">
        <div class="ln-lk-brand"><span class="ln-lk-logo">L</span><strong>LubaKeyboard</strong></div>
        <div class="ln-lk-history">
          <button type="button" data-lk-action="undo" tabindex="-1" aria-label="Zpět">↶</button>
          <button type="button" data-lk-action="redo" tabindex="-1" aria-label="Znovu">↷</button>
        </div>
        <button type="button" class="ln-lk-language" data-lk-action="chooser" tabindex="-1"></button>
        <button type="button" class="ln-lk-hide" data-lk-action="hide" tabindex="-1" aria-label="Skrýt klávesnici">⌄</button>
      </div>
      <div class="ln-lk-suggestions" aria-label="Návrhy slov"></div>
      <div class="ln-lk-compose" hidden>
        <div class="ln-lk-compose-text"></div>
        <div class="ln-lk-candidates"></div>
      </div>
      <div class="ln-lk-body"></div>
      <div class="ln-lk-chooser" hidden></div>
    `;

    telo = panel.querySelector(".ln-lk-body");
    navrhyBox = panel.querySelector(".ln-lk-suggestions");
    composeBox = panel.querySelector(".ln-lk-compose");
    candidates = panel.querySelector(".ln-lk-candidates");
    jazykButton = panel.querySelector(".ln-lk-language");
    chooser = panel.querySelector(".ln-lk-chooser");

    otevritButton = document.createElement("button");
    otevritButton.type = "button";
    otevritButton.id = "lubaKeyboardOpen";
    otevritButton.className = "ln-lk-open";
    otevritButton.hidden = true;
    otevritButton.textContent = "⌨";
    otevritButton.setAttribute("aria-label", "Otevřít LubaKeyboard");

    altPopup = document.createElement("div");
    altPopup.className = "ln-lk-alt-popup";
    altPopup.hidden = true;

    document.body.append(panel, otevritButton, altPopup);

    panel.addEventListener("pointerdown", (event) => {
      const b = event.target.closest("button");
      if (!b) return;
      event.preventDefault();
      if (b.dataset.lkAction) {
        /* Touch pointer si necháme zachycený na původní klávese. Díky
           elementFromPoint() přitom pořád víme, nad kterou variantou je
           fyzicky prst. To je stabilní i na starším Android WebView. */
        try { b.setPointerCapture?.(event.pointerId); } catch (_error) {}
        startLongPress(b, event);
        startRepeat(b.dataset.lkAction);
      }
    }, true);

    panel.addEventListener("pointermove", (event) => {
      if (!longPressUsed) return;
      event.preventDefault();
      sledujAltPrst(event);
    }, true);

    panel.addEventListener("pointerup", (event) => {
      stopLongPress();
      stopRepeat();
      if (longPressUsed) {
        event.preventDefault();
        potvrditAltPrstem(event);
        return;
      }
      longPressPointerId = null;
      const b = event.target.closest("button[data-lk-action]");
      if (!b) return;
      event.preventDefault();
      provedAkci(b.dataset.lkAction, b.dataset.lkValue || "");
    }, true);

    panel.addEventListener("pointercancel", () => {
      stopLongPress();
      stopRepeat();
      zavriAlt();
      longPressUsed = false;
      longPressPointerId = null;
    }, true);

    panel.addEventListener("click", (event) => event.preventDefault(), true);

    chooser.addEventListener("pointerup", (event) => {
      const choice = event.target.closest("button[data-lk-layout]");
      if (choice) {
        event.preventDefault();
        nastavLayout(choice.dataset.lkLayout);
        return;
      }
      const system = event.target.closest("button[data-lk-system]");
      if (system) {
        event.preventDefault();
        systemMode();
      }
    }, true);

    altPopup.addEventListener("pointerdown", (event) => event.preventDefault(), true);
    altPopup.addEventListener("pointermove", (event) => {
      event.preventDefault();
      sledujAltPrst(event);
    }, true);
    altPopup.addEventListener("pointerup", (event) => {
      event.preventDefault();
      if (longPressUsed) {
        potvrditAltPrstem(event);
        return;
      }
      /* Zachováváme i možnost klasického tapu do už otevřené bubliny. */
      const b = event.target.closest("button[data-lk-action]");
      if (!b) return;
      provedAkci(b.dataset.lkAction, b.dataset.lkValue || "");
      zavriAlt();
    }, true);

    otevritButton.addEventListener("click", () => {
      aktivniEditor = najdiEditor();
      if (aktivniEditor) {
        pripravEditor(aktivniEditor);
        zobraz();
      }
    });

    vykresliKlavesnici();
  }

  function zobraz() {
    vytvorPanel();
    const editor = aktivniEditor || najdiEditor();
    if (!editor) return;
    if (editor === systemovyEditor) return;
    pripravEditor(editor);
    panel.hidden = false;
    otevritButton.hidden = true;
    document.body.classList.add("ln-luba-klavesnice-open");
    vykresliKlavesnici();
    requestAnimationFrame(nastavVysku);
  }

  function pozicujOtevritButton() {
    if (!otevritButton || otevritButton.hidden) return;
    const bottomBar = document.querySelector(".taskModal:not([hidden]) .editorBottomBar");
    if (!bottomBar) {
      otevritButton.style.bottom = "72px";
      return;
    }
    const rect = bottomBar.getBoundingClientRect();
    const bottom = Math.max(14, window.innerHeight - rect.top + 8);
    otevritButton.style.bottom = `${Math.round(bottom)}px`;
  }

  function skryj() {
    if (!panel) return;
    flushCompose("hide", false);
    panel.hidden = true;
    zavriChooser();
    zavriAlt();
    document.body.classList.remove("ln-luba-klavesnice-open");
    document.documentElement.style.removeProperty("--ln-lk-height");
    if (otevritButton && najdiEditor()) {
      otevritButton.hidden = false;
      requestAnimationFrame(pozicujOtevritButton);
    }
  }

  function kontrolujEditor() {
    const editor = najdiEditor();
    if (!editor) {
      aktivniEditor = null;
      if (panel && !panel.hidden) skryj();
      if (otevritButton) otevritButton.hidden = true;
      return;
    }
    pripravEditor(editor);
  }

  /*
   * Kritická ochrana: když je LubaKeyboard otevřená, žádné mobilní IME
   * nesmí propašovat mutaci do contenteditable DOM. Fyzická klávesnice na
   * tabletu se překládá stejným modelovým API. Tím zůstává MODEL zdrojem pravdy.
   */
  document.addEventListener("beforeinput", (event) => {
    const editor = aktivniEditor || najdiEditor();
    if (!editor || event.target !== editor || !panel || panel.hidden) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const type = String(event.inputType || "");
    if (type === "insertText" && event.data) insertCore(event.data);
    else if (type === "insertParagraph" || type === "insertLineBreak") enterAction();
    else if (type === "deleteContentBackward") backspaceAction();
    else if (type === "deleteContentForward") commandCore("delete");
    /* composition eventy záměrně ignorujeme – LubaKeyboard je nepotřebuje. */
  }, true);

  document.addEventListener("focusin", (event) => {
    if (!jeEditorV2(event.target)) return;
    aktivniEditor = event.target;
    if (event.target === systemovyEditor) return;
    pripravEditor(event.target);
    zobraz();
  }, true);

  document.addEventListener("pointerdown", (event) => {
    /*
     * FIX 439 – startup / běžné tapy před prvním otevřením LubaKeyboard.
     * altPopup vzniká až lazy v vytvorPanel(). Do té doby je null.
     * Výraz `!altPopup?.hidden && altPopup.contains(...)` byl zrádný:
     * `!undefined` je true, takže druhá část zkusila volat contains() na null.
     * Na SPCK/WebView pak každý pointerdown házel TypeError.
     */
    if (altPopup && !altPopup.hidden && !altPopup.contains(event.target)) zavriAlt();
  }, true);

  document.addEventListener("lubanote:v2-model-input", () => {
    if (!panel || panel.hidden) return;
    queueMicrotask(aktualizujNavrhy);
  }, true);

  window.addEventListener("resize", () => requestAnimationFrame(() => { nastavVysku(); pozicujOtevritButton(); }));
  window.visualViewport?.addEventListener("resize", () => requestAnimationFrame(() => { nastavVysku(); pozicujOtevritButton(); }));

  /* ==========================================================
     PATCH 438 – STARTUP-SAFE LAZY INIT

     DŮLEŽITÉ OCHRANNÉ PRAVIDLO:
     LubaKeyboard při startu aplikace NESMÍ vytvářet vlastní DOM ani
     sledovat celý document.body přes MutationObserver. Původní 437
     observer poslouchal i atribut `hidden` a callback sám znovu nastavoval
     `hidden` na tlačítku klávesnice. Na některých WebView / SPCK Preview
     tím vznikla nekonečná mutation smyčka a zamrzl celý splash/start.

     Klávesnice se proto inicializuje až ve chvíli, kdy Core V2 skutečně
     vytvoří editor a zavolá pripravEditor(), případně přes focusin fallback.
     Do té doby LubaKeyboard pouze poskytuje API a na DOM aplikace nesahá.
     ========================================================== */

  window.LubaNoteKeyboard = Object.freeze({
    verze: "SLIDE-ALT-446",
    zobraz,
    skryj,
    nastavLayout,
    pripravEditor,
    ziskejLayout: () => layoutId,
    jeOtevrena: () => Boolean(panel && !panel.hidden),
    vlozUnicode: (codePoint) => {
      const cp = Number(codePoint);
      if (!Number.isInteger(cp) || cp < 0 || cp > 0x10FFFF || (cp >= 0xD800 && cp <= 0xDFFF)) return false;
      return insertCore(String.fromCodePoint(cp));
    }
  });
})();
