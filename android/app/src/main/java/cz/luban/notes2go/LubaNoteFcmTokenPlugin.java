package cz.luban.notes2go;

import android.app.AlarmManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;
import com.google.firebase.messaging.FirebaseMessaging;

@CapacitorPlugin(name = "LubaNoteFcmToken")
public class LubaNoteFcmTokenPlugin extends Plugin {
  // 692R: The existing 692O scheduler already uses setExactAndAllowWhileIdle
  // when permitted. Surface a missing Android permission instead of silently
  // relying on its inexact fallback. Never modify the reminder data or FCM.
  private boolean exactAlarmPromptShown692R = false;

  private boolean canScheduleExact692R() {
    AlarmManager manager = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
    return manager != null && (Build.VERSION.SDK_INT < 31 || manager.canScheduleExactAlarms());
  }

  /* 695Q: Native does not display Android AlertDialog. A single existing
   * LubaNote choice modal in WebView handles the human-facing request.
   * Preserve the proven reminder restoration after exact permission is granted. */
  private void checkExactAlarmPermission692R() {
    if (Build.VERSION.SDK_INT < 31 || exactAlarmPromptShown692R || !canScheduleExact692R()) return;
    exactAlarmPromptShown692R = true;
    getActivity().runOnUiThread(() -> {
      if (!getActivity().isFinishing() && !getActivity().isDestroyed()) {
        LubaNoteRemoteAlarm692O.restoreOnBoot(getContext());
      }
    });
  }

