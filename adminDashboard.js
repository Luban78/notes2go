/* ==================================================
   LubaNote – Admin Dashboard V2
   UI nikdy samo nerozhoduje o admin právech.
   Každé čtení i změnu znovu ověřuje SECURITY DEFINER RPC v Supabase.
================================================== */

(() => {
  const menuTlacitko =
    document.getElementById("adminDashboardButton");
  const hlavniMenuTlacitko =
    document.getElementById("mainMenuButton");
  const desktopTlacitko =
    document.getElementById("desktopAdminDashboardButton");
  const modal =
    document.getElementById("adminDashboardModal");
  const zavritTlacitko =
    document.getElementById("closeAdminDashboardButton");
  const domov =
    document.getElementById("adminDashboardHome");
  const uctyPohled =
    document.getElementById("adminAccountsView");
  const uctyTlacitko =
    document.getElementById("adminAccountsToolButton");
  const visualDebugTlacitko =
    document.getElementById("adminVisualDebugToolButton");
  const debugHubTlacitko =
    document.getElementById("adminDebugHubToolButton");
  const syncTrafficTlacitko =
    document.getElementById("adminSyncTrafficToolButton");
  const syncTrafficPopis =
    document.getElementById("adminSyncTrafficToolDescription");
  const syncTrafficStav =
    document.getElementById("adminSyncTrafficToolState");
  const notesVisualToolTlacitko =
    document.getElementById("adminNotesVisualToolButton");
  const plannerVisualToolTlacitko =
    document.getElementById("adminPlannerVisualToolButton");
  const documentsVisualToolTlacitko =
    document.getElementById("adminDocumentsVisualToolButton");
  const plannerIconsToolTlacitko =
    document.getElementById("adminPlannerIconsToolButton");
  const plannerIconsToolStav =
    document.getElementById("adminPlannerIconsToolState");
  const plannerIconsToolPopis =
    document.getElementById("adminPlannerIconsToolDescription");
  const reminderIconsToolTlacitko =
    document.getElementById("adminReminderIconsToolButton");
  const reminderIconsToolStav =
    document.getElementById("adminReminderIconsToolState");
  const reminderIconsToolPopis =
    document.getElementById("adminReminderIconsToolDescription");
  const notesVisualPanel =
    document.getElementById("adminNotesVisualTuning");
  const notesVisualFloatingTlacitko =
    document.getElementById("adminNotesVisualFloatingButton");
  const notesVisualTarget =
    document.getElementById("adminNotesVisualTarget");
  const notesBorderTlacitko =
    document.getElementById("adminNotesBorderToggle");
  const notesBorderRezim =
    document.getElementById("adminNotesBorderMode");
  const notesBorderSirka =
    document.getElementById("adminNotesBorderWidth");
  const notesBorderSirkaHodnota =
    document.getElementById("adminNotesBorderWidthValue");
  const notesBorderSila =
    document.getElementById("adminNotesBorderStrength");
  const notesBorderSilaHodnota =
    document.getElementById("adminNotesBorderStrengthValue");
  const notesBorderRadius =
    document.getElementById("adminNotesBorderRadius");
  const notesBorderRadiusHodnota =
    document.getElementById("adminNotesBorderRadiusValue");
  const notesElementSize =
    document.getElementById("adminNotesElementSize");
  const notesElementSizeHodnota =
    document.getElementById("adminNotesElementSizeValue");
  const notesElementSizeLabel =
    document.getElementById("adminNotesElementSizeLabel");
  const notesVisualResetVybrany =
    document.getElementById("adminNotesVisualResetSelected");
  const notesVisualResetTlacitko =
    document.getElementById("adminNotesVisualReset");
  const notesOffsetY =
    document.getElementById("adminNotesOffsetY");
  const notesOffsetYHodnota =
    document.getElementById("adminNotesOffsetYValue");
  const notesActionsFiltersGap =
    document.getElementById("adminNotesActionsFiltersGap");
  const notesActionsFiltersGapHodnota =
    document.getElementById("adminNotesActionsFiltersGapValue");
  const notesFilterGap =
    document.getElementById("adminNotesFilterGap");
  const notesFilterGapHodnota =
    document.getElementById("adminNotesFilterGapValue");
  const notesTagsGap =
    document.getElementById("adminNotesTagsGap");
  const notesTagsGapHodnota =
    document.getElementById("adminNotesTagsGapValue");
  const notesRowsGap =
    document.getElementById("adminNotesRowsGap");
  const notesRowsGapHodnota =
    document.getElementById("adminNotesRowsGapValue");
  const notesTagsCardsGap =
    document.getElementById("adminNotesTagsCardsGap");
  const notesTagsCardsGapHodnota =
    document.getElementById("adminNotesTagsCardsGapValue");
  const notesCardColumnGap =
    document.getElementById("adminNotesCardColumnGap");
  const notesCardColumnGapHodnota =
    document.getElementById("adminNotesCardColumnGapValue");
  const notesCardRowGap =
    document.getElementById("adminNotesCardRowGap");
  const notesCardRowGapHodnota =
    document.getElementById("adminNotesCardRowGapValue");
  const zpetNaNastrojeTlacitko =
    document.getElementById("adminAccountsBackButton");
  const cekajiciTab =
    document.getElementById("adminPendingTab");
  const aktivniTab =
    document.getElementById("adminActiveTab");
  const ukonceneDemoTab =
    document.getElementById("adminExpiredTab");
  const vsichniTab =
    document.getElementById("adminAllTab");
  const obnovitTlacitko =
    document.getElementById("adminRefreshButton");
  const seznam =
    document.getElementById("adminUsersList");
  const stavText =
    document.getElementById("adminDashboardStatus");

  const cekajiciPocet =
    document.getElementById("adminPendingCount");
  const aktivniPocet =
    document.getElementById("adminActiveCount");
  const demoPocet =
    document.getElementById("adminDemoCount");
  const ukonceneDemoPocet =
    document.getElementById("adminExpiredDemoCount");

  if (
    !menuTlacitko ||
    !modal ||
    !zavritTlacitko ||
    !domov ||
    !uctyPohled ||
    !uctyTlacitko ||
    !visualDebugTlacitko ||
    !debugHubTlacitko ||
    !syncTrafficTlacitko ||
    !zpetNaNastrojeTlacitko ||
    !cekajiciTab ||
    !aktivniTab ||
    !ukonceneDemoTab ||
    !vsichniTab ||
    !ukonceneDemoPocet ||
    !seznam
  ) {
    return;
  }

  let jeAdmin = false;
  let startUiPripraven = false;
  let ucetAktivni = false;
  let uzivatele = [];
  let filtr = "pending";
  let nacitam = false;

  /* PATCH 627A – DOČASNÝ VÝVOJOVÝ NOUZOVÝ DEBUG.
   *
   * Před veřejným vydáním odstranit / přepnout na false.
   * Nezapisuje se do localStorage a po reloadu je znovu zamčený.
   * 5× rychlý tap na „Poznámky“ ho odemkne jen pro aktuální relaci.
   */
  const POVOLIT_NOUZOVY_DEBUG_5X = true;
  const NOUZOVY_DEBUG_OKNO_MS = 2200;
  let nouzovyDevDebug = false;
  let nouzoveKliky = [];

  /*
   * Jediná klientská brána pro interní nástroje. Normálně rozhoduje
   * serverové admin RPC. Během vývoje je navíc povolený dočasný 5× tap
   * fallback, aby šel Debug Hub otevřít i při rozbitém startu/syncu.
   */
  window.LubaNoteAdminTools = {
    isAllowed: () =>
      jeAdmin === true ||
      (POVOLIT_NOUZOVY_DEBUG_5X && nouzovyDevDebug === true),
    isEmergencyDevUnlock: () =>
      POVOLIT_NOUZOVY_DEBUG_5X && nouzovyDevDebug === true
  };

  function tAdmin(klic, vychozi, parametry = {}) {
    return (
      window.LubaNoteI18n?.t?.(
        klic,
        vychozi,
        parametry
      ) || vychozi
    );
  }

  function bezpecnyText(hodnota) {
    return String(hodnota ?? "");
  }

  function locale() {
    return (
      window.LubaNoteI18n?.ziskejLocale?.() ||
      "cs-CZ"
    );
  }

  function formatDatum(hodnota) {
    if (!hodnota) {
      return "—";
    }

    const datum = new Date(hodnota);
    if (Number.isNaN(datum.getTime())) {
      return "—";
    }

    return new Intl.DateTimeFormat(
      locale(),
      {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }
    ).format(datum);
  }

  function jeUkonceneDemo(uzivatel) {
    if (
      uzivatel?.account_status !== "active" ||
      uzivatel?.plan_id !== "demo" ||
      !uzivatel?.demo_until
    ) {
      return false;
    }

    const konec = new Date(uzivatel.demo_until).getTime();
    return Number.isFinite(konec) && konec <= Date.now();
  }

  function jeAktivniUcet(uzivatel) {
    return (
      uzivatel?.account_status === "active" &&
      !jeUkonceneDemo(uzivatel)
    );
  }

  function aktualizujSyncTrafficNastroj() {
    const viditelny =
      window.LubaNoteSyncTraffic
        ?.jePanelViditelny?.() !== false;

    syncTrafficTlacitko.setAttribute(
      "aria-pressed",
      String(viditelny)
    );

    if (syncTrafficStav) {
      syncTrafficStav.textContent = tAdmin(
        viditelny
          ? "admin.syncTrafficOn"
          : "admin.syncTrafficOff",
        viditelny ? "Zapnuto" : "Vypnuto"
      );
    }

    if (syncTrafficPopis) {
      syncTrafficPopis.textContent = tAdmin(
        viditelny
          ? "admin.syncTrafficVisible"
          : "admin.syncTrafficHidden",
        viditelny
          ? "Panel RX/TX/E je zobrazený"
          : "Panel RX/TX/E je skrytý"
      );
    }
  }

  function prepniSyncTrafficPanel() {
    const api = window.LubaNoteSyncTraffic;
    if (!api?.nastavPanelViditelny) {
      return;
    }

    api.nastavPanelViditelny(
      !(api.jePanelViditelny?.() !== false)
    );
    aktualizujSyncTrafficNastroj();
  }

  /* PATCH 658S – samostatné Visual Lab nástroje Poznámky / Plán. */
  function aktualizujPlannerVisualNastroje() {
    const stav = window.LubaNotePlannerVisualTuning?.ziskejStav?.();
    if (!stav?.ikony) return;

    const planZapnuty = stav.ikony.plan === true;
    const pripominkyZapnute = stav.ikony.pripominky === true;

    if (plannerIconsToolTlacitko) {
      plannerIconsToolTlacitko.setAttribute("aria-pressed", String(planZapnuty));
    }
    if (plannerIconsToolStav) {
      plannerIconsToolStav.textContent = planZapnuty ? "Zapnuto" : "Vypnuto";
    }
    if (plannerIconsToolPopis) {
      plannerIconsToolPopis.textContent = planZapnuty
        ? "Metadata ikony v agendě jsou zobrazené"
        : "Agenda je bez metadata ikon";
    }

    if (reminderIconsToolTlacitko) {
      reminderIconsToolTlacitko.setAttribute("aria-pressed", String(pripominkyZapnute));
    }
    if (reminderIconsToolStav) {
      reminderIconsToolStav.textContent = pripominkyZapnute ? "Zapnuto" : "Vypnuto";
    }
    if (reminderIconsToolPopis) {
      reminderIconsToolPopis.textContent = pripominkyZapnute
        ? "Metadata ikony v kartách jsou zobrazené"
        : "Připomínky jsou bez metadata ikon";
    }
  }

  function prepniPlannerIkony(klic) {
    const api = window.LubaNotePlannerVisualTuning;
    const stav = api?.ziskejStav?.();
    if (!stav?.ikony || !api?.nastavIkony) return;
    api.nastavIkony(klic, !(stav.ikony[klic] === true));
    aktualizujPlannerVisualNastroje();
  }

  /* PATCH 658B – Visual Lab pro celý hlavní screen Poznámky. */
  const NOTES_VISUAL_META = {
    cards: {
      velikostKlic: "admin.notesSizeCards",
      velikostText: "Vnitřní odsazení karty",
      min: 10,
      max: 26
    },
    tags: {
      velikostKlic: "admin.notesSizeTags",
      velikostText: "Výška štítku",
      min: 30,
      max: 56
    },
    primary: {
      velikostKlic: "admin.notesSizePrimary",
      velikostText: "Výška hlavního filtru",
      min: 30,
      max: 56
    },
    search: {
      velikostKlic: "admin.notesSizeSearch",
      velikostText: "Výška hledání + ikon",
      min: 34,
      max: 58
    },
    actions: {
      velikostKlic: "admin.notesSizeActions",
      velikostText: "Výška hledání + ikon",
      min: 34,
      max: 58
    },
    traffic: {
      velikostKlic: "admin.notesSizeTraffic",
      velikostText: "Minimální výška RX/TX/E panelu",
      min: 40,
      max: 64
    },
    modules: {
      velikostKlic: "admin.notesSizeModules",
      velikostText: "Výška modulového tlačítka",
      min: 42,
      max: 68
    },
    fab: {
      velikostKlic: "admin.notesSizeFab",
      velikostText: "Velikost plovoucího +",
      min: 48,
      max: 88
    }
  };

  function formatPx(hodnota) {
    const cislo = Number(hodnota ?? 0);
    return `${Number.isInteger(cislo) ? cislo : cislo.toFixed(1)} px`;
  }

  function formatHodnota(hodnota, jednotka = "px") {
    if (jednotka === "%") {
      return `${Math.round(Number(hodnota ?? 0))} %`;
    }
    return formatPx(hodnota);
  }

  function zajistiPuvodniHodnotu(prvek) {
    const radek = prvek?.closest?.(".adminNotesVisualRangeRow");
    if (!radek) return null;
    let badge = radek.querySelector(".adminNotesVisualOriginalValue");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "adminNotesVisualOriginalValue";
      badge.textContent = `${tAdmin("admin.notesVisualOriginal", "Pův.")} —`;
      radek.prepend(badge);
    }
    return badge;
  }

  function nastavRange(prvek, output, hodnota, jednotka = "px", puvodni = null) {
    if (prvek) prvek.value = String(hodnota);
    if (output) output.textContent = formatHodnota(hodnota, jednotka);
    const badge = zajistiPuvodniHodnotu(prvek);
    if (badge && puvodni !== null && puvodni !== undefined) {
      badge.textContent = `${tAdmin("admin.notesVisualOriginal", "Pův.")} ${formatHodnota(puvodni, jednotka)}`;
    }
  }

  function aktualizujNotesVisualTuning() {
    if (!notesVisualPanel) return;

    const api = window.LubaNoteNotesVisualTuning;
    const stav = api?.ziskejStav?.();
    const vychozi = api?.ziskejVychozi?.();

    if (!stav?.prvky || !stav?.layout || !vychozi?.prvky || !vychozi?.layout) {
      notesVisualPanel.hidden = true;
      return;
    }

    notesVisualPanel.hidden = false;

    const id = stav.vybranyPrvek || "cards";
    const prvek = stav.prvky[id] || stav.prvky.cards;
    const puvodniPrvek = vychozi.prvky[id] || vychozi.prvky.cards;
    const meta = NOTES_VISUAL_META[id] || NOTES_VISUAL_META.cards;

    if (notesVisualTarget) notesVisualTarget.value = id;

    if (notesBorderTlacitko) {
      notesBorderTlacitko.setAttribute(
        "aria-pressed",
        String(prvek.borderZapnuty === true)
      );
      notesBorderTlacitko.textContent = tAdmin(
        prvek.borderZapnuty === true
          ? "admin.notesVisualOn"
          : "admin.notesVisualOff",
        prvek.borderZapnuty === true ? "Zapnuto" : "Vypnuto"
      );
    }

    if (notesBorderRezim) {
      notesBorderRezim.value = prvek.borderRezim || "legacy";
    }

    nastavRange(
      notesBorderSirka,
      notesBorderSirkaHodnota,
      prvek.borderSirka ?? 1,
      "px",
      puvodniPrvek.borderSirka
    );
    nastavRange(
      notesBorderSila,
      notesBorderSilaHodnota,
      prvek.borderSila ?? 18,
      "%",
      puvodniPrvek.borderSila
    );
    nastavRange(
      notesBorderRadius,
      notesBorderRadiusHodnota,
      prvek.radius ?? 14,
      "px",
      puvodniPrvek.radius
    );

    if (notesElementSize) {
      notesElementSize.min = String(meta.min);
      notesElementSize.max = String(meta.max);
      notesElementSize.step = "1";
    }
    nastavRange(
      notesElementSize,
      notesElementSizeHodnota,
      prvek.velikost ?? meta.min,
      "px",
      puvodniPrvek.velikost
    );

    if (notesElementSizeLabel) {
      notesElementSizeLabel.textContent = tAdmin(
        meta.velikostKlic,
        meta.velikostText
      );
    }

    nastavRange(
      notesOffsetY,
      notesOffsetYHodnota,
      stav.layout.offsetY ?? 13,
      "px",
      vychozi.layout.offsetY
    );
    nastavRange(
      notesActionsFiltersGap,
      notesActionsFiltersGapHodnota,
      stav.layout.akceFiltryMezera ?? 5,
      "px",
      vychozi.layout.akceFiltryMezera
    );
    nastavRange(
      notesFilterGap,
      notesFilterGapHodnota,
      stav.layout.filtrMezera ?? 5,
      "px",
      vychozi.layout.filtrMezera
    );
    nastavRange(
      notesTagsGap,
      notesTagsGapHodnota,
      stav.layout.stitkyMezera ?? 5,
      "px",
      vychozi.layout.stitkyMezera
    );
    nastavRange(
      notesRowsGap,
      notesRowsGapHodnota,
      stav.layout.radkyMezera ?? 5,
      "px",
      vychozi.layout.radkyMezera
    );
    nastavRange(
      notesTagsCardsGap,
      notesTagsCardsGapHodnota,
      stav.layout.stitkyKartyMezera ?? 5,
      "px",
      vychozi.layout.stitkyKartyMezera
    );
    nastavRange(
      notesCardColumnGap,
      notesCardColumnGapHodnota,
      stav.layout.kartySloupceMezera ?? 5,
      "px",
      vychozi.layout.kartySloupceMezera
    );
    nastavRange(
      notesCardRowGap,
      notesCardRowGapHodnota,
      stav.layout.kartyRadkyMezera ?? 5,
      "px",
      vychozi.layout.kartyRadkyMezera
    );
  }

  function ziskejVybranyNotesPrvek() {
    return (
      window.LubaNoteNotesVisualTuning?.ziskejStav?.()?.vybranyPrvek ||
      "cards"
    );
  }

  function prepniNotesBorder() {
    const api = window.LubaNoteNotesVisualTuning;
    const stav = api?.ziskejStav?.();
    const id = stav?.vybranyPrvek;
    const prvek = id ? stav?.prvky?.[id] : null;
    if (!id || !prvek || !api?.nastavPrvekHodnotu) return;
    api.nastavPrvekHodnotu(id, "borderZapnuty", !prvek.borderZapnuty);
  }

  function otevriPlovouciNotesTuning() {
    if (!jeAdmin) return;
    window.LubaNotePlannerVisualPanel?.close?.();
    window.LubaNoteDocumentsVisualPanel?.close?.();
    document.getElementById("notesModuleButton")?.click?.();
    const otevreno = window.LubaNoteNotesVisualPanel?.open?.();
    if (otevreno) {
      zavriDashboard();
    }
  }

  function otevriPlovouciPlannerTuning() {
    if (!jeAdmin) return;
    window.LubaNoteNotesVisualPanel?.close?.();
    window.LubaNoteDocumentsVisualPanel?.close?.();
    document.getElementById("plannerModuleButton")?.click?.();
    const otevreno = window.LubaNotePlannerVisualPanel?.open?.();
    if (otevreno) {
      zavriDashboard();
    }
  }

  function otevriPlovouciDocumentsTuning() {
    if (!jeAdmin) return;
    window.LubaNoteNotesVisualPanel?.close?.();
    window.LubaNotePlannerVisualPanel?.close?.();
    document.getElementById("documentsModuleButton")?.click?.();
    const otevreno = window.LubaNoteDocumentsVisualPanel?.open?.();
    if (otevreno) {
      zavriDashboard();
    }
  }

  function zobrazDomov() {
    domov.hidden = false;
    uctyPohled.hidden = true;
    aktualizujSyncTrafficNastroj();
    aktualizujNotesVisualTuning();
    aktualizujPlannerVisualNastroje();
  }

  function zobrazUcty() {
    domov.hidden = true;
    uctyPohled.hidden = false;
  }

  function nastavStav(text = "", chyba = false) {
    stavText.textContent = text;
    stavText.classList.toggle("error", Boolean(chyba));
  }

  function nastavViditelnostAdmina(hodnota) {
    jeAdmin = Boolean(hodnota);
    menuTlacitko.hidden = !jeAdmin;

    if (desktopTlacitko) {
      desktopTlacitko.hidden = !jeAdmin;
    }

    if (!jeAdmin) {
      modal.hidden = true;

      /*
       * Nouzový 5× debug je záměrně nezávislý na admin kontrole.
       * Když právě diagnostikujeme rozbitý start/sync, pozdější neúspěšné
       * admin ověření nám nesmí Debug Hub znovu zavřít. Po reloadu se
       * nouzový stav automaticky ztratí.
       */
      if (!nouzovyDevDebug) {
        window.LubaNoteDebugHub?.stop?.();
        window.LubaNoteDebugHub?.close?.();
        window.LubaNoteVisualDebug?.lock?.();
      }
    }
  }

  async function pripravClient() {
    if (!navigator.onLine) {
      return false;
    }

    if (
      typeof window.LubaNoteSupabase
        ?.pripravClient === "function"
    ) {
      return Boolean(
        await window.LubaNoteSupabase.pripravClient()
      );
    }

    return typeof supabaseClient !== "undefined" &&
      Boolean(supabaseClient);
  }

  async function overAdmina() {
    try {
      const pripraven = await pripravClient();

      if (!pripraven || !supabaseClient) {
        nastavViditelnostAdmina(false);
        return false;
      }

      const { data, error } = await supabaseClient.rpc(
        "lubanote_admin_is_current_user"
      );

      if (error) {
        throw error;
      }

      nastavViditelnostAdmina(data === true);
      return data === true;
    } catch (error) {
      console.warn(
        "Admin check skipped:",
        error?.message || error
      );
      nastavViditelnostAdmina(false);
      return false;
    }
  }

  function textStavu(stav) {
    const mapa = {
      pending: ["admin.status.pending", "Čeká"],
      active: ["admin.status.active", "Aktivní"],
      rejected: ["admin.status.rejected", "Zamítnut"],
      suspended: ["admin.status.suspended", "Pozastaven"]
    };

    const [klic, vychozi] =
      mapa[stav] || ["", bezpecnyText(stav || "—")];

    return klic ? tAdmin(klic, vychozi) : vychozi;
  }

  function textPlanu(plan) {
    const mapa = {
      demo: ["admin.plan.demo", "Demo"],
      full: ["admin.plan.full", "Full"],
      internal: ["admin.plan.internal", "Interní"]
    };

    const [klic, vychozi] =
      mapa[plan] || ["", bezpecnyText(plan || "—")];

    return klic ? tAdmin(klic, vychozi) : vychozi;
  }

  function vytvorRadekMeta(popisek, hodnota) {
    const radek = document.createElement("div");
    radek.className = "adminUserMetaRow";

    const label = document.createElement("span");
    label.textContent = popisek;

    const value = document.createElement("strong");
    value.textContent = hodnota;

    radek.append(label, value);
    return radek;
  }

  function vytvorBadge(text, trida = "") {
    const badge = document.createElement("span");
    badge.className = `adminBadge ${trida}`.trim();
    badge.textContent = text;
    return badge;
  }

  let adminPotvrzeniModal = null;
  let adminPotvrzeniAkce = null;

  function zajistiAdminPotvrzeniModal() {
    if (adminPotvrzeniModal) {
      return adminPotvrzeniModal;
    }

    const overlay = document.createElement("div");
    overlay.className = "choiceModal";
    overlay.hidden = true;

    const dialog = document.createElement("div");
    dialog.className = "choiceDialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");

    const hlavicka = document.createElement("div");
    hlavicka.className = "choiceDialogHeader";

    const nadpis = document.createElement("h3");
    nadpis.className = "choiceDialogTitle";
    nadpis.id = "adminConfirmTitle";
    dialog.setAttribute("aria-labelledby", nadpis.id);

    const zavrit = document.createElement("button");
    zavrit.type = "button";
    zavrit.className = "choiceDialogClose";
    zavrit.setAttribute("aria-label", "Zavřít");

    if (window.LubaNoteIcons?.nastavJenIkonu) {
      window.LubaNoteIcons.nastavJenIkonu(
        zavrit,
        "zavrit",
        ["choiceCloseSvgIcon"]
      );
    } else {
      zavrit.textContent = "×";
    }

    const zprava = document.createElement("p");
    zprava.className = "choiceDialogFieldLabel";
    zprava.style.margin = "0 0 18px";
    zprava.style.lineHeight = "1.45";
    zprava.style.overflowWrap = "anywhere";

    const akce = document.createElement("div");
    akce.className = "choiceDialogActions";

    const zrusit = document.createElement("button");
    zrusit.type = "button";
    zrusit.className = "choiceDialogSecondary";

    const potvrdit = document.createElement("button");
    potvrdit.type = "button";
    potvrdit.className = "choiceDialogSave";

    hlavicka.append(nadpis, zavrit);
    akce.append(zrusit, potvrdit);
    dialog.append(hlavicka, zprava, akce);
    overlay.append(dialog);
    document.body.append(overlay);

    function zavriPotvrzeni() {
      overlay.hidden = true;
      adminPotvrzeniAkce = null;
    }

    zavrit.addEventListener("click", zavriPotvrzeni);
    zrusit.addEventListener("click", zavriPotvrzeni);

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        zavriPotvrzeni();
      }
    });

    potvrdit.addEventListener("click", async () => {
      const provedAkci = adminPotvrzeniAkce;
      if (typeof provedAkci !== "function") {
        zavriPotvrzeni();
        return;
      }

      potvrdit.disabled = true;
      zrusit.disabled = true;

      try {
        zavriPotvrzeni();
        await provedAkci();
      } finally {
        potvrdit.disabled = false;
        zrusit.disabled = false;
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !overlay.hidden) {
        zavriPotvrzeni();
      }
    });

    adminPotvrzeniModal = {
      overlay,
      nadpis,
      zprava,
      zrusit,
      potvrdit
    };

    return adminPotvrzeniModal;
  }

  function otevriAdminPotvrzeni({
    nadpis,
    zprava,
    potvrditText,
    nebezpecne = false,
    poPotvrzeni
  }) {
    const prvky = zajistiAdminPotvrzeniModal();

    prvky.nadpis.textContent = nadpis;
    prvky.zprava.textContent = zprava;
    prvky.zrusit.textContent = tAdmin(
      "actions.cancel",
      "Zrušit"
    );
    prvky.potvrdit.textContent = potvrditText;

    prvky.potvrdit.className = nebezpecne
      ? "choiceDialogSecondary adminRejectButton"
      : "choiceDialogSave";

    adminPotvrzeniAkce = poPotvrzeni;
    prvky.overlay.hidden = false;

    requestAnimationFrame(() => {
      prvky.potvrdit.focus();
    });
  }

  async function schvalDemo(uzivatel) {
    const email = bezpecnyText(uzivatel.email || "—");
    const dotaz = tAdmin(
      "admin.approveConfirm",
      `Schválit účet ${email} jako Demo?`,
      { email }
    );

    otevriAdminPotvrzeni({
      nadpis: tAdmin(
        "admin.approveDemo",
        "Schválit Demo"
      ),
      zprava: dotaz,
      potvrditText: tAdmin(
        "admin.approveDemo",
        "Schválit Demo"
      ),
      poPotvrzeni: async () => {
        nastavStav(
          tAdmin("admin.approving", "Schvaluji účet…")
        );

        try {
      const { error } = await supabaseClient.rpc(
        "lubanote_admin_approve_demo",
        { p_user_id: uzivatel.user_id }
      );

      if (error) {
        throw error;
      }

      await nactiUzivatele();
      nastavStav(
        tAdmin(
          "admin.approved",
          "Účet byl schválen jako Demo."
        )
      );
        } catch (error) {
          console.error("Admin approve failed:", error);
          nastavStav(
            tAdmin(
              "admin.actionFailed",
              "Akci se nepodařilo dokončit."
            ),
            true
          );
        }
      }
    });
  }

  /* PATCH 622 – Admin Extend Demo
   * Prodloužení Dema jde výhradně přes serverové admin RPC.
   * Klient nikdy nezapisuje přímo do lubanote_user_access.
   */
  function prodluzDemo(uzivatel) {
    const email = bezpecnyText(uzivatel.email || "—");

    if (typeof window.otevriVyberovyModal !== "function") {
      nastavStav(
        tAdmin(
          "admin.actionFailed",
          "Akci se nepodařilo dokončit."
        ),
        true
      );
      return;
    }

    window.otevriVyberovyModal({
      nadpis: tAdmin(
        "admin.extendDemo",
        "Prodloužit Demo"
      ),
      moznosti: [7, 14, 30].map((dnu) => ({
        hodnota: dnu,
        popisek: `+${dnu} ${tAdmin("admin.days", "dní")}`
      })),
      poVyberu: async (dnu) => {
        window.zavriVyberovyModal?.();

        setTimeout(() => {
          otevriAdminPotvrzeni({
            nadpis: tAdmin(
              "admin.extendDemo",
              "Prodloužit Demo"
            ),
            zprava: tAdmin(
              "admin.extendDemoConfirm",
              `Prodloužit Demo účtu ${email} o ${dnu} dní?`,
              { email, days: dnu }
            ),
            potvrditText: tAdmin(
              "admin.extendDemo",
              "Prodloužit Demo"
            ),
            poPotvrzeni: async () => {
              nastavStav(
                tAdmin(
                  "admin.extendingDemo",
                  "Prodlužuji Demo…"
                )
              );

              try {
                const { data, error } = await supabaseClient.rpc(
                  "lubanote_admin_extend_demo",
                  {
                    p_user_id: uzivatel.user_id,
                    p_days: dnu
                  }
                );

                if (error) {
                  throw error;
                }

                if (data?.ok === false) {
                  throw new Error(data?.reason || "extend_failed");
                }

                await nactiUzivatele();
                nastavStav(
                  tAdmin(
                    "admin.demoExtended",
                    `Demo bylo prodlouženo o ${dnu} dní.`,
                    { days: dnu }
                  )
                );
              } catch (error) {
                console.error("Admin extend Demo failed:", error);
                nastavStav(
                  tAdmin(
                    "admin.actionFailed",
                    "Akci se nepodařilo dokončit."
                  ),
                  true
                );
              }
            }
          });
        }, 0);
      }
    });
  }

  async function zamitniUzivatele(uzivatel) {
    const email = bezpecnyText(uzivatel.email || "—");
    const dotaz = tAdmin(
      "admin.rejectConfirm",
      `Opravdu zamítnout registraci ${email}?`,
      { email }
    );

    otevriAdminPotvrzeni({
      nadpis: tAdmin(
        "admin.reject",
        "Zamítnout"
      ),
      zprava: dotaz,
      potvrditText: tAdmin(
        "admin.reject",
        "Zamítnout"
      ),
      nebezpecne: true,
      poPotvrzeni: async () => {
        nastavStav(
          tAdmin("admin.rejecting", "Zamítám registraci…")
        );

        try {
      const { error } = await supabaseClient.rpc(
        "lubanote_admin_reject_user",
        { p_user_id: uzivatel.user_id }
      );

      if (error) {
        throw error;
      }

      await nactiUzivatele();
      nastavStav(
        tAdmin(
          "admin.rejected",
          "Registrace byla zamítnuta."
        )
      );
        } catch (error) {
          console.error("Admin reject failed:", error);
          nastavStav(
            tAdmin(
              "admin.actionFailed",
              "Akci se nepodařilo dokončit."
            ),
            true
          );
        }
      }
    });
  }

  async function smazUzivatele(uzivatel) {
    const email = bezpecnyText(uzivatel.email || "—");

    otevriAdminPotvrzeni({
      nadpis: tAdmin(
        "admin.deleteUser",
        "Smazat účet"
      ),
      zprava: tAdmin(
        "admin.deleteUserConfirm",
        `Opravdu trvale smazat účet ${email}? Tuto akci nelze vrátit zpět.`,
        { email }
      ),
      potvrditText: tAdmin(
        "admin.deleteUser",
        "Smazat účet"
      ),
      nebezpecne: true,
      poPotvrzeni: async () => {
        nastavStav(
          tAdmin("admin.deletingUser", "Mažu účet…")
        );

        try {
          const { error } = await supabaseClient.rpc(
            "lubanote_admin_delete_user",
            { p_user_id: uzivatel.user_id }
          );

          if (error) {
            const zprava = String(error?.message || "");

            if (zprava.includes("USER_HAS_STORAGE_OBJECTS")) {
              nastavStav(
                tAdmin(
                  "admin.deleteUserHasStorage",
                  "Účet má ještě soubory ve Storage. Nejdřív je potřeba bezpečně odstranit přílohy."
                ),
                true
              );
              return;
            }

            if (
              zprava.includes("ADMIN_ACCOUNT_DELETE_FORBIDDEN") ||
              zprava.includes("CANNOT_DELETE_SELF")
            ) {
              nastavStav(
                tAdmin(
                  "admin.deleteUserForbidden",
                  "Tento účet nelze z Admin Dashboardu smazat."
                ),
                true
              );
              return;
            }

            throw error;
          }

          await nactiUzivatele();
          nastavStav(
            tAdmin(
              "admin.userDeleted",
              "Účet byl trvale smazán."
            )
          );
        } catch (error) {
          console.error("Admin delete user failed:", error);
          nastavStav(
            tAdmin(
              "admin.actionFailed",
              "Akci se nepodařilo dokončit."
            ),
            true
          );
        }
      }
    });
  }

  function vykresliUzivatele() {
    seznam.replaceChildren();

    let zobrazovani = uzivatele;

    if (filtr === "pending") {
      zobrazovani = uzivatele.filter(
        (u) => u.account_status === "pending"
      );
    } else if (filtr === "active") {
      zobrazovani = uzivatele.filter(jeAktivniUcet);
    } else if (filtr === "expired") {
      zobrazovani = uzivatele.filter(jeUkonceneDemo);
    }

    if (!zobrazovani.length) {
      const prazdne = document.createElement("div");
      prazdne.className = "adminEmptyState";

      const zpravy = {
        pending: tAdmin(
          "admin.noPending",
          "Žádné registrace nečekají na schválení."
        ),
        active: tAdmin(
          "admin.noActive",
          "Nejsou zde žádné aktivní účty."
        ),
        expired: tAdmin(
          "admin.noExpiredDemo",
          "Nejsou zde žádná ukončená Dema."
        ),
        all: tAdmin(
          "admin.noUsers",
          "Zatím nejsou žádní uživatelé."
        )
      };

      prazdne.textContent = zpravy[filtr] || zpravy.all;
      seznam.append(prazdne);
      return;
    }

    for (const uzivatel of zobrazovani) {
      const karta = document.createElement("article");
      karta.className = "adminUserCard";

      const top = document.createElement("div");
      top.className = "adminUserTop";

      const identita = document.createElement("div");
      identita.className = "adminUserIdentity";

      const email = document.createElement("span");
      email.className = "adminUserEmail";
      email.textContent = bezpecnyText(
        uzivatel.email || "—"
      );

      const registrace = document.createElement("span");
      registrace.className = "adminUserRegistered";
      registrace.textContent = `${tAdmin(
        "admin.registered",
        "Registrace"
      )}: ${formatDatum(uzivatel.registered_at)}`;

      identita.append(email, registrace);

      const badges = document.createElement("div");
      badges.className = "adminUserBadges";

      if (jeUkonceneDemo(uzivatel)) {
        badges.append(
          vytvorBadge(
            tAdmin("admin.demoExpired", "Demo skončilo"),
            "expired"
          )
        );
      } else {
        badges.append(
          vytvorBadge(
            textStavu(uzivatel.account_status),
            bezpecnyText(uzivatel.account_status)
          )
        );
      }

      if (uzivatel.plan_id) {
        badges.append(
          vytvorBadge(
            textPlanu(uzivatel.plan_id),
            bezpecnyText(uzivatel.plan_id)
          )
        );
      }

      top.append(identita, badges);
      karta.append(top);

      const meta = document.createElement("div");
      meta.className = "adminUserMeta";
      meta.append(
        vytvorRadekMeta(
          tAdmin("admin.email", "E-mail"),
          uzivatel.email_confirmed_at
            ? tAdmin("admin.emailConfirmed", "potvrzen")
            : tAdmin("admin.emailUnconfirmed", "nepotvrzen")
        ),
        vytvorRadekMeta(
          tAdmin("admin.plan", "Plán"),
          textPlanu(uzivatel.plan_id)
        )
      );

      if (uzivatel.demo_until) {
        meta.append(
          vytvorRadekMeta(
            tAdmin("admin.demoUntil", "Demo do"),
            formatDatum(uzivatel.demo_until)
          )
        );
      }

      karta.append(meta);

      if (jeUkonceneDemo(uzivatel)) {
        const akce = document.createElement("div");
        akce.className = "adminUserActions";

        const prodlouzit = document.createElement("button");
        prodlouzit.type = "button";
        prodlouzit.className = "adminApproveButton";
        prodlouzit.textContent = tAdmin(
          "admin.extendDemo",
          "Prodloužit Demo"
        );
        prodlouzit.addEventListener(
          "click",
          () => prodluzDemo(uzivatel)
        );

        akce.append(prodlouzit);
        karta.append(akce);
      }

      if (uzivatel.account_status === "pending") {
        const akce = document.createElement("div");
        akce.className = "adminUserActions";

        const schvalit = document.createElement("button");
        schvalit.type = "button";
        schvalit.className = "adminApproveButton";
        schvalit.textContent = tAdmin(
          "admin.approveDemo",
          "Schválit Demo"
        );
        schvalit.disabled = !uzivatel.email_confirmed_at;
        schvalit.addEventListener(
          "click",
          () => schvalDemo(uzivatel)
        );

        const zamitnout = document.createElement("button");
        zamitnout.type = "button";
        zamitnout.className = "adminRejectButton";
        zamitnout.textContent = tAdmin(
          "admin.reject",
          "Zamítnout"
        );
        zamitnout.addEventListener(
          "click",
          () => zamitniUzivatele(uzivatel)
        );

        akce.append(schvalit, zamitnout);
        karta.append(akce);
      }

      /*
       * Trvalé smazání je záměrně dostupné jen v přehledu Všichni.
       * INTERNAL účet tlačítko vůbec nedostane a server navíc vždy
       * znovu ověří, že cílový účet není admin ani aktuální uživatel.
       */
      if (
        filtr === "all" &&
        uzivatel.plan_id !== "internal"
      ) {
        const mazaciAkce = document.createElement("div");
        mazaciAkce.className = "adminUserActions";

        const smazat = document.createElement("button");
        smazat.type = "button";
        smazat.className = "adminRejectButton";
        smazat.textContent = tAdmin(
          "admin.deleteUser",
          "Smazat účet"
        );
        smazat.addEventListener(
          "click",
          () => smazUzivatele(uzivatel)
        );

        mazaciAkce.append(smazat);
        karta.append(mazaciAkce);
      }

      seznam.append(karta);
    }
  }

  function aktualizujStatistiky() {
    cekajiciPocet.textContent = String(
      uzivatele.filter(
        (u) => u.account_status === "pending"
      ).length
    );

    aktivniPocet.textContent = String(
      uzivatele.filter(jeAktivniUcet).length
    );

    demoPocet.textContent = String(
      uzivatele.filter(
        (u) => jeAktivniUcet(u) && u.plan_id === "demo"
      ).length
    );

    ukonceneDemoPocet.textContent = String(
      uzivatele.filter(jeUkonceneDemo).length
    );
  }

  async function nactiUzivatele() {
    if (nacitam || !jeAdmin) {
      return;
    }

    if (!navigator.onLine) {
      nastavStav(
        tAdmin(
          "admin.offline",
          "Admin Dashboard vyžaduje připojení k internetu."
        ),
        true
      );
      return;
    }

    nacitam = true;
    obnovitTlacitko.disabled = true;
    nastavStav(
      tAdmin("admin.loading", "Načítám uživatele…")
    );

    try {
      const pripraven = await pripravClient();
      if (!pripraven || !supabaseClient) {
        throw new Error("Supabase unavailable");
      }

      const { data, error } = await supabaseClient.rpc(
        "lubanote_admin_list_users",
        { p_status: null }
      );

      if (error) {
        throw error;
      }

      uzivatele = Array.isArray(data) ? data : [];
      aktualizujStatistiky();
      vykresliUzivatele();
      nastavStav("");
    } catch (error) {
      console.error("Admin users load failed:", error);
      nastavStav(
        tAdmin(
          "admin.loadFailed",
          "Uživatele se nepodařilo načíst."
        ),
        true
      );
    } finally {
      nacitam = false;
      obnovitTlacitko.disabled = false;
    }
  }

  function nastavFiltr(novyFiltr) {
    const povolene = new Set([
      "pending",
      "active",
      "expired",
      "all"
    ]);

    filtr = povolene.has(novyFiltr)
      ? novyFiltr
      : "pending";

    const taby = [
      [cekajiciTab, "pending"],
      [aktivniTab, "active"],
      [ukonceneDemoTab, "expired"],
      [vsichniTab, "all"]
    ];

    for (const [tlacitko, hodnota] of taby) {
      const aktivni = filtr === hodnota;
      tlacitko.classList.toggle("active", aktivni);
      tlacitko.setAttribute("aria-selected", String(aktivni));
    }

    vykresliUzivatele();
  }

  function aktualizujTexty() {
    const title = document.getElementById("adminDashboardTitle");
    const menuLabel = menuTlacitko.querySelector(".mainMenuLabel");
    const desktopLabel = desktopTlacitko?.querySelector("span:last-child");

    const nazev = tAdmin(
      "admin.title",
      "Admin Dashboard"
    );

    if (title) title.textContent = nazev;
    if (menuLabel) menuLabel.textContent = nazev;
    if (desktopLabel) desktopLabel.textContent = nazev;

    const texty = {
      adminDashboardIntro: [
        "admin.toolsIntro",
        "Správa účtů a interní nástroje LubaNote."
      ],
      adminAccountsToolTitle: ["admin.accountsTool", "Účty"],
      adminAccountsToolDescription: [
        "admin.accountsToolDescription",
        "Registrace, Demo a správa uživatelů"
      ],
      adminVisualDebugToolDescription: [
        "admin.visualDebugDescription",
        "Vizuální ladění prvků aplikace"
      ],
      adminDebugHubToolDescription: [
        "admin.debugHubDescription",
        "Diagnostika, logy a testovací moduly"
      ],
      adminSyncTrafficToolTitle: [
        "admin.syncTrafficTitle",
        "RX/TX/E panel"
      ],
      adminNotesVisualTitle: [
        "admin.notesVisualTitle",
        "Poznámky – vzhled"
      ],
      adminNotesVisualDescription: [
        "admin.notesVisualDescription",
        "Vyber prvek a laď ho živě. Hodnoty zůstávají jen v tomto zařízení."
      ],
      adminNotesVisualFloatingButton: [
        "admin.notesVisualFloatingButton",
        "🎛️ Otevřít plovoucí ladění"
      ],
      adminNotesVisualTargetLabel: [
        "admin.notesVisualTarget",
        "Prvek"
      ],
      adminNotesSelectedSectionTitle: [
        "admin.notesSelectedSection",
        "Vybraný prvek"
      ],
      adminNotesSelectedSectionHint: [
        "admin.notesSelectedHint",
        "Border, barva, radius a velikost se mění pouze u vybraného prvku."
      ],
      adminNotesBorderToggleLabel: [
        "admin.notesBorderToggle",
        "Border"
      ],
      adminNotesBorderModeLabel: [
        "admin.notesBorderMode",
        "Odstín borderu"
      ],
      adminNotesBorderWidthLabel: [
        "admin.notesBorderWidth",
        "Šířka borderu"
      ],
      adminNotesBorderStrengthLabel: [
        "admin.notesBorderStrength",
        "Síla zesvětlení / ztmavení"
      ],
      adminNotesBorderRadiusLabel: [
        "admin.notesBorderRadius",
        "Zaoblení rohů"
      ],
      adminNotesLayoutTitle: [
        "admin.notesLayoutTitle",
        "Rozložení hlavního screenu"
      ],
      adminNotesLayoutHint: [
        "admin.notesLayoutHint",
        "Jemné mezery a posuny bez zásahu do dat nebo logiky aplikace."
      ],
      adminNotesOffsetYLabel: [
        "admin.notesOffsetY",
        "Posun obsahu nahoru / dolů"
      ],
      adminNotesActionsFiltersGapLabel: [
        "admin.notesActionsFiltersGap",
        "Mezera akce ↕ filtry"
      ],
      adminNotesFilterGapLabel: [
        "admin.notesFilterGap",
        "Mezera hlavních filtrů"
      ],
      adminNotesTagsGapLabel: [
        "admin.notesTagsGap",
        "Mezera mezi štítky"
      ],
      adminNotesRowsGapLabel: [
        "admin.notesRowsGap",
        "Mezera filtry ↕ štítky"
      ],
      adminNotesTagsCardsGapLabel: [
        "admin.notesTagsCardsGap",
        "Mezera štítky ↕ karty"
      ],
      adminNotesCardColumnGapLabel: [
        "admin.notesCardColumnGap",
        "Mezera mezi sloupci karet"
      ],
      adminNotesCardRowGapLabel: [
        "admin.notesCardRowGap",
        "Mezera pod kartami"
      ],
      adminNotesVisualHint: [
        "admin.notesVisualHint",
        "Tip: u karet lze samostatně sladit šířku borderu a radius; swipe vrstva používá správný vnitřní radius, takže rohy neprosvítají."
      ],
      adminAccountsHeading: ["admin.accountsHeading", "Správa účtů"]
    };

    for (const [id, [klic, vychozi]] of Object.entries(texty)) {
      const prvek = document.getElementById(id);
      if (prvek) prvek.textContent = tAdmin(klic, vychozi);
    }

    const notesModeDark = document.getElementById("adminNotesBorderModeDark");
    const notesModeLight = document.getElementById("adminNotesBorderModeLight");
    const notesModeLegacy = document.getElementById("adminNotesBorderModeLegacy");

    if (notesModeDark) {
      notesModeDark.textContent = tAdmin(
        "admin.notesBorderModeDark",
        "Tmavší barva"
      );
    }
    if (notesModeLight) {
      notesModeLight.textContent = tAdmin(
        "admin.notesBorderModeLight",
        "Světlejší barva"
      );
    }
    if (notesModeLegacy) {
      notesModeLegacy.textContent = tAdmin(
        "admin.notesBorderModeLegacy",
        "Původní"
      );
    }

    const targetTexty = {
      adminNotesTargetCards: ["admin.notesTargetCards", "Karty poznámek"],
      adminNotesTargetTags: ["admin.notesTargetTags", "Vlastní štítky"],
      adminNotesTargetPrimary: ["admin.notesTargetPrimary", "Hlavní filtry"],
      adminNotesTargetSearch: ["admin.notesTargetSearch", "Hledání"],
      adminNotesTargetActions: ["admin.notesTargetActions", "Horní akční ikony"],
      adminNotesTargetTraffic: ["admin.notesTargetTraffic", "RX/TX/E panel"],
      adminNotesTargetModules: ["admin.notesTargetModules", "Poznámky / Plán / Dokumenty"],
      adminNotesTargetFab: ["admin.notesTargetFab", "Plovoucí +"]
    };
    for (const [id, [klic, vychozi]] of Object.entries(targetTexty)) {
      const prvek = document.getElementById(id);
      if (prvek) prvek.textContent = tAdmin(klic, vychozi);
    }

    if (notesVisualResetVybrany) {
      notesVisualResetVybrany.textContent = tAdmin(
        "admin.notesVisualResetSelected",
        "Reset prvku"
      );
    }
    if (notesVisualResetTlacitko) {
      notesVisualResetTlacitko.textContent = tAdmin(
        "admin.notesVisualReset",
        "Vše výchozí"
      );
    }

    zpetNaNastrojeTlacitko.textContent = `‹ ${tAdmin(
      "admin.toolsBack",
      "Nástroje"
    )}`;

    document.getElementById("adminPendingLabel").textContent =
      tAdmin("admin.pending", "Čeká");
    document.getElementById("adminActiveLabel").textContent =
      tAdmin("admin.active", "Aktivní");
    document.getElementById("adminDemoLabel").textContent =
      tAdmin("admin.demoActive", "Demo aktivní");
    document.getElementById("adminExpiredDemoLabel").textContent =
      tAdmin("admin.demoExpired", "Demo skončilo");

    cekajiciTab.textContent =
      tAdmin("admin.pendingTab", "Čekající");
    aktivniTab.textContent =
      tAdmin("admin.activeTab", "Aktivní");
    ukonceneDemoTab.textContent =
      tAdmin("admin.expiredTab", "Demo skončilo");
    vsichniTab.textContent =
      tAdmin("admin.allTab", "Všichni");

    obnovitTlacitko.setAttribute(
      "aria-label",
      tAdmin("admin.refresh", "Obnovit uživatele")
    );

    zavritTlacitko.setAttribute(
      "aria-label",
      tAdmin(
        "admin.close",
        "Zavřít Admin Dashboard"
      )
    );

    aktualizujSyncTrafficNastroj();
    aktualizujNotesVisualTuning();

    if (!modal.hidden && !uctyPohled.hidden) {
      vykresliUzivatele();
    }
  }

  async function otevriDashboard() {
    if (!jeAdmin) {
      return;
    }

    const hlavniMenu =
      document.getElementById("mainMenu");
    const hlavniMenuButton =
      document.getElementById("mainMenuButton");

    if (hlavniMenu) {
      hlavniMenu.hidden = true;
    }
    hlavniMenuButton?.setAttribute(
      "aria-expanded",
      "false"
    );

    modal.hidden = false;
    zobrazDomov();
  }

  function zavriDashboard() {
    modal.hidden = true;
    zobrazDomov();
  }

  async function otevriUcty() {
    if (!jeAdmin) return;
    zobrazUcty();
    nastavFiltr("pending");
    await nactiUzivatele();
  }

  function otevriVisualDebugZAdmina() {
    if (!jeAdmin) return;
    zavriDashboard();
    window.LubaNoteVisualDebug?.open?.();
  }

  function otevriDebugHubZAdmina() {
    if (!jeAdmin) return;
    zavriDashboard();
    window.LubaNoteVisualDebug?.showDock?.();
    window.LubaNoteDebugHub?.open?.();
  }

  /* PATCH 627A – vývojový nouzový 5× tap.
   *
   * Přesně navazuje na původní gesto LubaNote: 5× rychle klepnout na
   * záložku „Poznámky“. Záložní cíle jsou staré logo/login logo, pokud
   * na dané obrazovce existují. Po odemčení rovnou zobrazíme společný
   * debug dock a spustíme Start / sync / síť, aby šel problém okamžitě
   * zkopírovat i tehdy, když Admin Dashboard kvůli startu vůbec nenaběhl.
   */
  function spustNouzovyDebug() {
    if (!POVOLIT_NOUZOVY_DEBUG_5X) return false;

    nouzovyDevDebug = true;
    nouzoveKliky = [];

    console.warn(
      "DEV DEBUG 627A | EMERGENCY 5X UNLOCK | session only"
    );

    window.LubaNoteVisualDebug?.showDock?.();

    if (window.LubaNoteDebugHub?.startStartup?.()) {
      return true;
    }

    return Boolean(window.LubaNoteDebugHub?.open?.());
  }

  function registrujNouzovyDebug5x() {
    if (!POVOLIT_NOUZOVY_DEBUG_5X) return;

    const cile = [
      document.getElementById("notesModuleButton"),
      document.querySelector(".moduleLogo"),
      document.querySelector(".loginLogoImage")
    ].filter(Boolean);

    const zpracujKlik = () => {
      const ted = performance.now();

      nouzoveKliky = nouzoveKliky.filter(
        cas => ted - cas < NOUZOVY_DEBUG_OKNO_MS
      );
      nouzoveKliky.push(ted);

      if (nouzoveKliky.length >= 5) {
        spustNouzovyDebug();
      }
    };

    cile.forEach(prvek => {
      prvek.addEventListener("click", zpracujKlik, true);
    });
  }

  menuTlacitko.addEventListener(
    "click",
    otevriDashboard
  );

  desktopTlacitko?.addEventListener(
    "click",
    otevriDashboard
  );

  zavritTlacitko.addEventListener(
    "click",
    zavriDashboard
  );

  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      zavriDashboard();
    }
  });

  uctyTlacitko.addEventListener("click", otevriUcty);
  visualDebugTlacitko.addEventListener(
    "click",
    otevriVisualDebugZAdmina
  );
  debugHubTlacitko.addEventListener(
    "click",
    otevriDebugHubZAdmina
  );
  syncTrafficTlacitko.addEventListener(
    "click",
    prepniSyncTrafficPanel
  );
  notesVisualToolTlacitko?.addEventListener(
    "click",
    otevriPlovouciNotesTuning
  );
  plannerVisualToolTlacitko?.addEventListener(
    "click",
    otevriPlovouciPlannerTuning
  );
  documentsVisualToolTlacitko?.addEventListener(
    "click",
    otevriPlovouciDocumentsTuning
  );
  plannerIconsToolTlacitko?.addEventListener(
    "click",
    () => prepniPlannerIkony("plan")
  );
  reminderIconsToolTlacitko?.addEventListener(
    "click",
    () => prepniPlannerIkony("pripominky")
  );
  notesVisualFloatingTlacitko?.addEventListener(
    "click",
    otevriPlovouciNotesTuning
  );
  window.addEventListener(
    "lubanote:sync-traffic-visibility-change",
    aktualizujSyncTrafficNastroj
  );
  notesVisualTarget?.addEventListener("change", () => {
    window.LubaNoteNotesVisualTuning
      ?.nastavVybranyPrvek?.(notesVisualTarget.value);
  });
  notesBorderTlacitko?.addEventListener("click", prepniNotesBorder);
  notesBorderRezim?.addEventListener("change", () => {
    window.LubaNoteNotesVisualTuning?.nastavPrvekHodnotu?.(
      ziskejVybranyNotesPrvek(),
      "borderRezim",
      notesBorderRezim.value
    );
  });
  notesBorderSirka?.addEventListener("input", () => {
    window.LubaNoteNotesVisualTuning?.nastavPrvekHodnotu?.(
      ziskejVybranyNotesPrvek(),
      "borderSirka",
      notesBorderSirka.value
    );
  });
  notesBorderSila?.addEventListener("input", () => {
    window.LubaNoteNotesVisualTuning?.nastavPrvekHodnotu?.(
      ziskejVybranyNotesPrvek(),
      "borderSila",
      notesBorderSila.value
    );
  });
  notesBorderRadius?.addEventListener("input", () => {
    window.LubaNoteNotesVisualTuning?.nastavPrvekHodnotu?.(
      ziskejVybranyNotesPrvek(),
      "radius",
      notesBorderRadius.value
    );
  });
  notesElementSize?.addEventListener("input", () => {
    window.LubaNoteNotesVisualTuning?.nastavPrvekHodnotu?.(
      ziskejVybranyNotesPrvek(),
      "velikost",
      notesElementSize.value
    );
  });
  notesVisualResetVybrany?.addEventListener("click", () => {
    window.LubaNoteNotesVisualTuning?.obnovVybranyPrvek?.();
  });
  notesVisualResetTlacitko?.addEventListener("click", () => {
    window.LubaNoteNotesVisualTuning?.obnovVychozi?.();
  });
  notesOffsetY?.addEventListener("input", () => {
    window.LubaNoteNotesVisualTuning?.nastavLayoutHodnotu?.(
      "offsetY",
      notesOffsetY.value
    );
  });
  notesActionsFiltersGap?.addEventListener("input", () => {
    window.LubaNoteNotesVisualTuning?.nastavLayoutHodnotu?.(
      "akceFiltryMezera",
      notesActionsFiltersGap.value
    );
  });
  notesFilterGap?.addEventListener("input", () => {
    window.LubaNoteNotesVisualTuning?.nastavLayoutHodnotu?.(
      "filtrMezera",
      notesFilterGap.value
    );
  });
  notesTagsGap?.addEventListener("input", () => {
    window.LubaNoteNotesVisualTuning?.nastavLayoutHodnotu?.(
      "stitkyMezera",
      notesTagsGap.value
    );
  });
  notesRowsGap?.addEventListener("input", () => {
    window.LubaNoteNotesVisualTuning?.nastavLayoutHodnotu?.(
      "radkyMezera",
      notesRowsGap.value
    );
  });
  notesTagsCardsGap?.addEventListener("input", () => {
    window.LubaNoteNotesVisualTuning?.nastavLayoutHodnotu?.(
      "stitkyKartyMezera",
      notesTagsCardsGap.value
    );
  });
  notesCardColumnGap?.addEventListener("input", () => {
    window.LubaNoteNotesVisualTuning?.nastavLayoutHodnotu?.(
      "kartySloupceMezera",
      notesCardColumnGap.value
    );
  });
  notesCardRowGap?.addEventListener("input", () => {
    window.LubaNoteNotesVisualTuning?.nastavLayoutHodnotu?.(
      "kartyRadkyMezera",
      notesCardRowGap.value
    );
  });
  window.addEventListener(
    "lubanote:notes-visual-tuning-change",
    aktualizujNotesVisualTuning
  );
  window.addEventListener(
    "lubanote:planner-visual-tuning-change",
    aktualizujPlannerVisualNastroje
  );
  zpetNaNastrojeTlacitko.addEventListener(
    "click",
    zobrazDomov
  );

  cekajiciTab.addEventListener(
    "click",
    () => nastavFiltr("pending")
  );

  aktivniTab.addEventListener(
    "click",
    () => nastavFiltr("active")
  );

  ukonceneDemoTab.addEventListener(
    "click",
    () => nastavFiltr("expired")
  );

  vsichniTab.addEventListener(
    "click",
    () => nastavFiltr("all")
  );

  obnovitTlacitko.addEventListener(
    "click",
    nactiUzivatele
  );

  window.addEventListener(
    "lubanote:language-change",
    aktualizujTexty
  );

  /* PATCH 627 – Admin diagnostika nesmí být závislá na dokončení syncu.
   *
   * Dříve se serverové ověření admina spustilo až po splash-ready.
   * Když se startovní sync zasekl/selhal ještě před splash-ready, zmizel
   * současně Admin Dashboard, Visual Debug i Debug Hub – tedy právě nástroje,
   * které jsou potřeba k diagnostice problému.
   *
   * Bezpečnost se nemění: žádný lokální bypass. Admin nástroje se stále
   * zobrazí jen po úspěšném RPC lubanote_admin_is_current_user = true.
   */
  window.addEventListener("online", () => {
    if (ucetAktivni) {
      overAdmina();
    }
  });

  window.addEventListener(
    "lubanote:account-active",
    () => {
      ucetAktivni = true;
      overAdmina();
    }
  );

  window.addEventListener(
    "lubanote:splash-ready",
    () => {
      if (startUiPripraven) return;
      startUiPripraven = true;

      /* PATCH 658AU – admin check nesmí záviset na pořadí
       * account-active vs splash-ready. RPC samo bezpečně ověří,
       * zda je aktuální relace skutečně admin. */
      if (navigator.onLine) {
        overAdmina();
      }
    }
  );

  window.addEventListener(
    "lubanote:auth-expired",
    () => {
      ucetAktivni = false;
      nastavViditelnostAdmina(false);
    }
  );

  /* PATCH 658AU – při otevření servisního menu vždy obnovit serverové
   * ověření admina. Opravuje stav, kdy UI zůstalo hidden po změně
   * pořadí startovacích událostí. Bez lokálního bypassu oprávnění. */
  hlavniMenuTlacitko?.addEventListener("click", () => {
    if (navigator.onLine) {
      overAdmina();
    }
  });

  registrujNouzovyDebug5x();
  aktualizujTexty();

  /*
   * Při startu se admin RPC nespouští před hlavním syncem.
   * Kontrola proběhne po splash-ready; při pozdější změně účtu
   * nebo návratu internetu se zachová původní chování.
   */
})();
