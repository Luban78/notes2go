(() => {
  "use strict";

  /*
   * BACKEND INDEPENDENCE V1 / BI-1A
   * --------------------------------
   * Jediné místo, které zná adresu a veřejný klíč produkčního backendu.
   * V této první bezpečné fázi je aktivní výhradně stávající Supabase Cloud.
   * Přepínání backendu se záměrně ještě nepovoluje.
   */
  const VYCHOZI_PROFIL_ID = "supabaseCloud";

  const PROFILY = Object.freeze({
    supabaseCloud: Object.freeze({
      id: "supabaseCloud",
      nazev: "Supabase Cloud",
      typ: "supabase-cloud",
      povolen: true,
      url: "https://nwdacgigplofksexssws.supabase.co/",
      publishableKey:
        "sb_publishable_VQpvaA0VAOcSxLtTG8Zr5Q_USIiro0c",
      projectRef: "nwdacgigplofksexssws",
      authStorageKey: "sb-nwdacgigplofksexssws-auth-token"
    }),

    /*
     * Rezervované místo pro budoucí vlastní server.
     * Dokud BI-2 až BI-6 neprojdou auditem, profil je vypnutý a bez endpointu.
     */
    lubanoteServer: Object.freeze({
      id: "lubanoteServer",
      nazev: "LubaNote Server",
      typ: "supabase-selfhosted",
      povolen: false,
      url: "",
      publishableKey: "",
      projectRef: "lubanote-server",
      authStorageKey: "sb-lubanote-server-auth-token"
    })
  });

  function nactiProfil(id) {
    return PROFILY[String(id || "").trim()] || null;
  }

  function nactiAktivniProfil() {
    const profil = nactiProfil(VYCHOZI_PROFIL_ID);
    if (!profil || !profil.povolen || !profil.url || !profil.publishableKey) {
      throw new Error("LubaNote backend config: aktivní profil není připraven.");
    }
    return profil;
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
    verze: "BI-1A",
    prepinaniPovoleno: false,
    vychoziProfilId: VYCHOZI_PROFIL_ID,
    nactiProfil,
    nactiAktivniProfil,
    jeBackendPozadavek,
    nactiZnameAuthStorageKeys
  });
})();
