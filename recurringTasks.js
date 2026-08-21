  function vypocitejDalsiDatumDenne(
      datum,
      interval
    ) {
      const dalsiDatum =
        new Date(datum);
      
      dalsiDatum.setDate(
        dalsiDatum.getDate() + interval
      );
      
      return dalsiDatum;
    }
    
  function vypocitejDalsiDatumZaTydny(
      datum,
      interval
    ) {
      const dalsiDatum =
        new Date(datum);
      
      dalsiDatum.setDate(
        dalsiDatum.getDate() + interval * 7
      );
      
      return dalsiDatum;
    }
    
  function vypocitejDalsiDatumZaMesice(
      datum,
      interval
    ) {
      const puvodniDatum =
        new Date(datum);
      
      const puvodniDen =
        puvodniDatum.getDate();
      
      const cilovyRok =
        puvodniDatum.getFullYear();
      
      const cilovyMesic =
        puvodniDatum.getMonth() + interval;
      
      const posledniDenCilovehoMesice =
        new Date(
          cilovyRok,
          cilovyMesic + 1,
          0
        ).getDate();
      
      const cilovyDen =
        Math.min(
          puvodniDen,
          posledniDenCilovehoMesice
        );
      
      return new Date(
        cilovyRok,
        cilovyMesic,
        cilovyDen
      );
    }
    
  function najdiDalsiDenVTydnu(
  datum,
  startDatum,
  interval,
  dny
) {
  const datumHledani =
    new Date(datum);

  let pocitadloDni = 0;

  const maximalniPocetDni =
    interval * 7 + 7;

  while (
    pocitadloDni <
    maximalniPocetDni
  ) {
    datumHledani.setDate(
      datumHledani.getDate() + 1
    );

    pocitadloDni++;

    if (
      jePlatnyTydenniVyskyt(
        startDatum,
        datumHledani,
        interval,
        dny
      )
    ) {
      return datumHledani;
    }
  }

  return null;
}

const dalsiPopelnice =
  najdiDalsiDenVTydnu(
    "2026-08-26",
    "2026-08-26",
    2,
    [3]
  );

console.log(
  dalsiPopelnice
    ?.toLocaleDateString("cs-CZ")
);    





    
  function vypocitejDalsiVyskyt(
  datum,
  repeat
) {
  if (
    !repeat ||
    !repeat.enabled
  ) {
    return null;
  }
  
  switch (repeat.type) {
    case "daily":
  return vypocitejDalsiDatumDenne(
    datum,
    repeat.interval
  );
      
    case "weekly":
  return najdiDalsiDenVTydnu(
    datum,
    repeat.startDate,
    repeat.interval,
    repeat.days
  );
      
    case "monthly":
return vypocitejDalsiDatumZaMesice(
  datum,
  repeat.interval
);
      
    default:
      return null;
  }
}

const testOpakovani = {
  enabled: true,
  type: "weekly",
  interval: 1,
  days: [1, 3, 5],
  startDate: "2026-08-21"
};

const dalsiVyskyt =
  vypocitejDalsiVyskyt(
    "2026-08-21",
    testOpakovani
  );

console.log(
  dalsiVyskyt.toLocaleDateString("cs-CZ")
);


function jePlatnyTyden(
  cisloTydne,
  interval
) {
  return cisloTydne % interval === 0;
}

console.log(
  jePlatnyTyden(4, 2)
);


function spocitejRozdilTydnu(
  startDatum,
  ciloveDatum
) {
  const start =
    new Date(startDatum);

  const cil =
    new Date(ciloveDatum);

  const denStartu =
    start.getDay() || 7;

  const denCile =
    cil.getDay() || 7;

  start.setDate(
    start.getDate() - denStartu + 1
  );

  cil.setDate(
    cil.getDate() - denCile + 1
  );

  const rozdilMs =
    cil - start;

  const rozdilDni =
    rozdilMs / 86400000;

  return Math.round(
    rozdilDni / 7
  );
}

console.log(
  spocitejRozdilTydnu(
    "2026-08-26",
    "2026-09-09"
  )
);


function jeTydenVSpravnemCyklu(
  startDatum,
  ciloveDatum,
  interval
) {
  const cisloTydne =
    spocitejRozdilTydnu(
      startDatum,
      ciloveDatum
    );

  return jePlatnyTyden(
    cisloTydne,
    interval
  );
}
console.log(
  jeTydenVSpravnemCyklu(
    "2026-08-26",
    "2026-09-02",
    2
  )
);

function jePlatnyTydenniVyskyt(
  startDatum,
  ciloveDatum,
  interval,
  dny
) {
  const cil =
    new Date(ciloveDatum);

  const jeSpravnyDen =
    dny.includes(
      cil.getDay()
    );

  const jeSpravnyCyklus =
    jeTydenVSpravnemCyklu(
      startDatum,
      ciloveDatum,
      interval
    );

  return (
    jeSpravnyDen &&
    jeSpravnyCyklus
  );
}
console.log(
  jePlatnyTydenniVyskyt(
    "2026-08-26",
    "2026-09-10",
    2,
    [3]
  )
);



const testViceDnu = {
  enabled: true,
  type: "weekly",
  interval: 1,
  days: [1, 3, 5],
  startDate: "2026-08-21"
};

const dalsiViceDnu =
  vypocitejDalsiVyskyt(
    "2026-08-24",
    testViceDnu
  );

console.log(
  dalsiViceDnu
    ?.toLocaleDateString("cs-CZ")
);

const testViceDnuPoDvoutydnech = {
  enabled: true,
  type: "weekly",
  interval: 2,
  days: [1, 3, 5],
  startDate: "2026-08-24"
};

const dalsiViceDnuPoDvoutydnech =
  vypocitejDalsiVyskyt(
    "2026-08-28",
    testViceDnuPoDvoutydnech
  );

console.log(
  dalsiViceDnuPoDvoutydnech
    ?.toLocaleDateString("cs-CZ")
);