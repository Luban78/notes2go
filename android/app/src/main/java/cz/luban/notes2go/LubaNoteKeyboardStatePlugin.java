package cz.luban.notes2go;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "LubaNoteKeyboardState")
public class LubaNoteKeyboardStatePlugin extends Plugin {

  @PluginMethod
  public void nastavZdroj(PluginCall call) {
    Boolean systemovaHodnota = call.getBoolean("systemova");
    boolean systemova = Boolean.TRUE.equals(systemovaHodnota);

    if (getActivity() instanceof MainActivity) {
      ((MainActivity) getActivity())
        .nastavSystemovouKlavesniciPovolenou(systemova);
    }

    call.resolve();
  }
}
