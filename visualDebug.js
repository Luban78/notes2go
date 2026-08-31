/* =============================================================
   LUBANOTE – VISUAL DEBUG PANEL
   Live element picker and responsive CSS editor.

   Úpravy existují pouze v paměti aktuální relace.
   Nic se neukládá do localStorage. Po restartu je Visual Debug čistý.
   Relace se exportuje do generated CSS podle zvoleného profilu.
   ============================================================= */

(() => {
  "use strict";

  const STORAGE_KEY = "lubaNote.visualDebug.rules.v1";
  const PANEL_KEY = "lubaNote.visualDebug.panel.v1";
  const SNAPSHOT_KEY = "lubaNote.visualDebug.snapshot.v1";
  const LEGACY_COMMITTED_CSS_KEY = "lubaNote.visualDebug.committedCss.v1";
  const STYLE_ID = "ln-vd-runtime-style";
  const LEGACY_COMMITTED_STYLE_ID = "ln-vd-committed-style";
  const INTERNAL_PREFIX = "ln-vd-";
  const MOBILE_MAX = 899;
  const GENERATED_CSS_FILES = {
    mobile: "debugMobileGenerated.css",
    tablet: "debugTabletGenerated.css",
    desktop: "debugDesktopGenerated.css"
  };

  const GENERATED_SECTION_NAMES = [
    "LOGIN",
    "HOME / NOTES",
    "EDITOR",
    "PLANNER",
    "REMINDERS",
    "TAGS / FILTERS",
    "TODO / MEDIA",
    "SETTINGS",
    "SECRET",
    "DIALOGS / MODALS"
  ];

  function generatedCssTemplate(profile = state?.profile || "mobile") {
    const labels = {
      mobile: "MOBILE ≤899",
      tablet: "TABLET 900–1199",
      desktop: "DESKTOP ≥1200"
    };
    const media = {
      mobile: "@media (max-width: 899px)",
      tablet: "@media (min-width: 900px) and (max-width: 1199px)",
      desktop: "@media (min-width: 1200px)"
    };
    const sections = GENERATED_SECTION_NAMES.map(name => `  /* LN-VD-SECTION:${name}:START */\n  /* LN-VD-SECTION:${name}:END */`).join("\n\n");
    return `/* LubaNote – Visual Debug generated ${labels[profile]} CSS */\n\n${media[profile]} {\n${sections}\n}\n`;
  }

  const state = {
    selected: null,
    selector: "",
    baseSelector: "",
    pseudo: "",
    selectionBackStack: [],
    profile: window.innerWidth <= 899 ? "mobile" : (window.innerWidth <= 1199 ? "tablet" : "desktop"),
    rules: { all: {}, mobile: {}, tablet: {}, desktop: {} },
    ruleSections: { all: {}, mobile: {}, tablet: {}, desktop: {} },
    baselineRules: { all: {}, mobile: {}, tablet: {}, desktop: {} },
    baselineSections: { all: {}, mobile: {}, tablet: {}, desktop: {} },
    picking: false,
    hoverTarget: null,
    panelOpen: false,
    unlocked: false,
    unlockClicks: [],
    grid: false,
    outlines: false,
    activeTab: "layout",
    drag: null,
    pickGesture: null,
    suppressClickUntil: 0,
    minimized: false,
    panelOpacity: 0.92,
    history: [],
    activeProperty: "",
    quickDrag: null,
    quickMoved: false,
    quickPressDelay: null,
    quickPressInterval: null,
    quickPressPointerId: null,
    showMeasure: true,
    exportSection: "HOME / NOTES",
    projectCssSource: "",
    projectCssLoadedAt: 0
  };

  const propertyConfig = [
    { key: "font-size", label: "Velikost textu", tab: "text", min: 8, max: 96, step: 1, unit: "px" },
    { key: "font-weight", label: "Tloušťka textu", tab: "text", min: 100, max: 900, step: 100, unit: "" },
    { key: "line-height", label: "Výška řádku", tab: "text", min: 0.7, max: 3, step: 0.05, unit: "" },
    { key: "letter-spacing", label: "Rozestup písmen", tab: "text", min: -3, max: 12, step: 0.1, unit: "px" },

    { key: "width", label: "Šířka", tab: "layout", min: 0, max: 1600, step: 1, unit: "px", zeroAuto: true },
    { key: "height", label: "Výška", tab: "layout", min: 0, max: 1000, step: 1, unit: "px", zeroAuto: true },
    { key: "max-width", label: "Max. šířka", tab: "layout", min: 0, max: 1800, step: 1, unit: "px", zeroNone: true },
    { key: "min-height", label: "Min. výška", tab: "layout", min: 0, max: 1000, step: 1, unit: "px" },
    { key: "padding-inline", label: "Padding X", tab: "layout", min: 0, max: 120, step: 1, unit: "px" },
    { key: "padding-block", label: "Padding Y", tab: "layout", min: 0, max: 120, step: 1, unit: "px" },
    { key: "margin-inline", label: "Margin X", tab: "layout", min: -100, max: 160, step: 1, unit: "px" },
    { key: "margin-block", label: "Margin Y", tab: "layout", min: -100, max: 160, step: 1, unit: "px" },
    { key: "gap", label: "Mezera / gap", tab: "layout", min: 0, max: 100, step: 1, unit: "px" },

    { key: "border-radius", label: "Zaoblení", tab: "style", min: 0, max: 100, step: 1, unit: "px" },
    { key: "border-width", label: "Síla rámečku", tab: "style", min: 0, max: 10, step: 0.5, unit: "px" },
    { key: "opacity", label: "Průhlednost", tab: "style", min: 0.05, max: 1, step: 0.01, unit: "" },
    { key: "box-shadow-blur", label: "Síla neon glow", tab: "style", min: 0, max: 80, step: 1, unit: "px", virtual: true },

    { key: "left", label: "Left", tab: "position", min: -500, max: 1000, step: 1, unit: "px" },
    { key: "top", label: "Top", tab: "position", min: -500, max: 1000, step: 1, unit: "px" },
    { key: "translate-x", label: "Posun X", tab: "position", min: -500, max: 500, step: 1, unit: "px", virtual: true },
    { key: "translate-y", label: "Posun Y", tab: "position", min: -500, max: 500, step: 1, unit: "px", virtual: true },
    { key: "scale", label: "Měřítko", tab: "position", min: 0.25, max: 2, step: 0.01, unit: "", virtual: true },
    { key: "z-index", label: "Vrstva z-index", tab: "position", min: -10, max: 1000, step: 1, unit: "" }
  ];

  let refs = {};
  let visualDebugPripraven = false;

  function loadJson(_key, fallback) {
    return fallback;
  }

  function clearOldStoredDebugData() {
    try {
      [STORAGE_KEY, PANEL_KEY, SNAPSHOT_KEY, LEGACY_COMMITTED_CSS_KEY].forEach(key =>
        localStorage.removeItem(key)
      );
    } catch (_) {}
    document.getElementById(LEGACY_COMMITTED_STYLE_ID)?.remove();
  }

  function saveRules() {
    renderRuntimeCss();
    updateRuleInfo();
  }

  function isInternal(element) {
    if (!element || !(element instanceof Element)) return true;
    return Boolean(element.closest(`[id^="${INTERNAL_PREFIX}"]`));
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(value);
    }
    return String(value).replace(/([^a-zA-Z0-9_-])/g, "\\$1");
  }

  function uniqueSelector(element) {
    if (!element || element === document.documentElement) return ":root";
    if (element.id) return `#${cssEscape(element.id)}`;

    /*
     * Prefer a short, stable selector anchored to the nearest parent ID.
     * Example: #selectedAlg .alg-title
     * This is more readable and more reliable than nth-of-type selectors.
     */
    const stableClasses = [...element.classList]
      .filter(name => !name.startsWith("active") && !name.startsWith("open") && !name.startsWith("hidden"))
      .slice(0, 3);
    const idParent = element.parentElement?.closest?.("[id]");

    if (idParent && stableClasses.length) {
      const anchored = `#${cssEscape(idParent.id)} ${stableClasses.map(name => `.${cssEscape(name)}`).join("")}`;
      try {
        if (document.querySelectorAll(anchored).length === 1) return anchored;
      } catch (_) {}
    }

    const parts = [];
    let current = element;

    while (current && current !== document.body && parts.length < 6) {
      let part = current.tagName.toLowerCase();
      const stableClasses = [...current.classList]
        .filter(name => !name.startsWith("active") && !name.startsWith("open") && !name.startsWith("hidden"))
        .slice(0, 2);

      if (stableClasses.length) {
        part += stableClasses.map(name => `.${cssEscape(name)}`).join("");
      }

      const parent = current.parentElement;
      if (parent) {
        const sameType = [...parent.children].filter(child => child.tagName === current.tagName);
        if (sameType.length > 1) {
          part += `:nth-of-type(${sameType.indexOf(current) + 1})`;
        }
      }

      parts.unshift(part);
      const candidate = parts.join(" > ");
      try {
        if (document.querySelectorAll(candidate).length === 1) return candidate;
      } catch (_) {}
      current = parent;
    }

    return `body > ${parts.join(" > ")}`;
  }

  function ensureStyleElement() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    return style;
  }

  function clearLegacyCommittedMirror() {
    clearOldStoredDebugData();
  }

  function declarationsToCss(declarations) {
    const normal = { ...declarations };
    const tx = normal["translate-x"] ?? "0px";
    const ty = normal["translate-y"] ?? "0px";
    const scale = normal.scale ?? "1";
    const glow = normal["box-shadow-blur"];
    const glowColor = normal["--ln-vd-glow-color"] || "#18ef7d";

    delete normal["translate-x"];
    delete normal["translate-y"];
    delete normal.scale;
    delete normal["box-shadow-blur"];
    delete normal["--ln-vd-glow-color"];

    if (tx !== "0px" || ty !== "0px") {
      normal.translate = `${tx} ${ty}`;
    }
    if (scale !== "1") {
      normal.scale = scale;
    }
    if (glow && parseFloat(glow) > 0) {
      normal["box-shadow"] = `0 0 ${glow} ${glowColor}`;
    }

    return Object.entries(normal)
      .filter(([, value]) => value !== "" && value != null)
      .map(([property, value]) => `  ${property}: ${value} !important;`)
      .join("\n");
  }

  function splitPseudoSelector(selector) {
    const value = String(selector || "").trim();
    const match = value.match(/^(.*?)(::before|::after)\s*$/);
    if (!match) return { base: value, pseudo: "" };
    return { base: match[1].trim(), pseudo: match[2] };
  }

  function selectedComputedStyle(element = state.selected, pseudo = state.pseudo) {
    if (!element) return null;
    return getComputedStyle(element, pseudo || null);
  }

  function boostedSelector(selector) {
    const { base, pseudo } = splitPseudoSelector(selector);
    const value = String(base || "").trim();
    if (!value || value === ":root") return `${value}${pseudo}`;

    /*
     * Pseudo-prvek nesmí být uvnitř :is(). Proto zesílíme pouze selektor
     * skutečného DOM prvku a ::before / ::after připojíme až nakonec.
     */
    const boosted = `:is(#ln-vd-specificity-a, ${value}):is(#ln-vd-specificity-b, ${value})`;
    return `${boosted}${pseudo}`;
  }

  function profileCss(profile) {
    const rules = state.rules[profile] || {};
    return Object.entries(rules)
      .filter(([, declarations]) => declarations && Object.keys(declarations).length)
      .map(([selector, declarations]) => {
        const css = declarationsToCss(declarations);
        const runtimeSelector = boostedSelector(selector);
        return css ? `${runtimeSelector} {\n${css}\n}` : "";
      })
      .filter(Boolean)
      .join("\n\n");
  }

  function generateCss() {
    const all = profileCss("all");
    const mobile = profileCss("mobile");
    const tablet = profileCss("tablet");
    const desktop = profileCss("desktop");
    const chunks = [
      "/* LubaNote – export z Visual Debug Panelu */",
      all,
      mobile ? `@media (max-width: 899px) {\n${indentCss(mobile)}\n}` : "",
      tablet ? `@media (min-width: 900px) and (max-width: 1199px) {\n${indentCss(tablet)}\n}` : "",
      desktop ? `@media (min-width: 1200px) {\n${indentCss(desktop)}\n}` : ""
    ];
    return chunks.filter(Boolean).join("\n\n") + "\n";
  }

  function indentCss(css) {
    return css.split("\n").map(line => `  ${line}`).join("\n");
  }

  function currentSelectorCss() {
    if (!state.selector) return "";
    const declarations = currentRule(false);
    if (!declarations || !Object.keys(declarations).length) return "";
    const css = declarationsToCss(declarations);
    return `${boostedSelector(state.selector)} {\n${css}\n}`;
  }

  const CSS_SECTION_ALIASES = {
    "LOGIN": ["LOGIN", "PRIHLASENI"],
    "HOME / NOTES": ["HOME / NOTES", "POZNAMKY", "HLAVNI OBRAZOVKA", "HOME NOTES"],
    "EDITOR": ["EDITOR", "EDITOR POZNAMKY"],
    "PLANNER": ["PLANNER", "PLAN", "KALENDAR"],
    "REMINDERS": ["REMINDERS", "PRIPOMINKY"],
    "TAGS / FILTERS": ["TAGS / FILTERS", "STITKY / FILTRY", "TAGS FILTERS"],
    "TODO / MEDIA": ["TODO / MEDIA", "TODO", "MEDIA", "OBRAZKY"],
    "SETTINGS": ["SETTINGS", "NASTAVENI"],
    "SECRET": ["SECRET", "TAJNY REZIM"],
    "DIALOGS / MODALS": ["DIALOGS / MODALS", "DIALOGY A MODALY", "DIALOGY MODALY"]
  };

  function normalizeSectionLabel(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  function sectionAliases(section) {
    const aliases = CSS_SECTION_ALIASES[section] || [section];
    return aliases.map(normalizeSectionLabel).filter(Boolean);
  }

  function cssComments(fileText) {
    const comments = [];
    const regex = /\/\*[\s\S]*?\*\//g;
    let match;
    while ((match = regex.exec(fileText))) {
      comments.push({ index: match.index, end: regex.lastIndex, text: match[0] });
    }
    return comments;
  }

  function sectionMatchScore(commentText, section) {
    const aliases = sectionAliases(section);
    const lines = commentText
      .replace(/^\/\*|\*\/$/g, "")
      .split(/\r?\n/)
      .map(normalizeSectionLabel)
      .filter(Boolean);

    let score = 0;
    for (const line of lines) {
      for (const alias of aliases) {
        if (line === alias) score = Math.max(score, 100);
        else if (line.startsWith(`${alias} `) && !line.includes("VISUAL DEBUG EXPORT")) score = Math.max(score, 60);
      }
    }
    return score;
  }

  function findSectionHeading(fileText, section) {
    let best = null;
    for (const comment of cssComments(fileText)) {
      const score = sectionMatchScore(comment.text, section);
      if (!score) continue;
      if (!best || score > best.score || (score === best.score && comment.index < best.index)) {
        best = { ...comment, score };
      }
    }
    return best;
  }

  function findNextSectionStart(fileText, currentHeading) {
    const headings = Object.keys(CSS_SECTION_ALIASES)
      .map(section => findSectionHeading(fileText, section))
      .filter(Boolean)
      .filter((heading, index, all) => all.findIndex(item => item.index === heading.index) === index)
      .sort((a, b) => a.index - b.index);

    return headings.find(heading => heading.index > currentHeading.index)?.index ?? -1;
  }

  function sectionHeadingComment(section) {
    return `\n\n  /* =====================================================\n     ${section}\n  ===================================================== */\n`;
  }


  function findPrimaryMobileMediaBlock(fileText) {
    const regex = new RegExp(
      `@media\\s*\\(\\s*max-width\\s*:\\s*${MOBILE_MAX}px\\s*\\)\\s*\\{`,
      "i"
    );
    const match = regex.exec(fileText);
    if (!match) return null;

    const open = fileText.indexOf("{", match.index);
    if (open < 0) return null;
    const close = findMatchingCssBrace(fileText, open);
    if (close < 0) return null;

    return {
      start: match.index,
      open,
      contentStart: open + 1,
      close,
      end: close + 1
    };
  }

  function findSectionBounds(fileText, section) {
    const heading = findSectionHeading(fileText, section);
    if (!heading) return null;

    /*
     * The next named section is the safest boundary. Do not limit this search
     * by the currently parsed outer @media closing brace: an old malformed
     * export may contain one orphan `}` before the next section, which would
     * otherwise make the parser believe the mobile block ended too early.
     */
    const nextHeading = Object.keys(CSS_SECTION_ALIASES)
      .map(name => findSectionHeading(fileText, name))
      .filter(Boolean)
      .filter(item => item.index > heading.index)
      .sort((a, b) => a.index - b.index)[0] || null;

    const mobileBlock = findPrimaryMobileMediaBlock(fileText);
    const fallbackEnd = fileText.lastIndexOf("}");
    const containerEnd = nextHeading?.index
      ?? (fallbackEnd >= heading.end ? fallbackEnd : fileText.length);

    return {
      heading,
      start: heading.end,
      end: containerEnd,
      containerEnd,
      mobileBlock
    };
  }

  function unwrapRedundantMobileMedia(sectionText) {
    let text = sectionText;
    let removed = 0;
    const regex = new RegExp(
      `@media\\s*\\(\\s*max-width\\s*:\\s*${MOBILE_MAX}px\\s*\\)\\s*\\{`,
      "i"
    );

    for (let guard = 0; guard < 20; guard++) {
      const match = regex.exec(text);
      if (!match) break;

      const open = text.indexOf("{", match.index);
      if (open < 0) break;
      const close = findMatchingCssBrace(text, open);
      if (close < 0) break;

      const inner = text.slice(open + 1, close);
      text = text.slice(0, match.index) + "\n" + inner + "\n" + text.slice(close + 1);
      removed++;
    }

    return { text, removed };
  }

  function removeOrphanSectionClosingBraces(sectionText) {
    const removals = [];
    let depth = 0;
    let quote = "";

    for (let i = 0; i < sectionText.length; i++) {
      const char = sectionText[i];
      const next = sectionText[i + 1];

      if (quote) {
        if (char === "\\") { i++; continue; }
        if (char === quote) quote = "";
        continue;
      }

      if (char === '"' || char === "'") {
        quote = char;
        continue;
      }

      if (char === "/" && next === "*") {
        const commentEnd = sectionText.indexOf("*/", i + 2);
        if (commentEnd < 0) break;
        i = commentEnd + 1;
        continue;
      }

      if (char === "{") {
        depth++;
      } else if (char === "}") {
        if (depth > 0) depth--;
        else removals.push(i);
      }
    }

    if (depth > 0) {
      throw new Error("Ve zvolené sekci chybí zavírací složená závorka");
    }

    if (!removals.length) return { text: sectionText, removed: 0 };

    const removalSet = new Set(removals);
    const cleaned = [...sectionText]
      .filter((_, index) => !removalSet.has(index))
      .join("");

    return { text: cleaned, removed: removals.length };
  }

  function normalizeSectionStructure(fileText, section) {
    const bounds = findSectionBounds(fileText, section);
    if (!bounds) return { text: fileText, repairs: 0 };

    let sectionText = fileText.slice(bounds.start, bounds.end);
    const unwrapped = unwrapRedundantMobileMedia(sectionText);
    sectionText = unwrapped.text;

    const orphanFix = removeOrphanSectionClosingBraces(sectionText);
    sectionText = orphanFix.text;

    return {
      text: fileText.slice(0, bounds.start) + sectionText + fileText.slice(bounds.end),
      repairs: unwrapped.removed + orphanFix.removed
    };
  }

  function assertBalancedCssBraces(cssText) {
    let depth = 0;
    let quote = "";

    for (let i = 0; i < cssText.length; i++) {
      const char = cssText[i];
      const next = cssText[i + 1];

      if (quote) {
        if (char === "\\") { i++; continue; }
        if (char === quote) quote = "";
        continue;
      }

      if (char === '"' || char === "'") {
        quote = char;
        continue;
      }

      if (char === "/" && next === "*") {
        const commentEnd = cssText.indexOf("*/", i + 2);
        if (commentEnd < 0) {
          throw new Error("CSS obsahuje neukončený komentář");
        }
        i = commentEnd + 1;
        continue;
      }

      if (char === "{") depth++;
      if (char === "}") {
        depth--;
        if (depth < 0) {
          throw new Error("CSS obsahuje přebytečnou zavírací složenou závorku");
        }
      }
    }

    if (depth !== 0) {
      throw new Error("CSS nemá vyvážené složené závorky");
    }
  }

  function stripCssComments(value) {
    return String(value || "").replace(/\/\*[\s\S]*?\*\//g, "");
  }

  function canonicalSelectorKey(selector) {
    return stripCssComments(selector)
      .trim()
      .replace(/\s+/g, " ")
      .replace(/\s*([>+~,:()])\s*/g, "$1");
  }

  function findMatchingCssBrace(text, openIndex, limit = text.length) {
    let depth = 0;
    let quote = "";

    for (let i = openIndex; i < limit; i++) {
      const char = text[i];
      const next = text[i + 1];

      if (quote) {
        if (char === "\\") { i++; continue; }
        if (char === quote) quote = "";
        continue;
      }

      if (char === '"' || char === "'") { quote = char; continue; }
      if (char === "/" && next === "*") {
        const commentEnd = text.indexOf("*/", i + 2);
        if (commentEnd < 0) return -1;
        i = commentEnd + 1;
        continue;
      }

      if (char === "{") depth++;
      if (char === "}") {
        depth--;
        if (depth === 0) return i;
      }
    }
    return -1;
  }

  function selectorStartInsidePrelude(prelude) {
    let lastCommentEnd = 0;
    const commentRegex = /\/\*[\s\S]*?\*\//g;
    let match;
    while ((match = commentRegex.exec(prelude))) lastCommentEnd = commentRegex.lastIndex;
    let index = lastCommentEnd;
    while (index < prelude.length && /\s/.test(prelude[index])) index++;
    return index;
  }

  function collectLeafCssRules(text, rangeStart, rangeEnd, output) {
    let cursor = rangeStart;

    while (cursor < rangeEnd) {
      let openBrace = -1;
      let quote = "";

      for (let i = cursor; i < rangeEnd; i++) {
        const char = text[i];
        const next = text[i + 1];

        if (quote) {
          if (char === "\\") { i++; continue; }
          if (char === quote) quote = "";
          continue;
        }

        if (char === '"' || char === "'") { quote = char; continue; }
        if (char === "/" && next === "*") {
          const commentEnd = text.indexOf("*/", i + 2);
          if (commentEnd < 0 || commentEnd >= rangeEnd) return;
          i = commentEnd + 1;
          continue;
        }

        if (char === ";") cursor = i + 1;
        if (char === "{") { openBrace = i; break; }
      }

      if (openBrace < 0) return;
      const closeBrace = findMatchingCssBrace(text, openBrace, rangeEnd);
      if (closeBrace < 0) return;

      const prelude = text.slice(cursor, openBrace);
      const cleanPrelude = stripCssComments(prelude).trim();

      if (cleanPrelude.startsWith("@")) {
        collectLeafCssRules(text, openBrace + 1, closeBrace, output);
      } else if (cleanPrelude) {
        const selectorOffset = selectorStartInsidePrelude(prelude);
        output.push({
          start: cursor + selectorOffset,
          end: closeBrace + 1,
          selector: cleanPrelude,
          key: canonicalSelectorKey(cleanPrelude)
        });
      }

      cursor = closeBrace + 1;
    }
  }

  function extendRuleRangeOverManagedMarkers(text, range, sectionStart, sectionEnd) {
    let start = range.start;
    let end = range.end;

    const beforeStart = Math.max(sectionStart, start - 1200);
    const before = text.slice(beforeStart, start);
    const startMarker = before.match(/\/\* LN-VD:[\s\S]*?\*\/\s*$/);
    if (startMarker) start = beforeStart + startMarker.index;

    const after = text.slice(end, Math.min(sectionEnd, end + 1200));
    const endMarker = after.match(/^\s*\/\* \/LN-VD:[\s\S]*?\*\//);
    if (endMarker) end += endMarker[0].length;

    while (end < sectionEnd && (text[end] === "\n" || text[end] === "\r")) end++;
    return { start, end };
  }

  function deduplicateRulesInSection(fileText, section) {
    const normalized = normalizeSectionStructure(fileText, section);
    fileText = normalized.text;

    const bounds = findSectionBounds(fileText, section);
    if (!bounds) {
      return { text: fileText, removed: 0, structureRepairs: normalized.repairs };
    }

    const rules = [];
    collectLeafCssRules(fileText, bounds.start, bounds.end, rules);

    const bySelector = new Map();
    for (const rule of rules) {
      if (!rule.key) continue;
      if (!bySelector.has(rule.key)) bySelector.set(rule.key, []);
      bySelector.get(rule.key).push(rule);
    }

    const removals = [];
    for (const duplicates of bySelector.values()) {
      if (duplicates.length < 2) continue;
      duplicates.sort((a, b) => a.start - b.start);
      for (const duplicate of duplicates.slice(0, -1)) {
        removals.push(extendRuleRangeOverManagedMarkers(
          fileText,
          duplicate,
          bounds.start,
          bounds.end
        ));
      }
    }

    removals.sort((a, b) => b.start - a.start);
    let cleaned = fileText;
    for (const removal of removals) {
      cleaned = cleaned.slice(0, removal.start) + cleaned.slice(removal.end);
    }

    return {
      text: cleaned,
      removed: removals.length,
      structureRepairs: normalized.repairs
    };
  }

  function replaceOrInsertRuleInSection(fileText, section, selector, ruleCss) {
    const cleanup = deduplicateRulesInSection(fileText, section);
    fileText = cleanup.text;
    const duplicatesRemoved = cleanup.removed;
    const structureRepairs = cleanup.structureRepairs || 0;

    let heading = findSectionHeading(fileText, section);
    let createdSection = false;

    if (!heading) {
      const finalBrace = fileText.lastIndexOf("}");
      const safePoint = finalBrace >= 0 ? finalBrace : fileText.length;
      const headingText = sectionHeadingComment(section);
      fileText = fileText.slice(0, safePoint) + headingText + "\n" + fileText.slice(safePoint);
      heading = findSectionHeading(fileText, section);
      createdSection = true;
    }

    if (!heading) throw new Error(`Sekci ${section} se nepodařilo vytvořit`);

    const bounds = findSectionBounds(fileText, section);
    if (!bounds) throw new Error(`Sekci ${section} se nepodařilo bezpečně načíst`);

    const sectionStart = bounds.start;
    const sectionEnd = bounds.end;
    const sectionText = fileText.slice(sectionStart, sectionEnd);
    const markerKey = encodeURIComponent(selector);
    const startMarker = `/* LN-VD:${markerKey} */`;
    const endMarker = `/* /LN-VD:${markerKey} */`;
    const managedBlock = `${startMarker}\n${ruleCss}\n${endMarker}`;

    const finish = (updatedText, replaced) => {
      assertBalancedCssBraces(updatedText);
      return {
        text: updatedText,
        createdSection,
        replaced,
        duplicatesRemoved,
        structureRepairs
      };
    };

    const markerStart = sectionText.indexOf(startMarker);
    if (markerStart >= 0) {
      const markerEnd = sectionText.indexOf(endMarker, markerStart);
      if (markerEnd >= 0) {
        const after = markerEnd + endMarker.length;
        const updated = sectionText.slice(0, markerStart) + managedBlock + sectionText.slice(after);
        return finish(
          fileText.slice(0, sectionStart) + updated + fileText.slice(sectionEnd),
          true
        );
      }
    }

    const rules = [];
    collectLeafCssRules(fileText, sectionStart, sectionEnd, rules);
    const rawKey = canonicalSelectorKey(selector);
    const boostedKey = canonicalSelectorKey(boostedSelector(selector));
    const matchingRules = rules
      .filter(rule => rule.key === rawKey || rule.key === boostedKey)
      .sort((a, b) => a.start - b.start);

    if (matchingRules.length) {
      const target = extendRuleRangeOverManagedMarkers(
        fileText,
        matchingRules[matchingRules.length - 1],
        sectionStart,
        sectionEnd
      );
      const updatedText = fileText.slice(0, target.start) + managedBlock + fileText.slice(target.end);
      return finish(updatedText, true);
    }

    const spacer = sectionText.trim() ? "\n\n" : "\n";
    const updatedSection = sectionText.replace(/\s*$/, "") + spacer + managedBlock + "\n\n";
    return finish(
      fileText.slice(0, sectionStart) + updatedSection + fileText.slice(sectionEnd),
      false
    );
  }

  function ensureGeneratedSectionMarkers(fileText) {
    let text = String(fileText || "").trim();
    if (!text || !text.includes("LN-VD-SECTION:")) {
      return generatedCssTemplate(state.profile);
    }

    for (const section of GENERATED_SECTION_NAMES) {
      const start = `/* LN-VD-SECTION:${section}:START */`;
      const end = `/* LN-VD-SECTION:${section}:END */`;
      if (!text.includes(start) || !text.includes(end)) {
        return generatedCssTemplate(state.profile);
      }
    }

    return text.endsWith("\n") ? text : `${text}\n`;
  }

  function replaceOrInsertGeneratedRule(fileText, section, selector, ruleCss) {
    const text = ensureGeneratedSectionMarkers(fileText);
    const sectionStartMarker = `/* LN-VD-SECTION:${section}:START */`;
    const sectionEndMarker = `/* LN-VD-SECTION:${section}:END */`;
    const sectionStart = text.indexOf(sectionStartMarker);
    const sectionEnd = text.indexOf(sectionEndMarker, sectionStart + sectionStartMarker.length);

    if (sectionStart < 0 || sectionEnd < 0) {
      throw new Error(`Sekce ${section} nebyla v generovaném CSS nalezena`);
    }

    const contentStart = sectionStart + sectionStartMarker.length;
    const sectionContent = text.slice(contentStart, sectionEnd);
    const markerKey = encodeURIComponent(selector);
    const startMarker = `/* LN-VD:${markerKey}:START */`;
    const endMarker = `/* LN-VD:${markerKey}:END */`;
    const managedBlock = `\n\n  ${startMarker}\n${indentCss(ruleCss)}\n  ${endMarker}\n`;

    let cleaned = sectionContent;
    let removed = 0;
    while (true) {
      const oldStart = cleaned.indexOf(startMarker);
      if (oldStart < 0) break;
      const oldEnd = cleaned.indexOf(endMarker, oldStart + startMarker.length);
      if (oldEnd < 0) break;
      const after = oldEnd + endMarker.length;
      cleaned = cleaned.slice(0, oldStart) + cleaned.slice(after);
      removed++;
    }

    cleaned = cleaned.replace(/^\s+|\s+$/g, "");
    const updatedContent = cleaned
      ? `\n\n${cleaned}\n${managedBlock}`
      : managedBlock;

    const updatedText = text.slice(0, contentStart) + updatedContent + text.slice(sectionEnd);
    assertBalancedCssBraces(updatedText);

    return {
      text: updatedText,
      replaced: removed > 0,
      duplicatesRemoved: Math.max(0, removed - 1),
      structureRepairs: 0,
      createdSection: false
    };
  }

  async function chooseCssFile() {
    if (!("showOpenFilePicker" in window)) {
      toast("Přímý zápis zde není podporovaný – použij bezpečné kopírování CSS");
      return null;
    }
    try {
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: [{ description: "CSS soubor", accept: { "text/css": [".css"] } }]
      });
      toast(`Vybráno: ${handle.name}`);
      return handle;
    } catch (error) {
      if (error?.name !== "AbortError") toast("Soubor se nepodařilo vybrat");
      return null;
    }
  }

  function generatedFileName(profile = state.profile) {
    return GENERATED_CSS_FILES[profile] || GENERATED_CSS_FILES.mobile;
  }

  function parseGeneratedDeclarations(blockText) {
    const open = blockText.indexOf("{");
    const close = blockText.lastIndexOf("}");
    if (open < 0 || close <= open) return {};

    const body = blockText.slice(open + 1, close);
    const declarations = {};
    const regex = /([a-zA-Z-]+)\s*:\s*([^;]+?)\s*!important\s*;/g;
    let match;

    while ((match = regex.exec(body))) {
      const property = match[1].trim();
      const value = match[2].trim();

      if (property === "transform") {
        const translate = value.match(/translate\(\s*([^,]+)\s*,\s*([^)]+)\)/i);
        const scale = value.match(/scale\(\s*([^)]+)\)/i);
        if (translate) {
          declarations["translate-x"] = translate[1].trim();
          declarations["translate-y"] = translate[2].trim();
        }
        if (scale) declarations.scale = scale[1].trim();
        continue;
      }

      if (property === "translate") {
        const parts = value.split(/\s+/).filter(Boolean);
        declarations["translate-x"] = parts[0] || "0px";
        declarations["translate-y"] = parts[1] || "0px";
        continue;
      }

      if (property === "scale") {
        declarations.scale = value;
        continue;
      }

      declarations[property] = value;
    }

    return declarations;
  }

  function hydrateRulesFromGeneratedCss(cssText) {
    const text = ensureGeneratedSectionMarkers(cssText);
    const hydratedRules = {};
    const hydratedSections = {};

    for (const section of GENERATED_SECTION_NAMES) {
      const sectionStartMarker = `/* LN-VD-SECTION:${section}:START */`;
      const sectionEndMarker = `/* LN-VD-SECTION:${section}:END */`;
      const sectionStart = text.indexOf(sectionStartMarker);
      const sectionEnd = text.indexOf(sectionEndMarker, sectionStart + sectionStartMarker.length);
      if (sectionStart < 0 || sectionEnd < 0) continue;

      const sectionText = text.slice(sectionStart + sectionStartMarker.length, sectionEnd);
      const markerRegex = /\/\* LN-VD:(.*?):START \*\/([\s\S]*?)\/\* LN-VD:\1:END \*\//g;
      let match;

      while ((match = markerRegex.exec(sectionText))) {
        let selector = "";
        try {
          selector = decodeURIComponent(match[1]);
        } catch (_) {
          selector = match[1];
        }
        if (!selector) continue;
        const declarations = parseGeneratedDeclarations(match[2]);
        if (!Object.keys(declarations).length) continue;
        hydratedRules[selector] = declarations;
        hydratedSections[selector] = section;
      }
    }

    const profile = state.profile;
    state.baselineRules[profile] = JSON.parse(JSON.stringify(hydratedRules));
    state.baselineSections[profile] = { ...hydratedSections };
    state.rules[profile] = JSON.parse(JSON.stringify(hydratedRules));
    state.ruleSections[profile] = { ...hydratedSections };
    renderRuntimeCss();
    updateRuleInfo();
  }

  function findGeneratedStylesheet(profile = state.profile) {
    const fileName = generatedFileName(profile);
    return Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .find(link => (link.getAttribute("href") || "").includes(fileName)) || null;
  }

  async function readServedGeneratedCss(profile = state.profile) {
    const stylesheet = findGeneratedStylesheet(profile);
    if (!stylesheet) return generatedCssTemplate(profile);
    const href = stylesheet.getAttribute("href") || generatedFileName(profile);
    const response = await fetch(`${href.split("?")[0]}?vd=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return generatedCssTemplate(profile);
    return await response.text();
  }

  function findDebugMobileStylesheet() {
    return findGeneratedStylesheet(state.profile);
  }

  async function readServedDebugMobileCss() {
    const stylesheet = findDebugMobileStylesheet();
    if (!stylesheet) throw new Error("Generated CSS není v index.html načten");

    const href = stylesheet.getAttribute("href") || generatedFileName(state.profile);
    const cleanHref = href.split("?")[0];
    const response = await fetch(`${cleanHref}?vdsource=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Aplikace nedokázala načíst generated CSS");
    return await response.text();
  }

  async function refreshProjectCssSource() {
    try {
      state.projectCssSource = await readServedGeneratedCss(state.profile);
      state.projectCssLoadedAt = Date.now();

      const pravidlaProfilu = state.rules[state.profile] || {};
      const maRozpracovaneUpravy = Object.values(pravidlaProfilu).some(
        declarations => declarations && Object.keys(declarations).length
      );

      if (!maRozpracovaneUpravy) {
        hydrateRulesFromGeneratedCss(state.projectCssSource);
      }
      return true;
    } catch (error) {
      console.error(error);
      state.projectCssSource = generatedCssTemplate(state.profile);
      state.projectCssLoadedAt = 0;
      return false;
    }
  }

  async function preloadProjectCss() {
    state.projectCssSource = "";
    state.projectCssLoadedAt = 0;
    return refreshProjectCssSource();
  }

  function copyTextFallback(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch (_) {
      copied = false;
    }
    textarea.remove();
    return copied;
  }

  async function copyTextRobust(text) {
    if (copyTextFallback(text)) return true;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) {}
    return false;
  }

  async function buildUpdatedDebugMobileCss() {
    if (!totalEditedSelectors()) {
      throw new Error("V této relaci zatím není žádná úprava");
    }

    let text = state.projectCssSource || await readServedGeneratedCss(state.profile);
    let replacedCount = 0;
    let addedCount = 0;

    const profile = state.profile;
    for (const [selector, declarations] of Object.entries(state.rules[profile] || {})) {
      if (!declarations || !Object.keys(declarations).length) continue;
      const css = declarationsToCss(declarations);
      if (!css) continue;
      const ruleCss = `${boostedSelector(selector)} {\n${css}\n}`;
      const section = state.ruleSections[profile]?.[selector] || "HOME / NOTES";
      const result = replaceOrInsertGeneratedRule(text, section, selector, ruleCss);
      text = result.text;
      if (result.replaced) replacedCount++;
      else addedCount++;
    }

    assertBalancedCssBraces(text);
    return {
      text,
      replaced: replacedCount > 0,
      replacedCount,
      addedCount,
      duplicatesRemoved: 0,
      structureRepairs: 0,
      createdSection: false
    };
  }

  async function copyUpdatedDebugMobileCss() {
    const button = refs.copyProjectCss;
    try {
      if (button) {
        button.disabled = true;
        button.textContent = "Připravuji…";
      }

      if (!state.projectCssSource) {
        const loaded = await refreshProjectCssSource();
        if (!loaded) throw new Error("Nepodařilo se načíst generated CSS z aplikace");
      }

      const result = await buildUpdatedDebugMobileCss();
      state.projectCssSource = result.text;
      const copied = await copyTextRobust(result.text);

      if (!copied) {
        downloadText(generatedFileName(state.profile), result.text);
        toast("Schránka nebyla dostupná, proto se stáhl aktualizovaný generated CSS");
        return;
      }

      toast(`Hotové CSS je ve schránce — přidáno ${result.addedCount}, přepsáno ${result.replacedCount}`);
    } catch (error) {
      console.error(error);
      toast(error?.message || "Aktualizovaný CSS se nepodařilo zkopírovat");
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "Kopírovat hotové CSS";
      }
    }
  }

  async function downloadUpdatedDebugMobileCss() {
    try {
      const result = await buildUpdatedDebugMobileCss();
      state.projectCssSource = result.text;
      downloadText(generatedFileName(state.profile), result.text);
      toast(`Hotové CSS staženo — přidáno ${result.addedCount}, přepsáno ${result.replacedCount}`);
    } catch (error) {
      console.error(error);
      toast(error?.message || "Aktualizovaný CSS se nepodařilo stáhnout");
    }
  }

  function reloadConnectedDebugStylesheet(expectedSelector = "", expectedCssText = "") {
    const stylesheet = findDebugMobileStylesheet();
    if (!stylesheet) return Promise.resolve({ reloaded: false, servedMatches: false });

    const currentHref = stylesheet.getAttribute("href") || generatedFileName(state.profile);
    const cleanHref = currentHref.split("?")[0];
    const refreshedHref = `${cleanHref}?vd=${Date.now()}`;

    return new Promise((resolve) => {
      let finished = false;

      const finish = async () => {
        if (finished) return;
        finished = true;
        stylesheet.removeEventListener("load", finish);
        stylesheet.removeEventListener("error", finish);

        let servedMatches = false;
        if (expectedSelector) {
          try {
            const response = await fetch(`${cleanHref}?vdcheck=${Date.now()}`, { cache: "no-store" });
            const servedCss = await response.text();
            const marker = `/* LN-VD:${encodeURIComponent(expectedSelector)} */`;
            servedMatches = response.ok && servedCss.includes(marker);
          } catch (_) {
            servedMatches = false;
          }
        }
        resolve({ reloaded: true, servedMatches });
      };

      stylesheet.addEventListener("load", finish);
      stylesheet.addEventListener("error", finish);
      stylesheet.setAttribute("href", refreshedHref);
      setTimeout(finish, 1500);
    });
  }

  /*
   * Přímý zápis ponecháváme pouze jako experimentální desktopovou funkci.
   * Na Androidu může systémový picker předat kopii souboru mimo projekt Spck.
   * Funkce proto nikdy nevytváří lokální CSS zrcadlo a nic nepředstírá.
   */
  async function saveCurrentRuleToCssFile() {
    if (!state.selector) { toast("Nejdřív vyber prvek"); return; }
    const ruleCss = currentSelectorCss();
    if (!ruleCss) { toast("Vybraný prvek nemá žádnou úpravu"); return; }

    const handle = await chooseCssFile();
    if (!handle) return;

    try {
      const file = await handle.getFile();
      const original = await file.text();
      const result = replaceOrInsertRuleInSection(
        original,
        state.exportSection,
        state.selector,
        ruleCss
      );

      const writable = await handle.createWritable();
      await writable.write(result.text);
      await writable.close();

      const reloadResult = await reloadConnectedDebugStylesheet(state.selector, result.text);
      if (reloadResult.servedMatches) {
        toast(`Projektový CSS byl zapsán a načten z ${state.exportSection}`);
      } else {
        toast("Změnil se vybraný soubor, ale ne CSS servírovaný Spck");
      }
    } catch (error) {
      console.error(error);
      toast(error?.message || "Přímý zápis selhal");
    }
  }

  async function copyCurrentRule() {
    const css = currentSelectorCss();
    if (!css) { toast("Vybraný prvek nemá žádnou úpravu"); return; }
    const text = `/* Sekce: ${state.exportSection} */\n${css}\n`;
    try {
      await navigator.clipboard.writeText(text);
      toast("CSS aktuálního prvku zkopírováno");
    } catch (_) {
      downloadText("visualDebug-current-rule.css", text);
      toast("CSS aktuálního prvku staženo");
    }
  }

  function renderRuntimeCss() {
    ensureStyleElement().textContent = generateCss();
  }

  function currentRule(create = false) {
    if (!state.selector) return null;
    const profileRules = state.rules[state.profile] || (state.rules[state.profile] = {});
    if (!profileRules[state.selector] && create) profileRules[state.selector] = {};
    return profileRules[state.selector] || null;
  }

  function rememberRuleSection(selector = state.selector, section = state.exportSection) {
    if (!selector) return;
    const sections = state.ruleSections[state.profile] || (state.ruleSections[state.profile] = {});
    sections[selector] = section || "HOME / NOTES";
  }

  function ruleSection(selector, profile = state.profile) {
    return state.ruleSections[profile]?.[selector] || "HOME / NOTES";
  }

  function ensureMovementSafety() {
    if (!state.selected || !state.selector) return;

    const rule = currentRule(true);
    const selectedStyle = selectedComputedStyle();
    if ((selectedStyle.position || "static") === "static" && !rule.position) {
      rule.position = "relative";
    }
    if (!rule["z-index"]) rule["z-index"] = "20";
    rule.overflow = "visible";
    rememberRuleSection();

    const parent = state.selected.parentElement;
    if (!parent || parent === document.body || isInternal(parent)) return;
    const parentSelector = uniqueSelector(parent);
    if (!parentSelector) return;
    const profileRules = state.rules[state.profile] || (state.rules[state.profile] = {});
    const parentRule = profileRules[parentSelector] || (profileRules[parentSelector] = {});
    parentRule.overflow = "visible";
    const sections = state.ruleSections[state.profile] || (state.ruleSections[state.profile] = {});
    sections[parentSelector] = state.exportSection || "HOME / NOTES";
  }

  function freeSelectedMovement() {
    if (!state.selected || !state.selector) {
      toast("Nejdřív vyber prvek");
      return;
    }
    pushHistory();
    ensureMovementSafety();
    saveRules();
    syncControls();
    updateHighlight();
    toast("Přesah a vrstva prvku jsou uvolněné");
  }

  function pushHistory() {
    state.history.push(JSON.stringify({
      rules: state.rules,
      ruleSections: state.ruleSections
    }));
    if (state.history.length > 30) state.history.shift();
  }

  function setDeclaration(property, value) {
    if (!state.selector) return;
    pushHistory();
    const rule = currentRule(true);
    rememberRuleSection();
    if (value === "" || value == null) delete rule[property];
    else rule[property] = value;

    if (["translate-x", "translate-y", "scale"].includes(property)) {
      ensureMovementSafety();
    }

    if (!Object.keys(rule).length) {
      delete state.rules[state.profile][state.selector];
      delete state.ruleSections[state.profile]?.[state.selector];
    }
    saveRules();
  }

  function getDeclaration(property) {
    return currentRule(false)?.[property] ?? "";
  }

  function computedNumeric(element, config) {
    if (!element) return config.key === "scale" ? 1 : 0;
    const style = selectedComputedStyle(element);
    const pseudoActive = Boolean(state.pseudo);
    switch (config.key) {
      case "padding-inline": return averagePx(style.paddingLeft, style.paddingRight);
      case "padding-block": return averagePx(style.paddingTop, style.paddingBottom);
      case "margin-inline": return averagePx(style.marginLeft, style.marginRight);
      case "margin-block": return averagePx(style.marginTop, style.marginBottom);
      case "box-shadow-blur": return 0;
      case "translate-x": return 0;
      case "translate-y": return 0;
      case "scale": return 1;
      case "width": {
        if (pseudoActive) return Math.round(parseFloat(style.width) || 0);
        const value = element instanceof SVGElement
          ? (element.getBBox?.().width || element.getBoundingClientRect().width)
          : (element.offsetWidth || parseFloat(style.width) || element.getBoundingClientRect().width);
        return Math.round(value);
      }
      case "height": {
        if (pseudoActive) return Math.round(parseFloat(style.height) || 0);
        const value = element instanceof SVGElement
          ? (element.getBBox?.().height || element.getBoundingClientRect().height)
          : (element.offsetHeight || parseFloat(style.height) || element.getBoundingClientRect().height);
        return Math.round(value);
      }
      case "max-width": return style.maxWidth === "none" ? 0 : parseFloat(style.maxWidth) || 0;
      default: return parseFloat(style.getPropertyValue(config.key)) || 0;
    }
  }

  function averagePx(a, b) {
    return (parseFloat(a) + parseFloat(b)) / 2 || 0;
  }

  function valueForControl(config) {
    const stored = getDeclaration(config.key);
    if (stored !== "") return parseFloat(stored) || 0;
    return clamp(computedNumeric(state.selected, config), config.min, config.max);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || 0));
  }

  function formatPropertyValue(config, rawValue) {
    const value = Number(rawValue);
    if (config.zeroAuto && value === 0) return "auto";
    if (config.zeroNone && value === 0) return "none";
    return `${value}${config.unit}`;
  }

  function selectElement(element, selectorOverride = "", options = {}) {
    if (!element || isInternal(element)) return;

    if (options.preserveSelectionTrail !== true) {
      state.selectionBackStack = [];
    }

    const parsed = splitPseudoSelector(selectorOverride);
    const baseSelector = parsed.base || uniqueSelector(element);
    const pseudo = options.pseudo !== undefined ? options.pseudo : parsed.pseudo;

    state.selected = element;
    state.baseSelector = baseSelector;
    state.pseudo = pseudo === "::before" || pseudo === "::after" ? pseudo : "";
    state.selector = `${state.baseSelector}${state.pseudo}`;
    refs.selector.value = state.selector;
    refs.targetName.textContent = describeElement(element, state.pseudo);
    state.exportSection = ruleSection(state.selector);
    if (refs.exportSection) refs.exportSection.value = state.exportSection;
    syncControls();
    updateHighlight(element);
    updateRuleInfo();
    updateSelectionNavigation();
  }

  function describeElement(element, pseudo = state.pseudo) {
    if (!element) return "Žádný prvek";
    const id = element.id ? `#${element.id}` : "";
    const cls = [...element.classList].slice(0, 2).map(c => `.${c}`).join("");
    return `${element.tagName.toLowerCase()}${id}${cls}${pseudo || ""}`;
  }

  function pseudoExists(element, pseudo) {
    if (!element || !pseudo) return false;
    try {
      const style = getComputedStyle(element, pseudo);
      const content = String(style.content || "").trim();
      const hasContent = content !== "none" && content !== "normal";
      const hasBox =
        (parseFloat(style.width) || 0) > 0 ||
        (parseFloat(style.height) || 0) > 0 ||
        style.backgroundColor !== "rgba(0, 0, 0, 0)";
      return style.display !== "none" && (hasContent || hasBox);
    } catch (_) {
      return false;
    }
  }

  function selectPseudo(pseudo = "") {
    if (!state.selected) {
      toast("Nejdřív vyber prvek");
      return;
    }

    const nextPseudo = pseudo === "::before" || pseudo === "::after" ? pseudo : "";
    if (nextPseudo && !pseudoExists(state.selected, nextPseudo)) {
      toast(`${nextPseudo} na tomto prvku není aktivní`);
      return;
    }

    const base = state.baseSelector || splitPseudoSelector(state.selector).base || uniqueSelector(state.selected);
    selectElement(
      state.selected,
      `${base}${nextPseudo}`,
      { preserveSelectionTrail: true, pseudo: nextPseudo }
    );
    toast(nextPseudo ? `Vybrán ${nextPseudo}` : "Vybrán skutečný prvek");
  }

  function stableElementClasses(element) {
    if (!element?.classList) return [];

    return [...element.classList].filter(name =>
      name &&
      !name.startsWith("active") &&
      !name.startsWith("open") &&
      !name.startsWith("hidden") &&
      !name.startsWith(INTERNAL_PREFIX)
    );
  }

  /*
   * Najde čitelný selektor, který reprezentuje více stejných prvků.
   * Visual Debug tak umí po výběru jednoho prvku upravit celou skupinu
   * (například všechny .taskCardIcons na kartách).
   */
  function groupSelectorInfo(element = state.selected) {
    if (!element || isInternal(element)) return null;

    const classes = stableElementClasses(element);
    if (!classes.length) return null;

    const candidates = [];
    const allClasses = classes
      .slice(0, 4)
      .map(name => `.${cssEscape(name)}`)
      .join("");

    if (allClasses) candidates.push(allClasses);

    classes.slice(0, 4).forEach(name => {
      const selector = `.${cssEscape(name)}`;
      if (!candidates.includes(selector)) candidates.push(selector);
    });

    for (const selector of candidates) {
      try {
        const elements = [...document.querySelectorAll(selector)];
        if (elements.length > 1 && elements.includes(element)) {
          return { selector, count: elements.length };
        }
      } catch (_) {}
    }

    return null;
  }

  function updateSelectionNavigation() {
    if (!refs.parentBtn || !refs.childBtn || !refs.groupBtn) return;

    const parent = state.selected?.parentElement || null;
    const canGoParent = Boolean(
      state.pseudo || (
        parent &&
        parent !== document.body &&
        parent !== document.documentElement &&
        !isInternal(parent)
      )
    );

    refs.parentBtn.disabled = !canGoParent;
    refs.childBtn.disabled = state.selectionBackStack.length === 0;

    const group = groupSelectorInfo();
    const groupSelector = group ? `${group.selector}${state.pseudo || ""}` : "";
    refs.groupBtn.disabled = !group;
    refs.groupBtn.dataset.selector = groupSelector;
    refs.groupBtn.textContent = group ? `Skupina ×${group.count}` : "Skupina";
    refs.groupBtn.title = group
      ? `Použít ${groupSelector} na ${group.count} stejných prvků`
      : "Vybraný prvek nemá opakovanou společnou třídu";
    refs.groupBtn.classList.toggle(
      "active",
      Boolean(group && state.selector === groupSelector)
    );

    if (refs.elementBtn) {
      refs.elementBtn.disabled = !state.selected;
      refs.elementBtn.classList.toggle("active", Boolean(state.selected && !state.pseudo));
    }
    if (refs.beforeBtn) {
      const exists = pseudoExists(state.selected, "::before");
      refs.beforeBtn.disabled = !exists;
      refs.beforeBtn.classList.toggle("active", state.pseudo === "::before");
      refs.beforeBtn.title = exists ? "Upravit ::before" : "Tento prvek nemá aktivní ::before";
    }
    if (refs.afterBtn) {
      const exists = pseudoExists(state.selected, "::after");
      refs.afterBtn.disabled = !exists;
      refs.afterBtn.classList.toggle("active", state.pseudo === "::after");
      refs.afterBtn.title = exists ? "Upravit ::after" : "Tento prvek nemá aktivní ::after";
    }
  }

  function selectParentElement() {
    const current = state.selected;

    if (current && state.pseudo) {
      selectPseudo("");
      return;
    }

    const parent = current?.parentElement || null;

    if (
      !current ||
      !parent ||
      parent === document.body ||
      parent === document.documentElement ||
      isInternal(parent)
    ) {
      toast("Výš už není vhodný rodič");
      return;
    }

    state.selectionBackStack.push(current);
    if (state.selectionBackStack.length > 20) {
      state.selectionBackStack.shift();
    }

    selectElement(parent, "", { preserveSelectionTrail: true });
    toast(`Rodič: ${describeElement(parent)}`);
  }

  function selectPreviousChild() {
    while (state.selectionBackStack.length) {
      const child = state.selectionBackStack.pop();
      if (!child || !document.contains(child) || isInternal(child)) continue;

      selectElement(child, "", { preserveSelectionTrail: true });
      toast(`Dítě: ${describeElement(child)}`);
      return;
    }

    updateSelectionNavigation();
    toast("Není kam se vrátit");
  }

  function selectElementGroup() {
    const group = groupSelectorInfo();

    if (!state.selected || !group) {
      toast("Pro tento prvek není společná skupina");
      return;
    }

    const selector = `${group.selector}${state.pseudo || ""}`;
    selectElement(
      state.selected,
      selector,
      { preserveSelectionTrail: true, pseudo: state.pseudo }
    );
    toast(`Skupina: ${group.count} prvků`);
  }

  function resolveSelector() {
    const selector = refs.selector.value.trim();
    if (!selector) return;
    const parsed = splitPseudoSelector(selector);
    try {
      const element = document.querySelector(parsed.base);
      if (!element) {
        toast("Selektor nebyl nalezen");
        return;
      }
      if (parsed.pseudo && !pseudoExists(element, parsed.pseudo)) {
        toast(`${parsed.pseudo} na tomto prvku není aktivní`);
        return;
      }
      selectElement(element, selector, { pseudo: parsed.pseudo });
    } catch (_) {
      toast("Neplatný CSS selektor");
    }
  }

  function pseudoRect(element, pseudo) {
    if (!element || !pseudo) return null;
    const hostRect = element.getBoundingClientRect();
    const style = getComputedStyle(element, pseudo);
    const width = parseFloat(style.width);
    const height = parseFloat(style.height);
    const left = parseFloat(style.left);
    const top = parseFloat(style.top);

    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return null;
    }

    /* Nejčastější případ v LubaNote: position:absolute na ::before/::after. */
    if (style.position === "absolute" || style.position === "fixed") {
      return {
        left: hostRect.left + (Number.isFinite(left) ? left : 0),
        top: hostRect.top + (Number.isFinite(top) ? top : 0),
        width,
        height
      };
    }

    /* U inline pseudo-prvků browser neposkytuje vlastní DOMRect; zobrazíme
       alespoň odhad od levého horního rohu hostitele. */
    return { left: hostRect.left, top: hostRect.top, width, height };
  }

  function pseudoAtPoint(element, x, y) {
    if (!element) return "";

    for (const pseudo of ["::before", "::after"]) {
      if (!pseudoExists(element, pseudo)) continue;
      const rect = pseudoRect(element, pseudo);
      if (!rect) continue;
      const tolerance = 4;
      if (
        x >= rect.left - tolerance &&
        x <= rect.left + rect.width + tolerance &&
        y >= rect.top - tolerance &&
        y <= rect.top + rect.height + tolerance
      ) {
        return pseudo;
      }
    }

    return "";
  }

  function updateHighlight(element = state.selected, pseudoOverride = undefined) {
    if (!element || !document.contains(element)) {
      refs.highlight.hidden = true;
      refs.measure.hidden = true;
      return;
    }

    const pseudo = pseudoOverride === undefined ? state.pseudo : pseudoOverride;
    const rect = pseudo ? (pseudoRect(element, pseudo) || element.getBoundingClientRect()) : element.getBoundingClientRect();
    refs.highlight.hidden = false;
    Object.assign(refs.highlight.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`
    });
    refs.measure.hidden = !state.showMeasure;
    const label = state.selector || `${uniqueSelector(element)}${pseudo || ""}`;
    refs.measure.textContent = `${label}  ${Math.round(rect.width)}×${Math.round(rect.height)} px`;
    const top = Math.max(4, rect.top - 27);
    const left = Math.min(Math.max(4, rect.left), window.innerWidth - Math.min(440, window.innerWidth - 8));
    Object.assign(refs.measure.style, { left: `${left}px`, top: `${top}px` });
  }

  function setPicking(enabled) {
    state.picking = enabled;
    document.body.classList.toggle("ln-vd-picking", enabled);
    refs.pickBtn.classList.toggle("active", enabled);
    refs.pickBtn.textContent = enabled ? "Klikni na prvek…" : "Vybrat prvek";
    if (!enabled) state.hoverTarget = null;
  }

  function onPointerMove(event) {
    if (!state.picking) return;

    /* Na dotykovém zařízení během scrollování nic nevybíráme. */
    if (event.pointerType === "touch") {
      if (state.pickGesture && event.pointerId === state.pickGesture.pointerId) {
        const dx = event.clientX - state.pickGesture.x;
        const dy = event.clientY - state.pickGesture.y;
        if (Math.hypot(dx, dy) > 10) state.pickGesture.moved = true;
      }
      return;
    }

    const target = event.target instanceof Element ? event.target : null;
    if (!target || isInternal(target)) return;
    state.hoverTarget = target;
    const pseudo = pseudoAtPoint(target, event.clientX, event.clientY);
    state.selector = `${uniqueSelector(target)}${pseudo}`;
    updateHighlight(target, pseudo);
  }

  function startPickGesture(event) {
    if (!state.picking) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target || isInternal(target)) return;

    state.pickGesture = {
      pointerId: event.pointerId,
      target,
      x: event.clientX,
      y: event.clientY,
      moved: false,
      startedAt: performance.now()
    };
  }

  function finishPickGesture(event) {
    if (!state.picking || !state.pickGesture) return;
    if (event.pointerId !== state.pickGesture.pointerId) return;

    const gesture = state.pickGesture;
    state.pickGesture = null;

    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    const moved = gesture.moved || Math.hypot(dx, dy) > 10;
    const tooLong = performance.now() - gesture.startedAt > 900;

    /* Scroll, tah nebo dlouhé podržení nikdy nesmí změnit vybraný prvek. */
    if (moved || tooLong) return;

    const target = document.elementFromPoint(event.clientX, event.clientY) || gesture.target;
    if (!(target instanceof Element) || isInternal(target)) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    state.suppressClickUntil = performance.now() + 500;
    const pseudo = pseudoAtPoint(target, event.clientX, event.clientY);
    const baseSelector = uniqueSelector(target);
    selectElement(
      target,
      `${baseSelector}${pseudo}`,
      { pseudo }
    );
    setPicking(false);
  }

  function cancelPickGesture(event) {
    if (!state.pickGesture) return;
    if (event?.pointerId != null && event.pointerId !== state.pickGesture.pointerId) return;
    state.pickGesture = null;
  }

  function suppressPostPickClick(event) {
    if (performance.now() > state.suppressClickUntil) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }


  function elementOptionLabel(element, selector) {
    const text = String(element.getAttribute("aria-label") || element.textContent || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 42);
    return text ? `${selector} — ${text}` : selector;
  }

  function refreshElementList() {
    if (!refs.elementList) return;

    const previous = refs.elementList.value;
    const seen = new Set();
    const items = [];
    const candidates = document.querySelectorAll(
      "body *:not(script):not(style):not(link):not(meta):not(option)"
    );

    candidates.forEach(element => {
      if (!(element instanceof HTMLElement) || isInternal(element)) return;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") return;
      if (rect.width < 2 || rect.height < 2) return;

      const selector = uniqueSelector(element);
      if (!selector || seen.has(selector)) return;
      seen.add(selector);
      items.push({ selector, label: elementOptionLabel(element, selector) });
    });

    items.sort((a, b) => a.label.localeCompare(b.label, "cs"));
    refs.elementList.innerHTML = '<option value="">— vyber prvek na obrazovce —</option>';

    items.forEach(item => {
      const option = document.createElement("option");
      option.value = item.selector;
      option.textContent = item.label;
      refs.elementList.appendChild(option);
    });

    if (items.some(item => item.selector === previous)) refs.elementList.value = previous;
  }

  function selectFromElementList() {
    const selector = refs.elementList?.value;
    if (!selector) return;
    refs.selector.value = selector;
    resolveSelector();
  }

  function unlockFromSecretClicks() {
    const targets = [
      /*
       * Hlavní mobilní spouštěč po odstranění loga:
       * 5× rychle klepnout na záložku „Poznámky“.
       */
      { element: document.getElementById("notesModuleButton"), clicks: 5 },

      /* Staré spouštěče ponecháváme jako kompatibilní zálohu. */
      { element: document.querySelector(".moduleLogo"), clicks: 5 },
      { element: document.querySelector(".loginLogoImage"), clicks: 5 }
    ].filter(item => item.element);

    targets.forEach(({ element, clicks }) => {
      element.addEventListener("click", () => {
        const now = performance.now();
        state.unlockClicks = state.unlockClicks.filter(time => now - time < 2200);
        state.unlockClicks.push(now);

        if (state.unlockClicks.length >= clicks) {
          state.unlockClicks = [];
          state.unlocked = true;
          pripravVisualDebug();
          setDebugUiVisible(true, true);
          refreshElementList();
          updateRuleInfo();
          toast("Visual Debug odemčen");
        }
      }, true);
    });
  }

  function syncControls() {
    propertyConfig.forEach(config => {
      const range = refs.controls.get(config.key)?.range;
      const number = refs.controls.get(config.key)?.number;
      if (!range || !number) return;
      const value = valueForControl(config);
      range.value = value;
      number.value = Number(value.toFixed(config.step < 1 ? 2 : 0));
    });

    if (state.selected) {
      const style = selectedComputedStyle();
      refs.textColor.value = rgbToHex(style.color) || "#ffffff";
      refs.bgColor.value = rgbToHex(style.backgroundColor) || "#001015";
      refs.borderColor.value = rgbToHex(style.borderColor) || "#18ef7d";
      refs.glowColor.value = getDeclaration("--ln-vd-glow-color") || "#18ef7d";
      refs.textAlign.value = getDeclaration("text-align") || style.textAlign || "left";
      refs.display.value = getDeclaration("display") || style.display || "block";
    }
  }

  function rgbToHex(rgb) {
    const values = String(rgb).match(/[\d.]+/g);
    if (!values || values.length < 3) return "";
    const [r, g, b] = values.slice(0, 3).map(v => Math.round(Number(v)));
    return `#${[r, g, b].map(v => v.toString(16).padStart(2, "0")).join("")}`;
  }

  function updateRuleInfo() {
    const current = currentRule(false) || {};
    refs.ruleCount.textContent = String(Object.keys(current).length);
    refs.totalCount.textContent = String(
      Object.values(state.rules).reduce((sum, profile) => sum + Object.keys(profile || {}).length, 0)
    );
    refs.viewport.textContent = `${window.innerWidth}×${window.innerHeight}`;
    refs.breakpoint.textContent = window.innerWidth <= 899 ? "mobil" : (window.innerWidth <= 1199 ? "tablet" : "desktop");
  }

  function resetSelected() {
    if (!state.selector) return;
    pushHistory();

    const baseline = state.baselineRules[state.profile]?.[state.selector];
    if (baseline) {
      state.rules[state.profile][state.selector] = JSON.parse(JSON.stringify(baseline));
      state.ruleSections[state.profile][state.selector] =
        state.baselineSections[state.profile]?.[state.selector] || "HOME / NOTES";
    } else {
      delete state.rules[state.profile][state.selector];
      delete state.ruleSections[state.profile]?.[state.selector];
    }

    saveRules();
    syncControls();
    updateHighlight();
    toast("Prvek je zpět na stavu z načteného CSS");
  }

  function resetAll() {
    clearLegacyCommittedMirror();
    pushHistory();
    state.rules = JSON.parse(JSON.stringify(state.baselineRules));
    state.ruleSections = JSON.parse(JSON.stringify(state.baselineSections));
    saveRules();
    syncControls();
    updateHighlight();
    toast("Relace je zpět na stavu z načteného CSS");
  }

  function undo() {
    const previous = state.history.pop();
    if (!previous) {
      toast("Není co vrátit");
      return;
    }
    const restored = JSON.parse(previous);
    state.rules = restored.rules || { all: {}, mobile: {}, tablet: {}, desktop: {} };
    state.ruleSections = restored.ruleSections || { all: {}, mobile: {}, tablet: {}, desktop: {} };
    saveRules();
    syncControls();
    toast("Poslední změna vrácena");
  }

  function totalEditedSelectors() {
    return ["all", "mobile", "tablet", "desktop"].reduce((sum, profile) => {
      return sum + Object.values(state.rules[profile] || {}).filter(
        declarations => declarations && Object.keys(declarations).length
      ).length;
    }, 0);
  }

  async function copyCss() {
    const css = generateCss();
    try {
      await navigator.clipboard.writeText(css);
      toast(`Zkopírováno celé CSS (${totalEditedSelectors()} selektorů)`);
    } catch (_) {
      downloadText("lubanote-debug.css", css);
      toast(`Staženo celé CSS (${totalEditedSelectors()} selektorů)`);
    }
  }

  function downloadCss() {
    downloadText("lubanote-debug-complete.css", generateCss());
    toast(`Staženo celé CSS (${totalEditedSelectors()} selektorů)`);
  }

  function downloadJson() {
    downloadText("lubanote-debug-preset.json", JSON.stringify(state.rules, null, 2));
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function saveSnapshot() {
    toast("Snapshoty jsou vypnuté — nic se neukládá do prohlížeče");
  }

  function restoreSnapshot() {
    toast("Snapshoty jsou vypnuté — relace je pouze v paměti");
  }

  function importPreset(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!parsed.mobile || !parsed.desktop || !parsed.all) throw new Error("bad format");
        pushHistory();
        state.rules = parsed;
        saveRules();
        syncControls();
        toast("Preset importován");
      } catch (_) {
        toast("Soubor není platný debug preset");
      }
    };
    reader.readAsText(file);
  }

  function toast(message) {
    refs.toast.textContent = message;
    refs.toast.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { refs.toast.hidden = true; }, 2200);
  }

  function togglePanel(force) {
    if (!state.unlocked && force !== false) {
      state.unlocked = true;
    }

    const nextOpen = typeof force === "boolean" ? force : !state.panelOpen;
    setDebugUiVisible(nextOpen, state.unlocked);

    if (state.panelOpen) {
      refreshElementList();
      updateRuleInfo();
      if (state.selected) updateHighlight();
    } else {
      setPicking(false);
      refs.highlight.hidden = true;
      refs.measure.hidden = true;
    }
    savePanelState();
  }

  function savePanelState() {
    /* Záměrně prázdné: Visual Debug nic neukládá do prohlížeče. */
  }

  function restorePanelState() {
    state.profile = window.innerWidth <= 899 ? "mobile" : (window.innerWidth <= 1199 ? "tablet" : "desktop");
    state.activeTab = "layout";
    refs.profile.value = state.profile;
    activateTab("layout");
    state.showMeasure = true;
    state.exportSection = "HOME / NOTES";
    refs.toggleMeasure.textContent = "Skrýt název objektu";
    refs.exportSection.value = state.exportSection;
    state.minimized = false;
    refs.panel.classList.remove("ln-vd-minimized");
    applyPanelOpacity(0.92, false);
    setDebugUiVisible(false, false);
  }

  function applyPanelOpacity(value, persist = true) {
    state.panelOpacity = clamp(value, 0.35, 1);
    refs.panel.style.setProperty("--ln-vd-panel-opacity", String(state.panelOpacity));
    if (refs.panelOpacity) refs.panelOpacity.value = String(Math.round(state.panelOpacity * 100));
    if (refs.panelOpacityValue) refs.panelOpacityValue.textContent = `${Math.round(state.panelOpacity * 100)} %`;
    if (persist) savePanelState();
  }

  function setPanelPosition(left, top) {
    refs.panel.style.setProperty("left", `${Math.round(left)}px`, "important");
    refs.panel.style.setProperty("top", `${Math.round(top)}px`, "important");
    refs.panel.style.setProperty("right", "auto", "important");
    refs.panel.style.setProperty("bottom", "auto", "important");
  }

  function setDebugUiVisible(open, unlocked = state.unlocked) {
    state.panelOpen = Boolean(open);
    state.unlocked = Boolean(unlocked);

    if (state.unlocked) {
      refs.quickbar.hidden = false;
      refs.quickbar.style.removeProperty("display");
    } else {
      refs.quickbar.hidden = true;
      refs.quickbar.style.setProperty("display", "none", "important");
    }

    if (state.panelOpen && state.unlocked) {
      refs.panel.hidden = false;
      refs.panel.style.removeProperty("display");
    } else {
      refs.panel.hidden = true;
      refs.panel.style.setProperty("display", "none", "important");
    }

    refs.fab.setAttribute("aria-expanded", String(state.panelOpen));
  }

  function centerPanel() {
    const rect = refs.panel.getBoundingClientRect();
    const left = Math.max(0, Math.round((window.innerWidth - rect.width) / 2));
    const top = Math.max(0, Math.round((window.innerHeight - Math.min(rect.height, window.innerHeight)) / 2));
    setPanelPosition(left, top);
    savePanelState();
  }

  function resetPanelPosition() {
    refs.panel.style.setProperty("left", "auto", "important");
    refs.panel.style.setProperty("top", "12px", "important");
    refs.panel.style.setProperty("right", "12px", "important");
    refs.panel.style.setProperty("bottom", "auto", "important");
    savePanelState();
  }

  function activateTab(tab) {
    state.activeTab = tab;
    refs.tabs.forEach(button => button.classList.toggle("active", button.dataset.tab === tab));
    refs.panes.forEach(pane => { pane.hidden = pane.dataset.pane !== tab; });
    savePanelState();
  }

  function dragPointFromEvent(event) {
    const touch = event.touches?.[0] || event.changedTouches?.[0];
    return touch
      ? { x: touch.clientX, y: touch.clientY, id: "touch" }
      : { x: event.clientX, y: event.clientY, id: event.pointerId ?? "mouse" };
  }

  function startDrag(event) {
    if (state.drag) return;
    if (event.button != null && event.button !== 0) return;
    if (event.target.closest("button, input, select, textarea, label, a")) return;

    const point = dragPointFromEvent(event);
    const rect = refs.panel.getBoundingClientRect();
    state.drag = {
      pointerId: point.id,
      x: point.x,
      y: point.y,
      left: rect.left,
      top: rect.top
    };

    refs.panel.classList.add("ln-vd-dragging");
    if (event.pointerId != null) {
      try { refs.head.setPointerCapture?.(event.pointerId); } catch (_) {}
    }
    event.preventDefault();
    event.stopPropagation();
  }

  function moveDrag(event) {
    if (!state.drag) return;
    const point = dragPointFromEvent(event);
    if (state.drag.pointerId !== point.id && state.drag.pointerId !== "touch") return;

    const panelWidth = refs.panel.offsetWidth;
    const panelHeight = refs.panel.offsetHeight;
    const keepVisible = Math.min(72, panelHeight);
    const maxLeft = Math.max(0, window.innerWidth - Math.min(70, panelWidth));
    const maxTop = Math.max(0, window.innerHeight - keepVisible);

    const left = clamp(
      state.drag.left + point.x - state.drag.x,
      Math.min(0, 70 - panelWidth),
      maxLeft
    );
    const top = clamp(
      state.drag.top + point.y - state.drag.y,
      0,
      maxTop
    );

    setPanelPosition(left, top);
    event.preventDefault();
    event.stopPropagation();
  }

  function endDrag(event) {
    if (!state.drag) return;
    const point = dragPointFromEvent(event || {});
    if (event?.pointerId != null && state.drag.pointerId !== point.id) return;
    state.drag = null;
    refs.panel.classList.remove("ln-vd-dragging");
    savePanelState();
  }

  function toggleMinimize() {
    state.minimized = !state.minimized;
    refs.panel.classList.toggle("ln-vd-minimized", state.minimized);
    refs.minimize.setAttribute("aria-expanded", String(!state.minimized));
    refs.minimize.textContent = state.minimized ? "▢" : "—";
    savePanelState();
  }

  function activePropertyConfig() {
    return propertyConfig.find(config => config.key === state.activeProperty) || null;
  }

  function setActiveProperty(config) {
    if (!config) return;
    state.activeProperty = config.key;
    refs.quickLabel.textContent = config.label;
    refs.quickbar.dataset.ready = state.selected ? "true" : "false";
    refs.controls.forEach((control, key) => {
      control.row?.classList.toggle("ln-vd-control-active", key === config.key);
    });
  }

  function adjustActiveProperty(direction) {
    const config = activePropertyConfig();
    if (!state.selected || !state.selector) {
      toast("Nejdřív vyber prvek");
      return false;
    }
    if (!config) {
      toast("Nejdřív klepni na parametr v panelu");
      return false;
    }

    const current = valueForControl(config);
    const decimals = config.step < 1 ? 2 : 0;
    const next = Number(clamp(current + direction * config.step, config.min, config.max).toFixed(decimals));
    setDeclaration(config.key, formatPropertyValue(config, next));

    const control = refs.controls.get(config.key);
    if (control) {
      control.range.value = next;
      control.number.value = next;
    }
    updateHighlight();
    refs.quickValue.textContent = `${next}${config.unit}`;
    return true;
  }

  function stopQuickPressRepeat() {
    if (state.quickPressDelay) clearTimeout(state.quickPressDelay);
    if (state.quickPressInterval) clearInterval(state.quickPressInterval);
    state.quickPressDelay = null;
    state.quickPressInterval = null;
    state.quickPressPointerId = null;
    refs.quickMinus?.classList.remove("ln-vd-quick-pressing");
    refs.quickPlus?.classList.remove("ln-vd-quick-pressing");
  }

  function startQuickPressRepeat(event, direction) {
    if (event.button != null && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    stopQuickPressRepeat();

    if (!adjustActiveProperty(direction)) return;

    const button = event.currentTarget;
    state.quickPressPointerId = event.pointerId ?? "mouse";
    button.classList.add("ln-vd-quick-pressing");
    try { button.setPointerCapture?.(event.pointerId); } catch (_) {}

    state.quickPressDelay = setTimeout(() => {
      state.quickPressInterval = setInterval(() => {
        adjustActiveProperty(direction);
      }, 70);
    }, 320);
  }

  function endQuickPressRepeat(event) {
    if (state.quickPressPointerId == null) return;
    if (event?.pointerId != null && state.quickPressPointerId !== event.pointerId) return;
    stopQuickPressRepeat();
  }

  function enterQuickMode() {
    if (!state.selected || !state.selector) {
      toast("Nejdřív vyber prvek");
      return;
    }
    if (!activePropertyConfig()) {
      toast("Klepni nejdřív na parametr, který chceš ladit");
      return;
    }
    togglePanel(false);
    refs.quickbar.classList.add("ln-vd-quick-active");
    refs.quickLabel.textContent = activePropertyConfig().label;
    refs.quickValue.textContent = String(valueForControl(activePropertyConfig()));
    toast("Rychlé ladění: použij − a +");
  }

  function toggleQuickPanel() {
    if (state.panelOpen) enterQuickMode();
    else {
      refs.quickbar.classList.remove("ln-vd-quick-active");
      togglePanel(true);
    }
  }

  function setQuickbarPosition(left, top) {
    refs.quickbar.style.setProperty("left", `${Math.round(left)}px`, "important");
    refs.quickbar.style.setProperty("top", `${Math.round(top)}px`, "important");
    refs.quickbar.style.setProperty("right", "auto", "important");
    refs.quickbar.style.setProperty("bottom", "auto", "important");
  }

  function startQuickDrag(event) {
    if (event.button != null && event.button !== 0) return;
    const rect = refs.quickbar.getBoundingClientRect();
    state.quickDrag = {
      pointerId: event.pointerId ?? "mouse",
      x: event.clientX,
      y: event.clientY,
      left: rect.left,
      top: rect.top
    };
    state.quickMoved = false;
    try { refs.quickbar.setPointerCapture?.(event.pointerId); } catch (_) {}
  }

  function moveQuickDrag(event) {
    if (!state.quickDrag) return;
    if (event.pointerId != null && state.quickDrag.pointerId !== event.pointerId) return;
    const dx = event.clientX - state.quickDrag.x;
    const dy = event.clientY - state.quickDrag.y;
    if (Math.hypot(dx, dy) < 7 && !state.quickMoved) return;
    state.quickMoved = true;
    const rect = refs.quickbar.getBoundingClientRect();
    const left = clamp(state.quickDrag.left + dx, 0, Math.max(0, window.innerWidth - rect.width));
    const top = clamp(state.quickDrag.top + dy, 0, Math.max(0, window.innerHeight - rect.height));
    setQuickbarPosition(left, top);
    event.preventDefault();
  }

  function endQuickDrag(event) {
    if (!state.quickDrag) return;
    if (event?.pointerId != null && state.quickDrag.pointerId !== event.pointerId) return;
    state.quickDrag = null;
    setTimeout(() => { state.quickMoved = false; }, 0);
  }

  function createControl(config) {
    const row = document.createElement("div");
    row.className = "ln-vd-control";
    row.innerHTML = `
      <label>${config.label}</label>
      <input class="ln-vd-range" type="range" min="${config.min}" max="${config.max}" step="${config.step}">
      <input class="ln-vd-value" type="number" min="${config.min}" max="${config.max}" step="${config.step}">
    `;
    const range = row.children[1];
    const number = row.children[2];
    row.dataset.property = config.key;
    const activate = () => setActiveProperty(config);
    row.addEventListener("pointerdown", activate);
    range.addEventListener("focus", activate);
    number.addEventListener("focus", activate);

    const apply = raw => {
      const value = clamp(raw, config.min, config.max);
      range.value = value;
      number.value = value;
      setDeclaration(config.key, formatPropertyValue(config, value));
      updateHighlight();
    };
    range.addEventListener("input", () => apply(range.value));
    number.addEventListener("change", () => apply(number.value));
    refs.controls.set(config.key, { range, number, row });
    return row;
  }

  function buildPanel() {
    const quickbar = document.createElement("div");
    quickbar.id = "ln-vd-quickbar";
    quickbar.hidden = true;
    quickbar.innerHTML = `
      <button id="ln-vd-quick-minus" type="button" aria-label="Zmenšit hodnotu">−</button>
      <button id="ln-vd-fab" type="button" title="Otevřít nebo skrýt Visual Debug" aria-label="Visual Debug">🛠</button>
      <button id="ln-vd-quick-plus" type="button" aria-label="Zvětšit hodnotu">+</button>
      <span id="ln-vd-quick-status"><b id="ln-vd-quick-label">parametr</b><small id="ln-vd-quick-value">–</small></span>
    `;
    const fab = quickbar.querySelector("#ln-vd-fab");

    const panel = document.createElement("aside");
    panel.id = "ln-vd-panel";
    panel.hidden = true;
    panel.innerHTML = `
      <div class="ln-vd-head">
        <div class="ln-vd-drag-handle" id="ln-vd-drag-handle" title="Táhni prstem nebo myší">⠿</div>
        <div class="ln-vd-title">
          <strong>Visual Debug</strong>
          <small id="ln-vd-target-name">Žádný prvek</small>
        </div>
        <button class="ln-vd-icon-btn" id="ln-vd-undo" type="button" title="Zpět">↶</button>
        <button class="ln-vd-icon-btn" id="ln-vd-minimize" type="button" title="Sbalit panel" aria-expanded="true">—</button>
        <button class="ln-vd-icon-btn" id="ln-vd-close" type="button" title="Zavřít">×</button>
      </div>
      <div class="ln-vd-body">
        <section class="ln-vd-section ln-vd-panel-tools">
          <div class="ln-vd-section-title"><span>Panel</span><span>Táhni za zelenou hlavičku</span></div>
          <div class="ln-vd-panel-opacity-row">
            <label for="ln-vd-panel-opacity">Průhlednost</label>
            <input id="ln-vd-panel-opacity" class="ln-vd-range" type="range" min="35" max="100" step="1" value="92">
            <output id="ln-vd-panel-opacity-value">92 %</output>
          </div>
          <div class="ln-vd-actions" style="margin-top:8px !important">
            <button id="ln-vd-center-panel" class="ln-vd-btn" type="button">Vycentrovat panel</button>
            <button id="ln-vd-reset-panel-position" class="ln-vd-btn" type="button">Vrátit doprava</button>
            <button id="ln-vd-toggle-measure" class="ln-vd-btn" type="button">Skrýt název objektu</button>
          </div>
        </section>

        <section class="ln-vd-section">
          <div class="ln-vd-section-title"><span>Výběr prvku</span><span id="ln-vd-profile-badge"></span></div>
          <div class="ln-vd-target">
            <textarea id="ln-vd-selector" class="ln-vd-selector" rows="1" placeholder="#id nebo .class" autocomplete="one-time-code" data-form-type="other" data-lpignore="true" data-1p-ignore="true" data-bwignore="true"></textarea>
            <button id="ln-vd-resolve" class="ln-vd-btn" type="button">Použít</button>
          </div>
          <div class="ln-vd-actions" style="margin-top:8px !important">
            <button id="ln-vd-pick" class="ln-vd-btn primary" type="button">Vybrat prvek</button>
            <select id="ln-vd-profile" class="ln-vd-select" aria-label="Profil">
              <option value="mobile">Mobil ≤899</option>
              <option value="tablet">Tablet 900–1199</option>
              <option value="desktop">Desktop ≥1200</option>
            </select>
          </div>
          <div class="ln-vd-actions three ln-vd-selection-nav" style="margin-top:8px !important">
            <button id="ln-vd-parent" class="ln-vd-btn" type="button" disabled>↑ Rodič</button>
            <button id="ln-vd-child" class="ln-vd-btn" type="button" disabled>↓ Dítě</button>
            <button id="ln-vd-group" class="ln-vd-btn" type="button" disabled>Skupina</button>
          </div>
          <div class="ln-vd-actions three ln-vd-pseudo-nav" style="margin-top:8px !important">
            <button id="ln-vd-element" class="ln-vd-btn" type="button" disabled>Prvek</button>
            <button id="ln-vd-before" class="ln-vd-btn" type="button" disabled>::before</button>
            <button id="ln-vd-after" class="ln-vd-btn" type="button" disabled>::after</button>
          </div>
        </section>

        <div class="ln-vd-tabs">
          <button class="ln-vd-tab active" data-tab="layout" type="button">Rozměry</button>
          <button class="ln-vd-tab" data-tab="text" type="button">Text</button>
          <button class="ln-vd-tab" data-tab="style" type="button">Styl</button>
          <button class="ln-vd-tab" data-tab="position" type="button">Pozice</button>
        </div>

        <section class="ln-vd-section ln-vd-pane" data-pane="layout"><div id="ln-vd-layout-controls"></div></section>
        <section class="ln-vd-section ln-vd-pane" data-pane="text" hidden>
          <div id="ln-vd-text-controls"></div>
          <div class="ln-vd-control">
            <label>Zarovnání</label>
            <select id="ln-vd-text-align" class="ln-vd-select">
              <option value="left">Vlevo</option><option value="center">Na střed</option><option value="right">Vpravo</option><option value="justify">Do bloku</option>
            </select><span></span>
          </div>
        </section>
        <section class="ln-vd-section ln-vd-pane" data-pane="style" hidden>
          <div id="ln-vd-style-controls"></div>
          <div class="ln-vd-color-row">
            <label class="ln-vd-color-field">Text <input id="ln-vd-text-color" type="color"></label>
            <label class="ln-vd-color-field">Pozadí <input id="ln-vd-bg-color" type="color"></label>
            <label class="ln-vd-color-field">Rámeček <input id="ln-vd-border-color" type="color"></label>
            <label class="ln-vd-color-field">Glow <input id="ln-vd-glow-color" type="color"></label>
          </div>
        </section>
        <section class="ln-vd-section ln-vd-pane" data-pane="position" hidden>
          <div id="ln-vd-position-controls"></div>
          <div class="ln-vd-control">
            <label>Display</label>
            <select id="ln-vd-display" class="ln-vd-select">
              <option value="block">block</option><option value="flex">flex</option><option value="grid">grid</option><option value="inline-flex">inline-flex</option><option value="none">none</option>
            </select><span></span>
          </div>
          <button id="ln-vd-free-move" class="ln-vd-btn primary" type="button">Uvolnit překrytí prvku</button>
        </section>

        <section class="ln-vd-section">
          <div class="ln-vd-section-title">Pomůcky</div>
          <div class="ln-vd-actions three">
            <button id="ln-vd-grid-btn" class="ln-vd-btn" type="button">Mřížka</button>
            <button id="ln-vd-outline-btn" class="ln-vd-btn" type="button">Obrysy</button>
            <button id="ln-vd-refresh" class="ln-vd-btn" type="button">Přeměřit</button>
          </div>
        </section>

        <section class="ln-vd-section">
          <div class="ln-vd-section-title"><span>Hotové CSS relace</span><span>nic se neukládá lokálně</span></div>
          <div class="ln-vd-auto-save">
            <select id="ln-vd-export-section" class="ln-vd-select" aria-label="Sekce CSS">
              <option>LOGIN</option><option>HOME / NOTES</option><option>EDITOR</option>
              <option>PLANNER</option><option>REMINDERS</option><option>TAGS / FILTERS</option>
              <option>TODO / MEDIA</option><option>SETTINGS</option><option>SECRET</option>
              <option>DIALOGS / MODALS</option>
            </select>
            <button id="ln-vd-copy-project-css" class="ln-vd-btn primary" type="button">Kopírovat hotové CSS</button>
            <button id="ln-vd-download-project-css" class="ln-vd-btn" type="button">Stáhnout hotové CSS</button>
            <small id="ln-vd-css-file-status">Uprav klidně více objektů. Export obsahuje celou relaci a zachová dřívější obsah zvoleného generated CSS.</small>
          </div>
        </section>

        <section class="ln-vd-section">
          <div class="ln-vd-section-title">Rozpracovaná relace</div>
          <div class="ln-vd-actions">
            <button id="ln-vd-reset-selected" class="ln-vd-btn" type="button">Vrátit rozpracovaný prvek</button>
            <button id="ln-vd-reset-all" class="ln-vd-btn danger" type="button">Zahodit celou relaci</button>
          </div>
        </section>

        <section class="ln-vd-section">
          <div class="ln-vd-info">
            <div>Viewport: <b id="ln-vd-viewport">–</b></div>
            <div>Režim: <b id="ln-vd-breakpoint">–</b></div>
            <div>Vlastnosti prvku: <b id="ln-vd-rule-count">0</b></div>
            <div>Upravené selektory: <b id="ln-vd-total-count">0</b></div>
          </div>
        </section>
      </div>
    `;

    const highlight = document.createElement("div");
    highlight.id = "ln-vd-highlight";
    highlight.hidden = true;
    const measure = document.createElement("div");
    measure.id = "ln-vd-measure";
    measure.hidden = true;
    const toastEl = document.createElement("div");
    toastEl.id = "ln-vd-toast";
    toastEl.hidden = true;
    const grid = document.createElement("div");
    grid.id = "ln-vd-grid";
    grid.hidden = true;

    document.body.append(quickbar, panel, highlight, measure, toastEl, grid);

    refs = {
      fab,
      quickbar,
      quickMinus: quickbar.querySelector("#ln-vd-quick-minus"),
      quickPlus: quickbar.querySelector("#ln-vd-quick-plus"),
      quickLabel: quickbar.querySelector("#ln-vd-quick-label"),
      quickValue: quickbar.querySelector("#ln-vd-quick-value"),
      panel,
      head: panel.querySelector(".ln-vd-head"),
      dragHandle: panel.querySelector("#ln-vd-drag-handle"),
      close: panel.querySelector("#ln-vd-close"),
      minimize: panel.querySelector("#ln-vd-minimize"),
      panelOpacity: panel.querySelector("#ln-vd-panel-opacity"),
      panelOpacityValue: panel.querySelector("#ln-vd-panel-opacity-value"),
      centerPanel: panel.querySelector("#ln-vd-center-panel"),
      resetPanelPosition: panel.querySelector("#ln-vd-reset-panel-position"),
      toggleMeasure: panel.querySelector("#ln-vd-toggle-measure"),
      exportSection: panel.querySelector("#ln-vd-export-section"),
      copyProjectCss: panel.querySelector("#ln-vd-copy-project-css"),
      downloadProjectCss: panel.querySelector("#ln-vd-download-project-css"),
      copyCurrent: panel.querySelector("#ln-vd-copy-current"),
      freeMove: panel.querySelector("#ln-vd-free-move"),
      cssFileStatus: panel.querySelector("#ln-vd-css-file-status"),
      undo: panel.querySelector("#ln-vd-undo"),
      targetName: panel.querySelector("#ln-vd-target-name"),
      selector: panel.querySelector("#ln-vd-selector"),
      resolve: panel.querySelector("#ln-vd-resolve"),
      pickBtn: panel.querySelector("#ln-vd-pick"),
      parentBtn: panel.querySelector("#ln-vd-parent"),
      childBtn: panel.querySelector("#ln-vd-child"),
      groupBtn: panel.querySelector("#ln-vd-group"),
      elementBtn: panel.querySelector("#ln-vd-element"),
      beforeBtn: panel.querySelector("#ln-vd-before"),
      afterBtn: panel.querySelector("#ln-vd-after"),
      elementList: panel.querySelector("#ln-vd-element-list"),
      elementsRefresh: panel.querySelector("#ln-vd-elements-refresh"),
      profile: panel.querySelector("#ln-vd-profile"),
      tabs: [...panel.querySelectorAll(".ln-vd-tab")],
      panes: [...panel.querySelectorAll(".ln-vd-pane")],
      controls: new Map(),
      textAlign: panel.querySelector("#ln-vd-text-align"),
      display: panel.querySelector("#ln-vd-display"),
      textColor: panel.querySelector("#ln-vd-text-color"),
      bgColor: panel.querySelector("#ln-vd-bg-color"),
      borderColor: panel.querySelector("#ln-vd-border-color"),
      glowColor: panel.querySelector("#ln-vd-glow-color"),
      highlight,
      measure,
      toast: toastEl,
      grid,
      gridBtn: panel.querySelector("#ln-vd-grid-btn"),
      outlineBtn: panel.querySelector("#ln-vd-outline-btn"),
      viewport: panel.querySelector("#ln-vd-viewport"),
      breakpoint: panel.querySelector("#ln-vd-breakpoint"),
      ruleCount: panel.querySelector("#ln-vd-rule-count"),
      totalCount: panel.querySelector("#ln-vd-total-count")
    };

    propertyConfig.forEach(config => {
      const host = panel.querySelector(`#ln-vd-${config.tab}-controls`);
      host?.appendChild(createControl(config));
    });

    wireEvents();

    /*
     * Debug Hub se vytváří až po tajném odemčení Visual Debugu.
     * Tím v běžném provozu neběží žádné diagnostické posluchače.
     */
    document.dispatchEvent(
      new CustomEvent("lubanote:visual-debug-ready", {
        detail: { panel }
      })
    );
  }

  function wireEvents() {
    refs.fab.addEventListener("click", event => {
      if (state.quickMoved) return;
      event.stopPropagation();
      toggleQuickPanel();
    });
    refs.quickMinus.addEventListener("pointerdown", event => startQuickPressRepeat(event, -1));
    refs.quickPlus.addEventListener("pointerdown", event => startQuickPressRepeat(event, 1));
    refs.quickMinus.addEventListener("pointerup", endQuickPressRepeat);
    refs.quickPlus.addEventListener("pointerup", endQuickPressRepeat);
    refs.quickMinus.addEventListener("pointercancel", endQuickPressRepeat);
    refs.quickPlus.addEventListener("pointercancel", endQuickPressRepeat);
    refs.quickMinus.addEventListener("lostpointercapture", endQuickPressRepeat);
    refs.quickPlus.addEventListener("lostpointercapture", endQuickPressRepeat);
    refs.quickMinus.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      if (event.detail === 0) adjustActiveProperty(-1);
    });
    refs.quickPlus.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      if (event.detail === 0) adjustActiveProperty(1);
    });
    refs.quickbar.addEventListener("pointerdown", startQuickDrag, { passive: true });
    refs.quickbar.addEventListener("pointermove", moveQuickDrag, { passive: false });
    refs.quickbar.addEventListener("pointerup", endQuickDrag);
    refs.quickbar.addEventListener("pointercancel", endQuickDrag);
    window.addEventListener("pointerup", endQuickPressRepeat, true);
    window.addEventListener("pointercancel", endQuickPressRepeat, true);
    window.addEventListener("blur", stopQuickPressRepeat);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopQuickPressRepeat();
    });
    refs.close.addEventListener("click", () => togglePanel(false));
    refs.minimize.addEventListener("click", toggleMinimize);
    refs.panelOpacity.addEventListener("input", () => {
      applyPanelOpacity(Number(refs.panelOpacity.value) / 100);
    });
    refs.centerPanel.addEventListener("click", centerPanel);
    refs.resetPanelPosition.addEventListener("click", resetPanelPosition);
    refs.toggleMeasure.addEventListener("click", () => {
      state.showMeasure = !state.showMeasure;
      refs.toggleMeasure.textContent = state.showMeasure ? "Skrýt název objektu" : "Zobrazit název objektu";
      if (state.selected) updateHighlight();
      savePanelState();
    });
    refs.exportSection.addEventListener("change", () => {
      state.exportSection = refs.exportSection.value;
      if (state.selector && currentRule(false)) rememberRuleSection();
    });
    refs.copyProjectCss.addEventListener("click", copyUpdatedDebugMobileCss);
    refs.downloadProjectCss.addEventListener("click", downloadUpdatedDebugMobileCss);
    refs.copyCurrent?.addEventListener("click", copyCurrentRule);
    refs.freeMove?.addEventListener("click", freeSelectedMovement);
    refs.undo.addEventListener("click", undo);
    refs.pickBtn.addEventListener("click", () => setPicking(!state.picking));
    refs.parentBtn?.addEventListener("click", selectParentElement);
    refs.childBtn?.addEventListener("click", selectPreviousChild);
    refs.groupBtn?.addEventListener("click", selectElementGroup);
    refs.elementBtn?.addEventListener("click", () => selectPseudo(""));
    refs.beforeBtn?.addEventListener("click", () => selectPseudo("::before"));
    refs.afterBtn?.addEventListener("click", () => selectPseudo("::after"));
    refs.elementList?.addEventListener("change", selectFromElementList);
    refs.elementsRefresh?.addEventListener("click", refreshElementList);
    refs.resolve.addEventListener("click", resolveSelector);
    refs.selector.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        resolveSelector();
      }
    });

    refs.profile.addEventListener("change", () => {
      state.profile = refs.profile.value;
      preloadProjectCss();
      syncControls();
      updateRuleInfo();
    });

    refs.tabs.forEach(button => button.addEventListener("click", () => activateTab(button.dataset.tab)));

    refs.textAlign.addEventListener("change", () => setDeclaration("text-align", refs.textAlign.value));
    refs.display.addEventListener("change", () => setDeclaration("display", refs.display.value));
    refs.textColor.addEventListener("input", () => setDeclaration("color", refs.textColor.value));
    refs.bgColor.addEventListener("input", () => setDeclaration("background-color", refs.bgColor.value));
    refs.borderColor.addEventListener("input", () => setDeclaration("border-color", refs.borderColor.value));
    refs.glowColor.addEventListener("input", () => setDeclaration("--ln-vd-glow-color", refs.glowColor.value));

    refs.gridBtn.addEventListener("click", () => {
      state.grid = !state.grid;
      refs.grid.hidden = !state.grid;
      refs.gridBtn.classList.toggle("active", state.grid);
    });
    refs.outlineBtn.addEventListener("click", () => {
      state.outlines = !state.outlines;
      document.body.classList.toggle("ln-vd-outlines", state.outlines);
      refs.outlineBtn.classList.toggle("active", state.outlines);
    });
    refs.panel.querySelector("#ln-vd-refresh").addEventListener("click", () => { syncControls(); updateHighlight(); });

    refs.panel.querySelector("#ln-vd-copy")?.addEventListener("click", copyCss);
    refs.panel.querySelector("#ln-vd-download")?.addEventListener("click", downloadCss);
    refs.panel.querySelector("#ln-vd-reset-selected").addEventListener("click", resetSelected);
    refs.panel.querySelector("#ln-vd-reset-all").addEventListener("click", resetAll);

    document.addEventListener("pointerdown", startPickGesture, true);
    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("pointerup", finishPickGesture, true);
    document.addEventListener("pointercancel", cancelPickGesture, true);
    document.addEventListener("click", suppressPostPickClick, true);
    window.addEventListener("scroll", () => state.panelOpen && updateHighlight(), true);
    window.addEventListener("resize", () => {
      updateRuleInfo();
      if (state.panelOpen) {
        updateHighlight();
        const rect = refs.panel.getBoundingClientRect();
        if (rect.left > window.innerWidth - 70 || rect.top > window.innerHeight - 54) resetPanelPosition();
      }
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && state.picking) setPicking(false);
    });

    /* Panel lze táhnout za celé záhlaví kromě jeho tlačítek.
       Pohyb sledujeme na window, takže tažení nepřestane po opuštění madla. */
    refs.head.addEventListener("pointerdown", startDrag, { passive: false });
    window.addEventListener("pointermove", moveDrag, { passive: false, capture: true });
    window.addEventListener("pointerup", endDrag, { passive: false, capture: true });
    window.addEventListener("pointercancel", endDrag, { passive: false, capture: true });

    /* Dotykový fallback je záměrně aktivní i ve WebView s neúplnými Pointer Events. */
    refs.head.addEventListener("touchstart", startDrag, { passive: false });
    window.addEventListener("touchmove", moveDrag, { passive: false, capture: true });
    window.addEventListener("touchend", endDrag, { passive: false, capture: true });
    window.addEventListener("touchcancel", endDrag, { passive: false, capture: true });
  }

  function pripravVisualDebug() {
    if (visualDebugPripraven) return;

    clearOldStoredDebugData();
    state.rules = { all: {}, mobile: {}, tablet: {}, desktop: {} };
    state.ruleSections = { all: {}, mobile: {}, tablet: {}, desktop: {} };
    state.baselineRules = { all: {}, mobile: {}, tablet: {}, desktop: {} };
    state.baselineSections = { all: {}, mobile: {}, tablet: {}, desktop: {} };
    renderRuntimeCss();
    buildPanel();
    restorePanelState();
    updateRuleInfo();
    visualDebugPripraven = true;
    refreshProjectCssSource();

    /* Po odemčení nesmí být vybraný ani orámovaný žádný prvek. */
    state.selected = null;
    state.selector = "";
    state.baseSelector = "";
    state.pseudo = "";
    state.selectionBackStack = [];
    state.picking = false;
    refs.selector.value = "";
    refs.targetName.textContent = "Žádný prvek";
    refs.highlight.hidden = true;
    refs.measure.hidden = true;
    updateSelectionNavigation();
    document.body.classList.remove("ln-vd-picking");
  }

  function otevriVisualDebug() {
    state.unlocked = true;
    pripravVisualDebug();
    togglePanel(true);
  }

  function init() {
    clearOldStoredDebugData();
    unlockFromSecretClicks();

    /* Desktop: Ctrl+Shift+D. Mobil: 5× rychle klepnout na záložku Poznámky. */
    document.addEventListener("keydown", event => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "d") {
        event.preventDefault();
        otevriVisualDebug();
      }
    });

    window.LubaNoteVisualDebug = {
      open: otevriVisualDebug,
      close: () => {
        if (!visualDebugPripraven) return;
        togglePanel(false);
      },
      select: selector => {
        otevriVisualDebug();
        refs.selector.value = selector;
        resolveSelector();
      },
      exportCss: async () => {
        otevriVisualDebug();
        return buildUpdatedDebugMobileCss();
      },
      setPanelOpacity: value => {
        otevriVisualDebug();
        applyPanelOpacity(Number(value));
      },
      centerPanel: () => {
        otevriVisualDebug();
        centerPanel();
      },
      resetPanelPosition: () => {
        otevriVisualDebug();
        resetPanelPosition();
      },
      resetAll: () => {
        otevriVisualDebug();
        resetAll();
      },
      quickMode: property => {
        otevriVisualDebug();
        enterQuickMode(property);
      }
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
