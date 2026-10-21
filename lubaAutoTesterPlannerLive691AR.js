/* 691AR – LIVE Planner create / persist / reopen / scoped cleanup.
 * Only a newly generated [AutoTester 690T] LOCAL Testy fixture may be changed.
 * Real Planner click handlers and production storage; no reminders or server testing.
 * The date/time input is assigned programmatically; custom picker routing is 691AQ.
 */
(()=>{'use strict';
const KIND='PLANNER_LIVE_STORAGE_691AR';
const CASES=[
 ['planner-ar-fixture','Planner – bezpečná vlastní LOCAL Testy poznámka'],
 ['planner-ar-open','Planner – vybrat text a otevřít skutečný dialog'],
 ['planner-ar-save','Planner – uložit skutečný plán do obou vrstev'],
 ['planner-ar-reopen','Planner – zavřít a znovu otevřít poznámku i plán'],
 ['planner-ar-cleanup','Planner – odstranit pouze vlastní testovací plán']
];
let busy=false;
const $=id=>document.getElementById(id);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const check=(ok,why)=>{if(!ok)throw Error(why);};
const noteById=id=>window.loadTask?.().find(n=>n?.id===id)||null;
const owned=(n,id)=>Boolean(n?.id===id&&n?.storageScope==='local'&&n?.isSecret!==true&&
  Array.isArray(n.tags)&&n.tags.includes('Testy')&&String(n.title||'').startsWith('[AutoTester 690T] Planner 691AR'));
const localPlans=()=>{const raw=localStorage.getItem('plannedItems');if(!raw)return [];
  const items=JSON.parse(raw);check(Array.isArray(items),'planner_storage_not_array');return items;};
async function storageChange(callback,scopeNote){
  const sync=window.LubaNoteSync?.provedLokalniZmenuASynchronizuj;
  check(typeof sync==='function','real_storage_mutation_missing');
  const ok=await sync(callback,scopeNote);check(ok!==false,'real_storage_change_rejected');
  await window.LubaNoteRegularNotesStore?.cekejNaUlozeni?.();
}
async function editorClose(id){
  const modal=$('taskModal');
  if(modal?.hidden)return;
  check(modal?.dataset.taskId===id,'refuse_to_close_other_editor');
  const back=$('editorBackButton');check(back&&!back.disabled,'editor_save_button_missing');
  back.click();
  for(let i=0;i<90&&!modal.hidden;i++)await wait(120);
  check(modal.hidden,'test_note_editor_save_timeout');
  await window.LubaNoteRegularNotesStore?.cekejNaUlozeni?.();
}
async function editorOpen(id){
  check(owned(noteById(id),id),'test_note_no_longer_owned');
  const before=$('taskModal');check(before?.hidden===true,'editor_already_open');
  check(typeof window.openTaskEditorById==='function','production_open_unavailable');
  const ok=await window.openTaskEditorById(id);await wait(150);
  check(ok!==false&&!before.hidden&&before.dataset.taskId===id,'wrong_test_note_opened');
  check(window.LubaNoteEditorV2Bridge?.jeAktivni?.()===true,'production_core_v2_not_active');
}
function selectMarker(marker){
  const root=window.LubaNoteEditorV2?.ziskejEditorElement?.();
  check(root&&root.isConnected,'real_editor_dom_unavailable');
  const tree=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  let node=null,index=-1,n;
  while((n=tree.nextNode())){const k=String(n.nodeValue||'').indexOf(marker);if(k>=0){node=n;index=k;break;}}
  check(node&&index>=0,'test_text_missing_in_production_dom');
  const range=document.createRange();range.setStart(node,index);range.setEnd(node,index+marker.length);
  const sel=window.getSelection();check(sel,'browser_selection_missing');
  sel.removeAllRanges();sel.addRange(range);
  check(window.LubaNoteEditorV2?.ulozDomRangeProSelectionMenu?.(range)===true,'core_selection_snapshot_failed');
  const context=window.LubaNoteEditorV2Bridge?.ziskejPlanovaciKontext?.();
  check(context?.ok===true&&context.typ==='selection'&&context.text===marker,'planner_selection_context_incorrect');
}
function fixtureNote(id,marker){const now=new Date().toISOString();return {
  id,storageScope:'local',updatedAt:now,title:'[AutoTester 690T] Planner 691AR '+id.slice(0,8),
  note:marker,richContent:'<p>'+marker+'</p>',tags:['Testy'],date:now.slice(0,10),
  isSecret:false,completed:false,reminder:false,planned:false,favorite:false,
  pinned:false,notificationId:null,area:'private',todos:[],plannedItems:[]};}
function term(){const future=new Date();future.setDate(future.getDate()+7);future.setHours(12,34,0,0);
  const y=future.getFullYear(),mo=String(future.getMonth()+1).padStart(2,'0'),d=String(future.getDate()).padStart(2,'0');
  return {date:`${y}-${mo}-${d}`,time:'12:34',value:`${y}-${mo}-${d}T12:34`};}
async function run(idIgnored,alive=()=>true,onProgress=()=>{},minimize=()=>{},restore=()=>{}){
 if(busy)return CASES.map(([id,name])=>({id,name,kind:KIND,status:'APP_BLOCKED',ms:0,detail:'691AR_already_running'}));
 busy=true;const out=[];const id=crypto.randomUUID();const marker='AUTOTEST_PLANNER_691AR_'+id.replace(/-/g,'');
 let fixture=false,planId='',saveStarted=false,saveCompleted=false,stepIndex=0;
 let baselineIds=null;const initialLastId=window.lastCreatedPlannedItemId;
 const add=(idx,status,detail,ms=0)=>out.push({id:CASES[idx][0],name:CASES[idx][1],kind:KIND,status,ms:Math.round(ms),detail:String(detail).slice(0,270)});
 const ensure=()=>check(alive()===true,'test_cancelled');
 const step=async(i,fn)=>{stepIndex=i;ensure();onProgress('Planner 691AR '+(i+1)+'/5 · '+CASES[i][1]);
   const t=performance.now();const detail=await fn();add(i,'APP_PASS',detail,performance.now()-t);};
 const ownPlan=p=>p?.sourceNoteId===id&&p?.sourceType==='selection'&&p?.text===marker;
 try{
   check(window.LubaNoteAdminTools?.isAllowed?.()===true,'admin_authorization_required');
   check($('taskModal')?.hidden===true&&$('plannerModal')?.hidden===true,'close_other_modals_first');
   check(window.LubaNoteRegularNotesStore?.chybiPlnaCacheProSync?.()!==true,'notes_storage_cache_not_ready');
   check(typeof window.saveTask==='function'&&typeof window.saveAllTasks==='function'&&
     typeof window.loadTask==='function','production_notes_storage_missing');
   check(typeof window.LubaNoteRegularNotesStore?.cekejNaUlozeni==='function','storage_persist_wait_missing');
   check(typeof crypto?.randomUUID==='function','random_uuid_unavailable');
   baselineIds=new Set(localPlans().map(p=>p?.id).filter(Boolean));
   const note=fixtureNote(id,marker);
   await step(0,async()=>{
     await storageChange(()=>window.saveTask({...note}),note);
     fixture=true;
     check(owned(noteById(id),id)&&String(noteById(id)?.note||'').includes(marker),'fixture_not_persisted');return 'Produkční LOCAL storage. Nová poznámka výhradně pod štítkem Testy; bez SYNC a bez změn existujících poznámek.';
   });
   await step(1,async()=>{
     minimize();await editorOpen(id);selectMarker(marker);
     const button=$('planSelectionButton');check(button,'planner_selection_button_missing');
     button.click();for(let k=0;k<22&&$('plannerModal')?.hidden;k++)await wait(90);
     check($('plannerModal')?.hidden===false,'real_planner_modal_not_open');
     check($('plannerTaskTitle')?.textContent?.trim()===marker,'planner_selection_text_lost');
     return 'Označení přes skutečný Core V2, kliknutí na produkční tlačítko Naplánovat, dialog otevřen nad vlastní LOCAL Testy poznámkou.';
   });
   await step(2,async()=>{
     check($('taskModal')?.dataset.taskId===id&&$('plannerModal')?.hidden===false,'wrong_planner_dialog_context');
     const t=term();const date=$('plannerDate'),time=$('plannerTime'),toggle=$('plannerReminderToggle'),save=$('savePlannerButton');
     check(date&&time&&toggle&&save,'planner_form_inputs_missing');
     date.value=t.date;time.value=t.time;
     date.dispatchEvent(new Event('change',{bubbles:true}));time.dispatchEvent(new Event('change',{bubbles:true}));
     if(toggle.getAttribute('aria-pressed')==='true')toggle.click();
     check(toggle.getAttribute('aria-pressed')==='false','test_reminder_cannot_be_disabled');
     saveStarted=true;save.click();
     for(let k=0;k<120&&$('plannerModal')?.hidden!==true;k++)await wait(100);
     check($('plannerModal')?.hidden===true,'planner_save_timeout_or_rejected');
     saveCompleted=true;
     await window.LubaNoteRegularNotesStore.cekejNaUlozeni();
     const noteNow=noteById(id);check(owned(noteNow,id),'test_note_missing_after_planner_save');
     const generated=(noteNow.plannedItems||[]).filter(p=>ownPlan(p)&&!baselineIds.has(p.id));
     check(generated.length===1,'planner_note_layer_missing_or_duplicate_'+generated.length);
     planId=generated[0].id;
     const local=localPlans().filter(p=>p?.id===planId&&ownPlan(p));
     check(local.length===1,'planner_local_layer_missing_or_duplicate_'+local.length);
     check(generated[0].plannedAt===t.value&&local[0].plannedAt===t.value,'planner_date_time_not_persisted');
     check(generated[0].reminder===false&&local[0].reminder===false,'planner_reminder_was_armed');
     return 'Skutečné kliknutí Uložit + ověření poznámky i localStorage; termín shodný, reminder vypnutý. Datum/čas nastaveny testem do vstupů, nikoli ovládáním pickeru.';
   });
   await step(3,async()=>{
     await editorClose(id);await editorOpen(id);
     const source=noteById(id);const fromNote=(source?.plannedItems||[]).find(p=>p?.id===planId);
     const fromLocal=localPlans().find(p=>p?.id===planId);
     check(owned(source,id)&&ownPlan(fromNote)&&ownPlan(fromLocal),'planner_not_present_after_reopen');
     const html=window.LubaNoteEditorV2Bridge?.ziskejObsahProProdukci?.()?.richContent||'';
     check(html.includes(planId),'planner_backlink_missing_after_reopen');
     return 'Po reálném Uložit/zavřít a znovuotevření: plán v obou úložištích, ID odkazu zachováno v produkčním HTML.';
   });
 }catch(e){
   add(stepIndex,'APP_FAIL',String(e?.message||e),0);
   for(let j=stepIndex+1;j<4;j++)add(j,'APP_BLOCKED','Předchozí živý krok selhal.');
 }finally{
   stepIndex=4;const started=performance.now();
   try{
     if(!fixture){add(4,'APP_BLOCKED','Fixture nebyla vytvořena, není co čistit.');}
     else{
       // If asynchronous Planner save has not settled, do not race the production writer.
       check(!saveStarted||saveCompleted,'planner_save_state_uncertain_cleanup_deferred');
       if($('plannerModal')?.hidden===false){
         check($('taskModal')?.dataset.taskId===id,'refuse_to_close_unrelated_planner');
         $('cancelPlannerButton')?.click();
         check($('plannerModal')?.hidden===true,'planner_cancel_failed');
       }
       await editorClose(id);
       check(owned(noteById(id),id),'refuse_to_modify_nonowned_note');
       // Remove only NEW IDs anchored to this unique fixture; never restore stale global snapshots.
       const current=localPlans();const removed=current.filter(p=>ownPlan(p)&&!baselineIds.has(p.id));
       const kept=current.filter(p=>!(ownPlan(p)&&!baselineIds.has(p.id)));
       if(removed.length)localStorage.setItem('plannedItems',JSON.stringify(kept));
       // Fresh read-modify-write of the one fixture. Restore its original unlinked text.
       const all=window.loadTask();const old=all.find(n=>n?.id===id);
       check(owned(old,id),'cleanup_fixture_ownership_lost');
       const reset=fixtureNote(id,marker);reset.updatedAt=new Date().toISOString();
       const merged={...old,note:reset.note,richContent:reset.richContent,plannedItems:[],updatedAt:reset.updatedAt};
       await storageChange(()=>window.saveAllTasks(all.map(n=>n?.id===id?merged:n)),merged);
       check(owned(noteById(id),id)&&!(noteById(id)?.plannedItems||[]).length,'cleanup_note_plan_not_removed');
       check(!planId||!String(noteById(id)?.richContent||'').includes(planId),'cleanup_backlink_not_removed');
       check(!localPlans().some(p=>ownPlan(p)&&!baselineIds.has(p.id)),'cleanup_local_plan_not_removed');
       add(4,'APP_PASS',`Z planů odebráno pouze ${removed.length} nové ID tohoto běhu; vlastní LOCAL Testy poznámka ponechána bez plánů a bez odkazu.`,performance.now()-started);
     }
   }catch(e){add(4,'APP_FAIL','Úklid nebyl bezpečně dokončen: '+String(e?.message||e).slice(0,190)+'. Testovací LOCAL poznámka může zůstat pro kontrolu.',performance.now()-started);}
   if(planId&&window.lastCreatedPlannedItemId===planId)window.lastCreatedPlannedItemId=initialLastId;
   restore();busy=false;
 }
 // Always exactly one row per case, in chronological order (including cleanup).
 return CASES.map(([key,name])=>out.find(r=>r.id===key)||{id:key,name,kind:KIND,status:'APP_BLOCKED',ms:0,detail:'step_was_not_run'});
}
window.LubaNoteAutoTesterPlannerLive691AR=Object.freeze({run});
})();
