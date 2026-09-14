package cz.luban.notes2go;

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/*
 * FIX 471 – malý most mezi webovou volbou klávesnice a Android lifecycle.
 *
 * Plugin NEOVLÁDÁ editor, fullscreen ani samotnou LubaKeyboard. Jen si do
 * SharedPreferences uloží, zda uživatel výslovně zvolil systémovou IME.
 * MainActivity tak zná správný režim už v onPause/onResume, kdy JavaScript
 * ještě nemusí běžet.
 */
@CapacitorPlugin(name = "LubaNoteKeyboardState")
public class LubaNoteKeyboardStatePlugin extends Plugin {

  private static final String PREFS_NAME = "lubanote_keyboard_state_v1";
  private static final String PREF_SOURCE = "source";
  private static final String SOURCE_SYSTEM = "system";
  private static final String SOURCE_LUBA = "luba";

  private static SharedPreferences prefs(Context context) {
    return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
  }

  public static boolean pouzivaLubaKeyboard(Context context) {
    String source = prefs(context).getString(PREF_SOURCE, SOURCE_LUBA);
    return !SOURCE_SYSTEM.equals(source);
  }

  @PluginMethod
  public void setSource(PluginCall call) {
    String source = call.getString("source", SOURCE_LUBA);
    String normalized = SOURCE_SYSTEM.equals(source) ? SOURCE_SYSTEM : SOURCE_LUBA;

    /* commit() je záměrně synchronní – lifecycle může následovat hned po tapu. */
    prefs(getContext())
      .edit()
      .putString(PREF_SOURCE, normalized)
      .commit();

    JSObject result = new JSObject();
    result.put("source", normalized);
    call.resolve(result);
  }
}
