#!/usr/bin/env python3
"""LubaNote 699D: fail-closed staging of the public Android APK.

Runs ONLY on CI copies, not on project source files or the developer build.
Stages:
  web     - remove developer-only UI/loaders/assets from www
  android - remove the native AutoTester plugin from Android + set version
  verify  - confirm the staged build has no known developer assets

This script intentionally uses explicitly audited names and exact anchors. When
upstream markup changes, it fails instead of silently publishing a dirty APK.
"""
from __future__ import annotations

import argparse
import re
from pathlib import Path
from urllib.parse import urlsplit

# Retained even though some names contain 'debug' or 'diagnostic':
# debug{Mobile,Tablet,Desktop}Generated.css = actual published UI styles;
# lubaKeyboardPreview691BJ.js = real keyboard pressed-key bubble;
# native LubaNoteCutoutDiagnostic693I = mobileHeader693J.js screen-cutout protection.
DENY_WEB_EXACT = {
    "adminSvgStudio693R.css", "adminSvgStudio693R.js",
    "adminToolsLazy695A.js",
    "cardDragLab.js", "cutoutDiagnostic693I.js",
    "debugHub.css", "debugHub.js",
    "fpsBenchmark691BQ.js", "lubaDebugSyncBrief691BA.js",
    "lubaKeyboardTouchTrace699U.js", "lubaLayoutAudit699BGA.js",
    "performanceBenchmark.js", "scrollDiagnostic691AH.js",
    "startupDiagnostics.js", "themeBuilder699C.css", "themeBuilder699C.js",
    "visualDebug.css", "visualDebug.js", "lubaAutoTester.css",
}
DENY_WEB_RE = re.compile(r"^lubaAutoTester[^/]*\.js$", re.I)

# Audited files in index.html at the 699D-PROD baseline. Every new JS/CSS
# added to the repo must be explicitly reviewed before it can enter PROD.
# Python only stages the CI copy; adding a feature to DEV never auto-publishes
# an unknown script to customers.
APPROVED_PROD_ASSETS = frozenset("""
    adminDashboard.js attachmentsCloud.js attachmentsLocal.js autofillGuard.js
    backendConfig.js backendDiagnostics.js batteryGuide697C.js build-version.js
    calendar.js cardActionsMobile.css cardActionsMobile.js cardDrag.js cardView.js
    chat.css chat.js choiceModal.js cloudUsage699AR.css cloudUsage699AR.js
    debugDesktopGenerated.css debugMobileGenerated.css debugTabletGenerated.css
    desktop.css desktop.js desktopCompact699BA.css desktopIcons.js
    desktopReminderAlerts692C.css desktopReminderAlerts692C.js desktopReminders.js
    desktopStatus692A.js desktopZoomSafety699BGAC.js dictionarySync.js
    documents.css documents.js e2eCore.js e2eDeviceGuard688T.js
    e2eNotesCrypto.js e2ePasswordChange688A.js e2ePasswordChange688N.css
    editorCoreV2.css editorCoreV2.js editorCoreV2Bridge.css editorCoreV2Bridge.js
    editorDateTime683BJ.js editorDocuments.js editorFind.js editorHandoff.js
    editorKeyboardPreferences683BN.css editorKeyboardPreferences683BN.js
    editorMediaV2.js editorFont683BP.css editorFont683BP.js
    epubReader.js externalOpen699AS.js fontAssets683BQ.css
    globalFonts683BQ.css globalFonts683BQ.js homeDateTime683BC.js
    homeDateTimeAndStatus683BC.css homeToolbarPreferences.css
    homeToolbarPreferences.js i18n.js iconPreference.css lang-cs.js lang-de.js
    lang-en.js lang-es.js lang-pl.js lang-sk.js learningDictionary.css
    learningDictionary.js learningDictionarySync.js legacyDocReader.js
    liveTheme699H.js liveTonePreset699I.js localVault697M.js
    lubaFcmBridge692M.js lubaIcons.js lubaKeyboard.css lubaKeyboard.js
    lubaKeyboardPreview691BJ.js lubaTitleCaret.js maintenance.js mediaCrypto.js
    mobileHeader693J.css mobileHeader693J.js modalAndReminderLayout683BS.css
    navigation.js noteLinks.js onboarding.js planner.js quickMenu683BM.css
    quickMenu683BM.js recurringTasks.js reminders.js script.js search.js secret.js
    secretBiometric.js securitySettings683BT.css securitySettings683BT.js
    settings.js settingsAccordion683BJ.css settingsAccordion683BJ.js
    sharedChatRealtime.js sharedMediaCrypto.js sharing.css sharingAttachments.js
    sharingEditor.js sharingIdentity.js sharingInvitations.js sharingNotes.js
    storage.js style.css supabaseClient.js swipeActions.js sync.js
    syncRealtime.js syncStatus.js syncTraffic.js tags.js theme.css themes.js
    tomorrowSnooze683BT.js trash.js
""".split())

