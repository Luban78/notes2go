/* LubaNote AutoTester 690E – actual shipped Core V2 MOVE and selection.
 * Opaque-origin iframe, synthetic pointer/click/Range; NOT native Android touch.
 * All data are synthetic. No production notes, storage, auth or network API.
 */
(() => {
  'use strict';
  const IDS=['core-list-move-pointer','core-list-selection-collapse'];
  const LABELS={
    'core-list-move-pointer':'Core V2 – 10× dlouhý stisk a MOVE podstromu (pointer)',
    'core-list-selection-collapse':'Core V2 – 10× výběr textu nad sbaleným rodičem'
  };
  let busy=false;
  const blocked=why=>IDS.map(id=>({id,name:LABELS[id],kind:'REAL_SHIPPED_CORE_V2_SANDBOX_POINTER',status:'CORE_BLOCKED',ms:0,detail:String(why||'unavailable').slice(0,200)}));
  function runner(token){
    'use strict';
    const send=(type,data)=>parent.postMessage({scope:'LN_690E_CORE_BULLET',token,type,data},'*');
    const ids=['core-list-move-pointer','core-list-selection-collapse'];
    const names=['Core V2 – 10× dlouhý stisk a MOVE podstromu (pointer)','Core V2 – 10× výběr textu nad sbaleným rodičem'];
    const table=ids.map((id,i)=>({id,name:names[i],ok:0,fail:0,blocked:0,ms:0,reason:''}));
    const check=(ok,reason)=>{if(!ok)throw Error(reason);};
    const wait=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
    const text=b=>(b.obsah||[]).map(s=>String(s.text||'')).join('');
    const record=(i,status,why,ms,iteration)=>{
      const q=table[i];q.ms+=Math.round(ms||0);
      if(status==='PASS')q.ok++;
      else if(status==='FAIL'){q.fail++;if(!q.reason)q.reason=`opakování ${iteration}: ${String(why).slice(0,105)}`;}
      else {q.blocked++;if(!q.reason)q.reason=`opakování ${iteration}: ${String(why).slice(0,105)}`;}
    };
    const fixture=()=>'<ul><li>Alpha</li><li>Bravo<ul><li>Charlie</li></ul></li><li>Delta</li></ul>';
    const modelCheck=(core,texts,levels,idsOriginal)=>{
      const doc=core.ziskejModel()?.bloky||[];
      check(doc.length===texts.length,'model_count_'+doc.length);
      check(doc.map(text).join('|')===texts.join('|'),'model_order_'+doc.map(text).join('|'));
      check(doc.every((b,i)=>b.id===idsOriginal[texts[i]]),'id_or_subtree_changed');
      check(doc.every((b,i)=>Number(b.uroven)===levels[i]),'model_levels_'+doc.map(b=>b.uroven).join(','));
      const editor=core.ziskejEditorElement();
      check(editor?.children.length===doc.length,'dom_wrong_count');
      for(let i=0;i<doc.length;i++){
        check(editor.children[i].dataset.lnV2Blok===doc[i].id,'dom_id_'+i);
        check(editor.children[i].dataset.lnV2BulletUroven===String(doc[i].uroven),'dom_level_'+i);
      }
    };
    const pointer=(type,x,y,pointerId)=>new PointerEvent(type,{pointerId,pointerType:'mouse',isPrimary:true,button:0,buttons:type==='pointerup'?0:1,bubbles:true,cancelable:true,clientX:x,clientY:y});
    async function testMove(core,host,iteration){
      const imported=core.importujHtml(fixture());
      check(imported?.ok===true,'move_fixture_import');
      check(core.otevriVHostu(host,imported.model)===true,'move_open_failed');
      const original=core.ziskejModel().bloky;
      const idsOriginal=Object.fromEntries(original.map(b=>[text(b),b.id]));
      modelCheck(core,['Alpha','Bravo','Charlie','Delta'],[0,0,1,0],idsOriginal);
      const editor=core.ziskejEditorElement();
      const bravo=editor.children[1], target=editor.children[3];
      const span=bravo.querySelector('.ln-v2-cast');
      check(Boolean(span),'move_row_text_missing');
      const box=bravo.getBoundingClientRect();
      const last=target.getBoundingClientRect();
      check(box.height>10 && last.height>10 && last.top-box.top>70,'move_geometry_invalid');
      const x=box.left+Math.min(75,box.width/2), y=box.top+box.height/2;
      const id=300+iteration;
      span.dispatchEvent(pointer('pointerdown',x,y,id));
      await wait(485); // Real Core V2 long-press is 420 ms.
      check(editor.classList.contains('ln-v2-list-drag-mode'),'move_long_press_not_ready');
      const dropY=last.bottom-3;
      document.dispatchEvent(pointer('pointermove',x,dropY,id));
      await wait(25);
      check(editor.classList.contains('ln-v2-list-drag-mode'),'move_drag_not_started');
      document.dispatchEvent(pointer('pointerup',x,dropY,id));
      await wait(15);
      modelCheck(core,['Alpha','Delta','Bravo','Charlie'],[0,0,0,1],idsOriginal);
      check(core.undo()===true,'move_undo_failed');
      modelCheck(core,['Alpha','Bravo','Charlie','Delta'],[0,0,1,0],idsOriginal);
      check(core.redo()===true,'move_redo_failed');
      modelCheck(core,['Alpha','Delta','Bravo','Charlie'],[0,0,0,1],idsOriginal);
      const html=core.exportujHtml();
      const back=core.importujHtml(html);
      check(back?.ok===true && back.model.bloky.length===4,'move_roundtrip_missing');
      check(back.model.bloky.map(text).join('|')==='Alpha|Delta|Bravo|Charlie','move_roundtrip_order');
      check(back.model.bloky.map(b=>Number(b.uroven)).join(',')==='0,0,0,1','move_roundtrip_levels');
    }
    async function testSelection(core,host){
      const imp=core.importujHtml('<ul><li>Alpha</li><li>Rodic<ul><li>Dite A</li><li>Dite B</li></ul></li><li>Omega</li></ul>');
      check(imp?.ok===true,'selection_fixture_import');
      check(core.otevriVHostu(host,imp.model)===true,'selection_open_failed');
      const ed=core.ziskejEditorElement();
      check(ed.children.length===5,'selection_rows');
      const parentRow=ed.children[1];
      const marker=parentRow.querySelector('[data-v2-list-marker]');
      check(Boolean(marker),'selection_no_parent_marker');
      marker.click();
      await wait(50);
      check(core.ziskejModel().bloky[1].sbaleno===true,'selection_parent_not_collapsed');
      check(ed.children[2].hidden && ed.children[3].hidden,'selection_children_still_visible');
      const alpha=ed.children[0].querySelector('.ln-v2-cast')?.firstChild;
      const parent=parentRow.querySelector('.ln-v2-cast')?.firstChild;
      check(alpha?.nodeType===3&&parent?.nodeType===3,'selection_text_nodes_missing');
      const selection=window.getSelection();
      const range=document.createRange();
      range.setStart(alpha,1);range.setEnd(parent,3);
      selection.removeAllRanges();selection.addRange(range);
      const modelSelection=core.zachytAktualniVyber();
      check(modelSelection && modelSelection.sbaleny===false,'selection_range_not_captured');
      check(modelSelection.zacatek.blok===0&&modelSelection.konec.blok===1,'selection_wrong_model_range');
      check(selection.toString().includes('Rod'),'selection_missing_parent_text');
      check(ed.children[2].hidden&&ed.children[3].hidden,'selection_unhid_children');
      const previous=core.ziskejModel().bloky.map(b=>`${b.id}:${b.typ}:${b.uroven}:${text(b)}:${Boolean(b.sbaleno)}`).join('|');
      const exported=core.exportujHtml();
      check(typeof exported==='string'&&exported.includes('Rodic'),'selection_export_missing');
      check(core.ziskejModel().bloky.map(b=>`${b.id}:${b.typ}:${b.uroven}:${text(b)}:${Boolean(b.sbaleno)}`).join('|')===previous,'selection_changed_model');
      check(selection.rangeCount===1 && selection.anchorNode?.isConnected && selection.focusNode?.isConnected,'selection_lost_browser_range');
      // An actual badge click with a caret in the collapsed parent must not change text.
      const caret=document.createRange();caret.setStart(parent,2);caret.collapse(true);
      selection.removeAllRanges();selection.addRange(caret);
      const badge=parentRow.querySelector('[data-v2-list-toggle]');
      check(Boolean(badge),'selection_badge_missing');
      badge.click();
      await wait(50);
      check(core.ziskejModel().bloky[1].sbaleno===false,'selection_badge_failed');
      check(!ed.children[2].hidden && !ed.children[3].hidden,'selection_badge_children_hidden');
      check(selection.anchorNode?.isConnected,'selection_caret_detached');
      check(core.ziskejModel().bloky.map(text).join('|')==='Alpha|Rodic|Dite A|Dite B|Omega','selection_text_modified');
    }
    (async()=>{
      const core=window.LubaNoteEditorV2;
      if(!core?.importujHtml||!core?.otevriVHostu||!core?.ziskejModel||!core?.zachytAktualniVyber||!core?.undo||!core?.redo){send('blocked','core_v2_required_api_missing');return;}
      if(typeof PointerEvent!=='function'){send('blocked','pointer_event_unsupported');return;}
      const host=document.getElementById('ln-690e-host');
      if(!host){send('blocked','sandbox_host_missing');return;}
      for(let i=1;i<=10;i++){
        for(let kind=0;kind<2;kind++){
          send('progress',`Bullet ${i}/10 · ${kind===0?'MOVE dlouhý stisk/přesun':'výběr textu'} – start`);
          const before=performance.now();let opened=false;
          try{
            opened=true;
            if(kind===0)await testMove(core,host,i);
            else await testSelection(core,host);
            record(kind,'PASS','',performance.now()-before,i);
          }catch(e){record(kind,'FAIL',e?.message||'test_error',performance.now()-before,i);}
          finally{if(opened)try{core.zavriVHostu?.();}catch(_e){} try{window.getSelection()?.removeAllRanges();}catch(_e){}}
        }
        send('progress',`MOVE + selection ${i}/10`);
      }
      send('done',table.map(it=>({id:it.id,name:it.name,kind:'REAL_SHIPPED_CORE_V2_SANDBOX_POINTER',status:it.fail?'CORE_FAIL':it.blocked?'CORE_BLOCKED':it.ok===10?'CORE_PASS':'CORE_BLOCKED',ms:it.ms,detail:`${it.ok}/10 PASS, ${it.fail} FAIL, ${it.blocked} BLOKOVÁNO. ${it.reason||'Skutečný Core V2 + syntetický pointer/Range. Nativní Android touch/handles netestovány.'}`})));
    })().catch(e=>send('blocked','runner_fatal_'+String(e?.message||'error').slice(0,120)));
  }
  async function runRepeated(shouldContinue=()=>true,onProgress=()=>{}){
    if(busy)return blocked('another_690E_run_active');
    busy=true;
    const token='ln690e-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,12);
    let frame=null,timeout=null,interval=null,finished=false;
    return new Promise(resolve=>{
      const cleanup=rows=>{
        if(finished)return;finished=true;
        clearTimeout(timeout);clearInterval(interval);
        window.removeEventListener('message',receive);
        try{frame?.remove();}catch(_e){}
        busy=false;resolve(rows);
      };
      const receive=e=>{
        if(!frame||e.source!==frame.contentWindow||e.data?.scope!=='LN_690E_CORE_BULLET'||e.data.token!==token)return;
        if(!shouldContinue()){cleanup(blocked('interrupted'));return;}
        if(e.data.type==='progress'){lastStep=String(e.data.data||'').slice(0,100);onProgress(lastStep);}
        else if(e.data.type==='blocked')cleanup(blocked('sandbox_blocked_'+String(e.data.data||'error').slice(0,130)));
        else if(e.data.type==='done'){
          const rows=e.data.data;
          const valid=Array.isArray(rows)&&rows.length===2&&new Set(rows.map(x=>x.id)).size===2&&
            rows.every(x=>IDS.includes(x?.id)&&['CORE_PASS','CORE_FAIL','CORE_BLOCKED'].includes(x?.status)&&typeof x.detail==='string');
          cleanup(valid?rows.map(x=>({...x,name:LABELS[x.id],detail:x.detail.slice(0,240)})):blocked('invalid_core_result_rows'));
        }
      };
      window.addEventListener('message',receive);
      timeout=setTimeout(()=>cleanup(blocked('sandbox_timeout_45s_last='+lastStep)),45000);
      interval=setInterval(()=>{if(!shouldContinue())cleanup(blocked('interrupted'));},250);
      try{
        const origin=location.origin;
        if(!/^https?:\/\/|^capacitor:\/\//.test(origin))throw Error('unsupported_app_origin');
        const url=new URL('editorCoreV2.js?v=690E-pointer-selection',location.href);
        if(url.origin!==origin)throw Error('cross_origin_core');
        const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
        const policy=`default-src 'none'; script-src 'nonce-${token}'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; font-src 'none'; frame-src 'none'; form-action 'none'`;
        frame=document.createElement('iframe');
        frame.sandbox='allow-scripts'; // IMPORTANT: never allow-same-origin.
        frame.setAttribute('aria-hidden','true');frame.tabIndex=-1;
        frame.style.cssText='position:fixed;left:-10000px;top:0;width:420px;height:640px;opacity:0;pointer-events:none;border:0';
        frame.srcdoc=`<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${esc(policy)}"><style>.ln-v2-editor{height:440px;max-height:440px;overflow-y:auto;display:block}.ln-v2-odstavec{height:72px;min-height:72px;line-height:25px;display:block}[hidden]{display:none!important}.ln-v2-list-marker-hit{width:25px;height:20px}</style><script nonce="${esc(token)}" src="${esc(url.href)}"><\/script></head><body><div id="ln-690e-host"></div><script nonce="${esc(token)}">(${runner.toString()})(${JSON.stringify(token)});<\/script></body></html>`;
        if(!window.LubaNoteAutoTesterVisual690F?.attachFrame?.(frame)) document.body.appendChild(frame);
        onProgress('Core V2 · připravuji syntetický MOVE a výběr textu…');
      }catch(e){cleanup(blocked('sandbox_creation_'+String(e?.message||'error').slice(0,130)));}
    });
  }
  window.LubaNoteAutoTesterBullet690E=Object.freeze({runRepeated});
})();
