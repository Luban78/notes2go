package cz.luban.notes2go;

import android.app.Activity;
import android.content.Intent;
import android.content.Context;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.pdf.PdfRenderer;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintJob;
import android.print.PrintManager;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "LubaNoteDocument")
public class LubaNoteDocumentPlugin extends Plugin {

  private static final long MAX_VELIKOST_SOUBORU =
    20L * 1024L * 1024L;

  private String cekajiciObsah = null;
  private String cekajiciMimeType = "text/html";

  private final Handler pdfHandler =
    new Handler(Looper.getMainLooper());
  private WebView pdfWebView = null;
  private PrintJob pdfPrintJob = null;
  private String pdfNazev = "LubaNote-poznamka.pdf";
  private boolean pdfTiskSpusten = false;

  private final Object pdfViewerLock = new Object();
  private ParcelFileDescriptor pdfViewerDescriptor = null;
  private PdfRenderer pdfViewerRenderer = null;

  @PluginMethod
  public void otevriDokument(PluginCall call) {
    Intent zamer = new Intent(Intent.ACTION_OPEN_DOCUMENT);
    zamer.addCategory(Intent.CATEGORY_OPENABLE);
    zamer.setType("*/*");

    String[] mimeTypy = new String[] {
      "text/html",
      "text/plain",
      "application/pdf"
    };

    zamer.putExtra(Intent.EXTRA_MIME_TYPES, mimeTypy);

    startActivityForResult(
      call,
      zamer,
      "dokonceniOtevreni"
    );
  }

  @ActivityCallback
  private void dokonceniOtevreni(
    PluginCall call,
    ActivityResult vysledek
  ) {
    if (call == null) {
      return;
    }

    Intent dataZameru = vysledek.getData();

    if (
      vysledek.getResultCode() != Activity.RESULT_OK ||
      dataZameru == null ||
      dataZameru.getData() == null
    ) {
      JSObject odpoved = new JSObject();
      odpoved.put("canceled", true);
      call.resolve(odpoved);
      return;
    }

    Uri uri = dataZameru.getData();
    String nazevSouboru = ziskejNazevSouboru(uri);
    String mimeType =
      getContext().getContentResolver().getType(uri);

    boolean jePdf =
      "application/pdf".equalsIgnoreCase(mimeType) ||
      nazevSouboru.toLowerCase().endsWith(".pdf");

    try {
      if (jePdf) {
        JSObject odpoved = otevriPdfProViewer(
          uri,
          nazevSouboru,
          mimeType
        );
        call.resolve(odpoved);
        return;
      }

      String obsah = nactiTextovySoubor(uri);

      JSObject odpoved = new JSObject();
      odpoved.put("canceled", false);
      odpoved.put("typ", "text");
      odpoved.put("obsah", obsah);
      odpoved.put("nazevSouboru", nazevSouboru);
      odpoved.put("mimeType", mimeType);
      odpoved.put("uri", uri.toString());

      call.resolve(odpoved);
    } catch (SecurityException chyba) {
      call.reject(
        "PDF je chráněné heslem nebo k němu Android nepovolil přístup.",
        chyba
      );
    } catch (IOException chyba) {
      call.reject(
        jePdf
          ? "PDF se nepodařilo otevřít."
          : "Dokument se nepodařilo přečíst.",
        chyba
      );
    }
  }

  private JSObject otevriPdfProViewer(
    Uri uri,
    String nazevSouboru,
    String mimeType
  ) throws IOException {
    synchronized (pdfViewerLock) {
      zavriPdfViewerInterni();

      ParcelFileDescriptor descriptor =
        getContext()
          .getContentResolver()
          .openFileDescriptor(uri, "r");

      if (descriptor == null) {
        throw new IOException("Android neotevřel PDF soubor.");
      }

      try {
        PdfRenderer renderer = new PdfRenderer(descriptor);

        if (renderer.getPageCount() <= 0) {
          renderer.close();
          descriptor.close();
          throw new IOException("PDF neobsahuje žádné stránky.");
        }

        pdfViewerDescriptor = descriptor;
        pdfViewerRenderer = renderer;

        JSObject odpoved = new JSObject();
        odpoved.put("canceled", false);
        odpoved.put("typ", "pdf");
        odpoved.put("pageCount", renderer.getPageCount());
        odpoved.put("nazevSouboru", nazevSouboru);
        odpoved.put(
          "mimeType",
          mimeType == null ? "application/pdf" : mimeType
        );
        odpoved.put("uri", uri.toString());
        return odpoved;
      } catch (IOException | SecurityException chyba) {
        try {
          descriptor.close();
        } catch (Exception ignored) {
          // Descriptor už může být zavřený.
        }
        throw chyba;
      }
    }
  }

