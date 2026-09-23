/* ==================================================
   LubaNote – PC Planner Visual Lab panel
   PATCH 658AF
================================================== */
(() => {
  "use strict";
  const ID = "ln-dpvt-panel";
  const POS = "lubanoteDesktopPlannerVisualPanelPosV1";
  let panel=null, refs={}, drag=null, otevreny=false, minimal=false;
  const api=()=>window.LubaNoteDesktopPlannerVisualTuning||null;
  const povoleno=()=>window.LubaNoteAdminTools?.isAllowed?.()===true;

  function radek(id,label,min,max,step=1,unit="px") {
    return `<label class="ln-nvt-row" for="${id}"><span class="ln-nvt-label">${label}</span><span class="ln-nvt-range-line"><output class="ln-nvt-original" data-original-for="${id}">Pův. —</output><input id="${id}" type="range" min="${min}" max="${max}" step="${step}"><output class="ln-nvt-current" data-current-for="${id}">—</output></span></label>`;
  }
  function fmt(v,unit="px") { const n=Number(v); return `${Number.isInteger(n)?n:n.toFixed(1)} ${unit}`; }
  function setRange(input,val,orig,unit="px") {
    input.value=String(val);
    panel.querySelector(`[data-original-for="${input.id}"]`).textContent=`Pův. ${fmt(orig,unit)}`;
    panel.querySelector(`[data-current-for="${input.id}"]`).textContent=fmt(val,unit);
  }

  function vytvor() {
    if(panel) return panel;
    panel=document.createElement("section"); panel.id=ID; panel.hidden=true;
    panel.innerHTML=`<header class="ln-nvt-head"><div class="ln-nvt-title"><strong>🖥️ Plán PC – živé ladění</strong><small>Kalendář + agenda</small></div><button id="dpv-min" class="ln-nvt-icon" type="button">—</button><button id="dpv-close" class="ln-nvt-icon" type="button">×</button></header><div class="ln-nvt-body">
      <div class="ln-nvt-section-title">KALENDÁŘ</div>
      ${radek("dpv-screen","Šířka celé oblasti",900,1450)}
      ${radek("dpv-share","Podíl kalendáře",48,70,1,"%")}
      ${radek("dpv-grid","Šířka mřížky",480,760)}
      ${radek("dpv-dayh","Výška dne",38,78)}
      ${radek("dpv-daygap","Mezera dní",0,14)}
      ${radek("dpv-dayrad","Zaoblení dne",0,24)}
      ${radek("dpv-dayfont","Velikost čísla dne",12,22)}
      <div class="ln-nvt-section-title">AGENDA / ÚKOLY</div>
      <div class="ln-nvt-actions"><button id="dpv-columns" type="button">Agenda: 1 sloupec</button></div>
      ${radek("dpv-apad","Odsazení panelu",4,24)}
      ${radek("dpv-arad","Zaoblení panelu",0,28)}
      ${radek("dpv-afont","Velikost textu úkolu",12,21)}
      ${radek("dpv-rowpad","Výška řádku",2,16)}
      ${radek("dpv-rowgap","Mezera čas / text",4,18)}
      ${radek("dpv-time","Šířka času",48,90)}
      <div class="ln-nvt-section-title">KALENDÁŘ / PŘIPOMÍNKY</div>
      ${radek("dpv-sh","Výška tlačítek",38,68)}
      ${radek("dpv-sr","Zaoblení tlačítek",0,24)}
      ${radek("dpv-sg","Mezera tlačítek",0,24)}
      <div class="ln-nvt-actions ln-nvt-actions-bottom"><button id="dpv-copy" type="button">Kopírovat nastavení</button><button id="dpv-reset" type="button">Vše výchozí</button><button id="dpv-center" type="button">Panel doprostřed</button></div>
    </div>`;
    document.body.appendChild(panel);
    refs={head:panel.querySelector(".ln-nvt-head"),min:panel.querySelector("#dpv-min"),close:panel.querySelector("#dpv-close"),columns:panel.querySelector("#dpv-columns"),copy:panel.querySelector("#dpv-copy"),reset:panel.querySelector("#dpv-reset"),center:panel.querySelector("#dpv-center")};
    ["screen","share","grid","dayh","daygap","dayrad","dayfont","apad","arad","afont","rowpad","rowgap","time","sh","sr","sg"].forEach(k=>refs[k]=panel.querySelector(`#dpv-${k}`));
    udalosti(); obnovPozici(); refresh(); return panel;
  }

  function refresh(){ if(!panel)return; const s=api()?.ziskejStav?.(), o=api()?.ziskejVychozi?.(); if(!s||!o)return;
    setRange(refs.screen,s.kalendar.sirkaScreenu,o.kalendar.sirkaScreenu); setRange(refs.share,s.kalendar.podilKalendare,o.kalendar.podilKalendare,"%"); setRange(refs.grid,s.kalendar.sirkaMrizky,o.kalendar.sirkaMrizky); setRange(refs.dayh,s.kalendar.vyskaDne,o.kalendar.vyskaDne); setRange(refs.daygap,s.kalendar.mezeraDni,o.kalendar.mezeraDni); setRange(refs.dayrad,s.kalendar.radiusDne,o.kalendar.radiusDne); setRange(refs.dayfont,s.kalendar.pismoDne,o.kalendar.pismoDne); setRange(refs.apad,s.agenda.padding,o.agenda.padding); setRange(refs.arad,s.agenda.radius,o.agenda.radius); setRange(refs.afont,s.agenda.pismo,o.agenda.pismo); setRange(refs.rowpad,s.agenda.paddingRadku,o.agenda.paddingRadku); setRange(refs.rowgap,s.agenda.mezeraRadku,o.agenda.mezeraRadku); setRange(refs.time,s.agenda.sirkaCasu,o.agenda.sirkaCasu); setRange(refs.sh,s.subnav.vyska,o.subnav.vyska); setRange(refs.sr,s.subnav.radius,o.subnav.radius); setRange(refs.sg,s.subnav.mezera,o.subnav.mezera); refs.columns.textContent=`Agenda: ${s.agenda.sloupce} ${s.agenda.sloupce===1?"sloupec":"sloupce"}`; }
  function map(input,sekce,klic){ input.addEventListener("input",()=>api()?.nastav?.(sekce,klic,input.value)); }
  function prostredi(){return "PC/Web";} function tema(){return Array.from(document.body?.classList||[]).find(x=>x.startsWith("theme-"))||"theme-neznámé";}
  function exportText(){return ["LUBANOTE DESKTOP PLANNER VISUAL LAB EXPORT",`verze: ${window.LUBANOTE_VERSION||"DEV"}`,`prostředí: ${prostredi()}`,`téma: ${tema()}`,`čas: ${new Date().toISOString()}`,"","AKTUÁLNÍ NASTAVENÍ:",JSON.stringify(api()?.ziskejStav?.()||{},null,2)].join("\n");}
  async function kopiruj(){let ok=false;try{await navigator.clipboard.writeText(exportText());ok=true;}catch(_e){const ta=document.createElement("textarea");ta.value=exportText();document.body.appendChild(ta);ta.select();try{ok=document.execCommand("copy");}catch(_e2){}ta.remove();}const old=refs.copy.textContent;refs.copy.textContent=ok?"Zkopírováno ✓":"Kopírování selhalo";setTimeout(()=>refs.copy&&(refs.copy.textContent=old),1400);}
  function udalosti(){refs.close.addEventListener("click",zavri);refs.min.addEventListener("click",()=>{minimal=!minimal;panel.classList.toggle("ln-nvt-minimized",minimal);refs.min.textContent=minimal?"+":"—";});refs.columns.addEventListener("click",()=>{const s=api()?.ziskejStav?.();api()?.nastav?.("agenda","sloupce",s?.agenda?.sloupce===2?1:2);});refs.copy.addEventListener("click",kopiruj);refs.reset.addEventListener("click",()=>api()?.obnovVychozi?.());refs.center.addEventListener("click",vycentruj);
    map(refs.screen,"kalendar","sirkaScreenu");map(refs.share,"kalendar","podilKalendare");map(refs.grid,"kalendar","sirkaMrizky");map(refs.dayh,"kalendar","vyskaDne");map(refs.daygap,"kalendar","mezeraDni");map(refs.dayrad,"kalendar","radiusDne");map(refs.dayfont,"kalendar","pismoDne");map(refs.apad,"agenda","padding");map(refs.arad,"agenda","radius");map(refs.afont,"agenda","pismo");map(refs.rowpad,"agenda","paddingRadku");map(refs.rowgap,"agenda","mezeraRadku");map(refs.time,"agenda","sirkaCasu");map(refs.sh,"subnav","vyska");map(refs.sr,"subnav","radius");map(refs.sg,"subnav","mezera");refs.head.addEventListener("pointerdown",zacniDrag);window.addEventListener("pointermove",tahni);window.addEventListener("pointerup",konecDrag);window.addEventListener("pointercancel",konecDrag);window.addEventListener("lubanote:desktop-planner-visual-change",refresh);window.addEventListener("resize",omez);}
  function zacniDrag(e){if(e.button!==undefined&&e.button!==0)return;if(e.target.closest("button,input,select"))return;const r=panel.getBoundingClientRect();drag={id:e.pointerId,dx:e.clientX-r.left,dy:e.clientY-r.top};refs.head.setPointerCapture?.(e.pointerId);panel.classList.add("ln-nvt-dragging");e.preventDefault();}
  function lim(){const w=panel?.offsetWidth||0;return{minX:Math.min(0,70-w),maxX:Math.max(0,innerWidth-70),minY:0,maxY:Math.max(0,innerHeight-48)}}
  function tahni(e){if(!drag||e.pointerId!==drag.id)return;const l=lim();panel.style.left=`${Math.min(l.maxX,Math.max(l.minX,e.clientX-drag.dx))}px`;panel.style.top=`${Math.min(l.maxY,Math.max(l.minY,e.clientY-drag.dy))}px`;panel.style.right="auto";panel.style.bottom="auto";}
  function konecDrag(e){if(!drag||(e&&e.pointerId!==drag.id))return;drag=null;panel.classList.remove("ln-nvt-dragging");ulozPozici();}
  function ulozPozici(){try{const r=panel.getBoundingClientRect();localStorage.setItem(POS,JSON.stringify({left:r.left,top:r.top}));}catch(_e){}}
  function obnovPozici(){try{const p=JSON.parse(localStorage.getItem(POS)||"null");if(Number.isFinite(p?.left)&&Number.isFinite(p?.top)){panel.style.left=`${p.left}px`;panel.style.top=`${p.top}px`;panel.style.right="auto";requestAnimationFrame(omez);}}catch(_e){}}
  function omez(){if(!panel||panel.hidden)return;const r=panel.getBoundingClientRect(),l=lim();panel.style.left=`${Math.min(l.maxX,Math.max(l.minX,r.left))}px`;panel.style.top=`${Math.min(l.maxY,Math.max(l.minY,r.top))}px`;panel.style.right="auto";}
  function vycentruj(){const left=Math.max(8,(innerWidth-panel.offsetWidth)/2),top=Math.max(8,Math.min(90,(innerHeight-panel.offsetHeight)/2));panel.style.left=`${left}px`;panel.style.top=`${top}px`;panel.style.right="auto";ulozPozici();}
  function otevri(){if(!povoleno())return false;vytvor();panel.hidden=false;otevreny=true;refresh();requestAnimationFrame(omez);return true;}
  function zavri(){if(!panel)return false;panel.hidden=true;otevreny=false;return true;}
  window.LubaNoteDesktopPlannerVisualPanel={open:otevri,close:zavri,toggle:()=>otevreny?zavri():otevri(),isOpen:()=>otevreny,refresh,center:vycentruj};
})();
