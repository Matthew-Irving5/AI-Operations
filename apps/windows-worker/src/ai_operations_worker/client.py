"""Outbound-only polling worker. It never binds a local port or accepts remote commands."""
from __future__ import annotations

import argparse
import json
import os
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from .config import WorkerEndpoint
from .executor import execute
from .identity import (
    create_or_load_private_key,
    load_secret,
    protect_secret,
    public_key_b64,
    public_key_fingerprint,
)
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
        try:
            with urlopen(request, timeout=30) as response:
                return json.loads(response.read())
        except HTTPError as error:
            payload = json.loads(error.read() or b"{}")
            code = payload.get("code", "remote_error")
            raise RuntimeError(f"{error.code}:{code}") from error

    def send_queued_results(self) -> None:
        for result_id, payload in self.state.pending_results():
            try:
                path = "/worker-submit-result" if "scanId" in payload else "/worker-submit-action-result"
                self.post(path, payload)
            except OSError:
                return
            self.state.delete_result(result_id)

    def heartbeat(self) -> dict[str, Any]:
        return self.post("/worker-heartbeat", {
            "deviceId": self.config.device_id,
            "workerVersion": "0.2.0",
            "status": {"transport": "outbound_https"},
        })

    def poll(self) -> dict[str, Any]:
        return self.post("/worker-poll", {"deviceId": self.config.device_id})

    def run_once(self) -> dict[str, Any]:
        self.send_queued_results()
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
            try:
                return self.post("/worker-submit-result", envelope)
            except OSError:
                self.state.queue_result(envelope)
                return {"scan": scan, "queued": True}
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
                result = {
                    "deviceId": self.config.device_id, "manifestId": manifest_id,
                    "success": True, "detail": str(destination),
                }
                try:
                    return self.post("/worker-submit-action-result", result)
                except OSError:
                    self.state.queue_result(result)
                    return {"manifest": manifest, "queued": True}
            except ValueError as error:
                result = {
                    "deviceId": self.config.device_id, "manifestId": manifest_id,
                    "success": False, "detail": str(error),
                }
                try:
                    return self.post("/worker-submit-action-result", result)
                except OSError:
                    self.state.queue_result(result)
                    return {"manifest": manifest, "queued": True}
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
            except RuntimeError as error:
                if str(error).startswith(("401:", "403:")):
                    return
                delay = min(max(delay * 2, 30), 3600)
            time.sleep(delay)

def main() -> None:
    parser = argparse.ArgumentParser(description="AI Operations outbound Windows worker")
    subparsers = parser.add_subparsers(dest="command")
    identity_parser = subparsers.add_parser("identity", help="create/load the local identity")
    identity_parser.add_argument("--key-path", default=os.environ.get("AI_OPERATIONS_KEY_PATH", "worker.key.dpapi"))
    pair_parser = subparsers.add_parser("pair", help="pair this local identity with a registered device")
    pair_parser.add_argument("--control-plane-url", default=os.environ.get("AI_OPERATIONS_CONTROL_PLANE_URL"))
    pair_parser.add_argument("--device-id", required=True)
    pair_parser.add_argument("--pairing-code", required=True)
    pair_parser.add_argument("--key-path", default=os.environ.get("AI_OPERATIONS_KEY_PATH", "worker.key.dpapi"))
    pair_parser.add_argument("--secret-path", default=os.environ.get("AI_OPERATIONS_SECRET_PATH", "worker.secret.dpapi"))
    args = parser.parse_args()
    if args.command == "identity":
        key = create_or_load_private_key(Path(args.key_path))
        print(json.dumps({"publicKeyB64": public_key_b64(key), "fingerprintSha256": public_key_fingerprint(key)}))
        return
    if args.command == "pair":
        if not args.control_plane_url:
            raise ValueError("control_plane_required")
        endpoint = WorkerEndpoint(args.control_plane_url)
        endpoint.validate()
        key = create_or_load_private_key(Path(args.key_path))
        request = Request(
            endpoint.control_plane_url.rstrip("/") + "/worker-pair",
            data=json.dumps({"deviceId": args.device_id, "pairingCode": args.pairing_code}).encode(),
            method="POST",
            headers={"content-type": "application/json"},
        )
        try:
            with urlopen(request, timeout=30) as response:
                payload = json.loads(response.read())
        except HTTPError as error:
            body = json.loads(error.read() or b"{}")
            raise RuntimeError(f"{error.code}:{body.get('code', 'pairing_failed')}") from error
        worker_secret = payload.get("workerSecret")
        if not isinstance(worker_secret, str) or len(worker_secret) < 32:
            raise RuntimeError("pairing_secret_missing")
        protect_secret(Path(args.secret_path), worker_secret)
        print(json.dumps({"paired": True, "deviceId": args.device_id, "fingerprintSha256": public_key_fingerprint(key)}))
        return
    roots = tuple(Path(value) for value in json.loads(os.environ["AI_OPERATIONS_ALLOWED_ROOTS_JSON"]))
    if not roots:
        raise ValueError("allowlisted_roots_required")
    ControlPlaneClient(WorkerConfiguration(
        WorkerEndpoint(os.environ["AI_OPERATIONS_CONTROL_PLANE_URL"]),
        os.environ.get("AI_OPERATIONS_WORKER_SECRET") or load_secret(Path(os.environ.get("AI_OPERATIONS_SECRET_PATH", "worker.secret.dpapi"))), os.environ["AI_OPERATIONS_DEVICE_ID"],
        Path(os.environ.get("AI_OPERATIONS_STATE_PATH", "worker-state.sqlite")),
        Path(os.environ.get("AI_OPERATIONS_KEY_PATH", "worker.key.dpapi")),
        os.environ["AI_OPERATIONS_MANIFEST_PUBLIC_KEY_B64"], roots,
        Path(os.environ["AI_OPERATIONS_QUARANTINE_ROOT"]),
    )).run_forever()
