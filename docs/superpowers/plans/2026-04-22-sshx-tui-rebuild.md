# sshx TUI Rebuild — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild sshx from scratch as a hybrid TUI/flag CLI using `@vancityayush/tui`, with pure command modules and a React screen router.

**Architecture:** Command functions in `src/commands/` are pure async (no UI deps). TUI in `src/tui/` calls them. `src/cli.ts` routes: known command + args → headless, no args → `render(<App />)`. Managed SSH config blocks carry a `# sshx` marker for tracking.

**Tech Stack:** TypeScript + React JSX, `@vancityayush/tui`, Bun runtime, `bun test` for unit tests, `bun build` for bundling.

---

## File Map

| File | Responsibility |
|------|---------------|
| `src/providers.ts` | `ProviderKey` type + `PROVIDERS` record |
| `src/platform.ts` | OS detection, clipboard copy, browser open |
| `src/ssh/config.ts` | Parse/serialize/read/write `~/.ssh/config`; managed-marker detection |
| `src/ssh/config.test.ts` | Unit tests for config parsing (pure functions) |
| `src/ssh/keygen.ts` | Shell out to `ssh-keygen`, read pubkey |
| `src/commands/list.ts` | Return `ManagedKey[]` from SSH config |
| `src/commands/setup.ts` | Generate key + write config + agent + clipboard + browser |
| `src/commands/remove.ts` | Delete key files + remove config entry + agent |
| `src/commands/test.ts` | Run `ssh -T` and return result |
| `src/commands/agent.ts` | List/add/remove keys in ssh-agent |
| `src/commands/copy.ts` | Copy a managed key's pubkey to clipboard |
| `src/tui/components/Header.tsx` | Shared title bar |
| `src/tui/screens/MainMenu.tsx` | `CustomSelect` main menu |
| `src/tui/screens/Setup.tsx` | 4-step wizard: provider → email → key name → generate |
| `src/tui/screens/KeyList.tsx` | List with copy/remove per key |
| `src/tui/screens/TestConnection.tsx` | Provider select + run `ssh -T` |
| `src/tui/screens/Agent.tsx` | Show agent keys + add/remove |
| `src/tui/App.tsx` | `currentScreen` state router |
| `src/cli.ts` | Entry point: arg parsing → headless or TUI |

---

## Task 1: Scaffold — clean slate, deps, config

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`
- Delete: `src/cli.ts` (replaced in Task 20)

- [ ] **Step 1: Delete all existing src files**

```bash
rm -rf src/
mkdir -p src/commands src/ssh src/tui/screens src/tui/components
```

- [ ] **Step 2: Install dependencies**

```bash
# If @vancityayush/tui is published to npm:
bun add @vancityayush/tui react

# If not yet published — clone it, build it, then:
# bun add file:/path/to/tui react

bun add -d @types/react
```

- [ ] **Step 3: Update `package.json`** — add `react` to deps, update scripts

Replace `package.json` content:

```json
{
  "name": "@vancityayush/sshx",
  "version": "0.4.0",
  "description": "Cross-platform SSH key manager for Git providers, implemented in TypeScript",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/vancityAyush/sshx.git"
  },
  "homepage": "https://github.com/vancityAyush/sshx#readme",
  "bugs": {
    "url": "https://github.com/vancityAyush/sshx/issues"
  },
  "packageManager": "bun@1.3.10",
  "bin": {
    "sshx": "bin/sshx"
  },
  "scripts": {
    "build": "bun build ./src/cli.ts --target=node --format=cjs --outfile ./dist/cli.js",
    "typecheck": "bunx tsc --noEmit --project tsconfig.json",
    "test": "bun test"
  },
  "files": [
    "bin/",
    "dist/",
    "README.md",
    "scripts/ssh.sh",
    "scripts/ssh.ps1"
  ],
  "engines": {
    "node": ">=18"
  },
  "keywords": [
    "ssh", "git", "github", "gitlab", "bitbucket", "azure-devops", "cli", "typescript"
  ],
  "dependencies": {
    "@vancityayush/tui": "*",
    "react": "^18"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "@types/react": "^18",
    "typescript": "^5.9.3"
  }
}
```

- [ ] **Step 4: Update `tsconfig.json`** — add JSX support

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "outDir": "dist",
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

- [ ] **Step 5: Verify bun can resolve deps**

```bash
bun install
```

Expected: no errors, `node_modules/@vancityayush/tui` exists.

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json bun.lock
git commit -m "chore: scaffold TUI rebuild — update deps and tsconfig for JSX"
```

---

## Task 2: `src/providers.ts` — provider map and shared types

**Files:**
- Create: `src/providers.ts`

- [ ] **Step 1: Write the file**

```typescript
export type ProviderKey = "bitbucket" | "github" | "gitlab" | "azure"

export type Provider = {
  label: string
  hostname: string
  settingsUrl: string
  keyType: "ed25519" | "rsa"
}

export const PROVIDERS: Record<ProviderKey, Provider> = {
  github: {
    label: "GitHub",
    hostname: "github.com",
    settingsUrl: "https://github.com/settings/keys",
    keyType: "ed25519",
  },
  gitlab: {
    label: "GitLab",
    hostname: "gitlab.com",
    settingsUrl: "https://gitlab.com/-/profile/keys",
    keyType: "ed25519",
  },
  bitbucket: {
    label: "Bitbucket",
    hostname: "bitbucket.org",
    settingsUrl: "https://bitbucket.org/account/settings/ssh-keys/",
    keyType: "ed25519",
  },
  azure: {
    label: "Azure DevOps",
    hostname: "ssh.dev.azure.com",
    settingsUrl: "https://dev.azure.com/_usersSettings/keys",
    keyType: "rsa",
  },
}

export const PROVIDER_KEYS = Object.keys(PROVIDERS) as ProviderKey[]

export function detectProviderFromHostname(hostname: string): ProviderKey | undefined {
  for (const [key, provider] of Object.entries(PROVIDERS) as [ProviderKey, Provider][]) {
    if (hostname.includes(provider.hostname)) return key
  }
  return undefined
}

export function detectProviderFromRemoteUrl(url: string): ProviderKey | undefined {
  if (url.includes("github.com")) return "github"
  if (url.includes("gitlab.com")) return "gitlab"
  if (url.includes("bitbucket.org")) return "bitbucket"
  if (url.includes("dev.azure.com") || url.includes("vs-ssh.visualstudio.com")) return "azure"
  return undefined
}

export function normalizeProviderKey(value: string): ProviderKey | undefined {
  const v = value.trim().toLowerCase()
  if (v === "github" || v === "gh") return "github"
  if (v === "gitlab" || v === "gl") return "gitlab"
  if (v === "bitbucket" || v === "bb") return "bitbucket"
  if (v === "azure" || v === "azure-devops" || v === "azuredevops") return "azure"
  return undefined
}
```

- [ ] **Step 2: Typecheck**

```bash
bunx tsc --noEmit --project tsconfig.json
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/providers.ts
git commit -m "feat: add providers map and shared types"
```

