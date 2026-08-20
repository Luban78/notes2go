(() => {
  const editorTextu =
    document.getElementById("modalRichText");
  
  const schranka =
    window.Capacitor?.Plugins?.Clipboard;
  
  const selectionMenu =
    document.getElementById("selectionMenu");
    
  const tlacitkoKopirovat =
  document.getElementById("selectionKopirovat");
  
  const tlacitkoVlozit =
  document.getElementById("selectionVlozit");
  
  
  
  
  let ulozenyRozsah = null;
  
  
  
  
  
  
  console.log(
    "LubaNote selection menu:",
    {
      editor: !!editorTextu,
      clipboard: !!schranka
    }
  );
  
  if (!editorTextu || !selectionMenu) {
    return;
  }
  
  function skryjMenu() {
    selectionMenu.hidden = true;
  }
  
  function zobrazMenuUOznaceni() {
    const vyber =
      window.getSelection();
    
    if (
      !vyber ||
      vyber.rangeCount === 0 ||
      vyber.isCollapsed
    ) {
      skryjMenu();
      return;
    }
    
    const rozsah =
      vyber.getRangeAt(0);
    ulozenyRozsah =
  rozsah.cloneRange();
    
    const uzel =
      rozsah.commonAncestorContainer.nodeType === Node.TEXT_NODE ?
      rozsah.commonAncestorContainer.parentElement :
      rozsah.commonAncestorContainer;
    
    if (
      !uzel ||
      !editorTextu.contains(uzel)
    ) {
      skryjMenu();
      return;
    }
    
    const obdelnik =
      rozsah.getBoundingClientRect();
    
    if (
      !obdelnik.width &&
      !obdelnik.height
    ) {
      skryjMenu();
      return;
    }
    
    selectionMenu.hidden = false;
    
    requestAnimationFrame(() => {
      const menuSirka =
        selectionMenu.offsetWidth;
      
      const menuVyska =
        selectionMenu.offsetHeight;
      
      const mezera = 8;
      
      let vlevo =
        obdelnik.left +
        obdelnik.width / 2 -
        menuSirka / 2;
      
      vlevo = Math.max(
        8,
        Math.min(
          vlevo,
          window.innerWidth -
          menuSirka -
          8
        )
      );
      
      let nahore;
      
      if (
        obdelnik.top >
        menuVyska + mezera + 8
      ) {
        nahore =
          obdelnik.top -
          menuVyska -
          mezera;
      } else {
        nahore =
          obdelnik.bottom +
          mezera;
      }
     
      selectionMenu.style.left =
        `${vlevo}px`;
      
      selectionMenu.style.top =
        `${nahore}px`;
    });
  }
  
  document.addEventListener(
    "selectionchange",
    zobrazMenuUOznaceni
  );
  
  tlacitkoKopirovat?.addEventListener(
  "click",
  async () => {
    const text =
      ulozenyRozsah
      ?.toString()
      ?.trim();
    
    if (!text) {
      return;
    }
    
    if (!schranka) {
      console.warn(
        "Clipboard plugin není dostupný."
      );
      return;
    }
    
    try {
      await schranka.write({
        string: text
      });
      
      console.log(
        "Zkopírováno:",
        text
      );
    } catch (chyba) {
      console.error(
        "Kopírování se nepodařilo:",
        chyba
      );
    }
  }
);

tlacitkoVlozit?.addEventListener(
  "click",
  async () => {
    if (!schranka || !ulozenyRozsah) {
      return;
    }

    try {
      const obsah =
        await schranka.read();

      const text =
        obsah?.value ?? "";

      if (!text) {
        return;
      }

      ulozenyRozsah.deleteContents();

      const textovyUzel =
        document.createTextNode(text);

      ulozenyRozsah.insertNode(
        textovyUzel
      );

      ulozenyRozsah.setStartAfter(
        textovyUzel
      );

      ulozenyRozsah.collapse(true);

      const vyber =
        window.getSelection();

      vyber.removeAllRanges();
      vyber.addRange(
        ulozenyRozsah
      );

      editorTextu.dispatchEvent(
        new InputEvent(
          "input",
          {
            bubbles: true,
            inputType: "insertText",
            data: text
          }
        )
      );

      selectionMenu.hidden = true;

    } catch (chyba) {
      console.error(
        "Vložení se nepodařilo:",
        chyba
      );
    }
  }
);

  
})();