import { describe, it, expect } from "bun:test"
import {
  parseConfigSegments,
  serializeConfigSegments,
  extractIdentityFiles,
  extractHostName,
} from "./config"

describe("parseConfigSegments", () => {
  it("returns empty array for empty input", () => {
    expect(parseConfigSegments("")).toEqual([])
    expect(parseConfigSegments("   \n  ")).toEqual([])
  })

  it("parses a single unmanaged host block", () => {
    const input = `Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519`
    const result = parseConfigSegments(input)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ kind: "host", host: "github.com", managed: false })
  })

  it("parses a managed host block with # sshx marker", () => {
    const input = `Host github.com  # sshx
  HostName github.com
  User git`
    const result = parseConfigSegments(input)
    expect(result[0]).toMatchObject({ kind: "host", host: "github.com", managed: true })
  })

  it("strips # sshx from host name", () => {
    const input = `Host my-alias  # sshx
  HostName github.com`
    const result = parseConfigSegments(input)
    expect(result[0]).toMatchObject({ kind: "host", host: "my-alias" })
  })

  it("preserves leading text segments", () => {
    const input = `# Global SSH config
ServerAliveInterval 60

Host github.com
  User git`
    const result = parseConfigSegments(input)
    expect(result[0]).toMatchObject({ kind: "text" })
    expect(result[1]).toMatchObject({ kind: "host", host: "github.com" })
  })

  it("parses multiple host blocks", () => {
    const input = `Host github.com  # sshx
  IdentityFile ~/.ssh/id_github

Host bitbucket.org  # sshx
  IdentityFile ~/.ssh/id_bb`
    const result = parseConfigSegments(input)
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ host: "github.com", managed: true })
    expect(result[1]).toMatchObject({ host: "bitbucket.org", managed: true })
  })
})

describe("serializeConfigSegments / round-trip", () => {
  it("round-trips a config with text and host blocks", () => {
    const input = `# comment

Host github.com  # sshx
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_github`
    const segments = parseConfigSegments(input)
    const output = serializeConfigSegments(segments)
    expect(output).toContain("Host github.com  # sshx")
    expect(output).toContain("IdentityFile ~/.ssh/id_ed25519_github")
  })
})

describe("extractIdentityFiles", () => {
  it("extracts IdentityFile values from lines", () => {
    const lines = [
      "Host github.com",
      "  HostName github.com",
      "  IdentityFile ~/.ssh/id_ed25519",
      "  IdentityFile ~/.ssh/backup_key",
    ]
    expect(extractIdentityFiles(lines)).toEqual([
      "~/.ssh/id_ed25519",
      "~/.ssh/backup_key",
    ])
  })

  it("strips wrapping quotes", () => {
    const lines = [`  IdentityFile "~/.ssh/my key"`]
    expect(extractIdentityFiles(lines)).toEqual(["~/.ssh/my key"])
  })
})

describe("extractHostName", () => {
  it("extracts HostName from lines", () => {
    const lines = ["Host alias", "  HostName github.com", "  User git"]
    expect(extractHostName(lines)).toBe("github.com")
  })

  it("returns empty string when no HostName", () => {
    expect(extractHostName(["Host github.com"])).toBe("")
  })
})
