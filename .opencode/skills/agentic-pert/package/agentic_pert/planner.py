from __future__ import annotations

import json
from typing import Any

from pydantic import BaseModel, Field, ValidationError, model_validator

from .models import Task


class PlannerTaskModel(BaseModel):
    id: str = Field(min_length=1)
    description: str = Field(min_length=1)
    predecessors: list[str] = Field(default_factory=list)
    optimistic: float = Field(gt=0)
    most_likely: float = Field(gt=0)
    pessimistic: float = Field(gt=0)

    @model_validator(mode="after")
    def validate_estimates(self) -> "PlannerTaskModel":
        if self.optimistic > self.most_likely or self.most_likely > self.pessimistic:
            raise ValueError("Expected optimistic <= most_likely <= pessimistic")
        return self


class PlannerResponseModel(BaseModel):
    tasks: list[PlannerTaskModel] = Field(min_length=1)


def build_decomposition_prompt(user_task: str) -> str:
    """Base prompt to request task decomposition from an LLM."""
    return f"""
You are a technical planner specialized in PERT/CPM.
Decompose the user task into atomic subtasks with DAG dependencies.

Rules:
1) Respond with valid JSON ONLY
2) Structure: {{"tasks": [ ... ]}}
3) Each task must include: id, description, predecessors, optimistic, most_likely, pessimistic
4) IDs must be unique and short (e.g., T1, T2, T3)
5) predecessors must reference existing IDs only
6) Estimates must be in hours and follow: optimistic <= most_likely <= pessimistic

User task:
{user_task}
""".strip()


def _strip_json_fence(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        return "\n".join(lines).strip()
    return text


def parse_plan_json(llm_output: str) -> list[Task]:
    """Parse structured planner JSON output and convert it to Task dataclasses."""
    raw = _strip_json_fence(llm_output)

    try:
        data: Any = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON from planner: {exc}") from exc

    try:
        parsed = PlannerResponseModel.model_validate(data)
    except ValidationError as exc:
        raise ValueError(f"Planner schema validation failed: {exc}") from exc

    ids = {task.id for task in parsed.tasks}
    for task in parsed.tasks:
        missing = [p for p in task.predecessors if p not in ids]
        if missing:
            raise ValueError(f"Task '{task.id}' has unknown predecessors: {missing}")

    return [
        Task(
            id=t.id,
            description=t.description,
            predecessors=t.predecessors,
            optimistic=t.optimistic,
            most_likely=t.most_likely,
            pessimistic=t.pessimistic,
        )
        for t in parsed.tasks
    ]
