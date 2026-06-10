import { useHostRuntimeSnapshot } from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";
import { canUseLocalOsIntegration } from "./local-os-integration-support";

export function useLocalOsIntegration(serverId: string): boolean {
  const snapshot = useHostRuntimeSnapshot(serverId);
  const supportsLocalOsIntegration = useSessionStore(
    (state) => state.sessions[serverId]?.serverInfo?.features?.localOsIntegration === true,
  );
  return canUseLocalOsIntegration({
    activeConnection: snapshot?.activeConnection ?? null,
    supportsLocalOsIntegration,
  });
}
