import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, normalize } from "node:path";
import { type ProviderKey, PROVIDERS } from "../providers";

export const SSH_DIR = join(homedir(), ".ssh");
export const SSH_CONFIG_PATH = join(SSH_DIR, "config");
export const SSHX_MARKER = "# sshx";

export type ConfigSegment =
  | { kind: "text"; lines: string[] }
  | { kind: "host"; host: string; lines: string[]; managed: boolean };

function isHostStart(line: string): boolean {
  return /^Host\s+/i.test(line) && !/^\s/.test(line);
}

function parseHostName(line: string): string {
  return line.replace(/^Host\s+/i, "").replace(/\s*#.*$/, "").trim();
}

export function parseConfigSegments(content: string): ConfigSegment[] {
  const normalized = content.replace(/\r\n/g, "\n");
  if (!normalized.trim()) {
    return [];
  }

  const lines = normalized.split("\n");
  const segments: ConfigSegment[] = [];
  let textLines: string[] = [];
  let hostLines: string[] | null = null;
  let hostName = "";
  let hostManaged = false;

  const flushText = () => {
    if (textLines.length > 0) {
      segments.push({ kind: "text", lines: [...textLines] });
      textLines = [];
    }
  };

  const flushHost = () => {
    if (hostLines !== null) {
      segments.push({
        kind: "host",
        host: hostName,
        lines: [...hostLines],
        managed: hostManaged,
      });
      hostLines = null;
      hostName = "";
      hostManaged = false;
    }
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const next = lines[index + 1];

    if (line.trim() === SSHX_MARKER && next && isHostStart(next)) {
      flushText();
      flushHost();
      hostName = parseHostName(next);
      hostManaged = true;
      hostLines = [line, next];
      index += 1;
      continue;
    }

    if (isHostStart(line)) {
      flushText();
      flushHost();
      hostName = parseHostName(line);
      hostManaged = line.includes(SSHX_MARKER);
      hostLines = [line];
      continue;
    }

    if (hostLines !== null) {
      if (line.trim() === SSHX_MARKER) {
        hostManaged = true;
      }
      hostLines.push(line);
    } else {
      textLines.push(line);
    }
  }

  flushText();
  flushHost();

  return segments;
}

export function serializeConfigSegments(segments: ConfigSegment[]): string {
  const blocks = segments
    .map(segment => segment.lines.join("\n").trimEnd())
    .filter(Boolean);

  if (blocks.length === 0) {
    return "";
  }

  return `${blocks.join("\n\n")}\n`;
}

export function readConfigSegments(): ConfigSegment[] {
  if (!existsSync(SSH_CONFIG_PATH)) {
    return [];
  }

  return parseConfigSegments(readFileSync(SSH_CONFIG_PATH, "utf8"));
}

export function writeConfigSegments(segments: ConfigSegment[]): void {
  mkdirSync(SSH_DIR, { recursive: true });
  writeFileSync(SSH_CONFIG_PATH, serializeConfigSegments(segments));
}

export function extractIdentityFiles(lines: string[]): string[] {
  return lines
    .map(line => line.match(/^\s*IdentityFile\s+(.+)$/i)?.[1]?.trim())
    .filter((value): value is string => Boolean(value))
    .map(value => value.replace(/^"(.*)"$/, "$1"));
}

export function extractHostName(lines: string[]): string {
  const match = lines
    .map(line => line.match(/^\s*HostName\s+(.+)$/i))
    .find(Boolean);

  return match?.[1]?.trim() ?? "";
}

export function expandHomePath(filePath: string): string {
  if (filePath === "~") {
    return homedir();
  }

  if (filePath.startsWith("~/")) {
    return join(homedir(), filePath.slice(2));
  }

  return filePath;
}

export function normalizePath(filePath: string): string {
  return normalize(expandHomePath(filePath)).replace(/\\/g, "/");
}

export function buildHostBlock(provider: ProviderKey, host: string, keyName: string): string[] {
  const lines = [
    SSHX_MARKER,
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

export function findHostBlock(host: string): Extract<ConfigSegment, { kind: "host" }> | undefined {
  return readConfigSegments().find(
    (segment): segment is Extract<ConfigSegment, { kind: "host" }> => segment.kind === "host" && segment.host === host,
  );
}

export function upsertHostBlock(provider: ProviderKey, host: string, keyName: string): "added" | "replaced" {
  const segments = readConfigSegments();
  const replacement: ConfigSegment = {
    kind: "host",
    host,
    lines: buildHostBlock(provider, host, keyName),
    managed: true,
  };

  let replaced = false;
  const nextSegments = segments.map(segment => {
    if (segment.kind === "host" && segment.host === host) {
      replaced = true;
      return replacement;
    }

    return segment;
  });

  if (!replaced) {
    nextSegments.push(replacement);
  }

  writeConfigSegments(nextSegments);
  return replaced ? "replaced" : "added";
}

export function removeManagedHostBlocksForKey(keyName: string): string[] {
  const keyPathVariants = new Set([
    normalizePath(join(SSH_DIR, keyName)),
    normalizePath(`~/.ssh/${keyName}`),
    normalizePath(keyName),
  ]);

  const removedHosts: string[] = [];
  const nextSegments = readConfigSegments().filter(segment => {
    if (segment.kind !== "host" || !segment.managed) {
      return true;
    }

    const matchesKey = extractIdentityFiles(segment.lines).some(identityFile =>
      keyPathVariants.has(normalizePath(identityFile)),
    );

    if (matchesKey) {
      removedHosts.push(segment.host);
      return false;
    }

    return true;
  });

  writeConfigSegments(nextSegments);
  return removedHosts;
}

export function listManagedHostBlocks(): Array<{
  host: string;
  hostname: string;
  identityFiles: string[];
}> {
  return readConfigSegments()
    .filter((segment): segment is Extract<ConfigSegment, { kind: "host" }> => segment.kind === "host" && segment.managed)
    .map(segment => ({
      host: segment.host,
      hostname: extractHostName(segment.lines) || segment.host,
      identityFiles: extractIdentityFiles(segment.lines),
    }));
}
