import { WebSocketServer } from "ws";
import type { IncomingMessage, Server as HTTPServer } from "http";
import { basename, join } from "path";
import { hostname as getHostname } from "node:os";
import { randomBytes } from "node:crypto";
import type { AgentManager } from "./agent/agent-manager.js";
import type { AgentStorage } from "./agent/agent-storage.js";
import type { DownloadTokenStore } from "./file-download/token-store.js";
import type { TerminalManager } from "../terminal/terminal-manager.js";
import type pino from "pino";
import type { ProjectRegistry, WorkspaceRegistry } from "./workspace-registry.js";
import type { FileBackedChatService } from "./chat/chat-service.js";
import type { LoopService } from "./loop-service.js";
import type { ScheduleService } from "./schedule/service.js";
import type { CheckoutDiffManager, CheckoutDiffMetrics } from "./checkout-diff-manager.js";
import type { DaemonConfigStore, MutableDaemonConfig } from "./daemon-config-store.js";
import {
  type ServerInfoStatusPayload,
  type WorkspaceSetupSnapshot,
  type WSHelloMessage,
  type WSInboundMessage,
  type SessionInboundMessage,
  WSInboundMessageSchema,
  type ServerCapabilityState,
  type ServerCapabilities,
  type WSOutboundMessage,
  wrapSessionMessage,
} from "./messages.js";
import { asUint8Array, decodeTerminalStreamFrame } from "@bytetrue/protocol/binary-frames/index";
import type { HostnamesConfig } from "./hostnames.js";
import { isHostnameAllowed } from "./hostnames.js";
import { Session, type SessionLifecycleIntent, type SessionRuntimeMetrics } from "./session.js";
import type { AgentProvider } from "./agent/agent-sdk-types.js";
import type { ProviderSnapshotManager } from "./agent/provider-snapshot-manager.js";
import type { WorkspaceGitRuntimeSnapshot, WorkspaceGitService } from "./workspace-git-service.js";
import { buildWorkspaceGitMetadataFromSnapshot } from "./workspace-git-metadata.js";
import { PushTokenStore } from "./push/token-store.js";
import { createPushNotificationSender, type PushNotificationSender } from "./push/notifications.js";
import type { ScriptHealthState } from "./script-health-monitor.js";
import type { ServiceProxySubsystem } from "./service-proxy.js";
import type { WorkspaceScriptRuntimeStore } from "./workspace-script-runtime-store.js";
import type { SpeechReadinessSnapshot, SpeechService } from "./speech/speech-runtime.js";
import type { VoiceCallerContext, VoiceSpeakHandler } from "./voice-types.js";
import { computeNotificationPlan, type ClientPresenceState } from "./agent-attention-policy.js";
import {
  buildAgentAttentionNotificationPayload,
  findLatestPermissionRequest,
} from "@bytetrue/protocol/agent-attention-notification";
import { createGitHubService, type GitHubService } from "../services/github-service.js";
import {
  extractWsBearerProtocol,
  extractWsBearerToken,
  hashDaemonPassword,
  isBearerTokenValid,
  isBearerTokenValidAsync,
  type DaemonAuthConfig,
} from "./auth.js";
import {
  WebSocketRuntimeMetricsWindow,
  type WebSocketRuntimeCounters,
} from "./websocket/runtime-metrics.js";
import { AuthorizedClientStore, type AuthorizedClient } from "./authorized-client-store.js";
import { AuthAttemptThrottler } from "./auth-attempt-throttler.js";
import { loadPersistedConfig, savePersistedConfig } from "./persisted-config.js";
import { bytesToBase64, verifyDaemonAuthChallengeSignature } from "@bytetrue/protocol/daemon-auth";

const WS_CLOSE_DAEMON_AUTH_FAILED = 4401;

export interface ExternalSocketMetadata {
  transport: "relay";
  externalSessionKey?: string;
}

interface PendingAuthChallenge {
  challengeId: string;
  challengeB64: string;
  expiresAtMs: number;
}

interface PendingHello {
  clientId: string;
  appVersion: string | null;
  clientCapabilities: Record<string, unknown> | null;
}

interface SocketRequestMetadata {
  host?: string;
  origin?: string;
  userAgent?: string;
  remoteAddress?: string;
}

interface PendingConnection {
  connectionLogger: pino.Logger;
  helloTimeout: ReturnType<typeof setTimeout> | null;
  requestMetadata: SocketRequestMetadata;
  transport: "direct" | "relay";
  trustedLocal: boolean;
  legacyPasswordAuthorized: boolean;
  authAdminAllowed: boolean;
  hello: PendingHello | null;
  authChallenge: PendingAuthChallenge | null;
}

interface WebSocketServerConfig {
  allowedOrigins: Set<string>;
  hostnames?: HostnamesConfig;
}

type WebSocketRuntimeMetrics = SessionRuntimeMetrics & CheckoutDiffMetrics;

function createFallbackWorkspaceGitSnapshot(cwd: string): WorkspaceGitRuntimeSnapshot {
  return {
    cwd,
    git: {
      isGit: false,
      repoRoot: null,
      mainRepoRoot: null,
      currentBranch: null,
      remoteUrl: null,
      isPaseoOwnedWorktree: false,
      isDirty: null,
      baseRef: null,
      aheadBehind: null,
      aheadOfOrigin: null,
      behindOfOrigin: null,
      hasRemote: false,
      diffStat: null,
    },
    github: {
      featuresEnabled: false,
      pullRequest: null,
      error: null,
    },
  };
}

function createFallbackWorkspaceGitService(): WorkspaceGitService {
  return {
    registerWorkspace: () => ({
      unsubscribe: () => {},
    }),
    onSnapshotUpdated: () => ({
      unsubscribe: () => {},
    }),
    peekSnapshot: () => null,
    getCheckout: async (cwd: string) => ({
      cwd,
      isGit: false,
      currentBranch: null,
      remoteUrl: null,
      worktreeRoot: null,
      isPaseoOwnedWorktree: false,
      mainRepoRoot: null,
    }),
    getSnapshot: async (cwd: string) => createFallbackWorkspaceGitSnapshot(cwd),
    getCheckoutDiff: async () => ({ diff: "" }),
    validateBranchRef: async () => ({ kind: "not-found" }),
    hasLocalBranch: async () => false,
    suggestBranchesForCwd: async () => [],
    listStashes: async () => [],
    listWorktrees: async () => [],
    getWorkspaceGitMetadata: async (cwd: string, options) => {
      const snapshot = createFallbackWorkspaceGitSnapshot(cwd);
      return buildWorkspaceGitMetadataFromSnapshot({
        cwd,
        directoryName: options?.directoryName ?? basename(cwd),
        isGit: snapshot.git.isGit,
        repoRoot: snapshot.git.repoRoot,
        mainRepoRoot: snapshot.git.mainRepoRoot,
        currentBranch: snapshot.git.currentBranch,
        remoteUrl: snapshot.git.remoteUrl,
      });
    },
    resolveRepoRoot: async (cwd: string) => cwd,
    resolveDefaultBranch: async () => "main",
    resolveRepoRemoteUrl: async () => null,
    refresh: async () => {},
    requestWorkingTreeWatch: async () => ({
      repoRoot: null,
      unsubscribe: () => {},
    }),
    scheduleRefreshForCwd: () => {},
    dispose: () => {},
  };
}

function createNoopProjectRegistry(): ProjectRegistry {
  return {
    initialize: async () => {},
    existsOnDisk: async () => true,
    list: async () => [],
    get: async () => null,
    upsert: async () => {},
    archive: async () => {},
    remove: async () => {},
  };
}

function createNoopWorkspaceRegistry(): WorkspaceRegistry {
  return {
    initialize: async () => {},
    existsOnDisk: async () => true,
    list: async () => [],
    get: async () => null,
    upsert: async () => {},
    archive: async () => {},
    remove: async () => {},
  };
}

function toServerCapabilityState(params: {
  state: SpeechReadinessSnapshot["dictation"];
  reason: string;
}): ServerCapabilityState {
  const { state, reason } = params;
  return {
    enabled: state.enabled,
    reason,
  };
}

function resolveCapabilityReason(params: {
  state: SpeechReadinessSnapshot["dictation"];
  readiness: SpeechReadinessSnapshot;
}): string {
  const { state, readiness } = params;
  if (state.available) {
    return "";
  }

  if (readiness.voiceFeature.reasonCode === "model_download_in_progress") {
    const baseMessage = readiness.voiceFeature.message.trim();
    if (baseMessage.includes("Try again in a few minutes")) {
      return baseMessage;
    }
    return `${baseMessage} Try again in a few minutes.`;
  }

  return state.message;
}

function buildServerCapabilities(params: {
  readiness: SpeechReadinessSnapshot | null;
}): ServerCapabilities | undefined {
  const readiness = params.readiness;
  if (!readiness) {
    return undefined;
  }
  return {
    voice: {
      dictation: toServerCapabilityState({
        state: readiness.dictation,
        reason: resolveCapabilityReason({
          state: readiness.dictation,
          readiness,
        }),
      }),
      voice: toServerCapabilityState({
        state: readiness.realtimeVoice,
        reason: resolveCapabilityReason({
          state: readiness.realtimeVoice,
          readiness,
        }),
      }),
    },
  };
}

function areServerCapabilitiesEqual(
  current: ServerCapabilities | undefined,
  next: ServerCapabilities | undefined,
): boolean {
  return JSON.stringify(current ?? null) === JSON.stringify(next ?? null);
}

function bufferFromWsData(data: Buffer | ArrayBuffer | Buffer[] | string): Buffer {
  if (typeof data === "string") return Buffer.from(data, "utf8");
  if (Array.isArray(data)) {
    return Buffer.concat(
      data.map((item) => (Buffer.isBuffer(item) ? item : Buffer.from(item as ArrayBuffer))),
    );
  }
  if (Buffer.isBuffer(data)) return data;
  return Buffer.from(data);
}

interface WebSocketLike {
  readyState: number;
  bufferedAmount?: number;
  send: (data: string | Uint8Array | ArrayBuffer) => void;
  close: (code?: number, reason?: string) => void;
  on: (event: "message" | "close" | "error", listener: (...args: unknown[]) => void) => void;
  once: (event: "close" | "error", listener: (...args: unknown[]) => void) => void;
}

