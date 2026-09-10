/* ==================================================
   LUBANOTE – MOBILNI PANEL AKCI / RYCHLY TERMIN
   0.9.351
   ================================================== */

(() => {
  let modal = null;
  let grid = null;
  let monthTitle = null;
  let casInput = null;
  let dateButton = null;
  let timeButton = null;
  let reminderButton = null;
  let hint = null;
  let saveButton = null;

  let aktivniPoznamkaId = null;
  let vybraneDatum = "";
  let zobrazenyRok = 0;
  let zobrazenyMesic = 0;
  let pripominkaZapnuta = false;
  let pripominkaZamcena = false;
  let probihaUlozeni = false;
  let vybranyCas = "00:00";

  function jeMobilniPanel() {
    return window.innerWidth < 900;
  }

  function datumNaText(date) {
    const rok = date.getFullYear();
    const mesic = String(date.getMonth() + 1).padStart(2, "0");
    const den = String(date.getDate()).padStart(2, "0");
    return `${rok}-${mesic}-${den}`;
  }

  function datumZTextu(text) {
    const shoda = String(text || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!shoda) return null;
    const rok = Number(shoda[1]);
    const mesic = Number(shoda[2]) - 1;
    const den = Number(shoda[3]);
    const datum = new Date(rok, mesic, den, 12, 0, 0, 0);
    return Number.isNaN(datum.getTime()) ? null : datum;
  }

  function omezCislo(hodnota, minimum, maximum) {
    const cislo = Number(hodnota);
    if (!Number.isFinite(cislo)) return minimum;
    return Math.min(maximum, Math.max(minimum, Math.trunc(cislo)));
  }

  function aktualizujTlacitkoPripominky() {
    if (!reminderButton) return;

    reminderButton.classList.toggle("active", pripominkaZapnuta);
    reminderButton.setAttribute("aria-pressed", String(pripominkaZapnuta));
    reminderButton.disabled = pripominkaZamcena;

    const text = pripominkaZapnuta
      ? "Připomínka: zapnuto"
      : "Připomínka: vypnuto";

    if (window.LubaNoteIcons?.nastavObsahSIkonou) {
      window.LubaNoteIcons.nastavObsahSIkonou(
        reminderButton,
        pripominkaZapnuta ? "zvonek" : "vypnoutZvonek",
        text
      );
    } else {
      reminderButton.textContent = pripominkaZapnuta
        ? `🔔 ${text}`
        : `🔕 ${text}`;
    }
  }

  function formatDatumTlacitka() {
    const datum = datumZTextu(vybraneDatum);
    if (!datum) return "Datum";

    const locale = window.LubaNoteI18n?.ziskejLocale?.() || "cs-CZ";
    return datum.toLocaleDateString(locale, {
      day: "numeric",
      month: "numeric",
      year: "numeric"
    });
  }

  function aktualizujTlacitkaDataCasu() {
    if (dateButton) {
      dateButton.innerHTML = `<span class="cardQuickTermSwitchLabel">Datum</span><strong>${formatDatumTlacitka()}</strong>`;
      dateButton.classList.add("active");
    }

    if (timeButton) {
      timeButton.innerHTML = `<span class="cardQuickTermSwitchLabel">Čas</span><strong>${vybranyCas}</strong>`;
    }
  }

  function pripravVrstevnyVyberCasu() {
    const timeModal = document.getElementById("timePickerModal");
    if (!timeModal) return null;

    const quickTermDialog = modal?.querySelector?.(".cardQuickTermDialog");
    const horniY = quickTermDialog?.getBoundingClientRect?.().top;

    if (Number.isFinite(horniY)) {
      timeModal.style.setProperty(
        "--card-quick-term-time-top",
        `${Math.max(0, Math.round(horniY))}px`
      );
    }

    timeModal.classList.add("cardQuickTermNestedTime");

    if (timeModal.dataset.cardQuickTermHooked !== "1") {
      timeModal.dataset.cardQuickTermHooked = "1";

      [
        "#closeTimePickerButton",
        "#timePickerCancelButton",
        "#timePickerSaveButton",
        "#timePickerNowButton"
      ].forEach((selector) => {
        document.querySelector(selector)?.addEventListener("click", () => {
          setTimeout(() => {
            if (timeModal.hidden) {
              timeModal.classList.remove("cardQuickTermNestedTime");
              timeModal.style.removeProperty("--card-quick-term-time-top");
            }
          }, 0);
        });
      });
    }

    return timeModal;
  }

  function otevriHodiny() {
    if (!casInput || typeof window.otevriVlastniVyberCasu !== "function") {
      return;
    }

    casInput.value = vybranyCas;
    pripravVrstevnyVyberCasu();

    window.otevriVlastniVyberCasu({
      input: casInput,
      povolOpakovani: false,
      poVyberu: (hodnota) => {
        if (/^\d{2}:\d{2}$/.test(String(hodnota || ""))) {
          vybranyCas = hodnota;
          aktualizujTlacitkaDataCasu();
        }
      }
    });
  }

  function vykresliKalendář() {
    if (!grid || !monthTitle) return;

    grid.replaceChildren();

    const prvniDen = new Date(zobrazenyRok, zobrazenyMesic, 1, 12, 0, 0, 0);
    const pocetDni = new Date(zobrazenyRok, zobrazenyMesic + 1, 0, 12, 0, 0, 0).getDate();
    const pocatecniPozice = (prvniDen.getDay() + 6) % 7;
    const locale = window.LubaNoteI18n?.ziskejLocale?.() || "cs-CZ";

    monthTitle.textContent = prvniDen.toLocaleDateString(locale, {
      month: "long",
      year: "numeric"
    });

    for (let i = 0; i < pocatecniPozice; i += 1) {
      grid.append(document.createElement("span"));
    }

    const dnes = new Date();

    for (let den = 1; den <= pocetDni; den += 1) {
      const tlacitko = document.createElement("button");
      tlacitko.type = "button";
      tlacitko.textContent = String(den);

      const datum = new Date(zobrazenyRok, zobrazenyMesic, den, 12, 0, 0, 0);
      const datumText = datumNaText(datum);

      if (
        den === dnes.getDate() &&
        zobrazenyMesic === dnes.getMonth() &&
        zobrazenyRok === dnes.getFullYear()
      ) {
        tlacitko.classList.add("today");
      }

      if (datumText === vybraneDatum) {
        tlacitko.classList.add("selected");
      }

      tlacitko.addEventListener("click", () => {
        vybraneDatum = datumText;
        vykresliKalendář();
        aktualizujTlacitkaDataCasu();
        otevriHodiny();
      });

      grid.append(tlacitko);
    }
  }

  function nastavDatum(date) {
    vybraneDatum = datumNaText(date);
    zobrazenyRok = date.getFullYear();
    zobrazenyMesic = date.getMonth();
    vykresliKalendář();
    aktualizujTlacitkaDataCasu();
  }

  function vytvorModal() {
    if (modal?.isConnected) return modal;

    modal = document.createElement("div");
    modal.id = "cardQuickTermModal";
    modal.className = "cardQuickTermModal";
    modal.hidden = true;

    modal.innerHTML = `
      <div class="cardQuickTermDialog" role="dialog" aria-modal="true" aria-labelledby="cardQuickTermTitle">
        <div class="cardQuickTermHeader">
          <span class="cardQuickTermHeaderSpacer" aria-hidden="true"></span>
          <h3 id="cardQuickTermTitle">Termín</h3>
          <button id="cardQuickTermClose" class="cardQuickTermClose" type="button" aria-label="Zavřít">×</button>
        </div>

        <div class="cardQuickTermQuickDays">
          <button type="button" data-quick-day="today">Dnes</button>
          <button type="button" data-quick-day="tomorrow">Zítra</button>
        </div>

        <div class="cardQuickTermMonthHeader">
          <button id="cardQuickTermPrev" class="cardQuickTermMonthNav" type="button" aria-label="Předchozí měsíc">‹</button>
          <div id="cardQuickTermMonthTitle" class="cardQuickTermMonthTitle"></div>
          <button id="cardQuickTermNext" class="cardQuickTermMonthNav" type="button" aria-label="Další měsíc">›</button>
        </div>

        <div class="cardQuickTermWeekdays" aria-hidden="true">
          <span>Po</span><span>Út</span><span>St</span><span>Čt</span><span>Pá</span><span>So</span><span>Ne</span>
        </div>

        <div id="cardQuickTermGrid" class="cardQuickTermGrid"></div>

        <div class="cardQuickTermSwitches" role="group" aria-label="Datum a čas termínu">
          <button id="cardQuickTermDateButton" class="cardQuickTermSwitch active" type="button"></button>
          <button id="cardQuickTermTimeButton" class="cardQuickTermSwitch" type="button"></button>
          <input id="cardQuickTermTimeValue" type="hidden" value="00:00">
        </div>

        <button id="cardQuickTermReminder" class="cardQuickTermReminder" type="button" aria-pressed="false"></button>
        <div id="cardQuickTermHint" class="cardQuickTermHint"></div>

        <div class="cardQuickTermActions">
          <button id="cardQuickTermCancel" type="button">Zrušit</button>
          <button id="cardQuickTermSave" class="cardQuickTermSave" type="button">Uložit</button>
        </div>
      </div>
    `;

    document.body.append(modal);

    grid = modal.querySelector("#cardQuickTermGrid");
    monthTitle = modal.querySelector("#cardQuickTermMonthTitle");
    casInput = modal.querySelector("#cardQuickTermTimeValue");
    dateButton = modal.querySelector("#cardQuickTermDateButton");
    timeButton = modal.querySelector("#cardQuickTermTimeButton");
    reminderButton = modal.querySelector("#cardQuickTermReminder");
    hint = modal.querySelector("#cardQuickTermHint");
    saveButton = modal.querySelector("#cardQuickTermSave");

    modal.querySelector("#cardQuickTermClose")?.addEventListener("click", zavriTermin);
    modal.querySelector("#cardQuickTermCancel")?.addEventListener("click", zavriTermin);

    modal.querySelector("#cardQuickTermPrev")?.addEventListener("click", () => {
      zobrazenyMesic -= 1;
      if (zobrazenyMesic < 0) {
        zobrazenyMesic = 11;
        zobrazenyRok -= 1;
      }
      vykresliKalendář();
    });

    modal.querySelector("#cardQuickTermNext")?.addEventListener("click", () => {
      zobrazenyMesic += 1;
      if (zobrazenyMesic > 11) {
        zobrazenyMesic = 0;
        zobrazenyRok += 1;
      }
      vykresliKalendář();
    });

    modal.querySelectorAll("[data-quick-day]").forEach((button) => {
      button.addEventListener("click", () => {
        const date = new Date();
        if (button.dataset.quickDay === "tomorrow") {
          date.setDate(date.getDate() + 1);
        }
        nastavDatum(date);
        otevriHodiny();
      });
    });


    dateButton?.addEventListener("click", () => {
      modal.querySelector(".cardQuickTermMonthHeader")?.scrollIntoView({
        block: "nearest"
      });
    });

    timeButton?.addEventListener("click", otevriHodiny);

    reminderButton?.addEventListener("click", () => {
      if (pripominkaZamcena) return;
      pripominkaZapnuta = !pripominkaZapnuta;
      aktualizujTlacitkoPripominky();
      if (pripominkaZapnuta && typeof requestNotificationPermission === "function") {
        Promise.resolve(requestNotificationPermission()).catch(() => null);
      }
    });

    saveButton?.addEventListener("click", ulozTermin);

    modal.addEventListener("pointerdown", (event) => {
      if (event.target === modal) {
        zavriTermin();
      }
    });

    return modal;
  }

  function zavriTermin() {
    if (!modal || probihaUlozeni) return;
    modal.hidden = true;
    aktivniPoznamkaId = null;
  }

  function otevriTermin(task) {
    if (!jeMobilniPanel() || !task?.id) return false;

    vytvorModal();
    aktivniPoznamkaId = task.id;

    const ted = new Date();
    let datum = null;
    let hodiny = ted.getHours();
    let minuty = ted.getMinutes();

    if (task.date) {
      const [datumCast, casCast = ""] = String(task.date).split("T");
      datum = datumZTextu(datumCast);
      const shodaCasu = casCast.match(/^(\d{1,2}):(\d{2})/);
      if (shodaCasu) {
        hodiny = omezCislo(shodaCasu[1], 0, 23);
        minuty = omezCislo(shodaCasu[2], 0, 59);
      }
    }

    if (!datum) datum = ted;

    vybraneDatum = datumNaText(datum);
    zobrazenyRok = datum.getFullYear();
    zobrazenyMesic = datum.getMonth();
    vybranyCas = `${String(hodiny).padStart(2, "0")}:${String(minuty).padStart(2, "0")}`;
    casInput.value = vybranyCas;
    aktualizujTlacitkaDataCasu();

    const jeTajna = task.isSecret === true;
    const jeOpakovana = task.repeat?.enabled === true;

    pripominkaZamcena = jeTajna || jeOpakovana;

    if (jeTajna) {
      pripominkaZapnuta = false;
      hint.textContent = "Tajná poznámka nepoužívá systémová upozornění.";
    } else if (jeOpakovana) {
      pripominkaZapnuta = true;
      hint.textContent = "Opakovaná poznámka používá připomínku.";
    } else {
      pripominkaZapnuta = task.date
        ? task.reminder === true
        : window.LubaNotePlannerPreferences?.ziskejVychoziPripominku?.() === true;
      hint.textContent = "";
    }

    aktualizujTlacitkoPripominky();
    vykresliKalendář();

    modal.hidden = false;
    return true;
  }

  async function ulozTermin() {
    if (probihaUlozeni || !aktivniPoznamkaId || !vybraneDatum) return;

    const shodaCasu = String(vybranyCas || "").match(/^(\d{2}):(\d{2})$/);
    const hodiny = String(omezCislo(shodaCasu?.[1], 0, 23)).padStart(2, "0");
    const minuty = String(omezCislo(shodaCasu?.[2], 0, 59)).padStart(2, "0");
    const novyTermin = `${vybraneDatum}T${hodiny}:${minuty}`;

    if (typeof loadTask !== "function" || typeof updateTask !== "function") return;

    const tasks = loadTask();
    const index = tasks.findIndex((task) => task?.id === aktivniPoznamkaId);
    if (index < 0) return;

    const puvodni = tasks[index];
    const jeTajna = puvodni.isSecret === true;
    const repeat = puvodni.repeat?.enabled === true
      ? { ...puvodni.repeat, startDate: vybraneDatum }
      : puvodni.repeat;

    if (repeat?.enabled === true && repeat.type === "monthly") {
      repeat.dayOfMonth = Number(vybraneDatum.slice(8, 10));
    }

    const aktualizovana = {
      ...puvodni,
      date: novyTermin,
      planned: jeTajna ? false : true,
      reminder: jeTajna
        ? false
        : (repeat?.enabled === true ? true : pripominkaZapnuta),
      repeat,
      notificationId: puvodni.notificationId || (Date.now() % 2147483647),
      updatedAt: new Date().toISOString()
    };

    probihaUlozeni = true;
    saveButton.disabled = true;
    saveButton.textContent = "Ukládám…";

    try {
      const provedZmenu = () => updateTask(index, aktualizovana);

      /*
       * Použijeme stejný centrální save/sync hook jako editor poznámky.
       * Rychlý Termín tak nesmí obcházet ochranu proti kolizi se syncem.
       */
      if (typeof ulozPoznamkuLokalneASynchronizuj === "function") {
        await ulozPoznamkuLokalneASynchronizuj(
          provedZmenu,
          aktualizovana
        );
      } else if (window.LubaNoteSync?.provedLokalniZmenuASynchronizuj) {
        await window.LubaNoteSync.provedLokalniZmenuASynchronizuj(provedZmenu);
      } else {
        await provedZmenu();
        if (navigator.onLine && typeof uploadLocalNoteToSupabase === "function") {
          Promise.resolve(uploadLocalNoteToSupabase(aktualizovana)).catch((error) => {
            console.warn("Rychlý Termín: synchronizace byla odložena:", error);
          });
        }
      }

      if (aktualizovana.reminder && typeof requestNotificationPermission === "function") {
        Promise.resolve(requestNotificationPermission()).catch(() => null);
      }

      /* Stejná centrální cesta notifikace jako po uložení v editoru. */
      if (typeof obnovNotifikaciPoznamkyNaPozadi === "function") {
        obnovNotifikaciPoznamkyNaPozadi(aktualizovana);
      } else if (typeof obnovNotifikacePoznamkyPodleSoukromi === "function") {
        setTimeout(() => {
          Promise.resolve(obnovNotifikacePoznamkyPodleSoukromi(aktualizovana)).catch((error) => {
            console.warn("Rychlý Termín: obnova notifikace byla odložena:", error);
          });
        }, 0);
      }

      modal.hidden = true;
      aktivniPoznamkaId = null;

      if (typeof renderTasks === "function") renderTasks();
      if (typeof renderCalendar === "function") renderCalendar();
      if (typeof renderRemindersScreen === "function") renderRemindersScreen();
    } catch (error) {
      console.error("Rychlý Termín se nepodařilo uložit:", error);
      if (typeof zobrazZpravuAplikace === "function") {
        zobrazZpravuAplikace("Termín", "Termín se nepodařilo bezpečně uložit.");
      }
    } finally {
      probihaUlozeni = false;
      saveButton.disabled = false;
      saveButton.textContent = "Uložit";
    }
  }

  function posunKartuNadPanel(card, panel) {
    if (!jeMobilniPanel() || !card?.isConnected || !panel || panel.hidden) return;

    const app = document.querySelector(".app");
    if (!app) return;

    requestAnimationFrame(() => {
      const cardRect = card.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const rezerva = 12;
      const prekryti = cardRect.bottom - (panelRect.top - rezerva);

      if (prekryti > 0) {
        app.scrollBy({
          top: Math.ceil(prekryti),
          behavior: "smooth"
        });
      }
    });
  }

  function zpracujAndroidZpet() {
    if (modal && !modal.hidden) {
      zavriTermin();
      return true;
    }
    return false;
  }

  window.LubaNoteCardActionsMobile = {
    otevriTermin,
    zavriTermin,
    posunKartuNadPanel,
    zpracujAndroidZpet
  };
})();
