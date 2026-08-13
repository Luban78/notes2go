/* ==========================================
   LUBANOTE – ODKAZY NA NAPLÁNOVANÉ ÚKOLY
   ========================================== */

function createPlannedTextLink(
  plannedItemId,
  text
) {
  const span =
    document.createElement("span");

  span.className =
    "plannedTextLink";

  span.dataset.plannedItemId =
    plannedItemId;

  span.setAttribute(
    "aria-label",
    "Otevřít naplánovaný úkol"
  );

  span.textContent =
    text;

  return span;
}


function wrapCurrentSelectionAsPlannedLink(plannedItemId) {
  if (!plannedItemId) {
    return;
  }
  
  const snapshot =
  window.RichTextColors?.getSelectionSnapshot();

const range =
  snapshot?.range?.cloneRange();
  
  if (!range) {
    console.error(
      "Výběr textu pro plánovaný odkaz nebyl nalezen."
    );
    
    return;
  }
  
  const link =
    createPlannedTextLink(
      plannedItemId,
      range.toString()
    );
  
  try {
    range.surroundContents(link);
  } catch (error) {
    console.error(
      "Odkaz na plánovaný úkol se nepodařilo vytvořit:",
      error
    );
  }
}

/* ==========================================
   PLÁNOVANÝ ODKAZ – NEOTVÍRAT KLÁVESNICI
   ========================================== */

document.addEventListener("pointerdown", (event) => {
  const link =
    event.target.closest(".plannedTextLink");

  if (!link) {
    return;
  }

  /*
   * Na mobilu zabráníme contenteditable editoru,
   * aby při klepnutí na odkaz otevřel klávesnici.
   * Myš na PC ale neblokujeme – desktopový click
   * tak zůstane plně funkční.
   */
  if (event.pointerType !== "mouse") {
    event.preventDefault();
  }
});

document.addEventListener("click", (event) => {
  const link =
    event.target.closest(".plannedTextLink");
  
  if (!link) {
    return;
  }

  event.preventDefault();
  
  const plannedItemId =
    link.dataset.plannedItemId;
  
  const plannedItem =
    loadPlannedItems().find(
      item => item.id === plannedItemId
    );
    
    if (!plannedItem) {
  return;
}

const plannedDate =
  new Date(plannedItem.plannedAt);

calendarCurrentDate =
  new Date(plannedDate);

calendarSelectedDay =
  new Date(plannedDate);
  
document
  .getElementById("editorBackButton")
  ?.click();

document
  .getElementById("plannerModuleButton")
  ?.click();
  
  calendarCurrentDate =
  new Date(plannedDate);

calendarSelectedDay =
  new Date(plannedDate);

renderCalendar();
}, true);