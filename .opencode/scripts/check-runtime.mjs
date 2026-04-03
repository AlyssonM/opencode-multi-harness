import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
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
const validateScriptPath = path.join(scriptRuntimeRoot, "scripts", "validate-multi-team.mjs")

function collectFiles(rootPath) {
  if (!existsSync(rootPath)) return []
  const files = []

  for (const entry of readdirSync(rootPath)) {
    const abs = path.join(rootPath, entry)
    const stat = statSync(abs)
    if (stat.isDirectory()) {
      files.push(...collectFiles(abs))
      continue
    }
    files.push(abs)
  }

  return files.sort((a, b) => a.localeCompare(b))
}

function rel(filePath) {
  return path.relative(repoRoot, filePath) || "."
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf-8"))
}

function checkSyntax(filePath) {
  const proc = spawnSync(process.execPath, ["--check", filePath], { encoding: "utf-8" })
  if (proc.status !== 0) {
    const detail = (proc.stderr || proc.stdout || "unknown syntax error").trim()
    throw new Error(detail)
  }
}

function validateOpenCodeConfig(filePath) {
  const config = readJson(filePath)
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("opencode config must be a JSON object")
  }

  if (!config.permission || typeof config.permission !== "object" || Array.isArray(config.permission)) {
    throw new Error("missing permission object")
  }

  if (!config.mcp || typeof config.mcp !== "object" || Array.isArray(config.mcp)) {
    throw new Error("missing mcp object")
  }

  const servers = Object.keys(config.mcp)
  if (servers.length === 0) {
    throw new Error("mcp object is empty")
  }
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

  if (proc.status !== 0) {
    throw new Error((proc.stderr || proc.stdout || "validation failed").trim())
  }
}

function main() {
  const scriptFiles = [
    ...collectFiles(path.join(runtimeRoot, "bin")),
    ...collectFiles(path.join(runtimeRoot, "scripts")),
    ...collectFiles(path.join(runtimeRoot, "tests")),
  ].filter((filePath) => [".mjs", ".cjs", ".js", ""].includes(path.extname(filePath)))

  const jsonFiles = [
    path.join(runtimeRoot, "package.json"),
    path.join(runtimeRoot, "opencode.json"),
  ]

  const yamlFiles = collectFiles(path.join(runtimeRoot, "crew")).filter((filePath) => {
    return path.basename(filePath) === "multi-team.yaml"
  })

  let failures = 0

  for (const filePath of scriptFiles) {
    try {
      checkSyntax(filePath)
      console.log(`ok: syntax ${rel(filePath)}`)
    } catch (error) {
      failures += 1
      console.error(`ERROR: syntax ${rel(filePath)} -> ${error.message}`)
    }
  }

  for (const filePath of jsonFiles) {
    if (!existsSync(filePath)) {
      failures += 1
      console.error(`ERROR: missing ${rel(filePath)}`)
      continue
    }

    try {
      if (filePath.endsWith("opencode.json")) {
        validateOpenCodeConfig(filePath)
      } else {
        readJson(filePath)
      }
      console.log(`ok: json ${rel(filePath)}`)
    } catch (error) {
      failures += 1
      console.error(`ERROR: json ${rel(filePath)} -> ${error.message}`)
    }
  }

  if (yamlFiles.length === 0) {
    failures += 1
    console.error(`ERROR: no multi-team configs found under ${rel(path.join(runtimeRoot, "crew"))}`)
  } else {
    for (const filePath of yamlFiles) {
      try {
        validateCrewConfig(filePath)
        console.log(`ok: config ${rel(filePath)}`)
      } catch (error) {
        failures += 1
        console.error(`ERROR: config ${rel(filePath)} -> ${error.message}`)
      }
    }
  }

  process.exitCode = failures > 0 ? 1 : 0
}

main()
