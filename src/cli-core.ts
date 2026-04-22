import { PROVIDERS, normalizeProviderKey, type ProviderKey, detectProviderFromRemoteUrl } from "./providers.js"
import type { SetupOptions } from "./commands/setup.js"

export type SetupCliOptions = {
  provider?: ProviderKey
  email?: string
  key?: string
  host?: string
  force: boolean
  noGitConfig: boolean
  noBrowser: boolean
  noClipboard: boolean
}

export type ParsedHeadlessCommand =
  | { name: "help" }
  | { name: "version" }
  | { name: "setup"; options: SetupCliOptions }
  | { name: "list" }
  | { name: "remove"; key: string }
  | { name: "copy"; key: string }
  | { name: "test"; provider: ProviderKey }
  | { name: "agent"; action: "list" | "add" | "remove"; key?: string }

export type ParsedCliInvocation =
  | { mode: "tui" }
  | { mode: "headless"; command: ParsedHeadlessCommand }

export type GitContext = {
  email?: string
  remoteUrl?: string
}

export function parseCliArgs(argv: string[]): ParsedCliInvocation {
  if (argv.length === 0 || argv[0] === "--tui") {
    return { mode: "tui" }
  }

  const [first, ...rest] = argv

  if (first === "-h" || first === "--help" || first === "help") {
    return { mode: "headless", command: { name: "help" } }
  }

  if (first === "-v" || first === "--version" || first === "version") {
    return { mode: "headless", command: { name: "version" } }
  }

  const shorthandProvider = normalizeProviderKey(first)
  if (shorthandProvider) {
    return {
      mode: "headless",
      command: {
        name: "setup",
        options: parseSetupArgs(rest, shorthandProvider),
      },
    }
  }

  switch (first) {
    case "setup":
      return {
        mode: "headless",
        command: {
          name: "setup",
          options: parseSetupArgs(rest),
        },
      }
    case "list":
      return { mode: "headless", command: { name: "list" } }
    case "remove":
      return {
        mode: "headless",
        command: {
          name: "remove",
          key: requireValue("remove", rest[0], "Usage: sshx remove <key>"),
        },
      }
    case "copy":
      return {
        mode: "headless",
        command: {
          name: "copy",
          key: requireValue("copy", rest[0], "Usage: sshx copy <key>"),
        },
      }
    case "test":
      return {
        mode: "headless",
        command: {
          name: "test",
          provider: normalizeTestProvider(requireValue("test", rest[0], "Usage: sshx test <provider>")),
        },
      }
    case "agent":
      return {
        mode: "headless",
        command: parseAgentArgs(rest),
      }
    default:
      throw new Error(`Unknown command: ${first}`)
  }
}

export function resolveSetupOptions(options: SetupCliOptions, gitContext: GitContext): SetupOptions {
  const provider = options.provider ?? detectProviderFromRemoteUrl(gitContext.remoteUrl ?? "")
  const email = options.email ?? gitContext.email

  if (!provider || !email) {
    throw new Error(
      "Headless setup requires provider and email. Pass flags or run `sshx` with no args to open the TUI.",
    )
  }

  const keyName = options.key ?? `id_${PROVIDERS[provider].keyType}_${provider}`

  return {
    provider,
    email,
    keyName,
    host: options.host,
    force: options.force,
    noGitConfig: options.noGitConfig,
    noBrowser: options.noBrowser,
    noClipboard: options.noClipboard,
  }
}

export function getHelpText(): string {
  return [
    "sshx",
    "",
    "Usage:",
    "  sshx                         Open the interactive TUI",
    "  sshx setup [provider] [flags]",
    "  sshx <provider> [flags]",
    "  sshx list",
    "  sshx remove <key>",
    "  sshx copy <key>",
    "  sshx test <provider>",
    "  sshx agent <list|add|remove> [key]",
    "",
    "Setup flags:",
    "  -e, --email <email>",
    "  -k, --key <name>",
    "  -p, --provider <provider>",
    "  -H, --host <alias>",
    "      --force",
    "      --no-git-config",
    "      --no-browser",
    "      --no-clipboard",
  ].join("\n")
}

function parseSetupArgs(argv: string[], presetProvider?: ProviderKey): SetupCliOptions {
  const options: SetupCliOptions = {
    provider: presetProvider,
    force: false,
    noGitConfig: false,
    noBrowser: false,
    noClipboard: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]

    switch (token) {
      case "-e":
      case "--email":
        options.email = requireValue(token, argv[index + 1])
        index += 1
        break
      case "-k":
      case "--key":
        options.key = requireValue(token, argv[index + 1])
        index += 1
        break
      case "-p":
      case "--provider":
        options.provider = normalizeNamedProvider(requireValue(token, argv[index + 1]))
        index += 1
        break
      case "-H":
      case "--host":
        options.host = requireValue(token, argv[index + 1])
        index += 1
        break
      case "--force":
        options.force = true
        break
      case "--no-git-config":
        options.noGitConfig = true
        break
      case "--no-browser":
        options.noBrowser = true
        break
      case "--no-clipboard":
        options.noClipboard = true
        break
      case "-h":
      case "--help":
        throw new Error(getHelpText())
      default:
        if (token.startsWith("-")) {
          throw new Error(`Unknown flag: ${token}`)
        }

        if (!options.provider) {
          options.provider = normalizeNamedProvider(token)
          break
        }

        throw new Error(`Unexpected argument: ${token}`)
    }
  }

  return options
}

function parseAgentArgs(argv: string[]): ParsedHeadlessCommand & { name: "agent" } {
  const action = argv[0] ?? "list"
  switch (action) {
    case "list":
      return { name: "agent", action: "list" }
    case "add":
      return {
        name: "agent",
        action: "add",
        key: requireValue("agent add", argv[1], "Usage: sshx agent add <key>"),
      }
    case "remove":
      return {
        name: "agent",
        action: "remove",
        key: requireValue("agent remove", argv[1], "Usage: sshx agent remove <key>"),
      }
    default:
      throw new Error(`Unknown agent action: ${action}`)
  }
}

function normalizeNamedProvider(value: string): ProviderKey {
  const provider = normalizeProviderKey(value)
  if (!provider) {
    throw new Error(`Unknown provider: ${value}`)
  }
  return provider
}

function normalizeTestProvider(value: string): ProviderKey {
  const normalized = normalizeProviderKey(value)
  if (normalized) {
    return normalized
  }

  const byHostname = Object.entries(PROVIDERS).find(([, provider]) => provider.hostname === value)
  if (byHostname) {
    return byHostname[0] as ProviderKey
  }

  throw new Error(`Unknown provider: ${value}`)
}

function requireValue(flag: string, value: string | undefined, usageHint?: string): string {
  if (!value) {
    throw new Error(usageHint ?? `Missing value for ${flag}`)
  }
  return value
}
