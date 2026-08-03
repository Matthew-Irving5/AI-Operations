"""Windows DPAPI-protected Ed25519 identity; private material never leaves this device."""
from __future__ import annotations
import base64
from pathlib import Path
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

def create_or_load_private_key(path: Path) -> Ed25519PrivateKey:
    if path.exists():
        try:
            import win32crypt
        except ImportError as error:
            raise RuntimeError("windows_dpapi_unavailable") from error
        protected = path.read_bytes()
        raw = win32crypt.CryptUnprotectData(protected, None, None, None, 0)[1]
        return Ed25519PrivateKey.from_private_bytes(raw)
    key = Ed25519PrivateKey.generate()
    raw = key.private_bytes(serialization.Encoding.Raw, serialization.PrivateFormat.Raw, serialization.NoEncryption())
    try:
        import win32crypt
    except ImportError as error:
        raise RuntimeError("windows_dpapi_unavailable") from error
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(win32crypt.CryptProtectData(raw, "AI Operations worker", None, None, None, 0))
    return key

def public_key_b64(key: Ed25519PrivateKey) -> str:
    return base64.b64encode(key.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)).decode()
