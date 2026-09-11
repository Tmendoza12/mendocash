import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { SCHEMA } from './schema.js';
import { seed } from './seed.js';

let db = null;
let SQL = null;
let saveTimer = null;

const IDB_NAME = 'mendocash-v2';
const IDB_STORE = 'sqlite';
const IDB_KEY = 'db';

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadSaved() {
  try {
    const idb = await idbOpen();
    return await new Promise((resolve) => {
      const tx = idb.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => resolve(req.result ? new Uint8Array(req.result) : null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function saveNow() {
  if (!db) return;
  const data = db.export();
  try {
    const idb = await idbOpen();
    await new Promise((resolve) => {
      const tx = idb.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(data, IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* persistencia no disponible */
  }
}

export function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 400);
}

function normalize(params) {
  return params.map((p) => {
    if (p === undefined) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    if (p instanceof Date) return p.toISOString().slice(0, 10);
    return p;
  });
}

export async function ensureOpen() {
  if (db) return db;
  SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const saved = await loadSaved();
  if (saved) {
    db = new SQL.Database(saved);
  } else {
    db = new SQL.Database();
    db.run(SCHEMA);
    seed(db);
    await saveNow();
  }
  return db;
}

export function all(sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(normalize(params));
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    return rows;
  } finally {
    stmt.free();
  }
}

export function get(sql, params = []) {
  return all(sql, params)[0];
}

export function run(sql, params = []) {
  db.run(sql, normalize(params));
  scheduleSave();
}

export function lastId() {
  const r = db.exec('SELECT last_insert_rowid()');
  return r.length ? r[0].values[0][0] : null;
}

export function insert(sql, params = []) {
  run(sql, params);
  return lastId();
}

export function tx(fn) {
  db.run('BEGIN');
  try {
    const result = fn();
    db.run('COMMIT');
    scheduleSave();
    return result;
  } catch (e) {
    db.run('ROLLBACK');
    throw e;
  }
}
