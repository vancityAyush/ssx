import React, { useState } from "react"
import { useApp, useInput } from "@vancityayush/tui"
import { MainMenu, type MainMenuAction } from "./screens/MainMenu.js"
import { Setup } from "./screens/Setup.js"
import { KeyList } from "./screens/KeyList.js"
import { TestConnection } from "./screens/TestConnection.js"
import { Agent } from "./screens/Agent.js"
import { screenForMenuAction, type AppScreen } from "./navigation.js"

export function App(): React.ReactNode {
  const { exit } = useApp()
  const [screen, setScreen] = useState<AppScreen>("main-menu")

  useInput((input, key) => {
    if (screen !== "main-menu") return
    if (input === "q" || key.escape) {
      exit()
    }
  })

  const handleSelect = (action: MainMenuAction) => {
    setScreen(screenForMenuAction(action))
  }

  switch (screen) {
    case "setup":
      return <Setup onBack={() => setScreen("main-menu")} />
    case "key-list":
      return <KeyList onBack={() => setScreen("main-menu")} />
    case "test-connection":
      return <TestConnection onBack={() => setScreen("main-menu")} />
    case "agent":
      return <Agent onBack={() => setScreen("main-menu")} />
    case "main-menu":
    default:
      return <MainMenu onSelect={handleSelect} />
  }
}
