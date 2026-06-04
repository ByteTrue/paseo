import { z } from "zod";

/**
 * Relay-only pairing offer.
 *
 * `serverId` is a stable daemon identifier scoped to `PASEO_HOME`, and is also
 * used as the relay session identifier.
 */
export const ConnectionOfferV2Schema = z.object({
  v: z.literal(2),
  serverId: z.string().min(1),
  daemonPublicKeyB64: z.string().min(1),
  relay: z.object({
    endpoint: z.string().min(1),
    useTls: z.boolean().optional(),
  }),
});

export type ConnectionOfferV2 = z.infer<typeof ConnectionOfferV2Schema>;

export const ConnectionOfferSchema = ConnectionOfferV2Schema;
export type ConnectionOffer = ConnectionOfferV2;
export const ConnectionOfferBundleEntrySchema = z.object({
  label: z.string().min(1).optional(),
  offer: ConnectionOfferSchema,
});
export type ConnectionOfferBundleEntry = z.infer<typeof ConnectionOfferBundleEntrySchema>;

export const ConnectionOfferBundleV1Schema = z.object({
  v: z.literal(1),
  entries: z.array(ConnectionOfferBundleEntrySchema).min(1).max(64),
});

export const ConnectionOfferBundleSchema = ConnectionOfferBundleV1Schema;
export type ConnectionOfferBundle = z.infer<typeof ConnectionOfferBundleSchema>;

export const DEFAULT_PAIRING_APP_BASE_URL = "https://paseo.zijieapi.de5.net";

function decodeBase64UrlToUtf8(input: string): string {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = globalThis.atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function encodeUtf8ToBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return globalThis.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function decodeOfferFragmentPayload(encoded: string): unknown {
  const json = decodeBase64UrlToUtf8(encoded);
  return JSON.parse(json) as unknown;
}

export function encodeOfferFragmentPayload(payload: unknown): string {
  return encodeUtf8ToBase64Url(JSON.stringify(payload));
}

const OFFER_FRAGMENT_PREFIX = "#offer=";
const OFFER_BUNDLE_FRAGMENT_PREFIX = "#offers=";

function extractFragmentEncoded(input: string, prefix: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const fragmentIndex = trimmed.indexOf(prefix);
  if (fragmentIndex === -1) return null;
  const encoded = trimmed.slice(fragmentIndex + prefix.length).trim();
  return encoded.length > 0 ? encoded : null;
}

/**
 * Parse a pairing-offer URL of the form `https://paseo.zijieapi.de5.net/#offer=<base64url>`.
 *
 * Returns `null` if the input has no `#offer=` fragment. Throws if the fragment
 * exists but the payload is malformed or fails schema validation.
 */
export function parseConnectionOfferFromUrl(input: string): ConnectionOffer | null {
  const encoded = extractFragmentEncoded(input, OFFER_FRAGMENT_PREFIX);
  if (!encoded) return null;
  const payload = decodeOfferFragmentPayload(encoded);
  return ConnectionOfferSchema.parse(payload);
}

export function parseConnectionOfferBundleFromUrl(input: string): ConnectionOfferBundle | null {
  const encoded = extractFragmentEncoded(input, OFFER_BUNDLE_FRAGMENT_PREFIX);
  if (!encoded) return null;
  const payload = decodeOfferFragmentPayload(encoded);
  return ConnectionOfferBundleSchema.parse(payload);
}

export function buildConnectionOfferUrl(
  offer: ConnectionOffer,
  appBaseUrl = DEFAULT_PAIRING_APP_BASE_URL,
): string {
  return `${appBaseUrl.replace(/\/$/, "")}/#offer=${encodeOfferFragmentPayload(offer)}`;
}

export function buildConnectionOfferBundleUrl(
  bundle: ConnectionOfferBundle,
  appBaseUrl = DEFAULT_PAIRING_APP_BASE_URL,
): string {
  return `${appBaseUrl.replace(/\/$/, "")}/#offers=${encodeOfferFragmentPayload(bundle)}`;
}
