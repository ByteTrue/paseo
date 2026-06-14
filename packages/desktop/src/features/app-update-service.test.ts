import { describe, expect, it } from "vitest";

import {
  createAppUpdateService,
  type AppUpdateManualInstaller,
  type AppUpdateRuntime,
  type AppUpdateRuntimeConfiguration,
  type RuntimeUpdateInfo,
} from "./app-update-service";

class FakeAppUpdateRuntime implements AppUpdateRuntime {
  private checks: Array<{ isUpdateAvailable: boolean; updateInfo: RuntimeUpdateInfo } | null> = [];
  private gate: ((info: RuntimeUpdateInfo) => boolean | Promise<boolean>) | null = null;
  readonly configurations: AppUpdateRuntimeConfiguration[] = [];

  configure(input: AppUpdateRuntimeConfiguration): void {
    this.gate = input.shouldAdmitUpdate;
    this.configurations.push(input);
  }

  nextCheck(result: { isUpdateAvailable: boolean; updateInfo: RuntimeUpdateInfo } | null): void {
    this.checks.push(result);
  }

  async checkForUpdates(): Promise<{
    isUpdateAvailable: boolean;
    updateInfo: RuntimeUpdateInfo;
  } | null> {
    const result = this.checks.shift() ?? null;
    if (!result || !this.gate) return result;
    const admitted = await this.gate(result.updateInfo);
    return { ...result, isUpdateAvailable: result.isUpdateAvailable && admitted };
  }

  async downloadUpdate(): Promise<void> {}

  quitAndInstall(): void {}
}

class FakeManualInstaller implements AppUpdateManualInstaller {
  readonly installed: RuntimeUpdateInfo[] = [];
  beforeQuitCalls = 0;

  async install(info: RuntimeUpdateInfo, onBeforeQuit?: () => Promise<void>): Promise<void> {
    this.installed.push(info);
    if (onBeforeQuit) {
      await onBeforeQuit();
      this.beforeQuitCalls += 1;
    }
  }
}

function createService(input?: {
  now?: () => number;
  bucket?: () => Promise<number>;
  manualInstaller?: AppUpdateManualInstaller;
}) {
  const runtime = new FakeAppUpdateRuntime();
  const service = createAppUpdateService({
    runtime,
    manualInstaller: input?.manualInstaller,
    isPackaged: () => true,
    now: input?.now ?? (() => Date.parse("2026-04-28T12:00:00.000Z")),
    bucket: input?.bucket ?? (async () => 0.99),
  });
  return { runtime, service };
}

const rolledOutUpdate = {
  version: "1.2.4",
  releaseDate: "2026-04-28T00:00:00.000Z",
  rolloutHours: 24,
};

describe("app update service", () => {
  it("does not expose automatic stable updates before the user is admitted to rollout", async () => {
    const { runtime, service } = createService();
    runtime.nextCheck({ isUpdateAvailable: true, updateInfo: rolledOutUpdate });

    const result = await service.checkForAppUpdate({
      currentVersion: "1.2.3",
      releaseChannel: "stable",
      intent: "automatic",
    });

    expect(result).toEqual({
      hasUpdate: false,
      readyToInstall: false,
      currentVersion: "1.2.3",
      latestVersion: "1.2.3",
      body: null,
      date: null,
    });
  });

  it("exposes manual stable updates even before the user is admitted to rollout", async () => {
    const { runtime, service } = createService();
    runtime.nextCheck({ isUpdateAvailable: true, updateInfo: rolledOutUpdate });

    const result = await service.checkForAppUpdate({
      currentVersion: "1.2.3",
      releaseChannel: "stable",
      intent: "manual",
    });

    expect(result).toEqual({
      hasUpdate: true,
      readyToInstall: false,
      currentVersion: "1.2.3",
      latestVersion: "1.2.4",
      body: null,
      date: "2026-04-28T00:00:00.000Z",
    });
  });

  it("trusts the runtime availability decision before comparing versions", async () => {
    const { runtime, service } = createService({ bucket: async () => 0 });
    runtime.nextCheck({ isUpdateAvailable: false, updateInfo: rolledOutUpdate });

    const result = await service.checkForAppUpdate({
      currentVersion: "1.2.3",
      releaseChannel: "stable",
      intent: "manual",
    });

    expect(result).toEqual({
      hasUpdate: false,
      readyToInstall: false,
      currentVersion: "1.2.3",
      latestVersion: "1.2.3",
      body: null,
      date: null,
    });
  });

  it("makes checked manual installer updates immediately installable without auto-download", async () => {
    const manualInstaller = new FakeManualInstaller();
    const { runtime, service } = createService({ manualInstaller });
    runtime.nextCheck({ isUpdateAvailable: true, updateInfo: rolledOutUpdate });

    const result = await service.checkForAppUpdate({
      currentVersion: "1.2.3",
      releaseChannel: "stable",
      intent: "manual",
    });

    expect(result).toEqual({
      hasUpdate: true,
      readyToInstall: true,
      currentVersion: "1.2.3",
      latestVersion: "1.2.4",
      body: null,
      date: "2026-04-28T00:00:00.000Z",
    });
    expect(runtime.configurations.at(-1)?.autoDownload).toBe(false);
  });

  it("opens the manual installer and runs quit preparation", async () => {
    const manualInstaller = new FakeManualInstaller();
    const { runtime, service } = createService({ manualInstaller });
    runtime.nextCheck({ isUpdateAvailable: true, updateInfo: rolledOutUpdate });
    await service.checkForAppUpdate({
      currentVersion: "1.2.3",
      releaseChannel: "stable",
      intent: "manual",
    });

    let beforeQuitCalls = 0;
    const result = await service.downloadAndInstallUpdate(
      { currentVersion: "1.2.3", releaseChannel: "stable" },
      async () => {
        beforeQuitCalls += 1;
      },
    );

    expect(result).toEqual({
      installed: true,
      version: "1.2.4",
      message: "Installer opened. Drag Paseo into Applications to finish updating.",
    });
    expect(manualInstaller.installed).toEqual([rolledOutUpdate]);
    expect(manualInstaller.beforeQuitCalls).toBe(1);
    expect(beforeQuitCalls).toBe(1);
    expect(runtime.configurations.at(-1)?.autoDownload).toBe(false);
  });
});
