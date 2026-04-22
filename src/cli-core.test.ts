import { describe, expect, it } from "bun:test"
import {
  parseCliArgs,
  resolveSetupOptions,
} from "./cli-core"

describe("parseCliArgs", () => {
  it("routes no args to the TUI", () => {
    expect(parseCliArgs([])).toEqual({ mode: "tui" })
  })

  it("parses shorthand provider setup invocation", () => {
    expect(parseCliArgs(["github", "-e", "dev@example.com", "-k", "id_github"])).toEqual({
      mode: "headless",
      command: {
        name: "setup",
        options: {
          provider: "github",
          email: "dev@example.com",
          key: "id_github",
          force: false,
          noGitConfig: false,
          noBrowser: false,
          noClipboard: false,
        },
      },
    })
  })

  it("parses agent add and requires a key argument", () => {
    expect(parseCliArgs(["agent", "add", "id_work"])).toEqual({
      mode: "headless",
      command: {
        name: "agent",
        action: "add",
        key: "id_work",
      },
    })

    expect(() => parseCliArgs(["agent", "add"])).toThrow("Usage: sshx agent add <key>")
  })
})

describe("resolveSetupOptions", () => {
  it("fills setup defaults from git context", () => {
    expect(
      resolveSetupOptions(
        {
          provider: undefined,
          email: undefined,
          key: undefined,
          host: undefined,
          force: false,
          noGitConfig: false,
          noBrowser: false,
          noClipboard: false,
        },
        {
          email: "dev@example.com",
          remoteUrl: "git@github.com:vancityAyush/sshx.git",
        },
      ),
    ).toEqual({
      provider: "github",
      email: "dev@example.com",
      keyName: "id_ed25519_github",
      host: undefined,
      force: false,
      noGitConfig: false,
      noBrowser: false,
      noClipboard: false,
    })
  })

  it("throws when headless setup still lacks required values", () => {
    expect(() =>
      resolveSetupOptions(
        {
          provider: undefined,
          email: undefined,
          key: undefined,
          host: undefined,
          force: false,
          noGitConfig: false,
          noBrowser: false,
          noClipboard: false,
        },
        {},
      ),
    ).toThrow("Headless setup requires")
  })
})
