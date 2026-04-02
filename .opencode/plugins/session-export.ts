import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import path from "node:path"
import type { Plugin } from "@opencode-ai/plugin"

const ENABLED_VALUES = new Set(["1", "true", "yes", "on"])
const EXPORT_FLAG = "OPENCODE_MULTI_SESSION_EXPORT"
const EXPORT_DIR_ENV = "OPENCODE_MULTI_SESSION_DIR"
const MAX_TOOL_OUTPUT_CHARS = 4000

type UnknownRecord = Record<string, unknown>
type ExportState = {
  parentBySession: Map<string, string | undefined>
  dirBySession: Map<string, string>
}

function nowIso(): string {
  return new Date().toISOString()
}

function isExportEnabled(): boolean {
  const raw = process.env[EXPORT_FLAG]
  if (!raw) return false
  return ENABLED_VALUES.has(raw.trim().toLowerCase())
}

function resolveConfiguredBaseDir(worktree: string): string {
  const configured = process.env[EXPORT_DIR_ENV]?.trim()
  if (!configured) return path.join(worktree, ".opencode", "sessions")
  return path.isAbsolute(configured) ? configured : path.resolve(worktree, configured)
}

function resolveBaseDirByActiveCrew(worktree: string): string | undefined {
  const activeCrewPath = path.join(worktree, ".opencode", ".active-crew.json")
  const activeMetaPath = activeCrewPath
  if (!existsSync(activeMetaPath)) return undefined
  try {
    const active = JSON.parse(readFileSync(activeMetaPath, "utf-8")) as UnknownRecord
    const sourceConfig = typeof active.source_config === "string" ? active.source_config : undefined
    if (!sourceConfig) return undefined
    const sourceAbs = path.isAbsolute(sourceConfig) ? sourceConfig : path.resolve(worktree, sourceConfig)
    return path.join(path.dirname(sourceAbs), "sessions")
  } catch {
    return undefined
  }
}

function resolveDefaultBaseDir(worktree: string): string {
  const envConfigured = process.env[EXPORT_DIR_ENV]?.trim()
  if (envConfigured) return resolveConfiguredBaseDir(worktree)
  const activeCrewDir = resolveBaseDirByActiveCrew(worktree)
  if (activeCrewDir) return activeCrewDir

  const devCrewDir = path.join(worktree, ".opencode", "crew", "dev", "sessions")
  if (existsSync(path.join(worktree, ".opencode", "crew", "dev", "multi-team.yaml"))) {
    return devCrewDir
  }

  return resolveConfiguredBaseDir(worktree)
}

