import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, normalize } from "node:path";
import { createInterface } from "node:readline/promises";
import { emitKeypressEvents } from "node:readline";
import { spawnSync, type SpawnSyncOptions } from "node:child_process";

type Platform = "macos" | "linux" | "windows" | "wsl";
type ProviderKey = "bitbucket" | "github" | "gitlab" | "azure";
type CommandName = "setup" | "test" | "list" | "remove" | "copy" | "config" | "agent" | "help" | "version";

type SetupOptions = {
  provider?: ProviderKey;
  email?: string;
  key?: string;
  host?: string;
  force: boolean;
  noGitConfig: boolean;
  noBrowser: boolean;
  noClipboard: boolean;
};

type ParsedCommand =
  | { name: "help" }
  | { name: "version" }
  | { name: "setup"; options: SetupOptions }
  | { name: "test"; host: string }
  | { name: "list" }
  | { name: "remove"; key: string }
  | { name: "copy"; key: string }
  | { name: "config"; host?: string }
  | { name: "agent"; action: "list" | "add" | "remove"; key?: string };

type GitContext = {
  email?: string;
  username?: string;
  provider?: ProviderKey;
  remoteUrl?: string;
};

type ConfigSegment =
  | { kind: "text"; lines: string[] }
  | { kind: "host"; host: string; lines: string[] };

type CommandResult = {
  status: number;
  stdout: string;
  stderr: string;
};

const PROVIDERS: Record<
  ProviderKey,
  {
    label: string;
    hostname: string;
    settingsUrl: string;
    keyType: "ed25519" | "rsa";
  }
> = {
  bitbucket: {
    label: "Bitbucket",
    hostname: "bitbucket.org",
    settingsUrl: "https://bitbucket.org/account/settings/ssh-keys/",
    keyType: "ed25519",
  },
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
  azure: {
    label: "Azure DevOps",
    hostname: "ssh.dev.azure.com",
    settingsUrl: "https://dev.azure.com/_usersSettings/keys",
    keyType: "rsa",
  },
};

const PACKAGE_VERSION = readPackageVersion();
const SSH_DIR = join(homedir(), ".ssh");
const SSH_CONFIG_PATH = join(SSH_DIR, "config");

