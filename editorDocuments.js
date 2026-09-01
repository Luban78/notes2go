(() => {
  "use strict";

  /* ==========================================
     LUBANOTE – OTEVŘÍT / ULOŽIT JAKO
     Samostatný dokumentový modul editoru.

     V2:
     - Otevřít: HTML / TXT
     - Uložit jako: HTML / TXT / PDF
     - Android: Storage Access Framework přes nativní plugin
     - Web/PC: File System Access API + bezpečný fallback
     - Secret: záměrně zakázáno
  ========================================== */

  const tlacitkoOtevrit =
    document.getElementById("tlacitkoOtevritDokument");

  const tlacitkoUlozit =
    document.getElementById("tlacitkoUlozitDokument");

  if (!tlacitkoOtevrit || !tlacitkoUlozit) {
    return;
  }

  const FORMAT_LUBANOTE_DOKUMENTU =
    "lubanote-document-v1";

  const MAX_VELIKOST_OTEVRENEHO_SOUBORU =
    20 * 1024 * 1024;

  function jeSecretEditor() {
    return (
      secretTaskEnabled === true ||
      document.body.classList.contains("secretModeActive")
    );
  }

  function aktualizujDostupnost() {
    const skryt = jeSecretEditor();

    tlacitkoOtevrit.hidden = skryt;
    tlacitkoUlozit.hidden = skryt;
  }

  function ziskejNativniPlugin() {
    return window.Capacitor
      ?.Plugins
      ?.LubaNoteDocument || null;
  }

  function jeNativniAndroid() {
    try {
      if (typeof window.Capacitor?.getPlatform === "function") {
        return window.Capacitor.getPlatform() === "android";
      }
    } catch {
      // fallback níže
    }

    return Boolean(ziskejNativniPlugin());
  }

  function zobrazChybu(nadpis, text) {
    if (typeof zobrazZpravuAplikace === "function") {
      zobrazZpravuAplikace(nadpis, text);
      return;
    }

    alert(`${nadpis}\n\n${text}`);
  }

  function bezpecnyNazevSouboru(nazev = "") {
    const vycisteny = String(nazev)
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
      .replace(/\s+/g, " ")
      .replace(/[. ]+$/g, "")
      .trim()
      .slice(0, 100);

    return vycisteny || "LubaNote-poznamka";
  }

  function nazevBezPripony(nazev = "") {
    return String(nazev)
      .replace(/\.[^.]+$/u, "")
      .trim();
  }

  function escapujHtml(text = "") {
    const prvek = document.createElement("div");
    prvek.textContent = String(text);
    return prvek.innerHTML;
  }

  function pripravJsonDoHtml(data) {
    return JSON.stringify(data)
      .replace(/</g, "\\u003c")
      .replace(/>/g, "\\u003e")
      .replace(/&/g, "\\u0026");
  }

  function ziskejAktualniTodos() {
    try {
      blurSelectedTodoEditor?.();
    } catch {
      // TODO nemusí být právě aktivní.
    }

    return Array.isArray(activeTodos)
      ? activeTodos.map((todo) => ({
          ...todo,
          text: String(todo?.text ?? ""),
          html: String(todo?.html ?? ""),
          completed: todo?.completed === true
        }))
      : [];
  }

  function vytvorDataDokumentu() {
    const title =
      ziskejNazevPoznamkyZEditoru().trim();

    const todos = ziskejAktualniTodos();

    return {
      format: FORMAT_LUBANOTE_DOKUMENTU,
      version: 1,
      exportedAt: new Date().toISOString(),
      title,
      richContent: modalRichText.innerHTML,
      plainText: modalRichText.innerText,
      todos,
      date: modalDate.value || "",
      time: modalTime.value || ""
    };
  }

  function vytvorTodoHtmlProDokument(todo) {
    const stav = todo?.completed === true;
    const obsah = todo?.html
      ? String(todo.html)
      : escapujHtml(todo?.text || "");

    return `
      <li class="ln-doc-todo${stav ? " is-done" : ""}">
        <span class="ln-doc-check" aria-hidden="true">${stav ? "☑" : "☐"}</span>
        <span class="ln-doc-todo-text">${obsah}</span>
      </li>`;
  }

  function vytvorHtmlDokument(data) {
    const nazev = data.title || "LubaNote poznámka";
    const datum = [data.date, data.time]
      .filter(Boolean)
      .join(" ");

    const todoSekce = data.todos.length
      ? `
        <section class="ln-doc-todos">
          <h2>Úkoly</h2>
          <ul>
            ${data.todos.map(vytvorTodoHtmlProDokument).join("")}
          </ul>
        </section>`
      : "";

    const metadata = pripravJsonDoHtml(data);

    return `<!doctype html>
<html lang="cs">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="generator" content="LubaNote">
  <title>${escapujHtml(nazev)}</title>
  <style>
    :root { color-scheme: light dark; }
    body {
      max-width: 900px;
      margin: 0 auto;
      padding: 32px 22px 56px;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.55;
    }
    h1 { margin: 0 0 6px; line-height: 1.2; }
    .ln-doc-date { opacity: .65; margin-bottom: 28px; }
    .ln-doc-content img { max-width: 100%; height: auto; }
    .ln-doc-content figure { max-width: 100%; margin-left: 0; margin-right: 0; }
    .ln-doc-todos { margin-top: 34px; padding-top: 18px; border-top: 1px solid currentColor; }
    .ln-doc-todos ul { list-style: none; padding: 0; }
    .ln-doc-todo { display: flex; gap: 10px; align-items: flex-start; margin: 8px 0; }
    .ln-doc-todo.is-done .ln-doc-todo-text { text-decoration: line-through; opacity: .65; }
    .ln-doc-check { flex: 0 0 auto; }
    .noteInternalLink { text-decoration: underline; }
  </style>
</head>
<body>
  <header>
    <h1>${escapujHtml(nazev)}</h1>
    ${datum ? `<div class="ln-doc-date">${escapujHtml(datum)}</div>` : ""}
  </header>
  <main>
    <article class="ln-doc-content">${data.richContent || ""}</article>
    ${todoSekce}
  </main>
  <script id="lubanote-document-data" type="application/json">${metadata}<\/script>
</body>
</html>`;
  }

  function vytvorPdfHtmlDokument(data) {
    /*
     * PDF se tiskne z čistého dokumentového HTML, nikoli z celé obrazovky
     * LubaNote. Tím se do PDF nedostane toolbar, modaly ani navigace.
     */
    const html = vytvorHtmlDokument(data);

    const tiskCss = `
    @page { size: A4; margin: 14mm; }
    html, body { background: #fff !important; color: #111; }
    body { max-width: none; margin: 0; padding: 0; }
    .ln-doc-content, .ln-doc-todos { break-inside: auto; }
    .ln-doc-content img, .ln-doc-content figure { break-inside: avoid; }
    .ln-doc-todo { break-inside: avoid; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    `;

    return html
      .replace('</style>', `${tiskCss}</style>`)
      .replace(
        /\s*<script id="lubanote-document-data"[\s\S]*?<\/script>/i,
        ''
      );
  }

  async function ulozPdfPresWeb(data) {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.width = "1px";
    iframe.style.height = "1px";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";

    const html = vytvorPdfHtmlDokument(data);

    return await new Promise((resolve, reject) => {
      let dokonceno = false;

      const uklid = (vysledek) => {
        if (dokonceno) {
          return;
        }

        dokonceno = true;
        iframe.remove();
        resolve(vysledek);
      };

      iframe.addEventListener(
        "load",
        () => {
          try {
            const okno = iframe.contentWindow;

            if (!okno || typeof okno.print !== "function") {
              throw new Error("Tiskový dialog není v tomto prohlížeči dostupný.");
            }

            const spustTisk = () => {
              try {
                okno.focus();

                const poTisku = () => {
                  okno.removeEventListener?.("afterprint", poTisku);
                  uklid(true);
                };

                okno.addEventListener?.("afterprint", poTisku);
                okno.print();

                /*
                 * Některé mobilní prohlížeče afterprint neposílají.
                 * Iframe proto po návratu z dialogu uklidíme záložním timerem.
                 */
                setTimeout(() => uklid(true), 2500);
              } catch (error) {
                iframe.remove();
                reject(error);
              }
            };

            const dokument = iframe.contentDocument;
            const obrazky = [
              ...(dokument?.images || [])
            ];

            const cekaniNaObrazky = obrazky
              .filter((img) => !img.complete)
              .map(
                (img) =>
                  new Promise((hotovo) => {
                    img.addEventListener("load", hotovo, { once: true });
                    img.addEventListener("error", hotovo, { once: true });
                  })
              );

            Promise.all(cekaniNaObrazky).then(spustTisk);
          } catch (error) {
            iframe.remove();
            reject(error);
          }
        },
        { once: true }
      );

      iframe.srcdoc = html;
      document.body.appendChild(iframe);
    });
  }

  function vytvorTxtDokument(data) {
    const casti = [];

    if (data.title) {
      casti.push(data.title);
      casti.push("=".repeat(Math.min(60, Math.max(3, data.title.length))));
      casti.push("");
    }

    if (data.plainText.trim()) {
      casti.push(data.plainText.trimEnd());
    }

    if (data.todos.length) {
      if (casti.length) {
        casti.push("");
      }

      casti.push("Úkoly:");

      data.todos.forEach((todo) => {
        casti.push(
          `${todo.completed ? "[x]" : "[ ]"} ${todo.text || ""}`
        );
      });
    }

    return casti.join("\n");
  }

  async function ulozPresWeb({ obsah, nazevSouboru, mimeType, pripona }) {
    if (typeof window.showSaveFilePicker === "function") {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: nazevSouboru,
          types: [
            {
              description: pripona === ".html"
                ? "HTML dokument"
                : "Textový dokument",
              accept: {
                [mimeType]: [pripona]
              }
            }
          ]
        });

        const zapis = await handle.createWritable();
        await zapis.write(obsah);
        await zapis.close();

        return true;
      } catch (error) {
        if (error?.name === "AbortError") {
          return false;
        }

        throw error;
      }
    }

    const blob = new Blob([obsah], {
      type: `${mimeType};charset=utf-8`
    });

    const url = URL.createObjectURL(blob);
    const odkaz = document.createElement("a");
    odkaz.href = url;
    odkaz.download = nazevSouboru;
    odkaz.hidden = true;

    document.body.appendChild(odkaz);
    odkaz.click();
    odkaz.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }

  async function ulozDokument(format) {
    if (jeSecretEditor()) {
      zobrazChybu(
        "Uložit jako",
        "Secret poznámku nelze ukládat do externího dokumentu. Secret režim zůstává oddělený."
      );
      return;
    }

    const data = vytvorDataDokumentu();
    const zaklad = bezpecnyNazevSouboru(data.title);
    const plugin = ziskejNativniPlugin();

    if (format === "pdf") {
      const nazevSouboru = `${zaklad}.pdf`;
      const html = vytvorPdfHtmlDokument(data);

      if (jeNativniAndroid() && plugin?.ulozPdf) {
        const vysledek = await plugin.ulozPdf({
          html,
          nazevSouboru
        });

        return vysledek?.saved === true;
      }

      return await ulozPdfPresWeb(data);
    }

    const jeHtml = format === "html";
    const pripona = jeHtml ? ".html" : ".txt";
    const mimeType = jeHtml ? "text/html" : "text/plain";
    const obsah = jeHtml
      ? vytvorHtmlDokument(data)
      : vytvorTxtDokument(data);

    const nazevSouboru = `${zaklad}${pripona}`;

    if (jeNativniAndroid() && plugin?.ulozDokument) {
      const vysledek = await plugin.ulozDokument({
        obsah,
        nazevSouboru,
        mimeType
      });

      return vysledek?.saved === true;
    }

    return await ulozPresWeb({
      obsah,
      nazevSouboru,
      mimeType,
      pripona
    });
  }

  function vyberSouborFallback() {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".html,.htm,.txt,text/html,text/plain";
      input.hidden = true;

      const uklid = () => {
        input.remove();
      };

      input.addEventListener(
        "change",
        async () => {
          const file = input.files?.[0] || null;

          if (!file) {
            uklid();
            resolve(null);
            return;
          }

          if (file.size > MAX_VELIKOST_OTEVRENEHO_SOUBORU) {
            uklid();
            zobrazChybu(
              "Otevřít dokument",
              "Soubor je příliš velký. Maximální velikost je 20 MB."
            );
            resolve(null);
            return;
          }

          try {
            const obsah = await file.text();
            uklid();
            resolve({
              obsah,
              nazevSouboru: file.name,
              mimeType: file.type || ""
            });
          } catch {
            uklid();
            resolve(null);
          }
        },
        { once: true }
      );

      document.body.appendChild(input);
      input.click();
    });
  }

  async function otevriPresWeb() {
    if (typeof window.showOpenFilePicker === "function") {
      try {
        const [handle] = await window.showOpenFilePicker({
          multiple: false,
          types: [
            {
              description: "HTML nebo text",
              accept: {
                "text/html": [".html", ".htm"],
                "text/plain": [".txt"]
              }
            }
          ]
        });

        if (!handle) {
          return null;
        }

        const file = await handle.getFile();

        if (file.size > MAX_VELIKOST_OTEVRENEHO_SOUBORU) {
          zobrazChybu(
            "Otevřít dokument",
            "Soubor je příliš velký. Maximální velikost je 20 MB."
          );
          return null;
        }

        return {
          obsah: await file.text(),
          nazevSouboru: file.name,
          mimeType: file.type || ""
        };
      } catch (error) {
        if (error?.name === "AbortError") {
          return null;
        }

        throw error;
      }
    }

    return await vyberSouborFallback();
  }

  async function vyberDokumentKOtevreni() {
    const plugin = ziskejNativniPlugin();

    if (jeNativniAndroid() && plugin?.otevriDokument) {
      const vysledek = await plugin.otevriDokument();

      if (
        !vysledek ||
        vysledek.canceled === true ||
        typeof vysledek.obsah !== "string"
      ) {
        return null;
      }

      return {
        obsah: vysledek.obsah,
        nazevSouboru: vysledek.nazevSouboru || "dokument",
        mimeType: vysledek.mimeType || ""
      };
    }

    return await otevriPresWeb();
  }

  function sanitizujHtml(html = "") {
    const sablona = document.createElement("template");
    sablona.innerHTML = String(html);

    sablona.content
      .querySelectorAll(
        "script, iframe, object, embed, form, input, textarea, select, option, button, meta, link, base"
      )
      .forEach((prvek) => prvek.remove());

    sablona.content
      .querySelectorAll("*")
      .forEach((prvek) => {
        [...prvek.attributes].forEach((atribut) => {
          const jmeno = atribut.name.toLowerCase();
          const hodnota = atribut.value.trim();

          if (jmeno.startsWith("on")) {
            prvek.removeAttribute(atribut.name);
            return;
          }

          if (
            (jmeno === "href" || jmeno === "src") &&
            /^javascript:/i.test(hodnota)
          ) {
            prvek.removeAttribute(atribut.name);
            return;
          }

          if (
            jmeno === "style" &&
            /(expression\s*\(|url\s*\(\s*["']?javascript:)/i.test(hodnota)
          ) {
            prvek.removeAttribute("style");
          }
        });
      });

    return sablona.innerHTML;
  }

  function textNaHtml(text = "") {
    const radky = String(text)
      .replace(/\r\n?/g, "\n")
      .split("\n");

    return radky
      .map((radek) =>
        radek.length
          ? `<div>${escapujHtml(radek)}</div>`
          : "<div><br></div>"
      )
      .join("");
  }

  function normalizujTodosZeSouboru(todos) {
    if (!Array.isArray(todos)) {
      return [];
    }

    return todos.map((todo) => ({
      ...todo,
      id:
        typeof todo?.id === "string" && todo.id
          ? todo.id
          : crypto.randomUUID(),
      text: String(todo?.text ?? ""),
      html: sanitizujHtml(todo?.html || ""),
      completed: todo?.completed === true
    }));
  }

  function parsujDokument(soubor) {
    const obsah = String(soubor?.obsah ?? "");
    const nazevSouboru = String(
      soubor?.nazevSouboru || "dokument"
    );

    const jeHtml =
      /\.html?$/i.test(nazevSouboru) ||
      /text\/html/i.test(soubor?.mimeType || "") ||
      /^\s*<!doctype\s+html/i.test(obsah) ||
      /^\s*<html[\s>]/i.test(obsah);

    if (!jeHtml) {
      return {
        title: nazevBezPripony(nazevSouboru) || "Nový dokument",
        richContent: textNaHtml(obsah),
        todos: [],
        date: "",
        time: ""
      };
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(obsah, "text/html");

    const metadataElement =
      doc.getElementById("lubanote-document-data");

    if (metadataElement?.textContent) {
      try {
        const data = JSON.parse(metadataElement.textContent);

        if (data?.format === FORMAT_LUBANOTE_DOKUMENTU) {
          return {
            title: String(data.title || ""),
            richContent: sanitizujHtml(data.richContent || ""),
            todos: normalizujTodosZeSouboru(data.todos),
            date: String(data.date || ""),
            time: String(data.time || "")
          };
        }
      } catch (error) {
        console.warn(
          "Metadata LubaNote dokumentu nešla načíst, použiji běžný HTML import.",
          error
        );
      }
    }

    doc.querySelectorAll(
      "script, style, iframe, object, embed, form, input, textarea, select, option, button, meta, link, base"
    ).forEach((prvek) => prvek.remove());

    const prvniH1 = doc.body?.querySelector("h1");
    const title =
      String(doc.title || "").trim() ||
      String(prvniH1?.textContent || "").trim() ||
      nazevBezPripony(nazevSouboru) ||
      "Nový dokument";

    if (prvniH1) {
      prvniH1.remove();
    }

    return {
      title,
      richContent: sanitizujHtml(doc.body?.innerHTML || ""),
      todos: [],
      date: "",
      time: ""
    };
  }

  function nastavAktualniDatumCasProNovyDokument() {
    const ted = new Date();
    const rok = ted.getFullYear();
    const mesic = String(ted.getMonth() + 1).padStart(2, "0");
    const den = String(ted.getDate()).padStart(2, "0");
    const hodiny = String(ted.getHours()).padStart(2, "0");
    const minuty = String(ted.getMinutes()).padStart(2, "0");

    modalDate.value = `${rok}-${mesic}-${den}`;
    modalTime.value = `${hodiny}:${minuty}`;
  }

  function pripravPrazdnyNovyEditor() {
    zahajEditorSession(null);
    taskModal.removeAttribute("data-task-id");
    activeTaskIndex = null;

    secretTaskEnabled = false;
    favoriteEnabled = false;
    reminderEnabled = false;

    priorityTaskButton?.classList.remove("active");
    secretTaskButton?.classList.remove("active");

    aktualizujIkonuTajnePoznamky?.();
    updateReminderButton?.(false);

    activeArea = "private";
    activeTags = [];
    updateTagMenuUI?.();
    closeTagMenu?.();

    editorRepeat = null;

    nastavNazevPoznamkyVEditoru("");
    modalText.value = "";
    modalRichText.innerHTML = "";
    modalText.hidden = true;
    modalRichText.hidden = false;

    resetTodos?.();
    RichTextColors?.reset?.();

    document
      .getElementById("plannedTextLinks")
      ?.replaceChildren();

    const planned =
      document.getElementById("plannedTextLinks");

    if (planned) {
      planned.hidden = true;
    }

    nastavAktualniDatumCasProNovyDokument();
    aktualizujPopiskyDataCasu?.();
    updateModalWeekday?.();

    /*
     * Otisk ukládáme ještě v prázdném stavu. Importovaný obsah pak
     * bude správně považovaný za změnu a při zavření se nabídne uložení
     * do LubaNote.
     */
    puvodniOtiskEditoru = vytvorOtiskEditoru();
  }

  function vlozDokumentDoNovehoEditoru(data) {
    pripravPrazdnyNovyEditor();

    nastavNazevPoznamkyVEditoru(data.title || "");
    modalRichText.innerHTML = sanitizujHtml(
      data.richContent || ""
    );

    loadTodos?.(data.todos || []);

    if (/^\d{4}-\d{2}-\d{2}$/.test(data.date || "")) {
      modalDate.value = data.date;
    }

    if (/^\d{2}:\d{2}$/.test(data.time || "")) {
      modalTime.value = data.time;
    }

    aktualizujPopiskyDataCasu?.();
    updateModalWeekday?.();
    resetujSbaleniNazvuEditoru?.();

    taskModal.hidden = false;
    taskModal.classList.add("show");
    document.body.classList.add("noScroll");

    /*
     * Záměrně NEFOCUSUJEME editor. Otevření dokumentu tedy nevyvolá
     * mobilní klávesnici, dokud uživatel sám neklepne do textu.
     */
    modalRichText.blur();

    document.dispatchEvent(
      new CustomEvent("lubanote:dokument-otevren")
    );
  }

  async function otevriDokument() {
    if (jeSecretEditor()) {
      zobrazChybu(
        "Otevřít dokument",
        "Externí dokumenty nejsou v Secret režimu dostupné. Secret zůstává oddělený."
      );
      return;
    }

    let soubor = null;

    try {
      soubor = await vyberDokumentKOtevreni();
    } catch (error) {
      console.error("Otevření dokumentu selhalo:", error);
      zobrazChybu(
        "Otevřít dokument",
        "Soubor se nepodařilo otevřít."
      );
      return;
    }

    if (!soubor) {
      return;
    }

    let data;

    try {
      data = parsujDokument(soubor);
    } catch (error) {
      console.error("Čtení dokumentu selhalo:", error);
      zobrazChybu(
        "Otevřít dokument",
        "Obsah souboru není možné bezpečně načíst."
      );
      return;
    }

    /*
     * Pokud má právě otevřená normální poznámka neuložené změny,
     * nejdřív je bezpečně uložíme do LubaNote. Teprve potom otevřeme
     * externí dokument jako NOVOU nesmazanou/nezávislou poznámku.
     */
    if (bylEditorZmenen?.()) {
      await ulozAZavriEditor("normal");

      if (taskModal.classList.contains("show")) {
        return;
      }
    }

    vlozDokumentDoNovehoEditoru(data);
  }

  function otevriVolbuUlozeni() {
    if (jeSecretEditor()) {
      zobrazChybu(
        "Uložit jako",
        "Secret poznámku nelze ukládat do externího dokumentu."
      );
      return;
    }

    if (typeof window.otevriVyberovyModal === "function") {
      window.otevriVyberovyModal({
        nadpis: "Uložit jako",
        moznosti: [
          {
            hodnota: "html",
            popisek: "HTML – zachovat formátování"
          },
          {
            hodnota: "txt",
            popisek: "TXT – prostý text"
          },
          {
            hodnota: "pdf",
            popisek: "PDF – hotový dokument"
          }
        ],
        poVyberu: async (format) => {
          try {
            await ulozDokument(format);
          } catch (error) {
            console.error("Uložení dokumentu selhalo:", error);
            zobrazChybu(
              "Uložit jako",
              "Dokument se nepodařilo uložit."
            );
          }
        }
      });
      return;
    }

    ulozDokument("html").catch((error) => {
      console.error("Uložení dokumentu selhalo:", error);
      zobrazChybu(
        "Uložit jako",
        "Dokument se nepodařilo uložit."
      );
    });
  }

  [tlacitkoOtevrit, tlacitkoUlozit].forEach((tlacitko) => {
    tlacitko.addEventListener("pointerdown", (event) => {
      event.preventDefault();
    });
  });

  tlacitkoOtevrit.addEventListener("click", otevriDokument);
  tlacitkoUlozit.addEventListener("click", otevriVolbuUlozeni);

  /*
   * Secret může být zapnut/vypnut i během otevřeného editoru.
   * Tlačítka proto průběžně synchronizujeme bez zásahu do secret.js.
   */
  const observer = new MutationObserver(() => {
    aktualizujDostupnost();
  });

  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ["class"]
  });

  observer.observe(taskModal, {
    attributes: true,
    attributeFilter: ["hidden", "class", "data-task-id"]
  });

  secretTaskButton?.addEventListener("click", () => {
    queueMicrotask(aktualizujDostupnost);
  });

  aktualizujDostupnost();

  window.LubaNoteDocuments = {
    otevriDokument,
    ulozDokument,
    parsujDokument,
    vytvorDataDokumentu,
    vytvorPdfHtmlDokument
  };
})();
