from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import connection
from django.core.mail import EmailMultiAlternatives
from django.core.signing import BadSignature, SignatureExpired, TimestampSigner
from django.conf import settings
from django.contrib.auth.hashers import make_password, check_password, identify_hasher
from decimal import Decimal
from html import escape
from urllib.parse import quote, urlparse
from urllib.request import urlopen
from api.master.models import Status, Member, SHUComponent, Department, PaymentChannel, IncomeExpenseCategory
from rest_framework import serializers
from django.utils import timezone
from django.core.files.storage import default_storage

class SHUComponentSerializer(serializers.ModelSerializer):
    class Meta:
        model = SHUComponent
        fields = '__all__'

class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = ['id', 'department_name']

class PaymentChannelSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentChannel
        fields = '__all__'

class IncomeExpenseCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = IncomeExpenseCategory
        fields = '__all__'


def _fetch_close_account_request_details(close_account_id):
    tables = ('close_account_requests', 'member_close_requests', 'close_accounts')
    for table_name in tables:
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"""
                    SELECT
                        cr.id,
                        cr.member_id,
                        m.full_name,
                        m.nik_employee,
                        u.email,
                        cr.reason,
                        cr.request_date,
                        cr.status_id,
                        cr.transfer_file
                    FROM {table_name} cr
                    INNER JOIN members m ON m.id = cr.member_id
                    LEFT JOIN users u ON u.id = m.user_id
                    WHERE cr.id = %s
                    LIMIT 1
                    """,
                    [close_account_id],
                )
                row = cursor.fetchone()
                if row:
                    columns = [col[0] for col in cursor.description]
                    return dict(zip(columns, row)), table_name
        except Exception:
            continue
    return None, None


from api.utils.email import build_email_html as _build_email_html, send_styled_email as _send_styled_email


def _attach_transfer_file_from_url(message, transfer_file_url):
    if not transfer_file_url:
        return

    parsed = urlparse(transfer_file_url)
    if parsed.scheme not in ('http', 'https'):
        return

    try:
        with urlopen(transfer_file_url) as response:
            file_content = response.read()
            content_type = response.headers.get_content_type() or 'application/octet-stream'
            filename = parsed.path.rsplit('/', 1)[-1] or 'transfer_file'
            message.attach(filename, file_content, content_type)
    except Exception:
        pass


def _build_reset_token(email):
    signer = TimestampSigner(salt='password-reset')
    return signer.sign(email)


def _read_reset_token(token, max_age_seconds=3600):
    signer = TimestampSigner(salt='password-reset')
    return signer.unsign(token, max_age=max_age_seconds)

class StatusViewSet(viewsets.ViewSet):
    def list(self, request):
        category = request.query_params.get('category')

        data = Status.objects.filter(
            status_category__category_name=category,
            is_active=True,
            deleted_at__isnull=True
        ).values('id', 'status_name')
        return Response(list(data))

