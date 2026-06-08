import { useCallback, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import type { AgentProvider } from "@bytetrue/protocol/agent-types";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import { useSessionStore } from "@/stores/session-store";

const FORM_PREFERENCES_STORAGE_KEY = "@paseo:create-agent-preferences";
const FORM_PREFERENCES_MIGRATION_KEY_PREFIX = "@paseo:create-agent-preferences:migrated:";
const FORM_PREFERENCES_QUERY_KEY = ["form-preferences"];

export interface FavoriteModelPreference {
  provider: string;
  modelId: string;
}

export interface FavoriteModelRow {
  favoriteKey: string;
  provider: string;
  providerLabel: string;
  modelId: string;
  modelLabel: string;
  description?: string;
}

const providerPreferencesSchema = z.object({
  model: z.string().optional(),
  mode: z.string().optional(),
  thinkingByModel: z.record(z.string()).optional(),
  featureValues: z.record(z.unknown()).optional(),
});

const formPreferencesSchema = z.object({
  provider: z.string().optional(),
  providerPreferences: z.record(providerPreferencesSchema).optional(),
  favoriteModels: z
    .array(
      z.object({
        provider: z.string(),
        modelId: z.string(),
      }),
    )
    .optional(),
});

export type ProviderPreferences = z.infer<typeof providerPreferencesSchema>;
export type FormPreferences = z.infer<typeof formPreferencesSchema>;

const DEFAULT_FORM_PREFERENCES: FormPreferences = {};

function isFormPreferencesEmpty(preferences: FormPreferences): boolean {
  return (
    !preferences.provider &&
    Object.keys(preferences.providerPreferences ?? {}).length === 0 &&
    (preferences.favoriteModels ?? []).length === 0
  );
}

function normalizeFormPreferences(value: unknown): FormPreferences {
  const result = formPreferencesSchema.safeParse(value);
  return result.success ? result.data : DEFAULT_FORM_PREFERENCES;
}

async function loadFormPreferences(): Promise<FormPreferences> {
  const stored = await AsyncStorage.getItem(FORM_PREFERENCES_STORAGE_KEY);
  if (!stored) return DEFAULT_FORM_PREFERENCES;
  return normalizeFormPreferences(JSON.parse(stored));
}

function useSupportsDaemonAgentFormPreferences(serverId: string | null | undefined): boolean {
  return useSessionStore((state) => {
    if (!serverId) return false;
    const features = state.sessions[serverId]?.serverInfo?.features as
      | Record<string, unknown>
      | undefined;
    return features?.daemonAgentFormPreferences === true;
  });
}

export interface UseFormPreferencesReturn {
  preferences: FormPreferences;
  isLoading: boolean;
  updatePreferences: (
    updates: Partial<FormPreferences> | ((current: FormPreferences) => FormPreferences),
  ) => Promise<void>;
}

export function mergeProviderPreferences(args: {
  preferences: FormPreferences;
  provider: AgentProvider;
  updates: Partial<ProviderPreferences>;
}): FormPreferences {
  const { preferences, provider, updates } = args;
  const existingProviderPreferences = preferences.providerPreferences ?? {};
  const existing = existingProviderPreferences[provider] ?? {};
  const nextThinkingByModel =
    updates.thinkingByModel === undefined
      ? existing.thinkingByModel
      : {
          ...existing.thinkingByModel,
          ...updates.thinkingByModel,
        };
  const nextFeatureValues =
    updates.featureValues === undefined
      ? existing.featureValues
      : {
          ...existing.featureValues,
          ...updates.featureValues,
        };

  return {
    ...preferences,
    provider,
    providerPreferences: {
      ...existingProviderPreferences,
      [provider]: {
        ...existing,
        ...updates,
        ...(nextThinkingByModel ? { thinkingByModel: nextThinkingByModel } : {}),
        ...(nextFeatureValues ? { featureValues: nextFeatureValues } : {}),
      },
    },
  };
}

export function buildFavoriteModelKey(input: FavoriteModelPreference): string {
  return `${input.provider}:${input.modelId}`;
}

export function isFavoriteModel(args: {
  preferences: FormPreferences;
  provider: string;
  modelId: string;
}): boolean {
  const favoriteKey = buildFavoriteModelKey({ provider: args.provider, modelId: args.modelId });
  return (args.preferences.favoriteModels ?? []).some(
    (favorite) => buildFavoriteModelKey(favorite) === favoriteKey,
  );
}

export function toggleFavoriteModel(args: {
  preferences: FormPreferences;
  provider: string;
  modelId: string;
}): FormPreferences {
  const favorite = { provider: args.provider, modelId: args.modelId };
  const favoriteKey = buildFavoriteModelKey(favorite);
  const existingFavorites = args.preferences.favoriteModels ?? [];
  const hasFavorite = existingFavorites.some(
    (entry) => buildFavoriteModelKey(entry) === favoriteKey,
  );

  return {
    ...args.preferences,
    favoriteModels: hasFavorite
      ? existingFavorites.filter((entry) => buildFavoriteModelKey(entry) !== favoriteKey)
      : [...existingFavorites, favorite],
  };
}

export function useFormPreferences(serverId?: string | null): UseFormPreferencesReturn {
  const queryClient = useQueryClient();
  const supportsDaemonPreferences = useSupportsDaemonAgentFormPreferences(serverId);
  const daemonConfig = useDaemonConfig(supportsDaemonPreferences ? (serverId ?? null) : null);
  const { data: localData, isPending: isLocalPending } = useQuery({
    queryKey: FORM_PREFERENCES_QUERY_KEY,
    queryFn: loadFormPreferences,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const localPreferences = localData ?? DEFAULT_FORM_PREFERENCES;
  const daemonPreferences = normalizeFormPreferences(
    daemonConfig.config?.agentFormPreferences ?? {},
  );
  const useDaemonPreferences = Boolean(
    serverId && supportsDaemonPreferences && daemonConfig.config,
  );
  const preferences = useDaemonPreferences ? daemonPreferences : localPreferences;

  useEffect(() => {
    if (!serverId || !supportsDaemonPreferences || !daemonConfig.config || isLocalPending) {
      return;
    }
    if (!isFormPreferencesEmpty(daemonPreferences) || isFormPreferencesEmpty(localPreferences)) {
      return;
    }

    let cancelled = false;
    const migrationKey = `${FORM_PREFERENCES_MIGRATION_KEY_PREFIX}${serverId}`;
    void (async () => {
      try {
        const marker = await AsyncStorage.getItem(migrationKey);
        if (cancelled || marker) {
          return;
        }
        await daemonConfig.patchConfig({ agentFormPreferences: localPreferences });
        await AsyncStorage.setItem(migrationKey, "1");
      } catch (error) {
        console.warn("[useFormPreferences] daemon preference migration failed", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    daemonConfig,
    daemonPreferences,
    isLocalPending,
    localPreferences,
    serverId,
    supportsDaemonPreferences,
  ]);

  const updatePreferences = useCallback(
    async (updates: Partial<FormPreferences> | ((current: FormPreferences) => FormPreferences)) => {
      if (useDaemonPreferences) {
        const next =
          typeof updates === "function" ? updates(preferences) : { ...preferences, ...updates };
        await daemonConfig.patchConfig({ agentFormPreferences: next });
        return;
      }

      const prev =
        queryClient.getQueryData<FormPreferences>(FORM_PREFERENCES_QUERY_KEY) ??
        DEFAULT_FORM_PREFERENCES;
      const next = typeof updates === "function" ? updates(prev) : { ...prev, ...updates };
      queryClient.setQueryData<FormPreferences>(FORM_PREFERENCES_QUERY_KEY, next);
      await AsyncStorage.setItem(FORM_PREFERENCES_STORAGE_KEY, JSON.stringify(next));
    },
    [daemonConfig, preferences, queryClient, useDaemonPreferences],
  );

  return {
    preferences,
    isLoading: useDaemonPreferences ? daemonConfig.isLoading : isLocalPending,
    updatePreferences,
  };
}
