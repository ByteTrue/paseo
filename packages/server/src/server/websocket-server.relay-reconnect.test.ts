import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Server as HTTPServer } from "http";
import type pino from "pino";
import type { AgentManager } from "./agent/agent-manager.js";
import type { AgentStorage } from "./agent/agent-storage.js";
import type { DownloadTokenStore } from "./file-download/token-store.js";
import type { DaemonConfigStore } from "./daemon-config-store.js";
import type { FileBackedChatService } from "./chat/chat-service.js";
import type { LoopService } from "./loop-service.js";
import type { ScheduleService } from "./schedule/service.js";
import type { CheckoutDiffManager } from "./checkout-diff-manager.js";
import { asInternals, createStub } from "./test-utils/class-mocks.js";
import { createProviderSnapshotManagerStub } from "./test-utils/session-stubs.js";
import {
  asUint8Array,
  decodeTerminalStreamFrame,
  encodeTerminalStreamFrame,
  TerminalStreamOpcode,
} from "@bytetrue/protocol/terminal-stream-protocol";
import { CLIENT_CAPS } from "@bytetrue/protocol/client-capabilities";
import { generateDaemonAuthKeyPair, signDaemonAuthChallenge } from "@bytetrue/protocol/daemon-auth";

type SocketListener = (...args: unknown[]) => void;

const wsModuleMock = vi.hoisted(() => {
  class MockWebSocketServer {
    static instances: MockWebSocketServer[] = [];
    readonly handlers = new Map<string, (...args: unknown[]) => void>();

    constructor(_options: unknown) {
      MockWebSocketServer.instances.push(this);
    }

    on(event: string, handler: (...args: unknown[]) => void) {
      this.handlers.set(event, handler);
      return this;
    }

    close() {
      // no-op
    }
  }

  return { MockWebSocketServer };
});

const sessionMock = vi.hoisted(() => {
  const instances: MockSession[] = [];

  class MockSession {
    cleanup = vi.fn(async () => {});
    handleMessage = vi.fn(async () => {});
    handleBinaryFrame = vi.fn((_frame: unknown) => {});
    supports = vi.fn((capability: string) => {
      const capabilities = this.args.clientCapabilities as Record<string, boolean> | undefined;
      return capabilities?.[capability] === true;
    });
    getClientActivity = vi.fn(() => null);
    resetPeakInflight = vi.fn(() => {});
    getRuntimeMetrics = vi.fn(() => ({
      checkoutDiffTargetCount: 0,
      checkoutDiffSubscriptionCount: 0,
      checkoutDiffWatcherCount: 0,
      checkoutDiffFallbackRefreshTargetCount: 0,
      terminalDirectorySubscriptionCount: 0,
      terminalSubscriptionCount: 0,
      inflightRequests: 0,
      peakInflightRequests: 0,
    }));
    readonly args: Record<string, unknown>;

    constructor(args: Record<string, unknown>) {
      this.args = args;
      instances.push(this);
    }
  }

  return { MockSession, instances };
});

vi.mock("ws", () => ({
  WebSocketServer: wsModuleMock.MockWebSocketServer,
}));

vi.mock("./session.js", () => ({
  Session: sessionMock.MockSession,
}));

vi.mock("./push/token-store.js", () => ({
  PushTokenStore: class {
    getAllTokens(): string[] {
      return [];
    }
  },
}));

vi.mock("./push/push-service.js", () => ({
  PushService: class {
    async sendPush(): Promise<void> {
      // no-op
    }
  },
}));

vi.mock("./auth.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./auth.js")>();
  return {
    ...actual,
    isBearerTokenValidAsync: vi.fn(async (input) => actual.isBearerTokenValidSync(input)),
  };
});

import { z } from "zod";
import { VoiceAssistantWebSocketServer } from "./websocket-server";
import { parseServerInfoStatusPayload } from "./messages.js";
import type { SpeechReadinessSnapshot } from "./speech/speech-runtime.js";

interface WebSocketServerInternals {
  attachSocket(ws: unknown, req: unknown): Promise<void>;
  socketMessageQueues: Map<unknown, Promise<void>>;
}

const TEST_DAEMON_VERSION = "1.2.3-test";
const CORRECT_PASSWORD = "correct-password";
const CORRECT_PASSWORD_HASH = "$2b$12$OLxyuuP9uLK30Uzc4wQX0O6liuU/Q1t5P2b0Ebf36mULvpVK3DRZW";

