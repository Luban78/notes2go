/* ==================================================
   LubaNote – plovoucí PC Visual Lab Poznámek
   PATCH 658AC – plná verze jako APK
================================================== */
(() => {
  "use strict";
  const PANEL_ID = "ln-dnvt-panel";
  const STORAGE_POS = "lubanoteDesktopNotesVisualPanelPosV1";
  const META = {
    modules: { label: "Poznámky / Plán / Dokumenty", size: "Výška tlačítek", min: 42, max: 76 },
    traffic: { label: "RX/TX/E panel", size: "Výška panelu", min: 16, max: 42 },
    search: { label: "Hledání", size: "Šířka hledání", min: 220, max: 700 },
    primary: { label: "Vše / ⭐ / Koš / oko / Práce / Domů", size: "Šířka filtru", min: 38, max: 76 },
    actions: { label: "Rozložení / obálka / chat / menu", size: "Šířka akce", min: 38, max: 76 },
    tags: { label: "Vlastní štítky", size: "Výška štítku", min: 28, max: 58 },
    cards: { label: "Karty poznámek", size: "Vnitřní odsazení", min: 8, max: 30 },
    fab: { label: "Plovoucí +", size: "Velikost +", min: 48, max: 88 }
  };

  let panel = null, refs = {}, drag = null, jeOtevreny = false, jeMinimalizovany = false;
  function api() { return window.LubaNoteDesktopNotesVisualTuning || null; }
  function povoleno() { return window.LubaNoteAdminTools?.isAllowed?.() === true; }
  function format(v, unit = "px") { const n = Number(v ?? 0); const t = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""); return `${t} ${unit}`; }
  function rangeRadek({id,label,min,max,step=1,unit="px"}) { return `<label class="ln-nvt-row" for="${id}"><span class="ln-nvt-label">${label}</span><span class="ln-nvt-range-line"><output class="ln-nvt-original" data-original-for="${id}">Pův. —</output><input id="${id}" type="range" min="${min}" max="${max}" step="${step}"><output class="ln-nvt-current" data-current-for="${id}">—</output></span></label>`; }

  function vytvorPanel() {
    if (panel) return panel;
    panel = document.createElement("section"); panel.id = PANEL_ID; panel.hidden = true;
    panel.innerHTML = `<header class="ln-nvt-head"><div class="ln-nvt-title"><strong>🖥️ Poznámky PC – živé ladění</strong><small id="ln-dnvt-subtitle">Hledání</small></div><button id="ln-dnvt-minimize" class="ln-nvt-icon" type="button">—</button><button id="ln-dnvt-close" class="ln-nvt-icon" type="button">×</button></header>
    <div class="ln-nvt-body">
      <label class="ln-nvt-row"><span class="ln-nvt-label">Prvek</span><select id="ln-dnvt-target" class="ln-nvt-select">${Object.entries(META).map(([id,m])=>`<option value="${id}">${m.label}</option>`).join("")}</select></label>
      <div class="ln-nvt-actions"><button id="ln-dnvt-border" type="button">Border: Zapnuto</button><button id="ln-dnvt-reset-target" type="button">Reset prvku</button></div>
      <label class="ln-nvt-row"><span class="ln-nvt-label">Odstín borderu</span><select id="ln-dnvt-mode" class="ln-nvt-select"><option value="dark">Tmavší barva</option><option value="light">Světlejší barva</option><option value="legacy">Původní</option></select></label>
      ${rangeRadek({id:"ln-dnvt-width",label:"Šířka borderu",min:.5,max:8,step:.5})}
      ${rangeRadek({id:"ln-dnvt-strength",label:"Síla odstínu",min:0,max:70,unit:"%"})}
      ${rangeRadek({id:"ln-dnvt-radius",label:"Zaoblení rohů",min:0,max:44})}
      ${rangeRadek({id:"ln-dnvt-size",label:"Velikost prvku",min:8,max:700})}
      <div id="ln-dnvt-svg" hidden><div class="ln-nvt-section-title">SVG ikony</div>${rangeRadek({id:"ln-dnvt-icon-size",label:"Velikost SVG ikony",min:14,max:32})}${rangeRadek({id:"ln-dnvt-icon-stroke",label:"Tloušťka SVG čáry",min:.8,max:2.4,step:.05})}</div>
      <div class="ln-nvt-section-title">Rozložení hlavního screenu</div>
      ${rangeRadek({id:"ln-dnvt-offset",label:"Posun obsahu Y",min:-20,max:30})}
      ${rangeRadek({id:"ln-dnvt-toolbar-height",label:"Výška hledání + filtrů + akcí",min:38,max:72})}
      ${rangeRadek({id:"ln-dnvt-toolbar-gap",label:"Mezera prvků horní řady",min:0,max:22})}
      ${rangeRadek({id:"ln-dnvt-filter-gap",label:"Mezera rychlých filtrů",min:0,max:18})}
      ${rangeRadek({id:"ln-dnvt-toolbar-tags-gap",label:"Mezera horní řada ↕ štítky",min:0,max:24})}
      ${rangeRadek({id:"ln-dnvt-tags-gap",label:"Mezera mezi štítky",min:0,max:20})}
      ${rangeRadek({id:"ln-dnvt-tags-cards-gap",label:"Mezera štítky ↕ karty",min:0,max:36})}
      ${rangeRadek({id:"ln-dnvt-card-col-gap",label:"Mezera sloupců karet",min:0,max:36})}
      ${rangeRadek({id:"ln-dnvt-card-row-gap",label:"Mezera řádků karet",min:0,max:36})}
      <div class="ln-nvt-actions ln-nvt-actions-bottom"><button id="ln-dnvt-copy" type="button">Kopírovat nastavení</button><button id="ln-dnvt-reset-all" type="button">Vše výchozí</button><button id="ln-dnvt-center" type="button">Panel doprostřed</button></div>
    </div>`;
    document.body.appendChild(panel);
    refs = Object.fromEntries([
      ["head",".ln-nvt-head"],["subtitle","#ln-dnvt-subtitle"],["minimize","#ln-dnvt-minimize"],["close","#ln-dnvt-close"],["target","#ln-dnvt-target"],["border","#ln-dnvt-border"],["resetTarget","#ln-dnvt-reset-target"],["mode","#ln-dnvt-mode"],["width","#ln-dnvt-width"],["strength","#ln-dnvt-strength"],["radius","#ln-dnvt-radius"],["size","#ln-dnvt-size"],["svg","#ln-dnvt-svg"],["iconSize","#ln-dnvt-icon-size"],["iconStroke","#ln-dnvt-icon-stroke"],["offset","#ln-dnvt-offset"],["toolbarHeight","#ln-dnvt-toolbar-height"],["toolbarGap","#ln-dnvt-toolbar-gap"],["filterGap","#ln-dnvt-filter-gap"],["toolbarTagsGap","#ln-dnvt-toolbar-tags-gap"],["tagsGap","#ln-dnvt-tags-gap"],["tagsCardsGap","#ln-dnvt-tags-cards-gap"],["cardColGap","#ln-dnvt-card-col-gap"],["cardRowGap","#ln-dnvt-card-row-gap"],["copy","#ln-dnvt-copy"],["resetAll","#ln-dnvt-reset-all"],["center","#ln-dnvt-center"]
    ].map(([k,s])=>[k,panel.querySelector(s)]));
    refs.sizeLabel = panel.querySelector('label[for="ln-dnvt-size"] .ln-nvt-label');
    registrujUdalosti(); obnovPozici(); aktualizuj(); return panel;
  }

  function nastavRange(input, aktualni, puvodni, unit="px") { if (!input) return; input.value=String(aktualni); const o=panel.querySelector(`[data-original-for="${input.id}"]`), c=panel.querySelector(`[data-current-for="${input.id}"]`); const f=v=>unit==="%"?`${Math.round(Number(v||0))} %`:format(v,unit); if(o)o.textContent=`Pův. ${f(puvodni)}`; if(c)c.textContent=f(aktualni); }
  function aktualizuj() {
    if (!panel) return; const a=api(), s=a?.ziskejStav?.(), v=a?.ziskejVychozi?.(); if(!s?.prvky||!s?.layout||!v?.prvky||!v?.layout)return;
    const id=s.vybranyPrvek||"search", p=s.prvky[id], o=v.prvky[id], m=META[id]; refs.target.value=id; refs.subtitle.textContent=m.label; refs.border.textContent=`Border: ${p.borderZapnuty?"Zapnuto":"Vypnuto"}`; refs.border.setAttribute("aria-pressed",String(p.borderZapnuty===true)); refs.mode.value=p.borderRezim||"legacy"; refs.size.min=String(m.min); refs.size.max=String(m.max); refs.sizeLabel.textContent=m.size;
    nastavRange(refs.width,p.borderSirka,o.borderSirka); nastavRange(refs.strength,p.borderSila,o.borderSila,"%"); nastavRange(refs.radius,p.radius,o.radius); nastavRange(refs.size,p.velikost,o.velikost);
    refs.svg.hidden=!(id==="primary"||id==="actions"); if(!refs.svg.hidden){nastavRange(refs.iconSize,p.ikonaVelikost,o.ikonaVelikost);nastavRange(refs.iconStroke,p.ikonaTloustka,o.ikonaTloustka);}
    for (const [ref,k] of [[refs.offset,"offsetY"],[refs.toolbarHeight,"toolbarVyska"],[refs.toolbarGap,"toolbarMezera"],[refs.filterGap,"filtryMezera"],[refs.toolbarTagsGap,"toolbarStitkyMezera"],[refs.tagsGap,"stitkyMezera"],[refs.tagsCardsGap,"stitkyKartyMezera"],[refs.cardColGap,"kartySloupceMezera"],[refs.cardRowGap,"kartyRadkyMezera"]]) nastavRange(ref,s.layout[k],v.layout[k]);
  }
  function nastavPrvek(k,v){const a=api(),id=a?.ziskejStav?.()?.vybranyPrvek||"search";a?.nastavPrvekHodnotu?.(id,k,v);} function nastavLayout(k,v){api()?.nastavLayoutHodnotu?.(k,v);}
  function tema(){return Array.from(document.body?.classList||[]).find(x=>x.startsWith("theme-"))||"theme-neznámé";}
  function vytvorExport(){return ["LUBANOTE DESKTOP NOTES VISUAL LAB EXPORT",`verze: ${window.LUBANOTE_VERSION||"DEV"}`,"prostředí: PC/Web",`téma: ${tema()}`,`čas: ${new Date().toISOString()}`,"","AKTUÁLNÍ NASTAVENÍ:",JSON.stringify(api()?.ziskejStav?.()||{},null,2)].join("\n");}
  function fallbackKopie(t){const x=document.createElement("textarea");x.value=t;x.style.position="fixed";x.style.opacity="0";document.body.appendChild(x);x.focus();x.select();let ok=false;try{ok=document.execCommand("copy");}catch(_e){}x.remove();return ok;}
  async function zkopirujText(t){try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(t);return true;}}catch(_e){}return fallbackKopie(t);} async function zkopirujNastaveni(){const ok=await zkopirujText(vytvorExport()),old=refs.copy.textContent;refs.copy.textContent=ok?"Zkopírováno ✓":"Kopírování selhalo";setTimeout(()=>{if(refs.copy)refs.copy.textContent=old;},1400);}
  function registrujUdalosti(){refs.close.addEventListener("click",zavri);refs.minimize.addEventListener("click",()=>{jeMinimalizovany=!jeMinimalizovany;panel.classList.toggle("ln-nvt-minimized",jeMinimalizovany);refs.minimize.textContent=jeMinimalizovany?"+":"—";});refs.target.addEventListener("change",()=>api()?.nastavVybranyPrvek?.(refs.target.value));refs.border.addEventListener("click",()=>{const s=api()?.ziskejStav?.(),id=s?.vybranyPrvek,p=id?s?.prvky?.[id]:null;if(id&&p)api()?.nastavPrvekHodnotu?.(id,"borderZapnuty",!p.borderZapnuty);});refs.resetTarget.addEventListener("click",()=>api()?.obnovVybranyPrvek?.());refs.mode.addEventListener("change",()=>nastavPrvek("borderRezim",refs.mode.value));refs.width.addEventListener("input",()=>nastavPrvek("borderSirka",refs.width.value));refs.strength.addEventListener("input",()=>nastavPrvek("borderSila",refs.strength.value));refs.radius.addEventListener("input",()=>nastavPrvek("radius",refs.radius.value));refs.size.addEventListener("input",()=>nastavPrvek("velikost",refs.size.value));refs.iconSize.addEventListener("input",()=>nastavPrvek("ikonaVelikost",refs.iconSize.value));refs.iconStroke.addEventListener("input",()=>nastavPrvek("ikonaTloustka",refs.iconStroke.value));refs.offset.addEventListener("input",()=>nastavLayout("offsetY",refs.offset.value));refs.toolbarHeight.addEventListener("input",()=>nastavLayout("toolbarVyska",refs.toolbarHeight.value));refs.toolbarGap.addEventListener("input",()=>nastavLayout("toolbarMezera",refs.toolbarGap.value));refs.filterGap.addEventListener("input",()=>nastavLayout("filtryMezera",refs.filterGap.value));refs.toolbarTagsGap.addEventListener("input",()=>nastavLayout("toolbarStitkyMezera",refs.toolbarTagsGap.value));refs.tagsGap.addEventListener("input",()=>nastavLayout("stitkyMezera",refs.tagsGap.value));refs.tagsCardsGap.addEventListener("input",()=>nastavLayout("stitkyKartyMezera",refs.tagsCardsGap.value));refs.cardColGap.addEventListener("input",()=>nastavLayout("kartySloupceMezera",refs.cardColGap.value));refs.cardRowGap.addEventListener("input",()=>nastavLayout("kartyRadkyMezera",refs.cardRowGap.value));refs.copy.addEventListener("click",zkopirujNastaveni);refs.resetAll.addEventListener("click",()=>api()?.obnovVychozi?.());refs.center.addEventListener("click",vycentruj);refs.head.addEventListener("pointerdown",zacniDrag);window.addEventListener("pointermove",tahni);window.addEventListener("pointerup",ukonciDrag);window.addEventListener("pointercancel",ukonciDrag);window.addEventListener("lubanote:desktop-notes-visual-tuning-change",aktualizuj);window.addEventListener("resize",omezDoViewportu);}
  function zacniDrag(e){if(e.button!==undefined&&e.button!==0)return;if(e.target.closest("button,select,input"))return;const r=panel.getBoundingClientRect();drag={pointerId:e.pointerId,dx:e.clientX-r.left,dy:e.clientY-r.top};refs.head.setPointerCapture?.(e.pointerId);panel.classList.add("ln-nvt-dragging");e.preventDefault();}
  function hranicePanelu(){const w=panel?.offsetWidth||0,x=Math.min(72,Math.max(52,Math.round(w*.2)));return{minX:Math.min(0,x-w),maxX:Math.max(0,window.innerWidth-x),minY:0,maxY:Math.max(0,window.innerHeight-48)};} function tahni(e){if(!drag||e.pointerId!==drag.pointerId)return;const l=hranicePanelu();panel.style.left=`${Math.min(l.maxX,Math.max(l.minX,e.clientX-drag.dx))}px`;panel.style.top=`${Math.min(l.maxY,Math.max(l.minY,e.clientY-drag.dy))}px`;panel.style.right="auto";panel.style.bottom="auto";} function ukonciDrag(e){if(!drag||(e&&e.pointerId!==drag.pointerId))return;drag=null;panel.classList.remove("ln-nvt-dragging");ulozPozici();}
  function ulozPozici(){if(!panel)return;try{const r=panel.getBoundingClientRect();localStorage.setItem(STORAGE_POS,JSON.stringify({left:r.left,top:r.top}));}catch(_e){}} function obnovPozici(){if(!panel)return;try{const p=JSON.parse(localStorage.getItem(STORAGE_POS)||"null");if(!Number.isFinite(p?.left)||!Number.isFinite(p?.top))return;panel.style.left=`${p.left}px`;panel.style.top=`${p.top}px`;panel.style.right="auto";panel.style.bottom="auto";}catch(_e){}}
  function omezDoViewportu(){if(!panel||panel.hidden)return;const r=panel.getBoundingClientRect(),l=hranicePanelu();panel.style.left=`${Math.min(l.maxX,Math.max(l.minX,r.left))}px`;panel.style.top=`${Math.min(l.maxY,Math.max(l.minY,r.top))}px`;panel.style.right="auto";panel.style.bottom="auto";} function vycentruj(){if(!panel)return;panel.style.left=`${Math.max(8,(window.innerWidth-panel.offsetWidth)/2)}px`;panel.style.top=`${Math.max(8,Math.min(110,(window.innerHeight-panel.offsetHeight)/2))}px`;panel.style.right="auto";panel.style.bottom="auto";ulozPozici();}
  function otevri(){if(!povoleno())return false;vytvorPanel();panel.hidden=false;jeOtevreny=true;aktualizuj();requestAnimationFrame(omezDoViewportu);return true;} function zavri(){if(!panel)return false;panel.hidden=true;jeOtevreny=false;return true;}
  window.LubaNoteDesktopNotesVisualPanel={open:otevri,close:zavri,toggle:()=>jeOtevreny?zavri():otevri,isOpen:()=>jeOtevreny,refresh:aktualizuj,center:vycentruj};
})();
