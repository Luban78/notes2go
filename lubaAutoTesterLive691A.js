/* 691A: Real LubaNote editor regression for MIXED CONTENT + TODO Backspace.
 * Uses OWNED LOCAL Testy note only; does not touch user notes or alter production editor.
 * Actual toolbar and LubaKeyboard commands, checks production Core V2 model/DOM/persistence.
 * Not a physical finger nor an Android OS keyboard test.
 */
(()=>{
'use strict';
let busy=false;
const KIND='REAL_EDITOR_MIXED_TODO_691A';
const testCases=[
 ['ui-livea-open','V aplikaci – otevřít vlastní poznámku Testy'],
 ['ui-livea-heading','V aplikaci – běžný text vedle ToDo'],
 ['ui-livea-previous','V aplikaci – vytvořit předchozí ToDo'],
 ['ui-livea-middle','V aplikaci – vytvořit prostřední ToDo pro mazání'],
 ['ui-livea-next','V aplikaci – vytvořit následující ToDo'],
 ['ui-livea-reload','V aplikaci – uložit a otevřít smíšený obsah'],
 ['ui-livea-clear','V aplikaci – Backspace smaže text, kolečko zůstává'],
 ['ui-livea-delete','V aplikaci – další Backspace smaže kolečko a vrátí caret dozadu'],
 ['ui-livea-persist','V aplikaci – uložit a ověřit sousední ToDo']
];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const check=(yes,reason)=>{if(!yes)throw Error(reason)};
const api=()=>window.LubaNoteEditorV2;
const model=()=>api()?.ziskejModel?.()?.bloky||[];
const txt=b=>(b?.obsah||[]).map(s=>String(s?.text||'')).join('');
const find=t=>model().find(b=>txt(b).includes(t));
const tag=id=>window.loadTask?.().find(n=>n?.id===id&&n.storageScope==='local'&&!n.isSecret&&n.tags?.includes('Testy')&&String(n.title||'').startsWith('[AutoTester 690T]'));
const row=b=>document.querySelector('[data-ln-v2-blok="'+CSS.escape(b.id)+'"]');
const shown=el=>!!(el&&!el.hidden&&el.isConnected&&getComputedStyle(el).display!=='none'&&el.getClientRects().length);
const runSeed=()=>String(Date.now())+'_'+Math.floor(Math.random()*999999);
async function button(id){
 const el=document.getElementById(id),toggle=document.getElementById('editorToolbarToggle');check(el,'chybi_'+id);
 for(let k=0;k<4&&!shown(el);k++){check(toggle,'chybi_editor_toolbar');toggle.click();await sleep(125)}
 check(shown(el),'skryte_tlacitko_'+id);return el;
}
function caretOn(b,offset=txt(b).length){
 const el=row(b),span=el?.querySelector(':scope > .ln-v2-cast'),node=span?.firstChild;
 check(node?.nodeType===3,'chybi_DOM_text_pro_caret_'+b?.id);
 check(offset<=node.textContent.length,'offset_mimo_text');
 const rng=document.createRange();rng.setStart(node,offset);rng.collapse(true);
 const selection=window.getSelection();selection.removeAllRanges();selection.addRange(rng);
 const m=api()?.zachytAktualniVyber?.();
 check(m?.sbaleny===true,'caret_se_neaktivoval');
 const actual=model()[m.zacatek.blok];
 check(actual?.id===b.id&&m.zacatek.offset===offset,'caret_neni_na_cili_'+offset);
 return m;
}
function writeLine(label){
 const core=api();check(typeof core?.provedPrikazVlastniKlavesnice==='function','neni_LubaKeyboard_prikaz');
 check(core.nastavPoziciOtevreni?.('end')===true,'nelze_nastavit_konec');
 window.getSelection()?.removeAllRanges();
 check(core.provedPrikazVlastniKlavesnice('enter')===true,'enter_selhal');
 check(core.provedPrikazVlastniKlavesnice('text',label)===true,'text_selhal');
 const b=find(label);check(b&&txt(b)===label,'novy_text_neni_v_modelu');return b;
}
async function setText(b){
 caretOn(b);(await button('tlacitkoBullet')).click();await sleep(105);
 const panel=document.getElementById('editorPanelSeznam');check(panel&&!panel.hidden,'chybi_panel_seznamu');
 const choice=panel.querySelector('[data-ln-v2-seznam="off"]');check(choice,'chybi_bez_seznamu');
 choice.click();await sleep(140);
 const after=model().find(x=>x.id===b.id);check(after?.typ==='odstavec','nezmenilo_se_na_bezny_text');
 check(row(after)?.isConnected,'obycejny_odstavec_neni_v_DOM');return after;
}
async function setTodo(b){
 caretOn(b);
 if(model().find(x=>x.id===b.id)?.typ!=='todo'){
  (await button('addTodoButton')).click();await sleep(155);
 }
 const after=model().find(x=>x.id===b.id);
 check(after?.typ==='todo','neni_todo_v_modelu');
 check(row(after)?.querySelector('[data-v2-todo-check]'),'chybi_kolecko_v_DOM');return after;
}
async function closeSave(){
 const save=document.getElementById('editorBackButton');check(save&&!save.disabled,'chybi_Ulozit_zavrit');save.click();
 for(let k=0;k<35&&document.getElementById('taskModal')?.hidden!==true;k++)await sleep(100);
 check(document.getElementById('taskModal')?.hidden===true,'editor_nezavren');
 await window.LubaNoteRegularNotesStore?.cekejNaUlozeni?.();
}
async function open(id){
 await window.openTaskEditorById(id);await sleep(160);
 check(document.getElementById('taskModal')?.hidden===false,'editor_se_neotevrel');
 check(document.getElementById('taskModal')?.dataset.taskId===id,'otevrena_jina_poznamka');
 check(window.LubaNoteEditorV2Bridge?.jeAktivni?.()===true,'Bridge_neni_aktivni');
}
async function run(id,alive=()=>true,onProgress=()=>{},minimize=()=>{},restore=()=>{}){
 if(busy)return testCases.map(([code,name])=>({id:code,name,kind:KIND,status:'APP_BLOCKED',ms:0,detail:'Jiný běh dosud probíhá'}));
 busy=true;const rows=[];let failed=false;
 const seed=runSeed(),labels={head:'AUTO_691A_TEXT_'+seed,prev:'AUTO_691A_PRED_'+seed,mid:'ABC',next:'AUTO_691A_DALSI_'+seed};
 const refs={};
 try{
  check(window.LubaNoteAdminTools?.isAllowed?.()===true,'vyzadovan_admin');
  check(tag(id),'cizi_nebo_neLOCAL_poznamka');
  check(document.getElementById('taskModal')?.hidden===true,'jiny_editor_je_otevren');
  minimize();
  for(let k=0;k<testCases.length;k++){
   const [code,name]=testCases[k],started=performance.now();let proof='';
   if(!alive())throw Error('test_prerusen');onProgress('V aplikaci ToDo '+(k+1)+'/'+testCases.length+' · '+name);
   try{
    if(k===0){await open(id);proof='Otevřena vlastní poznámka Testy v produkčním editoru.';}
    else if(k===1){const b=await setText(writeLine(labels.head));refs.head=b.id;proof='Vytvořen běžný odstavec, nikoli ToDo.';}
    else if(k===2){const b=await setTodo(writeLine(labels.prev));refs.prev=b.id;proof='První ToDo a jeho kolečko existují v modelu i DOM.';}
    else if(k===3){const b=await setTodo(writeLine(labels.mid));refs.mid=b.id;check(txt(b)===labels.mid,'prostredni_ToDo_nema_ABC');proof='Prostřední ToDo s textem ABC vytvořeno.';}
    else if(k===4){const b=await setTodo(writeLine(labels.next));refs.next=b.id;proof='Následující ToDo existuje; celkem tři různá kolečka.';}
    else if(k===5){
     await closeSave();await open(id);
     for(const key of ['head','prev','mid','next']){const item=find(labels[key]);check(item&&txt(item)===labels[key],'po_reload_chybi_'+key);refs[key]=item.id;}
     check(model().find(b=>b.id===refs.mid)?.typ==='todo','po_reload_zmizel_todo_typ');
     proof='Poznámka skutečně uložena a znovu otevřena, tři ToDo a běžný text přetrvaly.';
    }
    else if(k===6){
     let mid=model().find(b=>b.id===refs.mid);check(mid?.typ==='todo','prostredni_todo_pred_mazanim_chybi');
     caretOn(mid,txt(mid).length);
     for(let n=0;n<labels.mid.length;n++){
      check(api().provedPrikazVlastniKlavesnice('backspace')===true,'backspace_selhal_'+n);
      mid=model().find(b=>b.id===refs.mid);
      check(mid?.typ==='todo','kolečko_zmizelo_pred_poslednim_znakem');
      check(txt(mid)===labels.mid.slice(0,labels.mid.length-n-1),'mazani_textu_neodpovida_'+n);
     }
     check(row(mid)?.querySelector('[data-v2-todo-check]'),'prazdne_kolecko_neni_v_DOM');
     proof='3× Backspace odebral ABC po znacích, prostřední prázdné ToDo zůstalo.';
    }
    else if(k===7){
     const before=model(),middleIndex=before.findIndex(b=>b.id===refs.mid),previous=before.find(b=>b.id===refs.prev),following=before.find(b=>b.id===refs.next);
     check(middleIndex>0&&previous?.typ==='todo'&&following?.typ==='todo','sousede_pred_smazanim_chybi');
     check(api().provedPrikazVlastniKlavesnice('backspace')===true,'backspace_na_prazdne_Todo_selhal');
     const after=model(),sel=api().zachytAktualniVyber?.();
     check(after.length===before.length-1,'pocet_radku_po_smazani_neni_minus_jedna');
     check(!after.some(b=>b.id===refs.mid),'prazdne_kolecko_nebylo_odstraneno');
     check(after.some(b=>b.id===refs.prev&&b.typ==='todo'&&txt(b)===labels.prev),'predchozi_todo_poskozeno');
     check(after.some(b=>b.id===refs.next&&b.typ==='todo'&&txt(b)===labels.next),'nasledujici_todo_poskozeno');
     const current=after[sel?.zacatek?.blok];
     check(sel?.sbaleny&&current?.id===refs.prev&&sel.zacatek.offset===labels.prev.length,'caret_neni_na_konci_predchoziho');
     proof='Prázdný checkbox zmizel, oba sousedé zachováni, caret přesně na konci předchozího ToDo.';
    }
    else if(k===8){
     await closeSave();await open(id);
     const items=model();check(!items.some(b=>txt(b)===labels.mid&&b.typ==='todo'),'smazany_ToDo_se_po_reload_vratil');
     for(const key of ['prev','next'])check(items.some(b=>b.typ==='todo'&&txt(b)===labels[key]),'po_reload_poskozeno_'+key);
     check(items.some(b=>b.typ==='odstavec'&&txt(b)===labels.head),'po_reload_chybi_bezny_text');
     await closeSave();proof='Smazaný checkbox se neobnovil, sousední ToDo a běžný text přežily uložení.';
    }
    rows.push({id:code,name,kind:KIND,status:'APP_PASS',ms:Math.round(performance.now()-started),detail:proof+' Produkční Core V2 + skutečná obrazovka editoru, programové kliknutí/LubaKeyboard.'});
    const speed=Number(window.LubaNoteAutoTesterVisual690F?.getSpeedFactor?.()||0);
    await sleep(speed>0?Math.round(500*speed):115);
   }catch(e){failed=true;rows.push({id:code,name,kind:KIND,status:'APP_FAIL',ms:Math.round(performance.now()-started),detail:String(e?.message||e).slice(0,225)+'; testovací LOCAL poznámka ponechána k prohlédnutí.'});break;}
  }
 }catch(e){failed=true;rows.push({id:testCases[0][0],name:testCases[0][1],kind:KIND,status:'APP_BLOCKED',ms:0,detail:String(e?.message||e).slice(0,210)});}
 finally{restore();busy=false;}
 const ran=new Set(rows.map(r=>r.id));
 for(const [id,name] of testCases)if(!ran.has(id))rows.push({id,name,kind:KIND,status:'APP_BLOCKED',ms:0,detail:failed?'Předchozí krok selhal – neprovedeno.':'Nespouštěno.'});
 return rows;
}
window.LubaNoteAutoTesterLive691A=Object.freeze({run,expected:testCases.map(([id])=>id)});
})();
