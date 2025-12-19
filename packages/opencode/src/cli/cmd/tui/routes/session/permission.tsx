import { createStore } from "solid-js/store"
import { For } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { useTheme } from "../../context/theme"
import type { PermissionRequest } from "@opencode-ai/sdk/v2"
import { useSDK } from "../../context/sdk"

const OPTIONS = {
  once: "Approve once",
  always: "Approve always",
  reject: "Reject",
}
const OPTION_LIST = Object.keys(OPTIONS)
type Option = keyof typeof OPTIONS

export function PermissionPrompt(props: { request: PermissionRequest }) {
  const sdk = useSDK()
  const { theme } = useTheme()
  const [store, setStore] = createStore({
    reply: "once" as Option,
  })

  useKeyboard((evt) => {
    if (evt.name === "left") {
      const idx = OPTION_LIST.indexOf(store.reply)
      const next = OPTION_LIST[(idx - 1 + OPTION_LIST.length) % OPTION_LIST.length]
      setStore("reply", next as Option)
    }

    if (evt.name === "right") {
      const idx = OPTION_LIST.indexOf(store.reply)
      const next = OPTION_LIST[(idx + 1) % OPTION_LIST.length]
      setStore("reply", next as Option)
    }

    if (evt.name === "return") {
      sdk.client.permission.reply({
        reply: store.reply,
        requestID: props.request.id,
      })
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
          <For each={[...OPTION_LIST]}>
            {(option) => (
              <box
                paddingLeft={1}
                paddingRight={1}
                backgroundColor={option === store.reply ? theme.primary : theme.backgroundMenu}
              >
                <text fg={option === store.reply ? theme.selectedListItemText : theme.textMuted}>
                  {OPTIONS[option as Option]}
                </text>
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
