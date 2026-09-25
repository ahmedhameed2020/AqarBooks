import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearGateDevice,
  clearGateDeviceBeforeSignOut,
  readGateDevice,
  saveGateDevice,
  type StoredGateDevice,
} from "@/lib/gates/device-store";

type RequestHandlers = {
  result?: unknown;
  error: DOMException | null;
  onsuccess: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
  onupgradeneeded?: ((event: IDBVersionChangeEvent) => void) | null;
};

function createRequest(): RequestHandlers {
  return {
    error: null,
    onsuccess: null,
    onerror: null,
  };
}

function createIndexedDbFactory(): IDBFactory {
  const stores = new Map<string, Map<IDBValidKey, unknown>>();

  const database = {
    objectStoreNames: {
      contains(name: string) {
        return stores.has(name);
      },
    },
    createObjectStore(name: string) {
      stores.set(name, new Map());
    },
    transaction(name: string) {
      const transaction = {
        error: null,
        oncomplete: null,
        onerror: null,
        onabort: null,
        objectStore() {
          const store = stores.get(name);
          if (!store) throw new DOMException("Missing object store", "NotFoundError");

          function complete(operation: () => unknown) {
            const request = createRequest();
            queueMicrotask(() => {
              request.result = operation();
              request.onsuccess?.(new Event("success"));
              queueMicrotask(() => transaction.oncomplete?.(new Event("complete")));
            });
            return request as unknown as IDBRequest;
          }

          return {
            get(key: IDBValidKey) {
              return complete(() => store.get(key));
            },
            put(value: unknown, key: IDBValidKey) {
              return complete(() => {
                store.set(key, structuredClone(value));
                return key;
              });
            },
            delete(key: IDBValidKey) {
              return complete(() => store.delete(key));
            },
          } as IDBObjectStore;
        },
      };
      return transaction as unknown as IDBTransaction;
    },
    close() {},
  } as unknown as IDBDatabase;

  return {
    open() {
      const request = createRequest();
      queueMicrotask(() => {
        request.result = database;
        request.onupgradeneeded?.({
          target: request,
        } as unknown as IDBVersionChangeEvent);
        request.onsuccess?.(new Event("success"));
      });
      return request as unknown as IDBOpenDBRequest;
    },
  } as IDBFactory;
}

describe("gate device storage", () => {
  beforeEach(() => {
    vi.stubGlobal("indexedDB", createIndexedDbFactory());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists only the enrolled device binding and credential material", async () => {
    const device: StoredGateDevice = {
      deviceId: "0f55a99d-97cc-49be-a0ed-c794998714b3",
      gateId: "c78eeb37-cf70-4d47-8d3e-1d6bb51d35f5",
      allowedDirection: "ENTRY",
      installationId: "a".repeat(43),
      deviceCredential: "b".repeat(43),
    };

    await saveGateDevice({
      ...device,
      qrPayload: "raw-qr-material-must-not-be-stored",
      guestName: "must-not-be-stored",
    } as StoredGateDevice);

    expect(await readGateDevice()).toEqual(device);
    expect(Object.keys(device).sort()).toEqual([
      "allowedDirection",
      "deviceCredential",
      "deviceId",
      "gateId",
      "installationId",
    ]);
  });

  it("clears the enrolled device atomically", async () => {
    const device: StoredGateDevice = {
      deviceId: "0f55a99d-97cc-49be-a0ed-c794998714b3",
      gateId: "c78eeb37-cf70-4d47-8d3e-1d6bb51d35f5",
      allowedDirection: "BOTH",
      installationId: "a".repeat(43),
      deviceCredential: "b".repeat(43),
    };

    await saveGateDevice(device);
    await clearGateDevice();

    expect(await readGateDevice()).toBeNull();
  });

  it("clears the enrolled device before continuing sign-out", async () => {
    const device: StoredGateDevice = {
      deviceId: "0f55a99d-97cc-49be-a0ed-c794998714b3",
      gateId: "c78eeb37-cf70-4d47-8d3e-1d6bb51d35f5",
      allowedDirection: "ENTRY",
      installationId: "a".repeat(43),
      deviceCredential: "b".repeat(43),
    };
    const continueSignOut = vi.fn();

    await saveGateDevice(device);
    await clearGateDeviceBeforeSignOut(continueSignOut);

    expect(await readGateDevice()).toBeNull();
    expect(continueSignOut).toHaveBeenCalledTimes(1);
  });
});
