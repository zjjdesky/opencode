import { Bus } from "@/bus"
import { BusEvent } from "@/bus/bus-event"
import { Config } from "@/config/config"
import { Identifier } from "@/id/id"
import { Instance } from "@/project/instance"
import { fn } from "@/util/fn"
import { Log } from "@/util/log"
import { Wildcard } from "@/util/wildcard"
import { sortBy } from "remeda"
import z from "zod"

export namespace PermissionNext {
  const log = Log.create({ service: "permission" })

  export const Action = z.enum(["allow", "deny", "ask"]).meta({
    ref: "PermissionAction",
  })
  export type Action = z.infer<typeof Action>

  export const Rule = z
    .object({
      pattern: z.string(),
      action: Action,
    })
    .meta({
      ref: "PermissionRule",
    })
  export type Rule = z.infer<typeof Rule>

  export const Ruleset = z.record(z.string(), Rule.array()).meta({
    ref: "PermissionRuleset",
  })
  export type Ruleset = z.infer<typeof Ruleset>

  export function fromConfig(permission: Config.Permission) {
    const ruleset: Ruleset = {}
    for (const [key, value] of Object.entries(permission)) {
      if (typeof value === "string") {
        ruleset[key] = [
          {
            action: value,
            pattern: "*",
          },
        ]
        continue
      }
      ruleset[key] = Object.entries(value).map(([pattern, action]) => ({ pattern, action }))
    }
    return ruleset
  }

  export function merge(...rulesets: Ruleset[]): Ruleset {
    const result: Ruleset = {}
    for (const ruleset of rulesets) {
      for (const [permission, rules] of Object.entries(ruleset)) {
        if (!result[permission]) {
          result[permission] = rules
          continue
        }
        result[permission] = result[permission].concat(rules)
      }
    }
    return result as Ruleset
  }

  export const Request = z
    .object({
      id: Identifier.schema("permission"),
      sessionID: Identifier.schema("session"),
      permission: z.string(),
      patterns: z.string().array(),
      title: z.string(),
      description: z.string(),
      metadata: z.record(z.string(), z.any()),
      always: z.string().array(),
    })
    .meta({
      ref: "PermissionRequest",
    })

  export type Request = z.infer<typeof Request>

  export const Reply = z.enum(["once", "always", "reject"])
  export type Reply = z.infer<typeof Reply>

  export const Approval = z.object({
    projectID: z.string(),
    patterns: z.string().array(),
  })

  export const Event = {
    Asked: BusEvent.define("permission.asked", Request),
    Replied: BusEvent.define(
      "permission.replied",
      z.object({
        sessionID: z.string(),
        requestID: z.string(),
        reply: Reply,
      }),
    ),
  }

  const state = Instance.state(() => {
    const pending: Record<
      string,
      {
        info: Request
        resolve: () => void
        reject: (e: any) => void
      }
    > = {}

    const approved: {
      [projectID: string]: Set<string>
    } = {}

    return {
      pending,
      approved,
    }
  })

  export const ask = fn(
    Request.partial({ id: true }).extend({
      ruleset: Ruleset,
    }),
    async (input) => {
      const { ruleset, ...request } = input
      for (const pattern of request.patterns ?? []) {
        const action = evaluate(request.permission, pattern, ruleset)
        log.info("evaluated", { permission: request.permission, pattern, action })
        if (action === "deny") throw new RejectedError()
        if (action === "ask") {
          const id = input.id ?? Identifier.ascending("permission")
          return new Promise<void>((resolve, reject) => {
            const s = state()
            const info: Request = {
              id,
              ...request,
            }
            s.pending[id] = {
              info,
              resolve,
              reject,
            }
            Bus.publish(Event.Asked, info)
          })
        }
        if (action === "allow") continue
      }
    },
  )

  export const respond = fn(
    z.object({
      requestID: Identifier.schema("permission"),
      response: Reply,
    }),
    async (input) => {
      const existing = state().pending[input.requestID]
      if (!existing) return
      delete state().pending[input.requestID]
      if (input.response === "reject") {
        existing.reject(new RejectedError())
        return
      }
      if (input.response === "once") {
        existing.resolve()
        Bus.publish(Event.Replied, {
          sessionID: existing.info.sessionID,
          requestID: existing.info.id,
          reply: input.response,
        })
        return
      }
      if (input.response === "always") {
        existing.resolve()
        Bus.publish(Event.Replied, {
          sessionID: existing.info.sessionID,
          requestID: existing.info.id,
          reply: input.response,
        })
        return
      }
    },
  )

  export function evaluate(permission: string, pattern: string, ruleset: Ruleset): Action {
    log.info("evaluate", { permission, pattern, ruleset })
    const rules: Rule[] = []
    const entries = sortBy(Object.entries(ruleset), ([k]) => k.length)
    for (const [permPattern, permRules] of entries) {
      if (Wildcard.match(permission, permPattern)) {
        rules.push(...permRules)
      }
    }
    const match = rules.findLast((rule) => Wildcard.match(pattern, rule.pattern))
    return match?.action ?? "ask"
  }

  const EDIT_TOOLS = ["edit", "write", "patch", "multiedit"]

  export function disabledTools(tools: string[], ruleset: Ruleset): Set<string> {
    const disabled = new Set<string>()
    for (const tool of tools) {
      const permission = EDIT_TOOLS.includes(tool) ? "edit" : tool
      if (evaluate(permission, "*", ruleset) === "deny") {
        disabled.add(tool)
      }
    }
    return disabled
  }

  export class RejectedError extends Error {
    constructor(public readonly reason?: string) {
      super(
        reason !== undefined
          ? reason
          : `The user rejected permission to use this specific tool call. You may try again with different parameters.`,
      )
    }
  }
}
