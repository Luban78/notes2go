/* LubaNote Theme Builder 699C – admin-only, lazy loaded.
 * Every change stays in memory until a deliberate full theme.css export.
 * No writes to localStorage, the backend, or the production stylesheet.
 */
(() => {
  'use strict';
  if (window.LubaNoteThemeBuilder699C) return;

  const ID = 'ln-theme-builder-699c';
  const STYLE_ID = 'ln-theme-builder-live-699c';
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
    celekCss: 0, chybyCss: [], history: [], zmenaPriVyberu: false, nacteno: false
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
      found.push({ id, name, start: rule.start, end: rule.end, original: vars });
    }
    if (!found.length) throw new Error('V theme.css nebyla nalezena žádná volitelná témata.');
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
    for (const o of d.overrides.values()) css += makeOverrideCss(stav.aktivni, o);
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
  function scopedSelector(id, selector) {
    const body = scope(id);
    return splitSelector(selector).map(s => {
      s = s.replace(/\bbody\.theme-[\w-]+/g, 'body');
      if (/^:root(?:\b|:)/.test(s)) return `:root:has(> ${body})${s.slice(5)}`;
      if (/^html(?:\b|:)/.test(s)) return `html:has(> ${body})${s.slice(4)}`;
      if (/^body(?:\b|[\[:.#])/.test(s)) return `:root ${s.replace(/^body/, body)}`;
      return `:root ${body} ${s}`;
    }).join(',\n');
  }
  function makeOverrideCss(id, o) {
    const sel = scopedSelector(id, o.selector);
    const prop = o.property.replace(/[^a-zA-Z-]/g, '');
    const value = o.value.replace(/[{};]/g, '');
    let result = `${sel} { ${prop}: ${value} !important; }\n`;
    for (let i = o.context.length - 1; i >= 0; i--) result = `${o.context[i]} {\n${result}}\n`;
    return result;
  }

  function renderVars() {
    const target = get('lnTBbody699C');
    if (!target) return;
    target.replaceChildren();
    const d = aktualni();
    for (const [k, v] of d.vars) {
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
    target.append(el('p', 'lnTBhint699C', 'Každá změna zde upraví všechny prvky používající odpovídající CSS proměnnou. Pro výjimky a pevně zadané barvy použij záložku CSS barvy nebo režim kliknutí na prvek.'));
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
    stav.history.push({ id: stav.aktivni, vars: new Map(d.vars), overrides: new Map(d.overrides) });
    if (stav.history.length > 60) stav.history.shift();
  }
  function undo() {
    const last = stav.history.pop();
    if (!last) { setStatus('Žádná starší úprava k vrácení.'); return; }
    const d = draft(last.id);
    if (!d) { setStatus('Motiv byl odstraněn.'); return; }
    d.vars = new Map(last.vars);
    d.overrides = new Map(last.overrides);
    preview(last.id);
    setStatus('Poslední barevná úprava byla vrácena.');
  }
  function changed() {
    updateStyle();
    renderActive();
    renderHeader();
    setStatus('Změna je pouze v živém náhledu. Pro trvalé použití exportuj theme.css.');
  }
  function renderHeader() {
    const d = aktualni();
    textValue(get('lnTBchanges699C'), `${d?.overrides.size || 0} výjimek · ${stav.drafty.size} motivů`);
    const picker = get('lnTBthemes699C');
    if (picker) {
      const chosen = picker.value;
      picker.replaceChildren();
      for (const t of stav.temata) {
        const o = el('option', '', t.name); o.value = t.id; picker.append(o);
      }
      picker.value = stav.aktivni || chosen;
    }
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
    setStatus('Náhled motivu: ' + draft(id).name + '. Produkční CSS ani uložený motiv se nemění.');
  }

  function generateCSS() {
    let result = stav.source;
    const original = stav.temata.filter(t => !t.new).sort((a, b) => b.start - a.start);
    for (const t of original) {
      const d = draft(t.id);
      let originalBlock = result.slice(t.start, t.end);
      originalBlock = originalBlock.replace(/(--[\w-]+\s*:\s*)([^;{}]+)(;)/g, (whole, start, current, semi) => {
        const v = d.vars.get(start.split(':')[0].trim());
        return v === undefined || v === current.trim() ? whole : `${start}${v}${semi}`;
      });
      result = result.slice(0, t.start) + originalBlock + result.slice(t.end);
    }
    let extras = '\n/* =========================================================\n   LUBANOTE THEME BUILDER 699C – NOVÁ TÉMATA A BAREVNÉ VÝJIMKY\n   Export je součástí theme.css; původní pravidla zůstávají zachována.\n   ========================================================= */\n';
    for (const t of stav.temata.filter(x => x.new)) {
      const d = draft(t.id);
      const safeName = t.name.replace(/[|*\n\r]/g, ' ').slice(0, 70);
      extras += `\n/* THEME: ${t.id} | ${safeName} | selectable */\nbody.theme-${t.id} {\n`;
      for (const [key, value] of d.vars) extras += `  ${key}: ${value};\n`;
      extras += '}\n';
      const bg = parsedFromCSS(d.vars.get('--color-background') || '')?.hex || '#111111';
      const n = [1, 3, 5].map(i => parseInt(bg.slice(i, i + 2), 16));
      if ((n[0] * 299 + n[1] * 587 + n[2] * 114) / 1000 < 128) {
        extras += `body.theme-${t.id} #modalDate, body.theme-${t.id} #modalTime { color-scheme: dark; }\n`;
      }
    }
    for (const t of stav.temata) {
      const d = draft(t.id);
      if (!d.overrides.size) continue;
      extras += `\n/* Motiv: ${t.name.replace(/\*\//g, '')} – cílené úpravy barev */\n`;
      for (const o of d.overrides.values()) extras += makeOverrideCss(t.id, o);
    }
    const secret = result.search(/\/\*\s*=+\s*\n\s*SECRET REŽIM/i);
    if (secret >= 0) result = result.slice(0, secret) + extras + '\n' + result.slice(secret);
    else result += extras; // guarded fallback for older theme.css layouts
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
  function createTheme() {
    const label = prompt('Jak se má nové téma jmenovat? (např. Lesní zelená)');
    if (label === null) return;
    const name = label.replace(/[|*\n\r]/g, ' ').trim().slice(0, 55);
    if (!name) return setStatus('Název nesmí být prázdný.');
    const id = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32);
    if (!/^[a-z][a-z0-9-]{1,31}$/.test(id)) return setStatus('Název nevytvořil platné CSS ID; zvol jiný.');
    if (stav.temata.some(t => t.id === id)) return setStatus('Takto pojmenovaný motiv už existuje.');
    const src = aktualni();
    stav.temata.push({ id, name, new: true });
    stav.drafty.set(id, { name, vars: new Map(src.vars), overrides: new Map() });
    preview(id);
    setStatus(`Nový motiv „${name}“ vznikl jako kopie „${src.name}“. Bude součástí exportovaného theme.css.`);
  }
  function resetTheme() {
    const t = stav.temata.find(t => t.id === stav.aktivni);
    if (!t) return;
    if (!confirm(`Opravdu zahodit všechny rozpracované barevné změny motivu „${t.name}“?`)) return;
    if (t.new) {
      stav.drafty.delete(t.id); stav.temata = stav.temata.filter(x => x !== t);
      preview(stav.temata[0].id);
    } else {
      stav.drafty.set(t.id, { name: t.name, vars: new Map(t.original), overrides: new Map() });
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
    const brand = el('div'); brand.append(el('h2', '', '🎨 Theme Builder'), el('small', '', 'LubaNote · pouze živý náhled'));
    const close = el('button', 'lnTBclose699C', '×'); close.title = 'Zavřít Theme Builder'; close.type = 'button';
    close.addEventListener('click', closeBuilder); hdr.append(brand, close); panel.append(hdr);
    const tools = el('div', 'lnTBtools699C');
    const selLabel = el('label', '', 'Barevný motiv');
    const sel = el('select'); sel.id = 'lnTBthemes699C'; sel.addEventListener('change', () => preview(sel.value));
    selLabel.append(sel); tools.append(selLabel);
    const actions = el('div', 'lnTBactions699C');
    const add = el('button', '', '+ Nový motiv'); add.addEventListener('click', createTheme);
    const back = el('button', '', '↶ Zpět'); back.title = 'Vrátit poslední barevnou úpravu'; back.addEventListener('click', undo);
    const reset = el('button', '', '↺ Zahodit změny'); reset.addEventListener('click', resetTheme);
    actions.append(add, back, reset); tools.append(actions); panel.append(tools);
    const tabs = el('div', 'lnTBtabs699C'); tabs.id = 'lnTBtabs699C';
    for (const [id, label] of [['vars', 'Základní barvy'], ['css', 'Všechna CSS'], ['dom', 'Prvky']]) {
      const b = el('button', '', label); b.type = 'button'; b.dataset.tab = id;
      b.addEventListener('click', () => { stav.aktivniTab = id; renderActive(); }); tabs.append(b);
    }
    panel.append(tabs);
    const pick = el('button', 'lnTBpick699C', '🎯 Vybrat prvek kliknutím'); pick.id = 'lnTBpick699C'; pick.type = 'button';
    pick.addEventListener('click', togglePick); panel.append(pick);
    const refresh = el('button', 'lnTBrefresh699C', '↻ Obnovit přehled CSS a prvků'); refresh.type = 'button';
    refresh.addEventListener('click', () => { readCSSRules(); scanDom(); renderActive(); setStatus('Katalog obnoven pro aktuální obrazovku.'); });
    panel.append(refresh);
    const scroll = el('div', 'lnTBbody699C'); scroll.id = 'lnTBbody699C'; panel.append(scroll);
    const footer = el('div', 'lnTBfooter699C');
    const count = el('small'); count.id = 'lnTBchanges699C'; footer.append(count);
    const exportBtn = el('button', 'lnTBexport699C', '⬇ Exportovat kompletní theme.css');
    exportBtn.addEventListener('click', exportCSS); footer.append(exportBtn);
    const copyBtn = el('button', 'lnTBcopy699C', '⧉ Kopírovat celý CSS do schránky');
    copyBtn.addEventListener('click', copyCSS); footer.append(copyBtn);
    const status = el('small', 'lnTBstatus699C'); status.id = 'lnTBstatus699C'; status.setAttribute('role', 'status'); footer.append(status);
    panel.append(footer);
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
    for (const t of available) stav.drafty.set(t.id, { name: t.name, vars: new Map(t.original), overrides: new Map() });
    stav.puvodniTridy = Array.from(document.body.classList).filter(c => c.startsWith('theme-'));
    stav.aktivni = available.find(t => t.id === (stav.puvodniTridy[0] || '').slice(6))?.id || 'light';
    if (!stav.drafty.has(stav.aktivni)) stav.aktivni = available[0].id;
    ui(); readCSSRules(); scanDom(); preview(stav.aktivni);
    document.addEventListener('pointerdown', selectionHandler, true);
    document.addEventListener('click', selectionHandler, true);
    document.addEventListener('pointermove', moveHighlight, true);
    document.addEventListener('keydown', escKey, true);
    return true;
  }
  function escKey(event) {
    if (event.key === 'Escape' && stav.vyberAktivni) {
      event.stopPropagation(); togglePick();
    }
  }
  function hasUnsavedChanges() {
    if (stav.temata.some(t => t.new)) return true;
    return stav.temata.some(t => {
      const d = draft(t.id);
      if (!d) return false;
      if (d.overrides.size) return true;
      for (const [key, original] of t.original) if (d.vars.get(key) !== original) return true;
      return false;
    });
  }
  function closeBuilder() {
    if (!stav.panel?.isConnected) return;
    if (hasUnsavedChanges() && !confirm('Zavřít Theme Builder? Rozpracované změny, které jsi neexportoval, se zahodí.')) return;
    // Stop selection and remove preview before restoring the original app theme.
    stav.vyberAktivni = false;
    stav.panel.remove(); stav.highlight?.remove();
    document.getElementById(STYLE_ID)?.remove();
    document.removeEventListener('pointerdown', selectionHandler, true);
    document.removeEventListener('click', selectionHandler, true);
    document.removeEventListener('pointermove', moveHighlight, true);
    document.removeEventListener('keydown', escKey, true);
    document.body.classList.remove(...Array.from(document.body.classList).filter(c => c.startsWith('theme-')));
    document.body.classList.add(...stav.puvodniTridy);
    stav.root = null; stav.panel = null; stav.highlight = null; stav.vybranyPrvek = null;
  }
  window.LubaNoteThemeBuilder699C = Object.freeze({ open: openBuilder, close: closeBuilder });
})();
