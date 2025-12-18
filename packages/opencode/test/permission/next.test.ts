import { test, expect } from "bun:test"
import { PermissionNext } from "../../src/permission/next"

// fromConfig tests

test("fromConfig - string value becomes wildcard rule", () => {
  const result = PermissionNext.fromConfig({ bash: "allow" })
  expect(result).toEqual({ bash: [{ pattern: "*", action: "allow" }] })
})

test("fromConfig - object value converts to rules array", () => {
  const result = PermissionNext.fromConfig({ bash: { "*": "allow", rm: "deny" } })
  expect(result).toEqual({
    bash: [
      { pattern: "*", action: "allow" },
      { pattern: "rm", action: "deny" },
    ],
  })
})

test("fromConfig - mixed string and object values", () => {
  const result = PermissionNext.fromConfig({
    bash: { "*": "allow", rm: "deny" },
    edit: "allow",
    webfetch: "ask",
  })
  expect(result).toEqual({
    bash: [
      { pattern: "*", action: "allow" },
      { pattern: "rm", action: "deny" },
    ],
    edit: [{ pattern: "*", action: "allow" }],
    webfetch: [{ pattern: "*", action: "ask" }],
  })
})

test("fromConfig - empty object", () => {
  const result = PermissionNext.fromConfig({})
  expect(result).toEqual({})
})

// merge tests

test("merge - simple concatenation", () => {
  const result = PermissionNext.merge(
    { bash: [{ pattern: "*", action: "allow" }] },
    { bash: [{ pattern: "*", action: "deny" }] },
  )
  expect(result).toEqual({
    bash: [
      { pattern: "*", action: "allow" },
      { pattern: "*", action: "deny" },
    ],
  })
})

test("merge - adds new permission", () => {
  const result = PermissionNext.merge(
    { bash: [{ pattern: "*", action: "allow" }] },
    { edit: [{ pattern: "*", action: "deny" }] },
  )
  expect(result).toEqual({
    bash: [{ pattern: "*", action: "allow" }],
    edit: [{ pattern: "*", action: "deny" }],
  })
})

test("merge - concatenates rules for same permission", () => {
  const result = PermissionNext.merge(
    { bash: [{ pattern: "foo", action: "ask" }] },
    { bash: [{ pattern: "*", action: "deny" }] },
  )
  expect(result).toEqual({
    bash: [
      { pattern: "foo", action: "ask" },
      { pattern: "*", action: "deny" },
    ],
  })
})

test("merge - multiple rulesets", () => {
  const result = PermissionNext.merge(
    { bash: [{ pattern: "*", action: "allow" }] },
    { bash: [{ pattern: "rm", action: "ask" }] },
    { edit: [{ pattern: "*", action: "allow" }] },
  )
  expect(result).toEqual({
    bash: [
      { pattern: "*", action: "allow" },
      { pattern: "rm", action: "ask" },
    ],
    edit: [{ pattern: "*", action: "allow" }],
  })
})

test("merge - empty ruleset does nothing", () => {
  const result = PermissionNext.merge({ bash: [{ pattern: "*", action: "allow" }] }, {})
  expect(result).toEqual({ bash: [{ pattern: "*", action: "allow" }] })
})

test("merge - preserves rule order", () => {
  const result = PermissionNext.merge(
    {
      edit: [
        { pattern: "src/*", action: "allow" },
        { pattern: "src/secret/*", action: "deny" },
      ],
    },
    { edit: [{ pattern: "src/secret/ok.ts", action: "allow" }] },
  )
  expect(result).toEqual({
    edit: [
      { pattern: "src/*", action: "allow" },
      { pattern: "src/secret/*", action: "deny" },
      { pattern: "src/secret/ok.ts", action: "allow" },
    ],
  })
})

// evaluate tests

test("evaluate - exact pattern match", () => {
  const result = PermissionNext.evaluate("bash", "rm", { bash: [{ pattern: "rm", action: "deny" }] })
  expect(result).toBe("deny")
})

test("evaluate - wildcard pattern match", () => {
  const result = PermissionNext.evaluate("bash", "rm", { bash: [{ pattern: "*", action: "allow" }] })
  expect(result).toBe("allow")
})

test("evaluate - last matching rule wins", () => {
  const result = PermissionNext.evaluate("bash", "rm", {
    bash: [
      { pattern: "*", action: "allow" },
      { pattern: "rm", action: "deny" },
    ],
  })
  expect(result).toBe("deny")
})

test("evaluate - last matching rule wins (wildcard after specific)", () => {
  const result = PermissionNext.evaluate("bash", "rm", {
    bash: [
      { pattern: "rm", action: "deny" },
      { pattern: "*", action: "allow" },
    ],
  })
  expect(result).toBe("allow")
})

