/* 690Y: visible regression of real list and TODO toolbar interactions on an OWNED Testy LOCAL note.
 * This module never modifies existing user notes. Each operation uses production editor UI and Core V2.
 * UI clicks are programmatic; they are NOT Java MotionEvent or physical Android taps.
 * Validation relies on the shipped model, live DOM, and re-opened persisted note, not an animation.
 */
(() => {
  'use strict';
  let busy=false;
  const cases=[
    ['ui-live-list-open','LubaNote – znovu otevřít vlastní testovací poznámku'],
    ['ui-live-bullet','LubaNote – Bullet přes skutečný panel nástrojů'],
    ['ui-live-ordered','LubaNote – číslovaný seznam přes skutečný panel'],
    ['ui-live-todo','LubaNote – přidat ToDo přes skutečné tlačítko'],
    ['ui-live-todo-check','LubaNote – označit ToDo hotovo v editoru'],
    ['ui-live-format','LubaNote – tučné písmo přes skutečný toolbar'],
    ['ui-live-save-reopen','LubaNote – uložit a znovu otevřít Bullet / seznam / ToDo']
  ];
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const ok=(condition,code)=>{if(!condition)throw Error(code);};
  const owned=id=>window.loadTask?.().find(n=>n?.id===id&&n.storageScope==='local'&&n.isSecret!==true&&n.tags?.includes('Testy')&&String(n.title||'').startsWith('[AutoTester 690T]'));
  const core=()=>window.LubaNoteEditorV2;
  const currentBlocks=()=>core()?.ziskejModel?.()?.bloky||[];
  const blockText=b=>String((b?.obsah||[]).map(x=>x?.text||x?.textContent||'').join(''));
  const findLabel=label=>currentBlocks().find(b=>blockText(b).includes(label));
  const present=el=>Boolean(el&&!el.hidden&&el.isConnected&&getComputedStyle(el).display!=='none'&&el.getClientRects().length);
  async function toolbarButton(id){
    const button=document.getElementById(id);ok(button,'toolbar_button_missing_'+id);
    const toggle=document.getElementById('editorToolbarToggle');
    for(let i=0;i<4&&!present(button);i++){
      ok(toggle,'toolbar_toggle_missing');toggle.click();await sleep(130);
    }
    ok(present(button),'toolbar_button_not_visible_'+id);
    return button;
  }
  function writeLine(label){
    const api=core();ok(api?.provedPrikazVlastniKlavesnice,'shipped_keyboard_command_unavailable');
    ok(api.nastavPoziciOtevreni?.('end')===true,'set_last_caret_failed');
    // Use the model fallback at the document end, not an unrelated stale DOM selection.
    try{const selection=window.getSelection();selection?.removeAllRanges();}catch(_e){}
    ok(api.provedPrikazVlastniKlavesnice('enter')===true,'real_editor_enter_failed');
    ok(api.provedPrikazVlastniKlavesnice('text',label)===true,'real_editor_text_failed');
    const b=findLabel(label);ok(b,'new_line_missing_from_real_model');
    return b;
  }
  async function setList(type){
    (await toolbarButton('tlacitkoBullet')).click();
    await sleep(160);
    const panel=document.getElementById('editorPanelSeznam');
    ok(panel&&!panel.hidden,'production_list_panel_not_opened');
    const item=panel.querySelector('[data-ln-v2-seznam="'+type+'"]');
    ok(item,'production_list_choice_missing_'+type);
    item.click();await sleep(170);
    ok(panel.hidden,'production_list_panel_not_closed');
  }
  async function run(id,alive=()=>true,progress=()=>{},minimize=()=>{},restore=()=>{}){
    if(busy)return cases.map(([code,name])=>({id:code,name,kind:'REAL_EDITOR_TOOLBAR_690Y',status:'APP_BLOCKED',ms:0,detail:'runner_busy'}));
    busy=true;const output=[];let failed=false;
    const labels={bullet:'AutoTester_Bullet_690Y',ordered:'AutoTester_Cislovany_690Y',todo:'AutoTester_ToDo_690Y'};
    try{
      ok(window.LubaNoteAdminTools?.isAllowed?.()===true,'admin_required');
      ok(owned(id),'testy_note_not_owned_or_missing');
      ok(document.getElementById('taskModal')?.hidden!==false,'another_editor_already_open');
      minimize();
      for(let i=0;i<cases.length;i++){
        const [testId,name]=cases[i];
        const start=performance.now();let evidence='';
        if(!alive())throw Error('test_cancelled');
        progress('V aplikaci '+(i+1)+'/'+cases.length+' · '+name);
        try{
          if(i===0){
            await window.openTaskEditorById(id);
            ok(document.getElementById('taskModal')?.hidden===false,'real_note_not_open');
            ok(document.getElementById('taskModal')?.dataset?.taskId===id,'opened_note_id_mismatch');
            ok(window.LubaNoteEditorV2Bridge?.jeAktivni?.()===true,'real_editor_bridge_inactive');
            evidence='Otevřena vlastní testovací poznámka v produkčním Core V2.';
          }else if(i===1){
            writeLine(labels.bullet);await toolbarButton('tlacitkoBullet');await setList('bullet');
            const b=findLabel(labels.bullet);ok(b?.typ==='bullet','bullet_model_type_not_bullet');
            ok(document.querySelector('[data-ln-v2-blok="'+CSS.escape(b.id)+'"]')?.classList.contains('ln-v2-bullet'), 'bullet_dom_class_missing');
            evidence='Typ bullet potvrzen v modelu i vykresleném DOM.';
          }else if(i===2){
            writeLine(labels.ordered);await setList('ordered');
            const b=findLabel(labels.ordered);ok(b?.typ==='ordered','ordered_model_type_not_ordered');
            ok(document.querySelector('[data-ln-v2-blok="'+CSS.escape(b.id)+'"]')?.classList.contains('ln-v2-ordered'),'ordered_dom_class_missing');
            evidence='Číslovaný seznam potvrzen v modelu i vykresleném DOM.';
          }else if(i===3){
            writeLine(labels.todo);
            (await toolbarButton('addTodoButton')).click();await sleep(160);
            const b=findLabel(labels.todo);ok(b?.typ==='todo','todo_model_type_not_todo');
            ok(document.querySelector('[data-ln-v2-blok="'+CSS.escape(b.id)+'"] [data-v2-todo-check]'),'todo_checkbox_missing_in_dom');
            evidence='ToDo kolečko vytvořeno skutečným tlačítkem editoru.';
          }else if(i===4){
            const before=findLabel(labels.todo);ok(before?.typ==='todo','todo_not_ready_for_check');
            const toggle=document.querySelector('[data-ln-v2-blok="'+CSS.escape(before.id)+'"] [data-v2-todo-check]');
            ok(toggle,'todo_checkbox_not_clickable');
            const was=Boolean(before.hotovo);toggle.click();await sleep(160);
            const after=findLabel(labels.todo);
            ok(after?.typ==='todo'&&Boolean(after.hotovo)!==was,'todo_completed_state_not_changed');
            evidence='Skutečný checkbox změnil stav hotovo v modelu.';
          }else if(i===5){
            // Visible toggle of formatting at the active caret, then actual text insertion.
            const label='AutoTester_Tucne_690Y';writeLine('AutoTester_Format_690Y');
            (await toolbarButton('tlacitkoTucne')).click();await sleep(140);
            ok(core().provedPrikazVlastniKlavesnice('text',label)===true,'keyboard_bold_text_not_inserted');
            const b=findLabel(label);ok(b,'bold_text_missing');
            const styled=(b.obsah||[]).some(c=>String(c?.text||'').includes(label)&&c?.format?.tucne===true);
            ok(styled,'bold_model_format_not_applied');
            evidence='Skutečné tlačítko Tučné + zápis klávesnicí; model obsahuje tučný segment.';
          }else if(i===6){
            const save=document.getElementById('editorBackButton');ok(save&&!save.disabled,'real_save_control_missing');
            save.click();let closed=false;
            for(let k=0;k<25;k++){if(!alive())throw Error('cancelled_during_save');await sleep(140);if(document.getElementById('taskModal')?.hidden===true){closed=true;break;}}
            ok(closed,'real_note_did_not_close');
            await window.LubaNoteRegularNotesStore?.cekejNaUlozeni?.();
            await window.openTaskEditorById(id);await sleep(230);
            ok(document.getElementById('taskModal')?.dataset?.taskId===id,'reopened_wrong_note');
            for(const [which,typ] of [['bullet','bullet'],['ordered','ordered'],['todo','todo']]){
              const b=findLabel(labels[which]);ok(b?.typ===typ,'persistent_'+which+'_type_lost');
            }
            evidence='Po uložení/znovuotevření přežily Bullet, číslovaný seznam a ToDo.';
            // Leave user's own Testy note saved and closed for review.
            const finish=document.getElementById('editorBackButton');ok(finish,'final_save_control_missing');finish.click();
            for(let k=0;k<20&&document.getElementById('taskModal')?.hidden!==true;k++)await sleep(140);
            ok(document.getElementById('taskModal')?.hidden===true,'final_editor_did_not_close');
          }
          output.push({id:testId,name,kind:'REAL_EDITOR_TOOLBAR_690Y',status:'APP_PASS',ms:Math.round(performance.now()-start),detail:evidence+' Programové kliknutí do skutečného UI + kontrola reálného modelu, ne fyzický prst.'});
          await sleep(170);
        }catch(error){
          failed=true;output.push({id:testId,name,kind:'REAL_EDITOR_TOOLBAR_690Y',status:'APP_FAIL',ms:Math.round(performance.now()-start),detail:String(error?.message||error).slice(0,225)+' · poznámka Testy zůstala pro kontrolu.'});break;
        }
      }
    }catch(error){
      failed=true;output.push({id:cases[0][0],name:cases[0][1],kind:'REAL_EDITOR_TOOLBAR_690Y',status:'APP_BLOCKED',ms:0,detail:String(error?.message||error).slice(0,200)});
    }finally{restore();busy=false;}
    const completed=new Set(output.map(x=>x.id));
    for(const [id,name] of cases)if(!completed.has(id))output.push({id,name,kind:'REAL_EDITOR_TOOLBAR_690Y',status:'APP_BLOCKED',ms:0,detail:failed?'Předchozí krok selhal – tato akce neproběhla.':'Nevykonáno.'});
    return output;
  }
  window.LubaNoteAutoTesterVisible690Y=Object.freeze({run, expected:cases.map(([id])=>id)});
})();
