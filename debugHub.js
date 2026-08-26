/* ========================================
   LUBANOTE – DEBUG HUB
   Trvale dostupná, ale běžně neaktivní diagnostika.

   Aktivace:
   1) 5× tap na logo otevře Visual Debug
   2) v něm tlačítko „🐞 Diagnostika“
   3) konkrétní modul se začne logovat až po „Spustit"
======================================== */

(() => {
  "use strict";

  let hub = null;
  let logEl = null;
  let summaryEl = null;
  let statusEl = null;
  let selectModulu = null;
  let startTlacitko = null;
  let stopAktivnihoModulu = null;
  let aktivniModul = "";
  let startCas = 0;
  let zaznamy = [];

  const MAX_ZAZNAMU = 320;

  const MODULY = {
    todoSelection: "TODO – výběr / Vložit / Vše",
    editorSelection: "Editor – výběr textu",
    gestures: "Gesta – pointer / touch / click"
  };

  function jeDebugPrvek(target) {
    const prvek = target instanceof Element
      ? target
      : target?.parentElement;

    return Boolean(
      prvek?.closest?.(
        "#ln-debug-hub, #ln-vd-panel, #ln-vd-quickbar, #ln-vd-highlight, #ln-vd-measure"
      )
    );
  }

  function cas() {
    return Math.round(performance.now() - startCas);
  }

  function zkratText(text, max = 44) {
    const hodnota = String(text ?? "")
      .replace(/\n/g, "↵")
      .replace(/\t/g, "⇥");

    return hodnota.length <= max
      ? hodnota
      : `${hodnota.slice(0, max - 1)}…`;
  }

  function zobrazZnak(znak) {
    if (znak === undefined) return "∅";
    if (znak === "") return "END";
    if (znak === " ") return "␠";
    if (znak === "\n") return "↵";
    if (znak === "\t") return "⇥";
    return znak;
  }

  function popisPrvku(prvek) {
    if (!(prvek instanceof Element)) {
      if (prvek?.nodeType === Node.TEXT_NODE) {
        return `#text(\"${zkratText(prvek.textContent, 24)}\")`;
      }

      return String(prvek?.nodeName || "null");
    }

    let popis = prvek.tagName;

    if (prvek.id) {
      popis += `#${prvek.id}`;
    }

    if (prvek.classList.length) {
      popis += `.${[...prvek.classList].slice(0, 4).join(".")}`;
    }

    return popis;
  }

  function bodUdalosti(event) {
    const dotyk = event.changedTouches?.[0] || event.touches?.[0];

    if (dotyk) {
      return {
        x: dotyk.clientX,
        y: dotyk.clientY
      };
    }

    if (
      Number.isFinite(event.clientX) &&
      Number.isFinite(event.clientY)
    ) {
      return {
        x: event.clientX,
        y: event.clientY
      };
    }

    return null;
  }

  function aktivniTema() {
    return [...document.body.classList]
      .find(trida => trida.startsWith("theme-")) || "theme-neznámé";
  }

  function aktivniHlavniModul() {
    return document.querySelector(".moduleTab.active")?.dataset?.module || "neznámý";
  }

  function prostredi() {
    const jeCapacitor = Boolean(
      window.Capacitor?.isNativePlatform?.() ||
      navigator.userAgent.includes("; wv)") ||
      navigator.userAgent.includes(" Version/4.0 Chrome/")
    );

    return jeCapacitor ? "APK/WebView" : "WEB";
  }

  function hlavickaReportu() {
    return [
      "LUBANOTE DEBUG HUB",
      `modul: ${MODULY[aktivniModul] || aktivniModul || "žádný"}`,
      `verze: ${window.LUBANOTE_VERSION || "DEV"}`,
      `prostředí: ${prostredi()}`,
      `UA: ${navigator.userAgent}`,
      `viewport: ${window.innerWidth}x${window.innerHeight}`,
      `téma: ${aktivniTema()}`,
      `hlavní modul: ${aktivniHlavniModul()}`,
      `čas: ${new Date().toISOString()}`,
      "Legenda: ␠ = mezera, END = konec textu",
      ""
    ].join("\n");
  }

  function prekresli() {
    if (!logEl) return;

    logEl.textContent = zaznamy.join("\n");
    logEl.scrollTop = logEl.scrollHeight;

    if (summaryEl) {
      summaryEl.textContent = [
        `modul: ${MODULY[aktivniModul] || "vypnutý"}`,
        `záznamů: ${zaznamy.length}/${MAX_ZAZNAMU}`,
        `verze: ${window.LUBANOTE_VERSION || "DEV"} · ${prostredi()} · ${aktivniTema()}`
      ].join("\n");
    }
  }

  function zapis(text) {
    zaznamy.push(`${String(cas()).padStart(6, " ")} ${text}`);

    if (zaznamy.length > MAX_ZAZNAMU) {
      zaznamy.splice(0, zaznamy.length - MAX_ZAZNAMU);
    }

    prekresli();
  }

  function infoMenuVyberu() {
    const menu = document.getElementById("selectionMenu");

    if (!menu) {
      return "menu=N/A";
    }

    const styly = getComputedStyle(menu);
    const viditelne = !menu.hidden &&
      styly.display !== "none" &&
      styly.visibility !== "hidden";

    const tlacitka = [...menu.querySelectorAll("button")]
      .filter(btn => !btn.hidden && getComputedStyle(btn).display !== "none")
      .map(btn => btn.textContent?.trim())
      .filter(Boolean)
      .join("/");

    return `menu=${viditelne ? "OPEN" : "CLOSED"}[${tlacitka || "-"}]`;
  }

  function najdiTodo(prvek) {
    const element = prvek instanceof Element
      ? prvek
      : prvek?.parentElement;

    const item = element?.closest?.(".todoItem") || null;
    const input = item?.querySelector?.(".todoTextInput") || null;
    const display = item?.querySelector?.(".todoTextDisplay") || null;
    const value = item?.querySelector?.(".todoTextValue") || null;

    return {
      item,
      input,
      display,
      value,
      index: item?.dataset?.todoIndex ?? "-",
      id: item?.dataset?.todoId ?? "-"
    };
  }

  function infoTodoInput(input) {
    if (!(input instanceof HTMLTextAreaElement)) {
      return "";
    }

    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? start;
    const hodnota = input.value ?? "";

    return [
      `sel=${start}:${end}`,
      `cur=${zobrazZnak(hodnota[start] ?? "")}`,
      `prev=${zobrazZnak(start > 0 ? hodnota[start - 1] : undefined)}`,
      `next=${zobrazZnak(hodnota[start + 1] ?? "")}`,
      `vyber=\"${zkratText(hodnota.slice(start, end), 24)}\"`
    ].join(" ");
  }

  function najdiZnakPodBodem(textValue, x, y) {
    const textovyUzel = textValue?.firstChild;
    const hodnota = textovyUzel?.textContent ?? "";

    if (
      !textovyUzel ||
      textovyUzel.nodeType !== Node.TEXT_NODE ||
      !hodnota ||
      !Number.isFinite(x) ||
      !Number.isFinite(y)
    ) {
      return null;
    }

    const range = document.createRange();
    let nejblizsi = null;

    for (let i = 0; i < hodnota.length; i += 1) {
      try {
        range.setStart(textovyUzel, i);
        range.setEnd(textovyUzel, i + 1);
      } catch {
        continue;
      }

      for (const rect of range.getClientRects()) {
        const uvnitr =
          x >= rect.left &&
          x <= rect.right &&
          y >= rect.top - 4 &&
          y <= rect.bottom + 4;

        const dx = x < rect.left
          ? rect.left - x
          : x > rect.right
            ? x - rect.right
            : 0;

        const dy = y < rect.top
          ? rect.top - y
          : y > rect.bottom
            ? y - rect.bottom
            : 0;

        const vzdalenost = Math.hypot(dx, dy);

        if (!nejblizsi || vzdalenost < nejblizsi.vzdalenost) {
          nejblizsi = {
            index: i,
            znak: hodnota[i],
            vzdalenost: Math.round(vzdalenost * 10) / 10,
            left: Math.round(rect.left * 10) / 10,
            right: Math.round(rect.right * 10) / 10,
            uvnitr: false
          };
        }

        if (uvnitr) {
          return {
            index: i,
            znak: hodnota[i],
            vzdalenost: 0,
            left: Math.round(rect.left * 10) / 10,
            right: Math.round(rect.right * 10) / 10,
            uvnitr: true
          };
        }
      }
    }

    return nejblizsi;
  }

  function infoDomVyberu() {
    const aktivni = document.activeElement;

    if (aktivni?.matches?.(".todoTextInput.todoEditing")) {
      return `TODO ${infoTodoInput(aktivni)}`;
    }

    const vyber = window.getSelection();

    if (!vyber || vyber.rangeCount === 0) {
      return "DOM bez range";
    }

    const range = vyber.getRangeAt(0);

    return [
      range.collapsed ? "CUR" : `SEL=\"${zkratText(vyber.toString(), 30)}\"`,
      `${popisPrvku(range.startContainer)}:${range.startOffset}`,
      "→",
      `${popisPrvku(range.endContainer)}:${range.endOffset}`
    ].join(" ");
  }

  function pridejPosluchac(uklidy, cil, typ, handler, options) {
    cil.addEventListener(typ, handler, options);
    uklidy.push(() => cil.removeEventListener(typ, handler, options));
  }

  function pridejObserver(uklidy, observer) {
    uklidy.push(() => observer.disconnect());
  }

  function spustTodoSelection() {
    const todoList = document.getElementById("todoList");
    const selectionMenu = document.getElementById("selectionMenu");
    const uklidy = [];

    if (!todoList || !selectionMenu) {
      zapis("CHYBA | chybí #todoList nebo #selectionMenu");
      return () => {};
    }

    const zapisTodoUdalost = (nazev, event) => {
      if (jeDebugPrvek(event.target)) return;

      const todo = najdiTodo(event.target);

      if (!todo.item && !selectionMenu.contains(event.target)) {
        return;
      }

      const bod = bodUdalosti(event);
      const casti = [
        nazev,
        `target=${popisPrvku(event.target)}`,
        `row=${todo.index}`
      ];

      if (bod) {
        casti.push(`@${Math.round(bod.x)},${Math.round(bod.y)}`);
      }

      if (todo.input) {
        casti.push(
          `edit=${todo.input.hidden ? "OFF" : "ON"}`,
          infoTodoInput(todo.input)
        );
      }

      if (bod && todo.value && !todo.display?.hidden) {
        const hit = najdiZnakPodBodem(todo.value, bod.x, bod.y);

        if (hit) {
          casti.push(
            `hit=${hit.uvnitr ? "IN" : "NEAR"}:${hit.index}:${zobrazZnak(hit.znak)}`,
            `rectX=${hit.left}-${hit.right}`,
            `dist=${hit.vzdalenost}`
          );
        } else {
          casti.push("hit=NONE");
        }
      }

      casti.push(infoMenuVyberu());
      zapis(casti.join(" | "));
    };

    [
      "pointerdown",
      "pointerup",
      "pointercancel",
      "touchstart",
      "touchend",
      "touchcancel",
      "click",
      "dblclick"
    ].forEach(typ => {
      pridejPosluchac(
        uklidy,
        document,
        typ,
        event => zapisTodoUdalost(typ, event),
        true
      );
    });

    pridejPosluchac(uklidy, document, "select", event => {
      if (!event.target?.matches?.(".todoTextInput")) return;
      const todo = najdiTodo(event.target);
      zapis(`SELECT | row=${todo.index} | ${infoTodoInput(event.target)} | ${infoMenuVyberu()}`);
    }, true);

    pridejPosluchac(uklidy, document, "focusin", event => {
      if (!event.target?.matches?.(".todoTextInput")) return;
      const todo = najdiTodo(event.target);
      zapis(`FOCUSIN | row=${todo.index} | ${infoTodoInput(event.target)} | ${infoMenuVyberu()}`);
    }, true);

    pridejPosluchac(uklidy, document, "focusout", event => {
      if (!event.target?.matches?.(".todoTextInput")) return;
      const todo = najdiTodo(event.target);
      zapis(`FOCUSOUT | row=${todo.index} | ${infoTodoInput(event.target)} | ${infoMenuVyberu()}`);
    }, true);

    pridejPosluchac(uklidy, document, "selectionchange", () => {
      const input = document.activeElement;
      if (!input?.matches?.(".todoTextInput")) return;
      const todo = najdiTodo(input);
      zapis(`SELECTIONCHANGE | row=${todo.index} | ${infoTodoInput(input)} | ${infoMenuVyberu()}`);
    }, true);

    pridejPosluchac(uklidy, document, "lubanote:todo-kurzor-menu", event => {
      const input = event.detail?.textarea;
      const todo = najdiTodo(input);
      const x = event.detail?.x;
      const y = event.detail?.y;

      zapis(
        `CUSTOM kurzor-menu | row=${todo.index} | @${Math.round(x ?? 0)},${Math.round(y ?? 0)} | ${infoTodoInput(input)} | ${infoMenuVyberu()}`
      );

      requestAnimationFrame(() => {
        zapis(`CUSTOM +RAF | row=${todo.index} | ${infoTodoInput(input)} | ${infoMenuVyberu()}`);
      });

      setTimeout(() => {
        if (aktivniModul === "todoSelection") {
          zapis(`CUSTOM +80ms | row=${todo.index} | ${infoTodoInput(input)} | ${infoMenuVyberu()}`);
        }
      }, 80);
    }, true);

    const observerMenu = new MutationObserver(() => {
      zapis(`MENU MUTATION | ${infoMenuVyberu()}`);
    });

    observerMenu.observe(selectionMenu, {
      attributes: true,
      attributeFilter: ["hidden", "style", "class"],
      subtree: true
    });

    pridejObserver(uklidy, observerMenu);

    zapis(`START TODO SELECTION | ${infoMenuVyberu()}`);

    return () => {
      uklidy.forEach(uklid => uklid());
    };
  }

  function spustEditorSelection() {
    const editor = document.getElementById("modalRichText");
    const selectionMenu = document.getElementById("selectionMenu");
    const uklidy = [];
    let posledniTouchEnd = 0;

    if (!editor) {
      zapis("CHYBA | chybí #modalRichText");
      return () => {};
    }

    const zapisEditor = (typ, event = null, doplnek = "") => {
      if (event && jeDebugPrvek(event.target)) return;

      const bod = event ? bodUdalosti(event) : null;
      const target = event?.target || document.activeElement;
      const element = target instanceof Element ? target : target?.parentElement;
      const li = element?.closest?.("#modalRichText li") || null;
      const vsechnyLi = li ? [...editor.querySelectorAll("li")] : [];
      const row = li ? vsechnyLi.indexOf(li) + 1 : 0;

      const casti = [
        typ,
        `row=${row}`,
        `target=${popisPrvku(target)}`
      ];

      if (bod) {
        casti.push(`@${Math.round(bod.x)},${Math.round(bod.y)}`);
      }

      casti.push(infoDomVyberu());

      if (selectionMenu) {
        casti.push(infoMenuVyberu());
      }

      if (doplnek) {
        casti.push(doplnek);
      }

      zapis(casti.join(" | "));
    };

    ["pointerdown", "pointerup", "pointercancel", "click", "dblclick"].forEach(typ => {
      pridejPosluchac(uklidy, editor, typ, event => zapisEditor(typ, event), true);
    });

    ["touchstart", "touchend", "touchcancel"].forEach(typ => {
      pridejPosluchac(uklidy, editor, typ, event => {
        let doplnek = "";

        if (typ === "touchend") {
          const ted = performance.now();
          const dt = posledniTouchEnd ? Math.round(ted - posledniTouchEnd) : 0;
          posledniTouchEnd = ted;
          doplnek = `dt=${dt}ms`;
        }

        zapisEditor(typ, event, doplnek);
      }, true);
    });

    pridejPosluchac(uklidy, document, "selectionchange", () => {
      const vyber = window.getSelection();
      const anchor = vyber?.anchorNode;

      if (!anchor || !editor.contains(anchor)) {
        return;
      }

      zapisEditor("SELECTIONCHANGE");
    }, true);

    if (selectionMenu) {
      const observerMenu = new MutationObserver(() => {
        zapis(`MENU MUTATION | ${infoMenuVyberu()} | ${infoDomVyberu()}`);
      });

      observerMenu.observe(selectionMenu, {
        attributes: true,
        attributeFilter: ["hidden", "style", "class"],
        subtree: true
      });

      pridejObserver(uklidy, observerMenu);
    }

    zapis(`START EDITOR SELECTION | ${infoDomVyberu()} | ${infoMenuVyberu()}`);

    return () => {
      uklidy.forEach(uklid => uklid());
    };
  }

  function spustGesta() {
    const uklidy = [];

    const zapisGesto = (typ, event) => {
      if (jeDebugPrvek(event.target)) return;

      const bod = bodUdalosti(event);
      const casti = [
        typ,
        `target=${popisPrvku(event.target)}`
      ];

      if (event.pointerType) {
        casti.push(`pointer=${event.pointerType}#${event.pointerId}`);
      }

      if (bod) {
        casti.push(`@${Math.round(bod.x)},${Math.round(bod.y)}`);
      }

      if ("buttons" in event) {
        casti.push(`buttons=${event.buttons}`);
      }

      casti.push(`active=${popisPrvku(document.activeElement)}`);
      casti.push(infoDomVyberu());
      zapis(casti.join(" | "));
    };

    [
      "pointerdown",
      "pointerup",
      "pointercancel",
      "touchstart",
      "touchend",
      "touchcancel",
      "click",
      "dblclick",
      "contextmenu"
    ].forEach(typ => {
      pridejPosluchac(
        uklidy,
        document,
        typ,
        event => zapisGesto(typ, event),
        true
      );
    });

    zapis("START GESTURES");

    return () => {
      uklidy.forEach(uklid => uklid());
    };
  }

  function stopModulu({ zapisStop = true } = {}) {
    if (typeof stopAktivnihoModulu === "function") {
      stopAktivnihoModulu();
    }

    stopAktivnihoModulu = null;

    if (zapisStop && aktivniModul) {
      zapis(`STOP ${MODULY[aktivniModul] || aktivniModul}`);
    }

    aktivniModul = "";

    if (statusEl) {
      statusEl.textContent = "diagnostika vypnutá";
    }

    if (startTlacitko) {
      startTlacitko.classList.remove("active");
      startTlacitko.textContent = "Spustit";
    }

    prekresli();
  }

  function spustModul() {
    stopModulu({ zapisStop: false });

    aktivniModul = selectModulu.value;
    startCas = performance.now();
    zaznamy = [];

    if (aktivniModul === "todoSelection") {
      stopAktivnihoModulu = spustTodoSelection();
    } else if (aktivniModul === "editorSelection") {
      stopAktivnihoModulu = spustEditorSelection();
    } else if (aktivniModul === "gestures") {
      stopAktivnihoModulu = spustGesta();
    }

    statusEl.textContent = `běží: ${MODULY[aktivniModul]}`;
    startTlacitko.classList.add("active");
    startTlacitko.textContent = "Restart";
    prekresli();
  }

  async function zkopirujReport(tlacitko) {
    const report = hlavickaReportu() + zaznamy.join("\n");

    try {
      await navigator.clipboard.writeText(report);
    } catch {
      const pomocnyInput = document.createElement("textarea");
      pomocnyInput.value = report;
      pomocnyInput.style.position = "fixed";
      pomocnyInput.style.opacity = "0";
      document.body.appendChild(pomocnyInput);
      pomocnyInput.select();
      document.execCommand("copy");
      pomocnyInput.remove();
    }

    const puvodni = tlacitko.textContent;
    tlacitko.textContent = "Zkopírováno ✓";

    setTimeout(() => {
      tlacitko.textContent = puvodni;
    }, 1200);
  }

  function vytvorHub() {
    if (hub) return hub;

    hub = document.createElement("section");
    hub.id = "ln-debug-hub";
    hub.hidden = true;
    hub.setAttribute("aria-label", "LubaNote Debug Hub");
    hub.innerHTML = `
      <div class="ln-dh-head">
        <strong>🐞 LubaNote Debug Hub</strong>
        <span class="ln-dh-status">diagnostika vypnutá</span>
        <button type="button" data-dh="min" title="Sbalit">—</button>
        <button type="button" data-dh="close" title="Zavřít">×</button>
      </div>

      <div class="ln-dh-controls">
        <select data-dh="module" aria-label="Diagnostický modul">
          <option value="todoSelection">TODO – výběr / Vložit / Vše</option>
          <option value="editorSelection">Editor – výběr textu</option>
          <option value="gestures">Gesta – pointer / touch / click</option>
        </select>
        <button type="button" class="ln-dh-start" data-dh="start">Spustit</button>
        <button type="button" data-dh="stop">Stop</button>
      </div>

      <div class="ln-dh-summary">modul: vypnutý</div>
      <pre class="ln-dh-log">Diagnostika zatím neběží.</pre>

      <div class="ln-dh-footer">
        <button type="button" data-dh="clear">Vymazat</button>
        <button type="button" data-dh="copy">Kopírovat report</button>
      </div>
    `;

    document.body.appendChild(hub);

    logEl = hub.querySelector(".ln-dh-log");
    summaryEl = hub.querySelector(".ln-dh-summary");
    statusEl = hub.querySelector(".ln-dh-status");
    selectModulu = hub.querySelector('[data-dh="module"]');
    startTlacitko = hub.querySelector('[data-dh="start"]');

    hub.addEventListener("click", event => {
      const tlacitko = event.target.closest("button[data-dh]");
      if (!tlacitko) return;

      const akce = tlacitko.dataset.dh;

      if (akce === "start") {
        spustModul();
        return;
      }

      if (akce === "stop") {
        stopModulu();
        return;
      }

      if (akce === "clear") {
        zaznamy = [];
        startCas = performance.now();
        zapis("RESET");
        return;
      }

      if (akce === "copy") {
        zkopirujReport(tlacitko);
        return;
      }

      if (akce === "min") {
        const sbaleno = hub.classList.toggle("ln-dh-minimized");
        tlacitko.textContent = sbaleno ? "+" : "—";
        return;
      }

      if (akce === "close") {
        stopModulu();
        hub.hidden = true;
      }
    });

    return hub;
  }

  function otevriHub() {
    const panel = vytvorHub();
    panel.hidden = false;
    panel.classList.remove("ln-dh-minimized");
    prekresli();
  }

  function pripojKVisualDebugu(panel) {
    if (!panel || panel.querySelector("#ln-dh-launch-section")) {
      return;
    }

    const telo = panel.querySelector(".ln-vd-body");
    const prvniSekce = telo?.querySelector(".ln-vd-section");

    if (!telo) {
      return;
    }

    const sekce = document.createElement("section");
    sekce.className = "ln-vd-section";
    sekce.id = "ln-dh-launch-section";
    sekce.innerHTML = `
      <div class="ln-vd-section-title">
        <span>Diagnostika</span>
        <span>běžně vypnutá</span>
      </div>
      <div class="ln-vd-actions">
        <button id="ln-dh-open" class="ln-vd-btn" type="button">🐞 Otevřít Debug Hub</button>
      </div>
      <small class="ln-dh-launch-note">
        Logování se připojí až po spuštění konkrétního modulu. V normálním provozu neběží.
      </small>
    `;

    if (prvniSekce?.nextSibling) {
      telo.insertBefore(sekce, prvniSekce.nextSibling);
    } else {
      telo.appendChild(sekce);
    }

    sekce.querySelector("#ln-dh-open")?.addEventListener("click", otevriHub);
  }

  document.addEventListener("lubanote:visual-debug-ready", event => {
    pripojKVisualDebugu(event.detail?.panel);
  });

  window.LubaNoteDebugHub = {
    open: otevriHub,
    stop: () => stopModulu(),
    startTodoSelection: () => {
      otevriHub();
      selectModulu.value = "todoSelection";
      spustModul();
    },
    startEditorSelection: () => {
      otevriHub();
      selectModulu.value = "editorSelection";
      spustModul();
    },
    startGestures: () => {
      otevriHub();
      selectModulu.value = "gestures";
      spustModul();
    }
  };
})();
