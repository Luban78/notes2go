package cz.luban.notes2go;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.Manifest;
import android.os.Build;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.HashSet;

/**
 * 692O: E2E-safe remote alarm projection. Saved locally: note ID, alarm times,
 * revisions, and Android numeric IDs only. No note text, secrets or access tokens.
 * An FCM message is dispatched by Google's FCM service after LubaServer verifies
 * the sender's auth and recipient ownership. A background WebView is NOT started.
 */
final class LubaNoteRemoteAlarm692O {
  private static final String PREF = "lubanote_remote_alarm_692O";
  private static final String RECORDS = "records";
  private static final String OWNER = "owner";
  // 692V: Only technical IDs/timestamps from the APK LocalNotifications scheduler.
  private static final String LOCAL_PREF_692V = "lubanote_local_alarm_692V";
  private static final String LOCAL_RECORDS_692V = "alarms";
  private static final String CHANNEL = "reminders";
  private static final long MAX_FUTURE = 366L * 24 * 60 * 60 * 1000;

  private LubaNoteRemoteAlarm692O() {}

  // 692X: read-only delivery forensics, no note text or E2E data. This journal
  // survives process death and is not transmitted anywhere. Limited to 90 rows.
  private static final String DIAG_PREF_692X = "lubanote_alarm_diag_692X";
  private static final String DIAG_ROWS_692X = "rows";
  static synchronized void diag692X(Context ctx, String kind, String id, long at, String detail) {
    try {
      String fingerprint = id == null ? "-" : Integer.toHexString(id.hashCode());
      String entry = System.currentTimeMillis() + " | " + kind +
        " | noteHash=" + fingerprint + " | targetMs=" + at +
        " | lagSec=" + (at > 0 ? (System.currentTimeMillis()-at)/1000L : -1L) +
        " | " + detail;
      SharedPreferences pref=ctx.getSharedPreferences(DIAG_PREF_692X,Context.MODE_PRIVATE);
      JSONArray previous=new JSONArray(pref.getString(DIAG_ROWS_692X,"[]"));
      JSONArray next=new JSONArray();
      for(int i=Math.max(0,previous.length()-89);i<previous.length();i++) next.put(previous.opt(i));
      next.put(entry);
      pref.edit().putString(DIAG_ROWS_692X,next.toString()).commit();
    } catch (Exception ignored) { /* Diagnostics must NEVER interrupt reminders. */ }
  }
  /* 696Z: Separate, bounded, near-term forensic trace.
   * Diagnostic only: NEVER changes an alarm, its PendingIntent or user data.
   * The existing 692X journal stays untouched; far-future recurring alarms
   * cannot push the relevant ARM/CANCEL/FIRE evidence out of this trace.
   * Only technical timestamps, methods, opaque note fingerprints and power
   * states are stored; never note titles, bodies, secrets or account IDs.
   */
  private static final String DIAG_TRACE_696Z = "trace_696Z";
  private static final long TRACE_FUTURE_696Z = 36L * 60L * 60L * 1000L;
  private static final long TRACE_PAST_696Z = 3L * 60L * 60L * 1000L;
  private static void diag696Z(Context ctx, String kind, String id, long at, String detail) {
    try {
      final long now=System.currentTimeMillis();
      if (at>0 && (at<now-TRACE_PAST_696Z || at>now+TRACE_FUTURE_696Z)) return;
      StringBuilder state=new StringBuilder();
      android.os.PowerManager power=(android.os.PowerManager)ctx.getSystemService(Context.POWER_SERVICE);
      if(power!=null) {
        state.append(" interactive=").append(power.isInteractive());
        if(Build.VERSION.SDK_INT>=23) {
          state.append(" idle=").append(power.isDeviceIdleMode());
          state.append(" exempt=").append(power.isIgnoringBatteryOptimizations(ctx.getPackageName()));
        }
        state.append(" saver=").append(power.isPowerSaveMode());
      }
      AlarmManager alarms=(AlarmManager)ctx.getSystemService(Context.ALARM_SERVICE);
      state.append(" exactAllowed=").append(alarms!=null &&
          (Build.VERSION.SDK_INT<31 || alarms.canScheduleExactAlarms()));
      String fingerprint=id==null?"-":Integer.toHexString(id.hashCode());
      String entry=now+" | "+kind+" | noteHash="+fingerprint+
          " | targetMs="+at+" | delayMs="+(at>0?now-at:-1L)+
          " | elapsedMs="+android.os.SystemClock.elapsedRealtime()+
          " | "+detail+state;
      SharedPreferences pref=ctx.getSharedPreferences(DIAG_PREF_692X,Context.MODE_PRIVATE);
      JSONArray previous=new JSONArray(pref.getString(DIAG_TRACE_696Z,"[]"));
      JSONArray next=new JSONArray();
      for(int i=Math.max(0,previous.length()-119);i<previous.length();i++) next.put(previous.opt(i));
      next.put(entry);
      pref.edit().putString(DIAG_TRACE_696Z,next.toString()).commit();
    } catch(Exception ignored) { /* Tracing must NEVER block alarms. */ }
  }

