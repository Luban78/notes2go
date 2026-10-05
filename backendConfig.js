(() => {
  "use strict";

  /*
   * BACKEND INDEPENDENCE V1 / BI-1B / PATCH 677M
   * -------------------------------------------------
   * Produkční výchozí profil zůstává Supabase Cloud.
   * Admin může na jednom zařízení dočasně přepnout do odděleného
   * TEST LubaServer profilu. Přepnutí vždy probíhá přes lokální reset,
   * aby se nemíchala cache Cloud ↔ LubaServer.
   */
  const VYCHOZI_PROFIL_ID = "supabaseCloud";
  const AKTIVNI_PROFIL_STORAGE_KEY = "lubanoteBackendProfileV1";

  const PROFILY = Object.freeze({
    supabaseCloud: Object.freeze({
      id: "supabaseCloud",
      nazev: "Supabase Cloud",
      typ: "supabase-cloud",
      prostredi: "production",
      povolen: true,
      url: "https://nwdacgigplofksexssws.supabase.co/",
      publishableKey:
        "sb_publishable_VQpvaA0VAOcSxLtTG8Zr5Q_USIiro0c",
      projectRef: "nwdacgigplofksexssws",
      authStorageKey: "sb-nwdacgigplofksexssws-auth-token"
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
    verze: "BI-1B-677M",
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
