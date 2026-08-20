package cz.luban.notes2go;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.ActionMode;
import android.view.Menu;
import android.view.MenuItem;
import android.view.View;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    getWindow().getDecorView().setSystemUiVisibility(
      View.SYSTEM_UI_FLAG_FULLSCREEN
        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
    );

    getWindow().setNavigationBarColor(Color.TRANSPARENT);

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      getWindow().setNavigationBarContrastEnforced(false);
    }
  }

  /*
   * LubaNote používá vlastní editační toolbar.
   * Android WebView při označení textu standardně zobrazí plovoucí nabídku
   * Vyjmout / Kopírovat / Vložit / Sdílet..., která překrývá náš editor.
   *
   * Callback WebView zachováme, takže samotný výběr textu a jeho úchyty
   * dál fungují. Pouze vyčistíme systémové položky ActionMode menu.
   */
  private ActionMode.Callback obalCallbackBezSystemoveNabidky(
    ActionMode.Callback puvodniCallback
  ) {
    return new ActionMode.Callback2() {
      @Override
      public boolean onCreateActionMode(ActionMode mode, Menu menu) {
        boolean vytvoreno = puvodniCallback.onCreateActionMode(mode, menu);
        menu.clear();
        return vytvoreno;
      }

      @Override
      public boolean onPrepareActionMode(ActionMode mode, Menu menu) {
        boolean pripraveno = puvodniCallback.onPrepareActionMode(mode, menu);
        menu.clear();
        return pripraveno;
      }

      @Override
      public boolean onActionItemClicked(ActionMode mode, MenuItem item) {
        return puvodniCallback.onActionItemClicked(mode, item);
      }

      @Override
      public void onDestroyActionMode(ActionMode mode) {
        puvodniCallback.onDestroyActionMode(mode);
      }

      @Override
      public void onGetContentRect(
        ActionMode mode,
        View view,
        android.graphics.Rect outRect
      ) {
        if (puvodniCallback instanceof ActionMode.Callback2) {
          ((ActionMode.Callback2) puvodniCallback)
            .onGetContentRect(mode, view, outRect);
        } else {
          super.onGetContentRect(mode, view, outRect);
        }
      }
    };
  }

  @Override
  public ActionMode onWindowStartingActionMode(ActionMode.Callback callback) {
    return super.onWindowStartingActionMode(
      obalCallbackBezSystemoveNabidky(callback)
    );
  }

  @Override
  public ActionMode onWindowStartingActionMode(
    ActionMode.Callback callback,
    int type
  ) {
    return super.onWindowStartingActionMode(
      obalCallbackBezSystemoveNabidky(callback),
      type
    );
  }
}
