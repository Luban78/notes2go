# LubaNote -- český slovník kódu

> **Účel tohoto souboru:** bezpečná studijní pomůcka.\
> Stávající funkční kód se **nepřejmenovává**. Tento dokument pouze
> vysvětluje anglické názvy česky a navrhuje české názvosloví pro **nový
> kód od této chvíle**.
>
> **Pravidlo pro další vývoj:** nové vlastní proměnné a funkce budeme,
> pokud to dává smysl, pojmenovávat česky bez diakritiky. Vestavěné
> názvy JavaScriptu, DOM API, Capacitoru, Supabase a datové klíče se
> nepřekládají.

## Jak slovník číst

-   **Původní název** = co dnes skutečně existuje v projektu.
-   **Česky / doporučený název** = jak tomu rozumět a jak bychom
    obdobnou novou věc pojmenovali.
-   Názvy v tomto dokumentu **nejsou pokynem k hromadnému přejmenování
    projektu**.
-   U krátkých lokálních proměnných jako `i`, `x`, `event`, `button`,
    `date` není nutné za každou cenu používat češtinu. Důležitější je
    čitelnost.

------------------------------------------------------------------------

# 1. `cardView.js` -- zobrazení karet

  ----------------------------------------------------------------------------------
  Původní název              Česky / doporučený název        Co dělá
  -------------------------- ------------------------------- -----------------------
  `applyCardView`            `nastavZobrazeniKaret`          Aplikuje zvolený režim
                                                             zobrazení karet.

  `updateCardViewButton`     `aktualizujTlacitkoZobrazeni`   Upraví tlačítko podle
                                                             aktuálního režimu.

  `changeViewButton`         `tlacitkoZmenyZobrazeni`        Tlačítko pro přepnutí
                                                             GRID/LIST.

  `cardView`                 `zobrazeniKaret`                Aktuální režim
                                                             zobrazení karet.

  `desktopCardLayoutMedia`   `dotazNaDesktopRozlozeni`       Media query používaná
                                                             pro desktopové
                                                             rozložení.
  ----------------------------------------------------------------------------------

# 2. `search.js` -- vyhledávání

  ---------------------------------------------------------------------------
  Původní název           Česky / doporučený název    Co dělá
  ----------------------- --------------------------- -----------------------
  `taskMatchesSearch`     `poznamkaOdpovidaHledani`   Zjistí, zda poznámka
                                                      odpovídá hledanému
                                                      textu.

  `searchNotes`           `poleHledaniPoznamek`       HTML pole pro hledání.

  `noSearchResults`       `zadneVysledkyHledani`      Prvek se zprávou, že
                                                      nic nebylo nalezeno.

  `searchText`            `hledanyText`               Text zadaný uživatelem
                                                      do hledání.

  `title`                 `nazev`                     Název poznámky při
                                                      porovnávání.

  `note`                  `poznamka`                  Text poznámky.

  `todos`                 `todoPolozky`               TODO položky poznámky.

  `visibleCardCount`      `pocetViditelnychKaret`     Počet karet, které po
                                                      filtrování zůstaly
                                                      viditelné.
  ---------------------------------------------------------------------------

# 3. `storage.js` -- lokální ukládání poznámek

  ----------------------------------------------------------------------------
  Původní název           Česky / doporučený název    Co dělá
  ----------------------- --------------------------- ------------------------
  `saveTask`              `ulozPoznamku`              Uloží novou poznámku.

  `loadTask`              `nactiPoznamky`             Načte poznámky z
                                                      lokálního úložiště.

  `deleteTask`            `smazPoznamku`              Smaže poznámku.

  `toggleTaskCompleted`   `prepniDokonceniPoznamky`   Přepne stav
                                                      dokončeno/nedokončeno.

  `updateTask`            `aktualizujPoznamku`        Aktualizuje existující
                                                      poznámku.

  `exportTasks`           `exportujPoznamky`          Exportuje poznámky.

  `importTasks`           `importujPoznamky`          Importuje poznámky.

  `saveAllTasks`          `ulozVsechnyPoznamky`       Uloží celý seznam
                                                      poznámek.

  `tasks`                 `poznamky`                  Kolekce poznámek.

  `savedTask`             `ulozenaPoznamka`           Právě ukládaná/uložená
                                                      poznámka.

  `parsedTask`            `nactenaPoznamka`           Poznámka převedená z
                                                      uložených dat.

  `importedTasks`         `importovanePoznamky`       Poznámky načtené z
                                                      importu.

  `normalizedTasks`       `normalizovanePoznamky`     Poznámky sjednocené do
                                                      očekávaného formátu.

  `importedAt`            `casImportu`                Čas importu.
  ----------------------------------------------------------------------------

