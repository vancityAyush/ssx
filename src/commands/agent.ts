import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { commandExists, detectPlatform } from "../platform";
import { SSH_DIR } from "../ssh/config";

export type AgentKey = {
  fingerprint: string;
  path: string;
  type: string;
};

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

function requireSshAdd(): void {
  if (!commandExists("ssh-add")) {
    throw new Error("ssh-add is required but not found on PATH.");
  }
}

export async function agentList(): Promise<AgentKey[]> {
  requireSshAdd();
  ensureAgent();

  const result = spawnSync("ssh-add", ["-l"], { encoding: "utf8" });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();

  if (result.status === 0 && !output) {
    return [];
  }

  if (result.status === 1 && /no identities/i.test(output)) {
    return [];
  }

  if (result.status !== 0) {
    throw new Error(output || "ssh-add -l failed.");
  }

  return output.split("\n").filter(Boolean).map(line => {
    const parts = line.trim().split(/\s+/);
    return {
      fingerprint: parts[1] ?? "",
      path: parts[2] ?? "",
      type: parts[3] ?? "",
    };
  });
}

export async function agentAdd(keyName: string): Promise<void> {
  requireSshAdd();
  ensureAgent();

  const keyPath = join(SSH_DIR, keyName);
  const args = detectPlatform() === "macos" ? ["--apple-use-keychain", keyPath] : [keyPath];
  const result = spawnSync("ssh-add", args, { encoding: "utf8" });
  if (result.status === 0) {
    return;
  }

  const fallback = spawnSync("ssh-add", [keyPath], { encoding: "utf8" });
  if (fallback.status !== 0) {
    throw new Error((fallback.stderr || fallback.stdout || "ssh-add failed.").trim());
  }
}

export async function agentRemove(keyName: string): Promise<void> {
  requireSshAdd();
  ensureAgent();

  const keyPath = join(SSH_DIR, keyName);
  const result = spawnSync("ssh-add", ["-d", keyPath], { encoding: "utf8" });
  if (result.status !== 0 && !/not found/i.test(`${result.stdout ?? ""}${result.stderr ?? ""}`)) {
    throw new Error((result.stderr || result.stdout || "ssh-add -d failed.").trim());
  }
}
