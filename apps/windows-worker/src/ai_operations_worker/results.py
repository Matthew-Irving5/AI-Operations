"""Signed outbound worker result envelopes."""
from __future__ import annotations
import base64
import json
from typing import Any
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

def sign_scan_result(key: Ed25519PrivateKey, device_id: str, scan_id: str, inventory: list[dict[str, Any]]) -> dict[str, Any]:
    payload = {"deviceId": device_id, "scanId": scan_id, "inventory": inventory}
    signature = key.sign(json.dumps(payload, separators=(",", ":")).encode())
    return {**payload, "signatureB64": base64.b64encode(signature).decode()}