class EmployeeStatusViewSet(viewsets.ViewSet):
    def list(self, request):
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT id, status_name
                FROM employee_statuses
                ORDER BY status_name ASC
            """)
            columns = [col[0] for col in cursor.description]
            results = [dict(zip(columns, row)) for row in cursor.fetchall()]
        return Response(results)



class SHUComponentViewSet(viewsets.ModelViewSet):
    queryset = SHUComponent.objects.filter(deleted_at__isnull=True).order_by('id')
    serializer_class = SHUComponentSerializer

    def perform_create(self, serializer):
        serializer.save(created_at=timezone.now(), updated_at=timezone.now())

    def perform_update(self, serializer):
        serializer.save(updated_at=timezone.now())

    def perform_destroy(self, instance):
        instance.deleted_at = timezone.now()
        instance.save()

class DepartmentViewSet(viewsets.ModelViewSet):
    queryset = Department.objects.filter(deleted_at__isnull=True).order_by('department_name')
    serializer_class = DepartmentSerializer

    def perform_create(self, serializer):
        serializer.save(created_at=timezone.now(), updated_at=timezone.now())

    def perform_update(self, serializer):
        serializer.save(updated_at=timezone.now())

    def perform_destroy(self, instance):
        instance.deleted_at = timezone.now()
        instance.save()

class PaymentChannelViewSet(viewsets.ModelViewSet):
    queryset = PaymentChannel.objects.order_by('id')
    serializer_class = PaymentChannelSerializer

class IncomeExpenseCategoryViewSet(viewsets.ModelViewSet):
    queryset = IncomeExpenseCategory.objects.filter(deleted_at__isnull=True).order_by('id')
    serializer_class = IncomeExpenseCategorySerializer

    def perform_create(self, serializer):
        serializer.save(created_at=timezone.now(), updated_at=timezone.now())

    def perform_update(self, serializer):
        serializer.save(updated_at=timezone.now())

    def perform_destroy(self, instance):
        instance.deleted_at = timezone.now()
        instance.save()

class AuthViewSet(viewsets.ViewSet):
    @action(detail=False, methods=['post'])
    def login(self, request):
        email = request.data.get('email')
        password = request.data.get('password')
        
        if not email or not password:
            return Response({'error': 'Email and password are required'}, status=400)

        try:
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT 
                        u.id, u.email, u.password, u.role_id, r.role_name, 
                        m.id as member_id, m.full_name, m.nik_employee
                    FROM users u
                    INNER JOIN roles r ON r.id = u.role_id
                    LEFT JOIN members m ON m.user_id = u.id
                    WHERE u.email = %s AND u.is_active = true
                """, [email])
                
                columns = [col[0] for col in cursor.description]
                row = cursor.fetchone()
                
                if row:
                    user_data = dict(zip(columns, row))
                    user_id = user_data['id']
                    stored_password = user_data.pop('password', None)
                    if not stored_password:
                        return Response({'error': 'Invalid email or password'}, status=401)
                    
                    password_valid = False
                    password_was_plain_text = False
                    
                    try:
                        identify_hasher(stored_password)
                        password_valid = check_password(password, stored_password)
                    except Exception:
                        # Password is plain text, not hashed
                        password_valid = stored_password == password
                        password_was_plain_text = True
                        
                        if password_valid:
                            # Hash the password and update database
                            hashed_password = make_password(password)
                            with connection.cursor() as update_cursor:
                                update_cursor.execute(
                                    "UPDATE users SET password = %s, last_login = %s WHERE id = %s",
                                    [hashed_password, timezone.now(), user_id]
                                )
                        else:
                            return Response({'error': 'Invalid email or password'}, status=401)
                    
                    # Update last_login if password is already hashed
                    if password_valid and not password_was_plain_text:
                        with connection.cursor() as update_cursor:
                            update_cursor.execute(
                                "UPDATE users SET last_login = %s WHERE id = %s",
                                [timezone.now(), user_id]
                            )

                    if not password_valid:
                        return Response({'error': 'Invalid email or password'}, status=401)

                    # Add flags to response
                    user_data['password_was_plain_text'] = password_was_plain_text
                    user_data['last_login'] = timezone.now().isoformat()

                    return Response(user_data)

                return Response({'error': 'Invalid email or password'}, status=401)
                    
        except Exception as e:
            return Response({'error': str(e)}, status=500)

    @action(detail=False, methods=['post'])
    def forgot_password(self, request):
        email = (request.data.get('email') or '').strip().lower()
        if not email:
            return Response({'error': 'Email is required'}, status=400)

        try:
            user_row = None
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT u.id, u.email, u.first_name
                    FROM users u
                    WHERE LOWER(u.email) = LOWER(%s) AND u.is_active = true
                    LIMIT 1
                    """,
                    [email],
                )
                row = cursor.fetchone()
                if row:
                    columns = [col[0] for col in cursor.description]
                    user_row = dict(zip(columns, row))

            if user_row and user_row.get('email'):
                token = _build_reset_token(user_row['email'])
                reset_link = f"{settings.FRONTEND_BASE_URL}/reset-password?token={quote(token)}"
                # Prefer a human-friendly name for the account label:
                # 1) users.first_name if present
                # 2) memberusers.first_name when the user is linked to a memberuser
                # 3) fallback to the email address
                first_name = user_row.get('first_name') or ''
                if not first_name:
                    try:
                        with connection.cursor() as mcur:
                            mcur.execute(
                                "SELECT full_name FROM members WHERE user_id = %s LIMIT 1",
                                [user_row['id']],
                            )
                            mrow = mcur.fetchone()
                            if mrow and mrow[0]:
                                first_name = mrow[0]
                    except Exception:
                        first_name = ''
                if not first_name:
                    first_name = user_row.get('email')

                _send_styled_email(
                    'Password Reset Request',
                    user_row['email'],
                    'We received a request to reset your password.',
                    details=[
                        ('Account', first_name),
                        ('Email', user_row['email']),
                    ],
                    highlight=('Action Required', 'Click the button below to choose a new password.'),
                    cta_label='Reset Password',
                    cta_url=reset_link,
                    footer_note='This password reset link will expire after 1 hour. If you did not request this reset, you can ignore this email.',
                    plain_fallback=f'Reset your password using this link: {reset_link}',
                )

            return Response({'status': 'success', 'message': 'If the email exists, a reset link has been sent.'})
        except Exception as exc:
            return Response({'error': str(exc)}, status=400)

    @action(detail=False, methods=['post'])
    def reset_password(self, request):
        import re as _re
        token = request.data.get('token')
        new_password = request.data.get('password')

        if not token or not new_password:
            return Response({'error': 'token and password are required'}, status=400)

        pw_errors = []
        if len(new_password) < 8:
            pw_errors.append('minimal 8 karakter')
        if not _re.search(r'[A-Z]', new_password):
            pw_errors.append('minimal 1 huruf kapital')
        if not _re.search(r'\d', new_password):
            pw_errors.append('minimal 1 angka')
        if not _re.search(r'[!@#$%^&*()_+\-=\[\]{};\':"\\|,.<>/?]', new_password):
            pw_errors.append('minimal 1 simbol')
        if pw_errors:
            return Response({'error': f'Password harus mengandung: {", ".join(pw_errors)}.'}, status=400)

        try:
            email = _read_reset_token(token, max_age_seconds=3600)
        except SignatureExpired:
            return Response({'error': 'Reset link has expired'}, status=400)
        except BadSignature:
            return Response({'error': 'Invalid reset link'}, status=400)

        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE users
                    SET password = %s
                    WHERE LOWER(email) = LOWER(%s) AND is_active = true
                    """,
                    [make_password(new_password), email],
                )

                if cursor.rowcount == 0:
                    return Response({'error': 'User not found'}, status=404)

            return Response({'status': 'success', 'message': 'Password updated successfully'})
        except Exception as exc:
            return Response({'error': str(exc)}, status=400)

    @action(detail=False, methods=['post'])
    def register(self, request):
        data = request.data
        required_fields = [
            'nik', 'fullName', 'nikEmployee', 'noNpwp', 'placeOfBirth',
            'dateOfBirth', 'gender', 'address', 'phoneNumber', 'email',
            'employeeStatusId', 'npwpFile', 'ktpFile', 'departmentId',
            'voluntarySaving', 'payrollAgreement', 'password'
        ]
        missing = [
            field for field in required_fields
            if field not in data
            or data.get(field) is None
            or (isinstance(data.get(field), str) and data.get(field).strip() == '')
        ]
        if missing:
            return Response({'error': f"Missing fields: {', '.join(missing)}"}, status=400)

        def parse_bool(value):
            if isinstance(value, bool):
                return value
            if isinstance(value, str):
                return value.lower() in ['true', '1', 'yes']
            return bool(value)

        try:
            employee_status_id = int(data.get('employeeStatusId'))
            department_id = int(data.get('departmentId'))
            voluntary_saving = Decimal(str(data.get('voluntarySaving') or 0))
            payroll_agreement = parse_bool(data.get('payrollAgreement'))
            hashed_password = make_password(data.get('password'))

            with connection.cursor() as cursor:
                cursor.execute("""
                    CALL sp_regist_new_member(
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                    )
                """, [
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
                    employee_status_id,
                    data.get('npwpFile'),
                    data.get('ktpFile'),
                    department_id,
                    voluntary_saving,
                    payroll_agreement,
                    hashed_password
                ])

            return Response({'status': 'success'})
        except Exception as e:
            return Response({'error': str(e)}, status=400)

    @action(detail=False, methods=['post'])
    def approve_close_account(self, request):
        """Approve close account request via stored procedure"""
        close_account_id = request.data.get('id')
        notes = request.data.get('comment', '')
        admin_id = request.data.get('admin_id')
        transfer_file = request.data.get('transfer_file', '')
        # If an actual uploaded file is sent in multipart, persist it to storage now
        uploaded_transfer = request.FILES.get('transfer_file')
        if uploaded_transfer:
            try:
                filename = uploaded_transfer.name.replace(' ', '_')
                storage_path = f'transfer/{timezone.now():%Y%m%d_%H%M%S}_{filename}'
                saved_path = default_storage.save(storage_path, uploaded_transfer)
                # build absolute URL depending on MEDIA_URL configuration
                if str(settings.MEDIA_URL).startswith('http'):
                    transfer_file = f"{settings.MEDIA_URL.rstrip('/')}/{str(saved_path).lstrip('/')}"
                else:
                    media_base = request.build_absolute_uri(settings.MEDIA_URL)
                    transfer_file = f"{media_base.rstrip('/')}/{str(saved_path).lstrip('/')}"
            except Exception:
                pass
        
        if not close_account_id or not admin_id:
            return Response({'error': 'id and admin_id are required'}, status=400)
        # require at least comment or transfer_file for approval
        if not (notes and str(notes).strip()) and not transfer_file:
            return Response({'error': 'Either comment or transfer_file is required to approve a close account request'}, status=400)
        
        try:
            request_details, _ = _fetch_close_account_request_details(close_account_id)
            with connection.cursor() as cursor:
                cursor.execute(
                    "CALL sp_approve_close_account(%s, %s, %s, %s)",
                    [close_account_id, notes, admin_id, transfer_file],
                )

            member_email = request_details.get('email') if request_details else None
            member_name = request_details.get('full_name') if request_details else 'Member'
            transfer_link = transfer_file or (request_details.get('transfer_file') if request_details else '')

            if member_email:
                try:
                    email_message = EmailMultiAlternatives(
                        'Close Account Approved',
                        'Your close account request has been approved.',
                        getattr(settings, 'DEFAULT_FROM_EMAIL', None),
                        [member_email],
                    )
                    email_message.attach_alternative(
                        _build_email_html(
                            'Close Account Approved',
                            'Your close account request has been approved.',
                            details=[
                                ('Member Name', member_name),
                                ('NIK', request_details.get('nik_employee') if request_details else '-'),
                                ('Transfer File', 'Attached'),
                            ],
                            highlight=('Status', 'Approved'),
                            footer_note='Please review the attached transfer file for the settlement details.',
                        ),
                        'text/html',
                    )
                    _attach_transfer_file_from_url(email_message, transfer_link)
                    email_message.send(fail_silently=True)
                except Exception:
                    pass
            return Response({'status': 'success', 'message': 'Close account approved'})
        except Exception as e:
            return Response({'error': str(e)}, status=400)

    @action(detail=False, methods=['post'])
    def reject_close_account(self, request):
        """Reject close account request via stored procedure"""
        close_account_id = request.data.get('id')
        notes = request.data.get('comment', '')
        admin_id = request.data.get('admin_id')
        # allow optional transfer file upload on rejection as well
        uploaded_transfer = request.FILES.get('transfer_file')
        transfer_link = ''
        if uploaded_transfer:
            try:
                filename = uploaded_transfer.name.replace(' ', '_')
                storage_path = f'transfer/{timezone.now():%Y%m%d_%H%M%S}_{filename}'
                saved_path = default_storage.save(storage_path, uploaded_transfer)
                if str(settings.MEDIA_URL).startswith('http'):
                    transfer_link = f"{settings.MEDIA_URL.rstrip('/')}/{str(saved_path).lstrip('/')}"
                else:
                    media_base = request.build_absolute_uri(settings.MEDIA_URL)
                    transfer_link = f"{media_base.rstrip('/')}/{str(saved_path).lstrip('/')}"
            except Exception:
                transfer_link = ''
        
        if not close_account_id or not admin_id:
            return Response({'error': 'id and admin_id are required'}, status=400)
        # require comment for rejection
        if not (notes and str(notes).strip()):
            return Response({'error': 'Comment is required when rejecting a close account request'}, status=400)
        try:
            request_details, _ = _fetch_close_account_request_details(close_account_id)
            with connection.cursor() as cursor:
                cursor.execute(
                    "CALL sp_reject_close_account(%s, %s, %s)",
                    [close_account_id, notes, admin_id],
                )

            member_email = request_details.get('email') if request_details else None
            member_name = request_details.get('full_name') if request_details else 'Member'

            if member_email:
                try:
                    _send_styled_email(
                        'Close Account Rejected',
                        member_email,
                        'Your close account request has been rejected.',
                        details=[
                            ('Member Name', member_name),
                            ('NIK', request_details.get('nik_employee') if request_details else '-'),
                            ('Reason', notes or 'No reason provided'),
                        ],
                        highlight=('Status', 'Rejected'),
                        footer_note='If you have questions, please contact the administrator.',
                        plain_fallback='Your close account request has been rejected.',
                    )
                    # attach transfer file if uploaded
                    if transfer_link:
                        try:
                            msg = EmailMultiAlternatives(
                                'Close Account Rejected - Attachment',
                                'Attached is the transfer file related to your close account request.',
                                getattr(settings, 'DEFAULT_FROM_EMAIL', None),
                                [member_email],
                            )
                            msg.attach_alternative(_build_email_html('Close Account Rejected', 'Your close account request has been rejected.', details=[('Member Name', member_name), ('Reason', notes or 'No reason provided')], highlight=('Status', 'Rejected')), 'text/html')
                            _attach_transfer_file_from_url(msg, transfer_link)
                            msg.send(fail_silently=True)
                        except Exception:
                            pass
                except Exception:
                    pass
            return Response({'status': 'success', 'message': 'Close account rejected'})
        except Exception as e:
            return Response({'error': str(e)}, status=400)

