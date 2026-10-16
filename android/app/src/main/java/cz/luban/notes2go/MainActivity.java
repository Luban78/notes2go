package cz.luban.notes2go;

import android.content.Context;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.ActionMode;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.inputmethod.InputMethodManager;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

  private static final long FULLSCREEN_OBNOVA_ZPOZDENI_MS = 180L;
  private int lubaImeResumeGenerace = 0;

  // 683BI: pasivni rozpoznani tahu od horni hrany. Android muze systemovy
  // tah zachytit sam, proto jde pouze o doplnek k 683BH (WindowInsets).
  // Dotyky nikdy nekonzumujeme ani neblokujeme.
  private float lubaHorniGestoStartX = -1f;
  private float lubaHorniGestoStartY = -1f;
  private boolean lubaHorniGestoOhlaseno = false;

  private void oznamHorniGestoProHodiny() {
    try {
      if (getBridge() == null || getBridge().getWebView() == null) return;
      getBridge().getWebView().evaluateJavascript(
        "window.dispatchEvent(new Event('lubanote:android-top-edge-swipe'));",
        null
      );
    } catch (RuntimeException ignored) {
      // Nevyzadujeme zivotaschopne WebView pri odchodu z aplikace.
    }
  }

  @Override
  public boolean dispatchTouchEvent(MotionEvent event) {
    final int akce = event.getActionMasked();
    final float hustota = getResources().getDisplayMetrics().density;
    if (akce == MotionEvent.ACTION_DOWN) {
      // 24dp je tolerance pro zacatek tahu blizko horni hrany;
      // 0-10px by mohlo byt pri ruznych hustotach neproveditelne.
      lubaHorniGestoStartY = event.getRawY() <= 24f * hustota
          ? event.getRawY() : -1f;
      lubaHorniGestoStartX = event.getRawX();
      lubaHorniGestoOhlaseno = false;
    } else if (akce == MotionEvent.ACTION_MOVE && lubaHorniGestoStartY >= 0f
        && !lubaHorniGestoOhlaseno) {
      float rozdilY = event.getRawY() - lubaHorniGestoStartY;
      float rozdilX = Math.abs(event.getRawX() - lubaHorniGestoStartX);
      if (rozdilY >= 4f * hustota && rozdilY > rozdilX * 1.5f) {
        lubaHorniGestoOhlaseno = true;
        oznamHorniGestoProHodiny();
      }
    } else if (akce == MotionEvent.ACTION_UP || akce == MotionEvent.ACTION_CANCEL) {
      // Pri prevzeti okrajoveho tahu systemem muze prijit ACTION_CANCEL
      // drive, nez se do nasi Activity doruci dostatecny ACTION_MOVE.
      if (akce == MotionEvent.ACTION_CANCEL && lubaHorniGestoStartY >= 0f
          && !lubaHorniGestoOhlaseno) {
        lubaHorniGestoOhlaseno = true;
        oznamHorniGestoProHodiny();
      }
      lubaHorniGestoStartY = -1f;
      lubaHorniGestoStartX = -1f;
    }
    // Zasadni: system i WebView dostanou udalost beze zmeny.
    return super.dispatchTouchEvent(event);
  }


  // 683BH: pozorovani skutecne viditelnosti transientni systemove listy.
  // Neprebirame WindowInsetsListener u decorView ani WebView (bez zasahu
  // do Capacitor insets, fullscreen layoutu nebo IME).
  private static final long KONTROLA_SYSTEMOVE_LISTY_MS = 150L;
  private final Handler systemovaListaHandler = new Handler(Looper.getMainLooper());
  private boolean kontrolaSystemoveListyBezi = false;
  private Boolean posledniSystemovaListaViditelna = null;
  private final Runnable kontrolaSystemoveListy = new Runnable() {
    @Override
    public void run() {
      if (!kontrolaSystemoveListyBezi) return;
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        View dekor = getWindow().getDecorView();
        WindowInsets insets = dekor.getRootWindowInsets();
        if (insets != null) {
          boolean viditelna = insets.isVisible(WindowInsets.Type.statusBars());
          if (posledniSystemovaListaViditelna == null
              || posledniSystemovaListaViditelna.booleanValue() != viditelna) {
            posledniSystemovaListaViditelna = viditelna;
            posliStavSystemoveListy(viditelna);
          }
        }
      }
      systemovaListaHandler.postDelayed(this, KONTROLA_SYSTEMOVE_LISTY_MS);
    }
  };

  private void posliStavSystemoveListy(boolean viditelna) {
    try {
      if (getBridge() == null || getBridge().getWebView() == null) return;
      getBridge().getWebView().evaluateJavascript(
        "window.dispatchEvent(new CustomEvent('lubanote:android-statusbar-visibility'," +
          "{detail:{visible:" + viditelna + "}}));",
        null
      );
    } catch (RuntimeException ignored) {
      // WebView se muze prave ukoncovat.
    }
  }

  private void spustKontroluSystemoveListy() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R || kontrolaSystemoveListyBezi) return;
    kontrolaSystemoveListyBezi = true;
    posledniSystemovaListaViditelna = null;
    systemovaListaHandler.post(kontrolaSystemoveListy);
  }

  private void zastavKontroluSystemoveListy() {
    kontrolaSystemoveListyBezi = false;
    systemovaListaHandler.removeCallbacks(kontrolaSystemoveListy);
  }

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    registerPlugin(
      LubaNoteBackupExportPlugin.class
    );

    registerPlugin(
      LubaNoteSecretBiometricPlugin.class
    );

    registerPlugin(
      LubaNoteDocumentPlugin.class
    );

    registerPlugin(
      LubaNoteKeyboardStatePlugin.class
    );

    registerPlugin(
      LubaNoteNetworkStatePlugin.class
    );

    registerPlugin(
      LubaNoteTtsPlugin.class
    );

    registerPlugin(
      LubaNoteStickyPlugin.class
    );

    super.onCreate(savedInstanceState);

    nastavFullscreen();

    getWindow().setNavigationBarColor(Color.TRANSPARENT);

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      getWindow().setNavigationBarContrastEnforced(false);
    }

    /*
     * Systémové Android Zpět nejdřív nabídneme webové části LubaNote.
     * Když je otevřený editor, JavaScript použije stejnou logiku jako
     * klávesa Esc na PC. Pokud nic v aplikaci Back nezpracuje, zachováme
     * původní Android chování a Activity zavřeme.
     */
    getOnBackPressedDispatcher().addCallback(
      this,
      new OnBackPressedCallback(true) {
        @Override
        public void handleOnBackPressed() {
          zpracujSystemoveZpet();
        }
      }
    );
  }


  /*
   * LubaNote schovává pouze horní systémovou stavovou lištu.
   * Spodní Android navigace zůstává zachovaná a průhledná stejně jako dřív.
   *
   * Android 11+:
   * používáme moderní WindowInsetsController. Režim transient bars dovolí
   * lištu gestem dočasně zobrazit, ale po zavření se znovu sama schová.
   *
   * Android 10 a starší:
   * ponecháváme legacy systémové flagy, ale doplňujeme IMMERSIVE_STICKY,
   * aby stažení horní lišty trvale nezrušilo fullscreen.
   */
  private void nastavFullscreen() {
    View decorView = getWindow().getDecorView();

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      getWindow().setDecorFitsSystemWindows(false);

      WindowInsetsController controller =
        getWindow().getInsetsController();

      if (controller != null) {
        controller.setSystemBarsBehavior(
          WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        );

        controller.hide(
          WindowInsets.Type.statusBars()
        );
      }

      return;
    }

    decorView.setSystemUiVisibility(
      View.SYSTEM_UI_FLAG_FULLSCREEN
        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
    );
  }


  /*
   * Po návratu z notifikační lišty / systémového dialogu Android někdy ještě
   * krátce dokončuje animaci systémových lišt. Kromě okamžitého nastavení proto
   * fullscreen zopakujeme s malým zpožděním. Tím se systémová animace nemůže
   * stát posledním zápisem a nechat stavovou lištu trvale zobrazenou.
   */
  private void obnovFullscreen() {
    nastavFullscreen();

    View decorView = getWindow().getDecorView();
    decorView.removeCallbacks(this::nastavFullscreen);
    decorView.postDelayed(
      this::nastavFullscreen,
      FULLSCREEN_OBNOVA_ZPOZDENI_MS
    );
  }


  /* 685H – resume bez opakovaneho prelayoutovani celeho okna.
   * Po navratu jsou systemove listy zpravidla stale spravne skryte.
   * Opakovane setDecorFitsSystemWindows(false) + hide() pak muze
   * zbytecne vyvolavat relayout povrchu WebView. Pri focus gain obnovime
   * fullscreen pouze pokud Android skutecne zobrazuje horni listu.
   * Pri onCreate zustava puvodni plna inicializace fullscreen.
   */
  private void obnovFullscreenJenPriViditelneListe685H() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      WindowInsets insets = getWindow().getDecorView().getRootWindowInsets();
      if (insets != null && !insets.isVisible(WindowInsets.Type.statusBars())) {
        ohlasZivotniCyklus685F("685H_FULLSCREEN_ALREADY_HIDDEN");
        return;
      }
      // Pokud insets nejsou k dispozici, zachovame puvodni obnovu.
    }
    obnovFullscreen();
    ohlasZivotniCyklus685F("685H_FULLSCREEN_RESTORED");
  }

  private void pozadejPrekresleni685H() {
    try {
      if (getBridge() == null || getBridge().getWebView() == null) return;
      getBridge().getWebView().postInvalidateOnAnimation();
    } catch (RuntimeException ignored) {
      // Pri obnovovani Activity muze byt WebView teprve znovu pripojene.
    }
  }

  /*
   * FIX 471 – LubaKeyboard používá vlastní panel a systémovou IME nechce.
   * Starý WebView 103 si ale při minimalizaci umí zapamatovat InputConnection
   * a při návratu na zlomek sekundy obnovit Gboard ještě PŘED JavaScriptem.
   *
   * Zásah je záměrně nativní a úzký:
   * - pouze když je v LubaNote zvolená LubaKeyboard;
   * - při odchodu Activity zrušíme focus WebView + schováme IME;
   * - při návratu IME preventivně znovu schováme;
   * - při explicitní volbě systémové klávesnice se nedělá NIC.
   *
   * Fullscreen logika níže zůstává beze změny.
   */
  private int webViewChromeMajor() {
    try {
      if (getBridge() == null || getBridge().getWebView() == null) return 0;
      String ua = getBridge().getWebView().getSettings().getUserAgentString();
      Matcher matcher = Pattern.compile("(?:Chrome|Chromium)/(\\d+)").matcher(ua == null ? "" : ua);
      if (matcher.find()) return Integer.parseInt(matcher.group(1));
    } catch (Exception ignored) {}
    return 0;
  }

  /* PATCH 497 – FIX 471 vznikl pro WebView 103. Na moderním WebView už
     clearFocus() celého WebView při pause/blur ničí browserový caret a může
     rozhazovat InputConnection. Starou cestu proto držíme jen pro <=110. */
  private boolean pouzitLegacyLubaImeLifecycle() {
    int major = webViewChromeMajor();
    if (major > 0) return major <= 110;
    return Build.VERSION.SDK_INT <= Build.VERSION_CODES.S_V2;
  }

  private boolean pouzivaLubaKeyboard() {
    return LubaNoteKeyboardStatePlugin.pouzivaLubaKeyboard(this);
  }

  private void schovejSystemovouImeProLubaKeyboard(boolean zrusitFocusWebView) {
    if (!pouzivaLubaKeyboard()) return;

    boolean legacy = pouzitLegacyLubaImeLifecycle();

    /* PATCH 499 – na moderním WebView schováváme IME jen tehdy, když JS
       potvrdil, že vlastní LubaKeyboard je skutečně otevřená. Nikdy tu
       nemažeme focus ani InputConnection. */
    if (!legacy && !LubaNoteKeyboardStatePlugin.jeImeGuardAktivni()) return;

    View decorView = getWindow().getDecorView();

    if (legacy && zrusitFocusWebView && getBridge() != null && getBridge().getWebView() != null) {
      getBridge().getWebView().clearFocus();
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      WindowInsetsController controller = getWindow().getInsetsController();
      if (controller != null) controller.hide(WindowInsets.Type.ime());
    }

    InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
    if (imm != null) {
      View tokenView =
        getBridge() != null && getBridge().getWebView() != null
          ? getBridge().getWebView()
          : decorView;
      imm.hideSoftInputFromWindow(tokenView.getWindowToken(), 0);
    }
  }

  private void zrusNaplanovaneLubaImeHide() {
    lubaImeResumeGenerace++;
  }

  private void naplanujModerniLubaImeHidePoNavratu() {
    if (pouzitLegacyLubaImeLifecycle()) return;
    if (!pouzivaLubaKeyboard() || !LubaNoteKeyboardStatePlugin.jeImeGuardAktivni()) return;

    final int generace = ++lubaImeResumeGenerace;
    final long[] zpozdeni = new long[] { 0L, 90L, 220L, 480L };
    View decorView = getWindow().getDecorView();

    for (long ms : zpozdeni) {
      decorView.postDelayed(() -> {
        if (generace != lubaImeResumeGenerace) return;
        if (!pouzivaLubaKeyboard() || !LubaNoteKeyboardStatePlugin.jeImeGuardAktivni()) return;
        schovejSystemovouImeProLubaKeyboard(false);
      }, ms);
    }
  }

  /* 685F: Pouze diagnostický most Native -> Start / sync / síť.
   * Nezasahuje do WebView vrstvy, fullscreen ani klávesnice. */
  private void ohlasZivotniCyklus685F(String faze) {
    try {
      if (getBridge() == null || getBridge().getWebView() == null) return;
      View web = getBridge().getWebView();
      View decor = getWindow().getDecorView();
      String javascript = "window.dispatchEvent(new CustomEvent('lubanote:native-lifecycle'," +
        "{detail:{phase:'" + faze + "'," +
        "uptimeMs:" + android.os.SystemClock.elapsedRealtime() + "," +
        "epochMs:" + System.currentTimeMillis() + "," +
        "webShown:" + web.isShown() + "," +
        "webVisibility:" + web.getVisibility() + "," +
        "decorFocus:" + decor.hasWindowFocus() + "," +
        "webHardware:" + web.isHardwareAccelerated() + "}}));";
      getBridge().getWebView().evaluateJavascript(javascript, null);
    } catch (RuntimeException ignored) {
      // Na pozadí může být WebView už pozastavené.
    }
  }

  @Override
  public void onStart() {
    super.onStart();
    ohlasZivotniCyklus685F("ON_START");
  }

  @Override
  public void onPause() {
    ohlasZivotniCyklus685F("ON_PAUSE");
    zastavKontroluSystemoveListy();
    // Pri prekryti celym System UI jsou hodiny pod systemovou listou skryte.
    posliStavSystemoveListy(true);
    zrusNaplanovaneLubaImeHide();
    /* Legacy <=110 dál ruší focus; moderní WebView pouze schová IME bez
       zásahu do browserového caretu/InputConnection. */
    schovejSystemovouImeProLubaKeyboard(true);
    super.onPause();
  }

  @Override
  public void onStop() {
    ohlasZivotniCyklus685F("ON_STOP");
    zrusNaplanovaneLubaImeHide();
    schovejSystemovouImeProLubaKeyboard(true);
    super.onStop();
  }

  @Override
  public void onResume() {
    super.onResume();
    ohlasZivotniCyklus685F("ON_RESUME");
    schovejSystemovouImeProLubaKeyboard(false);
    naplanujModerniLubaImeHidePoNavratu();
    // 685H: onResume uz neprovadi vynuceny fullscreen relayout.
    // Pripadne odkrytou horni listu vyridi onWindowFocusChanged.
    pozadejPrekresleni685H();
    ohlasZivotniCyklus685F("685H_ON_RESUME_REPAINT");
    spustKontroluSystemoveListy();
  }


  /* 683BG – pouze signal pro horni datum/cas. Pri otevreni Android
   * notifikacni listy okno ztrati focus. WebView se jen dozvi stav;
   * fullscreen, IME ani Android Back zde nijak nemenime. */
  private void oznamFocusProHodiny(boolean maFokus) {
    try {
      if (getBridge() == null || getBridge().getWebView() == null) return;
      getBridge().getWebView().evaluateJavascript(
        "window.dispatchEvent(new CustomEvent('lubanote:android-window-focus'," +
          "{detail:{focused:" + maFokus + "}}));",
        null
      );
    } catch (RuntimeException ignored) {
      // Pri ukoncovani Activity muze byt WebView uz odpojene.
    }
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    oznamFocusProHodiny(hasFocus);

    ohlasZivotniCyklus685F(hasFocus ? "FOCUS_GAIN" : "FOCUS_LOSS");
    if (hasFocus) {
      schovejSystemovouImeProLubaKeyboard(false);
      naplanujModerniLubaImeHidePoNavratu();
      obnovFullscreenJenPriViditelneListe685H();
      pozadejPrekresleni685H();
    } else {
      zrusNaplanovaneLubaImeHide();
    }
  }


  private void zpracujSystemoveZpet() {
    if (getBridge() == null || getBridge().getWebView() == null) {
      finish();
      return;
    }

    getBridge().getWebView().evaluateJavascript(
      "(function(){try{" +
        "return window.LubaNoteZpracujAndroidZpet" +
        " ? window.LubaNoteZpracujAndroidZpet()" +
        " : false;" +
      "}catch(error){console.error(error);return false;}})();",
      vysledek -> {
        if (!"true".equals(vysledek)) {
          finish();
        }
      }
    );
  }


  @Override
  public void onActionModeStarted(ActionMode mode) {
    super.onActionModeStarted(mode);

    if (mode == null) {
      return;
    }

    /*
     * Zachová označení textu a úchyty,
     * ale odstraní systémovou nabídku Androidu:
     * Vyjmout / Kopírovat / Vložit / Sdílet...
     */
    mode.getMenu().clear();
  }
}
