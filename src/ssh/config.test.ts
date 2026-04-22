import { describe, expect, it } from "bun:test";
import {
  SSHX_MARKER,
  buildHostBlock,
  extractHostName,
  extractIdentityFiles,
  parseConfigSegments,
  serializeConfigSegments,
} from "./config";

describe("parseConfigSegments", () => {
  it("returns empty array for empty input", () => {
    expect(parseConfigSegments("")).toEqual([]);
    expect(parseConfigSegments("   \n  ")).toEqual([]);
  });

  it("parses a single unmanaged host block", () => {
    const input = `Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519`;

    expect(parseConfigSegments(input)).toEqual([
      {
        kind: "host",
        host: "github.com",
        managed: false,
        lines: input.split("\n"),
      },
    ]);
  });

  it("parses a managed host block with a standalone marker line", () => {
    const input = `${SSHX_MARKER}
Host github.com
  HostName github.com
  User git`;

    expect(parseConfigSegments(input)[0]).toMatchObject({
      kind: "host",
      host: "github.com",
      managed: true,
    });
  });

  it("still recognizes the legacy inline marker syntax", () => {
    const input = `Host my-alias  # sshx
  HostName github.com`;

    expect(parseConfigSegments(input)[0]).toMatchObject({
      kind: "host",
      host: "my-alias",
      managed: true,
    });
  });

  it("preserves leading text segments", () => {
    const input = `# Global SSH config
ServerAliveInterval 60

Host github.com
  User git`;

    const result = parseConfigSegments(input);
    expect(result[0]).toMatchObject({ kind: "text" });
    expect(result[1]).toMatchObject({ kind: "host", host: "github.com" });
  });

  it("parses multiple host blocks", () => {
    const input = `${SSHX_MARKER}
Host github.com
  IdentityFile ~/.ssh/id_github

${SSHX_MARKER}
Host bitbucket.org
  IdentityFile ~/.ssh/id_bb`;

    const result = parseConfigSegments(input);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ host: "github.com", managed: true });
    expect(result[1]).toMatchObject({ host: "bitbucket.org", managed: true });
  });
});

describe("serializeConfigSegments / round-trip", () => {
  it("round-trips a config with text and host blocks", () => {
    const input = `# comment

${SSHX_MARKER}
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_github`;

    const segments = parseConfigSegments(input);
    const output = serializeConfigSegments(segments);

    expect(output).toContain(SSHX_MARKER);
    expect(output).toContain("Host github.com");
    expect(output).toContain("IdentityFile ~/.ssh/id_ed25519_github");
  });
});

describe("extractIdentityFiles", () => {
  it("extracts IdentityFile values from lines", () => {
    const lines = [
      "Host github.com",
      "  HostName github.com",
      "  IdentityFile ~/.ssh/id_ed25519",
      "  IdentityFile ~/.ssh/backup_key",
    ];

    expect(extractIdentityFiles(lines)).toEqual([
      "~/.ssh/id_ed25519",
      "~/.ssh/backup_key",
    ]);
  });

  it("strips wrapping quotes", () => {
    expect(extractIdentityFiles(['  IdentityFile "~/.ssh/my key"'])).toEqual(["~/.ssh/my key"]);
  });
});

describe("extractHostName", () => {
  it("extracts HostName from lines", () => {
    expect(extractHostName(["Host alias", "  HostName github.com", "  User git"])).toBe("github.com");
  });

  it("returns empty string when no HostName exists", () => {
    expect(extractHostName(["Host github.com"])).toBe("");
  });
});

describe("buildHostBlock", () => {
  it("writes a standalone marker line for managed blocks", () => {
    const lines = buildHostBlock("github", "github.com", "id_ed25519_github");
    expect(lines[0]).toBe(SSHX_MARKER);
    expect(lines[1]).toBe("Host github.com");
  });
});
