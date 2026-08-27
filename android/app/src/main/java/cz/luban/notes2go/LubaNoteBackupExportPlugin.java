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

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "LubaNoteBackupExport")
public class LubaNoteBackupExportPlugin extends Plugin {

  @PluginMethod
  public void ulozJson(PluginCall call) {
    String obsah = call.getString("data");

    if (obsah == null) {
      call.reject("Chybí obsah zálohy.");
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
      return;
    }

    Intent dataZameru = vysledek.getData();

    if (
      vysledek.getResultCode() != Activity.RESULT_OK ||
      dataZameru == null ||
      dataZameru.getData() == null
    ) {
      JSObject odpoved = new JSObject();
      odpoved.put("saved", false);
      odpoved.put("canceled", true);
      call.resolve(odpoved);
      return;
    }

    Uri cil = dataZameru.getData();
    String obsah = call.getString("data", "");

    try (
      OutputStream vystup =
        getContext()
          .getContentResolver()
          .openOutputStream(cil, "w")
    ) {
      if (vystup == null) {
        call.reject(
          "Android neotevřel cílový soubor."
        );
        return;
      }

      vystup.write(
        obsah.getBytes(StandardCharsets.UTF_8)
      );

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
    }
  }
}
