import React, { useState, useEffect } from "react"
import { Box, Text, Dialog, ListItem, useInput, Spinner } from "@vancityayush/tui"
import { Header } from "../components/Header.js"
import { list, type ManagedKey } from "../../commands/list.js"
import { remove } from "../../commands/remove.js"
import { copy } from "../../commands/copy.js"
import { PROVIDERS } from "../../providers.js"

type Props = {
  onBack: () => void
}

export function KeyList({ onBack }: Props): React.ReactNode {
  const [keys, setKeys] = useState<ManagedKey[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [dialogActive, setDialogActive] = useState(false)

  useEffect(() => {
    list().then(k => {
      setKeys(k)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  useInput((_input, key) => {
    if (key.escape) { onBack(); return }
    if (key.upArrow) setSelectedIndex(i => Math.max(0, i - 1))
    if (key.downArrow) setSelectedIndex(i => Math.min(keys.length - 1, i + 1))
    if (key.return && keys[selectedIndex]) {
      void handleCopy(keys[selectedIndex]!.name)
    }
    if (key.delete || (_input === "d" && !key.ctrl)) {
      if (keys[selectedIndex]) {
        setConfirmRemove(keys[selectedIndex]!.name)
        setDialogActive(true)
      }
    }
  }, { isActive: !dialogActive && !loading })

  useInput((_input, key) => {
    if (key.escape) { setConfirmRemove(null); setDialogActive(false) }
    if (key.return && confirmRemove) { void handleRemove(confirmRemove) }
  }, { isActive: dialogActive })

  async function handleCopy(name: string): Promise<void> {
    try {
      const r = await copy(name)
      setStatus(r.copied ? `Copied ${name} public key to clipboard` : `Could not copy — key: ${r.publicKey.slice(0, 40)}…`)
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleRemove(name: string): Promise<void> {
    setConfirmRemove(null)
    setDialogActive(false)
    try {
      await remove(name)
      const updated = await list()
      setKeys(updated)
      setSelectedIndex(i => Math.min(i, Math.max(0, updated.length - 1)))
      setStatus(`Removed ${name}`)
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err))
    }
  }

  if (loading) {
    return (
      <Box flexDirection="column">
        <Header subtitle="Managed SSH keys" />
        <Spinner label="Loading keys…" />
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <Header subtitle={`${keys.length} managed key${keys.length !== 1 ? "s" : ""}`} />

      {keys.length === 0 && (
        <Text dimColor>No managed keys found. Run setup to create one.</Text>
      )}

      {keys.map((k, i) => (
        <ListItem
          key={k.name}
          isFocused={i === selectedIndex}
          isSelected={i === selectedIndex}
          description={`${k.host} · ${k.provider ? PROVIDERS[k.provider].label : "unknown provider"}`}
        >
          {k.name}
        </ListItem>
      ))}

      {status && (
        <Box marginTop={1}>
          <Text dimColor>{status}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>↑↓ navigate · Enter copy pubkey · d remove · Esc back</Text>
      </Box>

      {confirmRemove && (
        <Dialog
          title={`Remove "${confirmRemove}"?`}
          subtitle="This will delete the key files and SSH config entry."
          onCancel={() => { setConfirmRemove(null); setDialogActive(false) }}
        >
          <Text>Press Enter to confirm or Esc to cancel.</Text>
        </Dialog>
      )}
    </Box>
  )
}
