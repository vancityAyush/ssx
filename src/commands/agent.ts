import { join } from "node:path"
import { spawnSync } from "node:child_process"
import { SSH_DIR } from "../ssh/config.js"
import { detectPlatform } from "../platform.js"

export type AgentKey = {
  fingerprint: string
  path: string
  type: string
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

function requireSshAdd(): void {
  if (spawnSync("which", ["ssh-add"], { stdio: "ignore" }).status !== 0) {
    throw new Error("ssh-add is required but not found on PATH.")
  }
}

export async function agentList(): Promise<AgentKey[]> {
  requireSshAdd()
  ensureAgent()
  const r = spawnSync("ssh-add", ["-l"], { encoding: "utf8" })
  if (r.status === 1 && r.stdout.trim() === "The agent has no identities.") return []
  if (r.status !== 0) throw new Error(r.stderr.trim() || "ssh-add -l failed.")
  return r.stdout
    .split("\n")
    .filter(Boolean)
    .map(line => {
      const parts = line.split(" ")
      return {
        fingerprint: parts[1] ?? "",
        path: parts[2] ?? "",
        type: parts[3] ?? "",
      }
    })
}

export async function agentAdd(keyName: string): Promise<void> {
  requireSshAdd()
  ensureAgent()
  const keyPath = join(SSH_DIR, keyName)
  const platform = detectPlatform()
  const args = platform === "macos" ? ["--apple-use-keychain", keyPath] : [keyPath]
  const r = spawnSync("ssh-add", args, { encoding: "utf8" })
  if (r.status !== 0) {
    const fallback = spawnSync("ssh-add", [keyPath], { encoding: "utf8" })
    if (fallback.status !== 0) {
      throw new Error(fallback.stderr.trim() || "ssh-add failed.")
    }
  }
}

export async function agentRemove(keyName: string): Promise<void> {
  requireSshAdd()
  ensureAgent()
  const keyPath = join(SSH_DIR, keyName)
  spawnSync("ssh-add", ["-d", keyPath], { encoding: "utf8" })
}
