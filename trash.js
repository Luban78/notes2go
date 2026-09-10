/* ==================================================
   LubaNote – KOŠ
   --------------------------------------------------
   - běžný Koš je úplně oddělený od Secret Koše
   - Secret názvy/obsah se do běžného UI nikdy nevypisují
   - při odemčeném Secret režimu jsou filtry Normální / Tajné
   - hromadný výběr vždy pracuje jen s právě zobrazeným Košem
   - přesun do Koše se synchronizuje jako stav poznámky
   - trvalé smazání vytvoří serverový tombstone
   - položky starší 30 dnů se smažou při nejbližší dostupné kontrole
================================================== */

(() => {
  const trashButton =
    document.getElementById("trashFilterButton");
  const trashScreen =
    document.getElementById("trashScreen");
  const trashBackButton =
    document.getElementById("trashBackButton");
  const trashTitle =
    document.getElementById("trashTitle");
  const trashInfo =
    document.getElementById("trashInfo");
  const trashModeTabs =
    document.getElementById("trashModeTabs");
  const trashNormalTab =
    document.getElementById("trashNormalTab");
  const trashSecretTab =
    document.getElementById("trashSecretTab");
  const trashBulkBar =
    document.getElementById("trashBulkBar");
  const trashSelectAllButton =
    document.getElementById("trashSelectAllButton");
  const trashBulkDeleteButton =
    document.getElementById("trashBulkDeleteButton");
  const trashBulkDeleteText =
    document.getElementById("trashBulkDeleteText");
  const trashList =
    document.getElementById("trashList");
  const trashEmpty =
    document.getElementById("trashEmpty");
  const trashConfirmModal =
    document.getElementById("trashConfirmModal");
  const trashConfirmText =
    document.getElementById("trashConfirmText");
  const trashConfirmCancel =
    document.getElementById("trashConfirmCancel");
  const trashConfirmDelete =
    document.getElementById("trashConfirmDelete");
  const trashConfirmDeleteText =
    document.getElementById("trashConfirmDeleteText");

  let zobrazenTajnyKos = false;
  let aktualniPoznamkyVKosi = [];
  let vybranaId = new Set();
  let idProTrvaleSmazani = [];
  let potvrzujeHromadneSmazani = false;

  function t(klic, zaloha, hodnoty = {}) {
    return window.LubaNoteI18n?.t?.(
      klic,
      zaloha,
      hodnoty
    ) || zaloha;
  }

  function jeTajnyRezimOdemceny() {
    return Boolean(
      typeof tajnyRezimOdemceny !== "undefined" &&
      tajnyRezimOdemceny === true
    );
  }

  function odstranHtml(html) {
    const div = document.createElement("div");
    div.innerHTML = String(html || "");
    return (div.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function ziskejNahled(task) {
    const text = String(task?.note || "").trim();

    if (text) {
      return text;
    }

    const rich = odstranHtml(task?.richContent);

    if (rich) {
      return rich;
    }

    const todo = Array.isArray(task?.todos)
      ? task.todos
          .map((polozka) => poloZkaText(polozka))
          .filter(Boolean)
          .join(" · ")
      : "";

    return todo;
  }

  function poloZkaText(polozka) {
    return String(polozka?.text || "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function formatDatum(hodnota) {
    const datum = new Date(hodnota || 0);

    if (Number.isNaN(datum.getTime())) {
      return "";
    }

    const locale =
      window.LubaNoteI18n?.ziskejLocale?.() ||
      "cs-CZ";

    return datum.toLocaleString(locale, {
      day: "numeric",
      month: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function zbyvaDni(task) {
    const cas = new Date(task?.trashedAt || 0).getTime();

    if (!Number.isFinite(cas) || cas <= 0) {
      return 30;
    }

    const konec = cas + 30 * 24 * 60 * 60 * 1000;
    return Math.max(
      0,
      Math.ceil((konec - Date.now()) / (24 * 60 * 60 * 1000))
    );
  }

  function obnovIkonyVKontejneru(kontejner) {
    if (!kontejner) {
      return;
    }

    window.LubaNoteIcons
      ?.naplnDeklarovaneIkony?.(kontejner);
  }

  function vytvorAkcniTlacitko(ikona, text, trida) {
    const tlacitko = document.createElement("button");
    tlacitko.type = "button";
    tlacitko.className = `trashCardAction ${trida}`;

    const ikonaSpan = document.createElement("span");
    ikonaSpan.className = "lubaActionIcon";
    ikonaSpan.dataset.lubaIcon = ikona;
    ikonaSpan.setAttribute("aria-hidden", "true");

    const textSpan = document.createElement("span");
    textSpan.textContent = text;

    tlacitko.append(ikonaSpan, textSpan);
    return tlacitko;
  }

  function vytvorKartu(task) {
    const karta = document.createElement("article");
    karta.className = "trashCard";
    karta.dataset.noteId = task.id || "";

    if (vybranaId.has(task.id)) {
      karta.classList.add("trashCardSelected");
    }

    const hlavicka = document.createElement("div");
    hlavicka.className = "trashCardHeader";

    const nazev = document.createElement("h3");
    nazev.textContent =
      String(task?.title || "").trim() ||
      t("trash.untitled", "Bez názvu");

    hlavicka.append(nazev);

    const nahled = document.createElement("p");
    nahled.className = "trashCardPreview";
    nahled.textContent =
      ziskejNahled(task) ||
      t("trash.noPreview", "Bez náhledu");

    const meta = document.createElement("div");
    meta.className = "trashCardMeta";

    const smazano = document.createElement("span");
    smazano.textContent = `${t(
      "trash.moved",
      "V koši od"
    )}: ${formatDatum(task.trashedAt)}`;

    const zbyva = document.createElement("span");
    zbyva.textContent = t(
      "trash.daysLeft",
      "Automatické smazání za {count} dní",
      { count: zbyvaDni(task) }
    );

    meta.append(smazano, zbyva);

    const akce = document.createElement("div");
    akce.className = "trashCardActions";

    const obnovit = vytvorAkcniTlacitko(
      "obnovit",
      t("trash.restore", "Obnovit"),
      "trashRestoreButton"
    );

    const trvaleSmazat = vytvorAkcniTlacitko(
      "smazat",
      t("trash.deleteForever", "Smazat trvale"),
      "trashDeleteForeverButton"
    );

    obnovit.addEventListener("click", async () => {
      obnovit.disabled = true;
      trvaleSmazat.disabled = true;

      const uspesne =
        await obnovPoznamkuZKose(
          task.id,
          zobrazenTajnyKos
        );

      if (uspesne) {
        vybranaId.delete(task.id);

        /*
         * obnovPoznamkuZKose() už změnu předala centrální sync frontě.
         * Nespouštíme zde druhý okamžitý sync nad stejnou obnovou.
         */
        await poZmeneKose({ synchronizovat: false });
      } else {
        obnovit.disabled = false;
        trvaleSmazat.disabled = false;
      }
    });

    trvaleSmazat.addEventListener("click", () => {
      otevriPotvrzeniTrvalehoSmazani([task.id], false);
    });

    akce.append(obnovit, trvaleSmazat);
    karta.append(hlavicka, nahled, meta, akce);

    obnovIkonyVKontejneru(karta);
    return karta;
  }

  function vycistiNeplatnyVyber() {
    const aktualniId = new Set(
      aktualniPoznamkyVKosi
        .map((task) => task?.id)
        .filter(Boolean)
    );

    vybranaId = new Set(
      Array.from(vybranaId)
        .filter((id) => aktualniId.has(id))
    );
  }

  function jsouVybraneVsechny() {
    return (
      aktualniPoznamkyVKosi.length > 0 &&
      vybranaId.size === aktualniPoznamkyVKosi.length
    );
  }

  function aktualizujVyberVKartach() {
    trashList?.querySelectorAll(".trashCard")
      .forEach((karta) => {
        karta.classList.toggle(
          "trashCardSelected",
          vybranaId.has(karta.dataset.noteId)
        );
      });
  }

  function nastavHromadneOvladani() {
    if (!trashBulkBar) {
      return;
    }

    const maPolozky = aktualniPoznamkyVKosi.length > 0;
    trashBulkBar.hidden = !maPolozky;

    if (!maPolozky) {
      vybranaId.clear();
    }

    const vseVybrane = jsouVybraneVsechny();

    if (trashSelectAllButton) {
      trashSelectAllButton.textContent = vseVybrane
        ? t("trash.clearSelection", "Zrušit označení")
        : t("trash.selectAll", "Označit vše");
    }

    if (trashBulkDeleteButton) {
      trashBulkDeleteButton.disabled = vybranaId.size === 0;
    }

    if (trashBulkDeleteText) {
      trashBulkDeleteText.textContent = t(
        "trash.deleteSelected",
        "Trvale smazat ({count})",
        { count: vybranaId.size }
      );
    }
  }

  function nastavFiltryKose() {
    const secretOdemceny = jeTajnyRezimOdemceny();

    if (trashModeTabs) {
      trashModeTabs.hidden = !secretOdemceny;
      trashModeTabs.setAttribute(
        "aria-label",
        t("trash.typeTabsLabel", "Typ koše")
      );
    }

    if (trashNormalTab) {
      trashNormalTab.textContent = t(
        "trash.normalTab",
        "Normální"
      );
      trashNormalTab.classList.toggle(
        "active",
        !zobrazenTajnyKos
      );
      trashNormalTab.setAttribute(
        "aria-selected",
        String(!zobrazenTajnyKos)
      );
    }

    if (trashSecretTab) {
      trashSecretTab.textContent = t(
        "trash.secretTab",
        "Tajné 🔒"
      );
      trashSecretTab.classList.toggle(
        "active",
        zobrazenTajnyKos
      );
      trashSecretTab.setAttribute(
        "aria-selected",
        String(zobrazenTajnyKos)
      );
    }

    if (trashScreen) {
      trashScreen.dataset.secret = String(zobrazenTajnyKos);
    }
  }

  function nastavTextyKose() {
    if (!trashTitle || !trashInfo) {
      return;
    }

    trashTitle.textContent = zobrazenTajnyKos
      ? t("trash.secretTitle", "Tajný koš")
      : t("trash.title", "Koš");

    trashInfo.textContent = t(
      "trash.autoDeleteInfo",
      "Poznámky se po 30 dnech automaticky smažou trvale."
    );

    trashBackButton?.setAttribute(
      "aria-label",
      t("trash.close", "Zavřít Koš")
    );

    if (trashConfirmDeleteText) {
      trashConfirmDeleteText.textContent = t(
        "trash.deleteForever",
        "Smazat trvale"
      );
    }
  }

  async function renderKos() {
    if (!trashList || !trashEmpty) {
      return;
    }

    if (
      zobrazenTajnyKos &&
      !jeTajnyRezimOdemceny()
    ) {
      zavriKos();
      return;
    }

    await uklidPoznamkyVKosiPo30Dnech();

    aktualniPoznamkyVKosi = nactiPoznamkyVKosi({
      tajne: zobrazenTajnyKos
    }).sort((a, b) =>
      new Date(b?.trashedAt || 0).getTime() -
      new Date(a?.trashedAt || 0).getTime()
    );

    vycistiNeplatnyVyber();

    trashList.innerHTML = "";
    trashEmpty.hidden = aktualniPoznamkyVKosi.length !== 0;
    trashEmpty.textContent = t(
      "trash.empty",
      "Koš je prázdný."
    );

    aktualniPoznamkyVKosi.forEach((task) => {
      trashList.append(vytvorKartu(task));
    });

    nastavFiltryKose();
    nastavHromadneOvladani();
    nastavTextyKose();
    obnovIkonyVKontejneru(trashBulkBar);
  }

  async function poZmeneKose({ synchronizovat = true } = {}) {
    await renderKos();

    if (typeof renderTasks === "function") {
      renderTasks();
    }

    if (typeof renderCalendar === "function") {
      renderCalendar();
    }

    if (typeof renderRemindersScreen === "function") {
      renderRemindersScreen();
    }

    if (
      synchronizovat &&
      navigator.onLine &&
      typeof window.LubaNoteSync?.spustRychle === "function"
    ) {
      window.LubaNoteSync.spustRychle();
    }
  }

  async function prepniKos(tajne) {
    if (tajne && !jeTajnyRezimOdemceny()) {
      return;
    }

    if (zobrazenTajnyKos === tajne) {
      return;
    }

    zobrazenTajnyKos = tajne;
    vybranaId.clear();
    idProTrvaleSmazani = [];
    potvrzujeHromadneSmazani = false;

    if (trashConfirmModal) {
      trashConfirmModal.hidden = true;
    }

    await renderKos();
  }

  async function otevriKos() {
    if (!trashScreen) {
      return;
    }

    /* Po odemknutí Secret režimu je výchozí právě Tajný koš. */
    zobrazenTajnyKos = jeTajnyRezimOdemceny();
    vybranaId.clear();
    trashScreen.hidden = false;
    trashScreen.dataset.secret = String(zobrazenTajnyKos);
    document.body.classList.add("trashScreenOpen");

    await renderKos();
  }

  function zavriKos() {
    if (!trashScreen) {
      return;
    }

    trashScreen.hidden = true;
    trashScreen.removeAttribute("data-secret");
    document.body.classList.remove("trashScreenOpen");
    trashList.innerHTML = "";
    aktualniPoznamkyVKosi = [];
    vybranaId.clear();
    zobrazenTajnyKos = false;
    idProTrvaleSmazani = [];
    potvrzujeHromadneSmazani = false;

    if (trashConfirmModal) {
      trashConfirmModal.hidden = true;
    }
  }

  function otevriPotvrzeniTrvalehoSmazani(
    ids,
    hromadne
  ) {
    const bezpecnaId = (Array.isArray(ids) ? ids : [])
      .filter(Boolean);

    if (bezpecnaId.length === 0) {
      return;
    }

    idProTrvaleSmazani = bezpecnaId;
    potvrzujeHromadneSmazani = Boolean(hromadne);

    if (potvrzujeHromadneSmazani) {
      trashConfirmText.textContent = zobrazenTajnyKos
        ? t(
            "trash.deleteManySecretConfirm",
            "Opravdu chceš trvale smazat {count} položek z tajného koše? Tuto akci nepůjde vrátit.",
            { count: bezpecnaId.length }
          )
        : t(
            "trash.deleteManyNormalConfirm",
            "Opravdu chceš trvale smazat {count} položek z normálního koše? Tuto akci nepůjde vrátit.",
            { count: bezpecnaId.length }
          );
    } else {
      trashConfirmText.textContent = t(
        "trash.deleteConfirm",
        "Tato poznámka bude smazána trvale a nepůjde obnovit."
      );
    }

    trashConfirmModal.hidden = false;
  }

  trashButton?.addEventListener("click", () => {
    otevriKos();
  });

  trashBackButton?.addEventListener("click", zavriKos);

  trashNormalTab?.addEventListener("click", () => {
    prepniKos(false);
  });

  trashSecretTab?.addEventListener("click", () => {
    prepniKos(true);
  });

  trashSelectAllButton?.addEventListener("click", () => {
    if (jsouVybraneVsechny()) {
      vybranaId.clear();
    } else {
      vybranaId = new Set(
        aktualniPoznamkyVKosi
          .map((task) => task?.id)
          .filter(Boolean)
      );
    }

    aktualizujVyberVKartach();
    nastavHromadneOvladani();
  });

  trashBulkDeleteButton?.addEventListener("click", () => {
    if (vybranaId.size === 0) {
      return;
    }

    otevriPotvrzeniTrvalehoSmazani(
      Array.from(vybranaId),
      true
    );
  });

  trashConfirmCancel?.addEventListener("click", () => {
    idProTrvaleSmazani = [];
    potvrzujeHromadneSmazani = false;
    trashConfirmModal.hidden = true;
  });

  trashConfirmDelete?.addEventListener("click", async () => {
    if (idProTrvaleSmazani.length === 0) {
      return;
    }

    const ids = [...idProTrvaleSmazani];
    const hromadne = potvrzujeHromadneSmazani;
    idProTrvaleSmazani = [];
    potvrzujeHromadneSmazani = false;
    trashConfirmDelete.disabled = true;

    try {
      let uspesne = false;

      if (hromadne) {
        const vysledek =
          await smazPoznamkyZKoseTrvale(
            ids,
            zobrazenTajnyKos
          );

        uspesne = Boolean(
          vysledek?.lokalneUlozeno &&
          vysledek?.pocet > 0
        );
      } else {
        uspesne = await smazPoznamkuZKoseTrvale(
          ids[0],
          zobrazenTajnyKos
        );
      }

      if (uspesne) {
        vybranaId.clear();
        trashConfirmModal.hidden = true;
        await poZmeneKose();
      }
    } finally {
      trashConfirmDelete.disabled = false;
    }
  });

  window.addEventListener(
    "lubanote:language-change",
    () => {
      if (!trashScreen?.hidden) {
        renderKos();
      }
    }
  );

  window.addEventListener(
    "lubanote:icon-style-change",
    () => {
      obnovIkonyVKontejneru(trashScreen);
    }
  );

  window.addEventListener(
    "lubanote:sync-state",
    (event) => {
      if (
        !trashScreen?.hidden &&
        event?.detail?.stav === "synced"
      ) {
        renderKos();
      }
    }
  );

  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      !trashScreen?.hidden
    ) {
      if (!trashConfirmModal?.hidden) {
        idProTrvaleSmazani = [];
        potvrzujeHromadneSmazani = false;
        trashConfirmModal.hidden = true;
        return;
      }

      zavriKos();
    }
  });

  /* Běžný Koš lze bezpečně vyčistit i bez otevření obrazovky. */
  setTimeout(() => {
    uklidPoznamkyVKosiPo30Dnech().catch((error) => {
      console.warn("Automatický úklid Koše byl odložen:", error);
    });
  }, 1200);

  window.LubaNoteTrash = {
    otevri: otevriKos,
    zavri: zavriKos,
    render: renderKos,
    jeOtevrenTajnyKos: () =>
      !trashScreen?.hidden && zobrazenTajnyKos
  };
})();
