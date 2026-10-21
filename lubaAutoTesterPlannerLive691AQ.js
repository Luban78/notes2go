/* 691AQ – read-only LIVE Planner UI event proof. Does NOT claim Planner CRUD or alarms. */
(() => {
  'use strict';
  const tests=[
    ['planner-live-picker-routing','Planner – skutečná tlačítka používají vlastní kalendář a hodiny'],
    ['planner-live-reminder-toggle','Planner – skutečný přepínač připomínky mění stav a lze jej vrátit']
  ];
  async function runRepeated(active,report,repeat=1){
    const rows=[];
    const doc=document;
    const $=id=>doc.getElementById(id);
    const add=(id,name,status,detail,ms)=>rows.push({id,name,kind:'PLANNER_LIVE_UI_691AQ',status,detail,ms});
    for(const [id,name] of tests){
      const start=performance.now();
      if(active?.()===false)break;
      try{
        if(id==='planner-live-picker-routing'){
          const dateBtn=$('plannerDateButton'),timeBtn=$('plannerTimeButton');
          const date=$('plannerDate'),time=$('plannerTime');
          const dateLabel=$('plannerDateLabel'),timeLabel=$('plannerTimeLabel');
          if(!dateBtn||!timeBtn||!date||!time||!dateLabel||!timeLabel)throw Error('planner_controls_missing');
          const oldDate=window.otevriVlastniVyberData;
          const oldTime=window.otevriVlastniVyberCasu;
          if(typeof oldDate!=='function'||typeof oldTime!=='function')throw Error('custom_pickers_missing');
          let dateCalls=0,timeCalls=0;
          try{
            // Spy only: real button click and production click handler run;
            // do not open a picker or change any real date/time.
            window.otevriVlastniVyberData=opts=>{if(opts?.input===date&&opts?.label===dateLabel)dateCalls++;};
            window.otevriVlastniVyberCasu=opts=>{if(opts?.input===time&&opts?.label===timeLabel)timeCalls++;};
            dateBtn.click();timeBtn.click();
          }finally{
            window.otevriVlastniVyberData=oldDate;
            window.otevriVlastniVyberCasu=oldTime;
          }
          if(dateCalls!==1||timeCalls!==1)throw Error('picker_dispatch_date='+dateCalls+'_time='+timeCalls);
          add(id,name,'APP_PASS','Produkční click handlery obou skutečných tlačítek předaly správné input/label vlastním LubaNote pickerům. Spy zabránil otevření modalu; datum ani čas se neměnily. Neověřuje výběr termínu ani uložení.',performance.now()-start);
        }else{
          const toggle=$('plannerReminderToggle');
          if(!toggle)throw Error('reminder_toggle_missing');
          const initial=toggle.getAttribute('aria-pressed');
          if(initial!=='true'&&initial!=='false')throw Error('reminder_initial_state_invalid');
          let after='';
          try{
            toggle.click();after=toggle.getAttribute('aria-pressed');
          }finally{
            // Restore by the actual production handler; no preference or storage writes.
            if(toggle.getAttribute('aria-pressed')!==initial)toggle.click();
          }
          if(after===initial||toggle.getAttribute('aria-pressed')!==initial)throw Error('reminder_toggle_did_not_roundtrip');
          add(id,name,'APP_PASS','Skutečný produkční přepínač změnil aria-pressed a druhým kliknutím obnovil původní stav. Neověřuje systémovou notifikaci.',performance.now()-start);
        }
      }catch(e){
        add(id,name,'APP_FAIL',String(e?.message||e).slice(0,200),performance.now()-start);
      }
      report?.('691AQ: '+name);
    }
    return rows;
  }
  window.LubaNoteAutoTesterPlannerLive691AQ=Object.freeze({runRepeated});
})();
