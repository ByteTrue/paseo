import { mkdir, readFile, rename, writeFile, chmod } from "node:fs/promises";
import path from "node:path";
import type {
  DaemonClientAuthCredential,
  DaemonClientAuthKeyStore,
} from "@bytetrue/client/internal/daemon-client";

const STORE_FILENAME = "client-auth-keys.json";

interface StoredClientAuthKeys {
  version: 1;
  clients: Record<string, DaemonClientAuthCredential>;
}

function isCredentialForServer(
  value: unknown,
  serverId: string,
): value is DaemonClientAuthCredential {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
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

async function readStore(storePath: string): Promise<StoredClientAuthKeys> {
  try {
    const raw = await readFile(storePath, "utf8");
    return normalizeStore(JSON.parse(raw));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return { version: 1, clients: {} };
    }
    throw error;
  }
}

async function writeStore(storePath: string, value: StoredClientAuthKeys): Promise<void> {
  await mkdir(path.dirname(storePath), { recursive: true });
  const tempPath = `${storePath}.${process.pid}.${Date.now()}.tmp`;
  const content = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(tempPath, content, { mode: 0o600 });
  await chmod(tempPath, 0o600).catch(() => undefined);
  await rename(tempPath, storePath);
}

export function createCliClientAuthKeyStore(paseoHome: string): DaemonClientAuthKeyStore {
  const storePath = path.join(paseoHome, STORE_FILENAME);
  return {
    async get(serverId) {
      const store = await readStore(storePath);
      return store.clients[serverId] ?? null;
    },
    async set(credential) {
      const store = await readStore(storePath);
      store.clients[credential.serverId] = credential;
      await writeStore(storePath, store);
    },
    async delete(serverId) {
      const store = await readStore(storePath);
      if (!(serverId in store.clients)) return;
      delete store.clients[serverId];
      await writeStore(storePath, store);
    },
  };
}
