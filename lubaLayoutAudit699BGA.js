/* 699BG-A: read-only, opt-in layout diagnostics. No DOM/CSS mutations.
 * Spustit v konzoli: lubaLayoutAudit699BGA()
 * Opakovat po zmene sirky okna; nevypisuje obsah poznamek ani stitku.
 */
(function () {
  "use strict";
  if (window.lubaLayoutAudit699BGA) return;
  const selectors = [
    ".searchRow", ".searchBox", ".searchRow input",
    "#lnDesktopNewTag693B", "#lnDesktopThemeCycle693D",
    "#lnMobilePalette693J", ".newTagFilterButton",
    ".tagsRow", ".tagFilters", ".tagFilterRow",
    ".notesGrid", ".notesContainer", ".cardsContainer",
    ".sidebar", ".desktopSidebar", ".leftPanel",
    "#notesModuleButton", "#lnHomeDateTime683BC"
  ];
  function describe(el) {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    const parent = el.parentElement, pr = parent && parent.getBoundingClientRect();
    return {
      element: el.tagName.toLowerCase(),
      id: el.id || "",
      classes: String(el.className || "").split(/\s+/).filter(Boolean).slice(0, 5),
      rect: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) },
      parentWidth: pr ? Math.round(pr.width) : null,
      display: s.display, position: s.position, overflowX: s.overflowX,
      flex: s.flex, flexWrap: s.flexWrap, minWidth: s.minWidth, maxWidth: s.maxWidth,
      gridTemplateColumns: s.gridTemplateColumns, whiteSpace: s.whiteSpace,
      visible: !!(r.width && r.height && s.visibility !== "hidden" && s.display !== "none")
    };
  }
  window.lubaLayoutAudit699BGA = function () {
    const elements = [];
    const seen = new Set();
    for (const selector of selectors) {
      for (const el of Array.from(document.querySelectorAll(selector)).slice(0, 5)) {
        if (seen.has(el)) continue;
        seen.add(el);
        elements.push({ selector, ...describe(el) });
      }
    }
    const vw = document.documentElement.clientWidth;
    const overflow = [];
    for (const el of document.querySelectorAll("button, input, .searchRow > *, .searchRow button")) {
      const r = el.getBoundingClientRect(), s = getComputedStyle(el);
      if (r.width && r.height && s.display !== "none" && (r.right > vw + 2 || r.left < -2)) {
        overflow.push({ ...describe(el) });
        if (overflow.length >= 25) break;
      }
    }
    const report = {
      build: "699BG-A",
      location: location.pathname,
      viewport: { innerWidth, innerHeight, clientWidth: vw, scrollWidth: document.documentElement.scrollWidth, dpr: devicePixelRatio },
      media: {
        desktop1100: matchMedia("(min-width: 1100px) and (hover: hover) and (pointer: fine)").matches,
        finePointer: matchMedia("(hover: hover) and (pointer: fine)").matches
      },
      elements, overflow
    };
    window.lubaLayoutAudit699BGA_last = report;
    console.log("LUBANOTE 699BG-A READ-ONLY LAYOUT REPORT\n" + JSON.stringify(report, null, 2));
    console.log("Pro zkopirovani: copy(JSON.stringify(lubaLayoutAudit699BGA_last))");
    return report;
  };
})();