function readPackageVersion(): string {
  try {
    const packageJson = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8")) as {
      version?: string;
    };
    return packageJson.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function detectPlatform(): Platform {
  if (process.platform === "win32") {
    return "windows";
  }

  if (process.platform === "darwin") {
    return "macos";
  }

  try {
    const procVersion = readFileSync("/proc/version", "utf8");
    if (procVersion.includes("Microsoft")) {
      return "wsl";
    }
  } catch {
    // Ignore missing /proc/version.
  }

  return "linux";
}

function commandExists(command: string): boolean {
  const lookup = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(lookup, [command], {
    stdio: "ignore",
  });
  return result.status === 0;
}

function runCommand(
  command: string,
  args: string[],
  options: SpawnSyncOptions = {},
): CommandResult {
  const result = spawnSync(command, args, {
    ...options,
    encoding: "utf8",
  });

  if (result.error) {
    throw result.error;
  }

  return {
    status: result.status ?? 1,
    stdout: String(result.stdout ?? ""),
    stderr: String(result.stderr ?? ""),
  };
}

function requireCommand(command: string, label = command): void {
  if (!commandExists(command)) {
    throw new Error(`${label} is required but was not found on PATH.`);
  }
}

function normalizeProvider(value: string): ProviderKey | undefined {
  const normalizedValue = value.trim().toLowerCase();
  if (normalizedValue === "bitbucket") {
    return "bitbucket";
  }
  if (normalizedValue === "github" || normalizedValue === "gh") {
    return "github";
  }
  if (normalizedValue === "gitlab" || normalizedValue === "gl") {
    return "gitlab";
  }
  if (normalizedValue === "azure" || normalizedValue === "azuredevops" || normalizedValue === "azure-devops") {
    return "azure";
  }
  return undefined;
}

function detectProviderFromRemote(remoteUrl: string | undefined): ProviderKey | undefined {
  if (!remoteUrl) {
    return undefined;
  }

  if (remoteUrl.includes("bitbucket.org")) {
    return "bitbucket";
  }
  if (remoteUrl.includes("github.com")) {
    return "github";
  }
  if (remoteUrl.includes("gitlab.com")) {
    return "gitlab";
  }
  if (remoteUrl.includes("dev.azure.com") || remoteUrl.includes("vs-ssh.visualstudio.com")) {
    return "azure";
  }
  return undefined;
}

function parseArgs(argv: string[]): ParsedCommand {
  if (argv.length === 0) {
    return {
      name: "setup",
      options: {
        force: false,
        noGitConfig: false,
        noBrowser: false,
        noClipboard: false,
      },
    };
  }

  const [first, ...rest] = argv;

  if (first === "-h" || first === "--help" || first === "help") {
    return { name: "help" };
  }

  if (first === "-v" || first === "--version" || first === "version") {
    return { name: "version" };
  }

  const shorthandProvider = normalizeProvider(first);
  if (shorthandProvider) {
    return {
      name: "setup",
      options: parseSetupArgs(rest, shorthandProvider),
    };
  }

  switch (first as CommandName) {
    case "setup":
      return {
        name: "setup",
        options: parseSetupArgs(rest),
      };
    case "test":
      if (rest.length === 0) {
        throw new Error("Usage: sshx test <host>");
      }
      return { name: "test", host: rest[0] };
    case "list":
      return { name: "list" };
    case "remove":
      if (rest.length === 0) {
        throw new Error("Usage: sshx remove <key>");
      }
      return { name: "remove", key: rest[0] };
    case "copy":
      if (rest.length === 0) {
        throw new Error("Usage: sshx copy <key>");
      }
      return { name: "copy", key: rest[0] };
    case "config":
      return { name: "config", host: rest[0] };
    case "agent":
      return parseAgentArgs(rest);
    default:
      throw new Error(`Unknown command: ${first}`);
  }
}

function parseSetupArgs(argv: string[], presetProvider?: ProviderKey): SetupOptions {
  const options: SetupOptions = {
    provider: presetProvider,
    force: false,
    noGitConfig: false,
    noBrowser: false,
    noClipboard: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    switch (token) {
      case "-e":
      case "--email":
        options.email = requireValue(token, argv[index + 1]);
        index += 1;
        break;
      case "-k":
      case "--key":
        options.key = requireValue(token, argv[index + 1]);
        index += 1;
        break;
      case "-p":
      case "--provider":
        options.provider = normalizeNamedProvider(requireValue(token, argv[index + 1]));
        index += 1;
        break;
      case "-H":
      case "--host":
        options.host = requireValue(token, argv[index + 1]);
        index += 1;
        break;
      case "--force":
        options.force = true;
        break;
      case "--no-git-config":
        options.noGitConfig = true;
        break;
      case "--no-browser":
        options.noBrowser = true;
        break;
      case "--no-clipboard":
        options.noClipboard = true;
        break;
      case "-h":
      case "--help":
        throw new Error(getHelpText());
      default:
        if (token.startsWith("-")) {
          throw new Error(`Unknown flag: ${token}`);
        }

        if (!options.provider) {
          options.provider = normalizeNamedProvider(token);
          break;
        }

        throw new Error(`Unexpected argument: ${token}`);
    }
  }

  return options;
}

function parseAgentArgs(argv: string[]): ParsedCommand {
  const action = argv[0];
  if (action !== "list" && action !== "add" && action !== "remove") {
    throw new Error("Usage: sshx agent <list|add|remove> [key]");
  }

  return {
    name: "agent",
    action,
    key: argv[1],
  };
}

function requireValue(flag: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function normalizeNamedProvider(value: string): ProviderKey {
  const provider = normalizeProvider(value);
  if (!provider) {
    throw new Error(`Unsupported provider: ${value}`);
  }
  return provider;
}

function getHelpText(): string {
  return `
sshx v${PACKAGE_VERSION}

TypeScript-first SSH key manager for Git providers.

Usage:
  sshx
  sshx setup [provider] [options]
  sshx test <host>
  sshx list
  sshx copy <key>
  sshx remove <key>
  sshx config [host]
  sshx agent <list|add|remove> [key]

Setup options:
  -p, --provider <provider>   github | gitlab | bitbucket | azure
  -e, --email <email>         Email for the SSH key comment
  -k, --key <name>            Key file name inside ~/.ssh
  -H, --host <host>           Custom SSH host alias
      --force                 Overwrite an existing key and host block
      --no-git-config         Skip per-host git config setup
      --no-browser            Skip opening the provider settings page
      --no-clipboard          Skip copying the public key to the clipboard

Examples:
  sshx
  sshx setup github -e you@example.com -k personal
  sshx test github.com
  sshx copy personal
  sshx remove personal
`.trim();
}

function info(message: string): void {
  process.stdout.write(`${message}\n`);
}

function warn(message: string): void {
  process.stderr.write(`Warning: ${message}\n`);
}

function success(message: string): void {
  process.stdout.write(`${message}\n`);
}

async function promptInput(question: string, defaultValue?: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const suffix = defaultValue ? ` [${defaultValue}]` : "";
    const answer = (await rl.question(`${question}${suffix}: `)).trim();
    return answer || defaultValue || "";
  } finally {
    rl.close();
  }
}

async function promptConfirm(question: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? "Y/n" : "y/N";
  const answer = (await promptInput(`${question} (${hint})`)).trim().toLowerCase();
  if (!answer) {
    return defaultYes;
  }
  return answer === "y" || answer === "yes";
}

async function promptSelect(title: string, options: string[], initialIndex = 0): Promise<number> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return initialIndex;
  }

  return new Promise<number>((resolve, reject) => {
    const stdin = process.stdin;
    let selected = initialIndex;
    let firstRender = true;
    const lineCount = options.length + 1;

    emitKeypressEvents(stdin);
    if (stdin.setRawMode) {
      stdin.setRawMode(true);
    }
    stdin.resume();
    process.stdout.write("\x1b[?25l");

    const render = () => {
      if (!firstRender) {
        process.stdout.write(`\x1b[${lineCount}A`);
      }

      process.stdout.write(`\r\x1b[K${title}\n`);
      options.forEach((option, index) => {
        const prefix = index === selected ? "> " : "  ";
        process.stdout.write(`\r\x1b[K${prefix}${option}\n`);
      });
      firstRender = false;
    };

    const cleanup = () => {
      stdin.removeListener("keypress", onKeypress);
      if (stdin.setRawMode) {
        stdin.setRawMode(false);
      }
      stdin.pause();
      process.stdout.write("\x1b[?25h");
    };

    const onKeypress = (_: string, key: { name?: string; ctrl?: boolean }) => {
      if (key.ctrl && key.name === "c") {
        cleanup();
        reject(new Error("Cancelled."));
        return;
      }

      if (key.name === "up") {
        selected = selected > 0 ? selected - 1 : options.length - 1;
        render();
        return;
      }

      if (key.name === "down") {
        selected = selected < options.length - 1 ? selected + 1 : 0;
        render();
        return;
      }

      if (key.name === "return" || key.name === "space") {
        cleanup();
        process.stdout.write("\n");
        resolve(selected);
      }
    };

    stdin.on("keypress", onKeypress);
    render();
  });
}

