# LubaNote 699A – Schema Sync (ZDROJ: skutecny LubaServer)

**Toto neni stary 698B/698C Server Deploy.** Zmeny se nepisou rucne do souboru SQL.
Nastroj porovna SKUTECNY databazovy stav zdrojoveho LubaServeru se stavem
registrovanych backendu. K diffu pouziva externi DBDiff, ktery zmeny detekuje
z PostgreSQL katalogu. Generuje navrhy SQL pro cile, ne pro zdroj.

## Podstatne omezeni (nevynechavat)

* 699A je **pilotni verze pro read-only test `--check`** na LubaServer/Cloud.
  `--apply` je defaultne zablokovane lokalnim schvalovacim souborem, ktery
  zamerne NENI soucasti ZIPu. Bez skutecneho testu generovaneho SQL
  tento soubor nevytvaret.
* Rozsah: vlastni objekty schematu `public`. Datove zaznamy, Auth uzivatele,
  Storage soubory, `auth` a `storage` schema, konfigurace Docker/Caddy ani
  granty/role/externi Supabase nastaveni se **neprenasí**.
* Neznama/rizikova SQL (DROP, REVOKE, RLS disable, alter column atd.)
  nikdy automaticky neaplikovat. Takove pripady vyzaduji vyvojovou opravu
  a samostatny postup. Funkcni zmeny muzou ovlivnit aplikaci i bez DML.
* Velke rozdily z historicky nesjednocenych databazi nelze bezpecne
  naslepo nasadit. Prvni report 699A urci, zda je potreba baseline.
* Pres vsechny servery neexistuje atomicky rollback. Pred skutecnym apply
  nutno zvazit snapshot/restore a overit kompatibilitu Migration Manageru.
* `--check` musi v testu vystacit s `DATABASE_WRITES=NONE`. Nastroj nevypisuje
  DB hesla a pro DBDiff je pouziva pouze v docasnem souboru (0600).

## Jednorazove predpoklady (NEINSTALOVAT bez domluvy)

Na LubaServeru musi existovat:`dbdiff` CLI od DBDiff (overena verze)
https://github.com/DBDiff/DBDiff, podporujici PostgreSQL 17,
`postgres:17` Docker, Python 3, Git. DBDiff se nenainstaluje automaticky
pri `--check` a nevyzaduje upravy produkcni DB.

Zachova stavajici `migration-manager/config/backend-profiles/` (mode 600),
`control-state.json`, a vsechny casem zaregistrovane backend profily. Pro
budouci placeny VPS lze pouzit profily SSH s tunelem (nutno zkusit na VPS).

## Ocekavany postup instalace az PO kontrole GitHubu

Z GitHub `main` se vezme pouze `server/schema-sync`, `install.sh` nainstaluje
lokalni `launch.sh`, **neprovadi SQL**. Zkratka pro Termux je v
`shortcuts/LubaNote-Schema-Deploy`, nejprve je v ni `--check`.

Neinstalovat znovu predchozi 698B/698C. Ty jsme vratili zpet.