class BankViewSet(viewsets.ViewSet):
    def list(self, request):
        with connection.cursor() as cursor:
            cursor.execute("SELECT id, bank_name, bank_code FROM banks WHERE deleted_at IS NULL ORDER BY bank_name ASC")
            columns = [col[0] for col in cursor.description]
            results = [dict(zip(columns, row)) for row in cursor.fetchall()]
        return Response(results)

    @action(detail=False, methods=['post'])
    def validate_account(self, request):
        bank_code = request.data.get('bank_code')
        account_number = request.data.get('account_number')
        member_id = request.data.get('member_id', 1)
        
        if not bank_code or not account_number:
            return Response({'error': 'bank_code and account_number are required'}, status=400)

        # Ambil bank_name asli dari database berdasarkan bank yang dipilih
        with connection.cursor() as cursor:
            cursor.execute("SELECT bank_name FROM banks WHERE bank_name = %s", [bank_code])
            b_row = cursor.fetchone()
            
        if not b_row:
            return Response({'error': f'Bank {bank_code} not found in database'}, status=404)
            
        db_bank_name = b_row[0].lower()

        # Ekstrak kode huruf (slug) secara 100% dinamis dan otomatis tanpa hardcode:
        import re
        match = re.search(r'\((.*?)\)', db_bank_name)
        if match:
            # Jika ada tanda kurung seperti "(BCA)", ambil isi di dalamnya: "bca"
            midtrans_bank_code = match.group(1).strip()
        else:
            # Jika tidak ada kurung seperti "Bank Mandiri", buang kata "bank" dan ambil kata kuncinya: "mandiri"
            words = db_bank_name.split()
            key_words = [w for w in words if w != "bank"]
            midtrans_bank_code = key_words[0] if key_words else db_bank_name
            
        midtrans_bank_code = midtrans_bank_code.strip().lower()

        import base64
        import requests
        from django.conf import settings

        server_key = settings.MIDTRANS_SERVER_KEY
        is_production = settings.MIDTRANS_IS_PRODUCTION

        auth_string = f"{server_key}:"
        auth_base64 = base64.b64encode(auth_string.encode('utf-8')).decode('utf-8')
        headers = {
            'Authorization': f'Basic {auth_base64}',
            'Accept': 'application/json'
        }

        url = "https://app.midtrans.com/iris/api/v1/bank_accounts/validate" if is_production else "https://app.sandbox.midtrans.com/iris/api/v1/bank_accounts/validate"
        params = {
            'bank': midtrans_bank_code,
            'account': account_number
        }

        try:
            response = requests.get(url, params=params, headers=headers, timeout=4)
            res_data = response.json()
            
            if response.status_code == 200 and 'account_name' in res_data:
                return Response({
                    'status': 'valid',
                    'account_name': res_data['account_name']
                })
            else:
                if not is_production:
                    if len(account_number) >= 5 and len(account_number) <= 15:
                        with connection.cursor() as cursor:
                            cursor.execute("SELECT full_name FROM members WHERE id = %s", [member_id])
                            m_row = cursor.fetchone()
                            holder_name = m_row[0] if m_row else "DEMO HOLDER NAME"
                        return Response({
                            'status': 'valid',
                            'account_name': holder_name.upper(),
                            'is_mocked': True
                        })
                
                error_msg = res_data.get('error_message') or 'Account validation failed'
                return Response({'error': error_msg}, status=400)
                
        except Exception as e:
            if not is_production and len(account_number) >= 5 and len(account_number) <= 15:
                with connection.cursor() as cursor:
                    cursor.execute("SELECT full_name FROM members WHERE id = %s", [member_id])
                    m_row = cursor.fetchone()
                    holder_name = m_row[0] if m_row else "DEMO HOLDER NAME"
                return Response({
                    'status': 'valid',
                    'account_name': holder_name.upper(),
                    'is_mocked': True
                })
            return Response({'error': f'Failed to connect to Midtrans Iris: {str(e)}'}, status=500)

