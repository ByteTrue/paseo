import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DaemonClientAdminPasswordContext,
  DaemonClientConfig,
} from "@bytetrue/client/internal/daemon-client";
import type { DaemonConnectionDependencies, DaemonProbeClient } from "./test-daemon-connection";

type AdminPasswordProvider = (
  context: DaemonClientAdminPasswordContext,
) => Promise<string | null | undefined>;

class FakeDaemonClient implements DaemonProbeClient {
  readonly lastError: string | null;

  constructor(
    private readonly probe: FakeDaemonProbe,
    readonly config: DaemonClientConfig,
  ) {
    this.lastError = probe.nextLastError;
  }

  async connect(): Promise<void> {
    if (this.probe.nextConnectError) {
      throw this.probe.nextConnectError;
    }
    if (this.probe.waitForAdminPasswordDuringConnect) {
      await this.config.clientAuth?.adminPasswordProvider?.({
        serverId: "srv_probe_test",
        url: this.config.url,
        enrollmentAllowed: true,
        adminPasswordConfigured: true,
        error: null,
      });
    }
  }

  getLastServerInfoMessage() {
    return {
      serverId: "srv_probe_test",
      hostname: "probe-host",
    };
  }

  async close(): Promise<void> {
    this.probe.closedClients.push(this);
  }
}

class FakeDaemonProbe {
  createdClients: FakeDaemonClient[] = [];
  closedClients: FakeDaemonClient[] = [];
  clientIdsRequested = 0;
  nextConnectError: Error | null = null;
  nextLastError: string | null = null;
  waitForAdminPasswordDuringConnect = false;
  readonly adminPasswordProvider = vi.fn<AdminPasswordProvider>(async () => null);
  readonly clientAuth = {
    keyStore: {
      get: async () => null,
      set: async () => undefined,
    },
    adminPasswordProvider: (context: DaemonClientAdminPasswordContext) =>
      this.adminPasswordProvider(context),
    clientName: "Probe test",
  } satisfies NonNullable<DaemonClientConfig["clientAuth"]>;

  readonly deps: DaemonConnectionDependencies<FakeDaemonClient> = {
    getClientId: async () => {
      this.clientIdsRequested += 1;
      return "cid_shared_probe_test";
    },
    resolveAppVersion: () => null,
    createLocalTransportFactory: () => null,
    buildLocalTransportUrl: ({ transportType, transportPath }) =>
      `paseo+local://${transportType}?path=${encodeURIComponent(transportPath)}`,
    createClient: (config) => {
      const client = new FakeDaemonClient(this, config);
      this.createdClients.push(client);
      return client;
    },
    getClientAuth: () => this.clientAuth,
  };

  failNextConnection(error: Error, lastError: string | null): void {
    this.nextConnectError = error;
    this.nextLastError = lastError;
  }

  createdConfigs(): DaemonClientConfig[] {
    return this.createdClients.map((client) => client.config);
  }
}

