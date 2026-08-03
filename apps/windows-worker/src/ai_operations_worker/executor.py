"""Reversible file executor with allowlisted roots and changed-file protection."""

from __future__ import annotations

import hashlib
import shutil
from pathlib import Path

from .manifest import ActionManifest, ActionType


def _within(path: Path, roots: tuple[Path, ...]) -> Path:
    resolved = path.resolve(strict=False)
    if not any(resolved.is_relative_to(root.resolve()) for root in roots):
        raise ValueError("path_outside_allowlisted_roots")
    return resolved


def _digest(path: Path) -> str:
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def execute(manifest: ActionManifest, roots: tuple[Path, ...], quarantine_root: Path) -> Path:
    source = _within(Path(manifest.source), roots)
    if source.is_symlink() or not source.is_file():
        raise ValueError("source_reparse_or_missing")
    stat = source.stat()
    if stat.st_mtime_ns != manifest.precondition.modified_at_ns or _digest(source) != manifest.precondition.sha256:
        raise ValueError("source_precondition_changed")
    if manifest.action is ActionType.PURGE_QUARANTINE:
        _within(source, (quarantine_root,))
        raise ValueError("purge_requires_separate_server_approval")
    target = _within(Path(manifest.destination or ""), roots)
    if target.exists():
        raise ValueError("destination_exists")
    target.parent.mkdir(parents=True, exist_ok=True)
    if manifest.action is ActionType.QUARANTINE:
        target = _within(quarantine_root / source.name, (quarantine_root,))
        target.parent.mkdir(parents=True, exist_ok=True)
    if manifest.action is ActionType.ARCHIVE:
        shutil.copy2(source, target)
        return target
    shutil.move(str(source), str(target))
    return target
