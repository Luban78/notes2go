(() => {
  "use strict";

  /*
   * BACKEND INDEPENDENCE V1 / PATCH 678D
   * -------------------------------------------------
   * PUVODNI ARCHITEKTURA LUBANOTE:
   * - Supabase Cloud je vychozi a hlavni produkce pro VSECHNA zarizeni.
   * - LubaServer PROD je pripraveny STANDBY cil pro budouci rizeny cutover.
   * - LubaServer TEST je testovaci/staging profil.
   * - Kazde zarizeni muze profil vedome prepnout v Admin Dashboardu.
   * - Hostname (GitHub Pages / APK / app.lubanote.com) NIKDY sam
   *   nerozhoduje, ktery backend je produkce.
   * - Budouci migrace na silnejsi server se ridi Migration Managerem
   *   pres zadany DESTINATION host; klientsky default se nemeni bez
   *   vyslovneho produkcniho cutoveru.
   */
  const VYCHOZI_PROFIL_ID = "supabaseCloud";

  const AKTIVNI_PROFIL_STORAGE_KEY = "lubanoteBackendProfileV1";

  const LUBASERVER_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzkwNjQ4ODA4LCJleHAiOjE5NDgzMjg4MDh9.JgT3DIL-JUgjQcH9TGuilZdUjK99jWuACuaASzxwN9U";

  const PROFILY = Object.freeze({
    supabaseCloud: Object.freeze({
      id: "supabaseCloud",
      nazev: "Supabase Cloud",
      typ: "supabase-cloud",
      prostredi: "production",
      backendId: "cloud",
      povolen: true,
      url: "https://nwdacgigplofksexssws.supabase.co/",
      publishableKey: "sb_publishable_VQpvaA0VAOcSxLtTG8Zr5Q_USIiro0c",
      projectRef: "nwdacgigplofksexssws",
      authStorageKey: "sb-nwdacgigplofksexssws-auth-token"
    }),

    lubanoteProduction: Object.freeze({
      id: "lubanoteProduction",
      nazev: "LubaServer STANDBY",
      typ: "supabase-selfhosted",
      prostredi: "standby",
      backendId: "lubaserver",
      povolen: true,
      url: "https://api.lubanote.com",
      publishableKey: LUBASERVER_KEY,
      projectRef: "lubanote-server",
      authStorageKey: "sb-lubanote-server-auth-token"
    }),

    lubanoteServer: Object.freeze({
      id: "lubanoteServer",
      nazev: "LubaNote Server TEST",
      typ: "supabase-selfhosted",
      prostredi: "test",
      backendId: "lubaserver",
      povolen: true,
      url: "https://test.lubanote.com",
      publishableKey: LUBASERVER_KEY,
      projectRef: "lubanote-server-test",
      authStorageKey: "sb-lubanote-server-test-auth-token"
    })
  });

  function nactiProfil(id) {
    return PROFILY[String(id || "").trim()] || null;
  }

  function nactiUlozenyProfilId() {
    try {
      const id = String(
        localStorage.getItem(AKTIVNI_PROFIL_STORAGE_KEY) || ""
      ).trim();
      const profil = nactiProfil(id);
      if (profil?.povolen) return profil.id;
    } catch (_) {}
    return VYCHOZI_PROFIL_ID;
  }

  function nactiAktivniProfil() {
    const profil = nactiProfil(nactiUlozenyProfilId());
    if (!profil || !profil.povolen || !profil.url || !profil.publishableKey) {
      throw new Error("LubaNote backend config: aktivní profil není připraven.");
    }
    return profil;
  }

  function nastavAktivniProfil(id) {
    const profil = nactiProfil(id);
    if (!profil || !profil.povolen || !profil.url || !profil.publishableKey) {
      throw new Error("LubaNote backend config: požadovaný profil není připraven.");
    }

    localStorage.setItem(AKTIVNI_PROFIL_STORAGE_KEY, profil.id);
    aktualizujTestBadge();
    return profil;
  }

  function jeTestovaciRezim() {
    return nactiAktivniProfil().prostredi === "test";
  }

  function aktualizujTestBadge() {
    const badge = document.getElementById("lubaTestBackendBadge");
    if (!badge) return;
    badge.hidden = !jeTestovaciRezim();
  }

  function jeBackendPozadavek(input) {
    try {
      const url = typeof input === "string" ? input : input?.url;
      if (!url) return false;

      const cil = new URL(url, window.location.href);
      const backend = new URL(nactiAktivniProfil().url, window.location.href);
      return cil.origin === backend.origin;
    } catch {
      return false;
    }
  }

  function nactiZnameAuthStorageKeys() {
    return Array.from(
      new Set(
        Object.values(PROFILY)
          .map((profil) => String(profil?.authStorageKey || "").trim())
          .filter(Boolean)
      )
    );
  }

  window.LubaNoteBackendConfig = Object.freeze({
    verze: "BI-1F-678D",
    prepinaniPovoleno: true,
    vychoziProfilId: VYCHOZI_PROFIL_ID,
    aktivniProfilStorageKey: AKTIVNI_PROFIL_STORAGE_KEY,
    nactiProfil,
    nactiAktivniProfil,
    nactiAktivniProfilId: nactiUlozenyProfilId,
    nastavAktivniProfil,
    jeTestovaciRezim,
    jeBackendPozadavek,
    nactiZnameAuthStorageKeys
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", aktualizujTestBadge, {
      once: true
    });
  } else {
    aktualizujTestBadge();
  }
})();
