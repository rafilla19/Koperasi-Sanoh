"""
One-time migration: encrypt existing plaintext members.nik_ktp / members.npwp_number
and backfill members.nik_ktp_hash for rows written before field-level encryption
was introduced.

Safe to re-run: only rows where nik_ktp_hash IS NULL are touched, and this
script sets nik_ktp_hash on every row it migrates, so a second run is a no-op.
"""
import os
import sys

import django

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.db import connection  # noqa: E402
from api.utils.crypto_utils import encrypt_pii, hash_pii  # noqa: E402


def main():
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT id, nik_ktp, npwp_number FROM members WHERE nik_ktp_hash IS NULL"
        )
        rows = cursor.fetchall()

    print(f"Found {len(rows)} member row(s) to migrate.")

    migrated = 0
    with connection.cursor() as cursor:
        for member_id, nik_ktp, npwp_number in rows:
            new_nik_ktp = encrypt_pii(nik_ktp)
            new_nik_hash = hash_pii(nik_ktp)
            new_npwp = encrypt_pii(npwp_number) if npwp_number else npwp_number

            cursor.execute(
                """
                UPDATE members
                SET nik_ktp = %s, nik_ktp_hash = %s, npwp_number = %s
                WHERE id = %s
                """,
                [new_nik_ktp, new_nik_hash, new_npwp, member_id],
            )
            migrated += 1

    print(f"Migrated {migrated} member row(s).")


if __name__ == '__main__':
    main()