---

## Task 3: `src/platform.ts` — OS detection, clipboard, browser

**Files:**
- Create: `src/platform.ts`

- [ ] **Step 1: Write the file**

```typescript
import { existsSync, readFileSync } from "node:fs"
import { spawnSync } from "node:child_process"

export type Platform = "macos" | "linux" | "windows" | "wsl"

export function detectPlatform(): Platform {
  if (process.platform === "win32") return "windows"
  if (process.platform === "darwin") return "macos"
  try {
    const v = readFileSync("/proc/version", "utf8")
    if (v.includes("Microsoft")) return "wsl"
  } catch {}
  return "linux"
}

function commandExists(cmd: string): boolean {
  const lookup = process.platform === "win32" ? "where" : "which"
  return spawnSync(lookup, [cmd], { stdio: "ignore" }).status === 0
}

function tryCopy(text: string, command: string, args: string[] = []): boolean {
  if (!commandExists(command)) return false
  return spawnSync(command, args, { input: text, encoding: "utf8" }).status === 0
}

export function copyToClipboard(text: string): boolean {
  const platform = detectPlatform()
  if (platform === "macos") return tryCopy(text, "pbcopy")
  if (platform === "windows") return tryCopy(text, "clip.exe") || tryCopy(text, "clip")
  if (platform === "wsl") {
    return tryCopy(text, "clip.exe") ||
      tryCopy(text, "xclip", ["-selection", "clipboard"]) ||
      tryCopy(text, "xsel", ["--clipboard", "--input"])
  }
  return tryCopy(text, "xclip", ["-selection", "clipboard"]) ||
    tryCopy(text, "xsel", ["--clipboard", "--input"])
}

function tryOpen(command: string, args: string[]): boolean {
  if (!commandExists(command)) return false
  return spawnSync(command, args, { stdio: "ignore" }).status === 0
}

export function openInBrowser(url: string): boolean {
  const platform = detectPlatform()
  if (platform === "macos") return tryOpen("open", [url])
  if (platform === "windows") {
    return tryOpen("cmd", ["/c", "start", "", url]) ||
      tryOpen("powershell", ["-NoProfile", "-Command", "Start-Process", url])
  }
  return tryOpen("xdg-open", [url])
}
```

- [ ] **Step 2: Typecheck**

```bash
bunx tsc --noEmit --project tsconfig.json
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/platform.ts
git commit -m "feat: add platform utilities (clipboard, browser open, OS detect)"
```

---

## Task 4: `src/ssh/config.ts` — SSH config parser/writer

**Files:**
- Create: `src/ssh/config.ts`

- [ ] **Step 1: Write the file**

```typescript
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join, normalize } from "node:path"
import { type ProviderKey, PROVIDERS, detectProviderFromHostname } from "../providers.js"

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
```

- [ ] **Step 2: Typecheck**

```bash
bunx tsc --noEmit --project tsconfig.json
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/ssh/config.ts
git commit -m "feat: add SSH config parser/writer with managed-marker support"
```

---

## Task 5: `src/ssh/config.test.ts` — unit tests for config parsing

**Files:**
- Create: `src/ssh/config.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from "bun:test"
import {
  parseConfigSegments,
  serializeConfigSegments,
  extractIdentityFiles,
  extractHostName,
} from "./config.js"

describe("parseConfigSegments", () => {
  it("returns empty array for empty input", () => {
    expect(parseConfigSegments("")).toEqual([])
    expect(parseConfigSegments("   \n  ")).toEqual([])
  })

  it("parses a single unmanaged host block", () => {
    const input = `Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519`
    const result = parseConfigSegments(input)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ kind: "host", host: "github.com", managed: false })
  })

  it("parses a managed host block with # sshx marker", () => {
    const input = `Host github.com  # sshx
  HostName github.com
  User git`
    const result = parseConfigSegments(input)
    expect(result[0]).toMatchObject({ kind: "host", host: "github.com", managed: true })
  })

  it("strips # sshx from host name", () => {
    const input = `Host my-alias  # sshx
  HostName github.com`
    const result = parseConfigSegments(input)
    expect(result[0]).toMatchObject({ kind: "host", host: "my-alias" })
  })

  it("preserves leading text segments", () => {
    const input = `# Global SSH config
ServerAliveInterval 60

Host github.com
  User git`
    const result = parseConfigSegments(input)
    expect(result[0]).toMatchObject({ kind: "text" })
    expect(result[1]).toMatchObject({ kind: "host", host: "github.com" })
  })

  it("parses multiple host blocks", () => {
    const input = `Host github.com  # sshx
  IdentityFile ~/.ssh/id_github

Host bitbucket.org  # sshx
  IdentityFile ~/.ssh/id_bb`
    const result = parseConfigSegments(input)
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ host: "github.com", managed: true })
    expect(result[1]).toMatchObject({ host: "bitbucket.org", managed: true })
  })
})

describe("serializeConfigSegments / round-trip", () => {
  it("round-trips a config with text and host blocks", () => {
    const input = `# comment

Host github.com  # sshx
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_github`
    const segments = parseConfigSegments(input)
    const output = serializeConfigSegments(segments)
    expect(output).toContain("Host github.com  # sshx")
    expect(output).toContain("IdentityFile ~/.ssh/id_ed25519_github")
  })
})

describe("extractIdentityFiles", () => {
  it("extracts IdentityFile values from lines", () => {
    const lines = [
      "Host github.com",
      "  HostName github.com",
      "  IdentityFile ~/.ssh/id_ed25519",
      "  IdentityFile ~/.ssh/backup_key",
    ]
    expect(extractIdentityFiles(lines)).toEqual([
      "~/.ssh/id_ed25519",
      "~/.ssh/backup_key",
    ])
  })

  it("strips wrapping quotes", () => {
    const lines = [`  IdentityFile "~/.ssh/my key"`]
    expect(extractIdentityFiles(lines)).toEqual(["~/.ssh/my key"])
  })
})

describe("extractHostName", () => {
  it("extracts HostName from lines", () => {
    const lines = ["Host alias", "  HostName github.com", "  User git"]
    expect(extractHostName(lines)).toBe("github.com")
  })

  it("returns empty string when no HostName", () => {
    expect(extractHostName(["Host github.com"])).toBe("")
  })
})
```

- [ ] **Step 2: Run tests, expect them to fail (import path issue or missing exports)**

```bash
bun test src/ssh/config.test.ts
```

Expected: PASS (the functions are already written correctly) or fail with import errors.

- [ ] **Step 3: Fix any import path issues if needed**

If tests fail with `Cannot find module './config.js'`, update imports to `"./config"` (Bun resolves `.ts` without extension in test mode):

```typescript
import { parseConfigSegments, serializeConfigSegments, extractIdentityFiles, extractHostName } from "./config"
```

- [ ] **Step 4: Run tests, expect all to pass**

```bash
bun test src/ssh/config.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ssh/config.test.ts
git commit -m "test: add unit tests for SSH config parsing"
```

---

## Task 6: `src/ssh/keygen.ts` — ssh-keygen wrapper

