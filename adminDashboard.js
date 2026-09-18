/* ==================================================
   LubaNote – Admin Dashboard V2
   UI nikdy samo nerozhoduje o admin právech.
   Každé čtení i změnu znovu ověřuje SECURITY DEFINER RPC v Supabase.
================================================== */

(() => {
  const menuTlacitko =
    document.getElementById("adminDashboardButton");
  const desktopTlacitko =
    document.getElementById("desktopAdminDashboardButton");
  const modal =
    document.getElementById("adminDashboardModal");
  const zavritTlacitko =
    document.getElementById("closeAdminDashboardButton");
  const domov =
    document.getElementById("adminDashboardHome");
  const uctyPohled =
    document.getElementById("adminAccountsView");
  const uctyTlacitko =
    document.getElementById("adminAccountsToolButton");
  const visualDebugTlacitko =
    document.getElementById("adminVisualDebugToolButton");
  const debugHubTlacitko =
    document.getElementById("adminDebugHubToolButton");
  const zpetNaNastrojeTlacitko =
    document.getElementById("adminAccountsBackButton");
  const cekajiciTab =
    document.getElementById("adminPendingTab");
  const aktivniTab =
    document.getElementById("adminActiveTab");
  const ukonceneDemoTab =
    document.getElementById("adminExpiredTab");
  const vsichniTab =
    document.getElementById("adminAllTab");
  const obnovitTlacitko =
    document.getElementById("adminRefreshButton");
  const seznam =
    document.getElementById("adminUsersList");
  const stavText =
    document.getElementById("adminDashboardStatus");

  const cekajiciPocet =
    document.getElementById("adminPendingCount");
  const aktivniPocet =
    document.getElementById("adminActiveCount");
  const demoPocet =
    document.getElementById("adminDemoCount");
  const ukonceneDemoPocet =
    document.getElementById("adminExpiredDemoCount");

  if (
    !menuTlacitko ||
    !modal ||
    !zavritTlacitko ||
    !domov ||
    !uctyPohled ||
    !uctyTlacitko ||
    !visualDebugTlacitko ||
    !debugHubTlacitko ||
    !zpetNaNastrojeTlacitko ||
    !cekajiciTab ||
    !aktivniTab ||
    !ukonceneDemoTab ||
    !vsichniTab ||
    !ukonceneDemoPocet ||
    !seznam
  ) {
    return;
  }

  let jeAdmin = false;
  let startUiPripraven = false;
  let ucetAktivni = false;
  let uzivatele = [];
  let filtr = "pending";
  let nacitam = false;

  /*
   * Jediná klientská brána pro interní nástroje. Samotné admin oprávnění
   * stále určuje serverové RPC; Visual Debug ani Debug Hub se už neodemknou
   * tajným tapem nebo klávesovou zkratkou.
   */
  window.LubaNoteAdminTools = {
    isAllowed: () => jeAdmin === true
  };

  function tAdmin(klic, vychozi, parametry = {}) {
    return (
      window.LubaNoteI18n?.t?.(
        klic,
        vychozi,
        parametry
      ) || vychozi
    );
  }

  function bezpecnyText(hodnota) {
    return String(hodnota ?? "");
  }

  function locale() {
    return (
      window.LubaNoteI18n?.ziskejLocale?.() ||
      "cs-CZ"
    );
  }

  function formatDatum(hodnota) {
    if (!hodnota) {
      return "—";
    }

    const datum = new Date(hodnota);
    if (Number.isNaN(datum.getTime())) {
      return "—";
    }

    return new Intl.DateTimeFormat(
      locale(),
      {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }
    ).format(datum);
  }

  function jeUkonceneDemo(uzivatel) {
    if (
      uzivatel?.account_status !== "active" ||
      uzivatel?.plan_id !== "demo" ||
      !uzivatel?.demo_until
    ) {
      return false;
    }

    const konec = new Date(uzivatel.demo_until).getTime();
    return Number.isFinite(konec) && konec <= Date.now();
  }

  function jeAktivniUcet(uzivatel) {
    return (
      uzivatel?.account_status === "active" &&
      !jeUkonceneDemo(uzivatel)
    );
  }

  function zobrazDomov() {
    domov.hidden = false;
    uctyPohled.hidden = true;
  }

  function zobrazUcty() {
    domov.hidden = true;
    uctyPohled.hidden = false;
  }

  function nastavStav(text = "", chyba = false) {
    stavText.textContent = text;
    stavText.classList.toggle("error", Boolean(chyba));
  }

  function nastavViditelnostAdmina(hodnota) {
    jeAdmin = Boolean(hodnota);
    menuTlacitko.hidden = !jeAdmin;

    if (desktopTlacitko) {
      desktopTlacitko.hidden = !jeAdmin;
    }

    if (!jeAdmin) {
      modal.hidden = true;
      window.LubaNoteDebugHub?.stop?.();
      window.LubaNoteDebugHub?.close?.();
      window.LubaNoteVisualDebug?.lock?.();
    }
  }

  async function pripravClient() {
    if (!navigator.onLine) {
      return false;
    }

    if (
      typeof window.LubaNoteSupabase
        ?.pripravClient === "function"
    ) {
      return Boolean(
        await window.LubaNoteSupabase.pripravClient()
      );
    }

    return typeof supabaseClient !== "undefined" &&
      Boolean(supabaseClient);
  }

  async function overAdmina() {
    try {
      const pripraven = await pripravClient();

      if (!pripraven || !supabaseClient) {
        nastavViditelnostAdmina(false);
        return false;
      }

      const { data, error } = await supabaseClient.rpc(
        "lubanote_admin_is_current_user"
      );

      if (error) {
        throw error;
      }

      nastavViditelnostAdmina(data === true);
      return data === true;
    } catch (error) {
      console.warn(
        "Admin check skipped:",
        error?.message || error
      );
      nastavViditelnostAdmina(false);
      return false;
    }
  }

  function textStavu(stav) {
    const mapa = {
      pending: ["admin.status.pending", "Čeká"],
      active: ["admin.status.active", "Aktivní"],
      rejected: ["admin.status.rejected", "Zamítnut"],
      suspended: ["admin.status.suspended", "Pozastaven"]
    };

    const [klic, vychozi] =
      mapa[stav] || ["", bezpecnyText(stav || "—")];

    return klic ? tAdmin(klic, vychozi) : vychozi;
  }

  function textPlanu(plan) {
    const mapa = {
      demo: ["admin.plan.demo", "Demo"],
      full: ["admin.plan.full", "Full"],
      internal: ["admin.plan.internal", "Interní"]
    };

    const [klic, vychozi] =
      mapa[plan] || ["", bezpecnyText(plan || "—")];

    return klic ? tAdmin(klic, vychozi) : vychozi;
  }

  function vytvorRadekMeta(popisek, hodnota) {
    const radek = document.createElement("div");
    radek.className = "adminUserMetaRow";

    const label = document.createElement("span");
    label.textContent = popisek;

    const value = document.createElement("strong");
    value.textContent = hodnota;

    radek.append(label, value);
    return radek;
  }

  function vytvorBadge(text, trida = "") {
    const badge = document.createElement("span");
    badge.className = `adminBadge ${trida}`.trim();
    badge.textContent = text;
    return badge;
  }

  let adminPotvrzeniModal = null;
  let adminPotvrzeniAkce = null;

  function zajistiAdminPotvrzeniModal() {
    if (adminPotvrzeniModal) {
      return adminPotvrzeniModal;
    }

    const overlay = document.createElement("div");
    overlay.className = "choiceModal";
    overlay.hidden = true;

    const dialog = document.createElement("div");
    dialog.className = "choiceDialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");

    const hlavicka = document.createElement("div");
    hlavicka.className = "choiceDialogHeader";

    const nadpis = document.createElement("h3");
    nadpis.className = "choiceDialogTitle";
    nadpis.id = "adminConfirmTitle";
    dialog.setAttribute("aria-labelledby", nadpis.id);

    const zavrit = document.createElement("button");
    zavrit.type = "button";
    zavrit.className = "choiceDialogClose";
    zavrit.setAttribute("aria-label", "Zavřít");

    if (window.LubaNoteIcons?.nastavJenIkonu) {
      window.LubaNoteIcons.nastavJenIkonu(
        zavrit,
        "zavrit",
        ["choiceCloseSvgIcon"]
      );
    } else {
      zavrit.textContent = "×";
    }

    const zprava = document.createElement("p");
    zprava.className = "choiceDialogFieldLabel";
    zprava.style.margin = "0 0 18px";
    zprava.style.lineHeight = "1.45";
    zprava.style.overflowWrap = "anywhere";

    const akce = document.createElement("div");
    akce.className = "choiceDialogActions";

    const zrusit = document.createElement("button");
    zrusit.type = "button";
    zrusit.className = "choiceDialogSecondary";

    const potvrdit = document.createElement("button");
    potvrdit.type = "button";
    potvrdit.className = "choiceDialogSave";

    hlavicka.append(nadpis, zavrit);
    akce.append(zrusit, potvrdit);
    dialog.append(hlavicka, zprava, akce);
    overlay.append(dialog);
    document.body.append(overlay);

    function zavriPotvrzeni() {
      overlay.hidden = true;
      adminPotvrzeniAkce = null;
    }

    zavrit.addEventListener("click", zavriPotvrzeni);
    zrusit.addEventListener("click", zavriPotvrzeni);

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        zavriPotvrzeni();
      }
    });

    potvrdit.addEventListener("click", async () => {
      const provedAkci = adminPotvrzeniAkce;
      if (typeof provedAkci !== "function") {
        zavriPotvrzeni();
        return;
      }

      potvrdit.disabled = true;
      zrusit.disabled = true;

      try {
        zavriPotvrzeni();
        await provedAkci();
      } finally {
        potvrdit.disabled = false;
        zrusit.disabled = false;
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !overlay.hidden) {
        zavriPotvrzeni();
      }
    });

    adminPotvrzeniModal = {
      overlay,
      nadpis,
      zprava,
      zrusit,
      potvrdit
    };

    return adminPotvrzeniModal;
  }

  function otevriAdminPotvrzeni({
    nadpis,
    zprava,
    potvrditText,
    nebezpecne = false,
    poPotvrzeni
  }) {
    const prvky = zajistiAdminPotvrzeniModal();

    prvky.nadpis.textContent = nadpis;
    prvky.zprava.textContent = zprava;
    prvky.zrusit.textContent = tAdmin(
      "actions.cancel",
      "Zrušit"
    );
    prvky.potvrdit.textContent = potvrditText;

    prvky.potvrdit.className = nebezpecne
      ? "choiceDialogSecondary adminRejectButton"
      : "choiceDialogSave";

    adminPotvrzeniAkce = poPotvrzeni;
    prvky.overlay.hidden = false;

    requestAnimationFrame(() => {
      prvky.potvrdit.focus();
    });
  }

  async function schvalDemo(uzivatel) {
    const email = bezpecnyText(uzivatel.email || "—");
    const dotaz = tAdmin(
      "admin.approveConfirm",
      `Schválit účet ${email} jako Demo?`,
      { email }
    );

    otevriAdminPotvrzeni({
      nadpis: tAdmin(
        "admin.approveDemo",
        "Schválit Demo"
      ),
      zprava: dotaz,
      potvrditText: tAdmin(
        "admin.approveDemo",
        "Schválit Demo"
      ),
      poPotvrzeni: async () => {
        nastavStav(
          tAdmin("admin.approving", "Schvaluji účet…")
        );

        try {
      const { error } = await supabaseClient.rpc(
        "lubanote_admin_approve_demo",
        { p_user_id: uzivatel.user_id }
      );

      if (error) {
        throw error;
      }

      await nactiUzivatele();
      nastavStav(
        tAdmin(
          "admin.approved",
          "Účet byl schválen jako Demo."
        )
      );
        } catch (error) {
          console.error("Admin approve failed:", error);
          nastavStav(
            tAdmin(
              "admin.actionFailed",
              "Akci se nepodařilo dokončit."
            ),
            true
          );
        }
      }
    });
  }

  async function zamitniUzivatele(uzivatel) {
    const email = bezpecnyText(uzivatel.email || "—");
    const dotaz = tAdmin(
      "admin.rejectConfirm",
      `Opravdu zamítnout registraci ${email}?`,
      { email }
    );

    otevriAdminPotvrzeni({
      nadpis: tAdmin(
        "admin.reject",
        "Zamítnout"
      ),
      zprava: dotaz,
      potvrditText: tAdmin(
        "admin.reject",
        "Zamítnout"
      ),
      nebezpecne: true,
      poPotvrzeni: async () => {
        nastavStav(
          tAdmin("admin.rejecting", "Zamítám registraci…")
        );

        try {
      const { error } = await supabaseClient.rpc(
        "lubanote_admin_reject_user",
        { p_user_id: uzivatel.user_id }
      );

      if (error) {
        throw error;
      }

      await nactiUzivatele();
      nastavStav(
        tAdmin(
          "admin.rejected",
          "Registrace byla zamítnuta."
        )
      );
        } catch (error) {
          console.error("Admin reject failed:", error);
          nastavStav(
            tAdmin(
              "admin.actionFailed",
              "Akci se nepodařilo dokončit."
            ),
            true
          );
        }
      }
    });
  }

  async function smazUzivatele(uzivatel) {
    const email = bezpecnyText(uzivatel.email || "—");

    otevriAdminPotvrzeni({
      nadpis: tAdmin(
        "admin.deleteUser",
        "Smazat účet"
      ),
      zprava: tAdmin(
        "admin.deleteUserConfirm",
        `Opravdu trvale smazat účet ${email}? Tuto akci nelze vrátit zpět.`,
        { email }
      ),
      potvrditText: tAdmin(
        "admin.deleteUser",
        "Smazat účet"
      ),
      nebezpecne: true,
      poPotvrzeni: async () => {
        nastavStav(
          tAdmin("admin.deletingUser", "Mažu účet…")
        );

        try {
          const { error } = await supabaseClient.rpc(
            "lubanote_admin_delete_user",
            { p_user_id: uzivatel.user_id }
          );

          if (error) {
            const zprava = String(error?.message || "");

            if (zprava.includes("USER_HAS_STORAGE_OBJECTS")) {
              nastavStav(
                tAdmin(
                  "admin.deleteUserHasStorage",
                  "Účet má ještě soubory ve Storage. Nejdřív je potřeba bezpečně odstranit přílohy."
                ),
                true
              );
              return;
            }

            if (
              zprava.includes("ADMIN_ACCOUNT_DELETE_FORBIDDEN") ||
              zprava.includes("CANNOT_DELETE_SELF")
            ) {
              nastavStav(
                tAdmin(
                  "admin.deleteUserForbidden",
                  "Tento účet nelze z Admin Dashboardu smazat."
                ),
                true
              );
              return;
            }

            throw error;
          }

          await nactiUzivatele();
          nastavStav(
            tAdmin(
              "admin.userDeleted",
              "Účet byl trvale smazán."
            )
          );
        } catch (error) {
          console.error("Admin delete user failed:", error);
          nastavStav(
            tAdmin(
              "admin.actionFailed",
              "Akci se nepodařilo dokončit."
            ),
            true
          );
        }
      }
    });
  }

  function vykresliUzivatele() {
    seznam.replaceChildren();

    let zobrazovani = uzivatele;

    if (filtr === "pending") {
      zobrazovani = uzivatele.filter(
        (u) => u.account_status === "pending"
      );
    } else if (filtr === "active") {
      zobrazovani = uzivatele.filter(jeAktivniUcet);
    } else if (filtr === "expired") {
      zobrazovani = uzivatele.filter(jeUkonceneDemo);
    }

    if (!zobrazovani.length) {
      const prazdne = document.createElement("div");
      prazdne.className = "adminEmptyState";

      const zpravy = {
        pending: tAdmin(
          "admin.noPending",
          "Žádné registrace nečekají na schválení."
        ),
        active: tAdmin(
          "admin.noActive",
          "Nejsou zde žádné aktivní účty."
        ),
        expired: tAdmin(
          "admin.noExpiredDemo",
          "Nejsou zde žádná ukončená Dema."
        ),
        all: tAdmin(
          "admin.noUsers",
          "Zatím nejsou žádní uživatelé."
        )
      };

      prazdne.textContent = zpravy[filtr] || zpravy.all;
      seznam.append(prazdne);
      return;
    }

    for (const uzivatel of zobrazovani) {
      const karta = document.createElement("article");
      karta.className = "adminUserCard";

      const top = document.createElement("div");
      top.className = "adminUserTop";

      const identita = document.createElement("div");
      identita.className = "adminUserIdentity";

      const email = document.createElement("span");
      email.className = "adminUserEmail";
      email.textContent = bezpecnyText(
        uzivatel.email || "—"
      );

      const registrace = document.createElement("span");
      registrace.className = "adminUserRegistered";
      registrace.textContent = `${tAdmin(
        "admin.registered",
        "Registrace"
      )}: ${formatDatum(uzivatel.registered_at)}`;

      identita.append(email, registrace);

      const badges = document.createElement("div");
      badges.className = "adminUserBadges";

      if (jeUkonceneDemo(uzivatel)) {
        badges.append(
          vytvorBadge(
            tAdmin("admin.demoExpired", "Demo skončilo"),
            "expired"
          )
        );
      } else {
        badges.append(
          vytvorBadge(
            textStavu(uzivatel.account_status),
            bezpecnyText(uzivatel.account_status)
          )
        );
      }

      if (uzivatel.plan_id) {
        badges.append(
          vytvorBadge(
            textPlanu(uzivatel.plan_id),
            bezpecnyText(uzivatel.plan_id)
          )
        );
      }

      top.append(identita, badges);
      karta.append(top);

      const meta = document.createElement("div");
      meta.className = "adminUserMeta";
      meta.append(
        vytvorRadekMeta(
          tAdmin("admin.email", "E-mail"),
          uzivatel.email_confirmed_at
            ? tAdmin("admin.emailConfirmed", "potvrzen")
            : tAdmin("admin.emailUnconfirmed", "nepotvrzen")
        ),
        vytvorRadekMeta(
          tAdmin("admin.plan", "Plán"),
          textPlanu(uzivatel.plan_id)
        )
      );

      if (uzivatel.demo_until) {
        meta.append(
          vytvorRadekMeta(
            tAdmin("admin.demoUntil", "Demo do"),
            formatDatum(uzivatel.demo_until)
          )
        );
      }

      karta.append(meta);

      if (uzivatel.account_status === "pending") {
        const akce = document.createElement("div");
        akce.className = "adminUserActions";

        const schvalit = document.createElement("button");
        schvalit.type = "button";
        schvalit.className = "adminApproveButton";
        schvalit.textContent = tAdmin(
          "admin.approveDemo",
          "Schválit Demo"
        );
        schvalit.disabled = !uzivatel.email_confirmed_at;
        schvalit.addEventListener(
          "click",
          () => schvalDemo(uzivatel)
        );

        const zamitnout = document.createElement("button");
        zamitnout.type = "button";
        zamitnout.className = "adminRejectButton";
        zamitnout.textContent = tAdmin(
          "admin.reject",
          "Zamítnout"
        );
        zamitnout.addEventListener(
          "click",
          () => zamitniUzivatele(uzivatel)
        );

        akce.append(schvalit, zamitnout);
        karta.append(akce);
      }

      /*
       * Trvalé smazání je záměrně dostupné jen v přehledu Všichni.
       * INTERNAL účet tlačítko vůbec nedostane a server navíc vždy
       * znovu ověří, že cílový účet není admin ani aktuální uživatel.
       */
      if (
        filtr === "all" &&
        uzivatel.plan_id !== "internal"
      ) {
        const mazaciAkce = document.createElement("div");
        mazaciAkce.className = "adminUserActions";

        const smazat = document.createElement("button");
        smazat.type = "button";
        smazat.className = "adminRejectButton";
        smazat.textContent = tAdmin(
          "admin.deleteUser",
          "Smazat účet"
        );
        smazat.addEventListener(
          "click",
          () => smazUzivatele(uzivatel)
        );

        mazaciAkce.append(smazat);
        karta.append(mazaciAkce);
      }

      seznam.append(karta);
    }
  }

  function aktualizujStatistiky() {
    cekajiciPocet.textContent = String(
      uzivatele.filter(
        (u) => u.account_status === "pending"
      ).length
    );

    aktivniPocet.textContent = String(
      uzivatele.filter(jeAktivniUcet).length
    );

    demoPocet.textContent = String(
      uzivatele.filter(
        (u) => jeAktivniUcet(u) && u.plan_id === "demo"
      ).length
    );

    ukonceneDemoPocet.textContent = String(
      uzivatele.filter(jeUkonceneDemo).length
    );
  }

  async function nactiUzivatele() {
    if (nacitam || !jeAdmin) {
      return;
    }

    if (!navigator.onLine) {
      nastavStav(
        tAdmin(
          "admin.offline",
          "Admin Dashboard vyžaduje připojení k internetu."
        ),
        true
      );
      return;
    }

    nacitam = true;
    obnovitTlacitko.disabled = true;
    nastavStav(
      tAdmin("admin.loading", "Načítám uživatele…")
    );

    try {
      const pripraven = await pripravClient();
      if (!pripraven || !supabaseClient) {
        throw new Error("Supabase unavailable");
      }

      const { data, error } = await supabaseClient.rpc(
        "lubanote_admin_list_users",
        { p_status: null }
      );

      if (error) {
        throw error;
      }

      uzivatele = Array.isArray(data) ? data : [];
      aktualizujStatistiky();
      vykresliUzivatele();
      nastavStav("");
    } catch (error) {
      console.error("Admin users load failed:", error);
      nastavStav(
        tAdmin(
          "admin.loadFailed",
          "Uživatele se nepodařilo načíst."
        ),
        true
      );
    } finally {
      nacitam = false;
      obnovitTlacitko.disabled = false;
    }
  }

  function nastavFiltr(novyFiltr) {
    const povolene = new Set([
      "pending",
      "active",
      "expired",
      "all"
    ]);

    filtr = povolene.has(novyFiltr)
      ? novyFiltr
      : "pending";

    const taby = [
      [cekajiciTab, "pending"],
      [aktivniTab, "active"],
      [ukonceneDemoTab, "expired"],
      [vsichniTab, "all"]
    ];

    for (const [tlacitko, hodnota] of taby) {
      const aktivni = filtr === hodnota;
      tlacitko.classList.toggle("active", aktivni);
      tlacitko.setAttribute("aria-selected", String(aktivni));
    }

    vykresliUzivatele();
  }

  function aktualizujTexty() {
    const title = document.getElementById("adminDashboardTitle");
    const menuLabel = menuTlacitko.querySelector(".mainMenuLabel");
    const desktopLabel = desktopTlacitko?.querySelector("span:last-child");

    const nazev = tAdmin(
      "admin.title",
      "Admin Dashboard"
    );

    if (title) title.textContent = nazev;
    if (menuLabel) menuLabel.textContent = nazev;
    if (desktopLabel) desktopLabel.textContent = nazev;

    const texty = {
      adminDashboardIntro: [
        "admin.toolsIntro",
        "Správa účtů a interní nástroje LubaNote."
      ],
      adminAccountsToolTitle: ["admin.accountsTool", "Účty"],
      adminAccountsToolDescription: [
        "admin.accountsToolDescription",
        "Registrace, Demo a správa uživatelů"
      ],
      adminVisualDebugToolDescription: [
        "admin.visualDebugDescription",
        "Vizuální ladění prvků aplikace"
      ],
      adminDebugHubToolDescription: [
        "admin.debugHubDescription",
        "Diagnostika, logy a testovací moduly"
      ],
      adminAccountsHeading: ["admin.accountsHeading", "Správa účtů"]
    };

    for (const [id, [klic, vychozi]] of Object.entries(texty)) {
      const prvek = document.getElementById(id);
      if (prvek) prvek.textContent = tAdmin(klic, vychozi);
    }

    zpetNaNastrojeTlacitko.textContent = `‹ ${tAdmin(
      "admin.toolsBack",
      "Nástroje"
    )}`;

    document.getElementById("adminPendingLabel").textContent =
      tAdmin("admin.pending", "Čeká");
    document.getElementById("adminActiveLabel").textContent =
      tAdmin("admin.active", "Aktivní");
    document.getElementById("adminDemoLabel").textContent =
      tAdmin("admin.demoActive", "Demo aktivní");
    document.getElementById("adminExpiredDemoLabel").textContent =
      tAdmin("admin.demoExpired", "Demo skončilo");

    cekajiciTab.textContent =
      tAdmin("admin.pendingTab", "Čekající");
    aktivniTab.textContent =
      tAdmin("admin.activeTab", "Aktivní");
    ukonceneDemoTab.textContent =
      tAdmin("admin.expiredTab", "Demo skončilo");
    vsichniTab.textContent =
      tAdmin("admin.allTab", "Všichni");

    obnovitTlacitko.setAttribute(
      "aria-label",
      tAdmin("admin.refresh", "Obnovit uživatele")
    );

    zavritTlacitko.setAttribute(
      "aria-label",
      tAdmin(
        "admin.close",
        "Zavřít Admin Dashboard"
      )
    );

    if (!modal.hidden && !uctyPohled.hidden) {
      vykresliUzivatele();
    }
  }

  async function otevriDashboard() {
    if (!jeAdmin) {
      return;
    }

    const hlavniMenu =
      document.getElementById("mainMenu");
    const hlavniMenuButton =
      document.getElementById("mainMenuButton");

    if (hlavniMenu) {
      hlavniMenu.hidden = true;
    }
    hlavniMenuButton?.setAttribute(
      "aria-expanded",
      "false"
    );

    modal.hidden = false;
    zobrazDomov();
  }

  function zavriDashboard() {
    modal.hidden = true;
    zobrazDomov();
  }

  async function otevriUcty() {
    if (!jeAdmin) return;
    zobrazUcty();
    nastavFiltr("pending");
    await nactiUzivatele();
  }

  function otevriVisualDebugZAdmina() {
    if (!jeAdmin) return;
    zavriDashboard();
    window.LubaNoteVisualDebug?.open?.();
  }

  function otevriDebugHubZAdmina() {
    if (!jeAdmin) return;
    zavriDashboard();
    window.LubaNoteVisualDebug?.showDock?.();
    window.LubaNoteDebugHub?.open?.();
  }

  menuTlacitko.addEventListener(
    "click",
    otevriDashboard
  );

  desktopTlacitko?.addEventListener(
    "click",
    otevriDashboard
  );

  zavritTlacitko.addEventListener(
    "click",
    zavriDashboard
  );

  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      zavriDashboard();
    }
  });

  uctyTlacitko.addEventListener("click", otevriUcty);
  visualDebugTlacitko.addEventListener(
    "click",
    otevriVisualDebugZAdmina
  );
  debugHubTlacitko.addEventListener(
    "click",
    otevriDebugHubZAdmina
  );
  zpetNaNastrojeTlacitko.addEventListener(
    "click",
    zobrazDomov
  );

  cekajiciTab.addEventListener(
    "click",
    () => nastavFiltr("pending")
  );

  aktivniTab.addEventListener(
    "click",
    () => nastavFiltr("active")
  );

  ukonceneDemoTab.addEventListener(
    "click",
    () => nastavFiltr("expired")
  );

  vsichniTab.addEventListener(
    "click",
    () => nastavFiltr("all")
  );

  obnovitTlacitko.addEventListener(
    "click",
    nactiUzivatele
  );

  window.addEventListener(
    "lubanote:language-change",
    aktualizujTexty
  );

  window.addEventListener("online", () => {
    if (startUiPripraven && ucetAktivni) {
      overAdmina();
    }
  });

  window.addEventListener(
    "lubanote:account-active",
    () => {
      ucetAktivni = true;
      if (startUiPripraven) {
        overAdmina();
      }
    }
  );

  window.addEventListener(
    "lubanote:splash-ready",
    () => {
      if (startUiPripraven) return;
      startUiPripraven = true;

      if (navigator.onLine && ucetAktivni) {
        overAdmina();
      }
    }
  );

  window.addEventListener(
    "lubanote:auth-expired",
    () => {
      ucetAktivni = false;
      nastavViditelnostAdmina(false);
    }
  );

  aktualizujTexty();

  /*
   * Při startu se admin RPC nespouští před hlavním syncem.
   * Kontrola proběhne po splash-ready; při pozdější změně účtu
   * nebo návratu internetu se zachová původní chování.
   */
})();
