/* LubaNote 686G – TEST-only full-screen E2E Recovery diagnostics.
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
  let reautentizaceOk = false;
  let rootDryRunOk = false;
  let newPasswordTestOk = false;
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
          <span class="ln686e-badge">TEST WEB · 686M · STORAGE/MEDIA DRY-RUN</span>
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
            <h2>3. Kryptografická zkouška bez zápisu</h2>
            <p>Po ověření přihlašovacího hesla zkusíme skutečně rozbalit Root Key a znovu jej zabalit <b>pouze v paměti telefonu</b>. Žádné heslo ani šifrování poznámek se nemění.</p>
            <button type="button" class="ln686e-primary" data-ln686e="dry-run" disabled>Ověřit rozbalení a nové zabalení</button>
            <div class="ln686e-state" data-ln686e-dry-status role="status" aria-live="polite"></div>
            <p class="ln686e-note">Použije se náhodný dočasný klíč, nikoliv tvoje nové E2E heslo. Výsledek je zkouška, ne obnova.</p>
          </section>
          <section class="ln686e-card">
            <h2>4. Zkouška nového E2E hesla – BEZ ZÁPISU</h2>
            <p>Teď už zkusíme <b>opravdové nové E2E heslo</b>. Jen v paměti telefonu z něj odvodíme nový ochranný klíč a ověříme znovuzabalení stejného Root Key.</p>
            <p class="ln686e-note">Toto ještě <b>není změna hesla</b>. Heslo se nikam neuloží a po dokončení jej bude potřeba při skutečné obnově zadat znovu. Použij pouze testovací účet.</p>
            <label for="ln686g-new-password">Nové E2E heslo (alespoň 12 znaků)</label>
            <input type="password" id="ln686g-new-password" data-ln686g-new-password
              autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Nové E2E heslo" disabled>
            <label for="ln686g-confirm-password">Zopakuj nové E2E heslo</label>
            <input type="password" id="ln686g-confirm-password" data-ln686g-confirm-password
              autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Zopakovat heslo" disabled>
            <button type="button" class="ln686e-primary" data-ln686e="new-password-test" disabled>Otestovat nové E2E heslo</button>
            <div class="ln686e-state" data-ln686g-status role="status" aria-live="polite"></div>
            <p class="ln686e-note">Stará data Secret a média mohou používat jiný klíč. Před skutečným resetem je nutná samostatná bezpečnostní kontrola.</p>
          </section>
          <section class="ln686e-card">
            <h2>5. 686H – Kontrola starších šifrovaných dat</h2>
            <p>Před změnou hlavního hesla zjistíme, zda jsou v účtu starší Secret poznámky, tajné štítky, média nebo Shared klíče závislé na původním hesle. Kontrolujeme pouze počty a metadata; žádná data se nemažou ani nepřepisují.</p>
            <button type="button" class="ln686e-secondary" data-ln686e="legacy-audit" disabled>Zkontrolovat rizika změny hesla</button>
            <div class="ln686e-state" data-ln686h-status role="status" aria-live="polite"></div>
            <div data-ln686h-checks></div>
            <p class="ln686e-note">686H je výhradně diagnostika. Ani úspěšná kontrola nepovolí přepsání hesla. TEST web nemusí znamenat samostatnou databázi.</p>
          </section>
          <section class="ln686e-card">
            <h2>6. 686I – Backend a Shared identita</h2>
            <p>Nový samostatný TEST, bez opakování 686G. Zjistí skutečnou adresu API a ověří existující Shared identitu bez jakéhokoli zápisu.</p>
            <button type="button" class="ln686e-secondary" data-ln686e="backend-shared-audit">Zkontrolovat backend a Shared klíč</button>
            <div class="ln686e-state" data-ln686i-status role="status" aria-live="polite"></div>
            <p class="ln686e-note" data-ln686i-backend style="white-space:pre-wrap"></p>
            <div data-ln686i-checks></div>
            <p class="ln686e-note">TEST web ani název profilu nedokazují samostatnou databázi. Změna hlavního hesla zůstává zakázaná. Kontrola pouze čte šifrovanou obálku a ověřuje klíče v paměti.</p>
          </section>
          <section class="ln686e-card">
            <h2>7. 686J – Shared klíč pod novým heslem (BEZ ZÁPISU)</h2>
            <p>Bez opakování 686G: ověříme, že <b>stejný původní Shared klíč</b> lze dočasně ochránit novým E2E heslem, znovu rozbalit a porovnat s jeho veřejným klíčem.</p>
            <label for="ln686j-new">Nové testovací E2E heslo (alespoň 8 znaků)</label>
            <input type="password" id="ln686j-new" data-ln686j-new
              autocomplete="off" autocapitalize="off" spellcheck="false"
              placeholder="Nové E2E heslo pro suchý test">
            <label for="ln686j-confirm">Zopakuj heslo</label>
            <input type="password" id="ln686j-confirm" data-ln686j-confirm
              autocomplete="off" autocapitalize="off" spellcheck="false"
              placeholder="Zopakovat nové heslo">
            <button type="button" class="ln686e-secondary" data-ln686e="shared-rewrap-dry-run">Otestovat přebalení Shared klíče</button>
            <div class="ln686e-state" data-ln686j-status role="status" aria-live="polite"></div>
            <div data-ln686j-checks></div>
            <p class="ln686e-note">TEST bez zápisu: nový salt, obálka a heslo se <b>neukládají</b>. Heslo zůstává nezměněno a další ochrana Secret/médií ještě není vyřešená. TEST a PROD mohou sdílet databázi.</p>
          </section>
          <section class="ln686e-card">
            <h2>8. 686K – Inventura Secret a médií (BEZ ZÁPISU)</h2>
            <p>Jedním tlačítkem zkontrolujeme počty Secret dat a serverové značky šifrovaných fotografií. Nečteme fotografie ani text poznámek; šifrovaný obsah E2E poznámek nelze takto prozkoumat. Nuly proto neznamenají důkaz, že stará média neexistují.</p>
            <button type="button" class="ln686e-secondary" data-ln686e="secret-media-audit">Zkontrolovat Secret a média</button>
            <div class="ln686e-state" data-ln686k-status role="status" aria-live="polite"></div>
            <div data-ln686k-checks></div>
            <p class="ln686e-note">READ-ONLY. TEST a PROD mohou sdílet databázi. Změna hesla není povolená, dokud nebude bezpečně prověřen i skrytý obsah médií.</p>
          </section>
          <section class="ln686e-card">
            <h2>9. 686L – Ověření čitelnosti médií (BEZ ZÁPISU)</h2>
            <p>Ověříme skutečné rozšifrování starého mediálního trezoru i případných trezorů uvnitř E2E poznámek. Fotografie se nezobrazí ani neuloží. Test čte jen záznamy tohoto účtu a nic nemění.</p>
            <button type="button" class="ln686e-secondary" data-ln686e="media-content-proof">Ověřit čitelnost médií</button>
            <div class="ln686e-state" data-ln686l-status role="status" aria-live="polite"></div>
            <div data-ln686l-checks></div>
            <p class="ln686e-note">Kontrola je pouze pro přímé poznámky účtu (max. 30). Soubory Storage a sdílené poznámky zatím nejsou zahrnuté. Ani PASS nedovoluje změnit E2E heslo.</p>
          </section>
          <section class="ln686e-card">
            <h2>10. 686M – Storage a nové heslo pro média (BEZ ZÁPISU)</h2>
            <p>V jednom kroku sečteme přístupné přílohy v uživatelské cestě Storage a vyzkoušíme, že staré šifrované médium lze znovu otevřít po dočasném přebalení pod novým E2E heslem. Bez změny stávajících dat.</p>
            <label for="ln686m-new">Nové testovací E2E heslo (alespoň 8 znaků)</label>
            <input type="password" id="ln686m-new" data-ln686m-new autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Heslo jen pro bezpečný test">
            <label for="ln686m-confirm">Zopakuj heslo</label>
            <input type="password" id="ln686m-confirm" data-ln686m-confirm autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Zopakovat heslo">
            <button type="button" class="ln686e-secondary" data-ln686e="storage-media-rewrap">Prověřit Storage a přebalení média</button>
            <div class="ln686e-state" data-ln686m-status role="status" aria-live="polite"></div>
            <div data-ln686m-checks></div>
            <p class="ln686e-note">READ-ONLY. Kontrola Storage je omezená na bucket lubanote-attachments a složku tohoto účtu (metadata, ne obsah souborů). Ostatní buckety, sdílené položky a úplná integrita Storage zůstávají neověřené. Změna hesla není povolená ani při PASS.</p>
          </section>
          <section class="ln686e-card">
            <h2>11. Report</h2>
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
      if (akce === "dry-run") { await spustDryRun(); return; }
      if (akce === "new-password-test") { await spustNoveHesloDryRun(); return; }
      if (akce === "legacy-audit") { await spustLegacyAudit686H(); return; }
      if (akce === "backend-shared-audit") { await spustBackendSharedAudit686I(); return; }
      if (akce === "shared-rewrap-dry-run") { await spustSharedRewrap686J(); return; }
      if (akce === "secret-media-audit") { await spustSecretMediaAudit686K(); return; }
      if (akce === "media-content-proof") { await spustMediaProof686L(); return; }
      if (akce === "storage-media-rewrap") { await spustStorageMedia686M(); return; }
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
      "LUBANOTE 686G – E2E RECOVERY PREFLIGHT (READ-ONLY)",
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
    reautentizaceOk = false;
    rootDryRunOk = false;
    newPasswordTestOk = false;
    resetujLegacyAudit686H();
    resetujNovaHesla();
    const dryButton = prvek('[data-ln686e="dry-run"]');
    const dryStatus = prvek('[data-ln686e-dry-status]');
    if (dryButton) dryButton.disabled = true;
    if (dryStatus) { dryStatus.textContent = ""; dryStatus.removeAttribute("data-result"); }
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
    reautentizaceOk = overeni.ok === true;
    rootDryRunOk = false;
    newPasswordTestOk = false;
    resetujLegacyAudit686H();
    resetujNovaHesla();
    const dryButton = prvek('[data-ln686e="dry-run"]');
    if (dryButton) dryButton.disabled = !reautentizaceOk;
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

  async function spustDryRun() {
    if (!reautentizaceOk || !obrazovka || obrazovka.hidden) return;
    const mojeGenerace = ++generace;
    reautentizaceOk = false; // každý dry-run vyžaduje nové ověření hesla
    const tlacitko = prvek('[data-ln686e="dry-run"]');
    const status = prvek('[data-ln686e-dry-status]');
    const overit = prvek('[data-ln686e="verify"]');
    const heslo = prvek('[data-ln686e-password]');
    if (tlacitko) { tlacitko.disabled = true; tlacitko.textContent = "Zkouším…"; }
    if (overit) overit.disabled = true;
    if (heslo) heslo.disabled = true;
    if (status) { status.textContent = "Ověřuji Root Key v paměti…"; status.removeAttribute("data-result"); }
    let vysledek;
    try {
      const funkce = window.LubaNoteE2ECore?.recoveryRewrapDryRun;
      vysledek = typeof funkce === "function"
        ? await funkce()
        : { ok: false, reason: "cryptographic_test_unavailable" };
    } catch (_chyba) {
      vysledek = { ok: false, reason: "cryptographic_test_failed" };
    }
    if (mojeGenerace !== generace || !obrazovka || obrazovka.hidden) return;
    rootDryRunOk = vysledek.ok === true;
    nastavDostupnostNovychHesel(rootDryRunOk);
    if (status) {
      status.textContent = vysledek.ok ? "ROOT REWRAP DRY-RUN – PASS ✓" : "ROOT REWRAP DRY-RUN – FAIL";
      status.dataset.result = vysledek.ok ? "pass" : "fail";
    }
    const anoNe = (v) => v === true ? "PASS" : "FAIL";
    const bezDryRun = posledniReport.replace(/\nrootRewrapDryRun: [\s\S]*$/, "");
    nastavReport(bezDryRun +
      "\nrootRewrapDryRun: " + anoNe(vysledek.ok) +
      "\nsourceEnvelopeVerified: " + anoNe(vysledek.sourceEnvelopeVerified) +
      "\ntemporaryRewrapVerified: " + anoNe(vysledek.temporaryRewrapVerified) +
      "\nsameKeyIdAfterRewrap: " + anoNe(vysledek.sameKeyId) +
      "\nrewrapReason: " + String(vysledek.reason || "none").slice(0, 80) +
      "\nE2E notes/keys/server unchanged: YES" +
      "\nPOZOR: Rewrap dry-run NENI zmena E2E hesla ani ulozeni nove obalky.");
    if (tlacitko) tlacitko.textContent = "Ověřit rozbalení a nové zabalení";
    if (overit) overit.disabled = false;
    if (heslo) heslo.disabled = false;
  }

  function resetujNovaHesla() {
    for (const selector of ["[data-ln686g-new-password]", "[data-ln686g-confirm-password]"]) {
      const input = prvek(selector);
      if (input) { input.value = ""; input.disabled = true; }
    }
    const tlacitko = prvek('[data-ln686e="new-password-test"]');
    if (tlacitko) tlacitko.disabled = true;
    const stav = prvek("[data-ln686g-status]");
    if (stav) { stav.textContent = ""; stav.removeAttribute("data-result"); }
  }

  function nastavDostupnostNovychHesel(povoleno) {
    const active = povoleno && obrazovka && !obrazovka.hidden;
    for (const selector of ["[data-ln686g-new-password]", "[data-ln686g-confirm-password]"]) {
      const input = prvek(selector);
      if (input) input.disabled = !active;
    }
    const tlacitko = prvek('[data-ln686e="new-password-test"]');
    if (tlacitko) tlacitko.disabled = !active;
  }

  async function spustNoveHesloDryRun() {
    if (!rootDryRunOk || !obrazovka || obrazovka.hidden) return;
    const nove = prvek("[data-ln686g-new-password]");
    const potvrzeni = prvek("[data-ln686g-confirm-password]");
    const stav = prvek("[data-ln686g-status]");
    const tlacitko = prvek('[data-ln686e="new-password-test"]');
    const heslo = nove?.value || "";
    const shoda = heslo.length >= 12 && heslo === (potvrzeni?.value || "");
    if (nove) nove.value = "";
    if (potvrzeni) potvrzeni.value = "";
    if (!shoda) {
      if (stav) {
        stav.textContent = heslo.length < 12 ?
          "Nové E2E heslo musí mít alespoň 12 znaků." : "Hesla se neshodují.";
        stav.dataset.result = "fail";
      }
      return;
    }
    const mojeGenerace = ++generace;
    rootDryRunOk = false; // Test je jednorázový; další pokus vyžaduje znovu 686F.
    newPasswordTestOk = false;
    resetujLegacyAudit686H();
    nastavDostupnostNovychHesel(false);
    if (tlacitko) tlacitko.textContent = "Odvozuji nový šifrovací klíč…";
    if (stav) {
      stav.textContent = "Ověřuji nový E2E klíč v paměti…";
      stav.removeAttribute("data-result");
    }
    let vysledek;
    try {
      const funkce = window.LubaNoteE2ECore?.recoveryNoveHesloDryRun;
      vysledek = typeof funkce === "function"
        ? await funkce(heslo)
        : { ok: false, reason: "new_password_test_unavailable" };
    } catch (_chyba) {
      vysledek = { ok: false, reason: "new_password_test_failed" };
    }
    if (mojeGenerace !== generace || !obrazovka || obrazovka.hidden) return;
    if (stav) {
      stav.textContent = vysledek.ok ? "NOVÉ E2E HESLO – CRYPTO PASS ✓" : "NOVÉ E2E HESLO – FAIL";
      stav.dataset.result = vysledek.ok ? "pass" : "fail";
    }
    if (tlacitko) tlacitko.textContent = "Otestovat nové E2E heslo";
    newPasswordTestOk = vysledek.ok === true;
    const auditTlacitko = prvek('[data-ln686e="legacy-audit"]');
    if (auditTlacitko) auditTlacitko.disabled = !newPasswordTestOk;
    const anoNe = (v) => v === true ? "PASS" : "FAIL";
    const bezTestu = posledniReport.replace(/\nnewPasswordCryptoTest: [\s\S]*$/, "");
    nastavReport(bezTestu +
      "\nnewPasswordCryptoTest: " + anoNe(vysledek.ok) +
      "\nsourceEnvelopeVerified: " + anoNe(vysledek.sourceEnvelopeVerified) +
      "\npasswordDerivedKekVerified: " + anoNe(vysledek.passwordDerivedKekVerified) +
      "\nnewEnvelopeRoundtrip: " + anoNe(vysledek.newEnvelopeRoundtrip) +
      "\nverifierCompatible: " + anoNe(vysledek.verifierCompatible) +
      "\nsameKeyIdNewPassword: " + anoNe(vysledek.sameKeyId) +
      "\nnewPasswordTestReason: " + String(vysledek.reason || "none").slice(0, 80) +
      "\nE2E keys/notes/server unchanged: YES" +
      "\nPOZOR: Heslo NEBYLO zmeneno. Pred skutecnou obnovou nutna kontrola legacy Secret/media.");
  }

  function resetujLegacyAudit686H() {
    newPasswordTestOk = false;
    const btn = prvek('[data-ln686e="legacy-audit"]');
    if (btn) btn.disabled = true;
    const stav = prvek('[data-ln686h-status]');
    if (stav) { stav.textContent = ""; stav.removeAttribute("data-result"); }
    const obsah = prvek('[data-ln686h-checks]');
    if (obsah) obsah.textContent = "";
  }

  async function spustLegacyAudit686H() {
    if (!newPasswordTestOk || !obrazovka || obrazovka.hidden) return;
    const mojeGenerace = ++generace;
    newPasswordTestOk = false;
    const btn = prvek('[data-ln686e="legacy-audit"]');
    const stav = prvek('[data-ln686h-status]');
    const obsah = prvek('[data-ln686h-checks]');
    if (btn) btn.disabled = true;
    if (stav) { stav.textContent = "Ověřuji lokální a serverová metadata…"; stav.removeAttribute("data-result"); }
    let audit;
    try {
      const funkce = window.LubaNoteE2ECore?.recoveryLegacyAudit686H;
      audit = typeof funkce === "function"
        ? await funkce()
        : { ok: false, reason: "legacy_audit_unavailable", readOnly: true };
    } catch (_err) {
      audit = { ok: false, reason: "legacy_audit_failed", readOnly: true };
    }
    if (mojeGenerace !== generace || !obrazovka || obrazovka.hidden) return;
    if (stav) {
      stav.textContent = audit.ok
        ? "KONTROLA DOKONČENA – ZMĚNA HESLA STÁLE ZAKÁZÁNA"
        : "KONTROLA NEDOKONČENA – ZMĚNA HESLA ZAKÁZÁNA";
      stav.dataset.result = audit.ok ? "pass" : "fail";
    }
    if (obsah) obsah.innerHTML = [
      radek("TEST web", audit.testWeb),
      radek("TEST backend", audit.testBackend),
      radek("Root Key ověřen", audit.rootVerified),
      radek("Serverová média ověřena", audit.serverMediaContentAudited),
      radek("Skutečná změna hesla povolena", audit.safeToRotate)
    ].join("");
    const n = (v) => Number.isSafeInteger(v) && v >= 0 ? String(v) : "nezjištěno";
    const txt = [
      "LUBANOTE 686H – E2E LEGACY AUDIT (READ-ONLY)",
      "legacyAudit: " + (audit.ok ? "COMPLETED" : "INCOMPLETE"),
      "testWeb: " + (audit.testWeb ? "YES" : "NO"),
      "testBackend: " + (audit.testBackend ? "YES" : "NO"),
      "rootVerified: " + (audit.rootVerified ? "YES" : "NO"),
      "localSecretNotes: " + n(audit.localSecretNotes),
      "localLegacySecretNotes: " + n(audit.localLegacySecretNotes),
      "localMediaVaults: " + n(audit.localMediaVaults),
      "serverNotes: " + n(audit.serverNotes),
      "serverSecretNotes: " + n(audit.serverSecretNotes),
      "serverSecretTags: " + n(audit.serverSecretTags),
      "serverSecretAttachments: " + n(audit.serverSecretAttachments),
      "serverSharedIdentities: " + n(audit.serverSharedIdentities),
      "serverMediaContentAudited: NO",
      "safeToRotate: NO",
      "auditReason: " + String(audit.reason || "unknown").slice(0, 80),
      "E2E data/password/server modified: NO"
    ].join("\n");
    const zaklad = posledniReport.replace(/\nlegacyAudit: [\s\S]*$/, "");
    nastavReport(zaklad + "\n" + txt);
  }

  /* 686I can be run immediately after opening the TEST screen. Previous
     686G/686H tests are not required again just to inspect this issue. */
  async function spustBackendSharedAudit686I() {
    if (!obrazovka || obrazovka.hidden) return;
    const mojeGenerace = ++generace;
    const tlacitko = prvek('[data-ln686e="backend-shared-audit"]');
    const stav = prvek('[data-ln686i-status]');
    const backend = prvek('[data-ln686i-backend]');
    const obsah = prvek('[data-ln686i-checks]');
    if (tlacitko) tlacitko.disabled = true;
    if (stav) {
      stav.textContent = "Ověřuji backend a existující Shared identitu…";
      stav.removeAttribute("data-result");
    }
    if (backend) backend.textContent = "";
    if (obsah) obsah.textContent = "";
    let audit;
    try {
      const funkce = window.LubaNoteE2ECore?.recoveryBackendSharedAudit686I;
      audit = typeof funkce === "function"
        ? await funkce()
        : { ok: false, reason: "backend_shared_audit_unavailable" };
    } catch (_error) {
      audit = { ok: false, reason: "backend_shared_audit_failed" };
    }
    if (mojeGenerace !== generace || !obrazovka || obrazovka.hidden) return;
    if (tlacitko) tlacitko.disabled = false;
    if (stav) {
      stav.textContent = audit.ok
        ? (audit.productionApi
          ? "PRODUKČNÍ API – KONTROLA DOKONČENA, BEZ ZÁPISU"
          : "KONTROLA DOKONČENA – ZMĚNA HESLA ZAKÁZÁNA")
        : "KONTROLA NEDOKONČENA – ZMĚNA HESLA ZAKÁZÁNA";
      stav.dataset.result = audit.ok && !audit.productionApi ? "pass" : "fail";
    }
    if (backend) {
      backend.textContent = [
        "Skutečné API: " + String(audit.actualApiHost || "unknown"),
        "Backend: " + String(audit.configuredBackendId || "unknown"),
        "Profil: " + String(audit.configuredProfileId || "unknown"),
        "Prostředí: " + String(audit.configuredEnvironment || "unknown")
      ].join("\n");
    }
    if (obsah) obsah.innerHTML = [
      radek("Účet ověřen", audit.accountVerified),
      radek("Nastavení odpovídá skutečnému API", audit.backendUrlMatchesClient),
      radek("Shared identita nalezena", audit.sharedIdentityFound),
      radek("Metadata Shared identity", audit.sharedIdentityMetadataValid),
      radek("Původní ochranný klíč", audit.mediaKekReady),
      radek("Shared obálka rozbalena", audit.sharedPrivateEnvelopeDecrypted),
      radek("Shared klíčový pár ověřen", audit.sharedKeyPairVerified),
      radek("Samostatná TEST DB prokázána", audit.isolatedTestDatabaseVerified),
      radek("Skutečná změna hesla povolena", audit.safeToRotate)
    ].join("");
    const anoNe = (v) => v === true ? "YES" : "NO";
    const predesly = posledniReport.replace(/\nLUBANOTE 686I – BACKEND SHARED AUDIT \(READ-ONLY\)[\s\S]*$/, "");
    const textReportu = [
      "LUBANOTE 686I – BACKEND SHARED AUDIT (READ-ONLY)",
      "backendSharedAudit: " + (audit.ok ? "COMPLETED" : "INCOMPLETE"),
      "actualApiHost: " + String(audit.actualApiHost || "unknown"),
      "configuredBackendId: " + String(audit.configuredBackendId || "unknown"),
      "configuredEnvironment: " + String(audit.configuredEnvironment || "unknown"),
      "configuredProfileId: " + String(audit.configuredProfileId || "unknown"),
      "backendUrlMatchesClient: " + anoNe(audit.backendUrlMatchesClient),
      "productionApi: " + anoNe(audit.productionApi),
      "isolatedTestDatabaseVerified: NO",
      "accountVerified: " + anoNe(audit.accountVerified),
      "sharedIdentityFound: " + anoNe(audit.sharedIdentityFound),
      "sharedIdentityMetadataValid: " + anoNe(audit.sharedIdentityMetadataValid),
      "mediaKekReady: " + anoNe(audit.mediaKekReady),
      "sharedPrivateEnvelopeDecrypted: " + anoNe(audit.sharedPrivateEnvelopeDecrypted),
      "sharedKeyPairVerified: " + anoNe(audit.sharedKeyPairVerified),
      "safeToRotate: NO",
      "reason: " + String(audit.reason || "unknown").slice(0, 80),
      "E2E password/keys/notes/server modified: NO"
    ].join("\n");
    nastavReport(predesly + (predesly ? "\n" : "") + textReportu);
  }

  /* 686J – independent TEST-only Shared dry run. No previous 686G/686I
     button sequence required; password fields are cleared immediately. */
  async function spustSharedRewrap686J() {
    if (!obrazovka || obrazovka.hidden) return;
    const nove = prvek('[data-ln686j-new]');
    const potvrzeni = prvek('[data-ln686j-confirm]');
    const btn = prvek('[data-ln686e="shared-rewrap-dry-run"]');
    const stav = prvek('[data-ln686j-status]');
    const obsah = prvek('[data-ln686j-checks]');
    const heslo = nove?.value || "";
    const stejne = Boolean(heslo && heslo === potvrzeni?.value);
    // Never leave test passwords in the DOM or logs.
    if (nove) nove.value = "";
    if (potvrzeni) potvrzeni.value = "";
    if (!stejne || heslo.length < 8) {
      if (stav) {
        stav.textContent = "Zadej stejné nové heslo do obou polí (alespoň 8 znaků).";
        stav.dataset.result = "fail";
      }
      return;
    }
    const mojeGenerace = ++generace;
    if (btn) btn.disabled = true;
    if (stav) { stav.textContent = "Testuji přebalení stejného Shared klíče pouze v paměti…"; stav.removeAttribute("data-result"); }
    if (obsah) obsah.textContent = "";
    let vysledek;
    try {
      const funkce = window.LubaNoteE2ECore?.recoverySharedRewrapDryRun686J;
      vysledek = typeof funkce === "function"
        ? await funkce(heslo)
        : { ok: false, reason: "shared_rewrap_test_unavailable" };
    } catch (_err) {
      vysledek = { ok: false, reason: "shared_rewrap_test_failed" };
    }
    if (mojeGenerace !== generace || !obrazovka || obrazovka.hidden) return;
    if (btn) btn.disabled = false;
    if (stav) {
      stav.textContent = vysledek.ok
        ? "SHARED REWRAP PASS – původní identita zachována (BEZ ZÁPISU)"
        : "SHARED REWRAP FAIL – nic nebylo změněno";
      stav.dataset.result = vysledek.ok ? "pass" : "fail";
    }
    if (obsah) obsah.innerHTML = [
      radek("Účet ověřen", vysledek.accountVerified),
      radek("Původní Shared obálka rozbalena", vysledek.sourceEnvelopeDecrypted),
      radek("Původní pár klíčů ověřen", vysledek.sourceKeyPairVerified),
      radek("Nový ochranný klíč odvozen", vysledek.newPasswordKekDerived),
      radek("Nová dočasná obálka rozbalena", vysledek.temporaryRewrapRoundtrip),
      radek("Stejný soukromý klíč", vysledek.samePrivateKey),
      radek("Stejná veřejná identita", vysledek.samePublicIdentity),
      radek("Skutečná změna hesla povolena", vysledek.safeToRotate)
    ].join("");
    const anoNe = (v) => v === true ? "YES" : "NO";
    const bezJ = posledniReport.replace(/\n?LUBANOTE 686J – SHARED REWRAP DRY-RUN \(READ-ONLY\)[\s\S]*$/, "");
    const report = [
      "LUBANOTE 686J – SHARED REWRAP DRY-RUN (READ-ONLY)",
      "sharedRewrapDryRun: " + (vysledek.ok ? "PASS" : "FAIL"),
      "accountVerified: " + anoNe(vysledek.accountVerified),
      "sourceEnvelopeDecrypted: " + anoNe(vysledek.sourceEnvelopeDecrypted),
      "sourceKeyPairVerified: " + anoNe(vysledek.sourceKeyPairVerified),
      "newPasswordKekDerived: " + anoNe(vysledek.newPasswordKekDerived),
      "temporaryRewrapRoundtrip: " + anoNe(vysledek.temporaryRewrapRoundtrip),
      "samePrivateKey: " + anoNe(vysledek.samePrivateKey),
      "samePublicIdentity: " + anoNe(vysledek.samePublicIdentity),
      "serverMediaContentAudited: NO",
      "safeToRotate: NO",
      "reason: " + String(vysledek.reason || "unknown").slice(0, 80),
      "E2E password/keys/notes/server modified: NO"
    ].join("\n");
    nastavReport(bezJ + (bezJ ? "\n" : "") + report);
  }

  /* 686K – independent metadata-only Secret/media inventory. */
  async function spustSecretMediaAudit686K() {
    if (!obrazovka || obrazovka.hidden) return;
    const btn = prvek('[data-ln686e="secret-media-audit"]');
    const stav = prvek('[data-ln686k-status]');
    const obsah = prvek('[data-ln686k-checks]');
    const mojeGenerace = ++generace;
    if (btn) btn.disabled = true;
    if (stav) {
      stav.textContent = "Čtu pouze počty a metadata Secret/médií…";
      stav.removeAttribute("data-result");
    }
    if (obsah) obsah.textContent = "";
    let vysledek;
    try {
      const funkce = window.LubaNoteE2ECore?.recoverySecretMediaAudit686K;
      vysledek = typeof funkce === "function"
        ? await funkce()
        : {ok: false, reason: "audit_unavailable"};
    } catch (_error) {
      vysledek = {ok: false, reason: "audit_failed"};
    }
    if (mojeGenerace !== generace || !obrazovka || obrazovka.hidden) return;
    if (btn) btn.disabled = false;
    if (stav) {
      stav.textContent = vysledek.ok
        ? "INVENTURA PASS – obsah médií ještě není ověřen (BEZ ZÁPISU)"
        : "INVENTURA NEDOKONČENA – nic nebylo změněno";
      stav.dataset.result = vysledek.ok ? "pass" : "fail";
    }
    const pocet = value => Number.isSafeInteger(value) && value >= 0 ? value : "?";
    const radekPocet = (nazev, value) =>
      `<div class="ln686e-row"><span>${nazev}</span><strong>${pocet(value)}</strong></div>`;
    if (obsah) obsah.innerHTML = [
      radek("Účet ověřen", vysledek.accountVerified),
      radek("Root Key ověřen", vysledek.rootVerified),
      radek("Lokální účet ověřen", vysledek.localOwnerVerified),
      radekPocet("Lokální Secret poznámky", vysledek.localSecretNotes),
      radekPocet("Lokální staré Secret záznamy", vysledek.localLegacySecretNotes),
      radekPocet("Lokální media vaulty", vysledek.localMediaVaults),
      radekPocet("Serverové poznámky", vysledek.serverNotes),
      radekPocet("Serverové Secret poznámky", vysledek.serverSecretNotes),
      radekPocet("Serverové Secret štítky", vysledek.serverSecretTags),
      radekPocet("Serverové Secret přílohy", vysledek.serverSecretAttachments),
      radekPocet("Serverové poznámky s E2E obálkou", vysledek.remoteE2ENotes),
      radekPocet("Serverové značky starých media vaultů", vysledek.remoteLegacyMediaVaultMarkers),
      radekPocet("Prohlédnutá serverová metadata", vysledek.remoteRowsScanned),
      radek("Metadata prověřena", vysledek.remoteMediaMetadataScanComplete),
      radek("Obsah serverových médií ověřen", vysledek.serverMediaContentAudited),
      radek("Skutečná změna hesla povolena", vysledek.safeToRotate)
    ].join("");
    const yes = v => v === true ? "YES" : "NO";
    const c = value => String(pocet(value));
    const bezK = posledniReport.replace(/\n?LUBANOTE 686K – SECRET MEDIA AUDIT \(READ-ONLY\)[\s\S]*$/, "");
    const report = [
      "LUBANOTE 686K – SECRET MEDIA AUDIT (READ-ONLY)",
      "secretMediaAudit: " + (vysledek.ok ? "INVENTORY_PASS" : "INCOMPLETE"),
      "accountVerified: " + yes(vysledek.accountVerified),
      "rootVerified: " + yes(vysledek.rootVerified),
      "localOwnerVerified: " + yes(vysledek.localOwnerVerified),
      "localSecretNotes: " + c(vysledek.localSecretNotes),
      "localLegacySecretNotes: " + c(vysledek.localLegacySecretNotes),
      "localMediaVaults: " + c(vysledek.localMediaVaults),
      "serverNotes: " + c(vysledek.serverNotes),
      "serverSecretNotes: " + c(vysledek.serverSecretNotes),
      "serverSecretTags: " + c(vysledek.serverSecretTags),
      "serverSecretAttachments: " + c(vysledek.serverSecretAttachments),
      "remoteRowsScanned: " + c(vysledek.remoteRowsScanned),
      "remoteE2ENotes: " + c(vysledek.remoteE2ENotes),
      "remoteLegacyMediaVaultMarkers: " + c(vysledek.remoteLegacyMediaVaultMarkers),
      "remotePlainOrOtherNotes: " + c(vysledek.remotePlainOrOtherNotes),
      "remoteMediaMetadataScanComplete: " + yes(vysledek.remoteMediaMetadataScanComplete),
      "serverMediaContentAudited: NO",
      "storageObjectsAudited: NO",
      "e2eInnerPayloadAudited: NO",
      "safeToRotate: NO",
      "reason: " + String(vysledek.reason || "unknown").slice(0, 80),
      "E2E password/keys/notes/server modified: NO"
    ].join("\n");
    nastavReport(bezK + (bezK ? "\n" : "") + report);
  }

  /* 686L – independent RAM-only check. Never starts the old tests. */
  async function spustMediaProof686L() {
    if (!obrazovka || obrazovka.hidden) return;
    const btn=prvek('[data-ln686e="media-content-proof"]');
    const stav=prvek('[data-ln686l-status]');
    const obsah=prvek('[data-ln686l-checks]');
    const mojeGenerace=++generace;
    if (btn) btn.disabled=true;
    if (stav) {
      stav.textContent="Ověřuji šifrované záznamy v paměti…";
      stav.removeAttribute("data-result");
    }
    if (obsah) obsah.textContent="";
    let vysledek;
    try {
      const funkce=window.LubaNoteE2ECore?.recoveryMediaContentProof686L;
      vysledek=typeof funkce==="function" ? await funkce() :
        {ok:false,reason:"proof_unavailable"};
    } catch (_error) {vysledek={ok:false,reason:"proof_failed"};}
    if (mojeGenerace!==generace || !obrazovka || obrazovka.hidden) return;
    if (btn) btn.disabled=false;
    if (stav) {
      stav.textContent=vysledek.ok
        ? "ČITELNOST PASS – média poznámek ověřena; Storage stále ne (BEZ ZÁPISU)"
        : "ČITELNOST NEDOKONČENA – nic nebylo změněno";
      stav.dataset.result=vysledek.ok?"pass":"fail";
    }
    const pocet=v=>Number.isSafeInteger(v)&&v>=0?v:"?";
    const radekP=(k,v)=>`<div class="ln686e-row"><span>${k}</span><strong>${pocet(v)}</strong></div>`;
    if (obsah) obsah.innerHTML=[
      radek("Účet ověřen",vysledek.accountVerified),
      radek("Root Key dostupný",vysledek.rootVerified),
      radek("Starý media klíč dostupný",vysledek.mediaKekReady),
      radekP("Přečtené serverové poznámky",vysledek.remoteRowsScanned),
      radekP("Rozšifrované E2E poznámky",vysledek.remoteE2EChecked),
      radekP("Staré mediální trezory",vysledek.remoteLegacyVaultNotes),
      radekP("Trezory uvnitř E2E poznámek",vysledek.remoteE2EVaultNotes),
      radekP("Nalezené šifrované soubory v trezorech",vysledek.mediaItemsFound),
      radekP("Úspěšně ověřené soubory",vysledek.mediaItemsAuthenticated),
      radek("Obsah E2E poznámek prověřen",vysledek.e2eInnerPayloadAudited),
      radek("Soubory ve Storage prověřeny",vysledek.storageObjectsAudited),
      radek("Skutečná změna hesla povolena",vysledek.safeToRotate)
    ].join("");
    const yes=v=>v===true?"YES":"NO";
    const num=v=>String(pocet(v));
    const bezL=posledniReport.replace(/\n?LUBANOTE 686L – MEDIA CONTENT PROOF \(READ-ONLY\)[\s\S]*$/,"");
    const report=[
      "LUBANOTE 686L – MEDIA CONTENT PROOF (READ-ONLY)",
      "mediaContentProof: "+(vysledek.ok?"NOTE_VAULT_PASS":"INCOMPLETE"),
      "accountVerified: "+yes(vysledek.accountVerified),
      "rootVerified: "+yes(vysledek.rootVerified),
      "mediaKekReady: "+yes(vysledek.mediaKekReady),
      "remoteNotesCount: "+num(vysledek.remoteNotesCount),
      "remoteRowsScanned: "+num(vysledek.remoteRowsScanned),
      "remoteE2EChecked: "+num(vysledek.remoteE2EChecked),
      "remoteLegacyVaultNotes: "+num(vysledek.remoteLegacyVaultNotes),
      "remoteE2EVaultNotes: "+num(vysledek.remoteE2EVaultNotes),
      "mediaItemsFound: "+num(vysledek.mediaItemsFound),
      "mediaItemsAuthenticated: "+num(vysledek.mediaItemsAuthenticated),
      "legacyMediaAuthenticated: "+yes(vysledek.legacyMediaAuthenticated),
      "e2eInnerPayloadAudited: "+yes(vysledek.e2eInnerPayloadAudited),
      "storageObjectsAudited: NO",
      "serverMediaContentAudited: NO",
      "safeToRotate: NO",
      "reason: "+String(vysledek.reason||"unknown").slice(0,90),
      "E2E password/keys/notes/server modified: NO"
    ].join("\n");
    nastavReport(bezL+(bezL?"\n":"")+report);
  }

  /* 686M – stand-alone test; does not repeat 686G–L. */
  async function spustStorageMedia686M() {
    if(!obrazovka || obrazovka.hidden)return;
    const nove=prvek('[data-ln686m-new]');
    const potvrzeni=prvek('[data-ln686m-confirm]');
    const btn=prvek('[data-ln686e="storage-media-rewrap"]');
    const stav=prvek('[data-ln686m-status]');
    const obsah=prvek('[data-ln686m-checks]');
    const heslo=nove?.value||"";
    const stejne=heslo.length>=8 && heslo.length<=1024 && heslo===potvrzeni?.value;
    if(nove)nove.value="";
    if(potvrzeni)potvrzeni.value="";
    if(!stejne){
      if(stav){stav.textContent="Hesla se neshodují nebo mají méně než 8 znaků.";stav.dataset.result="fail";}
      return;
    }
    const mojeGenerace=++generace;
    if(btn)btn.disabled=true;
    if(stav){stav.textContent="Ověřuji Storage a dočasně přebaluji šifrované médium…";stav.removeAttribute("data-result");}
    if(obsah)obsah.textContent="";
    let v;
    try {
      const fn=window.LubaNoteE2ECore?.recoveryStorageMediaDryRun686M;
      v=typeof fn==="function"?await fn(heslo):{ok:false,reason:"test_unavailable"};
    }catch(_error){v={ok:false,reason:"test_failed"};}
    // The input fields have been cleared BEFORE any asynchronous work.
    // Always re-enable the button even if the screen was closed meanwhile.
    if(btn)btn.disabled=false;
    if(mojeGenerace!==generace || !obrazovka || obrazovka.hidden)return;
    if(stav){
      stav.textContent=v.ok?"ROZSAHOVÝ TEST PASS – media znovu otevřena, známá Storage cesta projita; změna hesla stále zakázána":
        "KONTROLA NEDOKONČENA – stav dílčích kontrol je v reportu; nic nebylo změněno";
      stav.dataset.result=v.ok?"pass":"fail";
    }
    const p=n=>Number.isSafeInteger(n)&&n>=0?n:"?";
    const ř=(k,v)=>`<div class="ln686e-row"><span>${k}</span><strong>${p(v)}</strong></div>`;
    if(obsah) obsah.innerHTML=[
      radek("Účet ověřen",v.accountVerified),
      radek("Root Key dostupný",v.rootVerified),
      radek("Původní media klíč dostupný",v.mediaKekReady),
      radek("Nový dočasný media klíč",v.newMediaKekDerived),
      ř("Prověřené poznámky",v.remoteRowsScanned),
      ř("Přebalené položky v paměti",v.mediaItemsRewrapped),
      radek("Přebalení původních médií",v.legacyMediaRewrapVerified),
      ř("Řádky příloh v databázi",v.storageAttachmentRows),
      ř("Objekty v dostupné složce Storage",v.storageObjectsFound),
      radek("Známá složka Storage prošla",v.storageUserPrefixListed),
      radek("Veškerý Storage ověřen",v.storageObjectsAudited),
      radek("Skutečná změna hesla povolena",v.safeToRotate)
    ].join("");
    const ano=x=>x===true?"YES":"NO";
    const bezM=posledniReport.replace(/\n?LUBANOTE 686M – STORAGE MEDIA DRY-RUN \(READ-ONLY\)[\s\S]*$/,"");
    const report=[
      "LUBANOTE 686M – STORAGE MEDIA DRY-RUN (READ-ONLY)",
      "storageMediaDryRun: "+(v.ok?"SCOPED_PASS":"INCOMPLETE"),
      "accountVerified: "+ano(v.accountVerified),
      "rootVerified: "+ano(v.rootVerified),
      "mediaKekReady: "+ano(v.mediaKekReady),
      "newMediaKekDerived: "+ano(v.newMediaKekDerived),
      "remoteRowsScanned: "+p(v.remoteRowsScanned),
      "e2eNotesDecrypted: "+p(v.e2eNotesDecrypted),
      "legacyMediaVaults: "+p(v.legacyMediaVaults),
      "mediaItemsFound: "+p(v.mediaItemsFound),
      "mediaItemsRewrapped: "+p(v.mediaItemsRewrapped),
      "legacyMediaRewrapVerified: "+ano(v.legacyMediaRewrapVerified),
      "mediaProofReason: "+String(v.mediaProofReason||"unknown").slice(0,90),
      "storageBucket: lubanote-attachments",
      "storageUserPrefixListed: "+ano(v.storageUserPrefixListed),
      "storageObjectsFound: "+p(v.storageObjectsFound),
      "storageFoldersScanned: "+p(v.storageFoldersScanned),
      "storageAttachmentRows: "+p(v.storageAttachmentRows),
      "storageListingReason: "+String(v.storageListingReason||"unknown").slice(0,90),
      "storageAllBucketsAudited: NO",
      "storageObjectContentsAudited: NO",
      "storageObjectsAudited: NO",
      "safeToRotate: NO",
      "reason: "+String(v.reason||"unknown").slice(0,90),
      "E2E password/keys/notes/server modified: NO"
    ].join("\n");
    nastavReport(bezM+(bezM?"\n":"")+report);
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
    reautentizaceOk = false;
    rootDryRunOk = false;
    newPasswordTestOk = false;
    resetujLegacyAudit686H();
    resetujNovaHesla();
    obrazovka.hidden = true;
    const pole = prvek("[data-ln686e-password]");
    if (pole) pole.value = "";
    const noveShared = prvek("[data-ln686j-new]");
    const potvrzeneShared = prvek("[data-ln686j-confirm]");
    if (noveShared) noveShared.value = "";
    if (potvrzeneShared) potvrzeneShared.value = "";
    const noveMedia = prvek("[data-ln686m-new]");
    const potvrzeneMedia = prvek("[data-ln686m-confirm]");
    if (noveMedia) noveMedia.value = "";
    if (potvrzeneMedia) potvrzeneMedia.value = "";
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
