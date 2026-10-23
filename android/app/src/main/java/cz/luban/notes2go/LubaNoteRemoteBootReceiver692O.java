package cz.luban.notes2go;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Re-arm persisted remote alarms after reboot. */
public final class LubaNoteRemoteBootReceiver692O extends BroadcastReceiver {
  @Override public void onReceive(Context context, Intent intent) {
    if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
      LubaNoteRemoteAlarm692O.restoreOnBoot(context);
    }
  }
}
