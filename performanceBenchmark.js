/* ========================================
   LUBANOTE – PERFORMANCE BENCHMARK
   Izolovany diagnosticky benchmark pro Debug Hub.

   Pravidla:
   - nepouziva ani nemeni skutecne poznamky,
   - nic nezapisuje do localStorage / IndexedDB / Supabase,
   - synteticka data ziji jen v pameti a v docasnem DOM sandboxu,
   - po dokonceni se sandbox odstrani.
======================================== */

(() => {
  "use strict";

  const VERZE_BENCHMARKU = "PERF-1 / 0.9.317";
  const ID_SANDBOXU = "ln-performance-benchmark-sandbox";

  let posledniVysledek = null;

  function median(hodnoty) {
    const serazene = [...hodnoty].sort((a, b) => a - b);
    const stred = Math.floor(serazene.length / 2);

    if (serazene.length % 2 === 0) {
      return (serazene[stred - 1] + serazene[stred]) / 2;
    }

    return serazene[stred];
  }

  function formatMs(hodnota, desetinnaMista = 1) {
    return `${Number(hodnota || 0).toFixed(desetinnaMista)} ms`;
  }

  function stavProCas(hodnota, limitDobry, limitPozor) {
    if (hodnota <= limitDobry) return "✅";
    if (hodnota <= limitPozor) return "⚠️";
    return "🐢";
  }

  function dalsiFrame() {
    return new Promise(resolve => {
      requestAnimationFrame(() => {
        setTimeout(resolve, 0);
      });
    });
  }

  function vytvorSandbox() {
    document.getElementById(ID_SANDBOXU)?.remove();

    const sandbox = document.createElement("div");
    sandbox.id = ID_SANDBOXU;
    sandbox.setAttribute("aria-hidden", "true");

    Object.assign(sandbox.style, {
      position: "fixed",
      left: "-12000px",
      top: "0",
      width: `${Math.max(320, Math.min(430, window.innerWidth || 360))}px`,
      height: "720px",
      overflow: "auto",
      visibility: "hidden",
      pointerEvents: "none",
      contain: "layout paint style",
      zIndex: "-1"
    });

    document.body.appendChild(sandbox);
    return sandbox;
  }

  function vycistiSandbox(sandbox) {
    sandbox.replaceChildren();
  }

  function vynutLayout(prvek) {
    const rect = prvek.getBoundingClientRect();
    return rect.height + prvek.scrollHeight + prvek.scrollWidth;
  }

  function vytvorSyntetickeKarty(pocet) {
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < pocet; i += 1) {
      const karta = document.createElement("article");
      karta.className = "taskCard";
      karta.dataset.barvaKarty = i % 4 === 0 ? "modra" : "zelena";

      const nadpis = document.createElement("h3");
      nadpis.textContent = `Benchmark poznamka ${i + 1}`;

      const text = document.createElement("p");
      text.className = "taskNoteText";
      text.textContent =
        `Synteticky obsah karty ${i + 1}. ` +
        "Kontrolni text pro render a zalamovani obsahu LubaNote.";

      const datum = document.createElement("p");
      datum.textContent = `${(i % 28) + 1}. 9. 2026 05:${String(i % 60).padStart(2, "0")}`;

      karta.append(nadpis, text, datum);
      fragment.appendChild(karta);
    }

    return fragment;
  }

  function vytvorSyntetickePoznamky(pocet) {
    return Array.from({ length: pocet }, (_, index) => ({
      title: `Poznamka ${index + 1}${index % 13 === 0 ? " balik" : ""}`,
      note:
        `Text synteticke poznamky ${index + 1}. ` +
        `${index % 7 === 0 ? "vyzvednout balik" : "bez hledaneho vyrazu"}`,
      todos: [
        { text: `Ukol ${index + 1}` },
        { text: index % 17 === 0 ? "balik todo" : "druhy ukol" }
      ]
    }));
  }

  function vyhledejVSyntetickychPoznamkach(poznamky, dotaz) {
    const hledat = String(dotaz || "").trim().toLocaleLowerCase("cs-CZ");

    if (!hledat) return poznamky;

    return poznamky.filter(poznamka => {
      if (String(poznamka.title || "").toLocaleLowerCase("cs-CZ").includes(hledat)) {
        return true;
      }

      if (String(poznamka.note || "").toLocaleLowerCase("cs-CZ").includes(hledat)) {
        return true;
      }

      return (poznamka.todos || []).some(todo =>
        String(todo.text || "").toLocaleLowerCase("cs-CZ").includes(hledat)
      );
    });
  }

  function vytvorDlouhouStandardPoznamku(pocetOdstavcu = 400) {
    const editor = document.createElement("div");
    editor.id = "ln-perf-standard-editor";
    editor.contentEditable = "true";

    const fragment = document.createDocumentFragment();

    for (let i = 0; i < pocetOdstavcu; i += 1) {
      const radek = document.createElement("div");
      const tucne = document.createElement("strong");
      const barevne = document.createElement("span");

      tucne.textContent = `Radek ${i + 1}: `;
      barevne.textContent =
        "Delsi formatovany text pro kontrolu vykonu standardniho editoru.";
      barevne.style.fontSize = `${14 + (i % 5)}px`;

      radek.append(tucne, barevne);
      fragment.appendChild(radek);
    }

    editor.appendChild(fragment);
    return editor;
  }

  function vytvorTodoSeznam(pocet = 200) {
    const obal = document.createElement("div");
    obal.className = "todoList";
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < pocet; i += 1) {
      const item = document.createElement("div");
      item.className = "todoItem";
      item.dataset.todoId = `perf-todo-${i}`;

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = i % 9 === 0;

      const text = document.createElement("div");
      text.className = "todoTextDisplay";
      text.innerHTML =
        `<span${i % 5 === 0 ? ' style="font-weight:700"' : ""}>` +
        `Benchmark TODO polozka ${i + 1}</span>`;

      item.append(checkbox, text);
      fragment.appendChild(item);
    }

    obal.appendChild(fragment);
    return obal;
  }

  function vytvorBulletStrom(pocet = 200) {
    const koren = document.createElement("ul");
    let aktualniUl = koren;

    for (let i = 0; i < pocet; i += 1) {
      if (i > 0 && i % 25 === 0) {
        const rodic = aktualniUl.lastElementChild || koren.lastElementChild;
        if (rodic) {
          const vnoreny = document.createElement("ul");
          rodic.appendChild(vnoreny);
          aktualniUl = vnoreny;
        }
      }

      if (i > 0 && i % 50 === 0) {
        aktualniUl = koren;
      }

      const li = document.createElement("li");
      li.textContent = `Benchmark bullet ${i + 1}`;
      aktualniUl.appendChild(li);
    }

    return koren;
  }

  function svgDataUrl(index) {
    const hue = (index * 37) % 360;
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">` +
      `<rect width="640" height="360" fill="hsl(${hue} 35% 45%)"/>` +
      `<text x="32" y="190" font-size="42" fill="white">LubaNote PERF ${index + 1}</text>` +
      `</svg>`;

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  async function vytvorObrazky(pocet = 12) {
    const obal = document.createElement("div");
    const cekani = [];

    for (let i = 0; i < pocet; i += 1) {
      const img = document.createElement("img");
      img.alt = "";
      img.width = 320;
      img.height = 180;
      img.src = svgDataUrl(i);
      img.style.width = "50%";
      img.style.height = "auto";

      if (typeof img.decode === "function") {
        cekani.push(img.decode().catch(() => {}));
      }

      obal.appendChild(img);
    }

    await Promise.all(cekani);
    return obal;
  }

  async function zmerDomTest({
    sandbox,
    pocetOpakovani,
    vytvor,
    poVytvoreni
  }) {
    const hodnoty = [];

    for (let i = 0; i < pocetOpakovani; i += 1) {
      vycistiSandbox(sandbox);
      await dalsiFrame();

      const zacatek = performance.now();
      const obsah = await vytvor();
      sandbox.appendChild(obsah);

      if (typeof poVytvoreni === "function") {
        await poVytvoreni(obsah);
      }

      vynutLayout(sandbox);
      const konec = performance.now();
      hodnoty.push(konec - zacatek);
    }

    vycistiSandbox(sandbox);
    return median(hodnoty);
  }

  function zmerHledani(poznamky, opakovani = 200) {
    const zacatek = performance.now();
    let pocetNalezenych = 0;

    for (let i = 0; i < opakovani; i += 1) {
      pocetNalezenych += vyhledejVSyntetickychPoznamkach(
        poznamky,
        i % 2 === 0 ? "balik" : "poznamka"
      ).length;
    }

    const celkem = performance.now() - zacatek;

    return {
      celkem,
      prumer: celkem / opakovani,
      pocetNalezenych
    };
  }

  function ziskejProstredi() {
    const jeApk = Boolean(
      window.Capacitor?.isNativePlatform?.() ||
      navigator.userAgent.includes("; wv)") ||
      navigator.userAgent.includes(" Version/4.0 Chrome/")
    );

    return jeApk ? "APK/WebView" : "WEB";
  }

  function zalozLongTaskObserver() {
    const zaznamy = [];
    const podporovano = Boolean(
      window.PerformanceObserver?.supportedEntryTypes?.includes?.("longtask")
    );

    if (!podporovano) {
      return {
        zaznamy,
        podporovano: false,
        stop() {}
      };
    }

    const observer = new PerformanceObserver(list => {
      list.getEntries().forEach(entry => {
        zaznamy.push(entry.duration);
      });
    });

    observer.observe({ type: "longtask", buffered: false });

    return {
      zaznamy,
      podporovano: true,
      stop() {
        observer.disconnect();
      }
    };
  }

  function spust(zapis) {
    let zruseno = false;
    let sandbox = null;
    let longTask = null;

    const log = typeof zapis === "function"
      ? zapis
      : text => console.log(`[LubaNote PERF] ${text}`);

    const zkontrolujZruseni = () => {
      if (zruseno) {
        throw new Error("BENCHMARK_ZRUSEN");
      }
    };

    (async () => {
      const vysledky = {};
      const startCelkem = performance.now();
      const heapPred = performance.memory?.usedJSHeapSize || null;

      try {
        log(`PERF START | ${VERZE_BENCHMARKU}`);
        log(
          `PERF DEVICE | env=${ziskejProstredi()} | viewport=${window.innerWidth}x${window.innerHeight}` +
          ` | cores=${navigator.hardwareConcurrency || "N/A"}` +
          ` | memory=${navigator.deviceMemory || "N/A"}GB`
        );
        log(`PERF DATA | synteticka data pouze v pameti; uzivatelska data se nemeni`);

        sandbox = vytvorSandbox();
        longTask = zalozLongTaskObserver();

        // Kratke zahrati JIT / layoutu, nez zacneme zapisovat vysledky.
        sandbox.appendChild(vytvorSyntetickeKarty(5));
        vynutLayout(sandbox);
        vycistiSandbox(sandbox);
        await dalsiFrame();

        zkontrolujZruseni();
        log("PERF RUN | render 10 karet...");
        vysledky.karty10 = await zmerDomTest({
          sandbox,
          pocetOpakovani: 5,
          vytvor: () => vytvorSyntetickeKarty(10)
        });
        log(
          `PERF RESULT | cards-10=${formatMs(vysledky.karty10)} ` +
          `${stavProCas(vysledky.karty10, 15, 40)}`
        );

        zkontrolujZruseni();
        log("PERF RUN | render 100 karet...");
        vysledky.karty100 = await zmerDomTest({
          sandbox,
          pocetOpakovani: 3,
          vytvor: () => vytvorSyntetickeKarty(100)
        });
        log(
          `PERF RESULT | cards-100=${formatMs(vysledky.karty100)} ` +
          `${stavProCas(vysledky.karty100, 80, 180)}`
        );

        zkontrolujZruseni();
        log("PERF RUN | render 500 karet...");
        vysledky.karty500 = await zmerDomTest({
          sandbox,
          pocetOpakovani: 3,
          vytvor: () => vytvorSyntetickeKarty(500)
        });
        log(
          `PERF RESULT | cards-500=${formatMs(vysledky.karty500)} ` +
          `${stavProCas(vysledky.karty500, 300, 700)}`
        );

        zkontrolujZruseni();
        log("PERF RUN | hledani 100 / 500 poznamek...");
        const data100 = vytvorSyntetickePoznamky(100);
        const data500 = vytvorSyntetickePoznamky(500);
        vysledky.search100 = zmerHledani(data100, 200);
        await dalsiFrame();
        vysledky.search500 = zmerHledani(data500, 200);
        log(
          `PERF RESULT | search-100=${formatMs(vysledky.search100.prumer, 3)}/dotaz ` +
          `${stavProCas(vysledky.search100.prumer, 1, 3)}`
        );
        log(
          `PERF RESULT | search-500=${formatMs(vysledky.search500.prumer, 3)}/dotaz ` +
          `${stavProCas(vysledky.search500.prumer, 4, 10)}`
        );

        zkontrolujZruseni();
        log("PERF RUN | dlouha Standard poznamka 400 radku...");
        vysledky.standard400 = await zmerDomTest({
          sandbox,
          pocetOpakovani: 3,
          vytvor: () => vytvorDlouhouStandardPoznamku(400)
        });
        log(
          `PERF RESULT | standard-400=${formatMs(vysledky.standard400)} ` +
          `${stavProCas(vysledky.standard400, 120, 300)}`
        );

        zkontrolujZruseni();
        log("PERF RUN | 200 TODO polozek...");
        vysledky.todo200 = await zmerDomTest({
          sandbox,
          pocetOpakovani: 3,
          vytvor: () => vytvorTodoSeznam(200)
        });
        log(
          `PERF RESULT | todo-200=${formatMs(vysledky.todo200)} ` +
          `${stavProCas(vysledky.todo200, 160, 350)}`
        );

        zkontrolujZruseni();
        log("PERF RUN | 200 Bullet polozek...");
        vysledky.bullet200 = await zmerDomTest({
          sandbox,
          pocetOpakovani: 3,
          vytvor: () => vytvorBulletStrom(200)
        });
        log(
          `PERF RESULT | bullet-200=${formatMs(vysledky.bullet200)} ` +
          `${stavProCas(vysledky.bullet200, 120, 300)}`
        );

        zkontrolujZruseni();
        log("PERF RUN | 12 syntetickych obrazku...");
        vysledky.obrazky12 = await zmerDomTest({
          sandbox,
          pocetOpakovani: 2,
          vytvor: () => vytvorObrazky(12)
        });
        log(
          `PERF RESULT | images-12=${formatMs(vysledky.obrazky12)} ` +
          `${stavProCas(vysledky.obrazky12, 150, 400)}`
        );

        await dalsiFrame();
        zkontrolujZruseni();

        longTask?.stop();
        const longTasks = longTask?.zaznamy || [];
        const nejhorsiLongTask = longTasks.length ? Math.max(...longTasks) : 0;
        const heapPo = performance.memory?.usedJSHeapSize || null;
        const celkem = performance.now() - startCelkem;

        vysledky.longTasks = longTasks;
        vysledky.nejhorsiLongTask = nejhorsiLongTask;
        vysledky.celkem = celkem;

        log(
          longTask?.podporovano
            ? `PERF RESULT | long-tasks>50ms=${longTasks.length} | worst=${formatMs(nejhorsiLongTask)}`
            : "PERF RESULT | long-tasks=N/A (PerformanceObserver longtask neni dostupny)"
        );

        if (heapPred && heapPo) {
          log(
            `PERF RESULT | heap-delta=${((heapPo - heapPred) / 1024 / 1024).toFixed(1)} MB`
          );
        } else {
          log("PERF RESULT | heap-delta=N/A");
        }

        log(`PERF DONE | total=${formatMs(celkem)} | ${VERZE_BENCHMARKU}`);
        log("PERF NOTE | Pro baseline zkopiruj cely Debug Hub report.");

        posledniVysledek = {
          benchmark: VERZE_BENCHMARKU,
          cas: new Date().toISOString(),
          prostredi: ziskejProstredi(),
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          vysledky
        };
      } catch (chyba) {
        if (chyba?.message === "BENCHMARK_ZRUSEN") {
          log("PERF STOP | benchmark zrusen uzivatelem");
        } else {
          console.error("LubaNote Performance Benchmark selhal:", chyba);
          log(`PERF ERROR | ${chyba?.message || chyba}`);
        }
      } finally {
        longTask?.stop?.();
        sandbox?.remove?.();
      }
    })();

    return () => {
      zruseno = true;
      longTask?.stop?.();
      sandbox?.remove?.();
    };
  }

  window.LubaNotePerformanceBenchmark = {
    spust,
    posledniVysledek: () => posledniVysledek,
    verze: VERZE_BENCHMARKU
  };
})();