const WireEnvelopeSchema = z.object({
  type: z.string().optional(),
  message: z
    .object({
      type: z.string().optional(),
      payload: z.unknown().optional(),
    })
    .optional(),
});

const DaemonAuthChallengePayloadSchema = z.object({
  serverId: z.string(),
  challengeId: z.string(),
  challengeB64: z.string(),
});

const relayAuthKeys = new Map<string, ReturnType<typeof generateDaemonAuthKeyPair>>();

function getRelayAuthKey(clientId: string) {
  let keyPair = relayAuthKeys.get(clientId);
  if (!keyPair) {
    keyPair = generateDaemonAuthKeyPair();
    relayAuthKeys.set(clientId, keyPair);
  }
  return keyPair;
}

function parseSentEnvelope(data: unknown): z.infer<typeof WireEnvelopeSchema> {
  if (typeof data !== "string") throw new Error("Expected string frame");
  return WireEnvelopeSchema.parse(JSON.parse(data));
}

function getServerInfoEnvelopes(sent: unknown[]) {
  return sent
    .map(parseSentEnvelope)
    .filter((envelope) => envelope.message?.type === "status")
    .filter((envelope) => parseServerInfoStatusPayload(envelope.message?.payload) !== null);
}

const BinaryFrameSchema = z.object({
  kind: z.literal("terminal"),
  frame: z.object({
    opcode: z.number(),
    slot: z.number(),
    payload: z.instanceof(Uint8Array),
  }),
});

class MockSocket {
  readyState = 1;
  bufferedAmount = 0;
  sent: unknown[] = [];
  private listeners = new Map<string, SocketListener[]>();

  on(event: "message" | "close" | "error", listener: SocketListener): void {
    const handlers = this.listeners.get(event) ?? [];
    handlers.push(listener);
    this.listeners.set(event, handlers);
  }

  once(event: "close" | "error", listener: SocketListener): void {
    const wrapped: SocketListener = (...args) => {
      this.off(event, wrapped);
      listener(...args);
    };
    this.on(event, wrapped);
  }

  send(data: unknown): void {
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.readyState = 3;
    this.emit("close", code ?? 1000, reason ?? "");
  }

  emit(event: "message" | "close" | "error", ...args: unknown[]): void {
    const handlers = this.listeners.get(event) ?? [];
    for (const handler of handlers.slice()) {
      handler(...args);
    }
  }

  private off(event: "close" | "error", listener: SocketListener): void {
    const handlers = this.listeners.get(event) ?? [];
    this.listeners.set(
      event,
      handlers.filter((handler) => handler !== listener),
    );
  }
}

