(() => {
  "use strict";

  /*
   * BACKEND INDEPENDENCE V1 / BI-1D / PATCH 678B
   * -------------------------------------------------
   * Nouzový pracovní režim 678B:
   * - GitHub Pages (luban78.github.io) dočasně používá Supabase Cloud jen
   *   pro Auth/čtení, protože firemní FortiGuard blokuje api.lubanote.com.
   * - zápisy na Cloud zůstávají serverově frozen a Sync V2 je nechá v lokální frontě.
   * - APK / ostatní hosty dál používají produkční LubaServer.
   * Legacy ID "supabaseCloud" zůstává zachované, takže se nemaže IndexedDB/cache.
   */
  const VYCHOZI_PROFIL_ID = "supabaseCloud";
  const AKTIVNI_PROFIL_STORAGE_KEY = "lubanoteBackendProfileV1";
  const JE_NOUZOVY_GITHUB_WEB =
    String(window.location?.hostname || "").toLowerCase() === "luban78.github.io";

  const PROFILY = Object.freeze({
    // Legacy ID zachováváme, aby se kvůli nouzovému WEB režimu nespustil
    // backend-switch reset lokální cache. Na GitHub Pages je to dočasně Cloud,
    // všude jinde produkční LubaServer.
    supabaseCloud: Object.freeze({
      id: "supabaseCloud",
      nazev: JE_NOUZOVY_GITHUB_WEB ? "Supabase Cloud – nouzový WEB" : "LubaNote Server",
      typ: JE_NOUZOVY_GITHUB_WEB ? "supabase-cloud-emergency" : "supabase-selfhosted",
      prostredi: "production",
      povolen: true,
      nouzovyWebCloud: JE_NOUZOVY_GITHUB_WEB,
      url: JE_NOUZOVY_GITHUB_WEB
        ? "https://nwdacgigplofksexssws.supabase.co/"
        : "https://api.lubanote.com",
      publishableKey: JE_NOUZOVY_GITHUB_WEB
        ? "sb_publishable_VQpvaA0VAOcSxLtTG8Zr5Q_USIiro0c"
        : "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzkwNjQ4ODA4LCJleHAiOjE5NDgzMjg4MDh9.JgT3DIL-JUgjQcH9TGuilZdUjK99jWuACuaASzxwN9U",
      projectRef: JE_NOUZOVY_GITHUB_WEB ? "nwdacgigplofksexssws" : "lubanote-server",
      authStorageKey: JE_NOUZOVY_GITHUB_WEB
        ? "sb-nwdacgigplofksexssws-auth-token"
        : "sb-lubanote-server-auth-token"
    }),

    lubanoteServer: Object.freeze({
      id: "lubanoteServer",
      nazev: "LubaNote Server",
      typ: "supabase-selfhosted",
      prostredi: "test",
      povolen: true,
      url: "https://test.lubanote.com",
      publishableKey:
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzkwNjQ4ODA4LCJleHAiOjE5NDgzMjg4MDh9.JgT3DIL-JUgjQcH9TGuilZdUjK99jWuACuaASzxwN9U",
      projectRef: "lubanote-server",
      authStorageKey: "sb-lubanote-server-auth-token"
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
      const url =
        typeof input === "string"
          ? input
          : input?.url;

      if (!url) return false;

      const cil = new URL(url, window.location.href);
      const backend = new URL(
        nactiAktivniProfil().url,
        window.location.href
      );

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
    verze: "BI-1D-678B",
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
