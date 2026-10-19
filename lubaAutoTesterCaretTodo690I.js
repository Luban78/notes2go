/* LubaNote 690J — actual shipped Core V2 selection/caret/TODO regression.
   Opaque-origin sandbox, synthetic test data. Red point/blue marks are
   diagnostic overlays: NOT native Android touch or selection handles. */
(() => {
  'use strict';
  const CASES = [
    ['caret-todo-middle','ToDo – Backspace uprostřed úkolu a pevný kurzor'],
    ['caret-todo-clear','ToDo – mazání textu až do prázdného úkolu'],
    ['caret-todo-empty','ToDo – prázdný řádek bez poškození dalšího úkolu'],
    ['caret-todo-last','ToDo – mazání posledního úkolu bez poškození předchozího'],
    ['caret-todo-range','ToDo – výběr části textu, náhrada a kontrola úchytů'],
    ['caret-todo-reopen','ToDo – kurzor po Undo/Redo a obnovení DOM'],
    ['caret-todo-done-move','ToDo – hotový úkol, long-press MOVE a zachování stavu'],
    ['caret-todo-done-longpress','ToDo – long-press bez tažení nesmí změnit obsah'],
    ['caret-bullet-first-move','Bullet – dlouhý stisk a přesun první položky na konec'],
    ['caret-bullet-last-move','Bullet – dlouhý stisk a přesun poslední položky na začátek'],
    ['caret-editor-plain','Editor – běžný text: Backspace a správný kurzor'],
    ['caret-bullet-text','Bullet – editace textu bez skoku do další odrážky'],
    ['caret-editor-format','Editor – tučné, kurziva a podtržení výběru'],
    ['caret-editor-colors','Editor – barva a podbarvení textu'],
    ['caret-editor-scroll','Editor – dlouhý text, scroll a správný caret'],
    ['caret-editor-image','Editor – vložení obrázku mezi texty a úprava velikosti']
  ];
  let busy=false;
  const expected = scope => CASES.filter(([id]) => scope==='all' || (scope==='todo' && id.startsWith('caret-todo-')) || (scope==='editor' && (id.startsWith('caret-editor-') || ['caret-todo-range','caret-todo-reopen'].includes(id))) || (scope==='bullet' && (id.startsWith('caret-bullet-') || id==='caret-bullet-text')));
  const blocked = (scope,reason) => expected(scope).map(([id,name])=>({id,name,kind:'CORE_V2_CARET_SANDBOX_690I',status:'CORE_BLOCKED',ms:0,detail:String(reason||'unavailable').slice(0,190)}));

  function sandboxRunner(token,scope,visual,repeats){
    'use strict';
    const source=[
      ['caret-todo-middle','ToDo – Backspace uprostřed úkolu a pevný kurzor'],
      ['caret-todo-clear','ToDo – mazání textu až do prázdného úkolu'],
      ['caret-todo-empty','ToDo – prázdný řádek bez poškození dalšího úkolu'],
      ['caret-todo-last','ToDo – mazání posledního úkolu bez poškození předchozího'],
      ['caret-todo-range','ToDo – výběr části textu, náhrada a kontrola úchytů'],
      ['caret-todo-reopen','ToDo – kurzor po Undo/Redo a obnovení DOM'],
      ['caret-todo-done-move','ToDo – hotový úkol, long-press MOVE a zachování stavu'],
      ['caret-todo-done-longpress','ToDo – long-press bez tažení nesmí změnit obsah'],
    ['caret-bullet-first-move','Bullet – dlouhý stisk a přesun první položky na konec'],
    ['caret-bullet-last-move','Bullet – dlouhý stisk a přesun poslední položky na začátek'],
    ['caret-editor-plain','Editor – běžný text: Backspace a správný kurzor'],
    ['caret-bullet-text','Bullet – editace textu bez skoku do další odrážky'],
    ['caret-editor-format','Editor – tučné, kurziva a podtržení výběru'],
    ['caret-editor-colors','Editor – barva a podbarvení textu'],
    ['caret-editor-scroll','Editor – dlouhý text, scroll a správný caret'],
    ['caret-editor-image','Editor – vložení obrázku mezi texty a úprava velikosti']
    ].filter(([id])=>scope==='all' || (scope==='todo'&&id.startsWith('caret-todo-')) || (scope==='editor'&&(id.startsWith('caret-editor-')||['caret-todo-range','caret-todo-reopen'].includes(id))) || (scope==='bullet'&&id.startsWith('caret-bullet-')));
    const send=(type,data)=>parent.postMessage({scope:'LN_690I_CARET',token,type,data},'*');
    const rows=source.map(([id,name])=>({id,name,kind:'CORE_V2_CARET_SANDBOX_690I',ok:0,fail:0,ms:0,reason:''}));
    const assert=(cond,name)=>{if(!cond)throw Error(name);};
    const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const show=ms=>visual?sleep(Math.round(ms*visual)):Promise.resolve();
    const text=b=>(b?.obsah||[]).map(x=>String(x.text||'')).join('');
    send('ready',{loaded:true,coreAvailable:Boolean(window.LubaNoteEditorV2)});
    const core=window.LubaNoteEditorV2;
    const host=document.querySelector('#lat-690i-host');
    const getBlocks=()=>core.ziskejModel()?.bloky||[];
    const ed=()=>core.ziskejEditorElement();
    const selection=()=>window.getSelection();
    const overlay=document.createElement('div');overlay.id='lat-690i-overlay';document.body.appendChild(overlay);
    const pointer=document.createElement('div');pointer.className='lat-690i-red-dot';pointer.hidden=true;
    const startHandle=document.createElement('div');startHandle.className='lat-690i-handle';
    const endHandle=document.createElement('div');endHandle.className='lat-690i-handle';
    const hint=document.createElement('div');hint.className='lat-690i-hint';
    overlay.append(pointer,startHandle,endHandle,hint);
    const place=(el,x,y)=>{el.style.left=Math.max(9,Math.round(x))+'px';el.style.top=Math.max(9,Math.round(y))+'px';el.hidden=false;};
    function mark(label,rng){
      hint.textContent=label;
      const fallback=ed()?.getBoundingClientRect();
      const rect=rng?.getBoundingClientRect?.();
      let x=rect?.left||fallback?.left||30, y=rect?.top||fallback?.top||40;
      if(rng?.collapsed && (!rect?.height||!rect?.width)){
        const n=rng?.startContainer;
        const target=n?.nodeType===3?n.parentElement:n;
        const b=target?.getBoundingClientRect?.();
        if(b){x=b.left+Math.min(30,b.width/2);y=b.top+Math.min(15,b.height/2);}
      }
      pointer.hidden=true;place(startHandle,x,y+10);
      if(rng&&!rng.collapsed){const e=rng.getClientRects();const last=e[e.length-1]||rect;place(endHandle,last.right,last.bottom);}
      else endHandle.hidden=true;
    }
    function progress(label,iteration){send('progress',`Kurzor / ToDo ${iteration}/${repeats} · ${label}`);}
    function fixture(texts=['Prvni ukol','Druhy ukol','Treti ukol'],completed=[false,false,false]){
      const items=texts.map((t,i)=>({id:`690i-${i}`,text:t,completed:Boolean(completed[i])}));
      const imp=core.importujTodos(items);
      assert(imp?.ok===true,'todo_fixture_import_failed');
      assert(core.otevriVHostu(host,imp.model)===true,'todo_core_open_failed');
      assert(getBlocks().length===items.length,'todo_fixture_count');
    }
    function keepNeighbor(id,wanted){
      const b=getBlocks().find(x=>x.id===id);
      assert(Boolean(b),`neighbor_missing_${id}`);
      assert(text(b)===wanted,`neighbor_text_changed_${id}`);
    }
    function locate(blockIndex,offset,tailIndex=null,tailOffset=null){
      const row=ed()?.children?.[blockIndex];assert(row,'cursor_row_missing_'+blockIndex);
      const r=document.createRange();
      const point=(ix,off)=>{
        const target=ed()?.children?.[ix];assert(target,'selection_target_missing_'+ix);
        const txtNode=target.querySelector('.ln-v2-cast')?.firstChild;
        if(txtNode?.nodeType===3){assert(off<=txtNode.textContent.length,'caret_offset_out_of_range');return {node:txtNode,off};}
        // Empty TODO contains checkbox + BR. The caret belongs inside this row,
        // immediately after the non-editable checkbox and before its BR.
        assert(off===0,'empty_caret_nonzero');
        const firstBr=Array.from(target.childNodes).findIndex(x=>x.nodeName==='BR');
        assert(firstBr>=0,'empty_todo_br_missing');
        return {node:target,off:firstBr};
      };
      const a=point(blockIndex,offset);const z=point(tailIndex??blockIndex,tailOffset??offset);
      r.setStart(a.node,a.off);r.setEnd(z.node,z.off);
      selection().removeAllRanges();selection().addRange(r);
      const model=core.zachytAktualniVyber();
      assert(model,'selection_capture_missing');
      assert(model.zacatek.blok===blockIndex && model.zacatek.offset===offset,`caret_initial_wrong_${model.zacatek.blok}_${model.zacatek.offset}`);
      if(tailIndex!==null) assert(model.konec.blok===tailIndex&&model.konec.offset===tailOffset,'range_end_initial_wrong');
      mark(`VÝBĚR ${blockIndex+1}:${offset}${tailIndex!==null?` → ${tailIndex+1}:${tailOffset}`:''}`,r);
      return r;
    }
    async function checkCaret(expectedId,expectedOffset=null){
      // Real V2 vykresli() obnovuje DOM selection pomoci queueMicrotask.
      // Kontrola ve stejnem stacku cetla odpojeny/stary DOM bod = falesny FAIL.
      await Promise.resolve();
      const model=core.zachytAktualniVyber();
      assert(Boolean(model?.sbaleny), 'caret_not_collapsed_after_action');
      const b=getBlocks()[model.zacatek.blok];assert(b,'caret_outside_document');
      assert(b.id===expectedId,`caret_moved_to_wrong_todo_${b.id}_expected_${expectedId}`);
      if(expectedOffset!==null) assert(model.zacatek.offset===expectedOffset,`caret_wrong_offset_${model.zacatek.offset}_expected_${expectedOffset}`);
      const range=selection()?.rangeCount?selection().getRangeAt(0):null;
      assert(Boolean(range),'dom_caret_not_present');
      assert(range.collapsed===true,'dom_selection_did_not_collapse');
      if(range){
        assert(range.startContainer.isConnected,'dom_caret_detached');
        const node=range.startContainer, el=node.nodeType===3?node.parentElement:node;
        const domRow=el?.closest?.('[data-ln-v2-blok]');
        const at = node?.nodeType===3 ? '#text' : (node?.nodeName||'unknown');
        const focus = document.activeElement===ed() ? 'editor' : (document.activeElement?.tagName||'none');
        assert(Boolean(domRow),`dom_caret_outside_row_node_${at}_focus_${focus}`);
        assert(domRow.dataset.lnV2Blok===b.id,`dom_caret_wrong_todo_${domRow.dataset.lnV2Blok}`);
        mark(`KURZOR ${b.id}:${model.zacatek.offset}`,range);
      }
      return b;
    }
    function key(name,data){assert(core.provedPrikazVlastniKlavesnice(name,data)===true,'key_rejected_'+name);}
    const pointerEvent=(type,x,y,id)=>new PointerEvent(type,{pointerId:id,pointerType:'mouse',isPrimary:true,button:0,buttons:type==='pointerup'?0:1,bubbles:true,cancelable:true,clientX:x,clientY:y});

    async function bulletMove(i,direction){
      const imp=core.importujHtml('<ul><li>Alpha</li><li>Bravo</li><li>Charlie</li><li>Delta</li></ul>');
      assert(imp?.ok===true,'bullet_fixture_import');
      assert(core.otevriVHostu(host,imp.model)===true,'bullet_open');
      assert(getBlocks().map(text).join('|')==='Alpha|Bravo|Charlie|Delta','bullet_fixture_order');
      const initial=Object.fromEntries(getBlocks().map(b=>[text(b),b.id]));
      const children=ed().children,from=direction==='first'?children[0]:children[3];
      const target=direction==='first'?children[3]:children[0];
      const span=from.querySelector('.ln-v2-cast');assert(span,'bullet_drag_span');
      const f=from.getBoundingClientRect(), t=target.getBoundingClientRect();
      assert(f.height>12&&t.height>12,'bullet_drag_geometry');
      const x=f.left+Math.min(75,f.width/2),y=f.top+f.height/2;
      const dy=direction==='first'?t.bottom-3:t.top+3,pid=(direction==='first'?1200:1400)+i;
      place(pointer,x,y);hint.textContent='LONG-PRESS BULLET '+direction;
      span.dispatchEvent(pointerEvent('pointerdown',x,y,pid));await sleep(485);
      assert(ed().classList.contains('ln-v2-list-drag-mode'),'bullet_longpress_not_ready');
      place(pointer,x,dy);
      document.dispatchEvent(pointerEvent('pointermove',x,dy,pid));await sleep(35);
      const movingGhost=document.querySelector('.ln-v2-list-drag-preview');
      assert(Boolean(movingGhost)&&!movingGhost.hidden,'bullet_move_preview_missing');
      assert(getComputedStyle(movingGhost).position==='fixed','bullet_move_preview_wrong_position');
      document.dispatchEvent(pointerEvent('pointerup',x,dy,pid));pointer.hidden=true;await show(200);
      const ghost=document.querySelector('.ln-v2-list-drag-preview');
      assert(!ghost||ghost.hidden||getComputedStyle(ghost).display==='none','bullet_drag_ghost_visible_after_drop');
      const wanted=direction==='first'?['Bravo','Charlie','Delta','Alpha']:['Delta','Alpha','Bravo','Charlie'];
      const actual=getBlocks();
      assert(actual.map(text).join('|')===wanted.join('|'),'bullet_move_'+direction+'_wrong_order_'+actual.map(text).join('|'));
      assert(actual.every((b,j)=>b.id===initial[wanted[j]]),'bullet_move_changed_ids');
      assert(ed().children.length===4 && Array.from(ed().children).every((row,j)=>row.dataset.lnV2Blok===actual[j].id),'bullet_move_dom_order');
      assert(core.undo()===true,'bullet_move_undo');
      assert(getBlocks().map(text).join('|')==='Alpha|Bravo|Charlie|Delta','bullet_move_undo_wrong');
    }

    async function test(id,i){
      pointer.hidden=true;startHandle.hidden=true;endHandle.hidden=true;
      switch(id){
        case 'caret-bullet-first-move':{progress('přesouvám první Bullet na konec',i);await bulletMove(i,'first');break;}
        case 'caret-bullet-last-move':{progress('přesouvám poslední Bullet na začátek',i);await bulletMove(i,'last');break;}

        case 'caret-editor-plain':{
          const imp=core.importujHtml('<p>Prvni radek</p><p>Druhy text</p><p>Treti radek</p>');
          assert(imp?.ok===true,'plain_import_failed');
          assert(core.otevriVHostu(host,imp.model)===true,'plain_open_failed');
          const before=getBlocks().map(b=>({id:b.id,txt:text(b)}));
          assert(before.length===3,'plain_blocks_count');
          locate(1,5);progress('mažu ve druhém odstavci, hlídám caret',i);await show(280);
          key('backspace');
          assert(getBlocks()[0].id===before[0].id&&text(getBlocks()[0])==='Prvni radek','plain_prev_changed');
          assert(getBlocks()[2].id===before[2].id&&text(getBlocks()[2])==='Treti radek','plain_next_changed');
          assert(text(getBlocks()[1])==='Druh text','plain_target_text_wrong');
          await checkCaret(before[1].id,4);await show(260);break;
        }
        case 'caret-bullet-text':{
          const imp=core.importujHtml('<ul><li>Alpha</li><li>Bravo</li><li>Charlie</li></ul>');
          assert(imp?.ok===true,'bullet_text_import');assert(core.otevriVHostu(host,imp.model)===true,'bullet_text_open');
          const before=getBlocks().map(b=>({id:b.id,txt:text(b)}));
          assert(before.length===3,'bullet_text_fixture_count');
          locate(1,3);progress('mažu v Bullet Bravo, kontroluji úchyt',i);await show(240);
          key('backspace');
          assert(text(getBlocks()[1])==='Brvo','bullet_text_delete_wrong');
          assert(getBlocks()[0].id===before[0].id&&text(getBlocks()[0])==='Alpha','bullet_prev_changed');
          assert(getBlocks()[2].id===before[2].id&&text(getBlocks()[2])==='Charlie','bullet_next_changed');
          await checkCaret(before[1].id,2);await show(240);break;
        }
        case 'caret-editor-format':{
          const imp=core.importujHtml('<p>Formatovat text</p>');assert(imp?.ok===true,'format_import');
          assert(core.otevriVHostu(host,imp.model)===true,'format_open');
          for(const flag of ['tucne','kurziva','podtrzeni']){
            locate(0,0,0,9);progress('testuji formát '+flag,i);await show(160);
            core.prepniFormat(flag);
            const special=getBlocks()[0]?.obsah?.filter(z=>z.text&&z.format?.[flag]===true).map(z=>z.text).join('')||'';
            assert(special.includes('Formatova'),`format_${flag}_not_applied`);
          }
          assert(text(getBlocks()[0])==='Formatovat text','format_changed_text');
          await show(220);break;
        }
        case 'caret-editor-colors':{
          const imp=core.importujHtml('<p>Barva podklad</p>');assert(imp?.ok===true,'color_import');
          assert(core.otevriVHostu(host,imp.model)===true,'color_open');
          locate(0,0,0,5);progress('obarvuji text a podbarvení',i);await show(240);
          core.nastavBarvu('barva','#e53935');
          locate(0,0,0,5);
          core.nastavBarvu('pozadi','#fff59d');
          const colored=getBlocks()[0]?.obsah?.find(z=>z.text==='Barva');
          assert(colored?.format?.barva==='#e53935','foreground_color_missing');
          assert(colored?.format?.pozadi==='#fff59d','background_color_missing');
          assert(text(getBlocks()[0])==='Barva podklad','colors_changed_text');
          await show(260);break;
        }
        case 'caret-editor-scroll':{
          const html=Array.from({length:55},(_,j)=>'<p>Radek-'+String(j).padStart(3,'0')+'</p>').join('');
          const imp=core.importujHtml(html);assert(imp?.ok===true,'scroll_import');
          assert(core.otevriVHostu(host,imp.model)===true,'scroll_open');
          const editor=ed();editor.style.height='160px';editor.style.overflowY='auto';
          assert(getBlocks().length===55,'scroll_line_count');
          assert(editor.scrollHeight>editor.clientHeight+150,'scroll_not_scrollable');
          editor.scrollTop=editor.scrollHeight;progress('scrolluji 55 odstavců a mažu poslední znak',i);await show(300);
          assert(editor.scrollTop>0,'scroll_did_not_move');
          const previous=getBlocks()[53].id, last=getBlocks()[54].id;
          locate(54,9);key('backspace');
          assert(getBlocks()[53].id===previous&&text(getBlocks()[53])==='Radek-053','scroll_prev_changed');
          assert(text(getBlocks()[54])==='Radek-05','scroll_last_wrong');
          await checkCaret(last,8);await show(280);break;
        }
        case 'caret-editor-image':{
          const imp=core.importujHtml('<p>Pred obrazkem</p><p>Za obrazkem</p>');
          assert(imp?.ok===true,'image_import');assert(core.otevriVHostu(host,imp.model)===true,'image_open');
          locate(0,4);progress('vkládám obrázek mezi texty a měním velikost',i);await show(260);
          const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+HrtkAAAAASUVORK5CYII=';
          assert(core.vlozObrazek({zdroj:png,alt:'Test obrazek',velikost:'prizpusobit',zarovnani:'stred'})===true,'image_insert_failed');
          const b=getBlocks(),pic=b.find(x=>x.typ==='obrazek');
          assert(Boolean(pic),'image_block_missing');
          assert(b.filter(x=>x.typ!=='obrazek').map(text).join('').includes('Pred obrazkemZa obrazkem'),'image_changed_neighbor_text');
          assert(core.nastavNastaveniObrazku(pic.id,{velikost:'50',zarovnani:'vpravo'})===true,'image_settings_rejected');
          const updated=getBlocks().find(x=>x.id===pic.id);
          assert(updated?.velikost==='50'&&updated?.zarovnani==='vpravo','image_settings_not_saved');
          await show(310);break;
        }
        case 'caret-todo-middle':{
          fixture();locate(1,5);progress('mažu znak uvnitř prostředního ToDo',i);await show(220);
          key('backspace');keepNeighbor('690i-0','Prvni ukol');keepNeighbor('690i-2','Treti ukol');
          assert(text(getBlocks().find(b=>b.id==='690i-1'))==='Druh ukol','middle_delete_wrong_text');
          await checkCaret('690i-1',4);await show(230);break;
        }
        case 'caret-todo-clear':{
          fixture(['Pred','Dát','Po']);locate(1,3);progress('mažu Dát až na prázdný řádek',i);
          for(let j=0;j<3;j++){key('backspace');keepNeighbor('690i-0','Pred');keepNeighbor('690i-2','Po');await checkCaret('690i-1',2-j);await show(170);}
          assert(text(getBlocks().find(b=>b.id==='690i-1'))==='','todo_clear_not_empty');await show(200);break;
        }
        case 'caret-todo-empty':{
          fixture(['Zacatek','','Nasledujici ukol']);locate(1,0);
          progress('Odstranuji prazdny ToDo a overuji konec PREDCHOZIHO ukolu',i);await show(220);
          key('backspace');
          assert(getBlocks().length===2,'todo_empty_checkbox_not_removed');
          keepNeighbor('690i-0','Zacatek');keepNeighbor('690i-2','Nasledujici ukol');
          // V2 obnovuje DOM vyber v microtasku; nevynucujeme falešný FAIL před vykreslením.
          await Promise.resolve();
          const poSmazani=core.zachytAktualniVyber();
          const skutecny=getBlocks()[poSmazani?.zacatek?.blok];
          assert(skutecny?.id==='690i-0' && poSmazani.zacatek.offset===7,
            'caret_after_empty_todo_must_be_at_previous_end; actual='+String(skutecny?.id||'none')+':'+String(poSmazani?.zacatek?.offset));
          await checkCaret('690i-0',7);await show(130);
          progress('Dalsi Backspace maze PREDCHOZI text, ne nasledujici ukol',i);
          key('backspace');
          keepNeighbor('690i-0','Zacate');keepNeighbor('690i-2','Nasledujici ukol');
          assert(getBlocks().length===2,'todo_count_changed_after_second_backspace');
          await checkCaret('690i-0',6);
          await show(240);break;
        }
        case 'caret-todo-last':{
          fixture(['Prvni ukol','Druhy ukol','Z']);locate(2,1);progress('mažu poslední ToDo',i);
          key('backspace');keepNeighbor('690i-0','Prvni ukol');keepNeighbor('690i-1','Druhy ukol');
          assert(text(getBlocks().find(b=>b.id==='690i-2'))==='','last_todo_not_empty');await checkCaret('690i-2',0);await show(250);break;
        }
        case 'caret-todo-range':{
          fixture(['Pred','Opravit vzorce','Po']);locate(1,3,1,7);progress('táhnu úchyty a nahrazuji vybraný text',i);await show(320);
          key('text','ABC');keepNeighbor('690i-0','Pred');keepNeighbor('690i-2','Po');
          assert(text(getBlocks().find(b=>b.id==='690i-1'))==='OprABC vzorce','range_replace_wrong_text');
          await checkCaret('690i-1',6);await show(230);break;
        }
        case 'caret-todo-reopen':{
          fixture(['Pred','Stred','Po']);locate(1,3);progress('vkládám text a vracím historii',i);key('text','!');
          assert(text(getBlocks().find(b=>b.id==='690i-1'))==='Str!ed','history_edit_wrong_text');await checkCaret('690i-1',4);await show(170);
          assert(core.undo()===true,'history_undo_failed');keepNeighbor('690i-0','Pred');keepNeighbor('690i-2','Po');
          assert(text(getBlocks().find(b=>b.id==='690i-1'))==='Stred','history_undo_wrong_text');await checkCaret('690i-1',3);await show(170);
          assert(core.redo()===true,'history_redo_failed');assert(text(getBlocks().find(b=>b.id==='690i-1'))==='Str!ed','history_redo_wrong_text');await checkCaret('690i-1',4);await show(170);break;
        }
        case 'caret-todo-done-move':{
          fixture(['Ukol A','Hotovy ukol','Ukol C'],[false,true,false]);progress('držím hotové ToDo a přesouvám ho',i);
          assert(typeof PointerEvent==='function','pointer_events_not_supported');
          const rows=ed().children,from=rows[1],to=rows[2];
          const span=from.querySelector('.ln-v2-cast');assert(span,'todo_move_text_missing');
          const b=from.getBoundingClientRect(), target=to.getBoundingClientRect();
          assert(b.height>12&&target.height>12&&target.bottom>b.bottom,'todo_move_geometry');
          const x=b.left+Math.min(85,b.width/2),y=b.top+b.height/2,pid=700+i;
          place(pointer,x,y);hint.textContent='ČERVENÝ BOD = SIMULOVANÝ DOTEK';
          span.dispatchEvent(pointerEvent('pointerdown',x,y,pid));await sleep(485);
          assert(ed().classList.contains('ln-v2-list-drag-mode'),'todo_longpress_not_ready');
          const dy=target.bottom-3;place(pointer,x,dy);
          document.dispatchEvent(pointerEvent('pointermove',x,dy,pid));await sleep(35);
          const movingGhost=document.querySelector('.ln-v2-list-drag-preview');
          assert(Boolean(movingGhost)&&!movingGhost.hidden,'todo_move_preview_missing');
          assert(getComputedStyle(movingGhost).position==='fixed','todo_move_preview_wrong_position');
          document.dispatchEvent(pointerEvent('pointerup',x,dy,pid));pointer.hidden=true;await show(180);
          const ghost=document.querySelector('.ln-v2-list-drag-preview');
          assert(!ghost||ghost.hidden||getComputedStyle(ghost).display==='none','todo_drag_ghost_visible_after_drop');
          const blocks=getBlocks();assert(blocks.length===3,'todo_move_item_count');
          assert(blocks.map(text).join('|')==='Ukol A|Ukol C|Hotovy ukol','todo_move_wrong_order');
          assert(blocks[2].hotovo===true && blocks[0].hotovo===false&&blocks[1].hotovo===false,'todo_move_done_status_lost');
          assert(ed().children.length===3&&ed().children[2].dataset.lnV2Blok===blocks[2].id,'todo_move_dom_wrong_order');
          if(core.undo()===true){assert(getBlocks().map(text).join('|')==='Ukol A|Hotovy ukol|Ukol C','todo_move_undo_wrong');}
          else throw Error('todo_move_undo_missing');
          break;
        }
        case 'caret-todo-done-longpress':{
          fixture(['Ukol A','Hotovy ukol','Ukol C'],[false,true,false]);progress('držím hotové ToDo bez přesunu',i);
          assert(typeof PointerEvent==='function','pointer_events_not_supported');
          const row=ed().children[1],span=row.querySelector('.ln-v2-cast');assert(span,'todo_longpress_span');
          const b=row.getBoundingClientRect(),x=b.left+Math.min(75,b.width/2),y=b.top+b.height/2,pid=950+i;
          place(pointer,x,y);span.dispatchEvent(pointerEvent('pointerdown',x,y,pid));await sleep(485);
          document.dispatchEvent(pointerEvent('pointerup',x,y,pid));pointer.hidden=true;await show(180);
          assert(getBlocks().map(text).join('|')==='Ukol A|Hotovy ukol|Ukol C','todo_longpress_unexpected_reorder');
          assert(getBlocks()[1].hotovo===true,'todo_longpress_completion_lost');
          break;
        }
        default:throw Error('unrecognized_case_'+id);
      }
      const domOk=core.kontrolaDomu?.();
      assert(domOk===true,'dom_guard_post_action_failed');
    }
    (async()=>{
      if(!host||!core?.importujHtml||!core?.importujTodos||!core?.undo||!core?.otevriVHostu||!core?.ziskejModel||!core?.ziskejEditorElement||!core?.zachytAktualniVyber||!core?.provedPrikazVlastniKlavesnice){send('blocked','core_caret_required_api_missing');return;}
      if(typeof window.getSelection!=='function'||!document.createRange){send('blocked','dom_selection_api_missing');return;}
      // Finish one scenario at a time. Report each step to parent before the next one.
      for(const row of rows){
        for(let iteration=1;iteration<=repeats;iteration++){
          send('progress',`${row.name} · opakování ${iteration}/${repeats}`);
          const begin=performance.now();let opened=false;
          try{opened=true;await test(row.id,iteration);row.ok++;}
          catch(e){
            row.fail++;
            const problem=String(e?.message||e).slice(0,115);
            if(!row.reason)row.reason=`opakování ${iteration}: ${problem}`;
            hint.textContent=`CHYBA ${iteration}/${repeats}: ${problem}`;
            hint.style.background='#a51c30';
            send('progress',`CHYBA ${iteration}/${repeats} · ${row.id}: ${problem}`);
            await show(700);
            hint.style.background='';
          }
          finally{
            row.ms+=Math.round(performance.now()-begin);
            try{if(opened)core.zavriVHostu?.();}catch(_e){}
            try{selection()?.removeAllRanges();}catch(_e){}
          }
          send('checkpoint',{id:row.id,name:row.name,ok:row.ok,fail:row.fail,ms:row.ms,iteration,reason:row.reason||''});
        }
        send('progress',`Dokončena sada ${row.name}: ${row.ok}/${repeats} PASS, ${row.fail} FAIL`);
      }
      send('done',rows.map(r=>({id:r.id,name:r.name,kind:r.kind,status:r.fail?'CORE_FAIL':r.ok===repeats?'CORE_PASS':'CORE_BLOCKED',ms:r.ms,detail:`${r.ok}/${repeats} PASS, ${r.fail} FAIL. ${r.reason||'Core V2 / DOM Range a syntetické pointer události. Nejde o nativní Android úchyty.'}`})));
    })().catch(e=>send('blocked','fatal_'+String(e?.message||e).slice(0,110)));
  }

  async function runRepeated(scope='all',shouldContinue=()=>true,onProgress=()=>{},repeats=1){
    repeats=(Number.isInteger(Number(repeats))&&Number(repeats)>=1&&Number(repeats)<=50)?Number(repeats):1;
    if(!['all','todo','editor','bullet'].includes(scope))return blocked('all','invalid_scope');
    if(busy)return blocked(scope,'another_caret_runner_active');
    busy=true;
    let frame=null,interval=null,finished=false,lastMessage=Date.now(),lastStep='start',snapshots=new Map();
    const token='690i-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
    const visual=Number(window.LubaNoteAutoTesterVisual690F?.getSpeedFactor?.()??(window.LubaNoteAutoTesterVisual690F?.isSlow?.()?1:0));
    return new Promise(resolve=>{
      const fallback=reason=>expected(scope).map(([id,name])=>{
        const x=snapshots.get(id);
        const completed=Number(x?.iteration||0)===repeats;
        return {id,name,kind:'CORE_V2_CARET_SANDBOX_690I',
          status:x?.fail>0?'CORE_FAIL':completed&&x?.ok===repeats?'CORE_PASS':'CORE_BLOCKED',ms:Number(x?.ms)||0,
          detail:`${x?.ok||0}/${repeats} PASS, ${x?.fail||0} FAIL. ${x?.reason||''} ${completed?'':`NEDOKONČENO: ${reason}; poslední krok: ${lastStep}`}`.slice(0,320)};
      });
      const done=rows=>{if(finished)return;finished=true;clearInterval(interval);window.removeEventListener('message',onMessage);
        try{frame?.remove();}catch(_e){}busy=false;resolve(rows);
      };
      const onMessage=e=>{
        if(!frame||e.source!==frame.contentWindow||e.data?.scope!=='LN_690I_CARET'||e.data.token!==token)return;
        lastMessage=Date.now();
        if(!shouldContinue()){done(fallback('user_interrupted'));return;}
        if(e.data.type==='ready'){
          lastStep='sandbox_ready_core_'+(e.data.data?.coreAvailable?'yes':'no');
          onProgress('Testovací editor načten · spouštím scénáře…');
        }else if(e.data.type==='progress'){
          lastStep=String(e.data.data||'').slice(0,130);
          onProgress(lastStep);
        }else if(e.data.type==='checkpoint'){
          const x=e.data.data;
          if(x&&expected(scope).some(([id])=>id===x.id)&&Number.isInteger(x.iteration)&&x.iteration>=1&&x.iteration<=repeats){
            snapshots.set(x.id,{iteration:x.iteration,ok:Number(x.ok)||0,fail:Number(x.fail)||0,ms:Number(x.ms)||0,reason:String(x.reason||'').slice(0,135)});
          }
        }else if(e.data.type==='blocked')done(fallback(String(e.data.data||'sandbox_blocked')));
        else if(e.data.type==='done'){
          const out=e.data.data,keys=expected(scope);
          const valid=Array.isArray(out)&&out.length===keys.length&&new Set(out.map(x=>x.id)).size===keys.length &&
            out.every(x=>keys.some(([id])=>id===x.id)&&['CORE_PASS','CORE_FAIL','CORE_BLOCKED'].includes(x.status)&&typeof x.detail==='string');
          done(valid?out.map(x=>({...x,detail:x.detail.slice(0,320)})):fallback('invalid_caret_runner_results'));
        }
      };
      window.addEventListener('message',onMessage);
      // Monitor inactivity, not cumulative duration; the 100 steps can take >150 s on phones.
      interval=setInterval(()=>{
        if(!shouldContinue())done(fallback('user_interrupted'));
        else if(Date.now()-lastMessage>35000)done(fallback('no_progress_35s'));
      },500);
      try{
        const u=new URL('editorCoreV2.js?v=690I-caret-todo',location.href);
        if(u.origin!==location.origin)throw Error('core_cross_origin');
        if(!/^https?:\/\/|^capacitor:\/\//.test(location.origin))throw Error('unsupported_origin');
        const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
        const csp=`default-src 'none'; script-src 'nonce-${token}'; style-src 'unsafe-inline'; connect-src 'none'; img-src data:; font-src 'none'; frame-src 'none'; form-action 'none'`;
        const styles=`html,body{background:#fff;color:#153525;font:20px/1.5 system-ui}body{margin:12px}.ln-v2-editor{min-height:500px;display:block}.ln-v2-odstavec{position:relative;min-height:65px;padding:9px 10px 9px 48px;border-bottom:1px solid #e2eae5;box-sizing:border-box}.ln-v2-todo:before{content:'☐';position:absolute;left:7px;top:8px;color:#137657}.ln-v2-todo-hotovo:before{content:'☑'}.ln-v2-todo-check{position:absolute;left:6px;top:11px;opacity:.1;width:25px;height:25px}#lat-690i-overlay{position:fixed;inset:0;pointer-events:none;z-index:2147483646}.lat-690i-red-dot{position:absolute;transform:translate(-50%,-50%);width:26px;height:26px;background:#ef263c;border:3px solid white;border-radius:50%;box-shadow:0 0 0 3px rgba(239,38,60,.5)}.lat-690i-handle{position:absolute;width:5px;height:27px;background:#17b7d8;border-radius:4px;transform:translate(-50%,-85%)}.lat-690i-handle:after{content:'';position:absolute;left:-6px;bottom:-13px;width:18px;height:18px;border-radius:50%;background:#17b7d8;border:2px solid #fff}.ln-v2-list-drag-preview{position:fixed;z-index:2147483460;max-width:360px;padding:9px 13px;transform:translateX(-50%);border:2px solid #178050;border-radius:12px;background:#173b32;color:#fff;pointer-events:none}.ln-v2-list-drag-preview[hidden],.ln-v2-list-drop-indicator[hidden]{display:none!important}.ln-v2-list-drop-indicator{position:fixed;height:4px;pointer-events:none;background:#178050}.lat-690i-hint{position:absolute;left:4%;top:7px;background:#173b32;color:#fff;font:15px system-ui;padding:4px 9px;border-radius:8px}[hidden]{display:none!important}`;
        frame=document.createElement('iframe');frame.sandbox='allow-scripts';frame.tabIndex=-1;frame.setAttribute('aria-label','Izolovaný test kurzoru ToDo');
        frame.style.cssText='position:fixed;left:-10000px;top:0;width:420px;height:640px;opacity:0;pointer-events:none;border:0';
        frame.srcdoc=`<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${esc(csp)}"><style>${styles}</style><script nonce="${esc(token)}" src="${esc(u.href)}"><\/script></head><body><div id="lat-690i-host"></div><script nonce="${esc(token)}">(${sandboxRunner.toString()})(${JSON.stringify(token)},${JSON.stringify(scope)},${visual},${repeats});<\/script></body></html>`;
        if(!window.LubaNoteAutoTesterVisual690F?.attachFrame?.(frame))document.body.appendChild(frame);
        lastStep='iframe_created_waiting_for_ready';
        onProgress('Spouštím Core V2 – kurzor, úchyty a mazání ToDo…');
      }catch(e){done(blocked(scope,'sandbox_creation_'+String(e?.message||e).slice(0,90)));}
    });
  }
  window.LubaNoteAutoTesterCaretTodo690I=Object.freeze({runRepeated,supportsRepeatCount:true});
})();