# 4. `script.js` -- hlavní logika poznámek a editoru

  --------------------------------------------------------------------------------------------------
  Původní název                       Česky / doporučený název               Co dělá
  ----------------------------------- -------------------------------------- -----------------------
  `updateVisualViewport`              `aktualizujViditelnouOblast`           Reaguje na změny
                                                                             viditelné části
                                                                             obrazovky.

  `updateModalWeekday`                `aktualizujDenVTydnu`                  Aktualizuje text dne v
                                                                             týdnu podle data.

  `openTaskEditorById`                `otevriEditorPoznamkyPodleId`          Otevře konkrétní
                                                                             poznámku podle ID.

  `renderTasks`                       `vykresliPoznamky`                     Překreslí seznam/karty
                                                                             poznámek.

  `deleteConfirmModal`                `modalPotvrzeniSmazani`                Potvrzovací modal před
                                                                             smazáním.

  `cancelDeleteButton`                `tlacitkoZrusitSmazani`                Zruší mazání.

  `confirmDeleteButton`               `tlacitkoPotvrditSmazani`              Potvrdí smazání.

  `taskToDelete`                      `poznamkaKeSmazani`                    Poznámka, která se má
                                                                             smazat.

  `mainMenuButton`                    `tlacitkoHlavnihoMenu`                 Tlačítko hlavního menu.

  `mainMenu`                          `hlavniMenu`                           Hlavní servisní menu.

  `pinnedCards`                       `pripnuteKarty`                        Kontejner připnutých
                                                                             karet.

  `pinnedLeft`                        `pripnuteVlevo`                        Levý sloupec karet.

  `pinnedRight`                       `pripnuteVpravo`                       Pravý sloupec karet.

  `activeTaskIndex`                   `indexAktivniPoznamky`                 Index právě otevřené
                                                                             poznámky.

  `reminderEnabled`                   `pripominkaZapnuta`                    Informace, zda je
                                                                             připomínka aktivní.

  `editorBackButton`                  `tlacitkoZavritEditor`                 Uloží/zavře editor.

  `deleteTaskButton`                  `tlacitkoSmazatPoznamku`               Koš v editoru.

  `reminderButton`                    `tlacitkoPripominky`                   Zvonek v editoru.

  `importFile`                        `souborImportu`                        Soubor zvolený pro
                                                                             import.

  `modalTitle`                        `poleNazvuPoznamky`                    Název poznámky v
                                                                             editoru.

  `modalText`                         `poleTextuPoznamky`                    Původní textové pole
                                                                             poznámky.

  `modalRichText`                     `editorFormatovanehoTextu`             Rich-text editor
                                                                             poznámky.

  `modalDate`                         `poleData`                             Datum poznámky.

  `modalTime`                         `poleCasu`                             Čas poznámky.

  `modalWeekday`                      `denVTydnu`                            Zobrazený den v týdnu.

  `taskModal`                         `editorPoznamky`                       Celý modal/editor
                                                                             poznámky.

  `addTaskButton`                     `tlacitkoNovaPoznamka`                 Tlačítko pro vytvoření
                                                                             nové poznámky.

  `currentTask`                       `aktualniPoznamka`                     Právě zpracovávaná
                                                                             poznámka.

  `updatedTask`                       `aktualizovanaPoznamka`                Nová verze upravené
                                                                             poznámky.

  `newTask`                           `novaPoznamka`                         Nově vytvářená
                                                                             poznámka.

  `isEmpty`                           `jePrazdna`                            Určuje, zda je obsah
                                                                             prázdný.

  `longPressTimer`                    `casovacDlouhehoStisku`                Časovač long-press
                                                                             gesta.

  `LONG_PRESS_TIME`                   `CAS_DLOUHEHO_STISKU`                  Délka nutná pro dlouhý
                                                                             stisk.

  `selectedCardIndex`                 `indexVybraneKarty`                    Index karty vybrané pro
                                                                             akci.

  `blockNextCardClick`                `zablokujDalsiKlikKarty`               Brání kliknutí po
                                                                             long-press akci.

  `cardPressStartX`                   `zacatekStiskuKartyX`                  Počáteční X souřadnice
                                                                             dotyku.

  `cardPressStartY`                   `zacatekStiskuKartyY`                  Počáteční Y souřadnice
                                                                             dotyku.

  `CARD_LONG_PRESS_CANCEL_DISTANCE`   `VZDALENOST_ZRUSENI_DLOUHEHO_STISKU`   Maximální pohyb před
                                                                             zrušením long-press.

  `activeCardPointers`                `aktivniDotykyKaret`                   Eviduje aktivní
                                                                             pointery/dotyky.

  `currentTasks`                      `aktualniPoznamky`                     Aktuálně načtené
                                                                             poznámky.

  `loadedTasks`                       `nactenePoznamky`                      Načtený seznam
                                                                             poznámek.

  `sortedTasks`                       `serazenePoznamky`                     Seřazené poznámky.

  `loadedCard`                        `nactenaKarta`                         Vytvořená/načtená
                                                                             karta.

  `cardMenu`                          `menuKarty`                            Nabídka po dlouhém
                                                                             stisku karty.

  `loadedHeading`                     `nactenyNadpis`                        Nadpis karty.

  `areaIcon`                          `ikonaOblasti`                         Ikona pracovní/soukromé
                                                                             oblasti.

  `pinIcon`                           `ikonaPripnuti`                        Ikona připnutí.

  `reminderIcon`                      `ikonaPripominky`                      Ikona připomínky.

  `loadedNoteText`                    `nactenyTextPoznamky`                  Text zobrazený na
                                                                             kartě.

  `taskTodos`                         `todoPoznamky`                         TODO položky dané
                                                                             poznámky.

  `formattedDate`                     `formatovaneDatum`                     Datum připravené pro
                                                                             zobrazení.

  `loadedTags`                        `nacteneStitky`                        Štítky poznámky.

  `tagBadge`                          `odznakStitku`                         Vizuální štítek na
                                                                             kartě.

  `listMode`                          `rezimSeznamu`                         Informace, zda je
                                                                             aktivní LIST.

  `desktopCardLayout`                 `desktopoveRozlozeniKaret`             Rozložení karet na PC.

  `cardCount`                         `pocetKaret`                           Počet karet.

  `plannerModal`                      `modalPlanovani`                       Modal plánování.

  `plannerTaskTitle`                  `nazevPlanovanePoznamky`               Název v plánovacím
                                                                             modalu.

  `plannerDate`                       `datumPlanovani`                       Datum plánované
                                                                             položky.

  `plannerTime`                       `casPlanovani`                         Čas plánované položky.
  --------------------------------------------------------------------------------------------------

