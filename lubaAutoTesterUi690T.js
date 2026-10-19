/* 690T – visible production editor walkthrough for an owned LOCAL Testy note.
 * Uses real LubaNote screen, toolbar button and the shipped LubaKeyboard command path.
 * This is not Android UIAutomator: .click() is programmatic, not a native touch.
 * Never operates on any note unless it has the 690T marker, Testy label and LOCAL scope.
 */
(() => {
  'use strict';
  let busy=false;
  const rows = [
    ['ui-real-open', 'Běžná aplikace – otevření vlastní poznámky Testy'],
    ['ui-real-toolbar','Běžná aplikace – otevření skutečných nástrojů editoru'],
    ['ui-real-keyboard','Běžná aplikace – psaní přes produkční příkaz LubaKeyboard'],
    ['ui-real-save','Běžná aplikace – uložení tlačítkem a nové načtení']
  ];
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const assert=(condition,code)=>{if(!condition)throw Error(code);};
  const owned=id=>window.loadTask?.().find(n=>n?.id===id&&n.storageScope==='local'&&
    n.isSecret!==true&&n.tags?.includes('Testy')&&String(n.title||'').startsWith('[AutoTester 690T]'));
  async function run(id,alive=()=>true,progress=()=>{},minimize=()=>{},restore=()=>{}){
    if(busy)return rows.map(([id,name])=>({id,name,status:'APP_BLOCKED',kind:'REAL_VISIBLE_EDITOR_690T',ms:0,detail:'ui_runner_busy'}));
    busy=true;
    const output=[];
    const marker=' Zapis_z_viditelneho_editoru_690T';
    const started=performance.now();
    let failed=false;
    try{
      assert(window.LubaNoteAdminTools?.isAllowed?.()===true,'admin_required');
      assert(owned(id),'test_note_not_owned_or_missing');
      assert(typeof window.openTaskEditorById==='function','production_note_open_missing');
      assert(document.getElementById('taskModal')?.hidden!==false,'another_editor_is_open');
      minimize();
      for(let i=0;i<rows.length;i++){
        const [testId,name]=rows[i];
        if(!alive())throw Error('test_cancelled');
        progress(`V aplikaci ${i+1}/${rows.length} · ${name}`);
        const tick=performance.now();
        try{
          if(i===0){
            await window.openTaskEditorById(id);
            assert(document.getElementById('taskModal')?.hidden===false,'modal_not_visible');
            assert(document.getElementById('taskModal')?.dataset?.taskId===id,'wrong_note_opened');
            assert(window.LubaNoteEditorV2Bridge?.jeAktivni?.()===true,'core_editor_not_active');
            await wait(750);
          }else if(i===1){
            const button=document.getElementById('editorToolbarToggle');
            assert(button&&!button.disabled,'real_toolbar_button_missing');
            if(button.getAttribute('aria-expanded')!=='true')button.click();
            await wait(650);
            const opened=button.getAttribute('aria-expanded')==='true' ||
              document.getElementById('editorQuickToolbar')?.hidden===false;
            assert(opened,'toolbar_did_not_open');
          }else if(i===2){
            const core=window.LubaNoteEditorV2;
            assert(core?.provedPrikazVlastniKlavesnice,'production_keyboard_missing');
            core.nastavPoziciOtevreni?.('end');
            core.ziskejEditorElement?.()?.focus?.({preventScroll:true});
            const written=core.provedPrikazVlastniKlavesnice('text',marker);
            assert(written===true,'production_keyboard_rejected');
            assert(String(core.exportujProstyText?.()||'').includes(marker.trim()),'editor_model_missing_new_text');
            await wait(900);
          }else if(i===3){
            const save=document.getElementById('editorBackButton');
            assert(save&&!save.disabled,'real_save_button_missing');
            save.click();
            let closed=false;
            for(let k=0;k<30;k++){
              if(!alive())throw Error('cancelled_during_save');
              await wait(150);
              if(document.getElementById('taskModal')?.hidden===true){closed=true;break;}
            }
            assert(closed,'editor_not_closed_after_save');
            await window.LubaNoteRegularNotesStore?.cekejNaUlozeni?.();
            assert(String(owned(id)?.note||'').includes(marker.trim()) ||
              String(owned(id)?.richContent||'').includes(marker.trim()),'saved_local_note_does_not_contain_written_text');
          }
          output.push({id:testId,name,status:'APP_PASS',kind:'REAL_VISIBLE_EDITOR_690T',ms:Math.round(performance.now()-tick),
            detail:'Produkční obrazovka, skutečné API editoru a jeho tlačítka. Programový click/klávesnice; ne Android fyzický dotyk.'});
        }catch(error){
          failed=true;
          output.push({id:testId,name,status:'APP_FAIL',kind:'REAL_VISIBLE_EDITOR_690T',ms:Math.round(performance.now()-tick),
            detail:String(error?.message||error).slice(0,170)+' · poznámka Testy byla ponechána pro diagnostiku.'});
          break;
        }
      }
    }catch(error){
      failed=true;
      output.push({id:'ui-real-open',name:rows[0][1],status:'APP_BLOCKED',kind:'REAL_VISIBLE_EDITOR_690T',ms:Math.round(performance.now()-started),detail:String(error?.message||error).slice(0,170)});
    }finally{
      restore();
      busy=false;
    }
    const doneIds=new Set(output.map(r=>r.id));
    for(const [testId,name] of rows){
      if(!doneIds.has(testId))output.push({id:testId,name,kind:'REAL_VISIBLE_EDITOR_690T',status:'APP_BLOCKED',ms:0,
        detail:failed?'Předchozí krok selhal – tento test nebyl vykonán.':'Nevykonáno.'});
    }
    return output;
  }
  window.LubaNoteAutoTesterUi690T=Object.freeze({run});
})();
