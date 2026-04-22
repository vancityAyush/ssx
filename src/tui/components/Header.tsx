import React from "react"
import { Box, Text } from "@vancityayush/tui"

type Props = {
  subtitle?: string
}

export function Header({ subtitle }: Props): React.ReactNode {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color="cyan">
        sshx — SSH Key Manager
      </Text>
      {subtitle && (
        <Text dimColor>{subtitle}</Text>
      )}
    </Box>
  )
}
