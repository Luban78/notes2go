/* 691BC/691AK/691W/691H – resilient OWN selection-handle drag, preserve independent save/real-UI tests. Based on 690X; two distinct native taps verify OWN model movement; resolve modal block of OWN handles + corrected native TAP setup of OWN LubaNote caret/selection in the live production editor, plus 690T walkthrough for an owned LOCAL Testy note.
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
    ['ui-own-handle-drag','LubaNote – nativní tah obou kapek nezávisle změní výběr'],
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
            // 691M: po otevření vlastní klávesnice se může zmenšit viewport.
            // Obnovit viditelnost markeru až po inicializaci OWN caretu.
            const walkerMarker=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT);
            let markerNode=null, uzel;
            while((uzel=walkerMarker.nextNode())){
              if(String(uzel.nodeValue||'').includes('Zapis_z_viditelneho_editoru_690T')){
                markerNode=uzel;break;
              }
            }
            markerNode?.parentElement?.closest?.('.ln-v2-odstavec')?.scrollIntoView?.(
              {block:'center',inline:'nearest',behavior:'instant'});
            await wait(150);
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
            // 691BC: Previous native step ends near the late part of a word.
            // A blind 45px rightward swipe can hit the end of a line and leave
            // the OWN model unchanged even when the handle is working.
            // Establish a reproducible EARLY caret position by a REAL native
            // tap, then capture the model. ONLY the subsequent native handle
            // swipe may satisfy the movement assertion; setup never counts.
            const core=window.LubaNoteEditorV2;
            const keyboard=window.LubaNoteKeyboard;
            const editor=core?.ziskejEditorElement?.();
            const plugin=window.Capacitor?.Plugins?.LubaNoteNativeTester;
            assert(editor?.isConnected&&typeof plugin?.gestureOwnedEditor==='function',
              'own_caret_drag_preflight_unavailable');
            const walker=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT);
            let markerNode=null,node;
            while((node=walker.nextNode())){
              if(String(node.nodeValue||'').includes('Zapis_z_viditelneho_editoru_690T')){
                markerNode=node;break;
              }
            }
            assert(markerNode,'own_caret_drag_marker_missing');
            markerNode.parentElement?.closest?.('.ln-v2-odstavec')?.scrollIntoView?.(
              {block:'center',inline:'nearest',behavior:'instant'});
            await wait(150);
            const setup=await plugin.gestureOwnedEditor({id,target:'word-early',type:'tap'});
            assert(setup?.delivery==='WEBVIEW_DISPATCH_TOUCH_EVENT',
              'own_caret_drag_setup_native_tap_no_ack');
            await wait(200);
            assert(ownStav(core,keyboard,editor).ready,
              'own_caret_drag_not_ready_after_setup: '+ownDiagnostika(core,keyboard,editor));
            const before=core.zachytAktualniVyber?.();
            const location=sel=>sel?.sbaleny&&sel?.konec?
              String(sel.konec.blok)+':'+String(sel.konec.offset):'invalid';
            assert(before?.sbaleny===true&&before?.konec,
              'own_caret_drag_before_invalid');
            let down=0,move=0,up=0,hit='-';
            const onDown=e=>{
              if(!e.isTrusted)return;
              const h=e.target?.closest?.('.ln-v2-single-caret-handle');
              if(h){down++;hit='OWN';}
            };
            const onMove=e=>{if(e.isTrusted)move++;};
            const onUp=e=>{if(e.isTrusted)up++;};
            document.addEventListener('touchstart',onDown,true);
            document.addEventListener('touchmove',onMove,true);
            document.addEventListener('touchend',onUp,true);
            let ack;
            try{
              ack=await plugin.gestureOwnedEditor({id,target:'caret-handle',type:'swipe'});
              await wait(260);
            }finally{
              document.removeEventListener('touchstart',onDown,true);
              document.removeEventListener('touchmove',onMove,true);
              document.removeEventListener('touchend',onUp,true);
            }
            assert(ack?.delivery==='WEBVIEW_DISPATCH_TOUCH_EVENT','own_caret_drag_no_native_ack');
            const after=core.zachytAktualniVyber?.();
            const evidence='before='+location(before)+' after='+location(after)+
              ' touch='+down+'/'+move+'/'+up+' hit='+hit;
            assert(down>0&&move>0&&up>0&&hit==='OWN',
              'own_caret_drag_trusted_touch_missing: '+evidence);
            assert(after?.sbaleny===true&&after?.konec&&
              (after.konec.blok!==before.konec.blok||after.konec.offset!==before.konec.offset),
              'own_caret_handle_drag_did_not_move_model: '+evidence);
          }else if(i===6){
            const plugin=window.Capacitor?.Plugins?.LubaNoteNativeTester;
            assert(typeof plugin?.gestureOwnedEditor==='function','owned_native_bridge_unavailable');
            const editor=window.LubaNoteEditorV2?.ziskejEditorElement?.();
            const ownedHandle=(side)=>document.querySelector('.ln-v2-selection-handle-custom'+
              '[data-ln-v2-selection-handle="'+side+'"]:not([hidden])');
            const capture=()=>{
              const selected=window.LubaNoteEditorV2?.ziskejTextVyberuProSelectionMenu?.();
              const text=typeof selected==='string'?selected:String(selected?.text||'');
              return {text,active:editor?.classList.contains('ln-v2-selection-custom-active')===true,
                handles:!!(ownedHandle('start')&&ownedHandle('end')),
                menu:document.getElementById('selectionMenu')?.dataset?.lnV2Owner==='1'};
            };
            const attempts=[];let result=null;
            // 691W: after a prior caret-handle swipe the text marker can be
            // outside the actual visible content. Recenter the exact owned
            // marker and use at most ONE second native doubletap if needed.
            for(const target of ['word','word-early']){
              if(!alive())throw Error('selection_test_cancelled');
              const walker=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT);
              let node=null,item;
              while((item=walker.nextNode())){
                if(String(item.nodeValue||'').includes('Zapis_z_viditelneho_editoru_690T')){node=item;break;}
              }
              assert(node,'selection_test_marker_missing');
              node.parentElement?.closest?.('.ln-v2-odstavec')?.scrollIntoView?.(
                {block:'center',inline:'nearest',behavior:'instant'});
              await wait(180);
              const ack=await plugin.gestureOwnedEditor({id,target,type:'doubletap'});
              assert(ack?.delivery==='WEBVIEW_DISPATCH_TOUCH_EVENT','native_editor_doubletap_no_ack_'+target);
              await wait(440);
              result=capture();attempts.push(target+':'+
                [result.active,result.handles,result.menu,result.text.length].join('/'));
              if(result.active&&result.handles&&result.menu&&result.text.length>0)break;
            }
            assert(result?.active===true,'custom_selection_engine_not_activated: '+attempts.join(', ')+
              '; '+ownDiagnostika(window.LubaNoteEditorV2,window.LubaNoteKeyboard,editor));
            assert(result.handles,'own_selection_handles_not_visible: '+attempts.join(', '));
            assert(result.menu,'selection_menu_not_owned_by_lubanote: '+attempts.join(', '));
            ownSelectionBefore=result.text;
            assert(ownSelectionBefore.length>0,'own_selection_has_no_model_text: '+attempts.join(', '));
          }else if(i===7){
            const plugin=window.Capacitor?.Plugins?.LubaNoteNativeTester;
            assert(typeof plugin?.gestureOwnedEditor==='function','owned_native_bridge_unavailable');
            assert(ownSelectionBefore.length>0,'missing_previous_own_selection');
            // 691AC: Both native OWN selection handles must independently move
            // the actual production selection. A successful END swipe must not
            // silently stand in for an untested START handle. Java MotionEvent
            // is not a human finger; this remains a partial V1 scenario proof.
            const editor=window.LubaNoteEditorV2?.ziskejEditorElement?.();
            const selected=()=>{
              const value=window.LubaNoteEditorV2?.ziskejTextVyberuProSelectionMenu?.();
              return typeof value==='string'?value:String(value?.text||'');
            };
            // 691AC: measure both REAL touch streams and model endpoints.
            // A delivered MotionEvent ACK alone does not prove the handle moved.
            const readModel=()=>{
              const v=window.LubaNoteEditorV2?.zachytAktualniVyber?.();
              return [v?.zacatek?.blok,v?.zacatek?.offset,v?.konec?.blok,v?.konec?.offset].map(x=>String(x??'?')).join(':');
            };
            // 691AJ: Failing START swipe must carry usable native evidence.
            // Observe trusted coordinates and whether the model EVER moves,
            // even temporarily during the 10 Java MotionEvent steps.
            // DO NOT turn a failed selection into PASS based on delivery alone.
            // 691AM: READ-ONLY glyph path and viewport diagnostic for genuine Java MotionEvent.
            // 691AK: READ-ONLY diagnostic for genuine Java MotionEvent.
            // Inspect actual touch and the glyph under the finger vs 22px above.
            // No synthetic PASS, no change to selection, gestures or production engine.
            const drag=async target=>{
              let trustedDown=0,trustedMove=0,hit='-',first=null,last=null;
              let duringChanged=false,engineStart='-',engineMove=0,engineLast='-';
              let pointsFirst='-',pointsLast='-',handleY='-';
              let targetStart='-',targetMid='-',targetEnd='-';
              let traceStart='-',traceMiddle='-',traceEnd='-',traceFinish='-';
              let engineTrace=[],captureTrace=[],bubbleTrace=[];
              const before=readModel();
              const coordinate=e=>{
                const t=e.touches?.[0]||e.changedTouches?.[0];
                return t?{x:Math.round(t.clientX),y:Math.round(t.clientY)}:null;
              };
              const probe=(x,y)=>{
                try{
                  let node=null,off=null;
                  const p=document.caretPositionFromPoint?.(x,y);
                  if(p?.offsetNode){node=p.offsetNode;off=p.offset;}
                  else{
                    const r=document.caretRangeFromPoint?.(x,y);
                    node=r?.startContainer;off=r?.startOffset;
                  }
                  if(!node)return '-';
                  return (editor?.contains(node)?'I':'O')+
                    (node.nodeType===Node.TEXT_NODE?'T':'E')+String(off??'?');
                }catch(_){return '!';}
              };
              const atPoint=c=>c?probe(c.x,c.y)+'/'+probe(c.x,c.y-22):'-';
              // 691AO: target-point proof at touch and text-glyph Y; read-only.
              // DOM caret may be absent when the finger sits on the handle.
              const targetProof=c=>{
                if(!c)return '-';
                const out=[];
                for(const dy of [0,-22,-36]){
                  const y=c.y+dy;
                  try{
                    const cp=document.caretPositionFromPoint?.(c.x,y);
                    const cr=cp?.offsetNode?null:document.caretRangeFromPoint?.(c.x,y);
                    const n=cp?.offsetNode||cr?.startContainer;
                    const off=cp?.offset??cr?.startOffset;
                    let inside=Boolean(n&&editor?.contains(n));
                    let range='-';
                    if(inside&&n?.nodeType===Node.TEXT_NODE&&Number.isInteger(off)){
                      const rg=document.createRange();rg.setStart(n,off);rg.collapse(true);
                      const rect=rg.getBoundingClientRect();
                      range=Math.round(rect.x)+'/'+Math.round(rect.y);
                    }
                    out.push(dy+':'+(inside?'I':'O')+
                      (n?.nodeType===Node.TEXT_NODE?'T':'E')+
                      (off??'?')+'@'+range);
                  }catch(_){out.push(dy+':!');}
                }
                return out.join(';');
              };
              // 691AM: A missing caretPositionFromPoint alone does not prove
              // the target left the editor. Record the actual element and viewport
              // on the touch path, without altering the native gesture.
              const glyphPath=c=>{
                if(!c)return '-';
                try{
                  const r=editor?.getBoundingClientRect();
                  const el=document.elementFromPoint(c.x,c.y);
                  const cls=el?.classList;
                  const where=el===editor?'EDITOR':editor?.contains(el)?'INSIDE':'OUTSIDE';
                  const kind=cls?.contains('ln-v2-selection-handle-custom')?'HANDLE':
                    cls?.contains('ln-v2-odstavec')?'ROW':String(el?.tagName||'?').slice(0,8);
                  const bounds=r?Math.round(r.left)+','+Math.round(r.top)+','+
                    Math.round(r.right)+','+Math.round(r.bottom):'-';
                  const vv=window.visualViewport;
                  return c.x+','+c.y+':'+where+'/'+kind+
                    ':glyph='+probe(c.x,c.y)+'/'+probe(c.x,c.y-22)+
                    ':editor='+bounds+':vp='+Math.round(vv?.width||innerWidth)+'x'+
                    Math.round(vv?.height||innerHeight);
                }catch(_){return '!';}
              };
              const engine=()=>{
                const d=window.LUBANOTE_V2_SELECTION_DIAG;
                return d?.dragging===true?('D'+(d.side==='start'?'S':d.side==='end'?'E':'?')):'N';
              };
              // 691AN: READ-ONLY trace of selection engine and event propagation.
              // Capture and bubble are both observed; no production handler changes.
              const engineState=()=>{
                const d=window.LUBANOTE_V2_SELECTION_DIAG;
                if(!d)return 'none';
                const v=x=>x==null?'-':typeof x==='object'?'obj':String(x).slice(0,24);
                return 'drag='+v(d.dragging)+',side='+v(d.side)+
                  ',keys='+Object.keys(d).slice(0,14).join('/');
              };
              const captureMove=e=>{
                if(!e.isTrusted||captureTrace.length>=4)return;
                const c=coordinate(e);
                captureTrace.push('c'+captureTrace.length+':'+(c?c.x+'/'+c.y:'-')+
                  ':'+readModel()+':'+engineState());
              };
              const bubbleMove=e=>{
                if(!e.isTrusted||bubbleTrace.length>=4)return;
                const c=coordinate(e);
                bubbleTrace.push('b'+bubbleTrace.length+':'+(c?c.x+'/'+c.y:'-')+
                  ':'+readModel()+':'+engineState()+':default='+e.defaultPrevented);
              };
              const onStart=e=>{
                if(!e.isTrusted)return;
                const t=e.target?.closest?.('[data-ln-v2-selection-handle]');
                if(t){
                  trustedDown++;hit=t.getAttribute('data-ln-v2-selection-handle')||'-';
                  first=coordinate(e);engineStart=engine();traceStart=glyphPath(first);targetStart=targetProof(first);
                  const rect=t.getBoundingClientRect();
                  handleY=Math.round(rect.top)+'-'+Math.round(rect.bottom);
                }
              };
              const onMove=e=>{
                if(!e.isTrusted)return;
                trustedMove++;last=coordinate(e);
                if(readModel()!==before)duringChanged=true;
                const phase=engine();engineLast=phase;
                if(engineTrace.length<5)engineTrace.push(trustedMove+':'+readModel()+':'+engineState());
                if(phase.startsWith('D'))engineMove++;
                if(trustedMove===1){pointsFirst=atPoint(last);traceMiddle=glyphPath(last);targetMid=targetProof(last);}
                if(trustedMove===Math.max(1,Math.floor(5)))traceEnd=glyphPath(last);
                if(trustedMove===10){pointsLast=atPoint(last);targetEnd=targetProof(last);}
              };
              const onFinish=e=>{if(e.isTrusted)traceFinish=glyphPath(coordinate(e));};
              document.addEventListener('touchend',onFinish,true);
              document.addEventListener('touchstart',onStart,true);
              document.addEventListener('touchmove',onMove,true);
              window.addEventListener('touchmove',captureMove,true);
              document.addEventListener('touchmove',bubbleMove,false);
              let ack;
              try {ack=await plugin.gestureOwnedEditor({id,target,type:'swipe'});await wait(350);}
              finally {
                document.removeEventListener('touchend',onFinish,true);
                document.removeEventListener('touchstart',onStart,true);
                document.removeEventListener('touchmove',onMove,true);
                window.removeEventListener('touchmove',captureMove,true);
                document.removeEventListener('touchmove',bubbleMove,false);
              }
              assert(ack?.delivery==='WEBVIEW_DISPATCH_TOUCH_EVENT',
                'own_handle_drag_no_ack_'+target);
              assert(editor?.classList.contains('ln-v2-selection-custom-active'),
                'custom_selection_lost_after_drag_'+target);
              return {text:selected(),before,after:readModel(),trustedDown,trustedMove,hit,
                first,last,duringChanged,engineStart,engineMove,engineLast,
                pointsFirst,pointsLast,handleY,traceStart,traceMiddle,traceEnd,traceFinish,engineTrace,captureTrace,bubbleTrace,targetStart,targetMid,targetEnd};
            };
            const afterEnd=await drag('selection-end');
            assert(afterEnd.text.length>0&&afterEnd.text!==ownSelectionBefore,
              'own_END_handle_did_not_change_selection: beforeLength='+ownSelectionBefore.length+
              ', afterLength='+afterEnd.text.length+', touch='+afterEnd.trustedDown+'/'+afterEnd.trustedMove+
              ', hit='+afterEnd.hit+', model='+afterEnd.before+'>'+afterEnd.after);
            // The end handle has just shrunk the range. Re-select a fresh word
            // with actual Android taps before independently testing START.
            // Otherwise a near-collapsed range can make the second gesture
            // geometrically impossible even when START is functional.
            const startAttempts=[];
            let startChanged=false;
            // Both are real Android MotionEvents in the OWN Testy note.
            // First use a later visible word so START can travel outward to the
            // left rather than cross the END handle near the line margin.
            for(const slovo of ['word-late','word-early']){
              if(!alive())throw Error('own_start_drag_cancelled');
              try{
                const reTap=await plugin.gestureOwnedEditor({id,target:slovo,type:'tap'});
                assert(reTap?.delivery==='WEBVIEW_DISPATCH_TOUCH_EVENT','own_start_reset_tap_no_ack_'+slovo);
                await wait(210);
                const reDouble=await plugin.gestureOwnedEditor({id,target:slovo,type:'doubletap'});
                assert(reDouble?.delivery==='WEBVIEW_DISPATCH_TOUCH_EVENT','own_start_reset_doubletap_no_ack_'+slovo);
                await wait(450);
                const startBefore=selected();
                const hStart=document.querySelector('.ln-v2-selection-handle-custom[data-ln-v2-selection-handle="start"]:not([hidden])');
                const hEnd=document.querySelector('.ln-v2-selection-handle-custom[data-ln-v2-selection-handle="end"]:not([hidden])');
                assert(editor?.classList.contains('ln-v2-selection-custom-active')&&startBefore.length>0&&hStart&&hEnd,
                  'own_start_selection_not_ready_'+slovo+': length='+startBefore.length+',handles='+!!hStart+'/'+!!hEnd);
                const moved=await drag('selection-start');
                const changed=moved.text.length>0&&moved.text!==startBefore&&
                  moved.trustedDown>0&&moved.trustedMove>0&&moved.hit==='start'&&moved.before!==moved.after;
                startAttempts.push(slovo+':TARGET='+moved.targetStart+'>'+moved.targetMid+'>'+moved.targetEnd+':'+startBefore.length+'>'+moved.text.length+
                  ',touch='+moved.trustedDown+'/'+moved.trustedMove+',hit='+moved.hit+
                  ',coords='+[moved.first?.x,moved.first?.y].join('/')+'>'+[moved.last?.x,moved.last?.y].join('/')+
                  ',everChanged='+moved.duringChanged+',engine='+moved.engineStart+'/'+
                    moved.engineMove+'/'+moved.engineLast+
                  ',hitY='+moved.handleY+',p='+moved.pointsFirst+'>'+moved.pointsLast+
                  ',model='+moved.before+'>'+moved.after+
                  ',path='+moved.traceStart+'>'+moved.traceMiddle+'>'+
                    moved.traceEnd+'>'+moved.traceFinish+
                    ',engineSteps='+moved.engineTrace.join(';')+
                    ',capture='+moved.captureTrace.join(';')+
                    ',bubble='+moved.bubbleTrace.join(';'));
                if(changed){startChanged=true;break;}
              }catch(error){startAttempts.push(slovo+':'+String(error?.message||error).slice(0,130));}
            }
            assert(startChanged,'own_START_handle_did_not_change_selection: '+startAttempts.join(' | '));
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
            detail:String(error?.message||error).slice(0,650)+' · poznámka Testy byla ponechána pro diagnostiku.'});
          // 691M: Zachovat NATIVE_FAIL. Další OWN gesta bez výchozího
          // stavu jsou BLOCKED, nikoli PASS; ale Uložit a nezávislé živé
          // regrese už tím nesmějí být zbytečně zablokovány.
          if(i>=4&&i<=6){i=7;continue;}
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
