package cz.luban.notes2go;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import org.json.JSONArray;
import java.util.HashMap;
import java.util.Map;

/** 699D-AV: opt-in, local-only diagnostic listener. No note contents stored. */
public final class LubaNoteNotificationListener699DAV extends NotificationListenerService {
  private static final String PREF="lubanote_notification_listener_699DAV";
  private static final String ROWS="rows";
  private final Map<String,Long> lastAlert=new HashMap<>();

  static boolean enabled(Context context) {
    android.content.ComponentName component=new android.content.ComponentName(context,LubaNoteNotificationListener699DAV.class);
    android.app.NotificationManager manager=(android.app.NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
    return Build.VERSION.SDK_INT>=27 && manager!=null && manager.isNotificationListenerAccessGranted(component);
  }

  private static synchronized void record(Context context,String kind,int id,long post,long alert) {
    try {
      SharedPreferences prefs=context.getSharedPreferences(PREF,Context.MODE_PRIVATE);
      JSONArray previous=new JSONArray(prefs.getString(ROWS,"[]"));
      JSONArray rows=new JSONArray();
      for(int i=Math.max(0,previous.length()-79);i<previous.length();i++) rows.put(previous.opt(i));
      rows.put(System.currentTimeMillis()+" | "+kind+" | notificationId="+id+" | postMs="+post+" | lastAlertMs="+alert);
      prefs.edit().putString(ROWS,rows.toString()).apply();
    } catch(Exception ignored) { }
  }

  static String report(Context context) {
    StringBuilder b=new StringBuilder("LUBANOTE NOTIFICATION LISTENER / 699D-AV\n");
    b.append("listenerAccess=").append(enabled(context)).append("\n");
    b.append("lastAlertMs is Android ranking metadata, not proof of lockscreen rendering.\n");
    try {
      JSONArray rows=new JSONArray(context.getSharedPreferences(PREF,Context.MODE_PRIVATE).getString(ROWS,"[]"));
      for(int i=0;i<rows.length();i++) b.append(rows.optString(i)).append('\n');
    } catch(Exception ignored) { b.append("readUnavailable\n"); }
    return b.toString();
  }

  private boolean ours(StatusBarNotification sbn) {
    return sbn!=null && getPackageName().equals(sbn.getPackageName()) &&
      Build.VERSION.SDK_INT>=26 && "reminders".equals(sbn.getNotification().getChannelId());
  }

  @Override public void onNotificationPosted(StatusBarNotification sbn) {
    if(!ours(sbn)) return;
    record(this,"LISTENER_POSTED",sbn.getId(),sbn.getPostTime(),0);
    inspect(sbn);
  }

  @Override public void onNotificationRankingUpdate(RankingMap rankingMap) {
    try {
      StatusBarNotification[] active=getActiveNotifications();
      if(active!=null) for(StatusBarNotification sbn:active) if(ours(sbn)) inspect(sbn);
    } catch(Exception ignored) { }
  }

  private void inspect(StatusBarNotification sbn) {
    if(Build.VERSION.SDK_INT<26) return;
    try {
      Ranking ranking=new Ranking();
      RankingMap map=getCurrentRanking();
      if(map==null || !map.getRanking(sbn.getKey(),ranking)) return;
      long at=ranking.getLastAudiblyAlertedMillis();
      if(at<=0) return;
      Long old=lastAlert.put(sbn.getKey(),at);
      if(old==null || old.longValue()!=at) record(this,"RANKING_ALERT",sbn.getId(),sbn.getPostTime(),at);
    } catch(Exception ignored) { }
  }

  @Override public void onNotificationRemoved(StatusBarNotification sbn) {
    if(!ours(sbn)) return;
    lastAlert.remove(sbn.getKey());
    record(this,"LISTENER_REMOVED",sbn.getId(),sbn.getPostTime(),0);
  }
}