test("evaluate - glob pattern match", () => {
  const result = PermissionNext.evaluate("edit", "src/foo.ts", { edit: [{ pattern: "src/*", action: "allow" }] })
  expect(result).toBe("allow")
})

test("evaluate - last matching glob wins", () => {
  const result = PermissionNext.evaluate("edit", "src/components/Button.tsx", {
    edit: [
      { pattern: "src/*", action: "deny" },
      { pattern: "src/components/*", action: "allow" },
    ],
  })
  expect(result).toBe("allow")
})

test("evaluate - order matters for specificity", () => {
  // If more specific rule comes first, later wildcard overrides it
  const result = PermissionNext.evaluate("edit", "src/components/Button.tsx", {
    edit: [
      { pattern: "src/components/*", action: "allow" },
      { pattern: "src/*", action: "deny" },
    ],
  })
  expect(result).toBe("deny")
})

test("evaluate - unknown permission returns ask", () => {
  const result = PermissionNext.evaluate("unknown_tool", "anything", {
    bash: [{ pattern: "*", action: "allow" }],
  })
  expect(result).toBe("ask")
})

test("evaluate - empty ruleset returns ask", () => {
  const result = PermissionNext.evaluate("bash", "rm", {})
  expect(result).toBe("ask")
})

test("evaluate - no matching pattern returns ask", () => {
  const result = PermissionNext.evaluate("edit", "etc/passwd", { edit: [{ pattern: "src/*", action: "allow" }] })
  expect(result).toBe("ask")
})

test("evaluate - empty rules array returns ask", () => {
  const result = PermissionNext.evaluate("bash", "rm", { bash: [] })
  expect(result).toBe("ask")
})

test("evaluate - multiple matching patterns, last wins", () => {
  const result = PermissionNext.evaluate("edit", "src/secret.ts", {
    edit: [
      { pattern: "*", action: "ask" },
      { pattern: "src/*", action: "allow" },
      { pattern: "src/secret.ts", action: "deny" },
    ],
  })
  expect(result).toBe("deny")
})

test("evaluate - non-matching patterns are skipped", () => {
  const result = PermissionNext.evaluate("edit", "src/foo.ts", {
    edit: [
      { pattern: "*", action: "ask" },
      { pattern: "test/*", action: "deny" },
      { pattern: "src/*", action: "allow" },
    ],
  })
  expect(result).toBe("allow")
})

test("evaluate - exact match at end wins over earlier wildcard", () => {
  const result = PermissionNext.evaluate("bash", "/bin/rm", {
    bash: [
      { pattern: "*", action: "allow" },
      { pattern: "/bin/rm", action: "deny" },
    ],
  })
  expect(result).toBe("deny")
})

test("evaluate - wildcard at end overrides earlier exact match", () => {
  const result = PermissionNext.evaluate("bash", "/bin/rm", {
    bash: [
      { pattern: "/bin/rm", action: "deny" },
      { pattern: "*", action: "allow" },
    ],
  })
  expect(result).toBe("allow")
})

// wildcard permission tests

test("evaluate - wildcard permission matches any permission", () => {
  const result = PermissionNext.evaluate("bash", "rm", {
    "*": [{ pattern: "*", action: "deny" }],
  })
  expect(result).toBe("deny")
})

test("evaluate - wildcard permission with specific pattern", () => {
  const result = PermissionNext.evaluate("bash", "rm", {
    "*": [{ pattern: "rm", action: "deny" }],
  })
  expect(result).toBe("deny")
})

test("evaluate - glob permission pattern", () => {
  const result = PermissionNext.evaluate("mcp_server_tool", "anything", {
    "mcp_*": [{ pattern: "*", action: "allow" }],
  })
  expect(result).toBe("allow")
})

test("evaluate - specific permission and wildcard permission combined", () => {
  const result = PermissionNext.evaluate("bash", "rm", {
    "*": [{ pattern: "*", action: "deny" }],
    bash: [{ pattern: "*", action: "allow" }],
  })
  expect(result).toBe("allow")
})

test("evaluate - wildcard permission does not match when specific exists", () => {
  const result = PermissionNext.evaluate("edit", "src/foo.ts", {
    "*": [{ pattern: "*", action: "deny" }],
    edit: [{ pattern: "src/*", action: "allow" }],
  })
  expect(result).toBe("allow")
})

