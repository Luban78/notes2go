package cz.luban.notes2go;

import android.os.Bundle;
import android.speech.tts.TextToSpeech;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Locale;

/*
 * PATCH 658CE – nativní Android výslovnost pro LubaReader / Výuku angličtiny.
 *
 * WebView speechSynthesis je na některých telefonech dostupný v JavaScriptu,
 * ale reálně nevydá žádný zvuk. LubaNote už má ověřený audio výstup APK,
 * proto výslovnost řešíme přímo přes Android TextToSpeech.
 *
 * Plugin neposílá text na vlastní server LubaNote. Použije TTS engine
 * nainstalovaný v Androidu (typicky Google Speech Services).
 */
@CapacitorPlugin(name = "LubaNoteTts")
public class LubaNoteTtsPlugin extends Plugin {

  private TextToSpeech tts;
  private volatile boolean pripraveno = false;
  private volatile boolean chybaInicializace = false;

  @Override
  public void load() {
    super.load();

    getActivity().runOnUiThread(() -> {
      try {
        tts = new TextToSpeech(
          getContext().getApplicationContext(),
          status -> {
            pripraveno = status == TextToSpeech.SUCCESS;
            chybaInicializace = status != TextToSpeech.SUCCESS;

            if (pripraveno && tts != null) {
              nastavAnglictinu(tts, Locale.UK);
              try { tts.setSpeechRate(0.90f); } catch (Exception ignored) {}
              try { tts.setPitch(1.0f); } catch (Exception ignored) {}
            }
          }
        );
      } catch (Exception error) {
        pripraveno = false;
        chybaInicializace = true;
      }
    });
  }

  private boolean jazykPouzitelny(int vysledek) {
    return vysledek != TextToSpeech.LANG_MISSING_DATA
      && vysledek != TextToSpeech.LANG_NOT_SUPPORTED;
  }

  private Locale localeZKodu(String kod) {
    String value = kod == null ? "" : kod.trim();
    if (value.isEmpty()) return Locale.UK;

    String normalized = value.replace('_', '-');
    String[] casti = normalized.split("-", 3);

    if (casti.length >= 2) {
      return new Locale(casti[0].toLowerCase(Locale.ROOT), casti[1].toUpperCase(Locale.ROOT));
    }

    return new Locale(casti[0].toLowerCase(Locale.ROOT));
  }

  private boolean nastavAnglictinu(TextToSpeech engine, Locale preferovany) {
    if (engine == null) return false;

    try {
      if (jazykPouzitelny(engine.setLanguage(preferovany))) return true;
      if (jazykPouzitelny(engine.setLanguage(Locale.US))) return true;
      return jazykPouzitelny(engine.setLanguage(Locale.ENGLISH));
    } catch (Exception ignored) {
      return false;
    }
  }

  @PluginMethod
  public void getStatus(PluginCall call) {
    JSObject result = new JSObject();
    result.put("ready", pripraveno && tts != null);
    result.put("initFailed", chybaInicializace);
    call.resolve(result);
  }

  @PluginMethod
  public void speak(PluginCall call) {
    String text = call.getString("text", "");
    if (text == null) text = "";
    text = text.trim();

    if (text.isEmpty()) {
      call.reject("EMPTY_TEXT");
      return;
    }

    if (text.length() > 500) {
      text = text.substring(0, 500);
    }

    final String finalText = text;
    final String language = call.getString("language", "en-GB");
    final Double rateValue = call.getDouble("rate", 0.90);
    final Double pitchValue = call.getDouble("pitch", 1.0);

    getActivity().runOnUiThread(() -> {
      if (!pripraveno || tts == null) {
        call.reject(chybaInicializace ? "TTS_INIT_FAILED" : "TTS_NOT_READY");
        return;
      }

      try {
        Locale locale = localeZKodu(language);
        if (!nastavAnglictinu(tts, locale)) {
          call.reject("ENGLISH_VOICE_NOT_AVAILABLE");
          return;
        }

        float rate = rateValue == null ? 0.90f : rateValue.floatValue();
        float pitch = pitchValue == null ? 1.0f : pitchValue.floatValue();
        rate = Math.max(0.5f, Math.min(1.5f, rate));
        pitch = Math.max(0.7f, Math.min(1.3f, pitch));

        tts.setSpeechRate(rate);
        tts.setPitch(pitch);

        Bundle params = new Bundle();
        String utteranceId = "lubanote_en_" + System.nanoTime();
        int vysledek = tts.speak(finalText, TextToSpeech.QUEUE_FLUSH, params, utteranceId);

        if (vysledek == TextToSpeech.ERROR) {
          call.reject("TTS_SPEAK_FAILED");
          return;
        }

        JSObject result = new JSObject();
        result.put("ok", true);
        result.put("language", locale.toLanguageTag());
        call.resolve(result);
      } catch (Exception error) {
        call.reject("TTS_EXCEPTION", error);
      }
    });
  }

  @PluginMethod
  public void stop(PluginCall call) {
    getActivity().runOnUiThread(() -> {
      try {
        if (tts != null) tts.stop();
      } catch (Exception ignored) {}
      call.resolve();
    });
  }

  @Override
  protected void handleOnDestroy() {
    try {
      if (tts != null) {
        tts.stop();
        tts.shutdown();
      }
    } catch (Exception ignored) {}

    tts = null;
    pripraveno = false;
    super.handleOnDestroy();
  }
}
