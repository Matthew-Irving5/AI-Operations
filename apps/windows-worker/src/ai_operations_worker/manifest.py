"""Strict, signed manifest verification; arbitrary commands are intentionally impossible."""

from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from enum import StrEnum

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey


class ActionType(StrEnum):
    MOVE = "move"
    RENAME = "rename"
    ARCHIVE = "archive"
    QUARANTINE = "quarantine"
    PURGE_QUARANTINE = "purge_quarantine"


@dataclass(frozen=True)
class FilePrecondition:
    sha256: str
    modified_at_ns: int


@dataclass(frozen=True)
class ActionManifest:
    manifest_id: str
    device_id: str
    expires_at: datetime
    action: ActionType
    source: str
    destination: str | None
    precondition: FilePrecondition

    @classmethod
    def from_payload(cls, payload: dict[str, object]) -> ActionManifest:
        try:
            return cls(
                manifest_id=str(payload["manifest_id"]),
                device_id=str(payload["device_id"]),
                expires_at=datetime.fromisoformat(str(payload["expires_at"])).astimezone(UTC),
                action=ActionType(str(payload["action"])),
                source=str(payload["source"]),
                destination=(str(payload["destination"]) if payload.get("destination") else None),
                precondition=FilePrecondition(**dict(payload["precondition"])),
            )
        except (KeyError, TypeError, ValueError) as error:
            raise ValueError("manifest_invalid") from error


def verify_manifest(
    payload: dict[str, object], signature_b64: str, public_key_b64: str, device_id: str, now: datetime,
) -> ActionManifest:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    try:
        Ed25519PublicKey.from_public_bytes(base64.b64decode(public_key_b64)).verify(
            base64.b64decode(signature_b64), canonical,
        )
    except (ValueError, InvalidSignature) as error:
        raise ValueError("manifest_signature_invalid") from error
    manifest = ActionManifest.from_payload(payload)
    if manifest.device_id != device_id:
        raise ValueError("manifest_device_mismatch")
    if manifest.expires_at <= now.astimezone(UTC):
        raise ValueError("manifest_expired")
    if manifest.action is ActionType.PURGE_QUARANTINE and manifest.destination is not None:
        raise ValueError("manifest_purge_destination_forbidden")
    if manifest.action is not ActionType.PURGE_QUARANTINE and not manifest.destination:
        raise ValueError("manifest_destination_required")
    return manifest