function ensureSshDir(): void {
  mkdirSync(SSH_DIR, { recursive: true });
}

function isValidEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

function isValidSimpleValue(value: string): boolean {
  return value.trim().length > 0 && !/\s/.test(value);
}

function readGitContext(): GitContext {
  if (!commandExists("git")) {
    return {};
  }

  const emailResult = runCommand("git", ["config", "--global", "user.email"]);
  const userResult = runCommand("git", ["config", "--global", "user.name"]);
  const remoteResult = runCommand("git", ["remote", "get-url", "origin"]);

  const remoteUrl = remoteResult.status === 0 ? remoteResult.stdout.trim() : undefined;

  return {
    email: emailResult.status === 0 ? emailResult.stdout.trim() : undefined,
    username: userResult.status === 0 ? userResult.stdout.trim() : undefined,
    remoteUrl,
    provider: detectProviderFromRemote(remoteUrl),
  };
}

async function resolveSetupValues(options: SetupOptions, gitContext: GitContext) {
  const interactive = process.stdin.isTTY;

  let provider = options.provider;
  if (!provider) {
    if (gitContext.provider && interactive) {
      const useDetected = await promptConfirm(
        `Detected ${PROVIDERS[gitContext.provider].label} from your git remote. Use it`,
        true,
      );
      provider = useDetected ? gitContext.provider : undefined;
    } else {
      provider = gitContext.provider;
    }
  }

  if (!provider) {
    if (!interactive) {
      throw new Error("Provider is required when running without a TTY.");
    }
    const providerKeys = Object.keys(PROVIDERS) as ProviderKey[];
    const selected = await promptSelect("Select your Git provider:", providerKeys.map((key) => PROVIDERS[key].label));
    provider = providerKeys[selected];
  }

  let email = options.email ?? gitContext.email;
  while (!email || !isValidEmail(email)) {
    if (!interactive) {
      throw new Error("A valid email is required. Pass it with --email.");
    }
    email = await promptInput("Enter your email", gitContext.email);
    if (!isValidEmail(email)) {
      warn("Please enter a valid email address.");
    }
  }

  let keyName = options.key;
  while (!keyName || !isValidSimpleValue(keyName)) {
    if (!interactive) {
      throw new Error("A key name is required. Pass it with --key.");
    }
    keyName = await promptInput("Enter your SSH key name");
    if (!isValidSimpleValue(keyName)) {
      warn("Key name cannot be empty or contain spaces.");
    }
  }

  let host = options.host;
  if (!host && interactive) {
    const useCustomHost = await promptConfirm("Use a custom SSH host alias", false);
    if (useCustomHost) {
      while (!host || !isValidSimpleValue(host)) {
        host = await promptInput("Enter your host name", PROVIDERS[provider].hostname);
        if (!isValidSimpleValue(host)) {
          warn("Host name cannot be empty or contain spaces.");
        }
      }
    }
  }

  host = host || PROVIDERS[provider].hostname;

  if (!isValidSimpleValue(host)) {
    throw new Error("Host name cannot be empty or contain spaces.");
  }

  return {
    provider,
    email,
    keyName,
    host,
  };
}

