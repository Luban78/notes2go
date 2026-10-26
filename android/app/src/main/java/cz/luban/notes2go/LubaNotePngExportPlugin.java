package cz.luban.notes2go;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.io.IOException;

/** 694Q: Save SVG Studio PNG through Android's native document picker. */
@CapacitorPlugin(name = "LubaNotePngExport")
public class LubaNotePngExportPlugin extends Plugin {
  private static final int MAX_PNG_BYTES = 24 * 1024 * 1024;

  @PluginMethod
  public void ulozPng(PluginCall call) {
    String name = call.getString("nazevSouboru", "lubanote-ikona.png");
    String encoded = call.getString("base64");
    if (encoded == null || encoded.isEmpty() || encoded.length() > MAX_PNG_BYTES * 2L ||
        name == null || !name.matches("[a-zA-Z0-9_.-]{1,90}\\.png")) {
      call.reject("Neplatný PNG nebo název souboru.");
      return;
    }
    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
    intent.addCategory(Intent.CATEGORY_OPENABLE);
    intent.setType("image/png");
    intent.putExtra(Intent.EXTRA_TITLE, name);
    startActivityForResult(call, intent, "dokonciPng");
  }

  @ActivityCallback
  private void dokonciPng(PluginCall call, ActivityResult result) {
    if (call == null) return;
    Intent data = result.getData();
    if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
      JSObject response = new JSObject();
      response.put("saved", false);
      response.put("canceled", true);
      call.resolve(response);
      return;
    }
    try {
      byte[] bytes = Base64.decode(call.getString("base64", ""), Base64.DEFAULT);
      if (bytes.length == 0 || bytes.length > MAX_PNG_BYTES ||
          bytes.length < 8 || bytes[0] != (byte)0x89 || bytes[1] != 0x50 ||
          bytes[2] != 0x4e || bytes[3] != 0x47) {
        call.reject("Výstup není platný PNG.");
        return;
      }
      Uri uri = data.getData();
      try (OutputStream out = getContext().getContentResolver().openOutputStream(uri, "wt")) {
        if (out == null) throw new IOException("Android neotevřel cílový soubor.");
        out.write(bytes);
        out.flush();
      }
      JSObject response = new JSObject();
      response.put("saved", true);
      response.put("canceled", false);
      response.put("bytes", bytes.length);
      response.put("uri", uri.toString());
      call.resolve(response);
    } catch (Exception error) {
      call.reject("Zápis PNG do vybrané složky selhal.", error);
    }
  }
}
