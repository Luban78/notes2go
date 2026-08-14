# LubaNote – mapa prvků projektu

**Účel:** rychlá orientace v projektu při práci ve SPCK.  
Když chci upravit konkrétní tlačítko, text, kartu nebo obrazovku, podívám se sem a hned vím, **co hledat** v `index.html`, `style.css` nebo JavaScriptu.

> Stav mapy: 12. 8. 2026 – po redesignu horní lišty LubaNote.

---

# 1. Nejdůležitější pravidlo hledání

V CSS:

- `#neco` = **ID** jednoho konkrétního prvku.
- `.neco` = **class / třída**, kterou může používat více prvků.
- `[data-neco="..."]` = prvek se speciálním datovým atributem.

Příklad:

```css
#mainMenuButton
```

= celé tlačítko se třemi tečkami.

```css
.mainMenuIcon
```

= pouze samotný symbol `⋮` uvnitř tlačítka.

Proto když chci posunout **jen tečky**, hledám `.mainMenuIcon`. Když chci změnit velikost/rámeček celého tlačítka, hledám `#mainMenuButton` nebo společné pravidlo `.searchActions > button`.

---

# 2. Rychlý slovník anglických názvů

| Anglicky v kódu | Co to znamená česky |
|---|---|
| `mainMenu` | hlavní nabídka |
| `button` | tlačítko |
| `icon` | ikona |
| `view` | pohled / zobrazení |
| `grid` | mřížka / dva sloupce |
| `list` | seznam / jeden sloupec |
| `card` | karta poznámky |
| `task` | poznámka / úkol |
| `note` | poznámka |
| `reminder` | připomínka |
| `planner` | plánování |
| `settings` | nastavení |
| `search` | hledání |
| `filter` | filtr |
| `tag` | štítek |
| `area` | oblast – pracovní/soukromá |
| `pin` / `pinned` | připnout / připnuté |
| `delete` | smazat |
| `modal` | překryvná obrazovka / dialog |
| `close` | zavřít |
| `login` | přihlášení |
| `logout` | odhlášení |
| `backup` | záloha |
| `restore` | obnova |
| `toast` | krátká dočasná zpráva |
| `drag` | tažení |
| `drop` | puštění při drag & drop |

---

# 3. Horní lišta aplikace

## Logo LubaNote

**Co vidím:** ikona LubaNote vlevo nahoře.

- HTML: `.moduleLogo`
- obrázek: `icons/lubanote.png`
- CSS: `.moduleLogo`
- soubor: `index.html`, `style.css`

---

## Tlačítko „Poznámky“

- ID: `#notesModuleButton`
- společná třída: `.moduleTab`
- aktivní stav: `.moduleTab.active`
- ikona uvnitř: `.moduleTabIcon`
- text uvnitř: `.moduleTabText`
- JavaScript: `navigation.js`

---

## Tlačítko „Plán“

- ID: `#plannerModuleButton`
- společná třída: `.moduleTab`
- JavaScript: `navigation.js`
- aktuálně zatím zobrazuje krátkou informaci, že se Plán připravuje.

---

## Tlačítko „Připomínky“

- ID: `#remindersModuleButton`
- společná třída: `.moduleTab`
- JavaScript: `navigation.js`
- aktuálně zatím zobrazuje krátkou informaci, že se přehled připomínek připravuje.

---

## Celý řádek modulů

Když chci měnit rozložení celé horní řady:

- `.moduleBar` = logo + všechny moduly
- `.moduleTabs` = jen tři tlačítka Poznámky / Plán / Připomínky
- `.moduleTab` = vzhled jednotlivých tlačítek

Šířky jednotlivých tlačítek jsou v CSS také přes:

```css
.moduleTabs .moduleTab:nth-child(1)
.moduleTabs .moduleTab:nth-child(2)
.moduleTabs .moduleTab:nth-child(3)
```

---

# 4. Vyhledávání a dvě tlačítka napravo

## Celý druhý řádek