function parseConfigSegments(content: string): ConfigSegment[] {
  const normalizedContent = content.replace(/\r\n/g, "\n");
  if (!normalizedContent.trim()) {
    return [];
  }

  const lines = normalizedContent.split("\n");
  const segments: ConfigSegment[] = [];
  let currentText: string[] = [];
  let currentHostLines: string[] | null = null;
  let currentHostName = "";

  const pushText = () => {
    if (currentText.length > 0) {
      segments.push({ kind: "text", lines: [...currentText] });
      currentText = [];
    }
  };

  const pushHost = () => {
    if (currentHostLines) {
      segments.push({
        kind: "host",
        host: currentHostName,
        lines: [...currentHostLines],
      });
      currentHostLines = null;
    }
  };

  for (const line of lines) {
    const isHostStart = /^Host\s+/.test(line) && !/^\s/.test(line);
    if (isHostStart) {
      pushText();
      pushHost();
      currentHostName = line.replace(/^Host\s+/, "").trim();
      currentHostLines = [line];
      continue;
    }

    if (currentHostLines) {
      currentHostLines.push(line);
    } else {
      currentText.push(line);
    }
  }

  pushText();
  pushHost();
  return segments;
}

function serializeConfigSegments(segments: ConfigSegment[]): string {
  const blocks = segments
    .map((segment) => segment.lines.join("\n").trimEnd())
    .filter((segment) => segment.length > 0);

  if (blocks.length === 0) {
    return "";
  }

  return `${blocks.join("\n\n")}\n`;
}

function readConfigSegments(): ConfigSegment[] {
  if (!existsSync(SSH_CONFIG_PATH)) {
    return [];
  }
  return parseConfigSegments(readFileSync(SSH_CONFIG_PATH, "utf8"));
}

function writeConfigSegments(segments: ConfigSegment[]): void {
  writeFileSync(SSH_CONFIG_PATH, serializeConfigSegments(segments));
}

