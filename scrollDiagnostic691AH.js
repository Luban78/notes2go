/* 691AV / 691AH READ-ONLY scroll diagnostic. Visible only in admin Debug Hub; no floating button. */
(() => {
  "use strict";
  const logs = [];
  let running = false, timer = null, last = "";
  const now = () => Math.round(performance.now());
  const editor = () => document.querySelector("[data-ln-v2-editor]");
  const snap = (label, event) => {
    const e = editor(), d = document.scrollingElement;
    const row = e && [...e.querySelectorAll("[data-ln-v2-blok]")].find(r =>
      /Rodič/i.test(r.textContent || "") && r.getBoundingClientRect().height > 0);
    const er = e?.getBoundingClientRect(), rr = row?.getBoundingClientRect();
    const active = document.activeElement;
    const data = {
      t:now(), label, type:event?.type || "", target:(()=>{const t=event?.target?.closest?.("[data-v2-list-toggle],[data-v2-list-marker],[data-ln-v2-blok]");return t ? (t.tagName||"")+":"+(t.hasAttribute("data-v2-list-toggle")?"TOGGLE":t.hasAttribute("data-v2-list-marker")?"MARKER":"ROW") : "";})(),
      editorScroll:e?.scrollTop, editorMax:e ? e.scrollHeight-e.clientHeight : null,
      editorHeight:e?.clientHeight, editorRect:er ? [Math.round(er.top),Math.round(er.bottom)] : null,
      parentY:rr ? Math.round(rr.top) : null, parentH:rr ? Math.round(rr.height) : null,
      docScroll:d?.scrollTop, windowY:window.scrollY,
      visualY:window.visualViewport?.offsetTop, visualH:window.visualViewport?.height,
      active:active?.tagName + (active?.id ? "#"+active.id : ""),
      selection:String(window.getSelection?.() || "").length
    };
    const s=JSON.stringify(data);
    if(s!==last){logs.push(s);last=s;}
    if(logs.length>350) logs.shift();
  };
  const btn=document.createElement("button");
  btn.textContent="Diagnostika scrollu";
  btn.type="button";
  btn.className="ln-dh-copy";
  btn.style.gridColumn="1 / -1";
  btn.title="Diagnostika scrollu – spusť v Debug Hubu, zavři Hub, proveď gesto, znovu otevři a ukonči pro kopii";
  /* The existing Debug Hub emits a visibility event only after server-side
   * admin authorisation. Never mount this control into normal user UI. */
  document.addEventListener("lubanote:debug-hub-visibility",(event)=>{
    if(event?.detail?.open!==true || window.LubaNoteAdminTools?.isAllowed?.()!==true)return;
    const hub=document.getElementById("ln-debug-hub");
    const footer=hub?.querySelector(".ln-dh-footer");
    if(footer&&!footer.contains(btn))footer.appendChild(btn);
  });
  const listeners=[];
  function observe(target,type,fn,opts){target?.addEventListener(type,fn,opts);listeners.push(()=>target?.removeEventListener(type,fn,opts));}
  function stop(){
    running=false;clearInterval(timer);listeners.splice(0).forEach(f=>f());
    snap("STOP");
    const report="LUBANOTE 691AH SCROLL DIAGNOSTIC\n"+navigator.userAgent+"\n"+logs.join("\n");
    const fallback=()=>{
      const ta=document.createElement("textarea");ta.value=report;ta.style.cssText="position:fixed;inset:10%;width:80%;height:70%;z-index:2147483647;background:white;color:black";
      document.body.appendChild(ta);ta.focus();ta.select();try{document.execCommand("copy")}catch(_){} 
      setTimeout(()=>ta.remove(),1200);
    };
    if(navigator.clipboard?.writeText)navigator.clipboard.writeText(report).catch(fallback);else fallback();
    btn.textContent="Report zkopírován";
  }
  btn.addEventListener("click",()=>{
    if(running){stop();return;}
    logs.length=0;last="";running=true;btn.textContent="Ukončit a kopírovat";
    snap("START");
    const e=editor();
    for(const [target,name] of [[e,"editor"],[document,"document"],[window,"window"]]){
      for(const type of ["scroll","touchstart","touchend","pointerdown","pointerup","click"]){
        observe(target,type,ev=>snap(name+":"+type,ev),{capture:true,passive:true});
      }
    }
    observe(window.visualViewport,"resize",()=>snap("viewport:resize"),{passive:true});
    observe(window.visualViewport,"scroll",()=>snap("viewport:scroll"),{passive:true});
    timer=setInterval(()=>snap("SAMPLE"),60);
  });
})();