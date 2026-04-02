# OpenCode Integration

## Objective

Execute PERT/CPM batches in OpenCode with predictable behavior:
- batches in sequence
- tasks in the same batch in parallel
- context propagation between predecessors and successors

## Assumptions

- The plan was already analyzed by `agentic_pert.analyze_plan(...)` or by `scripts/pert_cli.py analyze`.
- Each item in `parallel_batches` is a safe parallelism level.
- The primary runtime remains responsible for integrating results between batches.

## Recommended Flow

1. Load tasks and `parallel_batches`.
2. Execute one batch at a time.
3. For each task in the batch, delegate to the OpenCode runtime/subagent.
4. Wait for all tasks in the current batch to finish.
5. Consolidate useful outputs from completed tasks.
6. Pass this context to tasks in the next batch.

## Python Adapter Usage

```python
from agentic_pert import Task, analyze_plan, OpenCodePlanExecutor

tasks = [
    Task(id="T1", description="Setup project", predecessors=[], optimistic=1, most_likely=2, pessimistic=3),
    Task(id="T2", description="Implement auth", predecessors=["T1"], optimistic=2, most_likely=3, pessimistic=5),
]

plan, timings, batches = analyze_plan(tasks)
executor = OpenCodePlanExecutor(model="openai/gpt-5.2")
results = await executor.execute_plan(tasks, batches)
```

## Mock Mode vs Real Runtime

- Without `task_runner`: `OpenCodeExecutor` returns mock output (useful for local pipeline validation).
- With `task_runner`: the callback executes a real runtime task and returns output to the executor.

Callback example:

```python
async def task_runner(task, model):
    # Integrate with your OpenCode delegation strategy here
    # e.g., agent call, external command, API, etc.
    return f"Executed {task.id} with model={model}"
```
