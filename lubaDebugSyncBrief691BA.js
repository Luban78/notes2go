/* 691BA – Admin Debug Hub: kratky kopirovatelny SYNC/REM vypis.
 * Pasivni cteni existujiciho diagnostickeho bufferu; bez RPC, editace
 * poznamek, nativnich alarmu, permission requestu nebo localStorage. */
(() => {
  "use strict";
  const OZNAcENI = "data-ln-sync-brief-691ba";
  const radekSouvisi = (v) => {
    const s = String(v || "");
    return /\|\s*(?:START|END)\s*\|\s*(?:START SYNC FLOW|FAST SYNC CHECK|SYNC TAIL\b|POST-UI START SERVICES)/.test(s) ||
      /\|\s*(?:FAST|REM-FAST|REM-GUARD|REM-COUNT)\s*\|/.test(s) ||
      /\|\s*V2\s*\|\s*(?:691BA|START JOIN|TARGET SYNC|TARGET DELETE|REMOTE DELTA|RECONCILE|START DEFER)/.test(s) ||
      /\|\s*EVENT\s*\|\s*(?:AUTH READY|ACCOUNT ACTIVE|UI READY)/.test(s) ||
      /\|\s*TAG-VD\s*\|\s*(?:REFRESH CHECK|REFRESH CALL|SYNC FAILED)/.test(s);
  };

  async function kopiruj(s) {
    try {
      const plugin = window.Capacitor?.Plugins?.Clipboard;
      if (typeof plugin?.write === "function") {
        await plugin.write({ string: s });
        return true;
      }
    } catch (_error) {}
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(s);
        return true;
      }
    } catch (_error) {}
    const el = document.createElement("textarea");
    el.value = s;
    el.readOnly = true;
    el.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
    document.body.appendChild(el);
    el.focus();
    el.select();
    let ok = false;
    try { ok = document.execCommand("copy") === true; } catch (_error) {}
    el.remove();
    return ok;
  }

  function pripoj() {
    const hub = document.getElementById("ln-debug-hub");
    const footer = hub?.querySelector(".ln-dh-footer");
    if (!footer || footer.querySelector(`[${OZNAcENI}]`)) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute(OZNAcENI, "");
    btn.textContent = "Kopírovat SYNC + připomínky";
    btn.style.gridColumn = "1 / -1";
    btn.title = "Zkopíruje jen časování synchronizace a připomínek z existujícího Debug Hubu";
    btn.addEventListener("click", async () => {
      const radky = window.LubaNoteStartupDiag?.radky?.() || [];
      const vyber = radky.filter(radekSouvisi).slice(-130);
      const report = [
        "LUBANOTE SYNC / REM BRIEF 691BA",
        `verze: ${window.LUBANOTE_VERSION || "DEV"}`,
        `čas: ${new Date().toISOString()}`,
        `řádků: ${vyber.length}`,
        "---",
        ...(vyber.length ? vyber : ["Žádné odpovídající řádky – spusť Start / sync / síť."])
      ].join("\n");
      const puvodni = "Kopírovat SYNC + připomínky";
      const ok = await kopiruj(report);
      btn.textContent = ok ? `Zkopírováno ✓ (${vyber.length} řádků)` : "Kopírování selhalo";
      setTimeout(() => { btn.textContent = puvodni; }, 1400);
    });
    footer.prepend(btn);
  }

  document.addEventListener("lubanote:debug-hub-visibility", (e) => {
    if (e?.detail?.open === true) pripoj();
  });
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", pripoj, { once: true });
  } else {
    pripoj();
  }
})();
