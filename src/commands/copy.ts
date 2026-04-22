import { copyToClipboard } from "../platform";
import { readPublicKey } from "../ssh/keygen";

export async function copy(keyName: string): Promise<{ publicKey: string; copied: boolean }> {
  const publicKey = readPublicKey(keyName);
  return {
    publicKey,
    copied: copyToClipboard(publicKey),
  };
}