- `.searchRow` = celý řádek hledání + dvě tlačítka
- `.searchBox` = box vyhledávání
- `.searchActions` = oblast se dvěma tlačítky napravo

---

## Vyhledávací pole

**Co vidím:** „Hledat poznámky…“

- ID inputu: `#searchNotes`
- box okolo: `.searchBox`
- lupa: `.searchIcon`
- JavaScript hledání: `search.js`
- funkce: `taskMatchesSearch(task)`

Křížek `X`, který Android/Chromium ukazuje při napsaném textu:

```css
#searchNotes::-webkit-search-cancel-button
```

---

## Přepínač jednoho / dvou sloupců

**Celé tlačítko:**

```css
#changeViewButton
```

Společný vzhled obou tlačítek vpravo:

```css
.searchActions > button
```

**Ikona čtyř čtverečků:**

```css
.cardGridIcon
.cardGridIcon span
```

JavaScript přepínání:

- soubor: `cardView.js`
- proměnná: `cardView`
- funkce: `applyCardView()`
- funkce: `updateCardViewButton()`
- uložený stav: `localStorage` → `cardView`

Režim jednoho sloupce v CSS:

```css
.pinnedCards.listView
```

### Důležité

Symbol `☰` pro návrat do jednoho sloupce je momentálně generován přímo v `cardView.js`.  
Čtyři čtverečky jsou generované jako `.cardGridIcon`.

---

## Tři tečky – hlavní servisní menu

**Celé tlačítko:**

```css
#mainMenuButton
```

**Jen samotné tři tečky:**

```css
.mainMenuIcon
```

Aktuální doporučený princip:

```css
.mainMenuIcon {
  display: inline-block;
  font-size: 1.8rem;
  transform: translate(...);
}
```

`transform` na `.mainMenuIcon` posouvá **jen tečky**.  
`transform` na `#mainMenuButton` posouvá **celé tlačítko**.

**Vyskakovací nabídka:**

- ID: `#mainMenu`
- CSS: `.mainMenu`
- JavaScript: `navigation.js` + část otevírání ve `script.js`

Položky menu:

| Co vidím | ID |
|---|---|
| ⚙️ Nastavení | `#fontSizeSettingsButton` |
| 💾 Záloha a obnova | `#backupRestoreButton` |
| ℹ️ O aplikaci | `#aboutAppButton` |
| 🚪 Odhlásit se | `#logoutButton` |

---

# 5. Filtry pod hledáním

## Celý řádek filtrů

```css
.categoryTabs
```

## Jednotlivé tlačítko filtru

```css
.categoryTab
```

Aktivní filtr:

```css
.categoryTab.active
```

Oblasti jsou v HTML přes:

```html
data-area-filter="all"
data-area-filter="work"
data-area-filter="private"
```

## Dynamické štítky

- kontejner: `#tagFilterButtons`
- JavaScript: `tags.js`
- funkce: `renderTagFilters()`
- aktivní štítek: `activeTagFilter`

---

# 6. Karty poznámek na hlavní obrazovce

## Celá oblast karet

- `#pinnedCards`
- `.pinnedCards`

Dva sloupce:

- `#pinnedLeft`
- `#pinnedRight`
- `.pinnedColumn`

## Jedna karta

```css
.taskCard
```

Název karty:

```css
.taskCard h3
```

Text poznámky:

```css
.taskNoteText
```

Štítky na kartě:

```css
.taskTags
.taskTag
```

Oblast pracovní/soukromá:

```css
.taskArea
```

Hotová poznámka:

```css
.completed
```

Karty vykresluje hlavně:

- `script.js`
- funkce: `renderTasks()`

---

# 7. Plovoucí tlačítko +

**Co vidím:** velké fialové `+` vpravo dole.

- ID: `#addTaskButton`
- CSS: `.addTaskButton`
- JavaScript: `script.js`

---

# 8. Editor poznámky

## Celá obrazovka editoru

