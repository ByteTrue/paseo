#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const publishWorkspaces = [
  "packages/highlight",
  "packages/relay",
  "packages/protocol",
  "packages/client",
  "packages/server",
  "packages/cli",
];

const passthroughArgs = process.argv.slice(2);

function packageIsPublished(name, version) {
  try {
    execFileSync("npm", ["view", `${name}@${version}`, "version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}

for (const workspace of publishWorkspaces) {
  const manifest = JSON.parse(readFileSync(join(workspace, "package.json"), "utf8"));
  const { name, version } = manifest;

  if (packageIsPublished(name, version)) {
    console.log(`${name}@${version} already published; skipping`);
    continue;
  }

  console.log(`Publishing ${name}@${version}`);
  const result = spawnSync(
    "npm",
    ["publish", `--workspace=${name}`, "--access", "public", ...passthroughArgs],
    { stdio: "inherit" },
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