**Files:**
- Create: `src/ssh/keygen.ts`

- [ ] **Step 1: Write the file**

```typescript
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
import { type ProviderKey, PROVIDERS } from "../providers.js"
import { SSH_DIR } from "./config.js"

export function generateKey(provider: ProviderKey, email: string, keyName: string): void {
  const keyPath = join(SSH_DIR, keyName)

  if (!isCommandAvailable("ssh-keygen")) {
    throw new Error("ssh-keygen is required but not found on PATH.")
  }

  const args =
    PROVIDERS[provider].keyType === "rsa"
      ? ["-t", "rsa", "-b", "4096", "-C", email, "-f", keyPath, "-N", ""]
      : ["-t", "ed25519", "-C", email, "-f", keyPath, "-N", ""]

  const result = spawnSync("ssh-keygen", args, { stdio: "inherit", encoding: "utf8" })
  if (result.error) throw result.error
  if ((result.status ?? 1) !== 0) throw new Error("ssh-keygen failed.")
}

export function readPublicKey(keyName: string): string {
  const pubPath = join(SSH_DIR, `${keyName}.pub`)
  if (!existsSync(pubPath)) throw new Error(`Public key not found: ${pubPath}`)
  return readFileSync(pubPath, "utf8").trim()
}

export function keyExists(keyName: string): boolean {
  return existsSync(join(SSH_DIR, keyName))
}

export function deleteKeyFiles(keyName: string): void {
  const base = join(SSH_DIR, keyName)
  const { unlinkSync } = require("node:fs") as typeof import("node:fs")
  try { unlinkSync(base) } catch {}
  try { unlinkSync(`${base}.pub`) } catch {}
}

function isCommandAvailable(cmd: string): boolean {
  const lookup = process.platform === "win32" ? "where" : "which"
  return spawnSync(lookup, [cmd], { stdio: "ignore" }).status === 0
}
```

- [ ] **Step 2: Fix the `require` — use static import instead**

Replace the `deleteKeyFiles` function with:

```typescript
import { existsSync, readFileSync, unlinkSync } from "node:fs"

export function deleteKeyFiles(keyName: string): void {
  const base = join(SSH_DIR, keyName)
  try { unlinkSync(base) } catch {}
  try { unlinkSync(`${base}.pub`) } catch {}
}
```

(Update the imports at the top of the file to include `unlinkSync`.)

Full corrected `src/ssh/keygen.ts`:

```typescript
import { existsSync, readFileSync, unlinkSync } from "node:fs"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
import { type ProviderKey, PROVIDERS } from "../providers.js"
import { SSH_DIR } from "./config.js"

export function generateKey(provider: ProviderKey, email: string, keyName: string): void {
  const keyPath = join(SSH_DIR, keyName)
  if (!isCommandAvailable("ssh-keygen")) {
    throw new Error("ssh-keygen is required but not found on PATH.")
  }
  const args =
    PROVIDERS[provider].keyType === "rsa"
      ? ["-t", "rsa", "-b", "4096", "-C", email, "-f", keyPath, "-N", ""]
      : ["-t", "ed25519", "-C", email, "-f", keyPath, "-N", ""]
  const result = spawnSync("ssh-keygen", args, { stdio: "inherit", encoding: "utf8" })
  if (result.error) throw result.error
  if ((result.status ?? 1) !== 0) throw new Error("ssh-keygen failed.")
}

export function readPublicKey(keyName: string): string {
  const pubPath = join(SSH_DIR, `${keyName}.pub`)
  if (!existsSync(pubPath)) throw new Error(`Public key not found: ${pubPath}`)
  return readFileSync(pubPath, "utf8").trim()
}

export function keyExists(keyName: string): boolean {
  return existsSync(join(SSH_DIR, keyName))
}

export function deleteKeyFiles(keyName: string): void {
  const base = join(SSH_DIR, keyName)
  try { unlinkSync(base) } catch {}
  try { unlinkSync(`${base}.pub`) } catch {}
}

function isCommandAvailable(cmd: string): boolean {
  const lookup = process.platform === "win32" ? "where" : "which"
  return spawnSync(lookup, [cmd], { stdio: "ignore" }).status === 0
}
```

- [ ] **Step 3: Typecheck**

```bash
bunx tsc --noEmit --project tsconfig.json
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/ssh/keygen.ts
git commit -m "feat: add ssh-keygen wrapper (generate, read pubkey, delete key files)"
```

---

## Task 7: `src/commands/list.ts` — list managed keys

**Files:**
- Create: `src/commands/list.ts`

- [ ] **Step 1: Write the file**

```typescript
import { existsSync } from "node:fs"
import { join } from "node:path"
import { type ProviderKey } from "../providers.js"
import {
  listManagedHostBlocks,
  SSH_DIR,
  expandHomePath,
  extractIdentityFiles,
} from "../ssh/config.js"
import { detectProviderFromHostname } from "../providers.js"

export type ManagedKey = {
  name: string
  host: string
  provider?: ProviderKey
  publicKeyPath: string
}

export async function list(): Promise<ManagedKey[]> {
  const blocks = listManagedHostBlocks()
  return blocks.map(block => {
    const identityFiles = block.identityFiles
    const raw = identityFiles[0] ?? ""
    const keyName = raw.replace(/^.*[\\/]/, "")
    const expanded = expandHomePath(raw)
    const publicKeyPath = `${expanded}.pub`
    return {
      name: keyName,
      host: block.host,
      provider: detectProviderFromHostname(block.hostname),
      publicKeyPath,
    }
  })
}
```

- [ ] **Step 2: Typecheck**

```bash
bunx tsc --noEmit --project tsconfig.json
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/commands/list.ts
git commit -m "feat: add list command — returns managed SSH keys from config"
```

---

## Task 8: `src/commands/setup.ts` — generate key + configure SSH

**Files:**
- Create: `src/commands/setup.ts`

- [ ] **Step 1: Write the file**

```typescript
import { join } from "node:path"
import { writeFileSync, unlinkSync, existsSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { homedir } from "node:os"
import { type ProviderKey, PROVIDERS } from "../providers.js"
import {
  upsertHostBlock,
  SSH_DIR,
  removeManagedHostBlocksForKey,
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

  // Generate key files
  generateKey(opts.provider, opts.email, keyName)

  // Write SSH config — rollback key files if this fails
  try {
    upsertHostBlock(opts.provider, host, keyName)
  } catch (err) {
    deleteKeyFiles(keyName)
    throw err
  }

  // Add to ssh-agent (non-fatal)
  addToAgent(keyName)

  // Configure per-host git identity (non-fatal, opt-out with noGitConfig)
  if (!opts.noGitConfig) {
    try {
      configureGitForKey(keyName, host, opts.email)
    } catch {}
  }

  const publicKey = readPublicKey(keyName)

  // Copy to clipboard (non-fatal)
  const clipboardCopied = !opts.noClipboard && copyToClipboard(publicKey)

  // Open browser (non-fatal)
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
```

- [ ] **Step 2: Typecheck**

