/**
 * 极简键值存储：IndexedDB 优先，不可用时退化为内存（配合 localStorage 镜像）。
 * 这里不引入任何第三方依赖，因为存档是星履最不能出错的一环，
 * 必须完全看得见、控制得住。
 */

export interface KeyValueStore {
  readonly kind: 'indexeddb' | 'memory'
  get<T>(key: string): Promise<T | undefined>
  set(key: string, value: unknown): Promise<void>
  del(key: string): Promise<void>
  keys(prefix: string): Promise<string[]>
  close(): void
}

const DB_NAME = 'xinglv'
const DB_VERSION = 1
const STORE = 'kv'

class MemoryKV implements KeyValueStore {
  readonly kind = 'memory' as const
  private map = new Map<string, unknown>()
  async get<T>(key: string): Promise<T | undefined> {
    return this.map.get(key) as T | undefined
  }
  async set(key: string, value: unknown): Promise<void> {
    // 存一份结构化克隆，避免调用方后续修改同一个对象
    this.map.set(key, value === undefined ? undefined : structuredCloneSafe(value))
  }
  async del(key: string): Promise<void> {
    this.map.delete(key)
  }
  async keys(prefix: string): Promise<string[]> {
    return [...this.map.keys()].filter((k) => k.startsWith(prefix))
  }
  close(): void {}
}

class IdbKV implements KeyValueStore {
  readonly kind = 'indexeddb' as const
  constructor(private db: IDBDatabase) {}
  private tx(mode: IDBTransactionMode): IDBObjectStore {
    return this.db.transaction(STORE, mode).objectStore(STORE)
  }
  get<T>(key: string): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      const req = this.tx('readonly').get(key)
      req.onsuccess = () => resolve(req.result as T | undefined)
      req.onerror = () => reject(req.error ?? new Error('idb get failed'))
    })
  }
  set(key: string, value: unknown): Promise<void> {
    return new Promise((resolve, reject) => {
      const t = this.db.transaction(STORE, 'readwrite')
      const store = t.objectStore(STORE)
      store.put(value, key)
      t.oncomplete = () => resolve()
      t.onerror = () => reject(t.error ?? new Error('idb write failed'))
      t.onabort = () => reject(t.error ?? new Error('idb write aborted'))
    })
  }
  del(key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const t = this.db.transaction(STORE, 'readwrite')
      t.objectStore(STORE).delete(key)
      t.oncomplete = () => resolve()
      t.onerror = () => reject(t.error ?? new Error('idb delete failed'))
    })
  }
  keys(prefix: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const out: string[] = []
      const req = this.tx('readonly').openKeyCursor()
      req.onsuccess = () => {
        const cur = req.result
        if (!cur) {
          resolve(out)
          return
        }
        const k = String(cur.key)
        if (k.startsWith(prefix)) out.push(k)
        cur.continue()
      }
      req.onerror = () => reject(req.error ?? new Error('idb cursor failed'))
    })
  }
  close(): void {
    try {
      this.db.close()
    } catch {
      /* 忽略 */
    }
  }
}

function structuredCloneSafe<T>(v: T): T {
  try {
    return structuredClone(v)
  } catch {
    return JSON.parse(JSON.stringify(v)) as T
  }
}

/** 打开存储；任何一步失败都退化为内存存储，绝不阻塞应用启动。 */
export async function openStore(timeoutMs = 2500): Promise<KeyValueStore> {
  try {
    if (typeof indexedDB === 'undefined') return new MemoryKV()
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      let settled = false
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true
          reject(new Error('idb open timeout'))
        }
      }, timeoutMs)
      let req: IDBOpenDBRequest
      try {
        req = indexedDB.open(DB_NAME, DB_VERSION)
      } catch (err) {
        clearTimeout(timer)
        reject(err)
        return
      }
      req.onupgradeneeded = () => {
        const d = req.result
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE)
      }
      req.onsuccess = () => {
        if (settled) {
          req.result.close()
          return
        }
        settled = true
        clearTimeout(timer)
        resolve(req.result)
      }
      req.onerror = () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(req.error ?? new Error('idb open failed'))
      }
      req.onblocked = () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(new Error('idb blocked'))
      }
    })
    return new IdbKV(db)
  } catch {
    return new MemoryKV()
  }
}

/* ------------------------------------------------------------ localStorage */

export function lsGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function lsSet(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function lsDel(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    /* 忽略 */
  }
}
