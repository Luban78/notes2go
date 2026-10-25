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
    source.value = exportSvg();
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
  const copy = async value => {
    try { await navigator.clipboard.writeText(value); announce('Zkopírováno.'); }
    catch (_) { source.value=value;source.focus();source.select();announce('Kopírování není dostupné. Označený kód můžeš zkopírovat ručně.'); }
  };
  $('lnSvgCopy693R').addEventListener('click',()=>copy(exportSvg()));
  $('lnSvgCopyLuba693R').addEventListener('click',()=>copy(exportForLuba()));
  $('lnSvgCopySource693R').addEventListener('click',()=>copy(source.value));
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
        next.push({tag:el.localName,props});
      }
      if(!next.length)throw Error('Nenalezeny tvary.');
      const before=snapshot();shapes=next;selected=-1;record(before);render();announce(`SVG načteno (${next.length} tvarů).`);
    }catch(e){announce('Import: '+e.message);}
  });
  open.addEventListener('click',()=>{if(home.hidden||modal.hidden)return;home.hidden=true;view.hidden=false;render();});
  back.addEventListener('click',()=>{view.hidden=true;home.hidden=false;});
  new MutationObserver(()=>{if(modal.hidden){view.hidden=true;home.hidden=false;}}).observe(modal,{attributes:true,attributeFilter:['hidden']});
  render();
})();
