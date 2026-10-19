/* 690T – REAL LOCAL NOTE lifecycle (retain reviewable test notes). Uses production LubaNote storage functions,
   never user notes as fixtures; no cloud writes, and strictly ID-scoped writes.
   APP_PASS proves LOCAL data operations, not editor clicks or cross-device sync. */
(() => {
  'use strict';
  const CASES = Object.freeze([
    ['local-notes-create','LOCAL Testy – vytvořit a uložit poznámku'],
    ['local-notes-edit','LOCAL Testy – upravit uložený obsah'],
    ['local-notes-reload','LOCAL Testy – znovu načíst uložený obsah'],
    ['local-notes-trash','LOCAL Testy – přesunout vlastní poznámku do Koše'],
    ['local-notes-restore','LOCAL Testy – obnovit vlastní poznámku z Koše'],
    ['local-notes-retained','LOCAL Testy – ponechat hotovou poznámku pro kontrolu']
  ]);
  let busy = false;
  let lastCreatedId=null;
  let lastCreatedTitle='';
  const row = (id, name, status, count, n, detail, ms=0) => ({
    id, name, status, kind:'REAL_LOCAL_NOTE_STORAGE_690S', ms,
    detail:`${count}/${n} PASS. ${String(detail || '').slice(0,200)}`
  });
  const blocked = why => CASES.map(([id,name]) => row(id,name,'APP_BLOCKED',0,1,why));
  const assert = (value,reason) => {if (!value) throw Error(reason);};
  const hasId = (list,id) => Array.isArray(list) && list.some(x=>x?.id===id);
  const current = id => window.loadTask().find(x=>x?.id===id);
  const trash = id => window.nactiPoznamkyVKosi({tajne:false}).find(x=>x?.id===id);
  const valid = (note,id,marker) => note?.id===id && note.storageScope==='local' && note.isSecret!==true &&
    Array.isArray(note.tags) && note.tags.includes('Testy') && String(note.title||'').startsWith('[AutoTester 690T]') &&
    (!marker || String(note.note||'').includes(marker));
  const scopedMutation = async (f,note) => {
    const fn=window.LubaNoteSync?.provedLokalniZmenuASynchronizuj;
    assert(typeof fn==='function','sync_safe_local_mutation_unavailable');
    const ok=await fn(f,note);
    assert(ok!==false,'storage_write_rejected');
    await window.LubaNoteRegularNotesStore?.cekejNaUlozeni?.();
    return ok;
  };
  function preflight() {
    assert(window.LubaNoteAdminTools?.isAllowed?.()===true,'admin_required');
    const modal=document.getElementById('taskModal');
    assert(!modal || modal.hidden,'open_user_editor_close_before_testing');
    assert(!document.body.classList.contains('secretModeActive'),'secret_mode_active');
    for (const name of ['saveTask','saveAllTasks','loadTask','deleteTasksByIds',
      'obnovPoznamkuZKose','smazPoznamkuZKoseTrvale','nactiPoznamkyVKosi']) {
      assert(typeof window[name]==='function','missing_production_storage_'+name);
    }
    assert(typeof window.LubaNoteSync?.provedLokalniZmenuASynchronizuj==='function','sync_serialization_unavailable');
    assert(typeof window.LubaNoteRegularNotesStore?.cekejNaUlozeni==='function','storage_persistence_wait_unavailable');
    assert(window.LubaNoteRegularNotesStore?.chybiPlnaCacheProSync?.()!==true,'indexeddb_cache_not_ready');
    assert(typeof window.getAllTags==='function' && window.getAllTags().includes('Testy'),
      'Testy_label_not_in_active_tag_space');
    assert(typeof crypto?.randomUUID==='function','secure_random_id_unavailable');
  }
  async function runRepeated(shouldContinue=()=>true,onProgress=()=>{},repeats=1) {
    if (busy) return blocked('lifecycle_already_running');
    busy = true;
    try {preflight();} catch(e) {busy=false;return blocked(e.message||'preflight_failed');}
    lastCreatedId=null;lastCreatedTitle='';
    const n=Number.isInteger(Number(repeats)) && Number(repeats)>=1 && Number(repeats)<=50 ? Number(repeats) : 1;
    const counters=CASES.map(()=>({ok:0,fail:0,ms:0,why:''}));
    let previousFailed=false;
    try {
      for (let i=1;i<=n;i++) {
        if (!shouldContinue()) {previousFailed=true;break;}
        const id=crypto.randomUUID();
        const marker='LN690T-'+id;
        const note={id,storageScope:'local',updatedAt:new Date().toISOString(),title:'[AutoTester 690T] Pruchod '+i+' – '+id.slice(0,8),
          note:'Prvni zapis '+marker,richContent:'<p>Prvni zapis '+marker+'</p>',
          tags:['Testy'],date:new Date().toISOString().slice(0,10),isSecret:false,
          completed:false,reminder:false,planned:false,favorite:false,pinned:false,notificationId:null,area:'private',todos:[]};
        const steps=[
          async()=>{await scopedMutation(()=>window.saveTask({...note}),note);assert(valid(current(id),id,marker),'create_not_persisted');},
          async()=>{const existing=current(id);assert(valid(existing,id,marker),'edit_source_missing');
            const revised={...existing,note:'Druhy zapis '+marker,richContent:'<p>Druhy zapis '+marker+'</p>',updatedAt:new Date().toISOString()};
            await scopedMutation(()=>window.saveAllTasks(window.loadTask().map(x=>x.id===id?revised:x)),revised);
            assert(current(id)?.note==='Druhy zapis '+marker,'edit_content_did_not_change');},
          async()=>{await window.LubaNoteRegularNotesStore.cekejNaUlozeni();
            assert(valid(current(id),id,marker),'reloaded_note_missing');assert(current(id).note==='Druhy zapis '+marker,'reload_content_changed');},
          async()=>{const existing=current(id);assert(valid(existing,id),'trash_target_invalid');
            await scopedMutation(()=>window.deleteTasksByIds([id]),existing);
            assert(!current(id)&&valid(trash(id),id),'trash_transition_failed');},
          async()=>{assert(valid(trash(id),id),'restore_target_invalid');const ok=await window.obnovPoznamkuZKose(id,false);
            assert(ok===true && valid(current(id),id,marker) && !trash(id),'restore_transition_failed');},
          async()=>{const preserved=current(id);assert(valid(preserved,id,marker),'retained_note_missing');
              await window.LubaNoteRegularNotesStore.cekejNaUlozeni();
              assert(valid(current(id),id,marker),'retained_note_not_persisted');
              lastCreatedId=id;lastCreatedTitle=preserved.title;}
        ];
        let stepIndex=0;
        try {
          for (stepIndex=0;stepIndex<steps.length;stepIndex++) {
            if (!shouldContinue()) throw Error('test_cancelled');
            const started=performance.now();
            onProgress(`LOCAL Testy ${i}/${n} · ${CASES[stepIndex][1]}`);
            await steps[stepIndex]();
            counters[stepIndex].ms+=Math.round(performance.now()-started);
            counters[stepIndex].ok++;
          }
        } catch(e) {
          const c=counters[Math.min(stepIndex,counters.length-1)];c.fail++;
          c.why=String(e?.message||e).slice(0,140);
          previousFailed=true;
        } finally {
          // 690T: Uzivatel chce testovaci poznamky zkontrolovat.
          // Neprovadej automaticky purge ani pri chybe; jen nahlas presne ID.
          const owned=current(id)||trash(id);
          if(owned && valid(owned,id)){
            lastCreatedId=id;lastCreatedTitle=owned.title;
          }
        }
        if(previousFailed) break;
      }
    } catch(e) {previousFailed=true;counters[5].fail++;counters[5].why='runner_error_'+String(e?.message||e).slice(0,135);}
    finally {busy=false;}
    return CASES.map(([id,name],i)=>{
      const c=counters[i];const status=c.fail?'APP_FAIL':c.ok===n?'APP_PASS':'APP_BLOCKED';
      const detail=c.why?`První chyba: ${c.why}. `:'';
      return row(id,name,status,c.ok,n,detail+
        'Skutecne LOCAL storage API. Testovaci poznamka je PONECHANA pod stitkem Testy v prostoru LOCAL; bez cloud sync.',c.ms);
    });
  }
  window.LubaNoteAutoTesterNotes690S=Object.freeze({runRepeated, getLastCreatedId:()=>lastCreatedId, getLastCreatedTitle:()=>lastCreatedTitle});
})();
