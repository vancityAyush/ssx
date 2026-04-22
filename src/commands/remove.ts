import { join } from "node:path";
import { unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { commandExists } from "../platform";
import { SSH_DIR, removeManagedHostBlocksForKey } from "../ssh/config";
import { deleteKeyFiles } from "../ssh/keygen";

export async function remove(keyName: string): Promise<{ removedHosts: string[] }> {
  const keyPath = join(SSH_DIR, keyName);

  removeFromAgent(keyPath);
  const removedHosts = removeManagedHostBlocksForKey(keyName);
  deleteKeyFiles(keyName);
  removeGitConfig(keyName);

  return { removedHosts };
}

function removeFromAgent(keyPath: string): void {
  if (!commandExists("ssh-add")) {
    return;
  }

  spawnSync("ssh-add", ["-d", keyPath], { encoding: "utf8" });
}

function removeGitConfig(keyName: string): void {
  const gitConfigPath = join(SSH_DIR, `.gitconfig-${keyName}`);

  try {
    unlinkSync(gitConfigPath);
  } catch {
    // Ignore missing include file.
  }

  if (!commandExists("git")) {
    return;
  }

  const result = spawnSync("git", ["config", "--global", "--get-regexp", "^includeIf\\..*\\.path$"], {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    return;
  }

  const normalizedTargetPath = gitConfigPath.replace(/\\/g, "/");
  for (const line of result.stdout.split("\n").filter(Boolean)) {
    const separatorIndex = line.indexOf(" ");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex);
    const value = line.slice(separatorIndex + 1).trim().replace(/\\/g, "/");
    if (value === normalizedTargetPath) {
      spawnSync("git", ["config", "--global", "--unset", key], { encoding: "utf8" });
    }
  }
}