```bash
bunx tsc --noEmit --project tsconfig.json
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/commands/setup.ts
git commit -m "feat: add setup command with rollback on config-write failure"
```

---

## Task 9: `src/commands/remove.ts` — delete key + config

**Files:**
- Create: `src/commands/remove.ts`

- [ ] **Step 1: Write the file**

```typescript
import { join } from "node:path"
import { existsSync, unlinkSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { SSH_DIR, removeManagedHostBlocksForKey } from "../ssh/config.js"
import { deleteKeyFiles } from "../ssh/keygen.js"

export async function remove(keyName: string): Promise<{ removedHosts: string[] }> {
  const keyPath = join(SSH_DIR, keyName)

  // Remove from agent (non-fatal)
  removeFromAgent(keyPath)

  // Remove managed SSH config entries
  const removedHosts = removeManagedHostBlocksForKey(keyName)

  // Delete key files
  deleteKeyFiles(keyName)

  // Remove per-host git config (non-fatal)
  removeGitConfig(keyName)

  return { removedHosts }
}

function removeFromAgent(keyPath: string): void {
  if (spawnSync("which", ["ssh-add"], { stdio: "ignore" }).status !== 0) return
  spawnSync("ssh-add", ["-d", keyPath], { encoding: "utf8" })
}

function removeGitConfig(keyName: string): void {
  const gitConfigPath = join(SSH_DIR, `.gitconfig-${keyName}`)
  try { unlinkSync(gitConfigPath) } catch {}
  if (spawnSync("which", ["git"], { stdio: "ignore" }).status !== 0) return
  const result = spawnSync(
    "git",
    ["config", "--global", "--get-regexp", "^includeIf\\..*\\.path$"],
    { encoding: "utf8" }
  )
  if (result.status !== 0) return
  const normalizedTarget = gitConfigPath.replace(/\\/g, "/")
  result.stdout
    .split("\n")
    .filter(Boolean)
    .forEach(line => {
      const sep = line.indexOf(" ")
      if (sep === -1) return
      const key = line.slice(0, sep)
      const val = line.slice(sep + 1).trim().replace(/\\/g, "/")
      if (val === normalizedTarget) {
        spawnSync("git", ["config", "--global", "--unset", key], { encoding: "utf8" })
      }
    })
}
```

- [ ] **Step 2: Typecheck**

```bash
bunx tsc --noEmit --project tsconfig.json
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/commands/remove.ts
git commit -m "feat: add remove command (key files + SSH config + git config cleanup)"
```

---

## Task 10: `src/commands/test.ts` — test SSH connection

**Files:**
- Create: `src/commands/test.ts`

- [ ] **Step 1: Write the file**

```typescript
import { spawnSync } from "node:child_process"
import { type ProviderKey, PROVIDERS } from "../providers.js"

export type TestResult = {
  success: boolean
  output: string
}

export async function testConnection(provider: ProviderKey): Promise<TestResult> {
  const hostname = PROVIDERS[provider].hostname

  if (spawnSync("which", ["ssh"], { stdio: "ignore" }).status !== 0) {
    throw new Error("ssh is required but not found on PATH.")
  }

  const result = spawnSync(
    "ssh",
    [
      "-T",
      "-o", "StrictHostKeyChecking=accept-new",
      "-o", "BatchMode=yes",
      `git@${hostname}`,
    ],
    { encoding: "utf8" }
  )

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim()
  const successPattern = /successfully authenticated|shell access is not supported|authenticated/i
  const success = result.status === 0 || result.status === 1 || successPattern.test(output)

  return { success, output }
}
```

- [ ] **Step 2: Typecheck**

```bash
bunx tsc --noEmit --project tsconfig.json
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/commands/test.ts
git commit -m "feat: add test command (ssh -T connection check)"
```

---

## Task 11: `src/commands/agent.ts` — ssh-agent management

**Files:**
- Create: `src/commands/agent.ts`

- [ ] **Step 1: Write the file**

```typescript
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
```

- [ ] **Step 2: Typecheck**

```bash
bunx tsc --noEmit --project tsconfig.json
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/commands/agent.ts
git commit -m "feat: add agent command (list/add/remove keys in ssh-agent)"
```

---

## Task 12: `src/commands/copy.ts` — copy pubkey to clipboard

**Files:**
- Create: `src/commands/copy.ts`

- [ ] **Step 1: Write the file**

```typescript
import { readPublicKey } from "../ssh/keygen.js"
import { copyToClipboard } from "../platform.js"

export async function copy(keyName: string): Promise<{ publicKey: string; copied: boolean }> {
  const publicKey = readPublicKey(keyName)
  const copied = copyToClipboard(publicKey)
  return { publicKey, copied }
}
```

- [ ] **Step 2: Typecheck**

```bash
bunx tsc --noEmit --project tsconfig.json
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/commands/copy.ts
git commit -m "feat: add copy command (copy pubkey to clipboard)"
```

---

## Task 13: `src/tui/components/Header.tsx` — shared title bar

**Files:**
- Create: `src/tui/components/Header.tsx`

- [ ] **Step 1: Write the file**

```tsx
import React from "react"
import { Box, Text } from "@vancityayush/tui"

type Props = {
  subtitle?: string
}

export function Header({ subtitle }: Props): React.ReactNode {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color="cyan">
        sshx — SSH Key Manager
      </Text>
      {subtitle && (
        <Text dimColor>{subtitle}</Text>
      )}
    </Box>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
bunx tsc --noEmit --project tsconfig.json
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/tui/components/Header.tsx
git commit -m "feat: add TUI Header component"
```

---

## Task 14: `src/tui/screens/MainMenu.tsx` — main menu

**Files:**
- Create: `src/tui/screens/MainMenu.tsx`

- [ ] **Step 1: Write the file**

```tsx
import React from "react"
import { Box, Text, CustomSelect } from "@vancityayush/tui"
import { Header } from "../components/Header.js"

export type MainMenuAction = "setup" | "key-list" | "test-connection" | "agent"

const MENU_OPTIONS = [
  { label: "Setup new key",    value: "setup",           description: "Generate an SSH key for a Git provider" },
  { label: "List / manage keys", value: "key-list",      description: "View, copy, or remove your managed SSH keys" },
  { label: "Test connection",  value: "test-connection", description: "Verify an SSH connection to a provider" },
  { label: "SSH Agent",        value: "agent",           description: "List, add, or remove keys from ssh-agent" },
] as const

type Props = {
  onSelect: (action: MainMenuAction) => void
}

export function MainMenu({ onSelect }: Props): React.ReactNode {
  return (
    <Box flexDirection="column">
      <Header subtitle="Select an action" />
      <CustomSelect
        options={MENU_OPTIONS}
        onChange={(value) => onSelect(value as MainMenuAction)}
        visibleOptionCount={4}
      />
      <Box marginTop={1}>
        <Text dimColor>q to exit</Text>
      </Box>
    </Box>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
bunx tsc --noEmit --project tsconfig.json
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/tui/screens/MainMenu.tsx
git commit -m "feat: add TUI MainMenu screen"
```

