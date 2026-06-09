import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";

import { createTestLogger } from "../../test-utils/test-logger.js";
import { ProviderSnapshotCacheStore } from "./provider-snapshot-cache-store.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    try {
      // Tests use temporary directories that only contain this cache file.
      // Recursive rm keeps cleanup simple on every supported platform.
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup only.
    }
  }
});

test("persists last-known provider entries and marks them cached on read", () => {
  const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-provider-cache-"));
  tempDirs.push(paseoHome);
  const store = new ProviderSnapshotCacheStore(paseoHome, createTestLogger());

  store.write("/workspace/project", [
    {
      provider: "codex",
      label: "Codex",
      enabled: true,
      status: "ready",
      models: [{ provider: "codex", id: "gpt-5.4-mini", label: "GPT 5.4 Mini" }],
      modes: [{ id: "auto", label: "Auto" }],
      fetchedAt: "2026-06-08T00:00:00.000Z",
    },
    {
      provider: "claude",
      label: "Claude",
      enabled: true,
      status: "loading",
      fetchedAt: "2026-06-08T00:00:00.000Z",
    },
  ]);

  const entries = store.read("/workspace/project");
  expect(entries).toHaveLength(1);
  expect(entries?.[0]).toMatchObject({
    provider: "codex",
    status: "ready",
    cacheState: "cached",
    cacheGeneratedAt: expect.any(String),
  });

  const raw = JSON.parse(
    readFileSync(path.join(paseoHome, "provider-snapshot-cache.json"), "utf8"),
  );
  expect(raw.snapshots["/workspace/project"].entries).toHaveLength(1);
  expect(raw.snapshots["/workspace/project"].entries[0]).not.toHaveProperty("cacheState");
});

test("retains only currently configured providers", () => {
  const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-provider-cache-"));
  tempDirs.push(paseoHome);
  const store = new ProviderSnapshotCacheStore(paseoHome, createTestLogger());

  store.write("/workspace/project", [
    {
      provider: "codex",
      label: "Codex",
      enabled: true,
      status: "ready",
      fetchedAt: "2026-06-08T00:00:00.000Z",
    },
    {
      provider: "claude",
      label: "Claude",
      enabled: true,
      status: "error",
      error: "not authenticated",
      fetchedAt: "2026-06-08T00:00:00.000Z",
    },
  ]);

  store.retainProviders(["codex"]);

  expect(store.read("/workspace/project")?.map((entry) => entry.provider)).toEqual(["codex"]);
});
