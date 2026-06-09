import { useQuery } from "@tanstack/react-query";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import type { DaemonClient } from "@bytetrue/client/internal/daemon-client";

export type LocalOpenTargetKind = "editor" | "file-manager";
export type LocalOpenMode = "open" | "reveal";

export interface LocalOpenTarget {
  id: string;
  label: string;
  kind: LocalOpenTargetKind;
}

export interface OpenLocalTargetInput {
  editorId: string;
  path: string;
  cwd?: string;
  mode?: LocalOpenMode;
}

export async function listLocalOpenTargets(client: DaemonClient): Promise<LocalOpenTarget[]> {
  const payload = await client.listLocalOpenTargets();
  if (payload.error) {
    throw new Error(payload.error);
  }
  return payload.targets;
}

export async function openLocalTarget(
  client: DaemonClient,
  input: OpenLocalTargetInput,
): Promise<void> {
  const payload = await client.openLocalTarget(input);
  if (!payload.success) {
    throw new Error(payload.error ?? "Failed to open local target");
  }
}

export function useLocalOpenTargets(input: { serverId: string; enabled: boolean }) {
  const client = useHostRuntimeClient(input.serverId);
  const canListTargets = input.enabled && client !== null;
  const query = useQuery({
    queryKey: ["local-open-targets", input.serverId],
    enabled: canListTargets,
    staleTime: 60_000,
    retry: false,
    queryFn: async () => listLocalOpenTargets(client!),
  });

  return {
    targets: query.data ?? [],
    isAvailable: canListTargets,
    client,
  };
}
