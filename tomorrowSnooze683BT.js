/* LubaNote 683BT - fourth snooze option always means next calendar day. */
(() => {
  "use strict";
  const DEFAULT = "tomorrow@08:00";
  const labels = {
    cs: "Zítra", en: "Tomorrow", sk: "Zajtra", de: "Morgen", pl: "Jutro", es: "Mañana"
  };
  const titles = {
    cs: "Změnit čas zítřejšího odložení", en: "Choose tomorrow’s time", sk: "Zmeniť čas na zajtra",
    de: "Uhrzeit für morgen ändern", pl: "Zmień godzinę na jutro", es: "Cambiar la hora de mañana"
  };
  function parse(value) {
    if (value === "tomorrow") return DEFAULT; // backward compatibility
    const match = /^tomorrow@([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || ""));
    return match ? `tomorrow@${match[1]}:${match[2]}` : null;
  }
  function time(value) { return (parse(value) || DEFAULT).slice(9); }
  function locale() {
    const lang = String(window.LubaNoteI18n?.ziskejLocale?.() || document.documentElement.lang || "cs").slice(0,2).toLowerCase();
    return labels[lang] ? lang : "en";
  }
  function format(value) {
    const [hour, minute] = time(value).split(":");
    return `${labels[locale()]} ${Number(hour)}:${minute}`;
  }
  function nextDate(value, now = new Date()) {
    const [hour, minute] = time(value).split(":").map(Number);
    const date = new Date(now.getTime());
    date.setDate(date.getDate() + 1);
    date.setHours(hour, minute, 0, 0);
    return date;
  }
  window.LubaNoteTomorrowSnooze683BT = Object.freeze({ DEFAULT, parse, time, format, nextDate, title: () => titles[locale()] });
})();
