import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  DaemonClientAuthCredential,
  DaemonClientAuthKeyStore,
} from "@bytetrue/client/internal/daemon-client";

const CLIENT_AUTH_KEYS_STORAGE_KEY = "@paseo:daemon-client-auth-keys-v1";

interface StoredClientAuthKeys {
  version: 1;
  clients: Record<string, DaemonClientAuthCredential>;
}

interface ClientAuthStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

interface ClientAuthKeyStoreDeps {
  storage: ClientAuthStorage;
  storageKey?: string;
}

function isCredentialForServer(
  value: unknown,
  serverId: string,
): value is DaemonClientAuthCredential {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.serverId === serverId &&
    typeof record.publicKeyB64 === "string" &&
    record.publicKeyB64.length > 0 &&
    typeof record.secretKeyB64 === "string" &&
    record.secretKeyB64.length > 0 &&
    typeof record.createdAt === "string" &&
    record.createdAt.length > 0
  );
}

function normalizeStore(value: unknown): StoredClientAuthKeys {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { version: 1, clients: {} };
  }
  const record = value as Record<string, unknown>;
  const rawClients =
    record.clients && typeof record.clients === "object" && !Array.isArray(record.clients)
      ? (record.clients as Record<string, unknown>)
      : {};
  const clients: Record<string, DaemonClientAuthCredential> = {};
  for (const [serverId, credential] of Object.entries(rawClients)) {
    if (isCredentialForServer(credential, serverId)) {
      clients[serverId] = credential;
    }
  }
  return { version: 1, clients };
}

export function createAppClientAuthKeyStore(
  deps: ClientAuthKeyStoreDeps,
): DaemonClientAuthKeyStore {
  const storageKey = deps.storageKey ?? CLIENT_AUTH_KEYS_STORAGE_KEY;

  async function readStore(): Promise<StoredClientAuthKeys> {
    const raw = await deps.storage.getItem(storageKey);
    if (!raw) {
      return { version: 1, clients: {} };
    }
    try {
      return normalizeStore(JSON.parse(raw));
    } catch {
      return { version: 1, clients: {} };
    }
  }

  async function writeStore(value: StoredClientAuthKeys): Promise<void> {
    await deps.storage.setItem(storageKey, JSON.stringify(value));
  }

  return {
    async get(serverId) {
      const store = await readStore();
      return store.clients[serverId] ?? null;
    },
    async set(credential) {
      const store = await readStore();
      store.clients[credential.serverId] = credential;
      await writeStore(store);
    },
    async delete(serverId) {
      const store = await readStore();
      if (!(serverId in store.clients)) {
        return;
      }
      delete store.clients[serverId];
      await writeStore(store);
    },
  };
}

export const appClientAuthKeyStore = createAppClientAuthKeyStore({ storage: AsyncStorage });
