import { type ProviderKey, detectProviderFromHostname } from "../providers";
import { expandHomePath, listManagedHostBlocks } from "../ssh/config";

export type ManagedKey = {
  name: string;
  host: string;
  provider?: ProviderKey;
  publicKeyPath: string;
};

export async function list(): Promise<ManagedKey[]> {
  return listManagedHostBlocks().map(block => {
    const rawIdentityPath = block.identityFiles[0] ?? "";
    const name = rawIdentityPath.replace(/^.*[\\/]/, "");
    const publicKeyPath = `${expandHomePath(rawIdentityPath)}.pub`;

    return {
      name,
      host: block.host,
      provider: detectProviderFromHostname(block.hostname),
      publicKeyPath,
    };
  });
}
