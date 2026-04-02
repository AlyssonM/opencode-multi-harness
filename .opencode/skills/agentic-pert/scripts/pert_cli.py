#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
PACKAGE_ROOT = ROOT / "package"
if str(PACKAGE_ROOT) not in sys.path:
    sys.path.insert(0, str(PACKAGE_ROOT))


def _read_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")


def _split_predecessors(raw: str) -> list[str]:
    if not raw.strip():
        return []
    return [item.strip() for item in raw.split(",") if item.strip()]


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="pert-cli", description="Support CLI to create and analyze PERT/CPM plans")
    sub = parser.add_subparsers(dest="command", required=True)

    prompt = sub.add_parser("prompt", help="generate a decomposition prompt for an LLM")
    prompt.add_argument("--objective", required=True, help="high-level objective")

    init_plan = sub.add_parser("init-plan", help="initialize a plan file")
    init_plan.add_argument("--objective", required=True, help="high-level plan objective")
    init_plan.add_argument("--output", required=True, help="output .json file")

    add_task = sub.add_parser("add-task", help="manually add a task to the plan")
    add_task.add_argument("--plan", required=True, help="plan .json file")
    add_task.add_argument("--id", required=True, help="task id, e.g. T1")
    add_task.add_argument("--description", required=True, help="task description")
    add_task.add_argument("--predecessors", default="", help="predecessor ids separated by commas")
    add_task.add_argument("--optimistic", type=float, required=True, help="optimistic estimate (hours)")
    add_task.add_argument("--most-likely", type=float, required=True, help="most likely estimate (hours)")
    add_task.add_argument("--pessimistic", type=float, required=True, help="pessimistic estimate (hours)")

    from_dec = sub.add_parser("from-decomposition", help="load tasks from decomposition JSON and assemble a plan")
    from_dec.add_argument("--objective", required=True, help="high-level plan objective")
    from_dec.add_argument("--decomposition-file", required=True, help="planner JSON file containing tasks")
    from_dec.add_argument("--output", required=True, help="plan output .json file")

    analyze = sub.add_parser("analyze", help="compute PERT/CPM from the plan")
    analyze.add_argument("--plan", required=True, help="plan .json file")
    analyze.add_argument("--output", required=True, help="analysis output .json file")
    analyze.add_argument("--mermaid-output", help="optional Mermaid output file")
    analyze.add_argument(
        "--mermaid-style",
        choices=["flowchart", "classic-pert", "pert-gantt"],
        default="flowchart",
        help="Mermaid output style",
    )
    analyze.add_argument(
        "--mermaid-milestone-label",
        help="final milestone label for pert-gantt style",
    )
    return parser


def _cmd_prompt(args: argparse.Namespace) -> int:
    from agentic_pert.planner import build_decomposition_prompt

    print(build_decomposition_prompt(args.objective))
    return 0


def _cmd_init_plan(args: argparse.Namespace) -> int:
    payload = {"objective": args.objective, "tasks": []}
    _write_json(Path(args.output), payload)
    print(f"Initial plan created at {args.output}")
    return 0


def _validate_estimates(o: float, m: float, p: float) -> None:
    if not (o > 0 and m > 0 and p > 0):
        raise ValueError("Estimates must be greater than zero")
    if not (o <= m <= p):
        raise ValueError("Estimates must satisfy optimistic <= most_likely <= pessimistic")


def _cmd_add_task(args: argparse.Namespace) -> int:
    _validate_estimates(args.optimistic, args.most_likely, args.pessimistic)
    plan_path = Path(args.plan)
    payload = _read_json(plan_path)
    tasks = payload.setdefault("tasks", [])

    if any(task.get("id") == args.id for task in tasks):
        raise ValueError(f"Duplicate task id: {args.id}")

    predecessors = _split_predecessors(args.predecessors)
    known = {task.get("id") for task in tasks}
    missing = [pred for pred in predecessors if pred not in known]
    if missing:
        raise ValueError(f"Predecessors not found in plan: {missing}")

    tasks.append(
        {
            "id": args.id,
            "description": args.description,
            "predecessors": predecessors,
            "optimistic": args.optimistic,
            "most_likely": args.most_likely,
            "pessimistic": args.pessimistic,
        }
    )
    _write_json(plan_path, payload)
    print(f"Task {args.id} added to {args.plan}")
    return 0


def _cmd_from_decomposition(args: argparse.Namespace) -> int:
    from agentic_pert.planner import PlannerResponseModel

    decomposition = _read_json(Path(args.decomposition_file))
    parsed = PlannerResponseModel.model_validate(decomposition)
    payload = {
        "objective": args.objective,
        "tasks": [
            {
                "id": task.id,
                "description": task.description,
                "predecessors": task.predecessors,
                "optimistic": task.optimistic,
                "most_likely": task.most_likely,
                "pessimistic": task.pessimistic,
            }
            for task in parsed.tasks
        ],
    }
    _write_json(Path(args.output), payload)
    print(f"Plan created from decomposition at {args.output}")
    return 0


def _cmd_analyze(args: argparse.Namespace) -> int:
    try:
        from agentic_pert.models import Task
        from agentic_pert.pert_cpm import analyze_plan
        from agentic_pert.visualization import to_mermaid
    except ModuleNotFoundError as exc:
        raise ValueError(
            "Missing dependencies. Run: "
            "uv sync --project .opencode/skills/agentic-pert/package --extra dev --extra visualization"
        ) from exc

    payload = _read_json(Path(args.plan))
    tasks_raw = payload.get("tasks", [])
    if not tasks_raw:
        raise ValueError("Plan has no tasks")

    tasks = []
    for task in tasks_raw:
        tasks.append(
            Task(
                id=task["id"],
                description=task["description"],
                predecessors=task.get("predecessors", []),
                optimistic=float(task["optimistic"]),
                most_likely=float(task["most_likely"]),
                pessimistic=float(task["pessimistic"]),
            )
        )

    plan, timings, batches = analyze_plan(tasks)
    output = {
        "objective": payload.get("objective", ""),
        "critical_path": plan.critical_path,
        "total_duration": plan.total_duration,
        "dependencies": plan.dependencies,
        "parallel_batches": batches,
        "tasks": [
            {
                "id": t.id,
                "description": t.description,
                "predecessors": t.predecessors,
                "optimistic": t.optimistic,
                "most_likely": t.most_likely,
                "pessimistic": t.pessimistic,
                "pert_duration": t.pert_duration,
                "status": t.status,
                "timings": timings[t.id],
            }
            for t in plan.tasks
        ],
    }
    _write_json(Path(args.output), output)
    print(f"PERT/CPM analysis saved at {args.output}")

    if args.mermaid_output:
        mermaid = to_mermaid(
            plan,
            timings,
            style=args.mermaid_style,
            milestone_label=args.mermaid_milestone_label,
        )
        path = Path(args.mermaid_output)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(mermaid, encoding="utf-8")
        print(f"Mermaid ({args.mermaid_style}) saved at {args.mermaid_output}")
    return 0


def main() -> int:
    parser = _build_parser()
    args = parser.parse_args()
    handlers = {
        "prompt": _cmd_prompt,
        "init-plan": _cmd_init_plan,
        "add-task": _cmd_add_task,
        "from-decomposition": _cmd_from_decomposition,
        "analyze": _cmd_analyze,
    }
    try:
        return handlers[args.command](args)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
