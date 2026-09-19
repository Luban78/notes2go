/* ============================================================
   LUBANOTE – EPUB READER V1 / PATCH 643
   ------------------------------------------------------------
   Bezpečný lokální parser EPUB:
   - žádné síťové načítání obsahu knihy
   - žádné skripty / formuláře / iframy z EPUB
   - lokální obrázky se načítají jen ze ZIP balíčku
   - EPUB 2 i EPUB 3: OPF + spine + NAV/NCX fallback
   ============================================================ */

(() => {
  'use strict';

  const MAX_EPUB_PART_BYTES = 32 * 1024 * 1024;
  const MAX_EPUB_ZIP_ENTRIES = 12000;

  function xml(text, popis) {
    const dokument = new DOMParser().parseFromString(text, 'application/xml');
    if (dokument.getElementsByTagName('parsererror').length > 0) {
      throw new Error(`${popis} není platné XML.`);
    }
    return dokument;
  }

  function potomci(prvek, localName) {
    if (!prvek?.getElementsByTagNameNS) return [];
    return Array.from(prvek.getElementsByTagNameNS('*', localName));
  }

  function attr(prvek, name) {
    if (!prvek?.attributes) return '';
    for (const a of prvek.attributes) {
      if (a.name === name || a.localName === name) return a.value || '';
    }
    return '';
  }

  function text(prvek) {
    return String(prvek?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function najdiEocd(view) {
    const minimum = Math.max(0, view.byteLength - 65557);
    for (let pozice = view.byteLength - 22; pozice >= minimum; pozice -= 1) {
      if (view.getUint32(pozice, true) === 0x06054b50) return pozice;
    }
    return -1;
  }

  function vytvorZipIndex(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    const eocd = najdiEocd(view);
    if (eocd < 0) throw new Error('EPUB nemá platnou ZIP strukturu.');

    const pocetPolozek = view.getUint16(eocd + 10, true);
    if (pocetPolozek > MAX_EPUB_ZIP_ENTRIES) {
      throw new Error('EPUB obsahuje příliš mnoho částí.');
    }

    const centralOffset = view.getUint32(eocd + 16, true);
    const decoder = new TextDecoder('utf-8');
    const polozky = new Map();
    let pozice = centralOffset;

    for (let index = 0; index < pocetPolozek; index += 1) {
      if (pozice + 46 > view.byteLength || view.getUint32(pozice, true) !== 0x02014b50) {
        throw new Error('EPUB má poškozený centrální ZIP adresář.');
      }

      const flags = view.getUint16(pozice + 8, true);
      const metoda = view.getUint16(pozice + 10, true);
      const komprimovanaVelikost = view.getUint32(pozice + 20, true);
      const puvodniVelikost = view.getUint32(pozice + 24, true);
      const delkaNazvu = view.getUint16(pozice + 28, true);
      const delkaExtra = view.getUint16(pozice + 30, true);
      const delkaKomentare = view.getUint16(pozice + 32, true);
      const lokalniOffset = view.getUint32(pozice + 42, true);

      const konecNazvu = pozice + 46 + delkaNazvu;
      if (konecNazvu > view.byteLength) throw new Error('EPUB má neplatný název ZIP položky.');

      const nazev = decoder.decode(new Uint8Array(arrayBuffer, pozice + 46, delkaNazvu));
      polozky.set(normalizujCestu(nazev), {
        nazev: normalizujCestu(nazev),
        flags,
        metoda,
        komprimovanaVelikost,
        puvodniVelikost,
        lokalniOffset
      });

      pozice = konecNazvu + delkaExtra + delkaKomentare;
    }

    return { arrayBuffer, polozky };
  }

  async function nactiPolozku(zip, cesta, povinna = false) {
    const normal = normalizujCestu(cesta);
    const polozka = zip.polozky.get(normal);
    if (!polozka) {
      if (povinna) throw new Error(`EPUB neobsahuje ${normal}.`);
      return null;
    }

    if ((polozka.flags & 0x1) !== 0) {
      throw new Error('Zašifrovaný EPUB není podporovaný.');
    }

    if (polozka.puvodniVelikost > MAX_EPUB_PART_BYTES) {
      throw new Error(`EPUB část ${normal} je příliš velká.`);
    }

    const view = new DataView(zip.arrayBuffer);
    const offset = polozka.lokalniOffset;
    if (offset + 30 > view.byteLength || view.getUint32(offset, true) !== 0x04034b50) {
      throw new Error(`EPUB má poškozenou ZIP položku ${normal}.`);
    }

    const delkaNazvu = view.getUint16(offset + 26, true);
    const delkaExtra = view.getUint16(offset + 28, true);
    const zacatekDat = offset + 30 + delkaNazvu + delkaExtra;
    const konecDat = zacatekDat + polozka.komprimovanaVelikost;
    if (konecDat > view.byteLength) throw new Error(`EPUB má neúplná data ${normal}.`);

    const komprimovana = new Uint8Array(zip.arrayBuffer, zacatekDat, polozka.komprimovanaVelikost);
    if (polozka.metoda === 0) return new Uint8Array(komprimovana);

    if (polozka.metoda !== 8) {
      throw new Error(`EPUB používá nepodporovanou ZIP kompresi (${polozka.metoda}).`);
    }

    if (typeof DecompressionStream !== 'function') {
      throw new Error('Tento WebView neumí rozbalit EPUB.');
    }

    const proud = new Blob([komprimovana]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    const reader = proud.getReader();
    const kusy = [];
    let celkem = 0;

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value?.byteLength) continue;
        celkem += value.byteLength;
        if (celkem > MAX_EPUB_PART_BYTES) {
          try { await reader.cancel(); } catch (_error) {}
          throw new Error(`EPUB část ${normal} je po rozbalení příliš velká.`);
        }
        kusy.push(value);
      }
    } finally {
      try { reader.releaseLock(); } catch (_error) {}
    }

    const rozbalene = new Uint8Array(celkem);
    let cursor = 0;
    for (const kus of kusy) {
      rozbalene.set(kus, cursor);
      cursor += kus.byteLength;
    }
    return rozbalene;
  }

  async function nactiText(zip, cesta, povinna = false) {
    const data = await nactiPolozku(zip, cesta, povinna);
    if (!data) return null;
    return new TextDecoder('utf-8').decode(data);
  }

  function normalizujCestu(value) {
    const vstup = String(value || '').replace(/\\/g, '/').split('#')[0].split('?')[0];
    const vysledek = [];
    for (const cast of vstup.split('/')) {
      if (!cast || cast === '.') continue;
      if (cast === '..') {
        vysledek.pop();
        continue;
      }
      vysledek.push(cast);
    }
    return vysledek.join('/');
  }

  function dekodujCestu(value) {
    const normal = normalizujCestu(value);
    try { return decodeURIComponent(normal); } catch (_error) { return normal; }
  }

  function dirname(cesta) {
    const normal = normalizujCestu(cesta);
    const idx = normal.lastIndexOf('/');
    return idx >= 0 ? normal.slice(0, idx + 1) : '';
  }

  function resolvePath(baseFile, href) {
    const raw = String(href || '');
    const bezFragmentu = raw.split('#')[0].split('?')[0];
    if (!bezFragmentu) return normalizujCestu(baseFile);
    if (/^[a-z][a-z0-9+.-]*:/i.test(bezFragmentu)) return '';
    return dekodujCestu(`${dirname(baseFile)}${bezFragmentu}`);
  }

  function fragmentZHref(href) {
    const raw = String(href || '');
    const idx = raw.indexOf('#');
    return idx >= 0 ? raw.slice(idx + 1) : '';
  }

  function mimePodleCesty(cesta) {
    const lower = String(cesta || '').toLowerCase();
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.gif')) return 'image/gif';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.bmp')) return 'image/bmp';
    return 'application/octet-stream';
  }

  async function nactiBalicek(arrayBuffer) {
    const zip = vytvorZipIndex(arrayBuffer);
    const mimetype = await nactiText(zip, 'mimetype', false);
    if (mimetype && mimetype.trim() !== 'application/epub+zip') {
      throw new Error('Soubor není platný EPUB.');
    }

    const containerText = await nactiText(zip, 'META-INF/container.xml', true);
    const container = xml(containerText, 'EPUB container');
    const rootfile = potomci(container, 'rootfile')[0];
    const packagePath = normalizujCestu(attr(rootfile, 'full-path'));
    if (!packagePath) throw new Error('EPUB neobsahuje cestu k OPF balíčku.');

    const opfText = await nactiText(zip, packagePath, true);
    const opf = xml(opfText, 'EPUB OPF');
    const metadata = potomci(opf, 'metadata')[0] || opf.documentElement;
    const manifestNode = potomci(opf, 'manifest')[0];
    const spineNode = potomci(opf, 'spine')[0];
    if (!manifestNode || !spineNode) throw new Error('EPUB neobsahuje manifest nebo spine.');

    const title = text(potomci(metadata, 'title')[0]) || 'Kniha';
    const author = text(potomci(metadata, 'creator')[0]) || '';
    const manifest = new Map();

    for (const item of Array.from(manifestNode.children || [])) {
      if (item.localName !== 'item') continue;
      const id = attr(item, 'id');
      const href = attr(item, 'href');
      if (!id || !href) continue;
      manifest.set(id, {
        id,
        href,
        path: resolvePath(packagePath, href),
        mediaType: attr(item, 'media-type'),
        properties: attr(item, 'properties')
      });
    }

    const spine = [];
    for (const itemref of Array.from(spineNode.children || [])) {
      if (itemref.localName !== 'itemref') continue;
      const idref = attr(itemref, 'idref');
      const item = manifest.get(idref);
      if (!item?.path) continue;
      spine.push({ ...item, linear: attr(itemref, 'linear') !== 'no' });
    }

    if (!spine.length) throw new Error('EPUB nemá čitelnou posloupnost kapitol.');

    const tocMap = await nactiObsah(zip, packagePath, opf, manifest, spineNode);
    const chapters = spine.map((item, index) => ({
      href: item.path,
      title: tocMap.get(item.path) || `Kapitola ${index + 1}`
    }));

    let coverItem = Array.from(manifest.values()).find((item) => String(item.properties || '').split(/\s+/).includes('cover-image')) || null;
    if (!coverItem) {
      const coverMeta = potomci(metadata, 'meta').find((m) => String(attr(m, 'name')).toLowerCase() === 'cover');
      const coverId = attr(coverMeta, 'content');
      if (coverId) coverItem = manifest.get(coverId) || null;
    }
    if (!coverItem) {
      coverItem = Array.from(manifest.values()).find((item) => /cover/i.test(item.href || '') && /^image\//i.test(item.mediaType || '')) || null;
    }

    return { zip, packagePath, title, author, manifest, chapters, coverItem };
  }

  async function nactiObsah(zip, packagePath, opf, manifest, spineNode) {
    const map = new Map();

    const navItem = Array.from(manifest.values()).find((item) => String(item.properties || '').split(/\s+/).includes('nav'));
    if (navItem?.path) {
      try {
        const navText = await nactiText(zip, navItem.path, false);
        if (navText) {
          const navDoc = new DOMParser().parseFromString(navText, 'text/html');
          const navs = Array.from(navDoc.querySelectorAll('nav'));
          const toc = navs.find((nav) => (
            nav.getAttribute('epub:type') === 'toc' ||
            nav.getAttribute('type') === 'toc' ||
            /contents|obsah|toc/i.test(nav.getAttribute('id') || '')
          )) || navs[0];
          for (const a of Array.from(toc?.querySelectorAll('a[href]') || [])) {
            const path = resolvePath(navItem.path, a.getAttribute('href'));
            const label = text(a);
            if (path && label && !map.has(path)) map.set(path, label);
          }
        }
      } catch (_error) {}
    }

    if (map.size === 0) {
      const tocId = attr(spineNode, 'toc');
      const ncx = (tocId && manifest.get(tocId)) || Array.from(manifest.values()).find((item) => item.mediaType === 'application/x-dtbncx+xml');
      if (ncx?.path) {
        try {
          const ncxText = await nactiText(zip, ncx.path, false);
          if (ncxText) {
            const ncxDoc = xml(ncxText, 'EPUB NCX');
            for (const navPoint of potomci(ncxDoc, 'navPoint')) {
              const label = text(potomci(navPoint, 'text')[0]);
              const src = attr(potomci(navPoint, 'content')[0], 'src');
              const path = resolvePath(ncx.path, src);
              if (path && label && !map.has(path)) map.set(path, label);
            }
          }
        } catch (_error) {}
      }
    }

    return map;
  }

  async function inspect(arrayBuffer) {
    const balicek = await nactiBalicek(arrayBuffer);
    let coverBlob = null;
    if (balicek.coverItem?.path) {
      try {
        const data = await nactiPolozku(balicek.zip, balicek.coverItem.path, false);
        if (data) {
          const mime = /^image\//i.test(balicek.coverItem.mediaType || '')
            ? balicek.coverItem.mediaType
            : mimePodleCesty(balicek.coverItem.path);
          if (mime !== 'application/octet-stream' && mime !== 'image/svg+xml') {
            coverBlob = new Blob([data], { type: mime });
          }
        }
      } catch (_error) {}
    }

    return {
      title: balicek.title,
      author: balicek.author,
      coverBlob,
      chapterCount: balicek.chapters.length
    };
  }

  function povolenyStyl(styleText) {
    const povolene = new Set([
      'text-align', 'font-weight', 'font-style', 'text-decoration',
      'color', 'background-color', 'margin-left', 'margin-right',
      'text-indent', 'white-space'
    ]);
    const vysledek = [];
    for (const cast of String(styleText || '').split(';')) {
      const idx = cast.indexOf(':');
      if (idx < 1) continue;
      const klic = cast.slice(0, idx).trim().toLowerCase();
      const hodnota = cast.slice(idx + 1).trim();
      if (!povolene.has(klic) || !hodnota) continue;
      if (/url\s*\(|expression\s*\(|javascript:/i.test(hodnota)) continue;
      vysledek.push(`${klic}:${hodnota}`);
    }
    return vysledek.join(';');
  }

  async function sanitizujKapitolu(balicek, chapterPath) {
    const raw = await nactiText(balicek.zip, chapterPath, true);
    const doc = new DOMParser().parseFromString(raw, 'text/html');
    const source = doc.body || doc.documentElement;
    const objectUrls = [];

    const povoleneTagy = new Set([
      'p','div','span','section','article','header','footer','main','nav',
      'h1','h2','h3','h4','h5','h6','ul','ol','li','blockquote','pre','code',
      'em','strong','b','i','u','s','small','sup','sub','hr','br',
      'table','thead','tbody','tfoot','tr','th','td','figure','figcaption','img','a'
    ]);

    const zakazane = new Set(['script','iframe','object','embed','form','input','button','textarea','select','option','video','audio','canvas','svg','math','link','style']);

    const vytvor = async (node) => {
      if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.nodeValue || '');
      if (node.nodeType !== Node.ELEMENT_NODE) return null;

      const tag = node.tagName.toLowerCase();
      if (zakazane.has(tag)) return null;

      if (!povoleneTagy.has(tag)) {
        const frag = document.createDocumentFragment();
        for (const child of Array.from(node.childNodes || [])) {
          const clone = await vytvor(child);
          if (clone) frag.appendChild(clone);
        }
        return frag;
      }

      const el = document.createElement(tag);
      const id = node.getAttribute('id');
      if (id) el.id = id.slice(0, 160);
      const safeStyle = povolenyStyl(node.getAttribute('style'));
      if (safeStyle) el.setAttribute('style', safeStyle);

      if (tag === 'td' || tag === 'th') {
        const colspan = Number(node.getAttribute('colspan'));
        const rowspan = Number(node.getAttribute('rowspan'));
        if (Number.isFinite(colspan) && colspan > 1 && colspan < 50) el.colSpan = colspan;
        if (Number.isFinite(rowspan) && rowspan > 1 && rowspan < 50) el.rowSpan = rowspan;
      }

      if (tag === 'img') {
        const src = node.getAttribute('src') || '';
        const path = resolvePath(chapterPath, src);
        if (!path) return null;
        try {
          const data = await nactiPolozku(balicek.zip, path, false);
          if (!data) return null;
          const manifestItem = Array.from(balicek.manifest.values()).find((item) => item.path === path);
          const mime = /^image\//i.test(manifestItem?.mediaType || '') ? manifestItem.mediaType : mimePodleCesty(path);
          if (mime === 'application/octet-stream' || mime === 'image/svg+xml') return null;
          const url = URL.createObjectURL(new Blob([data], { type: mime }));
          objectUrls.push(url);
          el.src = url;
          el.alt = String(node.getAttribute('alt') || '');
          el.loading = 'lazy';
        } catch (_error) {
          return null;
        }
      }

      if (tag === 'a') {
        const href = String(node.getAttribute('href') || '').trim();
        if (/^(https?:|mailto:)/i.test(href)) {
          el.href = href;
          el.target = '_blank';
          el.rel = 'noopener noreferrer';
        } else if (href) {
          el.href = '#';
          el.dataset.epubLink = href;
        }
      }

      for (const child of Array.from(node.childNodes || [])) {
        const clone = await vytvor(child);
        if (clone) el.appendChild(clone);
      }
      return el;
    };

    const wrapper = document.createElement('div');
    for (const child of Array.from(source.childNodes || [])) {
      const clone = await vytvor(child);
      if (clone) wrapper.appendChild(clone);
    }

    return { html: wrapper.innerHTML, objectUrls };
  }

  async function open(arrayBuffer) {
    const balicek = await nactiBalicek(arrayBuffer);

    return {
      title: balicek.title,
      author: balicek.author,
      chapters: balicek.chapters.map((chapter) => ({ ...chapter })),
      async renderChapter(index) {
        const i = Math.max(0, Math.min(balicek.chapters.length - 1, Number(index) || 0));
        const chapter = balicek.chapters[i];
        const rendered = await sanitizujKapitolu(balicek, chapter.href);
        return { ...rendered, chapter, index: i };
      },
      resolveLink(href, currentChapterPath) {
        const raw = String(href || '');
        const path = raw.startsWith('#')
          ? normalizujCestu(currentChapterPath)
          : resolvePath(currentChapterPath, raw);
        const fragment = fragmentZHref(raw);
        const index = balicek.chapters.findIndex((chapter) => chapter.href === path);
        return { index, fragment };
      }
    };
  }

  window.LubaNoteEpubReader = { inspect, open };
})();
