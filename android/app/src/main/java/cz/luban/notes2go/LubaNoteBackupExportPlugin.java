package cz.luban.notes2go;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;

import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.nio.charset.StandardCharsets;
import java.util.zip.Deflater;
import java.util.zip.ZipEntry;
import java.util.Enumeration;
import java.util.HashSet;
import java.util.Set;
import java.util.zip.ZipFile;
import java.util.zip.ZipOutputStream;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

@CapacitorPlugin(name = "LubaNoteBackupExport")
public class LubaNoteBackupExportPlugin extends Plugin {

  private ZipOutputStream archivniVystup = null;
  private boolean archivPrilohaOtevrena = false;
  private long archivOcekavaneBajty = 0;
  private long archivPrijateBajty = 0;
  private String archivAktualniCesta = null;

  private ZipFile importniArchiv = null;
  private InputStream importniVstup = null;
  private long importOcekavaneBajty = 0;
  private long importPrijateBajty = 0;
  private String importAktualniCesta = null;
  private boolean importJeArchiv = false;

  private static final long MAX_MANIFEST_IMPORT_BYTES =
    2L * 1024L * 1024L;
  private static final long MAX_BACKUP_JSON_IMPORT_BYTES =
    256L * 1024L * 1024L;
  private static final long MAX_JEDNA_IMPORT_PRILOHA_BYTES =
    2L * 1024L * 1024L;

  private File ziskejCekajiciSoubor() {
    return new File(
      getContext().getCacheDir(),
      "lubanote-backup-export.tmp"
    );
  }

  private void vycistiCekajiciSoubor() {
    File soubor = ziskejCekajiciSoubor();

    if (soubor.exists()) {
      // Jde pouze o dočasnou kopii v cache aplikace.
      soubor.delete();
    }
  }

  private File ziskejCekajiciArchiv() {
    return new File(
      getContext().getCacheDir(),
      "lubanote-backup-archive.tmp"
    );
  }

  private void resetujStavArchivniPrilohy() {
    archivPrilohaOtevrena = false;
    archivOcekavaneBajty = 0;
    archivPrijateBajty = 0;
    archivAktualniCesta = null;
  }

  private void zavriArchivBezVyjimky() {
    if (archivniVystup != null) {
      try {
        if (archivPrilohaOtevrena) {
          try {
            archivniVystup.closeEntry();
          } catch (IOException ignored) {
            // Následující close() stejně uklidí celý stream.
          }
        }

        archivniVystup.close();
      } catch (IOException ignored) {
        // Cleanup po chybě nebo zrušení exportu.
      }
    }

    archivniVystup = null;
    resetujStavArchivniPrilohy();
  }

  private void vycistiCekajiciArchiv() {
    zavriArchivBezVyjimky();

    File soubor = ziskejCekajiciArchiv();

    if (soubor.exists()) {
      soubor.delete();
    }
  }

  private Long ziskejCeleCisloJakoLong(
    PluginCall call,
    String klic
  ) {
    if (call == null || klic == null) {
      return null;
    }

    Double hodnota = call.getDouble(klic);

    if (
      hodnota == null ||
      hodnota.isNaN() ||
      hodnota.isInfinite() ||
      hodnota < 0
    ) {
      return null;
    }

    return hodnota.longValue();
  }

  private boolean jeBezpecnaCestaArchivu(String cesta) {
    if (cesta == null) {
      return false;
    }

    String hodnota = cesta.trim().replace('\\', '/');

    return !hodnota.isEmpty() &&
      !hodnota.startsWith("/") &&
      !hodnota.contains("../") &&
      !hodnota.equals("..") &&
      !hodnota.contains("//");
  }

  private void zkopirujArchivDoUri(
    File zdroj,
    Uri cil
  ) throws IOException {
    try (
      InputStream vstup = new FileInputStream(zdroj);
      OutputStream vystup = getContext()
        .getContentResolver()
        .openOutputStream(cil, "w")
    ) {
      if (vystup == null) {
        throw new IOException(
          "Android neotevřel cílový soubor."
        );
      }

      byte[] buffer = new byte[8192];
      int pocetBajtu;

      while ((pocetBajtu = vstup.read(buffer)) != -1) {
        vystup.write(buffer, 0, pocetBajtu);
      }

      vystup.flush();
    }
  }


  private File ziskejCekajiciImport() {
    return new File(
      getContext().getCacheDir(),
      "lubanote-backup-import.tmp"
    );
  }