  static synchronized String diagnosticReport692X(Context ctx) {
    StringBuilder report=new StringBuilder();
    report.append("LUBANOTE ALARM FORENSICS / 692X\n");
    report.append("READ-ONLY | no note titles, bodies, E2E or tokens\n");
    report.append("CapturedMs=").append(System.currentTimeMillis()).append("\n");
    report.append("AndroidAPI=").append(Build.VERSION.SDK_INT);
    AlarmManager alarms=(AlarmManager)ctx.getSystemService(Context.ALARM_SERVICE);
    report.append(" exactAllowed=").append(alarms!=null && (Build.VERSION.SDK_INT<31 || alarms.canScheduleExactAlarms()));
    try {
      android.os.PowerManager power=(android.os.PowerManager)ctx.getSystemService(Context.POWER_SERVICE);
      if(power!=null) {
        report.append(" batteryExempt=").append(Build.VERSION.SDK_INT<23 || power.isIgnoringBatteryOptimizations(ctx.getPackageName()));
        report.append(" powerSave=").append(power.isPowerSaveMode());
        if(Build.VERSION.SDK_INT>=23) report.append(" idleNow=").append(power.isDeviceIdleMode());
      }
    } catch (Exception ignored) {}
    report.append("\nACTIVE APP NOTIFICATIONS (technical IDs only):\n");
    HashSet<Integer> remote=new HashSet<>();
    JSONObject records=load(ctx);
    JSONArray keys=records.names();
    if(keys!=null) for(int i=0;i<keys.length();i++) {
      String id=keys.optString(i,"");
      JSONObject row=records.optJSONObject(id);
      if(row==null) continue;
      for(String k:new String[]{"delivered","times"}) {
        JSONArray times=row.optJSONArray(k);
        if(times!=null) for(int j=0;j<times.length();j++) remote.add(requestId(id,times.optLong(j,0)));
      }
    }
    JSONObject local=localIndex692V(ctx);
    try {
      NotificationManager manager=(NotificationManager)ctx.getSystemService(Context.NOTIFICATION_SERVICE);
      if(manager!=null && Build.VERSION.SDK_INT>=23) {
        android.service.notification.StatusBarNotification[] active=manager.getActiveNotifications();
        int count=0;
        for(android.service.notification.StatusBarNotification item:active) {
          Notification n=item.getNotification();
          String channel=Build.VERSION.SDK_INT>=26?n.getChannelId():"legacy";
          if(!CHANNEL.equals(channel)) continue;
          int nId=item.getId();
          String route=remote.contains(nId)?"FCM_692O":
            local.has(Integer.toString(nId))?"APK_LOCAL_INDEXED":"LOCAL_OR_OTHER";
          report.append("id=").append(nId).append(" route=").append(route)
              .append(" postedMs=").append(item.getPostTime())
              .append(" shownWhenMs=").append(n.when)
              .append(" channel=").append(channel).append("\n");
          count++;
        }
        report.append("activeReminders=").append(count).append("\n");
      }
    } catch(Exception error) {report.append("activeReadUnavailable\n");}
    report.append("EVENT LOG (oldest to newest):\n");
    try {
      JSONArray rows=new JSONArray(ctx.getSharedPreferences(DIAG_PREF_692X,Context.MODE_PRIVATE).getString(DIAG_ROWS_692X,"[]"));
      for(int i=0;i<rows.length();i++) report.append(rows.optString(i,"")).append("\n");
    } catch(Exception ignored) {report.append("journalUnavailable\n");}
    report.append("696Z NEAR-TERM TRACE (past 3h / next 36h at event time; max 120 rows):\n");
    report.append("ARM/CANCEL = FCM/shared-native; LOCAL_INDEX = metadata, not Capacitor receiver proof.\n");
    try {
      JSONArray rows=new JSONArray(ctx.getSharedPreferences(DIAG_PREF_692X,Context.MODE_PRIVATE)
          .getString(DIAG_TRACE_696Z,"[]"));
      for(int i=0;i<rows.length();i++) report.append(rows.optString(i,"")).append("\n");
    } catch(Exception ignored) {report.append("696ZTraceUnavailable\n");}
    return report.toString();
  }

  private static int requestId(String noteId, long at) {
    return (noteId + "|" + at + "|692O").hashCode() & 0x7fffffff;
  }

