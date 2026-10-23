package cz.luban.notes2go;

import android.Manifest;
import android.app.ActivityManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

/**
 * 692M: data-only FCM; never starts an Activity in the background or reads notes.
 * Stashes a pending sync generation in app-private preferences and posts one
 * generic notification requesting the user to open the app.
 * Content keys, notes, and authentication tokens are never included in FCM.
 */
public final class LubaNoteFcmMessagingService extends FirebaseMessagingService {
  static final String PREFS = "lubanote_fcm_pending_692M";
  static final String GENERATION = "generation";
  static final String PENDING = "pending";
  private static final String CHANNEL = "lubanote_fcm_sync_692M";
  private static final int NOTIFICATION_ID = 193001234;

  @Override
  public void onMessageReceived(RemoteMessage message) {
    if (!"lubanote_sync_pending".equals(message.getData().get("kind"))) return;
    SharedPreferences prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    long next = prefs.getLong(GENERATION, 0L) + 1L;
    // commit(): ensure signal survives process termination before a tap.
    prefs.edit().putLong(GENERATION, next).putBoolean(PENDING, true).commit();
    // Foreground WebView will reconcile the pending signal itself.
    // Do not show an extra reminder-change banner while the app is visible.
    if (!isAppForeground()) showPendingSyncNotification();
  }

  @Override
  public void onNewToken(String token) {
    super.onNewToken(token);
    // JavaScript getToken() reads refreshed token when the app is next opened.
    // Never print token or send it without authenticated user context.
  }

  private boolean isAppForeground() {
    ActivityManager manager = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
    if (manager == null) return false;
    java.util.List<ActivityManager.RunningAppProcessInfo> processes = manager.getRunningAppProcesses();
    if (processes == null) return false;
    for (ActivityManager.RunningAppProcessInfo process : processes) {
      if (process.pid == android.os.Process.myPid()
          && process.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND) {
        return true;
      }
    }
    return false;
  }

  static void clearPendingSyncNotification(Context context) {
    NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    if (manager != null) manager.cancel(NOTIFICATION_ID);
  }

  private void showPendingSyncNotification() {
    if (Build.VERSION.SDK_INT >= 33 &&
        checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;

    NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
    if (manager == null) return;
    if (Build.VERSION.SDK_INT >= 26) {
      NotificationChannel channel = new NotificationChannel(
          CHANNEL, "Synchronizace připomínek", NotificationManager.IMPORTANCE_DEFAULT);
      channel.setDescription("Změny připomínek z dalších zařízení LubaNote");
      manager.createNotificationChannel(channel);
    }

    Intent open = new Intent(this, MainActivity.class);
    open.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    int flags = PendingIntent.FLAG_UPDATE_CURRENT;
    if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
    PendingIntent tap = PendingIntent.getActivity(this, NOTIFICATION_ID, open, flags);

    Notification.Builder builder = Build.VERSION.SDK_INT >= 26
        ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
    builder.setSmallIcon(R.drawable.ic_stat_lubanote)
        .setContentTitle("LubaNote – změna připomínky")
        .setContentText("Otevři LubaNote pro převzetí změny a naplánování oznámení.")
        .setContentIntent(tap)
        .setAutoCancel(true)
        .setOnlyAlertOnce(true);
    manager.notify(NOTIFICATION_ID, builder.build());
  }
}
