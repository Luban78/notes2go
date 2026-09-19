package android.print;

import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;

import java.util.concurrent.atomic.AtomicBoolean;

/*
 * LubaNote PATCH 631 – pouze experimentální bridge pro "Přímé PDF TEST".
 *
 * Proč je tato třída v android.print:
 * Android veřejně vystavuje PrintDocumentAdapter.onLayout()/onWrite(), ale
 * konstruktory jejich callback tříd jsou v SDK schované. Produkční LubaNote
 * je proto NEPOUŽÍVÁ. Tento bridge existuje jen pro izolovaný test stejného
 * Chromium/WebView PDF enginu bez PrintManager UI.
 *
 * Pokud Android 16+ tento přístup zablokuje, volající TEST cestu uklidí a
 * běžný export přes PrintManager zůstává beze změny.
 */
public final class LubaNotePrimePdfBridge {

  public interface Vysledek {
    void hotovo(int pocetStran);
    void chyba(String zprava);
  }

  private LubaNotePrimePdfBridge() {
  }

  public static void zapis(
    PrintDocumentAdapter adapter,
    PrintAttributes atributy,
    ParcelFileDescriptor descriptor,
    Vysledek vysledek
  ) {
    if (
      adapter == null ||
      atributy == null ||
      descriptor == null ||
      vysledek == null
    ) {
      throw new IllegalArgumentException(
        "PDF TEST bridge nemá všechny vstupy."
      );
    }

    AtomicBoolean dokonceno = new AtomicBoolean(false);

    try {
      adapter.onStart();

      Bundle volby = new Bundle();
      volby.putBoolean(
        PrintDocumentAdapter.EXTRA_PRINT_PREVIEW,
        false
      );

      adapter.onLayout(
        null,
        atributy,
        new CancellationSignal(),
        new PrintDocumentAdapter.LayoutResultCallback() {
          @Override
          public void onLayoutFinished(
            PrintDocumentInfo info,
            boolean changed
          ) {
            if (info == null) {
              dokoncitChybou(dokonceno, adapter, vysledek, 
                "PDF TEST layout nevrátil informace o dokumentu."
              );
              return;
            }

            final int pocetStran = info.getPageCount();

            try {
              adapter.onWrite(
                new PageRange[] { PageRange.ALL_PAGES },
                descriptor,
                new CancellationSignal(),
                new PrintDocumentAdapter.WriteResultCallback() {
                  @Override
                  public void onWriteFinished(PageRange[] pages) {
                    if (!dokonceno.compareAndSet(false, true)) {
                      return;
                    }

                    dokoncitAdapter(adapter);
                    vysledek.hotovo(pocetStran);
                  }

                  @Override
                  public void onWriteFailed(CharSequence error) {
                    dokoncitChybou(dokonceno, adapter, vysledek, 
                      error == null
                        ? "PDF TEST zápis selhal."
                        : error.toString()
                    );
                  }

                  @Override
                  public void onWriteCancelled() {
                    dokoncitChybou(dokonceno, adapter, vysledek, "PDF TEST zápis byl zrušen.");
                  }
                }
              );
            } catch (Throwable chyba) {
              dokoncitChybou(dokonceno, adapter, vysledek, 
                "PDF TEST zápis se nepodařilo spustit."
              );
            }
          }

          @Override
          public void onLayoutFailed(CharSequence error) {
            dokoncitChybou(dokonceno, adapter, vysledek, 
              error == null
                ? "PDF TEST layout selhal."
                : error.toString()
            );
          }

          @Override
          public void onLayoutCancelled() {
            dokoncitChybou(dokonceno, adapter, vysledek, "PDF TEST layout byl zrušen.");
          }
        },
        volby
      );
    } catch (Throwable chyba) {
      dokoncitChybou(dokonceno, adapter, vysledek, 
        "Android nepovolil přímé volání PDF tiskového adapteru."
      );
    }
  }
  private static void dokoncitChybou(
    AtomicBoolean dokonceno,
    PrintDocumentAdapter adapter,
    Vysledek vysledek,
    String zprava
  ) {
    if (!dokonceno.compareAndSet(false, true)) {
      return;
    }

    dokoncitAdapter(adapter);
    vysledek.chyba(
      zprava == null || zprava.trim().isEmpty()
        ? "Přímý PDF TEST selhal."
        : zprava
    );
  }

  private static void dokoncitAdapter(
    PrintDocumentAdapter adapter
  ) {
    try {
      adapter.onFinish();
    } catch (Throwable ignored) {
      // TEST úklid nesmí přepsat původní výsledek.
    }
  }

}
