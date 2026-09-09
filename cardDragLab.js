/* ==========================================
   LUBANOTE – CARD DRAG LAB / TESTY 1–3
   6 stejne velkych karet, bez auto-scrollu.
   Cilem je osahat rozdil mezi vlozenim a swapem.
   Pouze synteticka data v pameti.
   ========================================== */

(() => {
  "use strict";

  const DOBA_LONG_PRESS = 430;
  const MAX_POHYB_PRED_LONG_PRESS = 16;
  const FPS_UPDATE_INTERVAL = 500;
  const VYCHOZI_PORADI = [1, 2, 3, 4, 5, 6];

  const TESTY = {
    1: {
      nazev: "TEST 1: karta 1 NA kartu 4",
      popis: "Standardni model vlozeni: pusteni na 4 znamena vlozit kartu 1 ZA kartu 4.",
      zdroj: 1,
      cil: 4,
      rezim: "vlozitZa",
      dropText: "PUSTIT = ZA 4",
      ocekavane: [2, 3, 4, 1, 5, 6]
    },
    2: {
      nazev: "TEST 2: karta 1 NA kartu 2",
      popis: "Sousedni presun: karta 1 se vlozi ZA kartu 2. Tady insertion i swap vypadaji stejne.",
      zdroj: 1,
      cil: 2,
      rezim: "vlozitZa",
      dropText: "PUSTIT = ZA 2",
      ocekavane: [2, 1, 3, 4, 5, 6]
    },
    3: {
      nazev: "TEST 3: karta 1 NA kartu 4",
      popis: "Alternativni model pro porovnani pocitu: karta 1 a karta 4 si jen PROHODI mista.",
      zdroj: 1,
      cil: 4,
      rezim: "prohodit",
      dropText: "PUSTIT = PROHODIT S 4",
      ocekavane: [4, 2, 3, 1, 5, 6]
    }
  };

  let instance = null;

  function vlozStyly() {
    if (document.getElementById("ln-card-drag-lab-style")) return;

    const style = document.createElement("style");
    style.id = "ln-card-drag-lab-style";
    style.textContent = `
      #ln-card-drag-lab,
      #ln-card-drag-lab * { box-sizing: border-box !important; }

      #ln-card-drag-lab {
        position: fixed !important;
        inset: 0 !important;
        z-index: 2147483645 !important;
        display: flex !important;
        flex-direction: column !important;
        background: var(--color-background, #071a26) !important;
        color: var(--color-text, #eef8ff) !important;
        font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        overflow: hidden !important;
        overscroll-behavior: none !important;
      }

      #ln-card-drag-lab .ln-cdl-head {
        flex: 0 0 auto !important;
        display: grid !important;
        grid-template-columns: minmax(0, 1fr) auto !important;
        gap: 8px !important;
        align-items: center !important;
        padding: max(8px, env(safe-area-inset-top)) 10px 8px !important;
        border-bottom: 1px solid var(--color-border, rgba(255,255,255,.2)) !important;
        background: var(--color-surface, #0b2635) !important;
      }

      #ln-card-drag-lab .ln-cdl-head strong {
        display: block !important;
        font-size: 17px !important;
        line-height: 1.15 !important;
      }

      #ln-card-drag-lab .ln-cdl-head small {
        display: block !important;
        margin-top: 2px !important;
        opacity: .75 !important;
        font-size: 10px !important;
      }

      #ln-card-drag-lab .ln-cdl-actions,
      #ln-card-drag-lab .ln-cdl-tests {
        display: flex !important;
        gap: 5px !important;
      }

      #ln-card-drag-lab button {
        min-height: 38px !important;
        padding: 6px 9px !important;
        border: 1px solid var(--color-border, rgba(255,255,255,.25)) !important;
        border-radius: 11px !important;
        background: var(--color-surface, #0b2635) !important;
        color: var(--color-text, #eef8ff) !important;
        font: inherit !important;
        font-size: 12px !important;
        touch-action: manipulation !important;
      }

      #ln-card-drag-lab button.ln-cdl-test-btn.active {
        border-color: var(--color-accent, #20c7d9) !important;
        box-shadow: inset 0 -3px 0 var(--color-accent, #20c7d9) !important;
        font-weight: 800 !important;
      }

      #ln-card-drag-lab .ln-cdl-test {
        flex: 0 0 auto !important;
        padding: 8px 10px !important;
        border-bottom: 1px solid var(--color-border, rgba(255,255,255,.15)) !important;
        background: var(--color-background, #071a26) !important;
      }

      #ln-card-drag-lab .ln-cdl-tests {
        margin-bottom: 7px !important;
      }

      #ln-card-drag-lab .ln-cdl-test-title {
        font-size: 13px !important;
        font-weight: 850 !important;
        line-height: 1.25 !important;
      }

      #ln-card-drag-lab .ln-cdl-test-text {
        margin-top: 3px !important;
        font-size: 11px !important;
        line-height: 1.35 !important;
        opacity: .82 !important;
      }

      #ln-card-drag-lab .ln-cdl-state {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        gap: 8px !important;
        margin-top: 5px !important;
        font-size: 10px !important;
      }

      #ln-card-drag-lab .ln-cdl-perf {
        white-space: nowrap !important;
        opacity: .72 !important;
        font-variant-numeric: tabular-nums !important;
      }

      #ln-card-drag-lab .ln-cdl-board {
        flex: 1 1 auto !important;
        min-height: 0 !important;
        display: flex !important;
        flex-direction: column !important;
        justify-content: center !important;
        padding: 12px 12px calc(16px + env(safe-area-inset-bottom)) !important;
        touch-action: none !important;
      }

      #ln-card-drag-lab .ln-cdl-grid {
        display: grid !important;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important;
        gap: 12px !important;
        width: 100% !important;
        max-width: 390px !important;
        margin: 0 auto !important;
      }

      #ln-card-drag-lab .ln-cdl-card {
        position: relative !important;
        height: 112px !important;
        min-height: 112px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        border: 2px solid var(--color-border, rgba(255,255,255,.18)) !important;
        border-radius: 20px !important;
        background: var(--color-surface, #123547) !important;
        color: var(--color-text, #eef8ff) !important;
        box-shadow: 0 3px 12px rgba(0,0,0,.12) !important;
        user-select: none !important;
        -webkit-user-select: none !important;
        -webkit-touch-callout: none !important;
        touch-action: none !important;
        overflow: hidden !important;
      }

      #ln-card-drag-lab .ln-cdl-number {
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: 54px !important;
        height: 54px !important;
        border-radius: 16px !important;
        background: var(--color-accent, #20c7d9) !important;
        color: var(--color-accent-text, #001014) !important;
        font-size: 28px !important;
        font-weight: 950 !important;
        font-variant-numeric: tabular-nums !important;
      }

      #ln-card-drag-lab .ln-cdl-card[data-source-label]::after,
      #ln-card-drag-lab .ln-cdl-card[data-target-label]::after {
        position: absolute !important;
        bottom: 7px !important;
        font-size: 9px !important;
        font-weight: 850 !important;
        opacity: .72 !important;
      }

      #ln-card-drag-lab .ln-cdl-card[data-source-label]::after {
        content: attr(data-source-label) !important;
        left: 8px !important;
      }

      #ln-card-drag-lab .ln-cdl-card[data-target-label]::after {
        content: attr(data-target-label) !important;
        right: 8px !important;
      }

      #ln-card-drag-lab .ln-cdl-card.ln-cdl-target {
        border-color: var(--color-accent, #20c7d9) !important;
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent, #20c7d9) 35%, transparent), 0 8px 22px rgba(0,0,0,.22) !important;
        transform: scale(1.025) !important;
      }

      #ln-card-drag-lab .ln-cdl-card.ln-cdl-target::before {
        content: attr(data-drop-label) !important;
        position: absolute !important;
        inset: 0 !important;
        display: flex !important;
        align-items: flex-end !important;
        justify-content: center !important;
        padding-bottom: 8px !important;
        background: linear-gradient(to top, color-mix(in srgb, var(--color-accent, #20c7d9) 28%, transparent), transparent 48%) !important;
        color: var(--color-text, #eef8ff) !important;
        font-size: 9px !important;
        font-weight: 900 !important;
        pointer-events: none !important;
      }

      .ln-cdl-ghost {
        position: fixed !important;
        z-index: 2147483646 !important;
        width: 120px !important;
        height: 112px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        border: 2px solid var(--color-accent, #20c7d9) !important;
        border-radius: 20px !important;
        background: var(--color-surface, #123547) !important;
        color: var(--color-text, #eef8ff) !important;
        box-shadow: 0 18px 46px rgba(0,0,0,.42) !important;
        pointer-events: none !important;
        transform: scale(1.02) !important;
      }

      .ln-cdl-ghost .ln-cdl-number {
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: 54px !important;
        height: 54px !important;
        border-radius: 16px !important;
        background: var(--color-accent, #20c7d9) !important;
        color: var(--color-accent-text, #001014) !important;
        font-size: 28px !important;
        font-weight: 950 !important;
      }

      #ln-card-drag-lab .ln-cdl-result {
        flex: 0 0 auto !important;
        min-height: 58px !important;
        padding: 8px 10px calc(8px + env(safe-area-inset-bottom)) !important;
        border-top: 1px solid var(--color-border, rgba(255,255,255,.15)) !important;
        background: var(--color-surface, #0b2635) !important;
        font-size: 11px !important;
        line-height: 1.35 !important;
      }

      #ln-card-drag-lab .ln-cdl-result.good {
        outline: 2px solid rgba(70, 220, 120, .65) !important;
        outline-offset: -2px !important;
      }
    `;
    document.head.appendChild(style);
  }

  function spust(zapis = () => {}) {
    instance?.stop?.();
    vlozStyly();

    let aktivniTest = 1;
    let poradi = [...VYCHOZI_PORADI];
    let overlay = null;
    let board = null;
    let grid = null;
    let result = null;
    let status = null;
    let perf = null;
    let testTitle = null;
    let testText = null;
    let pending = null;
    let drag = null;
    let longPressTimer = null;
    let fpsFrame = null;
    let stopnuto = false;

    const fps = {
      lastTs: 0,
      windowStart: 0,
      framesWindow: 0,
      current: 0,
      slow: 0,
      worst: 0
    };

    function test() {
      return TESTY[aktivniTest];
    }

    function log(text) {
      zapis(`LAB3 ${text}`);
    }

    function formatPoradi(list = poradi) {
      return `[${list.join(",")}]`;
    }

    function vykresliPerf() {
      if (!perf) return;
      perf.textContent = `FPS ${fps.current || "--"} · >32 ${fps.slow} · worst ${Math.round(fps.worst)}ms`;
    }

    function fpsLoop(ts) {
      if (stopnuto) return;
      if (!fps.windowStart) fps.windowStart = ts;
      if (fps.lastTs) {
        const dt = ts - fps.lastTs;
        if (dt < 1500) {
          fps.worst = Math.max(fps.worst, dt);
          if (dt > 32) fps.slow += 1;
        }
      }
      fps.lastTs = ts;
      fps.framesWindow += 1;
      const elapsed = ts - fps.windowStart;
      if (elapsed >= FPS_UPDATE_INTERVAL) {
        fps.current = Math.round((fps.framesWindow * 1000) / elapsed);
        fps.framesWindow = 0;
        fps.windowStart = ts;
        vykresliPerf();
      }
      fpsFrame = requestAnimationFrame(fpsLoop);
    }

    function resetPerf() {
      fps.lastTs = 0;
      fps.windowStart = 0;
      fps.framesWindow = 0;
      fps.current = 0;
      fps.slow = 0;
      fps.worst = 0;
      vykresliPerf();
    }

    function vytvorKartu(cislo) {
      const cfg = test();
      const card = document.createElement("article");
      card.className = "ln-cdl-card";
      card.dataset.number = String(cislo);
      if (cislo === cfg.zdroj) card.dataset.sourceLabel = "TAHNI";
      if (cislo === cfg.cil) {
        card.dataset.targetLabel = "CIL";
        card.dataset.dropLabel = cfg.dropText;
      }
      card.innerHTML = `<span class="ln-cdl-number">${cislo}</span>`;
      return card;
    }

    function vykresli() {
      if (!grid) return;
      grid.innerHTML = "";
      poradi.forEach(cislo => grid.appendChild(vytvorKartu(cislo)));
    }

    function aktualizujTestUi() {
      const cfg = test();
      testTitle.textContent = cfg.nazev;
      testText.textContent = cfg.popis;
      status.textContent = "Start: 1,2,3,4,5,6";
      result.classList.remove("good");
      result.innerHTML = `Ocekavany vysledek: <strong>${cfg.ocekavane.join(",")}</strong>`;
      overlay.querySelectorAll(".ln-cdl-test-btn").forEach(btn => {
        btn.classList.toggle("active", Number(btn.dataset.test) === aktivniTest);
      });
    }

    function vytvorOverlay() {
      overlay = document.createElement("section");
      overlay.id = "ln-card-drag-lab";
      overlay.innerHTML = `
        <header class="ln-cdl-head">
          <div>
            <strong>🧪 Drag Lab – Testy 1/2/3</strong>
            <small>6 stejnych karet · bez auto-scrollu · osahani dvou modelu</small>
          </div>
          <div class="ln-cdl-actions">
            <button type="button" data-lab="reset">Reset</button>
            <button type="button" data-lab="close">Zavrit</button>
          </div>
        </header>
        <section class="ln-cdl-test">
          <div class="ln-cdl-tests">
            <button type="button" class="ln-cdl-test-btn active" data-test="1">Test 1</button>
            <button type="button" class="ln-cdl-test-btn" data-test="2">Test 2</button>
            <button type="button" class="ln-cdl-test-btn" data-test="3">Test 3</button>
          </div>
          <div class="ln-cdl-test-title"></div>
          <div class="ln-cdl-test-text"></div>
          <div class="ln-cdl-state">
            <span class="ln-cdl-status"></span>
            <span class="ln-cdl-perf">FPS -- · >32 0 · worst 0ms</span>
          </div>
        </section>
        <main class="ln-cdl-board">
          <div class="ln-cdl-grid"></div>
        </main>
        <div class="ln-cdl-result"></div>
      `;
      document.body.appendChild(overlay);
      board = overlay.querySelector(".ln-cdl-board");
      grid = overlay.querySelector(".ln-cdl-grid");
      result = overlay.querySelector(".ln-cdl-result");
      status = overlay.querySelector(".ln-cdl-status");
      perf = overlay.querySelector(".ln-cdl-perf");
      testTitle = overlay.querySelector(".ln-cdl-test-title");
      testText = overlay.querySelector(".ln-cdl-test-text");
      aktualizujTestUi();
      vykresli();
      fpsFrame = requestAnimationFrame(fpsLoop);
    }

    function ziskejTouch(list, id) {
      return [...(list || [])].find(t => t.identifier === id) || null;
    }

    function jeVCili(x, y) {
      const cil = grid?.querySelector(`.ln-cdl-card[data-number="${test().cil}"]`);
      if (!cil) return false;
      const r = cil.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    }

    function nastavCil(aktivni) {
      const cil = grid?.querySelector(`.ln-cdl-card[data-number="${test().cil}"]`);
      cil?.classList.toggle("ln-cdl-target", Boolean(aktivni));
      if (drag) drag.targetActive = Boolean(aktivni);
    }

    function pohniGhost(x, y) {
      if (!drag?.ghost) return;
      drag.ghost.style.left = `${x - drag.offsetX}px`;
      drag.ghost.style.top = `${y - drag.offsetY}px`;
    }

    function pickup() {
      if (!pending || drag) return;
      const cfg = test();
      const source = pending.card;
      const cislo = Number(source.dataset.number);
      if (cislo !== cfg.zdroj) {
        log(`PICKUP IGNORE | card=${cislo} | test-source=${cfg.zdroj}`);
        pending = null;
        return;
      }

      const rect = source.getBoundingClientRect();
      const ghost = document.createElement("div");
      ghost.className = "ln-cdl-ghost";
      ghost.innerHTML = `<span class="ln-cdl-number">${cfg.zdroj}</span>`;
      ghost.style.width = `${rect.width}px`;
      document.body.appendChild(ghost);

      drag = {
        touchId: pending.touchId,
        source,
        ghost,
        offsetX: pending.lastX - rect.left,
        offsetY: pending.lastY - rect.top,
        lastX: pending.lastX,
        lastY: pending.lastY,
        targetActive: false
      };
      source.style.opacity = "0.22";
      pohniGhost(drag.lastX, drag.lastY);
      status.textContent = `Drzis kartu ${cfg.zdroj}. Najed na kartu ${cfg.cil} a pust.`;
      log(`PICKUP | test=${aktivniTest} | card=${cfg.zdroj} | @${Math.round(drag.lastX)},${Math.round(drag.lastY)}`);
      pending = null;
    }

    function aplikujTest() {
      const cfg = test();

      if (cfg.rezim === "vlozitZa") {
        const zdrojIndex = poradi.indexOf(cfg.zdroj);
        if (zdrojIndex < 0) return false;
        poradi.splice(zdrojIndex, 1);
        const cilIndex = poradi.indexOf(cfg.cil);
        poradi.splice(cilIndex + 1, 0, cfg.zdroj);
      } else if (cfg.rezim === "prohodit") {
        const a = poradi.indexOf(cfg.zdroj);
        const b = poradi.indexOf(cfg.cil);
        if (a < 0 || b < 0) return false;
        [poradi[a], poradi[b]] = [poradi[b], poradi[a]];
      }

      vykresli();

      const jeSpravne = poradi.every((v, i) => v === cfg.ocekavane[i]);
      result.classList.toggle("good", jeSpravne);
      result.innerHTML = jeSpravne
        ? `✅ Test ${aktivniTest}: <strong>${poradi.join(",")}</strong>. ${cfg.rezim === "prohodit" ? "Model PROHODIT." : "Model VLOZIT."}`
        : `⚠️ Vysledek: <strong>${poradi.join(",")}</strong> · cekal jsem ${cfg.ocekavane.join(",")}`;
      status.textContent = `Test ${aktivniTest} hotov. Osahni vysledek a pak klidne prepni na dalsi test.`;
      log(`DROP | test=${aktivniTest} | card=${cfg.zdroj} | target=${cfg.cil} | mode=${cfg.rezim}`);
      log(`ORDER | test=${aktivniTest} | ${formatPoradi()}`);
      log(`RESULT | test=${aktivniTest} | ${jeSpravne ? "PASS" : "FAIL"} | expected=${formatPoradi(cfg.ocekavane)}`);
      return jeSpravne;
    }

    function ukonciDrag({ cancel = false } = {}) {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      if (!drag) {
        pending = null;
        return;
      }

      const cfg = test();
      const aktivniCil = drag.targetActive;
      drag.source.style.opacity = "";
      drag.ghost.remove();
      nastavCil(false);

      if (!cancel && aktivniCil) {
        aplikujTest();
      } else {
        status.textContent = cancel
          ? "Drag zrusen."
          : `Pustil jsi mimo kartu ${cfg.cil}. Nic se nezmenilo.`;
        log(`DROP | test=${aktivniTest} | card=${cfg.zdroj} | target=${aktivniCil ? cfg.cil : "none"} | changed=no${cancel ? " | cancel=yes" : ""}`);
      }

      drag = null;
      pending = null;
    }

    function touchStart(event) {
      if (drag || pending || event.touches.length !== 1) return;
      const card = event.target.closest(".ln-cdl-card");
      if (!card) return;
      const t = event.touches[0];
      pending = {
        card,
        touchId: t.identifier,
        startX: t.clientX,
        startY: t.clientY,
        lastX: t.clientX,
        lastY: t.clientY
      };
      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        pickup();
      }, DOBA_LONG_PRESS);
    }

    function touchMove(event) {
      const id = drag?.touchId ?? pending?.touchId;
      if (id === undefined || id === null) return;
      const t = ziskejTouch(event.touches, id);
      if (!t) return;

      if (!drag) {
        if (!pending) return;
        pending.lastX = t.clientX;
        pending.lastY = t.clientY;
        const d = Math.hypot(t.clientX - pending.startX, t.clientY - pending.startY);
        if (d > MAX_POHYB_PRED_LONG_PRESS) {
          if (longPressTimer) clearTimeout(longPressTimer);
          longPressTimer = null;
          pending = null;
        }
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      drag.lastX = t.clientX;
      drag.lastY = t.clientY;
      pohniGhost(t.clientX, t.clientY);
      const nadCilem = jeVCili(t.clientX, t.clientY);
      if (nadCilem !== drag.targetActive) {
        nastavCil(nadCilem);
        log(`TARGET | test=${aktivniTest} | card=${test().cil} | active=${nadCilem ? "yes" : "no"}`);
      }
    }

    function touchEnd(event) {
      const id = drag?.touchId ?? pending?.touchId;
      if (id === undefined || id === null) return;
      const t = ziskejTouch(event.changedTouches, id);
      if (!t) return;
      if (drag) {
        event.preventDefault();
        event.stopPropagation();
        drag.lastX = t.clientX;
        drag.lastY = t.clientY;
        nastavCil(jeVCili(t.clientX, t.clientY));
        ukonciDrag();
      } else {
        if (longPressTimer) clearTimeout(longPressTimer);
        longPressTimer = null;
        pending = null;
      }
    }

    function touchCancel() {
      log(`TOUCH CANCEL | test=${aktivniTest}`);
      ukonciDrag({ cancel: true });
    }

    function reset() {
      ukonciDrag({ cancel: true });
      poradi = [...VYCHOZI_PORADI];
      vykresli();
      aktualizujTestUi();
      resetPerf();
      log(`RESET | test=${aktivniTest} | order=${formatPoradi()}`);
    }

    function prepniTest(cislo) {
      if (!TESTY[cislo] || cislo === aktivniTest) {
        if (cislo === aktivniTest) reset();
        return;
      }
      ukonciDrag({ cancel: true });
      aktivniTest = cislo;
      poradi = [...VYCHOZI_PORADI];
      vykresli();
      aktualizujTestUi();
      resetPerf();
      log(`TEST SWITCH | test=${aktivniTest} | mode=${test().rezim} | expected=${formatPoradi(test().ocekavane)}`);
    }

    function stop() {
      if (stopnuto) return;
      stopnuto = true;
      ukonciDrag({ cancel: true });
      if (fpsFrame) cancelAnimationFrame(fpsFrame);
      fpsFrame = null;
      board?.removeEventListener("touchstart", touchStart, true);
      board?.removeEventListener("touchmove", touchMove, true);
      board?.removeEventListener("touchend", touchEnd, true);
      board?.removeEventListener("touchcancel", touchCancel, true);
      overlay?.remove();
      overlay = null;
      instance = null;
    }

    vytvorOverlay();
    board.addEventListener("touchstart", touchStart, { passive: true, capture: true });
    board.addEventListener("touchmove", touchMove, { passive: false, capture: true });
    board.addEventListener("touchend", touchEnd, { passive: false, capture: true });
    board.addEventListener("touchcancel", touchCancel, { passive: true, capture: true });

    overlay.addEventListener("click", event => {
      const testBtn = event.target.closest("button[data-test]");
      if (testBtn) {
        prepniTest(Number(testBtn.dataset.test));
        return;
      }
      const action = event.target.closest("button[data-lab]")?.dataset?.lab;
      if (action === "reset") reset();
      if (action === "close") {
        log("CLOSE");
        stop();
      }
    });

    log(`START | TESTS 1-3 | cards=6 | equal=yes | viewport=${window.innerWidth}x${window.innerHeight}`);
    log(`ORDER | ${formatPoradi()}`);
    log(`TEST ACTIVE | test=1 | mode=${test().rezim} | expected=${formatPoradi(test().ocekavane)}`);

    instance = {
      stop,
      reset,
      prepniTest
    };
    return stop;
  }

  window.LubaNoteCardDragLab = {
    spust,
    stop: () => instance?.stop?.(),
    reset: () => instance?.reset?.(),
    prepniTest: cislo => instance?.prepniTest?.(Number(cislo))
  };
})();