# 5. `tags.js` -- oblasti a štítky

  -----------------------------------------------------------------------------
  Původní název            Česky / doporučený název     Co dělá
  ------------------------ ---------------------------- -----------------------
  `updateAreaFilterUI`     `aktualizujFiltrOblasti`     Aktualizuje vzhled
                                                        filtru
                                                        pracovní/soukromé.

  `setActiveArea`          `nastavAktivniOblast`        Nastaví oblast
                                                        poznámky.

  `toggleTag`              `prepniStitek`               Přidá nebo odebere
                                                        štítek.

  `closeTagMenu`           `zavriMenuStitku`            Zavře panel štítků.

  `normalizeTagName`       `normalizujNazevStitku`      Upraví zadaný název
                                                        štítku do jednotného
                                                        tvaru.

  `loadTagsFromSupabase`   `nactiStitkyZeSupabase`      Načte štítky ze
                                                        synchronizovaných dat.

  `getAllTags`             `ziskejVsechnyStitky`        Vrátí všechny známé
                                                        štítky.

  `getAvailableTags`       `ziskejDostupneStitky`       Složí seznam štítků
                                                        dostupných pro výběr.

  `renderTagMenuTags`      `vykresliStitkyVMenu`        Vykreslí tlačítka
                                                        štítků v editoru.

  `updateTagMenuUI`        `aktualizujMenuStitku`       Aktualizuje stav menu a
                                                        ikonu oblasti.

  `taskMatchesArea`        `poznamkaOdpovidaOblasti`    Kontroluje filtr
                                                        oblasti.

  `taskMatchesTag`         `poznamkaOdpovidaStitku`     Kontroluje filtr
                                                        štítku.

  `renderTagFilters`       `vykresliFiltryStitku`       Vykreslí filtry štítků
                                                        na hlavní obrazovce.

  `updateTagFilterUI`      `aktualizujFiltrStitku`      Aktualizuje aktivní
                                                        filtr štítků.

  `openNewTagEditor`       `otevriEditorNovehoStitku`   Otevře řádek pro
                                                        vytvoření štítku.

  `closeNewTagEditor`      `zavriEditorNovehoStitku`    Zavře řádek nového
                                                        štítku.

  `createNewTag`           `vytvorNovyStitek`           Vytvoří/použije nový
                                                        štítek.

  `activeArea`             `aktivniOblast`              Oblast právě editované
                                                        poznámky.

  `activeTags`             `aktivniStitky`              Štítky právě editované
                                                        poznámky.

  `activeAreaFilter`       `aktivniFiltrOblasti`        Aktivní filtr oblasti
                                                        na hlavní obrazovce.

  `activeTagFilter`        `aktivniFiltrStitku`         Aktivní filtr štítku.

  `DEFAULT_TAGS`           `VYCHOZI_STITKY`             Výchozí štítky `code`,
                                                        `důležité`, `projekt`.

  `syncedTags`             `synchronizovaneStitky`      Štítky získané ze
                                                        synchronizovaných dat.

  `areaFilterButtons`      `tlacitkaFiltruOblasti`      Tlačítka filtrů
                                                        oblastí.

  `tagTaskButton`          `tlacitkoStitku`             Ikona 🏷️ v editoru.

  `tagMenu`                `menuStitku`                 Panel se štítky.

  `categoryTaskButton`     `tlacitkoOblasti`            Ikona 💼/🏠; nyní přímo
                                                        přepíná oblast.

  `tagOptions`             `moznostiStitku`             Kontejner možností
                                                        štítků.

  `createTagButton`        `tlacitkoNovyStitek`         Tlačítko „Nový štítek".

  `newTagRow`              `radekNovehoStitku`          Řádek pro zadání nového
                                                        štítku.

  `newTagInput`            `vstupNovehoStitku`          Textové pole názvu
                                                        štítku.

  `saveNewTagButton`       `tlacitkoUlozitNovyStitek`   Potvrdí nový štítek.

  `cancelNewTagButton`     `tlacitkoZrusitNovyStitek`   Zruší vytváření štítku.

  `tagFilterButtons`       `tlacitkaFiltruStitku`       Tlačítka filtrů štítků.

  `newTag`                 `novyStitek`                 Nově zadaný štítek.

  `existingTag`            `existujiciStitek`           Již existující shodný
                                                        štítek.

  `tagToUse`               `stitekKPouziti`             Výsledný štítek, který
                                                        se použije.
  -----------------------------------------------------------------------------

# 6. `settings.js` -- nastavení

  -----------------------------------------------------------------------------------------
  Původní název                       Česky / doporučený název      Co dělá
  ----------------------------------- ----------------------------- -----------------------
  `applyFontSize`                     `nastavVelikostPisma`         Aplikuje velikost
                                                                    písma.

  `applyTheme`                        `nastavMotiv`                 Aplikuje zvolený motiv.

  `decreaseFontButton`                `tlacitkoZmensitPismo`        Zmenšení písma.

  `increaseFontButton`                `tlacitkoZvetsitPismo`        Zvětšení písma.

  `fontSizeValue`                     `hodnotaVelikostiPisma`       Zobrazená velikost
                                                                    písma.

  `openThemeModalButton`              `tlacitkoOtevritMotivy`       Otevře výběr motivu.

  `currentThemeLabel`                 `popisekAktualnihoMotivu`     Zobrazuje název
                                                                    aktivního motivu.

  `openReminderDelaySettingsButton`   `tlacitkoNastaveniOdlozeni`   Otevře nastavení
                                                                    rychlého odložení.

  `settingsModal`                     `modalNastaveni`              Celá obrazovka/modal
                                                                    nastavení.

  `closeSettingsButton`               `tlacitkoZavritNastaveni`     Zavře nastavení.

  `settingsExportButton`              `tlacitkoExportu`             Export dat.

  `settingsImportButton`              `tlacitkoImportu`             Import dat.

  `currentFontSize`                   `aktualniVelikostPisma`       Aktuální velikost
                                                                    písma.
  -----------------------------------------------------------------------------------------

Již česky pojmenované funkce v tomto souboru: `ziskejPopisekMotivu`,
`nastavPopisekMotivu`, `otevriModalMotivu`, `ziskejPopisek`.

# 7. `choiceModal.js` -- společné výběrové modaly

Tento soubor už je z velké části česky.

  -----------------------------------------------------------------------
  Původní / současný název            Význam
  ----------------------------------- -----------------------------------
  `vytvorModalPokudChybi`             Vytvoří společný modal pouze při
                                      prvním použití.

  `zavriVyberovyModal`                Zavře společný výběrový modal.

  `otevriVyberovyModal`               Otevře jednoduchý modal s jedním
                                      výběrem.

  `otevriNastavovaciModal`            Otevře modal s více nastavitelnými
                                      položkami a tlačítkem Uložit.

  `modal`                             Překryv modalu.

  `dialog`                            Vnitřní dialogové okno.

  `nadpisElement`                     Element nadpisu.

  `moznostiElement`                   Kontejner možností.

  `zavritTlacitko`                    Tlačítko ✕.

  `predchoziFokus`                    Prvek, který měl fokus před
                                      otevřením modalu.

  `pracovniHodnoty`                   Dočasné hodnoty před potvrzením
                                      Uložit.
  -----------------------------------------------------------------------

