"""Durable, local-only worker state. No local listener is ever created."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class WorkerState:
    device_id: str
    cursor: str | None


class StateStore:
    def __init__(self, database_path: Path) -> None:
        self._connection = sqlite3.connect(database_path)
        self._connection.execute(
            "create table if not exists worker_state (key text primary key, value text not null)",
        )
        self._connection.execute(
            "create table if not exists completed_manifests (manifest_id text primary key, completed_at text not null)",
        )
        self._connection.commit()

    def get(self, key: str) -> str | None:
        row = self._connection.execute("select value from worker_state where key = ?", (key,)).fetchone()
        return row[0] if row else None

    def set(self, key: str, value: str) -> None:
        self._connection.execute(
            "insert into worker_state(key, value) values (?, ?) on conflict(key) do update set value = excluded.value",
            (key, value),
        )
        self._connection.commit()

    def mark_manifest_completed(self, manifest_id: str, completed_at: str) -> bool:
        try:
            self._connection.execute(
                "insert into completed_manifests(manifest_id, completed_at) values (?, ?)",
                (manifest_id, completed_at),
            )
            self._connection.commit()
        except sqlite3.IntegrityError:
            return False
        return True
