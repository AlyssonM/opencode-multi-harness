import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs"
import path from "node:path"
import YAML from "yaml"
import { tool } from "@opencode-ai/plugin"

type ExpertiseEntry = { date: string; note: string }
type ExpertiseDoc = {
  agent: { name: string; role: string; team: string }
  meta: { version: number; max_lines: number; last_updated: string }
  observations: ExpertiseEntry[]
  open_questions: ExpertiseEntry[]
  [key: string]: unknown
}

const DEFAULT_MAX_LINES = 10000
const NOTE_MAX_CHARS = 1000
const ACTIVE_CREW_META_PATH = path.join(".opencode", ".active-crew.json")

type MultiTeamAgent = {
  id?: string
  expertise?: { path?: string }
}
type MultiTeamTeam = {
  lead?: MultiTeamAgent
  members?: MultiTeamAgent[]
}
type MultiTeamDoc = {
  orchestrator?: MultiTeamAgent
  teams?: MultiTeamTeam[]
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function normalizeAgentName(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-")
}

function shortText(value: string, limit: number): string {
  const text = value.replace(/\s+/g, " ").trim()
  return text.length > limit ? text.slice(0, limit - 3) + "..." : text
}

function toCategoryKey(category?: string): string {
  const normalized = (category || "observations").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_")
  if (!normalized) return "observations"
  if (normalized === "question") return "open_questions"
  if (normalized.endsWith("s")) return normalized
  return normalized + "s"
}

function lineCount(text: string): number {
  if (!text) return 0
  return text.split("\n").length
}

function resolveFromRoot(root: string, filePath: string): string {
  if (path.isAbsolute(filePath)) return filePath
  return path.resolve(root, filePath)
}

function resolvePathFromCrewConfig(root: string, agent: string): string | undefined {
  const metaPath = path.join(root, ACTIVE_CREW_META_PATH)
  if (!existsSync(metaPath)) return undefined

  try {
    const active = JSON.parse(readFileSync(metaPath, "utf-8")) as { source_config?: unknown }
    if (typeof active.source_config !== "string" || !active.source_config.trim()) return undefined

    const configPath = resolveFromRoot(root, active.source_config)
    if (!existsSync(configPath)) return undefined

    const doc = YAML.parse(readFileSync(configPath, "utf-8")) as MultiTeamDoc
    const candidates: MultiTeamAgent[] = []
    if (doc?.orchestrator) candidates.push(doc.orchestrator)
    for (const team of doc?.teams || []) {
      if (team?.lead) candidates.push(team.lead)
      for (const member of team?.members || []) candidates.push(member)
    }

    const matched = candidates.find((candidate) => normalizeAgentName(candidate?.id || "") === agent)
    if (!matched?.expertise?.path) return undefined
    return resolveFromRoot(root, matched.expertise.path)
  } catch {
    return undefined
  }
}

function resolvePathFromActiveAgentPrompt(root: string, agent: string): string | undefined {
  const promptPath = path.join(root, ".opencode", "agents", `${agent}.md`)
  if (!existsSync(promptPath)) return undefined

  try {
    const prompt = readFileSync(promptPath, "utf-8")
    const sectionMatch = prompt.match(/## Expertise[\s\S]*?- path: `([^`]+)`/)
    if (!sectionMatch?.[1]) return undefined
    return resolveFromRoot(root, sectionMatch[1])
  } catch {
    return undefined
  }
}

function resolveExpertisePath(root: string, agent: string): string {
  return (
    resolvePathFromCrewConfig(root, agent) ||
    resolvePathFromActiveAgentPrompt(root, agent) ||
    path.join(root, ".opencode", "expertise", `${agent}-mental-model.yaml`)
  )
}

function trimLines(doc: ExpertiseDoc): ExpertiseDoc {
  const clone = doc
  const preferred = ["observations", "open_questions"]
  const dynamic = Object.keys(clone).filter((key) => Array.isArray(clone[key]) && !preferred.includes(key))
  const order = [...preferred, ...dynamic]
  let rendered = YAML.stringify(clone)
  while (lineCount(rendered) > clone.meta.max_lines) {
    const section = order.find((key) => Array.isArray(clone[key]) && (clone[key] as ExpertiseEntry[]).length > 0)
    if (!section) break
    ;(clone[section] as ExpertiseEntry[]).shift()
    rendered = YAML.stringify(clone)
  }
  return clone
}

export default tool({
  description: "Append a durable note to the current OpenCode agent mental model YAML file.",
  args: {
    note: tool.schema.string().describe("Durable insight, risk, pattern, or lesson learned."),
    category: tool.schema.string().optional().describe("Optional category (observations, risks, tools, open_questions, etc)."),
    team: tool.schema.string().optional().describe("Optional team override for initial file creation.")
  },
  async execute(args, context) {
    const root = context.worktree || context.directory
    const agent = normalizeAgentName(context.agent || "unknown-agent")
    const filePath = resolveExpertisePath(root, agent)
    const expertiseDir = path.dirname(filePath)

    mkdirSync(expertiseDir, { recursive: true })

    const base: ExpertiseDoc = {
      agent: {
        name: agent,
        role: "worker",
        team: args.team || "global"
      },
      meta: {
        version: 1,
        max_lines: DEFAULT_MAX_LINES,
        last_updated: new Date().toISOString()
      },
      observations: [],
      open_questions: []
    }

    let doc = base
    if (existsSync(filePath)) {
      try {
        const parsed = YAML.parse(readFileSync(filePath, "utf-8")) as ExpertiseDoc
        if (parsed && parsed.meta && parsed.agent) doc = parsed
      } catch {
        doc = base
      }
    }

    const key = toCategoryKey(args.category)
    if (!Array.isArray(doc[key])) doc[key] = []
    ;(doc[key] as ExpertiseEntry[]).push({
      date: today(),
      note: shortText(args.note, NOTE_MAX_CHARS)
    })
    doc.meta.last_updated = new Date().toISOString()
    doc = trimLines(doc)
    writeFileSync(filePath, YAML.stringify(doc), "utf-8")

    return {
      status: "ok",
      agent,
      path: filePath,
      category: key
    }
  }
})
