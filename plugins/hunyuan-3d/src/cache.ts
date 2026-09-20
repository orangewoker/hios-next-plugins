const DB_NAME = 'hunyuan-3d-models';
const STORE = 'files';

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('模型缓存不可用'));
  });
}

async function transact<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore, resolve: (value: T) => void, reject: (error: Error) => void) => void) {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    let value: T;
    const onSuccess = (next: T) => { value = next; if (mode === 'readonly') resolve(next); };
    operation(transaction.objectStore(STORE), onSuccess, reject);
    transaction.oncomplete = () => { db.close(); if (mode === 'readwrite') resolve(value); };
    transaction.onerror = () => { db.close(); reject(transaction.error || new Error('模型缓存操作失败')); };
  });
}

export async function readCachedFile(jobId: string, index: number): Promise<Blob | null> {
  return transact<Blob | null>('readonly', (store, resolve, reject) => {
    const request = store.get(`${jobId}:${index}`);
    request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null);
    request.onerror = () => reject(request.error || new Error('读取模型缓存失败'));
  });
}

export async function cacheFile(jobId: string, index: number, blob: Blob) {
  return transact<void>('readwrite', (store, resolve, reject) => {
    const request = store.put(blob, `${jobId}:${index}`);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error('保存模型缓存失败'));
  });
}

export async function removeCachedJob(jobId: string, fileCount: number) {
  return transact<void>('readwrite', (store, resolve, reject) => {
    for (let index = 0; index < fileCount; index++) store.delete(`${jobId}:${index}`);
    resolve();
  });
}
