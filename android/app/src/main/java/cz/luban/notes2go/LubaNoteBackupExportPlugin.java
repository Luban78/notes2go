package cz.luban.notes2go;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
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
import java.nio.charset.StandardCharsets;
import java.util.zip.Deflater;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

@CapacitorPlugin(name = "LubaNoteBackupExport")
public class LubaNoteBackupExportPlugin extends Plugin {

  private ZipOutputStream archivniVystup = null;
  private boolean archivPrilohaOtevrena = false;
  private long archivOcekavaneBajty = 0;
  private long archivPrijateBajty = 0;
  private String archivAktualniCesta = null;

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
    Long ocekavaneBajty = call.getLong("ocekavaneBajty");

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

}
