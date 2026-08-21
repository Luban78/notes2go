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
      dny
    ) {
      const datumHledani =
        new Date(datum);
      
      let pocitadloDni = 0;
      
      while (pocitadloDni < 7) {
        datumHledani.setDate(
          datumHledani.getDate() + 1
        );
        
        pocitadloDni++;
        
        if (
          dny.includes(
            datumHledani.getDay()
          )
        ) {
          break;
        }
      }
      
      return datumHledani;
    }
    
    
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
  days: [1, 3, 5]
};

const dalsiVyskyt =
  vypocitejDalsiVyskyt(
    "2026-08-21",
    testOpakovani
  );

console.log(
  dalsiVyskyt.toLocaleDateString("cs-CZ")
);