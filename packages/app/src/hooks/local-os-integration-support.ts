import type { ActiveConnection } from "@/runtime/host-runtime";

function parseEndpointHost(endpoint: string): string | null {
  const trimmed = endpoint.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.includes("://")) {
    try {
      return new URL(trimmed).hostname.toLowerCase();
    } catch {
      return null;
    }
  }
  const bracketMatch = /^\[([^\]]+)\](?::\d+)?$/u.exec(trimmed);
  if (bracketMatch?.[1]) {
    return bracketMatch[1].toLowerCase();
  }
  return trimmed.split(":")[0]?.toLowerCase() ?? null;
}

export function isLoopbackTcpEndpoint(endpoint: string): boolean {
  const host = parseEndpointHost(endpoint);
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

export function canUseLocalOsIntegration(input: {
  activeConnection: ActiveConnection | null;
  supportsLocalOsIntegration: boolean;
}): boolean {
  if (!input.supportsLocalOsIntegration || !input.activeConnection) {
    return false;
  }
  switch (input.activeConnection.type) {
    case "directSocket":
    case "directPipe":
      return true;
    case "directTcp":
      return isLoopbackTcpEndpoint(input.activeConnection.endpoint);
    case "relay":
      return false;
  }
}
