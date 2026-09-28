/* ==================================================
   LubaNote – Backend Independence V1 / BI-1B
   Read-only diagnostika aktivního backendu.
   Nic nepřepíná a nic do backendu nezapisuje.
================================================== */

(() => {
  "use strict";

  const otevritTlacitko =
    document.getElementById("adminBackendToolButton");
  const modal =
    document.getElementById("backendDiagnosticsModal");
  const zavritTlacitko =
    document.getElementById("backendDiagnosticsCloseButton");
  const testTlacitko =
    document.getElementById("backendDiagnosticsRunButton");
  const profilNazev =
    document.getElementById("backendDiagnosticsProfileName");
  const profilUrl =
    document.getElementById("backendDiagnosticsProfileUrl");
  const celkovyStav =
    document.getElementById("backendDiagnosticsOverall");
  const budouciProfil =
    document.getElementById("backendDiagnosticsFutureProfile");

  const testy = {
    auth: document.getElementById("backendDiagAuth"),
    db: document.getElementById("backendDiagDb"),
    rpc: document.getElementById("backendDiagRpc"),
    storage: document.getElementById("backendDiagStorage"),
    realtime: document.getElementById("backendDiagRealtime")
  };

  if (
    !otevritTlacitko ||
    !modal ||
    !zavritTlacitko ||
    !testTlacitko ||
    !profilNazev ||
    !profilUrl ||
    !celkovyStav
  ) {
    return;
  }

  let probihaTest = false;
  let puvodniAndroidZpet = null;

  function profil() {
    return window.LubaNoteBackendConfig?.nactiAktivniProfil?.() || null;
  }

  function bezpecnyOrigin(url) {
    try {
      return new URL(String(url || "")).origin;
    } catch {
      return "—";
    }
  }

  function nastavRadek(prvek, stav, detail = "", ms = null) {
    if (!prvek) return;

    const badge = prvek.querySelector(".backendDiagBadge");
    const detailPrvek = prvek.querySelector(".backendDiagDetail");
    const casPrvek = prvek.querySelector(".backendDiagTime");

    prvek.dataset.state = stav;

    const texty = {
      idle: "Čeká",
      running: "Testuji…",
      ok: "OK",
      warning: "Varování",
      fail: "Chyba",
      skipped: "Přeskočeno"
    };

    if (badge) {
      badge.textContent = texty[stav] || stav;
    }

    if (detailPrvek) {
      detailPrvek.textContent = detail || "";
    }

    if (casPrvek) {
      casPrvek.textContent =
        Number.isFinite(ms) ? `${Math.round(ms)} ms` : "";
    }
  }

  function resetTestu() {
    Object.values(testy).forEach((prvek) => {
      nastavRadek(prvek, "idle", "Připraveno k testu.");
    });

    celkovyStav.dataset.state = "idle";
    celkovyStav.textContent = "Diagnostika ještě nebyla spuštěna.";
  }

  function nastavProfil() {
    const aktivni = profil();
    const budouci =
      window.LubaNoteBackendConfig?.nactiProfil?.("lubanoteServer") || null;

    profilNazev.textContent = aktivni?.nazev || "Neznámý backend";
    profilUrl.textContent = bezpecnyOrigin(aktivni?.url);

    if (budouciProfil) {
      const pripraven = Boolean(
        budouci?.povolen &&
        budouci?.url &&
        budouci?.publishableKey
      );

      budouciProfil.textContent = pripraven
        ? `${budouci?.nazev || "LubaNote Server"} · připraven`
        : `${budouci?.nazev || "LubaNote Server"} · čeká na BI-2`;
      budouciProfil.dataset.state = pripraven ? "ok" : "idle";
    }
  }

  function otevri() {
    if (window.LubaNoteAdminTools?.isAllowed?.() !== true) {
      return;
    }

    nastavProfil();
    modal.hidden = false;
    resetTestu();
  }

  function zavri() {
    modal.hidden = true;
  }

  function sLimitem(promise, ms, popis) {
    let timer = null;

    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`${popis}: timeout ${ms} ms`));
      }, ms);
    });

    return Promise.race([promise, timeout]).finally(() => {
      clearTimeout(timer);
    });
  }

  async function zmer(prvek, fn) {
    nastavRadek(prvek, "running", "Probíhá kontrola…");
    const start = performance.now();

    try {
      const vysledek = await fn();
      const ms = performance.now() - start;
      const stav = vysledek?.stav || "ok";
      const detail = vysledek?.detail || "V pořádku.";
      nastavRadek(prvek, stav, detail, ms);
      return { stav, detail, ms };
    } catch (error) {
      const ms = performance.now() - start;
      const detail = error?.message || String(error);
      nastavRadek(prvek, "fail", detail, ms);
      return { stav: "fail", detail, ms };
    }
  }

  async function pripravClient() {
    const aktivni = profil();

    if (
      !aktivni ||
      !aktivni.povolen ||
      !aktivni.url ||
      !aktivni.publishableKey
    ) {
      throw new Error("Aktivní backend profil není kompletní.");
    }

    if (!navigator.onLine) {
      throw new Error("Zařízení je offline.");
    }

    const pripraven = await sLimitem(
      Promise.resolve(
        window.LubaNoteSupabase?.pripravClient?.()
      ),
      7000,
      "Příprava Supabase klienta"
    );

    if (!pripraven) {
      throw new Error("Supabase klient se nepodařilo připravit.");
    }

    if (
      typeof supabaseClient === "undefined" ||
      !supabaseClient
    ) {
      throw new Error("Supabase klient není dostupný.");
    }

    return aktivni;
  }

  async function testAuth() {
    const { data, error } = await sLimitem(
      supabaseClient.auth.getUser(),
      7000,
      "Auth"
    );

    if (error) throw error;

    const user = data?.user;
    if (!user?.id) {
      throw new Error("Chybí ověřená uživatelská session.");
    }

    return {
      stav: "ok",
      detail: "Session ověřena serverem.",
      user
    };
  }

  async function testDb(user) {
    const { data, error } = await sLimitem(
      supabaseClient
        .from("tags")
        .select("id")
        .eq("user_id", user.id)
        .limit(1),
      7000,
      "DB / RLS"
    );

    if (error) throw error;

    return {
      stav: "ok",
      detail: `PostgREST + DB + RLS odpovídá (${Array.isArray(data) ? data.length : 0} ř.).`
    };
  }

  async function testRpc() {
    const { data, error } = await sLimitem(
      supabaseClient.rpc("lubanote_get_my_access"),
      7000,
      "RPC"
    );

    if (error) throw error;

    return {
      stav: "ok",
      detail: data
        ? "RPC + přístupová vrstva odpovídá."
        : "RPC odpovědělo bez chyby."
    };
  }

  async function testStorage(user) {
    const bucket =
      window.LubaNoteAttachmentsCloud?.bucket ||
      "lubanote-attachments";

    const { data, error } = await sLimitem(
      supabaseClient.storage
        .from(bucket)
        .list(user.id, {
          limit: 1,
          offset: 0,
          sortBy: {
            column: "name",
            order: "asc"
          }
        }),
      7000,
      "Storage"
    );

    if (error) throw error;

    return {
      stav: "ok",
      detail: `Bucket ${bucket} + uživatelská cesta odpovídá (${Array.isArray(data) ? data.length : 0} položek).`
    };
  }

  async function testRealtime() {
    const kanal = supabaseClient.channel(
      `lubanote-backend-diag-${Date.now()}`
    );

    let hotovo = false;

    try {
      const vysledek = await sLimitem(
        new Promise((resolve, reject) => {
          kanal.subscribe((stav) => {
            if (hotovo) return;

            if (stav === "SUBSCRIBED") {
              hotovo = true;
              resolve(stav);
              return;
            }

            if (
              stav === "CHANNEL_ERROR" ||
              stav === "TIMED_OUT"
            ) {
              hotovo = true;
              reject(new Error(`Realtime: ${stav}`));
            }
          });
        }),
        8000,
        "Realtime"
      );

      return {
        stav: "ok",
        detail: `WebSocket kanál připojen (${vysledek}).`
      };
    } finally {
      hotovo = true;
      try {
        await supabaseClient.removeChannel(kanal);
      } catch {
        // Diagnostika nesmí kvůli cleanupu spadnout.
      }
    }
  }

  function vyhodnotCelkove(vysledky) {
    const stavy = vysledky.map((x) => x?.stav || "fail");

    if (stavy.includes("fail")) {
      celkovyStav.dataset.state = "fail";
      celkovyStav.textContent =
        "Backend není připravený – alespoň jeden test selhal.";
      return;
    }

    if (stavy.includes("warning")) {
      celkovyStav.dataset.state = "warning";
      celkovyStav.textContent =
        "Backend odpovídá, ale diagnostika našla varování.";
      return;
    }

    celkovyStav.dataset.state = "ok";
    celkovyStav.textContent =
      "Backend připraven ✓  Auth, DB/RLS, RPC, Storage i Realtime prošly.";
  }

  async function spustTest() {
    if (probihaTest) return;

    probihaTest = true;
    testTlacitko.disabled = true;
    testTlacitko.textContent = "Testuji…";
    nastavProfil();
    resetTestu();

    try {
      await pripravClient();

      let user = null;
      const vysledky = [];

      const auth = await zmer(testy.auth, async () => {
        const vysledek = await testAuth();
        user = vysledek.user;
        return vysledek;
      });
      vysledky.push(auth);

      if (!user) {
        for (const klic of ["db", "rpc", "storage", "realtime"]) {
          nastavRadek(
            testy[klic],
            "skipped",
            "Bez ověřené session se test nespustil."
          );
          vysledky.push({ stav: "fail" });
        }
        vyhodnotCelkove(vysledky);
        return;
      }

      vysledky.push(await zmer(testy.db, () => testDb(user)));
      vysledky.push(await zmer(testy.rpc, testRpc));
      vysledky.push(await zmer(testy.storage, () => testStorage(user)));
      vysledky.push(await zmer(testy.realtime, testRealtime));

      vyhodnotCelkove(vysledky);
    } catch (error) {
      const detail = error?.message || String(error);

      Object.values(testy).forEach((prvek) => {
        if (prvek?.dataset?.state === "idle") {
          nastavRadek(prvek, "skipped", detail);
        }
      });

      celkovyStav.dataset.state = "fail";
      celkovyStav.textContent = `Diagnostiku nelze spustit: ${detail}`;
    } finally {
      probihaTest = false;
      testTlacitko.disabled = false;
      testTlacitko.textContent = "Spustit diagnostiku";
    }
  }

  otevritTlacitko.addEventListener("click", otevri);
  zavritTlacitko.addEventListener("click", zavri);
  testTlacitko.addEventListener("click", spustTest);

  modal.addEventListener("click", (event) => {
    if (event.target === modal && !probihaTest) {
      zavri();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden && !probihaTest) {
      event.preventDefault();
      zavri();
    }
  });

  /* Android systémové Zpět: diagnostika má přednost před ukončením app. */
  puvodniAndroidZpet = window.LubaNoteZpracujAndroidZpet;
  window.LubaNoteZpracujAndroidZpet = function () {
    if (!modal.hidden) {
      if (!probihaTest) {
        zavri();
      }
      return true;
    }

    if (typeof puvodniAndroidZpet === "function") {
      return puvodniAndroidZpet();
    }

    return false;
  };

  nastavProfil();
  resetTestu();

  window.LubaNoteBackendDiagnostics = Object.freeze({
    open: otevri,
    close: zavri,
    run: spustTest
  });
})();