---

## Task 15: `src/tui/screens/Setup.tsx` — 4-step setup wizard

**Files:**
- Create: `src/tui/screens/Setup.tsx`

- [ ] **Step 1: Write the file**

```tsx
import React, { useState, useEffect } from "react"
import { Box, Text, TextInput, CustomSelect, Spinner, useInput } from "@vancityayush/tui"
import { Header } from "../components/Header.js"
import { PROVIDER_KEYS, PROVIDERS, type ProviderKey, detectProviderFromRemoteUrl } from "../../providers.js"
import { setup, readGitContext, type SetupOptions, type SetupResult } from "../../commands/setup.js"

type WizardStep = "provider" | "email" | "keyname" | "generate"

type Props = {
  onBack: () => void
}

const PROVIDER_OPTIONS = PROVIDER_KEYS.map(key => ({
  label: PROVIDERS[key].label,
  value: key,
  description: PROVIDERS[key].hostname,
}))

export function Setup({ onBack }: Props): React.ReactNode {
  const [step, setStep] = useState<WizardStep>("provider")
  const [provider, setProvider] = useState<ProviderKey>("github")
  const [email, setEmail] = useState("")
  const [emailCursor, setEmailCursor] = useState(0)
  const [keyName, setKeyName] = useState("")
  const [keyNameCursor, setKeyNameCursor] = useState(0)
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<SetupResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Pre-fill from git context on mount
  useEffect(() => {
    const ctx = readGitContext()
    if (ctx.email) {
      setEmail(ctx.email)
      setEmailCursor(ctx.email.length)
    }
    if (ctx.remoteUrl) {
      const detected = detectProviderFromRemoteUrl(ctx.remoteUrl)
      if (detected) setProvider(detected)
    }
  }, [])

  // Update default key name when provider changes
  useEffect(() => {
    const defaultName = `id_${PROVIDERS[provider].keyType}_${provider}`
    setKeyName(defaultName)
    setKeyNameCursor(defaultName.length)
  }, [provider])

  useInput((_input, key) => {
    if (key.escape) onBack()
  }, { isActive: step !== "generate" && !generating })

  async function runSetup(): Promise<void> {
    setGenerating(true)
    setError(null)
    const opts: SetupOptions = {
      provider,
      email,
      keyName,
    }
    try {
      const r = await setup(opts)
      setResult(r)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setGenerating(false)
      setStep("generate")
    }
  }

  if (step === "provider") {
    return (
      <Box flexDirection="column">
        <Header subtitle="Step 1 of 4 — Select provider" />
        <CustomSelect
          options={PROVIDER_OPTIONS}
          defaultValue={provider}
          onChange={(value) => {
            setProvider(value as ProviderKey)
            setStep("email")
          }}
          visibleOptionCount={4}
        />
        <Box marginTop={1}>
          <Text dimColor>Esc to go back</Text>
        </Box>
      </Box>
    )
  }

  if (step === "email") {
    return (
      <Box flexDirection="column">
        <Header subtitle="Step 2 of 4 — Enter email" />
        <Box flexDirection="row" gap={1}>
          <Text>Email:</Text>
          <TextInput
            value={email}
            onChange={setEmail}
            onSubmit={(v) => {
              if (v.trim()) setStep("keyname")
            }}
            placeholder="you@example.com"
            focus
            showCursor
            cursorOffset={emailCursor}
            onChangeCursorOffset={setEmailCursor}
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Enter to continue · Esc to go back</Text>
        </Box>
      </Box>
    )
  }

  if (step === "keyname") {
    return (
      <Box flexDirection="column">
        <Header subtitle="Step 3 of 4 — Key name" />
        <Box flexDirection="row" gap={1}>
          <Text>Key name:</Text>
          <TextInput
            value={keyName}
            onChange={setKeyName}
            onSubmit={(v) => {
              if (v.trim()) {
                setStep("generate")
                runSetup()
              }
            }}
            placeholder={`id_ed25519_${provider}`}
            focus
            showCursor
            cursorOffset={keyNameCursor}
            onChangeCursorOffset={setKeyNameCursor}
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Enter to generate key · Esc to go back</Text>
        </Box>
      </Box>
    )
  }

  // Step: generate (and result)
  if (generating) {
    return (
      <Box flexDirection="column">
        <Header subtitle="Step 4 of 4 — Generating key…" />
        <Spinner label={`Generating ${PROVIDERS[provider].keyType} key for ${PROVIDERS[provider].label}…`} />
      </Box>
    )
  }

  if (error) {
    return (
      <Box flexDirection="column">
        <Header subtitle="Setup failed" />
        <Text color="red">{error}</Text>
        <Box marginTop={1}>
          <Text dimColor>Esc to go back</Text>
        </Box>
      </Box>
    )
  }

  if (result) {
    return (
      <Box flexDirection="column">
        <Header subtitle="Setup complete!" />
        <Text color="green">Key generated: ~/.ssh/{result.keyName}</Text>
        <Text color="green">SSH config updated for {result.host}</Text>
        {result.clipboardCopied && <Text color="green">Public key copied to clipboard</Text>}
        {!result.clipboardCopied && <Text dimColor>Could not copy to clipboard — paste manually:</Text>}
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>Public key:</Text>
          <Text wrap="wrap">{result.publicKey}</Text>
        </Box>
        {result.browserOpened && <Text color="green">Opened {PROVIDERS[provider].settingsUrl}</Text>}
        <Box marginTop={1}>
          <Text dimColor>Esc to return to menu</Text>
        </Box>
      </Box>
    )
  }

  return null
}
```

- [ ] **Step 2: Typecheck**

```bash
bunx tsc --noEmit --project tsconfig.json
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/tui/screens/Setup.tsx
git commit -m "feat: add TUI Setup wizard (4-step: provider → email → key name → generate)"
```

---

## Task 16: `src/tui/screens/KeyList.tsx` — key list with copy/remove

**Files:**
- Create: `src/tui/screens/KeyList.tsx`

- [ ] **Step 1: Write the file**

