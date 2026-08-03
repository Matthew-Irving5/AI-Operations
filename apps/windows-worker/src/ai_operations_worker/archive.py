"""Verified Parquet/Zstandard archive artifacts and synthetic restore drills."""
from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pyarrow as pa
import pyarrow.parquet as pq


@dataclass(frozen=True)
class ArchiveManifest:
    sha256: str
    record_count: int
    min_recorded_at: str | None
    max_recorded_at: str | None
    schema_version: int = 1

def write_parquet(records: list[dict[str, Any]], destination: Path) -> ArchiveManifest:
    destination.parent.mkdir(parents=True, exist_ok=True)
    table = pa.Table.from_pylist(records)
    pq.write_table(table, destination, compression="zstd")
    digest = hashlib.file_digest(destination.open("rb"), "sha256").hexdigest()
    timestamps = [str(record["recorded_at"]) for record in records if record.get("recorded_at")]
    verified = pq.read_table(destination)
    if verified.num_rows != len(records):
        raise ValueError("archive_record_count_mismatch")
    return ArchiveManifest(digest, len(records), min(timestamps) if timestamps else None, max(timestamps) if timestamps else None)

def restore_parquet(source: Path) -> list[dict[str, Any]]:
    return pq.read_table(source).to_pylist()
