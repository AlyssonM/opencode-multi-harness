import { existsSync, readdirSync, statSync, unlinkSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const opencodeRoot = path.resolve(__dirname, "..")
const repoRoot = path.resolve(opencodeRoot, "..")

const ACTIVE_AGENTS_DIR = path.join(opencodeRoot, "agents")
const ACTIVE_CREW_META_PATH = path.join(opencodeRoot, ".active-crew.json")
const LEGACY_ACTIVE_PACK_META_PATH = path.join(opencodeRoot, ".active-pack.json")

function clearActiveAgents() {
  if (!existsSync(ACTIVE_AGENTS_DIR)) return 0
  let removed = 0
  for (const entry of readdirSync(ACTIVE_AGENTS_DIR)) {
    const abs = path.join(ACTIVE_AGENTS_DIR, entry)
    if (!statSync(abs).isFile()) continue
    if (!entry.endsWith(".md")) continue
    unlinkSync(abs)
    removed += 1
  }
  return removed
}

function removeIfExists(filePath) {
  if (!existsSync(filePath)) return false
  unlinkSync(filePath)
  return true
}

function main() {
  const removedAgents = clearActiveAgents()
  const removedCrewMeta = removeIfExists(ACTIVE_CREW_META_PATH)
  const removedLegacyPackMeta = removeIfExists(LEGACY_ACTIVE_PACK_META_PATH)

  console.log("Cleared active crew selection")
  console.log(`- agents removed: ${removedAgents} from ${path.relative(repoRoot, ACTIVE_AGENTS_DIR)}`)
  console.log(`- metadata removed: ${removedCrewMeta ? path.relative(repoRoot, ACTIVE_CREW_META_PATH) : "none"}`)
  if (removedLegacyPackMeta) {
    console.log(`- legacy metadata removed: ${path.relative(repoRoot, LEGACY_ACTIVE_PACK_META_PATH)}`)
  }
}

main()
