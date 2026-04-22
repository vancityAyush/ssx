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
