/* 691H – resilient OWN selection-handle drag, preserve independent save/real-UI tests. Based on 690X; two distinct native taps verify OWN model movement; resolve modal block of OWN handles + corrected native TAP setup of OWN LubaNote caret/selection in the live production editor, plus 690T walkthrough for an owned LOCAL Testy note.
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
  // 690V: Produkcni engine kresli vlastni caret POUZE po skutecnem TAPU do tela.
  // Samotne focus()+LubaKeyboard.zobraz() aktivniCilPsani='body' nenastavi.
  const viditelne=el=>Boolean(el?.isConnected&&!el.hidden&&
    el.getBoundingClientRect().width>0&&el.getBoundingClientRect().height>0&&
    getComputedStyle(el).display!=='none'&&getComputedStyle(el).visibility!=='hidden');
  const ownStav=(core,keyboard,editor)=>{
    const caret=document.querySelector('.ln-v2-luba-caret');
    const handle=document.querySelector('.ln-v2-single-caret-handle');
    const model=core?.zachytAktualniVyber?.();
    return {caret,handle,model,
      ready:keyboard?.ziskejZdroj?.()==='luba'&&keyboard?.jeOtevrena?.()===true&&
        keyboard?.ziskejCilPsani?.()==='body'&&editor?.dataset?.lnV2OwnCaretOnly==='1'&&
        model?.sbaleny===true&&viditelne(caret)&&viditelne(handle)};
  };
  const ownDiagnostika=(core,keyboard,editor)=>{
    const s=ownStav(core,keyboard,editor);
    return ['source='+String(keyboard?.ziskejZdroj?.()||'-'),
      'open='+String(keyboard?.jeOtevrena?.()),
      'target='+String(keyboard?.ziskejCilPsani?.()||'-'),
      'ownMode='+String(editor?.dataset?.lnV2OwnCaretOnly||'-'),
      'model='+String(s.model?.sbaleny?'collapsed':'missing-or-range'),
      'caret='+String(viditelne(s.caret)),
      'handle='+String(viditelne(s.handle)),
      'handleExists='+Boolean(s.handle?.isConnected),
      'handleHidden='+String(s.handle?.hidden),
      'handleDisplay='+String(s.handle?getComputedStyle(s.handle).display:'missing'),
      'selectionUiBlocked='+String(document.body.classList.contains('ln-v2-selection-ui-blocked')),
      'testerModal='+String(document.getElementById('ln-auto-tester')?.getAttribute('aria-modal'))].join(', ');
  };
  async function inicializujVlastniCaret(id,core,keyboard,editor,alive){
    assert(keyboard?.ziskejZdroj?.()==='luba','luba_keyboard_mode_not_active');
    assert(editor?.isConnected,'custom_editor_missing');
    assert(typeof keyboard?.pripravEditor==='function','production_keyboard_prepare_missing');
    const plugin=window.Capacitor?.Plugins?.LubaNoteNativeTester;
    assert(window.Capacitor?.getPlatform?.()==='android'&&typeof plugin?.gestureOwnedEditor==='function',
      'owned_native_bridge_unavailable');
    keyboard.pripravEditor(editor); // pouze produkcni API, nemeni nastaveni klavesnice
    editor.focus({preventScroll:true});
    const walker=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT);
    let textNode=null,n;
    while((n=walker.nextNode()))if(String(n.nodeValue||'').includes('Zapis_z_viditelneho_editoru_690T')){textNode=n;break;}
    assert(textNode,'test_marker_missing_in_editor');
    const radek=textNode.parentElement?.closest?.('.ln-v2-odstavec')||textNode.parentElement;
    radek?.scrollIntoView?.({block:'center',inline:'nearest',behavior:'instant'});
    await wait(160);
    assert(alive(),'cancelled_before_own_native_tap');
    // DULEZITE: tento skutecny Android MotionEvent aktivuje otevriPoSkutecnemTapu().
    const ack=await plugin.gestureOwnedEditor({id,target:'word',type:'tap'});
    assert(ack?.delivery==='WEBVIEW_DISPATCH_TOUCH_EVENT','own_caret_setup_native_tap_missing_ack');
    let stav;
    for(let tries=0;tries<18;tries++){
      if(!alive())throw Error('cancelled_waiting_for_own_caret');
      await wait(100);
      stav=ownStav(core,keyboard,editor);
      if(stav.ready)return stav;
    }
    throw Error('own_caret_not_ready_after_real_tap: '+ownDiagnostika(core,keyboard,editor));
  }
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
            await inicializujVlastniCaret(id,core,keyboard,editor,alive);
            assert(ownStav(core,keyboard,editor).ready,
              'own_caret_missing_after_native_tap: '+ownDiagnostika(core,keyboard,editor));
          }else if(i===4){
            // 690X: Compare TWO native taps at two different LETTERS in the
            // same known test marker. Do not compare against an artificial
            // scroll/fallback position: nastavPoziciOtevreni('end') intentionally
            // hides the caret and is not a user tap.
            const plugin=window.Capacitor?.Plugins?.LubaNoteNativeTester;
            assert(window.Capacitor?.getPlatform?.()==='android'&&typeof plugin?.gestureOwnedEditor==='function',
              'owned_native_bridge_unavailable');
            const core=window.LubaNoteEditorV2;
            const editor=core?.ziskejEditorElement?.();
            assert(editor?.isConnected&&editor?.dataset?.lnV2OwnCaretOnly==='1',
              'own_tap_editor_not_in_own_mode');
            const probeText=()=>{
              const walker=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT);
              let node,off=-1;
              while((node=walker.nextNode())){
                off=String(node.nodeValue||'').indexOf('Zapis_z_viditelneho_editoru_690T');
                if(off>=0)break;
              }
              assert(node&&off>=0,'own_tap_marker_node_missing');
              const pointAt=part=>{
                const delta=part==='word-early'?3:17;
                const range=document.createRange();
                range.setStart(node,off+delta);range.setEnd(node,off+delta+1);
                const r=range.getBoundingClientRect();
                assert(r.width>0&&r.height>0,'own_tap_marker_not_rendered_'+part);
                const x=r.left+r.width/2,y=r.top+r.height/2;
                const cp=document.caretPositionFromPoint?.(x,y)||document.caretRangeFromPoint?.(x,y);
                return {x:Math.round(x),y:Math.round(y),offset:cp?.offset??cp?.startOffset??'-',
                  nodeOk:Boolean(editor.contains(cp?.offsetNode||cp?.startContainer))};
              };
              return {early:pointAt('word-early'),late:pointAt('word-late')};
            };
            const points=probeText();
            assert(Math.hypot(points.early.x-points.late.x,points.early.y-points.late.y)>=8,
              'own_tap_targets_not_distinct');
            assert(points.early.nodeOk&&points.late.nodeOk,'own_tap_targets_outside_editor_text');
            const format=sel=>sel?.sbaleny&&sel?.konec?
              `${sel.konec.blok}:${sel.konec.offset}`:'invalid';
            const ownTap=async target=>{
              let starts=0,ends=0;
              const start=e=>{if(e.isTrusted)starts++;};
              const finish=e=>{if(e.isTrusted)ends++;};
              editor.addEventListener('touchstart',start,true);
              editor.addEventListener('touchend',finish,true);
              try{
                const ack=await plugin.gestureOwnedEditor({id,target,type:'tap'});
                assert(ack?.delivery==='WEBVIEW_DISPATCH_TOUCH_EVENT',
                  `native_tap_ack_missing_${target}`);
                await wait(240);
              }finally{
                editor.removeEventListener('touchstart',start,true);
                editor.removeEventListener('touchend',finish,true);
              }
              return {at:format(core.zachytAktualniVyber?.()),starts,ends};
            };
            const early=await ownTap('word-early');
            const late=await ownTap('word-late');
            const detail=`early=${early.at} late=${late.at}; `+
              `touch=${early.starts}/${early.ends},${late.starts}/${late.ends}; `+
              `target=${points.early.x},${points.early.y}->${points.late.x},${points.late.y}; `+
              `dom=${points.early.offset}->${points.late.offset}`;
            assert(early.starts>0&&early.ends>0&&late.starts>0&&late.ends>0,
              'own_tap_trusted_touch_missing: '+detail);
            assert(early.at!=='invalid'&&late.at!=='invalid'&&early.at!==late.at,
              'native_taps_did_not_change_own_model: '+detail);
            assert(ownStav(core,window.LubaNoteKeyboard,editor).ready,
              'own_caret_not_visible_after_native_taps: '+detail+'; '+ownDiagnostika(core,window.LubaNoteKeyboard,editor));
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
            // 691H: Selection may end near a row/viewport edge. A 5px swipe
            // could ACK as delivered yet fail to change the actual OWN selection.
            // Exercise END first, then START only if the real model stayed the same.
            // Neither gesture directly edits model, DOM selection or handles.
            const editor=window.LubaNoteEditorV2?.ziskejEditorElement?.();
            const selected=()=>{
              const value=window.LubaNoteEditorV2?.ziskejTextVyberuProSelectionMenu?.();
              return typeof value==='string'?value:String(value?.text||'');
            };
            const drag=async target=>{
              const ack=await plugin.gestureOwnedEditor({id,target,type:'swipe'});
              assert(ack?.delivery==='WEBVIEW_DISPATCH_TOUCH_EVENT',
                'own_handle_drag_no_ack_'+target);
              await wait(350);
              assert(editor?.classList.contains('ln-v2-selection-custom-active'),
                'custom_selection_lost_after_drag_'+target);
              return selected();
            };
            let after=await drag('selection-end');
            if(after===ownSelectionBefore)after=await drag('selection-start');
            assert(after.length>0&&after!==ownSelectionBefore,
              'own_handle_drag_did_not_change_selected_text: beforeLength='+
              ownSelectionBefore.length+', afterLength='+after.length);
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
            detail:String(error?.message||error).slice(0,280)+' · poznámka Testy byla ponechána pro diagnostiku.'});
          // 691H: The handle gesture is a standalone assertion; SAVE is not
          // dependent on that assertion. Retain the actual FAIL but still run
          // production save/reopen so later independent live tests may proceed.
          if(i===7)continue;
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
