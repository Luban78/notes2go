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


function rozbalPlannedTextLink(link) {
  if (!link?.parentNode) {
    return;
  }

  const parent = link.parentNode;

  while (link.firstChild) {
    parent.insertBefore(link.firstChild, link);
  }

  link.remove();
  parent.normalize();
}


function vytvorRangeZTextovychOffsetu(
  root,
  startOffset,
  endOffset
) {
  if (
    !root ||
    !Number.isInteger(startOffset) ||
    !Number.isInteger(endOffset) ||
    startOffset < 0 ||
    endOffset < startOffset
  ) {
    return null;
  }

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT
  );

  let position = 0;
  let startNode = null;
  let startInNode = 0;
  let endNode = null;
  let endInNode = 0;
  let node = walker.nextNode();

  while (node) {
    const nextPosition =
      position + node.data.length;

    if (
      !startNode &&
      startOffset >= position &&
      startOffset <= nextPosition
    ) {
      startNode = node;
      startInNode = startOffset - position;
    }

    if (
      !endNode &&
      endOffset >= position &&
      endOffset <= nextPosition
    ) {
      endNode = node;
      endInNode = endOffset - position;
    }

    if (startNode && endNode) {
      break;
    }

    position = nextPosition;
    node = walker.nextNode();
  }

  if (!startNode || !endNode) {
    return null;
  }

  const range = document.createRange();
  range.setStart(startNode, startInNode);
  range.setEnd(endNode, endInNode);

  return range;
}


function odstranDokoncenePlannedOdkazyVeVyberu(range) {
  if (!range || !modalRichText) {
    return false;
  }

  const links = Array.from(
    modalRichText.querySelectorAll(
      ".plannedTextLink.plannedTextLinkCompleted"
    )
  );

  const zasazene = links.filter((link) => {
    try {
      return range.intersectsNode(link);
    } catch {
      return false;
    }
  });

  zasazene.forEach(rozbalPlannedTextLink);

  return zasazene.length > 0;
}


function wrapCurrentSelectionAsPlannedLink(plannedItemId) {
  if (!plannedItemId) {
    return false;
  }

  const snapshot =
    window.RichTextColors?.getSelectionSnapshot();

  if (!snapshot?.range) {
    console.error(
      "Výběr textu pro plánovaný odkaz nebyl nalezen."
    );
    return false;
  }

  let range = snapshot.range.cloneRange();

  /*
   * Pokud už byl stejný text dříve dokončený a uživatel ho plánuje
   * znovu, starý completed wrapper nejdřív odstraníme. Jinak by nový
   * backlink zůstal uvnitř přeškrtnutého elementu.
   */
  const odstranenoDokonceni =
    odstranDokoncenePlannedOdkazyVeVyberu(range);

  if (odstranenoDokonceni) {
    modalRichText.normalize();

    const obnoveneRange =
      vytvorRangeZTextovychOffsetu(
        modalRichText,
        snapshot.start,
        snapshot.end
      );

    if (obnoveneRange) {
      range = obnoveneRange;
    }
  }

  const link =
    document.createElement("span");

  link.className = "plannedTextLink";
  link.dataset.plannedItemId = plannedItemId;
  link.setAttribute(
    "aria-label",
    "Otevřít naplánovaný úkol"
  );

  try {
    /*
     * extractContents() funguje i přes více inline elementů a zachová
     * zvýraznění/barvy uvnitř označeného textu.
     */
    const fragment = range.extractContents();
    link.append(fragment);
    range.insertNode(link);
    modalRichText.normalize();

    return true;
  } catch (error) {
    console.error(
      "Odkaz na plánovaný úkol se nepodařilo vytvořit:",
      error
    );
    return false;
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