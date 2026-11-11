/*
  Browser-only storage for uploaded course materials (IndexedDB).

  Files are kept per signed-in user in THIS browser. They are not sent to the LECTRA
  server, so they are not available on other devices and are lost if the browser's
  site data is cleared.

  Stored record: { id, userKey, name, type, size, addedAt, file }   (file: the File itself)
*/
const DB_NAME = "lectra-materials";
const DB_VERSION = 1;
const STORE = "files";

export function isMaterialStorageAvailable() {
  return typeof indexedDB !== "undefined";
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, { keyPath: "id" });
      store.createIndex("userKey", "userKey");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("the materials database is open in another tab with an older version"));
  });
}

/* Runs `work(store)` in a transaction and resolves with its request's result once committed. */
async function withStore(mode, work) {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = work(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(request?.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error("the browser cancelled the save"));
    });
  } finally {
    db.close();
  }
}

/* The user's materials, oldest first. */
export async function listMaterials(userKey) {
  const records = await withStore("readonly", (store) => store.index("userKey").getAll(userKey));
  return records.sort((a, b) => a.addedAt.localeCompare(b.addedAt));
}

export function saveMaterial(record) {
  return withStore("readwrite", (store) => store.put(record));
}

export function deleteMaterial(id) {
  return withStore("readwrite", (store) => store.delete(id));
}

/* A readable reason for a failed save. */
export function describeStorageError(error) {
  if (error?.name === "QuotaExceededError") return "browser storage is full";
  return error?.message || String(error);
}