interface SessionConnection {
  session: Session;
  clientId: string;
  appVersion: string | null;
  clientCapabilities: Record<string, unknown> | null;
  connectionLogger: pino.Logger;
  sockets: Set<WebSocketLike>;
  externalDisconnectCleanupTimeout: ReturnType<typeof setTimeout> | null;
  sessionKey: string;
  authorizedClientId: string | null;
  authorizedClientPublicKeyB64: string | null;
}

const SLOW_REQUEST_THRESHOLD_MS = 500;
const EXTERNAL_SESSION_DISCONNECT_GRACE_MS = 90_000;
const HELLO_TIMEOUT_MS = 15_000;
const WS_CLOSE_HELLO_TIMEOUT = 4001;
const WS_CLOSE_INVALID_HELLO = 4002;
const WS_CLOSE_INCOMPATIBLE_PROTOCOL = 4003;
const WS_PROTOCOL_VERSION = 1;
const WS_RUNTIME_METRICS_FLUSH_MS = 30_000;

export class MissingDaemonVersionError extends Error {
  constructor() {
    super("VoiceAssistantWebSocketServer requires a non-empty daemonVersion.");
    this.name = "MissingDaemonVersionError";
  }
}

interface RequiredWebSocketServices {
  chatService: FileBackedChatService;
  loopService: LoopService;
  scheduleService: ScheduleService;
  checkoutDiffManager: CheckoutDiffManager;
}

function requireWebSocketServices(params: {
  chatService?: FileBackedChatService;
  loopService?: LoopService;
  scheduleService?: ScheduleService;
  checkoutDiffManager?: CheckoutDiffManager;
}): RequiredWebSocketServices {
  const { chatService, loopService, scheduleService, checkoutDiffManager } = params;
  if (!chatService) {
    throw new Error("VoiceAssistantWebSocketServer requires a chat service.");
  }
  if (!loopService) {
    throw new Error("VoiceAssistantWebSocketServer requires a loop service.");
  }
  if (!scheduleService) {
    throw new Error("VoiceAssistantWebSocketServer requires a schedule service.");
  }
  if (!checkoutDiffManager) {
    throw new Error("VoiceAssistantWebSocketServer requires a checkout diff manager.");
  }
  return { chatService, loopService, scheduleService, checkoutDiffManager };
}

/**
 * WebSocket server that only accepts sockets + parses/forwards messages to the session layer.
 */
export class VoiceAssistantWebSocketServer {
  private readonly logger: pino.Logger;
  private readonly wss: WebSocketServer;
  private readonly pendingConnections: Map<WebSocketLike, PendingConnection> = new Map();
  private readonly sessions: Map<WebSocketLike, SessionConnection> = new Map();
  private readonly externalSessionsByKey: Map<string, SessionConnection> = new Map();
  private readonly serverId: string;
  private readonly daemonVersion: string;
  private readonly daemonRuntimeConfig:
    | {
        listen: string | null;
        relay: {
          enabled: boolean;
          endpoint: string;
          publicEndpoint: string;
          useTls: boolean;
          publicUseTls: boolean;
        };
      }
    | undefined;
  private readonly agentManager: AgentManager;
  private readonly agentStorage: AgentStorage;
  private readonly projectRegistry: ProjectRegistry;
  private readonly workspaceRegistry: WorkspaceRegistry;
  private readonly chatService: FileBackedChatService;
  private readonly loopService: LoopService;
  private readonly scheduleService: ScheduleService;
  private readonly checkoutDiffManager: CheckoutDiffManager;
  private readonly github: GitHubService;
  private readonly workspaceGitService: WorkspaceGitService;
  private readonly downloadTokenStore: DownloadTokenStore;
  private readonly paseoHome: string;
  private readonly worktreesRoot: string | undefined;
  private readonly daemonConfigStore: DaemonConfigStore;
  private readonly authorizedClientStore: AuthorizedClientStore;
  private readonly authAttemptThrottler = new AuthAttemptThrottler();
  private authPasswordHash: string | undefined;
  private readonly pushTokenStore: PushTokenStore;
  private readonly pushNotificationSender: PushNotificationSender;
  private readonly mcpBaseUrl: string | null;
  private speech!: SpeechService | null;
  private terminalManager!: TerminalManager | null;
  private serviceProxy!: ServiceProxySubsystem | null;
  private scriptRuntimeStore!: WorkspaceScriptRuntimeStore | null;
  private getDaemonTcpPort!: (() => number | null) | null;
  private getDaemonTcpHost!: (() => string | null) | null;
  private serviceProxyPublicBaseUrl!: string | null;
  private resolveScriptHealth!: ((hostname: string) => ScriptHealthState | null) | null;
  private dictation!: {
    finalTimeoutMs?: number;
  } | null;
  private readonly voiceSpeakHandlers = new Map<string, VoiceSpeakHandler>();
  private readonly voiceCallerContexts = new Map<string, VoiceCallerContext>();
  private readonly workspaceSetupSnapshots = new Map<string, WorkspaceSetupSnapshot>();
  private readonly providerSnapshotManager: ProviderSnapshotManager;
  private onLifecycleIntent!: ((intent: SessionLifecycleIntent) => void) | null;
  private onBranchChanged!:
    | ((workspaceId: string, oldBranch: string | null, newBranch: string | null) => void)
    | null;
  private serverCapabilities: ServerCapabilities | undefined;
  private readonly runtimeMetrics = new WebSocketRuntimeMetricsWindow();
  private runtimeMetricsInterval: ReturnType<typeof setInterval> | null = null;
  private unsubscribeSpeechReadiness: (() => void) | null = null;
  private unsubscribeDaemonConfigChange: (() => void) | null = null;

  constructor(
    server: HTTPServer,
    logger: pino.Logger,
    serverId: string,
    agentManager: AgentManager,
    agentStorage: AgentStorage,
    downloadTokenStore: DownloadTokenStore,
    paseoHome: string,
    daemonConfigStore: DaemonConfigStore,
    mcpBaseUrl: string | null,
    wsConfig: WebSocketServerConfig,
    auth?: DaemonAuthConfig,
    speech?: SpeechService | null,
    terminalManager?: TerminalManager | null,
    dictation?: {
      finalTimeoutMs?: number;
    },
    daemonVersion?: string,
    onLifecycleIntent?: (intent: SessionLifecycleIntent) => void,
    projectRegistry?: ProjectRegistry,
    workspaceRegistry?: WorkspaceRegistry,
    chatService?: FileBackedChatService,
    loopService?: LoopService,
    scheduleService?: ScheduleService,
    checkoutDiffManager?: CheckoutDiffManager,
    serviceProxy?: ServiceProxySubsystem | null,
    scriptRuntimeStore?: WorkspaceScriptRuntimeStore | null,
    onBranchChanged?: (
      workspaceId: string,
      oldBranch: string | null,
      newBranch: string | null,
    ) => void,
    getDaemonTcpPort?: () => number | null,
    getDaemonTcpHost?: () => string | null,
    resolveScriptHealth?: (hostname: string) => ScriptHealthState | null,
    workspaceGitService?: WorkspaceGitService,
    github?: GitHubService,
    pushNotificationSender?: PushNotificationSender,
    providerSnapshotManager?: ProviderSnapshotManager,
    daemonRuntimeConfig?: {
      listen: string | null;
      worktreesRoot?: string;
      relay: {
        enabled: boolean;
        endpoint: string;
        publicEndpoint: string;
        useTls: boolean;
        publicUseTls: boolean;
      };
      appBaseUrl?: string;
    },
    serviceProxyPublicBaseUrl?: string | null,
  ) {
    this.logger = logger.child({ module: "websocket-server" });
    this.serverId = serverId;
    if (typeof daemonVersion !== "string" || daemonVersion.trim().length === 0) {
      throw new MissingDaemonVersionError();
    }
    this.daemonVersion = daemonVersion.trim();
    this.daemonRuntimeConfig = daemonRuntimeConfig;
    this.agentManager = agentManager;
    this.agentStorage = agentStorage;
    this.projectRegistry = projectRegistry ?? createNoopProjectRegistry();
    this.workspaceRegistry = workspaceRegistry ?? createNoopWorkspaceRegistry();
    const requiredServices = requireWebSocketServices({
      chatService,
      loopService,
      scheduleService,
      checkoutDiffManager,
    });
    this.chatService = requiredServices.chatService;
    this.loopService = requiredServices.loopService;
    this.scheduleService = requiredServices.scheduleService;
    this.checkoutDiffManager = requiredServices.checkoutDiffManager;
    this.github = github ?? createGitHubService();
    this.workspaceGitService = workspaceGitService ?? createFallbackWorkspaceGitService();
    this.downloadTokenStore = downloadTokenStore;
    this.paseoHome = paseoHome;
    this.worktreesRoot = daemonRuntimeConfig?.worktreesRoot;
    this.daemonConfigStore = daemonConfigStore;
    this.authPasswordHash = auth?.password;
    this.authorizedClientStore = new AuthorizedClientStore(
      this.logger,
      join(paseoHome, "authorized-clients.json"),
    );
    this.mcpBaseUrl = mcpBaseUrl;
    this.assignOptionalServices({
      speech,
      terminalManager,
      dictation,
      onLifecycleIntent,
      serviceProxy,
      scriptRuntimeStore,
      onBranchChanged,
      getDaemonTcpPort,
      getDaemonTcpHost,
      serviceProxyPublicBaseUrl,
      resolveScriptHealth,
    });
    if (!providerSnapshotManager) {
      throw new Error("providerSnapshotManager is required");
    }
    this.providerSnapshotManager = providerSnapshotManager;
    this.serverCapabilities = buildServerCapabilities({
      readiness: this.speech?.getReadiness() ?? null,
    });
    this.unsubscribeSpeechReadiness =
      this.speech?.onReadinessChange((snapshot) => {
        this.publishSpeechReadiness(snapshot);
      }) ?? null;
    this.unsubscribeDaemonConfigChange = this.daemonConfigStore.onChange((config) => {
      const nextAgentManagerState = this.providerSnapshotManager.applyMutableProviderConfig(
        config.providers,
      );
      this.agentManager.updateProviderRegistry(nextAgentManagerState);
      this.broadcastDaemonConfigChanged(config);
    });

    const pushLogger = this.logger.child({ module: "push" });
    this.pushTokenStore = new PushTokenStore(pushLogger, join(paseoHome, "push-tokens.json"));
    this.pushNotificationSender =
      pushNotificationSender ?? createPushNotificationSender(pushLogger, this.pushTokenStore);

    this.agentManager.setAgentAttentionCallback((params) => {
      void this.broadcastAgentAttention(params).catch((err) => {
        this.logger.warn({ err, agentId: params.agentId }, "Failed to broadcast agent attention");
      });
    });

    this.wss = this.createWebSocketServer(server, wsConfig, auth);
    this.startRuntimeMetricsInterval();

    this.logger.info("WebSocket server initialized on /ws");
  }

