#!/usr/bin/env python3
# 683AU: compile-time targeted patch for Capacitor Local Notifications 6.1.3.
# Fail closed if expected source changes.

from pathlib import Path
import json
import re

root = Path(__file__).resolve().parent.parent
lock = json.loads((root / "package-lock.json").read_text(encoding="utf-8"))
version = lock["packages"]["node_modules/@capacitor/local-notifications"]["version"]
if version != "6.1.3":
    raise SystemExit(f"683AU: expected Capacitor Local Notifications 6.1.3; found {version}")

manager = root / "node_modules/@capacitor/local-notifications/android/src/main/java/com/capacitorjs/plugins/localnotifications/LocalNotificationManager.java"
if not manager.is_file():
    raise SystemExit(f"683AU: plugin source missing: {manager}")
source = manager.read_text(encoding="utf-8")
if "LubaNoteStickyDismissReceiver" in source and "683AU" in source:
    print("683AU: patch already applied")
    raise SystemExit(0)

# 1. Do not explicitly cancel reminder on DEFAULT click with autoCancel:false.
pattern_tap = re.compile(
    r'(String\s+menuAction\s*=\s*data\.getStringExtra\([^;]+;\s*)'
    r'dismissVisibleNotification\(notificationId\);'
)
replacement_tap = r'''\1// 683AU: false means tapping an active LubaNote reminder must not clear it.
        boolean lubaKeepOnTap683AU = false;
        try {
            String lubaSource683AU = data.getStringExtra(NOTIFICATION_OBJ_INTENT_KEY);
            if (lubaSource683AU != null) {
                JSONObject lubaPayload683AU = new JSONObject(lubaSource683AU);
                JSONObject lubaExtra683AU = lubaPayload683AU.optJSONObject("extra");
                String lubaType683AU = lubaExtra683AU == null ? "" : lubaExtra683AU.optString("lubanoteType", "");
                lubaKeepOnTap683AU = lubaPayload683AU.optBoolean("ongoing", false)
                    && !lubaPayload683AU.optBoolean("autoCancel", true)
                    && "reminders".equals(lubaPayload683AU.optString("channelId", ""))
                    && ("note".equals(lubaType683AU) || "planned".equals(lubaType683AU));
            }
        } catch (Exception ignored) {}
        if (!lubaKeepOnTap683AU) {
            dismissVisibleNotification(notificationId);
        }'''
source, n = pattern_tap.subn(replacement_tap, source)
if n != 1:
    raise SystemExit(f"683AU: tap source structure changed ({n} matches); stopping build")

# 2. Set special deleteIntent only for OUR persistent reminders; all other
# Capacitor notifications retain original receiver and original behavior.
pattern_dismiss = re.compile(
    r'(Intent\s+(\w+)\s*=\s*new Intent\(context,\s*NotificationDismissReceiver\.class\);)'
)
match = pattern_dismiss.search(source)
if not match or len(pattern_dismiss.findall(source)) != 1:
    raise SystemExit("683AU: dismissIntent structure changed; stopping build")
name = match.group(2)
# Source must have the content action's PendingIntent in this same method.
method_start = source.rfind('void createActionIntents(', 0, match.start())
if method_start < 0 or 'PendingIntent pendingIntent' not in source[method_start:match.start()]:
    raise SystemExit("683AU: expected tap PendingIntent not found in createActionIntents")
extra = f'''
        // 683AU: on Android 14+ swipe is allowed even for setOngoing(true).
        // Only LubaNote reminders get a silent re-show receiver (Loop pattern).
        if (localNotification.isOngoing() && !localNotification.isAutoCancel()
                && "reminders".equals(localNotification.getChannelId())) {{
            {name}.setClassName(context, "cz.luban.notes2go.LubaNoteStickyDismissReceiver");
            {name}.putExtra("lubanote_sticky_payload_683au", localNotification.getSource());
            {name}.putExtra("lubanote_sticky_open_683au", pendingIntent);
        }}
'''
source = source[:match.end()] + extra + source[match.end():]
manager.write_text(source, encoding="utf-8")
print("683AU: Native tap + swipe protections patched; version verified (6.1.3)")
