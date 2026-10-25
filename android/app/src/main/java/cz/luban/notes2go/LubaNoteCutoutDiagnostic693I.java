package cz.luban.notes2go;

import android.graphics.Rect;
import android.os.Build;
import android.util.DisplayMetrics;
import android.view.DisplayCutout;
import android.view.View;
import android.view.WindowInsets;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** 693I: Diagnostika displeje pouze na vyzadani. Zadna zmena layoutu. */
@CapacitorPlugin(name = "LubaNoteCutoutDiagnostic693I")
public class LubaNoteCutoutDiagnostic693I extends Plugin {
  @PluginMethod
  public void read(PluginCall call) {
    getActivity().runOnUiThread(() -> {
      JSObject data = new JSObject();
      try {
        View decor = getActivity().getWindow().getDecorView();
        float density = getActivity().getResources().getDisplayMetrics().density;
        data.put("sdk", Build.VERSION.SDK_INT);
        data.put("density", density);
        data.put("decorWidthPx", decor.getWidth());
        data.put("decorHeightPx", decor.getHeight());
        data.put("rotation", decor.getDisplay() == null ? -1 : decor.getDisplay().getRotation());
        data.put("available", false);
        data.put("hasCutout", false);
        JSArray rects = new JSArray();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
          WindowInsets insets = decor.getRootWindowInsets();
          if (insets != null) {
            data.put("available", true);
            DisplayCutout cutout = insets.getDisplayCutout();
            if (cutout != null) {
              data.put("hasCutout", true);
              data.put("safeLeftPx", cutout.getSafeInsetLeft());
              data.put("safeTopPx", cutout.getSafeInsetTop());
              data.put("safeRightPx", cutout.getSafeInsetRight());
              data.put("safeBottomPx", cutout.getSafeInsetBottom());
              for (Rect rect : cutout.getBoundingRects()) {
                JSObject r = new JSObject();
                r.put("left", rect.left); r.put("top", rect.top);
                r.put("right", rect.right); r.put("bottom", rect.bottom);
                rects.put(r);
              }
            }
          }
        }
        data.put("rectsPx", rects);
        call.resolve(data);
      } catch (Exception ex) {
        call.reject("Diagnostika vyrezu neni dostupna", ex);
      }
    });
  }
}
