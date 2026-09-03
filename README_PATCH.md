# LubaNote – Attachments FÁZE B / cloudová stínová vrstva V1

Základ: poslední potvrzená FÁZE A nad `notes2go-vse-ok.zip`.

## Proč je Fáze B stále stínová

Nový JPEG se už skutečně ukládá do IndexedDB a Supabase Storage, ale Data URL zatím zůstává uvnitř poznámky jako dosud. Tím zůstávají beze změny:

- současný sync a revision ochrana,
- bezpečný handoff,
- Realtime,
- kompletní JSON backup/import,
- otevření stejné poznámky na zařízení, které ještě nemá lokální attachment cache.

Pokud Storage/RPC ve Fázi B selže, poznámka se dál synchronizuje původním Data URL způsobem. Až bude Storage prokazatelně stabilní a bude připraven download + nový kompletní backup, teprve další fáze odstraní Base64 z nových běžných poznámek.

## Změněné / nové soubory

- `attachmentsLocal.js` – IndexedDB schema v2, trvalá upload fronta, cloud status.
- `attachmentsCloud.js` – NOVÝ; rezervace, upload, potvrzení, aktivace, diagnostika.
- `editorMedia.js` – nové normální obrázky: JPEG / max 1280 px / quality 0.70. Secret zůstává na původní cestě.
- `sync.js` – před běžným notes uploadem zkusí cloudový shadow upload; jeho chyba notes sync nezablokuje.
- `index.html` – pouze funkční include `attachmentsCloud.js` po `supabaseClient.js`.
- `supabase_attachments_FAZE_B.sql` – bucket, metadata, plány, RLS a RPC.

## SQL – spustit jako první

V Supabase SQL Editoru spusť celý:

`supabase_attachments_FAZE_B.sql`

Je záměrně opakovatelný pro první instalaci Fáze B.

SQL:

- vytvoří PRIVÁTNÍ bucket `lubanote-attachments`,
- bucket přijme pouze `image/jpeg`, max 2 MB,
- vytvoří `lubanote_plans`, `lubanote_user_access`, `attachments`,
- existující Auth účty nastaví jako `internal`, aby testování nenarazilo na komerční kvótu,
- nový budoucí Auth účet bez záznamu v `lubanote_user_access` nemůže rezervovat upload,
- vytvoří RPC:
  - `lubanote_reserve_attachment`
  - `lubanote_confirm_attachment`
  - `lubanote_activate_note_attachments`
  - `lubanote_get_attachment_usage`
- klient NEMÁ Storage DELETE/UPDATE oprávnění.

Demo plán je už připraven: 14 dní, 100 poznámek, 30 příloh, 50 MB příloh, max 2 MB jedna příloha. Full má zatím pracovní limit 2 GB. Tyto limity nejsou natvrdo v APK.

## Instalace aplikace

Po úspěšném SQL nahraď kompletní soubory z patch ZIPu a přidej nový `attachmentsCloud.js`.

Pak commit / push / nový APK build podle běžného workflow.

## Test 1 – nový normální obrázek online

1. Otevři normální poznámku.
2. Vlož NOVÝ obrázek.
3. Ulož poznámku.
4. Počkej na dokončení běžného syncu.

V SPCK konzoli:

```js
LubaNoteAttachmentsLocal.ziskejDiagnostiku().then(console.log)
```

Očekávání:

- `verze: 2`
- `rezim: "cloud_shadow"`
- po úspěšném uploadu `nahraneUploady` >= 1
- `cekajiciUploady` ideálně 0

Cloud:

```js
LubaNoteAttachmentsCloud.ziskejCloudDiagnostiku().then(console.log)
```

Očekávání pro současný účet:

- `dostupne: true`
- `ok: true`
- `plan_id: "internal"`
- `attachment_count` >= 1
- `attachment_bytes` > 0

V Supabase lze navíc ověřit:

```sql
select
  id,
  note_id,
  mime_type,
  reserved_bytes,
  size_bytes,
  status,
  storage_path,
  uploaded_at,
  linked_at
from public.attachments
order by created_at desc
limit 20;
```

Nový řádek má po úspěšném notes syncu skončit jako `active`.

## Test 2 – Storage

V Supabase Storage otevři `lubanote-attachments`.

Cesta bude:

`<user_uuid>/<note_id>/<attachment_uuid>.jpg`

Bucket musí zůstat Private.

## Test 3 – offline fronta

1. Vypni internet.
2. Vlož nový normální obrázek a ulož poznámku.
3. Diagnostika má ukázat čekající upload.
4. Zapni internet.
5. Nech proběhnout sync / případně udělej drobnou změnu a ulož.
6. Upload musí přejít na `uploaded/active`.

Poznámka musí být po celou dobu normálně použitelná, protože Data URL stále zůstává uvnitř.

## Test 4 – Secret

1. Zapamatuj `attachment_count` v cloud diagnostice a `pocetPriloh` lokálně.
2. Vlož obrázek do Secret poznámky a ulož.
3. Ani lokální plaintext attachment počet, ani cloud attachment_count se kvůli Secret obrázku nesmí zvýšit.

## Test 5 – regresní kontrola

Ověř stejné chování jako před Fází B:

- klasický obrázek,
- obrázek v bulletu,
- obrázek v TODO,
- velikost / zarovnání,
- normální editor: samostatný přesun obrázku,
- bullet/TODO: obrázek se přesouvá jen s celou bullet/TODO položkou,
- dvojtap fullscreen,
- uložit / zavřít / znovu otevřít,
- PC/APK sync,
- handoff,
- kompletní export/import.

## Kompatibilita Fáze A

Obrázky vložené v předchozí Fázi A mají lokální `faze: "shadow_v1"`. Fáze B je automaticky NEPOSÍLÁ do nového JPEG bucketu. Nejsou problém: jejich Data URL zůstává v poznámce jako dosud.

Do cloudového attachment systému jdou až NOVĚ vložené normální obrázky Fáze B (`cloud_shadow_v1`).

## Co Fáze B záměrně ještě nedělá

- neodstraňuje Base64/Data URL z poznámky,
- nestahuje attachment ze Storage na druhé zařízení,
- nemigruje staré obrázky,
- nemaže orphan Storage soubory,
- nepřesouvá Secret obrázky do Storage,
- nemění JSON backup formát.

To jsou další kroky až po potvrzení, že tato cloudová stínová vrstva funguje bez regrese.
