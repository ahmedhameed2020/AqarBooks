const DATABASE_NAME = "aqarbooks-gate-scanner";
const DATABASE_VERSION = 1;
const STORE_NAME = "device-bindings";
const DEVICE_KEY = "enrolled-device";

export type StoredGateDevice = {
  deviceId: string;
  gateId: string;
  allowedDirection: "ENTRY" | "EXIT" | "BOTH";
  installationId: string;
  deviceCredential: string;
};

function normalizeGateDevice(value: unknown): StoredGateDevice | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<StoredGateDevice>;
  if (
    typeof candidate.deviceId !== "string"
    || typeof candidate.gateId !== "string"
    || !["ENTRY", "EXIT", "BOTH"].includes(candidate.allowedDirection ?? "")
    || typeof candidate.installationId !== "string"
    || typeof candidate.deviceCredential !== "string"
  ) {
    return null;
  }

  return {
    deviceId: candidate.deviceId,
    gateId: candidate.gateId,
    allowedDirection: candidate.allowedDirection as StoredGateDevice["allowedDirection"],
    installationId: candidate.installationId,
    deviceCredential: candidate.deviceCredential,
  };
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("gate_device_store_request_failed"));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("gate_device_store_transaction_failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("gate_device_store_transaction_aborted"));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("gate_device_store_open_failed"));
    request.onblocked = () => reject(new Error("gate_device_store_open_blocked"));
  });
}

export async function readGateDevice(): Promise<StoredGateDevice | null> {
  if (typeof indexedDB === "undefined") return null;

  let database: IDBDatabase | null = null;
  try {
    database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, "readonly");
    const completion = transactionComplete(transaction);
    const value = await requestResult(transaction.objectStore(STORE_NAME).get(DEVICE_KEY));
    await completion;
    return normalizeGateDevice(value);
  } catch {
    return null;
  } finally {
    database?.close();
  }
}

export async function saveGateDevice(device: StoredGateDevice): Promise<void> {
  const safeDevice = normalizeGateDevice(device);
  if (!safeDevice) throw new Error("invalid_gate_device");
  if (typeof indexedDB === "undefined") throw new Error("gate_device_store_unavailable");

  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const completion = transactionComplete(transaction);
    await requestResult(transaction.objectStore(STORE_NAME).put(safeDevice, DEVICE_KEY));
    await completion;
  } finally {
    database.close();
  }
}

export async function clearGateDevice(): Promise<void> {
  if (typeof indexedDB === "undefined") return;

  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const completion = transactionComplete(transaction);
    await requestResult(transaction.objectStore(STORE_NAME).delete(DEVICE_KEY));
    await completion;
  } finally {
    database.close();
  }
}
