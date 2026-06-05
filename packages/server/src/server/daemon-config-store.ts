import {
  loadPersistedConfig,
  savePersistedConfig,
  type PersistedConfig,
} from "./persisted-config.js";
import { ProviderOverrideSchema } from "./agent/provider-launch-config.js";
import {
  MutableDaemonConfigSchema,
  MutableDaemonConfigPatchSchema,
} from "@bytetrue/protocol/messages";

export type { MutableDaemonConfig, MutableDaemonConfigPatch } from "@bytetrue/protocol/messages";

type MutableDaemonConfig = import("@bytetrue/protocol/messages").MutableDaemonConfig;
type MutableDaemonConfigPatch = import("@bytetrue/protocol/messages").MutableDaemonConfigPatch;
type ProviderOverride = import("./agent/provider-launch-config.js").ProviderOverride;

interface LoggerLike {
  child(bindings: Record<string, unknown>): LoggerLike;
  info(...args: unknown[]): void;
}

type ConfigListener = (config: MutableDaemonConfig) => void;
type FieldChangeHandler = (value: unknown) => void;

function getLogger(logger: LoggerLike | undefined): LoggerLike | undefined {
  return logger?.child({ module: "daemon-config-store" });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMerge<T extends Record<string, unknown>>(
  current: T,
  patch: Record<string, unknown>,
  path: readonly string[] = [],
): T {
  const next: Record<string, unknown> = { ...current };

  for (const [key, patchValue] of Object.entries(patch)) {
    if (patchValue === undefined) {
      continue;
    }
    const currentValue = next[key];
    const nextPath = [...path, key];
    const shouldReplaceObject = new Set([
      "metadataGeneration.agentTitle",
      "metadataGeneration.branchName",
      "metadataGeneration.commitMessage",
      "metadataGeneration.pullRequest",
    ]).has(nextPath.join("."));
    if (isRecord(currentValue) && isRecord(patchValue) && !shouldReplaceObject) {
      next[key] = deepMerge(currentValue, patchValue, nextPath);
      continue;
    }
    next[key] = patchValue;
  }

  return next as T;
}

function getValueAtPath(config: MutableDaemonConfig, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>((value, segment) => (isRecord(value) ? value[segment] : undefined), config);
}

function isEqualValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function applyMutableProviderConfigToOverrides(
  baseOverrides: Record<string, ProviderOverride> | undefined,
  mutableProviders: MutableDaemonConfig["providers"] | undefined,
): Record<string, ProviderOverride> | undefined {
  if (!baseOverrides && (!mutableProviders || Object.keys(mutableProviders).length === 0)) {
    return undefined;
  }

  const nextOverrides: Record<string, ProviderOverride> = { ...baseOverrides };
  for (const [providerId, providerConfig] of Object.entries(mutableProviders ?? {})) {
    nextOverrides[providerId] = {
      ...nextOverrides[providerId],
      ...ProviderOverrideSchema.strip().parse(providerConfig),
    };
  }

  return nextOverrides;
}

export class DaemonConfigStore {
  private current: MutableDaemonConfig;
  private readonly paseoHome: string;
  private readonly logger: LoggerLike | undefined;
  private readonly changeListeners = new Set<ConfigListener>();
  private readonly fieldChangeHandlers = new Map<string, Set<FieldChangeHandler>>();

  constructor(paseoHome: string, initial: MutableDaemonConfig, logger?: LoggerLike) {
    this.paseoHome = paseoHome;
    this.logger = getLogger(logger);
    this.current = MutableDaemonConfigSchema.parse(initial);
  }

  public get(): MutableDaemonConfig {
    return this.current;
  }

  public patch(partial: MutableDaemonConfigPatch): MutableDaemonConfig {
    const parsedPatch = MutableDaemonConfigPatchSchema.parse(partial);
    const next = MutableDaemonConfigSchema.parse(deepMerge(this.current, parsedPatch));

    const changedFieldPaths = Array.from(this.fieldChangeHandlers.keys()).filter((path) => {
      return !isEqualValue(getValueAtPath(this.current, path), getValueAtPath(next, path));
    });

    if (changedFieldPaths.length === 0 && isEqualValue(this.current, next)) {
      return this.current;
    }

    // Persist before updating in-memory state so that if persistence fails,
    // runtime and disk stay consistent.
    this.persistConfig(next);
    this.current = next;

    for (const path of changedFieldPaths) {
      const handlers = this.fieldChangeHandlers.get(path);
      if (!handlers) {
        continue;
      }
      const value = getValueAtPath(next, path);
      for (const handler of handlers) {
        handler(value);
      }
    }

    for (const listener of this.changeListeners) {
      listener(next);
    }

    return next;
  }

  public onFieldChange(path: string, handler: FieldChangeHandler): () => void {
    const handlers = this.fieldChangeHandlers.get(path) ?? new Set<FieldChangeHandler>();
    handlers.add(handler);
    this.fieldChangeHandlers.set(path, handlers);

    return () => {
      const currentHandlers = this.fieldChangeHandlers.get(path);
      if (!currentHandlers) {
        return;
      }
      currentHandlers.delete(handler);
      if (currentHandlers.size === 0) {
        this.fieldChangeHandlers.delete(path);
      }
    };
  }

  public onChange(listener: ConfigListener): () => void {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  private persistConfig(config: MutableDaemonConfig): void {
    const persisted = loadPersistedConfig(this.paseoHome, this.logger);
    const nextPersisted = mergeMutableConfigIntoPersistedConfig({
      persisted,
      mutable: config,
    });
    savePersistedConfig(this.paseoHome, nextPersisted, this.logger);
  }
}

function mergeMutableConfigIntoPersistedConfig(params: {
  persisted: PersistedConfig;
  mutable: MutableDaemonConfig;
}): PersistedConfig {
  const { persisted, mutable } = params;
  const metadataGeneration = readMetadataGenerationConfig(mutable);
  const providerOverrides = applyMutableProviderConfigToOverrides(
    persisted.agents?.providers as Record<string, ProviderOverride> | undefined,
    mutable.providers,
  );
  const persistedAgents = persisted.agents as Record<string, unknown> | undefined;
  const shouldPersistMetadataGeneration =
    metadataGeneration.providers.length > 0 ||
    metadataGeneration.agentTitle !== undefined ||
    metadataGeneration.branchName !== undefined ||
    metadataGeneration.commitMessage !== undefined ||
    metadataGeneration.pullRequest !== undefined ||
    persisted.agents?.metadataGeneration !== undefined;

  let nextAgents = persisted.agents as PersistedConfig["agents"];
  if (providerOverrides && Object.keys(providerOverrides).length > 0) {
    nextAgents = {
      ...persistedAgents,
      providers: providerOverrides,
      ...(shouldPersistMetadataGeneration ? { metadataGeneration } : {}),
    } as PersistedConfig["agents"];
  } else if (shouldPersistMetadataGeneration) {
    nextAgents = {
      ...persistedAgents,
      metadataGeneration,
    } as PersistedConfig["agents"];
  }

  return {
    ...persisted,
    daemon: {
      ...persisted.daemon,
      mcp: {
        ...persisted.daemon?.mcp,
        injectIntoAgents: mutable.mcp.injectIntoAgents,
      },
      autoArchiveAfterMerge: mutable.autoArchiveAfterMerge,
      appendSystemPrompt: mutable.appendSystemPrompt,
    },
    agents: nextAgents,
  } as PersistedConfig;
}

interface MetadataTargetConfig {
  enabled?: boolean;
  provider?: string;
  model?: string;
  thinkingOptionId?: string;
}

function readMetadataGenerationConfig(mutable: MutableDaemonConfig): {
  providers: Array<{ provider: string; model?: string; thinkingOptionId?: string }>;
  agentTitle?: MetadataTargetConfig;
  branchName?: MetadataTargetConfig;
  commitMessage?: MetadataTargetConfig;
  pullRequest?: MetadataTargetConfig;
} {
  const metadataGeneration = mutable.metadataGeneration;
  if (!isRecord(metadataGeneration)) {
    return { providers: [] };
  }

  const providers = readMetadataGenerationProviders(metadataGeneration);
  const targets: Record<string, MetadataTargetConfig | undefined> = {};
  for (const key of ["agentTitle", "branchName", "commitMessage", "pullRequest"] as const) {
    const cfg = readAgentTitleMetadataGenerationConfig(metadataGeneration, key);
    if (cfg) targets[key] = cfg;
  }
  return { providers, ...targets };
}

function readMetadataGenerationProviders(
  metadataGeneration: Record<string, unknown>,
): Array<{ provider: string; model?: string; thinkingOptionId?: string }> {
  const providers = metadataGeneration["providers"];
  if (!Array.isArray(providers)) {
    return [];
  }
  return providers.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry["provider"] !== "string") {
      return [];
    }
    return [
      {
        provider: entry["provider"],
        ...(typeof entry["model"] === "string" ? { model: entry["model"] } : {}),
        ...(typeof entry["thinkingOptionId"] === "string"
          ? { thinkingOptionId: entry["thinkingOptionId"] }
          : {}),
      },
    ];
  });
}

function readAgentTitleMetadataGenerationConfig(
  metadataGeneration: Record<string, unknown>,
  key: "agentTitle" | "branchName" | "commitMessage" | "pullRequest",
): MetadataTargetConfig | undefined {
  const entry = metadataGeneration[key];
  if (!isRecord(entry)) {
    return undefined;
  }
  return {
    ...(typeof entry["enabled"] === "boolean" ? { enabled: entry["enabled"] } : {}),
    ...(typeof entry["provider"] === "string" ? { provider: entry["provider"] } : {}),
    ...(typeof entry["model"] === "string" ? { model: entry["model"] } : {}),
    ...(typeof entry["thinkingOptionId"] === "string"
      ? { thinkingOptionId: entry["thinkingOptionId"] }
      : {}),
  };
}