test("evaluate - multiple matching permission patterns combine rules", () => {
  const result = PermissionNext.evaluate("mcp_dangerous", "anything", {
    "*": [{ pattern: "*", action: "ask" }],
    "mcp_*": [{ pattern: "*", action: "allow" }],
    mcp_dangerous: [{ pattern: "*", action: "deny" }],
  })
  expect(result).toBe("deny")
})

test("evaluate - wildcard permission fallback for unknown tool", () => {
  const result = PermissionNext.evaluate("unknown_tool", "anything", {
    "*": [{ pattern: "*", action: "ask" }],
    bash: [{ pattern: "*", action: "allow" }],
  })
  expect(result).toBe("ask")
})

test("evaluate - permission patterns sorted by length regardless of object order", () => {
  // specific permission listed before wildcard, but specific should still win
  const result = PermissionNext.evaluate("bash", "rm", {
    bash: [{ pattern: "*", action: "allow" }],
    "*": [{ pattern: "*", action: "deny" }],
  })
  expect(result).toBe("allow")
})

// disabledTools tests

test("disabledTools - returns empty set when all tools allowed", () => {
  const result = PermissionNext.disabledTools(["bash", "edit", "read"], {
    "*": [{ pattern: "*", action: "allow" }],
  })
  expect(result.size).toBe(0)
})

test("disabledTools - disables tool when denied", () => {
  const result = PermissionNext.disabledTools(["bash", "edit", "read"], {
    bash: [{ pattern: "*", action: "deny" }],
    "*": [{ pattern: "*", action: "allow" }],
  })
  expect(result.has("bash")).toBe(true)
  expect(result.has("edit")).toBe(false)
  expect(result.has("read")).toBe(false)
})

test("disabledTools - disables edit/write/patch/multiedit when edit denied", () => {
  const result = PermissionNext.disabledTools(["edit", "write", "patch", "multiedit", "bash"], {
    edit: [{ pattern: "*", action: "deny" }],
    "*": [{ pattern: "*", action: "allow" }],
  })
  expect(result.has("edit")).toBe(true)
  expect(result.has("write")).toBe(true)
  expect(result.has("patch")).toBe(true)
  expect(result.has("multiedit")).toBe(true)
  expect(result.has("bash")).toBe(false)
})

test("disabledTools - does not disable when partially denied", () => {
  const result = PermissionNext.disabledTools(["bash"], {
    bash: [
      { pattern: "*", action: "allow" },
      { pattern: "rm *", action: "deny" },
    ],
  })
  expect(result.has("bash")).toBe(false)
})

test("disabledTools - does not disable when action is ask", () => {
  const result = PermissionNext.disabledTools(["bash", "edit"], {
    "*": [{ pattern: "*", action: "ask" }],
  })
  expect(result.size).toBe(0)
})

test("disabledTools - disables when wildcard deny even with specific allow", () => {
  // Tool is disabled because evaluate("bash", "*", ...) returns "deny"
  // The "echo *" allow rule doesn't match the "*" pattern we're checking
  const result = PermissionNext.disabledTools(["bash"], {
    bash: [
      { pattern: "*", action: "deny" },
      { pattern: "echo *", action: "allow" },
    ],
  })
  expect(result.has("bash")).toBe(true)
})

test("disabledTools - does not disable when wildcard allow after deny", () => {
  const result = PermissionNext.disabledTools(["bash"], {
    bash: [
      { pattern: "rm *", action: "deny" },
      { pattern: "*", action: "allow" },
    ],
  })
  expect(result.has("bash")).toBe(false)
})

test("disabledTools - disables multiple tools", () => {
  const result = PermissionNext.disabledTools(["bash", "edit", "webfetch"], {
    bash: [{ pattern: "*", action: "deny" }],
    edit: [{ pattern: "*", action: "deny" }],
    webfetch: [{ pattern: "*", action: "deny" }],
  })
  expect(result.has("bash")).toBe(true)
  expect(result.has("edit")).toBe(true)
  expect(result.has("webfetch")).toBe(true)
})

test("disabledTools - wildcard permission denies all tools", () => {
  const result = PermissionNext.disabledTools(["bash", "edit", "read"], {
    "*": [{ pattern: "*", action: "deny" }],
  })
  expect(result.has("bash")).toBe(true)
  expect(result.has("edit")).toBe(true)
  expect(result.has("read")).toBe(true)
})

test("disabledTools - specific allow overrides wildcard deny", () => {
  const result = PermissionNext.disabledTools(["bash", "edit", "read"], {
    "*": [{ pattern: "*", action: "deny" }],
    bash: [{ pattern: "*", action: "allow" }],
  })
  expect(result.has("bash")).toBe(false)
  expect(result.has("edit")).toBe(true)
  expect(result.has("read")).toBe(true)
})
