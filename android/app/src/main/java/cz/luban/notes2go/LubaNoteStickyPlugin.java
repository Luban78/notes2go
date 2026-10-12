package cz.luban.notes2go;

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/*
 * 683AU: Registr platnych pripominek pro nativni ochranu pred odtazenim.
 * Registrovana ID nejsou zaznamem obsahu ani kopii databaze.
 * Zruseni v LubaNote predchazi Android cancel(), aby nevznikla "duchova" notifikace.
 */
@CapacitorPlugin(name = "LubaNoteSticky")
public class LubaNoteStickyPlugin extends Plugin {
  private static final String NAZEV = "lubanote_sticky_notifications_683au";

  static boolean jeAktivni(Context context, int id) {
    return context.getSharedPreferences(NAZEV, Context.MODE_PRIVATE)
      .getBoolean("n_" + id, false);
  }

  @PluginMethod
  public void activate(PluginCall call) {
    Integer id = call.getInt("id");
    if (id == null || id <= 0) {
      call.reject("Invalid notification id");
      return;
    }
    getContext().getSharedPreferences(NAZEV, Context.MODE_PRIVATE)
      .edit().putBoolean("n_" + id, true).commit();
    call.resolve();
  }

  @PluginMethod
  public void deactivate(PluginCall call) {
    Integer id = call.getInt("id");
    if (id == null || id <= 0) {
      call.reject("Invalid notification id");
      return;
    }
    getContext().getSharedPreferences(NAZEV, Context.MODE_PRIVATE)
      .edit().remove("n_" + id).commit();
    call.resolve();
  }
}
