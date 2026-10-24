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
  private static final String CHANNEL = "reminders";
  private static final long MAX_FUTURE = 366L * 24 * 60 * 60 * 1000;

  private LubaNoteRemoteAlarm692O() {}

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
    AlarmManager manager = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
    PendingIntent pi = intent(ctx,id,at,PendingIntent.FLAG_NO_CREATE);
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
    if (at <= System.currentTimeMillis() + 500L || at > System.currentTimeMillis() + MAX_FUTURE) return;
    AlarmManager manager = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
    if (manager == null) return;
    PendingIntent pi = intent(ctx,id,at,PendingIntent.FLAG_UPDATE_CURRENT);
    if (Build.VERSION.SDK_INT >= 23) {
      if (Build.VERSION.SDK_INT >= 31 && !manager.canScheduleExactAlarms()) {
        manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,pi);
      } else {
        try {manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,pi);}
        catch (SecurityException ex) {manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,pi);}
      }
    } else if (Build.VERSION.SDK_INT >= 19) {
      manager.setExact(AlarmManager.RTC_WAKEUP,at,pi);
    } else {
      manager.set(AlarmManager.RTC_WAKEUP,at,pi);
    }
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
      if (times != null) for (int j=0;j<times.length();j++) cancel(ctx,id,times.optLong(j,0));
      JSONArray delivered=row == null ? null : row.optJSONArray("delivered");
      if (delivered != null) for (int j=0;j<delivered.length();j++) cancel(ctx,id,delivered.optLong(j,0));
    }
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
    for (int i=0; i<keys.length(); i++) {
      String id = keys.optString(i, "");
      JSONObject row = records.optJSONObject(id);
      if (row == null) continue;
      JSONArray times = row.optJSONArray("times");
      if (times != null) for (int j=0; j<times.length(); j++) cancel(ctx,id,times.optLong(j,0));
      try { row.put("times",new JSONArray()); records.put(id,row); } catch(Exception ignored) {}
    }
    save(ctx, records);
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
        cancel(ctx,id,t);
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
        if (previous!=null) for (int i=0;i<previous.length();i++) cancel(ctx,id,previous.optLong(i,0));
        JSONArray delivered=existing.optJSONArray("delivered");
        if (delivered!=null) for (int i=0;i<delivered.length();i++) cancel(ctx,id,delivered.optLong(i,0));
      }
      for (int i=0;i<ids.length();i++) cancelCapacitor(ctx,ids.getInt(i));
      JSONArray safe=new JSONArray();
      for (Long at:requested) {safe.put(at);schedule(ctx,id,at);}
      JSONObject fresh=new JSONObject();
      fresh.put("revision",revision);
      fresh.put("times",safe);
      // Preview is bound to the authenticated account's FCM projection.
      fresh.put("title",data.get("title") == null ? "" : data.get("title"));
      fresh.put("preview",data.get("preview") == null ? "" : data.get("preview"));
      records.put(id,fresh);
      // Synchronous persistence so an app kill or reboot cannot discard alarms.
      pref.edit().putString(OWNER,owner).putString(RECORDS,records.toString()).commit();
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
    if (!present) return;
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
  }
}

