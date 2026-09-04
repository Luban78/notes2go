/*
 * LubaNote – onboarding nového účtu
 *
 * Server rozhoduje, zda je účet opravdu nový a čistý. Klient pouze
 * dodá lokalizovaný obsah uvítací poznámky. RPC ji vytvoří nejvýše
 * jednou pro daný účet a synchronizace ji následně stáhne jako běžnou
 * poznámku.
 */
(() => {
  function aktualniJazyk() {
    return window.LubaNoteI18n?.ziskejJazyk?.() || "cs";
  }

  function vytvorCeskyObsah() {
    const richContent = `
      <h2>Vítej v LubaNote 👋</h2>
      <p><strong>Tahle poznámka je tvůj rychlý průvodce.</strong> Je připnutá nahoře, aby byla po ruce. Až ji nebudeš potřebovat, můžeš ji odepnout, upravit nebo smazat.</p>

      <h3>📝 Poznámky</h3>
      <ul>
        <li>Novou poznámku vytvoříš tlačítkem <strong>+</strong>.</li>
        <li>Můžeš používat formátovaný text, nadpisy, tučné písmo, kurzívu, podtržení, barvy a odrážky.</li>
        <li>Poznámky můžeš připnout, označit jako oblíbené, přesouvat do Koše a filtrovat pomocí oblastí a štítků.</li>
      </ul>

      <h3>☑️ TODO</h3>
      <ul>
        <li>Do poznámky můžeš vložit TODO položky s checkboxy.</li>
        <li>Položky lze upravovat, přesouvat a používat je spolu s plánováním a připomínkami.</li>
      </ul>

      <h3>📅 Plán a připomínky</h3>
      <ul>
        <li>Poznámku, TODO nebo vybranou část textu můžeš naplánovat na konkrétní datum a čas.</li>
        <li>V modulu <strong>Plán</strong> vidíš kalendář a úkoly podle dnů.</li>
        <li>V <strong>Připomínkách</strong> najdeš aktivní i prošlé termíny a můžeš nastavit opakování.</li>
      </ul>

      <h3>🏷️ Štítky a oblasti</h3>
      <ul>
        <li>Štítky pomáhají seskupovat související poznámky.</li>
        <li>Oblasti <strong>Pracovní</strong> a <strong>Soukromé</strong> umožní rychlé filtrování.</li>
      </ul>

      <h3>🖼️ Obrázky</h3>
      <p>Do běžných poznámek můžeš vkládat obrázky. LubaNote je optimalizuje, bezpečně synchronizuje přes cloud a po prvním načtení je drží také v offline cache.</p>

      <h3>🔗 Propojení poznámek</h3>
      <p>Napiš <strong>[[název poznámky]]</strong> a LubaNote vytvoří interní odkaz. U propojených poznámek pak uvidíš také, odkud a kam odkazy vedou.</p>

      <h3>🔒 Secret režim</h3>
      <p>Citlivý text můžeš ukládat do tajných poznámek. Secret obsah je šifrovaný a po zamknutí se v běžné části aplikace nezobrazuje.</p>

      <h3>☁️ Synchronizace a offline režim</h3>
      <ul>
        <li>Po přihlášení se změny synchronizují mezi zařízeními.</li>
        <li>LubaNote je offline-first: dříve načtené poznámky můžeš používat i bez internetu a změny se odešlou později.</li>
        <li>Bezpečnostní revize chrání novější změny před přepsáním starším zařízením.</li>
      </ul>

      <h3>💾 Záloha</h3>
      <p>V nabídce <strong>Záloha a obnova</strong> můžeš vytvořit kompletní zálohu LubaNote včetně běžných dat a obrázků. Zálohu doporučujeme dělat pravidelně.</p>

      <h3>💡 Tip na začátek</h3>
      <p>Vytvoř si první vlastní poznámku, přidej štítek a zkus jí nastavit termín. Nejrychleji tak zjistíš, jak spolu jednotlivé části LubaNote fungují.</p>

      <p><strong>Ať ti LubaNote dobře slouží. 💪</strong></p>
    `.trim();

    const note = [
      "Vítej v LubaNote 👋",
      "",
      "Tahle poznámka je tvůj rychlý průvodce. Je připnutá nahoře, dokud ji nebudeš chtít odepnout nebo smazat.",
      "",
      "POZNÁMKY: + vytvoří novou poznámku. Podporovaný je formátovaný text, připnutí, oblíbené, Koš, oblasti a štítky.",
      "TODO: v poznámce můžeš vytvářet a přesouvat checkboxové položky.",
      "PLÁN A PŘIPOMÍNKY: naplánovat lze poznámku, TODO i vybranou část textu.",
      "OBRÁZKY: běžné obrázky se optimalizují, synchronizují a ukládají do offline cache.",
      "ODKAZY: [[název poznámky]] vytvoří interní propojení.",
      "SECRET: citlivý text může být uložen šifrovaně mimo běžný režim.",
      "SYNCHRONIZACE: LubaNote je offline-first a bezpečně synchronizuje změny mezi zařízeními.",
      "ZÁLOHA: v nabídce Záloha a obnova vytvoříš kompletní zálohu.",
      "",
      "Tip: vytvoř první vlastní poznámku, přidej štítek a nastav jí termín."
    ].join("\n");

    return {
      title: "👋 Vítej v LubaNote – rychlý návod",
      note,
      richContent
    };
  }

  function vytvorAnglickyObsah() {
    const richContent = `
      <h2>Welcome to LubaNote 👋</h2>
      <p><strong>This note is your quick guide.</strong> It is pinned at the top so it stays easy to find. You can unpin, edit or delete it whenever you no longer need it.</p>

      <h3>📝 Notes</h3>
      <ul>
        <li>Create a new note with the <strong>+</strong> button.</li>
        <li>Use rich text, headings, bold, italic, underline, colors and bullet lists.</li>
        <li>Pin notes, mark favorites, move them to Trash and filter them with areas and tags.</li>
      </ul>

      <h3>☑️ TODO</h3>
      <ul>
        <li>Add editable checkbox items directly inside a note.</li>
        <li>Reorder TODO items and connect them with planning and reminders.</li>
      </ul>

      <h3>📅 Planner and reminders</h3>
      <ul>
        <li>Schedule a whole note, a TODO item or selected text for a date and time.</li>
        <li>The <strong>Planner</strong> shows your calendar and daily tasks.</li>
        <li><strong>Reminders</strong> keeps active and overdue items together and supports repeating tasks.</li>
      </ul>

      <h3>🏷️ Tags and areas</h3>
      <ul>
        <li>Tags group related notes.</li>
        <li><strong>Work</strong> and <strong>Private</strong> areas make filtering quick.</li>
      </ul>

      <h3>🖼️ Images</h3>
      <p>Add images to regular notes. LubaNote optimizes them, synchronizes them through the cloud and keeps an offline cache after they have been downloaded.</p>

      <h3>🔗 Note links</h3>
      <p>Type <strong>[[note title]]</strong> to create an internal link. Linked notes also show where links come from and where they lead.</p>

      <h3>🔒 Secret mode</h3>
      <p>Store sensitive text in Secret notes. Secret content is encrypted and hidden from the normal app after the Secret mode is locked.</p>

      <h3>☁️ Sync and offline use</h3>
      <ul>
        <li>After sign-in, changes synchronize between your devices.</li>
        <li>LubaNote is offline-first: previously loaded notes remain usable without internet and changes sync later.</li>
        <li>Revision protection prevents an older device from overwriting newer changes.</li>
      </ul>

      <h3>💾 Backup</h3>
      <p>Use <strong>Backup and restore</strong> to create a complete LubaNote backup including regular data and images. Regular backups are recommended.</p>

      <h3>💡 First step</h3>
      <p>Create your first note, add a tag and give it a due date. It is the fastest way to see how LubaNote fits together.</p>

      <p><strong>Enjoy LubaNote. 💪</strong></p>
    `.trim();

    const note = [
      "Welcome to LubaNote 👋",
      "",
      "This note is your quick guide and stays pinned until you unpin or delete it.",
      "",
      "NOTES: use + to create a note. Rich text, pinning, favorites, Trash, areas and tags are supported.",
      "TODO: add and reorder checkbox items inside notes.",
      "PLANNER AND REMINDERS: schedule a note, TODO item or selected text.",
      "IMAGES: regular images are optimized, synchronized and cached for offline use.",
      "LINKS: [[note title]] creates an internal note link.",
      "SECRET: sensitive text can be stored encrypted outside the normal mode.",
      "SYNC: LubaNote is offline-first and safely synchronizes changes between devices.",
      "BACKUP: Backup and restore creates a complete backup.",
      "",
      "Tip: create your first note, add a tag and set a due date."
    ].join("\n");

    return {
      title: "👋 Welcome to LubaNote – quick guide",
      note,
      richContent
    };
  }

  function vytvorUvitaciPoznamku() {
    const obsah = aktualniJazyk() === "en"
      ? vytvorAnglickyObsah()
      : vytvorCeskyObsah();

    return {
      area: "private",
      date: "",
      note: obsah.note,
      tags: [],
      title: obsah.title,
      todos: [],
      pinned: true,
      repeat: null,
      favorite: false,
      isSecret: false,
      reminder: false,
      completed: false,
      updatedAt: new Date().toISOString(),
      richContent: obsah.richContent,
      notificationId:
        Date.now() % 2147483647,
      lubanoteWelcomeNote: true
    };
  }

  async function zajistiUvitaciPoznamku() {
    if (!navigator.onLine) {
      return { ok: false, created: false, reason: "offline" };
    }

    if (
      typeof supabaseClient === "undefined" ||
      !supabaseClient
    ) {
      return { ok: false, created: false, reason: "supabase_unavailable" };
    }

    const { data, error } = await supabaseClient.rpc(
      "lubanote_ensure_welcome_note",
      {
        p_data: vytvorUvitaciPoznamku()
      }
    );

    if (error) {
      throw error;
    }

    return data || {
      ok: false,
      created: false,
      reason: "empty_response"
    };
  }

  window.LubaNoteOnboarding = {
    zajistiUvitaciPoznamku
  };
})();
