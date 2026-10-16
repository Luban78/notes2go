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

  function maBytStartupVKonsole() {
    try {
      return localStorage.getItem("lubanote.startup.console") === "1";
    } catch (_) {
      return false;
    }
  }

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

    if (maBytStartupVKonsole()) {
      console.log(`[LubaNote STARTUP] ${radek}`);
    }

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

  /* 685F: PASIVNÍ diagnostika černého okna při návratu z backgroundu.
   * Žádný overlay, CSS ani synchronizační stav se nemění.
   * Nečteme text poznámek ani privátní data. Vše jde do Start / sync / síť. */
  (() => {
    let navratCislo = 0;
    let posledniStart = -100000;
    let skrytoOd = null;
    let posledniRaf = 0;
    let rafDo = 0;

    function zkratStavPrvku(prvek) {
      if (!prvek) return "none";
      const tag = String(prvek.tagName || "?").toLowerCase();
      const id = prvek.id ? `#${String(prvek.id).slice(0, 32)}` : "";
      const cls = typeof prvek.className === "string"
        ? `.${prvek.className.trim().split(/\s+/).slice(0, 2).join(".")}`
        : "";
      return `${tag}${id}${cls}`.slice(0, 58);
    }

    function snimekStavu(popis, cislo, start) {
      if (cislo !== navratCislo || document.visibilityState !== "visible") return;
      try {
        const html = document.documentElement;
        const body = document.body;
        const splash = document.getElementById("appSplash");
        const prostredni = document.elementFromPoint(
          Math.floor(innerWidth / 2), Math.floor(innerHeight / 2)
        );
        const hlavicka = document.querySelector(".homeHeader");
        const stylBody = body ? getComputedStyle(body) : null;
        const stylHtml = getComputedStyle(html);
        const stylHlavicka = hlavicka ? getComputedStyle(hlavicka) : null;
        zapis("RESUME", `#${cislo} ${popis} +${Math.round(performance.now() - start)}ms` +
          ` | v=${document.visibilityState} f=${document.hasFocus() ? "Y" : "N"}` +
          ` | root=${stylHtml.backgroundColor} body=${stylBody?.backgroundColor || "?"}` +
          ` | bodyVis=${stylBody?.visibility || "?"} auth=${body?.classList.contains("authPending") ? "Y" : "N"}` +
          ` | splash=${splash ? getComputedStyle(splash).visibility : "removed"}` +
          ` | header=${stylHlavicka?.visibility || "none"} center=${zkratStavPrvku(prostredni)}`);
      } catch (chyba) {
        zapis("RESUME", `#${cislo} ${popis} snapshot-error=${chyba?.name || "unknown"}`);
      }
    }

    function zacniNavrat(zdroj) {
      const ted = performance.now();
      if (ted - posledniStart < 1200) {
        zapis("RESUME", `SIGNAL ${zdroj} | same-return #${navratCislo}`);
        return;
      }
      posledniStart = ted;
      const cislo = ++navratCislo;
      const odchod = skrytoOd === null ? "unknown" : `${Math.round(ted - skrytoOd)}ms`;
      zapis("RESUME", `BEGIN #${cislo} via=${zdroj} | hiddenFor=${odchod}`);
      snimekStavu("t0", cislo, ted);
      // SetTimeout odhalí blokovanou JS smyčku: skutečný čas píšeme z performance.now().
      for (const ms of [100, 350, 800, 1600, 3000, 5000]) {
        setTimeout(() => snimekStavu(`scheduled=${ms}ms`, cislo, ted), ms);
      }
      rafDo = ted + 5200;
      posledniRaf = 0;
      function zmerRaf(t) {
        if (cislo !== navratCislo || document.visibilityState !== "visible") return;
        if (posledniRaf && t - posledniRaf >= 180) {
          zapis("RESUME", `#${cislo} RAF_GAP ${Math.round(t - posledniRaf)}ms`);
        }
        posledniRaf = t;
        if (t < rafDo) requestAnimationFrame(zmerRaf);
      }
      requestAnimationFrame((t) => {
        zapis("RESUME", `#${cislo} FIRST_RAF +${Math.round(performance.now() - ted)}ms`);
        posledniRaf = t;
        if (t < rafDo) requestAnimationFrame(zmerRaf);
      });
    }

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        skrytoOd = performance.now();
        navratCislo++; // stop old sampling; no work while hidden
        zapis("RESUME", `BACKGROUND | hidden at ${Math.round(skrytoOd)}ms`);
      } else if (document.visibilityState === "visible") {
        zacniNavrat("visibility-visible");
      }
    });
    window.addEventListener("focus", () => {
      if (document.visibilityState === "visible" && skrytoOd !== null) zacniNavrat("window-focus");
    });
    window.addEventListener("pageshow", (udalost) => {
      if (skrytoOd !== null) zacniNavrat(`pageshow persisted=${udalost.persisted ? "Y" : "N"}`);
    });
    window.addEventListener("resize", () => {
      if (performance.now() - posledniStart < 5500) {
        zapis("RESUME", `#${navratCislo} WINDOW_RESIZE ${innerWidth}x${innerHeight}`);
      }
    });
    window.visualViewport?.addEventListener("resize", () => {
      if (performance.now() - posledniStart < 5500) {
        zapis("RESUME", `#${navratCislo} VISUAL_RESIZE ${Math.round(visualViewport.width)}x${Math.round(visualViewport.height)}`);
      }
    });
    window.addEventListener("lubanote:native-lifecycle", (udalost) => {
      const data = udalost.detail || {};
      zapis("NATIVE", `${String(data.phase || "unknown").slice(0, 30)}` +
        ` | uptime=${Number(data.uptimeMs) || 0} wall=${Number(data.epochMs) || 0}` +
        ` | shown=${data.webShown ? "Y" : "N"} visibility=${data.webVisibility}` +
        ` | focus=${data.decorFocus ? "Y" : "N"} hw=${data.webHardware ? "Y" : "N"}`);
      if (data.phase === "ON_RESUME" && skrytoOd !== null && document.visibilityState === "visible") {
        zacniNavrat("native-onResume");
      }
    });
    zapis("RESUME", "685F lifecycle + paint diagnostics armed (passive)");
  })();

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
