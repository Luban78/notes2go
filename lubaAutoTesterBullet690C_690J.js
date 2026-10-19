/* LubaNote AutoTester 690J based on 690C – REAL shipped Core V2, synthetic isolated DOM.
 * Opaque-origin sandboxed iframe; no parent DOM, session, storage, network API,
 * production notes or external account access. The only JS module loaded is
 * the unchanged shipped editorCoreV2.js. A browser click is NOT native touch.
 */
(() => {
  'use strict';
  const IDS = ['core-list-import','core-list-render','core-list-toggle','core-list-badge'];
  const LABELS = {
    'core-list-import':'Core V2 – import hierarchie bullet',
    'core-list-render':'Core V2 – skutečný model a DOM seznamu',
    'core-list-toggle':'Core V2 – sbalení šipkou bez výměny řádků',
    'core-list-badge':'Core V2 – rozbalení přes počet dětí + export'
  };
  let busy=false;
  function fallback(reason, kind='CORE_BLOCKED') {
    return IDS.map(id => ({id,name:LABELS[id],kind:'CORE_V2_SANDBOX',status:kind,ms:0,detail:String(reason||'no_result').slice(0,165)}));
  }
  // This function is serialized into a sandboxed, opaque-origin srcdoc iframe.
  function isolatedRunner(token, visual,repeats) {
    'use strict';
    const send = (type, data) => parent.postMessage({scope:'LN_690C_CORE_BULLET',token,type,data},'*');
    const ids = ['core-list-import','core-list-render','core-list-toggle','core-list-badge'];
    const names = [
      'Core V2 – import hierarchie bullet',
      'Core V2 – skutečný model a DOM seznamu',
      'Core V2 – sbalení šipkou bez výměny řádků',
      'Core V2 – rozbalení přes počet dětí + export'
    ];
    const totals = new Map(ids.map((id,i)=>[id,{id,name:names[i],ok:0,fail:0,blocked:0,ms:0,reason:''}]));
    const assert=(ok,why)=>{if(!ok)throw new Error(why);};
    const tick=()=>new Promise(r=>setTimeout(r,visual?Math.round(650*visual):30));
    const textBlock = b => (b.obsah||[]).map(s=>s.text||'').join('');
    const record=(id,status,reason='',ms=0,iter=0)=>{
      const q=totals.get(id); q.ms+=Math.round(ms);
      if(status==='ok')q.ok++;
      else if(status==='fail'){q.fail++;if(!q.reason)q.reason=`opakování ${iter}: ${reason}`;}
      else {q.blocked++;if(!q.reason)q.reason=`opakování ${iter}: ${reason}`;}
    };
    function sample() {
      const before=Array.from({length:10},(_,i)=>`<li>Pred-${i}</li>`).join('');
      const after=Array.from({length:17},(_,i)=>`<li>Za-${i}</li>`).join('');
      return `<ul>${before}<li>Rodic<ul><li>Dite A</li><li>Dite B<ul><li>Vnuk</li></ul></li></ul></li>${after}</ul>`;
    }
    (async () => {
      const core=window.LubaNoteEditorV2;
      if(!core || typeof core.importujHtml!=='function' || typeof core.otevriVHostu!=='function' || typeof core.ziskejModel!=='function'){
        send('blocked','real_editor_core_v2_unavailable');return;
      }
      const host=document.getElementById('ln-690c-host');
      if(!host){send('blocked','sandbox_host_missing');return;}
      for(let iteration=1;iteration<=repeats;iteration++){
        send('progress',`Bullet ${iteration}/${repeats} · import hierarchie`);
        let imported=null, ed=null, model0=null;
        const started=performance.now();
        try {
          imported=core.importujHtml(sample());
          assert(imported?.ok===true && Array.isArray(imported.model?.bloky),'real_import_failed');
          model0=imported.model.bloky;
          assert(model0.length===31,'import_block_count_'+model0.length);
          const texts=model0.map(textBlock);
          assert(texts[10]==='Rodic' && texts[11]==='Dite A' && texts[12]==='Dite B' && texts[13]==='Vnuk' && texts[14]==='Za-0','import_order');
          assert([0,1,1,2,0].every((x,i)=>Number(model0[10+i].uroven)===x),'import_levels');
          assert(model0.every(b=>b.typ==='bullet'),'import_types');
          record(ids[0],'ok','',performance.now()-started,iteration);
        }catch(e){
          record(ids[0],'fail',e?.message||'import_error',performance.now()-started,iteration);
          for(const id of ids.slice(1))record(id,'blocked','import_precondition_failed',0,iteration);
          send('progress',`Bullet ${iteration}/${repeats}`);continue;
        }
        try {
          send('progress',`Bullet ${iteration}/${repeats} · vykresluji model`);
          const t=performance.now();
          assert(core.otevriVHostu(host,imported.model)===true,'core_open_failed');
          ed=core.ziskejEditorElement();
          assert(ed && host.contains(ed),'editor_is_not_in_test_host');
          assert(ed.children.length===31,'render_block_count');
          if(visual)await tick();
          const expected=core.ziskejModel().bloky;
          for(let i=0;i<expected.length;i++){
            const row=ed.children[i];
            assert(row.dataset.lnV2Blok===expected[i].id,'dom_id_mismatch_'+i);
            assert(row.dataset.lnV2BulletUroven===String(expected[i].uroven),'dom_level_mismatch_'+i);
            assert(row.classList.contains('ln-v2-bullet'),'dom_not_bullet_'+i);
          }
          record(ids[1],'ok','',performance.now()-t,iteration);
        }catch(e){
          record(ids[1],'fail',e?.message||'render_error',performance.now()-started,iteration);
          for(const id of ids.slice(2))record(id,'blocked','render_precondition_failed',0,iteration);
          try {core.zavriVHostu?.();}catch(_e){}
          send('progress',`Bullet ${iteration}/${repeats}`);continue;
        }
        let markerOk=false;
        try {
          send('progress',`Bullet ${iteration}/${repeats} · sbaluji větev`);
          const t=performance.now();
          const parentRow=ed.children[10], childA=ed.children[11], childB=ed.children[12], grandChild=ed.children[13];
          const marker=parentRow.querySelector('button[data-v2-list-marker]');
          assert(marker && marker.dataset.v2ListMarker===parentRow.dataset.lnV2Blok,'marker_missing');
          ed.scrollTop=178;
          await tick();
          const scrollBefore=ed.scrollTop, yBefore=parentRow.getBoundingClientRect().top;
          const beforeIds=core.ziskejModel().bloky.map(b=>b.id).join(',');
          marker.click();
          await tick();
          assert(core.ziskejModel().bloky[10].sbaleno===true,'model_not_collapsed');
          assert(childA.hidden && childB.hidden && grandChild.hidden,'descendants_not_hidden');
          assert(getComputedStyle(childA).display==='none','descendants_still_rendered');
          assert(ed.children[10]===parentRow && ed.children[11]===childA,'rows_were_replaced');
          assert(marker.getAttribute('aria-expanded')==='false','marker_aria_wrong');
          assert(core.ziskejModel().bloky.map(b=>b.id).join(',')===beforeIds,'model_ids_changed');
          assert(Math.abs(ed.scrollTop-scrollBefore)<=2,'scroll_top_jumped');
          assert(Math.abs(parentRow.getBoundingClientRect().top-yBefore)<=3,'parent_y_jumped');
          markerOk=true;
          record(ids[2],'ok','',performance.now()-t,iteration);
        }catch(e){record(ids[2],'fail',e?.message||'collapse_error',performance.now()-started,iteration);}
        try {
          send('progress',`Bullet ${iteration}/${repeats} · rozbaluji větev`);
          const t=performance.now();
          if(visual)await tick();
          if(!markerOk){record(ids[3],'blocked','collapse_precondition_failed',0,iteration);}
          else {
            const parentRow=ed.children[10], childA=ed.children[11], grand=ed.children[13];
            const badge=parentRow.querySelector('button[data-v2-list-toggle]');
            assert(badge && badge.textContent.trim()==='2','badge_missing_or_count_wrong');
            const beforeIds=core.ziskejModel().bloky.map(b=>b.id).join(',');
            const scrollBefore=ed.scrollTop;
            badge.click();
            await tick();
            assert(core.ziskejModel().bloky[10].sbaleno===false,'badge_model_still_collapsed');
            assert(!childA.hidden && !grand.hidden,'badge_children_not_visible');
            assert(getComputedStyle(childA).display!=='none','badge_children_still_css_hidden');
            assert(ed.children[10]===parentRow && ed.children[11]===childA,'badge_replaced_rows');
            assert(parentRow.querySelector('button[data-v2-list-toggle]')===null,'badge_not_removed');
            assert(core.ziskejModel().bloky.map(b=>b.id).join(',')===beforeIds,'badge_changed_model_ids');
            assert(Math.abs(ed.scrollTop-scrollBefore)<=2,'badge_scroll_jumped');
            const exported=core.exportujHtml();
            assert(typeof exported==='string' && exported.length>50,'export_empty');
            const back=core.importujHtml(exported);
            assert(back?.ok===true && back.model?.bloky?.length===31,'roundtrip_lost_rows');
            assert([0,1,1,2,0].every((x,i)=>Number(back.model.bloky[10+i].uroven)===x),'roundtrip_levels');
            record(ids[3],'ok','',performance.now()-t,iteration);
          }
        }catch(e){record(ids[3],'fail',e?.message||'badge_error',performance.now()-started,iteration);}
        try{core.zavriVHostu?.();}catch(_e){}
        send('progress',`Bullet ${iteration}/${repeats}`);
      }
      const output=Array.from(totals.values()).map(x=>({
        id:x.id,name:x.name,kind:'REAL_SHIPPED_CORE_V2_SANDBOX_DOM',
        status:x.fail?'CORE_FAIL':x.blocked?'CORE_BLOCKED':x.ok===repeats?'CORE_PASS':'CORE_BLOCKED',
        ms:x.ms,detail:`${x.ok}/${repeats} PASS, ${x.fail} FAIL, ${x.blocked} BLOKOVÁNO. ${x.reason||'Reálný Core V2 + syntetický DOM/click. Native touch/MOVE netestováno.'}`
      }));
      send('done',output);
    })().catch(e=>send('blocked',String(e?.message||'sandbox_runtime_error').slice(0,140)));
  }
  async function runRepeated(shouldContinue=()=>true,onProgress=()=>{},repeats=1){
    repeats=(Number.isInteger(Number(repeats))&&Number(repeats)>=1&&Number(repeats)<=50)?Number(repeats):1;
    if(busy)return fallback('another_bullet_run_is_active');
    busy=true;
    const token='ln690c-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,12);
    const expected=new Set(IDS);
    let frame=null, timeout=null, abortInterval=null;
    return await new Promise(resolve=>{
      let finished=false;
      const cleanup=(results)=>{
        if(finished)return;
        finished=true;
        if(timeout)clearTimeout(timeout);
        if(abortInterval)clearInterval(abortInterval);
        window.removeEventListener('message',receive);
        try{frame?.remove();}catch(_e){}
        busy=false;
        resolve(results);
      };
      const receive=e=>{
        if(!frame || e.source!==frame.contentWindow || e.data?.scope!=='LN_690C_CORE_BULLET' || e.data.token!==token)return;
        if(!shouldContinue()){cleanup(fallback('test_interrupted'));return;}
        if(e.data.type==='progress'){
          onProgress(`Skutečný Core V2 · ${String(e.data.data||'').slice(0,65)}`);
          return;
        }
        if(e.data.type==='blocked'){
          cleanup(fallback('Core V2 sandbox: '+String(e.data.data||'unavailable').slice(0,130)));
          return;
        }
        if(e.data.type==='done'){
          const got=Array.isArray(e.data.data)?e.data.data:[];
          const valid=got.length===IDS.length && got.every(r=>r && expected.has(r.id) &&
            ['CORE_PASS','CORE_FAIL','CORE_BLOCKED'].includes(r.status)) &&
            new Set(got.map(r=>r.id)).size===IDS.length;
          cleanup(valid?got.map(r=>({id:r.id,name:LABELS[r.id],kind:'REAL_SHIPPED_CORE_V2_SANDBOX_DOM',status:r.status,ms:Number(r.ms)||0,detail:String(r.detail||'').slice(0,240)})):fallback('invalid_sandbox_test_results'));
        }
      };
      window.addEventListener('message',receive);
      timeout=setTimeout(()=>cleanup(fallback('Core V2 sandbox timed out with no completion')),Math.round(70000*Math.max(1,repeats/10)*Math.max(1,Number(window.LubaNoteAutoTesterVisual690F?.getSpeedFactor?.()||1))));
      abortInterval=setInterval(()=>{if(!shouldContinue())cleanup(fallback('bullet_test_interrupted'));},250);
      try {
        const origin=location.origin;
        if(!/^https?:\/\/|^capacitor:\/\//.test(origin))throw Error('unsupported_origin_for_isolated_core');
        const coreUrl=new URL('editorCoreV2.js?v=690C-real-core',location.href).href;
        const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
        frame=document.createElement('iframe');
        frame.sandbox='allow-scripts'; // DO NOT add allow-same-origin.
        frame.setAttribute('aria-hidden','true');
        frame.tabIndex=-1;
        frame.style.cssText='position:fixed;left:-10000px;top:0;width:420px;height:640px;opacity:0;pointer-events:none;border:0;';
        const policy=`default-src 'none'; script-src 'nonce-${token}'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; font-src 'none'; frame-src 'none'; form-action 'none'`;
        frame.srcdoc=`<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${esc(policy)}"><style>.ln-v2-editor{height:${Boolean(window.LubaNoteAutoTesterVisual690F?.isSlow?.())?530:170}px;max-height:530px;overflow-y:auto;display:block}.ln-v2-odstavec{min-height:24px;display:block}#ln-690c-host [hidden]{display:none!important}.ln-v2-list-marker-hit{width:25px;height:18px}</style>${Boolean(window.LubaNoteAutoTesterVisual690F?.isSlow?.())?`<style>html,body{background:#fff;color:#192f23;font:20px/1.45 system-ui}body{margin:10px}.ln-v2-editor{font-size:20px!important}.ln-v2-odstavec.ln-v2-bullet{position:relative;border-bottom:1px solid #ecf0ed;box-sizing:border-box;padding-left:22px}.ln-v2-odstavec.ln-v2-bullet::before{content:"•";position:absolute;left:4px;color:#178050;font-weight:800}[data-ln-v2-bullet-uroven="1"]{margin-left:18px}[data-ln-v2-bullet-uroven="2"]{margin-left:36px}[data-v2-list-marker]{border:1px solid #448d61;background:#d9f4e4;border-radius:5px;font-size:18px;min-width:24px;min-height:22px}[data-v2-list-toggle]{border:1px solid #3c8c66;background:#e3f8e9;border-radius:6px;font-weight:700;color:#135b39;font-size:17px}</style>`:''}<script nonce="${esc(token)}" src="${esc(coreUrl)}"><\/script></head><body><div id="ln-690c-host"></div><script nonce="${esc(token)}">(${isolatedRunner.toString()})(${JSON.stringify(token)},${Number(window.LubaNoteAutoTesterVisual690F?.getSpeedFactor?.()||0)},${repeats});<\/script></body></html>`;
        if(!window.LubaNoteAutoTesterVisual690F?.attachFrame?.(frame)) document.body.appendChild(frame);
        onProgress('Načítám skutečný Core V2 v izolovaném testovacím okně…');
      } catch(e){cleanup(fallback(String(e?.message||'sandbox_creation_failed').slice(0,145)));}
    });
  }
  window.LubaNoteAutoTesterBullet690C=Object.freeze({runRepeated,supportsRepeatCount:true});
})();
