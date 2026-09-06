/* ========================================
   LUBANOTE – STARTUP / SYNC DIAGNOSTIKA
   Pasivní diagnostika: nemění pořadí ani výsledek requestů.
======================================== */

(() => {
  "use strict";

  if (window.LubaNoteStartupDiag) {
    return;
  }

  const startCas = performance.now();
  const zaznamy = [];
  const aktivniPozadavky = new Map();
  const posluchaci = new Set();
  const MAX_ZAZNAMU = 500;
  let poradiPozadavku = 0;
  let splashPripraven = false;

  function cas() {
    return Math.round(performance.now() - startCas);
  }

  function zkrat(text, max = 180) {
    const hodnota = String(text ?? "")
      .replace(/\s+/g, " ")
      .trim();

    return hodnota.length <= max
      ? hodnota
      : `${hodnota.slice(0, max - 1)}…`;
  }

  function vytvorRadek(typ, text) {
    return `${String(cas()).padStart(6, " ")} ms | ${typ.padEnd(8, " ")} | ${text}`;
  }

  function zapis(typ, text, detail = null) {
    const radek = vytvorRadek(typ, zkrat(text));

    zaznamy.push({
      cas: cas(),
      typ,
      text: zkrat(text),
      detail,
      radek
    });

    if (zaznamy.length > MAX_ZAZNAMU) {
      zaznamy.splice(0, zaznamy.length - MAX_ZAZNAMU);
    }

    console.log(`[LubaNote STARTUP] ${radek}`);

    posluchaci.forEach((posluchac) => {
      try {
        posluchac(radek);
      } catch (_chyba) {
        // Diagnostika nikdy nesmí ovlivnit aplikaci.
      }
    });

    window.dispatchEvent(
      new CustomEvent("lubanote:startup-diag", {
        detail: { radek }
      })
    );

    return radek;
  }

  function zacni(nazev, detail = null) {
    const token = {
      nazev: String(nazev || "BLOK"),
      start: performance.now(),
      ukoncen: false
    };

    zapis("START", token.nazev, detail);
    return token;
  }

  function konec(token, stav = "OK", detail = null) {
    if (!token || token.ukoncen) {
      return;
    }

    token.ukoncen = true;
    const trvani = Math.round(performance.now() - token.start);
    zapis("END", `${token.nazev} | ${stav} | ${trvani} ms`, detail);
  }

  function popisEndpointu(url) {
    let parsed;

    try {
      parsed = new URL(String(url), location.href);
    } catch (_chyba) {
      return zkrat(url, 100);
    }

    const path = parsed.pathname;

    if (path.includes("/rest/v1/rpc/")) {
      return `RPC ${path.split("/rest/v1/rpc/")[1].split("?")[0]}`;
    }

    if (path.includes("/rest/v1/tags")) {
      return "REST tags";
    }

    if (path.includes("/rest/v1/devices")) {
      return "REST devices";
    }

    if (path.includes("/auth/v1/")) {
      return `AUTH ${path.split("/auth/v1/")[1]}`;
    }

    if (path.includes("/storage/v1/")) {
      return `STORAGE ${path.split("/storage/v1/")[1]}`;
    }

    return `${parsed.host}${path}`;
  }

  const puvodniFetch = window.fetch?.bind(window);

  if (puvodniFetch) {
    window.fetch = async function (...args) {
      const input = args[0];
      const init = args[1] || {};
      const url = typeof input === "string"
        ? input
        : input?.url || "";
      const metoda = String(
        init.method || input?.method || "GET"
      ).toUpperCase();
      const id = ++poradiPozadavku;
      const nazev = `${metoda} ${popisEndpointu(url)}`;
      const token = zacni(`HTTP #${id} ${nazev}`);

      aktivniPozadavky.set(id, {
        id,
        nazev,
        start: performance.now()
      });

      try {
        const odpoved = await puvodniFetch(...args);
        konec(token, `HTTP ${odpoved.status}`);
        return odpoved;
      } catch (error) {
        konec(token, `CHYBA ${error?.name || "Error"}`);
        throw error;
      } finally {
        aktivniPozadavky.delete(id);
      }
    };
  }

  function vypisVisiciPozadavky(duvod) {
    if (aktivniPozadavky.size === 0) {
      zapis("CHECK", `${duvod}: žádný aktivní HTTP request`);
      return;
    }

    const ted = performance.now();
    const text = Array.from(aktivniPozadavky.values())
      .map((pozadavek) => {
        const vek = Math.round(ted - pozadavek.start);
        return `#${pozadavek.id} ${pozadavek.nazev} (${vek} ms)`;
      })
      .join(" | ");

    zapis("PENDING", `${duvod}: ${text}`);
  }

  function report() {
    const hlavicka = [
      "LUBANOTE STARTUP / SYNC REPORT",
      `verze: ${window.LUBANOTE_VERSION || "DEV"}`,
      `cas: ${new Date().toISOString()}`,
      `online: ${navigator.onLine}`,
      `visibility: ${document.visibilityState}`,
      `splash-ready: ${splashPripraven}`,
      ""
    ].join("\n");

    return hlavicka + zaznamy.map((zaznam) => zaznam.radek).join("\n");
  }

  function priRadku(posluchac) {
    if (typeof posluchac !== "function") {
      return () => {};
    }

    posluchaci.add(posluchac);
    return () => posluchaci.delete(posluchac);
  }

  window.LubaNoteStartupDiag = {
    zapis,
    zacni,
    konec,
    report,
    radky: () => zaznamy.map((zaznam) => zaznam.radek),
    priRadku,
    vypisVisiciPozadavky
  };

  zapis("MARK", "APP START – startupDiagnostics.js běží");

  document.addEventListener("DOMContentLoaded", () => {
    zapis("MARK", "DOM CONTENT LOADED");
  });

  window.addEventListener("load", () => {
    zapis("MARK", "WINDOW LOAD");
  });

  window.addEventListener("lubanote:account-active", () => {
    zapis("EVENT", "ACCOUNT ACTIVE");
  });

  window.addEventListener("lubanote:auth-valid", () => {
    zapis("EVENT", "AUTH READY / auth-valid");
  });

  window.addEventListener("lubanote:splash-ready", () => {
    splashPripraven = true;
    zapis("EVENT", "UI READY / splash-ready");
    vypisVisiciPozadavky("při UI READY");
  });

  window.addEventListener("online", () => {
    zapis("EVENT", "ONLINE");
  });

  window.addEventListener("offline", () => {
    zapis("EVENT", "OFFLINE");
  });

  document.addEventListener("visibilitychange", () => {
    zapis("EVENT", `VISIBILITY ${document.visibilityState}`);
  });

  setTimeout(() => {
    if (!splashPripraven) {
      zapis("WATCH", "8 s od startu a UI READY ještě nepřišlo");
    }
    vypisVisiciPozadavky("8 s watchdog");
  }, 8000);

  setTimeout(() => {
    if (!splashPripraven) {
      zapis("WATCH", "15 s od startu a UI READY ještě nepřišlo");
    }
    vypisVisiciPozadavky("15 s watchdog");
  }, 15000);
})();