- ID: `#taskModal`
- CSS: `.taskModal`
- vnitřní obsah: `.modalContent`

---

## Horní lišta editoru

Celý řádek:

```css
.editorTopBar
```

Datum a čas:

- `.dateTimeInputs`
- den týdne: `#modalWeekday` / `.modalWeekday`
- datum: `#modalDate`
- čas: `#modalTime`

Tlačítka napravo:

- kontejner: `.editorTopActions`
- 📌 připnout: `#pinTaskButton`
- 🔔 připomínka: `#reminderButton`
- ⋮ další možnosti: `#moreOptionsButton`

Aktivní připomínka:

```css
#reminderButton.active
```

---

## Název a text poznámky

Název:

```css
#modalTitle
```

Text:

```css
#modalText
```

JavaScript editoru je hlavně v `script.js`.

---

# 9. Spodní lišta editoru

Celá lišta:

```css
.editorBottomBar
```

Společný vzhled tlačítek:

```css
.editorBottomBar button
```

Jednotlivá tlačítka:

| Ikona / funkce | ID |
|---|---|
| ✔️ uložit a zavřít | `#editorBackButton` |
| 💼 / 🏠 oblast | `#categoryTaskButton` |
| ⭐ priorita | `#priorityTaskButton` |
| 🎨 barva | `#colorTaskButton` |
| 🏷️ štítky | `#tagTaskButton` |
| ☐ přidat TODO | `#addTodoButton` |
| 🗑️ smazat | `#deleteTaskButton` |

---

# 10. Oblasti a štítky v editoru

Vyskakovací menu:

- ID: `#tagMenu`
- CSS: `.tagMenu`
- JavaScript: `tags.js`

Pracovní / soukromé:

```css
.areaOptions
```

HTML používá:

```html
data-area="work"
data-area="private"
```

Štítky:

```css
.tagOptions
.tagOptions button
.tagOptions button.active
```

HTML používá například:

```html
data-tag="code"
data-tag="důležité"
data-tag="projekt"
```

---

# 11. TODO systém

Hlavní kontejner:

- ID: `#todoList`
- CSS: `.todoList`
- JavaScript: `todos.js`

Jedna TODO položka:

```css
.todoItem
```

Checkbox:

```css
.todoItem input[type="checkbox"]
```

Text bez editace:

```css
.todoTextDisplay
```

Editační pole:

```css
.todoTextInput
```

Právě editovaný text:

```css
.todoTextInput.todoEditing
```

Dokončená TODO položka:

```css
.todoItem.todoCompleted
```

Drag & drop:

```css
.todoItem.dragSource
.todoDropPlaceholder
.todoDragGhost
.todoDragging
```

### JavaScript TODO

Vše hlavní je v `todos.js`.

Důležité funkce:

- `renderTodos()` – vykreslení TODO
- `createTodoItem()` – vytvoření jednoho řádku
- `focusTodo()` – zaměření konkrétní položky
- `moveTodo()` – změna pořadí
- `enterTodoEditMode()` – editace textu
- `leaveTodoEditMode()` – ukončení editace
- `activateTodoDrag()` – zahájení drag & drop
- `finishTodoDrag()` – dokončení drag & drop

**TODO systém je citlivá a již fungující část – měnit opatrně.**

---

# 12. Menu karty po dlouhém stisku

Celé menu:

- ID: `#cardMenu`
- CSS: `.cardMenu`

Jednotlivé akce nemají ID, používají `data-card-action`:

```html
data-card-action="plan"
data-card-action="pin"
data-card-action="complete"
data-card-action="delete"
```

Význam:

- `plan` = 📅 Naplánovat
- `pin` = 📌 Připnout
- `complete` = ✅ Hotovo
- `delete` = 🗑️ Smazat

Logika je hlavně v `script.js`.

---

# 13. Potvrzení smazání

Celý modal:

- ID: `#deleteConfirmModal`
- CSS: `.deleteConfirmModal`

Box:

