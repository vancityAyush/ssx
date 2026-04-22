import React, { useState } from "react";
import { Box, useApp, useInput } from "@vancityayush/tui";
import { MainMenu, type MainMenuAction } from "./screens/MainMenu";
import { Agent } from "./screens/Agent";
import { KeyList } from "./screens/KeyList";
import { Setup } from "./screens/Setup";
import { TestConnection } from "./screens/TestConnection";

type Screen = "main-menu" | MainMenuAction;

export function App(): React.ReactNode {
  const { exit } = useApp();
  const [screen, setScreen] = useState<Screen>("main-menu");

  useInput((input, key) => {
    if (screen === "main-menu" && ((key.ctrl && input === "c") || input === "q")) {
      exit();
    }
  });

  const goBack = () => setScreen("main-menu");

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      {screen === "main-menu" ? <MainMenu onSelect={action => setScreen(action)} /> : null}
      {screen === "setup" ? <Setup onBack={goBack} /> : null}
      {screen === "key-list" ? <KeyList onBack={goBack} /> : null}
      {screen === "test-connection" ? <TestConnection onBack={goBack} /> : null}
      {screen === "agent" ? <Agent onBack={goBack} /> : null}
    </Box>
  );
}
