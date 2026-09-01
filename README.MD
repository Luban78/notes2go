# LubaNote – Jazyky V1.1: oprava nalezených nepřeložených textů

Navazuje na `LubaNote_patch_jazyky_V1_login.zip`.

## Opraveno podle screenshotů

- Připomínky:
  - Vše -> All
  - Aktivní -> Active
  - Po termínu -> Overdue
  - Dnes -> Today
  - Zítra -> Tomorrow
  - Později -> Later
  - Žádné připomínky. -> No reminders.
  - Žádné připomínky po termínu. -> No overdue reminders.
- Planner:
  - `36. week` -> `Week 36`
- Štítky:
  - `+ Nový štítek` -> `+ New tag`
  - `Nový štítek` -> `New tag`
  - `Název štítku` -> `Tag name`
  - připraven i překlad `Nový tajný štítek`
- Secret informační dialogy:
  - `Tajný režim` -> `Secret mode`
  - `Tajný režim byl zamčen.` -> `Secret mode was locked.`
  - `Tajný režim je odemčený.` -> `Secret mode is unlocked.`
  - doplněny i další běžné Secret hlášky.

## Technická změna

`zobrazZpravuAplikace()` nyní překládá dynamicky vytvořený nadpis i text přes `LubaNoteI18n.prelozText()`. Díky tomu lze další dynamické hlášky doplňovat do `texty` v jazykovém souboru bez úprav každého dialogu zvlášť.

Připomínky a horní tlačítko `+ Nový štítek` se při změně jazyka znovu vykreslí.

## Instalace

Nahraď kompletní soubory z tohoto ZIPu:

- `i18n.js`
- `lang-cs.js`
- `lang-en.js`
- `reminders.js`
- `calendar.js`
- `script.js`
- `tags.js`

Potom znovu sestav APK / obnov web.

Poznámka: názvy uživatelských poznámek, TODO položek, oblastí a uživatelských štítků se záměrně nepřekládají.
