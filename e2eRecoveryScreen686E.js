/* LubaNote 686E – TEST-only full-screen E2E Recovery diagnostics.
 * UI only: no E2E password change, no keys/notes mutation.
 * Keeps the existing Debug Hub intact and intercepts its TEST launch button.
 */
(() => {
  "use strict";

  if (String(window.location.hostname || "").toLowerCase() !== "test.lubanote.com") return;

  const IDENTIFIKATOR = "ln686e-recovery-screen";
  let obrazovka = null;
  let predchoziFocus = null;
  let puvodniOverflow = null;
  let posledniReport = "";
  let lzeOverovat = false;
  let generace = 0;

  const styl = document.createElement("style");
  styl.id = "ln686e-recovery-style";
  styl.textContent = `
    /* 686E: old 686C embedded UI is superseded by a separate screen. */
    #ln-debug-hub [data-dh-e2e-recovery-result],
    #ln-debug-hub [data-dh-e2e-reauth-panel],
    #ln-debug-hub [data-dh="e2e-recovery-copy"] { display: none !important; }

    #${IDENTIFIKATOR}, #${IDENTIFIKATOR} * { box-sizing: border-box; }
    #${IDENTIFIKATOR} {
      position: fixed !important; inset: 0 !important;
      top: var(--ln686e-visual-top, 0px) !important;
      bottom: auto !important;
      width: 100vw !important; height: var(--ln686e-visual-height, 100dvh) !important;
      max-width: none !important; max-height: none !important;
      z-index: 2147483647 !important;
      display: flex !important; flex-direction: column !important;
      color: #edf7f2 !important;
      background: #091714 !important;
      font-family: system-ui, -apple-system, Roboto, sans-serif !important;
      text-align: left !important;
      overflow: hidden !important;
      isolation: isolate !important;
      color-scheme: dark !important;
    }
    #${IDENTIFIKATOR}[hidden] { display: none !important; }
    #${IDENTIFIKATOR} .ln686e-head {
      flex: 0 0 auto; display: flex; align-items: center; gap: 12px;
      border-bottom: 1px solid #2a5b45; background: #0a241d;
      padding: calc(12px + env(safe-area-inset-top, 0px)) 16px 12px;
    }
    #${IDENTIFIKATOR} .ln686e-back {
      flex: 0 0 auto; color: #e7fff2; background: #143728;
      border: 1px solid #368b5d; border-radius: 11px;
      font-size: 15px; min-height: 45px; padding: 8px 12px;
      font-weight: 700;
    }
    #${IDENTIFIKATOR} .ln686e-headtitle { min-width: 0; }
    #${IDENTIFIKATOR} .ln686e-headtitle strong {
      display:block; font-size: 17px; line-height: 1.3;
    }
    #${IDENTIFIKATOR} .ln686e-badge {
      display: inline-block; font-size: 11px; font-weight: 800;
      color: #ffe4b5; letter-spacing: .04em; padding-top: 3px;
    }
    #${IDENTIFIKATOR} .ln686e-body {
      flex: 1 1 auto; min-height: 0; overflow-y: auto !important;
      overflow-x: hidden !important; overscroll-behavior: contain;
      -webkit-overflow-scrolling: touch; touch-action: pan-y;
      padding: 20px 16px calc(30px + env(safe-area-inset-bottom, 0px));
    }
    #${IDENTIFIKATOR} .ln686e-wrap { max-width: 600px; margin: 0 auto; display: grid; gap: 16px; }
    #${IDENTIFIKATOR} .ln686e-card {
      background: #10241e; border: 1px solid #2c6048;
      border-radius: 15px; padding: 16px; min-width: 0;
    }
    #${IDENTIFIKATOR} h2 {
      font-size: 16px; font-weight: 750; margin: 0 0 10px; color: #c9f7df;
    }
    #${IDENTIFIKATOR} p { margin: 7px 0 14px; line-height: 1.48; font-size: 14px; color: #d0ddd6; }
    #${IDENTIFIKATOR} .ln686e-state { font-weight: 750; font-size: 16px; margin: 8px 0 12px; }
    #${IDENTIFIKATOR} .ln686e-state[data-result="pass"] { color: #3df49a; }
    #${IDENTIFIKATOR} .ln686e-state[data-result="fail"] { color: #ffc080; }
    #${IDENTIFIKATOR} .ln686e-row {
      display:flex; align-items:center; justify-content:space-between;
      gap: 10px; padding: 10px 0; border-bottom: 1px solid #294134;
      font-size: 14px;
    }
    #${IDENTIFIKATOR} .ln686e-row:last-child { border-bottom: none; }
    #${IDENTIFIKATOR} .ln686e-pass { color: #3df49a; font-weight: 800; }
    #${IDENTIFIKATOR} .ln686e-fail { color: #ffc080; font-weight: 800; }
    #${IDENTIFIKATOR} input {
      width: 100%; min-width:0; border: 1px solid #5b9373; border-radius: 10px;
      background: #091714; padding: 14px 13px; color: #f7fff9; font-size: 16px;
      min-height: 50px; margin: 5px 0 12px;
    }
    #${IDENTIFIKATOR} input::placeholder { color: #bac9c0; }
    #${IDENTIFIKATOR} label { display:block; font-size: 14px; font-weight: 700; margin-top: 7px; }
    #${IDENTIFIKATOR} button {
      min-height: 46px; border-radius: 10px; padding: 11px 13px;
      font: inherit; font-size: 15px; font-weight: 750; cursor: pointer;
    }
    #${IDENTIFIKATOR} button:disabled { opacity: .45; cursor: default; }
    #${IDENTIFIKATOR} .ln686e-primary {
      width: 100%; border: 1px solid #33e18a; color: #041b10; background: #27e98b;
    }
    #${IDENTIFIKATOR} .ln686e-secondary {
      width: 100%; border: 1px solid #368b5d; color: #dcffe8; background: #12392a;
    }
    #${IDENTIFIKATOR} .ln686e-note { font-size: 12px; color: #b3c8bc; }
    #${IDENTIFIKATOR} .ln686e-actions { display: grid; gap: 10px; }
    #${IDENTIFIKATOR} .ln686e-report {
      white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word;
      font-size: 12px; line-height: 1.45; padding: 12px;
      border: 1px solid #294d3c; background: #071310; border-radius: 9px;
      max-height: 220px; overflow-y: auto; margin: 12px 0 0;
    }
    @media (min-width: 600px) {
      #${IDENTIFIKATOR} .ln686e-body { padding-top: 30px; }
      #${IDENTIFIKATOR} .ln686e-head { justify-content: center; }
    }
  `;
  document.head.appendChild(styl);

  function pripravObrazovku() {
    if (obrazovka) return obrazovka;
    const sekce = document.createElement("section");
    sekce.id = IDENTIFIKATOR;
    sekce.hidden = true;
    sekce.setAttribute("role", "dialog");
    sekce.setAttribute("aria-modal", "true");
    sekce.setAttribute("aria-label", "E2E Recovery testovací obrazovka");
    sekce.innerHTML = `
      <header class="ln686e-head">
        <button type="button" class="ln686e-back" data-ln686e="back">← Zpět</button>
        <div class="ln686e-headtitle">
          <strong>🔐 E2E Recovery</strong>
          <span class="ln686e-badge">TEST WEB · 686E · READ-ONLY</span>
        </div>
      </header>
      <div class="ln686e-body">
        <div class="ln686e-wrap">
          <section class="ln686e-card">
            <h2>1. Připravenost zařízení</h2>
            <div class="ln686e-state" data-ln686e-status role="status" aria-live="polite">Čekám na kontrolu…</div>
            <div data-ln686e-checks></div>
            <button type="button" class="ln686e-secondary" data-ln686e="check">Zopakovat kontrolu</button>
          </section>
          <section class="ln686e-card">
            <h2>2. Ověření hesla k účtu</h2>
            <p>Pro další krok je potřeba přihlašovací heslo <b>testovacího účtu</b>. E2E heslo se nemění.</p>
            <label for="ln686e-password">Přihlašovací heslo</label>
            <input type="password" id="ln686e-password" data-ln686e-password
              autocomplete="off" autocapitalize="off" spellcheck="false"
              placeholder="Zadej heslo k účtu" disabled>
            <button type="button" class="ln686e-primary" data-ln686e="verify" disabled>Ověřit heslo k účtu</button>
            <div class="ln686e-state" data-ln686e-auth-status role="status" aria-live="polite"></div>
            <p class="ln686e-note">Heslo se neukládá ani neobjeví v reportu. Samotný test nic neobnovuje.</p>
          </section>
          <section class="ln686e-card">
            <h2>3. Report</h2>
            <div class="ln686e-actions">
              <button type="button" class="ln686e-secondary" data-ln686e="copy" disabled>Kopírovat E2E report</button>
            </div>
            <pre class="ln686e-report" data-ln686e-report>Výsledek zatím není dostupný.</pre>
          </section>
          <p class="ln686e-note">PASS je pouze test předpokladů a přihlašovacího hesla. Není to hotová obnova zapomenutého E2E hesla.</p>
        </div>
      </div>
    `;
    document.body.appendChild(sekce);
    sekce.addEventListener("click", async (event) => {
      const tlacitko = event.target.closest("button[data-ln686e]");
      if (!tlacitko) return;
      const akce = tlacitko.dataset.ln686e;
      if (akce === "back") { zavriObrazovku(); return; }
      if (akce === "check") { await spustPreflight(); return; }
      if (akce === "verify") { await overHeslo(); return; }
      if (akce === "copy") { await zkopirujReport(tlacitko); }
    });
    obrazovka = sekce;
    return sekce;
  }

  function prvek(selector) { return obrazovka?.querySelector(selector) || null; }
  function nastavReport(report) {
    posledniReport = report;
    const element = prvek("[data-ln686e-report]");
    if (element) element.textContent = report;
    const kopirovat = prvek('[data-ln686e="copy"]');
    if (kopirovat) kopirovat.disabled = !report;
  }
  function radek(nazev, hodnota) {
    const ok = hodnota === true;
    return `<div class="ln686e-row"><span>${nazev}</span><strong class="${ok ? "ln686e-pass" : "ln686e-fail"}">${ok ? "PASS ✓" : "FAIL —"}</strong></div>`;
  }
  function pripravText(stav) {
    const anoNe = (v) => v === true ? "PASS" : "FAIL";
    return [
      "LUBANOTE 686E – E2E RECOVERY PREFLIGHT (READ-ONLY)",
      "Vysledek: " + (stav.ok ? "PREFLIGHT PASS" : "PREFLIGHT FAIL"),
      "rootReady: " + anoNe(stav.rootReady),
      "deviceKekReady: " + anoNe(stav.deviceKekReady),
      "localEnvelope: " + anoNe(stav.localEnvelope),
      "serverEnvelope: " + anoNe(stav.serverEnvelope),
      "sameKeyId: " + anoNe(stav.sameKeyId),
      "online: " + anoNe(stav.online),
      "reason: " + String(stav.reason || "none").slice(0, 80),
      "POZOR: Preflight PASS neni dukaz vlastnictvi zarizeni ani hotova obnova hesla."
    ].join("\n");
  }

  async function spustPreflight() {
    if (!obrazovka || obrazovka.hidden) return;
    const mojeGenerace = ++generace;
    lzeOverovat = false;
    const status = prvek("[data-ln686e-status]");
    const obsah = prvek("[data-ln686e-checks]");
    const heslo = prvek("[data-ln686e-password]");
    const overit = prvek('[data-ln686e="verify"]');
    const znovu = prvek('[data-ln686e="check"]');
    const auth = prvek("[data-ln686e-auth-status]");
    if (heslo) { heslo.value = ""; heslo.disabled = true; }
    if (overit) overit.disabled = true;
    if (znovu) znovu.disabled = true;
    if (auth) { auth.textContent = ""; auth.removeAttribute("data-result"); }
    if (status) { status.textContent = "Kontroluji…"; status.removeAttribute("data-result"); }
    if (obsah) obsah.textContent = "";
    nastavReport("");
    let stav;
    try {
      const kontrola = window.LubaNoteE2ECore?.recoveryPreflight;
      stav = typeof kontrola === "function"
        ? await kontrola()
        : { ok: false, reason: "recovery_preflight_unavailable" };
    } catch (_chyba) {
      stav = { ok: false, reason: "preflight_failed" };
    }
    if (mojeGenerace !== generace || !obrazovka || obrazovka.hidden) return;
    lzeOverovat = stav.ok === true;
    if (status) {
      status.textContent = stav.ok ? "PREFLIGHT PASS ✓" : "PREFLIGHT FAIL – zkontroluj podmínky";
      status.dataset.result = stav.ok ? "pass" : "fail";
    }
    if (obsah) obsah.innerHTML = [
      radek("Root Key", stav.rootReady),
      radek("Klíč zařízení", stav.deviceKekReady),
      radek("Lokální obálka", stav.localEnvelope),
      radek("Serverová obálka", stav.serverEnvelope),
      radek("Shoda Root Key", stav.sameKeyId),
      radek("Online", stav.online)
    ].join("");
    if (heslo) heslo.disabled = !lzeOverovat;
    if (overit) overit.disabled = !lzeOverovat;
    if (znovu) znovu.disabled = false;
    nastavReport(pripravText(stav));
  }

  async function overHeslo() {
    if (!lzeOverovat || !obrazovka || obrazovka.hidden) return;
    const pole = prvek("[data-ln686e-password]");
    const stavText = prvek("[data-ln686e-auth-status]");
    const tlacitko = prvek('[data-ln686e="verify"]');
    const znovu = prvek('[data-ln686e="check"]');
    const heslo = pole?.value || "";
    if (pole) pole.value = ""; // Do not retain the password in the DOM.
    if (!heslo) {
      if (stavText) { stavText.textContent = "Zadej přihlašovací heslo."; stavText.dataset.result = "fail"; }
      return;
    }
    const mojeGenerace = ++generace;
    if (tlacitko) { tlacitko.disabled = true; tlacitko.textContent = "Ověřuji…"; }
    if (znovu) znovu.disabled = true;
    if (pole) pole.disabled = true;
    if (stavText) { stavText.textContent = "Ověřuji heslo u serveru…"; stavText.removeAttribute("data-result"); }
    let overeni;
    try {
      const funkce = window.LubaNoteE2ECore?.overHesloUctuProRecovery;
      overeni = typeof funkce === "function"
        ? await funkce(heslo)
        : { ok: false, reason: "reauth_unavailable" };
    } catch (_chyba) {
      overeni = { ok: false, reason: "reauth_failed" };
    }
    if (mojeGenerace !== generace || !obrazovka || obrazovka.hidden) return;
    if (stavText) {
      stavText.textContent = overeni.ok ? "PŘIHLAŠOVACÍ HESLO – PASS ✓" : "PŘIHLAŠOVACÍ HESLO – FAIL";
      stavText.dataset.result = overeni.ok ? "pass" : "fail";
    }
    const zaklad = posledniReport.replace(/\naccountPassword: (PASS|FAIL)[\s\S]*$/, "");
    nastavReport(zaklad + "\naccountPassword: " + (overeni.ok ? "PASS" : "FAIL") +
      "\naccountPasswordReason: " + String(overeni.reason || "none").slice(0, 80) +
      "\nE2E keys/notes unchanged: YES" +
      "\nPOZOR: Pri skutecne obnove je nutne heslo znovu overit.");
    if (tlacitko) { tlacitko.disabled = false; tlacitko.textContent = "Ověřit heslo k účtu"; }
    if (znovu) znovu.disabled = false;
    if (pole) pole.disabled = false;
  }

  async function zkopirujReport(tlacitko) {
    if (!posledniReport) return;
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(posledniReport);
        ok = true;
      }
    } catch (_chyba) {}
    if (!ok) {
      const pole = document.createElement("textarea");
      pole.value = posledniReport;
      pole.setAttribute("readonly", "");
      pole.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
      document.body.appendChild(pole);
      pole.select();
      try { ok = document.execCommand("copy") === true; } catch (_chyba) {}
      pole.remove();
    }
    const puvodniText = tlacitko.textContent;
    tlacitko.textContent = ok ? "Zkopírováno ✓" : "Kopírování selhalo";
    setTimeout(() => {
      if (tlacitko?.isConnected) tlacitko.textContent = puvodniText;
    }, 1400);
  }

  /* On mobile, the virtual keyboard may shrink only the visual viewport.
     Limit the recovery screen to the actually visible height. */
  function aktualizujViditelnouVysku() {
    if (!obrazovka || obrazovka.hidden) return;
    const v = window.visualViewport;
    if (!v || !Number.isFinite(v.height) || v.height < 100) return;
    obrazovka.style.setProperty("--ln686e-visual-height", `${Math.round(v.height)}px`);
    obrazovka.style.setProperty("--ln686e-visual-top", `${Math.round(v.offsetTop || 0)}px`);
  }
  window.visualViewport?.addEventListener("resize", aktualizujViditelnouVysku);
  window.visualViewport?.addEventListener("scroll", aktualizujViditelnouVysku);
  window.addEventListener("resize", aktualizujViditelnouVysku);

  function otevriObrazovku() {
    const panel = pripravObrazovku();
    if (!panel.hidden) return;
    predchoziFocus = document.activeElement;
    puvodniOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.hidden = false;
    aktualizujViditelnouVysku();
    panel.querySelector('[data-ln686e="back"]')?.focus({ preventScroll: true });
    void spustPreflight();
  }

  function zavriObrazovku() {
    if (!obrazovka || obrazovka.hidden) return;
    ++generace;
    obrazovka.hidden = true;
    const pole = prvek("[data-ln686e-password]");
    if (pole) pole.value = "";
    document.body.style.overflow = puvodniOverflow === null ? "" : puvodniOverflow;
    predchoziFocus?.focus?.({ preventScroll: true });
  }

  /* Capture before the old Debug Hub's own click handler (the latter stays untouched). */
  document.addEventListener("click", (event) => {
    const tlacitko = event.target.closest?.('#ln-debug-hub button[data-dh="e2e-recovery-test"]');
    if (!tlacitko) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    otevriObrazovku();
  }, true);

  function aktualizujSpoustec() {
    const tlacitko = document.querySelector('#ln-debug-hub button[data-dh="e2e-recovery-test"]');
    if (tlacitko) tlacitko.textContent = "🔐 E2E Recovery – otevřít obrazovku";
  }
  const pozorovatel = new MutationObserver(aktualizujSpoustec);
  pozorovatel.observe(document.body, { childList: true, subtree: false });
  aktualizujSpoustec();

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !obrazovka || obrazovka.hidden) return;
    event.preventDefault();
    zavriObrazovku();
  }, true);
})();
