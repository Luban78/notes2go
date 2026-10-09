/* 680F – zdroj verze bez zásahu do GitHub Actions workflow.
 * Android workflow může dál přepsat LUBANOTE_VERSION na 0.9.<run>.
 * TEST/PROD přepisuje lubanote-deploy na stejné build číslo jako APK.
 * Lokální Preview si načte produkční build a pouze přidá značku LOCAL.
 */
(() => {
  const host = String(window.location?.hostname || "").toLowerCase();
  const jeLokalniWeb = host === "127.0.0.1" || host === "localhost";

  window.LUBANOTE_RELEASE = "0.9";
  window.LUBANOTE_VERSION = jeLokalniWeb ? "LOCAL" : "WEB";
  window.LUBANOTE_BUILD = "";

  if (!jeLokalniWeb) return;

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
