import { readPublicKey } from "../ssh/keygen.js"
import { copyToClipboard } from "../platform.js"

export async function copy(keyName: string): Promise<{ publicKey: string; copied: boolean }> {
  const publicKey = readPublicKey(keyName)
  const copied = copyToClipboard(publicKey)
  return { publicKey, copied }
}
