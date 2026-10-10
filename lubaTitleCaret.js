/* 683R – OWN TITLE CARET / APK + LubaKeyboard ONLY.
   Nadpis je v tomto rezimu read-only pro WebView, ale text dale zapisuje
   stavajici model LubaKeyboard. Jedinou pravdou pro vyber jsou start/end.
   Nedotyka se Core V2, PC ani rezimu systemove klavesnice. */
(() => {
  "use strict";
  const title = document.getElementById("modalTitle");
  if (!title) return;
  const modal = title.closest(".taskModal");
  let aktivni = false;
  let zacatek = 0;
  let konec = 0;
  let zobrazeni = null;
  let raf = 0;
  let tap = null;
  let posledniTap = null;
  let stiskTimer = 0;
  let tah = null;
  const maxPosun = (n) => Math.max(0, Math.min(String(title.textContent || "").length, Number(n) || 0));
  const viditelny = () => aktivni && title.isConnected && !modal?.hidden &&
    !modal?.classList.contains("titleCollapsed") && document.activeElement === title;
  const svg = '<svg viewBox="0 0 26 34" width="22" height="29" aria-hidden="true"><path d="M13 0 C11 5 2 14 1 21 C-1 29 5 34 13 34 C21 34 27 29 25 21 C24 14 15 5 13 0 Z" fill="#ff2020"/></svg>';

  function element(trida) {
    const prvek = document.createElement("div");
    prvek.className = `ln-title-own-${trida}`;
    prvek.hidden = true;
    prvek.setAttribute("aria-hidden", "true");
    document.body.appendChild(prvek);
    return prvek;
  }

  function zajistiZobrazeni() {
    if (zobrazeni) return zobrazeni;
    const caret = element("caret");
    const jeden = element("handle");
    const prvni = element("handle");
    const druhy = element("handle");
    for (const [prvek, strana] of [[jeden, "caret"], [prvni, "start"], [druhy, "end"]]) {
      prvek.dataset.strana = strana;
      prvek.innerHTML = svg;
      prvek.addEventListener("pointerdown", (event) => {
        if (!aktivni) return;
        event.preventDefault();
        event.stopPropagation();
        tah = { id: event.pointerId, strana };
        try { prvek.setPointerCapture(event.pointerId); } catch (_) {}
      });
      prvek.addEventListener("pointermove", (event) => {
        if (!tah || tah.id !== event.pointerId) return;
        event.preventDefault();
        const bod = poziceZBodu(event.clientX, event.clientY - 17);
        if (tah.strana === "caret") nastavVyber(bod, bod, false);
        else if (tah.strana === "start") nastavVyber(Math.min(bod, konec), Math.max(bod, konec), false);
        else nastavVyber(Math.min(zacatek, bod), Math.max(zacatek, bod), false);
      });
      const konecTahu = (event) => {
        if (tah?.id !== event.pointerId) return;
        tah = null;
        naplanuj();
      };
      prvek.addEventListener("pointerup", konecTahu);
      prvek.addEventListener("pointercancel", konecTahu);
    }
    zobrazeni = { caret, jeden, prvni, druhy, podbarveni: element("selection") };
    return zobrazeni;
  }

  function textovyUzel() {
    const prvni = title.firstChild;
    if (prvni?.nodeType === Node.TEXT_NODE && title.childNodes.length === 1) return prvni;
    return null;
  }

  function rozsahNa(pozice) {
    const uzel = textovyUzel();
    if (!uzel) return null;
    const range = document.createRange();
    range.setStart(uzel, Math.min(uzel.nodeValue.length, maxPosun(pozice)));
    range.collapse(true);
    return range;
  }

  function rectNa(pozice) {
    const range = rozsahNa(pozice);
    const rect = range?.getBoundingClientRect();
    if (rect && rect.height > 0) return rect;
    const box = title.getBoundingClientRect();
    const font = parseFloat(getComputedStyle(title).fontSize) || 18;
    return { left: box.left + (parseFloat(getComputedStyle(title).paddingLeft) || 0), top: box.top + 4, bottom: box.top + font + 4, height: font };
  }

  function poziceZBodu(x, y) {
    const uzel = textovyUzel();
    if (!uzel) return 0;
    let range = null;
    try {
      const pozice = document.caretPositionFromPoint?.(x, y);
      if (pozice?.offsetNode === uzel) return maxPosun(pozice.offset);
      range = document.caretRangeFromPoint?.(x, y);
      if (range?.startContainer === uzel) return maxPosun(range.startOffset);
    } catch (_) {}
    // Fallback pro read-only title a okrajove kliky: blizsi hranice znaku.
    const len = uzel.nodeValue.length;
    let nejblizsi = 0;
    let vzdalenost = Infinity;
    for (let i = 0; i <= len; i++) {
      const r = rectNa(i);
      const rozdil = Math.abs(r.left - x) + Math.abs((r.top + r.bottom) / 2 - y) * 3;
      if (rozdil < vzdalenost) { vzdalenost = rozdil; nejblizsi = i; }
    }
    return nejblizsi;
  }

  function schovej() {
    if (!zobrazeni) return;
    for (const prvek of Object.values(zobrazeni)) prvek.hidden = true;
  }

  function vykresli() {
    raf = 0;
    if (!viditelny()) { schovej(); return; }
    const ui = zajistiZobrazeni();
    const max = String(title.textContent || "").length;
    zacatek = Math.max(0, Math.min(max, zacatek));
    konec = Math.max(zacatek, Math.min(max, konec));
    const vybrano = konec > zacatek;
    ui.caret.hidden = vybrano;
    ui.jeden.hidden = vybrano;
    ui.prvni.hidden = !vybrano;
    ui.druhy.hidden = !vybrano;
    ui.podbarveni.hidden = !vybrano;
    const a = rectNa(zacatek);
    const b = rectNa(konec);
    if (!vybrano) {
      Object.assign(ui.caret.style, { left: `${a.left}px`, top: `${a.top}px`, height: `${a.height}px` });
      Object.assign(ui.jeden.style, { left: `${a.left + 1}px`, top: `${a.bottom}px` });
    } else {
      Object.assign(ui.prvni.style, { left: `${a.left + 1}px`, top: `${a.bottom}px` });
      Object.assign(ui.druhy.style, { left: `${b.left + 1}px`, top: `${b.bottom}px` });
      const uzel = textovyUzel();
      if (uzel) {
        const range = document.createRange();
        range.setStart(uzel, zacatek);
        range.setEnd(uzel, konec);
        const rect = range.getBoundingClientRect();
        Object.assign(ui.podbarveni.style, {
          left: `${rect.left}px`, top: `${rect.top}px`,
          width: `${rect.width}px`, height: `${rect.height}px`
        });
      }
    }
  }

  function naplanuj() {
    if (raf) return;
    raf = requestAnimationFrame(vykresli);
  }

  function nastavVyber(start, end = start, fokus = true) {
    if (!aktivni) return false;
    zacatek = maxPosun(start);
    konec = maxPosun(end);
    if (konec < zacatek) [zacatek, konec] = [konec, zacatek];
    if (fokus && document.activeElement !== title) {
      try { title.focus({ preventScroll: true }); } catch (_) { title.focus(); }
    }
    naplanuj();
    return true;
  }

  function stav() {
    if (!aktivni) return null;
    const text = String(title.textContent || "");
    return { title, text, start: maxPosun(zacatek), end: maxPosun(konec) };
  }

  function vyberSlovo(pozice) {
    const text = String(title.textContent || "");
    let a = maxPosun(pozice);
    let b = a;
    const znak = (ch) => /[\p{L}\p{M}\p{N}_'-]/u.test(ch || "");
    if (!znak(text[a]) && a > 0 && znak(text[a - 1])) a--;
    if (!znak(text[a])) { nastavVyber(a); return; }
    b = a + 1;
    while (a > 0 && znak(text[a - 1])) a--;
    while (b < text.length && znak(text[b])) b++;
    nastavVyber(a, b);
  }

  function nastavRezim(zapnuto) {
    if (aktivni === Boolean(zapnuto)) return;
    aktivni = Boolean(zapnuto);
    tah = null;
    clearTimeout(stiskTimer);
    if (aktivni) {
      // DOM vyber pred vypnutim nativni editace prevedeme na indexy.
      const text = String(title.textContent || "");
      zacatek = konec = text.length;
      try {
        const sel = window.getSelection();
        if (sel?.rangeCount) {
          const r = sel.getRangeAt(0);
          if (title.contains(r.startContainer) && title.contains(r.endContainer)) {
            const left = document.createRange();
            left.selectNodeContents(title);
            left.setEnd(r.startContainer, r.startOffset);
            const right = document.createRange();
            right.selectNodeContents(title);
            right.setEnd(r.endContainer, r.endOffset);
            zacatek = left.toString().length;
            konec = right.toString().length;
          }
        }
      } catch (_) {}
      title.setAttribute("contenteditable", "false");
      title.setAttribute("tabindex", "0");
      title.dataset.lnTitleOwnCaret = "1";
    } else {
      title.removeAttribute("data-ln-title-own-caret");
      title.setAttribute("contenteditable", "plaintext-only");
      schovej();
      // Při návratu na systémovou IME zachováme předchozí pozici v názvu.
      if (document.activeElement === title) {
        const uzel = textovyUzel();
        if (uzel) {
          try {
            const range = document.createRange();
            range.setStart(uzel, Math.min(uzel.nodeValue.length, konec));
            range.collapse(true);
            const vyber = window.getSelection();
            vyber?.removeAllRanges();
            vyber?.addRange(range);
          } catch (_) {}
        }
      }
    }
    naplanuj();
  }

  function otevriSchranku(x, y) {
    if (!aktivni) return;
    const udalost = new MouseEvent("contextmenu", {
      bubbles: true, cancelable: true, clientX: x, clientY: y
    });
    title.dispatchEvent(udalost);
  }

  title.addEventListener("pointerdown", (event) => {
    if (!aktivni || event.button !== 0) return;
    tap = { id: event.pointerId, x: event.clientX, y: event.clientY, long: false, moved: false };
    clearTimeout(stiskTimer);
    stiskTimer = setTimeout(() => {
      if (!tap || tap.id !== event.pointerId || tap.moved) return;
      tap.long = true;
      vyberSlovo(poziceZBodu(tap.x, tap.y));
      otevriSchranku(tap.x, tap.y);
    }, 530);
    if (event.pointerType === "touch") event.preventDefault();
  });
  title.addEventListener("pointermove", (event) => {
    if (!tap || tap.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 11) {
      tap.moved = true;
      clearTimeout(stiskTimer);
    }
  });
  title.addEventListener("pointerup", (event) => {
    if (!tap || tap.id !== event.pointerId) return;
    const gesto = tap;
    tap = null;
    clearTimeout(stiskTimer);
    if (!aktivni || gesto.moved || gesto.long) return;
    const pos = poziceZBodu(event.clientX, event.clientY);
    const dvojtap = posledniTap && performance.now() - posledniTap.t < 360 &&
      Math.hypot(event.clientX - posledniTap.x, event.clientY - posledniTap.y) < 28;
    if (dvojtap) {
      vyberSlovo(pos);
      posledniTap = null;
    } else {
      nastavVyber(pos);
      posledniTap = { t: performance.now(), x: event.clientX, y: event.clientY };
    }
  });
  title.addEventListener("pointercancel", () => { tap = null; clearTimeout(stiskTimer); });
  title.addEventListener("focus", naplanuj);
  title.addEventListener("blur", () => requestAnimationFrame(() => { if (document.activeElement !== title) schovej(); }));
  title.addEventListener("input", naplanuj);
  document.addEventListener("scroll", naplanuj, true);
  window.addEventListener("resize", naplanuj);
  window.visualViewport?.addEventListener("resize", naplanuj);
  window.visualViewport?.addEventListener("scroll", naplanuj);
  new MutationObserver(naplanuj).observe(title, { characterData: true, childList: true, subtree: true });

  window.LubaNoteTitleCaret = Object.freeze({
    nastavRezim, jeAktivni: () => aktivni, ziskejVyber: stav, nastavVyber,
    aktualizuj: naplanuj
  });
})();
