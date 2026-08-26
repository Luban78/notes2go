(() => {
  "use strict";

  const editor = document.getElementById("modalRichText");
  if (!editor) return;

  const MAX_ZAZNAMU = 36;
  const zaznamy = [];
  let posledniTouchEnd = 0;
  let posledniTouchRadek = "";

  const panel = document.createElement("div");
  panel.id = "lnSelectionDebug";
  panel.innerHTML = `
    <div class="lnSelDebugHead">
      <strong>🐞 Selection debug</strong>
      <span id="lnSelDebugStatus">čekám…</span>
    </div>
    <div id="lnSelDebugSummary" class="lnSelDebugSummary"></div>
    <pre id="lnSelDebugLog" class="lnSelDebugLog"></pre>
    <div class="lnSelDebugActions">
      <button type="button" id="lnSelDebugClear">Vymazat</button>
      <button type="button" id="lnSelDebugCopy">Kopírovat report</button>
      <button type="button" id="lnSelDebugMin">Sbalit</button>
    </div>
  `;

  const style = document.createElement("style");
  style.textContent = `
    #lnSelectionDebug {
      position: fixed;
      left: 8px;
      right: 8px;
      bottom: 8px;
      z-index: 2147483647;
      max-height: 42vh;
      padding: 8px;
      border: 2px solid #ffb300;
      border-radius: 10px;
      background: rgba(15, 15, 18, .96);
      color: #fff;
      font: 12px/1.35 monospace;
      box-shadow: 0 8px 28px rgba(0,0,0,.45);
    }
    #lnSelectionDebug button {
      min-height: 32px;
      padding: 4px 8px;
      border: 1px solid #777;
      border-radius: 7px;
      background: #2b2b31;
      color: #fff;
      font: inherit;
    }
    .lnSelDebugHead,
    .lnSelDebugActions {
      display: flex;
      gap: 8px;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
    }
    .lnSelDebugSummary {
      margin: 6px 0;
      padding: 6px;
      border-radius: 6px;
      background: #22252b;
      white-space: pre-wrap;
    }
    .lnSelDebugLog {
      max-height: 20vh;
      overflow: auto;
      margin: 6px 0;
      padding: 6px;
      background: #090a0c;
      white-space: pre-wrap;
      word-break: break-word;
    }
    #lnSelectionDebug.lnSelDebugMin .lnSelDebugSummary,
    #lnSelectionDebug.lnSelDebugMin .lnSelDebugLog {
      display: none;
    }
  `;
  document.head.appendChild(style);
  document.body.appendChild(panel);

  const status = panel.querySelector("#lnSelDebugStatus");
  const summary = panel.querySelector("#lnSelDebugSummary");
  const log = panel.querySelector("#lnSelDebugLog");
  const btnClear = panel.querySelector("#lnSelDebugClear");
  const btnCopy = panel.querySelector("#lnSelDebugCopy");
  const btnMin = panel.querySelector("#lnSelDebugMin");

  function zkratText(text, max = 34) {
    const cisty = String(text || "").replace(/\s+/g, " ").trim();
    return cisty.length > max ? `${cisty.slice(0, max)}…` : cisty;
  }

  function popisUzlu(uzel) {
    if (!uzel) return "null";
    if (uzel.nodeType === Node.TEXT_NODE) {
      return `#text(\"${zkratText(uzel.textContent, 24)}\")`;
    }
    const id = uzel.id ? `#${uzel.id}` : "";
    const tridy = uzel.classList?.length
      ? `.${[...uzel.classList].slice(0, 3).join(".")}`
      : "";
    return `${uzel.tagName || uzel.nodeName}${id}${tridy}`;
  }

  function infoRadku(target) {
    const prvek = target?.nodeType === Node.ELEMENT_NODE
      ? target
      : target?.parentElement;
    const li = prvek?.closest?.("#modalRichText li") || null;
    if (!li) return { li: null, index: -1, text: "" };

    const vsechny = [...editor.querySelectorAll("li")];
    return {
      li,
      index: vsechny.indexOf(li),
      text: zkratText(li.childNodes?.[0]?.textContent || li.textContent)
    };
  }

  function infoVyberu() {
    const aktivni = document.activeElement;

    if (aktivni?.matches?.(".todoTextInput.todoEditing")) {
      const start = aktivni.selectionStart ?? 0;
      const end = aktivni.selectionEnd ?? start;
      return {
        typ: "TODO textarea",
        collapsed: start === end,
        text: aktivni.value.slice(start, end),
        start,
        end,
        startNode: popisUzlu(aktivni),
        endNode: popisUzlu(aktivni)
      };
    }

    const vyber = window.getSelection();
    if (!vyber || vyber.rangeCount === 0) {
      return {
        typ: "DOM",
        collapsed: true,
        text: "",
        start: null,
        end: null,
        startNode: "bez range",
        endNode: "bez range"
      };
    }

    const rozsah = vyber.getRangeAt(0);
    return {
      typ: "DOM",
      collapsed: rozsah.collapsed,
      text: vyber.toString(),
      start: rozsah.startOffset,
      end: rozsah.endOffset,
      startNode: popisUzlu(rozsah.startContainer),
      endNode: popisUzlu(rozsah.endContainer)
    };
  }

  function prekresli(posledni = null) {
    const v = infoVyberu();
    const r = posledni?.radek || { index: -1, text: "" };

    summary.textContent = [
      `poslední: ${posledni?.typ || "—"}`,
      `řádek: ${r.index >= 0 ? r.index + 1 : "mimo LI"}  \"${r.text || ""}\"`,
      `selection: ${v.collapsed ? "KURZOR" : "VÝBĚR"}  \"${zkratText(v.text, 42)}\"`,
      `range: ${v.startNode}:${v.start} → ${v.endNode}:${v.end}`,
      `active: ${popisUzlu(document.activeElement)}`
    ].join("\n");

    log.textContent = zaznamy.join("\n");
    log.scrollTop = log.scrollHeight;
  }

  function zapis(typ, event = null, doplnek = "") {
    const cas = performance.now().toFixed(0).padStart(6, " ");
    const target = event?.target || null;
    const radek = infoRadku(target);
    const vyber = infoVyberu();
    const sour = event && "clientX" in event
      ? ` @${Math.round(event.clientX)},${Math.round(event.clientY)}`
      : "";

    const text = zkratText(vyber.text, 20);
    const z = `${cas} ${typ}${sour} | row=${radek.index + 1 || 0} | ${popisUzlu(target)} | ${vyber.collapsed ? "CUR" : `SEL:\"${text}\"`} ${doplnek}`.trim();

    zaznamy.push(z);
    while (zaznamy.length > MAX_ZAZNAMU) zaznamy.shift();

    status.textContent = `${typ} / řádek ${radek.index >= 0 ? radek.index + 1 : "—"}`;
    prekresli({ typ, radek });
  }

  function zapisTouch(typ, event) {
    const t = event.changedTouches?.[0] || event.touches?.[0] || null;
    const radek = infoRadku(event.target);
    let doplnek = "";

    if (typ === "touchend") {
      const ted = performance.now();
      const klic = `${radek.index}:${radek.text}`;
      const dt = posledniTouchEnd ? Math.round(ted - posledniTouchEnd) : 0;
      const stejny = klic === posledniTouchRadek;
      doplnek = `dt=${dt}ms sameRow=${stejny}`;
      posledniTouchEnd = ted;
      posledniTouchRadek = klic;
    }

    const fake = t
      ? { target: event.target, clientX: t.clientX, clientY: t.clientY }
      : event;
    zapis(typ, fake, doplnek);
  }

  ["pointerdown", "pointerup", "click", "dblclick", "contextmenu"].forEach(typ => {
    editor.addEventListener(typ, event => zapis(typ, event), true);
  });

  editor.addEventListener("touchstart", event => zapisTouch("touchstart", event), {
    capture: true,
    passive: true
  });
  editor.addEventListener("touchend", event => zapisTouch("touchend", event), {
    capture: true,
    passive: true
  });

  document.addEventListener("selectionchange", () => {
    zapis("selectionchange");
    setTimeout(() => zapis("selection+60ms"), 60);
  });

  btnClear.addEventListener("click", () => {
    zaznamy.length = 0;
    posledniTouchEnd = 0;
    posledniTouchRadek = "";
    status.textContent = "vymazáno";
    prekresli();
  });

  btnMin.addEventListener("click", () => {
    panel.classList.toggle("lnSelDebugMin");
    btnMin.textContent = panel.classList.contains("lnSelDebugMin")
      ? "Rozbalit"
      : "Sbalit";
  });

  btnCopy.addEventListener("click", async () => {
    const v = infoVyberu();
    const report = [
      "LUBANOTE SELECTION DEBUG",
      `UA: ${navigator.userAgent}`,
      `viewport: ${window.innerWidth}x${window.innerHeight}`,
      `selection: ${JSON.stringify(v)}`,
      "",
      ...zaznamy
    ].join("\n");

    try {
      await navigator.clipboard.writeText(report);
      status.textContent = "report zkopírován ✅";
    } catch (_) {
      const pole = document.createElement("textarea");
      pole.value = report;
      pole.style.position = "fixed";
      pole.style.opacity = "0";
      document.body.appendChild(pole);
      pole.select();
      document.execCommand("copy");
      pole.remove();
      status.textContent = "report zkopírován ✅";
    }
  });

  zapis("DEBUG START");
})();