function buildHostBlock(provider: ProviderKey, host: string, keyName: string): string[] {
  const lines = [
    `Host ${host}`,
    `  HostName ${PROVIDERS[provider].hostname}`,
    "  User git",
    "  AddKeysToAgent yes",
    `  IdentityFile ~/.ssh/${keyName}`,
    "  IdentitiesOnly yes",
  ];

  if (provider === "azure") {
    lines.push("  HostkeyAlgorithms +ssh-rsa");
    lines.push("  PubkeyAcceptedAlgorithms +ssh-rsa");
  }

  return lines;
}

function upsertHostBlock(provider: ProviderKey, host: string, keyName: string): "added" | "replaced" {
  const segments = readConfigSegments();
  const nextHostBlock: ConfigSegment = {
    kind: "host",
    host,
    lines: buildHostBlock(provider, host, keyName),
  };

  let replaced = false;
  const nextSegments = segments.map((segment) => {
    if (segment.kind === "host" && segment.host === host) {
      replaced = true;
      return nextHostBlock;
    }
    return segment;
  });

  if (!replaced) {
    nextSegments.push(nextHostBlock);
  }

  writeConfigSegments(nextSegments);
  return replaced ? "replaced" : "added";
}

function extractIdentityFiles(lines: string[]): string[] {
  return lines
    .map((line) => line.match(/^\s*IdentityFile\s+(.+)$/)?.[1]?.trim())
    .filter((value): value is string => Boolean(value))
    .map(stripWrappingQuotes);
}

function stripWrappingQuotes(value: string): string {
  return value.replace(/^"(.*)"$/, "$1");
}

function expandHomePath(filePath: string): string {
  if (filePath === "~") {
    return homedir();
  }

  if (filePath.startsWith("~/")) {
    return join(homedir(), filePath.slice(2));
  }

  return filePath;
}

function normalizePathLike(filePath: string): string {
  return normalize(expandHomePath(filePath)).replace(/\\/g, "/");
}

function removeHostBlocksForKey(keyName: string): string[] {
  const variants = new Set([
    normalizePathLike(join(SSH_DIR, keyName)),
    normalizePathLike(`~/.ssh/${keyName}`),
    normalizePathLike(keyName),
  ]);

  const removedHosts: string[] = [];
  const segments = readConfigSegments().filter((segment) => {
    if (segment.kind !== "host") {
      return true;
    }

    const matches = extractIdentityFiles(segment.lines).some((identityFile) =>
      variants.has(normalizePathLike(identityFile)),
    );

    if (matches) {
      removedHosts.push(segment.host);
      return false;
    }

    return true;
  });

  writeConfigSegments(segments);
  return removedHosts;
}

function listHostBlocks(): Array<{ host: string; identityFiles: string[] }> {
  return readConfigSegments()
    .filter((segment): segment is Extract<ConfigSegment, { kind: "host" }> => segment.kind === "host")
    .map((segment) => ({
      host: segment.host,
      identityFiles: extractIdentityFiles(segment.lines),
    }));
}

function getHostBlock(host: string): string | undefined {
  const segment = readConfigSegments().find(
    (candidate): candidate is Extract<ConfigSegment, { kind: "host" }> => candidate.kind === "host" && candidate.host === host,
  );

  return segment?.lines.join("\n");
}

function ensureAgentEnvironment(): void {
  if (detectPlatform() === "windows") {
    return;
  }

  if (process.env.SSH_AUTH_SOCK) {
    return;
  }

  const result = runCommand("ssh-agent", ["-s"]);
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "Unable to start ssh-agent.");
  }

  for (const match of result.stdout.matchAll(/(\w+)=([^;]+);/g)) {
    process.env[match[1]] = match[2];
  }
}

function addKeyToAgent(keyPath: string): void {
  if (!commandExists("ssh-add")) {
    warn("ssh-add was not found, so the key was not added to your agent.");
    return;
  }

  try {
    ensureAgentEnvironment();
    const result = runCommand("ssh-add", [keyPath]);
    if (result.status !== 0) {
      throw new Error(result.stderr.trim() || result.stdout.trim() || "ssh-add failed.");
    }
    success("Added key to the SSH agent.");
  } catch (error) {
    warn(error instanceof Error ? error.message : String(error));
  }
}

