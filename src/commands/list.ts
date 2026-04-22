import { type ProviderKey } from "../providers.js"
import {
  listManagedHostBlocks,
  expandHomePath,
} from "../ssh/config.js"
import { detectProviderFromHostname } from "../providers.js"

export type ManagedKey = {
  name: string
  host: string
  provider?: ProviderKey
  publicKeyPath: string
}

export async function list(): Promise<ManagedKey[]> {
  const blocks = listManagedHostBlocks()
  return blocks.map(block => {
    const raw = block.identityFiles[0] ?? ""
    const keyName = raw.replace(/^.*[\\/]/, "")
    const expanded = expandHomePath(raw)
    const publicKeyPath = `${expanded}.pub`
    return {
      name: keyName,
      host: block.host,
      provider: detectProviderFromHostname(block.hostname),
      publicKeyPath,
    }
  })
}
