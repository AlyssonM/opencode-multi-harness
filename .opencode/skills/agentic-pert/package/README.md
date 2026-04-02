# Agentic PERT + CPM

Agentic PERT/CPM toolkit for task planning with critical path and parallel batches.

## Installation

```bash
uv sync --project .opencode/skills/agentic-pert/package \
  --extra dev \
  --extra visualization
```

## CLI

Available command:

```bash
uv run --project .opencode/skills/agentic-pert/package pert-agent plan "<task>"
```

Current CLI flow:

1. Without `--input-file`, it prints a suggested prompt for you to run in an external LLM.
2. With `--input-file`, it processes the planner JSON output and computes the PERT/CPM plan.

Example:

```bash
# 1) Suggested prompt
uv run --project .opencode/skills/agentic-pert/package pert-agent \
  plan "Implement JWT + dashboard + tests"

# 2) Save the LLM response to planner-output.json

# 3) Generate plan in JSON
uv run --project .opencode/skills/agentic-pert/package pert-agent \
  plan "Implement JWT + dashboard + tests" \
  --input-file planner-output.json \
  --output json

# 4) Generate plan in Mermaid
uv run --project .opencode/skills/agentic-pert/package pert-agent \
  plan "Implement JWT + dashboard + tests" \
  --input-file planner-output.json \
  --output mermaid
```

## Python API

### PERT/CPM Analysis

```python
from agentic_pert import Task, analyze_plan

tasks = [
    Task(id="T1", description="Setup JWT", predecessors=[], optimistic=1, most_likely=2, pessimistic=3),
    Task(id="T2", description="Auth endpoints", predecessors=["T1"], optimistic=2, most_likely=3, pessimistic=5),
]

plan, timings, batches = analyze_plan(tasks)
```

### Visualization

```python
from agentic_pert import to_mermaid, to_d3, to_cytoscape, to_react_flow, to_dot, to_ascii

mermaid = to_mermaid(plan, timings)
d3_data = to_d3(plan, timings)
cyto_data = to_cytoscape(plan, timings)
flow_data = to_react_flow(plan, timings)
dot_text = to_dot(plan, timings)
ascii_text = to_ascii(plan, timings)
```

### Execution via Adapters

```python
from agentic_pert import OpenCodePlanExecutor

opencode_executor = OpenCodePlanExecutor(model="openai/gpt-5.2")
```

## Notes

- The OpenCode adapter can run in mock mode (without callback) or with a custom callback for real runtime integration.
- The Python package produces plans and batches; execution orchestration stays in the integrator runtime.
- The core package does not execute LLM calls automatically; decomposition is provided as planner JSON.

## License

MIT
