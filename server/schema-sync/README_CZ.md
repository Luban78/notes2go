# LubaNote 699B — Schema Sync pro migrační kompatibilitu

## Co řešíme

LubaServer je zdroj pravdy pro aplikační strukturu databáze. Běžný vývoj zde
vytváří tabulky, sloupce, funkce, triggery a RLS. Supabase Cloud a později VPS
musí mít aplikační strukturu, která dovolí stávajícímu Migration Manageru
provést PREPARE → VERIFY → CUTOVER. **Nepřenášíme zde uživatelská data**;
to již dělá Migration Manager. **Nepřepisujeme Migration Manager**.

Používáme DBDiff 3.0.0-rc.29 a skutečné PostgreSQL katalogy, nikoliv ruční
migrace či Git rozdíly. Spojení vychází z existujících backend profilů.

## Změny oproti 699A

1. Známe lokální `lubanote_server_status`, jeho RLS a funkci
   `lubanote_admin_get_server_status`: nevyžadujeme na Cloudu.
2. Rozdíly hostitelského `ensure_rls` event triggeru, výchozích oprávnění
   Supabase a SQL komentářů evidujeme, ale **nespouštíme**.
3. SQL plán rozdělujeme bezpečně i přes PL/pgSQL `$$...;...$$`.
4. Automatické provedení je striktní allowlist:
   - vytvoření běžné nové tabulky pouze se zapnutým RLS, při současném
     obnovení *explicitních* práv z LubaServeru pro `PUBLIC`, `anon`,
     `authenticated`, `service_role`; cizí role a grant options blokují;
   - jednoduchý nový nullable sloupec bez DEFAULT a omezení;
   - nahrazení existující **SECURITY INVOKER** funkce, pokud sedí
     signatura i ACL (žádné přetížení funkce);
   - RLS policy/trigger pouze na právě vytvořené tabulce.
5. Změny jako DROP, změny stávajících RLS policies, SECURITY DEFINER,
   existující triggery, změny typů/sloupců, indexy či neznámé DDL
   vyžadují další kontrolu. Nesmí se automaticky spouštět.
6. Pro všechny cíle se nejdřív spočítá plán. `--apply` kontroluje
   Migration Manager IDLE, aktivní LubaServer, freeze cílů, zdrojová
   oprávnění, stav plánů a opakovaný diff před zápisem. Každý cíl
   má vlastní SQL transakci a následné ověření. Nelze zajistit
   atomické vrácení napříč více servery.
7. `--check` pouze čte. `--apply` zůstává **zamčený** dokud nezvládneme
   izolovaný test + reálné porovnání a výslovně neschválíme povolení.

## Proč není automatika ještě plně nasaditelná

Samotný DBDiff neprokazuje funkčnost aplikace, Auth/Storage ani oprávnění
Migration Manageru (včetně dřívější chyby `must be owner of table users`).
Schema Sync proto nenahrazuje PREPARE/VERIFY. Některé nebezpečné nebo
složitější struktury vyžadují další pokrytí/testy; žádný skript nesmí
prohlásit FULL MIGRATION READY jen na základě prázdného diffu.

## Instalace a test (po nahrání změněných souborů na GitHub main)

Při prvním použití získat složku `server/schema-sync` z aktuálního GitHub
`main` a spustit její `install.sh`; instaluje pouze launcher. Následně:

`$HOME/luba-server/schema-sync/launch.sh --check`

Výstup hlásí `IGNORED`, `ELIGIBLE`, `BLOCKED`. Výsledky zůstanou v
`~/.local/state/lubanote-schema-sync/<datum>/cloud/plan.sql` a
`classification.json` (složky `0700`, soubory `0600`).

Zkratka `shortcuts/LubaNote-Schema-Deploy` je zatím záměrně `--check`.
Nepřepisovat ji na `--apply`, nevytvářet schvalovací soubor, nedělat ruční
SQL na Cloudu před testem. Tento patch nemění data ani Migration Manager.

DBDiff a aplikace mohou mít různé role/ACL nebo funkční závislosti, které
není možné bezpečně automaticky odhadnout. V takovém případě je správný
výsledek `REVIEW_REQUIRED`, nikoli neúplná synchronizace.
