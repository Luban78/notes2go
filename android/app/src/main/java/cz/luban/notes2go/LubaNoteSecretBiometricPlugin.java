package cz.luban.notes2go;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.concurrent.Executor;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "LubaNoteSecretBiometric")
public class LubaNoteSecretBiometricPlugin extends Plugin {

  private static final String KEY_ALIAS =
    "LubaNoteSecretBiometricKeyV1";

  private static final String PREFS_NAME =
    "lubanote_secret_biometric_v1";

  private static final String PREF_USER_ID = "user_id";
  private static final String PREF_IV = "iv";
  private static final String PREF_DATA = "data";

  private PluginCall cekajiciCall = null;

  private SharedPreferences prefs() {
    return getContext().getSharedPreferences(
      PREFS_NAME,
      Context.MODE_PRIVATE
    );
  }

  private boolean jeBiometrieDostupna() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
      return false;
    }

    BiometricManager manager =
      BiometricManager.from(getContext());

    return manager.canAuthenticate(
      BiometricManager.Authenticators.BIOMETRIC_STRONG
    ) == BiometricManager.BIOMETRIC_SUCCESS;
  }

  private String duvodNedostupnosti() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
      return "android_stary";
    }

    int stav = BiometricManager
      .from(getContext())
      .canAuthenticate(
        BiometricManager.Authenticators.BIOMETRIC_STRONG
      );

    switch (stav) {
      case BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED:
        return "neni_zapsany_otisk";
      case BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE:
        return "neni_hardware";
      case BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE:
        return "hardware_nedostupny";
      case BiometricManager.BIOMETRIC_ERROR_SECURITY_UPDATE_REQUIRED:
        return "bezpecnostni_aktualizace";
      case BiometricManager.BIOMETRIC_ERROR_UNSUPPORTED:
        return "nepodporovano";
      case BiometricManager.BIOMETRIC_STATUS_UNKNOWN:
        return "neznamy_stav";
      default:
        return "nedostupne";
    }
  }

  private KeyStore otevriKeyStore() throws Exception {
    KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
    keyStore.load(null);
    return keyStore;
  }

  private boolean maKlic() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
      return false;
    }

    try {
      return otevriKeyStore().containsAlias(KEY_ALIAS);
    } catch (Exception chyba) {
      return false;
    }
  }

  private SecretKey nactiKlic() throws Exception {
    return (SecretKey) otevriKeyStore().getKey(
      KEY_ALIAS,
      null
    );
  }

  private SecretKey vytvorNovyKlic() throws Exception {
    KeyStore keyStore = otevriKeyStore();

    if (keyStore.containsAlias(KEY_ALIAS)) {
      keyStore.deleteEntry(KEY_ALIAS);
    }

    KeyGenerator generator = KeyGenerator.getInstance(
      KeyProperties.KEY_ALGORITHM_AES,
      "AndroidKeyStore"
    );

    KeyGenParameterSpec.Builder builder =
      new KeyGenParameterSpec.Builder(
        KEY_ALIAS,
        KeyProperties.PURPOSE_ENCRYPT |
          KeyProperties.PURPOSE_DECRYPT
      )
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(
          KeyProperties.ENCRYPTION_PADDING_NONE
        )
        .setUserAuthenticationRequired(true);

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      builder.setUserAuthenticationParameters(
        0,
        KeyProperties.AUTH_BIOMETRIC_STRONG
      );
    } else {
      builder.setUserAuthenticationValidityDurationSeconds(-1);

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        builder.setInvalidatedByBiometricEnrollment(true);
      }
    }

    generator.init(builder.build());
    return generator.generateKey();
  }

  private void vycistiNastaveni() {
    prefs().edit().clear().apply();

    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
      return;
    }

    try {
      KeyStore keyStore = otevriKeyStore();

      if (keyStore.containsAlias(KEY_ALIAS)) {
        keyStore.deleteEntry(KEY_ALIAS);
      }
    } catch (Exception chyba) {
      // Nastavení je už smazané. Nevadí, když se smazání klíče nepovede.
    }
  }

  private boolean patriUzivateli(String userId) {
    if (userId == null || userId.isEmpty()) {
      return false;
    }

    String ulozenyUserId = prefs().getString(
      PREF_USER_ID,
      ""
    );

    return userId.equals(ulozenyUserId);
  }

  private boolean maUlozenaData() {
    return !prefs().getString(PREF_IV, "").isEmpty() &&
      !prefs().getString(PREF_DATA, "").isEmpty();
  }

  @PluginMethod
  public void stav(PluginCall call) {
    String userId = call.getString("userId", "");
    boolean dostupna = jeBiometrieDostupna();

    JSObject odpoved = new JSObject();
    odpoved.put("available", dostupna);
    odpoved.put(
      "configured",
      dostupna &&
        patriUzivateli(userId) &&
        maUlozenaData() &&
        maKlic()
    );
    odpoved.put(
      "reason",
      dostupna ? "ok" : duvodNedostupnosti()
    );

    call.resolve(odpoved);
  }

  @PluginMethod
  public void zapni(PluginCall call) {
    if (cekajiciCall != null) {
      call.reject("Biometrický dialog už je otevřený.");
      return;
    }

    String userId = call.getString("userId", "");
    String heslo = call.getString("heslo", "");

    if (userId.isEmpty() || heslo.isEmpty()) {
      call.reject("Chybí uživatel nebo hlavní heslo.");
      return;
    }

    if (!jeBiometrieDostupna()) {
      call.reject("Biometrie není na tomto zařízení dostupná.");
      return;
    }

    try {
      // Starý ciphertext nikdy nepárujeme s nově vytvořeným klíčem.
      prefs().edit().clear().apply();

      SecretKey key = vytvorNovyKlic();
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(Cipher.ENCRYPT_MODE, key);

      spustBiometrickyDialog(
        call,
        cipher,
        "Nastavit odemykání otiskem",
        "Potvrď otisk pro LubaNote Secret",
        (cryptoObject) -> {
          try {
            Cipher potvrzenyCipher = cryptoObject.getCipher();

            if (potvrzenyCipher == null) {
              throw new IllegalStateException(
                "Android nevrátil šifrovací objekt."
              );
            }

            byte[] zasifrovane = potvrzenyCipher.doFinal(
              heslo.getBytes(StandardCharsets.UTF_8)
            );

            prefs().edit()
              .putString(PREF_USER_ID, userId)
              .putString(
                PREF_IV,
                Base64.encodeToString(
                  potvrzenyCipher.getIV(),
                  Base64.NO_WRAP
                )
              )
              .putString(
                PREF_DATA,
                Base64.encodeToString(
                  zasifrovane,
                  Base64.NO_WRAP
                )
              )
              .apply();

            JSObject odpoved = new JSObject();
            odpoved.put("success", true);
            call.resolve(odpoved);
          } catch (Exception chyba) {
            vycistiNastaveni();
            call.reject(
              "Uložení biometrického odemčení selhalo.",
              chyba
            );
          }
        }
      );
    } catch (Exception chyba) {
      vycistiNastaveni();
      call.reject(
        "Příprava biometrického odemčení selhala.",
        chyba
      );
    }
  }

  @PluginMethod
  public void odemkni(PluginCall call) {
    if (cekajiciCall != null) {
      call.reject("Biometrický dialog už je otevřený.");
      return;
    }

    String userId = call.getString("userId", "");

    if (
      !patriUzivateli(userId) ||
      !maUlozenaData() ||
      !maKlic()
    ) {
      JSObject odpoved = new JSObject();
      odpoved.put("success", false);
      odpoved.put("configured", false);
      odpoved.put("reason", "nenastaveno");
      call.resolve(odpoved);
      return;
    }

    if (!jeBiometrieDostupna()) {
      JSObject odpoved = new JSObject();
      odpoved.put("success", false);
      odpoved.put("configured", true);
      odpoved.put("reason", duvodNedostupnosti());
      call.resolve(odpoved);
      return;
    }

    try {
      byte[] iv = Base64.decode(
        prefs().getString(PREF_IV, ""),
        Base64.NO_WRAP
      );

      SecretKey key = nactiKlic();
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(
        Cipher.DECRYPT_MODE,
        key,
        new GCMParameterSpec(128, iv)
      );

      spustBiometrickyDialog(
        call,
        cipher,
        "Odemknout LubaNote Secret",
        "Přilož prst ke čtečce",
        (cryptoObject) -> {
          try {
            Cipher potvrzenyCipher = cryptoObject.getCipher();

            if (potvrzenyCipher == null) {
              throw new IllegalStateException(
                "Android nevrátil dešifrovací objekt."
              );
            }

            byte[] zasifrovane = Base64.decode(
              prefs().getString(PREF_DATA, ""),
              Base64.NO_WRAP
            );

            byte[] plaintext = potvrzenyCipher.doFinal(
              zasifrovane
            );

            String heslo = new String(
              plaintext,
              StandardCharsets.UTF_8
            );

            JSObject odpoved = new JSObject();
            odpoved.put("success", true);
            odpoved.put("configured", true);
            odpoved.put("heslo", heslo);
            call.resolve(odpoved);

            java.util.Arrays.fill(plaintext, (byte) 0);
          } catch (Exception chyba) {
            call.reject(
              "Biometrické odemčení selhalo.",
              chyba
            );
          }
        }
      );
    } catch (KeyPermanentlyInvalidatedException chyba) {
      vycistiNastaveni();

      JSObject odpoved = new JSObject();
      odpoved.put("success", false);
      odpoved.put("configured", false);
      odpoved.put("reason", "otisk_zmenen");
      call.resolve(odpoved);
    } catch (Exception chyba) {
      call.reject(
        "Příprava biometrického odemčení selhala.",
        chyba
      );
    }
  }

  @PluginMethod
  public void vypni(PluginCall call) {
    String userId = call.getString("userId", "");

    if (
      !userId.isEmpty() &&
      !prefs().getString(PREF_USER_ID, "").isEmpty() &&
      !patriUzivateli(userId)
    ) {
      call.reject("Biometrické nastavení patří jinému účtu.");
      return;
    }

    vycistiNastaveni();

    JSObject odpoved = new JSObject();
    odpoved.put("success", true);
    call.resolve(odpoved);
  }

  private interface BiometrickyUkol {
    void proved(BiometricPrompt.CryptoObject cryptoObject);
  }

  private void spustBiometrickyDialog(
    PluginCall call,
    Cipher cipher,
    String titulek,
    String popis,
    BiometrickyUkol poUspechu
  ) {
    cekajiciCall = call;

    getActivity().runOnUiThread(() -> {
      Executor executor = ContextCompat.getMainExecutor(
        getContext()
      );

      BiometricPrompt prompt = new BiometricPrompt(
        (FragmentActivity) getActivity(),
        executor,
        new BiometricPrompt.AuthenticationCallback() {
          @Override
          public void onAuthenticationSucceeded(
            @NonNull BiometricPrompt.AuthenticationResult result
          ) {
            super.onAuthenticationSucceeded(result);
            cekajiciCall = null;

            BiometricPrompt.CryptoObject cryptoObject =
              result.getCryptoObject();

            if (cryptoObject == null) {
              call.reject(
                "Android nevrátil biometrický šifrovací objekt."
              );
              return;
            }

            poUspechu.proved(cryptoObject);
          }

          @Override
          public void onAuthenticationError(
            int errorCode,
            @NonNull CharSequence errString
          ) {
            super.onAuthenticationError(errorCode, errString);
            cekajiciCall = null;

            JSObject odpoved = new JSObject();
            odpoved.put("success", false);
            odpoved.put("configured", true);
            odpoved.put(
              "canceled",
              errorCode == BiometricPrompt.ERROR_NEGATIVE_BUTTON ||
                errorCode == BiometricPrompt.ERROR_USER_CANCELED ||
                errorCode == BiometricPrompt.ERROR_CANCELED
            );
            odpoved.put("reason", "zruseno_nebo_chyba");
            odpoved.put("message", errString.toString());
            call.resolve(odpoved);
          }

          @Override
          public void onAuthenticationFailed() {
            super.onAuthenticationFailed();
            // Android ponechá dialog otevřený a dovolí další pokus.
          }
        }
      );

      BiometricPrompt.PromptInfo promptInfo =
        new BiometricPrompt.PromptInfo.Builder()
          .setTitle(titulek)
          .setSubtitle(popis)
          .setAllowedAuthenticators(
            BiometricManager.Authenticators.BIOMETRIC_STRONG
          )
          .setNegativeButtonText("Použít heslo")
          .build();

      prompt.authenticate(
        promptInfo,
        new BiometricPrompt.CryptoObject(cipher)
      );
    });
  }
}
