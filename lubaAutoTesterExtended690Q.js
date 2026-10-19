/* LubaNote 690Q – additional shipped-module regressions.  Test fixtures only.
 * Opaque sandbox: no production notes, auth, storage, or DB access.
 * CORE_PASS denotes isolated Core V2 behavioral checks, not full V1 scenarios.
 */
(() => {
'use strict';
const CASES=[
 ['core-code-import','Code – skutečný import, export a nedělitelný blok','CORE_PASS'],
 ['core-code-caret','Code – skutečný DOM Range uvnitř bloku','CORE_PASS'],
 ['core-code-image','Code – vložení obrázku zachová dva code bloky','CORE_PASS'],
 ['core-code-toggle','Code – převod běžného textu na code a zpět','CORE_PASS'],
 ['core-image-roundtrip','Obrázek – export a znovunačtení dokumentu','CORE_PASS'],
 ['core-image-size','Obrázek – změna velikosti a zarovnání','CORE_PASS'],
 ['core-image-delete-undo','Obrázek – odstranění a skutečné Undo','CORE_PASS'],
 ['core-image-order','Obrázek mezi texty – zachování pořadí a obsahu','CORE_PASS'],
 ['core-mixed-html','Smíšený obsah – nadpis, ToDo, code a HTML roundtrip','CORE_PASS'],
 ['app-i18n-packs','Překlady – 6 skutečných balíčků a shoda klíčů','APP_PASS']
];
let busy=false;
const select=scope=>CASES.filter(x=>scope==='all'||scope==='editor'&&x[0].startsWith('core-code')||scope==='image'&&x[0].startsWith('core-image')||scope==='i18n'&&x[0].startsWith('app-i18n'));
const blocked=(scope,why)=>select(scope).map(([id,name,status])=>({id,name,status:status==='APP_PASS'?'APP_BLOCKED':'CORE_BLOCKED',kind:'REAL_MODULE_690Q_SANDBOX',ms:0,detail:String(why).slice(0,210)}));
function sandboxRunner(token,scope,repeats,visual){
 'use strict';
 const ALL=[
 ['core-code-import','Code – skutečný import, export a nedělitelný blok','CORE_PASS'],
 ['core-code-caret','Code – skutečný DOM Range uvnitř bloku','CORE_PASS'],
 ['core-code-image','Code – vložení obrázku zachová dva code bloky','CORE_PASS'],
 ['core-code-toggle','Code – převod běžného textu na code a zpět','CORE_PASS'],
 ['core-image-roundtrip','Obrázek – export a znovunačtení dokumentu','CORE_PASS'],
 ['core-image-size','Obrázek – změna velikosti a zarovnání','CORE_PASS'],
 ['core-image-delete-undo','Obrázek – odstranění a skutečné Undo','CORE_PASS'],
 ['core-image-order','Obrázek mezi texty – zachování pořadí a obsahu','CORE_PASS'],
 ['core-mixed-html','Smíšený obsah – nadpis, ToDo, code a HTML roundtrip','CORE_PASS'],
 ['app-i18n-packs','Překlady – 6 skutečných balíčků a shoda klíčů','APP_PASS']
 ];
 const selected=ALL.filter(x=>scope==='all'||scope==='editor'&&x[0].startsWith('core-code')||scope==='image'&&x[0].startsWith('core-image')||scope==='i18n'&&x[0].startsWith('app-i18n'));
 const send=(type,data)=>parent.postMessage({scope:'LN_690Q_EXT',token,type,data},'*');
 const rows=selected.map(([id,name,pass])=>({id,name,pass,ok:0,fail:0,blocked:0,ms:0,reason:''}));
 const assert=(v,reason)=>{if(!v)throw Error(reason);};
 const sleep=ms=>visual?new Promise(res=>setTimeout(res,Math.round(ms*visual))):Promise.resolve();
 const core=window.LubaNoteEditorV2;
 const text=b=>(b?.obsah||[]).map(x=>String(x.text||'')).join('');
 const blocks=()=>core.ziskejModel()?.bloky||[];
 const host=document.getElementById('lat-690q-host');
 const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+HrtkAAAAASUVORK5CYII=';
 const importHtml=html=>{const inp=core.importujHtml(html);assert(inp?.ok===true,'import_rejected');assert(core.otevriVHostu(host,inp.model)===true,'core_open_rejected');return blocks();};
 const codeText='const alpha = 1;\nconsole.log(alpha);';
 const codeHtml=()=>'<pre><code>'+codeText.replaceAll('\\n','\n')+'</code></pre>';
 const findCode=()=>blocks().filter(b=>b.legacyPre===true||b.obsah?.some(c=>c.format?.kod===true));
 function selectText(index,offset=0){
   const el=core.ziskejEditorElement()?.children?.[index];assert(el,'dom_row_missing');
   const span=el.querySelector('span.ln-v2-cast');
   const node=span?.firstChild;
   const range=document.createRange();
   if(node?.nodeType===3){assert(offset<=node.nodeValue.length,'selection_offset_outside_segment');range.setStart(node,offset);}
   else {assert(offset===0,'empty_code_caret_nonzero');const br=Array.from(el.childNodes).findIndex(x=>x.nodeName==='BR');assert(br>=0,'empty_code_br_missing');range.setStart(el,br);}
   range.collapse(true);
   window.getSelection().removeAllRanges();window.getSelection().addRange(range);
   const m=core.zachytAktualniVyber();assert(m?.zacatek?.blok===index,'model_caret_wrong_block');assert(m.zacatek.offset===offset,'model_caret_wrong_offset');
 }
 function imageAtCaret(html,ix,off){
   importHtml(html);selectText(ix,off);
   assert(core.vlozObrazek({zdroj:png,alt:'Test image 690Q',velikost:'prizpusobit',zarovnani:'stred'})===true,'image_insert_rejected');
   const pic=blocks().find(b=>b.typ==='obrazek');assert(pic,'image_model_missing');return pic;
 }
 async function execute(id){
   if(id==='app-i18n-packs'){
     const packs=window.LubaNoteLanguagePacks||[];
     assert(packs.length===6,'language_pack_count_'+packs.length);
     const ids=packs.map(p=>p.id).sort().join(',');assert(ids==='cs,de,en,es,pl,sk','language_ids_'+ids);
     const baseline=Object.keys(packs.find(p=>p.id==='cs').preklady||{}).sort();assert(baseline.length>=300,'language_key_count_'+baseline.length);
     const gaps=[];
     for(const p of packs){
       const keys=Object.keys(p.preklady||{}).sort();
       const plural=new Set(new Intl.PluralRules(p.locale).resolvedOptions().pluralCategories);
       // Only Czech/Slovak/Polish require 'few'/'many'. EN/DE/ES intentionally use one/other.
       const isOptionalPlural=k=>/^(documents\.fileCount|settings\.wordsCount)\.(few|many|one|zero|two|other)$/.test(k)&&!plural.has(k.slice(k.lastIndexOf('.')+1));
       const missing=baseline.filter(k=>!keys.includes(k)&&!isOptionalPlural(k));
       const extra=keys.filter(k=>!baseline.includes(k)&&!isOptionalPlural(k));
       if(missing.length||extra.length)gaps.push(p.id+': chybi='+missing.length+', navic='+extra.length+', prvni='+String(missing[0]||extra[0]||'-'));
       const bad=keys.find(k=>typeof p.preklady[k]!=='string'||!p.preklady[k].trim());
       if(bad)gaps.push(p.id+': prazdny='+bad);
       for(const prefix of ['documents.fileCount','settings.wordsCount'])for(const form of plural){
         if(!p.preklady[prefix+'.'+form])gaps.push(p.id+': plural='+prefix+'.'+form);
       }
     }
     assert(!gaps.length,'language_pack_key_gaps; '+gaps.join('; '));
     return `6 skutečných jazykových balíčků; ověřeny klíče, neprázdné hodnoty a platné množné tvary dle Intl.PluralRules. UI texty se netestují.`;
   }
   if(id==='core-code-import'){
     importHtml(codeHtml());const cs=findCode();assert(cs.length===1,'code_block_count_'+cs.length);
     assert(text(cs[0])===codeText.replaceAll('\\n','\n'),'code_content_changed');
     const html=core.exportujHtml();const re=core.importujHtml(html);assert(re?.ok===true,'code_reimport_rejected');
     assert(re.model.bloky.filter(b=>b.legacyPre||b.obsah?.some(s=>s.format?.kod)).length===1,'code_split_after_roundtrip');
     assert(re.model.bloky.some(b=>text(b)===codeText.replaceAll('\\n','\n')),'code_text_changed_roundtrip');
   }else if(id==='core-code-caret'){
     importHtml('<pre><code>abcdefghi</code></pre>');const idx=blocks().findIndex(b=>b.legacyPre||b.obsah?.some(s=>s.format?.kod));assert(idx>=0,'code_missing');
     selectText(idx,3);const m=core.zachytAktualniVyber();assert(m.zacatek.offset===3&&m.sbaleny,'code_range_wrong');
     assert(core.provedPrikazVlastniKlavesnice('backspace')===true,'code_backspace_rejected');
     assert(text(blocks()[idx])==='abdefghi','code_backspace_wrong');
   }else if(id==='core-code-image'){
     importHtml('<pre><code>FIRST_CODE</code></pre><pre><code>SECOND_CODE</code></pre>');
     assert(findCode().length===2,'two_code_blocks_missing');
     const codeIndex=blocks().findIndex(b=>text(b)==='FIRST_CODE');assert(codeIndex>=0,'code_first_missing');selectText(codeIndex,10);
     assert(core.vlozObrazek({zdroj:png,alt:'Between code',velikost:'prizpusobit'})===true,'code_image_insert_rejected');
     assert(findCode().length===2,'code_block_split_by_image');
     assert(findCode().map(text).join('|')==='FIRST_CODE|SECOND_CODE','code_text_corrupt_by_image');
     assert(blocks().some(b=>b.typ==='obrazek'),'image_not_inserted_between_code');
   }else if(id==='core-code-toggle'){
     importHtml('<p>BeforeCodeAfter</p>');selectText(0,6);
     assert(core.prepniKodovyBlok()===true,'code_toggle_on_rejected');
     assert(findCode().length===1,'code_toggle_missing');
     assert(blocks().map(text).join('')==='BeforeCodeAfter','code_toggle_changed_text');
     const idx=blocks().findIndex(b=>b.legacyPre||b.obsah?.some(s=>s.format?.kod));
     selectText(idx,0);assert(core.prepniKodovyBlok()===true,'code_toggle_off_rejected');
     assert(findCode().length===0,'code_toggle_off_left_code');
   }else if(id==='core-image-roundtrip'){
     imageAtCaret('<p>Prvni</p><p>Druhy</p>',0,5);
     const html=core.exportujHtml();const re=core.importujHtml(html);assert(re?.ok===true,'image_roundtrip_import_failed');
     assert(re.model.bloky.some(b=>b.typ==='obrazek'),'image_missing_after_reimport');
     assert(re.model.bloky.map(text).join('').includes('PrvniDruhy'),'image_roundtrip_text_changed');
   }else if(id==='core-image-size'){
     const pic=imageAtCaret('<p>Prvni</p><p>Druhy</p>',0,3);
     assert(core.nastavNastaveniObrazku(pic.id,{velikost:'50',zarovnani:'vpravo'})===true,'size_update_failed');
     const changed=blocks().find(b=>b.id===pic.id);assert(changed.velikost==='50'&&changed.zarovnani==='vpravo','image_size_alignment_lost');
   }else if(id==='core-image-delete-undo'){
     const pic=imageAtCaret('<p>Prvni</p><p>Druhy</p>',0,5);
     assert(core.smazObrazek(pic.id)===true,'image_delete_rejected');
     assert(!blocks().some(b=>b.id===pic.id),'image_not_deleted');
     assert(core.undo()===true,'image_delete_undo_rejected');
     assert(blocks().some(b=>b.id===pic.id),'image_undo_did_not_restore');
   }else if(id==='core-image-order'){
     const pic=imageAtCaret('<p>PRVNITEXT</p><p>DRUHYTEXT</p>',0,5);
     assert(blocks().findIndex(b=>b.id===pic.id)>0,'image_not_after_before_text');
     const str=blocks().filter(b=>b.typ!=='obrazek').map(text).join('');
     assert(str==='PRVNITEXTDRUHYTEXT','image_insert_modified_text');
     const html=core.exportujHtml();const re=core.importujHtml(html);assert(re?.ok===true,'image_order_reimport_error');
     assert(re.model.bloky.filter(b=>b.typ==='obrazek').length===1,'image_order_lost');
   }else if(id==='core-mixed-html'){
     importHtml('<p>Nadpis</p><div data-lubanote-v2-todo="true" data-completed="false" data-todo-id="task-q">Ukol</div><pre><code>SAFE_CMD</code></pre>');
     assert(blocks().some(b=>b.typ==='todo'),'mixed_todo_absent');assert(blocks().some(b=>text(b)==='SAFE_CMD'),'mixed_code_absent');
     const output=core.exportujHtml();const re=core.importujHtml(output);assert(re?.ok===true,'mixed_roundtrip_import_error');
     assert(re.model.bloky.some(b=>b.typ==='todo'),'mixed_todo_lost');assert(re.model.bloky.some(b=>text(b)==='SAFE_CMD'),'mixed_code_lost');
     assert(re.model.bloky.some(b=>text(b)==='Nadpis'),'mixed_heading_lost');
   }else throw Error('unknown_test_'+id);
   return 'Skutečný editorCoreV2.js + izolovaný DOM, model i import/export ověřeny. Neověřuje nativní Android/PC uživatelská gesta.';
 }
 (async()=>{
   if(!core?.otevriVHostu||!core?.importujHtml||!core?.exportujHtml||!core?.ziskejModel){send('blocked','production_core_not_loaded');return;}
   for(let i=1;i<=repeats;i++)for(const row of rows){
     const start=performance.now();let reason='';try{
       send('progress',`${i}/${repeats} · ${row.name}`);
       reason=await execute(row.id);row.ok++;
       await sleep(140);
     }catch(e){row.fail++;if(!row.reason)row.reason=`opakování ${i}: ${e?.message||e}`;}
     finally{
       row.ms+=Math.round(performance.now()-start);
       try{core.zavriVHostu?.()}catch(_){}
       try{window.getSelection()?.removeAllRanges()}catch(_){}
     }
   }
   send('done',rows.map(r=>({id:r.id,name:r.name,kind:'REAL_MODULE_690Q_SANDBOX',status:r.fail?(r.pass==='APP_PASS'?'APP_FAIL':'CORE_FAIL'):r.ok===repeats?r.pass:(r.pass==='APP_PASS'?'APP_BLOCKED':'CORE_BLOCKED'),ms:r.ms,detail:`${r.ok}/${repeats} PASS, ${r.fail} FAIL. ${r.reason||'Skutečné produkční moduly v izolovaném DOM; ne úplný scénář V1.'}`})));
 })().catch(e=>send('blocked','fatal_'+String(e?.message||e).slice(0,120)));
}
async function runRepeated(scope='all',shouldContinue=()=>true,onProgress=()=>{},repeats=1){
 repeats=Number.isInteger(Number(repeats))?Math.max(1,Math.min(50,Number(repeats))):1;
 if(!['all','editor','image','i18n'].includes(scope))return blocked('all','invalid_scope');
 if(busy)return blocked(scope,'runner_busy');busy=true;
 const token='690Q-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9);
 const validIds=select(scope),visual=Number(window.LubaNoteAutoTesterVisual690F?.getSpeedFactor?.()||0);
 let frame=null,finished=false,timeout=null,interval=null;
 return new Promise(resolve=>{
   const done=rows=>{if(finished)return;finished=true;clearTimeout(timeout);clearInterval(interval);window.removeEventListener('message',onMessage);try{frame?.remove()}catch(_){}busy=false;resolve(rows)};
   const onMessage=e=>{
     if(!frame||e.source!==frame.contentWindow||e.data?.scope!=='LN_690Q_EXT'||e.data?.token!==token)return;
     if(!shouldContinue()){done(blocked(scope,'interrupted'));return;}
     if(e.data.type==='progress')onProgress(String(e.data.data||'').slice(0,145));
     else if(e.data.type==='blocked')done(blocked(scope,String(e.data.data||'blocked')));
     else if(e.data.type==='done'){
       const rows=e.data.data;
       const valid=Array.isArray(rows)&&rows.length===validIds.length&&new Set(rows.map(r=>r.id)).size===validIds.length&&rows.every(r=>validIds.some(x=>x[0]===r.id)&&['CORE_PASS','CORE_FAIL','CORE_BLOCKED','APP_PASS','APP_FAIL','APP_BLOCKED'].includes(r.status)&&typeof r.detail==='string');
       done(valid?rows.map(r=>({...r,detail:r.detail.slice(0,300)})):blocked(scope,'runner_invalid_results'));
     }
   };
   window.addEventListener('message',onMessage);
   timeout=setTimeout(()=>done(blocked(scope,'timeout')),Math.max(45000,Math.round(90000*Math.max(1,repeats/10)*Math.max(1,visual))));
   interval=setInterval(()=>{if(!shouldContinue())done(blocked(scope,'interrupted'));},250);
   try{
     const url=new URL('editorCoreV2.js?v=690Q',location.href);
     if(url.origin!==location.origin)throw Error('wrong_origin');
     const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
     const csp=`default-src 'none'; script-src 'nonce-${token}'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; font-src 'none'; frame-src 'none'; form-action 'none'`;
     const packs=['cs','en','de','sk','pl','es'].map(lang=>`<script nonce="${esc(token)}" src="${esc(new URL('lang-'+lang+'.js?v=690Q',location.href).href)}"><\/script>`).join('');
     frame=document.createElement('iframe');frame.sandbox='allow-scripts';frame.setAttribute('aria-hidden','true');frame.tabIndex=-1;
     frame.style.cssText='position:fixed;left:-10000px;top:0;width:430px;height:640px;opacity:0;pointer-events:none;border:0';
     frame.srcdoc=`<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${esc(csp)}"><style>html,body{background:#fff;color:#183027;font:20px/1.5 system-ui}body{margin:12px}.ln-v2-editor{display:block;min-height:440px}.ln-v2-odstavec{min-height:46px;padding:7px;border-bottom:1px solid #ddd}[hidden]{display:none!important}</style><script nonce="${esc(token)}" src="${esc(url.href)}"><\/script>${packs}</head><body><div id="lat-690q-host"></div><script nonce="${esc(token)}">(${sandboxRunner.toString()})(${JSON.stringify(token)},${JSON.stringify(scope)},${repeats},${visual});<\/script></body></html>`;
     if(!window.LubaNoteAutoTesterVisual690F?.attachFrame?.(frame))document.body.appendChild(frame);
   }catch(e){done(blocked(scope,'sandbox_'+String(e?.message||e)));}
 });
}
window.LubaNoteAutoTesterExtended690Q=Object.freeze({runRepeated,supportsRepeatCount:true});
})();
