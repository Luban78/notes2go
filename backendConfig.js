(() => {
  "use strict";

  /*
   * BACKEND CONTROL V2 / PATCH 679B
   * -------------------------------------------------
   * Jediny zdroj pravdy pro PRODUKCNI backend je verejny Control Point.
   * - Cloud je vychozi produkce.
   * - LubaServer PROD je dalsi produkcni cil.
   * - LubaServer TEST je rucne pripnuty admin/test profil a Control Point
   *   ho automaticky neprepina.
   * - Budouci VPS muze dodat dynamicky klientsky profil pres Control Point.
   * - Zmena produkcniho backendu nikdy nema mazat lokalni fronty.
   */

  const VYCHOZI_PROFIL_ID = "supabaseCloud";
  const AKTIVNI_PROFIL_STORAGE_KEY = "lubanoteBackendProfileV1";
  const DYNAMICKY_PROFIL_STORAGE_KEY = "lubanoteBackendDynamicProfileV1";

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
      authStorageKey: "sb-nwdacgigplofksexssws-auth-token",
      rizeni: "control-point"
    }),

    lubanoteProduction: Object.freeze({
      id: "lubanoteProduction",
      nazev: "LubaServer PROD",
      typ: "supabase-selfhosted",
      prostredi: "production",
      backendId: "lubaserver",
      povolen: true,
      url: "https://api.lubanote.com",
      publishableKey: LUBASERVER_KEY,
      projectRef: "lubanote-server",
      authStorageKey: "sb-lubanote-server-auth-token",
      rizeni: "control-point"
    }),

    lubanoteServer: Object.freeze({
      id: "lubanoteServer",
      nazev: "LubaNote Server TEST",
      typ: "supabase-selfhosted",
      prostredi: "test",
      backendId: "lubaserver-test",
      povolen: true,
      url: "https://test.lubanote.com",
      publishableKey: LUBASERVER_KEY,
      projectRef: "lubanote-server-test",
      authStorageKey: "sb-lubanote-server-test-auth-token",
      rizeni: "manual-test"
    })
  });

  function normalizujBackendId(hodnota) {
    const id = String(hodnota || "").trim().toLowerCase();
    return /^[a-z0-9._-]+$/.test(id) ? id : "";
  }

  function normalizujUrl(hodnota) {
    const raw = String(hodnota || "").trim();
    if (!raw) return "";
    try {
      const url = new URL(raw);
      if (!/^https?:$/.test(url.protocol)) return "";
      return url.toString().replace(/\/$/, "");
    } catch (_) {
      return "";
    }
  }

  function nactiDynamickyProfil() {
    try {
      const raw = localStorage.getItem(DYNAMICKY_PROFIL_STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      const backendId = normalizujBackendId(data?.backendId);
      const url = normalizujUrl(data?.url);
      const publishableKey = String(data?.publishableKey || "").trim();
      if (!backendId || !url || !publishableKey) return null;

      const projectRef = String(data?.projectRef || backendId).trim() || backendId;
      return Object.freeze({
        id: "dynamicProduction",
        nazev: String(data?.nazev || `VPS ${backendId}`).trim() || `VPS ${backendId}`,
        typ: "supabase-selfhosted",
        prostredi: "production",
        backendId,
        povolen: true,
        url,
        publishableKey,
        projectRef,
        authStorageKey:
          String(data?.authStorageKey || "").trim() ||
          `sb-${projectRef}-auth-token`,
        rizeni: "control-point"
      });
    } catch (_) {
      return null;
    }
  }

  function ulozDynamickyProfil(profil) {
    const backendId = normalizujBackendId(profil?.backendId);
    const url = normalizujUrl(profil?.url);
    const publishableKey = String(profil?.publishableKey || "").trim();
    if (!backendId || !url || !publishableKey) {
      throw new Error("LubaNote backend config: dynamický produkční profil není úplný.");
    }

    const projectRef = String(profil?.projectRef || backendId).trim() || backendId;
    const data = {
      backendId,
      url,
      publishableKey,
      projectRef,
      authStorageKey:
        String(profil?.authStorageKey || "").trim() ||
        `sb-${projectRef}-auth-token`,
      nazev: String(profil?.nazev || `VPS ${backendId}`).trim() || `VPS ${backendId}`
    };

    localStorage.setItem(DYNAMICKY_PROFIL_STORAGE_KEY, JSON.stringify(data));
    return nactiDynamickyProfil();
  }

  function nactiProfil(id) {
    const klic = String(id || "").trim();
    if (PROFILY[klic]) return PROFILY[klic];
    if (klic === "dynamicProduction") return nactiDynamickyProfil();
    return null;
  }

  function nactiUlozenyProfilId() {
    try {
      const id = String(localStorage.getItem(AKTIVNI_PROFIL_STORAGE_KEY) || "").trim();
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

  function profilProControlPoint(control) {
    const backendId = normalizujBackendId(control?.active_backend);
    if (!backendId) return null;

    if (backendId === "cloud") return PROFILY.supabaseCloud;
    if (backendId === "lubaserver") return PROFILY.lubanoteProduction;

    const klient = control?.client_profile;
    if (!klient || normalizujBackendId(klient.backend_id) !== backendId) {
      const ulozeny = nactiDynamickyProfil();
      return ulozeny?.backendId === backendId ? ulozeny : null;
    }

    try {
      return ulozDynamickyProfil({
        backendId,
        url: klient.url,
        publishableKey: klient.publishable_key,
        projectRef: klient.project_ref,
        authStorageKey: klient.auth_storage_key,
        nazev: klient.name || `VPS ${backendId}`
      });
    } catch (_) {
      return null;
    }
  }

  function sledujControlPoint(control, { vynutit = false } = {}) {
    const aktualni = nactiAktivniProfil();

    if (aktualni.prostredi === "test" && !vynutit) {
      return {
        ok: true,
        changed: false,
        pinnedTest: true,
        profil: aktualni
      };
    }

    const cil = profilProControlPoint(control);
    if (!cil) {
      return {
        ok: false,
        changed: false,
        duvod: "unknown-production-backend"
      };
    }

    const stejnyProfil = aktualni.id === cil.id;
    const stejnyBackend = aktualni.backendId === cil.backendId;
    const stejnaUrl = normalizujUrl(aktualni.url) === normalizujUrl(cil.url);
    const stejnyKlic = String(aktualni.publishableKey || "") === String(cil.publishableKey || "");

    if (stejnyProfil && stejnyBackend && stejnaUrl && stejnyKlic) {
      return { ok: true, changed: false, profil: aktualni };
    }

    localStorage.setItem(AKTIVNI_PROFIL_STORAGE_KEY, cil.id);
    aktualizujTestBadge();

    return {
      ok: true,
      changed: true,
      profil: cil,
      predchoziProfil: aktualni
    };
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
    const profily = [...Object.values(PROFILY)];
    const dynamicky = nactiDynamickyProfil();
    if (dynamicky) profily.push(dynamicky);

    return Array.from(
      new Set(
        profily
          .map((profil) => String(profil?.authStorageKey || "").trim())
          .filter(Boolean)
      )
    );
  }

  window.LubaNoteBackendConfig = Object.freeze({
    verze: "BC-2-679B",
    prepinaniPovoleno: true,
    vychoziProfilId: VYCHOZI_PROFIL_ID,
    aktivniProfilStorageKey: AKTIVNI_PROFIL_STORAGE_KEY,
    dynamickyProfilStorageKey: DYNAMICKY_PROFIL_STORAGE_KEY,
    nactiProfil,
    nactiAktivniProfil,
    nactiAktivniProfilId: nactiUlozenyProfilId,
    nastavAktivniProfil,
    ulozDynamickyProfil,
    profilProControlPoint,
    sledujControlPoint,
    jeTestovaciRezim,
    jeBackendPozadavek,
    nactiZnameAuthStorageKeys
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", aktualizujTestBadge, { once: true });
  } else {
    aktualizujTestBadge();
  }
})();
