LubaNote – sjednocení zbývajících ikon v4
=========================================

Patch navazuje na LubaNote-SVG-ikony-mobil-desktop-v3.
Je určen pro APK i desktop.

Nahraď / přidej:
- lubaIcons.js
- index.html
- reminders.js
- calendar.js
- tags.js
- script.js
- editorMedia.js
- editorToolbar.js
- choiceModal.js
- style.css

Přiložen je také aktualizovaný návod:
- LUBANOTE_SVG_IKONY_NAVOD.md

Co je převedeno na centrální SVG:
- Připomínky: filtry Pracovní/Soukromé, ikony položek, datum, čas, menu a akce
- Plán: šipky, opakování, kalendářové/časové volby
- Editor: spodní lišta, zámek, připnutí, TODO, štítky, barva, plánování, mazání
- Menu karet a hromadné akce
- Správa štítků: upravit / potvrdit / smazat
- Secret modaly a tajné štítky
- Výběrové modaly
- Obrázky a odkazy v editoru
- Čekací/potvrzovací stav akce
- zbývající close / back / next ovládací prvky v běžném UI

Záměrně se nemění:
- obsahové TODO checkboxy (☐/☑), protože představují stav TODO, ne dekorativní ikonu
- skryté vývojářské Debug/Visual Debug značky
- text „⚠️ konfliktní kopie“ v názvu konfliktní poznámky – je to datový/bezpečnostní marker synchronizace
