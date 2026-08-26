/* ========================================
   LUBANOTE – TODO SELECTION DEBUG
   Dočasná diagnostika dvojtapu / Vložit / Vše.
   Nemění logiku TODO ani selection menu.
======================================== */

(() => {
  "use strict";

  const todoList = document.getElementById("todoList");
  const selectionMenu = document.getElementById("selectionMenu");

  if (!todoList || !selectionMenu) {
    console.warn("TODO Selection Debug: chybí todoList nebo selectionMenu.");
    return;
  }

  const zaznamy = [];
  const MAX_ZAZNAMU = 260;
  const startCas = performance.now();

  const panel = document.createElement("section");
  panel.id = "lnTodoSelDebug";
  panel.setAttribute("aria-label", "TODO Selection Debug");
  panel.innerHTML = `
    <div class="lnTodoSelDebugHead">
      <strong>🐞 TODO selection debug</strong>
      <div class="lnTodoSelDebugActions">
        <button type="button" data-akce="sbalit">Sbalit</button>
        <button type="button" data-akce="vymazat">Vymazat</button>
        <button type="button" data-akce="kopirovat">Kopírovat report</button>
      </div>
    </div>
    <pre class="lnTodoSelDebugLog"></pre>
  `;

  const styl = document.createElement("style");
  styl.textContent = `
    #lnTodoSelDebug {
      position: fixed;
      left: 6px;
      right: 6px;
      bottom: 6px;
      z-index: 2147483646;
      max-height: 42vh;
      display: flex;
      flex-direction: column;
      border: 1px solid rgba(255,255,255,.28);
      border-radius: 12px;
      background: rgba(20,20,24,.96);
      color: #fff;
      box-shadow: 0 10px 30px rgba(0,0,0,.35);
      font: 11px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      overflow: hidden;
      user-select: none;
      -webkit-user-select: none;
    }

    #lnTodoSelDebug.lnSbaleno {
      max-height: 44px;
    }

    #lnTodoSelDebug.lnSbaleno .lnTodoSelDebugLog {
      display: none;
    }

    .lnTodoSelDebugHead {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 6px 8px;
      border-bottom: 1px solid rgba(255,255,255,.14);
    }

    .lnTodoSelDebugActions {
      display: flex;
      gap: 4px;
    }

    .lnTodoSelDebugActions button {
      min-height: 30px;
      padding: 3px 7px;
      border: 1px solid rgba(255,255,255,.22);
      border-radius: 7px;
      background: rgba(255,255,255,.10);
      color: #fff;
      font: inherit;
    }

    .lnTodoSelDebugLog {
      flex: 1 1 auto;
      min-height: 0;
      margin: 0;
      padding: 7px 8px 10px;
      overflow: auto;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      user-select: text;
      -webkit-user-select: text;
    }
  `;

  document.head.appendChild(styl);
  document.body.appendChild(panel);

  const log = panel.querySelector(".lnTodoSelDebugLog");
  const tlacitkoSbalit = panel.querySelector('[data-akce="sbalit"]');

  function cas() {
    return Math.round(performance.now() - startCas);
  }

  function zkratText(text, max = 42) {
    const hodnota = String(text ?? "")
      .replace(/\n/g, "↵")
      .replace(/\t/g, "⇥");

    if (hodnota.length <= max) {
      return hodnota;
    }

    return `${hodnota.slice(0, max - 1)}…`;
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
      return String(prvek?.nodeName || "null");
    }

    let popis = prvek.tagName;

    if (prvek.id) {
      popis += `#${prvek.id}`;
    }

    if (prvek.classList.length) {
      popis += `.${[...prvek.classList].join(".")}`;
    }

    return popis;
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

  function infoInput(input) {
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
      `vyber="${zkratText(hodnota.slice(start, end), 24)}"`
    ].join(" ");
  }

  function infoMenu() {
    const styly = getComputedStyle(selectionMenu);
    const viditelne = !selectionMenu.hidden &&
      styly.display !== "none" &&
      styly.visibility !== "hidden";

    const tlacitka = [...selectionMenu.querySelectorAll("button")]
      .filter(btn => !btn.hidden && getComputedStyle(btn).display !== "none")
      .map(btn => btn.textContent?.trim())
      .filter(Boolean)
      .join("/");

    return `menu=${viditelne ? "OPEN" : "CLOSED"}[${tlacitka || "-"}]`;
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

      const rects = [...range.getClientRects()];

      for (const rect of rects) {
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

        if (
          !nejblizsi ||
          vzdalenost < nejblizsi.vzdalenost
        ) {
          nejblizsi = {
            index: i,
            znak: hodnota[i],
            vzdalenost: Math.round(vzdalenost * 10) / 10,
            left: Math.round(rect.left * 10) / 10,
            right: Math.round(rect.right * 10) / 10
          };
        }

        if (uvnitr) {
          return {
            index: i,
            znak: hodnota[i],
            uvnitr: true,
            vzdalenost: 0,
            left: Math.round(rect.left * 10) / 10,
            right: Math.round(rect.right * 10) / 10
          };
        }
      }
    }

    return nejblizsi
      ? { ...nejblizsi, uvnitr: false }
      : null;
  }

  function zapis(text) {
    zaznamy.push(`${String(cas()).padStart(5, " ")} ${text}`);

    if (zaznamy.length > MAX_ZAZNAMU) {
      zaznamy.splice(0, zaznamy.length - MAX_ZAZNAMU);
    }

    log.textContent = zaznamy.join("\n");
    log.scrollTop = log.scrollHeight;
  }

  function zapisUdalost(nazev, event) {
    const bod = bodUdalosti(event);
    const todo = najdiTodo(event.target);

    if (!todo.item && !selectionMenu.contains(event.target)) {
      return;
    }

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
        infoInput(todo.input)
      );
    }

    if (
      bod &&
      todo.value &&
      !todo.display?.hidden
    ) {
      const hit = najdiZnakPodBodem(
        todo.value,
        bod.x,
        bod.y
      );

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

    casti.push(infoMenu());
    zapis(casti.join(" | "));
  }

  [
    "pointerdown",
    "pointerup",
    "touchstart",
    "touchend",
    "click",
    "dblclick"
  ].forEach(nazev => {
    document.addEventListener(
      nazev,
      event => zapisUdalost(nazev, event),
      true
    );
  });

  document.addEventListener(
    "select",
    event => {
      if (!event.target?.matches?.(".todoTextInput")) {
        return;
      }

      const todo = najdiTodo(event.target);
      zapis(
        `SELECT | row=${todo.index} | ${infoInput(event.target)} | ${infoMenu()}`
      );
    },
    true
  );

  document.addEventListener(
    "focusin",
    event => {
      if (!event.target?.matches?.(".todoTextInput")) {
        return;
      }

      const todo = najdiTodo(event.target);
      zapis(
        `FOCUSIN | row=${todo.index} | ${infoInput(event.target)} | ${infoMenu()}`
      );
    },
    true
  );

  document.addEventListener(
    "focusout",
    event => {
      if (!event.target?.matches?.(".todoTextInput")) {
        return;
      }

      const todo = najdiTodo(event.target);
      zapis(
        `FOCUSOUT | row=${todo.index} | ${infoInput(event.target)} | ${infoMenu()}`
      );
    },
    true
  );

  document.addEventListener(
    "selectionchange",
    () => {
      const input = document.activeElement;

      if (!input?.matches?.(".todoTextInput")) {
        return;
      }

      const todo = najdiTodo(input);
      zapis(
        `SELECTIONCHANGE | row=${todo.index} | ${infoInput(input)} | ${infoMenu()}`
      );
    },
    true
  );

  document.addEventListener(
    "lubanote:todo-kurzor-menu",
    event => {
      const input = event.detail?.textarea;
      const todo = najdiTodo(input);
      const x = event.detail?.x;
      const y = event.detail?.y;

      zapis(
        `CUSTOM kurzor-menu | row=${todo.index} | @${Math.round(x ?? 0)},${Math.round(y ?? 0)} | ${infoInput(input)} | ${infoMenu()}`
      );

      requestAnimationFrame(() => {
        zapis(
          `CUSTOM +RAF | row=${todo.index} | ${infoInput(input)} | ${infoMenu()}`
        );
      });

      setTimeout(() => {
        zapis(
          `CUSTOM +80ms | row=${todo.index} | ${infoInput(input)} | ${infoMenu()}`
        );
      }, 80);
    },
    true
  );

  const observerMenu = new MutationObserver(() => {
    zapis(`MENU MUTATION | ${infoMenu()}`);
  });

  observerMenu.observe(selectionMenu, {
    attributes: true,
    attributeFilter: ["hidden", "style", "class"],
    subtree: true
  });

  panel.addEventListener("click", async event => {
    const tlacitko = event.target.closest("button[data-akce]");

    if (!tlacitko) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const akce = tlacitko.dataset.akce;

    if (akce === "sbalit") {
      const sbaleno = panel.classList.toggle("lnSbaleno");
      tlacitkoSbalit.textContent = sbaleno ? "Rozbalit" : "Sbalit";
      return;
    }

    if (akce === "vymazat") {
      zaznamy.length = 0;
      log.textContent = "";
      zapis(`RESET | ${infoMenu()}`);
      return;
    }

    if (akce === "kopirovat") {
      const hlavicka = [
        "LUBANOTE TODO SELECTION DEBUG",
        `UA: ${navigator.userAgent}`,
        `viewport: ${window.innerWidth}x${window.innerHeight}`,
        "Legenda: ␠ = mezera, END = konec textu",
        ""
      ].join("\n");

      const report = hlavicka + zaznamy.join("\n");

      try {
        await navigator.clipboard.writeText(report);
        tlacitko.textContent = "Zkopírováno ✓";
      } catch {
        const pomocnyInput = document.createElement("textarea");
        pomocnyInput.value = report;
        pomocnyInput.style.position = "fixed";
        pomocnyInput.style.opacity = "0";
        document.body.appendChild(pomocnyInput);
        pomocnyInput.select();
        document.execCommand("copy");
        pomocnyInput.remove();
        tlacitko.textContent = "Zkopírováno ✓";
      }

      setTimeout(() => {
        tlacitko.textContent = "Kopírovat report";
      }, 1200);
    }
  });

  zapis(`START | UA=${navigator.userAgent}`);
  zapis(`viewport=${window.innerWidth}x${window.innerHeight} | ${infoMenu()}`);
})();
