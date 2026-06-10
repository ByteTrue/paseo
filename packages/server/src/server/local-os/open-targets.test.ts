import type { SpawnOptions } from "node:child_process";
import { describe, expect, it } from "vitest";
import { listAvailableLocalOpenTargets, openLocalTarget } from "./open-targets.js";

interface SpawnCall {
  command: string;
  args: string[];
  options: SpawnOptions;
}

class MockSpawnedProcess {
  once(event: "error", handler: (error: Error) => void): this;
  once(event: "spawn", handler: () => void): this;
  once(event: "error" | "spawn", handler: ((error: Error) => void) | (() => void)): this {
    if (event === "spawn") {
      queueMicrotask(() => {
        (handler as () => void)();
      });
    }
    return this;
  }

  unref(): void {}
}

function createSpawnRecorder() {
  const calls: SpawnCall[] = [];
  return {
    calls,
    spawn(command: string, args: string[], options: SpawnOptions) {
      calls.push({ command, args, options });
      return new MockSpawnedProcess();
    },
  };
}

function createExistsSync(existingPaths: string[]) {
  const existing = new Set(existingPaths);
  return (path: string) => existing.has(path);
}

describe("local open targets", () => {
  it("lists available editor and file-manager targets", () => {
    expect(
      listAvailableLocalOpenTargets({
        platform: "darwin",
        env: { PATH: "/usr/local/bin:/usr/bin" },
        existsSync: createExistsSync(["/usr/local/bin/code", "/usr/bin/open"]),
      }),
    ).toEqual([
      { id: "vscode", label: "VS Code", kind: "editor" },
      { id: "finder", label: "Finder", kind: "file-manager" },
    ]);
  });

  it("reveals files in Finder on macOS", async () => {
    const recorder = createSpawnRecorder();

    await openLocalTarget(
      { editorId: "finder", path: "/tmp/repo/src/index.ts", mode: "reveal" },
      {
        platform: "darwin",
        env: { PATH: "/usr/bin" },
        existsSync: createExistsSync(["/usr/bin/open", "/tmp/repo/src/index.ts"]),
        spawn: recorder.spawn,
      },
    );

    expect(recorder.calls).toHaveLength(1);
    expect(recorder.calls[0]?.command).toBe("/usr/bin/open");
    expect(recorder.calls[0]?.args).toEqual(["-R", "/tmp/repo/src/index.ts"]);
    expect(recorder.calls[0]?.options).toMatchObject({ detached: true, stdio: "ignore" });
  });

  it("rejects relative and missing paths", async () => {
    await expect(
      openLocalTarget(
        { editorId: "vscode", path: "repo" },
        { existsSync: () => true, env: { PATH: "/bin" } },
      ),
    ).rejects.toThrow("Open target path must be an absolute local path");

    await expect(
      openLocalTarget(
        { editorId: "vscode", path: "/tmp/repo" },
        { existsSync: () => false, env: { PATH: "/bin" } },
      ),
    ).rejects.toThrow("Path does not exist: /tmp/repo");
  });
});