# 8. `navigation.js` -- navigace

  -------------------------------------------------------------------------
  Původní název           Česky / doporučený název  Co dělá
  ----------------------- ------------------------- -----------------------
  `setActiveModule`       `nastavAktivniModul`      Přepíná Poznámky / Plán
                                                    / Připomínky.

  `closeMainMenu`         `zavriHlavniMenu`         Zavře menu ⋮.

  `showToast`             `zobrazHlaseni`           Zobrazí krátké
                                                    informační hlášení.

  `notesButton`           `tlacitkoPoznamky`        Tlačítko modulu
                                                    Poznámky.

  `plannerButton`         `tlacitkoPlan`            Tlačítko modulu Plán.

  `remindersButton`       `tlacitkoPripominky`      Tlačítko modulu
                                                    Připomínky.

  `notesScreen`           `obrazovkaPoznamek`       Obrazovka poznámek.

  `remindersScreen`       `obrazovkaPripominek`     Obrazovka připomínek.

  `searchRow`             `radekHledani`            Řádek hledání.

  `categoryTabs`          `filtryKategorii`         Řádek filtrů.

  `menuButton`            `tlacitkoMenu`            Tlačítko ⋮.

  `menu`                  `menu`                    Samotné menu.

  `settingsButton`        `tlacitkoNastaveni`       Otevře nastavení.

  `backupRestoreButton`   `tlacitkoZalohy`          Záloha/obnova.

  `aboutButton`           `tlacitkoOAplikaci`       Otevře informace o
                                                    aplikaci.

  `logoutButton`          `tlacitkoOdhlaseni`       Odhlášení uživatele.

  `toastTimer`            `casovacHlaseni`          Časovač skrytí toastu.

  `loginScreen`           `prihlasovaciObrazovka`   Přihlašovací obrazovka.
  -------------------------------------------------------------------------

# 9. `calendar.js` -- kalendář

  ----------------------------------------------------------------------------
  Původní název            Česky / doporučený název    Co dělá
  ------------------------ --------------------------- -----------------------
  `formatCalendarDate`     `formatujDatumKalendare`    Převede datum do
                                                       klíče/formátu
                                                       kalendáře.

  `loadCalendarItems`      `nactiPolozkyKalendare`     Načte položky pro
                                                       kalendář.

  `renderCalendar`         `vykresliKalendar`          Vykreslí měsíční
                                                       kalendář.

  `renderCalendarItems`    `vykresliPolozkyDne`        Vykreslí položky
                                                       vybraného dne.

  `renderCalendarAgenda`   `vykresliAgenduKalendare`   Vykreslí denní agendu.

  `calendarScreen`         `obrazovkaKalendare`        Obrazovka kalendáře.

  `calendarGrid`           `mrizkaKalendare`           Mřížka dnů.

  `calendarMonthTitle`     `nadpisMesice`              Název zobrazeného
                                                       měsíce.

  `calendarSelectedDate`   `vybraneDatumKalendare`     Zobrazení vybraného
                                                       data.

  `calendarPrevMonth`      `predchoziMesic`            Tlačítko předchozího
                                                       měsíce.

  `calendarNextMonth`      `dalsiMesic`                Tlačítko dalšího
                                                       měsíce.

  `calendarCurrentDate`    `aktualniMesicKalendare`    Datum určující právě
                                                       zobrazený měsíc.

  `calendarSelectedDay`    `vybranyDenKalendare`       Právě vybraný den.

  `plannedItems`           `naplanovanePolozky`        Naplánované položky.

  `firstDay`               `prvniDenMesice`            První den měsíce.

  `lastDay`                `posledniDenMesice`         Poslední den měsíce.

  `startOffset`            `pocatecniPosun`            Posun prvního dne v
                                                       kalendářní mřížce.
  ----------------------------------------------------------------------------

# 10. `planner.js` -- plánování

  -----------------------------------------------------------------------------------------------
  Původní název                         Česky / doporučený název          Co dělá
  ------------------------------------- --------------------------------- -----------------------
  `getLocalPlannedItems`                `ziskejLokalniPlanovanePolozky`   Načte starší lokální
                                                                          plánované položky.

  `loadPlannedItems`                    `nactiPlanovanePolozky`           Načte naplánované
                                                                          položky.

  `savePlannedItems`                    `ulozPlanovanePolozky`            Uloží naplánované
                                                                          položky.

  `migrateLocalPlannedItemsIntoNotes`   `prevedLokalniPlanDoPoznamek`     Migruje stará lokální
                                                                          data do současné
                                                                          struktury poznámek.

  `createPlannedItem`                   `vytvorPlanovanouPolozku`         Vytvoří plánovanou
                                                                          položku.

  `setPlannerDateTimeToNow`             `nastavPlanovaniNaAktualniCas`    Předvyplní aktuální
                                                                          datum a čas.

  `openPlannerForNote`                  `otevriPlanovaniPoznamky`         Otevře plánování pro
                                                                          konkrétní poznámku.

  `closePlanner`                        `zavriPlanovani`                  Zavře plánovací modal.

  `saveCurrentPlannedItem`              `ulozAktualniPlanovanouPolozku`   Uloží právě
                                                                          nastavovanou položku.

  `PLANNER_STORAGE_KEY`                 `KLIC_ULOZISTE_PLANU`             Klíč starého lokálního
                                                                          úložiště.

  `planSelectionButton`                 `tlacitkoPlanovatVyber`           📅 pro označenou část
                                                                          textu.

  `plannerSourceNoteId`                 `idZdrojovePoznamky`              ID poznámky, ze které
                                                                          plán vznikl.

  `plannerSourceType`                   `typZdrojePlanu`                  Určuje celou poznámku
                                                                          vs. výběr textu.

  `selectedPlannerText`                 `vybranyTextProPlan`              Označený text určený k
                                                                          naplánování.

  `plannedAt`                           `naplanovanoNa`                   Datum a čas
                                                                          naplánování.

  `plannedItem`                         `planovanaPolozka`                Jedna plánovaná
                                                                          položka.
  -----------------------------------------------------------------------------------------------

