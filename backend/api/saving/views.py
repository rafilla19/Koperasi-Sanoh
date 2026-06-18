# savings/views.py
import uuid
from datetime import datetime
from decimal import Decimal, InvalidOperation

from django.db.models import Q, Sum, Count
from django.db.models.functions import TruncMonth
from django.db import connection, transaction as db_transaction
from django.db.utils import ProgrammingError
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

import calendar
import os
from api.models import Members, MemberBankAccounts, Statuses, TransactionTypes
from .models import (
    ManualPayments, MemberSavingObligations, MemberSavingsConfig, MonthlySavingBills,
    Notifications, SavingTransactions, SavingTypes, SavingWallets, VoluntarySavingsRequests,
    Withdrawals,
)
from .serializers import (
    AdminSavingsTransactionSerializer,
    AdminWithdrawalSerializer,
    GenerateBillsSerializer,
    MemberSavingObligationsSerializer,
    MonthlySavingBillSerializer,
    NotificationSerializer,
    SavingTransactionsSerializer,
    SavingWalletsSerializer,
    VoluntarySavingsRequestAdminSerializer,
    VoluntarySavingsRequestCreateSerializer,
    WithdrawalCreateSerializer,
    WithdrawalSerializer,
)
from .email_utils import send_member_notification_email, send_withdrawal_paid_email

TEMP_MEMBER_ID = 5
_MEMBER_SAVINGS_CONFIG_TABLE_EXISTS = None


def _get_member_id_from_request(request):
    """Resolve current member id from request.
    Priority:
      1. X-MEMBER-ID header
      2. X-USER-EMAIL header -> lookup users->members
      3. member_id query param
      4. fallback to TEMP_MEMBER_ID
    """
    # 1) explicit header
    try:
        mid = request.headers.get('X-MEMBER-ID') or request.META.get('HTTP_X_MEMBER_ID')
        if mid:
            return int(mid)
    except Exception:
        pass

    # 2) user email header
    try:
        email = request.headers.get('X-USER-EMAIL') or request.META.get('HTTP_X_USER_EMAIL')
        if email:
            with connection.cursor() as cursor:
                cursor.execute("SELECT m.id FROM members m INNER JOIN users u ON u.id = m.user_id WHERE LOWER(u.email) = LOWER(%s) LIMIT 1", [email])
                row = cursor.fetchone()
                if row:
                    return int(row[0])
    except Exception:
        pass

    # 3) query param
    try:
        mid_q = request.query_params.get('member_id') if hasattr(request, 'query_params') else request.GET.get('member_id')
        if mid_q:
            return int(mid_q)
    except Exception:
        pass

    # fallback
    return TEMP_MEMBER_ID


def _member_savings_config_table_exists():
    global _MEMBER_SAVINGS_CONFIG_TABLE_EXISTS
    if _MEMBER_SAVINGS_CONFIG_TABLE_EXISTS is not None:
        return _MEMBER_SAVINGS_CONFIG_TABLE_EXISTS

    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT EXISTS ("
            "SELECT 1 FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_name = 'member_savings_configs'"
            ")"
        )
        _MEMBER_SAVINGS_CONFIG_TABLE_EXISTS = bool(cursor.fetchone()[0])
    return _MEMBER_SAVINGS_CONFIG_TABLE_EXISTS


def _get_member_savings_config(member_id):
    if not _member_savings_config_table_exists():
        return None

    try:
        return MemberSavingsConfig.objects.filter(member_id=member_id).first()
    except ProgrammingError as exc:
        if 'member_savings_configs' not in str(exc):
            raise
        return None


def _get_active_voluntary_amount(member_id):
    voluntary_type = SavingTypes.objects.filter(is_mandatory=False).first()
    if not voluntary_type:
        return Decimal('0')

    obligation = MemberSavingObligations.objects.filter(
        member_id=member_id,
        saving_type=voluntary_type,
        is_active=True,
        deleted_at__isnull=True,
    ).first()
    return obligation.monthly_amount if obligation else Decimal('0')


