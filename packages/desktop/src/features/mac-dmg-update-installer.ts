import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { app, net, shell } from "electron";
import type { AppUpdateManualInstaller, RuntimeUpdateInfo } from "./app-update-service.js";

const RELEASE_DOWNLOAD_BASE_URL = "https://github.com/ByteTrue/paseo/releases/download";
const QUIT_AFTER_OPEN_DELAY_MS = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeVersion(version: string): string {
  return version.replace(/^v/i, "");
}

function extractUpdateFileUrls(info: RuntimeUpdateInfo): string[] {
  const urls: string[] = [];
  if (Array.isArray(info.files)) {
    for (const file of info.files) {
      if (!isRecord(file) || typeof file.url !== "string") {
        continue;
      }
      const url = file.url.trim();
      if (url.length > 0) {
        urls.push(url);
      }
    }
  }

  if (typeof info.path === "string" && info.path.trim().length > 0) {
    urls.push(info.path.trim());
  }

  return urls;
}

function toAbsoluteDownloadUrl(version: string, fileUrl: string): string {
  try {
    const parsed = new URL(fileUrl);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return fileUrl;
    }
  } catch {
    // Relative manifest paths are resolved against the GitHub release below.
  }

  const filename = fileUrl.split(/[\\/]/).at(-1)?.trim();
  if (!filename) {
    throw new Error("The macOS installer filename is missing from the update manifest.");
  }

  return `${RELEASE_DOWNLOAD_BASE_URL}/v${normalizeVersion(version)}/${encodeURIComponent(filename)}`;
}

export function resolveMacDmgInstallerDownloadUrl(info: RuntimeUpdateInfo): string {
  const dmgUrl = extractUpdateFileUrls(info).find((url) => url.toLowerCase().endsWith(".dmg"));
  if (!dmgUrl) {
    throw new Error("The macOS DMG installer was not listed in the update manifest.");
  }

  return toAbsoluteDownloadUrl(info.version, dmgUrl);
}

function resolveInstallerPath(downloadUrl: string): string {
  const parsed = new URL(downloadUrl);
  const filename = decodeURIComponent(path.posix.basename(parsed.pathname));
  return path.join(app.getPath("userData"), "updates", filename);
}

async function downloadInstaller(downloadUrl: string, destinationPath: string): Promise<void> {
  const response = await net.fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(`Failed to download installer: HTTP ${response.status}`);
  }

  await mkdir(path.dirname(destinationPath), { recursive: true });
  await writeFile(destinationPath, Buffer.from(await response.arrayBuffer()));
}

export function createMacDmgUpdateInstaller(): AppUpdateManualInstaller {
  return {
    async install(info, onBeforeQuit) {
      const downloadUrl = resolveMacDmgInstallerDownloadUrl(info);
      const installerPath = resolveInstallerPath(downloadUrl);
      await downloadInstaller(downloadUrl, installerPath);

      const openError = await shell.openPath(installerPath);
      if (openError) {
        throw new Error(openError);
      }

      if (onBeforeQuit) {
        await onBeforeQuit();
      }

      setTimeout(() => {
        app.quit();
      }, QUIT_AFTER_OPEN_DELAY_MS);
    },
  };
}
