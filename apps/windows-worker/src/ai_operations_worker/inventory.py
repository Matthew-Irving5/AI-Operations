"""Read-only allowlisted inventory with mandatory sensitive/excluded path filtering."""
from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path

EXCLUDED_NAMES = frozenset({"node_modules", ".venv", "venv", ".ssh", "cache", "caches"})
EXCLUDED_MARKERS = ("brightsg", "password", "credential", "browser")

@dataclass(frozen=True)
class InventoryItem:
    path_token: str
    filename: str
    size_bytes: int
    sha256: str | None

def is_excluded(path: Path) -> bool:
    parts = {part.lower() for part in path.parts}
    rendered = str(path).lower()
    return bool(parts & EXCLUDED_NAMES) or any(marker in rendered for marker in EXCLUDED_MARKERS)

def collect(roots: tuple[Path, ...], hash_max_bytes: int = 10_000_000) -> list[InventoryItem]:
    items: list[InventoryItem] = []
    for root in roots:
        resolved = root.resolve()
        for path in resolved.rglob("*"):
            if path.is_symlink() or not path.is_file() or is_excluded(path):
                continue
            stat = path.stat()
            digest = None
            if stat.st_size <= hash_max_bytes:
                with path.open("rb") as source:
                    digest = hashlib.file_digest(source, "sha256").hexdigest()
            items.append(InventoryItem(hashlib.sha256(str(path).encode()).hexdigest(), path.name, stat.st_size, digest))
    return items
