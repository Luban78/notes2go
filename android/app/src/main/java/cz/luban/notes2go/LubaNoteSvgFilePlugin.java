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
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/** 694W: SVG Studio file import/export using Android Storage Access Framework. */
@CapacitorPlugin(name = "LubaNoteSvgFile")
public class LubaNoteSvgFilePlugin extends Plugin {
  private static final int MAX_BYTES = 1024 * 1024;

  @PluginMethod
  public void ulozSvg(PluginCall call) {
    String svg = call.getString("svg", "");
    String name = call.getString("nazevSouboru", "lubanote-ikona.svg");
    if (svg == null || svg.isEmpty() || svg.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES ||
        name == null || !name.matches("[a-zA-Z0-9_.-]{1,90}\\.svg")) {
      call.reject("Neplatný SVG soubor nebo název."); return;
    }
    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
    intent.addCategory(Intent.CATEGORY_OPENABLE);
    intent.setType("image/svg+xml");
    intent.putExtra(Intent.EXTRA_TITLE, name);
    startActivityForResult(call, intent, "dokoncitUlozeni");
  }

  @ActivityCallback
  private void dokoncitUlozeni(PluginCall call, ActivityResult result) {
    if (call == null) return;
    Uri uri = result.getData() == null ? null : result.getData().getData();
    if (result.getResultCode() != Activity.RESULT_OK || uri == null) { canceled(call); return; }
    try {
      byte[] bytes = call.getString("svg", "").getBytes(StandardCharsets.UTF_8);
      if (bytes.length == 0 || bytes.length > MAX_BYTES) throw new IllegalArgumentException("SVG je příliš velké.");
      try (OutputStream out = getContext().getContentResolver().openOutputStream(uri, "wt")) {
        if (out == null) throw new IllegalStateException("Soubor nelze otevřít.");
        out.write(bytes); out.flush();
      }
      JSObject response = new JSObject(); response.put("saved", true); call.resolve(response);
    } catch (Exception e) { call.reject("Uložení SVG selhalo.", e); }
  }

  @PluginMethod
  public void otevriSvg(PluginCall call) {
    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
    intent.addCategory(Intent.CATEGORY_OPENABLE);
    intent.setType("image/svg+xml");
    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
    startActivityForResult(call, intent, "dokoncitOtevreni");
  }

  @ActivityCallback
  private void dokoncitOtevreni(PluginCall call, ActivityResult result) {
    if (call == null) return;
    Uri uri = result.getData() == null ? null : result.getData().getData();
    if (result.getResultCode() != Activity.RESULT_OK || uri == null) { canceled(call); return; }
    try (InputStream in = getContext().getContentResolver().openInputStream(uri);
         ByteArrayOutputStream out = new ByteArrayOutputStream()) {
      if (in == null) throw new IllegalStateException("Soubor nelze otevřít.");
      byte[] buffer = new byte[8192]; int n;
      while ((n = in.read(buffer)) != -1) {
        if (out.size() + n > MAX_BYTES) throw new IllegalArgumentException("SVG přesahuje 1 MB.");
        out.write(buffer, 0, n);
      }
      JSObject response = new JSObject();
      response.put("canceled", false);
      response.put("svg", new String(out.toByteArray(), StandardCharsets.UTF_8));
      call.resolve(response);
    } catch (Exception e) { call.reject("Načtení SVG selhalo.", e); }
  }

  private void canceled(PluginCall call) {
    JSObject response = new JSObject(); response.put("canceled", true); call.resolve(response);
  }
}
