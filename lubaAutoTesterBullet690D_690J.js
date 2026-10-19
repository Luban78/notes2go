/* LubaNote AutoTester 690J based on 690D – genuine shipped Core V2 Tab/Shift+Tab + history.
 * Opaque-origin isolated iframe. Synthetic DOM keyboard events, NOT real native IME,
 * touch, dragging or production notes. Fail-closed on absent/test-failing Core V2.
 */
(() => {
  'use strict';
  const IDS=['core-list-indent','core-list-level-history'];
  const LABELS={
    'core-list-indent':'Core V2 – zanoření a vynoření celé větve (Tab)',
    'core-list-level-history':'Core V2 – Undo/Redo hierarchie a export'
  };
  let busy=false;
  const blocked=(why)=>IDS.map(id=>({id,name:LABELS[id],kind:'REAL_SHIPPED_CORE_V2_SANDBOX_KEYBOARD',status:'CORE_BLOCKED',ms:0,detail:String(why||'unavailable').slice(0,180)}));
  function runner(token,visual,repeats){
    'use strict';
    const send=(type,data)=>parent.postMessage({scope:'LN_690D_CORE_BULLET',token,type,data},'*');
    const ids=['core-list-indent','core-list-level-history'];
    const names=['Core V2 – zanoření a vynoření celé větve (Tab)','Core V2 – Undo/Redo hierarchie a export'];
    const table=ids.map((id,i)=>({id,name:names[i],ok:0,fail:0,blocked:0,ms:0,reason:''}));
    const check=(condition,reason)=>{if(!condition)throw Error(reason);};
    const text=b=>(b.obsah||[]).map(x=>String(x.text||'')).join('');
    const record=(index,status,reason,ms,repeat)=>{
      const item=table[index];item.ms+=Math.round(ms||0);
      if(status==='PASS')item.ok++;
      else if(status==='FAIL'){item.fail++;if(!item.reason)item.reason=`průchod ${repeat}: ${reason}`;}
      else {item.blocked++;if(!item.reason)item.reason=`průchod ${repeat}: ${reason}`;}
    };
    const pattern=(core,levels,idsOriginal)=>{
      const current=core.ziskejModel().bloky;
      check(current.length===4,'wrong_block_count_'+current.length);
      check(current.every((b,i)=>b.id===idsOriginal[i]),'subtree_id_or_order_changed');
      check(current.every((b,i)=>b.typ==='bullet'&&Number(b.uroven)===levels[i]),'wrong_levels_'+current.map(b=>b.uroven).join(','));
      check(current.map(text).join('|')==='Alpha|Bravo|Charlie|Delta','text_modified');
      const ed=core.ziskejEditorElement();
      check(ed.children.length===4,'dom_count_changed');
      for(let i=0;i<4;i++){
        check(ed.children[i].dataset.lnV2Blok===idsOriginal[i],'dom_id_'+i);
        check(ed.children[i].dataset.lnV2BulletUroven===String(levels[i]),'dom_level_'+i);
      }
    };
    const select=(core,id)=>{
      const ed=core.ziskejEditorElement();
      const row=Array.from(ed.children).find(el=>el.dataset.lnV2Blok===id);
      const span=row?.querySelector('.ln-v2-cast');
      const node=span?.firstChild;
      check(node?.nodeType===3,'bravo_text_node_missing');
      const range=document.createRange();range.setStart(node,Math.min(2,node.textContent.length));range.collapse(true);
      const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
      const actual=core.zachytAktualniVyber();
      check(actual?.sbaleny===true,'model_selection_not_collapsed');
    };
    const key=(core,key,shift)=>{
      const ed=core.ziskejEditorElement();
      const event=new KeyboardEvent('keydown',{key,shiftKey:!!shift,bubbles:true,cancelable:true});
      ed.dispatchEvent(event);
      check(event.defaultPrevented,'core_did_not_process_tab');
    };
    (async()=>{
      const core=window.LubaNoteEditorV2;
      if(!core?.importujHtml||!core?.otevriVHostu||!core?.ziskejModel||!core?.undo||!core?.redo){send('blocked','production_core_v2_missing_api');return;}
      const host=document.getElementById('ln-690d-host');
      if(!host){send('blocked','sandbox_host_missing');return;}
      for(let repeat=1;repeat<=repeats;repeat++){
        let opened=false, first=false;
        try{
          const t=performance.now();
          const importResult=core.importujHtml('<ul><li>Alpha</li><li>Bravo<ul><li>Charlie</li></ul></li><li>Delta</li></ul>');
          check(importResult?.ok===true,'cannot_import_fixture');
          check(core.otevriVHostu(host,importResult.model)===true,'cannot_open_fixture');
          opened=true;
          const idsOriginal=core.ziskejModel().bloky.map(b=>b.id);
          pattern(core,[0,0,1,0],idsOriginal);
          send('progress',`Zanoření ${repeat}/${repeats} · Tab`);
          select(core,idsOriginal[1]);key(core,'Tab',false);
          if(visual)await new Promise(r=>setTimeout(r,Math.round(700*visual)));
          pattern(core,[0,1,2,0],idsOriginal);
          send('progress',`Vynoření ${repeat}/${repeats} · Shift+Tab`);
          select(core,idsOriginal[1]);key(core,'Tab',true);
          pattern(core,[0,0,1,0],idsOriginal);
          if(visual)await new Promise(r=>setTimeout(r,Math.round(650*visual)));
          record(0,'PASS','',performance.now()-t,repeat);
          first=true;
          send('progress',`Undo/Redo ${repeat}/${repeats}`);
          const h=performance.now();
          check(core.undo()===true,'undo_failed');
          pattern(core,[0,1,2,0],idsOriginal);
          if(visual)await new Promise(r=>setTimeout(r,Math.round(350*visual)));
          check(core.redo()===true,'redo_failed');
          pattern(core,[0,0,1,0],idsOriginal);
          if(visual)await new Promise(r=>setTimeout(r,Math.round(350*visual)));
          const html=core.exportujHtml();
          check(typeof html==='string'&&html.includes('Bravo'),'export_missing');
          const roundtrip=core.importujHtml(html);
          check(roundtrip?.ok===true,'roundtrip_import_failed');
          check(roundtrip.model.bloky.length===4,'roundtrip_lost_blocks');
          check(roundtrip.model.bloky.every((b,i)=>Number(b.uroven)===[0,0,1,0][i]),'roundtrip_wrong_levels');
          check(roundtrip.model.bloky.map(text).join('|')==='Alpha|Bravo|Charlie|Delta','roundtrip_text_modified');
          record(1,'PASS','',performance.now()-h,repeat);
        }catch(e){
          if(!first){record(0,'FAIL',String(e?.message||'unknown').slice(0,105),0,repeat);record(1,'BLOCKED','previous_indent_failed',0,repeat);}
          else record(1,'FAIL',String(e?.message||'unknown').slice(0,105),0,repeat);
        }finally{
          if(opened)try{core.zavriVHostu();}catch(_e){}
        }
        send('progress',`Zanoření/Undo ${repeat}/${repeats}`);
      }
      send('done',table.map(it=>({id:it.id,name:it.name,kind:'REAL_SHIPPED_CORE_V2_SANDBOX_KEYBOARD',status:it.fail?'CORE_FAIL':it.blocked?'CORE_BLOCKED':it.ok===repeats?'CORE_PASS':'CORE_BLOCKED',ms:it.ms,detail:`${it.ok}/${repeats} PASS, ${it.fail} FAIL, ${it.blocked} BLOKOVÁNO. ${it.reason||'Reálný Core V2 + syntetický Tab/Shift+Tab, ne nativní Android gesta.'}`})));
    })().catch(e=>send('blocked','runner_fatal_'+String(e?.message||'error').slice(0,105)));
  }
  async function runRepeated(shouldContinue=()=>true,onProgress=()=>{},repeats=1){
    repeats=(Number.isInteger(Number(repeats))&&Number(repeats)>=1&&Number(repeats)<=50)?Number(repeats):1;
    if(busy)return blocked('another_levels_run_active');
    busy=true;
    const token='ln690d-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,12);
    let frame=null,timeout=null,interval=null,finished=false;
    return new Promise(resolve=>{
      const cleanup=rows=>{
        if(finished)return;finished=true;
        if(timeout)clearTimeout(timeout);
        if(interval)clearInterval(interval);
        window.removeEventListener('message',receive);
        try{frame?.remove();}catch(_e){}
        busy=false;resolve(rows);
      };
      const receive=e=>{
        if(!frame||e.source!==frame.contentWindow||e.data?.scope!=='LN_690D_CORE_BULLET'||e.data.token!==token)return;
        if(!shouldContinue()){cleanup(blocked('interrupted'));return;}
        if(e.data.type==='progress')onProgress(String(e.data.data||'').slice(0,80));
        else if(e.data.type==='blocked')cleanup(blocked('Core V2: '+e.data.data));
        else if(e.data.type==='done'){
          const rows=e.data.data;
          const valid=Array.isArray(rows)&&rows.length===2&&new Set(rows.map(x=>x.id)).size===2&&
             rows.every(x=>IDS.includes(x?.id)&&['CORE_PASS','CORE_FAIL','CORE_BLOCKED'].includes(x?.status)&&typeof x.detail==='string');
          cleanup(valid?rows.map(x=>({...x,name:LABELS[x.id],detail:x.detail.slice(0,220)})):blocked('invalid_result_rows'));
        }
      };
      window.addEventListener('message',receive);
      timeout=setTimeout(()=>cleanup(blocked('levels_sandbox_timeout')),Math.round(70000*Math.max(1,repeats/10)*Math.max(1,Number(window.LubaNoteAutoTesterVisual690F?.getSpeedFactor?.()||1))));
      interval=setInterval(()=>{if(!shouldContinue())cleanup(blocked('interrupted'));},250);
      try{
        const origin=location.origin;
        if(!/^https?:\/\/|^capacitor:\/\//.test(origin))throw Error('unsupported_app_origin');
        const url=new URL('editorCoreV2.js?v=690D-core-keyboard',location.href);
        if(url.origin!==origin)throw Error('cross_origin_core');
        const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
        const policy=`default-src 'none'; script-src 'nonce-${token}'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; font-src 'none'; frame-src 'none'; form-action 'none'`;
        frame=document.createElement('iframe');
        frame.sandbox='allow-scripts'; // Keep opaque origin. No allow-same-origin.
        frame.setAttribute('aria-hidden','true');frame.tabIndex=-1;
        frame.style.cssText='position:fixed;left:-10000px;top:0;width:420px;height:640px;opacity:0;pointer-events:none;border:0';
        frame.srcdoc=`<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${esc(policy)}"><style>.ln-v2-editor{height:180px;overflow-y:auto;display:block}.ln-v2-odstavec{min-height:24px;display:block}[hidden]{display:none!important}</style>${Boolean(window.LubaNoteAutoTesterVisual690F?.isSlow?.())?`<style>html,body{background:#fff;color:#192f23;font:20px/1.45 system-ui}body{margin:10px}.ln-v2-editor{font-size:20px!important}.ln-v2-odstavec.ln-v2-bullet{position:relative;border-bottom:1px solid #ecf0ed;box-sizing:border-box;padding-left:22px}.ln-v2-odstavec.ln-v2-bullet::before{content:"•";position:absolute;left:4px;color:#178050;font-weight:800}[data-ln-v2-bullet-uroven="1"]{margin-left:18px}[data-ln-v2-bullet-uroven="2"]{margin-left:36px}[data-v2-list-marker]{border:1px solid #448d61;background:#d9f4e4;border-radius:5px;font-size:18px;min-width:24px;min-height:22px}[data-v2-list-toggle]{border:1px solid #3c8c66;background:#e3f8e9;border-radius:6px;font-weight:700;color:#135b39;font-size:17px}</style>`:''}<script nonce="${esc(token)}" src="${esc(url.href)}"><\/script></head><body><div id="ln-690d-host"></div><script nonce="${esc(token)}">(${runner.toString()})(${JSON.stringify(token)},${Number(window.LubaNoteAutoTesterVisual690F?.getSpeedFactor?.()||0)},${repeats});<\/script></body></html>`;
        if(!window.LubaNoteAutoTesterVisual690F?.attachFrame?.(frame)) document.body.appendChild(frame);
        onProgress('Spouštím skutečný Core V2 · hierarchie Tab/Shift+Tab…');
      }catch(e){cleanup(blocked(e?.message||'failed_to_create_sandbox'));}
    });
  }
  window.LubaNoteAutoTesterBullet690D=Object.freeze({runRepeated,supportsRepeatCount:true});
})();
