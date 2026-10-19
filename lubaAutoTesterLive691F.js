/* 691F – production editor find + alignment UI verification on owned LOCAL Testy note.
 * Uses the real Find button, input and Prev/Next controls, toolbar alignment panel,
 * production Core V2, and save/reopen. Not a substitute for Android IME or list search.
 */
(()=>{
'use strict';
let busy=false;
const KIND='REAL_EDITOR_FIND_ALIGN_691F';
const CASES=[
 ['ui-livef-open','V aplikaci – otevřít vlastní poznámku Testy'],
 ['ui-livef-seed','V aplikaci – vložit dvě hledatelné fráze'],
 ['ui-livef-find-open','V aplikaci – otevřít hledání skutečným nástrojem'],
 ['ui-livef-find-count','V aplikaci – hledání najde oba výskyty'],
 ['ui-livef-find-navigation','V aplikaci – Další a Předchozí výsledek'],
 ['ui-livef-find-missing','V aplikaci – neexistující fráze dá 0 / 0'],
 ['ui-livef-find-close','V aplikaci – zavřít a resetovat hledání'],
 ['ui-livef-align-center','V aplikaci – zarovnat nový odstavec na střed'],
 ['ui-livef-align-right','V aplikaci – zarovnat nový odstavec vpravo'],
 ['ui-livef-align-left','V aplikaci – vrátit odstavec doleva'],
 ['ui-livef-persist','V aplikaci – uložit a znovu otevřít zarovnané odstavce'],
 ['ui-livef-find-reopen','V aplikaci – znovu hledat po uložení poznámky'],
 ['ui-livef-preserve','V aplikaci – zachovat původní Bullet a ToDo']
];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const ensure=(p,s)=>{if(!p)throw Error(s)};
const api=()=>window.LubaNoteEditorV2;
const blocks=()=>api()?.ziskejModel?.()?.bloky||[];
const text=b=>(b?.obsah||[]).map(s=>String(s?.text||'')).join('');
const find=t=>blocks().find(b=>text(b)===t);
const row=b=>document.querySelector('[data-ln-v2-blok="'+CSS.escape(b.id)+'"]');
const el=id=>document.getElementById(id);
const vis=e=>!!(e&&e.isConnected&&!e.hidden&&getComputedStyle(e).display!=='none'&&e.getClientRects().length);
const owned=id=>window.loadTask?.().some(n=>n?.id===id&&n.storageScope==='local'&&n.isSecret!==true&&n.tags?.includes('Testy')&&String(n.title||'').startsWith('[AutoTester 690T]'));
function write(label){
 ensure(api()?.nastavPoziciOtevreni?.('end')===true,'nelze_nastavit_konec');
 window.getSelection()?.removeAllRanges();
 ensure(api()?.provedPrikazVlastniKlavesnice?.('enter')===true,'enter_selhal');
 ensure(api()?.provedPrikazVlastniKlavesnice?.('text',label)===true,'zapis_textu_selhal');
 const b=find(label);ensure(b&&row(b)?.isConnected,'text_neni_v_produkcnim_DOM');return b;
}
async function open(id){
 await window.openTaskEditorById(id);await pause(150);
 ensure(el('taskModal')?.hidden===false&&el('taskModal')?.dataset.taskId===id,'otevrena_jina_poznamka');
 ensure(window.LubaNoteEditorV2Bridge?.jeAktivni?.()===true,'produkci_Bridge_neaktivni');
}
async function save(){
 const btn=el('editorBackButton');ensure(btn&&!btn.disabled,'chybi_Ulozit_zavrit');btn.click();
 for(let n=0;n<35&&el('taskModal')?.hidden!==true;n++)await pause(100);
 ensure(el('taskModal')?.hidden===true,'editor_se_nezavrel');
 await window.LubaNoteRegularNotesStore?.cekejNaUlozeni?.();
}
async function tool(id){
 const button=el(id),t=el('editorToolbarToggle');ensure(button,'chybi_tlacitko_'+id);
 for(let i=0;i<5&&!vis(button);i++){ensure(t,'chybi_prepinac_toolbar');t.click();await pause(85)}
 ensure(vis(button),'tlacitko_neni_viditelne_'+id);return button;
}
function query(word){const input=el('editorFindInput');ensure(input,'chybi_find_input');input.value=word;input.dispatchEvent(new Event('input',{bubbles:true}));}
function counter(n){ensure(el('editorFindCount')?.textContent?.trim()===n,'nesouhlasi_pocet_nalezu_'+el('editorFindCount')?.textContent+'_ocekavano_'+n);}
function select(b){
 const segment=row(b)?.querySelector(':scope > .ln-v2-cast');ensure(segment,'chybi_editovatelny_segment');
 const walker=document.createTreeWalker(segment,NodeFilter.SHOW_TEXT);const nodes=[];let next;
 while((next=walker.nextNode()))if(next.textContent?.length)nodes.push(next);
 ensure(nodes.length,'chybi_textovy_uzel');
 const r=document.createRange();r.setStart(nodes[0],0);r.setEnd(nodes[nodes.length-1],nodes[nodes.length-1].textContent.length);
 const selection=window.getSelection();selection.removeAllRanges();selection.addRange(r);
 const state=api()?.zachytAktualniVyber?.();ensure(state&&!state.sbaleny,'model_neprevzal_oznaceni');
}
async function ensurePlain(b){
 if(b.typ==='odstavec')return b;
 if(b.typ==='todo'){
  const todo=await tool('addTodoButton');select(b);todo.click();await pause(90);
 }else{
  const button=await tool('tlacitkoBullet');select(b);button.click();await pause(85);
  const panel=el('editorPanelSeznam'),off=panel?.querySelector('[data-ln-v2-seznam="off"]');
  ensure(panel&&!panel.hidden&&off,'chybi_vypnuti_seznamu');select(b);off.click();await pause(95);
 }
 const converted=blocks().find(x=>x.id===b.id);ensure(converted?.typ==='odstavec','nelze_prevest_na_bezny_odstavec');return converted;
}
async function align(label,to){
 const b=await ensurePlain(write(label));
 const button=await tool('tlacitkoZarovnaniTextu');select(b);button.click();await pause(90);
 const panel=el('editorPanelZarovnani'),choice=panel?.querySelector('[data-zarovnani="'+to+'"]');
 ensure(panel&&!panel.hidden&&choice,'chybi_volba_zarovnani_'+to);
 select(b);choice.click();await pause(125);
 const after=find(label);ensure(after?.zarovnani===to,'model_neobsahuje_zarovnani_'+to);
 const rendered=row(after);ensure(rendered?.isConnected,'zarovnany_odstavec_neni_v_DOM');
 ensure(getComputedStyle(rendered).textAlign===to,'DOM_nesouhlasi_zarovnani_'+to);
 return after;
}
function preserved(){ensure(blocks().some(x=>x.typ==='bullet')&&blocks().some(x=>x.typ==='todo'),'puvodni_Bullet_nebo_ToDo_zmizel')}
async function run(id,alive=()=>true,onProgress=()=>{},minimize=()=>{},restore=()=>{}){
 if(busy)return CASES.map(([id,name])=>({id,name,kind:KIND,status:'APP_BLOCKED',ms:0,detail:'jiny_test_prave_bezi'}));
 busy=true;const out=[];let failed=false;
 const seed=String(Date.now())+'_'+Math.floor(Math.random()*100000);
 const phrase='TESTHLEDANI_'+seed, left='FIND_691F_LEVA_'+seed,right='FIND_691F_PRAVA_'+seed;
 const f1='ZACATEK_'+phrase+'_KONEC',f2='DRUHY_'+phrase+'_KONEC';
 try{
  ensure(window.LubaNoteAdminTools?.isAllowed?.()===true,'chybi_admin_povoleni');
  ensure(owned(id),'neautorizovana_cizi_poznamka');
  ensure(el('taskModal')?.hidden===true,'jiny_editor_uz_otevren');minimize();
  for(let i=0;i<CASES.length;i++){
   const [caseId,name]=CASES[i];const started=performance.now();let proof='';
   if(!alive())throw Error('beh_prerusen');onProgress('V aplikaci – hledání a zarovnání '+(i+1)+'/'+CASES.length+' · '+name);
   try{
    if(i===0){await open(id);preserved();proof='Produkční editor otevřel vlastní Testy poznámku.';}
    else if(i===1){await ensurePlain(write(f1));await ensurePlain(write(f2));ensure(find(f1)?.typ==='odstavec'&&find(f2)?.typ==='odstavec','dve_vyhledatelne_fraze_neexistuji');proof='Oba rozdílné odstavce jsou v modelu i DOM.';}
    else if(i===2){const b=await tool('editorFindButton');b.click();await pause(90);ensure(!el('editorFindBar')?.hidden&&window.LubaNoteEditorFind?.jeOtevrene?.()===true,'realny_find_panel_neni_otevren');proof='Skutečné tlačítko Hledat otevřelo produkční panel.';}
    else if(i===3){query(phrase);await pause(95);counter('1 / 2');ensure(!el('editorFindNext')?.disabled,'navigace_neni_povolena');proof='Produkční Find našel dva přesné výskyty.';}
    else if(i===4){el('editorFindNext').click();await pause(45);counter('2 / 2');el('editorFindPrev').click();await pause(45);counter('1 / 2');proof='Další i Předchozí mění aktivní výsledek.';}
    else if(i===5){query('NENALEZITELNY_RETEZEC_'+seed);await pause(60);counter('0 / 0');ensure(el('editorFindNext')?.disabled&&el('editorFindPrev')?.disabled,'navigace_povolena_bez_nalezu');proof='Nenalezená fráze vrací 0 / 0 a deaktivuje navigaci.';}
    else if(i===6){el('editorFindClose').click();await pause(50);ensure(el('editorFindBar')?.hidden&&el('editorFindInput')?.value==='','find_panel_se_nezavrel_nebo_nevymazal');(await tool('editorFindButton')).click();await pause(70);ensure(!el('editorFindBar')?.hidden&&el('editorFindInput')?.value==='','novy_find_nezacina_prazdny');el('editorFindClose').click();proof='Zavření smaže dotaz, nové otevření začíná prázdné.';}
    else if(i===7){await align(left,'center');proof='Skutečná paleta Zarovnání změnila model i DOM na střed.';}
    else if(i===8){await align(right,'right');proof='Skutečná paleta Zarovnání změnila model i DOM vpravo.';}
    else if(i===9){const b=find(right);const button=await tool('tlacitkoZarovnaniTextu');select(b);button.click();await pause(65);ensure(!el('editorPanelZarovnani')?.hidden,'panel_zarovnani_se_neotevrel');select(b);el('editorPanelZarovnani').querySelector('[data-zarovnani="left"]').click();await pause(95);ensure(find(right)?.zarovnani==='left'&&getComputedStyle(row(find(right))).textAlign==='left','navrat_doleva_neprosel');proof='Zarovnání lze přes skutečnou paletu vrátit doleva.';}
    else if(i===10){await save();await open(id);ensure(find(left)?.zarovnani==='center'&&find(right)?.zarovnani==='left','zarovnani_se_ztratilo_po_ulozeni');ensure(find(f1)&&find(f2),'hledatelny_text_se_ztratil_po_ulozeni');proof='Zarovnání i obě fráze přežily Uložit a znovuotevření.';}
    else if(i===11){(await tool('editorFindButton')).click();await pause(75);ensure(!el('editorFindBar')?.hidden,'find_po_reopen_neotevren');query(phrase);await pause(85);counter('1 / 2');el('editorFindClose').click();proof='Hledání stále funguje po znovuotevření poznámky.';}
    else if(i===12){preserved();await save();proof='Původní Bullet a ToDo zůstaly zachované, testovací LOCAL poznámka je uložená.';}
    out.push({id:caseId,name,kind:KIND,status:'APP_PASS',ms:Math.round(performance.now()-started),detail:proof+' Produkční UI/Core V2; programová aktivace, ne fyzický prst.'});
    const sf=Number(window.LubaNoteAutoTesterVisual690F?.getSpeedFactor?.()||0);await pause(sf>0?Math.round(sf*540):100);
   }catch(e){failed=true;out.push({id:caseId,name,kind:KIND,status:'APP_FAIL',ms:Math.round(performance.now()-started),detail:String(e?.message||e).slice(0,220)+' · Poznámka Testy ponechána pro diagnostiku.'});break;}
  }
 }catch(e){failed=true;out.push({id:CASES[0][0],name:CASES[0][1],kind:KIND,status:'APP_BLOCKED',ms:0,detail:String(e?.message||e).slice(0,220)});}
 finally{try{window.LubaNoteEditorFind?.zavri?.()}catch(_e){}restore();busy=false;}
 const seen=new Set(out.map(x=>x.id));for(const [caseId,name] of CASES)if(!seen.has(caseId))out.push({id:caseId,name,kind:KIND,status:'APP_BLOCKED',ms:0,detail:failed?'Předchozí živý scénář selhal.':'Neprovedeno.'});
 return out;
}
window.LubaNoteAutoTesterLive691F=Object.freeze({run,expected:CASES.map(([id])=>id)});
})();
