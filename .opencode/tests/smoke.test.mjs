import test from "node:test"
import assert from "node:assert/strict"
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const runtimeRoot = path.resolve(__dirname, "..")
const repoRoot = path.resolve(runtimeRoot, "..")
const ocmhPath = path.join(runtimeRoot, "bin", "ocmh")
const doctorPath = path.join(runtimeRoot, "scripts", "doctor.mjs")

function createFixture(t) {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "ocmh-smoke-"))
  const fixtureRuntimeRoot = path.join(tempRoot, ".opencode")

  cpSync(path.join(runtimeRoot, "crew"), path.join(fixtureRuntimeRoot, "crew"), { recursive: true })
  cpSync(path.join(runtimeRoot, "skills"), path.join(fixtureRuntimeRoot, "skills"), { recursive: true })
  cpSync(path.join(runtimeRoot, "tools"), path.join(fixtureRuntimeRoot, "tools"), { recursive: true })
  cpSync(path.join(runtimeRoot, "package.json"), path.join(fixtureRuntimeRoot, "package.json"))
  cpSync(path.join(runtimeRoot, "opencode.json"), path.join(fixtureRuntimeRoot, "opencode.json"))

  t.after(() => {
    rmSync(tempRoot, { recursive: true, force: true })
  })

  return {
    tempRoot,
    fixtureRuntimeRoot,
    marketingConfigPath: path.join(fixtureRuntimeRoot, "crew", "marketing", "multi-team.yaml"),
  }
}

function runNode(filePath, args, env = {}) {
  return spawnSync(process.execPath, [filePath, ...args], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    encoding: "utf-8",
  })
}

function runOcmh(args, env = {}) {
  return runNode(ocmhPath, args, env)
}

function fixtureEnv(fixture) {
  return {
    OPENCODE_MULTI_HOME: fixture.fixtureRuntimeRoot,
    MULTI_HOME: fixture.fixtureRuntimeRoot,
  }
}

test("ocmh list:crews reports available crews", (t) => {
  const fixture = createFixture(t)
  const result = runOcmh(["list:crews"], fixtureEnv(fixture))

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /dev/)
  assert.match(result.stdout, /marketing/)
})

test("ocmh use materializes active crew metadata and agents", (t) => {
  const fixture = createFixture(t)
  const result = runOcmh(["use", "marketing"], fixtureEnv(fixture))

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /Activated crew: marketing/)

  const activeMetaPath = path.join(fixture.fixtureRuntimeRoot, ".active-crew.json")
  assert.equal(existsSync(activeMetaPath), true)
  const activeMeta = JSON.parse(readFileSync(activeMetaPath, "utf-8"))
  assert.equal(activeMeta.crew, "marketing")

  const activeAgentsDir = path.join(fixture.fixtureRuntimeRoot, "agents")
  const agents = readdirSync(activeAgentsDir).filter((entry) => entry.endsWith(".md"))
  assert.ok(agents.length > 0)
})

test("ocmh validate works against an explicit fixture config", (t) => {
  const fixture = createFixture(t)
  const result = runOcmh(["validate", "--config", fixture.marketingConfigPath], fixtureEnv(fixture))

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /validated topology routes/)
})

test("ocmh doctor reports healthy runtime state in ci mode", (t) => {
  const fixture = createFixture(t)
  const useResult = runOcmh(["use", "marketing"], fixtureEnv(fixture))
  assert.equal(useResult.status, 0, useResult.stderr)

  const result = runNode(doctorPath, ["--ci", "--json"], fixtureEnv(fixture))
  assert.equal(result.status, 0, result.stderr)

  const payload = JSON.parse(result.stdout)
  assert.equal(payload.ok, true)

  const topology = payload.results.find((entry) => entry.label === "topology")
  assert.equal(topology.status, "ok")

  const activeAgents = payload.results.find((entry) => entry.label === "active_agents")
  assert.equal(activeAgents.status, "ok")
})

test("ocmh clear removes active crew metadata", (t) => {
  const fixture = createFixture(t)
  const useResult = runOcmh(["use", "marketing"], fixtureEnv(fixture))
  assert.equal(useResult.status, 0, useResult.stderr)

  const clearResult = runOcmh(["clear"], fixtureEnv(fixture))
  assert.equal(clearResult.status, 0, clearResult.stderr)

  const activeMetaPath = path.join(fixture.fixtureRuntimeRoot, ".active-crew.json")
  assert.equal(existsSync(activeMetaPath), false)
})
