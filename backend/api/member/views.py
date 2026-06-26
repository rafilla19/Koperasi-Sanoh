import random
import string
from decimal import Decimal
from datetime import date as date_cls
from html import escape
from io import BytesIO
from urllib.parse import urlparse
from urllib.request import urlopen

from django.conf import settings
from django.core.files.storage import default_storage
from django.core.mail import send_mail
from django.db import connection, transaction, IntegrityError
from django.utils import timezone
from rest_framework import status, viewsets
from .models import EmailOTP
from datetime import timedelta
from rest_framework.decorators import action
from rest_framework.response import Response

from api.member.serializers import (
    MemberClosureRequestSerializer,
    MemberProfileUpdateSerializer,
    RegisterMemberSerializer,
    UploadDocumentSerializer,
    VerificationRequestSerializer,
    VoluntarySavingRequestSerializer,
)
from api.member.models import Member, MemberBankAccount, MemberSavingObligation, User


def _rows_to_dicts(cursor):
    columns = [col[0] for col in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


def _row_to_dict(cursor, row):
    if not row:
        return None
    columns = [col[0] for col in cursor.description]
    return dict(zip(columns, row))


def _try_fetchall(query, params=None):
    try:
        with connection.cursor() as cursor:
            cursor.execute(query, params or [])
            return _rows_to_dicts(cursor)
    except Exception:
        return []


def _try_fetchone(query, params=None):
    try:
        with connection.cursor() as cursor:
            cursor.execute(query, params or [])
            row = cursor.fetchone()
            return _row_to_dict(cursor, row)
    except Exception:
        return None


def _parse_iso_date(value):
    if value in (None, ''):
        return None
    if isinstance(value, date_cls):
        return value
    if isinstance(value, str):
        return date_cls.fromisoformat(value)
    return value


def _int_or_none(value):
    if value in (None, ''):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _absolute_media_url(request, path):
    if not path:
        return None
    if isinstance(path, str) and path.startswith('http'):
        return path
    media_url = request.build_absolute_uri(settings.MEDIA_URL)
    if str(path).startswith('/'):
        path = str(path)[1:]
    return f'{media_url}{path}'


def _save_upload(uploaded_file, prefix):
    filename = uploaded_file.name.replace(' ', '_')
    storage_path = f'{prefix}/{timezone.now():%Y%m%d_%H%M%S}_{filename}'
    saved_path = default_storage.save(storage_path, uploaded_file)
    return saved_path


def _persist_member_document(document, prefix):
    if not document:
        return None

    if hasattr(document, 'read'):
        return _save_upload(document, prefix)

    if isinstance(document, str):
        document = document.strip()
        if not document:
            return None

        if document.startswith('http://') or document.startswith('https://'):
            parsed = urlparse(document)
            source_path = parsed.path.lstrip('/')
            if 'media/' in source_path:
                return source_path.split('media/', 1)[1]
            return document

        if default_storage.exists(document):
            with default_storage.open(document, 'rb') as source_file:
                filename = document.rsplit('/', 1)[-1] or f'{prefix.replace("/", "_")}_{timezone.now():%Y%m%d_%H%M%S}.bin'
                storage_path = f'{prefix}/{timezone.now():%Y%m%d_%H%M%S}_{filename}'
                return default_storage.save(storage_path, source_file)

        return document

    return None


from api.utils.email import build_email_html, send_styled_email


def _member_profile_query(member_id):
    return _try_fetchone(
        """
        SELECT
            m.id,
            m.full_name,
            m.nik_employee,
            m.phone_number,
            m.address,
            m.gender,
            m.join_date,
            m.ktp_file_path,
            m.npwp_file AS npwp_file,
            m.department_id,
            d.department_name,
            m.employee_status_id,
            es.status_name AS employee_status,
            u.email,
            CASE WHEN u.is_active IS TRUE THEN 'ACTIVE' ELSE 'INACTIVE' END AS active_status,
            mb.bank_id,
            b.bank_name,
            mb.account_holder_name,
            mb.account_number,
            m.contract_end,
            COALESCE(sb.mandatory_balance, 0) AS mandatory_balance,
            COALESCE(sb.voluntary_balance, 0) AS voluntary_balance,
            COALESCE(sb.total_saving_balance, 0) AS saving_balance,
            COALESCE(loan.remaining_balance, 0) AS loan_balance,
            COALESCE(loan.remaining_balance, 0) AS current_loan,
            COALESCE(mso_mandatory.monthly_amount, 0) AS mandatory_amount,
            COALESCE(mso_voluntary.monthly_amount, 0) AS voluntary_amount,
            COALESCE(mso_voluntary.monthly_amount, 0) AS monthly_amount,
            COALESCE(monthly_bill.outstanding_amount_due, 0) AS outstanding_monthly_saving_due,
            COALESCE(shu.current_shu, 0) AS accrued_shu,
            COALESCE(shu.current_shu, 0) AS current_shu,
            COALESCE(vsr.requested_amount, 0) AS pending_voluntary_amount,
            COALESCE(vsr.current_amount, 0) AS pending_voluntary_current_amount,
            COALESCE(vsr.status_id, 0) AS voluntary_request_status_id,
            COALESCE(vsr.status, '') AS voluntary_request_status,
            vsr.created_at AS voluntary_request_created_at,
            (SELECT COUNT(*) FROM close_account_requests WHERE member_id = m.id AND status_id = 44 AND deleted_at IS NULL) AS pending_closure_count
        FROM members m
        LEFT JOIN departments d ON d.id = m.department_id
        LEFT JOIN employee_statuses es ON es.id = m.employee_status_id
        LEFT JOIN users u ON u.id = m.user_id
        LEFT JOIN member_bank_accounts mb ON mb.member_id = m.id
        LEFT JOIN banks b ON b.id = mb.bank_id
        LEFT JOIN (
            SELECT
                member_id,
                SUM(CASE WHEN saving_type_id = 1 THEN balance ELSE 0 END) AS mandatory_balance,
                SUM(CASE WHEN saving_type_id = 2 THEN balance ELSE 0 END) AS voluntary_balance,
                SUM(balance) AS total_saving_balance
            FROM saving_wallets
            GROUP BY member_id
        ) sb ON sb.member_id = m.id
        LEFT JOIN (
            SELECT member_id, SUM(remaining_balance) AS remaining_balance
            FROM loans
            WHERE status_id = 25
            GROUP BY member_id
        ) loan ON loan.member_id = m.id
        LEFT JOIN LATERAL (
            SELECT COALESCE(SUM(total_shu), 0) AS current_shu
            FROM shu_member_distributions_monthly
            WHERE distributed_status = false
                AND member_id = m.id
        ) shu ON TRUE
        LEFT JOIN LATERAL (
            SELECT COALESCE(SUM(amount_due), 0) AS outstanding_amount_due
            FROM monthly_saving_bills
            WHERE member_id = m.id
                AND status_id = 38
        ) monthly_bill ON TRUE
        LEFT JOIN LATERAL (
            SELECT monthly_amount
            FROM member_saving_obligations
            WHERE member_id = m.id
                AND saving_type_id = 1
                AND COALESCE(is_active, TRUE) = TRUE
            ORDER BY updated_at DESC NULLS LAST, id DESC
            LIMIT 1
        ) mso_mandatory ON TRUE
        LEFT JOIN LATERAL (
            SELECT monthly_amount
            FROM member_saving_obligations
            WHERE member_id = m.id
                AND saving_type_id = 2
                AND COALESCE(is_active, TRUE) = TRUE
            ORDER BY updated_at DESC NULLS LAST, id DESC
            LIMIT 1
        ) mso_voluntary ON TRUE
        LEFT JOIN LATERAL (
            SELECT
                current_amount,
                requested_amount,
                status_id,
                status,
                created_at,
                updated_at
            FROM voluntary_savings_requests
            WHERE member_id = m.id
                AND status_id = 41
            ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
            LIMIT 1
        ) vsr ON TRUE
        WHERE m.id = %s
        LIMIT 1
        """,
        [member_id],
    )


class MemberViewSet(viewsets.ViewSet):
    def list(self, request):
        return self.members_list(request)

    @action(detail=False, methods=['get'])
    def members_list(self, request):
        rows = _try_fetchall(
            """
            SELECT
                m.id,
                m.full_name,
                m.nik_employee,
                d.department_name,
                m.join_date,
                u.email,
                u.is_active AS user_is_active,
                m.phone_number,
                COALESCE(sw.total_saving, 0) AS total_saving
            FROM members m
            INNER JOIN users u ON u.id = m.user_id
            LEFT JOIN departments d ON d.id = m.department_id
            LEFT JOIN (
                SELECT member_id, SUM(balance) AS total_saving
                FROM saving_wallets
                GROUP BY member_id
            ) sw ON sw.member_id = m.id
            ORDER BY u.is_active DESC, m.full_name ASC
            """
        )
        return Response(rows)

    @action(detail=False, methods=['get'])
    def departments(self, request):
        rows = _try_fetchall("SELECT id, department_name FROM departments WHERE deleted_at IS NULL ORDER BY department_name ASC")
        return Response(rows)

    @action(detail=False, methods=['get'])
    def employee_statuses(self, request):
        rows = _try_fetchall("SELECT id, status_name FROM employee_statuses ORDER BY status_name ASC")
        return Response(rows)

    @action(detail=False, methods=['get'])
    def saving_types_info(self, request):
        """Get saving types information including minimum amounts"""
        rows = _try_fetchall("SELECT id, name, minimum_amount, is_mandatory FROM saving_types WHERE deleted_at IS NULL ORDER BY id ASC")
        return Response(rows)

    @action(detail=False, methods=['get'])
    def banks(self, request):
        rows = _try_fetchall("SELECT id, bank_name, bank_code FROM banks WHERE deleted_at IS NULL ORDER BY bank_name ASC")
        return Response(rows)

    @action(detail=False, methods=['get'])
    def tnc_document(self, request):
        row = _try_fetchone(
                """
                SELECT document_url
                FROM document_archives
                WHERE type_id = %s
                ORDER BY uploaded_at DESC, id DESC
                LIMIT 1
                """,
                [3]
            )
        document_url = None
        if row:
            document_url = row.get('document_url') 

        file_url = None
        if document_url:
            file_url = document_url if str(document_url).startswith('http') else _absolute_media_url(request, document_url)

        return Response({'document_url': file_url})

    @action(detail=False, methods=['get'])
    def footer_contact(self, request):
        # Get support phone from users id=1
        support_phone = _try_fetchone("SELECT number_phone FROM users WHERE id = %s", [1])
        phone = support_phone.get('number_phone') if support_phone else ''
        
        contact = {
            'email': getattr(settings, 'DEFAULT_FROM_EMAIL', '') or getattr(settings, 'ADMIN_EMAIL', '') or '',
            'phone_number': phone or '',
            'address': 'JL. INTI II, BLOK C-4, NO-10, KAWASAN INDUSTRI HYUNDAI CIKARANG RT. 000 RW.000, SUKARESMI, CIKARANG SELATAN, KAB.BEKASI, JAWA BARAT',
        }

        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT u.email, u.number_phone FROM users u WHERE u.id = %s",
                    [1],
                )
                row = cursor.fetchone()
                if row:
                    email, phone_number = row
                    if email:
                        contact['email'] = email
                    if phone_number:
                        contact['phone_number'] = phone_number

                if not contact['phone_number']:
                    cursor.execute(
                    """
                    SELECT u.email, m.phone_number
                    FROM users u
                    INNER JOIN roles r ON r.id = u.role_id
                    LEFT JOIN members m ON m.user_id = u.id
                    WHERE u.is_active = true AND LOWER(r.role_name) LIKE %s
                    ORDER BY u.id ASC
                    LIMIT 1
                    """,
                    ['%admin%'],
                )
                    row = cursor.fetchone()
                    if row:
                        email, phone_number = row
                        if email:
                            contact['email'] = email
                        if phone_number:
                            contact['phone_number'] = phone_number

                if not contact['phone_number']:
                    cursor.execute(
                        """
                        SELECT phone_number
                        FROM members
                        WHERE phone_number IS NOT NULL AND phone_number <> ''
                        ORDER BY id ASC
                        LIMIT 1
                        """
                    )
                    phone_row = cursor.fetchone()
                    if phone_row and phone_row[0]:
                        contact['phone_number'] = phone_row[0]
        except Exception:
            pass

        contact['phone'] = contact['phone_number']
        return Response(contact)

    @action(detail=False, methods=['post'])
    def upload_temp_document(self, request):
        serializer = UploadDocumentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        uploaded_file = serializer.validated_data['file']
        doc_type = serializer.validated_data['type']
        target_prefix = 'members/ktp' if doc_type == 'ktp' else 'members/npwp'
        saved_path = _save_upload(uploaded_file, target_prefix)
        return Response({'file_path': _absolute_media_url(request, saved_path)})

    @action(detail=False, methods=['post'])
    def upload_transfer_file(self, request):
        uploaded_file = request.FILES.get('file')
        if not uploaded_file:
            return Response({'error': 'file is required'}, status=status.HTTP_400_BAD_REQUEST)
        saved_path = _save_upload(uploaded_file, 'transfer')
        return Response({'file_path': _absolute_media_url(request, saved_path)})

    @action(detail=False, methods=['post'])
    def send_verification_email(self, request):
        serializer = VerificationRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email']
        full_name = serializer.validated_data.get('fullName', '')
        code = ''.join(random.choices(string.digits, k=6))

        # Store OTP in database and keep timestamp for expiry checks
        EmailOTP.objects.update_or_create(
            email=email,
            defaults={
                'code': code,
                'is_verified': False,
                'created_at': timezone.now(),
            },
        )

        subject = 'Kode Verifikasi Anda'
        message = f'Halo {full_name or email}, kode verifikasi Anda adalah {code}.'
        try:
            send_styled_email(
                subject,
                email,
                f'Halo {full_name or email}, kode verifikasi Anda sudah siap.',
                details=[('Kode Verifikasi', code)],
                highlight=('Verifikasi Email', 'Selesaikan langkah verifikasi untuk melanjutkan pendaftaran'),
                footer_note='Jika Anda tidak meminta kode ini, Anda dapat mengabaikan pesan ini.',
                plain_fallback=message,
            )
        except Exception:
            pass

        payload = {'status': 'success'}
        if settings.DEBUG:
            payload['code'] = code
        return Response(payload)

    @action(detail=False, methods=['post'])
    def verify_code(self, request):
        serializer = VerificationRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email']
        code = serializer.validated_data['code']
        expiry_threshold = timezone.now() - timedelta(minutes=10)
        email_otp = EmailOTP.objects.filter(email=email, code=code, created_at__gte=expiry_threshold).first()
        if not email_otp:
            return Response({'message': 'Invalid or expired verification code'}, status=status.HTTP_400_BAD_REQUEST)
        # Invalidate OTP after successful verification
        email_otp.delete()
        return Response({'status': 'success'})

    @action(detail=False, methods=['post'])
    def register_member(self, request):
        serializer = RegisterMemberSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            with transaction.atomic():
                ktp_document = request.FILES.get('ktp_file_path') or request.FILES.get('ktp_file') or data.get('ktpPath') or data.get('ktp_file_path')
                npwp_document = request.FILES.get('npwp_file') or request.FILES.get('npwpFile') or data.get('npwpPath') or data.get('npwp_file')
                ktp_storage_path = _persist_member_document(ktp_document, 'members/ktp') or ''
                npwp_storage_path = _persist_member_document(npwp_document, 'members/npwp') or data.get('noNpwp') or ''

                contract_end_date = _parse_iso_date(data.get('contractEndDate'))
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        CALL sp_regist_new_member(
                            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                        )
                        """,
                        [
                            data.get('nik'),
                            data.get('fullName'),
                            data.get('nikEmployee'),
                            data.get('noNpwp'),
                            data.get('placeOfBirth'),
                            data.get('dateOfBirth'),
                            data.get('gender'),
                            data.get('address'),
                            data.get('phoneNumber'),
                            data.get('email'),
                            int(data.get('employeeStatusId')),
                            npwp_storage_path,
                            ktp_storage_path,
                            int(data.get('departmentId')),
                            Decimal(str(data.get('voluntarySaving') or 0)),
                            bool(data.get('payrollAgreement', False)),
                            bool(data.get('tncAgreement', False)),
                            contract_end_date,
                            data.get('password'),
                        ],
                    )

            member_email = data.get('email')
            member_name = data.get('fullName') or member_email or 'Member'
            employee_status_name = None
            department_name = None
            if data.get('employeeStatusId') is not None:
                status_row = _try_fetchone(
                    'SELECT status_name FROM employee_statuses WHERE id = %s',
                    [int(data.get('employeeStatusId'))],
                )
                employee_status_name = status_row.get('status_name') if status_row else None
            if data.get('departmentId') is not None:
                dept_row = _try_fetchone(
                    'SELECT department_name FROM departments WHERE id = %s',
                    [int(data.get('departmentId'))],
                )
                department_name = dept_row.get('department_name') if dept_row else None

            admin_email = getattr(settings, 'ADMIN_EMAIL', None) or getattr(settings, 'DEFAULT_FROM_EMAIL', None)

            if member_email:
                try:
                    send_styled_email(
                        'Permintaan Pendaftaran Diterima',
                        member_email,
                        'Permintaan pendaftaran Anda telah diterima dan sedang menunggu persetujuan admin.',
                        details=[
                            ('Nama Anggota', member_name),
                            ('NIK Karyawan', data.get('nikEmployee') or '-'),
                            ('Status Karyawan', employee_status_name or data.get('employeeStatusId') or '-'),
                            ('Departemen', department_name or data.get('departmentId') or '-'),
                        ],
                        highlight=('Langkah Selanjutnya', 'Admin akan meninjau pendaftaran Anda dan mengirimkan pemberitahuan persetujuan atau penolakan.'),
                        footer_note='Anda tidak perlu melakukan tindakan apapun hingga menerima email selanjutnya.',
                        plain_fallback='Permintaan pendaftaran Anda telah diterima dan sedang menunggu persetujuan admin.',
                    )
                except Exception:
                    pass

            if admin_email:
                try:
                    send_styled_email(
                        'Permintaan Pendaftaran Anggota Baru',
                        admin_email,
                        'Permintaan pendaftaran anggota baru telah diajukan dan siap untuk ditinjau.',
                        details=[
                            ('Nama', member_name),
                            ('Email', member_email or '-'),
                            ('NIK Karyawan', data.get('nikEmployee') or '-'),
                            ('Status Karyawan', employee_status_name or data.get('employeeStatusId') or '-'),
                            ('Departemen', department_name or data.get('departmentId') or '-'),
                        ],
                        highlight=('Tindakan Diperlukan', 'Silakan tinjau permintaan di dashboard admin.'),
                        footer_note='Notifikasi ini dibuat secara otomatis dari alur pendaftaran.',
                        plain_fallback='Permintaan pendaftaran anggota baru telah diajukan.',
                    )
                except Exception:
                    pass

            return Response({'status': 'success'})
        except IntegrityError as exc:
            msg = str(exc)
            if 'email' in msg.lower():
                return Response({'error': 'Email ini sudah terdaftar. Silakan gunakan email lain atau login dengan akun yang sudah ada.'}, status=status.HTTP_409_CONFLICT)
            if 'nik' in msg.lower():
                return Response({'error': 'NIK ini sudah terdaftar dalam sistem.'}, status=status.HTTP_409_CONFLICT)
            return Response({'error': 'Data yang Anda masukkan sudah terdaftar dalam sistem.'}, status=status.HTTP_409_CONFLICT)
        except Exception as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'])
    def request_account_closure(self, request):
        serializer = MemberClosureRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        member_id = data['member_id']
        reason = data.get('reason', '')

        try:
            member_row = _try_fetchone(
                """
                SELECT m.full_name, m.nik_employee, u.email
                FROM members m
                LEFT JOIN users u ON u.id = m.user_id
                WHERE m.id = %s
                LIMIT 1
                """,
                [member_id],
            )

            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT table_name
                    FROM information_schema.tables
                    WHERE table_schema = 'public'
                      AND table_name IN ('close_account_requests', 'member_close_requests', 'close_accounts')
                    ORDER BY CASE table_name
                        WHEN 'close_account_requests' THEN 1
                        WHEN 'member_close_requests' THEN 2
                        ELSE 3
                    END
                    LIMIT 1
                    """
                )
                row = cursor.fetchone()
                table_name = row[0] if row else None

                if table_name == 'close_account_requests':
                    cursor.execute(
                        "INSERT INTO close_account_requests (member_id, reason, status_id, request_date) VALUES (%s, %s, 44, NOW())",
                        [member_id, reason],
                    )
                elif table_name == 'member_close_requests':
                    cursor.execute(
                        "INSERT INTO member_close_requests (member_id, reason, status_id, request_date) VALUES (%s, %s, 44, NOW())",
                        [member_id, reason],
                    )
                elif table_name == 'close_accounts':
                    cursor.execute(
                        "INSERT INTO close_accounts (member_id, reason, status_id, request_date) VALUES (%s, %s, 44, NOW())",
                        [member_id, reason],
                    )

            admin_email = getattr(settings, 'ADMIN_EMAIL', None) or getattr(settings, 'DEFAULT_FROM_EMAIL', None)
            if admin_email:
                try:
                    send_styled_email(
                        'Permintaan Penutupan Akun Diajukan',
                        admin_email,
                        'Permintaan penutupan akun telah diajukan dan perlu ditinjau.',
                        details=[
                            ('Nama', member_row.get('full_name') if member_row else member_id),
                            ('NIK', member_row.get('nik_employee') if member_row else '-'),
                            ('Email Anggota', member_row.get('email') if member_row else '-'),
                            ('Alasan', reason or '-'),
                        ],
                        highlight=('Tindakan Diperlukan', 'Silakan tinjau permintaan di dashboard admin.'),
                        footer_note='Permintaan ini dibuat melalui alur penutupan akun anggota.',
                        plain_fallback='Permintaan penutupan akun telah diajukan.',
                    )
                except Exception:
                    pass
            return Response({'status': 'success'})
        except Exception as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'])
    def request_voluntary_saving(self, request):
        serializer = VoluntarySavingRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        member_id = data['member_id']
        requested_amount = data['requested_amount']

        with connection.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) FROM close_account_requests WHERE member_id = %s AND status_id = 44 AND deleted_at IS NULL", [member_id])
            if cursor.fetchone()[0] > 0:
                return Response({'error': 'Akun Anda sedang dalam proses penutupan. Perubahan simpanan tidak dapat dilakukan.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT COALESCE(monthly_amount, 0)
                    FROM member_saving_obligations
                    WHERE member_id = %s
                      AND saving_type_id = 2
                      AND COALESCE(is_active, TRUE) = TRUE
                    ORDER BY updated_at DESC NULLS LAST, id DESC
                    LIMIT 1
                    """,
                    [member_id],
                )
                current_row = cursor.fetchone()
                current_amount = current_row[0] if current_row else Decimal('0')

                cursor.execute(
                    """
                    SELECT id
                    FROM voluntary_savings_requests
                    WHERE member_id = %s AND status_id = 41
                    ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
                    LIMIT 1
                    """,
                    [member_id],
                )
                pending_row = cursor.fetchone()
                if pending_row:
                    cursor.execute(
                        """
                        UPDATE voluntary_savings_requests
                        SET current_amount = %s,
                            requested_amount = %s,
                            status = 'PENDING',
                            status_id = 41,
                            updated_at = NOW()
                        WHERE id = %s
                        """,
                        [current_amount, requested_amount, pending_row[0]],
                    )
                    request_id = pending_row[0]
                else:
                    cursor.execute(
                        """
                        INSERT INTO voluntary_savings_requests (
                            current_amount,
                            requested_amount,
                            status,
                            created_at,
                            updated_at,
                            member_id,
                            status_id
                        )
                        VALUES (%s, %s, 'PENDING', NOW(), NOW(), %s, 41)
                        RETURNING id
                        """,
                        [current_amount, requested_amount, member_id],
                    )
                    row = cursor.fetchone()
                    request_id = row[0] if row else None

                member_row = _try_fetchone(
                    """
                    SELECT m.full_name, m.nik_employee, u.email
                    FROM members m
                    LEFT JOIN users u ON u.id = m.user_id
                    WHERE m.id = %s
                    LIMIT 1
                    """,
                    [member_id],
                )

                admin_email = getattr(settings, 'ADMIN_EMAIL', None) or getattr(settings, 'DEFAULT_FROM_EMAIL', None)
                if admin_email:
                    subject = 'Permintaan Perubahan Simpanan Sukarela Menunggu Persetujuan'
                    try:
                        send_styled_email(
                            subject,
                            admin_email,
                            'Permintaan perubahan simpanan sukarela sedang menunggu persetujuan admin.',
                            details=[
                                ('Anggota', member_row.get('full_name') if member_row else member_id),
                                ('NIK', member_row.get('nik_employee') if member_row else '-'),
                                ('Email Anggota', member_row.get('email') if member_row else '-'),
                                ('Jumlah Saat Ini', current_amount),
                                ('Jumlah Diminta', requested_amount),
                            ],
                            highlight=('Tindakan Diperlukan', 'Silakan tinjau dan setujui atau tolak permintaan di dashboard admin.'),
                            footer_note='Ini adalah notifikasi otomatis dari alur permintaan simpanan sukarela.',
                            plain_fallback='Permintaan perubahan simpanan sukarela telah diajukan.',
                        )
                    except Exception:
                        pass
            return Response({
                'status': 'success',
                'current_amount': str(current_amount),
                'pending_amount': str(requested_amount),
                'status_id': 41,
            })
        except Exception as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'])
    def update_profile(self, request):
        serializer = MemberProfileUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        member_id = data.get('member_id')
        if not member_id and getattr(request.user, 'is_authenticated', False) and hasattr(request.user, 'member'):
            member_id = request.user.member.id
        if not member_id:
            return Response({'error': 'member_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            with transaction.atomic():
                member = Member.objects.get(id=member_id)
                if data.get('phone'):
                    member.phone_number = data['phone']
                    member.save(update_fields=['phone_number'])

                if data.get('email'):
                    User.objects.filter(id=member.user_id).update(email=data['email'])

                bank_payload = {}
                if 'bank_id' in data:
                    bank_payload['bank_id'] = data.get('bank_id')
                if 'acc_name' in data:
                    bank_payload['account_holder_name'] = data.get('acc_name') or ''
                if 'acc_no' in data:
                    bank_payload['account_number'] = data.get('acc_no') or ''

                if bank_payload:
                    MemberBankAccount.objects.update_or_create(
                        member_id=member_id,
                        defaults=bank_payload,
                    )
            return Response({'status': 'success'})
        except Exception as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['get'])
    def member_full_detail(self, request, pk=None):
        result = _member_profile_query(pk)
        if not result:
            return Response({'error': 'Member not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(result)

    @action(detail=True, methods=['put'])
    def update_member_profile(self, request, pk=None):
        data = request.data
        try:
            with transaction.atomic():
                member = Member.objects.get(id=pk)
                member_updates = []

                if data.get('full_name') is not None:
                    member.full_name = data['full_name']
                    member_updates.append('full_name')
                if data.get('nik_employee') is not None:
                    member.nik_employee = data['nik_employee']
                    member_updates.append('nik_employee')
                if data.get('phone_number') is not None:
                    member.phone_number = data['phone_number']
                    member_updates.append('phone_number')
                if data.get('address') is not None:
                    member.address = data['address']
                    member_updates.append('address')
                if data.get('gender') is not None:
                    member.gender = data['gender']
                    member_updates.append('gender')
                if data.get('department_id') is not None:
                    member.department_id = data['department_id']
                    member_updates.append('department_id')
                if data.get('employee_status_id') is not None:
                    member.employee_status_id = _int_or_none(data.get('employee_status_id'))
                    member_updates.append('employee_status_id')

                contract_end_value = None
                new_status = _int_or_none(data.get('employee_status_id')) if data.get('employee_status_id') is not None else member.employee_status_id
                if 'contract_end' in data:
                    if new_status == 2 and data.get('contract_end') not in (None, ''):
                        contract_end_value = _parse_iso_date(data.get('contract_end'))
                    else:
                        contract_end_value = None
                elif data.get('employee_status_id') is not None:
                    if _int_or_none(data.get('employee_status_id')) == 2:
                        contract_end_value = member.contract_end
                    else:
                        contract_end_value = None

                if 'contract_end' in data or data.get('employee_status_id') is not None:
                    member.contract_end = contract_end_value
                    member_updates.append('contract_end')

                if member_updates:
                    member.save(update_fields=member_updates)

                if data.get('email'):
                    User.objects.filter(id=member.user_id).update(email=data['email'])

                bank_payload = {}
                if 'account_number' in data:
                    bank_payload['account_number'] = data.get('account_number') or ''
                if 'account_holder_name' in data:
                    bank_payload['account_holder_name'] = data.get('account_holder_name') or ''
                if 'bank_id' in data:
                    bank_payload['bank_id'] = data.get('bank_id')

                if bank_payload:
                    MemberBankAccount.objects.update_or_create(
                        member_id=pk,
                        defaults=bank_payload,
                    )

                if 'contract_end' in data or data.get('employee_status_id') is not None:
                    MemberSavingObligation.objects.filter(
                        member_id=pk,
                        saving_type_id__in=[1, 2, 3],
                    ).update(effective_until=contract_end_value)

                ktp_document = request.FILES.get('ktp_file_path') or request.FILES.get('ktp_file') or data.get('ktp_file_path')
                if ktp_document is not None:
                    ktp_path = _persist_member_document(ktp_document, 'members/ktp')
                    Member.objects.filter(id=pk).update(ktp_file_path=ktp_path)

                npwp_document = request.FILES.get('npwp_file') or request.FILES.get('npwpFile') or data.get('npwp_file')
                if npwp_document is not None:
                    npwp_path = _persist_member_document(npwp_document, 'members/npwp')
                    Member.objects.filter(id=pk).update(npwp_file=npwp_path)
                if data.get('account_number') or data.get('account_holder_name') or data.get('bank_id'):
                    with connection.cursor() as cursor:
                        cursor.execute("SELECT id FROM member_bank_accounts WHERE member_id = %s LIMIT 1", [pk])
                        row = cursor.fetchone()
                        if row:
                            updates = []
                            params = []
                            if data.get('account_number') is not None:
                                updates.append('account_number = %s')
                                params.append(data['account_number'])
                            if data.get('account_holder_name') is not None:
                                updates.append('account_holder_name = %s')
                                params.append(data['account_holder_name'])
                            if data.get('bank_id') is not None:
                                updates.append('bank_id = %s')
                                params.append(data['bank_id'])
                            if updates:
                                params.append(pk)
                                cursor.execute(
                                    f"UPDATE member_bank_accounts SET {', '.join(updates)} WHERE member_id = %s",
                                    params,
                                )
                        else:
                            cursor.execute(
                                """
                                INSERT INTO member_bank_accounts (member_id, bank_id, account_holder_name, account_number)
                                VALUES (%s, %s, %s, %s)
                                """,
                                [pk, data.get('bank_id'), data.get('account_holder_name', ''), data.get('account_number', '')],
                            )
            updated = _member_profile_query(pk)
            return Response(updated or {'status': 'success'})
        except Exception as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'])
    def create_payment_token(self, request):
        """Create Midtrans payment token for principal saving payment and record transaction"""
        import requests as http_requests
        import base64
        import json

        try:
            member_id = request.data.get('member_id')
            payment_method = request.data.get('payment_method')

            if not member_id:
                return Response(
                    {'error': 'member_id is required'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Check for existing paid principal saving (prevent duplicate payment)
            already_paid = _try_fetchone(
                """
                SELECT id FROM saving_transactions
                WHERE member_id = %s AND saving_type_id = 3 AND transaction_type_id = 1
                  AND status_id NOT IN (32)
                LIMIT 1
                """,
                [member_id]
            )
            if already_paid:
                return Response(
                    {'error': 'Simpanan pokok sudah pernah dibayar. Silakan login untuk mengakses akun Anda.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Check for existing pending gateway transaction (prevent double-click)
            pending_tx = _try_fetchone(
                """
                SELECT pgt.id, pgt.gateway_transaction_id
                FROM payment_gateway_transactions pgt
                WHERE pgt.gateway_transaction_id LIKE %s
                  AND pgt.gateway_status = 'pending'
                  AND pgt.created_at > NOW() - INTERVAL '15 minutes'
                ORDER BY pgt.created_at DESC
                LIMIT 1
                """,
                [f'KOP-PRINCIPAL-{member_id}-%']
            )
            if pending_tx:
                return Response(
                    {'error': 'Anda memiliki transaksi pembayaran yang masih diproses. Silakan selesaikan pembayaran tersebut atau tunggu hingga expired.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Fetch principal obligation amount
            obligation = _try_fetchone(
                """
                SELECT mso.monthly_amount
                FROM member_saving_obligations mso
                WHERE mso.member_id = %s AND mso.is_active = TRUE AND mso.saving_type_id = 3
                ORDER BY mso.updated_at DESC NULLS LAST, mso.id DESC
                LIMIT 1
                """,
                [member_id]
            )
            if not obligation or not obligation.get('monthly_amount'):
                return Response(
                    {'error': 'No principal saving obligation found for this member'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            amount = int(obligation['monthly_amount'])

            # Validate Midtrans configuration
            server_key = settings.MIDTRANS_SERVER_KEY
            is_production = settings.MIDTRANS_IS_PRODUCTION

            if not server_key:
                return Response(
                    {'error': 'Midtrans configuration not found'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            fee_percentage = 0.0
            fee_fixed = 0.0
            channel_name = ''

            if payment_method:
                channel_row = _try_fetchone(
                    """
                    SELECT channel_name, fee_percentage, fee_fixed
                    FROM payment_channels
                    WHERE channel_code = %s AND is_active = TRUE
                    LIMIT 1
                    """,
                    [payment_method]
                )
                if not channel_row:
                    return Response(
                        {'error': 'Selected payment channel is not available'},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                channel_name = channel_row.get('channel_name', '') or ''
                fee_percentage = float(channel_row.get('fee_percentage') or 0)
                fee_fixed = float(channel_row.get('fee_fixed') or 0)

            admin_fee = int((amount * fee_percentage) / 100) + int(fee_fixed)
            gross_amount = amount + admin_fee

            # Fetch member info
            member_row = _try_fetchone(
                """
                SELECT m.full_name, u.email
                FROM members m
                INNER JOIN users u ON u.id = m.user_id
                WHERE m.id = %s
                """,
                [member_id]
            )
            first_name = member_row.get('full_name', 'Member') if member_row else 'Member'
            email = member_row.get('email', '') if member_row else ''

            # Generate order ID
            order_id = f"KOP-PRINCIPAL-{member_id}-{int(timezone.now().timestamp())}"

            # Build Snap API request
            auth_str = f"{server_key}:"
            auth_base64 = base64.b64encode(auth_str.encode('utf-8')).decode('utf-8')
            headers = {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Authorization": f"Basic {auth_base64}"
            }

            item_details = [
                {
                    'id': 'principal_saving',
                    'price': amount,
                    'quantity': 1,
                    'name': 'Simpanan Pokok (Principal Savings)',
                }
            ]

            if admin_fee > 0:
                fee_label = f"Biaya Layanan ({fee_percentage}%)" if fee_percentage > 0 else 'Biaya Layanan'
                item_details.append(
                    {
                        'id': 'payment_fee',
                        'price': admin_fee,
                        'quantity': 1,
                        'name': fee_label,
                    }
                )

            payload = {
                'transaction_details': {
                    'order_id': order_id,
                    'gross_amount': gross_amount,
                },
                'customer_details': {
                    'first_name': first_name,
                    'email': email,
                },
                'item_details': item_details,
                'callbacks': {
                    'finish': f"{settings.FRONTEND_BASE_URL.rstrip('/')}/register/payment-success",
                    'error': f"{settings.FRONTEND_BASE_URL.rstrip('/')}/register/under-review",
                    'pending': f"{settings.FRONTEND_BASE_URL.rstrip('/')}/register/under-review",
                },
            }

            # Add payment method filter if specified
            if payment_method:
                payload['enabled_payments'] = [payment_method]

            url = "https://app.midtrans.com/snap/v1/transactions" if is_production else "https://app.sandbox.midtrans.com/snap/v1/transactions"

            response = http_requests.post(url, json=payload, headers=headers)
            res_data = response.json()

            if response.status_code != 201:
                error_msg = res_data.get('error_messages', ['Failed to create Midtrans transaction'])[0]
                return Response({'error': error_msg}, status=status.HTTP_400_BAD_REQUEST)

            snap_token = res_data['token']
            redirect_url = res_data.get('redirect_url', '')
            raw_data = json.dumps({"snap_token": snap_token})

            # Create payment_gateway_transaction + saving_transaction records
            with connection.cursor() as cursor:
                # Insert payment gateway transaction
                cursor.execute("""
                    INSERT INTO payment_gateway_transactions (
                        payable_type_id,
                        gateway_provider,
                        gateway_transaction_id,
                        gateway_status,
                        callback_raw_data,
                        created_at,
                        updated_at
                    ) VALUES (%s, %s, %s, %s, %s, NOW(), NOW()) RETURNING id
                """, [2, 'MIDTRANS', order_id, 'pending', raw_data])
                pgt_id = cursor.fetchone()[0]

                # Generate reference code: RE-YYYYMMDD-XXXXX
                cursor.execute("""
                    SELECT 'RE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
                           LPAD(NEXTVAL('saving_payment_ref_seq')::TEXT, 5, '0')
                """)
                ref_code = cursor.fetchone()[0]

                # Find unpaid monthly_saving_bill for principal (saving_type_id=3)
                cursor.execute("""
                    SELECT id FROM monthly_saving_bills
                    WHERE member_id = %s AND saving_type_id = 3 AND status_id = 38
                    ORDER BY bill_period_start ASC LIMIT 1
                """, [member_id])
                bill_row = cursor.fetchone()
                bill_id = bill_row[0] if bill_row else None

                # Insert saving_transaction with status 32 (pending gateway)
                cursor.execute("""
                    INSERT INTO saving_transactions (
                        member_id,
                        saving_type_id,
                        transaction_type_id,
                        payment_method_id,
                        amount,
                        status_id,
                        payment_reference_id,
                        monthly_saving_bill_id,
                        transaction_date,
                        created_at,
                        updated_at
                    ) VALUES (%s, 3, 1, 1, %s, 32, %s, %s, NOW(), NOW(), NOW())
                """, [member_id, amount, str(pgt_id), bill_id])

            return Response({
                'snap_token': snap_token,
                'redirect_url': redirect_url,
                'order_id': order_id,
                'amount': gross_amount,
                'principal_amount': amount,
                'admin_fee': admin_fee,
                'payment_channel': channel_name,
                'reference_code': ref_code,
            })

        except Exception as e:
            print(f"Payment token creation error: {str(e)}")
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['get'])
    def principal_payment_status(self, request, pk=None):
        """Check if member already paid principal saving."""
        paid = _try_fetchone(
            """
            SELECT id FROM saving_transactions
            WHERE member_id = %s AND saving_type_id = 3 AND transaction_type_id = 1
              AND status_id NOT IN (32)
            LIMIT 1
            """,
            [pk]
        )
        pending = _try_fetchone(
            """
            SELECT id FROM payment_gateway_transactions
            WHERE gateway_transaction_id LIKE %s
              AND gateway_status = 'pending'
              AND created_at > NOW() - INTERVAL '15 minutes'
            LIMIT 1
            """,
            [f'KOP-PRINCIPAL-{pk}-%']
        )
        return Response({
            'already_paid': paid is not None,
            'has_pending': pending is not None,
        })

    @action(detail=False, methods=['get'])
    def principal_savings_obligation(self, request):
        """Get member's principal savings obligation amount"""
        try:
            member_id = request.query_params.get('member_id') or (request.user.id if request.user.is_authenticated else None)
            if not member_id:
                return Response(
                    {'error': 'member_id query param is required'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Get monthly amount for principal savings (saving_type_id = 3)
            row = _try_fetchone(
                """
                SELECT monthly_amount FROM member_saving_obligations 
                WHERE member_id = %s AND is_active = TRUE AND saving_type_id = 3
                ORDER BY updated_at DESC NULLS LAST, id DESC
                LIMIT 1
                """,
                [member_id]
            )
            
            if row:
                return Response({
                    'member_id': member_id,
                    'monthly_amount': row.get('monthly_amount'),
                    'saving_type_id': 3,
                    'saving_type_name': 'Principal Savings',
                })
            else:
                # Return default if no obligation found
                return Response({
                    'member_id': member_id,
                    'monthly_amount': None,
                    'saving_type_id': 3,
                    'saving_type_name': 'Principal Savings',
                })
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['get'])
    def profile_detail(self, request):
        member_id = request.query_params.get('member_id')
        if not member_id:
            return Response({'error': 'member_id query param is required'}, status=status.HTTP_400_BAD_REQUEST)
        result = _member_profile_query(member_id)
        if not result:
            return Response({'error': 'Member not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(result)

    @action(detail=False, methods=['get'])
    def pending_registrations(self, request):
        rows = _try_fetchall(
            """
            SELECT
                r.id,
                r.nik,
                r.employee_nik,
                r.full_name,
                r.phone_number,
                r.email,
                r.department_id,
                d.department_name,
                r.employee_status_id,
                es.status_name AS employee_status,
                r.place_of_birth,
                r.date_of_birth,
                r.gender,
                r.address,
                r.npwp_number,
                r.npwp_file,
                r.ktp_file,
                r.contract_end,
                r.voluntary_saving,
                r.payroll_agreement,
                r.agreement_checked,
                r.email_verified,
                r.created_at,
                r.updated_at,
                r.status_id,
                s.status_code AS status,
                s.status_name AS status_name,
                r.notes
            FROM registrations r
            LEFT JOIN departments d ON d.id = r.department_id
            LEFT JOIN employee_statuses es ON es.id = r.employee_status_id
            LEFT JOIN statuses s ON s.id = r.status_id
            WHERE r.deleted_at IS NULL
            ORDER BY r.created_at DESC
            """
        )
        return Response(rows)

    @action(detail=False, methods=['get'])
    def pending_close_accounts(self, request):
        rows = _try_fetchall(
            """
            SELECT
                cr.id,
                m.full_name,
                m.nik_employee,
                m.nik_ktp,
                m.phone_number,
                u.email,
                m.address,
                cr.reason,
                cr.request_date,
                cr.status_id,
                s.status_code AS status,
                COALESCE(mandatory.mandatory_balance, 0) AS mandatory_saving_balance,
                COALESCE(voluntary.voluntary_balance, 0) AS voluntary_saving_balance,
                COALESCE(shu.current_shu, 0) AS accrued_shu_amount,
                COALESCE(monthly_bill.outstanding_amount_due, 0) AS outstanding_monthly_saving_due,
                COALESCE(loan.remaining_balance, 0) AS outstanding_loan_balance,
                COALESCE(mandatory.mandatory_balance, 0) + COALESCE(voluntary.voluntary_balance, 0) + COALESCE(shu.current_shu, 0) - COALESCE(loan.remaining_balance, 0) - COALESCE(monthly_bill.outstanding_amount_due, 0) AS total_amount_to_receive,
                cr.transfer_file AS transfer_file_path,
                cr.transfer_file,
                cr.admin_reason,
                cr.reject_reason,
                cr.admin_id,
                cr.approved_at
            FROM close_account_requests cr
            INNER JOIN members m ON m.id = cr.member_id
            LEFT JOIN users u ON u.id = m.user_id
            LEFT JOIN statuses s ON s.id = cr.status_id
            LEFT JOIN (
                SELECT member_id, SUM(CASE WHEN saving_type_id = 1 THEN balance ELSE 0 END) AS mandatory_balance
                FROM saving_wallets
                GROUP BY member_id
            ) mandatory ON mandatory.member_id = m.id
            LEFT JOIN (
                SELECT member_id, SUM(CASE WHEN saving_type_id = 2 THEN balance ELSE 0 END) AS voluntary_balance
                FROM saving_wallets
                GROUP BY member_id
            ) voluntary ON voluntary.member_id = m.id
            LEFT JOIN (
                SELECT member_id, SUM(remaining_balance) AS remaining_balance
                FROM loans
                WHERE status_id = 25
                GROUP BY member_id
            ) loan ON loan.member_id = m.id
            LEFT JOIN LATERAL (
                SELECT COALESCE(SUM(total_shu), 0) AS current_shu
                FROM shu_member_distributions_monthly
                WHERE distributed_status = false
                    AND member_id = m.id
            ) shu ON TRUE
            LEFT JOIN LATERAL (
                SELECT COALESCE(SUM(amount_due), 0) AS outstanding_amount_due
                FROM monthly_saving_bills
                WHERE member_id = m.id
                    AND status_id = 38
            ) monthly_bill ON TRUE
            WHERE cr.deleted_at IS NULL
            ORDER BY cr.request_date DESC
            """
        )
        return Response(rows)

    @action(detail=True, methods=['post'])
    def approve_registration(self, request, pk=None):
        comment = (request.data.get('comment') or '').strip()
        # Require comment when approving registration
        if not comment:
            return Response({'error': 'Silakan masukkan komentar persetujuan.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            registration_row = _try_fetchone(
                """
                SELECT full_name, email, employee_nik AS nik_employee, employee_status_id, status_id, id
                FROM registrations
                WHERE id = %s
                LIMIT 1
                """,
                [pk],
            )
            with connection.cursor() as cursor:
                cursor.execute('CALL sp_approve_request_regist(%s, %s)', [pk, comment])

            if registration_row and registration_row.get('email'):
                employee_status_id = int(registration_row.get('employee_status_id') or 0)
                status_id = int(registration_row.get('status_id') or 0)
                registration_id = registration_row.get('id')
                
                # Get minimum amount for principal saving
                saving_types_row = _try_fetchone(
                    'SELECT minimum_amount FROM saving_types WHERE id = %s',
                    [3],  # id=3 is PRINCIPLE
                )
                min_amount = saving_types_row.get('minimum_amount') if saving_types_row else 100000
                
                # Determine link based on status_id OR employee_status (employees 1 & 2 get direct access)
                if status_id == 7 or employee_status_id in (1, 2):
                    # Direct login access for approved registrations and employee types 1 or 2
                    subject = 'Pendaftaran Disetujui - Anda Dapat Menggunakan Aplikasi'
                    intro = 'Pendaftaran keanggotaan Anda telah disetujui dan akun Anda siap digunakan.'
                    login_link = f"{settings.FRONTEND_BASE_URL.rstrip('/')}/login"
                    cta_label = 'Login ke Akun Anda'
                    cta_url = login_link
                    details = [
                        ('Nama Anggota', registration_row.get('full_name') or registration_row.get('email')),
                        ('NIK Karyawan', registration_row.get('nik_employee') or '-'),
                        ('Status', 'Disetujui - Akses Langsung'),
                    ]
                else:
                    # Registrations that still require principal saving payment
                    subject = 'Pendaftaran Disetujui - Pembayaran Simpanan Pokok Diperlukan'
                    intro = 'Pendaftaran keanggotaan Anda telah disetujui. Selesaikan pembayaran simpanan pokok untuk mengaktifkan keanggotaan Anda.'
                    login_link = f"{settings.FRONTEND_BASE_URL.rstrip('/')}/register/under-review?id={pk}"
                    cta_label = 'Lanjutkan ke Pembayaran'
                    cta_url = login_link
                    details = [
                        ('Nama Anggota', registration_row.get('full_name') or registration_row.get('email')),
                        ('NIK Karyawan', registration_row.get('nik_employee') or '-'),
                        ('Pembayaran Diperlukan', f'Rp {min_amount:,.0f}'),
                        ('Tujuan', 'Simpanan Pokok (Wajib)'),
                    ]

                try:
                    send_styled_email(
                        subject,
                        registration_row['email'],
                        intro,
                        details=details,
                        highlight=('Langkah Selanjutnya', cta_label),
                        cta_label=cta_label,
                        cta_url=cta_url,
                        footer_note='Jika Anda memiliki pertanyaan, silakan hubungi administrator.',
                        plain_fallback=intro,
                    )
                except Exception:
                    pass
            return Response({'status': 'success', 'message': 'Registration approved'})
        except Exception as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        
    @action(detail=True, methods=['get'])
    def get_registration_status(self, request, pk=None):
        try:
            registration_row = _try_fetchone(
                """
                SELECT r.status_id, r.full_name, r.email,
                       m.id AS member_id
                FROM registrations r
                LEFT JOIN users u ON u.email = r.email
                LEFT JOIN members m ON m.user_id = u.id
                WHERE r.id = %s
                LIMIT 1
                """,
                [pk],
            )
            if not registration_row:
                return Response({'error': 'Registration not found'}, status=status.HTTP_404_NOT_FOUND)

            # If we found a member_id, also fetch the principal obligation amount
            member_id = registration_row.get('member_id')
            if member_id:
                obligation_row = _try_fetchone(
                    """
                    SELECT mso.monthly_amount
                    FROM member_saving_obligations mso
                    WHERE mso.member_id = %s AND mso.is_active = TRUE AND mso.saving_type_id = 3
                    ORDER BY mso.updated_at DESC NULLS LAST, mso.id DESC
                    LIMIT 1
                    """,
                    [member_id],
                )
                if obligation_row:
                    registration_row['principal_amount'] = obligation_row.get('monthly_amount')

            return Response(registration_row)
        except Exception as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def reject_registration(self, request, pk=None):
        comment = (request.data.get('comment') or '').strip()
        # Require comment when rejecting registration
        if not comment:
            return Response({'error': 'Silakan masukkan komentar penolakan.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            registration_row = _try_fetchone(
                """
                SELECT full_name, email, employee_nik AS nik_employee
                FROM registrations
                WHERE id = %s
                LIMIT 1
                """,
                [pk],
            )
            with connection.cursor() as cursor:
                cursor.execute('CALL sp_reject_regist(%s, %s)', [pk, comment])

            if registration_row and registration_row.get('email'):
                try:
                    send_styled_email(
                        'Pendaftaran Ditolak',
                        registration_row['email'],
                        'Permintaan pendaftaran keanggotaan Anda telah ditolak.',
                        details=[
                            ('Nama Anggota', registration_row.get('full_name') or registration_row.get('email')),
                            ('NIK Karyawan', registration_row.get('nik_employee') or '-'),
                            ('Alasan', comment or 'Tidak ada alasan yang diberikan'),
                        ],
                        highlight=('Status', 'Ditolak'),
                        footer_note='Silakan hubungi administrator jika Anda memerlukan klarifikasi atau ingin mengajukan kembali.',
                        plain_fallback='Permintaan pendaftaran keanggotaan Anda telah ditolak.',
                    )
                except Exception:
                    pass
            return Response({'status': 'success', 'message': 'Registration rejected'})
        except Exception as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
