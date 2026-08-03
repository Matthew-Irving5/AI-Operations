import base64
import hashlib
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from ai_operations_worker.executor import execute
from ai_operations_worker.manifest import verify_manifest
from ai_operations_worker.state import StateStore
from ai_operations_worker.inventory import collect
from ai_operations_worker.identity import public_key_b64
from ai_operations_worker.results import sign_scan_result
from ai_operations_worker.archive import restore_parquet, write_parquet


def signed_payload(source: Path, destination: Path, key: Ed25519PrivateKey) -> tuple[dict[str, object], str, str]:
    payload: dict[str, object] = {
        "manifest_id": "manifest-1",
        "device_id": "device-1",
        "expires_at": (datetime.now(UTC) + timedelta(minutes=5)).isoformat(),
        "action": "move",
        "source": str(source),
        "destination": str(destination),
        "precondition": {"sha256": hashlib.file_digest(source.open("rb"), "sha256").hexdigest(), "modified_at_ns": source.stat().st_mtime_ns},
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    signature = base64.b64encode(key.sign(canonical)).decode()
    public = base64.b64encode(key.public_key().public_bytes_raw()).decode()
    return payload, signature, public


def test_manifest_rejects_expiry_and_signature(tmp_path: Path) -> None:
    source, destination = tmp_path / "source.txt", tmp_path / "target.txt"
    source.write_text("safe")
    key = Ed25519PrivateKey.generate()
    payload, signature, public = signed_payload(source, destination, key)
    with pytest.raises(ValueError, match="manifest_signature_invalid"):
        verify_manifest(payload, signature[:-2] + "aa", public, "device-1", datetime.now(UTC))
    payload["expires_at"] = (datetime.now(UTC) - timedelta(seconds=1)).isoformat()
    signature = base64.b64encode(key.sign(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode())).decode()
    with pytest.raises(ValueError, match="manifest_expired"):
        verify_manifest(payload, signature, public, "device-1", datetime.now(UTC))


def test_executor_blocks_traversal_changed_files_and_replay(tmp_path: Path) -> None:
    source, destination, outside = tmp_path / "source.txt", tmp_path / "target.txt", tmp_path.parent / "outside.txt"
    source.write_text("safe")
    key = Ed25519PrivateKey.generate()
    payload, signature, public = signed_payload(source, destination, key)
    manifest = verify_manifest(payload, signature, public, "device-1", datetime.now(UTC))
    source.write_text("changed")
    with pytest.raises(ValueError, match="source_precondition_changed"):
        execute(manifest, (tmp_path,), tmp_path / "quarantine")
    payload, signature, public = signed_payload(source, outside, key)
    manifest = verify_manifest(payload, signature, public, "device-1", datetime.now(UTC))
    with pytest.raises(ValueError, match="path_outside_allowlisted_roots"):
        execute(manifest, (tmp_path,), tmp_path / "quarantine")
    store = StateStore(tmp_path / "state.sqlite")
    assert store.mark_manifest_completed("manifest-1", "2026-08-03T00:00:00Z")
    assert not store.mark_manifest_completed("manifest-1", "2026-08-03T00:01:00Z")


def test_executor_blocks_a_reparse_point_source(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    target = tmp_path / "real.txt"
    target.write_text("safe")
    source = tmp_path / "linked.txt"
    source.write_text("safe")
    destination = tmp_path / "destination.txt"
    key = Ed25519PrivateKey.generate()
    payload, signature, public = signed_payload(target, destination, key)
    payload["source"] = str(source)
    signature = base64.b64encode(
        key.sign(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode())
    ).decode()
    manifest = verify_manifest(payload, signature, public, "device-1", datetime.now(UTC))
    original_is_symlink = Path.is_symlink
    monkeypatch.setattr(Path, "is_symlink", lambda path: path == source or original_is_symlink(path))
    with pytest.raises(ValueError, match="source_reparse_or_missing"):
        execute(manifest, (tmp_path,), tmp_path / "quarantine")

def test_inventory_never_collects_excluded_or_symlinked_paths(tmp_path: Path) -> None:
    (tmp_path / "keep.txt").write_text("keep")
    excluded = tmp_path / "BrightSG"
    excluded.mkdir()
    (excluded / "work.txt").write_text("deny")
    cache = tmp_path / "node_modules"
    cache.mkdir()
    (cache / "x").write_text("deny")
    assert [item.filename for item in collect((tmp_path,))] == ["keep.txt"]

def test_identity_exports_public_material_only() -> None:
    assert len(base64.b64decode(public_key_b64(Ed25519PrivateKey.generate()))) == 32

def test_worker_results_are_signed_without_private_key_disclosure() -> None:
    envelope = sign_scan_result(Ed25519PrivateKey.generate(), "device-1", "scan-1", [])
    assert envelope["deviceId"] == "device-1"
    assert "signatureB64" in envelope

def test_parquet_zstd_archive_round_trip(tmp_path: Path) -> None:
    records = [{"recorded_at": "2026-08-03T00:00:00Z", "name": "synthetic", "size": 2}]
    archive = tmp_path / "inventory.parquet"
    manifest = write_parquet(records, archive)
    assert len(manifest.sha256) == 64
    assert restore_parquet(archive) == records
