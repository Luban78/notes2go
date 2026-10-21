/* 691AS – REAL Android Planner reminder scheduling / native pending / cancellation.
 * Generated LOCAL Testy note only. Permission preflight NEVER requests permissions.
 * The production Planner button stores a reminder-enabled plan and schedules it.
 * Cleanup removes only this test's plan and notification. No real user plans touched.
 * This is NOT proof of actual delivery, background execution or recurrence on device restart.
 */
(()=>{'use strict';
const KIND='PLANNER_ANDROID_REMINDER_691AS';
const CASES=[
  ['planner-as-preflight','Planner – již povolené Android notifikace a izolace'],
  ['planner-as-open','Planner – vytvořit vlastní LOCAL poznámku a otevřít plánování'],
  ['planner-as-schedule','Planner – skutečně uložit a naplánovat Android připomínku'],
  ['planner-as-cancel','Planner – zrušit pouze vlastní čekající notifikaci'],
  ['planner-as-reopen','Planner – znovu otevřít poznámku a ověřit uloženou připomínku'],
  ['planner-as-cleanup','Planner – odstranit jen vlastní testovací plán a alarm']
];
const $=id=>document.getElementById(id);
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const assert=(yes,why)=>{if(!yes)throw Error(why);};
const noteById=id=>window.loadTask?.().find(n=>n?.id===id)||null;
const ownNote=(n,id)=>Boolean(n?.id===id&&n?.storageScope==='local'&&n?.isSecret!==true&&
 Array.isArray(n.tags)&&n.tags.includes('Testy')&&String(n.title||'').startsWith('[AutoTester 690T] Planner 691AS'));
const localPlans=()=>{
 const raw=localStorage.getItem('plannedItems');if(raw==null)return [];
 const arr=JSON.parse(raw);assert(Array.isArray(arr),'plannedItems_not_array');return arr;
};
const native=()=>window.Capacitor?.Plugins?.LocalNotifications;
// 691AS: Reserve an ID absent from existing app and Android alarms before
// invoking the real Planner save handler. Avoid even a theoretical overwrite.
function reserveTestNotificationId(pendingIds){
  const used=new Set([...pendingIds]);
  for(const item of localPlans())if(Number.isInteger(item?.notificationId))used.add(item.notificationId);
  for(const note of window.loadTask()){
    if(Number.isInteger(note?.notificationId))used.add(note.notificationId);
    for(const item of note?.plannedItems||[])if(Number.isInteger(item?.notificationId))used.add(item.notificationId);
  }
  for(let i=0;i<40;i++){
    const raw=new Uint32Array(1);crypto.getRandomValues(raw);
    const id=(raw[0]%2147483646)+1;
    if(!used.has(id))return id;
  }
  throw Error('no_unused_native_notification_id');
}
const getPending=async()=>{
 const val=await native().getPending();
 assert(Array.isArray(val?.notifications),'native_pending_invalid');
 return val.notifications;
};
const ownPlan=(p,id,marker)=>p?.sourceNoteId===id&&p?.sourceType==='selection'&&p?.text===marker;
const term=()=>{
 const dt=new Date();dt.setDate(dt.getDate()+7);dt.setHours(12,34,0,0);
 const date=[dt.getFullYear(),String(dt.getMonth()+1).padStart(2,'0'),String(dt.getDate()).padStart(2,'0')].join('-');
 return {date,time:'12:34',value:date+'T12:34'};
};
const fixtureNote=(id,marker)=>{
 const now=new Date().toISOString();return {
  id,storageScope:'local',updatedAt:now,title:'[AutoTester 690T] Planner 691AS '+id.slice(0,8),
  note:marker,richContent:'<p>'+marker+'</p>',tags:['Testy'],date:now.slice(0,10),
  isSecret:false,completed:false,reminder:false,planned:false,favorite:false,
  pinned:false,notificationId:null,area:'private',todos:[],plannedItems:[]
 };
};
async function safeNoteWrite(callback,note){
 const handler=window.LubaNoteSync?.provedLokalniZmenuASynchronizuj;
 assert(typeof handler==='function','production_local_transaction_missing');
 const response=await handler(callback,note);
 assert(response!==false,'local_transaction_rejected');
 await window.LubaNoteRegularNotesStore.cekejNaUlozeni();
}
async function editorClose(id){
 const modal=$('taskModal');if(modal?.hidden)return;
 assert(modal?.dataset.taskId===id,'refuse_closing_unrelated_note');
 const button=$('editorBackButton');assert(button&&!button.disabled,'editor_save_missing');
 button.click();
 for(let i=0;i<90&&!modal.hidden;i++)await wait(120);
 assert(modal.hidden,'editor_close_timeout');
 await window.LubaNoteRegularNotesStore.cekejNaUlozeni();
}
async function editorOpen(id){
 assert(ownNote(noteById(id),id),'test_note_missing_or_wrong_scope');
 assert($('taskModal')?.hidden===true,'another_editor_already_open');
 assert(typeof window.openTaskEditorById==='function','production_note_open_unavailable');
 const result=await window.openTaskEditorById(id);await wait(160);
 assert(result!==false&&$('taskModal')?.hidden===false&&$('taskModal')?.dataset.taskId===id,'wrong_note_opened');
 assert(window.LubaNoteEditorV2Bridge?.jeAktivni?.()===true,'core_v2_inactive');
}
function selectText(marker){
 const editor=window.LubaNoteEditorV2?.ziskejEditorElement?.();
 assert(editor?.isConnected,'production_editor_dom_unavailable');
 const walker=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT);
 let found=null,pos=-1,node;
 while((node=walker.nextNode())){const index=String(node.nodeValue||'').indexOf(marker);
   if(index>=0){found=node;pos=index;break;}}
 assert(found&&pos>=0,'own_test_text_not_rendered');
 const range=document.createRange();range.setStart(found,pos);range.setEnd(found,pos+marker.length);
 const selection=window.getSelection();assert(selection,'browser_selection_missing');
 selection.removeAllRanges();selection.addRange(range);
 assert(window.LubaNoteEditorV2?.ulozDomRangeProSelectionMenu?.(range)===true,'model_range_not_stored');
 const context=window.LubaNoteEditorV2Bridge?.ziskejPlanovaciKontext?.();
 assert(context?.ok===true&&context.typ==='selection'&&context.text===marker,'planner_selection_mismatch');
}
async function waitForPending(id,shouldExist,attempts=35){
 let items=[];
 for(let i=0;i<attempts;i++){
   items=await getPending();
   const matches=items.filter(p=>Number(p?.id)===id);
   if(shouldExist ? matches.length===1 : matches.length===0)return items;
   await wait(150);
 }
 throw Error(shouldExist?'native_alarm_missing_after_save':'native_alarm_not_cancelled');
}
let busy=false;
async function run(_unused,alive=()=>true,onProgress=()=>{},minimize=()=>{},restore=()=>{}){
 if(busy)return CASES.map(([id,name])=>({id,name,kind:KIND,status:'APP_BLOCKED',ms:0,detail:'691AS_tester_busy'}));
 busy=true;
 const out=[];
 const noteId=crypto.randomUUID();
 const marker='AUTOTEST_PLANNER_691AS_'+noteId.replace(/-/g,'');
 const previousLast=window.lastCreatedPlannedItemId;
 let stepIndex=0,fixture=false,planId='',nativeId=0,mayHaveScheduled=false,saveStarted=false,saveCompleted=false;
 let beforePending=null,beforePlanIds=null,reservedNativeId=0;
 const record=(index,status,detail,ms=0)=>out.push({id:CASES[index][0],name:CASES[index][1],kind:KIND,status,detail:String(detail).slice(0,290),ms:Math.round(ms)});
 const ensure=()=>assert(alive()===true,'test_cancelled');
 const step=async(index,work)=>{stepIndex=index;ensure();onProgress(`Planner 691AS ${index+1}/${CASES.length} · ${CASES[index][1]}`);
  const start=performance.now();const detail=await work();record(index,'APP_PASS',detail,performance.now()-start);};
 const preserveNativeIds=async()=>{
   const pending=await getPending();const actualIds=new Set(pending.map(p=>Number(p.id)));
   for(const id of beforePending.keys())assert(actualIds.has(id),'unrelated_pending_notification_disappeared');
   return pending;
 };
 async function cancelOwnAlarm(){
   if(!nativeId||!beforePending||beforePending.has(nativeId))return false;
   assert(typeof window.cancelNotification==='function','production_cancel_missing');
   await window.cancelNotification(nativeId);
   await waitForPending(nativeId,false,18);
   return true;
 }
 try{
   await step(0,async()=>{
     assert(window.LubaNoteAdminTools?.isAllowed?.()===true,'admin_required');
     assert(window.Capacitor?.getPlatform?.()==='android','android_apk_required');
     assert($('taskModal')?.hidden===true&&$('plannerModal')?.hidden===true,'close_other_dialogs_first');
     assert(!document.body.classList.contains('secretModeActive'),'secret_mode_open');
     assert(window.LubaNoteRegularNotesStore?.chybiPlnaCacheProSync?.()!==true,'notes_cache_not_ready');
     assert(typeof window.LubaNoteRegularNotesStore?.cekejNaUlozeni==='function','notes_storage_wait_missing');
     assert(typeof window.saveTask==='function'&&typeof window.saveAllTasks==='function'&&typeof window.loadTask==='function','production_note_store_missing');
     assert(typeof crypto?.randomUUID==='function','secure_ids_unavailable');
     const plugin=native();assert(plugin&&typeof plugin.checkPermissions==='function'&&
       typeof plugin.getPending==='function'&&typeof plugin.schedule==='function'&&typeof plugin.cancel==='function','native_notifications_plugin_missing');
     assert(typeof window.scheduleNotification==='function'&&typeof window.cancelNotification==='function','production_notifications_missing');
     assert(typeof window.createUniqueNotificationId==='function','native_notification_id_generator_missing');
     const permission=await plugin.checkPermissions();
     assert(permission?.display==='granted','notification_permission_not_previously_granted_no_prompt');
     if(typeof plugin.checkExactNotificationSetting==='function'){
       const exact=await plugin.checkExactNotificationSetting();
       assert(exact?.exact_alarm==='granted','exact_alarm_permission_not_previously_granted_no_prompt');
     }
     beforePending=new Map((await getPending()).map(item=>[Number(item?.id),item]));
     beforePlanIds=new Set(localPlans().map(p=>p?.id).filter(Boolean));
     assert(window.getAllTags?.().includes('Testy'),'Testy_label_missing');
     return `Nativní Android oprávnění již povolena. Původních čekajících upozornění: ${beforePending.size}. Žádná žádost o oprávnění ani změna uživatelských dat.`;
   });
   await step(1,async()=>{
     const note=fixtureNote(noteId,marker);
     await safeNoteWrite(()=>window.saveTask({...note}),note);fixture=true;
     assert(ownNote(noteById(noteId),noteId),'fixture_not_persisted');
     minimize();await editorOpen(noteId);selectText(marker);
     const button=$('planSelectionButton');assert(button,'real_planner_button_missing');
     button.click();for(let i=0;i<25&&$('plannerModal')?.hidden;i++)await wait(90);
     assert($('plannerModal')?.hidden===false&&$('plannerTaskTitle')?.textContent?.trim()===marker,'real_planner_dialog_failed');
     return 'Vlastní nová LOCAL Testy poznámka; skutečný výběr Core V2 a dialog Planneru.';
   });
   await step(2,async()=>{
     assert($('taskModal')?.dataset.taskId===noteId&&$('plannerModal')?.hidden===false,'planner_dialog_wrong_owner');
     const t=term(),date=$('plannerDate'),time=$('plannerTime'),toggle=$('plannerReminderToggle'),button=$('savePlannerButton');
     assert(date&&time&&toggle&&button,'planner_controls_missing');
     date.value=t.date;time.value=t.time;
     date.dispatchEvent(new Event('change',{bubbles:true}));time.dispatchEvent(new Event('change',{bubbles:true}));
     if(toggle.getAttribute('aria-pressed')!=='true')toggle.click();
     assert(toggle.getAttribute('aria-pressed')==='true','reminder_toggle_failed');
     // Only during this synchronous click, choose an unused ID; immediately
     // restore production randomness before the first asynchronous write.
     reservedNativeId=reserveTestNotificationId(beforePending.keys());
     const originalGenerator=window.createUniqueNotificationId;
     try{
       window.createUniqueNotificationId=()=>reservedNativeId;
       assert(window.createUniqueNotificationId!==originalGenerator,'cannot_guard_native_id_generator');
       saveStarted=true;button.click();
     }finally{
       window.createUniqueNotificationId=originalGenerator;
     }
     for(let i=0;i<120&&$('plannerModal')?.hidden!==true;i++)await wait(100);
     assert($('plannerModal')?.hidden===true,'planner_save_rejected_or_timeout');
     saveCompleted=true;
     await window.LubaNoteRegularNotesStore.cekejNaUlozeni();
     const fromNote=(noteById(noteId)?.plannedItems||[]).filter(p=>ownPlan(p,noteId,marker)&&!beforePlanIds.has(p.id));
     assert(fromNote.length===1,'planner_note_layer_missing_or_duplicated');
     const plan=fromNote[0];planId=plan.id;
     const local=localPlans().filter(p=>p?.id===planId&&ownPlan(p,noteId,marker));
     assert(local.length===1,'planner_local_layer_missing');
     assert(plan.reminder===true&&local[0].reminder===true,'reminder_flag_not_persisted');
     assert(plan.plannedAt===t.value&&local[0].plannedAt===t.value,'reminder_datetime_not_saved');
     nativeId=Number(plan.notificationId);
     assert(Number.isInteger(nativeId)&&nativeId>0,'native_notification_id_invalid');
     assert(nativeId===reservedNativeId,'native_notification_id_reservation_not_used');
     assert(!beforePending.has(nativeId),'notification_id_collides_with_existing_alarm');
     mayHaveScheduled=true;
     const pending=await waitForPending(nativeId,true,50);
     const notification=pending.find(p=>Number(p.id)===nativeId);
     assert(notification,'native_alarm_disappeared');
     if(notification.extra?.plannedItemId!=null)
       assert(notification.extra.plannedItemId===planId,'native_alarm_points_to_wrong_plan');
     if(notification.extra?.sourceNoteId!=null)
       assert(notification.extra.sourceNoteId===noteId,'native_alarm_points_to_wrong_note');
     await preserveNativeIds();
     return 'Skutečný produkční Planner uložil reminder=true do obou vrstev a Android LocalNotifications.getPending potvrdil testovací alarm. Neověřuje doručení.';
   });
   await step(3,async()=>{
     assert(planId&&nativeId&&mayHaveScheduled,'own_scheduled_alarm_unavailable');
     await cancelOwnAlarm();await preserveNativeIds();
     return 'Produkční cancelNotification zrušil přesné vlastní native ID; kontrola getPending nenašla alarm, původní čekající ID zůstala zachována.';
   });
   await step(4,async()=>{
     await editorClose(noteId);await editorOpen(noteId);
     const note=noteById(noteId);
     const item=(note?.plannedItems||[]).find(p=>p?.id===planId);
     const local=localPlans().find(p=>p?.id===planId);
     assert(ownNote(note,noteId)&&ownPlan(item,noteId,marker)&&ownPlan(local,noteId,marker),'planner_item_missing_after_reopen');
     assert(item.reminder===true&&local.reminder===true,'reminder_flag_changed_after_reopen');
     assert(String(window.LubaNoteEditorV2Bridge?.ziskejObsahProProdukci?.()?.richContent||'').includes(planId),'selection_backlink_missing');
     assert(!(await getPending()).some(p=>Number(p.id)===nativeId),'cancelled_alarm_reappeared');
     return 'Po skutečném znovuotevření trvá naplánovaný záznam, termín a backlink; zrušený alarm se neobnovil.';
   });
 }catch(error){
   const reason=String(error?.message||error);
   const skip=stepIndex===0&&/^(android_apk_required|native_notifications_plugin_missing|notification_permission_not_previously_granted_no_prompt|exact_alarm_permission_not_previously_granted_no_prompt)$/.test(reason);
   record(stepIndex,skip?'APP_BLOCKED':'APP_FAIL',reason);
   for(let i=stepIndex+1;i<5;i++)record(i,'APP_BLOCKED',skip?'Platforma/oprávnění nejsou dostupné; bez automatického vyžádání.':'Předchozí krok neprošel.');
 }finally{
   stepIndex=5;const started=performance.now();
   try{
     // Native cleanup is always attempted, even if the production Planner's save failed.
     // Never cancel a notification that was present before this test run.
     if(saveStarted&&!saveCompleted){
       for(let i=0;i<35&&$('plannerModal')?.hidden!==true;i++)await wait(100);
       assert($('plannerModal')?.hidden===true,'asynchronous_planner_save_not_settled_cleanup_deferred');
       saveCompleted=true;
     }
     if(beforePending&&fixture){
       const known=(noteById(noteId)?.plannedItems||[])
         .filter(p=>ownPlan(p,noteId,marker)&&!beforePlanIds.has(p.id));
       if(!nativeId&&known.length===1){
         const inferred=Number(known[0].notificationId);
         if(Number.isInteger(inferred)&&inferred>0&&!beforePending.has(inferred))nativeId=inferred;
       }
       // Cancel only the unique ID from this generated note, never any user ID.
       if(nativeId&&!beforePending.has(nativeId))await cancelOwnAlarm();
     }
     if($('plannerModal')?.hidden===false){
       assert($('taskModal')?.dataset.taskId===noteId,'refuse_to_close_other_planner');
       $('cancelPlannerButton')?.click();
       assert($('plannerModal')?.hidden===true,'test_planner_cancel_failed');
     }
     if(fixture){
       await editorClose(noteId);
       assert(ownNote(noteById(noteId),noteId),'refuse_to_modify_nonowned_note');
       const all=window.loadTask();const current=all.find(p=>p?.id===noteId);
       assert(ownNote(current,noteId),'fixture_disappeared_during_cleanup');
       const reset=fixtureNote(noteId,marker);
       const noteClean={...current,note:reset.note,richContent:reset.richContent,
         plannedItems:(current.plannedItems||[]).filter(p=>!ownPlan(p,noteId,marker)),updatedAt:new Date().toISOString()};
       await safeNoteWrite(()=>window.saveAllTasks(all.map(p=>p?.id===noteId?noteClean:p)),noteClean);
       // Planner's localStorage layer is cleaned with fresh read-modify-write, not a stale snapshot.
       const allLocal=localPlans();const removed=allLocal.filter(p=>ownPlan(p,noteId,marker)&&!beforePlanIds.has(p?.id));
       if(removed.length){
         localStorage.setItem('plannedItems',JSON.stringify(allLocal.filter(p=>!removed.includes(p))));
       }
       assert(!localPlans().some(p=>ownPlan(p,noteId,marker)&&!beforePlanIds.has(p.id)),'local_test_plan_left_behind');
       assert(!(noteById(noteId)?.plannedItems||[]).some(p=>ownPlan(p,noteId,marker)),'note_test_plan_left_behind');
       if(planId)assert(!String(noteById(noteId)?.richContent||'').includes(planId),'test_backlink_left_behind');
     }
     if(beforePending){
       await preserveNativeIds();
       if(nativeId&&!beforePending.has(nativeId))assert(!(await getPending()).some(p=>Number(p.id)===nativeId),'native_test_alarm_left_behind');
     }
     record(5,fixture||beforePending?'APP_PASS':'APP_BLOCKED',fixture
       ?'Vlastní testovací plán odstraněn; LOCAL Testy poznámka ponechána bez plánu. Jediný testovací Android alarm zrušen, ostatní čekající ID zachována.'
       :'Nebyla vytvořena žádná testovací data ani Android alarm.',performance.now()-started);
   }catch(error){
     record(5,'APP_FAIL','Úklid není potvrzen: '+String(error?.message||error).slice(0,220)+'. Testovací LOCAL poznámka může zůstat ke kontrole.',performance.now()-started);
   }
   if(planId&&window.lastCreatedPlannedItemId===planId)window.lastCreatedPlannedItemId=previousLast;
   try{restore();}catch(_error){}
   busy=false;
 }
 return CASES.map(([id,name])=>out.find(row=>row.id===id)||{id,name,kind:KIND,status:'APP_BLOCKED',ms:0,detail:'not_executed'});
}
window.LubaNoteAutoTesterPlannerLive691AS=Object.freeze({run});
})();