  private assignOptionalServices(params: {
    speech: SpeechService | null | undefined;
    terminalManager: TerminalManager | null | undefined;
    dictation: { finalTimeoutMs?: number } | undefined;
    onLifecycleIntent: ((intent: SessionLifecycleIntent) => void) | undefined;
    serviceProxy: ServiceProxySubsystem | null | undefined;
    scriptRuntimeStore: WorkspaceScriptRuntimeStore | null | undefined;
    onBranchChanged:
      | ((workspaceId: string, oldBranch: string | null, newBranch: string | null) => void)
      | undefined;
    getDaemonTcpPort: (() => number | null) | undefined;
    getDaemonTcpHost: (() => string | null) | undefined;
    serviceProxyPublicBaseUrl: string | null | undefined;
    resolveScriptHealth: ((hostname: string) => ScriptHealthState | null) | undefined;
  }): void {
    this.speech = params.speech ?? null;
    this.terminalManager = params.terminalManager ?? null;
    this.dictation = params.dictation ?? null;
    this.onLifecycleIntent = params.onLifecycleIntent ?? null;
    this.serviceProxy = params.serviceProxy ?? null;
    this.scriptRuntimeStore = params.scriptRuntimeStore ?? null;
    this.onBranchChanged = params.onBranchChanged ?? null;
    this.getDaemonTcpPort = params.getDaemonTcpPort ?? null;
    this.getDaemonTcpHost = params.getDaemonTcpHost ?? null;
    this.serviceProxyPublicBaseUrl = params.serviceProxyPublicBaseUrl ?? null;
    this.resolveScriptHealth = params.resolveScriptHealth ?? null;
  }

  private createWebSocketServer(
    server: HTTPServer,
    wsConfig: WebSocketServerConfig,
    _auth: DaemonAuthConfig | undefined,
  ): WebSocketServer {
    const { allowedOrigins, hostnames } = wsConfig;
    const wss = new WebSocketServer({
      server,
      path: "/ws",
      verifyClient: ({ req }, callback) => {
        this.verifyWsUpgrade(req, allowedOrigins, hostnames, callback);
      },
      // COMPAT(legacyWsBearerAuth): retained in v0.1.87 for pre-auth old clients; remove after 2026-12-04.
      handleProtocols: (protocols) => selectWebSocketProtocol(protocols, this.authPasswordHash),
    });
    wss.on("connection", (ws, request) => {
      void this.attachSocket(ws, request);
    });
    return wss;
  }

  private startRuntimeMetricsInterval(): void {
    const runtimeMetricsInterval = setInterval(() => {
      this.flushRuntimeMetrics();
    }, WS_RUNTIME_METRICS_FLUSH_MS);
    this.runtimeMetricsInterval = runtimeMetricsInterval;
    (runtimeMetricsInterval as unknown as { unref?: () => void }).unref?.();
  }

  private verifyWsUpgrade(
    req: IncomingMessage,
    allowedOrigins: Set<string>,
    hostnames: HostnamesConfig | undefined,
    callback: (res: boolean, code?: number, message?: string) => void,
  ): void {
    const requestMetadata = extractSocketRequestMetadata(req);
    const origin = requestMetadata.origin;
    const requestHost = requestMetadata.host ?? null;
    if (requestHost && !isHostnameAllowed(requestHost, hostnames)) {
      this.incrementRuntimeCounter("hostRejected");
      this.logger.warn(
        { ...requestMetadata, host: requestHost },
        "Rejected connection from disallowed host",
      );
      callback(false, 403, "Host not allowed");
      return;
    }
    const sameOrigin =
      !!origin &&
      !!requestHost &&
      (origin === `http://${requestHost}` || origin === `https://${requestHost}`);

    if (!origin || allowedOrigins.has("*") || allowedOrigins.has(origin) || sameOrigin) {
      callback(true);
    } else {
      this.incrementRuntimeCounter("originRejected");
      this.logger.warn({ ...requestMetadata, origin }, "Rejected connection from origin");
      callback(false, 403, "Origin not allowed");
    }
  }

  public broadcast(message: WSOutboundMessage): void {
    const payload = JSON.stringify(message);
    for (const ws of this.sessions.keys()) {
      // WebSocket.OPEN = 1
      if (ws.readyState === 1) {
        ws.send(payload);
        this.runtimeMetrics.recordOutboundMessage(message, ws.bufferedAmount);
      }
    }
  }

  public listActiveSessions(): Session[] {
    return Array.from(
      new Set(
        [...this.sessions.values(), ...this.externalSessionsByKey.values()].map(
          (connection) => connection.session,
        ),
      ),
    );
  }

  public publishSpeechReadiness(readiness: SpeechReadinessSnapshot | null): void {
    this.updateServerCapabilities(buildServerCapabilities({ readiness }));
  }

  public updateServerCapabilities(capabilities: ServerCapabilities | null | undefined): void {
    const next = capabilities ?? undefined;
    if (areServerCapabilitiesEqual(this.serverCapabilities, next)) {
      return;
    }
    this.serverCapabilities = next;
    this.broadcastCapabilitiesUpdate();
  }

  public async attachExternalSocket(
    ws: WebSocketLike,
    metadata?: ExternalSocketMetadata,
  ): Promise<void> {
    if (metadata?.transport === "relay") {
      this.incrementRuntimeCounter("relayExternalSocketAttached");
    }
    await this.attachSocket(ws, undefined, metadata);
  }

  public async close(): Promise<void> {
    this.unsubscribeSpeechReadiness?.();
    this.unsubscribeSpeechReadiness = null;
    this.unsubscribeDaemonConfigChange?.();
    this.unsubscribeDaemonConfigChange = null;
    if (this.runtimeMetricsInterval) {
      clearInterval(this.runtimeMetricsInterval);
      this.runtimeMetricsInterval = null;
    }
    this.flushRuntimeMetrics({ final: true });

    const uniqueConnections = new Set<SessionConnection>([
      ...this.sessions.values(),
      ...this.externalSessionsByKey.values(),
    ]);

    const pendingSockets = new Set<WebSocketLike>(this.pendingConnections.keys());
    for (const pending of this.pendingConnections.values()) {
      if (pending.helloTimeout) {
        clearTimeout(pending.helloTimeout);
        pending.helloTimeout = null;
      }
    }

    const cleanupPromises: Promise<void>[] = [];
    for (const connection of uniqueConnections) {
      if (connection.externalDisconnectCleanupTimeout) {
        clearTimeout(connection.externalDisconnectCleanupTimeout);
        connection.externalDisconnectCleanupTimeout = null;
      }

      cleanupPromises.push(connection.session.cleanup());
      for (const ws of connection.sockets) {
        cleanupPromises.push(
          new Promise<void>((resolve) => {
            // WebSocket.CLOSED = 3
            if (ws.readyState === 3) {
              resolve();
              return;
            }
            ws.once("close", () => resolve());
            ws.close();
          }),
        );
      }
    }

    for (const ws of pendingSockets) {
      cleanupPromises.push(
        new Promise<void>((resolve) => {
          if (ws.readyState === 3) {
            resolve();
            return;
          }
          ws.once("close", () => resolve());
          ws.close();
        }),
      );
    }

    await Promise.all(cleanupPromises);
    this.providerSnapshotManager.destroy();
    this.checkoutDiffManager.dispose();
    this.workspaceGitService.dispose();
    this.pendingConnections.clear();
    this.sessions.clear();
    this.externalSessionsByKey.clear();
    this.wss.close();
  }

  private sendToClient(ws: WebSocketLike, message: WSOutboundMessage): void {
    // WebSocket.OPEN = 1. The check is a fast path; the socket can still
    // transition to closed between here and ws.send(), so guard the send too —
    // a synchronous throw here would propagate as an uncaughtException.
    if (ws.readyState !== 1) {
      return;
    }
    try {
      ws.send(JSON.stringify(message));
      this.runtimeMetrics.recordOutboundMessage(message, ws.bufferedAmount);
    } catch (err) {
      this.logger.warn({ err }, "ws_send_failed");
    }
  }

  private sendBinaryToClient(ws: WebSocketLike, frame: Uint8Array): void {
    if (ws.readyState !== 1) {
      return;
    }
    try {
      ws.send(frame);
      this.runtimeMetrics.recordOutboundBinaryFrame(ws.bufferedAmount);
    } catch (err) {
      this.logger.warn({ err }, "ws_send_binary_failed");
    }
  }

  private sendToConnection(connection: SessionConnection, message: WSOutboundMessage): void {
    for (const ws of connection.sockets) {
      this.sendToClient(ws, message);
    }
  }

  private sendBinaryToConnection(connection: SessionConnection, frame: Uint8Array): void {
    for (const ws of connection.sockets) {
      this.sendBinaryToClient(ws, frame);
    }
  }

