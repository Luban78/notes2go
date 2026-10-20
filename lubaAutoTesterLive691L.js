/* 691L: real note-list text search, on AutoTester-owned LOCAL Testy note only. */
(()=>{'use strict';
const cases=[['ui-livel-ready','Seznam – připravit vlastní poznámku'],['ui-livel-title','Seznam – hledat text názvu'],['ui-livel-missing','Seznam – neexistující text'],['ui-livel-clear','Seznam – zrušit hledání'],['ui-livel-preserve','Seznam – zachovat původní poznámku']];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const check=(v,msg)=>{if(!v)throw Error(msg)};
const cards=()=>[...document.querySelectorAll('#pinnedCards .taskCard')];
const input=()=>document.getElementById('searchNotes');
const clear=()=>document.getElementById('clearSearchButton');
const note=id=>window.loadTask?.().find(t=>t.id===id&&t.storageScope==='local'&&t.isSecret!==true&&t.tags?.includes('Testy')&&String(t.title||'').startsWith('[AutoTester 690T]'));
const refresh=async()=>{window.renderTasks?.();await wait(130)};
const type=async v=>{const el=input();el.dispatchEvent(new KeyboardEvent('keydown',{key:'a',bubbles:true}));el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));await wait(160)};
async function run(id,alive=()=>true,progress=()=>{}){
 const rows=[];let broken=false;const original=input()?.value||'';const wasActive=!!window.LubaNoteSearch?.jeAktivniDotaz?.();
 try{
 for(let i=0;i<cases.length;i++){
 const [key,name]=cases[i],t=performance.now();progress(name);
 if(!alive())throw Error('beh_prerusen');
 if(broken){rows.push({id:key,name,kind:'REAL_NOTES_TEXT_SEARCH_691L',status:'APP_BLOCKED',ms:0,detail:'Predchozi krok selhal'});continue}
 try{
 const n=note(id);check(n,'chybi_vlastni_LOCAL_Testy_poznamka');check(document.getElementById('taskModal')?.hidden===true,'editor_je_otevren');check(input()&&clear()&&typeof window.renderTasks==='function','chybi_produkcni_hledani');
 let evidence='';
 if(i===0){check(!wasActive&&!original.trim(),'vyhledavani_jiz_pouziva_uzivatel');await refresh();check(cards().some(c=>c.textContent.includes(n.title)),'testovaci_poznamka_neni_ve_stavajicim_filtru');evidence='Vlastni LOCAL Testy poznamka je v aktualnim seznamu; stavajici filtr zustava beze zmen.'}
 if(i===1){const q=n.title;await type(q);check(window.LubaNoteSearch.jeAktivniDotaz(),'dotaz_nebyl_aktivovan');check(cards().length>0&&cards().every(c=>c.textContent.toLowerCase().includes(q.toLowerCase())),'vysledky_neodpovidaji_textu_nazvu');evidence='Skutecny search.js filtroval vykreslene karty podle textu nazvu, nikoli stitku.'}
 if(i===2){await type('AT691L_NO_MATCH_'+Date.now());check(cards().length===0,'neexistujici_text_nevratil_nula_karet');check(document.getElementById('noSearchResults')?.hidden===false,'nezobrazen_prazdny_vysledek');evidence='Neexistujici text vratil nula karet a produkcni empty-state.'}
 if(i===3){clear().click();await wait(160);check(!window.LubaNoteSearch.jeAktivniDotaz()&&!input().value,'hledani_nebylo_zruseno');check(cards().some(c=>c.textContent.includes(n.title)),'puvodni_seznam_neobnoven');evidence='Skutecny krizik ukoncil hledani a obnovil seznam.'}
 if(i===4){check(!!note(id),'testovaci_poznamka_nebyla_zachovana');evidence='Testovaci LOCAL poznamka zustala ulozena; stitky ani uzivatelska data se nemenila.'}
 rows.push({id:key,name,kind:'REAL_NOTES_TEXT_SEARCH_691L',status:'APP_PASS',ms:Math.round(performance.now()-t),detail:evidence+' Programove udalosti ve skutecnem UI; ne fyzicky prst.'});
 }catch(e){broken=true;rows.push({id:key,name,kind:'REAL_NOTES_TEXT_SEARCH_691L',status:'APP_FAIL',ms:Math.round(performance.now()-t),detail:String(e.message||e).slice(0,200)})}
 }
 }finally{
 // Only reset the search when this test started from an empty, inactive search.
 if(!wasActive&&!original.trim()&&input()&&clear()&&window.LubaNoteSearch?.jeAktivniDotaz?.())clear().click();
 }
 return rows;
}
window.LubaNoteAutoTesterLive691L=Object.freeze({run});
})();
