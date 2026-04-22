import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { type ProviderKey, PROVIDERS, detectProviderFromRemoteUrl } from "../providers";
import { commandExists, copyToClipboard, detectPlatform, openInBrowser } from "../platform";
import { deleteKeyFiles, generateKey, keyExists, readPublicKey } from "../ssh/keygen";
import { SSH_DIR, findHostBlock, upsertHostBlock } from "../ssh/config";

export type SetupOptions = {
  provider: ProviderKey;
  email: string;
  keyName: string;
  host?: string;
  force?: boolean;
  noGitConfig?: boolean;
  noBrowser?: boolean;
  noClipboard?: boolean;
};

export type SetupResult = {
  keyName: string;
  host: string;
  publicKey: string;
  clipboardCopied: boolean;
  browserOpened: boolean;
};

export type GitContext = {
  email?: string;
  remoteUrl?: string;
  provider?: ProviderKey;
};

export async function setup(options: SetupOptions): Promise<SetupResult> {
  const host = options.host ?? PROVIDERS[options.provider].hostname;

  if (keyExists(options.keyName) && !options.force) {
    throw new Error(`Key "${options.keyName}" already exists in ~/.ssh. Use --force to overwrite.`);
  }

  if (findHostBlock(host) && !options.force) {
    throw new Error(`Host "${host}" already exists in ~/.ssh/config. Use --force to overwrite.`);
  }

  if (options.force) {
    deleteKeyFiles(options.keyName);
  }

  generateKey(options.provider, options.email, options.keyName);

  try {
    upsertHostBlock(options.provider, host, options.keyName);
  } catch (error) {
    deleteKeyFiles(options.keyName);
    throw error;
  }

  addToAgent(options.keyName);

  if (!options.noGitConfig) {
    try {
      configureGitForKey(options.keyName, host, options.email);
    } catch {
      // Non-fatal: setup should still complete if git config is unavailable.
    }
  }

  const publicKey = readPublicKey(options.keyName);
  const clipboardCopied = !options.noClipboard && copyToClipboard(publicKey);
  const browserOpened = !options.noBrowser && openInBrowser(PROVIDERS[options.provider].settingsUrl);

  return {
    keyName: options.keyName,
    host,
    publicKey,
    clipboardCopied,
    browserOpened,
  };
}

function addToAgent(keyName: string): void {
  if (!commandExists("ssh-add")) {
    return;
  }

  ensureAgent();
  const keyPath = join(SSH_DIR, keyName);
  const args = detectPlatform() === "macos" ? ["--apple-use-keychain", keyPath] : [keyPath];
  const result = spawnSync("ssh-add", args, { encoding: "utf8" });

  if (result.status !== 0) {
    spawnSync("ssh-add", [keyPath], { encoding: "utf8" });
  }
}

function ensureAgent(): void {
  if (detectPlatform() === "windows") {
    return;
  }

  if (process.env.SSH_AUTH_SOCK) {
    return;
  }

  if (!commandExists("ssh-agent")) {
    return;
  }

  const result = spawnSync("ssh-agent", ["-s"], { encoding: "utf8" });
  if (result.status !== 0) {
    return;
  }

  for (const match of (result.stdout ?? "").matchAll(/(\w+)=([^;]+);/g)) {
    process.env[match[1]] = match[2];
  }
}

function configureGitForKey(keyName: string, host: string, email: string): void {
  if (!commandExists("git")) {
    return;
  }

  const gitConfigPath = join(SSH_DIR, `.gitconfig-${keyName}`);
  writeFileSync(gitConfigPath, `[user]\n    email = ${email}\n`);

  const includeKeys = [
    `includeIf.hasconfig:remote.*.url:git@${host}:*/**.path`,
    `includeIf.hasconfig:remote.*.url:ssh://git@${host}/**.path`,
  ];

  for (const includeKey of includeKeys) {
    spawnSync("git", ["config", "--global", includeKey, gitConfigPath], { encoding: "utf8" });
  }
}

function readGitConfigValue(key: string): string | undefined {
  if (!commandExists("git")) {
    return undefined;
  }

  const localResult = spawnSync("git", ["config", key], { encoding: "utf8" });
  if (localResult.status === 0 && localResult.stdout.trim()) {
    return localResult.stdout.trim();
  }

  const globalResult = spawnSync("git", ["config", "--global", key], { encoding: "utf8" });
  if (globalResult.status === 0 && globalResult.stdout.trim()) {
    return globalResult.stdout.trim();
  }

  return undefined;
}

export function readGitContext(): GitContext {
  if (!commandExists("git")) {
    return {};
  }

  const remoteResult = spawnSync("git", ["remote", "get-url", "origin"], { encoding: "utf8" });
  const remoteUrl = remoteResult.status === 0 ? remoteResult.stdout.trim() : undefined;

  return {
    email: readGitConfigValue("user.email"),
    remoteUrl,
    provider: remoteUrl ? detectProviderFromRemoteUrl(remoteUrl) : undefined,
  };
}