  private async attachSocket(
    ws: WebSocketLike,
    request?: unknown,
    metadata?: ExternalSocketMetadata,
  ): Promise<void> {
    const requestMetadata = extractSocketRequestMetadata(request);
    const connectionLoggerFields: Record<string, string> = {
      transport: metadata?.transport === "relay" ? "relay" : "direct",
    };
    if (requestMetadata.host) {
      connectionLoggerFields.host = requestMetadata.host;
    }
    if (requestMetadata.origin) {
      connectionLoggerFields.origin = requestMetadata.origin;
    }
    if (requestMetadata.userAgent) {
      connectionLoggerFields.userAgent = requestMetadata.userAgent;
    }
    if (requestMetadata.remoteAddress) {
      connectionLoggerFields.remoteAddress = requestMetadata.remoteAddress;
    }
    const connectionLogger = this.logger.child(connectionLoggerFields);
    const transport = metadata?.transport === "relay" ? "relay" : "direct";
    const trustedLocal = transport === "direct" && isLocalSocketRequest(requestMetadata);
    const legacyProtocol = extractLegacyWsBearerProtocolFromRequest(request);
    const legacyPasswordAuthorized =
      transport === "direct" &&
      legacyProtocol !== null &&
      isBearerTokenValid({
        password: this.authPasswordHash,
        token: extractWsBearerToken(legacyProtocol),
      });
    if (transport === "direct" && legacyProtocol !== null && !legacyPasswordAuthorized) {
      connectionLogger.warn(
        { hasToken: extractWsBearerToken(legacyProtocol) !== null },
        "Rejected WebSocket connection with invalid legacy daemon password",
      );
      try {
        ws.close(WS_CLOSE_DAEMON_AUTH_FAILED, "Incorrect password");
      } catch {
        // ignore close errors
      }
      return;
    }
    const authAdminAllowed =
      trustedLocal ||
      legacyPasswordAuthorized ||
      transport === "relay" ||
      isTlsSocketRequest(request);

    const pending: PendingConnection = {
      connectionLogger,
      helloTimeout: null,
      requestMetadata,
      transport,
      trustedLocal,
      legacyPasswordAuthorized,
      authAdminAllowed,
      hello: null,
      authChallenge: null,
    };
    const timeout = setTimeout(() => {
      if (this.pendingConnections.get(ws) !== pending) {
        return;
      }
      pending.helloTimeout = null;
      this.pendingConnections.delete(ws);
      pending.connectionLogger.warn(
        { timeoutMs: HELLO_TIMEOUT_MS },
        "Closing connection due to missing hello",
      );
      try {
        ws.close(WS_CLOSE_HELLO_TIMEOUT, "Hello timeout");
      } catch {
        // ignore close errors
      }
    }, HELLO_TIMEOUT_MS);
    pending.helloTimeout = timeout;
    (timeout as unknown as { unref?: () => void }).unref?.();

    this.pendingConnections.set(ws, pending);
    this.incrementRuntimeCounter("connectedAwaitingHello");
    this.bindSocketHandlers(ws);

    pending.connectionLogger.trace(
      {
        totalPendingConnections: this.pendingConnections.size,
      },
      "Client connected; awaiting hello",
    );
  }

  private createSessionConnection(params: {
    ws: WebSocketLike;
    clientId: string;
    appVersion: string | null;
    clientCapabilities: Record<string, unknown> | null;
    connectionLogger: pino.Logger;
    sessionKey: string;
    authorizedClient: AuthorizedClient | null;
    authAdminAllowed: boolean;
    authAdministrationThrottleKey: string | null;
  }): SessionConnection {
    const {
      ws,
      clientId,
      appVersion,
      clientCapabilities,
      connectionLogger,
      sessionKey,
      authorizedClient,
      authAdminAllowed,
      authAdministrationThrottleKey,
    } = params;
    let connection: SessionConnection | null = null;

    const session = new Session({
      clientId,
      appVersion,
      clientCapabilities,
      onMessage: (msg) => {
        if (!connection) {
          return;
        }
        this.sendToConnection(connection, wrapSessionMessage(msg));
      },
      onBinaryMessage: (frame) => {
        if (!connection) {
          return;
        }
        this.sendBinaryToConnection(connection, frame);
      },
      onLifecycleIntent: (intent) => {
        this.onLifecycleIntent?.(intent);
      },
      logger: connectionLogger.child({ module: "session" }),
      downloadTokenStore: this.downloadTokenStore,
      pushTokenStore: this.pushTokenStore,
      paseoHome: this.paseoHome,
      worktreesRoot: this.worktreesRoot,
      agentManager: this.agentManager,
      agentStorage: this.agentStorage,
      projectRegistry: this.projectRegistry,
      workspaceRegistry: this.workspaceRegistry,
      chatService: this.chatService,
      loopService: this.loopService,
      scheduleService: this.scheduleService,
      checkoutDiffManager: this.checkoutDiffManager,
      github: this.github,
      workspaceGitService: this.workspaceGitService,
      daemonConfigStore: this.daemonConfigStore,
      authAdministration: this.createSessionAuthAdministration(
        authAdminAllowed,
        authAdministrationThrottleKey,
      ),
      mcpBaseUrl: this.mcpBaseUrl,
      stt: () => this.speech?.resolveStt() ?? null,
      sttLanguage: this.speech?.resolveSttLanguage() ?? "en",
      tts: () => this.speech?.resolveTts() ?? null,
      terminalManager: this.terminalManager,
      providerSnapshotManager: this.providerSnapshotManager,
      serviceProxy: this.serviceProxy ?? undefined,
      scriptRuntimeStore: this.scriptRuntimeStore ?? undefined,
      workspaceSetupSnapshots: this.workspaceSetupSnapshots,
      onBranchChanged: this.onBranchChanged ?? undefined,
      getDaemonTcpPort: this.getDaemonTcpPort ?? undefined,
      getDaemonTcpHost: this.getDaemonTcpHost ?? undefined,
      serviceProxyPublicBaseUrl: this.serviceProxyPublicBaseUrl,
      resolveScriptHealth: this.resolveScriptHealth ?? undefined,
      voice: {
        turnDetection: () => this.speech?.resolveTurnDetection() ?? null,
      },
      voiceBridge: {
        registerVoiceSpeakHandler: (agentId, handler) => {
          this.voiceSpeakHandlers.set(agentId, handler);
        },
        unregisterVoiceSpeakHandler: (agentId) => {
          this.voiceSpeakHandlers.delete(agentId);
        },
        registerVoiceCallerContext: (agentId, context) => {
          this.voiceCallerContexts.set(agentId, context);
        },
        unregisterVoiceCallerContext: (agentId) => {
          this.voiceCallerContexts.delete(agentId);
        },
      },
      dictation:
        this.dictation || this.speech
          ? {
              finalTimeoutMs: this.dictation?.finalTimeoutMs,
              stt: () => this.speech?.resolveDictationStt() ?? null,
              sttLanguage: this.speech?.resolveDictationSttLanguage() ?? "en",
              getSpeechReadiness: () => this.speech!.getReadiness(),
            }
          : undefined,
      serverId: this.serverId,
      daemonVersion: this.daemonVersion,
      daemonRuntimeConfig: this.daemonRuntimeConfig,
    });

    connection = {
      session,
      clientId,
      appVersion,
      clientCapabilities,
      connectionLogger,
      sockets: new Set([ws]),
      externalDisconnectCleanupTimeout: null,
      sessionKey,
      authorizedClientId: authorizedClient?.id ?? null,
      authorizedClientPublicKeyB64: authorizedClient?.publicKeyB64 ?? null,
    };
    return connection;
  }

  private clearPendingConnection(ws: WebSocketLike): PendingConnection | null {
    const pending = this.pendingConnections.get(ws);
    if (!pending) {
      return null;
    }
    if (pending.helloTimeout) {
      clearTimeout(pending.helloTimeout);
      pending.helloTimeout = null;
    }
    this.pendingConnections.delete(ws);
    return pending;
  }

  private handleHello(params: {
    ws: WebSocketLike;
    message: WSHelloMessage;
    pending: PendingConnection;
  }): void {
    const { ws, message, pending } = params;

    if (message.protocolVersion !== WS_PROTOCOL_VERSION) {
      this.clearPendingConnection(ws);
      pending.connectionLogger.warn(
        {
          receivedProtocolVersion: message.protocolVersion,
          expectedProtocolVersion: WS_PROTOCOL_VERSION,
        },
        "Rejected hello due to protocol version mismatch",
      );
      try {
        ws.close(WS_CLOSE_INCOMPATIBLE_PROTOCOL, "Incompatible protocol version");
      } catch {
        // ignore close errors
      }
      return;
    }

    const clientId = message.clientId.trim();
    if (clientId.length === 0) {
      this.clearPendingConnection(ws);
      pending.connectionLogger.warn("Rejected hello with empty clientId");
      try {
        ws.close(WS_CLOSE_INVALID_HELLO, "Invalid hello");
      } catch {
        // ignore close errors
      }
      return;
    }

    const hello: PendingHello = {
      clientId,
      appVersion: message.appVersion ?? null,
      clientCapabilities: message.capabilities ?? null,
    };

    if (pending.trustedLocal || pending.legacyPasswordAuthorized) {
      this.attachSessionForHello({
        ws,
        pending,
        hello,
        authorizedClient: null,
      });
      return;
    }

    pending.hello = hello;
    this.clearPendingHelloTimeout(pending);
    this.sendAuthChallenge(ws, pending);
  }

  private attachSessionForHello(params: {
    ws: WebSocketLike;
    pending: PendingConnection;
    hello: PendingHello;
    authorizedClient: AuthorizedClient | null;
  }): void {
    const { ws, pending, hello, authorizedClient } = params;
    this.clearPendingConnection(ws);
    const sessionKey = buildSessionKey(hello.clientId, authorizedClient);
    const existing = this.externalSessionsByKey.get(sessionKey);
    if (existing) {
      this.incrementRuntimeCounter("helloResumed");
      if (existing.externalDisconnectCleanupTimeout) {
        clearTimeout(existing.externalDisconnectCleanupTimeout);
        existing.externalDisconnectCleanupTimeout = null;
      }
      if (hello.appVersion && hello.appVersion !== existing.appVersion) {
        existing.appVersion = hello.appVersion;
        existing.session.updateAppVersion(hello.appVersion);
      }
      if (
        JSON.stringify(existing.clientCapabilities ?? null) !==
        JSON.stringify(hello.clientCapabilities ?? null)
      ) {
        existing.clientCapabilities = hello.clientCapabilities;
        existing.session.updateClientCapabilities(hello.clientCapabilities);
      }
      existing.sockets.add(ws);
      this.sessions.set(ws, existing);
      this.sendToClient(ws, this.createServerInfoMessage());
      existing.connectionLogger.trace(
        {
          clientId: hello.clientId,
          resumed: true,
          totalSessions: this.sessions.size,
        },
        "Client connected via hello",
      );
      return;
    }

    const connectionLogger = pending.connectionLogger.child({
      clientId: hello.clientId,
      ...(authorizedClient ? { authorizedClientId: authorizedClient.id } : {}),
    });
    this.incrementRuntimeCounter("helloNew");
    const connection = this.createSessionConnection({
      ws,
      clientId: hello.clientId,
      appVersion: hello.appVersion,
      clientCapabilities: hello.clientCapabilities,
      connectionLogger,
      sessionKey,
      authorizedClient,
      authAdminAllowed: pending.authAdminAllowed,
      authAdministrationThrottleKey: this.getAuthAdministrationThrottleKey(
        pending,
        hello,
        authorizedClient,
      ),
    });
    this.sessions.set(ws, connection);
    this.externalSessionsByKey.set(sessionKey, connection);
    this.sendToClient(ws, this.createServerInfoMessage());
    connection.connectionLogger.trace(
      {
        clientId: hello.clientId,
        resumed: false,
        totalSessions: this.sessions.size,
      },
      "Client connected via hello",
    );
  }