  private void zavriImportniPolozkuBezVyjimky() {
    if (importniVstup != null) {
      try {
        importniVstup.close();
      } catch (IOException ignored) {
        // Cleanup po dokončení nebo chybě importu.
      }
    }

    importniVstup = null;
    importOcekavaneBajty = 0;
    importPrijateBajty = 0;
    importAktualniCesta = null;
  }

  private void zavriImportniArchivBezVyjimky() {
    zavriImportniPolozkuBezVyjimky();

    if (importniArchiv != null) {
      try {
        importniArchiv.close();
      } catch (IOException ignored) {
        // Cleanup po dokončení nebo chybě importu.
      }
    }

    importniArchiv = null;
  }

  private void vycistiImport() {
    zavriImportniArchivBezVyjimky();
    importJeArchiv = false;

    File soubor = ziskejCekajiciImport();

    if (soubor.exists()) {
      soubor.delete();
    }
  }

  private String ziskejNazevSouboruZUri(Uri uri) {
    String vysledek = "zaloha";

    try (
      android.database.Cursor cursor = getContext()
        .getContentResolver()
        .query(uri, null, null, null, null)
    ) {
      if (
        cursor != null &&
        cursor.moveToFirst()
      ) {
        int index = cursor.getColumnIndex(
          OpenableColumns.DISPLAY_NAME
        );

        if (index >= 0) {
          String hodnota = cursor.getString(index);

          if (hodnota != null && !hodnota.trim().isEmpty()) {
            vysledek = hodnota.trim();
          }
        }
      }
    } catch (Exception ignored) {
      // Název je pouze informativní; import podle něj nerozhodujeme.
    }

    return vysledek;
  }

  private void zkopirujUriDoImportu(
    Uri zdroj,
    File cil
  ) throws IOException {
    try (
      InputStream vstup = getContext()
        .getContentResolver()
        .openInputStream(zdroj);
      OutputStream vystup = new BufferedOutputStream(
        new FileOutputStream(cil, false)
      )
    ) {
      if (vstup == null) {
        throw new IOException(
          "Android neotevřel vybraný soubor."
        );
      }

      byte[] buffer = new byte[64 * 1024];
      int pocet;

      while ((pocet = vstup.read(buffer)) != -1) {
        vystup.write(buffer, 0, pocet);
      }

      vystup.flush();
    }
  }

  private boolean jeZipSoubor(File soubor) {
    if (!soubor.isFile() || soubor.length() < 4) {
      return false;
    }

    try (InputStream vstup = new FileInputStream(soubor)) {
      byte[] hlavicka = new byte[4];

      if (vstup.read(hlavicka) != 4) {
        return false;
      }

      return hlavicka[0] == 0x50 &&
        hlavicka[1] == 0x4b &&
        (
          (hlavicka[2] == 0x03 && hlavicka[3] == 0x04) ||
          (hlavicka[2] == 0x05 && hlavicka[3] == 0x06) ||
          (hlavicka[2] == 0x07 && hlavicka[3] == 0x08)
        );
    } catch (IOException chyba) {
      return false;
    }
  }

  private byte[] nactiPolozkuArchivuDoPameti(
    ZipFile archiv,
    ZipEntry polozka,
    long maximalniBajty
  ) throws IOException {
    long hlasenaVelikost = polozka.getSize();

    if (
      hlasenaVelikost > maximalniBajty ||
      hlasenaVelikost < 0
    ) {
      throw new IOException(
        "Položka archivu má neplatnou velikost."
      );
    }

    try (
      InputStream vstup = archiv.getInputStream(polozka);
      java.io.ByteArrayOutputStream vystup =
        new java.io.ByteArrayOutputStream(
          (int) Math.min(hlasenaVelikost, 1024 * 1024)
        )
    ) {
      byte[] buffer = new byte[32 * 1024];
      long celkem = 0;
      int pocet;

      while ((pocet = vstup.read(buffer)) != -1) {
        celkem += pocet;

        if (celkem > maximalniBajty) {
          throw new IOException(
            "Položka archivu překročila bezpečný limit."
          );
        }

        vystup.write(buffer, 0, pocet);
      }

      if (celkem != hlasenaVelikost) {
        throw new IOException(
          "Položka archivu není kompletní."
        );
      }

      return vystup.toByteArray();
    }
  }

