import type pino from "pino";
import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { ensurePrivateFile, writePrivateFileAtomicSync } from "./private-files.js";

const AuthorizedClientSchema = z.object({
  id: z.string().min(1),
  publicKeyB64: z.string().min(1),
  clientName: z.string().min(1).nullable().default(null),
  createdAt: z.string(),
  lastSeenAt: z.string().nullable().default(null),
});

const AuthorizedClientFileSchema = z.object({
  v: z.literal(1).default(1),
  clients: z.array(AuthorizedClientSchema).default([]),
});

export type AuthorizedClient = z.infer<typeof AuthorizedClientSchema>;
export type AuthorizedClientSummary = AuthorizedClient;

export class AuthorizedClientStore {
  private readonly logger: pino.Logger;
  private readonly filePath: string;
  private clients = new Map<string, AuthorizedClient>();

  constructor(logger: pino.Logger, filePath: string) {
    this.logger = logger.child({ component: "authorized-client-store" });
    this.filePath = filePath;
    this.loadFromDisk();
  }

  list(): AuthorizedClientSummary[] {
    return Array.from(this.clients.values()).sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt),
    );
  }

  findById(id: string): AuthorizedClient | null {
    return this.clients.get(id) ?? null;
  }

  findByPublicKey(publicKeyB64: string): AuthorizedClient | null {
    return this.list().find((client) => client.publicKeyB64 === publicKeyB64) ?? null;
  }

  enroll(input: {
    publicKeyB64: string;
    clientName?: string | null;
    now?: Date;
  }): AuthorizedClient {
    const existing = this.findByPublicKey(input.publicKeyB64);
    if (existing) {
      const updated = {
        ...existing,
        clientName: normalizeClientName(input.clientName) ?? existing.clientName,
        lastSeenAt: (input.now ?? new Date()).toISOString(),
      };
      this.clients.set(updated.id, updated);
      this.persist();
      return updated;
    }

    const now = (input.now ?? new Date()).toISOString();
    const client: AuthorizedClient = {
      id: `authc_${randomUUID()}`,
      publicKeyB64: input.publicKeyB64,
      clientName: normalizeClientName(input.clientName),
      createdAt: now,
      lastSeenAt: now,
    };
    this.clients.set(client.id, client);
    this.persist();
    return client;
  }

  touch(publicKeyB64: string, now = new Date()): AuthorizedClient | null {
    const existing = this.findByPublicKey(publicKeyB64);
    if (!existing) {
      return null;
    }
    const updated = { ...existing, lastSeenAt: now.toISOString() };
    this.clients.set(updated.id, updated);
    this.persist();
    return updated;
  }

  revoke(id: string): AuthorizedClient | null {
    const client = this.findById(id);
    if (!client) {
      return null;
    }
    this.clients.delete(client.id);
    this.persist();
    return client;
  }

  revokeAll(): AuthorizedClient[] {
    const revoked = this.list();
    if (revoked.length === 0) {
      return [];
    }
    this.clients.clear();
    this.persist();
    return revoked;
  }

  private loadFromDisk(): void {
    try {
      if (!existsSync(this.filePath)) {
        return;
      }
      ensurePrivateFile(this.filePath);
      const parsed = AuthorizedClientFileSchema.safeParse(
        JSON.parse(readFileSync(this.filePath, "utf-8")),
      );
      if (!parsed.success) {
        this.logger.warn({ error: parsed.error.message }, "Failed to parse authorized clients");
        return;
      }
      this.clients = new Map(parsed.data.clients.map((client) => [client.id, client]));
      this.logger.info({ total: this.clients.size }, "Loaded authorized clients");
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.warn({ err }, "Failed to load authorized clients");
    }
  }

  private persist(): void {
    const payload = JSON.stringify({ v: 1, clients: this.list() }, null, 2) + "\n";
    writePrivateFileAtomicSync(this.filePath, payload);
  }
}

function normalizeClientName(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
