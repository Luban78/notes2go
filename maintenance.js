/* ==================================================
   LubaNote – Production Maintenance / Drain V3
   PATCH 679H

   - čte pouze veřejný Control Point,
   - produkční profil automaticky následuje active_backend,
   - ručně připnutý TEST profil se automaticky nepřepíná,
   - MAINTENANCE platí jen pro profil, který je právě active_backend,
   - ihned zablokuje nové uživatelské zápisy,
   - nechá doběhnout rozpracovanou změnu a vyprázdní existující Sync V2 frontu,
   - při nedostupném Control Pointu za běžného NORMAL provozu aplikaci
     neblokuje (offline-first); pokud už maintenance běží, zůstane fail-closed.
================================================== */
(() => {
  "use strict";

  const CONTROL_URL = "https://api.lubanote.com/control/v1/status";
  const CONTROL_HANDOFF_URL = "https://api.lubanote.com/control/v1/session-handoff";
  const BACKEND_SESSION_HANDOFF_KEY = "lubanoteBackendSessionHandoffV1";
  const INTERVAL_MS = 30000;
  const FETCH_TIMEOUT_MS = 5000;
  const RETRY_DRAIN_MS = 2200;

  function zapisMaintenance(text) {
    window.LubaNoteStartupDiag?.zapis?.(
      "MAINT",
      String(text || "")
    );
  }

  let posledniDiagControl = "";

  zapisMaintenance(`LOADED | poll=${INTERVAL_MS}ms`);

  let posledniStav = null;
  let maintenanceAktivni = false;
  let writeFreezeAktivni = false;
  let drainHotovy = false;
  let probihaKontrola = null;
  let drainTimer = null;
  let freezeTimer = null;
  let pollTimer = null;
  let overlay = null;
  let overlayTitulek = null;
  let overlayText = null;
  let overlayMeta = null;
  let cekajiciMaintenanceControl = null;

  function aktivniBackendId() {
    const profil = window.LubaNoteBackendConfig?.nactiAktivniProfil?.();
    const id = String(profil?.backendId || "").trim().toLowerCase();
    return /^[a-z0-9._-]+$/.test(id) ? id : null;
  }

  function jeValidniControl(data) {
    const backend = String(data?.active_backend || "").trim().toLowerCase();
    return Boolean(
      data &&
      data.ok === true &&
      Number(data.version) === 1 &&
      ["NORMAL", "MAINTENANCE"].includes(String(data.mode || "")) &&
      /^[a-z0-9._-]+$/.test(backend) &&
      typeof data.cutover_enabled === "boolean"
    );
  }

  async function nactiControlPoint() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(CONTROL_URL, {
        method: "GET",
        cache: "no-store",
        credentials: "omit",
        mode: "cors",
        signal: controller.signal,
        headers: { Accept: "application/json" }
      });

      if (!response.ok) {
        throw new Error(`control-http-${response.status}`);
      }

      const data = await response.json();
      if (!jeValidniControl(data)) {
        throw new Error("control-invalid-payload");
      }

      return data;
    } finally {
      clearTimeout(timeout);
    }
  }

  function vytvorOverlay() {
    /* PATCH 677T1 – auth renderer může během bootstrapu přestavět DOM.
     * Starý 677T si pak ponechal JS referenci na odpojený overlay a capture
     * guard blokoval login neviditelnou vrstvou. Proto vždy ověřujeme, že
     * overlay opravdu stále žije v dokumentu. */
    if (overlay?.isConnected) return overlay;

    overlay = null;
    overlayTitulek = null;
    overlayText = null;
    overlayMeta = null;

    let style = document.getElementById("lubanoteMaintenanceStyle677T");
    if (!style) {
      style = document.createElement("style");
      style.id = "lubanoteMaintenanceStyle677T";
      style.textContent = `
      #lubanoteMaintenanceOverlay677T {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: rgba(10, 13, 18, .84);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        box-sizing: border-box;
        pointer-events: auto;
      }
      #lubanoteMaintenanceOverlay677T[hidden] { display: none !important; }
      #lubanoteMaintenanceOverlay677T .lubaMaintenanceCard677T {
        width: min(460px, 100%);
        border-radius: 20px;
        padding: 24px 22px;
        box-sizing: border-box;
        background: var(--modal-bg, var(--card-bg, #181b20));
        color: var(--text-color, #fff);
        box-shadow: 0 20px 60px rgba(0,0,0,.38);
        text-align: center;
      }
      #lubanoteMaintenanceOverlay677T .lubaMaintenanceIcon677T {
        width: 48px;
        height: 48px;
        margin: 0 auto 12px;
        border-radius: 50%;
        display: grid;
        place-items: center;
        font-size: 24px;
        background: rgba(255,255,255,.08);
      }
      #lubanoteMaintenanceOverlay677T h2 {
        margin: 0 0 10px;
        font-size: 21px;
        line-height: 1.25;
      }
      #lubanoteMaintenanceOverlay677T p {
        margin: 0;
        line-height: 1.45;
      }
      #lubanoteMaintenanceOverlay677T .lubaMaintenanceMeta677T {
        margin-top: 14px;
        opacity: .72;
        font-size: 13px;
      }
      `;
      document.head.appendChild(style);
    }

    overlay = document.createElement("div");
    overlay.id = "lubanoteMaintenanceOverlay677T";
    overlay.hidden = true;
    overlay.setAttribute("role", "alertdialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.innerHTML = `
      <div class="lubaMaintenanceCard677T">
        <div class="lubaMaintenanceIcon677T" aria-hidden="true">🔒</div>
        <h2>Probíhá bezpečná údržba LubaNote</h2>
        <p>Dokončuji synchronizaci tohoto zařízení…</p>
        <p class="lubaMaintenanceMeta677T">Aplikaci teď nezavírej.</p>
      </div>
    `;

    overlayTitulek = overlay.querySelector("h2");
    overlayText = overlay.querySelector(".lubaMaintenanceCard677T > p");
    overlayMeta = overlay.querySelector(".lubaMaintenanceMeta677T");
    document.body.appendChild(overlay);
    return overlay;
  }

  function jeAuthUiAktivni() {
    return Boolean(document.body?.classList?.contains("authPending"));
  }

  function jeAdminCutoverKonzoleAktivni() {
    try {
      return window.LubaNoteAdminCutoverConsole?.jeAktivni?.() === true;
    } catch (_) {
      return false;
    }
  }

  function jePovolenyAdminCutoverTarget(event) {
    if (!jeAdminCutoverKonzoleAktivni()) return false;
    const cil = event?.target;
    const adminModal = document.getElementById("adminDashboardModal");
    if (!adminModal || adminModal.hidden || !cil || !adminModal.contains(cil)) return false;

    /* Dotyk/pointer dovolíme v celé konzoli kvůli scrollu. Samotný click
     * smí během freeze pouze do migrační karty nebo na zavření dashboardu. */
    if (event.type === "pointerdown" || event.type === "touchstart") return true;
    if (event.type === "click") {
      return Boolean(
        cil.closest?.(".adminMigrationCard") ||
        cil.closest?.("#closeAdminDashboardButton") ||
        cil.closest?.("#adminServerBackButton")
      );
    }
    return false;
  }

  function nastavOverlay(titulek, text, meta = "") {
    /* Login/registrace musí zůstat vždy ovladatelné. Bez platné session
     * stejně nelze zapisovat do SOURCE, takže zde není co write-freezovat. */
    if (jeAuthUiAktivni()) {
      skryjOverlay();
      return;
    }
    if (jeAdminCutoverKonzoleAktivni()) {
      if (overlay) overlay.hidden = true;
      document.body.classList.add("lubanoteMaintenanceActive677T");
      return;
    }
    vytvorOverlay();
    if (overlayTitulek) overlayTitulek.textContent = titulek;
    if (overlayText) overlayText.textContent = text;
    if (overlayMeta) overlayMeta.textContent = meta;
    overlay.hidden = false;
    document.body.classList.add("lubanoteMaintenanceActive677T");
  }

  function skryjOverlay() {
    if (overlay) overlay.hidden = true;
    document.body.classList.remove("lubanoteMaintenanceActive677T");
  }

  function zablokujEvent(event) {
    if (!maintenanceAktivni) return;
    /* Fail-safe: přihlášení se nesmí nikdy stát neinteraktivním ani při
     * chybě lifecycle/overlaye. */
    if (jeAuthUiAktivni()) return;
    if (jePovolenyAdminCutoverTarget(event)) return;
    if (overlay?.contains(event.target)) return;

    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();
  }

  [
    "beforeinput",
    "keydown",
    "pointerdown",
    "touchstart",
    "click",
    "submit",
    "drop",
    "paste",
    "cut"
  ].forEach((typ) => {
    document.addEventListener(typ, zablokujEvent, true);
  });

  function maJsonDluh(klic) {
    try {
      const raw = String(localStorage.getItem(klic) || "").trim();
      if (!raw || raw === "[]" || raw === "{}" || raw === "null") return false;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.length > 0;
      if (parsed && typeof parsed === "object") return Object.keys(parsed).length > 0;
      return Boolean(parsed);
    } catch (_) {
      return true;
    }
  }

  function maPomocnySyncDluh() {
    return [
      "lubanotePendingEditorReleasesV1",
      "lubanotePendingSecretBackupMetadataV1"
    ].some(maJsonDluh);
  }

  async function spustDrain() {
    if (!maintenanceAktivni || !writeFreezeAktivni || drainHotovy) return;
    clearTimeout(drainTimer);
    drainTimer = null;

    if (!navigator.onLine) {
      nastavOverlay(
        "Probíhá bezpečná údržba LubaNote",
        "Čekám na připojení k internetu, abych mohl dokončit synchronizaci.",
        "Aplikace zůstává bezpečně zamčená."
      );
      return;
    }

    nastavOverlay(
      "Probíhá bezpečná údržba LubaNote",
      "Dokončuji synchronizaci tohoto zařízení…",
      "Aplikaci teď nezavírej."
    );

    try {
      /* Aktivní editor lease uvolníme ještě před finálním drainem.
       * Pokud žádný editor otevřený není, helper pouze vrátí false. */
      try {
        await window.LubaNoteEditorHandoff?.uvolniEditorPoznamky?.();
      } catch (error) {
        console.warn("Maintenance: editor release se dokončí později:", error);
      }

      const drain = await window.LubaNoteSync?.vyprazdniFrontuProMaintenance?.();
      const pomocnyDluh = maPomocnySyncDluh();

      if (drain?.ok === true && !pomocnyDluh) {
        drainHotovy = true;
        nastavOverlay(
          "Zařízení je bezpečně synchronizované",
          "Všechny čekající změny z tohoto zařízení jsou odeslané.",
          "LubaNote zůstane zamčený do ukončení údržby."
        );
        window.dispatchEvent(new CustomEvent("lubanote:maintenance-drained", {
          detail: { backend: aktivniBackendId() }
        }));
        return;
      }

      const detail = pomocnyDluh
        ? "Čeká ještě pomocná synchronizační fronta."
        : drain?.duvod === "offline"
          ? "Čekám na internet."
          : "Ještě čeká synchronizační dluh nebo konflikt.";

      nastavOverlay(
        "Probíhá bezpečná údržba LubaNote",
        "Synchronizace ještě není bezpečně dokončená.",
        `${detail} Kontrolu zopakuji automaticky.`
      );
    } catch (error) {
      console.warn("Maintenance drain selhal:", error);
      nastavOverlay(
        "Probíhá bezpečná údržba LubaNote",
        "Synchronizaci se zatím nepodařilo dokončit.",
        "Aplikace zůstává zamčená a kontrolu zopakuji automaticky."
      );
    }

    if (maintenanceAktivni && !drainHotovy) {
      drainTimer = setTimeout(spustDrain, RETRY_DRAIN_MS);
    }
  }

  function pozastavMaintenanceProAuth(control = posledniStav) {
    cekajiciMaintenanceControl =
      control?.mode === "MAINTENANCE" ? control : null;

    maintenanceAktivni = false;
    writeFreezeAktivni = false;
    drainHotovy = false;
    clearTimeout(drainTimer);
    clearTimeout(freezeTimer);
    drainTimer = null;
    freezeTimer = null;
    skryjOverlay();
  }

  function aktivujMaintenance(control) {
    /* Maintenance se aktivuje až po platném login/account bootstrapu.
     * Na loginu jen zapamatujeme serverový požadavek a po auth-valid jej
     * znovu ověříme. */
    if (jeAuthUiAktivni()) {
      pozastavMaintenanceProAuth(control);
      return;
    }

    cekajiciMaintenanceControl = null;
    if (!maintenanceAktivni) {
      maintenanceAktivni = true;
      writeFreezeAktivni = false;
      drainHotovy = false;

      /* Overlay + capture guard zastaví další vstup okamžitě. Krátké okno
       * před write-freeze nechá blur/autosave uložit poslední rozepsaný stav
       * do existující lokální fronty; uživatel během něj nic dalšího zadat nemůže. */
      nastavOverlay(
        "Probíhá bezpečná údržba LubaNote",
        "Dokončuji poslední rozepsanou změnu…",
        "Aplikaci teď nezavírej."
      );
      try { document.activeElement?.blur?.(); } catch (_) {}

      clearTimeout(freezeTimer);
      freezeTimer = setTimeout(() => {
        freezeTimer = null;
        if (!maintenanceAktivni) return;
        writeFreezeAktivni = true;
        void spustDrain();
      }, 450);

      window.dispatchEvent(new CustomEvent("lubanote:maintenance-start", {
        detail: { backend: control.active_backend }
      }));
    }

    nastavOverlay(
      "Probíhá bezpečná údržba LubaNote",
      drainHotovy
        ? "Všechny čekající změny z tohoto zařízení jsou odeslané."
        : "Dokončuji synchronizaci tohoto zařízení…",
      drainHotovy
        ? "LubaNote zůstane zamčený do ukončení údržby."
        : "Aplikaci teď nezavírej."
    );

    if (writeFreezeAktivni && !drainHotovy && !drainTimer) {
      void spustDrain();
    }
  }

  function ukonciMaintenance() {
    cekajiciMaintenanceControl = null;
    if (!maintenanceAktivni) {
      skryjOverlay();
      return;
    }

    maintenanceAktivni = false;
    writeFreezeAktivni = false;
    drainHotovy = false;
    clearTimeout(drainTimer);
    clearTimeout(freezeTimer);
    drainTimer = null;
    freezeTimer = null;
    skryjOverlay();

    window.dispatchEvent(new CustomEvent("lubanote:maintenance-end"));

    /* Po návratu do NORMAL necháme standardní Sync V2 znovu lehce ověřit
     * stav; žádný backend switch zde není. */
    if (navigator.onLine) {
      window.LubaNoteSync?.spustRychle?.().catch(() => {});
    }
  }

  async function pripravSessionHandoff(control, aktualni, cil) {
    const sourceBackend = String(aktualni?.backendId || "").trim().toLowerCase();
    const destinationBackend = String(control?.active_backend || cil?.backendId || "").trim().toLowerCase();
    if (!sourceBackend || !destinationBackend) throw new Error("backend-id-missing");
    if (sourceBackend === destinationBackend) return { ok: true, skipped: true };

    const pripraven = await window.LubaNoteSupabase?.pripravClient?.();
    if (!pripraven || !supabaseClient?.auth) throw new Error("source-client-unavailable");
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    const token = data?.session?.access_token;
    if (!token) {
      if (localStorage.getItem("lubanoteAuthOk") === "1") throw new Error("source-session-missing");
      return { ok: true, skipped: true };
    }

    const response = await fetch(CONTROL_HANDOFF_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ source_backend: sourceBackend, destination_backend: destinationBackend }),
      cache: "no-store",
      credentials: "omit"
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok !== true || !payload?.token_hash) {
      throw new Error(payload?.error || `handoff-http-${response.status}`);
    }

    localStorage.setItem(BACKEND_SESSION_HANDOFF_KEY, JSON.stringify({
      version: 1,
      sourceBackend,
      destinationBackend,
      targetAuthStorageKey: String(cil?.authStorageKey || ""),
      tokenHash: String(payload.token_hash),
      tokenType: String(payload.token_type || "magiclink"),
      issuedUtc: String(payload.issued_utc || new Date().toISOString())
    }));
    return { ok: true };
  }

  async function srovnejProdukcniBackend(control) {
    const config = window.LubaNoteBackendConfig;
    if (!config?.sledujControlPoint) {
      return { ok: false, duvod: "backend-control-unavailable" };
    }

    const aktualni = config.nactiAktivniProfil?.();
    if (aktualni?.prostredi === "test") {
      return { ok: true, changed: false, pinnedTest: true, profil: aktualni };
    }
    const cil = config.profilProControlPoint?.(control);
    if (!cil) {
      maintenanceAktivni = true;
      writeFreezeAktivni = true;
      nastavOverlay(
        "Produkční backend nelze bezpečně určit",
        "Control Point ukazuje nový server, ale chybí platný klientský profil.",
        "LubaNote zůstává zamčený, aby nezapisoval na starý backend."
      );
      return { ok: false, duvod: "unknown-production-backend" };
    }

    const stejny = String(aktualni?.backendId || "") === String(cil?.backendId || "") &&
      String(aktualni?.url || "").replace(/\/$/, "") === String(cil?.url || "").replace(/\/$/, "");
    if (stejny) return { ok: true, changed: false, profil: aktualni };

    window.LubaNoteBackendSwitching = true;
    maintenanceAktivni = true;
    writeFreezeAktivni = true;
    drainHotovy = false;
    clearTimeout(drainTimer);
    clearTimeout(freezeTimer);
    drainTimer = null;
    freezeTimer = null;
    nastavOverlay(
      "Připravuji bezpečné přepnutí",
      `Nová produkce: ${cil?.nazev || control.active_backend}.`,
      "Přenáším přihlášení; lokální poznámky, Secret klíče a sync cursory zůstávají v zařízení."
    );

    try {
      await pripravSessionHandoff(control, aktualni, cil);
    } catch (error) {
      console.warn("Backend session handoff failed:", error);
      nastavOverlay(
        "Přihlášení nelze bezpečně přenést",
        "Produkce už byla přepnuta, ale automatický session handoff selhal.",
        "Zařízení zůstává zamčené na starém backendu a nic na něj nezapisuje. Zkus kontrolu znovu."
      );
      return { ok: false, duvod: "session-handoff-failed", error };
    }

    const vysledek = config.sledujControlPoint(control);
    if (vysledek?.ok !== true) return vysledek;

    nastavOverlay(
      "Přepínám produkční backend",
      `Nová produkce: ${vysledek.profil?.nazev || control.active_backend}.`,
      "Přihlášení i lokální data zůstávají zachované."
    );
    try { document.activeElement?.blur?.(); } catch (_) {}
    window.setTimeout(() => {
      const cilId = encodeURIComponent(String(control.active_backend || "production"));
      window.location.replace(`./?backendFollow=${cilId}`);
    }, 80);
    return { ...vysledek, changed: true };
  }

  async function aplikujControl(control) {
    posledniStav = control;

    const srovnani = await srovnejProdukcniBackend(control);
    if (srovnani?.ok !== true || srovnani?.changed) return;

    const profil = aktivniBackendId();
    const platiProTotoZarizeni = profil && control.active_backend === profil;

    const diagControl = [
      String(control?.mode || "-"),
      String(control?.active_backend || "-"),
      String(profil || "-"),
      platiProTotoZarizeni ? "Y" : "N"
    ].join("|");

    if (diagControl !== posledniDiagControl) {
      posledniDiagControl = diagControl;
      zapisMaintenance(
        `CONTROL | mode=${control?.mode || "-"} | active=${control?.active_backend || "-"} | local=${profil || "-"} | applies=${platiProTotoZarizeni ? "Y" : "N"}`
      );
    }

    if (control.mode === "MAINTENANCE" && platiProTotoZarizeni) {
      if (jeAuthUiAktivni()) {
        pozastavMaintenanceProAuth(control);
      } else {
        aktivujMaintenance(control);
      }
      return;
    }

    if (control.mode === "NORMAL" && platiProTotoZarizeni) {
      cekajiciMaintenanceControl = null;
    }

    /* Odemknout smíme jen tehdy, když NORMAL stále patří stejnému
     * backendu. Pokud se active_backend mezitím změnil, starý SOURCE
     * klient zůstane fail-closed; samotný CUTOVER řeší až další fáze. */
    if (maintenanceAktivni && control.mode === "NORMAL" && platiProTotoZarizeni) {
      ukonciMaintenance();
      return;
    }

    if (maintenanceAktivni && !platiProTotoZarizeni) {
      nastavOverlay(
        "Backend se změnil",
        "Toto zařízení zůstává bezpečně zamčené.",
        "Přepnutí backendu provede až samostatný bezpečný CUTOVER krok."
      );
    }
  }

  async function zkontrolujControlPoint() {
    if (probihaKontrola) return probihaKontrola;

    probihaKontrola = (async () => {
      try {
        const control = await nactiControlPoint();
        await aplikujControl(control);
        return control;
      } catch (error) {
        console.warn("LubaNote Control Point není dostupný:", error);
        zapisMaintenance(
          `CONTROL ERROR | ${error?.name || "Error"} | ${error?.message || "unknown"}`
        );

        /* NORMAL provoz zůstává offline-first. Během už potvrzeného
         * maintenance ale nikdy neodemkneme UI jen kvůli výpadku kontroly. */
        if (maintenanceAktivni) {
          nastavOverlay(
            drainHotovy
              ? "Zařízení je bezpečně synchronizované"
              : "Probíhá bezpečná údržba LubaNote",
            drainHotovy
              ? "Čekám na potvrzení ukončení údržby."
              : "Control Point je dočasně nedostupný.",
            "Aplikace zůstává bezpečně zamčená."
          );
        }
        return null;
      } finally {
        probihaKontrola = null;
      }
    })();

    return probihaKontrola;
  }

  function naplanujPolling() {
    clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      if (document.visibilityState === "visible") {
        void zkontrolujControlPoint();
      }
    }, INTERVAL_MS);
  }

  window.addEventListener("lubanote:auth-valid", () => {
    /* Session + account jsou potvrzené. Stav načteme znovu ze serveru;
     * nepoužíváme slepě starý payload z doby loginu. */
    void zkontrolujControlPoint();
  });

  ["lubanote:auth-expired", "lubanote:auth-required"].forEach((typ) => {
    window.addEventListener(typ, () => {
      if (maintenanceAktivni || cekajiciMaintenanceControl) {
        pozastavMaintenanceProAuth(posledniStav);
      }
    });
  });

  window.addEventListener("lubanote:admin-cutover-console-change", () => {
    if (!maintenanceAktivni) return;
    if (jeAdminCutoverKonzoleAktivni()) {
      if (overlay) overlay.hidden = true;
      document.body.classList.add("lubanoteMaintenanceActive677T");
      return;
    }
    nastavOverlay(
      drainHotovy ? "Zařízení je bezpečně synchronizované" : "Probíhá bezpečná údržba LubaNote",
      drainHotovy ? "Všechny čekající změny z tohoto zařízení jsou odeslané." : "Dokončuji synchronizaci tohoto zařízení…",
      drainHotovy ? "LubaNote zůstane zamčený do ukončení údržby." : "Aplikaci teď nezavírej."
    );
  });

  window.addEventListener("online", () => {
    void zkontrolujControlPoint();
    if (maintenanceAktivni && !drainHotovy) void spustDrain();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void zkontrolujControlPoint();
    }
  });

  window.LubaNoteMaintenance = Object.freeze({
    verze: "679H",
    controlUrl: CONTROL_URL,
    jeAktivni: () => maintenanceAktivni,
    jeWriteFreezeAktivni: () => writeFreezeAktivni,
    jeDrainHotovy: () => drainHotovy,
    cekaNaAuth: () => Boolean(cekajiciMaintenanceControl),
    ziskejPosledniControl: () => posledniStav ? { ...posledniStav } : null,
    zkontrolujTed: zkontrolujControlPoint
  });

  vytvorOverlay();
  void zkontrolujControlPoint();
  naplanujPolling();
})();
