/* 691CV – short-word native doubletap setup; 691CU – viewport-safe handle setup; 691CT – handle readiness diagnostic and retry; 691CS – explicit, foreground-only Android MotionEvent selection-edge performance.
 * Own LOCAL Testy note only; never touches arbitrary user notes. No synthetic DOM events.
 */
(()=>{'use strict';
  let busy=false;
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const check=(ok,why)=>{if(!ok)throw Error(why);};
  const get=id=>window.loadTask?.().find(n=>n?.id===id);
  const owned=id=>{const n=get(id);return n&&n.storageScope==='local'&&n.isSecret!==true&&
    n.tags?.includes('Testy')&&String(n.title||'').startsWith('[AutoTester 690T]')?n:null;};
  const row=(status,detail,ms)=>({id:'perf-live-handle-691CS',name:'Výkon – živé červené úchyty / edge scroll',kind:'NATIVE_LIVE_PERF',status,detail,ms});
  const scrollNode=editor=>{
    for(let e=editor;e&&e!==document.body;e=e.parentElement){
      const cs=getComputedStyle(e);
      if(e.scrollHeight>e.clientHeight+90&&/(auto|scroll)/.test(cs.overflowY))return e;
    }
    return null;
  };
  const closeOwnedEditorIfOpen=async(id)=>{
    const modal=document.getElementById('taskModal');
    if(modal?.hidden!==false||modal?.dataset?.taskId!==id)return;
    if(window.LubaNoteEditorV2Bridge?.jeAktivni?.()===true&&
      window.LubaNoteEditorV2Bridge?.dokoncModelPredExterniAkci?.()!==true)return;
    const close=window.zpracujZavreniEditoru;
    if(typeof close==='function'){
      close();
      for(let i=0;i<12;i++){
        await wait(80);
        if(document.getElementById('taskModal')?.hidden!==false)return;
      }
    }
  };
  async function run(id,alive=()=>true,progress=()=>{},minimize=()=>{},restore=()=>{}){
    if(busy)return row('NATIVE_BLOCKED','already_running',0);
    busy=true;const began=performance.now();let observer=null,raf=0,collect=false;
    try{
      check(window.LubaNoteAdminTools?.isAllowed?.()===true,'admin_required');
      check(alive()&&owned(id),'owned_LOCAL_Testy_note_missing');
      check(document.getElementById('taskModal')?.hidden!==false,'close_other_editor_first');
      const plugin=window.Capacitor?.Plugins?.LubaNoteNativeTester;
      check(window.Capacitor?.getPlatform?.()==='android'&&typeof plugin?.gestureOwnedEditor==='function','native_android_plugin_unavailable');
      const n=owned(id);const marker='Zapis_z_viditelneho_editoru_690T';
      const paragraph='Výkon výběru červenou kapkou – opakovaný dlouhý odstavec pro test automatického posouvání. ';
      const rich='<p>'+marker+' první testovací řádek pro nativní výběr.</p>'+Array.from({length:240},(_,i)=>'<p>'+String(i+1).padStart(3,'0')+' '+paragraph.repeat(2)+'</p>').join('');
      // Preserve the note's test ownership and existing identifying text; mutate only its own UUID.
      const revised={...n,note:marker+'\n'+Array.from({length:240},(_,i)=>`${i+1} ${paragraph.repeat(2)}`).join('\n'),richContent:rich,updatedAt:new Date().toISOString()};
      const safeSave=window.LubaNoteSync?.provedLokalniZmenuASynchronizuj;
      check(typeof safeSave==='function'&&typeof window.saveAllTasks==='function','safe_local_storage_missing');
      await safeSave(()=>window.saveAllTasks(window.loadTask().map(x=>x.id===id?revised:x)),revised);
      await window.LubaNoteRegularNotesStore?.cekejNaUlozeni?.();
      check(owned(id)?.richContent===rich,'test_note_not_saved');
      check(alive(),'cancelled_before_open');
      minimize();progress('691CS · otevírám skutečný dlouhý editor');
      await window.openTaskEditorById(id);await wait(600);
      const modal=document.getElementById('taskModal');
      const editor=window.LubaNoteEditorV2?.ziskejEditorElement?.();
      check(modal?.dataset?.taskId===id&&!modal.hidden&&editor?.isConnected&&modal.contains(editor),'real_editor_not_visible');
      check(window.LubaNoteEditorV2Bridge?.jeAktivni?.()===true,'production_editor_not_active');
      const scroll=scrollNode(editor);check(scroll&&scroll.scrollHeight-scroll.clientHeight>500,'real_editor_scroll_range_missing');
      const text=Array.from(editor.querySelectorAll('*')).find(e=>e.textContent?.includes(marker)&&e.children.length===0);
      text?.scrollIntoView({block:'center',behavior:'instant'});await wait(160);
      const results=[];
      for(let k=0;k<5;k++){
        check(alive(),'cancelled');progress(`691CS · živé tažení červené kapky ${k+1}/5`);
        scroll.scrollTop=0;await wait(180);
        // 691CV: a native doubletap on the long test marker selected a long
        // identifier whose endpoints can lie outside the editor viewport.
        // Use a REAL doubletap on a short ordinary word chosen by the native
        // plugin near the middle of the live editor. Never fabricate a Range,
        // unhide a handle, or scroll while a selection is active.
        const visibleHandle=side=>Array.from(document.querySelectorAll(
          '.ln-v2-selection-handle-custom[data-ln-v2-selection-handle="'+side+'"]'
        )).find(el=>{
          const r=el.getBoundingClientRect(),cs=getComputedStyle(el);
          return !el.hidden&&r.width>0&&r.height>0&&cs.display!=='none'&&
            cs.visibility!=='hidden'&&Number(cs.opacity)>0;
        });
        const handlesReady=()=>editor.classList.contains('ln-v2-selection-custom-active')&&
          Boolean(visibleHandle('start')&&visibleHandle('end'));
        const describeNewHandles=()=>Array.from(document.querySelectorAll('.ln-v2-selection-handle-custom')).map(el=>{
          const r=el.getBoundingClientRect(),cs=getComputedStyle(el);
          return `${el.getAttribute('data-ln-v2-selection-handle')||'?'}:hidden=${el.hidden?1:0},rect=${Math.round(r.width)}x${Math.round(r.height)},top=${Math.round(r.top)},display=${cs.display}`;
        }).join('|')||'none';
        let handle=null,setup=null;
        for(const top of [0,140]){
          scroll.scrollTop=top;
          await wait(220);
          setup=await plugin.gestureOwnedEditor({id,target:'perf-word-center',type:'doubletap'});
          check(setup?.delivery==='WEBVIEW_DISPATCH_TOUCH_EVENT','native_doubletap_ack_missing');
          for(let retry=0;retry<10;retry++){
            await wait(120);
            if(handlesReady()){handle=visibleHandle('end');break;}
          }
          if(handle)break;
        }
        check(editor.classList.contains('ln-v2-selection-custom-active'),'own_selection_not_activated');
        check(handle,'short_word_handles_not_ready; top='+Math.round(scroll.scrollTop)+'; '+describeNewHandles().slice(0,155));
        const before=window.LubaNoteEditorV2?.zachytAktualniVyber?.();
        const beforeText=String(window.getSelection?.()?.toString?.()||'');
        const initialScroll=scroll.scrollTop;
        const gaps=[],longTasks=[],stallAt=[];let last=0,first=0;
        if(window.PerformanceObserver?.supportedEntryTypes?.includes('longtask')){
          observer=new PerformanceObserver(list=>{if(collect)for(const e of list.getEntries())longTasks.push(e.duration);});
          observer.observe({entryTypes:['longtask']});
        }
        collect=true;
        const frame=t=>{if(!collect)return;if(!first)first=t;if(last){
          const dt=t-last;gaps.push(dt);
          /* Jen casove znaceni – zadne logovani/DOM prace behem tahu. */
          if(dt>=70)stallAt.push(Math.round(t-first));
        }last=t;raf=requestAnimationFrame(frame);};
        raf=requestAnimationFrame(frame);
        let ack;
        try{ack=await plugin.gestureOwnedEditor({id,target:'selection-end',type:'swipe-edge-691CS'});}
        finally{collect=false;cancelAnimationFrame(raf);observer?.disconnect();observer=null;}
        check(ack?.delivery==='WEBVIEW_DISPATCH_TOUCH_EVENT','native_long_drag_ack_missing');
        await wait(100);
        const afterText=String(window.getSelection?.()?.toString?.()||'');
        const after=window.LubaNoteEditorV2?.zachytAktualniVyber?.();
        const deltaScroll=Math.round(scroll.scrollTop-initialScroll);
        check(afterText!==beforeText||JSON.stringify(after)!==JSON.stringify(before),'selection_did_not_change');
        check(deltaScroll>30,'edge_autoscroll_not_observed_'+deltaScroll);
        check(gaps.length>25,'raf_samples_insufficient');
        gaps.sort((a,b)=>a-b);longTasks.sort((a,b)=>a-b);
        const p95=gaps[Math.min(gaps.length-1,Math.ceil(gaps.length*.95)-1)];
        results.push({p95:Math.round(p95*10)/10,max:Math.round(gaps.at(-1)*10)/10,
          long:longTasks.filter(x=>x>50).length,largest:Math.round((longTasks.at(-1)||0)*10)/10,
          scroll:deltaScroll,frames:gaps.length,stalls70:stallAt.length,stallAt:stallAt.slice(0,12)});
      }
      const avg=key=>Math.round(results.reduce((a,x)=>a+x[key],0)/results.length*10)/10;
      const detail=`691CY LIVE_NATIVE_EDGE PASS 5/5; frameP95avg=${avg('p95')}ms; worstFrame=${Math.max(...results.map(x=>x.max))}ms; longTasksTotal=${results.reduce((a,x)=>a+x.long,0)}; worstLongTask=${Math.max(...results.map(x=>x.largest))}ms; scrollPx=[${results.map(x=>x.scroll)}]; frames=[${results.map(x=>x.frames)}]; stalls70ms=[${results.map(x=>x.stalls70)}]; stallAtMs=[${results.map(x=>'('+x.stallAt.join(',')+')')}]; own LOCAL Testy; Java MotionEvent, not finger`;
      await closeOwnedEditorIfOpen(id);
      return row('NATIVE_PASS',detail,Math.round(performance.now()-began));
    }catch(e){
      await closeOwnedEditorIfOpen(id);
      return row(String(e?.message||e).includes('unavailable')||String(e?.message||e).includes('missing')?'NATIVE_BLOCKED':'NATIVE_FAIL',String(e?.message||e).slice(0,220),Math.round(performance.now()-began));
    }
    finally{collect=false;cancelAnimationFrame(raf);observer?.disconnect();await closeOwnedEditorIfOpen(id);restore();busy=false;}
  }
  window.LubaNoteAutoTesterLivePerf691CS={run};
})();
