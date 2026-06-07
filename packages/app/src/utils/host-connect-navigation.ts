export type HostConnectNavigationReason =
  | "startup-index"
  | "startup-recovery"
  | "explicit-host-added"
  | "background-reconnect";

export function shouldNavigateAfterHostConnect(reason: HostConnectNavigationReason): boolean {
  return (
    reason === "startup-index" || reason === "startup-recovery" || reason === "explicit-host-added"
  );
}