  /* 695Q: One strictly opt-in native action after tapping the existing
   * LubaNote modal's 'Otevřít nastavení' button. No alarm schedule is changed. */
  @PluginMethod public void openExactAlarmSettings695Q(PluginCall call) {
    if (Build.VERSION.SDK_INT < 31 || canScheduleExact692R()) {
      call.resolve();
      return;
    }
    getActivity().runOnUiThread(() -> {
      if (getActivity().isFinishing() || getActivity().isDestroyed()) {
        call.reject("ACTIVITY_NOT_AVAILABLE");
        return;
      }
      try {
        Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
            Uri.parse("package:" + getContext().getPackageName()));
        getActivity().startActivity(intent);
        call.resolve();
      } catch (Exception firstError) {
        try {
          Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
              Uri.parse("package:" + getContext().getPackageName()));
          getActivity().startActivity(fallback);
          call.resolve();
        } catch (Exception secondError) {
          call.reject("ALARM_SETTINGS_UNAVAILABLE");
        }
      }
    });
  }

  // 692T: Consume only after the original reminders screen actually opened.
  // The same token is retained across a cold start and sync retries.
  @PluginMethod public void getPendingRemoteOpen(PluginCall call) {
    SharedPreferences prefs = getContext().getSharedPreferences(LubaNoteRemoteOpen692T.PREF, Context.MODE_PRIVATE);
    String id = prefs.getString(LubaNoteRemoteOpen692T.NOTE, "");
    String token = prefs.getString(LubaNoteRemoteOpen692T.TOKEN, "");
    JSObject result = new JSObject();
    boolean pending = !id.isEmpty() && !token.isEmpty();
    result.put("pending", pending);
    if (pending) {
      result.put("noteId", id);
      result.put("at", prefs.getLong(LubaNoteRemoteOpen692T.AT, 0L));
      result.put("token", token);
    }
    call.resolve(result);
  }

  @PluginMethod public void ackRemoteOpen(PluginCall call) {
    String token = call.getString("token", "");
    SharedPreferences prefs = getContext().getSharedPreferences(LubaNoteRemoteOpen692T.PREF, Context.MODE_PRIVATE);
    if (!token.isEmpty() && token.equals(prefs.getString(LubaNoteRemoteOpen692T.TOKEN, ""))) {
      prefs.edit().clear().commit();
    }
    call.resolve();
  }

  // Called only after a successful local reminder action, never just by tapping
  // or dismissing the quick-menu dialog.
  @PluginMethod public void resolveRemoteAlarm(PluginCall call) {
    String id = call.getString("noteId", "");
    String when = call.getString("at", "");
    if (id.matches("[a-zA-Z0-9_:-]{1,128}")) {
      try {
        long at = Long.parseLong(when);
        if (at > 0L) LubaNoteRemoteAlarm692O.resolveDelivered(getContext(), id, at);
      } catch (NumberFormatException ignored) { /* invalid timestamp */ }
    }
    call.resolve();
  }

  // 692X: Read-only diagnostic export. No notification or schedule is changed.
  @PluginMethod public void getAlarmDiagnostics692X(PluginCall call) {
    JSObject response=new JSObject();
    response.put("report",LubaNoteRemoteAlarm692O.diagnosticReport692X(getContext()));
    call.resolve(response);
  }

  @PluginMethod public void getExactAlarmStatus(PluginCall call) {
    JSObject response = new JSObject();
    response.put("allowed", canScheduleExact692R());
    response.put("androidApi", Build.VERSION.SDK_INT);
    response.put("exactAlarmPermissionRequired", Build.VERSION.SDK_INT >= 31);
    call.resolve(response);
  }

  @PluginMethod public void getToken(PluginCall call) {
    checkExactAlarmPermission692R();
    FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
      if (!task.isSuccessful()) {call.reject("FCM_TOKEN_UNAVAILABLE");return;}
      String token=task.getResult();
      if(token==null||token.isEmpty()){call.reject("FCM_TOKEN_EMPTY");return;}
      JSObject result=new JSObject();result.put("token",token);call.resolve(result);
    });
  }
  // 692V: Native alarm ownership. The web has no stable numeric IDs for this
  // Android installation, so only APK-native scheduler entries are accepted.
  @PluginMethod public void trackLocalAlarm692V(PluginCall call) {
    String noteId=call.getString("noteId","");
    Integer id=call.getInt("id");
    String when=call.getString("at","");
    try {
      long at=Long.parseLong(when);
      if(id!=null) LubaNoteRemoteAlarm692O.trackLocal692V(getContext(),noteId,id,at);
    } catch(NumberFormatException ignored) {}
    call.resolve();
  }

  @PluginMethod public void forgetLocalAlarm692V(PluginCall call) {
    Integer id=call.getInt("id");
    if(id!=null) LubaNoteRemoteAlarm692O.forgetLocal692V(getContext(),id);
    call.resolve();
  }

  @PluginMethod public void replaceLocalSnapshot692V(PluginCall call) {
    org.json.JSONArray alarms=call.getArray("alarms");
    JSObject result=new JSObject();
    result.put("ok",LubaNoteRemoteAlarm692O.replaceLocalSnapshot692V(getContext(),alarms));
    call.resolve(result);
  }

  // 692Z-A: Native ordinary-note bridge; never exposes note/E2E data in logs.
  @PluginMethod public void scheduleLocalNote692Z(PluginCall call) {
    Integer id=call.getInt("id");
    String noteId=call.getString("noteId","");
    String when=call.getString("at","");
    boolean ok=false;
    try {
      long at=Long.parseLong(when);
      if(id!=null) ok=LubaNoteRemoteAlarm692O.scheduleLocalNote692Z(
        getContext(),noteId,id,at,call.getString("title","LubaNote"),
        call.getString("preview",""));
    } catch(Exception ignored) { /* old proven Capacitor scheduler is fallback */ }
    JSObject result=new JSObject(); result.put("ok",ok); call.resolve(result);
  }
  @PluginMethod public void cancelLocalNote692Z(PluginCall call) {
    Integer id=call.getInt("id");
    JSObject result=new JSObject();
    result.put("cancelled",id!=null && LubaNoteRemoteAlarm692O.cancelLocalNote692Z(getContext(),id));
    call.resolve(result);
  }
  @PluginMethod public void getLocalNotePending692Z(PluginCall call) {
    JSObject result=new JSObject();
    result.put("notifications",LubaNoteRemoteAlarm692O.localNotePending692Z(getContext()));
    call.resolve(result);
  }
  @PluginMethod public void getPendingSync(PluginCall call) {
    SharedPreferences prefs=getContext().getSharedPreferences(LubaNoteFcmMessagingService.PREFS,Context.MODE_PRIVATE);
    JSObject response=new JSObject();
    response.put("pending",prefs.getBoolean(LubaNoteFcmMessagingService.PENDING,false));
    response.put("generation",Long.toString(prefs.getLong(LubaNoteFcmMessagingService.GENERATION,0L)));
    try {response.put("noteIds",new org.json.JSONArray(prefs.getString(LubaNoteFcmMessagingService.NOTE_IDS,"[]")));}
    catch(Exception ignored) {response.put("noteIds",new org.json.JSONArray());}
    call.resolve(response);
  }
  @PluginMethod public void ackPendingSync(PluginCall call) {
    String expected=call.getString("generation","");
    SharedPreferences prefs=getContext().getSharedPreferences(LubaNoteFcmMessagingService.PREFS,Context.MODE_PRIVATE);
    String current=Long.toString(prefs.getLong(LubaNoteFcmMessagingService.GENERATION,0L));
    if(current.equals(expected)) {
      prefs.edit().putBoolean(LubaNoteFcmMessagingService.PENDING,false)
          .remove(LubaNoteFcmMessagingService.NOTE_IDS).commit();
      LubaNoteRemoteAlarm692O.clearScheduledAfterSync(getContext());
      LubaNoteFcmMessagingService.clearPendingSyncNotification(getContext());
    }
    call.resolve();
  }
}
