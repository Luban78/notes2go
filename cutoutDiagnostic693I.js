/* 693I: pouze read-only diagnostika na 5 tapu casu (vpravo nahore). */
(() => {
  if (matchMedia('(min-width: 900px)').matches) return;
  let taps = 0, lastTap = 0, shown = false;
  function fmt(x) { return x == null ? 'nezjisteno' : String(x); }
  async function show() {
    if (shown) return;
    shown = true;
    const d = document.createElement('div');
    d.id = 'lnCutoutDiag693I';
    d.style.cssText = 'position:fixed;inset:0;z-index:35000;background:rgba(0,0,0,.78);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;pointer-events:auto';
    const box = document.createElement('div');
    box.style.cssText = 'width:100%;max-width:440px;max-height:85dvh;overflow:auto;background:#17232c;color:#f4f7f9;border:1px solid #617987;border-radius:18px;padding:18px;box-sizing:border-box;font:14px/1.5 system-ui,sans-serif';
    const title = document.createElement('strong'); title.textContent = '693I · Kamera / bezpečná oblast';
    const pre = document.createElement('pre'); pre.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.5 monospace;margin:14px 0'; pre.textContent = 'Zjišťuji…';
    const copy = document.createElement('button'); copy.type='button'; copy.textContent='Kopírovat diagnostiku';
    const close = document.createElement('button'); close.type='button'; close.textContent='Zavřít';
    for (const b of [copy,close]) b.style.cssText='min-height:44px;padding:8px 12px;margin:4px 8px 0 0;border-radius:10px;border:1px solid #6c8796;background:#203843;color:white';
    close.onclick = () => { d.remove(); shown = false; };
    copy.onclick = async () => { const val=pre.textContent; try { await navigator.clipboard.writeText(val);copy.textContent='Zkopírováno'; } catch (_) { const ta=document.createElement('textarea');ta.value=val;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();copy.textContent='Zkopírováno'; } };
    box.append(title,pre,copy,close);d.append(box);document.body.appendChild(d);
    try {
      const plugin = window.Capacitor?.Plugins?.LubaNoteCutoutDiagnostic693I;
      const native = plugin?.read ? await plugin.read() : {error:'Nativní diagnostika není dostupná (nová APK není nainstalována)'};
      const css = getComputedStyle(document.documentElement);
      const probe = document.createElement('div');
      probe.style.cssText='position:fixed;visibility:hidden;padding-top:env(safe-area-inset-top);padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right);padding-bottom:env(safe-area-inset-bottom)';
      document.body.appendChild(probe);const ps=getComputedStyle(probe);
      const cssInsets={top:ps.paddingTop,left:ps.paddingLeft,right:ps.paddingRight,bottom:ps.paddingBottom};probe.remove();
      const header=document.getElementById('lnHomeDateTime683BC')?.getBoundingClientRect();
      pre.textContent='LUBANOTE 693I – VYREZ DISPLEJE (READ-ONLY)\n'+JSON.stringify({native,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio,visualWidth:visualViewport?.width??null,visualHeight:visualViewport?.height??null},cssSafeInsets:cssInsets,header:header?{top:header.top,bottom:header.bottom,left:header.left,right:header.right,height:header.height}:null},null,2);
    } catch(e) { pre.textContent='693I: '+String(e); }
  }
  document.addEventListener('pointerup',(e)=>{
    if(shown||e.pointerType==='mouse'||!e.isPrimary) return;
    const w=innerWidth, x=e.clientX,y=e.clientY;
    if(y>32||x<w*.75) {taps=0;return;}
    const now=Date.now();taps=now-lastTap<650?taps+1:1;lastTap=now;
    if(taps>=5) {taps=0;show();}
  },{capture:true,passive:true});
})();
