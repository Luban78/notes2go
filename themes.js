/* 699D-G: Jedna volitelná tmavá definice, světlou podobu vytváří sluníčko.
 * Staré páry v theme.css se při čtení pouze skryjí; barvy se nemažou.
 * ALIAS po bezpečném exportu zachová obnovu dříve uloženého -light ID. */
/* 699D-N: Na čisté instalaci použij Grafit místo fialového Světlého.
 * Uložený výběr uživatele NIKDY neměň. Nastav ještě před asynchronním
 * načtením seznamu motivů, aby se nový výchozí motiv nepřekresloval.
 * Bez zásahu do CSS definic nebo přepínání den/noc. */
(() => {
  // Na PC/PWA ponech dosavadní výchozí motiv; oprava míří na čistou APK.
  if (!window.Capacitor?.isNativePlatform?.()) return;
  try {
    let motiv = localStorage.getItem('theme');
    if (!motiv) {
      motiv = 'darkg';
      localStorage.setItem('theme', motiv);
    }
    if (motiv !== 'light' && /^[a-z0-9-]{1,64}$/i.test(motiv)) {
      document.body?.classList.add(`theme-${motiv}`);
    }
  } catch (_) { /* Ukládání je nedostupné: původní chování aplikace. */ }
})();

async function nactiTemata() {
  const odpoved = await fetch("theme.css?v=656-theme-pack");
  if (!odpoved.ok) throw new Error(`Motivy nejsou dostupné (HTTP ${odpoved.status}).`);
  const cssText = await odpoved.text();
  const temata = [...cssText.matchAll(/\/\*\s*THEME:\s*([^|*]+)\|\s*([^|*]+)\|\s*([^*]+)\*\//g)]
    .map(match => ({ id: match[1].trim(), nazev: match[2].trim(), typ: match[3].trim() }))
    .filter(tema => tema.typ === 'selectable');

  const existuje = new Set(temata.map(t => t.id));
  const skryteSvetle = new Set();
  const aliasy = new Map();
  function pridejAlias(svetleId, tmaveId) {
    if (!existuje.has(tmaveId) || !/^[-a-z0-9]+$/.test(svetleId) ||
        !/^[-a-z0-9]+$/.test(tmaveId)) return;
    if (!aliasy.has(tmaveId)) aliasy.set(tmaveId, new Set());
    aliasy.get(tmaveId).add(svetleId);
  }
  // Původní dvojice v CSS: světlá definice existuje, ale již není položkou UI.
  for (const m of cssText.matchAll(/\/\*\s*LN-TB-PAIR:\s*([a-z0-9-]+)\s*\|\s*([a-z0-9-]+)\s*\|\s*(?:AUTO|LOCK)\s*\*\//gi)) {
    if (!existuje.has(m[1]) || !existuje.has(m[2]) || m[1] === m[2]) continue;
    skryteSvetle.add(m[2]);
    pridejAlias(m[2], m[1]);
  }
  // Po exportu Builder odstraní redundantní světlé CSS, alias ale zůstane.
  for (const m of cssText.matchAll(/\/\*\s*LN-TB-LIGHT-ALIAS:\s*([a-z0-9-]+)\s*\|\s*([a-z0-9-]+)\s*\*\//gi)) {
    pridejAlias(m[1], m[2]);
  }
  return temata.filter(t => !skryteSvetle.has(t.id)).map(t => ({
    ...t,
    nazev: aliasy.has(t.id) ? t.nazev.replace(/\s+(?:Dark|Tmavý)$/i, '').trim() : t.nazev,
    legacyLightIds: [...(aliasy.get(t.id) || [])]
  }));
}
