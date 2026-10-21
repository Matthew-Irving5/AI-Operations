"""Versioned worker capabilities sent to the outbound control plane."""
from __future__ import annotations

import base64

WORKER_VERSION = "0.2.0"
INVENTORY_CAPABILITY = "digital_inventory_v1"
SIGNED_FILE_ACTIONS_CAPABILITY = "signed_file_actions_v1"


def worker_capabilities(manifest_public_key_b64: str) -> tuple[str, ...]:
    """Advertise only capabilities that this local configuration can run."""
    capabilities = [INVENTORY_CAPABILITY]
    try:
        key = base64.b64decode(manifest_public_key_b64, validate=True)
    except (ValueError, TypeError):
        key = b""
    if len(key) == 32:
        capabilities.append(SIGNED_FILE_ACTIONS_CAPABILITY)
    return tuple(capabilities)