```tsx
import React, { useState, useEffect } from "react"
import { Box, Text, Dialog, ListItem, useInput, Spinner } from "@vancityayush/tui"
import { Header } from "../components/Header.js"
import { list, type ManagedKey } from "../../commands/list.js"
import { remove } from "../../commands/remove.js"
import { copy } from "../../commands/copy.js"
import { PROVIDERS } from "../../providers.js"

type Props = {
  onBack: () => void
}

export function KeyList({ onBack }: Props): React.ReactNode {
  const [keys, setKeys] = useState<ManagedKey[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [dialogActive, setDialogActive] = useState(false)

  useEffect(() => {
    list().then(k => {
      setKeys(k)
      setLoading(false)
    })
  }, [])

  useInput((_input, key) => {
    if (key.escape) {
      onBack()
      return
    }
    if (key.upArrow) setSelectedIndex(i => Math.max(0, i - 1))
    if (key.downArrow) setSelectedIndex(i => Math.min(keys.length - 1, i + 1))
    if (key.return && keys[selectedIndex]) {
      handleCopy(keys[selectedIndex]!.name)
    }
    if (key.delete || (_input === "d" && !key.ctrl)) {
      if (keys[selectedIndex]) {
        setConfirmRemove(keys[selectedIndex]!.name)
        setDialogActive(true)
      }
    }
  }, { isActive: !dialogActive && !loading })

  useInput((_input, key) => {
    if (key.escape) {
      setConfirmRemove(null)
      setDialogActive(false)
    }
    if (key.return && confirmRemove) {
      handleRemove(confirmRemove)
    }
  }, { isActive: dialogActive })

  async function handleCopy(name: string): Promise<void> {
    try {
      const r = await copy(name)
      setStatus(r.copied ? `Copied ${name} public key to clipboard` : `Could not copy — key: ${r.publicKey.slice(0, 40)}…`)
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleRemove(name: string): Promise<void> {
    setConfirmRemove(null)
    setDialogActive(false)
    try {
      await remove(name)
      const updated = await list()
      setKeys(updated)
      setSelectedIndex(i => Math.min(i, updated.length - 1))
      setStatus(`Removed ${name}`)
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err))
    }
  }

  if (loading) {
    return (
      <Box flexDirection="column">
        <Header subtitle="Managed SSH keys" />
        <Spinner label="Loading keys…" />
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <Header subtitle={`${keys.length} managed key${keys.length !== 1 ? "s" : ""}`} />

      {keys.length === 0 && (
        <Text dimColor>No managed keys found. Run setup to create one.</Text>
      )}

      {keys.map((k, i) => (
        <ListItem
          key={k.name}
          isFocused={i === selectedIndex}
          isSelected={i === selectedIndex}
          description={`${k.host} · ${k.provider ? PROVIDERS[k.provider].label : "unknown provider"}`}
        >
          {k.name}
        </ListItem>
      ))}

      {status && (
        <Box marginTop={1}>
          <Text dimColor>{status}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>↑↓ navigate · Enter copy pubkey · d remove · Esc back</Text>
      </Box>

      {confirmRemove && (
        <Dialog
          title={`Remove "${confirmRemove}"?`}
          subtitle="This will delete the key files and SSH config entry."
          onCancel={() => {
            setConfirmRemove(null)
            setDialogActive(false)
          }}
        >
          <Text>Press Enter to confirm or Esc to cancel.</Text>
        </Dialog>
      )}
    </Box>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
bunx tsc --noEmit --project tsconfig.json
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/tui/screens/KeyList.tsx
git commit -m "feat: add TUI KeyList screen with copy and remove actions"
```

---

## Task 17: `src/tui/screens/TestConnection.tsx` — test connection

**Files:**
- Create: `src/tui/screens/TestConnection.tsx`

- [ ] **Step 1: Write the file**

```tsx
import React, { useState } from "react"
import { Box, Text, CustomSelect, Spinner, useInput } from "@vancityayush/tui"
import { Header } from "../components/Header.js"
import { PROVIDER_KEYS, PROVIDERS, type ProviderKey } from "../../providers.js"
import { testConnection, type TestResult } from "../../commands/test.js"

type Props = {
  onBack: () => void
}

const PROVIDER_OPTIONS = PROVIDER_KEYS.map(key => ({
  label: PROVIDERS[key].label,
  value: key,
  description: `ssh -T git@${PROVIDERS[key].hostname}`,
}))

type Phase = "select" | "testing" | "result"

export function TestConnection({ onBack }: Props): React.ReactNode {
  const [phase, setPhase] = useState<Phase>("select")
  const [provider, setProvider] = useState<ProviderKey>("github")
  const [result, setResult] = useState<TestResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useInput((_input, key) => {
    if (key.escape) {
      if (phase === "result") {
        setPhase("select")
        setResult(null)
        setError(null)
      } else {
        onBack()
      }
    }
  }, { isActive: phase !== "testing" })

  async function runTest(p: ProviderKey): Promise<void> {
    setProvider(p)
    setPhase("testing")
    setError(null)
    try {
      const r = await testConnection(p)
      setResult(r)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    setPhase("result")
  }

  if (phase === "select") {
    return (
      <Box flexDirection="column">
        <Header subtitle="Test SSH connection" />
        <Text dimColor marginBottom={1}>Select a provider to test your SSH connection.</Text>
        <CustomSelect
          options={PROVIDER_OPTIONS}
          defaultValue={provider}
          onChange={(value) => runTest(value as ProviderKey)}
          visibleOptionCount={4}
        />
        <Box marginTop={1}>
          <Text dimColor>Esc to go back</Text>
        </Box>
      </Box>
    )
  }

  if (phase === "testing") {
    return (
      <Box flexDirection="column">
        <Header subtitle="Testing connection…" />
        <Spinner label={`ssh -T git@${PROVIDERS[provider].hostname}`} />
      </Box>
    )
  }

  // Result phase
  return (
    <Box flexDirection="column">
      <Header subtitle={`Test result — ${PROVIDERS[provider].label}`} />
      {error && <Text color="red">Error: {error}</Text>}
      {result && (
        <Box flexDirection="column" gap={1}>
          <Text color={result.success ? "green" : "red"}>
            {result.success ? "✓ Connection successful" : "✗ Connection failed"}
          </Text>
          {result.output && (
            <Box flexDirection="column">
              <Text dimColor>Output:</Text>
              <Text>{result.output}</Text>
            </Box>
          )}
        </Box>
      )}
      <Box marginTop={1}>
        <Text dimColor>Esc to test another · Esc again to go back</Text>
      </Box>
    </Box>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
bunx tsc --noEmit --project tsconfig.json
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/tui/screens/TestConnection.tsx
git commit -m "feat: add TUI TestConnection screen"
```

---

## Task 18: `src/tui/screens/Agent.tsx` — ssh-agent management

**Files:**
- Create: `src/tui/screens/Agent.tsx`

- [ ] **Step 1: Write the file**

