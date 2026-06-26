from rest_framework import viewsets, status as drf_status
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from django.db import connection, transaction
from django.utils import timezone
from django.core.mail import send_mail, EmailMessage, EmailMultiAlternatives
from django.core.files.storage import default_storage
from django.conf import settings
from django.utils.html import strip_tags
from decimal import Decimal

def is_user_admin(user):
    if not user or not user.is_authenticated:
        return False
    from django.db import connection
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT role_id FROM users WHERE email = %s", [user.email])
            row = cursor.fetchone()
            return row and row[0] == 1
    except Exception:
        return False
import datetime
import calendar
import os
import re
import json
import mimetypes
from uuid import uuid4
from urllib.request import urlopen
from html import escape
from .models import LoanApplication, LoanType, Loan, LoanInstallment
from api.master.models import Status
from .serializers import LoanApplicationSerializer, LoanTypeSerializer, LoanSerializer, LoanInstallmentSerializer
from ml_service.trainer import get_prediction, trigger_model_training

def add_months(sourcedate, months):
    month = sourcedate.month - 1 + months
    year = sourcedate.year + month // 12
    month = month % 12 + 1
    day = min(sourcedate.day, calendar.monthrange(year, month)[1])
    return datetime.date(year, month, day)

def get_absolute_media_url(request, path):
    if not path:
        return None
    if path.startswith('http'):
        return path
    if path.startswith('/'):
        path = path[1:]
    endpoint_url = getattr(settings, 'AWS_S3_ENDPOINT_URL', '') or ''
    bucket_name = getattr(settings, 'AWS_STORAGE_BUCKET_NAME', '') or ''
    if endpoint_url and bucket_name:
        public_base = endpoint_url.replace('.storage.supabase.co/storage/v1/s3', '.supabase.co')
        return f"{public_base}/storage/v1/object/public/{bucket_name}/{path}"

    base_url = request.build_absolute_uri(settings.MEDIA_URL)
    return f"{base_url}{path}"


from api.utils.email import build_email_html as _build_email_html

class LoanApplicationViewSet(viewsets.ModelViewSet):
    serializer_class = LoanApplicationSerializer

    def get_queryset(self):
        if self.request.user.is_authenticated and hasattr(self.request.user, 'member'):
            return LoanApplication.objects.filter(member=self.request.user.member)
        return LoanApplication.objects.all()

    def perform_create(self, serializer):
        member = serializer.validated_data.get('member') or (self.request.user.member if hasattr(self.request.user, 'member') else None)
        if member:
            with connection.cursor() as cursor:
                cursor.execute("SELECT COUNT(*) FROM close_account_requests WHERE member_id = %s AND status_id = 44 AND deleted_at IS NULL", [member.id])
                if cursor.fetchone()[0] > 0:
                    from rest_framework.exceptions import ValidationError
                    raise ValidationError({'error': 'Akun Anda sedang dalam proses penutupan. Pengajuan pinjaman tidak dapat dilakukan.'})

        status = Status.objects.get(
            status_category__category_name='LOAN_APPLICATION',
            status_code='SUBMITTED'
        )
        instance = serializer.save(status=status)
        
        # Notify Admin about new loan request
        try:
            member_name = instance.member.full_name if hasattr(instance, 'member') else "A member"
            amount = instance.amount_requested
            duration_text = f"{instance.duration_months} months"
            
            subject = f"Pengajuan Pinjaman Baru - {member_name}"
            html_message = _build_email_html(
                'Pengajuan Pinjaman Baru',
                f'{member_name} telah mengajukan pinjaman baru untuk ditinjau.',
                details=[
                    ('Nama Anggota', member_name),
                    ('Jumlah', f'Rp {amount:,.0f}'),
                    ('Tujuan', instance.purpose or '-'),
                    ('Jangka Waktu', duration_text),
                    ('Status', 'Diajukan'),
                ],
                highlight=('Tindakan Diperlukan', 'Silakan tinjau pengajuan pinjaman ini'),
                footer_note='Ini adalah notifikasi otomatis dari Sistem Koperasi Sanoh.',
            )
            
            # Notify Admin using System Email but set Reply-To to Member
            member_email = instance.member.user.email if hasattr(instance.member, 'user') else None
            
            from django.core.mail import EmailMultiAlternatives
            
            # Forced sender name using Member's email
            # forced_from = f"{instance.member.full_name} <{member_email}>" if hasattr(instance, 'member') and member_email else settings.DEFAULT_FROM_EMAIL
            forced_from = settings.DEFAULT_FROM_EMAIL

            email = EmailMultiAlternatives(
                subject,
                strip_tags(html_message),
                forced_from,
                [settings.ADMIN_EMAIL],
                reply_to=[member_email] if member_email else []
            )
            email.attach_alternative(html_message, "text/html")
            email.send(fail_silently=False)

            # Notify Member about their new loan request
            try:
                member_email = instance.member.user.email if hasattr(instance.member, 'user') else None
                if member_email:
                    member_subject = "Pengajuan Pinjaman Diterima - Koperasi Sanoh"
                    member_html = _build_email_html(
                        'Pengajuan Pinjaman Diterima',
                        f'Halo {instance.member.full_name}, pengajuan pinjaman Anda telah dikirim dan sedang ditinjau oleh tim administrasi kami.',
                        details=[
                            ('Jumlah', f'Rp {amount:,.0f}'),
                            ('Jangka Waktu', duration_text),
                            ('Status', 'Menunggu Tinjauan'),
                        ],
                        highlight=('Status Pengajuan', 'Pengajuan berhasil diterima'),
                        footer_note='Kami akan mengirim notifikasi melalui email setelah keputusan dibuat.',
                    )
                    send_mail(
                        member_subject,
                        strip_tags(member_html),
                        settings.DEFAULT_FROM_EMAIL,
                        [member_email],
                        fail_silently=False,
                        html_message=member_html
                    )
            except Exception as e:
                print(f"Failed to send member notification: {str(e)}")
        except Exception as e:
            print(f"Failed to send notifications: {str(e)}")

    @action(detail=False, methods=['get'])
    def admin_pending_list(self, request):
        query = """
        SELECT m.full_name, m.id AS employee_id, 
        d.department_name, la.purpose, la.duration_months, la.amount_requested, la.id as application_id
        FROM loan_applications la 
        INNER JOIN members m ON la.member_id = m.id
        INNER JOIN departments d ON m.department_id = d.id
        INNER JOIN users u ON m.user_id = u.id
        WHERE la.status_id = 21 AND u.is_active IS TRUE
        """
        
        with connection.cursor() as cursor:
            cursor.execute(query)
            columns = [col[0] for col in cursor.description]
            results = [dict(zip(columns, row)) for row in cursor.fetchall()]
            
        return Response(results)

    @action(detail=True, methods=['get'])
    def admin_application_detail(self, request, pk=None):
        query = """
        SELECT m.full_name, m.id as member_id, 
        d.department_name, la.purpose, la.duration_months, la.amount_requested, 
        m.nik_employee, m.phone_number, u.email, la.applied_at, la.reject_reason, 
        la.salary_statement_file, lt.name as loan_type_name,
        adm.email as admin_email
        FROM loan_applications la 
        JOIN members m ON la.member_id = m.id
        JOIN departments d ON m.department_id = d.id
        JOIN users u ON m.user_id = u.id
        LEFT JOIN loan_types lt ON la.loan_type_id = lt.id
        LEFT JOIN users adm ON la.admin_id = adm.id
        WHERE la.id = %s AND u.is_active IS TRUE
        """
        with connection.cursor() as cursor:
            cursor.execute(query, [pk])
            columns = [col[0] for col in cursor.description]
            row = cursor.fetchone()
            if row:
                result = dict(zip(columns, row))
                if result.get('salary_statement_file'):
                    result['salary_statement_file'] = get_absolute_media_url(request, result['salary_statement_file'])
                return Response(result)
            return Response({'error': 'Application not found'}, status=404)

    @action(detail=True, methods=['get'])
    def get_ai_suggestion(self, request, pk=None):
        """
        Mendapatkan saran AI untuk kelayakan pinjaman dan bunga.
        """
        try:
            application = self.get_object()

            prediction = get_prediction(
                application.amount_requested,
                application.duration_months,
                application.member_id
            )

            suggested_rate = prediction.get('suggested_interest_rate')

            return Response({
                'application_id': application.id,
                'eligibility': prediction.get('eligibility', 'PERLU REVIEW MANUAL'),
                'confidence_score': round(prediction.get('probability', 0.5) * 100, 2),
                'suggested_interest_rate': round(float(suggested_rate), 2) if suggested_rate is not None else None,
                'risk_level': prediction.get('risk_level', 'TINGGI'),
                'member_stats': prediction.get('member_features', {}),
                'recommendation': prediction.get('recommendation', ''),
                'risk_factors': prediction.get('risk_factors', []),
            })
        except Exception as e:
            return Response({'error': str(e)}, status=400)

    @action(detail=False, methods=['post'])
    def get_prediction_pre_submit(self, request):
        """
        Mendapatkan saran AI untuk simulasi sebelum pengajuan (tanpa PK).
        """
        try:
            amount = request.data.get('amount')
            duration = request.data.get('duration')
            member_id = request.data.get('member_id')
            
            if not all([amount, duration, member_id]):
                return Response({'error': 'Missing parameters'}, status=400)
                
            prediction = get_prediction(
                amount,
                duration,
                member_id
            )
            
            suggested_rate = prediction.get('suggested_interest_rate')

            return Response({
                'eligibility': prediction.get('eligibility', 'PERLU REVIEW MANUAL'),
                'confidence_score': round(prediction.get('probability', 0.5) * 100, 2),
                'suggested_interest_rate': round(float(suggested_rate), 2) if suggested_rate is not None else None,
                'risk_level': prediction.get('risk_level', 'TINGGI'),
            })
        except Exception as e:
            return Response({'error': str(e)}, status=400)

    @action(detail=True, methods=['post'], parser_classes=[MultiPartParser, FormParser])
    def approve(self, request, pk=None):
        try:
            application = self.get_object()
            repayment_term = int(request.data.get('repayment_term', application.duration_months))
            interest_rate_percent = Decimal(str(request.data.get('interest_rate', '0.5')))
            updated_amount = Decimal(str(request.data.get('amount_requested', application.amount_requested)))
            proof_file = request.FILES.get('proof_of_transfer')

            if not proof_file:
                return Response({'error': 'Bukti transfer wajib diunggah untuk menyetujui pinjaman.'}, status=400)

            # Check Remaining Allocation
            import datetime
            now = datetime.datetime.now()
            sel_month = now.month
            sel_year = now.year

            with connection.cursor() as cursor:
                cursor.execute("SELECT monthly_limit FROM loan_funding_settings WHERE is_active = TRUE ORDER BY effective_date DESC LIMIT 1")
                ml_row = cursor.fetchone()
                monthly_limit = float(ml_row[0]) if ml_row and ml_row[0] is not None else 0.0

                cursor.execute(
                    "SELECT COALESCE(SUM(principal_amount),0) FROM loans WHERE EXTRACT(YEAR FROM start_date) = %s AND EXTRACT(MONTH FROM start_date) = %s AND status_id = 25",
                    [sel_year, sel_month]
                )
                alloc_row = cursor.fetchone()
                allocated = float(alloc_row[0]) if alloc_row and alloc_row[0] is not None else 0.0

            remaining_allocation = monthly_limit - allocated
            if remaining_allocation < 0:
                remaining_allocation = 0.0

            if float(updated_amount) > remaining_allocation:
                # Format to Rupiah roughly
                rupiah_format = "Rp " + "{:,.0f}".format(remaining_allocation).replace(',', '.')
                return Response({'error': f'Sisa alokasi dana pinjaman bulan ini tidak mencukupi (Sisa: {rupiah_format}).'}, status=400)

            safe_name = os.path.basename(proof_file.name or 'proof_of_transfer')
            safe_name = safe_name.replace(' ', '_')
            storage_path = f"loan/bukti_transfer/{timezone.now():%Y%m%d_%H%M%S}_{uuid4().hex}_{safe_name}"
            saved_path = default_storage.save(storage_path, proof_file)
            proof_of_transfer = default_storage.url(saved_path)
            if not str(proof_of_transfer).startswith('http'):
                proof_of_transfer = get_absolute_media_url(request, saved_path)
            
            with transaction.atomic():
                # 1. Update Application, Create Loan, and Generate Installments via Stored Procedure
                admin_user_id = request.data.get('admin_id', request.user.id or 1)
                
                # allow passing an optional admin reason/ note to the stored procedure
                reason = (
                    request.data.get('reason') or
                    request.data.get('reject_reason') or
                    request.data.get('decision_note') or
                    None
                )

                with connection.cursor() as cursor:
                    cursor.execute(
                        "CALL public.sp_loan_approve(%s, %s, %s, %s, %s, %s, %s)",
                        [
                            application.id,
                            repayment_term,
                            interest_rate_percent,
                            updated_amount,
                            admin_user_id,
                            reason,
                            proof_of_transfer,
                        ]
                    )
                
                # Refresh object to make sure it has the new status for later logic
                application.refresh_from_db()
                
                # 2. Calculate values solely for the email notification
                principal = updated_amount
                interest_amount = principal * (interest_rate_percent / 100)
                total_amount = principal + interest_amount
                
                # Notify Member about approval
                try:
                    member_email = application.member.user.email
                    member_name = application.member.full_name
                    
                    subject = "Pengajuan Pinjaman Disetujui"
                    html_message = _build_email_html(
                        'Pinjaman Disetujui!',
                        f'Halo {member_name}, pengajuan pinjaman Anda telah disetujui.',
                        details=[
                            ('Jumlah', f'Rp {updated_amount:,.0f}'),
                            ('Jangka Waktu', f'{repayment_term} bulan'),
                            ('Suku Bunga', f'{interest_rate_percent}% / bulan'),
                            ('Total Pembayaran', f'Rp {total_amount:,.0f}'),
                            ('Bukti Transfer', 'Terlampir dalam email ini' if saved_path else 'Tidak terlampir'),
                        ],
                        highlight=('Status', 'Disetujui'),
                        footer_note='Anda sekarang dapat melihat jadwal pembayaran di dashboard.'
                    )
                    msg = EmailMultiAlternatives(
                        subject,
                        strip_tags(html_message),
                        settings.DEFAULT_FROM_EMAIL,
                        [member_email]
                    )
                    msg.attach_alternative(html_message, 'text/html')
                    
                    # Attach proof file from default storage (supports S3/Supabase/local)
                    if saved_path:
                        attached = False
                        try:
                            with default_storage.open(saved_path, 'rb') as stored_file:
                                file_bytes = stored_file.read()
                            filename_only = os.path.basename(saved_path) or 'proof_of_transfer'
                            mime_type = mimetypes.guess_type(filename_only)[0] or 'application/octet-stream'
                            msg.attach(filename_only, file_bytes, mime_type)
                            attached = True
                        except Exception as attach_err:
                            print(f"Failed to attach loan approval proof file: {str(attach_err)}")
                        if not attached and proof_of_transfer:
                            try:
                                with urlopen(proof_of_transfer) as response:
                                    remote_bytes = response.read()
                                remote_name = os.path.basename(saved_path) or 'proof_of_transfer'
                                remote_mime = mimetypes.guess_type(remote_name)[0] or 'application/octet-stream'
                                msg.attach(remote_name, remote_bytes, remote_mime)
                                attached = True
                            except Exception as url_attach_err:
                                print(f"Failed to attach loan approval proof file from URL: {str(url_attach_err)}")

                    msg.send(fail_silently=True)
                except Exception as e:
                    print(f"Failed to send member approval notification: {str(e)}")
                
                # Trigger ML Training in background (optional, but requested 'every data masuk')
                try:
                    trigger_model_training()
                except Exception as e:
                    print(f"ML Training failed: {str(e)}")
                
            return Response({'message': 'Pinjaman berhasil disetujui dan cicilan berhasil dibuat'})
        except Exception as e:
            return Response({'error': str(e)}, status=400)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        try:
            application = self.get_object()
            reject_reason = request.data.get('reject_reason', 'No reason provided')
            
            admin_user_id = request.data.get('admin_id', request.user.id or 1)
            
            with connection.cursor() as cursor:
                cursor.execute(
                    "UPDATE loan_applications SET status_id = %s, reject_reason = %s, admin_id = %s WHERE id = %s",
                    [24, reject_reason, admin_user_id, application.id]
                )
            
            # Notify Member about rejection
            try:
                member_email = application.member.user.email
                member_name = application.member.full_name

                subject = "Pembaruan Pengajuan Pinjaman"
                html_message = _build_email_html(
                    'Pembaruan Pengajuan Pinjaman',
                    f'Halo {member_name}, kami telah meninjau pengajuan pinjaman Anda dan pengajuan tersebut ditolak.',
                    details=[
                        ('Alasan', reject_reason),
                    ],
                    highlight=('Status', 'Ditolak'),
                    footer_note='Jika Anda memiliki pertanyaan, silakan hubungi pengurus koperasi.'
                )
                msg = EmailMultiAlternatives(
                    subject,
                    strip_tags(html_message),
                    settings.DEFAULT_FROM_EMAIL,
                    [member_email]
                )
                msg.attach_alternative(html_message, 'text/html')
                msg.send(fail_silently=True)
            except Exception as e:
                print(f"Failed to send member rejection notification: {str(e)}")

            return Response({'message': 'Pengajuan pinjaman berhasil ditolak', 'admin_id_updated': admin_user_id})
        except Exception as e:
            return Response({'error': str(e)}, status=400)

    @action(detail=False, methods=['get'])
    def pending_summary(self, request):
        member_id = request.query_params.get('member_id', 1)

        query = """
        SELECT 
            la.id,
            lt.name AS type_name,
            la.amount_requested,
            la.purpose,
            la.applied_at,
            la.duration_months,
            la.salary_statement_file,
            s.status_code
        FROM loan_applications la
        INNER JOIN loan_types lt
            ON la.loan_type_id = lt.id
        INNER JOIN statuses s 
            ON s.id = la.status_id 
        WHERE la.status_id = 21 
          AND la.member_id = %s;
        """
        
        with connection.cursor() as cursor:
            cursor.execute(query, [member_id])
            columns = [col[0] for col in cursor.description]
            results = [dict(zip(columns, row)) for row in cursor.fetchall()]
            
        for r in results:
            if isinstance(r, dict) and 'salary_statement_file' in r:
                r['salary_statement_file'] = get_absolute_media_url(request, r['salary_statement_file'])
        return Response(results)

    @action(detail=False, methods=['get'])
    def rejected_summary(self, request):
        member_id = request.query_params.get('member_id', 1)

        query = """
        SELECT 
            la.id,
            lt.name AS type_name,
            la.amount_requested,
            la.purpose,
            la.applied_at,
            la.duration_months,
            la.reject_reason,
            la.salary_statement_file,
            la.updated_at AS admin_update
        FROM loan_applications la
        INNER JOIN loan_types lt
            ON la.loan_type_id = lt.id
        WHERE la.status_id = 24 
          AND la.member_id = %s;
        """
        
        with connection.cursor() as cursor:
            cursor.execute(query, [member_id])
            columns = [col[0] for col in cursor.description]
            results = [dict(zip(columns, row)) for row in cursor.fetchall()]
            
        for r in results:
            if isinstance(r, dict) and 'salary_statement_file' in r:
                r['salary_statement_file'] = get_absolute_media_url(request, r['salary_statement_file'])
        return Response(results)
        
        
