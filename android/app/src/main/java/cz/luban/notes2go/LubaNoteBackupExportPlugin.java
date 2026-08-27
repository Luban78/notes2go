package cz.luban.notes2go;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "LubaNoteBackupExport")
public class LubaNoteBackupExportPlugin extends Plugin {

  private File cekajiciSouborZalohy;

  private void vycistiCekajiciSoubor() {
    File soubor = cekajiciSouborZalohy;
    cekajiciSouborZalohy = null;

    if (soubor != null && soubor.exists()) {
      // Jde pouze o dočasnou kopii v cache aplikace.
      soubor.delete();
    }
  }

  @PluginMethod
  public void ulozJson(PluginCall call) {
    String obsah = call.getString("data");

    if (obsah == null) {
      call.reject("Chybí obsah zálohy.");
      return;
    }

    /*
     * PluginCall se po návratu ze systémového správce souborů nemusí
     * vrátit s původním velkým JSON řetězcem. Proto obsah uložíme ještě
     * před otevřením dialogu do dočasného souboru v cache aplikace.
     */
    vycistiCekajiciSoubor();

    cekajiciSouborZalohy = new File(
      getContext().getCacheDir(),
      "lubanote-backup-export.tmp"
    );

    try (
      FileOutputStream docasnyVystup =
        new FileOutputStream(
          cekajiciSouborZalohy,
          false
        )
    ) {
      docasnyVystup.write(
        obsah.getBytes(StandardCharsets.UTF_8)
      );
      docasnyVystup.flush();
    } catch (IOException chyba) {
      vycistiCekajiciSoubor();
      call.reject(
        "Příprava dočasné zálohy selhala.",
        chyba
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

    if (
      cekajiciSouborZalohy == null ||
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
}
