export type ProviderKey = "bitbucket" | "github" | "gitlab" | "azure"

export type Provider = {
  label: string
  hostname: string
  settingsUrl: string
  keyType: "ed25519" | "rsa"
}

export const PROVIDERS: Record<ProviderKey, Provider> = {
  github: {
    label: "GitHub",
    hostname: "github.com",
    settingsUrl: "https://github.com/settings/keys",
    keyType: "ed25519",
  },
  gitlab: {
    label: "GitLab",
    hostname: "gitlab.com",
    settingsUrl: "https://gitlab.com/-/profile/keys",
    keyType: "ed25519",
  },
  bitbucket: {
    label: "Bitbucket",
    hostname: "bitbucket.org",
    settingsUrl: "https://bitbucket.org/account/settings/ssh-keys/",
    keyType: "ed25519",
  },
  azure: {
    label: "Azure DevOps",
    hostname: "ssh.dev.azure.com",
    settingsUrl: "https://dev.azure.com/_usersSettings/keys",
    keyType: "rsa",
  },
}

export const PROVIDER_KEYS = Object.keys(PROVIDERS) as ProviderKey[]

export function detectProviderFromHostname(hostname: string): ProviderKey | undefined {
  for (const [key, provider] of Object.entries(PROVIDERS) as [ProviderKey, Provider][]) {
    if (hostname.includes(provider.hostname)) return key
  }
  return undefined
}

export function detectProviderFromRemoteUrl(url: string): ProviderKey | undefined {
  if (url.includes("github.com")) return "github"
  if (url.includes("gitlab.com")) return "gitlab"
  if (url.includes("bitbucket.org")) return "bitbucket"
  if (url.includes("dev.azure.com") || url.includes("vs-ssh.visualstudio.com")) return "azure"
  return undefined
}

export function normalizeProviderKey(value: string): ProviderKey | undefined {
  const v = value.trim().toLowerCase()
  if (v === "github" || v === "gh") return "github"
  if (v === "gitlab" || v === "gl") return "gitlab"
  if (v === "bitbucket" || v === "bb") return "bitbucket"
  if (v === "azure" || v === "azure-devops" || v === "azuredevops") return "azure"
  return undefined
}