  private clearPendingHelloTimeout(pending: PendingConnection): void {
    if (!pending.helloTimeout) {
      return;
    }
    clearTimeout(pending.helloTimeout);
    pending.helloTimeout = null;
  }

  private sendAuthChallenge(ws: WebSocketLike, pending: PendingConnection): void {
    const challenge = this.createAuthChallenge();
    pending.authChallenge = challenge;
    const passwordConfigured = Boolean(this.authPasswordHash);
    let error: string | null = null;
    if (!passwordConfigured) {
      error = "Set a daemon administrator password locally before enrolling remote clients";
    } else if (!pending.authAdminAllowed) {
      error = "Enrollment requires relay E2EE, localhost, IPC, or trusted TLS direct transport";
    }
    this.sendToClient(
      ws,
      wrapSessionMessage({
        type: "daemon.auth.challenge.response",
        payload: {
          requestId: `auth_${challenge.challengeId}`,
          serverId: this.serverId,
          challengeId: challenge.challengeId,
          challengeB64: challenge.challengeB64,
          expiresAt: new Date(challenge.expiresAtMs).toISOString(),
          adminPasswordConfigured: passwordConfigured,
          enrollmentAllowed: passwordConfigured && pending.authAdminAllowed,
          transport: pending.transport,
          error,
        },
      }),
    );
  }

  private createAuthChallenge(): PendingAuthChallenge {
    return {
      challengeId: bytesToBase64(randomBytes(16)),
      challengeB64: bytesToBase64(randomBytes(32)),
      expiresAtMs: Date.now() + 120_000,
    };
  }

  private async handlePreAuthSessionMessage(params: {
    ws: WebSocketLike;
    pending: PendingConnection;
    message: SessionInboundMessage;
  }): Promise<boolean> {
    const { ws, pending, message } = params;
    switch (message.type) {
      case "daemon.auth.prove.request":
        await this.handlePreAuthProveRequest(ws, pending, message);
        return true;
      case "daemon.auth.enroll.request":
        await this.handlePreAuthEnrollRequest(ws, pending, message);
        return true;
      default:
        return false;
    }
  }

  private async handlePreAuthProveRequest(
    ws: WebSocketLike,
    pending: PendingConnection,
    message: Extract<SessionInboundMessage, { type: "daemon.auth.prove.request" }>,
  ): Promise<void> {
    const client = this.authorizedClientStore.findByPublicKey(message.clientPublicKeyB64);
    if (!client) {
      this.sendToClient(
        ws,
        wrapSessionMessage({
          type: "daemon.auth.prove.response",
          payload: {
            requestId: message.requestId,
            ok: false,
            code: "not_enrolled",
            error: "Client is not enrolled with this daemon",
          },
        }),
      );
      return;
    }

    const proof = this.validatePendingAuthProof(pending, message, "authenticate");
    if (!proof.ok) {
      this.sendToClient(
        ws,
        wrapSessionMessage({
          type: "daemon.auth.prove.response",
          payload: { requestId: message.requestId, ...proof.error },
        }),
      );
      return;
    }

    const touchedClient = this.authorizedClientStore.touch(client.publicKeyB64) ?? client;
    this.authAttemptThrottler.recordSuccess(
      this.getAuthThrottleKey(pending, message.clientPublicKeyB64),
    );
    this.sendToClient(
      ws,
      wrapSessionMessage({
        type: "daemon.auth.prove.response",
        payload: {
          requestId: message.requestId,
          ok: true,
          client: touchedClient,
        },
      }),
    );
    this.attachSessionForHello({
      ws,
      pending,
      hello: proof.hello,
      authorizedClient: touchedClient,
    });
  }

  private async handlePreAuthEnrollRequest(
    ws: WebSocketLike,
    pending: PendingConnection,
    message: Extract<SessionInboundMessage, { type: "daemon.auth.enroll.request" }>,
  ): Promise<void> {
    if (!pending.authAdminAllowed) {
      this.sendPreAuthEnrollFailure(ws, message.requestId, {
        code: "transport_not_allowed",
        error: "Enrollment requires relay E2EE, localhost, IPC, or trusted TLS direct transport",
      });
      return;
    }
    if (!this.authPasswordHash) {
      this.sendPreAuthEnrollFailure(ws, message.requestId, {
        code: "password_not_configured",
        error: "Set a daemon administrator password locally before enrolling remote clients",
      });
      return;
    }

    const throttleKey = this.getAuthThrottleKey(pending, message.clientPublicKeyB64);
    const throttle = this.authAttemptThrottler.check(throttleKey);
    if (!throttle.allowed) {
      this.sendPreAuthEnrollFailure(ws, message.requestId, {
        code: "rate_limited",
        error: "Too many failed enrollment attempts",
        retryAfterMs: throttle.retryAfterMs,
      });
      return;
    }

    const proof = this.validatePendingAuthProof(pending, message, "enroll");
    if (!proof.ok) {
      const nextThrottle = this.authAttemptThrottler.recordFailure(throttleKey);
      this.sendPreAuthEnrollFailure(ws, message.requestId, {
        ...proof.error,
        retryAfterMs: nextThrottle.retryAfterMs,
      });
      return;
    }

    if (!(await this.isAdminPasswordValid(message.adminPassword))) {
      const nextThrottle = this.authAttemptThrottler.recordFailure(throttleKey);
      this.sendPreAuthEnrollFailure(ws, message.requestId, {
        code: "incorrect_password",
        error: "Incorrect daemon administrator password",
        retryAfterMs: nextThrottle.retryAfterMs,
      });
      return;
    }

    this.authAttemptThrottler.recordSuccess(throttleKey);
    const client = this.authorizedClientStore.enroll({
      publicKeyB64: message.clientPublicKeyB64,
      clientName: message.clientName ?? null,
    });
    this.sendToClient(
      ws,
      wrapSessionMessage({
        type: "daemon.auth.enroll.response",
        payload: {
          requestId: message.requestId,
          ok: true,
          client,
        },
      }),
    );
    this.attachSessionForHello({
      ws,
      pending,
      hello: proof.hello,
      authorizedClient: client,
    });
  }

  private validatePendingAuthProof(
    pending: PendingConnection,
    message: Extract<
      SessionInboundMessage,
      { type: "daemon.auth.prove.request" | "daemon.auth.enroll.request" }
    >,
    purpose: "authenticate" | "enroll",
  ):
    | { ok: true; hello: PendingHello }
    | {
        ok: false;
        error: {
          ok: false;
          code: "invalid_challenge" | "invalid_signature";
          error: string;
          retryAfterMs?: number;
        };
      } {
    const hello = pending.hello;
    const challenge = pending.authChallenge;
    if (!hello || !challenge || challenge.challengeId !== message.challengeId) {
      return {
        ok: false,
        error: {
          ok: false,
          code: "invalid_challenge",
          error: "Auth challenge is missing or no longer valid",
        },
      };
    }
    if (challenge.expiresAtMs <= Date.now()) {
      return {
        ok: false,
        error: {
          ok: false,
          code: "invalid_challenge",
          error: "Auth challenge expired",
        },
      };
    }

    const verified = verifyDaemonAuthChallengeSignature({
      serverId: this.serverId,
      clientId: hello.clientId,
      clientPublicKeyB64: message.clientPublicKeyB64,
      challengeId: challenge.challengeId,
      challengeB64: challenge.challengeB64,
      purpose,
      signatureB64: message.signatureB64,
    });
    if (!verified) {
      return {
        ok: false,
        error: {
          ok: false,
          code: "invalid_signature",
          error: "Auth challenge signature was invalid",
        },
      };
    }

    return { ok: true, hello };
  }

  private sendPreAuthEnrollFailure(
    ws: WebSocketLike,
    requestId: string,
    failure: {
      code:
        | "invalid_challenge"
        | "invalid_signature"
        | "incorrect_password"
        | "password_not_configured"
        | "transport_not_allowed"
        | "rate_limited";
      error: string;
      retryAfterMs?: number;
    },
  ): void {
    this.sendToClient(
      ws,
      wrapSessionMessage({
        type: "daemon.auth.enroll.response",
        payload: {
          requestId,
          ok: false,
          ...failure,
        },
      }),
    );
  }

  private getAuthThrottleKey(pending: PendingConnection, clientPublicKeyB64: string): string {
    const source = pending.requestMetadata.remoteAddress ?? pending.hello?.clientId ?? "unknown";
    return `${pending.transport}:${source}:${clientPublicKeyB64}`;
  }

  private async isAdminPasswordValid(password: string | undefined): Promise<boolean> {
    return isBearerTokenValidAsync({ password: this.authPasswordHash, token: password ?? null });
  }

  private getAuthAdministrationThrottleKey(
    pending: PendingConnection,
    hello: PendingHello,
    authorizedClient: AuthorizedClient | null,
  ): string | null {
    if (pending.trustedLocal) {
      return null;
    }
    const source = pending.requestMetadata.remoteAddress ?? hello.clientId ?? "unknown";
    const identity = authorizedClient?.publicKeyB64 ?? `client:${hello.clientId}`;
    return `admin:${pending.transport}:${source}:${identity}`;
  }

