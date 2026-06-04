import { describe, expect, it } from "vitest";

import {
  buildConnectionOfferBundleUrl,
  buildConnectionOfferUrl,
  ConnectionOfferBundleSchema,
  ConnectionOfferSchema,
  decodeOfferFragmentPayload,
  encodeOfferFragmentPayload,
  parseConnectionOfferBundleFromUrl,
  parseConnectionOfferFromUrl,
} from "./connection-offer.js";

function encodeBase64UrlNoPadUtf8(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

describe("connection offer", () => {
  it("decodes base64url JSON payloads", () => {
    const payload = {
      v: 2,
      serverId: "server-123",
      daemonPublicKeyB64: "pubkey",
      relay: { endpoint: "relay.paseo.zijieapi.de5.net:443" },
    };

    expect(decodeOfferFragmentPayload(encodeBase64UrlNoPadUtf8(JSON.stringify(payload)))).toEqual(
      payload,
    );
  });

  it("encodes base64url JSON payloads", () => {
    const payload = { v: 1, value: "hello" };
    expect(decodeOfferFragmentPayload(encodeOfferFragmentPayload(payload))).toEqual(payload);
  });

  it("parses connection offers from QR-style URLs", () => {
    const offer = ConnectionOfferSchema.parse({
      v: 2,
      serverId: "server-123",
      daemonPublicKeyB64: "pubkey",
      relay: { endpoint: "relay.paseo.zijieapi.de5.net:443" },
    });
    const encoded = encodeBase64UrlNoPadUtf8(JSON.stringify(offer));

    expect(parseConnectionOfferFromUrl(`https://paseo.zijieapi.de5.net/#offer=${encoded}`)).toEqual(
      offer,
    );
  });

  it("builds connection offer URLs", () => {
    const offer = ConnectionOfferSchema.parse({
      v: 2,
      serverId: "server-123",
      daemonPublicKeyB64: "pubkey",
      relay: { endpoint: "relay.paseo.zijieapi.de5.net:443" },
    });

    expect(parseConnectionOfferFromUrl(buildConnectionOfferUrl(offer))).toEqual(offer);
  });

  it("parses connection offer bundles from QR-style URLs", () => {
    const bundle = ConnectionOfferBundleSchema.parse({
      v: 1,
      entries: [
        {
          label: "Laptop",
          offer: {
            v: 2,
            serverId: "server-123",
            daemonPublicKeyB64: "pubkey",
            relay: { endpoint: "relay.paseo.zijieapi.de5.net:443" },
          },
        },
      ],
    });

    expect(parseConnectionOfferBundleFromUrl(buildConnectionOfferBundleUrl(bundle))).toEqual(
      bundle,
    );
    expect(parseConnectionOfferFromUrl(buildConnectionOfferBundleUrl(bundle))).toBeNull();
  });

  it("leaves relay TLS unset when absent", () => {
    expect(
      ConnectionOfferSchema.parse({
        v: 2,
        serverId: "server-123",
        daemonPublicKeyB64: "pubkey",
        relay: { endpoint: "relay.example.com:80" },
      }),
    ).toEqual({
      v: 2,
      serverId: "server-123",
      daemonPublicKeyB64: "pubkey",
      relay: { endpoint: "relay.example.com:80" },
    });
  });

  it("round-trips relay TLS in offers without rejecting extra relay fields", () => {
    const offer = ConnectionOfferSchema.parse({
      v: 2,
      serverId: "server-123",
      daemonPublicKeyB64: "pubkey",
      relay: { endpoint: "relay.example.com:443", useTls: true, extra: "future" },
    });
    const encoded = encodeBase64UrlNoPadUtf8(JSON.stringify(offer));

    expect(parseConnectionOfferFromUrl(`https://paseo.zijieapi.de5.net/#offer=${encoded}`)).toEqual(
      {
        v: 2,
        serverId: "server-123",
        daemonPublicKeyB64: "pubkey",
        relay: { endpoint: "relay.example.com:443", useTls: true },
      },
    );
  });

  it("returns null when the URL has no offer fragment", () => {
    expect(parseConnectionOfferFromUrl("https://paseo.zijieapi.de5.net/pair")).toBeNull();
  });

  it("returns null when the URL has no bundle fragment", () => {
    expect(parseConnectionOfferBundleFromUrl("https://paseo.zijieapi.de5.net/pair")).toBeNull();
  });
});
