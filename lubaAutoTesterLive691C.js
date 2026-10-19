/* 691C — native Android MotionEvent long-press + vertical MOVE of a REAL Bullet subtree.
 * Allowed only for a uniquely generated LOCAL Testy note. Never touches another note.
 * Production Core V2 and its own selection/MOVE handling are not modified.
 * A missing native plugin is BLOCKED, never counted as a synthetic PASS.
 */
(()=>{
'use strict';
let busy=false;
const kind='REAL_EDITOR_NATIVE_BULLET_MOVE_691C';
const cases=[
 ['ui-livec-open','V aplikaci – otevřít vlastní poznámku Testy'],
 ['ui-livec-parent','V aplikaci – vytvořit Bullet rodiče pro MOVE'],
 ['ui-livec-child','V aplikaci – vytvořit a zanořit Bullet potomka'],
 ['ui-livec-target','V aplikaci – vytvořit cílový Bullet řádek'],
 ['ui-livec-native-move','Android – nativní dlouhý stisk a MOVE celého Bullet podstromu'],
 ['ui-livec-verify','V aplikaci – ověřit pořadí, rodiče a potomka po MOVE'],
 ['ui-livec-history','V aplikaci – Undo a Redo po skutečném MOVE'],
 ['ui-livec-persist','V aplikaci – uložit a znovu otevřít přesunutý podstrom']
];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const check=(yes,msg)=>{if(!yes)throw Error(msg);};
const api=()=>window.LubaNoteEditorV2;
const blocks=()=>api()?.ziskejModel?.()?.bloky||[];
const txt=b=>(b?.obsah||[]).map(x=>String(x?.text||'')).join('');
const find=t=>blocks().find(x=>txt(x)===t);
const ix=t=>blocks().findIndex(x=>txt(x)===t);
const row=b=>document.querySelector('[data-ln-v2-blok="'+CSS.escape(b.id)+'"]');
const visible=el=>!!(el&&el.isConnected&&!el.hidden&&getComputedStyle(el).display!=='none'&&el.getClientRects().length);
const owned=id=>window.loadTask?.().some(n=>n?.id===id&&n.storageScope==='local'&&n.isSecret!==true&&n.tags?.includes('Testy')&&String(n.title||'').startsWith('[AutoTester 690T]'));
const blocked=(reason)=>cases.map(([id,name])=>({id,name,kind,status:'APP_BLOCKED',ms:0,detail:reason}));
async function toolbar(id){const b=document.getElementById(id),t=document.getElementById('editorToolbarToggle');check(b,'chybi_'+id);
 for(let k=0;k<4&&!visible(b);k++){check(t,'chybi_toolbar_toggle');t.click();await sleep(120);}check(visible(b),'skryty_'+id);return b;}
function makeLine(label){const core=api();check(core?.nastavPoziciOtevreni?.('end')===true,'nelze_nastavit_konec');window.getSelection()?.removeAllRanges();
 check(core?.provedPrikazVlastniKlavesnice?.('enter')===true,'enter_selhal');
 check(core?.provedPrikazVlastniKlavesnice?.('text',label)===true,'vkladani_textu_selhalo');
 const b=find(label);check(b,'chybi_vlozeny_text');return b;}
async function makeBullet(label){makeLine(label);(await toolbar('tlacitkoBullet')).click();await sleep(110);
 const panel=document.getElementById('editorPanelSeznam'),choice=panel?.querySelector('[data-ln-v2-seznam="bullet"]');
 check(panel&&!panel.hidden&&choice,'chybi_volba_bullet');choice.click();await sleep(160);
 const b=find(label);check(b?.typ==='bullet'&&row(b)?.classList.contains('ln-v2-bullet'),'bullet_neni_v_modelu_nebo_DOM');return b;}
function tabChild(b){const el=row(b),node=el?.querySelector(':scope > .ln-v2-cast')?.firstChild;
 check(node?.nodeType===3,'chybi_textovy_uzel');const range=document.createRange();range.setStart(node,Math.min(2,node.textContent.length));range.collapse(true);
 const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);api()?.zachytAktualniVyber?.();
 const editor=api()?.ziskejEditorElement?.();check(editor?.isConnected,'chybi_editor');
 editor.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',code:'Tab',bubbles:true,cancelable:true}));}
async function saveClose(){const btn=document.getElementById('editorBackButton');check(btn&&!btn.disabled,'chybi_save');btn.click();
 for(let i=0;i<35&&document.getElementById('taskModal')?.hidden!==true;i++)await sleep(100);
 check(document.getElementById('taskModal')?.hidden===true,'editor_se_nezavrel');await window.LubaNoteRegularNotesStore?.cekejNaUlozeni?.();}
async function open(id){await window.openTaskEditorById(id);await sleep(160);
 check(document.getElementById('taskModal')?.hidden===false&&document.getElementById('taskModal')?.dataset.taskId===id,'otevrena_jina_poznamka');
 check(window.LubaNoteEditorV2Bridge?.jeAktivni?.()===true,'Bridge_neaktivni');}
function ordered(root,child,target,after){const a=ix(root),b=ix(child),c=ix(target);
 check(a>=0&&b>=0&&c>=0,'MOVE_ztratil_blok');check(after?c<a&&a+1===b:a+1===b&&b<c,'MOVE_spatne_poradi');
 check(find(root)?.typ==='bullet'&&find(child)?.typ==='bullet'&&find(target)?.typ==='bullet','MOVE_zmenil_typ');
 check(find(root)?.uroven===0&&find(child)?.uroven===1&&find(target)?.uroven===0,'MOVE_poskodil_hierarchii');
 check(row(find(root))?.isConnected&&row(find(child))?.isConnected,'MOVE_neni_v_DOM');}
function frame(root,target){const editor=api()?.ziskejEditorElement?.(),p=row(find(root)),t=row(find(target));check(editor&&p&&t,'chybi_radky_MOVE');
 t.scrollIntoView({block:'center',inline:'nearest'});const pr=p.getBoundingClientRect(),tr=t.getBoundingClientRect();
 check(pr.top>=0&&tr.bottom<innerHeight&&pr.bottom<tr.top,'MOVE_radky_mimo_obraz');
 check(tr.top+tr.height*.8<=editor.getBoundingClientRect().bottom,'MOVE_cil_mimo_editor');}
async function run(id,alive=()=>true,progress=()=>{},minimize=()=>{},restore=()=>{}){
 if(busy)return blocked('Jiny beh stale probiha');busy=true;const output=[];let failed=false;
 const seed=Date.now()+'_'+Math.floor(Math.random()*100000);
 const root='AUTOTEST_MOVE_691C_ROOT_'+seed,child='AUTOTEST_MOVE_691C_CHILD_'+seed,target='AUTOTEST_MOVE_691C_TARGET_'+seed;
 try{
  check(window.LubaNoteAdminTools?.isAllowed?.()===true,'vyzadovan_admin');check(owned(id),'neni_vlastni_LOCAL_poznamka_Testy');
  check(document.getElementById('taskModal')?.hidden===true,'jiny_editor_otevren');minimize();
  for(let i=0;i<cases.length;i++){
   const [code,name]=cases[i],started=performance.now();let proof='';
   if(!alive())throw Error('test_prerusen');progress('V aplikaci MOVE '+(i+1)+'/8 · '+name);
   try{
    if(i===0){await open(id);proof='Vlastni Testy poznamka otevrena v produkcnim editoru.';}
    else if(i===1){const b=await makeBullet(root);check(b.uroven===0,'rodic_neni_uroven0');proof='Rodič Bullet vytvořen skutečným toolbar tlačítkem.';}
    else if(i===2){const b=await makeBullet(child);tabChild(b);await sleep(160);check(find(child)?.uroven===1,'potomek_nezanoren');proof='Dítě Bullet zanořeno produkčním Tab.';}
    else if(i===3){const b=await makeBullet(target);if(b.uroven!==0){const editor=api()?.ziskejEditorElement?.();check(editor,'editor_pro_vynoreni_cile');const el=row(b),node=el?.querySelector(':scope > .ln-v2-cast')?.firstChild;check(node?.nodeType===3,'cilovy_textovy_uzel');const rng=document.createRange();rng.setStart(node,1);rng.collapse(true);const sel=window.getSelection();sel.removeAllRanges();sel.addRange(rng);api()?.zachytAktualniVyber?.();for(let j=0;j<7&&find(target)?.uroven>0;j++){editor.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',code:'Tab',shiftKey:true,bubbles:true,cancelable:true}));await sleep(80);}}check(find(target)?.uroven===0,'cil_neni_uroven0');ordered(root,child,target,false);proof='Cíl Bullet vytvořen, celá trojice před MOVE souvislá.';}
    else if(i===4){
     const plugin=window.Capacitor?.Plugins?.LubaNoteNativeTester;
     if(!window.Capacitor?.isNativePlatform?.()||typeof plugin?.gestureOwnedBulletMove!=='function')throw Error('NATIVE_UNAVAILABLE: pro Android MOVE je nutna APK s pluginem 691C');
     frame(root,target);
     const result=await plugin.gestureOwnedBulletMove({id,root,child,target});await sleep(200);
     check(result?.delivery==='WEBVIEW_DISPATCH_TOUCH_EVENT'&&result?.type==='bullet-subtree-move','nativni_gesto_nepotvrzeno');
     ordered(root,child,target,true);
     proof='Java MotionEvent long-press + svislý tah v produkčním editoru; pořadí a úrovně ověřeny v reálném modelu.';
    }
    else if(i===5){ordered(root,child,target,true);proof='Cíl před rodičem, dítě přesunuto bez oddělení, DOM a úrovně zachovány.';}
    else if(i===6){check(api()?.provedPrikazVlastniKlavesnice?.('undo')===true,'undo_nefunguje');await sleep(90);ordered(root,child,target,false);
     check(api()?.provedPrikazVlastniKlavesnice?.('redo')===true,'redo_nefunguje');await sleep(90);ordered(root,child,target,true);
     proof='Undo obnovilo původní pořadí, Redo provedlo MOVE celého podstromu.';}
    else if(i===7){await saveClose();await open(id);ordered(root,child,target,true);await saveClose();proof='Po uložení a znovuotevření je celý Bullet podstrom stále za cílem.';}
    output.push({id:code,name,kind,status:code==='ui-livec-native-move'?'NATIVE_PASS':'APP_PASS',ms:Math.round(performance.now()-started),detail:proof+' Testovací LOCAL poznámka ponechána.'});
    const factor=Number(window.LubaNoteAutoTesterVisual690F?.getSpeedFactor?.()||0);await sleep(factor>0?Math.round(factor*650):120);
   }catch(e){failed=true;const detail=String(e?.message||e).slice(0,240);
    output.push({id:code,name,kind,status:code==='ui-livec-native-move'&&detail.startsWith('NATIVE_UNAVAILABLE')?'NATIVE_BLOCKED':code==='ui-livec-native-move'?'NATIVE_FAIL':'APP_FAIL',ms:Math.round(performance.now()-started),detail:detail+'; poznamka Testy zustava pro diagnostiku.'});break;}
  }
 }catch(e){failed=true;output.push({id:cases[0][0],name:cases[0][1],kind,status:'APP_BLOCKED',ms:0,detail:String(e?.message||e).slice(0,210)});}
 finally{restore();busy=false;}
 const seen=new Set(output.map(r=>r.id));for(const [testId,name] of cases)if(!seen.has(testId))output.push({id:testId,name,kind,status:'APP_BLOCKED',ms:0,detail:failed?'Předchozí krok selhal.':'Test nebyl spuštěn.'});
 return output;
}
window.LubaNoteAutoTesterLive691C=Object.freeze({run,expected:cases.map(([id])=>id)});
})();
