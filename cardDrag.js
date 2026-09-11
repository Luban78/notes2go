/* ==========================================
   LUBANOTE – DRAG & MOVE KARET
   Long press = přesun, 2× tap = menu karty.
   ========================================== */

(() => {
  const PRODUKCNI_DRAG_POVOLEN = true;
  const DOBA_DVOJTAPU = 300;
  const OKRAJ_SYSTEMOVEHO_GESTA = 24;
  const DEBUG_SCROLL_INTERVAL_MS = 180;
  const DRAG_TRACE_KEY = "lubaNoteCardDragTraceV1";
  const DRAG_TRACE_MAX = 90;
  const MIN_POHYB_PO_PICKUP_PRED_AUTOSCROLL = 18;
  const MIN_POHYB_PRO_PRVNI_LOG = 3;
  const SOUBOR_NASTAVENI_APK = "./card-drag-settings-apk.txt";
  const SOUBOR_NASTAVENI_DESKTOP = "./card-drag-settings-desktop.txt";

  /*
   * Výchozí hodnoty potvrzené v APK Drag Labu 0.9.345.
   * Reálné karty mají vlastní tuning panel, takže je můžeme ještě
   * doladit bez dalšího patchování kódu.
   */
  const VYCHOZI_NASTAVENI = Object.freeze({
    scalePct: 78,
    ghostScalePct: 110,
    longPressMs: 430,
    preLongMovePx: 16,
    dwellMs: 320,
    reorderMs: 700,
    dropMs: 180,
    focusMs: 20,
    insetPx: 8,
    jitterPx: 11,
    autoScrollEdgePx: 85,
    autoScrollMaxPx: 20,
    detailLog: true
  });

  const DEFINICE_PARAMETRU = Object.freeze({
    scalePct: { label: "Scale okolních", unit: "%", min: 70, max: 100, step: 1 },
    ghostScalePct: { label: "Scale tažené", unit: "%", min: 100, max: 120, step: 1 },
    longPressMs: { label: "Long press", unit: "ms", min: 200, max: 700, step: 20 },
    preLongMovePx: { label: "Pohyb před LP", unit: "px", min: 6, max: 30, step: 1 },
    dwellMs: { label: "Dwell / zamknutí", unit: "ms", min: 120, max: 600, step: 20 },
    reorderMs: { label: "Animace přesunu", unit: "ms", min: 0, max: 1000, step: 20 },
    dropMs: { label: "Položení karty", unit: "ms", min: 0, max: 500, step: 20 },
    focusMs: { label: "Animace scale", unit: "ms", min: 0, max: 500, step: 20 },
    insetPx: { label: "Přesný slot inset", unit: "px", min: 0, max: 20, step: 1 },
    jitterPx: { label: "Tolerance klidu", unit: "px", min: 3, max: 25, step: 1 },
    autoScrollEdgePx: { label: "Auto-scroll okraj", unit: "px", min: 45, max: 160, step: 5 },
    autoScrollMaxPx: { label: "Auto-scroll max", unit: "px/f", min: 4, max: 32, step: 2 }
  });

  function nactiNastaveni() {
    return { ...VYCHOZI_NASTAVENI };
  }

  let nastaveni = nactiNastaveni();
  let vychoziNastaveniZeSouboru = { ...VYCHOZI_NASTAVENI };
  let aktivniSouborNastaveni = SOUBOR_NASTAVENI_APK;
  const aktivniPointery = new Set();
  const aktivniTouchy = new Set();
  const konfigurace = new WeakMap();
  const casovaceLongPress = new WeakMap();
  const posledniTap = new WeakMap();
  const casovaceJednohoTapu = new WeakMap();
  const obejitKlik = new WeakSet();

  let aktivniPresun = null;
  let autoScrollFrame = null;
  let blokovatKlikDo = 0;

  let tuningPanel = null;
  let tuningTlacitko = null;
  let animaceLockTimer = null;

  function ulozNastaveni() {
    // Tuning panel mění hodnoty jen pro aktuální běh.
    // Trvalý zdroj je textový soubor načtený při startu.
  }

  const MAPA_RADKU_NASTAVENI = Object.freeze({
    "Scale okolních": "scalePct",
    "Scale tažené": "ghostScalePct",
    "Long press": "longPressMs",
    "Pohyb před LP": "preLongMovePx",
    "Dwell / zamknutí": "dwellMs",
    "Animace přesunu": "reorderMs",
    "Položení karty": "dropMs",
    "Animace scale": "focusMs",
    "Přesný slot inset": "insetPx",
    "Tolerance klidu": "jitterPx",
    "Auto-scroll okraj": "autoScrollEdgePx",
    "Auto-scroll max": "autoScrollMaxPx"
  });

  function jeAndroidApk() {
    try {
      return window.Capacitor?.getPlatform?.() === "android";
    } catch (_) {
      return false;
    }
  }

  function ziskejSouborNastaveni() {
    if (jeAndroidApk()) return SOUBOR_NASTAVENI_APK;
    return window.matchMedia("(min-width: 900px)").matches
      ? SOUBOR_NASTAVENI_DESKTOP
      : SOUBOR_NASTAVENI_APK;
  }

  function parsujNastaveniZeSouboru(text) {
    const vysledek = { ...VYCHOZI_NASTAVENI };
    String(text || "").split(/\r?\n/).forEach((radek) => {
      const pozice = radek.indexOf(":");
      if (pozice < 0) return;
      const popisek = radek.slice(0, pozice).trim();
      if (popisek === "Detail log") {
        const hodnota = radek.slice(pozice + 1).trim().toUpperCase();
        if (hodnota === "ZAP") vysledek.detailLog = true;
        if (hodnota === "VYP") vysledek.detailLog = false;
        return;
      }
      const klic = MAPA_RADKU_NASTAVENI[popisek];
      const def = DEFINICE_PARAMETRU[klic];
      if (!klic || !def) return;
      const shoda = radek.slice(pozice + 1).replace(",", ".").match(/-?\d+(?:\.\d+)?/);
      if (!shoda) return;
      const hodnota = Number(shoda[0]);
      if (!Number.isFinite(hodnota)) return;
      vysledek[klic] = Math.min(def.max, Math.max(def.min, hodnota));
    });
    return vysledek;
  }

  function textNastaveniProSoubor(hodnoty = nastaveni) {
    return [
      `Scale okolních: ${hodnoty.scalePct} %`,
      `Scale tažené: ${hodnoty.ghostScalePct} %`,
      `Long press: ${hodnoty.longPressMs} ms`,
      `Pohyb před LP: ${hodnoty.preLongMovePx} px`,
      `Dwell / zamknutí: ${hodnoty.dwellMs} ms`,
      `Animace přesunu: ${hodnoty.reorderMs} ms`,
      `Položení karty: ${hodnoty.dropMs} ms`,
      `Animace scale: ${hodnoty.focusMs} ms`,
      `Přesný slot inset: ${hodnoty.insetPx} px`,
      `Tolerance klidu: ${hodnoty.jitterPx} px`,
      `Auto-scroll okraj: ${hodnoty.autoScrollEdgePx} px`,
      `Auto-scroll max: ${hodnoty.autoScrollMaxPx} px/f`,
      `Detail log: ${hodnoty.detailLog ? "ZAP" : "VYP"}`
    ].join("\n");
  }

  async function nactiNastaveniZeSouboru() {
    aktivniSouborNastaveni = ziskejSouborNastaveni();
    try {
      const odpoved = await fetch(aktivniSouborNastaveni, { cache: "no-store" });
      if (!odpoved.ok) throw new Error(`HTTP ${odpoved.status}`);
      const text = await odpoved.text();
      const nactene = parsujNastaveniZeSouboru(text);
      nastaveni = { ...nactene };
      vychoziNastaveniZeSouboru = { ...nastaveni };
      emitujDragDebug("SETTINGS_FILE", {
        file: aktivniSouborNastaveni,
        ok: true,
        settings: souhrnNastaveni()
      });
    } catch (error) {
      nastaveni = { ...VYCHOZI_NASTAVENI };
      vychoziNastaveniZeSouboru = { ...nastaveni };
      emitujDragDebug("SETTINGS_FILE", {
        file: aktivniSouborNastaveni,
        ok: false,
        error: String(error?.message || error || "load-failed"),
        settings: souhrnNastaveni()
      });
    }
  }

  function souhrnNastaveni() {
    return `scale=${nastaveni.scalePct}% | ghost=${nastaveni.ghostScalePct}% | longpress=${nastaveni.longPressMs}ms | preMove=${nastaveni.preLongMovePx}px | dwell=${nastaveni.dwellMs}ms | reorder=${nastaveni.reorderMs}ms | drop=${nastaveni.dropMs}ms | focus=${nastaveni.focusMs}ms | inset=${nastaveni.insetPx}px | jitter=${nastaveni.jitterPx}px | autoEdge=${nastaveni.autoScrollEdgePx}px | autoMax=${nastaveni.autoScrollMaxPx}px/f`;
  }

  function vlozDragStyly() {
    if (document.getElementById("ln-card-drag-real-style")) return;
    const style = document.createElement("style");
    style.id = "ln-card-drag-real-style";
    style.textContent = `
      .taskCard.lubaCardDragSource {
        visibility: hidden !important;
        pointer-events: none !important;
        margin: 0 !important;
      }
      .taskCard.lubaCardDragGhost {
        transform: none !important;
        will-change: left, top, scale !important;
        transition: scale var(--ln-card-focus-ms, 20ms) cubic-bezier(.4,0,.2,1), box-shadow 120ms ease, opacity 120ms ease !important;
      }
      body.lubaCardDragMode .taskCard:not(.lubaCardDragSource):not(.lubaCardDragGhost) {
        transition: scale var(--ln-card-focus-ms, 20ms) cubic-bezier(.4,0,.2,1) !important;
      }
      body.lubaCardDragMode .taskCard.lubaCardDragBlockedGroup {
        filter: grayscale(1) saturate(.12) brightness(.82) !important;
        opacity: .46 !important;
        transition: scale var(--ln-card-focus-ms, 20ms) cubic-bezier(.4,0,.2,1), filter 160ms ease, opacity 160ms ease !important;
      }
      .lubaCardDragPlaceholder {
        position: relative !important;
        display: block !important;
        width: 100% !important;
        box-sizing: border-box !important;
        margin: 0 0 12px !important;
        border: 2px dashed color-mix(in srgb, var(--color-accent) 70%, transparent) !important;
        border-radius: 22px !important;
        background: color-mix(in srgb, var(--color-accent) 8%, transparent) !important;
        opacity: .8 !important;
        pointer-events: none !important;
      }
      .lubaCardDragPlaceholder.lubaCardDragPlaceholderTarget {
        border-style: solid !important;
        background: color-mix(in srgb, var(--color-accent) 16%, transparent) !important;
        box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--color-accent) 14%, transparent) !important;
      }
      .lubaCardDragPlaceholder.lubaCardDragPlaceholderTarget::after {
        content: "SEM";
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--color-accent);
        font-weight: 800;
        font-size: 12px;
      }
      .lubaCardDropMarker.lubaCardDropMarkerCandidate::after {
        content: "DRŽ";
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--color-accent);
        font-weight: 800;
        font-size: 12px;
      }
      #ln-card-drag-tuning,
      #ln-card-drag-tuning * { box-sizing: border-box; }
      #ln-card-drag-tuning {
        position: fixed;
        z-index: 2147483645;
        left: 14px;
        right: 14px;
        top: max(74px, env(safe-area-inset-top));
        max-height: calc(100dvh - 120px);
        overflow: auto;
        padding: 12px;
        border: 1px solid var(--color-border);
        border-radius: 18px;
        background: color-mix(in srgb, var(--color-background) 96%, transparent);
        color: var(--color-text);
        box-shadow: 0 18px 48px rgba(0,0,0,.28);
        backdrop-filter: blur(12px);
      }
      #ln-card-drag-tuning[hidden],
      #ln-card-drag-tuning-open[hidden] { display: none !important; }
      #ln-card-drag-tuning-open {
        position: fixed;
        z-index: 2147483644;
        top: max(78px, env(safe-area-inset-top));
        right: 14px;
        min-height: 44px;
        padding: 0 14px;
        border: 1px solid var(--color-border);
        border-radius: 14px;
        background: color-mix(in srgb, var(--color-background) 96%, transparent);
        color: var(--color-text);
        box-shadow: 0 8px 24px rgba(0,0,0,.22);
        font: inherit;
        font-weight: 700;
        backdrop-filter: blur(10px);
      }
      #ln-card-drag-tuning .ln-cdr-top,
      #ln-card-drag-tuning .ln-cdr-row,
      #ln-card-drag-tuning .ln-cdr-foot {
        display: grid;
        align-items: center;
        gap: 8px;
      }
      #ln-card-drag-tuning .ln-cdr-top { grid-template-columns: 1fr auto auto; margin-bottom: 10px; }
      #ln-card-drag-tuning .ln-cdr-top strong { font-size: 17px; }
      #ln-card-drag-tuning .ln-cdr-row {
        grid-template-columns: minmax(0,1fr) 82px 52px 52px;
        min-height: 52px;
        padding: 7px 9px;
        margin-top: 7px;
        border: 1px solid var(--color-border);
        border-radius: 13px;
      }
      #ln-card-drag-tuning .ln-cdr-row > span:first-child { font-weight: 700; text-align: center; }
      #ln-card-drag-tuning .ln-cdr-value { text-align: right; font-weight: 800; white-space: nowrap; }
      #ln-card-drag-tuning button {
        min-height: 42px;
        border: 1px solid var(--color-border);
        border-radius: 12px;
        background: var(--color-surface);
        color: var(--color-text);
        font: inherit;
        font-size: 16px;
      }
      #ln-card-drag-tuning .ln-cdr-foot { grid-template-columns: 1fr 1fr; margin-top: 10px; }
      #ln-card-drag-tuning small { display:block; margin-top:10px; opacity:.72; line-height:1.3; text-align:center; }
    `;
    document.head.appendChild(style);
  }

  function vytvorTuningPanel() {
    vlozDragStyly();
    if (tuningPanel?.isConnected) return tuningPanel;
    const panel = document.createElement("section");
    panel.id = "ln-card-drag-tuning";
    panel.hidden = true;
    const radky = Object.entries(DEFINICE_PARAMETRU).map(([klic, def]) => `
      <div class="ln-cdr-row">
        <span>${def.label}</span>
        <span class="ln-cdr-value" data-value="${klic}"></span>
        <button type="button" data-param="${klic}" data-delta="-1">−</button>
        <button type="button" data-param="${klic}" data-delta="1">+</button>
      </div>`).join("");
    panel.innerHTML = `
      <div class="ln-cdr-top">
        <strong>⚙️ Reálné karty – drag tuning</strong>
        <button type="button" data-action="defaults">Výchozí</button>
        <button type="button" data-action="close">Hotovo</button>
      </div>
      ${radky}
      <div class="ln-cdr-foot">
        <button type="button" data-action="detail">Detail log: ${nastaveni.detailLog ? "ZAP" : "VYP"}</button>
        <button type="button" data-action="copy">Kopírovat hodnoty</button>
      </div>
      <small>Změny platí hned pro aktuální běh. Po startu se načtou z příslušného TXT souboru; „Výchozí“ vrátí právě načtené hodnoty.</small>`;
    document.body.appendChild(panel);
    tuningPanel = panel;

    if (!tuningTlacitko?.isConnected) {
      tuningTlacitko = document.createElement("button");
      tuningTlacitko.id = "ln-card-drag-tuning-open";
      tuningTlacitko.type = "button";
      tuningTlacitko.textContent = "⚙️ Ladit drag";
      tuningTlacitko.hidden = true;
      tuningTlacitko.addEventListener("click", () => {
        panel.hidden = false;
        tuningTlacitko.hidden = true;
      });
      document.body.appendChild(tuningTlacitko);
    }

    const prekresli = () => {
      Object.entries(DEFINICE_PARAMETRU).forEach(([klic, def]) => {
        const el = panel.querySelector(`[data-value="${klic}"]`);
        if (el) el.textContent = `${nastaveni[klic]} ${def.unit}`;
      });
      const detail = panel.querySelector('[data-action="detail"]');
      if (detail) detail.textContent = `Detail log: ${nastaveni.detailLog ? "ZAP" : "VYP"}`;
    };

    panel.addEventListener("click", async (event) => {
      const tlacitko = event.target.closest("button");
      if (!tlacitko) return;
      const klic = tlacitko.dataset.param;
      if (klic && DEFINICE_PARAMETRU[klic]) {
        const def = DEFINICE_PARAMETRU[klic];
        const delta = Number(tlacitko.dataset.delta) || 0;
        nastaveni[klic] = Math.min(def.max, Math.max(def.min, nastaveni[klic] + def.step * delta));
        ulozNastaveni();
        prekresli();
        emitujDragDebug("TUNE", { settings: souhrnNastaveni() });
        return;
      }
      const action = tlacitko.dataset.action;
      if (action === "close") {
        panel.hidden = true;
        if (tuningTlacitko) tuningTlacitko.hidden = false;
      }
      if (action === "defaults") {
        nastaveni = { ...vychoziNastaveniZeSouboru };
        ulozNastaveni();
        prekresli();
        emitujDragDebug("TUNE", { settings: souhrnNastaveni(), reset: true, file: aktivniSouborNastaveni });
      }
      if (action === "detail") {
        nastaveni.detailLog = !nastaveni.detailLog;
        ulozNastaveni();
        prekresli();
      }
      if (action === "copy") {
        const text = textNastaveniProSoubor();
        try { await navigator.clipboard.writeText(text); }
        catch (_) {
          const area = document.createElement("textarea");
          area.value = text;
          document.body.appendChild(area);
          area.select();
          document.execCommand("copy");
          area.remove();
        }
      }
    });
    prekresli();
    return panel;
  }

  function otevriLadeni() {
    const panel = vytvorTuningPanel();
    panel.hidden = false;
    if (tuningTlacitko) tuningTlacitko.hidden = true;
    emitujDragDebug("TUNE", { settings: souhrnNastaveni(), open: true });
  }

  function zavriLadeni() {
    if (tuningPanel) tuningPanel.hidden = true;
    if (tuningTlacitko) tuningTlacitko.hidden = true;
  }

  const pinnedCards = () =>
    document.getElementById("pinnedCards");
  const pinnedLeft = () =>
    document.getElementById("pinnedLeft");
  const pinnedRight = () =>
    document.getElementById("pinnedRight");

  const DRAG_TRACE_TYPY = new Set([
    "READY", "START", "PICKUP", "TARGET", "TARGET_CANCEL",
    "TARGET_HOLD", "SLOT_LOCK", "REFREEZE", "LOOP_GUARD",
    "RELEASE_TARGET", "RELEASE_ANIMATION_DONE", "DROP", "END",
    "SAVE", "CANCEL", "POINTER_CANCEL", "SCROLL_START", "SCROLL_END"
  ]);

  function zkratDragTraceData(data = {}) {
    const vysledek = {};
    Object.entries(data).forEach(([klic, hodnota]) => {
      if (hodnota == null || ["string", "number", "boolean"].includes(typeof hodnota)) {
        vysledek[klic] = hodnota;
      }
    });
    return vysledek;
  }

  function ulozDragTrace(typ, data = {}) {
    if (!DRAG_TRACE_TYPY.has(typ)) return;
    try {
      const stare = JSON.parse(localStorage.getItem(DRAG_TRACE_KEY) || "[]");
      const log = Array.isArray(stare) ? stare : [];
      log.push({
        t: new Date().toISOString(),
        typ,
        ...zkratDragTraceData(data)
      });
      if (log.length > DRAG_TRACE_MAX) {
        log.splice(0, log.length - DRAG_TRACE_MAX);
      }
      localStorage.setItem(DRAG_TRACE_KEY, JSON.stringify(log));
    } catch (_) {
      // Trvalá diagnostika nesmí nikdy ovlivnit drag.
    }
  }

  function emitujDragDebug(typ, data = {}) {
    ulozDragTrace(typ, data);
    try {
      window.dispatchEvent(
        new CustomEvent("luba:card-drag-debug", {
          detail: {
            typ,
            ...data
          }
        })
      );
    } catch (_) {
      // Diagnostika nesmí ovlivnit funkci drag & drop.
    }
  }

  function zkratKlic(klic) {
    const hodnota = String(klic || "-");
    return hodnota.length <= 18
      ? hodnota
      : `${hodnota.slice(0, 15)}…`;
  }


  function ziskejScrollKontejner() {
    return (
      document.querySelector(".app") ||
      document.scrollingElement ||
      document.documentElement
    );
  }

  function jeDokumentovyScroll(kontejner) {
    return (
      kontejner === document.scrollingElement ||
      kontejner === document.documentElement ||
      kontejner === document.body
    );
  }

  function ziskejScrollRect(kontejner) {
    if (!kontejner || jeDokumentovyScroll(kontejner)) {
      return {
        left: 0,
        top: 0,
        right: window.innerWidth,
        bottom: window.innerHeight,
        width: window.innerWidth,
        height: window.innerHeight
      };
    }

    return kontejner.getBoundingClientRect();
  }

  function ziskejScrollPozici(kontejner) {
    if (!kontejner || jeDokumentovyScroll(kontejner)) {
      return {
        left: window.scrollX || 0,
        top: window.scrollY || 0
      };
    }

    return {
      left: kontejner.scrollLeft || 0,
      top: kontejner.scrollTop || 0
    };
  }

  function nastavScrollTop(kontejner, hodnota) {
    if (!kontejner || jeDokumentovyScroll(kontejner)) {
      window.scrollTo(window.scrollX || 0, hodnota);
      return window.scrollY || 0;
    }

    kontejner.scrollTop = hodnota;
    return kontejner.scrollTop || 0;
  }

  function pointerDoObsahu(stav, x, y) {
    const kontejner = stav?.scrollKontejner;
    const rect = ziskejScrollRect(kontejner);
    const scroll = ziskejScrollPozici(kontejner);

    return {
      xObsah: x - rect.left + scroll.left,
      yObsah: y - rect.top + scroll.top,
      rect,
      scroll
    };
  }

  function jeZakazano(karta) {
    const config = konfigurace.get(karta);
    return config?.isDisabled?.() === true;
  }

  function zrusLongPress(karta) {
    const timer = casovaceLongPress.get(karta);

    if (timer) {
      clearTimeout(timer);
      casovaceLongPress.delete(karta);
    }
  }

  function jeStejnePoradi(a, b) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((hodnota, index) =>
        hodnota === b[index]
      )
    );
  }

  function rozmistitKarty(
    poradiKlicu,
    mapaPrvku,
    { animovat = true } = {}
  ) {
    const left = pinnedLeft();
    const right = pinnedRight();

    if (!left || !right || !Array.isArray(poradiKlicu) || !(mapaPrvku instanceof Map)) return;

    const prvky = poradiKlicu.map((klic) => mapaPrvku.get(klic)).filter(Boolean);
    const starePozice = new Map();

    if (animovat) {
      prvky.forEach((prvek) => {
        if (prvek.classList?.contains("taskCard") && !prvek.classList.contains("lubaCardDragSource")) {
          starePozice.set(prvek, prvek.getBoundingClientRect());
        }
      });
    }

    const listMode = localStorage.getItem("cardView") === "list";
    const desktopGrid = window.matchMedia("(min-width: 900px)").matches && !listMode;

    if (desktopGrid) {
      let sloupce = [...left.querySelectorAll(":scope > .desktopMasonryColumn")];
      while (sloupce.length < 4) {
        const sloupec = document.createElement("div");
        sloupec.className = "desktopMasonryColumn";
        left.append(sloupec);
        sloupce.push(sloupec);
      }
      prvky.forEach((prvek, index) => sloupce[index % 4].append(prvek));
    } else if (listMode) {
      prvky.forEach((prvek) => left.append(prvek));
    } else {
      prvky.forEach((prvek, index) => (index % 2 === 0 ? left : right).append(prvek));
    }

    if (!animovat || nastaveni.reorderMs <= 0) return;

    requestAnimationFrame(() => {
      starePozice.forEach((staryRect, prvek) => {
        if (!prvek.isConnected) return;
        const novyRect = prvek.getBoundingClientRect();
        const dx = staryRect.left - novyRect.left;
        const dy = staryRect.top - novyRect.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
        try {
          prvek.animate(
            [
              { transform: `translate(${dx}px, ${dy}px)` },
              { transform: "translate(0, 0)" }
            ],
            { duration: nastaveni.reorderMs, easing: "cubic-bezier(.4,0,.2,1)" }
          );
        } catch (_) {}
      });
    });
  }

  function sestavPoradiSeSlotem(stav, cilovyIndexSkupiny) {
    const skupinaBezTazene = stav.skupinaOriginal.filter(
      (klic) => klic !== stav.dragKlic
    );

    const indexVlozeni = Math.max(
      0,
      Math.min(cilovyIndexSkupiny, skupinaBezTazene.length)
    );

    const novaSkupina = [...skupinaBezTazene];
    novaSkupina.splice(
      indexVlozeni,
      0,
      stav.dragKlic
    );

    const kliceSkupiny = new Set(stav.skupinaOriginal);
    let indexSkupiny = 0;

    const celePoradi = stav.poradiOriginal.map((klic) => {
      if (!kliceSkupiny.has(klic)) {
        return klic;
      }

      const novyKlic = novaSkupina[indexSkupiny];
      indexSkupiny += 1;
      return novyKlic;
    });

    return {
      celaSkupina: novaSkupina,
      celePoradi
    };
  }




  function ziskejLogickyRect(prvek, scrollKontejner) {
    const rect = prvek.getBoundingClientRect();
    const scrollRect = ziskejScrollRect(scrollKontejner);
    const scroll = ziskejScrollPozici(scrollKontejner);
    const jePlaceholder = prvek.classList?.contains("lubaCardDragPlaceholder");
    const scale = jePlaceholder ? 1 : Math.max(.01, nastaveni.scalePct / 100);
    const skutecneScale = document.body.classList.contains("lubaCardDragMode") ? scale : 1;
    const sirka = rect.width / skutecneScale;
    const vyska = rect.height / skutecneScale;
    const stredXViewport = rect.left + rect.width / 2;
    const stredYViewport = rect.top + rect.height / 2;
    const stredX = stredXViewport - scrollRect.left + scroll.left;
    const stredY = stredYViewport - scrollRect.top + scroll.top;
    return {
      stredX,
      stredY,
      sirka,
      vyska,
      left: stredX - sirka / 2,
      right: stredX + sirka / 2,
      top: stredY - vyska / 2,
      bottom: stredY + vyska / 2
    };
  }

  function zmerSloty(stav, poradiSkupiny = stav?.skupinaAktualni) {
    if (!stav || !Array.isArray(poradiSkupiny)) return [];
    return poradiSkupiny.map((klic, index) => {
      const prvek = stav.mapaPrvkuDrag.get(klic);
      if (!prvek?.isConnected) return null;
      return { index, klic, ...ziskejLogickyRect(prvek, stav.scrollKontejner) };
    }).filter(Boolean);
  }

  function vnitrniRect(slot) {
    const inset = Math.min(
      nastaveni.insetPx,
      Math.max(3, slot.sirka * .12),
      Math.max(3, slot.vyska * .18)
    );
    return {
      left: slot.left + inset,
      right: slot.right - inset,
      top: slot.top + inset,
      bottom: slot.bottom - inset
    };
  }

  function najdiPresnySlot(stav, x, y) {
    if (!stav?.sloty?.length) return null;
    const bod = pointerDoObsahu(stav, x, y);
    for (const slot of stav.sloty) {
      const r = vnitrniRect(slot);
      if (bod.xObsah >= r.left && bod.xObsah <= r.right && bod.yObsah >= r.top && bod.yObsah <= r.bottom) {
        return slot;
      }
    }
    return null;
  }

  function vytvorPlaceholder(rect) {
    const placeholder = document.createElement("div");
    placeholder.className = "lubaCardDragPlaceholder";
    placeholder.style.height = `${Math.round(rect.height)}px`;
    placeholder.setAttribute("aria-hidden", "true");
    return placeholder;
  }

  function aplikujFocus(stav, zapnout) {
    if (!stav) return;
    document.documentElement.style.setProperty("--ln-card-focus-ms", `${nastaveni.focusMs}ms`);
    const scale = String(nastaveni.scalePct / 100);
    stav.mapaPrvkuOriginal.forEach((prvek, klic) => {
      if (!prvek?.isConnected || klic === stav.dragKlic) return;
      if (zapnout) {
        if (!stav.puvodniScale.has(prvek)) {
          stav.puvodniScale.set(prvek, prvek.style.scale || "");
        }
        prvek.style.scale = scale;
      } else {
        prvek.style.scale = stav.puvodniScale.get(prvek) || "";
      }
    });
    emitujDragDebug(zapnout ? "FOCUS_ON" : "FOCUS_OFF", {
      card: zkratKlic(stav.dragKlic),
      scale: zapnout ? nastaveni.scalePct : 100,
      ms: nastaveni.focusMs
    });
  }

  function aplikujBlokaciOpacneSkupiny(stav, zapnout) {
    if (!stav) return;
    stav.mapaPrvkuOriginal.forEach((prvek, klic) => {
      if (!prvek?.isConnected || klic === stav.dragKlic) return;
      const jePripnuta = prvek.dataset.cardPinned === "1";
      const jeOpacna = jePripnuta !== stav.pripnuta;
      if (!jeOpacna) return;
      prvek.classList.toggle("lubaCardDragBlockedGroup", zapnout);
    });
  }

  function spocitejMaxScroll(kontejner) {
    return jeDokumentovyScroll(kontejner)
      ? Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
      : Math.max(0, kontejner.scrollHeight - kontejner.clientHeight);
  }

  function aktualizujHraniceSkupiny(stav) {
    if (!stav) return;
    const kontejner = stav.scrollKontejner;
    const rect = ziskejScrollRect(kontejner);
    const vyskaViewportu = Math.max(1, rect.height || window.innerHeight);
    const obecnyMax = spocitejMaxScroll(kontejner);
    const rezerva = Math.min(
      nastaveni.autoScrollEdgePx,
      Math.max(56, vyskaViewportu * .16)
    );

    let min = 0;
    let max = obecnyMax;

    if (stav.maOpacnouSkupinu && Array.isArray(stav.sloty) && stav.sloty.length) {
      const topSkupiny = Math.min(...stav.sloty.map((slot) => slot.top));
      const bottomSkupiny = Math.max(...stav.sloty.map((slot) => slot.bottom));

      if (!stav.pripnuta) {
        // Nepřipnutá karta nesmí auto-scrollem zajet nad začátek své skupiny.
        // Malá rezerva nechá na hraně zahlédnout šedé připnuté karty.
        min = Math.max(0, Math.min(obecnyMax, topSkupiny - rezerva));
      } else {
        // Připnutá karta nesmí auto-scrollem zajet pod konec připnuté skupiny.
        // Rezerva nechá dole zahlédnout šedé nepřipnuté karty.
        max = Math.max(0, Math.min(obecnyMax, bottomSkupiny - vyskaViewportu + rezerva));
      }
    }

    stav.scrollMinSkupiny = Math.min(min, max);
    stav.scrollMaxSkupiny = Math.max(min, max);

    emitujDragDebug("GROUP_LIMIT", {
      card: zkratKlic(stav.dragKlic),
      pinned: stav.pripnuta,
      min: Math.round(stav.scrollMinSkupiny),
      max: Math.round(stav.scrollMaxSkupiny),
      opposite: Boolean(stav.maOpacnouSkupinu)
    });
  }

  function oznacPlaceholder(stav, aktivni = true) {
    if (!stav?.placeholder) return;
    stav.placeholder.classList.toggle("lubaCardDragPlaceholderTarget", aktivni);
  }

  function odstranDropMarker(stav) {
    if (!stav?.dropMarker) {
      return;
    }

    stav.dropMarker.remove();
    stav.dropMarker = null;
  }

  function skryjDropMarker(stav) {
    if (!stav?.dropMarker) {
      return;
    }

    stav.dropMarker.hidden = true;
  }

  function zobrazDropMarker(stav, cilovyIndex) {
    if (!stav || !Number.isInteger(cilovyIndex)) return;
    const slot = stav.sloty?.[cilovyIndex];
    if (!slot) return;
    if (!stav.dropMarker) {
      const marker = document.createElement("div");
      marker.className = "lubaCardDropMarker lubaCardDropMarkerCandidate";
      marker.setAttribute("aria-hidden", "true");
      document.body.append(marker);
      stav.dropMarker = marker;
    }
    const rect = ziskejScrollRect(stav.scrollKontejner);
    const scroll = ziskejScrollPozici(stav.scrollKontejner);
    Object.assign(stav.dropMarker.style, {
      left: `${Math.round(rect.left + slot.left - scroll.left)}px`,
      top: `${Math.round(rect.top + slot.top - scroll.top)}px`,
      width: `${Math.round(slot.sirka)}px`,
      height: `${Math.round(slot.vyska)}px`
    });
    stav.dropMarker.hidden = false;
  }

  function zrusTimerKandidata(stav) {
    if (!stav?.kandidatTimer) {
      return;
    }

    clearTimeout(stav.kandidatTimer);
    stav.kandidatTimer = null;
  }

  function zrusKandidata(stav, duvod = "") {
    if (!stav) return;
    zrusTimerKandidata(stav);
    if (stav.kandidatIndex !== null && nastaveni.detailLog) {
      emitujDragDebug("TARGET_CANCEL", {
        card: zkratKlic(stav.dragKlic),
        candidate: stav.kandidatIndex,
        reason: duvod || "reset"
      });
    }
    stav.kandidatIndex = null;
    stav.kandidatOd = 0;
    stav.kandidatStartX = null;
    stav.kandidatStartY = null;
    skryjDropMarker(stav);
  }

  function potvrdCil(
    stav,
    cilovyIndex,
    { duvod = "hold" } = {}
  ) {
    if (!stav || !Number.isInteger(cilovyIndex) || cilovyIndex < 0 || cilovyIndex >= stav.skupinaOriginal.length) return false;

    zrusKandidata(stav, "locked");
    if (cilovyIndex === stav.cilovyIndexSkupiny) return false;

    const predchozi = stav.cilovyIndexSkupiny;
    stav.cilovyIndexSkupiny = cilovyIndex;
    const vysledek = sestavPoradiSeSlotem(stav, cilovyIndex);
    stav.skupinaAktualni = vysledek.celaSkupina;
    stav.poradiAktualni = vysledek.celePoradi;

    /*
     * 🔒 FROZEN – ochrana proti ping-pong smyčce v 2sloupcovém layoutu.
     * Po SLOT_LOCK se karty fyzicky přeskupí. Stejný NEHYBNÝ bod prstu pak
     * může po novém měření ležet nad jiným slotem a bez této brány by se
     * mohl spustit další SLOT_LOCK bez jediného skutečného pohybu uživatele.
     * Nový cíl proto povolíme až po reálném pohybu prstu od bodu locku.
     */
    stav.lockPointerX = stav.posledniX;
    stav.lockPointerY = stav.posledniY;
    stav.cekaNaPohybPoLocku = true;
    stav.lockAnimating = true;
    oznacPlaceholder(stav, true);
    rozmistitKarty(stav.poradiAktualni, stav.mapaPrvkuDrag, { animovat: true });

    emitujDragDebug("SLOT_LOCK", {
      card: zkratKlic(stav.dragKlic),
      from: predchozi,
      to: cilovyIndex,
      reason: duvod,
      anim: nastaveni.reorderMs
    });

    if (animaceLockTimer) clearTimeout(animaceLockTimer);
    animaceLockTimer = setTimeout(() => {
      animaceLockTimer = null;
      if (aktivniPresun !== stav) return;
      stav.sloty = zmerSloty(stav, stav.skupinaAktualni);
      aktualizujHraniceSkupiny(stav);
      stav.lockAnimating = false;
      const pohybPoLocku = Math.hypot(
        stav.posledniX - (stav.lockPointerX ?? stav.posledniX),
        stav.posledniY - (stav.lockPointerY ?? stav.posledniY)
      );
      const minimumPoLocku = Math.max(6, Math.min(14, nastaveni.jitterPx));
      emitujDragDebug("REFREEZE", {
        card: zkratKlic(stav.dragKlic),
        target: stav.cilovyIndexSkupiny,
        slots: stav.sloty.length,
        movedAfterLock: Math.round(pohybPoLocku),
        minMove: minimumPoLocku
      });

      if (
        !stav.autoScrollAktivni &&
        pohybPoLocku > minimumPoLocku
      ) {
        stav.cekaNaPohybPoLocku = false;
        aktualizujZamer(stav.posledniX, stav.posledniY);
      } else {
        emitujDragDebug("LOOP_GUARD", {
          card: zkratKlic(stav.dragKlic),
          target: stav.cilovyIndexSkupiny,
          moved: Math.round(pohybPoLocku),
          minMove: minimumPoLocku
        });
      }
    }, nastaveni.reorderMs + 24);

    return true;
  }

  function nastavKandidata(stav, kandidat, x, y) {
    if (!stav) return;
    if (!kandidat) {
      if (stav.kandidatIndex !== null) zrusKandidata(stav, "left-zone");
      return;
    }
    const kandidatIndex = kandidat.index;
    if (kandidatIndex === stav.cilovyIndexSkupiny) {
      if (stav.kandidatIndex !== null) zrusKandidata(stav, "current-slot");
      return;
    }

    const naplanuj = () => {
      zrusTimerKandidata(stav);
      stav.kandidatOd = performance.now();
      stav.kandidatTimer = setTimeout(() => {
        stav.kandidatTimer = null;
        if (aktivniPresun !== stav || stav.autoScrollAktivni || stav.lockAnimating || stav.kandidatIndex !== kandidatIndex) return;
        const stale = najdiPresnySlot(stav, stav.posledniX, stav.posledniY);
        if (!stale || stale.index !== kandidatIndex) {
          zrusKandidata(stav, "left-zone");
          return;
        }
        emitujDragDebug("TARGET_HOLD", {
          card: zkratKlic(stav.dragKlic),
          candidate: kandidatIndex,
          ms: nastaveni.dwellMs
        });
        potvrdCil(stav, kandidatIndex, { duvod: "dwell" });
      }, nastaveni.dwellMs);
    };

    if (stav.kandidatIndex !== kandidatIndex) {
      zrusKandidata(stav, "new-candidate");
      stav.kandidatIndex = kandidatIndex;
      stav.kandidatStartX = x;
      stav.kandidatStartY = y;
      zobrazDropMarker(stav, kandidatIndex);
      if (nastaveni.detailLog) {
        emitujDragDebug("TARGET", {
          card: zkratKlic(stav.dragKlic),
          from: stav.cilovyIndexSkupiny,
          candidate: kandidatIndex,
          hold: nastaveni.dwellMs,
          x: Math.round(x),
          y: Math.round(y)
        });
      }
      naplanuj();
      return;
    }

    const pohyb = Math.hypot(x - stav.kandidatStartX, y - stav.kandidatStartY);
    if (pohyb > nastaveni.jitterPx) {
      stav.kandidatStartX = x;
      stav.kandidatStartY = y;
      if (nastaveni.detailLog) {
        emitujDragDebug("DWELL_RESET", {
          card: zkratKlic(stav.dragKlic),
          candidate: kandidatIndex,
          move: Math.round(pohyb)
        });
      }
      naplanuj();
    }
  }

  function aktualizujZamer(x, y) {
    const stav = aktivniPresun;
    if (!stav || stav.lockAnimating) return;
    if (stav.autoScrollAktivni) {
      zrusKandidata(stav, "auto-scroll");
      return;
    }

    if (stav.cekaNaPohybPoLocku) {
      const pohyb = Math.hypot(
        x - (stav.lockPointerX ?? x),
        y - (stav.lockPointerY ?? y)
      );
      const minimum = Math.max(6, Math.min(14, nastaveni.jitterPx));
      if (pohyb <= minimum) {
        zrusKandidata(stav, "post-lock-still");
        return;
      }
      stav.cekaNaPohybPoLocku = false;
    }

    const kandidat = najdiPresnySlot(stav, x, y);
    nastavKandidata(stav, kandidat, x, y);
  }

  function pohniKartou(x, y) {
    const stav = aktivniPresun;

    if (!stav) {
      return;
    }

    stav.posledniX = x;
    stav.posledniY = y;

    const pohybOdPickupu = Math.hypot(
      x - stav.pickupX,
      y - stav.pickupY
    );

    if (
      !stav.prvniPohybZapsan &&
      pohybOdPickupu >= MIN_POHYB_PRO_PRVNI_LOG
    ) {
      stav.prvniPohybZapsan = true;
      emitujDragDebug("MOVE_FIRST", {
        card: zkratKlic(stav.dragKlic),
        distance: Math.round(pohybOdPickupu),
        x: Math.round(x),
        y: Math.round(y)
      });
    }

    if (
      !stav.autoScrollPovoleny &&
      pohybOdPickupu >=
        MIN_POHYB_PO_PICKUP_PRED_AUTOSCROLL
    ) {
      stav.autoScrollPovoleny = true;
      emitujDragDebug("SCROLL_ARM", {
        card: zkratKlic(stav.dragKlic),
        distance: Math.round(pohybOdPickupu)
      });
    }

    stav.karta.style.left =
      `${Math.round(x - stav.offsetX)}px`;
    stav.karta.style.top =
      `${Math.round(y - stav.offsetY)}px`;

    aktualizujZamer(x, y);
  }

  function ziskejAutoScrollStav(stav) {
    if (!stav?.autoScrollPovoleny) return { smer: 0, sila: 0, hranice: 0 };

    const kontejner = stav.scrollKontejner;
    const rect = ziskejScrollRect(kontejner);
    const horniHrana = Math.max(0, rect.top);
    const dolniHrana = Math.min(window.innerHeight, rect.bottom);
    const dostupnaVyska = Math.max(1, dolniHrana - horniHrana);
    const okraj = Math.min(nastaveni.autoScrollEdgePx, Math.max(52, dostupnaVyska * .22));
    const scrollTop = ziskejScrollPozici(kontejner).top;
    const minScroll = Number.isFinite(stav.scrollMinSkupiny) ? stav.scrollMinSkupiny : 0;
    const maxScroll = Number.isFinite(stav.scrollMaxSkupiny) ? stav.scrollMaxSkupiny : spocitejMaxScroll(kontejner);

    if (stav.posledniY < horniHrana + okraj) {
      if (scrollTop > minScroll + .5) {
        return {
          smer: -1,
          sila: Math.min(1, Math.max(0, (horniHrana + okraj - stav.posledniY) / okraj)),
          hranice: 0
        };
      }
      return { smer: 0, sila: 0, hranice: -1 };
    }
    if (stav.posledniY > dolniHrana - okraj) {
      if (scrollTop < maxScroll - .5) {
        return {
          smer: 1,
          sila: Math.min(1, Math.max(0, (stav.posledniY - (dolniHrana - okraj)) / okraj)),
          hranice: 0
        };
      }
      return { smer: 0, sila: 0, hranice: 1 };
    }
    return { smer: 0, sila: 0, hranice: 0 };
  }

  function spustAutoScroll() {
    if (autoScrollFrame) {
      cancelAnimationFrame(autoScrollFrame);
    }

    const krok = () => {
      const stav = aktivniPresun;

      if (!stav) {
        autoScrollFrame = null;
        return;
      }

      const kontejner = stav.scrollKontejner;
      const { smer, sila, hranice } = ziskejAutoScrollStav(stav);

      if (hranice !== 0 && stav.posledniHraniceScrollu !== hranice) {
        stav.posledniHraniceScrollu = hranice;
        emitujDragDebug("GROUP_STOP", {
          card: zkratKlic(stav.dragKlic),
          pinned: stav.pripnuta,
          direction: hranice < 0 ? "up" : "down",
          scrollTop: Math.round(ziskejScrollPozici(kontejner).top)
        });
      } else if (hranice === 0) {
        stav.posledniHraniceScrollu = 0;
      }

      if (smer !== 0 && sila > 0) {
        if (!stav.autoScrollAktivni) {
          stav.autoScrollAktivni = true;
          zrusKandidata(stav, "scroll-start");
          skryjDropMarker(stav);
          emitujDragDebug("SCROLL_START", {
            card: zkratKlic(stav.dragKlic),
            direction: smer < 0 ? "up" : "down"
          });
        }

        const scrollPred = ziskejScrollPozici(kontejner).top;
        const minScroll = Number.isFinite(stav.scrollMinSkupiny) ? stav.scrollMinSkupiny : 0;
        const maxScroll = Number.isFinite(stav.scrollMaxSkupiny) ? stav.scrollMaxSkupiny : spocitejMaxScroll(kontejner);
        const rychlost = Math.round(
          Math.min(2, nastaveni.autoScrollMaxPx) +
            (nastaveni.autoScrollMaxPx - Math.min(2, nastaveni.autoScrollMaxPx)) *
              sila * sila
        );
        const cilScroll = Math.max(
          minScroll,
          Math.min(
            maxScroll,
            scrollPred + smer * rychlost
          )
        );
        const scrollPo = nastavScrollTop(
          kontejner,
          cilScroll
        );
        const skutecnyPosun = scrollPo - scrollPred;

        if (Math.abs(skutecnyPosun) > 0.5) {
          const ted = performance.now();
          if (
            ted - stav.posledniDebugScroll >=
            DEBUG_SCROLL_INTERVAL_MS
          ) {
            stav.posledniDebugScroll = ted;
            emitujDragDebug("SCROLL", {
              card: zkratKlic(stav.dragKlic),
              direction: smer < 0 ? "up" : "down",
              scrollTop: Math.round(scrollPo),
              delta: Math.round(skutecnyPosun),
              speed: rychlost,
              target: stav.cilovyIndexSkupiny
            });
          }
        }
      } else if (stav.autoScrollAktivni) {
        stav.autoScrollAktivni = false;

        emitujDragDebug("SCROLL_END", {
          card: zkratKlic(stav.dragKlic),
          scrollTop: Math.round(
            ziskejScrollPozici(kontejner).top
          )
        });

        /*
         * Až po zastavení auto-scrollu začneme znovu hledat cíl.
         * Během samotného průjezdu se žádná mezera neotvírá.
         */
        aktualizujZamer(
          stav.posledniX,
          stav.posledniY
        );
      }

      autoScrollFrame = requestAnimationFrame(krok);
    };

    autoScrollFrame = requestAnimationFrame(krok);
  }

  function obnovKartu(stav, poradiKlicu) {
    if (!stav) return;
    if (animaceLockTimer) {
      clearTimeout(animaceLockTimer);
      animaceLockTimer = null;
    }
    odstranDropMarker(stav);
    aplikujFocus(stav, false);
    aplikujBlokaciOpacneSkupiny(stav, false);
    oznacPlaceholder(stav, false);
    stav.karta?.remove();
    stav.placeholder?.remove();

    const mapaFinal = new Map(stav.mapaPrvkuOriginal);
    mapaFinal.set(stav.dragKlic, stav.zdrojKarta);
    rozmistitKarty(poradiKlicu, mapaFinal, { animovat: false });

    stav.zdrojKarta?.classList.remove("lubaCardDragSource");
    if (stav.zdrojKarta) {
      if (stav.puvodniStylKarty == null) stav.zdrojKarta.removeAttribute("style");
      else stav.zdrojKarta.setAttribute("style", stav.puvodniStylKarty);
    }
    document.body.classList.remove("lubaCardDragMode");
  }

  function ziskejTaskPodleKlice(tasks, klic) {
    if (!Array.isArray(tasks) || !klic) {
      return null;
    }

    if (klic.startsWith("id:")) {
      const id = klic.slice(3);
      return tasks.find((task) => task?.id === id) || null;
    }

    if (klic.startsWith("index:")) {
      const index = Number(klic.slice(6));
      return Number.isInteger(index)
        ? tasks[index] || null
        : null;
    }

    return null;
  }


  async function ulozPresun(
    cardId,
    predchoziKlic,
    nasledujiciKlic
  ) {
    if (!cardId) {
      return false;
    }

    const provedZmenu = async () => {
      const tasks = loadTask();
      const presouvana =
        tasks.find((task) => task?.id === cardId);

      if (!presouvana) {
        return false;
      }

      const predchozi = predchoziKlic
        ? ziskejTaskPodleKlice(tasks, predchoziKlic)
        : null;
      const nasledujici = nasledujiciKlic
        ? ziskejTaskPodleKlice(tasks, nasledujiciKlic)
        : null;

      if (
        (predchozi &&
          (predchozi === presouvana ||
            (predchozi.pinned === true) !==
              (presouvana.pinned === true))) ||
        (nasledujici &&
          (nasledujici === presouvana ||
            (nasledujici.pinned === true) !==
              (presouvana.pinned === true)))
      ) {
        return false;
      }

      const vysledek =
        window.LubaNoteCardOrder
          ?.vypocitejPoradiMezi?.(
            tasks,
            predchozi,
            nasledujici
          );

      if (!vysledek) {
        return false;
      }

      presouvana.cardOrder = vysledek.poradi;
      presouvana.cardOrderBaseDirection =
        vysledek.zakladniSmer;
      presouvana.updatedAt = new Date().toISOString();

      await saveAllTasks(tasks);
      return presouvana;
    };

    let vysledek = false;

    if (
      typeof window.LubaNoteSync
        ?.provedLokalniZmenuASynchronizuj === "function"
    ) {
      vysledek = await window.LubaNoteSync
        .provedLokalniZmenuASynchronizuj(
          provedZmenu
        );
    } else {
      vysledek = await provedZmenu();

      if (
        vysledek?.id &&
        typeof uploadLocalNoteToSupabase === "function"
      ) {
        void uploadLocalNoteToSupabase(vysledek);
      }
    }

    emitujDragDebug("SAVE", {
      card: zkratKlic(`id:${cardId}`),
      previous: zkratKlic(predchoziKlic),
      next: zkratKlic(nasledujiciKlic),
      ok: Boolean(vysledek)
    });

    return vysledek;
  }

  function odstranIdZKlonu(prvek) {
    if (!prvek) {
      return;
    }

    prvek.removeAttribute?.("id");
    prvek.querySelectorAll?.("[id]").forEach((potomek) =>
      potomek.removeAttribute("id")
    );
  }

  function vytvorDragGhost(karta, rect, offsetX, offsetY) {
    const ghost = karta.cloneNode(true);
    odstranIdZKlonu(ghost);
    ghost.querySelectorAll?.(".lubaSwipeActionBackground").forEach((prvek) => prvek.remove());
    ghost.classList.remove("lubaSwipeDragging", "lubaSwipeDoneDragging", "lubaSwipeDeleteDragging", "lubaSwipeDoneCommitted", "lubaSwipeDeleteCommitted", "lubaCardDragSource");
    ghost.classList.add("lubaCardDragActive", "lubaCardDragGhost");
    ghost.style.removeProperty("--luba-swipe-x");
    ghost.setAttribute("aria-hidden", "true");
    ghost.style.width = `${Math.round(rect.width)}px`;
    ghost.style.height = `${Math.round(rect.height)}px`;
    ghost.style.left = `${Math.round(rect.left)}px`;
    ghost.style.top = `${Math.round(rect.top)}px`;
    ghost.style.zIndex = "4500";
    ghost.style.pointerEvents = "none";
    ghost.style.transformOrigin = `${Math.round(offsetX)}px ${Math.round(offsetY)}px`;
    ghost.style.scale = String(nastaveni.ghostScalePct / 100);
    document.body.append(ghost);
    return ghost;
  }

  function jeVstupStale(pointerId, touchId) {
    if (touchId !== null && touchId !== undefined) {
      return !aktivniTouchy.has(touchId);
    }

    return !aktivniPointery.has(pointerId);
  }

  async function zahajPresun(
    karta,
    pointerId,
    startX,
    startY,
    { touchId = null, vstup = "pointer" } = {}
  ) {
    const config = konfigurace.get(karta);
    if (aktivniPresun || !config || jeZakazano(karta) || jeVstupStale(pointerId, touchId)) return;

    const cardId = await config.ensureId?.();
    if (!cardId || jeVstupStale(pointerId, touchId)) return;

    const novyKlic = `id:${cardId}`;
    karta.dataset.cardDragKey = novyKlic;
    const container = pinnedCards();
    if (!container) return;

    const vsechnyKarty = [...container.querySelectorAll(".taskCard")].sort(
      (a, b) => Number(a.dataset.cardDisplayOrder || 0) - Number(b.dataset.cardDisplayOrder || 0)
    );
    const poradiOriginal = vsechnyKarty.map((prvek) => prvek.dataset.cardDragKey).filter(Boolean);
    const mapaPrvkuOriginal = new Map(vsechnyKarty.map((prvek) => [prvek.dataset.cardDragKey, prvek]).filter(([klic]) => Boolean(klic)));
    if (!poradiOriginal.includes(novyKlic)) return;

    const pripnuta = karta.dataset.cardPinned === "1";
    const skupinoveKarty = vsechnyKarty.filter((prvek) => prvek.dataset.cardPinned === (pripnuta ? "1" : "0"));
    const maOpacnouSkupinu = vsechnyKarty.some((prvek) => prvek.dataset.cardPinned !== (pripnuta ? "1" : "0"));
    const skupinaOriginal = skupinoveKarty.map((prvek) => prvek.dataset.cardDragKey).filter(Boolean);
    const puvodniIndexSkupiny = skupinaOriginal.indexOf(novyKlic);
    if (puvodniIndexSkupiny < 0) return;

    const scrollKontejner = ziskejScrollKontejner();
    const rect = karta.getBoundingClientRect();
    const offsetX = startX - rect.left;
    const offsetY = startY - rect.top;
    const ghost = vytvorDragGhost(karta, rect, offsetX, offsetY);
    const placeholder = vytvorPlaceholder(rect);
    const mapaPrvkuDrag = new Map(mapaPrvkuOriginal);
    mapaPrvkuDrag.set(novyKlic, placeholder);
    const puvodniStylKarty = karta.getAttribute("style");

    // Originál zůstane připojený ke stejnému DOM stromu, ale vyjmeme jej z flow.
    // Touch stream tedy pokračuje stejně jako v odladěném Drag Labu.
    Object.assign(karta.style, {
      position: "fixed",
      left: `${Math.round(rect.left)}px`,
      top: `${Math.round(rect.top)}px`,
      width: `${Math.round(rect.width)}px`,
      height: `${Math.round(rect.height)}px`,
      margin: "0",
      visibility: "hidden",
      pointerEvents: "none"
    });
    karta.classList.add("lubaCardDragSource");

    const stav = {
      karta: ghost,
      zdrojKarta: karta,
      placeholder,
      cardId,
      pointerId,
      touchId,
      vstup,
      dragKlic: novyKlic,
      pripnuta,
      maOpacnouSkupinu,
      scrollMinSkupiny: 0,
      scrollMaxSkupiny: spocitejMaxScroll(scrollKontejner),
      posledniHraniceScrollu: 0,
      mapaPrvkuOriginal,
      mapaPrvkuDrag,
      poradiOriginal,
      poradiAktualni: [...poradiOriginal],
      skupinaOriginal,
      skupinaAktualni: [...skupinaOriginal],
      sloty: [],
      scrollKontejner,
      puvodniIndexSkupiny,
      cilovyIndexSkupiny: puvodniIndexSkupiny,
      kandidatIndex: null,
      kandidatOd: 0,
      kandidatStartX: null,
      kandidatStartY: null,
      kandidatTimer: null,
      dropMarker: null,
      autoScrollAktivni: false,
      posledniDebugScroll: 0,
      offsetX,
      offsetY,
      pickupX: startX,
      pickupY: startY,
      prvniPohybZapsan: false,
      autoScrollPovoleny: false,
      posledniX: startX,
      posledniY: startY,
      onAfterReorder: config.onAfterReorder,
      puvodniStylKarty,
      puvodniScale: new Map(),
      lockAnimating: false,
      lockPointerX: null,
      lockPointerY: null,
      cekaNaPohybPoLocku: false
    };
    aktivniPresun = stav;

    // Placeholder má přesně původní slot. Teprve potom zmrazíme logickou mapu.
    rozmistitKarty(poradiOriginal, mapaPrvkuDrag, { animovat: false });
    stav.sloty = zmerSloty(stav, skupinaOriginal);
    aktualizujHraniceSkupiny(stav);

    try { karta.dispatchEvent(new CustomEvent("luba:card-drag-takeover")); } catch (_) {}
    document.body.classList.add("lubaCardDragMode");
    blokovatKlikDo = Date.now() + 800;
    aplikujFocus(stav, true);
    aplikujBlokaciOpacneSkupiny(stav, true);

    if (vstup !== "touch" && pointerId !== null) {
      try { karta.setPointerCapture?.(pointerId); } catch (_) {}
    }

    emitujDragDebug("START", {
      card: zkratKlic(novyKlic),
      index: puvodniIndexSkupiny,
      slots: stav.sloty.length,
      columns: localStorage.getItem("cardView") === "list" ? 1 : (window.innerWidth >= 900 ? 4 : 2),
      pinned: pripnuta,
      x: Math.round(startX),
      y: Math.round(startY),
      scrollTop: Math.round(ziskejScrollPozici(scrollKontejner).top)
    });
    emitujDragDebug("PICKUP", {
      card: zkratKlic(novyKlic),
      input: vstup,
      pointerCaptured: vstup !== "touch" && pointerId !== null && karta.hasPointerCapture?.(pointerId) === true,
      settings: souhrnNastaveni()
    });

    try { navigator.vibrate?.(22); } catch (_) {}
    pohniKartou(startX, startY);
    spustAutoScroll();
  }

  async function animujPolozeniKarty(stav) {
    if (
      !stav?.karta ||
      !stav?.placeholder ||
      nastaveni.dropMs <= 0
    ) {
      return;
    }

    const cil = stav.placeholder.getBoundingClientRect();
    const kartaRect = stav.karta.getBoundingClientRect();

    if (
      !Number.isFinite(cil.left) ||
      !Number.isFinite(cil.top)
    ) {
      return;
    }

    const cilLeft =
      cil.left +
      Math.max(0, (cil.width - kartaRect.width) / 2);

    const cilTop =
      cil.top +
      Math.max(0, (cil.height - kartaRect.height) / 2);

    stav.karta.style.transition = [
      `left ${nastaveni.dropMs}ms cubic-bezier(.2,.8,.2,1)`,
      `top ${nastaveni.dropMs}ms cubic-bezier(.2,.8,.2,1)`,
      `scale ${nastaveni.dropMs}ms cubic-bezier(.2,.8,.2,1)`
    ].join(", ");

    requestAnimationFrame(() => {
      if (!stav.karta?.isConnected) {
        return;
      }

      stav.karta.style.left = `${Math.round(cilLeft)}px`;
      stav.karta.style.top = `${Math.round(cilTop)}px`;
      stav.karta.style.scale = "1";
    });

    emitujDragDebug("DROP_ANIMATION", {
      card: zkratKlic(stav.dragKlic),
      ms: nastaveni.dropMs
    });

    await new Promise((resolve) =>
      setTimeout(resolve, nastaveni.dropMs + 20)
    );
  }

  async function dokoncitPresun(x = null, y = null) {
    const stav = aktivniPresun;
    if (!stav) return;

    if (Number.isFinite(x) && Number.isFinite(y)) {
      stav.posledniX = x;
      stav.posledniY = y;
    }

    /*
     * Pustím kartu dřív než doběhne dwell: pokud je prst v přesném
     * platném slotu stejné skupiny, tento slot se stává cílem okamžitě.
     * Uživatel tedy nemusí čekat na vizuální rozestoupení karet.
     */
    if (!stav.autoScrollAktivni && !stav.lockAnimating) {
      const slotPriPusteni = najdiPresnySlot(stav, stav.posledniX, stav.posledniY);
      if (slotPriPusteni && slotPriPusteni.index !== stav.cilovyIndexSkupiny) {
        const predchozi = stav.cilovyIndexSkupiny;
        stav.cilovyIndexSkupiny = slotPriPusteni.index;
        const vysledekPriPusteni = sestavPoradiSeSlotem(stav, slotPriPusteni.index);
        stav.skupinaAktualni = vysledekPriPusteni.celaSkupina;
        stav.poradiAktualni = vysledekPriPusteni.celePoradi;

        /*
         * Finger-up pred dokoncenim dwell musi vizualne projit stejnou
         * animaci jako bezny SLOT_LOCK. Jinak se poradi sice ulozi, ale
         * obnovKartu() ho na konci vykresli rovnou bez prechodu.
         */
        stav.lockAnimating = true;
        oznacPlaceholder(stav, true);
        rozmistitKarty(stav.poradiAktualni, stav.mapaPrvkuDrag, { animovat: true });

        emitujDragDebug("RELEASE_TARGET", {
          card: zkratKlic(stav.dragKlic),
          from: predchozi,
          to: slotPriPusteni.index,
          reason: "finger-up",
          anim: nastaveni.reorderMs
        });

        if (nastaveni.reorderMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, nastaveni.reorderMs + 24));
          if (aktivniPresun !== stav) return;
        }
        stav.lockAnimating = false;
        emitujDragDebug("RELEASE_ANIMATION_DONE", {
          card: zkratKlic(stav.dragKlic),
          target: stav.cilovyIndexSkupiny,
          anim: nastaveni.reorderMs
        });
      }
    }

    zrusTimerKandidata(stav);
    if (animaceLockTimer) {
      clearTimeout(animaceLockTimer);
      animaceLockTimer = null;
    }

    const vysledek = sestavPoradiSeSlotem(stav, stav.cilovyIndexSkupiny);
    stav.skupinaAktualni = vysledek.celaSkupina;
    stav.poradiAktualni = vysledek.celePoradi;
    const zmeneno = !jeStejnePoradi(stav.skupinaOriginal, stav.skupinaAktualni);
    const finalniIndex = stav.skupinaAktualni.indexOf(stav.dragKlic);

    emitujDragDebug("DROP", {
      card: zkratKlic(stav.dragKlic),
      from: stav.puvodniIndexSkupiny,
      to: finalniIndex,
      changed: zmeneno
    });

    await animujPolozeniKarty(stav);

    try {
      if (stav.pointerId !== null && stav.zdrojKarta?.hasPointerCapture?.(stav.pointerId)) {
        stav.zdrojKarta.releasePointerCapture?.(stav.pointerId);
      }
    } catch (_) {}

    aktivniPresun = null;
    if (autoScrollFrame) {
      cancelAnimationFrame(autoScrollFrame);
      autoScrollFrame = null;
    }

    obnovKartu(stav, zmeneno ? stav.poradiAktualni : stav.poradiOriginal);
    blokovatKlikDo = Date.now() + 500;

    if (!zmeneno) {
      emitujDragDebug("END", { card: zkratKlic(stav.dragKlic), from: stav.puvodniIndexSkupiny, to: finalniIndex, changed: false });
      return;
    }

    const predchoziKlic = stav.skupinaAktualni[finalniIndex - 1] || null;
    const nasledujiciKlic = stav.skupinaAktualni[finalniIndex + 1] || null;
    emitujDragDebug("END", {
      card: zkratKlic(stav.dragKlic),
      from: stav.puvodniIndexSkupiny,
      to: finalniIndex,
      changed: true,
      previous: zkratKlic(predchoziKlic),
      next: zkratKlic(nasledujiciKlic)
    });

    await ulozPresun(stav.cardId, predchoziKlic, nasledujiciKlic);
    stav.onAfterReorder?.();
  }

  function zrusPresun() {
    const stav = aktivniPresun;
    if (!stav) return;
    zrusTimerKandidata(stav);
    if (animaceLockTimer) {
      clearTimeout(animaceLockTimer);
      animaceLockTimer = null;
    }
    try {
      if (stav.pointerId !== null && stav.zdrojKarta?.hasPointerCapture?.(stav.pointerId)) {
        stav.zdrojKarta.releasePointerCapture?.(stav.pointerId);
      }
    } catch (_) {}
    aktivniPresun = null;
    if (autoScrollFrame) {
      cancelAnimationFrame(autoScrollFrame);
      autoScrollFrame = null;
    }
    obnovKartu(stav, stav.poradiOriginal);
    blokovatKlikDo = Date.now() + 400;
    emitujDragDebug("CANCEL", { card: zkratKlic(stav.dragKlic), from: stav.puvodniIndexSkupiny, to: stav.cilovyIndexSkupiny });
  }

  function najdiDotyk(seznamDotyku, touchId) {
    if (touchId === null || touchId === undefined) {
      return null;
    }

    return [...(seznamDotyku || [])].find(
      (dotyk) => dotyk.identifier === touchId
    ) || null;
  }

  function pridejKarte(
    karta,
    {
      ensureId,
      onDoubleTap,
      onAfterReorder,
      isDisabled = () => false
    } = {}
  ) {
    if (
      !karta ||
      karta.dataset.lubaCardDragReady === "true"
    ) {
      return;
    }

    karta.dataset.lubaCardDragReady = "true";
    konfigurace.set(karta, {
      ensureId,
      onDoubleTap,
      onAfterReorder,
      isDisabled
    });

    /*
     * Pojistná větev zůstává zachovaná pro rychlé vypnutí produkčního
     * dragu. V 0.9.346 je produkční drag povolen po ověření v Drag Labu.
     */
    if (!PRODUKCNI_DRAG_POVOLEN) {
      karta.dataset.lubaCardDragMode = "lab-only";

      karta.addEventListener(
        "click",
        (event) => {
          if (obejitKlik.has(karta)) {
            obejitKlik.delete(karta);
            return;
          }

          if (jeZakazano(karta)) {
            return;
          }

          event.preventDefault();
          event.stopImmediatePropagation();

          const ted = performance.now();
          const predchozi = posledniTap.get(karta) || 0;
          const jeDvojtap =
            predchozi > 0 &&
            ted - predchozi <= DOBA_DVOJTAPU;

          if (jeDvojtap) {
            posledniTap.delete(karta);
            const timer = casovaceJednohoTapu.get(karta);
            if (timer) {
              clearTimeout(timer);
              casovaceJednohoTapu.delete(karta);
            }
            onDoubleTap?.();
            return;
          }

          posledniTap.set(karta, ted);
          const staryTimer = casovaceJednohoTapu.get(karta);
          if (staryTimer) clearTimeout(staryTimer);

          const timer = setTimeout(() => {
            casovaceJednohoTapu.delete(karta);
            posledniTap.delete(karta);
            if (!karta.isConnected) return;
            obejitKlik.add(karta);
            karta.click();
          }, DOBA_DVOJTAPU);

          casovaceJednohoTapu.set(karta, timer);
        },
        true
      );

      return;
    }

    let startX = 0;
    let startY = 0;
    let aktualniX = 0;
    let aktualniY = 0;
    let pointerId = null;

    let touchId = null;
    let touchStartX = 0;
    let touchStartY = 0;
    let touchAktualniX = 0;
    let touchAktualniY = 0;
    let touchLongPressPripraven = false;
    let touchScrollTopPredLongPress = 0;
    let touchListeneryAktivni = false;

    const odeberTouchListenery = () => {
      if (!touchListeneryAktivni) {
        return;
      }

      document.removeEventListener(
        "touchmove",
        zpracujTouchMove,
        true
      );
      document.removeEventListener(
        "touchend",
        zpracujTouchEnd,
        true
      );
      document.removeEventListener(
        "touchcancel",
        zpracujTouchCancel,
        true
      );
      touchListeneryAktivni = false;
    };

    const vycistiTouch = () => {
      zrusLongPress(karta);

      if (touchId !== null) {
        aktivniTouchy.delete(touchId);
      }

      touchId = null;
      touchLongPressPripraven = false;
      odeberTouchListenery();
    };

    const zpracujTouchMove = (event) => {
      if (touchId === null) {
        return;
      }

      const dotyk = najdiDotyk(event.touches, touchId);
      if (!dotyk) {
        return;
      }

      touchAktualniX = dotyk.clientX;
      touchAktualniY = dotyk.clientY;

      const vzdalenost = Math.hypot(
        touchAktualniX - touchStartX,
        touchAktualniY - touchStartY
      );

      const jeAktivniDrag =
        aktivniPresun?.zdrojKarta === karta &&
        aktivniPresun?.touchId === touchId;

      if (!touchLongPressPripraven && !jeAktivniDrag) {
        /*
         * Pohyb před long-pressem = normální scroll / swipe.
         * Drag se vzdá bez jediného preventDefault().
         */
        if (vzdalenost > nastaveni.preLongMovePx) {
          vycistiTouch();
        }
        return;
      }

      /*
       * Long-press už vyhrál. Od této chvíle musí dotyk patřit jen
       * dragování, stejně jako u odladěného přesunu obrázků v editoru.
       * Native WebView scroll proto blokujeme a scrollujeme jen naším
       * řízeným auto-scrollem.
       */
      event.preventDefault();
      event.stopPropagation();

      if (!jeAktivniDrag) {
        const kontejner = ziskejScrollKontejner();
        nastavScrollTop(
          kontejner,
          touchScrollTopPredLongPress
        );
        return;
      }

      pohniKartou(
        touchAktualniX,
        touchAktualniY
      );
    };

    const zpracujTouchEnd = (event) => {
      if (touchId === null) {
        return;
      }

      const dotyk = najdiDotyk(
        event.changedTouches,
        touchId
      );
      if (!dotyk) {
        return;
      }

      const jeAktivniDrag =
        aktivniPresun?.zdrojKarta === karta &&
        aktivniPresun?.touchId === touchId;

      if (jeAktivniDrag) {
        event.preventDefault();
        event.stopPropagation();
        aktivniTouchy.delete(touchId);
        void dokoncitPresun(dotyk.clientX, dotyk.clientY);
      } else if (touchLongPressPripraven) {
        /* Long-press bez pohybu nesmí následně otevřít kartu. */
        event.preventDefault();
        blokovatKlikDo = Date.now() + 650;
      }

      vycistiTouch();
    };

    const zpracujTouchCancel = (event) => {
      if (touchId === null) {
        return;
      }

      const aktivni =
        aktivniPresun?.zdrojKarta === karta &&
        aktivniPresun?.touchId === touchId;

      emitujDragDebug("POINTER_CANCEL", {
        card: zkratKlic(
          aktivniPresun?.dragKlic ||
          karta.dataset.cardDragKey
        ),
        input: "touch",
        active: aktivni,
        autoScroll: Boolean(aktivniPresun?.autoScrollAktivni),
        moved: aktivniPresun
          ? Math.round(
              Math.hypot(
                aktivniPresun.posledniX - aktivniPresun.pickupX,
                aktivniPresun.posledniY - aktivniPresun.pickupY
              )
            )
          : 0
      });

      aktivniTouchy.delete(touchId);

      if (aktivni) {
        zrusPresun();
      }

      vycistiTouch();
    };

    karta.addEventListener(
      "touchstart",
      (event) => {
        zrusLongPress(karta);

        if (
          event.touches.length !== 1 ||
          aktivniPresun ||
          jeZakazano(karta)
        ) {
          return;
        }

        const dotyk = event.touches[0];

        if (
          dotyk.clientX <= OKRAJ_SYSTEMOVEHO_GESTA ||
          dotyk.clientX >=
            window.innerWidth - OKRAJ_SYSTEMOVEHO_GESTA
        ) {
          return;
        }

        touchId = dotyk.identifier;
        touchStartX = dotyk.clientX;
        touchStartY = dotyk.clientY;
        touchAktualniX = touchStartX;
        touchAktualniY = touchStartY;
        touchLongPressPripraven = false;
        aktivniTouchy.add(touchId);

        if (!touchListeneryAktivni) {
          document.addEventListener(
            "touchmove",
            zpracujTouchMove,
            { passive: false, capture: true }
          );
          document.addEventListener(
            "touchend",
            zpracujTouchEnd,
            { passive: false, capture: true }
          );
          document.addEventListener(
            "touchcancel",
            zpracujTouchCancel,
            { passive: false, capture: true }
          );
          touchListeneryAktivni = true;
        }

        const timer = setTimeout(() => {
          if (
            touchId === null ||
            !aktivniTouchy.has(touchId)
          ) {
            return;
          }

          touchLongPressPripraven = true;
          touchScrollTopPredLongPress =
            ziskejScrollPozici(
              ziskejScrollKontejner()
            ).top;

          emitujDragDebug("READY", {
            card: zkratKlic(karta.dataset.cardDragKey),
            input: "touch",
            x: Math.round(touchAktualniX),
            y: Math.round(touchAktualniY)
          });

          void zahajPresun(
            karta,
            null,
            touchAktualniX,
            touchAktualniY,
            {
              touchId,
              vstup: "touch"
            }
          );
        }, nastaveni.longPressMs);

        casovaceLongPress.set(karta, timer);
      },
      { passive: true }
    );

    karta.addEventListener("pointerdown", (event) => {
      zrusLongPress(karta);

      if (
        event.pointerType === "touch" ||
        event.button !== 0 ||
        jeZakazano(karta) ||
        event.clientX <= OKRAJ_SYSTEMOVEHO_GESTA ||
        event.clientX >=
          window.innerWidth - OKRAJ_SYSTEMOVEHO_GESTA
      ) {
        return;
      }

      startX = event.clientX;
      startY = event.clientY;
      aktualniX = startX;
      aktualniY = startY;
      pointerId = event.pointerId;

      const timer = setTimeout(() => {
        if (!aktivniPointery.has(pointerId)) {
          return;
        }

        void zahajPresun(
          karta,
          pointerId,
          aktualniX,
          aktualniY,
          { vstup: event.pointerType || "pointer" }
        );
      }, nastaveni.longPressMs);

      casovaceLongPress.set(karta, timer);
    });

    karta.addEventListener("pointermove", (event) => {
      if (
        aktivniPresun?.zdrojKarta === karta ||
        event.pointerId !== pointerId
      ) {
        return;
      }

      aktualniX = event.clientX;
      aktualniY = event.clientY;

      const dx = Math.abs(event.clientX - startX);
      const dy = Math.abs(event.clientY - startY);

      if (
        dx > nastaveni.preLongMovePx ||
        dy > nastaveni.preLongMovePx
      ) {
        zrusLongPress(karta);
      }
    });

    karta.addEventListener("pointerup", () => {
      zrusLongPress(karta);
    });

    karta.addEventListener("pointercancel", () => {
      zrusLongPress(karta);
    });

    karta.addEventListener(
      "click",
      (event) => {
        if (obejitKlik.has(karta)) {
          obejitKlik.delete(karta);
          return;
        }

        if (jeZakazano(karta)) {
          return;
        }

        if (
          Date.now() < blokovatKlikDo ||
          aktivniPresun
        ) {
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();

        const ted = performance.now();
        const predchozi = posledniTap.get(karta) || 0;
        const jeDvojtap =
          predchozi > 0 &&
          ted - predchozi <= DOBA_DVOJTAPU;

        if (jeDvojtap) {
          posledniTap.delete(karta);

          const timer = casovaceJednohoTapu.get(karta);
          if (timer) {
            clearTimeout(timer);
            casovaceJednohoTapu.delete(karta);
          }

          onDoubleTap?.();
          return;
        }

        posledniTap.set(karta, ted);

        const staryTimer = casovaceJednohoTapu.get(karta);
        if (staryTimer) {
          clearTimeout(staryTimer);
        }

        const timer = setTimeout(() => {
          casovaceJednohoTapu.delete(karta);
          posledniTap.delete(karta);

          if (
            !karta.isConnected ||
            Date.now() < blokovatKlikDo ||
            aktivniPresun
          ) {
            return;
          }

          obejitKlik.add(karta);
          karta.click();
        }, DOBA_DVOJTAPU);

        casovaceJednohoTapu.set(karta, timer);
      },
      true
    );
  }

  document.addEventListener(
    "pointerdown",
    (event) => {
      aktivniPointery.add(event.pointerId);
    },
    true
  );

  document.addEventListener(
    "pointerup",
    (event) => {
      aktivniPointery.delete(event.pointerId);

      if (
        aktivniPresun &&
        event.pointerId === aktivniPresun.pointerId
      ) {
        event.preventDefault();
        event.stopPropagation();
        void dokoncitPresun(event.clientX, event.clientY);
      }
    },
    true
  );

  document.addEventListener(
    "pointercancel",
    (event) => {
      aktivniPointery.delete(event.pointerId);

      if (
        aktivniPresun &&
        event.pointerId === aktivniPresun.pointerId
      ) {
        emitujDragDebug("POINTER_CANCEL", {
          card: zkratKlic(aktivniPresun.dragKlic),
          input: aktivniPresun.vstup || "pointer",
          active: true,
          autoScroll: Boolean(aktivniPresun.autoScrollAktivni),
          moved: Math.round(
            Math.hypot(
              aktivniPresun.posledniX - aktivniPresun.pickupX,
              aktivniPresun.posledniY - aktivniPresun.pickupY
            )
          )
        });
        event.stopPropagation();
        zrusPresun();
      }
    },
    true
  );

  document.addEventListener(
    "pointermove",
    (event) => {
      if (
        !aktivniPresun ||
        event.pointerId !== aktivniPresun.pointerId
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      pohniKartou(event.clientX, event.clientY);
    },
    { capture: true, passive: false }
  );

  vlozDragStyly();

  window.LubaNoteCardDrag = {
    pridejKarte,
    jeAktivni: () => Boolean(aktivniPresun),
    otevriLadeni,
    zavriLadeni,
    ziskejNastaveni: () => ({ ...nastaveni }),
    ziskejTrvalyLog: () => {
      try {
        const log = JSON.parse(localStorage.getItem(DRAG_TRACE_KEY) || "[]");
        return Array.isArray(log) ? log : [];
      } catch (_) {
        return [];
      }
    },
    vymazTrvalyLog: () => {
      try { localStorage.removeItem(DRAG_TRACE_KEY); } catch (_) {}
    },
    resetLadeni: () => {
      nastaveni = { ...vychoziNastaveniZeSouboru };
      ulozNastaveni();
      emitujDragDebug("TUNE", { settings: souhrnNastaveni(), reset: true, file: aktivniSouborNastaveni });
      return { ...nastaveni };
    }
  };

  void nactiNastaveniZeSouboru();
})();
