/* LubaNote 699C-H – one-tap tonal counterpart of the currently selected motif.
 * No theme is created or persisted in theme.css; the original theme ID remains.
 * Only the per-theme light/dark display choice is remembered locally.
 */
(() => {
  'use strict';
  if (window.LubaNoteLiveTone699H) return;
  const CLASS = 'lnAutoTone699H';
  const ROOT = `body.${CLASS}:not(.secretModeActive)`;
  const STYLE = 'lnAutoToneCss699H';
  const STORE = 'lubanote_theme_auto_counterpart_699H';
  const CARD_NAMES = ['cervena','oranzova','zluta','zelena','tyrkysova','modra','fialova','ruzova'];
  const TOKEN = /#[a-f\d]{3,8}\b|(?:rgba?|hsla?)\([^()]*\)/gi;
  let current = null;
  let observer = null;
  let tagStyle = null;
  let generatedCSS = null;
  let activeBase = null;
  let suspended = null;
  function clamp(n, min=0, max=1) { return Math.max(min, Math.min(max, n)); }
  function parse(v) {
    if (!v) return null;
    const h = /^#([\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.exec(String(v).trim());
    if (h) {
      const s = h[1].length <= 4 ? [...h[1]].map(x => x+x).join('') : h[1];
      return { rgb: [0,2,4].map(i => parseInt(s.slice(i,i+2),16)), alpha: s.length === 8 ? parseInt(s.slice(6,8),16)/255 : 1 };
    }
    const r = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i.exec(String(v).trim());
    if (r) return { rgb: [r[1],r[2],r[3]].map(n=>clamp(+n,0,255)), alpha: r[4] === undefined ? 1 : clamp(+r[4]) };
    return null;
  }
  function toHex(rgb) { return '#'+rgb.map(x=>Math.round(clamp(x,0,255)).toString(16).padStart(2,'0')).join(''); }
  function hslToRgb(h,s,l) {
    const f = n => { const k=(n+h/30)%12, a=s*Math.min(l,1-l); return 255*(l-a*Math.max(-1,Math.min(k-3,9-k,1))); };
    return [f(0),f(8),f(4)];
  }
  function hslHex(h,s,l) { return toHex(hslToRgb(h,clamp(s),clamp(l))); }
  function rgbToHsl(color) {
    const c=parse(color); if (!c) return {h:195,s:.5,l:.5};
    const a=c.rgb.map(x=>x/255), mx=Math.max(...a), mn=Math.min(...a), diff=mx-mn, l=(mx+mn)/2;
    let h=0, s=diff===0?0:diff/(1-Math.abs(2*l-1));
    if (diff) { switch(mx) { case a[0]: h=(a[1]-a[2])/diff+(a[1]<a[2]?6:0);break; case a[1]:h=(a[2]-a[0])/diff+2;break;default:h=(a[0]-a[1])/diff+4; } h*=60; }
    return {h,s,l};
  }
  function lum(color) {
    const p=parse(color); if (!p) return 0;
    const v=p.rgb.map(n=>{let x=n/255;return x<=.04045?x/12.92:Math.pow((x+.055)/1.055,2.4);});
    return .2126*v[0]+.7152*v[1]+.0722*v[2];
  }
  function contrast(a,b) { const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); }
  function textFor(bg) { return contrast('#10202b',bg)>=contrast('#ffffff',bg)?'#10202b':'#ffffff'; }
  function rgba(hex,a) { return a>=.999?hex:`rgba(${parse(hex).rgb.map(Math.round).join(', ')}, ${Number(a.toFixed(3))})`; }
  function palette(accent,dark) {
    const {h,s}=rgbToHsl(accent);
    // Pastel (not white) surfaces keep the original theme's hue.
    const bg=hslHex(h,dark?.33:.22,dark?.095:.936);
    const surface=hslHex(h,dark?.30:.16,dark?.165:.968);
    const editor=hslHex(h,dark?.31:.17,dark?.115:.951);
    const bright=hslHex(h,clamp(s+.08,.57,.88),dark?.60:.39);
    const second=hslHex(h,clamp(s,.43,.83),dark?.63:.42);
    const elev=hslHex(h,dark?.28:.19,dark?.23:.89);
    const border=hslToRgb(h,dark?.48:.32,dark?.75:.32).map(Math.round);
    const p=new Map([
      ['--color-background',bg],['--color-surface',surface],['--color-surface-elevated',elev],
      ['--color-text',textFor(bg)],['--color-text-secondary',hslHex(h,dark?.24:.20,dark?.78:.30)],
      ['--color-accent',bright],['--color-accent-secondary',second],
      ['--color-accent-text',hslHex(h,dark?.78:.73,dark?.78:.29)],['--color-on-accent',textFor(bright)],
      ['--color-border',`rgba(${border.join(', ')}, ${dark?.23:.17})`],
      ['--color-editor-background',editor],['--color-editor-text',textFor(editor)]
    ]);
    (dark?[.90,.79,.68,.57,.47,.37,.28,.20]:[.96,.88,.79,.68,.56,.45,.35,.25]).forEach((l,i)=>{
      p.set(`--card-${CARD_NAMES[i]}`,hslHex((h+(i-3.5)*3+360)%360,clamp(s*.69,.29,.64),l));
    });
    return p;
  }
  function semantic(selector) {
    return /(?:\[data-(?:state|status|error|direction|high|low|severity|result|highlight-color|epub-highlight-color|file-type)\b|\[aria-invalid\b|\.is-(?:yellow|green|blue|violet|red|docx?|epub|sql|pdf|txt|xlsx?|pptx?|html|css|js|json|csv|md)\b|\.reader-theme-[\w-]+|\.textcolor(?:white|black)\b|\.textcolorpalette\b|\.documents(?:epubhighlight|epubmarkcolor|epubselectioncolors|docxviewercontent|epubcontent|epubbody)\b|::(?:highlight|selection)\b)/i.test(selector) ||
      /(?:^|[^a-z])(?:overdue|offline|online|pending|synced|syncing|conflict|expired|success|failure|failed|error|warning|danger|critical|invalid|disabled|readonly|destructive|reset|delete|trash|recovery)(?:$|[^a-z])/i.test(selector);
  }
  function mapColorRule(selector,property,value,p) {
    const s=selector.toLowerCase(), prop=property.toLowerCase();
    if (semantic(s) || /(?:theme-|secretmodeactive|:host|#ln-theme-builder-699c)/.test(s)) return null;
    if (/(?:taskcard|tasktag|cardcolor|\[data-barva-karty|\[data-tag-color|categorytab|tagoptions|tagfilter|managetag|luba-card-bg|luba-tag-bg|luba-tag-text)/.test(s)) return null;
    if (/(?:tag|stitek|category|chip|badge|cardpalette|colorpicker|customcolor)/.test(s) && /(?:background|color|fill|stroke)/.test(prop)) return null;
    if (/\b(?:var\(|currentcolor|inherit|url\()/i.test(value) || /(?:background-image|text-shadow|box-shadow)/i.test(prop)) return null;
    if (!/^(?:color|background(?:-color)?|fill|stroke|caret-color|outline-color|text-decoration-color|border(?:-[a-z-]+)?)$/.test(prop)) return null;
    if (!TOKEN.test(value)) { TOKEN.lastIndex=0; return null; } TOKEN.lastIndex=0;
    const bg=/^background/.test(prop), border=/^border|^outline/.test(prop), icon=/^(fill|stroke|caret-color|text-decoration-color)$/.test(prop);
    const special=/active|selected|highlight|focus|checked|primary|accent|current/.test(s), hover=/:hover|:active/.test(s);
    const target=border?(special?'--color-accent':'--color-border'):
      bg?(special||hover?'--color-accent':/(?:modal|dialog|panel|card|button|toolbar|menu|nav|input)/.test(s)?'--color-surface':'--color-background'):
      special||icon?'--color-accent-text':'--color-text';
    let n=0;
    const next=value.replace(TOKEN, term=>{
      const orig=parse(term); if(!orig) return term;
      const tone=rgbToHsl(term);
      const colored=!border && (bg||icon) && tone.s>.40 && tone.l>.25 && tone.l<.82;
      const hex=p.get(colored?(n++%2===0?'--color-accent-secondary':'--color-accent'):target);
      if (!hex) return term;
      const paint=parse(hex);
      return paint?rgba(toHex(paint.rgb),orig.alpha):hex;
    });
    return next!==value?next:null;
  }
  function splitSelectors(selector) {
    let out=[], buf='', round=0,square=0,quoted='';
    for (let i=0;i<selector.length;i++) {
      const c=selector[i];
      if (quoted) {buf+=c; if(c===quoted && selector[i-1]!=='\\')quoted='';continue;}
      if(c==='"'||c==="'"){quoted=c;buf+=c;continue;}
      if(c==='(') round++;else if(c===')')round--;
      else if(c==='[')square++;else if(c===']')square--;
      if(c===',' && !round && !square) {out.push(buf.trim());buf='';}else buf+=c;
    }
    if(buf.trim())out.push(buf.trim());return out;
  }
  function scopeSelector(selector) {
    // Never accidentally match the Theme Builder or tag color picker.
    if (/^:root\s+body\b/i.test(selector)) return selector.replace(/\bbody\b/i,ROOT);
    if (/^body\b/i.test(selector)) return selector.replace(/^body\b/i,ROOT);
    if (/^(?:html|:root)(?:$|[.:#\[\s])/i.test(selector)) return selector.replace(/^(?:html|:root)/i,`html:has(> ${ROOT})`);
    return `${ROOT} ${selector}`;
  }
  function fixedColors(p) {
    const seen=[];
    for(const sheet of document.styleSheets) {
      const url=sheet.href||'';
      if (!url || /(?:^|\/)(?:theme(?:Builder\w*)?|debug\w*|studio\w*|dictionary\w*|keyboard\w*|generated\w*)\.css(?:\?|$)/i.test(url)) continue;
      if (!/\.css(?:\?|$)/i.test(url)) continue;
      let rules;try{rules=sheet.cssRules;}catch(_){continue;}
      const visit=(rows,wrappers=[])=>{
        for(const r of rows){
          if(r.type===CSSRule.STYLE_RULE){
            const sel=r.selectorText||'';
            if(!sel||semantic(sel)||/secretmodeactive|#ln-theme-builder-699c|lubaTagColorOverlay683AC/i.test(sel)) continue;
            const selectors=splitSelectors(sel).map(scopeSelector);
            if(!selectors.length)continue;
            const changes=[];
            for(const name of r.style){
              const value=r.style.getPropertyValue(name).trim();
              const next=mapColorRule(sel,name,value,p);
              if(next)changes.push({name,value:next});
            }
            if(!changes.length)continue;
            const bg=changes.find(x=>/^(?:background|background-color)$/.test(x.name));
            if(bg && parse(bg.value)?.alpha >= .98) {
              for(const x of changes) if(/^(?:color|-webkit-text-fill-color)$/.test(x.name) && parse(x.value) && contrast(x.value,bg.value)<4.5) x.value=textFor(bg.value);
            }
            let line=`${selectors.join(',\n')} { ${changes.map(x=>`${x.name}: ${x.value} !important;`).join(' ')} }`;
            for(let i=wrappers.length-1;i>=0;i--)line=`${wrappers[i]} {\n${line}\n}`;
            seen.push(line);
          } else if(r.cssRules){
            const head=r.cssText.slice(0,r.cssText.indexOf('{')).trim();
            if(/^@(media|supports|container)\b/.test(head))visit(r.cssRules,[...wrappers,head]);
          }
        }
      };
      visit(rules);
    }
    return seen.join('\n');
  }
  function getBaseAccent() {
    const computed=getComputedStyle(document.body);
    const raw=computed.getPropertyValue('--color-accent').trim();
    const parsed=parse(raw);return parsed?toHex(parsed.rgb):'#19b7c9';
  }
  function currentSaved() { try {const o=JSON.parse(localStorage.getItem(STORE)||'null');return o&&typeof o.theme==='string'?o:null;}catch(_){return null;} }
  function setSaved(value) { try{value?localStorage.setItem(STORE,JSON.stringify(value)):localStorage.removeItem(STORE);}catch(_){} }
  function customColors(p,dark) {
    const originals=new Set();
    for(const e of document.querySelectorAll('[data-tag-color], .taskCard[data-barva-karty]')){
      const raw=e.getAttribute('data-tag-color')||e.getAttribute('data-barva-karty');
      if (/^#[a-f\d]{6}$/i.test(raw||''))originals.add(raw.toLowerCase());
    }
    // CSS-defined custom tag colors also work before the notes list is rendered.
    for(const sheet of document.styleSheets){
      if (!/\/theme\.css(?:\?|$)/.test(sheet.href||''))continue;
      try{for(const r of sheet.cssRules){
        if(r.type!==CSSRule.STYLE_RULE || !r.selectorText?.includes('.taskCard[data-barva-karty='))continue;
        const selectors=r.selectorText;
        if(activeBase && !selectors.includes(`body.theme-${activeBase}`))continue;
        for(const m of selectors.matchAll(/data-barva-karty=["'](#[\da-f]{6})["']/gi))originals.add(m[1].toLowerCase());
      }}catch(_){};
    }
    const names=[...originals].sort();
    if(!names.length) return '';
    const h=rgbToHsl(p.get('--color-accent')).h;
    return names.map((src,i)=>{
      const tint=hslHex((h-12+i*24/Math.max(1,names.length-1)+360)%360,dark?.47:.43,
        dark?.23+i*.11/Math.max(1,names.length-1):.90-i*.24/Math.max(1,names.length-1));
      const fg=textFor(tint),v=`[data-barva-karty="${src}" i]`,t=`[data-tag-color="${src}" i]`;
      return `${ROOT} .taskCard${v} { --luba-card-bg: ${tint} !important; --luba-tag-text-683AB: ${fg} !important; }
body.${CLASS} .categoryTab${t},body.${CLASS} .tagOptions button${t},body.${CLASS} .manageTagColorButton${t} { background-color: ${tint} !important; --luba-tag-bg: ${tint} !important; -webkit-text-fill-color: ${fg} !important; }`;
    }).join('\n');
  }
  function updateTagCSS(p,dark){
    if(!tagStyle){tagStyle=document.createElement('style');tagStyle.id='lnAutoToneTags699H';document.head.appendChild(tagStyle);}
    tagStyle.textContent=customColors(p,dark);
  }
  function startObserver(p,dark) {
    if(observer)observer.disconnect();
    let needs=false;
    observer=new MutationObserver(mutations=>{
      if(needs)return;
      for(const m of mutations){
        for(const n of m.addedNodes){
          if(n.nodeType===1 && (n.matches?.('[data-tag-color],.taskCard[data-barva-karty]') || n.querySelector?.('[data-tag-color],.taskCard[data-barva-karty]'))){
            needs=true;requestAnimationFrame(()=>{needs=false;if(current)updateTagCSS(p,dark);});return;
          }
        }
      }
    });
    observer.observe(document.body,{childList:true,subtree:true});
  }
  function disable(keepPreference=false) {
    current=null;
    document.body.classList.remove(CLASS);
    if(observer){observer.disconnect();observer=null;}
    if(!keepPreference)setSaved(null);
    if(tagStyle)tagStyle.textContent='';
    if(generatedCSS)generatedCSS.textContent='';
    activeBase=null;
  }
  function enable(theme,dark,remember=true) {
    try {
      disable(true);
      activeBase=theme;
      const accent=getBaseAccent();
      const p=palette(accent,dark);
      const vars=[...p].map(([k,v])=>`${k}: ${v} !important;`).join(' ');
      const css=fixedColors(p);
      generatedCSS=document.getElementById(STYLE)||document.createElement('style');
      generatedCSS.id=STYLE;
      generatedCSS.textContent=`body.${CLASS}:not(.secretModeActive) { ${vars} background:var(--color-background) !important; color:var(--color-text) !important; }
${css}
body.${CLASS}:not(.secretModeActive) .taskCard[data-barva-karty]:not(.cardSelected):not(.lubaSwipeDoneTarget) {background:var(--luba-card-bg) !important;}
body.${CLASS}:not(.secretModeActive) .taskCard:not([data-barva-karty]):not(.cardSelected):not(.lubaSwipeDoneTarget) {background:var(--color-surface) !important;}
body.${CLASS}:not(.secretModeActive) .taskCard.lubaSwipeDoneTarget::before {background:var(--luba-card-bg) !important;}`;
      if(!generatedCSS.isConnected)document.head.appendChild(generatedCSS);
      current={theme,dark,p};
      updateTagCSS(p,dark);
      document.body.classList.add(CLASS);
      startObserver(p,dark);
      if(remember)setSaved({theme,dark});
      return true;
    }catch(error){
      console.error('LubaNote: nelze vytvořit tónovanou variantu motivu',error);
      disable();return false;
    }
  }
  function restore(theme) {
    const saved=currentSaved();
    if(saved?.theme===theme && typeof saved.dark==='boolean')return enable(theme,saved.dark,false);
    disable();return false;
  }
  // Theme Builder must inspect only real project CSS, not transient runtime CSS.
  function suspend() {
    if (current) { suspended={theme:current.theme,dark:current.dark}; disable(true); }
  }
  function resume() {
    const was=suspended;suspended=null;
    if(was && (was.theme==='light' || document.body.classList.contains(`theme-${was.theme}`))) {
      enable(was.theme,was.dark,false);
    }
  }
  window.LubaNoteLiveTone699H={enable,disable,restore,suspend,resume,
    isActive:theme=>!!current&&current.theme===theme,
    effectiveDark:theme=>current?.theme===theme?current.dark:null};
})();
