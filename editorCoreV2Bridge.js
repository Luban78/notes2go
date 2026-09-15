/* ========================================
   LUBANOTE – EDITOR CORE V2 BRIDGE / PRODUCTION
   HARD CUT 528 – CORE V2 JE JEDINÝ EDITOR

   Pravidla:
   - žádný druhý editor, fallback ani přepínač,
   - Core V2 model je jediný zdroj pravdy,
   - save/sync/export čtou kanonický obsah přímo z Core V2,
   - staré uložené HTML/TODO se pouze importuje do modelu; není to druhý editor.
======================================== */

(() => {
  "use strict";

  const taskModal = document.getElementById("taskModal");
  const modalTitle = document.getElementById("modalTitle");
  const editorBackButton = document.getElementById("editorBackButton");
  const selectionMenu = document.getElementById("selectionMenu");
  const selectionVyjmout = document.getElementById("selectionVyjmout");
  const selectionKopirovat = document.getElementById("selectionKopirovat");
  const selectionVlozit = document.getElementById("selectionVlozit");
  const selectionVybratVse = document.getElementById("selectionVybratVse");

  /*
   * FIX 520 – FROZEN DESKTOP SELECTION CONTRACT.
   *
   * #selectionMenu je mobilní UI. Na PC nesmí reagovat na dblclick, contextmenu
   * ani selectionchange a nesmí programově skládat označený text. Desktop má
   * nativní browser selection/context menu + Ctrl zkratky; Core V2 jen drží
   * modelový snapshot a bezpečně provádí mutace.
   */
  const jeDesktopSelection =
    window.matchMedia?.("(hover: hover) and (pointer: fine)")?.matches === true;

  if (!taskModal || !modalTitle || !editorBackButton) {
    return;
  }

  let aktivni = false;
  let aktivniNoteId = null;
  let puvodniTitleContenteditable = null;
  let preskocCaptureFajfky = false;
  let hostitel = document.getElementById("modalRichTextV2Host");
  let toast = null;
  let odkazModal = null;
  let odkazTextInput = null;
  let odkazUrlInput = null;
  let observer = null;
  let pozastavAktivaci = false;
  let nastavovaciObrazekId = "";
  let observerNastaveniObrazku = null;
  let cropModal = null;
  let cropStage = null;
  let cropCanvas = null;
  let cropVyber = null;
  let cropStav = null;

  /* V2.20 – stav našeho vlastního selection menu. */
  let v2SelectionMenuAktivni = false;
  let v2SelectionMenuKurzor = false;
  let v2SelectionMenuBod = null;
  let v2LokalniSchranka = "";
  let v2RichSchranka = null;
  let potlacV2SelectionMenuDo = 0;
  let v2PosledniTapSelection = null;

  const podporovaneAkce = new Set([
    "tlacitkoZpet",
    "tlacitkoZnovu",
    "tlacitkoTucne",
    "tlacitkoKurziva",
    "tlacitkoPodtrzeni",
    "tlacitkoBullet"
  ]);

  const dokumentoveAkce = new Set([
    "tlacitkoOtevritDokument",
    "tlacitkoUlozitDokument"
  ]);


  const moznostiVelikostiObrazku = [
    { hodnota: "prizpusobit", popisek: "Přizpůsobit editoru" },
    { hodnota: "100", popisek: "100 %" },
    { hodnota: "75", popisek: "75 %" },
    { hodnota: "50", popisek: "50 %" },
    { hodnota: "25", popisek: "25 %" },
    { hodnota: "vlastni", popisek: "Vlastní" }
  ];

  const moznostiZarovnaniObrazku = [
    { hodnota: "vlevo", popisek: "Vlevo" },
    { hodnota: "stred", popisek: "Na střed" },
    { hodnota: "vpravo", popisek: "Vpravo" }
  ];

  function popisekVelikostiObrazku(hodnota) {
    const nalezena = moznostiVelikostiObrazku.find((polozka) => polozka.hodnota === String(hodnota));
    if (nalezena) return nalezena.popisek;
    const cislo = Number(hodnota);
    return Number.isFinite(cislo) ? `${cislo} %` : "Přizpůsobit editoru";
  }

  function popisekZarovnaniObrazku(hodnota) {
    return moznostiZarovnaniObrazku.find((polozka) => polozka.hodnota === hodnota)?.popisek || "Na střed";
  }

  function core() {
    return window.LubaNoteEditorV2 || null;
  }

  function vytvorPomocneUi() {
    if (!hostitel) {
      hostitel = document.createElement("div");
      hostitel.id = "modalRichTextV2Host";
      hostitel.className = "modalRichTextV2Host";
      hostitel.hidden = true;
      document.querySelector("#taskModal .modalTitleRow")?.insertAdjacentElement("afterend", hostitel);
    }

    if (!toast) {
      toast = document.createElement("div");
      toast.id = "lnV2BridgeToast";
      toast.className = "lnV2BridgeToast";
      toast.hidden = true;
      document.body.appendChild(toast);
    }
  }

  let toastTimer = null;

  /* ==================================================
     DIAG 435 – STARÝ ANDROID: SELECTION / TOOLBAR / SAVE

     Pouze diagnostika. Nesmí měnit selection, IME ani save chování.
     Výstup jde do Debug Hubu jako V2STAB.
  ================================================== */
  function zapisV2Stabilitu(faze, detail = "") {
    try {
      const vyber = window.getSelection();
      const range = vyber?.rangeCount ? vyber.getRangeAt(0) : null;
      const text = vyber && !vyber.isCollapsed ? String(vyber.toString() || "") : "";
      const vHostu = Boolean(range && hostitel && hostitel.contains(range.commonAncestorContainer));
      document.dispatchEvent(new CustomEvent("lubanote:v2-stability-debug", {
        detail: {
          text: `${faze} | aktivni=${aktivni} | ime=${core()?.jeImeKompoziceAktivni?.() === true} | range=${range ? (range.collapsed ? "caret" : `sel:${text.length}`) : "none"} | host=${vHostu} | text=${JSON.stringify(text.slice(0, 60))}${detail ? ` | ${detail}` : ""}`
        }
      }));
    } catch (_error) {}
  }
  function zobrazToast(text, chyba = false) {
    vytvorPomocneUi();
    if (!toast) return;
    toast.textContent = String(text || "");
    toast.classList.toggle("chyba", Boolean(chyba));
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      if (toast) toast.hidden = true;
    }, 2600);
  }

  /* ==========================================
     V2.20 – VLASTNÍ LUBANOTE SELECTION PANELY

     Používáme společné #selectionMenu aplikace, ale akce vedeme výhradně
     přes Core V2 model. Tím vracíme oba odladěné režimy:
       - Vyjmout / Kopírovat / Vložit / Vše pro označený text
       - Vložit / Vše pro caret / prázdné místo
  ========================================== */

  function jeV2SelectionRozsah(rozsah) {
    if (!aktivni || !hostitel || !rozsah) return false;
    try {
      return hostitel.contains(rozsah.startContainer) && hostitel.contains(rozsah.endContainer);
    } catch (_error) {
      return false;
    }
  }

  /*
   * 🔒 V2.20b – arbitráž selection menu vs. odladěný row-wide MOVE.
   *
   * Krátký/2× tap na řádku musí zůstat selection. Selection se potlačí až
   * tehdy, když Core skutečně dokončil long-press (pripraven/aktivni).
   * Pouze contextmenu smí preventivně rozpoznat řádek jako MOVE cíl, protože
   * long-press na Bullet/TODO je záměrně rezervovaný pro přesun.
   */
  function jeV2MoveInterakce(event = null, zahrnoutCilRadku = false) {
    const jadro = core();
    if (jadro?.jeInterakcePresunuSeznamu?.()) return true;
    if (!zahrnoutCilRadku || !event) return false;
    return Boolean(jadro?.jeCilPresunuSeznamu?.(event.target));
  }

  function potlacSelectionMenuKvuliMove(ms = 550) {
    potlacV2SelectionMenuDo = Math.max(potlacV2SelectionMenuDo, performance.now() + ms);
    v2PosledniTapSelection = null;
    skryjV2SelectionMenu();
  }

  function skryjV2SelectionMenu() {
    if (!selectionMenu) return;
    if (selectionMenu.dataset.lnV2Owner === "1") {
      selectionMenu.hidden = true;
      selectionMenu.removeAttribute("data-ln-v2-owner");
    }
    v2SelectionMenuAktivni = false;
    v2SelectionMenuKurzor = false;
    v2SelectionMenuBod = null;
  }

  function nastavV2SelectionMenuTlacitka(kurzor = false) {
    if (!selectionMenu) return;
    if (selectionVyjmout) selectionVyjmout.hidden = kurzor;
    if (selectionKopirovat) selectionKopirovat.hidden = kurzor;
    if (selectionVlozit) selectionVlozit.hidden = false;
    if (selectionVybratVse) selectionVybratVse.hidden = false;
  }

  function pozicujV2SelectionMenu({ rozsah = null, bod = null } = {}) {
    if (!selectionMenu) return;

    selectionMenu.hidden = false;
    selectionMenu.dataset.lnV2Owner = "1";

    requestAnimationFrame(() => {
      if (!aktivni || selectionMenu.hidden) return;

      let rect = null;
      if (rozsah && !rozsah.collapsed) {
        const rects = Array.from(rozsah.getClientRects?.() || []).filter((r) => r.width || r.height);
        rect = rects[0] || rozsah.getBoundingClientRect?.() || null;
      }

      const sirka = selectionMenu.offsetWidth || 240;
      const vyska = selectionMenu.offsetHeight || 44;
      const viewportW = window.visualViewport?.width || window.innerWidth || document.documentElement.clientWidth;
      const viewportH = window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight;
      const offsetTop = window.visualViewport?.offsetTop || 0;
      const okraj = 8;

      let x;
      let y;

      if (bod) {
        x = Number(bod.x) - sirka / 2;
        y = Number(bod.y) - vyska - 14;
        if (y < offsetTop + okraj) y = Number(bod.y) + 18;
      } else if (rect) {
        x = rect.left + rect.width / 2 - sirka / 2;
        y = rect.top - vyska - 12;
        if (y < offsetTop + okraj) y = rect.bottom + 12;
      } else {
        x = (viewportW - sirka) / 2;
        y = offsetTop + 70;
      }

      x = Math.max(okraj, Math.min(x, viewportW - sirka - okraj));
      y = Math.max(offsetTop + okraj, Math.min(y, offsetTop + viewportH - vyska - okraj));

      selectionMenu.style.left = `${Math.round(x)}px`;
      selectionMenu.style.top = `${Math.round(y)}px`;
    });
  }

  function zobrazV2SelectionMenuProOznaceni(rozsah = null) {
    if (jeDesktopSelection || !aktivni || !selectionMenu) return false;
    const vyber = window.getSelection();
    const range = rozsah || (vyber?.rangeCount ? vyber.getRangeAt(0) : null);
    if (!range || range.collapsed || !jeV2SelectionRozsah(range)) return false;

    core()?.zachytAktualniVyber?.();
    nastavV2SelectionMenuTlacitka(false);
    v2SelectionMenuAktivni = true;
    v2SelectionMenuKurzor = false;
    v2SelectionMenuBod = null;
    pozicujV2SelectionMenu({ rozsah: range });
    return true;
  }

  function zobrazV2SelectionMenuProKurzor(bod = null) {
    if (jeDesktopSelection || !aktivni || !selectionMenu) return false;
    core()?.zachytAktualniVyber?.();
    nastavV2SelectionMenuTlacitka(true);
    v2SelectionMenuAktivni = true;
    v2SelectionMenuKurzor = true;
    v2SelectionMenuBod = bod ? { x: Number(bod.x), y: Number(bod.y) } : null;
    pozicujV2SelectionMenu({ bod: v2SelectionMenuBod });
    return true;
  }

  async function zapisV2DoSchranky(text) {
    const hodnota = String(text || "");
    if (!hodnota) return false;
    const plugin = window.Capacitor?.Plugins?.Clipboard;
    if (plugin?.write) {
      await plugin.write({ string: hodnota });
      v2LokalniSchranka = hodnota;
      return true;
    }
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(hodnota);
        v2LokalniSchranka = hodnota;
        return true;
      } catch (_error) {}
    }
    v2LokalniSchranka = hodnota;
    return true;
  }

  async function prectiV2ZeSchranky() {
    const plugin = window.Capacitor?.Plugins?.Clipboard;
    if (plugin?.read) {
      const vysledek = await plugin.read();
      const text = String(vysledek?.value || "");
      if (text) v2LokalniSchranka = text;
      return text;
    }
    if (navigator.clipboard?.readText) {
      try {
        const text = String(await navigator.clipboard.readText() || "");
        if (text) v2LokalniSchranka = text;
        return text;
      } catch (_error) {}
    }
    return v2LokalniSchranka;
  }

  async function zpracujV2SelectionMenuAkci(event) {
    if (!aktivni || !selectionMenu || selectionMenu.dataset.lnV2Owner !== "1") return;
    const button = event.target.closest?.("button");
    if (!button || !selectionMenu.contains(button)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    potlacV2SelectionMenuDo = performance.now() + 300;

    try {
      if (button === selectionKopirovat) {
        const text = core()?.ziskejTextVyberuProSelectionMenu?.() || "";
        const rich = core()?.ziskejRichVyberProSelectionMenu?.() || null;
        if (text && await zapisV2DoSchranky(text)) {
          v2RichSchranka = rich?.text === text ? rich : null;
          core()?.sklapniVyberNaKonecProSelectionMenu?.();
        }
        skryjV2SelectionMenu();
        return;
      }

      if (button === selectionVyjmout) {
        const text = core()?.ziskejTextVyberuProSelectionMenu?.() || "";
        const rich = core()?.ziskejRichVyberProSelectionMenu?.() || null;
        if (!text) return;
        await zapisV2DoSchranky(text);
        v2RichSchranka = rich?.text === text ? rich : null;
        core()?.vyjmiVyberProSelectionMenu?.();
        skryjV2SelectionMenu();
        obnovToolbar();
        return;
      }

      if (button === selectionVlozit) {
        const text = await prectiV2ZeSchranky();
        if (text) {
          const vlozenoRich = Boolean(
            v2RichSchranka?.text === text
            && core()?.vlozRichVyberProSelectionMenu?.(v2RichSchranka)
          );
          if (!vlozenoRich) {
            core()?.vlozTextProSelectionMenu?.(text);
          }
          obnovToolbar();
        }
        skryjV2SelectionMenu();
        return;
      }

      if (button === selectionVybratVse) {
        zapisV2Stabilitu("MENU_VSE_BEFORE");
        if (core()?.vyberVseProSelectionMenu?.()) {
          zapisV2Stabilitu("MENU_VSE_AFTER");
          const zobrazPoVyberuVse = () => {
            if (!aktivni) return;
            core()?.zachytAktualniVyber?.();
            const vyber = window.getSelection();
            const range = vyber?.rangeCount ? vyber.getRangeAt(0) : null;
            if (range && !range.collapsed && jeV2SelectionRozsah(range)) {
              zobrazV2SelectionMenuProOznaceni(range);
              return;
            }
            if (core()?.ziskejTextVyberuProSelectionMenu?.()) {
              nastavV2SelectionMenuTlacitka(false);
              v2SelectionMenuAktivni = true;
              v2SelectionMenuKurzor = false;
              pozicujV2SelectionMenu();
            }
          };
          requestAnimationFrame(zobrazPoVyberuVse);
          setTimeout(zobrazPoVyberuVse, 80);
        }
        return;
      }
    } catch (error) {
      console.warn("Editor V2: selection menu akce selhala", error);
      skryjV2SelectionMenu();
    }
  }

  function zpracujV2SelectionChangeProMenu() {
    if (jeDesktopSelection || !aktivni || performance.now() < potlacV2SelectionMenuDo) return;
    if (jeV2MoveInterakce()) return;
    const vyber = window.getSelection();
    const range = vyber?.rangeCount ? vyber.getRangeAt(0) : null;
    if (!range || !jeV2SelectionRozsah(range)) return;

    core()?.zachytAktualniVyber?.();

    if (!range.collapsed) {
      zobrazV2SelectionMenuProOznaceni(range);
      return;
    }

    if (!v2SelectionMenuKurzor) skryjV2SelectionMenu();
  }

  function jeEditorOtevreny() {
    return !taskModal.hidden && taskModal.classList.contains("show");
  }

  function ziskejNoteId() {
    return String(
      taskModal.dataset.taskId ||
      taskModal.dataset.draftTaskId ||
      "nova-poznamka"
    ).trim();
  }

  function jeZakazanyKontext() {
    /* 428 – Shared editor používá stejný Core V2 jako vlastní poznámky.
       Serverový lock/save stále vlastní sharingEditor.js; Bridge pouze
       poskytuje modelový editor a před uložením připraví kanonická data. */
    return "";
  }

  function vytvorV2OdkazModal() {
    if (odkazModal) return;

    odkazModal = document.createElement("div");
    odkazModal.className = "editorLinkModal lnV2LinkModal";
    odkazModal.hidden = true;

    const dialog = document.createElement("div");
    dialog.className = "editorLinkDialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "lnV2LinkTitle");

    const title = document.createElement("h3");
    title.id = "lnV2LinkTitle";
    if (window.LubaNoteIcons?.nastavObsahSIkonou) {
      window.LubaNoteIcons.nastavObsahSIkonou(title, "odkaz", "Internetový odkaz", ["editorLinkTitleIcon"]);
    } else {
      title.textContent = "Internetový odkaz";
    }

    const textLabel = document.createElement("label");
    textLabel.textContent = "Text odkazu";
    odkazTextInput = document.createElement("textarea");
    odkazTextInput.rows = 1;
    odkazTextInput.placeholder = "např. OpenAI";
    odkazTextInput.autocomplete = "one-time-code";
    odkazTextInput.setAttribute("data-form-type", "other");
    odkazTextInput.setAttribute("data-lpignore", "true");
    textLabel.append(odkazTextInput);

    const urlLabel = document.createElement("label");
    urlLabel.textContent = "Internetová adresa";
    odkazUrlInput = document.createElement("textarea");
    odkazUrlInput.rows = 1;
    odkazUrlInput.placeholder = "https://example.com";
    odkazUrlInput.autocomplete = "one-time-code";
    odkazUrlInput.inputMode = "url";
    odkazUrlInput.setAttribute("data-form-type", "other");
    odkazUrlInput.setAttribute("data-lpignore", "true");
    urlLabel.append(odkazUrlInput);

    const actions = document.createElement("div");
    actions.className = "editorLinkActions";

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.textContent = "Zrušit";

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "primary lubaHasIcon";
    if (window.LubaNoteIcons?.nastavObsahSIkonou) {
      window.LubaNoteIcons.nastavObsahSIkonou(saveButton, "odkaz", "Vložit", ["editorLinkActionIcon"]);
    } else {
      saveButton.textContent = "Vložit";
    }

    actions.append(cancelButton, saveButton);
    dialog.append(title, textLabel, urlLabel, actions);
    odkazModal.append(dialog);
    document.body.append(odkazModal);

    const zavri = () => {
      odkazModal.hidden = true;
    };

    const uloz = () => {
      const ok = core()?.nastavOdkaz?.(odkazUrlInput.value, odkazTextInput.value);
      if (!ok) {
        zobrazToast("Editor V2: zadej platnou internetovou adresu", true);
        return;
      }
      zavri();
      obnovToolbar();
    };

    cancelButton.addEventListener("click", zavri);
    saveButton.addEventListener("click", uloz);
    odkazModal.addEventListener("click", (event) => {
      if (event.target === odkazModal) zavri();
    });
    odkazTextInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        odkazUrlInput.focus();
      }
    });
    odkazUrlInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        uloz();
      }
    });
  }

  function otevriV2OdkazModal() {
    const api = core();
    if (!api?.ziskejInfoOdkazu || !api?.nastavOdkaz) {
      zobrazToast("Editor V2: odkazy nejsou dostupné", true);
      return;
    }

    api.zachytAktualniVyber?.();
    const info = api.ziskejInfoOdkazu() || {};
    if (info.viceBloku) {
      zobrazToast("Editor V2: odkaz zatím označ jen v jednom odstavci", true);
      return;
    }
    vytvorV2OdkazModal();

    const vybranyText = String(info.text || "");
    odkazTextInput.value = vybranyText;
    odkazUrlInput.value = String(info.url || "");

    if (!odkazUrlInput.value && /^(https?:\/\/|www\.)/i.test(vybranyText.trim())) {
      odkazUrlInput.value = vybranyText.trim();
    }

    odkazModal.hidden = false;
    requestAnimationFrame(() => {
      if (vybranyText) odkazUrlInput.focus();
      else odkazTextInput.focus();
    });
  }

  function obnovToolbar() {
    if (!aktivni) return;
    const stav = core()?.ziskejStavFormatu?.();
    if (!stav) return;

    const velikost = document.getElementById("tlacitkoVelikostPisma");
    if (velikost) velikost.textContent = String(stav.velikost ?? "–");

    [
      ["tlacitkoTucne", "tucne"],
      ["tlacitkoKurziva", "kurziva"],
      ["tlacitkoPodtrzeni", "podtrzeni"]
    ].forEach(([id, klic]) => {
      const button = document.getElementById(id);
      if (!button) return;
      const hodnota = stav[klic];
      button.classList.toggle("active", hodnota === "on");
      button.classList.toggle("lnV2Mixed", hodnota === "mix");
      button.setAttribute("aria-pressed", hodnota === "mix" ? "mixed" : (hodnota === "on" ? "true" : "false"));
    });

    const tlacitkoBullet = document.getElementById("tlacitkoBullet");
    if (tlacitkoBullet) {
      const seznam = stav.seznam || (stav.bullet === "on" ? "bullet" : stav.bullet);
      const aktivniSeznam = seznam === "bullet" || seznam === "ordered";
      tlacitkoBullet.classList.toggle("active", aktivniSeznam);
      tlacitkoBullet.classList.toggle("lnV2Mixed", seznam === "mix");
      tlacitkoBullet.classList.toggle("lnV2ListBullet", seznam === "bullet");
      tlacitkoBullet.classList.toggle("lnV2ListOrdered", seznam === "ordered");
      tlacitkoBullet.dataset.lnV2ListType = seznam;
      tlacitkoBullet.setAttribute(
        "aria-pressed",
        seznam === "mix" ? "mixed" : (aktivniSeznam ? "true" : "false")
      );
      const popisek = seznam === "ordered"
        ? "Číslovaný seznam"
        : (seznam === "bullet" ? "Odrážkový seznam" : "Seznam");
      tlacitkoBullet.setAttribute("aria-label", popisek);
      tlacitkoBullet.title = popisek;
    }

    const todoButton = document.getElementById("addTodoButton");
    if (todoButton) {
      const todo = stav.todo || "off";
      todoButton.classList.toggle("active", todo === "on");
      todoButton.classList.toggle("lnV2Mixed", todo === "mix");
      todoButton.setAttribute("aria-pressed", todo === "mix" ? "mixed" : (todo === "on" ? "true" : "false"));
      todoButton.title = todo === "on"
        ? "Vypnout TODO pro aktuální blok/výběr"
        : "Převést aktuální blok/výběr na TODO";
    }

    document.querySelectorAll("#editorPanelSeznam [data-ln-v2-seznam]").forEach((button) => {
      const seznam = stav.seznam || "off";
      const aktivniVolba = seznam !== "mix" && button.dataset.lnV2Seznam === seznam;
      button.classList.toggle("active", aktivniVolba);
      button.classList.toggle("lnV2Mixed", seznam === "mix");
      button.setAttribute("aria-pressed", seznam === "mix" ? "mixed" : (aktivniVolba ? "true" : "false"));
    });

    const stylTextu = stav.stylTextu || "div";
    const tlacitkoNadpis = document.getElementById("tlacitkoNadpis");
    if (tlacitkoNadpis) {
      tlacitkoNadpis.textContent = ["h1", "h2", "h3"].includes(stylTextu) ? stylTextu.toUpperCase() : "H";
      tlacitkoNadpis.classList.toggle("active", ["h1", "h2", "h3"].includes(stylTextu));
      tlacitkoNadpis.classList.toggle("lnV2Mixed", stylTextu === "mix");
    }

    document.querySelectorAll("#editorPanelStyl .editorStylTextu[data-styl]").forEach((button) => {
      const aktivniStyl = stylTextu !== "mix" && button.dataset.styl === stylTextu;
      button.classList.toggle("active", aktivniStyl);
      button.classList.toggle("lnV2Mixed", stylTextu === "mix");
      button.setAttribute("aria-pressed", stylTextu === "mix" ? "mixed" : (aktivniStyl ? "true" : "false"));
    });

    const odkazButton = document.getElementById("tlacitkoVlozitOdkaz");
    if (odkazButton) {
      const maOdkaz = Boolean(stav.odkaz && stav.odkaz !== "zaklad" && stav.odkaz !== "mix");
      odkazButton.classList.toggle("active", maOdkaz);
      odkazButton.classList.toggle("lnV2Mixed", stav.odkaz === "mix");
      odkazButton.setAttribute("aria-pressed", stav.odkaz === "mix" ? "mixed" : (maOdkaz ? "true" : "false"));
    }

    const textColorLine = document.querySelector("#textColorButton .textColorLine");
    if (textColorLine) {
      textColorLine.style.backgroundColor = stav.barva && stav.barva !== "mix" && stav.barva !== "zaklad"
        ? stav.barva
        : "";
    }

    const zarovnani = stav.zarovnani || "left";
    document.querySelectorAll("#editorPanelZarovnani .editorZarovnaniTextu[data-zarovnani]").forEach((button) => {
      const aktivniZarovnani = zarovnani !== "mix" && button.dataset.zarovnani === zarovnani;
      button.classList.toggle("active", aktivniZarovnani);
      button.classList.toggle("lnV2Mixed", zarovnani === "mix");
      button.setAttribute("aria-pressed", zarovnani === "mix" ? "mixed" : (aktivniZarovnani ? "true" : "false"));
    });
  }

  function pozicujV2PanelSeznamu() {
    const panel = document.getElementById("editorPanelSeznam");
    const spoustec = document.getElementById("tlacitkoBullet");
    const horniLista = spoustec?.closest(".editorTopBar");
    if (!panel || !spoustec || !horniLista) return;

    requestAnimationFrame(() => {
      const listaRect = horniLista.getBoundingClientRect();
      const spoustecRect = spoustec.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const okraj = 6;
      const stred = spoustecRect.left - listaRect.left + spoustecRect.width / 2;
      let vlevo = stred - panelRect.width / 2;
      vlevo = Math.max(okraj, Math.min(vlevo, listaRect.width - panelRect.width - okraj));
      const sipkaX = Math.max(16, Math.min(stred - vlevo, panelRect.width - 16));
      panel.style.left = `${vlevo}px`;
      panel.style.setProperty("--panel-sipka-x", `${sipkaX}px`);
    });
  }

  function otevriV2SeznamPanel() {
    const api = core();
    if (!api) return;
    api.zachytAktualniVyber?.();
    prepniPanel("editorPanelSeznam");
    if (!document.getElementById("editorPanelSeznam")?.hidden) {
      pozicujV2PanelSeznamu();
    }
    obnovToolbar();
  }

  function zavriPanelyFormatu() {
    ["editorPanelVelikost", "textColorPanel", "textColorPalette", "editorPanelStyl", "editorPanelZarovnani", "editorPanelSeznam"].forEach((id) => {
      const panel = document.getElementById(id);
      if (panel) panel.hidden = true;
    });
  }

  function prepniPanel(id) {
    const panel = document.getElementById(id);
    if (!panel) return;
    const budeOtevreny = panel.hidden;
    zavriPanelyFormatu();
    panel.hidden = !budeOtevreny;
  }

  function zajistiV2VolbyToolbaru() {
    const panelVelikost = document.querySelector("#editorPanelVelikost .editorPanelScroll");
    if (panelVelikost && !panelVelikost.querySelector("[data-ln-v2-zaklad-velikost]")) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "editorPanelVolba editorVelikostPisma lnV2OnlyControl";
      button.dataset.velikost = "zaklad";
      button.dataset.lnV2ZakladVelikost = "1";
      button.textContent = "Základ";
      panelVelikost.prepend(button);
    }

    if (!document.getElementById("editorPanelSeznam")) {
      const soused = document.getElementById("editorPanelZarovnani");
      const panel = document.createElement("div");
      panel.id = "editorPanelSeznam";
      panel.className = "editorToolbarPanel editorToolbarPanelSeznam";
      panel.hidden = true;
      panel.setAttribute("role", "group");
      panel.setAttribute("aria-label", "Typ seznamu");
      panel.innerHTML = `
        <button type="button" class="editorPanelVolba editorPanelSeznamVolba" data-ln-v2-seznam="bullet" aria-label="Odrážkový seznam" title="Odrážkový seznam">•</button>
        <button type="button" class="editorPanelVolba editorPanelSeznamVolba" data-ln-v2-seznam="ordered" aria-label="Číslovaný seznam" title="Číslovaný seznam">1.</button>
        <button type="button" class="editorPanelVolba editorPanelSeznamVolba editorPanelSeznamText" data-ln-v2-seznam="off" aria-label="Bez seznamu" title="Bez seznamu">Text</button>
      `;
      soused?.parentNode?.insertBefore(panel, soused.nextSibling);
    }

    const panelBarva = document.getElementById("textColorPanel");
    if (panelBarva && !panelBarva.querySelector("[data-ln-v2-reset-text-color]")) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "lnV2TextColorReset lnV2OnlyControl";
      button.dataset.textColor = "zaklad";
      button.dataset.lnV2ResetTextColor = "1";
      button.setAttribute("aria-label", "Výchozí barva textu");
      button.textContent = "A↺";
      panelBarva.prepend(button);
    }
  }

  function nastavOchranuUi(_zapnout) {
    // Název a metadata zůstávají editovatelná hlavním UI; textový obsah vlastní pouze Core V2.
    modalTitle.removeAttribute("aria-readonly");
    if (puvodniTitleContenteditable !== null) {
      modalTitle.setAttribute("contenteditable", puvodniTitleContenteditable);
      puvodniTitleContenteditable = null;
    }
  }

  function ziskejObsahProProdukci() {
    if (!aktivni) return null;
    const api = core();
    if (!api?.exportujHtml || !api?.exportujTodos || !api?.exportujProstyText) {
      return null;
    }

    const model = api.ziskejModel?.();
    const bloky = Array.isArray(model?.bloky) ? model.bloky : [];
    const todos = api.exportujTodos() || [];
    const pocetTodo = bloky.filter((blok) => blok?.typ === "todo").length;
    const pocetOstatnich = bloky.filter((blok) => blok?.typ !== "todo").length;
    const maTodo = pocetTodo > 0;
    const pouzeTodo = maTodo && pocetOstatnich === 0;
    const maSmisenyObsah = maTodo && pocetOstatnich > 0;
    const maMedia = bloky.some((blok) =>
      blok?.typ === "obrazek" ||
      (Array.isArray(blok?.obrazky) && blok.obrazky.length > 0)
    );

    /* 🔒 V2.21 – smíšený dokument je kanonicky uložen v richContent v přesném
       pořadí bloků. note.todos zůstává jako kompatibilní zrcadlo pro Planner,
       hledání a starší části aplikace. Pouze čisté TODO zachovává starý binární
       formát s prázdným richContent. */
    return {
      richContent: pouzeTodo ? "" : String(api.exportujHtml() || ""),
      note: pouzeTodo ? "" : String(api.exportujProstyText() || ""),
      todos: Array.isArray(todos) ? todos.map((todo) => ({ ...todo })) : [],
      maTodo,
      pouzeTodo,
      maSmisenyObsah,
      maMedia
    };
  }

  function dokoncModelPredExterniAkci() {
    if (!aktivni) return false;
    if (core()?.dokoncImePredExterniAkci?.() === false) return false;
    return Boolean(ziskejObsahProProdukci());
  }

  function deaktivuj() {
    if (!aktivni) return;
    skryjV2SelectionMenu();
    core()?.zavriVHostu?.();
    aktivni = false;
    aktivniNoteId = null;
    taskModal.classList.remove("editorCoreV2Mode");
    if (hostitel) hostitel.hidden = true;
    nastavOchranuUi(false);
    zavriPanelyFormatu();
    if (odkazModal) odkazModal.hidden = true;
    zavriV2CropModal();
  }

  function importujObsahDoModelu({ richContent = "", note = "", todos = [] } = {}) {
    const api = core();
    if (!api?.importujHtml || !api?.importujTodos) return { ok: false, nepodporovane: ["Core V2 API"] };

    const html = String(richContent || "");
    const prostyText = String(note || "");
    const todoData = Array.isArray(todos) ? todos : [];
    const maSmisenyV2Obsah = html.includes("data-lubanote-v2-todo");

    /*
     * HARD-CUT 528 – jediný editor neznamená zahodit historická data.
     * Starší LubaNote ukládala text/richContent a TODO ve dvou oddělených
     * polích. Core V2 je teď jediný runtime, takže při prvním otevření
     * musíme oba staré datové proudy převést do JEDNOHO V2 modelu.
     *
     * Pokud richContent už obsahuje V2 TODO bloky, `todos` je pouze
     * kompatibilní zrcadlo a nesmí se přidat podruhé.
     */
    if (maSmisenyV2Obsah) return api.importujHtml(html, prostyText);

    const maTextovyObsah = Boolean(html.trim() || prostyText.trim());
    const maLegacyTodo = todoData.length > 0;

    if (!maLegacyTodo) {
      return api.importujHtml(html, prostyText);
    }

    const todoVysledek = api.importujTodos(todoData);
    if (!todoVysledek?.ok || !todoVysledek?.model) return todoVysledek;

    if (!maTextovyObsah) {
      return todoVysledek;
    }

    const textVysledek = api.importujHtml(html, prostyText);
    if (!textVysledek?.ok || !textVysledek?.model) return textVysledek;

    return {
      ok: true,
      nepodporovane: [],
      model: {
        ...textVysledek.model,
        bloky: [
          ...(Array.isArray(textVysledek.model.bloky) ? textVysledek.model.bloky : []),
          ...(Array.isArray(todoVysledek.model.bloky) ? todoVysledek.model.bloky : [])
        ]
      }
    };
  }

  function otevriObsah({
    noteId = "",
    richContent = "",
    note = "",
    todos = [],
    plannedItems = [],
    zachovatPuvodniOtisk = false
  } = {}) {
    if (pozastavAktivaci || !jeEditorOtevreny()) return false;

    const api = core();
    if (!api?.otevriVHostu) {
      zobrazToast("Editor Core V2 není dostupný.", true);
      return false;
    }

    vytvorPomocneUi();
    zajistiV2VolbyToolbaru();

    const importVysledek = importujObsahDoModelu({ richContent, note, todos });
    if (!importVysledek?.ok || !importVysledek?.model) {
      const prvky = Array.isArray(importVysledek?.nepodporovane) && importVysledek.nepodporovane.length
        ? importVysledek.nepodporovane.join(", ")
        : "neznámý obsah";
      zobrazToast(`Core V2 odmítl obsah bez změny dat (${prvky}).`, true);
      window.LubaNoteStartupDiag?.zapis?.("CORE V2 IMPORT BLOCK", prvky);
      return false;
    }

    if (aktivni) deaktivuj();

    aktivni = true;
    aktivniNoteId = String(noteId || ziskejNoteId() || "nova-poznamka");
    taskModal.classList.add("editorCoreV2Mode");
    hostitel.hidden = false;
    nastavOchranuUi(true);

    if (!api.otevriVHostu(hostitel, importVysledek.model)) {
      deaktivuj();
      zobrazToast("Editor Core V2 se nepodařilo připojit.", true);
      return false;
    }

    const naplanovaneTodo = new Set(
      (Array.isArray(plannedItems) ? plannedItems : [])
        .filter((item) => item?.sourceType === "todo" && item?.sourceTodoId)
        .map((item) => String(item.sourceTodoId))
    );
    for (const todo of api.ziskejAktivniTodos?.() || []) {
      api.nastavTodoNaplanovane?.(todo.id, naplanovaneTodo.has(String(todo.id)));
    }

    const poziceOtevreni = window.LubaNoteEditorOpenPreferences?.ziskejPozici?.() === "end" ? "end" : "start";
    api.nastavPoziciOtevreni?.(poziceOtevreni);
    obnovToolbar();

    if (!zachovatPuvodniOtisk) {
      queueMicrotask(() => window.LubaNoteAktualizujPuvodniOtiskEditoruProV2?.());
    }
    return true;
  }

  function vlozPripravenyObrazek(data = {}) {
    if (!aktivni) return false;
    const api = core();
    if (!api?.vlozObrazek) {
      zobrazToast("Editor V2: Image Block není dostupný", true);
      return false;
    }

    const vlozeno = api.vlozObrazek({
      dataUrl: data.dataUrl || data.zdroj || "",
      fileName: data.fileName || "",
      alt: data.alt || "",
      attachmentId: data.attachmentId || "",
      velikost: data.velikost || "prizpusobit",
      zarovnani: data.zarovnani || "stred"
    });

    if (vlozeno) {
      obnovToolbar();
      zobrazToast("Obrázek vložen");
    }
    return Boolean(vlozeno);
  }

  function zavriV2CropModal() {
    if (!cropModal) return;
    cropModal.hidden = true;
    cropModal.dataset.obrazekId = "";
    cropModal._lnV2Crop = null;
  }

  function vytvorV2CropModalPokudChybi() {
    if (cropModal) return;

    cropModal = document.createElement("div");
    cropModal.className = "lnV2CropModal";
    cropModal.hidden = true;
    cropModal.innerHTML = `
      <div class="lnV2CropDialog" role="dialog" aria-modal="true" aria-label="Oříznout obrázek">
        <div class="lnV2CropHeader">
          <h3>Oříznout obrázek</h3>
          <button type="button" class="lnV2CropClose" aria-label="Zavřít">×</button>
        </div>
        <div class="lnV2CropHelp">Tažením uvnitř výběr posuneš, rohy mění velikost ořezu.</div>
        <div class="lnV2CropStage" data-v2-crop-stage>
          <canvas class="lnV2CropCanvas" data-v2-crop-canvas></canvas>
          <div class="lnV2CropShade lnV2CropShadeTop"></div>
          <div class="lnV2CropShade lnV2CropShadeRight"></div>
          <div class="lnV2CropShade lnV2CropShadeBottom"></div>
          <div class="lnV2CropShade lnV2CropShadeLeft"></div>
          <div class="lnV2CropSelection" data-v2-crop-selection>
            <span data-v2-crop-handle="nw"></span>
            <span data-v2-crop-handle="ne"></span>
            <span data-v2-crop-handle="sw"></span>
            <span data-v2-crop-handle="se"></span>
          </div>
        </div>
        <div class="lnV2CropStatus" data-v2-crop-status></div>
        <div class="lnV2CropActions">
          <button type="button" class="choiceDialogSecondary" data-v2-crop-reset>Celý obrázek</button>
          <button type="button" class="choiceDialogSecondary" data-v2-crop-cancel>Zrušit</button>
          <button type="button" class="choiceDialogSave" data-v2-crop-save>Oříznout</button>
        </div>
      </div>
    `;

    document.body.appendChild(cropModal);
    cropStage = cropModal.querySelector("[data-v2-crop-stage]");
    cropCanvas = cropModal.querySelector("[data-v2-crop-canvas]");
    cropVyber = cropModal.querySelector("[data-v2-crop-selection]");
    cropStav = cropModal.querySelector("[data-v2-crop-status]");

    const prekresliVyber = () => {
      const stav = cropModal?._lnV2Crop;
      if (!stav || !cropVyber || !cropStage) return;
      const { x, y, w, h } = stav.rect;
      cropVyber.style.left = `${x}px`;
      cropVyber.style.top = `${y}px`;
      cropVyber.style.width = `${w}px`;
      cropVyber.style.height = `${h}px`;

      const top = cropModal.querySelector(".lnV2CropShadeTop");
      const right = cropModal.querySelector(".lnV2CropShadeRight");
      const bottom = cropModal.querySelector(".lnV2CropShadeBottom");
      const left = cropModal.querySelector(".lnV2CropShadeLeft");
      const sw = stav.displayW;
      const sh = stav.displayH;
      if (top) Object.assign(top.style, { left: "0px", top: "0px", width: `${sw}px`, height: `${y}px` });
      if (bottom) Object.assign(bottom.style, { left: "0px", top: `${y + h}px`, width: `${sw}px`, height: `${Math.max(0, sh - y - h)}px` });
      if (left) Object.assign(left.style, { left: "0px", top: `${y}px`, width: `${x}px`, height: `${h}px` });
      if (right) Object.assign(right.style, { left: `${x + w}px`, top: `${y}px`, width: `${Math.max(0, sw - x - w)}px`, height: `${h}px` });

      if (cropStav) {
        const pxW = Math.max(1, Math.round((w / sw) * stav.naturalW));
        const pxH = Math.max(1, Math.round((h / sh) * stav.naturalH));
        cropStav.textContent = `${pxW} × ${pxH} px`;
      }
    };

    const resetVyber = () => {
      const stav = cropModal?._lnV2Crop;
      if (!stav) return;
      stav.rect = { x: 0, y: 0, w: stav.displayW, h: stav.displayH };
      prekresliVyber();
    };

    cropModal._lnV2Prekresli = prekresliVyber;
    cropModal._lnV2Reset = resetVyber;

    cropModal.querySelector(".lnV2CropClose")?.addEventListener("click", zavriV2CropModal);
    cropModal.querySelector("[data-v2-crop-cancel]")?.addEventListener("click", zavriV2CropModal);
    cropModal.querySelector("[data-v2-crop-reset]")?.addEventListener("click", resetVyber);
    cropModal.addEventListener("click", (event) => {
      if (event.target === cropModal) zavriV2CropModal();
    });

    let drag = null;
    const zacniDrag = (event) => {
      const stav = cropModal?._lnV2Crop;
      if (!stav || event.pointerType === "mouse" && event.button !== 0) return;
      const handle = event.target.closest?.("[data-v2-crop-handle]")?.dataset.v2CropHandle || "move";
      drag = {
        pointerId: event.pointerId,
        handle,
        startX: event.clientX,
        startY: event.clientY,
        rect: { ...stav.rect }
      };
      cropVyber?.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    };

    cropVyber?.addEventListener("pointerdown", zacniDrag);
    cropVyber?.addEventListener("pointermove", (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const stav = cropModal?._lnV2Crop;
      if (!stav) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      const minW = Math.min(48, stav.displayW);
      const minH = Math.min(48, stav.displayH);
      let { x, y, w, h } = drag.rect;

      if (drag.handle === "move") {
        x = Math.max(0, Math.min(stav.displayW - w, x + dx));
        y = Math.max(0, Math.min(stav.displayH - h, y + dy));
      } else {
        let x2 = x + w;
        let y2 = y + h;
        if (drag.handle.includes("w")) x = Math.max(0, Math.min(x2 - minW, x + dx));
        if (drag.handle.includes("e")) x2 = Math.min(stav.displayW, Math.max(x + minW, x2 + dx));
        if (drag.handle.includes("n")) y = Math.max(0, Math.min(y2 - minH, y + dy));
        if (drag.handle.includes("s")) y2 = Math.min(stav.displayH, Math.max(y + minH, y2 + dy));
        w = x2 - x;
        h = y2 - y;
      }

      stav.rect = { x, y, w, h };
      prekresliVyber();
      event.preventDefault();
    });

    const konecDrag = (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      try { cropVyber?.releasePointerCapture?.(event.pointerId); } catch (_error) {}
      drag = null;
    };
    cropVyber?.addEventListener("pointerup", konecDrag);
    cropVyber?.addEventListener("pointercancel", konecDrag);

    cropModal.querySelector("[data-v2-crop-save]")?.addEventListener("click", () => {
      const stav = cropModal?._lnV2Crop;
      if (!stav?.img || !stav.rect || !stav.obrazekId) return;
      const { rect, displayW, displayH, naturalW, naturalH } = stav;
      const sx = Math.max(0, Math.round((rect.x / displayW) * naturalW));
      const sy = Math.max(0, Math.round((rect.y / displayH) * naturalH));
      const sw = Math.max(1, Math.min(naturalW - sx, Math.round((rect.w / displayW) * naturalW)));
      const sh = Math.max(1, Math.min(naturalH - sy, Math.round((rect.h / displayH) * naturalH)));

      if (sx === 0 && sy === 0 && sw === naturalW && sh === naturalH) {
        zobrazToast("Ořez odpovídá celému obrázku");
        zavriV2CropModal();
        return;
      }

      try {
        const vystup = document.createElement("canvas");
        vystup.width = sw;
        vystup.height = sh;
        const ctx = vystup.getContext("2d", { alpha: true });
        if (!ctx) throw new Error("Canvas není dostupný");
        ctx.drawImage(stav.img, sx, sy, sw, sh, 0, 0, sw, sh);

        const zdroj = String(stav.zdroj || "");
        const shoda = zdroj.match(/^data:(image\/(?:png|jpeg|jpg|webp));/i);
        let mime = shoda?.[1]?.toLowerCase() || "image/png";
        if (mime === "image/jpg") mime = "image/jpeg";
        const dataUrl = vystup.toDataURL(mime, mime === "image/jpeg" || mime === "image/webp" ? 0.92 : undefined);
        const ulozeno = core()?.nastavOrezanyZdrojObrazku?.(stav.obrazekId, dataUrl);
        if (!ulozeno) throw new Error("Model obrázku ořez nepřijal");

        zavriV2CropModal();
        obnovToolbar();
        zobrazToast(`Obrázek oříznut na ${sw} × ${sh} px`);
      } catch (error) {
        console.error("V2 crop: ořez se nepodařil", error);
        zobrazToast("Editor V2: tento obrázek se nepodařilo oříznout", true);
      }
    });
  }

  function otevriV2CropObrazku(obrazekId) {
    /* FIX 455 – crop modal nesmí zůstat pod vlastní klávesnicí. */
    try {
      window.LubaNoteKeyboard?.skryj?.();
      const otevritKlavesnici = document.getElementById("lubaKeyboardOpen");
      if (otevritKlavesnici) otevritKlavesnici.hidden = true;
      document.activeElement?.blur?.();
    } catch (_error) {}
    const api = core();
    const data = api?.ziskejNastaveniObrazku?.(obrazekId);
    if (!data?.zdroj) {
      zobrazToast("Editor V2: zdroj obrázku není dostupný", true);
      return;
    }

    vytvorV2CropModalPokudChybi();
    if (!cropModal || !cropStage || !cropCanvas) return;

    const img = new Image();
    if (!String(data.zdroj).startsWith("data:") && !String(data.zdroj).startsWith("blob:")) {
      img.crossOrigin = "anonymous";
    }

    cropModal.hidden = false;
    cropModal.dataset.obrazekId = String(obrazekId || "");
    cropStav.textContent = "Načítám obrázek…";
    cropVyber.hidden = true;

    img.onload = () => {
      const naturalW = img.naturalWidth || img.width;
      const naturalH = img.naturalHeight || img.height;
      if (!naturalW || !naturalH) {
        zobrazToast("Editor V2: obrázek nemá platné rozměry", true);
        zavriV2CropModal();
        return;
      }

      const maxW = Math.max(220, Math.min(window.innerWidth - 48, 720));
      const maxH = Math.max(220, Math.min(window.innerHeight * 0.58, 620));
      const meritko = Math.min(maxW / naturalW, maxH / naturalH, 1.6);
      const displayW = Math.max(1, Math.round(naturalW * meritko));
      const displayH = Math.max(1, Math.round(naturalH * meritko));

      cropStage.style.width = `${displayW}px`;
      cropStage.style.height = `${displayH}px`;
      cropCanvas.width = displayW;
      cropCanvas.height = displayH;
      const ctx = cropCanvas.getContext("2d", { alpha: true });
      ctx?.clearRect(0, 0, displayW, displayH);
      ctx?.drawImage(img, 0, 0, displayW, displayH);

      const okrajX = Math.min(24, Math.round(displayW * 0.08));
      const okrajY = Math.min(24, Math.round(displayH * 0.08));
      cropModal._lnV2Crop = {
        obrazekId: String(obrazekId || ""),
        zdroj: data.zdroj,
        img,
        naturalW,
        naturalH,
        displayW,
        displayH,
        rect: {
          x: okrajX,
          y: okrajY,
          w: Math.max(1, displayW - (okrajX * 2)),
          h: Math.max(1, displayH - (okrajY * 2))
        }
      };
      cropVyber.hidden = false;
      cropModal._lnV2Prekresli?.();
    };

    img.onerror = () => {
      zobrazToast("Editor V2: obrázek se nepodařilo načíst pro ořez", true);
      zavriV2CropModal();
    };

    img.src = data.zdroj;
  }

  function zajistiV2CropRadekVNastaveni() {
    if (!nastavovaciObrazekId) return;
    const modal = document.querySelector(".choiceModal:not([hidden])");
    if (!modal) return;
    const titul = modal.querySelector(".choiceDialogTitle")?.textContent?.trim();
    if (titul !== "Obrázek") return;
    const options = modal.querySelector(".choiceDialogOptions");
    const save = options?.querySelector(".choiceDialogSave");
    if (!options || !save || options.querySelector("[data-v2-crop-open]")) return;

    const tlacitko = document.createElement("button");
    tlacitko.type = "button";
    tlacitko.className = "choiceDialogOption choiceDialogSettingRow";
    tlacitko.dataset.v2CropOpen = nastavovaciObrazekId;
    tlacitko.innerHTML = '<span class="choiceDialogSettingLabel">Oříznout</span><span class="choiceDialogSettingValue">Upravit výřez</span>';
    tlacitko.addEventListener("click", () => {
      const id = String(tlacitko.dataset.v2CropOpen || "");
      if (!id) return;

      /*
       * PATCH 457 – OŘEZ MUSÍ NEJDŘÍV ULOŽIT ROZPRACOVANÉ NASTAVENÍ.
       * -----------------------------------------------------------
       * Nastavovací modal drží změnu velikosti/zarovnání jen ve své pracovní
       * kopii, dokud uživatel nestiskne „Uložit“. Když se dřív rovnou kleplo
       * na „Oříznout“, modal jsme zavřeli a crop běžel nad starým modelem.
       * Po ořezu se proto velikost i zarovnání tvářily jako ztracené.
       *
       * Použijeme přímo existující Uložit tlačítko modalu – jeho closure má
       * jediná správná aktuální pracovniHodnoty. Až po jeho dokončení (další
       * task po async handleru) otevřeme crop nad už aktualizovaným modelem.
       */
      const ulozit = options.querySelector(".choiceDialogSave");
      tlacitko.disabled = true;
      nastavovaciObrazekId = "";

      if (ulozit) {
        ulozit.click();
        setTimeout(() => otevriV2CropObrazku(id), 0);
        return;
      }

      try { window.zavriVyberovyModal?.(); } catch (_error) {}
      otevriV2CropObrazku(id);
    });
    options.insertBefore(tlacitko, save);
  }

  function sledujV2NastaveniObrazku() {
    const modal = document.querySelector(".choiceModal");
    if (!modal || observerNastaveniObrazku) return;
    observerNastaveniObrazku = new MutationObserver(() => {
      if (modal.hidden) {
        if (!cropModal || cropModal.hidden) nastavovaciObrazekId = "";
        return;
      }
      zajistiV2CropRadekVNastaveni();
    });
    observerNastaveniObrazku.observe(modal, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
  }

  function otevriV2NastaveniObrazku(obrazekId) {
    const api = core();
    const nastaveni = api?.ziskejNastaveniObrazku?.(obrazekId);
    if (!nastaveni) {
      zobrazToast("Editor V2: obrázek už není dostupný", true);
      return;
    }

    if (typeof window.otevriNastavovaciModal !== "function") {
      zobrazToast("Editor V2: nastavení obrázku není dostupné", true);
      return;
    }

    nastavovaciObrazekId = String(obrazekId || "");
    sledujV2NastaveniObrazku();

    /*
     * FIX 455 – nastavení obrázku je plnohodnotný LubaNote modal.
     * LubaKeyboard je fixed nad aplikací a její z-index je vyšší než modal,
     * takže bez explicitního skrytí zakryla spodní část včetně Uložit.
     * Selection/model už obrázek drží podle ID, takže tady klávesnici můžeme
     * bezpečně zavřít ještě před otevřením modalu.
     */
    try {
      window.LubaNoteKeyboard?.skryj?.();
      const otevritKlavesnici = document.getElementById("lubaKeyboardOpen");
      if (otevritKlavesnici) otevritKlavesnici.hidden = true;
      document.activeElement?.blur?.();
    } catch (_error) {}

    window.otevriNastavovaciModal({
      nadpis: "Obrázek",
      polozky: [
        {
          klic: "velikost",
          popisek: "Velikost",
          hodnota: nastaveni.velikost,
          zobrazeni: popisekVelikostiObrazku(nastaveni.velikost),
          moznosti: moznostiVelikostiObrazku,
          vlastniVstup: {
            spoustecHodnota: "vlastni",
            nadpis: "Vlastní velikost",
            popisek: "Šířka obrázku v procentech",
            min: 10,
            max: 100,
            krok: 1,
            vychoziHodnota: 50,
            vytvorZobrazeni: (hodnota) => `${hodnota} %`
          }
        },
        {
          klic: "zarovnani",
          popisek: "Zarovnání",
          hodnota: nastaveni.zarovnani,
          zobrazeni: popisekZarovnaniObrazku(nastaveni.zarovnani),
          moznosti: moznostiZarovnaniObrazku
        }
      ],
      poUlozeni: (hodnoty) => {
        const zmeneno = api?.nastavNastaveniObrazku?.(obrazekId, {
          velikost: hodnoty.velikost,
          zarovnani: hodnoty.zarovnani
        });
        if (!zmeneno) {
          zobrazToast("Editor V2: nastavení obrázku se nepodařilo uložit", true);
          return;
        }
        obnovToolbar();
        zobrazToast("Nastavení obrázku uloženo");
      }
    });

    requestAnimationFrame(() => {
      sledujV2NastaveniObrazku();
      zajistiV2CropRadekVNastaveni();
    });
  }

  function vlozInterniOdkazZAutocomplete(poznamka, spoust) {
    if (!aktivni) return false;
    const vlozeno = core()?.vlozInterniOdkazZAutocomplete?.(poznamka, spoust);
    if (vlozeno) obnovToolbar();
    return Boolean(vlozeno);
  }

  function ziskejPlanovaciKontext() {
    if (!aktivni) return null;
    core()?.zachytAktualniVyber?.();
    return core()?.ziskejPlanovaciKontext?.() || null;
  }

  function obalPlanovaciVyber(plannedItemId) {
    if (!aktivni) return false;
    const ok = core()?.obalPlanovaciVyber?.(plannedItemId) === true;
    if (ok) {
      obnovToolbar();
      dokoncModelPredExterniAkci();
    }
    return ok;
  }

  function zpracujToolbarCapture(event) {
    if (!aktivni) return;
    const cil = event.target.closest("button, [data-velikost], [data-text-color], [data-highlight-color], [data-highlight-remove]");
    if (!cil || !taskModal.contains(cil)) return;

    const id = cil.id || "";

    if (id === "editorBackButton") {
      zapisV2Stabilitu("SAVE_CAPTURE_START", `type=${event.type}`);
      // Nezastavujeme původní save handler. Jen mu ještě v capture fázi
      // připravíme kanonický V2 obsah do produkční save vrstvy.
      const syncOk = dokoncModelPredExterniAkci();
      zapisV2Stabilitu("SAVE_CAPTURE_SYNC", `ok=${syncOk}`);
      if (!syncOk) {
        event.preventDefault();
        event.stopImmediatePropagation();
        zobrazToast("Uložení zastaveno: V2 obsah se nepodařilo bezpečně převést.", true);
      }
      return;
    }

    if (id === "editorToolbarToggle") {
      return;
    }

    /* V2.22 / 401 – Otevřít a Uložit jako už nejsou Core V2.
       Před předáním akce dokumentovému modulu připravíme kanonický V2 obsah
       do produkční vrstvy, ale click NEZASTAVUJEME. editorDocuments.js pak
       normálně otevře systémový výběr souboru / nabídku Uložit jako. */
    if (dokumentoveAkce.has(id)) {
      core()?.zachytAktualniVyber?.();
      zavriPanelyFormatu();

      if (!dokoncModelPredExterniAkci()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        zobrazToast("Dokumentová akce zastavena: V2 obsah se nepodařilo bezpečně převést.", true);
      }
      return;
    }

    if (id === "tlacitkoVelikostPisma") {
      event.preventDefault();
      event.stopImmediatePropagation();
      core()?.zachytAktualniVyber?.();
      prepniPanel("editorPanelVelikost");
      return;
    }

    if (cil.matches(".editorVelikostPisma[data-velikost]")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      core()?.zachytAktualniVyber?.();
      core()?.nastavVelikost?.(cil.dataset.velikost);
      document.getElementById("editorPanelVelikost").hidden = true;
      obnovToolbar();
      return;
    }

    if (id === "tlacitkoNadpis") {
      event.preventDefault();
      event.stopImmediatePropagation();
      core()?.zachytAktualniVyber?.();
      prepniPanel("editorPanelStyl");
      obnovToolbar();
      return;
    }

    if (cil.matches("#editorPanelStyl .editorStylTextu[data-styl]")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      core()?.nastavStylTextu?.(cil.dataset.styl || "div");
      document.getElementById("editorPanelStyl").hidden = true;
      obnovToolbar();
      return;
    }

    if (id === "tlacitkoZarovnaniTextu") {
      event.preventDefault();
      event.stopImmediatePropagation();
      core()?.zachytAktualniVyber?.();
      prepniPanel("editorPanelZarovnani");
      obnovToolbar();
      return;
    }

    if (cil.matches("#editorPanelZarovnani .editorZarovnaniTextu[data-zarovnani]")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      core()?.nastavZarovnani?.(cil.dataset.zarovnani || "left");
      document.getElementById("editorPanelZarovnani").hidden = true;
      obnovToolbar();
      return;
    }

    if (id === "textColorButton") {
      event.preventDefault();
      event.stopImmediatePropagation();
      core()?.zachytAktualniVyber?.();
      prepniPanel("textColorPanel");
      return;
    }

    if (cil.matches("#textColorPanel [data-text-color]")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      core()?.nastavBarvu?.("barva", cil.dataset.textColor || "zaklad");
      document.getElementById("textColorPanel").hidden = true;
      obnovToolbar();
      return;
    }

    if (id === "colorTaskButton") {
      event.preventDefault();
      event.stopImmediatePropagation();
      core()?.zachytAktualniVyber?.();
      prepniPanel("textColorPalette");
      return;
    }

    if (cil.matches("#textColorPalette [data-highlight-color]")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      core()?.nastavBarvu?.("pozadi", cil.dataset.highlightColor || "zaklad");
      document.getElementById("textColorPalette").hidden = true;
      obnovToolbar();
      return;
    }

    if (cil.matches("#textColorPalette [data-highlight-remove]")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      core()?.nastavBarvu?.("pozadi", "zaklad");
      document.getElementById("textColorPalette").hidden = true;
      obnovToolbar();
      return;
    }

    if (cil.matches(".ln-v2-obrazek .lubaNoteImageSettings[data-v2-image-settings]")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      otevriV2NastaveniObrazku(cil.dataset.v2ImageSettings);
      return;
    }

    if (id === "tlacitkoVlozitObrazek") {
      event.preventDefault();
      event.stopImmediatePropagation();
      core()?.zachytAktualniVyber?.();
      zavriPanelyFormatu();

      if (typeof window.vlozObrazekDoPoznamky !== "function") {
        zobrazToast("Editor V2: výběr obrázku není dostupný", true);
        return;
      }

      /*
       * FIX 454 – před plnoobrazovkovým LubaNote modalem Galerie/Fotoaparát
       * schováme vlastní klávesnici. LubaKeyboard má záměrně extrémně vysoký
       * z-index, takže bez toho překrývala choiceModal a modal vypadal
       * useknutě. Současně editor blur-neme až PO zachycení modelového výběru,
       * aby se klávesnice sama znovu neotevřela během systémového file pickeru.
       *
       * editorMediaV2.js pak po kompresi předá připravený obrázek přímo tomuto
       * Bridge přes vlozPripravenyObrazek(), takže aktivní V2 model je jediný
       * zdroj pravdy.
       */
      try {
        window.LubaNoteKeyboard?.skryj?.();
        const otevritKlavesnici =
          document.getElementById("lubaKeyboardOpen");
        if (otevritKlavesnici) {
          otevritKlavesnici.hidden = true;
        }
      } catch (_error) {}

      try {
        document.activeElement?.blur?.();
      } catch (_error) {}

      requestAnimationFrame(() => {
        window.vlozObrazekDoPoznamky();
      });
      return;
    }

    if (id === "tlacitkoVlozitOdkaz") {
      event.preventDefault();
      event.stopImmediatePropagation();
      zavriPanelyFormatu();
      otevriV2OdkazModal();
      return;
    }

    if (id === "tlacitkoBullet") {
      event.preventDefault();
      event.stopImmediatePropagation();
      otevriV2SeznamPanel();
      return;
    }

    if (id === "planSelectionButton") {
      // Planner si selection převezme přes V2 model. Click nesmíme zastavit,
      // pouze předem zmrazíme aktuální modelový výběr.
      core()?.zachytAktualniVyber?.();
      zavriPanelyFormatu();
      return;
    }

    if (id === "addTodoButton") {
      event.preventDefault();
      event.stopImmediatePropagation();
      core()?.zachytAktualniVyber?.();
      zavriPanelyFormatu();
      core()?.pridejTodo?.();
      obnovToolbar();
      return;
    }

    if (cil.matches("#editorPanelSeznam [data-ln-v2-seznam]")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      core()?.nastavSeznam?.(cil.dataset.lnV2Seznam || "off");
      const panel = document.getElementById("editorPanelSeznam");
      if (panel) panel.hidden = true;
      obnovToolbar();
      return;
    }

    if (podporovaneAkce.has(id)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      core()?.zachytAktualniVyber?.();
      if (id === "tlacitkoZpet") core()?.undo?.();
      else if (id === "tlacitkoZnovu") core()?.redo?.();
      else if (id === "tlacitkoTucne") core()?.prepniFormat?.("tucne");
      else if (id === "tlacitkoKurziva") core()?.prepniFormat?.("kurziva");
      else if (id === "tlacitkoPodtrzeni") core()?.prepniFormat?.("podtrzeni");
      obnovToolbar();
      return;
    }

  }

  function jeBodUvnitřRozsahu(range, x, y) {
    try {
      return Array.from(range?.getClientRects?.() || []).some((rect) =>
        x >= rect.left - 4 && x <= rect.right + 4 && y >= rect.top - 4 && y <= rect.bottom + 4
      );
    } catch (_error) {
      return false;
    }
  }

  function zrusV2OznaceniKlikemMimo(event) {
    if (jeDesktopSelection || !aktivni || !hostitel?.contains(event.target)) return;
    if (event.target.closest?.("button, figure, .noteInternalLink, .plannedTextLink, .ln-v2-odkaz")) return;
    if (jeV2MoveInterakce(event)) return;

    const vyber = window.getSelection();
    const range = vyber?.rangeCount ? vyber.getRangeAt(0) : null;
    if (!range || range.collapsed || !jeV2SelectionRozsah(range)) return;
    if (jeBodUvnitřRozsahu(range, event.clientX, event.clientY)) return;

    if (core()?.zrusVyberNaBoduProSelectionMenu?.(event.clientX, event.clientY)) {
      skryjV2SelectionMenu();
      obnovToolbar();
    }
  }

  function zpracujKlikNaV2Odkaz(event) {
    if (!aktivni || !hostitel?.contains(event.target)) return;

    const odkazElement = event.target.closest?.(".ln-v2-odkaz[data-ln-v2-odkaz]");
    if (!odkazElement || !hostitel.contains(odkazElement)) return;

    /*
     * Když uživatel právě označuje text odkazu, necháme selection na pokoji.
     * Běžný tap s collapsed caretem ale funguje stejně jako v produkčním
     * LubaNote: otevře bezpečně normalizovanou http/https adresu.
     */
    const vyber = window.getSelection();
    if (vyber?.rangeCount && !vyber.isCollapsed) {
      const range = vyber.getRangeAt(0);
      try {
        if (range.intersectsNode(odkazElement)) return;
      } catch (_error) {}
    }

    const href = String(odkazElement.dataset.lnV2Odkaz || "").trim();
    if (!/^https?:\/\//i.test(href)) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    window.open(
      href,
      "_blank",
      "noopener,noreferrer"
    );
  }

  /*
   * FIX 434 – Android selection focus guard:
   * pointerdown na tlačítku nesmí přesunout focus z editoru na button, jinak
   * WebView skryje modré označení a následný selectionchange panel zavře.
   */
  selectionMenu?.addEventListener("pointerdown", (event) => {
    if (jeDesktopSelection || !aktivni || selectionMenu.dataset.lnV2Owner !== "1") return;
    const button = event.target.closest?.("button");
    if (!button || !selectionMenu.contains(button)) return;
    core()?.zachytAktualniVyber?.();
    event.preventDefault();
  }, true);

  selectionMenu?.addEventListener("click", (event) => {
    if (jeDesktopSelection) return;
    zpracujV2SelectionMenuAkci(event);
  }, true);

  document.addEventListener("touchend", (event) => {
    if (jeDesktopSelection || !aktivni || !hostitel?.contains(event.target)) return;
    zapisV2Stabilitu("TOUCHEND", `target=${event.target?.className || event.target?.tagName || "-"}`);
    if (jeV2MoveInterakce(event)) {
      potlacSelectionMenuKvuliMove();
      return;
    }
    if (event.target.closest?.("button, figure, .noteInternalLink, .plannedTextLink")) {
      v2PosledniTapSelection = null;
      return;
    }

    const dotyk = event.changedTouches?.[0];
    if (!dotyk) return;
    const ted = performance.now();
    const aktualni = { x: dotyk.clientX, y: dotyk.clientY, cas: ted };
    const predchozi = v2PosledniTapSelection;
    v2PosledniTapSelection = aktualni;

    if (!predchozi) return;
    if (ted - predchozi.cas > 360 || Math.hypot(aktualni.x - predchozi.x, aktualni.y - predchozi.y) > 34) return;

    v2PosledniTapSelection = null;
    zapisV2Stabilitu("DOUBLE_TAP_DETECTED", `x=${Math.round(aktualni.x)} y=${Math.round(aktualni.y)}`);
    setTimeout(() => {
      if (!aktivni) return;
      const vyber = window.getSelection();
      const range = vyber?.rangeCount ? vyber.getRangeAt(0) : null;
      if (range && jeV2SelectionRozsah(range) && !range.collapsed) {
        zobrazV2SelectionMenuProOznaceni(range);
      } else if (range && jeV2SelectionRozsah(range)) {
        zobrazV2SelectionMenuProKurzor({ x: aktualni.x, y: aktualni.y });
      }
    }, 70);
  }, { passive: true, capture: true });

  document.addEventListener("dblclick", (event) => {
    if (jeDesktopSelection || !aktivni || !hostitel?.contains(event.target)) return;
    zapisV2Stabilitu("DBLCLICK", `x=${Math.round(event.clientX)} y=${Math.round(event.clientY)}`);
    if (jeV2MoveInterakce(event)) {
      potlacSelectionMenuKvuliMove();
      return;
    }
    if (event.target.closest?.("button, figure, .noteInternalLink, .plannedTextLink")) return;

    const x = event.clientX;
    const y = event.clientY;
    setTimeout(() => {
      if (!aktivni) return;
      const vyber = window.getSelection();
      const range = vyber?.rangeCount ? vyber.getRangeAt(0) : null;
      if (range && jeV2SelectionRozsah(range) && !range.collapsed) {
        zobrazV2SelectionMenuProOznaceni(range);
      } else if (range && jeV2SelectionRozsah(range)) {
        zobrazV2SelectionMenuProKurzor({ x, y });
      }
    }, 0);
  }, true);

  document.addEventListener("contextmenu", (event) => {
    if (jeDesktopSelection || !aktivni || !hostitel?.contains(event.target)) return;
    zapisV2Stabilitu("CONTEXTMENU", `x=${Math.round(event.clientX)} y=${Math.round(event.clientY)}`);
    if (jeV2MoveInterakce(event, true)) {
      /* Long-press na řádku patří MOVE. Nativní/context selection zde nesmí
         přebít mobilní přesun, ale krátký/2× tap tím není dotčený. */
      event.preventDefault();
      potlacSelectionMenuKvuliMove(700);
      return;
    }
    if (event.target.closest?.("button, figure")) return;

    event.preventDefault();
    const x = event.clientX;
    const y = event.clientY;
    setTimeout(() => {
      if (!aktivni) return;
      const vyber = window.getSelection();
      const range = vyber?.rangeCount ? vyber.getRangeAt(0) : null;
      if (range && jeV2SelectionRozsah(range) && !range.collapsed) {
        zobrazV2SelectionMenuProOznaceni(range);
      } else {
        zobrazV2SelectionMenuProKurzor({ x, y });
      }
    }, 0);
  }, true);

  document.addEventListener("lubanote:v2-list-move-takeover", () => {
    if (jeDesktopSelection || !aktivni) return;

    /*
     * FIX 521 – jakmile Core potvrdí skutečný long-press MOVE, mobilní
     * selection vrstva končí. Žádné menu, žádný pending double-tap a žádná
     * stará DOM selection nesmí po takeover znovu vstoupit do gesta.
     */
    potlacSelectionMenuKvuliMove(1000);
    try { window.getSelection()?.removeAllRanges(); } catch (_error) {}
  }, true);

  document.addEventListener("lubanote:v2-model-input", () => {
    if (aktivni) skryjV2SelectionMenu();
  }, true);

  document.addEventListener("pointerdown", (event) => {
    if (!aktivni) return;
    if (selectionMenu?.contains(event.target)) return;
    if (event.target.closest?.(".editorQuickToolbar, .editorToolbarPanel, .editorBottomBar")) {
      potlacV2SelectionMenuDo = performance.now() + 350;
      return;
    }
    if (v2SelectionMenuAktivni) skryjV2SelectionMenu();
  }, true);

  document.addEventListener("pointerdown", (event) => {
    if (!aktivni) return;
    if (event.target.closest(".editorQuickToolbar, .editorToolbarPanel, .editorBottomBar")) {
      core()?.zachytAktualniVyber?.();
    }
  }, true);

  document.addEventListener("click", zrusV2OznaceniKlikemMimo, true);
  document.addEventListener("click", zpracujKlikNaV2Odkaz, true);
  document.addEventListener("click", zpracujToolbarCapture, true);

  /* DIAG 435 – zda Android WebView doručuje horizontální gesture toolbaru. */
  [
    document.getElementById("editorQuickToolbar"),
    document.getElementById("editorToolsToolbar")
  ].filter(Boolean).forEach((lista) => {
    ["touchstart", "touchmove", "touchend", "scroll"].forEach((typ) => {
      lista.addEventListener(typ, () => {
        zapisV2Stabilitu(`TOOLBAR_${typ.toUpperCase()}`, `id=${lista.id} left=${Math.round(lista.scrollLeft)} cw=${lista.clientWidth} sw=${lista.scrollWidth}`);
      }, { passive: true });
    });
  });

  document.addEventListener("keydown", (event) => {
    if (!aktivni || event.key !== "Escape") return;

    /* FIX 527 – ESC na PC znovu patří společnému zavíracímu toku aplikace:
       beze změny zavře, se změnou zobrazí Uložit / Neukládat / Zrušit.
       Bridge smí ESC spotřebovat jen pro svůj právě otevřený podmodal. */
    if (cropModal && !cropModal.hidden) {
      event.preventDefault();
      event.stopImmediatePropagation();
      zavriV2CropModal();
      return;
    }
    if (odkazModal && !odkazModal.hidden) {
      event.preventDefault();
      event.stopImmediatePropagation();
      odkazModal.hidden = true;
      return;
    }

    const choiceModal = document.querySelector(".choiceModal:not([hidden])");
    if (choiceModal) {
      event.preventDefault();
      event.stopImmediatePropagation();
      try { window.zavriVyberovyModal?.(); } catch (_error) {}
      return;
    }

    /* Nic dalšího zde neděláme. Event pokračuje do script.js, kde
       `zpracujZavreniEditoru()` drží jedinou správnou save/discard logiku. */
  }, true);

  document.addEventListener("selectionchange", () => {
    if (!aktivni) return;
    zapisV2Stabilitu("SELECTIONCHANGE");
    if (core()?.jeImeKompoziceAktivni?.()) return;
    const vyber = window.getSelection();
    if (!vyber?.rangeCount) return;
    const range = vyber.getRangeAt(0);
    if (!hostitel?.contains(range.commonAncestorContainer)) return;
    requestAnimationFrame(() => {
      obnovToolbar();
      if (jeDesktopSelection) return;
      if (jeV2MoveInterakce() || performance.now() < potlacV2SelectionMenuDo) return;
      zpracujV2SelectionChangeProMenu();
    });
  });

  function sledujEditor() {
    observer = new MutationObserver(() => {
      if (!jeEditorOtevreny() && aktivni) deaktivuj();
    });
    observer.observe(taskModal, {
      attributes: true,
      attributeFilter: ["class", "hidden", "data-task-id", "data-shared-task-id"]
    });
  }

  vytvorPomocneUi();
  sledujEditor();

  window.LubaNoteEditorV2Bridge = Object.freeze({
    verze: "V2.24-CORE-ONLY-528",
    otevriObsah,
    ziskejObsahProProdukci,
    dokoncModelPredExterniAkci,
    zavri: deaktivuj,
    vlozPripravenyObrazek,
    vlozInterniOdkazZAutocomplete,
    ziskejPlanovaciKontext,
    obalPlanovaciVyber,
    ziskejAktivniTodos: () => core()?.ziskejAktivniTodos?.() || [],
    ziskejVybraneTodo: () => core()?.ziskejVybraneTodo?.() || null,
    nastavTodoHotovo: (id, hotovo) => core()?.nastavTodoHotovo?.(id, hotovo) === true,
    nastavTodoZvyrazneni: (id, barva) => core()?.nastavTodoZvyrazneni?.(id, barva) === true,
    nastavTodoNaplanovane: (id, zapnuto) => core()?.nastavTodoNaplanovane?.(id, zapnuto) === true,
    aktualizujPlanovanyOdkaz: (id, akce) => core()?.aktualizujPlanovanyOdkaz?.(id, akce) === true,
    zobrazTodoPodleId: (id) => core()?.zobrazTodoPodleId?.(id) === true,
    jeTodoRezimAktivni: () => core()?.jeTodoRezimAktivni?.() === true,
    spravujeSelectionMenu: () => aktivni && !jeDesktopSelection,
    jeAktivni: () => aktivni
  });
})();