def _get_member_bank_account_status(member_id):
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT mba.bank_id, mba.account_number, mba.account_holder_name
            FROM member_bank_accounts mba
            WHERE mba.member_id = %s
            LIMIT 1
            """,
            [member_id],
        )
        row = cursor.fetchone()

    if not row:
        return {
            'is_complete': False,
            'bank_id': None,
            'account_number': None,
            'account_holder_name': None,
            'missing_fields': ['bank_id', 'account_number', 'account_holder_name'],
        }

    bank_id, account_number, account_holder_name = row
    fields = {
        'bank_id': bank_id,
        'account_number': account_number,
        'account_holder_name': account_holder_name,
    }
    missing_fields = [
        field_name
        for field_name, value in fields.items()
        if value is None or str(value).strip() == ''
    ]

    return {
        'is_complete': len(missing_fields) == 0,
        'bank_id': bank_id,
        'account_number': account_number,
        'account_holder_name': account_holder_name,
        'missing_fields': missing_fields,
    }


# ── MEMBER ───────────────────────────────────────────────────────

@api_view(['GET'])
def my_member_profile(request):
    """Get current member profile info including employee_status_id."""
    try:
        member_id = _get_member_id_from_request(request)
        member = Members.objects.get(id=member_id)
        config = _get_member_savings_config(member_id)
        employee_status_id = member.employee_status_id
        is_payroll = config.is_payroll if config else employee_status_id in (1, 2)

        # try to get linked user email for display
        user_email = None
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT u.email FROM users u INNER JOIN members m ON m.user_id = u.id WHERE m.id = %s LIMIT 1", [member_id])
                row = cursor.fetchone()
                if row:
                    user_email = row[0]
        except Exception:
            user_email = None
        return Response({
            'id': member.id,
            'full_name': member.full_name,
            'nik_employee': member.nik_employee,
            'nik_ktp': member.nik_ktp,
            'employee_status_id': employee_status_id,
            'is_payroll': is_payroll,
            'email': user_email,
        })
    except Members.DoesNotExist:
        return Response({'error': 'Member not found'}, status=404)


@api_view(['GET'])
def my_saving_wallets(request):
    member_id = _get_member_id_from_request(request)
    wallets = SavingWallets.objects.filter(
        member_id=member_id,
        deleted_at__isnull=True,
    )
    return Response(SavingWalletsSerializer(wallets, many=True).data)


@api_view(['GET', 'POST'])
def my_bank_account_status(request):
    member_id = _get_member_id_from_request(request)

    if request.method == 'GET':
        return Response(_get_member_bank_account_status(member_id))

    bank_id = request.data.get('bank_id')
    account_number = (request.data.get('account_number') or '').strip()
    account_holder_name = (request.data.get('account_holder_name') or '').strip()

    errors = []
    if not bank_id:
        errors.append('Bank wajib dipilih')
    if not account_number:
        errors.append('Nomor rekening wajib diisi')
    if not account_holder_name:
        errors.append('Nama pemilik rekening wajib diisi')
    if errors:
        return Response({'error': ', '.join(errors)}, status=400)

    MemberBankAccounts.objects.update_or_create(
        member_id=member_id,
        defaults={
            'bank_id': bank_id,
            'account_number': account_number,
            'account_holder_name': account_holder_name,
        },
    )

    return Response({
        'message': 'Rekening bank berhasil disimpan',
        'is_complete': True,
        'bank_id': bank_id,
        'account_number': account_number,
        'account_holder_name': account_holder_name,
    })


@api_view(['GET'])
def my_saving_transactions(request):
    member_id = _get_member_id_from_request(request)
    qs = SavingTransactions.objects.filter(member_id=member_id)
    start = request.query_params.get('start')
    end = request.query_params.get('end')
    if start:
        qs = qs.filter(transaction_date__date__gte=start)
    if end:
        qs = qs.filter(transaction_date__date__lte=end)
    return Response(SavingTransactionsSerializer(qs.order_by('-transaction_date'), many=True).data)


@api_view(['GET', 'POST'])
def my_withdrawals(request):
    if request.method == 'GET':
        member_id = _get_member_id_from_request(request)
        withdrawals = Withdrawals.objects.filter(
            member_id=member_id,
            deleted_at__isnull=True,
        ).order_by('-request_date')
        return Response(WithdrawalSerializer(withdrawals, many=True).data)

    serializer = WithdrawalCreateSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=400)

    member_id = _get_member_id_from_request(request)
    bank_status = _get_member_bank_account_status(member_id)
    if not bank_status['is_complete']:
        return Response(
            {
                'error': 'Lengkapi rekening bank pencairan terlebih dahulu.',
                'code': 'BANK_ACCOUNT_INCOMPLETE',
                'missing_fields': bank_status['missing_fields'],
            },
            status=400,
        )

    try:
        voluntary_type = SavingTypes.objects.get(is_mandatory=False)
    except SavingTypes.DoesNotExist:
        return Response({'error': 'Voluntary saving type not found'}, status=404)

    pending_status = Statuses.objects.filter(
        status_code='REQUESTED', status_category__category_name='WITHDRAWAL'
    ).first()
    if not pending_status:
        return Response({'error': 'Status REQUESTED tidak ditemukan di database'}, status=500)

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT sp_create_withdrawal_request(%s, %s, %s, %s, %s)",
                [
                    member_id,
                    voluntary_type.id,
                    serializer.validated_data['amount'],
                    serializer.validated_data.get('notes', ''),
                    pending_status.id,
                ]
            )
            withdrawal_id = cursor.fetchone()[0]
    except Exception as exc:
        msg = str(exc)
        if 'Saldo tidak mencukupi' in msg:
            return Response({'error': 'Saldo tidak cukup'}, status=400)
        if 'Wallet tidak ditemukan' in msg:
            return Response({'error': 'Wallet tidak ditemukan'}, status=404)
        return Response({'error': msg}, status=400)

    return Response({'message': 'Withdrawal request submitted', 'withdrawal_id': withdrawal_id}, status=201)


@api_view(['GET', 'POST'])
def my_voluntary_request(request):
    """Member mengajukan atau melihat perubahan jumlah simpanan sukarela."""
    if request.method == 'GET':
        member_id = _get_member_id_from_request(request)
        requests = VoluntarySavingsRequests.objects.filter(member_id=member_id).order_by('-created_at')
        return Response(VoluntarySavingsRequestAdminSerializer(requests, many=True).data)

    member_id = _get_member_id_from_request(request)
    if VoluntarySavingsRequests.objects.filter(member_id=member_id, status_id=41).exists():
        return Response({'error': 'Kamu sudah memiliki permintaan yang sedang menunggu persetujuan'}, status=400)

    serializer = VoluntarySavingsRequestCreateSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=400)

    config = _get_member_savings_config(member_id)
    current_amount = config.voluntary_amount if config else _get_active_voluntary_amount(member_id)

    VoluntarySavingsRequests.objects.create(
        member_id=member_id,
        current_amount=current_amount,
        requested_amount=serializer.validated_data['requested_amount'],
        status='pending',
        status_id=41,
    )
    return Response({'message': 'Permintaan perubahan simpanan sukarela berhasil diajukan'}, status=201)


@api_view(['GET', 'PATCH'])
def my_notifications(request):
    """GET notifikasi member; PATCH?mark_read=true untuk tandai semua sudah dibaca."""
    member_id = _get_member_id_from_request(request)
    notifs = Notifications.objects.filter(member_id=member_id).order_by('-created_at')

    if request.method == 'PATCH' or request.query_params.get('mark_read') == 'true':
        notifs.filter(is_read=False).update(is_read=True)

    return Response(NotificationSerializer(notifs, many=True).data)


@api_view(['GET'])
def my_paid_bills(request):
    """Paid monthly_saving_bills (status_id=39) for current member — used for Transaction table."""
    member_id = _get_member_id_from_request(request)
    bills = MonthlySavingBills.objects.filter(
        member_id=member_id,
        status_id=39,
        deleted_at__isnull=True,
    ).select_related('saving_type').order_by('-bill_period_start')
    return Response(MonthlySavingBillSerializer(bills, many=True).data)


@api_view(['GET'])
def my_payment_schedule(request):
    """PAID (status_id=39) and UPCOMING (status_id=32) bills for current member."""
    member_id = _get_member_id_from_request(request)
    bills = MonthlySavingBills.objects.filter(
        member_id=member_id,
        deleted_at__isnull=True,
        status_id__in=[39, 32],
    ).select_related('saving_type', 'status').order_by('-bill_period_start')

    paid = [b for b in bills if b.status_id == 39]
    upcoming = [b for b in bills if b.status_id == 32]

    return Response({
        'paid': MonthlySavingBillSerializer(paid, many=True).data,
        'upcoming': MonthlySavingBillSerializer(upcoming, many=True).data,
    })


@api_view(['GET'])
def my_saving_obligations(request):
    """Monthly mandatory and voluntary saving nominals for the current member."""
    member_id = _get_member_id_from_request(request)
    obligations = MemberSavingObligations.objects.filter(
        member_id=member_id,
        is_active=True,
        deleted_at__isnull=True,
    ).select_related('saving_type')

    mandatory_amount = 0
    voluntary_amount = 0
    for ob in obligations:
        if ob.saving_type.is_mandatory:
            mandatory_amount = ob.monthly_amount
        else:
            voluntary_amount = ob.monthly_amount

    return Response({
        'mandatory_amount': mandatory_amount,
        'voluntary_amount': voluntary_amount,
    })


@api_view(['GET'])
def my_savings_monthly_trend(request):
    """Return monthly sums for voluntary deposits and paid withdrawals for current member.
    Query params: ?months=<n> default 6
    """
    from datetime import date

    try:
        months = max(1, min(24, int(request.query_params.get('months', 6))))
    except (ValueError, TypeError):
        months = 6

    def month_start(n_ago):
        today = date.today()
        total = today.year * 12 + today.month - 1 - n_ago
        return date(total // 12, total % 12 + 1, 1)

    member_id = _get_member_id_from_request(request)

    # Use TruncMonth aggregation to ensure grouping by transaction_date for deposits
    start = month_start(months - 1)

    deposit_rows = (
        SavingTransactions.objects
        .filter(
            member_id=member_id,
            saving_type__is_mandatory=False,
            transaction_type_id=1,
            transaction_date__date__gte=start,
        )
        .annotate(month=TruncMonth('transaction_date'))
        .values('month')
        .annotate(total=Sum('amount'))
        .order_by('month')
    )

    withdrawal_rows = (
        Withdrawals.objects
        .filter(
            member_id=member_id,
            saving_type__is_mandatory=False,
            status_id=19,
            paid_date__date__gte=start,
        )
        .annotate(month=TruncMonth('paid_date'))
        .values('month')
        .annotate(total=Sum('amount'))
        .order_by('month')
    )

    deposit_map = {row['month'].date().strftime('%b %Y'): float(row['total'] or 0) for row in deposit_rows}
    withdrawal_map = {row['month'].date().strftime('%b %Y'): float(row['total'] or 0) for row in withdrawal_rows}

    monthly = []
    for i in range(months - 1, -1, -1):
        d = month_start(i)
        label = d.strftime('%b %Y')
        monthly.append({
            'month': label,
            'deposits': deposit_map[label] if label in deposit_map else 0,
            'withdrawals': withdrawal_map[label] if label in withdrawal_map else 0,
        })

    return Response({'monthly_trend': monthly})


@api_view(['GET'])
def my_savings_timeline(request):
    """Return a combined list (union) of voluntary deposits (transaction_date)
    and paid withdrawals (paid_date) for the current member.
    Query params: ?months=<n> default 6 (limits how far back to include)
    """
    from datetime import date

    try:
        months = max(1, min(48, int(request.query_params.get('months', 6))))
    except (ValueError, TypeError):
        months = 6

    def month_start(n_ago):
        today = date.today()
        total = today.year * 12 + today.month - 1 - n_ago
        return date(total // 12, total % 12 + 1, 1)

    member_id = _get_member_id_from_request(request)
    start = month_start(months - 1)

    deposits = list(
        SavingTransactions.objects
        .filter(
            member_id=member_id,
            transaction_type_id=1,
            saving_type__is_mandatory=False,
            transaction_date__date__gte=start,
        )
        .values('amount', 'transaction_date')
        .order_by('transaction_date')
    )

    withdrawals_qs = list(
        Withdrawals.objects
        .filter(
            member_id=member_id,
            saving_type__is_mandatory=False,
            status_id=19,
            paid_date__date__gte=start,
        )
        .values('amount', 'paid_date')
        .order_by('paid_date')
    )

    events = []
    for d in deposits:
        events.append({
            'type': 'deposit',
            'amount': float(d.get('amount') or 0),
            'date': d.get('transaction_date').isoformat() if d.get('transaction_date') else None,
        })
    for w in withdrawals_qs:
        events.append({
            'type': 'withdrawal',
            'amount': float(w.get('amount') or 0),
            'date': w.get('paid_date').isoformat() if w.get('paid_date') else None,
        })

    # sort by date asc
    events = [e for e in events if e.get('date')]
    events.sort(key=lambda x: x['date'])

    return Response({'timeline': events})


# ── ADMIN ────────────────────────────────────────────────────────

@api_view(['GET', 'PATCH'])
def admin_mandatory_amount(request):
    """
    GET  → lihat jumlah simpanan wajib saat ini.
    PATCH → update jumlah simpanan wajib untuk semua member.
    Body: { "new_amount": 100000 }
    """
    # Simpanan Wajib = is_mandatory=True, bukan Simpanan Pokok
    mandatory_type = SavingTypes.objects.filter(
        is_mandatory=True
    ).exclude(name__icontains='pokok').first()

    if not mandatory_type:
        return Response({'error': 'Tipe simpanan wajib tidak ditemukan'}, status=404)

    if request.method == 'GET':
        return Response({
            'saving_type_id': mandatory_type.id,
            'name': mandatory_type.name,
            'current_amount': mandatory_type.minimum_amount,
        })

    # PATCH
    try:
        new_amount = Decimal(str(request.data.get('new_amount', '')))
        if new_amount <= 0:
            raise ValueError
    except (InvalidOperation, ValueError):
        return Response({'error': 'new_amount harus berupa angka positif'}, status=400)

    with db_transaction.atomic():
        updated_count = MemberSavingObligations.objects.filter(
            saving_type_id=mandatory_type.id,
            is_active=True,
        ).update(monthly_amount=new_amount, updated_at=timezone.now())

        mandatory_type.minimum_amount = new_amount
        mandatory_type.updated_at = timezone.now()
        mandatory_type.save(update_fields=['minimum_amount', 'updated_at'])

    return Response({
        'message': 'Jumlah simpanan wajib berhasil diperbarui',
        'saving_type_id': mandatory_type.id,
        'name': mandatory_type.name,
        'new_amount': mandatory_type.minimum_amount,
        'updated_members': updated_count,
    })


@api_view(['PUT'])
def admin_mandatory_update_all(request):
    """
    PUT /savings/mandatory/update-all/
    Body: { "amount": 100000 }
    Update monthly_amount for all active mandatory obligations AND
    update minimum_amount in saving_types.
    """
    mandatory_type = SavingTypes.objects.filter(
        is_mandatory=True
    ).exclude(name__icontains='pokok').first()

    if not mandatory_type:
        return Response({'error': 'Tipe simpanan wajib tidak ditemukan'}, status=404)

    try:
        amount = Decimal(str(request.data.get('amount', '')))
        if amount <= 0:
            raise ValueError
    except (InvalidOperation, ValueError):
        return Response({'error': 'amount harus berupa angka positif'}, status=400)

    if amount < (mandatory_type.minimum_amount or 0):
        return Response({
            'error': f'amount tidak boleh kurang dari minimum saat ini ({mandatory_type.minimum_amount})'
        }, status=400)

    with db_transaction.atomic():
        updated_count = MemberSavingObligations.objects.filter(
            saving_type_id=mandatory_type.id,
            is_active=True,
        ).update(monthly_amount=amount, updated_at=timezone.now())

        mandatory_type.minimum_amount = amount
        mandatory_type.updated_at = timezone.now()
        mandatory_type.save(update_fields=['minimum_amount', 'updated_at'])

    return Response({
        'message': 'Jumlah simpanan wajib berhasil diperbarui untuk semua member',
        'saving_type_id': mandatory_type.id,
        'new_amount': amount,
        'updated_members': updated_count,
    })


@api_view(['GET'])
def admin_voluntary_requests(request):
    """
    Daftar pengajuan perubahan simpanan sukarela.
    Query params:
      ?status=pending|approved|rejected  (default: pending)
      ?search=<nama/nik>
    """
    qs = VoluntarySavingsRequests.objects.all()

    status_filter = request.query_params.get('status', 'pending')
    if status_filter:
        if status_filter.lower() == 'pending':
            qs = qs.filter(status_id=41)
        elif status_filter.lower() == 'approved':
            qs = qs.filter(status_id=42)
        elif status_filter.lower() == 'rejected':
            qs = qs.filter(status_id=43)
        else:
            qs = qs.filter(status__iexact=status_filter)

    search = request.query_params.get('search')
    if search:
        qs = qs.filter(
            Q(member__full_name__icontains=search) |
            Q(member__nik_employee__icontains=search)
        )

    return Response(
        VoluntarySavingsRequestAdminSerializer(qs.order_by('-created_at'), many=True).data
    )


@api_view(['POST'])
def admin_approve_voluntary_request(request, pk):
    """
    Approve pengajuan perubahan simpanan sukarela.
    Otomatis update jumlah sukarela member dan kirim notifikasi.
    """
    try:
        req = VoluntarySavingsRequests.objects.get(pk=pk, status_id=41)
    except VoluntarySavingsRequests.DoesNotExist:
        return Response({'error': 'Pengajuan tidak ditemukan atau sudah diproses'}, status=404)

    # Update legacy config storage when the optional table exists.
    if _member_savings_config_table_exists():
        MemberSavingsConfig.objects.update_or_create(
            member_id=req.member_id,
            defaults={'voluntary_amount': req.requested_amount},
        )

    # Update actual obligation record for voluntary saving type.
    voluntary_type = SavingTypes.objects.filter(is_mandatory=False).first()
    if voluntary_type:
        obligation, created = MemberSavingObligations.objects.get_or_create(
            member_id=req.member_id,
            saving_type=voluntary_type,
            defaults={
                'monthly_amount': req.requested_amount,
                'is_active': True,
                'created_at': timezone.now(),
                'updated_at': timezone.now(),
            }
        )
        if not created:
            obligation.monthly_amount = req.requested_amount
            obligation.is_active = True
            obligation.updated_at = timezone.now()
            obligation.save(update_fields=['monthly_amount', 'is_active', 'updated_at'])

    req.status = 'approved'
    req.status_id = 42
    req.processed_date = timezone.now()
    req.save()

    Notifications.objects.create(
        member_id=req.member_id,
        title='Perubahan Simpanan Sukarela Disetujui',
        message=(
            f'Permintaan perubahan simpanan sukarela Anda dari '
            f'Rp {int(req.current_amount):,} menjadi Rp {int(req.requested_amount):,} '
            f'telah disetujui.'
        ),
        notification_type='voluntary_approved',
        reference_id=req.id,
    )

    send_member_notification_email(
        req.member_id,
        'Perubahan Simpanan Sukarela Disetujui',
        (
            f'Halo {req.member.full_name},\n\n'
            f'Permintaan perubahan simpanan sukarela Anda dari Rp {int(req.current_amount):,} '
            f'menjadi Rp {int(req.requested_amount):,} telah disetujui oleh admin.\n\n'
            'Silakan periksa status Anda di dashboard.'
        )
    )

    return Response({'message': 'Pengajuan berhasil disetujui'})


@api_view(['POST'])
def admin_reject_voluntary_request(request, pk):
    """
    Tolak pengajuan perubahan simpanan sukarela.
    Body: { "reject_reason": "..." }  (opsional)
    """
    try:
        req = VoluntarySavingsRequests.objects.get(pk=pk, status_id=41)
    except VoluntarySavingsRequests.DoesNotExist:
        return Response({'error': 'Pengajuan tidak ditemukan atau sudah diproses'}, status=404)

    reject_reason = request.data.get('reject_reason', '')

    req.status = 'rejected'
    req.status_id = 43
    req.reject_reason = reject_reason
    req.processed_date = timezone.now()
    req.save()

    Notifications.objects.create(
        member_id=req.member_id,
        title='Perubahan Simpanan Sukarela Ditolak',
        message=(
            f'Permintaan perubahan simpanan sukarela Anda dari '
            f'Rp {int(req.current_amount):,} menjadi Rp {int(req.requested_amount):,} '
            f'ditolak. Alasan: {reject_reason or "Tidak ada alasan."}'
        ),
        notification_type='voluntary_rejected',
        reference_id=req.id,
    )

    return Response({'message': 'Pengajuan berhasil ditolak'})


def _get_dept_map(member_ids):
    """Satu query untuk ambil {member_id: department_name} dari DB."""
    if not member_ids:
        return {}
    try:
        placeholders = ','.join(['%s'] * len(member_ids))
        with connection.cursor() as cursor:
            cursor.execute(
                f"SELECT m.id, d.department_name FROM members m "
                f"JOIN departments d ON d.id = m.department_id "
                f"WHERE m.id IN ({placeholders})",
                member_ids,
            )
            return {row[0]: row[1] for row in cursor.fetchall()}
    except Exception:
        return {}


def _get_employee_status_map(member_ids):
    """Satu query untuk ambil {member_id: status_name} dari employee_status."""
    if not member_ids:
        return {}
    try:
        placeholders = ','.join(['%s'] * len(member_ids))
        with connection.cursor() as cursor:
            cursor.execute(
                f"SELECT m.id, es.status_name FROM members m "
                f"JOIN employee_statuses es ON es.id = m.employee_status_id "
                f"WHERE m.id IN ({placeholders})",
                member_ids,
            )
            return {row[0]: row[1] for row in cursor.fetchall()}
    except Exception:
        return {}


@api_view(['GET'])
def admin_all_transactions(request):
    """
    Semua transaksi simpanan dengan pencarian dan filter.
    Query params:
      ?search=<nama/nik/kode transaksi>
      ?month=<1-12>  ?year=<yyyy>
      ?saving_type=<id>
      ?status=<status_code>
    """
    qs = SavingTransactions.objects.all()

    search = request.query_params.get('search')
    if search:
        qs = qs.filter(
            Q(member__full_name__icontains=search) |
            Q(member__nik_employee__icontains=search) |
            Q(member__nik_ktp__icontains=search) |
            Q(transaction_code__icontains=search)
        )

    year = request.query_params.get('year')
    month = request.query_params.get('month')
    if year:
        qs = qs.filter(transaction_date__year=int(year))
    if month:
        qs = qs.filter(transaction_date__month=int(month))

    saving_type = request.query_params.get('saving_type')
    if saving_type:
        qs = qs.filter(saving_type_id=saving_type)

    status_code = request.query_params.get('status')
    if status_code:
        qs = qs.filter(status__status_code=status_code)

    is_mandatory = request.query_params.get('is_mandatory')
    if is_mandatory is not None:
        qs = qs.filter(saving_type__is_mandatory=(is_mandatory.lower() == 'true'))

    qs = qs.select_related('member', 'saving_type', 'transaction_type', 'status', 'payment_method')
    qs = qs.order_by('-transaction_date')

    # Build department map in one query to avoid N+1
    member_ids = list(qs.values_list('member_id', flat=True).distinct())
    dept_map = _get_dept_map(member_ids)

    serializer = AdminSavingsTransactionSerializer(
        qs, many=True, context={'dept_map': dept_map}
    )
    return Response(serializer.data)


@api_view(['GET'])
def admin_dashboard_overview(request):
    """
    Dashboard overview for admin home.
    - total_assets: interest_paid + mandatory_saving + admin_fee + SHU_portion
        * interest_paid   : SUM(amount_interest) from paid loan installments (status_id=29)
        * mandatory_saving: SUM(balance) from saving_wallets where saving_type_id=1
        * admin_fee       : SUM(fee_admin) from loans with paid/settled status
        * SHU_portion     : net_profit from latest shu_results × SUM of percentages
                            from master_configurations where distributed_member=FALSE
                            (Jasa Usaha, Dana Sosial, Dana Cadangan)
    - current_month_shu: SHU for current month
    - active_members: active users in users table
    - pending_approvals: total count for pending registrations, close account requests,
                         loan applications, withdrawal requests, voluntary saving requests
    """
    now = timezone.now()
    current_month = now.month

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT COALESCE(SUM(balance), 0)
                FROM saving_wallets
                WHERE saving_type_id = 1 AND deleted_at IS NULL
                """
            )
            total_mandatory = cursor.fetchone()[0] or 0

            cursor.execute(
                """
                SELECT COALESCE(SUM(total_shu), 0)
                FROM shu_member_distributions_monthly
                WHERE distributed_status = FALSE
                """
            )
            current_month_shu = cursor.fetchone()[0] or 0

            # Count members linked to active users (total anggota)
            cursor.execute("SELECT COUNT(m.id) FROM members m INNER JOIN users u ON m.user_id = u.id WHERE u.is_active = TRUE")
            active_members = cursor.fetchone()[0] or 0

            cursor.execute(
                "SELECT COUNT(*) FROM registrations WHERE deleted_at IS NULL AND status_id IN (3, 6)"
            )
            pending_registrations = cursor.fetchone()[0] or 0

            cursor.execute(
                "SELECT COUNT(*) FROM close_account_requests WHERE deleted_at IS NULL AND status_id = 44"
            )
            pending_close_accounts = cursor.fetchone()[0] or 0

            cursor.execute(
                """
                SELECT COUNT(*)
                FROM loan_applications la
                INNER JOIN members m ON la.member_id = m.id
                INNER JOIN users u ON m.user_id = u.id
                WHERE la.status_id = 21
                  AND u.is_active IS TRUE
                """
            )
            pending_loans = cursor.fetchone()[0] or 0

            cursor.execute(
                """
                SELECT COUNT(*)
                FROM withdrawals w
                INNER JOIN statuses s ON s.id = w.status_id
                WHERE w.deleted_at IS NULL
                  AND s.status_code IN ('REQUESTED', 'PENDING_VERIFICATION')
                """
            )
            pending_withdrawals = cursor.fetchone()[0] or 0

            cursor.execute(
                "SELECT COUNT(*) FROM voluntary_savings_requests WHERE status_id = 41"
            )
            pending_voluntary = cursor.fetchone()[0] or 0

            pending_requests = []

            cursor.execute(
                """
                SELECT r.id, r.full_name, r.email, r.created_at, s.status_code
                FROM registrations r
                LEFT JOIN statuses s ON s.id = r.status_id
                WHERE r.deleted_at IS NULL AND r.status_id IN (3, 6)
                ORDER BY r.created_at DESC
                LIMIT 5
                """
            )
            for request_row in cursor.fetchall():
                request_id, full_name, email, created_at, status_code = request_row
                pending_requests.append({
                    'request_id': request_id,
                    'request_type': 'Member Registration',
                    'member_name': full_name,
                    'details': email or '',
                    'status': status_code or 'PENDING',
                    'request_date': created_at.isoformat() if created_at else None,
                    'link': f'/dashboard/admin/approvals/{request_id}?type=new',
                })

            cursor.execute(
                """
                SELECT cr.id, m.full_name, cr.reason, cr.request_date, s.status_code
                FROM close_account_requests cr
                INNER JOIN members m ON m.id = cr.member_id
                LEFT JOIN statuses s ON s.id = cr.status_id
                WHERE cr.deleted_at IS NULL AND cr.status_id = 44
                ORDER BY cr.request_date DESC
                LIMIT 5
                """
            )
            for request_row in cursor.fetchall():
                request_id, full_name, reason, request_date, status_code = request_row
                pending_requests.append({
                    'request_id': request_id,
                    'request_type': 'Close Account',
                    'member_name': full_name,
                    'details': reason or '',
                    'status': status_code or 'SUBMIT',
                    'request_date': request_date.isoformat() if request_date else None,
                    'link': f'/dashboard/admin/approvals/{request_id}?type=close',
                })

            cursor.execute(
                """
                SELECT la.id, m.full_name, la.purpose, la.duration_months, la.amount_requested, la.applied_at
                FROM loan_applications la
                INNER JOIN members m ON la.member_id = m.id
                INNER JOIN users u ON m.user_id = u.id
                WHERE la.status_id = 21
                  AND u.is_active IS TRUE
                ORDER BY la.applied_at DESC
                LIMIT 5
                """
            )
            for request_row in cursor.fetchall():
                request_id, full_name, purpose, duration_months, amount_requested, applied_at = request_row
                pending_requests.append({
                    'request_id': request_id,
                    'request_type': 'Loan Approval',
                    'member_name': full_name,
                    'details': purpose or f'{duration_months} Bulan',
                    'status': 'REQUESTED',
                    'amount': float(amount_requested or 0),
                    'request_date': applied_at.isoformat() if applied_at else None,
                    'link': f'/dashboard/admin/ls-loans/{request_id}',
                })

            cursor.execute(
                """
                SELECT w.id, m.full_name, w.amount, w.notes, w.request_date, s.status_code
                FROM withdrawals w
                INNER JOIN members m ON m.id = w.member_id
                INNER JOIN statuses s ON s.id = w.status_id
                WHERE w.deleted_at IS NULL
                  AND s.status_code IN ('REQUESTED', 'PENDING_VERIFICATION')
                ORDER BY w.request_date DESC
                LIMIT 5
                """
            )
            for request_row in cursor.fetchall():
                request_id, full_name, amount, notes, request_date, status_code = request_row
                pending_requests.append({
                    'request_id': request_id,
                    'request_type': 'Withdrawal Request',
                    'member_name': full_name,
                    'details': notes or '',
                    'status': status_code or 'PENDING',
                    'amount': float(amount or 0),
                    'request_date': request_date.isoformat() if request_date else None,
                    'link': f'/dashboard/admin/withdrawal-requests/{request_id}',
                })

            cursor.execute(
                """
                SELECT v.id, m.full_name, v.current_amount, v.requested_amount, v.created_at, v.status
                FROM voluntary_savings_requests v
                INNER JOIN members m ON m.id = v.member_id
                WHERE v.status_id = 41
                ORDER BY v.created_at DESC
                LIMIT 5
                """
            )
            for request_row in cursor.fetchall():
                request_id, full_name, current_amount, requested_amount, created_at, status = request_row
                pending_requests.append({
                    'request_id': request_id,
                    'request_type': 'Voluntary Saving Request',
                    'member_name': full_name,
                    'details': f'Requested: Rp {int(requested_amount or 0):,}',
                    'status': status or 'pending',
                    'amount': float(requested_amount or 0),
                    'request_date': created_at.isoformat() if created_at else None,
                    'link': '/dashboard/admin/voluntary-savings',
                })

            # ── NEW total_assets components ──────────────────────────────────────

            # 1. Total Interest Paid
            cursor.execute(
                """
                SELECT COALESCE(SUM(amount_interest), 0)
                FROM loan_installments 
                WHERE status_id IN (29,30)
                """
            )
            total_interest_paid = cursor.fetchone()[0] or 0

            # 2. Total Admin Fee
            cursor.execute(
                """
                SELECT COALESCE(SUM(fee_admin), 0)
                FROM loan_installments 
                WHERE status_id IN (29,30)
                """
            )
            total_admin_fee = cursor.fetchone()[0] or 0

            # 3. Total Principle Saving
            cursor.execute(
                """
                SELECT COALESCE(SUM(balance), 0)
                FROM saving_wallets
                WHERE saving_type_id = 3
                """
            )
            total_principle_saving = cursor.fetchone()[0] or 0

            # SHU Cooperative Portion is NO LONGER included in total_assets based on user request,
            # but we keep the logic here if it's still needed in the breakdown
            cursor.execute(
                """
                SELECT COALESCE(SUM(percentage), 0)
                FROM master_configurations
                WHERE distributed_member = FALSE
                  AND deleted_at IS NULL
                """
            )
            shu_non_distributed_pct = float(cursor.fetchone()[0] or 0)

            cursor.execute(
                """
                SELECT COALESCE(SUM(net_profit), 0)
                FROM shu_results
                WHERE deleted_at IS NULL
                """
            )
            total_shu_net_profit = float(cursor.fetchone()[0] or 0)

            shu_cooperative_portion = total_shu_net_profit * (shu_non_distributed_pct / 100.0)

        pending_requests.sort(key=lambda item: item.get('request_date') or '', reverse=True)
        pending_approvals = (
            pending_registrations + pending_close_accounts + pending_loans + pending_withdrawals + pending_voluntary
        )

        # Formula baru sesuai request user:
        # total_assets = total_interest + total_admin_fee + total_principle_saving
        total_assets = (
            float(total_interest_paid)
            + float(total_admin_fee)
            + float(total_principle_saving)
        )

        return Response({
            'total_assets': total_assets,
            'total_assets_breakdown': {
                'total_interest': float(total_interest_paid),
                'total_admin_fee': float(total_admin_fee),
                'total_principle_saving': float(total_principle_saving),
                'shu_cooperative_portion': round(shu_cooperative_portion, 2),
                'shu_non_distributed_pct': shu_non_distributed_pct,
                'shu_total_net_profit': total_shu_net_profit,
            },
            'current_month_shu': float(current_month_shu or 0),
            'active_members': int(active_members),
            'pending_approvals': int(pending_approvals),
            'pending_requests': pending_requests,
        })
    except Exception as exc:
        return Response({'error': str(exc)}, status=500)