  @PluginMethod
  public void vykresliPdfStranku(PluginCall call) {
    Integer indexHodnota = call.getInt("index");
    Integer sirkaHodnota = call.getInt("targetWidth");

    int index = indexHodnota == null ? 0 : indexHodnota;
    int cilovaSirka = sirkaHodnota == null ? 1200 : sirkaHodnota;
    cilovaSirka = Math.max(320, Math.min(2600, cilovaSirka));

    synchronized (pdfViewerLock) {
      if (pdfViewerRenderer == null) {
        call.reject("PDF není otevřené.");
        return;
      }

      if (index < 0 || index >= pdfViewerRenderer.getPageCount()) {
        call.reject("Požadovaná PDF stránka neexistuje.");
        return;
      }

      PdfRenderer.Page stranka = null;
      Bitmap bitmap = null;

      try {
        stranka = pdfViewerRenderer.openPage(index);

        int zdrojSirka = Math.max(1, stranka.getWidth());
        int zdrojVyska = Math.max(1, stranka.getHeight());
        int cilovaVyska = Math.max(1, Math.round(
          cilovaSirka * (zdrojVyska / (float) zdrojSirka)
        ));

        final long maxPixelu = 12_000_000L;
        long pixely = (long) cilovaSirka * cilovaVyska;

        if (pixely > maxPixelu) {
          double pomer = Math.sqrt(maxPixelu / (double) pixely);
          cilovaSirka = Math.max(320, (int) Math.floor(cilovaSirka * pomer));
          cilovaVyska = Math.max(1, (int) Math.floor(cilovaVyska * pomer));
        }

        bitmap = Bitmap.createBitmap(
          cilovaSirka,
          cilovaVyska,
          Bitmap.Config.ARGB_8888
        );
        bitmap.eraseColor(Color.WHITE);

        float meritko = cilovaSirka / (float) zdrojSirka;
        Matrix matice = new Matrix();
        matice.postScale(meritko, meritko);

        stranka.render(
          bitmap,
          null,
          matice,
          PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY
        );

        ByteArrayOutputStream vystup = new ByteArrayOutputStream();
        bitmap.compress(Bitmap.CompressFormat.JPEG, 94, vystup);

        String base64 = Base64.encodeToString(
          vystup.toByteArray(),
          Base64.NO_WRAP
        );

        JSObject odpoved = new JSObject();
        odpoved.put("dataUrl", "data:image/jpeg;base64," + base64);
        odpoved.put("width", cilovaSirka);
        odpoved.put("height", cilovaVyska);
        odpoved.put("pageCount", pdfViewerRenderer.getPageCount());
        call.resolve(odpoved);
      } catch (Exception chyba) {
        call.reject(
          "PDF stránku se nepodařilo vykreslit.",
          chyba
        );
      } finally {
        if (bitmap != null) {
          bitmap.recycle();
        }

        if (stranka != null) {
          stranka.close();
        }
      }
    }
  }

  @PluginMethod
  public void zavriPdf(PluginCall call) {
    synchronized (pdfViewerLock) {
      zavriPdfViewerInterni();
    }

    JSObject odpoved = new JSObject();
    odpoved.put("closed", true);
    call.resolve(odpoved);
  }

  private void zavriPdfViewerInterni() {
    if (pdfViewerRenderer != null) {
      try {
        pdfViewerRenderer.close();
      } catch (Exception ignored) {
        // Renderer už může být zavřený.
      }
      pdfViewerRenderer = null;
    }

    if (pdfViewerDescriptor != null) {
      try {
        pdfViewerDescriptor.close();
      } catch (Exception ignored) {
        // Descriptor už může být zavřený.
      }
      pdfViewerDescriptor = null;
    }
  }

