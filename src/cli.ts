import packageJson from "../package.json"
import React from "react"
import { render } from "@vancityayush/tui"
import { agentAdd, agentList, agentRemove } from "./commands/agent.js"
import { copy } from "./commands/copy.js"
import { list } from "./commands/list.js"
import { remove } from "./commands/remove.js"
import { readGitContext, setup } from "./commands/setup.js"
import { testConnection } from "./commands/test.js"
import { getHelpText, parseCliArgs, resolveSetupOptions } from "./cli-core.js"
import { App } from "./tui/App.js"

const PACKAGE_VERSION = packageJson.version ?? "0.0.0"

async function main(argv: string[]): Promise<void> {
  try {
    const invocation = parseCliArgs(argv)

    if (invocation.mode === "tui") {
      await render(React.createElement(App))
      return
    }

    switch (invocation.command.name) {
      case "help":
        console.log(getHelpText())
        return
      case "version":
        console.log(PACKAGE_VERSION)
        return
      case "setup": {
        const result = await setup(resolveSetupOptions(invocation.command.options, readGitContext()))
        console.log(`Key generated: ~/.ssh/${result.keyName}`)
        console.log(`Host configured: ${result.host}`)
        console.log(result.publicKey)
        if (!result.clipboardCopied) {
          console.error("Warning: could not copy the public key to the clipboard.")
        }
        if (!result.browserOpened) {
          console.error("Warning: could not open the provider SSH settings page.")
        }
        return
      }
      case "list": {
        const keys = await list()
        if (keys.length === 0) {
          console.log("No managed keys found.")
          return
        }
        for (const key of keys) {
          console.log(`${key.name}\t${key.host}\t${key.provider ?? "unknown"}`)
        }
        return
      }
      case "remove": {
        const result = await remove(invocation.command.key)
        console.log(`Removed ${invocation.command.key}`)
        if (result.removedHosts.length > 0) {
          console.log(`Removed hosts: ${result.removedHosts.join(", ")}`)
        }
        return
      }
      case "copy": {
        const result = await copy(invocation.command.key)
        if (result.copied) {
          console.error(`Copied ${invocation.command.key} public key to clipboard.`)
        }
        console.log(result.publicKey)
        return
      }
      case "test": {
        const result = await testConnection(invocation.command.provider)
        if (result.output) {
          console.log(result.output)
        }
        if (!result.success) {
          process.exitCode = 1
        }
        return
      }
      case "agent":
        switch (invocation.command.action) {
          case "list": {
            const keys = await agentList()
            if (keys.length === 0) {
              console.log("No keys loaded in ssh-agent.")
              return
            }
            for (const key of keys) {
              console.log(`${key.path}\t${key.fingerprint}\t${key.type}`)
            }
            return
          }
          case "add":
            await agentAdd(invocation.command.key!)
            console.log(`Added ${invocation.command.key} to ssh-agent`)
            return
          case "remove":
            await agentRemove(invocation.command.key!)
            console.log(`Removed ${invocation.command.key} from ssh-agent`)
            return
        }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(message)
    process.exitCode = 1
  }
}

void main(process.argv.slice(2))
