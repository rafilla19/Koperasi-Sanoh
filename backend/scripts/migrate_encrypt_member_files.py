"""
One-time migration: encrypt existing plaintext members.ktp_file_path /
members.npwp_file for rows written before this field-level encryption was
introduced.

Safe to re-run: a row is skipped once decrypt_pii(value) no longer matches
the stored value verbatim, i.e. it already decrypts to something else,
meaning it's valid Fernet ciphertext and not plaintext.
"""
import os
import sys

import django

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.db import connection  # noqa: E402
from api.utils.crypto_utils import encrypt_pii, decrypt_pii  # noqa: E402


def _needs_encryption(value):
    if not value:
        return False
    return decrypt_pii(value) == value


def main():
    with connection.cursor() as cursor:
        cursor.execute("SELECT id, ktp_file_path, npwp_file FROM members")
        rows = cursor.fetchall()

    print(f"Found {len(rows)} member row(s) to check.")

    migrated = 0
    with connection.cursor() as cursor:
        for member_id, ktp_file_path, npwp_file in rows:
            ktp_needs = _needs_encryption(ktp_file_path)
            npwp_needs = _needs_encryption(npwp_file)
            if not ktp_needs and not npwp_needs:
                continue

            new_ktp = encrypt_pii(ktp_file_path) if ktp_needs else ktp_file_path
            new_npwp = encrypt_pii(npwp_file) if npwp_needs else npwp_file

            cursor.execute(
                "UPDATE members SET ktp_file_path = %s, npwp_file = %s WHERE id = %s",
                [new_ktp, new_npwp, member_id],
            )
            migrated += 1

    print(f"Migrated {migrated} member row(s).")


if __name__ == '__main__':
    main()
