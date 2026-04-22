import React from "react";
import { Box, Text } from "@vancityayush/tui";

type Props = {
  subtitle?: string;
};

export function Header({ subtitle }: Props): React.ReactNode {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color="claude">
        sshx
      </Text>
      <Text dimColor>Keyboard-first SSH key setup for Git providers.</Text>
      {subtitle ? <Text dimColor>{subtitle}</Text> : null}
    </Box>
  );
}
