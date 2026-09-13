package cz.luban.notes2go;

import android.content.Context;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.ActionMode;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.inputmethod.InputMethodManager;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

  private static final long FULLSCREEN_OBNOVA_ZPOZDENI_MS = 180L;

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    registerPlugin(
      LubaNoteBackupExportPlugin.class
    );

    registerPlugin(
      LubaNoteSecretBiometricPlugin.class
    );

    registerPlugin(
      LubaNoteDocumentPlugin.class
    );

    registerPlugin(
      LubaNoteKeyboardStatePlugin.class
    );

    super.onCreate(savedInstanceState);

    nastavFullscreen();

    getWindow().setNavigationBarColor(Color.TRANSPARENT);

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      getWindow().setNavigationBarContrastEnforced(false);
    }

    /*
     * Systémové Android Zpět nejdřív nabídneme webové části LubaNote.
     * Když je otevřený editor, JavaScript použije stejnou logiku jako
     * klávesa Esc na PC. Pokud nic v aplikaci Back nezpracuje, zachováme
     * původní Android chování a Activity zavřeme.
     */
    getOnBackPressedDispatcher().addCallback(
      this,
      new OnBackPressedCallback(true) {
        @Override
        public void handleOnBackPressed() {
          zpracujSystemoveZpet();
        }
      }
    );
  }


  /*
   * LubaNote schovává pouze horní systémovou stavovou lištu.
   * Spodní Android navigace zůstává zachovaná a průhledná stejně jako dřív.
   *
   * Android 11+:
   * používáme moderní WindowInsetsController. Režim transient bars dovolí
   * lištu gestem dočasně zobrazit, ale po zavření se znovu sama schová.
   *
   * Android 10 a starší:
   * ponecháváme legacy systémové flagy, ale doplňujeme IMMERSIVE_STICKY,
   * aby stažení horní lišty trvale nezrušilo fullscreen.
   */
  private void nastavFullscreen() {
    View decorView = getWindow().getDecorView();

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      getWindow().setDecorFitsSystemWindows(false);

      WindowInsetsController controller =
        getWindow().getInsetsController();

      if (controller != null) {
        controller.setSystemBarsBehavior(
          WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        );

        controller.hide(
          WindowInsets.Type.statusBars()
        );
      }

      return;
    }

    decorView.setSystemUiVisibility(
      View.SYSTEM_UI_FLAG_FULLSCREEN
        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
    );
  }


  /*
   * Po návratu z notifikační lišty / systémového dialogu Android někdy ještě
   * krátce dokončuje animaci systémových lišt. Kromě okamžitého nastavení proto
   * fullscreen zopakujeme s malým zpožděním. Tím se systémová animace nemůže
   * stát posledním zápisem a nechat stavovou lištu trvale zobrazenou.
   */
  private void obnovFullscreen() {
    nastavFullscreen();

    View decorView = getWindow().getDecorView();
    decorView.removeCallbacks(this::nastavFullscreen);
    decorView.postDelayed(
      this::nastavFullscreen,
      FULLSCREEN_OBNOVA_ZPOZDENI_MS
    );
  }


  /*
   * FIX 471 – LubaKeyboard používá vlastní panel a systémovou IME nechce.
   * Starý WebView 103 si ale při minimalizaci umí zapamatovat InputConnection
   * a při návratu na zlomek sekundy obnovit Gboard ještě PŘED JavaScriptem.
   *
   * Zásah je záměrně nativní a úzký:
   * - pouze když je v LubaNote zvolená LubaKeyboard;
   * - při odchodu Activity zrušíme focus WebView + schováme IME;
   * - při návratu IME preventivně znovu schováme;
   * - při explicitní volbě systémové klávesnice se nedělá NIC.
   *
   * Fullscreen logika níže zůstává beze změny.
   */
  private boolean pouzivaLubaKeyboard() {
    return LubaNoteKeyboardStatePlugin.pouzivaLubaKeyboard(this);
  }

  private void schovejSystemovouImeProLubaKeyboard(boolean zrusitFocusWebView) {
    if (!pouzivaLubaKeyboard()) {
      return;
    }

    View decorView = getWindow().getDecorView();

    if (zrusitFocusWebView && getBridge() != null && getBridge().getWebView() != null) {
      getBridge().getWebView().clearFocus();
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      WindowInsetsController controller = getWindow().getInsetsController();
      if (controller != null) {
        controller.hide(WindowInsets.Type.ime());
      }
    }

    InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
    if (imm != null) {
      imm.hideSoftInputFromWindow(decorView.getWindowToken(), 0);
    }
  }

  @Override
  protected void onPause() {
    /* Zrušení focusu ještě před super.onPause() je důležité: WebView tak
       nemá aktivní editor, který by Android při resume znovu připojil k IME. */
    schovejSystemovouImeProLubaKeyboard(true);
    super.onPause();
  }

  @Override
  protected void onStop() {
    schovejSystemovouImeProLubaKeyboard(true);
    super.onStop();
  }

  @Override
  public void onResume() {
    super.onResume();
    schovejSystemovouImeProLubaKeyboard(false);
    obnovFullscreen();
  }


  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);

    if (hasFocus) {
      schovejSystemovouImeProLubaKeyboard(false);
      obnovFullscreen();
    }
  }


  private void zpracujSystemoveZpet() {
    if (getBridge() == null || getBridge().getWebView() == null) {
      finish();
      return;
    }

    getBridge().getWebView().evaluateJavascript(
      "(function(){try{" +
        "return window.LubaNoteZpracujAndroidZpet" +
        " ? window.LubaNoteZpracujAndroidZpet()" +
        " : false;" +
      "}catch(error){console.error(error);return false;}})();",
      vysledek -> {
        if (!"true".equals(vysledek)) {
          finish();
        }
      }
    );
  }


  @Override
  public void onActionModeStarted(ActionMode mode) {
    super.onActionModeStarted(mode);

    if (mode == null) {
      return;
    }

    /*
     * Zachová označení textu a úchyty,
     * ale odstraní systémovou nabídku Androidu:
     * Vyjmout / Kopírovat / Vložit / Sdílet...
     */
    mode.getMenu().clear();
  }
}
