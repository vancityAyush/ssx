import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join, normalize } from "node:path"
import { type ProviderKey, PROVIDERS } from "../providers.js"

export const SSH_DIR = join(homedir(), ".ssh")
export const SSH_CONFIG_PATH = join(SSH_DIR, "config")
const SSHX_MARKER = "# sshx"

export type ConfigSegment =
  | { kind: "text"; lines: string[] }
  | { kind: "host"; host: string; lines: string[]; managed: boolean }

export function parseConfigSegments(content: string): ConfigSegment[] {
  const normalized = content.replace(/\r\n/g, "\n")
  if (!normalized.trim()) return []

  const lines = normalized.split("\n")
  const segments: ConfigSegment[] = []
  let textLines: string[] = []
  let hostLines: string[] | null = null
  let hostName = ""
  let hostManaged = false

  const flushText = () => {
    if (textLines.length > 0) {
      segments.push({ kind: "text", lines: [...textLines] })
      textLines = []
    }
  }
  const flushHost = () => {
    if (hostLines !== null) {
      segments.push({ kind: "host", host: hostName, lines: [...hostLines], managed: hostManaged })
      hostLines = null
    }
  }

  for (const line of lines) {
    const isHostStart = /^Host\s+/.test(line) && !/^\s/.test(line)
    if (isHostStart) {
      flushText()
      flushHost()
      hostName = line.replace(/^Host\s+/, "").replace(/\s*#.*$/, "").trim()
      hostManaged = line.includes(SSHX_MARKER)
      hostLines = [line]
      continue
    }
    if (hostLines !== null) {
      hostLines.push(line)
    } else {
      textLines.push(line)
    }
  }
  flushText()
  flushHost()
  return segments
}

export function serializeConfigSegments(segments: ConfigSegment[]): string {
  const blocks = segments
    .map(s => s.lines.join("\n").trimEnd())
    .filter(b => b.length > 0)
  if (blocks.length === 0) return ""
  return `${blocks.join("\n\n")}\n`
}

export function readConfigSegments(): ConfigSegment[] {
  if (!existsSync(SSH_CONFIG_PATH)) return []
  return parseConfigSegments(readFileSync(SSH_CONFIG_PATH, "utf8"))
}

export function writeConfigSegments(segments: ConfigSegment[]): void {
  mkdirSync(SSH_DIR, { recursive: true })
  writeFileSync(SSH_CONFIG_PATH, serializeConfigSegments(segments))
}

export function extractIdentityFiles(lines: string[]): string[] {
  return lines
    .map(l => l.match(/^\s*IdentityFile\s+(.+)$/)?.[1]?.trim())
    .filter((v): v is string => Boolean(v))
    .map(v => v.replace(/^"(.*)"$/, "$1"))
}

export function extractHostName(lines: string[]): string {
  const match = lines
    .map(l => l.match(/^\s*HostName\s+(.+)$/))
    .find(Boolean)
  return match?.[1]?.trim() ?? ""
}

export function expandHomePath(p: string): string {
  if (p === "~") return homedir()
  if (p.startsWith("~/")) return join(homedir(), p.slice(2))
  return p
}

export function normalizePath(p: string): string {
  return normalize(expandHomePath(p)).replace(/\\/g, "/")
}

export function buildHostBlock(
  provider: ProviderKey,
  host: string,
  keyName: string,
): string[] {
  const lines = [
    `Host ${host}  ${SSHX_MARKER}`,
    `  HostName ${PROVIDERS[provider].hostname}`,
    `  User git`,
    `  AddKeysToAgent yes`,
    `  IdentityFile ~/.ssh/${keyName}`,
    `  IdentitiesOnly yes`,
  ]
  if (provider === "azure") {
    lines.push("  HostkeyAlgorithms +ssh-rsa")
    lines.push("  PubkeyAcceptedAlgorithms +ssh-rsa")
  }
  return lines
}

export function upsertHostBlock(
  provider: ProviderKey,
  host: string,
  keyName: string,
): "added" | "replaced" {
  const segments = readConfigSegments()
  const block: ConfigSegment = {
    kind: "host",
    host,
    lines: buildHostBlock(provider, host, keyName),
    managed: true,
  }
  let replaced = false
  const next = segments.map(s => {
    if (s.kind === "host" && s.host === host) {
      replaced = true
      return block
    }
    return s
  })
  if (!replaced) next.push(block)
  writeConfigSegments(next)
  return replaced ? "replaced" : "added"
}

export function removeManagedHostBlocksForKey(keyName: string): string[] {
  const variants = new Set([
    normalizePath(join(SSH_DIR, keyName)),
    normalizePath(`~/.ssh/${keyName}`),
    normalizePath(keyName),
  ])
  const removed: string[] = []
  const next = readConfigSegments().filter(s => {
    if (s.kind !== "host" || !s.managed) return true
    const matched = extractIdentityFiles(s.lines)
      .some(f => variants.has(normalizePath(f)))
    if (matched) {
      removed.push(s.host)
      return false
    }
    return true
  })
  writeConfigSegments(next)
  return removed
}

export function listManagedHostBlocks(): Array<{
  host: string
  identityFiles: string[]
  hostname: string
}> {
  return readConfigSegments()
    .filter((s): s is Extract<ConfigSegment, { kind: "host" }> =>
      s.kind === "host" && s.managed)
    .map(s => ({
      host: s.host,
      identityFiles: extractIdentityFiles(s.lines),
      hostname: extractHostName(s.lines),
    }))
}
