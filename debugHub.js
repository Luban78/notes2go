/* ========================================
   LUBANOTE – DEBUG HUB
   Trvale dostupná, ale běžně neaktivní diagnostika.

   Aktivace:
   1) 5× tap na logo otevře Visual Debug
   2) v něm tlačítko „🐞 Diagnostika“
   3) konkrétní modul se začne logovat až po „Spustit"

   Diagnostický build může nastavit window.LUBANOTE_TAG_VD_AUTO = true.
   V tom případě se modul Start / sync / síť připojí automaticky na
   pasivní startup buffer ještě před otevřením Debug Hubu.
======================================== */

(() => {
  "use strict";

  let hub = null;
  let logEl = null;
  let summaryEl = null;
  let statusEl = null;
  let selectModulu = null;
  let startTlacitko = null;
  let moduleLabel = null;
  let moduleMenu = null;
  let stopAktivnihoModulu = null;
  let aktivniModul = "";
  let startCas = 0;
  let zaznamy = [];
  let presunHubu = null;
  let zmenaVelikostiHubu = null;
  let geometrieHubuPredMinimalizaci = null;

  const MAX_ZAZNAMU = 700;

  const MODULY = {
    startup: "Start / sync / síť",
    todoSelection: "TODO – výběr / Vložit / Vše",
    editorSelection: "Editor – výběr textu",
    gestures: "Gesta – pointer / touch / click",
    bulletDrag: "Bullet – drag / hierarchie",
    cardDrag: "Karty – reálný drag + tuning",
    cardDragLab: "Karty – Drag Lab (syntetický)",
    performance: "Výkon – benchmark"
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

  function infoUchytuVyberu() {
    const uchyty = [...document.querySelectorAll(".selectionHandle")];
    const viditelne = uchyty.filter(prvek => {
      const styl = getComputedStyle(prvek);
      return !prvek.hidden &&
        styl.display !== "none" &&
        styl.visibility !== "hidden" &&
        Number(styl.opacity || 1) !== 0;
    });

    return `handles=${viditelne.length}/${uchyty.length}`;
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

    const infoBodu = (x, y) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return "hit=N/A";
      }

      let range = null;
      try {
        range = document.caretRangeFromPoint?.(x, y) || null;
      } catch (_chyba) {
        range = null;
      }

      const podPrstem = document.elementFromPoint?.(x, y) || null;
      const casti = [`elem=${popisPrvku(podPrstem)}`];

      if (!range) {
        casti.push("caret=NONE");
        return casti.join(" ");
      }

      casti.push(
        `caret=${popisPrvku(range.startContainer)}:${range.startOffset}`
      );

      const node = range.startContainer;
      const parent = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
      if (parent instanceof Element) {
        casti.push(`parent=${popisPrvku(parent)}`);
      }

      return casti.join(" ");
    };

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

      casti.push(infoUchytuVyberu());

      if (event) {
        casti.push(`prevented=${event.defaultPrevented ? "Y" : "N"}`);
      }

      if (doplnek) {
        casti.push(doplnek);
      }

      zapis(casti.join(" | "));
    };

    ["pointerdown", "pointerup", "pointercancel", "click", "dblclick", "contextmenu"].forEach(typ => {
      pridejPosluchac(uklidy, editor, typ, event => zapisEditor(typ, event), true);
    });

    ["touchstart", "touchend", "touchcancel"].forEach(typ => {
      pridejPosluchac(uklidy, editor, typ, event => {
        let doplnek = "";
        const bod = bodUdalosti(event);

        if (bod) {
          doplnek = infoBodu(bod.x, bod.y);
        }

        if (typ === "touchend") {
          const ted = performance.now();
          const dt = posledniTouchEnd ? Math.round(ted - posledniTouchEnd) : 0;
          posledniTouchEnd = ted;
          doplnek = `${doplnek} dt=${dt}ms`.trim();

          if (dt > 0 && dt <= 380) {
            [30, 80, 160, 300, 500].forEach(zpozdeni => {
              setTimeout(() => {
                if (aktivniModul !== "editorSelection") return;
                zapis(
                  `AFTER DVOJTAP +${zpozdeni}ms | ${infoDomVyberu()} | ${infoMenuVyberu()} | ${infoUchytuVyberu()}`
                );
              }, zpozdeni);
            });
          }
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

    pridejPosluchac(uklidy, document, "lubanote:editor-selection-debug", event => {
      const detail = event.detail || {};
      const casti = [
        `INTERNI ${detail.faze || "?"}`,
        infoDomVyberu(),
        infoMenuVyberu(),
        infoUchytuVyberu()
      ];

      Object.entries(detail).forEach(([klic, hodnota]) => {
        if (klic === "faze") return;
        casti.push(`${klic}=${zkratText(hodnota, 52)}`);
      });

      zapis(casti.join(" | "));
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

    pridejPosluchac(
      uklidy,
      document,
      "lubanote:tag-drag-debug",
      event => zapis(`TAGDRAG | ${event.detail?.text || ""}`),
      true
    );

    pridejPosluchac(
      uklidy,
      document,
      "lubanote:v2-ime-debug",
      event => zapis(`V2IME | ${event.detail?.text || ""}`),
      true
    );

    pridejPosluchac(
      uklidy,
      document,
      "lubanote:v2-stability-debug",
      event => zapis(`V2STAB | ${event.detail?.text || ""}`),
      true
    );

    pridejPosluchac(
      uklidy,
      document,
      "lubanote:keyboard-layout-debug",
      event => zapis(`LKLAYOUT | ${event.detail?.text || ""}`),
      true
    );

    zapis("START GESTURES");

    return () => {
      uklidy.forEach(uklid => uklid());
    };
  }


  function spustBulletDrag() {
    const editor = document.getElementById("modalRichText");
    const uklidy = [];
    let posledniMoveLog = 0;

    if (!editor) {
      zapis("CHYBA | chybí #modalRichText");
      return () => {};
    }

    function hloubkaLi(li) {
      if (!li) return 0;
      let hloubka = 0;
      let uzel = li.parentElement;

      while (uzel && uzel !== editor) {
        if (uzel.tagName === "UL") {
          hloubka += 1;
        }
        uzel = uzel.parentElement;
      }

      return hloubka;
    }

    function infoLi(li) {
      if (!li) return "li=NONE";

      const rodicUl = li.parentElement?.tagName === "UL"
        ? li.parentElement
        : null;
      const sourozenci = rodicUl
        ? [...rodicUl.children].filter(prvek => prvek.tagName === "LI")
        : [];
      const index = sourozenci.indexOf(li);
      const diteUl = [...li.children].find(prvek => prvek.tagName === "UL") || null;
      const pocetDeti = diteUl
        ? [...diteUl.children].filter(prvek => prvek.tagName === "LI").length
        : 0;

      return [
        `li=\"${zkratText(li.childNodes[0]?.textContent || li.textContent, 26)}\"`,
        `depth=${hloubkaLi(li)}`,
        `index=${index}/${sourozenci.length}`,
        `children=${pocetDeti}`,
        `collapsed=${li.classList.contains("bulletSbaleny")}`,
        `selected=${li.classList.contains("bulletMoveSelected")}`,
        `dragging=${li.classList.contains("bulletDragging")}`
      ].join(" ");
    }

    function strom() {
      const radky = [];

      editor.querySelectorAll("li").forEach(li => {
        const text = zkratText(li.childNodes[0]?.textContent || li.textContent, 22);
        radky.push(`${"  ".repeat(Math.max(0, hloubkaLi(li) - 1))}• ${text}`);
      });

      return radky.join(" / ") || "(bez LI)";
    }

    function aktualniLi(event) {
      const element = event?.target instanceof Element
        ? event.target
        : event?.target?.parentElement;

      return element?.closest?.("#modalRichText li") ||
        editor.querySelector("li.bulletDragging") ||
        editor.querySelector("li.bulletMoveSelected") ||
        null;
    }

    function zapisBullet(typ, event, { move = false } = {}) {
      if (event && jeDebugPrvek(event.target)) return;

      if (move) {
        const ted = performance.now();
        if (ted - posledniMoveLog < 90) return;
        posledniMoveLog = ted;
      }

      const bod = event ? bodUdalosti(event) : null;
      const li = aktualniLi(event);
      const casti = [typ, infoLi(li)];

      if (bod) {
        casti.push(`@${Math.round(bod.x)},${Math.round(bod.y)}`);
      }

      const vybrany = editor.querySelector("li.bulletMoveSelected");
      const tazeny = editor.querySelector("li.bulletDragging");
      const aktivniUl = editor.querySelector("ul.bulletDragActive");

      casti.push(`moveMode=${editor.classList.contains("bulletMoveMode")}`);
      casti.push(`selectedDOM=${Boolean(vybrany)}`);
      casti.push(`dragDOM=${Boolean(tazeny)}`);
      casti.push(`activeUL=${Boolean(aktivniUl)}`);

      zapis(casti.join(" | "));
    }

    [
      "pointerdown",
      "pointerup",
      "pointercancel",
      "touchstart",
      "touchend",
      "touchcancel",
      "click"
    ].forEach(typ => {
      pridejPosluchac(
        uklidy,
        editor,
        typ,
        event => zapisBullet(typ, event),
        true
      );
    });

    pridejPosluchac(
      uklidy,
      editor,
      "pointermove",
      event => zapisBullet("pointermove", event, { move: true }),
      true
    );

    pridejPosluchac(
      uklidy,
      editor,
      "touchmove",
      event => zapisBullet("touchmove", event, { move: true }),
      { capture: true, passive: true }
    );

    const observer = new MutationObserver(mutations => {
      const relevantni = mutations.some(mutation => {
        if (mutation.type === "childList") return true;
        if (mutation.type === "attributes") {
          return ["class", "hidden"].includes(mutation.attributeName);
        }
        return false;
      });

      if (!relevantni) return;

      const vybrany = editor.querySelector("li.bulletMoveSelected");
      const tazeny = editor.querySelector("li.bulletDragging");

      zapis(
        `DOM MUTATION | selected=${Boolean(vybrany)} drag=${Boolean(tazeny)} | strom=${strom()}`
      );
    });

    observer.observe(editor, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "hidden"]
    });

    pridejObserver(uklidy, observer);

    zapis(`START BULLET DRAG | strom=${strom()}`);

    return () => {
      uklidy.forEach(uklid => uklid());
    };
  }


  function spustCardDrag() {
    const handler = (event) => {
      const detail = event.detail || {};
      const typ = String(detail.typ || "EVENT");

      if (typ === "START") {
        zapis(
          `DRAG START | card=${detail.card || "-"} | index=${detail.index ?? "-"} | slots=${detail.slots ?? "-"} | cols=${detail.columns ?? "-"} | pinned=${detail.pinned ? "yes" : "no"} | scroll=${detail.scrollTop ?? "-"} | @${detail.x ?? "-"},${detail.y ?? "-"}`
        );
        return;
      }

      if (typ === "READY") {
        zapis(
          `DRAG READY | input=${detail.input || "-"} | @${detail.x ?? "-"},${detail.y ?? "-"}`
        );
        return;
      }

      if (typ === "PICKUP") {
        const capture = detail.input === "touch"
          ? "n/a"
          : (detail.pointerCaptured ? "yes" : "no");

        zapis(
          `DRAG PICKUP | input=${detail.input || "-"} | capture=${capture}`
        );
        return;
      }

      if (typ === "MOVE_FIRST") {
        zapis(
          `DRAG MOVE FIRST | d=${detail.distance ?? "-"} | @${detail.x ?? "-"},${detail.y ?? "-"}`
        );
        return;
      }

      if (typ === "SCROLL_ARM") {
        zapis(
          `DRAG SCROLL ARM | d=${detail.distance ?? "-"}`
        );
        return;
      }

      if (typ === "POINTER_CANCEL") {
        zapis(
          `DRAG POINTER CANCEL | input=${detail.input || "-"} | active=${detail.active ? "yes" : "no"} | scroll=${detail.autoScroll ? "yes" : "no"} | moved=${detail.moved ?? "-"}`
        );
        return;
      }

      if (typ === "TUNE") {
        zapis(`DRAG TUNE | ${detail.settings || "-"}`);
        return;
      }

      if (typ === "FOCUS_ON" || typ === "FOCUS_OFF") {
        zapis(`DRAG ${typ === "FOCUS_ON" ? "FOCUS ON" : "FOCUS OFF"} | scale=${detail.scale ?? "-"}% | ${detail.ms ?? "-"}ms`);
        return;
      }

      if (typ === "SLOT_LOCK") {
        zapis(`DRAG SLOT LOCK | ${detail.from ?? "-"} -> ${detail.to ?? "-"} | anim=${detail.anim ?? "-"}ms | reason=${detail.reason || "-"}`);
        return;
      }

      if (typ === "REFREEZE") {
        zapis(`DRAG REFREEZE | target=${detail.target ?? "-"} | slots=${detail.slots ?? "-"}`);
        return;
      }

      if (typ === "DWELL_RESET") {
        if (window.LubaNoteCardDrag?.ziskejNastaveni?.().detailLog) {
          zapis(`DRAG DWELL RESET | slot=${detail.candidate ?? "-"} | move=${detail.move ?? "-"}px`);
        }
        return;
      }

      if (typ === "TARGET") {
        zapis(
          `DRAG TARGET | ${detail.from ?? "-"} -> ${detail.candidate ?? "-"} | col=${detail.column ?? "-"} | hold=${detail.hold ?? "-"}ms | @${detail.x ?? "-"},${detail.y ?? "-"}`
        );
        return;
      }

      if (typ === "TARGET_HOLD") {
        zapis(
          `DRAG TARGET HOLD | slot=${detail.candidate ?? "-"} | ${detail.ms ?? "-"}ms`
        );
        return;
      }

      if (typ === "TARGET_CONFIRM") {
        zapis(
          `DRAG TARGET CONFIRM | ${detail.from ?? "-"} -> ${detail.to ?? "-"} | reason=${detail.reason || "-"}`
        );
        return;
      }

      if (typ === "TARGET_CANCEL") {
        zapis(
          `DRAG TARGET CANCEL | slot=${detail.candidate ?? "-"} | reason=${detail.reason || "-"}`
        );
        return;
      }

      if (typ === "GAP") {
        zapis(
          `DRAG GAP OPEN | slot=${detail.slot ?? "-"} | reason=${detail.reason || "-"}`
        );
        return;
      }

      if (typ === "TARGET_SHOW") {
        zapis(
          `DRAG TARGET SHOW | slot=${detail.slot ?? "-"}`
        );
        return;
      }

      if (typ === "DROP") {
        zapis(
          `DRAG DROP | ${detail.from ?? "-"} -> ${detail.to ?? "-"} | changed=${detail.changed ? "yes" : "no"}`
        );
        return;
      }

      if (typ === "COLUMN") {
        zapis(
          `DRAG COLUMN | ${detail.from ?? "-"} -> ${detail.to ?? "-"} | x=${detail.x ?? "-"}`
        );
        return;
      }

      /* Starší typy zůstávají čitelné při porovnání starého reportu. */
      if (typ === "CANDIDATE") {
        zapis(
          `DRAG CANDIDATE | ${detail.from ?? "-"} -> ${detail.candidate ?? "-"} | d=${detail.candidateDistance ?? "-"}/${detail.currentDistance ?? "-"} | h=${detail.hysteresis ?? "-"} | @${detail.x ?? "-"},${detail.y ?? "-"}`
        );
        return;
      }

      if (typ === "SLOT") {
        zapis(
          `DRAG SLOT | ${detail.from ?? "-"} -> ${detail.to ?? "-"} | d=${detail.candidateDistance ?? "-"}/${detail.currentDistance ?? "-"} | @${detail.x ?? "-"},${detail.y ?? "-"}`
        );
        return;
      }

      if (typ === "SCROLL_START") {
        zapis(
          `DRAG SCROLL START | dir=${detail.direction || "-"}`
        );
        return;
      }

      if (typ === "SCROLL") {
        zapis(
          `DRAG SCROLL | dir=${detail.direction || "-"} | top=${detail.scrollTop ?? "-"} | delta=${detail.delta ?? "-"} | speed=${detail.speed ?? "-"} | target=${detail.target ?? "-"}`
        );
        return;
      }

      if (typ === "SCROLL_END") {
        zapis(
          `DRAG SCROLL END | top=${detail.scrollTop ?? "-"}`
        );
        return;
      }

      if (typ === "END") {
        zapis(
          `DRAG END | ${detail.from ?? "-"} -> ${detail.to ?? "-"} | changed=${detail.changed ? "yes" : "no"} | prev=${detail.previous || "-"} | next=${detail.next || "-"}`
        );
        return;
      }

      if (typ === "SAVE") {
        zapis(
          `DRAG SAVE | ok=${detail.ok ? "yes" : "no"} | prev=${detail.previous || "-"} | next=${detail.next || "-"}`
        );
        return;
      }

      if (typ === "CANCEL") {
        zapis(
          `DRAG CANCEL | ${detail.from ?? "-"} -> ${detail.to ?? "-"}`
        );
        return;
      }

      zapis(`DRAG ${typ}`);
    };

    window.addEventListener(
      "luba:card-drag-debug",
      handler
    );

    zapis(
      "START REAL CARD DRAG | hadí sloty + delayed lock + focus + auto-scroll; tuning panel otevřen"
    );
    const nast = window.LubaNoteCardDrag?.ziskejNastaveni?.();
    if (nast) zapis(`DRAG DEFAULTS | ${Object.entries(nast).map(([k,v]) => `${k}=${v}`).join(" | ")}`);
    window.LubaNoteCardDrag?.otevriLadeni?.();

    return () => {
      window.removeEventListener(
        "luba:card-drag-debug",
        handler
      );
      window.LubaNoteCardDrag?.zavriLadeni?.();
    };
  }

  function nactiCardDragLab() {
    if (window.LubaNoteCardDragLab?.spust) {
      return Promise.resolve();
    }

    const existujici = document.querySelector('script[data-ln-card-drag-lab]');
    if (existujici) {
      return new Promise((resolve, reject) => {
        if (window.LubaNoteCardDragLab?.spust) {
          resolve();
          return;
        }
        existujici.addEventListener("load", () => resolve(), { once: true });
        existujici.addEventListener(
          "error",
          () => reject(new Error("cardDragLab.js se nepodarilo nacist")),
          { once: true }
        );
      });
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "cardDragLab.js?v=20260910-real-card-drag-tuning-346";
      script.async = true;
      script.dataset.lnCardDragLab = "1";
      script.addEventListener("load", () => resolve(), { once: true });
      script.addEventListener(
        "error",
        () => reject(new Error("cardDragLab.js se nepodarilo nacist")),
        { once: true }
      );
      document.head.appendChild(script);
    });
  }

  function spustCardDragLab() {
    let zruseno = false;
    let stopLabu = null;

    zapis("DRAG LAB LOAD | pripravuji izolovanou laborator...");

    nactiCardDragLab()
      .then(() => {
        if (zruseno) return;
        if (!window.LubaNoteCardDragLab?.spust) {
          throw new Error("Drag Lab API neni dostupne");
        }
        stopLabu = window.LubaNoteCardDragLab.spust(zapis);
        zapis("DRAG LAB READY | DELAYED LOCK: karty pri prejizdeni stoji; cil se zamkne az po kratkem klidu nad presnym slotem; produkcni drag je docasne vypnuty");
        if (hub && !hub.classList.contains("ln-dh-minimized")) {
          nastavHubMinimalizovany(true);
        }
      })
      .catch(chyba => {
        zapis(`DRAG LAB ERROR | ${chyba?.message || chyba}`);
        console.error("Debug Hub: Drag Lab nelze spustit.", chyba);
      });

    return () => {
      zruseno = true;
      if (typeof stopLabu === "function") {
        stopLabu();
      } else {
        window.LubaNoteCardDragLab?.stop?.();
      }
    };
  }

  function nactiPerformanceBenchmark() {
    if (window.LubaNotePerformanceBenchmark?.spust) {
      return Promise.resolve();
    }

    const existujici = document.querySelector('script[data-ln-performance-benchmark]');

    if (existujici) {
      return new Promise((resolve, reject) => {
        if (window.LubaNotePerformanceBenchmark?.spust) {
          resolve();
          return;
        }

        existujici.addEventListener("load", () => resolve(), { once: true });
        existujici.addEventListener(
          "error",
          () => reject(new Error("performanceBenchmark.js se nepodařilo načíst")),
          { once: true }
        );
      });
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "performanceBenchmark.js?v=20260909-perf-baseline-317";
      script.async = true;
      script.dataset.lnPerformanceBenchmark = "1";
      script.addEventListener("load", () => resolve(), { once: true });
      script.addEventListener(
        "error",
        () => reject(new Error("performanceBenchmark.js se nepodařilo načíst")),
        { once: true }
      );
      document.head.appendChild(script);
    });
  }

  function spustPerformanceBenchmark() {
    let zruseno = false;
    let stopBenchmarku = null;

    zapis("PERF LOAD | připravuji benchmark...");

    nactiPerformanceBenchmark()
      .then(() => {
        if (zruseno) return;

        if (!window.LubaNotePerformanceBenchmark?.spust) {
          throw new Error("Performance benchmark po načtení není dostupný");
        }

        stopBenchmarku = window.LubaNotePerformanceBenchmark.spust(zapis);
      })
      .catch(chyba => {
        if (zruseno) return;
        console.error("Debug Hub: Performance benchmark nelze spustit.", chyba);
        zapis(`PERF ERROR | ${chyba?.message || chyba}`);
      });

    return () => {
      zruseno = true;

      if (typeof stopBenchmarku === "function") {
        stopBenchmarku();
      }
    };
  }

  function spustStartupDiagnostiku() {
    const diagnostika = window.LubaNoteStartupDiag;

    if (!diagnostika) {
      zapis("STARTUP diagnostika není dostupná.");
      return () => {};
    }

    diagnostika.radky().forEach((radek) => {
      zapis(radek);
    });

    return diagnostika.priRadku((radek) => {
      zapis(radek);
    });
  }


  function aktualizujVyberModulu() {
    if (!selectModulu) return;

    const hodnota = selectModulu.value || "startup";
    const popis = MODULY[hodnota] || hodnota;

    if (moduleLabel) {
      moduleLabel.textContent = popis;
    }

    if (moduleMenu) {
      moduleMenu.querySelectorAll("[data-dh-module]").forEach((tlacitko) => {
        const vybrane = tlacitko.dataset.dhModule === hodnota;
        tlacitko.classList.toggle("active", vybrane);
        tlacitko.setAttribute("aria-checked", String(vybrane));
      });
    }
  }

  function nastavMenuModuluOtevrene(otevrene) {
    if (!moduleMenu || !hub) return;

    moduleMenu.hidden = !otevrene;
    const prep = hub.querySelector('[data-dh="module-toggle"]');

    if (prep) {
      prep.setAttribute("aria-expanded", String(otevrene));
      prep.classList.toggle("active", otevrene);
    }
  }

  function aktualizujStavHubu() {
    if (statusEl) {
      statusEl.textContent = aktivniModul
        ? `běží: ${MODULY[aktivniModul] || aktivniModul}`
        : "diagnostika vypnutá";
    }

    if (startTlacitko) {
      startTlacitko.classList.toggle("active", Boolean(aktivniModul));
      startTlacitko.textContent = aktivniModul ? "Restart" : "Spustit";
    }

    aktualizujVyberModulu();
  }

  function bodPointeru(event) {
    return {
      x: Number(event.clientX) || 0,
      y: Number(event.clientY) || 0,
      id: event.pointerId
    };
  }

  function ukotviHubNaAktualniPozici() {
    if (!hub) return null;

    const rect = hub.getBoundingClientRect();

    hub.style.left = `${Math.round(rect.left)}px`;
    hub.style.top = `${Math.round(rect.top)}px`;
    hub.style.right = "auto";
    hub.style.bottom = "auto";
    hub.style.width = `${Math.round(rect.width)}px`;
    hub.style.height = `${Math.round(rect.height)}px`;
    hub.style.maxHeight = "none";
    hub.classList.add("ln-dh-custom-geometry");

    return rect;
  }

  function nastavHubMinimalizovany(sbalit) {
    if (!hub) return;

    const tlacitko = hub.querySelector('[data-dh="min"]');

    if (sbalit) {
      if (!hub.classList.contains("ln-dh-minimized")) {
        const rect = hub.getBoundingClientRect();
        geometrieHubuPredMinimalizaci = {
          width: rect.width,
          height: rect.height
        };
        hub.classList.add("ln-dh-minimized");
      }
    } else {
      const miniRect = hub.getBoundingClientRect();
      const geometrie = geometrieHubuPredMinimalizaci;

      hub.classList.remove("ln-dh-minimized");

      if (geometrie) {
        /*
         * Pokud se sbalený panel mezitím přesouval, ukotvení mohlo
         * zapsat inline výšku 54 px. Při rozbalení proto explicitně
         * vracíme poslední plnou velikost, ale zachováme aktuální
         * pozici sbalené hlavičky.
         */
        hub.style.left = `${Math.round(miniRect.left)}px`;
        hub.style.top = `${Math.round(miniRect.top)}px`;
        hub.style.right = "auto";
        hub.style.bottom = "auto";
        hub.style.width = `${Math.round(geometrie.width)}px`;
        hub.style.height = `${Math.round(geometrie.height)}px`;
        hub.style.maxHeight = "none";
        hub.classList.add("ln-dh-custom-geometry");
      }

      geometrieHubuPredMinimalizaci = null;

      requestAnimationFrame(() => {
        srovnejHubDoViewportu();
        prekresli();
      });
    }

    if (tlacitko) {
      tlacitko.textContent = sbalit ? "▢" : "—";
      tlacitko.setAttribute(
        "aria-label",
        sbalit ? "Rozbalit Debug Hub" : "Sbalit Debug Hub"
      );
      tlacitko.setAttribute(
        "title",
        sbalit ? "Rozbalit" : "Sbalit"
      );
    }
  }

  function omezPoziciHubu(left, top, sirka, vyska) {
    const viditelnaHrana = Math.min(72, Math.max(44, vyska));
    const minLeft = Math.min(0, 72 - sirka);
    const maxLeft = Math.max(0, window.innerWidth - 72);
    const minTop = 0;
    const maxTop = Math.max(0, window.innerHeight - viditelnaHrana);

    return {
      left: Math.max(minLeft, Math.min(maxLeft, left)),
      top: Math.max(minTop, Math.min(maxTop, top))
    };
  }

  function zacniPresunHubu(event) {
    if (!hub || event.button > 0) return;
    if (event.target.closest("button, select, input, textarea, a")) return;

    const rect = ukotviHubNaAktualniPozici();
    if (!rect) return;

    const bod = bodPointeru(event);
    presunHubu = {
      id: bod.id,
      x: bod.x,
      y: bod.y,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    };

    hub.classList.add("ln-dh-dragging");

    try {
      event.currentTarget?.setPointerCapture?.(event.pointerId);
    } catch (_chyba) {}

    event.preventDefault();
  }

  function presunHub(event) {
    if (!hub || !presunHubu) return;
    if (
      presunHubu.id != null &&
      event.pointerId != null &&
      presunHubu.id !== event.pointerId
    ) {
      return;
    }

    const bod = bodPointeru(event);
    const novaPozice = omezPoziciHubu(
      presunHubu.left + bod.x - presunHubu.x,
      presunHubu.top + bod.y - presunHubu.y,
      presunHubu.width,
      presunHubu.height
    );

    hub.style.left = `${Math.round(novaPozice.left)}px`;
    hub.style.top = `${Math.round(novaPozice.top)}px`;
    event.preventDefault();
  }

  function ukonciPresunHubu(event) {
    if (!presunHubu) return;
    if (
      event?.pointerId != null &&
      presunHubu.id != null &&
      presunHubu.id !== event.pointerId
    ) {
      return;
    }

    presunHubu = null;
    hub?.classList.remove("ln-dh-dragging");
  }

  function zacniZmenuVelikostiHubu(event) {
    if (!hub || event.button > 0) return;

    const rect = ukotviHubNaAktualniPozici();
    if (!rect) return;

    const bod = bodPointeru(event);
    zmenaVelikostiHubu = {
      id: bod.id,
      x: bod.x,
      y: bod.y,
      width: rect.width,
      height: rect.height
    };

    hub.classList.add("ln-dh-resizing");

    try {
      event.currentTarget?.setPointerCapture?.(event.pointerId);
    } catch (_chyba) {}

    event.preventDefault();
    event.stopPropagation();
  }

  function zmenVelikostHubu(event) {
    if (!hub || !zmenaVelikostiHubu) return;
    if (
      zmenaVelikostiHubu.id != null &&
      event.pointerId != null &&
      zmenaVelikostiHubu.id !== event.pointerId
    ) {
      return;
    }

    const bod = bodPointeru(event);
    const rect = hub.getBoundingClientRect();
    const minSirka = Math.min(300, Math.max(260, window.innerWidth - 24));
    const maxSirka = Math.max(minSirka, window.innerWidth - Math.max(8, rect.left));
    const minVyska = 190;
    const maxVyska = Math.max(minVyska, window.innerHeight - Math.max(8, rect.top));

    const sirka = Math.max(
      minSirka,
      Math.min(
        maxSirka,
        zmenaVelikostiHubu.width + bod.x - zmenaVelikostiHubu.x
      )
    );
    const vyska = Math.max(
      minVyska,
      Math.min(
        maxVyska,
        zmenaVelikostiHubu.height + bod.y - zmenaVelikostiHubu.y
      )
    );

    hub.style.width = `${Math.round(sirka)}px`;
    hub.style.height = `${Math.round(vyska)}px`;
    event.preventDefault();
  }

  function ukonciZmenuVelikostiHubu(event) {
    if (!zmenaVelikostiHubu) return;
    if (
      event?.pointerId != null &&
      zmenaVelikostiHubu.id != null &&
      zmenaVelikostiHubu.id !== event.pointerId
    ) {
      return;
    }

    zmenaVelikostiHubu = null;
    hub?.classList.remove("ln-dh-resizing");
  }

  function srovnejHubDoViewportu() {
    if (!hub || hub.hidden || !hub.classList.contains("ln-dh-custom-geometry")) {
      return;
    }

    const rect = hub.getBoundingClientRect();
    const maxSirka = Math.max(260, window.innerWidth - 16);
    const maxVyska = Math.max(190, window.innerHeight - 16);

    if (rect.width > maxSirka) {
      hub.style.width = `${Math.round(maxSirka)}px`;
    }

    if (rect.height > maxVyska) {
      hub.style.height = `${Math.round(maxVyska)}px`;
    }

    const novyRect = hub.getBoundingClientRect();
    const pozice = omezPoziciHubu(
      novyRect.left,
      novyRect.top,
      novyRect.width,
      novyRect.height
    );

    hub.style.left = `${Math.round(pozice.left)}px`;
    hub.style.top = `${Math.round(pozice.top)}px`;
  }

  function spustStartupAutomatickyPokudJeTreba() {
    if (!window.LUBANOTE_TAG_VD_AUTO || aktivniModul) {
      return;
    }

    aktivniModul = "startup";
    startCas = performance.now();
    zaznamy = [];
    stopAktivnihoModulu = spustStartupDiagnostiku();

    window.LubaNoteStartupDiag?.zapis?.(
      "TAG-VD",
      "DEBUG HUB AUTO START | startup"
    );

    aktualizujStavHubu();
    prekresli();
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
    aktualizujStavHubu();
    prekresli();
  }

  function spustModul() {
    stopModulu({ zapisStop: false });

    aktivniModul = selectModulu.value;
    startCas = performance.now();
    zaznamy = [];

    if (aktivniModul === "startup") {
      stopAktivnihoModulu = spustStartupDiagnostiku();
    } else if (aktivniModul === "todoSelection") {
      stopAktivnihoModulu = spustTodoSelection();
    } else if (aktivniModul === "editorSelection") {
      stopAktivnihoModulu = spustEditorSelection();
    } else if (aktivniModul === "gestures") {
      stopAktivnihoModulu = spustGesta();
    } else if (aktivniModul === "bulletDrag") {
      stopAktivnihoModulu = spustBulletDrag();
    } else if (aktivniModul === "cardDrag") {
      stopAktivnihoModulu = spustCardDrag();
    } else if (aktivniModul === "cardDragLab") {
      stopAktivnihoModulu = spustCardDragLab();
    } else if (aktivniModul === "performance") {
      stopAktivnihoModulu = spustPerformanceBenchmark();
    }

    aktualizujStavHubu();
    prekresli();
  }

  function zkopirujTextFallback(text) {
  const textarea =
    document.createElement("textarea");
  
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  textarea.style.opacity = "0";
  
  document.body.appendChild(textarea);
  
  textarea.focus();
  textarea.select();
  
  textarea.setSelectionRange(
    0,
    textarea.value.length
  );
  
  let zkopirovano = false;
  
  try {
    zkopirovano =
      document.execCommand("copy");
  } catch {
    zkopirovano = false;
  }
  
  textarea.remove();
  
  return zkopirovano;
}


async function zkopirujTextRobustne(text) {
  /*
   * APK: použijeme přímo Capacitor Clipboard.
   * Je spolehlivější než Web Clipboard API ve WebView.
   */
  const schrankaCapacitor =
    window.Capacitor?.Plugins?.Clipboard;

  if (schrankaCapacitor?.write) {
    try {
      await schrankaCapacitor.write({
        string: text
      });

      return true;
    } catch (_chyba) {
      // Pokračujeme dalšími dostupnými cestami.
    }
  }

  /*
   * WEB / GitHub Pages: na zabezpečeném originu
   * zkusíme standardní Clipboard API.
   */
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(
        text
      );

      return true;
    }
  } catch (_chyba) {
    // Pokračujeme fallbackem.
  }

  /*
   * Poslední fallback pro Preview / starší WebView.
   */
  return zkopirujTextFallback(text);
}


async function zkopirujReport(tlacitko) {
  const report =
    hlavickaReportu() +
    zaznamy.join("\n");

  const puvodni =
    tlacitko.textContent;

  let zkopirovano = false;

  try {
    zkopirovano =
      await zkopirujTextRobustne(report);
  } catch (chyba) {
    console.warn(
      "Debug Hub: kopírování reportu selhalo.",
      chyba
    );
  }

  tlacitko.textContent =
    zkopirovano
      ? "Zkopírováno ✓"
      : "Kopírování selhalo";

  setTimeout(() => {
    tlacitko.textContent =
      puvodni;
  }, 1200);
}


function vytvorTagVdReport() {
  const vsechnyRadky =
    window.LubaNoteStartupDiag?.radky?.() || [];

  const relevantni = vsechnyRadky.filter((radek) => {
    const text = String(radek || "");
    return (
      text.includes("| TAG-VD") ||
      text.includes("| EVENT    | ONLINE") ||
      text.includes("| EVENT    | OFFLINE")
    );
  });

  let reconnectStav = null;
  let barvyStav = "nedostupné";

  try {
    reconnectStav =
      window.LubaNoteTagReconnectVD?.stav?.() || null;
  } catch (_chyba) {
    reconnectStav = null;
  }

  try {
    barvyStav =
      window.LubaNoteTagColorVD?.shrnuti?.() ||
      "nedostupné";
  } catch (_chyba) {
    barvyStav = "chyba diagnostiky";
  }

  return [
    "LUBANOTE TAG-VD COMPACT REPORT",
    `verze: ${window.LUBANOTE_VERSION || "DEV"}`,
    `čas: ${new Date().toISOString()}`,
    `online: ${navigator.onLine}`,
    `reconnect: ${reconnectStav ? JSON.stringify(reconnectStav) : "nedostupné"}`,
    `barvy-teď: ${barvyStav}`,
    "",
    ...relevantni
  ].join("\n");
}

async function zkopirujTagVdReport(tlacitko) {
  const puvodni = tlacitko.textContent;
  let zkopirovano = false;

  try {
    zkopirovano = await zkopirujTextRobustne(
      vytvorTagVdReport()
    );
  } catch (chyba) {
    console.warn(
      "Debug Hub: kopírování TAG-VD reportu selhalo.",
      chyba
    );
  }

  tlacitko.textContent =
    zkopirovano ? "TAG-VD zkopírováno ✓" : "Kopírování selhalo";

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
      <div class="ln-dh-head" data-dh-drag>
        <div class="ln-dh-drag-handle" aria-hidden="true">⠿</div>
        <div class="ln-dh-title">
          <strong>LubaNote Debug Hub</strong>
          <span class="ln-dh-status">diagnostika vypnutá</span>
        </div>
        <button type="button" class="ln-dh-icon-btn" data-dh="min" title="Sbalit" aria-label="Sbalit Debug Hub">—</button>
        <button type="button" class="ln-dh-icon-btn" data-dh="close" title="Skrýt" aria-label="Skrýt Debug Hub">×</button>
      </div>

      <div class="ln-dh-controls">
        <div class="ln-dh-module-picker">
          <button
            type="button"
            class="ln-dh-module-toggle"
            data-dh="module-toggle"
            aria-haspopup="listbox"
            aria-expanded="false"
          >
            <span class="ln-dh-module-dot" aria-hidden="true"></span>
            <span class="ln-dh-module-label">Start / sync / síť</span>
            <span class="ln-dh-module-arrow" aria-hidden="true">⌄</span>
          </button>

          <div class="ln-dh-module-menu" role="listbox" aria-label="Diagnostický modul" hidden>
            ${Object.entries(MODULY).map(([hodnota, popis]) => `
              <button
                type="button"
                class="ln-dh-module-option"
                data-dh-module="${hodnota}"
                role="option"
                aria-checked="${hodnota === "startup" ? "true" : "false"}"
              >
                <span class="ln-dh-module-option-dot" aria-hidden="true"></span>
                <span>${popis}</span>
              </button>
            `).join("")}
          </div>

          <select data-dh="module" aria-label="Diagnostický modul" hidden>
            ${Object.entries(MODULY).map(([hodnota, popis]) => `
              <option value="${hodnota}">${popis}</option>
            `).join("")}
          </select>
        </div>

        <div class="ln-dh-run-actions">
          <button type="button" class="ln-dh-start" data-dh="start">Spustit</button>
          <button type="button" data-dh="stop">Stop</button>
        </div>
      </div>

      <div class="ln-dh-summary">modul: vypnutý</div>
      <pre class="ln-dh-log">Diagnostika zatím neběží.</pre>

      <div class="ln-dh-footer">
        <button type="button" data-dh="clear">Vymazat</button>
        <button type="button" class="ln-dh-copy" data-dh="copy-tag">Kopírovat TAG-VD</button>
        <button type="button" class="ln-dh-copy" data-dh="copy">Kopírovat celý report</button>
      </div>

      <div
        class="ln-dh-resize-handle"
        data-dh-resize
        title="Táhni pro změnu velikosti"
        aria-label="Změnit velikost Debug Hubu"
      >⌟</div>
    `;

    document.body.appendChild(hub);

    logEl = hub.querySelector(".ln-dh-log");
    summaryEl = hub.querySelector(".ln-dh-summary");
    statusEl = hub.querySelector(".ln-dh-status");
    selectModulu = hub.querySelector('[data-dh="module"]');
    startTlacitko = hub.querySelector('[data-dh="start"]');
    moduleLabel = hub.querySelector(".ln-dh-module-label");
    moduleMenu = hub.querySelector(".ln-dh-module-menu");

    if (aktivniModul && MODULY[aktivniModul]) {
      selectModulu.value = aktivniModul;
    } else {
      selectModulu.value = "startup";
    }

    aktualizujStavHubu();

    hub.addEventListener("click", event => {
      const volbaModulu = event.target.closest("[data-dh-module]");

      if (volbaModulu) {
        selectModulu.value = volbaModulu.dataset.dhModule;
        aktualizujVyberModulu();
        nastavMenuModuluOtevrene(false);
        return;
      }

      const tlacitko = event.target.closest("button[data-dh]");
      if (!tlacitko) return;

      const akce = tlacitko.dataset.dh;

      if (akce === "module-toggle") {
        nastavMenuModuluOtevrene(Boolean(moduleMenu?.hidden));
        return;
      }

      nastavMenuModuluOtevrene(false);

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

      if (akce === "copy-tag") {
        zkopirujTagVdReport(tlacitko);
        return;
      }

      if (akce === "copy") {
        zkopirujReport(tlacitko);
        return;
      }

      if (akce === "min") {
        nastavHubMinimalizovany(
          !hub.classList.contains("ln-dh-minimized")
        );
        return;
      }

      if (akce === "close") {
        /*
         * Skrýt není Stop. Diagnostika může dál běžet na pozadí a po
         * opětovném otevření jsou záznamy stále k dispozici.
         */
        nastavMenuModuluOtevrene(false);
        hub.hidden = true;
      }
    });

    hub.querySelector("[data-dh-drag]")?.addEventListener(
      "pointerdown",
      zacniPresunHubu,
      { passive: false }
    );

    hub.querySelector("[data-dh-resize]")?.addEventListener(
      "pointerdown",
      zacniZmenuVelikostiHubu,
      { passive: false }
    );

    window.addEventListener("pointermove", presunHub, {
      passive: false,
      capture: true
    });
    window.addEventListener("pointerup", ukonciPresunHubu, {
      passive: true,
      capture: true
    });
    window.addEventListener("pointercancel", ukonciPresunHubu, {
      passive: true,
      capture: true
    });

    window.addEventListener("pointermove", zmenVelikostHubu, {
      passive: false,
      capture: true
    });
    window.addEventListener("pointerup", ukonciZmenuVelikostiHubu, {
      passive: true,
      capture: true
    });
    window.addEventListener("pointercancel", ukonciZmenuVelikostiHubu, {
      passive: true,
      capture: true
    });

    window.addEventListener("resize", srovnejHubDoViewportu);

    document.addEventListener("pointerdown", event => {
      if (!hub || hub.hidden || moduleMenu?.hidden) return;
      if (event.target.closest(".ln-dh-module-picker")) return;
      nastavMenuModuluOtevrene(false);
    }, true);

    return hub;
  }

  function otevriHub() {
    const panel = vytvorHub();
    panel.hidden = false;

    if (panel.classList.contains("ln-dh-minimized")) {
      nastavHubMinimalizovany(false);
    } else {
      const minTlacitko = panel.querySelector('[data-dh="min"]');
      if (minTlacitko) {
        minTlacitko.textContent = "—";
        minTlacitko.setAttribute("aria-label", "Sbalit Debug Hub");
        minTlacitko.setAttribute("title", "Sbalit");
      }
    }

    aktualizujStavHubu();
    srovnejHubDoViewportu();
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
    startStartup: () => {
      otevriHub();
      selectModulu.value = "startup";
      spustModul();
    },
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
    },
    startDragLab: () => {
      otevriHub();
      selectModulu.value = "cardDragLab";
      spustModul();
    },
    startPerformance: () => {
      otevriHub();
      selectModulu.value = "performance";
      spustModul();
    }
  };
  

  spustStartupAutomatickyPokudJeTreba();
})();
