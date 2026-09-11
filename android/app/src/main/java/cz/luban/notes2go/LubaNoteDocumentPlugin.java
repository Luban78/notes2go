package cz.luban.notes2go;

import android.app.Activity;
import android.content.Intent;
import android.content.Context;
import android.content.ContentValues;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.pdf.PdfRenderer;
import android.graphics.pdf.PdfDocument;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.os.Build;
import android.os.Environment;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintJob;
import android.print.PrintManager;
import android.provider.OpenableColumns;
import android.provider.MediaStore;
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
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
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
  private boolean pdfVybratMisto = false;
  private File cekajiciVygenerovanePdf = null;
  private int cekajiciVygenerovanePdfStrany = 0;

  private final Object pdfViewerLock = new Object();
  private ParcelFileDescriptor pdfViewerDescriptor = null;
  private PdfRenderer pdfViewerRenderer = null;
  private Uri pdfViewerUri = null;

  /* Zdroj PDF držený jen po dobu systémového dialogu „Uložit kopii“. */
  private Uri cekajiciPdfZdrojUri = null;

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
        pdfViewerUri = uri;

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

    pdfViewerUri = null;
  }

  private String normalizujPdfNazev(String nazev) {
    String vysledek = nazev == null
      ? "dokument.pdf"
      : nazev.trim();

    if (vysledek.isEmpty()) {
      vysledek = "dokument.pdf";
    }

    vysledek = vysledek.replaceAll("[\\/:*?\"<>|]", " ")
      .replaceAll("\\s+", " ")
      .trim();

    if (!vysledek.toLowerCase().endsWith(".pdf")) {
      vysledek = vysledek + ".pdf";
    }

    return vysledek;
  }

  private Uri vytvorPdfVeStazenych(String nazev)
    throws IOException {

    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      throw new IOException(
        "Přímé ukládání PDF vyžaduje Android 10 nebo novější."
      );
    }

    ContentValues hodnoty = new ContentValues();
    hodnoty.put(
      MediaStore.MediaColumns.DISPLAY_NAME,
      normalizujPdfNazev(nazev)
    );
    hodnoty.put(
      MediaStore.MediaColumns.MIME_TYPE,
      "application/pdf"
    );
    hodnoty.put(
      MediaStore.MediaColumns.RELATIVE_PATH,
      Environment.DIRECTORY_DOWNLOADS + "/LubaNote"
    );
    hodnoty.put(MediaStore.MediaColumns.IS_PENDING, 1);

    Uri cil = getContext()
      .getContentResolver()
      .insert(
        MediaStore.Downloads.EXTERNAL_CONTENT_URI,
        hodnoty
      );

    if (cil == null) {
      throw new IOException(
        "Android nevytvořil cílový PDF soubor."
      );
    }

    return cil;
  }

  private void dokoncitPdfVeStazenych(Uri uri) {
    if (
      uri == null ||
      Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
    ) {
      return;
    }

    ContentValues hodnoty = new ContentValues();
    hodnoty.put(MediaStore.MediaColumns.IS_PENDING, 0);

    getContext()
      .getContentResolver()
      .update(uri, hodnoty, null, null);
  }

  private void zrusPdfVeStazenych(Uri uri) {
    if (uri == null) {
      return;
    }

    try {
      getContext()
        .getContentResolver()
        .delete(uri, null, null);
    } catch (Exception ignored) {
      // Neúspěšné čištění nesmí přepsat původní chybu.
    }
  }

  private JSObject vytvorPdfUlozenoOdpoved(Uri uri) {
    JSObject odpoved = new JSObject();
    odpoved.put("saved", true);
    odpoved.put("canceled", false);
    odpoved.put("uri", uri == null ? "" : uri.toString());
    odpoved.put("location", "Stažené/LubaNote");
    return odpoved;
  }

  @PluginMethod
  public void ulozOtevrenePdf(PluginCall call) {
    Uri zdroj;

    synchronized (pdfViewerLock) {
      zdroj = pdfViewerUri;
    }

    if (zdroj == null) {
      call.reject("PDF není otevřené.");
      return;
    }

    String nazev = normalizujPdfNazev(
      call.getString(
        "nazevSouboru",
        "dokument.pdf"
      )
    );

    String zpusobUlozeni = call.getString(
      "zpusobUlozeni",
      "stazene"
    );

    if (
      !"vybrat".equalsIgnoreCase(zpusobUlozeni) &&
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
    ) {
      ulozOtevrenePdfDoStazenych(
        call,
        zdroj,
        nazev
      );
      return;
    }

    /*
     * Picker se otevře jen pokud si ho uživatel výslovně vybere
     * (na Androidu < 10 zůstává nutným fallbackem).
     */
    cekajiciPdfZdrojUri = zdroj;

    Intent zamer = new Intent(Intent.ACTION_CREATE_DOCUMENT);
    zamer.addCategory(Intent.CATEGORY_OPENABLE);
    zamer.setType("application/pdf");
    zamer.putExtra(Intent.EXTRA_TITLE, nazev);

    startActivityForResult(
      call,
      zamer,
      "dokonceniUlozeniOtevrenehoPdf"
    );
  }

  private void ulozOtevrenePdfDoStazenych(
    PluginCall call,
    Uri zdroj,
    String nazev
  ) {
    Uri cil = null;

    try {
      cil = vytvorPdfVeStazenych(nazev);

      try (
        InputStream vstup =
          getContext()
            .getContentResolver()
            .openInputStream(zdroj);
        OutputStream vystup =
          getContext()
            .getContentResolver()
            .openOutputStream(cil, "w")
      ) {
        if (vstup == null || vystup == null) {
          throw new IOException(
            "Android neotevřel PDF pro kopírování."
          );
        }

        byte[] buffer = new byte[64 * 1024];
        int nacteno;

        while ((nacteno = vstup.read(buffer)) != -1) {
          if (nacteno > 0) {
            vystup.write(buffer, 0, nacteno);
          }
        }

        vystup.flush();
      }

      dokoncitPdfVeStazenych(cil);
      call.resolve(vytvorPdfUlozenoOdpoved(cil));
    } catch (IOException | SecurityException chyba) {
      zrusPdfVeStazenych(cil);
      call.reject(
        "PDF se nepodařilo uložit do Stažené/LubaNote.",
        chyba
      );
    }
  }

  @ActivityCallback
  private void dokonceniUlozeniOtevrenehoPdf(
    PluginCall call,
    ActivityResult vysledek
  ) {
    if (call == null) {
      cekajiciPdfZdrojUri = null;
      return;
    }

    Intent dataZameru = vysledek.getData();

    if (
      vysledek.getResultCode() != Activity.RESULT_OK ||
      dataZameru == null ||
      dataZameru.getData() == null
    ) {
      cekajiciPdfZdrojUri = null;

      JSObject odpoved = new JSObject();
      odpoved.put("saved", false);
      odpoved.put("canceled", true);
      call.resolve(odpoved);
      return;
    }

    Uri zdroj = cekajiciPdfZdrojUri;
    Uri cil = dataZameru.getData();

    if (zdroj == null) {
      cekajiciPdfZdrojUri = null;
      call.reject("Zdroj otevřeného PDF už není dostupný.");
      return;
    }

    if (zdroj.equals(cil)) {
      cekajiciPdfZdrojUri = null;
      call.reject("Otevřené PDF nelze přepsat samo sebou. Vyber jiný cílový soubor.");
      return;
    }

    try (
      InputStream vstup =
        getContext()
          .getContentResolver()
          .openInputStream(zdroj);
      OutputStream vystup =
        getContext()
          .getContentResolver()
          .openOutputStream(cil, "wt")
    ) {
      if (vstup == null || vystup == null) {
        call.reject("Android neotevřel PDF pro kopírování.");
        return;
      }

      byte[] buffer = new byte[64 * 1024];
      int nacteno;

      while ((nacteno = vstup.read(buffer)) >= 0) {
        if (nacteno > 0) {
          vystup.write(buffer, 0, nacteno);
        }
      }

      vystup.flush();

      JSObject odpoved = new JSObject();
      odpoved.put("saved", true);
      odpoved.put("canceled", false);
      odpoved.put("uri", cil.toString());
      call.resolve(odpoved);
    } catch (IOException | SecurityException chyba) {
      call.reject(
        "PDF se nepodařilo uložit.",
        chyba
      );
    } finally {
      cekajiciPdfZdrojUri = null;
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

    pdfNazev = normalizujPdfNazev(
      call.getString(
        "nazevSouboru",
        "LubaNote-poznamka.pdf"
      )
    );
    pdfVybratMisto = "vybrat".equalsIgnoreCase(
      call.getString("zpusobUlozeni", "stazene")
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

    if (pdfVybratMisto) {
      pripravPdfPredVyberemMista(call);
      return;
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      ulozPdfBezSystemovehoTisku(call);
      return;
    }

    /*
     * Fallback pouze pro Android 9 a starší. Na Androidu 10+
     * už se PrintManager UI vůbec neotevírá.
     */
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

  private void pripravPdfPredVyberemMista(PluginCall call) {
    if (pdfWebView == null) {
      vycistiPdfTisk();
      call.reject("PDF WebView není připravený.");
      return;
    }

    File docasnySoubor = null;

    try {
      docasnySoubor = File.createTempFile(
        "lubanote-pdf-",
        ".pdf",
        getContext().getCacheDir()
      );

      int pocetStran;

      try (
        OutputStream vystup =
          new FileOutputStream(docasnySoubor, false)
      ) {
        pocetStran = zapisPdfWebViewDoVystupu(vystup);
        vystup.flush();
      }

      cekajiciVygenerovanePdf = docasnySoubor;
      cekajiciVygenerovanePdfStrany = pocetStran;

      /*
       * DŮLEŽITÉ:
       * Systémový picker spouští jinou Activity. Živý off-screen WebView
       * přes tento přechod nedržíme. PDF je už hotové v cache a po návratu
       * se pouze zkopíruje do vybraného cíle.
       */
      uvolniPdfWebView();
      otevriVyberMistaProVygenerovanePdf(call);
    } catch (Exception chyba) {
      if (docasnySoubor != null) {
        try {
          docasnySoubor.delete();
        } catch (Exception ignored) {
          // pokračujeme úklidem
        }
      }

      cekajiciVygenerovanePdf = null;
      cekajiciVygenerovanePdfStrany = 0;
      vycistiPdfTisk();
      call.reject(
        "PDF se nepodařilo připravit pro výběr umístění.",
        chyba
      );
    }
  }

  private int zapisPdfWebViewDoVystupu(OutputStream vystup)
    throws IOException {

    if (pdfWebView == null) {
      throw new IOException("PDF WebView není připravený.");
    }

    PdfDocument dokument = null;

    try {
      final int sirkaPdf = 595;
      final int vyskaPdf = 842;
      final int okrajPdf = 40;
      final int sirkaObsahuPdf = sirkaPdf - (okrajPdf * 2);
      final int vyskaObsahuPdf = vyskaPdf - (okrajPdf * 2);
      final int sirkaWeb = 688;
      final float meritko =
        sirkaObsahuPdf / (float) sirkaWeb;
      final int vyskaWebNaStranku = Math.max(
        1,
        (int) Math.floor(vyskaObsahuPdf / meritko)
      );

      int sirkaSpec = android.view.View.MeasureSpec.makeMeasureSpec(
        sirkaWeb,
        android.view.View.MeasureSpec.EXACTLY
      );
      int vyskaSpec = android.view.View.MeasureSpec.makeMeasureSpec(
        0,
        android.view.View.MeasureSpec.UNSPECIFIED
      );

      pdfWebView.measure(sirkaSpec, vyskaSpec);

      int celkovaVyska = Math.max(
        1,
        pdfWebView.getMeasuredHeight()
      );
      int obsahovaVyska = Math.max(
        1,
        pdfWebView.getContentHeight()
      );
      celkovaVyska = Math.max(celkovaVyska, obsahovaVyska);

      pdfWebView.layout(
        0,
        0,
        sirkaWeb,
        celkovaVyska
      );

      int pocetStran = Math.max(
        1,
        (int) Math.ceil(
          celkovaVyska / (double) vyskaWebNaStranku
        )
      );

      dokument = new PdfDocument();

      for (int index = 0; index < pocetStran; index++) {
        PdfDocument.PageInfo info =
          new PdfDocument.PageInfo.Builder(
            sirkaPdf,
            vyskaPdf,
            index + 1
          ).create();

        PdfDocument.Page stranka = dokument.startPage(info);
        Canvas platno = stranka.getCanvas();
        platno.drawColor(Color.WHITE);

        platno.save();
        platno.translate(okrajPdf, okrajPdf);
        platno.clipRect(
          0,
          0,
          sirkaObsahuPdf,
          vyskaObsahuPdf
        );
        platno.scale(meritko, meritko);
        platno.translate(
          0,
          -(index * vyskaWebNaStranku)
        );
        pdfWebView.draw(platno);
        platno.restore();

        dokument.finishPage(stranka);
      }

      dokument.writeTo(vystup);
      return pocetStran;
    } finally {
      if (dokument != null) {
        try {
          dokument.close();
        } catch (Exception ignored) {
          // výstupní chybu nepřepisujeme úklidem
        }
      }
    }
  }

  private void uvolniPdfWebView() {
    if (pdfWebView == null) {
      return;
    }

    try {
      pdfWebView.stopLoading();
      pdfWebView.loadUrl("about:blank");
      pdfWebView.clearHistory();
      pdfWebView.removeAllViews();
      pdfWebView.destroy();
    } catch (Exception ignored) {
      // WebView už může být interně ukončený.
    }

    pdfWebView = null;
  }

  private void otevriVyberMistaProVygenerovanePdf(PluginCall call) {
    Intent zamer = new Intent(Intent.ACTION_CREATE_DOCUMENT);
    zamer.addCategory(Intent.CATEGORY_OPENABLE);
    zamer.setType("application/pdf");
    zamer.putExtra(Intent.EXTRA_TITLE, pdfNazev);

    startActivityForResult(
      call,
      zamer,
      "dokonceniVyberuMistaProVygenerovanePdf"
    );
  }

  @ActivityCallback
  private void dokonceniVyberuMistaProVygenerovanePdf(
    PluginCall call,
    ActivityResult vysledek
  ) {
    if (call == null) {
      vycistiPdfTisk();
      return;
    }

    Intent dataZameru = vysledek.getData();

    if (
      vysledek.getResultCode() != Activity.RESULT_OK ||
      dataZameru == null ||
      dataZameru.getData() == null
    ) {
      JSObject odpoved = new JSObject();
      odpoved.put("saved", false);
      odpoved.put("canceled", true);
      call.resolve(odpoved);
      vycistiPdfTisk();
      return;
    }

    File zdroj = cekajiciVygenerovanePdf;
    Uri cil = dataZameru.getData();

    if (zdroj == null || !zdroj.exists()) {
      vycistiPdfTisk();
      call.reject("Připravené PDF už není dostupné.");
      return;
    }

    try (
      InputStream vstup = new FileInputStream(zdroj);
      OutputStream vystup =
        getContext()
          .getContentResolver()
          .openOutputStream(cil, "w")
    ) {
      if (vystup == null) {
        throw new IOException(
          "Android neotevřel vybraný cílový soubor."
        );
      }

      byte[] buffer = new byte[64 * 1024];
      int nacteno;

      while ((nacteno = vstup.read(buffer)) != -1) {
        if (nacteno > 0) {
          vystup.write(buffer, 0, nacteno);
        }
      }

      vystup.flush();

      JSObject odpoved = new JSObject();
      odpoved.put("saved", true);
      odpoved.put("canceled", false);
      odpoved.put("uri", cil.toString());
      odpoved.put("location", "Vybrané místo");
      odpoved.put("started", false);
      odpoved.put("pages", cekajiciVygenerovanePdfStrany);
      call.resolve(odpoved);
    } catch (IOException | SecurityException chyba) {
      call.reject(
        "PDF se nepodařilo uložit do vybraného místa.",
        chyba
      );
    } finally {
      vycistiPdfTisk();
    }
  }

  private void ulozPdfBezSystemovehoTisku(PluginCall call) {
    ulozPdfBezSystemovehoTiskuInterni(
      call,
      null,
      true
    );
  }

  private void ulozPdfBezSystemovehoTiskuDoUri(
    PluginCall call,
    Uri cil
  ) {
    ulozPdfBezSystemovehoTiskuInterni(
      call,
      cil,
      false
    );
  }

  private void ulozPdfBezSystemovehoTiskuInterni(
    PluginCall call,
    Uri vybranyCil,
    boolean spravovatStazene
  ) {
    if (pdfWebView == null) {
      vycistiPdfTisk();
      call.reject("PDF WebView není připravený.");
      return;
    }

    Uri cil = null;
    PdfDocument dokument = null;
    OutputStream vystup = null;

    try {
      cil = vybranyCil != null
        ? vybranyCil
        : vytvorPdfVeStazenych(pdfNazev);

      /*
       * Android 10+ – PDF vytvoříme přímo z off-screen WebView.
       * Nepoužíváme PrintManager ani jeho neveřejné callback konstruktory,
       * takže se neotevře systémový tiskový náhled.
       *
       * A4: 595 × 842 bodů při 72 dpi. Okraj ~14 mm = 40 bodů.
       * WebView vykreslujeme po svislých řezech a každý řez uložíme
       * jako jednu PDF stránku.
       */
      final int sirkaPdf = 595;
      final int vyskaPdf = 842;
      final int okrajPdf = 40;
      final int sirkaObsahuPdf = sirkaPdf - (okrajPdf * 2);
      final int vyskaObsahuPdf = vyskaPdf - (okrajPdf * 2);

      /*
       * 182 mm tisknutelné šířky odpovídá přibližně 688 CSS px při 96 dpi.
       * Tím zůstane zalomení textu blízko původnímu A4 print layoutu.
       */
      final int sirkaWeb = 688;
      final float meritko =
        sirkaObsahuPdf / (float) sirkaWeb;
      final int vyskaWebNaStranku = Math.max(
        1,
        (int) Math.floor(vyskaObsahuPdf / meritko)
      );

      int sirkaSpec = android.view.View.MeasureSpec.makeMeasureSpec(
        sirkaWeb,
        android.view.View.MeasureSpec.EXACTLY
      );
      int vyskaSpec = android.view.View.MeasureSpec.makeMeasureSpec(
        0,
        android.view.View.MeasureSpec.UNSPECIFIED
      );

      pdfWebView.measure(sirkaSpec, vyskaSpec);

      int celkovaVyska = Math.max(
        1,
        pdfWebView.getMeasuredHeight()
      );

      /*
       * Některé WebView při UNSPECIFIED vrátí jen aktuální viewport.
       * getContentHeight() proto použijeme jako bezpečné minimum.
       */
      int obsahovaVyska = Math.max(
        1,
        pdfWebView.getContentHeight()
      );
      celkovaVyska = Math.max(celkovaVyska, obsahovaVyska);

      pdfWebView.layout(
        0,
        0,
        sirkaWeb,
        celkovaVyska
      );

      int pocetStran = Math.max(
        1,
        (int) Math.ceil(
          celkovaVyska / (double) vyskaWebNaStranku
        )
      );

      dokument = new PdfDocument();

      for (int index = 0; index < pocetStran; index++) {
        PdfDocument.PageInfo info =
          new PdfDocument.PageInfo.Builder(
            sirkaPdf,
            vyskaPdf,
            index + 1
          ).create();

        PdfDocument.Page stranka = dokument.startPage(info);
        Canvas platno = stranka.getCanvas();
        platno.drawColor(Color.WHITE);

        platno.save();
        platno.translate(okrajPdf, okrajPdf);
        platno.clipRect(
          0,
          0,
          sirkaObsahuPdf,
          vyskaObsahuPdf
        );
        platno.scale(meritko, meritko);
        platno.translate(
          0,
          -(index * vyskaWebNaStranku)
        );
        pdfWebView.draw(platno);
        platno.restore();

        dokument.finishPage(stranka);
      }

      vystup = getContext()
        .getContentResolver()
        .openOutputStream(cil, "w");

      if (vystup == null) {
        throw new IOException(
          "Android neotevřel cílový PDF soubor."
        );
      }

      dokument.writeTo(vystup);
      vystup.flush();
      vystup.close();
      vystup = null;

      dokument.close();
      dokument = null;

      if (spravovatStazene) {
        dokoncitPdfVeStazenych(cil);
      }

      JSObject odpoved = spravovatStazene
        ? vytvorPdfUlozenoOdpoved(cil)
        : new JSObject();

      if (!spravovatStazene) {
        odpoved.put("saved", true);
        odpoved.put("canceled", false);
        odpoved.put("uri", cil == null ? "" : cil.toString());
        odpoved.put("location", "Vybrané místo");
      }
      odpoved.put("started", false);
      odpoved.put("pages", pocetStran);
      call.resolve(odpoved);
    } catch (Exception chyba) {
      if (vystup != null) {
        try {
          vystup.close();
        } catch (Exception ignored) {
          // pokračujeme úklidem
        }
      }

      if (dokument != null) {
        try {
          dokument.close();
        } catch (Exception ignored) {
          // pokračujeme úklidem
        }
      }

      if (spravovatStazene) {
        zrusPdfVeStazenych(cil);
      }
      call.reject(
        spravovatStazene
          ? "PDF se nepodařilo uložit do Stažené/LubaNote."
          : "PDF se nepodařilo uložit do vybraného místa.",
        chyba
      );
    } finally {
      vycistiPdfTisk();
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
    uvolniPdfWebView();

    if (cekajiciVygenerovanePdf != null) {
      try {
        cekajiciVygenerovanePdf.delete();
      } catch (Exception ignored) {
        // Dočasný soubor je pouze cache.
      }

      cekajiciVygenerovanePdf = null;
    }

    cekajiciVygenerovanePdfStrany = 0;
    pdfPrintJob = null;
    pdfNazev = "LubaNote-poznamka.pdf";
    pdfTiskSpusten = false;
    pdfVybratMisto = false;
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
