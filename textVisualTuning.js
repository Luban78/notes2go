/* ==================================================
   LubaNote – TEXTY / živé ladění typografie
   PATCH 658BK
   - oddělené hodnoty Mobil / PC
   - všechny hodnoty v rem
   - žádný zásah do dat, syncu ani editorové logiky
================================================== */
(() => {
  "use strict";

  const KLIC = "lubanoteTextVisualTuningV5";
  const STYLE_ID = "ln-text-visual-style";
  const DESKTOP_MEDIA = "(min-width: 1100px) and (hover: hover) and (pointer: fine)";
  const desktopMql = window.matchMedia(DESKTOP_MEDIA);

  const E = (id, label, selector, vychozi, min = 0.5, max = 2.8, step = 0.05, property = "font-size") => ({
    id,
    label,
    selector,
    vychozi,
    min,
    max,
    step,
    property
  });

  const KONFIG = {
    mobile: {
      label: "Mobil / APK",
      groups: [
        {
          id: "navigation",
          label: "Navigace a hlavní plocha",
          items: [
            E("modules", "Horní moduly – Poznámky / Plán / Dokumenty", ".moduleTabText", 0.85),
            E("search", "Hledání", "#searchNotes", 0.95),
            E("primaryFilter", "Hlavní filtr – Vše", ".categoryTabs > .categoryTab:not(.categoryTabIconOnly)", 1.1),
            E("tags", "Vlastní štítky", "#tagFilterButtons .categoryTab", 0.94),
            E("mainMenu", "Hlavní menu – položky", ".mainMenuLabel", 0.9),
            E("mainMenuInfo", "Hlavní menu – pomocný text", ".accountPlanMenuInfo, .accountPlanMenuBadge", 0.78),
            E("traffic", "RX / TX / E panel", ".syncTrafficBar", 0.63),
            E("toast", "Krátké hlášky / toast", ".appToast", 0.88)
          ]
        },
        {
          id: "notes",
          label: "Poznámky a karty",
          items: [
            E("cardTitle", "Karta – název", ".taskCard h3", 0.9),
            E("cardBody", "Karta – text", ".taskCard .taskNoteText", 1),
            E("cardMeta", "Karta – datum / metadata", ".taskCard p:not(.taskNoteText)", 0.81),
            E("cardTag", "Karta – štítek", ".taskTag", 0.81),
            E("cardMenu", "Menu karty", ".cardMenu button", 1),
            E("noResults", "Prázdný výsledek hledání", "#noSearchResults", 1),
            E("backlinksTitle", "Odkazy – nadpis", ".noteBacklinksTitle", 0.82),
            E("backlinksName", "Odkazy – název poznámky", ".noteBacklinkName", 0.88)
          ]
        },
        {
          id: "editor",
          label: "Editor",
          items: [
            E("editorTitle", "Editor – název poznámky", "#modalTitle", 1.5, 0.8, 3.2),
            E("editorBody", "Editor – běžný text", ".ln-v2-editor", 1.15, 0.7, 2.4),
            E("editorDateTime", "Editor – datum / čas", ".editorTopBar .dateTimePickerButton > span:last-child", 0.88),
            E("editorToolbar", "Editor – text tlačítek panelu", ".editorTopBar .editorToolbarPanel .editorPanelVolba", 1),
            E("selectionMenu", "Výběr textu – Vyjmout / Kopírovat / Vložit", ".selectionMenu button", 0.81),
            E("heading1", "Editor – Nadpis H1", ".editorNadpis.h1", 2, 1.0, 3.5),
            E("heading2", "Editor – Nadpis H2", ".editorNadpis.h2", 1.6, 0.9, 3.2),
            E("heading3", "Editor – Nadpis H3", ".editorNadpis.h3", 1.3, 0.8, 2.8),
            E("editorLinkDialog", "Editor – dialog odkazu", ".editorLinkDialog input, .editorLinkDialog textarea, .editorLinkActions button", 1)
          ]
        },
        {
          id: "planner",
          label: "Plán / Kalendář",
          items: [
            E("plannerTabs", "Kalendář / Připomínky", ".plannerSubnavButton > span:last-child", 1),
            E("calendarMonth", "Kalendář – měsíc", ".calendarHeader h2", 1.1),
            E("calendarWeekdays", "Kalendář – Po / Út / St…", ".calendarWeekdays", 0.81),
            E("calendarDay", "Kalendář – čísla dnů", ".calendarDay", 0.9),
            E("calendarSelectedDate", "Plán – datum vybraného dne", ".calendarSelectedDateButton", 0.9),
            E("calendarWeek", "Plán – číslo týdne", ".calendarWeekNumber", 0.9),
            E("agendaHeading", "Agenda – nadpis", ".calendarAgenda h3", 1.06),
            E("agendaItem", "Agenda – úkoly", ".calendarAgendaItem", 1),
            E("plannerQuickTitle", "Rychlý panel úkolu – nadpis", ".reminderQuickPlannerTask .reminderQuickHeader h3", 1.18),
            E("plannerQuickButtons", "Rychlý panel úkolu – tlačítka", ".reminderQuickPlannerTask button", 0.95)
          ]
        },
        {
          id: "reminders",
          label: "Připomínky",
          items: [
            E("reminderFilter", "Filtry Připomínek", ".remindersFilter", 0.94),
            E("reminderStatus", "Aktivní / Po termínu", ".remindersStatusTab", 0.88),
            E("reminderGroup", "Nadpis skupiny – Dnes / Zítra", ".remindersGroup h3", 0.88),
            E("reminderTime", "Připomínka – čas", ".reminderItemTime", 0.94),
            E("reminderTitle", "Připomínka – název", ".reminderItemTitle", 1),
            E("reminderPreview", "Připomínka – náhled textu", ".reminderItemPreview", 0.88),
            E("reminderQuickTitle", "Rychlá připomínka – nadpis", ".reminderQuickHeader h3", 1.05),
            E("reminderQuickLabels", "Rychlá připomínka – popisky", ".reminderQuickLabel, .reminderQuickDateTime label", 0.78),
            E("reminderQuickButtons", "Rychlá připomínka – tlačítka", ".reminderDelayGrid button, .reminderQuickPrimary, .reminderQuickFooter button", 0.9)
          ]
        },
        {
          id: "documents",
          label: "Dokumenty",
          items: [
            E("documentsHeading", "Dokumenty – nadpis sekce", ".documentsV1SectionHeader h3", 1),
            E("documentsSubtext", "Dokumenty – pomocný text sekce", ".documentsV1SectionHeader small, .documentsFilesSectionHeader small", 0.8),
            E("documentsFolder", "Složky – název", ".documentsFolderCardName", 0.95),
            E("documentsFolderMeta", "Složky – metadata", ".documentsFolderCard small", 0.8),
            E("documentsSearch", "Dokumenty – hledání", ".documentsSearchBox input", 0.85),
            E("documentsFilters", "Dokumenty – filtry PDF / DOCX / EPUB…", ".documentsFileFilter, .documentsTrashButton", 0.8),
            E("documentsFileName", "Soubor – název", ".documentsFileMain strong", 0.85),
            E("documentsFileMeta", "Soubor – metadata", ".documentsFileMain small", 0.65),
            E("readerBody", "Reader / EPUB – základ 100 %", ".documentsEpubContent", 1.4, 0.7, 2.4, 0.05, "--epub-reader-base-size"),
            E("sqlCode", "SQL Reader – kód", ".documentsSqlCode", 0.81)
          ]
        },
        {
          id: "settings",
          label: "Nastavení a dialogy",
          items: [
            E("settingsTitle", "Nastavení – hlavní nadpis", ".settingsHeader h2", 1.5),
            E("settingsSection", "Nastavení – nadpis sekce", ".settingsSection h3", 0.81),
            E("settingsButtons", "Nastavení – položky / tlačítka", ".settingsSection button, .fontSizeSetting", 1),
            E("choiceTitle", "Výběrový dialog – nadpis", ".choiceDialogTitle", 1.25),
            E("choiceOption", "Výběrový dialog – položky", ".choiceDialogOption", 1.06),
            E("manageTag", "Správa štítků – názvy", ".manageTagName", 1),
            E("dialogTitle", "Obecný dialog – nadpis", ".appMessageDialog h3, .deleteConfirmBox h3", 1.25),
            E("dialogBody", "Obecný dialog – text", ".appMessageDialog p, .deleteConfirmBox p", 1)
          ]
        },
        {
          id: "keyboard",
          label: "LubaKeyboard",
          items: [
            E("keyboardTop", "Klávesnice – horní lišta", ".ln-lk-brand, .ln-lk-language", 0.75),
            E("keyboardSuggestions", "Klávesnice – predikce", "#lubaKeyboard .ln-lk-smartbar .ln-lk-suggestion", 0.94),
            E("keyboardKeys", "Klávesnice – písmena", ".ln-lk-key", 1.25),
            E("keyboardNumbers", "Klávesnice – číselná řada", ".ln-lk-standard-number-row .ln-lk-key", 1.20),
            E("keyboardBottom", "Klávesnice – spodní funkční řada", ".ln-lk-bottom-standard .ln-lk-key, .ln-lk-fn, .ln-lk-nav, .ln-lk-back, .ln-lk-enter", 1),
            E("keyboardCandidate", "Klávesnice – kandidáti / diakritika", ".ln-lk-candidate", 1.06)
          ]
        },
        {
          id: "sharing",
          label: "Sdílení a Chat",
          items: [
            E("sharingTitle", "Sdílení – nadpisy", ".sharingModalHeader h3, .sharingIdentityHeader h3", 1.19),
            E("sharingBody", "Sdílení – popis", ".sharingModalDescription, .sharingIdentityDescription", 0.88),
            E("sharingButtons", "Sdílení – malá tlačítka", ".sharingSmallButton", 0.88),
            E("chatContact", "Chat – kontakt / název", ".chatContactText strong, .chatThreadTitleWrap strong", 1),
            E("chatMeta", "Chat – stav / náhled", ".chatContactText span, .chatStatus, .chatThreadStatus", 0.81),
            E("chatMessage", "Chat – text zprávy", ".chatMessageBody", 1),
            E("chatMessageMeta", "Chat – čas zprávy", ".chatMessageMeta", 0.63)
          ]
        },
        {
          id: "admin",
          label: "Login / Admin / Debug",
          items: [
            E("loginBrand", "Login – LubaNote", ".loginBrand", 1.5),
            E("loginTitle", "Login – nadpis", ".loginCard h2", 1.75),
            E("loginFields", "Login – pole a tlačítka", ".loginCard input, .loginCard button", 1),
            E("adminTitle", "Admin Dashboard – nadpis", ".adminDashboardHeader h2", 1.35),
            E("adminToolTitle", "Admin Dashboard – názvy nástrojů", ".adminToolText strong", 1),
            E("adminToolDesc", "Admin Dashboard – popisy", ".adminToolText small", 0.78),
            E("debugHub", "Debug Hub – základní text", "#ln-debug-hub", 0.75),
            E("visualDebug", "Visual Debug – pole a ovládání", ".ln-vd-field, .ln-vd-select, .ln-vd-number, .ln-vd-selector", 0.75)
          ]
        }
      ]
    },

    desktop: {
      label: "PC / Desktop",
      groups: [
        {
          id: "desktopNavigation",
          label: "PC – horní navigace",
          items: [
            E("pcModules", "Horní moduly – Poznámky / Plán / Dokumenty", ".moduleTabText", 1.2),
            E("pcSearch", "Hledání", "#searchNotes", 1.1),
            E("pcPrimaryFilter", "Rychlé filtry", ".desktopCategoryActions .categoryTab:not(.categoryTabIconOnly), .categoryTabs > .categoryTab:not(.categoryTabIconOnly)", 0.95),
            E("pcTags", "Vlastní štítky", "#tagFilterButtons .categoryTab", 1),
            E("pcTraffic", "RX / TX / E panel", ".syncTrafficBar", 0.7)
          ]
        },
        {
          id: "desktopSidebar",
          label: "PC – levý panel",
          items: [
            E("pcSidebarBrand", "Logo – text LubaNote", ".desktopSidebarBrandText", 1.35),
            E("pcSidebarItems", "Položky levého menu", ".desktopSidebarButton > span:last-child", 0.95),
            E("pcSidebarFooter", "Levý panel – spodní stav", ".desktopSidebarFooter", 0.85),
            E("pcSidebarAdmin", "Admin Dashboard v levém menu", "#desktopAdminDashboardButton > span:last-child", 0.95)
          ]
        },
        {
          id: "desktopNotes",
          label: "PC – Poznámky a karty",
          items: [
            E("pcCardTitle", "Karta – název", ".taskCard h3", 1.15),
            E("pcCardBody", "Karta – text", ".taskCard .taskNoteText", 1.05),
            E("pcCardMeta", "Karta – datum / metadata", ".taskCard p:not(.taskNoteText)", 0.9),
            E("pcCardTag", "Karta – štítek", ".taskTag", 0.85),
            E("pcMainMenu", "Menu / dialog – položky", ".mainMenuLabel", 0.95)
          ]
        },
        {
          id: "desktopEditor",
          label: "PC – Editor",
          items: [
            E("pcEditorTitle", "Editor – název", "#modalTitle", 1.5),
            E("pcEditorBody", "Editor – běžný text", ".ln-v2-editor", 1.2),
            E("pcEditorToolbar", "Editor – panel nástrojů", ".editorToolbarPanel .editorPanelVolba", 1),
            E("pcSelectionMenu", "Výběr textu", ".selectionMenu button", 0.85)
          ]
        },
        {
          id: "desktopPlanner",
          label: "PC – Plán / Kalendář",
          items: [
            E("pcPlannerTabs", "Kalendář / Připomínky", ".plannerSubnavButton > span:last-child", 1.05),
            E("pcCalendarMonth", "Kalendář – měsíc", ".calendarHeader h2", 1.4),
            E("pcCalendarWeekdays", "Kalendář – Po / Út / St…", ".calendarWeekdays", 1.05),
            E("pcCalendarDay", "Kalendář – čísla dnů", ".calendarDay", 1.1),
            E("pcAgendaHeading", "Agenda – nadpis", ".calendarAgenda h3", 0.98),
            E("pcAgendaItem", "Agenda – úkol", ".calendarAgendaItem", 0.94),
            E("pcSelectedDate", "Agenda – datum dne", ".calendarSelectedDateButton", 0.94),
            E("pcWeekNumber", "Agenda – týden", ".calendarWeekNumber", 0.94)
          ]
        },
        {
          id: "desktopReminders",
          label: "PC – Připomínky",
          items: [
            E("pcReminderPanelTitle", "Připomínky – nadpis panelu", ".desktopRemindersFilterPanel h2, .desktopRemindersTimelineHeader h2", 1.3),
            E("pcReminderSearch", "Připomínky – hledání", ".desktopReminderSearch input", 0.9),
            E("pcReminderFilters", "Připomínky – levé filtry", ".desktopReminderFilterButton", 0.95),
            E("pcReminderCount", "Připomínky – počty ve filtrech", ".desktopReminderFilterCount", 0.8),
            E("pcReminderToolbar", "Připomínky – horní ovládání", ".desktopReminderTimelineActions > button", 0.88),
            E("pcReminderGroup", "Připomínky – datum skupiny", ".desktopReminderDayTitle", 1.1),
            E("pcReminderTime", "Připomínky – čas", ".desktopReminderTimelineRow .reminderItemTime", 1),
            E("pcReminderTitle", "Připomínky – název", ".desktopReminderTimelineRow .reminderItemTitle", 1),
            E("pcReminderPreview", "Připomínky – náhled", ".desktopReminderTimelineRow .reminderItemPreview", 0.88),
            E("pcReminderBadges", "Připomínky – Opakované / Domov / Práce", ".desktopReminderAreaBadge, .desktopReminderRepeatBadge", 0.75)
          ]
        },
        {
          id: "desktopDocuments",
          label: "PC – Dokumenty",
          items: [
            E("pcDocumentsHeading", "Dokumenty – nadpis sekce", ".documentsV1SectionHeader h3", 1.2),
            E("pcDocumentsFolder", "Složky – název", ".documentsFolderCardName", 0.88),
            E("pcDocumentsSearch", "Dokumenty – hledání", ".documentsSearchBox input", 0.88),
            E("pcDocumentsFilters", "Dokumenty – filtry", ".documentsFileFilter, .documentsTrashButton", 0.95),
            E("pcDocumentsFile", "Soubor – název", ".documentsFileMain strong", 0.88),
            E("pcDocumentsMeta", "Soubor – metadata", ".documentsFileMain small", 0.69),
            E("pcReaderBody", "Reader / EPUB – základ 100 %", ".documentsEpubContent", 1.06, 0.7, 2.4, 0.05, "--epub-reader-base-size")
          ]
        },
        {
          id: "desktopSettings",
          label: "PC – Nastavení / Admin / Dialogy",
          items: [
            E("pcSettingsTitle", "Nastavení – hlavní nadpis", ".settingsHeader h2", 1.6),
            E("pcSettingsSection", "Nastavení – nadpis sekce", ".settingsSection h3", 1.1),
            E("pcSettingsButtons", "Nastavení – položky", ".settingsSection button", 1.2),
            E("pcAdminTitle", "Admin Dashboard – nadpis", ".adminDashboardHeader h2", 1.5),
            E("pcAdminToolTitle", "Admin Dashboard – nástroje", ".adminToolText strong", 1.25),
            E("pcAdminToolDesc", "Admin Dashboard – popisy", ".adminToolText small", 1.1),
            E("pcDialogTitle", "Dialogy – nadpis", ".appMessageDialog h3, .choiceDialogTitle", 1.25),
            E("pcDialogBody", "Dialogy – text", ".appMessageDialog p, .choiceDialogOption", 1.15)
          ]
        }
      ]
    }
  };

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function najdiPolozku(platform, id) {
    const groups = KONFIG?.[platform]?.groups || [];
    for (const group of groups) {
      const item = group.items.find((x) => x.id === id);
      if (item) return item;
    }
    return null;
  }

  function vychoziStav() {
    const values = { mobile: {}, desktop: {} };
    for (const platform of ["mobile", "desktop"]) {
      for (const group of KONFIG[platform].groups) {
        for (const item of group.items) {
          values[platform][item.id] = item.vychozi;
        }
      }
    }
    return {
      selectedPlatform: desktopMql.matches ? "desktop" : "mobile",
      selectedGroup: {
        mobile: KONFIG.mobile.groups[0].id,
        desktop: KONFIG.desktop.groups[0].id
      },
      values
    };
  }

  function clamp(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function maCiselnouHodnotu(value) {
    return value !== null &&
      value !== undefined &&
      value !== "" &&
      Number.isFinite(Number(value));
  }

  function nactiStav() {
    const base = vychoziStav();
    try {
      const raw = localStorage.getItem(KLIC);
      if (!raw) return base;
      const saved = JSON.parse(raw);
      if (["mobile", "desktop"].includes(saved?.selectedPlatform)) {
        base.selectedPlatform = saved.selectedPlatform;
      }
      for (const platform of ["mobile", "desktop"]) {
        const groupIds = KONFIG[platform].groups.map((g) => g.id);
        if (groupIds.includes(saved?.selectedGroup?.[platform])) {
          base.selectedGroup[platform] = saved.selectedGroup[platform];
        }
        for (const group of KONFIG[platform].groups) {
          for (const item of group.items) {
            const value = saved?.values?.[platform]?.[item.id];
            base.values[platform][item.id] = maCiselnouHodnotu(value)
              ? clamp(value, item.min, item.max, item.vychozi)
              : item.vychozi;
          }
        }
      }
      return base;
    } catch (_error) {
      return base;
    }
  }

  let stav = nactiStav();

  function uloz() {
    try {
      localStorage.setItem(KLIC, JSON.stringify(stav));
    } catch (_error) {}
  }

  function prefixSelector(selector, scope) {
    return selector
      .split(",")
      .map((part) => `${scope} ${part.trim()}`)
      .join(",\n");
  }

  function zajistiStyle() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    return style;
  }

  function aktualizujPlatformClass() {
    const body = document.body;
    if (!body) return;
    body.classList.toggle("ln-text-platform-desktop", desktopMql.matches);
    body.classList.toggle("ln-text-platform-mobile", !desktopMql.matches);
  }

  function aplikuj() {
    aktualizujPlatformClass();
    const css = [];
    const scopes = {
      mobile: "body.ln-text-platform-mobile",
      desktop: "body.ln-text-platform-desktop"
    };

    for (const platform of ["mobile", "desktop"]) {
      for (const group of KONFIG[platform].groups) {
        for (const item of group.items) {
          const value = stav.values[platform][item.id];
          if (!maCiselnouHodnotu(value)) continue;
          const property = item.property || "font-size";
          css.push(
            `${prefixSelector(item.selector, scopes[platform])} { ${property}: ${Number(value).toFixed(2)}rem !important; }`
          );
        }
      }
    }

    zajistiStyle().textContent = css.join("\n\n");
  }

  function oznam() {
    uloz();
    aplikuj();
    window.dispatchEvent(
      new CustomEvent("lubanote:text-visual-tuning-change", {
        detail: deepClone(stav)
      })
    );
  }

  function nastavPlatform(platform) {
    if (!KONFIG[platform]) return false;
    stav.selectedPlatform = platform;
    oznam();
    return true;
  }

  function nastavSkupinu(platform, groupId) {
    const found = KONFIG?.[platform]?.groups?.some((g) => g.id === groupId);
    if (!found) return false;
    stav.selectedGroup[platform] = groupId;
    oznam();
    return true;
  }

  function nastavHodnotu(platform, id, value) {
    const item = najdiPolozku(platform, id);
    if (!item) return false;
    stav.values[platform][id] = clamp(value, item.min, item.max, item.vychozi);
    oznam();
    return true;
  }

  function resetPolozky(platform, id) {
    const item = najdiPolozku(platform, id);
    if (!item) return false;
    stav.values[platform][id] = item.vychozi;
    oznam();
    return true;
  }

  function resetSkupiny(platform, groupId) {
    const group = KONFIG?.[platform]?.groups?.find((g) => g.id === groupId);
    if (!group) return false;
    for (const item of group.items) {
      stav.values[platform][item.id] = item.vychozi;
    }
    oznam();
    return true;
  }

  function resetPlatformy(platform) {
    const groups = KONFIG?.[platform]?.groups || [];
    for (const group of groups) {
      for (const item of group.items) {
        stav.values[platform][item.id] = item.vychozi;
      }
    }
    oznam();
    return true;
  }

  function resetVse() {
    const selectedPlatform = stav.selectedPlatform;
    const selectedGroup = deepClone(stav.selectedGroup);
    stav = vychoziStav();
    stav.selectedPlatform = selectedPlatform;
    stav.selectedGroup = selectedGroup;
    oznam();
    return true;
  }

  function pocetPolozek(platform) {
    return (KONFIG?.[platform]?.groups || []).reduce(
      (sum, group) => sum + group.items.length,
      0
    );
  }

  function efektivniHodnoty() {
    const out = { mobile: {}, desktop: {} };
    for (const platform of ["mobile", "desktop"]) {
      for (const group of KONFIG[platform].groups) {
        for (const item of group.items) {
          const value = stav.values[platform][item.id];
          out[platform][item.id] = maCiselnouHodnotu(value)
            ? Number(value)
            : item.vychozi;
        }
      }
    }
    return out;
  }

  desktopMql.addEventListener?.("change", () => {
    aktualizujPlatformClass();
    aplikuj();
  });

  window.LubaNoteTextVisualTuning = {
    ziskejKonfig: () => deepClone(KONFIG),
    ziskejStav: () => deepClone(stav),
    ziskejPocetPolozek: pocetPolozek,
    ziskejEfektivniHodnoty: efektivniHodnoty,
    jeDesktop: () => desktopMql.matches,
    nastavPlatform,
    nastavSkupinu,
    nastavHodnotu,
    resetPolozky,
    resetSkupiny,
    resetPlatformy,
    resetVse,
    aplikuj
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", aplikuj, { once: true });
  } else {
    aplikuj();
  }
})();