describe("test-daemon-connection connectToDaemon", () => {
  let probe: FakeDaemonProbe;

  beforeEach(() => {
    vi.stubGlobal("__DEV__", false);
    probe = new FakeDaemonProbe();
  });

  it("keeps default probe timeouts long enough for password entry", async () => {
    const { DEFAULT_DIRECT_DAEMON_PROBE_TIMEOUT_MS, DEFAULT_RELAY_DAEMON_PROBE_TIMEOUT_MS } =
      await import("./test-daemon-connection");

    expect(DEFAULT_DIRECT_DAEMON_PROBE_TIMEOUT_MS).toBeGreaterThanOrEqual(30_000);
    expect(DEFAULT_RELAY_DAEMON_PROBE_TIMEOUT_MS).toBeGreaterThanOrEqual(60_000);
  });

  it("pauses the probe timeout while waiting for admin password input", async () => {
    vi.useFakeTimers();
    try {
      const { connectToDaemon } = await import("./test-daemon-connection");
      const resolvePasswordRef: { current: ((password: string) => void) | null } = {
        current: null,
      };
      probe.waitForAdminPasswordDuringConnect = true;
      probe.adminPasswordProvider.mockImplementation(
        () =>
          new Promise<string>((resolve) => {
            resolvePasswordRef.current = resolve;
          }),
      );

      const resultPromise = connectToDaemon(
        {
          id: "relay:wss:relay.paseo.test:443",
          type: "relay",
          relayEndpoint: "relay.paseo.test:443",
          useTls: true,
          daemonPublicKeyB64: "pubkey",
        },
        { serverId: "srv_probe_test", timeoutMs: 1_000 },
        probe.deps,
      );
      let settled = false;
      void resultPromise.then(
        () => {
          settled = true;
          return undefined;
        },
        () => {
          settled = true;
          return undefined;
        },
      );

      await Promise.resolve();
      await Promise.resolve();
      expect(probe.adminPasswordProvider).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(5_000);
      expect(settled).toBe(false);
      expect(probe.closedClients).toHaveLength(0);

      expect(resolvePasswordRef.current).not.toBeNull();
      resolvePasswordRef.current?.("secret");
      await expect(resultPromise).resolves.toMatchObject({
        serverId: "srv_probe_test",
        hostname: "probe-host",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("reuses the app clientId for direct connections", async () => {
    const { connectToDaemon } = await import("./test-daemon-connection");
    const first = await connectToDaemon(
      {
        id: "direct:lan:6767",
        type: "directTcp",
        endpoint: "lan:6767",
      },
      undefined,
      probe.deps,
    );
    await first.client.close();

    const second = await connectToDaemon(
      {
        id: "direct:lan:6767",
        type: "directTcp",
        endpoint: "lan:6767",
      },
      undefined,
      probe.deps,
    );
    await second.client.close();

    const [firstConfig, secondConfig] = probe.createdConfigs();
    expect(firstConfig?.clientId).toBe("cid_shared_probe_test");
    expect(secondConfig?.clientId).toBe("cid_shared_probe_test");
    expect(probe.clientIdsRequested).toBe(2);
  });

  it("encodes the local socket target into the client config", async () => {
    const { connectToDaemon } = await import("./test-daemon-connection");
    const result = await connectToDaemon(
      {
        id: "socket:/tmp/paseo.sock",
        type: "directSocket",
        path: "/tmp/paseo.sock",
      },
      undefined,
      probe.deps,
    );
    await result.client.close();

    expect(probe.createdConfigs()[0]?.url).toBe("paseo+local://socket?path=%2Ftmp%2Fpaseo.sock");
  });

  it("drops legacy direct TCP connection passwords from the client config", async () => {
    const { connectToDaemon } = await import("./test-daemon-connection");
    const result = await connectToDaemon(
      {
        id: "direct:lan:6767",
        type: "directTcp",
        endpoint: "lan:6767",
        password: "shared-secret",
      },
      undefined,
      probe.deps,
    );
    await result.client.close();

    expect(probe.createdConfigs()[0]?.password).toBeUndefined();
  });

  it("passes client auth hooks into probe client configs", async () => {
    const { connectToDaemon } = await import("./test-daemon-connection");
    const result = await connectToDaemon(
      {
        id: "relay:wss:relay.paseo.test:443",
        type: "relay",
        relayEndpoint: "relay.paseo.test:443",
        useTls: true,
        daemonPublicKeyB64: "pubkey",
      },
      { serverId: "srv_probe_test" },
      probe.deps,
    );
    await result.client.close();

    const config = probe.createdConfigs()[0];
    expect(config?.clientAuth).not.toBe(probe.clientAuth);
    expect(config?.clientAuth?.keyStore).toBe(probe.clientAuth.keyStore);
    expect(config?.clientAuth?.clientName).toBe(probe.clientAuth.clientName);
    expect(config?.clientAuth?.adminPasswordProvider).not.toBe(
      probe.clientAuth.adminPasswordProvider,
    );
  });

  it("uses relay TLS from the stored connection", async () => {
    const { connectToDaemon } = await import("./test-daemon-connection");
    const tlsResult = await connectToDaemon(
      {
        id: "relay:wss:[::1]:443",
        type: "relay",
        relayEndpoint: "[::1]:443",
        useTls: true,
        daemonPublicKeyB64: "pubkey",
      },
      { serverId: "srv_probe_test" },
      probe.deps,
    );
    await tlsResult.client.close();

    const plainResult = await connectToDaemon(
      {
        id: "relay:relay.paseo.zijieapi.de5.net:443",
        type: "relay",
        relayEndpoint: "relay.paseo.zijieapi.de5.net:443",
        useTls: false,
        daemonPublicKeyB64: "pubkey",
      },
      { serverId: "srv_probe_test" },
      probe.deps,
    );
    await plainResult.client.close();

    expect(probe.createdConfigs()[0]?.url).toMatch(/^wss:\/\/\[::1\]\/ws\?/);
    expect(probe.createdConfigs()[1]?.url).toMatch(
      /^ws:\/\/relay\.paseo\.zijieapi\.de5\.net:443\/ws\?/,
    );
  });

  it("surfaces auth rejection as a transport failure", async () => {
    const { connectToDaemon } = await import("./test-daemon-connection");
    probe.failNextConnection(
      new Error("Transport closed (code 4001)"),
      "Transport closed (code 4001)",
    );

    await expect(
      connectToDaemon(
        {
          id: "direct:lan:6767",
          type: "directTcp",
          endpoint: "lan:6767",
        },
        undefined,
        probe.deps,
      ),
    ).rejects.toMatchObject({
      message: "Transport closed (code 4001)",
    });
  });

  it("keeps generic transport failures generic", async () => {
    const { connectToDaemon } = await import("./test-daemon-connection");
    probe.failNextConnection(new Error("Transport error"), "Transport error");

    await expect(
      connectToDaemon(
        {
          id: "direct:lan:6767",
          type: "directTcp",
          endpoint: "lan:6767",
        },
        undefined,
        probe.deps,
      ),
    ).rejects.toMatchObject({
      message: "Transport error",
    });
  });
});
