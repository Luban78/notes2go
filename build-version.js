/* 680E – webová verze bez zásahu do GitHub Actions workflow.
 *
 * APK: android-debug workflow tento soubor před buildem přepíše skutečnou
 * verzí 0.9.<run>, takže chování APK se nemění.
 *
 * PROD/TEST: příkaz lubanote-deploy soubor po deployi přepíše na
 * WEB-<short commit>, tedy přesnou verzi skutečně nasazeného webu.
 *
 * VS Code Live Server: lokální vývojová kopie si přečte verzi z PROD webu,
 * aby místo DEV ukazovala stejný webový build jako app.lubanote.com.
 */
(() => {
  const host = String(window.location?.hostname || "").toLowerCase();
  const jeLokalniWeb = host === "127.0.0.1" || host === "localhost";

  window.LUBANOTE_VERSION = jeLokalniWeb ? "LOCAL" : "WEB";
  window.LUBANOTE_BUILD = jeLokalniWeb ? "LOCAL" : "WEB";

  if (!jeLokalniWeb) {
    return;
  }

  const vzdalenyBuild = document.createElement("script");
  vzdalenyBuild.src =
    `https://app.lubanote.com/build-version.js?local=${Date.now()}`;
  vzdalenyBuild.async = true;

  const oznamHotovouVerzi = () => {
    window.dispatchEvent(new Event("lubanote-version-ready"));
  };

  vzdalenyBuild.addEventListener("load", oznamHotovouVerzi, { once: true });
  vzdalenyBuild.addEventListener("error", oznamHotovouVerzi, { once: true });
  document.head.appendChild(vzdalenyBuild);
})();
