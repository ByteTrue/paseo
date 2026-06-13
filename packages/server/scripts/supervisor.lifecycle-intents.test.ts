import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, test } from "vitest";

const repoRoot = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const supervisorPath = fileURLToPath(new URL("./supervisor.ts", import.meta.url));

async function runSupervisorLifecycleFixture(workerSource: string): Promise<{
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "paseo-supervisor-lifecycle-"));
  const workerPath = path.join(tempDir, "worker.mjs");
  const runnerPath = path.join(tempDir, "runner.mjs");

  await writeFile(workerPath, workerSource);
  await writeFile(
    runnerPath,
    `
      import { runSupervisor } from ${JSON.stringify(pathToFileURL(supervisorPath).href)};

      runSupervisor({
        name: "LifecycleSupervisor",
        startupMessage: "starting lifecycle fixture",
        resolveWorkerEntry: () => ${JSON.stringify(workerPath)},
        workerArgs: [],
        workerEnv: process.env,
        workerExecArgv: [],
      });
    `,
  );

  const child = spawn(process.execPath, ["--import", "tsx", runnerPath], {
    cwd: repoRoot,
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const { code, signal } = await new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("supervisor lifecycle fixture timed out"));
    }, 5000);

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (exitCode, exitSignal) => {
      clearTimeout(timeout);
      resolve({ code: exitCode, signal: exitSignal });
    });
  });

  return { code, signal, stdout, stderr };
}

describe("supervisor lifecycle intents", () => {
  test("uses explicit shutdown and restart IPC intents", () => {
    const supervisorSource = readFileSync(new URL("./supervisor.ts", import.meta.url), "utf8");
    const workerSource = readFileSync(
      new URL("../src/server/daemon-worker.ts", import.meta.url),
      "utf8",
    );
    const legacyShutdownReason = ["cli", "shutdown"].join("_");

    expect(supervisorSource).toContain('"paseo:shutdown"');
    expect(supervisorSource).toContain('"paseo:restart"');
    expect(supervisorSource).toContain('"paseo:supervisor-shutdown"');
    expect(supervisorSource).toContain('"paseo:supervisor-restart"');
    expect(workerSource).toContain('"paseo:supervisor-shutdown"');
    expect(workerSource).toContain('"paseo:supervisor-restart"');
    expect(supervisorSource).not.toContain(legacyShutdownReason);
  });

  test("asks the worker to shut itself down before falling back to SIGTERM", async () => {
    const result = await runSupervisorLifecycleFixture(`
      const keepAlive = setInterval(() => {}, 1000);

      process.on("message", (message) => {
        if (message?.type !== "paseo:supervisor-shutdown") {
          return;
        }
        clearInterval(keepAlive);
        process.stdout.write("graceful-shutdown\\n");
        process.exit(0);
      });

      process.on("SIGTERM", () => {
        process.stdout.write("sigterm\\n");
      });

      setImmediate(() => {
        process.send?.({ type: "paseo:shutdown" });
      });
    `);

    expect(result.code).toBe(0);
    expect(result.signal).toBeNull();
    expect(result.stdout).toContain("graceful-shutdown");
    expect(result.stdout).not.toContain("sigterm");
  });
});
