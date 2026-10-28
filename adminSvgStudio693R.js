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
  const validTools694B = new Set(['pen', 'line', 'circle', 'rect', 'ellipse', 'roundrect', 'move', 'eraser', 'pan', 'arc', 'moon', 'partial-eraser', 'scale', 'nodes', 'rotate', 'bucket']);
  const drawingTools694B = new Set(['pen', 'line', 'circle', 'rect', 'ellipse', 'roundrect', 'move', 'eraser', 'arc', 'moon', 'partial-eraser', 'scale', 'nodes', 'rotate', 'bucket']);
  for (const [value,label] of [['ellipse','⬭ Elipsa'],['roundrect','▢ Zaoblený obdélník'],['bucket','▨ Vyplnit tvar'],['rotate','↻ Otočit objekt'],['nodes','◉ Úprava bodů'],['scale','⤡ Změna velikosti'],['arc','◠ Přesný půlkruh'],['moon','☾ Přesný měsíček'],['partial-eraser','⌁ Částečná guma']]) { if (!Array.from(tool.options).some(o=>o.value===value)) { const o=document.createElement('option');o.value=value;o.textContent=label;tool.appendChild(o); } }
  const color = $('lnSvgColor693S'), themeColor = $('lnSvgThemeColor693S');
  const fill = $('lnSvgFill693S'), preview = $('lnSvgPreview693S'), previewLarge = $('lnSvgPreviewLarge693S');
  if (fill?.parentElement?.classList.contains('lnSvgFillLabel693S')) {
    const textNode=Array.from(fill.parentElement.childNodes).find(n=>n.nodeType===Node.TEXT_NODE);
    if(textNode)textNode.textContent=' Vyplnit uzavřené tvary';
  }
  const notice = $('lnSvgMessage693R'), undoBtn = $('lnSvgUndo693R'), redoBtn = $('lnSvgRedo693S');
  const selectionLabel = $('lnSvgSelection693S');
  const allowed = new Set(['path', 'circle', 'rect', 'line', 'ellipse', 'polyline', 'polygon']);
  const attrs = new Set(['d','cx','cy','r','rx','ry','x','y','x1','x2','y1','y2','width','height','points','stroke-width','stroke-linecap','stroke-linejoin','fill','stroke','transform','opacity']);
  const deepCopy = data => JSON.parse(JSON.stringify(data));
  const clamp = x => Math.max(0, Math.min(24, Math.round(x * 100) / 100));
  const fmt = x => String(Math.round(x * 100) / 100);
  // 695U: precision edits may go beyond the 24×24 export viewport.
  // Do not alter the existing drawing/snap clamp or SVG export viewBox.
  const precisionCoord695U = x => Number.isFinite(x) ? Math.round(Math.max(-10000,Math.min(10000,x))*100)/100 : 0;
  // 695V: existing Studio status is far below the canvas on phones. Mirror
  // feedback as a transient LubaNote-themed status; never create a modal.
  let feedback695V=null;
  const announce = message => {
    if (notice) notice.textContent = message;
    feedback695V?.(message);
  };
  let shapes = [], history = [], future = [], drawing = null, gesture = null, selected = -1;
  let activeColor = 'currentColor';
  let cornerFraction695R = .20; // bezpečný poměr zaoblení 0–50 %
  let activeNode695T=0; // only the active node and its neighbours are rendered
  let joinDraft695X=null; // first endpoint stored for joining another object
  let joinAction695X=null;
  let softCount695Z=1; // affected ANCHORS including the central one: 1/3/5/9/15
  let joystickReady695T=false;
  // 696E: visual-only bulk stroke-width preview; never mutate stored geometry
  // before the user explicitly confirms. Applies a shared ratio so individual
  // stroke-width differences are preserved, with one Undo snapshot on Apply.
  let widthScale696E=1;
  let widthScope696E='all';
  let refreshWidthPanel696E=()=>{};
  const baseWidth696E=shape=>{
    if(!shape||!allowed.has(shape.tag)||shape.props?.stroke==='none')return null;
    const n=Number(shape.props?.['stroke-width']??1.85);
    return Number.isFinite(n)&&n>0&&n<=100? n:null;
  };
  const widthTargets696E=()=>shapes.map((shape,i)=>({shape,i,width:baseWidth696E(shape)}))
    .filter(entry=>entry.width!==null && (widthScope696E==='all'||entry.i===selected));
  const widthNumber696E=n=>String(Number(n.toFixed(3)));
  function widthPreviewShapes696E(){
    if(widthScale696E===1)return shapes;
    const targetIndices=new Set(widthTargets696E().map(item=>item.i));
    if(!targetIndices.size)return shapes;
    return shapes.map((shape,i)=>{
      if(!targetIndices.has(i))return shape;
      const original=baseWidth696E(shape);
      return {...shape,props:{...shape.props,'stroke-width':widthNumber696E(original*widthScale696E)}};
    });
  }

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
  // 696C: Efficient LubaNote icon export. This modifies ONLY the clipboard
  // representation; SVG Studio geometry, history and saved drafts stay intact.
  // LubaIcons.js supplies these presentation attributes on its parent <svg>.
  const lubaDefaults696C = Object.freeze({
    fill:'none',stroke:'currentColor','stroke-width':'1.85',
    'stroke-linecap':'round','stroke-linejoin':'round'
  });
  function exportForLuba696C() {
    const source=shapes.filter(s=>s&&allowed.has(s.tag));
    const output=[];
    let merged=0;
    const opaqueStroke696C=col=>/^(?:currentColor|#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?|[a-zA-Z]{1,20})$/.test(String(col||''));
    function canJoin696C(s) {
      if(s.tag!=='path'||!s.props||typeof s.props.d!=='string')return false;
      const p=s.props;
      // Relative initial moveto would shift after joining separate paths.
      // Filled, translucent or transformed parts might change compositing.
      if(!/^\s*M(?=[\s+\-\d.])/.test(p.d)||p.transform||p.opacity!=null||p.fill!=='none')return false;
      return opaqueStroke696C(p.stroke||'currentColor') && p.stroke!=='none';
    }
    let previous=null;
    for(const shape of source){
      // Copy attributes: never modify the original drawing or undo history.
      const props={...shape.props};
      const style={...props};delete style.d;
      const sig=JSON.stringify(style); // exact ordered attributes (never reorder layers)
      const allowedMerge=canJoin696C(shape);
      if(allowedMerge && previous && previous.mergeable && previous.signature===sig && previous.props.d.length+props.d.length<48000){
        previous.props.d += ' '+props.d.trim();
        merged++;
        continue;
      }
      const item={tag:shape.tag,props,signature:sig,mergeable:allowedMerge};
      output.push(item);previous=item;
    }
    // Remove only values inherited IDENTICALLY from lubaIcons.js parent SVG.
    // Attributes like colors, opacity and line widths that differ are retained.
    const rows=output.map(s=>{
      const p={};
      for(const [key,val] of Object.entries(s.props)){
        if(Object.prototype.hasOwnProperty.call(lubaDefaults696C,key) && String(val)===lubaDefaults696C[key])continue;
        p[key]=val;
      }
      return `  [${JSON.stringify(s.tag)}, ${JSON.stringify(p)}]`;
    });
    const text='[\n'+rows.join(',\n')+'\n]';
    return {text,original:source.length,optimized:output.length,merged,items:output.map(s=>({tag:s.tag,props:s.props}))};
  }
  // 696D – optional export-only geometry simplifier. Original editable shapes,
  // history, local drafts and cloud-sync payloads are NEVER modified.
  // Only absolute M/Q subpaths are approximated; unsupported SVG commands,
  // lines, ellipses, fills and transforms are left completely untouched.
  let optimizationLevel696D=0;
  let scheduleOptimizationPreview696D=()=>{};
  const round696D=n=>{const v=Math.round(n*1000)/1000;return String(Object.is(v,-0)?0:v);};
  function simplifyPath696D(d,tolerance){
    const raw=String(d||'').trim();
    const words=raw.match(/[A-Za-z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g)||[];
    if(!words.length||words.join('').toLowerCase()!==raw.replace(/[\s,]/g,'').toLowerCase())return null;
    const subpaths=[];let pos=0,current=null;
    while(pos<words.length){
      const c=words[pos++];
      if(c==='M' && pos+1<words.length){
        const x=Number(words[pos++]),y=Number(words[pos++]);
        if(!Number.isFinite(x)||!Number.isFinite(y))return null;
        current={start:[x,y],segments:[]};subpaths.push(current);
      }else if(c==='Q' && current && pos+3<words.length){
        const a=words.slice(pos,pos+4).map(Number);pos+=4;
        if(a.some(n=>!Number.isFinite(n)))return null;
        current.segments.push([[a[0],a[1]],[a[2],a[3]]]);
      }else return null;
      if(subpaths.length>500||subpaths.reduce((sum,p)=>sum+p.segments.length,0)>3000)return null;
    }
    if(!subpaths.length)return null;
    let oldCount=0,newCount=0;
    const output=[];
    // Fit a cubic Bezier using chord-length parameterization, with endpoints
    // fixed exactly. Each attempted merge checks all original curve samples.
    function cubicFit(points,first,last){
      const n=last-first;let total=0;const u=[0];
      for(let i=first+1;i<=last;i++){
        total+=Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]);u.push(total);
      }
      if(total<1e-8)return null;
      const p0=points[first],p3=points[last];
      let aa=0,ab=0,bb=0,ax=0,ay=0,bx=0,by=0;
      for(let i=0;i<=n;i++){
        const t=u[i]/total, inv=1-t;
        const a=3*inv*inv*t,b=3*inv*t*t;
        const baseX=inv*inv*inv*p0[0]+t*t*t*p3[0];
        const baseY=inv*inv*inv*p0[1]+t*t*t*p3[1];
        const dx=points[first+i][0]-baseX,dy=points[first+i][1]-baseY;
        aa+=a*a;ab+=a*b;bb+=b*b;ax+=a*dx;ay+=a*dy;bx+=b*dx;by+=b*dy;
      }
      const det=aa*bb-ab*ab;
      if(det<1e-14)return null;
      const c1=[(ax*bb-bx*ab)/det,(ay*bb-by*ab)/det];
      const c2=[(bx*aa-ax*ab)/det,(by*aa-ay*ab)/det];
      if(![...c1,...c2].every(Number.isFinite))return null;
      let worst=0,split=0;
      for(let i=1;i<n;i++){
        const t=u[i]/total,k=1-t;
        const x=k*k*k*p0[0]+3*k*k*t*c1[0]+3*k*t*t*c2[0]+t*t*t*p3[0];
        const y=k*k*k*p0[1]+3*k*k*t*c1[1]+3*k*t*t*c2[1]+t*t*t*p3[1];
        const error=Math.hypot(x-points[first+i][0],y-points[first+i][1]);
        if(error>worst){worst=error;split=i;}
      }
      // Catch a cubic that loops far outside the source polyline: handles
      // are never allowed extreme excursions relative to their segment.
      const bound=Math.max(total*1.6,tolerance*3);
      const outlier=[c1,c2].some(c=>Math.hypot(c[0]-p0[0],c[1]-p0[1])>bound && Math.hypot(c[0]-p3[0],c[1]-p3[1])>bound);
      return {c1,c2,end:p3,worst:outlier?Infinity:worst,split};
    }
    for(const part of subpaths){
      const begin=part.start;
      output.push('M'+round696D(begin[0])+' '+round696D(begin[1]));
      if(!part.segments.length)continue;
      oldCount+=part.segments.length;
      const samples=[begin];let point=begin;
      for(const [control,end] of part.segments){
        for(let i=1;i<=4;i++){
          const t=i/4,k=1-t;
          samples.push([k*k*point[0]+2*k*t*control[0]+t*t*end[0],
                        k*k*point[1]+2*k*t*control[1]+t*t*end[1]]);
        }
        point=end;
      }
      const pending=[[0,part.segments.length]];let ops=0;
      while(pending.length){
        const [start,stop]=pending.pop(),count=stop-start;
        const fit=count>=2?cubicFit(samples,start*4,stop*4):null;
        if(fit&&fit.worst<=tolerance){
          output.push('C'+[...fit.c1,...fit.c2,...fit.end].map(round696D).join(' '));newCount++;continue;
        }
        if(count===1){
          const [ctl,end]=part.segments[start];
          output.push('Q'+[...ctl,...end].map(round696D).join(' '));newCount++;continue;
        }
        const worst=Math.round((fit?.split||count*2)/4),cut=Math.max(start+1,Math.min(stop-1,start+worst));
        pending.push([cut,stop],[start,cut]);
        if(++ops>3500)return null;
      }
    }
    const result=output.join(' ');
    return {d:result,oldCount,newCount};
  }
  function optimizedExport696D(level=optimizationLevel696D){
    const packed=exportForLuba696C();
    const originalQ=(packed.items.map(x=>x.tag==='path'?(x.props.d.match(/Q/g)||[]).length:0)).reduce((a,b)=>a+b,0);
    let beforeQ=0,afterQ=0,optimizedPaths=0;
    const tol=level<=0?0:0.002+Math.pow(level/100,2)*0.105;
    const items=packed.items.map(item=>{
      const props={...item.props};
      if(item.tag==='path' && tol>0 && props.d && props.d.includes('Q')){
        const result=simplifyPath696D(props.d,tol);
        if(result&&result.newCount<result.oldCount&&result.d.length<props.d.length){
          beforeQ+=result.oldCount;afterQ+=result.newCount;
          props.d=result.d;optimizedPaths++;
        }
      }
      return {tag:item.tag,props};
    });
    const rows=items.map(item=>{
      const out={};
      for(const [key,value] of Object.entries(item.props)){
        if(Object.prototype.hasOwnProperty.call(lubaDefaults696C,key)&&String(value)===lubaDefaults696C[key])continue;
        out[key]=value;
      }
      return `  [${JSON.stringify(item.tag)}, ${JSON.stringify(out)}]`;
    });
    const text='[\n'+rows.join(',\n')+'\n]';
    return {text,items,originalQ,afterSegments:originalQ-beforeQ+afterQ,
      optimizedPaths,percent:packed.text.length?Math.round((1-text.length/packed.text.length)*100):0,
      bytesBefore:new Blob([packed.text]).size,bytesAfter:new Blob([text]).size};
  }
  function exportForLuba(){return optimizedExport696D().text;}

  function updatePalette() {
    if (color) color.value = activeColor === 'currentColor' ? '#333333' : activeColor;
    themeColor?.setAttribute('aria-pressed', String(activeColor === 'currentColor'));
    document.querySelectorAll('.lnSvgSwatch693S').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.color === activeColor)));
  }
  function updateSelection() {
    if (selectionLabel) selectionLabel.textContent = (selected < 0 ? 'Žádný vybraný tvar' : `Vybraný tvar ${selected + 1} / ${shapes.length} (${shapes[selected]?.tag || '—'})`) + (joinDraft695X ? ' · Spoj 1/2 uložen' : '');
    if(joystickReady695T)updateJoystick695T();
    // 694N: selection-only actions; keep the canvas area clear otherwise.
    const actions = document.getElementById('lnSvgObjectActions694N');
    if (actions) {
      const valid = selected >= 0 && selected < shapes.length;
      actions.hidden = !valid;
      actions.querySelector('[data-layer="front"]').disabled = !valid || selected === shapes.length - 1;
      actions.querySelector('[data-layer="back"]').disabled = !valid || selected === 0;
      actions.querySelector('[data-layer="to-path"]').disabled = !valid || !['line','circle','ellipse','rect'].includes(shapes[selected]?.tag);
    }
  }
  // 695T: safe node editor. Only actual SVG geometry is modified; never
  // flatten paths, sample/replace curves, or change other shapes.
  // Absolute M/L/Q/C/A/Z paths are supported; unsupported relative/imported
  // commands stay untouched. An arc exposes its endpoint (not its flags).
  const pathArity694I={M:2,L:2,Q:4,C:6,A:7,Z:0};
  function pathNodes694I(shape){
    if(shape?.tag!=='path')return null;
    const d=String(shape.props.d||'').trim();
    const tokens=d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi)||[];
    if(tokens.join('').toLowerCase()!==d.replace(/[\s,]/g,'').toLowerCase())return null;
    const parsed=[],handles=[];let i=0,command=null;
    while(i<tokens.length){
      if(/^[a-zA-Z]$/.test(tokens[i])){
        command=tokens[i++];
        if(!Object.prototype.hasOwnProperty.call(pathArity694I,command))return null;
      }
      if(!command)return null;
      const count=pathArity694I[command];
      if(count===0){parsed.push({cmd:'Z',nums:[]});command=null;continue;}
      if(i+count>tokens.length)return null;
      const values=tokens.slice(i,i+count);
      if(values.some(v=>/^[a-zA-Z]$/.test(v)))return null;
      const nums=values.map(Number);
      if(nums.some(n=>!Number.isFinite(n)))return null;
      if(command==='A' && (nums[0]<=0||nums[1]<=0||![0,1].includes(nums[3])||![0,1].includes(nums[4])))return null;
      const cmd=command==='M'&&parsed.length?'L':command;
      parsed.push({cmd,nums});const segment=parsed.length-1;
      if(cmd==='A')handles.push({segment,coordinate:5,kind:'anchor',x:nums[5],y:nums[6]});
      else for(let k=0;k<count;k+=2)handles.push({segment,coordinate:k,kind:k===count-2?'anchor':'control',x:nums[k],y:nums[k+1]});
      i+=count;if(command==='M')command='L';
      if(parsed.length>3000)return null;
    }
    return parsed.length?{parsed,handles}:null;
  }
  function writeNodes694I(parsed){return parsed.map(part=>part.cmd+(part.nums.length?part.nums.map(fmt).join(' '):'')).join(' ');}
  function shapeNodes695T(shape){
    if(!shape||!affine694H(shape))return null;
    const p=shape.props||{},num=k=>Number(p[k]);
    if(shape.tag==='path'){
      const data=pathNodes694I(shape);return data?.handles.length?{handles:data.handles,data}:null;
    }
    if(shape.tag==='line')return {handles:[
      {kind:'anchor',key:'start',x:num('x1'),y:num('y1')},
      {kind:'anchor',key:'end',x:num('x2'),y:num('y2')} ]};
    if(shape.tag==='circle')return {handles:[
      {kind:'center',key:'center',x:num('cx'),y:num('cy')},
      {kind:'anchor',key:'radius',x:num('cx')+num('r'),y:num('cy')} ]};
    if(shape.tag==='ellipse')return {handles:[
      {kind:'center',key:'center',x:num('cx'),y:num('cy')},
      {kind:'anchor',key:'radius-x',x:num('cx')+num('rx'),y:num('cy')},
      {kind:'anchor',key:'radius-y',x:num('cx'),y:num('cy')+num('ry')} ]};
    if(shape.tag==='rect'){
      const x=num('x'),y=num('y'),w=num('width'),h=num('height');
      const handles=[
        {kind:'anchor',key:'tl',x,y},{kind:'anchor',key:'tr',x:x+w,y},
        {kind:'anchor',key:'br',x:x+w,y:y+h},{kind:'anchor',key:'bl',x,y:y+h}];
      if(Number.isFinite(num('rx'))&&num('rx')>0)handles.push({kind:'control',key:'radius',x:x+num('rx'),y});
      return {handles};
    }
    if(shape.tag==='polyline'||shape.tag==='polygon'){
      const text=String(p.points||'').trim();
      const values=text.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi)||[];
      if(values.length<4||values.length%2||values.join('')!==text.replace(/[\s,]/g,'')||values.length>6000)return null;
      return {handles:Array.from({length:values.length/2},(_,i)=>({kind:'anchor',key:'vertex',index:i,x:Number(values[i*2]),y:Number(values[i*2+1])}))};
    }
    return null;
  }
  function editNode695T(shape,handle,local){
    if(!shape||!handle||![local.x,local.y].every(Number.isFinite))return false;
    const p=shape.props,x=precisionCoord695U(local.x),y=precisionCoord695U(local.y),key=handle.key;
    if(shape.tag==='path'){
      const data=pathNodes694I(shape),part=data?.parsed[handle.segment];
      if(!part||!Number.isInteger(handle.coordinate))return false;
      part.nums[handle.coordinate]=x;part.nums[handle.coordinate+1]=y;
      p.d=writeNodes694I(data.parsed);return true;
    }
    if(shape.tag==='line'){
      const prefix=key==='start'?'1':key==='end'?'2':null;if(!prefix)return false;
      p['x'+prefix]=fmt(x);p['y'+prefix]=fmt(y);return true;
    }
    if(shape.tag==='circle'||shape.tag==='ellipse'){
      const cx=Number(p.cx),cy=Number(p.cy);
      if(key==='center'){p.cx=fmt(x);p.cy=fmt(y);return true;}
      if(key==='radius'&&shape.tag==='circle'){p.r=fmt(Math.max(.01,Math.hypot(x-cx,y-cy)));return true;}
      if(key==='radius-x'&&shape.tag==='ellipse'){p.rx=fmt(Math.max(.01,Math.abs(x-cx)));return true;}
      if(key==='radius-y'&&shape.tag==='ellipse'){p.ry=fmt(Math.max(.01,Math.abs(y-cy)));return true;}
      return false;
    }
    if(shape.tag==='rect'){
      const oldX=Number(p.x),oldY=Number(p.y),oldR=Number(p.rx)||0;
      const right=oldX+Number(p.width),bottom=oldY+Number(p.height);
      if(key==='radius'){
        p.rx=fmt(Math.max(0,Math.min(Math.abs(x-oldX),Number(p.width)/2,Number(p.height)/2)));return true;
      }
      const opposite={tl:[right,bottom],tr:[oldX,bottom],br:[oldX,oldY],bl:[right,oldY]}[key];
      if(!opposite)return false;
      const [ox,oy]=opposite;
      p.x=fmt(Math.min(x,ox));p.y=fmt(Math.min(y,oy));
      p.width=fmt(Math.max(.01,Math.abs(x-ox)));p.height=fmt(Math.max(.01,Math.abs(y-oy)));
      if(oldR>0)p.rx=fmt(Math.min(oldR,Number(p.width)/2,Number(p.height)/2));
      return true;
    }
    if(shape.tag==='polyline'||shape.tag==='polygon'){
      const nums=(String(p.points||'').match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi)||[]).map(Number);
      if(!Number.isInteger(handle.index)||handle.index<0||handle.index*2+1>=nums.length)return false;
      nums[handle.index*2]=x;nums[handle.index*2+1]=y;
      p.points=Array.from({length:nums.length/2},(_,i)=>fmt(nums[2*i])+','+fmt(nums[2*i+1])).join(' ');return true;
    }
    return false;
  }
  // 695Z: Proportional anchor editing (soft selection). Never flatten the
  // path or move unrelated objects. Shape geometry is calculated from an
  // immutable baseline so pointermove cannot accumulate rounding/drift.
  function softWeight695Z(distance,radius){
    if(distance===0)return 1;
    if(radius<=0||distance>radius)return 0;
    return (1+Math.cos(Math.PI*distance/(radius+1)))/2;
  }
  function softAnchorScope695Z(shape,handle,count){
    if(!shape||!handle||handle.kind!=='anchor'||count<=1)return null;
    if(shape.tag==='path'){
      const data=pathNodes694I(shape),parsed=data?.parsed;
      // Reject multi-subpaths, close commands and arcs until we can
      // guarantee their geometric invariants remain intact.
      if(!parsed?.length||parsed[0].cmd!=='M'||parsed.slice(1).some(p=>!['L','Q','C'].includes(p.cmd)))return null;
      const index=handle.segment;
      if(!Number.isInteger(index)||index<0||index>=parsed.length)return null;
      const radius=Math.floor((count-1)/2);
      return {kind:'path',data,center:index,radius};
    }
    if(shape.tag==='polyline'){
      const info=shapeNodes695T(shape);
      if(!info?.handles?.length||!Number.isInteger(handle.index))return null;
      const radius=Math.floor((count-1)/2);
      return {kind:'polyline',center:handle.index,radius,handles:info.handles};
    }
    return null;
  }
  function proportionalGeometry695Z(shape,handle,dx,dy,count){
    if(![dx,dy].every(Number.isFinite)||!dx&&!dy)return null;
    const scope=softAnchorScope695Z(shape,handle,count);
    if(!scope)return null;
    const weight=i=>softWeight695Z(Math.abs(i-scope.center),scope.radius);
    if(scope.kind==='path'){
      const parsed=scope.data.parsed.map(p=>({cmd:p.cmd,nums:[...p.nums]}));
      for(let i=0;i<parsed.length;i++){
        const p=parsed[i],before=weight(i?i-1:i),current=weight(i);
        const move=(k,w)=>{p.nums[k]=precisionCoord695U(p.nums[k]+dx*w);p.nums[k+1]=precisionCoord695U(p.nums[k+1]+dy*w);};
        if(p.cmd==='M'||p.cmd==='L')move(0,current);
        else if(p.cmd==='Q'){move(0,(before+current)/2);move(2,current);}
        else if(p.cmd==='C'){move(0,before);move(2,current);move(4,current);}
      }
      return {d:writeNodes694I(parsed)};
    }
    if(scope.kind==='polyline'){
      const pts=scope.handles.map((h,i)=>({x:precisionCoord695U(h.x+dx*weight(i)),y:precisionCoord695U(h.y+dy*weight(i))}));
      return {points:pts.map(p=>fmt(p.x)+','+fmt(p.y)).join(' ')};
    }
    return null;
  }
  function softPreview695Z(){
    if(tool.value!=='nodes'||softCount695Z<=1||selected<0)return [];
    const shape=shapes[selected],info=shapeNodes695T(shape),handle=info?.handles?.[activeNode695T];
    const scope=softAnchorScope695Z(shape,handle,softCount695Z),t=affine694H(shape);
    if(!scope||!t)return [];
    const handles=info.handles;
    const targets=scope.kind==='path'?handles.filter(h=>h.kind==='anchor'):handles;
    return targets.map(h=>{
      const i=scope.kind==='path'?h.segment:h.index;
      return {weight:softWeight695Z(Math.abs(i-scope.center),scope.radius),...world694J(t,h)};
    }).filter(h=>h.weight>.00001);
  }
  function nodePositions694I(){
    if(selected<0)return null;
    const shape=shapes[selected],data=shapeNodes695T(shape),t=affine694H(shape);
    if(!data||!t||!data.handles.length)return null;
    const handles=data.handles.map((h,index)=>({...h,index,...world694J(t,h)}));
    activeNode695T=Math.max(0,Math.min(handles.length-1,activeNode695T));
    return {data,t,handles};
  }
  function nearestNode694I(p){
    const info=nodePositions694I();if(!info)return null;
    const r=svg.getBoundingClientRect(),tol=18*(24/zoom693W)/Math.max(1,r.width);
    let closest=null,best=tol;
    const anchorsOnly=softCount695Z>1 && ['path','polyline'].includes(shapes[selected]?.tag);
    for(const h of info.handles.slice(Math.max(0,activeNode695T-1),activeNode695T+2)){
      if(anchorsOnly&&h.kind!=='anchor')continue;
      const d=Math.hypot(p.x-h.x,p.y-h.y);if(d<best){best=d;closest=h;}
    }
    return closest;
  }
  function chooseClosestNode695T(p){
    const info=nodePositions694I();if(!info)return;
    const anchorsOnly=softCount695Z>1 && ['path','polyline'].includes(shapes[selected]?.tag);
    let best=Infinity,which=0;
    for(const h of info.handles){
      if(anchorsOnly&&h.kind!=='anchor')continue;
      const d=Math.hypot(p.x-h.x,p.y-h.y);if(d<best){best=d;which=h.index;}
    }
    activeNode695T=which;
  }
  function clearJoinDraft695X(){joinDraft695X=null;}
  function isTranslateOnlyAffine695X(t){return !!t && Math.abs((t.s??1)-1)<.000001 && Math.abs(t.angle||0)<.000001 && (t.m||1)===1;}
  function pathCurrentPoint695X(part,current,start){
    if(part.cmd==='M'||part.cmd==='L')return {x:part.nums[0],y:part.nums[1]};
    if(part.cmd==='Q')return {x:part.nums[2],y:part.nums[3]};
    if(part.cmd==='C')return {x:part.nums[4],y:part.nums[5]};
    if(part.cmd==='A')return {x:part.nums[5],y:part.nums[6]};
    if(part.cmd==='Z')return {x:start.x,y:start.y};
    return current;
  }
  function pathIsClosed695X(parsed){return !!parsed?.some?.(part=>part.cmd==='Z');}
  function worldifyParsed695X(parsed,t){
    if(!parsed?.length||!t)return null;
    const hasArc=parsed.some(part=>part.cmd==='A');
    if(hasArc && !isTranslateOnlyAffine695X(t))return null;
    return parsed.map(part=>{
      const out={cmd:part.cmd,nums:[...part.nums]};
      if(part.cmd==='A'){
        const end=world694J(t,{x:part.nums[5],y:part.nums[6]});
        out.nums[5]=precisionCoord695U(end.x);out.nums[6]=precisionCoord695U(end.y);
        return out;
      }
      for(let i=0;i<out.nums.length;i+=2){
        const w=world694J(t,{x:part.nums[i],y:part.nums[i+1]});
        out.nums[i]=precisionCoord695U(w.x);out.nums[i+1]=precisionCoord695U(w.y);
      }
      return out;
    });
  }
  function shapeToJoinableParsed695X(shape){
    if(!shape)return null;
    const t=affine694H(shape);if(!t)return null;
    if(shape.tag==='path'){
      const data=pathNodes694I(shape);if(!data||pathIsClosed695X(data.parsed))return null;
      return worldifyParsed695X(data.parsed,t);
    }
    if(shape.tag==='line'){
      const p=shape.props;
      return worldifyParsed695X([{cmd:'M',nums:[Number(p.x1),Number(p.y1)]},{cmd:'L',nums:[Number(p.x2),Number(p.y2)]}],t);
    }
    if(shape.tag==='polyline'){
      const text=String(shape.props?.points||'').trim();
      const values=(text.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi)||[]).map(Number);
      if(values.length<4||values.length%2)return null;
      const parsed=[{cmd:'M',nums:[values[0],values[1]]}];
      for(let i=2;i<values.length;i+=2)parsed.push({cmd:'L',nums:[values[i],values[i+1]]});
      return worldifyParsed695X(parsed,t);
    }
    return null;
  }
  function endpointInfo695X(){
    if(tool.value!=='nodes' || selected<0 || selected>=shapes.length)return null;
    const shape=shapes[selected],info=shapeNodes695T(shape),t=affine694H(shape);
    if(!info||!t||!info.handles?.length)return null;
    const active=info.handles[activeNode695T];
    if(!active)return null;
    if(shape.tag==='path'){
      const data=pathNodes694I(shape);if(!data||pathIsClosed695X(data.parsed))return null;
      const anchors=info.handles.filter(h=>h.kind==='anchor');
      if(!anchors.length)return null;
      const first=anchors[0],last=anchors[anchors.length-1];
      const endpoint=activeNode695T===info.handles.indexOf(first)?'start':activeNode695T===info.handles.indexOf(last)?'end':null;
      if(!endpoint)return null;
      const w=world694J(t,active);
      return {shapeIndex:selected,endpoint,index:activeNode695T,x:w.x,y:w.y};
    }
    if(shape.tag==='line'){
      const endpoint=active.key==='start'?'start':active.key==='end'?'end':null;
      if(!endpoint)return null;
      const w=world694J(t,active);
      return {shapeIndex:selected,endpoint,index:activeNode695T,x:w.x,y:w.y};
    }
    if(shape.tag==='polyline'){
      const endpoint=activeNode695T===0?'start':activeNode695T===info.handles.length-1?'end':null;
      if(!endpoint)return null;
      const w=world694J(t,active);
      return {shapeIndex:selected,endpoint,index:activeNode695T,x:w.x,y:w.y};
    }
    return null;
  }
  function setPathEndpoint695X(parsed,which,point){
    if(!parsed?.length)return false;
    const x=precisionCoord695U(point.x),y=precisionCoord695U(point.y);
    if(which==='start'){parsed[0].nums[0]=x;parsed[0].nums[1]=y;return true;}
    for(let i=parsed.length-1;i>=0;i--){
      const part=parsed[i];
      if(part.cmd==='Z')continue;
      if(part.cmd==='M'||part.cmd==='L'){part.nums[0]=x;part.nums[1]=y;return true;}
      if(part.cmd==='Q'){part.nums[2]=x;part.nums[3]=y;return true;}
      if(part.cmd==='C'){part.nums[4]=x;part.nums[5]=y;return true;}
      if(part.cmd==='A'){part.nums[5]=x;part.nums[6]=y;return true;}
    }
    return false;
  }
  function pathEndpoints695X(parsed){
    if(!parsed?.length)return null;
    const start={x:parsed[0].nums[0],y:parsed[0].nums[1]};
    let current={...start};
    for(let i=1;i<parsed.length;i++)current=pathCurrentPoint695X(parsed[i],current,start);
    return {start,end:current};
  }
  function reverseParsed695X(parsed){
    if(!parsed?.length||parsed[0].cmd!=='M' || pathIsClosed695X(parsed))return null;
    const start={x:parsed[0].nums[0],y:parsed[0].nums[1]};
    let current={...start};
    const segs=[];
    for(let i=1;i<parsed.length;i++){
      const part=parsed[i],segStart={...current},segEnd=pathCurrentPoint695X(part,current,start);
      segs.push({cmd:part.cmd,start:segStart,nums:[...part.nums]});
      current=segEnd;
    }
    const reversed=[{cmd:'M',nums:[precisionCoord695U(current.x),precisionCoord695U(current.y)]}];
    for(let i=segs.length-1;i>=0;i--){
      const seg=segs[i];
      if(seg.cmd==='L')reversed.push({cmd:'L',nums:[precisionCoord695U(seg.start.x),precisionCoord695U(seg.start.y)]});
      else if(seg.cmd==='Q')reversed.push({cmd:'Q',nums:[precisionCoord695U(seg.nums[0]),precisionCoord695U(seg.nums[1]),precisionCoord695U(seg.start.x),precisionCoord695U(seg.start.y)]});
      else if(seg.cmd==='C')reversed.push({cmd:'C',nums:[precisionCoord695U(seg.nums[2]),precisionCoord695U(seg.nums[3]),precisionCoord695U(seg.nums[0]),precisionCoord695U(seg.nums[1]),precisionCoord695U(seg.start.x),precisionCoord695U(seg.start.y)]});
      else if(seg.cmd==='A')reversed.push({cmd:'A',nums:[seg.nums[0],seg.nums[1],seg.nums[2],seg.nums[3],seg.nums[4]?0:1,precisionCoord695U(seg.start.x),precisionCoord695U(seg.start.y)]});
      else return null;
    }
    return reversed;
  }
  function joinEndpoints695X(a,b){
    const shapeA=shapes[a.shapeIndex],shapeB=shapes[b.shapeIndex];
    const parsedA=shapeToJoinableParsed695X(shapeA),parsedB=shapeToJoinableParsed695X(shapeB);
    if(!parsedA||!parsedB){announce('Spojit lze zatím jen otevřené cesty, úsečky a lomené čáry bez nepodporované transformace.');return false;}
    const orientedA=a.endpoint==='end'?deepCopy(parsedA):reverseParsed695X(parsedA);
    const orientedB=b.endpoint==='start'?deepCopy(parsedB):reverseParsed695X(parsedB);
    if(!orientedA||!orientedB){announce('Tento typ křivky zatím nelze bezpečně obrátit pro spojení.');return false;}
    const endsA=pathEndpoints695X(orientedA),endsB=pathEndpoints695X(orientedB);
    if(!endsA||!endsB){announce('Nepodařilo se určit konce vybraných objektů.');return false;}
    const gap=Math.hypot(endsA.end.x-endsB.start.x,endsA.end.y-endsB.start.y);
    if(gap>3.2){announce('Konce jsou od sebe příliš daleko. Nejprve je přibliž v režimu Body.');return false;}
    const mid={x:(endsA.end.x+endsB.start.x)/2,y:(endsA.end.y+endsB.start.y)/2};
    setPathEndpoint695X(orientedA,'end',mid);setPathEndpoint695X(orientedB,'start',mid);
    const merged=deepCopy(shapeA);
    merged.tag='path';
    merged.props={...shapeA.props,d:writeNodes694I(orientedA.concat(orientedB.slice(1)))};
    delete merged.props.points;delete merged.props.x1;delete merged.props.y1;delete merged.props.x2;delete merged.props.y2;delete merged.props.transform;
    const before=snapshot();
    const target=Math.min(a.shapeIndex,b.shapeIndex),drop=Math.max(a.shapeIndex,b.shapeIndex);
    shapes[target]=merged;shapes.splice(drop,1);selected=target;activeNode695T=0;clearJoinDraft695X();record(before);render();
    announce(gap>.18?'Objekty spojeny. Konce byly jemně srovnány do společného bodu.':'Objekty spojeny do jedné cesty.');
    return true;
  }
  // 695Y: G1 tangent continuity at a selected interior anchor. Preserve
  // all other anchors and the surrounding path; only adjacent controls change.
  function smoothJoinAtNode695Y(shape,handle){
    const data=pathNodes694I(shape);
    if(!data || !handle || handle.kind!=='anchor')return false;
    const parts=data.parsed,idx=handle.segment;
    if(idx<=0 || idx>=parts.length-1 || parts.some(p=>p.cmd==='Z') || parts.slice(1).some(p=>p.cmd==='M'))return false;
    const incoming=parts[idx],outgoing=parts[idx+1];
    if(!['L','Q','C'].includes(incoming.cmd)||!['L','Q','C'].includes(outgoing.cmd))return false;
    const endpoint=part=>part.cmd==='C'?{x:part.nums[4],y:part.nums[5]}:part.cmd==='Q'?{x:part.nums[2],y:part.nums[3]}:{x:part.nums[0],y:part.nums[1]};
    const joint=endpoint(incoming),before=endpoint(parts[idx-1]),after=endpoint(outgoing);
    const d1=Math.hypot(joint.x-before.x,joint.y-before.y),d2=Math.hypot(after.x-joint.x,after.y-joint.y);
    if(d1<.02||d2<.02)return false;
    // Average normalized incoming/outgoing directions; reject a hairpin.
    const ux=(joint.x-before.x)/d1,uy=(joint.y-before.y)/d1;
    const vx=(after.x-joint.x)/d2,vy=(after.y-joint.y)/d2;
    const sx=ux+vx,sy=uy+vy,len=Math.hypot(sx,sy);
    if(len<.15)return false;
    const dx=sx/len,dy=sy/len;
    function cubicFor(part,start){
      const end=endpoint(part);
      if(part.cmd==='C')return [...part.nums];
      if(part.cmd==='Q'){
        const [qx,qy]=part.nums;
        return [start.x+(qx-start.x)*2/3,start.y+(qy-start.y)*2/3,end.x+(qx-end.x)*2/3,end.y+(qy-end.y)*2/3,end.x,end.y];
      }
      return [start.x+(end.x-start.x)/3,start.y+(end.y-start.y)/3,start.x+(end.x-start.x)*2/3,start.y+(end.y-start.y)*2/3,end.x,end.y];
    }
    const left=cubicFor(incoming,before),right=cubicFor(outgoing,joint);
    const oldLeft=Math.hypot(joint.x-left[2],joint.y-left[3]);
    const oldRight=Math.hypot(right[0]-joint.x,right[1]-joint.y);
    const handleLen=Math.min(.9,d1/3,d2/3,Math.max(.12,(oldLeft+oldRight)/2));
    left[2]=joint.x-dx*handleLen;left[3]=joint.y-dy*handleLen;
    right[0]=joint.x+dx*handleLen;right[1]=joint.y+dy*handleLen;
    parts[idx]={cmd:'C',nums:left.map(precisionCoord695U)};
    parts[idx+1]={cmd:'C',nums:right.map(precisionCoord695U)};
    shape.props.d=writeNodes694I(parts);
    return true;
  }
  function selectedSmoothJoinHandle695Y(){
    if(tool.value!=='nodes'||selected<0||shapes[selected]?.tag!=='path')return null;
    const data=pathNodes694I(shapes[selected]);
    const handle=data?.handles[activeNode695T];
    if(!handle || handle.kind!=='anchor'||handle.segment<=0||handle.segment>=data.parsed.length-1)return null;
    if(data.parsed.some(p=>p.cmd==='Z')||!['L','Q','C'].includes(data.parsed[handle.segment].cmd)||!['L','Q','C'].includes(data.parsed[handle.segment+1].cmd))return null;
    return handle;
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
    scheduleOptimizationPreview696D();
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
    const shownWidth696E=widthPreviewShapes696E();
    const visible = [...shownWidth696E.filter(s => s && allowed.has(s.tag)), ...(drawing && allowed.has(drawing.tag) ? [drawing] : [])];
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
        for(const h of info.handles.slice(Math.max(0,activeNode695T-1),activeNode695T+2)){
          const isActive=h.index===activeNode695T;
          const node=svgPart({tag:'circle',props:{cx:fmt(h.x),cy:fmt(h.y),r:fmt((isActive?.48:.28)/zoom693W),fill:isActive?'#ffdf62':h.kind==='control'?'#19ced1':'#ffc247',stroke:isActive?'#0b2634':'#202020','stroke-width':fmt((isActive?.18:.10)/zoom693W)}});
          node.style.pointerEvents='none';svg.appendChild(node);
        }
      }
    }
    // 695Z: visually show which neighbouring anchors will follow the
    // active yellow anchor. Pure canvas overlays; never exported.
    if(tool.value==='nodes' && softCount695Z>1){
      for(const h of softPreview695Z()){
        if(h.weight>.999)continue; // the active node already has a yellow marker
        const marker=svgPart({tag:'circle',props:{cx:fmt(h.x),cy:fmt(h.y),r:fmt((.2+.19*h.weight)/zoom693W),fill:'#2bd7cf',opacity:fmt(.38+.56*h.weight),stroke:'#083445','stroke-width':fmt(.08/zoom693W)}});
        marker.style.pointerEvents='none';svg.appendChild(marker);
      }
    }
    if(tool.value==='nodes' && joinDraft695X){
      const ring=svgPart({tag:'circle',props:{cx:fmt(joinDraft695X.x),cy:fmt(joinDraft695X.y),r:fmt(.55/zoom693W),fill:'none',stroke:'#14d7d1','stroke-width':fmt(.16/zoom693W),opacity:'.95'}});
      ring.style.pointerEvents='none';svg.appendChild(ring);
      const dot=svgPart({tag:'circle',props:{cx:fmt(joinDraft695X.x),cy:fmt(joinDraft695X.y),r:fmt(.18/zoom693W),fill:'#14d7d1',stroke:'#ffffff','stroke-width':fmt(.10/zoom693W)}});
      dot.style.pointerEvents='none';svg.appendChild(dot);
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
      p.replaceChildren(...shownWidth696E.map(svgPart));
    }
    if (!sourceIsEdited693T) source.value = exportSvg();
    undoBtn.disabled = history.length === 0;
    if (redoBtn) redoBtn.disabled = future.length === 0;
    updateSelection(); updatePalette();updateJoinQuick695X?.();refreshWidthPanel696E();
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
  // 696B: All desktop zoom gestures keep the world point UNDER the cursor.
  function zoomAround696B(next, clientX, clientY){
    const rect=svg.getBoundingClientRect();
    if(!rect.width||!rect.height)return;
    const oldExtent=24/zoom693W;
    const u=limit693W((clientX-rect.left)/rect.width,0,1);
    const v=limit693W((clientY-rect.top)/rect.height,0,1);
    const worldX=panX693W+u*oldExtent, worldY=panY693W+v*oldExtent;
    zoom693W=limit693W(next,1,8);
    const extent=24/zoom693W;
    panX693W=worldX-u*extent;panY693W=worldY-v*extent;
    applyView693W();
  }
  let zoomCursor696B=null;
  function zoomDesktop696B(factor){
    const r=svg.getBoundingClientRect();
    const p=zoomCursor696B&&zoomCursor696B.x>=r.left&&zoomCursor696B.x<=r.right&&zoomCursor696B.y>=r.top&&zoomCursor696B.y<=r.bottom
      ?zoomCursor696B:{x:r.left+r.width/2,y:r.top+r.height/2};
    zoomAround696B(zoom693W*factor,p.x,p.y);
  }
  // Mouse wheel zoom is desktop-only and Ctrl-modified, leaving normal scroll
  // and Android's existing two-finger pinch entirely unchanged.
  svg.addEventListener('pointermove',e=>{
    if(e.pointerType==='mouse')zoomCursor696B={x:e.clientX,y:e.clientY};
  },{passive:true});
  svg.addEventListener('wheel',e=>{
    if(!e.ctrlKey||!window.matchMedia('(min-width:900px)').matches||view.hidden)return;
    e.preventDefault();
    const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?svg.clientHeight:1);
    zoomAround696B(zoom693W*Math.exp(-delta*.002),e.clientX,e.clientY);
  },{passive:false});
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
    const filled = fill?.checked && ['circle','rect','ellipse','roundrect'].includes(kind);
    let props;
    if (kind === 'arc' || kind === 'moon') return shapeArc694F(a,b,kind);
    if (kind === 'circle') props = {cx:fmt(a.x),cy:fmt(a.y),r:fmt(Math.hypot(b.x-a.x,b.y-a.y))};
    else if (kind === 'rect' || kind === 'roundrect') {
      const w=Math.abs(b.x-a.x),h=Math.abs(b.y-a.y);
      props={x:fmt(Math.min(a.x,b.x)),y:fmt(Math.min(a.y,b.y)),width:fmt(w),height:fmt(h)};
      if(kind==='roundrect')props.rx=fmt(Math.max(0,Math.min(w,h)*cornerFraction695R));
    } else if(kind==='ellipse') props={cx:fmt(a.x),cy:fmt(a.y),rx:fmt(Math.abs(b.x-a.x)),ry:fmt(Math.abs(b.y-a.y))};
    else if (kind === 'line') props = {x1:fmt(a.x),y1:fmt(a.y),x2:fmt(b.x),y2:fmt(b.y)};
    else return null;
    if (filled) props.fill = activeColor;
    return normalized(kind==='roundrect'?'rect':kind, props);
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
  // 695U: repeatable, non-destructive path smoothing. Reuse the existing
  // absolute path parser (M/L/Q/C); never flatten curves or touch arcs/imports.
  // Each click is one undoable operation. The two end anchors stay fixed.
  function smoothSelectedPath695U(shape){
    if(shape?.tag!=='path')return {reason:'Vyber nejprve ručně kreslenou čáru.'};
    const parsed=pathNodes694I(shape)?.parsed;
    if(!parsed||parsed.length<3||parsed.some((seg,i)=>!['M','L','Q','C'].includes(seg.cmd)||(seg.cmd==='M'&&i!==0)))
      return {reason:'Tuto křivku nelze bezpečně vyhladit. Podporované jsou otevřené cesty M/L/Q/C.'};
    const endpoint=seg=>seg.cmd==='M'||seg.cmd==='L'?0:seg.cmd==='Q'?2:4;
    const anchors=parsed.map(seg=>({x:seg.nums[endpoint(seg)],y:seg.nums[endpoint(seg)+1]}));
    if(anchors.some(p=>![p.x,p.y].every(Number.isFinite)))return {reason:'Neplatné souřadnice křivky.'};
    const deltas=anchors.map((a,i)=>{
      if(i===0||i===anchors.length-1)return {x:0,y:0};
      const prev=anchors[i-1],next=anchors[i+1];
      return {x:.25*(prev.x+next.x-2*a.x),y:.25*(prev.y+next.y-2*a.y)};
    });
    const moved=parsed.map((seg,i)=>({cmd:seg.cmd,nums:[...seg.nums]}));
    for(let i=1;i<moved.length;i++){
      const seg=moved[i],prev=anchors[i-1],curr=anchors[i];
      if(seg.cmd==='Q'){
        // Control point follows both neighbouring anchors, and gently
        // relaxes toward their midpoint (preserving the quadratic topology).
        seg.nums[0]=precisionCoord695U(seg.nums[0]+(deltas[i-1].x+deltas[i].x)/2+.12*((prev.x+curr.x)/2-seg.nums[0]));
        seg.nums[1]=precisionCoord695U(seg.nums[1]+(deltas[i-1].y+deltas[i].y)/2+.12*((prev.y+curr.y)/2-seg.nums[1]));
      }else if(seg.cmd==='C'){
        for(const [j,f,d] of [[0,1/3,deltas[i-1]],[2,2/3,deltas[i]]]){
          seg.nums[j]=precisionCoord695U(seg.nums[j]+d.x+.12*(prev.x+(curr.x-prev.x)*f-seg.nums[j]));
          seg.nums[j+1]=precisionCoord695U(seg.nums[j+1]+d.y+.12*(prev.y+(curr.y-prev.y)*f-seg.nums[j+1]));
        }
      }
      const at=endpoint(seg);seg.nums[at]=precisionCoord695U(curr.x+deltas[i].x);
      seg.nums[at+1]=precisionCoord695U(curr.y+deltas[i].y);
    }
    const d=writeNodes694I(moved);
    if(d===shape.props.d)return {reason:'Křivka už je dostatečně hladká.'};
    return {d};
  }
  // 695V: six intentional levels. Stage is keyed by the exact stored path
  // geometry, so Undo/Redo restores the correct level without extra fields
  // in saved SVG or exported shapes. Edits reset the limit naturally.
  const smoothMax695V=6;
  const smoothLevels695V=new Map(), smoothDone695V=new Set();
  const smoothKey695V=shape=>selected+'\u0001'+String(shape?.props?.d||'');
  const smoothStage695V=shape=>smoothLevels695V.get(smoothKey695V(shape))||0;
  function rememberSmooth695V(shape,stage){
    const key=smoothKey695V(shape);
    smoothLevels695V.set(key,stage);
    // Bound memory even after editing hundreds of paths. Old history remains
    // correct while entries exist; no state ever leaks into the document.
    if(smoothLevels695V.size>240){
      const first=smoothLevels695V.keys().next().value;
      smoothLevels695V.delete(first);smoothDone695V.delete(first);
    }
  }
  const smoothBar693V=document.createElement('div');
  smoothBar693V.className='lnSvgSmooth693V';
  smoothBar693V.innerHTML='<label><input type="checkbox" id="lnSvgAutoSmooth693V" checked> Vyhlazovat volnou čáru</label><button type="button" id="lnSvgSmoothSelected693V">Vyhladit vybraný tah</button>';
  view.querySelector('.lnSvgStudioTools')?.insertAdjacentElement('afterend',smoothBar693V);
  const autoSmooth693V=$('lnSvgAutoSmooth693V');
  $('lnSvgSmoothSelected693V').textContent='Vyhladit vybranou křivku';
  $('lnSvgSmoothSelected693V').addEventListener('click',()=>{
    const shape=shapes[selected],stage=smoothStage695V(shape);
    if(!shape || shape.tag!=='path')return announce('Nejprve vyber křivku, kterou chceš vyhladit.');
    if(stage>=smoothMax695V || smoothDone695V.has(smoothKey695V(shape)))
      return announce('Vyhlazení dokončeno. Další úpravy můžeš vrátit přes Zpět.');
    const result=smoothSelectedPath695U(shape);
    if(!result.d){
      if(result.reason==='Křivka už je dostatečně hladká.')smoothDone695V.add(smoothKey695V(shape));
      updateSmoothQuick695U();
      return announce(result.reason||'Křivka se nezměnila.');
    }
    const before=snapshot();shape.props.d=result.d;
    if(record(before)){
      const next=stage+1;
      rememberSmooth695V(shape,next);
      render();
      announce(next>=smoothMax695V
        ? 'Vyhlazení hotovo (6/6). Další úpravu můžeš vrátit přes Zpět.'
        : `Vyhlazení ${next}/${smoothMax695V}. Dalším klikem bude křivka jemnější.`);
    }
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
  const tools693W=[['ellipse','ellipse','Elipsa'],['roundrect','roundrect','Zaoblený'],['move','mouse-pointer-2','Výběr'],['scale','maximize','Velikost'],['nodes','nodes','Body'],['rotate','rotate-cw','Rotace'],['pen','pencil','Tužka'],['bucket','bucket','Výplň'],['line','minus','Úsečka'],['circle','circle','Kruh'],['rect','square','Obdélník'],['arc','arc','Půlkruh'],['moon','moon','Měsíček'],['eraser','eraser','Guma'],['partial-eraser','partial-eraser','Guma část'],['pan','hand','Posun plátna']];
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
    ellipse:'<ellipse cx="12" cy="12" rx="9" ry="5"/>',
    roundrect:'<rect x="3" y="5" width="18" height="14" rx="4"/>',
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
  controls693W.querySelector('[data-zoom="out"]').addEventListener('click',()=>zoomDesktop696B(1/1.5));
  controls693W.querySelector('[data-zoom="in"]').addEventListener('click',()=>zoomDesktop696B(1.5));
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
      start:['line','rect','circle','ellipse','roundrect','arc','moon'].includes(kind)?snapPoint694U(p):p,originClientX:e.clientX,originClientY:e.clientY,before:snapshot(),rawPath:`M${fmt(p.x)} ${fmt(p.y)}`,points:[p]};
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
        activeNode695T=node.index;
        gesture.node={handle:{...node},transform:affine694H(shapes[selected]),original:deepCopy(shapes[selected]),softCount:softCount695Z};
        announce(softAnchorScope695Z(shapes[selected],node,softCount695Z)
          ?'Proporční posun: hlavní bod táhni, okolní ho budou jemně následovat.'
          :'Vybraný bod '+(activeNode695T+1)+'. Tažením upravíš jeho polohu.');
      }else{
        const previous=selected;selected=hitTest(p);gesture.mode='node-select';
        if(selected!==previous)activeNode695T=0;
        if(selected>=0){chooseClosestNode695T(p);}
        if(selected>=0&&!nodePositions694I())announce('Tento importovaný tvar nemá bezpečně editovatelné body. Originál zůstává beze změny.');
        else announce(selected<0?'Klepni na tvar a zobrazí se jeho body.':'Zobrazen vybraný bod a sousedé. Další body vybereš šipkami ◀ ▶.');
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
      const shape=shapes[g.chosen],z=g.node;
      if(!shape||!z?.transform)return;
      const local=local694J(z.transform,snapPoint694U(p));
      const baseline=local694J(z.transform,z.handle);
      const soft=proportionalGeometry695Z(z.original,z.handle,local.x-baseline.x,local.y-baseline.y,z.softCount);
      if(soft){Object.assign(shape.props,soft);render();return;}
      // Original single-point behaviour remains the fallback for curves,
      // circle/rectangle controls and unsupported path commands.
      if(editNode695T(shape,z.handle,local))render();return;
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
  tool.addEventListener('change',()=>{selected=-1;clearJoinDraft695X();render();announce(tool.value==='eraser'?'Guma maže jednotlivé tvary dotykem.':tool.value==='move'?'Klepni na tvar a přesuň ho tažením.':tool.value==='rotate'?'Vyber objekt a otoč ho žlutým úchytem.':tool.value==='nodes'?'Vyber tvar a uprav jeho aktivní bod nebo přepínej body šipkami.':tool.value==='scale'?'Vyber tvar a uprav velikost rohovým úchytem.':tool.value==='bucket'?'Vyber barvu a klepni dovnitř uzavřeného tvaru.':`Nástroj: ${toolBar693W.querySelector('[data-tool="'+tool.value+'"]')?.getAttribute('aria-label')||tool.value} připraven.`);});
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
  undoBtn.addEventListener('click',()=>{if(!history.length)return;future.push(snapshot());shapes=history.pop();selected=-1;clearJoinDraft695X();render();});
  undoBtn.addEventListener('click',()=>announce('Poslední změna vrácena.'));
  redoBtn?.addEventListener('click',()=>{if(!future.length)return;history.push(snapshot());shapes=future.pop();selected=-1;clearJoinDraft695X();render();});
  redoBtn?.addEventListener('click',()=>announce('Změna znovu provedena.'));
  $('lnSvgClear693R').addEventListener('click',()=>{if(!shapes.length)return;const before=snapshot();shapes=[];selected=-1;clearJoinDraft695X();record(before);render();});
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
  async function copyOptimized696D(){
    const result=optimizedExport696D();
    const copied=await copy(result.text);
    if(copied)announce(`Kód pro LubaNote zkopírován. Křivky: ${result.originalQ} → ${result.afterSegments}, velikost ${Math.round(result.bytesBefore/102.4)/10} → ${Math.round(result.bytesAfter/102.4)/10} kB. Originál nezměněn.`);
  }
  $('lnSvgCopyLuba693R').addEventListener('click',copyOptimized696D);
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
    try {const next=parseLuba693V(source.value),before=snapshot();shapes=next;selected=-1;clearJoinDraft695X();sourceIsEdited693T=false;record(before);render();announce(`Kód LubaNote načten (${next.length} tvarů).`);}
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
      const before=snapshot();shapes=next;selected=-1;clearJoinDraft695X();sourceIsEdited693T=false;record(before);render();announce(`SVG načteno (${next.length} tvarů).`);
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
    <div class="lnSvgDraftRow694K lnSvgDraftOpenRow696EA">
      <select data-drafts aria-label="Uložené ikony"><option value="">Žádné uložené ikony</option></select>
      <button type="button" data-open>Otevřít</button><button type="button" data-delete>Odstranit</button>
    </div>
    <div class="lnSvgDraftRow696A"><button type="button" data-cloud-sync>☁ Synchronizovat</button></div>
    <div class="lnSvgDraftRow694K lnSvgDraftRecover694K"><button type="button" data-recover hidden>↶ Obnovit poslední rozpracovanou kresbu</button></div>
    <small data-draft-message role="status">Návrhy se ukládají lokálně. Tlačítkem Synchronizovat je můžeš přenášet přes LubaServer mezi mobilem a PC.</small>`;
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
  // 696A: cloud metadata is saved only alongside local drafts; never added to exported SVG.
  let cloudRevision696A=0,cloudOwner696A=null;
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
      stroke:stroke.value,fill:!!fill?.checked,reference:reference694R ? {data:reference694R.data,visible:reference694R.visible,opacity:reference694R.opacity,scale:reference694R.scale,xOffset:reference694R.xOffset,yOffset:reference694R.yOffset,fitWidth:reference694R.fitWidth,fitHeight:reference694R.fitHeight}:null,
      cloudRevision:id===currentId694K?cloudRevision696A:0,
      cloudOwner:id===currentId694K?cloudOwner696A:null};
  }
  function validDraft694K(item){
    if(!item||!Array.isArray(item.shapes)||item.shapes.length>800)return false;
    return item.shapes.every(s=>s && allowed.has(s.tag)&&s.props && typeof s.props==='object' &&
      Object.entries(s.props).every(([k,v])=>attrs.has(k)&&['string','number'].includes(typeof v)&&String(v).length<=20000));
  }
  function message694K(value){draftMessage694K.textContent=value;feedback695V?.(value);}
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
      message694K(`${entries.length} místních návrhů · pro PC použij Synchronizovat`);
    }catch(e){message694K('Ukládání v tomto zařízení není dostupné: '+e.message);}
  }
  function applyDraft694K(item,id){
    if(!validDraft694K(item))throw new Error('Uložené tvary nejsou podporované.');
    // Never mutate the persisted object while editing.
    gesture=null;drawing=null;selected=-1;clearJoinDraft695X();shapes=deepCopy(item.shapes);
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
    cloudRevision696A=id===AUTO_ID694K?0:(Number.isSafeInteger(item.cloudRevision)&&item.cloudRevision>0?item.cloudRevision:0);
    cloudOwner696A=id===AUTO_ID694K?null:(typeof item.cloudOwner==='string'?item.cloudOwner:null);
    dirty694K=id===AUTO_ID694K;
    state694K.textContent=dirty694K?'Obnovená kresba':'Uloženo';
    render();
    // Recovery slot reflects the opened current workspace, not an older project.
    queueRecovery694K(true);
  }
  async function allowReplace694K(){
    return !(dirty694K && shapes.length>0) || await confirm694W1('Aktuální návrh má neuložené změny. Opravdu ho nahradit?');
  }
  const saveDraft695V=draftPanel694K.querySelector('[data-save]');
  const quickSave695V=toolBar693W.querySelector('[aria-label="Uložit"]');
  let savingDraft695V=false;
  // 696A: local save is the single source of truth for the editor and cloud push.
  // Nothing is uploaded until IndexedDB confirms this snapshot is saved.
  async function saveCurrentDraft696A(){
    if(savingDraft695V)throw new Error('Ukládání už probíhá, zkus to znovu.');
    if(gesture)throw new Error('Nejprve dokonči tah na plátně.');
    const name=nameInput694K.value.trim();
    if(!name)throw new Error('Napiš název ikony.');
    if(!shapes.length)throw new Error('Nejdřív nakresli alespoň jeden tvar.');
    const id=currentId694K||(`svg-${Date.now()}-${Math.random().toString(36).slice(2,8)}`);
    const draft=draftData694K(id,name);
    savingDraft695V=true;
    saveDraft695V.disabled=true;
    if(quickSave695V)quickSave695V.disabled=true;
    try{
      await enqueueWrite694K(()=>dbOp694K('put',draft));
      currentId694K=id;
      // Do not mark later edits as saved if a draw gesture happened while IndexedDB wrote.
      if(JSON.stringify(snapshot())===JSON.stringify(draft.shapes)&&nameInput694K.value.trim()===name)markSaved694K();
      await refreshDrafts694K();list694K.value=id;refreshPicker694W1();
      queueRecovery694K();
      return draft;
    }finally{
      savingDraft695V=false;saveDraft695V.disabled=false;
      if(quickSave695V)quickSave695V.disabled=false;
    }
  }
  saveDraft695V.addEventListener('click',async()=>{
    message694K('Ukládám návrh…');
    try{
      const draft=await saveCurrentDraft696A();
      message694K(`„${draft.name}“ uloženo do tohoto zařízení.`);
    }catch(e){message694K('Nepodařilo se uložit. Zkopíruj SVG jako zálohu. '+e.message);}
  });
  draftPanel694K.querySelector('[data-new]').addEventListener('click',async()=>{
    if(!await allowReplace694K())return;
    shapes=[];history=[];future=[];gesture=null;drawing=null;selected=-1;clearJoinDraft695X();
    currentId694K=null;dirty694K=false;sourceIsEdited693T=false;
    cloudRevision696A=0;cloudOwner696A=null;
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
      if(currentId694K===id){currentId694K=null;cloudRevision696A=0;cloudOwner696A=null;onChanged694K();}
      await refreshDrafts694K();message694K('Uložený návrh odstraněn. Aktuální kresba zůstala nedotčená.');
    }catch(e){message694K('Odstranění selhalo: '+e.message);}
  });
  recoveryBtn694K.addEventListener('click',async()=>{
    if(!lastAuto694K)return message694K('Obnovovací kresba není dostupná.');
    if(!await allowReplace694K())return;
    try{applyDraft694K(lastAuto694K,AUTO_ID694K);message694K('Poslední rozpracovaná kresba obnovena.');}
    catch(e){message694K('Obnova selhala: '+e.message);}
  });
  // 696A: Explicit, manual, two-way SVG draft transport. LubaServer is the
  // active Supabase-compatible backend (never a second cloud endpoint).
  // Local drafts always remain authoritative until the user explicitly chooses
  // which revision to publish/open. No background writes or implicit merges.
  const syncButton696A=draftPanel694K.querySelector('[data-cloud-sync]');
  let syncBusy696A=false;
  const cloudTable696A='lubanote_svg_drafts_696a';
  const cloudRpc696A='lubanote_svg_draft_push_696a';
  function serverError696A(error){
    const code=String(error?.code||'');
    const msg=String(error?.message||error||'Neznámá chyba');
    if(code==='42P01'||code==='42883'||code==='PGRST202'||code==='PGRST205'||/does not exist|schema cache/i.test(msg))
      return 'Na LubaServeru ještě není nainstalována SQL migrace 696A pro SVG návrhy.';
    if(code==='42501'||code==='PGRST301'||/permission denied|jwt expired/i.test(msg))
      return 'Server odmítl přístup. Zkontroluj přihlášení a oprávnění SVG úložiště.';
    return msg.slice(0,220);
  }
  async function cloudSession696A(){
    if(!navigator.onLine)throw new Error('Jsi offline. Návrh zůstává bezpečně uložený v zařízení.');
    const backend=window.LubaNoteBackendConfig?.nactiAktivniProfil?.();
    if(backend?.typ!=='supabase-selfhosted')
      throw new Error('Pro SVG návrhy je povolena pouze synchronizace přes vlastní LubaServer, nikoli cloudový backend.');
    if(typeof getCurrentUser!=='function')throw new Error('Přihlašování ještě není připravené.');
    const user=await getCurrentUser();
    if(!user?.id||typeof supabaseClient==='undefined'||!supabaseClient)
      throw new Error('Pro synchronizaci se přihlas do stejného účtu LubaNote na mobilu i PC.');
    if(window.LubaNoteSupabase?.jeAktivniUcetPotvrzenProTentoBeh?.()!==true)
      throw new Error('Pro přenos návrhů nejprve dokonči ověření přihlášeného účtu.');
    return {client:supabaseClient,user};
  }
  function cloudDocument696A(draft){
    const {cloudRevision,cloudOwner,...doc}=draft;
    if(!validDraft694K(doc))throw new Error('Návrh není bezpečně uložitelný na server.');
    if(JSON.stringify(doc).length>2300000)throw new Error('Návrh je pro server příliš velký (maximálně cca 2 MB včetně referenčního obrázku).');
    return doc;
  }
  const newDraftId696A=()=>`svg-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
  async function cloudPush696A(){
    const {client,user}=await cloudSession696A();
    // Always save the complete edit-ready snapshot LOCALLY before sending it.
    message694K('Ukládám lokální zálohu před odesláním…');
    const draft=await saveCurrentDraft696A();
    if(draft.cloudOwner && draft.cloudOwner!==user.id)
      throw new Error('Tento místní návrh patří k jinému účtu. Ulož ho jako novou kopii.');
    const doc=cloudDocument696A(draft);
    message694K('Odesílám SVG návrh na LubaServer…');
    const {data,error}=await client.rpc(cloudRpc696A,{
      p_id:draft.id,p_name:draft.name,p_document:doc,p_expected_revision:draft.cloudRevision||0
    });
    if(error)throw new Error(serverError696A(error));
    if(data?.ok!==true){
      if(data?.reason==='revision_conflict'){
        const choice=await showDialog694W1('Na serveru už je novější nebo jiná verze tohoto návrhu. Místní kresba zůstala nedotčená.',[
          {label:'Uložit moji verzi jako NOVOU serverovou kopii',value:'copy'}
        ],[{label:'Ponechat místní kresbu',value:'cancel'}]);
        if(choice!=='copy')return;
        const copyId=newDraftId696A();
        const copyName=(draft.name.slice(0,60)+' – kopie').slice(0,70);
        const copyDoc={...doc,id:copyId,name:copyName};
        const {data:copyResult,error:copyError}=await client.rpc(cloudRpc696A,{
          p_id:copyId,p_name:copyName,p_document:copyDoc,p_expected_revision:0
        });
        if(copyError)throw new Error(serverError696A(copyError));
        if(copyResult?.ok!==true)throw new Error('Novou serverovou kopii se nepodařilo vytvořit.');
        // Leave active and saved local drafts intact; server copy can be imported by name.
        message694K('Nová serverová kopie byla uložena. Původní místní návrh zůstal beze změny.');
        return;
      }
      throw new Error('Server odmítl zápis: '+String(data?.reason||'neznámý důvod'));
    }
    if(!Number.isSafeInteger(Number(data.revision))||Number(data.revision)<1)
      throw new Error('Server nepotvrdil platné číslo verze. Místní návrh zůstává uložen.');
    const revision=Number(data.revision);
    // Update metadata of the CURRENT local row without rolling back edits made during upload.
    await enqueueWrite694K(async()=>{
      const stored=await dbOp694K('get',draft.id);
      if(stored)await dbOp694K('put',{...stored,cloudRevision:revision,cloudOwner:user.id});
    });
    if(currentId694K===draft.id){cloudRevision696A=revision;cloudOwner696A=user.id;}
    message694K(`„${draft.name}“ synchronizováno na LubaServer (verze ${revision}). Na PC použij Synchronizovat → Otevřít ze serveru.`);
  }
  async function cloudPull696A(){
    const {client,user}=await cloudSession696A();
    message694K('Načítám seznam SVG návrhů z LubaServeru…');
    const {data:rows,error}=await client.from(cloudTable696A)
      .select('id,name,updated_at,revision').eq('user_id',user.id)
      .order('updated_at',{ascending:false}).limit(200);
    if(error)throw new Error(serverError696A(error));
    if(!Array.isArray(rows)||!rows.length){message694K('Na serveru ještě nemáš žádné SVG návrhy. Na mobilu nejdřív použij Synchronizovat → Odeslat.');return;}
    const chosen=await showDialog694W1('Otevřít SVG návrh z LubaServeru',rows.map(row=>{
      const day=new Date(row.updated_at);
      const when=Number.isNaN(day.getTime())?'':` · ${day.toLocaleDateString('cs-CZ')}`;
      return {label:`${String(row.name||'Bez názvu').slice(0,70)}${when} · v${row.revision}`,value:String(row.id)};
    }),[{label:'Zavřít',value:null}]);
    if(!chosen)return;
    const {data:remote,error:readError}=await client.from(cloudTable696A)
      .select('id,name,revision,document').eq('user_id',user.id).eq('id',chosen).single();
    if(readError)throw new Error(serverError696A(readError));
    if(!remote||!validDraft694K(remote.document))throw new Error('Server vrátil neplatný návrh. Místní kresba zůstává beze změny.');
    // Preserving every local version is more important than reducing duplicate names.
    const existing=await dbOp694K('get',remote.id);
    const doc={...remote.document,id:remote.id,name:String(remote.name||'SVG ikona').slice(0,70)};
    const comparable696A=value=>{
      const clean=cloudDocument696A(value);
      return JSON.stringify({name:clean.name,shapes:clean.shapes,activeColor:clean.activeColor,
        stroke:clean.stroke,fill:clean.fill,reference:clean.reference});
    };
    const sameContent=existing && comparable696A(existing)===comparable696A(doc);
    const fork=!!existing&&!sameContent;
    const id=fork?newDraftId696A():remote.id;
    const name=fork?(doc.name.slice(0,49)+' – ze serveru').slice(0,70):doc.name;
    const imported={...doc,id,name,cloudRevision:fork?0:Number(remote.revision)||0,cloudOwner:fork?null:user.id,
      updated:new Date().toISOString()};
    if(!validDraft694K(imported))throw new Error('Návrh není možné importovat.');
    if(!await allowReplace694K())return;
    // Ensure remote snapshot exists as a local backup BEFORE replacing canvas.
    await enqueueWrite694K(()=>dbOp694K('put',imported));
    applyDraft694K(imported,id);
    await refreshDrafts694K();list694K.value=id;refreshPicker694W1();
    message694K(fork?`„${name}“ otevřeno jako nová místní kopie. Tvoje starší kresba zůstala zachována.`:`„${name}“ staženo z LubaServeru a připraveno k úpravám.`);
  }
  syncButton696A.addEventListener('click',async()=>{
    if(syncBusy696A)return;
    const action=await showDialog694W1('Synchronizace SVG návrhů přes LubaServer',[
      {label:'↑ Odeslat aktuální návrh na server',value:'push'},
      {label:'↓ Otevřít návrh ze serveru',value:'pull'}
    ],[{label:'Zavřít',value:null}]);
    if(!action)return;
    syncBusy696A=true;syncButton696A.disabled=true;
    try{
      if(action==='push')await cloudPush696A();
      else if(action==='pull')await cloudPull696A();
    }catch(error){
      message694K('Synchronizace se nepovedla: '+String(error?.message||error).slice(0,230));
    }finally{syncBusy696A=false;syncButton696A.disabled=false;}
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
  objectActions694N.innerHTML='<button type="button" data-layer="duplicate">⧉ Duplikovat</button><button type="button" data-layer="mirror-x">↔ Zrc. kopie</button><button type="button" data-layer="mirror-y">↕ Zrc. kopie</button><button type="button" data-layer="front">↑ Dopředu</button><button type="button" data-layer="back">↓ Dozadu</button><button type="button" data-layer="to-path">◉ Více bodů</button>';
  const canvasBoard694N=svg.closest('.lnSvgStudioBoard');
  canvasBoard694N?.insertAdjacentElement('beforebegin',objectActions694N);
  // 696B: Explicit, undoable conversion. Primitives keep their old exact
  // geometry until the user asks for independently editable path nodes.
  // We preserve styling and transform; no implicit flattening on selection.
  function toPath696B(shape){
    if(!shape||!['line','circle','ellipse','rect'].includes(shape.tag)||!affine694H(shape))return null;
    const p=shape.props, n=k=>Number(p[k]);
    let d='';
    const num=v=>fmt(v);
    if(shape.tag==='line'){
      const x1=n('x1'),y1=n('y1'),x2=n('x2'),y2=n('y2');
      if(![x1,y1,x2,y2].every(Number.isFinite))return null;
      d=`M${num(x1)} ${num(y1)}L${num((x1+x2)/2)} ${num((y1+y2)/2)}L${num(x2)} ${num(y2)}`;
    }else if(shape.tag==='circle'||shape.tag==='ellipse'){
      const cx=n('cx'),cy=n('cy'),rx=shape.tag==='circle'?n('r'):n('rx'),ry=shape.tag==='circle'?n('r'):n('ry');
      if(![cx,cy,rx,ry].every(Number.isFinite)||rx<=0||ry<=0)return null;
      const segments=8, step=Math.PI*2/segments, k=4/3*Math.tan(step/4);
      d=`M${num(cx+rx)} ${num(cy)}`;
      for(let i=0;i<segments;i++){
        const a=i*step,b=(i+1)*step;
        const ax=cx+rx*Math.cos(a),ay=cy+ry*Math.sin(a);
        const bx=cx+rx*Math.cos(b),by=cy+ry*Math.sin(b);
        d+=`C${num(ax-k*rx*Math.sin(a))} ${num(ay+k*ry*Math.cos(a))} `+
           `${num(bx+k*rx*Math.sin(b))} ${num(by-k*ry*Math.cos(b))} ${num(bx)} ${num(by)}`;
      }
      d+='Z';
    }else{
      const x=n('x'),y=n('y'),w=n('width'),h=n('height');
      if(![x,y,w,h].every(Number.isFinite)||w<=0||h<=0)return null;
      const rx=Math.min(Math.max(0,n('rx')||0),w/2),ry=Math.min(Math.max(0,n('ry')||rx),h/2);
      if(rx>0&&ry>0){
        // Rounded corners: 4 cubic quarter arcs, straight-edge endpoints.
        const k=4/3*Math.tan(Math.PI/8);
        d=`M${num(x+rx)} ${num(y)}L${num(x+w-rx)} ${num(y)}`+
          `C${num(x+w-rx+k*rx)} ${num(y)} ${num(x+w)} ${num(y+ry-k*ry)} ${num(x+w)} ${num(y+ry)}`+
          `L${num(x+w)} ${num(y+h-ry)}`+
          `C${num(x+w)} ${num(y+h-ry+k*ry)} ${num(x+w-rx+k*rx)} ${num(y+h)} ${num(x+w-rx)} ${num(y+h)}`+
          `L${num(x+rx)} ${num(y+h)}`+
          `C${num(x+rx-k*rx)} ${num(y+h)} ${num(x)} ${num(y+h-ry+k*ry)} ${num(x)} ${num(y+h-ry)}`+
          `L${num(x)} ${num(y+ry)}`+
          `C${num(x)} ${num(y+ry-k*ry)} ${num(x+rx-k*rx)} ${num(y)} ${num(x+rx)} ${num(y)}Z`;
      }else{
        d=`M${num(x)} ${num(y)}L${num(x+w/2)} ${num(y)}L${num(x+w)} ${num(y)}`+
          `L${num(x+w)} ${num(y+h/2)}L${num(x+w)} ${num(y+h)}`+
          `L${num(x+w/2)} ${num(y+h)}L${num(x)} ${num(y+h)}`+
          `L${num(x)} ${num(y+h/2)}Z`;
      }
    }
    const props={...p,d};
    for(const key of ['cx','cy','r','rx','ry','x','y','width','height','x1','y1','x2','y2'])delete props[key];
    return {tag:'path',props};
  }
  objectActions694N.addEventListener('click',e=>{
    const button=e.target.closest('button[data-layer]');
    if(!button||button.disabled||selected<0||selected>=shapes.length)return;
    const action=button.dataset.layer;
    const before=snapshot();
    if(action==='to-path'){
      const converted=toPath696B(shapes[selected]);
      if(!converted){announce('Tento tvar není možné bezpečně převést na body.');return;}
      const convertedIndex=selected;
      shapes[convertedIndex]=converted;activeNode695T=0;
      // Tool-change deliberately clears selection; restore it only afterwards.
      tool.value='nodes';tool.dispatchEvent(new Event('change',{bubbles:true}));
      selected=convertedIndex;record(before);render();
      announce('Tvar převeden na upravitelné body. Zpět vrátí původní tvar.');return;
    }
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
      ['▤','Uložit',()=>draftPanel694K.querySelector('[data-save]')?.click()]
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

  // 694Y: safe, isolated SVG Studio regression bridge for the existing AutoTester.
  // Runs real shipped pure helpers on disposable in-memory fixtures; NEVER saves,
  // loads or replaces drafts, touches IndexedDB, dispatches drawing events or
  // invokes Android document pickers. UI gestures and native IO remain NOT_TESTED.
  const svgTests694Y = Object.freeze([
    ['svg694y-mirror-vertical', 'Zrcadlení podle svislé osy'],
    ['svg694y-mirror-horizontal', 'Zrcadlení podle vodorovné osy'],
    ['svg694y-reflected-inverse', 'Zrcadlená matice – obousměrné souřadnice'],
    ['svg694y-affine-invalid', 'Neplatné transformace se odmítají'],
    ['svg694y-scale-rotation', 'Velikost + rotace – přesná matice'],
    ['svg694y-edit-nodes', 'Uzly M/L/Q/C – čtení a zápis'],
    ['svg694y-bucket-closed', 'Kyblíček – jen uzavřený tvar'],
    ['svg694y-grid-step', 'Mřížka – kroky 2 / 1 / 0,5 a vypnutí'],
    ['svg694y-export-vector', 'Export SVG – pouze vektorové tvary'],
    ['svg694y-draft-validation', 'Uložené návrhy – validace tvarů'],
    ['svg694y-draft-snapshot', 'Návrh + podklad – sestavení kopie v RAM'],
    ['svg694y-color-safety', 'Bezpečná validace barvy'],
    ['svg695t-shape-nodes', 'Body všech základních tvarů'],
    ['svg695t-dense-nodes', 'Hustá křivka – výběr jednotlivých bodů'],
    ['svg695t-precision-edit', 'Jemná úprava bodu bez změny ostatních dat'],
    ['svg695z-soft-three', 'Proporční posun 3 bodů – sousedé ustupují'],
    ['svg695z-soft-curves', 'Proporční posun Q/C – zachovat řídicí body'],
    ['svg695z-soft-guard', 'Proporční posun – bezpečné odmítnutí uzavřených cest'],
    ['svg694y-gesture', 'Skutečné kreslení, výběr, posun a pinch'],
    ['svg694y-undo-redo', 'Undo/Redo gest v živém plátně'],
    ['svg694y-native-svg-files', 'Android SVG picker – uložit a načíst'],
    ['svg694y-native-png', 'Android PNG – skutečné pixely a soubor'],
    ['svg694y-indexeddb', 'IndexedDB – skutečné uložení a obnovení']
  ]);
  function runSvgTests694Y(){
    const statusKind='SVG_STUDIO_ISOLATED_694Y';
    const result=[];
    const expected=svgTests694Y;
    const check=(id,fn)=>{
      const test=expected.find(x=>x[0]===id);
      const began=performance.now();
      try{
        const detail=fn();
        result.push({id,name:test[1],kind:statusKind,status:'APP_PASS',ms:Math.round(performance.now()-began),detail:String(detail||'Kontrola produkční funkce na izolovaném tvaru v RAM.')});
      }catch(e){result.push({id,name:test[1],kind:statusKind,status:'APP_FAIL',ms:Math.round(performance.now()-began),detail:String(e?.message||e).slice(0,180)});}
    };
    const assert=(ok,message)=>{if(!ok)throw Error(message)};
    const near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<.0002;
    const fixture=()=>({tag:'line',props:{x1:'2',y1:'4',x2:'8',y2:'7',stroke:'#234567','stroke-width':'1.5'}});
    const pt=(s,x,y)=>world694J(affine694H(s),{x,y});
    // Even a background run must not race an ongoing finger stroke.
    if(gesture||drawing){
      return expected.map(([id,name])=>({id,name,kind:statusKind,status:'APP_BLOCKED',ms:0,detail:'Na SVG plátně probíhá tah; test nedotkne rozpracovaného objektu.'}));
    }
    const oldGrid=snapGrid694U,oldStep=gridStep694U;
    const original=JSON.stringify(shapes);
    const oldReference=reference694R;
    try{
      check('svg694y-mirror-vertical',()=>{
        const s=fixture(),before=JSON.stringify(s),m=mirrorClone694V(s,'vertical');
        assert(m&&JSON.stringify(s)===before,'Originál změněn / kopie nevznikla');
        for(const [x,y] of [[2,4],[8,7]]){const p=pt(m,x,y);assert(near(p.x,24-x)&&near(p.y,y),'Odraz svisle není přes x=12');}
        return 'Originál nedotčen; 2 odlišné body přesně odraženy přes x=12.';
      });
      check('svg694y-mirror-horizontal',()=>{
        const s=fixture(),m=mirrorClone694V(s,'horizontal');
        assert(m,'Nefunguje vytvoření kopie');
        for(const [x,y] of [[2,4],[8,7]]){const p=pt(m,x,y);assert(near(p.x,x)&&near(p.y,24-y),'Odraz vodorovně není přes y=12');}
        return '2 odlišné body přesně odraženy přes y=12.';
      });
      check('svg694y-reflected-inverse',()=>{
        const m=mirrorClone694V(fixture(),'vertical'),t=affine694H(m);
        assert(t&&t.m===-1,'Reflexní determinant se ztratil');
        for(const p of [{x:1.6,y:4.7},{x:10.2,y:9.8}]){
          const w=world694J(t,p),l=local694J(t,w);
          assert(near(l.x,p.x)&&near(l.y,p.y),'Inverzní převod bodů není přesný');
        }
        return 'Determinant < 0; world/local vrací oba původní body.';
      });
      check('svg694y-affine-invalid',()=>{
        assert(affine694H({props:{transform:'rotate(999 2 4)'}})===null,'Neznámý transform přijat');
        assert(affine694H({props:{transform:'matrix(2 0 0 1 0 0)'}})===null,'Nestejnoměrné měřítko přijato');
        assert(affine694H({props:{transform:'matrix(1 1 1 1 0 0)'}})===null,'Singulární matice přijata');
        return '3 nepodporované transformace odmítnuty produkčním parserem.';
      });
      check('svg694y-scale-rotation',()=>{
        const s=fixture(),t={s:1.75,x:3,y:2,angle:Math.PI/3,m:1};
        assignAffine694H(s,t);const out=affine694H(s);
        assert(out&&near(out.s,t.s)&&near(out.x,t.x)&&near(out.y,t.y)&&near(out.angle,t.angle),'Transformace se nepřečetla zpět');
        const w=world694J(out,{x:6,y:5}),l=local694J(out,w);
        assert(near(l.x,6)&&near(l.y,5),'Inverzní převod po otočení/škálování selhal');
        return 'Skutečný matrix transform uložen, načten a obrácen.';
      });
      check('svg694y-edit-nodes',()=>{
        const p={tag:'path',props:{d:'M1 2 L5 6 Q7 8 9 10 C11 12 13 14 15 16'}};
        const nodes=pathNodes694I(p);
        assert(nodes?.parsed.length===4&&nodes.handles.length===7,'Parser bodů/Bezierů vrátil chybnou strukturu');
        const again=pathNodes694I({tag:'path',props:{d:writeNodes694I(nodes.parsed)}});
        assert(again?.handles.length===7,'Přepis uzlů ztratil řídicí body');
        return 'M/L/Q/C, 7 uzlů, 2× parser produkčního Studia.';
      });
      check('svg694y-bucket-closed',()=>{
        const closed={tag:'path',props:{d:'M2 2 L10 2 L10 10 Z'}};
        const openLine={tag:'line',props:{x1:2,y1:2,x2:10,y2:10}};
        const el=svgPart(closed);
        assert(closedFillable694M(closed,el)===true,'Uzavřená cesta nepodporuje výplň');
        assert(closedFillable694M(openLine,svgPart(openLine))===false,'Úsečka je nesprávně vyplnitelná');
        return 'Z-uzavřená cesta ANO, otevřená úsečka NE.';
      });
      check('svg694y-grid-step',()=>{
        snapGrid694U=true;
        for(const [step,input,want] of [[2,3.1,4],[1,3.1,3],[.5,3.3,3.5]]){
          gridStep694U=step;
          assert(near(snapCoord694U(input),want),'Krok mřížky '+step+' přichycuje nesprávně');
        }
        snapGrid694U=false;
        assert(near(snapCoord694U(3.3),3.3),'Vypnutí mřížky neposkytuje volný bod');
        return 'Tři kroky + vypnutí: skutečný snapCoord694U.';
      });
      check('svg694y-export-vector',()=>{
        const content=exportSvg(),doc=new DOMParser().parseFromString(content,'image/svg+xml');
        assert(!doc.querySelector('parsererror'),'Export nemá platnou syntaxi SVG');
        const root=doc.documentElement;
        assert(root.localName==='svg'&&root.getAttribute('viewBox')==='0 0 24 24','Chybí 24×24');
        assert(root.children.length===shapes.filter(s=>s&&allowed.has(s.tag)).length,'Export obsahuje jiný počet tvarů než pracovní model');
        assert(!content.includes('data-reference-694R')&&!content.includes('data-snap-guide-694U')&&!root.querySelector('image'),'Podklad či vodítka unikají do SVG');
        return 'Produkční export aktuální kresby čten pouze z RAM; žádná vodítka/podklad.';
      });
      check('svg694y-draft-validation',()=>{
        const valid={shapes:[fixture()],name:'Izolovaný test'};
        assert(validDraft694K(valid),'Platný lokální návrh odmítnut');
        assert(!validDraft694K({shapes:[{tag:'script',props:{}}]}),'Nebezpečný tag přijat');
        assert(!validDraft694K({shapes:[{tag:'line',props:{onclick:'x'}}]}),'Nepovolený atribut přijat');
        assert(!validDraft694K({shapes:new Array(801).fill(fixture())}),'Limit 800 tvarů se nehlídá');
        return 'Přijat platný návrh; odmítnut tag, atribut a překročený limit.';
      });
      check('svg694y-draft-snapshot',()=>{
        const data=draftData694K('__svg694y_in_memory__','Isolovaný test');
        assert(data.id==='__svg694y_in_memory__'&&Array.isArray(data.shapes),'Sestavení uloženého návrhu selhalo');
        assert(data.shapes!==shapes&&validDraft694K(data),'Snímek není bezpečná kopie');
        if(oldReference){assert(data.reference?.data===oldReference.data&&data.reference?.opacity===oldReference.opacity,'Podklad se nepřipojil ke snímku');}
        else assert(data.reference===null,'Bez podkladu se ukládá nečekaný obsah');
        return 'Snímek v RAM, bez jediného zápisu do IndexedDB'+(oldReference?'; podklad obsažen.':'; podklad nebyl načten.');
      });
      check('svg694y-color-safety',()=>{
        assert(normalColor('#aabbcc')==='#aabbcc','Hex barva odmítnuta');
        assert(normalColor('url(javascript:alert(1))')==='currentColor','Nebezpečná barva přijata');
        return 'Platná barva zachována, nebezpečný výraz odmítnut.';
      });
      check('svg695t-shape-nodes',()=>{
        const items=[
          [{tag:'line',props:{x1:2,y1:3,x2:20,y2:18}},2],
          [{tag:'circle',props:{cx:12,cy:12,r:6}},2],
          [{tag:'ellipse',props:{cx:12,cy:12,rx:8,ry:4}},3],
          [{tag:'rect',props:{x:2,y:2,width:20,height:16,rx:3}},5],
          [{tag:'path',props:{d:'M2 12 A8 8 0 0 1 18 12'}},2],
          [{tag:'path',props:{d:'M18 3 A9 9 0 1 0 18 21 Q11 12 18 3 Z'}},4],
          [{tag:'polyline',props:{points:'2,2 10,10 20,20'}},3]
        ];
        for(const [shape,count] of items){
          const info=shapeNodes695T(shape);
          assert(info?.handles.length===count,'Chybné body: '+shape.tag+' '+shape.props.d);
        }
        return '7 typů včetně A/Z oblouků, elipsy a zaobleného obdélníku.';
      });
      check('svg695t-dense-nodes',()=>{
        const d='M2 2 '+Array.from({length:400},(_,i)=>`L${2+i%20} ${2+Math.floor(i/20)%20}`).join(' ');
        const info=shapeNodes695T({tag:'path',props:{d}});
        assert(info?.handles.length===401,'400 úseků se nepodařilo zpracovat');
        const current=170,visible=info.handles.slice(current-1,current+2);
        assert(visible.length===3,'Počet vykreslovaných bodů není omezen');
        return '401 editovatelných bodů, v plátně aktivní a 2 sousední.';
      });
      check('svg695t-precision-edit',()=>{
        const original={tag:'path',props:{d:'M2 2 L5 5 Q7 7 10 10'}};
        const shape=deepCopy(original),info=shapeNodes695T(shape),h=info.handles[2];
        assert(editNode695T(shape,h,{x:7.05,y:7}),'Bod nelze upravit');
        assert(shape.props.d!==original.props.d,'Úprava se neuložila');
        const changed=pathNodes694I(shape);
        assert(near(changed.handles[2].x,7.05),'Posun o 0,05 nefunguje');
        assert(near(changed.handles[0].x,2)&&near(changed.handles[1].x,5),'Ostatní body se změnily');
        assert(original.props.d==='M2 2 L5 5 Q7 7 10 10','Originál testu se změnil');
        return 'Posun 0,05 SVG jednotky; ostatní uzly i originál beze změny.';
      });
      check('svg695z-soft-three',()=>{
        const shape={tag:'path',props:{d:'M0 1 L2 1 L4 1 L6 1 L8 1'}};
        const before=JSON.stringify(shape);
        const handle=pathNodes694I(shape).handles.find(h=>h.kind==='anchor'&&h.segment===2);
        const result=proportionalGeometry695Z(shape,handle,0,2,3);
        assert(!!result&&JSON.stringify(shape)===before,'Změnil se zdrojový objekt');
        const p=pathNodes694I({tag:'path',props:result}).parsed;
        assert(near(p[2].nums[1],3),'Hlavní bod se neposunul o 2');
        assert(near(p[1].nums[1],2)&&near(p[3].nums[1],2),'Sousedé nemají poloviční posun');
        assert(near(p[0].nums[1],1)&&near(p[4].nums[1],1),'Vnější body se změnily');
        return 'Centrum +2, sousedé +1, vzdálené body beze změny.';
      });
      check('svg695z-soft-curves',()=>{
        const shape={tag:'path',props:{d:'M1 1 Q2 2 3 1 C4 0 5 0 6 1 L8 1'}};
        const before=JSON.stringify(shape);
        const handle=pathNodes694I(shape).handles.find(h=>h.kind==='anchor'&&h.segment===2);
        const result=proportionalGeometry695Z(shape,handle,0,2,3);
        assert(!!result&&JSON.stringify(shape)===before,'Došlo k mutaci originálu');
        const p=pathNodes694I({tag:'path',props:result}).parsed;
        assert(near(p[2].nums[5],3),'Vybraný C anchor se neposunul');
        assert(near(p[2].nums[1],1)&&near(p[2].nums[3],2),'Řídicí body C se neposunuly vahami konců');
        assert(near(p[1].nums[1],2.5),'Řídicí bod Q nemá plynulý přechod');
        assert(near(p[3].nums[1],2),'Další anchor se neposunul na polovinu');
        return 'Řídicí body Q/C sledují přilehlé konce, geometrie zůstává editovatelná.';
      });
      check('svg695z-soft-guard',()=>{
        const closed={tag:'path',props:{d:'M1 1 L2 2 L3 3 Z'}},arc={tag:'path',props:{d:'M1 1 A2 2 0 0 0 3 3'}};
        assert(proportionalGeometry695Z(closed,{kind:'anchor',segment:1},1,1,5)===null,'Uzavřená cesta změněna');
        assert(proportionalGeometry695Z(arc,{kind:'anchor',segment:1},1,1,5)===null,'Oblouk změněn');
        const line={tag:'polyline',props:{points:'0,0 2,0 4,0 6,0 8,0'}};
        const geometry=proportionalGeometry695Z(line,{kind:'anchor',index:2},0,2,5);
        assert(geometry?.points==='0,0.5 2,1.5 4,2 6,1.5 8,0.5','Polyline falloff není přesný');
        return 'Uzavřená/oblouková cesta odmítnuta, polyline: 25/75/100/75/25 %.';
      });
    }finally{
      snapGrid694U=oldGrid;gridStep694U=oldStep;
    }
    if(JSON.stringify(shapes)!==original||reference694R!==oldReference){
      result.push({id:'svg694y-state-integrity',name:'Ochrana skutečných SVG návrhů',kind:statusKind,status:'APP_FAIL',ms:0,detail:'Test změnil uživatelský model nebo referenci – zakázáno.'});
    }
    for(const [id,name] of expected.filter(([id])=>['svg694y-gesture','svg694y-undo-redo','svg694y-native-svg-files','svg694y-native-png','svg694y-indexeddb'].includes(id))){
      result.push({id,name,kind:'SVG_STUDIO_MANUAL_694Y',status:'NOT_TESTED',ms:0,detail:'694Y neprovádí skutečný dotyk Androidu, zápis uživatelských návrhů ani nativní systémový dialog. Ověřit ručně v APK.'});
    }
    return result;
  }
  window.LubaNoteSvgStudioTest694Y=Object.freeze({expected:Object.freeze(svgTests694Y.map(row=>row[0])),run:runSvgTests694Y});


  // 695R: Three stable tool groups, preserving the ORIGINAL handlers and select.
  // No duplicated tool state or cloned buttons.
  const toolGroups695R = [
    { label:'TVARY', tools:['pen','line','circle','ellipse','rect','roundrect','arc','moon'], actions:[] },
    { label:'VÝBĚR A ÚPRAVY', tools:['move','nodes','scale','rotate','pan'], actions:['Vše','Vybraný','Zpět','Vpřed'] },
    { label:'BARVA A GUMA', tools:['bucket','eraser','partial-eraser'], actions:['Vymazat','Uložit'] }
  ];
  const originalTools695R = Array.from(toolBar693W.children);
  const groupFor695R = entry => {
    const group=document.createElement('section'); group.className='lnSvgToolGroup695R';
    group.setAttribute('aria-label',entry.label);
    const caption=document.createElement('div');caption.className='lnSvgToolGroupTitle695R';caption.textContent=entry.label;
    const buttons=document.createElement('div');buttons.className='lnSvgToolGroupButtons695R';
    group.append(caption,buttons);
    for(const name of entry.tools){
      const b=originalTools695R.find(el=>el.dataset.tool===name);
      if(b)buttons.appendChild(b);
    }
    for(const name of entry.actions){
      const b=originalTools695R.find(el=>el.getAttribute('aria-label')===name && !el.dataset.tool);
      if(b)buttons.appendChild(b);
    }
    return group;
  };
  toolBar693W.replaceChildren(...toolGroups695R.map(groupFor695R));
  toolBar693W.classList.add('lnSvgGrouped695R');
  toolBar693W.setAttribute('aria-label','SVG Studio – Tvary, Výběr a úpravy, Barva a guma');

  // Radius of next rounded rectangles; kept separate from existing geometry.
  const corners695R=document.createElement('label');
  corners695R.className='lnSvgCorners695R';
  corners695R.innerHTML='<span>Zaoblení rohů</span><input type="range" min="5" max="50" step="5" value="20" aria-label="Zaoblení obdélníku"><output>20 %</output>';
  const cornersInput695R=corners695R.querySelector('input');
  cornersInput695R.addEventListener('input',()=>{
    cornerFraction695R=Number(cornersInput695R.value)/100;
    corners695R.querySelector('output').textContent=cornersInput695R.value+' %';
  });
  const optionsBody695R=view.querySelector('.lnSvgOptionsBody694L');
  optionsBody695R?.appendChild(corners695R);

  // 695R: Move the existing selected-object toolbar below canvas. Showing it
  // can no longer shift the drawing surface under the user's finger.
  // Reference and color options stay next to the workbench, not hidden in More.
  const workspace695R=document.createElement('div');
  workspace695R.className='lnSvgWorkspace695R';
  const left695R=document.createElement('aside');left695R.className='lnSvgWorkspaceLeft695R';
  const center695R=document.createElement('section');center695R.className='lnSvgWorkspaceCenter695R';
  const right695R=document.createElement('aside');right695R.className='lnSvgWorkspaceRight695R';
  toolBar693W.insertAdjacentElement('beforebegin',workspace695R);
  workspace695R.append(left695R,center695R,right695R);
  for(const x of [refPanel694R, view.querySelector('.lnSvgStudioColor693S'), view.querySelector('.lnSvgOptions694L')]) if(x)left695R.appendChild(x);
  for(const x of [toolBar693W,controls693W,board694L,selectionLabel,objectActions694N]) if(x)center695R.appendChild(x);
  for(const x of [draftPanel694K,view.querySelector('.lnSvgStudioPreviewArea693S'),view.querySelector('#lnSvgMore694L'),notice]) if(x)right695R.appendChild(x);
  // 696E: The controls are placed BELOW the canvas so changing them cannot
  // shift the board under a finger. Only a preview is drawn until Apply.
  const widthPanel696E=document.createElement('details');
  widthPanel696E.className='lnSvgWidthPanel696E';
  widthPanel696E.open=true;
  widthPanel696E.innerHTML=`<summary>↔ Tloušťka čar <small>živý náhled</small></summary>
    <div class="lnSvgWidthBody696E">
      <label class="lnSvgWidthScope696E">Upravit
        <select data-width-scope aria-label="Rozsah změny tloušťky čar">
          <option value="all">Všechny tvary</option>
          <option value="selected">Jen vybraný tvar</option>
        </select></label>
      <label class="lnSvgWidthRange696E"><span>Síla tahu <output data-width-factor>100 % (1×)</output></span>
        <input data-width-slider type="range" min="40" max="400" step="5" value="100" aria-label="Hromadná změna tloušťky v procentech"></label>
      <div class="lnSvgWidthInfo696E" data-width-info role="status">Otevři ikonu a pohni posuvníkem.</div>
      <div class="lnSvgWidthActions696E">
        <button type="button" data-width-apply disabled>✓ Použít tloušťku</button>
        <button type="button" data-width-reset disabled>↶ Zrušit náhled</button>
      </div>
      <small>100 % = původní tloušťka. Při změně zachováme poměry mezi tahy. Nemění výchozí nastavení pro nové tahy, barvy, výplně ani uložený návrh, dokud nepotvrdíš Použít.</small>
    </div>`;
  center695R.appendChild(widthPanel696E);
  const widthSlider696E=widthPanel696E.querySelector('[data-width-slider]');
  const widthFactor696E=widthPanel696E.querySelector('[data-width-factor]');
  const widthInfo696E=widthPanel696E.querySelector('[data-width-info]');
  const widthScopeInput696E=widthPanel696E.querySelector('[data-width-scope]');
  const widthSelectedOpt696E=widthScopeInput696E.querySelector('option[value="selected"]');
  const widthApply696E=widthPanel696E.querySelector('[data-width-apply]');
  const widthReset696E=widthPanel696E.querySelector('[data-width-reset]');
  const czWidth696E=n=>Number(n.toFixed(3)).toLocaleString('cs-CZ',{maximumFractionDigits:3});
  refreshWidthPanel696E=()=>{
    if(!widthPanel696E.isConnected)return;
    const hasSelected=selected>=0&&selected<shapes.length&&baseWidth696E(shapes[selected])!==null;
    widthSelectedOpt696E.disabled=!hasSelected;
    const targets=widthTargets696E();
    widthFactor696E.textContent=`${Math.round(widthScale696E*100)} % (${czWidth696E(widthScale696E)}×)`;
    widthReset696E.disabled=widthScale696E===1;
    const changed=targets.some(({width})=>widthNumber696E(width*widthScale696E)!==widthNumber696E(width));
    widthApply696E.disabled=!changed;
    if(widthScope696E==='selected'&&!hasSelected){
      widthInfo696E.textContent='Vyber tvar nástrojem Výběr, potom změň tloušťku.';
    }else if(!targets.length){
      widthInfo696E.textContent='Žádné viditelné čáry k úpravě.';
    }else{
      const widths=targets.map(x=>x.width),min=Math.min(...widths),max=Math.max(...widths);
      const range=(factor)=>{
        const lo=czWidth696E(min*factor),hi=czWidth696E(max*factor);
        return lo===hi?lo:`${lo}–${hi}`;
      };
      widthInfo696E.textContent=`${targets.length} ${targets.length===1?'tvar':targets.length<=4?'tvary':'tvarů'} · ${range(1)} → ${range(widthScale696E)} SVG jednotek${widthScale696E===1?' · beze změny':' · pouze náhled'}`;
    }
  };
  let widthFrame696E=0;
  const queueWidthView696E=()=>{
    if(widthFrame696E)return;
    widthFrame696E=requestAnimationFrame(()=>{widthFrame696E=0;render();});
  };
  widthScopeInput696E.addEventListener('change',()=>{
    widthScope696E=widthScopeInput696E.value==='selected'?'selected':'all';
    queueWidthView696E();refreshWidthPanel696E();
  });
  widthSlider696E.addEventListener('input',()=>{
    widthScale696E=Number(widthSlider696E.value)/100;
    refreshWidthPanel696E();queueWidthView696E();
  });
  const resetWidth696E=()=>{
    widthScale696E=1;widthSlider696E.value='100';
    refreshWidthPanel696E();queueWidthView696E();
  };
  widthReset696E.addEventListener('click',()=>{resetWidth696E();announce('Náhled tloušťky zrušen. Kresba se nezměnila.');});
  widthApply696E.addEventListener('click',()=>{
    const items=widthTargets696E();
    if(widthScale696E===1||!items.length){refreshWidthPanel696E();return;}
    const before=snapshot();let count=0;
    for(const {shape,width} of items){
      const changedWidth=widthNumber696E(width*widthScale696E);
      if(changedWidth===widthNumber696E(width))continue;
      shape.props['stroke-width']=changedWidth;count++;
    }
    // Reset preview before normal history-backed rendering. One click = one Undo.
    widthScale696E=1;widthSlider696E.value='100';
    if(count && record(before)){
      render();announce(`Tloušťka změněna u ${count} ${count===1?'tvaru':'tvarů'}. Zpět vrátí celou úpravu.`);
    }else{render();announce('Tloušťka se nezměnila.');}
  });
  widthPanel696E.addEventListener('toggle',()=>{
    if(!widthPanel696E.open && widthScale696E!==1)resetWidth696E();
  });
  refreshWidthPanel696E();

  // 696D: visible live comparison, independent from the edit canvas and draft storage.
  // The slider only changes exported text, never shapes or saved plans.
  const optimizePanel696D=document.createElement('details');
  optimizePanel696D.className='lnSvgOptimizePanel696D';
  optimizePanel696D.open=true;
  optimizePanel696D.innerHTML=`<summary>✨ Optimalizace ikony <small>živý náhled</small></summary>
    <div class="lnSvgOptBody696D">
      <label class="lnSvgOptSlider696D"><span>Úspora kódu <output data-level>0 % – bez úpravy</output></span>
        <input type="range" min="0" max="100" step="5" value="0" aria-label="Míra zjednodušení SVG křivek"></label>
      <div class="lnSvgOptPreviewControls696EA"><button type="button" data-preview-size>🔍 Zvětšit náhled</button><span>Obě verze používají stejný pohled. Při 100 % se mohou jevit stejně.</span></div>
      <div class="lnSvgOptCompare696D">
        <div><strong>Originál</strong><div class="lnSvgOptView696D" data-original></div></div>
        <div><strong>Optimalizováno</strong><div class="lnSvgOptView696D" data-optimized></div></div>
      </div>
      <div class="lnSvgOptInfo696D" data-stat role="status">Otevři uloženou ikonu a pohybuj posuvníkem.</div>
      <button type="button" data-copy-opt>📋 Kopírovat pro LubaNote</button>
      <small class="lnSvgOptSafety696D">Pouze export. Uložená kresba, body, historie i synchronizace zůstávají beze změny. Při vyšší úspoře sleduj drobné detaily.</small>
    </div>`;
  const more696D=view.querySelector('#lnSvgMore694L');
  if(more696D?.parentElement===right695R)right695R.insertBefore(optimizePanel696D,more696D);
  else right695R.appendChild(optimizePanel696D);
  const levelInput696D=optimizePanel696D.querySelector('input[type=range]');
  const levelOutput696D=optimizePanel696D.querySelector('[data-level]');
  const stat696D=optimizePanel696D.querySelector('[data-stat]');
  const originalView696D=optimizePanel696D.querySelector('[data-original]');
  const optimView696D=optimizePanel696D.querySelector('[data-optimized]');
  const previewSizeButton696EA=optimizePanel696D.querySelector('[data-preview-size]');
  previewSizeButton696EA.addEventListener('click',()=>{
    const enlarged=optimizePanel696D.classList.toggle('lnSvgOptEnlarged696EA');
    previewSizeButton696EA.textContent=enlarged?'↙ Zmenšit náhled':'🔍 Zvětšit náhled';
    previewSizeButton696EA.setAttribute('aria-pressed',String(enlarged));
  });
  let pendingPreview696D=false,lastPreviewKey696D='';
  function miniSvg696D(target,parts){
    const mini=document.createElementNS(NS,'svg');
    mini.setAttribute('viewBox','0 0 24 24');mini.setAttribute('aria-hidden','true');
    mini.setAttribute('fill','none');mini.setAttribute('stroke','currentColor');
    mini.setAttribute('stroke-width','1.85');
    mini.setAttribute('stroke-linecap','round');mini.setAttribute('stroke-linejoin','round');
    for(const part of parts){if(part&&allowed.has(part.tag))mini.appendChild(svgPart(part));}
    target.replaceChildren(mini);
  }
  function updatePreview696D(){
    pendingPreview696D=false;
    if(!optimizePanel696D.open||view.hidden)return;
    const key=optimizationLevel696D+':'+JSON.stringify(shapes);
    if(key===lastPreviewKey696D)return;
    lastPreviewKey696D=key;
    try{
      const result=optimizedExport696D();
      miniSvg696D(originalView696D,shapes);
      miniSvg696D(optimView696D,result.items);
      const kb=n=>(n/1024).toFixed(1).replace('.',',');
      const saved=result.bytesBefore-result.bytesAfter;
      stat696D.textContent=`${kb(result.bytesBefore)} → ${kb(result.bytesAfter)} kB (${saved>=0?'−':'+'}${kb(Math.abs(saved))} kB) · křivek ${result.originalQ} → ${result.afterSegments}${result.optimizedPaths?'':' · bez další úspory'}`;
    }catch(error){stat696D.textContent='Náhled se nepodařilo vytvořit: '+String(error?.message||error);}
  }
  scheduleOptimizationPreview696D=()=>{
    if(pendingPreview696D||!optimizePanel696D.open||view.hidden)return;
    pendingPreview696D=true;
    requestAnimationFrame(updatePreview696D);
  };
  levelInput696D.addEventListener('input',()=>{
    optimizationLevel696D=Number(levelInput696D.value);
    levelOutput696D.textContent=optimizationLevel696D===0?'0 % – bez úpravy':`${optimizationLevel696D} %`;
    scheduleOptimizationPreview696D();
  });
  optimizePanel696D.addEventListener('toggle',scheduleOptimizationPreview696D);
  optimizePanel696D.querySelector('[data-copy-opt]').addEventListener('click',copyOptimized696D);
  scheduleOptimizationPreview696D();
  // Preserve existing reference slider events, draft autosave, icon export,
  // Undo/Redo, and non-exported canvas guides after reparenting.

  // 696B: PC has a dedicated zoom bar; keep mobile's compact pinch-only UI.
  controls693W.classList.add('lnSvgDesktopZoom696B');
  controls693W.title='Najeď kurzorem na detail plátna, Ctrl + kolečko přibližuje k tomuto místu.';
  center695R.insertBefore(controls693W, board694L);
  const wheelHint696B=document.createElement('small');
  wheelHint696B.className='lnSvgZoomHint696B';
  wheelHint696B.textContent='Ctrl + kolečko myši: přiblížit pod kurzorem · + / −: podle poslední polohy kurzoru';
  controls693W.insertAdjacentElement('afterend',wheelHint696B);

  // Desktop gets the entire admin modal and a genuine canvas workbench:
  // tool palette on the left, large canvas in the center. On mobile the
  // original toolbar returns directly above the canvas. Reparenting keeps
  // existing click handlers, active tool and Undo/Redo state intact.
  const desktop695S=window.matchMedia('(min-width:900px)');
  const colors695S=view.querySelector('.lnSvgStudioColor693S');
  const options695S=view.querySelector('.lnSvgOptions694L');
  const layout695S=()=>{
    if(desktop695S.matches){
      left695R.prepend(toolBar693W);
      for(const panel of [refPanel694R,colors695S,options695S])if(panel)left695R.appendChild(panel);
      // 696E: desktop's width slider stays BESIDE the canvas, not below the fold.
      const beforeWidth696E=right695R.querySelector('.lnSvgStudioPreviewArea693S');
      if(beforeWidth696E)right695R.insertBefore(widthPanel696E,beforeWidth696E);
      else right695R.appendChild(widthPanel696E);
    }else{
      // On phones the canvas must be directly below the compact tool palette.
      // The original color/options panels remain available just BELOW canvas.
      center695R.prepend(toolBar693W);
      if(refPanel694R)center695R.prepend(refPanel694R);
      for(const panel of [colors695S,options695S])if(panel)center695R.appendChild(panel);
      // Phone: keep the existing palette under the board; width slider follows it.
      center695R.appendChild(widthPanel696E);
    }
  };
  layout695S();
  // 696B: direct scroll access even on desktops where a nested modal captures
  // mouse-wheel scrolling; the left palette always has a bounded scroll area.
  const paletteNav696B=document.createElement('div');
  paletteNav696B.className='lnSvgPaletteNav696B';
  paletteNav696B.innerHTML='<span>Nástroje a nastavení</span><button type="button" data-palette="top">↑ Nahoru</button><button type="button" data-palette="bottom">↓ Dolů</button>';
  left695R.prepend(paletteNav696B);
  paletteNav696B.addEventListener('click',event=>{
    const b=event.target.closest('button[data-palette]');if(!b)return;
    left695R.scrollTo({top:b.dataset.palette==='top'?0:left695R.scrollHeight,behavior:'smooth'});
  });
  left695R.tabIndex=0;
  left695R.setAttribute('aria-label','Nástroje SVG Studia – posuvný panel');
  if(desktop695S.addEventListener)desktop695S.addEventListener('change',layout695S);
  else desktop695S.addListener?.(layout695S);

  // Explicit state class is more robust than :has() and avoids resizing
  // any other Admin Dashboard view. Close/back restores normal modal size.
  const syncFullscreen695S=()=>modal.classList.toggle('lnSvgDesktopFull695S',!modal.hidden&&!view.hidden);
  open.addEventListener('click',syncFullscreen695S);
  back.addEventListener('click',syncFullscreen695S);
  new MutationObserver(syncFullscreen695S).observe(view,{attributes:true,attributeFilter:['hidden']});
  new MutationObserver(syncFullscreen695S).observe(modal,{attributes:true,attributeFilter:['hidden']});
  syncFullscreen695S();

  // 695V: a SINGLE compact action immediately after Vpřed. Delegate to
  // the original, proven smoothing click handler. No extra toolbar below canvas.
  const smoothButton695U=$('lnSvgSmoothSelected693V');
  smoothButton695U.hidden=true;
  const smoothAction695V=document.createElement('button');
  smoothAction695V.type='button';smoothAction695V.className='lnSvgQuickAction694L lnSvgSmoothAction695V';
  smoothAction695V.setAttribute('aria-label','Vyhladit');
  smoothAction695V.innerHTML='<span aria-hidden="true">∿</span><small>Vyhladit</small><em data-smooth-stage>0/6</em>';
  const adjustGroup695V=toolBar693W.querySelectorAll('.lnSvgToolGroupButtons695R')[1];
  const redoAction695V=Array.from(adjustGroup695V?.children||[]).find(el=>el.getAttribute('aria-label')==='Vpřed');
  if(redoAction695V)redoAction695V.insertAdjacentElement('afterend',smoothAction695V);
  else adjustGroup695V?.appendChild(smoothAction695V);
  smoothAction695V.addEventListener('click',()=>smoothButton695U.click());
  function updateSmoothQuick695U(){
    const shape=shapes[selected];
    const canSmooth=shape?.tag==='path' && ['move','nodes','scale','rotate'].includes(tool.value);
    const stage=canSmooth?smoothStage695V(shape):0;
    const isDone=canSmooth&&(stage>=smoothMax695V||smoothDone695V.has(smoothKey695V(shape)));
    smoothAction695V.disabled=!canSmooth||!!isDone;
    smoothAction695V.dataset.complete=String(!!isDone);
    smoothAction695V.querySelector('small').textContent=isDone?'Hotovo':'Vyhladit';
    smoothAction695V.querySelector('[data-smooth-stage]').textContent=stage+'/'+smoothMax695V;
    smoothAction695V.title=!canSmooth?'Nejprve vyber křivku':isDone?'Vyhlazení dokončeno, můžeš použít Zpět':`Vyhladit křivku (${stage}/${smoothMax695V})`;
  }
  joinAction695X=document.createElement('button');
  joinAction695X.type='button';joinAction695X.className='lnSvgQuickAction694L lnSvgJoinAction695X';
  joinAction695X.setAttribute('aria-label','Spojit');
  joinAction695X.innerHTML='<span aria-hidden="true">⟗</span><small>Spojit</small><em data-join-stage>1/2</em>';
  smoothAction695V.insertAdjacentElement('afterend',joinAction695X);
  joinAction695X.addEventListener('click',()=>{
    if(tool.value!=='nodes'){announce('Pro spojení přepni na Body a vyber koncový bod.');return;}
    const endpoint=endpointInfo695X();
    if(!joinDraft695X){
      if(!endpoint){announce('Nejprve v režimu Body vyber koncový bod otevřené čáry.');return;}
      joinDraft695X={...endpoint};render();announce('První koncový bod uložen. Teď vyber druhý objekt a jeho koncový bod, pak klepni znovu na Spojit.');return;
    }
    if(!endpoint){announce('Teď vyber koncový bod druhého objektu.');return;}
    if(endpoint.shapeIndex===joinDraft695X.shapeIndex){announce('Pro spojení vyber koncový bod druhého objektu.');return;}
    joinEndpoints695X(joinDraft695X,endpoint);
  });
  const smoothJoinAction695Y=document.createElement('button');
  smoothJoinAction695Y.type='button';smoothJoinAction695Y.className='lnSvgQuickAction694L lnSvgSmoothJoin695Y';
  smoothJoinAction695Y.setAttribute('aria-label','Plynulý spoj');
  smoothJoinAction695Y.innerHTML='<span aria-hidden="true">⌁</span><small>Plynulý spoj</small>';
  joinAction695X.insertAdjacentElement('afterend',smoothJoinAction695Y);
  smoothJoinAction695Y.addEventListener('click',()=>{
    const handle=selectedSmoothJoinHandle695Y();
    if(!handle){announce('Vyber v režimu Body vnitřní bod v místě spojení.');return;}
    const before=snapshot();
    if(!smoothJoinAtNode695Y(shapes[selected],handle)){
      announce('Tento spoj nejde bezpečně vyhladit. Zkontroluj sousední body.');return;
    }
    // Keep the same geometric joint selected after conversion to C.
    activeNode695T=pathNodes694I(shapes[selected]).handles.findIndex(h=>h.segment===handle.segment&&h.kind==='anchor');
    record(before);render();announce('Plynulý spoj hotov. Směr obou křivek nyní navazuje.');
  });
  function updateJoinQuick695X(){
    if(!joinAction695X)return;
    smoothJoinAction695Y.disabled=!selectedSmoothJoinHandle695Y();
    smoothJoinAction695Y.title=smoothJoinAction695Y.disabled?'Vyber vnitřní bod v místě spoje':'Vyhladit návaznost křivek v tomto bodě';
    const endpoint=endpointInfo695X();
    const pending=!!joinDraft695X;
    joinAction695X.dataset.pending=String(pending);
    joinAction695X.disabled=tool.value!=='nodes' || (!pending && !endpoint);
    joinAction695X.querySelector('[data-join-stage]').textContent=pending?'2/2':'1/2';
    joinAction695X.title=tool.value!=='nodes'?'Přepni na Body':pending?(endpoint?'Dokonči spojení druhým koncovým bodem.':'Vyber druhý koncový bod jiného objektu.'):(endpoint?'Ulož první koncový bod pro spojení.':'Nejprve vyber koncový bod otevřené čáry.');
  }

  // 695T: draggable precision joystick. It is a DOM overlay, not an SVG
  // shape, so it never appears in exported icons, history or image drafts.
  const joystick695T=document.createElement('section');
  joystick695T.className='lnSvgJoystick695T';
  joystick695T.hidden=true;
  joystick695T.setAttribute('aria-label','Jemné doladění bodu nebo objektu');
  joystick695T.innerHTML=`
    <div class="lnSvgJoyHead695T" title="Přetáhni panel za tuto lištu">✥ Jemný posun <button type="button" data-hide title="Skrýt joystick" aria-label="Skrýt joystick">×</button></div>
    <div class="lnSvgJoyNodes695T" data-nodes hidden><button type="button" data-prev aria-label="Předchozí bod">◀</button><span data-count>Bod 1 / 1</span><button type="button" data-next aria-label="Další bod">▶</button></div>
    <div class="lnSvgJoyPad695T"><button type="button" data-dir="up" aria-label="Nahoru">↑</button><button type="button" data-dir="left" aria-label="Doleva">←</button><button type="button" data-dir="right" aria-label="Doprava">→</button><button type="button" data-dir="down" aria-label="Dolů">↓</button></div>
    <div class="lnSvgJoySoft695Z"><span>Okolí</span><button type="button" data-soft-trigger aria-haspopup="true" aria-expanded="false" aria-label="Počet společně posouvaných bodů">1 bod ▾</button></div>
    <div class="lnSvgJoySoftMenu695Z" data-soft-menu hidden role="group" aria-label="Vyber počet okolních bodů">
      <button type="button" data-soft-count="1" aria-pressed="true">1 bod</button>
      <button type="button" data-soft-count="3">3 body</button>
      <button type="button" data-soft-count="5">5 bodů</button>
      <button type="button" data-soft-count="9">9 bodů</button>
      <button type="button" data-soft-count="15">15 bodů</button>
    </div>
    <div class="lnSvgJoyStep695T"><span>Krok</span><button type="button" class="lnSvgStepTrigger695U" data-step-trigger aria-haspopup="true" aria-expanded="false" aria-label="Velikost kroku">0,05 ▾</button></div>
    <div class="lnSvgStepMenu695U" data-step-menu hidden role="group" aria-label="Vyber krok jemného posunu">
      <button type="button" data-step="0.02">0,02</button><button type="button" data-step="0.05" aria-pressed="true">0,05</button>
      <button type="button" data-step="0.1">0,1</button><button type="button" data-step="0.25">0,25</button><button type="button" data-step="0.5">0,5</button>
    </div>`;
  const joyHead695T=joystick695T.querySelector('.lnSvgJoyHead695T');
  const joyNodes695T=joystick695T.querySelector('[data-nodes]');
  const joyCount695T=joystick695T.querySelector('[data-count]');
  const joyStepTrigger695U=joystick695T.querySelector('[data-step-trigger]');
  const joyStepMenu695U=joystick695T.querySelector('[data-step-menu]');
  const joySoftTrigger695Z=joystick695T.querySelector('[data-soft-trigger]');
  const joySoftMenu695Z=joystick695T.querySelector('[data-soft-menu]');
  let joyStep695U=.05;
  const closeSoft695Z=()=>{joySoftMenu695Z.hidden=true;joySoftTrigger695Z.setAttribute('aria-expanded','false');};
  joySoftTrigger695Z.addEventListener('click',()=>{
    closeStep695U();
    const opening=joySoftMenu695Z.hidden;joySoftMenu695Z.hidden=!opening;
    joySoftTrigger695Z.setAttribute('aria-expanded',String(opening));
  });
  joySoftMenu695Z.querySelectorAll('[data-soft-count]').forEach(button=>button.addEventListener('click',()=>{
    softCount695Z=Number(button.dataset.softCount);
    joySoftTrigger695Z.textContent=button.textContent+' ▾';
    joySoftMenu695Z.querySelectorAll('[data-soft-count]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    if(softCount695Z>1 && selected>=0 && tool.value==='nodes'){
      const info=nodePositions694I(),active=info?.handles[activeNode695T];
      if(info&&active&&active.kind!=='anchor'){
        let best=Infinity,closest=activeNode695T;
        for(const h of info.handles){
          if(h.kind!=='anchor')continue;
          const d=Math.hypot(h.x-active.x,h.y-active.y);
          if(d<best){best=d;closest=h.index;}
        }
        activeNode695T=closest;
      }
    }
    closeSoft695Z();render();
    announce(softCount695Z===1?'Úprava jen jednoho bodu.':'Proporční úprava '+softCount695Z+' bodů: hlavní bod se pohne nejvíce, sousedé méně.');
  }));
  const closeStep695U=()=>{joyStepMenu695U.hidden=true;joyStepTrigger695U.setAttribute('aria-expanded','false');};
  joyStepTrigger695U.addEventListener('click',()=>{
    closeSoft695Z();
    const open=joyStepMenu695U.hidden;joyStepMenu695U.hidden=!open;
    joyStepTrigger695U.setAttribute('aria-expanded',String(open));
  });
  joyStepMenu695U.querySelectorAll('[data-step]').forEach(button=>button.addEventListener('click',()=>{
    joyStep695U=Number(button.dataset.step);
    joyStepTrigger695U.textContent=button.textContent+' ▾';
    joyStepMenu695U.querySelectorAll('[data-step]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    closeStep695U();
  }));
  document.addEventListener('pointerdown',e=>{
    if(!joystick695T.contains(e.target)){closeStep695U();closeSoft695Z();}
  },true);
  joystick695T.addEventListener('keydown',e=>{if(e.key==='Escape'){closeStep695U();closeSoft695Z();}});
  const joyShow695T=document.createElement('button');
  joyShow695T.type='button';joyShow695T.className='lnSvgJoyShow695T';
  joyShow695T.textContent='✥ Jemný posun';joyShow695T.hidden=true;
  // The floating panel belongs to the Studio view, not the drawing board.
  // It can be dragged over tools, sidebars and other free screen space.
  view.append(joystick695T,joyShow695T);
  let joyManuallyHidden695T=false,joyDrag695T=null;
  function updateJoystick695T(){
    updateSmoothQuick695U();
    const supported=['move','nodes','scale','rotate'].includes(tool.value);
    const valid=supported&&selected>=0&&selected<shapes.length;
    const info=valid&&tool.value==='nodes'?nodePositions694I():null;
    const canNudge=valid&&(tool.value!=='nodes'||!!info);
    // 695X: Keep the joystick discoverable even before selecting an object.
    // Previously both the panel and its restore button vanished on deselection.
    joystick695T.hidden=!supported||joyManuallyHidden695T;
    joyShow695T.hidden=!supported||!joyManuallyHidden695T;
    joyNodes695T.hidden=tool.value!=='nodes';
    if(info && softCount695Z>1 && ['path','polyline'].includes(shapes[selected]?.tag)){
      const anchors=info.handles.filter(h=>h.kind==='anchor');
      joyCount695T.textContent='Kotva '+(anchors.findIndex(h=>h.index===activeNode695T)+1)+' / '+anchors.length;
    }else joyCount695T.textContent=info?'Bod '+(activeNode695T+1)+' / '+info.handles.length:'Vyber bod';
    joystick695T.querySelectorAll('[data-dir],[data-prev],[data-next]').forEach(button=>{
      button.disabled=!canNudge;
    });
    joySoftTrigger695Z.disabled=tool.value!=='nodes';
    joystick695T.title=canNudge?'Jemný posun vybraného bodu nebo objektu':'Nejprve klepni na objekt na plátně';
  }
  joystick695T.querySelector('[data-hide]').addEventListener('click',()=>{joyManuallyHidden695T=true;updateJoystick695T();});
  joyShow695T.addEventListener('click',()=>{joyManuallyHidden695T=false;updateJoystick695T();});
  for(const [name,delta] of [['prev',-1],['next',1]]){
    joystick695T.querySelector('[data-'+name+']').addEventListener('click',()=>{
      const info=nodePositions694I();if(!info)return;
      // In the neighbourhood mode skip intermediate Bezier control handles.
      const anchorsOnly=softCount695Z>1 && ['path','polyline'].includes(shapes[selected]?.tag);
      if(anchorsOnly){
        const indices=info.handles.filter(h=>h.kind==='anchor').map(h=>h.index);
        let position=indices.indexOf(activeNode695T);
        if(position<0)position=delta>0?-1:indices.length;
        activeNode695T=indices[Math.max(0,Math.min(indices.length-1,position+delta))]??activeNode695T;
      }else{
        activeNode695T=Math.max(0,Math.min(info.handles.length-1,activeNode695T+delta));
      }
      render();
    });
  }
  function nudge695T(dx,dy){
    if(selected<0||selected>=shapes.length)return;
    const shape=shapes[selected],before=snapshot();
    if(tool.value==='nodes'){
      const info=nodePositions694I(),h=info?.handles[activeNode695T];if(!h)return;
      const local=local694J(info.t,{x:h.x+dx,y:h.y+dy});
      const original=local694J(info.t,h);
      const soft=proportionalGeometry695Z(shape,h,local.x-original.x,local.y-original.y,softCount695Z);
      if(soft)Object.assign(shape.props,soft);
      else if(!editNode695T(shape,h,local))return;
    }else{
      const t=affine694H(shape);if(!t)return;
      assignAffine694H(shape,{...t,x:t.x+dx,y:t.y+dy});
    }
    record(before);render();announce(tool.value==='nodes'?(softCount695Z>1?'Body proporčně posunuty.':'Bod jemně posunut.'):'Objekt jemně posunut.');
  }
  for(const [name,dx,dy] of [['up',0,-1],['left',-1,0],['right',1,0],['down',0,1]]){
    joystick695T.querySelector('[data-dir="'+name+'"]').addEventListener('click',()=>{
      nudge695T(dx*joyStep695U,dy*joyStep695U);
    });
  }
  joyHead695T.addEventListener('pointerdown',e=>{
    if(e.target.closest('button'))return;
    e.preventDefault();
    closeStep695U();closeSoft695Z();
    const box=joystick695T.getBoundingClientRect();
    joyDrag695T={id:e.pointerId,x:e.clientX,y:e.clientY,left:box.left,top:box.top};
    try{joyHead695T.setPointerCapture(e.pointerId);}catch(_){}
  });
  joyHead695T.addEventListener('pointermove',e=>{
    if(!joyDrag695T||e.pointerId!==joyDrag695T.id)return;
    e.preventDefault();const d=joyDrag695T;
    const width=window.visualViewport?.width||window.innerWidth;
    const height=window.visualViewport?.height||window.innerHeight;
    const maxX=Math.max(0,width-joystick695T.offsetWidth);
    const maxY=Math.max(0,height-joystick695T.offsetHeight);
    joystick695T.style.left=Math.max(0,Math.min(maxX,d.left+e.clientX-d.x))+'px';
    joystick695T.style.top=Math.max(0,Math.min(maxY,d.top+e.clientY-d.y))+'px';
    joystick695T.style.right='auto';joystick695T.style.bottom='auto';
  });
  for(const name of ['pointerup','pointercancel','lostpointercapture'])joyHead695T.addEventListener(name,()=>{joyDrag695T=null;});
  window.addEventListener('resize',()=>{
    if(!joystick695T.style.left)return;
    const maxX=Math.max(0,(window.visualViewport?.width||window.innerWidth)-joystick695T.offsetWidth);
    const maxY=Math.max(0,(window.visualViewport?.height||window.innerHeight)-joystick695T.offsetHeight);
    joystick695T.style.left=Math.max(0,Math.min(maxX,parseFloat(joystick695T.style.left)||0))+'px';
    joystick695T.style.top=Math.max(0,Math.min(maxY,parseFloat(joystick695T.style.top)||0))+'px';
  });
  // 695V: non-blocking status notification in the EXISTING Studio palette.
  // It mirrors messages already written in the Studio and Draft panels.
  const toast695V=document.createElement('div');
  toast695V.id='lnSvgFeedback695V';toast695V.className='lnSvgFeedback695V';
  toast695V.hidden=true;toast695V.setAttribute('role','status');
  toast695V.setAttribute('aria-live','polite');
  view.appendChild(toast695V);
  let toastTimer695V=null;
  feedback695V=message=>{
    if(!message||view.hidden||modal.hidden)return;
    toast695V.textContent=String(message);
    toast695V.dataset.error=String(/selhal|nepodař|nelze|není dostup|nejprve|nejdřív|napiš|chyba/i.test(message));
    toast695V.hidden=false;
    if(toastTimer695V!==null)clearTimeout(toastTimer695V);
    toastTimer695V=setTimeout(()=>{toast695V.hidden=true;toastTimer695V=null;},
      toast695V.dataset.error==='true'?3600:2500);
  };
  joystickReady695T=true;
  render();
})();
