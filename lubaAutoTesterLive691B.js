/* 691B – visible REAL editor format/color/heading regression.
 * Only existing AutoTester-owned LOCAL Testy note; retains it for inspection.
 * Uses actual toolbar/menu click path and shipped Core V2 model, DOM and persistence.
 * Programmatic UI activation – NOT physical touch or Android IME verification.
 */
(()=>{
'use strict';
let busy=false;
const KIND='REAL_EDITOR_FORMAT_COLORS_691B';
const cases=[
 ['ui-liveb-open','V aplikaci – otevřít vlastní poznámku Testy'],
 ['ui-liveb-italic','V aplikaci – označit text a zapnout kurzívu'],
 ['ui-liveb-underline','V aplikaci – označit text a zapnout podtržení'],
 ['ui-liveb-color','V aplikaci – vybrat barvu písma v paletě'],
 ['ui-liveb-highlight','V aplikaci – vybrat podbarvení textu'],
 ['ui-liveb-heading','V aplikaci – nastavit nadpis H2'],
 ['ui-liveb-size','V aplikaci – nastavit velikost písma 24'],
 ['ui-liveb-highlight-clear','V aplikaci – odstranit podbarvení výběru'],
 ['ui-liveb-persist','V aplikaci – uložit a znovu otevřít formátovaný text'],
 ['ui-liveb-neighbors','V aplikaci – zachovat dosavadní Bullet a ToDo']
];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const ensure=(x,m)=>{if(!x)throw Error(m)};
const core=()=>window.LubaNoteEditorV2;
const blocks=()=>core()?.ziskejModel?.()?.bloky||[];
const contents=b=>(b?.obsah||[]).map(x=>String(x?.text||'')).join('');
const find=label=>blocks().find(x=>contents(x)===label);
const owned=id=>window.loadTask?.().find(n=>n?.id===id&&n.storageScope==='local'&&n.isSecret!==true&&n.tags?.includes('Testy')&&String(n.title||'').startsWith('[AutoTester 690T]'));
const row=b=>document.querySelector('[data-ln-v2-blok="'+CSS.escape(b.id)+'"]');
const visible=e=>!!(e&&!e.hidden&&e.isConnected&&getComputedStyle(e).display!=='none'&&e.getClientRects().length);
const cssColor=v=>{const tmp=document.createElement('span');tmp.style.color=String(v||'');return tmp.style.color||''};
const formatMatches=(b,key,val)=>{
 const segments=(b?.obsah||[]).filter(x=>String(x?.text||'').length);
 return segments.length>0&&segments.every(x=>val===null?!x?.format?.[key]:(key==='barva'||key==='pozadi')?Boolean(x?.format?.[key])&&cssColor(x.format[key])===cssColor(val):x?.format?.[key]===val);
};
const verify=(label,key,val,domCheck)=>{
 const b=find(label);ensure(b,'chybi_text_'+key);
 ensure(formatMatches(b,key,val),'model_format_'+key+'_neni_'+val);
 const el=row(b);ensure(el?.isConnected,'formatovany_radek_neni_v_DOM');
 if(domCheck)ensure(domCheck(el),'vykresleny_format_'+key+'_nesouhlasi');
 return b;
};
async function button(id){
 const e=document.getElementById(id),toggle=document.getElementById('editorToolbarToggle');ensure(e,'chybi_tlacitko_'+id);
 for(let n=0;n<4&&!visible(e);n++){ensure(toggle,'chybi_prepinac_toolbar');toggle.click();await pause(115)}
 ensure(visible(e),'tlacitko_neni_videt_'+id);return e;
}
function write(label){
 const api=core();ensure(api?.nastavPoziciOtevreni?.('end')===true,'nelze_nastavit_konec');
 window.getSelection()?.removeAllRanges();
 ensure(api.provedPrikazVlastniKlavesnice?.('enter')===true,'enter_selhal');
 ensure(api.provedPrikazVlastniKlavesnice?.('text',label)===true,'vkladani_textu_selhalo');
 const b=find(label);ensure(b,'vlozeny_text_chybi');ensure(row(b)?.isConnected,'text_se_nevykreslil');return b;
}
function select(b){
 const el=row(b)?.querySelector(':scope > .ln-v2-cast');ensure(el,'chybi_oznacitelny_textovy_segment');
 const nodes=[];const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let node;
 while((node=walker.nextNode()))if(node.textContent?.length)nodes.push(node);
 ensure(nodes.length>0,'chybi_textovy_uzel_pro_oznaceni');
 const rng=document.createRange();rng.setStart(nodes[0],0);rng.setEnd(nodes[nodes.length-1],nodes[nodes.length-1].textContent.length);
 const selection=window.getSelection();selection.removeAllRanges();selection.addRange(rng);
 const state=core()?.zachytAktualniVyber?.();
 ensure(state&&!state.sbaleny,'modelovy_vyber_se_neaktivoval');
 ensure(state.zacatek?.offset===0&&state.konec?.offset===contents(b).length,'vyber_nerozsahuje_cely_text');
 return state;
}
async function palette(openButton,panel,choice,selectedBlock){
 (await button(openButton)).click();await pause(105);
 const p=document.getElementById(panel);ensure(p&&!p.hidden,'paleta_se_neotevrela_'+panel);
 const selected=p.querySelector(choice);ensure(selected,'chybi_volba_v_palete_'+choice);
 select(selectedBlock);selected.click();await pause(125);ensure(p.hidden,'paleta_se_nezavrela_'+panel);
}
async function plain(b){
 if(b?.typ==='odstavec')return b;
 if(b.typ==='todo'){const toggle=await button('addTodoButton');select(b);toggle.click();await pause(105);const after=blocks().find(x=>x.id===b.id);ensure(after?.typ==='odstavec','nelze_vypnout_ToDo');return after;}
 const tool=await button('tlacitkoBullet');select(b);tool.click();await pause(90);
 const panel=document.getElementById('editorPanelSeznam');ensure(panel&&!panel.hidden,'panel_seznamu_se_neotevrel');
 const off=panel.querySelector('[data-ln-v2-seznam="off"]');ensure(off,'chybi_volba_bezny_text');
 select(b);off.click();await pause(100);
 const after=blocks().find(x=>x.id===b.id);ensure(after?.typ==='odstavec','nelze_vypnout_ToDo_pred_formatovanim');return after;
}
async function writePlain(label){return await plain(write(label));}
async function save(){
 const btn=document.getElementById('editorBackButton');ensure(btn&&!btn.disabled,'chybi_Ulozit_zavrit');btn.click();
 for(let i=0;i<35&&document.getElementById('taskModal')?.hidden!==true;i++)await pause(110);
 ensure(document.getElementById('taskModal')?.hidden===true,'editor_se_nezavrel');
 await window.LubaNoteRegularNotesStore?.cekejNaUlozeni?.();
}
async function open(id){
 await window.openTaskEditorById(id);await pause(175);
 ensure(document.getElementById('taskModal')?.hidden===false,'editor_se_neotevrel');
 ensure(document.getElementById('taskModal')?.dataset?.taskId===id,'spatna_poznamka');
 ensure(window.LubaNoteEditorV2Bridge?.jeAktivni?.()===true,'produkcnI_Bridge_neni_aktivni');
}
function preserve(){
 const todo=blocks().some(b=>b.typ==='todo');
 const bullet=blocks().some(b=>b.typ==='bullet');
 ensure(todo&&bullet,'puvodni_todo_nebo_bullet_zmizel');return {todo,bullet};
}
async function run(id,alive=()=>true,onProgress=()=>{},minimize=()=>{},restore=()=>{}){
 if(busy)return cases.map(([id,name])=>({id,name,kind:KIND,status:'APP_BLOCKED',ms:0,detail:'jiný_test_stále_běží'}));
 busy=true;const out=[];let failure=false;
 const seed=String(Date.now())+'_'+Math.floor(Math.random()*100000);
 const labels={italic:'AT_691B_KURZIVA_'+seed,underline:'AT_691B_PODTRZENO_'+seed,color:'AT_691B_BARVA_'+seed,highlight:'AT_691B_POZADI_'+seed,heading:'AT_691B_NADPIS_'+seed,size:'AT_691B_VELIKOST_'+seed,clear:'AT_691B_ODSTRANIT_PODBARVENI_'+seed};
 try{
  ensure(window.LubaNoteAdminTools?.isAllowed?.()===true,'admin_povoleni_chybi');
  ensure(owned(id),'neautorizovana_nebo_cizi_poznamka');
  ensure(document.getElementById('taskModal')?.hidden===true,'jina_poznamka_je_otevrena');
  minimize();
  for(let i=0;i<cases.length;i++){
   const [code,name]=cases[i],start=performance.now();let proof='';
   if(!alive())throw Error('beh_prerusen');onProgress('V aplikaci – formátování '+(i+1)+'/'+cases.length+' · '+name);
   try{
    if(i===0){await open(id);preserve();proof='Otevřena vlastní poznámka; Bullet i ToDo stále existují.'}
    else if(i===1){const b=await writePlain(labels.italic);const el=await button('tlacitkoKurziva');select(b);el.click();await pause(140);
      verify(labels.italic,'kurziva',true,el=>!!el.querySelector('.ln-v2-cast[style*="italic"]'));proof='Skutečné tlačítko Kurzíva změnilo model i DOM.';}
    else if(i===2){const b=await writePlain(labels.underline);const el=await button('tlacitkoPodtrzeni');select(b);el.click();await pause(140);
      verify(labels.underline,'podtrzeni',true,el=>!!el.querySelector('.ln-v2-cast[style*="underline"]'));proof='Skutečné tlačítko Podtržení změnilo model i DOM.';}
    else if(i===3){const b=await writePlain(labels.color);await palette('textColorButton','textColorPanel','[data-text-color="#ff6b6b"]',b);
      verify(labels.color,'barva','#ff6b6b',el=>!!el.querySelector('.ln-v2-cast[style*="color"]'));proof='Paleta barvy písma nastavila #ff6b6b v modelu a DOM.';}
    else if(i===4){const b=await writePlain(labels.highlight);await palette('colorTaskButton','textColorPalette','[data-highlight-color="#fff59d"]',b);
      verify(labels.highlight,'pozadi','#fff59d',el=>!!el.querySelector('.ln-v2-cast[style*="background-color"]'));proof='Zvýrazňovací paleta nastavila #fff59d v modelu a DOM.';}
    else if(i===5){const b=await writePlain(labels.heading);await palette('tlacitkoNadpis','editorPanelStyl','[data-styl="h2"]',b);
      verify(labels.heading,'stylTextu','h2',el=>!!el.querySelector('.ln-v2-h2'));proof='Styl H2 je v modelu a DOM (bez falešného použití font-size).';}
    else if(i===6){const b=await writePlain(labels.size);await palette('tlacitkoVelikostPisma','editorPanelVelikost','[data-velikost="24"]',b);
      verify(labels.size,'velikost',24,el=>!!el.querySelector('.ln-v2-cast[style*="font-size"]'));proof='Volba 24 nastavila explicitní modelovou velikost i DOM.';}
    else if(i===7){const b=await writePlain(labels.clear);await palette('colorTaskButton','textColorPalette','[data-highlight-color="#a5d6a7"]',b);
      verify(labels.clear,'pozadi','#a5d6a7');await palette('colorTaskButton','textColorPalette','[data-highlight-remove]',find(labels.clear));
      verify(labels.clear,'pozadi',null);proof='Podbarvení nejprve aplikováno a poté odstraněno, kontrola modelu.';}
    else if(i===8){await save();await open(id);
      verify(labels.italic,'kurziva',true);verify(labels.underline,'podtrzeni',true);verify(labels.color,'barva','#ff6b6b');
      verify(labels.highlight,'pozadi','#fff59d');verify(labels.heading,'stylTextu','h2');verify(labels.size,'velikost',24);verify(labels.clear,'pozadi',null);
      proof='Po skutečném Uložit a zavřít / znovuotevření přetrvalo všech sedm formátovacích stavů.';}
    else if(i===9){preserve();await save();proof='Původní Bullet a ToDo přežily změny i znovuotevření; testovací poznámka zůstává pro prohlédnutí.';}
    out.push({id:code,name,kind:KIND,status:'APP_PASS',ms:Math.round(performance.now()-start),detail:proof+' Produkční Core V2 / UI, programová aktivace skutečných tlačítek; ne fyzický prst.'});
    const factor=Number(window.LubaNoteAutoTesterVisual690F?.getSpeedFactor?.()||0);
    await pause(factor>0?Math.round(480*factor):105);
   }catch(e){failure=true;out.push({id:code,name,kind:KIND,status:'APP_FAIL',ms:Math.round(performance.now()-start),detail:String(e?.message||e).slice(0,200)+'; LOCAL Testy poznámka zachována pro diagnostiku.'});break;}
  }
 }catch(e){failure=true;out.push({id:cases[0][0],name:cases[0][1],kind:KIND,status:'APP_BLOCKED',ms:0,detail:String(e?.message||e).slice(0,200)});}
 finally{restore();busy=false;}
 const done=new Set(out.map(x=>x.id));for(const [id,name] of cases)if(!done.has(id))out.push({id,name,kind:KIND,status:'APP_BLOCKED',ms:0,detail:failure?'Předchozí krok selhal – nebyl proveden.':'Neprovedeno.'});
 return out;
}
window.LubaNoteAutoTesterLive691B=Object.freeze({run,expected:cases.map(([id])=>id)});
})();
