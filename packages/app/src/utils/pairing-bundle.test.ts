import { describe, expect, it } from "vitest";
import { parseConnectionOfferBundleFromUrl } from "@bytetrue/protocol/connection-offer";
import type { HostProfile } from "@/types/host-connection";
import {
  buildPairingBundleEntries,
  buildPairingBundleFromHosts,
  buildPairingBundleUrlFromHosts,
} from "./pairing-bundle";

function makeHost(overrides: Partial<HostProfile> = {}): HostProfile {
  return {
    serverId: "srv_test",
    label: "Test Host",
    lifecycle: {},
    connections: [
      {
        id: "direct:127.0.0.1:6767",
        type: "directTcp",
        endpoint: "127.0.0.1:6767",
        useTls: false,
      },
      {
        id: "relay:relay.example.com:443",
        type: "relay",
        relayEndpoint: "relay.example.com:443",
        useTls: true,
        daemonPublicKeyB64: "pk_test",
      },
    ],
    preferredConnectionId: "relay:relay.example.com:443",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

describe("pairing bundle", () => {
  it("builds a shareable bundle from relay hosts", () => {
    const bundle = buildPairingBundleFromHosts([makeHost()]);

    expect(bundle).toEqual({
      v: 1,
      entries: [
        {
          label: "Test Host",
          offer: {
            v: 2,
            serverId: "srv_test",
            daemonPublicKeyB64: "pk_test",
            relay: { endpoint: "relay.example.com:443", useTls: true },
          },
        },
      ],
    });
  });

  it("skips hosts without relay connections", () => {
    const bundle = buildPairingBundleFromHosts([
      makeHost({
        connections: [
          {
            id: "direct:127.0.0.1:6767",
            type: "directTcp",
            endpoint: "127.0.0.1:6767",
            useTls: false,
          },
        ],
        preferredConnectionId: "direct:127.0.0.1:6767",
      }),
    ]);

    expect(bundle).toBeNull();
  });

  it("prefers the preferred relay connection when multiple relays are saved", () => {
    const entries = buildPairingBundleEntries([
      makeHost({
        connections: [
          {
            id: "relay:relay-a.example.com:443",
            type: "relay",
            relayEndpoint: "relay-a.example.com:443",
            daemonPublicKeyB64: "pk_a",
          },
          {
            id: "relay:wss:relay-b.example.com:443",
            type: "relay",
            relayEndpoint: "relay-b.example.com:443",
            useTls: true,
            daemonPublicKeyB64: "pk_b",
          },
        ],
        preferredConnectionId: "relay:wss:relay-b.example.com:443",
      }),
    ]);

    expect(entries[0]?.offer).toMatchObject({
      daemonPublicKeyB64: "pk_b",
      relay: { endpoint: "relay-b.example.com:443", useTls: true },
    });
  });

  it("round-trips the generated bundle URL", () => {
    const url = buildPairingBundleUrlFromHosts([makeHost()]);

    expect(url).toContain("#offers=");
    expect(parseConnectionOfferBundleFromUrl(url ?? "")).toEqual(
      buildPairingBundleFromHosts([makeHost()]),
    );
  });
});