function removeKeyFromAgent(keyPath: string): void {
  if (!commandExists("ssh-add")) {
    return;
  }

  try {
    ensureAgentEnvironment();
  } catch {
    return;
  }

  runCommand("ssh-add", ["-d", keyPath]);
}

function copyToClipboard(text: string): boolean {
  const platform = detectPlatform();

  const tryCopy = (command: string, args: string[] = []) => {
    if (!commandExists(command)) {
      return false;
    }

    const result = runCommand(command, args, {
      input: text,
    });
    return result.status === 0;
  };

  if (platform === "macos") {
    return tryCopy("pbcopy");
  }

  if (platform === "windows") {
    return tryCopy("clip.exe") || tryCopy("clip");
  }

  if (platform === "wsl") {
    return tryCopy("clip.exe") || tryCopy("xclip", ["-selection", "clipboard"]) || tryCopy("xsel", ["--clipboard", "--input"]);
  }

  return tryCopy("xclip", ["-selection", "clipboard"]) || tryCopy("xsel", ["--clipboard", "--input"]);
}

function openInBrowser(url: string): boolean {
  const platform = detectPlatform();

  const tryOpen = (command: string, args: string[]) => {
    if (!commandExists(command)) {
      return false;
    }
    const result = runCommand(command, args, {
      stdio: "ignore",
    });
    return result.status === 0;
  };

  if (platform === "macos") {
    return tryOpen("open", [url]);
  }

  if (platform === "windows") {
    return tryOpen("cmd", ["/c", "start", "", url]) || tryOpen("powershell", ["-NoProfile", "-Command", "Start-Process", url]);
  }

  return tryOpen("xdg-open", [url]);
}

function generateKey(provider: ProviderKey, email: string, keyPath: string): void {
  requireCommand("ssh-keygen");

  const args =
    provider === "azure"
      ? ["-t", "rsa", "-b", "4096", "-C", email, "-f", keyPath, "-N", ""]
      : ["-t", "ed25519", "-C", email, "-f", keyPath, "-N", ""];

  const result = runCommand("ssh-keygen", args, {
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error("ssh-keygen failed.");
  }
}

function readPublicKey(keyName: string): string {
  const publicKeyPath = join(SSH_DIR, `${keyName}.pub`);
  if (!existsSync(publicKeyPath)) {
    throw new Error(`Public key not found: ${publicKeyPath}`);
  }
  return readFileSync(publicKeyPath, "utf8").trim();
}

function testConnection(host: string, keyPath?: string): { success: boolean; output: string } {
  requireCommand("ssh");

  const args = ["-T"];
  if (keyPath) {
    args.push("-i", keyPath);
  }
  args.push("-o", "StrictHostKeyChecking=accept-new", "-o", "BatchMode=yes", `git@${host}`);

  const result = runCommand("ssh", args);
  const output = `${result.stdout}${result.stderr}`.trim();
  const successPattern = /successfully authenticated|shell access is not supported|authenticated/i;
  const success = result.status === 0 || result.status === 1 || successPattern.test(output);

  return {
    success,
    output,
  };
}

function configureGitForKey(gitContext: GitContext, keyName: string, host: string, email: string): void {
  if (!commandExists("git")) {
    warn("git is not installed, so per-host git config was skipped.");
    return;
  }

  const defaultName = gitContext.username || email.split("@")[0];
  const gitConfigPath = join(SSH_DIR, `.gitconfig-${keyName}`);
  const gitName = defaultName;

  writeFileSync(gitConfigPath, `[user]\n    name = ${gitName}\n    email = ${email}\n`);

  const includeKeys = [
    `includeIf."hasconfig:remote.*.url:git@${host}:*/**".path`,
    `includeIf."hasconfig:remote.*.url:ssh://git@${host}/**".path`,
  ];

  includeKeys.forEach((includeKey) => {
    const result = runCommand("git", ["config", "--global", includeKey, gitConfigPath]);
    if (result.status !== 0) {
      throw new Error(result.stderr.trim() || `Failed to write ${includeKey}`);
    }
  });

  success(`Saved per-host git identity to ${gitConfigPath}.`);
}

function removeGitConfigForKey(keyName: string): void {
  const gitConfigPath = join(SSH_DIR, `.gitconfig-${keyName}`);
  if (existsSync(gitConfigPath)) {
    unlinkSync(gitConfigPath);
  }

  if (!commandExists("git")) {
    return;
  }

  const result = runCommand("git", ["config", "--global", "--get-regexp", "^includeIf\\..*\\.path$"]);
  if (result.status !== 0) {
    return;
  }

  const target = normalizePathLike(gitConfigPath);

  result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const separatorIndex = line.indexOf(" ");
      if (separatorIndex === -1) {
        return;
      }

      const key = line.slice(0, separatorIndex);
      const value = line.slice(separatorIndex + 1);
      if (normalizePathLike(value) !== target) {
        return;
      }

      runCommand("git", ["config", "--global", "--unset-all", key]);
    });
}

