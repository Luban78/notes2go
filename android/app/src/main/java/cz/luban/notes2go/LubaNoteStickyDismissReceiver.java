package cz.luban.notes2go;

import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;

import androidx.core.app.NotificationCompat;

import org.json.JSONObject;

/*
 * 683AU: Android 14+ povoluje swipe i pro ongoing notifikaci.
 * Pokud je pripominka stale aktivni, zobrazi ji znovu BEZ ZVUKU.
 * Zamerne zde neprovadime zadny sync, start Activity ani serverovy pristup.
 * Android muze background doruceni omezit; neni to absolutni OS zamykani.
 */
public class LubaNoteStickyDismissReceiver extends BroadcastReceiver {
  public static final String PAYLOAD = "lubanote_sticky_payload_683au";
  public static final String OPEN = "lubanote_sticky_open_683au";

  @SuppressWarnings("deprecation")
  @Override
  public void onReceive(Context context, Intent intent) {
    if (intent == null || !intent.hasExtra(PAYLOAD)) return;
    try {
      JSONObject json = new JSONObject(intent.getStringExtra(PAYLOAD));
      int id = json.optInt("id", 0);
      if (id <= 0 || !LubaNoteStickyPlugin.jeAktivni(context, id)) return;
      JSONObject extra = json.optJSONObject("extra");
      if (extra == null) return;
      String typ = extra.optString("lubanoteType", "");
      if (!"note".equals(typ) && !"planned".equals(typ)) return;
      if (!json.optBoolean("ongoing", false) || json.optBoolean("autoCancel", true)) return;
      if (!"reminders".equals(json.optString("channelId", ""))) return;

      PendingIntent open = intent.getParcelableExtra(OPEN);
      if (open == null) return;

      // Po odtazeni uchovame stejnou oteviraci akci i systemove ID.
      NotificationCompat.Builder builder = new NotificationCompat.Builder(context, "reminders")
        .setContentTitle(json.optString("title", "LubaNote"))
        .setContentText(json.optString("body", ""))
        .setSmallIcon(R.drawable.ic_stat_lubanote)
        .setContentIntent(open)
        .setAutoCancel(false)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setSilent(true)
        .setPriority(NotificationCompat.PRIORITY_LOW);

      String velkyText = json.optString("largeBody", "");
      if (!velkyText.isEmpty()) {
        builder.setStyle(new NotificationCompat.BigTextStyle().bigText(velkyText));
      }

      // I obnovene oznameni znovu dostane deleteIntent pro dalsi swipe.
      Intent zruseno = new Intent(context, LubaNoteStickyDismissReceiver.class);
      zruseno.putExtra(PAYLOAD, intent.getStringExtra(PAYLOAD));
      zruseno.putExtra(OPEN, open);
      PendingIntent priOdtazeni = PendingIntent.getBroadcast(
        context,
        id,
        zruseno,
        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
      );
      builder.setDeleteIntent(priOdtazeni);

      NotificationManager spravce =
        (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
      if (spravce != null && LubaNoteStickyPlugin.jeAktivni(context, id)) {
        spravce.notify(id, builder.build());
      }
    } catch (Exception ignored) {
      // Selhani obnovy nikdy nesmi shodit systemovy BroadcastReceiver.
    }
  }
}
