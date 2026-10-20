/* 691K – production Android Core V2 plain-text middle-edit and Undo/Redo regression.
 * Tests only the fresh AutoTester-owned LOCAL Testy note; no real user note, SQL,
 * auth, or production sync mutation. Real shipped editor + LubaKeyboard command.
 * Programmatic selection/UI clicks are not physical finger or Android IME tests.
 */
(()=>{
'use strict';
let busy=false;
const KIND='REAL_EDITOR_PLAIN_HISTORY_691K';
const CASES=[
 ['ui-livek-open','V aplikaci – otevřít vlastní testovací poznámku'],
 ['ui-livek-plain-write','Editor – napsat nový běžný odstavec'],
 ['ui-livek-plain-middle','Editor – vložit znak uprostřed a ověřit caret'],
 ['ui-livek-plain-delete','Editor – Backspace uprostřed vrátí text i caret'],
 ['ui-livek-undo-text','Editor – skutečné Undo/Redo textové úpravy'],
 ['ui-livek-undo-format','Editor – skutečné Undo/Redo kurzívy'],
 ['ui-livek-persist','Editor – uložit, otevřít a porovnat text i formát'],
 ['ui-livek-preserve','Editor – původní Bullet a ToDo zůstaly zachovány']
];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const assert=(ok,why)=>{if(!ok)throw Error(why)};
const core=()=>window.LubaNoteEditorV2;
const blocks=()=>core()?.ziskejModel?.()?.bloky||[];
const text=b=>(b?.obsah||[]).map(s=>String(s?.text||'')).join('');
const find=value=>blocks().find(b=>text(b)===value);
const row=b=>document.querySelector('[data-ln-v2-blok="'+CSS.escape(b.id)+'"]');
const el=id=>document.getElementById(id);
const visible=e=>!!(e&&e.isConnected&&!e.hidden&&getComputedStyle(e).display!=='none'&&e.getClientRects().length);
const owned=id=>window.loadTask?.().some(n=>n?.id===id&&n.storageScope==='local'&&n.isSecret!==true&&n.tags?.includes('Testy')&&String(n.title||'').startsWith('[AutoTester 690T]'));
const hasOriginal=()=>blocks().some(b=>b.typ==='bullet')&&blocks().some(b=>b.typ==='todo');
async function button(id){
 const e=el(id),t=el('editorToolbarToggle');assert(e,'chybi_tlacitko_'+id);
 for(let n=0;n<5&&!visible(e);n++){assert(t,'chybi_prepinac_toolbar');t.click();await wait(95)}
 assert(visible(e),'neviditelne_tlacitko_'+id);return e;
}
async function open(id){
 await window.openTaskEditorById(id);await wait(160);
 assert(el('taskModal')?.hidden===false&&el('taskModal')?.dataset?.taskId===id,'otevrena_jina_poznamka');
 assert(window.LubaNoteEditorV2Bridge?.jeAktivni?.()===true,'produkci_CoreV2_neaktivni');
}
async function save(){
 const e=el('editorBackButton');assert(e&&!e.disabled,'chybi_Ulozit_a_zavrit');e.click();
 for(let n=0;n<35&&el('taskModal')?.hidden!==true;n++)await wait(100);
 assert(el('taskModal')?.hidden===true,'editor_nebyl_zavren');
 await window.LubaNoteRegularNotesStore?.cekejNaUlozeni?.();
}
function selectRange(b,start,end=start){
 const parts=row(b)?.querySelectorAll(':scope > span.ln-v2-cast[data-ln-v2-segment]')||[];
 const nodes=[];for(const part of parts){
  const walker=document.createTreeWalker(part,NodeFilter.SHOW_TEXT);let node;
  while((node=walker.nextNode()))if(node.data?.length)nodes.push(node);
 }
 assert(nodes.length>0&&nodes.map(n=>n.data).join('')===text(b),'textove_segmenty_neodpovidaji_modelu');
 assert(start>=0&&end>=start&&end<=text(b).length,'neplatna_pozice_editace');
 const domPoint=position=>{
  let left=position;
  for(const node of nodes){if(left<=node.data.length)return {node,offset:left};left-=node.data.length;}
  return {node:nodes[nodes.length-1],offset:nodes[nodes.length-1].data.length};
 };
 const first=domPoint(start),last=domPoint(end);
 const range=document.createRange();range.setStart(first.node,first.offset);range.setEnd(last.node,last.offset);
 const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
 const captured=core()?.zachytAktualniVyber?.();
 assert(captured?.zacatek?.offset===start&&captured?.konec?.offset===end&&captured.sbaleny===(start===end),
  'modelovy_caret_nesouhlasi_'+start+'_'+end);
 return captured;
}
async function plain(b){
 if(b?.typ==='odstavec')return b;
 if(b?.typ==='todo'){
  selectRange(b,0,text(b).length);(await button('addTodoButton')).click();await wait(90);
 }else{
  selectRange(b,0,text(b).length);(await button('tlacitkoBullet')).click();await wait(95);
  const p=el('editorPanelSeznam');assert(p&&!p.hidden,'panel_seznamu_neotevren');
  const off=p.querySelector('[data-ln-v2-seznam="off"]');assert(off,'chybi_volba_bezny_text');
  selectRange(b,0,text(b).length);off.click();await wait(95);
 }
 const result=blocks().find(x=>x.id===b.id);assert(result?.typ==='odstavec','nelze_prevest_na_odstavec');return result;
}
async function writePlain(value){
 const api=core();assert(api?.nastavPoziciOtevreni?.('end')===true,'nelze_nastavit_konec');
 window.getSelection()?.removeAllRanges();
 assert(api.provedPrikazVlastniKlavesnice?.('enter')===true,'enter_selhal');
 assert(api.provedPrikazVlastniKlavesnice?.('text',value)===true,'zapis_textu_selhal');
 const b=find(value);assert(b&&row(b)?.isConnected,'novy_text_neni_v_modelu_nebo_DOM');
 await plain(b);
 assert(find(value)?.typ==='odstavec','novy_text_neni_bezny_odstavec');
 return find(value);
}
function verify(value,expectedOffset=null){
 const b=find(value);assert(b?.typ==='odstavec'&&row(b)?.textContent?.includes(value),'model_nebo_DOM_nesouhlasi');
 if(expectedOffset!==null){
  const state=core()?.zachytAktualniVyber?.();
  const index=blocks().findIndex(x=>x.id===b.id);
  assert(state?.sbaleny===true&&state.konec?.blok===index&&state.konec?.offset===expectedOffset,
    'modelovy_caret_nesedi_na_pozici_'+expectedOffset);
 }
 return b;
}
function italic(value,on){
 const b=verify(value);const segs=(b.obsah||[]).filter(s=>String(s.text||'').length>0);
 assert(segs.length>0&&segs.every(s=>Boolean(s?.format?.kurziva)===on),'format_kurziva_nesouhlasi_'+on);
 if(on)assert(!!row(b)?.querySelector('.ln-v2-cast[style*="italic"]'),'kurziva_nebyla_vykreslena');
 else assert(!row(b)?.querySelector('.ln-v2-cast[style*="italic"]'),'kurziva_zustala_v_DOM');
}
async function run(id,alive=()=>true,onProgress=()=>{},minimize=()=>{},restore=()=>{}){
 if(busy)return CASES.map(([key,name])=>({id:key,name,kind:KIND,status:'APP_BLOCKED',ms:0,detail:'jiny_beh_stale_bezi'}));
 busy=true;let failed=false;const out=[];
 const seed=String(Date.now())+'_'+String(Math.floor(Math.random()*100000));
 const base='AT691K_TEXT_'+seed+'_ABCDE',fmt='AT691K_KURZIVA_'+seed;
 const offset=base.length-3;
 const altered=base.slice(0,offset)+'X'+base.slice(offset);
 const redoText=base.slice(0,offset)+'Y'+base.slice(offset);
 try{
  assert(window.LubaNoteAdminTools?.isAllowed?.()===true,'admin_neni_povolen');
  assert(owned(id),'neautorizovana_poznamka');
  assert(el('taskModal')?.hidden===true,'otevreny_cizi_editor');
  minimize();
  for(let i=0;i<CASES.length;i++){
   const [key,name]=CASES[i],tick=performance.now();let evidence='';
   assert(alive(),'beh_prerusen');onProgress('V aplikaci – text a historie '+(i+1)+'/'+CASES.length+' · '+name);
   try{
    if(i===0){await open(id);assert(hasOriginal(),'puvodni_Bullet_nebo_ToDo_chybi');evidence='Otevreny skutecny editor vlastni LOCAL Testy poznamky.';}
    else if(i===1){await writePlain(base);evidence='Novy bezny odstavec vytvoren produkcnim LubaKeyboard prikazem a overen v modelu/DOM.';}
    else if(i===2){selectRange(verify(base),offset);assert(core().provedPrikazVlastniKlavesnice('text','X')===true,'vlozeni_doprostred_selhalo');verify(altered,offset+1);evidence='Jeden znak vlozen presne doprostred, text i modelovy caret souhlasi.';}
    else if(i===3){assert(core().provedPrikazVlastniKlavesnice('backspace')===true,'backspace_selhal');verify(base,offset);evidence='Backspace smazal pouze vlozeny znak; model, DOM a caret se vratily na puvodni pozici.';}
    else if(i===4){selectRange(verify(base),offset);assert(core().provedPrikazVlastniKlavesnice('text','Y')===true,'historie_zapis_selhal');verify(redoText);
      assert(core().provedPrikazVlastniKlavesnice('undo')===true,'undo_text_selhalo');verify(base);
      assert(core().provedPrikazVlastniKlavesnice('redo')===true,'redo_text_selhalo');verify(redoText);
      evidence='Textova uprava pres produkcni LubaKeyboard ma skutecne Undo a Redo v modelu i DOM.';}
    else if(i===5){const b=await writePlain(fmt);selectRange(b,0,fmt.length);(await button('tlacitkoKurziva')).click();await wait(115);italic(fmt,true);
      assert(core().provedPrikazVlastniKlavesnice('undo')===true,'undo_kurziva_selhalo');italic(fmt,false);
      assert(core().provedPrikazVlastniKlavesnice('redo')===true,'redo_kurziva_selhalo');italic(fmt,true);
      evidence='Kurziva: skutečný toolbar, Undo zrusilo a Redo vratilo format v modelu i DOM.';}
    else if(i===6){await save();await open(id);verify(redoText);italic(fmt,true);evidence='Po ulozeni a novem otevreni zustal text po Redo i formatovani beze zmeny.';}
    else if(i===7){assert(hasOriginal(),'puvodni_Bullet_nebo_ToDo_po_testu_chybi');await save();evidence='Puvodni Bullet a ToDo zachovany, testovaci LOCAL poznamka ulozena.';}
    out.push({id:key,name,kind:KIND,status:'APP_PASS',ms:Math.round(performance.now()-tick),
      detail:evidence+' Skutecny produkcni Core V2/LubaKeyboard; programovy test, ne fyzicky prst.'});
    const factor=Number(window.LubaNoteAutoTesterVisual690F?.getSpeedFactor?.()||0);
    await wait(factor>0?Math.round(factor*480):110);
   }catch(e){failed=true;out.push({id:key,name,kind:KIND,status:'APP_FAIL',ms:Math.round(performance.now()-tick),
      detail:String(e?.message||e).slice(0,190)+' · Testovaci LOCAL poznamka je ponechana pro diagnostiku.'});break;}
  }
 }catch(e){failed=true;out.push({id:CASES[0][0],name:CASES[0][1],kind:KIND,status:'APP_BLOCKED',ms:0,detail:String(e?.message||e).slice(0,180)});}
 finally{restore();busy=false;}
 const seen=new Set(out.map(r=>r.id));for(const [key,name] of CASES)if(!seen.has(key))out.push({id:key,name,kind:KIND,status:'APP_BLOCKED',ms:0,detail:failed?'Predchozi krok selhal.':'Neprovedeno.'});
 return out;
}
window.LubaNoteAutoTesterLive691K=Object.freeze({run,expected:CASES.map(x=>x[0])});
})();