  @PluginMethod
  public void ulozDokument(PluginCall call) {
    String obsah = call.getString("obsah");

    if (obsah == null) {
      call.reject("Chybí obsah dokumentu.");
      return;
    }

    byte[] bajty = obsah.getBytes(StandardCharsets.UTF_8);

    if (bajty.length > MAX_VELIKOST_SOUBORU) {
      call.reject("Dokument je příliš velký. Maximum je 20 MB.");
      return;
    }

    String nazevSouboru = call.getString(
      "nazevSouboru",
      "LubaNote-poznamka.html"
    );

    cekajiciObsah = obsah;
    cekajiciMimeType = call.getString(
      "mimeType",
      "text/html"
    );

    Intent zamer = new Intent(Intent.ACTION_CREATE_DOCUMENT);
    zamer.addCategory(Intent.CATEGORY_OPENABLE);
    zamer.setType(cekajiciMimeType);
    zamer.putExtra(Intent.EXTRA_TITLE, nazevSouboru);

    startActivityForResult(
      call,
      zamer,
      "dokonceniUlozeni"
    );
  }

  @ActivityCallback
  private void dokonceniUlozeni(
    PluginCall call,
    ActivityResult vysledek
  ) {
    if (call == null) {
      vycistiCekajiciUlozeni();
      return;
    }

    Intent dataZameru = vysledek.getData();

    if (
      vysledek.getResultCode() != Activity.RESULT_OK ||
      dataZameru == null ||
      dataZameru.getData() == null
    ) {
      vycistiCekajiciUlozeni();

      JSObject odpoved = new JSObject();
      odpoved.put("saved", false);
      odpoved.put("canceled", true);
      call.resolve(odpoved);
      return;
    }

    if (cekajiciObsah == null) {
      call.reject("Chybí připravený obsah dokumentu.");
      return;
    }

    Uri uri = dataZameru.getData();

    try (
      OutputStream vystup =
        getContext()
          .getContentResolver()
          .openOutputStream(uri, "wt")
    ) {
      if (vystup == null) {
        call.reject("Android neotevřel cílový soubor.");
        return;
      }

      vystup.write(
        cekajiciObsah.getBytes(StandardCharsets.UTF_8)
      );
      vystup.flush();

      JSObject odpoved = new JSObject();
      odpoved.put("saved", true);
      odpoved.put("canceled", false);
      odpoved.put("uri", uri.toString());
      call.resolve(odpoved);
    } catch (IOException chyba) {
      call.reject(
        "Dokument se nepodařilo uložit.",
        chyba
      );
    } finally {
      vycistiCekajiciUlozeni();
    }
  }

