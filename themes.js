async function nactiTemata() {
  const odpoved = await fetch("theme.css");
  const cssText = await odpoved.text();
  
  //console.log(cssText);
  
  const radky = cssText.split("\n");
  const radkyTemat = radky.filter(radek =>
  radek.includes("THEME:")
);

//console.log(radkyTemat);
const temata = radkyTemat.map(radek => {
  const cistyRadek = radek
    .replace("/*", "")
    .replace("*/", "")
    .replace("THEME:", "")
    .trim();

  const casti = cistyRadek.split("|");

  return {
    id: casti[0].trim(),
    nazev: casti[1].trim(),
    typ: casti[2].trim()
  };
});

//console.log(temata);
const volitelnaTemata = temata.filter(tema =>
  tema.typ === "selectable"
);

//console.log(volitelnaTemata);

return volitelnaTemata;
}

nactiTemata();