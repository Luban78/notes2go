package cz.luban.notes2go;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.inputmethod.InputMethodManager;

import java.util.concurrent.atomic.AtomicInteger;

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

  /*
   * FIX 489 – pouze procesní stav. Nesmí být persistentní, aby po pádu /
   * restartu nezůstal omylem aktivní guard mimo otevřený editor.
   */
  private static volatile boolean imeGuardAktivni = false;

  /*
   * FIX 492 – každé show/hide/source přepnutí dostane vlastní generaci.
   * Opožděný retry z předchozího editoru se tak nemůže "probudit" až
   * po zavření poznámky a otevřít Gboard na HOME.
   */
  private static final AtomicInteger imeShowGeneration = new AtomicInteger(0);

  private static SharedPreferences prefs(Context context) {
    return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
  }

  public static boolean pouzivaLubaKeyboard(Context context) {
    String source = prefs(context).getString(PREF_SOURCE, SOURCE_LUBA);
    return !SOURCE_SYSTEM.equals(source);
  }

  public static boolean jeImeGuardAktivni() {
    return imeGuardAktivni;
  }

  @PluginMethod
  public void setSource(PluginCall call) {
    String source = call.getString("source", SOURCE_LUBA);
    String normalized = SOURCE_SYSTEM.equals(source) ? SOURCE_SYSTEM : SOURCE_LUBA;

    /* Každá změna zdroje ruší případný rozběhnutý showIme handshake. */
    imeShowGeneration.incrementAndGet();

    if (SOURCE_SYSTEM.equals(normalized)) {
      imeGuardAktivni = false;
    }

    /* commit() je záměrně synchronní – lifecycle může následovat hned po tapu. */
    prefs(getContext())
      .edit()
      .putString(PREF_SOURCE, normalized)
      .commit();

    JSObject result = new JSObject();
    result.put("source", normalized);
    call.resolve(result);
  }



  /*
   * FIX 489 – MainActivity smí aktivně hlídat pozdní Gboard pouze tehdy,
   * když je opravdu otevřený editor s LubaKeyboard. Ostatní textová pole
   * LubaNote (hledání, login, zprávy...) dál používají systémovou IME.
   */
  @PluginMethod
  public void setGuardActive(PluginCall call) {
    boolean active = Boolean.TRUE.equals(call.getBoolean("active", false));
    imeGuardAktivni = active && pouzivaLubaKeyboard(getContext());

    JSObject result = new JSObject();
    result.put("active", imeGuardAktivni);
    call.resolve(result);
  }



  /*
   * FIX 492 – deterministický WebView ↔ native IME handshake.
   *
   * Android 16 / moderní WebView někdy ještě nemá nový InputConnection
   * připravený ve stejném UI průchodu, ve kterém JS editor dostal focus.
   * Jediné restartInput()+showSoftInput() proto fungovalo náhodně.
   *
   * Po skutečném JS focusu editoru provedeme krátký native handshake:
   *   1) restartInput + show,
   *   2) po layoutu ověříme WindowInsets,
   *   3) pokud IME stále není vidět, zopakujeme pokus maximálně 2×.
   *
   * Každý pokus nese generation token. hideIme()/setSource() token změní,
   * takže opožděný retry nikdy nesmí otevřít Gboard po zavření editoru.
   */
  @PluginMethod
  public void showIme(PluginCall call) {
    if (pouzivaLubaKeyboard(getContext())) {
      call.resolve();
      return;
    }

    Activity activity = getActivity();
    if (activity == null) {
      call.resolve();
      return;
    }

    final int generation = imeShowGeneration.incrementAndGet();

    activity.runOnUiThread(() -> {
      View webView =
        getBridge() != null && getBridge().getWebView() != null
          ? getBridge().getWebView()
          : activity.getWindow().getDecorView();

      /* post() zaručí, že první pokus proběhne až po aktuálním focus/layout
         průchodu WebView, ne uvnitř stejného JS → native callbacku. */
      webView.post(() -> zkusZobrazitIme(activity, webView, generation, 0));
      call.resolve();
    });
  }

  private void zkusZobrazitIme(
    Activity activity,
    View webView,
    int generation,
    int attempt
  ) {
    if (generation != imeShowGeneration.get()) {
      return;
    }

    if (pouzivaLubaKeyboard(getContext())) {
      return;
    }

    try {
      webView.requestFocus();

      InputMethodManager imm =
        (InputMethodManager) activity.getSystemService(Context.INPUT_METHOD_SERVICE);

      if (imm != null) {
        imm.restartInput(webView);
        imm.showSoftInput(webView, InputMethodManager.SHOW_IMPLICIT);
      }

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        WindowInsetsController controller = activity.getWindow().getInsetsController();
        if (controller != null) {
          controller.show(WindowInsets.Type.ime());
        }
      }
    } catch (Exception ignored) {
      /* Další ověřovací pokus může stále uspět. */
    }

    if (attempt >= 2) {
      return;
    }

    long delayMs = attempt == 0 ? 80L : 180L;
    webView.postDelayed(() -> {
      if (generation != imeShowGeneration.get()) {
        return;
      }

      if (pouzivaLubaKeyboard(getContext())) {
        return;
      }

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        WindowInsets insets = activity.getWindow().getDecorView().getRootWindowInsets();
        if (insets != null && insets.isVisible(WindowInsets.Type.ime())) {
          return;
        }
      }

      zkusZobrazitIme(activity, webView, generation, attempt + 1);
    }, delayMs);
  }

  /*
   * FIX 489 – přímá nativní brzda systémové IME.
   *
   * JavaScriptové `navigator.virtualKeyboard.hide()` není v Android WebView
   * spolehlivé. LubaKeyboard proto může požádat nativní vrstvu o skutečné
   * schování IME. Volání je záměrně no-op, pokud uživatel v Nastavení zvolil
   * systémovou klávesnici.
   */
  @PluginMethod
  public void hideIme(PluginCall call) {
    boolean force = Boolean.TRUE.equals(call.getBoolean("force", false));

    /* Zneplatni všechny rozběhnuté showIme retry ještě před další kontrolou. */
    imeShowGeneration.incrementAndGet();

    if (!force && !pouzivaLubaKeyboard(getContext())) {
      call.resolve();
      return;
    }

    Activity activity = getActivity();
    if (activity == null) {
      call.resolve();
      return;
    }

    activity.runOnUiThread(() -> {
      try {
        View decorView = activity.getWindow().getDecorView();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
          WindowInsetsController controller = activity.getWindow().getInsetsController();
          if (controller != null) {
            controller.hide(WindowInsets.Type.ime());
          }
        }

        InputMethodManager imm =
          (InputMethodManager) activity.getSystemService(Context.INPUT_METHOD_SERVICE);

        if (imm != null) {
          View tokenView =
            getBridge() != null && getBridge().getWebView() != null
              ? getBridge().getWebView()
              : decorView;

          imm.hideSoftInputFromWindow(tokenView.getWindowToken(), 0);
        }
      } catch (Exception ignored) {
        /* Guard nesmí nikdy rozbít editor ani systémový režim klávesnice. */
      }

      call.resolve();
    });
  }
}
