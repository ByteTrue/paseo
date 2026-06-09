export function getServerInfoDisplayName(serverInfo: unknown): string | null {
  if (!serverInfo || typeof serverInfo !== "object") {
    return null;
  }
  const displayName = (serverInfo as { displayName?: unknown }).displayName;
  if (typeof displayName !== "string") {
    return null;
  }
  const trimmed = displayName.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function supportsDaemonDisplayName(serverInfo: unknown): boolean {
  if (!serverInfo || typeof serverInfo !== "object") {
    return false;
  }
  const features = (serverInfo as { features?: Record<string, unknown> }).features;
  return features?.daemonDisplayName === true;
}

export function resolveHostDisplayNameFromServerInfo(serverInfo: unknown): string | null {
  if (!supportsDaemonDisplayName(serverInfo)) {
    return null;
  }
  return getServerInfoDisplayName(serverInfo);
}