  private String sha256Polozky(
    ZipFile archiv,
    ZipEntry polozka,
    long ocekavaneBajty
  ) throws IOException {
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      long celkem = 0;

      try (InputStream vstup = archiv.getInputStream(polozka)) {
        byte[] buffer = new byte[64 * 1024];
        int pocet;

        while ((pocet = vstup.read(buffer)) != -1) {
          celkem += pocet;

          if (celkem > MAX_JEDNA_IMPORT_PRILOHA_BYTES) {
            throw new IOException(
              "Příloha v archivu překročila limit 2 MB."
            );
          }

          digest.update(buffer, 0, pocet);
        }
      }

      if (celkem != ocekavaneBajty) {
        throw new IOException(
          "Velikost přílohy neodpovídá manifestu."
        );
      }

      StringBuilder hex = new StringBuilder();

      for (byte bajt : digest.digest()) {
        hex.append(String.format("%02x", bajt & 0xff));
      }

      return hex.toString();
    } catch (NoSuchAlgorithmException chyba) {
      throw new IOException(
        "Android nepodporuje SHA-256.",
        chyba
      );
    }
  }

  private JSObject overArchivImportuInterni()
    throws IOException, JSONException {
    File soubor = ziskejCekajiciImport();

    if (!soubor.isFile() || !jeZipSoubor(soubor)) {
      throw new IOException(
        "Vybraný soubor není platný archiv LubaNote."
      );
    }

    zavriImportniArchivBezVyjimky();

    ZipFile archiv = new ZipFile(soubor);
    boolean uspech = false;

    try {
      ZipEntry manifestEntry = archiv.getEntry("manifest.json");

      if (
        manifestEntry == null ||
        manifestEntry.isDirectory()
      ) {
        throw new IOException(
          "Archiv neobsahuje manifest.json."
        );
      }

      String manifestText = new String(
        nactiPolozkuArchivuDoPameti(
          archiv,
          manifestEntry,
          MAX_MANIFEST_IMPORT_BYTES
        ),
        StandardCharsets.UTF_8
      );

      JSONObject manifest = new JSONObject(manifestText);

      if (
        !"LubaNote-backup-archive-v4".equals(
          manifest.optString("format", "")
        ) ||
        manifest.optInt("version", -1) != 4 ||
        !manifest.optBoolean("complete", false)
      ) {
        throw new IOException(
          "Archiv nemá platný formát LubaNote V4."
        );
      }

      JSONObject backupJson = manifest.optJSONObject("backupJson");
      String backupPath = backupJson == null
        ? ""
        : backupJson.optString("path", "");

      if (
        !"backup.json".equals(backupPath) ||
        !jeBezpecnaCestaArchivu(backupPath)
      ) {
        throw new IOException(
          "Manifest neobsahuje platnou cestu backup.json."
        );
      }

      ZipEntry backupEntry = archiv.getEntry(backupPath);

      if (
        backupEntry == null ||
        backupEntry.isDirectory() ||
        backupEntry.getSize() <= 0 ||
        backupEntry.getSize() > MAX_BACKUP_JSON_IMPORT_BYTES
      ) {
        throw new IOException(
          "backup.json chybí nebo má neplatnou velikost."
        );
      }

      JSONArray prilohy = manifest.optJSONArray("attachments");

      if (prilohy == null) {
        throw new IOException(
          "Manifest neobsahuje seznam příloh."
        );
      }

      int ocekavanyPocet = manifest.optInt(
        "attachmentCount",
        -1
      );

      if (
        ocekavanyPocet < 0 ||
        ocekavanyPocet != prilohy.length()
      ) {
        throw new IOException(
          "Počet příloh neodpovídá manifestu."
        );
      }

      long soucetBajtu = 0;
      Set<String> povoleneCesty = new HashSet<>();
      Set<String> ids = new HashSet<>();

      povoleneCesty.add("manifest.json");
      povoleneCesty.add(backupPath);

      for (int i = 0; i < prilohy.length(); i += 1) {
        JSONObject polozka = prilohy.getJSONObject(i);
        String id = polozka.optString("id", "").trim();
        String noteId = polozka.optString("noteId", "").trim();
        String mimeType = polozka.optString("mimeType", "");
        String cesta = polozka.optString("archivePath", "").trim();
        String sha256 = polozka.optString("sha256", "")
          .toLowerCase();
        long velikost = polozka.optLong("sizeBytes", -1);
        String ocekavanaCesta = "attachments/" + id + ".jpg";

        if (
          id.isEmpty() ||
          noteId.isEmpty() ||
          !ids.add(id) ||
          !"image/jpeg".equals(mimeType) ||
          velikost <= 0 ||
          velikost > MAX_JEDNA_IMPORT_PRILOHA_BYTES ||
          !cesta.equals(ocekavanaCesta) ||
          !jeBezpecnaCestaArchivu(cesta) ||
          !sha256.matches("^[0-9a-f]{64}$") ||
          !povoleneCesty.add(cesta)
        ) {
          throw new IOException(
            "Manifest obsahuje neplatnou přílohu."
          );
        }

        ZipEntry entry = archiv.getEntry(cesta);

        if (entry == null || entry.isDirectory()) {
          throw new IOException(
            "V archivu chybí příloha " + id + "."
          );
        }

        if (entry.getSize() != velikost) {
          throw new IOException(
            "Velikost přílohy " + id +
            " neodpovídá manifestu."
          );
        }

        String skutecnySha = sha256Polozky(
          archiv,
          entry,
          velikost
        );

        if (!sha256.equals(skutecnySha)) {
          throw new IOException(
            "SHA-256 přílohy " + id +
            " neodpovídá manifestu."
          );
        }

        soucetBajtu += velikost;
      }

      long hlasenySoucet = manifest.optLong(
        "attachmentBytes",
        -1
      );

      if (hlasenySoucet != soucetBajtu) {
        throw new IOException(
          "Celková velikost příloh neodpovídá manifestu."
        );
      }

      Set<String> skutecneCesty = new HashSet<>();
      Enumeration<? extends ZipEntry> polozky = archiv.entries();

      while (polozky.hasMoreElements()) {
        ZipEntry entry = polozky.nextElement();

        if (entry.isDirectory()) {
          continue;
        }

        String cesta = entry.getName();

        if (
          !jeBezpecnaCestaArchivu(cesta) ||
          !skutecneCesty.add(cesta) ||
          !povoleneCesty.contains(cesta)
        ) {
          throw new IOException(
            "Archiv obsahuje neočekávanou nebo duplicitní položku."
          );
        }
      }

      if (!skutecneCesty.equals(povoleneCesty)) {
        throw new IOException(
          "Archiv není kompletní."
        );
      }

      importniArchiv = archiv;
      importJeArchiv = true;
      uspech = true;

      JSObject odpoved = new JSObject();
      odpoved.put("ok", true);
      odpoved.put("manifestJson", manifestText);
      odpoved.put("backupPath", backupPath);
      odpoved.put("backupBytes", backupEntry.getSize());
      odpoved.put("attachmentCount", ocekavanyPocet);
      odpoved.put("attachmentBytes", soucetBajtu);
      return odpoved;
    } finally {
      if (!uspech) {
        try {
          archiv.close();
        } catch (IOException ignored) {
          // Původní chyba má přednost.
        }
      }
    }
  }

  @PluginMethod
  public void zahajExport(PluginCall call) {
    vycistiCekajiciSoubor();

    File soubor = ziskejCekajiciSoubor();

    try (
      FileOutputStream docasnyVystup =
        new FileOutputStream(
          soubor,
          false
        )
    ) {
      docasnyVystup.flush();

      JSObject odpoved = new JSObject();
      odpoved.put("bytes", 0);
      call.resolve(odpoved);
    } catch (IOException chyba) {
      vycistiCekajiciSoubor();
      call.reject(
        "Zahájení exportu zálohy selhalo.",
        chyba
      );
    }
  }

  @PluginMethod
  public void pridejCast(PluginCall call) {
    String cast = call.getString("cast");
    File soubor = ziskejCekajiciSoubor();

    if (cast == null || !soubor.isFile()) {
      call.reject(
        "Export nebyl zahájen nebo chybí část zálohy."
      );
      return;
    }

    try (
      FileOutputStream docasnyVystup =
        new FileOutputStream(
          soubor,
          true
        )
    ) {
      docasnyVystup.write(
        cast.getBytes(StandardCharsets.UTF_8)
      );
      docasnyVystup.flush();

      JSObject odpoved = new JSObject();
      odpoved.put("bytes", soubor.length());
      call.resolve(odpoved);
    } catch (IOException chyba) {
      vycistiCekajiciSoubor();
      call.reject(
        "Přenos části zálohy selhal.",
        chyba
      );
    }
  }

  @PluginMethod
  public void otevriUlozeni(PluginCall call) {
    File soubor = ziskejCekajiciSoubor();

    if (!soubor.isFile() || soubor.length() == 0) {
      vycistiCekajiciSoubor();
      call.reject(
        "Připravená záloha je prázdná nebo chybí."
      );
      return;
    }

    String nazevSouboru = call.getString(
      "nazevSouboru",
      "lubanote-backup.json"
    );

    Intent zamer = new Intent(
      Intent.ACTION_CREATE_DOCUMENT
    );

    zamer.addCategory(Intent.CATEGORY_OPENABLE);
    zamer.setType("application/json");
    zamer.putExtra(
      Intent.EXTRA_TITLE,
      nazevSouboru
    );

    startActivityForResult(
      call,
      zamer,
      "dokonceniUlozeni"
    );
  }

  @ActivityCallback
  private void dokonceniUlozeni(
    PluginCall call,
    ActivityResult vysledek
  ) {
    if (call == null) {
      vycistiCekajiciSoubor();
      return;
    }

    Intent dataZameru = vysledek.getData();

    if (
      vysledek.getResultCode() != Activity.RESULT_OK ||
      dataZameru == null ||
      dataZameru.getData() == null
    ) {
      vycistiCekajiciSoubor();

      JSObject odpoved = new JSObject();
      odpoved.put("saved", false);
      odpoved.put("canceled", true);
      call.resolve(odpoved);
      return;
    }

    Uri cil = dataZameru.getData();
    File cekajiciSouborZalohy =
      ziskejCekajiciSoubor();

    if (
      !cekajiciSouborZalohy.isFile() ||
      cekajiciSouborZalohy.length() == 0
    ) {
      vycistiCekajiciSoubor();
      call.reject(
        "Dočasná záloha je prázdná nebo chybí."
      );
      return;
    }

    try (
      InputStream vstup =
        new FileInputStream(
          cekajiciSouborZalohy
        );
      OutputStream vystup =
        getContext()
          .getContentResolver()
          .openOutputStream(cil, "wt")
    ) {
      if (vystup == null) {
        call.reject(
          "Android neotevřel cílový soubor."
        );
        return;
      }

      byte[] buffer = new byte[8192];
      int pocetBajtu;

      while (
        (pocetBajtu = vstup.read(buffer)) != -1
      ) {
        vystup.write(
          buffer,
          0,
          pocetBajtu
        );
      }

      vystup.flush();

      JSObject odpoved = new JSObject();
      odpoved.put("saved", true);
      odpoved.put("canceled", false);
      odpoved.put("uri", cil.toString());
      call.resolve(odpoved);
    } catch (IOException chyba) {
      call.reject(
        "Zápis zálohy do souboru selhal.",
        chyba
      );
    } finally {
      vycistiCekajiciSoubor();
    }
  }
  // ============================================================
  // KOMPLETNÍ ARCHIV V4
  // ZIP se zapisuje průběžně do cache. Binární obsah přichází
  // z JavaScriptu po malých Base64 blocích, takže se celý archiv
  // ani všechny JPEG přílohy nedrží najednou v RAM.
  // ============================================================

  @PluginMethod
  public synchronized void zahajArchiv(PluginCall call) {
    vycistiCekajiciArchiv();

    File soubor = ziskejCekajiciArchiv();

    try {
      FileOutputStream fileOutput =
        new FileOutputStream(soubor, false);

      archivniVystup = new ZipOutputStream(
        new BufferedOutputStream(fileOutput)
      );

      // JPEG už je komprimovaný; další komprese jen zdržuje CPU.
      archivniVystup.setLevel(Deflater.NO_COMPRESSION);
      resetujStavArchivniPrilohy();

      JSObject odpoved = new JSObject();
      odpoved.put("started", true);
      call.resolve(odpoved);
    } catch (IOException chyba) {
      vycistiCekajiciArchiv();
      call.reject(
        "Zahájení kompletního archivu selhalo.",
        chyba
      );
    }
  }

  @PluginMethod
  public synchronized void zahajPrilohu(PluginCall call) {
    String nazev = call.getString("nazev");
    Long ocekavaneBajty = ziskejCeleCisloJakoLong(
      call,
      "ocekavaneBajty"
    );

    if (
      archivniVystup == null ||
      archivPrilohaOtevrena ||
      !jeBezpecnaCestaArchivu(nazev) ||
      ocekavaneBajty == null ||
      ocekavaneBajty < 0
    ) {
      call.reject(
        "Archiv není připraven nebo položka není platná."
      );
      return;
    }

    try {
      archivniVystup.putNextEntry(
        new ZipEntry(nazev.trim())
      );

      archivPrilohaOtevrena = true;
      archivOcekavaneBajty = ocekavaneBajty;
      archivPrijateBajty = 0;
      archivAktualniCesta = nazev.trim();

      JSObject odpoved = new JSObject();
      odpoved.put("started", true);
      odpoved.put("path", archivAktualniCesta);
      call.resolve(odpoved);
    } catch (IOException chyba) {
      vycistiCekajiciArchiv();
      call.reject(
        "Položku se nepodařilo otevřít v archivu.",
        chyba
      );
    }
  }

  @PluginMethod
  public synchronized void pridejPrilohuCast(PluginCall call) {
    String base64 = call.getString("base64");

    if (
      archivniVystup == null ||
      !archivPrilohaOtevrena ||
      base64 == null
    ) {
      call.reject(
        "V archivu není otevřená položka."
      );
      return;
    }

    try {
      byte[] bajty = Base64.decode(
        base64,
        Base64.NO_WRAP
      );

      if (
        archivPrijateBajty + bajty.length >
        archivOcekavaneBajty
      ) {
        throw new IOException(
          "Položka obsahuje více bajtů, než bylo ohlášeno."
        );
      }

      archivniVystup.write(bajty);
      archivPrijateBajty += bajty.length;

      JSObject odpoved = new JSObject();
      odpoved.put("bytes", archivPrijateBajty);
      call.resolve(odpoved);
    } catch (IllegalArgumentException | IOException chyba) {
      vycistiCekajiciArchiv();
      call.reject(
        "Přenos části položky archivu selhal.",
        chyba
      );
    }
  }

  @PluginMethod
  public synchronized void dokoncitPrilohu(PluginCall call) {
    if (
      archivniVystup == null ||
      !archivPrilohaOtevrena
    ) {
      call.reject(
        "V archivu není otevřená položka."
      );
      return;
    }

    if (archivPrijateBajty != archivOcekavaneBajty) {
      String cesta = archivAktualniCesta;
      long prijato = archivPrijateBajty;
      long ocekavano = archivOcekavaneBajty;
      vycistiCekajiciArchiv();
      call.reject(
        "Položka " + cesta +
        " není kompletní: přijato " + prijato +
        " z " + ocekavano + " bajtů."
      );
      return;
    }

    try {
      archivniVystup.closeEntry();

      JSObject odpoved = new JSObject();
      odpoved.put("bytes", archivPrijateBajty);
      odpoved.put("path", archivAktualniCesta);

      resetujStavArchivniPrilohy();
      call.resolve(odpoved);
    } catch (IOException chyba) {
      vycistiCekajiciArchiv();
      call.reject(
        "Dokončení položky archivu selhalo.",
        chyba
      );
    }
  }

  @PluginMethod
  public synchronized void dokoncitArchiv(PluginCall call) {
    if (archivniVystup == null) {
      call.reject("Archiv nebyl zahájen.");
      return;
    }

    if (archivPrilohaOtevrena) {
      call.reject(
        "Před dokončením archivu je nutné dokončit otevřenou položku."
      );
      return;
    }

    File soubor = ziskejCekajiciArchiv();

    try {
      archivniVystup.finish();
      archivniVystup.close();
      archivniVystup = null;
      resetujStavArchivniPrilohy();

      if (!soubor.isFile() || soubor.length() <= 0) {
        throw new IOException(
          "Výsledný archiv je prázdný."
        );
      }

      JSObject odpoved = new JSObject();
      odpoved.put("bytes", soubor.length());
      odpoved.put("ready", true);
      call.resolve(odpoved);
    } catch (IOException chyba) {
      vycistiCekajiciArchiv();
      call.reject(
        "Dokončení kompletního archivu selhalo.",
        chyba
      );
    }
  }

  @PluginMethod
  public void otevriUlozeniArchivu(PluginCall call) {
    File soubor = ziskejCekajiciArchiv();

    if (
      archivniVystup != null ||
      !soubor.isFile() ||
      soubor.length() == 0
    ) {
      call.reject(
        "Kompletní archiv ještě není připravený."
      );
      return;
    }

    String nazevSouboru = call.getString(
      "nazevSouboru",
      "lubanote-backup.lubbackup"
    );

    Intent zamer = new Intent(
      Intent.ACTION_CREATE_DOCUMENT
    );

    zamer.addCategory(Intent.CATEGORY_OPENABLE);
    zamer.setType("application/zip");
    zamer.putExtra(
      Intent.EXTRA_TITLE,
      nazevSouboru
    );

    startActivityForResult(
      call,
      zamer,
      "dokonceniUlozeniArchivu"
    );
  }

  @ActivityCallback
  private void dokonceniUlozeniArchivu(
    PluginCall call,
    ActivityResult vysledek
  ) {
    if (call == null) {
      vycistiCekajiciArchiv();
      return;
    }

    Intent dataZameru = vysledek.getData();

    if (
      vysledek.getResultCode() != Activity.RESULT_OK ||
      dataZameru == null ||
      dataZameru.getData() == null
    ) {
      vycistiCekajiciArchiv();

      JSObject odpoved = new JSObject();
      odpoved.put("saved", false);
      odpoved.put("canceled", true);
      call.resolve(odpoved);
      return;
    }

    Uri cil = dataZameru.getData();
    File soubor = ziskejCekajiciArchiv();

    try {
      zkopirujArchivDoUri(soubor, cil);

      JSObject odpoved = new JSObject();
      odpoved.put("saved", true);
      odpoved.put("canceled", false);
      odpoved.put("uri", cil.toString());
      odpoved.put("bytes", soubor.length());
      call.resolve(odpoved);
    } catch (IOException chyba) {
      call.reject(
        "Zápis kompletního archivu selhal.",
        chyba
      );
    } finally {
      vycistiCekajiciArchiv();
    }
  }

  @PluginMethod
  public void ziskejArchivProSdileni(PluginCall call) {
    File soubor = ziskejCekajiciArchiv();

    if (
      archivniVystup != null ||
      !soubor.isFile() ||
      soubor.length() == 0
    ) {
      call.reject(
        "Kompletní archiv ještě není připravený."
      );
      return;
    }

    try {
      Uri uri = FileProvider.getUriForFile(
        getContext(),
        getContext().getPackageName() + ".fileprovider",
        soubor
      );

      JSObject odpoved = new JSObject();
      odpoved.put("uri", uri.toString());
      odpoved.put("bytes", soubor.length());
      call.resolve(odpoved);
    } catch (IllegalArgumentException chyba) {
      vycistiCekajiciArchiv();
      call.reject(
        "Archiv se nepodařilo připravit ke sdílení.",
        chyba
      );
    }
  }

  @PluginMethod
  public void vycistiArchiv(PluginCall call) {
    vycistiCekajiciArchiv();

    JSObject odpoved = new JSObject();
    odpoved.put("cleaned", true);
    call.resolve(odpoved);
  }


  // ============================================================
  // IMPORT KOMPLETNÍHO ARCHIVU V4
  // Vybraný soubor se nejdřív streamovaně zkopíruje do cache.
  // Archiv se před obnovou celý ověří včetně SHA-256 příloh.
  // Jednotlivé položky pak JavaScript čte po malých Base64 blocích.
  // ============================================================

  @PluginMethod
  public void otevriImport(PluginCall call) {
    vycistiImport();

    Intent zamer = new Intent(Intent.ACTION_OPEN_DOCUMENT);
    zamer.addCategory(Intent.CATEGORY_OPENABLE);
    zamer.setType("*/*");
    zamer.putExtra(
      Intent.EXTRA_MIME_TYPES,
      new String[] {
        "application/json",
        "application/zip",
        "application/octet-stream"
      }
    );

    startActivityForResult(
      call,
      zamer,
      "dokonceniOtevreniImportu"
    );
  }

  @ActivityCallback
  private void dokonceniOtevreniImportu(
    PluginCall call,
    ActivityResult vysledek
  ) {
    if (call == null) {
      vycistiImport();
      return;
    }

    Intent dataZameru = vysledek.getData();

    if (
      vysledek.getResultCode() != Activity.RESULT_OK ||
      dataZameru == null ||
      dataZameru.getData() == null
    ) {
      vycistiImport();
      JSObject odpoved = new JSObject();
      odpoved.put("canceled", true);
      call.resolve(odpoved);
      return;
    }

    Uri uri = dataZameru.getData();
    File cil = ziskejCekajiciImport();

    try {
      zkopirujUriDoImportu(uri, cil);

      if (!cil.isFile() || cil.length() <= 0) {
        throw new IOException(
          "Vybraný soubor je prázdný."
        );
      }

      importJeArchiv = jeZipSoubor(cil);

      JSObject odpoved = new JSObject();
      odpoved.put("canceled", false);
      odpoved.put(
        "typ",
        importJeArchiv ? "archive-v4" : "json"
      );
      odpoved.put("bytes", cil.length());
      odpoved.put(
        "nazevSouboru",
        ziskejNazevSouboruZUri(uri)
      );
      call.resolve(odpoved);
    } catch (IOException chyba) {
      vycistiImport();
      call.reject(
        "Vybranou zálohu se nepodařilo připravit.",
        chyba
      );
    }
  }

  @PluginMethod
  public synchronized void overArchivImportu(PluginCall call) {
    if (!importJeArchiv) {
      call.reject(
        "Vybraný soubor není archiv V4."
      );
      return;
    }

    try {
      call.resolve(overArchivImportuInterni());
    } catch (IOException | JSONException chyba) {
      vycistiImport();
      call.reject(
        "Kompletní archiv V4 neprošel kontrolou.",
        chyba
      );
    }
  }

  @PluginMethod
  public synchronized void zahajCteniImportu(PluginCall call) {
    zavriImportniPolozkuBezVyjimky();

    File soubor = ziskejCekajiciImport();

    if (!soubor.isFile()) {
      call.reject("Importovaná záloha už není dostupná.");
      return;
    }

    try {
      if (importJeArchiv) {
        if (importniArchiv == null) {
          call.reject(
            "Archiv V4 musí být před čtením nejdřív ověřen."
          );
          return;
        }

        String nazev = call.getString("nazev");

        if (!jeBezpecnaCestaArchivu(nazev)) {
          call.reject("Neplatná cesta položky archivu.");
          return;
        }

        ZipEntry entry = importniArchiv.getEntry(nazev);

        if (entry == null || entry.isDirectory()) {
          call.reject("Položka v archivu neexistuje.");
          return;
        }

        importniVstup = importniArchiv.getInputStream(entry);
        importOcekavaneBajty = entry.getSize();
        importAktualniCesta = nazev;
      } else {
        importniVstup = new FileInputStream(soubor);
        importOcekavaneBajty = soubor.length();
        importAktualniCesta = "legacy.json";
      }

      importPrijateBajty = 0;

      JSObject odpoved = new JSObject();
      odpoved.put("started", true);
      odpoved.put("path", importAktualniCesta);
      odpoved.put("bytes", importOcekavaneBajty);
      call.resolve(odpoved);
    } catch (IOException chyba) {
      zavriImportniPolozkuBezVyjimky();
      call.reject(
        "Položku zálohy se nepodařilo otevřít.",
        chyba
      );
    }
  }

  @PluginMethod
  public synchronized void nactiCastImportu(PluginCall call) {
    if (importniVstup == null) {
      call.reject("Není otevřená položka importu.");
      return;
    }

    Integer pozadovano = call.getInt("maxBajtu");
    int maximum = pozadovano == null ? 96 * 1024 : pozadovano;
    maximum = Math.max(4096, Math.min(maximum, 256 * 1024));

    try {
      long zbyva = importOcekavaneBajty - importPrijateBajty;
      int velikost = (int) Math.min(maximum, Math.max(0, zbyva));

      if (velikost == 0) {
        JSObject odpoved = new JSObject();
        odpoved.put("base64", "");
        odpoved.put("bytes", importPrijateBajty);
        odpoved.put("done", true);
        call.resolve(odpoved);
        return;
      }

      byte[] buffer = new byte[velikost];
      int precteno = importniVstup.read(buffer);

      if (precteno < 0) {
        throw new IOException(
          "Položka importu skončila před očekávanou velikostí."
        );
      }

      importPrijateBajty += precteno;

      byte[] cast;

      if (precteno == buffer.length) {
        cast = buffer;
      } else {
        cast = new byte[precteno];
        System.arraycopy(buffer, 0, cast, 0, precteno);
      }

      JSObject odpoved = new JSObject();
      odpoved.put(
        "base64",
        Base64.encodeToString(cast, Base64.NO_WRAP)
      );
      odpoved.put("bytes", importPrijateBajty);
      odpoved.put(
        "done",
        importPrijateBajty >= importOcekavaneBajty
      );
      call.resolve(odpoved);
    } catch (IOException chyba) {
      zavriImportniPolozkuBezVyjimky();
      call.reject(
        "Čtení části zálohy selhalo.",
        chyba
      );
    }
  }

  @PluginMethod
  public synchronized void dokoncitCteniImportu(PluginCall call) {
    if (importniVstup == null) {
      call.reject("Není otevřená položka importu.");
      return;
    }

    if (importPrijateBajty != importOcekavaneBajty) {
      long prijato = importPrijateBajty;
      long ocekavano = importOcekavaneBajty;
      zavriImportniPolozkuBezVyjimky();
      call.reject(
        "Položka importu není kompletní: přijato " +
        prijato + " z " + ocekavano + " bajtů."
      );
      return;
    }

    String cesta = importAktualniCesta;
    zavriImportniPolozkuBezVyjimky();

    JSObject odpoved = new JSObject();
    odpoved.put("done", true);
    odpoved.put("path", cesta);
    call.resolve(odpoved);
  }

  @PluginMethod
  public synchronized void vycistiImport(PluginCall call) {
    vycistiImport();
    JSObject odpoved = new JSObject();
    odpoved.put("cleaned", true);
    call.resolve(odpoved);
  }

}
