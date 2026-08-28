/* ==================================================
   LubaNote – DESKTOP DOPLNĚNÍ SVG IKON
   --------------------------------------------------
   Centrální definice ikon jsou v lubaIcons.js.
   Tento soubor jen doplňuje desktopový sidebar a
   desktopové prezentační třídy.
================================================== */

(() => {
  const desktopRezim = window.matchMedia(
    "(min-width: 1100px) and (hover: hover) and (pointer: fine)"
  );

  if (!desktopRezim.matches || !window.LubaNoteIcons) {
    return;
  }

  const { vlozIkonu } = window.LubaNoteIcons;

  const sidebarIkony = [
    ["desktopHomeButton", "domov"],
    ["desktopAllNotesButton", "poznamky"],
    ["desktopFavoriteButton", "oblibene"],
    ["desktopTagsButton", "stitky"],
    ["desktopSettingsButton", "nastaveni"],
    ["desktopBackupButton", "zaloha"]
  ];

  sidebarIkony.forEach(([idTlacitka, ikona]) => {
    const tlacitko = document.getElementById(idTlacitka);
    const hostitel = tlacitko?.querySelector("span:first-child");

    if (!hostitel) {
      return;
    }

    vlozIkonu(hostitel, ikona, ["desktopSidebarIcon"]);
  });

  [
    document.querySelector("#notesModuleButton .moduleTabIcon"),
    document.querySelector("#plannerModuleButton .moduleTabIcon"),
    document.querySelector("#remindersModuleButton .moduleTabIcon")
  ].filter(Boolean).forEach((hostitel) => {
    hostitel.classList.add("desktopModuleIcon");
  });

  document.querySelector(".searchIcon")?.classList.add(
    "desktopSearchIcon"
  );

  document.documentElement.classList.add("desktopSvgIconsReady");
})();