```css
.deleteConfirmBox
```

Tlačítka:

- Zrušit: `#cancelDeleteButton`
- Smazat: `#confirmDeleteButton`

Kontejner tlačítek:

```css
.deleteConfirmActions
```

---

# 14. Nastavení

Celá obrazovka:

- ID: `#settingsModal`
- CSS: `.settingsModal`
- obsah: `.settingsContent`

Hlavička:

- `.settingsHeader`
- zavřít: `#closeSettingsButton`

Sekce:

```css
.settingsSection
```

## Velikost písma

- `.fontSizeSetting`
- `.fontSizeControl`
- zmenšit: `#decreaseFontButton`
- hodnota: `#fontSizeValue`
- zvětšit: `#increaseFontButton`

Logika: `settings.js`

Ukládá se do:

```text
localStorage → fontSize
```

## Barevný motiv

- `.themeSetting`
- `.themeOptions`
- HTML: `data-theme="light"`, `dark`, `cappuccino`
- JavaScript: `settings.js`

CSS motivy:

```css
body.theme-dark
body.theme-cappuccino
```

Ukládá se do:

```text
localStorage → theme
```

## Data / zálohy

Sekce:

```css
#dataSettingsSection
```

Tlačítka:

- export: `#settingsExportButton`
- import: `#settingsImportButton`
- skrytý výběr souboru: `#importFile`

Logika: `settings.js` + `storage.js`

---

# 15. Přihlašovací obrazovka

Celá obrazovka:

- ID: `#loginScreen`
- CSS: `#loginScreen`

Karta:

```css
.loginCard
```

Logo + název:

```css
.loginBrand
.loginLogoImage
```

Pole:

- e-mail: `#loginEmail`
- heslo: `#loginPassword`
- přihlásit: `#loginButton`
- zpráva/chyba: `#loginMessage`

Formulář:

```text
#loginForm
```

Logika přihlášení:

```text
supabaseClient.js
```

---

# 16. O aplikaci

Celý modal:

- ID: `#aboutModal`
- CSS: `.aboutModal`

Karta:

```css
.aboutCard
```

Logo:

```css
.aboutLogo
```

Zavřít:

- ID: `#closeAboutButton`
- CSS: `.aboutCloseButton`

Otevření z menu:

- `#aboutAppButton`
- logika: `navigation.js`

---

# 17. Krátké zprávy „toast“

Například „📅 Plán připravujeme“.

- ID: `#appToast`
- CSS: `.appToast`
- JavaScript: `navigation.js`
- funkce: `showToast(message)`

---

# 18. Připomínky / Android notifikace

Soubor:

```text
reminders.js
```

Důležité funkce:

- `requestNotificationPermission()`
- `createReminderChannel()`
- `scheduleNotification()`
- `cancelNotification()`
- `updateReminderButton()`
- `getReminderEntries()` – spojuje připomínky celých poznámek a položky Planneru
- `renderRemindersScreen()` – vykreslí Po termínu / Dnes / Zítra / Později
- `openReminderQuickMenu()` – správa konkrétní připomínky / plánovaného úkolu
- `completeSelectedPlannedReminder()` – dokončí jen konkrétní planned item
- `handleNotificationOpen()` – po klepnutí na Android notifikaci otevře modul Připomínky

Tlačítko v editoru:

```text
#reminderButton
```

Obrazovka Připomínky:

```text
#remindersScreen
#remindersOverdue
#remindersToday
#remindersTomorrow
#remindersLater
#reminderQuickMenu
#completeReminderButton
```

Naplánovaná označená část textu (`sourceType: "selection"`) je samostatný úkol.
Po akci **Hotovo** se dokončí pouze daný planned item a propojený
`.plannedTextLink` v původní poznámce dostane třídu
`.plannedTextLinkCompleted` (podtržení + přeškrtnutí).

---

# 19. Vyhledávání

Soubor:

```text
search.js
```

Hlavní funkce:

```text
taskMatchesSearch(task)
```

