import { chmodSync, createWriteStream, existsSync, mkdirSync, renameSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

type PlatformTarget = {
  artifact: string;
  binaryName: string;
};

const packageJson = require("../package.json") as { version: string };

const REPO = process.env.SSHX_REPO || "vancityAyush/sshx";
const RELEASE_TAG = process.env.SSHX_RELEASE_TAG || `sshx-v${packageJson.version}`;

function resolvePlatform(): PlatformTarget {
  const { platform, arch } = process;

  if (platform === "darwin" && arch === "x64") {
    return { artifact: "sshx-darwin-x86_64", binaryName: "sshx" };
  }

  if (platform === "darwin" && arch === "arm64") {
    return { artifact: "sshx-darwin-aarch64", binaryName: "sshx" };
  }

  if (platform === "linux" && arch === "x64") {
    return { artifact: "sshx-linux-x86_64", binaryName: "sshx" };
  }

  if (platform === "linux" && arch === "arm64") {
    return { artifact: "sshx-linux-aarch64", binaryName: "sshx" };
  }

  if (platform === "win32" && arch === "x64") {
    return { artifact: "sshx-windows-x86_64.exe", binaryName: "sshx.exe" };
  }

  throw new Error(`Unsupported platform: ${platform}/${arch}`);
}

function getCacheRoot(): string {
  if (process.platform === "win32") {
    return join(process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "sshx", "cache");
  }

  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Caches", "sshx");
  }

  return join(process.env.XDG_CACHE_HOME || join(homedir(), ".cache"), "sshx");
}

function request(url: string): Promise<import("node:http").IncomingMessage> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https:") ? require("node:https") : require("node:http");
    const requestHandle = client.get(
      url,
      {
        headers: {
          "User-Agent": "sshx-bun-launcher",
        },
      },
      (response: import("node:http").IncomingMessage) => {
        const statusCode = response.statusCode || 0;

        if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
          response.resume();
          resolve(request(response.headers.location));
          return;
        }

        if (statusCode !== 200) {
          response.resume();
          reject(new Error(`Download failed with status ${statusCode} for ${url}`));
          return;
        }

        resolve(response);
      },
    );

    requestHandle.on("error", reject);
  });
}

async function downloadBinary(downloadUrl: string, targetPath: string): Promise<void> {
  mkdirSync(dirname(targetPath), { recursive: true });

  const response = await request(downloadUrl);
  const tempPath = `${targetPath}.tmp-${process.pid}`;

  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(tempPath, { mode: 0o755 });
    response.pipe(output);
    response.on("error", reject);
    output.on("error", reject);
    output.on("finish", resolve);
  });

  renameSync(tempPath, targetPath);

  if (process.platform !== "win32") {
    chmodSync(targetPath, 0o755);
  }
}

async function ensureBinary(): Promise<string> {
  const target = resolvePlatform();
  const binaryPath = join(getCacheRoot(), RELEASE_TAG, target.artifact, target.binaryName);

  if (!existsSync(binaryPath) || process.env.SSHX_FORCE_DOWNLOAD === "1") {
    const downloadUrl = `https://github.com/${REPO}/releases/download/${RELEASE_TAG}/${target.artifact}`;
    process.stderr.write(`Downloading ${RELEASE_TAG} for ${process.platform}/${process.arch}...\n`);
    await downloadBinary(downloadUrl, binaryPath);
  }

  return binaryPath;
}

async function main(): Promise<void> {
  const binaryPath = await ensureBinary();
  const result = spawnSync(binaryPath, process.argv.slice(2), { stdio: "inherit" });

  if (result.error) {
    throw result.error;
  }

  process.exit(result.status === null ? 1 : result.status);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
