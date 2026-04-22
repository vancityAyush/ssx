import { readFileSync } from "node:fs"
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
