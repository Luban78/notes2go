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
  const serverPohled =
    document.getElementById("adminServerView");
  const serverTlacitko =
    document.getElementById("adminServerToolButton");
  const serverZpetTlacitko =
    document.getElementById("adminServerBackButton");
  const uiPohled =
    document.getElementById("adminUiView");
  const uiTlacitko =
    document.getElementById("adminUiToolButton");
  const uiZpetTlacitko =
    document.getElementById("adminUiBackButton");
  const serverToolStav =
    document.getElementById("adminServerToolState");
  const serverObnovitTlacitko =
    document.getElementById("adminServerRefreshButton");
  const serverOverall =
    document.getElementById("adminServerOverall");
  const serverUpdated =
    document.getElementById("adminServerUpdated");
  const serverUptime =
    document.getElementById("adminServerUptime");
  const serverCpu =
    document.getElementById("adminServerCpu");
  const serverRam =
    document.getElementById("adminServerRam");
  const serverDisk =
    document.getElementById("adminServerDisk");
  const serverDiskFree =
    document.getElementById("adminServerDiskFree");
  const serverBattery =
    document.getElementById("adminServerBattery");
  const serverSupabase =
    document.getElementById("adminServerSupabase");
  const serverDocker =
    document.getElementById("adminServerDocker");
  const serverCloudflare =
    document.getElementById("adminServerCloudflare");
  const serverStatusMessage =
    document.getElementById("adminServerStatusMessage");
  const deviceBackendName =
    document.getElementById("adminDeviceBackendName");
  const deviceBackendMode =
    document.getElementById("adminDeviceBackendMode");
  const deviceBackendBadge =
    document.getElementById("adminDeviceBackendBadge");
  const deviceBackendMessage =
    document.getElementById("adminDeviceBackendMessage");
  const useLubaServerTlacitko =
    document.getElementById("adminUseLubaServerButton");
  const useTestLubaServerTlacitko =
    document.getElementById("adminUseTestLubaServerButton");
  const useCloudTlacitko =
    document.getElementById("adminUseCloudButton");
  const migrationStav =
    document.getElementById("adminMigrationState");
  const migrationZprava =
    document.getElementById("adminMigrationMessage");
  const migrationPrepareTlacitko =
    document.getElementById("adminMigrationPrepareButton");
  const migrationVerifyTlacitko =
    document.getElementById("adminMigrationVerifyButton");
  const migrationCutoverTlacitko =
    document.getElementById("adminMigrationCutoverButton");
  const migrationDestinationInput =
    document.getElementById("adminMigrationDestinationInput");
  const migrationDestinationSave =
    document.getElementById("adminMigrationDestinationSave");
  const migrationUseCloud =
    document.getElementById("adminMigrationUseCloud");
  const migrationUseLubaServer =
    document.getElementById("adminMigrationUseLubaServer");
  const migrationSourceLabel =
    document.getElementById("adminMigrationSourceLabel");
  const migrationDestinationLabel =
    document.getElementById("adminMigrationDestinationLabel");
  const migrationDestinationHint =
    document.getElementById("adminMigrationDestinationHint");
  const migrationProgress =
    document.getElementById("adminMigrationProgress");
  const migrationProgressTitulek =
    document.getElementById("adminMigrationProgressTitle");
  const migrationProgressMeta =
    document.getElementById("adminMigrationProgressMeta");
  const migrationProgressBar =
    document.getElementById("adminMigrationProgressBarFill");
  const migrationProgressSeznam =
    document.getElementById("adminMigrationProgressList");
  const migrationConfirmModal =
    document.getElementById("adminMigrationConfirmModal");
  const migrationConfirmBadge =
    document.getElementById("adminMigrationConfirmBadge");
  const migrationConfirmTitulek =
    document.getElementById("adminMigrationConfirmTitle");
  const migrationConfirmText =
    document.getElementById("adminMigrationConfirmText");
  const migrationConfirmSourceName =
    document.getElementById("adminMigrationConfirmSourceName");
  const migrationConfirmSource =
    document.getElementById("adminMigrationConfirmSource");
  const migrationConfirmCutover =
    document.getElementById("adminMigrationConfirmCutover");
  const migrationConfirmHint =
    document.getElementById("adminMigrationConfirmHint");
  const migrationConfirmOk =
    document.getElementById("adminMigrationConfirmOk");
  const migrationConfirmCancel =
    document.getElementById("adminMigrationConfirmCancel");
  const migrationConfirmClose =
    document.getElementById("adminMigrationConfirmClose");
  const controlStav =
    document.getElementById("adminControlState");
  const controlZprava =
    document.getElementById("adminControlMessage");
  const controlMaintenanceTlacitko =
    document.getElementById("adminControlMaintenanceButton");
  const controlNormalTlacitko =
    document.getElementById("adminControlNormalButton");
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
    !serverPohled ||
    !serverTlacitko ||
    !serverZpetTlacitko ||
    !uiPohled ||
    !uiTlacitko ||
    !uiZpetTlacitko ||
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
  let serverStatusNacitam = false;
  let serverStatusTimer = null;
  let migrationStatusNacitam = false;
  let migrationAkceBezi = false;
  let migrationLiveTimer = null;
  let migrationPosledniStatus = null;
  let migrationConfirmResolve = null;
  let migrationOcekavanyJobId = "";
  const CUTOVER_CONSOLE_SESSION_KEY = "lubanoteAdminCutoverConsoleV1";
  let migrationCutoverKonzoleZapnuta = sessionStorage.getItem(CUTOVER_CONSOLE_SESSION_KEY) === "1";
  let controlStatusNacitam = false;
  let controlAkceBezi = false;
  let controlPosledniStatus = null;
  const MIGRATION_CONTROL_BASE = "https://api.lubanote.com/migration/v1";
  const CONTROL_POINT_BASE = "https://api.lubanote.com/control/v1";
  const MIGRATION_LIVE_INTERVAL_MS = 1200;
  const BACKEND_SESSION_HANDOFF_KEY = "lubanoteBackendSessionHandoffV1";

  /* PATCH 679H – CUTOVER konzole zůstává během MAINTENANCE dostupná jen
   * pro ověřeného admina na Server/Migrace pohledu. Běžné LubaNote UI
   * zůstává write-frozen. Session flag přežije jediný backend reload. */
  function jeCutoverKonzoleAktivni() {
    return Boolean(
      migrationCutoverKonzoleZapnuta &&
      jeAdmin &&
      modal && !modal.hidden &&
      serverPohled && !serverPohled.hidden
    );
  }

  function oznamCutoverKonzoli() {
    if (modal) modal.dataset.cutoverConsole = jeCutoverKonzoleAktivni() ? "1" : "0";
    window.dispatchEvent(new CustomEvent("lubanote:admin-cutover-console-change", {
      detail: { active: jeCutoverKonzoleAktivni() }
    }));
  }

  function nastavCutoverKonzoli(aktivni, { zachovatSession = false } = {}) {
    migrationCutoverKonzoleZapnuta = Boolean(aktivni);
    if (migrationCutoverKonzoleZapnuta) {
      sessionStorage.setItem(CUTOVER_CONSOLE_SESSION_KEY, "1");
    } else if (!zachovatSession) {
      sessionStorage.removeItem(CUTOVER_CONSOLE_SESSION_KEY);
    }
    oznamCutoverKonzoli();
  }

  window.LubaNoteAdminCutoverConsole = Object.freeze({
    jeAktivni: jeCutoverKonzoleAktivni
  });

  /* PATCH 677J – Android/WebView systémové Zpět uvnitř Admin Dashboardu.
   * Dashboard dostane vlastní lehkou history vrstvu: Server/UI/Účty ->
   * Dashboard -> aplikace. Systémové Zpět tak už nespadne rovnou ven z APK.
   */
  const ADMIN_HISTORY_KEY = "lubanoteAdminDashboardViewV1";
  let adminHistoryDepth = 0;

  /* PATCH 677G – GLOBÁLNÍ VÝVOJOVÝ 5× TAP PRO DEBUG.
   *
   * Před veřejným vydáním odstranit / přepnout na false.
   * Nezapisuje se do localStorage a po reloadu je znovu zamčený.
   * Pět krátkých tapů prakticky na stejném místě funguje na libovolné
   * obrazovce včetně Core V2 editoru a LubaKeyboard. Gesto pouze odemkne
   * interní nástroje pro aktuální relaci; běžný tap/scroll nijak neblokuje.
   */
  const POVOLIT_NOUZOVY_DEBUG_5X = true;
  const NOUZOVY_DEBUG_OKNO_MS = 2800;
  const NOUZOVY_DEBUG_RADIUS_PX = 44;
  const NOUZOVY_DEBUG_MAX_POHYB_PX = 18;
  const NOUZOVY_DEBUG_MAX_TAP_MS = 520;
  let nouzovyDevDebug = false;
  let nouzoveKliky = [];
  let nouzovyPointerStart = null;

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

  function zastavServerStatusAutoRefresh() {
    if (serverStatusTimer) {
      clearInterval(serverStatusTimer);
      serverStatusTimer = null;
    }
    zastavMigrationLiveRefresh();
  }

  function zobrazDomov() {
    domov.hidden = false;
    uctyPohled.hidden = true;
    serverPohled.hidden = true;
    uiPohled.hidden = true;
    zastavServerStatusAutoRefresh();
    aktualizujSyncTrafficNastroj();
    oznamCutoverKonzoli();
  }

  function zobrazUcty() {
    domov.hidden = true;
    uctyPohled.hidden = false;
    serverPohled.hidden = true;
    uiPohled.hidden = true;
    zastavServerStatusAutoRefresh();
    oznamCutoverKonzoli();
  }

  function zobrazServer() {
    if (!jeAdmin) return;
    domov.hidden = true;
    uctyPohled.hidden = true;
    serverPohled.hidden = false;
    uiPohled.hidden = true;
    aktualizujSyncTrafficNastroj();
    aktualizujBackendZarizeniUi();
    nactiServerStatus();
    nactiMigrationStatus();
    nactiControlStatus();
    zastavServerStatusAutoRefresh();
    serverStatusTimer = setInterval(() => {
      if (!serverPohled.hidden && !modal.hidden) {
        nactiServerStatus({ tichy: true });
        nactiMigrationStatus({ tichy: true });
        nactiControlStatus({ tichy: true });
      }
    }, 15000);
    oznamCutoverKonzoli();
  }

  function zobrazUi() {
    if (!jeAdmin) return;
    domov.hidden = true;
    uctyPohled.hidden = true;
    serverPohled.hidden = true;
    uiPohled.hidden = false;
    zastavServerStatusAutoRefresh();
    oznamCutoverKonzoli();
  }

  function formatBajty(hodnota) {
    const n = Number(hodnota);
    if (!Number.isFinite(n) || n < 0) return "—";
    const gb = n / (1024 ** 3);
    return `${gb.toLocaleString(locale(), { maximumFractionDigits: 1 })} GB`;
  }

  function formatUptime(sekundy) {
    const celkem = Math.max(0, Math.floor(Number(sekundy) || 0));
    const dny = Math.floor(celkem / 86400);
    const hodiny = Math.floor((celkem % 86400) / 3600);
    const minuty = Math.floor((celkem % 3600) / 60);
    if (dny > 0) return `${dny} d ${hodiny} h`;
    if (hodiny > 0) return `${hodiny} h ${minuty} min`;
    return `${minuty} min`;
  }

  function nastavServerOverall(stav, text) {
    if (serverOverall) {
      serverOverall.dataset.state = stav;
      serverOverall.textContent = text;
    }
    if (serverToolStav) {
      serverToolStav.dataset.state = stav;
      serverToolStav.textContent =
        stav === "ok" ? "ONLINE" :
        stav === "warning" ? "POZOR" :
        stav === "fail" ? "OFFLINE" : "—";
    }
  }

  function vycistiServerStatus(text = "Načítám…") {
    nastavServerOverall("idle", text);
    if (serverUpdated) serverUpdated.textContent = "—";
    [serverUptime, serverCpu, serverRam, serverDisk, serverDiskFree,
      serverBattery, serverSupabase, serverDocker, serverCloudflare]
      .forEach((prvek) => { if (prvek) prvek.textContent = "—"; });
  }

  async function nactiServerStatus({ tichy = false } = {}) {
    if (!jeAdmin || serverStatusNacitam) return;
    serverStatusNacitam = true;
    if (serverObnovitTlacitko) serverObnovitTlacitko.disabled = true;
    if (!tichy) {
      vycistiServerStatus();
      if (serverStatusMessage) serverStatusMessage.textContent = "Načítám stav LubaServeru…";
    }

    try {
      const aktivniProfil = window.LubaNoteBackendConfig?.nactiAktivniProfil?.();
      const pripraven = await pripravClient();
      if (!pripraven || !supabaseClient) {
        throw new Error("Backend klient není dostupný.");
      }

      const { data: statusRows, error } = await supabaseClient.rpc(
        "lubanote_admin_get_server_status"
      );

      if (error) throw error;
      const data = Array.isArray(statusRows) ? statusRows[0] : statusRows;
      if (!data) throw new Error("LubaServer status zatím nemá data.");

      const aktualizovano = data.updated_at ? new Date(data.updated_at) : null;
      const vekMs = aktualizovano && Number.isFinite(aktualizovano.getTime())
        ? Date.now() - aktualizovano.getTime()
        : Infinity;
      const supabaseOk = Number(data.supabase_total) > 0 &&
        Number(data.supabase_healthy) === Number(data.supabase_total);
      const kritickeOk = data.docker_active === true &&
        data.cloudflared_active === true && supabaseOk;

      let stav = "ok";
      let text = "ONLINE";
      if (vekMs > 180000 || !kritickeOk) {
        stav = "fail";
        text = vekMs > 180000 ? "STALE / OFFLINE" : "PROBLÉM";
      } else if (vekMs > 75000 || Number(data.disk_used_percent) >= 75) {
        stav = "warning";
        text = "POZOR";
      }
      nastavServerOverall(stav, text);

      if (serverUpdated) {
        const cas = aktualizovano?.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit", second: "2-digit" }) || "—";
        const profil = aktivniProfil?.nazev || "Backend";
        serverUpdated.textContent = `${profil} · aktualizováno ${cas}`;
      }
      if (serverUptime) serverUptime.textContent = formatUptime(data.uptime_seconds);
      if (serverCpu) {
        const load = Number(data.load_1);
        serverCpu.textContent = Number.isFinite(load) ? `load ${load.toLocaleString(locale(), { maximumFractionDigits: 2 })}` : "—";
      }
      if (serverRam) serverRam.textContent = `${formatBajty(data.memory_used_bytes)} / ${formatBajty(data.memory_total_bytes)}`;
      if (serverDisk) {
        const pct = Number(data.disk_used_percent);
        serverDisk.textContent = `${formatBajty(data.disk_used_bytes)} / ${formatBajty(data.disk_total_bytes)}${Number.isFinite(pct) ? ` · ${Math.round(pct)} %` : ""}`;
      }
      if (serverDiskFree) serverDiskFree.textContent = formatBajty(data.disk_available_bytes);
      if (serverBattery) {
        const pct = Number(data.battery_percentage);
        const stavRaw = String(data.battery_state || "").trim();
        const stavMapa = {
          Full: "nabito",
          Charging: "nabíjí se",
          Discharging: "vybíjí se",
          "Not charging": "nenabíjí se",
          Unknown: "neznámý stav"
        };
        const napajeni = data.ac_online === true ? "AC" : "baterie";
        const stavBaterie = stavMapa[stavRaw] || stavRaw || napajeni;
        serverBattery.textContent = Number.isFinite(pct)
          ? `${Math.round(pct)} % · ${stavBaterie}`
          : `— · ${stavBaterie}`;
      }
      if (serverSupabase) serverSupabase.textContent = `${Number(data.supabase_healthy) || 0} / ${Number(data.supabase_total) || 0} healthy`;
      if (serverDocker) serverDocker.textContent = data.docker_active === true ? "🟢 aktivní" : "🔴 neaktivní";
      if (serverCloudflare) serverCloudflare.textContent = data.cloudflared_active === true ? "🟢 aktivní" : "🔴 neaktivní";
      if (serverStatusMessage) {
        serverStatusMessage.textContent = kritickeOk
          ? `Host ${data.hostname || "luba-server"} · stavový agent odpovídá.`
          : "Jedna nebo více kritických serverových služeb není v pořádku.";
      }
    } catch (error) {
      console.warn("LubaServer status unavailable:", error?.message || error);
      nastavServerOverall("idle", "NEDOSTUPNÉ");
      if (serverUpdated) serverUpdated.textContent = "Server status bridge není dostupný";
      if (serverStatusMessage) {
        serverStatusMessage.textContent =
          "Na tomto backendu zatím není dostupný bezpečný serverový status. Backend diagnostika a RX/TX/E fungují dál.";
      }
    } finally {
      serverStatusNacitam = false;
      if (serverObnovitTlacitko) serverObnovitTlacitko.disabled = false;
    }
  }

  /* PATCH 677S – MIGRATION UX.
   * PREPARE + VERIFY jsou řízené přes bezpečný Migration Bridge.
   * CUTOVER zůstává fyzicky zamčený. UI používá vlastní LubaNote potvrzení
   * a živý průběh parsovaný pouze z read-only status/log_tail odpovědi Bridge.
   */
  const MIGRATION_PREPARE_KROKY = [
    {
      label: "Source preflight",
      detail: "Připojení a dostupnost zdroje",
      marker: "=== PREPARE V3 / 1: source preflight ==="
    },
    {
      label: "DB snapshot",
      detail: "Čerstvý snapshot SOURCE",
      marker: "=== PREPARE V3 / 2: source DB snapshot ==="
    },
    {
      label: "Source manifesty",
      detail: "Public, Auth a Storage metadata",
      marker: "=== PREPARE V3 / 3: source manifests ==="
    },
    {
      label: "Storage snapshot",
      detail: "Bezpečná kopie objektů ze SOURCE",
      marker: "=== PREPARE V3 / 4: source Storage snapshot ==="
    },
    {
      label: "Destination precheck",
      detail: "Auth + Storage kontrola před mutací",
      marker: "=== PREPARE V3 / 5: destination precheck ==="
    },
    {
      label: "Rollback checkpoint",
      detail: "Bod návratu DESTINATION",
      marker: "=== PREPARE V3 / 6: rollback checkpoint ==="
    },
    {
      label: "Public data apply",
      detail: "Aplikace public dat na DESTINATION",
      marker: "=== PREPARE V3 / 7: public data apply ==="
    }
  ];

  const MIGRATION_VERIFY_KROKY = [
    {
      label: "Public data",
      detail: "Fingerprint tabulek",
      pass: "PASS: PUBLIC DATA fingerprints",
      fail: "FAIL: PUBLIC DATA fingerprints"
    },
    {
      label: "Sekvence",
      detail: "Public sequences",
      pass: "PASS: PUBLIC sequences",
      fail: "FAIL: PUBLIC sequences"
    },
    {
      label: "Auth",
      detail: "Users / identities stable fingerprint",
      pass: "PASS: AUTH users/identities stable fingerprint",
      fail: "FAIL: AUTH users/identities stable fingerprint"
    },
    {
      label: "Storage buckets",
      detail: "Konfigurace bucketů",
      pass: "PASS: STORAGE buckets",
      fail: "FAIL: STORAGE buckets"
    },
    {
      label: "Storage objekty",
      detail: "Seznam objektů SOURCE = DEST",
      pass: "PASS: STORAGE object list",
      fail: "FAIL: STORAGE object list"
    },
    {
      label: "Storage vlastník",
      detail: "owner / owner_id",
      pass: "PASS: STORAGE owner/owner_id",
      fail: "FAIL: STORAGE owner/owner_id"
    },
    {
      label: "Storage SHA",
      detail: "Fyzická shoda souborů",
      pass: "PASS: STORAGE physical SHA",
      fail: "FAIL: STORAGE physical SHA"
    },
    {
      label: "Supabase health",
      detail: "11 služeb musí být healthy",
      pass: "PASS: SUPABASE",
      fail: "FAIL: SUPABASE"
    }
  ];


  const MIGRATION_CUTOVER_KROKY = [
    { label: "Cílový profil", detail: "Veřejné API cíle a klientský profil", marker: "=== CUTOVER 50E43 / 0A: DEST client profile + freeze state ===" },
    { label: "Údržba + drain", detail: "Automatické zamčení produkce a doběhnutí front", marker: "=== CUTOVER 50E43 / 0B: automatic MAINTENANCE + drain ===" },
    { label: "SOURCE freeze", detail: "Databázový write-freeze zdroje", marker: "=== CUTOVER 50E43 / 1: SOURCE freeze ===" },
    { label: "Finální snapshot", detail: "Čerstvý frozen snapshot SOURCE", marker: "=== CUTOVER 50E43 / 2: fresh frozen SOURCE snapshot ===" },
    { label: "DEST drift guard", detail: "Kontrola, že se cíl od PREPARE nezměnil", marker: "=== CUTOVER 50E43 / 3: DEST drift guard ===" },
    { label: "Rollback checkpoint", detail: "Finální bod návratu cílového backendu", marker: "=== CUTOVER 50E43 / 4: final DEST checkpoint ===" },
    { label: "Public data", detail: "Finální public refresh", marker: "=== CUTOVER 50E43 / 5: final public refresh ===" },
    { label: "Auth + Storage delta", detail: "Finální delta po freeze", marker: "=== CUTOVER 50E43 / 5B: frozen Auth/Storage delta ===" },
    { label: "Final VERIFY", detail: "Poslední úplná kontrola shody", marker: "=== CUTOVER 50E43 / 6: final VERIFY ===" },
    { label: "Atomický switch", detail: "Control Point SOURCE → DEST", marker: "=== CUTOVER 50E43 / 7: atomic SOURCE -> DEST switch ===" },
    { label: "DEST zápisy", detail: "Odemknutí cíle a health check", marker: "=== CUTOVER 50E43 / 8: activate DEST writes ===" },
    { label: "NORMAL", detail: "Odemknutí produkčních klientů", marker: "=== CUTOVER 50E43 / 9: publish NORMAL on DEST ===" }
  ];

  function nastavMigrationStav(stav, text) {
    if (!migrationStav) return;
    migrationStav.dataset.state = stav;
    migrationStav.textContent = text;
  }

  function nastavMigrationTlacitkaZamcena() {
    if (migrationPrepareTlacitko) migrationPrepareTlacitko.disabled = true;
    if (migrationVerifyTlacitko) migrationVerifyTlacitko.disabled = true;
    if (migrationCutoverTlacitko) migrationCutoverTlacitko.disabled = true;
  }

  function nastavMigrationOvladani(vysledek) {
    nastavMigrationTlacitkaZamcena();
    if (migrationAkceBezi) return;

    const managerState = String(vysledek?.manager_state || "")
      .trim()
      .toUpperCase();
    const jobBezi = vysledek?.job?.status === "running";
    if (jobBezi) return;

    const preparePovoleno = vysledek?.capabilities?.prepare === true;
    const verifyPovoleno = vysledek?.capabilities?.verify === true;
    const cutoverPovoleno = vysledek?.capabilities?.cutover === true;

    const destHost = String(vysledek?.destination?.host || "").trim();
    const destMode = String(vysledek?.destination?.mode || "").trim().toLowerCase();
    const destBackend = String(vysledek?.destination?.backend_id || "").trim().toLowerCase();
    const destName = String(vysledek?.destination?.name || "").trim();
    const destNastaven = ["docker", "remote"].includes(destMode) || (Boolean(destHost) && destMode === "ssh");
    const smer = vysledek?.direction || null;
    const smerSourceName = String(smer?.source_name || "").trim();
    const smerSourceBackend = String(smer?.source_backend_id || "").trim().toLowerCase();
    const smerDestName = String(smer?.destination_name || "").trim();
    const smerDestBackend = String(smer?.destination_backend_id || "").trim().toLowerCase();
    if (migrationDestinationInput && document.activeElement !== migrationDestinationInput) {
      migrationDestinationInput.value = destMode === "ssh" ? destHost : "";
    }
    const sourceBackend = String(controlPosledniStatus?.active_backend || "").trim().toLowerCase();
    const jeDokoncenyCutover = managerState === "CUTOVER_COMPLETE";
    if (migrationSourceLabel) {
      if (jeDokoncenyCutover && sourceBackend) {
        migrationSourceLabel.textContent = sourceBackend === "cloud" ? "Supabase Cloud" : sourceBackend === "lubaserver" ? "LubaServer" : sourceBackend;
      } else if (smerSourceBackend) {
        migrationSourceLabel.textContent = smerSourceName || (smerSourceBackend === "cloud" ? "Supabase Cloud" : smerSourceBackend === "lubaserver" ? "LubaServer" : smerSourceBackend);
      }
    }
    if (migrationDestinationLabel) {
      migrationDestinationLabel.textContent = jeDokoncenyCutover
        ? "Vyber cíl"
        : (smerDestBackend
          ? (smerDestName || (smerDestBackend === "cloud" ? "Supabase Cloud" : smerDestBackend === "lubaserver" ? "LubaServer" : smerDestBackend))
          : (destName || (destBackend === "cloud" ? "Supabase Cloud" : destBackend === "lubaserver" ? "LubaServer" : (destHost || "Nový VPS"))));
    }
    if (migrationUseCloud) migrationUseCloud.disabled = migrationAkceBezi || sourceBackend === "cloud" || vysledek?.job?.status === "running";
    if (migrationUseLubaServer) migrationUseLubaServer.disabled = migrationAkceBezi || sourceBackend === "lubaserver" || vysledek?.job?.status === "running";

    /* Starý failed/success job v RAM nesmí blokovat nový PREPARE.
     * Autorita je vždy aktuální stav Migration Manageru.
     */
    if (
      managerState === "IDLE" &&
      destNastaven &&
      preparePovoleno &&
      migrationPrepareTlacitko
    ) {
      migrationPrepareTlacitko.disabled = false;
    }

    if (
      managerState === "PREPARED" &&
      verifyPovoleno &&
      migrationVerifyTlacitko
    ) {
      migrationVerifyTlacitko.disabled = false;
    }

    if (
      managerState === "VERIFIED" &&
      destNastaven &&
      cutoverPovoleno &&
      migrationCutoverTlacitko
    ) {
      migrationCutoverTlacitko.disabled = false;
    }
  }

  /* PATCH 677U – produkcni Control Point v Admin Dashboardu.
   * Status je verejny read-only. Zmenu NORMAL/MAINTENANCE smi poslat jen
   * admin přihlášený na právě aktivní produkci; Bridge znovu ověří Bearer session proti aktivnímu backendu.
   * Tento krok NENI DB write-freeze a nikdy nemeni active_backend/CUTOVER. */
  function nastavControlStav(stav, text) {
    if (!controlStav) return;
    controlStav.dataset.state = stav;
    controlStav.textContent = text;
  }

  function zamkniControlTlacitka() {
    if (controlMaintenanceTlacitko) controlMaintenanceTlacitko.disabled = true;
    if (controlNormalTlacitko) controlNormalTlacitko.disabled = true;
  }

  function nastavControlOvladani(vysledek) {
    zamkniControlTlacitka();
    if (!jeAdmin || controlAkceBezi) return;

    const mode = String(vysledek?.mode || "").trim().toUpperCase();
    if (mode === "NORMAL" && controlMaintenanceTlacitko) {
      controlMaintenanceTlacitko.disabled = false;
    }
    if (mode === "MAINTENANCE" && controlNormalTlacitko) {
      controlNormalTlacitko.disabled = false;
    }
  }

  function vykresliControlStatus(vysledek, { tichy = false } = {}) {
    const mode = String(vysledek?.mode || "UNKNOWN").trim().toUpperCase();
    controlPosledniStatus = vysledek || null;

    if (migrationSourceLabel) {
      const managerState = String(migrationPosledniStatus?.manager_state || "").trim().toUpperCase();
      const maRunSmer = Boolean(migrationPosledniStatus?.direction?.source_backend_id);
      if (!maRunSmer || managerState === "IDLE" || managerState === "CUTOVER_COMPLETE") {
        const aktivni = String(vysledek?.active_backend || "").trim();
        migrationSourceLabel.textContent =
          aktivni === "cloud" ? "Supabase Cloud" :
          aktivni === "lubaserver" ? "LubaServer" :
          (aktivni || "Aktivní produkce");
      }
    }

    if (mode === "NORMAL") {
      nastavControlStav("ok", "NORMAL");
    } else if (mode === "MAINTENANCE") {
      nastavControlStav("warning", "ÚDRŽBA");
    } else {
      nastavControlStav("fail", "NEZNÁMÝ");
    }

    nastavControlOvladani(vysledek || {});

    if (!controlZprava) return;

    if (mode === "MAINTENANCE") {
      controlZprava.textContent =
        "MAINTENANCE je aktivní pro produkční klienty na aktuálním backendu. Ti dokončí existující Sync V2 dluh a zůstanou zamčení. SOURCE DB write-freeze ještě není aktivní.";
    } else if (mode === "NORMAL") {
      controlZprava.textContent =
        "NORMAL · produkční klienti jsou odemčení. Ovládání mění pouze klientský Maintenance/Drain; aktivní backend ani CUTOVER tím nemění.";
    } else {
      controlZprava.textContent =
        "Control Point vrátil neznámý stav. Produkční režim neměň, dokud nebude stav ověřen.";
    }
  }

  async function nactiControlStatus({ tichy = false } = {}) {
    if (!jeAdmin || controlStatusNacitam) return controlPosledniStatus;
    controlStatusNacitam = true;

    if (!tichy) {
      zamkniControlTlacitka();
      nastavControlStav("idle", "NAČÍTÁM");
      if (controlZprava) controlZprava.textContent = "Načítám veřejný Control Point…";
    }

    try {
      const odpoved = await fetch(`${CONTROL_POINT_BASE}/status`, {
        method: "GET",
        cache: "no-store",
        credentials: "omit",
        headers: { Accept: "application/json" }
      });

      let vysledek = null;
      try {
        vysledek = await odpoved.json();
      } catch (_) {}

      const validni =
        odpoved.ok &&
        vysledek?.ok === true &&
        Number(vysledek?.version) === 1 &&
        ["NORMAL", "MAINTENANCE"].includes(String(vysledek?.mode || "").toUpperCase()) &&
        /^[a-z0-9._-]+$/.test(String(vysledek?.active_backend || "").trim().toLowerCase()) &&
        typeof vysledek?.cutover_enabled === "boolean";

      if (!validni) {
        const kod = vysledek?.error || `HTTP_${odpoved.status}`;
        throw new Error(`Control Point odmítl nebo vrátil nebezpečný stav (${kod}).`);
      }

      vykresliControlStatus(vysledek, { tichy });
      return vysledek;
    } catch (error) {
      console.warn("Control Point unavailable:", error?.message || error);
      nastavControlStav("fail", "NEDOSTUPNÉ");
      zamkniControlTlacitka();
      if (controlZprava && !tichy) {
        controlZprava.textContent =
          `Control Point není bezpečně dostupný: ${error?.message || "neznámá chyba"}`;
      }
      return null;
    } finally {
      controlStatusNacitam = false;
    }
  }

  function potvrdControlAkci(cilovyMode) {
    if (!jeAdmin || controlAkceBezi) return;

    const jeMaintenance = cilovyMode === "MAINTENANCE";
    otevriAdminPotvrzeni({
      nadpis: jeMaintenance
        ? "Zapnout bezpečnou údržbu?"
        : "Ukončit bezpečnou údržbu?",
      zprava: jeMaintenance
        ? "Produkční klienti na aktuálním backendu přestanou přijímat nové uživatelské zápisy, dokončí existující Sync V2 frontu a zůstanou zamčení. Toto ještě není databázový write-freeze."
        : "Control Point se vrátí do NORMAL a produkční klienti se po další kontrole odemknou. Aktivní backend ani CUTOVER se touto akcí nemění.",
      potvrditText: jeMaintenance ? "Zapnout údržbu" : "Vrátit NORMAL",
      nebezpecne: jeMaintenance,
      poPotvrzeni: () => provedControlAkci(cilovyMode)
    });
  }

  async function provedControlAkci(cilovyMode) {
    if (!jeAdmin || controlAkceBezi) return;

    const aktualni = await nactiControlStatus({ tichy: true });
    const aktualniMode = String(aktualni?.mode || "").trim().toUpperCase();
    if (!["NORMAL", "MAINTENANCE"].includes(aktualniMode)) {
      zamkniControlTlacitka();
      nastavControlStav("fail", "NEDOSTUPNÉ");
      if (controlZprava) {
        controlZprava.textContent =
          "Režim neměním: před změnou se nepodařilo čerstvě ověřit Control Point.";
      }
      return;
    }
    if (aktualniMode === cilovyMode) {
      vykresliControlStatus(aktualni || {}, { tichy: false });
      return;
    }

    controlAkceBezi = true;
    zamkniControlTlacitka();
    nastavControlStav("warning", cilovyMode === "MAINTENANCE" ? "ZAPÍNÁM" : "UKONČUJI");
    if (controlZprava) {
      controlZprava.textContent = cilovyMode === "MAINTENANCE"
        ? "Odesílám autorizovaný požadavek MAINTENANCE…"
        : "Odesílám autorizovaný požadavek NORMAL…";
    }

    try {
      const token = await ziskejMigrationBearerToken();
      const endpoint = cilovyMode === "MAINTENANCE" ? "maintenance" : "normal";
      const odpoved = await fetch(`${CONTROL_POINT_BASE}/${endpoint}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        cache: "no-store"
      });

      let vysledek = null;
      try {
        vysledek = await odpoved.json();
      } catch (_) {}

      const validni =
        odpoved.ok &&
        vysledek?.ok === true &&
        String(vysledek?.mode || "").toUpperCase() === cilovyMode &&
        String(vysledek?.active_backend || "") === String(aktualni?.active_backend || "") &&
        vysledek?.cutover_enabled === aktualni?.cutover_enabled;

      if (!validni) {
        const kod = vysledek?.error || `HTTP_${odpoved.status}`;
        throw new Error(`Bridge změnu režimu odmítl (${kod}).`);
      }

      vykresliControlStatus(vysledek, { tichy: false });
      void window.LubaNoteMaintenance?.zkontrolujTed?.();
    } catch (error) {
      console.warn("Control Point action failed:", error?.message || error);
      nastavControlStav("fail", "CHYBA");
      zamkniControlTlacitka();
      if (controlZprava) {
        controlZprava.textContent =
          `Režim se nepodařilo změnit: ${error?.message || "neznámá chyba"}`;
      }
    } finally {
      controlAkceBezi = false;
      window.setTimeout(() => nactiControlStatus(), 300);
    }
  }

  function mapujMigrationStav(managerState) {
    const stav = String(managerState || "UNKNOWN").trim().toUpperCase();
    if (stav === "CUTOVER_COMPLETE") return { ui: "ok", text: "COMPLETE" };
    if (stav === "VERIFIED") return { ui: "ok", text: "VERIFIED" };
    if (stav === "PREPARED") return { ui: "ok", text: "PREPARED" };
    if (stav === "PREPARING" || stav === "VERIFYING" || stav === "CUTTING_OVER") {
      return { ui: "warning", text: stav === "CUTTING_OVER" ? "CUTOVER" : stav };
    }
    if (
      stav === "FAILED" ||
      stav === "ERROR" ||
      stav === "PREPARE_FAILED"
    ) {
      return { ui: "fail", text: stav };
    }
    if (stav === "IDLE") return { ui: "idle", text: "IDLE" };
    return { ui: "warning", text: stav || "UNKNOWN" };
  }

  function zastavMigrationLiveRefresh() {
    if (!migrationLiveTimer) return;
    clearInterval(migrationLiveTimer);
    migrationLiveTimer = null;
  }

  function spustMigrationLiveRefresh() {
    if (migrationLiveTimer) return;
    migrationLiveTimer = setInterval(() => {
      if (serverPohled?.hidden || modal?.hidden) {
        zastavMigrationLiveRefresh();
        return;
      }
      nactiMigrationStatus({ tichy: true });
    }, MIGRATION_LIVE_INTERVAL_MS);
  }

  function schovejMigrationProgress() {
    if (migrationProgress) migrationProgress.hidden = true;
    if (migrationProgressSeznam) migrationProgressSeznam.textContent = "";
    if (migrationProgressBar) migrationProgressBar.style.width = "0%";
  }

  function najdiRadekLogu(log, marker) {
    if (!log || !marker) return "";
    return String(log)
      .split(/\r?\n/)
      .find((radek) => radek.includes(marker)) || "";
  }

  function detailZPassRadku(radek, fallback) {
    if (!radek) return fallback;
    const cisty = radek.replace(/^.*?(PASS|FAIL):\s*/i, "").trim();
    if (!cisty) return fallback;
    return cisty;
  }

  function vykresliMigrationKroky(titulek, kroky, metaText = "") {
    if (
      !migrationProgress ||
      !migrationProgressTitulek ||
      !migrationProgressMeta ||
      !migrationProgressBar ||
      !migrationProgressSeznam
    ) {
      return;
    }

    migrationProgress.hidden = false;
    migrationProgressTitulek.textContent = titulek;

    const hotovo = kroky.filter((krok) => krok.state === "done").length;
    const selhalo = kroky.some((krok) => krok.state === "fail");
    const celkem = kroky.length;
    const procent = celkem > 0 ? Math.round((hotovo / celkem) * 100) : 0;
    migrationProgressMeta.textContent = metaText || `${hotovo} / ${celkem}`;
    migrationProgressBar.style.width = `${procent}%`;
    migrationProgressBar.dataset.state = selhalo ? "fail" : "ok";

    migrationProgressSeznam.textContent = "";
    kroky.forEach((krok, index) => {
      const radek = document.createElement("div");
      radek.className = "adminMigrationStep";
      radek.dataset.state = krok.state || "idle";

      const znacka = document.createElement("span");
      znacka.className = "adminMigrationStepMark";
      znacka.setAttribute("aria-hidden", "true");
      znacka.textContent =
        krok.state === "done" ? "✓" :
        krok.state === "running" ? "…" :
        krok.state === "fail" ? "!" : String(index + 1);

      const text = document.createElement("span");
      text.className = "adminMigrationStepText";
      const nazev = document.createElement("strong");
      nazev.textContent = krok.label;
      const detail = document.createElement("small");
      detail.textContent = krok.detail || "";
      text.append(nazev, detail);

      const stav = document.createElement("span");
      stav.className = "adminMigrationStepState";
      stav.textContent =
        krok.state === "done" ? "PASS" :
        krok.state === "running" ? "BĚŽÍ" :
        krok.state === "fail" ? "FAIL" : "ČEKÁ";

      radek.append(znacka, text, stav);
      migrationProgressSeznam.appendChild(radek);
    });
  }

  function pripravPrepareProgress(vysledek) {
    const managerState = String(vysledek?.manager_state || "")
      .trim()
      .toUpperCase();
    const job = vysledek?.job;
    const jobBezi = job?.status === "running";
    const jobSelhal = job?.status === "failed";
    const log = String(job?.log_tail || "");
    const dokonceno =
      !jobBezi &&
      !jobSelhal &&
      (managerState === "PREPARED" || managerState === "VERIFIED");

    let posledniNalezeny = -1;
    MIGRATION_PREPARE_KROKY.forEach((krok, index) => {
      if (log.includes(krok.marker)) posledniNalezeny = index;
    });

    const kroky = MIGRATION_PREPARE_KROKY.map((krok, index) => {
      let state = "idle";
      if (dokonceno) {
        state = "done";
      } else if (index < posledniNalezeny) {
        state = "done";
      } else if (index === posledniNalezeny) {
        state = jobSelhal ? "fail" : jobBezi ? "running" : "done";
      } else if (index === 0 && posledniNalezeny < 0 && jobBezi) {
        state = "running";
      }
      return { ...krok, state };
    });

    const hotovo = kroky.filter((krok) => krok.state === "done").length;
    const aktivni = kroky.find((krok) => krok.state === "running");
    const selhany = kroky.find((krok) => krok.state === "fail");
    vykresliMigrationKroky("PREPARE · 7 bezpečných kroků", kroky);
    return { hotovo, celkem: kroky.length, aktivni, selhany };
  }

  function pripravVerifyProgress(vysledek) {
    const managerState = String(vysledek?.manager_state || "")
      .trim()
      .toUpperCase();
    const job = vysledek?.job;
    const jobBezi = job?.status === "running";
    const jobSelhal = job?.status === "failed";
    const log = `${String(job?.log_tail || "")}\n${String(vysledek?.manager_status || "")}`;
    const dokonceno = managerState === "VERIFIED";

    const kroky = MIGRATION_VERIFY_KROKY.map((krok) => {
      const passRadek = najdiRadekLogu(log, krok.pass);
      const failRadek = najdiRadekLogu(log, krok.fail);
      let state = "idle";
      let detail = krok.detail;
      if (passRadek || dokonceno) {
        state = "done";
        detail = detailZPassRadku(passRadek, detail);
      } else if (failRadek) {
        state = "fail";
        detail = detailZPassRadku(failRadek, detail);
      }
      return { ...krok, state, detail };
    });

    if (jobBezi) {
      const prvniCekajici = kroky.find((krok) => krok.state === "idle");
      if (prvniCekajici) prvniCekajici.state = "running";
    } else if (jobSelhal && !kroky.some((krok) => krok.state === "fail")) {
      const prvniCekajici = kroky.find((krok) => krok.state === "idle");
      if (prvniCekajici) prvniCekajici.state = "fail";
    }

    const hotovo = kroky.filter((krok) => krok.state === "done").length;
    const aktivni = kroky.find((krok) => krok.state === "running");
    const selhany = kroky.find((krok) => krok.state === "fail");
    vykresliMigrationKroky("VERIFY · 8 kontrol", kroky);
    return { hotovo, celkem: kroky.length, aktivni, selhany };
  }

  function pripravCutoverProgress(vysledek) {
    const managerState = String(vysledek?.manager_state || "").trim().toUpperCase();
    const job = vysledek?.job;
    const jobBezi = job?.status === "running";
    const jobSelhal = job?.status === "failed";
    const log = String(job?.log_tail || "");
    const dokonceno = managerState === "CUTOVER_COMPLETE" && !jobSelhal;

    let posledniNalezeny = -1;
    MIGRATION_CUTOVER_KROKY.forEach((krok, index) => {
      if (log.includes(krok.marker)) posledniNalezeny = index;
    });

    const kroky = MIGRATION_CUTOVER_KROKY.map((krok, index) => {
      let state = "idle";
      if (dokonceno) state = "done";
      else if (index < posledniNalezeny) state = "done";
      else if (index === posledniNalezeny) state = jobSelhal ? "fail" : jobBezi ? "running" : "done";
      else if (index === 0 && posledniNalezeny < 0 && jobBezi) state = "running";
      return { ...krok, state };
    });

    const hotovo = kroky.filter((krok) => krok.state === "done").length;
    const aktivni = kroky.find((krok) => krok.state === "running");
    const selhany = kroky.find((krok) => krok.state === "fail");
    vykresliMigrationKroky("CUTOVER · 12 bezpečných kroků", kroky);
    return { hotovo, celkem: kroky.length, aktivni, selhany };
  }

  function vykresliMigrationPrubeh(vysledek) {
    const managerState = String(vysledek?.manager_state || "")
      .trim()
      .toUpperCase();
    const job = vysledek?.job;
    const akce = String(job?.action || "").trim().toLowerCase();

    if (job?.status === "running") {
      if (akce === "cutover") return { typ: "cutover", ...pripravCutoverProgress(vysledek) };
      return akce === "verify"
        ? { typ: "verify", ...pripravVerifyProgress(vysledek) }
        : { typ: "prepare", ...pripravPrepareProgress(vysledek) };
    }

    /* VERIFY po FAIL vrací Manager zpět do PREPARED. Poslední failed VERIFY
     * proto zobrazujeme dřív než obecný PREPARED stav, aby chyba nezmizela.
     */
    if (job?.status === "failed" && akce === "verify") {
      return { typ: "verify", ...pripravVerifyProgress(vysledek) };
    }

    if (job?.status === "failed" && akce === "prepare") {
      return { typ: "prepare", ...pripravPrepareProgress(vysledek) };
    }

    /* Po úspěšném COMPLETE už 12/12 panel nezabírá hlavní workflow.
     * Průběh je důležitý během CUTOVERu nebo při FAIL; po úspěchu stačí
     * stav COMPLETE + aktuální produkce nahoře. */
    if (managerState === "CUTOVER_COMPLETE" && job?.status !== "running") {
      schovejMigrationProgress();
      return null;
    }

    if (managerState === "CUTTING_OVER") {
      return { typ: "cutover", ...pripravCutoverProgress(vysledek) };
    }

    if (job?.status === "failed" && akce === "cutover") {
      return { typ: "cutover", ...pripravCutoverProgress(vysledek) };
    }

    if (managerState === "VERIFIED") {
      return { typ: "verify", ...pripravVerifyProgress(vysledek) };
    }

    if (managerState === "PREPARED") {
      return { typ: "prepare", ...pripravPrepareProgress(vysledek) };
    }

    if (managerState === "VERIFYING") {
      return { typ: "verify", ...pripravVerifyProgress(vysledek) };
    }

    if (managerState === "PREPARING" || managerState === "PREPARE_FAILED") {
      return { typ: "prepare", ...pripravPrepareProgress(vysledek) };
    }

    if (job?.status === "failed" && managerState !== "IDLE") {
      return akce === "verify"
        ? { typ: "verify", ...pripravVerifyProgress(vysledek) }
        : { typ: "prepare", ...pripravPrepareProgress(vysledek) };
    }

    schovejMigrationProgress();
    return null;
  }

  function zavriMigrationPotvrzeni(vysledek = false) {
    if (migrationConfirmModal) migrationConfirmModal.hidden = true;
    if (migrationConfirmResolve) {
      const resolve = migrationConfirmResolve;
      migrationConfirmResolve = null;
      resolve(Boolean(vysledek));
    }
  }

  function otevriMigrationPotvrzeni(akce) {
    if (
      !migrationConfirmModal ||
      !migrationConfirmBadge ||
      !migrationConfirmTitulek ||
      !migrationConfirmText ||
      !migrationConfirmHint ||
      !migrationConfirmOk
    ) {
      return Promise.resolve(false);
    }

    const jeVerify = akce === "verify";
    const jeCutover = akce === "cutover";
    const nazev = jeCutover ? "CUTOVER" : (jeVerify ? "VERIFY" : "PREPARE");
    migrationConfirmBadge.textContent = nazev;
    const cilNazev = String(migrationDestinationLabel?.textContent || "cílový backend").trim() || "cílový backend";
    const sourceNazev = String(migrationSourceLabel?.textContent || "SOURCE").trim() || "SOURCE";
    if (migrationConfirmSourceName) migrationConfirmSourceName.textContent = `${sourceNazev} SOURCE`;
    migrationConfirmTitulek.textContent = jeCutover
      ? `Přepnout produkci na ${cilNazev}?`
      : (jeVerify ? `Ověřit migraci na ${cilNazev}?` : `Připravit ${cilNazev}?`);
    migrationConfirmText.textContent = jeCutover
      ? `CUTOVER automaticky zapne bezpečnou údržbu, nechá doběhnout sync fronty, provede finální freeze/sync a atomicky přepne všechny produkční klienty na ${cilNazev}. Předchozí backend zůstane jako rollback.`
      : (jeVerify
        ? `VERIFY porovná připravený snapshot s cílem ${cilNazev}: public data, sekvence, Auth fingerprint, Storage metadata/SHA a zdraví Supabase služeb.`
        : `PREPARE vytvoří snapshot a rollback checkpoint a připraví data na cíli ${cilNazev}. Aktivní SOURCE se tím nepřepne.`);
    if (migrationConfirmSource) {
      migrationConfirmSource.textContent = jeCutover ? "finální sync" : (jeVerify ? "jen čtení" : "beze změny");
    }
    if (migrationConfirmCutover) {
      migrationConfirmCutover.textContent = jeCutover ? "připravený" : "zamčený";
    }
    migrationConfirmHint.textContent = jeCutover
      ? "CUTOVER je povolen pouze po úspěšném VERIFY. MAINTENANCE/Drain provede automaticky; ruční Údržba není pro běžnou migraci potřeba."
      : (jeVerify
        ? "VERIFY nemění migrovaná data. Při úspěchu odemkne CUTOVER."
        : "Během PREPARE v LubaNote nic neupravuj. Zdrojový server se tím nepřepne.");
    migrationConfirmOk.textContent = `Spustit ${nazev}`;
    migrationConfirmModal.hidden = false;

    if (migrationConfirmResolve) {
      migrationConfirmResolve(false);
      migrationConfirmResolve = null;
    }

    return new Promise((resolve) => {
      migrationConfirmResolve = resolve;
    });
  }

  async function ziskejMigrationBearerToken() {
    const pripraven = await pripravClient();
    if (!pripraven || !supabaseClient?.auth) {
      throw new Error("Aktivní produkční klient není dostupný.");
    }

    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;

    const token = data?.session?.access_token;
    if (!token) {
      throw new Error("Aktivní produkční účet nemá platnou session.");
    }
    return token;
  }

  function fyzickyBackendIdProfilu(profil) {
    const id = String(profil?.backendId || "").trim().toLowerCase();
    if (id === "lubaserver-test") return "lubaserver";
    return id;
  }

  async function pripravBackendSessionHandoff(control, cilProfil, sourceProfil = null) {
    const source = sourceProfil || window.LubaNoteBackendConfig?.nactiAktivniProfil?.();
    const sourceBackend = fyzickyBackendIdProfilu(source);
    const destinationBackend = String(control?.active_backend || cilProfil?.backendId || "").trim().toLowerCase();

    if (!sourceBackend || !destinationBackend) {
      throw new Error("Nelze určit SOURCE/DEST pro přenos přihlášení.");
    }

    if (sourceBackend === destinationBackend) {
      const raw = localStorage.getItem(String(source?.authStorageKey || ""));
      const cilovyKlic = String(cilProfil?.authStorageKey || "");
      if (raw && cilovyKlic) localStorage.setItem(cilovyKlic, raw);
      return { ok: true, localCopy: true };
    }

    const token = await ziskejMigrationBearerToken();
    const odpoved = await fetch(`${CONTROL_POINT_BASE}/session-handoff`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        source_backend: sourceBackend,
        destination_backend: destinationBackend
      }),
      cache: "no-store"
    });
    const data = await odpoved.json().catch(() => ({}));
    if (!odpoved.ok || data?.ok !== true || !data?.token_hash) {
      throw new Error(data?.error || `HTTP_${odpoved.status}`);
    }

    localStorage.setItem(BACKEND_SESSION_HANDOFF_KEY, JSON.stringify({
      version: 1,
      sourceBackend,
      destinationBackend,
      targetAuthStorageKey: String(cilProfil?.authStorageKey || ""),
      tokenHash: String(data.token_hash),
      tokenType: String(data.token_type || "magiclink"),
      issuedUtc: String(data.issued_utc || new Date().toISOString())
    }));
    return { ok: true, remote: true };
  }

  async function nactiMigrationStatus({ tichy = false } = {}) {
    if (!jeAdmin || migrationStatusNacitam) return migrationPosledniStatus;
    nastavMigrationTlacitkaZamcena();

    migrationStatusNacitam = true;
    if (!tichy) {
      nastavMigrationStav("idle", "NAČÍTÁM");
      if (migrationZprava) {
        migrationZprava.textContent = "Ověřuji bezpečný Migration Bridge…";
      }
    }

    try {
      const token = await ziskejMigrationBearerToken();
      const odpoved = await fetch(`${MIGRATION_CONTROL_BASE}/status`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`
        },
        cache: "no-store"
      });

      let vysledek = null;
      try {
        vysledek = await odpoved.json();
      } catch (_) {}

      if (!odpoved.ok || vysledek?.ok !== true) {
        const kod = vysledek?.error || `HTTP_${odpoved.status}`;
        throw new Error(`Migration Bridge odmítl požadavek (${kod}).`);
      }

      migrationPosledniStatus = vysledek;
      const mapovany = mapujMigrationStav(vysledek.manager_state);
      nastavMigrationStav(mapovany.ui, mapovany.text);
      nastavMigrationOvladani(vysledek);
      const prubeh = vykresliMigrationPrubeh(vysledek);
      const job = vysledek.job;

      const aktualniJobId = String(job?.id || "");
      const cekameNaPrijatouUlohu = Boolean(
        migrationOcekavanyJobId && aktualniJobId !== migrationOcekavanyJobId
      );
      const dorazilaPrijataUloha = Boolean(
        migrationOcekavanyJobId && aktualniJobId === migrationOcekavanyJobId
      );

      if (dorazilaPrijataUloha && job?.status !== "running") {
        migrationOcekavanyJobId = "";
      }

      if (job?.status === "running" || cekameNaPrijatouUlohu) {
        spustMigrationLiveRefresh();
      } else {
        zastavMigrationLiveRefresh();
      }

      if (migrationZprava) {
        const managerState = String(vysledek.manager_state || "")
          .trim()
          .toUpperCase();
        if (job?.status === "running") {
          const akce = String(job.action || "migrace").toUpperCase();
          const krok = prubeh?.aktivni?.label;
          const cisla = prubeh ? `${prubeh.hotovo}/${prubeh.celkem}` : "";
          migrationZprava.textContent = krok
            ? `Bridge ONLINE · ${akce} běží · ${cisla} · právě: ${krok}.`
            : `Bridge ONLINE · ${akce} běží · čekám na první serverový krok…`;
        } else if (job?.status === "failed" && String(job.action || "").toLowerCase() === "verify") {
          migrationZprava.textContent =
            "Bridge ONLINE · VERIFY skončil chybou · Manager se bezpečně vrátil do PREPARED · po diagnostice lze VERIFY zopakovat.";
        } else if (managerState === "CUTOVER_COMPLETE") {
          migrationZprava.textContent =
            "Bridge ONLINE · poslední CUTOVER dokončen. Produkce běží na backendu řízeném Control Pointem; pro další migraci vyber nový cíl níže.";
          void nactiControlStatus({ tichy: true }).then((control) => {
            aktualizujBackendZarizeniUi();
            if (String(control?.mode || "").toUpperCase() === "NORMAL") {
              nastavCutoverKonzoli(false);
            }
          });
        } else if (managerState === "VERIFIED") {
          migrationZprava.textContent =
            "Bridge ONLINE · VERIFY dokončen · všech 8 kontrol PASS · CUTOVER je připraven.";
        } else if (managerState === "PREPARED") {
          migrationZprava.textContent =
            "Bridge ONLINE · PREPARE dokončen 7/7 · stav PREPARED · VERIFY je připraven.";
        } else if (managerState === "IDLE" && job?.status === "failed") {
          migrationZprava.textContent =
            "Bridge ONLINE · předchozí úloha selhala, ale Migration Manager je IDLE · nový PREPARE je znovu povolen.";
        } else if (managerState === "IDLE") {
          migrationZprava.textContent =
            "Bridge ONLINE · Migration Manager IDLE · PREPARE je připraven.";
        } else if (job?.status === "failed") {
          migrationZprava.textContent =
            `Bridge ONLINE · ${String(job.action || "migrace").toUpperCase()} skončil chybou · stav Manageru ${mapovany.text}.`;
        } else {
          migrationZprava.textContent =
            `Bridge ONLINE · Migration Manager ${mapovany.text} · CUTOVER zůstává zamčený.`;
        }
      }

      return vysledek;
    } catch (error) {
      console.warn("Migration status unavailable:", error?.message || error);
      nastavMigrationStav("fail", "NEDOSTUPNÉ");
      nastavMigrationTlacitkaZamcena();
      if (migrationZprava) {
        migrationZprava.textContent =
          `Migration Bridge není dostupný nebo admin ověření selhalo: ${error?.message || "neznámá chyba"}`;
      }
      return migrationPosledniStatus;
    } finally {
      migrationStatusNacitam = false;
    }
  }

  async function spustMigrationAkci(akce) {
    if (!jeAdmin || migrationAkceBezi) return;

    const jeVerify = akce === "verify";
    const jeCutover = akce === "cutover";
    const nazevAkce = jeCutover ? "CUTOVER" : (jeVerify ? "VERIFY" : "PREPARE");
    const aktualni = await nactiMigrationStatus({ tichy: true });
    const managerState = String(aktualni?.manager_state || "")
      .trim()
      .toUpperCase();
    const povoleno = jeCutover
      ? managerState === "VERIFIED" && aktualni?.capabilities?.cutover === true
      : (jeVerify
        ? managerState === "PREPARED" && aktualni?.capabilities?.verify === true
        : managerState === "IDLE" && aktualni?.capabilities?.prepare === true);

    if (!povoleno || aktualni?.job?.status === "running") {
      if (migrationZprava) {
        migrationZprava.textContent = jeCutover
          ? `CUTOVER teď nelze spustit. Migration Manager musí být VERIFIED; aktuálně je ${managerState || "UNKNOWN"}.`
          : (jeVerify
            ? `VERIFY teď nelze spustit. Migration Manager musí být PREPARED; aktuálně je ${managerState || "UNKNOWN"}.`
            : `PREPARE teď nelze spustit. Migration Manager musí být IDLE; aktuálně je ${managerState || "UNKNOWN"}.`);
      }
      nastavMigrationOvladani(aktualni || {});
      return;
    }

    const potvrzeno = await otevriMigrationPotvrzeni(akce);
    if (!potvrzeno) return;

    migrationAkceBezi = true;
    nastavMigrationTlacitkaZamcena();
    nastavMigrationStav("warning", nazevAkce);
    if (migrationZprava) {
      migrationZprava.textContent =
        `Odesílám bezpečný požadavek ${nazevAkce}…`;
    }

    try {
      const token = await ziskejMigrationBearerToken();
      const odpoved = await fetch(`${MIGRATION_CONTROL_BASE}/${akce}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        cache: "no-store"
      });

      let vysledek = null;
      try {
        vysledek = await odpoved.json();
      } catch (_) {}

      if (!odpoved.ok || vysledek?.ok !== true || vysledek?.accepted !== true) {
        const kod = vysledek?.error || `HTTP_${odpoved.status}`;
        throw new Error(`${nazevAkce} nebyl přijat (${kod}).`);
      }

      migrationOcekavanyJobId = String(vysledek?.job?.id || "");
      if (jeCutover) {
        nastavCutoverKonzoli(true);
      }
      nastavMigrationStav("warning", jeCutover ? "CUTOVER" : (jeVerify ? "VERIFYING" : "PREPARING"));
      if (migrationZprava) {
        migrationZprava.textContent =
          `${nazevAkce} byl přijat Migration Bridgem · načítám živý průběh…`;
      }
      spustMigrationLiveRefresh();
    } catch (error) {
      migrationOcekavanyJobId = "";
      if (jeCutover) nastavCutoverKonzoli(false);
      console.warn(
        `Migration ${nazevAkce} failed to start:`,
        error?.message || error
      );
      nastavMigrationStav("fail", "CHYBA");
      if (migrationZprava) {
        migrationZprava.textContent =
          `${nazevAkce} se nepodařilo spustit: ${error?.message || "neznámá chyba"}`;
      }
    } finally {
      migrationAkceBezi = false;
      window.setTimeout(() => nactiMigrationStatus(), 350);
    }
  }

  function spustMigrationPrepare() {
    return spustMigrationAkci("prepare");
  }

  function spustMigrationVerify() {
    return spustMigrationAkci("verify");
  }

  function spustMigrationCutover() {
    return spustMigrationAkci("cutover");
  }

  async function ulozMigrationDestinationPreset(backend) {
    if (!jeAdmin || migrationAkceBezi) return;
    try {
      const token = await ziskejMigrationBearerToken();
      const odpoved = await fetch(`${MIGRATION_CONTROL_BASE}/destination`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ backend }),
        cache: "no-store"
      });
      const data = await odpoved.json().catch(() => ({}));
      if (!odpoved.ok || data?.ok !== true) throw new Error(data?.error || `HTTP_${odpoved.status}`);
      if (migrationDestinationHint) {
        migrationDestinationHint.textContent = `Cíl uložen: ${data.destination?.name || data.destination?.backend_id || backend}. Nový migrační cyklus je IDLE.`;
      }
      await nactiControlStatus({ tichy: true });
      await nactiMigrationStatus();
    } catch (error) {
      if (migrationDestinationHint) migrationDestinationHint.textContent = `Cíl se nepodařilo nastavit: ${error?.message || "neznámá chyba"}`;
    }
  }

  async function ulozMigrationDestination() {
    if (!jeAdmin || migrationAkceBezi || !migrationDestinationInput) return;
    const host = migrationDestinationInput.value.trim();
    if (!host) {
      if (migrationDestinationHint) migrationDestinationHint.textContent = "Zadej IP adresu nebo hostname nového VPS.";
      return;
    }
    try {
      const token = await ziskejMigrationBearerToken();
      const odpoved = await fetch(`${MIGRATION_CONTROL_BASE}/destination`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ host }),
        cache: "no-store"
      });
      const data = await odpoved.json().catch(() => ({}));
      if (!odpoved.ok || data?.ok !== true) throw new Error(data?.error || `HTTP_${odpoved.status}`);
      if (migrationDestinationHint) migrationDestinationHint.textContent = `Cíl uložen: ${data.destination?.host || host}. Starý VERIFY byl zneplatněn; nový PREPARE může začít.`;
      await nactiMigrationStatus();
    } catch (error) {
      if (migrationDestinationHint) migrationDestinationHint.textContent = `Server se nepodařilo nastavit: ${error?.message || "neznámá chyba"}`;
    }
  }

  function nactiJsonPoleProBackendSwitch(klic) {
    try {
      const raw = localStorage.getItem(klic);
      if (!raw) return [];
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch (_) {
      return [];
    }
  }

  function maJsonDluhProBackendSwitch(klic) {
    try {
      const raw = localStorage.getItem(klic);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (Array.isArray(data)) return data.length > 0;
      if (data && typeof data === "object") return Object.keys(data).length > 0;
      return Boolean(data);
    } catch (_) {
      return true;
    }
  }

  function spocitejLocalPoznamkyProBackendSwitch() {
    const regular = nactiJsonPoleProBackendSwitch("savedTask");
    const secret = nactiJsonPoleProBackendSwitch("savedSecretTask");

    return regular.filter((note) => note?.storageScope === "local").length +
      secret.filter((note) => note?.storageScope === "local").length;
  }

  async function overIndexedDbLocalPoznamkyProBackendSwitch() {
    const mode = localStorage.getItem("lubanoteRegularNotesStorageModeV1");
    if (mode !== "indexeddb") {
      return { ok: true, localPocet: 0 };
    }

    if (!window.indexedDB) {
      return {
        ok: false,
        localPocet: null,
        zprava: "IndexedDB cache je aktivní, ale nejde ji bezpečně přečíst. Přepnutí proto zůstává blokované."
      };
    }

    try {
      await window.LubaNoteRegularNotesStore?.cekejNaUlozeni?.();

      const ownerId = String(
        localStorage.getItem("lubanoteLocalOwnerUserId") || ""
      ).trim();

      if (!ownerId) {
        return {
          ok: false,
          localPocet: null,
          zprava: "IndexedDB cache nemá ověřeného vlastníka. Přepnutí je pro jistotu blokované."
        };
      }

      if (typeof indexedDB.databases === "function") {
        const seznam = await indexedDB.databases();
        const existuje = seznam.some(
          (db) => db?.name === "LubaNoteRegularNotesCache"
        );
        if (!existuje) {
          return {
            ok: false,
            localPocet: null,
            zprava: "IndexedDB overflow marker je aktivní, ale plná cache nebyla nalezena. Přepnutí je blokované."
          };
        }
      }

      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open("LubaNoteRegularNotesCache", 1);
        let vytvariSe = false;

        request.onupgradeneeded = () => {
          vytvariSe = true;
          try { request.transaction?.abort?.(); } catch (_) {}
        };
        request.onsuccess = () => {
          if (vytvariSe) {
            request.result?.close?.();
            reject(new Error("missing-cache"));
            return;
          }
          resolve(request.result);
        };
        request.onerror = () => reject(
          request.error || new Error("indexeddb-open-failed")
        );
      });

      try {
        if (!db.objectStoreNames.contains("regularNotes")) {
          return {
            ok: false,
            localPocet: null,
            zprava: "Plná IndexedDB cache nemá očekávané úložiště. Přepnutí je blokované."
          };
        }

        const zaznam = await new Promise((resolve, reject) => {
          const tx = db.transaction("regularNotes", "readonly");
          const request = tx.objectStore("regularNotes").get(ownerId);
          request.onsuccess = () => resolve(request.result || null);
          request.onerror = () => reject(
            request.error || new Error("indexeddb-read-failed")
          );
        });

        if (!zaznam || !Array.isArray(zaznam.notes)) {
          return {
            ok: false,
            localPocet: null,
            zprava: "Plnou IndexedDB cache tohoto účtu se nepodařilo ověřit. Přepnutí je blokované."
          };
        }

        const localPocet = zaznam.notes.filter(
          (note) => String(note?.storageScope || "cloud") === "local"
        ).length;

        return { ok: true, localPocet };
      } finally {
        db.close();
      }
    } catch (error) {
      console.warn("Backend switch IndexedDB check failed:", error);
      return {
        ok: false,
        localPocet: null,
        zprava: "IndexedDB cache se nepodařilo bezpečně ověřit. Přepnutí je pro jistotu blokované."
      };
    }
  }

  async function zkontrolujBackendPredPrepnutim() {
    if (!navigator.onLine) {
      return {
        ok: false,
        zprava: "Nejdřív se připoj k internetu. Backend lze bezpečně přepnout jen ze synchronizovaného stavu."
      };
    }

    const syncStav = window.LubaNoteSyncStatus?.ziskejStav?.();
    if (syncStav !== "synced") {
      return {
        ok: false,
        zprava: "Aktuální backend ještě není ve stavu „Synchronizováno“. Počkej na dokončení synchronizace a zkus přepnutí znovu."
      };
    }

    const localPocetLehky = spocitejLocalPoznamkyProBackendSwitch();
    if (localPocetLehky > 0) {
      return {
        ok: false,
        zprava: `Na zařízení je ${localPocetLehky} LOCAL poznámek. Přepnutí je záměrně blokované, protože bezpečný reset by je smazal.`
      };
    }

    const idbKontrola = await overIndexedDbLocalPoznamkyProBackendSwitch();
    if (!idbKontrola.ok) {
      return idbKontrola;
    }
    if (Number(idbKontrola.localPocet) > 0) {
      return {
        ok: false,
        zprava: `V plné IndexedDB cache je ${idbKontrola.localPocet} LOCAL poznámek. Přepnutí je záměrně blokované, protože reset by je smazal.`
      };
    }

    const attachmentDiag =
      await window.LubaNoteAttachmentsLocal?.ziskejDiagnostiku?.();
    if (attachmentDiag?.dostupne === false) {
      return {
        ok: false,
        zprava: "Lokální frontu obrázků/příloh se nepodařilo bezpečně ověřit. Přepnutí je blokované."
      };
    }
    const cekajiciStinoveUploady = Number(
      attachmentDiag?.cekajiciUploady || 0
    );

    /*
     * 677L: attachment cloud-shadow fronta NENÍ synchronizační dluh.
     * V aktuální V1 je autoritou obrázku Data URL / media vault uvnitř
     * synchronizované poznámky; Storage shadow je pouze doplňková vrstva.
     * Proto cloud_shadow pending položky nesmí blokovat bezpečný přechod
     * tohoto zařízení na TEST backend. Reset je může zahodit, ale obsah
     * poznámky už musí být před přepnutím ve stavu Synchronizováno.
     * Pokud by se režim příloh někdy změnil na jiný než cloud_shadow,
     * raději přepnutí znovu zablokujeme.
     */
    if (cekajiciStinoveUploady > 0) {
      if (attachmentDiag?.rezim !== "cloud_shadow") {
        return {
          ok: false,
          zprava: `Ještě čeká ${cekajiciStinoveUploady} obrázků/příloh v neznámém režimu. Přepnutí je pro jistotu blokované.`
        };
      }

      console.info(
        "Backend switch: pending cloud-shadow uploads are non-authoritative and will not block TEST switch:",
        cekajiciStinoveUploady
      );
    }

    const dluhKlice = [
      "lubanotePendingDeletes",
      "lubanotePendingEditorReleasesV1",
      "lubanotePendingSecretBackupMetadataV1"
    ];

    if (dluhKlice.some(maJsonDluhProBackendSwitch)) {
      return {
        ok: false,
        zprava: "Na zařízení je ještě čekající synchronizační dluh. Nejdřív nech LubaNote dokončit synchronizaci."
      };
    }

    return { ok: true, zprava: "" };
  }

  function aktualizujBackendZarizeniUi() {
    const config = window.LubaNoteBackendConfig;
    const profil = config?.nactiAktivniProfil?.();
    const jeTest = profil?.prostredi === "test";

    if (deviceBackendName) {
      deviceBackendName.textContent = profil?.nazev || "—";
    }

    if (deviceBackendMode) {
      deviceBackendMode.textContent = jeTest
        ? "TEST backend · ručně připnutý pouze pro toto zařízení"
        : "PRODUKCE · automaticky řízená Control Pointem";
    }

    if (deviceBackendBadge) {
      deviceBackendBadge.textContent = jeTest ? "TEST" : "PRODUKCE";
      deviceBackendBadge.dataset.state = jeTest ? "warning" : "ok";
    }

    if (deviceBackendMessage) {
      deviceBackendMessage.textContent = jeTest
        ? "Izolovaný TEST profil je pouze servisní režim. Pro PREPARE / VERIFY / CUTOVER už není potřeba. Tlačítkem níže se vrátíš na aktivní produkci bez mazání lokálních dat."
        : "Produkční backend tohoto zařízení sleduje Control Point. Migraci lze řídit přímo z produkce; CUTOVER zachová lokální cache i přihlášení.";
    }

    /* Produkční Cloud/LubaServer už nesmí být ruční lokální přepínač.
     * O produkci rozhoduje výhradně Control Point + bezpečný CUTOVER. */
    if (useLubaServerTlacitko) {
      useLubaServerTlacitko.hidden = true;
    }
    if (useTestLubaServerTlacitko) {
      useTestLubaServerTlacitko.hidden = jeTest;
      useTestLubaServerTlacitko.textContent = "Servisní TEST LubaServeru (izolovaný)";
    }
    if (useCloudTlacitko) {
      useCloudTlacitko.hidden = !jeTest;
      const aktivniBackend = String(controlPosledniStatus?.active_backend || "").trim().toLowerCase();
      const aktivniNazev = aktivniBackend === "cloud" ? "Supabase Cloud" : aktivniBackend === "lubaserver" ? "LubaServer PROD" : "aktivní produkci";
      useCloudTlacitko.textContent = `Opustit TEST → ${aktivniNazev}`;
    }
  }

  function zobrazBackendSwitchChybu(zprava) {
    if (!deviceBackendMessage) return;
    deviceBackendMessage.textContent = zprava;
    deviceBackendMessage.dataset.error = "1";
    setTimeout(() => {
      deviceBackendMessage.removeAttribute("data-error");
      aktualizujBackendZarizeniUi();
    }, 7000);
  }

  async function prepniBackendZarizeni(cilId) {
    const config = window.LubaNoteBackendConfig;
    if (!config?.prepinaniPovoleno || !config?.nastavAktivniProfil) {
      zobrazBackendSwitchChybu("Přepínání backendu v této verzi není dostupné.");
      return;
    }

    const aktualni = config.nactiAktivniProfil?.();

    /* Jediný ruční profil je TEST LubaServer. Produkční Cloud/LubaServer
     * se nikdy nesmí přepsat lokálním tlačítkem mimo Control Point. */
    if (cilId === "lubanoteServer") {
      if (aktualni?.id === "lubanoteServer") {
        aktualizujBackendZarizeniUi();
        return;
      }

      const kontrola = await zkontrolujBackendPredPrepnutim();
      if (!kontrola.ok) {
        zobrazBackendSwitchChybu(kontrola.zprava);
        return;
      }

      otevriAdminPotvrzeni({
        nadpis: "Přepnout toto zařízení do TEST LubaServeru?",
        zprava:
          "Izolovaný TEST je jen servisní režim a pro migraci už není potřeba. Vstup do TESTu oddělí lokální testovací cache; produkční Control Point se tím nemění.",
        potvrditText: "Přejít do TEST",
        poPotvrzeni: async () => {
          config.nastavAktivniProfil("lubanoteServer");
          window.location.replace("./local-reset.html?backendSwitch=1");
        }
      });
      return;
    }

    /* Návrat z TESTu vždy načte aktuální globální produkci. */
    if (aktualni?.prostredi === "test") {
      const control = await nactiControlStatus({ tichy: true });
      if (!control) {
        zobrazBackendSwitchChybu("Control Point není dostupný; návrat na produkci je zablokovaný.");
        return;
      }

      const cil = config.profilProControlPoint?.(control);
      if (!cil) {
        zobrazBackendSwitchChybu("Aktivní produkční backend nemá platný klientský profil.");
        return;
      }

      otevriAdminPotvrzeni({
        nadpis: `Opustit TEST a použít ${cil.nazev || control.active_backend}?`,
        zprava:
          `Control Point ukazuje ${cil.nazev || control.active_backend}. TEST cache se bezpečně oddělí resetem; produkční backend se globálně nemění.`,
        potvrditText: `Použít ${cil.nazev || "produkci"}`,
        poPotvrzeni: async () => {
          try {
            await pripravBackendSessionHandoff(control, cil, aktualni);
          } catch (error) {
            zobrazBackendSwitchChybu(`Přihlášení nelze bezpečně přenést: ${error?.message || "neznámá chyba"}`);
            return;
          }
          const nasledovani = config.sledujControlPoint?.(control, { vynutit: true });
          if (nasledovani?.ok !== true) {
            zobrazBackendSwitchChybu("Aktivní produkční backend nelze bezpečně aktivovat.");
            return;
          }
          window.location.replace(`./?backendFollow=${encodeURIComponent(String(control.active_backend || "production"))}`);
        }
      });
      return;
    }

    zobrazBackendSwitchChybu(
      "Produkční backend se mění pouze přes PREPARE → VERIFY → CUTOVER. Ruční lokální přepsání produkce je vypnuté."
    );
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
      oznamCutoverKonzoli();
      return;
    }

    if (migrationCutoverKonzoleZapnuta) {
      modal.hidden = false;
      zobrazServer();
      if (!history.state?.[ADMIN_HISTORY_KEY]) {
        zapisAdminHistory("server");
      }
      oznamCutoverKonzoli();
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
      adminAccountsHeading: ["admin.accountsHeading", "Správa účtů"]
    };

    for (const [id, [klic, vychozi]] of Object.entries(texty)) {
      const prvek = document.getElementById(id);
      if (prvek) prvek.textContent = tAdmin(klic, vychozi);
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

    if (!modal.hidden && !uctyPohled.hidden) {
      vykresliUzivatele();
    }
  }

  function zapisAdminHistory(view) {
    try {
      const aktualni = history.state?.[ADMIN_HISTORY_KEY];
      if (aktualni === view) return;
      history.pushState(
        { ...(history.state || {}), [ADMIN_HISTORY_KEY]: view },
        "",
        window.location.href
      );
      adminHistoryDepth += 1;
    } catch (error) {
      console.warn("Admin Dashboard history push failed:", error);
    }
  }

  function zavriDashboardPresHistorii() {
    const kroku = Math.max(0, adminHistoryDepth);
    zavriMigrationPotvrzeni(false);
    modal.hidden = true;
    zastavServerStatusAutoRefresh();
    zobrazDomov();
    oznamCutoverKonzoli();
    adminHistoryDepth = 0;

    if (kroku > 0) {
      try {
        history.go(-kroku);
      } catch (_) {}
    }
  }

  function adminHistoryZpetNaDomov() {
    if (adminHistoryDepth > 1) {
      try {
        history.back();
        return;
      } catch (_) {}
    }
    zobrazDomov();
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
    oznamCutoverKonzoli();
    if (!history.state?.[ADMIN_HISTORY_KEY]) {
      zapisAdminHistory("home");
    }
  }

  function zavriDashboard() {
    zavriDashboardPresHistorii();
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

  /* PATCH 680A2 – globální 5× tap bez závislosti na click eventu.
   *
   * WebView může v editoru click potlačit nebo převést na selection gesto,
   * proto posloucháme Pointer Events už v capture fázi. Počítají se jen
   * krátké tapy bez dragu a všechny musí být v jednom 44px shluku. Tím se
   * minimalizuje náhodné odemčení při běžném psaní, selection nebo scrollu.
   * Po odemčení se vždy spustí hlavní Start / sync / síť diagnostika.
   * WebView Watch zůstává dostupný jen jako ručně zvolený modul.
   */
  function spustNouzovyDebug() {
    if (!POVOLIT_NOUZOVY_DEBUG_5X) return false;

    nouzovyDevDebug = true;
    nouzoveKliky = [];
    nouzovyPointerStart = null;

    console.warn(
      "DEV DEBUG 677G | GLOBAL 5X UNLOCK | session only"
    );

    window.LubaNoteVisualDebug?.showDock?.();

    if (window.LubaNoteDebugHub?.startStartup?.()) {
      return true;
    }

    return Boolean(window.LubaNoteDebugHub?.open?.());
  }

  function jeNouzovyDebugPrvek(target) {
    const prvek = target instanceof Element
      ? target
      : target?.parentElement;

    return Boolean(
      prvek?.closest?.(
        "#ln-debug-hub, #ln-vd-panel, #ln-vd-quickbar, #ln-vd-highlight, #ln-vd-measure"
      )
    );
  }

  function pridejNouzovyTap(x, y) {
    const ted = performance.now();
    const bod = { cas: ted, x: Number(x), y: Number(y) };

    if (!Number.isFinite(bod.x) || !Number.isFinite(bod.y)) return;

    nouzoveKliky = nouzoveKliky.filter(
      tap => ted - tap.cas <= NOUZOVY_DEBUG_OKNO_MS
    );

    if (nouzoveKliky.length) {
      const kotva = nouzoveKliky[0];
      const vzdalenost = Math.hypot(bod.x - kotva.x, bod.y - kotva.y);
      if (vzdalenost > NOUZOVY_DEBUG_RADIUS_PX) {
        nouzoveKliky = [];
      }
    }

    nouzoveKliky.push(bod);

    if (nouzoveKliky.length >= 5) {
      spustNouzovyDebug();
    }
  }

  function registrujNouzovyDebug5x() {
    if (!POVOLIT_NOUZOVY_DEBUG_5X) return;

    if (window.PointerEvent) {
      document.addEventListener("pointerdown", event => {
        if (!event.isPrimary || jeNouzovyDebugPrvek(event.target)) return;
        nouzovyPointerStart = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          cas: performance.now()
        };
      }, true);

      document.addEventListener("pointercancel", event => {
        if (nouzovyPointerStart?.id === event.pointerId) {
          nouzovyPointerStart = null;
        }
      }, true);

      document.addEventListener("pointerup", event => {
        if (!event.isPrimary || jeNouzovyDebugPrvek(event.target)) return;
        const start = nouzovyPointerStart;
        nouzovyPointerStart = null;
        if (!start || start.id !== event.pointerId) return;

        const doba = performance.now() - start.cas;
        const pohyb = Math.hypot(event.clientX - start.x, event.clientY - start.y);
        if (doba > NOUZOVY_DEBUG_MAX_TAP_MS || pohyb > NOUZOVY_DEBUG_MAX_POHYB_PX) return;

        pridejNouzovyTap(event.clientX, event.clientY);
      }, true);
      return;
    }

    /* Fallback pro starší WebView bez Pointer Events. */
    let touchStart = null;
    document.addEventListener("touchstart", event => {
      if (event.touches?.length !== 1 || jeNouzovyDebugPrvek(event.target)) return;
      const t = event.touches[0];
      touchStart = { x: t.clientX, y: t.clientY, cas: performance.now() };
    }, { capture: true, passive: true });

    document.addEventListener("touchcancel", () => {
      touchStart = null;
    }, { capture: true, passive: true });

    document.addEventListener("touchend", event => {
      const start = touchStart;
      touchStart = null;
      const t = event.changedTouches?.[0];
      if (!start || !t || jeNouzovyDebugPrvek(event.target)) return;

      const doba = performance.now() - start.cas;
      const pohyb = Math.hypot(t.clientX - start.x, t.clientY - start.y);
      if (doba > NOUZOVY_DEBUG_MAX_TAP_MS || pohyb > NOUZOVY_DEBUG_MAX_POHYB_PX) return;

      pridejNouzovyTap(t.clientX, t.clientY);
    }, { capture: true, passive: true });
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

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && migrationConfirmModal && !migrationConfirmModal.hidden) {
      event.preventDefault();
      zavriMigrationPotvrzeni(false);
    }
  });

  uctyTlacitko.addEventListener("click", async () => {
    zapisAdminHistory("accounts");
    await otevriUcty();
  });
  serverTlacitko.addEventListener("click", () => {
    zapisAdminHistory("server");
    zobrazServer();
  });
  uiTlacitko.addEventListener("click", () => {
    zapisAdminHistory("ui");
    zobrazUi();
  });
  serverZpetTlacitko.addEventListener("click", adminHistoryZpetNaDomov);
  uiZpetTlacitko.addEventListener("click", adminHistoryZpetNaDomov);
  serverObnovitTlacitko?.addEventListener("click", () => {
    nactiServerStatus();
    nactiMigrationStatus();
    nactiControlStatus();
  });
  controlMaintenanceTlacitko?.addEventListener(
    "click",
    () => potvrdControlAkci("MAINTENANCE")
  );
  controlNormalTlacitko?.addEventListener(
    "click",
    () => potvrdControlAkci("NORMAL")
  );
  migrationPrepareTlacitko?.addEventListener(
    "click",
    spustMigrationPrepare
  );
  migrationVerifyTlacitko?.addEventListener(
    "click",
    spustMigrationVerify
  );
  migrationCutoverTlacitko?.addEventListener(
    "click",
    spustMigrationCutover
  );
  migrationUseCloud?.addEventListener(
    "click",
    () => ulozMigrationDestinationPreset("cloud")
  );
  migrationUseLubaServer?.addEventListener(
    "click",
    () => ulozMigrationDestinationPreset("lubaserver")
  );
  migrationDestinationSave?.addEventListener(
    "click",
    ulozMigrationDestination
  );
  migrationConfirmOk?.addEventListener("click", () => {
    zavriMigrationPotvrzeni(true);
  });
  migrationConfirmCancel?.addEventListener("click", () => {
    zavriMigrationPotvrzeni(false);
  });
  migrationConfirmClose?.addEventListener("click", () => {
    zavriMigrationPotvrzeni(false);
  });
  migrationConfirmModal?.addEventListener("click", (event) => {
    if (event.target === migrationConfirmModal) {
      zavriMigrationPotvrzeni(false);
    }
  });
  useLubaServerTlacitko?.addEventListener(
    "click",
    () => prepniBackendZarizeni("lubanoteProduction")
  );
  useTestLubaServerTlacitko?.addEventListener(
    "click",
    () => prepniBackendZarizeni("lubanoteServer")
  );
  useCloudTlacitko?.addEventListener(
    "click",
    () => prepniBackendZarizeni("supabaseCloud")
  );
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
  window.addEventListener(
    "lubanote:sync-traffic-visibility-change",
    aktualizujSyncTrafficNastroj
  );
  zpetNaNastrojeTlacitko.addEventListener(
    "click",
    adminHistoryZpetNaDomov
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
  window.addEventListener("popstate", (event) => {
    const view = event.state?.[ADMIN_HISTORY_KEY] || null;

    if (view) {
      modal.hidden = false;
      adminHistoryDepth = Math.max(1, adminHistoryDepth - 1);
      if (view === "server") zobrazServer();
      else if (view === "ui") zobrazUi();
      else if (view === "accounts") {
        zobrazUcty();
        nastavFiltr("pending");
        nactiUzivatele();
      } else zobrazDomov();
      return;
    }

    if (!modal.hidden) {
      adminHistoryDepth = 0;
      modal.hidden = true;
      zastavServerStatusAutoRefresh();
      zobrazDomov();
      oznamCutoverKonzoli();
    }
  });

  /* PATCH 679E – Android systémové Zpět musí zavřít Admin Dashboard
   * stejně jako naše vlastní tlačítko, ne ukončit Activity. Zachováváme
   * chain ostatních modalů/editorů přes původní handler. */
  const puvodniAndroidZpetAdmin = window.LubaNoteZpracujAndroidZpet;
  window.LubaNoteZpracujAndroidZpet = function () {
    if (migrationConfirmModal && !migrationConfirmModal.hidden) {
      zavriMigrationPotvrzeni(false);
      return true;
    }
    if (!modal.hidden) {
      if (!serverPohled.hidden || !uiPohled.hidden || !uctyPohled.hidden) {
        adminHistoryZpetNaDomov();
      } else {
        zavriDashboardPresHistorii();
      }
      return true;
    }
    return typeof puvodniAndroidZpetAdmin === "function"
      ? puvodniAndroidZpetAdmin()
      : false;
  };

  window.addEventListener("lubanote:maintenance-end", () => {
    if (migrationCutoverKonzoleZapnuta) {
      nastavCutoverKonzoli(false);
    }
  });

  window.addEventListener("online", () => {
    if (!serverPohled.hidden && !modal.hidden) {
      nactiServerStatus();
    }
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

  /* PATCH 658AW – auth-valid je definitivní signál, že Supabase session
   * i serverem povolený účet jsou připravené. Admin kontrolu proto
   * opakujeme i zde; stále bez lokálního bypassu, rozhoduje pouze RPC. */
  window.addEventListener(
    "lubanote:auth-valid",
    () => {
      ucetAktivni = true;
      if (navigator.onLine) {
        overAdmina();
      }
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
