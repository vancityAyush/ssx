import React, { useEffect, useState } from "react";
import { Box, Dialog, ListItem, Spinner, Text, useInput } from "@vancityayush/tui";
import { copy } from "../../commands/copy";
import { list, type ManagedKey } from "../../commands/list";
import { remove } from "../../commands/remove";
import { PROVIDERS } from "../../providers";
import { Header } from "../components/Header";

type Props = {
  onBack: () => void;
};

export function KeyList({ onBack }: Props): React.ReactNode {
  const [keys, setKeys] = useState<ManagedKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    try {
      const nextKeys = await list();
      setKeys(nextKeys);
      setSelectedIndex(currentIndex => (nextKeys.length === 0 ? 0 : Math.min(currentIndex, nextKeys.length - 1)));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useInput((input, key) => {
    if (loading) {
      return;
    }

    if (confirmRemove) {
      if (key.escape) {
        setConfirmRemove(null);
      } else if (key.return) {
        void handleRemove(confirmRemove);
      }
      return;
    }

    if (key.escape) {
      onBack();
      return;
    }

    if (keys.length === 0) {
      return;
    }

    if (key.upArrow) {
      setSelectedIndex(index => Math.max(0, index - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex(index => Math.min(keys.length - 1, index + 1));
      return;
    }

    const currentKey = keys[selectedIndex];
    if (!currentKey) {
      return;
    }

    if (key.return) {
      void handleCopy(currentKey.name);
      return;
    }

    if (input === "d") {
      setConfirmRemove(currentKey.name);
    }
  });

  async function handleCopy(name: string): Promise<void> {
    try {
      const result = await copy(name);
      setStatus(result.copied ? `Copied ${name} to clipboard.` : result.publicKey);
    } catch (copyError) {
      setStatus(copyError instanceof Error ? copyError.message : String(copyError));
    }
  }

  async function handleRemove(name: string): Promise<void> {
    setConfirmRemove(null);
    try {
      await remove(name);
      setStatus(`Removed ${name}.`);
      await refresh();
    } catch (removeError) {
      setStatus(removeError instanceof Error ? removeError.message : String(removeError));
    }
  }

  if (loading) {
    return (
      <Box flexDirection="column">
        <Header subtitle="Managed keys" />
        <Spinner label="Loading managed SSH keys..." />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Header subtitle={`${keys.length} managed key${keys.length === 1 ? "" : "s"}`} />

      {keys.length === 0 ? <Text dimColor>No managed keys found. Run setup first.</Text> : null}

      {keys.map((key, index) => (
        <ListItem
          key={`${key.host}-${key.name}`}
          isFocused={index === selectedIndex}
          isSelected={index === selectedIndex}
          description={`${key.host} · ${key.provider ? PROVIDERS[key.provider].label : "Unknown provider"}`}
        >
          {key.name}
        </ListItem>
      ))}

      {status ? (
        <Box marginTop={1}>
          <Text dimColor>{status}</Text>
        </Box>
      ) : null}

      <Box marginTop={1}>
        <Text dimColor>↑↓ navigate · Enter copy · d remove · Esc back</Text>
      </Box>

      {confirmRemove ? (
        <Dialog
          title={`Remove "${confirmRemove}"?`}
          subtitle="This deletes the key files, managed SSH config block, and per-key git include."
          onCancel={() => setConfirmRemove(null)}
        >
          <Text>Press Enter to confirm or Esc to cancel.</Text>
        </Dialog>
      ) : null}
    </Box>
  );
}
