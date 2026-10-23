package cz.luban.notes2go;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Native alarm receiver. */
public final class LubaNoteRemoteAlarmReceiver692O extends BroadcastReceiver {
  @Override public void onReceive(Context context, Intent intent) {
    if (!"cz.luban.notes2go.REMOTE_ALARM_692O".equals(intent.getAction())) return;
    LubaNoteRemoteAlarm692O.fire(context,intent.getStringExtra("noteId"),intent.getLongExtra("at",0));
  }
}

