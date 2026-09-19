/* ============================================================
   LUBANOTE – LEGACY WORD DOC READER (PATCH 642)
   ------------------------------------------------------------
   Bezpečný lokální čtečkový parser pro Word 97–2003 .DOC.
   - čte OLE/CFB kontejner přímo v prohlížeči / WebView
   - z WordDocument + 0Table/1Table načte text přes Piece Table
   - nic neodesílá na server
   - záměrně nevykresluje makra, OLE objekty ani aktivní obsah
   - první verze zachovává hlavně čitelný text, ne celý Word layout
   ============================================================ */

(() => {
  'use strict';

  const MAX_DOC_BYTES = 24 * 1024 * 1024;
  const MAX_STREAM_BYTES = 64 * 1024 * 1024;
  const MAX_CHAIN_SECTORS = 160000;
  const MAX_DIRECTORY_ENTRIES = 12000;

  const FREESECT = 0xFFFFFFFF;
  const ENDOFCHAIN = 0xFFFFFFFE;
  const FATSECT = 0xFFFFFFFD;
  const DIFSECT = 0xFFFFFFFC;

  function chyba(text) {
    throw new Error(text);
  }

  function zajistiRozsah(bytes, offset, length, popis = 'data') {
    if (
      !Number.isFinite(offset) ||
      !Number.isFinite(length) ||
      offset < 0 ||
      length < 0 ||
      offset + length > bytes.byteLength
    ) {
      chyba(`DOC má poškozená ${popis}.`);
    }
  }

  function u16(view, offset) {
    if (offset < 0 || offset + 2 > view.byteLength) chyba('DOC má neplatnou strukturu.');
    return view.getUint16(offset, true);
  }

  function u32(view, offset) {
    if (offset < 0 || offset + 4 > view.byteLength) chyba('DOC má neplatnou strukturu.');
    return view.getUint32(offset, true);
  }

  function u64Safe(view, offset) {
    if (offset < 0 || offset + 8 > view.byteLength) chyba('DOC má neplatnou velikost streamu.');
    const low = BigInt(view.getUint32(offset, true));
    const high = BigInt(view.getUint32(offset + 4, true));
    const value = low | (high << 32n);
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) chyba('DOC stream je příliš velký.');
    return Number(value);
  }

  function spojCasti(casti, limit = MAX_STREAM_BYTES) {
    let celkem = 0;
    for (const cast of casti) {
      celkem += cast.byteLength;
      if (celkem > limit) chyba('DOC obsahuje příliš velká data.');
    }

    const out = new Uint8Array(celkem);
    let offset = 0;
    for (const cast of casti) {
      out.set(cast, offset);
      offset += cast.byteLength;
    }
    return out;
  }

  function orezej(bytes, size) {
    const real = Math.max(0, Math.min(Number(size) || 0, bytes.byteLength));
    return bytes.slice(0, real);
  }

  function nactiNazevAdresare(entryBytes, entryView) {
    const delka = u16(entryView, 64);
    if (delka < 2 || delka > 64 || delka % 2 !== 0) return '';
    try {
      return new TextDecoder('utf-16le', { fatal: false })
        .decode(entryBytes.slice(0, delka - 2))
        .replace(/\u0000+$/g, '');
    } catch {
      return '';
    }
  }

  function codePageProLid(lid) {
    const primary = Number(lid) & 0x03FF;

    // Střední Evropa – důležité hlavně pro staré české/slovenské DOC.
    if ([0x05, 0x0E, 0x15, 0x18, 0x1A, 0x1B, 0x24].includes(primary)) return 'windows-1250';
    // Cyrilice.
    if ([0x02, 0x19, 0x22, 0x23, 0x2F].includes(primary)) return 'windows-1251';
    if (primary === 0x08) return 'windows-1253';
    if (primary === 0x1F) return 'windows-1254';
    if (primary === 0x0D) return 'windows-1255';
    if ([0x01, 0x20].includes(primary)) return 'windows-1256';
    if ([0x25, 0x26, 0x27].includes(primary)) return 'windows-1257';
    if (primary === 0x2A) return 'windows-1258';
    return 'windows-1252';
  }

  class CfbReader {
    constructor(buffer) {
      if (!(buffer instanceof ArrayBuffer)) chyba('DOC data nejsou dostupná.');
      if (buffer.byteLength < 512) chyba('Soubor není platný Word DOC.');
      if (buffer.byteLength > MAX_DOC_BYTES) chyba('DOC je příliš velký. Maximální velikost je 24 MB.');

      this.bytes = new Uint8Array(buffer);
      this.view = new DataView(buffer);
      this.sectorSize = 0;
      this.miniSectorSize = 0;
      this.miniStreamCutoff = 4096;
      this.fat = [];
      this.miniFat = [];
      this.directory = [];
      this.root = null;
      this.rootMiniStream = new Uint8Array(0);
      this._parseHeaderAndFat();
      this._parseDirectory();
      this._parseMiniFat();
    }

    _parseHeaderAndFat() {
      const sig = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
      for (let i = 0; i < sig.length; i += 1) {
        if (this.bytes[i] !== sig[i]) chyba('Soubor není starý Word DOC (OLE/CFB).');
      }

      const sectorShift = u16(this.view, 0x1E);
      const miniShift = u16(this.view, 0x20);
      this.sectorSize = 2 ** sectorShift;
      this.miniSectorSize = 2 ** miniShift;

      if (![512, 4096].includes(this.sectorSize) || this.miniSectorSize !== 64) {
        chyba('DOC používá nepodporovanou velikost sektorů.');
      }

      this.numFatSectors = u32(this.view, 0x2C);
      this.firstDirSector = u32(this.view, 0x30);
      this.miniStreamCutoff = u32(this.view, 0x38) || 4096;
      this.firstMiniFatSector = u32(this.view, 0x3C);
      this.numMiniFatSectors = u32(this.view, 0x40);
      this.firstDifatSector = u32(this.view, 0x44);
      this.numDifatSectors = u32(this.view, 0x48);

      const difat = [];
      for (let i = 0; i < 109; i += 1) {
        const sid = u32(this.view, 0x4C + i * 4);
        if (sid !== FREESECT) difat.push(sid);
      }

      let difatSid = this.firstDifatSector;
      const difatSeen = new Set();
      const idsPerDifatSector = this.sectorSize / 4 - 1;

      for (let n = 0; n < this.numDifatSectors && difatSid !== ENDOFCHAIN; n += 1) {
        if (difatSeen.has(difatSid)) chyba('DOC má cyklus v DIFAT.');
        difatSeen.add(difatSid);
        const sector = this._sector(difatSid);
        const dv = new DataView(sector.buffer, sector.byteOffset, sector.byteLength);
        for (let i = 0; i < idsPerDifatSector; i += 1) {
          const sid = u32(dv, i * 4);
          if (sid !== FREESECT) difat.push(sid);
        }
        difatSid = u32(dv, idsPerDifatSector * 4);
      }

      if (difat.length < this.numFatSectors) chyba('DOC má neúplnou FAT tabulku.');

      const fatEntries = [];
      for (let i = 0; i < this.numFatSectors; i += 1) {
        const sid = difat[i];
        if ([FREESECT, ENDOFCHAIN, FATSECT, DIFSECT].includes(sid)) chyba('DOC má neplatný FAT sektor.');
        const sector = this._sector(sid);
        const dv = new DataView(sector.buffer, sector.byteOffset, sector.byteLength);
        for (let p = 0; p < sector.byteLength; p += 4) fatEntries.push(u32(dv, p));
      }
      this.fat = fatEntries;
    }

    _sector(sid) {
      if (!Number.isInteger(sid) || sid < 0) chyba('DOC odkazuje na neplatný sektor.');
      const offset = (sid + 1) * this.sectorSize;
      zajistiRozsah(this.bytes, offset, this.sectorSize, 'sektory');
      return this.bytes.slice(offset, offset + this.sectorSize);
    }

    _readFatChain(startSid, wantedSize = null, hardLimit = MAX_STREAM_BYTES) {
      if (startSid === ENDOFCHAIN || startSid === FREESECT) return new Uint8Array(0);
      const casti = [];
      const seen = new Set();
      let sid = startSid;
      let total = 0;
      const limitSektoru = Math.min(
        MAX_STREAM_BYTES + this.sectorSize,
        Math.max(hardLimit, wantedSize === null ? 0 : wantedSize) + this.sectorSize
      );

      while (sid !== ENDOFCHAIN && sid !== FREESECT) {
        if (!Number.isInteger(sid) || sid < 0 || sid >= this.fat.length) chyba('DOC má neplatný řetězec sektorů.');
        if (seen.has(sid)) chyba('DOC má cyklus v řetězci sektorů.');
        if (seen.size > MAX_CHAIN_SECTORS) chyba('DOC má příliš dlouhý řetězec sektorů.');
        seen.add(sid);

        const sector = this._sector(sid);
        casti.push(sector);
        total += sector.byteLength;
        if (total > limitSektoru) chyba('DOC stream je příliš velký.');
        if (wantedSize !== null && total >= wantedSize) break;

        const next = this.fat[sid];
        if ([FATSECT, DIFSECT].includes(next)) chyba('DOC má poškozený řetězec sektorů.');
        sid = next;
      }

      const out = spojCasti(casti, limitSektoru);
      return wantedSize === null ? out : orezej(out, wantedSize);
    }

    _parseDirectory() {
      const bytes = this._readFatChain(this.firstDirSector, null, 16 * 1024 * 1024);
      const entries = [];
      const count = Math.min(Math.floor(bytes.byteLength / 128), MAX_DIRECTORY_ENTRIES);

      for (let i = 0; i < count; i += 1) {
        const entryBytes = bytes.slice(i * 128, i * 128 + 128);
        const entryView = new DataView(entryBytes.buffer, entryBytes.byteOffset, entryBytes.byteLength);
        const type = entryBytes[66];
        if (type !== 2 && type !== 5) continue;
        const name = nactiNazevAdresare(entryBytes, entryView);
        if (!name) continue;
        const startSector = u32(entryView, 116);
        const size = u64Safe(entryView, 120);
        const entry = { name, type, startSector, size };
        entries.push(entry);
        if (type === 5 && name.toLowerCase() === 'root entry') this.root = entry;
      }

      if (!this.root) chyba('DOC nemá Root Entry.');
      this.directory = entries;
      this.rootMiniStream = this._readFatChain(this.root.startSector, this.root.size, Math.min(MAX_STREAM_BYTES, Math.max(this.root.size, 1)));
    }

    _parseMiniFat() {
      if (!this.numMiniFatSectors || this.firstMiniFatSector === ENDOFCHAIN || this.firstMiniFatSector === FREESECT) {
        this.miniFat = [];
        return;
      }

      const wanted = this.numMiniFatSectors * this.sectorSize;
      const bytes = this._readFatChain(this.firstMiniFatSector, wanted, Math.min(16 * 1024 * 1024, Math.max(wanted, 1)));
      const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const arr = [];
      for (let offset = 0; offset + 4 <= bytes.byteLength; offset += 4) arr.push(u32(dv, offset));
      this.miniFat = arr;
    }

    _readMiniChain(startMiniSid, wantedSize) {
      if (startMiniSid === ENDOFCHAIN || startMiniSid === FREESECT) return new Uint8Array(0);
      const casti = [];
      const seen = new Set();
      let sid = startMiniSid;
      let total = 0;

      while (sid !== ENDOFCHAIN && sid !== FREESECT && total < wantedSize) {
        if (!Number.isInteger(sid) || sid < 0 || sid >= this.miniFat.length) chyba('DOC má neplatný mini-stream.');
        if (seen.has(sid)) chyba('DOC má cyklus v mini-streamu.');
        if (seen.size > MAX_CHAIN_SECTORS) chyba('DOC má příliš dlouhý mini-stream.');
        seen.add(sid);

        const offset = sid * this.miniSectorSize;
        zajistiRozsah(this.rootMiniStream, offset, this.miniSectorSize, 'mini-stream data');
        casti.push(this.rootMiniStream.slice(offset, offset + this.miniSectorSize));
        total += this.miniSectorSize;
        sid = this.miniFat[sid];
      }

      const miniLimit = Math.min(MAX_STREAM_BYTES + this.miniSectorSize, Math.max(wantedSize, 1) + this.miniSectorSize);
      return orezej(spojCasti(casti, miniLimit), wantedSize);
    }

    stream(name) {
      const lower = String(name || '').toLowerCase();
      const entry = this.directory.find((item) => item.type === 2 && item.name.toLowerCase() === lower);
      if (!entry) return null;
      if (entry.size > MAX_STREAM_BYTES) chyba(`DOC stream ${entry.name} je příliš velký.`);

      if (entry.size < this.miniStreamCutoff) {
        return this._readMiniChain(entry.startSector, entry.size);
      }
      return this._readFatChain(entry.startSector, entry.size, Math.max(entry.size, 1));
    }
  }

  function parsujFib(wordBytes) {
    if (!(wordBytes instanceof Uint8Array) || wordBytes.byteLength < 160) chyba('DOC nemá platný WordDocument stream.');
    const view = new DataView(wordBytes.buffer, wordBytes.byteOffset, wordBytes.byteLength);
    if (u16(view, 0) !== 0xA5EC) chyba('Soubor není podporovaný Word DOC.');

    const nFib = u16(view, 2);
    if (nFib < 0x00C1) {
      chyba('Tento první DOC viewer podporuje Word 97–2003. Starší Word 6/95 zatím ne.');
    }

    const lid = u16(view, 6);
    const flags = u16(view, 10);
    const tableName = (flags & 0x0200) !== 0 ? '1Table' : '0Table';
    const fcMin = u32(view, 24);
    const fcMac = u32(view, 28);

    let pos = 32;
    const csw = u16(view, pos);
    pos += 2 + csw * 2;
    if (pos + 2 > wordBytes.byteLength) chyba('DOC má poškozený FIB.');

    const cslw = u16(view, pos);
    const lwStart = pos + 2;
    if (cslw < 4) chyba('DOC nemá údaj o délce textu.');
    const ccpText = u32(view, lwStart + 3 * 4);
    pos = lwStart + cslw * 4;
    if (pos + 2 > wordBytes.byteLength) chyba('DOC má poškozený FIB.');

    const cbRgFcLcb = u16(view, pos);
    const fcLcbStart = pos + 2;
    if (cbRgFcLcb < 34 || fcLcbStart + cbRgFcLcb * 8 > wordBytes.byteLength) {
      chyba('DOC nemá podporovanou Piece Table strukturu.');
    }

    const fcClx = u32(view, fcLcbStart + 66 * 4);
    const lcbClx = u32(view, fcLcbStart + 67 * 4);

    return {
      nFib,
      lid,
      tableName,
      fcMin,
      fcMac,
      ccpText,
      fcClx,
      lcbClx
    };
  }

  function decodeCompressed(bytes, lid) {
    const label = codePageProLid(lid);
    try {
      return new TextDecoder(label, { fatal: false }).decode(bytes);
    } catch {
      return new TextDecoder('windows-1252', { fatal: false }).decode(bytes);
    }
  }

  function vycistiWordText(text) {
    return String(text || '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\u000b/g, '\n')
      .replace(/\u000c/g, '\n\n')
      .replace(/\u0007/g, '\t')
      .replace(/[\u0001\u0002\u0003\u0004\u0005\u0006\u0008]/g, '')
      .replace(/[\u0013\u0014\u0015]/g, '')
      .replace(/\u0000/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{4,}/g, '\n\n\n')
      .trim();
  }

  function vytahniTextZPieceTable(wordBytes, tableBytes, fib) {
    if (!tableBytes) chyba(`DOC neobsahuje stream ${fib.tableName}.`);
    const tableView = new DataView(tableBytes.buffer, tableBytes.byteOffset, tableBytes.byteLength);
    if (fib.lcbClx <= 0) chyba('DOC nemá Piece Table.');
    zajistiRozsah(tableBytes, fib.fcClx, fib.lcbClx, 'Piece Table');

    let pos = fib.fcClx;
    const end = fib.fcClx + fib.lcbClx;
    let plcStart = -1;
    let plcSize = 0;

    while (pos < end) {
      const clxt = tableBytes[pos];
      if (clxt === 0x01) {
        if (pos + 3 > end) chyba('DOC má poškozený CLX.');
        const cbGrpprl = u16(tableView, pos + 1);
        pos += 3 + cbGrpprl;
        continue;
      }
      if (clxt === 0x02) {
        if (pos + 5 > end) chyba('DOC má poškozenou Piece Table.');
        plcSize = u32(tableView, pos + 1);
        plcStart = pos + 5;
        break;
      }
      chyba('DOC obsahuje neznámý CLX blok.');
    }

    if (plcStart < 0 || plcSize < 4) chyba('DOC nemá použitelnou Piece Table.');
    zajistiRozsah(tableBytes, plcStart, plcSize, 'PlcPcd');

    const countRaw = (plcSize - 4) / 12;
    const pieceCount = Math.floor(countRaw);
    if (pieceCount < 1 || Math.abs(countRaw - pieceCount) > 0.0001) chyba('DOC má poškozenou PlcPcd tabulku.');
    if (pieceCount > 200000) chyba('DOC obsahuje příliš mnoho textových částí.');

    const cpBase = plcStart;
    const pcdBase = cpBase + (pieceCount + 1) * 4;
    const chunks = [];
    const mainEndCp = Math.max(0, fib.ccpText);

    for (let i = 0; i < pieceCount; i += 1) {
      const cpStart = u32(tableView, cpBase + i * 4);
      const cpEnd = u32(tableView, cpBase + (i + 1) * 4);
      if (cpEnd <= cpStart || cpStart >= mainEndCp) continue;

      const useEnd = Math.min(cpEnd, mainEndCp);
      const chars = useEnd - cpStart;
      if (chars <= 0) continue;

      const pcdOffset = pcdBase + i * 8;
      if (pcdOffset + 8 > plcStart + plcSize) chyba('DOC má poškozený PCD záznam.');
      const fcRaw = u32(tableView, pcdOffset + 2);
      const compressed = (fcRaw & 0x40000000) !== 0;
      const fcMasked = fcRaw & 0x3FFFFFFF;
      const byteOffset = compressed ? Math.floor(fcMasked / 2) : fcMasked;
      const byteLength = compressed ? chars : chars * 2;
      zajistiRozsah(wordBytes, byteOffset, byteLength, 'textová data');
      const slice = wordBytes.slice(byteOffset, byteOffset + byteLength);

      const decoded = compressed
        ? decodeCompressed(slice, fib.lid)
        : new TextDecoder('utf-16le', { fatal: false }).decode(slice);
      chunks.push(decoded);
    }

    return vycistiWordText(chunks.join(''));
  }

  function vytahniJednoduchyText(wordBytes, fib) {
    // Nouzový fallback pro jednoduchý nekomplexní dokument.
    if (!fib.fcMin || fib.fcMac <= fib.fcMin || fib.fcMac > wordBytes.byteLength) return '';
    const slice = wordBytes.slice(fib.fcMin, fib.fcMac);
    let unicode = '';
    try { unicode = new TextDecoder('utf-16le', { fatal: false }).decode(slice); } catch {}
    const ansi = decodeCompressed(slice, fib.lid);
    const u = vycistiWordText(unicode);
    const a = vycistiWordText(ansi);
    return u.replace(/[\uFFFD]/g, '').length >= a.length * 0.6 ? u : a;
  }

  async function parse(arrayBuffer) {
    const cfb = new CfbReader(arrayBuffer);
    const word = cfb.stream('WordDocument');
    if (!word) chyba('DOC neobsahuje WordDocument stream.');
    const fib = parsujFib(word);
    const table = cfb.stream(fib.tableName) || cfb.stream(fib.tableName === '1Table' ? '0Table' : '1Table');

    let text = '';
    if (fib.lcbClx > 0 && table) {
      text = vytahniTextZPieceTable(word, table, fib);
    }
    if (!text) text = vytahniJednoduchyText(word, fib);
    if (!text) chyba('DOC neobsahuje čitelný text nebo používá variantu, kterou viewer zatím neumí.');

    return {
      text,
      metadata: {
        nFib: fib.nFib,
        lid: fib.lid,
        textLength: text.length
      }
    };
  }

  window.LubaNoteLegacyDoc = Object.freeze({ parse });
})();
