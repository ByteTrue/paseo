#!/usr/bin/env npx tsx

import assert from "node:assert";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTestPaseoDaemon } from "../../server/src/server/test-utils/paseo-daemon.ts";
import { runLocalPaseo } from "./helpers/local-cli.ts";

console.log("=== Daemon Status Auth ===\n");

const CORRECT_PASSWORD_HASH = "$2b$12$GMhF7pN4QnMlHOQXOqjd1OitKWPSmAO3FwB0PHzKtcZR/sAMryz76";

// ByteTrue fork: localhost connections bypass the admin password gate
// (trustedLocal). LAN and other remote connections still require the
// password when one is configured.

const daemon = await createTestPaseoDaemon({
  auth: { password: CORRECT_PASSWORD_HASH },
});

try {
  await writeFile(
    join(daemon.paseoHome, "paseo.pid"),
    `${JSON.stringify(
      {
        pid: process.pid,
        startedAt: new Date().toISOString(),
        hostname: "status-auth-test",
        uid: process.getuid?.(),
        listen: `0.0.0.0:${daemon.port}`,
      },
      null,
      2,
    )}\n`,
  );

  {
    console.log(
      "Test 1: localhost status is reachable even without a password (trusted local transport)",
    );
    const result = await runLocalPaseo(["daemon", "status", "--json"], {
      PASEO_HOME: daemon.paseoHome,
      PASEO_HOST: "",
      PASEO_PASSWORD: "",
    });

    assert.strictEqual(result.exitCode, 0, "status should still succeed");
    const status = JSON.parse(result.stdout);

    assert.strictEqual(status.localDaemon, "running");
    assert.strictEqual(status.connectedDaemon, "reachable");
    assert.strictEqual(status.runningAgents, 0);
    assert.strictEqual(status.idleAgents, 0);
    console.log("✓ localhost bypasses password gate\n");
  }

  {
    console.log("Test 2: localhost status ignores a wrong password (trusted transport)");
    const result = await runLocalPaseo(["daemon", "status", "--json"], {
      PASEO_HOME: daemon.paseoHome,
      PASEO_HOST: "",
      PASEO_PASSWORD: "wrong-secret",
    });

    assert.strictEqual(result.exitCode, 0, "status should still succeed");
    const status = JSON.parse(result.stdout);

    assert.strictEqual(status.localDaemon, "running");
    assert.strictEqual(status.connectedDaemon, "reachable");
    assert.strictEqual(status.runningAgents, 0);
    assert.strictEqual(status.idleAgents, 0);
    console.log("✓ wrong password is irrelevant on localhost\n");
  }

  {
    console.log("Test 3: localhost status with password is reachable");
    const result = await runLocalPaseo(["daemon", "status", "--json"], {
      PASEO_HOME: daemon.paseoHome,
      PASEO_HOST: "",
      PASEO_PASSWORD: "shared-secret",
    });

    assert.strictEqual(result.exitCode, 0, "status should succeed with password");
    const status = JSON.parse(result.stdout);

    assert.strictEqual(status.localDaemon, "running");
    assert.strictEqual(status.connectedDaemon, "reachable");
    assert.strictEqual(status.runningAgents, 0);
    assert.strictEqual(status.idleAgents, 0);
    console.log("✓ password-authenticated status remains reachable\n");
  }
} finally {
  await daemon.close();
}

console.log("=== Daemon Status Auth Tests Passed ===");