# 11. `plannedTextLinks.js` -- odkazy mezi poznámkou a plánem

  --------------------------------------------------------------------------------------------
  Původní název                         Česky / doporučený název       Co dělá
  ------------------------------------- ------------------------------ -----------------------
  `createPlannedTextLink`               `vytvorOdkazNaPlanovanyText`   Vytvoří HTML
                                                                       odkaz/označení
                                                                       plánovaného textu.

  `wrapCurrentSelectionAsPlannedLink`   `obalVyberOdkazemNaPlan`       Obalí aktuálně označený
                                                                       text odkazem na plán.

  `plannedItemId`                       `idPlanovanePolozky`           ID plánované položky.

  `plannedItem`                         `planovanaPolozka`             Plánovaná položka.

  `plannedDate`                         `datumPlanovanePolozky`        Datum položky.

  `snapshot`                            `snimekVyberu`                 Uložený stav označení
                                                                       textu.

  `range`                               `rozsahVyberu`                 DOM Range označeného
                                                                       textu.
  --------------------------------------------------------------------------------------------

# 12. `richTextColors.js` -- zvýrazňování textu

  ------------------------------------------------------------------------------
  Původní název              Česky / doporučený název    Co dělá
  -------------------------- --------------------------- -----------------------
  `isRangeInsideEditor`      `jeVyberUvnitEditoru`       Ověří, že označení leží
                                                         v editoru.

  `getTextOffset`            `ziskejPoziciVTextu`        Zjistí textový offset
                                                         výběru.

  `getSelectionSnapshot`     `ziskejSnimekVyberu`        Uloží informace o
                                                         aktuálním výběru.

  `saveCurrentSelection`     `ulozAktualniVyber`         Zapamatuje označený
                                                         text.

  `clearSelection`           `zrusVyber`                 Zruší uložený výběr.

  `unwrapHighlightMarks`     `odstranObalyZvyrazneni`    Rozbalí značky
                                                         zvýraznění.

  `wrapTextNodesWithColor`   `obalTextBarvou`            Obalí textové uzly
                                                         značkou s barvou.

  `cleanupHighlightMarkup`   `vycistiZnackyZvyrazneni`   Uklidí výsledné HTML.

  `transformSelection`       `upravVybranyText`          Provede transformaci
                                                         označeného textu.

  `applyColor`               `pouzijBarvu`               Aplikuje zvýraznění.

  `removeColor`              `odstranBarvu`              Odstraní zvýraznění.

  `syncPlainText`            `synchronizujProstyText`    Synchronizuje rich text
                                                         s prostým textem.

  `reset`                    `resetujZvyrazneni`         Resetuje interní stav
                                                         výběru.

  `savedRange`               `ulozenyRozsah`             Uložený DOM Range.

  `selectionLocked`          `vyberUzamcen`              Informace, zda se má
                                                         výběr držet.

  `textNodes`                `textoveUzly`               Textové DOM uzly.

  `colorButton`              `tlacitkoBarvy`             Jedno tlačítko barvy.
  ------------------------------------------------------------------------------

# 13. `reminders.js` -- připomínky a Android notifikace

## Hlavní funkce

  ---------------------------------------------------------------------------------------------------
  Původní název                         Česky / doporučený název              Co dělá
  ------------------------------------- ------------------------------------- -----------------------
  `requestNotificationPermission`       `vyzadejPovoleniNotifikaci`           Požádá systém o
                                                                              oprávnění k
                                                                              notifikacím.

  `createReminderChannel`               `vytvorKanalPripominek`               Vytvoří Android
                                                                              notification channel.

  `createUniqueNotificationId`          `vytvorJedinecneIdNotifikace`         Vygeneruje nekolidující
                                                                              ID notifikace.

  `scheduleNotification`                `naplanujNotifikaci`                  Naplánuje systémovou
                                                                              notifikaci.

  `cancelNotification`                  `zrusNotifikaci`                      Zruší naplánovanou
                                                                              notifikaci.

  `updateReminderButton`                `aktualizujTlacitkoPripominky`        Rozsvítí/zhasne zvonek
                                                                              podle stavu.

  `zapniPripominkuPoZmeneTerminu`       současný český název                  Automaticky zapne
                                                                              připomínku po změně
                                                                              termínu.

  `getReminderEntries`                  `ziskejPolozkyPripominek`             Složí seznam položek
                                                                              centra připomínek.

  `getActiveReminders`                  `ziskejAktivniPripominky`             Vrátí aktivní
                                                                              připomínky.

  `getReminderEntry`                    `ziskejPolozkuPripominky`             Najde konkrétní položku
                                                                              připomínky.

  `getReminderEntryByNotificationId`    `ziskejPripominkuPodleIdNotifikace`   Najde připomínku podle
                                                                              systémového ID.

  `formatReminderLocalDateTime`         `formatujMistniCasPripominky`         Formátuje lokální
                                                                              datum/čas.

  `getReminderTaskById`                 `ziskejPoznamkuPripominkyPodleId`     Najde zdrojovou
                                                                              poznámku.

  `getPlannedItemById`                  `ziskejPlanovanouPolozkuPodleId`      Najde plánovanou
                                                                              položku.

  `openReminderCenterEntry`             `otevriPolozkuCentraPripominek`       Otevře položku po
                                                                              kliknutí/notifikaci.

  `handleNotificationOpen`              `zpracujOtevreniNotifikace`           Reaguje na otevření
                                                                              systémové notifikace.

  `registerNotificationOpenHandler`     `zaregistrujOtevreniNotifikace`       Připojí posluchač
                                                                              otevření notifikace.

  `ensureFuturePlannedNotifications`    `zajistiBudouciNotifikacePlanu`       Kontroluje/plánuje
                                                                              budoucí notifikace.

  `closeReminderQuickMenu`              `zavriRychleMenuPripominky`           Zavře rychlé menu.

  `openReminderQuickMenu`               `otevriRychleMenuPripominky`          Otevře rychlé menu
                                                                              připomínky.

  `getSelectedReminderEntry`            `ziskejVybranouPripominku`            Vrátí právě vybranou
                                                                              položku.

  `saveReminderDate`                    `ulozDatumPripominky`                 Uloží nový termín běžné
                                                                              připomínky.

  `savePlannedReminderDate`             `ulozDatumPlanovanePripominky`        Uloží nový termín
                                                                              plánované položky.

  `postponeReminder`                    `odlozPripominku`                     Odloží připomínku o
                                                                              zvolený čas.

  `postponeReminderToTomorrowMorning`   `odlozPripominkuNaZitraRano`          Přesune na zítřek 8:00.

  `saveCustomReminderDate`              `ulozVlastniTerminPripominky`         Uloží ručně zvolené
                                                                              datum/čas.

  `disableSelectedNoteReminder`         `vypniVybranouPripominkuPoznamky`     Vypne reminder běžné
                                                                              poznámky.

  `updatePlannedLinkHtml`               `aktualizujHtmlOdkazuNaPlan`          Upraví backlink v rich
                                                                              textu.

  `completeSelectedPlannedReminder`     `dokoncitVybranouPlanovanouPolozku`   Označí plánovanou
                                                                              položku jako hotovou.

  `removeSelectedPlannedReminder`       `odstranVybranouPlanovanouPolozku`    Odstraní položku z
                                                                              plánu.

  `disableSelectedReminder`             `vypniVybranouPripominku`             Vypne/odstraní vybranou
                                                                              připomínku podle typu.

  `openPlannedSourceInEditor`           `otevriZdrojPlanuVEditoru`            Otevře zdrojovou
                                                                              poznámku a cílový text.

  `createReminderRow`                   `vytvorRadekPripominky`               Vytvoří jeden řádek
                                                                              seznamu.

  `renderRemindersScreen`               `vykresliObrazovkuPripominek`         Vykreslí celý modul
                                                                              Připomínky.

  `formatOdlozeni`                      současný český název                  Vytvoří čitelný popisek
                                                                              rychlého odložení.
  ---------------------------------------------------------------------------------------------------

