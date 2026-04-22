import { join } from "node:path"
import { writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { type ProviderKey, PROVIDERS } from "../providers.js"
import {
  upsertHostBlock,
  SSH_DIR,
} from "../ssh/config.js"
import { generateKey, readPublicKey, keyExists, deleteKeyFiles } from "../ssh/keygen.js"
import { copyToClipboard, openInBrowser, detectPlatform } from "../platform.js"

export type SetupOptions = {
  provider: ProviderKey
  email: string
  keyName: string
  host?: string
  force?: boolean
  noGitConfig?: boolean
  noBrowser?: boolean
  noClipboard?: boolean
}

export type SetupResult = {
  keyName: string
  host: string
  publicKey: string
  clipboardCopied: boolean
  browserOpened: boolean
}

export async function setup(opts: SetupOptions): Promise<SetupResult> {
  const host = opts.host ?? PROVIDERS[opts.provider].hostname
  const keyName = opts.keyName

  if (keyExists(keyName) && !opts.force) {
    throw new Error(
      `Key "${keyName}" already exists in ~/.ssh. Use --force to overwrite.`
    )
  }

  generateKey(opts.provider, opts.email, keyName)

  try {
    upsertHostBlock(opts.provider, host, keyName)
  } catch (err) {
    deleteKeyFiles(keyName)
    throw err
  }

  addToAgent(keyName)

  if (!opts.noGitConfig) {
    try {
      configureGitForKey(keyName, host, opts.email)
    } catch {}
  }

  const publicKey = readPublicKey(keyName)
  const clipboardCopied = !opts.noClipboard && copyToClipboard(publicKey)
  const browserOpened = !opts.noBrowser && openInBrowser(PROVIDERS[opts.provider].settingsUrl)

  return { keyName, host, publicKey, clipboardCopied, browserOpened }
}

function addToAgent(keyName: string): void {
  const keyPath = join(SSH_DIR, keyName)
  if (spawnSync("which", ["ssh-add"], { stdio: "ignore" }).status !== 0) return
  ensureAgent()
  const platform = detectPlatform()
  const args = platform === "macos" ? ["--apple-use-keychain", keyPath] : [keyPath]
  const r = spawnSync("ssh-add", args, { encoding: "utf8" })
  if (r.status !== 0) {
    spawnSync("ssh-add", [keyPath], { encoding: "utf8" })
  }
}

function ensureAgent(): void {
  if (detectPlatform() === "windows") return
  if (process.env.SSH_AUTH_SOCK) return
  const r = spawnSync("ssh-agent", ["-s"], { encoding: "utf8" })
  if (r.status !== 0) return
  for (const match of (r.stdout ?? "").matchAll(/(\w+)=([^;]+);/g)) {
    process.env[match[1]] = match[2]
  }
}

function configureGitForKey(keyName: string, host: string, email: string): void {
  if (spawnSync("which", ["git"], { stdio: "ignore" }).status !== 0) return
  const gitConfigPath = join(SSH_DIR, `.gitconfig-${keyName}`)
  writeFileSync(gitConfigPath, `[user]\n    email = ${email}\n`)
  const keys = [
    `includeIf."hasconfig:remote.*.url:git@${host}:*/**".path`,
    `includeIf."hasconfig:remote.*.url:ssh://git@${host}/**".path`,
  ]
  for (const key of keys) {
    spawnSync("git", ["config", "--global", key, gitConfigPath], { encoding: "utf8" })
  }
}

export function readGitContext(): { email?: string; remoteUrl?: string } {
  if (spawnSync("which", ["git"], { stdio: "ignore" }).status !== 0) return {}
  const email = spawnSync("git", ["config", "--global", "user.email"], { encoding: "utf8" })
  const remote = spawnSync("git", ["remote", "get-url", "origin"], { encoding: "utf8" })
  return {
    email: email.status === 0 ? email.stdout.trim() : undefined,
    remoteUrl: remote.status === 0 ? remote.stdout.trim() : undefined,
  }
}
