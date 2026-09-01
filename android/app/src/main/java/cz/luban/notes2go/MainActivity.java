package cz.luban.notes2go;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.ActionMode;
import android.view.View;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    registerPlugin(
      LubaNoteBackupExportPlugin.class
    );

    registerPlugin(
      LubaNoteSecretBiometricPlugin.class
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


  private void nastavFullscreen() {
    getWindow().getDecorView().setSystemUiVisibility(
      View.SYSTEM_UI_FLAG_FULLSCREEN
        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
    );
  }


  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);

    if (hasFocus) {
      nastavFullscreen();
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
