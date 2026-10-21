import base64
import json
import tomllib
from pathlib import Path

import pytest

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from ai_operations_worker.client import ControlPlaneClient, WorkerConfiguration
from ai_operations_worker.config import WorkerEndpoint
from ai_operations_worker.identity import public_key_fingerprint
from ai_operations_worker.protocol import WORKER_VERSION
from ai_operations_worker.state import StateStore


def test_identity_fingerprint_is_stable_and_public_only() -> None:
    key = Ed25519PrivateKey.generate()
    fingerprint = public_key_fingerprint(key)
    assert len(fingerprint) == 64
    assert fingerprint == public_key_fingerprint(key)
    assert key.private_bytes_raw().hex() not in fingerprint


def test_offline_result_outbox_round_trip(tmp_path: Path) -> None:
    store = StateStore(tmp_path / 'state.sqlite')
    payload: dict[str, object] = {
        'deviceId': 'device-1',
        'scanId': 'scan-1',
        'inventory': [],
    }
    store.queue_result(payload)
    pending = store.pending_results()
    assert len(pending) == 1
    assert pending[0][1] == json.loads(json.dumps(payload))
    store.delete_result(pending[0][0])
    assert store.pending_results() == []


def test_read_only_worker_can_start_without_action_manifest_key(tmp_path: Path) -> None:
    client = ControlPlaneClient(WorkerConfiguration(
        endpoint=WorkerEndpoint("https://example.supabase.co/functions/v1"),
        worker_secret="secret",
        device_id="device-1",
        state_path=tmp_path / "state.sqlite",
        key_path=tmp_path / "worker.key.dpapi",
        manifest_public_key_b64="",
        allowed_roots=(tmp_path,),
        quarantine_root=tmp_path / "quarantine",
    ))
    assert client.config.manifest_public_key_b64 == ""


def test_worker_reports_version_and_configured_capabilities_on_heartbeat_and_poll(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    requests: list[tuple[str, dict[str, object]]] = []

    def fake_post(
        client: ControlPlaneClient,
        path: str,
        body: dict[str, object],
    ) -> dict[str, object]:
        requests.append((path, body))
        return {"ok": True}

    monkeypatch.setattr(ControlPlaneClient, "post", fake_post)
    client = ControlPlaneClient(WorkerConfiguration(
        endpoint=WorkerEndpoint("https://example.supabase.co/functions/v1"),
        worker_secret="secret",
        device_id="00000000-0000-4000-8000-000000000001",
        state_path=tmp_path / "state.sqlite",
        key_path=tmp_path / "worker.key.dpapi",
        manifest_public_key_b64=base64.b64encode(b"m" * 32).decode(),
        allowed_roots=(tmp_path,),
        quarantine_root=tmp_path / "quarantine",
    ))

    client.heartbeat()
    client.poll()

    assert [path for path, _ in requests] == ["/worker-heartbeat", "/worker-poll"]
    for _, body in requests:
        assert body["workerVersion"] == "0.2.0"
        assert body["capabilities"] == ["digital_inventory_v1", "signed_file_actions_v1"]
    assert requests[0][1]["status"] == {"transport": "outbound_https"}


def test_read_only_worker_does_not_advertise_signed_file_actions(
    tmp_path: Path,
) -> None:
    client = ControlPlaneClient(WorkerConfiguration(
        endpoint=WorkerEndpoint("https://example.supabase.co/functions/v1"),
        worker_secret="secret",
        device_id="00000000-0000-4000-8000-000000000001",
        state_path=tmp_path / "state.sqlite",
        key_path=tmp_path / "worker.key.dpapi",
        manifest_public_key_b64="",
        allowed_roots=(tmp_path,),
        quarantine_root=tmp_path / "quarantine",
    ))

    assert client.protocol_metadata() == {
        "workerVersion": "0.2.0",
        "capabilities": ["digital_inventory_v1"],
    }


def test_reported_version_matches_packaged_worker_version() -> None:
    project_file = Path(__file__).parents[1] / "pyproject.toml"
    metadata = tomllib.loads(project_file.read_text(encoding="utf-8"))

    assert metadata["project"]["version"] == WORKER_VERSION
