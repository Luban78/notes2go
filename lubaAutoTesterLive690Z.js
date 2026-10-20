/* 691AA / 691Z / 690Z: PRODUCTION APP visual regression. Own LOCAL Testy notes only.
 * Runs actual shipped editor handlers / toolbar controls. No fake success when controls absent.
 * It does not replace native MotionEvent coverage or isolated Core unit tests.
 */
(()=>{
'use strict';
let busy=false;
const cases=[
 ['ui-livez-open','V aplikaci – znovu otevřít vlastní poznámku'],
 ['ui-livez-bullet-root','V aplikaci – vytvořit rodičovskou Bullet položku'],
 ['ui-livez-bullet-indent','V aplikaci – Bullet potomek a skutečný Tab'],
 ['ui-livez-bullet-collapse','V aplikaci – sbalit Bullet šipkou'],
 ['ui-livez-bullet-expand','V aplikaci – rozbalit Bullet přes počet dětí'],
 ['ui-livez-bullet-outdent','V aplikaci – vynořit Bullet pomocí Shift+Tab'],
 ['ui-livez-bullet-undo','V aplikaci – Undo / Redo hierarchie'],
 ['ui-livez-save','V aplikaci – uložit a znovu otevřít hierarchii'],
 // 691Z: Separate real UI evidence for 2-level nested tree (no synthetic PASS).
 ['ui-livez-deep-open','V aplikaci – znovu otevřít Bullet pro více úrovní'],
 ['ui-livez-deep-indent','V aplikaci – dvě úrovně zanoření přes skutečný Tab'],
 ['ui-livez-deep-collapse','V aplikaci – sbalit dvě vnořené větve šipkami'],
 ['ui-livez-deep-expand','V aplikaci – rozbalit obě vnořené větve počty'],
 ['ui-livez-deep-outdent','V aplikaci – dvě úrovně vynoření pomocí Shift+Tab'],
 ['ui-livez-deep-persist','V aplikaci – uložit a obnovit vnořenou hierarchii']
];
const sleep=n=>new Promise(r=>setTimeout(r,n));
const assert=(x,m)=>{if(!x)throw Error(m);};
const kind='REAL_EDITOR_LIVE_690Z';
const note=id=>window.loadTask?.().find(n=>n?.id===id && n.storageScope==='local' && n.isSecret!==true && n.tags?.includes('Testy') && String(n.title||'').startsWith('[AutoTester 690T]'));
const api=()=>window.LubaNoteEditorV2;
const blocks=()=>api()?.ziskejModel?.()?.bloky||[];
const text=b=>(b?.obsah||[]).map(s=>String(s.text||'')).join('');
const find=q=>blocks().find(b=>text(b).includes(q));
const row=b=>document.querySelector('[data-ln-v2-blok="'+CSS.escape(b.id)+'"]');
const visible=b=>!!(b&&!b.hidden&&b.isConnected&&getComputedStyle(b).display!=='none'&&b.getClientRects().length);
const seed=String(Date.now()).slice(-8);
const rootLabel='AUTOTEST_BULLET_RODIC_'+seed;
const childLabel='AUTOTEST_BULLET_POTOMEK_'+seed;
const deepRootLabel='AUTOTEST_BULLET_HLOUBKA0_'+seed;
const subLabel='AUTOTEST_BULLET_VNORENY_'+seed;
const leafLabel='AUTOTEST_BULLET_HLOUBKA2_'+seed;
async function toolbar(id){
 const b=document.getElementById(id);assert(b,'chybi_tlacitko_'+id);
 const t=document.getElementById('editorToolbarToggle');
 for(let i=0;i<4&&!visible(b);i++){assert(t,'chybi_toolbar_toggle');t.click();await sleep(130);}
 assert(visible(b),'tlacitko_neni_videt_'+id);return b;
}
function positionOn(b){
 const el=row(b);assert(el,'radek_neni_v_DOM_'+b.id);
 const segment=el.querySelector(':scope > .ln-v2-cast');const node=segment?.firstChild;
 assert(node?.nodeType===3,'chybi_textovy_uzel_radku');
 const range=document.createRange();range.setStart(node,Math.min(2,node.textContent.length));range.collapse(true);
 const sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);
 api()?.zachytAktualniVyber?.();
 return el;
}
function typeNew(label){
 const core=api();assert(typeof core?.provedPrikazVlastniKlavesnice==='function','neni_prikaz_klavesnice');
 assert(core.nastavPoziciOtevreni?.('end')===true,'nelze_nastavit_konec');
 window.getSelection()?.removeAllRanges();
 assert(core.provedPrikazVlastniKlavesnice('enter')===true,'enter_nefunguje');
 assert(core.provedPrikazVlastniKlavesnice('text',label)===true,'zapis_nefunguje');
 assert(find(label),'text_nebyl_vlozen_do_modelu');
}
async function makeBullet(label){
 typeNew(label);
 (await toolbar('tlacitkoBullet')).click();await sleep(110);
 const panel=document.getElementById('editorPanelSeznam');assert(panel&&!panel.hidden,'panel_seznamu_se_neotevrel');
 const button=panel.querySelector('[data-ln-v2-seznam="bullet"]');assert(button,'chybi_volba_bullet');
 button.click();await sleep(145);
 const b=find(label);assert(b?.typ==='bullet','model_neni_bullet');
 assert(row(b)?.classList.contains('ln-v2-bullet'),'vykresleny_radek_neni_bullet');return b;
}
function keyOn(b,shift=false){
 const editor=api()?.ziskejEditorElement?.();assert(editor?.isConnected,'produkčni_editor_neni_pripojen');
 positionOn(b);
 editor.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',code:'Tab',bubbles:true,cancelable:true,shiftKey:shift}));
}
function nestedTree(){
 const anchor=find(deepRootLabel), sub=find(subLabel), leaf=find(leafLabel);
 assert(anchor?.typ==='bullet'&&sub?.typ==='bullet'&&leaf?.typ==='bullet','chybi_tri_bullety_hlubky');
 const positions=[anchor,sub,leaf].map(b=>blocks().findIndex(x=>x.id===b.id));
 assert(positions[0]>=0&&positions[1]===positions[0]+1&&positions[2]===positions[1]+1,'viceurovnove_polozky_nejsou_souvisle');
 assert(row(anchor)?.isConnected&&row(sub)?.isConnected&&row(leaf)?.isConnected,'vnorene_bullety_nejsou_v_DOM');
 return {anchor,sub,leaf};
}
function assertDepth(block,level){
 assert(block?.uroven===level,'uroven_model_neodpovida_'+level+' actual='+String(block?.uroven??'missing'));
 assert(row(block)?.dataset?.lnV2BulletUroven===String(level),'uroven_DOM_neodpovida_'+level);
}
function clickMarker(block){
 const marker=row(block)?.querySelector('[data-v2-list-marker]');
 assert(visible(marker),'chybi_klikaci_sipka_pro_vnoreni');marker.click();
}
function clickBadge(block){
 const badge=row(block)?.querySelector('[data-v2-list-toggle]');
 assert(visible(badge),'chybi_viditelny_pocet_potomku');badge.click();
}
function parentChild(){
 const parent=find(rootLabel),child=find(childLabel);assert(parent?.typ==='bullet'&&child?.typ==='bullet','neexistuji_dva_bullety');
 assert(blocks().findIndex(b=>b.id===child.id)===blocks().findIndex(b=>b.id===parent.id)+1,'potomek_neni_hned_za_rodicem');
 return {parent,child};
}
async function saveClose(){
 const btn=document.getElementById('editorBackButton');assert(btn&&!btn.disabled,'chybi_ulozit_a_zavrit');btn.click();
 for(let i=0;i<30&&document.getElementById('taskModal')?.hidden!==true;i++)await sleep(110);
 assert(document.getElementById('taskModal')?.hidden===true,'poznamka_se_nezavrela');
 await window.LubaNoteRegularNotesStore?.cekejNaUlozeni?.();
}
async function run(id,alive=()=>true,progress=()=>{},minimize=()=>{},restore=()=>{}){
 if(busy)return cases.map(([id,name])=>({id,name,kind,status:'APP_BLOCKED',ms:0,detail:'jiny_beh_stale_bezi'}));
 busy=true;const rows=[];let failed=false;
 try{
  assert(window.LubaNoteAdminTools?.isAllowed?.()===true,'admin_je_vyzadovan');
  assert(note(id),'poznamka_nepatri_testu_nebo_neni_LOCAL');
  assert(document.getElementById('taskModal')?.hidden===true,'editor_jiz_otevren');
  minimize();
  for(let i=0;i<cases.length;i++){
   const [testId,label]=cases[i],start=performance.now();let evidence='';
   assert(alive(),'test_prerusen');progress('V aplikaci • '+(i+1)+'/'+cases.length+' • '+label);
   try{
    if(i===0){
     await window.openTaskEditorById(id);await sleep(155);
     assert(document.getElementById('taskModal')?.hidden===false,'editor_se_neotevrel');
     assert(document.getElementById('taskModal')?.dataset?.taskId===id,'jina_poznamka');
     assert(window.LubaNoteEditorV2Bridge?.jeAktivni?.()===true,'bridge_neni_aktivni');
     evidence='Ověřeno otevření skutečné vlastní poznámky v aplikaci.';
    }else if(i===1){
     await makeBullet(rootLabel);evidence='Rodič vytvořen skutečným toolbar tlačítkem; model a DOM = bullet.';
    }else if(i===2){
     const child=await makeBullet(childLabel);keyOn(child,false);await sleep(160);
     const state=parentChild();assert(state.parent.uroven===0&&state.child.uroven===1,'Tab_nezanoril_dite');
     assert(row(state.child)?.dataset.lnV2BulletUroven==='1','DOM_dite_uroven_neni_1');
     evidence='Tab vykonán v produkčním editoru, potomek = úroveň 1 v modelu i DOM.';
    }else if(i===3){
     const {parent,child}=parentChild();assert(child.uroven===1,'dite_pred_sbaleni_neni_zanorene');
     const marker=row(parent)?.querySelector('[data-v2-list-marker]');assert(marker,'chybi_realna_sipka_sbaleni');
     marker.click();await sleep(135);
     assert(find(rootLabel)?.sbaleno===true,'klik_na_sipku_nezbalil_model');
     assert(row(find(rootLabel))?.querySelector('[data-v2-list-toggle]'),'pri_sbaleni_chybi_pocet_deti');
     evidence='Kliknutí na skutečnou šipku sbalilo větev a zobrazilo počet dětí.';
    }else if(i===4){
     const parent=find(rootLabel);assert(parent?.sbaleno===true,'pred_rozbalenim_neni_sbaleno');
     const badge=row(parent)?.querySelector('[data-v2-list-toggle]');assert(badge,'nema_tlacitko_poctu_deti');
     badge.click();await sleep(135);
     assert(find(rootLabel)?.sbaleno===false,'klik_na_pocet_deti_nerozbalil');
     evidence='Rozbalení přes skutečné tlačítko počtu dětí změnilo model.';
    }else if(i===5){
     const {child}=parentChild();keyOn(child,true);await sleep(130);
     assert(find(childLabel)?.uroven===0,'ShiftTab_nevynoril_dite');
     evidence='Shift+Tab v produkčním editoru přesunul potomka z úrovně 1 na 0.';
    }else if(i===6){
     assert(api()?.provedPrikazVlastniKlavesnice?.('undo')===true,'undo_se_neprovedlo');await sleep(100);
     assert(find(childLabel)?.uroven===1,'undo_nevratil_uroven_1');
     assert(api()?.provedPrikazVlastniKlavesnice?.('redo')===true,'redo_se_neprovedlo');await sleep(100);
     assert(find(childLabel)?.uroven===0,'redo_nevratil_uroven_0');
     evidence='Undo a Redo skutečného Core V2 obnovily očekávané úrovně.';
    }else if(i===7){
     await saveClose();await window.openTaskEditorById(id);await sleep(150);
     assert(find(rootLabel)?.typ==='bullet'&&find(childLabel)?.typ==='bullet','po_reload_chybi_bullet');
     assert(find(childLabel)?.uroven===0,'po_reload_se_zmenila_uroven');
     evidence='Uložení, zavření a nové otevření zachovalo oba Bullet řádky a úroveň.';
     await saveClose();
    }else if(i===8){
     await window.openTaskEditorById(id);await sleep(160);
     assert(document.getElementById('taskModal')?.hidden===false,'vnoreni_editor_neotevren');
     assert(document.getElementById('taskModal')?.dataset?.taskId===id,'vnoreni_spatna_poznamka');
     assert(find(childLabel)?.typ==='bullet'&&find(childLabel)?.uroven===0,'puvodni_Bullet_strom_poskozen');
     evidence='Testovací LOCAL poznámka znovu otevřena, původní strom zachován. Nový strom vytvoří následující krok.';
    }else if(i===9){
     // 691AA: vynuceni vlastniho sousedniho korene. Po re-open nemusí být
     // posledním blokem stará Bullet kotva a produkční Tab vyžaduje sourozence.
     const anchor=await makeBullet(deepRootLabel);assertDepth(anchor,0);
     const sub=await makeBullet(subLabel);assertDepth(sub,0);
     assert(blocks().findIndex(b=>b.id===sub.id)===blocks().findIndex(b=>b.id===anchor.id)+1,'novy_potomek_neni_za_korenem');
     keyOn(sub,false);await sleep(160);assertDepth(find(subLabel),1);
     // Core V2 po Enter z list item úrovně 1 přenáší úroveň na nový řádek.
     // Druhý Tab zanoří z 1 na 2. 691Z mylně zkoušel Tab dvakrát od 0.
     const leaf=await makeBullet(leafLabel);assertDepth(leaf,1);
     assert(blocks().findIndex(b=>b.id===leaf.id)===blocks().findIndex(b=>b.id===sub.id)+1,'vnorene_dite_neni_za_rodicem');
     keyOn(leaf,false);await sleep(165);
     const tree=nestedTree();assertDepth(tree.anchor,0);assertDepth(tree.sub,1);assertDepth(tree.leaf,2);
     evidence='Vlastní souvislý strom: Bullet 0, skutečný Tab 0→1, Enter zdědil 1, skutečný Tab 1→2; ověřeno modelem i DOM.';
    }else if(i===10){
     const tree=nestedTree();assertDepth(tree.leaf,2);
     clickMarker(tree.sub);await sleep(125);
     assert(find(subLabel)?.sbaleno===true,'vnorena_sipka_nezbalila');
     assert(row(find(subLabel))?.querySelector('[data-v2-list-toggle]'),'vnorene_sbaleni_bez_poctu');
     clickMarker(find(deepRootLabel));await sleep(140);
     assert(find(deepRootLabel)?.sbaleno===true,'rodicovska_sipka_nezbalila');
     assert(row(find(deepRootLabel))?.querySelector('[data-v2-list-toggle]'),'rodicovske_sbaleni_bez_poctu');
     evidence='Dvě různé vnořené větve sbaleny skutečnými šipkami; obě zaznamenány v modelu.';
    }else if(i===11){
     assert(find(deepRootLabel)?.sbaleno===true&&find(subLabel)?.sbaleno===true,'pred_rozbalenim_nejsou_dve_sbalene_vetve');
     clickBadge(find(deepRootLabel));await sleep(135);
     assert(find(deepRootLabel)?.sbaleno===false,'rodicovsky_badge_nerozbalil');
     // Produkční badge kořene rozbalí celý podstrom (PATCH 663D), tedy i sub.
     // Chceme-li ověřit druhý badge, musíme sub znovu samostatně sbalit.
     assert(find(subLabel)?.sbaleno===false,'root_badge_nerozbalil_vnoreni');
     clickMarker(find(subLabel));await sleep(130);
     assert(find(subLabel)?.sbaleno===true,'nelze_znovu_sbalit_vnorenou_vetev');
     clickBadge(find(subLabel));await sleep(135);
     assert(find(subLabel)?.sbaleno===false,'vnoreny_badge_nerozbalil');
     assertDepth(nestedTree().leaf,2);
     evidence='Root badge rozbalil celý podstrom, podvětev byla znovu sbalena a rozbalena vlastním badge; DOM i model drží hloubku 2.';
    }else if(i===12){
     const {leaf}=nestedTree();assertDepth(leaf,2);
     keyOn(leaf,true);await sleep(140);assertDepth(find(leafLabel),1);
     keyOn(find(leafLabel),true);await sleep(145);assertDepth(find(leafLabel),0);
     assertDepth(find(subLabel),1);
     evidence='Dva skutečné Shift+Tab v produkčním editoru: 2→1→0; vedlejší vnořený Bullet zůstal na úrovni 1.';
    }else if(i===13){
     await saveClose();await window.openTaskEditorById(id);await sleep(170);
     const tree=nestedTree();assertDepth(tree.anchor,0);assertDepth(tree.sub,1);assertDepth(tree.leaf,0);
     assert(tree.anchor.sbaleno!==true&&tree.sub.sbaleno!==true,'rozbaleny_stav_se_ztratil');
     evidence='Skutečné Uložit a zavřít / znovu otevřít zachovalo tři testovací Bullet položky, pořadí a úrovně 0/1/0.';
     await saveClose();
    }
    rows.push({id:testId,name:label,kind,status:'APP_PASS',ms:Math.round(performance.now()-start),detail:evidence+' Skutečné UI/model LubaNote, ne simulovaná projekce.'});
    const faktor=Number(window.LubaNoteAutoTesterVisual690F?.getSpeedFactor?.()||0);
    await sleep(faktor>0?Math.round(900*faktor):130);
   }catch(e){failed=true;rows.push({id:testId,name:label,kind,status:'APP_FAIL',ms:Math.round(performance.now()-start),detail:String(e?.message||e).slice(0,190)+'; vlastní poznámka Testy ponechána pro diagnostiku.'});break;}
  }
 }catch(e){failed=true;rows.push({id:cases[0][0],name:cases[0][1],kind,status:'APP_BLOCKED',ms:0,detail:String(e?.message||e).slice(0,195)});}
 finally{
  if(failed){
   const modal=document.getElementById('taskModal');
   if(modal?.hidden===false&&modal.dataset.taskId===id){
    try{await saveClose();}catch(_cleanupError){/* do not conceal original failure */}
   }
  }
  restore();busy=false;
 }
 const completed=new Set(rows.map(x=>x.id));for(const [id,name] of cases)if(!completed.has(id))rows.push({id,name,kind,status:'APP_BLOCKED',ms:0,detail:failed?'Předchozí krok selhal – netestováno.':'Netestováno.'});
 return rows;
}
window.LubaNoteAutoTesterLive690Z=Object.freeze({run,expected:cases.map(c=>c[0])});
})();
