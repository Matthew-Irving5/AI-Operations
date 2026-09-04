"""Extend an exported AI Operations Shortcut with additional quantity metrics.

The source Shortcut is supplied at runtime because it contains operator-owned
configuration and must never be committed to the repository.
"""

from __future__ import annotations

import argparse
import copy
import json
import uuid
from pathlib import Path
from typing import Any


HEALTH_FILTER = "is.workflow.actions.filter.health.quantity"
APPEND_VARIABLE = "is.workflow.actions.appendvariable"


def new_uuid() -> str:
    return str(uuid.uuid4()).upper()


def replace_uuid_references(value: Any, replacements: dict[str, str]) -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            if key in {"UUID", "OutputUUID"} and isinstance(child, str):
                value[key] = replacements.get(child, child)
            else:
                replace_uuid_references(child, replacements)
    elif isinstance(value, list):
        for child in value:
            replace_uuid_references(child, replacements)


def replace_metric(value: Any, old_metric: str, new_metric: str) -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            if key == "Value" and child == old_metric:
                value[key] = new_metric
            else:
                replace_metric(child, old_metric, new_metric)
    elif isinstance(value, list):
        for child in value:
            replace_metric(child, old_metric, new_metric)


def extend(source: Path, destination: Path, metrics: list[str]) -> None:
    workflow = json.loads(source.read_text(encoding="utf-8"))
    actions = workflow["WFWorkflowActions"]
    template_index = next(
        index
        for index, action in enumerate(actions)
        if action["WFWorkflowActionIdentifier"] == HEALTH_FILTER
    )
    template_filter = actions[template_index]
    template_append = actions[template_index + 1]
    if template_append["WFWorkflowActionIdentifier"] != APPEND_VARIABLE:
        raise ValueError("health_filter_append_pair_not_found")

    existing = json.dumps(actions, ensure_ascii=False)
    additions: list[dict[str, Any]] = []
    for metric in metrics:
        if f'"Value": "{metric}"' in existing:
            continue
        filter_action = copy.deepcopy(template_filter)
        append_action = copy.deepcopy(template_append)
        old_filter_uuid = filter_action["WFWorkflowActionParameters"]["UUID"]
        old_append_uuid = append_action["WFWorkflowActionParameters"].get("UUID")
        replacements = {old_filter_uuid: new_uuid()}
        if old_append_uuid:
            replacements[old_append_uuid] = new_uuid()
        replace_uuid_references(filter_action, replacements)
        replace_uuid_references(append_action, replacements)
        replace_metric(filter_action, "Steps", metric)
        additions.extend([filter_action, append_action])

    insert_at = (
        max(
            index
            for index, action in enumerate(actions)
            if action["WFWorkflowActionIdentifier"] == HEALTH_FILTER
        )
        + 2
    )
    actions[insert_at:insert_at] = additions
    destination.write_text(
        json.dumps(workflow, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("metrics", nargs="+")
    args = parser.parse_args()
    extend(args.source, args.destination, args.metrics)


if __name__ == "__main__":
    main()
