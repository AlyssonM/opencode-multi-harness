import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

import { resolveRepoRoot, resolveRuntimeRoot } from "./lib/runtime.mjs"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const scriptRuntimeRoot = path.resolve(__dirname, "..")
const defaultRepoRoot = path.resolve(scriptRuntimeRoot, "..")
const runtimeRoot = resolveRuntimeRoot(defaultRepoRoot)
const repoRoot = resolveRepoRoot(runtimeRoot)
const crewRoot = path.join(runtimeRoot, "crew")
const activeMetaPath = path.join(runtimeRoot, ".active-crew.json")
const activeAgentsDir = path.join(runtimeRoot, "agents")
const packagePath = path.join(runtimeRoot, "package.json")
const opencodeConfigPath = path.join(runtimeRoot, "opencode.json")
const validateScriptPath = path.join(scriptRuntimeRoot, "scripts", "validate-multi-team.mjs")

function parseArgs(argv) {
  const args = {
    ci: false,
    json: false,
    opencodeCommand: "opencode",
  }

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === "--ci") {
      args.ci = true
      continue
    }
    if (token === "--json") {
      args.json = true
      continue
    }
    if (token === "--opencode-command") {
      args.opencodeCommand = argv[i + 1] || args.opencodeCommand
      i += 1
    }
  }

  return args
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf-8"))
}

function listCrews() {
  if (!existsSync(crewRoot)) return []
  return readdirSync(crewRoot)
    .filter((entry) => {
      const abs = path.join(crewRoot, entry)
      return statSync(abs).isDirectory() && existsSync(path.join(abs, "multi-team.yaml"))
    })
    .sort((a, b) => a.localeCompare(b))
}

function resolveCommand(binary) {
  const checker = process.platform === "win32" ? "where" : "which"
  const proc = spawnSync(checker, [binary], { encoding: "utf-8" })
  if (proc.status !== 0) return ""
  return (proc.stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)[0] || ""
}

function rel(filePath) {
  if (!filePath) return ""
  return path.isAbsolute(filePath) ? path.relative(repoRoot, filePath) || "." : filePath
}

function pushResult(results, label, status, detail) {
  results.push({ label, status, detail })
}

function validateCrewConfig(filePath) {
  const proc = spawnSync(process.execPath, [validateScriptPath, "--config", filePath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      OPENCODE_MULTI_HOME: runtimeRoot,
      MULTI_HOME: runtimeRoot,
    },
    encoding: "utf-8",
  })

  return {
    ok: proc.status === 0,
    detail: (proc.stderr || proc.stdout || "").trim(),
  }
}

function countActiveAgents() {
  if (!existsSync(activeAgentsDir)) return 0
  return readdirSync(activeAgentsDir).filter((entry) => {
    const abs = path.join(activeAgentsDir, entry)
    return statSync(abs).isFile() && entry.endsWith(".md")
  }).length
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const results = []

  if (existsSync(runtimeRoot)) {
    pushResult(results, "runtime_root", "ok", rel(runtimeRoot))
  } else {
    pushResult(results, "runtime_root", "error", `missing ${rel(runtimeRoot)}`)
  }

  const crews = listCrews()
  if (crews.length > 0) {
    pushResult(results, "crews", "ok", `${crews.length} found (${crews.join(", ")})`)
  } else {
    pushResult(results, "crews", "error", `no crews found under ${rel(crewRoot)}`)
  }

  let activeConfigPath = ""
  if (existsSync(activeMetaPath)) {
    try {
      const active = readJson(activeMetaPath)
      activeConfigPath = active?.source_config ? path.resolve(repoRoot, active.source_config) : ""
      if (!active?.crew || !activeConfigPath || !existsSync(activeConfigPath)) {
        pushResult(results, "active_crew", "error", `invalid active crew metadata in ${rel(activeMetaPath)}`)
      } else {
        pushResult(results, "active_crew", "ok", `${active.crew} -> ${rel(activeConfigPath)}`)
      }
    } catch (error) {
      pushResult(results, "active_crew", "error", `failed to parse ${rel(activeMetaPath)}: ${error.message}`)
    }
  } else {
    pushResult(results, "active_crew", "ok", "none selected")
  }

  for (const [label, filePath] of [
    ["package_json", packagePath],
    ["opencode_json", opencodeConfigPath],
  ]) {
    if (!existsSync(filePath)) {
      pushResult(results, label, "error", `missing ${rel(filePath)}`)
      continue
    }

    try {
      const parsed = readJson(filePath)
      if (label === "opencode_json") {
        const servers = parsed?.mcp && typeof parsed.mcp === "object" ? Object.keys(parsed.mcp) : []
        if (servers.length === 0) {
          pushResult(results, label, "error", `${rel(filePath)} has no MCP servers`)
        } else {
          pushResult(results, label, "ok", `${rel(filePath)} (${servers.length} MCP servers)`)
        }
      } else {
        pushResult(results, label, "ok", rel(filePath))
      }
    } catch (error) {
      pushResult(results, label, "error", `failed to parse ${rel(filePath)}: ${error.message}`)
    }
  }

  const configsToValidate = activeConfigPath
    ? [activeConfigPath]
    : crews.map((crew) => path.join(crewRoot, crew, "multi-team.yaml"))

  const invalidConfigs = []
  for (const configPath of configsToValidate) {
    const result = validateCrewConfig(configPath)
    if (!result.ok) invalidConfigs.push(`${rel(configPath)} -> ${result.detail}`)
  }
  if (invalidConfigs.length > 0) {
    pushResult(results, "topology", "error", invalidConfigs.join("; "))
  } else {
    pushResult(results, "topology", "ok", `${configsToValidate.length} config(s) validated`)
  }

  const activeAgentCount = countActiveAgents()
  if (!activeConfigPath) {
    pushResult(results, "active_agents", "ok", "none materialized (no active crew)")
  } else if (activeAgentCount === 0) {
    pushResult(results, "active_agents", "warn", `no active agents under ${rel(activeAgentsDir)}; run \`ocmh use <crew>\``)
  } else {
    pushResult(results, "active_agents", "ok", `${activeAgentCount} agent file(s) under ${rel(activeAgentsDir)}`)
  }

  if (args.ci) {
    pushResult(results, "opencode_binary", "skip", "skipped in --ci mode")
  } else {
    const opencodePath = resolveCommand(args.opencodeCommand)
    if (opencodePath) {
      pushResult(results, "opencode_binary", "ok", `${args.opencodeCommand} -> ${opencodePath}`)
    } else {
      pushResult(results, "opencode_binary", "error", `command not found: ${args.opencodeCommand}`)
    }
  }

  const errors = results.filter((item) => item.status === "error")
  const warnings = results.filter((item) => item.status === "warn")

  if (args.json) {
    console.log(JSON.stringify({
      ok: errors.length === 0,
      errors: errors.length,
      warnings: warnings.length,
      results,
    }, null, 2))
    process.exitCode = errors.length > 0 ? 1 : 0
    return
  }

  console.log("Harness doctor")
  for (const item of results) {
    console.log(`- ${item.label}: ${item.status} ${item.detail}`)
  }
  console.log("")
  console.log(`Summary: ${errors.length} error(s), ${warnings.length} warning(s)`)
  process.exitCode = errors.length > 0 ? 1 : 0
}

main()
