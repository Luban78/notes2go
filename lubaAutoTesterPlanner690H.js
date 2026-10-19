/* LubaNote AutoTester 690H — shipped recurringTasks.js behavioral test.
 * Pure scheduling logic; sandboxed without user accounts, storage, network or notifications.
 * PASS does NOT establish real Planner CRUD, background alarms, timezone transitions or Android notifications.
 */
(() => {
  'use strict';
  const EXPECTED = [
    ['planner-repeat-daily', 'Planner – denní opakování a interval (10×)'],
    ['planner-repeat-weekly', 'Planner – týdenní opakování a dny (10×)'],
    ['planner-repeat-month-end', 'Planner – konec měsíce a přestupný rok (10×)'],
    ['planner-repeat-bounds', 'Planner – začátek, konec a vypnutí opakování (10×)'],
    ['planner-repeat-next', 'Planner – nejbližší termín a čas (10×)'],
    ['planner-repeat-future', 'Planner – posloupnost dalších termínů (10×)'],
    ['planner-repeat-copy', 'Planner – kopie pravidla bez změny originálu (10×)']
  ];
  let busy = false;
  const blocked = reason => EXPECTED.map(([id,name])=>({id,name,kind:'SHIPPED_RECURRING_TASKS_ISOLATED',status:'APP_BLOCKED',ms:0,detail:String(reason||'unavailable').slice(0,170)}));
  function isolatedRunner(token,visual){
    'use strict';
    const send=(type,data)=>parent.postMessage({scope:'LN_690H_PLANNER',token,type,data},'*');
    const specs=[
      ['planner-repeat-daily','Planner – denní opakování a interval (10×)'],
      ['planner-repeat-weekly','Planner – týdenní opakování a dny (10×)'],
      ['planner-repeat-month-end','Planner – konec měsíce a přestupný rok (10×)'],
      ['planner-repeat-bounds','Planner – začátek, konec a vypnutí opakování (10×)'],
      ['planner-repeat-next','Planner – nejbližší termín a čas (10×)'],
      ['planner-repeat-future','Planner – posloupnost dalších termínů (10×)'],
      ['planner-repeat-copy','Planner – kopie pravidla bez změny originálu (10×)']
    ];
    const results=specs.map(([id,name])=>({id,name,kind:'SHIPPED_RECURRING_TASKS_ISOLATED',ok:0,fail:0,ms:0,reason:''}));
    const check=(ok,reason)=>{if(!ok)throw Error(reason);};
    const wait=(ms)=>visual?new Promise(resolve=>setTimeout(resolve,Math.round(ms*visual))):Promise.resolve();
    const key = value => [value.getFullYear(),String(value.getMonth()+1).padStart(2,'0'),String(value.getDate()).padStart(2,'0')].join('-');
    const dateTime = value => key(value)+' '+String(value.getHours()).padStart(2,'0')+':'+String(value.getMinutes()).padStart(2,'0');
    const host = document.getElementById('ln-690h-planner');
    const stepLabel = document.getElementById('ln-690h-action');
    const stepResult = document.getElementById('ln-690h-preview');
    const run=async()=>{
      const api=window.LubaNoteRecurring;
      if(!api || ['jeDatumVOpakovani','vypocitejPristiTermin','vypocitejBudouciTerminy','kopirujRepeat','datumovyKlic'].some(k=>typeof api[k]!=='function')){
        send('blocked','shipped_recurring_tasks_api_unavailable');return;
      }
      if(!host||!stepLabel||!stepResult){send('blocked','planner_preview_host_missing');return;}
      const weekly={enabled:true,type:'weekly',interval:1,startDate:'2026-10-05',days:[1,3]};
      const daily={enabled:true,type:'daily',interval:2,startDate:'2026-10-05'};
      const monthly={enabled:true,type:'monthly',interval:1,startDate:'2027-01-31',dayOfMonth:31};
      const after=new Date(2026,9,5,9,30,0);
      for(let iteration=1;iteration<=10;iteration++){
        for(const row of results){
          const st=performance.now();
          stepLabel.textContent=`${iteration}/10 · ${row.name.replace(' (10×)','')}`;
          let description='';
          try{
            switch(row.id){
              case 'planner-repeat-daily':
                check(api.jeDatumVOpakovani('2026-10-05',daily)===true,'daily_start_missing');
                check(api.jeDatumVOpakovani('2026-10-06',daily)===false,'daily_wrong_interval');
                check(api.jeDatumVOpakovani('2026-10-07',daily)===true,'daily_second_missing');
                check(api.jeDatumVOpakovani('2026-10-09',daily)===true,'daily_third_missing');
                description='05.10. ✓   06.10. ×   07.10. ✓   09.10. ✓';break;
              case 'planner-repeat-weekly':
                check(api.jeDatumVOpakovani('2026-10-05',weekly)===true,'weekly_monday_missing');
                check(api.jeDatumVOpakovani('2026-10-07',weekly)===true,'weekly_wednesday_missing');
                check(api.jeDatumVOpakovani('2026-10-08',weekly)===false,'weekly_thursday_wrong');
                check(api.jeDatumVOpakovani('2026-10-12',weekly)===true,'weekly_next_monday_missing');
                check(api.jeDatumVOpakovani('2026-10-12',{...weekly,interval:2})===false,'biweekly_wrong_gap');
                check(api.jeDatumVOpakovani('2026-10-19',{...weekly,interval:2})===true,'biweekly_second_missing');
                description='Po + St ✓   Čt ×   interval 2 týdnů ✓';break;
              case 'planner-repeat-month-end':
                check(api.jeDatumVOpakovani('2027-02-28',monthly)===true,'february_month_end_missing');
                check(api.jeDatumVOpakovani('2027-02-27',monthly)===false,'wrong_february_day');
                check(api.jeDatumVOpakovani('2027-03-31',monthly)===true,'march_31_missing');
                check(api.jeDatumVOpakovani('2028-02-29',monthly)===true,'leap_february_missing');
                description='31.01. → 28.02.2027 → 31.03. → 29.02.2028';break;
              case 'planner-repeat-bounds':{
                const bounded={enabled:true,type:'daily',interval:1,startDate:'2026-10-05',endDate:'2026-10-11'};
                check(api.jeDatumVOpakovani('2026-10-04',bounded)===false,'before_start_accepted');
                check(api.jeDatumVOpakovani('2026-10-05',bounded)===true,'start_rejected');
                check(api.jeDatumVOpakovani('2026-10-11',bounded)===true,'last_day_rejected');
                check(api.jeDatumVOpakovani('2026-10-12',bounded)===false,'after_end_accepted');
                check(api.jeDatumVOpakovani('2026-10-07',{...bounded,enabled:false})===false,'disabled_repeat_accepted');
                description='05.–11.10. povoleno; mimo rozsah odmítnuto';break;
              }
              case 'planner-repeat-next':{
                const next=api.vypocitejPristiTermin(after,weekly,new Date(2026,9,5,9,31));
                check(next instanceof Date&&!Number.isNaN(next.getTime()),'next_not_a_date');
                check(dateTime(next)==='2026-10-07 09:30','next_wrong_'+dateTime(next));
                const before=api.vypocitejPristiTermin(after,weekly,new Date(2026,9,5,7,0));
                check(dateTime(before)==='2026-10-05 09:30','same_day_next_wrong_'+dateTime(before));
                description='05.10. 09:30 → 07.10. 09:30';break;
              }
              case 'planner-repeat-future':{
                const future=api.vypocitejBudouciTerminy(after,weekly,4,new Date(2026,9,5,7,0));
                check(Array.isArray(future)&&future.length===4,'wrong_future_count_'+future?.length);
                const dates=future.map(dateTime);
                check(dates.join('|')==='2026-10-05 09:30|2026-10-07 09:30|2026-10-12 09:30|2026-10-14 09:30','future_dates_wrong_'+dates.join(','));
                check(future.every((d,i)=>i===0||d>future[i-1]),'future_not_increasing');
                description=dates.join('  →  ');break;
              }
              case 'planner-repeat-copy':{
                const origin={enabled:true,type:'weekly',interval:2,startDate:'2026-10-05',endDate:'2026-11-30',days:[1,3]};
                const copy=api.kopirujRepeat(origin);
                check(copy && copy!==origin,'repeat_copy_missing');
                check(copy.enabled===true&&copy.interval===2&&copy.startDate==='2026-10-05'&&copy.endDate==='2026-11-30','copy_properties_changed');
                check(Array.isArray(copy.days)&&copy.days.join(',')==='1,3','copy_days_changed');
                copy.days.push(5);copy.interval=1;
                check(origin.interval===2&&origin.days.length===2,'mutated_original_repeat');
                check(api.datumovyKlic('2026-10-05T14:28:00')==='2026-10-05','date_key_wrong');
                description='Kopie nezmění originální pravidlo';break;
              }
              default:throw Error('unexpected_test_id');
            }
            row.ok++;
            stepResult.textContent=description;
          }catch(e){row.fail++;if(!row.reason)row.reason=`opakování ${iteration}: ${String(e?.message||e).slice(0,110)}`;stepResult.textContent='CHYBA: '+row.reason;}
          row.ms+=Math.round(performance.now()-st);
          send('progress',`Planner ${iteration}/10 · ${row.name.split(' – ')[1]||row.id}`);
          await wait(visual?140:0);
        }
      }
      send('done',results.map(row=>({id:row.id,name:row.name,kind:row.kind,status:row.fail?'APP_FAIL':row.ok===10?'APP_PASS':'APP_BLOCKED',ms:row.ms,detail:`${row.ok}/10 PASS, ${row.fail} FAIL. ${row.reason||'Skutečný recurringTasks.js v izolaci; neověřuje běžící alarmy ani notifikace.'}`})));
    };
    run().catch(e=>send('blocked','planner_fatal_'+String(e?.message||e).slice(0,135)));
  }
  function runRepeated(shouldContinue=()=>true,onProgress=()=>{}){
    if(busy)return Promise.resolve(blocked('planner_runner_already_active'));
    busy=true;
    let frame=null,finished=false,timer=null,interval=null;
    const token='ln690h-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
    const visual=Number(window.LubaNoteAutoTesterVisual690F?.getSpeedFactor?.()||0);
    return new Promise(resolve=>{
      const done=rows=>{if(finished)return;finished=true;
        clearTimeout(timer);clearInterval(interval);window.removeEventListener('message',receive);
        try{frame?.remove();}catch(_e){}busy=false;resolve(rows);
      };
      const receive=e=>{
        if(!frame||e.source!==frame.contentWindow||e.data?.scope!=='LN_690H_PLANNER'||e.data?.token!==token)return;
        if(!shouldContinue()){done(blocked('cancelled'));return;}
        if(e.data.type==='progress')onProgress(String(e.data.data||'').slice(0,120));
        else if(e.data.type==='blocked')done(blocked(e.data.data));
        else if(e.data.type==='done'){
          const rows=e.data.data;
          const valid=Array.isArray(rows)&&rows.length===EXPECTED.length&&new Set(rows.map(r=>r.id)).size===EXPECTED.length&&
            rows.every(r=>EXPECTED.some(x=>x[0]===r.id)&&['APP_PASS','APP_FAIL','APP_BLOCKED'].includes(r.status)&&typeof r.detail==='string'&&Number.isFinite(r.ms));
          done(valid?rows.map(r=>({...r,detail:r.detail.slice(0,240)})):blocked('invalid_planner_results'));
        }
      };
      window.addEventListener('message',receive);
      timer=setTimeout(()=>done(blocked('planner_isolated_timeout_60s')),60000);
      interval=setInterval(()=>{if(!shouldContinue())done(blocked('cancelled'));},300);
      try{
        const js=new URL('recurringTasks.js?v=690H-live',location.href);
        if(js.origin!==location.origin)throw Error('planner_origin_mismatch');
        if(!/^https?:\/\/|^capacitor:\/\//.test(location.origin))throw Error('unsupported_origin');
        const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
        const csp=`default-src 'none'; script-src 'nonce-${token}'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; frame-src 'none'; form-action 'none'`;
        frame=document.createElement('iframe');frame.sandbox='allow-scripts';frame.setAttribute('aria-hidden','true');frame.tabIndex=-1;
        frame.style.cssText='position:fixed;left:-10000px;top:0;width:420px;height:640px;opacity:0;pointer-events:none;border:0';
        frame.srcdoc=`<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${esc(csp)}"><style>html,body{background:#fff;color:#193a2b;font:21px/1.5 system-ui}body{margin:20px}h2{font-size:1.3rem;color:#157849}#ln-690h-action{font-weight:700;margin:28px 0 10px}#ln-690h-preview{border:1px solid #94cbb0;border-radius:14px;padding:18px;min-height:160px;white-space:pre-wrap;overflow-wrap:anywhere;color:#1d4c37;background:#e8f6ed}small{color:#63796b}</style><script nonce="${esc(token)}" src="${esc(js.href)}"><\/script></head><body><h2>Planner – opakované termíny</h2><small>Skutečný výpočet nad testovacími daty</small><div id="ln-690h-planner"><div id="ln-690h-action">Spouštím…</div><div id="ln-690h-preview">Kontroluji pravidla…</div></div><script nonce="${esc(token)}">(${isolatedRunner.toString()})(${JSON.stringify(token)},${visual});<\/script></body></html>`;
        if(!window.LubaNoteAutoTesterVisual690F?.attachFrame?.(frame))document.body.appendChild(frame);
        onProgress('Planner 0/10 · načítám skutečný modul opakování…');
      }catch(e){done(blocked('planner_setup_'+String(e?.message||e).slice(0,140)));}
    });
  }
  window.LubaNoteAutoTesterPlanner690H=Object.freeze({runRepeated});
})();
