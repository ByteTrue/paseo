import { DaemonClient } from "@bytetrue/client/internal/daemon-client";
import type { DaemonClientConfig } from "@bytetrue/client/internal/daemon-client";
import type { HostConnection } from "@/types/host-connection";
import { getOrCreateClientId } from "./client-id";
import { resolveAppVersion } from "./app-version";
import {
  buildDaemonWebSocketUrl,
  buildRelayWebSocketUrl,
  shouldUseTlsForDefaultHostedRelay,
} from "./daemon-endpoints";
import {
  buildLocalDaemonTransportUrl,
  createDesktopLocalDaemonTransportFactory,
} from "@/desktop/daemon/desktop-daemon-transport";
import { appClientAuthKeyStore } from "@/daemon-auth/client-auth-store";
import { requestDaemonAdminPassword } from "@/daemon-auth/admin-password-prompt";

export interface DaemonProbeClient {
  readonly lastError: string | null;
  connect(): Promise<void>;
  close(): Promise<void>;
  getLastServerInfoMessage(): { serverId: string; hostname: string | null } | null;
}

interface LocalTransportUrlInput {
  transportType: "socket" | "pipe";
  transportPath: string;
}

export interface DaemonConnectionDependencies<TClient extends DaemonProbeClient> {
  getClientId(): Promise<string>;
  resolveAppVersion(): string | null;
  createLocalTransportFactory(): DaemonClientConfig["transportFactory"] | null;
  buildLocalTransportUrl(input: LocalTransportUrlInput): string;
  createClient(config: DaemonClientConfig): TClient;
  getClientAuth?(): DaemonClientConfig["clientAuth"];
}

const defaultDaemonConnectionDependencies: DaemonConnectionDependencies<DaemonClient> = {
  getClientId: getOrCreateClientId,
  resolveAppVersion,
  createLocalTransportFactory: createDesktopLocalDaemonTransportFactory,
  buildLocalTransportUrl: buildLocalDaemonTransportUrl,
  createClient: (config) => new DaemonClient(config),
  getClientAuth: () => ({
    keyStore: appClientAuthKeyStore,
    adminPasswordProvider: requestDaemonAdminPassword,
    clientName: "Paseo app",
  }),
};

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function pickBestReason(reason: string | null, lastError: string | null): string {
  const genericReason =
    reason &&
    (reason.toLowerCase() === "transport error" || reason.toLowerCase() === "transport closed");
  const genericLastError =
    lastError &&
    (lastError.toLowerCase() === "transport error" ||
      lastError.toLowerCase() === "transport closed" ||
      lastError.toLowerCase() === "unable to connect");

  if (genericReason && lastError && !genericLastError) {
    return lastError;
  }
  if (reason) return reason;
  if (lastError) return lastError;
  return "Unable to connect";
}

export class DaemonConnectionTestError extends Error {
  reason: string | null;
  lastError: string | null;

  constructor(message: string, details: { reason: string | null; lastError: string | null }) {
    super(message);
    this.name = "DaemonConnectionTestError";
    this.reason = details.reason;
    this.lastError = details.lastError;
  }
}

export async function buildClientConfig(
  connection: HostConnection,
  serverId?: string,
  deps: Pick<
    DaemonConnectionDependencies<DaemonProbeClient>,
    | "getClientId"
    | "resolveAppVersion"
    | "createLocalTransportFactory"
    | "buildLocalTransportUrl"
    | "getClientAuth"
  > = defaultDaemonConnectionDependencies,
): Promise<DaemonClientConfig> {
  const clientId = await deps.getClientId();
  const localTransportFactory = deps.createLocalTransportFactory();
  const clientAuth = deps.getClientAuth?.();
  const base = {
    clientId,
    clientType: "mobile" as const,
    appVersion: deps.resolveAppVersion() ?? undefined,
    suppressSendErrors: true,
    reconnect: { enabled: false },
    ...(clientAuth ? { clientAuth } : {}),
    ...((connection.type === "directSocket" || connection.type === "directPipe") &&
    localTransportFactory
      ? { transportFactory: localTransportFactory }
      : {}),
  };

  if (connection.type === "directSocket" || connection.type === "directPipe") {
    return {
      ...base,
      url: deps.buildLocalTransportUrl({
        transportType: connection.type === "directSocket" ? "socket" : "pipe",
        transportPath: connection.path,
      }),
    };
  }

  if (connection.type === "directTcp") {
    return {
      ...base,
      url: buildDaemonWebSocketUrl(connection.endpoint, { useTls: connection.useTls ?? false }),
    };
  }

  if (!serverId) {
    throw new Error("serverId is required to probe a relay connection");
  }

  return {
    ...base,
    url: buildRelayWebSocketUrl({
      endpoint: connection.relayEndpoint,
      useTls: connection.useTls ?? shouldUseTlsForDefaultHostedRelay(connection.relayEndpoint),
      serverId,
    }),
    e2ee: { enabled: true, daemonPublicKeyB64: connection.daemonPublicKeyB64 },
  };
}

interface ProbeTimeoutControls {
  pause(): void;
  resume(): void;
}

function withProbeTimeoutPausedDuringAdminPasswordPrompt(
  config: DaemonClientConfig,
  controls: ProbeTimeoutControls,
): DaemonClientConfig {
  const clientAuth = config.clientAuth;
  const adminPasswordProvider = clientAuth?.adminPasswordProvider;
  if (!clientAuth || !adminPasswordProvider) {
    return config;
  }

  return {
    ...config,
    clientAuth: {
      ...clientAuth,
      adminPasswordProvider: async (context) => {
        controls.pause();
        try {
          return await adminPasswordProvider(context);
        } finally {
          controls.resume();
        }
      },
    },
  };
}

