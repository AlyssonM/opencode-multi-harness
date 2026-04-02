# OpenCode Multi-Team Harness

This directory contains an OpenCode-native scaffold for a three-layer multi-team workflow.

## Structure

- `crew/dev/multi-team.yaml`: canonical dev crew topology
- `crew/marketing/multi-team.yaml`: canonical marketing crew topology
- `opencode.json`: OpenCode config (permissions + MCP servers)
- `../opencode.example.json`: OpenCode config template (permissions + MCP servers)
- `agents/`: active runtime agents (generated/materialized)
- `crew/dev/agents/`: canonical dev crew agents
- `skills/`: reusable behavior skills in `SKILL.md` format
- `tools/`: custom tools callable by the model (`update-mental-model`)
- `plugins/`: runtime hooks (optional session export, notifications, guards, etc.)
- `crew/<crew>/expertise/`: per-crew expertise files
- `crew/<crew>/sessions/`: optional JSONL export target per crew
- `scripts/validate-multi-team.mjs`: validates topology + file references

MCP servers are configured for documentation, web research, and design integration:

- `brave-search` (requires `BRAVE_API_KEY`, package `@brave/brave-search-mcp-server`)
- `firecrawl` (requires `FIRECRAWL_API_KEY`)

## Install

```bash
git clone https://github.com/AlyssonM/multi-agents.git
cd multi-agents
npm --prefix .opencode install
```

Optional environment setup:

```bash
cp .env.sample .env
# then fill required values in .env (e.g. CONTEXT7_API_KEY, BRAVE_API_KEY, FIRECRAWL_API_KEY)
```

Verify OpenCode CLI is available:

```bash
if command -v opencode >/dev/null 2>&1; then
  opencode --version
else
  echo "OpenCode CLI not found. Install it first: https://opencode.ai/"
fi
```

## Get Started

Generate/update all agent prompts from the canonical YAML:

```bash
npm --prefix .opencode run sync:multi-team
```

Validate the high-level spec:

```bash
npm --prefix .opencode run validate:multi-team
```

Check drift (CI-friendly, no file writes):

```bash
npm --prefix .opencode run check:multi-team-sync
```

List available harness crews:

```bash
npm --prefix .opencode run list:crews
```

Activate one crew (example: `marketing`):

```bash
npm --prefix .opencode run use:crew -- marketing
```

Clear active crew selection (deprovision runtime agents):

```bash
npm --prefix .opencode run clear:crew
```

The command materializes active files into:

- `.opencode/agents/*.md`
- `.opencode/.active-crew.json`

Start OpenCode:

```bash
opencode
```

Enable Pi-like session export (optional):

```bash
OPENCODE_MULTI_SESSION_EXPORT=1 opencode
```

Optional custom export directory:

```bash
OPENCODE_MULTI_SESSION_EXPORT=1 \
OPENCODE_MULTI_SESSION_DIR=.opencode/crew/dev/sessions \
opencode
```

Recommended start:

1. switch to `@orchestrator`
2. request a task requiring Planning -> Engineering -> Validation
3. verify delegation respects task permissions

## Notes

- This scaffold is focused on OpenCode primitives:
  - Task tool permissions (`permission.task`)
  - custom tools under `.opencode/tools`
  - plugin hooks under `.opencode/plugins`
  - skills under `.opencode/skills/*/SKILL.md`
  - MCP under `mcp` in `opencode.json`
- Optional session export plugin:
  - enabled only when `OPENCODE_MULTI_SESSION_EXPORT=1`
  - writes sessions under active crew path, e.g. `.opencode/crew/dev/sessions/<session-id>/`
  - writes child sessions to `crew/<crew>/sessions/<root-session-id>/children/<child-session-id>/`
  - includes `events.jsonl`, `conversation.jsonl`, and `meta.json`
- Multi-crew support:
  - crew source folders live at `.opencode/crew/<crew>/`
  - activate with `npm --prefix .opencode run use:crew -- <crew>`
  - `sync`/`validate` also accept `--config`, `OPENCODE_MULTI_CREW_CONFIG` or `OPENCODE_MULTI_CONFIG`
- Canonical authoring model:
  - update `.opencode/crew/<crew>/multi-team.yaml` first (high level source-of-truth)
  - activate crew with `npm --prefix .opencode run use:crew -- <crew>`
  - run `npm --prefix .opencode run sync:multi-team`
  - optionally run `npm --prefix .opencode run check:multi-team-sync` in CI
  - run `npm --prefix .opencode run validate:multi-team`
  - keep `opencode.json` aligned as runtime artifact
- Root `agents/` is the runtime mount point and should remain present (at least with `.gitkeep`).
- Runtime `agents/` files are provisioned by copy (`cpSync`), not symlink.
- `update-mental-model` writes to crew expertise by default (active crew config first), with fallback to legacy `.opencode/expertise/`.
- Default OpenCode storage remains in `~/.local/share/opencode/`.
