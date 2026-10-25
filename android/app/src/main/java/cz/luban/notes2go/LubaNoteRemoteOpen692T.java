package cz.luban.notes2go;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import java.util.UUID;

/**
 * 692T: Invisible, internal notification-tap trampoline.
 * Persist only the note identifier and scheduled instant. The WebView consumes
 * the tap when the existing reminders UI is ready (including cold starts).
 */
public final class LubaNoteRemoteOpen692T extends Activity {
  static final String PREF = "lubanote_remote_open_692T";
  static final String NOTE = "noteId";
  static final String AT = "at";
  static final String TOKEN = "token";

  @Override protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    Intent tapped = getIntent();
    String id = tapped == null ? null : tapped.getStringExtra(NOTE);
    long at = tapped == null ? 0L : tapped.getLongExtra(AT, 0L);
    if (id != null && id.matches("[a-zA-Z0-9_:-]{1,128}") && at > 0L) {
      getSharedPreferences(PREF, Context.MODE_PRIVATE).edit()
          .putString(NOTE, id)
          .putLong(AT, at)
          .putString(TOKEN, UUID.randomUUID().toString())
          .commit();
    }
    Intent open = new Intent(this, MainActivity.class);
    // 693G: Explicit signal for an already running MainActivity. Native
    // SharedPreferences still own the tap; the intent carries no note text.
    open.putExtra("lubanote_remote_notification_tap_693G", true);
    open.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    startActivity(open);
    finish();
    overridePendingTransition(0, 0);
  }
}
