import React, { useEffect, useState } from "react";
import { Box, CustomSelect, ListItem, Spinner, Text, useInput } from "@vancityayush/tui";
import { agentAdd, agentList, agentRemove, type AgentKey } from "../../commands/agent";
import { list } from "../../commands/list";
import { Header } from "../components/Header";

type Props = {
  onBack: () => void;
};

type View = "list" | "add";

export function Agent({ onBack }: Props): React.ReactNode {
  const [view, setView] = useState<View>("list");
  const [agentKeys, setAgentKeys] = useState<AgentKey[]>([]);
  const [managedKeys, setManagedKeys] = useState<Array<{ label: string; value: string; description: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    try {
      const [nextAgentKeys, nextManagedKeys] = await Promise.all([
        agentList(),
        list(),
      ]);

      setAgentKeys(nextAgentKeys);
      setManagedKeys(
        nextManagedKeys.map(key => ({
          label: key.name,
          value: key.name,
          description: key.host,
        })),
      );
      setSelectedIndex(index => (nextAgentKeys.length === 0 ? 0 : Math.min(index, nextAgentKeys.length - 1)));
      setError(null);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
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

    if (key.escape) {
      if (view === "add") {
        setView("list");
      } else {
        onBack();
      }
      return;
    }

    if (view !== "list" || agentKeys.length === 0) {
      if (view === "list" && input === "a") {
        setView("add");
      }
      return;
    }

    if (key.upArrow) {
      setSelectedIndex(index => Math.max(0, index - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex(index => Math.min(agentKeys.length - 1, index + 1));
      return;
    }

    if (input === "a") {
      setView("add");
      return;
    }

    if (input === "d") {
      const currentKey = agentKeys[selectedIndex];
      if (currentKey) {
        void handleRemove(currentKey.path);
      }
    }
  });

  async function handleAdd(keyName: string): Promise<void> {
    setView("list");
    try {
      await agentAdd(keyName);
      setStatus(`Added ${keyName} to ssh-agent.`);
      await refresh();
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : String(addError));
    }
  }

  async function handleRemove(keyPath: string): Promise<void> {
    const keyName = keyPath.split(/[\\/]/).pop() ?? keyPath;

    try {
      await agentRemove(keyName);
      setStatus(`Removed ${keyName} from ssh-agent.`);
      await refresh();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : String(removeError));
    }
  }

  if (loading) {
    return (
      <Box flexDirection="column">
        <Header subtitle="SSH agent" />
        <Spinner label="Loading agent state..." />
      </Box>
    );
  }

  if (view === "add") {
    return (
      <Box flexDirection="column">
        <Header subtitle="Add a managed key to ssh-agent" />
        {managedKeys.length === 0 ? (
          <Text dimColor>No managed keys found. Run setup first.</Text>
        ) : (
          <CustomSelect
            options={managedKeys}
            onCancel={() => setView("list")}
            onChange={(value: string) => {
              void handleAdd(value);
            }}
            visibleOptionCount={Math.min(6, Math.max(1, managedKeys.length))}
          />
        )}
        <Box marginTop={1}>
          <Text dimColor>Esc back</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Header subtitle={`${agentKeys.length} key${agentKeys.length === 1 ? "" : "s"} loaded in ssh-agent`} />

      {agentKeys.length === 0 ? <Text dimColor>No keys are currently loaded. Press a to add one.</Text> : null}

      {agentKeys.map((key, index) => (
        <ListItem
          key={`${key.fingerprint}-${key.path}`}
          isFocused={index === selectedIndex}
          isSelected={index === selectedIndex}
          description={key.type}
        >
          {key.path.split(/[\\/]/).pop() ?? key.path}
        </ListItem>
      ))}

      {status ? (
        <Box marginTop={1}>
          <Text dimColor>{status}</Text>
        </Box>
      ) : null}
      {error ? (
        <Box marginTop={1}>
          <Text color="red">{error}</Text>
        </Box>
      ) : null}

      <Box marginTop={1}>
        <Text dimColor>↑↓ navigate · a add key · d remove key · Esc back</Text>
      </Box>
    </Box>
  );
}
