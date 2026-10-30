/* LubaNote 697M – LOCAL notes, attachments and drafts at rest.
 * Domain-separated AES-256-GCM via existing E2E Account Root Key.
 * No additional password, no independent persistent key.
 */
(() => {
  'use strict';
  const DB = 'LubaNoteLocalVault697M';
  const NOTE_STORE = 'notes';
  let dbPromise = null;
  let currentOwner = null;
  let cache = null;
  let preparing = null;
  let writes = Promise.resolve();
  let lastPersisted = null;
  let saveVersion = 0;
  const encode = (s) => new TextEncoder().encode(s);
  const decode = (u) => new TextDecoder().decode(u);
  const owner = () => String(localStorage.getItem('lubanoteLocalOwnerUserId') || '').trim();
  const valid = (notes) => Array.isArray(notes) && notes.every(n =>
    n && typeof n === 'object' && typeof n.id === 'string' && n.id &&
    n.storageScope === 'local' && n.isSecret !== true);
  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(NOTE_STORE)) db.createObjectStore(NOTE_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { dbPromise = null; reject(req.error || new Error('LOCAL vault unavailable')); };
    });
    return dbPromise;
  }
  async function read(store, id) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const req = db.transaction(store, 'readonly').objectStore(store).get(id);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error || new Error('LOCAL vault read failed'));
    });
  }
  async function put(store, id, value) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(value, id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error('LOCAL vault write failed'));
      tx.onabort = () => reject(tx.error || new Error('LOCAL vault aborted'));
    });
  }
  // E2E Account Root Key is the ONLY key source. Never create or persist a
  // standalone LOCAL key. Domain separation prevents cross-purpose key reuse.
  async function keyFor(userId) {
    const core = window.LubaNoteE2ECore;
    if (!core?.getStav || !core?.odvodDomenovyKlic || !core?.pripravRootKlicProUcet) {
      throw new Error('697M: E2E Core unavailable');
    }
    let state = core.getStav();
    if (state?.ready !== true || state.userId !== userId) {
      state = await core.pripravRootKlicProUcet(userId);
    }
    if (state?.ready !== true || state.userId !== userId || !state.keyId) {
      throw new Error('697M: E2E Root Key locked');
    }
    const key = await core.odvodDomenovyKlic('local-at-rest-697M-v1');
    const after = core.getStav();
    if (after?.ready !== true || after.userId !== userId || after.keyId !== state.keyId) {
      throw new Error('697M: E2E account or key changed during operation');
    }
    return { key, keyId: state.keyId };
  }
  async function encrypt(userId, plain, purpose) {
    if (owner() !== userId) throw new Error('LOCAL vault: owner changed');
    const { key, keyId } = await keyFor(userId);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = typeof plain === 'string' ? encode(plain) : plain;
    const cipher = await crypto.subtle.encrypt({
      name: 'AES-GCM', iv, additionalData: encode(`LubaNote-697M:${userId}:${purpose}`)
    }, key, data);
    if (owner() !== userId) throw new Error('LOCAL vault: owner changed');
    return { version: 2, keyId, iv: Array.from(iv), cipher };
  }
  async function decrypt(userId, record, purpose) {
    if (record?.version !== 2 || typeof record.keyId !== 'string' ||
        !Array.isArray(record.iv) || record.iv.length !== 12 ||
        !(record.cipher instanceof ArrayBuffer)) throw new Error('697M: invalid ciphertext');
    const { key, keyId } = await keyFor(userId);
    if (keyId !== record.keyId) throw new Error('697M: different E2E root key');
    return crypto.subtle.decrypt({
      name: 'AES-GCM', iv: new Uint8Array(record.iv),
      additionalData: encode(`LubaNote-697M:${userId}:${purpose}`)
    }, key, record.cipher);
  }
  function snapshot() {
    if (owner() !== currentOwner || !cache) return null;
    return structuredClone(cache);
  }
  function reconcile(a, b) {
    const byId = new Map();
    for (const note of a) byId.set(note.id, note);
    for (const note of b) {
      const vaulted = byId.get(note.id);
      if (!vaulted) { byId.set(note.id, note); continue; }
      // After a crash older plaintext may remain alongside a newer verified
      // encrypted revision. Never overwrite that revision with stale legacy.
      const oldTime = Date.parse(vaulted.updatedAt || '') || 0;
      const plainTime = Date.parse(note.updatedAt || '') || 0;
      if (plainTime > oldTime) byId.set(note.id, note);
    }
    return Array.from(byId.values());
  }
  async function prepare(legacyNotes = []) {
    const userId = owner();
    if (!userId) {
      if (legacyNotes.length) throw new Error('LOCAL vault: missing owner');
      return { ready: false, migrated: false, count: 0 };
    }
    if (!valid(legacyNotes)) throw new Error('LOCAL vault: invalid legacy LOCAL data');
    if (currentOwner === userId && cache !== null && legacyNotes.length === 0) {
      return { ready: true, migrated: false, count: cache.length };
    }
    if (preparing) return preparing;
    preparing = (async () => {
      const record = await read(NOTE_STORE, userId);
      let old = [];
      if (record) {
        old = JSON.parse(decode(new Uint8Array(await decrypt(userId, record, 'notes'))));
        if (!valid(old)) throw new Error('LOCAL vault: invalid persisted notes');
      }
      const combined = reconcile(old, legacyNotes);
      if (legacyNotes.length) {
        await persist(userId, combined);  // encrypt, read back, verify BEFORE caller removes plaintext
      }
      if (owner() !== userId) throw new Error('LOCAL vault: owner changed during hydration');
      currentOwner = userId;
      cache = structuredClone(combined);
      lastPersisted = structuredClone(combined);
      return { ready: true, migrated: legacyNotes.length > 0, count: combined.length };
    })().finally(() => { preparing = null; });
    return preparing;
  }
  async function persist(userId, notes) {
    if (!valid(notes)) throw new Error('LOCAL vault: invalid notes');
    const plaintext = JSON.stringify(notes);
    const encrypted = await encrypt(userId, plaintext, 'notes');
    await put(NOTE_STORE, userId, encrypted);
    const check = await read(NOTE_STORE, userId);
    const verified = decode(new Uint8Array(await decrypt(userId, check, 'notes')));
    if (verified !== plaintext) throw new Error('LOCAL vault: verification failed');
    return true;
  }
  function save(notes) {
    const userId = owner();
    if (!userId || !valid(notes)) return Promise.reject(new Error('LOCAL vault: invalid save'));
    if (currentOwner !== userId || cache === null) {
      return Promise.reject(new Error('LOCAL vault: hydration incomplete'));
    }
    const snapshotNotes = structuredClone(notes);
    const version = ++saveVersion;
    // Keep synchronous in-memory read-after-write for existing UI paths.
    cache = structuredClone(snapshotNotes);
    const task = async () => {
      await persist(userId, snapshotNotes);
      if (currentOwner === userId && owner() === userId) {
        lastPersisted = structuredClone(snapshotNotes);
      }
      return true;
    };
    writes = writes.catch(() => false).then(task).catch(error => {
      // Never let an uncommitted optimistic snapshot masquerade as saved.
      if (currentOwner === userId && owner() === userId && version === saveVersion) {
        cache = lastPersisted === null ? null : structuredClone(lastPersisted);
      }
      throw error;
    });
    return writes;
  }
  async function encryptDraft(draft) {
    const userId = owner();
    if (!userId || draft?.ownerUserId !== userId || draft.secret === true) {
      throw new Error('697M: invalid draft owner');
    }
    const { version, keyId, iv, cipher } = await encrypt(userId, JSON.stringify(draft), 'draft');
    return { ownerUserId:userId, localEncrypted697M:1, version, keyId, iv, cipher };
  }
  async function decryptDraft(record) {
    const userId = owner();
    if (!userId || record?.ownerUserId !== userId || record.localEncrypted697M !== 1) {
      throw new Error('697M: invalid encrypted draft owner');
    }
    const bytes = await decrypt(userId, record, 'draft');
    const draft = JSON.parse(decode(new Uint8Array(bytes)));
    if (!draft || draft.ownerUserId !== userId || draft.secret === true) {
      throw new Error('697M: draft owner validation failed');
    }
    return draft;
  }
  async function encryptBlob(blob, id) {
    const userId = owner();
    if (!(blob instanceof Blob) || !id) throw new Error('LOCAL vault: invalid blob');
    const encrypted = await encrypt(userId, await blob.arrayBuffer(), `attachment:${id}`);
    return { encryptedBlob: new Blob([encrypted.cipher], { type: 'application/octet-stream' }),
      encryptedIv: encrypted.iv, encryptedKeyId: encrypted.keyId, localEncrypted697M: 1 };
  }
  async function decryptBlob(record) {
    if (record?.localEncrypted697M !== 1) return record;
    const userId = owner();
    const cipher = await record.blob.arrayBuffer();
    const plain = await decrypt(userId, {
      version: 2, keyId: record.encryptedKeyId, cipher, iv: record.encryptedIv
    }, `attachment:${record.id}`);
    return { ...record, blob: new Blob([plain], { type: record.mimeType || 'image/jpeg' }) };
  }
  function clearMemory() { cache = null; currentOwner = null; lastPersisted = null; saveVersion += 1; }
  window.LubaNoteLocalVault697M = Object.freeze({
    prepare, save, snapshot, encryptBlob, decryptBlob, encryptDraft, decryptDraft, clearMemory,
    getStatus: () => ({ ready: owner() === currentOwner && cache !== null,
      count: owner() === currentOwner && cache ? cache.length : 0 })
  });
})();
