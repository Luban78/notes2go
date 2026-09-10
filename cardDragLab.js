/* ==========================================
   LUBANOTE – CARD DRAG LAB / TUNING PANEL
   14 ruzne vysokych syntetickych karet, bez auto-scrollu.
   Libovolna karta -> libovolny slot.

   Model:
   - poradi je jedna linearni rada
   - dva sloupce jsou jen vizualni zobrazeni slotu
   - pri vyjmuti karty zustane dira v jejim puvodnim slotu
   - pri beznem prejizdeni se ostatni karty vubec nehybou
   - novy slot se nejdriv jen oznaci jako kandidat
   - az po kratkem klidu nad presnym slotem se cil zamkne
     a karty mezi zdrojem a cilem se jednorazove posunou po hadovi
   - po pusteni karta zapadne do posledniho zamknuteho slotu
   ========================================== */

(() => {
  "use strict";

  const FPS_UPDATE_INTERVAL = 500;
  const POCET_KARET = 14;
  const VYCHOZI_PORADI = Array.from({ length: POCET_KARET }, (_, i) => i + 1);
  const VYSKY_KARET = [0, 48, 76, 58, 88, 52, 68, 82, 46, 72, 56, 86, 62, 50, 78];
  const MEZERA_X = 10;
  const MEZERA_Y = 7;

  const VYCHOZI_NASTAVENI = Object.freeze({
    scalePct: 90,
    ghostScalePct: 103,
    longPressMs: 430,
    preLongMovePx: 16,
    dwellMs: 320,
    reorderMs: 320,
    focusMs: 220,
    insetPx: 8,
    jitterPx: 11,
    detailLog: false
  });

  const DEFINICE_PARAMETRU = Object.freeze({
    scalePct: { label: "Scale okolnich", unit: "%", min: 78, max: 100, step: 1 },
    ghostScalePct: { label: "Scale tazene", unit: "%", min: 100, max: 110, step: 1 },
    longPressMs: { label: "Long press", unit: "ms", min: 200, max: 700, step: 20 },
    preLongMovePx: { label: "Pohyb pred LP", unit: "px", min: 6, max: 30, step: 1 },
    dwellMs: { label: "Dwell / zamknuti", unit: "ms", min: 120, max: 600, step: 20 },
    reorderMs: { label: "Animace presunu", unit: "ms", min: 0, max: 700, step: 20 },
    focusMs: { label: "Animace scale", unit: "ms", min: 0, max: 500, step: 20 },
    insetPx: { label: "Presny slot inset", unit: "px", min: 0, max: 20, step: 1 },
    jitterPx: { label: "Tolerance klidu", unit: "px", min: 3, max: 25, step: 1 }
  });

  let instance = null;

  function vlozStyly() {
    document.getElementById("ln-card-drag-lab-style")?.remove();

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
        --ln-cdl-focus-scale: .90;
        --ln-cdl-ghost-scale: 1.03;
        --ln-cdl-focus-ms: 220ms;
        --ln-cdl-reorder-ms: 320ms;
      }

      #ln-card-drag-lab .ln-cdl-head {
        flex: 0 0 auto !important;
        display: grid !important;
        grid-template-columns: minmax(0, 1fr) auto !important;
        gap: 8px !important;
        align-items: center !important;
        padding: max(7px, env(safe-area-inset-top)) 9px 7px !important;
        border-bottom: 1px solid var(--color-border, rgba(255,255,255,.2)) !important;
        background: var(--color-surface, #0b2635) !important;
      }

      #ln-card-drag-lab .ln-cdl-head strong {
        display: block !important;
        font-size: 17px !important;
        line-height: 1.1 !important;
      }

      #ln-card-drag-lab .ln-cdl-head small {
        display: block !important;
        margin-top: 2px !important;
        opacity: .72 !important;
        font-size: 10px !important;
      }

      #ln-card-drag-lab .ln-cdl-actions {
        display: flex !important;
        gap: 5px !important;
      }

      #ln-card-drag-lab button {
        min-height: 36px !important;
        padding: 6px 9px !important;
        border: 1px solid var(--color-border, rgba(255,255,255,.25)) !important;
        border-radius: 11px !important;
        background: var(--color-surface, #0b2635) !important;
        color: var(--color-text, #eef8ff) !important;
        font: inherit !important;
        font-size: 12px !important;
        touch-action: manipulation !important;
      }

      #ln-card-drag-lab .ln-cdl-test {
        flex: 0 0 auto !important;
        padding: 7px 10px !important;
        border-bottom: 1px solid var(--color-border, rgba(255,255,255,.15)) !important;
      }

      #ln-card-drag-lab .ln-cdl-test-title {
        font-size: 14px !important;
        font-weight: 900 !important;
        line-height: 1.25 !important;
      }

      #ln-card-drag-lab .ln-cdl-test-text {
        margin-top: 3px !important;
        font-size: 10.5px !important;
        line-height: 1.3 !important;
        opacity: .82 !important;
      }

      #ln-card-drag-lab .ln-cdl-state {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        gap: 8px !important;
        margin-top: 4px !important;
        font-size: 10px !important;
      }

      #ln-card-drag-lab .ln-cdl-status {
        min-width: 0 !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
      }

      #ln-card-drag-lab .ln-cdl-perf {
        flex: 0 0 auto !important;
        white-space: nowrap !important;
        opacity: .7 !important;
        font-variant-numeric: tabular-nums !important;
      }

      #ln-card-drag-lab .ln-cdl-board {
        flex: 1 1 auto !important;
        min-height: 0 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        padding: 7px 10px !important;
        touch-action: none !important;
        overflow: hidden !important;
      }

      #ln-card-drag-lab .ln-cdl-grid {
        position: relative !important;
        display: block !important;
        width: 100% !important;
        max-width: 390px !important;
        margin: 0 auto !important;
        transition: height var(--ln-cdl-reorder-ms) cubic-bezier(.4,0,.2,1) !important;
      }

      #ln-card-drag-lab .ln-cdl-slot {
        position: absolute !important;
        min-width: 0 !important;
        margin: 0 !important;
        border: 1px dashed color-mix(in srgb, var(--color-border, rgba(255,255,255,.25)) 75%, transparent) !important;
        border-radius: 13px !important;
        transition: border-color .15s ease, background .15s ease, box-shadow .15s ease !important;
      }

      #ln-card-drag-lab .ln-cdl-slot::after {
        content: "S" attr(data-slot) !important;
        position: absolute !important;
        right: 5px !important;
        bottom: 2px !important;
        font-size: 7.5px !important;
        opacity: .38 !important;
        pointer-events: none !important;
      }

      #ln-card-drag-lab .ln-cdl-slot.ln-cdl-hole {
        border-color: color-mix(in srgb, var(--color-accent, #20c7d9) 70%, transparent) !important;
        background: color-mix(in srgb, var(--color-accent, #20c7d9) 8%, transparent) !important;
      }

      #ln-card-drag-lab .ln-cdl-slot.ln-cdl-candidate {
        border: 2px solid color-mix(in srgb, var(--color-accent, #20c7d9) 72%, transparent) !important;
        background: color-mix(in srgb, var(--color-accent, #20c7d9) 8%, transparent) !important;
        box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--color-accent, #20c7d9) 12%, transparent) !important;
      }

      #ln-card-drag-lab .ln-cdl-slot.ln-cdl-candidate::before {
        content: "DRZ" !important;
        position: absolute !important;
        inset: 0 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        font-size: 10px !important;
        font-weight: 900 !important;
        color: var(--color-accent, #20c7d9) !important;
        pointer-events: none !important;
      }

      #ln-card-drag-lab .ln-cdl-slot.ln-cdl-target {
        border: 2px solid var(--color-accent, #20c7d9) !important;
        background: color-mix(in srgb, var(--color-accent, #20c7d9) 16%, transparent) !important;
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-accent, #20c7d9) 20%, transparent) !important;
      }

      #ln-card-drag-lab .ln-cdl-slot.ln-cdl-target::before {
        content: "SEM " attr(data-drag-number) !important;
        position: absolute !important;
        inset: 0 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        font-size: 10px !important;
        font-weight: 900 !important;
        color: var(--color-accent, #20c7d9) !important;
        pointer-events: none !important;
      }

      #ln-card-drag-lab .ln-cdl-card {
        position: absolute !important;
        inset: 0 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        border: 2px solid var(--color-border, rgba(255,255,255,.18)) !important;
        border-radius: 13px !important;
        background: var(--color-surface, #123547) !important;
        color: var(--color-text, #eef8ff) !important;
        box-shadow: 0 2px 8px rgba(0,0,0,.12) !important;
        user-select: none !important;
        -webkit-user-select: none !important;
        -webkit-touch-callout: none !important;
        touch-action: none !important;
        overflow: hidden !important;
        will-change: transform, scale !important;
        scale: 1 !important;
        transition: scale var(--ln-cdl-focus-ms) cubic-bezier(.4,0,.2,1) !important;
      }

      #ln-card-drag-lab.ln-cdl-focus-mode .ln-cdl-card:not(.ln-cdl-source-anchor) {
        scale: var(--ln-cdl-focus-scale) !important;
      }

      #ln-card-drag-lab .ln-cdl-card.ln-cdl-source-anchor {
        visibility: hidden !important;
        pointer-events: none !important;
      }

      #ln-card-drag-lab .ln-cdl-number,
      .ln-cdl-ghost .ln-cdl-number {
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: 38px !important;
        height: 34px !important;
        border-radius: 11px !important;
        background: var(--color-accent, #20c7d9) !important;
        color: var(--color-accent-text, #001014) !important;
        font-size: 19px !important;
        font-weight: 950 !important;
        font-variant-numeric: tabular-nums !important;
      }

      .ln-cdl-ghost {
        position: fixed !important;
        z-index: 2147483646 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        border: 2px solid var(--color-accent, #20c7d9) !important;
        border-radius: 13px !important;
        background: var(--color-surface, #123547) !important;
        color: var(--color-text, #eef8ff) !important;
        box-shadow: 0 14px 34px rgba(0,0,0,.42) !important;
        pointer-events: none !important;
        transform: scale(var(--ln-cdl-ghost-scale)) !important;
      }

      #ln-card-drag-lab .ln-cdl-parking {
        position: fixed !important;
        left: -10000px !important;
        top: -10000px !important;
        width: 1px !important;
        height: 1px !important;
        overflow: hidden !important;
      }

      #ln-card-drag-lab .ln-cdl-tune-panel {
        position: absolute !important;
        z-index: 30 !important;
        top: 52px !important;
        left: 7px !important;
        right: 7px !important;
        max-height: calc(100% - 62px) !important;
        overflow: auto !important;
        padding: 9px !important;
        border: 1px solid var(--color-border, rgba(255,255,255,.25)) !important;
        border-radius: 14px !important;
        background: color-mix(in srgb, var(--color-surface, #0b2635) 96%, #000 4%) !important;
        box-shadow: 0 16px 36px rgba(0,0,0,.42) !important;
        overscroll-behavior: contain !important;
      }

      #ln-card-drag-lab .ln-cdl-tune-panel[hidden] { display: none !important; }

      #ln-card-drag-lab .ln-cdl-tune-top {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        gap: 8px !important;
        margin-bottom: 7px !important;
      }

      #ln-card-drag-lab .ln-cdl-tune-top strong { font-size: 14px !important; }

      #ln-card-drag-lab .ln-cdl-tune-buttons {
        display: flex !important;
        gap: 5px !important;
      }

      #ln-card-drag-lab .ln-cdl-tune-grid {
        display: grid !important;
        gap: 5px !important;
      }

      #ln-card-drag-lab .ln-cdl-tune-row {
        display: grid !important;
        grid-template-columns: minmax(0,1fr) 62px 38px 38px !important;
        gap: 5px !important;
        align-items: center !important;
        min-height: 36px !important;
        padding: 3px 5px !important;
        border: 1px solid color-mix(in srgb, var(--color-border, rgba(255,255,255,.2)) 65%, transparent) !important;
        border-radius: 10px !important;
      }

      #ln-card-drag-lab .ln-cdl-tune-label {
        min-width: 0 !important;
        font-size: 11px !important;
        font-weight: 750 !important;
      }

      #ln-card-drag-lab .ln-cdl-tune-value {
        text-align: right !important;
        font-size: 11px !important;
        font-weight: 900 !important;
        font-variant-numeric: tabular-nums !important;
        white-space: nowrap !important;
      }

      #ln-card-drag-lab .ln-cdl-tune-row button {
        min-height: 31px !important;
        padding: 2px !important;
        font-size: 18px !important;
        line-height: 1 !important;
      }

      #ln-card-drag-lab .ln-cdl-tune-footer {
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
        gap: 6px !important;
        margin-top: 7px !important;
      }

      #ln-card-drag-lab .ln-cdl-tune-hint {
        margin-top: 6px !important;
        font-size: 9.5px !important;
        line-height: 1.3 !important;
        opacity: .72 !important;
      }

      #ln-card-drag-lab .ln-cdl-result {
        flex: 0 0 auto !important;
        min-height: 48px !important;
        padding: 7px 10px calc(7px + env(safe-area-inset-bottom)) !important;
        border-top: 1px solid var(--color-border, rgba(255,255,255,.15)) !important;
        background: var(--color-surface, #0b2635) !important;
        font-size: 10.5px !important;
        line-height: 1.3 !important;
      }
    `;
    document.head.appendChild(style);
  }

  function spust(zapis = () => {}) {
    instance?.stop?.();
    vlozStyly();

    let overlay = null;
    let board = null;
    let grid = null;
    let result = null;
    let status = null;
    let perf = null;
    let parking = null;
    let tunePanel = null;
    let testText = null;
    let slots = [];
    let cards = new Map();
    let poradi = [...VYCHOZI_PORADI];
    let pending = null;
    let drag = null;
    let longPressTimer = null;
    let cilTimer = null;
    let animaceTimer = null;
    let fpsFrame = null;
    let stopnuto = false;
    let nastaveni = { ...VYCHOZI_NASTAVENI };

    const fps = {
      lastTs: 0,
      windowStart: 0,
      framesWindow: 0,
      current: 0,
      slow: 0,
      worst: 0
    };

    function log(text) {
      zapis(`LABS ${text}`);
    }

    function logDetail(text) {
      if (nastaveni.detailLog) log(text);
    }

    function omez(hodnota, min, max) {
      return Math.min(max, Math.max(min, hodnota));
    }

    function formatHodnoty(klic) {
      const def = DEFINICE_PARAMETRU[klic];
      return `${nastaveni[klic]} ${def.unit}`;
    }

    function souhrnNastaveni() {
      return `scale=${nastaveni.scalePct}% | ghost=${nastaveni.ghostScalePct}% | longpress=${nastaveni.longPressMs}ms | preMove=${nastaveni.preLongMovePx}px | dwell=${nastaveni.dwellMs}ms | reorder=${nastaveni.reorderMs}ms | focus=${nastaveni.focusMs}ms | inset=${nastaveni.insetPx}px | jitter=${nastaveni.jitterPx}px | detailLog=${nastaveni.detailLog ? "on" : "off"}`;
    }

    function aplikujNastaveni({ zapisLog = false } = {}) {
      if (!overlay) return;
      overlay.style.setProperty("--ln-cdl-focus-scale", String(nastaveni.scalePct / 100));
      overlay.style.setProperty("--ln-cdl-ghost-scale", String(nastaveni.ghostScalePct / 100));
      overlay.style.setProperty("--ln-cdl-focus-ms", `${nastaveni.focusMs}ms`);
      overlay.style.setProperty("--ln-cdl-reorder-ms", `${nastaveni.reorderMs}ms`);

      DEFINICE_PARAMETRU && Object.keys(DEFINICE_PARAMETRU).forEach(klic => {
        const el = tunePanel?.querySelector(`[data-param-value="${klic}"]`);
        if (el) el.textContent = formatHodnoty(klic);
      });
      const detailBtn = tunePanel?.querySelector('[data-lab="detail-log"]');
      if (detailBtn) detailBtn.textContent = `Detail log: ${nastaveni.detailLog ? "ZAP" : "VYP"}`;
      if (testText) {
        testText.textContent = `Scale ${nastaveni.scalePct} % · long press ${nastaveni.longPressMs} ms · dwell ${nastaveni.dwellMs} ms · přesun ${nastaveni.reorderMs} ms · focus ${nastaveni.focusMs} ms. Změny v panelu platí okamžitě.`;
      }
      if (zapisLog) log(`TUNE | ${souhrnNastaveni()}`);
    }

    function zmenParametr(klic, smer) {
      const def = DEFINICE_PARAMETRU[klic];
      if (!def) return;
      const dalsi = omez(nastaveni[klic] + def.step * smer, def.min, def.max);
      if (dalsi === nastaveni[klic]) return;
      nastaveni[klic] = dalsi;
      aplikujNastaveni({ zapisLog: true });
    }

    function resetNastaveni() {
      nastaveni = { ...VYCHOZI_NASTAVENI };
      aplikujNastaveni({ zapisLog: true });
      status.textContent = "Parametry vráceny na výchozí hodnoty 0.9.343.";
    }

    function vytvorRadkyTuningu() {
      return Object.entries(DEFINICE_PARAMETRU).map(([klic, def]) => `
        <div class="ln-cdl-tune-row">
          <span class="ln-cdl-tune-label">${def.label}</span>
          <span class="ln-cdl-tune-value" data-param-value="${klic}">${nastaveni[klic]} ${def.unit}</span>
          <button type="button" data-param="${klic}" data-delta="-1" aria-label="${def.label} minus">−</button>
          <button type="button" data-param="${klic}" data-delta="1" aria-label="${def.label} plus">+</button>
        </div>`).join("");
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

    function vyskaKarty(cislo) {
      return VYSKY_KARET[cislo] || 56;
    }

    function vytvorKartu(cislo) {
      const card = document.createElement("article");
      card.className = "ln-cdl-card";
      card.dataset.number = String(cislo);
      card.dataset.vyska = String(vyskaKarty(cislo));
      card.innerHTML = `<span class="ln-cdl-number">${cislo}</span>`;
      cards.set(cislo, card);
      return card;
    }

    function vytvorSloty() {
      grid.innerHTML = "";
      slots = [];
      cards = new Map();
      for (let i = 1; i <= POCET_KARET; i += 1) {
        const slot = document.createElement("div");
        slot.className = "ln-cdl-slot";
        slot.dataset.slot = String(i);
        grid.appendChild(slot);
        slots.push(slot);
      }
      for (let i = 1; i <= POCET_KARET; i += 1) vytvorKartu(i);
    }


    function rozmisteniSlotu(mapa) {
      const vyskaDiry = drag ? vyskaKarty(drag.cislo) : 56;
      const y = [0, 0];

      slots.forEach((slot, index) => {
        const sloupec = index % 2;
        const cislo = mapa[index];
        const vyska = cislo == null ? vyskaDiry : vyskaKarty(cislo);

        slot.style.left = sloupec === 0 ? "0" : `calc(50% + ${MEZERA_X / 2}px)`;
        slot.style.width = `calc(50% - ${MEZERA_X / 2}px)`;
        slot.style.top = `${y[sloupec]}px`;
        slot.style.height = `${vyska}px`;

        y[sloupec] += vyska + MEZERA_Y;
      });

      const leva = Math.max(0, y[0] - MEZERA_Y);
      const prava = Math.max(0, y[1] - MEZERA_Y);
      grid.style.height = `${Math.max(leva, prava)}px`;
    }

    function snapshotRectu() {
      const recty = new Map();
      cards.forEach((card, cislo) => {
        if (card.isConnected && card.parentElement?.classList.contains("ln-cdl-slot")) {
          recty.set(cislo, card.getBoundingClientRect());
        }
      });
      return recty;
    }

    function animujFlip(stareRecty) {
      cards.forEach((card, cislo) => {
        if (!card.isConnected || !card.parentElement?.classList.contains("ln-cdl-slot")) return;
        const stary = stareRecty.get(cislo);
        if (!stary) return;
        const novy = card.getBoundingClientRect();
        const dx = stary.left - novy.left;
        const dy = stary.top - novy.top;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
        card.style.transition = "none";
        card.style.transform = `translate(${dx}px, ${dy}px)`;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            card.style.transition = `transform ${nastaveni.reorderMs}ms cubic-bezier(.4,0,.2,1), scale ${nastaveni.focusMs}ms cubic-bezier(.4,0,.2,1)`;
            card.style.transform = "translate(0, 0)";
          });
        });
      });
    }

    function umistiMapu(mapa, { animuj = false } = {}) {
      const stareRecty = animuj ? snapshotRectu() : null;
      rozmisteniSlotu(mapa);

      slots.forEach(slot => {
        slot.classList.remove("ln-cdl-hole", "ln-cdl-target", "ln-cdl-candidate");
        slot.removeAttribute("data-drag-number");
        [...slot.children].forEach(child => {
          // Pri aktivnim dragu zachovej puvodni kartu pripojenou v DOM,
          // aby stejny touch stream pokracoval i po long-press pickup.
          if (drag?.source === child) return;
          slot.removeChild(child);
        });
      });

      mapa.forEach((cislo, index) => {
        const slot = slots[index];
        if (cislo == null) {
          slot.classList.add("ln-cdl-hole");
          return;
        }
        const card = cards.get(cislo);
        if (card) slot.appendChild(card);
      });

      if (animuj && stareRecty) animujFlip(stareRecty);
    }

    function mapaProCil(cilIndex) {
      const bezZdroj = poradi.filter((_, index) => index !== drag.sourceIndex);
      const mapa = [...bezZdroj];
      mapa.splice(cilIndex, 0, null);
      return mapa.slice(0, POCET_KARET);
    }

    function finalniPoradi(cilIndex) {
      const bezZdroj = poradi.filter((_, index) => index !== drag.sourceIndex);
      const nove = [...bezZdroj];
      nove.splice(cilIndex, 0, drag.cislo);
      return nove.slice(0, POCET_KARET);
    }

    function zvyrazniCil(cilIndex) {
      slots.forEach(slot => {
        slot.classList.remove("ln-cdl-target");
        slot.removeAttribute("data-drag-number");
      });
      if (!drag || cilIndex == null) return;
      const slot = slots[cilIndex];
      if (!slot) return;
      slot.classList.add("ln-cdl-target");
      slot.dataset.dragNumber = String(drag.cislo);
    }

    function zvyrazniKandidata(cilIndex) {
      slots.forEach(slot => slot.classList.remove("ln-cdl-candidate"));
      if (cilIndex == null) return;
      slots[cilIndex]?.classList.add("ln-cdl-candidate");
    }

    function zrusCilTimer() {
      if (!cilTimer) return;
      clearTimeout(cilTimer);
      cilTimer = null;
    }

    function zrusAnimaceTimer() {
      if (!animaceTimer) return;
      clearTimeout(animaceTimer);
      animaceTimer = null;
    }

    function zmrazAktualniMapuPoLocku() {
      if (!drag) return;
      drag.frozenSlotRects = slots.map(slot => zmrazRect(slot.getBoundingClientRect()));
      drag.frozenGridRect = zmrazRect(grid.getBoundingClientRect());
      drag.lockAnimating = false;
      log(`REFREEZE AFTER LOCK | card=${drag.cislo} | target=${drag.targetIndex + 1} | slots=${drag.frozenSlotRects.length} | grid=${Math.round(drag.frozenGridRect.width)}x${Math.round(drag.frozenGridRect.height)}`);

      // Pokud uz prst behem pomale animace stoji nad dalsim slotem,
      // vyhodnotime ho az ted proti nove, znovu zmrazene mape.
      const cil = najdiPresnySlot(drag.lastX, drag.lastY);
      zpracujKandidata(cil, drag.lastX, drag.lastY);
    }

    function vycistiKandidata() {
      zrusCilTimer();
      zvyrazniKandidata(null);
      if (!drag) return;
      drag.candidateIndex = null;
      drag.candidateStartX = null;
      drag.candidateStartY = null;
    }

    function zmrazRect(rect) {
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height
      };
    }

    function vnitrniRect(rect) {
      const inset = Math.min(
        nastaveni.insetPx,
        Math.max(3, rect.width * 0.12),
        Math.max(3, rect.height * 0.18)
      );
      return {
        left: rect.left + inset,
        right: rect.right - inset,
        top: rect.top + inset,
        bottom: rect.bottom - inset
      };
    }

    function bodVRectu(x, y, rect) {
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    }

    function najdiPresnySlot(x, y) {
      // Cil se pocita jen z mapy zmrazene pri PICKUP. Navic pouzivame
      // vnitrni cast slotu: rychly prejezd pres okraj nebo mezeru nesmi
      // sam od sebe spustit preskladani.
      const recty = drag?.frozenSlotRects;
      if (recty?.length) {
        for (let i = 0; i < recty.length; i += 1) {
          if (bodVRectu(x, y, vnitrniRect(recty[i]))) return i;
        }
        return null;
      }

      for (let i = 0; i < slots.length; i += 1) {
        const r = vnitrniRect(slots[i].getBoundingClientRect());
        if (bodVRectu(x, y, r)) return i;
      }
      return null;
    }

    function pohniGhost(x, y) {
      if (!drag?.ghost) return;
      drag.ghost.style.left = `${x - drag.offsetX}px`;
      drag.ghost.style.top = `${y - drag.offsetY}px`;
    }

    function nastavPreview(cilIndex) {
      if (!drag || cilIndex == null || cilIndex === drag.targetIndex) return;
      zrusAnimaceTimer();
      drag.targetIndex = cilIndex;
      drag.lockAnimating = true;
      umistiMapu(mapaProCil(cilIndex), { animuj: true });
      zvyrazniCil(cilIndex);
      const smer = cilIndex < drag.sourceIndex ? "nahoru" : cilIndex > drag.sourceIndex ? "dolu" : "zpet";
      status.textContent = `Cíl zamknutý: ${drag.cislo} → slot ${cilIndex + 1}. Karty se pomalu uspořádají…`;
      log(`SLOT LOCK | card=${drag.cislo} | ${drag.sourceIndex + 1}->${cilIndex + 1} | dir=${smer} | anim=${nastaveni.reorderMs}ms`);

      // Behem samotneho preskladani uz nehledame dalsi cil podle stare mapy.
      // Po dokonceni animace mapu jednou znovu zmerime a zmrazime.
      animaceTimer = setTimeout(() => {
        animaceTimer = null;
        zmrazAktualniMapuPoLocku();
      }, nastaveni.reorderMs + 24);
    }

    function naplanujZamknutiKandidata(cilIndex) {
      zrusCilTimer();
      cilTimer = setTimeout(() => {
        cilTimer = null;
        if (!drag || drag.candidateIndex !== cilIndex) return;
        const stalePresny = najdiPresnySlot(drag.lastX, drag.lastY);
        if (stalePresny !== cilIndex) {
          vycistiKandidata();
          return;
        }

        log(`DWELL OK | card=${drag.cislo} | slot=${cilIndex + 1} | ms=${nastaveni.dwellMs}`);
        vycistiKandidata();
        nastavPreview(cilIndex);
      }, nastaveni.dwellMs);
    }

    function zpracujKandidata(cilIndex, x, y) {
      if (!drag) return;

      // Jsme znovu nad uz zamknutym cilem: nic dalsiho neprestavujeme.
      if (cilIndex === drag.targetIndex) {
        if (drag.candidateIndex != null) vycistiKandidata();
        return;
      }

      if (cilIndex == null) {
        if (drag.candidateIndex != null) {
          logDetail(`CANDIDATE CANCEL | card=${drag.cislo} | reason=left-zone`);
          vycistiKandidata();
        }
        return;
      }

      if (drag.candidateIndex !== cilIndex) {
        vycistiKandidata();
        drag.candidateIndex = cilIndex;
        drag.candidateStartX = x;
        drag.candidateStartY = y;
        zvyrazniKandidata(cilIndex);
        status.textContent = `Slot ${cilIndex + 1}: chvíli podrž… (${nastaveni.dwellMs} ms)`;
        logDetail(`CANDIDATE | card=${drag.cislo} | slot=${cilIndex + 1} | @${Math.round(x)},${Math.round(y)}`);
        naplanujZamknutiKandidata(cilIndex);
        return;
      }

      const pohyb = Math.hypot(x - drag.candidateStartX, y - drag.candidateStartY);
      if (pohyb > nastaveni.jitterPx) {
        drag.candidateStartX = x;
        drag.candidateStartY = y;
        logDetail(`DWELL RESET | card=${drag.cislo} | slot=${cilIndex + 1} | move=${Math.round(pohyb)}px`);
        naplanujZamknutiKandidata(cilIndex);
      }
    }

    function pickup() {
      if (!pending || drag) return;
      const source = pending.card;
      const cislo = Number(source.dataset.number);
      const sourceIndex = poradi.indexOf(cislo);
      if (sourceIndex < 0) {
        pending = null;
        return;
      }

      const rect = source.getBoundingClientRect();
      const frozenSlotRects = slots.map(slot => zmrazRect(slot.getBoundingClientRect()));
      const frozenGridRect = zmrazRect(grid.getBoundingClientRect());
      const ghost = document.createElement("div");
      ghost.className = "ln-cdl-ghost";
      ghost.innerHTML = source.innerHTML;
      ghost.style.width = `${rect.width}px`;
      ghost.style.height = `${rect.height}px`;
      document.body.appendChild(ghost);

      drag = {
        touchId: pending.touchId,
        source,
        cislo,
        sourceIndex,
        targetIndex: sourceIndex,
        candidateIndex: null,
        candidateStartX: null,
        candidateStartY: null,
        ghost,
        offsetX: pending.lastX - rect.left,
        offsetY: pending.lastY - rect.top,
        lastX: pending.lastX,
        lastY: pending.lastY,
        firstMoveLogged: false,
        lockAnimating: false,
        frozenSlotRects,
        frozenGridRect
      };

      // Dulezite pro Android/WebView: puvodni touch target nesmime behem
      // jednoho dotyku odpojit z DOM. Kartu nechame ve zdrojovem slotu
      // jako neviditelny touch-anchor; vizualne ji zastupuje ghost.
      source.classList.add("ln-cdl-source-anchor");
      overlay.classList.add("ln-cdl-focus-mode");
      umistiMapu(mapaProCil(sourceIndex));
      zvyrazniCil(null);
      pohniGhost(drag.lastX, drag.lastY);
      status.textContent = `Držíš ${cislo}. Přejeď na nový slot a chvíli nad ním zůstaň.`;
      log(`PICKUP | card=${cislo} | from=${sourceIndex + 1} | hole=${sourceIndex + 1} | @${Math.round(drag.lastX)},${Math.round(drag.lastY)}`);
      log(`FOCUS ON | card=${cislo} | others-scale=${nastaveni.scalePct}% | ghost-scale=${nastaveni.ghostScalePct}% | anim=${nastaveni.focusMs}ms`);
      log(`FROZEN MAP | slots=${frozenSlotRects.length} | precise-inset=${nastaveni.insetPx}px | dwell=${nastaveni.dwellMs}ms | jitter=${nastaveni.jitterPx}px | grid=${Math.round(frozenGridRect.width)}x${Math.round(frozenGridRect.height)}`);
      pending = null;
    }

    function dokoncitDrop() {
      const puvodniSlot = drag.sourceIndex + 1;
      const cilovySlot = drag.targetIndex + 1;
      const novePoradi = finalniPoradi(drag.targetIndex);
      const changed = drag.targetIndex !== drag.sourceIndex;

      poradi = novePoradi;
      drag.source.classList.remove("ln-cdl-source-anchor");
      parking.appendChild(drag.source);
      umistiMapu(poradi, { animuj: false });
      zvyrazniCil(null);
      zvyrazniKandidata(null);
      overlay.classList.remove("ln-cdl-focus-mode");
      log(`FOCUS OFF | card=${drag.cislo} | restore=100% | anim=${nastaveni.focusMs}ms`);

      result.innerHTML = changed
        ? `✅ Poslední přesun: <strong>${drag.cislo}</strong> ze slotu <strong>${puvodniSlot}</strong> do slotu <strong>${cilovySlot}</strong>.<br>Pořadí: <strong>${poradi.join(", ")}</strong>`
        : `Beze změny. Karta <strong>${drag.cislo}</strong> zůstala ve slotu <strong>${puvodniSlot}</strong>.<br>Pořadí: <strong>${poradi.join(", ")}</strong>`;
      status.textContent = changed
        ? `Hotovo: ${drag.cislo} → slot ${cilovySlot}. Zkus další kombinaci.`
        : `Karta ${drag.cislo} zůstala na svém místě.`;
      log(`DROP | card=${drag.cislo} | ${puvodniSlot}->${cilovySlot} | changed=${changed ? "yes" : "no"}`);
      log(`ORDER | [${poradi.join(",")}]`);
    }

    function vratitPoZruseni() {
      drag.source.classList.remove("ln-cdl-source-anchor");
      parking.appendChild(drag.source);
      umistiMapu(poradi, { animuj: false });
      zvyrazniCil(null);
      zvyrazniKandidata(null);
      overlay.classList.remove("ln-cdl-focus-mode");
      log(`FOCUS OFF | card=${drag.cislo} | restore=100% | anim=${nastaveni.focusMs}ms`);
      status.textContent = `Pusteno bez zamknuteho cile. Karta ${drag.cislo} se vratila.`;
      result.innerHTML = `Beze změny. Pořadí: <strong>${poradi.join(", ")}</strong>`;
      log(`DROP | card=${drag.cislo} | target=none | changed=no`);
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

      zrusCilTimer();
      zrusAnimaceTimer();
      zvyrazniKandidata(null);

      if (!cancel && drag.candidateIndex != null) {
        log(`DROP BEFORE LOCK | card=${drag.cislo} | candidate=${drag.candidateIndex + 1} | locked=${drag.targetIndex + 1}`);
      }

      // Pusteni uz samo novy cil nevytvori. Platny je jen posledni slot,
      // ktery byl potvrzen kratkym klidem prstu. Pokud se zadny novy cil
      // nezamkl, targetIndex zustava sourceIndex a poradi se nezmeni.
      const maCil = !cancel && drag.targetIndex != null;
      drag.ghost.remove();
      if (maCil) dokoncitDrop();
      else vratitPoZruseni();

      drag = null;
      pending = null;
    }

    function ziskejTouch(list, id) {
      return [...(list || [])].find(t => t.identifier === id) || null;
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
      log(`TOUCH START | id=${t.identifier} | card=${card.dataset.number} | @${Math.round(t.clientX)},${Math.round(t.clientY)}`);
      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        pickup();
      }, nastaveni.longPressMs);
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
        if (d > nastaveni.preLongMovePx) {
          if (longPressTimer) clearTimeout(longPressTimer);
          longPressTimer = null;
          pending = null;
        }
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      if (!drag.firstMoveLogged) {
        drag.firstMoveLogged = true;
        log(`FIRST MOVE AFTER PICKUP | id=${id} | card=${drag.cislo} | @${Math.round(t.clientX)},${Math.round(t.clientY)}`);
      }
      drag.lastX = t.clientX;
      drag.lastY = t.clientY;
      pohniGhost(t.clientX, t.clientY);
      if (drag.lockAnimating) return;
      const cil = najdiPresnySlot(t.clientX, t.clientY);
      zpracujKandidata(cil, t.clientX, t.clientY);
    }

    function touchEnd(event) {
      const id = drag?.touchId ?? pending?.touchId;
      if (id === undefined || id === null) return;
      const t = ziskejTouch(event.changedTouches, id);
      if (!t) return;

      if (drag) {
        event.preventDefault();
        event.stopPropagation();
        log(`TOUCH END | id=${id} | card=${drag.cislo} | @${Math.round(t.clientX)},${Math.round(t.clientY)}`);
        drag.lastX = t.clientX;
        drag.lastY = t.clientY;
        ukonciDrag();
      } else {
        if (longPressTimer) clearTimeout(longPressTimer);
        longPressTimer = null;
        pending = null;
      }
    }

    function touchCancel() {
      log("TOUCH CANCEL");
      ukonciDrag({ cancel: true });
    }

    function reset() {
      if (drag) {
        drag.ghost?.remove();
        drag.source?.classList.remove("ln-cdl-source-anchor");
        drag = null;
      }
      if (longPressTimer) clearTimeout(longPressTimer);
      longPressTimer = null;
      zrusCilTimer();
      zrusAnimaceTimer();
      pending = null;
      overlay?.classList.remove("ln-cdl-focus-mode");
      poradi = [...VYCHOZI_PORADI];
      cards.forEach(card => parking.appendChild(card));
      umistiMapu(poradi);
      result.innerHTML = `Aktuální pořadí: <strong>${poradi.join(", ")}</strong>`;
      status.textContent = "Dlouze podrž kartu, přejeď na slot a chvíli nad ním zůstaň.";
      resetPerf();
      log(`RESET | order=[${poradi.join(",")}]`);
    }

    function vytvorOverlay() {
      overlay = document.createElement("section");
      overlay.id = "ln-card-drag-lab";
      overlay.innerHTML = `
        <header class="ln-cdl-head">
          <div>
            <strong>🧪 Drag Lab – tuning</strong>
            <small>14 různě vysokých karet · živé ladění parametrů</small>
          </div>
          <div class="ln-cdl-actions">
            <button type="button" data-lab="tune">Ladit</button>
            <button type="button" data-lab="reset">Karty 1–14</button>
            <button type="button" data-lab="close">Zavřít</button>
          </div>
        </header>
        <section class="ln-cdl-test">
          <div class="ln-cdl-test-title">Had 1→2→3→…→14 · delayed lock + focus mode.</div>
          <div class="ln-cdl-test-text"></div>
          <div class="ln-cdl-state">
            <span class="ln-cdl-status">Dlouze podrž kartu, přejeď na slot a chvíli nad ním zůstaň.</span>
            <span class="ln-cdl-perf">FPS -- · >32 0 · worst 0ms</span>
          </div>
        </section>
        <section class="ln-cdl-tune-panel" hidden>
          <div class="ln-cdl-tune-top">
            <strong>⚙️ Tuning parametrů</strong>
            <div class="ln-cdl-tune-buttons">
              <button type="button" data-lab="defaults">Výchozí</button>
              <button type="button" data-lab="tune-close">Hotovo</button>
            </div>
          </div>
          <div class="ln-cdl-tune-grid">${vytvorRadkyTuningu()}</div>
          <div class="ln-cdl-tune-footer">
            <button type="button" data-lab="detail-log">Detail log: VYP</button>
            <button type="button" data-lab="fps-reset">Reset FPS</button>
          </div>
          <div class="ln-cdl-tune-hint">Změny platí okamžitě. „Karty 1–14“ resetuje jen pořadí; „Výchozí“ vrátí parametry. Pro čistší měření FPS nech Detail log vypnutý.</div>
        </section>
        <main class="ln-cdl-board">
          <div class="ln-cdl-grid"></div>
        </main>
        <div class="ln-cdl-result">Aktuální pořadí: <strong>${poradi.join(", ")}</strong></div>
        <div class="ln-cdl-parking" aria-hidden="true"></div>
      `;
      document.body.appendChild(overlay);
      board = overlay.querySelector(".ln-cdl-board");
      grid = overlay.querySelector(".ln-cdl-grid");
      result = overlay.querySelector(".ln-cdl-result");
      status = overlay.querySelector(".ln-cdl-status");
      perf = overlay.querySelector(".ln-cdl-perf");
      parking = overlay.querySelector(".ln-cdl-parking");
      tunePanel = overlay.querySelector(".ln-cdl-tune-panel");
      testText = overlay.querySelector(".ln-cdl-test-text");
      aplikujNastaveni();
      vytvorSloty();
      umistiMapu(poradi);
      fpsFrame = requestAnimationFrame(fpsLoop);
    }

    function stop() {
      if (stopnuto) return;
      stopnuto = true;
      if (longPressTimer) clearTimeout(longPressTimer);
      longPressTimer = null;
      zrusCilTimer();
      zrusAnimaceTimer();
      drag?.ghost?.remove();
      drag?.source?.classList.remove("ln-cdl-source-anchor");
      drag = null;
      pending = null;
      if (fpsFrame) cancelAnimationFrame(fpsFrame);
      fpsFrame = null;
      board?.removeEventListener("touchstart", touchStart, true);
      document.removeEventListener("touchmove", touchMove, true);
      document.removeEventListener("touchend", touchEnd, true);
      document.removeEventListener("touchcancel", touchCancel, true);
      overlay?.classList.remove("ln-cdl-focus-mode");
      overlay?.remove();
      overlay = null;
      instance = null;
    }

    vytvorOverlay();
    board.addEventListener("touchstart", touchStart, { passive: true, capture: true });
    // Move/end sleduj globalne: drag musi zustat jednim souvislym dotykem
    // i kdyz se pri preview presouvaji ostatni karty mezi sloty.
    document.addEventListener("touchmove", touchMove, { passive: false, capture: true });
    document.addEventListener("touchend", touchEnd, { passive: false, capture: true });
    document.addEventListener("touchcancel", touchCancel, { passive: true, capture: true });

    overlay.addEventListener("click", event => {
      const paramBtn = event.target.closest("button[data-param]");
      if (paramBtn) {
        zmenParametr(paramBtn.dataset.param, Number(paramBtn.dataset.delta) || 0);
        return;
      }

      const action = event.target.closest("button[data-lab]")?.dataset?.lab;
      if (action === "tune") tunePanel.hidden = !tunePanel.hidden;
      if (action === "tune-close") tunePanel.hidden = true;
      if (action === "reset") reset();
      if (action === "defaults") resetNastaveni();
      if (action === "fps-reset") {
        resetPerf();
        log(`FPS RESET | ${souhrnNastaveni()}`);
      }
      if (action === "detail-log") {
        nastaveni.detailLog = !nastaveni.detailLog;
        aplikujNastaveni({ zapisLog: true });
      }
      if (action === "close") {
        log("CLOSE");
        stop();
      }
    });

    log(`START | SNAKE TUNING PANEL TEST 0.9.344 | cards=14 | equal=no | continuous-touch=keep | viewport=${window.innerWidth}x${window.innerHeight}`);
    log("MODEL | one linear order 1->2->3->...->14; two columns are compact visual layout only");
    log(`HEIGHTS | ${VYSKY_KARET.slice(1).join(",")}`);
    log(`TUNING DEFAULTS | ${souhrnNastaveni()} | no auto-scroll`);

    instance = { stop, reset };
    return stop;
  }

  window.LubaNoteCardDragLab = {
    spust,
    stop: () => instance?.stop?.(),
    reset: () => instance?.reset?.()
  };
})();
