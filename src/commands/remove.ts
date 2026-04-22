import { join } from "node:path"
import { unlinkSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { SSH_DIR, removeManagedHostBlocksForKey } from "../ssh/config.js"
import { deleteKeyFiles } from "../ssh/keygen.js"

export async function remove(keyName: string): Promise<{ removedHosts: string[] }> {
  const keyPath = join(SSH_DIR, keyName)
  removeFromAgent(keyPath)
  const removedHosts = removeManagedHostBlocksForKey(keyName)
  deleteKeyFiles(keyName)
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