async function handleSetup(options: SetupOptions): Promise<void> {
  ensureSshDir();
  requireCommand("ssh-keygen");

  const gitContext = readGitContext();
  const { provider, email, keyName, host } = await resolveSetupValues(options, gitContext);
  const keyPath = join(SSH_DIR, keyName);
  const publicKeyPath = `${keyPath}.pub`;
  const privateExists = existsSync(keyPath);
  const publicExists = existsSync(publicKeyPath);
  const hostExists = Boolean(getHostBlock(host));
  let overwriteKeyFiles = options.force;

  if ((privateExists || publicExists) && !options.force) {
    if (!process.stdin.isTTY) {
      throw new Error(`Key ${keyName} already exists. Re-run with --force to overwrite it.`);
    }

    const shouldOverwrite = await promptConfirm(`Key ${keyName} already exists. Overwrite it`, false);
    if (!shouldOverwrite) {
      info("Setup cancelled.");
      return;
    }

    overwriteKeyFiles = true;
  }

  if (hostExists && !options.force) {
    if (!process.stdin.isTTY) {
      throw new Error(`SSH config already contains a host entry for ${host}. Re-run with --force to replace it.`);
    }

    const shouldReplaceHost = await promptConfirm(`SSH config already contains ${host}. Replace it`, false);
    if (!shouldReplaceHost) {
      info("Setup cancelled.");
      return;
    }
  }

  if (overwriteKeyFiles) {
    rmSync(keyPath, { force: true });
    rmSync(publicKeyPath, { force: true });
  }

  info(`Setting up ${PROVIDERS[provider].label} SSH access...`);

  let createdKey = false;

  try {
    generateKey(provider, email, keyPath);
    createdKey = true;

    if (!existsSync(keyPath) || !existsSync(publicKeyPath)) {
      throw new Error("ssh-keygen completed but the key files were not created.");
    }

    addKeyToAgent(keyPath);

    const blockState = upsertHostBlock(provider, host, keyName);
    success(blockState === "replaced" ? `Replaced SSH config entry for ${host}.` : `Added SSH config entry for ${host}.`);

    if (!options.noGitConfig && process.stdin.isTTY) {
      const shouldConfigureGit = await promptConfirm("Configure a per-host git identity for this key", true);
      if (shouldConfigureGit) {
        configureGitForKey(gitContext, keyName, host, email);
      }
    }

    const publicKey = readPublicKey(keyName);
    if (!options.noClipboard) {
      if (copyToClipboard(publicKey)) {
        success("Copied the public key to your clipboard.");
      } else {
        warn("Could not copy the public key automatically.");
      }
    }

    info("");
    info("SSH Public Key:");
    info(publicKey);
    info("");

    if (!options.noBrowser) {
      if (openInBrowser(PROVIDERS[provider].settingsUrl)) {
        success(`Opened ${PROVIDERS[provider].label} SSH settings.`);
      } else {
        warn(`Could not open a browser. Add your key at ${PROVIDERS[provider].settingsUrl}`);
      }
    } else {
      info(`Add your key at ${PROVIDERS[provider].settingsUrl}`);
    }

    info("");
    info("Setup complete.");
    info(`Provider: ${PROVIDERS[provider].label}`);
    info(`Host: ${host}`);
    info(`Key: ${keyPath}`);

    if (process.stdin.isTTY && (await promptConfirm("Test the SSH connection now", true))) {
      const result = testConnection(host, keyPath);
      info("");
      if (result.output) {
        info(result.output);
      }
      if (result.success) {
        success("SSH connection looks good.");
      } else {
        warn("SSH connection test failed.");
      }
    }
  } catch (error) {
    if (createdKey && !privateExists && !publicExists) {
      rmSync(keyPath, { force: true });
      rmSync(publicKeyPath, { force: true });
    }
    throw error;
  }
}

