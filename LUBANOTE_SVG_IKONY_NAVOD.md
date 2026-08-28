# LubaNote – SVG ikony: centrální systém

## Kde jsou všechny ikony

Společná knihovna pro mobil, APK i desktop je v:

`lubaIcons.js`

SVG nepoužívají vlastní pevnou barvu. Kreslí přes `currentColor`, takže barvu řídí CSS a aktivní motiv LubaNote.

## Aktuální názvy ikon

Základní navigace a moduly:

- `domov`
- `poznamky`
- `modulPoznamky`
- `kalendar`
- `zvonek`
- `hledat`
- `oblibene`
- `stitky`
- `nastaveni`
- `zaloha`
- `prace`
- `soukrome`
- `mrizka`
- `seznam`
- `vice`
- `razeni`
- `info`
- `odhlasit`

Stavy a akce:

- `pripnout`
- `odepnout`
- `zamek`
- `odemceno`
- `opakovat`
- `smazat`
- `upozorneni`
- `hodiny`
- `hotovo`
- `zavrit`
- `paleta`
- `upravit`
- `plus`
- `vypnoutZvonek`
- `obnovit`
- `zpet`
- `oznacit`
- `sipkaVlevo`
- `sipkaVpravo`
- `minus`

Editor a obsah:

- `obrazek`
- `fotoaparat`
- `odkaz`
- `todo`
- `dokument`
- `odrazky`

Kompletní seznam lze kdykoliv vypsat v konzoli:

```js
LubaNoteIcons.seznamIkon()
```

## Použití v HTML

```html
<span data-luba-icon="zvonek" aria-hidden="true"></span>
```

`lubaIcons.js` vloží SVG automaticky.

## Použití v JavaScriptu

Vytvoření nového hostitele:

```js
const ikona = LubaNoteIcons.vytvorHostitele(
  "pripnout",
  ["mojeIkona"]
);

kontejner.append(ikona);
```

Vložení ikony do existujícího prvku:

```js
LubaNoteIcons.vlozIkonu(
  existujiciElement,
  "nastaveni"
);
```

Tlačítko s ikonou a textem:

```js
LubaNoteIcons.nastavObsahSIkonou(
  tlacitko,
  "smazat",
  "Smazat"
);
```

Pouze ikona:

```js
LubaNoteIcons.nastavJenIkonu(
  tlacitko,
  "zavrit"
);
```

## Velikost a barva

```css
.mojeIkona {
  width: 20px;
  height: 20px;
  color: var(--color-accent);
}
```

Díky `stroke="currentColor"` se stejná SVG kresba automaticky přizpůsobí Light, Dark, Ocean, Cappuccino i Secret režimu.

## Pravidlo LubaNote

Systémové akce, navigace, stavy, modaly a ovládání používají SVG z `lubaIcons.js`.

Uživatelské barevné štítky (`code`, `LubaNote`, `projekt`...) zůstávají bez ikon, aby se seznam štítků nepřeplnil.

TODO checkboxy a skutečné odrážky nejsou dekorativní ikony – zůstávají součástí obsahu/ovládání.