@api_view(['GET'])
def admin_savings_stats(request):
    """
    KPI stats untuk halaman Mandatory & Voluntary Savings.
    - savings_active   : jumlah member yang punya transaksi simpanan
    - transaction_pending : jumlah transaksi berstatus pending
    - total_amount_pending: total amount transaksi pending
    """
    pending_qs = SavingTransactions.objects.filter(status__status_code='pending')
    return Response({
        'savings_active': SavingTransactions.objects.values('member_id').distinct().count(),
        'transaction_pending': pending_qs.count(),
        'total_amount_pending': pending_qs.aggregate(total=Sum('amount'))['total'] or 0,
    })


@api_view(['GET'])
def admin_savings_analytics(request):
    """
    Analytics ringkasan simpanan: wallet totals + tren transaksi bulanan.
    Query params: ?months=<3|6|12>  (default 6)
    """
    from datetime import date

    def month_start(n_ago):
        today = date.today()
        total = today.year * 12 + today.month - 1 - n_ago
        return date(total // 12, total % 12 + 1, 1)

    try:
        months = max(1, min(24, int(request.query_params.get('months', 6))))
    except (ValueError, TypeError):
        months = 6

    wallet_rows = (
        SavingWallets.objects
        .filter(deleted_at__isnull=True)
        .values('saving_type__name')
        .annotate(total=Sum('balance'))
    )

    total_wajib = total_sukarela = total_pokok = 0.0
    for row in wallet_rows:
        name = (row['saving_type__name'] or '').upper()
        val = float(row['total'] or 0)
        if 'MANDATORY' in name:
            total_wajib += val
        elif 'VOLUNTARY' in name:
            total_sukarela += val
        elif 'PRINCIPLE' in name:
            total_pokok += val

    # Total anggota: count members that have an active user (matches admin definition)
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT COUNT(m.id) FROM members m INNER JOIN users u ON m.user_id = u.id WHERE u.is_active = TRUE")
            tm_row = cursor.fetchone()
            total_members = int(tm_row[0]) if tm_row and tm_row[0] is not None else 0
    except Exception:
        total_members = 0

    total_withdrawal = float(
        Withdrawals.objects
        .filter(deleted_at__isnull=True, status_id=19)
        .aggregate(total=Sum('amount'))['total'] or 0
    )

    # Calculate remaining balance saving used from loan fund allocations
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT COALESCE(SUM(remaining_amount),0) FROM loan_fund_allocations INNER JOIN loans l ON loan_id = l.id WHERE l.status_id = 25"
            )
            rb_row = cursor.fetchone()
            remaining_saving_used = float(rb_row[0]) if rb_row and rb_row[0] is not None else 0.0
    except Exception:
        remaining_saving_used = 0.0

    monthly_trend = []
    for i in range(months - 1, -1, -1):
        d = month_start(i)
        rows = (
            SavingTransactions.objects
            .filter(transaction_date__year=d.year, transaction_date__month=d.month)
            .values('saving_type__name')
            .annotate(total=Sum('amount'))
        )
        wajib_m = sukarela_m = pokok_m = 0.0
        for row in rows:
            name = (row['saving_type__name'] or '').upper()
            val = float(row['total'] or 0)
            if 'MANDATORY' in name:
                wajib_m += val
            elif 'VOLUNTARY' in name:
                sukarela_m += val
            elif 'PRINCIPLE' in name:
                pokok_m += val
        monthly_trend.append({
            'month': d.strftime('%b %Y'),
            'wajib': wajib_m,
            'sukarela': sukarela_m,
            'pokok': pokok_m,
        })

    return Response({
        'total_members': total_members,
        'total_wajib': total_wajib,
        'total_sukarela': total_sukarela,
        'total_pokok': total_pokok,
        'total_withdrawal': total_withdrawal,
        'remaining_saving_used': remaining_saving_used,
        'monthly_trend': monthly_trend,
    })


