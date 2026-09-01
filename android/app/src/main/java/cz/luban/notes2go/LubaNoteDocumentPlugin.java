package cz.luban.notes2go;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "LubaNoteDocument")
public class LubaNoteDocumentPlugin extends Plugin {

  private static final long MAX_VELIKOST_SOUBORU =
    20L * 1024L * 1024L;

  private String cekajiciObsah = null;
  private String cekajiciMimeType = "text/html";

  @PluginMethod
  public void otevriDokument(PluginCall call) {
    Intent zamer = new Intent(Intent.ACTION_OPEN_DOCUMENT);
    zamer.addCategory(Intent.CATEGORY_OPENABLE);
    zamer.setType("text/*");

    String[] mimeTypy = new String[] {
      "text/html",
      "text/plain"
    };

    zamer.putExtra(Intent.EXTRA_MIME_TYPES, mimeTypy);

    startActivityForResult(
      call,
      zamer,
      "dokonceniOtevreni"
    );
  }

  @ActivityCallback
  private void dokonceniOtevreni(
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
      odpoved.put("canceled", true);
      call.resolve(odpoved);
      return;
    }

    Uri uri = dataZameru.getData();

    try {
      String obsah = nactiTextovySoubor(uri);

      JSObject odpoved = new JSObject();
      odpoved.put("canceled", false);
      odpoved.put("obsah", obsah);
      odpoved.put("nazevSouboru", ziskejNazevSouboru(uri));
      odpoved.put(
        "mimeType",
        getContext().getContentResolver().getType(uri)
      );
      odpoved.put("uri", uri.toString());

      call.resolve(odpoved);
    } catch (IOException chyba) {
      call.reject(
        "Dokument se nepodařilo přečíst.",
        chyba
      );
    }
  }

  @PluginMethod
  public void ulozDokument(PluginCall call) {
    String obsah = call.getString("obsah");

    if (obsah == null) {
      call.reject("Chybí obsah dokumentu.");
      return;
    }

    byte[] bajty = obsah.getBytes(StandardCharsets.UTF_8);

    if (bajty.length > MAX_VELIKOST_SOUBORU) {
      call.reject("Dokument je příliš velký. Maximum je 20 MB.");
      return;
    }

    String nazevSouboru = call.getString(
      "nazevSouboru",
      "LubaNote-poznamka.html"
    );

    cekajiciObsah = obsah;
    cekajiciMimeType = call.getString(
      "mimeType",
      "text/html"
    );

    Intent zamer = new Intent(Intent.ACTION_CREATE_DOCUMENT);
    zamer.addCategory(Intent.CATEGORY_OPENABLE);
    zamer.setType(cekajiciMimeType);
    zamer.putExtra(Intent.EXTRA_TITLE, nazevSouboru);

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
      vycistiCekajiciUlozeni();
      return;
    }

    Intent dataZameru = vysledek.getData();

    if (
      vysledek.getResultCode() != Activity.RESULT_OK ||
      dataZameru == null ||
      dataZameru.getData() == null
    ) {
      vycistiCekajiciUlozeni();

      JSObject odpoved = new JSObject();
      odpoved.put("saved", false);
      odpoved.put("canceled", true);
      call.resolve(odpoved);
      return;
    }

    if (cekajiciObsah == null) {
      call.reject("Chybí připravený obsah dokumentu.");
      return;
    }

    Uri uri = dataZameru.getData();

    try (
      OutputStream vystup =
        getContext()
          .getContentResolver()
          .openOutputStream(uri, "wt")
    ) {
      if (vystup == null) {
        call.reject("Android neotevřel cílový soubor.");
        return;
      }

      vystup.write(
        cekajiciObsah.getBytes(StandardCharsets.UTF_8)
      );
      vystup.flush();

      JSObject odpoved = new JSObject();
      odpoved.put("saved", true);
      odpoved.put("canceled", false);
      odpoved.put("uri", uri.toString());
      call.resolve(odpoved);
    } catch (IOException chyba) {
      call.reject(
        "Dokument se nepodařilo uložit.",
        chyba
      );
    } finally {
      vycistiCekajiciUlozeni();
    }
  }

  private String nactiTextovySoubor(Uri uri)
    throws IOException {

    try (
      InputStream vstup =
        getContext()
          .getContentResolver()
          .openInputStream(uri)
    ) {
      if (vstup == null) {
        throw new IOException("Android neotevřel vybraný soubor.");
      }

      ByteArrayOutputStream vystup =
        new ByteArrayOutputStream();

      byte[] buffer = new byte[8192];
      int pocet;
      long celkem = 0;

      while ((pocet = vstup.read(buffer)) != -1) {
        celkem += pocet;

        if (celkem > MAX_VELIKOST_SOUBORU) {
          throw new IOException(
            "Dokument je příliš velký. Maximum je 20 MB."
          );
        }

        vystup.write(buffer, 0, pocet);
      }

      return vystup.toString(StandardCharsets.UTF_8.name());
    }
  }

  private String ziskejNazevSouboru(Uri uri) {
    String vysledek = "dokument";

    try (
      Cursor kurzor =
        getContext()
          .getContentResolver()
          .query(
            uri,
            new String[] { OpenableColumns.DISPLAY_NAME },
            null,
            null,
            null
          )
    ) {
      if (kurzor != null && kurzor.moveToFirst()) {
        int index = kurzor.getColumnIndex(
          OpenableColumns.DISPLAY_NAME
        );

        if (index >= 0) {
          String nazev = kurzor.getString(index);

          if (nazev != null && !nazev.trim().isEmpty()) {
            vysledek = nazev;
          }
        }
      }
    } catch (Exception ignored) {
      // Název je pouze doplňková informace.
    }

    return vysledek;
  }

  private void vycistiCekajiciUlozeni() {
    cekajiciObsah = null;
    cekajiciMimeType = "text/html";
  }
}
