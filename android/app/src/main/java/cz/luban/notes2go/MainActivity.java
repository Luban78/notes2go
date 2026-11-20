package cz.luban.notes2go;

import android.app.Dialog;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Bitmap;
import android.graphics.Rect;
import android.graphics.Typeface;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.GradientDrawable;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.PixelCopy;
import android.view.ViewGroup;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.ActionMode;
import android.view.MotionEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.inputmethod.InputMethodManager;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONTokener;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

  /* 699D-BZ: nativni Back potvrzeni ma vzhled LubaNote, ne Android AlertDialog. */
  private boolean potvrzeniUkonceniOtevrene699DBY = false;

  private int px699DBZ(float dp) {
    return Math.round(dp * getResources().getDisplayMetrics().density);
  }

  private GradientDrawable pozadi699DBZ(int barva, int okraj, float radius) {
    GradientDrawable pozadi = new GradientDrawable();
    pozadi.setColor(barva);
    pozadi.setCornerRadius(px699DBZ(radius));
    pozadi.setStroke(px699DBZ(1), okraj);
    return pozadi;
  }

  private int cssBarva699DBZ(String hodnota, int vychozi) {
    if (hodnota == null) return vychozi;
    String text = hodnota.trim();
    try {
      if (text.startsWith("#")) return Color.parseColor(text);
      // getComputedStyle() muze vratit rgb(...) / rgba(...).
      Matcher match = Pattern.compile(
        "rgba?\\(\\s*(\\d+)\\s*[, ]+\\s*(\\d+)\\s*[, ]+\\s*(\\d+)"
      ).matcher(text);
      if (match.find()) {
        return Color.rgb(
          Integer.parseInt(match.group(1)),
          Integer.parseInt(match.group(2)),
          Integer.parseInt(match.group(3))
        );
      }
    } catch (RuntimeException ignored) {}
    return vychozi;
  }

  private void potvrdUkonceni699DBY() {
    if (isFinishing() || potvrzeniUkonceniOtevrene699DBY) return;
    potvrzeniUkonceniOtevrene699DBY = true;

    final int[] barvy = {
      Color.rgb(13, 43, 58),    // --color-surface
      Color.rgb(250, 252, 255), // --color-text
      Color.rgb(177, 199, 212), // --color-text-secondary
      Color.rgb(50, 89, 106),   // --color-border
      Color.rgb(29, 182, 197),  // --color-accent
      Color.rgb(6, 34, 45)      // --color-on-accent
    };
    final Dialog dialog = new Dialog(this);
    dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);

    LinearLayout obsah = new LinearLayout(this);
    obsah.setOrientation(LinearLayout.VERTICAL);
    obsah.setPadding(px699DBZ(22), px699DBZ(24), px699DBZ(22), px699DBZ(22));

    TextView nadpis = new TextView(this);
    nadpis.setText("Ukončit LubaNote?");
    nadpis.setTextSize(22);
    nadpis.setTypeface(null, Typeface.BOLD);
    nadpis.setGravity(Gravity.CENTER);
    obsah.addView(nadpis, new LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

    TextView popis = new TextView(this);
    popis.setText("Opravdu chceš LubaNote ukončit?");
    popis.setTextSize(16);
    popis.setGravity(Gravity.CENTER);
    popis.setLineSpacing(px699DBZ(3), 1f);
    LinearLayout.LayoutParams popisParams = new LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    popisParams.topMargin = px699DBZ(12);
    popisParams.bottomMargin = px699DBZ(24);
    obsah.addView(popis, popisParams);

    LinearLayout akce = new LinearLayout(this);
    akce.setOrientation(LinearLayout.HORIZONTAL);
    TextView zustat = new TextView(this);
    zustat.setText("Zůstat");
    TextView ukoncit = new TextView(this);
    ukoncit.setText("Ukončit");
    for (TextView tlacitko : new TextView[] { zustat, ukoncit }) {
      tlacitko.setTextSize(16);
      tlacitko.setTypeface(null, Typeface.BOLD);
      tlacitko.setGravity(Gravity.CENTER);
      tlacitko.setClickable(true);
      tlacitko.setFocusable(true);
      LinearLayout.LayoutParams parametry = new LinearLayout.LayoutParams(
        0, px699DBZ(48), 1f);
      if (tlacitko == ukoncit) parametry.leftMargin = px699DBZ(10);
      akce.addView(tlacitko, parametry);
    }
    obsah.addView(akce);

    Runnable pouzijBarvy = () -> {
      obsah.setBackground(pozadi699DBZ(barvy[0], barvy[3], 22f));
      nadpis.setTextColor(barvy[1]);
      popis.setTextColor(barvy[2]);
      zustat.setTextColor(barvy[1]);
      zustat.setBackground(pozadi699DBZ(barvy[0], barvy[3], 13f));
      ukoncit.setTextColor(barvy[5]);
      ukoncit.setBackground(pozadi699DBZ(barvy[4], barvy[4], 13f));
    };
    pouzijBarvy.run();
    zustat.setOnClickListener(v -> dialog.dismiss());
    ukoncit.setOnClickListener(v -> {
      dialog.dismiss();
      finish();
    });

    dialog.setContentView(obsah);
    dialog.setOnDismissListener(d -> potvrzeniUkonceniOtevrene699DBY = false);
    dialog.show();
    Window okno = dialog.getWindow();
    if (okno != null) {
      okno.setBackgroundDrawableResource(android.R.color.transparent);
      okno.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
      okno.setDimAmount(0.58f);
      int sirka = Math.min(
        getResources().getDisplayMetrics().widthPixels - px699DBZ(32),
        px699DBZ(420));
      okno.setLayout(sirka, ViewGroup.LayoutParams.WRAP_CONTENT);
    }

    // HTML tema je zdrojem barev; nativni modal ho respektuje i po prepnuti
    // Theme Builderu. Pri nedostupnem WebView zustane bezpecna Ocean paleta.
    if (getBridge() != null && getBridge().getWebView() != null) {
      try {
        getBridge().getWebView().evaluateJavascript(
          "(function(){const s=getComputedStyle(document.body);return JSON.stringify([" +
            "'--color-surface','--color-text','--color-text-secondary'," +
            "'--color-border','--color-accent','--color-on-accent'" +
          "].map(k=>s.getPropertyValue(k).trim()))})()",
          vysledek -> {
            if (!dialog.isShowing() || isFinishing()) return;
            try {
              Object rozbalene = new JSONTokener(vysledek).nextValue();
              JSONArray pole = new JSONArray(String.valueOf(rozbalene));
              for (int i = 0; i < barvy.length && i < pole.length(); i++) {
                barvy[i] = cssBarva699DBZ(pole.optString(i, ""), barvy[i]);
              }
              pouzijBarvy.run();
            } catch (RuntimeException ignored) {}
          }
        );
      } catch (RuntimeException ignored) {}
    }
  }

  /* 685Q: Pouze RAM, nikdy soubor. Snímek celého okna z doby odchodu.
   * Overlay je pasivní (ViewOverlay), neblokuje dotyky ani WebView.
   * Zobrazujeme jen po delší pauze, odstranění má pevný timeout. */
  private Bitmap snimekPredPozadim685Q;
  private BitmapDrawable prekryti685Q;
  private long casPozadi685Q;
  private int generace685Q = 0;
  private final Handler handler685Q = new Handler(Looper.getMainLooper());

  private void uklidPrekryti685Q() {
    if (prekryti685Q != null) {
      try { getWindow().getDecorView().getOverlay().remove(prekryti685Q); }
      catch (RuntimeException ignored) {}
      prekryti685Q = null;
    }
  }

  private void uklidSnimek685Q() {
    uklidPrekryti685Q();
    if (snimekPredPozadim685Q != null) {
      snimekPredPozadim685Q.recycle();
      snimekPredPozadim685Q = null;
    }
  }

  private void zachytPredPozadim685Q() {
    final int gen = ++generace685Q;
    uklidSnimek685Q();
    final View decor = getWindow().getDecorView();
    final int w = decor.getWidth(), h = decor.getHeight();
    if (w < 100 || h < 100 || Build.VERSION.SDK_INT < 26) return;
    // Poloviční rozlišení: krátkodobě ~1/4 paměti, bez software WebView.
    final Bitmap bmp;
    try { bmp = Bitmap.createBitmap(Math.max(1,w/2), Math.max(1,h/2), Bitmap.Config.ARGB_8888); }
    catch (OutOfMemoryError ignored) { return; }
    try {
      PixelCopy.request(getWindow(), bmp, result -> {
        if (gen != generace685Q || result != PixelCopy.SUCCESS) {
          bmp.recycle();
          return;
        }
        snimekPredPozadim685Q = bmp;
      }, handler685Q);
    } catch (RuntimeException ignored) { bmp.recycle(); }
  }

  private void zobrazPrekrytiPriNavratu685Q() {
    if (snimekPredPozadim685Q == null || casPozadi685Q == 0 ||
        SystemClock.elapsedRealtime() - casPozadi685Q < 15000L) {
      uklidSnimek685Q();
      return;
    }
    final int gen = ++generace685Q;
    final View decor = getWindow().getDecorView();
    final Bitmap bmp = snimekPredPozadim685Q;
    final BitmapDrawable obraz = new BitmapDrawable(getResources(), bmp);
    obraz.setBounds(0, 0, decor.getWidth(), decor.getHeight());
    prekryti685Q = obraz;
    decor.getOverlay().add(obraz);
    // Neodstraňovat pouze na callback: další snímek se vykreslí až po něm.
    final Runnable uklid = () -> {
      if (gen == generace685Q) uklidSnimek685Q();
    };
    handler685Q.postDelayed(uklid, 1400L); // nouzové odstranění vždy
    try {
      if (getBridge() != null && getBridge().getWebView() != null) {
        getBridge().getWebView().postVisualStateCallback(gen, new android.webkit.WebView.VisualStateCallback() {
          @Override public void onComplete(long requestId) {
            if (gen != generace685Q) return;
            handler685Q.postDelayed(uklid, 180L);
          }
        });
      }
    } catch (RuntimeException ignored) {}
  }

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
    registerPlugin(LubaNotePngExportPlugin.class);
    registerPlugin(LubaNoteSvgFilePlugin.class);
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

    // 693I: pouze vyzadana diagnostika vyrezu displeje (read-only).
    registerPlugin(LubaNoteCutoutDiagnostic693I.class);

    registerPlugin(
      LubaNoteTtsPlugin.class
    );

    registerPlugin(
      LubaNoteStickyPlugin.class
    );

    // 690R: nativni testovaci vstup pouze do docasne plochy AutoTesteru.
    registerPlugin(
      LubaNoteNativeTesterPlugin.class
    );

    // 692L: FCM token bridge only; no push reception or server writes.
    registerPlugin(
      LubaNoteFcmTokenPlugin.class
    );

    super.onCreate(savedInstanceState);

    // 699AB: Cold start from a native reminder. Save the tap before WebView
    // scripts boot; the existing FCM bridge will consume the pending record.
    if (prijmiPriamyKlikPripominky699AB(getIntent())) {
      predejKlikNaPripominku696X();
    }

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

  /* 696X: System notification tap can return to an ALREADY running singleTask
   * MainActivity. The 693G intent marker existed, but no onNewIntent handler
   * delivered it to the WebView, so the snooze sheet never opened.
   * Only the marker crosses this bridge; the native pending record retains
   * noteId/at/token and is acknowledged by reminders.js after successful UI. */
  private void predejKlikNaPripominku696X() {
    // 699Z: After a notification tap the existing WebView can still be paused
    // while Android is closing the notification shade / returning focus.
    // A single evaluateJavascript after 80 ms can be lost. Retry only the
    // signal, never the alarm or notification. 699Y makes the token idempotent.
    for (long delay699Z : new long[]{80L, 500L, 1500L}) {
      handler685Q.postDelayed(() -> {
        try {
          if (getBridge() == null || getBridge().getWebView() == null) return;
          getBridge().getWebView().evaluateJavascript(
            "window.dispatchEvent(new Event('lubanote:native-reminder-tap-693G'));",
            null
          );
        } catch (RuntimeException ignored) {
          // Native pending token survives; the later pulses can retry.
        }
      }, delay699Z);
    }
  }

  // 699AB: The notification now opens the already-running singleTask
  // MainActivity directly. Persist the same 692T pending payload as the
  // original non-exported trampoline; no note content or E2E data crosses.
  // Consume the marker once so an ordinary resume cannot replay the tap.
  private boolean prijmiPriamyKlikPripominky699AB(Intent intent) {
    if (intent == null ||
        !intent.getBooleanExtra("lubanote_remote_direct_tap_699AB",false)) return false;
    intent.removeExtra("lubanote_remote_direct_tap_699AB");
    String noteId=intent.getStringExtra(LubaNoteRemoteOpen692T.NOTE);
    long at=intent.getLongExtra(LubaNoteRemoteOpen692T.AT,0L);
    intent.removeExtra(LubaNoteRemoteOpen692T.NOTE);
    intent.removeExtra(LubaNoteRemoteOpen692T.AT);
    if (noteId == null || !noteId.matches("[a-zA-Z0-9_:-]{1,128}") || at <= 0L)
      return false;
    // The exported launcher Activity must not accept fabricated reminder IDs.
    if (!LubaNoteRemoteAlarm692O.isDeliveredTap699AB(this,noteId,at)) {
      LubaNoteRemoteAlarm692O.diag692X(this,"REMOTE_TAP_REJECTED_699AB",noteId,at,
          "no_delivered_occurrence");
      return false;
    }
    boolean saved=getSharedPreferences(LubaNoteRemoteOpen692T.PREF,Context.MODE_PRIVATE)
        .edit()
        .putString(LubaNoteRemoteOpen692T.NOTE,noteId)
        .putLong(LubaNoteRemoteOpen692T.AT,at)
        .putString(LubaNoteRemoteOpen692T.TOKEN,java.util.UUID.randomUUID().toString())
        .commit();
    LubaNoteRemoteAlarm692O.diag692X(this,"REMOTE_TAP_699AB",noteId,at,
        saved?"direct_main_saved":"pending_save_failed");
    return saved;
  }

  /* 699AS: Fronta noveho dokumentu se zpracuje az webovou vrstvou.
   * Bez primeho otevirani content:// ve WebView a bez zasahu do alarmu. */
  private void ohlasExterniDokument699AS() {
    for (long zpozdeni : new long[]{120L, 650L, 1500L}) {
      handler685Q.postDelayed(() -> {
        try {
          if (getBridge() == null || getBridge().getWebView() == null) return;
          getBridge().getWebView().evaluateJavascript(
            "window.dispatchEvent(new Event('lubanote:external-document-699AS'));", null);
        } catch (RuntimeException ignored) {}
      }, zpozdeni);
    }
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    // 699AT: On Xiaomi/other file managers "Open with" can be VIEW
    // or SEND/EXTRA_STREAM. The existing document plugin validates the URI.
    if (intent != null && (Intent.ACTION_VIEW.equals(intent.getAction()) ||
        Intent.ACTION_SEND.equals(intent.getAction()))) {
      ohlasExterniDokument699AS();
    }
    // 693G: Retain compatibility with notifications already posted by old APKs.
    boolean previousTap=intent != null &&
        intent.getBooleanExtra("lubanote_remote_notification_tap_693G",false);
    if (previousTap) intent.removeExtra("lubanote_remote_notification_tap_693G");
    boolean directTap=prijmiPriamyKlikPripominky699AB(intent);
    if (previousTap || directTap) predejKlikNaPripominku696X();
  }

  @Override
  public void onStart() {
    super.onStart();
    ohlasZivotniCyklus685F("ON_START");
  }

  @Override
  public void onPause() {
    // 685Q: capture ještě před ztrátou povrchu, bez změny WebView režimu.
    zachytPredPozadim685Q();
    casPozadi685Q = SystemClock.elapsedRealtime();
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
    zobrazPrekrytiPriNavratu685Q();
    ohlasZivotniCyklus685F("ON_RESUME");
    // 699Z: Also recover an already persisted native tap on Activity resume.
    // Handles cold starts and warm returns where onNewIntent's early JS event
    // fired while WebView was paused. Never reopens an acknowledged token.
    String pendingTap699Z = getSharedPreferences(
      LubaNoteRemoteOpen692T.PREF, Context.MODE_PRIVATE)
        .getString(LubaNoteRemoteOpen692T.TOKEN, "");
    if (pendingTap699Z != null && !pendingTap699Z.isEmpty()) {
      predejKlikNaPripominku696X();
    }
    schovejSystemovouImeProLubaKeyboard(false);
    naplanujModerniLubaImeHidePoNavratu();
    // 685H: onResume uz neprovadi vynuceny fullscreen relayout.
    // Pripadne odkrytou horni listu vyridi onWindowFocusChanged.
    // 685P: WebView si po resume ridi vykresleni samo.
    // Nevnucujeme dalsi invalidaci celeho povrchu.
    ohlasZivotniCyklus685F("685P_RESUME_NO_FORCED_INVALIDATE");
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
      // 685P: ani focus gain nevyvolava druhou invalidaci WebView.
    } else {
      zrusNaplanovaneLubaImeHide();
    }
  }


  private void zpracujSystemoveZpet() {
    if (getBridge() == null || getBridge().getWebView() == null) {
      potvrdUkonceni699DBY();
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
          potvrdUkonceni699DBY();
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
