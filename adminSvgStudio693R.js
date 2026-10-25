/* 693R: Admin-only, offline SVG sketchpad. No database or production icon writes. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const open = $('adminSvgStudio693RButton'), view = $('adminSvgStudio693RView');
  const home = $('adminDashboardHome'), back = $('adminSvgStudio693RBack');
  const modal = $('adminDashboardModal'), svg = $('lnSvgCanvas693R');
  if (!open || !view || !home || !back || !modal || !svg) return;
  const NS = 'http://www.w3.org/2000/svg';
  const tool = $('lnSvgTool693R'), stroke = $('lnSvgStroke693R'), source = $('lnSvgSource693R');
  const notice = $('lnSvgMessage693R');
  const allowed = new Set(['path','circle','rect','line','ellipse','polyline','polygon']);
  const attrs = new Set(['d','cx','cy','r','rx','ry','x','y','x1','x2','y1','y2','width','height','points','stroke-width','stroke-linecap','stroke-linejoin','fill','stroke']);
  let shapes=[], history=[], drawing=null;
  const number = x => Math.max(0,Math.min(24,Math.round(x*100)/100));
  const fmt = x => String(Math.round(x*100)/100);
  const alert = text => {notice.textContent=text;};
  const svgPart = o => {
    const el=document.createElementNS(NS,o.tag);
    Object.entries(o.props).forEach(([name,value]) => el.setAttribute(name,String(value)));
    return el;
  };
  function render(){
    svg.replaceChildren();
    for(let i=0;i<=24;i+=2){
      const grid=svgPart({tag:'path',props:{d:`M${i} 0V24 M0 ${i}H24`,stroke:'currentColor','stroke-width':'.055',opacity:'.2',fill:'none'}});
      svg.appendChild(grid);
    }
    for(const s of [...shapes,...(drawing?[drawing]:[])]) svg.appendChild(svgPart(s));
    source.value=exportSvg();
  }
  function normalized(tag,props={}){return {tag,props:{fill:'none',stroke:'currentColor','stroke-width':fmt(Number(stroke.value)),'stroke-linecap':'round','stroke-linejoin':'round',...props}};}
  function point(e){let r=svg.getBoundingClientRect();return {x:number((e.clientX-r.left)*24/r.width),y:number((e.clientY-r.top)*24/r.height)};}
  function shapeAt(a,b,kind){
    if(kind==='circle')return normalized('circle',{cx:fmt(a.x),cy:fmt(a.y),r:fmt(Math.hypot(b.x-a.x,b.y-a.y))});
    if(kind==='rect')return normalized('rect',{x:fmt(Math.min(a.x,b.x)),y:fmt(Math.min(a.y,b.y)),width:fmt(Math.abs(b.x-a.x)),height:fmt(Math.abs(b.y-a.y))});
    return normalized('line',{x1:fmt(a.x),y1:fmt(a.y),x2:fmt(b.x),y2:fmt(b.y)});
  }
  let start=null,rawPath='';
  svg.addEventListener('pointerdown',e=>{
    if(view.hidden)return;
    e.preventDefault(); svg.setPointerCapture(e.pointerId); start=point(e);
    rawPath=`M${fmt(start.x)} ${fmt(start.y)}`;
    drawing=tool.value==='pen'?normalized('path',{d:rawPath}):shapeAt(start,start,tool.value); render();
  });
  svg.addEventListener('pointermove',e=>{
    if(!start)return;
    let p=point(e);
    if(tool.value==='pen'){rawPath+=` L${fmt(p.x)} ${fmt(p.y)}`;drawing=normalized('path',{d:rawPath});}
    else drawing=shapeAt(start,p,tool.value);
    render();
  });
  function finish(e){if(!start)return;const p=point(e);if(tool.value!=='pen')drawing=shapeAt(start,p,tool.value);history.push(shapes.slice());shapes.push(drawing);start=null;drawing=null;render();}
  svg.addEventListener('pointerup',finish);
  svg.addEventListener('pointercancel',()=>{start=null;drawing=null;render();});
  stroke.addEventListener('input',()=>{$('lnSvgStrokeValue693R').textContent=Number(stroke.value).toLocaleString('cs-CZ');});
  function exportSvg(){const inner=shapes.map(s=>svgPart(s).outerHTML).join('');return `<svg xmlns="${NS}" viewBox="0 0 24 24">${inner}</svg>`;}
  function lubaCode(){return '[\n'+shapes.map(s=>`  [${JSON.stringify(s.tag)}, ${JSON.stringify(s.props)}]`).join(',\n')+'\n]';}
  const copy = async data=>{try{await navigator.clipboard.writeText(data);alert('Zkopírováno.');}catch(_){source.value=data;source.focus();source.select();alert('Automatické kopírování není dostupné. Označený kód můžeš zkopírovat ručně.');}};
  $('lnSvgCopy693R').addEventListener('click',()=>copy(exportSvg()));
  $('lnSvgCopyLuba693R').addEventListener('click',()=>copy(lubaCode()));
  $('lnSvgCopySource693R').addEventListener('click',()=>copy(source.value));
  $('lnSvgUndo693R').addEventListener('click',()=>{if(history.length)shapes=history.pop();render();});
  $('lnSvgClear693R').addEventListener('click',()=>{history.push(shapes.slice());shapes=[];render();});
  $('lnSvgImport693R').addEventListener('click',()=>{
    try{
      const doc=new DOMParser().parseFromString(source.value,'image/svg+xml');
      if(doc.querySelector('parsererror'))throw Error('Neplatné SVG');
      const root=doc.documentElement; if(root.localName!=='svg'||root.namespaceURI!==NS)throw Error('Vlož celé SVG');
      const next=[];
      for(const el of root.children){
        if(!allowed.has(el.localName)||el.namespaceURI!==NS)throw Error('Nepodporovaný tvar nebo skupina: '+el.localName);
        const props={};for(const at of el.attributes){
          if(!attrs.has(at.name))throw Error('Nepodporovaný atribut: '+at.name);
          if(/url\s*\(|javascript:|[<>]/i.test(at.value))throw Error('Nepovolená hodnota');
          props[at.name]=at.value;
        }
        next.push({tag:el.localName,props});
      }
      if(!next.length)throw Error('Nenalezeny tvary');
      history.push(shapes.slice());shapes=next;render();alert('SVG načteno ('+next.length+' tvarů).');
    }catch(e){alert('Import: '+e.message);}
  });
  open.addEventListener('click',()=>{if(home.hidden||modal.hidden)return;home.hidden=true;view.hidden=false;render();});
  back.addEventListener('click',()=>{view.hidden=true;home.hidden=false;});
  // Existing dashboard close and re-entry must never reopen the studio unexpectedly.
  new MutationObserver(()=>{if(modal.hidden){view.hidden=true;home.hidden=false;}}).observe(modal,{attributes:true,attributeFilter:['hidden']});
  render();
})();