@api_view(['GET'])
def admin_departments_list(request):
    """List all departments for filter dropdown."""
    from api.models import Departments
    depts = Departments.objects.filter(deleted_at__isnull=True).order_by('department_name')
    return Response([{'id': d.id, 'name': d.department_name} for d in depts])


@api_view(['GET'])
def admin_member_wallets(request):
    """
    Ringkasan saldo simpanan per member.
    Query params: ?search=<nama/nik> ?department_id=<id>
    """
    search = request.query_params.get('search', '')
    department_id = request.query_params.get('department_id', '')
    members_qs = Members.objects.filter(deleted_at__isnull=True)
    if search:
        members_qs = members_qs.filter(
            Q(full_name__icontains=search) |
            Q(nik_employee__icontains=search) |
            Q(nik_ktp__icontains=search)
        )
    if department_id:
        members_qs = members_qs.filter(department_id=department_id)

    member_ids = list(members_qs.values_list('id', flat=True))
    if not member_ids:
        return Response([])

    # Aggregate total withdrawal per member — only status_id=19 (paid/approved withdrawals)
    withdrawal_map = {
        row['member_id']: row['total']
        for row in Withdrawals.objects
            .filter(deleted_at__isnull=True, status_id=19, member_id__in=member_ids)
            .values('member_id')
            .annotate(total=Sum('amount'))
    }

    dept_map = _get_dept_map(member_ids)

    # Fetch all wallets in ONE query instead of N queries
    all_wallets = SavingWallets.objects.filter(
        member_id__in=member_ids, deleted_at__isnull=True
    ).select_related('saving_type')
    wallets_map = {}
    for w in all_wallets:
        wallets_map.setdefault(w.member_id, []).append(w)

    result = []
    for member in members_qs:
        result.append({
            'member_id': member.id,
            'member_name': member.full_name,
            'member_nik': member.nik_employee or member.nik_ktp,
            'department_name': dept_map.get(member.id, '-'),
            'total_withdrawal': withdrawal_map.get(member.id, 0),
            'wallets': [
                {
                    'saving_type_id': w.saving_type_id,
                    'saving_type_name': w.saving_type.name,
                    'is_mandatory': w.saving_type.is_mandatory,
                    'balance': w.balance,
                }
                for w in wallets_map.get(member.id, [])
            ],
        })

    return Response(result)


