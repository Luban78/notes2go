package cz.luban.notes2go;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/*
 * PATCH 502 – malý nativní most pro skutečný návrat internetu.
 *
 * Android WebView někdy při vypnutí/zapnutí režimu Letadlo nevyšle
 * browserový event "online" a navigator.onLine může zůstat true i bez
 * reálného připojení. Targeted Sync V2 pak správně čeká na safety backoff,
 * ale po návratu internetu může zbytečně čekat až do dalšího timeoutu.
 *
 * Tento plugin neposílá žádná data na síť. Pouze poslouchá Android
 * ConnectivityManager a do JS vyšle změnu až ve chvíli, kdy má aktivní
 * síť capability VALIDATED (Android ověřil skutečný internet).
 */
@CapacitorPlugin(name = "LubaNoteNetworkState")
public class LubaNoteNetworkStatePlugin extends Plugin {

  private ConnectivityManager connectivityManager;
  private ConnectivityManager.NetworkCallback networkCallback;
  private volatile Boolean posledniConnected = null;

  @Override
  public void load() {
    super.load();

    connectivityManager =
      (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);

    if (connectivityManager == null) return;

    networkCallback = new ConnectivityManager.NetworkCallback() {
      @Override
      public void onAvailable(Network network) {
        oznamAktualniStav();
      }

      @Override
      public void onLost(Network network) {
        oznamAktualniStav();
      }

      @Override
      public void onCapabilitiesChanged(Network network, NetworkCapabilities capabilities) {
        oznamAktualniStav();
      }
    };

    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        connectivityManager.registerDefaultNetworkCallback(networkCallback);
      }
    } catch (Exception ignored) {}
  }

  private boolean maValidovanyInternet() {
    if (connectivityManager == null) return false;

    try {
      Network active = connectivityManager.getActiveNetwork();
      if (active == null) return false;

      NetworkCapabilities caps =
        connectivityManager.getNetworkCapabilities(active);

      if (caps == null) return false;

      boolean internet =
        caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        return internet &&
          caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
      }

      return internet;
    } catch (Exception ignored) {
      return false;
    }
  }

  private void oznamAktualniStav() {
    boolean connected = maValidovanyInternet();

    if (posledniConnected != null && posledniConnected == connected) {
      return;
    }

    posledniConnected = connected;

    JSObject data = new JSObject();
    data.put("connected", connected);
    notifyListeners("networkStatusChange", data, true);
  }

  @PluginMethod
  public void getStatus(PluginCall call) {
    boolean connected = maValidovanyInternet();
    posledniConnected = connected;

    JSObject result = new JSObject();
    result.put("connected", connected);
    call.resolve(result);
  }

  @Override
  protected void handleOnDestroy() {
    if (connectivityManager != null && networkCallback != null) {
      try {
        connectivityManager.unregisterNetworkCallback(networkCallback);
      } catch (Exception ignored) {}
    }

    networkCallback = null;
    connectivityManager = null;
    super.handleOnDestroy();
  }
}