  private createAuthAdministrationRateLimitFailure(throttleKey: string | null): {
    ok: false;
    code: "rate_limited";
    error: string;
    retryAfterMs: number;
  } | null {
    if (!throttleKey) {
      return null;
    }
    const throttle = this.authAttemptThrottler.check(throttleKey);
    if (throttle.allowed) {
      return null;
    }
    return {
      ok: false,
      code: "rate_limited",
      error: "Too many failed administrator password attempts",
      retryAfterMs: throttle.retryAfterMs ?? 1,
    };
  }

  private recordAuthAdministrationFailure(throttleKey: string | null): { retryAfterMs?: number } {
    if (!throttleKey) {
      return {};
    }
    const throttle = this.authAttemptThrottler.recordFailure(throttleKey);
    return { retryAfterMs: throttle.retryAfterMs };
  }

  private recordAuthAdministrationSuccess(throttleKey: string | null): void {
    if (throttleKey) {
      this.authAttemptThrottler.recordSuccess(throttleKey);
    }
  }

  private createSessionAuthAdministration(
    authAdminAllowed: boolean,
    authAdministrationThrottleKey: string | null,
  ) {
    return {
      listClients: () => ({
        clients: this.authorizedClientStore.list(),
        passwordConfigured: Boolean(this.authPasswordHash),
      }),
      revokeClient: async (input: { clientId: string; adminPassword: string }) => {
        if (!authAdminAllowed) {
          return {
            ok: false as const,
            code: "transport_not_allowed" as const,
            error:
              "Auth administration requires relay E2EE, localhost, IPC, or trusted TLS direct transport",
          };
        }
        if (!this.authPasswordHash) {
          return {
            ok: false as const,
            code: "password_not_configured" as const,
            error: "Daemon administrator password is not configured",
          };
        }
        const rateLimitFailure = this.createAuthAdministrationRateLimitFailure(
          authAdministrationThrottleKey,
        );
        if (rateLimitFailure) {
          return rateLimitFailure;
        }
        if (!(await this.isAdminPasswordValid(input.adminPassword))) {
          return {
            ok: false as const,
            code: "incorrect_password" as const,
            error: "Incorrect daemon administrator password",
            ...this.recordAuthAdministrationFailure(authAdministrationThrottleKey),
          };
        }
        this.recordAuthAdministrationSuccess(authAdministrationThrottleKey);
        const revoked = this.authorizedClientStore.revoke(input.clientId);
        if (!revoked) {
          return {
            ok: false as const,
            code: "not_found" as const,
            error: "Authorized client not found",
          };
        }
        await this.disconnectAuthorizedClient(revoked.id, "Authorized client revoked");
        return { ok: true as const, revokedClientId: revoked.id };
      },
      changePassword: async (input: { currentPassword?: string; newPassword: string }) => {
        if (!authAdminAllowed) {
          return {
            ok: false as const,
            code: "transport_not_allowed" as const,
            error:
              "Auth administration requires relay E2EE, localhost, IPC, or trusted TLS direct transport",
          };
        }
        if (this.authPasswordHash) {
          const rateLimitFailure = this.createAuthAdministrationRateLimitFailure(
            authAdministrationThrottleKey,
          );
          if (rateLimitFailure) {
            return rateLimitFailure;
          }
          if (!(await this.isAdminPasswordValid(input.currentPassword))) {
            return {
              ok: false as const,
              code: "incorrect_password" as const,
              error: "Incorrect daemon administrator password",
              ...this.recordAuthAdministrationFailure(authAdministrationThrottleKey),
            };
          }
          this.recordAuthAdministrationSuccess(authAdministrationThrottleKey);
        }
        const nextPasswordHash = hashDaemonPassword(input.newPassword);
        const persisted = loadPersistedConfig(this.paseoHome);
        savePersistedConfig(this.paseoHome, {
          ...persisted,
          daemon: {
            ...persisted.daemon,
            auth: {
              ...persisted.daemon?.auth,
              password: nextPasswordHash,
            },
          },
        });
        this.authPasswordHash = nextPasswordHash;
        const revoked = this.authorizedClientStore.revokeAll();
        await this.disconnectAllAuthorizedClients("Daemon administrator password changed");
        return { ok: true as const, revokedClientCount: revoked.length };
      },
    };
  }

  private async disconnectAuthorizedClient(clientId: string, reason: string): Promise<void> {
    const connections = [...new Set(this.externalSessionsByKey.values())].filter(
      (connection) => connection.authorizedClientId === clientId,
    );
    await Promise.all(
      connections.map((connection) => this.disconnectConnection(connection, reason)),
    );
  }

  private async disconnectAllAuthorizedClients(reason: string): Promise<void> {
    const connections = [...new Set(this.externalSessionsByKey.values())].filter(
      (connection) => connection.authorizedClientId !== null,
    );
    await Promise.all(
      connections.map((connection) => this.disconnectConnection(connection, reason)),
    );
  }

  private async disconnectConnection(connection: SessionConnection, reason: string): Promise<void> {
    const sockets = [...connection.sockets];
    for (const socket of sockets) {
      try {
        socket.close(WS_CLOSE_DAEMON_AUTH_FAILED, reason);
      } catch {
        // Ignore close errors; cleanup below removes the session either way.
      }
    }
    await this.cleanupConnection(connection, reason);
  }

  private buildServerInfoStatusPayload(): ServerInfoStatusPayload {
    return {
      status: "server_info",
      serverId: this.serverId,
      hostname: getHostname(),
      version: this.daemonVersion,
      ...(this.serverCapabilities ? { capabilities: this.serverCapabilities } : {}),
      features: {
        // COMPAT(providersSnapshot): keep optional until all clients rely on snapshot flow.
        providersSnapshot: true,
        // COMPAT(checkoutGithubSetAutoMerge): added in v0.1.75, remove gate after 2026-11-13.
        checkoutGithubSetAutoMerge: true,
        // COMPAT(daemonStatusRpc): added in v0.1.76, remove gate after 2026-11-18.
        daemonStatusRpc: true,
        // COMPAT(terminalRestoreModes): added in v0.1.81, remove gate after 2026-11-23.
        "terminal-restore-modes": true,
        // COMPAT(rewind): added in v0.1.82, remove gate after 2026-11-26.
        rewind: true,
        // COMPAT(checkoutRefresh): added in v0.1.86, remove gate after 2026-11-29.
        checkoutRefresh: true,
        // COMPAT(daemonClientAuthorization): added in v0.1.87, remove gate after 2026-12-04.
        daemonClientAuthorization: true,
        // COMPAT(titleGenerationSettings): added in v0.1.90, remove gate after 2026-12-05.
        titleGenerationSettings: true,
        // COMPAT(metadataGenerationSettings): added in v0.1.92, remove gate after 2026-12-06.
        metadataGenerationSettings: true,
        // COMPAT(providerRemovalSettings): added in v0.1.93, remove gate after 2026-12-07.
        providerRemovalSettings: true,
        // COMPAT(checkoutMetadataDrafts): added in v0.1.92, remove gate after 2026-12-06.
        checkoutMetadataDrafts: true,
      },
    };
  }

  private createServerInfoMessage(): WSOutboundMessage {
    return {
      type: "session",
      message: {
        type: "status",
        payload: this.buildServerInfoStatusPayload(),
      },
    };
  }

  private createDaemonConfigChangedMessage(config: MutableDaemonConfig): WSOutboundMessage {
    return wrapSessionMessage({
      type: "status",
      payload: {
        status: "daemon_config_changed",
        config,
      },
    });
  }

  private broadcastCapabilitiesUpdate(): void {
    this.broadcast(this.createServerInfoMessage());
  }

  private broadcastDaemonConfigChanged(config: MutableDaemonConfig): void {
    this.broadcast(this.createDaemonConfigChangedMessage(config));
  }

  private bindSocketHandlers(ws: WebSocketLike): void {
    ws.on("message", (...args: unknown[]) => {
      const data = args[0] as Buffer | ArrayBuffer | Buffer[] | string;
      void this.handleRawMessage(ws, data);
    });

    ws.on("close", async (...args: unknown[]) => {
      const code = args[0];
      const reason = args[1];
      await this.detachSocket(ws, {
        code: typeof code === "number" ? code : undefined,
        reason,
      });
    });

    ws.on("error", async (...args: unknown[]) => {
      const error = args[0];
      const err = error instanceof Error ? error : new Error(String(error));
      const active = this.sessions.get(ws);
      const pending = this.pendingConnections.get(ws);
      const log = active?.connectionLogger ?? pending?.connectionLogger ?? this.logger;
      log.error({ err }, "Client error");
      await this.detachSocket(ws, { error: err });
    });
  }

  public resolveVoiceSpeakHandler(callerAgentId: string): VoiceSpeakHandler | null {
    return this.voiceSpeakHandlers.get(callerAgentId) ?? null;
  }

  public resolveVoiceCallerContext(callerAgentId: string): VoiceCallerContext | null {
    return this.voiceCallerContexts.get(callerAgentId) ?? null;
  }

  private async detachSocket(
    ws: WebSocketLike,
    details: {
      code?: number;
      reason?: unknown;
      error?: Error;
    },
  ): Promise<void> {
    const pending = this.clearPendingConnection(ws);
    if (pending) {
      this.incrementRuntimeCounter("pendingDisconnected");
      pending.connectionLogger.trace(
        {
          code: details.code,
          reason: stringifyCloseReason(details.reason),
        },
        "Pending client disconnected",
      );
      return;
    }

    const connection = this.sessions.get(ws);
    if (!connection) {
      return;
    }

    this.sessions.delete(ws);
    connection.sockets.delete(ws);

    if (connection.sockets.size === 0) {
      this.incrementRuntimeCounter("sessionDisconnectedWaitingReconnect");
      if (connection.externalDisconnectCleanupTimeout) {
        clearTimeout(connection.externalDisconnectCleanupTimeout);
      }
      const timeout = setTimeout(() => {
        if (connection.externalDisconnectCleanupTimeout !== timeout) {
          return;
        }
        connection.externalDisconnectCleanupTimeout = null;
        void this.cleanupConnection(connection, "Client disconnected (grace timeout)");
      }, EXTERNAL_SESSION_DISCONNECT_GRACE_MS);
      connection.externalDisconnectCleanupTimeout = timeout;

      connection.connectionLogger.trace(
        {
          clientId: connection.clientId,
          code: details.code,
          reason: stringifyCloseReason(details.reason),
          reconnectGraceMs: EXTERNAL_SESSION_DISCONNECT_GRACE_MS,
        },
        "Client disconnected; waiting for reconnect",
      );
      return;
    }

    if (connection.sockets.size > 0) {
      this.incrementRuntimeCounter("sessionSocketDisconnectedAttached");
      connection.connectionLogger.trace(
        {
          clientId: connection.clientId,
          remainingSockets: connection.sockets.size,
          code: details.code,
          reason: stringifyCloseReason(details.reason),
        },
        "Client socket disconnected; session remains attached",
      );
      return;
    }

    await this.cleanupConnection(connection, "Client disconnected");
  }