@api_view(['GET'])
def admin_all_withdrawals(request):
    """
    Semua withdrawal dengan pencarian dan filter.
    Query params:
      ?search=<nama/nik>
      ?status=<status_code>
      ?month=<1-12>  ?year=<yyyy>
    """
    qs = Withdrawals.objects.filter(deleted_at__isnull=True)

    status_filter = request.query_params.get('status')
    if status_filter:
        if status_filter.lower() == 'pending':
            qs = qs.filter(status__status_code__in=['REQUESTED', 'PENDING_VERIFICATION'])
        elif status_filter.lower() == 'approved':
            qs = qs.filter(status__status_code='APPROVED')
        else:
            qs = qs.filter(status__status_code=status_filter.upper())

    search = request.query_params.get('search')
    if search:
        qs = qs.filter(
            Q(member__full_name__icontains=search) |
            Q(member__nik_employee__icontains=search)
        )

    year = request.query_params.get('year')
    month = request.query_params.get('month')
    if year:
        qs = qs.filter(request_date__year=int(year))
    if month:
        qs = qs.filter(request_date__month=int(month))

    return Response(
        AdminWithdrawalSerializer(qs.order_by('-request_date'), many=True).data
    )


@api_view(['GET'])
def admin_member_obligations(request):
    """
    List simpanan per member berdasarkan member_saving_obligations.
    Columns: simp. pokok (type 3, new members only), wajib (type 1), sukarela (type 2).
    Bill status derived from monthly_saving_bills for the given period.
    Query params: ?month= ?year= ?search= ?status=not_generated|pending|paid
    """
    from datetime import date as date_cls

    now = timezone.now()
    try:
        month = int(request.query_params.get('month', now.month))
        year = int(request.query_params.get('year', now.year))
    except (ValueError, TypeError):
        return Response({'error': 'Invalid month or year'}, status=400)

    search = request.query_params.get('search', '')
    status_filter = request.query_params.get('status', '')
    employee_status_filter = request.query_params.get('employee_status', '')

    members_qs = Members.objects.filter(deleted_at__isnull=True).order_by('full_name')
    if search:
        members_qs = members_qs.filter(
            Q(full_name__icontains=search) |
            Q(nik_employee__icontains=search) |
            Q(nik_ktp__icontains=search)
        )
    if employee_status_filter:
        members_qs = members_qs.filter(employee_status_id=employee_status_filter)

    member_ids = list(members_qs.values_list('id', flat=True))
    if not member_ids:
        return Response([])

    # Obligations in one query: {(member_id, saving_type_id): monthly_amount}
    obligations = MemberSavingObligations.objects.filter(
        member_id__in=member_ids,
        is_active=True,
        deleted_at__isnull=True,
    ).values('member_id', 'saving_type_id', 'monthly_amount')
    obligation_map = {(o['member_id'], o['saving_type_id']): o['monthly_amount'] for o in obligations}

    # Principal type minimum_amount
    principal_type = SavingTypes.objects.filter(name__icontains='PRINCIPLE').first()
    principal_min = principal_type.minimum_amount if principal_type else 0

    # Bill status for selected period
    period_start = date_cls(year, month, 1)
    bills = MonthlySavingBills.objects.filter(
        member_id__in=member_ids,
        bill_period_start=period_start,
        deleted_at__isnull=True,
    ).select_related('status').values('member_id', 'status__status_code')

    bill_status_map = {}
    for b in bills:
        mid = b['member_id']
        if mid not in bill_status_map:
            bill_status_map[mid] = set()
        bill_status_map[mid].add(b['status__status_code'])

    dept_map = _get_dept_map(member_ids)
    emp_status_map = _get_employee_status_map(member_ids)

    result = []
    for member in members_qs:
        mid = member.id
        is_new = (
            member.join_date is not None and
            member.join_date.year == year and
            member.join_date.month == month
        )
        # Simp. pokok only applies to new members
        pokok = float(obligation_map.get((mid, 3), principal_min if is_new else 0)) if is_new else 0
        wajib = float(obligation_map.get((mid, 1), 0))
        sukarela = float(obligation_map.get((mid, 2), 0))
        total = pokok + wajib + sukarela

        statuses = bill_status_map.get(mid, set())
        if not statuses:
            bill_status = 'not_generated'
        elif all(s == 'PAID' for s in statuses):
            bill_status = 'paid'
        else:
            bill_status = 'pending'

        if status_filter and bill_status != status_filter:
            continue

        result.append({
            'member_id': mid,
            'member_name': member.full_name,
            'nik_employee': member.nik_employee or '-',
            'member_nik': member.nik_employee or member.nik_ktp,
            'department_name': dept_map.get(mid, '-'),
            'employee_status_name': emp_status_map.get(mid, '-'),
            'is_new_member': is_new,
            'pokok_amount': pokok,
            'wajib_amount': wajib,
            'sukarela_amount': sukarela,
            'total_amount': total,
            'bill_status': bill_status,
        })

    return Response(result)