```tsx
import React, { useState, useEffect } from "react"
import { Box, Text, ListItem, CustomSelect, Spinner, useInput } from "@vancityayush/tui"
import { Header } from "../components/Header.js"
import { agentList, agentAdd, agentRemove, type AgentKey } from "../../commands/agent.js"
import { list } from "../../commands/list.js"

type Props = {
  onBack: () => void
}

type View = "list" | "add-select"

export function Agent({ onBack }: Props): React.ReactNode {
  const [view, setView] = useState<View>("list")
  const [agentKeys, setAgentKeys] = useState<AgentKey[]>([])
  const [managedKeys, setManagedKeys] = useState<{ label: string; value: string; description: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function refreshAgentKeys(): Promise<void> {
    try {
      const keys = await agentList()
      setAgentKeys(keys)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => {
    Promise.all([
      agentList().catch(() => [] as AgentKey[]),
      list().catch(() => []),
    ]).then(([aKeys, mKeys]) => {
      setAgentKeys(aKeys)
      setManagedKeys(mKeys.map(k => ({
        label: k.name,
        value: k.name,
        description: k.host,
      })))
      setLoading(false)
    })
  }, [])

  useInput((_input, key) => {
    if (key.escape) {
      if (view === "add-select") {
        setView("list")
      } else {
        onBack()
      }
      return
    }
    if (view === "list") {
      if (key.upArrow) setSelectedIndex(i => Math.max(0, i - 1))
      if (key.downArrow) setSelectedIndex(i => Math.min(agentKeys.length - 1, i + 1))
      if (_input === "a") setView("add-select")
      if ((_input === "d" || key.delete) && agentKeys[selectedIndex]) {
        handleRemove(agentKeys[selectedIndex]!.path)
      }
    }
  }, { isActive: !loading })

  async function handleAdd(keyName: string): Promise<void> {
    setView("list")
    try {
      await agentAdd(keyName)
      setStatus(`Added ${keyName} to agent`)
      await refreshAgentKeys()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleRemove(path: string): Promise<void> {
    const name = path.split("/").pop() ?? path
    try {
      await agentRemove(name)
      setStatus(`Removed from agent`)
      await refreshAgentKeys()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  if (loading) {
    return (
      <Box flexDirection="column">
        <Header subtitle="SSH Agent" />
        <Spinner label="Loading agent keys…" />
      </Box>
    )
  }

  if (view === "add-select") {
    if (managedKeys.length === 0) {
      return (
        <Box flexDirection="column">
          <Header subtitle="Add key to agent" />
          <Text dimColor>No managed keys found. Run setup first.</Text>
          <Box marginTop={1}><Text dimColor>Esc to go back</Text></Box>
        </Box>
      )
    }
    return (
      <Box flexDirection="column">
        <Header subtitle="Add key to agent — select key" />
        <CustomSelect
          options={managedKeys}
          onChange={handleAdd}
          onCancel={() => setView("list")}
          visibleOptionCount={4}
        />
        <Box marginTop={1}><Text dimColor>Esc to go back</Text></Box>
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <Header subtitle={`SSH Agent — ${agentKeys.length} key${agentKeys.length !== 1 ? "s" : ""} loaded`} />

      {agentKeys.length === 0 && (
        <Text dimColor>No keys in agent. Press a to add one.</Text>
      )}

      {agentKeys.map((k, i) => (
        <ListItem
          key={k.fingerprint}
          isFocused={i === selectedIndex}
          isSelected={i === selectedIndex}
          description={k.type}
        >
          {k.path.split("/").pop() ?? k.path}
        </ListItem>
      ))}

      {(status || error) && (
        <Box marginTop={1}>
          {status && <Text dimColor>{status}</Text>}
          {error && <Text color="red">{error}</Text>}
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>↑↓ navigate · a add key · d remove key · Esc back</Text>
      </Box>
    </Box>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
bunx tsc --noEmit --project tsconfig.json
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/tui/screens/Agent.tsx
git commit -m "feat: add TUI Agent screen (list/add/remove ssh-agent keys)"
```

---

## Task 19: `src/tui/App.tsx` — screen router

**Files:**
- Create: `src/tui/App.tsx`

- [ ] **Step 1: Write the file**

```tsx
import React, { useState } from "react"
import { Box, ThemeProvider, useApp, useInput } from "@vancityayush/tui"
import { MainMenu, type MainMenuAction } from "./screens/MainMenu.js"
import { Setup } from "./screens/Setup.js"
import { KeyList } from "./screens/KeyList.js"
import { TestConnection } from "./screens/TestConnection.js"
import { Agent } from "./screens/Agent.js"

type Screen = "main-menu" | MainMenuAction

function AppShell(): React.ReactNode {
  const { exit } = useApp()
  const [screen, setScreen] = useState<Screen>("main-menu")

  useInput((input, key) => {
    if ((key.ctrl && input === "c") || input === "q") {
      exit()
    }
  }, { isActive: screen === "main-menu" })

  const goBack = () => setScreen("main-menu")

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      {screen === "main-menu" && (
        <MainMenu onSelect={(action) => setScreen(action)} />
      )}
      {screen === "setup" && <Setup onBack={goBack} />}
      {screen === "key-list" && <KeyList onBack={goBack} />}
      {screen === "test-connection" && <TestConnection onBack={goBack} />}
      {screen === "agent" && <Agent onBack={goBack} />}
    </Box>
  )
}

export function App(): React.ReactNode {
  return (
    <ThemeProvider initialState="dark" onThemeSave={() => {}}>
      <AppShell />
    </ThemeProvider>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
bunx tsc --noEmit --project tsconfig.json
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/tui/App.tsx
git commit -m "feat: add TUI App router (screen state machine)"
```

---

## Task 20: `src/cli.ts` — entry point (flags + TUI)

**Files:**
- Create: `src/cli.ts`

- [ ] **Step 1: Write the file**

```typescript
import { render } from "@vancityayush/tui"
import React from "react"
import { normalizeProviderKey, type ProviderKey } from "./providers.js"
import { setup } from "./commands/setup.js"
import { list } from "./commands/list.js"
import { remove } from "./commands/remove.js"
import { testConnection } from "./commands/test.js"
import { agentList, agentAdd, agentRemove } from "./commands/agent.js"
import { copy } from "./commands/copy.js"
import { App } from "./tui/App.js"
import { readFileSync } from "node:fs"
import { join } from "node:path"

function readVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8")) as { version?: string }
    return pkg.version ?? "0.0.0"
  } catch {
    return "0.0.0"
  }
}

const VERSION = readVersion()

function printHelp(): void {
  process.stdout.write(`sshx v${VERSION}

SSH key manager for Git providers.

Usage:
  sshx                            Open interactive TUI
  sshx setup <provider> [opts]    Set up a new SSH key
  sshx list                       List managed keys
  sshx remove <key>               Remove a managed key
  sshx test <provider>            Test SSH connection
  sshx copy <key>                 Copy public key to clipboard
  sshx agent list                 List keys in ssh-agent
  sshx agent add <key>            Add key to ssh-agent
  sshx agent remove <key>         Remove key from ssh-agent

Setup options:
  -e, --email <email>     Email for the SSH key
  -k, --key <name>        Key file name (default: id_<type>_<provider>)
  -H, --host <host>       Custom SSH host alias
  --force                 Overwrite existing key
  --no-git-config         Skip per-host git config
  --no-browser            Skip opening provider settings page
  --no-clipboard          Skip copying public key to clipboard

