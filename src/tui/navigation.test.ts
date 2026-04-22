import { describe, expect, it } from "bun:test"
import { screenForMenuAction } from "./navigation"

describe("screenForMenuAction", () => {
  it("maps each menu action to its screen", () => {
    expect(screenForMenuAction("setup")).toBe("setup")
    expect(screenForMenuAction("key-list")).toBe("key-list")
    expect(screenForMenuAction("test-connection")).toBe("test-connection")
    expect(screenForMenuAction("agent")).toBe("agent")
  })
})
