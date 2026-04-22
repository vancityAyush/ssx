import React, { useEffect, useState } from "react"
import { basename } from "node:path"
import { Box, CustomSelect, ListItem, Spinner, Text, useInput, type SelectProps } from "@vancityayush/tui"
import { Header } from "../components/Header.js"
import { agentAdd, agentList, agentRemove, type AgentKey } from "../../commands/agent.js"
import { list, type ManagedKey } from "../../commands/list.js"

type Props = {
  onBack: () => void
}

type Mode = "list" | "add"

export function Agent({ onBack }: Props): React.ReactNode {
  const [mode, setMode] = useState<Mode>("list")
  const [keys, setKeys] = useState<AgentKey[]>([])
  const [managedKeys, setManagedKeys] = useState<ManagedKey[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    void refresh()
  }, [])

  useInput((input, key) => {
    if (key.escape) {
      if (mode === "add") {
        setMode("list")
        return
      }
      onBack()
      return
    }

    if (loading) return

    if (mode === "add") {
      return
    }

    if (key.upArrow) {
      setSelectedIndex((current) => Math.max(0, current - 1))
    }
    if (key.downArrow) {
      setSelectedIndex((current) => Math.min(keys.length - 1, current + 1))
    }
    if (input === "a") {
      setMode("add")
    }
    if (input === "r") {
      void refresh()
    }
    if ((input === "d" || key.delete) && keys[selectedIndex]) {
      void removeSelected(keys[selectedIndex])
    }
  })

  async function refresh(): Promise<void> {
    setLoading(true)
    try {
      const [agentKeys, availableManagedKeys] = await Promise.all([agentList(), list()])
      setKeys(agentKeys)
      setManagedKeys(availableManagedKeys)
      setSelectedIndex((current) => Math.min(current, Math.max(0, agentKeys.length - 1)))
      setStatus(null)
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  async function addManagedKey(keyName: string): Promise<void> {
    try {
      await agentAdd(keyName)
      setStatus(`Added ${keyName} to ssh-agent`)
      setMode("list")
      await refresh()
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err))
      setMode("list")
    }
  }

  async function removeSelected(key: AgentKey): Promise<void> {
    try {
      await agentRemove(basename(key.path))
      setStatus(`Removed ${basename(key.path)} from ssh-agent`)
      await refresh()
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err))
    }
  }

  if (loading) {
    return (
      <Box flexDirection="column">
        <Header subtitle="SSH agent" />
        <Spinner label="Loading ssh-agent keys…" />
      </Box>
    )
  }

  if (mode === "add") {
    const options = managedKeys.map((key) => ({
      label: key.name,
      value: key.name,
      description: key.host,
    }))

    return (
      <Box flexDirection="column">
        <Header subtitle="Add managed key to ssh-agent" />
        {options.length > 0 ? (
          <CustomSelect
            {...({
              options,
              onChange: (value: string) => {
                void addManagedKey(value)
              },
              visibleOptionCount: Math.min(6, Math.max(1, options.length)),
            } satisfies SelectProps<string>)}
          />
        ) : (
          <Text dimColor>No managed sshx keys available. Run setup first.</Text>
        )}
        <Box marginTop={1}>
          <Text dimColor>Esc back</Text>
        </Box>
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <Header subtitle={`${keys.length} key${keys.length !== 1 ? "s" : ""} in ssh-agent`} />

      {keys.length === 0 && (
        <Text dimColor>No keys currently loaded in ssh-agent.</Text>
      )}

      {keys.map((key, index) => (
        <ListItem
          key={`${key.fingerprint}-${key.path}`}
          isFocused={index === selectedIndex}
          isSelected={index === selectedIndex}
          description={`${key.type} · ${key.fingerprint}`}
        >
          {key.path}
        </ListItem>
      ))}

      {status && (
        <Box marginTop={1}>
          <Text dimColor>{status}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>a add managed key · d remove selected key · r refresh · Esc back</Text>
      </Box>
    </Box>
  )
}
