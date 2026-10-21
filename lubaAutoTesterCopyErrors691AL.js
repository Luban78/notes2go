/* 691AL – Copy only failed AutoTester diagnostics, without modifying test verdicts. */
(() => {
  'use strict';
  const failure = status => /^(?:FAIL|[A-Z_]+_FAIL)$/.test(status);
  function install() {
    const screen = document.getElementById('ln-auto-tester');
    const actions = screen?.querySelector('.lat-result-actions');
    if (!actions || actions.querySelector('[data-lat-copy-errors]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.latCopyErrors = '1';
    button.textContent = 'Kopírovat chyby';
    button.title = 'Zkopíruje pouze neúspěšné testy a jejich úplnou diagnostiku';
    actions.insertBefore(button, actions.querySelector('[data-lat="copy"]'));
    button.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      const entries = [...screen.querySelectorAll('#lat-list .lat-result[data-status]')];
      const failed = entries.filter(el => failure(el.dataset.status || ''));
      const blocked = entries.filter(el => /(?:^BLOCKED$|_BLOCKED$)/.test(el.dataset.status || ''));
      const header = [
        'LUBANOTE AUTOTESTER – POUZE CHYBY / 691AL',
        `build: ${window.LUBANOTE_VERSION || 'neznamy'}`,
        `cas kopirovani: ${new Date().toISOString()}`,
        `FAIL=${failed.length} BLOCKED=${blocked.length} ZOBRAZENO_TESTU=${entries.length}`
      ];
      const format = el => {
        const title = el.querySelector('.lat-result-title')?.textContent?.trim() || '-';
        const body = el.querySelector('.lat-result-body')?.innerText || el.querySelector('.lat-result-body')?.textContent || '-';
        return `${el.dataset.status} | ${el.dataset.resultId || '-'} | ${title}\n${body.trim()}`;
      };
      const value = [...header, '', failed.length ? failed.map(format).join('\n\n') : 'Zadne testy FAIL.',
        ...(blocked.length ? ['', 'BLOKOVANE TESTY:', blocked.map(format).join('\n\n')] : []),
        '', 'Zkopirovano pouze z vysledku AutoTesteru; ostatni PASS/PARTIAL/AUDIT/NOT_TESTED vynechany.'].join('\n');
      let ok = false;
      try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(value); ok = true; } } catch (_) {}
      if (!ok) {
        const input = document.createElement('textarea');
        input.value = value;
        input.style.cssText = 'position:fixed;left:-10000px;top:0;opacity:0';
        document.body.appendChild(input);
        input.focus(); input.select();
        try { ok = document.execCommand('copy'); } catch (_) {}
        input.remove();
      }
      button.textContent = ok ? 'Chyby zkopírovány ✓' : 'Kopírování selhalo';
      window.setTimeout(() => { if (button.isConnected) button.textContent = 'Kopírovat chyby'; }, 2200);
    });
  }
  let pending = false;
  const observer = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    queueMicrotask(() => { pending = false; install(); });
  });
  const start = () => { observer.observe(document.body, {childList:true,subtree:true}); install(); };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start, {once:true});
})();