export function connectAndProbe(
  config: DaemonClientConfig,
  timeoutMs: number,
): Promise<{ client: DaemonClient; serverId: string; hostname: string | null }>;
export function connectAndProbe<TClient extends DaemonProbeClient>(
  config: DaemonClientConfig,
  timeoutMs: number,
  deps: Pick<DaemonConnectionDependencies<TClient>, "createClient">,
): Promise<{ client: TClient; serverId: string; hostname: string | null }>;
export function connectAndProbe(
  config: DaemonClientConfig,
  timeoutMs: number,
  deps: Pick<
    DaemonConnectionDependencies<DaemonProbeClient>,
    "createClient"
  > = defaultDaemonConnectionDependencies,
): Promise<{ client: DaemonProbeClient; serverId: string; hostname: string | null }> {
  return new Promise<{ client: DaemonProbeClient; serverId: string; hostname: string | null }>(
    (resolve, reject) => {
      let client: DaemonProbeClient | null = null;
      let timer: ReturnType<typeof setTimeout> | null = null;
      let timerStartedAt = 0;
      let remainingTimeoutMs = timeoutMs;
      let settled = false;

      const clearProbeTimer = () => {
        if (!timer) return;
        clearTimeout(timer);
        timer = null;
      };

      const rejectOnce = (error: DaemonConnectionTestError) => {
        if (settled) return;
        settled = true;
        clearProbeTimer();
        reject(error);
      };

      const resolveOnce = (result: {
        client: DaemonProbeClient;
        serverId: string;
        hostname: string | null;
      }) => {
        if (settled) return;
        settled = true;
        clearProbeTimer();
        resolve(result);
      };

      const handleTimeout = () => {
        timer = null;
        remainingTimeoutMs = 0;
        void client?.close().catch(() => undefined);
        rejectOnce(
          new DaemonConnectionTestError("Connection timed out", {
            reason: "Connection timed out",
            lastError: client?.lastError ?? null,
          }),
        );
      };

      const startProbeTimer = () => {
        if (settled || timer) return;
        if (remainingTimeoutMs <= 0) {
          handleTimeout();
          return;
        }
        timerStartedAt = Date.now();
        timer = setTimeout(handleTimeout, remainingTimeoutMs);
      };

      const pauseProbeTimer = () => {
        if (!timer) return;
        clearTimeout(timer);
        timer = null;
        remainingTimeoutMs = Math.max(0, remainingTimeoutMs - (Date.now() - timerStartedAt));
      };

      const resumeProbeTimer = () => {
        startProbeTimer();
      };

      const timeoutAwareConfig = withProbeTimeoutPausedDuringAdminPasswordPrompt(config, {
        pause: pauseProbeTimer,
        resume: resumeProbeTimer,
      });
      client = deps.createClient(timeoutAwareConfig);
      startProbeTimer();

      void client
        .connect()
        .then(() => {
          const serverInfo = client?.getLastServerInfoMessage() ?? null;
          if (!serverInfo) {
            void client?.close().catch(() => undefined);
            rejectOnce(
              new DaemonConnectionTestError("Missing server info message", {
                reason: "Missing server info message",
                lastError: client?.lastError ?? null,
              }),
            );
            return;
          }
          resolveOnce({
            client,
            serverId: serverInfo.serverId,
            hostname: serverInfo.hostname,
          });
          return;
        })
        .catch((error) => {
          const reason = normalizeNonEmptyString(
            error instanceof Error ? error.message : String(error),
          );
          const lastError = normalizeNonEmptyString(client?.lastError);
          const message = pickBestReason(reason, lastError);
          void client?.close().catch(() => undefined);
          rejectOnce(new DaemonConnectionTestError(message, { reason, lastError }));
        });
    },
  );
}

export const DEFAULT_DIRECT_DAEMON_PROBE_TIMEOUT_MS = 30_000;
export const DEFAULT_RELAY_DAEMON_PROBE_TIMEOUT_MS = 60_000;

interface ProbeOptions {
  serverId?: string;
  timeoutMs?: number;
}

function resolveTimeout(connection: HostConnection, options?: ProbeOptions): number {
  if (options?.timeoutMs) return options.timeoutMs;
  return connection.type === "relay"
    ? DEFAULT_RELAY_DAEMON_PROBE_TIMEOUT_MS
    : DEFAULT_DIRECT_DAEMON_PROBE_TIMEOUT_MS;
}

export function connectToDaemon(
  connection: HostConnection,
  options?: ProbeOptions,
): Promise<{ client: DaemonClient; serverId: string; hostname: string | null }>;
export function connectToDaemon<TClient extends DaemonProbeClient>(
  connection: HostConnection,
  options: ProbeOptions | undefined,
  deps: DaemonConnectionDependencies<TClient>,
): Promise<{ client: TClient; serverId: string; hostname: string | null }>;
export async function connectToDaemon(
  connection: HostConnection,
  options?: ProbeOptions,
  deps: DaemonConnectionDependencies<DaemonProbeClient> = defaultDaemonConnectionDependencies,
): Promise<{ client: DaemonProbeClient; serverId: string; hostname: string | null }> {
  const config = await buildClientConfig(connection, options?.serverId, deps);
  return connectAndProbe(config, resolveTimeout(connection, options), deps);
}