## Důležité proměnné

  Původní název              Česky / doporučený název
  -------------------------- ----------------------------------
  `LocalNotifications`       **nepřekládat** -- Capacitor API
  `usedIds`                  `pouzitaId`
  `activeReminderFilter`     `aktivniFiltrPripominek`
  `selectedReminderEntry`    `vybranaPolozkaPripominky`
  `activeReminderStatus`     `stavAktivniPripominky`
  `reminderQuickMenu`        `rychleMenuPripominky`
  `reminderQuickTitle`       `nadpisRychlehoMenu`
  `reminderQuickDate`        `datumRychlehoMenu`
  `reminderQuickTime`        `casRychlehoMenu`
  `completeReminderButton`   `tlacitkoHotovoPripominky`
  `disableReminderButton`    `tlacitkoVypnoutPripominku`
  `rychleOdlozeni`           současný český název
  `tlacitkaOdlozeni`         současný český název
  `hodnotyOdlozeni`          současný český název
  `currentTask`              `aktualniPoznamka`
  `updatedTask`              `aktualizovanaPoznamka`
  `updatedItem`              `aktualizovanaPolozka`
  `originalDate`             `puvodniDatum`
  `baseDate`                 `vychoziDatum`
  `newDate`                  `noveDatum`
  `tomorrow`                 `zitra`
  `completedItem`            `dokoncenaPolozka`
  `overdueList`              `seznamProslych`
  `todayList`                `seznamDnes`
  `tomorrowList`             `seznamZitra`
  `laterList`                `seznamPozdeji`
  `overdueCount`             `pocetProslych`

# 14. `todos.js` -- TODO položky

## Hlavní funkce

  --------------------------------------------------------------------------------------------
  Původní název                   Česky / doporučený název             Co dělá
  ------------------------------- ------------------------------------ -----------------------
  `autoResizeTodoText`            `automatickyUpravVyskuTodoTextu`     Přizpůsobí výšku
                                                                       editovaného textu.

  `ensureTodoItemVisible`         `zajistiViditelnostTodoPolozky`      Posune obsah tak, aby
                                                                       položka nebyla
                                                                       schovaná.

  `scheduleTodoItemVisibility`    `naplanujKontroluViditelnostiTodo`   Odloženě zkontroluje
                                                                       viditelnost.

  `keepActiveTodoEditorVisible`   `udrzAktivniTodoViditelne`           Drží editovanou položku
                                                                       nad klávesnicí/lištou.

  `focusTodo`                     `zaměřTodo`                          Nastaví fokus na TODO
                                                                       položku.

  `resetTodos`                    `resetujTodo`                        Resetuje stav TODO
                                                                       editoru.

  `loadTodos`                     `nactiTodo`                          Načte TODO položky
                                                                       poznámky.

  `removeTodo`                    `odstranTodo`                        Odstraní TODO položku.

  `moveTodo`                      `presunTodo`                         Přesune položku v
                                                                       pořadí.

  `clearTodoLongPressTimer`       `zrusCasovacDlouhehoStiskuTodo`      Zruší časovač
                                                                       long-press.

  `clearPendingTodoDrag`          `zrusCekajiciPresunTodo`             Zruší připravovaný
                                                                       drag.

  `isTodoTextAlreadyEditing`      `jeTodoPraveEditovane`               Zjistí, zda je položka
                                                                       už v editaci.

  `closeOtherTodoEditors`         `zavriOstatniEditoryTodo`            Ukončí editaci
                                                                       ostatních položek.

  `enterTodoEditMode`             `zapniEditaciTodo`                   Přepne položku do
                                                                       editace.

  `leaveTodoEditMode`             `ukonciEditaciTodo`                  Ukončí editaci položky.

  `beginPendingTodoDrag`          `zahajPripravuPresunuTodo`           Připraví drag po
                                                                       long-press.

  `prepareTodoTouchLongPress`     `pripravDlouhyDotykTodo`             Připraví long-press na
                                                                       dotykové obrazovce.

  `findTrackedTouch`              `najdiSledovanyDotyk`                Najde správný touch
                                                                       podle ID.

  `handleTodoTouchMove`           `zpracujPohybDotykuTodo`             Reaguje na pohyb prstu.

  `handleTodoTouchEnd`            `zpracujKonecDotykuTodo`             Reaguje na zvednutí
                                                                       prstu.

  `handleTodoTouchCancel`         `zpracujZruseniDotykuTodo`           Reaguje na zrušení
                                                                       touch události.

  `removeTodoTouchListeners`      `odeberPosluchaceDotykuTodo`         Odpojí touch listenery.

  `prepareTodoMouseLongPress`     `pripravDlouhyStiskMysiTodo`         Připraví long-press
                                                                       myší.

  `handleTodoMouseMove`           `zpracujPohybMysiTodo`               Reaguje na pohyb myši.

  `handleTodoMouseUp`             `zpracujPusteniMysiTodo`             Reaguje na puštění
                                                                       tlačítka.

  `removeTodoMouseListeners`      `odeberPosluchaceMysiTodo`           Odpojí mouse listenery.

  `activateTodoDrag`              `aktivujPresunTodo`                  Aktivuje skutečný drag.

  `createTodoDragGhost`           `vytvorNahledPresouvanehoTodo`       Vytvoří plovoucí kopii
                                                                       položky.

  `positionTodoDragGhost`         `nastavPoziciNahleduTodo`            Umístí drag ghost.

  `updateTodoDropPlaceholder`     `aktualizujMistoVlozeniTodo`         Přesouvá placeholder
                                                                       podle pozice.

  `autoScrollTodoList`            `automatickyPosouvejTodoSeznam`      Scrolluje při tažení u
                                                                       okraje.

  `updateActiveTodoDrag`          `aktualizujAktivniPresunTodo`        Aktualizuje drag během
                                                                       pohybu.

  `getTodoDropIndex`              `ziskejCilovyIndexTodo`              Spočítá, kam se položka
                                                                       vloží.

  `cleanupTodoDrag`               `uklidPresunTodo`                    Odstraní dočasné drag
                                                                       prvky.

  `finishTodoDrag`                `dokoncitPresunTodo`                 Dokončí změnu pořadí.

  `getTodoItemIndex`              `ziskejIndexTodoPolozky`             Vrátí index položky.

  `refreshTodoIndexes`            `aktualizujIndexyTodo`               Přepočítá indexy po
                                                                       změně pořadí.

  `createTodoItem`                `vytvorTodoPolozku`                  Vytvoří DOM jedné TODO
                                                                       položky.

  `renderTodos`                   `vykresliTodo`                       Vykreslí celý TODO
                                                                       seznam.
  --------------------------------------------------------------------------------------------

