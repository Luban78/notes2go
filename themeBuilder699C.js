/* LubaNote Theme Builder 699C – admin-only, lazy loaded.
 * Every change stays in memory until a deliberate full theme.css export.
 * No writes to localStorage, the backend, or the production stylesheet.
 */
(() => {
  'use strict';
  if (window.LubaNoteThemeBuilder699C) return;

  const ID = 'ln-theme-builder-699c';
  const PUVODNI_TEMATA = new Set(['light', 'dark', 'cappuccino', 'ocean', 'darkg', 'arctic', 'violetnight', 'solar', 'retro']);
  const STYLE_ID = 'ln-theme-builder-live-699c';
  // 699C-C: Barevná identita štítku je samostatná od barev prostředí.
  // Uložené barvy štítků ani jejich ID se v nástroji nikdy nepřepisují.
  const BARVY_STITKU = [
    ['cervena', 'Odstín 1 · nejsvětlejší'], ['oranzova', 'Odstín 2'],
    ['zluta', 'Odstín 3'], ['zelena', 'Odstín 4'],
    ['tyrkysova', 'Odstín 5'], ['modra', 'Odstín 6'],
    ['fialova', 'Odstín 7'], ['ruzova', 'Odstín 8 · nejtmavší']
  ];
  const TAG_START = '/* LN-TB-TAG-COLORS:START */';
  const TAG_END = '/* LN-TB-TAG-COLORS:END */';
  const BAREVNE_VLASTNOSTI = /(?:^color$|(?:-|^)color$|^background(?:-color|-image)?$|^border(?:-[a-z-]+)?$|^outline(?:-color)?$|^box-shadow$|^text-shadow$|^fill$|^stroke$|^caret-color$|^text-decoration(?:-color)?$|^-webkit-text-fill-color$|^-webkit-text-stroke(?:-color)?$)/i;
  const TOKEN = /#[a-f\d]{3,8}\b|(?:rgba?|hsla?)\([^()]*\)|var\(--[\w-]+(?:\s*,\s*[^()]*)?\)|\b(?:transparent|currentColor|white|black|red|blue|green|yellow|orange|purple|pink|gray|grey)\b/gi;
  const VLASTNOSTI = [
    ['color', 'Text'], ['backgroundColor', 'Pozadí'], ['borderTopColor', 'Horní okraj'],
    ['borderRightColor', 'Pravý okraj'], ['borderBottomColor', 'Dolní okraj'],
    ['borderLeftColor', 'Levý okraj'], ['outlineColor', 'Obrys'],
    ['fill', 'Výplň SVG'], ['stroke', 'Tah SVG'], ['caretColor', 'Kurzor'],
    ['textDecorationColor', 'Dekorace textu'], ['boxShadow', 'Stín'],
    ['textShadow', 'Stín textu'], ['backgroundImage', 'Barevný přechod']
  ];

  const stav = {
    source: '', temata: [], drafty: new Map(), aktivni: '', aktivniTab: 'vars',
    puvodniTridy: [], cssRadky: [], cssVyjimky: [], prvky: [], vybranyPrvek: null,
    vyberAktivni: false, highlight: null, panel: null, root: null,
    cssFiltr: '', cssPozice: 0, domFiltr: '', domPozice: 0,
    celekCss: 0, chybyCss: [], history: [], zmenaPriVyberu: false, nacteno: false,
    presun: null, paletaOtevrena: false, zakladBarva: '#c9384e', editaceNazvu: null,
    smazanaTemata: new Map(), vlastniStitky: new Map()
  };

  const el = (tag, className, content) => {
    const result = document.createElement(tag);
    if (className) result.className = className;
    if (content !== undefined) result.textContent = content;
    return result;
  };
  const get = (id) => stav.root?.querySelector(`#${id}`);
  const escape = (s) => (window.CSS?.escape ? CSS.escape(String(s)) : String(s).replace(/[^\w-]/g, '\\$&'));
  const barvaKlic = (id) => `body.theme-${id}`;
  const scope = (id) => id === 'light'
    ? 'body:not([class*="theme-"]):not(.secretModeActive)'
    : `${barvaKlic(id)}:not(.secretModeActive)`;
  const dovoleno = () => window.LubaNoteAdminTools?.isAllowed?.() === true;

  function blok(s, start) {
    const begin = s.indexOf('{', start);
    if (begin < 0) return null;
    let depth = 0, quote = '', comment = false;
    for (let i = begin; i < s.length; i++) {
      const ch = s[i], next = s[i + 1];
      if (comment) { if (ch === '*' && next === '/') { comment = false; i++; } continue; }
      if (quote) { if (ch === quote && s[i - 1] !== '\\') quote = ''; continue; }
      if (ch === '/' && next === '*') { comment = true; i++; continue; }
      if (ch === '"' || ch === "'") { quote = ch; continue; }
      if (ch === '{') depth++;
      if (ch === '}' && --depth === 0) return { start, end: i + 1, text: s.slice(start, i + 1) };
      if (ch !== '}') depth += 0; // depth is changed only by braces
    }
    return null;
  }

  function nacistTemata(css) {
    const found = [];
    const re = /\/\*\s*THEME:\s*([^|*]+)\|\s*([^|*]+)\|\s*([^*]+)\*\//g;
    let match;
    while ((match = re.exec(css))) {
      const id = match[1].trim(), name = match[2].trim(), mode = match[3].trim();
      if (mode !== 'selectable') continue; // secret stays internal
      const rest = css.slice(re.lastIndex);
      const wanted = id === 'light' ? /^\s*:root\s*\{/ : new RegExp(`^\\s*body\\.theme-${id}\\s*\\{`);
      const loc = rest.search(wanted);
      if (loc < 0) continue;
      const begin = re.lastIndex + loc + rest.slice(loc).search(/\S/);
      const rule = blok(css, begin);
      if (!rule) continue;
      const vars = new Map();
      for (const m of rule.text.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)) vars.set(m[1], m[2].trim());
      const prefix = css.slice(Math.max(0, match.index - 120), match.index)
        .match(/\/\*\s*LN-TB-CUSTOM:\s*([a-z0-9-]+)\s*\*\/\s*$/);
      const custom = !PUVODNI_TEMATA.has(id);
      const markerStart = prefix?.[1] === id ? match.index - prefix[0].length : match.index;
      found.push({ id, name, originalName: name, markerStart, markerEnd: re.lastIndex,
        start: rule.start, end: rule.end, original: vars, custom });
    }
    if (!found.length) throw new Error('V theme.css nebyla nalezena žádná volitelná témata.');
    const old = new Map();
    const reOld = /\/\*\s*LN-TB-OVERRIDES:\s*([a-z0-9-]+):START\s*\*\/([\s\S]*?)\/\*\s*LN-TB-OVERRIDES:\s*\1:END\s*\*\//g;
    let prev;
    while ((prev = reOld.exec(css))) old.set(prev[1], prev[2]);
    for (const t of found) {
      let preserved = old.get(t.id) || '';
      t.tagColors = new Map();
      // Při opakovaném importu zachovat uložené mapování, ale nevkládat ho dvakrát.
      const tagBlock = /\/\* LN-TB-TAG-COLORS:START \*\/([\s\S]*?)\/\* LN-TB-TAG-COLORS:END \*\//g;
      preserved = preserved.replace(tagBlock, (_, content) => {
        for (const m of content.matchAll(/\/\* TAG: (#[a-f0-9]{6}) = (#[a-f0-9]{6}) \*\//gi)) {
          t.tagColors.set(m[1].toLowerCase(), m[2].toLowerCase());
        }
        return '';
      });
      // 699C-E: při opětovném načtení starého automatického exportu
      // oprav jeho významové barvy bez změny již zvoleného odstínu motivu.
      t.preservedOverrides = sanitizeLegacyAutoCss(cleanOldCardSurface(preserved));
    }
    return found;
  }

  function draft(id) { return stav.drafty.get(id); }
  function aktualni() { return draft(stav.aktivni); }
  function parsedColor(v) {
    if (!v || typeof v !== 'string') return null;
    const origin = v.trim();
    if (/^#[0-9a-f]{3,8}$/i.test(origin)) {
      const h = origin.slice(1);
      const full = h.length === 3 || h.length === 4 ? h.split('').map(x => x + x).join('') : h;
      const hex = '#' + full.slice(0, 6).toLowerCase();
      const alpha = full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1;
      return { hex, alpha };
    }
    const match = origin.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+)%?)?\s*\)$/i);
    if (match) {
      const channels = match.slice(1, 4).map(x => Math.max(0, Math.min(255, Math.round(+x))));
      const a = match[4] == null ? 1 : Math.max(0, Math.min(1, +match[4]));
      return { hex: '#' + channels.map(x => x.toString(16).padStart(2, '0')).join(''), alpha: a };
    }
    return null;
  }
  function parsedFromCSS(raw) {
    const immediate = parsedColor(raw);
    if (immediate) return immediate;
    if (!CSS.supports('color', raw)) return null;
    const p = el('span');
    p.style.color = raw;
    p.style.cssText += ';position:absolute;visibility:hidden;pointer-events:none';
    document.body.appendChild(p);
    const color = getComputedStyle(p).color;
    p.remove();
    return parsedColor(color);
  }
  function opacityColor(hex, alpha) {
    if (alpha >= 0.999) return hex;
    const n = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    return `rgba(${n.join(', ')}, ${Number(alpha.toFixed(3))})`;
  }
  function colors(value) {
    return Array.from(value.matchAll(new RegExp(TOKEN.source, 'gi')), m => ({ text: m[0], start: m.index, end: m.index + m[0].length }));
  }
  function colorPart(value, num) {
    const tokens = colors(value);
    if (!tokens.length && CSS.supports('color', value)) return { text: value, start: 0, end: value.length };
    return tokens[num] || null;
  }
  function replacePart(value, num, nova) {
    const p = colorPart(value, num);
    return p ? `${value.slice(0, p.start)}${nova}${value.slice(p.end)}` : nova;
  }
  function textValue(node, value) { if (node) node.textContent = value; }
  function opacityButton(current, onCommit) {
    const info = parsedFromCSS(colorPart(current, 0)?.text || current);
    if (!info) return null;
    const b = el('button', 'lnTBalpha699C', `α ${Math.round(info.alpha * 100)} %`);
    b.type = 'button'; b.title = 'Upravit průhlednost barvy (0 až 100 %)';
    b.addEventListener('click', () => {
      const answer = prompt('Krytí / neprůhlednost barvy v procentech (0–100):', String(Math.round(info.alpha * 100)));
      if (answer === null) return;
      const n = Number(answer.trim().replace(',', '.'));
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        setStatus('Krytí musí být číslo od 0 do 100 %.'); return;
      }
      onCommit(opacityColor(info.hex, n / 100));
    });
    return b;
  }
  function manualCSS(property, current, onCommit) {
    const answer = prompt(`Nová CSS hodnota pro ${property}:`, current);
    if (answer === null) return;
    const val = answer.trim();
    if (!val || /[{};]/.test(val) || !(property.startsWith('--') || CSS.supports(property, val))) {
      setStatus('Neplatná hodnota CSS. Změna nebyla provedena.'); return;
    }
    onCommit(val);
  }

  function picker(value, popis, onCommit) {
    const token = colorPart(value, 0)?.text || value;
    const rgb = parsedFromCSS(token) || parsedColor(value) || { hex: '#19b7c9', alpha: 1 };
    if (typeof window.otevriVyberBarvyStitku683AC !== 'function') {
      setStatus('Paleta štítků není načtená; nelze otevřít editor barev.');
      return;
    }
    const fakeTag = { name: popis, color: rgb.hex };
    window.otevriVyberBarvyStitku683AC(fakeTag, async (hex) => {
      onCommit(opacityColor(hex, rgb.alpha));
      return true;
    });
    document.querySelector('.lubaTagColorOverlay683AC')?.classList.add('lnTBpicker699C');
  }

  function setStatus(text) { textValue(get('lnTBstatus699C'), text); }
  function errorLog(text) { setStatus(text); console.warn('Theme Builder 699C:', text); }

  function updateStyle() {
    let style = document.getElementById(STYLE_ID);
    if (!style) { style = el('style'); style.id = STYLE_ID; document.head.appendChild(style); }
    const d = aktualni();
    if (!d) return;
    const vars = [...d.vars].map(([name, value]) => `${name}: ${value} !important;`).join('\n');
    let css = `:root ${scope(stav.aktivni)} {\n${vars}\n}\n`;
    if (stav.temata.some(t => t.id === stav.aktivni && t.new)) {
      const bg = parsedFromCSS(d.vars.get('--color-background') || '')?.hex || '#ffffff';
      css += `${scope(stav.aktivni)} #modalDate, ${scope(stav.aktivni)} #modalTime { color-scheme: ${relativeLum(bg) < .25 ? 'dark' : 'light'}; }\n`;
    }
    for (const o of d.autoOverrides.values()) css += makeOverrideCss(stav.aktivni, o);
    for (const o of d.overrides.values()) css += makeOverrideCss(stav.aktivni, o);
    css += makeTagColorsCSS(stav.aktivni, d.tagColors);
    if (cardSurfaceNeeded(stav.temata.find(t => t.id === stav.aktivni), d)) css += cardSurfaceCss(stav.aktivni);
    style.textContent = css;
  }

  function splitSelector(selector) {
    const result = []; let depth = 0, start = 0;
    for (let i = 0; i < selector.length; i++) {
      if ('(['.includes(selector[i])) depth++;
      else if (')]'.includes(selector[i])) depth--;
      else if (selector[i] === ',' && depth === 0) { result.push(selector.slice(start, i).trim()); start = i + 1; }
    }
    result.push(selector.slice(start).trim());
    return result.filter(Boolean);
  }
  function scopedSelector(id, selector, excludeTools = false) {
    const body = scope(id);
    return splitSelector(selector).map(s => {
      if (excludeTools) {
        const shield = ':not(:is(#ln-theme-builder-699c, #ln-theme-builder-699c *, .lubaTagColorOverlay683AC, .lubaTagColorOverlay683AC *))';
        // 699C-E: :not() ZA pseudo-elementem je neplatné CSS
        // (například ::highlight(search):not(...)). Štít musí být vždy
        // připojen k reálnému elementu před koncovým ::pseudo-elementem.
        const pseudo = s.match(/(::[a-z][\w-]*(?:\([^()]*\))?)$/i);
        if (pseudo) s = s.slice(0, -pseudo[1].length) + shield + pseudo[1];
        else s += shield;
      }
      s = s.replace(/\bbody\.theme-[\w-]+/g, 'body');
      if (/^:root(?:\b|:)/.test(s)) return `:root:has(> ${body})${s.slice(5)}`;
      if (/^html(?:\b|:)/.test(s)) return `html:has(> ${body})${s.slice(4)}`;
      if (/^body(?:\b|[\[:.#])/.test(s)) return `:root ${s.replace(/^body/, body)}`;
      return `:root ${body} ${s}`;
    }).join(',\n');
  }
  function makeOverrideCss(id, o) {
    const sel = scopedSelector(id, o.selector, !!o.auto);
    const prop = o.property.replace(/[^a-zA-Z-]/g, '');
    const value = o.value.replace(/[{};]/g, '');
    let result = `${sel} { ${prop}: ${value} !important; }\n`;
    for (let i = o.context.length - 1; i >= 0; i--) result = `${o.context[i]} {\n${result}}\n`;
    return result;
  }

  // 699C-F: Úsporný, ale čitelný export automatických pravidel.
  // Slučujeme POUZE bezprostředně sousedící deklarace pro shodný
  // selektor ve shodných @media/@supports. Tím se nemění pořadí kaskády.
  // Nezávislé ruční výjimky a soubor theme.css původních témat neměníme.
  function komprimovatPravidla699CF(radky, transformovatSelector = null) {
    const skupiny = [];
    const stejnyKontext = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
    for (const o of radky) {
      const selector = transformovatSelector ? transformovatSelector(o) : o.selector;
      const context = o.context || [];
      if (!selector || !o.property || !o.value) continue;
      const pred = skupiny[skupiny.length - 1];
      const prop = o.property.replace(/[^a-zA-Z-]/g, '');
      const value = String(o.value).replace(/[{};]/g, '');
      if (!prop || !value) continue;
      const deklarace = { prop, value, important: o.important !== false };
      if (pred && pred.selector === selector && stejnyKontext(pred.context, context)) {
        pred.deklarace.push(deklarace);
      } else skupiny.push({ selector, context: [...context], deklarace: [deklarace] });
    }
    // Čtyři identické strany barvy okraje jsou sémanticky ekvivalentní
    // jedné deklaraci border-color. Nikdy neslučovat, jsou-li v bloku
    // jiná pravidla border nebo různé hodnoty některé ze stran.
    const strany = ['border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'];
    for (const group of skupiny) {
      const decl = group.deklarace;
      const sideRows = decl.filter(x => strany.includes(x.prop));
      if (sideRows.length !== 4 || new Set(sideRows.map(x => x.prop)).size !== 4 ||
          new Set(sideRows.map(x => x.value + '|' + x.important)).size !== 1 ||
          decl.some(x => /^(?:border|border-color)$/.test(x.prop))) continue;
      const start = decl.findIndex(x => strany.includes(x.prop));
      const first = decl[start];
      group.deklarace = decl.filter(x => !strany.includes(x.prop));
      group.deklarace.splice(start, 0, { prop: 'border-color', value: first.value, important: first.important });
    }
    // Sousedící skupiny se stejnými deklaracemi smí sdílet selektorový seznam.
    // Pozice obou pravidel v kaskádě zůstane na tomtéž místě.
    const spojene = [];
    for (const g of skupiny) {
      const prev = spojene[spojene.length - 1];
      const kod = JSON.stringify(g.deklarace);
      if (prev && prev.kod === kod && stejnyKontext(prev.context, g.context)) {
        prev.selector += ',\n' + g.selector;
      } else spojene.push({ ...g, kod });
    }
    // @media bloky zapisovat jen jednou pro sousedící pravidla.
    let css = '', otevreny = [];
    for (const g of spojene) {
      let shared = 0;
      while (shared < otevreny.length && shared < g.context.length && otevreny[shared] === g.context[shared]) shared++;
      while (otevreny.length > shared) { css += '  '.repeat(otevreny.length - 1) + '}\n'; otevreny.pop(); }
      for (let i = shared; i < g.context.length; i++) {
        css += '  '.repeat(i) + g.context[i] + ' {\n';
        otevreny.push(g.context[i]);
      }
      const odsazeni = '  '.repeat(otevreny.length);
      css += odsazeni + g.selector.replace(/\n/g, '\n' + odsazeni) + ' { ';
      css += g.deklarace.map(d => `${d.prop}: ${d.value}${d.important ? ' !important' : ''};`).join(' ');
      css += ' }\n';
    }
    while (otevreny.length) { css += '  '.repeat(otevreny.length - 1) + '}\n'; otevreny.pop(); }
    return css;
  }

  function komprimovatStarsiAutomatiku699CF(css) {
    // Pouze pravidla předchozího automatu bez ručních výjimek.
    // Pokud CSSOM narazí na něco neznámého, původní obsah zachováme.
    if (!/LN-TB-699C-E: Bezpečně očištěný automatický export/.test(css)) return css;
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      const rules = [];
      const read = (list, context = []) => {
        for (const rule of list) {
          if (rule.type === CSSRule.STYLE_RULE) {
            for (const property of rule.style) rules.push({
              selector: rule.selectorText, property,
              value: rule.style.getPropertyValue(property).trim(),
              important: rule.style.getPropertyPriority(property) === 'important', context
            });
          } else if (rule.cssRules) {
            const head = rule.cssText.slice(0, rule.cssText.indexOf('{')).trim();
            read(rule.cssRules, [...context, head]);
          } else throw new Error('Neznámé CSS pravidlo ve starém exportu');
        }
      };
      read(sheet.cssRules);
      return '/* LN-TB-699C-F: optimalizované automatické výjimky */\n' + komprimovatPravidla699CF(rules);
    } catch (error) {
      console.warn('Theme Builder 699C-F: Starší CSS ponecháno beze změny.', error);
      return css;
    }
  }

  // 699C-D: Barevná plocha poznámky MUSÍ být odvozena z barvy jejího
  // hlavního štítku. Starší ruční nebo automatické výjimky mohou vložit
  // background/background-color přímo na .taskCard; samotná změna
  // --luba-card-bg pak nestačila. Toto pravidlo je proto záměrně
  // až ZA výjimkami Builderu, v živém náhledu i exportovaném theme.css.
  // Vybrané karty mají zachován původní neutralizovaný stav cardSelected.
  // Swipe ponechává průhledný hostitel a barvu na pohyblivé ::before vrstvě.
  function cardSurfaceCss(id) {
    const root = scope(id);
    // Dvě neodpovídající ID v :not() zvyšují specificitu přes cílené
    // CSS výjimky z inspektoru (např. #notesContainer .taskCard),
    // avšak NIKDY nefiltrují skutečnou kartu.
    const card = `${root} .taskCard:not(#ln-theme-builder-699c):not(#ln-theme-builder-live-699c)`;
    return `/* LN-TB-CARD-SURFACE:START */\n` +
      `${card}[data-barva-karty]:not(.cardSelected):not(.lubaSwipeDoneTarget) { background: var(--luba-card-bg) !important; }\n` +
      `${card}:not([data-barva-karty]):not(.cardSelected):not(.lubaSwipeDoneTarget) { background: var(--color-surface) !important; }\n` +
      `${card}.cardSelected:not(.lubaSwipeDoneTarget) { background: color-mix(in srgb, var(--color-surface) 58%, #777777 42%) !important; }\n` +
      `${card}.lubaSwipeDoneTarget { background: transparent !important; }\n` +
      `${card}.lubaSwipeDoneTarget::before { background: var(--luba-card-bg) !important; }\n` +
      `/* LN-TB-CARD-SURFACE:END */\n`;
  }
  function cardSurfaceNeeded(theme, data) {
    return !!(theme?.new || theme?.custom || data?.tagColors?.size || data?.autoOverrides?.size ||
      [...(data?.vars?.keys() || [])].some(name => name.startsWith('--card-')) ||
      /LN-TB-OVERRIDES:|Motiv:|LN-TB-CARD-SURFACE/i.test(data?.preservedOverrides || ''));
  }
  function cleanOldCardSurface(css) {
    return String(css || '').replace(/\/\* LN-TB-CARD-SURFACE:START \*\/[\s\S]*?\/\* LN-TB-CARD-SURFACE:END \*\/\s*/g, '');
  }

  function makeTagColorsCSS(id, tagColors) {
    if (!tagColors?.size) return '';
    const parent = scope(id);
    let css = `${TAG_START}\n`;
    for (const [original, newColor] of tagColors) {
      if (!/^#[a-f0-9]{6}$/i.test(original) || !/^#[a-f0-9]{6}$/i.test(newColor)) continue;
      const fg = contrastFg(newColor), tint = fg === '#ffffff' ? '#000000' : '#ffffff';
      const oldSelector = `[data-tag-color=\"${original}\" i]`;
      css += `/* TAG: ${original} = ${newColor} */\n`;
      // Proměnná karty má jediný zdroj pro plochu, obrys, swipe i malý štítek.
      css += `${parent} .taskCard[data-barva-karty=\"${original}\" i] { --luba-card-bg: ${newColor} !important; --luba-tag-text-683AB: ${fg} !important; --luba-tag-chip-tint-683AD: ${tint} !important; }\n`;
      // Původní vlastní barva a text se na filtr dávají inline; pouze ve zvoleném motivu
      // je vizuálně nahradíme. -webkit-text-fill-color zajistí kontrast i při inline color !important.
      css += `${parent} .categoryTab${oldSelector}, ${parent} .tagOptions button${oldSelector}, ${parent} .manageTagColorButton${oldSelector} { --luba-tag-bg: ${newColor} !important; background-color: ${newColor} !important; -webkit-text-fill-color: ${fg} !important; }\n`;
    }
    return css + `${TAG_END}\n`;
  }

  function nactiVlastniStitky() {
    // Při otevření jiného modulu lze seznam doplnit tlačítkem Obnovit přehled.
    for (const node of document.querySelectorAll('[data-tag-color], .taskCard[data-barva-karty]')) {
      if (node.closest(`#${ID}`)) continue;
      const value = String(node.dataset.tagColor || node.dataset.barvaKarty || '').toLowerCase();
      if (!/^#[0-9a-f]{6}$/.test(value)) continue;
      const label = node.matches('.categoryTab, .manageTagColorButton, .tagOptions button')
        ? String(node.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 48) : '';
      if (!stav.vlastniStitky.has(value) || (label && !stav.vlastniStitky.get(value)))
        stav.vlastniStitky.set(value, label);
    }
  }

  function nominalTagColor(key) {
    const val = aktualni()?.vars.get(`--card-${key}`);
    if (val) return val;
    return getComputedStyle(document.body).getPropertyValue(`--card-${key}`).trim() || '#777777';
  }
  function renderTagPalette(target) {
    const d = aktualni();
    const section = el('section', 'lnTBtags699C');
    section.append(el('h3', '', '🏷️ Barvy štítků a karet'));
    section.append(el('p', 'lnTBhint699C', 'Osm odstínů sdílí štítky i karty. Barvu můžeš upravit zvlášť pro tento motiv, uložená ID štítků se nemění.'));
    for (const [key, label] of BARVY_STITKU) {
      const prop = `--card-${key}`, value = nominalTagColor(key);
      const row = el('div', 'lnTBcolorRow699C');
      const meta = el('div', 'lnTBcolorMeta699C');
      meta.append(el('strong', '', label), el('small', '', `${prop} · ${value}`));
      row.append(meta, colorButton(value, () => picker(value, label, newColor => {
        saveUndo(); d.vars.set(prop, newColor); changed();
      })));
      section.append(row);
    }
    nactiVlastniStitky();
    if (stav.vlastniStitky.size) {
      section.append(el('h3', '', '🎨 Vlastní barvy uložených štítků'));
      section.append(el('p', 'lnTBhint699C', 'Tady přebarvuješ pouze zobrazení v tomto motivu. Původní barva štítku v databázi zůstává stejná. Zobrazené jsou barvy právě načtených štítků.'));
      for (const [original, name] of stav.vlastniStitky) {
        const value = d.tagColors.get(original) || original;
        const row = el('div', 'lnTBcolorRow699C');
        const meta = el('div', 'lnTBcolorMeta699C');
        meta.append(el('strong', '', name || 'Vlastní odstín'), el('small', '', `${original} → ${value}`));
        row.append(meta, colorButton(value, () => picker(value, name || 'Vlastní štítek', newColor => {
          saveUndo(); d.tagColors.set(original, newColor.toLowerCase()); changed();
        })));
        section.append(row);
      }
    } else {
      section.append(el('p', 'lnTBhint699C', 'Vlastní štítky nyní nejsou na stránce načtené. Otevři jejich seznam a klikni na „Obnovit přehled CSS a prvků“.'));
    }
    target.append(section);
  }

  function renderVars() {
    const target = get('lnTBbody699C');
    if (!target) return;
    target.replaceChildren();
    const d = aktualni();
    for (const [k, v] of d.vars) {
      if (k.startsWith('--card-')) continue; // osm odstínů má přehled níže
      const row = el('div', 'lnTBcolorRow699C');
      const title = el('div', 'lnTBcolorMeta699C');
      title.append(el('strong', '', k), el('small', '', v));
      const swatch = colorButton(v, () => picker(v, k, (nova) => {
        saveUndo(); d.vars.set(k, nova); changed();
      }));
      row.append(title, swatch);
      const alpha = opacityButton(v, val => { saveUndo(); d.vars.set(k, val); changed(); });
      if (alpha) row.append(alpha);
      target.append(row);
    }
    renderTagPalette(target);
  }
  function colorButton(raw, onclick, label = 'Upravit barvu') {
    const b = el('button', 'lnTBcolorButton699C');
    b.type = 'button'; b.title = `${label}: ${raw}`;
    b.setAttribute('aria-label', `${label}: ${raw}`);
    const token = colorPart(raw, 0)?.text || raw;
    const parsed = parsedFromCSS(token);
    const sample = el('span', 'lnTBswatch699C');
    if (parsed) sample.style.background = opacityColor(parsed.hex, parsed.alpha);
    else { sample.style.background = 'repeating-linear-gradient(45deg,#555 0 4px,#ddd 4px 8px)'; }
    b.append(sample, el('span', '', 'Upravit'));
    b.addEventListener('click', onclick);
    return b;
  }

  function readCSSRules() {
    const rows = []; const blocked = []; let ruleCounter = 0;
    const styleSheets = Array.from(document.styleSheets);
    const scan = (rules, src, context = []) => {
      for (const rule of rules) {
        if (rule.type === CSSRule.STYLE_RULE) {
          const number = ++ruleCounter;
          if (rule.selectorText?.includes(`#${ID}`)) continue;
          if (/secretModeActive/.test(rule.selectorText)) continue; // internal theme intentionally isolated
          for (const property of rule.style) {
            if (!BAREVNE_VLASTNOSTI.test(property) && !property.startsWith('--')) continue;
            const value = rule.style.getPropertyValue(property).trim();
            if (!value) continue;
            const tokens = colors(value);
            // CSS color value may be a keyword other than those in TOKEN.
            if (!tokens.length && !(CSS.supports('color', value) || (BAREVNE_VLASTNOSTI.test(property) && /(?:color|gradient|shadow|image|background|border|outline|fill|stroke)/i.test(property)))) continue;
            if (property.startsWith('--') && !/color|bg|border|shadow|fill|accent|text|surface|background/i.test(property)) continue;
            if (/\/theme\.css(?:\?|$)/i.test(src) && property.startsWith('--')) continue;
            const key = [src, number, context.join('/'), rule.selectorText, property].join('¦');
            const values = tokens.length || 1;
            for (let i = 0; i < values; i++) rows.push({ key, src, context, selector: rule.selectorText, property, value, part: i });
          }
        } else if (rule.cssRules) {
          let scope = '';
          if (rule.type === CSSRule.MEDIA_RULE) scope = `@media ${rule.conditionText}`;
          else if (rule.type === CSSRule.SUPPORTS_RULE) scope = `@supports ${rule.conditionText}`;
          else if (typeof rule.conditionText === 'string' && rule.constructor?.name === 'CSSContainerRule') scope = `@container ${rule.conditionText}`;
          scan(rule.cssRules, src, scope ? [...context, scope] : context);
        }
      }
    };
    for (const sheet of styleSheets) {
      if (sheet.ownerNode?.id === STYLE_ID || sheet.ownerNode?.id === 'ln-theme-builder-css-699c' || /themeBuilder699C\.css/i.test(sheet.href || '')) continue;
      const src = sheet.href ? new URL(sheet.href, location.href).pathname.split('/').pop() : 'vložené CSS';
      try { scan(sheet.cssRules, src); }
      catch (e) { blocked.push(src); }
    }
    stav.cssRadky = rows; stav.celekCss = rows.length; stav.chybyCss = blocked;
  }
  function filteredCss() {
    const q = stav.cssFiltr.trim().toLocaleLowerCase('cs');
    if (!q) return stav.cssRadky;
    return stav.cssRadky.filter(x => `${x.src} ${x.selector} ${x.property} ${x.value} ${x.context.join(' ')}`.toLocaleLowerCase('cs').includes(q));
  }
  function renderCSS() {
    const target = get('lnTBbody699C'); if (!target) return;
    target.replaceChildren();
    const summary = el('div', 'lnTBsummary699C');
    const all = stav.cssRadky.length, shown = filteredCss();
    summary.textContent = `Nalezeno ${all} barevných deklarací/tokenů ve všech načtených stylech. Filtr: ${shown.length}.`;
    target.append(summary);
    if (stav.chybyCss.length) target.append(el('p', 'lnTBwarning699C', `Pozor: nelze přečíst ${stav.chybyCss.join(', ')}. Jejich pravidla nejsou v katalogu.`));
    const inp = el('input', 'lnTBsearch699C');
    inp.type = 'search'; inp.placeholder = 'Hledat prvek, CSS soubor, barvu, :hover…'; inp.value = stav.cssFiltr;
    inp.addEventListener('input', () => { stav.cssFiltr = inp.value; stav.cssPozice = 0; renderCSS(); get('lnTBbody699C')?.querySelector('input')?.focus(); });
    target.append(inp);
    const limit = 80;
    const page = shown.slice(stav.cssPozice, stav.cssPozice + limit);
    for (const data of page) {
      const d = aktualni();
      const saved = d.overrides.get(data.key);
      const current = saved?.value || data.value;
      const p = colorPart(current, data.part) || colorPart(current, 0);
      const row = el('div', 'lnTBcolorRow699C lnTBcssRow699C');
      const meta = el('div', 'lnTBcolorMeta699C');
      meta.append(el('strong', '', `${data.selector} · ${data.property}`));
      meta.append(el('small', '', `${data.src}${data.context.length ? ' · ' + data.context.join(' ') : ''}`));
      meta.append(el('code', '', current));
      const btn = colorButton(p?.text || current, () => {
        picker(p?.text || current, `${data.selector} / ${data.property}`, (val) => {
          const original = d.overrides.get(data.key)?.value || data.value;
          const next = replacePart(original, data.part, val);
          saveUndo(); d.overrides.set(data.key, { selector: data.selector, property: data.property, value: next, context: data.context });
          changed();
        });
      });
      row.append(meta, btn);
      const alpha = opacityButton(p?.text || current, val => {
        const source = d.overrides.get(data.key)?.value || data.value;
        saveUndo(); d.overrides.set(data.key, { selector: data.selector, property: data.property, value: replacePart(source, data.part, val), context: data.context });
        changed();
      });
      if (alpha) row.append(alpha);
      const editRaw = el('button', 'lnTBraw699C', 'CSS');
      editRaw.type = 'button'; editRaw.title = 'Upravit celou hodnotu CSS včetně přechodů, stínů nebo barevných výrazů';
      editRaw.addEventListener('click', () => manualCSS(data.property, current, val => {
        saveUndo(); d.overrides.set(data.key, { selector: data.selector, property: data.property, value: val, context: data.context });
        changed();
      }));
      row.append(editRaw); target.append(row);
    }
    renderPager(target, shown.length, stav.cssPozice, limit, n => { stav.cssPozice = n; renderCSS(); });
  }
  function renderPager(target, length, offset, count, cb) {
    if (length <= count) return;
    const p = el('div', 'lnTBpager699C');
    const prev = el('button', '', '‹ Předchozí'); prev.type = 'button'; prev.disabled = offset <= 0;
    prev.addEventListener('click', () => cb(Math.max(0, offset - count)));
    p.append(prev, el('span', '', `${offset + 1}–${Math.min(offset + count, length)} / ${length}`));
    const next = el('button', '', 'Další ›'); next.type = 'button'; next.disabled = offset + count >= length;
    next.addEventListener('click', () => cb(offset + count));
    p.append(next); target.append(p);
  }

  function elementSelector(node) {
    if (node.id && document.querySelectorAll(`#${escape(node.id)}`).length === 1) return `#${escape(node.id)}`;
    const parts = [];
    let current = node;
    while (current && current !== document.body && parts.length < 7) {
      const tag = current.localName?.toLowerCase() || '*';
      const classes = Array.from(current.classList || []).filter(c => !/^theme-/.test(c)).slice(0, 3).map(c => `.${escape(c)}`);
      let s = tag + classes.join('');
      if (current.id) s = `#${escape(current.id)}`;
      else {
        const siblings = Array.from(current.parentElement?.children || []).filter(n => n.localName === current.localName);
        if (siblings.length > 1) s += `:nth-of-type(${siblings.indexOf(current) + 1})`;
      }
      parts.unshift(s);
      const combined = parts.join(' > ');
      try { if (document.querySelectorAll(combined).length === 1) return combined; } catch (_) {}
      current = current.parentElement;
    }
    return parts.join(' > ');
  }
  function readableName(node) {
    const tag = node.localName || 'prvek';
    const id = node.id ? `#${node.id}` : '';
    const text = (node.getAttribute('aria-label') || node.getAttribute('title') || node.textContent || '').replace(/\s+/g, ' ').slice(0, 54).trim();
    const kind = node.classList?.length ? '.' + Array.from(node.classList).slice(0, 2).join('.') : '';
    return `${tag}${id}${kind}${text ? ' · ' + text : ''}`;
  }
  function scanDom() {
    stav.prvky = Array.from(document.querySelectorAll('body *')).filter(node => {
      if (node.closest(`#${ID}`) || node.closest('.lubaTagColorOverlay683AC')) return false;
      return !['SCRIPT','STYLE','LINK','META','TEMPLATE','BR','SOURCE'].includes(node.tagName);
    }).map(node => ({ node, name: readableName(node) }));
  }
  function renderDom() {
    const target = get('lnTBbody699C'); if (!target) return;
    target.replaceChildren();
    const q = stav.domFiltr.trim().toLocaleLowerCase('cs');
    const filtered = q ? stav.prvky.filter(x => x.name.toLocaleLowerCase('cs').includes(q)) : stav.prvky;
    target.append(el('p', 'lnTBsummary699C', `DOM inventura: ${stav.prvky.length} prvků aktuálně načtených v aplikaci. Otevři další modul nebo modal a použij „Obnovit přehled“.`));
    const search = el('input', 'lnTBsearch699C'); search.type = 'search'; search.placeholder = 'Hledat tlačítko, ID, text…'; search.value = stav.domFiltr;
    search.addEventListener('input', () => { stav.domFiltr = search.value; stav.domPozice = 0; renderDom(); get('lnTBbody699C')?.querySelector('input')?.focus(); });
    target.append(search);
    for (const x of filtered.slice(stav.domPozice, stav.domPozice + 60)) {
      const b = el('button', 'lnTBdomRow699C', x.name);
      b.addEventListener('click', () => inspect(x.node)); target.append(b);
    }
    renderPager(target, filtered.length, stav.domPozice, 60, n => { stav.domPozice = n; renderDom(); });
    if (stav.vybranyPrvek?.isConnected) renderInspector(target, stav.vybranyPrvek);
  }
  function inspect(node) {
    if (!node?.isConnected) { setStatus('Vybraný prvek už neexistuje; obnov přehled.'); return; }
    stav.vybranyPrvek = node;
    if (stav.aktivniTab !== 'dom') { stav.aktivniTab = 'dom'; renderActive(); }
    else renderDom();
    stav.panel?.querySelector('.lnTBinspector699C')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function renderInspector(target, node) {
    const c = getComputedStyle(node);
    const sel = elementSelector(node);
    const panel = el('section', 'lnTBinspector699C');
    panel.append(el('h3', '', 'Vybraný prvek'));
    panel.append(el('code', '', sel));
    panel.append(el('p', 'lnTBhint699C', 'Zobrazené barvy jsou skutečné vypočtené hodnoty. Změna vytváří pravidlo pro vybraný motiv; u dynamických prvků zkontroluj, zda má vytvořený selektor stabilní ID nebo třídu.'));
    for (const [property, name] of VLASTNOSTI) {
      const raw = c[property];
      if (!raw || ['none', 'normal', 'auto', 'initial', 'currentcolor'].includes(raw.toLowerCase())) continue;
      const tokens = colors(raw);
      const usable = tokens.length ? tokens : (parsedFromCSS(raw) ? [{ text: raw }] : []);
      for (let part = 0; part < usable.length; part++) {
        const cssName = property.replace(/[A-Z]/g, x => '-' + x.toLowerCase());
        const key = `dom¦${sel}¦${cssName}`;
        const prev = aktualni().overrides.get(key);
        const value = prev?.value || raw;
        const token = colorPart(value, part)?.text || value;
        const row = el('div', 'lnTBcolorRow699C');
        const meta = el('div', 'lnTBcolorMeta699C');
        meta.append(el('strong', '', name), el('small', '', cssName), el('code', '', value));
        const b = colorButton(token, () => picker(token, name, color => {
          const source = aktualni().overrides.get(key)?.value || raw;
          const next = replacePart(source, part, color);
          saveUndo(); aktualni().overrides.set(key, { selector: sel, property: cssName, value: next, context: [] });
          changed();
        }));
        row.append(meta, b);
        const alpha = opacityButton(token, val => {
          const source = aktualni().overrides.get(key)?.value || raw;
          saveUndo(); aktualni().overrides.set(key, { selector: sel, property: cssName, value: replacePart(source, part, val), context: [] });
          changed();
        });
        if (alpha) row.append(alpha);
        const editRaw = el('button', 'lnTBraw699C', 'CSS');
        editRaw.type = 'button';
        editRaw.addEventListener('click', () => manualCSS(cssName, value, val => {
          saveUndo(); aktualni().overrides.set(key, { selector: sel, property: cssName, value: val, context: [] });
          changed();
        }));
        row.append(editRaw); panel.append(row);
      }
    }
    target.append(panel);
  }

  function saveUndo() {
    const d = aktualni();
    if (!d) return;
    stav.history.push({ action: 'edit', id: stav.aktivni, vars: new Map(d.vars),
      overrides: new Map(d.overrides), autoOverrides: new Map(d.autoOverrides), preservedOverrides: d.preservedOverrides, name: d.name,
      base: d.base, paletteName: d.paletteName, tagColors: new Map(d.tagColors) });
    if (stav.history.length > 40) stav.history.shift();
  }
  function undo() {
    const last = stav.history.pop();
    if (!last) { setStatus('Žádná starší úprava k vrácení.'); return; }
    if (last.action === 'create') {
      stav.drafty.delete(last.id);
      stav.temata = stav.temata.filter(t => t.id !== last.id);
      stav.editaceNazvu = null;
      preview(draft(last.previous) ? last.previous : stav.temata[0].id);
      setStatus('Vytvoření motivu bylo vráceno.'); return;
    }
    if (last.action === 'delete') {
      stav.temata.splice(Math.min(last.index, stav.temata.length), 0, last.theme);
      stav.drafty.set(last.theme.id, last.data);
      stav.smazanaTemata.delete(last.theme.id);
      preview(last.theme.id);
      setStatus('Smazání motivu bylo vráceno.'); return;
    }
    const d = draft(last.id);
    if (!d) { setStatus('Motiv již neexistuje.'); return; }
    d.vars = new Map(last.vars);
    d.overrides = new Map(last.overrides);
    d.autoOverrides = new Map(last.autoOverrides);
    d.preservedOverrides = last.preservedOverrides;
    d.name = last.name;
    d.base = last.base;
    d.paletteName = last.paletteName;
    d.tagColors = new Map(last.tagColors || []);
    const t = stav.temata.find(x => x.id === last.id);
    if (t) t.name = last.name;
    preview(last.id);
    setStatus('Poslední změna motivu byla vrácena.');
  }
  function changed() {
    updateStyle();
    renderActive();
    renderHeader();
    if (stav.paletaOtevrena) renderPalettes();
    setStatus('Změna je pouze v živém náhledu. Pro trvalé použití exportuj theme.css.');
  }
  function nastavOtevreniNabidky(otevrit) {
    const menu = get('lnTBthemeMenu699C');
    const btn = get('lnTBthemes699C');
    if (!menu || !btn) return;
    menu.hidden = !otevrit;
    btn.setAttribute('aria-expanded', String(otevrit));
    if (otevrit) menu.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }
  function renderHeader() {
    const d = aktualni();
    textValue(get('lnTBchanges699C'), `${d?.autoOverrides.size || 0} sladěných CSS · ${d?.tagColors.size || 0} vlastních barev štítků · ${d?.overrides.size || 0} výjimek · ${stav.drafty.size} motivů`);
    const btn = get('lnTBthemes699C');
    const menu = get('lnTBthemeMenu699C');
    if (!btn || !menu) return;
    textValue(get('lnTBthemeName699C'), d?.name || 'Vybrat motiv');
    menu.replaceChildren();
    for (const t of stav.temata) {
      const item = el('button', 'lnTBthemeOption699C');
      item.type = 'button'; item.dataset.themeId = t.id;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(t.id === stav.aktivni));
      item.append(el('span', '', t.name), el('span', 'lnTBthemeCheck699C', t.id === stav.aktivni ? '✓' : ''));
      item.addEventListener('click', () => { nastavOtevreniNabidky(false); preview(t.id); });
      menu.append(item);
    }
  }
  function posunPanelu(left, top) {
    const panel = stav.panel;
    if (!panel) return;
    panel.style.setProperty('left', `${Math.round(left)}px`, 'important');
    panel.style.setProperty('top', `${Math.round(top)}px`, 'important');
    panel.style.setProperty('right', 'auto', 'important');
    panel.style.setProperty('bottom', 'auto', 'important');
  }
  function omezPozici(left, top, width, height) {
    // Stejně jako Debug Hub lze panel z velké části odsunout za bok nebo dolů.
    // Vždy ale zůstane alespoň 72px plocha pro navrácení. Horní hrana zůstává na displeji.
    const vw = window.innerWidth, vh = window.innerHeight;
    // Zleva je vždy dostupné levé madlo, zprava pravé madlo vedle Zavřít.
    const keepSide = Math.min(76, width);
    // Na Androidu ponech prostor i NAD systémovou navigací.
    const keepBottom = Math.min(height, vw <= 700 ? 136 : 80);
    return {
      left: Math.max(Math.min(0, keepSide - width), Math.min(Math.max(0, vw - keepSide), left)),
      top: Math.max(0, Math.min(Math.max(0, vh - keepBottom), top))
    };
  }
  function zacniPresun(event) {
    if (event.button != null && event.button !== 0) return;
    if (event.target.closest('button, input, select, textarea, a')) return;
    const panel = stav.panel;
    if (!panel || stav.presun) return;
    nastavOtevreniNabidky(false);
    const rect = panel.getBoundingClientRect();
    // Ukotvení zajistí, že už neplatí původní media-query bottom/right.
    posunPanelu(rect.left, rect.top);
    stav.presun = { id: event.pointerId, x: event.clientX, y: event.clientY,
      left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    panel.classList.add('lnTBdragging699C');
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch (_) {}
    event.preventDefault();
  }
  function presunPanel(event) {
    const drag = stav.presun;
    if (!drag || (drag.id != null && event.pointerId !== drag.id)) return;
    const p = omezPozici(drag.left + event.clientX - drag.x,
      drag.top + event.clientY - drag.y, drag.width, drag.height);
    posunPanelu(p.left, p.top);
    event.preventDefault();
  }
  function konecPresunu(event) {
    if (!stav.presun || (event?.pointerId != null && event.pointerId !== stav.presun.id)) return;
    stav.presun = null;
    stav.panel?.classList.remove('lnTBdragging699C');
  }
  function hlidejPozici() {
    if (!stav.panel?.isConnected) return;
    const rect = stav.panel.getBoundingClientRect();
    const p = omezPozici(rect.left, rect.top, rect.width, rect.height);
    posunPanelu(p.left, p.top);
  }

  // 699C-B – paleta vzniká výhradně v paměti. Změny nezasahují do jiných motivů.
  function hslRgb(h, s, l) {
    const a = s * Math.min(l, 1 - l);
    const f = n => { const k = (n + h / 30) % 12;
      return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
    return [f(0), f(8), f(4)];
  }
  function hslHex(h, s, l) {
    return '#' + hslRgb(((h % 360) + 360) % 360, s, l).map(n => n.toString(16).padStart(2, '0')).join('');
  }
  function rgbHsl(hex) {
    const p = parsedColor(hex) || { hex: '#c9384e' };
    const [r, g, b] = [1, 3, 5].map(i => parseInt(p.hex.slice(i, i + 2), 16) / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
    let h = 0, s = 0, l = (max + min) / 2;
    if (delta) {
      s = delta / (1 - Math.abs(2 * l - 1));
      switch (max) {
        case r: h = ((g - b) / delta) % 6; break;
        case g: h = (b - r) / delta + 2; break;
        default: h = (r - g) / delta + 4;
      }
      h = (h * 60 + 360) % 360;
    }
    return { h, s, l };
  }
  function relativeLum(hex) {
    const p = parsedColor(hex);
    if (!p) return 0;
    const c = [1, 3, 5].map(i => parseInt(p.hex.slice(i, i + 2), 16) / 255)
      .map(x => x <= .04045 ? x / 12.92 : Math.pow((x + .055) / 1.055, 2.4));
    return .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
  }
  function contrast(a, b) {
    const x = relativeLum(a), y = relativeLum(b);
    return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
  }
  function contrastFg(bg, hint) {
    const options = ['#101724', '#ffffff', hint].filter(Boolean);
    return options.sort((a, b) => contrast(b, bg) - contrast(a, bg))[0];
  }
  const PALETY = [
    { id: 'temna', name: 'Tmavá harmonie', info: 'Tmavé panely, výrazná hlavní barva', dark: true, shift: 0 },
    { id: 'svetla', name: 'Světlá elegance', info: 'Čisté světlé plochy a přehledné texty', dark: false, shift: 0 },
    { id: 'analog', name: 'Jemná harmonie', info: 'Sousední odstíny a měkké akcenty', dark: true, shift: -22 },
    { id: 'kontrast', name: 'Doplňkový kontrast', info: 'Hlavní a kontrastní doplňková barva', dark: true, shift: 180 }
  ];
  function paletteValues(base, mode) {
    const { h, s } = rgbHsl(base);
    const dark = mode.dark, alternate = (h + mode.shift + 360) % 360;
    const accent = hslHex(h, Math.max(.57, Math.min(.88, s + .08)), dark ? .60 : .39);
    const accentSecondary = hslHex(alternate, Math.max(.43, Math.min(.83, s)), dark ? .63 : .42);
    const background = hslHex(alternate, dark ? .32 : .23, dark ? .095 : .963);
    const surface = hslHex(alternate, dark ? .30 : .13, dark ? .165 : .995);
    const elevated = hslHex(alternate, dark ? .28 : .19, dark ? .23 : .925);
    const editorBg = hslHex(alternate, dark ? .31 : .14, dark ? .115 : .974);
    const text = contrastFg(background, hslHex(alternate, .28, dark ? .96 : .12));
    const textSecondary = hslHex(alternate, dark ? .24 : .20, dark ? .78 : .30);
    const accentText = hslHex(h, dark ? .78 : .73, dark ? .78 : .29);
    const borderRGB = hslRgb(alternate, dark ? .48 : .32, dark ? .75 : .32);
    const vals = new Map([
      ['--color-background', background], ['--color-surface', surface],
      ['--color-text', text], ['--color-text-secondary', textSecondary],
      ['--color-accent', accent], ['--color-accent-text', accentText],
      ['--color-on-accent', contrastFg(accent)],
      ['--color-border', `rgba(${borderRGB.join(', ')}, ${dark ? .23 : .17})`],
      ['--color-editor-background', editorBg], ['--color-editor-text', contrastFg(editorBg)],
      ['--color-surface-elevated', elevated], ['--color-accent-secondary', accentSecondary]
    ]);
    // Základní plochy i aktivní prvky zůstanou čitelné (WCAG AA pro běžný text).
    for (const [fgKey, bgKey] of [['--color-text', '--color-background'],
      ['--color-editor-text', '--color-editor-background'], ['--color-on-accent', '--color-accent']]) {
      if (contrast(vals.get(fgKey), vals.get(bgKey)) < 4.5) vals.set(fgKey, contrastFg(vals.get(bgKey)));
    }
    // Samostatná tonální škála – odstíny jsou rozlišitelné a používají je
    // současně karta, štítek i jejich obrys. Nesmí vzniknout 8 stejných karet.
    const lightness = dark ? [.90, .79, .68, .57, .47, .37, .28, .20]
      : [.96, .88, .79, .68, .56, .45, .35, .25];
    BARVY_STITKU.forEach(([key], i) => {
      const hue = (h + (i - 3.5) * 3 + 360) % 360;
      vals.set(`--card-${key}`, hslHex(hue, Math.min(.64, Math.max(.29, s * .69)), lightness[i]));
    });
    return vals;
  }
  // 699C-E: Sémantické barvy nesmějí být podřízeny dekorativnímu motivu.
  // Tyto prvky nesou informaci (stav spojení, OK/chyba, typ souboru),
  // nebo jsou to skutečné uživatelsky volitelné barvy v editoru/čtečce.
  // Ruční inspektor je může stále upravit, automatická paleta nikoliv.
  function isSemanticColorRule(selector) {
    return /(?:\[data-(?:state|status|error|direction|high|low|severity|result|highlight-color|epub-highlight-color|file-type)\b|\[aria-invalid\b|\.is-(?:yellow|green|blue|violet|red|docx?|epub|sql|pdf|txt|xlsx?|pptx?|html|css|js|json|csv|md)\b|\.reader-theme-[\w-]+|\.textcolor(?:white|black)\b|\.textcolorpalette\b|\.documents(?:epubhighlight|epubmarkcolor|epubselectioncolors|docxviewercontent|epubcontent|epubbody)\b|::(?:highlight|selection)\b)/i.test(selector) ||
      /(?:^|[^a-z])(?:overdue|offline|online|pending|synced|syncing|conflict|expired|success|failure|failed|error|warning|danger|critical|invalid|disabled|readonly|destructive|reset|delete|trash|recovery)(?:$|[^a-z])/i.test(selector);
  }

  function sanitizeLegacyAutoCss(css) {
    // Tato automatická oprava je bezpečná jen tehdy, pokud původní export
    // skutečně neobsahoval žádnou ručně vytvořenou CSS výjimku.
    const header = css.match(/automatická paleta\s*\((\d+)\)\s*,\s*ruční výjimky\s*\((\d+)\)/i);
    if (!header || +header[1] === 0 || +header[2] !== 0) return css;
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      const rows = [];
      const visit = (rules, context = []) => {
        for (const rule of rules) {
          if (rule.type === CSSRule.STYLE_RULE) {
            if (isSemanticColorRule(rule.selectorText)) continue;
            for (const property of rule.style) {
              rows.push({ selector: rule.selectorText, property,
                value: rule.style.getPropertyValue(property).trim(),
                important: rule.style.getPropertyPriority(property) === 'important', context });
            }
          } else if (rule.cssRules) {
            const head = rule.cssText.slice(0, rule.cssText.indexOf('{')).trim();
            visit(rule.cssRules, [...context, head]);
          } else {
            // Neznámý typ pravidla nikdy neodstraňovat beze stopy.
            throw new Error('Unsupported legacy CSS rule');
          }
        }
      };
      visit(sheet.cssRules);
      const keyFor = (o) => `${o.context.join('\u0001')}\u00a6${o.selector}`;
      const backgrounds = new Map();
      for (const o of rows) {
        if (!/^background(?:-color)?$/i.test(o.property)) continue;
        const bg = parsedFromCSS(o.value);
        if (bg && bg.alpha >= .98) backgrounds.set(keyFor(o), bg.hex);
      }
      return '/* LN-TB-699C-E: Bezpečně očištěný automatický export */\n' + rows.map(o => {
        let value = o.value;
        const bg = backgrounds.get(keyFor(o));
        if (bg && /^(?:color|-webkit-text-fill-color)$/i.test(o.property)) {
          const fg = parsedFromCSS(value);
          if (fg && fg.alpha >= .98 && contrast(fg.hex, bg) < 4.5) value = contrastFg(bg);
        }
        let rule = `${o.selector} { ${o.property}: ${value}${o.important ? ' !important' : ''}; }\n`;
        for (let i = o.context.length - 1; i >= 0; i--) rule = `${o.context[i]} {\n${rule}}\n`;
        return rule;
      }).join('');
    } catch (error) {
      console.warn('Theme Builder 699C-E: Legacy CSS nebylo možné automaticky očistit.', error);
      return css; // původní CSS je bezpečnější než jeho neúplný přepis
    }
  }

  function harmonizeFixed(data, palette) {
    const property = data.property.toLowerCase(), selector = data.selector.toLowerCase();
    const src = data.src.toLowerCase();
    if (!data.selector || /theme-|secretmodeactive|:host|:root|#ln-theme-builder-699c/.test(selector)) return null;
    if (isSemanticColorRule(selector)) return null;
    if (/(?:^|[\W])(secret|password|captcha|alert|error|success|danger|warning|critical|invalid|failed|delete|destructive)(?:$|[\W])/.test(selector)) return null;
    if (/(?:theme|debug|tester|studio|dictionary|keyboard|generated)\w*\.css/.test(src)) return null;
    // Kartám a štítkům NIKDY nepřepisovat jejich background/color obecným
    // harmonizátorem. Vazba karta → hlavní štítek má přednost před motivem.
    if (/(?:taskcard|tasktag|cardcolor|\[data-barva-karty|\[data-tag-color|categorytab|tagoptions|tagfilter|managetag|luba-card-bg|luba-tag-bg|luba-tag-text)/.test(selector)) return null;
    if (/(?:tag|stitek|category|chip|badge|cardpalette|colorpicker|customcolor)/.test(selector) && /(?:background|color|fill|stroke)/.test(property)) return null;
    if (property.startsWith('--')) return null;
    if (/\bvar\(|\bcurrentcolor\b|\binherit\b|\burl\(/i.test(data.value)) return null;
    if (/^(?:background-image|text-shadow|box-shadow)$/i.test(property)) return null; // zachovat přechody a stíny
    if (/(?:^(?:color|background(?:-color)?|fill|stroke|caret-color|outline-color|text-decoration-color)$|^border(?:-[a-z-]+)?$)/.test(property) === false) return null;
    const tokens = colors(data.value).filter(t => /^(?:#|rgb|hsl)/i.test(t.text));
    if (!tokens.length) return null;
    const isBg = /^background/.test(property);
    const isBorder = /^border|^outline/.test(property);
    const isIcon = /^(?:fill|stroke|caret-color|text-decoration-color)$/.test(property);
    const special = /active|selected|highlight|focus|checked|primary|accent|current/.test(selector);
    const hover = /:hover|:active/.test(selector);
    const target = isBorder ? (special ? '--color-accent' : '--color-border') :
      isBg ? (special || hover ? '--color-accent' : /(?:modal|dialog|panel|card|button|toolbar|menu|nav|input)/.test(selector) ? '--color-surface' : '--color-background') :
      (special || isIcon ? '--color-accent-text' : '--color-text');
    let i = 0;
    const rewritten = data.value.replace(new RegExp(TOKEN.source, 'gi'), term => {
      if (!/^(?:#|rgb|hsl)/i.test(term)) return term;
      const parsed = parsedFromCSS(term);
      if (!parsed) return term;
      const originalHsl = rgbHsl(parsed.hex);
      const useAccent = !isBorder && (isBg || isIcon) && originalHsl.s > .40 && originalHsl.l > .25 && originalHsl.l < .82;
      let next = palette.get(useAccent ? (i++ % 2 === 0 ? '--color-accent-secondary' : '--color-accent') : target);
      if (!next) return term;
      const parsedNext = parsedFromCSS(next);
      if (parsed.alpha < .998 && parsedNext) next = opacityColor(parsedNext.hex, parsed.alpha);
      return next;
    });
    return rewritten !== data.value ? rewritten : null;
  }
  function autoCustomTagColors(base, mode) {
    nactiVlastniStitky();
    const output = new Map();
    const h = rgbHsl(base).h;
    const bright = [], dim = [];
    for (const original of stav.vlastniStitky.keys()) {
      // Inline JS odvozuje barvu textu z původní barvy. Proto zachováme
      // světlý/tmavý kontrast a motiv pouze změní jeho barevnou rodinu.
      (relativeLum(original) > .179 ? bright : dim).push(original);
    }
    for (const [isBright, group] of [[true, bright], [false, dim]]) {
      group.sort((a, b) => rgbHsl(a).h - rgbHsl(b).h || relativeLum(b) - relativeLum(a));
      group.forEach((original, index) => {
        const count = group.length;
        const fraction = count <= 1 ? .5 : index / (count - 1);
        const l = isBright ? .88 - .18 * fraction : .24 + .14 * fraction;
        const hue = (h - 14 + 28 * fraction + 360) % 360;
        const generated = hslHex(hue, mode.dark ? .52 : .46, l);
        output.set(original, generated);
      });
    }
    return output;
  }
  function automaticColors(palette) {
    const output = new Map();
    const backgroundBySelector = new Map();
    const keyFor = (o) => `${o.context.join('\u0001')}\u00a6${o.selector}`;
    for (const x of stav.cssRadky) {
      if (output.has(x.key)) continue;
      const value = harmonizeFixed(x, palette);
      if (!value) continue;
      const item = { selector: x.selector, property: x.property, value, context: x.context, auto: true };
      output.set(x.key, item);
      // Jen souvislá neprůhledná barva. Průhledné překryvy, gradienty,
      // ::before a nezávislé části UI se nehodí k odhadu barvy pod textem.
      if (/^background(?:-color)?$/i.test(x.property)) {
        const bg = parsedFromCSS(value);
        if (bg && bg.alpha >= .98) backgroundBySelector.set(keyFor(item), bg.hex);
      }
    }
    // Čitelnost aktivních prvků: pokud stejné pravidlo pro daný selektor
    // nastavuje i plné pozadí, vypočti kontrast textu PŘÍMO vůči němu.
    // Např. růžový text na červeném pozadí měl kontrast jen 1.81:1.
    for (const item of output.values()) {
      if (item.property !== 'color' && item.property !== '-webkit-text-fill-color') continue;
      const bg = backgroundBySelector.get(keyFor(item));
      if (!bg) continue;
      const fg = parsedFromCSS(item.value);
      if (!fg || fg.alpha < .98 || contrast(fg.hex, bg) >= 4.5) continue;
      item.value = contrastFg(bg, palette.get('--color-on-accent'));
    }
    return output;
  }
  function showPalette(open = !stav.paletaOtevrena) {
    stav.paletaOtevrena = open;
    const panel = get('lnTBpalette699C');
    if (panel) panel.hidden = !open;
    if (open) renderPalettes();
  }
  function renderPalettes() {
    const box = get('lnTBpalette699C'); if (!box || !stav.paletaOtevrena) return;
    box.replaceChildren();
    const t = stav.temata.find(x => x.id === stav.aktivni);
    box.append(el('h3', '', '🎨 Návrhy barevných palet'));
    if (!t?.new && !t?.custom) {
      box.append(el('p', 'lnTBwarning699C', 'Pro ochranu původních témat vytvoř nejprve „+ Nový motiv“. Návrhy lze použít na nové a vlastní motivy.'));
      return;
    }
    const baseRow = el('div', 'lnTBpaletteBase699C');
    baseRow.append(el('span', '', 'Hlavní barva'));
    const choose = colorButton(stav.zakladBarva, () => picker(stav.zakladBarva, 'Hlavní barva nového motivu', hex => {
      stav.zakladBarva = hex; renderPalettes();
    }), 'Vybrat hlavní barvu');
    baseRow.append(choose, el('code', '', stav.zakladBarva)); box.append(baseRow);
    box.append(el('p', 'lnTBhint699C', 'Vyber hlavní barvu a potom jednu z palet. Návrh rovnou přebarví aplikaci; jednotlivé prvky pak můžeš doladit ručně.'));
    for (const mode of PALETY) {
      const values = paletteValues(stav.zakladBarva, mode);
      const btn = el('button', 'lnTBpaletteCard699C'); btn.type = 'button';
      btn.append(el('strong', '', mode.name), el('small', '', mode.info));
      const strip = el('span', 'lnTBpaletteStrip699C');
      for (const k of ['--color-background', '--color-surface', '--color-accent', '--color-accent-secondary', '--color-text']) {
        const swatch = el('span'); swatch.style.backgroundColor = values.get(k); swatch.title = `${k}: ${values.get(k)}`;
        strip.append(swatch);
      }
      btn.append(strip);
      if (aktualni()?.paletteName === mode.name && aktualni()?.base === stav.zakladBarva) btn.classList.add('chosen');
      btn.addEventListener('click', () => {
        if (!draft(stav.aktivni)?.name) return;
        saveUndo();
        const d = aktualni(); d.vars = values;
        d.autoOverrides = automaticColors(values); d.preservedOverrides = '';
        d.tagColors = autoCustomTagColors(stav.zakladBarva, mode);
        d.paletteName = mode.name; d.base = stav.zakladBarva;
        changed(); renderPalettes();
        setStatus(`Použita paleta „${mode.name}“. Sladěno ${d.autoOverrides.size} pevných CSS pravidel. Náhled platí pouze pro „${d.name}“.`);
      });
      box.append(btn);
    }
  }
  function safeThemeName(input) { return String(input).replace(/[|*\n\r]/g, ' ').trim().replace(/\s+/g, ' ').slice(0, 55); }
  function formNazev(mode) {
    stav.editaceNazvu = mode;
    const form = get('lnTBnameForm699C'); if (!form) return;
    form.replaceChildren(); form.hidden = false;
    form.append(el('strong', '', mode === 'create' ? 'Vytvořit nový motiv' : mode === 'rename' ? 'Přejmenovat motiv' : `Smazat motiv „${aktualni().name}“?`));
    if (mode === 'delete') {
      form.append(el('p', 'lnTBwarning699C', 'Téma se odstraní z budoucího exportu theme.css. Současná aplikace zůstane beze změny.'));
    } else {
      const input = el('input', 'lnTBnameInput699C'); input.id = 'lnTBnameInput699C';
      input.type = 'text'; input.maxLength = 55;
      input.value = mode === 'rename' ? aktualni().name : '';
      input.placeholder = 'Název motivu';
      form.append(input);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ulozNazev(mode); } });
      input.focus();
    }
    const row = el('div', 'lnTBformActions699C');
    const confirmButton = el('button', '', mode === 'delete' ? 'Smazat motiv' : 'Uložit');
    confirmButton.type = 'button';
    if (mode === 'delete') confirmButton.classList.add('lnTBdanger699C');
    confirmButton.addEventListener('click', () => mode === 'delete' ? smazMotiv() : ulozNazev(mode));
    const cancel = el('button', '', 'Zrušit'); cancel.type = 'button';
    cancel.addEventListener('click', zavriFormNazvu);
    row.append(confirmButton, cancel); form.append(row);
  }
  function zavriFormNazvu() {
    stav.editaceNazvu = null;
    const box = get('lnTBnameForm699C'); if (box) { box.replaceChildren(); box.hidden = true; }
  }
  function ulozNazev(mode) {
    const name = safeThemeName(get('lnTBnameInput699C')?.value || '');
    if (!name) return setStatus('Vyplň název motivu.');
    if (stav.temata.some(t => t.name.toLocaleLowerCase('cs') === name.toLocaleLowerCase('cs') && (mode !== 'rename' || t.id !== stav.aktivni)))
      return setStatus('Motiv s tímto názvem už existuje.');
    if (mode === 'create') {
      let id = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
      if (!/^[a-z][a-z0-9-]*$/.test(id)) return setStatus('Zvol název začínající písmenem A–Z.');
      let num = 2, candidate = id;
      while (stav.temata.some(t => t.id === candidate) || stav.smazanaTemata.has(candidate)) candidate = `${id.slice(0, 25)}-${num++}`;
      id = candidate;
      const src = aktualni(), prev = stav.aktivni;
      stav.history.push({ action: 'create', id, previous: prev });
      stav.temata.push({ id, name, originalName: '', new: true, custom: true });
      // Kopie převezme i současné odstíny štítků, přestože jejich hodnoty
      // mohou pocházet ze style.css a nikoliv přímo z theme.css.
      const copiedVars = new Map(src.vars);
      for (const [key] of BARVY_STITKU) {
        if (!copiedVars.has(`--card-${key}`)) copiedVars.set(`--card-${key}`, nominalTagColor(key));
      }
      stav.drafty.set(id, { name, vars: copiedVars, overrides: new Map(), autoOverrides: new Map(),
        tagColors: new Map(src.tagColors), preservedOverrides: '', base: src.vars.get('--color-accent') || stav.zakladBarva, paletteName: '' });
      stav.zakladBarva = parsedFromCSS(src.vars.get('--color-accent') || '')?.hex || stav.zakladBarva;
      zavriFormNazvu(); preview(id);
      showPalette(true);
      setStatus(`Nový motiv „${name}“ je samostatnou kopií „${src.name}“. Vyber barvu a navrhni jeho paletu.`);
      return;
    }
    if (mode === 'rename') {
      saveUndo(); aktualni().name = name;
      const t = stav.temata.find(x => x.id === stav.aktivni); t.name = name;
      zavriFormNazvu(); renderHeader();
      setStatus(`Motiv přejmenován na „${name}“. Jeho technické ID ${t.id} zůstalo stejné.`);
    }
  }
  function smazMotiv() {
    const id = stav.aktivni;
    const index = stav.temata.findIndex(t => t.id === id);
    const t = stav.temata[index]; if (!t) return;
    if (id === 'light' || stav.puvodniTridy.includes(`theme-${id}`) || stav.temata.length < 2) {
      setStatus('Nelze smazat výchozí Světlý motiv ani motiv aktuálně uložený v aplikaci.');
      zavriFormNazvu(); return;
    }
    stav.history.push({ action: 'delete', index, theme: t, data: draft(id) });
    if (!t.new) stav.smazanaTemata.set(id, t);
    stav.drafty.delete(id); stav.temata.splice(index, 1);
    zavriFormNazvu();
    preview(stav.temata.find(x => x.id === 'light')?.id || stav.temata[0].id);
    setStatus(`Motiv „${t.name}“ byl označen k odstranění z budoucího exportu.`);
  }
  function renderActive() {
    get('lnTBtabs699C')?.querySelectorAll('[data-tab]').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === stav.aktivniTab);
      b.setAttribute('aria-pressed', String(b.dataset.tab === stav.aktivniTab));
    });
    if (stav.aktivniTab === 'css') renderCSS();
    else if (stav.aktivniTab === 'dom') renderDom();
    else renderVars();
  }
  function preview(id) {
    if (!draft(id)) return;
    document.body.classList.remove(...Array.from(document.body.classList).filter(c => c.startsWith('theme-')));
    if (id !== 'light') document.body.classList.add(`theme-${id}`);
    stav.aktivni = id;
    updateStyle(); renderHeader(); renderActive();
    if (stav.paletaOtevrena) renderPalettes();
    setStatus('Náhled motivu: ' + draft(id).name + '. Produkční CSS ani uložený motiv se nemění.');
  }

  function generateCSS() {
    let result = stav.source;
    // Pravidla původních témat se přepisují odzadu, aby seděly jejich indexy.
    const orig = [...stav.temata.filter(t => !t.new), ...stav.smazanaTemata.values()]
      .sort((a, b) => b.markerStart - a.markerStart);
    for (const t of orig) {
      if (stav.smazanaTemata.has(t.id)) {
        result = result.slice(0, t.markerStart) + result.slice(t.end);
        continue;
      }
      const d = draft(t.id);
      let rule = result.slice(t.start, t.end);
      rule = rule.replace(/(--[\w-]+\s*:\s*)([^;{}]+)(;)/g, (whole, prefix, current, semi) => {
        const val = d.vars.get(prefix.split(':')[0].trim());
        return val === undefined || val === current.trim() ? whole : `${prefix}${val}${semi}`;
      });
      // Doplněné proměnné (například barva druhého akcentu) zachovat i po exportu.
      const added = [...d.vars].filter(([key]) => !t.original.has(key));
      if (added.length) rule = rule.replace(/}\s*$/, `  ${added.map(([key, value]) => `${key}: ${value};`).join('\n  ')}\n}`);
      result = result.slice(0, t.markerStart) +
        (t.custom ? `/* LN-TB-CUSTOM: ${t.id} */\n` : '') +
        `/* THEME: ${t.id} | ${d.name.replace(/[|*\n\r]/g, ' ')} | selectable */` +
        result.slice(t.markerEnd, t.start) + rule + result.slice(t.end);
    }
    // Odstranit staré generované výjimky a místo nich vložit právě jednu aktuální sadu.
    result = result.replace(/\/\*\s*LN-TB-OVERRIDES:\s*([a-z0-9-]+):START\s*\*\/[\s\S]*?\/\*\s*LN-TB-OVERRIDES:\s*\1:END\s*\*\//g, '');
    result = result.replace(/\/\* =+\n   LUBANOTE THEME BUILDER 699C[\s\S]*?=+ \*\//g, '');
    let extras = '\n/* =========================================================\n   LUBANOTE THEME BUILDER 699C – NOVÁ TÉMATA A BAREVNÉ VÝJIMKY\n   Export pochází z Theme Builderu; ostatní CSS soubory zůstávají beze změny.\n   ========================================================= */\n';
    for (const t of stav.temata.filter(x => x.new)) {
      const d = draft(t.id);
      extras += `\n/* LN-TB-CUSTOM: ${t.id} */\n/* THEME: ${t.id} | ${d.name.replace(/[|*\n\r]/g, ' ')} | selectable */\nbody.theme-${t.id} {\n`;
      for (const [key, value] of d.vars) extras += `  ${key}: ${value};\n`;
      extras += '}\n';
      const bg = parsedFromCSS(d.vars.get('--color-background') || '')?.hex || '#111111';
      if (relativeLum(bg) < .25) extras += `body.theme-${t.id} #modalDate, body.theme-${t.id} #modalTime { color-scheme: dark; }\n`;
    }
    for (const t of stav.temata) {
      const d = draft(t.id);
      if (!d.overrides.size && !d.autoOverrides.size && !d.preservedOverrides && !d.tagColors.size && !cardSurfaceNeeded(t, d)) continue;
      extras += `\n/* LN-TB-OVERRIDES: ${t.id}:START */\n`;
      extras += `/* Motiv: ${d.name.replace(/\*\//g, '')} – automatická paleta (${d.autoOverrides.size}), ruční výjimky (${d.overrides.size}) */\n`;
      if (d.preservedOverrides) extras += komprimovatStarsiAutomatiku699CF(d.preservedOverrides);
      extras += komprimovatPravidla699CF(d.autoOverrides.values(), o => scopedSelector(t.id, o.selector, true));
      for (const o of d.overrides.values()) extras += makeOverrideCss(t.id, o);
      extras += makeTagColorsCSS(t.id, d.tagColors);
      if (cardSurfaceNeeded(t, d)) extras += cardSurfaceCss(t.id);
      extras += `/* LN-TB-OVERRIDES: ${t.id}:END */\n`;
    }
    const secret = result.search(/\/\*\s*=+\s*\n\s*SECRET REŽIM/i);
    if (secret >= 0) result = result.slice(0, secret) + extras + '\n' + result.slice(secret);
    else result += extras;
    return result;
  }
  async function copyCSS() {
    const css = generateCSS();
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(css);
      else throw new Error('Clipboard API unavailable');
    } catch (_) {
      const input = el('textarea');
      input.value = css; input.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.append(input); input.focus(); input.select();
      const ok = document.execCommand('copy'); input.remove();
      if (!ok) { setStatus('Kopírování selhalo. Použij export souboru na webu.'); return; }
    }
    setStatus('Kompletní obsah theme.css byl zkopírován do schránky.');
  }
  function exportCSS() {
    let css;
    try { css = generateCSS(); } catch (e) { errorLog('Export se nezdařil: ' + e.message); return; }
    const blob = new Blob([css], { type: 'text/css;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = el('a'); a.href = url; a.download = 'theme.css';
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    setStatus('Vygenerován kompletní theme.css. Nejdříve ho otestuj na TEST webu.');
  }
  function createTheme() { formNazev('create'); }
  function resetTheme() {
    const t = stav.temata.find(t => t.id === stav.aktivni);
    if (!t) return;
    if (!confirm(`Opravdu zahodit všechny rozpracované barevné změny motivu „${t.name}“?`)) return;
    if (t.new) {
      stav.drafty.delete(t.id); stav.temata = stav.temata.filter(x => x !== t);
      zavriFormNazvu();
      preview(stav.temata[0].id);
    } else {
      saveUndo();
      t.name = t.originalName;
      stav.drafty.set(t.id, { name: t.name, vars: new Map(t.original), overrides: new Map(), autoOverrides: new Map(),
        tagColors: new Map(t.tagColors), preservedOverrides: t.preservedOverrides, paletteName: '' });
      changed();
    }
    setStatus('Rozpracované změny motivu byly zahazeny.');
  }

  function selectionHandler(event) {
    if (!stav.vyberAktivni || !stav.panel || !dovoleno()) return;
    if (event.target?.closest?.(`#${ID}`) || event.target?.closest?.('.lubaTagColorOverlay683AC')) return;
    event.preventDefault(); event.stopImmediatePropagation(); event.stopPropagation();
    if (event.type === 'click') {
      stav.vyberAktivni = false; get('lnTBpick699C')?.setAttribute('aria-pressed', 'false');
      get('lnTBpick699C').textContent = '🎯 Vybrat prvek kliknutím';
      inspect(event.target?.nodeType === 1 ? event.target : event.target?.parentElement);
    }
  }
  function moveHighlight(event) {
    if (!stav.vyberAktivni || !stav.highlight) return;
    const node = event.target?.nodeType === 1 ? event.target : event.target?.parentElement;
    if (!node || node.closest?.(`#${ID}`)) { stav.highlight.hidden = true; return; }
    const r = node.getBoundingClientRect();
    const h = stav.highlight;
    h.hidden = false;
    Object.assign(h.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
  }
  function togglePick() {
    stav.vyberAktivni = !stav.vyberAktivni;
    const btn = get('lnTBpick699C');
    btn.setAttribute('aria-pressed', String(stav.vyberAktivni));
    btn.textContent = stav.vyberAktivni ? '✕ Zrušit výběr prvku' : '🎯 Vybrat prvek kliknutím';
    if (!stav.vyberAktivni && stav.highlight) stav.highlight.hidden = true;
    setStatus(stav.vyberAktivni ? 'Klepni na libovolný prvek mimo panel – kliknutí jeho akci nespustí.' : 'Výběr prvku vypnutý.');
  }

  function ui() {
    const panel = el('aside', 'lnTBpanel699C'); panel.id = ID;
    panel.setAttribute('role', 'region'); panel.setAttribute('aria-label', 'LubaNote Theme Builder');
    const hdr = el('div', 'lnTBheader699C');
    hdr.title = 'Podrž a táhni pro přesun Theme Builderu';
    const handle = el('span', 'lnTBhandle699C', '⠿'); handle.setAttribute('aria-hidden', 'true');
    const brand = el('div', 'lnTBbrand699C');
    brand.append(el('h2', '', '🎨 Theme Builder'), el('small', '', 'LubaNote · táhni hlavičku pro přesun'));
    const copyFast = el('button', 'lnTBcopyFast699C', '⧉ Kopírovat');
    copyFast.title = 'Zkopírovat celý theme.css do schránky'; copyFast.type = 'button';
    copyFast.addEventListener('click', copyCSS);
    const close = el('button', 'lnTBclose699C', '×'); close.title = 'Zavřít Theme Builder'; close.type = 'button';
    close.addEventListener('click', closeBuilder);
    const rightHandle = el('span', 'lnTBhandle699C lnTBhandleRight699C', '⠿');
    rightHandle.setAttribute('aria-hidden', 'true');
    hdr.append(handle, brand, copyFast, close, rightHandle); panel.append(hdr);
    hdr.addEventListener('pointerdown', zacniPresun);
    hdr.addEventListener('pointermove', presunPanel);
    hdr.addEventListener('pointerup', konecPresunu);
    hdr.addEventListener('pointercancel', konecPresunu);
    hdr.addEventListener('lostpointercapture', konecPresunu);

    // Jeden hlavní scroll: ovládací prvky, barvy i export jsou plně dosažitelné.
    const scrollAll = el('div', 'lnTBscroll699C'); scrollAll.id = 'lnTBscroll699C';
    const tools = el('div', 'lnTBtools699C');
    const selLabel = el('div', 'lnTBthemeLabel699C', 'Barevný motiv');
    const pickerBox = el('div', 'lnTBthemePicker699C');
    const themeButton = el('button', 'lnTBthemeTrigger699C'); themeButton.id = 'lnTBthemes699C';
    themeButton.type = 'button'; themeButton.setAttribute('aria-haspopup', 'listbox');
    themeButton.setAttribute('aria-expanded', 'false');
    const themeName = el('span'); themeName.id = 'lnTBthemeName699C';
    themeButton.append(themeName, el('span', 'lnTBchevron699C', '⌄'));
    const themeMenu = el('div', 'lnTBthemeMenu699C'); themeMenu.id = 'lnTBthemeMenu699C';
    themeMenu.setAttribute('role', 'listbox'); themeMenu.setAttribute('aria-label', 'Barevné motivy');
    themeMenu.hidden = true;
    themeButton.addEventListener('click', () => nastavOtevreniNabidky(themeMenu.hidden));
    pickerBox.append(themeButton, themeMenu);
    tools.append(selLabel, pickerBox);
    const actions = el('div', 'lnTBactions699C');
    const add = el('button', '', '+ Nový motiv'); add.addEventListener('click', createTheme);
    const back = el('button', '', '↶ Zpět'); back.title = 'Vrátit poslední barevnou úpravu'; back.addEventListener('click', undo);
    const reset = el('button', '', '↺ Zahodit změny'); reset.addEventListener('click', resetTheme);
    actions.append(add, back, reset); tools.append(actions);
    const manage = el('div', 'lnTBactions699C lnTBmanage699C');
    const rename = el('button', '', '✎ Přejmenovat'); rename.type = 'button'; rename.addEventListener('click', () => formNazev('rename'));
    const remove = el('button', '', '♻ Smazat motiv'); remove.type = 'button'; remove.addEventListener('click', () => formNazev('delete'));
    manage.append(rename, remove); tools.append(manage);
    const form = el('div', 'lnTBnameForm699C'); form.id = 'lnTBnameForm699C'; form.hidden = true; tools.append(form);
    const paletteButton = el('button', 'lnTBpaletteToggle699C', '🎨 Navrhnout paletu'); paletteButton.type = 'button';
    paletteButton.addEventListener('click', () => showPalette()); tools.append(paletteButton);
    const palettePanel = el('section', 'lnTBpalette699C'); palettePanel.id = 'lnTBpalette699C'; palettePanel.hidden = true;
    tools.append(palettePanel); scrollAll.append(tools);
    const tabs = el('div', 'lnTBtabs699C'); tabs.id = 'lnTBtabs699C';
    for (const [id, label] of [['vars', 'Základní barvy'], ['css', 'Všechna CSS'], ['dom', 'Prvky']]) {
      const b = el('button', '', label); b.type = 'button'; b.dataset.tab = id;
      b.addEventListener('click', () => { stav.aktivniTab = id; renderActive(); }); tabs.append(b);
    }
    scrollAll.append(tabs);
    const pick = el('button', 'lnTBpick699C', '🎯 Vybrat prvek kliknutím'); pick.id = 'lnTBpick699C'; pick.type = 'button';
    pick.addEventListener('click', togglePick); scrollAll.append(pick);
    const refresh = el('button', 'lnTBrefresh699C', '↻ Obnovit přehled CSS a prvků'); refresh.type = 'button';
    refresh.addEventListener('click', () => { readCSSRules(); scanDom(); nactiVlastniStitky(); renderActive(); setStatus('Katalog obnoven včetně barev štítků pro aktuální obrazovku.'); });
    scrollAll.append(refresh);
    const body = el('div', 'lnTBbody699C'); body.id = 'lnTBbody699C'; scrollAll.append(body);
    const footer = el('div', 'lnTBfooter699C');
    const count = el('small'); count.id = 'lnTBchanges699C'; footer.append(count);
    const exportBtn = el('button', 'lnTBexport699C', '⬇ Stáhnout theme.css');
    exportBtn.addEventListener('click', exportCSS); footer.append(exportBtn);
    const status = el('small', 'lnTBstatus699C'); status.id = 'lnTBstatus699C'; status.setAttribute('role', 'status'); footer.append(status);
    scrollAll.append(footer); panel.append(scrollAll);
    stav.root = panel; stav.panel = panel;
    document.body.append(panel);
    const highlight = el('div', 'lnTBhighlight699C'); highlight.hidden = true; stav.highlight = highlight;
    document.body.append(highlight);
  }

  async function openBuilder() {
    if (!dovoleno()) return false;
    if (document.body.classList.contains('secretModeActive')) {
      throw new Error('V interním Secret režimu nelze běžná témata upravovat.');
    }
    if (stav.panel?.isConnected) return true;
    const cssResponse = await fetch('theme.css?v=699C-theme-builder-source', { cache: 'no-store' });
    if (!cssResponse.ok) throw new Error('Nelze načíst theme.css (HTTP ' + cssResponse.status + ').');
    const source = await cssResponse.text();
    const available = nacistTemata(source);
    stav.source = source; stav.temata = available; stav.drafty = new Map(); stav.history = [];
    stav.smazanaTemata = new Map(); stav.paletaOtevrena = false; stav.editaceNazvu = null;
    stav.vlastniStitky = new Map();
    for (const t of available) stav.drafty.set(t.id, { name: t.name, vars: new Map(t.original), overrides: new Map(), autoOverrides: new Map(),
      tagColors: new Map(t.tagColors), preservedOverrides: t.preservedOverrides, paletteName: '' });
    stav.puvodniTridy = Array.from(document.body.classList).filter(c => c.startsWith('theme-'));
    stav.aktivni = available.find(t => t.id === (stav.puvodniTridy[0] || '').slice(6))?.id || 'light';
    if (!stav.drafty.has(stav.aktivni)) stav.aktivni = available[0].id;
    ui(); readCSSRules(); scanDom(); nactiVlastniStitky(); preview(stav.aktivni);
    document.addEventListener('pointerdown', selectionHandler, true);
    document.addEventListener('click', selectionHandler, true);
    document.addEventListener('pointermove', moveHighlight, true);
    document.addEventListener('keydown', escKey, true);
    document.addEventListener('pointerdown', zavriNabidkuMimo, true);
    window.addEventListener('resize', hlidejPozici);
    return true;
  }
  function zavriNabidkuMimo(event) {
    if (get('lnTBthemeMenu699C')?.hidden) return;
    if (!event.target?.closest?.('.lnTBthemePicker699C')) nastavOtevreniNabidky(false);
  }
  function escKey(event) {
    if (event.key === 'Escape' && !get('lnTBthemeMenu699C')?.hidden) {
      nastavOtevreniNabidky(false); return;
    }
    if (event.key === 'Escape' && stav.vyberAktivni) {
      event.stopPropagation(); togglePick();
    }
  }
  function hasUnsavedChanges() {
    if (stav.temata.some(t => t.new) || stav.smazanaTemata.size) return true;
    return stav.temata.some(t => {
      const d = draft(t.id);
      if (!d) return false;
      if (d.overrides.size || d.autoOverrides.size || d.tagColors.size !== t.tagColors.size || d.name !== t.originalName) return true;
      for (const [key, original] of t.original) if (d.vars.get(key) !== original) return true;
      for (const [key, original] of t.tagColors) if (d.tagColors.get(key) !== original) return true;
      return false;
    });
  }
  function closeBuilder() {
    if (!stav.panel?.isConnected) return;
    if (hasUnsavedChanges() && !confirm('Zavřít Theme Builder? Rozpracované změny, které jsi neexportoval, se zahodí.')) return;
    // Stop selection and remove preview before restoring the original app theme.
    stav.vyberAktivni = false;
    stav.presun = null;
    stav.panel.remove(); stav.highlight?.remove();
    document.getElementById(STYLE_ID)?.remove();
    document.removeEventListener('pointerdown', selectionHandler, true);
    document.removeEventListener('click', selectionHandler, true);
    document.removeEventListener('pointermove', moveHighlight, true);
    document.removeEventListener('keydown', escKey, true);
    document.removeEventListener('pointerdown', zavriNabidkuMimo, true);
    window.removeEventListener('resize', hlidejPozici);
    document.body.classList.remove(...Array.from(document.body.classList).filter(c => c.startsWith('theme-')));
    document.body.classList.add(...stav.puvodniTridy);
    stav.root = null; stav.panel = null; stav.highlight = null; stav.vybranyPrvek = null;
  }
  window.LubaNoteThemeBuilder699C = Object.freeze({ open: openBuilder, close: closeBuilder });
})();
