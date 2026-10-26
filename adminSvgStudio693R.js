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
  // 693W: Viewport-only pan and zoom. Shapes, exports and 24x24 units remain intact.
  let zoom693W=1, panX693W=0, panY693W=0;
  const limit693W=(v,min,max)=>Math.max(min,Math.min(max,v));
  function applyView693W(){
    const extent=24/zoom693W;
    panX693W=limit693W(panX693W,0,24-extent);
    panY693W=limit693W(panY693W,0,24-extent);
    svg.setAttribute('viewBox',`${panX693W} ${panY693W} ${extent} ${extent}`);
    if(zoomText693W)zoomText693W.textContent=`${Math.round(zoom693W*100)} %`;
  }
  function zoomTo693W(next){
    const oldSize=24/zoom693W, centerX=panX693W+oldSize/2,centerY=panY693W+oldSize/2;
    zoom693W=limit693W(next,1,8);
    const size=24/zoom693W;panX693W=centerX-size/2;panY693W=centerY-size/2;
    applyView693W();
  }
  function point(e) {
    const r = svg.getBoundingClientRect(), extent=24/zoom693W;
    return {x:clamp(panX693W+(e.clientX-r.left)*extent/r.width), y:clamp(panY693W+(e.clientY-r.top)*extent/r.height)};
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
  /* 693V: Freehand smoothing produces quadratic Bezier segments from touch points.
     Works only on paths made from M/L points. Imported complex paths remain intact. */
  function smoothPoints693V(points) {
    if (points.length < 3) return null;
    const compact = [points[0]];
    for (const p of points.slice(1)) {
      if (distance(p, compact[compact.length - 1]) > .20) compact.push(p);
    }
    if (compact.length < 3) return null;
    // Simple local averaging dampens finger jitter without large distortions.
    const filtered = compact.map((p,i) => {
      if (i===0 || i===compact.length-1) return p;
      const a=compact[i-1], b=compact[i+1];
      return {x:(a.x+2*p.x+b.x)/4, y:(a.y+2*p.y+b.y)/4};
    });
    let d = `M${fmt(filtered[0].x)} ${fmt(filtered[0].y)}`;
    for (let i=1;i<filtered.length-1;i++) {
      const m={x:(filtered[i].x+filtered[i+1].x)/2,y:(filtered[i].y+filtered[i+1].y)/2};
      d += ` Q${fmt(filtered[i].x)} ${fmt(filtered[i].y)} ${fmt(m.x)} ${fmt(m.y)}`;
    }
    const last=filtered[filtered.length-1];
    d+=` Q${fmt(last.x)} ${fmt(last.y)} ${fmt(last.x)} ${fmt(last.y)}`;
    return d;
  }
  const smoothBar693V=document.createElement('div');
  smoothBar693V.className='lnSvgSmooth693V';
  smoothBar693V.innerHTML='<label><input type="checkbox" id="lnSvgAutoSmooth693V" checked> Vyhlazovat volnou čáru</label><button type="button" id="lnSvgSmoothSelected693V">Vyhladit vybraný tah</button>';
  view.querySelector('.lnSvgStudioTools')?.insertAdjacentElement('afterend',smoothBar693V);
  const autoSmooth693V=$('lnSvgAutoSmooth693V');
  $('lnSvgSmoothSelected693V').addEventListener('click',()=>{
    if(selected<0 || !shapes[selected] || shapes[selected].tag!=='path') return announce('Vyber volnou čáru nástrojem Přesun.');
    const path=String(shapes[selected].props.d||'');
    if (!/^M[-\d.,\s]+(?:L[-\d.,\s]+)+$/i.test(path)) return announce('Vyhlazení vybraného tahu podporuje volnou čáru M/L. Složité SVG křivky neměním.');
    const nums=(path.match(/-?\d+(?:\.\d+)?/g)||[]).map(Number);
    const pts=[];for(let i=0;i+1<nums.length;i+=2)pts.push({x:nums[i],y:nums[i+1]});
    const d=smoothPoints693V(pts);if(!d)return announce('Tah je příliš krátký.');
    const before=snapshot(); shapes[selected].props.d=d;record(before);render();announce('Vybraný tah vyhlazen (Zpět obnoví původní).');
  });
  // Icon shortcuts mirror the existing select; they do not create a second tool state.
  const tools693W=[['move','mouse-pointer-2','Výběr'],['pen','pencil','Tužka'],['line','minus','Úsečka'],['circle','circle','Kruh'],['rect','square','Obdélník'],['eraser','eraser','Guma'],['pan','hand','Posun plátna']];
  const toolBar693W=document.createElement('div');toolBar693W.className='lnSvgToolBar693W';
  toolBar693W.setAttribute('role','group');toolBar693W.setAttribute('aria-label','Nástroje kreslení');
  const icons693W={
    'mouse-pointer-2':'<path d="m5 3 14 9-7 1-3 7z"/>',
    pencil:'<path d="m4 20 4.6-1 11-11-3.6-3.6-11 11zM14 6l3.6 3.6"/>',
    minus:'<path d="M4 12h16"/>',circle:'<circle cx="12" cy="12" r="8"/>',
    square:'<rect x="4" y="4" width="16" height="16" rx="2"/>',
    eraser:'<path d="m20 20-9 0-7-7 9-9 8 8-8 8M8 16l9-9"/>',
    hand:'<path d="M8 13V6a2 2 0 0 1 4 0v5-7a2 2 0 0 1 4 0v7-5a2 2 0 0 1 4 0v9c0 4-3 6-7 6H9c-2 0-4-2-6-6l-1-2a2 2 0 0 1 3-2z"/>'};
  const toolButtons693W=[];
  for(const [value,icon,label] of tools693W){
    const b=document.createElement('button');b.type='button';b.className='lnSvgToolButton693W';
    b.dataset.tool=value;b.setAttribute('aria-label',label);b.title=label;
    b.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons693W[icon]}</svg><span>${label}</span>`;
    b.addEventListener('click',()=>{tool.value=value;tool.dispatchEvent(new Event('change',{bubbles:true}));});
    toolButtons693W.push(b);toolBar693W.append(b);
  }
  function syncTools693W(){toolButtons693W.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tool===tool.value)));}
  tool.addEventListener('change',syncTools693W);
  const controls693W=document.createElement('div');controls693W.className='lnSvgZoomBar693W';
  controls693W.innerHTML='<button type="button" data-zoom="out" aria-label="Oddálit">−</button><output>100 %</output><button type="button" data-zoom="in" aria-label="Přiblížit">+</button><button type="button" data-zoom="reset">Celá ikona</button>';
  const zoomText693W=controls693W.querySelector('output');
  controls693W.querySelector('[data-zoom="out"]').addEventListener('click',()=>zoomTo693W(zoom693W/1.5));
  controls693W.querySelector('[data-zoom="in"]').addEventListener('click',()=>zoomTo693W(zoom693W*1.5));
  controls693W.querySelector('[data-zoom="reset"]').addEventListener('click',()=>{zoom693W=1;panX693W=0;panY693W=0;applyView693W();if(typeof restoreDrawingTool693Y==='function')restoreDrawingTool693Y('Celá ikona. Kreslení je aktivní.');});
  const toolRow693W=tool.closest('.lnSvgStudioTools');
  if(toolRow693W){toolRow693W.insertAdjacentElement('beforebegin',toolBar693W);toolRow693W.insertAdjacentElement('afterend',controls693W);}
  tool.closest('label')?.classList.add('lnSvgOldSelect693W');
  const panInfo693W=document.createElement('small');panInfo693W.textContent='Pro posun zvětšeného plátna použij ruku. Zoom nemění velikost exportované ikony.';
  controls693W.insertAdjacentElement('afterend',panInfo693W);
  panInfo693W.className='lnSvgPanInfo693W';
  syncTools693W();applyView693W();
  // 693Y: Pan is a one-shot action, not a permanent drawing mode.
  // Remember the last actual tool so that a pan cannot leave the canvas
  // looking frozen on Android (especially at 100 % zoom).
  let returnTool693Y = tool.value === 'pan' ? 'pen' : tool.value;
  let restoringTool693Y = false;
  function restoreDrawingTool693Y(message) {
    if (tool.value !== 'pan') return;
    restoringTool693Y = true;
    tool.value = returnTool693Y;
    tool.dispatchEvent(new Event('change', { bubbles: true }));
    restoringTool693Y = false;
    if (message) announce(message);
  }
  tool.addEventListener('change', () => {
    if (!restoringTool693Y && tool.value !== 'pan') returnTool693Y = tool.value;
    if (!restoringTool693Y && tool.value === 'pan' && zoom693W <= 1.00001) {
      restoreDrawingTool693Y('Při 100 % je celé plátno vidět. Nejdřív přibliž +, potom použij Posun plátna.');
    }
  });
  // 693X: WebView can swallow the last touch event after a system gesture.
  // A stale gesture must never block a new stroke. Roll back only the unfinished
  // gesture; already committed shapes and the Undo stack stay untouched.
  function cancelInterruptedGesture693X() {
    if (!gesture) return;
    const old=gesture;
    gesture=null;
    try { if (svg.hasPointerCapture?.(old.id)) svg.releasePointerCapture(old.id); } catch (_) {}
    shapes=old.before;
    drawing=null;
    selected=-1;
    if(old.mode==='pan') restoreDrawingTool693Y('Posun ukončen.');
    render();
  }
  svg.addEventListener('pointerdown', e => {
    if (view.hidden) return;
    if (e.button != null && e.button !== 0) return;
    if (e.isPrimary === false) return; // never treat a second finger as another stroke
    // A new primary touch means any old gesture was interrupted.
    if (gesture) cancelInterruptedGesture693X();
    e.preventDefault();
    const p = point(e), kind = tool.value;
    try { svg.setPointerCapture?.(e.pointerId); } catch (_) { /* window listeners cover no-capture WebViews */ }
    gesture = {id:e.pointerId,startedAt693X:performance.now(),mode:kind,start:p,originClientX:e.clientX,originClientY:e.clientY,before:snapshot(),rawPath:`M${fmt(p.x)} ${fmt(p.y)}`,points:[p]};
    if (kind === 'pan') {
      gesture.initialPan={x:panX693W,y:panY693W};
    } else if (kind === 'move') {
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
    if (g.mode === 'pan') {
      const r=svg.getBoundingClientRect(),size=24/zoom693W;
      panX693W=g.initialPan.x-(e.clientX-g.originClientX)*size/r.width;
      panY693W=g.initialPan.y-(e.clientY-g.originClientY)*size/r.height;
      applyView693W();return;
    }
    if (g.mode === 'move') {
      if (g.chosen < 0) return;
      setOffset(shapes[g.chosen], g.initial.x+p.x-g.start.x,g.initial.y+p.y-g.start.y);
    } else if (g.mode === 'pen') {
      if (distance(p,g.points[g.points.length-1])>0.065) { g.rawPath += ` L${fmt(p.x)} ${fmt(p.y)}`; g.points.push(p); }
      drawing = normalized('path',{d:g.rawPath});
    } else drawing = shapeAt(g.start,p,g.mode);
    render();
  });
  function finish(e,cancelled=false) {
    if (!gesture || e.pointerId !== gesture.id) return;
    const g = gesture; gesture = null;
    try {svg.releasePointerCapture?.(e.pointerId);} catch (_) {}
    if (cancelled) {shapes=g.before; drawing=null;selected=-1;if(g.mode==='pan')restoreDrawingTool693Y('Posun ukončen.');render();return;}
    const p = point(e);
    if (!['move','eraser','pan'].includes(g.mode)) {
      if (g.mode === 'pen' && !g.rawPath.includes(' L')) drawing = normalized('circle',{cx:fmt(p.x),cy:fmt(p.y),r:fmt(Number(stroke.value)/2),fill:activeColor});
      else if (g.mode !== 'pen') drawing = shapeAt(g.start,p,g.mode);
      if (drawing) {
        if(g.mode==='pen' && autoSmooth693V.checked && drawing.tag==='path') {
          const d=smoothPoints693V(g.points); if(d) drawing.props.d=d;
        }
        shapes.push(drawing);
      }
    }
    drawing = null;
    if (g.mode === 'pan') {
      // No geometry was modified: only the viewBox moved.
      restoreDrawingTool693Y('Plátno posunuto. Znovu je aktivní předchozí nástroj.');
    } else if (record(g.before)) {
      announce(g.mode==='eraser'?'Tvar vymazán.':g.mode==='move'?'Tvar přesunut.':'Tvar přidán.');
    }
    render();
  }
  svg.addEventListener('pointerup', e => finish(e));
  svg.addEventListener('pointercancel', e => finish(e,true));
  svg.addEventListener('lostpointercapture',e => {if(gesture && gesture.id===e.pointerId) finish(e,true);});
  // Recover gestures finished outside the SVG when pointer capture fails.
  window.addEventListener('pointerup',e=>{if(gesture && e.pointerId===gesture.id)finish(e);});
  window.addEventListener('pointercancel',e=>{if(gesture && e.pointerId===gesture.id)finish(e,true);});
  window.addEventListener('blur',cancelInterruptedGesture693X);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelInterruptedGesture693X();});
  // Changing tools while a stroke is still marked active must not freeze drawing.
  tool.addEventListener('change',cancelInterruptedGesture693X);
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
  /* 693V: read ONLY the restricted array syntax emitted by lubaIcons.js.
     No eval or executing pasted JavaScript. */
  function parseLuba693V(raw) {
    let t=String(raw).trim();
    // Supports a fragment containing one or more ["path", {d: "..."}] entries,
    // a bracketed array or the named property: pripinacek: [...].
    t=t.replace(/^\s*(?:[\w\p{L}]+)\s*:\s*/u,'').replace(/;\s*$/,'').trim();
    t=t.replace(/,\s*$/, '').trim();
    if(t.startsWith('[') && /^\[\s*["'](?:path|circle|rect|line|ellipse|polygon|polyline)["']\s*,/.test(t)) {
      // If the copied fragment includes the enclosing array's final ], remove it.
      if(/\]\s*\]\s*$/.test(t)) t=t.replace(/\]\s*$/, '');
      t='['+t+']';
    }
    else if(t.startsWith('[') && !/^\[\s*\[/.test(t)) throw Error('Neplatný seznam LubaNote tvarů.');
    // User may paste entries ending with extra ], from their source snippet.
    t=t.replace(/\]\s*,?\s*\]\s*$/,']]');
    if(!/^\s*\[/.test(t) || t.length>100000) throw Error('Očekávám pole LubaNote tvarů.');
    if(/[`;]|=>|function|\b(?:new|window|document|eval)\b/.test(t)) throw Error('Nepodporovaný kód.');
    // Convert only unquoted JS property names into JSON keys, including d:.
    t=t.replace(/([,{]\s*)([A-Za-z][\w-]*)\s*:/g,'$1"$2":');
    let rows;
    try {rows=JSON.parse(t);} catch(_){throw Error('Zkontroluj závorky a uvozovky formátu LubaNote.');}
    if(!Array.isArray(rows) || rows.length>100)throw Error('Nejvýše 100 tvarů.');
    const next=[];
    for(const row of rows){
      if(!Array.isArray(row)||row.length!==2||!allowed.has(row[0])||!row[1]||typeof row[1]!=='object'||Array.isArray(row[1]))throw Error('Nepodporovaný typ tvaru.');
      const props={};
      for(const [k,v] of Object.entries(row[1])){
        if(!attrs.has(k)||!['string','number'].includes(typeof v))throw Error('Nepodporovaný atribut: '+k);
        const val=String(v); if(val.length>10000||/url\s*\(|javascript:|[<>]/i.test(val))throw Error('Nepovolená hodnota.');
        if(k==='transform'&&!/^translate\(\s*-?\d+(?:\.\d+)?\s*[, ]\s*-?\d+(?:\.\d+)?\s*\)$/.test(val))throw Error('Podporuji pouze translate(x y).');
        if(['fill','stroke'].includes(k)&&!/^(?:none|currentColor|#[0-9a-fA-F]{3,8}|[a-zA-Z]{1,20})$/.test(val))throw Error('Neplatná barva.');
        props[k]=val;
      }
      next.push({tag:row[0],props:{fill:'none',stroke:'currentColor','stroke-width':'1.85','stroke-linecap':'round','stroke-linejoin':'round',...props}});
    }
    if(!next.length)throw Error('Žádné tvary.');
    return next;
  }
  const importLuba693V=document.createElement('button');
  importLuba693V.type='button';importLuba693V.textContent='Načíst kód LubaNote';
  importButton693T?.insertAdjacentElement('afterend',importLuba693V);
  importLuba693V.addEventListener('click',()=>{
    try {const next=parseLuba693V(source.value),before=snapshot();shapes=next;selected=-1;sourceIsEdited693T=false;record(before);render();announce(`Kód LubaNote načten (${next.length} tvarů).`);}
    catch(e){announce('LubaNote import: '+e.message);}
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
      <p><strong>4. Jak fungují nástroje?</strong> Volná čára kreslí tahem a volba „Vyhlazovat volnou čáru“ zjemní stopu při dokončení. Pro starší tah M/L ho vyber nástrojem Přesun a použij „Vyhladit vybraný tah“. Úsečka od začátku do konce; kruh od středu tažením k okraji; obdélník po úhlopříčce. Přesunem uchopíš celý tvar. Guma odstraní celý dotčený tvar, ne jen jeho část.</p>
      <p><strong>5. Barvy a výplň.</strong> „Barva motivu“ se přizpůsobí dennímu/nočnímu režimu LubaNote. „Vyplnit kruh/obdélník“ ovlivní nově kreslené tvary. Barvu již nakresleného tvaru lze změnit po výběru pomocí Přesun.</p>
      <p><strong>6. Velikost a kontrola.</strong> Použij „Centrovat vše“ a pak zkontroluj zejména malý náhled 24 × 24. Pokud není ikona rozeznatelná bez zvětšení, zjednoduš ji nebo zesil tah.</p>
      <p><strong>7. Import a export.</strong> Vlož jednoduché SVG do pole a klepni na „Načíst SVG“. Pro definice z lubaIcons.js použij „Načíst kód LubaNote“; pro celé SVG „Načíst SVG“. Import podporuje základní tvary, nikoli složité skupiny a efekty. „Kopírovat SVG“ uloží celé SVG do schránky; „Kopírovat pro LubaNote“ připraví definice pro lubaIcons.js. Návrh si průběžně kopíruj – Studio ho zatím trvale neukládá.</p>
      <p><strong>Tip pro připínáček:</strong> Hlavní hlavičku nakresli do horní poloviny, hrot směrem ke spodnímu okraji. Před složitostí dej přednost jednoduchému obrysu.</p>
    </div>`;
  view.querySelector('.lnSvgStudioTools')?.insertAdjacentElement('beforebegin',guide693U);
  open.addEventListener('click',()=>{if(home.hidden||modal.hidden)return;home.hidden=true;view.hidden=false;render();});
  back.addEventListener('click',()=>{view.hidden=true;home.hidden=false;});
  new MutationObserver(()=>{if(modal.hidden){view.hidden=true;home.hidden=false;}}).observe(modal,{attributes:true,attributeFilter:['hidden']});
  render();
})();
