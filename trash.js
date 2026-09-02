/* ==================================================
   LubaNote – KOŠ
   --------------------------------------------------
   - běžný Koš je úplně oddělený od Secret Koše
   - Secret názvy/obsah se do běžného UI nikdy nevypisují
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

  let zobrazenTajnyKos = false;
  let idProTrvaleSmazani = null;

  function t(klic, zaloha, hodnoty = {}) {
    return window.LubaNoteI18n?.t?.(
      klic,
      zaloha,
      hodnoty
    ) || zaloha;
  }

  function jeSecretFiltrAktivni() {
    return Boolean(
      typeof tajnyRezimOdemceny !== "undefined" &&
      tajnyRezimOdemceny === true &&
      typeof filtrTajnychPoznamekAktivni !== "undefined" &&
      filtrTajnychPoznamekAktivni === true
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
        await poZmeneKose();
      } else {
        obnovit.disabled = false;
        trvaleSmazat.disabled = false;
      }
    });

    trvaleSmazat.addEventListener("click", () => {
      idProTrvaleSmazani = task.id;
      trashConfirmText.textContent = t(
        "trash.deleteConfirm",
        "Tato poznámka bude smazána trvale a nepůjde obnovit."
      );
      trashConfirmModal.hidden = false;
    });

    akce.append(obnovit, trvaleSmazat);
    karta.append(hlavicka, nahled, meta, akce);

    obnovIkonyVKontejneru(karta);
    return karta;
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
  }

  async function renderKos() {
    if (!trashList || !trashEmpty) {
      return;
    }

    if (
      zobrazenTajnyKos &&
      !jeSecretFiltrAktivni()
    ) {
      zavriKos();
      return;
    }

    await uklidPoznamkyVKosiPo30Dnech();

    const poznamky = nactiPoznamkyVKosi({
      tajne: zobrazenTajnyKos
    }).sort((a, b) =>
      new Date(b?.trashedAt || 0).getTime() -
      new Date(a?.trashedAt || 0).getTime()
    );

    trashList.innerHTML = "";
    trashEmpty.hidden = poznamky.length !== 0;
    trashEmpty.textContent = t(
      "trash.empty",
      "Koš je prázdný."
    );

    poznamky.forEach((task) => {
      trashList.append(vytvorKartu(task));
    });

    nastavTextyKose();
  }

  async function poZmeneKose() {
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
      navigator.onLine &&
      typeof window.LubaNoteSync?.spustRychle === "function"
    ) {
      window.LubaNoteSync.spustRychle();
    }
  }

  async function otevriKos() {
    if (!trashScreen) {
      return;
    }

    zobrazenTajnyKos = jeSecretFiltrAktivni();
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
    zobrazenTajnyKos = false;
    idProTrvaleSmazani = null;

    if (trashConfirmModal) {
      trashConfirmModal.hidden = true;
    }
  }

  trashButton?.addEventListener("click", () => {
    otevriKos();
  });

  trashBackButton?.addEventListener("click", zavriKos);

  trashConfirmCancel?.addEventListener("click", () => {
    idProTrvaleSmazani = null;
    trashConfirmModal.hidden = true;
  });

  trashConfirmDelete?.addEventListener("click", async () => {
    if (!idProTrvaleSmazani) {
      return;
    }

    const id = idProTrvaleSmazani;
    idProTrvaleSmazani = null;
    trashConfirmDelete.disabled = true;

    try {
      const uspesne =
        await smazPoznamkuZKoseTrvale(
          id,
          zobrazenTajnyKos
        );

      trashConfirmModal.hidden = true;

      if (uspesne) {
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
        idProTrvaleSmazani = null;
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
