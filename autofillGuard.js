/* ==================================================
   OCHRANA LUBANOTE PROTI CREDENTIAL AUTOFILLU
   --------------------------------------------------
   Chrome / password managery smějí pracovat s
   přihlašovacími údaji pouze na skutečné login page.
   Všechny ostatní textové vstupy dostávají signály,
   že nejde o username/password formulář.
================================================== */

(() => {
  const LOGIN_IDS = new Set([
    "loginEmail",
    "loginPassword"
  ]);

  function jeTextovePole(pole) {
    if (pole instanceof HTMLTextAreaElement) {
      return true;
    }

    if (!(pole instanceof HTMLInputElement)) {
      return false;
    }

    const typ = String(pole.type || "text").toLowerCase();

    return [
      "text",
      "search",
      "email",
      "url",
      "tel",
      "password"
    ].includes(typ);
  }

  function ochranPole(pole) {
    if (!jeTextovePole(pole)) {
      return;
    }

    if (LOGIN_IDS.has(pole.id)) {
      return;
    }

    pole.removeAttribute("name");
    pole.setAttribute("data-form-type", "other");
    pole.setAttribute("data-lpignore", "true");
    pole.setAttribute("data-1p-ignore", "true");
    pole.setAttribute("data-bwignore", "true");

    /*
     * U Secret hesla nechceme, aby Chrome použil
     * uložené heslo k LubaNote účtu. "new-password"
     * je pro password manager jasný signál, že nejde
     * o current-password webového loginu.
     */
    if (
      pole instanceof HTMLInputElement &&
      pole.type === "password"
    ) {
      pole.setAttribute("autocomplete", "new-password");
      return;
    }

    /*
     * one-time-code je záměrně silnější než "off".
     * Chrome umí autocomplete=off u credential autofillu
     * ignorovat, zatímco toto pole není klasifikováno
     * jako přihlašovací jméno.
     */
    pole.setAttribute("autocomplete", "one-time-code");
  }

  function ochranKontejner(koren = document) {
    if (koren instanceof Element) {
      ochranPole(koren);
    }

    koren
      .querySelectorAll?.("input, textarea")
      .forEach(ochranPole);
  }

  ochranKontejner(document);

  const observer = new MutationObserver((zmeny) => {
    zmeny.forEach((zmena) => {
      zmena.addedNodes.forEach((uzel) => {
        if (uzel instanceof Element) {
          ochranKontejner(uzel);
        }
      });
    });
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  window.LubaNoteAutofillGuard = {
    obnov: () => ochranKontejner(document)
  };
})();
