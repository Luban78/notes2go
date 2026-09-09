/* ==========================================
   LUBANOTE – DRAG & MOVE KARET
   Long press = přesun, 2× tap = menu karty.
   ========================================== */

(() => {
  const DOBA_LONG_PRESS = 520;
  const MAX_POHYB_PRED_LONG_PRESS = 20;
  const DOBA_DVOJTAPU = 300;
  const OKRAJ_SYSTEMOVEHO_GESTA = 24;

  /*
   * Cíl drag & drop už neurčujeme podle právě překreslených karet.
   * Při startu si uložíme stabilní sloty a během tahu přepínáme
   * mezi nimi až po překročení hystereze. Tím se přeruší zpětná
   * vazba "přeskládám DOM -> změním cíl -> přeskládám DOM".
   */
  const HYSTEREZE_SLOTU_PX = 28;
  const DEBUG_MOVE_INTERVAL_MS = 120;

  const aktivniPointery = new Set();
  const konfigurace = new WeakMap();
  const casovaceLongPress = new WeakMap();
  const posledniTap = new WeakMap();
  const casovaceJednohoTapu = new WeakMap();
  const obejitKlik = new WeakSet();

  let aktivniPresun = null;
  let autoScrollFrame = null;
  let blokovatKlikDo = 0;

  const pinnedCards = () =>
    document.getElementById("pinnedCards");
  const pinnedLeft = () =>
    document.getElementById("pinnedLeft");
  const pinnedRight = () =>
    document.getElementById("pinnedRight");

  function emitujDragDebug(typ, data = {}) {
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

  function vzdalenostKeSlotu(slot, xDokument, yDokument) {
    if (!slot) {
      return Infinity;
    }

    const dx = xDokument - slot.stredX;
    const dy = (yDokument - slot.stredY) * 0.9;
    return Math.hypot(dx, dy);
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

    if (
      !left ||
      !right ||
      !Array.isArray(poradiKlicu) ||
      !(mapaPrvku instanceof Map)
    ) {
      return;
    }

    const prvky = poradiKlicu
      .map((klic) => mapaPrvku.get(klic))
      .filter(Boolean);

    const starePozice = new Map();

    if (animovat) {
      prvky.forEach((prvek) => {
        if (
          prvek.classList?.contains("taskCard") &&
          !prvek.classList.contains("lubaCardDragActive")
        ) {
          starePozice.set(
            prvek,
            prvek.getBoundingClientRect()
          );
        }
      });
    }

    const listMode =
      localStorage.getItem("cardView") === "list";
    const desktopGrid =
      window.matchMedia("(min-width: 900px)").matches &&
      !listMode;

    left.replaceChildren();
    right.replaceChildren();

    if (desktopGrid) {
      const sloupce = [];

      for (let i = 0; i < 4; i++) {
        const sloupec = document.createElement("div");
        sloupec.className = "desktopMasonryColumn";
        left.append(sloupec);
        sloupce.push(sloupec);
      }

      prvky.forEach((prvek, index) => {
        sloupce[index % 4].append(prvek);
      });
    } else if (listMode) {
      prvky.forEach((prvek) => left.append(prvek));
    } else {
      prvky.forEach((prvek, index) => {
        (index % 2 === 0 ? left : right).append(prvek);
      });
    }

    if (!animovat) {
      return;
    }

    requestAnimationFrame(() => {
      starePozice.forEach((staryRect, prvek) => {
        if (!prvek.isConnected) {
          return;
        }

        const novyRect = prvek.getBoundingClientRect();
        const dx = staryRect.left - novyRect.left;
        const dy = staryRect.top - novyRect.top;

        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
          return;
        }

        try {
          prvek.animate(
            [
              {
                transform:
                  `translate(${dx}px, ${dy}px)`
              },
              { transform: "translate(0, 0)" }
            ],
            {
              duration: 150,
              easing: "ease-out"
            }
          );
        } catch (_) {
          // Animace je pouze vizuální bonus.
        }
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

  function ziskejNejblizsiSlot(stav, x, y) {
    if (!stav?.sloty?.length) {
      return null;
    }

    const xDokument = x + window.scrollX;
    const yDokument = y + window.scrollY;

    let nejblizsi = null;
    let nejmensiVzdalenost = Infinity;

    stav.sloty.forEach((slot) => {
      const vzdalenost = vzdalenostKeSlotu(
        slot,
        xDokument,
        yDokument
      );

      if (vzdalenost < nejmensiVzdalenost) {
        nejmensiVzdalenost = vzdalenost;
        nejblizsi = slot;
      }
    });

    return nejblizsi
      ? {
          slot: nejblizsi,
          vzdalenost: nejmensiVzdalenost,
          xDokument,
          yDokument
        }
      : null;
  }

  function aktualizujCil(x, y) {
    const stav = aktivniPresun;

    if (!stav) {
      return;
    }

    const kandidat = ziskejNejblizsiSlot(stav, x, y);

    if (!kandidat) {
      return;
    }

    const kandidatIndex = kandidat.slot.index;
    const aktualniSlot =
      stav.sloty[stav.cilovyIndexSkupiny] || null;
    const aktualniVzdalenost = vzdalenostKeSlotu(
      aktualniSlot,
      kandidat.xDokument,
      kandidat.yDokument
    );

    if (kandidatIndex === stav.cilovyIndexSkupiny) {
      return;
    }

    const povolitPrechod =
      kandidat.vzdalenost + HYSTEREZE_SLOTU_PX <
      aktualniVzdalenost;

    const ted = performance.now();

    if (!povolitPrechod) {
      if (
        ted - stav.posledniDebugMove >=
        DEBUG_MOVE_INTERVAL_MS
      ) {
        stav.posledniDebugMove = ted;
        emitujDragDebug("CANDIDATE", {
          card: zkratKlic(stav.dragKlic),
          from: stav.cilovyIndexSkupiny,
          candidate: kandidatIndex,
          x: Math.round(x),
          y: Math.round(y),
          candidateDistance: Math.round(kandidat.vzdalenost),
          currentDistance: Math.round(aktualniVzdalenost),
          hysteresis: HYSTEREZE_SLOTU_PX
        });
      }
      return;
    }

    const puvodniIndex = stav.cilovyIndexSkupiny;
    const vysledek = sestavPoradiSeSlotem(
      stav,
      kandidatIndex
    );

    stav.cilovyIndexSkupiny = kandidatIndex;
    stav.skupinaAktualni = vysledek.celaSkupina;
    stav.poradiAktualni = vysledek.celePoradi;

    emitujDragDebug("SLOT", {
      card: zkratKlic(stav.dragKlic),
      from: puvodniIndex,
      to: kandidatIndex,
      x: Math.round(x),
      y: Math.round(y),
      candidateDistance: Math.round(kandidat.vzdalenost),
      currentDistance: Math.round(aktualniVzdalenost)
    });

    rozmistitKarty(
      stav.poradiAktualni,
      stav.mapaPrvku
    );
  }

  function pohniKartou(x, y) {
    const stav = aktivniPresun;

    if (!stav) {
      return;
    }

    stav.posledniX = x;
    stav.posledniY = y;

    stav.karta.style.left =
      `${Math.round(x - stav.offsetX)}px`;
    stav.karta.style.top =
      `${Math.round(y - stav.offsetY)}px`;

    aktualizujCil(x, y);
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

      const okraj = 95;
      let posun = 0;

      if (stav.posledniY < okraj) {
        posun = -10;
      } else if (
        stav.posledniY > window.innerHeight - okraj
      ) {
        posun = 10;
      }

      if (posun !== 0) {
        window.scrollBy(0, posun);
        aktualizujCil(
          stav.posledniX,
          stav.posledniY
        );
      }

      autoScrollFrame = requestAnimationFrame(krok);
    };

    autoScrollFrame = requestAnimationFrame(krok);
  }

  function obnovKartu(stav, poradiKlicu) {
    if (!stav) {
      return;
    }

    stav.placeholder.remove();
    stav.mapaPrvku.set(stav.dragKlic, stav.karta);

    rozmistitKarty(
      poradiKlicu,
      stav.mapaPrvku,
      { animovat: true }
    );

    stav.karta.classList.remove("lubaCardDragActive");

    [
      "left",
      "top",
      "width",
      "height",
      "z-index",
      "pointer-events",
      "transform-origin"
    ].forEach((vlastnost) =>
      stav.karta.style.removeProperty(vlastnost)
    );

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

  function seradSkupinu(tasks, pripnuta, zakladniSmer) {
    const ziskejPoradi =
      window.LubaNoteCardOrder
        ?.ziskejEfektivniPoradi;

    return tasks
      .map((task, originalIndex) => ({
        task,
        originalIndex
      }))
      .filter(({ task }) =>
        (task?.pinned === true) === pripnuta
      )
      .sort((a, b) => {
        const poradiA =
          typeof ziskejPoradi === "function"
            ? ziskejPoradi(a.task, zakladniSmer)
            : 0;
        const poradiB =
          typeof ziskejPoradi === "function"
            ? ziskejPoradi(b.task, zakladniSmer)
            : 0;

        if (poradiA !== poradiB) {
          return poradiB - poradiA;
        }

        const rozdilId = String(
          a.task?.id || ""
        ).localeCompare(
          String(b.task?.id || ""),
          "cs"
        );

        return rozdilId !== 0
          ? rozdilId
          : a.originalIndex - b.originalIndex;
      });
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

  async function zahajPresun(
    karta,
    pointerId,
    startX,
    startY
  ) {
    const config = konfigurace.get(karta);

    if (
      aktivniPresun ||
      !config ||
      jeZakazano(karta) ||
      !aktivniPointery.has(pointerId) ||
      karta.classList.contains("lubaSwipeDragging")
    ) {
      return;
    }

    const cardId = await config.ensureId?.();

    if (
      !cardId ||
      !aktivniPointery.has(pointerId)
    ) {
      return;
    }

    const novyKlic = `id:${cardId}`;
    karta.dataset.cardDragKey = novyKlic;

    const container = pinnedCards();

    if (!container) {
      return;
    }

    const vsechnyKarty = [
      ...container.querySelectorAll(".taskCard")
    ].sort(
      (a, b) =>
        Number(a.dataset.cardDisplayOrder || 0) -
        Number(b.dataset.cardDisplayOrder || 0)
    );

    const poradiOriginal = vsechnyKarty
      .map((prvek) => prvek.dataset.cardDragKey)
      .filter(Boolean);
    const mapaPrvku = new Map(
      vsechnyKarty
        .map((prvek) => [
          prvek.dataset.cardDragKey,
          prvek
        ])
        .filter(([klic]) => Boolean(klic))
    );

    if (!poradiOriginal.includes(novyKlic)) {
      return;
    }

    const pripnuta = karta.dataset.cardPinned === "1";
    const skupinoveKarty = vsechnyKarty.filter(
      (prvek) =>
        prvek.dataset.cardPinned ===
        (pripnuta ? "1" : "0")
    );
    const skupinaOriginal = skupinoveKarty
      .map((prvek) => prvek.dataset.cardDragKey)
      .filter(Boolean);
    const puvodniIndexSkupiny =
      skupinaOriginal.indexOf(novyKlic);

    if (puvodniIndexSkupiny < 0) {
      return;
    }

    /*
     * Sloty se uloží JEŠTĚ před vytažením karty z layoutu.
     * Zůstávají po celý drag neměnné, i když ostatní karty vizuálně
     * uhýbají. Právě to odstraňuje náhodné přeskakování cíle.
     */
    const sloty = skupinoveKarty.map((prvek, index) => {
      const slotRect = prvek.getBoundingClientRect();

      return {
        index,
        klic: prvek.dataset.cardDragKey,
        stredX:
          slotRect.left +
          window.scrollX +
          slotRect.width / 2,
        stredY:
          slotRect.top +
          window.scrollY +
          slotRect.height / 2,
        sirka: slotRect.width,
        vyska: slotRect.height
      };
    });

    const rect = karta.getBoundingClientRect();
    const placeholder = document.createElement("div");
    placeholder.className = "lubaCardDragPlaceholder";
    placeholder.style.height = `${Math.round(rect.height)}px`;
    placeholder.setAttribute("aria-hidden", "true");

    karta.before(placeholder);
    mapaPrvku.set(novyKlic, placeholder);

    aktivniPresun = {
      karta,
      cardId,
      pointerId,
      dragKlic: novyKlic,
      pripnuta,
      placeholder,
      mapaPrvku,
      poradiOriginal,
      poradiAktualni: [...poradiOriginal],
      skupinaOriginal,
      skupinaAktualni: [...skupinaOriginal],
      sloty,
      puvodniIndexSkupiny,
      cilovyIndexSkupiny: puvodniIndexSkupiny,
      posledniDebugMove: 0,
      offsetX: startX - rect.left,
      offsetY: startY - rect.top,
      posledniX: startX,
      posledniY: startY,
      onAfterReorder: config.onAfterReorder
    };

    emitujDragDebug("START", {
      card: zkratKlic(novyKlic),
      index: puvodniIndexSkupiny,
      slots: sloty.length,
      pinned: pripnuta,
      x: Math.round(startX),
      y: Math.round(startY)
    });

    karta.classList.add("lubaCardDragActive");
    document.body.classList.add("lubaCardDragMode");
    blokovatKlikDo = Date.now() + 800;

    karta.style.width = `${Math.round(rect.width)}px`;
    karta.style.height = `${Math.round(rect.height)}px`;
    karta.style.left = `${Math.round(rect.left)}px`;
    karta.style.top = `${Math.round(rect.top)}px`;
    karta.style.zIndex = "4500";
    karta.style.pointerEvents = "none";
    karta.style.transformOrigin =
      `${Math.round(aktivniPresun.offsetX)}px ` +
      `${Math.round(aktivniPresun.offsetY)}px`;

    document.body.append(karta);

    try {
      navigator.vibrate?.(22);
    } catch (_) {
      // Haptika není podmínkou drag & drop.
    }

    pohniKartou(startX, startY);
    spustAutoScroll();
  }

  async function dokoncitPresun() {
    const stav = aktivniPresun;

    if (!stav) {
      return;
    }

    aktivniPresun = null;

    if (autoScrollFrame) {
      cancelAnimationFrame(autoScrollFrame);
      autoScrollFrame = null;
    }

    const zmeneno = !jeStejnePoradi(
      stav.skupinaOriginal,
      stav.skupinaAktualni
    );

    obnovKartu(
      stav,
      zmeneno
        ? stav.poradiAktualni
        : stav.poradiOriginal
    );

    blokovatKlikDo = Date.now() + 500;

    if (!zmeneno) {
      emitujDragDebug("END", {
        card: zkratKlic(stav.dragKlic),
        from: stav.puvodniIndexSkupiny,
        to: stav.cilovyIndexSkupiny,
        changed: false
      });
      return;
    }

    const finalniIndex = stav.skupinaAktualni.indexOf(
      stav.dragKlic
    );
    const predchoziKlic =
      stav.skupinaAktualni[finalniIndex - 1] || null;
    const nasledujiciKlic =
      stav.skupinaAktualni[finalniIndex + 1] || null;

    emitujDragDebug("END", {
      card: zkratKlic(stav.dragKlic),
      from: stav.puvodniIndexSkupiny,
      to: finalniIndex,
      changed: true,
      previous: zkratKlic(predchoziKlic),
      next: zkratKlic(nasledujiciKlic)
    });

    await ulozPresun(
      stav.cardId,
      predchoziKlic,
      nasledujiciKlic
    );

    stav.onAfterReorder?.();
  }

  function zrusPresun() {
    const stav = aktivniPresun;

    if (!stav) {
      return;
    }

    aktivniPresun = null;

    if (autoScrollFrame) {
      cancelAnimationFrame(autoScrollFrame);
      autoScrollFrame = null;
    }

    obnovKartu(stav, stav.poradiOriginal);
    blokovatKlikDo = Date.now() + 400;

    emitujDragDebug("CANCEL", {
      card: zkratKlic(stav.dragKlic),
      from: stav.puvodniIndexSkupiny,
      to: stav.cilovyIndexSkupiny
    });
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

    let startX = 0;
    let startY = 0;
    let pointerId = null;

    karta.addEventListener("pointerdown", (event) => {
      zrusLongPress(karta);

      if (
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
      pointerId = event.pointerId;

      const timer = setTimeout(() => {
        if (
          !aktivniPointery.has(pointerId) ||
          karta.classList.contains("lubaSwipeDragging")
        ) {
          return;
        }

        void zahajPresun(
          karta,
          pointerId,
          startX,
          startY
        );
      }, DOBA_LONG_PRESS);

      casovaceLongPress.set(karta, timer);
    });

    karta.addEventListener("pointermove", (event) => {
      if (
        aktivniPresun?.karta === karta ||
        event.pointerId !== pointerId
      ) {
        return;
      }

      const dx = Math.abs(event.clientX - startX);
      const dy = Math.abs(event.clientY - startY);

      if (
        dx > MAX_POHYB_PRED_LONG_PRESS ||
        dy > MAX_POHYB_PRED_LONG_PRESS
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
        void dokoncitPresun();
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

  window.LubaNoteCardDrag = {
    pridejKarte,
    jeAktivni: () => Boolean(aktivniPresun)
  };
})();
