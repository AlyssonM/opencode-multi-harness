---
name: agentic-pert
description: Skill for PERT/CPM planning in agentic workflows. Decomposes tasks, computes critical path, and generates a structured plan with visualization support.
version: 0.1.0
license: MIT
compatibility:
  - opencode
  - generic-python
tags:
  - project-management
  - workflow-orchestration
  - multi-agent
  - parallel-execution
  - subagents
  - pert-cpm
  - critical-path
  - visualization
allowed-tools:
  - bash
  - python
  - cli
metadata:
  audience: developers, agentic workflows, programmers
  category: orchestration
  triggers:
    - "use pert"
    - "use agentic-pert"
    - "plan with PERT"
    - "execute with parallel subagents"
    - "decompose into tasks with critical path"
    - "orchestrate with CPM"
---

# Agentic PERT + CPM

Specialized skill for applying PERT/CPM to plan complex tasks with explicit dependencies and critical path.

## What this skill does

1. **Decomposes** complex tasks into subtasks with dependencies (via LLM prompt)
2. **Calculates** PERT estimates (optimistic/most likely/pessimistic)
3. **Identifies** critical path (CPM)
4. **Generates** a JSON and Mermaid plan via CLI
5. **Provides** additional visualization formats through the Python API (D3, Cytoscape, React Flow, DOT, ASCII)

## When to use

- Complex tasks (more than 3-4 steps)
- Parallelism opportunities
- Need for schedule predictability
- Programming, automation, data analysis, or refactoring projects

### Trigger phrases

- "Use agentic-pert to plan..."
- "Decompose this feature using PERT/CPM"
- "Plan with critical path and execute in parallel"

## Usage

Prerequisite:

```bash
uv --version
```

### Skill CLI (scripts) for the agent

Use the CLI in `scripts/pert_cli.py` for the full plan/tasks/analysis workflow.

```bash
uv run --project .opencode/skills/agentic-pert/package \
  python .opencode/skills/agentic-pert/scripts/pert_cli.py --help
```

### 1) Generate decomposition prompt

```bash
uv run --project .opencode/skills/agentic-pert/package \
  python .opencode/skills/agentic-pert/scripts/pert_cli.py prompt \
  --objective "Implement JWT auth + Streamlit dashboard + tests"
```

### 2) Create initial plan from decomposition

```bash
uv run --project .opencode/skills/agentic-pert/package \
  python .opencode/skills/agentic-pert/scripts/pert_cli.py from-decomposition \
  --objective "Implement JWT auth + Streamlit dashboard + tests" \
  --decomposition-file planner-output.json \
  --output plan.json
```

### 3) Add/adjust tasks manually (optional)

```bash
uv run --project .opencode/skills/agentic-pert/package \
  python .opencode/skills/agentic-pert/scripts/pert_cli.py add-task \
  --plan plan.json \
  --id T9 \
  --description "Validate final integration" \
  --predecessors T4,T6 \
  --optimistic 1 \
  --most-likely 2 \
  --pessimistic 3
```

### 4) Run PERT/CPM analysis and generate Mermaid

```bash
uv run --project .opencode/skills/agentic-pert/package \
  python .opencode/skills/agentic-pert/scripts/pert_cli.py analyze \
  --plan plan.json \
  --output plan-analyzed.json \
  --mermaid-output plan.mmd \
  --mermaid-style classic-pert
```

Available Mermaid styles:
- `flowchart`: standard DAG with tasks as nodes
- `classic-pert`: classic PERT notation with events as nodes and tasks on arrows
- `pert-gantt`: timeline view in Gantt format using PERT timings

In `pert-gantt`, you can customize the final milestone label:

```bash
uv run --project .opencode/skills/agentic-pert/package \
  python .opencode/skills/agentic-pert/scripts/pert_cli.py analyze \
  --plan plan.json \
  --output plan-analyzed.json \
  --mermaid-output plan-gantt.mmd \
  --mermaid-style pert-gantt \
  --mermaid-milestone-label "Operational summary ready"
```

### Package CLI (complementary mode)

`pert-agent` remains available, but for operational agent workflows prefer `scripts/pert_cli.py`.

## Execution via OpenCode

Execution integration uses the OpenCode adapter:

```python
from agentic_pert import Task, analyze_plan, OpenCodePlanExecutor

tasks = [
    Task(id="T1", description="Setup JWT", predecessors=[], optimistic=1, most_likely=2, pessimistic=3),
    Task(id="T2", description="Auth endpoints", predecessors=["T1"], optimistic=2, most_likely=3, pessimistic=5),
]
plan, timings, batches = analyze_plan(tasks)
executor = OpenCodePlanExecutor(model="openai/gpt-5.2")
results = await executor.execute_plan(tasks, batches, task_callback=on_task_complete)
```

Recommended OpenCode workflow:

1. Generate or adjust decomposition
2. Run `from-decomposition`
3. Run `analyze`
4. Execute batches in order, in parallel within each batch
5. Propagate predecessor output to the next batch

For OpenCode integration details, see:
- `references/opencode-integration.md`

## Installation

```bash
uv sync --project .opencode/skills/agentic-pert/package \
  --extra dev \
  --extra visualization
```

## Validation with uv

```bash
cd .opencode/skills/agentic-pert/package
uv run pytest -q
```

```bash
uv run --project .opencode/skills/agentic-pert/package \
  python .opencode/skills/agentic-pert/scripts/validate_opencode.py
```

## Dependencies

- Python >= 3.10
- networkx >= 3.0
- typer >= 0.9
- pydantic >= 2.0
- rich >= 13.0

## References

- `package/README.md` (library usage)
- `references/pert-cpm-theory.md` (PERT/CPM theory)
- `references/opencode-integration.md` (OpenCode integration)