class LoanTypeViewSet(viewsets.ModelViewSet):
    queryset = LoanType.objects.filter(deleted_at__isnull=True).order_by('id')
    serializer_class = LoanTypeSerializer

    def perform_create(self, serializer):
        serializer.save(created_at=timezone.now(), updated_at=timezone.now())

    def perform_update(self, serializer):
        serializer.save(updated_at=timezone.now())

    def perform_destroy(self, instance):
        instance.deleted_at = timezone.now()
        instance.save()

def sync_member_pending_payments(member_id):
    from django.db import connection
    import requests
    import base64
    from django.conf import settings
    from datetime import date

    member_name = ''
    member_email = ''

    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT m.full_name, u.email
            FROM members m
            LEFT JOIN users u ON u.id = m.user_id
            WHERE m.id = %s
            LIMIT 1
            """,
            [member_id],
        )
        member_row = cursor.fetchone()
        if member_row:
            member_name = member_row[0] or ''
            member_email = member_row[1] or ''
    
    query = """
        SELECT DISTINCT pgt.id AS pgt_id, pgt.gateway_transaction_id AS order_id
        FROM payment_gateway_transactions pgt
        LEFT JOIN loan_payments lp ON CAST(pgt.id AS varchar) = lp.payment_reference_id
        LEFT JOIN loan_installments li ON li.id = lp.installment_id
        LEFT JOIN loans l ON l.id = li.loan_id
        LEFT JOIN saving_transactions st ON CAST(pgt.id AS varchar) = st.payment_reference_id
        WHERE (l.member_id = %s OR st.member_id = %s) AND pgt.gateway_status = 'pending'
    """
    with connection.cursor() as cursor:
        cursor.execute(query, [member_id, member_id])
        results = [dict(zip([col[0] for col in cursor.description], row)) for row in cursor.fetchall()]

    if not results:
        return

    server_key = settings.MIDTRANS_SERVER_KEY
    is_production = settings.MIDTRANS_IS_PRODUCTION
    auth_str = f"{server_key}:"
    auth_base64 = base64.b64encode(auth_str.encode('utf-8')).decode('utf-8')
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": f"Basic {auth_base64}"
    }

    for r in results:
        order_id = r.get('order_id')
        pgt_id = r.get('pgt_id')
        if not order_id: continue
        status_url = f"https://api.midtrans.com/v2/{order_id}/status" if is_production else f"https://api.sandbox.midtrans.com/v2/{order_id}/status"
        try:
            res = requests.get(status_url, headers=headers, timeout=5)
            if res.status_code == 200:
                midtrans_status = res.json().get('transaction_status')
                if midtrans_status in ['expire', 'cancel', 'deny', 'failure']:
                    with connection.cursor() as cursor:
                        cursor.execute("UPDATE payment_gateway_transactions SET gateway_status = %s, updated_at = NOW() WHERE id = %s", [midtrans_status, pgt_id])
                        status_id = 36 if midtrans_status == 'cancel' else 35
                        cursor.execute("UPDATE loan_payments SET status_id = %s, updated_at = NOW() WHERE payment_reference_id = %s", [status_id, str(pgt_id)])
                        cursor.execute("UPDATE saving_transactions SET status_id = %s, updated_at = NOW() WHERE payment_reference_id = %s", [status_id, str(pgt_id)])
                elif midtrans_status in ['settlement', 'capture']:
                    with connection.cursor() as cursor:
                        cursor.execute("UPDATE payment_gateway_transactions SET gateway_status = %s, updated_at = NOW() WHERE id = %s", [midtrans_status, pgt_id])
                        
                        # 1. Process Loan Payments
                        cursor.execute("SELECT id FROM loan_payments WHERE payment_reference_id = %s AND status_id = 32", [str(pgt_id)])
                        loan_payments = cursor.fetchall()
                        for lp_row in loan_payments:
                            cursor.execute("CALL sp_loan_gateway_payment(%s, %s)", [lp_row[0], midtrans_status])
                            
                        # 2. Process Saving Payments
                        cursor.execute("""
                            SELECT id, saving_type_id, amount, COALESCE(admin_fee, 0)
                            FROM saving_transactions
                            WHERE payment_reference_id = %s AND status_id = 32
                        """, [str(pgt_id)])
                        saving_txs = cursor.fetchall()
                        for stx_row in saving_txs:
                            cursor.execute("CALL sp_savings_gateway_payment(%s, %s)", [stx_row[0], midtrans_status])

                            saving_transaction_id = stx_row[0]
                            saving_type_id = int(stx_row[1] or 0)
                            principal_amount = int(stx_row[2] or 0)
                            admin_fee = int(stx_row[3] or 0)

                            if saving_type_id == 3:
                                cursor.execute(
                                    """
                                    UPDATE members m
                                    SET 
                                        member_status_id = 8,
                                        updated_at = NOW()
                                    FROM users u
                                    WHERE m.user_id = u.id
                                    AND u.email = %s
                                    AND COALESCE(m.member_status_id, 0) <> 6;
                                    """,
                                    [member_email],
                                )

                                cursor.execute(
                                    """
                                    UPDATE registrations
                                    SET 
                                        status_id = 7,
                                        updated_at = NOW()
                                    WHERE email = %s
                                    AND COALESCE(status_id, 0) <> 7;
                                    """,
                                    [member_email],
                                )

                                admin_email = getattr(settings, 'ADMIN_EMAIL', None) or getattr(settings, 'DEFAULT_FROM_EMAIL', None)
                                if admin_email:
                                    subject = f'Simpanan Pokok Dibayar - {member_name or member_id}'
                                    try:
                                        from api.utils.email import send_styled_email
                                        send_styled_email(
                                            subject=subject,
                                            recipient=admin_email,
                                            intro=f"Halo Admin, {member_name or 'Seorang anggota'} telah menyelesaikan pembayaran simpanan pokok.",
                                            details=[
                                                ('Anggota', member_name or '-'),
                                                ('Email', member_email or '-'),
                                                ('Jumlah Simpanan Pokok', f"Rp {principal_amount:,.0f}"),
                                                ('Biaya Admin', f"Rp {admin_fee:,.0f}"),
                                            ],
                                            footer_note="Status registrasi telah diperbarui menjadi aktif."
                                        )
                                    except Exception:
                                        pass
        except Exception as e:
            pass

    
class LoanViewSet(viewsets.ModelViewSet):
    serializer_class = LoanSerializer

    def get_queryset(self):
        if self.request.user.is_authenticated and hasattr(self.request.user, 'member'):
            return Loan.objects.filter(member_id=self.request.user.member)
        return Loan.objects.all()

    @action(detail=False, methods=['get'])
    def active_summary(self, request):
        member_id = request.query_params.get('member_id', 1)
        sync_member_pending_payments(member_id)

        query = """
        SELECT 
            la.id AS loan_application_id,
            l.id AS loan_id,
            l.status_id,
            l.remaining_balance,
            l.principal_amount,
            l.start_date,
            la.purpose,
            la.admin_update,
            la.salary_statement_file,
            (l.interest_amount / NULLIF(l.principal_amount, 0)) * 100 AS bunga,
            li_summary.total_installment,
            li_summary.paid_installment,
            (li_summary.total_installment - li_summary.paid_installment) AS remaining_installment,
            ni.id AS next_installment_id,
            ni.amount_total AS next_installment_balance,
            ni.due_date AS next_installment_due_date,
            lt.name AS type_name
        FROM loans l
        JOIN loan_applications la ON l.application_id = la.id
        LEFT JOIN loan_types lt ON la.loan_type_id = lt.id
        LEFT JOIN (
            SELECT 
                li.loan_id,
                COUNT(*) AS total_installment,
                SUM(CASE WHEN li.status_id = 29 THEN 1 ELSE 0 END) AS paid_installment
            FROM loan_installments li
            GROUP BY li.loan_id
        ) li_summary ON li_summary.loan_id = l.id
        LEFT JOIN LATERAL (
            SELECT li2.id, li2.amount_total, li2.due_date
            FROM loan_installments li2
            WHERE li2.loan_id = l.id
              AND li2.status_id = 28
            ORDER BY li2.id ASC
            LIMIT 1
        ) ni ON TRUE
        WHERE l.member_id = %s 
          AND l.status_id = 25;
        """
        
        with connection.cursor() as cursor:
            cursor.execute(query, [member_id])
            columns = [col[0] for col in cursor.description]
            results = [dict(zip(columns, row)) for row in cursor.fetchall()]
            
        for r in results:
            if isinstance(r, dict) and 'salary_statement_file' in r:
                r['salary_statement_file'] = get_absolute_media_url(request, r['salary_statement_file'])
        return Response(results)

    @action(detail=False, methods=['get'])
    def completed_summary(self, request):
        member_id = request.query_params.get('member_id', 1)

        query = """
        SELECT 
            la.id AS loan_application_id,
            l.id AS loan_id,
            l.status_id,
            l.remaining_balance,
            l.principal_amount,
            l.start_date,
            la.purpose,
            la.admin_update,
            la.salary_statement_file,
            (l.interest_amount / NULLIF(l.principal_amount, 0)) * 100 AS bunga,
            li_summary.total_installment,
            li_summary.paid_installment,
            (li_summary.total_installment - li_summary.paid_installment) AS remaining_installment,
            ni.id AS next_installment_id,
            ni.amount_total AS next_installment_balance,
            lt.name AS type_name,
            last_payment.payment_date AS last_payment_date
        FROM loans l
        JOIN loan_applications la ON l.application_id = la.id
        LEFT JOIN loan_types lt ON la.loan_type_id = lt.id
        LEFT JOIN (
            SELECT 
                li.loan_id,
                COUNT(*) AS total_installment,
                SUM(CASE WHEN li.status_id in (29,30) THEN 1 ELSE 0 END) AS paid_installment
            FROM loan_installments li
            GROUP BY li.loan_id
        ) li_summary ON li_summary.loan_id = l.id
        LEFT JOIN LATERAL (
            SELECT li2.id, li2.amount_total
            FROM loan_installments li2
            WHERE li2.loan_id = l.id
              AND li2.status_id = 28
            ORDER BY li2.id ASC
            LIMIT 1
        ) ni ON TRUE
        LEFT JOIN LATERAL (
            SELECT lp.payment_date
            FROM loan_payments lp
            JOIN loan_installments li3 ON li3.id = lp.installment_id
            WHERE li3.loan_id = l.id
            ORDER BY lp.payment_date DESC
            LIMIT 1
        ) last_payment ON TRUE
        WHERE l.member_id = %s 
          AND l.status_id = 26;
        """
        
        with connection.cursor() as cursor:
            cursor.execute(query, [member_id])
            columns = [col[0] for col in cursor.description]
            results = [dict(zip(columns, row)) for row in cursor.fetchall()]
        for r in results:
            if isinstance(r, dict) and 'salary_statement_file' in r:
                r['salary_statement_file'] = get_absolute_media_url(request, r['salary_statement_file'])
        return Response(results)

    # @action(detail=True, methods=['get'])
    # def schedule(self, request, pk=None):
    #     member_id = 1 # default for testing
    #     if request.user.is_authenticated and hasattr(request.user, 'member'):
    #         member_id = request.user.member.id

    #     query = """
    #     SELECT  
    #         li.installment_number, 
    #         li.due_date, 
    #         li.amount_principal, 
    #         li.amount_interest, 
    #         li.amount_total, 
    #         s.status_code  
    #     FROM loan_installments li 
    #     INNER JOIN loans la ON la.id = li.loan_id 
    #     INNER JOIN statuses s ON s.id = li.status_id 
    #     WHERE la.member_id = %s AND la.id = %s 
    #     ORDER BY li.installment_number ASC;
    #     """
        
    #     with connection.cursor() as cursor:
    #         cursor.execute(query, [member_id, pk])
    #         columns = [col[0] for col in cursor.description]
    #         results = [dict(zip(columns, row)) for row in cursor.fetchall()]
            
    #     return Response(results)

    @action(detail=True, methods=['get'])
    def schedule(self, request, pk=None):
        query = """
        SELECT  
            li.id,
            li.installment_number, 
            li.due_date, 
            li.amount_principal, 
            li.amount_interest, 
            li.amount_total, 
            COALESCE(s.status_code, 'UNPAID') as status_code,
            NULL as payment_proof
        FROM loan_installments li 
        LEFT JOIN statuses s ON s.id = li.status_id 
        WHERE li.loan_id = %s
        ORDER BY li.installment_number ASC;
        """
        params = [pk]
        
        with connection.cursor() as cursor:
            cursor.execute(query, params)
            columns = [col[0] for col in cursor.description]
            results = [dict(zip(columns, row)) for row in cursor.fetchall()]
            
        return Response(results)

    @action(detail=True, methods=['get'])
    def payment_invoice(self, request, pk=None):
        # 1. Query for any PENDING payment for this loan
        query = """
        SELECT  
            pm.name AS payment_method,
            pgt.gateway_status,
            lp.amount_paid,
            lp.payment_date,
            li.installment_number,
            l.member_id,
            s.status_code,
            pgt.callback_raw_data AS raw_gateway_data,
            pgt.gateway_transaction_id AS order_id,
            lp.id AS payment_id,
            pgt.id AS pgt_id
        FROM loan_payments lp
        INNER JOIN statuses s ON s.id = lp.status_id 
        JOIN payment_methods pm ON pm.id = lp.payment_method_id
        JOIN loan_installments li ON li.id = lp.installment_id
        JOIN loans l ON l.id = li.loan_id
        LEFT JOIN payment_gateway_transactions pgt ON CAST(pgt.id AS varchar) = lp.payment_reference_id
        WHERE l.id = %s AND s.status_code = 'PENDING'
        """
        params = [pk]
        if not is_user_admin(request.user):
            member_id = request.query_params.get('member_id', 1)
            query += " AND l.member_id = %s"
            params.append(member_id)

        with connection.cursor() as cursor:
            cursor.execute(query, params)
            columns = [col[0] for col in cursor.description]
            results = [dict(zip(columns, row)) for row in cursor.fetchall()]

        # Verify live status with Midtrans API to filter out expired transactions
        import requests
        import base64
        import json
        
        server_key = settings.MIDTRANS_SERVER_KEY
        is_production = settings.MIDTRANS_IS_PRODUCTION
        auth_str = f"{server_key}:"
        auth_bytes = auth_str.encode('utf-8')
        auth_base64 = base64.b64encode(auth_bytes).decode('utf-8')
        
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": f"Basic {auth_base64}"
        }
        
        valid_results = []
        for r in results:
            order_id = r.get('order_id')
            if order_id:
                status_url = f"https://api.midtrans.com/v2/{order_id}/status" if is_production else f"https://api.sandbox.midtrans.com/v2/{order_id}/status"
                try:
                    res = requests.get(status_url, headers=headers, timeout=5)
                    if res.status_code == 200:
                        midtrans_status = res.json().get('transaction_status')
                        if midtrans_status in ['expire', 'cancel', 'deny', 'failure']:
                            # Update records to reflect the failure/expiration
                            with connection.cursor() as cursor:
                                cursor.execute("UPDATE payment_gateway_transactions SET gateway_status = %s, updated_at = NOW() WHERE id = %s", [midtrans_status, r['pgt_id']])
                                status_id = 36 if midtrans_status == 'cancel' else 35
                                cursor.execute("UPDATE loan_payments SET status_id = %s, updated_at = NOW() WHERE id = %s", [status_id, r['payment_id']])
                            continue
                        elif midtrans_status in ['settlement', 'capture']:
                            # Settle the payment in database using Stored Procedure!
                            with connection.cursor() as cursor:
                                cursor.execute("CALL sp_loan_gateway_payment(%s, %s)", [r['payment_id'], midtrans_status])
                            continue
                except:
                    pass
            
            # Parse snap_token if stored inside raw_gateway_data
            snap_token = None
            if r.get('raw_gateway_data'):
                try:
                    snap_token = json.loads(r['raw_gateway_data']).get('snap_token')
                except:
                    pass
            r['snap_token'] = snap_token
            valid_results.append(r)
            
        results = valid_results
            
        # 2. If no pending payment, query the earliest unpaid installment
        if not results:
            unpaid_query = """
            SELECT 
                'GATEWAY' AS payment_method,
                'PENDING' AS gateway_status,
                li.amount_total AS amount_paid,
                NULL AS payment_date,
                li.installment_number,
                l.member_id,
                'UNPAID' AS status_code,
                NULL AS snap_token
            FROM loan_installments li
            JOIN loans l ON l.id = li.loan_id
            WHERE l.id = %s AND li.status_id IN (28, 30)
            """
            unpaid_params = [pk]
            if not is_user_admin(request.user):
                member_id = request.query_params.get('member_id', 1)
                unpaid_query += " AND l.member_id = %s"
                unpaid_params.append(member_id)
                
            unpaid_query += " ORDER BY li.installment_number ASC LIMIT 1"
            
            with connection.cursor() as cursor:
                cursor.execute(unpaid_query, unpaid_params)
                columns = [col[0] for col in cursor.description]
                results = [dict(zip(columns, row)) for row in cursor.fetchall()]
                
        return Response(results)

    @action(detail=False, methods=['get'])
    def payment_channels(self, request):
        """
        List all active payment channels and their master fees.
        """
        with connection.cursor() as cursor:
            cursor.execute("SELECT channel_code, channel_name, fee_percentage, fee_fixed FROM payment_channels WHERE is_active = TRUE ORDER BY id ASC")
            columns = [col[0] for col in cursor.description]
            results = [dict(zip(columns, row)) for row in cursor.fetchall()]

        # Convert Decimal values to float for JSON serialization
        for r in results:
            if r.get('fee_percentage') is not None:
                try:
                    r['fee_percentage'] = float(r['fee_percentage'])
                except Exception:
                    pass
            if r.get('fee_fixed') is not None:
                try:
                    r['fee_fixed'] = float(r['fee_fixed'])
                except Exception:
                    pass
        return Response(results)

    @action(detail=True, methods=['post'])
    def create_payment_token(self, request, pk=None):
        import requests
        import base64
        import json
        
        server_key = settings.MIDTRANS_SERVER_KEY
        is_production = settings.MIDTRANS_IS_PRODUCTION
        
        auth_str = f"{server_key}:"
        auth_bytes = auth_str.encode('utf-8')
        auth_base64 = base64.b64encode(auth_bytes).decode('utf-8')
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": f"Basic {auth_base64}"
        }
        
        # Block if member has pending close account request
        if not is_user_admin(request.user):
            member_id = request.query_params.get('member_id', 1)
            with connection.cursor() as cursor:
                cursor.execute("SELECT COUNT(*) FROM close_account_requests WHERE member_id = %s AND status_id = 44 AND deleted_at IS NULL", [member_id])
                if cursor.fetchone()[0] > 0:
                    return Response({'error': 'Akun Anda sedang dalam proses penutupan. Pembayaran tidak dapat dilakukan.'}, status=400)

        # 1. Get the earliest unpaid installment for this loan
        query_installment = """
        SELECT li.id, li.amount_total, li.installment_number
        FROM loan_installments li
        JOIN loans l ON l.id = li.loan_id
        WHERE l.id = %s AND li.status_id IN (28, 30)
        """
        params = [pk]
        if not is_user_admin(request.user):
            member_id = request.query_params.get('member_id', 1)
            query_installment += " AND l.member_id = %s"
            params.append(member_id)
            
        query_installment += " ORDER BY li.installment_number ASC LIMIT 1"
        
        with connection.cursor() as cursor:
            cursor.execute(query_installment, params)
            row = cursor.fetchone()
            
        if not row:
            return Response({'error': 'No unpaid installments found for this loan.'}, status=400)
            
        installment_id, amount_total, installment_number = row
        
        # Determine dynamic fee SECURELY from database master data
        payment_type = request.data.get('payment_type')
        fee_percentage = 0.0
        fee_fixed = 0.0
        
        if payment_type:
            with connection.cursor() as cursor:
                cursor.execute("SELECT fee_percentage, fee_fixed FROM payment_channels WHERE channel_code = %s AND is_active = TRUE", [payment_type])
                channel_row = cursor.fetchone()
                if channel_row:
                    fee_percentage = float(channel_row[0])
                    fee_fixed = float(channel_row[1])
        
        admin_fee = int((float(amount_total) * fee_percentage) / 100) + int(fee_fixed)
        gross_amount = int(amount_total) + admin_fee
        
        # 2. Check if a PENDING loan payment already exists for this installment
        check_pending = """
        SELECT pgt.callback_raw_data, pgt.gateway_transaction_id, lp.id, pgt.id
        FROM loan_payments lp
        JOIN payment_gateway_transactions pgt ON CAST(pgt.id AS varchar) = lp.payment_reference_id
        WHERE lp.installment_id = %s AND lp.status_id = 32
        LIMIT 1
        """
        with connection.cursor() as cursor:
            cursor.execute(check_pending, [installment_id])
            existing = cursor.fetchone()
            
        if existing:
            raw_data, order_id, payment_id, pgt_id = existing
            
            # Verify live status with Midtrans
            is_expired = False
            if order_id:
                status_url = f"https://api.midtrans.com/v2/{order_id}/status" if is_production else f"https://api.sandbox.midtrans.com/v2/{order_id}/status"
                try:
                    res = requests.get(status_url, headers=headers, timeout=5)
                    if res.status_code == 200:
                        midtrans_status = res.json().get('transaction_status')
                        if midtrans_status in ['expire', 'cancel', 'deny', 'failure']:
                            with connection.cursor() as cursor:
                                cursor.execute("UPDATE payment_gateway_transactions SET gateway_status = %s, updated_at = NOW() WHERE id = %s", [midtrans_status, pgt_id])
                                status_id = 36 if midtrans_status == 'cancel' else 35
                                cursor.execute("UPDATE loan_payments SET status_id = %s, updated_at = NOW() WHERE id = %s", [status_id, payment_id])
                            is_expired = True
                        elif midtrans_status in ['settlement', 'capture']:
                            with connection.cursor() as cursor:
                                cursor.execute("UPDATE payment_gateway_transactions SET gateway_status = %s, updated_at = NOW() WHERE id = %s", [midtrans_status, pgt_id])
                                cursor.execute("UPDATE loan_payments SET status_id = 34, payment_date = NOW(), updated_at = NOW() WHERE id = %s", [payment_id])
                                cursor.execute("UPDATE loan_installments SET status_id = 29, updated_at = NOW() WHERE id = %s", [installment_id])
                                cursor.execute("""
                                    UPDATE loans
                                    SET
                                        remaining_balance = GREATEST(remaining_balance - %s, 0),
                                        status_id = CASE
                                            WHEN (remaining_balance - %s) <= 0 AND NOT EXISTS (
                                                SELECT 1 FROM loan_installments li
                                                WHERE li.loan_id = %s AND li.status_id = 28
                                            ) THEN 26
                                            ELSE 25
                                        END,
                                        updated_at = NOW()
                                    WHERE id = %s
                                """, [amount_total, amount_total, pk, pk])
                            return Response({'error': 'This installment has already been paid successfully.'}, status=400)
                except:
                    pass
                    
            if not is_expired:
                if request.data.get('payment_type'):
                    # Invalidate old token locally to generate a new one with correct fee/method
                    with connection.cursor() as cursor:
                        cursor.execute("UPDATE payment_gateway_transactions SET gateway_status = 'cancel', updated_at = NOW() WHERE id = %s", [pgt_id])
                        cursor.execute("UPDATE loan_payments SET status_id = 36, updated_at = NOW() WHERE id = %s", [payment_id])
                else:
                    snap_token = None
                    if raw_data:
                        try:
                            snap_token = json.loads(raw_data).get('snap_token')
                        except:
                            pass
                    if snap_token:
                        return Response({
                            'snap_token': snap_token,
                            'order_id': order_id,
                            'amount': gross_amount
                        })
            
        # 3. Create a new transaction with Midtrans Snap API
        order_id = f"KOP-LOAN-{pk}-{installment_number}-{int(timezone.now().timestamp())}"
        
        url = "https://app.midtrans.com/snap/v1/transactions" if is_production else "https://app.sandbox.midtrans.com/snap/v1/transactions"
        
        # Determine customer first name and email from the loan's member data
        first_name = ""
        email = ""
        
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT m.full_name, u.email, 
                FROM loans l
                inner join members m on l.member_id = m.id
                inner join users u on m.user_id = u.id
                WHERE l.id = %s
            """, [pk])
            member_row = cursor.fetchone()
            if member_row:
                first_name = member_row[0] or first_name
                email = member_row[1] or email
                
        item_details = [
            {
                "id": f"INST-{installment_id}",
                "price": int(amount_total),
                "quantity": 1,
                "name": f"Cicilan Pinjaman ke-{installment_number}"
            }
        ]
        
        if admin_fee > 0:
            fee_label = f"Biaya Layanan ({fee_percentage}%)" if fee_percentage > 0 else "Biaya Layanan"
            item_details.append({
                "id": "FEE-ADMIN",
                "price": admin_fee,
                "quantity": 1,
                "name": fee_label
            })
            
        payload = {
            "transaction_details": {
                "order_id": order_id,
                "gross_amount": gross_amount
            },
            "item_details": item_details,
            "customer_details": {
                "first_name": first_name,
                "email": email
            }
        }
        
        if payment_type:
            mapping = {
                'qris': ['other_qris'],
                'gopay': ['gopay'],
                'shopeepay': ['shopeepay'],
                'dana': ['other_qris'],
            }
            payload["enabled_payments"] = mapping.get(payment_type, [payment_type])
        
        try:
            response = requests.post(url, json=payload, headers=headers)
            res_data = response.json()
            
            if response.status_code != 201:
                error_msg = res_data.get('error_messages', ['Failed to create transaction with Midtrans'])[0]
                return Response({'error': error_msg}, status=400)
                
            snap_token = res_data['token']
            redirect_url = res_data['redirect_url']
            
            # Save snap token in callback_raw_data field
            raw_data = json.dumps({"snap_token": snap_token})
            
            # 4. Save to Database (payment_gateway_transactions & loan_payments)
            with connection.cursor() as cursor:
                # Insert into payment_gateway_transactions
                # payable_type_id = 2 (loan_payment)
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
                
                # Insert into loan_payments
                # payment_method_id = 1 (GATEWAY)
                # status_id = 32 (PENDING)
                cursor.execute("""
                    INSERT INTO loan_payments (
                        installment_id,
                        amount_paid,
                        admin_fee,
                        payment_date,
                        payment_method_id,
                        payment_reference_id,
                        status_id,
                        created_at,
                        updated_at
                    ) VALUES (%s, %s, %s, NOW(), %s, %s, %s, NOW(), NOW())
                """, [installment_id, amount_total, admin_fee, 1, pgt_id, 32])
                
            return Response({
                'snap_token': snap_token,
                'redirect_url': redirect_url,
                'order_id': order_id,
                'amount': gross_amount
            })
            
        except Exception as e:
            return Response({'error': f"Connection to Midtrans failed: {str(e)}"}, status=500)

    @action(detail=True, methods=['get'])
    def receipts(self, request, pk=None):
        query = """
        SELECT  
            pm.name AS payment_method,
            pgt.gateway_status,
            lp.amount_paid,
            COALESCE(lp.admin_fee, 0) AS admin_fee,
            lp.payment_date,
            li.installment_number,
            l.member_id,
            s.status_code,
            lp.id
        FROM loan_payments lp
        INNER JOIN statuses s ON s.id = lp.status_id 
        JOIN payment_methods pm ON pm.id = lp.payment_method_id
        JOIN loan_installments li ON li.id = lp.installment_id
        JOIN loans l ON l.id = li.loan_id
        LEFT JOIN payment_gateway_transactions pgt ON CAST(pgt.id AS varchar) = lp.payment_reference_id
        WHERE l.id = %s
        """
        params = [pk]

        if not is_user_admin(request.user):
            member_id = request.query_params.get('member_id', 1)
            query += " AND l.member_id = %s"
            params.append(member_id)

        with connection.cursor() as cursor:
            cursor.execute(query, params)
            columns = [col[0] for col in cursor.description]
            results = [dict(zip(columns, row)) for row in cursor.fetchall()]
            
        return Response(results)

    @action(detail=False, methods=['get'])
    def admin_dashboard_stats(self, request):
        pending_query = """
        SELECT COUNT(id) as submit_application FROM loan_applications WHERE status_id=21
        """
        
        loans_query = """
        SELECT 
            SUM(l.remaining_balance) AS total_outstanding,
            SUM(l.principal_amount) AS active_borrowers,
            SUM(CASE 
                WHEN li.status_id = 29 THEN li.amount_interest
                ELSE 0
            END) AS interest_achieved
        FROM loans l
        INNER JOIN loan_installments li 
            ON li.loan_id = l.id 
        WHERE l.status_id = 25;
        """
        
        # Trend analytics query
        trend_query = """
        SELECT
            -- Interest Trends
            (SELECT COALESCE(SUM(amount_interest), 0) FROM loan_installments WHERE status_id = 29 AND DATE_TRUNC('month', updated_at) = DATE_TRUNC('month', CURRENT_DATE)) as int_curr,
            (SELECT COALESCE(SUM(amount_interest), 0) FROM loan_installments WHERE status_id = 29 AND DATE_TRUNC('month', updated_at) = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')) as int_prev,
            
            -- Outstanding Trends
            (SELECT COALESCE(SUM(remaining_balance), 0) FROM loans WHERE status_id = 25) as out_curr,
            (
                (SELECT COALESCE(SUM(remaining_balance), 0) FROM loans WHERE status_id = 25) + 
                (SELECT COALESCE(SUM(amount_paid), 0) FROM loan_payments WHERE DATE_TRUNC('month', payment_date) = DATE_TRUNC('month', CURRENT_DATE)) - 
                (SELECT COALESCE(SUM(principal_amount), 0) FROM loans WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE))
            ) as out_prev,
            
            -- Borrowers Trends (Principal sum)
            (SELECT COALESCE(SUM(principal_amount), 0) FROM loans WHERE status_id = 25) as bor_curr,
            (SELECT COALESCE(SUM(principal_amount), 0) FROM loans WHERE status_id = 25 AND created_at < DATE_TRUNC('month', CURRENT_DATE)) as bor_prev
        """

        # Current month installment query
        current_month_query = """
        SELECT SUM(li.amount_total) 
        FROM loan_installments li 
        WHERE li.status_id = 28 AND li.due_date = %s
        """
        
        import datetime
        today = datetime.date.today()
        if today.day <= 25:
            current_period_due_date = datetime.date(today.year, today.month, 25)
        else:
            if today.month == 12:
                current_period_due_date = datetime.date(today.year + 1, 1, 25)
            else:
                current_period_due_date = datetime.date(today.year, today.month + 1, 25)
                
        def calculate_trend(curr, prev):
            if not prev or prev == 0:
                return "+0.0%" if not curr or curr == 0 else "+100.0%"
            change = ((float(curr) - float(prev)) / float(prev)) * 100
            return f"{'+' if change >= 0 else ''}{change:.1f}%"

        with connection.cursor() as cursor:
            cursor.execute(pending_query)
            pending_row = cursor.fetchone()
            submit_application = pending_row[0] if pending_row and pending_row[0] else 0
            
            cursor.execute(loans_query)
            loans_row = cursor.fetchone()
            total_outstanding = loans_row[0] if loans_row and loans_row[0] else 0
            active_borrowers = loans_row[1] if loans_row and loans_row[1] else 0
            interest_achieved = loans_row[2] if loans_row and loans_row[2] else 0

            cursor.execute(trend_query)
            trend_row = cursor.fetchone()
            # [int_curr, int_prev, out_curr, out_prev, bor_curr, bor_prev]
            interest_trend = calculate_trend(trend_row[0], trend_row[1])
            outstanding_trend = calculate_trend(trend_row[2], trend_row[3])
            borrowers_trend = calculate_trend(trend_row[4], trend_row[5])
            
            cursor.execute(current_month_query, [current_period_due_date])
            current_month_row = cursor.fetchone()
            current_month_installment = current_month_row[0] if current_month_row and current_month_row[0] else 0
            
        data = {
            'pending_approvals': submit_application,
            'total_outstanding': total_outstanding,
            'outstanding_trend': outstanding_trend,
            'active_borrowers': active_borrowers,
            'borrowers_trend': borrowers_trend,
            'interest_achieved': interest_achieved,
            'interest_trend': interest_trend,
            'current_month_installment': current_month_installment
        }
        return Response(data)

    @action(detail=False, methods=['get'])
    def transaction_history(self, request):
        """
        Combined transaction history from savings, withdrawals, and loan payments.
        """
        member_name = request.query_params.get('member_name', '')
        transaction_type = request.query_params.get('transaction_type', '')
        start_date = request.query_params.get('start_date', '')
        end_date = request.query_params.get('end_date', '')
        query = f"""
        SELECT *
            FROM (

                ----------------------------------------------------------------
                -- SAVING TRANSACTIONS
                ----------------------------------------------------------------
                SELECT 
                    st.transaction_date AS transaction_date,
                    m.full_name,
                    tt.name AS transaction_type,
                    pm.name AS payment_method,
                    st.amount,
                    s.status_code AS status,
                    CASE 
                        WHEN pm.name = 'GATEWAY' THEN COALESCE(pgt.gateway_transaction_id, st.payment_reference_id)
                        ELSE st.payment_reference_id
                    END AS reference_number

                FROM saving_transactions st

                INNER JOIN members m
                    ON m.id = st.member_id

                INNER JOIN transaction_types tt
                    ON tt.id = st.transaction_type_id

                INNER JOIN payment_methods pm
                    ON pm.id = st.payment_method_id

                INNER JOIN statuses s
                    ON s.id = st.status_id

                LEFT JOIN manual_payments mp
                    ON pm.name = 'MANUAL'
                AND mp.payment_reference_id = st.payment_reference_id

                LEFT JOIN payment_gateway_transactions pgt
                    ON pm.name = 'GATEWAY'
                AND CAST(pgt.id AS VARCHAR) = st.payment_reference_id


                UNION ALL


                ----------------------------------------------------------------
                -- WITHDRAWALS
                ----------------------------------------------------------------
                SELECT 
                    w.request_date AS transaction_date,
                    m.full_name,
                    'WITHDRAWAL' AS transaction_type,
                    pm.name AS payment_method,
                    w.amount,
                    s.status_code AS status,
                    w.payment_reference_id AS reference_number

                FROM withdrawals w

                INNER JOIN members m
                    ON m.id = w.member_id

                INNER JOIN payment_methods pm
                    ON pm.id = w.payment_method_id

                INNER JOIN statuses s
                    ON s.id = w.status_id

                LEFT JOIN manual_payments mp
                    ON pm.name = 'MANUAL'
                AND mp.payment_reference_id = w.payment_reference_id


                UNION ALL

                            
                ----------------------------------------------------------------
                -- SHU DISTRIBUTION
                ----------------------------------------------------------------
                 SELECT
                    COALESCE(w.paid_at, w.created_at) AS transaction_date,
                    m.full_name,
                    'SHU DISTRIBUTION' AS transaction_type,
                    'MANUAL TRANSFER' AS payment_method,
                    w.total_shu AS amount,
                    CASE WHEN w.status_shu = TRUE THEN 'COMPLETED' ELSE 'UNPAID' END AS status,
                    w.tf_reference_id AS reference_number

                FROM shu_member_distributions w

                INNER JOIN members m
                    ON m.id = w.member_id

                WHERE w.distributed_status = TRUE AND w.status_shu = TRUE
            
                UNION ALL


                ----------------------------------------------------------------
                -- LOAN PAYMENTS
                ----------------------------------------------------------------
                SELECT 
                    lp.payment_date AS transaction_date,
                    m.full_name,
                    'INSTALLMENT PAYMENT' AS transaction_type,
                    pm.name AS payment_method,
                    lp.amount_paid AS amount,
                    s.status_code AS status,
                    CASE 
                        WHEN pm.name = 'GATEWAY' THEN COALESCE(pgt.gateway_transaction_id, lp.payment_reference_id)
                        ELSE lp.payment_reference_id
                    END AS reference_number

                FROM loan_payments lp

                INNER JOIN payment_methods pm
                    ON pm.id = lp.payment_method_id

                INNER JOIN statuses s
                    ON s.id = lp.status_id

                INNER JOIN loan_installments li
                    ON li.id = lp.installment_id

                INNER JOIN loans l
                    ON l.id = li.loan_id

                INNER JOIN members m
                    ON m.id = l.member_id

                LEFT JOIN manual_payments mp
                    ON pm.name = 'MANUAL'
                AND mp.payment_reference_id = lp.payment_reference_id

                LEFT JOIN payment_gateway_transactions pgt
                    ON pm.name = 'GATEWAY'
                AND CAST(pgt.id AS VARCHAR) = lp.payment_reference_id

            ) combined_transactions

            WHERE 1=1
        """
        # Base query with placeholders for filtering
        # query = f"""
        # SELECT * FROM (
        #     SELECT 
        #         st.transaction_date AS transaction_date,
        #         m.full_name,
        #         tt.name AS transaction_type,
        #         pm.name AS payment_method,
        #         st.amount,
        #         s.status_code AS status,
        #         CASE
        #             WHEN pm.name = 'GATEWAY' THEN pgt.gateway_transaction_id
        #             ELSE '-'
        #         END AS reference_number
        #     FROM saving_transactions st
        #     INNER JOIN members m ON m.id = st.member_id
        #     INNER JOIN transaction_types tt ON tt.id = st.transaction_type_id
        #     INNER JOIN payment_methods pm ON pm.id = st.payment_method_id
        #     INNER JOIN statuses s ON s.id = st.status_id
        #     LEFT JOIN manual_payments mp ON pm.name = 'MANUAL' AND mp.id = st.payment_reference_id
        #     LEFT JOIN payment_gateway_transactions pgt ON pm.name = 'GATEWAY' AND pgt.id = st.payment_reference_id

        #     UNION ALL

        #     SELECT 
        #         w.request_date AS transaction_date,
        #         m.full_name,
        #         'WITHDRAWAL' AS transaction_type,
        #         pm.name AS payment_method,
        #         w.amount,
        #         s.status_code AS status,
        #         CASE
        #             WHEN pm.name = 'GATEWAY' THEN pgt.gateway_transaction_id
        #             ELSE '-'
        #         END AS reference_number
        #     FROM withdrawals w
        #     INNER JOIN members m ON m.id = w.member_id
        #     INNER JOIN payment_methods pm ON pm.id = w.payment_method_id
        #     INNER JOIN statuses s ON s.id = w.status_id
        #     LEFT JOIN manual_payments mp ON pm.name = 'MANUAL' AND mp.id = w.payment_reference_id
        #     LEFT JOIN payment_gateway_transactions pgt ON pm.name = 'GATEWAY' AND pgt.id = w.payment_reference_id

        #     UNION ALL

        #     SELECT 
        #         lp.payment_date AS transaction_date,
        #         m.full_name,
        #         'INSTALLMENT PAYMENT' AS transaction_type,
        #         pm.name AS payment_method,
        #         lp.amount_paid AS amount,
        #         s.status_code AS status,
        #         CASE
        #             WHEN pm.name = 'GATEWAY' THEN pgt.gateway_transaction_id
        #             ELSE '-'
        #         END AS reference_number
        #     FROM loan_payments lp
        #     INNER JOIN payment_methods pm ON pm.id = lp.payment_method_id
        #     INNER JOIN statuses s ON s.id = lp.status_id
        #     INNER JOIN loan_installments li ON li.id = lp.installment_id
        #     INNER JOIN loans l ON l.id = li.loan_id
        #     INNER JOIN members m ON m.id = l.member_id
        #     LEFT JOIN manual_payments mp ON pm.name = 'MANUAL' AND mp.id = lp.payment_reference_id
        #     LEFT JOIN payment_gateway_transactions pgt ON pm.name = 'GATEWAY' AND pgt.id = lp.payment_reference_id
        # ) combined_transactions
        # WHERE 1=1
        # """
        
        params = []
        if member_name and member_name.strip():
            query += " AND full_name ILIKE %s"
            params.append(f"%{member_name}%")
            
        if transaction_type and transaction_type.strip():
            type_lower = transaction_type.lower()
            if type_lower == 'deposit':
                query += " AND transaction_type IN ('MANDATORY', 'VOLUNTARY', 'PRINCIPLE', 'DEPOSIT')"
            elif type_lower == 'loan-installment':
                query += " AND transaction_type = 'INSTALLMENT PAYMENT'"
            elif type_lower == 'withdrawals':
                query += " AND transaction_type = 'WITHDRAWAL'"
            else:
                query += " AND transaction_type = %s"
                params.append(transaction_type)
                
        if start_date and start_date.strip():
            query += " AND transaction_date >= %s"
            params.append(start_date)
        if end_date and end_date.strip():
            query += " AND transaction_date <= %s"
            params.append(end_date)
            
        query += " ORDER BY transaction_date DESC"

        try:
            with connection.cursor() as cursor:
                cursor.execute(query, params)
                columns = [col[0] for col in cursor.description]
                results = [dict(zip(columns, row)) for row in cursor.fetchall()]

            for r in results:
                if 'salary_statement_file' in r:
                    r['salary_statement_file'] = get_absolute_media_url(request, r['salary_statement_file'])
            
            return Response(results)
        except Exception as e:
            return Response({'error': str(e)}, status=400)

    @action(detail=False, methods=['get'])
    def admin_loans_list(self, request):
        import datetime

        # Accept month/year filter, default to current month
        month_param = request.query_params.get('month')
        year_param = request.query_params.get('year')
        today = datetime.date.today()
        try:
            sel_month = int(month_param) if month_param else today.month
            sel_year = int(year_param) if year_param else today.year
        except ValueError:
            sel_month = today.month
            sel_year = today.year

        period_str = f"{sel_year}-{sel_month:02d}"  # e.g. '2026-05'

        query = """  
        SELECT 
                    m.id as member_id, 
                    m.full_name,
                    m.nik_employee,
                    d.department_name, 
                    la.purpose,
                    la.salary_statement_file,
                    la.duration_months,
                    la.amount_requested, 
                    l.principal_amount,
                    l.interest_amount,
                    l.total_amount as amount,
                    lt.name as type_name,
                    s.status_code,
                    s.id as status_id,
                    l.id as loan_id,
                    l.remaining_balance,
                    u.email,
                    l.start_date,
                    l.due_date,
                    COALESCE(li_summary.total_installment, 0) AS total_installment,
                    COALESCE(li_summary.paid_installment, 0) AS paid_installment,
                    COALESCE(current_month_inst.installment_number, 0) AS current_month_installment,
                    COALESCE(current_month_inst.due_date, NULL) AS current_month_due_date,
                    COALESCE(current_month_inst.amount_total, 0) AS current_month_amount,
                    COALESCE(current_month_inst.inst_status_id, NULL) AS current_month_status_id,
                
                    CASE 
                        WHEN COALESCE(li_summary.total_installment, 0) > 0 
                        THEN (li_summary.paid_installment * 100.0 / li_summary.total_installment)
                        ELSE 0
                    END AS progress_percent
                
                FROM loan_applications la 
                INNER JOIN members m ON la.member_id = m.id
                INNER JOIN departments d ON m.department_id = d.id
                INNER JOIN users u ON m.user_id = u.id
                INNER JOIN loan_types lt ON la.loan_type_id = lt.id
                INNER JOIN loans l ON l.application_id = la.id   
                INNER JOIN statuses s on s.id = l.status_id
                JOIN (
                    SELECT 
                        loan_id,
                        COUNT(*) AS total_installment,
                        SUM(CASE WHEN status_id IN (29,30) THEN 1 ELSE 0 END) AS paid_installment
                    FROM loan_installments
                    GROUP BY loan_id
                ) li_summary ON li_summary.loan_id = l.id
                LEFT JOIN LATERAL (
            SELECT 
                li.id as inst_id,
                li.installment_number,
                li.due_date,
                li.amount_total,
                li.status_id as inst_status_id
            FROM loan_installments li
            WHERE li.loan_id = l.id
            AND DATE_TRUNC('month', li.due_date) = DATE_TRUNC('month', TO_DATE(%s || '-25', 'YYYY-MM-DD'))
            LIMIT 1
        ) current_month_inst ON TRUE
                WHERE
                    l.status_id in (25,26)
            AND u.is_active = true
            AND NOT EXISTS (SELECT 1 FROM close_account_requests car WHERE car.member_id = m.id AND car.status_id = 44 AND car.deleted_at IS NULL)
        """
        with connection.cursor() as cursor:
            cursor.execute(query, [period_str])
            columns = [col[0] for col in cursor.description]
            results = [dict(zip(columns, row)) for row in cursor.fetchall()]
            
        return Response(results)

    @action(detail=False, methods=['get'])
    def payroll_loans_list(self, request):
        period = request.query_params.get('period')
        if not period:
            from datetime import datetime
            period = datetime.now().strftime('%Y-%m')
            
        try:
            year, month = period.split('-')
        except ValueError:
            return Response({'error': 'Invalid period format. Use YYYY-MM'}, status=400)

        query = """  
        SELECT 
            m.id as member_id, 
            m.full_name,
            m.nik_employee,
            d.department_name, 
            la.duration_months,
            l.total_amount as amount,
            lt.name as type_name,
            s.id as status_id,
            l.id as loan_id,
            l.remaining_balance,
            u.email,
            l.start_date,
            l.due_date,
            COALESCE(li_summary.total_installment, 0) AS total_installment,
            COALESCE(li_summary.paid_installment, 0) AS paid_installment,
            COALESCE(current_month_inst.inst_id, NULL) AS current_month_inst_id,
            COALESCE(current_month_inst.installment_number, 0) AS current_month_installment,
            COALESCE(current_month_inst.due_date, NULL) AS current_month_due_date,
            COALESCE(current_month_inst.amount_total, 0) AS current_month_amount,
            COALESCE(current_month_inst.inst_status_id, NULL) AS current_month_status_id,
            es.status_name as employee_status,
        
            CASE 
                WHEN COALESCE(li_summary.total_installment, 0) > 0 
                THEN (li_summary.paid_installment * 100.0 / li_summary.total_installment)
                ELSE 0
            END AS progress_percent
        
        FROM loan_applications la 
        INNER JOIN members m ON la.member_id = m.id
        INNER JOIN departments d ON m.department_id = d.id
        INNER JOIN users u ON m.user_id = u.id
        INNER JOIN loan_types lt ON la.loan_type_id = lt.id
        INNER JOIN loans l ON l.application_id = la.id   
        INNER JOIN statuses s on s.id = l.status_id
        LEFT JOIN employee_statuses es ON es.id = m.employee_status_id
        JOIN (
            SELECT 
                loan_id,
                COUNT(*) AS total_installment,
                SUM(CASE WHEN status_id IN (29,30) THEN 1 ELSE 0 END) AS paid_installment
            FROM loan_installments
            GROUP BY loan_id
        ) li_summary ON li_summary.loan_id = l.id
        LEFT JOIN LATERAL (
            SELECT 
                li.id as inst_id,
                li.installment_number,
                li.due_date,
                li.amount_total,
                li.status_id as inst_status_id
            FROM loan_installments li
            WHERE li.loan_id = l.id
            AND EXTRACT(YEAR FROM li.due_date) = %s
            AND EXTRACT(MONTH FROM li.due_date) = %s
            LIMIT 1
        ) current_month_inst ON TRUE
        WHERE
            l.status_id IN (25, 26)
            AND u.is_active = true
            AND m.employee_status_id IN (1,2)
            AND NOT EXISTS (SELECT 1 FROM close_account_requests car WHERE car.member_id = m.id AND car.status_id = 44 AND car.deleted_at IS NULL)
            AND current_month_inst.inst_id IS NOT NULL
        """
        with connection.cursor() as cursor:
            cursor.execute(query, [year, month])
            columns = [col[0] for col in cursor.description]
            results = [dict(zip(columns, row)) for row in cursor.fetchall()]
            
        return Response(results)

    @action(detail=False, methods=['get'])
    def payroll_savings_list(self, request):
        period = request.query_params.get('period')
        if not period:
            from datetime import datetime
            period = datetime.now().strftime('%Y-%m')
            
        try:
            year, month = period.split('-')
        except ValueError:
            return Response({'error': 'Invalid period format. Use YYYY-MM'}, status=400)

        query = """
        SELECT 
            m.id AS id,
            m.id AS member_id,
            m.full_name,
            m.nik_employee,
            d.department_name,
            es.status_name AS employee_status,
            MAX(msb.bill_period_start) AS bill_period_start,
            MAX(msb.bill_period_end) AS bill_period_end,

            -- MANDATORY
            MAX(CASE WHEN st.id = 1 THEN msb.id END) AS mandatory_bill_id,
            COALESCE(MAX(CASE WHEN st.id = 1 THEN msb.amount_due ELSE 0 END), 0) AS mandatory_amount,
            COALESCE(MAX(CASE WHEN st.id = 1 AND msb.status_id = 38 THEN msb.amount_due ELSE 0 END), 0) AS mandatory_outstanding,

            -- VOLUNTARY
            MAX(CASE WHEN st.id = 2 THEN msb.id END) AS voluntary_bill_id,
            COALESCE(MAX(CASE WHEN st.id = 2 THEN msb.amount_due ELSE 0 END), 0) AS voluntary_amount,
            COALESCE(MAX(CASE WHEN st.id = 2 AND msb.status_id = 38 THEN msb.amount_due ELSE 0 END), 0) AS voluntary_outstanding,

            -- PRINCIPAL
            MAX(CASE WHEN st.id = 3 THEN msb.id END) AS principal_bill_id,
            COALESCE(MAX(CASE WHEN st.id = 3 THEN msb.amount_due ELSE 0 END), 0) AS principal_amount,
            COALESCE(MAX(CASE WHEN st.id = 3 AND msb.status_id = 38 THEN msb.amount_due ELSE 0 END), 0) AS principal_outstanding,

            -- TOTALS
            COALESCE(SUM(CASE WHEN msb.status_id = 38 THEN msb.amount_due ELSE 0 END), 0) AS total_outstanding,
            COALESCE(SUM(msb.amount_due), 0) AS total_amount
        FROM monthly_saving_bills msb
        INNER JOIN members m ON m.id = msb.member_id
        INNER JOIN departments d ON d.id = m.department_id
        INNER JOIN saving_types st ON st.id = msb.saving_type_id
        INNER JOIN users u ON u.id = m.user_id
        LEFT JOIN employee_statuses es ON es.id = m.employee_status_id
        WHERE EXTRACT(YEAR FROM msb.bill_period_start) = %s
          AND EXTRACT(MONTH FROM msb.bill_period_start) = %s
          AND u.is_active = true
          AND NOT EXISTS (SELECT 1 FROM close_account_requests car WHERE car.member_id = m.id AND car.status_id = 44 AND car.deleted_at IS NULL)
        GROUP BY
            m.id,
            m.full_name,
            m.nik_employee,
            d.department_name,
            es.status_name
        """
        with connection.cursor() as cursor:
            cursor.execute(query, [year, month])
            columns = [col[0] for col in cursor.description]
            results = [dict(zip(columns, row)) for row in cursor.fetchall()]

        # Format items to match frontend expectation perfectly
        formatted_results = []
        for item in results:
            total_outstanding = float(item['total_outstanding'])
            total_amount = float(item['total_amount'])
            total_paid = total_amount - total_outstanding
            is_paid = total_outstanding == 0
            status_id = 39 if is_paid else 38
            
            formatted_results.append({
                'id': item['member_id'],
                'member_id': item['member_id'],
                'full_name': item['full_name'],
                'nik_employee': item['nik_employee'],
                'department_name': item['department_name'],
                'employee_status': item['employee_status'],
                'pokok': float(item['principal_amount']),
                'wajib': float(item['mandatory_amount']),
                'sukarela': float(item['voluntary_amount']),
                'bulat': 0, 
                'total': total_amount,
                'total_paid': total_paid,
                'is_paid': is_paid,
                'status_id': status_id,
                'mandatory_bill_id': item['mandatory_bill_id'],
                'voluntary_bill_id': item['voluntary_bill_id'],
                'principal_bill_id': item['principal_bill_id'],
                'mandatory_outstanding': float(item['mandatory_outstanding']),
                'voluntary_outstanding': float(item['voluntary_outstanding']),
                'principal_outstanding': float(item['principal_outstanding']),
                'total_outstanding': total_outstanding
            })
            
        return Response(formatted_results)

    @action(detail=False, methods=['post'])
    def confirm_payroll_savings(self, request):
        saving_ids = request.data.get('saving_ids', []) 
        period = request.data.get('period')

        if not saving_ids or not period:
            return Response({'error': 'saving_ids and period are required'}, status=400)

        try:
            year, month = period.split('-')
        except ValueError:
            return Response({'error': 'Invalid period format'}, status=400)

        results = []
        failed = []

        with connection.cursor() as cursor:
            for member_id in saving_ids:
                # Find unpaid bills for this member in the selected period
                cursor.execute("""
                    SELECT id, saving_type_id 
                    FROM monthly_saving_bills 
                    WHERE member_id = %s AND status_id = 38
                      AND EXTRACT(YEAR FROM bill_period_start) = %s
                      AND EXTRACT(MONTH FROM bill_period_start) = %s
                """, [member_id, year, month])
                bills = cursor.fetchall()
                
                if not bills:
                    failed.append({'member_id': member_id, 'reason': 'No pending bills found'})
                    continue

                for bill_id, saving_type_id in bills:
                    try:
                        with transaction.atomic():
                            cursor.execute(
                                "CALL public.sp_savings_payroll_transaction(%s, %s, %s)",
                                [bill_id, member_id, saving_type_id]
                            )
                        results.append(bill_id)
                    except Exception as e:
                        error_msg = str(e).split('\n')[0].strip()
                        failed.append({'member_id': member_id, 'bill_id': bill_id, 'reason': error_msg})

        if failed:
            return Response({
                'message': f'Processed {len(results)} savings. {len(failed)} failed.',
                'success': results,
                'failed': failed
            }, status=207)

        return Response({'message': f'Successfully processed {len(results)} savings deductions.'})

    @action(detail=False, methods=['post'])
    def rollback_payroll_savings(self, request):
        member_id = request.data.get('saving_id')
        period = request.data.get('period')

        if not member_id or not period:
            return Response({'error': 'saving_id and period are required'}, status=400)

        try:
            year, month = period.split('-')
        except ValueError:
            return Response({'error': 'Invalid period format'}, status=400)

        try:
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute("""
                        SELECT id, saving_type_id, status_id
                        FROM monthly_saving_bills
                        WHERE member_id = %s
                          AND EXTRACT(YEAR FROM bill_period_start) = %s
                          AND EXTRACT(MONTH FROM bill_period_start) = %s
                    """, [member_id, year, month])
                    all_bills = cursor.fetchall()

                    if not all_bills:
                        return Response({'error': f'No bills found for member {member_id} in period {period}.'}, status=400)

                    paid_bills = [(bid, stype) for bid, stype, sid in all_bills if sid in (39, 40)]

                    if not paid_bills:
                        statuses = [sid for _, _, sid in all_bills]
                        return Response({'error': f'No paid bills (status 39/40) found. Current statuses: {statuses}'}, status=400)

                    results = []
                    failed = []
                    for bill_id, saving_type_id in paid_bills:
                        try:
                            with transaction.atomic():
                                cursor.execute(
                                    "CALL public.sp_rollback_savings_payroll_transaction(%s, %s, %s)",
                                    [bill_id, member_id, saving_type_id]
                                )
                            results.append(bill_id)
                        except Exception as e:
                            error_msg = str(e).split('\n')[0].strip()
                            failed.append({'bill_id': bill_id, 'reason': error_msg})

            if failed and not results:
                return Response({'error': f'Rollback failed for all bills.', 'failed': failed}, status=400)
            if failed:
                return Response({
                    'message': f'Partial rollback: {len(results)} succeeded, {len(failed)} failed.',
                    'failed': failed
                }, status=207)
            return Response({'message': 'Rollback processed successfully'})
        except Exception as e:
            return Response({'error': str(e)}, status=400)

    @action(detail=False, methods=['post'])
    def confirm_payroll_payments(self, request):
        installment_ids = request.data.get('installment_ids', [])
        period = request.data.get('period')

        if not installment_ids or not period:
            return Response({'error': 'installment_ids and period are required'}, status=400)

        results = []
        failed = []

        with connection.cursor() as cursor:
            for inst_id in installment_ids:
                try:
                    # Menggunakan subtransaksi atomic (Savepoint) agar jika satu cicilan error (RAISE EXCEPTION), 
                    # koneksi database tidak rusak dan bisa melanjutkan ke cicilan berikutnya
                    with transaction.atomic():
                        cursor.execute("CALL public.sp_loan_payroll_installment(%s)", [inst_id])
                    results.append(inst_id)
                except Exception as e:
                    # Tangkap pesan exception dari PostgreSQL (seperti 'INSTALLMENT NOT FOUND' atau 'INSTALLMENT ALREADY PAID')
                    error_msg = str(e).split('\n')[0].strip()
                    failed.append({'installment_id': inst_id, 'reason': error_msg})

        if failed:
            return Response({
                'message': f'Processed {len(results)} payments. {len(failed)} failed.',
                'success': results,
                'failed': failed
            }, status=207)  # 207 Multi-Status

        return Response({'message': f'Successfully processed {len(results)} payments.'})

    @action(detail=False, methods=['post'])
    def rollback_payroll_payment(self, request):
        installment_id = request.data.get('installment_id')
        period = request.data.get('period')

        if not installment_id:
            return Response({'error': 'installment_id is required'}, status=400)

        try:
            # Menggunakan subtransaksi atomic (Savepoint) agar aman jika terjadi RAISE EXCEPTION
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute("CALL public.sp_rollback_loan_payroll_installment(%s)", [installment_id])
            return Response({'message': 'Rollback processed successfully'})
        except Exception as e:
            # Tangkap pesan exception dari PostgreSQL (seperti 'INSTALLMENT NOT FOUND' atau 'INSTALLMENT IS NOT PAID')
            error_msg = str(e).split('\n')[0].strip()
            return Response({'error': error_msg}, status=400)

    @action(detail=False, methods=['get'])
    def admin_pending_stats(self, request):
        import datetime

        # Accept month/year filter, default to current period
        month_param = request.query_params.get('month')
        year_param = request.query_params.get('year')

        today = datetime.date.today()
        try:
            sel_month = int(month_param) if month_param else today.month
            sel_year = int(year_param) if year_param else today.year
        except ValueError:
            sel_month = today.month
            sel_year = today.year

        # Due date is always the 25th of the selected month
        try:
            period_due_date = datetime.date(sel_year, sel_month, 25)
        except ValueError:
            period_due_date = datetime.date(today.year, today.month, 25)

        member_query = """
        SELECT 
            COUNT(DISTINCT m.id) AS member,
            SUM(CASE WHEN l.status_id = 25 THEN 1 ELSE 0 END) AS active_loan
        FROM members m  
        JOIN users u ON u.id = m.user_id 
        LEFT JOIN loans l ON l.member_id = m.id 
        WHERE u.is_active = true;
        """
        
        collected_query = """
        SELECT SUM(amount_total) FROM loan_installments WHERE status_id IN (29,30) AND due_date = %s
        """
        
        overdue_query = """
        SELECT SUM(amount_total) FROM loan_installments WHERE status_id = 28 AND due_date = %s
        """
                
        with connection.cursor() as cursor:
            cursor.execute(member_query)
            member_row = cursor.fetchone()
            total_members = member_row[0] if member_row and member_row[0] else 0
            active_loans = member_row[1] if member_row and member_row[1] else 0
            
            cursor.execute(collected_query, [period_due_date])
            collected_row = cursor.fetchone()
            collected = collected_row[0] if collected_row and collected_row[0] else 0
            
            cursor.execute(overdue_query, [period_due_date])
            overdue_row = cursor.fetchone()
            overdue = overdue_row[0] if overdue_row and overdue_row[0] else 0

            # Get monthly funding limit (most recent active setting)
            cursor.execute("SELECT monthly_limit FROM loan_funding_settings WHERE is_active = TRUE ORDER BY effective_date DESC LIMIT 1")
            ml_row = cursor.fetchone()
            monthly_limit = float(ml_row[0]) if ml_row and ml_row[0] is not None else 0.0

            # Sum principal_amount of loans that started in the selected month/year and are active (status_id = 25)
            cursor.execute(
                "SELECT COALESCE(SUM(principal_amount),0) FROM loans WHERE EXTRACT(YEAR FROM start_date) = %s AND EXTRACT(MONTH FROM start_date) = %s AND status_id = 25",
                [sel_year, sel_month]
            )
            alloc_row = cursor.fetchone()
            allocated = float(alloc_row[0]) if alloc_row and alloc_row[0] is not None else 0.0

            remaining_allocation = monthly_limit - allocated
            if remaining_allocation < 0:
                remaining_allocation = 0.0
            
        return Response({
            'total_members': total_members,
            'active_loans': active_loans,
            'collected_this_month': collected,
            'total_overdue': overdue,
            'monthly_limit': monthly_limit,
            'allocated_this_month': allocated,
            'remaining_allocation': remaining_allocation
        })

    @action(detail=False, methods=['get', 'post'], url_path='loan-funding-settings')
    def loan_funding_settings(self, request):
        """
        GET  : Return latest active loan funding setting.
        POST : Update latest active loan funding setting.
        """
        with connection.cursor() as cursor:
            if request.method == 'GET':
                cursor.execute(
                    "SELECT id, monthly_limit, effective_date, is_active "
                    "FROM loan_funding_settings "
                    "WHERE is_active = TRUE "
                    "ORDER BY effective_date DESC LIMIT 1"
                )
                row = cursor.fetchone()
                if not row:
                    return Response({'error': 'No active loan funding setting found.'}, status=404)

                return Response({
                    'id': row[0],
                    'monthly_limit': float(row[1]) if row[1] is not None else None,
                    'effective_date': row[2].isoformat() if row[2] else None,
                    'is_active': row[3],
                })

            monthly_limit = request.data.get('monthly_limit')
            effective_date = request.data.get('effective_date')

            if monthly_limit is None or effective_date is None:
                return Response(
                    {'error': 'monthly_limit and effective_date are required.'},
                    status=400
                )

            try:
                monthly_limit_value = float(monthly_limit)
            except (TypeError, ValueError):
                return Response({'error': 'monthly_limit must be a number.'}, status=400)

            try:
                parsed_effective_date = datetime.datetime.strptime(effective_date, '%Y-%m-%d').date()
            except (TypeError, ValueError):
                return Response({'error': 'effective_date must be in YYYY-MM-DD format.'}, status=400)

            cursor.execute(
                "SELECT id FROM loan_funding_settings WHERE is_active = TRUE ORDER BY effective_date DESC LIMIT 1"
            )
            active_row = cursor.fetchone()

            if active_row:
                cursor.execute(
                    "UPDATE loan_funding_settings SET monthly_limit = %s, effective_date = %s "
                    "WHERE id = %s",
                    [monthly_limit_value, parsed_effective_date, active_row[0]]
                )
            else:
                cursor.execute(
                    "INSERT INTO loan_funding_settings (monthly_limit, effective_date, is_active) "
                    "VALUES (%s, %s, TRUE)",
                    [monthly_limit_value, parsed_effective_date]
                )

        return Response({'message': 'Loan funding settings updated successfully.'})

    @action(detail=False, methods=['post'])
    def send_reminder_email(self, request):
        """Send reminder for overdue AND upcoming payments to selected members."""
        member_ids = request.data.get('member_ids', [])

        if not member_ids or len(member_ids) == 0:
            return Response({'error': 'member_ids is required and cannot be empty'}, status=400)

        success_count = 0
        failed_count = 0
        errors = []

        try:
            placeholders = ','.join(['%s'] * len(member_ids))

            overdue_query = f"""
            SELECT
                m.id as member_id, m.full_name, u.email,
                li.installment_number, li.due_date, li.amount_total,
                'OVERDUE' as reminder_type
            FROM loans l
            INNER JOIN members m ON l.member_id = m.id
            INNER JOIN users u ON m.user_id = u.id
            INNER JOIN loan_installments li ON li.loan_id = l.id
            WHERE m.id IN ({placeholders})
              AND li.status_id IN (27, 28)
              AND li.due_date <= CURRENT_DATE
              AND u.is_active = true
            """

            upcoming_query = f"""
            SELECT
                m.id as member_id, m.full_name, u.email,
                li.installment_number, li.due_date, li.amount_total,
                'UPCOMING' as reminder_type
            FROM loans l
            INNER JOIN members m ON l.member_id = m.id
            INNER JOIN users u ON m.user_id = u.id
            INNER JOIN loan_installments li ON li.loan_id = l.id
            WHERE m.id IN ({placeholders})
              AND li.status_id = 28
              AND li.due_date > CURRENT_DATE
              AND li.due_date <= CURRENT_DATE + INTERVAL '30 days'
              AND u.is_active = true
            ORDER BY li.due_date ASC
            """

            with connection.cursor() as cursor:
                cursor.execute(overdue_query, member_ids)
                columns = [col[0] for col in cursor.description]
                overdue_results = [dict(zip(columns, row)) for row in cursor.fetchall()]

                cursor.execute(upcoming_query, member_ids)
                columns = [col[0] for col in cursor.description]
                upcoming_results = [dict(zip(columns, row)) for row in cursor.fetchall()]

            all_results = overdue_results + upcoming_results

            if not all_results:
                return Response({
                    'success_count': 0,
                    'failed_count': 0,
                    'errors': [],
                    'message': 'No overdue or upcoming installments found for selected members'
                }, status=200)

            members_email_map = {}
            for row in all_results:
                mid = row['member_id']
                if mid not in members_email_map:
                    members_email_map[mid] = {
                        'email': row['email'],
                        'full_name': row['full_name'],
                        'overdue': [],
                        'upcoming': [],
                    }
                if row['reminder_type'] == 'OVERDUE':
                    members_email_map[mid]['overdue'].append(row)
                else:
                    members_email_map[mid]['upcoming'].append(row)

            from api.utils.email import send_styled_email
            for member_id, mdata in members_email_map.items():
                try:
                    details = []
                    has_overdue = len(mdata['overdue']) > 0
                    has_upcoming = len(mdata['upcoming']) > 0

                    if has_overdue:
                        details.append(('--- JATUH TEMPO ---', ''))
                        for inst in mdata['overdue']:
                            details.append((
                                f"Angsuran #{inst['installment_number']} (Jatuh tempo: {inst['due_date']})",
                                f"Rp {inst['amount_total']:,.0f}"
                            ))

                    if has_upcoming:
                        details.append(('--- AKAN DATANG ---', ''))
                        for inst in mdata['upcoming']:
                            details.append((
                                f"Angsuran #{inst['installment_number']} (Jatuh tempo: {inst['due_date']})",
                                f"Rp {inst['amount_total']:,.0f}"
                            ))

                    if has_overdue and has_upcoming:
                        subject = "Pengingat Pembayaran - Angsuran Jatuh Tempo & Akan Datang"
                        intro = f"Halo {mdata['full_name']}, Anda memiliki angsuran yang telah jatuh tempo dan angsuran yang akan datang."
                        highlight = ("Perhatian", "Segera lunasi angsuran yang telah jatuh tempo dan persiapkan pembayaran berikutnya.")
                    elif has_overdue:
                        subject = "Pengingat Pembayaran - Angsuran Jatuh Tempo"
                        intro = f"Halo {mdata['full_name']}, Anda memiliki angsuran yang telah melewati jatuh tempo."
                        highlight = ("Jatuh Tempo", "Segera lunasi pembayaran Anda untuk menghindari denda.")
                    else:
                        subject = "Pengingat Pembayaran - Angsuran Akan Datang"
                        intro = f"Halo {mdata['full_name']}, ini adalah pengingat untuk angsuran Anda yang akan datang."
                        highlight = ("Pengingat", "Pastikan saldo Anda mencukupi untuk pembayaran berikutnya.")

                    send_styled_email(
                        subject=subject,
                        recipient=mdata['email'],
                        intro=intro,
                        details=details,
                        highlight=highlight,
                        footer_note="Jika Anda sudah melakukan pembayaran, abaikan pesan ini."
                    )
                    success_count += 1
                except Exception as e:
                    failed_count += 1
                    errors.append(f"Member {member_id}: {str(e)}")

            return Response({
                'success_count': success_count,
                'failed_count': failed_count,
                'errors': errors,
                'message': f'Reminder emails sent to {success_count} member(s)'
            })

        except Exception as e:
            return Response({'error': str(e)}, status=400)

    @action(detail=False, methods=['post'])
    def send_auto_all_reminders(self, request):
        """
        Automatically find and send reminders to ALL members with overdue installments.
        """
        from django.core.mail import send_mail
        from django.conf import settings
        
        try:
            # Find all members with overdue installments (Unpaid or Macet)
            query = """
            SELECT DISTINCT
                m.id as member_id,
                m.full_name,
                u.email,
                l.id as loan_id,
                li.installment_number,
                li.due_date,
                li.amount_total
            FROM loans l
            INNER JOIN members m ON l.member_id = m.id
            INNER JOIN users u ON m.user_id = u.id
            INNER JOIN loan_installments li ON li.loan_id = l.id
            WHERE li.status_id IN (27, 28)
              AND li.due_date <= CURRENT_DATE
              AND u.is_active = true
            """
            
            with connection.cursor() as cursor:
                cursor.execute(query)
                columns = [col[0] for col in cursor.description]
                results = [dict(zip(columns, row)) for row in cursor.fetchall()]
            
            if not results:
                return Response({
                    'message': 'No overdue installments found',
                    'success_count': 0
                })
            
            # Group by member
            members_map = {}
            for row in results:
                mid = row['member_id']
                if mid not in members_map:
                    members_map[mid] = {
                        'email': row['email'],
                        'full_name': row['full_name'],
                        'installments': []
                    }
                members_map[mid]['installments'].append(row)
            
            success_count = 0
            for mid, data in members_map.items():
                email = data['email']
                full_name = data['full_name']
                installments = data['installments']
                
                subject = "PENGINGAT OTOMATIS - Angsuran Pinjaman Jatuh Tempo"

                # Group installments
                details = []
                for inst in installments:
                    details.append((f"Angsuran #{inst['installment_number']} ({inst['due_date']})", f"Rp {inst['amount_total']:,.0f}"))

                try:
                    from api.utils.email import send_styled_email
                    send_styled_email(
                        subject=subject,
                        recipient=email,
                        intro=f"Halo {full_name}, ini adalah pengingat otomatis mengenai angsuran pinjaman Anda yang belum dibayar.",
                        details=details,
                        highlight=("Angsuran Jatuh Tempo", "Segera lunasi pembayaran ini."),
                        footer_note="Jika Anda memiliki pertanyaan, hubungi pengurus koperasi."
                    )
                    success_count += 1
                except:
                    pass
            
            return Response({
                'message': f'Auto-reminders sent to {success_count} member(s)',
                'success_count': success_count
            })
        except Exception as e:
            return Response({'error': str(e)}, status=400)

    @action(detail=False, methods=['get', 'post'])
    def test_send_email(self, request):
        """
        Test endpoint to send reminder email to member_id 1
        GET: returns member info
        POST: sends test email
        """
        from django.core.mail import send_mail
        from django.conf import settings
        
        member_id = request.query_params.get('member_id', 1)
        
        try:
            # Get member and overdue installments
            query = """
            SELECT 
                m.id as member_id,
                m.full_name,
                u.email,
                l.id as loan_id,
                li.installment_number,
                li.due_date,
                li.amount_total,
                lt.name as loan_type
            FROM loans l
            INNER JOIN members m ON l.member_id = m.id
            INNER JOIN users u ON m.user_id = u.id
            INNER JOIN loan_applications la ON l.application_id = la.id
            INNER JOIN loan_types lt ON la.loan_type_id = lt.id
            INNER JOIN loan_installments li ON li.loan_id = l.id
            WHERE m.id = %s
              AND li.status_id IN (27, 28)
              AND li.due_date <= CURRENT_DATE
              AND u.is_active = true
            """
            
            with connection.cursor() as cursor:
                cursor.execute(query, [member_id])
                columns = [col[0] for col in cursor.description]
                results = [dict(zip(columns, row)) for row in cursor.fetchall()]
            
            if not results:
                return Response({
                    'message': f'No overdue installments found for member_id {member_id}',
                    'member_id': member_id
                }, status=404)
            
            # Prepare member data
            member_data = results[0]
            email = member_data['email']
            full_name = member_data['full_name']
            
            if request.method == 'GET':
                # Return member info
                return Response({
                    'member_id': member_id,
                    'full_name': full_name,
                    'email': email,
                    'installments': results,
                    'message': 'Ready to send test email. Use POST to send.'
                })
            
            # POST: Send email
            details = []
            for inst in results:
                details.append((f"Angsuran #{inst['installment_number']} ({inst['due_date']})", f"Rp {inst['amount_total']:,.0f}"))

            subject = "Pengingat Pembayaran - Angsuran Pinjaman Jatuh Tempo (TEST)"

            from api.utils.email import send_styled_email
            send_styled_email(
                subject=subject,
                recipient=email,
                intro=f"Halo {full_name}, ini adalah email pengingat test bahwa Anda memiliki angsuran pinjaman yang sudah jatuh tempo.",
                details=details,
                highlight=("Angsuran Tertunggak", "Segera lakukan pembayaran untuk menghindari denda tambahan."),
                footer_note="Jika Anda sudah melakukan pembayaran ini, abaikan pesan ini."
            )
            
            return Response({
                'success': True,
                'message': f'Test email sent successfully to {email}',
                'member_id': member_id,
                'full_name': full_name,
                'email': email,
                'installments_count': len(results)
            })
        
        except Exception as e:
            return Response({'error': str(e)}, status=400)


    @action(detail=False, methods=['get'])
    def member_list_manual_payment(self, request):
        """
        Get list of active members for dropdown selection.
        """
        query = """
        SELECT m.id, m.full_name, m.nik_employee
        FROM members m
        INNER JOIN users u ON m.user_id = u.id
        WHERE u.is_active = true
          AND NOT EXISTS (SELECT 1 FROM close_account_requests car WHERE car.member_id = m.id AND car.status_id = 44 AND car.deleted_at IS NULL)
        ORDER BY m.full_name ASC
        """
        with connection.cursor() as cursor:
            cursor.execute(query)
            columns = [col[0] for col in cursor.description]
            results = [dict(zip(columns, row)) for row in cursor.fetchall()]
        return Response(results)

    @action(detail=False, methods=['get'])
    def get_member_outstanding_detail(self, request):
        """
        Execute the complex outstanding query for a specific member with dynamic date range.
        Includes loans, mandatory and voluntary saving information.
        Accepts optional ?month=M&year=Y to filter by a specific billing period.
        """
        member_id = request.query_params.get('member_id')
        if not member_id:
            return Response({'error': 'member_id is required'}, status=400)

        month_param = request.query_params.get('month')
        year_param = request.query_params.get('year')
        today = datetime.date.today()

        if month_param and year_param:
            try:
                sel_month = int(month_param)
                sel_year = int(year_param)
                # Billing cycle: 25th of previous month → 25th of selected month
                end_date = datetime.date(sel_year, sel_month, 25)
                start_date = add_months(end_date, -1)
            except (ValueError, TypeError):
                # Fallback to current period
                end_date = today.replace(day=25)
                start_date = add_months(end_date, -1)
        else:
            # Default: current billing period based on today
            if today.day >= 25:
                start_date = today.replace(day=25)
                end_date = add_months(start_date, 1)
            else:
                end_date = today.replace(day=25)
                start_date = add_months(end_date, -1)

        query = f"""
        WITH params AS (
            SELECT 
                DATE '{start_date}' AS start_date,
                DATE '{end_date}' AS end_date
        )
        SELECT 
            m.id,
            m.full_name,
            u.email,
            m.phone_number,
            d.department_name,
            m.nik_employee,

            COALESCE(s.remaining_balance, 0) AS loans_balance,

            mba.account_number,
            mba.account_holder_name,
            b.bank_name,

            -- Mandatory Monthly Obligation
            MAX(
                CASE
                    WHEN st.name = 'MANDATORY'
                    THEN mso.monthly_amount
                    ELSE 0
                END
            ) AS mandatory_monthly_amount,

            -- Voluntary Monthly Obligation
            MAX(
                CASE
                    WHEN st.name = 'VOLUNTARY'
                    THEN mso.monthly_amount
                    ELSE 0
                END
            ) AS voluntary_monthly_amount,

            -- Mandatory Outstanding
            MAX(
                CASE
                    WHEN st.name = 'MANDATORY'
                    THEN (
                        SELECT COALESCE(
                            SUM(
                                msb2.amount_due - COALESCE(msb2.amount_paid, 0)
                            ),
                            0
                        )
                        FROM monthly_saving_bills msb2
                        CROSS JOIN params p
                        WHERE msb2.member_id = m.id and msb2.status_id=38
                          AND msb2.saving_type_id = st.id
                          AND msb2.bill_period_start <= p.end_date
                          AND msb2.bill_period_end >= p.start_date
                          AND (
                                msb2.amount_due - COALESCE(msb2.amount_paid, 0)
                              ) > 0
                    )
                    ELSE 0
                END
            ) AS mandatory_outstanding,

            -- Voluntary Outstanding
            MAX(
                CASE
                    WHEN st.name = 'VOLUNTARY'
                    THEN (
                        SELECT COALESCE(
                            SUM(
                                msb2.amount_due - COALESCE(msb2.amount_paid, 0)
                            ),
                            0
                        )
                        FROM monthly_saving_bills msb2
                        CROSS JOIN params p
                        WHERE msb2.member_id = m.id and msb2.status_id=38
                          AND msb2.saving_type_id = st.id
                          AND msb2.bill_period_start <= p.end_date
                          AND msb2.bill_period_end >= p.start_date
                          AND (
                                msb2.amount_due - COALESCE(msb2.amount_paid, 0)
                              ) > 0
                    )
                    ELSE 0
                END
            ) AS voluntary_outstanding,

            -- Total Saving Balance (Independent Subquery for accuracy)
            (SELECT COALESCE(SUM(balance), 0) FROM saving_wallets WHERE member_id = m.id) AS amount_saving_balance,

            -- Loan Deduction
            CASE
                WHEN EXISTS (
                    SELECT 1
                    FROM loan_installments li
                    CROSS JOIN params p
                    WHERE li.loan_id = s.id
                      AND li.status_id = 28
                      AND li.due_date >= p.start_date
                      AND li.due_date < p.end_date
                )
                THEN (
                    SELECT COALESCE(
                        SUM(li.amount_total),
                        0
                    )
                    FROM loan_installments li
                    CROSS JOIN params p
                    WHERE li.loan_id = s.id
                      AND li.status_id = 28
                      AND li.due_date >= p.start_date
                      AND li.due_date < p.end_date
                )
                ELSE 0
            END AS loan_deduction

        FROM members m
        INNER JOIN users u ON u.id = m.user_id
        LEFT JOIN loans s ON s.member_id = m.id AND s.status_id = 25
        LEFT JOIN saving_wallets sw ON sw.member_id = m.id
        LEFT JOIN member_bank_accounts mba ON mba.member_id = m.id
        LEFT JOIN banks b ON b.id = mba.bank_id
        INNER JOIN departments d ON d.id = m.department_id
        INNER JOIN member_saving_obligations mso ON mso.member_id = m.id
        INNER JOIN saving_types st ON st.id = mso.saving_type_id
        WHERE u.is_active = true
          AND m.id = %s
        GROUP BY
            m.id,
            m.full_name,
            u.email,
            m.phone_number,
            d.department_name,
            m.nik_employee,
            s.remaining_balance,
            s.id,
            mba.account_number,
            mba.account_holder_name,
            b.bank_name
        """
        
        try:
            with connection.cursor() as cursor:
                cursor.execute(query, [member_id])
                columns = [col[0] for col in cursor.description]
                row = cursor.fetchone()
                if row:
                    result = dict(zip(columns, row))
                    return Response(result)
                return Response({'error': 'Member not found or no active loan/bank account'}, status=404)
        except Exception as e:
            return Response({'error': str(e)}, status=400)

    @action(detail=False, methods=['post'])
    def process_manual_payments(self, request):
        """
        Process multiple manual payments (Savings, Loans) or a single Withdrawal.
        Invokes stored procedures: manual_loan_installment, manual_savings_transaction, 
        or manual_withdrawal_transaction.
        """
        member_id = request.data.get('member_id')
        notes = request.data.get('notes', '')
        admin_id = request.user.id if request.user.is_authenticated else 1 # Fallback for dev

        if member_id:
            with connection.cursor() as cursor:
                cursor.execute("SELECT COUNT(*) FROM close_account_requests WHERE member_id = %s AND status_id = 44 AND deleted_at IS NULL", [member_id])
                if cursor.fetchone()[0] > 0:
                    return Response({'error': 'Anggota ini sedang dalam proses penutupan akun. Pembayaran tidak dapat diproses.'}, status=400)

        # Parse payments JSON string
        import json
        try:
            payments_data = json.loads(request.data.get('payments', '[]'))
        except:
            return Response({'error': 'Invalid payments data format'}, status=400)

        if not member_id or not payments_data:
            return Response({'error': 'Member and payment details are required'}, status=400)

        # Handle File Upload
        proof_file = request.FILES.get('proof_file')
        file_path = None
        file_url = None
        if proof_file:
            # Save to 'manual_payments/YYYY/MM/DD/' with a unique file name.
            safe_name = os.path.basename(proof_file.name or 'proof_transfer')
            date_prefix = timezone.now().strftime('%Y/%m/%d')
            storage_path = f"manual_payments/{date_prefix}/{uuid4().hex}_{safe_name}"
            filename = default_storage.save(storage_path, proof_file)
            file_path = str(filename)
            try:
                file_url = default_storage.url(file_path)
            except Exception:
                file_url = get_absolute_media_url(request, file_path)

        results = []
        errors = []

        try:
            with transaction.atomic():
                with connection.cursor() as cursor:
                    for p in payments_data:
                        p_type = p.get('type')
                        p_amount = p.get('amount')
                        
                        if not p_type or not p_amount: continue

                        try:
                            # 1. LOAN REPAYMENT
                            if p_type == 'loan':
                                # Find oldest unpaid installment
                                cursor.execute("""
                                    SELECT li.id FROM loan_installments li
                                    INNER JOIN loans l ON l.id = li.loan_id
                                    WHERE l.member_id = %s AND l.status_id = 25 
                                      AND li.status_id IN (27, 28)
                                    ORDER BY li.due_date ASC LIMIT 1
                                """, [member_id])
                                inst = cursor.fetchone()
                                if inst:
                                    cursor.execute("CALL public.sp_manual_loan_installment(%s, %s, %s, %s, %s)", 
                                                 [inst[0], member_id, file_path, admin_id, notes])
                                    results.append("Loan: Repayment processed successfully")
                                else:
                                    errors.append("Loan: No unpaid installments found")
                                    raise Exception("Loan SP failed: No unpaid installments found")

                            # 2. SAVINGS
                            elif p_type in ['mandatory', 'voluntary']:
                                s_type_id = 1 if p_type == 'mandatory' else 2
                                cursor.execute("""
                                    SELECT id FROM monthly_saving_bills 
                                    WHERE member_id = %s AND saving_type_id = %s AND status_id = 38
                                    ORDER BY bill_period_start ASC LIMIT 1
                                """, [member_id, s_type_id])
                                bill = cursor.fetchone()
                                if bill:
                                    cursor.execute("CALL public.sp_manual_savings_transaction(%s, %s, %s, %s, %s, %s)", 
                                                 [bill[0], member_id, s_type_id, file_path, admin_id, notes])
                                    results.append(f"{p_type.capitalize()}: Repayment processed successfully")
                                else:
                                    errors.append(f"{p_type.capitalize()}: No pending bills found")

                            # 3. WITHDRAWAL
                            elif p_type == 'withdrawal':
                                cursor.execute("CALL public.sp_manual_withdrawal_transaction(%s, %s, %s, %s, %s)", 
                                             [member_id, admin_id, p_amount, file_path, notes])
                                results.append("Withdrawal: Processed successfully")

                        except Exception as e:
                            # If it's not our raised Exception, it's a DB/System error
                            if "SP failed" not in str(e):
                                errors.append(f"{p_type}: {str(e)}")
                            raise # Re-raise to trigger transaction rollback

            return Response({
                'message': 'All payments processed successfully',
                'results': results,
                'proof_file_path': file_path,
                'proof_file_url': file_url,
                'storage_backend': default_storage.__class__.__name__,
            })

        except Exception as e:
            # Atomic transaction rolled back everything
            return Response({
                'error': 'One or more payments failed. All changes rolled back.',
                'details': errors if errors else [str(e)]
            }, status=400)
        finally:
            # Send Email Notification if successful
            if not errors and results:
                try:
                    with connection.cursor() as cursor:
                        cursor.execute("""
                            SELECT u.email, m.full_name 
                            FROM members m
                            INNER JOIN users u ON u.id = m.user_id
                            WHERE m.id = %s
                        """, [member_id])
                        user_info = cursor.fetchone()
                        
                    if user_info and user_info[0]:
                        member_email = user_info[0]
                        member_name = user_info[1]
                        
                        subject = 'Konfirmasi Pembayaran - Koperasi Sanoh'
                        
                        new_date_str = timezone.now().strftime('%d %B %Y, %H:%M')
                        
                        # Calculate total amount directly from payments_data
                        total_processed = 0
                        for p in payments_data:
                            try:
                                raw_amt = p.get('amount', 0)
                                if raw_amt:
                                    clean_amt = re.sub(r'[^\d]', '', str(raw_amt))
                                    if clean_amt:
                                        total_processed += int(clean_amt)
                            except:
                                pass

                        html_message = _build_email_html(
                            'Konfirmasi Pembayaran',
                            f'Halo {member_name}, pembayaran manual Anda telah berhasil diproses oleh administrator.',
                            details=[
                                ('Total Jumlah Diproses', f'Rp {total_processed:,.0f}'),
                                ('Detail Transaksi', ', '.join(results) if results else '-'),
                                ('Catatan', notes if notes else '-'),
                                ('Tanggal', new_date_str),
                                ('Bukti Transfer', 'Terlampir dalam email ini' if file_path else 'Tidak terlampir'),
                            ],
                            highlight=('Status', 'Berhasil Diproses'),
                            footer_note='Ini adalah pesan otomatis dari Koperasi Sanoh Sinergi Bersama. Mohon jangan membalas email ini.'
                        )

                        email = EmailMultiAlternatives(
                            subject,
                            strip_tags(html_message),
                            settings.DEFAULT_FROM_EMAIL,
                            [member_email],
                        )
                        email.attach_alternative(html_message, 'text/html')

                        # Attach proof file from default storage (supports S3/Supabase/local)
                        if file_path:
                            attached = False
                            try:
                                with default_storage.open(file_path, 'rb') as stored_file:
                                    file_bytes = stored_file.read()
                                filename_only = os.path.basename(file_path) or 'proof_of_transfer'
                                mime_type = mimetypes.guess_type(filename_only)[0] or 'application/octet-stream'
                                email.attach(filename_only, file_bytes, mime_type)
                                attached = True
                            except Exception as attach_err:
                                print(f"Failed to attach manual payment proof file: {str(attach_err)}")
                            if not attached and file_url:
                                try:
                                    with urlopen(file_url) as response:
                                        remote_bytes = response.read()
                                    remote_name = os.path.basename(file_path) or 'proof_of_transfer'
                                    remote_mime = mimetypes.guess_type(remote_name)[0] or 'application/octet-stream'
                                    email.attach(remote_name, remote_bytes, remote_mime)
                                    attached = True
                                except Exception as url_attach_err:
                                    print(f"Failed to attach manual payment proof file from URL: {str(url_attach_err)}")

                        email.send(fail_silently=False)
                except Exception as mail_err:
                    print(f"Failed to send manual payment email: {str(mail_err)}")
                    
    @action(detail=False, methods=['post'])
    def update_loan_status(self, request):
        """
        Update loan status based on payment status.
        If member hasn't paid by due date -> status 27 (Macet/Delinquent)
        If member has paid late -> status 30 (Terlambat/Late Paid)
        """
        try:
            # Get all overdue unpaid installments
            query = """
            SELECT 
                l.id as loan_id,
                m.id as member_id,
                li.id as installment_id,
                li.due_date,
                li.status_id as current_status_id,
                CASE 
                    WHEN li.status_id IN (29) THEN 'PAID'
                    WHEN li.status_id IN (30) THEN 'LATE_PAID'
                    WHEN li.status_id = 27 THEN 'MACET'
                    WHEN li.status_id IN (27, 28) AND li.due_date < CURRENT_DATE THEN 'OVERDUE_UNPAID'
                    ELSE 'PENDING'
                END as payment_status
            FROM loans l
            INNER JOIN members m ON l.member_id = m.id
            INNER JOIN users u ON m.user_id = u.id
            INNER JOIN loan_installments li ON li.loan_id = l.id
            WHERE u.is_active = true AND l.status_id IN (25, 26)
            """
            
            with connection.cursor() as cursor:
                cursor.execute(query)
                columns = [col[0] for col in cursor.description]
                results = [dict(zip(columns, row)) for row in cursor.fetchall()]
            
            # Update statuses
            updates = []
            from django.db import connection as db_connection
            
            for row in results:
                installment_id = row['installment_id']
                current_status_id = row['current_status_id']
                payment_status = row['payment_status']
                
                # If overdue unpaid, set to status 27 (Macet)
                if payment_status == 'OVERDUE_UNPAID' and current_status_id not in [27, 30]:
                    with db_connection.cursor() as cursor:
                        update_query = """
                        UPDATE loan_installments 
                        SET status_id = 27, updated_at = NOW()
                        WHERE id = %s
                        """
                        cursor.execute(update_query, [installment_id])
                    updates.append({'installment_id': installment_id, 'new_status': 27})
            
            return Response({
                'updates_count': len(updates),
                'updates': updates,
                'message': f'Successfully updated {len(updates)} loan status(es)'
            })
        except Exception as e:
            return Response({'error': str(e)}, status=400)

    @action(detail=False, methods=['get'])
    def dashboard_summary(self, request):
        """
        Get financial summary for the logged-in member dashboard.
        Includes saving balances, remaining loan, and total outstanding bills/installments.
        """
        if not request.user.is_authenticated or not hasattr(request.user, 'member'):
            member_id = request.query_params.get('member_id')
            if not member_id:
                return Response({'error': 'Authentication required or member_id missing'}, status=401)
        else:
            member_id = request.user.member.id

        sync_member_pending_payments(member_id)

        query = """
        WITH member_info AS (
            SELECT m.full_name, es.status_name as employee_status, m.employee_status_id
            FROM members m
            LEFT JOIN employee_statuses es ON es.id = m.employee_status_id
            WHERE m.id = %s
        ),
        saving_data AS (
            SELECT 
                SUM(CASE WHEN saving_type_id = 1 THEN balance ELSE 0 END) as mandatory_balance,
                SUM(CASE WHEN saving_type_id = 2 THEN balance ELSE 0 END) as voluntary_balance,
                SUM(CASE WHEN saving_type_id = 3 THEN balance ELSE 0 END) as principle_balance,
                SUM(balance) as total_saving_balance
            FROM saving_wallets 
            WHERE member_id = %s
        ),
        saving_growth AS (
            -- Simplified growth: (Total Transactions This Month / Total Balance) * 100
            SELECT
                COALESCE(SUM(CASE WHEN saving_type_id = 1 AND transaction_date >= date_trunc('month', current_date) THEN amount ELSE 0 END), 0) as mandatory_month_inc,
                COALESCE(SUM(CASE WHEN saving_type_id = 2 AND transaction_date >= date_trunc('month', current_date) THEN amount ELSE 0 END), 0) as voluntary_month_inc,
                COALESCE(SUM(CASE WHEN saving_type_id = 3 AND transaction_date >= date_trunc('month', current_date) THEN amount ELSE 0 END), 0) as principle_month_inc
            FROM saving_transactions
            WHERE member_id = %s AND transaction_type_id IN (SELECT id FROM transaction_types WHERE name IN ('DEPOSIT', 'MANDATORY', 'VOLUNTARY', 'PRINCIPLE'))
        ),
        active_loan AS (
            SELECT id, principal_amount, remaining_balance 
            FROM loans 
            WHERE member_id = %s AND status_id = 25 
            LIMIT 1
        ),
        loan_stats AS (
            SELECT 
                COALESCE(al.principal_amount, 0) as principal_amount,
                COALESCE(al.remaining_balance, 0) as total_loan_remaining,
                (SELECT COUNT(*) FROM loan_installments WHERE loan_id = al.id) as total_installments,
                (SELECT COUNT(*) FROM loan_installments WHERE loan_id = al.id AND status_id = 29) as paid_installments
            FROM active_loan al
        ),
        next_payment AS (
            SELECT
                li.due_date as next_due_date,
                li.amount_total as next_due_amount
            FROM loan_installments li
            JOIN active_loan al ON al.id = li.loan_id
            WHERE li.status_id IN (27, 28)
            ORDER BY li.due_date ASC
            LIMIT 1
        ),
        total_unpaid_installments AS (
            SELECT
                COALESCE(SUM(li.amount_total), 0) as total_unpaid_installments,
                COALESCE(
                    JSON_AGG(
                        JSON_BUILD_OBJECT(
                            'id', li.id,
                            'installment_number', li.installment_number,
                            'due_date', li.due_date,
                            'amount_total', li.amount_total
                        ) ORDER BY li.installment_number ASC
                    ), '[]'::json
                ) as unpaid_installments_list
            FROM loan_installments li
            JOIN active_loan al ON al.id = li.loan_id
            WHERE li.status_id IN (27, 28)
        ),
        outstanding_bills AS (
            SELECT 
                COALESCE(SUM(amount_due - COALESCE(amount_paid, 0)), 0) as total_unpaid_bills,
                COALESCE(
                    JSON_AGG(
                        JSON_BUILD_OBJECT(
                            'id', id,
                            'saving_type_id', saving_type_id,
                            'bill_date', due_date,
                            'amount_due', amount_due,
                            'amount_paid', amount_paid
                        ) ORDER BY due_date ASC
                    ), '[]'::json
                ) as unpaid_bills_list
            FROM monthly_saving_bills 
            WHERE member_id = %s AND status_id = 38 
              AND saving_type_id IN (1, 2, 3)
              AND date_trunc('month', due_date) <= date_trunc('month', current_date)
        )
        SELECT 
            mi.full_name,
            mi.employee_status,
            mi.employee_status_id,
            sd.*, 
            sg.*,
            COALESCE(ls.principal_amount, 0) as principal_amount,
            COALESCE(ls.total_loan_remaining, 0) as total_loan_remaining,
            COALESCE(ls.total_installments, 0) as total_installments,
            COALESCE(ls.paid_installments, 0) as paid_installments,
            np.next_due_date,
            np.next_due_amount,
            ob.total_unpaid_bills,
            ob.unpaid_bills_list,
            tui.total_unpaid_installments,
            tui.unpaid_installments_list,
            CASE WHEN ls.principal_amount IS NOT NULL THEN true ELSE false END as has_active_loan,
            (ob.total_unpaid_bills + tui.total_unpaid_installments) as grand_total_outstanding
        FROM member_info mi
        CROSS JOIN saving_data sd
        CROSS JOIN saving_growth sg
        LEFT JOIN loan_stats ls ON true
        LEFT JOIN next_payment np ON true
        CROSS JOIN total_unpaid_installments tui
        CROSS JOIN outstanding_bills ob
        """

        try:
            with connection.cursor() as cursor:
                cursor.execute(query, [member_id, member_id, member_id, member_id, member_id])
                columns = [col[0] for col in cursor.description]
                row = cursor.fetchone()
                result = dict(zip(columns, row)) if row else {}

                cursor.execute(
                    "SELECT COUNT(*) FROM close_account_requests WHERE member_id = %s AND status_id = 44 AND deleted_at IS NULL",
                    [member_id],
                )
                result['has_pending_close_account'] = cursor.fetchone()[0] > 0

                return Response(result)
        except Exception as e:
            return Response({'error': str(e)}, status=400)

    @action(detail=False, methods=['post'])
    def create_bulk_payment_token(self, request):
        import requests
        import base64
        import json
        from django.utils import timezone
        
        server_key = settings.MIDTRANS_SERVER_KEY
        is_production = settings.MIDTRANS_IS_PRODUCTION
        
        auth_str = f"{server_key}:"
        auth_bytes = auth_str.encode('utf-8')
        auth_base64 = base64.b64encode(auth_bytes).decode('utf-8')
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": f"Basic {auth_base64}"
        }
        
        if not request.user.is_authenticated or not hasattr(request.user, 'member'):
            member_id = request.data.get('member_id') or request.query_params.get('member_id')
            if not member_id:
                return Response({'error': 'Authentication required or member_id missing'}, status=401)
        else:
            member_id = request.user.member.id

        with connection.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) FROM close_account_requests WHERE member_id = %s AND status_id = 44 AND deleted_at IS NULL", [member_id])
            if cursor.fetchone()[0] > 0:
                return Response({'error': 'Akun Anda sedang dalam proses penutupan. Pembayaran tidak dapat dilakukan.'}, status=400)

        saving_ids = request.data.get('saving_ids', [])
        loan_ids = request.data.get('loan_ids', [])
        payment_type = request.data.get('payment_type')

        if not saving_ids and not loan_ids:
            return Response({'error': 'No bills selected.'}, status=400)

        saving_bills = []
        if saving_ids:
            saving_ids = [int(x) for x in saving_ids]
            query_savings = """
                SELECT id, amount_due, amount_paid, saving_type_id, bill_period_end
                FROM monthly_saving_bills
                WHERE id IN %s AND member_id = %s AND status_id = 38
            """
            with connection.cursor() as cursor:
                cursor.execute(query_savings, [tuple(saving_ids), member_id])
                saving_bills = [dict(zip([col[0] for col in cursor.description], row)) for row in cursor.fetchall()]

        loan_installments = []
        if loan_ids:
            loan_ids = [int(x) for x in loan_ids]
            query_loans = """
                SELECT li.id, li.amount_total, li.installment_number, li.loan_id
                FROM loan_installments li
                JOIN loans l ON l.id = li.loan_id
                WHERE li.id IN %s AND l.member_id = %s AND li.status_id IN (28, 30)
            """
            with connection.cursor() as cursor:
                cursor.execute(query_loans, [tuple(loan_ids), member_id])
                loan_installments = [dict(zip([col[0] for col in cursor.description], row)) for row in cursor.fetchall()]

        if not saving_bills and not loan_installments:
            return Response({'error': 'Selected bills are already paid or invalid.'}, status=400)

        with connection.cursor() as cursor:
            if loan_ids:
                cursor.execute("""
                    SELECT DISTINCT pgt.id, pgt.gateway_transaction_id
                    FROM loan_payments lp
                    JOIN payment_gateway_transactions pgt ON CAST(pgt.id AS varchar) = lp.payment_reference_id
                    WHERE lp.installment_id IN %s AND lp.status_id = 32
                """, [tuple(loan_ids)])
                for pgt_id, order_id in cursor.fetchall():
                    cursor.execute("UPDATE payment_gateway_transactions SET gateway_status = 'cancel', updated_at = NOW() WHERE id = %s", [pgt_id])
                    cursor.execute("UPDATE loan_payments SET status_id = 36, updated_at = NOW() WHERE payment_reference_id = %s", [str(pgt_id)])
            
            if saving_ids:
                cursor.execute("""
                    SELECT DISTINCT pgt.id, pgt.gateway_transaction_id
                    FROM saving_transactions st
                    JOIN payment_gateway_transactions pgt ON CAST(pgt.id AS varchar) = st.payment_reference_id
                    WHERE st.monthly_saving_bill_id IN %s AND st.status_id = 32
                """, [tuple(saving_ids)])
                for pgt_id, order_id in cursor.fetchall():
                    cursor.execute("UPDATE payment_gateway_transactions SET gateway_status = 'cancel', updated_at = NOW() WHERE id = %s", [pgt_id])
                    cursor.execute("UPDATE saving_transactions SET status_id = 36, updated_at = NOW() WHERE payment_reference_id = %s", [str(pgt_id)])

        subtotal = 0
        item_details = []
        
        for b in saving_bills:
            amount = int(b['amount_due'] - (b['amount_paid'] or 0))
            subtotal += amount
            label = "Simpanan Wajib" if b['saving_type_id'] == 1 else "Simpanan Sukarela"
            item_details.append({
                "id": f"SAV-{b['id']}",
                "price": amount,
                "quantity": 1,
                "name": label
            })
            
        for inst in loan_installments:
            amount = int(inst['amount_total'])
            subtotal += amount
            item_details.append({
                "id": f"INST-{inst['id']}",
                "price": amount,
                "quantity": 1,
                "name": f"Cicilan Pinjaman ke-{inst['installment_number']}"
            })

        fee_percentage = 0.0
        fee_fixed = 0.0
        
        if payment_type:
            with connection.cursor() as cursor:
                cursor.execute("SELECT fee_percentage, fee_fixed FROM payment_channels WHERE channel_code = %s AND is_active = TRUE", [payment_type])
                channel_row = cursor.fetchone()
                if channel_row:
                    fee_percentage = float(channel_row[0])
                    fee_fixed = float(channel_row[1])
        
        admin_fee = int((float(subtotal) * fee_percentage) / 100) + int(fee_fixed)
        gross_amount = subtotal + admin_fee

        if admin_fee > 0:
            fee_label = f"Biaya Layanan ({fee_percentage}%)" if fee_percentage > 0 else "Biaya Layanan"
            item_details.append({
                "id": "FEE-ADMIN",
                "price": admin_fee,
                "quantity": 1,
                "name": fee_label
            })

        order_id = f"KOP-BULK-{member_id}-{int(timezone.now().timestamp())}"
        url = "https://app.midtrans.com/snap/v1/transactions" if is_production else "https://app.sandbox.midtrans.com/snap/v1/transactions"
        
        first_name = ""
        email = ""
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT m.full_name, u.email 
                FROM members m
                inner join users u on m.user_id = u.id
                WHERE m.id = %s
            """, [member_id])
            member_row = cursor.fetchone()
            if member_row:
                first_name = member_row[0] or first_name
                email = member_row[1] or email

        payload = {
            "transaction_details": {
                "order_id": order_id,
                "gross_amount": gross_amount
            },
            "item_details": item_details,
            "customer_details": {
                "first_name": first_name,
                "email": email
            }
        }
        
        if payment_type:
            mapping = {
                'qris': ['other_qris'],
                'gopay': ['gopay'],
                'shopeepay': ['shopeepay'],
                'dana': ['other_qris'],
            }
            payload["enabled_payments"] = mapping.get(payment_type, [payment_type])

        try:
            response = requests.post(url, json=payload, headers=headers)
            res_data = response.json()
            
            if response.status_code != 201:
                error_msg = res_data.get('error_messages', ['Failed to create transaction with Midtrans'])[0]
                return Response({'error': error_msg}, status=400)
                
            snap_token = res_data['token']
            redirect_url = res_data['redirect_url']
            raw_data = json.dumps({"snap_token": snap_token})
            
            with connection.cursor() as cursor:
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
                
                total_items = len(saving_bills) + len(loan_installments)
                
                for b in saving_bills:
                    amount = int(b['amount_due'] - (b['amount_paid'] or 0))
                    item_fee = int((amount * fee_percentage) / 100) + int(fee_fixed / total_items) if total_items > 0 else 0
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
                            updated_at,
                            admin_fee
                        ) VALUES (%s, %s, 1, 1, %s, 32, %s, %s, NOW(), NOW(), NOW(), %s)
                    """, [member_id, b['saving_type_id'], amount, pgt_id, b['id'], item_fee])
                
                for inst in loan_installments:
                    amount = int(inst['amount_total'])
                    item_fee = int((amount * fee_percentage) / 100) + int(fee_fixed / total_items) if total_items > 0 else 0
                    cursor.execute("""
                        INSERT INTO loan_payments (
                            installment_id,
                            amount_paid,
                            admin_fee,
                            payment_date,
                            payment_method_id,
                            payment_reference_id,
                            status_id,
                            created_at,
                            updated_at
                        ) VALUES (%s, %s, %s, NOW(), 1, %s, 32, NOW(), NOW())
                    """, [inst['id'], amount, item_fee, pgt_id])
                    
            return Response({
                'snap_token': snap_token,
                'redirect_url': redirect_url,
                'order_id': order_id,
                'amount': gross_amount
            })
            
        except Exception as e:
            return Response({'error': f"Connection to Midtrans failed: {str(e)}"}, status=500)

    @action(detail=False, methods=['get'])
    def my_transactions(self, request):
        """
        Get recent transactions specifically for the logged-in member with filtering.
        """
        if not request.user.is_authenticated or not hasattr(request.user, 'member'):
            member_id = request.query_params.get('member_id')
            if not member_id:
                return Response({'error': 'member_id is required'}, status=400)
        else:
            member_id = request.user.member.id

        tx_type = request.query_params.get('type', 'all')
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        
        if end_date and len(end_date) == 10:  # Format YYYY-MM-DD
            end_date += ' 23:59:59'
        
        # Build individual queries
        savings_parts = [
            """SELECT 
                st.transaction_date, 
                tt.name AS transaction_type, 
                st.amount, 
                s.status_name AS status, 
                CASE 
                    WHEN st.payment_method_id = 1 THEN COALESCE(pgt.gateway_transaction_id, st.payment_reference_id)
                    ELSE st.payment_reference_id
                END AS reference""",
            "FROM saving_transactions st",
            "INNER JOIN transaction_types tt ON tt.id = st.transaction_type_id",
            "INNER JOIN statuses s ON s.id = st.status_id",
            "LEFT JOIN payment_gateway_transactions pgt ON st.payment_method_id = 1 AND CAST(pgt.id AS VARCHAR) = st.payment_reference_id",
            "WHERE st.member_id = %s"
        ]
        savings_params = [member_id]
        if start_date:
            savings_parts.append("AND st.transaction_date >= %s")
            savings_params.append(start_date)
        if end_date:
            savings_parts.append("AND st.transaction_date <= %s")
            savings_params.append(end_date)
        savings_q = " ".join(savings_parts)

        withdrawal_parts = [
            "SELECT w.request_date AS transaction_date, 'WITHDRAWAL' AS transaction_type, w.amount, s.status_name AS status, w.payment_reference_id AS reference",
            "FROM withdrawals w",
            "INNER JOIN statuses s ON s.id = w.status_id",
            "WHERE w.member_id = %s"
        ]
        withdrawal_params = [member_id]
        if start_date:
            withdrawal_parts.append("AND w.request_date >= %s")
            withdrawal_params.append(start_date)
        if end_date:
            withdrawal_parts.append("AND w.request_date <= %s")
            withdrawal_params.append(end_date)
        withdrawal_q = " ".join(withdrawal_parts)

        loan_parts = [
            """SELECT 
                lp.payment_date AS transaction_date, 
                'LOAN INSTALLMENT' AS transaction_type, 
                lp.amount_paid AS amount, 
                s.status_name AS status, 
                CASE 
                    WHEN lp.payment_method_id = 1 THEN COALESCE(pgt.gateway_transaction_id, lp.payment_reference_id)
                    ELSE lp.payment_reference_id
                END AS reference""",
            "FROM loan_payments lp",
            "INNER JOIN statuses s ON s.id = lp.status_id",
            "INNER JOIN loan_installments li ON li.id = lp.installment_id",
            "INNER JOIN loans l ON l.id = li.loan_id",
            "LEFT JOIN payment_gateway_transactions pgt ON lp.payment_method_id = 1 AND CAST(pgt.id AS VARCHAR) = lp.payment_reference_id",
            "WHERE l.member_id = %s"
        ]
        loan_params = [member_id]
        if start_date:
            loan_parts.append("AND lp.payment_date >= %s")
            loan_params.append(start_date)
        if end_date:
            loan_parts.append("AND lp.payment_date <= %s")
            loan_params.append(end_date)
        loan_q = " ".join(loan_parts)

        shu_parts = [
            """SELECT
                COALESCE(w.paid_at, w.created_at) AS transaction_date,
                'SHU DISTRIBUTION' AS transaction_type,
                w.total_shu AS amount,
                'COMPLETED' AS status,
                w.tf_reference_id AS reference""",
            "FROM shu_member_distributions w",
            "WHERE w.distributed_status = TRUE AND w.status_shu = TRUE AND w.member_id = %s"
        ]
        shu_params = [member_id]
        if start_date:
            shu_parts.append("AND w.paid_at >= %s")
            shu_params.append(start_date)
        if end_date:
            shu_parts.append("AND w.paid_at <= %s")
            shu_params.append(end_date)
        shu_q = " ".join(shu_parts)

        queries = []
        params = []

        if tx_type == 'all' or tx_type == 'deposit':
            queries.append(savings_q)
            params.extend(savings_params)
        
        if tx_type == 'all' or tx_type == 'withdrawal':
            queries.append(withdrawal_q)
            params.extend(withdrawal_params)
            
        if tx_type == 'all' or tx_type == 'loan':
            queries.append(loan_q)
            params.extend(loan_params)

        if tx_type == 'all' or tx_type == 'shu_distribution':
            queries.append(shu_q)
            params.extend(shu_params)

        if tx_type in ['mandatory', 'voluntary', 'principal']:
            if tx_type == 'mandatory': st_name = 'MANDATORY'
            elif tx_type == 'voluntary': st_name = 'VOLUNTARY'
            else: st_name = 'PRINCIPLE'
            queries = [savings_q + " AND tt.name = %s"]
            params = savings_params + [st_name]

        full_query = " UNION ALL ".join(queries) + " ORDER BY transaction_date DESC LIMIT 50"

        try:
            with connection.cursor() as cursor:
                cursor.execute(full_query, params)
                columns = [col[0] for col in cursor.description]
                rows = cursor.fetchall()
                results = [dict(zip(columns, row)) for row in rows]
                return Response(results)
        except Exception as e:
            return Response({'error': str(e)}, status=400)

class LoanInstallmentViewSet(viewsets.ModelViewSet):
    serializer_class = LoanInstallmentSerializer

    def get_queryset(self):
        if self.request.user.is_authenticated and hasattr(self.request.user, 'member'):
            return LoanInstallment.objects.filter(loan__member=self.request.user.member)
        return LoanInstallment.objects.all()
