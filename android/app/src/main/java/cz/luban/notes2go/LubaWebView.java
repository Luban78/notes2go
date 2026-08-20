package cz.luban.notes2go;

import android.content.Context;
import android.graphics.Rect;
import android.util.AttributeSet;
import android.view.ActionMode;
import android.view.Menu;
import android.view.MenuItem;
import android.view.View;

import com.getcapacitor.CapacitorWebView;

/**
 * WebView pro LubaNote.
 *
 * Zachová nativní označení textu a úchyty, ale vyčistí systémovou
 * plovoucí nabídku Androidu (Vyjmout / Kopírovat / Vložit / Sdílet...).
 * Vlastní editační nabídku pak vykresluje webová část LubaNote.
 */
public class LubaWebView extends CapacitorWebView {

  public LubaWebView(Context context, AttributeSet attrs) {
    super(context, attrs);
  }

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
        Rect outRect
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
  public ActionMode startActionMode(ActionMode.Callback callback) {
    return super.startActionMode(
      obalCallbackBezSystemoveNabidky(callback)
    );
  }

  @Override
  public ActionMode startActionMode(
    ActionMode.Callback callback,
    int type
  ) {
    return super.startActionMode(
      obalCallbackBezSystemoveNabidky(callback),
      type
    );
  }

  @Override
  public ActionMode startActionModeForChild(
    View originalView,
    ActionMode.Callback callback
  ) {
    return super.startActionModeForChild(
      originalView,
      obalCallbackBezSystemoveNabidky(callback)
    );
  }

  @Override
  public ActionMode startActionModeForChild(
    View originalView,
    ActionMode.Callback callback,
    int type
  ) {
    return super.startActionModeForChild(
      originalView,
      obalCallbackBezSystemoveNabidky(callback),
      type
    );
  }
}
