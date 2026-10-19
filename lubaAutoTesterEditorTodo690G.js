/* LubaNote AutoTester 690G – shipped Core V2 editor and TODO behavioral tests.
 * Sandbox uses opaque-origin iframe. No user data, storage, auth, network or native Android touches.
 */
(() => {
  'use strict';
  const ALL=[
    {id:'core-editor-keyboard',name:'Editor Core V2 – zápis textu a Backspace 10×'},
    {id:'core-editor-history',name:'Editor Core V2 – Undo / Redo a export 10×'},
    {id:'core-todo-state',name:'ToDo Core V2 – hotovo / vrátit 10×'},
    {id:'core-todo-history',name:'ToDo Core V2 – Undo / Redo 10×'},
    {id:'core-todo-export',name:'ToDo Core V2 – export / znovunačtení 10×'}
  ];
  let busy=false;
  const blocked=(scope,why)=>ALL.filter(x=>scope==='all'||(scope==='editor'?x.id.startsWith('core-editor-'):x.id.startsWith('core-todo-')))
    .map(x=>({...x,kind:'CORE_V2_SANDBOX_690G',status:'CORE_BLOCKED',ms:0,detail:String(why||'unavailable').slice(0,180)}));
  function inner(token,scope,visual){
    'use strict';
    const source=[
      ['core-editor-keyboard','Editor Core V2 – zápis textu a Backspace 10×'],
      ['core-editor-history','Editor Core V2 – Undo / Redo a export 10×'],
      ['core-todo-state','ToDo Core V2 – hotovo / vrátit 10×'],
      ['core-todo-history','ToDo Core V2 – Undo / Redo 10×'],
      ['core-todo-export','ToDo Core V2 – export / znovunačtení 10×']
    ].filter(x=>scope==='all'||(scope==='editor'?x[0].startsWith('core-editor-'):x[0].startsWith('core-todo-')));
    const send=(type,data)=>parent.postMessage({scope:'LN_690G_CORE',token,type,data},'*');
    const rows=source.map(([id,name])=>({id,name,kind:'CORE_V2_SANDBOX_690G',ok:0,fail:0,blocked:0,ms:0,reason:''}));
    const assert=(b,m)=>{if(!b)throw Error(m);};
    const pause=ms=>visual?new Promise(r=>setTimeout(r,ms)):Promise.resolve();
    const txt=b=>(b?.obsah||[]).map(x=>x.text||'').join('');
    const record=(row,status,reason,duration,i)=>{row.ms+=Math.round(duration||0);
      if(status==='pass')row.ok++;
      else if(status==='fail'){row.fail++;if(!row.reason)row.reason=`opakování ${i}: ${String(reason).slice(0,110)}`;}
      else{row.blocked++;if(!row.reason)row.reason=`opakování ${i}: ${String(reason).slice(0,110)}`;}
    };
    const core=window.LubaNoteEditorV2;
    (async()=>{
      if(!core?.importujHtml||!core?.importujTodos||!core?.otevriVHostu||!core?.ziskejModel||!core?.provedPrikazVlastniKlavesnice||!core?.prepniTodoHotovo||!core?.ziskejTodoPodleId||!core?.exportujTodos||!core?.exportujHtml||!core?.undo||!core?.redo){send('blocked','shipped_core_api_missing');return;}
      const host=document.getElementById('ln-690g-host');
      if(!host){send('blocked','sandbox_host_missing');return;}
      for(let i=1;i<=10;i++){
        for(const row of rows){
          const st=performance.now();let opened=false;
          try{
            if(row.id.startsWith('core-editor-')){
              const m=core.importujHtml('<div>Dobry</div>');
              assert(m?.ok===true,'editor_fixture_import');
              assert(core.otevriVHostu(host,m.model)===true,'editor_open');opened=true;
              const originalId=core.ziskejModel().bloky[0].id;
              send('progress',`Editor ${i}/10 · píšu a upravuji text`);
              assert(core.provedPrikazVlastniKlavesnice('text',' den')===true,'editor_insert_rejected');
              assert(txt(core.ziskejModel().bloky[0])==='Dobry den','editor_insert_mismatch');
              assert(core.ziskejModel().bloky[0].id===originalId,'editor_id_changed');
              await pause(330);
              assert(core.provedPrikazVlastniKlavesnice('backspace')===true,'editor_backspace_rejected');
              assert(txt(core.ziskejModel().bloky[0])==='Dobry de','editor_backspace_mismatch');
              await pause(300);
              if(row.id==='core-editor-history'){
                assert(core.undo()===true,'editor_undo_rejected');
                assert(txt(core.ziskejModel().bloky[0])==='Dobry den','editor_undo_mismatch');
                await pause(250);
                assert(core.redo()===true,'editor_redo_rejected');
                assert(txt(core.ziskejModel().bloky[0])==='Dobry de','editor_redo_mismatch');
                const html=core.exportujHtml();
                assert(typeof html==='string'&&html.includes('Dobry de'),'editor_export_missing');
                const back=core.importujHtml(html);
                assert(back?.ok===true&&back.model.bloky.map(txt).join('|')==='Dobry de','editor_reimport_mismatch');
              }
            }else{
              const inp=[{id:'690g-task-a',text:'Ukol A',completed:false},{id:'690g-task-b',text:'Ukol B',completed:false}];
              const m=core.importujTodos(inp);
              assert(m?.ok===true,'todo_fixture_import');
              assert(core.otevriVHostu(host,m.model)===true,'todo_open');opened=true;
              assert(core.ziskejModel().bloky.length===2,'todo_wrong_count');
              assert(core.ziskejModel().bloky.every(b=>b.typ==='todo'),'todo_not_todo_type');
              send('progress',`ToDo ${i}/10 · zaškrtávám a obnovuji úkol`);
              assert(core.prepniTodoHotovo('690g-task-a')===true,'todo_mark_failed');
              assert(core.ziskejTodoPodleId('690g-task-a')?.completed===true,'todo_mark_state_wrong');
              assert(core.ziskejTodoPodleId('690g-task-b')?.completed===false,'todo_other_item_modified');
              await pause(330);
              if(row.id==='core-todo-state'){
                assert(core.prepniTodoHotovo('690g-task-a')===true,'todo_unmark_failed');
                assert(core.ziskejTodoPodleId('690g-task-a')?.completed===false,'todo_unmark_state_wrong');
              }
              if(row.id==='core-todo-history'){
                assert(core.undo()===true,'todo_undo_failed');
                assert(core.ziskejTodoPodleId('690g-task-a')?.completed===false,'todo_undo_state_wrong');
                await pause(250);
                assert(core.redo()===true,'todo_redo_failed');
                assert(core.ziskejTodoPodleId('690g-task-a')?.completed===true,'todo_redo_state_wrong');
              }
              if(row.id==='core-todo-export'){
                const arr=core.exportujTodos();
                assert(Array.isArray(arr)&&arr.length===2,'todo_export_count');
                assert(arr[0].text==='Ukol A'&&arr[0].completed===true,'todo_export_first');
                assert(arr[1].text==='Ukol B'&&arr[1].completed===false,'todo_export_second');
                const back=core.importujTodos(arr);
                assert(back?.ok===true&&back.model.bloky.length===2,'todo_reimport');
                assert(back.model.bloky[0].hotovo===true&&back.model.bloky[1].hotovo===false,'todo_reimport_status');
              }
            }
            record(row,'pass','',performance.now()-st,i);
          }catch(e){record(row,'fail',e?.message||'runtime_error',performance.now()-st,i);}
          finally{if(opened)try{core.zavriVHostu();}catch(_e){} try{window.getSelection()?.removeAllRanges();}catch(_e){}}
        }
        send('progress',`${scope==='editor'?'Editor':scope==='todo'?'ToDo':'Editor + ToDo'} ${i}/10`);
      }
      send('done',rows.map(r=>({id:r.id,name:r.name,kind:r.kind,status:r.fail?'CORE_FAIL':r.blocked?'CORE_BLOCKED':r.ok===10?'CORE_PASS':'CORE_BLOCKED',ms:r.ms,detail:`${r.ok}/10 PASS, ${r.fail} FAIL, ${r.blocked} BLOKOVÁNO. ${r.reason||'Skutečný Core V2 v odděleném DOM. Nativní Android UI netestováno.'}`})));
    })().catch(e=>send('blocked','fatal_'+String(e?.message||'unknown').slice(0,125)));
  }
  async function runRepeated(scope='all',shouldContinue=()=>true,onProgress=()=>{}){
    if(!['all','editor','todo'].includes(scope))return blocked('all','invalid_scope');
    if(busy)return blocked(scope,'runner_already_active');
    busy=true;
    const token='ln690g-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
    const visual=Boolean(window.LubaNoteAutoTesterVisual690F?.isSlow?.());
    let frame=null,finished=false,timer=null,interval=null;
    return new Promise(resolve=>{
      const cleanup=rows=>{if(finished)return;finished=true;
        clearTimeout(timer);clearInterval(interval);window.removeEventListener('message',receive);
        try{frame?.remove();}catch(_e){}busy=false;resolve(rows);
      };
      const receive=e=>{
        if(!frame||e.source!==frame.contentWindow||e.data?.scope!=='LN_690G_CORE'||e.data.token!==token)return;
        if(!shouldContinue()){cleanup(blocked(scope,'interrupted'));return;}
        if(e.data.type==='progress')onProgress(String(e.data.data||'').slice(0,100));
        else if(e.data.type==='blocked')cleanup(blocked(scope,String(e.data.data||'blocked').slice(0,120)));
        else if(e.data.type==='done'){
          const rows=e.data.data,expected=ALL.filter(x=>scope==='all'||(scope==='editor'?x.id.startsWith('core-editor-'):x.id.startsWith('core-todo-')));
          const valid=Array.isArray(rows)&&rows.length===expected.length&&new Set(rows.map(r=>r.id)).size===expected.length&&
            rows.every(r=>expected.some(x=>x.id===r.id)&&['CORE_PASS','CORE_FAIL','CORE_BLOCKED'].includes(r.status)&&typeof r.detail==='string');
          cleanup(valid?rows.map(r=>({...r,detail:r.detail.slice(0,240)})):blocked(scope,'invalid_runner_results'));
        }
      };
      window.addEventListener('message',receive);
      timer=setTimeout(()=>cleanup(blocked(scope,'editor_todo_sandbox_timeout_100s')),100000);
      interval=setInterval(()=>{if(!shouldContinue())cleanup(blocked(scope,'interrupted'));},300);
      try{
        const u=new URL('editorCoreV2.js?v=690G-editor-todo',location.href);
        if(u.origin!==location.origin)throw Error('core_origin_mismatch');
        if(!/^https?:\/\/|^capacitor:\/\//.test(location.origin))throw Error('unsupported_origin');
        const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
        const csp=`default-src 'none'; script-src 'nonce-${token}'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; font-src 'none'; frame-src 'none'; form-action 'none'`;
        frame=document.createElement('iframe');frame.sandbox='allow-scripts';frame.setAttribute('aria-hidden','true');frame.tabIndex=-1;
        frame.style.cssText='position:fixed;left:-10000px;top:0;width:420px;height:640px;opacity:0;pointer-events:none;border:0';
        frame.srcdoc=`<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${esc(csp)}"><style>html,body{background:#fff;color:#192f23;font:20px/1.5 system-ui}body{margin:10px}.ln-v2-editor{min-height:400px;display:block}.ln-v2-odstavec{min-height:48px;padding:6px 3px;border-bottom:1px solid #e8eee9}[hidden]{display:none!important}</style><script nonce="${esc(token)}" src="${esc(u.href)}"><\/script></head><body><div id="ln-690g-host"></div><script nonce="${esc(token)}">(${inner.toString()})(${JSON.stringify(token)},${JSON.stringify(scope)},${visual});<\/script></body></html>`;
        if(!window.LubaNoteAutoTesterVisual690F?.attachFrame?.(frame))document.body.appendChild(frame);
        onProgress(`Spouštím Core V2 – ${scope==='editor'?'Editor':scope==='todo'?'ToDo':'Editor + ToDo'}…`);
      }catch(e){cleanup(blocked(scope,'sandbox_creation_'+String(e?.message||e).slice(0,120)));}
    });
  }
  window.LubaNoteAutoTesterEditorTodo690G=Object.freeze({runRepeated});
})();
