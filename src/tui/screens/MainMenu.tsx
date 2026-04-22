import React from "react";
import { Box, CustomSelect, Text } from "@vancityayush/tui";
import { Header } from "../components/Header";

export type MainMenuAction = "setup" | "key-list" | "test-connection" | "agent";

const MENU_OPTIONS: Array<{ label: string; value: MainMenuAction; description: string }> = [
  {
    label: "Setup new key",
    value: "setup",
    description: "Generate a new SSH key and configure a provider host.",
  },
  {
    label: "List / manage keys",
    value: "key-list",
    description: "Copy or remove managed SSH keys.",
  },
  {
    label: "Test connection",
    value: "test-connection",
    description: "Run ssh -T against a provider host.",
  },
  {
    label: "SSH agent",
    value: "agent",
    description: "See which keys are loaded and add or remove them.",
  },
];

type Props = {
  onSelect: (action: MainMenuAction) => void;
};

export function MainMenu({ onSelect }: Props): React.ReactNode {
  return (
    <Box flexDirection="column">
      <Header subtitle="Select an action" />
      <CustomSelect
        options={MENU_OPTIONS}
        onChange={(value: MainMenuAction) => onSelect(value)}
        visibleOptionCount={4}
      />
      <Box marginTop={1}>
        <Text dimColor>Enter select · q exit</Text>
      </Box>
    </Box>
  );
}
