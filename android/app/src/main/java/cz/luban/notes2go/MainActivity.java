package cz.luban.notes2go;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.ActionMode;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.content.Context;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

  private static final long FULLSCREEN_OBNOVA_ZPOZDENI_MS = 180L;

  /*
   * PATCH 468 – vychozi zdroj je LubaKeyboard. JavaScript tento stav
   * synchronizuje pres LubaNoteKeyboardStatePlugin i pri persistovane
   * volbe systemove klavesnice. Native vrstva tak vi o rezimu jeste pred
   * lifecycle navratem WebView a umi systemove IME potlacit pred prvnim
   * vykreslenym framem.
   */
  private volatile boolean lubaKlavesniceAktivni = true;

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


  public void nastavSystemovouKlavesniciPovolenou(boolean systemova) {
    lubaKlavesniceAktivni = !systemova;

    runOnUiThread(() -> {
      int aktualni = getWindow().getAttributes().softInputMode;
      int stav = systemova
        ? WindowManager.LayoutParams.SOFT_INPUT_STATE_UNSPECIFIED
        : WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN;
      int novy =
        (aktualni & ~WindowManager.LayoutParams.SOFT_INPUT_MASK_STATE)
          | stav;

      getWindow().setSoftInputMode(novy);

      if (!systemova) {
        schovejSystemovouKlavesnici();
      }
    });
  }


  private void schovejSystemovouKlavesnici() {
    View cil =
      getBridge() != null && getBridge().getWebView() != null
        ? getBridge().getWebView()
        : getWindow().getDecorView();

    try {
      InputMethodManager imm =
        (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);

      if (imm != null && cil.getWindowToken() != null) {
        imm.hideSoftInputFromWindow(cil.getWindowToken(), 0);
      }
    } catch (Exception ignored) {
      // Lifecycle ochrana nesmi nikdy shodit Activity.
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      WindowInsetsController controller = getWindow().getInsetsController();
      if (controller != null) {
        controller.hide(WindowInsets.Type.ime());
      }
    }
  }


  @Override
  public void onPause() {
    /*
     * Klicovy okamzik: systemovou IME zavreme jeste dokud ma Activity
     * vlastni window token. Pri pozdejsim navratu pak Android nema starou
     * Gboard session, kterou by na pul sekundy animoval dolu.
     */
    if (lubaKlavesniceAktivni) {
      schovejSystemovouKlavesnici();
    }

    super.onPause();
  }


  @Override
  public void onStop() {
    if (lubaKlavesniceAktivni) {
      schovejSystemovouKlavesnici();
    }

    super.onStop();
  }


  @Override
  public void onResume() {
    super.onResume();

    if (lubaKlavesniceAktivni) {
      nastavSystemovouKlavesniciPovolenou(false);
      schovejSystemovouKlavesnici();
    }

    obnovFullscreen();
  }


  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);

    if (hasFocus) {
      if (lubaKlavesniceAktivni) {
        schovejSystemovouKlavesnici();
      }
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
