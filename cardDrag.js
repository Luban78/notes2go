/* ==========================================
   LUBANOTE – DRAG & MOVE KARET
   Long press = přesun, 2× tap = menu karty.
   ========================================== */

(() => {
  const PRODUKCNI_DRAG_POVOLEN = false;
  const DOBA_LONG_PRESS = 460;
  const MAX_POHYB_PRED_LONG_PRESS = 28;
  const DOBA_DVOJTAPU = 300;
  const OKRAJ_SYSTEMOVEHO_GESTA = 24;

  /*
   * Drag 0.9.330: stabilní mřížka po celou dobu tahu.
   * Během dragování se DOM pořadí vůbec nemění. Cíl se pouze
   * zvýrazní samostatným markerem a skutečné přerovnání proběhne
   * právě jednou až při puštění karty.
   */
  const DOBA_POTVRZENI_CILE_MS = 190;
  const HYSTEREZE_SLOUPCE_PX = 34;
  const DEBUG_SCROLL_INTERVAL_MS = 160;
  const AUTO_SCROLL_OKRAJ_PX = 110;
  const AUTO_SCROLL_MIN_PX = 4;
  const AUTO_SCROLL_MAX_PX = 22;
  const MIN_POHYB_PO_PICKUP_PRED_AUTOSCROLL = 24;
  const MIN_POHYB_PRO_PRVNI_LOG = 3;

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

  function vzdalenostKeSlotu(slot, xObsah, yObsah) {
    if (!slot) {
      return Infinity;
    }

    const dx = xObsah - slot.stredX;
    const dy = (yObsah - slot.stredY) * 0.9;
    return Math.hypot(dx, dy);
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

  function pripravSloupce(sloty) {
    if (!Array.isArray(sloty) || sloty.length === 0) {
      return [];
    }

    const TOLERANCE_X = 26;
    const centra = [];

    [...sloty]
      .sort((a, b) => a.stredX - b.stredX)
      .forEach((slot) => {
        const posledni = centra[centra.length - 1];

        if (
          !posledni ||
          Math.abs(slot.stredX - posledni.stredX) > TOLERANCE_X
        ) {
          centra.push({
            stredX: slot.stredX,
            pocet: 1
          });
          return;
        }

        posledni.stredX =
          (posledni.stredX * posledni.pocet + slot.stredX) /
          (posledni.pocet + 1);
        posledni.pocet += 1;
      });

    sloty.forEach((slot) => {
      let nejblizsiIndex = 0;
      let nejmensiRozdil = Infinity;

      centra.forEach((sloupec, index) => {
        const rozdil = Math.abs(slot.stredX - sloupec.stredX);
        if (rozdil < nejmensiRozdil) {
          nejmensiRozdil = rozdil;
          nejblizsiIndex = index;
        }
      });

      slot.sloupec = nejblizsiIndex;
    });

    return centra.map((sloupec, index) => ({
      index,
      stredX: sloupec.stredX
    }));
  }

  function aktualizujAktivniSloupec(stav, xObsah) {
    if (!stav?.sloupce?.length || stav.sloupce.length === 1) {
      return;
    }

    const aktualni =
      stav.sloupce[stav.aktivniSloupec] || stav.sloupce[0];
    let nejblizsi = aktualni;
    let nejmensiVzdalenost = Math.abs(xObsah - aktualni.stredX);

    stav.sloupce.forEach((sloupec) => {
      const vzdalenost = Math.abs(xObsah - sloupec.stredX);
      if (vzdalenost < nejmensiVzdalenost) {
        nejmensiVzdalenost = vzdalenost;
        nejblizsi = sloupec;
      }
    });

    if (nejblizsi.index === stav.aktivniSloupec) {
      return;
    }

    const vzdalenostAktualni = Math.abs(
      xObsah - aktualni.stredX
    );

    if (
      nejmensiVzdalenost + HYSTEREZE_SLOUPCE_PX >=
      vzdalenostAktualni
    ) {
      return;
    }

    const predchozi = stav.aktivniSloupec;
    stav.aktivniSloupec = nejblizsi.index;

    emitujDragDebug("COLUMN", {
      card: zkratKlic(stav.dragKlic),
      from: predchozi,
      to: stav.aktivniSloupec,
      x: Math.round(xObsah)
    });
  }

  function ziskejNejblizsiSlot(
    stav,
    x,
    y,
    { aktualizovatSloupec = true } = {}
  ) {
    if (!stav?.sloty?.length) {
      return null;
    }

    const bodObsahu = pointerDoObsahu(stav, x, y);

    if (aktualizovatSloupec) {
      aktualizujAktivniSloupec(stav, bodObsahu.xObsah);
    }

    const kandidati = stav.sloupce?.length > 1
      ? stav.sloty.filter(
          (slot) => slot.sloupec === stav.aktivniSloupec
        )
      : stav.sloty;

    let nejblizsi = null;
    let nejmensiVzdalenost = Infinity;

    kandidati.forEach((slot) => {
      /*
       * Ve zvoleném sloupci je rozhodující hlavně svislá poloha.
       * X má jen malou váhu, aby drobný pohyb ruky neměnil cíl.
       */
      const dx = Math.abs(bodObsahu.xObsah - slot.stredX) * 0.22;
      const dy = Math.abs(bodObsahu.yObsah - slot.stredY);
      const vzdalenost = dy + dx;

      if (vzdalenost < nejmensiVzdalenost) {
        nejmensiVzdalenost = vzdalenost;
        nejblizsi = slot;
      }
    });

    return nejblizsi
      ? {
          slot: nejblizsi,
          vzdalenost: nejmensiVzdalenost,
          xObsah: bodObsahu.xObsah,
          yObsah: bodObsahu.yObsah
        }
      : null;
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
    if (!stav || !Number.isInteger(cilovyIndex)) {
      return;
    }

    const slot = stav.sloty?.[cilovyIndex];

    if (!slot || cilovyIndex === stav.puvodniIndexSkupiny) {
      skryjDropMarker(stav);
      return;
    }

    if (!stav.dropMarker) {
      const marker = document.createElement("div");
      marker.className = "lubaCardDropMarker";
      marker.setAttribute("aria-hidden", "true");
      document.body.append(marker);
      stav.dropMarker = marker;
    }

    const rect = ziskejScrollRect(stav.scrollKontejner);
    const scroll = ziskejScrollPozici(stav.scrollKontejner);
    const left =
      rect.left + slot.stredX - scroll.left - slot.sirka / 2;
    const top =
      rect.top + slot.stredY - scroll.top - slot.vyska / 2;

    Object.assign(stav.dropMarker.style, {
      left: `${Math.round(left)}px`,
      top: `${Math.round(top)}px`,
      width: `${Math.round(slot.sirka)}px`,
      height: `${Math.round(slot.vyska)}px`
    });
    stav.dropMarker.hidden = false;

    emitujDragDebug("TARGET_SHOW", {
      card: zkratKlic(stav.dragKlic),
      slot: cilovyIndex
    });
  }

  function zrusTimerKandidata(stav) {
    if (!stav?.kandidatTimer) {
      return;
    }

    clearTimeout(stav.kandidatTimer);
    stav.kandidatTimer = null;
  }

  function zrusKandidata(stav, duvod = "") {
    if (!stav) {
      return;
    }

    zrusTimerKandidata(stav);

    if (stav.kandidatIndex !== null) {
      emitujDragDebug("TARGET_CANCEL", {
        card: zkratKlic(stav.dragKlic),
        candidate: stav.kandidatIndex,
        reason: duvod || "reset"
      });
    }

    stav.kandidatIndex = null;
    stav.kandidatOd = 0;
  }

  function potvrdCil(
    stav,
    cilovyIndex,
    { duvod = "hold" } = {}
  ) {
    if (
      !stav ||
      !Number.isInteger(cilovyIndex) ||
      cilovyIndex < 0 ||
      cilovyIndex >= stav.skupinaOriginal.length
    ) {
      return false;
    }

    zrusTimerKandidata(stav);
    stav.kandidatIndex = null;
    stav.kandidatOd = 0;

    if (cilovyIndex === stav.cilovyIndexSkupiny) {
      zobrazDropMarker(stav, cilovyIndex);
      return false;
    }

    const puvodniIndex = stav.cilovyIndexSkupiny;
    stav.cilovyIndexSkupiny = cilovyIndex;

    emitujDragDebug("TARGET_CONFIRM", {
      card: zkratKlic(stav.dragKlic),
      from: puvodniIndex,
      to: cilovyIndex,
      reason: duvod
    });

    /*
     * DŮLEŽITÉ: tady už NIC nepřeskládáváme. V masonry mřížce
     * by změna sudého/lichého indexu přehazovala karty mezi sloupci.
     * Po celou dobu tahu proto zůstává rozložení nedotčené a pouze
     * zvýrazníme cílový slot.
     */
    zobrazDropMarker(stav, cilovyIndex);
    return true;
  }

  function nastavKandidata(stav, kandidat, x, y) {
    if (!stav || !kandidat) {
      return;
    }

    const kandidatIndex = kandidat.slot.index;

    if (kandidatIndex === stav.cilovyIndexSkupiny) {
      zrusKandidata(stav, "current-slot");
      return;
    }

    if (stav.kandidatIndex === kandidatIndex) {
      return;
    }

    zrusTimerKandidata(stav);
    stav.kandidatIndex = kandidatIndex;
    stav.kandidatOd = performance.now();

    emitujDragDebug("TARGET", {
      card: zkratKlic(stav.dragKlic),
      from: stav.cilovyIndexSkupiny,
      candidate: kandidatIndex,
      column: stav.aktivniSloupec,
      hold: DOBA_POTVRZENI_CILE_MS,
      x: Math.round(x),
      y: Math.round(y)
    });

    stav.kandidatTimer = setTimeout(() => {
      if (
        aktivniPresun !== stav ||
        stav.autoScrollAktivni ||
        stav.kandidatIndex !== kandidatIndex
      ) {
        return;
      }

      const vydrz = Math.round(
        performance.now() - stav.kandidatOd
      );

      emitujDragDebug("TARGET_HOLD", {
        card: zkratKlic(stav.dragKlic),
        candidate: kandidatIndex,
        ms: vydrz
      });

      potvrdCil(stav, kandidatIndex, {
        duvod: "hold"
      });
    }, DOBA_POTVRZENI_CILE_MS);
  }

  function aktualizujZamer(x, y) {
    const stav = aktivniPresun;

    if (!stav) {
      return;
    }

    if (stav.autoScrollAktivni) {
      zrusKandidata(stav, "auto-scroll");
      return;
    }

    const kandidat = ziskejNejblizsiSlot(stav, x, y);

    if (!kandidat) {
      zrusKandidata(stav, "no-target");
      return;
    }

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
    if (!stav?.autoScrollPovoleny) {
      return { smer: 0, sila: 0 };
    }

    const kontejner = stav.scrollKontejner;
    const rect = ziskejScrollRect(kontejner);
    const horniHrana = Math.max(0, rect.top);
    const dolniHrana = Math.min(
      window.innerHeight,
      rect.bottom
    );
    const dostupnaVyska = Math.max(
      1,
      dolniHrana - horniHrana
    );
    const okraj = Math.min(
      AUTO_SCROLL_OKRAJ_PX,
      Math.max(52, dostupnaVyska * 0.22)
    );

    let smer = 0;
    let sila = 0;

    if (stav.posledniY < horniHrana + okraj) {
      smer = -1;
      sila = Math.min(
        1,
        Math.max(
          0,
          (horniHrana + okraj - stav.posledniY) / okraj
        )
      );
    } else if (
      stav.posledniY > dolniHrana - okraj
    ) {
      smer = 1;
      sila = Math.min(
        1,
        Math.max(
          0,
          (stav.posledniY - (dolniHrana - okraj)) / okraj
        )
      );
    }

    return { smer, sila };
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
      const { smer, sila } = ziskejAutoScrollStav(stav);

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
        const maxScroll = jeDokumentovyScroll(kontejner)
          ? Math.max(
              0,
              document.documentElement.scrollHeight -
                window.innerHeight
            )
          : Math.max(
              0,
              kontejner.scrollHeight -
                kontejner.clientHeight
            );
        const rychlost = Math.round(
          AUTO_SCROLL_MIN_PX +
            (AUTO_SCROLL_MAX_PX - AUTO_SCROLL_MIN_PX) *
              sila * sila
        );
        const cilScroll = Math.max(
          0,
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
    if (!stav) {
      return;
    }

    odstranDropMarker(stav);

    /*
     * 0.9.331: originální karta po celou dobu zůstává v masonry DOM.
     * Pod prstem se pohybuje pouze její vizuální klon. Tím WebView
     * neztratí původní touch target a zároveň se mřížka ani na okamžik
     * nepřepočítá při samotném pickup.
     */
    stav.karta?.remove();
    stav.zdrojKarta?.classList.remove("lubaCardDragSource");

    rozmistitKarty(
      poradiKlicu,
      stav.mapaPrvku,
      { animovat: true }
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
    ghost.querySelectorAll?.(".lubaSwipeActionBackground")
      .forEach((prvek) => prvek.remove());

    ghost.classList.remove(
      "lubaSwipeDragging",
      "lubaSwipeDoneDragging",
      "lubaSwipeDeleteDragging",
      "lubaSwipeDoneCommitted",
      "lubaSwipeDeleteCommitted"
    );
    ghost.classList.add(
      "lubaCardDragActive",
      "lubaCardDragGhost"
    );
    ghost.style.removeProperty("--luba-swipe-x");
    ghost.setAttribute("aria-hidden", "true");

    ghost.style.width = `${Math.round(rect.width)}px`;
    ghost.style.height = `${Math.round(rect.height)}px`;
    ghost.style.left = `${Math.round(rect.left)}px`;
    ghost.style.top = `${Math.round(rect.top)}px`;
    ghost.style.zIndex = "4500";
    ghost.style.pointerEvents = "none";
    ghost.style.transformOrigin =
      `${Math.round(offsetX)}px ${Math.round(offsetY)}px`;

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

    if (
      aktivniPresun ||
      !config ||
      jeZakazano(karta) ||
      jeVstupStale(pointerId, touchId)
    ) {
      return;
    }

    const cardId = await config.ensureId?.();

    if (
      !cardId ||
      jeVstupStale(pointerId, touchId)
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
     * LubaNote nescrolluje přes window, ale uvnitř .app.
     * Proto jsou sloty uložené v souřadnicích OBSAHU scroll kontejneru.
     * Při auto-scrollu se nemění, zatímco souřadnice prstu se průběžně
     * převádějí podle aktuálního scrollTop. To umožní táhnout kartu
     * i přes desítky položek bez rozjetí cílových pozic.
     */
    const scrollKontejner = ziskejScrollKontejner();
    const scrollRect = ziskejScrollRect(scrollKontejner);
    const scrollPozice = ziskejScrollPozici(scrollKontejner);

    const sloty = skupinoveKarty.map((prvek, index) => {
      const slotRect = prvek.getBoundingClientRect();

      return {
        index,
        klic: prvek.dataset.cardDragKey,
        stredX:
          slotRect.left -
          scrollRect.left +
          scrollPozice.left +
          slotRect.width / 2,
        stredY:
          slotRect.top -
          scrollRect.top +
          scrollPozice.top +
          slotRect.height / 2,
        sirka: slotRect.width,
        vyska: slotRect.height,
        sloupec: 0
      };
    });
    const sloupce = pripravSloupce(sloty);
    const puvodniSlot = sloty[puvodniIndexSkupiny];
    const puvodniSloupec =
      puvodniSlot?.sloupec ?? 0;

    const rect = karta.getBoundingClientRect();
    const offsetX = startX - rect.left;
    const offsetY = startY - rect.top;

    /*
     * Původní kartu NIKDY během aktivního dotyku nereparentujeme.
     * Její místo drží ona sama; jen ji dočasně skryjeme a pod prstem
     * zobrazíme klon. To je zásadní pro stabilní Android touch sekvenci.
     */
    const ghost = vytvorDragGhost(
      karta,
      rect,
      offsetX,
      offsetY
    );
    karta.classList.add("lubaCardDragSource");

    aktivniPresun = {
      karta: ghost,
      zdrojKarta: karta,
      cardId,
      pointerId,
      touchId,
      vstup,
      dragKlic: novyKlic,
      pripnuta,
      mapaPrvku,
      poradiOriginal,
      poradiAktualni: [...poradiOriginal],
      skupinaOriginal,
      skupinaAktualni: [...skupinaOriginal],
      sloty,
      sloupce,
      aktivniSloupec: puvodniSloupec,
      scrollKontejner,
      puvodniIndexSkupiny,
      cilovyIndexSkupiny: puvodniIndexSkupiny,
      kandidatIndex: null,
      kandidatOd: 0,
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
      onAfterReorder: config.onAfterReorder
    };

    emitujDragDebug("START", {
      card: zkratKlic(novyKlic),
      index: puvodniIndexSkupiny,
      slots: sloty.length,
      columns: sloupce.length,
      pinned: pripnuta,
      x: Math.round(startX),
      y: Math.round(startY),
      scrollTop: Math.round(
        ziskejScrollPozici(scrollKontejner).top
      )
    });

    /*
     * Long press teď definitivně vyhrál nad swipe gestem. Swipe modul
     * dostane explicitní takeover, aby nezůstalo odhalené Hotovo/Smazat.
     */
    try {
      karta.dispatchEvent(
        new CustomEvent("luba:card-drag-takeover")
      );
    } catch (_) {
      // Gesto musí fungovat i bez pomocné události.
    }

    document.body.classList.add("lubaCardDragMode");
    blokovatKlikDo = Date.now() + 800;

    /*
     * Pointer capture se bere až PO vytvoření ghostu. Originální karta
     * zůstala ve stejném DOM uzlu, takže capture už nemůže zaniknout
     * kvůli přesunu elementu. Dotyková cesta používá touch events,
     * protože je v Android WebView pro long-press spolehlivější.
     */
    if (vstup !== "touch" && pointerId !== null) {
      try {
        karta.setPointerCapture?.(pointerId);
      } catch (_) {
        // Pointer capture je pojistka, ne podmínka funkce.
      }
    }

    emitujDragDebug("PICKUP", {
      card: zkratKlic(novyKlic),
      input: vstup,
      pointerCaptured:
        vstup !== "touch" &&
        pointerId !== null &&
        karta.hasPointerCapture?.(pointerId) === true
    });

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

    zrusTimerKandidata(stav);

    const kandidatPriPusteni = ziskejNejblizsiSlot(
      stav,
      stav.posledniX,
      stav.posledniY
    );

    if (kandidatPriPusteni) {
      potvrdCil(stav, kandidatPriPusteni.slot.index, {
        duvod: "drop"
      });
    }

    const vysledek = sestavPoradiSeSlotem(
      stav,
      stav.cilovyIndexSkupiny
    );
    stav.skupinaAktualni = vysledek.celaSkupina;
    stav.poradiAktualni = vysledek.celePoradi;

    const zmeneno = !jeStejnePoradi(
      stav.skupinaOriginal,
      stav.skupinaAktualni
    );

    const finalniIndex = stav.skupinaAktualni.indexOf(
      stav.dragKlic
    );

    emitujDragDebug("DROP", {
      card: zkratKlic(stav.dragKlic),
      from: stav.puvodniIndexSkupiny,
      to: finalniIndex,
      changed: zmeneno
    });

    try {
      if (
        stav.pointerId !== null &&
        stav.zdrojKarta?.hasPointerCapture?.(stav.pointerId)
      ) {
        stav.zdrojKarta.releasePointerCapture?.(stav.pointerId);
      }
    } catch (_) {
      // Uvolnění capture nesmí blokovat dokončení.
    }

    aktivniPresun = null;

    if (autoScrollFrame) {
      cancelAnimationFrame(autoScrollFrame);
      autoScrollFrame = null;
    }

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
        to: finalniIndex,
        changed: false
      });
      return;
    }

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

    zrusTimerKandidata(stav);

    try {
      if (
        stav.pointerId !== null &&
        stav.zdrojKarta?.hasPointerCapture?.(stav.pointerId)
      ) {
        stav.zdrojKarta.releasePointerCapture?.(stav.pointerId);
      }
    } catch (_) {
      // Uvolnění capture nesmí blokovat zrušení.
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
     * SAFETY ROLLBACK 0.9.332:
     * Produkcni long-press drag je docasne vypnuty, dokud neprojde
     * izolovany Drag Lab. 1x tap a 2x tap menu zustavaji aktivni.
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
        if (vzdalenost > MAX_POHYB_PRED_LONG_PRESS) {
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
        void dokoncitPresun();
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
        }, DOBA_LONG_PRESS);

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
      }, DOBA_LONG_PRESS);

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

  window.LubaNoteCardDrag = {
    pridejKarte,
    jeAktivni: () => Boolean(aktivniPresun)
  };
})();
