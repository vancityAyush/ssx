import React from "react"
import { Box, Text, CustomSelect, type SelectProps } from "@vancityayush/tui"
import { Header } from "../components/Header.js"

export type MainMenuAction = "setup" | "key-list" | "test-connection" | "agent"

const MENU_OPTIONS = [
  { label: "Setup new key",      value: "setup",           description: "Generate an SSH key for a Git provider" },
  { label: "List / manage keys", value: "key-list",        description: "View, copy, or remove your managed SSH keys" },
  { label: "Test connection",    value: "test-connection", description: "Verify an SSH connection to a provider" },
  { label: "SSH Agent",          value: "agent",           description: "List, add, or remove keys from ssh-agent" },
] as const

type Props = {
  onSelect: (action: MainMenuAction) => void
}

export function MainMenu({ onSelect }: Props): React.ReactNode {
  return (
    <Box flexDirection="column">
      <Header subtitle="Select an action" />
      <CustomSelect
        {...({
          options: [...MENU_OPTIONS],
          onChange: (value: MainMenuAction) => onSelect(value),
          visibleOptionCount: 4,
        } satisfies SelectProps<MainMenuAction>)}
      />
      <Box marginTop={1}>
        <Text dimColor>q to exit</Text>
      </Box>
    </Box>
  )
}
