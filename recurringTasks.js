/* ==========================================
   LUBANOTE – OPAKOVANÉ ÚKOLY
   Jediný systém opakování je uložený přímo
   na poznámce v note.repeat.
   ========================================== */

(() => {
  const MILISEKUND_ZA_DEN = 86400000;
  const MAX_HLEDANYCH_DNU = 3660;

  function ziskejCastData(hodnota) {
    if (hodnota instanceof Date) {
      return {
        rok: hodnota.getFullYear(),
        mesic: hodnota.getMonth() + 1,
        den: hodnota.getDate()
      };
    }

    const text = String(hodnota || "").slice(0, 10);
    const [rok, mesic, den] = text.split("-").map(Number);

    if (!rok || !mesic || !den) {
      return null;
    }

    return { rok, mesic, den };
  }

  function datumovyKlic(hodnota) {
    const casti = ziskejCastData(hodnota);

    if (!casti) {
      return "";
    }

    return `${casti.rok}-${String(casti.mesic).padStart(2, "0")}-${String(casti.den).padStart(2, "0")}`;
  }

  function utcDen(casti) {
    return Math.floor(
      Date.UTC(
        casti.rok,
        casti.mesic - 1,
        casti.den
      ) / MILISEKUND_ZA_DEN
    );
  }

  function denVTydnu(casti) {
    return new Date(
      Date.UTC(
        casti.rok,
        casti.mesic - 1,
        casti.den
      )
    ).getUTCDay();
  }

  function pondeliTydne(casti) {
    const cisloDne = denVTydnu(casti);
    const posunOdPondeli = (cisloDne + 6) % 7;
    return utcDen(casti) - posunOdPondeli;
  }

  function jePredStartem(cil, repeat) {
    if (!repeat?.startDate) {
      return false;
    }

    return datumovyKlic(cil) < datumovyKlic(repeat.startDate);
  }

  function jeZaKoncem(cil, repeat) {
    if (!repeat?.endDate) {
      return false;
    }

    return datumovyKlic(cil) > datumovyKlic(repeat.endDate);
  }

  function jePlatnyDenniVyskyt(cil, repeat) {
    const start = ziskejCastData(repeat.startDate);
    const datum = ziskejCastData(cil);

    if (!start || !datum) {
      return false;
    }

    const interval = Math.max(1, Number(repeat.interval) || 1);
    const rozdilDni = utcDen(datum) - utcDen(start);

    return rozdilDni >= 0 && rozdilDni % interval === 0;
  }

  function jePlatnyTydenniVyskyt(
    startDatum,
    ciloveDatum,
    interval = 1,
    dny = []
  ) {
    const start = ziskejCastData(startDatum);
    const cil = ziskejCastData(ciloveDatum);

    if (!start || !cil) {
      return false;
    }

    const povoleneDny = Array.isArray(dny)
      ? dny.map(Number)
      : [];

    if (!povoleneDny.includes(denVTydnu(cil))) {
      return false;
    }

    const rozdilTydnu = Math.floor(
      (pondeliTydne(cil) - pondeliTydne(start)) / 7
    );

    const bezpecnyInterval =
      Math.max(1, Number(interval) || 1);

    return (
      rozdilTydnu >= 0 &&
      rozdilTydnu % bezpecnyInterval === 0
    );
  }

  function jePlatnyMesicniVyskyt(cil, repeat) {
    const start = ziskejCastData(repeat.startDate);
    const datum = ziskejCastData(cil);

    if (!start || !datum) {
      return false;
    }

    const interval = Math.max(1, Number(repeat.interval) || 1);
    const rozdilMesicu =
      (datum.rok - start.rok) * 12 +
      (datum.mesic - start.mesic);

    if (rozdilMesicu < 0 || rozdilMesicu % interval !== 0) {
      return false;
    }

    const denVMesici = Math.max(
      1,
      Number(repeat.dayOfMonth) || start.den
    );

    const posledniDen = new Date(
      datum.rok,
      datum.mesic,
      0
    ).getDate();

    return datum.den === Math.min(denVMesici, posledniDen);
  }

  function jeDatumVOpakovani(ciloveDatum, repeat) {
    if (!repeat?.enabled || !repeat.startDate) {
      return false;
    }

    if (
      jePredStartem(ciloveDatum, repeat) ||
      jeZaKoncem(ciloveDatum, repeat)
    ) {
      return false;
    }

    switch (repeat.type) {
      case "daily":
        return jePlatnyDenniVyskyt(
          ciloveDatum,
          repeat
        );

      case "weekly":
        return jePlatnyTydenniVyskyt(
          repeat.startDate,
          ciloveDatum,
          repeat.interval,
          repeat.days
        );

      case "monthly":
        return jePlatnyMesicniVyskyt(
          ciloveDatum,
          repeat
        );

      default:
        return false;
    }
  }

  function posunDatumODen(datum, pocetDni = 1) {
    const vysledek = new Date(datum);
    vysledek.setDate(vysledek.getDate() + pocetDni);
    return vysledek;
  }

  function vypocitejDalsiVyskyt(datumOd, repeat) {
    if (!repeat?.enabled) {
      return null;
    }

    let kandidat = posunDatumODen(
      datumOd instanceof Date
        ? datumOd
        : new Date(datumOd),
      1
    );

    for (let i = 0; i < MAX_HLEDANYCH_DNU; i++) {
      if (jeDatumVOpakovani(kandidat, repeat)) {
        return kandidat;
      }

      kandidat = posunDatumODen(kandidat, 1);
    }

    return null;
  }

  function vypocitejPristiTermin(
    zakladniDatumCas,
    repeat,
    odDatumCas = new Date()
  ) {
    if (!repeat?.enabled || !zakladniDatumCas) {
      return null;
    }

    const zaklad = new Date(zakladniDatumCas);

    if (Number.isNaN(zaklad.getTime())) {
      return null;
    }

    const od =
      odDatumCas instanceof Date
        ? new Date(odDatumCas)
        : new Date(odDatumCas);

    let kandidatDne = new Date(
      od.getFullYear(),
      od.getMonth(),
      od.getDate(),
      12,
      0,
      0,
      0
    );

    for (let i = 0; i < MAX_HLEDANYCH_DNU; i++) {
      if (jeDatumVOpakovani(kandidatDne, repeat)) {
        const kandidat = new Date(
          kandidatDne.getFullYear(),
          kandidatDne.getMonth(),
          kandidatDne.getDate(),
          zaklad.getHours(),
          zaklad.getMinutes(),
          0,
          0
        );

        if (kandidat > od) {
          return kandidat;
        }
      }

      kandidatDne = posunDatumODen(kandidatDne, 1);
    }

    return null;
  }

  function vypocitejBudouciTerminy(
    zakladniDatumCas,
    repeat,
    pocet = 32,
    odDatumCas = new Date()
  ) {
    const terminy = [];
    let hledatOd = new Date(odDatumCas);

    for (let i = 0; i < pocet; i++) {
      const dalsi = vypocitejPristiTermin(
        zakladniDatumCas,
        repeat,
        hledatOd
      );

      if (!dalsi) {
        break;
      }

      terminy.push(dalsi);
      hledatOd = new Date(dalsi.getTime() + 60000);
    }

    return terminy;
  }

  function formatujPravidlo(repeat) {
    if (!repeat?.enabled) {
      return "Neopakovat";
    }

    const interval = Math.max(1, Number(repeat.interval) || 1);

    if (repeat.type === "daily") {
      return interval === 1
        ? "Každý den"
        : `Každé ${interval} dny`;
    }

    if (repeat.type === "weekly") {
      const nazvyDnu = {
        0: "Ne",
        1: "Po",
        2: "Út",
        3: "St",
        4: "Čt",
        5: "Pá",
        6: "So"
      };

      const dny = (Array.isArray(repeat.days) ? repeat.days : [])
        .map(Number)
        .sort(
          (a, b) =>
            ((a + 6) % 7) -
            ((b + 6) % 7)
        )
        .map((den) => nazvyDnu[den])
        .filter(Boolean)
        .join(", ");

      const zaklad = interval === 1
        ? "Každý týden"
        : interval === 2
          ? "Každé 2 týdny"
          : `Každé ${interval} týdny`;

      return dny
        ? `${zaklad} • ${dny}`
        : zaklad;
    }

    if (repeat.type === "monthly") {
      const den = Number(repeat.dayOfMonth) || 1;
      const zaklad = interval === 1
        ? "Každý měsíc"
        : `Každé ${interval} měsíce`;

      return `${zaklad} • ${den}. den`;
    }

    return "Opakování";
  }

  function kopirujRepeat(repeat) {
    if (!repeat?.enabled) {
      return null;
    }

    return {
      enabled: true,
      type: repeat.type,
      interval: Math.max(1, Number(repeat.interval) || 1),
      days: Array.isArray(repeat.days)
        ? [...repeat.days].map(Number)
        : [],
      startDate: datumovyKlic(repeat.startDate),
      endDate: repeat.endDate
        ? datumovyKlic(repeat.endDate)
        : null,
      dayOfMonth: repeat.dayOfMonth
        ? Number(repeat.dayOfMonth)
        : undefined
    };
  }

  async function migrujStareOpakovaniPlanneru() {
    if (
      typeof loadTask !== "function" ||
      typeof loadPlannedItems !== "function" ||
      typeof savePlannedItems !== "function"
    ) {
      return 0;
    }

    const notes = loadTask();
    const plannedItems = loadPlannedItems();
    const noteById = new Map(
      notes
        .filter((note) => note?.id)
        .map((note) => [note.id, note])
    );

    let pocetMigraci = 0;
    let bylaZmena = false;
    const odstraneneIds = new Set();
    const zmeneneNoteIds = new Set();

    for (const item of plannedItems) {
      if (item?.repeat?.enabled !== true) {
        continue;
      }

      const note = noteById.get(item.sourceNoteId);

      if (
        item.sourceType === "note" &&
        note &&
        note.isSecret !== true
      ) {
        if (note.repeat?.enabled !== true) {
          note.repeat = kopirujRepeat(item.repeat);
          note.date = item.plannedAt || note.date;
          note.reminder = true;
          note.notificationId =
            note.notificationId ||
            item.notificationId ||
            null;
          note.updatedAt = new Date().toISOString();
          pocetMigraci++;
          bylaZmena = true;
          zmeneneNoteIds.add(note.id);
        }

        odstraneneIds.add(item.id);
        bylaZmena = true;

        if (
          item.notificationId &&
          typeof cancelNotification === "function"
        ) {
          await cancelNotification(item.notificationId);
        }
      }
    }

    notes.forEach((note) => {
      if (!Array.isArray(note.plannedItems)) {
        return;
      }

      const puvodniJson =
        JSON.stringify(note.plannedItems);

      note.plannedItems = note.plannedItems
        .filter((item) => !odstraneneIds.has(item?.id))
        .map((item) => {
          if (!item?.repeat) {
            return item;
          }

          const kopie = { ...item };
          delete kopie.repeat;
          return kopie;
        });

      if (JSON.stringify(note.plannedItems) !== puvodniJson) {
        note.updatedAt = new Date().toISOString();
        bylaZmena = true;

        if (note.id) {
          zmeneneNoteIds.add(note.id);
        }
      }
    });

    const novePlannedItems = plannedItems
      .filter((item) => !odstraneneIds.has(item?.id))
      .map((item) => {
        if (!item?.repeat) {
          return item;
        }

        const kopie = { ...item };
        delete kopie.repeat;
        return kopie;
      });

    savePlannedItems(novePlannedItems);

    if (bylaZmena) {
      if (typeof saveAllTasks === "function") {
        await saveAllTasks(notes);
      }

      if (
        typeof uploadLocalNoteToSupabase ===
        "function"
      ) {
        for (const note of notes) {
          if (
            note?.id &&
            zmeneneNoteIds.has(note.id)
          ) {
            await uploadLocalNoteToSupabase(note);
          }
        }
      }
    }

    return pocetMigraci;
  }

  window.LubaNoteRecurring = {
    jeDatumVOpakovani,
    jePlatnyTydenniVyskyt,
    vypocitejDalsiVyskyt,
    vypocitejPristiTermin,
    vypocitejBudouciTerminy,
    formatujPravidlo,
    kopirujRepeat,
    datumovyKlic,
    migrujStareOpakovaniPlanneru
  };

  /* Zpětná kompatibilita se současným calendar.js během migrace. */
  window.jePlatnyTydenniVyskyt = jePlatnyTydenniVyskyt;
  window.vypocitejDalsiVyskyt = vypocitejDalsiVyskyt;
})();