function createLogger() {
  const logger = {
    child: vi.fn(() => logger),
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  return logger;
}

function createServer(options?: { speechReadiness?: SpeechReadinessSnapshot | null }) {
  const speechReadiness = options?.speechReadiness ?? null;
  const daemonConfigStore = {
    onChange: vi.fn(() => () => {}),
    get: vi.fn(() => ({ displayName: "" })),
  };
  return new VoiceAssistantWebSocketServer(
    createStub<HTTPServer>({}),
    createStub<pino.Logger>(createLogger()),
    "srv_test",
    createStub<AgentManager>({
      setAgentAttentionCallback: vi.fn(),
      getAgent: vi.fn(() => null),
      getMetricsSnapshot: vi.fn(() => ({
        totalAgents: 0,
        idleAgents: 0,
        runningAgents: 0,
        pendingPermissionAgents: 0,
        erroredAgents: 0,
      })),
    }),
    createStub<AgentStorage>({}),
    createStub<DownloadTokenStore>({}),
    `/tmp/paseo-test-${Math.random().toString(16).slice(2)}`,
    createStub<DaemonConfigStore>(daemonConfigStore),
    null,
    { allowedOrigins: new Set() },
    undefined,
    { password: CORRECT_PASSWORD_HASH },
    speechReadiness
      ? {
          resolveStt: () => null,
          resolveSttLanguage: () => "en",
          resolveTts: () => null,
          resolveTurnDetection: () => null,
          resolveDictationStt: () => null,
          resolveDictationSttLanguage: () => "en",
          getReadiness: () => speechReadiness,
          onReadinessChange: vi.fn(() => () => {}),
          start: vi.fn(),
          stop: vi.fn(),
          ready: Promise.resolve(),
        }
      : undefined,
    undefined,
    undefined,
    TEST_DAEMON_VERSION,
    undefined,
    undefined,
    undefined,
    createStub<FileBackedChatService>({}),
    createStub<LoopService>({}),
    createStub<ScheduleService>({}),
    createStub<CheckoutDiffManager>({
      subscribe: vi.fn(),
      scheduleRefreshForCwd: vi.fn(),
      getMetrics: vi.fn(() => ({
        checkoutDiffTargetCount: 0,
        checkoutDiffSubscriptionCount: 0,
        checkoutDiffWatcherCount: 0,
        checkoutDiffFallbackRefreshTargetCount: 0,
      })),
      dispose: vi.fn(),
    }),
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    createProviderSnapshotManagerStub().manager,
  );
}

function createReadySpeechReadinessSnapshot(): SpeechReadinessSnapshot {
  return {
    generatedAt: "2026-02-14T00:00:00.000Z",
    requiredLocalModelIds: [],
    missingLocalModelIds: [],
    download: {
      inProgress: false,
      error: null,
    },
    dictation: {
      enabled: true,
      available: true,
      reasonCode: "ready",
      message: "Dictation is ready.",
      retryable: false,
      missingModelIds: [],
    },
    realtimeVoice: {
      enabled: true,
      available: true,
      reasonCode: "ready",
      message: "Realtime voice is ready.",
      retryable: false,
      missingModelIds: [],
    },
    voiceFeature: {
      enabled: true,
      available: true,
      reasonCode: "ready",
      message: "Voice features are ready.",
      retryable: false,
      missingModelIds: [],
    },
  };
}

function createDownloadInProgressSpeechReadinessSnapshot(): SpeechReadinessSnapshot {
  return {
    generatedAt: "2026-02-14T00:00:00.000Z",
    requiredLocalModelIds: ["parakeet-tdt-0.6b-v2-int8"],
    missingLocalModelIds: ["parakeet-tdt-0.6b-v2-int8"],
    download: {
      inProgress: true,
      error: null,
    },
    dictation: {
      enabled: true,
      available: false,
      reasonCode: "stt_unavailable",
      message: "Dictation is unavailable: speech-to-text service is not ready.",
      retryable: false,
      missingModelIds: [],
    },
    realtimeVoice: {
      enabled: true,
      available: false,
      reasonCode: "stt_unavailable",
      message: "Realtime voice is unavailable: speech-to-text service is not ready.",
      retryable: false,
      missingModelIds: [],
    },
    voiceFeature: {
      enabled: true,
      available: false,
      reasonCode: "model_download_in_progress",
      message:
        "Voice features are unavailable while models download in the background (parakeet-tdt-0.6b-v2-int8).",
      retryable: true,
      missingModelIds: ["parakeet-tdt-0.6b-v2-int8"],
    },
  };
}

function createHelloMessage(
  clientId: string,
  options?: { capabilities?: Record<string, boolean> },
) {
  return {
    type: "hello" as const,
    clientId,
    clientType: "cli" as const,
    protocolVersion: 1,
    ...(options?.capabilities ? { capabilities: options.capabilities } : {}),
  };
}

function createDirectRequest() {
  return {
    headers: {
      host: "localhost:6767",
      origin: "http://localhost:6767",
      "user-agent": "vitest",
    },
    socket: {
      remoteAddress: "127.0.0.1",
    },
    url: "/ws",
  };
}

async function attachRelayAndHello(params: {
  server: VoiceAssistantWebSocketServer;
  socket: MockSocket;
  clientId: string;
}) {
  await params.server.attachExternalSocket(params.socket, { transport: "relay" });
  params.socket.emit("message", JSON.stringify(createHelloMessage(params.clientId)));
  await waitForSocketMessages(params.server, params.socket);
  expect(params.socket.sent.length).toBeGreaterThan(0);
  const challengeEnvelope = parseSentEnvelope(params.socket.sent[0]);
  expect(challengeEnvelope.type).toBe("session");
  expect(challengeEnvelope.message?.type).toBe("daemon.auth.challenge.response");
  const challenge = DaemonAuthChallengePayloadSchema.parse(challengeEnvelope.message?.payload);
  const keyPair = getRelayAuthKey(params.clientId);
  const signatureB64 = signDaemonAuthChallenge({
    serverId: challenge.serverId,
    clientId: params.clientId,
    clientPublicKeyB64: keyPair.publicKeyB64,
    challengeId: challenge.challengeId,
    challengeB64: challenge.challengeB64,
    purpose: "enroll",
    secretKeyB64: keyPair.secretKeyB64,
  });
  params.socket.emit(
    "message",
    JSON.stringify({
      type: "session",
      message: {
        type: "daemon.auth.enroll.request",
        requestId: `enroll-${params.clientId}`,
        challengeId: challenge.challengeId,
        clientPublicKeyB64: keyPair.publicKeyB64,
        signatureB64,
        adminPassword: CORRECT_PASSWORD,
        clientName: "Vitest relay client",
      },
    }),
  );
  await waitForSocketMessages(params.server, params.socket);
  await vi.waitFor(() => {
    const hasServerInfo = params.socket.sent
      .map(parseSentEnvelope)
      .some((envelope) => envelope.message?.type === "status");
    expect(hasServerInfo).toBe(true);
  });
  const statusEnvelope = params.socket.sent
    .map(parseSentEnvelope)
    .find((envelope) => envelope.message?.type === "status");
  const serverInfo = parseServerInfoStatusPayload(statusEnvelope?.message?.payload);
  expect(serverInfo).not.toBeNull();
  return serverInfo!;
}

async function attachDirectAndHello(params: {
  server: VoiceAssistantWebSocketServer;
  socket: MockSocket;
  clientId: string;
}) {
  await asInternals<WebSocketServerInternals>(params.server).attachSocket(
    params.socket,
    createDirectRequest(),
  );
  params.socket.emit("message", JSON.stringify(createHelloMessage(params.clientId)));
  await waitForSocketMessages(params.server, params.socket);
  expect(params.socket.sent.length).toBeGreaterThan(0);
  const envelope = parseSentEnvelope(params.socket.sent[0]);
  expect(envelope.type).toBe("session");
  const serverInfo = parseServerInfoStatusPayload(envelope.message?.payload);
  expect(envelope.message?.type).toBe("status");
  expect(serverInfo).not.toBeNull();
  return serverInfo!;
}

interface TestAuthAdministration {
  listClients(): {
    clients: Array<{ id: string; publicKeyB64: string }>;
    passwordConfigured: boolean;
  };
  revokeClient(input: { clientId: string; adminPassword: string }): Promise<{
    ok: boolean;
    code?: string;
    retryAfterMs?: number;
  }>;
  changePassword(input: {
    currentPassword?: string | null;
    newPassword: string;
  }): Promise<{ ok: boolean; code?: string; retryAfterMs?: number; revokedClientCount?: number }>;
}

function getAuthAdministration(session: InstanceType<typeof sessionMock.MockSession>) {
  return session.args.authAdministration as TestAuthAdministration;
}

async function waitForSocketMessages(
  server: VoiceAssistantWebSocketServer,
  socket: MockSocket,
): Promise<void> {
  await asInternals<WebSocketServerInternals>(server).socketMessageQueues.get(socket);
}

describe("relay external socket reconnect behavior", () => {
  beforeEach(() => {
    sessionMock.instances.length = 0;
    relayAuthKeys.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("keeps the same session when relay reconnects within grace window", async () => {
    const server = createServer();
    const clientId = "cid-relay-reconnect";

    const socket1 = new MockSocket();
    await attachRelayAndHello({
      server,
      socket: socket1,
      clientId,
    });
    expect(sessionMock.instances).toHaveLength(1);
    const session = sessionMock.instances[0];

    socket1.emit("close", 1006, "");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(session.cleanup).not.toHaveBeenCalled();

    const socket2 = new MockSocket();
    await attachRelayAndHello({
      server,
      socket: socket2,
      clientId,
    });
    expect(sessionMock.instances).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(20_000);
    expect(session.cleanup).not.toHaveBeenCalled();

    await server.close();
  });

  test("passes hello capabilities through to the created session", async () => {
    const server = createServer();
    const socket = new MockSocket();

    await asInternals<WebSocketServerInternals>(server).attachSocket(socket, createDirectRequest());
    socket.emit(
      "message",
      JSON.stringify(
        createHelloMessage("client-capabilities", {
          capabilities: { [CLIENT_CAPS.reasoningMergeEnum]: true },
        }),
      ),
    );
    await waitForSocketMessages(server, socket);

    expect(sessionMock.instances).toHaveLength(1);
    const session = sessionMock.instances[0];
    expect(session.args.clientCapabilities).toEqual({
      [CLIENT_CAPS.reasoningMergeEnum]: true,
    });

    await server.close();
  });

  test("closes pending connection when hello timeout elapses", async () => {
    const server = createServer();

    const socket = new MockSocket();
    let closeCode: number | null = null;
    let closeReason = "";
    socket.on("close", (code: unknown, reason: unknown) => {
      closeCode = typeof code === "number" ? code : null;
      closeReason = typeof reason === "string" ? reason : "";
    });

    await asInternals<WebSocketServerInternals>(server).attachSocket(socket, createDirectRequest());
    await vi.advanceTimersByTimeAsync(15_000);

    expect(closeCode).toBe(4001);
    expect(closeReason).toBe("Hello timeout");
    expect(sessionMock.instances).toHaveLength(0);

    await server.close();
  });

  test("returns server_info when clientId reconnects with existing session", async () => {
    const server = createServer();
    const clientId = "cid-resume-flag";

    const firstSocket = new MockSocket();
    await attachRelayAndHello({
      server,
      socket: firstSocket,
      clientId,
    });

    firstSocket.emit("close", 1006, "");
    await vi.advanceTimersByTimeAsync(1_000);

    const secondSocket = new MockSocket();
    await attachRelayAndHello({
      server,
      socket: secondSocket,
      clientId,
    });

    await server.close();
  });

  test("returns server_info for distinct clientIds", async () => {
    const server = createServer();

    const firstSocket = new MockSocket();
    await attachRelayAndHello({
      server,
      socket: firstSocket,
      clientId: "cid-new-1",
    });

    const secondSocket = new MockSocket();
    await attachRelayAndHello({
      server,
      socket: secondSocket,
      clientId: "cid-new-2",
    });
    expect(sessionMock.instances).toHaveLength(2);

    await server.close();
  });

  test("rejects session messages before hello", async () => {
    const server = createServer();
    const socket = new MockSocket();
    let closeCode: number | null = null;
    let closeReason = "";
    socket.on("close", (code: unknown, reason: unknown) => {
      closeCode = typeof code === "number" ? code : null;
      closeReason = typeof reason === "string" ? reason : "";
    });

    await server.attachExternalSocket(socket, { transport: "relay" });
    socket.emit(
      "message",
      JSON.stringify({
        type: "session",
        message: {
          type: "ping",
        },
      }),
    );
    await waitForSocketMessages(server, socket);

    expect(closeCode).toBe(4002);
    expect(["Invalid hello", "Session message before hello"]).toContain(closeReason);
    expect(sessionMock.instances).toHaveLength(0);

    await server.close();
  });

  test("allows local OS integration RPCs from direct localhost sockets", async () => {
    const server = createServer();
    const socket = new MockSocket();
    await attachDirectAndHello({
      server,
      socket,
      clientId: "cid-local-os-direct",
    });
    const session = sessionMock.instances.at(-1);
    expect(session).toBeDefined();

    const request = {
      type: "local.os.list_open_targets.request",
      requestId: "local-os-direct-1",
    };
    socket.emit("message", JSON.stringify({ type: "session", message: request }));
    await waitForSocketMessages(server, socket);

    await vi.waitFor(() => {
      expect(session?.handleMessage).toHaveBeenCalledWith(request);
    });

    await server.close();
  });

  test("rejects local OS integration RPCs from relay sockets", async () => {
    const server = createServer();
    const socket = new MockSocket();
    await attachRelayAndHello({
      server,
      socket,
      clientId: "cid-local-os-relay",
    });
    const session = sessionMock.instances.at(-1);
    expect(session).toBeDefined();
    const callCount = session?.handleMessage.mock.calls.length ?? 0;

    socket.emit(
      "message",
      JSON.stringify({
        type: "session",
        message: {
          type: "local.os.list_open_targets.request",
          requestId: "local-os-relay-1",
        },
      }),
    );
    await waitForSocketMessages(server, socket);

    await vi.waitFor(() => {
      expect(session?.handleMessage).toHaveBeenCalledTimes(callCount);
      const lastEnvelope = parseSentEnvelope(socket.sent.at(-1));
      expect(lastEnvelope.message?.type).toBe("rpc_error");
      expect(lastEnvelope.message?.payload).toMatchObject({
        requestId: "local-os-relay-1",
        requestType: "local.os.list_open_targets.request",
        code: "local_connection_required",
      });
    });

    await server.close();
  });

  test("reuses direct session when same clientId reconnects within grace window", async () => {
    const server = createServer();
    const clientId = "cid-direct-reconnect";

    const socket1 = new MockSocket();
    await attachDirectAndHello({
      server,
      socket: socket1,
      clientId,
    });
    expect(sessionMock.instances).toHaveLength(1);
    const session = sessionMock.instances[0];

    socket1.emit("close", 1006, "");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(session.cleanup).not.toHaveBeenCalled();

    const socket2 = new MockSocket();
    await attachDirectAndHello({
      server,
      socket: socket2,
      clientId,
    });
    expect(sessionMock.instances).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(20_000);
    expect(session.cleanup).not.toHaveBeenCalled();

    await server.close();
  });

  test("keeps direct and authorized relay sessions isolated for the same clientId", async () => {
    const server = createServer();
    const clientId = "cid-switch-path";

    const directSocket = new MockSocket();
    await attachDirectAndHello({
      server,
      socket: directSocket,
      clientId,
    });
    expect(sessionMock.instances).toHaveLength(1);
    const directSession = sessionMock.instances[0];

    const relaySocket = new MockSocket();
    await attachRelayAndHello({
      server,
      socket: relaySocket,
      clientId,
    });
    expect(sessionMock.instances).toHaveLength(2);
    const relaySession = sessionMock.instances[1];

    const directSentBefore = directSocket.sent.length;
    const relaySentBefore = relaySocket.sent.length;
    const directOnMessage = directSession.args.onMessage;
    expect(directOnMessage).toBeTypeOf("function");
    if (typeof directOnMessage === "function") {
      directOnMessage({
        type: "status",
        payload: { status: "direct-only" },
      });
    }

    expect(directSocket.sent).toHaveLength(directSentBefore + 1);
    expect(relaySocket.sent).toHaveLength(relaySentBefore);

    directSocket.emit("close", 1006, "");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(directSession.cleanup).not.toHaveBeenCalled();
    expect(relaySession.cleanup).not.toHaveBeenCalled();

    relaySocket.emit("close", 1006, "");
    await vi.advanceTimersByTimeAsync(90_000);
    expect(directSession.cleanup).toHaveBeenCalledTimes(1);
    expect(relaySession.cleanup).toHaveBeenCalledTimes(1);

    await server.close();
  });

  test("cleans up relay session when reconnect grace expires", async () => {
    const server = createServer();
    const clientId = "cid-relay-grace-expire";

    const socket1 = new MockSocket();
    await attachRelayAndHello({
      server,
      socket: socket1,
      clientId,
    });
    expect(sessionMock.instances).toHaveLength(1);
    const session = sessionMock.instances[0];

    socket1.emit("close", 1006, "");
    await vi.advanceTimersByTimeAsync(90_000);
    expect(session.cleanup).toHaveBeenCalledTimes(1);

    await server.close();
  });

  test("revoke disconnects the targeted authorized relay client", async () => {
    const server = createServer();
    const socket = new MockSocket();
    await attachRelayAndHello({
      server,
      socket,
      clientId: "cid-revoke",
    });
    expect(sessionMock.instances).toHaveLength(1);
    const session = sessionMock.instances[0];
    const authAdministration = getAuthAdministration(session);
    const clients = authAdministration.listClients().clients;
    expect(clients).toHaveLength(1);

    const result = await authAdministration.revokeClient({
      clientId: clients[0]!.id,
      adminPassword: CORRECT_PASSWORD,
    });

    expect(result.ok).toBe(true);
    expect(socket.readyState).toBe(3);
    expect(session.cleanup).toHaveBeenCalledTimes(1);

    await server.close();
  });

  test("rate limits failed revoke administrator password attempts", async () => {
    const server = createServer();
    const socket = new MockSocket();
    await attachRelayAndHello({
      server,
      socket,
      clientId: "cid-revoke-rate-limit",
    });
    const session = sessionMock.instances[0];
    const authAdministration = getAuthAdministration(session);
    const clients = authAdministration.listClients().clients;
    expect(clients).toHaveLength(1);

    const first = await authAdministration.revokeClient({
      clientId: clients[0]!.id,
      adminPassword: "wrong-password",
    });
    expect(first).toMatchObject({
      ok: false,
      code: "incorrect_password",
      retryAfterMs: expect.any(Number),
    });

    const second = await authAdministration.revokeClient({
      clientId: clients[0]!.id,
      adminPassword: "wrong-password",
    });
    expect(second).toMatchObject({
      ok: false,
      code: "rate_limited",
      retryAfterMs: expect.any(Number),
    });

    await server.close();
  });

  test("changing the daemon password revokes and disconnects all authorized relay clients", async () => {
    const server = createServer();
    const socket1 = new MockSocket();
    const socket2 = new MockSocket();
    await attachRelayAndHello({
      server,
      socket: socket1,
      clientId: "cid-password-change-1",
    });
    await attachRelayAndHello({
      server,
      socket: socket2,
      clientId: "cid-password-change-2",
    });
    expect(sessionMock.instances).toHaveLength(2);
    const session1 = sessionMock.instances[0];
    const session2 = sessionMock.instances[1];
    const authAdministration = getAuthAdministration(session1);
    expect(authAdministration.listClients().clients).toHaveLength(2);

    const result = await authAdministration.changePassword({
      currentPassword: CORRECT_PASSWORD,
      newPassword: "new-correct-password",
    });

    expect(result.ok).toBe(true);
    expect(result.revokedClientCount).toBe(2);
    expect(authAdministration.listClients().clients).toHaveLength(0);
    expect(socket1.readyState).toBe(3);
    expect(socket2.readyState).toBe(3);
    expect(session1.cleanup).toHaveBeenCalledTimes(1);
    expect(session2.cleanup).toHaveBeenCalledTimes(1);

    await server.close();
  });

  test("rate limits failed change-password administrator password attempts", async () => {
    const server = createServer();
    const socket = new MockSocket();
    await attachRelayAndHello({
      server,
      socket,
      clientId: "cid-password-change-rate-limit",
    });
    const session = sessionMock.instances[0];
    const authAdministration = getAuthAdministration(session);

    const first = await authAdministration.changePassword({
      currentPassword: "wrong-password",
      newPassword: "new-correct-password",
    });
    expect(first).toMatchObject({
      ok: false,
      code: "incorrect_password",
      retryAfterMs: expect.any(Number),
    });

    const second = await authAdministration.changePassword({
      currentPassword: "wrong-password",
      newPassword: "new-correct-password",
    });
    expect(second).toMatchObject({
      ok: false,
      code: "rate_limited",
      retryAfterMs: expect.any(Number),
    });

    await server.close();
  });

  test("includes voice capabilities in initial server_info when speech readiness exists", async () => {
    const speechReadiness = createReadySpeechReadinessSnapshot();
    const server = createServer({ speechReadiness });

    const socket = new MockSocket();
    const serverInfo = (await attachRelayAndHello({
      server,
      socket,
      clientId: "cid-server-info-capabilities",
    })) as {
      version?: unknown;
      capabilities?: {
        voice?: {
          dictation?: { enabled?: unknown; reason?: unknown };
          voice?: { enabled?: unknown; reason?: unknown };
        };
      };
    };
    expect(serverInfo.version).toBe(TEST_DAEMON_VERSION);
    expect(serverInfo.capabilities?.voice?.dictation?.enabled).toBe(
      speechReadiness.dictation.enabled,
    );
    expect(serverInfo.capabilities?.voice?.dictation?.reason).toBe("");
    expect(serverInfo.capabilities?.voice?.voice?.enabled).toBe(
      speechReadiness.realtimeVoice.enabled,
    );
    expect(serverInfo.capabilities?.voice?.voice?.reason).toBe("");

    await server.close();
  });

  test("broadcasts updated server_info when capabilities change", async () => {
    const server = createServer();

    const socket = new MockSocket();
    await attachRelayAndHello({
      server,
      socket,
      clientId: "cid-server-info-broadcast",
    });
    expect(getServerInfoEnvelopes(socket.sent)).toHaveLength(1);

    const speechReadiness = createReadySpeechReadinessSnapshot();
    server.publishSpeechReadiness(speechReadiness);
    const serverInfoEnvelopes = getServerInfoEnvelopes(socket.sent);
    expect(serverInfoEnvelopes).toHaveLength(2);
    const secondPayload = parseServerInfoStatusPayload(serverInfoEnvelopes[1]?.message?.payload);
    expect(secondPayload?.capabilities?.voice?.dictation.enabled).toBe(true);
    expect(secondPayload?.capabilities?.voice?.voice.enabled).toBe(true);

    // Same readiness should not produce another server_info broadcast.
    server.publishSpeechReadiness(speechReadiness);
    expect(getServerInfoEnvelopes(socket.sent)).toHaveLength(2);

    await server.close();
  });

  test("includes temporary retry guidance while models are downloading", async () => {
    const server = createServer();
    const socket = new MockSocket();
    await attachRelayAndHello({
      server,
      socket,
      clientId: "cid-server-info-download-guidance",
    });
    expect(getServerInfoEnvelopes(socket.sent)).toHaveLength(1);

    server.publishSpeechReadiness(createDownloadInProgressSpeechReadinessSnapshot());
    const serverInfoEnvelopes = getServerInfoEnvelopes(socket.sent);
    expect(serverInfoEnvelopes).toHaveLength(2);
    const payload = parseServerInfoStatusPayload(serverInfoEnvelopes[1]?.message?.payload);
    expect(payload?.capabilities?.voice?.dictation.enabled).toBe(true);
    expect(payload?.capabilities?.voice?.voice.enabled).toBe(true);
    expect(payload?.capabilities?.voice?.dictation.reason).toContain("Try again in a few minutes.");
    expect(payload?.capabilities?.voice?.voice.reason).toContain("Try again in a few minutes.");

    await server.close();
  });

  test("routes inbound terminal frames to session.handleBinaryFrame", async () => {
    const server = createServer();

    const socket = new MockSocket();
    await attachRelayAndHello({
      server,
      socket,
      clientId: "cid-binary-inbound",
    });
    expect(sessionMock.instances).toHaveLength(1);
    const session = sessionMock.instances[0];

    socket.emit(
      "message",
      Buffer.from(
        encodeTerminalStreamFrame({
          opcode: TerminalStreamOpcode.Input,
          slot: 9,
          payload: new TextEncoder().encode("ls\r"),
        }),
      ),
    );
    await waitForSocketMessages(server, socket);

    expect(session.handleBinaryFrame).toHaveBeenCalledTimes(1);
    const { frame } = BinaryFrameSchema.parse(session.handleBinaryFrame.mock.calls[0]?.[0]);
    expect(frame.opcode).toBe(TerminalStreamOpcode.Input);
    expect(frame.slot).toBe(9);
    expect(new TextDecoder().decode(frame.payload)).toBe("ls\r");

    await server.close();
  });

  test("sends outbound terminal frames from session over websocket", async () => {
    const server = createServer();

    const socket = new MockSocket();
    await attachRelayAndHello({
      server,
      socket,
      clientId: "cid-binary-outbound",
    });
    expect(sessionMock.instances).toHaveLength(1);
    const session = sessionMock.instances[0];

    const { onBinaryMessage } = session.args;
    expect(onBinaryMessage).toBeTypeOf("function");
    if (typeof onBinaryMessage === "function") {
      onBinaryMessage(new Uint8Array([TerminalStreamOpcode.Output, 12, 0x6f, 0x6b]));
    }

    const binaryPayloads = socket.sent
      .filter((payload) => typeof payload !== "string")
      .map(asUint8Array)
      .filter((payload): payload is Uint8Array => payload !== null);
    expect(binaryPayloads).toHaveLength(1);
    const frame = decodeTerminalStreamFrame(binaryPayloads[0]!);
    expect(frame).not.toBeNull();
    expect(frame!.opcode).toBe(TerminalStreamOpcode.Output);
    expect(frame!.slot).toBe(12);
    expect(new TextDecoder().decode(frame!.payload ?? new Uint8Array())).toBe("ok");

    await server.close();
  });
});
