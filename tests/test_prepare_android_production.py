#!/usr/bin/env python3
"""699D smoke tests; run with: python3 -m unittest discover -s tests -p 'test_prepare_android_production.py'"""
from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
SCRIPT = HERE / 'scripts/prepare-android-production.py'
spec = importlib.util.spec_from_file_location('prepare_android_production', SCRIPT)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

CORE = (
    'build-version.js', 'script.js', 'editorCoreV2.js', 'sync.js', 'storage.js',
    'lubaKeyboard.js', 'lubaKeyboardPreview691BJ.js', 'mobileHeader693J.js',
    'planner.js', 'reminders.js', 'theme.css', 'debugMobileGenerated.css',
    'debugTabletGenerated.css', 'debugDesktopGenerated.css', 'adminDashboard.js',
    'supabaseClient.js', 'secret.js', 'mediaCrypto.js', 'e2eCore.js',
    'e2eNotesCrypto.js', 'e2eDeviceGuard688T.js',
)


def mock_html():
    buttons = ''.join(f'<button id="{name}" class="adminToolCard"><span>X</span></button>\n'
                      for name in mod.REMOVE_BUTTON_IDS)
    sections = ''.join(
        f'<section id="{name}"><div><section><p>inner</p></section></div></section>\n'
        for name in mod.REMOVE_SECTION_IDS
    )
    return f'''<!doctype html><html><head>
<link rel="stylesheet" href="theme.css?v=1">
<link rel="stylesheet" href="debugMobileGenerated.css">
<link rel="stylesheet" href="lubaAutoTester.css?v=1">
</head><body>
{buttons}{sections}
<script src="startupDiagnostics.js?v=1"></script>
<script src="lubaAutoTester.js?v=2"></script>
<script src="script.js?v=1"></script>
<script src="supabaseClient.js?v=1"></script>
<script src="secret.js?v=1"></script>
<script src="mediaCrypto.js?v=1"></script>
<script src="e2eCore.js?v=1"></script>
<script src="e2eNotesCrypto.js?v=1"></script>
<script src="e2eDeviceGuard688T.js?v=1"></script>
<script src="sync.js?v=1"></script>
<script src="adminDashboard.js?v=1"></script>
</body></html>'''


def mock_admin():
    return '''(() => {
  const uiTlacitko = document.getElementById('adminUiToolButton');
  const visualDebugTlacitko = document.getElementById('adminVisualDebugToolButton');
  const debugHubTlacitko = document.getElementById('adminDebugHubToolButton');
  if (
    !uiTlacitko ||
    !visualDebugTlacitko ||
    !debugHubTlacitko ||
    !menuTlacitko
  ) return;
  let jeAdmin = false;
    fpsEnabled691BP = localStorage.getItem(FPS_VISIBLE_KEY_691BP) === "1";
  const POVOLIT_NOUZOVY_DEBUG_5X = true;
  const NOUZOVY_DEBUG_OKNO_MS = 2800;
  let nouzovyDevDebug = false;
  /* debug gate */
  window.LubaNoteAdminTools = {
    isAllowed: () =>
      jeAdmin === true ||
      (POVOLIT_NOUZOVY_DEBUG_5X && nouzovyDevDebug === true),
    isEmergencyDevUnlock: () =>
      POVOLIT_NOUZOVY_DEBUG_5X && nouzovyDevDebug === true
  };
  nastavBarvyVlastnihoVyberu(ulozenyRezim);
  /* PATCH 683B – přesný roh + zachování rozběhnuté diagnostiky.
   * Gesture-only code. */
  function registrujNouzovyDebug5x() {}
  menuTlacitko.addEventListener('click', function() {});
  uiTlacitko.addEventListener("click", () => {});
  visualDebugTlacitko.addEventListener("click", fn);
  debugHubTlacitko.addEventListener("click", fn);
  registrujNouzovyDebug5x();
})();'''


class ProductionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.web = root / 'www'
        self.web.mkdir()
        for name in CORE:
            (self.web / name).write_text('/* placeholder */', encoding='utf-8')
        # Critical release guards are tested against the actual repository
        # source, rather than fabricated code that could pass after a regression.
        for name in ('sync.js', 'supabaseClient.js'):
            (self.web / name).write_bytes((HERE / name).read_bytes())
        (self.web / 'index.html').write_text(mock_html(), encoding='utf-8')
        (self.web / 'adminDashboard.js').write_text(mock_admin(), encoding='utf-8')
        for name in ('lubaAutoTester.css', 'lubaAutoTester.js', 'startupDiagnostics.js',
                     'lubaLayoutAudit699BGA.js', 'themeBuilder699C.js'):
            (self.web / name).write_text('/* DEV ONLY */')
        self.android = root / 'android'
        path = self.android / mod.MAIN_ACTIVITY
        path.parent.mkdir(parents=True)
        path.write_text('''class MainActivity {
    registerPlugin(LubaNoteCutoutDiagnostic693I.class);
    registerPlugin(
      LubaNoteNativeTesterPlugin.class
    );
}''')
        path = self.android / mod.NATIVE_TESTER
        path.write_text('class LubaNoteNativeTesterPlugin {}')
        gradle = self.android / 'app/build.gradle'
        gradle.write_text('''android {
  defaultConfig {
    applicationId "cz.luban.notes2go"
    versionCode 1
    versionName "1.0"
  }
}''')

    def tearDown(self):
        self.temp.cleanup()

    def test_stage_preserves_active_runtime_but_removes_developer_assets(self):
        mod.stage_web(self.web)
        mod.stage_android(self.android, 100001, '1.0.1')
        mod.verify_web(self.web)
        mod.verify_android(self.android)
        html = (self.web / 'index.html').read_text()
        self.assertIn('debugMobileGenerated.css', html)
        self.assertIn('id="adminUiView"', html)
        self.assertNotIn('id="adminUiToolButton"', html)
        self.assertTrue((self.web / 'lubaKeyboardPreview691BJ.js').exists())
        self.assertFalse((self.web / 'lubaAutoTester.js').exists())
        admin = (self.web / 'adminDashboard.js').read_text()
        self.assertNotIn('registrujNouzovyDebug5x', admin)
        self.assertIn('isAllowed: () => jeAdmin === true', admin)
        self.assertIn('fpsEnabled691BP = false', admin)
        gradle = (self.android / 'app/build.gradle').read_text()
        self.assertIn('versionCode 100001', gradle)
        self.assertIn('versionName "1.0.1"', gradle)

    def test_dev_tag_with_attributes_is_removed(self):
        p = self.web / 'index.html'
        p.write_text(p.read_text().replace('<script src="lubaAutoTester.js?v=2"></script>',
                                          '<script defer data-origin="custom" src="lubaAutoTester.js?v=2"></script>'))
        # Supported attr order still removes asset, keeps guard active.
        mod.stage_web(self.web)
        self.assertFalse((self.web / 'lubaAutoTester.js').exists())

    def test_unreviewed_asset_fails_closed(self):
        (self.web / 'newUnknownDeveloperTool.js').write_text('/* unknown */')
        with self.assertRaisesRegex(RuntimeError, 'UNREVIEWED'):
            mod.stage_web(self.web)

    def test_missing_required_runtime_fails_closed(self):
        (self.web / 'sync.js').unlink()
        with self.assertRaisesRegex(RuntimeError, 'Required runtime assets'):
            mod.stage_web(self.web)

    def test_production_missing_e2e_script_fails_closed(self):
        p = self.web / 'index.html'
        p.write_text(p.read_text().replace(
            '<script src="e2eDeviceGuard688T.js?v=1"></script>', ''))
        with self.assertRaisesRegex(RuntimeError, 'does not load e2eDeviceGuard688T.js'):
            mod.stage_web(self.web)

    def test_production_lost_master_password_gate_fails_closed(self):
        p = self.web / 'supabaseClient.js'
        p.write_text(p.read_text().replace(
            'await maZarizeniPripravenyMediaKlic();',
            'await simulatedBypassOfMediaKey();'))
        with self.assertRaisesRegex(RuntimeError, 'mandatory E2E login gate changed'):
            mod.stage_web(self.web)

    def test_production_old_sync_hotfix_fails_closed(self):
        p = self.web / 'sync.js'
        p.write_text(p.read_text().replace('kopie.storageScope = "local";',
                                           'kopie.storageScope = "cloud";'))
        with self.assertRaisesRegex(RuntimeError, '699D-D sync safety hotfix is missing'):
            mod.stage_web(self.web)

    def test_production_conflict_copy_reupload_fails_closed(self):
        p = self.web / 'sync.js'
        data = p.read_text()
        target = 'async function vyresCilenyKonfliktBeznePoznamkyV2('
        self.assertEqual(data.count(target), 1)
        p.write_text(data.replace(target, target + '\n  /* Regression fixture */\n  await uploadLocalNoteToSupabase(kopie);\n', 1))
        with self.assertRaisesRegex(RuntimeError, 'conflict copy cloud re-upload'):
            mod.stage_web(self.web)

    def test_native_tester_missing_fails_closed(self):
        (self.android / mod.NATIVE_TESTER).unlink()
        with self.assertRaisesRegex(RuntimeError, 'Missing native tester source'):
            mod.stage_android(self.android, 100001, '1.0.1')

    def test_screen_cutout_is_explicitly_retained(self):
        (self.android / mod.MAIN_ACTIVITY).write_text('''class MainActivity {\n    registerPlugin(\n      LubaNoteNativeTesterPlugin.class\n    );\n}''')
        with self.assertRaisesRegex(RuntimeError, 'Screen cutout protection'):
            mod.stage_android(self.android, 100001, '1.0.1')


if __name__ == '__main__':
    unittest.main()
