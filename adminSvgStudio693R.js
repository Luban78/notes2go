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
  // 694B ROOT CAUSE: the 693W quick toolbar introduces mode 'pan', but the
  // original select did not contain that option. Setting select.value='pan'
  // then yields '', which used to become an empty SVG tag and crash rendering.
  // Preserve the existing select as the single source of tool state.
  if (tool && !Array.from(tool.options).some(option => option.value === 'pan')) {
    const option = document.createElement('option');
    option.value = 'pan';
    option.textContent = '✋ Posun plátna';
    tool.appendChild(option);
  }
  const validTools694B = new Set(['pen', 'line', 'circle', 'rect', 'move', 'eraser', 'pan', 'arc', 'moon', 'partial-eraser', 'scale', 'nodes', 'rotate', 'bucket']);
  const drawingTools694B = new Set(['pen', 'line', 'circle', 'rect', 'move', 'eraser', 'arc', 'moon', 'partial-eraser', 'scale', 'nodes', 'rotate', 'bucket']);
  for (const [value,label] of [['bucket','▨ Vyplnit tvar'],['rotate','↻ Otočit objekt'],['nodes','◉ Úprava bodů'],['scale','⤡ Změna velikosti'],['arc','◠ Přesný půlkruh'],['moon','☾ Přesný měsíček'],['partial-eraser','⌁ Částečná guma']]) { if (!Array.from(tool.options).some(o=>o.value===value)) { const o=document.createElement('option');o.value=value;o.textContent=label;tool.appendChild(o); } }
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

  // 693Z – strictly read-only diagnostic for PAN freeze in Android WebView.
  // Event listeners only observe; they never preventDefault or change drawing.
  const diag693Z = [];
  const diagStamp693Z = () => new Date().toISOString();
  function diagState693Z() {
    let viewBox = 'unavailable';
    try { viewBox = svg.getAttribute('viewBox') || 'missing'; } catch (_) {}
    return {
      tool: tool?.value || 'unknown', zoom: typeof zoom693W === 'number' ? zoom693W : 'not-initialized',
      panX: typeof panX693W === 'number' ? panX693W : 'not-initialized',
      panY: typeof panY693W === 'number' ? panY693W : 'not-initialized',
      gesture: typeof gesture === 'object' && gesture ? {mode:gesture.mode,id:gesture.id} : null,
      shapes: Array.isArray(shapes) ? shapes.length : null,
      selected, viewBox, svgConnected: svg.isConnected,
      viewHidden: view.hidden,
      canvasRect: (() => { const r=svg.getBoundingClientRect();return [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)]; })()
    };
  }
  function diagLog693Z(type, info = '') {
    try {
      diag693Z.push({time:diagStamp693Z(),type,info:String(info).slice(0,500),state:diagState693Z()});
      if (diag693Z.length > 90) diag693Z.shift();
    } catch (_) {}
  }
  window.addEventListener('error', e => diagLog693Z('JS_ERROR', `${e.message || 'unknown'} @ ${e.filename || '?'}:${e.lineno || '?'}:${e.colno || '?'} ${e.error?.stack || ''}`));
  window.addEventListener('unhandledrejection', e => diagLog693Z('PROMISE_REJECTION', String(e.reason?.stack || e.reason)));
  svg.addEventListener('pointerdown', e => diagLog693Z('POINTER_DOWN', `id=${e.pointerId} primary=${e.isPrimary}`), true);
  svg.addEventListener('pointerup', e => diagLog693Z('POINTER_UP', `id=${e.pointerId}`), true);
  svg.addEventListener('pointercancel', e => diagLog693Z('POINTER_CANCEL', `id=${e.pointerId}`), true);
  svg.addEventListener('lostpointercapture', e => diagLog693Z('LOST_CAPTURE', `id=${e.pointerId}`), true);
  svg.addEventListener('pointermove', e => {
    if (diag693Z.length && diag693Z.at(-1)?.type === 'POINTER_MOVE') return;
    diagLog693Z('POINTER_MOVE', `id=${e.pointerId}`);
  }, true);
  tool.addEventListener('change', () => diagLog693Z('TOOL_CHANGE', tool.value), true);
  document.addEventListener('click', e => {
    const el=e.target?.closest?.('[data-tool], [data-zoom]');
    if (el && view.contains(el)) diagLog693Z('CONTROL_CLICK', `tool=${el.dataset.tool || '-'} zoom=${el.dataset.zoom || '-'}`);
  }, true);
  window.addEventListener('blur', () => diagLog693Z('WINDOW_BLUR'));
  document.addEventListener('visibilitychange', () => diagLog693Z('VISIBILITY', document.visibilityState));
  const diagPanel693Z=document.createElement('details');
  diagPanel693Z.id='lnSvgDiag693Z';
  diagPanel693Z.style.cssText='margin:12px 0;padding:12px;border:1px solid var(--color-border,#777);border-radius:12px;color:var(--color-text,inherit);';
  diagPanel693Z.innerHTML='<summary style="cursor:pointer;font-weight:700">🩺 Diagnostika Posunu plátna (693Z)</summary><p style="font-size:13px">Nakresli čáru → klepni na Posun plátna → zkus táhnout → zkopíruj report. Diagnostika nemění kresbu.</p><button type="button" data-copy style="min-height:42px;margin:6px;padding:8px 14px">Kopírovat diagnostiku</button><button type="button" data-clear style="min-height:42px;margin:6px;padding:8px 14px">Vymazat log</button><pre data-status style="white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px"></pre>';
  const controlsHost693Z=view.querySelector('.lnSvgStudioTools');
  if (controlsHost693Z) controlsHost693Z.insertAdjacentElement('afterend',diagPanel693Z);
  else view.append(diagPanel693Z);
  const diagText693Z=()=>`LUBANOTE SVG STUDIO – 693Z PAN DIAGNOSTIKA (READ-ONLY)\n${JSON.stringify({created:diagStamp693Z(),userAgent:navigator.userAgent,current:diagState693Z(),events:diag693Z},null,2)}`;
  const diagStatus693Z=diagPanel693Z.querySelector('[data-status]');
  diagPanel693Z.querySelector('[data-copy]').addEventListener('click',async()=>{
    const value=diagText693Z();let copied=false;
    try {await navigator.clipboard.writeText(value);copied=true;}catch(_){}
    if(!copied) try {await window.Capacitor?.Plugins?.Clipboard?.write({string:value});copied=true;}catch(_){}
    if(!copied){const t=document.createElement('textarea');t.value=value;t.style.cssText='position:fixed;left:0;top:0;width:1px;height:1px;opacity:.01;';document.body.append(t);t.select();try{copied=document.execCommand('copy')===true;}catch(_){}t.remove();}
    diagStatus693Z.textContent=copied?'Report zkopírován.':'Kopírování selhalo: níže je report pro ruční výběr.\n'+value;
  });
  diagPanel693Z.querySelector('[data-clear]').addEventListener('click',()=>{diag693Z.length=0;diagStatus693Z.textContent='Log vymazán.';});
  diagLog693Z('DIAGNOSTIC_READY');

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
    onChanged694K();
    return true;
  }
  // 694H: uniform SVG affine transform, preserving precise paths and all SVG geometry.
  // Unknown imported transforms remain untouched; resize refuses them safely.
  // 694J: uniform similarity transform (scale + rotation + translation).
  // Matrix decomposition keeps previous 694H and 694I features usable after rotation.
  function matrixAffine694V(values){
    const [a,b,c,d,x,y]=values;
    const sx=Math.hypot(a,b), sy=Math.hypot(c,d);
    if(![a,b,c,d,x,y].every(Number.isFinite))return null;
    if(sx<.00001||sy<.00001||Math.abs(sx-sy)>.02)return null;
    const dot=a*c+b*d;
    if(Math.abs(dot)>.02)return null;
    const s=(sx+sy)/2;
    const determinant=a*d-b*c;
    const m=determinant<0?-1:1;
    const angle=m<0?Math.atan2(-c,d):Math.atan2(b,a);
    const co=Math.cos(angle),si=Math.sin(angle);
    const expected=[s*m*co,s*m*si,-s*si,s*co];
    if(Math.max(Math.abs(a-expected[0]),Math.abs(b-expected[1]),Math.abs(c-expected[2]),Math.abs(d-expected[3]))>.03)return null;
    return {s,x,y,angle,m};
  }
  function affine694H(shape) {
    const value=String(shape?.props?.transform||'').trim();
    if(!value)return {s:1,x:0,y:0,angle:0,m:1};
    const tr=value.match(/^translate\(\s*(-?(?:\d+(?:\.\d*)?|\.\d+))[,\s]+(-?(?:\d+(?:\.\d*)?|\.\d+))\s*\)$/i);
    if(tr)return {s:1,x:Number(tr[1]),y:Number(tr[2]),angle:0,m:1};
    const ma=value.match(/^matrix\(\s*([^)]*)\)$/i);
    if(!ma)return null;
    const n=ma[1].trim().split(/[\s,]+/).map(Number);
    if(n.length!==6||n.some(v=>!Number.isFinite(v)))return null;
    return matrixAffine694V(n);
  }
  function world694J(t,p) {
    const co=Math.cos(t.angle||0),si=Math.sin(t.angle||0),m=t.m||1;
    return {x:t.x+t.s*(m*p.x*co-p.y*si),y:t.y+t.s*(m*p.x*si+p.y*co)};
  }
  function local694J(t,p) {
    const co=Math.cos(t.angle||0),si=Math.sin(t.angle||0),m=t.m||1;
    const dx=(p.x-t.x)/t.s,dy=(p.y-t.y)/t.s;
    const rx=dx*co+dy*si, ry=-dx*si+dy*co;
    return {x:m*rx,y:ry};
  }
  function matrixFromAffine694V(t){
    const angle=t.angle||0,co=Math.cos(angle),si=Math.sin(angle),m=t.m||1;
    return [t.s*m*co,t.s*m*si,-t.s*si,t.s*co,t.x,t.y];
  }
  function assignAffine694H(shape,t) {
    const current={s:t.s,x:t.x,y:t.y,angle:t.angle||0,m:t.m||1};
    if(Math.abs(current.s-1)<.000001&&Math.abs(current.angle)<.000001&&current.m===1) {
      if(Math.abs(current.x)+Math.abs(current.y)<.001)delete shape.props.transform;
      else shape.props.transform=`translate(${fmt(current.x)} ${fmt(current.y)})`;
    } else {
      const mf=n=>String(Math.round(n*1000000)/1000000);
      const [a,b,c,d,x,y]=matrixFromAffine694V(current);
      shape.props.transform=`matrix(${mf(a)} ${mf(b)} ${mf(c)} ${mf(d)} ${mf(x)} ${mf(y)})`;
    }
  }
  function shapeBounds694H(shape) {
    const t=affine694H(shape);
    if(!t)return null;
    const el=svgPart(shape);svg.appendChild(el);
    try {
      const b=el.getBBox();
      if(![b.x,b.y,b.width,b.height].every(Number.isFinite))return null;
      const pts=[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y])=>world694J(t,{x,y}));
      return {l:Math.min(...pts.map(p=>p.x)),t:Math.min(...pts.map(p=>p.y)),r:Math.max(...pts.map(p=>p.x)),b:Math.max(...pts.map(p=>p.y))};
    }catch(_){return null;}finally{el.remove();}
  }
  function resizeHandle694H(p,b) {
    const r=svg.getBoundingClientRect(),size=24/zoom693W;
    const tol=16*size/Math.max(1,r.width);
    for(const [key,x,y] of [['tl',b.l,b.t],['tr',b.r,b.t],['bl',b.l,b.b],['br',b.r,b.b]])
      if(Math.hypot(p.x-x,p.y-y)<=tol)return key;
    return null;
  }
  function offset(shape) {const t=affine694H(shape);return t?{x:t.x,y:t.y}:{x:0,y:0};}
  function setOffset(shape,x,y) {const t=affine694H(shape);if(t)assignAffine694H(shape,{...t,x,y});}
  function exportSvg() {
    return `<svg xmlns="${NS}" viewBox="0 0 24 24">${shapes.filter(s => s && allowed.has(s.tag)).map(s => svgPart(s).outerHTML).join('')}</svg>`;
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
    // 694N: selection-only actions; keep the canvas area clear otherwise.
    const actions = document.getElementById('lnSvgObjectActions694N');
    if (actions) {
      const valid = selected >= 0 && selected < shapes.length;
      actions.hidden = !valid;
      actions.querySelector('[data-layer="front"]').disabled = !valid || selected === shapes.length - 1;
      actions.querySelector('[data-layer="back"]').disabled = !valid || selected === 0;
    }
  }
  // 694I: edit absolute M/L/Q/C path points; untouched imported/arc paths stay intact.
  // A single supported path segment may contain multiple coordinate pairs.
  const pathArity694I={M:2,L:2,Q:4,C:6};
  function pathNodes694I(shape){
    if(shape?.tag!=='path')return null;
    const d=String(shape.props.d||'').trim();
    const tokens=d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi)||[];
    if(tokens.join('').toLowerCase()!==d.replace(/[\s,]/g,'').toLowerCase())return null;
    const parsed=[], handles=[];
    let i=0,command=null;
    while(i<tokens.length){
      if(/^[a-zA-Z]$/.test(tokens[i])){command=tokens[i++];if(!pathArity694I[command])return null;}
      if(!command)return null;
      const count=pathArity694I[command];
      if(i+count>tokens.length)return null;
      const values=tokens.slice(i,i+count);
      if(values.some(v=>/^[a-zA-Z]$/.test(v)))return null;
      const nums=values.map(Number);
      if(nums.some(n=>!Number.isFinite(n)))return null;
      const cmd=command==='M'&&parsed.length?'L':command;
      parsed.push({cmd,nums});
      const segment=parsed.length-1;
      for(let k=0;k<count;k+=2)handles.push({segment,coordinate:k,kind:k===count-2?'anchor':'control',x:nums[k],y:nums[k+1]});
      i+=count;if(command==='M')command='L';
      if(parsed.length>400)return null;
    }
    return parsed.length?{parsed,handles}:null;
  }
  function writeNodes694I(parsed){return parsed.map(part=>part.cmd+part.nums.map(fmt).join(' ')).join(' ');}
  function nodePositions694I(){
    if(selected<0)return null;
    const shape=shapes[selected], data=pathNodes694I(shape), t=affine694H(shape);
    if(!data||!t)return null;
    return {data,t,handles:data.handles.map(h=>({...h,x:world694J(t,h).x,y:world694J(t,h).y}))};
  }
  function nearestNode694I(p){
    const info=nodePositions694I();if(!info)return null;
    const r=svg.getBoundingClientRect(),tol=18*(24/zoom693W)/Math.max(1,r.width);
    let closest=null,best=tol;
    for(const h of info.handles){const d=Math.hypot(p.x-h.x,p.y-h.y);if(d<best){best=d;closest=h;}}
    return closest;
  }
  // 694S: Preserve reference aspect ratio; never distort bitmap while tracing.
  // 694R: Reference image is a strictly visual, non-exportable canvas layer.
  // It is NEVER inserted into shapes, history, exportSvg(), or PNG renderer.
  let reference694R=null;
  function renderReference694R(){
    if(!reference694R || !reference694R.visible) return;
    const r=reference694R;
    const el=document.createElementNS(NS,'image');
    el.setAttribute('href',r.data);
    el.setAttribute('x',String(r.x));el.setAttribute('y',String(r.y));
    el.setAttribute('width',String(r.width));el.setAttribute('height',String(r.height));
    el.setAttribute('opacity',String(r.opacity));
    el.setAttribute('preserveAspectRatio','xMidYMid meet');
    el.setAttribute('data-reference-694R','');
    el.style.pointerEvents='none';
    svg.appendChild(el);
  }
  // 694U: optional magnetic grid. Settings apply to future gestures only;
  // freehand strokes, erasers, pan, rotate and the reference image stay untouched.
  let snapGrid694U=false, gridStep694U=2;
  function snapCoord694U(n) {
    if(!snapGrid694U || !Number.isFinite(n))return n;
    return Math.round(n/gridStep694U)*gridStep694U;
  }
  function snapPoint694U(p) {
    if(!snapGrid694U)return p;
    return {x:clamp(snapCoord694U(p.x)),y:clamp(snapCoord694U(p.y))};
  }
  function magnetCoord694U(n) {
    if(!snapGrid694U)return n;
    // Move objects smoothly until their visual center approaches a grid line.
    // Tolerance scales with current zoom (~8 screen pixels at most).
    const r=svg.getBoundingClientRect();
    const pixelsToUnits=8*24/(zoom693W*Math.max(1,r.width));
    const delta=snapCoord694U(n)-n;
    return Math.abs(delta)<=Math.min(gridStep694U*.32,pixelsToUnits)?n+delta:n;
  }
  // 694M: centered non-exported guides live ONLY in the canvas render, never in shapes.
  let showCenter694M = true;
  function render() {
    // Keep pointer capture on the persistent SVG root while redrawing children.
    svg.replaceChildren();
    for (let i = 0; i <= 24; i += 2) {
      const path = svgPart({tag:'path',props:{d:`M${i} 0V24 M0 ${i}H24`,stroke:'currentColor','stroke-width':'.055',opacity:'.2',fill:'none'}});
      path.style.pointerEvents = 'none'; svg.appendChild(path);
    }
    renderReference694R();
    if(snapGrid694U){
      // The snapping grid is visual only; never inserted into shapes or exports.
      let d='';
      for(let i=0;i<=Math.round(24/gridStep694U);i++){
        const v=fmt(Math.min(24,i*gridStep694U));
        d+=`M${v} 0V24 M0 ${v}H24 `;
      }
      const guide=svgPart({tag:'path',props:{d,fill:'none',stroke:'#05c5c1','stroke-width':'.055',opacity:'.27'}});
      guide.style.pointerEvents='none';guide.setAttribute('data-snap-guide-694U','');
      svg.appendChild(guide);
    }
    const visible = [...shapes.filter(s => s && allowed.has(s.tag)), ...(drawing && allowed.has(drawing.tag) ? [drawing] : [])];
    for (const s of visible) {
      const el = svgPart(s); el.style.pointerEvents = 'none'; svg.appendChild(el);
    }
    if (selected >= 0 && shapes[selected] && ['move','eraser','scale','rotate'].includes(tool.value)) {
      const b=shapeBounds694H(shapes[selected]);
      if(b){
        const pad=.45/zoom693W, h=.38/zoom693W;
        const mark=svgPart({tag:'rect',props:{x:fmt(b.l-pad),y:fmt(b.t-pad),width:fmt(b.r-b.l+2*pad),height:fmt(b.b-b.t+2*pad),rx:fmt(.2/zoom693W),fill:'none',stroke:'#00c5b9','stroke-width':fmt(.16/zoom693W),'stroke-dasharray':`${fmt(.5/zoom693W)} ${fmt(.3/zoom693W)}`}});
        mark.style.pointerEvents='none';svg.appendChild(mark);
        if(tool.value==='rotate') {
          const cx=(b.l+b.r)/2, hy=b.t-1.65/zoom693W;
          const guide=svgPart({tag:'path',props:{d:`M${fmt(cx)} ${fmt(b.t)}L${fmt(cx)} ${fmt(hy)}`,stroke:'#00c5b9','stroke-width':fmt(.16/zoom693W),fill:'none'}});
          guide.style.pointerEvents='none';svg.appendChild(guide);
          const handle=svgPart({tag:'circle',props:{cx:fmt(cx),cy:fmt(hy),r:fmt(.5/zoom693W),fill:'#ffc247',stroke:'#333','stroke-width':fmt(.12/zoom693W)}});
          handle.style.pointerEvents='none';svg.appendChild(handle);
        }
        if(tool.value==='scale') for(const [x,y] of [[b.l,b.t],[b.r,b.t],[b.l,b.b],[b.r,b.b]]){
          const handle=svgPart({tag:'rect',props:{x:fmt(x-h),y:fmt(y-h),width:fmt(2*h),height:fmt(2*h),rx:fmt(.12/zoom693W),fill:'#ffc247',stroke:'#333333','stroke-width':fmt(.11/zoom693W)}});
          handle.style.pointerEvents='none';svg.appendChild(handle);
        }
      }
    }
    if(tool.value==='nodes' && selected>=0){
      const info=nodePositions694I();
      if(info){
        for(const h of info.handles){
          const node=svgPart({tag:'circle',props:{cx:fmt(h.x),cy:fmt(h.y),r:fmt((h.kind==='anchor'?.34:.27)/zoom693W),fill:h.kind==='anchor'?'#ffc247':'#19ced1',stroke:'#202020','stroke-width':fmt(.10/zoom693W)}});
          node.style.pointerEvents='none';svg.appendChild(node);
        }
      }
    }
    // 694M: guide at the exact center of the 24x24 drawing plane.
    // Draw last for visibility; pointerEvents none preserves all touch tools.
    if(showCenter694M){
      const sw=fmt(.08/zoom693W),dash=`${fmt(.52/zoom693W)} ${fmt(.40/zoom693W)}`;
      const axes=svgPart({tag:'path',props:{d:'M12 0V24 M0 12H24',stroke:'#05c5c1','stroke-width':sw,'stroke-dasharray':dash,opacity:'.58',fill:'none'}});
      axes.style.pointerEvents='none';axes.setAttribute('data-svg-center-guide','axes');svg.appendChild(axes);
      const ring=svgPart({tag:'circle',props:{cx:'12',cy:'12',r:fmt(.42/zoom693W),fill:'none',stroke:'#132c38','stroke-width':fmt(.24/zoom693W),opacity:'.9'}});
      ring.style.pointerEvents='none';ring.setAttribute('data-svg-center-guide','ring');svg.appendChild(ring);
      const dot=svgPart({tag:'circle',props:{cx:'12',cy:'12',r:fmt(.20/zoom693W),fill:'#05c5c1',stroke:'#e5fffa','stroke-width':fmt(.10/zoom693W)}});
      dot.style.pointerEvents='none';dot.setAttribute('data-svg-center-guide','dot');svg.appendChild(dot);
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
  // 694F: precise 180° semicircle and crescent built from mathematical SVG arcs.
  // Drag defines the bounding square; direction is explicitly selectable.
  let arcDirection694F = 0;
  const arcDirections694F = ['vpravo','dolů','vlevo','nahoru'];
  const arcControls694F = document.createElement('div');
  arcControls694F.className = 'lnSvgArcControls694F';
  arcControls694F.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 4px';
  arcControls694F.innerHTML = '<button type="button" data-turn>↻ Otočit tvar</button><span data-dir>Směr: vpravo</span><small>Táhni od jednoho rohu k protějšímu. Rozměr určuješ délkou tahu.</small>';
  arcControls694F.querySelector('[data-turn]').style.cssText = 'min-height:38px;padding:8px 12px;border-radius:9px;color:var(--color-text);background:var(--color-surface);border:1px solid var(--color-border)';
  arcControls694F.querySelector('[data-turn]').addEventListener('click',()=>{
    arcDirection694F=(arcDirection694F+1)%4;
    arcControls694F.querySelector('[data-dir]').textContent='Směr: '+arcDirections694F[arcDirection694F];
    announce('Směr přesného tvaru: '+arcDirections694F[arcDirection694F]);
  });
  view.querySelector('.lnSvgStudioTools')?.insertAdjacentElement('beforebegin',arcControls694F);
  function shapeArc694F(a,b,kind) {
    const x=Math.min(a.x,b.x), y=Math.min(a.y,b.y);
    const size=Math.min(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
    const r=Math.max(.08,size/2), cx=x+r, cy=y+r;
    const dir=arcDirection694F;
    // Crescent is two connected exact circular arcs. Outline adapts to theme color.
    let d;
    if(kind==='arc') {
      if(dir===0) d=`M${fmt(cx)} ${fmt(y)} A${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(cx)} ${fmt(y+size)}`;
      else if(dir===1) d=`M${fmt(x)} ${fmt(cy)} A${fmt(r)} ${fmt(r)} 0 0 0 ${fmt(x+size)} ${fmt(cy)}`;
      else if(dir===2) d=`M${fmt(cx)} ${fmt(y+size)} A${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(cx)} ${fmt(y)}`;
      else d=`M${fmt(x+size)} ${fmt(cy)} A${fmt(r)} ${fmt(r)} 0 0 0 ${fmt(x)} ${fmt(cy)}`;
      return normalized('path',{d});
    }
    // 694G: two DIFFERENT boundaries. Earlier inner arc had radius < half
    // the endpoint distance, so SVG silently enlarged it and collapsed the moon.
    // The outer arc is a precise semicircle; quadratic inner boundary is concave.
    const rotate = (px,py) => {
      const dx=px-cx, dy=py-cy;
      if(dir===1) return {x:cx-dy,y:cy+dx};
      if(dir===2) return {x:cx-dx,y:cy-dy};
      if(dir===3) return {x:cx+dy,y:cy-dx};
      return {x:px,y:py};
    };
    const top=rotate(cx,y), bottom=rotate(cx,y+size);
    const inner=rotate(cx-r*.55,cy);
    const sweep=dir===0||dir===2?0:0; // rotation preserves the outer sweep.
    d=`M${fmt(top.x)} ${fmt(top.y)} A${fmt(r)} ${fmt(r)} 0 0 ${sweep} ${fmt(bottom.x)} ${fmt(bottom.y)} Q${fmt(inner.x)} ${fmt(inner.y)} ${fmt(top.x)} ${fmt(top.y)} Z`;
    return normalized('path',{d,fill:fill?.checked?activeColor:'none'});
  }
  function shapeAt(a, b, kind) {
    const filled = fill?.checked && (kind === 'circle' || kind === 'rect');
    let props;
    if (kind === 'arc' || kind === 'moon') return shapeArc694F(a,b,kind);
    if (kind === 'circle') props = {cx:fmt(a.x),cy:fmt(a.y),r:fmt(Math.hypot(b.x-a.x,b.y-a.y))};
    else if (kind === 'rect') props = {x:fmt(Math.min(a.x,b.x)),y:fmt(Math.min(a.y,b.y)),width:fmt(Math.abs(b.x-a.x)),height:fmt(Math.abs(b.y-a.y))};
    else if (kind === 'line') props = {x1:fmt(a.x),y1:fmt(a.y),x2:fmt(b.x),y2:fmt(b.y)};
    else return null;
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
        const d = affine694H(shapes[i]);
        if(!d)throw new Error('unsupported imported transform');
        const q = local694J(d,p);
        let minimal = Infinity;
        const length = el.getTotalLength?.();
        if (Number.isFinite(length) && length >= 0) {
          const steps = Math.max(12, Math.min(220, Math.ceil(length * 4)));
          for (let k = 0; k <= steps; k++) {
            const v = el.getPointAtLength(length*k/steps);
            minimal = Math.min(minimal, Math.hypot(q.x-v.x,q.y-v.y)*d.s);
          }
        }
        const bb = el.getBBox();
        if (shapes[i].props.fill !== 'none' && bb.width && bb.height && q.x >= bb.x && q.x <= bb.x+bb.width && q.y >= bb.y && q.y <= bb.y+bb.height) minimal = 0;
        const threshold = Math.max(bestDistance, Number(shapes[i].props['stroke-width'] || 1.8)*d.s/2 + .65);
        if (minimal <= threshold && (minimal < bestDistance || best === -1)) { best = i; bestDistance = minimal; }
      } catch (_) { /* ignore malformed/unmeasurable path */ }
      el.remove();
    }
    return best;
  }
  // 694M: a vector bucket fills an existing CLOSED shape, not screen pixels.
  // Imported unknown transforms and open lines are never changed.
  function closedFillable694M(shape,el) {
    if(!shape) return false;
    if(['circle','ellipse','rect','polygon'].includes(shape.tag))return true;
    if(!['path','polyline'].includes(shape.tag))return false;
    if(shape.tag==='path' && /[zZ]/.test(String(shape.props.d||'')))return true;
    try {
      const length=el.getTotalLength();
      if(!Number.isFinite(length)||length<1)return false;
      const start=el.getPointAtLength(0),end=el.getPointAtLength(length);
      return Math.hypot(start.x-end.x,start.y-end.y)<=.65;
    }catch(_){return false;}
  }
  function bucketAt694M(p) {
    for(let i=shapes.length-1;i>=0;i--){
      const shape=shapes[i];
      if(!shape || !allowed.has(shape.tag) || !['circle','ellipse','rect','polygon','path','polyline'].includes(shape.tag)) continue;
      const t=affine694H(shape);
      if(!t) continue;
      const q=local694J(t,p),el=svgPart(shape);
      svg.appendChild(el);
      let inside=false,closed=false;
      try {
        closed=closedFillable694M(shape,el);
        if(!closed)continue;
        // SVG geometry API accounts for curved outlines, concave paths and holes.
        if(typeof el.isPointInFill==='function') inside=el.isPointInFill(new DOMPoint(q.x,q.y));
        else { // Conservative fallback for old WebViews, do not fill random path bounding boxes.
          const props=shape.props;
          if(shape.tag==='circle')inside=Math.hypot(q.x-Number(props.cx),q.y-Number(props.cy))<=Number(props.r);
          else if(shape.tag==='ellipse')inside=((q.x-Number(props.cx))/Number(props.rx))**2+((q.y-Number(props.cy))/Number(props.ry))**2<=1;
          else if(shape.tag==='rect')inside=q.x>=Number(props.x)&&q.x<=Number(props.x)+Number(props.width)&&q.y>=Number(props.y)&&q.y<=Number(props.y)+Number(props.height);
        }
        if(!inside && typeof el.isPointInStroke==='function')inside=el.isPointInStroke(new DOMPoint(q.x,q.y));
      }catch(_){inside=false;}
      finally{el.remove();}
      if(!inside)continue;
      if(shape.props.fill===activeColor){announce('Tvar už tuto výplň má.');return false;}
      shape.props.fill=activeColor;
      selected=-1;
      render();
      announce('Uzavřený tvar vyplněn. Zpět obnoví původní výplň.');
      return true;
    }
    announce('Klepni dovnitř uzavřeného tvaru. Otevřené čáry kyblíček nevyplní.');
    return false;
  }
  function eraseAt(p) {
    const index = hitTest(p);
    if (index < 0) return false;
    shapes.splice(index,1);
    if (selected === index) selected = -1;
    else if (selected > index) selected--;
    render(); return true;
  }
  // 694G: non-destructive VECTOR partial eraser. Supported: unfilled paths,
  // circles, ellipse and lines; each retained fragment becomes editable SVG path.
  // Filled objects are deliberately skipped (Boolean geometry is a later step).
  const eraseRadius694G=.60;
  function erasePart694G(p) {
    let changed=false;
    for(let i=shapes.length-1;i>=0;i--){
      const shape=shapes[i];
      if(!shape || !['path','line','circle','ellipse','polyline','polygon'].includes(shape.tag) ||
         (shape.props.fill && shape.props.fill!=='none')) continue;
      // Do not silently replace unsupported transforms with wrong coordinates.
      if(!affine694H(shape)) continue;
      const el=svgPart(shape); svg.appendChild(el);
      let length,points=[];
      try {
        length=el.getTotalLength();
        if(!Number.isFinite(length)||length<=0) continue;
        const count=Math.max(12,Math.min(1200,Math.ceil(length/.12)));
        for(let k=0;k<=count;k++){const v=el.getPointAtLength(length*k/count);points.push({x:v.x,y:v.y});}
      } catch(_) { continue; } finally {el.remove();}
      const shift=affine694H(shape);
      const radius=eraseRadius694G+Math.max(0,Number(shape.props['stroke-width']||1)*shift.s/2);
      const keep=points.map(q=>Math.hypot(world694J(shift,q).x-p.x,world694J(shift,q).y-p.y)>radius);
      if(keep.every(Boolean))continue;
      const fragments=[];let segment=[];
      function flush(){
        if(segment.length>=2){
          const d=segment.map((q,k)=>`${k?'L':'M'}${fmt(q.x)} ${fmt(q.y)}`).join(' ');
          fragments.push({tag:'path',props:{...shape.props,d,fill:'none'}});
        } segment=[];
      }
      for(let k=0;k<points.length;k++){if(keep[k])segment.push(points[k]);else flush();}
      flush();
      shapes.splice(i,1,...fragments);
      if(selected===i)selected=-1;
      changed=true;
    }
    if(changed)render();
    return changed;
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
  // 694J: snap can be switched off for free rotation.
  const rotateControls694J=document.createElement('label');
  rotateControls694J.className='lnSvgRotateControls694J';
  rotateControls694J.style.cssText='display:flex;align-items:center;gap:8px;padding:8px 4px';
  rotateControls694J.innerHTML='<input type="checkbox" checked> Přichytávat otočení po 15°';
  view.querySelector('.lnSvgStudioTools')?.insertAdjacentElement('afterend',rotateControls694J);
  const snapRotate694J=rotateControls694J.querySelector('input');
  function rotateHandle694J(p,b){
    const x=(b.l+b.r)/2,y=b.t-1.65/zoom693W;
    const r=svg.getBoundingClientRect(),tol=18*(24/zoom693W)/Math.max(1,r.width);
    return Math.hypot(p.x-x,p.y-y)<=tol;
  }
  // Icon shortcuts mirror the existing select; they do not create a second tool state.
  const tools693W=[['move','mouse-pointer-2','Výběr'],['scale','maximize','Velikost'],['nodes','nodes','Body'],['rotate','rotate-cw','Rotace'],['pen','pencil','Tužka'],['bucket','bucket','Výplň'],['line','minus','Úsečka'],['circle','circle','Kruh'],['rect','square','Obdélník'],['arc','arc','Půlkruh'],['moon','moon','Měsíček'],['eraser','eraser','Guma'],['partial-eraser','partial-eraser','Guma část'],['pan','hand','Posun plátna']];
  const toolBar693W=document.createElement('div');toolBar693W.className='lnSvgToolBar693W';
  toolBar693W.setAttribute('role','group');toolBar693W.setAttribute('aria-label','Nástroje kreslení');
  const icons693W={
    'mouse-pointer-2':'<path d="m5 3 14 9-7 1-3 7z"/>',
    maximize:'<path d="M4 10V4h6 M4 4l6 6 M20 14v6h-6 M20 20l-6-6 M14 4h6v6 M20 4l-6 6 M4 14v6h6 M4 20l6-6"/>',
    nodes:'<path d="M4 18 Q12 3 20 18 M4 18l16 0"/><circle cx="4" cy="18" r="2"/><circle cx="12" cy="10" r="2"/><circle cx="20" cy="18" r="2"/>',
    'rotate-cw':'<path d="M20 11a8 8 0 1 1-3-6 M20 3v8h-8"/>',
    pencil:'<path d="m4 20 4.6-1 11-11-3.6-3.6-11 11zM14 6l3.6 3.6"/>',
    bucket:'<path d="M3 14l8-8 9 9-8 8-9-9Z M8 9l6 6 M15 5l1.5-2 M18 8l2-2"/><path d="M18 19q2-5 4-1a2 2 0 0 1-4 1Z"/>',
    minus:'<path d="M4 12h16"/>',circle:'<circle cx="12" cy="12" r="8"/>',
    square:'<rect x="4" y="4" width="16" height="16" rx="2"/>',
    arc:'<path d="M4 16 A8 8 0 0 1 20 16"/>',
    moon:'<path d="M18 3 A9 9 0 1 0 18 21 A7 7 0 0 1 18 3 Z"/>',
    'partial-eraser':'<path d="M4 20 L10 14 M14 10 L20 4 M4 4h16"/>',
    eraser:'<path d="m20 20-9 0-7-7 9-9 8 8-8 8M8 16l9-9"/>',
    hand:'<path d="M8 13V6a2 2 0 0 1 4 0v5-7a2 2 0 0 1 4 0v7-5a2 2 0 0 1 4 0v9c0 4-3 6-7 6H9c-2 0-4-2-6-6l-1-2a2 2 0 0 1 3-2z"/>'};
  const toolButtons693W=[];
  for(const [value,icon,label] of tools693W){
    const b=document.createElement('button');b.type='button';b.className='lnSvgToolButton693W';
    b.dataset.tool=value;b.setAttribute('aria-label',label);b.title=label;
    b.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons693W[icon]}</svg><span>${label}</span>`;
    b.addEventListener('click',()=>{
      if (!validTools694B.has(value) || !Array.from(tool.options).some(option => option.value === value)) {
        diagLog693Z('INVALID_TOOL_SHORTCUT', value);
        announce('Nástroj není dostupný. Kreslení zůstalo aktivní.');
        return;
      }
      tool.value=value;
      tool.dispatchEvent(new Event('change',{bubbles:true}));
    });
    toolButtons693W.push(b);toolBar693W.append(b);
  }
  function syncTools693W(){rotateControls694J.hidden=tool.value!=='rotate';arcControls694F.hidden=!['arc','moon'].includes(tool.value);toolButtons693W.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tool===tool.value)));}
  tool.addEventListener('change',syncTools693W);
  const controls693W=document.createElement('div');controls693W.className='lnSvgZoomBar693W';
  controls693W.innerHTML='<button type="button" data-zoom="out" aria-label="Oddálit">−</button><output>100 %</output><button type="button" data-zoom="in" aria-label="Přiblížit">+</button><button type="button" data-zoom="reset">Celá ikona</button>';
  const zoomText693W=controls693W.querySelector('output');
  controls693W.querySelector('[data-zoom="out"]').addEventListener('click',()=>zoomTo693W(zoom693W/1.5));
  controls693W.querySelector('[data-zoom="in"]').addEventListener('click',()=>zoomTo693W(zoom693W*1.5));
  controls693W.querySelector('[data-zoom="reset"]').addEventListener('click',()=>{zoom693W=1;panX693W=0;panY693W=0;applyView693W();announce('Zobrazeno celé plátno. Aktivní nástroj zůstává beze změny.');});
  const toolRow693W=tool.closest('.lnSvgStudioTools');
  if(toolRow693W){toolRow693W.insertAdjacentElement('beforebegin',toolBar693W);toolRow693W.insertAdjacentElement('afterend',controls693W);}
  tool.closest('label')?.classList.add('lnSvgOldSelect693W');
  const panInfo693W=document.createElement('small');  panInfo693W.textContent='Dvěma prsty přibližuj a posouvej plátno. Nástroj Velikost upraví jen vybraný objekt; zoom nemění exportovanou ikonu.';
  controls693W.insertAdjacentElement('afterend',panInfo693W);
  panInfo693W.className='lnSvgPanInfo693W';
  // 694K: place the one existing live toolbar DIRECTLY above the SVG board.
  // Reparenting preserves button listeners, tool state and gesture handling.
  const board694K=svg.closest('.lnSvgStudioBoard');
  if(board694K && toolBar693W){
    board694K.insertAdjacentElement('beforebegin',toolBar693W);
    toolBar693W.classList.add('lnSvgToolGrid694K');
    toolBar693W.setAttribute('aria-label','Nástroje SVG Studia – dvě řady nad plátnem');
  }
  syncTools693W();applyView693W();
  // 694E: Tool PAN is persistent, like Pencil / Eraser. It never switches
  // itself to a drawing tool, even when one of multiple fingers is lifted.
  tool.addEventListener('change', () => {
    if (tool.value === 'pan' && zoom693W <= 1.00001) {
      zoomTo693W(1.5);
      announce('Posun plátna aktivní (150 %). Pro kreslení vyber Tužku.');
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
    // Pan stays selected until the user explicitly chooses another tool.
    render();
  }
  // 694H – pinch zoom independent of the active tool. The first unfinished
  // stroke is rolled back when a second finger joins, avoiding stray marks.
  const touches694H=new Map();
  let pinch694H=null, muteTouches694H=false;
  const midpoint694H=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
  const length694H=(a,b)=>Math.max(1,Math.hypot(a.x-b.x,a.y-b.y));
  function startPinch694H(){
    const [a,b]=[...touches694H.values()];
    if(!a||!b)return;
    if(gesture)cancelInterruptedGesture693X();
    muteTouches694H=true;
    const mid=midpoint694H(a,b), r=svg.getBoundingClientRect(),span=24/zoom693W;
    pinch694H={zoom:zoom693W,dist:length694H(a,b),
      worldX:panX693W+(mid.x-r.left)*span/r.width,
      worldY:panY693W+(mid.y-r.top)*span/r.height};
  }
  function endTouch694H(e){
    if(e.pointerType!=='touch'||!touches694H.has(e.pointerId))return false;
    const wasMuted=muteTouches694H;
    touches694H.delete(e.pointerId);
    if(touches694H.size<2)pinch694H=null;
    if(!touches694H.size)muteTouches694H=false;
    return wasMuted;
  }
  function moveTouch694H(e){
    if(e.pointerType!=='touch'||!touches694H.has(e.pointerId))return false;
    touches694H.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pinch694H && touches694H.size>=2){
      const [a,b]=[...touches694H.values()],mid=midpoint694H(a,b);
      const r=svg.getBoundingClientRect();
      zoom693W=limit693W(pinch694H.zoom*length694H(a,b)/pinch694H.dist,1,8);
      const span=24/zoom693W;
      panX693W=pinch694H.worldX-(mid.x-r.left)*span/r.width;
      panY693W=pinch694H.worldY-(mid.y-r.top)*span/r.height;
      applyView693W();
      return true;
    }
    return muteTouches694H;
  }
  svg.addEventListener('pointerdown', e => {
    if (view.hidden) return;
    if(e.pointerType==='touch'){
      touches694H.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(touches694H.size>=2){
        startPinch694H();
        try{svg.setPointerCapture?.(e.pointerId);}catch(_){}
        e.preventDefault();return;
      }
      if(muteTouches694H)return;
    }
    if (e.button != null && e.button !== 0) return;
    if (e.isPrimary === false) return; // never treat a second finger as another stroke
    // A new primary touch means any old gesture was interrupted.
    if (gesture) cancelInterruptedGesture693X();
    e.preventDefault();
    // 694B: invalid select values must NEVER enter a gesture/shapeAt() path.
    // This also repairs any unexpected future toolbar/select mismatch.
    if (!validTools694B.has(tool.value)) {
      diagLog693Z('INVALID_TOOL_RECOVERED', `value=${JSON.stringify(tool.value)}`);
      tool.value = 'pen';
      tool.dispatchEvent(new Event('change', {bubbles:true}));
      announce('Nástroj obnoven. Můžeš pokračovat v kreslení.');
    }
    const p = point(e), kind = tool.value;
    try { svg.setPointerCapture?.(e.pointerId); } catch (_) { /* window listeners cover no-capture WebViews */ }
    gesture = {id:e.pointerId,startedAt693X:performance.now(),mode:kind,
      start:['line','rect','circle','arc','moon'].includes(kind)?snapPoint694U(p):p,originClientX:e.clientX,originClientY:e.clientY,before:snapshot(),rawPath:`M${fmt(p.x)} ${fmt(p.y)}`,points:[p]};
    if (kind === 'pan') {
      gesture.initialPan={x:panX693W,y:panY693W};
    } else if(kind==='rotate'){
      const bounds=selected>=0?shapeBounds694H(shapes[selected]):null;
      if(bounds && rotateHandle694J(p,bounds)){
        const t=affine694H(shapes[selected]);
        if(t){
          const center={x:(bounds.l+bounds.r)/2,y:(bounds.t+bounds.b)/2};
          gesture.mode='rotate-drag';gesture.chosen=selected;
          gesture.rotation={original:t,center,start:Math.atan2(p.y-center.y,p.x-center.x)};
          announce('Tažením žlutého kruhu otočíš vybraný tvar.');
        }
      }else{
        selected=hitTest(p);gesture.mode='rotate-select';
        if(selected>=0&&!affine694H(shapes[selected])){selected=-1;announce('Importovanou transformaci zatím nelze bezpečně otáčet.');}
        else announce(selected<0?'Klepni na objekt, který chceš otočit.':'Táhni žlutý kruhový úchyt nad objektem.');
      }
    } else if(kind==='nodes'){
      const node=nearestNode694I(p);
      if(node){
        gesture.mode='node-drag';gesture.chosen=selected;
        gesture.node={segment:node.segment,coordinate:node.coordinate,transform:affine694H(shapes[selected])};
        announce(node.kind==='control'?'Tažením tyrkysového bodu měníš zakřivení.':'Tažením žlutého bodu posuneš konec úseku.');
      }else{
        selected=hitTest(p);gesture.mode='node-select';
        if(selected>=0&&!nodePositions694I())announce('Tento tvar nemá editovatelné body M/L/Q/C. Oblouky A a jiné importy zatím ponechávám beze změny.');
        else announce(selected<0?'Klepni na čáru a zobrazí se její body.':'Táhni žlutý nebo tyrkysový bod.');
      }
    } else if (kind === 'scale') {
      const bounds=selected>=0?shapeBounds694H(shapes[selected]):null;
      const corner=bounds?resizeHandle694H(p,bounds):null;
      const t=corner?affine694H(shapes[selected]):null;
      if(corner && t){
        gesture.mode='resize';gesture.chosen=selected;
        const a={x:corner.includes('l')?bounds.r:bounds.l,y:corner.includes('t')?bounds.b:bounds.t};
        const h={x:corner.includes('l')?bounds.l:bounds.r,y:corner.includes('t')?bounds.t:bounds.b};
        gesture.resize={anchor:a,dx:h.x-a.x,dy:h.y-a.y,original:t};
        announce('Tažením žlutého úchytu měníš velikost objektu.');
      } else {
        selected=hitTest(p);
        gesture.mode='scale-select';
        if(selected>=0&&!affine694H(shapes[selected])){
          selected=-1;announce('Tento importovaný transform zatím nelze měnit.');
        } else announce(selected<0?'Klepni na tvar a potom táhni žlutý úchyt.':'Táhni jeden ze žlutých rohových úchytů.');
      }
    } else if (kind === 'move') {
      selected = hitTest(p);
      gesture.chosen = selected;
      gesture.initial = selected >= 0 ? offset(shapes[selected]) : {x:0,y:0};
      gesture.initialBounds694U = selected>=0 && snapGrid694U ? shapeBounds694H(shapes[selected]) : null;
      announce(selected < 0 ? 'Klepni na tvar, který chceš přesunout.' : 'Táhni prstem pro přesun vybraného tvaru.');
    } else if (kind === 'bucket') {
      selected=-1; bucketAt694M(p);
    } else if (kind === 'partial-eraser') {
      selected=-1; erasePart694G(p);
    } else if (kind === 'eraser') {
      selected = -1; eraseAt(p);
    } else {
      selected = -1;
      drawing = kind === 'pen' ? normalized('path',{d:gesture.rawPath}) : shapeAt(p,p,kind);
    }
    render();
  });
  svg.addEventListener('pointermove',e => {
    if(moveTouch694H(e))return;
    if (!gesture || e.pointerId !== gesture.id) return;
    const p = point(e), g = gesture;
    if (g.mode === 'eraser') { eraseAt(p); return; }
    if (g.mode === 'partial-eraser') { erasePart694G(p); return; }
    if (g.mode === 'pan') {
      const r=svg.getBoundingClientRect(),size=24/zoom693W;
      panX693W=g.initialPan.x-(e.clientX-g.originClientX)*size/r.width;
      panY693W=g.initialPan.y-(e.clientY-g.originClientY)*size/r.height;
      applyView693W();return;
    }
    if(g.mode==='rotate-drag'){
      const z=g.rotation;
      if(!z||g.chosen<0)return;
      const now=Math.atan2(p.y-z.center.y,p.x-z.center.x);
      let delta=now-z.start;
      if(snapRotate694J.checked)delta=Math.round(delta/(Math.PI/12))*(Math.PI/12);
      const angle=z.original.angle+delta,co=Math.cos(delta),si=Math.sin(delta),c=z.center;
      const x=z.original.x-c.x,y=z.original.y-c.y;
      assignAffine694H(shapes[g.chosen],{s:z.original.s,angle,m:z.original.m||1,x:c.x+x*co-y*si,y:c.y+x*si+y*co});
      render();return;
    }
    if(g.mode==='rotate-select')return;
    if(g.mode==='node-drag'){
      const shape=shapes[g.chosen],info=pathNodes694I(shape),z=g.node;
      if(!info||!z||!z.transform)return;
      const part=info.parsed[z.segment];if(!part)return;
      const t=z.transform;
      const local=local694J(t,snapPoint694U(p));
      part.nums[z.coordinate]=local.x;
      part.nums[z.coordinate+1]=local.y;
      shape.props.d=writeNodes694I(info.parsed);
      render();return;
    }
    if(g.mode==='node-select')return;
    if (g.mode === 'resize') {
      if(g.chosen<0)return;
      const z=g.resize,dx=z.dx,dy=z.dy,den=dx*dx+dy*dy;
      if(den<=.00001)return;
      const target=snapPoint694U(p);
      const factor=limit693W(((target.x-z.anchor.x)*dx+(target.y-z.anchor.y)*dy)/den,.15,5);
      assignAffine694H(shapes[g.chosen],{s:z.original.s*factor,
        x:z.anchor.x+factor*(z.original.x-z.anchor.x),
        y:z.anchor.y+factor*(z.original.y-z.anchor.y),angle:z.original.angle,m:z.original.m||1});
    } else if(g.mode==='scale-select'){
      return;
    } else if (g.mode === 'move') {
      if (g.chosen < 0) return;
      const deltaX=p.x-g.start.x,deltaY=p.y-g.start.y;
      let dx=deltaX,dy=deltaY;
      if(snapGrid694U && g.initialBounds694U){
        const b=g.initialBounds694U;
        const centerX=(b.l+b.r)/2+deltaX,centerY=(b.t+b.b)/2+deltaY;
        dx+=magnetCoord694U(centerX)-centerX;
        dy+=magnetCoord694U(centerY)-centerY;
      }
      setOffset(shapes[g.chosen],g.initial.x+dx,g.initial.y+dy);
    } else if (g.mode === 'pen') {
      if (distance(p,g.points[g.points.length-1])>0.065) { g.rawPath += ` L${fmt(p.x)} ${fmt(p.y)}`; g.points.push(p); }
      drawing = normalized('path',{d:g.rawPath});
    } else drawing = shapeAt(g.start,snapPoint694U(p),g.mode);
    render();
  });
  function finish(e,cancelled=false) {
    if (!gesture || e.pointerId !== gesture.id) return;
    const g = gesture; gesture = null;
    try {svg.releasePointerCapture?.(e.pointerId);} catch (_) {}
    if (cancelled) {shapes=g.before; drawing=null;selected=-1;render();return;}
    const p = point(e);
    if (!['move','eraser','partial-eraser','bucket','pan','resize','scale-select','node-drag','node-select','rotate-drag','rotate-select'].includes(g.mode)) {
      if (g.mode === 'pen' && !g.rawPath.includes(' L')) drawing = normalized('circle',{cx:fmt(p.x),cy:fmt(p.y),r:fmt(Number(stroke.value)/2),fill:activeColor});
      else if (g.mode !== 'pen') drawing = shapeAt(g.start,snapPoint694U(p),g.mode);
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
      announce('Plátno posunuto. Posun zůstává aktivní.');
    } else if (record(g.before)) {
      announce(g.mode==='bucket'?'Výplň změněna.':g.mode==='partial-eraser'?'Část tahu vymazána.':g.mode==='eraser'?'Tvar vymazán.':g.mode==='rotate-drag'?'Objekt otočen.':g.mode==='node-drag'?'Bod křivky upraven.':g.mode==='resize'?'Velikost upravena.':g.mode==='move'?'Tvar přesunut.':'Tvar přidán.');
    }
    render();
  }
  svg.addEventListener('pointerup', e => {if(!endTouch694H(e))finish(e);});
  svg.addEventListener('pointercancel', e => {if(!endTouch694H(e))finish(e,true);});
  svg.addEventListener('lostpointercapture',e => {if(gesture && gesture.id===e.pointerId) finish(e,true);});
  // Recover gestures finished outside the SVG when pointer capture fails.
  window.addEventListener('pointerup',e=>{if(endTouch694H(e))return;if(gesture && e.pointerId===gesture.id)finish(e);});
  window.addEventListener('pointercancel',e=>{if(endTouch694H(e))return;if(gesture && e.pointerId===gesture.id)finish(e,true);});
  window.addEventListener('blur',()=>{touches694H.clear();pinch694H=null;muteTouches694H=false;cancelInterruptedGesture693X();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){touches694H.clear();pinch694H=null;muteTouches694H=false;cancelInterruptedGesture693X();}});
  // Changing tools while a stroke is still marked active must not freeze drawing.
  tool.addEventListener('change',cancelInterruptedGesture693X);
  tool.addEventListener('change',()=>{selected=-1;render();announce(tool.value==='eraser'?'Guma maže jednotlivé tvary dotykem.':tool.value==='move'?'Klepni na tvar a přesuň ho tažením.':tool.value==='rotate'?'Vyber objekt a otoč ho žlutým úchytem.':tool.value==='nodes'?'Vyber čáru a táhni její žluté nebo tyrkysové body.':tool.value==='scale'?'Vyber tvar a uprav velikost rohovým úchytem.':tool.value==='bucket'?'Vyber barvu a klepni dovnitř uzavřeného tvaru.':'Nástroj připraven.');});
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
      const bb=shapeBounds694H(shapes[i]);
      if(!bb) return announce('Tento SVG transform nelze bezpečně vystředit.');
      l=Math.min(l,bb.l);t=Math.min(t,bb.t);r=Math.max(r,bb.r);b=Math.max(b,bb.b);
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
        if(k==='transform' && (!affine694H({props:{transform:val}}) || val.length>150))throw Error('Podporuji pouze translate nebo matici Rotace/Velikost.');
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
          if(at.name==='transform' && (!affine694H({props:{transform:at.value}}) || at.value.length>150))throw Error('Podporuji pouze translate nebo matici Rotace/Velikost.');
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
      <p><strong>5. Barvy a výplň.</strong> „Barva motivu“ se přizpůsobí dennímu/nočnímu režimu LubaNote. „Vyplnit kruh/obdélník“ ovlivní nově kreslené tvary. Nástroj Výplň (kyblíček) vyplní vnitřek již hotového uzavřeného objektu zvolenou barvou, obrys ponechá. Středové čáry jsou jen pomocné, neexportují se. Barvu již nakresleného tvaru lze změnit po výběru pomocí Přesun.</p>
      <p><strong>6. Velikost a kontrola.</strong> Použij „Centrovat vše“ a pak zkontroluj zejména malý náhled 24 × 24. Pokud není ikona rozeznatelná bez zvětšení, zjednoduš ji nebo zesil tah.</p>
      <p><strong>7. Import a export.</strong> Vlož jednoduché SVG do pole a klepni na „Načíst SVG“. Pro definice z lubaIcons.js použij „Načíst kód LubaNote“; pro celé SVG „Načíst SVG“. Import podporuje základní tvary, nikoli složité skupiny a efekty. „Kopírovat SVG“ uloží celé SVG do schránky; „Kopírovat pro LubaNote“ připraví definice pro lubaIcons.js. Rozpracovaný návrh můžeš uložit do místního úložiště zařízení pomocí Moje SVG návrhy. Před odinstalací aplikace jej zálohuj i exportem SVG.</p>
      <p><strong>Tip pro připínáček:</strong> Hlavní hlavičku nakresli do horní poloviny, hrot směrem ke spodnímu okraji. Před složitostí dej přednost jednoduchému obrysu.</p>
    </div>`;
  view.querySelector('.lnSvgStudioTools')?.insertAdjacentElement('beforebegin',guide693U);
  // 694K: Device-local drafts and emergency recovery via IndexedDB.
  // This deliberately never connects to Supabase, LubaServer, or production notes.
  const draftPanel694K=document.createElement('section');
  draftPanel694K.className='lnSvgDraftPanel694K';
  draftPanel694K.setAttribute('aria-label','Rozpracované SVG ikony');
  draftPanel694K.innerHTML=`
    <div class="lnSvgDraftTitle694K"><strong>💾 Moje SVG návrhy</strong><small data-save-state>Neuložený návrh</small></div>
    <div class="lnSvgDraftRow694K">
      <input data-draft-name type="text" maxlength="70" placeholder="Název ikony" aria-label="Název SVG návrhu" value="Nová ikona">
      <button type="button" data-save>Uložit</button><button type="button" data-new>Nový</button>
    </div>
    <div class="lnSvgDraftRow694K">
      <select data-drafts aria-label="Uložené ikony"><option value="">Žádné uložené ikony</option></select>
      <button type="button" data-open>Otevřít</button><button type="button" data-delete>Odstranit</button>
    </div>
    <div class="lnSvgDraftRow694K lnSvgDraftRecover694K"><button type="button" data-recover hidden>↶ Obnovit poslední rozpracovanou kresbu</button></div>
    <small data-draft-message role="status">Návrhy se ukládají jen v tomto zařízení. Před odinstalací aplikace je exportuj jako SVG.</small>`;
  // Saving belongs next to the live previews, never between the tool grid and canvas.
  const draftsAnchor694K=view.querySelector('.lnSvgStudioPreviewArea693S') || svg.closest('.lnSvgStudioBoard');
  draftsAnchor694K?.insertAdjacentElement('afterend',draftPanel694K);
  const nameInput694K=draftPanel694K.querySelector('[data-draft-name]');
  const list694K=draftPanel694K.querySelector('[data-drafts]');
  // 694W1: native Android select menu replaced with a compact in-app picker.
  list694K.hidden=true;
  const draftPicker694W1=document.createElement('button');
  draftPicker694W1.type='button';draftPicker694W1.className='lnSvgDraftPicker694W1';
  draftPicker694W1.textContent='Vybrat uložený návrh ▾';
  list694K.insertAdjacentElement('afterend',draftPicker694W1);
  const dialog694W1=document.createElement('div');
  dialog694W1.className='lnSvgDialog694W1';dialog694W1.hidden=true;
  dialog694W1.innerHTML='<div class="lnSvgDialogBackdrop694W1"></div><div class="lnSvgDialogCard694W1" role="dialog" aria-modal="true"><div class="lnSvgDialogTitle694W1"></div><div class="lnSvgDialogChoices694W1"></div><div class="lnSvgDialogActions694W1"></div></div>';
  draftPanel694K.append(dialog694W1);
  function showDialog694W1(title,choices,buttons){
    return new Promise(resolve=>{
      dialog694W1.querySelector('.lnSvgDialogTitle694W1').textContent=title;
      const area=dialog694W1.querySelector('.lnSvgDialogChoices694W1');area.replaceChildren();
      const actions=dialog694W1.querySelector('.lnSvgDialogActions694W1');actions.replaceChildren();
      const finish=value=>{dialog694W1.hidden=true;resolve(value);};
      for(const item of choices){const b=document.createElement('button');b.type='button';b.className='lnSvgDialogChoice694W1';b.textContent=item.label;b.addEventListener('click',()=>finish(item.value));area.append(b);}
      for(const item of buttons){const b=document.createElement('button');b.type='button';b.textContent=item.label;b.addEventListener('click',()=>finish(item.value));actions.append(b);}
      dialog694W1.hidden=false;
    });
  }
  const confirm694W1=message=>showDialog694W1(message,[],[{label:'Zrušit',value:false},{label:'Potvrdit',value:true}]);
  function refreshPicker694W1(){draftPicker694W1.textContent=(list694K.selectedOptions[0]?.textContent||'Vybrat návrh')+' ▾';}
  draftPicker694W1.addEventListener('click',async()=>{
    const choices=Array.from(list694K.options).filter(o=>o.value).map(o=>({label:o.textContent,value:o.value}));
    if(!choices.length)return message694K('Zatím nemáš žádný uložený návrh.');
    const id=await showDialog694W1('Vyber uložený SVG návrh',choices,[{label:'Zavřít',value:null}]);
    if(id){list694K.value=id;refreshPicker694W1();}
  });
  const recoveryBtn694K=draftPanel694K.querySelector('[data-recover]');
  const draftMessage694K=draftPanel694K.querySelector('[data-draft-message]');
  const state694K=draftPanel694K.querySelector('[data-save-state]');
  let currentId694K=null,dirty694K=false,draftReady694K=false;
  let recoveryTimer694K=null,writeChain694K=Promise.resolve(),lastAuto694K=null;
  const AUTO_ID694K='__recovery__';
  let dbOpen694K=null;
  function getDb694K(){
    if(!dbOpen694K){
      dbOpen694K=new Promise((resolve,reject)=>{
        if(!('indexedDB' in window))return reject(new Error('IndexedDB není dostupné'));
        const req=indexedDB.open('LubaNote-SVG-Studio-Drafts-694K',1);
        req.onupgradeneeded=()=>{
          const db=req.result;
          if(!db.objectStoreNames.contains('drafts'))db.createObjectStore('drafts',{keyPath:'id'});
        };
        req.onerror=()=>reject(req.error||new Error('Nelze otevřít úložiště'));
        req.onsuccess=()=>resolve(req.result);
      }).catch(err=>{dbOpen694K=null;throw err;});
    }
    return dbOpen694K;
  }
  async function dbOp694K(method,arg){
    const db=await getDb694K();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('drafts',method==='put'||method==='delete'?'readwrite':'readonly');
      const store=tx.objectStore('drafts');
      let result;
      let request;
      try{request=method==='all'?store.getAll():method==='get'?store.get(arg):method==='delete'?store.delete(arg):store.put(arg);}
      catch(err){reject(err);return;}
      request.onsuccess=()=>{result=request.result;};
      request.onerror=()=>reject(request.error||new Error('Chyba úložiště'));
      tx.oncomplete=()=>resolve(result);
      tx.onerror=()=>reject(tx.error||new Error('Transakce selhala'));
      tx.onabort=()=>reject(tx.error||new Error('Transakce přerušena'));
    });
  }
  function draftData694K(id,name){
    return {id,name,updated:new Date().toISOString(),shapes:snapshot(),activeColor,
      stroke:stroke.value,fill:!!fill?.checked,reference:reference694R ? {data:reference694R.data,visible:reference694R.visible,opacity:reference694R.opacity,scale:reference694R.scale,xOffset:reference694R.xOffset,yOffset:reference694R.yOffset,fitWidth:reference694R.fitWidth,fitHeight:reference694R.fitHeight}:null};
  }
  function validDraft694K(item){
    if(!item||!Array.isArray(item.shapes)||item.shapes.length>800)return false;
    return item.shapes.every(s=>s && allowed.has(s.tag)&&s.props && typeof s.props==='object' &&
      Object.entries(s.props).every(([k,v])=>attrs.has(k)&&['string','number'].includes(typeof v)&&String(v).length<=20000));
  }
  function message694K(value){draftMessage694K.textContent=value;}
  function markSaved694K(){dirty694K=false;state694K.textContent='Uloženo';}
  function onChanged694K(){
    dirty694K=true;state694K.textContent='Neuložené změny';
    queueRecovery694K();
  }
  function enqueueWrite694K(task){
    writeChain694K=writeChain694K.catch(()=>{}).then(task);
    return writeChain694K;
  }
  function queueRecovery694K(immediate=false){
    if(recoveryTimer694K!==null)clearTimeout(recoveryTimer694K);
    recoveryTimer694K=setTimeout(()=>{
      recoveryTimer694K=null;
      const data=draftData694K(AUTO_ID694K,nameInput694K.value.trim()||'Rozpracovaná ikona');
      enqueueWrite694K(()=>dbOp694K('put',data)).then(()=>{lastAuto694K=data;recoveryBtn694K.hidden=!data.shapes.length;})
        .catch(()=>{message694K('Automatická obnova není dostupná. Pro jistotu zkopíruj SVG kód.');});
    },immediate?0:600);
  }
  async function refreshDrafts694K(){
    try{
      const entries=(await dbOp694K('all')).filter(x=>x.id!==AUTO_ID694K).sort((a,b)=>String(b.updated).localeCompare(String(a.updated)));
      const previous=list694K.value;
      list694K.replaceChildren();
      if(!entries.length){const o=new Option('Žádné uložené ikony','');list694K.add(o);}
      else entries.forEach(item=>{
        const d=new Date(item.updated); const when=Number.isNaN(d.getTime())?'':` · ${d.toLocaleDateString('cs-CZ')}`;
        list694K.add(new Option(`${item.name||'Bez názvu'}${when}`,item.id));
      });
      if(entries.some(x=>x.id===previous))list694K.value=previous;
      else if(currentId694K && entries.some(x=>x.id===currentId694K))list694K.value=currentId694K;
      refreshPicker694W1();
      message694K(`${entries.length} uložených návrhů · pouze v tomto zařízení`);
    }catch(e){message694K('Ukládání v tomto zařízení není dostupné: '+e.message);}
  }
  function applyDraft694K(item,id){
    if(!validDraft694K(item))throw new Error('Uložené tvary nejsou podporované.');
    // Never mutate the persisted object while editing.
    gesture=null;drawing=null;selected=-1;shapes=deepCopy(item.shapes);
    history=[];future=[];sourceIsEdited693T=false;
    activeColor=normalColor(item.activeColor||'currentColor');
    if(Number.isFinite(Number(item.stroke))){stroke.value=String(Math.max(.5,Math.min(4,Number(item.stroke))));
      $('lnSvgStrokeValue693R').textContent=Number(stroke.value).toLocaleString('cs-CZ');}
    if(fill)fill.checked=!!item.fill;
    // 694X: Old drafts have no reference field; they remain fully compatible.
    const savedRef=item.reference;
    if(savedRef && typeof savedRef.data==='string' && /^data:image\/(png|jpeg|webp);base64,/.test(savedRef.data) && savedRef.data.length<=1800000 &&
       [savedRef.opacity,savedRef.scale,savedRef.xOffset,savedRef.yOffset,savedRef.fitWidth,savedRef.fitHeight].every(Number.isFinite)){
      reference694R={...savedRef};
      reference694R.width=savedRef.fitWidth*savedRef.scale;
      reference694R.height=savedRef.fitHeight*savedRef.scale;
      reference694R.x=(24-reference694R.width)/2+savedRef.xOffset;
      reference694R.y=(24-reference694R.height)/2+savedRef.yOffset;
    }else reference694R=null;
    if(typeof syncReferenceControls694X==='function')syncReferenceControls694X();
    nameInput694K.value=String(item.name||'Nová ikona').slice(0,70);
    currentId694K=id===AUTO_ID694K?null:id;
    dirty694K=id===AUTO_ID694K;
    state694K.textContent=dirty694K?'Obnovená kresba':'Uloženo';
    render();
    // Recovery slot reflects the opened current workspace, not an older project.
    queueRecovery694K(true);
  }
  async function allowReplace694K(){
    return !(dirty694K && shapes.length>0) || await confirm694W1('Aktuální návrh má neuložené změny. Opravdu ho nahradit?');
  }
  draftPanel694K.querySelector('[data-save]').addEventListener('click',async()=>{
    if(gesture){message694K('Nejprve dokonči tah na plátně.');return;}
    const name=nameInput694K.value.trim();
    if(!name)return message694K('Napiš název ikony.');
    if(!shapes.length)return message694K('Nejdřív nakresli alespoň jeden tvar.');
    const id=currentId694K||(`svg-${Date.now()}-${Math.random().toString(36).slice(2,8)}`);
    try{
      await enqueueWrite694K(()=>dbOp694K('put',draftData694K(id,name)));
      currentId694K=id;markSaved694K();
      await refreshDrafts694K();list694K.value=id;refreshPicker694W1();
      message694K(`„${name}“ uloženo do tohoto zařízení.`);
      queueRecovery694K();
    }catch(e){message694K('Nepodařilo se uložit. Zkopíruj SVG jako zálohu. '+e.message);}
  });
  draftPanel694K.querySelector('[data-new]').addEventListener('click',async()=>{
    if(!await allowReplace694K())return;
    shapes=[];history=[];future=[];gesture=null;drawing=null;selected=-1;
    currentId694K=null;dirty694K=false;sourceIsEdited693T=false;
    nameInput694K.value='Nová ikona';state694K.textContent='Nový návrh';
    render();queueRecovery694K(true);message694K('Nová prázdná ikona. Dříve uložené návrhy zůstaly zachovány.');
  });
  draftPanel694K.querySelector('[data-open]').addEventListener('click',async()=>{
    const id=list694K.value;
    if(!id)return message694K('Vyber návrh ze seznamu.');
    if(!await allowReplace694K())return;
    try{
      const item=await dbOp694K('get',id);
      if(!item)throw new Error('Návrh nebyl nalezen.');
      applyDraft694K(item,id);message694K(`Otevřeno: ${item.name}`);
    }catch(e){message694K('Otevření selhalo: '+e.message);}
  });
  draftPanel694K.querySelector('[data-delete]').addEventListener('click',async()=>{
    const id=list694K.value;
    if(!id)return message694K('Nejdřív vyber uložený návrh.');
    const label=list694K.selectedOptions[0]?.textContent||'tento návrh';
    if(!await confirm694W1(`Opravdu odstranit uložený návrh „${label}“?`))return;
    try{
      await enqueueWrite694K(()=>dbOp694K('delete',id));
      if(currentId694K===id){currentId694K=null;onChanged694K();}
      await refreshDrafts694K();message694K('Uložený návrh odstraněn. Aktuální kresba zůstala nedotčená.');
    }catch(e){message694K('Odstranění selhalo: '+e.message);}
  });
  recoveryBtn694K.addEventListener('click',async()=>{
    if(!lastAuto694K)return message694K('Obnovovací kresba není dostupná.');
    if(!await allowReplace694K())return;
    try{applyDraft694K(lastAuto694K,AUTO_ID694K);message694K('Poslední rozpracovaná kresba obnovena.');}
    catch(e){message694K('Obnova selhala: '+e.message);}
  });
  nameInput694K.addEventListener('input',()=>{if(shapes.length){dirty694K=true;state694K.textContent='Neuložený název';queueRecovery694K();}});
  // Recoverable state is offered on demand, never silently overwrites drawing.
  async function initDrafts694K(){
    if(draftReady694K)return;
    draftReady694K=true;
    try{
      const autosaved=await dbOp694K('get',AUTO_ID694K);
      if(autosaved && validDraft694K(autosaved) && autosaved.shapes.length){
        lastAuto694K=autosaved;recoveryBtn694K.hidden=false;
      }
      await refreshDrafts694K();
    }catch(e){message694K('Lokální úložiště není dostupné; používej Kopírovat SVG jako zálohu.');}
  }
  function flushRecovery694K(){
    if(!dirty694K)return;
    if(recoveryTimer694K!==null){clearTimeout(recoveryTimer694K);recoveryTimer694K=null;}
    const data=draftData694K(AUTO_ID694K,nameInput694K.value.trim()||'Rozpracovaná ikona');
    // Schedule an immediate IndexedDB write (rather than a timer after pagehide).
    enqueueWrite694K(()=>dbOp694K('put',data)).catch(()=>{});
  }
  window.addEventListener('pagehide',flushRecovery694K);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)flushRecovery694K();});
  open.addEventListener('click',()=>{if(home.hidden||modal.hidden)return;home.hidden=true;view.hidden=false;render();initDrafts694K();});
  back.addEventListener('click',()=>{view.hidden=true;home.hidden=false;});
  new MutationObserver(()=>{if(modal.hidden){view.hidden=true;home.hidden=false;}}).observe(modal,{attributes:true,attributeFilter:['hidden']});
  // 694V: mirror copy reflects the selected vector object around the canvas center.
  // Typical use: draw one half of a symmetric icon, then create the second half.
  function mirrorClone694V(shape, axis) {
    const base=affine694H(shape);
    if(!base)return null;
    const [a,b,c,d,x,y]=matrixFromAffine694V(base);
    const values=axis==='horizontal'
      ? [a,-b,c,-d,x,24-y]
      : [-a,b,-c,d,24-x,y];
    const next=matrixAffine694V(values);
    if(!next)return null;
    const clone=deepCopy(shape);
    assignAffine694H(clone,next);
    return clone;
  }

  // 694N: duplicate and layering operate only on the selected vector object.
  // They modify the existing shapes array, preserving SVG attributes and transforms.
  const objectActions694N=document.createElement('div');
  objectActions694N.id='lnSvgObjectActions694N';
  objectActions694N.className='lnSvgObjectActions694N';
  objectActions694N.hidden=true;
  objectActions694N.innerHTML='<button type="button" data-layer="duplicate">⧉ Duplikovat</button><button type="button" data-layer="mirror-x">↔ Zrc. kopie</button><button type="button" data-layer="mirror-y">↕ Zrc. kopie</button><button type="button" data-layer="front">↑ Dopředu</button><button type="button" data-layer="back">↓ Dozadu</button>';
  const canvasBoard694N=svg.closest('.lnSvgStudioBoard');
  canvasBoard694N?.insertAdjacentElement('beforebegin',objectActions694N);
  objectActions694N.addEventListener('click',e=>{
    const button=e.target.closest('button[data-layer]');
    if(!button||button.disabled||selected<0||selected>=shapes.length)return;
    const action=button.dataset.layer;
    const before=snapshot();
    if(action==='duplicate'){
      const clone=deepCopy(shapes[selected]);
      const t=affine694H(clone);
      if(t){ setOffset(clone,t.x+0.85,t.y+0.85); }
      else {
        // Keep unfamiliar imported transform untouched rather than risk corrupting it.
        announce('Tento importovaný transform zatím nelze bezpečně duplikovat.');return;
      }
      shapes.splice(selected+1,0,clone);
      selected+=1;
    } else if(action==='mirror-x' || action==='mirror-y'){
      const clone=mirrorClone694V(shapes[selected], action==='mirror-y'?'horizontal':'vertical');
      if(!clone){
        announce('Tento importovaný transform zatím nelze bezpečně zrcadlit.');return;
      }
      shapes.splice(selected+1,0,clone);
      selected+=1;
    } else if(action==='front' && selected < shapes.length-1){
      [shapes[selected],shapes[selected+1]]=[shapes[selected+1],shapes[selected]];
      selected+=1;
    } else if(action==='back' && selected>0){
      [shapes[selected],shapes[selected-1]]=[shapes[selected-1],shapes[selected]];
      selected-=1;
    } else return;
    record(before);render();
    announce(
      action==='duplicate'?'Objekt duplikován.':
      action==='mirror-x'?'Zrcadlová kopie vytvořena podle svislé osy středu.':
      action==='mirror-y'?'Zrcadlová kopie vytvořena podle vodorovné osy středu.':
      action==='front'?'Objekt posunut dopředu.':'Objekt posunut dozadu.'
    );
  });
  // 694L: Compact workbench. Reparent live controls instead of cloning them.
  // Production icons, shape engine, gesture listeners and IndexedDB remain untouched.
  const board694L=svg.closest('.lnSvgStudioBoard');
  if(board694L){
    // The guide belongs at the very end, not above the drawing surface.
    view.appendChild(guide693U);
    const intro694L=view.querySelector(':scope > p');
    if(intro694L)intro694L.classList.add('lnSvgIntro694L');
    panInfo693W.classList.add('lnSvgHiddenHint694L');

    // Occasional technical settings are accessible, but do not consume the workspace.
    const options694L=document.createElement('details');
    options694L.className='lnSvgOptions694L';
    options694L.innerHTML='<summary>⚙ Nastavení kreslení</summary><div class="lnSvgOptionsBody694L"></div>';
    const optionsBody694L=options694L.querySelector('.lnSvgOptionsBody694L');
    const centerOption694M=document.createElement('label');
    centerOption694M.className='lnSvgCenterOption694M';
    centerOption694M.innerHTML='<input type="checkbox" checked> Zobrazit střed plátna';
    centerOption694M.querySelector('input').addEventListener('change',e=>{showCenter694M=e.target.checked;render();});
    optionsBody694L.appendChild(centerOption694M);
    const snapOption694U=document.createElement('div');
    snapOption694U.className='lnSvgSnapOption694U';
    snapOption694U.innerHTML=`<label><input data-snap-on type="checkbox"> Přichytávat k mřížce</label>
      <label>Krok <select data-snap-step aria-label="Krok přichytávání">
        <option value="2" selected>2 (větší)</option>
        <option value="1">1 (běžný)</option>
        <option value="0.5">0,5 (jemný)</option>
      </select></label>
      <small>Konce tvarů a body zapadnou na mřížku; vybraný objekt se přichytí středem. Tužka kreslí volně.</small>`;
    const snapToggle694U=snapOption694U.querySelector('[data-snap-on]');
    const snapStepSelect694U=snapOption694U.querySelector('[data-snap-step]');
    snapStepSelect694U.disabled=true;
    snapToggle694U.addEventListener('change',()=>{
      snapGrid694U=snapToggle694U.checked;
      snapStepSelect694U.disabled=!snapGrid694U;
      render();
      announce(snapGrid694U?'Přichytávání zapnuto.':'Přichytávání vypnuto.');
    });
    snapStepSelect694U.addEventListener('change',()=>{
      const step=Number(snapStepSelect694U.value);
      if(![.5,1,2].includes(step))return;
      gridStep694U=step;render();
    });
    optionsBody694L.appendChild(snapOption694U);
    const mainTools694L=view.querySelector('.lnSvgStudioTools');
    const diag694L=view.querySelector('.lnSvgPanDiag693Z, .lnSvgPanDiagnostics693Z, details[data-pan-diagnostic], details.lnSvgDiag693Z');
    for(const item of [arcControls694F,mainTools694L,rotateControls694J,smoothBar693V,diag694L]){
      if(item)optionsBody694L.appendChild(item);
    }
    // Keep frequently used color and zoom controls visible immediately above the tool grid.
    const palette694L=view.querySelector('.lnSvgStudioColor693S');
    if(palette694L)palette694L.insertAdjacentElement('beforebegin',options694L);
    else board694L.insertAdjacentElement('beforebegin',options694L);

    // The third row delegates to already tested buttons and their existing handlers.
    // No second undo stack and no second save implementation.
    const actions694L=[
      ['↶','Zpět',()=>undoBtn.click(),'lnSvgUndo693R'],
      ['↷','Vpřed',()=>redoBtn?.click(),'lnSvgRedo693S'],
      ['⊞','Vše',()=>$('lnSvgCenterAll693S')?.click()],
      ['◎','Vybraný',()=>$('lnSvgCenterSelected693S')?.click()],
      ['⌫','Vymazat',async()=>{if(shapes.length && await confirm694W1('Opravdu vymazat celou kresbu?'))$('lnSvgClear693R')?.click();}],
      ['▤','Uložit',()=>draftPanel694K.querySelector('[data-save]')?.click()],
      ['⋯','Více',()=>{const d=$('lnSvgMore694L');if(d){d.open=!d.open;if(d.open)d.scrollIntoView({block:'nearest'});}}]
    ];
    actions694L.forEach(([symbol,label,callback,originalId])=>{
      const b=document.createElement('button');b.type='button';
      b.className='lnSvgQuickAction694L';b.setAttribute('aria-label',label);
      b.innerHTML='<span aria-hidden="true"></span><small></small>';
      b.querySelector('span').textContent=symbol;b.querySelector('small').textContent=label;
      b.addEventListener('click',callback);
      if(originalId)b.dataset.mirrorDisabled=originalId;
      toolBar693W.appendChild(b);
    });
    toolBar693W.classList.add('lnSvgToolGrid694L');
    toolBar693W.setAttribute('aria-label','Nástroje a rychlé akce – tři řady');

    // 694W3: Files and advanced code are different workflows. Keep the original
    // buttons in the DOM (the proven handlers and quick toolbar proxy them),
    // but don't duplicate Undo, Redo or Center inside Import/Export.
    const more694L=document.createElement('details');more694L.id='lnSvgMore694L';
    more694L.className='lnSvgMore694L';
    more694L.innerHTML='<summary>📁 SVG soubory a export</summary><div class="lnSvgMoreBody694L"></div>';
    const moreBody694L=more694L.querySelector('.lnSvgMoreBody694L');
    const legacyEdit694W3=$('lnSvgCenterAll693S')?.closest('.lnSvgStudioActions');
    if(legacyEdit694W3){
      legacyEdit694W3.classList.add('lnSvgLegacyEdit694W3');
      legacyEdit694W3.hidden=true;
      moreBody694L.appendChild(legacyEdit694W3);
    }
    const codePanel694W3=document.createElement('details');
    codePanel694W3.className='lnSvgCode694W3';
    codePanel694W3.innerHTML='<summary>⌘ SVG kód · pokročilé</summary><div class="lnSvgCodeBody694W3"></div>';
    const codeBody694W3=codePanel694W3.querySelector('.lnSvgCodeBody694W3');
    const codeCopyRow694W3=$('lnSvgCopy693R')?.closest('.lnSvgStudioActions');
    if(codeCopyRow694W3)codeBody694W3.appendChild(codeCopyRow694W3);
    const source694L=view.querySelector('.lnSvgStudioSource');
    if(source694L)codeBody694W3.appendChild(source694L);
    const sourceButtons694W3=$('lnSvgImport693R')?.closest('.lnSvgStudioActions');
    if(sourceButtons694W3)codeBody694W3.appendChild(sourceButtons694W3);
    const sourceActions694L=view.querySelector('.lnSvgTextTools693U');
    if(sourceActions694L)codeBody694W3.appendChild(sourceActions694L);
    moreBody694L.appendChild(codePanel694W3);
    const status694L=$('lnSvgMessage693R');
    if(status694L)status694L.insertAdjacentElement('beforebegin',more694L);
    else draftPanel694K.insertAdjacentElement('afterend',more694L);
    // Sync disabled states after the original render, without modifying its logic.
    const observer694L=new MutationObserver(()=>{
      toolBar693W.querySelectorAll('[data-mirror-disabled]').forEach(b=>{
        b.disabled=!!$(b.dataset.mirrorDisabled)?.disabled;
      });
    });
    observer694L.observe(undoBtn,{attributes:true,attributeFilter:['disabled']});
    if(redoBtn)observer694L.observe(redoBtn,{attributes:true,attributeFilter:['disabled']});
  }

  // 694P: Export clean SVG vectors to PNG (independent of canvas grid, viewport and preview).
  // PNG uses only the exported shapes; no editing, guides, or background bitmap.
  const pngPanel694P=document.createElement('details');
  pngPanel694P.className='lnSvgPng694P';
  pngPanel694P.setAttribute('aria-label','Export ikony do PNG');
  pngPanel694P.innerHTML=`<summary>🖼 Export PNG <small>volitelné</small></summary><div class="lnSvgPngBody694W3">
    <div class="lnSvgPngControls694P">
      <label>Velikost <select data-png-size>
        <option value="24">24 × 24</option><option value="48">48 × 48</option>
        <option value="64">64 × 64</option><option value="96">96 × 96</option>
        <option value="128">128 × 128</option><option value="256" selected>256 × 256</option>
        <option value="512">512 × 512</option><option value="1024">1024 × 1024</option>
        <option value="custom">Vlastní…</option></select></label>
      <label data-png-custom-wrap hidden>Rozměr (px) <input data-png-custom type="number" min="24" max="2048" step="1" value="256" inputmode="numeric"></label>
      <label>Pozadí <select data-png-bg><option value="transparent">Průhledné</option><option value="color">Barevné</option></select></label>
      <label data-png-color-wrap hidden>Barva <input data-png-color type="color" value="#ffffff"></label>
      <button type="button" data-png-export>Uložit PNG</button>
    </div><small data-png-status role="status">Exportuje se jen samotná ikona, bez mřížky a vodítek.</small></div>`;
  const pngParent694P=document.getElementById('lnSvgMore694L')?.querySelector('.lnSvgMoreBody694L');
  if(pngParent694P)pngParent694P.insertBefore(pngPanel694P,pngParent694P.querySelector('.lnSvgCode694W3'));
  else view.append(pngPanel694P);
  const pngSize694P=pngPanel694P.querySelector('[data-png-size]');
  const pngCustom694P=pngPanel694P.querySelector('[data-png-custom]');
  const pngBg694P=pngPanel694P.querySelector('[data-png-bg]');
  const pngColor694P=pngPanel694P.querySelector('[data-png-color]');
  const pngButton694P=pngPanel694P.querySelector('[data-png-export]');
  const pngStatus694P=pngPanel694P.querySelector('[data-png-status]');
  pngSize694P.addEventListener('change',()=>pngPanel694P.querySelector('[data-png-custom-wrap]').hidden=pngSize694P.value!=='custom');
  pngBg694P.addEventListener('change',()=>pngPanel694P.querySelector('[data-png-color-wrap]').hidden=pngBg694P.value!=='color');
  function pngFilename694P(size){
    const name=(draftPanel694K.querySelector('[data-draft-name]')?.value || 'luba-ikona')
      .trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,56)||'luba-ikona';
    return `${name}-${size}.png`;
  }
  async function exportPng694P(){
    if(pngButton694P.disabled)return;
    const size=pngSize694P.value==='custom'?Number(pngCustom694P.value):Number(pngSize694P.value);
    if(!Number.isInteger(size)||size<24||size>2048){pngStatus694P.textContent='Rozměr musí být celé číslo 24–2048 px.';return;}
    if(!shapes.length){pngStatus694P.textContent='Nejdřív nakresli ikonu.';return;}
    pngButton694P.disabled=true;pngStatus694P.textContent='Připravuji PNG…';
    let url=null;
    try{
      const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
      const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas není dostupný');
      if(pngBg694P.value==='color'){
        ctx.fillStyle=pngColor694P.value;ctx.fillRect(0,0,size,size);
      }
      // 'currentColor' must be resolved explicitly: SVG loaded as Image doesn't inherit app CSS.
      const computed=getComputedStyle(svg).color;
      const actualColor=/^rgba?\(/.test(computed)?computed:'#ffffff';
      const clean=exportSvg().replace('<svg ',`<svg width="${size}" height="${size}" color="${actualColor}" `);
      const svgBlob=new Blob([clean],{type:'image/svg+xml;charset=utf-8'});
      url=URL.createObjectURL(svgBlob);
      const img=new Image();
      await new Promise((resolve,reject)=>{
        img.onload=resolve;img.onerror=()=>reject(new Error('Nelze vykreslit SVG do PNG'));
        img.src=url;
      });
      ctx.drawImage(img,0,0,size,size);
      URL.revokeObjectURL(url);url=null;
      const pngBlob=await new Promise((resolve,reject)=>{
        try{canvas.toBlob(b=>b?resolve(b):reject(new Error('Převod do PNG selhal')),'image/png');}
        catch(err){reject(err);}
      });
      const fname=pngFilename694P(size);
      // 694Q: Android APK uses its native create-document picker (the same
      // saving experience as LubaNote backups). Never claim a download succeeded
      // after a WebView anchor click.
      const nativePng694Q=window.Capacitor?.Plugins?.LubaNotePngExport;
      if(window.Capacitor?.isNativePlatform?.()){
        if(!nativePng694Q?.ulozPng){
          throw new Error('Nativní ukládání PNG není v této APK dostupné. Aktualizuj Android build.');
        }
        const base64=await new Promise((resolve,reject)=>{
          const reader=new FileReader();
          reader.onload=()=>resolve(String(reader.result||'').split(',')[1]||'');
          reader.onerror=()=>reject(new Error('Příprava PNG pro Android selhala.'));
          reader.readAsDataURL(pngBlob);
        });
        const result=await nativePng694Q.ulozPng({nazevSouboru:fname,base64});
        if(result?.saved){
          pngStatus694P.textContent=`PNG ${size} × ${size} úspěšně uloženo do zvolené složky.`;
        }else if(result?.canceled){
          pngStatus694P.textContent='Ukládání PNG zrušeno.';
        }else{
          throw new Error('Android nepotvrdil uložení PNG.');
        }
        return;
      }
      // Web/browser fallback: native browser download or sharing.
      if(navigator.canShare && navigator.share){
        const file=new File([pngBlob],fname,{type:'image/png'});
        if(navigator.canShare({files:[file]})){
          try {await navigator.share({files:[file],title:fname});pngStatus694P.textContent=`PNG ${size} × ${size} předáno ke sdílení/uložení.`;return;}
          catch(e){if(e?.name==='AbortError'){pngStatus694P.textContent='Export zrušen.';return;}}
        }
      }
      const outUrl=URL.createObjectURL(pngBlob);
      const a=document.createElement('a');a.href=outUrl;a.download=fname;
      a.style.display='none';document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(outUrl),60000);
      pngStatus694P.textContent=`PNG ${size} × ${size}: odeslán požadavek ke stažení ${fname}.`;
    }catch(e){pngStatus694P.textContent=`Export PNG se nepovedl: ${e?.message||e}`;}
    finally{if(url)URL.revokeObjectURL(url);pngButton694P.disabled=false;}
  }
  pngButton694P.addEventListener('click',exportPng694P);

  // 694W: Real SVG files. Android uses the native document picker, not WebView download.
  const svgFileBar694W=document.createElement('div');
  svgFileBar694W.className='lnSvgFileBar694W';
  const svgFileTitle694W3=document.createElement('div');
  svgFileTitle694W3.className='lnSvgFileTitle694W3';
  svgFileTitle694W3.innerHTML='<strong>SVG soubory</strong><small>Vektorové soubory pro uložení a pokračování v úpravách</small>';
  svgFileBar694W.appendChild(svgFileTitle694W3);
  const saveFile694W=document.createElement('button');saveFile694W.type='button';saveFile694W.textContent='Uložit SVG soubor';
  const openFile694W=document.createElement('button');openFile694W.type='button';openFile694W.textContent='Otevřít SVG soubor';
  const fileStatus694W=document.createElement('small');fileStatus694W.setAttribute('role','status');
  svgFileBar694W.append(saveFile694W,openFile694W,fileStatus694W);
  const moreFiles694W3=document.querySelector('#lnSvgMore694L .lnSvgMoreBody694L');
  if(moreFiles694W3)moreFiles694W3.insertAdjacentElement('afterbegin',svgFileBar694W);
  else $('lnSvgCopy693R').parentElement.appendChild(svgFileBar694W);
  const nativeSvg694W=()=>window.Capacitor?.Plugins?.LubaNoteSvgFile;
  const isNative694W=()=>!!window.Capacitor?.isNativePlatform?.();
  saveFile694W.addEventListener('click',async()=>{
    saveFile694W.disabled=true;
    try {
      const svgText=exportSvg();
      const fname='lubanote-ikona.svg';
      if(isNative694W()){
        if(!nativeSvg694W()?.ulozSvg)throw Error('Aktualizuj APK pro nativní SVG export.');
        const r=await nativeSvg694W().ulozSvg({svg:svgText,nazevSouboru:fname});
        fileStatus694W.textContent=r?.saved?'SVG skutečně uloženo.':r?.canceled?'Ukládání zrušeno.':'Uložení nebylo potvrzeno.';
      }else{
        const url=URL.createObjectURL(new Blob([svgText],{type:'image/svg+xml'}));
        const a=document.createElement('a');a.href=url;a.download=fname;document.body.appendChild(a);a.click();a.remove();
        setTimeout(()=>URL.revokeObjectURL(url),60000);
        fileStatus694W.textContent='Prohlížeči byl předán požadavek ke stažení SVG.';
      }
    }catch(e){fileStatus694W.textContent='Export SVG: '+(e?.message||e);}
    finally{saveFile694W.disabled=false;}
  });
  const inputSvg694W=document.createElement('input');inputSvg694W.type='file';inputSvg694W.accept='.svg,image/svg+xml';inputSvg694W.hidden=true;
  svgFileBar694W.appendChild(inputSvg694W);
  function applyFileSvg694W(text){
    if(text.length>100000)throw Error('SVG přesahuje limit importu 100 kB.');
    // Reuse the existing validated SVG importer and its undo/history handling.
    const oldSource=source.value,oldEdited=sourceIsEdited693T;
    source.value=text;sourceIsEdited693T=true;
    importButton693T.click();
    // The existing importer reports validation errors without changing the drawing.
    // Keep imported source visible for inspection and correction.
    fileStatus694W.textContent='Soubor předán SVG importéru; zkontroluj výsledek nad plátnem.';
  }
  inputSvg694W.addEventListener('change',async()=>{
    const file=inputSvg694W.files?.[0];if(!file)return;
    try{if(file.size>100000)throw Error('SVG přesahuje limit 100 kB.');applyFileSvg694W(await file.text());}
    catch(e){fileStatus694W.textContent='Import SVG: '+(e?.message||e);}
    finally{inputSvg694W.value='';}
  });
  openFile694W.addEventListener('click',async()=>{
    if(!isNative694W()){inputSvg694W.click();return;}
    openFile694W.disabled=true;
    try{
      if(!nativeSvg694W()?.otevriSvg)throw Error('Aktualizuj APK pro nativní SVG import.');
      const r=await nativeSvg694W().otevriSvg();
      if(r?.canceled){fileStatus694W.textContent='Otevírání zrušeno.';return;}
      if(typeof r?.svg!=='string')throw Error('Android nevrátil SVG soubor.');
      applyFileSvg694W(r.svg);
    }catch(e){fileStatus694W.textContent='Import SVG: '+(e?.message||e);}
    finally{openFile694W.disabled=false;}
  });

  // 694O: Single actual-size SVG preview + read-only fullscreen viewer.
  // Reuse the existing enlarged preview SVG (render() already refreshes it),
  // never modify shapes, SVG export, tool state, or drawing viewport.
  const previewArea694O=preview?.closest('.lnSvgStudioPreviewArea693S');
  const tinyPreviewBlock694O=preview?.closest('.lnSvgPreviewBlock693S');
  if(previewArea694O && tinyPreviewBlock694O && previewLarge){
    const formerLargeBlock694O=previewLarge.closest('.lnSvgPreviewBlock693S');
    const viewer694O=document.createElement('div');
    viewer694O.id='lnSvgViewer694O';
    viewer694O.className='lnSvgViewer694O';
    viewer694O.hidden=true;
    viewer694O.setAttribute('role','dialog');
    viewer694O.setAttribute('aria-modal','true');
    viewer694O.setAttribute('aria-label','Náhled SVG přes celou obrazovku');
    viewer694O.innerHTML=`<div class="lnSvgViewerTop694O">
      <strong>Náhled ikony</strong><output data-preview-zoom>100 %</output>
      <button type="button" data-preview-close aria-label="Zavřít náhled">✕ Zavřít</button>
    </div><div class="lnSvgViewerBody694O"></div>
    <div class="lnSvgViewerBottom694O">
      <button type="button" data-preview-out aria-label="Oddálit">−</button>
      <button type="button" data-preview-reset>Celá ikona</button>
      <button type="button" data-preview-in aria-label="Přiblížit">+</button>
    </div>`;
    document.body.appendChild(viewer694O); // outside transformed Admin modal
    const viewerBody694O=viewer694O.querySelector('.lnSvgViewerBody694O');
    viewerBody694O.appendChild(previewLarge);
    formerLargeBlock694O?.remove();
    previewArea694O.classList.add('lnSvgOnePreview694O');
    tinyPreviewBlock694O.classList.add('lnSvgPreviewTrigger694O');
    tinyPreviewBlock694O.setAttribute('role','button');
    tinyPreviewBlock694O.setAttribute('tabindex','0');
    tinyPreviewBlock694O.setAttribute('aria-label','Dvojitým klepnutím otevřít náhled přes celou obrazovku');
    const hint694O=tinyPreviewBlock694O.querySelector('small');
    if(hint694O) hint694O.textContent='24 × 24 · dvojtap pro fullscreen';

    const viewerZoomText694O=viewer694O.querySelector('[data-preview-zoom]');
    const limit694O=(v,min,max)=>Math.max(min,Math.min(max,v));
    let viewerZoom694O=1,viewerX694O=0,viewerY694O=0;
    const activeTouches694O=new Map();
    let pinch694O=null,single694O=null,lastTap694O=null;
    let oldBodyOverflow694O='';
    function updateViewer694O(){
      const size=24/viewerZoom694O;
      viewerX694O=limit694O(viewerX694O,0,24-size);
      viewerY694O=limit694O(viewerY694O,0,24-size);
      previewLarge.setAttribute('viewBox',`${viewerX694O} ${viewerY694O} ${size} ${size}`);
      viewerZoomText694O.textContent=`${Math.round(viewerZoom694O*100)} %`;
    }
    function zoomViewer694O(next, anchor=null){
      const rect=previewLarge.getBoundingClientRect(), before=24/viewerZoom694O;
      const fracX=anchor&&rect.width ? limit694O((anchor.x-rect.left)/rect.width,0,1):.5;
      const fracY=anchor&&rect.height ? limit694O((anchor.y-rect.top)/rect.height,0,1):.5;
      const atX=viewerX694O+fracX*before, atY=viewerY694O+fracY*before;
      viewerZoom694O=limit694O(next,1,12);
      const after=24/viewerZoom694O;
      viewerX694O=atX-fracX*after;viewerY694O=atY-fracY*after;
      updateViewer694O();
    }
    function resetViewer694O(){
      viewerZoom694O=1;viewerX694O=0;viewerY694O=0;updateViewer694O();
    }
    function showViewer694O(){
      if(!viewer694O.hidden)return;
      lastTap694O=null;
      viewer694O.hidden=false;
      oldBodyOverflow694O=document.body.style.overflow;
      document.body.style.overflow='hidden';
      resetViewer694O();
      viewer694O.querySelector('[data-preview-close]').focus({preventScroll:true});
    }
    function closeViewer694O(){
      if(viewer694O.hidden)return;
      viewer694O.hidden=true;
      document.body.style.overflow=oldBodyOverflow694O;
      activeTouches694O.clear();pinch694O=null;single694O=null;
      tinyPreviewBlock694O.focus({preventScroll:true});
    }
    let lastPreviewTap694O=null;
    tinyPreviewBlock694O.addEventListener('pointerup',e=>{
      if(e.pointerType==='mouse')return;
      const now=performance.now();
      if(lastPreviewTap694O && now-lastPreviewTap694O.time<430 &&
         Math.hypot(e.clientX-lastPreviewTap694O.x,e.clientY-lastPreviewTap694O.y)<42){
        lastPreviewTap694O=null;showViewer694O();
      }else lastPreviewTap694O={time:now,x:e.clientX,y:e.clientY};
    });
    tinyPreviewBlock694O.addEventListener('dblclick',e=>{e.preventDefault();showViewer694O();});
    tinyPreviewBlock694O.addEventListener('keydown',e=>{
      if(e.key==='Enter'||e.key===' '){e.preventDefault();showViewer694O();}
    });
    viewer694O.querySelector('[data-preview-close]').addEventListener('click',closeViewer694O);
    viewer694O.querySelector('[data-preview-in]').addEventListener('click',()=>zoomViewer694O(viewerZoom694O*1.5));
    viewer694O.querySelector('[data-preview-out]').addEventListener('click',()=>zoomViewer694O(viewerZoom694O/1.5));
    viewer694O.querySelector('[data-preview-reset]').addEventListener('click',resetViewer694O);
    // Double tap outside? Close only via the explicit close button/Escape.
    document.addEventListener('keydown',e=>{
      if(!viewer694O.hidden && (e.key==='Escape'||e.key==='Backspace')){
        e.preventDefault();closeViewer694O();
      }
    },true);
    back.addEventListener('click',closeViewer694O);
    new MutationObserver(()=>{if(modal.hidden||view.hidden)closeViewer694O();})
      .observe(modal,{attributes:true,attributeFilter:['hidden']});

    function centerOfTouches694O(){
      const v=[...activeTouches694O.values()];
      return {x:(v[0].x+v[1].x)/2,y:(v[0].y+v[1].y)/2,
        distance:Math.max(1,Math.hypot(v[0].x-v[1].x,v[0].y-v[1].y))};
    }
    function initTouches694O(){
      if(activeTouches694O.size>=2){
        const c=centerOfTouches694O();
        pinch694O={distance:c.distance,zoom:viewerZoom694O,
          center:{x:c.x,y:c.y}};
        single694O=null;
      }else if(activeTouches694O.size===1){
        const p=[...activeTouches694O.values()][0];
        pinch694O=null;
        single694O={x:p.x,y:p.y,panX:viewerX694O,panY:viewerY694O};
      }else{pinch694O=null;single694O=null;}
    }
    previewLarge.addEventListener('pointerdown',e=>{
      if(viewer694O.hidden || e.pointerType==='mouse' && e.button!==0)return;
      e.preventDefault();
      activeTouches694O.set(e.pointerId,{x:e.clientX,y:e.clientY});
      try{previewLarge.setPointerCapture(e.pointerId);}catch(_){}
      initTouches694O();
    });
    previewLarge.addEventListener('pointermove',e=>{
      if(!activeTouches694O.has(e.pointerId))return;
      e.preventDefault();
      activeTouches694O.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(activeTouches694O.size>=2 && pinch694O){
        const c=centerOfTouches694O();
        // Use the midpoint as an anchor so the image stays under the fingers.
        const target=pinch694O.zoom*c.distance/pinch694O.distance;
        zoomViewer694O(target,{x:c.x,y:c.y});
      }else if(single694O && viewerZoom694O>1){
        const rect=previewLarge.getBoundingClientRect(),size=24/viewerZoom694O;
        if(!rect.width||!rect.height)return;
        viewerX694O=single694O.panX-(e.clientX-single694O.x)*size/rect.width;
        viewerY694O=single694O.panY-(e.clientY-single694O.y)*size/rect.height;
        updateViewer694O();
      }
    });
    function endTouch694O(e){
      if(!activeTouches694O.has(e.pointerId))return;
      activeTouches694O.delete(e.pointerId);
      try{if(previewLarge.hasPointerCapture(e.pointerId))previewLarge.releasePointerCapture(e.pointerId);}catch(_){}
      initTouches694O();
    }
    previewLarge.addEventListener('pointerup',endTouch694O);
    previewLarge.addEventListener('pointercancel',endTouch694O);
    previewLarge.addEventListener('lostpointercapture',endTouch694O);
    window.addEventListener('blur',()=>{activeTouches694O.clear();pinch694O=null;single694O=null;});
  }
  // 694R: local raster reference for manual vector tracing.
  const refPanel694R=document.createElement('details');
  refPanel694R.className='lnSvgReference694R';
  // 694T: LubaNote-style compact layout with fine positioning of the reference.
  refPanel694R.innerHTML=`<summary>🖼 Podklad pro obkreslení</summary>
    <div class="lnSvgRefBody694R">
      <label class="lnSvgRefFile694T"><span>Obrázek PNG / JPG / WebP</span><input type="file" accept="image/png,image/jpeg,image/webp" data-ref-file></label>
      <label class="lnSvgRefShow694T"><input type="checkbox" data-ref-show checked> Zobrazit podklad</label>
      <div class="lnSvgRefRow694T"><label for="lnSvgRefOpacity694T">Průhlednost</label><input id="lnSvgRefOpacity694T" type="range" min="0" max="100" value="35" data-ref-opacity><output data-ref-opacity-value>35 %</output></div>
      <div class="lnSvgRefRow694T"><label for="lnSvgRefScale694T">Velikost</label><input id="lnSvgRefScale694T" type="range" min="20" max="300" value="100" data-ref-scale><output data-ref-scale-value>100 %</output></div>
      <div class="lnSvgRefPrecision694T"><label><input type="checkbox" data-ref-fine checked> Jemný posun</label><small data-ref-mode>Rozsah ±4</small></div>
      <div class="lnSvgRefMoveRow694T"><label for="lnSvgRefX694T">Vodorovně</label><button type="button" data-ref-nudge="x:-" aria-label="Podklad doleva">−</button><input id="lnSvgRefX694T" type="range" min="-4" max="4" step=".01" value="0" data-ref-x><button type="button" data-ref-nudge="x:+" aria-label="Podklad doprava">+</button><output data-ref-x-value>0,00</output></div>
      <div class="lnSvgRefMoveRow694T"><label for="lnSvgRefY694T">Svisle</label><button type="button" data-ref-nudge="y:-" aria-label="Podklad nahoru">−</button><input id="lnSvgRefY694T" type="range" min="-4" max="4" step=".01" value="0" data-ref-y><button type="button" data-ref-nudge="y:+" aria-label="Podklad dolů">+</button><output data-ref-y-value>0,00</output></div>
      <div class="lnSvgRefButtons694R"><button type="button" data-ref-center>Vycentrovat</button><button type="button" data-ref-remove>Odebrat podklad</button></div>
      <small data-ref-status role="status">Podklad je jen pomůcka k obkreslování, není součástí exportu.</small>
    </div>`;
  // 694W1: ignore stray click synthesis after canvas pointer gestures.
  // A genuine tap starts on the summary; a ghost click from the canvas does not.
  const refSummary694W1=refPanel694R.querySelector('summary');
  let summaryArmed694W1=false;
  refSummary694W1.addEventListener('pointerdown',()=>{summaryArmed694W1=true;});
  refSummary694W1.addEventListener('pointercancel',()=>{summaryArmed694W1=false;});
  refSummary694W1.addEventListener('click',event=>{
    if(event.detail>0 && !summaryArmed694W1){event.preventDefault();event.stopPropagation();}
    summaryArmed694W1=false;
  });
  const refAnchor694R=svg.closest('.lnSvgStudioBoard');
  refAnchor694R?.insertAdjacentElement('beforebegin',refPanel694R);
  const refField694R=name=>refPanel694R.querySelector(`[data-ref-${name}]`);
  const refStatus694R=refField694R('status');
  // 694T: Fine sliders move only eight SVG units across their full width;
  // broad mode retains the original +/-24 range. Switching mode reanchors
  // sliders around their CURRENT values, never jumps the reference.
  const fineRef694T=refField694R('fine');
  const positionText694T=v=>Number(v).toLocaleString('cs-CZ',{minimumFractionDigits:2,maximumFractionDigits:2});
  function configureRange694T(fine){
    for(const key of ['x','y']){
      const input=refField694R(key);
      const current=Number(input.value);
      const min=fine?Math.max(-24,current-4):-24;
      const max=fine?Math.min(24,current+4):24;
      input.min=String(min);input.max=String(max);
      input.step='.01';
      input.value=String(current);
    }
    refField694R('mode').textContent=fine?'Jemné doladění':'Velký rozsah ±24';
  }
  function syncReferenceControls694X(){
    const r=reference694R;
    refField694R('show').checked=r?!!r.visible:true;
    refField694R('opacity').value=String(Math.round((r?.opacity??.35)*100));
    refField694R('scale').value=String(Math.round((r?.scale??1)*100));
    for(const axis of ['x','y']){
      const el=refField694R(axis);el.min='-24';el.max='24';el.value=String(r?.[axis+'Offset']??0);
    }
    configureRange694T(fineRef694T.checked);
    for(const key of ['opacity','scale','x','y']){
      const value=refField694R(key).value;
      refField694R(key+'-value').textContent=key==='x'||key==='y'?positionText694T(value):value+' %';
    }
    refField694R('file').value='';
    refStatus694R.textContent=r?'Podklad obnoven společně s návrhem.':'Bez podkladového obrázku.';
  }
  function referenceChanged694X(){onChanged694K();}
  function refreshReference694R(){
    if(!reference694R)return;
    const r=reference694R;
    r.visible=refField694R('show').checked;
    r.opacity=Number(refField694R('opacity').value)/100;
    r.scale=Number(refField694R('scale').value)/100;
    r.xOffset=Number(refField694R('x').value);
    r.yOffset=Number(refField694R('y').value);
    r.width=r.fitWidth*r.scale;r.height=r.fitHeight*r.scale;
    r.x=(24-r.width)/2+r.xOffset;r.y=(24-r.height)/2+r.yOffset;
    for(const key of ['opacity','scale','x','y']){
      const value=refField694R(key).value;
      refField694R(key+'-value').textContent=key==='x'||key==='y'?positionText694T(value):value+' %';
    }
    render();referenceChanged694X();
  }
  for(const key of ['show','opacity','scale','x','y'])refField694R(key).addEventListener('input',refreshReference694R);
  fineRef694T.addEventListener('change',()=>configureRange694T(fineRef694T.checked));
  refPanel694R.querySelectorAll('[data-ref-nudge]').forEach(button=>button.addEventListener('click',()=>{
    const [axis,direction]=button.dataset.refNudge.split(':');
    const input=refField694R(axis);
    // 0.10 SVG units ~ 1.4 screen pixels at normal 340px canvas size.
    const delta=fineRef694T.checked ? 0.10 : 0.50;
    const next=Number(input.value)+(direction==='+'?delta:-delta);
    input.value=String(Math.max(Number(input.min),Math.min(Number(input.max),Math.round(next*100)/100)));
    refreshReference694R();
  }));
  configureRange694T(true);
  refField694R('center').addEventListener('click',()=>{
    for(const key of ['x','y']){const input=refField694R(key);input.min='-24';input.max='24';input.value='0';}
    refField694R('scale').value='100';
    configureRange694T(fineRef694T.checked);refreshReference694R();
  });
  refField694R('remove').addEventListener('click',()=>{
    reference694R=null;refField694R('file').value='';render();referenceChanged694X();
    refStatus694R.textContent='Podklad odebrán. Vektorové tvary zůstaly nedotčené.';
  });
  refField694R('file').addEventListener('change',async e=>{
    const f=e.target.files?.[0];if(!f)return;
    if(!['image/png','image/jpeg','image/webp'].includes(f.type)||f.size>8*1024*1024){
      refStatus694R.textContent='Vyber PNG, JPG nebo WebP do 8 MB.';return;
    }
    try{
      const data=await new Promise((resolve,reject)=>{
        const reader=new FileReader();reader.onload=()=>resolve(reader.result);
        reader.onerror=()=>reject(new Error('Soubor nelze přečíst'));
        reader.readAsDataURL(f);
      });
      const picture=new Image();
      await new Promise((resolve,reject)=>{picture.onload=resolve;picture.onerror=()=>reject(new Error('Neplatný obrázek'));picture.src=data;});
      const w=picture.naturalWidth,h=picture.naturalHeight;
      if(!w||!h||w*h>24000000)throw new Error('Příliš velký obrázek (max. 24 Mpx)');
      // 694X: Store a compact local copy, not the original multi-megabyte photo.
      const factor=Math.min(1,1024/Math.max(w,h));
      const bitmap=document.createElement('canvas');
      bitmap.width=Math.max(1,Math.round(w*factor));bitmap.height=Math.max(1,Math.round(h*factor));
      const ctx=bitmap.getContext('2d');if(!ctx)throw new Error('Nelze připravit podklad');
      ctx.drawImage(picture,0,0,bitmap.width,bitmap.height);
      let compact=bitmap.toDataURL('image/webp',.78);
      if(!compact.startsWith('data:image/webp;'))compact=bitmap.toDataURL('image/png');
      if(compact.length>1800000)throw new Error('Podklad je pro bezpečné uložení příliš velký. Zmenši obrázek.');
      const fitScale=Math.min(24/w,24/h);
      const fitWidth=w*fitScale,fitHeight=h*fitScale;
      reference694R={data:compact,visible:true,opacity:.35,scale:1,xOffset:0,yOffset:0,fitWidth,fitHeight,width:fitWidth,height:fitHeight,x:0,y:0};
      refField694R('show').checked=true;refField694R('opacity').value='35';
      refField694R('scale').value='100';
      for(const key of ['x','y']){const input=refField694R(key);input.min='-24';input.max='24';input.value='0';}
      configureRange694T(fineRef694T.checked);refreshReference694R();
      refStatus694R.textContent='Podklad načten: '+f.name+'. Kresli nástrojem Tužka nebo tvary přes obrázek.';
    }catch(err){refStatus694R.textContent='Nepodařilo se načíst podklad: '+(err?.message||err);}
  });

  render();
})();
