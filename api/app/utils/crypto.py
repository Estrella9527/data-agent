"""Simple symmetric encryption for sensitive fields (passwords, API keys)."""

from __future__ import annotations

import base64
import os

# In production, set ENCRYPTION_KEY env var to a stable Fernet key.
# For MVP, fall back to a deterministic key derived from a secret.
_KEY: bytes | None = None


def _get_key() -> bytes:
    global _KEY
    if _KEY is not None:
        return _KEY

    env_key = os.environ.get("ENCRYPTION_KEY")
    if env_key:
        _KEY = env_key.encode()
    else:
        # MVP fallback — NOT secure for production
        from cryptography.fernet import Fernet
        _KEY = Fernet.generate_key()
    return _KEY


def encrypt(text: str) -> str:
    """Encrypt a plaintext string and return base64-encoded ciphertext."""
    from cryptography.fernet import Fernet
    f = Fernet(_get_key())
    return f.encrypt(text.encode()).decode()


def decrypt(encrypted_text: str) -> str:
    """Decrypt a base64-encoded ciphertext back to plaintext."""
    from cryptography.fernet import Fernet
    f = Fernet(_get_key())
    return f.decrypt(encrypted_text.encode()).decode()
