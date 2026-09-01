// ==========================================
// LUBANOTE SECRET – BIOMETRICKÉ ODEMYKÁNÍ
// Android-only pohodlný vstup do Secret režimu.
// Hlavní heslo je v nativní části uložené pouze
// zašifrované klíčem Android Keystore, který lze
// použít až po úspěšném biometrickém ověření.
// ==========================================

(() => {
  const biometricUnlockButton =
    document.getElementById(
      "secretBiometricUnlockButton"
    );

  const biometricEnableRow =
    document.getElementById(
      "secretBiometricEnableRow"
    );

  const biometricEnableCheckbox =
    document.getElementById(
      "secretBiometricEnableCheckbox"
    );

  const biometricStatus =
    document.getElementById(
      "secretBiometricStatus"
    );

  const disableBiometricButton =
    document.getElementById(
      "disableSecretBiometricButton"
    );

  const secretUnlockModalElement =
    document.getElementById("secretUnlockModal");

  const secretUnlockInputElement =
    document.getElementById("secretUnlockInput");

  let probihaBiometrie = false;

  function ziskejPlugin() {
    return window.Capacitor
      ?.Plugins
      ?.LubaNoteSecretBiometric || null;
  }

  function jeAndroidAplikace() {
    const plugin = ziskejPlugin();

    if (!plugin) {
      return false;
    }

    const platforma =
      window.Capacitor?.getPlatform?.();

    return !platforma || platforma === "android";
  }

  async function ziskejUserId() {
    if (typeof getCurrentUser !== "function") {
      return null;
    }

    const user = await getCurrentUser();
    return user?.id || null;
  }

  function nastavStatus(text = "") {
    if (!biometricStatus) {
      return;
    }

    biometricStatus.textContent = text;
    biometricStatus.hidden = !text;
  }

  function skryjBiometrickeUI() {
    if (biometricUnlockButton) {
      biometricUnlockButton.hidden = true;
    }

    if (biometricEnableRow) {
      biometricEnableRow.hidden = true;
    }

    if (disableBiometricButton) {
      disableBiometricButton.hidden = true;
    }

    nastavStatus("");
  }

  async function zjistiStav() {
    if (!jeAndroidAplikace()) {
      return {
        available: false,
        configured: false,
        reason: "neni_android"
      };
    }

    const userId = await ziskejUserId();

    if (!userId) {
      return {
        available: false,
        configured: false,
        reason: "bez_uzivatele"
      };
    }

    try {
      return await ziskejPlugin().stav({ userId });
    } catch (error) {
      console.warn(
        "Stav biometrie se nepodařilo načíst:",
        error
      );

      return {
        available: false,
        configured: false,
        reason: "chyba"
      };
    }
  }

  function textProNedostupnost(reason) {
    if (reason === "neni_zapsany_otisk") {
      return "V Androidu zatím není nastavený bezpečný otisk prstu.";
    }

    if (
      reason === "neni_hardware" ||
      reason === "nepodporovano" ||
      reason === "android_stary"
    ) {
      return "Toto zařízení nepodporuje bezpečné biometrické odemykání.";
    }

    if (reason === "hardware_nedostupny") {
      return "Čtečka otisku je teď dočasně nedostupná.";
    }

    return "";
  }

  async function aktualizujUI({ maHeslo = true } = {}) {
    if (!maHeslo || !jeAndroidAplikace()) {
      skryjBiometrickeUI();
      return {
        available: false,
        configured: false
      };
    }

    const stav = await zjistiStav();

    if (biometricUnlockButton) {
      biometricUnlockButton.hidden =
        !stav.available || !stav.configured;
    }

    if (biometricEnableRow) {
      biometricEnableRow.hidden =
        !stav.available || stav.configured;

      if (
        !biometricEnableRow.hidden &&
        biometricEnableCheckbox &&
        biometricEnableCheckbox.dataset.initialized !== "true"
      ) {
        biometricEnableCheckbox.checked = true;
        biometricEnableCheckbox.dataset.initialized = "true";
      }
    }

    if (disableBiometricButton) {
      disableBiometricButton.hidden =
        !stav.available || !stav.configured;
    }

    nastavStatus(
      stav.available
        ? ""
        : textProNedostupnost(stav.reason)
    );

    return stav;
  }

  async function vypniBiometrii({ zobrazZpravu = true } = {}) {
    const plugin = ziskejPlugin();
    const userId = await ziskejUserId();

    if (!plugin || !userId) {
      return false;
    }

    try {
      await plugin.vypni({ userId });
      await aktualizujUI({ maHeslo: true });

      if (zobrazZpravu) {
        zobrazZpravuAplikace(
          "Tajný režim",
          "Odemykání otiskem bylo na tomto zařízení vypnuto."
        );
      }

      return true;
    } catch (error) {
      console.error(
        "Vypnutí biometrického odemykání selhalo:",
        error
      );
      return false;
    }
  }

  async function aktivujProHeslo(heslo) {
    if (!heslo || !jeAndroidAplikace()) {
      return false;
    }

    const stav = await zjistiStav();

    if (!stav.available || stav.configured) {
      return stav.configured;
    }

    const userId = await ziskejUserId();

    if (!userId) {
      return false;
    }

    try {
      probihaBiometrie = true;

      const vysledek = await ziskejPlugin().zapni({
        userId,
        heslo
      });

      if (vysledek?.success) {
        await aktualizujUI({ maHeslo: true });
        return true;
      }

      return false;
    } catch (error) {
      console.warn(
        "Nastavení otisku bylo zrušeno nebo selhalo:",
        error
      );
      return false;
    } finally {
      probihaBiometrie = false;
    }
  }

  function maBytAktivovana() {
    return Boolean(
      biometricEnableRow &&
      !biometricEnableRow.hidden &&
      biometricEnableCheckbox?.checked
    );
  }

  async function odemkniBiometricky({ automaticky = false } = {}) {
    if (probihaBiometrie) {
      return {
        odemceno: false,
        configured: true
      };
    }

    const stav = await zjistiStav();

    if (!stav.available || !stav.configured) {
      return {
        odemceno: false,
        configured: false,
        available: stav.available
      };
    }

    const userId = await ziskejUserId();
    let heslo = "";

    if (!userId) {
      return {
        odemceno: false,
        configured: false
      };
    }

    try {
      probihaBiometrie = true;

      const vysledek = await ziskejPlugin().odemkni({
        userId
      });

      if (!vysledek?.success) {
        if (vysledek?.reason === "otisk_zmenen") {
          zobrazZpravuAplikace(
            "Tajný režim",
            "Otisky v telefonu se změnily. Odemkni jednou hlavním heslem a otisk nastav znovu."
          );
        }

        await aktualizujUI({ maHeslo: true });

        return {
          odemceno: false,
          configured:
            vysledek?.configured !== false,
          canceled: Boolean(vysledek?.canceled)
        };
      }

      heslo = String(vysledek.heslo || "");

      if (!heslo) {
        return {
          odemceno: false,
          configured: true
        };
      }

      const spravneHeslo =
        await overHlavniHeslo(heslo);

      if (spravneHeslo === null) {
        if (!automaticky) {
          zobrazZpravuAplikace(
            "Tajný režim",
            "Biometrické odemčení čeká na lokální tajné nastavení. Odemkni jednou hlavním heslem."
          );
        }

        return {
          odemceno: false,
          configured: true
        };
      }

      if (!spravneHeslo) {
        await vypniBiometrii({
          zobrazZpravu: false
        });

        zobrazZpravuAplikace(
          "Tajný režim",
          "Uložené biometrické odemčení už neodpovídá hlavnímu heslu. Použij heslo a otisk nastav znovu."
        );

        return {
          odemceno: false,
          configured: false
        };
      }

      const odemceno =
        await odemkniTajnyRezimSifrovacimKlicem(
          heslo
        );

      if (!odemceno) {
        return {
          odemceno: false,
          configured: true
        };
      }

      if (secretUnlockInputElement) {
        secretUnlockInputElement.value = "";
      }

      if (secretUnlockModalElement) {
        secretUnlockModalElement.hidden = true;
      }

      await aktualizujUI({ maHeslo: true });

      zobrazZpravuAplikace(
        "Tajný režim",
        "Tajný režim je odemčený."
      );

      return {
        odemceno: true,
        configured: true
      };
    } catch (error) {
      console.error(
        "Biometrické odemknutí selhalo:",
        error
      );

      if (!automaticky) {
        zobrazZpravuAplikace(
          "Tajný režim",
          "Biometrické odemknutí se nepodařilo. Použij hlavní heslo."
        );
      }

      return {
        odemceno: false,
        configured: true
      };
    } finally {
      heslo = "";
      probihaBiometrie = false;
    }
  }

  async function zkusAutomatickeOdemknuti() {
    const stav = await zjistiStav();

    if (!stav.available || !stav.configured) {
      return {
        odemceno: false,
        configured: false,
        available: stav.available
      };
    }

    return odemkniBiometricky({
      automaticky: true
    });
  }

  biometricUnlockButton?.addEventListener(
    "click",
    () => {
      odemkniBiometricky({ automaticky: false });
    }
  );

  disableBiometricButton?.addEventListener(
    "click",
    async () => {
      const potvrzeno = window.confirm(
        "Vypnout odemykání Secret režimu otiskem na tomto zařízení?"
      );

      if (!potvrzeno) {
        return;
      }

      await vypniBiometrii();
    }
  );

  window.addEventListener(
    "lubanote:supabase-ready",
    () => {
      aktualizujUI({ maHeslo: true });
    }
  );

  window.LubaNoteSecretBiometric = {
    zjistiStav,
    aktualizujUI,
    zkusAutomatickeOdemknuti,
    odemkniBiometricky,
    aktivujProHeslo,
    maBytAktivovana,
    vypniBiometrii
  };
})();