function sessionInfoFromEvent(event: UnknownRecord): { sessionID?: string; parentID?: string } {
  const properties = (event.properties || {}) as UnknownRecord
  const info = (properties.info || {}) as UnknownRecord
  const sessionID = typeof info.id === "string" ? info.id : undefined
  const parentID = typeof info.parentID === "string" ? info.parentID : undefined
  return { sessionID, parentID }
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

function appendJsonl(filePath: string, payload: unknown): void {
  appendFileSync(filePath, `${JSON.stringify(payload)}\n`, "utf-8")
}

function shortText(value: unknown, limit: number): unknown {
  if (typeof value !== "string") return value
  const normalized = value.replace(/\s+/g, " ").trim()
  if (normalized.length <= limit) return normalized
  return `${normalized.slice(0, limit - 3)}...`
}

function eventSessionID(event: UnknownRecord): string | undefined {
  const properties = (event.properties || {}) as UnknownRecord
  if (typeof properties.sessionID === "string") return properties.sessionID

  const info = (properties.info || {}) as UnknownRecord
  if (typeof info.sessionID === "string") return info.sessionID
  if (typeof info.id === "string" && String(event.type || "").startsWith("session.")) return info.id

  const part = (properties.part || {}) as UnknownRecord
  if (typeof part.sessionID === "string") return part.sessionID

  const message = (properties.message || {}) as UnknownRecord
  if (typeof message.sessionID === "string") return message.sessionID

  return undefined
}

function sessionRelativePath(sessionID: string, state: ExportState, seen: Set<string> = new Set()): string {
  if (seen.has(sessionID)) return sessionID
  seen.add(sessionID)
  const parentID = state.parentBySession.get(sessionID)
  if (!parentID) return sessionID
  return path.join(sessionRelativePath(parentID, state, seen), "children", sessionID)
}

function desiredSessionDir(worktree: string, sessionID: string, state: ExportState): string {
  return path.join(resolveDefaultBaseDir(worktree), sessionRelativePath(sessionID, state))
}

function ensureSessionDir(worktree: string, sessionID: string, state: ExportState): string {
  const desired = desiredSessionDir(worktree, sessionID, state)
  const current = state.dirBySession.get(sessionID)

  if (current && current !== desired && existsSync(current) && !existsSync(desired)) {
    ensureDir(path.dirname(desired))
    renameSync(current, desired)
  }

  ensureDir(desired)
  state.dirBySession.set(sessionID, desired)
  return desired
}

function hydrateParentFromEvent(event: UnknownRecord, state: ExportState): void {
  if (event.type !== "session.created" && event.type !== "session.updated") return
  const { sessionID, parentID } = sessionInfoFromEvent(event)
  if (!sessionID) return
  state.parentBySession.set(sessionID, parentID)
}

function writeSessionMeta(sessionDir: string, event: UnknownRecord): void {
  if (event.type !== "session.created") return
  const properties = (event.properties || {}) as UnknownRecord
  const info = (properties.info || {}) as UnknownRecord
  const metaPath = path.join(sessionDir, "meta.json")
  if (existsSync(metaPath)) return

  const payload = {
    session_id: info.id ?? null,
    title: info.title ?? null,
    project_id: info.projectID ?? null,
    directory: info.directory ?? null,
    parent_id: info.parentID ?? null,
    created_at: nowIso(),
    created_ms: (info.time as UnknownRecord | undefined)?.created ?? null
  }
  writeFileSync(metaPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8")
}

function buildConversationRecords(event: UnknownRecord, sessionID: string): UnknownRecord[] {
  const timestamp = nowIso()
  const properties = (event.properties || {}) as UnknownRecord

  if (event.type === "message.updated") {
    const info = (properties.info || {}) as UnknownRecord
    return [
      {
        timestamp,
        session_id: sessionID,
        event_type: "message.updated",
        message_id: info.id ?? null,
        parent_id: info.parentID ?? null,
        role: info.role ?? null,
        mode: info.mode ?? null,
        model: info.modelID ?? null,
        provider: info.providerID ?? null,
        cost: info.cost ?? null,
        tokens: info.tokens ?? null,
        time: info.time ?? null,
        error: info.error ?? null
      }
    ]
  }

  if (event.type === "message.part.updated") {
    const part = (properties.part || {}) as UnknownRecord
    const base = {
      timestamp,
      session_id: sessionID,
      event_type: "message.part.updated",
      message_id: part.messageID ?? null,
      part_id: part.id ?? null,
      part_type: part.type ?? null
    }

    if (typeof properties.delta === "string" && properties.delta.length > 0) {
      return [{ ...base, delta: properties.delta }]
    }

    return [{ ...base, part }]
  }

  if (event.type === "message.part.removed") {
    return [
      {
        timestamp,
        session_id: sessionID,
        event_type: "message.part.removed",
        message_id: properties.messageID ?? null,
        part_id: properties.partID ?? null
      }
    ]
  }

  if (event.type === "message.removed") {
    return [
      {
        timestamp,
        session_id: sessionID,
        event_type: "message.removed",
        message_id: properties.messageID ?? null
      }
    ]
  }

  return []
}

function writeEvent(worktree: string, sessionID: string, event: UnknownRecord, state: ExportState): void {
  const sessionDir = ensureSessionDir(worktree, sessionID, state)
  writeSessionMeta(sessionDir, event)

  appendJsonl(path.join(sessionDir, "events.jsonl"), {
    timestamp: nowIso(),
    session_id: sessionID,
    type: event.type ?? "unknown",
    payload: event.properties ?? {}
  })

  const conversationRecords = buildConversationRecords(event, sessionID)
  for (const record of conversationRecords) {
    appendJsonl(path.join(sessionDir, "conversation.jsonl"), record)
  }
}

export const SessionExportPlugin: Plugin = async ({ worktree }) => {
  const enabled = isExportEnabled()
  const state: ExportState = {
    parentBySession: new Map(),
    dirBySession: new Map()
  }

  return {
    event: async ({ event }) => {
      if (!enabled) return
      try {
        const raw = event as unknown as UnknownRecord
        hydrateParentFromEvent(raw, state)
        const sessionID = eventSessionID(raw)
        if (!sessionID) return
        writeEvent(worktree, sessionID, raw, state)
      } catch {
        // Best-effort export only. Never break the main runtime on logging failure.
      }
    },
    "tool.execute.after": async (input, output) => {
      if (!enabled) return
      try {
        const sessionID = input.sessionID
        if (!sessionID) return
        const sessionDir = ensureSessionDir(worktree, sessionID, state)
        appendJsonl(path.join(sessionDir, "events.jsonl"), {
          timestamp: nowIso(),
          session_id: sessionID,
          type: "tool.execute.after",
          payload: {
            tool: input.tool,
            call_id: input.callID,
            args: input.args,
            title: output.title,
            output: shortText(output.output, MAX_TOOL_OUTPUT_CHARS),
            metadata: output.metadata
          }
        })
      } catch {
        // Best-effort export only. Never break the main runtime on logging failure.
      }
    }
  }
}
