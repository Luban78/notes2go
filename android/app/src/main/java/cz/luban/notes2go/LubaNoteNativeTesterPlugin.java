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
          "selection-end".equals(target) || "selection-start".equals(target) || "caret-handle".equals(target)) ||
        !("tap".equals(type) || "doubletap".equals(type) || "swipe".equals(type) || "swipe-edge-691CS".equals(type))) {
      call.reject("invalid_owned_editor_request"); return;
    }
    if (("swipe".equals(type) && "word".equals(target)) || ("swipe-edge-691CS".equals(type) && !"selection-end".equals(target))) {
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
            "if(i<0)continue;" +
            "const offs=target==='word-late'?[17,20,23,26]:target==='word-early'?[3,6,9,12]:[2,5,8,11];" +
            "const er=editor.getBoundingClientRect();" +
            "for(const d of offs){if(i+d+1>n.nodeValue.length)continue;" +
              "const rg=document.createRange();rg.setStart(n,i+d);rg.setEnd(n,i+d+1);" +
              "const b=rg.getBoundingClientRect();const px=b.left+b.width/2,py=b.top+b.height/2;" +
              "if(b.width<=0||b.height<=0||px<Math.max(er.left,2)||px>=Math.min(er.right,innerWidth-2)||" +
                "py<Math.max(er.top,2)||py>=Math.min(er.bottom,innerHeight-2))continue;" +
              "if(editor.contains(document.elementFromPoint(px,py))){bounds=b;break;}" +
            "}break;}" +
          "el=editor;" +
        "}else{el=target==='caret-handle'?document.querySelector('.ln-v2-single-caret-handle:not([hidden])'):" +
          "document.querySelector('.ln-v2-selection-handle-custom[data-ln-v2-selection-handle=\"'+" +
          "(target==='selection-start'?'start':'end')+'\"]:not([hidden])');" +
          "bounds=el?.getBoundingClientRect();}" +
        "if(!bounds||bounds.width<=0||bounds.height<=0)return JSON.stringify({ok:false});" +
        "const x=bounds.left+bounds.width/2,y=bounds.top+bounds.height/2;" +
        "const hit=document.elementFromPoint(x,y);" +
        "const targetOk=(target==='word'||target==='word-early'||target==='word-late')?editor.contains(hit):(hit===el||el?.contains(hit));" +
        "const er=editor.getBoundingClientRect();" +
        "const viewportOk=x>=2&&x<innerWidth-2&&y>=2&&y<innerHeight-2;" +
        // 691H: Drag towards editable text, not into blank right margin.
        // If the selection is at the end of a line, dragging to the right can
        // ACK while leaving selection text unchanged. Try shrinking it first.
        "const left=Math.max(0,x-Math.max(er.left+24,8));" +
        "const right=Math.max(0,Math.min(er.right-24,innerWidth-8)-x);" +
        "const selection=target==='selection-end'||target==='selection-start';" +
        "const delta=target==='selection-end'?(left>=48?-Math.min(95,left):Math.min(95,right)):" +
          "target==='selection-start'?(left>=48?-Math.min(95,left):Math.min(95,right)):45;" +
        "const edgeY=Math.min(innerHeight-22,Math.max(y+50,er.bottom-18));" +
        "return JSON.stringify({ok:!!(targetOk&&viewportOk&&(!selection||Math.abs(delta)>=30)),x,y,edgeY,viewport:innerWidth,delta});" +
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
            if ("swipe-edge-691CS".equals(type)) {
              // 691CS: only an OWN LOCAL Testy selection-end handle may trigger this.
              // Real WebView MotionEvents, time-based path; keep finger near editor bottom
              // to exercise production selection-edge autoscroll (not DOM scrollTop).
              float edgeY=(float)(where.optDouble("edgeY",0)*scale);
              if(edgeY<=y+12f || edgeY>=web.getHeight()-3f){busy=false;call.reject("owned_edge_geometry_invalid");return;}
              final long down=SystemClock.uptimeMillis();
              emit(web,down,MotionEvent.ACTION_DOWN,x,y);
              for(int i=1;i<=90;i++){
                final int k=i;
                final float yy=y+(edgeY-y)*Math.min(k,28)/28f;
                ui.postDelayed(()->emit(web,down,MotionEvent.ACTION_MOVE,x,yy),k*32L);
              }
              ui.postDelayed(()->finish(web,down,x,edgeY,type,call),2950L);
            } else if ("swipe".equals(type)) {
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


  /** 691C: Native, vertical-only long-press MOVE of a generated Bullet subtree.
   * The caller cannot pick absolute coordinates or any existing user note.
   * Geometry, note ownership and the three exact test labels are verified inside WebView.
   */
  @PluginMethod
  public void gestureOwnedBulletMove(PluginCall call) {
    final String noteId = call.getString("id", "");
    final String root = call.getString("root", "");
    final String child = call.getString("child", "");
    final String target = call.getString("target", "");
    final String rp = "AUTOTEST_MOVE_691C_ROOT_";
    final String cp = "AUTOTEST_MOVE_691C_CHILD_";
    final String tp = "AUTOTEST_MOVE_691C_TARGET_";
    if (noteId == null || noteId.length() < 8 || noteId.length() > 100 ||
        root == null || child == null || target == null ||
        !root.matches("AUTOTEST_MOVE_691C_ROOT_[0-9]+_[0-9]+") ||
        !child.matches("AUTOTEST_MOVE_691C_CHILD_[0-9]+_[0-9]+") ||
        !target.matches("AUTOTEST_MOVE_691C_TARGET_[0-9]+_[0-9]+") ||
        !root.substring(rp.length()).equals(child.substring(cp.length())) ||
        !root.substring(rp.length()).equals(target.substring(tp.length()))) {
      call.reject("invalid_generated_bullet_move_request"); return;
    }
    ui.post(() -> {
      if (busy) { call.reject("native_test_busy"); return; }
      final WebView web = getBridge() == null ? null : getBridge().getWebView();
      if (web == null || !web.isAttachedToWindow() || web.getWidth() < 100) {
        call.reject("native_webview_unavailable"); return;
      }
      busy = true;
      final String js = "(function(){try{" +
        "const id=" + JSONObject.quote(noteId) + ";" +
        "const root=" + JSONObject.quote(root) + ";" +
        "const child=" + JSONObject.quote(child) + ";" +
        "const target=" + JSONObject.quote(target) + ";" +
        "const modal=document.getElementById('taskModal');" +
        "const tester=document.getElementById('ln-auto-tester');" +
        "const note=window.loadTask?.().find(n=>n?.id===id);" +
        "const core=window.LubaNoteEditorV2;const editor=core?.ziskejEditorElement?.();" +
        "const bs=core?.ziskejModel?.()?.bloky||[];" +
        "const text=b=>(b?.obsah||[]).map(x=>String(x?.text||'')).join('');" +
        "const ri=bs.findIndex(b=>text(b)===root),ci=bs.findIndex(b=>text(b)===child),ti=bs.findIndex(b=>text(b)===target);" +
        "const ownership=window.LubaNoteAdminTools?.isAllowed?.()===true&&" +
          "tester&&!tester.hidden&&tester.classList.contains('lat-app-playback')&&" +
          "modal&&!modal.hidden&&modal.dataset.taskId===id&&" +
          "note?.storageScope==='local'&&note.isSecret!==true&&" +
          "note?.tags?.includes('Testy')&&String(note?.title||'').startsWith('[AutoTester 690T]')&&" +
          "window.LubaNoteEditorV2Bridge?.jeAktivni?.()===true&&" +
          "editor?.isConnected&&modal.contains(editor)&&" +
          "ri>=0&&ci===ri+1&&ti>ci&&" +
          "bs[ri]?.typ==='bullet'&&bs[ci]?.typ==='bullet'&&bs[ti]?.typ==='bullet'&&" +
          "bs[ri]?.uroven===0&&bs[ci]?.uroven===1&&bs[ti]?.uroven===0;" +
        "if(!ownership)return JSON.stringify({ok:false,reason:'ownership_or_bullet_model'});" +
        "const row=b=>editor.querySelector('[data-ln-v2-blok=\"'+CSS.escape(b.id)+'\"]');" +
        "const sr=row(bs[ri]),tr=row(bs[ti]);const seg=sr?.querySelector(':scope > .ln-v2-cast');" +
        "const node=seg?.firstChild;if(!sr||!tr||!node||node.nodeType!==3||node.textContent.length<2)return JSON.stringify({ok:false,reason:'dom_rows'});" +
        "const range=document.createRange();range.setStart(node,1);range.setEnd(node,2);" +
        "const r=range.getBoundingClientRect(),t=tr.getBoundingClientRect(),e=editor.getBoundingClientRect();" +
        "const x=r.left+r.width/2,y=r.top+r.height/2,endY=t.top+t.height*.8;" +
        "const hit=document.elementFromPoint(x,y);" +
        "const valid=sr.contains(hit)&&r.width>0&&r.height>0&&" +
          "y>e.top+2&&endY<e.bottom-3&&x>e.left+2&&x<e.right-2&&" +
          "y>3&&endY<innerHeight-4&&x>3&&x<innerWidth-3&&endY-y>60&&" +
          "t.top>r.bottom;" +
        "return JSON.stringify({ok:!!valid,x,y,endY,viewport:innerWidth,reason:valid?'ok':'geometry'});" +
      "}catch(e){return JSON.stringify({ok:false,reason:'exception'});}})()";
      try {
        web.evaluateJavascript(js, raw -> {
          try {
            JSONObject at = new JSONObject(new JSONArray("[" + raw + "]").getString(0));
            if (!at.optBoolean("ok", false)) {
              busy=false; call.reject("bullet_move_target_missing_" + at.optString("reason", "invalid")); return;
            }
            final double viewport = at.optDouble("viewport", 0);
            if (viewport <= 0) { busy=false; call.reject("bullet_move_viewport_invalid"); return; }
            final float scale = (float)(web.getWidth()/viewport);
            final float x = (float)(at.getDouble("x")*scale);
            final float y = (float)(at.getDouble("y")*scale);
            final float endY = (float)(at.getDouble("endY")*scale);
            if (x < 4 || x >= web.getWidth()-4 || y < 4 || endY >= web.getHeight()-4 || endY <= y+40) {
              busy=false; call.reject("bullet_move_outside_webview"); return;
            }
            final long down = SystemClock.uptimeMillis();
            emit(web, down, MotionEvent.ACTION_DOWN, x, y);
            // Core V2 long-press threshold is 420ms. Keep finger still for 720ms.
            ui.postDelayed(() -> {
              for (int i=1;i<=16;i++) {
                final int step=i;
                ui.postDelayed(() -> emit(web,down,MotionEvent.ACTION_MOVE,x,
                  y+(endY-y)*step/16f), step*36L);
              }
              ui.postDelayed(() -> {
                finish(web,down,x,endY,"bullet-subtree-move",call);
              },620L);
            },720L);
          } catch (Exception e) { busy=false;call.reject("bullet_move_geometry_invalid"); }
        });
      } catch (Exception e) { busy=false;call.reject("bullet_move_evaluate_failed"); }
    });
  }

  /** 691N: ONLY generated LOCAL Testy image AUTOTEST_691N in current editor.
   * Gestures target the actual image or its fullscreen viewer (never user media).
   * Native MotionEvent, NOT physical hand or OS instrumentation. */
  @PluginMethod
  public void gestureOwnedImage(PluginCall call) {
    final String id=call.getString("id", "");
    final String target=call.getString("target", "");
    final String type=call.getString("type", "");
    if(id==null||id.length()<8||id.length()>100 ||
       !("image-top".equals(target)||"image-bottom".equals(target)||"preview".equals(target)) ||
       !("doubletap".equals(type)||"tap".equals(type)||"pinch".equals(type)||"pan".equals(type)) ||
       ("preview".equals(target) != ("pinch".equals(type)||"pan".equals(type)))) {
      call.reject("invalid_owned_image_gesture");return;
    }
    ui.post(()->{
      if(busy){call.reject("native_test_busy");return;}
      final WebView web=getBridge()==null?null:getBridge().getWebView();
      if(web==null||!web.isAttachedToWindow()||web.getWidth()<100){call.reject("native_webview_unavailable");return;}
      busy=true;
      final String js="(function(){try{"+
        "const id="+JSONObject.quote(id)+",target="+JSONObject.quote(target)+";"+
        "const tester=document.getElementById('ln-auto-tester');"+
        "const modal=document.getElementById('taskModal'),note=window.loadTask?.().find(n=>n?.id===id);"+
        "const ed=window.LubaNoteEditorV2?.ziskejEditorElement?.();"+
        "const base=window.LubaNoteAdminTools?.isAllowed?.()===true&&tester&&!tester.hidden&&"+
        "tester.classList.contains('lat-app-playback')&&modal&&!modal.hidden&&modal.dataset.taskId===id&&"+
        "note?.storageScope==='local'&&note.isSecret!==true&&note?.tags?.includes('Testy')&&"+
        "String(note.title||'').startsWith('[AutoTester 690T]')&&"+
        "window.LubaNoteEditorV2Bridge?.jeAktivni?.()===true&&ed?.isConnected&&modal.contains(ed)&&"+
        "ed.querySelector('.ln-v2-obrazek img[alt^=\"AUTOTEST_691N\"]');"+
        "if(!base)return JSON.stringify({ok:false,reason:'owner'});"+
        "let el=target==='preview'?document.querySelector('.lubaNoteImagePreviewImg'):"+
        "ed.querySelector('.ln-v2-obrazek img[alt^=\"AUTOTEST_691N\"]');"+
        "const r=el?.getBoundingClientRect();"+
        "if(!r||r.width<110||r.height<80)return JSON.stringify({ok:false,reason:'size'});"+
        "const x=r.left+r.width*(target==='image-top'?0.20:target==='image-bottom'?0.50:0.50);"+
        "const y=r.top+r.height*(target==='image-top'?0.12:target==='image-bottom'?0.85:0.50);"+
        "const hit=document.elementFromPoint(x,y);"+
        "const ok=x>=90&&x<innerWidth-8&&y>=8&&y<innerHeight-8&&"+
        "(hit===el||el.contains(hit))&&"+
        "(target!=='preview'||document.querySelector('.lubaNoteImagePreview[aria-modal=true]'));"+
        "return JSON.stringify({ok:!!ok,x,y,viewport:innerWidth,span:Math.min(r.width,r.height)});"+
      "}catch(e){return JSON.stringify({ok:false,reason:String(e)});}})()";
      try{web.evaluateJavascript(js,raw->{
        try{
          JSONObject at=new JSONObject(new JSONArray("["+raw+"]").getString(0));
          if(!at.optBoolean("ok",false)){busy=false;call.reject("owned_image_target_missing_or_covered: "+at.optString("reason"));return;}
          float scale=(float)(web.getWidth()/at.optDouble("viewport",1));
          float x=(float)(at.getDouble("x")*scale),y=(float)(at.getDouble("y")*scale);
          if(x<5||x>=web.getWidth()-5||y<5||y>=web.getHeight()-5){busy=false;call.reject("image_point_outside_webview");return;}
          if("pinch".equals(type))runImagePinch(web,x,y,scale,call);
          else if("pan".equals(type)){
            final long down=SystemClock.uptimeMillis();final float end=x+Math.min(80f*scale,web.getWidth()-x-7f);
            emit(web,down,MotionEvent.ACTION_DOWN,x,y);
            for(int i=1;i<=8;i++){
              final int step=i;ui.postDelayed(()->emit(web,down,MotionEvent.ACTION_MOVE,x+(end-x)*step/8f,y),step*30L);
            }
            ui.postDelayed(()->finish(web,down,end,y,type,call),285L);
          }else runGesture(web,type,x,y,new JSONObject(),scale,call);
        }catch(Exception e){busy=false;call.reject("owned_image_geometry_invalid");}
      });}catch(Exception e){busy=false;call.reject("owned_image_dispatch_failed");}
    });
  }

  private void emitPinchPair(WebView web,long down,int action,float x1,float x2,float y){
    if(!web.isAttachedToWindow())return;
    MotionEvent.PointerProperties a=new MotionEvent.PointerProperties();
    a.id=0;a.toolType=MotionEvent.TOOL_TYPE_FINGER;
    MotionEvent.PointerProperties b=new MotionEvent.PointerProperties();
    b.id=1;b.toolType=MotionEvent.TOOL_TYPE_FINGER;
    MotionEvent.PointerCoords c=new MotionEvent.PointerCoords();
    c.x=x1;c.y=y;c.pressure=1;c.size=1;
    MotionEvent.PointerCoords d=new MotionEvent.PointerCoords();
    d.x=x2;d.y=y;d.pressure=1;d.size=1;
    MotionEvent e=MotionEvent.obtain(down,SystemClock.uptimeMillis(),action,2,
      new MotionEvent.PointerProperties[]{a,b},new MotionEvent.PointerCoords[]{c,d},
      0,0,1f,1f,0,0,android.view.InputDevice.SOURCE_TOUCHSCREEN,0);
    try{web.dispatchTouchEvent(e);}finally{e.recycle();}
  }

  private void runImagePinch(WebView web,float cx,float cy,float scale,PluginCall call){
    final long down=SystemClock.uptimeMillis();
    final float a=26f*scale,b=65f*scale;
    if(cx-b<5||cx+b>=web.getWidth()-5){busy=false;call.reject("pinch_viewport_too_narrow");return;}
    emit(web,down,MotionEvent.ACTION_DOWN,cx-a,cy);
    ui.postDelayed(()->emitPinchPair(web,down,MotionEvent.ACTION_POINTER_DOWN|(1<<MotionEvent.ACTION_POINTER_INDEX_SHIFT),cx-a,cx+a,cy),45L);
    for(int i=1;i<=10;i++){
      final float d=a+(b-a)*i/10f;
      final int step=i;
      ui.postDelayed(()->emitPinchPair(web,down,MotionEvent.ACTION_MOVE,cx-d,cx+d,cy),45L+step*32L);
    }
    ui.postDelayed(()->{
      emitPinchPair(web,down,MotionEvent.ACTION_POINTER_UP|(1<<MotionEvent.ACTION_POINTER_INDEX_SHIFT),cx-b,cx+b,cy);
      emit(web,down,MotionEvent.ACTION_UP,cx-b,cy);
      busy=false;
      JSObject out=new JSObject();out.put("type","pinch");out.put("delivery","WEBVIEW_DISPATCH_TOUCH_EVENT");
      out.put("physicalFinger",false);call.resolve(out);
    },415L);
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
