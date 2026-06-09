import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Logger } from "pino";
import type { AgentProvider, ProviderSnapshotEntry } from "./agent-sdk-types.js";
import { writePrivateFileAtomicSync } from "../private-files.js";

interface ProviderSnapshotCacheScope {
  entries: ProviderSnapshotEntry[];
  generatedAt: string;
  persistedAt: string;
}

interface ProviderSnapshotCacheFile {
  version: 1;
  snapshots: Record<string, ProviderSnapshotCacheScope>;
}

const CACHE_FILENAME = "provider-snapshot-cache.json";

function cloneEntry(entry: ProviderSnapshotEntry): ProviderSnapshotEntry {
  const rest = { ...entry } as ProviderSnapshotEntry & {
    cacheState?: "live" | "cached";
    cacheGeneratedAt?: string;
  };
  delete rest.cacheState;
  delete rest.cacheGeneratedAt;
  return {
    ...rest,
    models: entry.models?.map((model) => ({ ...model })),
    modes: entry.modes?.map((mode) => ({ ...mode })),
  };
}

function toCachedEntry(entry: ProviderSnapshotEntry, generatedAt: string): ProviderSnapshotEntry {
  const next = cloneEntry(entry) as ProviderSnapshotEntry & {
    cacheState?: "live" | "cached";
    cacheGeneratedAt?: string;
  };
  next.cacheState = "cached";
  next.cacheGeneratedAt = generatedAt;
  return next;
}

function parseCacheFile(value: unknown): ProviderSnapshotCacheFile {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { version: 1, snapshots: {} };
  }
  const raw = value as Partial<ProviderSnapshotCacheFile>;
  if (raw.version !== 1 || !raw.snapshots || typeof raw.snapshots !== "object") {
    return { version: 1, snapshots: {} };
  }
  return {
    version: 1,
    snapshots: Object.fromEntries(
      Object.entries(raw.snapshots).flatMap(([cwd, scope]) => {
        if (!scope || typeof scope !== "object" || Array.isArray(scope)) {
          return [];
        }
        const rawScope = scope as Partial<ProviderSnapshotCacheScope>;
        if (!Array.isArray(rawScope.entries)) {
          return [];
        }
        return [
          [
            cwd,
            {
              entries: rawScope.entries.map(cloneEntry),
              generatedAt:
                rawScope.generatedAt ?? rawScope.persistedAt ?? new Date(0).toISOString(),
              persistedAt:
                rawScope.persistedAt ?? rawScope.generatedAt ?? new Date(0).toISOString(),
            },
          ],
        ];
      }),
    ),
  };
}

export class ProviderSnapshotCacheStore {
  private readonly filePath: string;
  private readonly logger: Logger;
  private cache: ProviderSnapshotCacheFile | null = null;

  constructor(paseoHome: string, logger: Logger) {
    this.filePath = join(paseoHome, CACHE_FILENAME);
    this.logger = logger.child({ module: "provider-snapshot-cache" });
  }

  read(cwd: string): ProviderSnapshotEntry[] | null {
    const scope = this.load().snapshots[cwd];
    if (!scope || scope.entries.length === 0) {
      return null;
    }
    return scope.entries.map((entry) => toCachedEntry(entry, scope.generatedAt));
  }

  write(cwd: string, entries: ProviderSnapshotEntry[]): void {
    const persistedEntries = entries.filter((entry) => entry.status !== "loading").map(cloneEntry);
    if (persistedEntries.length === 0) {
      return;
    }
    const now = new Date().toISOString();
    const cache = this.load();
    cache.snapshots[cwd] = {
      entries: persistedEntries,
      generatedAt: now,
      persistedAt: now,
    };
    this.save(cache);
  }

  retainProviders(providerIds: AgentProvider[]): void {
    const providerSet = new Set(providerIds);
    const cache = this.load();
    let changed = false;
    for (const [cwd, scope] of Object.entries(cache.snapshots)) {
      const entries = scope.entries.filter((entry) => providerSet.has(entry.provider));
      if (entries.length !== scope.entries.length) {
        changed = true;
        if (entries.length === 0) {
          delete cache.snapshots[cwd];
        } else {
          cache.snapshots[cwd] = { ...scope, entries };
        }
      }
    }
    if (changed) {
      this.save(cache);
    }
  }

  private load(): ProviderSnapshotCacheFile {
    if (this.cache) {
      return this.cache;
    }
    if (!existsSync(this.filePath)) {
      this.cache = { version: 1, snapshots: {} };
      return this.cache;
    }
    try {
      this.cache = parseCacheFile(JSON.parse(readFileSync(this.filePath, "utf8")));
    } catch (error) {
      this.logger.warn(
        { err: error, filePath: this.filePath },
        "Failed to read provider snapshot cache",
      );
      this.cache = { version: 1, snapshots: {} };
    }
    return this.cache;
  }

  private save(cache: ProviderSnapshotCacheFile): void {
    this.cache = cache;
    try {
      writePrivateFileAtomicSync(this.filePath, `${JSON.stringify(cache, null, 2)}\n`);
    } catch (error) {
      this.logger.warn(
        { err: error, filePath: this.filePath },
        "Failed to write provider snapshot cache",
      );
    }
  }
}
