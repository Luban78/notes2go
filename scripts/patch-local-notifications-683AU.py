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

# 699W: AlarmManager may throw IllegalStateException when the device UID has
# reached its native alarm quota (500 on the affected Xiaomi). The original
# Capacitor plugin lets that exception escape its bridge thread and kill APK.
# Convert a failed schedule into a rejected Promise; JS can report it safely.
plugin_java = root / "node_modules/@capacitor/local-notifications/android/src/main/java/com/capacitorjs/plugins/localnotifications/LocalNotificationsPlugin.java"
if not plugin_java.is_file():
    raise SystemExit(f"699W: plugin file missing: {plugin_java}")
plugin_source = plugin_java.read_text(encoding="utf-8")
needle_699w = 'JSONArray ids = manager.schedule(call, localNotifications);'
if 'LUBANOTE_NATIVE_ALARM_SCHEDULE_FAILED_699W' not in plugin_source:
    if plugin_source.count(needle_699w) != 1:
        raise SystemExit('699W: expected one Capacitor schedule call; refusing unsafe patch')
    plugin_source = plugin_source.replace(needle_699w, """JSONArray ids;
        try {
            ids = manager.schedule(call, localNotifications);
        } catch (RuntimeException error) {
            // 699W: do not terminate the Android process at AlarmManager quota.
            call.reject("LUBANOTE_NATIVE_ALARM_SCHEDULE_FAILED_699W");
            return;
        }""", 1)
    plugin_java.write_text(plugin_source, encoding="utf-8")



def kompatibilita_hodinek_683AZ(kod):
    """Preserve 683AU/683AX protection when the first alert is not ongoing.

    This keeps the initial Android notification in the alerting category
    so notification listeners (such as Mi Fitness) can see it. Only the
    LubaNote reminders channel and autoCancel:false get sticky handling.
    """
    stare = 'if (localNotification.isOngoing() && !localNotification.isAutoCancel()'
    nove = 'if (!localNotification.isAutoCancel()'
    if kod.count(stare) == 2:
        kod = kod.replace(stare, nove)
    elif kod.count(nove) != 2:
        raise SystemExit('683AZ: two native sticky guards not found; stopping build')

    stare_tap = 'lubaPayload683AU.optBoolean("ongoing", false)\n                    && !lubaPayload683AU.optBoolean("autoCancel", true)'
    nove_tap = '!lubaPayload683AU.optBoolean("autoCancel", true)'
    if kod.count(stare_tap) == 1:
        kod = kod.replace(stare_tap, nove_tap)
    elif kod.count(nove_tap) != 1:
        raise SystemExit('683AZ: protected tap guard not found; stopping build')
    return kod


def ochrana_otevreni_po_odlozeni_683AX(kod):
    """Keep the already displayed notification's PendingIntent valid on replan.

    FLAG_CANCEL_CURRENT invalidates old PendingIntent handles; Android may
    still show a notification holding one after repeated scheduling.
    UPDATE_CURRENT refreshes extras without invalidating the old handle.
    """
    if "683AX: keep tap intent alive" in kod:
        return kod

    zacatek = kod.find("void createActionIntents(")
    if zacatek < 0:
        raise SystemExit("683AX: createActionIntents missing; stopping build")
    konec = kod.find("// Dismiss intent", zacatek)
    if konec < 0:
        raise SystemExit("683AX: dismiss intent marker missing; stopping build")

    hlava = kod[zacatek:konec]
    puvodni = "int flags = PendingIntent.FLAG_CANCEL_CURRENT;"
    if hlava.count(puvodni) != 1:
        raise SystemExit("683AX: tap flags changed; stopping build")

    opravene = 'int flags = PendingIntent.FLAG_CANCEL_CURRENT;\n        // 683AX: keep tap intent alive for LubaNote reminders after Snooze/replan.\n        // Re-scheduling the same ID must not invalidate the PendingIntent held\n        // by an already displayed notification (683AU sticky / Android shade).\n        if (localNotification.isOngoing() && !localNotification.isAutoCancel()\n                && "reminders".equals(localNotification.getChannelId())) {\n            flags = PendingIntent.FLAG_UPDATE_CURRENT;\n        }'
    hlava = hlava.replace(puvodni, opravene, 1)
    return kod[:zacatek] + hlava + kod[konec:]


if "LubaNoteStickyDismissReceiver" in source and "683AU" in source:
    source = ochrana_otevreni_po_odlozeni_683AX(source)
    source = kompatibilita_hodinek_683AZ(source)
    manager.write_text(source, encoding="utf-8")
    print("683AZ: compatible with Mi Band; 683AU/683AX preserved")
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
source = ochrana_otevreni_po_odlozeni_683AX(source)
source = kompatibilita_hodinek_683AZ(source)
manager.write_text(source, encoding="utf-8")
print("683AZ: Native wearable-compatible sticky and snooze fixes patched (6.1.3)")
