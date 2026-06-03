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
