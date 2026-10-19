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
 * 690X – native WebView input probe, two guarded text tap anchors. Baseline only touches ephemeral
 * #lat-native-surface. gestureOwnedEditor may touch ONLY verified owned Testy
 * note editor/handles during visible AutoTester playback; never arbitrary notes.
 * No Android input permission, no accessibility service.
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


  /** 690U: Reuse MotionEvent only for the REAL Core V2 UI of one owned Testy note.
   * Never accept absolute coordinates from JavaScript or operate on arbitrary notes.
   * The tested text/caret/selection-handle is resolved and hit-tested inside the WebView.
   */
  @PluginMethod
  public void gestureOwnedEditor(PluginCall call) {
    final String noteId = call.getString("id", "");
    final String target = call.getString("target", "");
    final String type = call.getString("type", "");
    if (noteId == null || noteId.length() < 8 || noteId.length() > 100 ||
        !("word".equals(target) || "word-early".equals(target) || "word-late".equals(target) ||
          "selection-end".equals(target) || "caret-handle".equals(target)) ||
        !("tap".equals(type) || "doubletap".equals(type) || "swipe".equals(type))) {
      call.reject("invalid_owned_editor_request"); return;
    }
    if ("swipe".equals(type) && "word".equals(target)) {
      call.reject("word_swipe_not_authorized"); return;
    }
    ui.post(() -> {
      if (busy) { call.reject("native_test_busy"); return; }
      WebView web = getBridge() == null ? null : getBridge().getWebView();
      if (web == null || !web.isAttachedToWindow() || web.getWidth() < 100) {
        call.reject("native_webview_unavailable"); return;
      }
      busy = true;
      final String quotedId = JSONObject.quote(noteId);
      final String quotedTarget = JSONObject.quote(target);
      final String js = "(function(){try{" +
        "const id=" + quotedId + ";const target=" + quotedTarget + ";" +
        "const tester=document.getElementById('ln-auto-tester');" +
        "const modal=document.getElementById('taskModal');" +
        "const note=window.loadTask?.().find(n=>n?.id===id);" +
        "const editor=window.LubaNoteEditorV2?.ziskejEditorElement?.();" +
        "const ok=window.LubaNoteAdminTools?.isAllowed?.()===true&&tester&&!tester.hidden&&" +
        "tester.classList.contains('lat-app-playback')&&modal&&!modal.hidden&&" +
        "modal.dataset.taskId===id&&note&&note.storageScope==='local'&&note.isSecret!==true&&" +
        "note.tags?.includes('Testy')&&String(note.title||'').startsWith('[AutoTester 690T]')&&" +
        "window.LubaNoteEditorV2Bridge?.jeAktivni?.()===true&&" +
        "editor&&editor.isConnected&&modal.contains(editor)&&" +
        "editor.dataset.lnV2OwnCaretOnly==='1';" +
        "if(!ok)return JSON.stringify({ok:false});" +
        "let bounds=null;let el=null;" +
        "if(target==='word'||target==='word-early'||target==='word-late'){" +
          "const w=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT);let n;" +
          "while(n=w.nextNode()){const i=String(n.nodeValue||'').indexOf('Zapis_z_viditelneho_editoru_690T');" +
            "if(i<0)continue;const d=target==='word-late'?17:target==='word-early'?3:2;" +
            "const rg=document.createRange();rg.setStart(n,i+d);rg.setEnd(n,i+d+1);" +
            "bounds=rg.getBoundingClientRect();break;}" +
          "el=editor;" +
        "}else{el=target==='caret-handle'?document.querySelector('.ln-v2-single-caret-handle:not([hidden])'):" +
          "document.querySelector('.ln-v2-selection-handle-custom[data-ln-v2-selection-handle=\"end\"]:not([hidden])');" +
          "bounds=el?.getBoundingClientRect();}" +
        "if(!bounds||bounds.width<=0||bounds.height<=0)return JSON.stringify({ok:false});" +
        "const x=bounds.left+bounds.width/2,y=bounds.top+bounds.height/2;" +
        "const hit=document.elementFromPoint(x,y);" +
        "const targetOk=(target==='word'||target==='word-early'||target==='word-late')?editor.contains(hit):(hit===el||el?.contains(hit));" +
        "const er=editor.getBoundingClientRect();" +
        "const viewportOk=x>=2&&x<innerWidth-2&&y>=2&&y<innerHeight-2;" +
        "const delta=target==='selection-end'?Math.max(-70,Math.min(70,er.right-x-25)):45;" +
        "return JSON.stringify({ok:!!(targetOk&&viewportOk),x,y,viewport:innerWidth,delta});" +
      "}catch(e){return JSON.stringify({ok:false});}})()";
      try {
        web.evaluateJavascript(js, raw -> {
          try {
            JSONObject where = new JSONObject(new JSONArray("[" + raw + "]").getString(0));
            if (!where.optBoolean("ok", false)) {
              busy = false; call.reject("owned_custom_target_missing_or_covered"); return;
            }
            double viewport=where.optDouble("viewport",0);
            if (viewport <= 0) { busy=false;call.reject("owned_editor_viewport_invalid");return; }
            float scale=(float)(web.getWidth()/viewport);
            float x=(float)(where.getDouble("x")*scale);
            float y=(float)(where.getDouble("y")*scale);
            if(x<0||x>=web.getWidth()||y<0||y>=web.getHeight()){
              busy=false;call.reject("owned_editor_point_outside_webview");return;
            }
            if ("swipe".equals(type)) {
              float end=Math.max(5f,Math.min(web.getWidth()-5f,x+(float)where.optDouble("delta",40)*scale));
              final long down=SystemClock.uptimeMillis();
              emit(web,down,MotionEvent.ACTION_DOWN,x,y);
              for (int i=1;i<=10;i++) {
                final int k=i;
                ui.postDelayed(()->emit(web,down,MotionEvent.ACTION_MOVE,x+(end-x)*k/10f,y),k*35L);
              }
              ui.postDelayed(()->finish(web,down,end,y,type,call),390L);
            } else {
              runGesture(web,type,x,y,new JSONObject(),scale,call);
            }
          } catch(Exception e){busy=false;call.reject("owned_editor_geometry_invalid");}
        });
      }catch(Exception e){busy=false;call.reject("owned_editor_dispatch_failed");}
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