REMOVE_BUTTON_IDS = (
    "adminUiToolButton", "adminStartSync699ARToolButton",
    "adminDebugHubToolButton", "adminSvgStudio693RButton",
)
REMOVE_SECTION_IDS = (
    "adminUiView", "adminStartSync699ARView", "adminSvgStudio693RView",
)
KEEP_UI_PLACEHOLDER = '''<section id="adminUiView" class="adminDashboardSubView" hidden>
  <button id="adminUiBackButton" type="button" hidden></button>
</section>'''
MAIN_ACTIVITY = Path("app/src/main/java/cz/luban/notes2go/MainActivity.java")
NATIVE_TESTER = Path("app/src/main/java/cz/luban/notes2go/LubaNoteNativeTesterPlugin.java")


def require_exact(text: str, old: str, new: str, context: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{context}: expected exactly one anchor, found {count}: {old[:90]!r}")
    return text.replace(old, new, 1)


def dev_asset(filename: str) -> bool:
    return filename in DENY_WEB_EXACT or bool(DENY_WEB_RE.fullmatch(filename))


def remove_button(html: str, item_id: str) -> str:
    pattern = re.compile(
        r'<button\b(?=[^>]*\bid=[\'"]' + re.escape(item_id) +
        r'[\'"])[^>]*>[\s\S]*?</button>', re.I,
    )
    html, count = pattern.subn(f'<!-- PROD 699D: {item_id} removed -->', html)
    if count != 1:
        raise RuntimeError(f'index.html: button {item_id}: expected 1, got {count}')
    return html


def remove_section(html: str, section_id: str, replacement: str = "") -> str:
    opener = re.compile(r'<section\b(?=[^>]*\bid=[\'"]' + re.escape(section_id) +
                        r'[\'"])[^>]*>', re.I)
    m = opener.search(html)
    if not m or opener.search(html, m.end()):
        raise RuntimeError(f'index.html: section {section_id}: expected exactly 1')
    tokens = re.finditer(r'</?section\b[^>]*>', html[m.start():], re.I)
    depth = 0
    ending = None
    for token in tokens:
        if token.group(0).lower().startswith('</'):
            depth -= 1
            if depth == 0:
                ending = m.start() + token.end()
                break
        else:
            depth += 1
    if ending is None:
        raise RuntimeError(f'index.html: unclosed section {section_id}')
    return html[:m.start()] + (replacement or f'<!-- PROD 699D: {section_id} removed -->') + html[ending:]


def stage_web(web: Path) -> None:
    if not web.is_dir():
        raise RuntimeError(f'Web assets missing: {web}')
    index_path = web / 'index.html'
    admin_path = web / 'adminDashboard.js'
    html = index_path.read_text(encoding='utf-8')
    admin = admin_path.read_text(encoding='utf-8')

    # Remove only exact dev script/link tags; never remove active layout CSS.
    asset_element = re.compile(
        r'<(?:script|link)\b[^>]*?\b(?:src|href)=[\'"]([^\'"]+)[\'"][^>]*?(?:>\s*</script>|>)',
        re.I,
    )
    removed_tags = []
    def strip_known_assets(match: re.Match[str]) -> str:
        path = urlsplit(match.group(1)).path
        name = Path(path).name
        if dev_asset(name):
            removed_tags.append(name)
            return '<!-- PROD 699D: development asset excluded -->'
        return match.group(0)
    html = asset_element.sub(strip_known_assets, html)
    # Abort if a dev asset acquired an unrecognized tag syntax.
    for entry in sorted(web.iterdir()):
        if entry.is_file() and dev_asset(entry.name):
            if entry.name in html:
                raise RuntimeError(f'Dev asset still mentioned in index.html: {entry.name}')

    for item_id in REMOVE_BUTTON_IDS:
        html = remove_button(html, item_id)
    for section_id in REMOVE_SECTION_IDS:
        html = remove_section(html, section_id,
                              KEEP_UI_PLACEHOLDER if section_id == 'adminUiView' else '')

    # 699D-H: The legacy RX/TX/E diagnostic strip is obsolete in PROD.
    # Retain its DOM and syncStatusText: syncTraffic.js and syncStatus.js
    # still use these nodes. An !important inline display:none guarantees
    # that account refreshes cannot unhide it. DEV HTML stays unchanged.
    html = require_exact(
        html,
        '<div id="syncTrafficBar" class="syncTrafficBar" data-sync-active="0" aria-live="polite" hidden>',
        '<div id="syncTrafficBar" class="syncTrafficBar" data-sync-active="0" aria-live="polite" hidden style="display:none !important">',
        'PROD 699D-H legacy RX/TX/E bar',
    )

    # Keep admin accounts/server but eliminate DEV-specific hard prerequisites.
    for guard in ("    !uiTlacitko ||\n", "    !visualDebugTlacitko ||\n",
                  "    !debugHubTlacitko ||\n"):
        admin = require_exact(admin, guard, "", "adminDashboard guard")
    for old, new in (
        ('  uiTlacitko.addEventListener("click", () => {',
         '  uiTlacitko?.addEventListener("click", () => {'),
        ('  visualDebugTlacitko.addEventListener(',
         '  visualDebugTlacitko?.addEventListener('),
        ('  debugHubTlacitko.addEventListener(',
         '  debugHubTlacitko?.addEventListener('),
    ):
        admin = require_exact(admin, old, new, "adminDashboard optional DEV UI")

    # Remove 5x top-left unlock listeners and all their functions, rather than
    # merely turning off an on-screen switch.
    start_marker = '  const POVOLIT_NOUZOVY_DEBUG_5X = true;'
    gate_marker = '  window.LubaNoteAdminTools = {'
    start = admin.find(start_marker)
    gate = admin.find(gate_marker, start)
    if start < 0 or gate < 0 or admin.count(start_marker) != 1 or admin.count(gate_marker) != 1:
        raise RuntimeError('adminDashboard: emergency unlock anchors changed')
    admin = (admin[:start] +
             '  // PROD 699D: no emergency developer unlock.\n'
             '  const nouzovyDevDebug = false;\n\n' + admin[gate:])
    admin = require_exact(
        admin,
        '''    isAllowed: () =>
      jeAdmin === true ||
      (POVOLIT_NOUZOVY_DEBUG_5X && nouzovyDevDebug === true),
    isEmergencyDevUnlock: () =>
      POVOLIT_NOUZOVY_DEBUG_5X && nouzovyDevDebug === true''',
        '''    isAllowed: () => jeAdmin === true,
    isEmergencyDevUnlock: () => false''',
        'adminDashboard: admin-only gate',
    )
    start_marker = '  /* PATCH 683B – přesný roh + zachování rozběhnuté diagnostiky.'
    end_marker = '  menuTlacitko.addEventListener('
    start = admin.find(start_marker)
    end = admin.find(end_marker, start)
    if start < 0 or end < 0 or admin.count(start_marker) != 1 or admin.count(end_marker) != 1:
        raise RuntimeError('adminDashboard: 5x gesture section anchors changed')
    admin = admin[:start] + '  // PROD 699D: developer gestures not included.\n\n' + admin[end:]
    admin = require_exact(admin, '  registrujNouzovyDebug5x();\n', '',
                          'adminDashboard: 5x gesture startup')

    # Existing DEV APK may have saved the FPS monitor as enabled. Do not carry
    # the monitor into user-facing APK even for the same admin on the same phone.
    admin = require_exact(
        admin, '    fpsEnabled691BP = localStorage.getItem(FPS_VISIBLE_KEY_691BP) === "1";',
        '    fpsEnabled691BP = false; // PROD 699D: ignore DEV FPS preference',
        'adminDashboard: persisted FPS',
    )
    # Theme-only text selection: diagnostic red is not an end-user preference.
    admin = require_exact(
        admin, '  nastavBarvyVlastnihoVyberu(ulozenyRezim);',
        '  nastavBarvyVlastnihoVyberu("theme"); // PROD 699D',
        'adminDashboard: diagnostic selection palette',
    )

    index_path.write_text(html, encoding='utf-8')
    admin_path.write_text(admin, encoding='utf-8')
    count = 0
    for asset in list(web.iterdir()):
        if not asset.is_file() or asset.suffix.lower() not in ('.js', '.css'):
            continue
        if dev_asset(asset.name):
            asset.unlink()
            count += 1
        elif asset.name not in APPROVED_PROD_ASSETS:
            raise RuntimeError(f'UNREVIEWED JS/CSS asset in PROD: {asset.name}. '
                               'Add to audited whitelist only after review.')
    verify_web(web)
    print(f'[PROD 699D] Web staged: removed {count} JS/CSS assets and {len(removed_tags)} asset tags')


def stage_android(android: Path, version_code: int, version_name: str) -> None:
    if version_code <= 1 or version_code > 2_100_000_000:
        raise RuntimeError('versionCode must be a positive, increasing Android version >1')
    if not re.fullmatch(r'\d+\.\d+\.\d+', version_name):
        raise RuntimeError('versionName must look like 1.0.123')
    main_path = android / MAIN_ACTIVITY
    tester_path = android / NATIVE_TESTER
    if not tester_path.is_file():
        raise RuntimeError(f'Missing native tester source: {tester_path}')
    main = main_path.read_text(encoding='utf-8')
    # Keep LubaNoteCutoutDiagnostic693I! mobileHeader693J.js consumes it.
    main, count = re.subn(
        r'\n[ \t]*registerPlugin\(\s*LubaNoteNativeTesterPlugin\.class\s*\);',
        '', main, count=1,
    )
    if count != 1 or 'registerPlugin(\n      LubaNoteNativeTesterPlugin' in main:
        raise RuntimeError('MainActivity: native tester registration not found exactly once')
    main_path.write_text(main, encoding='utf-8')
    tester_path.unlink()

    gradle_path = android / 'app/build.gradle'
    gradle = gradle_path.read_text(encoding='utf-8')
    for field, replacement in (
        ('versionCode', str(version_code)),
        ('versionName', f'"{version_name}"'),
    ):
        pat = re.compile(r'(?m)^(\s*' + field + r'\s+)\S+([ \t]*)$')
        gradle, n = pat.subn(lambda m: m.group(1) + replacement + m.group(2), gradle, count=1)
        if n != 1:
            raise RuntimeError(f'Gradle: expected exactly one {field}')
    gradle_path.write_text(gradle, encoding='utf-8')
    verify_android(android)
    print(f'[PROD 699D] Android staged: native tester removed, code={version_code}, name={version_name}')


def verify_web(web: Path) -> None:
    html = (web / 'index.html').read_text(encoding='utf-8')
    admin = (web / 'adminDashboard.js').read_text(encoding='utf-8')
    bad_assets = [f.name for f in web.iterdir() if f.is_file() and dev_asset(f.name)]
    unreviewed = [f.name for f in web.iterdir()
                  if f.is_file() and f.suffix.lower() in ('.js', '.css')
                  and f.name not in APPROVED_PROD_ASSETS]
    if unreviewed:
        raise RuntimeError(f'UNREVIEWED JS/CSS in PROD: {unreviewed}')
    if bad_assets:
        raise RuntimeError(f'Forbidden developer assets still in PROD: {bad_assets}')
    bad_ui_markers = (
        'id="adminUiToolButton"', 'id="adminDebugHubToolButton"',
        'id="adminStartSync699ARToolButton"', 'id="adminSvgStudio693RButton"',
        'id="adminThemeBuilder699CButton"', 'id="adminVisualDebugToolButton"',
        'id="adminFpsToggle691BP"', 'id="adminStartSync699ARView"',
        'id="adminSvgStudio693RView"',
    )
    for marker in bad_ui_markers:
        if marker in html:
            raise RuntimeError(f'Developer UI leaked into PROD: {marker}')
    if ('registrujNouzovyDebug5x' in admin or 'POVOLIT_NOUZOVY_DEBUG_5X' in admin
            or 'isAllowed: () => jeAdmin === true' not in admin):
        raise RuntimeError('PROD admin gate / emergency unlock is unsafe')
    if 'fpsEnabled691BP = false; // PROD 699D' not in admin:
        raise RuntimeError('PROD persistent FPS monitor is not disabled')
    required = (
        'build-version.js', 'script.js', 'editorCoreV2.js', 'sync.js', 'storage.js',
        'lubaKeyboard.js', 'lubaKeyboardPreview691BJ.js',
        'mobileHeader693J.js', 'planner.js', 'reminders.js',
        'theme.css', 'debugMobileGenerated.css', 'debugTabletGenerated.css',
        'debugDesktopGenerated.css', 'adminDashboard.js',
    )
    missing = [f for f in required if not (web / f).exists()]
    if missing:
        raise RuntimeError(f'Required runtime assets missing from PROD: {missing}')
    # All static JS/CSS references must point to packaged files. Inline dynamic
    # build-version.js uses document.write; it is included in required runtime.
    refs = re.findall(r'<(?:script|link)\b[^>]*\b(?:src|href)=[\'"]([^\'"]+)[\'"]', html, re.I)
    local_reset = web / 'local-reset.html'
    if local_reset.is_file():
        # A second HTML entrypoint must obey the same asset policy.
        refs += re.findall(r'<(?:script|link)\b[^>]*\b(?:src|href)=[\'\"]([^\'\"]+)[\'\"]',
                           local_reset.read_text(encoding='utf-8'), re.I)
    for uri in refs:
        parsed = urlsplit(uri)
        if parsed.scheme or uri.startswith('//') or parsed.path.startswith('/'):
            continue
        filename = parsed.path
        if filename.endswith(('.js', '.css')) and filename not in APPROVED_PROD_ASSETS:
            raise RuntimeError(f'index.html loads unreviewed PROD asset: {filename}')
        if (filename.endswith(('.js', '.css')) and not (web / filename).is_file()):
            raise RuntimeError(f'index.html refers to missing packaged asset: {filename}')
    if (web / 'lubaAutoTester.js').exists():
        raise RuntimeError('AutoTester unexpectedly packaged')
    # 699D-H: Fail closed if the legacy strip could reappear in PROD.
    if '<div id="syncTrafficBar" class="syncTrafficBar" data-sync-active="0" aria-live="polite" hidden style="display:none !important">' not in html:
        raise RuntimeError('PROD 699D-H: legacy RX/TX/E panel is not hidden')
    if 'id="syncStatusText"' not in html:
        raise RuntimeError('PROD 699D-H: syncStatusText removed with legacy panel')
    verify_critical_runtime(web, html)
    print('[PROD 699D] Web guard: PASS (developer assets absent; core assets preserved)')



def verify_critical_runtime(web: Path, html: str) -> None:
    """699D-E: fail-closed guards for E2E onboarding and conflict hotfix.

    Static release checks, NOT a substitute for login/sync testing on a fresh
    Android device. Never read credentials or user data, only bundled source.
    """
    required_scripts = (
        "supabaseClient.js", "secret.js", "mediaCrypto.js", "e2eCore.js",
        "e2eNotesCrypto.js", "e2eDeviceGuard688T.js", "sync.js",
    )
    for name in required_scripts:
        if not (web / name).is_file():
            raise RuntimeError(f"PROD 699D-E: missing required E2E/sync asset {name}")
        # A file existing in the APK is not enough: index.html must load it.
        script_tag = re.compile(
            r'<script\b[^>]*\bsrc=[\'"]' + re.escape(name) +
            r'(?:\?[^\'"]*)?[\'"][^>]*>', re.I,
        )
        if not script_tag.search(html):
            raise RuntimeError(f"PROD 699D-E: index.html does not load {name}")

    auth = (web / "supabaseClient.js").read_text(encoding="utf-8")
    required_auth_markers = (
        "await maUcetNastaveneHlavniHeslo(user?.id);",
        "if (maHlavniHeslo === false) {",
        'rezim: "vytvorit"',
        "if (maHlavniHeslo === true) {",
        "await gate.overAktualnost(user.id, { vynutit: true })",
        "await maZarizeniPripravenyMediaKlic();",
        "if (!mediaKlicPripraven) {",
        'rezim: "zarizeni"',
    )
    for marker in required_auth_markers:
        if marker not in auth:
            raise RuntimeError(f"PROD 699D-E: mandatory E2E login gate changed: {marker}")

    sync = (web / "sync.js").read_text(encoding="utf-8")
    required_conflict_markers = (
        'kopie.storageScope = "local";',
        'if (note.storageScope !== "local") {',
        "699D-D CONFLICT LOCAL-ONLY",
        "699D-D TARGET META-ONLY SKIP",
    )
    for marker in required_conflict_markers:
        if marker not in sync:
            raise RuntimeError(f"PROD 699D-E: 699D-D sync safety hotfix is missing: {marker}")

    # The old targeted path uploaded the newly generated conflict copy again.
    # This would redistribute the duplicates to other signed-in devices.
    resolver = sync.split("async function vyresCilenyKonfliktBeznePoznamkyV2(", 1)
    if len(resolver) != 2:
        raise RuntimeError("PROD 699D-E: targeted conflict resolver missing")
    resolver = resolver[1].split("/*\n * OPRAVA JIŽ VZNIKLÝCH LEGACY DUPLIKÁTŮ", 1)[0]
    if "await uploadLocalNoteToSupabase(" in resolver:
        raise RuntimeError("PROD 699D-E: conflict copy cloud re-upload reintroduced")

    print("[PROD 699D-E] PASS: mandatory E2E password-onboarding and 699D-D conflict protection present")


def verify_android(android: Path) -> None:
    main = (android / MAIN_ACTIVITY).read_text(encoding='utf-8')
    if 'LubaNoteNativeTesterPlugin' in main or (android / NATIVE_TESTER).exists():
        raise RuntimeError('Native AutoTester leaked into PROD')
    if 'registerPlugin(LubaNoteCutoutDiagnostic693I.class);' not in main:
        raise RuntimeError('Screen cutout protection accidentally removed')
    gradle = (android / 'app/build.gradle').read_text(encoding='utf-8')
    if not re.search(r'(?m)^\s*versionCode\s+[1-9]\d+\s*$', gradle):
        raise RuntimeError('Android versionCode was not upgraded')
    print('[PROD 699D] Android guard: PASS (native AutoTester absent; cutout plugin retained)')


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--stage', choices=['web', 'android', 'verify'], required=True)
    parser.add_argument('--web', type=Path, default=Path('www'))
    parser.add_argument('--android', type=Path, default=Path('android'))
    parser.add_argument('--version-code', type=int)
    parser.add_argument('--version-name')
    a = parser.parse_args()
    if a.stage == 'web':
        stage_web(a.web)
    elif a.stage == 'android':
        if a.version_code is None or a.version_name is None:
            parser.error('--version-code and --version-name required for stage android')
        stage_android(a.android, a.version_code, a.version_name)
    else:
        verify_web(a.web)
        verify_android(a.android)


if __name__ == '__main__':
    main()
