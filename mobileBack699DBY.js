/* 699D-BZ – systémové Zpět pro mobilní Chrome a instalovanou PWA.
 * Android APK používá vlastní MainActivity a nesmí se měnit jeho Back cesta.
 * Historie webu poskytne jeden záchytný krok, aby Back nejprve zavřel editor
 * stejným bezpečným handlerem (včetně Uložit/Neukládat/Zrušit).
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

  const klic = "__lubanoteWebBack699DBZ";
  const identita = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const puvodniCesta = window.location.pathname + window.location.search;
  let uzivatelPotvrdilOdchod = false;
  let potvrzeni = null;

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
    if (window.history.state?.[klic] === identita) return true;
    try {
      window.history.pushState(
        { ...(window.history.state && typeof window.history.state === "object"
          ? window.history.state : {}), [klic]: identita },
        "", window.location.href
      );
      return true;
    } catch (error) {
      console.warn("PWA Back: nelze připravit historii.", error);
      return false;
    }
  }

  function ukazPotvrzeniUkonceni() {
    if (!potvrzeni) {
      const okno = document.createElement("div");
      okno.className = "appMessageModal";
      okno.hidden = true;
      okno.id = "lnWebExitConfirm699DBZ";

      const dialog = document.createElement("div");
      dialog.className = "appMessageDialog";
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("aria-labelledby", "lnWebExitTitle699DBZ");

      const nadpis = document.createElement("h3");
      nadpis.id = "lnWebExitTitle699DBZ";
      nadpis.textContent = "Ukončit LubaNote?";
      const zprava = document.createElement("p");
      zprava.textContent = "Opravdu chceš LubaNote ukončit?";
      const akce = document.createElement("div");
      akce.className = "appMessageActions";
      akce.style.gap = "10px";

      const zustat = document.createElement("button");
      zustat.type = "button";
      zustat.textContent = "Zůstat";
      zustat.addEventListener("click", () => { okno.hidden = true; });
      const ukoncit = document.createElement("button");
      ukoncit.type = "button";
      ukoncit.textContent = "Ukončit";
      ukoncit.addEventListener("click", () => {
        okno.hidden = true;
        uzivatelPotvrdilOdchod = true;
        /* Prohlížeč smí odmítnout window.close() u uživatelské PWA.
         * Proto zkusíme opustit historii aplikace. Pokud stránka zůstane,
         * další systémové Zpět už neblokujeme. */
        try { window.close(); } catch (_) {}
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
  }

  window.addEventListener("popstate", (event) => {
    if (uzivatelPotvrdilOdchod) return;
    /* Přesun mezi stránkami Admin Dashboardu vlastní jeho vlastní router.
     * Ten zachovává state našeho záchytu, proto jeho Back nepřebíráme. */
    if (event.state?.[klic] === identita) return;
    if (window.location.pathname + window.location.search !== puvodniCesta) return;

    pripravZachytHistorie();
    if (potvrzeni && !potvrzeni.hidden) {
      potvrzeni.hidden = true;
      return;
    }
    try {
      if (window.LubaNoteZpracujAndroidZpet?.() === true) return;
    } catch (error) {
      console.error("PWA Back: chyba handleru editoru.", error);
    }
    if (editorJeOtevreny()) return;
    ukazPotvrzeniUkonceni();
  });

  /* Chrome muze v instalovane PWA ukoncit okno bez popstate. Pokud se
     dokument skutecne opousti a editor ma zmeny, vyzadat potvrzeni
     prohlizece. Mobilni OS nemusi beforeunload dorucit pri hard killu. */
  window.addEventListener("beforeunload", (event) => {
    if (uzivatelPotvrdilOdchod || !editorMaZmeny()) return;
    event.preventDefault();
    event.returnValue = "";
  });

  window.addEventListener("pageshow", () => {
    if (!uzivatelPotvrdilOdchod) pripravZachytHistorie();
  });
  window.addEventListener("focus", pripravZachytHistorie);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") pripravZachytHistorie();
  });
  /* Jen jednou na zacatku dotyku, nikoli pri MOVE s caretem. */
  document.addEventListener("pointerdown", () => {
    if (history.state?.[klic] !== identita) pripravZachytHistorie();
  }, { capture: true, passive: true });
  pripravZachytHistorie();
})();
