type Handler = (() => void) | null;

class FakeRequest<T> {
  result: T | undefined;
  error: unknown = null;
  onsuccess: Handler = null;
  onerror: Handler = null;

  succeed(result: T): void {
    this.result = result;
    queueMicrotask(() => this.onsuccess?.());
  }
}

type FakeCursor = { key: string; value: unknown; continue(): void };

class FakeObjectStore {
  data: Map<string, unknown>;

  constructor(data: Map<string, unknown>) {
    this.data = data;
  }

  get(key: string): FakeRequest<unknown> {
    const req = new FakeRequest<unknown>();
    req.succeed(this.data.get(key));
    return req;
  }

  openCursor(): FakeRequest<FakeCursor | null> {
    const req = new FakeRequest<FakeCursor | null>();
    const entries = [...this.data.entries()];
    let index = 0;
    const step = () => {
      const entry = entries[index];
      if (!entry) {
        req.succeed(null);
        return;
      }
      index += 1;
      req.succeed({ key: entry[0], value: entry[1], continue: step });
    };
    step();
    return req;
  }

  getAll(): FakeRequest<unknown[]> {
    const req = new FakeRequest<unknown[]>();
    req.succeed([...this.data.values()]);
    return req;
  }

  getAllKeys(): FakeRequest<string[]> {
    const req = new FakeRequest<string[]>();
    req.succeed([...this.data.keys()]);
    return req;
  }

  count(): FakeRequest<number> {
    const req = new FakeRequest<number>();
    req.succeed(this.data.size);
    return req;
  }

  put(value: unknown, key: string): FakeRequest<string> {
    const req = new FakeRequest<string>();
    this.data.set(key, value);
    req.succeed(key);
    return req;
  }

  delete(key: string): FakeRequest<undefined> {
    const req = new FakeRequest<undefined>();
    this.data.delete(key);
    req.succeed(undefined);
    return req;
  }
}

class FakeTransaction {
  stores: Map<string, Map<string, unknown>>;
  onerror: Handler = null;
  onabort: Handler = null;
  oncomplete: Handler = null;

  constructor(stores: Map<string, Map<string, unknown>>) {
    this.stores = stores;
    // A macrotask, so requests queued from earlier request callbacks settle before completion.
    setTimeout(() => this.oncomplete?.(), 0);
  }

  objectStore(name: string): FakeObjectStore {
    let store = this.stores.get(name);
    if (!store) {
      store = new Map();
      this.stores.set(name, store);
    }
    return new FakeObjectStore(store);
  }
}

class FakeDatabase {
  stores = new Map<string, Map<string, unknown>>();
  objectStoreNames = { contains: (name: string) => this.stores.has(name) };

  createObjectStore(name: string): void {
    this.stores.set(name, new Map());
  }

  transaction(_storeNames: string | string[], _mode: string): FakeTransaction {
    return new FakeTransaction(this.stores);
  }
}

class FakeOpenRequest {
  result: FakeDatabase | undefined;
  onupgradeneeded: Handler = null;
  onsuccess: Handler = null;
  onerror: Handler = null;
  onblocked: Handler = null;
}

let sharedDb: FakeDatabase | null = null;

function open(_name: string, _version: number): FakeOpenRequest {
  const req = new FakeOpenRequest();
  queueMicrotask(() => {
    const isNew = !sharedDb;
    sharedDb ??= new FakeDatabase();
    req.result = sharedDb;
    if (isNew) req.onupgradeneeded?.();
    req.onsuccess?.();
  });
  return req;
}

(globalThis as { indexedDB?: unknown }).indexedDB ??= { open };

export {};
