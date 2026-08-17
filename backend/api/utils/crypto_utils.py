"""
Field-level encryption for PII columns (NIK KTP, NPWP number).

- encrypt_pii / decrypt_pii: reversible AES (Fernet) encryption, used so the
  plaintext value is only ever visible to code that explicitly decrypts it.
- hash_pii: deterministic HMAC-SHA256, used ONLY for exact-match lookups
  (e.g. duplicate-NIK checks, admin search by NIK) since the encrypted value
  is randomized per call and can't be compared or searched directly.

Both keys come from settings (FIELD_ENCRYPTION_KEY / FIELD_HASH_KEY), backed
by env vars — never hardcode or store them in the database.
"""
import hashlib
import hmac

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings

_fernet = None


def _get_fernet():
    global _fernet
    if _fernet is None:
        if not settings.FIELD_ENCRYPTION_KEY:
            raise RuntimeError('FIELD_ENCRYPTION_KEY is not configured.')
        _fernet = Fernet(settings.FIELD_ENCRYPTION_KEY.encode())
    return _fernet


def encrypt_pii(value):
    """Encrypt a plaintext string. Returns None/'' unchanged."""
    if not value:
        return value
    return _get_fernet().encrypt(str(value).encode()).decode()


def decrypt_pii(value):
    """
    Decrypt a value previously produced by encrypt_pii.
    Falls back to returning the input unchanged if it isn't valid ciphertext
    (e.g. legacy plaintext rows that haven't been migrated yet) so reads
    never hard-fail on old data.
    """
    if not value:
        return value
    try:
        return _get_fernet().decrypt(str(value).encode()).decode()
    except (InvalidToken, ValueError, TypeError):
        return value


def hash_pii(value):
    """Deterministic HMAC-SHA256 hex digest, for exact-match search/lookup only."""
    if not value:
        return None
    if not settings.FIELD_HASH_KEY:
        raise RuntimeError('FIELD_HASH_KEY is not configured.')
    return hmac.new(
        settings.FIELD_HASH_KEY.encode(),
        str(value).encode(),
        hashlib.sha256,
    ).hexdigest()

def encrypt_bytes(data):
    """Encrypt raw bytes (e.g. file/document contents). Returns None/b'' unchanged."""
    if not data:
        return data
    return _get_fernet().encrypt(data)


def decrypt_bytes(data):
    """
    Decrypt bytes previously produced by encrypt_bytes.
    Falls back to returning the input unchanged if it isn't valid ciphertext
    (e.g. legacy files uploaded before encryption existed) so reads never
    hard-fail on old data.
    """
    if not data:
        return data
    try:
        return _get_fernet().decrypt(data)
    except (InvalidToken, ValueError, TypeError):
        return data