## Důležité proměnné

  Původní název                       Česky / doporučený název
  ----------------------------------- ----------------------------------
  `todoList`                          `seznamTodo`
  `addTodoButton`                     `tlacitkoPridatTodo`
  `activeTodos`                       `aktivniTodoPolozky`
  `activeTodoEditorItem`              `aktivniEditovanaTodoPolozka`
  `draggedTodoIndex`                  `indexPresouvanehoTodo`
  `draggedTodoElement`                `presouvanyTodoElement`
  `todoDragGhost`                     `nahledPresouvanehoTodo`
  `todoDropPlaceholder`               `mistoVlozeniTodo`
  `todoDragActive`                    `presunTodoAktivni`
  `todoLongPressTimer`                `casovacDlouhehoStiskuTodo`
  `pendingTouchIdentifier`            `idSledovanehoDotyku`
  `pendingTodoIndex`                  `indexCekajicihoTodo`
  `pendingTodoElement`                `cekajiciTodoElement`
  `pendingStartX`                     `pocatecniX`
  `pendingStartY`                     `pocatecniY`
  `dragPointerOffsetY`                `posunUkazateleY`
  `suppressTodoClickUntil`            `blokujKlikTodoDo`
  `lastTouchTime`                     `casPoslednihoDotyku`
  `TODO_LONG_PRESS_TIME`              `CAS_DLOUHEHO_STISKU_TODO`
  `TODO_LONG_PRESS_CANCEL_DISTANCE`   `VZDALENOST_ZRUSENI_STISKU_TODO`
  `TODO_GHOST_LIFT`                   `ZVEDNUTI_NAHLEDU_TODO`
  `fromIndex`                         `puvodniIndex`
  `toIndex`                           `cilovyIndex`
  `checkbox`                          `zaskrtavaciPole`
  `cursorPosition`                    `poziceKurzoru`
  `textBefore`                        `textPredKurzorem`
  `textAfter`                         `textZaKurzorem`
  `newTodo`                           `noveTodo`
  `newItem`                           `novaPolozka`

# 15. `sync.js` -- synchronizace se Supabase

  -------------------------------------------------------------------------------------------
  Původní název                    Česky / doporučený název           Co dělá
  -------------------------------- ---------------------------------- -----------------------
  `getLocalNotesForSync`           `ziskejLokalniPoznamkyProSync`     Připraví lokální
                                                                      poznámky pro
                                                                      synchronizaci.

  `uploadLocalNoteToSupabase`      `nahrajPoznamkuDoSupabase`         Nahraje jednu poznámku
                                                                      do cloudu.

  `markNoteDeletedInSupabase`      `oznacPoznamkuSmazanouVSupabase`   Zapíše
                                                                      tombstone/smazání.

  `getCloudNotesForSync`           `ziskejCloudovePoznamkyProSync`    Načte poznámky ze
                                                                      Supabase.

  `convertCloudRowsToLocalNotes`   `prevedCloudoveRadkyNaPoznamky`    Převede databázové
                                                                      řádky do lokálního
                                                                      formátu.

  `createCloudNotesMap`            `vytvorMapuCloudovychPoznamek`     Vytvoří mapu poznámek
                                                                      podle ID.

  `mergeLocalAndCloudNotes`        `slucLokalniACloudovePoznamky`     Sloučí lokální a
                                                                      cloudová data.

  `syncNotes`                      `synchronizujPoznamky`             Provede synchronizaci.

  `startSync`                      `spustSynchronizaci`               Spustí synchronizační
                                                                      proces.

  `cloudNotes`                     `cloudovePoznamky`                 Poznámky z cloudu.

  `localNotes`                     `lokalniPoznamky`                  Poznámky v zařízení.

  `cloudRows`                      `cloudoveRadky`                    Řádky načtené z
                                                                      databáze.

  `cloudMap`                       `mapaCloudovychPoznamek`           Mapa podle ID.

  `mergedNotes`                    `sloucenePoznamky`                 Výsledek sloučení.

  `deletedIds`                     `idSmazanychPoznamek`              ID smazaných záznamů.

  `localTime`                      `lokalniCasZmeny`                  Čas lokální změny.

  `cloudTime`                      `cloudovyCasZmeny`                 Čas změny v cloudu.
  -------------------------------------------------------------------------------------------

