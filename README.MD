# LubaNote – Jazyky V1

## Co patch přidává

- výběr jazyka přímo na login page,
- Čeština + English,
- uloženou volbu jazyka v `localStorage`,
- možnost změnit jazyk i později v Nastavení,
- oddělený jazykový motor `i18n.js`,
- každý jazyk ve vlastním souboru `lang-xx.js`,
- lokalizaci hlavní navigace, loginu, nastavení, základních editorových ovladačů,
  kalendáře, připomínek a interních odkazů,
- data a názvy měsíců používají locale vybraného jazyka.

## Soubory

- `i18n.js` – pouze jazykový motor.
- `lang-cs.js` – čeština.
- `lang-en.js` – angličtina.

Překlady nejsou natvrdo rozházené po motoru.

## Jak později přidat další jazyk

Například slovenštinu:

1. zkopírovat `lang-en.js` jako `lang-sk.js`,
2. změnit `id` na `sk`, `locale` na `sk-SK`, název/vlajku a přeložit hodnoty,
3. v `index.html` přidat před `i18n.js` jeden řádek:

```html
<script src="lang-sk.js"></script>
```

Hotovo. Jazyk se automaticky objeví na login page i v Nastavení.
Současné GitHub Actions už kopírují všechny root `*.js`, takže workflow se kvůli
novému jazyku měnit nemusí.

## Výchozí jazyk

- pokud uživatel už jazyk zvolil, použije se uložená volba,
- jinak se zkusí jazyk telefonu/prohlížeče,
- pokud pro něj balíček neexistuje, použije se English (nebo první dostupný balíček).

## Poznámka k V1

V1 zavádí kompletní architekturu a překládá hlavní uživatelské rozhraní.
Pokud při testu English narazíš v některém hlubším servisním dialogu na českou větu,
není potřeba měnit architekturu – pouze se doplní další klíč do `lang-cs.js` a
`lang-en.js`. To je záměr: další jazykové rozšiřování už nesmí rozhazovat kód aplikace.