Hledá v:

- názvu poznámky,
- textu poznámky,
- TODO položkách.

Pole:

```text
#searchNotes
```

Zpráva při nulovém výsledku:

```text
#noSearchResults
```

---

# 20. Lokální ukládání poznámek

Soubor:

```text
storage.js
```

Důležité funkce:

- `saveTask(task)` – uloží novou poznámku
- `loadTask()` – načte všechny
- `deleteTask(index)` – smaže lokálně
- `toggleTaskCompleted(index)` – hotovo / nehotovo
- `updateTask(index, updatedTask)` – aktualizace
- `saveAllTasks(tasks)` – přepíše celý seznam
- `exportTasks()` – export zálohy
- `importTasks(file)` – import zálohy

Hlavní localStorage klíč:

```text
savedTask
```

---

# 21. Supabase a synchronizace

## Připojení + login

Soubor:

```text
supabaseClient.js
```

Obsahuje klienta Supabase, přihlášení a zjištění aktuálního uživatele.

Důležitá funkce:

```text
getCurrentUser()
```

## Synchronizace poznámek

Soubor:

```text
sync.js
```

Důležité funkce:

- `uploadLocalNoteToSupabase(note)`
- `markNoteDeletedInSupabase(note)`
- `getCloudNotesForSync()`
- `mergeLocalAndCloudNotes(...)`
- `syncNotes()`

---

# 22. Hlavní JavaScript aplikace

Soubor:

```text
script.js
```

Řeší především:

- otevření/zavření editoru,
- vytvoření poznámky,
- editaci poznámky,
- vykreslování karet,
- dlouhý stisk karty,
- hlavní menu karty,
- mazání,
- připnutí,
- základní ovládání poznámek.

Nejdůležitější funkce:

```text
renderTasks()
```

### Důležité – pořadí karet v GRID režimu

Tuto logiku zbytečně neměnit:

```js
const listMode =
  localStorage.getItem("cardView") === "list";

if (listMode) {
  pinnedLeft.append(loadedCard);
} else {
  const cardCount =
    pinnedLeft.children.length +
    pinnedRight.children.length;

  if (cardCount % 2 === 0) {
    pinnedLeft.append(loadedCard);
  } else {
    pinnedRight.append(loadedCard);
  }
}
```

---

# 23. Navigace LubaNote

Soubor:

```text
navigation.js
```

Řeší:

- Poznámky / Plán / Připomínky,
- zavírání servisního menu,
- Záloha a obnova,
- O aplikaci,
- Odhlásit se,
- krátké toast zprávy.

---

# 24. Android – co hledat mimo HTML/CSS/JS

## Fullscreen + průhledná Android navigace

```text
android/app/src/main/java/cz/luban/notes2go/MainActivity.java
```

Tady je nativní nastavení fullscreen/edge-to-edge a průhledné systémové navigace.

---

## Název aplikace Android

```text
android/app/src/main/res/values/strings.xml
```

Důležité položky:

```text
app_name
title_activity_main
```

---

## Ikony aplikace na ploše telefonu

Složky:

```text
android/app/src/main/res/mipmap-mdpi/
android/app/src/main/res/mipmap-hdpi/
android/app/src/main/res/mipmap-xhdpi/
android/app/src/main/res/mipmap-xxhdpi/
android/app/src/main/res/mipmap-xxxhdpi/
```

Soubory například:

```text
ic_launcher.png
ic_launcher_foreground.png
ic_launcher_round.png
```

---

## Logo používané uvnitř webové aplikace

```text
icons/lubanote.png
```

Používá se v:

- horní liště,
- loginu,
- O aplikaci.

---

# 25. Capacitor

Konfigurace:

```text
capacitor.config.json
```

Důležité položky:

```text
appId
appName
webDir
```

Aktuální `webDir`:

```text
www
```

`www/` je buildová složka a Git ji ignoruje.

---

# 26. GitHub Actions – Android APK

Workflow:

```text
.github/workflows/android-debug.yml
```

Důležité: SPCK token workflow soubory neupravuje. Workflow změny dělat přes Acode/AcodeX.

Příprava webových souborů pro APK obsahuje:

```sh
mkdir -p www
cp index.html style.css *.js www/
cp -r icons www/
```

Proto se nové root `.js` soubory automaticky dostanou do Android buildu.

---

# 27. Přehled souborů – co který dělá

| Soubor | Hlavní účel |
|---|---|
| `index.html` | všechny prvky a struktura obrazovek |
| `style.css` | vzhled celé aplikace |
| `script.js` | hlavní logika poznámek a karet |
| `cardView.js` | přepínání 1 / 2 sloupce |
| `navigation.js` | horní moduly + hlavní servisní menu |
| `search.js` | vyhledávání |
| `tags.js` | oblasti a štítky |
| `todos.js` | kompletní TODO systém |
| `settings.js` | motiv + velikost písma + nastavení |
| `storage.js` | localStorage + export/import |
| `reminders.js` | Android notifikace / připomínky |
| `supabaseClient.js` | Supabase klient + login |
| `sync.js` | cloud synchronizace poznámek |
| `icons/lubanote.png` | logo uvnitř aplikace |

---

# 28. Nejčastější prvky – super rychlá mapa

Když nevím, co hledat, začnu tady:

```text
Logo nahoře                  .moduleLogo
Poznámky nahoře              #notesModuleButton
Plán nahoře                  #plannerModuleButton
Připomínky nahoře            #remindersModuleButton
Celá horní řada              .moduleBar
Hledání                      #searchNotes
Box hledání                  .searchBox
Tlačítka vedle hledání       .searchActions
Přepínač karet               #changeViewButton
4 čtverečky                  .cardGridIcon
Tři tečky – celé tlačítko    #mainMenuButton
Tři tečky – jen symbol       .mainMenuIcon
Popup menu                   .mainMenu / #mainMenu
Filtry                       .categoryTabs
Jeden filtr                  .categoryTab
Karta poznámky               .taskCard
Text karty                   .taskNoteText
Plovoucí +                   #addTaskButton / .addTaskButton
Editor                       #taskModal / .taskModal
Název v editoru              #modalTitle
Text v editoru               #modalText
Datum                        #modalDate
Čas                          #modalTime
Připomínka                   #reminderButton
Připnout                     #pinTaskButton
Spodní lišta editoru         .editorBottomBar
TODO seznam                  #todoList / .todoList
Jedno TODO                   .todoItem
Editace TODO                 .todoTextInput
Menu štítků                  #tagMenu / .tagMenu
Menu dlouhého stisku         #cardMenu / .cardMenu
Potvrzení smazání            #deleteConfirmModal
Nastavení                    #settingsModal / .settingsModal
Login                        #loginScreen / .loginCard
O aplikaci                   #aboutModal / .aboutModal
Krátká zpráva                #appToast / .appToast
```

---

# 29. Jak postupovat, když chci něco upravit

Příklad: **„Chci posunout tři tečky.“**

1. Otevřu tento soubor.
2. Najdu „Tři tečky“.
3. Vidím `.mainMenuIcon`.
4. Ve SPCK otevřu `style.css`.
5. Vyhledám přesně:

```text
.mainMenuIcon
```

6. Upravuji pouze tento blok.

Příklad: **„Chci změnit funkci přepínače karet.“**

1. Najdu „Přepínač karet“.
2. Vidím `#changeViewButton` + `cardView.js`.
3. Vzhled řeším ve `style.css`.
4. Funkci řeším v `cardView.js`.

---

# 30. Poznámka k aktualizaci této mapy

Když vytvoříme nový významný prvek, přidáme ho i sem.  
Tento soubor je **vývojářská dokumentace**, aplikace ho ke svému běhu nepotřebuje.

Doporučený název v kořeni projektu:

```text
LUBANOTE_MAPA_PRVKU.md
```

