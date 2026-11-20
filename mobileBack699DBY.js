/* 699D-BY – systémové Zpět pro mobilní Chrome a instalovanou PWA.
 * Android APK používá vlastní MainActivity a nesmí se měnit jeho Back cesta.
 * Historie webu poskytne jeden záchytný krok, aby Back nejprve zavřel editor
 * stejným bezpečným handlerem (včetně Uložit/Neukládat/Zrušit).
 */
(() => {
  "use strict";

  if (window.Capacitor?.isNativePlatform?.() === true ||
      !window.matchMedia?.("(max-width: 899px) and (pointer: coarse)")?.matches) {
    return;
  }

  const klic = "__lubanoteWebBack699DBY";
  const identita = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const puvodniCesta = window.location.pathname + window.location.search;
  let uzivatelPotvrdilOdchod = false;
  let potvrzeni = null;

  function pripravZachytHistorie() {
    if (window.history.state?.[klic] === identita) return true;
    try {
      window.history.pushState(
        { ...(window.history.state || {}), [klic]: identita },
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
      okno.id = "lnWebExitConfirm699DBY";

      const dialog = document.createElement("div");
      dialog.className = "appMessageDialog";
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("aria-labelledby", "lnWebExitTitle699DBY");

      const nadpis = document.createElement("h3");
      nadpis.id = "lnWebExitTitle699DBY";
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
        setTimeout(() => {
          if (!document.hidden) {
            try { window.history.back(); } catch (_) {}
          }
        }, 450);
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
    if (window.LubaNoteZpracujAndroidZpet?.() === true) return;
    ukazPotvrzeniUkonceni();
  });

  window.addEventListener("pageshow", () => {
    if (!uzivatelPotvrdilOdchod) pripravZachytHistorie();
  });
  pripravZachytHistorie();
})();