import os
import uuid

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response

from .models import DocumentArchive, DocumentType
from .serializers import DocumentArchiveSerializer, DocumentTypeSerializer

SUPABASE_URL = os.getenv('SUPABASE_URL', '').rstrip('/')
S3_BUCKET = os.getenv('AWS_STORAGE_BUCKET_NAME', 'koperasi')
S3_FOLDER = 'document'
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


def get_s3_client():
    return boto3.client(
        's3',
        endpoint_url=os.getenv('AWS_S3_ENDPOINT_URL'),
        aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
        aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
        region_name=os.getenv('AWS_S3_REGION_NAME', 'ap-northeast-1'),
    )


def upload_to_supabase(file_obj, original_filename, content_type):
    ext = os.path.splitext(original_filename)[1].lower()
    unique_name = f"{uuid.uuid4().hex}{ext}"
    s3_key = f"{S3_FOLDER}/{unique_name}"

    s3 = get_s3_client()
    s3.upload_fileobj(
        file_obj,
        S3_BUCKET,
        s3_key,
        ExtraArgs={'ContentType': content_type or 'application/octet-stream'},
    )

    public_url = f"{SUPABASE_URL}/storage/v1/object/public/{S3_BUCKET}/{s3_key}"
    return public_url, original_filename


@api_view(['GET', 'POST'])
@parser_classes([MultiPartParser, FormParser])
def document_archive_list_create(request):
    if request.method == 'GET':
        archives = DocumentArchive.objects.all()
        
        # Filter by type_id if provided
        type_id = request.query_params.get('type_id')
        if type_id:
            try:
                type_id = int(type_id)
                archives = archives.filter(type_id=type_id)
            except (ValueError, TypeError):
                pass
        
        serializer = DocumentArchiveSerializer(archives, many=True)
        return Response(serializer.data)

    file_obj = request.FILES.get('document')
    if not file_obj:
        return Response({'document': 'File wajib diunggah.'}, status=status.HTTP_400_BAD_REQUEST)

    if file_obj.size > MAX_FILE_SIZE:
        return Response(
            {'document': 'Ukuran file maksimal 10 MB.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    title = request.data.get('title', '').strip()
    if not title:
        return Response({'title': 'Judul wajib diisi.'}, status=status.HTTP_400_BAD_REQUEST)

    type_id = request.data.get('type_id') or None
    if type_id:
        try:
            DocumentType.objects.get(pk=type_id)
        except DocumentType.DoesNotExist:
            return Response(
                {'type_id': 'Tipe dokumen tidak ditemukan.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

    try:
        document_url, file_name = upload_to_supabase(file_obj, file_obj.name, file_obj.content_type)
    except (BotoCoreError, ClientError) as e:
        return Response(
            {'document': f'Gagal upload ke storage: {str(e)}'},
            status=status.HTTP_502_BAD_GATEWAY,
        )
    except Exception as e:
        return Response(
            {'document': f'Gagal mengunggah: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    archive = DocumentArchive.objects.create(
        title=title,
        description=request.data.get('description', '').strip() or None,
        type_id=int(type_id) if type_id else None,
        document_url=document_url,
        file_name=file_name,
        file_size=file_obj.size,
    )

    serializer = DocumentArchiveSerializer(archive)
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(['GET'])
def document_type_list(request):
    document_types = DocumentType.objects.all()
    serializer = DocumentTypeSerializer(document_types, many=True)
    return Response(serializer.data)