  private async cleanupConnection(
    connection: SessionConnection,
    logMessage: string,
  ): Promise<void> {
    this.incrementRuntimeCounter("sessionCleanup");
    if (connection.externalDisconnectCleanupTimeout) {
      clearTimeout(connection.externalDisconnectCleanupTimeout);
      connection.externalDisconnectCleanupTimeout = null;
    }

    for (const socket of connection.sockets) {
      this.sessions.delete(socket);
    }
    connection.sockets.clear();
    const existing = this.externalSessionsByKey.get(connection.sessionKey);
    if (existing === connection) {
      this.externalSessionsByKey.delete(connection.sessionKey);
    }

    connection.connectionLogger.trace(
      { clientId: connection.clientId, totalSessions: this.sessions.size },
      logMessage,
    );
    await connection.session.cleanup();
  }

  private handleInvalidInboundMessage(args: {
    ws: WebSocketLike;
    parsed: unknown;
    parsedMessage: { success: false; error: { message: string } } & Record<string, unknown>;
    pendingConnection: PendingConnection | undefined;
    activeConnection: SessionConnection | undefined;
    log: pino.Logger;
  }): void {
    const { ws, parsed, parsedMessage, pendingConnection, activeConnection, log } = args;
    this.incrementRuntimeCounter("validationFailed");
    if (pendingConnection) {
      pendingConnection.connectionLogger.warn(
        { error: parsedMessage.error.message },
        "Rejected pending message before hello",
      );
      this.clearPendingConnection(ws);
      try {
        ws.close(WS_CLOSE_INVALID_HELLO, "Invalid hello");
      } catch {
        // ignore close errors
      }
      return;
    }

    const requestInfo = extractRequestInfoFromUnknownWsInbound(parsed);
    const isUnknownSchema =
      requestInfo?.requestId != null &&
      typeof parsed === "object" &&
      parsed != null &&
      "type" in parsed &&
      (parsed as { type?: unknown }).type === "session";

    log.warn(
      {
        clientId: activeConnection?.clientId,
        requestId: requestInfo?.requestId,
        requestType: requestInfo?.requestType,
        error: parsedMessage.error.message,
      },
      "WS inbound message validation failed",
    );

    if (requestInfo) {
      this.sendToClient(
        ws,
        wrapSessionMessage({
          type: "rpc_error",
          payload: {
            requestId: requestInfo.requestId,
            requestType: requestInfo.requestType,
            error: isUnknownSchema
              ? `Unknown request, try upgrading the daemon (currently v${this.daemonVersion})`
              : "Invalid message",
            code: isUnknownSchema ? "unknown_schema" : "invalid_message",
          },
        }),
      );
      return;
    }

    const errorMessage = `Invalid message: ${parsedMessage.error.message}`;
    this.sendToClient(
      ws,
      wrapSessionMessage({
        type: "status",
        payload: {
          status: "error",
          message: errorMessage,
        },
      }),
    );
  }

  private maybeHandleBinaryFrame(params: {
    ws: WebSocketLike;
    buffer: Buffer;
    activeConnection: SessionConnection | undefined;
    log: pino.Logger;
  }): boolean {
    const { ws, buffer, activeConnection, log } = params;
    const asBytes = asUint8Array(buffer);
    if (!asBytes) {
      return false;
    }
    const frame = decodeTerminalStreamFrame(asBytes);
    if (!frame) {
      return false;
    }
    if (!activeConnection) {
      this.incrementRuntimeCounter("binaryBeforeHelloRejected");
      log.warn("Rejected binary frame before hello");
      this.clearPendingConnection(ws);
      try {
        ws.close(WS_CLOSE_INVALID_HELLO, "Session message before hello");
      } catch {
        // ignore close errors
      }
      return true;
    }
    activeConnection.session.handleBinaryFrame(frame);
    return true;
  }

  private async handlePendingConnectionMessage(params: {
    ws: WebSocketLike;
    message: WSInboundMessage;
    pendingConnection: PendingConnection;
  }): Promise<void> {
    const { ws, message, pendingConnection } = params;
    if (message.type === "hello") {
      this.handleHello({
        ws,
        message,
        pending: pendingConnection,
      });
      return;
    }

    if (message.type === "session" && pendingConnection.hello) {
      const handled = await this.handlePreAuthSessionMessage({
        ws,
        pending: pendingConnection,
        message: message.message,
      });
      if (handled) {
        return;
      }
    }

    pendingConnection.connectionLogger.warn(
      {
        messageType: message.type,
      },
      "Rejected pending message before hello",
    );
    this.incrementRuntimeCounter("pendingMessageRejectedBeforeHello");
    this.clearPendingConnection(ws);
    try {
      ws.close(WS_CLOSE_INVALID_HELLO, "Session message before hello");
    } catch {
      // ignore close errors
    }
  }

  private async handleRawMessage(
    ws: WebSocketLike,
    data: Buffer | ArrayBuffer | Buffer[] | string,
  ): Promise<void> {
    const activeConnection = this.sessions.get(ws);
    const pendingConnection = this.pendingConnections.get(ws);
    const log =
      activeConnection?.connectionLogger ?? pendingConnection?.connectionLogger ?? this.logger;

    try {
      const buffer = bufferFromWsData(data);
      const binaryHandled = this.maybeHandleBinaryFrame({
        ws,
        buffer,
        activeConnection,
        log,
      });
      if (binaryHandled) {
        return;
      }

      const parsed = JSON.parse(buffer.toString());
      const parsedMessage = WSInboundMessageSchema.safeParse(parsed);
      if (!parsedMessage.success) {
        this.handleInvalidInboundMessage({
          ws,
          parsed,
          parsedMessage,
          pendingConnection,
          activeConnection,
          log,
        });
        return;
      }

      const message = parsedMessage.data;
      this.recordInboundMessageType(message.type);

      if (message.type === "ping") {
        this.sendToClient(ws, { type: "pong" });
        return;
      }

      if (message.type === "recording_state") {
        return;
      }

      if (pendingConnection) {
        await this.handlePendingConnectionMessage({
          ws,
          message,
          pendingConnection,
        });
        return;
      }

      if (!activeConnection) {
        this.incrementRuntimeCounter("missingConnectionForMessage");
        this.logger.error("No connection found for websocket");
        return;
      }

      if (message.type === "hello") {
        this.incrementRuntimeCounter("unexpectedHelloOnActiveConnection");
        activeConnection.connectionLogger.warn("Received hello on active connection");
        try {
          ws.close(WS_CLOSE_INVALID_HELLO, "Unexpected hello");
        } catch {
          // ignore close errors
        }
        return;
      }

      if (message.type === "session") {
        await this.dispatchSessionMessage(activeConnection, message);
      }
    } catch (error) {
      this.handleRawMessageError({ ws, data, error, log });
    }
  }

  private async dispatchSessionMessage(
    activeConnection: SessionConnection,
    message: Extract<WSInboundMessage, { type: "session" }>,
  ): Promise<void> {
    this.recordInboundSessionRequestType(message.message.type);
    const startMs = performance.now();
    await activeConnection.session.handleMessage(message.message);
    const durationMs = performance.now() - startMs;
    this.recordRequestLatency(message.message.type, durationMs);

    if (durationMs >= SLOW_REQUEST_THRESHOLD_MS) {
      activeConnection.connectionLogger.warn(
        {
          requestType: message.message.type,
          durationMs: Math.round(durationMs),
          inflightRequests: activeConnection.session.getRuntimeMetrics().inflightRequests,
        },
        "ws_slow_request",
      );
    }
  }

  private handleRawMessageError(params: {
    ws: WebSocketLike;
    data: Buffer | ArrayBuffer | Buffer[] | string;
    error: unknown;
    log: pino.Logger;
  }): void {
    const { ws, data, error, log } = params;
    const err = error instanceof Error ? error : new Error(String(error));
    const { rawPayload, parsedPayload } = this.decodeRawMessagePayloadForError(data);

    const trimmedRawPayload =
      typeof rawPayload === "string" && rawPayload.length > 2000
        ? `${rawPayload.slice(0, 2000)}... (truncated)`
        : rawPayload;

    log.error(
      {
        err,
        rawPayload: trimmedRawPayload,
        parsedPayload,
      },
      "Failed to parse/handle message",
    );

    if (this.pendingConnections.has(ws)) {
      this.clearPendingConnection(ws);
      try {
        ws.close(WS_CLOSE_INVALID_HELLO, "Invalid hello");
      } catch {
        // ignore close errors
      }
      return;
    }

    const requestInfo = extractRequestInfoFromUnknownWsInbound(parsedPayload);
    if (requestInfo) {
      this.sendToClient(
        ws,
        wrapSessionMessage({
          type: "rpc_error",
          payload: {
            requestId: requestInfo.requestId,
            requestType: requestInfo.requestType,
            error: "Invalid message",
            code: "invalid_message",
          },
        }),
      );
      return;
    }

    this.sendToClient(
      ws,
      wrapSessionMessage({
        type: "status",
        payload: {
          status: "error",
          message: `Invalid message: ${err.message}`,
        },
      }),
    );
  }

