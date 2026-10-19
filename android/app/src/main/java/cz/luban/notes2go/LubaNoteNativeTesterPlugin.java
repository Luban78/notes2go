package cz.luban.notes2go;

import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.MotionEvent;
import android.webkit.WebView;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 690R – native WebView event probe. Only touches the visible ephemeral
 * #lat-native-surface while an authenticated administrator has AutoTester open.
 * No Android input permission, no accessibility service, no access to notes.
 * dispatchTouchEvent is NOT a replacement for physical finger / OS injection.
 */
@CapacitorPlugin(name = "LubaNoteNativeTester")
public class LubaNoteNativeTesterPlugin extends Plugin {
  private final Handler ui = new Handler(Looper.getMainLooper());
  private boolean busy = false;

  @PluginMethod
  public void environment(PluginCall call) {
    JSObject out = new JSObject();
    out.put("engine", "ANDROID_WEBVIEW_MOTION_EVENT_690R");
    out.put("nativeDispatch", getBridge() != null && getBridge().getWebView() != null);
    out.put("physicalFinger", false);
    out.put("osSelectionHandlesVerified", false);
    call.resolve(out);
  }

  @PluginMethod
  public void gesture(PluginCall call) {
    final String type = call.getString("type", "");
    final Double relX = call.getDouble("x");
    final Double relY = call.getDouble("y");
    if (!("tap".equals(type) || "doubletap".equals(type) ||
          "swipe".equals(type) || "longpress".equals(type)) ||
        relX == null || relY == null || !Double.isFinite(relX) || !Double.isFinite(relY) ||
        relX < 0.1 || relX > 0.9 || relY < 0.1 || relY > 0.9) {
      call.reject("invalid_native_test_gesture");
      return;
    }
    ui.post(() -> {
      if (busy) { call.reject("native_test_busy"); return; }
      WebView web = getBridge() == null ? null : getBridge().getWebView();
      if (web == null || !web.isAttachedToWindow() || web.getWidth() < 100) {
        call.reject("native_webview_unavailable"); return;
      }
      busy = true;
      // Geometry and authentication are checked in the actual live WebView;
      // no caller-supplied absolute screen coordinates are accepted.
      final String js = "(function(){var t=document.getElementById('lat-native-surface');" +
        "var tester=document.getElementById('ln-auto-tester');" +
        "var allowed=window.LubaNoteAdminTools?.isAllowed?.()===true;" +
        "var r=t?.getBoundingClientRect();" +
        "var valid=!!(allowed&&tester&&!tester.hidden&&t&&t.isConnected&&" +
        "r&&r.width>=120&&r.height>=100&&r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth&&" +
        "getComputedStyle(t).display!=='none'&&getComputedStyle(t).visibility!=='hidden'&&" +
        "(t===document.elementFromPoint(r.left+r.width*.38,r.top+r.height*.47)||" +
        "t.contains(document.elementFromPoint(r.left+r.width*.38,r.top+r.height*.47))));" +
        "return JSON.stringify({ok:valid,left:r?.left||0,top:r?.top||0," +
        "width:r?.width||0,height:r?.height||0,viewport:innerWidth});})()";
      try {
        web.evaluateJavascript(js, raw -> {
          try {
            JSONObject region = new JSONObject(new JSONArray("[" + raw + "]").getString(0));
            if (!region.optBoolean("ok", false)) {
              busy = false; call.reject("native_stage_not_authorized_or_visible"); return;
            }
            double viewport = region.optDouble("viewport", 0);
            if (viewport <= 0) { busy = false; call.reject("native_viewport_invalid"); return; }
            float scale = (float) (web.getWidth() / viewport);
            float x = (float) ((region.getDouble("left") + region.getDouble("width") * relX) * scale);
            float y = (float) ((region.getDouble("top") + region.getDouble("height") * relY) * scale);
            if (x < 0 || y < 0 || x >= web.getWidth() || y >= web.getHeight()) {
              busy = false; call.reject("native_point_outside_webview"); return;
            }
            runGesture(web, type, x, y, region, scale, call);
          } catch (Exception e) { busy = false; call.reject("native_stage_geometry_invalid"); }
        });
      } catch (Exception e) { busy = false; call.reject("native_evaluate_failed"); }
    });
  }

  private void emit(WebView web, long down, int action, float x, float y) {
    if (!web.isAttachedToWindow()) return;
    MotionEvent event = MotionEvent.obtain(down, SystemClock.uptimeMillis(), action, x, y, 0);
    event.setSource(android.view.InputDevice.SOURCE_TOUCHSCREEN);
    try { web.dispatchTouchEvent(event); }
    finally { event.recycle(); }
  }

  private void finish(WebView web, long down, float x, float y, String type, PluginCall call) {
    emit(web, down, MotionEvent.ACTION_UP, x, y);
    busy = false;
    JSObject result = new JSObject();
    result.put("type", type);
    result.put("delivery", "WEBVIEW_DISPATCH_TOUCH_EVENT");
    result.put("physicalFinger", false);
    call.resolve(result);
  }

  private void runGesture(WebView web, String type, float x, float y,
                          JSONObject rect, float scale, PluginCall call) {
    final long start = SystemClock.uptimeMillis();
    emit(web, start, MotionEvent.ACTION_DOWN, x, y);
    if ("tap".equals(type)) {
      ui.postDelayed(() -> finish(web, start, x, y, type, call), 65L);
    } else if ("longpress".equals(type)) {
      ui.postDelayed(() -> finish(web, start, x, y, type, call), 900L);
    } else if ("doubletap".equals(type)) {
      ui.postDelayed(() -> {
        emit(web, start, MotionEvent.ACTION_UP, x, y);
        ui.postDelayed(() -> {
          long down2 = SystemClock.uptimeMillis();
          emit(web, down2, MotionEvent.ACTION_DOWN, x, y);
          ui.postDelayed(() -> finish(web, down2, x, y, type, call), 60L);
        }, 120L);
      }, 55L);
    } else if ("swipe".equals(type)) {
      final float destX = x + (float) (rect.optDouble("width", 0) * scale * .24);
      final float limitX = (float)((rect.optDouble("left") + rect.optDouble("width") * .94) * scale);
      final float endX = Math.min(destX, limitX);
      for (int i = 1; i <= 9; i++) {
        final int step = i;
        ui.postDelayed(() -> emit(web, start, MotionEvent.ACTION_MOVE,
          x + (endX - x) * step / 9f, y), 30L * step);
      }
      ui.postDelayed(() -> finish(web, start, endX, y, type, call), 315L);
    }
  }
}
