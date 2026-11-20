/* 699D-CB – systémové Zpět pro mobilní Chrome a instalovanou PWA.
 * Android APK používá vlastní MainActivity a nesmí se měnit jeho Back cesta.
 * Historie webu poskytne dva záchytné kroky, aby rychlý dvojitý Back
 * nepřeskočil z editoru rovnou na ukončení PWA. Editor předá Back
 * stávajícímu bezpečnému handleru (Uložit/Neukládat/Zrušit).
 */
(() => {
  "use strict";

  const jeMobilniWeb =
    window.matchMedia?.("(max-width: 899px) and (pointer: coarse)")?.matches === true ||
    (/Android/i.test(navigator.userAgent || "") &&
      window.matchMedia?.("(display-mode: standalone)")?.matches === true) ||
    (navigator.maxTouchPoints > 0 && window.innerWidth <= 899);
  if (window.Capacitor?.isNativePlatform?.() === true || !jeMobilniWeb) {
    return;
  }

  const klic = "__lubanoteWebBack699DCB";
  const identita = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const etapaBase = `${identita}:base`;
  const etapaZaloha = `${identita}:zaloha`;
  const etapaAktivni = `${identita}:aktivni`;
  const ulozisteDiagnostiky = "lubanotePwaBackReport699DCB";
  const puvodniCesta = window.location.pathname + window.location.search;
  let uzivatelPotvrdilOdchod = false;
  let potvrzeni = null;
  let diagnostickyModal = null;

  // Jen procesní události (nikdy text, ID poznámky, uživatel ani token).
  // localStorage přežije i okamžité ukončení PWA systémovým tlačítkem.
  function zapisDiagnostiku(udalost, detail = "") {
    try {
      const stare = JSON.parse(localStorage.getItem(ulozisteDiagnostiky) || "[]");
      const udalosti = Array.isArray(stare) ? stare.slice(-38) : [];
      udalosti.push({
        cas: new Date().toISOString().slice(11, 23),
        udalost,
        detail: String(detail).slice(0, 100)
      });
      localStorage.setItem(ulozisteDiagnostiky, JSON.stringify(udalosti));
    } catch (_) { /* diagnostika nikdy nesmí zastavit editor */ }
  }

  function ziskejEtapu() {
    const aktualni = history.state?.[klic];
    if (aktualni === etapaAktivni) return "AKTIVNI";
    if (aktualni === etapaZaloha) return "ZALOHA";
    if (aktualni === etapaBase) return "BASE";
    return "CIZI";
  }

  function pripravStav(etapa) {
    const stav = history.state;
    return {
      ...(stav && typeof stav === "object" ? stav : {}),
      [klic]: etapa
    };
  }

  function editorJeOtevreny() {
    const editor = document.getElementById("taskModal");
    return !!(editor && !editor.hidden && editor.classList.contains("show"));
  }

  function editorMaZmeny() {
    if (!editorJeOtevreny()) return false;
    try {
      return typeof window.bylEditorZmenen === "function" &&
        window.bylEditorZmenen() === true;
    } catch (error) {
      // Pri nejistote zmeny raději chranime.
      return true;
    }
  }

  function pripravZachytHistorie() {
    if (uzivatelPotvrdilOdchod ||
        window.location.pathname + window.location.search !== puvodniCesta) return false;
    const aktualniEtapa = window.history.state?.[klic];
    if (aktualniEtapa === etapaAktivni) return true;
    try {
      // První instalace: původní položka BASE + ZÁLOHA + AKTIVNÍ.
      // Rychlý druhý Back může spadnout na BASE, ale ne mimo PWA.
      if (aktualniEtapa !== etapaZaloha && aktualniEtapa !== etapaBase) {
        window.history.replaceState(pripravStav(etapaBase), "", window.location.href);
      }
      if (aktualniEtapa !== etapaZaloha) {
        window.history.pushState(pripravStav(etapaZaloha), "", window.location.href);
      }
      window.history.pushState(pripravStav(etapaAktivni), "", window.location.href);
      zapisDiagnostiku("HISTORY_ARM", `from=${aktualniEtapa ? "known" : "none"} len=${history.length}`);
      return true;
    } catch (error) {
      console.warn("PWA Back: nelze připravit historii.", error);
      zapisDiagnostiku("HISTORY_ERROR", error?.name || "unknown");
      return false;
    }
  }

  function ukazPotvrzeniUkonceni() {
    if (!potvrzeni) {
      const okno = document.createElement("div");
      okno.className = "appMessageModal";
      okno.hidden = true;
      okno.id = "lnWebExitConfirm699DCB";

      const dialog = document.createElement("div");
      dialog.className = "appMessageDialog";
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("aria-labelledby", "lnWebExitTitle699DCB");

      const nadpis = document.createElement("h3");
      nadpis.id = "lnWebExitTitle699DCB";
      nadpis.textContent = "Ukončit LubaNote?";
      const zprava = document.createElement("p");
      zprava.textContent = "Opravdu chceš LubaNote ukončit?";
      const akce = document.createElement("div");
      akce.className = "appMessageActions";
      akce.style.gap = "10px";

      const zustat = document.createElement("button");
      zustat.type = "button";
      zustat.textContent = "Zůstat";
      zustat.addEventListener("click", () => {
        zapisDiagnostiku("EXIT_STAY");
        okno.hidden = true;
      });
      const ukoncit = document.createElement("button");
      ukoncit.type = "button";
      ukoncit.textContent = "Ukončit";
      ukoncit.addEventListener("click", () => {
        zapisDiagnostiku("EXIT_CONFIRM");
        okno.hidden = true;
        uzivatelPotvrdilOdchod = true;
        /* Prohlížeč smí odmítnout window.close() u uživatelské PWA.
         * Proto zkusíme opustit historii aplikace. Pokud stránka zůstane,
         * další systémové Zpět už neblokujeme. */
        try { window.close(); } catch (_) {}
        // Ze stavu AKTIVNI se vratime o 2 kroky na BASE. Jestli Chrome
        // window.close() zamitne, dalsi systemove Zpet uz PWA neblokuje.
        try { window.history.go(-2); } catch (_) {}
        // Dalsi Back jiz neblokujeme; window.close() Chrome PWA nemusi povolit.
      });

      akce.append(zustat, ukoncit);
      dialog.append(nadpis, zprava, akce);
      okno.append(dialog);
      okno.addEventListener("click", (event) => {
        if (event.target === okno) okno.hidden = true;
      });
      document.body.append(okno);
      potvrzeni = okno;
    }
    potvrzeni.hidden = false;
    zapisDiagnostiku("EXIT_MODAL_OPEN");
  }

  function ziskejDiagnostickyReport() {
    let zaznamy = [];
    try {
      const data = JSON.parse(localStorage.getItem(ulozisteDiagnostiky) || "[]");
      if (Array.isArray(data)) zaznamy = data;
    } catch (_) {}
    const standalone = window.matchMedia?.("(display-mode: standalone)")?.matches === true;
    const radky = [
      "LUBANOTE 699D-CB – PWA BACK DIAGNOSTIKA",
      `verze=${window.LUBANOTE_VERSION || "?"}`,
      `cas=${new Date().toISOString()}`,
      `rezim=${standalone ? "standalone" : "browser"} android=${/Android/i.test(navigator.userAgent || "") ? "Y" : "N"}`,
      `historie=${history.length} etapa=${ziskejEtapu()} editor=${editorJeOtevreny() ? "open" : "closed"}`,
      `udalosti=${zaznamy.length}`,
      "---"
    ];
    for (const zaznam of zaznamy) {
      radky.push(`${zaznam.cas || "?"} | ${zaznam.udalost || "?"} | ${zaznam.detail || ""}`);
    }
    radky.push("---", "Bez textu poznamek, ID poznamek, uctu a tokenu.");
    return radky.join("\n");
  }

  function zobrazDiagnostiku() {
    zapisDiagnostiku("REPORT_OPEN");
    if (!diagnostickyModal) {
      const obal = document.createElement("div");
      obal.className = "appMessageModal";
      obal.id = "lnWebBackReport699DCB";
      obal.hidden = true;
      const karta = document.createElement("div");
      karta.className = "appMessageDialog";
      karta.setAttribute("role", "dialog");
      karta.setAttribute("aria-modal", "true");
      karta.setAttribute("aria-label", "PWA Back diagnostika");
      karta.style.maxHeight = "80vh";
      karta.style.overflowY = "auto";
      const nadpis = document.createElement("h3");
      nadpis.textContent = "PWA Back diagnostika";
      const popis = document.createElement("p");
      popis.textContent = "Zkopíruj pouze tento krátký report. Zůstane i po nečekaném ukončení PWA.";
      const vystup = document.createElement("textarea");
      vystup.readOnly = true;
      vystup.spellcheck = false;
      vystup.style.cssText = "box-sizing:border-box;width:100%;height:min(40vh,280px);resize:vertical;font:12px/1.35 monospace;padding:10px;border-radius:10px;background:var(--color-background);color:var(--color-text);border:1px solid var(--color-border)";
      const akce = document.createElement("div");
      akce.className = "appMessageActions";
      const kopirovat = document.createElement("button");
      kopirovat.type = "button";
      kopirovat.textContent = "Kopírovat report";
      kopirovat.addEventListener("click", async () => {
        const zprava = ziskejDiagnostickyReport();
        vystup.value = zprava;
        try {
          await navigator.clipboard.writeText(zprava);
          kopirovat.textContent = "Zkopírováno ✓";
        } catch (_) {
          vystup.focus();
          vystup.select();
          kopirovat.textContent = "Označeno – zkopíruj";
        }
      });
      const zavrit = document.createElement("button");
      zavrit.type = "button";
      zavrit.textContent = "Zavřít";
      zavrit.addEventListener("click", () => { obal.hidden = true; });
      akce.append(kopirovat, zavrit);
      karta.append(nadpis, popis, vystup, akce);
      obal.append(karta);
      document.body.append(obal);
      diagnostickyModal = { obal, vystup, kopirovat };
    }
    diagnostickyModal.vystup.value = ziskejDiagnostickyReport();
    diagnostickyModal.kopirovat.textContent = "Kopírovat report";
    diagnostickyModal.obal.hidden = false;
  }

  function pripojReportNaVerzi() {
    const verze = document.getElementById("lubaNoteVersionBadge");
    if (!verze || verze.dataset?.lnBackDiag699DCB === "1") return;
    verze.dataset.lnBackDiag699DCB = "1";
    verze.setAttribute("aria-hidden", "false");
    verze.setAttribute("role", "button");
    verze.setAttribute("tabindex", "0");
    verze.setAttribute("aria-label", "Zobrazit PWA Back report");
    verze.title = "PWA Back report – klepni";
    verze.style.pointerEvents = "auto";
    verze.style.padding = "9px 7px 7px";
    verze.style.cursor = "pointer";
    verze.addEventListener("click", zobrazDiagnostiku);
    verze.addEventListener("keydown", (udalost) => {
      if (udalost.key === "Enter" || udalost.key === " ") {
        udalost.preventDefault();
        zobrazDiagnostiku();
      }
    });
  }

  window.addEventListener("popstate", (event) => {
    if (uzivatelPotvrdilOdchod) {
      zapisDiagnostiku("POP_AFTER_EXIT");
      return;
    }
    /* Přesun mezi stránkami Admin Dashboardu vlastní jeho vlastní router.
     * Ten zachovává náš aktivní state, proto jeho Back nepřebíráme. */
    if (event.state?.[klic] === etapaAktivni) return;
    if (window.location.pathname + window.location.search !== puvodniCesta) return;

    const aktualniEtapa = ziskejEtapu();
    zapisDiagnostiku("BACK_POP", `etapa=${aktualniEtapa} editor=${editorJeOtevreny() ? "Y" : "N"}`);
    pripravZachytHistorie();
    if (diagnostickyModal && !diagnostickyModal.obal.hidden) {
      diagnostickyModal.obal.hidden = true;
      zapisDiagnostiku("REPORT_BACK_CLOSE");
      return;
    }
    if (potvrzeni && !potvrzeni.hidden) {
      potvrzeni.hidden = true;
      zapisDiagnostiku("EXIT_BACK_CLOSE");
      return;
    }
    try {
      if (window.LubaNoteZpracujAndroidZpet?.() === true) {
        zapisDiagnostiku("BACK_HANDLED", `editor=${editorJeOtevreny() ? "Y" : "N"}`);
        return;
      }
    } catch (error) {
      console.error("PWA Back: chyba handleru editoru.", error);
      zapisDiagnostiku("BACK_ERROR", error?.name || "unknown");
    }
    if (editorJeOtevreny()) {
      zapisDiagnostiku("BACK_EDITOR_GUARD");
      return;
    }
    ukazPotvrzeniUkonceni();
  });

  /* Chrome muze v instalovane PWA ukoncit okno bez popstate. Pokud se
     dokument skutecne opousti a editor ma zmeny, vyzadat potvrzeni
     prohlizece. Mobilni OS nemusi beforeunload dorucit pri hard killu. */
  window.addEventListener("beforeunload", (event) => {
    if (uzivatelPotvrdilOdchod) return;
    const zmeny = editorMaZmeny();
    zapisDiagnostiku("BEFOREUNLOAD", `editor=${editorJeOtevreny() ? "Y" : "N"} dirty=${zmeny ? "Y" : "N"}`);
    if (!zmeny) return;
    event.preventDefault();
    event.returnValue = "";
  });

  window.addEventListener("pageshow", () => {
    zapisDiagnostiku("PAGESHOW", `hidden=${document.hidden ? "Y" : "N"}`);
    if (!uzivatelPotvrdilOdchod) pripravZachytHistorie();
  });
  window.addEventListener("pagehide", () => {
    zapisDiagnostiku("PAGEHIDE", `editor=${editorJeOtevreny() ? "Y" : "N"}`);
  });
  window.addEventListener("focus", () => {
    if (ziskejEtapu() !== "AKTIVNI") pripravZachytHistorie();
  });
  document.addEventListener("visibilitychange", () => {
    zapisDiagnostiku("VISIBILITY", `state=${document.visibilityState} editor=${editorJeOtevreny() ? "Y" : "N"}`);
    if (document.visibilityState === "visible") pripravZachytHistorie();
  });
  /* Jen jednou na zacatku dotyku, nikoli pri MOVE s caretem. */
  document.addEventListener("pointerdown", () => {
    if (history.state?.[klic] !== etapaAktivni) {
      zapisDiagnostiku("TOUCH_REARM", `etapa=${ziskejEtapu()}`);
      pripravZachytHistorie();
    }
  }, { capture: true, passive: true });

  zapisDiagnostiku("INIT", `len=${history.length} standalone=${window.matchMedia?.("(display-mode: standalone)")?.matches === true ? "Y" : "N"}`);
  pripravZachytHistorie();
  pripojReportNaVerzi();
  window.addEventListener("load", pripojReportNaVerzi);
})();
