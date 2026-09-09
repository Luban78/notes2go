/* ==========================================
   LUBANOTE – DRAG & MOVE KARET
   Long press = přesun, 2× tap = menu karty.
   ========================================== */

(() => {
  const DOBA_LONG_PRESS = 520;
  const MAX_POHYB_PRED_LONG_PRESS = 20;
  const DOBA_DVOJTAPU = 300;
  const OKRAJ_SYSTEMOVEHO_GESTA = 24;

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

  function ziskejCilovouKartu(x, y, pripnuta) {
    const container = pinnedCards();

    if (!container || !aktivniPresun) {
      return null;
    }

    const kandidati = [
      ...container.querySelectorAll(".taskCard")
    ].filter((karta) =>
      karta !== aktivniPresun.karta &&
      karta.dataset.cardPinned ===
        (pripnuta ? "1" : "0")
    );

    if (kandidati.length === 0) {
      return null;
    }

    const primo = document
      .elementFromPoint(x, y)
      ?.closest?.(".taskCard");

    if (primo && kandidati.includes(primo)) {
      return primo;
    }

    let nejblizsi = null;
    let nejmensi = Infinity;

    kandidati.forEach((karta) => {
      const rect = karta.getBoundingClientRect();
      const dx = x - (rect.left + rect.width / 2);
      const dy = y - (rect.top + rect.height / 2);
      const vzdalenost = Math.hypot(dx, dy * 0.85);

      if (vzdalenost < nejmensi) {
        nejmensi = vzdalenost;
        nejblizsi = karta;
      }
    });

    return nejblizsi;
  }

  function aktualizujCil(x, y) {
    const stav = aktivniPresun;

    if (!stav) {
      return;
    }

    const cil = ziskejCilovouKartu(
      x,
      y,
      stav.pripnuta
    );

    if (!cil) {
      return;
    }

    const cilovyKlic = cil.dataset.cardDragKey;

    if (!cilovyKlic || cilovyKlic === stav.dragKlic) {
      return;
    }

    const rect = cil.getBoundingClientRect();
    const vlozitPred =
      y < rect.top + rect.height / 2;

    if (
      stav.cilovyKlic === cilovyKlic &&
      stav.vlozitPred === vlozitPred
    ) {
      return;
    }

    const poradi = stav.poradiAktualni.filter(
      (klic) => klic !== stav.dragKlic
    );
    const cilovyIndex = poradi.indexOf(cilovyKlic);

    if (cilovyIndex < 0) {
      return;
    }

    poradi.splice(
      cilovyIndex + (vlozitPred ? 0 : 1),
      0,
      stav.dragKlic
    );

    stav.poradiAktualni = poradi;
    stav.cilovyKlic = cilovyKlic;
    stav.vlozitPred = vlozitPred;

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
    cilovyKlic,
    vlozitPred
  ) {
    if (!cardId || !cilovyKlic) {
      return false;
    }

    const provedZmenu = async () => {
      const tasks = loadTask();
      const presouvana =
        tasks.find((task) => task?.id === cardId);
      const cil = ziskejTaskPodleKlice(
        tasks,
        cilovyKlic
      );

      if (
        !presouvana ||
        !cil ||
        presouvana === cil ||
        (presouvana.pinned === true) !==
          (cil.pinned === true)
      ) {
        return false;
      }

      const zakladniSmer =
        window.LubaNoteCardOrder
          ?.ziskejZakladniSmer?.(tasks) ||
        "desc";
      const skupina = seradSkupinu(
        tasks,
        presouvana.pinned === true,
        zakladniSmer
      );
      const bezPresouvane = skupina.filter(
        ({ task }) => task !== presouvana
      );
      const cilovyIndex = bezPresouvane.findIndex(
        ({ task }) => task === cil
      );

      if (cilovyIndex < 0) {
        return false;
      }

      const indexVlozeni =
        cilovyIndex + (vlozitPred ? 0 : 1);
      const predchozi =
        bezPresouvane[indexVlozeni - 1]?.task || null;
      const nasledujici =
        bezPresouvane[indexVlozeni]?.task || null;

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

    if (
      typeof window.LubaNoteSync
        ?.provedLokalniZmenuASynchronizuj === "function"
    ) {
      return await window.LubaNoteSync
        .provedLokalniZmenuASynchronizuj(
          provedZmenu
        );
    }

    const vysledek = await provedZmenu();

    if (
      vysledek?.id &&
      typeof uploadLocalNoteToSupabase === "function"
    ) {
      void uploadLocalNoteToSupabase(vysledek);
    }

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
      pripnuta: karta.dataset.cardPinned === "1",
      placeholder,
      mapaPrvku,
      poradiOriginal,
      poradiAktualni: [...poradiOriginal],
      cilovyKlic: null,
      vlozitPred: true,
      offsetX: startX - rect.left,
      offsetY: startY - rect.top,
      posledniX: startX,
      posledniY: startY,
      onAfterReorder: config.onAfterReorder
    };

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

    const zmeneno =
      Boolean(stav.cilovyKlic) &&
      !jeStejnePoradi(
        stav.poradiOriginal,
        stav.poradiAktualni
      );

    obnovKartu(
      stav,
      zmeneno
        ? stav.poradiAktualni
        : stav.poradiOriginal
    );

    blokovatKlikDo = Date.now() + 500;

    if (!zmeneno) {
      return;
    }

    await ulozPresun(
      stav.cardId,
      stav.cilovyKlic,
      stav.vlozitPred
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