# 16. `supabaseClient.js` -- přihlášení a klient Supabase

  ----------------------------------------------------------------------------------------
  Původní název                Česky / doporučený název            Co dělá
  ---------------------------- ----------------------------------- -----------------------
  `getCurrentUser`             `ziskejAktualnihoUzivatele`         Vrátí přihlášeného
                                                                   uživatele.

  `setLoginMessage`            `nastavPrihlasovaciHlaseni`         Zobrazí zprávu na
                                                                   loginu.

  `updateLoginScreen`          `aktualizujPrihlasovaciObrazovku`   Přepne UI podle stavu
                                                                   session.

  `SUPABASE_URL`               **nepřejmenovávat bez důvodu**      URL projektu Supabase.

  `SUPABASE_PUBLISHABLE_KEY`   **nepřejmenovávat bez důvodu**      Veřejný/publishable
                                                                   klíč.

  `supabaseClient`             `klientSupabase`                    Instance klienta
                                                                   Supabase.

  `loginScreen`                `prihlasovaciObrazovka`             Login UI.

  `loginForm`                  `prihlasovaciFormular`              Přihlašovací formulář.

  `loginEmail`                 `prihlasovaciEmail`                 Pole e-mailu.

  `loginPassword`              `prihlasovaciHeslo`                 Pole hesla.

  `loginButton`                `tlacitkoPrihlaseni`                Tlačítko Přihlásit.

  `loginMessage`               `prihlasovaciHlaseni`               Text chyb/stavu
                                                                   přihlášení.
  ----------------------------------------------------------------------------------------

------------------------------------------------------------------------

# 17. Anglické datové názvy -- význam, ale NEPŘEJMENOVÁVAT

Tyto názvy se často ukládají do `localStorage`, JSON nebo Supabase. Je
užitečné jim rozumět česky, ale jejich hromadné přejmenování by mohlo
rozbít kompatibilitu existujících dat.

  Datový název           Český význam
  ---------------------- ----------------------------
  `id`                   jedinečný identifikátor
  `user_id` / `userId`   ID uživatele
  `title`                název
  `note`                 text poznámky
  `richContent`          formátovaný HTML obsah
  `date`                 datum / datum a čas
  `area`                 oblast
  `tags`                 štítky
  `todos`                TODO položky
  `pinned`               připnuto
  `completed`            dokončeno
  `reminder`             připomínka zapnutá/vypnutá
  `notificationId`       ID systémové notifikace
  `plannedItems`         naplánované položky
  `plannedAt`            naplánováno na
  `sourceType`           typ zdroje
  `sourceNoteId`         ID zdrojové poznámky
  `updatedAt`            čas poslední změny
  `createdAt`            čas vytvoření
  `deletedAt`            čas smazání / tombstone

# 18. Názvy, které se nepřekládají

Tohle **není náš vlastní slovník**, ale jazyk/API. Necháváme beze změny:

`document`, `window`, `localStorage`, `JSON`, `Date`, `Math`, `Set`,
`Map`, `Promise`, `console`, `crypto`, `navigator`,
`requestAnimationFrame`, `setTimeout`, `clearTimeout`,
`addEventListener`, `removeEventListener`, `getElementById`,
`querySelector`, `querySelectorAll`, `createElement`, `append`,
`appendChild`, `classList`, `dataset`, `textContent`, `innerHTML`,
`hidden`, `focus`, `blur`, `preventDefault`, `stopPropagation`, `async`,
`await`, `try`, `catch`, `return`, `const`, `let`, `if`, `else`,
`forEach`, `find`, `filter`, `map`, `sort`, `includes`, `push`,
`splice`.

Stejně tak ponecháváme názvy externích služeb a API, například
`Supabase`, `Capacitor`, `LocalNotifications`.

# 19. Doporučený český styl pro nový kód

Od této chvíle můžeme nové vlastní funkce psát například takto:

``` js
function otevriDetailPoznamky() {
  // ...
}

function aktualizujTlacitkoPripominky() {
  // ...
}

const aktivniPoznamka = nactiAktivniPoznamku();
const vybraneDatum = new Date();
```

## Doporučené slovesné začátky funkcí

  Anglicky                    Česky
  --------------------------- ---------------------------
  `get...`                    `ziskej...`
  `load...`                   `nacti...`
  `save...`                   `uloz...`
  `create...`                 `vytvor...`
  `open...`                   `otevri...`
  `close...`                  `zavri...`
  `update...`                 `aktualizuj...`
  `render...`                 `vykresli...`
  `delete...` / `remove...`   `smaz...` / `odstran...`
  `toggle...`                 `prepni...`
  `set...`                    `nastav...`
  `apply...`                  `pouzij...` / `nastav...`
  `format...`                 `formatuj...`
  `sync...`                   `synchronizuj...`
  `start...`                  `spust...`
  `cancel...`                 `zrus...`
  `handle...`                 `zpracuj...`
  `find...`                   `najdi...`
  `reset...`                  `resetuj...`

# 20. Nejdůležitější pravidlo

**Funkční starý kód necháváme být.**

Tento slovník slouží k tomu, aby bylo možné starému kódu rozumět, aniž
bychom riskovali týdny oprav kvůli hromadnému přejmenování. Nové části
LubaNote budeme psát česky tam, kde jde o naše vlastní názvy, a zároveň
zachováme anglické názvy tam, kde jsou součástí JavaScriptu, HTML/DOM
API, externích knihoven nebo datového rozhraní.

Tak získáme postupně čitelnější český projekt **bez nebezpečné
jednorázové migrace**.
