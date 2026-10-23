package cz.luban.notes2go;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;
import com.google.firebase.messaging.FirebaseMessaging;

/** 692M: Authenticated JS decides when to upload token; native stores no user data. */
@CapacitorPlugin(name = "LubaNoteFcmToken")
public class LubaNoteFcmTokenPlugin extends Plugin {
  @PluginMethod
  public void getToken(PluginCall call) {
    FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
      if (!task.isSuccessful()) {
        call.reject("FCM_TOKEN_UNAVAILABLE");
        return;
      }
      String token = task.getResult();
      if (token == null || token.isEmpty()) {
        call.reject("FCM_TOKEN_EMPTY");
        return;
      }
      JSObject result = new JSObject();
      result.put("token", token);
      call.resolve(result);
    });
  }

  @PluginMethod
  public void getPendingSync(PluginCall call) {
    SharedPreferences prefs = getContext().getSharedPreferences(
        LubaNoteFcmMessagingService.PREFS, Context.MODE_PRIVATE);
    JSObject response = new JSObject();
    response.put("pending", prefs.getBoolean(LubaNoteFcmMessagingService.PENDING, false));
    response.put("generation", Long.toString(prefs.getLong(LubaNoteFcmMessagingService.GENERATION, 0L)));
    call.resolve(response);
  }

  @PluginMethod
  public void ackPendingSync(PluginCall call) {
    String expected = call.getString("generation", "");
    SharedPreferences prefs = getContext().getSharedPreferences(
        LubaNoteFcmMessagingService.PREFS, Context.MODE_PRIVATE);
    String current = Long.toString(prefs.getLong(LubaNoteFcmMessagingService.GENERATION, 0L));
    if (current.equals(expected)) {
      prefs.edit().putBoolean(LubaNoteFcmMessagingService.PENDING, false).apply();
      LubaNoteFcmMessagingService.clearPendingSyncNotification(getContext());
    }
    call.resolve();
  }
}
