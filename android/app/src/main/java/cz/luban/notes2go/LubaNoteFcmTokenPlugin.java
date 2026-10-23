package cz.luban.notes2go;

import android.app.AlarmManager;
import android.app.AlertDialog;
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

  private void checkExactAlarmPermission692R() {
    if (Build.VERSION.SDK_INT < 31 || exactAlarmPromptShown692R) return;
    exactAlarmPromptShown692R = true;
    getActivity().runOnUiThread(() -> {
      if (canScheduleExact692R()) {
        // Reschedule any still-pending remote alarms using the exact API.
        LubaNoteRemoteAlarm692O.restoreOnBoot(getContext());
        return;
      }
      if (getActivity().isFinishing() || getActivity().isDestroyed()) return;
      new AlertDialog.Builder(getActivity())
          .setTitle("Přesné připomínky LubaNote")
          .setMessage("Android zatím nepovoluje přesné alarmy. Připomínky z PC proto mohou chodit o minuty později. Otevřít systémové nastavení a povolit Budíky a připomínky pro LubaNote?")
          .setNegativeButton("Později", (dialog, which) -> {})
          .setPositiveButton("Otevřít nastavení", (dialog, which) -> {
            try {
              Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                  Uri.parse("package:" + getContext().getPackageName()));
              getActivity().startActivity(intent);
            } catch (Exception ignored) {
              try {
                Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:" + getContext().getPackageName()));
                getActivity().startActivity(fallback);
              } catch (Exception ignoredAgain) { /* no crash */ }
            }
          })
          .show();
    });
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
      LubaNoteRemoteAlarm692O.clearAll(getContext());
      LubaNoteFcmMessagingService.clearPendingSyncNotification(getContext());
    }
    call.resolve();
  }
}
