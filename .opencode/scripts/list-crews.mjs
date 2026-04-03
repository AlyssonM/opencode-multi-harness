import { existsSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { resolveRepoRoot, resolveRuntimeRoot } from "./lib/runtime.mjs"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const scriptRuntimeRoot = path.resolve(__dirname, "..")
const defaultRepoRoot = path.resolve(scriptRuntimeRoot, "..")
const opencodeRoot = resolveRuntimeRoot(defaultRepoRoot)
const repoRoot = resolveRepoRoot(opencodeRoot)
const crewRoot = path.join(opencodeRoot, "crew")

function safeDirectoryEntries(dirPath) {
  if (!existsSync(dirPath)) return []
  return readdirSync(dirPath).filter((entry) => {
    const abs = path.join(dirPath, entry)
    return statSync(abs).isDirectory()
  })
}

function listCrewCandidates() {
  const crews = []
  for (const entry of safeDirectoryEntries(crewRoot)) {
    const configPath = path.join(crewRoot, entry, "multi-team.yaml")
    if (!existsSync(configPath)) continue
    crews.push({
      name: entry,
      root: path.join(crewRoot, entry),
      configPath
    })
  }
  return crews.sort((a, b) => a.name.localeCompare(b.name))
}

function main() {
  const crews = listCrewCandidates()
  if (crews.length === 0) {
    console.log("No crew directories found.")
    console.log("Expected: .opencode/crew/<crew>/multi-team.yaml")
    process.exitCode = 1
    return
  }

  console.log("Available crews:")
  for (const crew of crews) {
    console.log(`- ${crew.name} -> ${path.relative(repoRoot, crew.configPath)}`)
  }
}

main()
