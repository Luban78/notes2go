/* 693S: SVG Studio tools. Admin-only, offline. Never writes production icons or DB. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const open = $('adminSvgStudio693RButton'), view = $('adminSvgStudio693RView');
  const home = $('adminDashboardHome'), back = $('adminSvgStudio693RBack');
  const modal = $('adminDashboardModal'), svg = $('lnSvgCanvas693R');
  if (!open || !view || !home || !back || !modal || !svg) return;

  const NS = 'http://www.w3.org/2000/svg';
  const tool = $('lnSvgTool693R'), stroke = $('lnSvgStroke693R'), source = $('lnSvgSource693R');
  const color = $('lnSvgColor693S'), themeColor = $('lnSvgThemeColor693S');
  const fill = $('lnSvgFill693S'), preview = $('lnSvgPreview693S'), previewLarge = $('lnSvgPreviewLarge693S');
  const notice = $('lnSvgMessage693R'), undoBtn = $('lnSvgUndo693R'), redoBtn = $('lnSvgRedo693S');
  const selectionLabel = $('lnSvgSelection693S');
  const allowed = new Set(['path', 'circle', 'rect', 'line', 'ellipse', 'polyline', 'polygon']);
  const attrs = new Set(['d','cx','cy','r','rx','ry','x','y','x1','x2','y1','y2','width','height','points','stroke-width','stroke-linecap','stroke-linejoin','fill','stroke','transform','opacity']);
  const deepCopy = data => JSON.parse(JSON.stringify(data));
  const clamp = x => Math.max(0, Math.min(24, Math.round(x * 100) / 100));
  const fmt = x => String(Math.round(x * 100) / 100);
  const announce = message => { if (notice) notice.textContent = message; };
  let shapes = [], history = [], future = [], drawing = null, gesture = null, selected = -1;
  let activeColor = 'currentColor';
  let sourceIsEdited693T = false;
  source.addEventListener('input', () => { sourceIsEdited693T = true; });

  const svgPart = o => {
    const el = document.createElementNS(NS, o.tag);
    for (const [name, value] of Object.entries(o.props)) el.setAttribute(name, String(value));
    return el;
  };
  const normalColor = value => /^(?:currentColor|#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?|[a-zA-Z]{1,20})$/.test(String(value)) ? value : 'currentColor';
  function snapshot() { return deepCopy(shapes); }
  function record(before) {
    if (JSON.stringify(before) === JSON.stringify(shapes)) return false;
    history.push(before);
    if (history.length > 70) history.shift();
    future = [];
    return true;
  }
  function offset(s) {
    const m = String(s.props.transform || '').match(/^translate\(\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*\)$/);
    return m ? { x: Number(m[1]), y: Number(m[2]) } : { x: 0, y: 0 };
  }
  function setOffset(s, x, y) {
    x = Math.round(x * 100) / 100; y = Math.round(y * 100) / 100;
    if (Math.abs(x) + Math.abs(y) < .001) delete s.props.transform;
    else s.props.transform = `translate(${fmt(x)} ${fmt(y)})`;
  }
  function exportSvg() {
    return `<svg xmlns="${NS}" viewBox="0 0 24 24">${shapes.map(s => svgPart(s).outerHTML).join('')}</svg>`;
  }
  function exportForLuba() {
    return '[\n' + shapes.map(s => `  [${JSON.stringify(s.tag)}, ${JSON.stringify(s.props)}]`).join(',\n') + '\n]';
  }
  function updatePalette() {
    if (color) color.value = activeColor === 'currentColor' ? '#333333' : activeColor;
    themeColor?.setAttribute('aria-pressed', String(activeColor === 'currentColor'));
    document.querySelectorAll('.lnSvgSwatch693S').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.color === activeColor)));
  }
  function updateSelection() {
    if (selectionLabel) selectionLabel.textContent = selected < 0 ? 'Žádný vybraný tvar' : `Vybraný tvar ${selected + 1} / ${shapes.length} (${shapes[selected]?.tag || '—'})`;
  }
  function render() {
    // Keep pointer capture on the persistent SVG root while redrawing children.
    svg.replaceChildren();
    for (let i = 0; i <= 24; i += 2) {
      const path = svgPart({tag:'path',props:{d:`M${i} 0V24 M0 ${i}H24`,stroke:'currentColor','stroke-width':'.055',opacity:'.2',fill:'none'}});
      path.style.pointerEvents = 'none'; svg.appendChild(path);
    }
    const visible = [...shapes, ...(drawing ? [drawing] : [])];
    for (const s of visible) {
      const el = svgPart(s); el.style.pointerEvents = 'none'; svg.appendChild(el);
    }
    if (selected >= 0 && shapes[selected] && ['move','eraser'].includes(tool.value)) {
      try {
        const el = svgPart(shapes[selected]); svg.appendChild(el);
        const b = el.getBBox(), d = offset(shapes[selected]); el.remove();
        const mark = svgPart({tag:'rect',props:{x:fmt(b.x+d.x-.6),y:fmt(b.y+d.y-.6),width:fmt(b.width+1.2),height:fmt(b.height+1.2),rx:'.35',fill:'none',stroke:'#00c5b9','stroke-width':'.22','stroke-dasharray':'.7 .45'}});
        mark.style.pointerEvents = 'none'; svg.appendChild(mark);
      } catch (_) { /* imported geometry without a measurable box */ }
    }
    for (const p of [preview, previewLarge]) {
      if (!p) continue;
      p.replaceChildren(...shapes.map(svgPart));
    }
    if (!sourceIsEdited693T) source.value = exportSvg();
    undoBtn.disabled = history.length === 0;
    if (redoBtn) redoBtn.disabled = future.length === 0;
    updateSelection(); updatePalette();
  }
  function normalized(tag, props = {}) {
    return {tag, props: {fill: 'none',stroke: activeColor,'stroke-width':fmt(Number(stroke.value)),'stroke-linecap':'round','stroke-linejoin':'round',...props}};
  }
  function point(e) {
    const r = svg.getBoundingClientRect();
    return {x:clamp((e.clientX-r.left)*24/r.width), y:clamp((e.clientY-r.top)*24/r.height)};
  }
  function shapeAt(a, b, kind) {
    const filled = fill?.checked && (kind === 'circle' || kind === 'rect');
    let props;
    if (kind === 'circle') props = {cx:fmt(a.x),cy:fmt(a.y),r:fmt(Math.hypot(b.x-a.x,b.y-a.y))};
    else if (kind === 'rect') props = {x:fmt(Math.min(a.x,b.x)),y:fmt(Math.min(a.y,b.y)),width:fmt(Math.abs(b.x-a.x)),height:fmt(Math.abs(b.y-a.y))};
    else props = {x1:fmt(a.x),y1:fmt(a.y),x2:fmt(b.x),y2:fmt(b.y)};
    if (filled) props.fill = activeColor;
    return normalized(kind, props);
  }
  function distance(a,b) { return Math.hypot(a.x-b.x,a.y-b.y); }
  function hitTest(p) {
    // Geometry sampling works for imported paths, circles, rectangles and lines.
    // Threshold of ~1.4 SVG units also works for finger-sized touch targets.
    let best = -1, bestDistance = 1.65;
    for (let i = shapes.length-1; i >= 0; i--) {
      const el = svgPart(shapes[i]); svg.appendChild(el);
      try {
        const d = offset(shapes[i]), q = {x:p.x-d.x, y:p.y-d.y};
        let minimal = Infinity;
        const length = el.getTotalLength?.();
        if (Number.isFinite(length) && length >= 0) {
          const steps = Math.max(12, Math.min(220, Math.ceil(length * 4)));
          for (let k = 0; k <= steps; k++) {
            const v = el.getPointAtLength(length*k/steps);
            minimal = Math.min(minimal, Math.hypot(q.x-v.x,q.y-v.y));
          }
        }
        const bb = el.getBBox();
        if (shapes[i].props.fill !== 'none' && bb.width && bb.height && q.x >= bb.x && q.x <= bb.x+bb.width && q.y >= bb.y && q.y <= bb.y+bb.height) minimal = 0;
        const threshold = Math.max(bestDistance, Number(shapes[i].props['stroke-width'] || 1.8)/2 + .65);
        if (minimal <= threshold && (minimal < bestDistance || best === -1)) { best = i; bestDistance = minimal; }
      } catch (_) { /* ignore malformed/unmeasurable path */ }
      el.remove();
    }
    return best;
  }
  function eraseAt(p) {
    const index = hitTest(p);
    if (index < 0) return false;
    shapes.splice(index,1);
    if (selected === index) selected = -1;
    else if (selected > index) selected--;
    render(); return true;
  }
  svg.addEventListener('pointerdown', e => {
    if (view.hidden || gesture) return;
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    const p = point(e), kind = tool.value;
    svg.setPointerCapture?.(e.pointerId);
    gesture = {id:e.pointerId,mode:kind,start:p,before:snapshot(),rawPath:`M${fmt(p.x)} ${fmt(p.y)}`};
    if (kind === 'move') {
      selected = hitTest(p);
      gesture.chosen = selected;
      gesture.initial = selected >= 0 ? offset(shapes[selected]) : {x:0,y:0};
      announce(selected < 0 ? 'Klepni na tvar, který chceš přesunout.' : 'Táhni prstem pro přesun vybraného tvaru.');
    } else if (kind === 'eraser') {
      selected = -1; eraseAt(p);
    } else {
      selected = -1;
      drawing = kind === 'pen' ? normalized('path',{d:gesture.rawPath}) : shapeAt(p,p,kind);
    }
    render();
  });
  svg.addEventListener('pointermove',e => {
    if (!gesture || e.pointerId !== gesture.id) return;
    const p = point(e), g = gesture;
    if (g.mode === 'eraser') { eraseAt(p); return; }
    if (g.mode === 'move') {
      if (g.chosen < 0) return;
      setOffset(shapes[g.chosen], g.initial.x+p.x-g.start.x,g.initial.y+p.y-g.start.y);
    } else if (g.mode === 'pen') {
      if (distance(p,g.start)>0.06 || g.rawPath.includes(' L')) g.rawPath += ` L${fmt(p.x)} ${fmt(p.y)}`;
      drawing = normalized('path',{d:g.rawPath});
    } else drawing = shapeAt(g.start,p,g.mode);
    render();
  });
  function finish(e,cancelled=false) {
    if (!gesture || e.pointerId !== gesture.id) return;
    const g = gesture; gesture = null;
    try {svg.releasePointerCapture?.(e.pointerId);} catch (_) {}
    if (cancelled) {shapes=g.before; drawing=null;selected=-1;render();return;}
    const p = point(e);
    if (!['move','eraser'].includes(g.mode)) {
      if (g.mode === 'pen' && !g.rawPath.includes(' L')) drawing = normalized('circle',{cx:fmt(p.x),cy:fmt(p.y),r:fmt(Number(stroke.value)/2),fill:activeColor});
      else if (g.mode !== 'pen') drawing = shapeAt(g.start,p,g.mode);
      if (drawing) shapes.push(drawing);
    }
    drawing = null;
    if (record(g.before)) announce(g.mode==='eraser'?'Tvar vymazán.':g.mode==='move'?'Tvar přesunut.':'Tvar přidán.');
    render();
  }
  svg.addEventListener('pointerup', e => finish(e));
  svg.addEventListener('pointercancel', e => finish(e,true));
  svg.addEventListener('lostpointercapture',e => {if(gesture && gesture.id===e.pointerId) finish(e,true);});
  tool.addEventListener('change',()=>{selected=-1;render();announce(tool.value==='eraser'?'Guma maže jednotlivé tvary dotykem.':tool.value==='move'?'Klepni na tvar a přesuň ho tažením.':'Nástroj připraven.');});
  stroke.addEventListener('input',()=>{$('lnSvgStrokeValue693R').textContent=Number(stroke.value).toLocaleString('cs-CZ');});
  function changeColor(next) {
    const before = snapshot();
    activeColor = normalColor(next);
    if (tool.value === 'move' && selected>=0 && shapes[selected]) {
      shapes[selected].props.stroke = activeColor;
      if (shapes[selected].props.fill && shapes[selected].props.fill !== 'none') shapes[selected].props.fill = activeColor;
      record(before);
    }
    render();
  }
  color?.addEventListener('input',()=>changeColor(color.value));
  themeColor?.addEventListener('click',()=>changeColor('currentColor'));
  document.querySelectorAll('.lnSvgSwatch693S').forEach(b=>b.addEventListener('click',()=>changeColor(b.dataset.color)));
  undoBtn.addEventListener('click',()=>{if(!history.length)return;future.push(snapshot());shapes=history.pop();selected=-1;render();});
  redoBtn?.addEventListener('click',()=>{if(!future.length)return;history.push(snapshot());shapes=future.pop();selected=-1;render();});
  $('lnSvgClear693R').addEventListener('click',()=>{if(!shapes.length)return;const before=snapshot();shapes=[];selected=-1;record(before);render();});
  function center(index = -1) {
    const ids = index>=0?[index]:shapes.map((_,i)=>i);
    if (!ids.length)return announce('Nejdřív nakresli ikonu.');
    const before = snapshot();
    let l=Infinity,t=Infinity,r=-Infinity,b=-Infinity;
    for(const i of ids) {
      const el=svgPart(shapes[i]);svg.appendChild(el);
      try { const bb=el.getBBox(), d=offset(shapes[i]);
        l=Math.min(l,bb.x+d.x);t=Math.min(t,bb.y+d.y);r=Math.max(r,bb.x+bb.width+d.x);b=Math.max(b,bb.y+bb.height+d.y);
      }catch(_){} el.remove();
    }
    if (!Number.isFinite(l))return announce('Tvary nelze změřit.');
    const dx=12-(l+r)/2,dy=12-(t+b)/2;
    ids.forEach(i=>{const d=offset(shapes[i]);setOffset(shapes[i],d.x+dx,d.y+dy);});
    record(before);render();announce(index>=0?'Vybraný tvar vystředěn.':'Celá ikona vystředěna.');
  }
  $('lnSvgCenterAll693S')?.addEventListener('click',()=>center());
  $('lnSvgCenterSelected693S')?.addEventListener('click',()=>{if(selected<0)return announce('Nejdřív vyber tvar nástrojem Přesun.');center(selected);});
  // 693T: Android WebView clipboard fallback, without native selection UI.
  // ExecCommand is only a fallback; restored focus/selection where possible.
  function legacyCopy693T(value) {
    const temp = document.createElement('textarea');
    temp.value = value;
    temp.setAttribute('readonly', '');
    temp.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;z-index:-1';
    document.body.appendChild(temp);
    temp.focus(); temp.select(); temp.setSelectionRange(0, temp.value.length);
    let ok = false;
    try { ok = document.execCommand('copy') === true; } catch (_) {}
    temp.remove();
    return ok;
  }
  const copy = async value => {
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        ok = true;
      }
    } catch (_) {}
    if (!ok) {
      try {
        const cap = window.Capacitor?.Plugins?.Clipboard;
        if (cap?.write) { await cap.write({string:value}); ok=true; }
      } catch (_) {}
    }
    if (!ok) ok = legacyCopy693T(value);
    if (ok) announce('Zkopírováno do schránky.');
    else announce('Android nepovolil zápis do schránky. Text v poli zůstal beze změny.');
    return ok;
  };
  $('lnSvgCopy693R').addEventListener('click',()=>copy(exportSvg()));
  $('lnSvgCopyLuba693R').addEventListener('click',()=>copy(exportForLuba()));
  $('lnSvgCopySource693R').addEventListener('click',()=>copy(source.value));

  // An explicit paste control works where the custom WebView selection menu
  // does not expose Paste. Never clear user content on a failed read.
  const importButton693T = $('lnSvgImport693R');
  const pasteButton693T = document.createElement('button');
  pasteButton693T.id = 'lnSvgPaste693T';
  pasteButton693T.type = 'button';
  pasteButton693T.textContent = '📋 Vložit ze schránky';
  pasteButton693T.title = 'Načíst text z Android schránky do pole SVG';
  pasteButton693T.textContent = 'Vložit';
  pasteButton693T.style.cssText = 'min-height:40px;max-width:100%;white-space:normal;';
  const editBar693U = document.createElement('div');
  editBar693U.className = 'lnSvgTextTools693U';
  editBar693U.setAttribute('role', 'group');
  editBar693U.setAttribute('aria-label', 'Úpravy SVG kódu');
  source.closest('.lnSvgStudioSource')?.insertAdjacentElement('afterend',editBar693U);
  function addEditAction693U(label, callback) {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = label;
    editBar693U.appendChild(button);
    button.addEventListener('click', callback);
    return button;
  }
  const focusSource693U = () => {
    try { source.focus({preventScroll:true}); } catch (_) { source.focus(); }
  };
  const selectAll693U = () => {
    focusSource693U(); source.select();
    source.setSelectionRange(0,source.value.length);
    announce('Vybrán celý SVG kód.');
  };
  const selection693U = () => {
    const a=source.selectionStart ?? 0,b=source.selectionEnd ?? 0;
    return {a,b,text:source.value.slice(a,b)};
  };
  const deleteSelection693U = () => {
    const {a,b}=selection693U();
    if(a===b){announce('Nejdřív označ část kódu nebo zvol Vybrat vše.');return false;}
    source.setRangeText('',a,b,'start');sourceIsEdited693T=true;
    focusSource693U();announce('Vybraný text odstraněn.');return true;
  };
  async function readClipboard693U() {
    let result='';
    try {if(navigator.clipboard?.readText) result=await navigator.clipboard.readText();} catch (_) {}
    if(!result) try {
      const cap=window.Capacitor?.Plugins?.Clipboard;
      if(cap?.read){const data=await cap.read();result=String(data?.value||data?.text||'');}
    }catch(_){}
    return result;
  }
  addEditAction693U('Vybrat vše',selectAll693U);
  addEditAction693U('Kopírovat',()=>{const {text}=selection693U();void copy(text || source.value);});
  addEditAction693U('Vyjmout',async()=>{
    const {text}=selection693U();
    if(!text)return announce('Nejdřív vyber text, který chceš vyjmout.');
    const {a,b}=selection693U();
    if(await copy(text)){
      source.setRangeText('',a,b,'start');sourceIsEdited693T=true;
      announce('Text vyjmut do schránky.');
    }
  });
  editBar693U.appendChild(pasteButton693T);
  pasteButton693T.addEventListener('click',async()=>{
    const pasted=await readClipboard693U();
    if(!pasted){announce('Schránka je prázdná nebo Android nepovolil čtení.');return;}
    const {a,b}=selection693U();
    const nextLength=source.value.length-(b-a)+pasted.length;
    if(nextLength>100000)return announce('Výsledný kód je příliš dlouhý (max. 100 000 znaků).');
    if (!sourceIsEdited693T || !source.value.trim()) {
      source.value=pasted;
      source.setSelectionRange(pasted.length,pasted.length);
    } else {
      source.setRangeText(pasted,a,b,'end');
    }
    sourceIsEdited693T=true;
    focusSource693U();announce('Text vložen. Potom stiskni Načíst SVG.');
  });
  addEditAction693U('Smazat výběr',deleteSelection693U);
  addEditAction693U('Vymazat pole',()=>{
    source.value='';sourceIsEdited693T=true;
    focusSource693U();announce('Textové pole vymazáno. Kresba zůstává beze změny.');
  });
  $('lnSvgImport693R').addEventListener('click',()=>{
    try {
      if(source.value.length>100000)throw Error('SVG je příliš rozsáhlé.');
      const doc=new DOMParser().parseFromString(source.value,'image/svg+xml');
      if(doc.querySelector('parsererror'))throw Error('Neplatné SVG.');
      const root=doc.documentElement;
      if(root.localName!=='svg'||root.namespaceURI!==NS)throw Error('Vlož celé SVG.');
      if(root.children.length>100)throw Error('Nejvýše 100 tvarů.');
      const next=[];
      for(const el of root.children){
        if(!allowed.has(el.localName)||el.namespaceURI!==NS||el.children.length)throw Error('Nepodporovaný tvar nebo skupina: '+el.localName);
        const props={};
        for(const at of el.attributes){
          if(!attrs.has(at.name)||at.namespaceURI)throw Error('Nepodporovaný atribut: '+at.name);
          if(/url\s*\(|javascript:|[<>]/i.test(at.value))throw Error('Nepovolená hodnota.');
          if(at.name==='transform' && !/^translate\(\s*-?\d+(?:\.\d+)?\s*[, ]\s*-?\d+(?:\.\d+)?\s*\)$/.test(at.value))throw Error('Podporován je pouze posun translate(x y).');
          if(['stroke','fill'].includes(at.name) && !/^(?:none|currentColor|#[0-9a-fA-F]{3,8}|[a-zA-Z]{1,20})$/.test(at.value))throw Error('Nepodporovaná barva.');
          props[at.name]=at.value;
        }
        /* 693U: root SVG presentation (fill/stroke/width) is inherited by its
           shapes. The studio displays/exports detached shapes, so materialize
           that inheritance on each shape. Otherwise valid imported paths can
           be invisible in the canvas AND both previews. */
        const defaults693U = {
          fill: root.hasAttribute('stroke') ? 'none' : 'currentColor',
          stroke: root.hasAttribute('fill') ? 'none' : 'currentColor',
          'stroke-width': '1.9',
          'stroke-linecap': 'round', 'stroke-linejoin': 'round'
        };
        for (const [attr, fallback] of Object.entries(defaults693U)) {
          if (Object.prototype.hasOwnProperty.call(props, attr)) continue;
          const inherited = root.getAttribute(attr);
          const resolved = inherited === null ? fallback : inherited;
          if (['stroke', 'fill'].includes(attr)) {
            if (!/^(?:none|currentColor|#[0-9a-fA-F]{3,8}|[a-zA-Z]{1,20})$/.test(resolved))
              throw Error('Nepodporovaná barva SVG: ' + attr);
          } else if (attr === 'stroke-width') {
            if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(resolved))
              throw Error('Neplatná tloušťka tahu SVG.');
          } else if (!['butt', 'round', 'square', 'miter', 'bevel'].includes(resolved)) {
            throw Error('Nepodporovaný styl SVG: ' + attr);
          }
          props[attr] = resolved;
        }
        next.push({tag:el.localName,props});
      }
      if(!next.length)throw Error('Nenalezeny tvary.');
      const before=snapshot();shapes=next;selected=-1;sourceIsEdited693T=false;record(before);render();announce(`SVG načteno (${next.length} tvarů).`);
    }catch(e){announce('Import: '+e.message);}
  });
  /* 693U – text-only guide embedded in the admin tool, hidden unless expanded.
     These are 24 virtual SVG units, not physical phone pixels. */
  const guide693U=document.createElement('details');
  guide693U.className='lnSvgStudioGuide693U';
  guide693U.innerHTML=`<summary>📖 Návod: Jak kreslit SVG ikony</summary>
    <div class="lnSvgStudioGuideBody693U">
      <p><strong>1. Co znamená 24 × 24?</strong> Plocha má 24 SVG jednotek na šířku i výšku. Bod (0, 0) je vlevo nahoře, (12, 12) přesný střed a (24, 24) pravý dolní roh. Velká kreslicí plocha je pouze zvětšenina.</p>
      <p><strong>2. Kam kreslit?</strong> Pro běžné ikony drž většinu kresby mezi hodnotami 2 a 22. Nech cca 2 jednotky od okrajů, ať se silnější tah neuřízne. Pomocná mřížka má krok 2.</p>
      <p><strong>3. Jak silné čáry?</strong> Začni kolem 1,8–2,0. Pro jemné detaily 1,5, pro výraznější tvary přibližně 2,2. Příliš tenké čáry se při náhledu 24 × 24 ztrácejí.</p>
      <p><strong>4. Jak fungují nástroje?</strong> Volná čára kreslí tahem; úsečka od začátku do konce; kruh od středu tažením k okraji; obdélník po úhlopříčce. Přesunem uchopíš celý tvar. Guma odstraní celý dotčený tvar, ne jen jeho část.</p>
      <p><strong>5. Barvy a výplň.</strong> „Barva motivu“ se přizpůsobí dennímu/nočnímu režimu LubaNote. „Vyplnit kruh/obdélník“ ovlivní nově kreslené tvary. Barvu již nakresleného tvaru lze změnit po výběru pomocí Přesun.</p>
      <p><strong>6. Velikost a kontrola.</strong> Použij „Centrovat vše“ a pak zkontroluj zejména malý náhled 24 × 24. Pokud není ikona rozeznatelná bez zvětšení, zjednoduš ji nebo zesil tah.</p>
      <p><strong>7. Import a export.</strong> Vlož jednoduché SVG do pole a klepni na „Načíst SVG“. Import podporuje samostatné tvary jako path, circle, rect a line; složité skupiny a efekty ne. „Kopírovat SVG“ uloží celé SVG do schránky; „Kopírovat pro LubaNote“ připraví definice pro lubaIcons.js. Návrh si průběžně kopíruj – Studio ho zatím trvale neukládá.</p>
      <p><strong>Tip pro připínáček:</strong> Hlavní hlavičku nakresli do horní poloviny, hrot směrem ke spodnímu okraji. Před složitostí dej přednost jednoduchému obrysu.</p>
    </div>`;
  view.querySelector('.lnSvgStudioTools')?.insertAdjacentElement('beforebegin',guide693U);
  open.addEventListener('click',()=>{if(home.hidden||modal.hidden)return;home.hidden=true;view.hidden=false;render();});
  back.addEventListener('click',()=>{view.hidden=true;home.hidden=false;});
  new MutationObserver(()=>{if(modal.hidden){view.hidden=true;home.hidden=false;}}).observe(modal,{attributes:true,attributeFilter:['hidden']});
  render();
})();
