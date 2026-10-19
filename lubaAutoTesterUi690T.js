/* 690U – own LubaNote caret/selection in the live production editor, plus 690T walkthrough for an owned LOCAL Testy note.
 * Uses real LubaNote screen, toolbar button and the shipped LubaKeyboard command path.
 * This is not Android UIAutomator. The original toolbar/save clicks are programmatic;
 * steps ui-own-* now use native Java MotionEvent in the actual OWN-LubaNote editor.
 * Never operates on any note unless it has the 690T marker, Testy label and LOCAL scope.
 */
(() => {
  'use strict';
  let busy=false;
  const rows = [
    ['ui-real-open', 'Běžná aplikace – otevření vlastní poznámky Testy'],
    ['ui-real-toolbar','Běžná aplikace – otevření skutečných nástrojů editoru'],
    ['ui-real-keyboard','Běžná aplikace – psaní přes produkční příkaz LubaKeyboard'],
    ['ui-own-caret','LubaNote – vlastní modelový caret a červená kapka'],
    ['ui-own-tap','LubaNote – nativní dotyk ovládá náš caret'],
    ['ui-own-caret-drag','LubaNote – nativní tah vlastní kapky posune caret'],
    ['ui-own-selection','LubaNote – dvojtap vytvoří náš výběr a dvě vlastní kapky'],
    ['ui-own-handle-drag','LubaNote – nativní tah vlastní kapky změní výběr'],
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
    let ownSelectionBefore='';
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
            const core=window.LubaNoteEditorV2;
            const keyboard=window.LubaNoteKeyboard;
            const editor=core?.ziskejEditorElement?.();
            assert(editor?.isConnected,'custom_editor_missing');
            assert(keyboard?.ziskejZdroj?.()==='luba','luba_keyboard_mode_not_active');
            editor.focus({preventScroll:true});
            keyboard.zobraz?.();
            await wait(400);
            assert(editor.dataset.lnV2OwnCaretOnly==='1','own_caret_mode_not_enabled');
            const cursor=document.querySelector('.ln-v2-luba-caret:not([hidden])');
            const handle=document.querySelector('.ln-v2-single-caret-handle:not([hidden])');
            const visible=el=>Boolean(el?.isConnected&&el.getBoundingClientRect().height>0&&
              getComputedStyle(el).display!=='none'&&getComputedStyle(el).visibility!=='hidden');
            assert(visible(cursor),'luba_caret_not_rendered');
            assert(visible(handle),'luba_insertion_handle_not_rendered');
            const model=core.zachytAktualniVyber?.();
            assert(model?.sbaleny===true&&model.konec?.offset>=0,'own_caret_model_position_missing');
          }else if(i===4){
            const plugin=window.Capacitor?.Plugins?.LubaNoteNativeTester;
            assert(window.Capacitor?.getPlatform?.()==='android'&&typeof plugin?.gestureOwnedEditor==='function',
              'owned_native_bridge_unavailable');
            const editor=window.LubaNoteEditorV2?.ziskejEditorElement?.();
            const before=window.LubaNoteEditorV2?.zachytAktualniVyber?.();
            let trusted=0;
            const listener=e=>{if(e.isTrusted)trusted++;};
            editor?.addEventListener('touchstart',listener,true);
            try{
              const ack=await plugin.gestureOwnedEditor({id,target:'word',type:'tap'});
              assert(ack?.delivery==='WEBVIEW_DISPATCH_TOUCH_EVENT','native_editor_tap_no_ack');
              await wait(260);
            }finally{editor?.removeEventListener('touchstart',listener,true);}
            assert(trusted>=1,'real_editor_trusted_touch_missing');
            const after=window.LubaNoteEditorV2?.zachytAktualniVyber?.();
            assert(after?.sbaleny===true,'tap_not_mapped_to_own_caret');
            assert(before?.konec&&(before.konec.offset!==after.konec.offset||before.konec.blok!==after.konec.blok),
              'native_tap_did_not_move_own_caret');
          }else if(i===5){
            const core=window.LubaNoteEditorV2;
            const before=core?.zachytAktualniVyber?.();
            const ack=await window.Capacitor?.Plugins?.LubaNoteNativeTester?.gestureOwnedEditor?.(
              {id,target:'caret-handle',type:'swipe'});
            assert(ack?.delivery==='WEBVIEW_DISPATCH_TOUCH_EVENT','own_caret_drag_no_native_ack');
            await wait(260);
            const after=core?.zachytAktualniVyber?.();
            assert(after?.sbaleny===true&&before?.konec&&
              (after.konec.blok!==before.konec.blok||after.konec.offset!==before.konec.offset),
              'own_caret_handle_drag_did_not_move_model');
          }else if(i===6){
            const plugin=window.Capacitor?.Plugins?.LubaNoteNativeTester;
            assert(typeof plugin?.gestureOwnedEditor==='function','owned_native_bridge_unavailable');
            const ack=await plugin.gestureOwnedEditor({id,target:'word',type:'doubletap'});
            assert(ack?.delivery==='WEBVIEW_DISPATCH_TOUCH_EVENT','native_editor_doubletap_no_ack');
            await wait(440);
            const editor=window.LubaNoteEditorV2?.ziskejEditorElement?.();
            const ownedHandle=(side)=>document.querySelector('.ln-v2-selection-handle-custom'+
              '[data-ln-v2-selection-handle="'+side+'"]:not([hidden])');
            assert(editor?.classList.contains('ln-v2-selection-custom-active')===true,
              'custom_selection_engine_not_activated');
            assert(ownedHandle('start')&&ownedHandle('end'),'own_selection_handles_not_visible');
            assert(document.getElementById('selectionMenu')?.dataset?.lnV2Owner==='1',
              'selection_menu_not_owned_by_lubanote');
            const selected=window.LubaNoteEditorV2?.ziskejTextVyberuProSelectionMenu?.();
            ownSelectionBefore=typeof selected==='string'?selected:String(selected?.text||'');
            assert(ownSelectionBefore.length>0,'own_selection_has_no_model_text');
          }else if(i===7){
            const plugin=window.Capacitor?.Plugins?.LubaNoteNativeTester;
            assert(typeof plugin?.gestureOwnedEditor==='function','owned_native_bridge_unavailable');
            assert(ownSelectionBefore.length>0,'missing_previous_own_selection');
            const ack=await plugin.gestureOwnedEditor({id,target:'selection-end',type:'swipe'});
            assert(ack?.delivery==='WEBVIEW_DISPATCH_TOUCH_EVENT','own_handle_drag_no_ack');
            await wait(320);
            const editor=window.LubaNoteEditorV2?.ziskejEditorElement?.();
            assert(editor?.classList.contains('ln-v2-selection-custom-active'),
              'custom_selection_lost_after_drag');
            const current=window.LubaNoteEditorV2?.ziskejTextVyberuProSelectionMenu?.();
            const after=typeof current==='string'?current:String(current?.text||'');
            assert(after.length>0&&after!==ownSelectionBefore,
              'own_handle_drag_did_not_change_selected_text');
          }else if(i===8){
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
          output.push({id:testId,name,status:i>=4&&i<=7?'NATIVE_PASS':'APP_PASS',kind:i>=4&&i<=7?'OWN_LUBANOTE_NATIVE_INPUT_690U':'REAL_VISIBLE_EDITOR_690T',ms:Math.round(performance.now()-tick),
            detail:i>=4&&i<=7?'Java MotionEvent v běžné poznámce + kontrola vlastního LubaNote caretu, selection a kapek. Ne OS selection.':'Produkční editor a vlastní LubaKeyboard; nikoli fyzický prst.'});
        }catch(error){
          failed=true;
          const cause=String(error?.message||error);
          const unavailable=/owned_native_bridge_unavailable|luba_keyboard_mode_not_active|own_caret_mode_not_enabled/.test(cause);
          output.push({id:testId,name,status:unavailable?(i>=4&&i<=7?'NATIVE_BLOCKED':'APP_BLOCKED'):(i>=4&&i<=7?'NATIVE_FAIL':'APP_FAIL'),kind:i>=4&&i<=7?'OWN_LUBANOTE_NATIVE_INPUT_690U':'REAL_VISIBLE_EDITOR_690T',ms:Math.round(performance.now()-tick),
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
    for(let index=0;index<rows.length;index++){
      const [testId,name]=rows[index];
      if(!doneIds.has(testId))output.push({id:testId,name,kind:index>=4&&index<=7?'OWN_LUBANOTE_NATIVE_INPUT_690U':'REAL_VISIBLE_EDITOR_690T',status:index>=4&&index<=7?'NATIVE_BLOCKED':'APP_BLOCKED',ms:0,
        detail:failed?'Předchozí krok selhal – tento test nebyl vykonán.':'Nevykonáno.'});
    }
    return output;
  }
  window.LubaNoteAutoTesterUi690T=Object.freeze({run});
})();