function handleTest(host: string): void {
  const result = testConnection(host);
  if (result.output) {
    info(result.output);
  }

  if (!result.success) {
    throw new Error(`SSH test failed for ${host}.`);
  }
}

function handleList(): void {
  const hosts = listHostBlocks();
  if (hosts.length === 0) {
    info("No SSH host entries found in ~/.ssh/config.");
    return;
  }

  hosts.forEach((entry) => {
    const identities = entry.identityFiles.length > 0 ? ` -> ${entry.identityFiles.join(", ")}` : "";
    info(`${entry.host}${identities}`);
  });
}

function handleCopy(keyName: string): void {
  const publicKey = readPublicKey(keyName);
  if (copyToClipboard(publicKey)) {
    success("Copied the public key to your clipboard.");
  } else {
    warn("Could not copy the public key automatically.");
  }
  info(publicKey);
}

function handleRemove(keyName: string): void {
  const keyPath = join(SSH_DIR, keyName);
  const publicKeyPath = `${keyPath}.pub`;

  const removedHosts = removeHostBlocksForKey(keyName);
  removeKeyFromAgent(keyPath);
  removeGitConfigForKey(keyName);
  rmSync(keyPath, { force: true });
  rmSync(publicKeyPath, { force: true });

  success(`Removed key files for ${keyName}.`);
  if (removedHosts.length > 0) {
    success(`Removed SSH config entries: ${removedHosts.join(", ")}`);
  }
}

function handleConfig(host?: string): void {
  if (!existsSync(SSH_CONFIG_PATH)) {
    info("~/.ssh/config does not exist yet.");
    return;
  }

  if (!host) {
    info(readFileSync(SSH_CONFIG_PATH, "utf8").trimEnd());
    return;
  }

  const block = getHostBlock(host);
  if (!block) {
    throw new Error(`No SSH config entry found for ${host}.`);
  }
  info(block);
}

function handleAgent(action: "list" | "add" | "remove", key?: string): void {
  requireCommand("ssh-add");

  if (action === "list") {
    try {
      ensureAgentEnvironment();
    } catch {
      // Ignore missing agent here so we can still surface ssh-add output.
    }
    const result = runCommand("ssh-add", ["-l"]);
    const output = `${result.stdout}${result.stderr}`.trim();
    if (output) {
      info(output);
    }
    if (result.status > 1) {
      throw new Error("Unable to list keys in the SSH agent.");
    }
    return;
  }

  if (!key) {
    throw new Error(`sshx agent ${action} requires a key name.`);
  }

  ensureAgentEnvironment();
  const keyPath = join(SSH_DIR, key);
  const args = action === "add" ? [keyPath] : ["-d", keyPath];
  const result = runCommand("ssh-add", args);
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `ssh-add ${action} failed.`);
  }
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));

  switch (parsed.name) {
    case "help":
      info(getHelpText());
      return;
    case "version":
      info(PACKAGE_VERSION);
      return;
    case "setup":
      await handleSetup(parsed.options);
      return;
    case "test":
      handleTest(parsed.host);
      return;
    case "list":
      handleList();
      return;
    case "copy":
      handleCopy(parsed.key);
      return;
    case "remove":
      handleRemove(parsed.key);
      return;
    case "config":
      handleConfig(parsed.host);
      return;
    case "agent":
      handleAgent(parsed.action, parsed.key);
      return;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