Providers: github, gitlab, bitbucket, azure
`.trim() + "\n")
}

type Flag = {
  email?: string
  key?: string
  host?: string
  force: boolean
  noGitConfig: boolean
  noBrowser: boolean
  noClipboard: boolean
}

function parseFlags(argv: string[]): { flags: Flag; rest: string[] } {
  const flags: Flag = { force: false, noGitConfig: false, noBrowser: false, noClipboard: false }
  const rest: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a === "-e" || a === "--email") { flags.email = argv[++i]; continue }
    if (a === "-k" || a === "--key") { flags.key = argv[++i]; continue }
    if (a === "-H" || a === "--host") { flags.host = argv[++i]; continue }
    if (a === "--force") { flags.force = true; continue }
    if (a === "--no-git-config") { flags.noGitConfig = true; continue }
    if (a === "--no-browser") { flags.noBrowser = true; continue }
    if (a === "--no-clipboard") { flags.noClipboard = true; continue }
    rest.push(a)
  }
  return { flags, rest }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)

  if (argv.length === 0) {
    const { waitUntilExit } = await render(React.createElement(App))
    await waitUntilExit()
    return
  }

  const [command, ...rest] = argv

  if (command === "-h" || command === "--help" || command === "help") {
    printHelp()
    return
  }

  if (command === "-v" || command === "--version" || command === "version") {
    process.stdout.write(`sshx v${VERSION}\n`)
    return
  }

  if (command === "list") {
    const keys = await list()
    if (keys.length === 0) {
      process.stdout.write("No managed keys found.\n")
    } else {
      keys.forEach(k => {
        process.stdout.write(`${k.name}  ${k.host}  ${k.provider ?? "unknown"}\n`)
      })
    }
    return
  }

  if (command === "remove") {
    const keyName = rest[0]
    if (!keyName) {
      process.stderr.write("Usage: sshx remove <key>\n")
      process.exit(1)
    }
    const { removedHosts } = await remove(keyName)
    process.stdout.write(`Removed ${keyName}. SSH config entries removed: ${removedHosts.join(", ") || "none"}\n`)
    return
  }

  if (command === "copy") {
    const keyName = rest[0]
    if (!keyName) {
      process.stderr.write("Usage: sshx copy <key>\n")
      process.exit(1)
    }
    const { publicKey, copied } = await copy(keyName)
    if (copied) {
      process.stdout.write("Public key copied to clipboard.\n")
    } else {
      process.stdout.write(`${publicKey}\n`)
    }
    return
  }

  if (command === "test") {
    const providerArg = rest[0]
    if (!providerArg) {
      process.stderr.write("Usage: sshx test <provider>\n")
      process.exit(1)
    }
    const provider = normalizeProviderKey(providerArg)
    if (!provider) {
      process.stderr.write(`Unknown provider: ${providerArg}\n`)
      process.exit(1)
    }
    const result = await testConnection(provider)
    process.stdout.write(`${result.output}\n`)
    process.exit(result.success ? 0 : 1)
  }

  if (command === "agent") {
    const sub = rest[0]
    if (sub === "list") {
      const keys = await agentList()
      if (keys.length === 0) {
        process.stdout.write("No keys in agent.\n")
      } else {
        keys.forEach(k => process.stdout.write(`${k.fingerprint}  ${k.path}  ${k.type}\n`))
      }
      return
    }
    if (sub === "add") {
      const keyName = rest[1]
      if (!keyName) { process.stderr.write("Usage: sshx agent add <key>\n"); process.exit(1) }
      await agentAdd(keyName)
      process.stdout.write(`Added ${keyName} to agent.\n`)
      return
    }
    if (sub === "remove") {
      const keyName = rest[1]
      if (!keyName) { process.stderr.write("Usage: sshx agent remove <key>\n"); process.exit(1) }
      await agentRemove(keyName)
      process.stdout.write(`Removed ${keyName} from agent.\n`)
      return
    }
    process.stderr.write("Usage: sshx agent <list|add|remove> [key]\n")
    process.exit(1)
  }

  if (command === "setup") {
    const { flags, rest: setupRest } = parseFlags(rest)
    const providerArg = setupRest[0]
    if (!providerArg) {
      process.stderr.write("Usage: sshx setup <provider> [opts]\n")
      process.exit(1)
    }
    const provider = normalizeProviderKey(providerArg) as ProviderKey | undefined
    if (!provider) {
      process.stderr.write(`Unknown provider: ${providerArg}\n`)
      process.exit(1)
    }
    if (!flags.email) {
      process.stderr.write("Email is required: sshx setup <provider> -e you@example.com\n")
      process.exit(1)
    }
    const keyName = flags.key ?? `id_${provider === "azure" ? "rsa" : "ed25519"}_${provider}`
    const result = await setup({
      provider,
      email: flags.email,
      keyName,
      host: flags.host,
      force: flags.force,
      noGitConfig: flags.noGitConfig,
      noBrowser: flags.noBrowser,
      noClipboard: flags.noClipboard,
    })
    process.stdout.write(`Key generated: ~/.ssh/${result.keyName}\n`)
    process.stdout.write(`SSH config updated for ${result.host}\n`)
    if (result.clipboardCopied) process.stdout.write("Public key copied to clipboard.\n")
    return
  }

  process.stderr.write(`Unknown command: ${command}\nRun "sshx --help" for usage.\n`)
  process.exit(1)
}

main().catch(err => {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
```

- [ ] **Step 2: Typecheck**

```bash
bunx tsc --noEmit --project tsconfig.json
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/cli.ts
git commit -m "feat: add cli entry point (flag routing + TUI launch)"
```

---

## Task 21: Build verification and final cleanup

**Files:** None new.

- [ ] **Step 1: Run full typecheck**

```bash
bunx tsc --noEmit --project tsconfig.json
```

Expected: 0 errors.

- [ ] **Step 2: Run unit tests**

```bash
bun test
```

Expected: all tests in `src/ssh/config.test.ts` PASS.

- [ ] **Step 3: Build the bundle**

```bash
bun run build
```

Expected: `dist/cli.js` created with no errors.

- [ ] **Step 4: Smoke-test headless commands**

```bash
node dist/cli.js --version
node dist/cli.js --help
node dist/cli.js list
```

Expected: version printed, help printed, key list printed (empty is fine).

- [ ] **Step 5: Smoke-test TUI launch** (requires a TTY)

```bash
node dist/cli.js
```

Expected: TUI renders main menu with 4 options.

- [ ] **Step 6: Commit**

```bash
git add dist/cli.js
git commit -m "chore: build sshx TUI rebuild v0.4.0"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered in |
|-----------------|-----------|
| Hybrid UX (TUI / flags) | Task 20 (cli.ts) |
| setup command | Task 8 |
| list command | Task 7 |
| remove command | Task 9 |
| test command | Task 10 |
| agent command | Task 11 |
| copy command | Task 12 |
| Providers: github/gitlab/bitbucket/azure | Task 2 |
| SSH config `# sshx` marker | Task 4 |
| Setup rollback on config failure | Task 8 |
| Clipboard / browser non-fatal | Tasks 3, 8 |
| Auto-detect git context | Task 8 (readGitContext), Task 15 (useEffect) |
| TUI 4-step setup wizard | Task 15 |
| TUI KeyList with Dialog confirm | Task 16 |
| TUI TestConnection screen | Task 17 |
| TUI Agent screen | Task 18 |
| TUI MainMenu | Task 14 |
| TUI App router | Task 19 |
| bun build / typecheck | Tasks 1, 21 |

All spec requirements covered. No placeholders. Types consistent across tasks.
