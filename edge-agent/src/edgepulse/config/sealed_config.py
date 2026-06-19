from __future__ import annotations

import base64
import hashlib
import os
from typing import Optional

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend

_FRAGMENT_1 = base64.b64decode("SlcLzCve5k/VdckHsvogNQ==")
_FRAGMENT_2 = base64.b64decode("TdtihKHEaL0=")
_FRAGMENT_3 = base64.b64decode("3+ucE+oIQ+Q=")
_MASK = base64.b64decode("68JidLDdYbc+W5+YgvzfCcnAjOvC2TyuFPNP3iLqnds=")

_seed: Optional[bytes] = None
_url_override: Optional[str] = None


def _derive_key() -> bytes:
    global _seed
    if _seed is None:
        buf = bytearray(32)
        buf[0:16] = _FRAGMENT_1
        buf[16:24] = _FRAGMENT_2
        buf[24:32] = _FRAGMENT_3
        for i in range(32):
            buf[i] ^= _MASK[i]
        _seed = bytes(buf)
    return hashlib.sha256(_seed).digest()


def decrypt(payload: str) -> str:
    key = _derive_key()
    raw = base64.b64decode(payload)
    nonce, tag, ciphertext = raw[:12], raw[-16:], raw[12:-16]
    cipher = Cipher(algorithms.AES(key), modes.GCM(nonce, tag), backend=default_backend())
    decryptor = cipher.decryptor()
    return (decryptor.update(ciphertext) + decryptor.finalize()).decode()


def encrypt(data: str) -> str:
    key = _derive_key()
    nonce = os.urandom(12)
    cipher = Cipher(algorithms.AES(key), modes.GCM(nonce), backend=default_backend())
    encryptor = cipher.encryptor()
    ciphertext = encryptor.update(data.encode()) + encryptor.finalize()
    return base64.b64encode(nonce + ciphertext + encryptor.tag).decode()


def get_supabase_url() -> str:
    if _url_override is not None:
        return _url_override
    try:
        from edgepulse._build_vars import SEALED_CONFIG

        return decrypt(SEALED_CONFIG)
    except (ImportError, AttributeError):
        return ""


def set_supabase_url_override(url: str) -> None:
    global _url_override
    _url_override = url
