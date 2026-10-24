package cz.luban.notes2go;

import android.content.Context;
import android.content.SharedPreferences;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

/** 692O: Android plans FCM reminder timestamps without opening WebView. */
public final class LubaNoteFcmMessagingService extends FirebaseMessagingService {
  static final String PREFS = "lubanote_fcm_pending_692M";
  static final String GENERATION = "generation";
  static final String PENDING = "pending";
  static final String NOTE_IDS = "noteIds692O";
  private static final int OLD_NOTIFICATION_ID = 193001234;

  @Override public void onMessageReceived(RemoteMessage message) {
    String kind = message.getData().get("kind");
    if (!"lubanote_sync_pending".equals(kind) && !"lubanote_alarm_update_692O".equals(kind)) return;
    SharedPreferences prefs = getSharedPreferences(PREFS,Context.MODE_PRIVATE);
    long next = prefs.getLong(GENERATION,0L) + 1L;
    android.content.SharedPreferences.Editor edit=prefs.edit().putLong(GENERATION,next).putBoolean(PENDING,true);
    if ("lubanote_alarm_update_692O".equals(kind)) {
      String id=message.getData().get("noteId");
      if (id!=null && id.matches("[a-zA-Z0-9_:-]{1,128}")) {
        try {
          org.json.JSONArray known=new org.json.JSONArray(prefs.getString(NOTE_IDS,"[]"));
          boolean found=false;
          for(int i=0;i<known.length();i++) if(id.equals(known.optString(i))) found=true;
          if(!found && known.length()<256) known.put(id);
          edit.putString(NOTE_IDS,known.toString());
        } catch(Exception ignored) {edit.putString(NOTE_IDS,new org.json.JSONArray().put(id).toString());}
      }
    }
    edit.commit();
    if ("lubanote_alarm_update_692O".equals(kind)) {
      LubaNoteRemoteAlarm692O.diag692X(this,"FCM_MESSAGE_RECEIVED",message.getData().get("noteId"),0,"alarm_update");
      LubaNoteRemoteAlarm692O.apply(this,message.getData());
    }
    // 692N helper banner replaced with silent native alarm planning.
    clearPendingSyncNotification(this);
  }

  @Override public void onNewToken(String token) {
    super.onNewToken(token);
    // Token is registered by authenticated JS upon next application resume.
  }

  static void clearPendingSyncNotification(Context context) {
    android.app.NotificationManager manager=(android.app.NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    if(manager!=null) manager.cancel(OLD_NOTIFICATION_ID);
  }
}
