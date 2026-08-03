"""Outbound-only polling worker. It never binds a local port or accepts remote commands."""
from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen

from .config import WorkerEndpoint
from .executor import execute
from .identity import create_or_load_private_key
from .inventory import collect
from .manifest import verify_manifest
from .results import sign_scan_result
from .state import StateStore


@dataclass(frozen=True)
class WorkerConfiguration:
    endpoint: WorkerEndpoint
    worker_secret: str
    device_id: str
    state_path: Path
    key_path: Path
    manifest_public_key_b64: str
    allowed_roots: tuple[Path, ...]
    quarantine_root: Path
    heartbeat_seconds: int = 15 * 60
    poll_seconds: int = 5 * 60

class ControlPlaneClient:
    def __init__(self, config: WorkerConfiguration) -> None:
        config.endpoint.validate()
        if not config.worker_secret or not config.device_id:
            raise ValueError("worker_identity_required")
        self.config = config
        self.state = StateStore(config.state_path)

    def post(self, path: str, body: dict[str, Any]) -> dict[str, Any]:
        request = Request(
            self.config.endpoint.control_plane_url.rstrip("/") + path,
            data=json.dumps(body).encode(), method="POST",
            headers={"content-type": "application/json", "x-worker-secret": self.config.worker_secret},
        )
        with urlopen(request, timeout=30) as response:
            return json.loads(response.read())

    def heartbeat(self) -> dict[str, Any]:
        return self.post("/worker-heartbeat", {"deviceId": self.config.device_id})

    def poll(self) -> dict[str, Any]:
        return self.post("/worker-poll", {"deviceId": self.config.device_id})

    def run_once(self) -> dict[str, Any]:
        task = self.poll()
        scan = task.get("scan")
        if isinstance(scan, dict):
            roots = scan.get("approved_roots")
            scan_id = scan.get("id")
            if not isinstance(roots, list) or not isinstance(scan_id, str):
                raise TypeError("scan_task_invalid")
            inventory = [
                {"pathToken": item.path_token, "filename": item.filename, "sizeBytes": item.size_bytes, "sha256": item.sha256}
                for item in collect(tuple(Path(root) for root in roots if isinstance(root, str)))
            ]
            envelope = sign_scan_result(create_or_load_private_key(self.config.key_path), self.config.device_id, scan_id, inventory)
            return self.post("/worker-submit-result", envelope)
        manifest = task.get("manifest")
        if isinstance(manifest, dict):
            payload = manifest.get("payload")
            signature = manifest.get("signature_b64")
            manifest_id = manifest.get("id")
            if not isinstance(payload, dict) or not isinstance(signature, str) or not isinstance(manifest_id, str):
                raise TypeError("manifest_task_invalid")
            try:
                action = verify_manifest(
                    payload,
                    signature,
                    self.config.manifest_public_key_b64,
                    self.config.device_id,
                    datetime.now(UTC),
                )
                if not self.state.mark_manifest_completed(action.manifest_id, datetime.now(UTC).isoformat()):
                    raise ValueError("manifest_replayed")
                destination = execute(action, self.config.allowed_roots, self.config.quarantine_root)
                return self.post("/worker-submit-action-result", {
                    "deviceId": self.config.device_id, "manifestId": manifest_id,
                    "success": True, "detail": str(destination),
                })
            except ValueError as error:
                return self.post("/worker-submit-action-result", {
                    "deviceId": self.config.device_id, "manifestId": manifest_id,
                    "success": False, "detail": str(error),
                })
        return task

    def run_forever(self) -> None:
        next_heartbeat = 0.0
        delay = self.config.poll_seconds
        while True:
            try:
                now = time.monotonic()
                if now >= next_heartbeat:
                    self.heartbeat()
                    next_heartbeat = now + self.config.heartbeat_seconds
                task = self.run_once()
                delay = 15 if task.get("scan") or task.get("manifest") else self.config.poll_seconds
            except OSError:
                delay = min(max(delay * 2, 30), 3600)
            time.sleep(delay)

def main() -> None:
    roots = tuple(Path(value) for value in json.loads(os.environ["AI_OPERATIONS_ALLOWED_ROOTS_JSON"]))
    if not roots:
        raise ValueError("allowlisted_roots_required")
    ControlPlaneClient(WorkerConfiguration(
        WorkerEndpoint(os.environ["AI_OPERATIONS_CONTROL_PLANE_URL"]),
        os.environ["AI_OPERATIONS_WORKER_SECRET"], os.environ["AI_OPERATIONS_DEVICE_ID"],
        Path(os.environ.get("AI_OPERATIONS_STATE_PATH", "worker-state.sqlite")),
        Path(os.environ.get("AI_OPERATIONS_KEY_PATH", "worker.key.dpapi")),
        os.environ["AI_OPERATIONS_MANIFEST_PUBLIC_KEY_B64"], roots,
        Path(os.environ["AI_OPERATIONS_QUARANTINE_ROOT"]),
    )).run_forever()
