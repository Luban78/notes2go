package cz.luban.notes2go;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.media.AudioAttributes;
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
  // 699W: before the web starts scheduling, release obsolete 32x remote
  // AlarmManager registrations while keeping their future dates in prefs.
  @Override public void load() {
    super.load();
    // Potentially hundreds of legacy PIs: NEVER block the WebView/main thread.
    final Context app=getContext().getApplicationContext();
    Thread cleanup=new Thread(() -> {
      try {LubaNoteRemoteAlarm692O.compactLegacyRemote699W(app);}
      catch(RuntimeException ignored) { /* never block APK startup */ }
    },"LubaNote-699W-alarm-compact");
    cleanup.setDaemon(true);
    cleanup.start();
  }

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

  /* 697A: Read-only device identity for the Debug Hub battery-settings test.
   * AOSP cannot reliably read Xiaomi's proprietary "No restrictions" choice. */
  @PluginMethod public void getBatterySettingsInfo697A(PluginCall call) {
    JSObject result = new JSObject();
    result.put("manufacturer", Build.MANUFACTURER);
    result.put("brand", Build.BRAND);
    result.put("model", Build.MODEL);
    result.put("androidApi", Build.VERSION.SDK_INT);
    call.resolve(result);
  }

  /* 697A: User-initiated settings navigation ONLY. No new permission, alarm
   * scheduling, background service or battery exemption request is added.
   * Xiaomi's OEM Activity is undocumented and may be unavailable on HyperOS;
   * fail over to a public Android per-app screen, then app details. */
  @PluginMethod public void openBatterySettings697A(PluginCall call) {
    getActivity().runOnUiThread(() -> {
      if (getActivity().isFinishing() || getActivity().isDestroyed()) {
        call.reject("ACTIVITY_NOT_AVAILABLE");
        return;
      }
      String pkg = getContext().getPackageName();
      String maker = (String.valueOf(Build.MANUFACTURER) + " " +
          String.valueOf(Build.BRAND)).toLowerCase(java.util.Locale.ROOT);
      boolean xiaomi = maker.contains("xiaomi") || maker.contains("redmi") ||
          maker.contains("poco") || maker.contains("blackshark");
      String route = "";

      if (xiaomi) {
        try {
          Intent target = new Intent();
          target.setClassName("com.miui.powerkeeper",
              "com.miui.powerkeeper.ui.HiddenAppsConfigActivity");
          target.putExtra("package_name", pkg);
          target.putExtra("package_label", String.valueOf(
              getContext().getApplicationInfo().loadLabel(getContext().getPackageManager())));
          getActivity().startActivity(target);
          route = "xiaomi-powerkeeper";
        } catch (Exception ignored) { /* OEM screen not available or not exported */ }
      }

      if (route.isEmpty()) {
        try {
          Intent target = new Intent("android.settings.VIEW_ADVANCED_POWER_USAGE_DETAIL",
              Uri.parse("package:" + pkg));
          getActivity().startActivity(target);
          route = "android-app-battery";
        } catch (Exception ignored) { /* not all Android devices expose this screen */ }
      }

      if (route.isEmpty()) {
        try {
          Intent target = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
              Uri.parse("package:" + pkg));
          getActivity().startActivity(target);
          route = "app-details-fallback";
        } catch (Exception ignored) { /* no supported settings page */ }
      }

      if (route.isEmpty()) {
        call.reject("BATTERY_SETTINGS_UNAVAILABLE");
        return;
      }
      JSObject result = new JSObject();
      result.put("route", route);
      result.put("manufacturer", Build.MANUFACTURER);
      result.put("brand", Build.BRAND);
      result.put("model", Build.MODEL);
      result.put("androidApi", Build.VERSION.SDK_INT);
      call.resolve(result);
    });
  }

  /* 699D-L: Read-only Android permissions health. The battery allowlist is
   * NOT evidence that a manufacturer-specific background mode is unrestricted. */
  @PluginMethod public void getReminderHealth699DL(PluginCall call) {
    JSObject result = new JSObject();
    android.app.NotificationManager notifications =
        (android.app.NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
    android.os.PowerManager power =
        (android.os.PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
    boolean notificationAllowed = notifications != null &&
        (Build.VERSION.SDK_INT < 24 || notifications.areNotificationsEnabled());
    if (notificationAllowed && Build.VERSION.SDK_INT >= 26 && notifications != null) {
      android.app.NotificationChannel channel = notifications.getNotificationChannel("reminders");
      if (channel != null && channel.getImportance() == android.app.NotificationManager.IMPORTANCE_NONE) {
        notificationAllowed = false;
      }
    }
    boolean batteryExempt = Build.VERSION.SDK_INT < 23 ||
        (power != null && power.isIgnoringBatteryOptimizations(getContext().getPackageName()));
    result.put("notificationsAllowed", notificationAllowed);
    result.put("exactAllowed", canScheduleExact692R());
    result.put("batteryExempt", batteryExempt);
    result.put("powerSave", power != null && power.isPowerSaveMode());
    result.put("manufacturer", Build.MANUFACTURER);
    result.put("brand", Build.BRAND);
    result.put("model", Build.MODEL);
    result.put("androidApi", Build.VERSION.SDK_INT);
    call.resolve(result);
  }

  /* 699D-L: Open ONLY the corresponding Android permission destination.
   * Never fall back to generic app info, which falsely looks like a fix.
   * Direct Doze exemption request is user-initiated and Android-controlled. */
  @PluginMethod public void openReminderPermission699DL(PluginCall call) {
    final String kind = call.getString("kind", "");
    final String pkg = getContext().getPackageName();
    getActivity().runOnUiThread(() -> {
      if (getActivity().isFinishing() || getActivity().isDestroyed()) {
        call.reject("ACTIVITY_NOT_AVAILABLE"); return;
      }
      final Intent target;
      if ("exact".equals(kind) && Build.VERSION.SDK_INT >= 31) {
        target = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + pkg));
      } else if ("notifications".equals(kind) && Build.VERSION.SDK_INT >= 26) {
        target = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
        target.putExtra(Settings.EXTRA_APP_PACKAGE, pkg);
      } else if ("battery".equals(kind) && Build.VERSION.SDK_INT >= 23) {
        target = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
            Uri.parse("package:" + pkg));
      } else {
        call.reject("SPECIFIC_SETTINGS_NOT_AVAILABLE"); return;
      }
      try {
        getActivity().startActivity(target);
        JSObject result = new JSObject(); result.put("opened", true);
        call.resolve(result);
      } catch (Exception error) {
        call.reject("SPECIFIC_SETTINGS_NOT_AVAILABLE");
      }
    });
  }

  // 692T: Consume only after the original reminders screen actually opened.
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

  // 699D-AQ: A stale tap must still be the current pending token. A saved
  // action may use the exact occurrence without a token (already ACKed).
  @PluginMethod public void resolveRemoteOccurrence699DAQ(PluginCall call) {
    String id=call.getString("noteId", "");
    String token=call.getString("token", "");
    boolean resolved=false;
    try {
      long at=Long.parseLong(call.getString("at", ""));
      if(at>0L && id.matches("[a-zA-Z0-9_:-]{1,128}")) {
        SharedPreferences prefs=getContext().getSharedPreferences(LubaNoteRemoteOpen692T.PREF,Context.MODE_PRIVATE);
        boolean valid=token.isEmpty() || (token.equals(prefs.getString(LubaNoteRemoteOpen692T.TOKEN,"")) &&
            id.equals(prefs.getString(LubaNoteRemoteOpen692T.NOTE,"")) &&
            at==prefs.getLong(LubaNoteRemoteOpen692T.AT,0L));
        if(valid) resolved=LubaNoteRemoteAlarm692O.resolveRemoteOccurrence699DAQ(getContext(),id,at);
      }
    } catch(Exception ignored) {}
    JSObject result=new JSObject();
    result.put("resolved",resolved);
    call.resolve(result);
  }

  @PluginMethod public void reportRemoteTap699DAQ(PluginCall call) {
    String id=call.getString("noteId", "");
    String outcome=call.getString("outcome", "");
    try {
      long at=Long.parseLong(call.getString("at", ""));
      if(at>0L && id.matches("[a-zA-Z0-9_:-]{1,128}") &&
          outcome.matches("opened|already_resolved|stale_removed|cleanup_deferred|ui_deferred|data_unavailable|recurrence_unknown")) {
        LubaNoteRemoteAlarm692O.diag692X(getContext(),"REMOTE_TAP_RESULT_699DAQ",id,at,outcome);
      }
    } catch(Exception ignored) {}
    call.resolve();
  }

  // 692X: Read-only diagnostic export. No notification or schedule is changed.
  /* 699D-AV: Opt-in system listener, never changes alarm or notification settings. */
  @PluginMethod public void getNotificationListenerReport699DAV(PluginCall call) {
    JSObject response=new JSObject();
    response.put("report",LubaNoteNotificationListener699DAV.report(getContext()));
    call.resolve(response);
  }

  @PluginMethod public void openNotificationListenerSettings699DAV(PluginCall call) {
    try {
      Intent intent=new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
      getActivity().startActivity(intent);
      call.resolve();
    } catch(Exception error) { call.reject("NOTIFICATION_LISTENER_SETTINGS_UNAVAILABLE"); }
  }

  // 699D-AW: Read-only history; no scheduling, notification or account changes.
  @PluginMethod public void getAlarmHistory699DAW(PluginCall call) {
    JSObject result=new JSObject();
    result.put("alarms",LubaNoteRemoteAlarm692O.diagnosticReport692X(getContext()));
    result.put("listener",LubaNoteNotificationListener699DAV.report(getContext()));
    call.resolve(result);
  }

  @PluginMethod public void getAlarmDiagnostics692X(PluginCall call) {
    JSObject response=new JSObject();
    response.put("report",LubaNoteRemoteAlarm692O.diagnosticReport692X(getContext()));
    call.resolve(response);
  }

  /* 699D-AT: Only read Android's EXISTING notification channel. Never create,
   * delete, reset or update a channel; never schedule/cancel an alarm.
   * Do not export sound URI, device identifiers or personal notification text. */
  @PluginMethod public void getNotificationChannelDiagnostics699DAT(PluginCall call) {
    StringBuilder report = new StringBuilder("LUBANOTE ANDROID NOTIFICATION CHANNEL / 699D-AT\n");
    report.append("androidApi=").append(Build.VERSION.SDK_INT).append('\n');
    report.append("channelId=reminders\n");
    try {
      NotificationManager manager = (NotificationManager)
          getContext().getSystemService(Context.NOTIFICATION_SERVICE);
      if (manager == null) {
        report.append("notificationManager=unavailable\n");
      } else {
        if (Build.VERSION.SDK_INT >= 24) {
          report.append("appNotificationsEnabled=").append(manager.areNotificationsEnabled()).append('\n');
        } else {
          report.append("appNotificationsEnabled=unavailable_pre24\n");
        }
        if (Build.VERSION.SDK_INT < 26) {
          report.append("channel=unsupported_pre26\n");
        } else {
          NotificationChannel channel = manager.getNotificationChannel("reminders");
          if (channel == null) {
            report.append("channel=not_found\n");
          } else {
            report.append("channel=found\n");
            int importance = channel.getImportance();
            String importanceLabel = importance == NotificationManager.IMPORTANCE_NONE ? "NONE" :
                importance == NotificationManager.IMPORTANCE_MIN ? "MIN" :
                importance == NotificationManager.IMPORTANCE_LOW ? "LOW" :
                importance == NotificationManager.IMPORTANCE_DEFAULT ? "DEFAULT" :
                importance == NotificationManager.IMPORTANCE_HIGH ? "HIGH" :
                importance == NotificationManager.IMPORTANCE_MAX ? "MAX" : "UNKNOWN";
            report.append("importance=").append(importance).append(" (").append(importanceLabel).append(")\n");
            Uri sound = channel.getSound();
            String soundState = sound == null ? "none_silent" :
                Settings.System.DEFAULT_NOTIFICATION_URI.equals(sound) ? "system_default_notification" :
                "other_uri_redacted";
            report.append("sound=").append(soundState).append('\n');
            AudioAttributes audio = channel.getAudioAttributes();
            if (audio == null) {
              report.append("audioUsage=unavailable\naudioContentType=unavailable\n");
            } else {
              int usage = audio.getUsage();
              String usageLabel = usage == AudioAttributes.USAGE_ALARM ? "ALARM" :
                  usage == AudioAttributes.USAGE_NOTIFICATION ? "NOTIFICATION" :
                  usage == AudioAttributes.USAGE_NOTIFICATION_EVENT ? "NOTIFICATION_EVENT" :
                  usage == AudioAttributes.USAGE_NOTIFICATION_RINGTONE ? "RINGTONE" : "OTHER";
              report.append("audioUsage=").append(usage).append(" (").append(usageLabel).append(")\n");
              report.append("audioContentType=").append(audio.getContentType()).append('\n');
            }
            boolean vibration = channel.shouldVibrate();
            report.append("vibrationEnabled=").append(vibration).append('\n');
            long[] pattern = channel.getVibrationPattern();
            report.append("vibrationPattern=").append(pattern == null ? "default_or_unset" : "defined_redacted")
                .append('\n');
            int visibility = channel.getLockscreenVisibility();
            String visibilityLabel = visibility == 1 ? "PUBLIC" :
                visibility == 0 ? "PRIVATE" : visibility == -1 ? "SECRET" : "OTHER_OR_UNSET";
            report.append("lockscreenVisibility=").append(visibility).append(" (")
                .append(visibilityLabel).append(")\n");
            report.append("bypassDnd=").append(channel.canBypassDnd()).append('\n');
            report.append("showBadge=").append(channel.canShowBadge()).append('\n');
            report.append("lightsEnabled=").append(channel.shouldShowLights()).append('\n');
            // Source requests are informative; user/OEM settings can override them.
            report.append("compareJavaImportance4=")
                .append(importance == NotificationManager.IMPORTANCE_HIGH ? "same" : "different")
                .append('\n');
            report.append("compareAppEffectiveHigh=")
                .append(importance >= NotificationManager.IMPORTANCE_HIGH ? "at_least_high" : "below_high")
                .append('\n');
            report.append("compareJsVibrationTrue=")
                .append(vibration ? "same" : "different").append('\n');
            report.append("compareJsVisibility1=")
                .append(visibility == 1 ? "same" : "different").append('\n');
          }
        }
      }
    } catch (Exception error) {
      // Read errors should not interrupt the existing diagnostics/clipboard.
      report.append("readError=").append(error.getClass().getSimpleName()).append('\n');
    }
    report.append("sourceRequests=Java:importance4,JS:importance5(OS_caps_apps_at4),vibrationTrue,visibility1\n");
    report.append("note=Differences_do_not_prove_late_notification_presentation\n");
    JSObject response = new JSObject();
    response.put("report", report.toString().trim());
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
  // 699AC: Read-only technical failure timestamp; never sends note content.
  @PluginMethod public void getAlarmLimitFailure699AC(PluginCall call) {
    JSObject result = new JSObject();
    result.put("lastFailureMs", Long.toString(
      LubaNoteRemoteAlarm692O.lastAlarmLimitFailure699AC(getContext())));
    call.resolve(result);
  }

  // 699W: store one recurring note schedule natively for offline/closed APK.
  @PluginMethod public void scheduleLocalRecurring699W(PluginCall call) {
    JSObject result=new JSObject();
    boolean ok=false;
    try {
      Integer id=call.getInt("id");
      String noteId=call.getString("noteId","");
      org.json.JSONObject repeat=call.getObject("repeat");
      if(id!=null && repeat!=null) {
        long at=Long.parseLong(call.getString("at",""));
        long base=Long.parseLong(call.getString("baseAt",""));
        ok=LubaNoteRemoteAlarm692O.scheduleLocalRecurring699W(getContext(),
          noteId,id,at,base,repeat,call.getString("title","LubaNote"),
          call.getString("preview",""),call.getString("proof",""));
      }
    } catch(Exception ignored) { /* never crash the Capacitor bridge */ }
    result.put("ok",ok);
    call.resolve(result);
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
