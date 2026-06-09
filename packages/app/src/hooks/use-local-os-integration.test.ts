import { describe, expect, it } from "vitest";
import { canUseLocalOsIntegration, isLoopbackTcpEndpoint } from "./local-os-integration-support";

describe("local OS integration support", () => {
  it("recognizes loopback TCP endpoints", () => {
    expect(isLoopbackTcpEndpoint("localhost:6767")).toBe(true);
    expect(isLoopbackTcpEndpoint("http://127.0.0.1:6767/ws")).toBe(true);
    expect(isLoopbackTcpEndpoint("[::1]:6767")).toBe(true);
    expect(isLoopbackTcpEndpoint("192.168.1.10:6767")).toBe(false);
  });

  it("requires both feature support and a local direct connection", () => {
    expect(
      canUseLocalOsIntegration({
        supportsLocalOsIntegration: true,
        activeConnection: {
          type: "directTcp",
          endpoint: "localhost:6767",
          display: "localhost:6767",
        },
      }),
    ).toBe(true);
    expect(
      canUseLocalOsIntegration({
        supportsLocalOsIntegration: true,
        activeConnection: { type: "relay", endpoint: "wss://relay.example", display: "relay" },
      }),
    ).toBe(false);
    expect(
      canUseLocalOsIntegration({
        supportsLocalOsIntegration: false,
        activeConnection: {
          type: "directTcp",
          endpoint: "localhost:6767",
          display: "localhost:6767",
        },
      }),
    ).toBe(false);
  });
});