@api_view(['POST'])
def admin_generate_bills(request):
    """
    Generate tagihan bulanan.
    Body: { "month": 5, "year": 2026, "include_mandatory": true, "include_voluntary": true, "member_ids": [...] }
    Jika member_ids diberikan, hanya generate untuk member tersebut.
    Jika tidak, generate untuk semua member aktif (employee_status_id 1/2).
    Simpanan pokok hanya dibuat untuk member yang baru join di periode tersebut.
    """
    serializer = GenerateBillsSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=400)

    month = serializer.validated_data['month']
    year = serializer.validated_data['year']
    include_mandatory = serializer.validated_data['include_mandatory']
    include_voluntary = serializer.validated_data['include_voluntary']
    member_ids_filter = serializer.validated_data.get('member_ids', None)

    period_date = datetime(year, month, 1).date()
    _, last_day = calendar.monthrange(year, month)
    period_end = period_date.replace(day=last_day)

    pending_status = Statuses.objects.filter(status_code='PENDING').first()
    if not pending_status:
        return Response({'error': 'Status "PENDING" tidak ditemukan di database'}, status=500)

    principal_type = SavingTypes.objects.filter(name__icontains='PRINCIPLE').first()
    mandatory_type = SavingTypes.objects.filter(name__icontains='MANDATORY').first()
    voluntary_type = SavingTypes.objects.filter(name__icontains='VOLUNTARY').first()

    if include_mandatory and not mandatory_type:
        return Response({'error': 'Tipe simpanan wajib tidak ditemukan di database'}, status=500)
    if include_voluntary and not voluntary_type:
        return Response({'error': 'Tipe simpanan sukarela tidak ditemukan di database'}, status=500)

    if member_ids_filter:
        active_members = list(Members.objects.filter(
            id__in=member_ids_filter,
            deleted_at__isnull=True,
        ))
    else:
        active_members = list(Members.objects.filter(
            deleted_at__isnull=True,
            employee_status_id__in=[1, 2],
        ))

    active_member_ids = [m.id for m in active_members]

    # Pre-fetch all relevant obligations in one query
    obligation_types = [t for t in [mandatory_type, voluntary_type] if t]
    obligations_qs = MemberSavingObligations.objects.filter(
        member_id__in=active_member_ids,
        saving_type__in=obligation_types,
        is_active=True,
        deleted_at__isnull=True,
    )
    # obligation_map: {(member_id, saving_type_id): monthly_amount}
    obligation_map = {
        (o.member_id, o.saving_type_id): o.monthly_amount
        for o in obligations_qs
    }

    # Pre-fetch all existing bills for this period in one query
    existing_bills = set(
        MonthlySavingBills.objects.filter(
            member_id__in=active_member_ids,
            bill_period_start=period_date,
        ).values_list('member_id', 'saving_type_id')
    )

    bills_created = 0
    skipped = 0
    errors = []
    now_ts = timezone.now()

    for member in active_members:
        member_join_month = member.join_date.month if member.join_date else None
        member_join_year  = member.join_date.year  if member.join_date else None

        if principal_type and member_join_year == year and member_join_month == month:
            key = (member.id, principal_type.id)
            if key not in existing_bills:
                try:
                    MonthlySavingBills.objects.create(
                        member=member,
                        saving_type=principal_type,
                        bill_period_start=period_date,
                        bill_period_end=period_end,
                        amount_due=principal_type.minimum_amount or Decimal('0'),
                        amount_paid=Decimal('0'),
                        status=pending_status,
                        due_date=period_end,
                        created_at=now_ts,
                        updated_at=now_ts,
                    )
                    existing_bills.add(key)
                    bills_created += 1
                except Exception as e:
                    errors.append(f'Member {member.id} (pokok): {e}')
            else:
                skipped += 1

        if include_mandatory and mandatory_type:
            mand_amount = obligation_map.get((member.id, mandatory_type.id), Decimal('0'))
            if mand_amount > 0:
                key = (member.id, mandatory_type.id)
                if key not in existing_bills:
                    try:
                        MonthlySavingBills.objects.create(
                            member=member,
                            saving_type=mandatory_type,
                            bill_period_start=period_date,
                            bill_period_end=period_end,
                            amount_due=mand_amount,
                            amount_paid=Decimal('0'),
                            status=pending_status,
                            due_date=period_end,
                            created_at=now_ts,
                            updated_at=now_ts,
                        )
                        existing_bills.add(key)
                        bills_created += 1
                    except Exception as e:
                        errors.append(f'Member {member.id} (wajib): {e}')
                else:
                    skipped += 1

        if include_voluntary and voluntary_type:
            vol_amount = obligation_map.get((member.id, voluntary_type.id), Decimal('0'))
            if vol_amount > 0:
                key = (member.id, voluntary_type.id)
                if key not in existing_bills:
                    try:
                        MonthlySavingBills.objects.create(
                            member=member,
                            saving_type=voluntary_type,
                            bill_period_start=period_date,
                            bill_period_end=period_end,
                            amount_due=vol_amount,
                            amount_paid=Decimal('0'),
                            status=pending_status,
                            due_date=period_end,
                            created_at=now_ts,
                            updated_at=now_ts,
                        )
                        existing_bills.add(key)
                        bills_created += 1
                    except Exception as e:
                        errors.append(f'Member {member.id} (sukarela): {e}')
                else:
                    skipped += 1

    return Response({
        'message': f'Tagihan {month:02d}/{year} berhasil digenerate',
        'bills_created': bills_created,
        'skipped_existing': skipped,
        'errors': errors,
    }, status=201)