  @PluginMethod
  public void ulozPdf(PluginCall call) {
    String html = call.getString("html");

    if (html == null || html.trim().isEmpty()) {
      call.reject("Chybí obsah PDF dokumentu.");
      return;
    }

    byte[] bajty = html.getBytes(StandardCharsets.UTF_8);

    if (bajty.length > MAX_VELIKOST_SOUBORU) {
      call.reject("Dokument je příliš velký. Maximum je 20 MB.");
      return;
    }

    if (pdfWebView != null || pdfPrintJob != null) {
      call.reject("Předchozí PDF tisk ještě není dokončený.");
      return;
    }

    pdfNazev = call.getString(
      "nazevSouboru",
      "LubaNote-poznamka.pdf"
    );
    pdfTiskSpusten = false;

    Activity aktivita = getActivity();

    if (aktivita == null) {
      call.reject("Android Activity není dostupná.");
      return;
    }

    aktivita.runOnUiThread(() -> {
      try {
        pdfWebView = new WebView(aktivita);
        pdfWebView.getSettings().setJavaScriptEnabled(true);
        pdfWebView.getSettings().setLoadsImagesAutomatically(true);

        pdfWebView.setWebViewClient(new WebViewClient() {
          @Override
          public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            cekejNaPdfObrazky(call, 0);
          }
        });

        /*
         * Tisk používá vlastní off-screen WebView. Do PDF se proto
         * nedostane toolbar, navigace ani ostatní UI LubaNote.
         */
        pdfWebView.loadDataWithBaseURL(
          "https://localhost/",
          html,
          "text/html",
          "UTF-8",
          null
        );
      } catch (Exception chyba) {
        vycistiPdfTisk();
        call.reject(
          "PDF dokument se nepodařilo připravit.",
          chyba
        );
      }
    });
  }

  private void cekejNaPdfObrazky(
    PluginCall call,
    int pokus
  ) {
    if (pdfWebView == null || pdfTiskSpusten) {
      return;
    }

    String skript =
      "(function(){" +
        "try{" +
          "return Array.from(document.images||[]).every(function(i){" +
            "return i.complete;" +
          "});" +
        "}catch(e){return true;}" +
      "})()";

    pdfWebView.evaluateJavascript(
      skript,
      hodnota -> {
        if (pdfWebView == null || pdfTiskSpusten) {
          return;
        }

        boolean obrazkyHotove = "true".equals(hodnota);

        if (obrazkyHotove || pokus >= 50) {
          spustPdfTisk(call);
          return;
        }

        pdfWebView.postDelayed(
          () -> cekejNaPdfObrazky(call, pokus + 1),
          100
        );
      }
    );
  }

  private void spustPdfTisk(PluginCall call) {
    if (pdfWebView == null || pdfTiskSpusten) {
      return;
    }

    pdfTiskSpusten = true;

    Activity aktivita = getActivity();

    if (aktivita == null) {
      vycistiPdfTisk();
      call.reject("Android Activity není dostupná.");
      return;
    }

    try {
      PrintManager spravceTisku =
        (PrintManager) aktivita.getSystemService(
          Context.PRINT_SERVICE
        );

      if (spravceTisku == null) {
        vycistiPdfTisk();
        call.reject("Android tisková služba není dostupná.");
        return;
      }

      PrintDocumentAdapter adapter =
        pdfWebView.createPrintDocumentAdapter(pdfNazev);

      PrintAttributes atributy =
        new PrintAttributes.Builder()
          .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
          .setColorMode(PrintAttributes.COLOR_MODE_COLOR)
          .build();

      pdfPrintJob = spravceTisku.print(
        pdfNazev,
        adapter,
        atributy
      );

      JSObject odpoved = new JSObject();
      odpoved.put("saved", true);
      odpoved.put("started", true);
      call.resolve(odpoved);

      sledujDokonceniPdfTisku();
    } catch (Exception chyba) {
      vycistiPdfTisk();
      call.reject(
        "PDF tisk se nepodařilo spustit.",
        chyba
      );
    }
  }

  private void sledujDokonceniPdfTisku() {
    pdfHandler.postDelayed(
      new Runnable() {
        @Override
        public void run() {
          if (pdfPrintJob == null) {
            return;
          }

          if (
            pdfPrintJob.isCompleted() ||
            pdfPrintJob.isCancelled() ||
            pdfPrintJob.isFailed()
          ) {
            vycistiPdfTisk();
            return;
          }

          pdfHandler.postDelayed(this, 500);
        }
      },
      500
    );
  }

  private void vycistiPdfTisk() {
    if (pdfWebView != null) {
      try {
        pdfWebView.stopLoading();
        pdfWebView.destroy();
      } catch (Exception ignored) {
        // WebView už může být interně ukončený.
      }

      pdfWebView = null;
    }

    pdfPrintJob = null;
    pdfNazev = "LubaNote-poznamka.pdf";
    pdfTiskSpusten = false;
  }

  private String nactiTextovySoubor(Uri uri)
    throws IOException {

    try (
      InputStream vstup =
        getContext()
          .getContentResolver()
          .openInputStream(uri)
    ) {
      if (vstup == null) {
        throw new IOException("Android neotevřel vybraný soubor.");
      }

      ByteArrayOutputStream vystup =
        new ByteArrayOutputStream();

      byte[] buffer = new byte[8192];
      int pocet;
      long celkem = 0;

      while ((pocet = vstup.read(buffer)) != -1) {
        celkem += pocet;

        if (celkem > MAX_VELIKOST_SOUBORU) {
          throw new IOException(
            "Dokument je příliš velký. Maximum je 20 MB."
          );
        }

        vystup.write(buffer, 0, pocet);
      }

      return vystup.toString(StandardCharsets.UTF_8.name());
    }
  }

  private String ziskejNazevSouboru(Uri uri) {
    String vysledek = "dokument";

    try (
      Cursor kurzor =
        getContext()
          .getContentResolver()
          .query(
            uri,
            new String[] { OpenableColumns.DISPLAY_NAME },
            null,
            null,
            null
          )
    ) {
      if (kurzor != null && kurzor.moveToFirst()) {
        int index = kurzor.getColumnIndex(
          OpenableColumns.DISPLAY_NAME
        );

        if (index >= 0) {
          String nazev = kurzor.getString(index);

          if (nazev != null && !nazev.trim().isEmpty()) {
            vysledek = nazev;
          }
        }
      }
    } catch (Exception ignored) {
      // Název je pouze doplňková informace.
    }

    return vysledek;
  }

  private void vycistiCekajiciUlozeni() {
    cekajiciObsah = null;
    cekajiciMimeType = "text/html";
  }
}
