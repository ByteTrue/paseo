import { useCallback, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  buildFavoriteModelKey,
  DEFAULT_FORM_PREFERENCES,
  isFavoriteModel,
  mergeProviderPreferences,
  parseFormPreferences,
  toggleFavoriteModel,
  type FavoriteModelPreference,
  type FavoriteModelRow,
  type FormPreferences,
  type ProviderPreferences,
} from "@/create-agent-preferences/preferences";
import {
  createAgentPreferencesService,
  type FormPreferenceUpdate,
} from "@/create-agent-preferences/service";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import { useSessionStore } from "@/stores/session-store";

const FORM_PREFERENCES_QUERY_KEY = ["form-preferences"];
const FORM_PREFERENCES_MIGRATION_KEY_PREFIX = "@paseo:create-agent-preferences:migrated:";

export type { FavoriteModelPreference, FavoriteModelRow, FormPreferences, ProviderPreferences };

export { buildFavoriteModelKey, isFavoriteModel, mergeProviderPreferences, toggleFavoriteModel };

function isFormPreferencesEmpty(preferences: FormPreferences): boolean {
  return (
    !preferences.provider &&
    Object.keys(preferences.providerPreferences ?? {}).length === 0 &&
    (preferences.favoriteModels ?? []).length === 0
  );
}

async function loadFormPreferences(): Promise<FormPreferences> {
  return createAgentPreferencesService.load();
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
  updatePreferences: (updates: FormPreferenceUpdate) => Promise<void>;
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
  const daemonPreferences = parseFormPreferences(daemonConfig.config?.agentFormPreferences ?? {});
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
    async (updates: FormPreferenceUpdate) => {
      if (useDaemonPreferences) {
        const next =
          typeof updates === "function" ? updates(preferences) : { ...preferences, ...updates };
        await daemonConfig.patchConfig({ agentFormPreferences: next });
        return;
      }

      const next = await createAgentPreferencesService.update(updates);
      queryClient.setQueryData<FormPreferences>(FORM_PREFERENCES_QUERY_KEY, next);
    },
    [daemonConfig, preferences, queryClient, useDaemonPreferences],
  );

  return {
    preferences,
    isLoading: useDaemonPreferences ? daemonConfig.isLoading : isLocalPending,
    updatePreferences,
  };
}