# ── ADMIN: WITHDRAWAL DETAIL & ACTIONS ──────────────────────────

@api_view(['GET'])
def admin_withdrawal_detail(request, pk):
    """Detail single withdrawal with member info and bank account."""
    try:
        withdrawal = Withdrawals.objects.select_related(
            'member', 'saving_type', 'status'
        ).get(pk=pk, deleted_at__isnull=True)
    except Withdrawals.DoesNotExist:
        return Response({'error': 'Tidak ditemukan'}, status=404)

    bank_account = MemberBankAccounts.objects.filter(
        member=withdrawal.member
    ).first()

    bank_account_data = None
    if bank_account:
        bank_name = None
        bank_code = None
        if getattr(bank_account, 'bank_id', None):
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT bank_name, bank_code FROM banks WHERE id = %s",
                    [bank_account.bank_id]
                )
                row = cursor.fetchone()
            if row:
                bank_name, bank_code = row

        bank_account_data = {
            'account_number': bank_account.account_number,
            'account_holder_name': bank_account.account_holder_name,
            'bank_name': bank_name,
            'bank_code': bank_code,
        }

    try:
        wallet = SavingWallets.objects.get(
            member=withdrawal.member,
            saving_type=withdrawal.saving_type,
            deleted_at__isnull=True,
        )
        wallet_balance = wallet.balance
    except SavingWallets.DoesNotExist:
        wallet_balance = 0

    return Response({
        'id': withdrawal.id,
        'amount': withdrawal.amount,
        'notes': withdrawal.notes,
        'request_date': withdrawal.request_date,
        'approved_date': withdrawal.approved_date,
        'paid_date': withdrawal.paid_date,
        'reject_reason': withdrawal.reject_reason,
        'proof_file_path': withdrawal.proof_file_path,
        'status_code': withdrawal.status.status_code,
        'status_name': withdrawal.status.status_name,
        'saving_type_name': withdrawal.saving_type.name,
        'wallet_balance': wallet_balance,
        'member': {
            'id': withdrawal.member.id,
            'full_name': withdrawal.member.full_name,
            'nik_employee': withdrawal.member.nik_employee,
            'nik_ktp': withdrawal.member.nik_ktp,
            'join_date': withdrawal.member.join_date,
        },
        'bank_account': bank_account_data,
    })


