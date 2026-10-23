package cz.luban.notes2go;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;
import com.google.firebase.messaging.FirebaseMessaging;

/** 692L: Explicit, read-only FCM token access. No token logs, network writes, or notifications. */
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
}