  private decodeRawMessagePayloadForError(data: Buffer | ArrayBuffer | Buffer[] | string): {
    rawPayload: string | null;
    parsedPayload: unknown;
  } {
    let rawPayload: string | null = null;
    let parsedPayload: unknown = null;
    try {
      const buffer = bufferFromWsData(data);
      rawPayload = buffer.toString();
      parsedPayload = JSON.parse(rawPayload);
    } catch (payloadError) {
      rawPayload = rawPayload ?? "<unreadable>";
      parsedPayload = parsedPayload ?? rawPayload;
      const payloadErr =
        payloadError instanceof Error ? payloadError : new Error(String(payloadError));
      this.logger.error({ err: payloadErr }, "Failed to decode raw payload");
    }
    return { rawPayload, parsedPayload };
  }

  private incrementRuntimeCounter(counter: keyof WebSocketRuntimeCounters): void {
    this.runtimeMetrics.incrementCounter(counter);
  }

  private recordInboundMessageType(type: string): void {
    this.runtimeMetrics.recordInboundMessage(type);
  }

  private recordInboundSessionRequestType(type: string): void {
    this.runtimeMetrics.recordInboundSessionRequest(type);
  }

  private recordRequestLatency(type: string, durationMs: number): void {
    this.runtimeMetrics.recordRequestLatency(type, durationMs);
  }

  private collectSessionRuntimeMetrics(): WebSocketRuntimeMetrics {
    const uniqueConnections = new Set<SessionConnection>(this.externalSessionsByKey.values());
    let terminalDirectorySubscriptionCount = 0;
    let terminalSubscriptionCount = 0;
    let inflightRequests = 0;
    let peakInflightRequests = 0;

    for (const connection of uniqueConnections) {
      const sessionMetrics = connection.session.getRuntimeMetrics();
      terminalDirectorySubscriptionCount += sessionMetrics.terminalDirectorySubscriptionCount;
      terminalSubscriptionCount += sessionMetrics.terminalSubscriptionCount;
      inflightRequests += sessionMetrics.inflightRequests;
      peakInflightRequests = Math.max(peakInflightRequests, sessionMetrics.peakInflightRequests);
      connection.session.resetPeakInflight();
    }

    return {
      ...this.checkoutDiffManager.getMetrics(),
      terminalDirectorySubscriptionCount,
      terminalSubscriptionCount,
      inflightRequests,
      peakInflightRequests,
    };
  }

  private flushRuntimeMetrics(options?: { final?: boolean }): void {
    const runtimeMetrics = this.runtimeMetrics.snapshotAndReset();
    const activeConnections = new Set<SessionConnection>(this.sessions.values()).size;
    const activeSockets = this.sessions.size;
    const pendingConnections = this.pendingConnections.size;
    const reconnectGraceSessions = [...this.externalSessionsByKey.values()].filter(
      (connection) =>
        connection.sockets.size === 0 && connection.externalDisconnectCleanupTimeout !== null,
    ).length;
    const sessionMetrics = this.collectSessionRuntimeMetrics();
    const agentSnapshot = this.agentManager.getMetricsSnapshot();

    this.logger.info(
      {
        windowMs: runtimeMetrics.windowMs,
        final: Boolean(options?.final),
        sessions: {
          activeConnections,
          externalSessionKeys: this.externalSessionsByKey.size,
          reconnectGraceSessions,
        },
        sockets: {
          activeSockets,
          pendingConnections,
        },
        counters: runtimeMetrics.counters,
        inboundMessageTypesTop: runtimeMetrics.inboundMessageTypesTop,
        inboundSessionRequestTypesTop: runtimeMetrics.inboundSessionRequestTypesTop,
        outboundMessageTypesTop: runtimeMetrics.outboundMessageTypesTop,
        outboundSessionMessageTypesTop: runtimeMetrics.outboundSessionMessageTypesTop,
        outboundAgentStreamTypesTop: runtimeMetrics.outboundAgentStreamTypesTop,
        outboundAgentStreamAgentsTop: runtimeMetrics.outboundAgentStreamAgentsTop,
        outboundBinaryFrameTypesTop: runtimeMetrics.outboundBinaryFrameTypesTop,
        bufferedAmount: runtimeMetrics.bufferedAmount,
        runtime: sessionMetrics,
        latency: runtimeMetrics.latency,
        agents: agentSnapshot,
      },
      "ws_runtime_metrics",
    );
  }

  private getClientActivityState(session: Session): ClientPresenceState {
    const activity = session.getClientActivity();
    if (!activity) {
      return {
        appVisible: false,
        focusedAgentId: null,
        lastActivityAtMs: null,
      };
    }

    return {
      appVisible: activity.appVisible,
      focusedAgentId: activity.focusedAgentId,
      lastActivityAtMs: activity.lastActivityAt.getTime(),
    };
  }

  private async broadcastAgentAttention(params: {
    agentId: string;
    provider: AgentProvider;
    reason: "finished" | "error" | "permission";
  }): Promise<void> {
    const clientEntries: Array<{
      ws: WebSocketLike;
      state: ClientPresenceState;
    }> = [];

    for (const [ws, connection] of this.sessions) {
      clientEntries.push({
        ws,
        state: this.getClientActivityState(connection.session),
      });
    }

    const allStates = clientEntries.map((e) => e.state);
    const nowMs = Date.now();
    const agent = this.agentManager.getAgent(params.agentId);
    const assistantMessage = await this.agentManager.getLastAssistantMessage(params.agentId);
    const notification = buildAgentAttentionNotificationPayload({
      reason: params.reason,
      serverId: this.serverId,
      agentId: params.agentId,
      assistantMessage,
      permissionRequest: agent ? findLatestPermissionRequest(agent.pendingPermissions) : null,
    });

    const plan = computeNotificationPlan({
      allStates,
      agentId: params.agentId,
      reason: params.reason,
      nowMs,
    });

    if (plan.shouldPush) {
      void this.pushNotificationSender.send(notification).catch((err) => {
        this.logger.warn({ err, agentId: params.agentId }, "Failed to send push notification");
      });
    }

    for (const [clientIndex, { ws }] of clientEntries.entries()) {
      const shouldNotify = clientIndex === plan.inAppRecipientIndex;
      const timestamp = new Date().toISOString();
      const message = wrapSessionMessage({
        type: "agent_stream",
        payload: {
          agentId: params.agentId,
          event: {
            type: "attention_required",
            provider: params.provider,
            reason: params.reason,
            timestamp,
            shouldNotify,
            notification,
          },
          timestamp,
        },
      });

      this.sendToClient(ws, message);
    }
  }
}

interface SocketRequestMetadata {
  host?: string;
  origin?: string;
  userAgent?: string;
  remoteAddress?: string;
}

function extractSocketRequestMetadata(request: unknown): SocketRequestMetadata {
  if (!request || typeof request !== "object") {
    return {};
  }

  const record = request as {
    headers?: {
      host?: unknown;
      origin?: unknown;
      "user-agent"?: unknown;
    };
    url?: unknown;
    socket?: {
      remoteAddress?: unknown;
    };
  };

  const host = typeof record.headers?.host === "string" ? record.headers.host : undefined;
  const origin = typeof record.headers?.origin === "string" ? record.headers.origin : undefined;
  const userAgent =
    typeof record.headers?.["user-agent"] === "string" ? record.headers["user-agent"] : undefined;
  const remoteAddress =
    typeof record.socket?.remoteAddress === "string" ? record.socket.remoteAddress : undefined;

  return {
    ...(host ? { host } : {}),
    ...(origin ? { origin } : {}),
    ...(userAgent ? { userAgent } : {}),
    ...(remoteAddress ? { remoteAddress } : {}),
  };
}

function buildSessionKey(clientId: string, authorizedClient: AuthorizedClient | null): string {
  return authorizedClient ? `${clientId}:auth:${authorizedClient.id}` : `${clientId}:local`;
}

function isLocalSocketRequest(metadata: SocketRequestMetadata): boolean {
  const remoteAddress = metadata.remoteAddress;
  if (!remoteAddress) {
    return true;
  }
  return (
    remoteAddress === "::1" ||
    remoteAddress.startsWith("127.") ||
    remoteAddress.startsWith("::ffff:127.")
  );
}

function isTlsSocketRequest(request: unknown): boolean {
  if (!request || typeof request !== "object") {
    return false;
  }
  const socket = (request as { socket?: unknown }).socket;
  return Boolean(
    socket && typeof socket === "object" && (socket as { encrypted?: unknown }).encrypted === true,
  );
}

function selectWebSocketProtocol(
  protocols: Set<string>,
  password: string | undefined,
): string | false {
  if (!password) {
    return false;
  }
  return extractWsBearerProtocol([...protocols].join(",")) ?? false;
}

function extractLegacyWsBearerProtocolFromRequest(request: unknown): string | null {
  if (!request || typeof request !== "object") {
    return null;
  }
  const headers = (request as { headers?: { "sec-websocket-protocol"?: unknown } }).headers;
  const rawProtocol = headers?.["sec-websocket-protocol"];
  return extractWsBearerProtocol(typeof rawProtocol === "string" ? rawProtocol : undefined);
}

function stringifyCloseReason(reason: unknown): string | null {
  if (typeof reason === "string") {
    return reason.length > 0 ? reason : null;
  }
  if (Buffer.isBuffer(reason)) {
    const text = reason.toString();
    return text.length > 0 ? text : null;
  }
  if (reason == null) {
    return null;
  }
  const text = String(reason);
  return text.length > 0 ? text : null;
}

function extractRequestInfoFromUnknownWsInbound(
  payload: unknown,
): { requestId: string; requestType?: string } | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as {
    type?: unknown;
    requestId?: unknown;
    message?: unknown;
  };

  // Session-wrapped messages
  if (record.type === "session" && record.message && typeof record.message === "object") {
    const msg = record.message as { requestId?: unknown; type?: unknown };
    if (typeof msg.requestId === "string") {
      return {
        requestId: msg.requestId,
        ...(typeof msg.type === "string" ? { requestType: msg.type } : {}),
      };
    }
  }

  // Non-session messages (future-proof)
  if (typeof record.requestId === "string") {
    return {
      requestId: record.requestId,
      ...(typeof record.type === "string" ? { requestType: record.type } : {}),
    };
  }

  return null;
}
