import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { type ProviderKey, PROVIDERS } from "../providers";
import { commandExists } from "../platform";
import { SSH_DIR } from "./config";

export function generateKey(provider: ProviderKey, email: string, keyName: string): void {
  const keyPath = join(SSH_DIR, keyName);

  if (!commandExists("ssh-keygen")) {
    throw new Error("ssh-keygen is required but not found on PATH.");
  }

  const args =
    PROVIDERS[provider].keyType === "rsa"
      ? ["-t", "rsa", "-b", "4096", "-C", email, "-f", keyPath, "-N", ""]
      : ["-t", "ed25519", "-C", email, "-f", keyPath, "-N", ""];

  const result = spawnSync("ssh-keygen", args, { stdio: "inherit", encoding: "utf8" });
  if (result.error) {
    throw result.error;
  }

  if ((result.status ?? 1) !== 0) {
    throw new Error("ssh-keygen failed.");
  }
}

export function readPublicKey(keyName: string): string {
  const publicKeyPath = join(SSH_DIR, `${keyName}.pub`);
  if (!existsSync(publicKeyPath)) {
    throw new Error(`Public key not found: ${publicKeyPath}`);
  }

  return readFileSync(publicKeyPath, "utf8").trim();
}

export function keyExists(keyName: string): boolean {
  return existsSync(join(SSH_DIR, keyName));
}

export function deleteKeyFiles(keyName: string): void {
  const keyPath = join(SSH_DIR, keyName);

  try {
    unlinkSync(keyPath);
  } catch {
    // Ignore missing private key.
  }

  try {
    unlinkSync(`${keyPath}.pub`);
  } catch {
    // Ignore missing public key.
  }
}
