import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("desktop packaging", () => {
  it("unpacks server zsh shell integration files for external shells", () => {
    const config = readFileSync(join(packageRoot, "electron-builder.yml"), "utf8");

    expect(config).toContain(
      "node_modules/@bytetrue/server/dist/server/terminal/shell-integration/**/*",
    );
    expect(config).not.toContain(
      "node_modules/@bytetrue/server/dist/src/terminal/shell-integration/**/*",
    );
  });

  it("excludes package debug/source files from the packaged app", () => {
    const config = readFileSync(join(packageRoot, "electron-builder.yml"), "utf8");

    expect(config).toContain("!**/*.map");
    expect(config).toContain("!node_modules/@bytetrue/*/src/**");
    expect(config).toContain("!node_modules/@bytetrue/**/*.test.*");
    expect(config).toContain("!node_modules/@bytetrue/**/*.spec.*");
  });

  it("keeps unsigned macOS artifacts launchable after quarantine is removed", () => {
    const config = readFileSync(join(packageRoot, "electron-builder.yml"), "utf8");

    expect(config).toContain("hardenedRuntime: false");
    expect(config).toContain("notarize: false");
  });

  it("publishes desktop updates from the ByteTrue fork", () => {
    const config = readFileSync(join(packageRoot, "electron-builder.yml"), "utf8");

    expect(config).toContain("owner: ByteTrue");
    expect(config).toContain("repo: paseo");
    expect(config).not.toContain("owner: getpaseo");
  });

  it("launch-smokes unsigned macOS packages without starting a daemon", () => {
    const afterPack = readFileSync(join(packageRoot, "scripts", "after-pack.js"), "utf8");
    const smoke = readFileSync(
      join(packageRoot, "scripts", "smoke-packaged-desktop-app.js"),
      "utf8",
    );
    const main = readFileSync(join(packageRoot, "src", "main.ts"), "utf8");

    expect(afterPack).toContain('platform === "darwin"');
    expect(afterPack).toContain("PASEO_DESKTOP_UNSIGNED_SMOKE");
    expect(afterPack).toContain("launchOnly: true");
    expect(afterPack).not.toContain("requireDesktopManagedDaemon: false");
    expect(smoke).toContain("PASEO_DESKTOP_SMOKE_MODE");
    expect(smoke).toContain("desktop-main-smoke-started");
    expect(smoke).toContain("DESKTOP_SMOKE_STOP_REQUEST");
    expect(smoke).not.toContain("requireDesktopManagedDaemon");
    expect(main).toContain('type: "desktop-main-smoke-started"');
    expect(main).toContain("DESKTOP_SMOKE_LAUNCH_ONLY_MODE");
  });

  it("does not rerun strict afterSign smoke for unsigned macOS builds", () => {
    const afterSign = readFileSync(join(packageRoot, "scripts", "after-sign.js"), "utf8");

    expect(afterSign).toContain("PASEO_DESKTOP_UNSIGNED_SMOKE");
    expect(afterSign).toContain("smokePackagedDesktopApp");
  });

  it("isolates packaged desktop smoke from the user's daemon home and port", () => {
    const smoke = readFileSync(
      join(packageRoot, "scripts", "smoke-packaged-desktop-app.js"),
      "utf8",
    );

    expect(smoke).toContain('const paseoHome = path.join(userData, "home")');
    expect(smoke).toContain("allocateLoopbackPort");
    expect(smoke).toContain("PASEO_HOME: paseoHome");
    expect(smoke).toContain("PASEO_LISTEN:");
    expect(smoke).toContain("createDefaultDaemonEnv(smokeEnv)");
    expect(smoke).toContain("launchOnly = false");
    expect(smoke).toContain('path.join(paseoHome, "daemon.log")');
    expect(smoke).not.toContain('path.join(os.homedir(), ".paseo", "daemon.log")');
  });

  // electron-builder packs production dependencies declared in package.json into
  // app.asar. Runtime code in runtime-paths.ts and bin/paseo dynamically resolves
  // these workspace packages by string, so static analysis (TypeScript, Knip) cannot
  // see the link. If a runtime-required workspace dep is dropped from
  // dependencies, the build still succeeds but ships a broken bundle. This
  // assertion is the safety net.
  it("declares all workspace packages required at runtime", () => {
    const pkg = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    const deps = pkg.dependencies ?? {};

    for (const required of ["@bytetrue/cli", "@bytetrue/server"]) {
      expect(deps[required], `${required} must be declared in dependencies`).toBe("*");
    }
  });

  it("uses fork package scope in packaged runtime entrypoints", () => {
    const files = [
      readFileSync(join(packageRoot, "bin", "paseo.cmd"), "utf8"),
      readFileSync(join(packageRoot, "src", "daemon", "cli", "entrypoints.ts"), "utf8"),
      readFileSync(join(packageRoot, "src", "daemon", "runtime-paths.ts"), "utf8"),
      readFileSync(
        join(packageRoot, "..", "server", "scripts", "supervisor-entrypoint.ts"),
        "utf8",
      ),
    ];

    for (const content of files) {
      expect(content).toContain("@bytetrue");
      expect(content).not.toContain("@getpaseo");
    }
  });
});
