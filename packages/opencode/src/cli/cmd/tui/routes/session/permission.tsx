import { createStore } from "solid-js/store"
import { For } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { useTheme } from "../../context/theme"
import type { PermissionRequest } from "@opencode-ai/sdk/v2"

const OPTIONS = ["allow", "always allow", "deny"] as const
type Option = (typeof OPTIONS)[number]

export function PermissionPrompt(props: { request: PermissionRequest }) {
  const { theme } = useTheme()
  const [store, setStore] = createStore({
    active: "allow" as Option,
  })

  useKeyboard((evt) => {
    if (evt.name === "left") {
      const idx = OPTIONS.indexOf(store.active)
      const next = OPTIONS[(idx - 1 + OPTIONS.length) % OPTIONS.length]
      setStore("active", next)
    }

    if (evt.name === "right") {
      const idx = OPTIONS.indexOf(store.active)
      const next = OPTIONS[(idx + 1) % OPTIONS.length]
      setStore("active", next)
    }
  })

  return (
    <box backgroundColor={theme.backgroundPanel}>
      <box gap={1} paddingLeft={3} paddingRight={3} paddingTop={1} paddingBottom={1}>
        <box flexDirection="row" gap={1}>
          <text fg={theme.warning}>{"△"}</text>
          <text fg={theme.text}>Permission required</text>
        </box>
        <box flexDirection="row" gap={1}>
          <text fg={theme.textMuted}>{"→"}</text>
          <text fg={theme.textMuted}>{props.request.title}</text>
        </box>
      </box>
      <box
        flexDirection="row"
        gap={1}
        paddingLeft={3}
        paddingRight={3}
        paddingTop={1}
        paddingBottom={1}
        backgroundColor={theme.backgroundElement}
        justifyContent="space-between"
      >
        <box flexDirection="row" gap={1}>
          <For each={[...OPTIONS]}>
            {(option) => (
              <box
                paddingLeft={1}
                paddingRight={1}
                backgroundColor={option === store.active ? theme.primary : theme.backgroundMenu}
              >
                <text fg={option === store.active ? theme.selectedListItemText : theme.textMuted}>{option}</text>
              </box>
            )}
          </For>
        </box>
        <box flexDirection="row" gap={2}>
          <text fg={theme.textMuted}>
            {"⇆"} <span style={{ fg: theme.text }}>select</span>
          </text>
          <text fg={theme.textMuted}>
            <span style={{ fg: theme.text }}>enter</span> confirm
          </text>
        </box>
      </box>
    </box>
  )
}