  private static PendingIntent intent(Context ctx, String noteId, long at, int flags) {
    Intent i = new Intent(ctx, LubaNoteRemoteAlarmReceiver692O.class);
    i.setAction("cz.luban.notes2go.REMOTE_ALARM_692O");
    i.putExtra("noteId", noteId);
    i.putExtra("at", at);
    return PendingIntent.getBroadcast(ctx, requestId(noteId, at), i, flags | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
  }

  private static void cancel(Context ctx, String id, long at) {
    cancel(ctx,id,at,"unspecified");
  }
  private static void cancel(Context ctx, String id, long at, String reason) {
    AlarmManager manager = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
    PendingIntent pi = intent(ctx,id,at,PendingIntent.FLAG_NO_CREATE);
    diag696Z(ctx,"CANCEL",id,at,"reason="+reason+" piExists="+(pi!=null));
    if (pi != null) {
      if (manager != null) manager.cancel(pi);
      pi.cancel();
    }
    // Remove sticky registration before cancel; the delete receiver must not
    // silently recreate an alarm which the user already resolved.
    ctx.getSharedPreferences("lubanote_sticky_notifications_683au", Context.MODE_PRIVATE)
        .edit().remove("n_" + requestId(id,at)).commit();
    NotificationManager notifications = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
    if (notifications != null) notifications.cancel(requestId(id,at));
  }

  private static void schedule(Context ctx, String id, long at) {
    if (at <= System.currentTimeMillis() + 500L || at > System.currentTimeMillis() + MAX_FUTURE) {
      diag692X(ctx,"REMOTE_ARM_SKIPPED",id,at,"outside_future_window");
      return;
    }
    AlarmManager manager = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
    if (manager == null) return;
    PendingIntent pi = intent(ctx,id,at,PendingIntent.FLAG_UPDATE_CURRENT);
    String method="";
    if (Build.VERSION.SDK_INT >= 23) {
      if (Build.VERSION.SDK_INT >= 31 && !manager.canScheduleExactAlarms()) {
        manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,pi);
        method="INEXACT_IDLE_PERMISSION";
      } else {
        try {manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,pi);method="EXACT_ALLOW_IDLE";}
        catch (SecurityException ex) {manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,pi);method="INEXACT_SECURITY_FALLBACK";}
      }
    } else if (Build.VERSION.SDK_INT >= 19) {
      manager.setExact(AlarmManager.RTC_WAKEUP,at,pi);
      method="EXACT_PRE23";
    } else {
      manager.set(AlarmManager.RTC_WAKEUP,at,pi);
      method="LEGACY";
    }
    diag692X(ctx,"REMOTE_ARM",id,at,method);
    diag696Z(ctx,"ARM",id,at,"method="+method);
  }

  /* 692V: APK-local alarm index. The browser's numeric notification IDs are
     NOT transferable across devices. Pair by (parent note, exact timestamp)
     instead. No note titles/bodies, E2E content or login secrets are stored. */
  private static JSONObject localIndex692V(Context ctx) {
    try {
      return new JSONObject(ctx.getSharedPreferences(LOCAL_PREF_692V,Context.MODE_PRIVATE)
          .getString(LOCAL_RECORDS_692V,"{}"));
    } catch(Exception ignored) { return new JSONObject(); }
  }
  private static void saveLocalIndex692V(Context ctx,JSONObject data) {
    ctx.getSharedPreferences(LOCAL_PREF_692V,Context.MODE_PRIVATE).edit()
        .putString(LOCAL_RECORDS_692V,data.toString()).commit();
  }
  private static boolean validNote692V(String noteId) {
    return noteId!=null && noteId.matches("[a-zA-Z0-9_:-]{1,128}");
  }
  private static boolean validLocalId692V(int localId) {
    return localId > 0;
  }
  private static JSONObject record692V(String noteId,int localId,long at) throws org.json.JSONException {
    JSONObject record=new JSONObject();
    record.put("noteId",noteId);
    record.put("id",localId);
    record.put("at",at);
    return record;
  }
  private static boolean capacitorPendingExists692V(Context ctx,int localId) {
    try {
      Class<?> cls=Class.forName("com.capacitorjs.plugins.localnotifications.TimedNotificationPublisher");
      int flags=PendingIntent.FLAG_NO_CREATE;
      if(Build.VERSION.SDK_INT>=31) flags|=PendingIntent.FLAG_MUTABLE;
      PendingIntent pi=PendingIntent.getBroadcast(ctx,localId,new Intent(ctx,cls),flags);
      return pi!=null;
    } catch(Exception ignored) {return false;}
  }
  private static boolean hasLocalAt692V(Context ctx,JSONObject local,String noteId,long at) {
    JSONArray keys=local.names();
    if(keys==null) return false;
    for(int i=0;i<keys.length();i++) {
      JSONObject row=local.optJSONObject(keys.optString(i,""));
      if(row==null || !noteId.equals(row.optString("noteId","")) || row.optLong("at",-1L)!=at) continue;
      int localId=row.optInt("id",0);
      if(validLocalId692V(localId) && capacitorPendingExists692V(ctx,localId)) return true;
    }
    return false;
  }
  static synchronized void trackLocal692V(Context ctx,String noteId,int localId,long at) {
    if(!validNote692V(noteId) || !validLocalId692V(localId) ||
       at<=System.currentTimeMillis() || at>System.currentTimeMillis()+MAX_FUTURE) return;
    JSONObject local=localIndex692V(ctx);
    try {
      local.put(Integer.toString(localId),record692V(noteId,localId,at));
      saveLocalIndex692V(ctx,local);
      diag692X(ctx,"LOCAL_ARM_TRACKED",noteId,at,"localId="+localId);
      diag696Z(ctx,"LOCAL_INDEX_ARM",noteId,at,"localId="+localId+" index_only=true");
      // 692W: never cancel the exact remote alarm merely because a local one exists.
    } catch(Exception ignored) {}
  }
  static synchronized void forgetLocal692V(Context ctx,int localId) {
    if(!validLocalId692V(localId)) return;
    JSONObject local=localIndex692V(ctx);
    JSONObject previous696Z=local.optJSONObject(Integer.toString(localId));
    if(previous696Z!=null) diag696Z(ctx,"LOCAL_INDEX_FORGET",
      previous696Z.optString("noteId",""),previous696Z.optLong("at",0L),
      "localId="+localId+" index_only=true");
    local.remove(Integer.toString(localId));
    saveLocalIndex692V(ctx,local);
  }
  static synchronized boolean replaceLocalSnapshot692V(Context ctx,JSONArray items) {
    if(items==null || items.length()>4096) return false;
    JSONObject local=new JSONObject();
    try {
      for(int i=0;i<items.length();i++) {
        JSONObject row=items.optJSONObject(i);
        if(row==null) return false;
        String noteId=row.optString("noteId","");
        int localId=row.optInt("id",0);
        long at=Long.parseLong(row.optString("at","0"));
        if(!validNote692V(noteId) || !validLocalId692V(localId) ||
           at<=0 || at>System.currentTimeMillis()+MAX_FUTURE) return false;
        local.put(Integer.toString(localId),record692V(noteId,localId,at));
      }
      saveLocalIndex692V(ctx,local);
      // 692W: never cancel the exact remote alarm merely because a local one exists.
      return true;
    } catch(Exception ignored) {return false;}
  }
  // A web update may change/disable an alarm. Revoke only local alarms that
  // belong to THIS note and whose old timestamp is no longer requested.
  private static void cancelObsoleteLocal692V(Context ctx,String noteId,HashSet<Long> requested) {
    JSONObject local=localIndex692V(ctx);
    JSONArray keys=local.names();
    if(keys==null) return;
    boolean changed=false;
    for(int i=0;i<keys.length();i++) {
      String key=keys.optString(i,"");
      JSONObject row=local.optJSONObject(key);
      if(row==null || !noteId.equals(row.optString("noteId",""))) continue;
      long at=row.optLong("at",0);
      if(requested.contains(at)) continue;
      int localId=row.optInt("id",0);
      if(validLocalId692V(localId)) {
        diag696Z(ctx,"CAPACITOR_CANCEL",noteId,at,"reason=FCM_LOCAL_OBSOLETE localId="+localId);
        cancelCapacitor(ctx,localId);
      }
      local.remove(key);
      changed=true;
    }
    if(changed) saveLocalIndex692V(ctx,local);
  }

  /* Cancel an alarm scheduled earlier by Capacitor LocalNotifications 6.x.
     Only the explicitly supplied numeric IDs are touched; no unrelated alarms. */
  private static void cancelCapacitor(Context ctx, int id) {
    if (id <= 0) return;
    try {
      Class<?> cls = Class.forName("com.capacitorjs.plugins.localnotifications.TimedNotificationPublisher");
      Intent intent = new Intent(ctx, cls);
      int flags = PendingIntent.FLAG_NO_CREATE;
      if (Build.VERSION.SDK_INT >= 31) flags |= PendingIntent.FLAG_MUTABLE;
      PendingIntent pi = PendingIntent.getBroadcast(ctx,id,intent,flags);
      diag692X(ctx,"LOCAL_CANCEL_ATTEMPT",null,0,"localId="+id+" foundPI="+(pi!=null));
      if (pi != null) {
        AlarmManager manager = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (manager != null) manager.cancel(pi);
        pi.cancel();
      }
      ctx.getSharedPreferences("lubanote_sticky_notifications_683au", Context.MODE_PRIVATE)
          .edit().remove("n_" + id).commit();
      NotificationManager manager = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
      if (manager != null) manager.cancel(id);
    } catch (RuntimeException | ClassNotFoundException ignored) {
      diag692X(ctx,"LOCAL_CANCEL_ERROR",null,0,"localId="+id);
      // Optional Capacitor plugin unavailable; JS restore remains the fallback.
    }
  }

  private static JSONObject load(Context ctx) {
    try {return new JSONObject(ctx.getSharedPreferences(PREF,Context.MODE_PRIVATE).getString(RECORDS,"{}"));}
    catch (Exception e) {return new JSONObject();}
  }
  private static void save(Context ctx, JSONObject data) {
    ctx.getSharedPreferences(PREF,Context.MODE_PRIVATE).edit().putString(RECORDS,data.toString()).commit();
  }
  private static void clearRecords(Context ctx, JSONObject data) {
    JSONArray keys = data.names();
    if (keys == null) return;
    for (int i=0;i<keys.length();i++) {
      String id=keys.optString(i,"");
      JSONObject row=data.optJSONObject(id);
      JSONArray times=row == null ? null : row.optJSONArray("times");
      if (times != null) for (int j=0;j<times.length();j++) cancel(ctx,id,times.optLong(j,0),"CLEAR_RECORDS");
      JSONArray delivered=row == null ? null : row.optJSONArray("delivered");
      if (delivered != null) for (int j=0;j<delivered.length();j++) cancel(ctx,id,delivered.optLong(j,0),"CLEAR_RECORDS_DELIVERED");
    }
  }
  /* 692Z-A: Local ordinary note reminders use THE SAME Android PendingIntent
   * and notification ID as the exact FCM 692O route. This is deliberately
   * restricted to one non-recurring note occurrence; Planner and recurring
   * alarms stay on their proven scheduler until their distinct identities
   * can be migrated safely. FCM and APK no longer create two alarms for
   * this ordinary-note case. */
  static synchronized boolean scheduleLocalNote692Z(Context ctx,String id,int localId,
      long at,String title,String preview) {
    if(!validNote692V(id) || !validLocalId692V(localId) ||
        at<=System.currentTimeMillis()+500L || at>System.currentTimeMillis()+MAX_FUTURE) return false;
    try {
      JSONObject records=load(ctx);
      JSONObject row=records.optJSONObject(id);
      if(row==null) row=new JSONObject();
      long oldAt=row.optLong("localAt692Z",0L);
      JSONArray times=row.optJSONArray("times");
      if(times==null) times=new JSONArray();
      // Migrate an old note occurrence without changing other FCM/Planner times.
      JSONArray future=new JSONArray();
      boolean already=false;
      for(int i=0;i<times.length();i++) {
        long current=times.optLong(i,0L);
        if(current==at) {already=true;future.put(current);}
        else if(current==oldAt && oldAt>0) cancel(ctx,id,current,"LOCAL_TIME_REPLACED");
        else if(current>System.currentTimeMillis()) future.put(current);
      }
      if(!already) future.put(at);
      row.put("times",future);
      row.put("localAt692Z",at);
      row.put("localId692Z",localId);
      row.put("title",title==null || title.isEmpty()?"LubaNote":title);
      row.put("preview",preview==null || preview.isEmpty()?"Máš naplánovanou připomínku.":preview);
      // Persist BEFORE arming. Never clear the previous row on failure.
      records.put(id,row);
      save(ctx,records);
      schedule(ctx,id,at);
      diag692X(ctx,"UNIFIED_LOCAL_ARM_692Z",id,at,"localId="+localId+" sharedNativePI=true");
      diag696Z(ctx,"LOCAL_SHARED_SLOT",id,at,"localId="+localId+" sharedNativePI=true");
      return intent(ctx,id,at,PendingIntent.FLAG_NO_CREATE)!=null;
    } catch(Exception e) {
      diag692X(ctx,"UNIFIED_LOCAL_ERROR_692Z",id,at,"native_schedule_failed");
      return false;
    }
  }

  // Cancel one locally owned note ID. Do not touch unrelated Planner times.
  static synchronized boolean cancelLocalNote692Z(Context ctx,int localId) {
    if(!validLocalId692V(localId)) return false;
    try {
      JSONObject records=load(ctx);
      JSONArray names=records.names();
      if(names==null) return false;
      boolean changed=false;
      for(int i=0;i<names.length();i++) {
        String id=names.optString(i,"");
        JSONObject row=records.optJSONObject(id);
        if(row==null || row.optInt("localId692Z",0)!=localId) continue;
        long at=row.optLong("localAt692Z",0L);
        JSONArray times=row.optJSONArray("times");
        JSONArray future=new JSONArray();
        if(times!=null) for(int j=0;j<times.length();j++) {
          long value=times.optLong(j,0);
          if(value==at) cancel(ctx,id,at,"LOCAL_NOTE_CANCELLED");
          else if(value>System.currentTimeMillis()) future.put(value);
        }
        JSONArray delivered=row.optJSONArray("delivered");
        JSONArray keptDelivered=new JSONArray();
        if(delivered!=null) for(int j=0;j<delivered.length();j++) {
          long value=delivered.optLong(j,0);
          if(value==at) cancel(ctx,id,at,"LOCAL_NOTE_CANCELLED");
          else keptDelivered.put(value);
        }
        row.put("times",future);
        row.put("delivered",keptDelivered);
        row.remove("localAt692Z");
        row.remove("localId692Z");
        records.put(id,row);
        changed=true;
        diag692X(ctx,"UNIFIED_LOCAL_CANCEL_692Z",id,at,"localId="+localId);
      }
      if(changed) save(ctx,records);
      return changed;
    } catch(Exception ignored) {return false;}
  }

  // For 691AZ/691AX preflight provide exact same pending shape as Capacitor.
  static synchronized JSONArray localNotePending692Z(Context ctx) {
    JSONArray result=new JSONArray();
    try {
      JSONObject records=load(ctx);
      JSONArray names=records.names();
      if(names==null) return result;
      for(int i=0;i<names.length();i++) {
        String id=names.optString(i,"");
        JSONObject row=records.optJSONObject(id);
        if(row==null) continue;
        long at=row.optLong("localAt692Z",0);
        int localId=row.optInt("localId692Z",0);
        JSONArray times=row.optJSONArray("times");
        if(at<=System.currentTimeMillis() || !validLocalId692V(localId) || times==null) continue;
        boolean found=false;
        for(int j=0;j<times.length();j++) if(times.optLong(j,0)==at) found=true;
        if(!found || intent(ctx,id,at,PendingIntent.FLAG_NO_CREATE)==null) continue;
        JSONObject item=new JSONObject();
        item.put("id",localId);
        item.put("title",row.optString("title","LubaNote"));
        item.put("body",row.optString("preview","Máš naplánovanou připomínku."));
        JSONObject extra=new JSONObject();
        extra.put("lubanoteType","note");
        extra.put("taskId",id);
        item.put("extra",extra);
        JSONObject schedule=new JSONObject();
        schedule.put("at",at);
        schedule.put("allowWhileIdle",true);
        item.put("schedule",schedule);
        result.put(item);
      }
    } catch(Exception ignored) {}
    return result;
  }

  static synchronized void clearAll(Context ctx) {
    clearRecords(ctx,load(ctx));
    ctx.getSharedPreferences(PREF,Context.MODE_PRIVATE).edit().remove(RECORDS).apply();
  }

  // Foreground sync rebuilds future alarms using the existing LubaNote local
  // scheduler. Keep already delivered notifications visible until the user acts.
  static synchronized void clearScheduledAfterSync(Context ctx) {
    JSONObject records = load(ctx);
    JSONArray keys = records.names();
    if (keys == null) return;
    int keptCount696Z=0, cancelledCount696Z=0;
    for (int i=0; i<keys.length(); i++) {
      String id = keys.optString(i, "");
      JSONObject row = records.optJSONObject(id);
      if (row == null) continue;
      JSONArray times = row.optJSONArray("times");
      JSONArray kept=new JSONArray();
      long localAt=row.optLong("localAt692Z",0L);
      if (times != null) for (int j=0; j<times.length(); j++) {
        long at=times.optLong(j,0L);
        if(at==localAt && at>System.currentTimeMillis() &&
            intent(ctx,id,at,PendingIntent.FLAG_NO_CREATE)!=null) {
          kept.put(at);
          keptCount696Z++;
          diag696Z(ctx,"HANDOFF_KEEP",id,at,"reason=LOCAL_SHARED_SLOT");
        } else {
          cancel(ctx,id,at,"SYNC_HANDOFF");
          cancelledCount696Z++;
        }
      }
      try { row.put("times",kept); records.put(id,row); } catch(Exception ignored) {}
    }
    save(ctx, records);
    diag692X(ctx,"FOREGROUND_SYNC_HANDOFF",null,0,"remote_future_alarms_cleared");
    diag696Z(ctx,"HANDOFF_SUMMARY",null,0,
      "kept="+keptCount696Z+" cancelled="+cancelledCount696Z);
  }

  // Remove only the delivered instance the user acted on (Planner and note
  // alarms can coexist under one parent note). Must run AFTER a successful save.
  static synchronized void resolveDelivered(Context ctx,String id,long at) {
    JSONObject records=load(ctx);
    JSONObject row=records.optJSONObject(id);
    if (row == null) return;
    JSONArray delivered=row.optJSONArray("delivered");
    if (delivered==null) return;
    JSONArray remaining=new JSONArray();
    boolean changed=false;
    for(int i=0;i<delivered.length();i++) {
      long t=delivered.optLong(i,0);
      if (t == at || Math.abs(t-at)<=60000L) {
        cancel(ctx,id,t,"USER_RESOLVED");
        changed=true;
      } else remaining.put(t);
    }
    if (!changed) return;
    try { row.put("delivered",remaining); records.put(id,row); save(ctx,records); }
    catch(Exception ignored) {}
  }

  static synchronized void apply(Context ctx, java.util.Map<String,String> data) {
    final String id=data.get("noteId");
    final String owner=data.get("owner");
    if (id==null || !id.matches("[a-zA-Z0-9_:-]{1,128}") || owner==null || !owner.matches("[0-9a-f]{16}")) return;
    final long revision;
    try {revision=Long.parseLong(data.get("revision"));} catch (Exception e) {return;}
    if (revision<=0) return;
    try {
      JSONArray times=new JSONArray(data.get("at"));
      JSONArray ids=new JSONArray(data.get("cancel"));
      if (times.length()>48 || ids.length()>128) return;
      SharedPreferences pref=ctx.getSharedPreferences(PREF,Context.MODE_PRIVATE);
      String oldOwner=pref.getString(OWNER,"");
      JSONObject records=load(ctx);
      if (!oldOwner.isEmpty() && !oldOwner.equals(owner)) {
        clearRecords(ctx,records);
        records=new JSONObject();
      }
      JSONObject existing=records.optJSONObject(id);
      if (oldOwner.equals(owner) && existing!=null && existing.optLong("revision",0)>=revision) return;
      HashSet<Long> requested=new HashSet<>();
      final long now=System.currentTimeMillis();
      for (int i=0;i<times.length();i++) {
        if (!(times.opt(i) instanceof Number)) return;
        long at=times.getLong(i);
        if (at>now+500 && at<=now+MAX_FUTURE) requested.add(at);
      }
      for (int i=0;i<ids.length();i++) {
        if (!(ids.opt(i) instanceof Number)) return;
        int value=ids.getInt(i);
        if (value<=0 || value>2147483647) return;
      }
      if (existing!=null) {
        JSONArray previous=existing.optJSONArray("times");
        if (previous!=null) for (int i=0;i<previous.length();i++) cancel(ctx,id,previous.optLong(i,0),"FCM_REVISION_REPLACED");
        JSONArray delivered=existing.optJSONArray("delivered");
        if (delivered!=null) for (int i=0;i<delivered.length();i++) cancel(ctx,id,delivered.optLong(i,0),"FCM_REVISION_DELIVERED");
      }
      // 692V: Web-side numeric IDs cannot identify APK-side alarms safely.
      // Clean only APK-local records verified to belong to this exact note.
      cancelObsoleteLocal692V(ctx,id,requested);
      // 692W: FCM exact alarm has priority. Do not suppress it based on the
      // existence of a Capacitor PendingIntent (which may deliver late).
      // First arm the remote alarm; only then remove matching local alarms.
      // The normal foreground sync rebuilds local alarms and acknowledges the
      // handoff by clearing the future remote alarms.
      JSONArray safe=new JSONArray();
      for (Long at:requested) {
        safe.put(at);
        schedule(ctx,id,at);
      }
      JSONObject local=localIndex692V(ctx);
      JSONArray localKeys=local.names();
      boolean localChanged=false;
      if(localKeys!=null) for(int i=0;i<localKeys.length();i++) {
        String key=localKeys.optString(i,"");
        JSONObject entry=local.optJSONObject(key);
        if(entry==null || !id.equals(entry.optString("noteId",""))) continue;
        long at=entry.optLong("at",0L);
        if(!requested.contains(at)) continue;
        int localId=entry.optInt("id",0);
        if(validLocalId692V(localId)) {
          diag696Z(ctx,"CAPACITOR_CANCEL",id,at,"reason=FCM_SAME_TARGET localId="+localId);
          cancelCapacitor(ctx,localId);
          local.remove(key);
          localChanged=true;
        }
      }
      if(localChanged) saveLocalIndex692V(ctx,local);
      JSONObject fresh=new JSONObject();
      fresh.put("revision",revision);
      // Keep the APK-owned ordinary note in the SAME PendingIntent slot.
      // Remote changes supersede a previous local timestamp; a subsequent
      // foreground reconcile can set the new local timestamp.
      long localAt=existing==null?0L:existing.optLong("localAt692Z",0L);
      if(localAt>now && requested.contains(localAt)) {
        fresh.put("localAt692Z",localAt);
        fresh.put("localId692Z",existing.optInt("localId692Z",0));
      }
      fresh.put("times",safe);
      // Preview is bound to the authenticated account's FCM projection.
      fresh.put("title",data.get("title") == null ? "" : data.get("title"));
      fresh.put("preview",data.get("preview") == null ? "" : data.get("preview"));
      records.put(id,fresh);
      // Synchronous persistence so an app kill or reboot cannot discard alarms.
      pref.edit().putString(OWNER,owner).putString(RECORDS,records.toString()).commit();
      diag692X(ctx,"FCM_UPDATE_ACCEPTED",id,0,"scheduled="+safe.length()+" localCancelled="+localChanged);
      diag696Z(ctx,"FCM_UPDATE",id,0,"scheduled="+safe.length()+" localCancelled="+localChanged);
    } catch (Exception ignored) { /* malformed FCM data must never crash app */ }
  }

  static synchronized void restoreOnBoot(Context ctx) {
    JSONObject records=load(ctx);
    JSONArray keys=records.names();
    if (keys==null) return;
    for(int i=0;i<keys.length();i++) {
      String id=keys.optString(i,"");
      if (!id.matches("[a-zA-Z0-9_:-]{1,128}")) continue;
      JSONObject row=records.optJSONObject(id);
      JSONArray times=row==null?null:row.optJSONArray("times");
      if(times==null) continue;
      for(int j=0;j<times.length();j++) schedule(ctx,id,times.optLong(j,0));
    }
  }

  static synchronized void fire(Context ctx, String id, long at) {
    if (id==null || at<=0) return;
    diag692X(ctx,"REMOTE_RECEIVER_FIRED",id,at,"native_broadcast");
    diag696Z(ctx,"FIRED",id,at,"native_broadcast");
    JSONObject records=load(ctx);
    JSONObject row=records.optJSONObject(id);
    JSONArray times=row==null?null:row.optJSONArray("times");
    if (times==null) return;
    boolean present=false;
    JSONArray rest=new JSONArray();
    for(int i=0;i<times.length();i++) {
      long value=times.optLong(i,0);
      if (value==at) present=true;
      else if(value>System.currentTimeMillis()) rest.put(value);
    }
    if (!present) {
      diag692X(ctx,"REMOTE_FIRE_IGNORED",id,at,"not_in_pending_record");
      diag696Z(ctx,"FIRE_IGNORED",id,at,"reason=NOT_IN_PENDING_RECORD");
      return;
    }

    // 692Z-B: Never deliver a native reminder before its persisted due time.
    // A stale PendingIntent, a clock correction, or unexpected early broadcast
    // must not consume the pending record or show a notification prematurely.
    // Validate record membership ABOVE before rearming, so an old/cancelled
    // broadcast cannot revive a dismissed reminder.
    long now692ZB = System.currentTimeMillis();
    if (now692ZB < at) {
      long earlyMs692ZB = at - now692ZB;
      diag692X(ctx,"REMOTE_EARLY_BLOCK_692ZB",id,at,
          "earlyMs="+earlyMs692ZB+" rearm_attempt");
      try {
        schedule(ctx,id,at);
      } catch (RuntimeException error) {
        // Do not crash the application/receiver; preserve the pending record.
        diag692X(ctx,"REMOTE_EARLY_REARM_ERROR_692ZB",id,at,
            "native_alarm_schedule_failed");
      }
      return;
    }

    try {
      JSONArray delivered=row.optJSONArray("delivered");
      if (delivered==null) delivered=new JSONArray();
      delivered.put(at);
      row.put("times",rest);
      row.put("delivered",delivered);
      records.put(id,row);
      save(ctx,records);
    } catch(Exception ignored) {}
    if(Build.VERSION.SDK_INT>=33 && ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED) return;
    NotificationManager manager=(NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
    if(manager==null) return;
    if(Build.VERSION.SDK_INT>=26) {
      NotificationChannel channel=new NotificationChannel(CHANNEL,"Připomínky",NotificationManager.IMPORTANCE_HIGH);
      manager.createNotificationChannel(channel);
    }
    // The internal trampoline records this tap even if WebView is not running.
    Intent open=new Intent(ctx,LubaNoteRemoteOpen692T.class);
    open.putExtra("noteId",id);
    open.putExtra("at",at);
    int flags=PendingIntent.FLAG_UPDATE_CURRENT|(Build.VERSION.SDK_INT>=23?PendingIntent.FLAG_IMMUTABLE:0);
    PendingIntent tap=PendingIntent.getActivity(ctx,requestId(id,at),open,flags);
    // Exactly the same 683AZ first-delivery contract as local notifications:
    // Mi Fitness can read the initial non-ongoing notification; if swiped,
    // LubaNoteStickyDismissReceiver restores it silently as ongoing.
    JSONObject payload=new JSONObject();
    try {
      JSONObject extra=new JSONObject();
      extra.put("lubanoteType","note");
      extra.put("taskId",id);
      payload.put("id",requestId(id,at));
      payload.put("title",row.optString("title", "LubaNote – připomínka"));
      payload.put("body",row.optString("preview", "Máš naplánovanou připomínku."));
      payload.put("largeBody",row.optString("preview", ""));
      payload.put("channelId",CHANNEL);
      payload.put("autoCancel",false);
      payload.put("extra",extra);
    } catch(Exception ignored) {return;}
    Intent deleted=new Intent(ctx,LubaNoteStickyDismissReceiver.class);
    deleted.putExtra(LubaNoteStickyDismissReceiver.PAYLOAD,payload.toString());
    deleted.putExtra(LubaNoteStickyDismissReceiver.OPEN,tap);
    PendingIntent onSwipe=PendingIntent.getBroadcast(ctx,requestId(id,at),deleted,flags);
    ctx.getSharedPreferences("lubanote_sticky_notifications_683au",Context.MODE_PRIVATE)
        .edit().putBoolean("n_" + requestId(id,at),true).commit();
    Notification.Builder builder=Build.VERSION.SDK_INT>=26
        ?new Notification.Builder(ctx,CHANNEL):new Notification.Builder(ctx);
    builder.setSmallIcon(R.drawable.ic_stat_lubanote)
        .setContentTitle(row.optString("title", "").isEmpty() ? "LubaNote – připomínka" : row.optString("title"))
        .setContentText(row.optString("preview", "").isEmpty() ? "Máš naplánovanou připomínku." : row.optString("preview"))
        .setContentIntent(tap)
        .setDeleteIntent(onSwipe)
        .setAutoCancel(false)
        .setWhen(at)
        .setShowWhen(true)
        .setCategory(Notification.CATEGORY_REMINDER);
    if(Build.VERSION.SDK_INT<26) builder.setDefaults(Notification.DEFAULT_ALL);
    manager.notify(requestId(id,at),builder.build());
    diag692X(ctx,"REMOTE_NOTIFICATION_POSTED",id,at,"notificationId="+requestId(id,at));
    diag696Z(ctx,"POSTED",id,at,"notificationId="+requestId(id,at));
  }
}

