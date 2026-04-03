import path from "node:path"

export function resolveRuntimeRoot(defaultRepoRoot) {
  const envPath = process.env.OPENCODE_MULTI_HOME?.trim() || process.env.MULTI_HOME?.trim()
  if (!envPath) return path.join(defaultRepoRoot, ".opencode")
  return path.isAbsolute(envPath) ? envPath : path.resolve(defaultRepoRoot, envPath)
}

export function resolveRepoRoot(runtimeRoot) {
  return path.resolve(runtimeRoot, "..")
}
