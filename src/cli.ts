import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { render } from "@vancityayush/tui";
import { agentAdd, agentList, agentRemove } from "./commands/agent";
import { copy } from "./commands/copy";
import { list } from "./commands/list";
import { remove } from "./commands/remove";
import { readGitContext, setup } from "./commands/setup";
import { testConnection } from "./commands/test";
import { normalizeProviderKey, PROVIDERS, type ProviderKey } from "./providers";
import { App } from "./tui/App";

type Flags = {
  email?: string;
  key?: string;
  host?: string;
  force: boolean;
  noGitConfig: boolean;
  noBrowser: boolean;
  noClipboard: boolean;
};

function readVersion(): string {
  try {
    const packageJson = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8")) as {
      version?: string;
    };
    return packageJson.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const VERSION = readVersion();

function printHelp(): void {
  process.stdout.write(
    `sshx v${VERSION}

SSH key manager for Git providers.

Usage:
  sshx                            Open the interactive TUI
  sshx --tui                      Open the interactive TUI
  sshx setup <provider> [opts]    Set up a new SSH key
  sshx list                       List managed keys
  sshx remove <key>               Remove a managed key
  sshx test <provider>            Test SSH connection
  sshx copy <key>                 Copy a public key to the clipboard
  sshx agent list                 List keys in ssh-agent
  sshx agent add <key>            Add a key to ssh-agent
  sshx agent remove <key>         Remove a key from ssh-agent

Setup options:
  -e, --email <email>     Email for the SSH key comment
  -k, --key <name>        Key file name
  -H, --host <host>       Custom SSH host alias
  --force                 Overwrite an existing key and host block
  --no-git-config         Skip per-host git config setup
  --no-browser            Skip opening the provider settings page
  --no-clipboard          Skip copying the public key to the clipboard

Providers:
  github | gitlab | bitbucket | azure
`.trim() + "\n",
  );
}

function parseFlags(argv: string[]): { flags: Flags; rest: string[] } {
  const flags: Flags = {
    force: false,
    noGitConfig: false,
    noBrowser: false,
    noClipboard: false,
  };
  const rest: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === "-e" || arg === "--email") {
      flags.email = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "-k" || arg === "--key") {
      flags.key = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "-H" || arg === "--host") {
      flags.host = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--force") {
      flags.force = true;
      continue;
    }
    if (arg === "--no-git-config") {
      flags.noGitConfig = true;
      continue;
    }
    if (arg === "--no-browser") {
      flags.noBrowser = true;
      continue;
    }
    if (arg === "--no-clipboard") {
      flags.noClipboard = true;
      continue;
    }
    rest.push(arg);
  }

  return { flags, rest };
}

async function launchTui(): Promise<void> {
  const instance = await render(React.createElement(App));
  await instance.waitUntilExit();
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (argv.length === 0 || argv[0] === "--tui") {
    await launchTui();
    return;
  }

  const [command, ...rest] = argv;

  if (command === "-h" || command === "--help" || command === "help") {
    printHelp();
    return;
  }

  if (command === "-v" || command === "--version" || command === "version") {
    process.stdout.write(`sshx v${VERSION}\n`);
    return;
  }

  if (command === "list") {
    const keys = await list();
    if (keys.length === 0) {
      process.stdout.write("No managed keys found.\n");
      return;
    }
    keys.forEach(key => {
      process.stdout.write(`${key.name}\t${key.host}\t${key.provider ?? "unknown"}\n`);
    });
    return;
  }

  if (command === "remove") {
    const keyName = rest[0];
    if (!keyName) {
      process.stderr.write("Usage: sshx remove <key>\n");
      process.exit(1);
    }
    const result = await remove(keyName);
    process.stdout.write(`Removed ${keyName}. SSH config entries removed: ${result.removedHosts.join(", ") || "none"}\n`);
    return;
  }

  if (command === "copy") {
    const keyName = rest[0];
    if (!keyName) {
      process.stderr.write("Usage: sshx copy <key>\n");
      process.exit(1);
    }
    const result = await copy(keyName);
    if (result.copied) {
      process.stdout.write("Public key copied to clipboard.\n");
    } else {
      process.stdout.write(`${result.publicKey}\n`);
    }
    return;
  }

  if (command === "test") {
    const providerArg = rest[0];
    if (!providerArg) {
      process.stderr.write("Usage: sshx test <provider>\n");
      process.exit(1);
    }
    const provider = normalizeProviderKey(providerArg);
    if (!provider) {
      process.stderr.write(`Unknown provider: ${providerArg}\n`);
      process.exit(1);
    }
    const result = await testConnection(provider);
    if (result.output) {
      process.stdout.write(`${result.output}\n`);
    }
    process.exit(result.success ? 0 : 1);
  }

  if (command === "agent") {
    const action = rest[0];
    if (action === "list") {
      const keys = await agentList();
      if (keys.length === 0) {
        process.stdout.write("No keys in ssh-agent.\n");
        return;
      }
      keys.forEach(key => {
        process.stdout.write(`${key.fingerprint}\t${key.path}\t${key.type}\n`);
      });
      return;
    }
    if (action === "add") {
      const keyName = rest[1];
      if (!keyName) {
        process.stderr.write("Usage: sshx agent add <key>\n");
        process.exit(1);
      }
      await agentAdd(keyName);
      process.stdout.write(`Added ${keyName} to ssh-agent.\n`);
      return;
    }
    if (action === "remove") {
      const keyName = rest[1];
      if (!keyName) {
        process.stderr.write("Usage: sshx agent remove <key>\n");
        process.exit(1);
      }
      await agentRemove(keyName);
      process.stdout.write(`Removed ${keyName} from ssh-agent.\n`);
      return;
    }
    process.stderr.write("Usage: sshx agent <list|add|remove> [key]\n");
    process.exit(1);
  }

  if (command === "setup") {
    const { flags, rest: setupArgs } = parseFlags(rest);
    const providerArg = setupArgs[0];
    if (!providerArg) {
      process.stderr.write("Usage: sshx setup <provider> [opts]\n");
      process.exit(1);
    }

    const provider = normalizeProviderKey(providerArg) as ProviderKey | undefined;
    if (!provider) {
      process.stderr.write(`Unknown provider: ${providerArg}\n`);
      process.exit(1);
    }

    const gitContext = readGitContext();
    const email = flags.email ?? gitContext.email;
    if (!email) {
      process.stderr.write("Email is required: sshx setup <provider> -e you@example.com\n");
      process.exit(1);
    }

    const keyName = flags.key ?? `id_${PROVIDERS[provider].keyType}_${provider}`;
    const result = await setup({
      provider,
      email,
      keyName,
      host: flags.host,
      force: flags.force,
      noGitConfig: flags.noGitConfig,
      noBrowser: flags.noBrowser,
      noClipboard: flags.noClipboard,
    });

    process.stdout.write(`Created ~/.ssh/${result.keyName}\n`);
    process.stdout.write(`Updated SSH config for ${result.host}\n`);
    if (result.clipboardCopied) {
      process.stdout.write("Public key copied to clipboard.\n");
    }
    if (!result.browserOpened) {
      process.stdout.write(`Add the key at ${PROVIDERS[provider].settingsUrl}\n`);
    }
    return;
  }

  process.stderr.write(`Unknown command: ${command}\nRun "sshx --help" for usage.\n`);
  process.exit(1);
}

main().catch(error => {
  process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