@api_view(['POST'])
def admin_approve_withdrawal(request, pk):
    """Approve a withdrawal — calls sp_process_withdrawal_status with status_id=17."""
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT sp_process_withdrawal_status(%s, %s, %s, %s)",
                [pk, 17, None, None]
            )
            cursor.fetchone()
    except Exception as exc:
        msg = str(exc)
        if 'tidak ditemukan' in msg.lower():
            return Response({'error': 'Withdrawal tidak ditemukan'}, status=404)
        return Response({'error': msg}, status=400)

    return Response({'message': 'Withdrawal berhasil di-approve'})


@api_view(['POST'])
def admin_reject_withdrawal(request, pk):
    """Reject a withdrawal — calls sp_process_withdrawal_status with status_id=18."""
    reject_reason = request.data.get('reject_reason', '')

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT sp_process_withdrawal_status(%s, %s, %s, %s)",
                [pk, 18, reject_reason, None]
            )
            cursor.fetchone()
    except Exception as exc:
        msg = str(exc)
        if 'tidak ditemukan' in msg.lower():
            return Response({'error': 'Withdrawal tidak ditemukan'}, status=404)
        return Response({'error': msg}, status=400)

    return Response({'message': 'Withdrawal berhasil ditolak'})


@api_view(['POST'])
def admin_upload_transfer(request, pk):
    """Upload transfer proof (PNG/JPG) to Supabase Storage and mark withdrawal as PAID."""
    if 'proof_file' not in request.FILES:
        return Response({'error': 'File bukti transfer wajib diupload'}, status=400)

    proof_file = request.FILES['proof_file']
    ext = os.path.splitext(proof_file.name)[1].lower()
    if ext not in ('.png', '.jpg', '.jpeg'):
        return Response({'error': 'Format file harus PNG atau JPG'}, status=400)

    import boto3
    from botocore.client import Config

    bucket = os.getenv('AWS_STORAGE_BUCKET_NAME', 'koperasi')
    key = f'withdrawal/withdrawal_{pk}_{uuid.uuid4().hex[:8]}{ext}'
    content_type = 'image/png' if ext == '.png' else 'image/jpeg'

    try:
        s3 = boto3.client(
            's3',
            endpoint_url=os.getenv('AWS_S3_ENDPOINT_URL'),
            aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
            aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
            region_name=os.getenv('AWS_S3_REGION_NAME', 'ap-northeast-1'),
            config=Config(signature_version='s3v4'),
        )
        s3.upload_fileobj(
            proof_file,
            bucket,
            key,
            ExtraArgs={'ContentType': content_type},
        )
    except Exception as exc:
        return Response({'error': f'Gagal upload ke storage: {str(exc)}'}, status=500)

    supabase_url = os.getenv('SUPABASE_URL', '').rstrip('/')
    public_url = f'{supabase_url}/storage/v1/object/public/{bucket}/{key}'

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT sp_process_withdrawal_status(%s, %s, %s, %s)",
                [pk, 19, None, public_url]
            )
            cursor.fetchone()
    except Exception as exc:
        msg = str(exc)
        if 'tidak ditemukan' in msg.lower():
            return Response({'error': 'Withdrawal tidak ditemukan'}, status=404)
        if 'Saldo tidak mencukupi' in msg:
            return Response({'error': 'Saldo tidak mencukupi untuk dikurangi'}, status=400)
        return Response({'error': msg}, status=400)

    try:
        withdrawal = Withdrawals.objects.select_related('member').get(pk=pk)
        send_withdrawal_paid_email(withdrawal, public_url)
    except Withdrawals.DoesNotExist:
        pass

    return Response({'message': 'Bukti transfer berhasil diupload', 'file_path': public_url})
