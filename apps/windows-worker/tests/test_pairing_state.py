import json
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from ai_operations_worker.identity import public_key_fingerprint
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
