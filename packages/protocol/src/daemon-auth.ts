import nacl from "tweetnacl";

export const DAEMON_AUTH_CHALLENGE_VERSION = "paseo-daemon-client-auth-v1";

export interface DaemonAuthKeyPair {
  publicKeyB64: string;
  secretKeyB64: string;
}

export interface DaemonAuthChallengeSigningInput {
  serverId: string;
  clientId: string;
  clientPublicKeyB64: string;
  challengeId: string;
  challengeB64: string;
  purpose: "authenticate" | "enroll";
}

export function generateDaemonAuthKeyPair(): DaemonAuthKeyPair {
  const keyPair = nacl.sign.keyPair();
  return {
    publicKeyB64: bytesToBase64(keyPair.publicKey),
    secretKeyB64: bytesToBase64(keyPair.secretKey),
  };
}

export function buildDaemonAuthChallengeSigningPayload(
  input: DaemonAuthChallengeSigningInput,
): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      v: DAEMON_AUTH_CHALLENGE_VERSION,
      serverId: input.serverId,
      clientId: input.clientId,
      clientPublicKeyB64: input.clientPublicKeyB64,
      challengeId: input.challengeId,
      challengeB64: input.challengeB64,
      purpose: input.purpose,
    }),
  );
}

export function signDaemonAuthChallenge(
  input: DaemonAuthChallengeSigningInput & { secretKeyB64: string },
): string {
  const signature = nacl.sign.detached(
    buildDaemonAuthChallengeSigningPayload(input),
    base64ToBytes(input.secretKeyB64),
  );
  return bytesToBase64(signature);
}

export function verifyDaemonAuthChallengeSignature(
  input: DaemonAuthChallengeSigningInput & { signatureB64: string },
): boolean {
  return nacl.sign.detached.verify(
    buildDaemonAuthChallengeSigningPayload(input),
    base64ToBytes(input.signatureB64),
    base64ToBytes(input.clientPublicKeyB64),
  );
}

export function bytesToBase64(bytes: Uint8Array): string {
  const bufferCtor = (globalThis as { Buffer?: typeof Buffer }).Buffer;
  if (bufferCtor) {
    return bufferCtor.from(bytes).toString("base64");
  }

  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const bufferCtor = (globalThis as { Buffer?: typeof Buffer }).Buffer;
  if (bufferCtor) {
    return new Uint8Array(bufferCtor.from(value, "base64"));
  }

  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
