/* LubaNote AutoTester 689E – READ ONLY public GitHub Actions status.
 * No GitHub token, no private API, no workflow dispatch, no database access.
 * This only observes a PREVIOUS GitHub run; a tap does not start SQL tests.
 */
(() => {
  'use strict';
  const ORIGIN='https://api.github.com';
  const ROOT='/repos/Luban78/notes2go';
  const RUNS=ORIGIN+ROOT+'/actions/workflows/autotester-db-lab-689D.yml/runs?branch=main&per_page=5';
  const MAIN=ORIGIN+ROOT+'/commits/main';
  const STALE_MS=7*24*60*60*1000;
  const HEX=/^[0-9a-f]{40}$/i;
  const result=(status,detail='',revision='')=>({
    id:'db-lab-ci-689e',
    name:'PostgreSQL DB LAB – poslední GitHub test',
    kind:'READ_ONLY_GITHUB_CI',
    status,
    detail:String(detail).slice(0,350),
    ms:0,
    revision
  });
  function vyhodnot(runsData,mainData,now=Date.now()){
    const runs=runsData?.workflow_runs;
    const head=String(mainData?.sha||'');
    if(!Array.isArray(runs) || !HEX.test(head)) return result('DB_BLOCKED','Neplatná odpověď GitHubu.');
    if(!runs.length) return result('DB_BLOCKED','Databázová laboratoř ještě nemá žádný běh.');
    const run=runs[0]; // MUST inspect newest run, never silently fall back to an older PASS.
    const sha=String(run?.head_sha||'');
    const id=Number(run?.id);
    if(!HEX.test(sha) || !Number.isSafeInteger(id) || id<=0 || run?.head_branch!=='main')
      return result('DB_BLOCKED','Neplatná identita běhu laboratoře.');
    if(sha!==head) return result('DB_BLOCKED',`Poslední běh je pro starší commit ${sha.slice(0,8)}; MAIN ${head.slice(0,8)}.`,sha.slice(0,8));
    const created=Date.parse(run.created_at||'');
    if(!Number.isFinite(created) || created>now+5*60*1000 || now-created>STALE_MS)
      return result('DB_BLOCKED','Běh je starší než 7 dní nebo má neplatný čas.',sha.slice(0,8));
    const info=`commit ${sha.slice(0,8)} · run ID ${id} · ${new Date(created).toISOString().slice(0,16).replace('T',' ')} UTC`;
    if(run.status!=='completed') return result('DB_BLOCKED',`Databázové testy ještě nejsou dokončené · ${info}`,sha.slice(0,8));
    if(run.conclusion==='success') return result('DB_PASS',`GitHub Actions PASS · ${info}. Ověřený DB LAB scénář (12 kontrol + rollback), nikoli produkční RPC ani test v této APK.`,sha.slice(0,8));
    if(run.conclusion==='failure' || run.conclusion==='timed_out')
      return result('DB_FAIL',`GitHub Actions FAIL · ${info}. Podrobnosti v Actions → 689D → isolated-db-lab.`,sha.slice(0,8));
    return result('DB_BLOCKED',`Běh nemá potvrzený PASS (výsledek: ${['cancelled','skipped','neutral','action_required'].includes(run.conclusion)?run.conclusion:'unknown'}) · ${info}`,sha.slice(0,8));
  }
  async function nacistJson(url,signal){
    const response=await fetch(url,{
      method:'GET',credentials:'omit',cache:'no-store',redirect:'error',
      referrerPolicy:'no-referrer',headers:{'Accept':'application/vnd.github+json'},signal
    });
    if(!response.ok) throw Error(response.status===403?'github_api_limit_or_forbidden':'github_http_'+response.status);
    return await response.json();
  }
  async function zjistiStav(){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),8500);
    try {
      const [runs,main]=await Promise.all([nacistJson(RUNS,controller.signal),nacistJson(MAIN,controller.signal)]);
      return vyhodnot(runs,main);
    } catch (_error) {
      return result('DB_BLOCKED','Nelze ověřit GitHub Actions (offline, omezení API nebo nedostupný GitHub). Žádný PASS se nepředpokládá.');
    } finally {clearTimeout(timer);}
  }
  window.LubaNoteAutoTesterCi689E=Object.freeze({zjistiStav,vyhodnot});
})();
