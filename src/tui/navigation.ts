import type { MainMenuAction } from "./screens/MainMenu.js"

export type AppScreen = "main-menu" | "setup" | "key-list" | "test-connection" | "agent"

export function screenForMenuAction(action: MainMenuAction): AppScreen {
  return action
}
