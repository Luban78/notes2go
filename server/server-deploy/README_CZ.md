# LubaNote Server Deploy 698B – univerzalni registry

Nahradi nedokonceny 698A. Balicek obsahuje **jen nove** soubory v
`server/server-deploy/` a SQL migraci 697FA; nejde o patch `adminDashboard.js`.

## Co znamena univerzalni backend

Nezavisi na Dellu ani na poskytovateli budoucniho VPS. V souboru
`backends.conf` jsou zatim `cloud` a `lubaserver`. Az koupime VPS, doplnime
jeho ID (napr. `vps-produkcni`) a zprovoznime
`migration-manager/config/backend-profiles/vps-produkcni.destination.env`.
Tento profil pouzije stavajici adapter `destination-lib`, napr. SSH a Docker.
Bez sitoveho pristupu a vytvoreneho profilu se server sam objevit nemuze.

`--check`: overi vsechny registrovane backendy, ulozene migrace a freeze,
bez databazovych zapisu. `--apply`: pozaduje dostupnost **vsech**
registrovanych backendu, potvrzeni `NASADIT`, provadi SQL na neaktivnich
backendech a na aktualni produkci az jako posledni; po kazdem kroku overi
verzi a zaznam v migracni knize. Nedostupny backend cele nasazeni **zablokuje
pred prvni zmenou**. Novy VPS neregistrovat do provozni skupiny driv, nez
je inicializovany a pripraveny pro read-only kontrolu.

Pokud uz je aktivnim backendem VPS, funguje stejne: ID produkce bere
z `migration-bridge/control-state.json`, a to vzdy provede jako posledni.
Neresi automaticky zmenu `active_backend`, protoze to dela samostatne
Migration Manager.

## Omezeni

- Podporuje **verzovane SQL migrace** (tabulky, funkce, triggery, RPC, prava),
  ne kazdy typ konfigurace OS, Dockeru, Caddy ani Supabase Auth.
- Sam nerozpozna zmeny DB provedene rucne mimo migrace.
- Neni to transakce mezi servery. Pri chybe po uprave jednoho backendu se
  dalsi zastavi; databaze se automaticky nevraci.
- Sam o sobe jeste nezablokuje `CUTOVER` v Migration Manageru: pred
  nasledujicim CUTOVER musi byt explicitne provedena kontrola schema/migraci.
- Neni zatim testovany na produkcnim LubaServeru ani Cloudu. **Neprovadej
  `--apply`, dokud neprojdeme `--check` a nevyhodnotime vystup.**
- Migrace 697FA nastavi nove automaticke Demo na VYPNUTO a upravi trigger,
  aby cetl data z `public.lubanote_plans`; existujici demo ucty neprepise.
  To ale jeste **nezakazuje registraci noveho uctu** (ta je vec Auth).

## Bezpecny postup po nahrani balicku do GitHub `main`

1. V SPCK vloz do korene projektu slozku `server/server-deploy` ze ZIP.
   Zadny jiny soubor nenahrazuj. Commit/uloz na `main` bezne jako vzdy.
2. Potom na LubaServeru jednou nainstalujeme spousteci skripty, **bez
   provedeni SQL**, timto prikazem:

```bash
(
  set -e
  REPO="$HOME/luba-server/lubanote"
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  git -C "$REPO" fetch origin main
  git -C "$REPO" archive origin/main server/server-deploy | tar -x -C "$TMP"
  bash "$TMP/server/server-deploy/install.sh"
)
```

3. Spustime **pouze read-only preflight**:

```bash
$HOME/luba-server/server-deploy/launch.sh --check
```

Zkontrolujeme `REGISTERED_BACKENDS=cloud lubaserver`, `PREFLIGHT=PASS`
a `DATABASE_WRITES=NONE`. Do SQL se pred touto kontrolou nezasahuje.

## Daleko budouci komercni VPS

Po jeho nakupu nainstalujeme DB/stack, vytvorime jeho tajne SSH/API/DB
udaje pouze na LubaServeru v `backend-profiles/`, prepneme ho do stavu
FROZEN a doplnime jeho ID do `backends.conf`. Pri nasledujicim `--check`
se bude kontrolovat taky. Pro kompletni prechod produkce muze byt nutna
migrace existujicich uzivatelu/dat a kompatibilni schema – Server Deploy
sam o sobe nenahrazuje PREPARE → VERIFY → CUTOVER.


## 698C: sdileny lock a kontrola owneru (zatim nenasezovat SQL)

Pred ostrym `--apply` musi mit runtime `lubanote-migrate` a `backend-select`
instalovany stejny flock guard jako Server Deploy. Jinak se `--apply` ZABLOKUJE.
Opraveny GitHub skript Migration Manageru neni automaticky nahravan do runtime;
instalator `install-shared-lock.sh` vklada pouze minimalni zamek do zivych
skriptu a pred zmenou vytvori jejich zalozene kopie. Neprepisuje migracni logiku
ani backend konfigurace. Kontrola funkci/roli odmita opravneni, ktera by
znemoznila ALTER TABLE nebo CREATE OR REPLACE FUNCTION.

Bezpecne poradi (po nahrani 698C na GitHub):

1. Pouze `install-shared-lock.sh --check` (zadne zmeny, zadne SQL).
2. Provedeme `launch.sh --check` a probereme log a role Cloudu/LubaServeru.
3. Az potom samostatne domluvime `install-shared-lock.sh --apply`,
   to meni jen existujici runtime shell skripty a vytvori jejich zalohy.
4. A az po overeni shared locku smi byt uvazovano o serverovem `--apply` SQL.

POZOR: sdileny lock chrani migraci spustenou pres tyto 2 CLI entrypointy.
Nechrani rucni zmeny DB nebo nezavisle operace mimo tento system.
