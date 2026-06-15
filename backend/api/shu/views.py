# shu/views.py
from decimal import Decimal, InvalidOperation
from datetime import datetime

from django.db.models import Q, Sum, F
from django.db.models.functions import TruncWeek
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response

from api.models import Members, MemberBankAccounts
from api.saving.models import MemberSavingObligations, SavingTransactions, SavingWallets
from api.models import IncomeExpenseCategories, IncomeExpenses  # noqa: F401 — IncomeExpenseCategories used for TYPE constants
from .models import (
    AccountingPeriods, MasterConfiguration,
    ShuPeriods, ShuMemberDistributions, ShuMemberDistributionsMonthly,
    ShuResults, ShuMemberBases, ShuComponentAllocation,
    STATUS_PENDING_ID, STATUS_PAID_ID,
)
from django.db import transaction, IntegrityError, connection
from .serializers import (
    AdminAnnualJasaModalSerializer,
    AdminShuDistributionSerializer,
    IncomeExpenseCategorySerializer,
    IncomeExpenseOutcomeCreateSerializer,
    IncomeExpenseOutcomeSerializer,
    MasterConfigurationSerializer,
    MemberShuDistributionSerializer,
    ShuDistributionUpdateSerializer,
    ShuPeriodCreateSerializer,
    ShuPeriodsSerializer,
    ShuResultsSerializer,
)

TEMP_MEMBER_ID = 5


# ── MASTER CONFIGURATION ─────────────────────────────────────────

@api_view(['GET', 'POST'])
def admin_master_configurations(request):
    """
    GET  → list all master configuration items (component_name + percentage).
    POST → create new item. Validates total percentage does not exceed 100.
    """
    if request.method == 'POST':
        serializer = MasterConfigurationSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)

        new_pct = serializer.validated_data['percentage']
        current_total = MasterConfiguration.objects.filter(
            deleted_at__isnull=True
        ).aggregate(total=Sum('percentage'))['total'] or Decimal('0')

        if current_total + new_pct > Decimal('100'):
            return Response(
                {'error': f'Total persentase melebihi 100%. Sisa: {100 - float(current_total)}%'},
                status=400,
            )

        item = serializer.save()
        total_after = float(current_total + new_pct)
        return Response({
            **MasterConfigurationSerializer(item).data,
            'total_percentage': total_after,
        }, status=201)

    items = MasterConfiguration.objects.filter(deleted_at__isnull=True).order_by('id')
    total = items.aggregate(total=Sum('percentage'))['total'] or Decimal('0')
    return Response({
        'total_percentage': float(total),
        'results': MasterConfigurationSerializer(items, many=True).data,
    })


@api_view(['PATCH', 'DELETE'])
def admin_master_configuration_detail(request, pk):
    """
    PATCH  → update percentage (and optionally name) of one item.
    DELETE → remove item.
    Validates total percentage does not exceed 100 on update.
    """
    try:
        item = MasterConfiguration.objects.get(pk=pk)
    except MasterConfiguration.DoesNotExist:
        return Response({'error': 'Item tidak ditemukan'}, status=404)

    if request.method == 'DELETE':
        item.delete()
        return Response(status=204)

    serializer = MasterConfigurationSerializer(item, data=request.data, partial=True)
    if not serializer.is_valid():
        return Response(serializer.errors, status=400)

    if 'percentage' in serializer.validated_data:
        new_pct = serializer.validated_data['percentage']
        other_total = MasterConfiguration.objects.filter(
            deleted_at__isnull=True
        ).exclude(pk=pk).aggregate(total=Sum('percentage'))['total'] or Decimal('0')

        if other_total + new_pct > Decimal('100'):
            return Response(
                {'error': f'Total persentase melebihi 100%. Sisa untuk item ini: {100 - float(other_total)}%'},
                status=400,
            )

    serializer.save()
    total = MasterConfiguration.objects.filter(
        deleted_at__isnull=True
    ).aggregate(total=Sum('percentage'))['total'] or Decimal('0')
    return Response({
        **MasterConfigurationSerializer(item).data,
        'total_percentage': float(total),
    })


# ── MEMBER ───────────────────────────────────────────────────────

@api_view(['GET'])
def my_shu_analytics(request):
    """
    SHU Analytics data for logged-in member.
    Returns unpaid total SHU, monthly chart data, and growth percentage.
    """
    from django.db.models.functions import TruncMonth

    member_id = request.query_params.get('member_id')
    if not member_id:
        if request.user.is_authenticated and hasattr(request.user, 'member'):
            member_id = request.user.member.id
        else:
            member_id = TEMP_MEMBER_ID

    # 1. Total SHU (where distributed_status = false)
    total_shu_qs = ShuMemberDistributionsMonthly.objects.filter(
        member_id=member_id,
        distributed_status=False
    ).aggregate(total_shu=Sum('total_shu'))
    total_shu = total_shu_qs['total_shu'] or Decimal('0')

    # 2. Data Chart Per Bulan
    monthly_data = (
        ShuMemberDistributionsMonthly.objects.filter(member_id=member_id)
        .annotate(month=TruncMonth('created_at'))
        .values('month')
        .annotate(total_shu=Sum('total_shu'))
        .order_by('month')
    )

    chart_data = []
    for row in monthly_data:
        chart_data.append({
            'month': row['month'].strftime('%Y-%m') if row['month'] else None,
            'total_shu': float(row['total_shu'] or 0)
        })

    # 3. Growth Percentage based on the last 2 months
    growth_percentage = 0.0
    previous_total = 0.0
    if len(chart_data) >= 2:
        c_total = chart_data[-1]['total_shu']
        p_total = chart_data[-2]['total_shu']
        previous_total = p_total
        if p_total > 0:
            growth_percentage = round(((c_total - p_total) / p_total) * 100, 1)

    return Response({
        'total_shu': float(total_shu),
        'chart_data': chart_data,
        'growth_percentage': growth_percentage,
        'previous_total': previous_total
    })


@api_view(['GET'])
def my_shu_distributions(request):
    """Daftar SHU yang diterima member yang sedang login."""
    distributions = ShuMemberDistributions.objects.filter(
        member_id=TEMP_MEMBER_ID,
    ).select_related('period').order_by('-period__year')
    return Response(MemberShuDistributionSerializer(distributions, many=True).data)


@api_view(['GET'])
def my_shu_detail(request, pk):
    """Detail SHU untuk satu periode tertentu."""
    try:
        dist = ShuMemberDistributions.objects.select_related('period').get(
            pk=pk, member_id=TEMP_MEMBER_ID
        )
    except ShuMemberDistributions.DoesNotExist:
        return Response({'error': 'Data SHU tidak ditemukan'}, status=404)
    return Response(MemberShuDistributionSerializer(dist).data)


# ── ADMIN: PERIOD ────────────────────────────────────────────────

@api_view(['GET'])
def admin_shu_periods(request):
    """Daftar semua periode SHU."""
    periods = ShuPeriods.objects.all().order_by('-year')
    return Response(ShuPeriodsSerializer(periods, many=True).data)


@api_view(['POST'])
def admin_shu_period_create(request):
    """
    Buat periode SHU baru.
    Body: { year, total_profit, total_savings_weight, total_transaction_weight,
            member_services_weight, reserve_fund_weight, social_fund_weight,
            education_fund_weight, management_weight, notes? }
    """
    serializer = ShuPeriodCreateSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=400)

    data = serializer.validated_data
    if ShuPeriods.objects.filter(year=data['year']).exists():
        return Response({'error': f'Periode SHU tahun {data["year"]} sudah ada'}, status=400)

    period = ShuPeriods.objects.create(**data)
    return Response(ShuPeriodsSerializer(period).data, status=201)


@api_view(['GET', 'PATCH'])
def admin_shu_period_detail(request, pk):
    """
    GET  → detail periode SHU.
    PATCH → update field periode (total_profit, bobot, status, notes).
    """
    try:
        period = ShuPeriods.objects.get(pk=pk)
    except ShuPeriods.DoesNotExist:
        return Response({'error': 'Periode tidak ditemukan'}, status=404)

    if request.method == 'GET':
        return Response(ShuPeriodsSerializer(period).data)

    allowed_fields = {
        'total_profit', 'total_savings_weight', 'total_transaction_weight',
        'member_services_weight', 'reserve_fund_weight', 'social_fund_weight',
        'education_fund_weight', 'management_weight', 'status', 'notes',
    }
    for field, value in request.data.items():
        if field in allowed_fields:
            setattr(period, field, value)
    period.save()
    return Response(ShuPeriodsSerializer(period).data)


# ── ADMIN: CALCULATE & DISTRIBUTE ───────────────────────────────

@api_view(['POST'])
def admin_shu_calculate(request, pk):
    """
    Hitung SHU per member untuk periode ini berdasarkan:
    - Saldo simpanan rata-rata (dari saving_wallets)
    - Total transaksi (dari saving_transactions, tipe kredit)
    Bobot member_services_weight dibagi dua komponen tsb sesuai konfigurasi period.
    """
    try:
        period = ShuPeriods.objects.get(pk=pk)
    except ShuPeriods.DoesNotExist:
        return Response({'error': 'Periode tidak ditemukan'}, status=404)

    if period.status not in ('draft', 'calculated'):
        return Response({'error': 'Hanya periode berstatus draft atau calculated yang bisa dihitung ulang'}, status=400)

    members = Members.objects.filter(deleted_at__isnull=True)

    # Total saldo simpanan semua member
    total_savings = SavingWallets.objects.filter(
        deleted_at__isnull=True
    ).aggregate(total=Sum('balance'))['total'] or Decimal('0')

    # Total transaksi kredit semua member dalam tahun periode
    total_transactions = SavingTransactions.objects.filter(
        transaction_date__year=period.year,
        transaction_type__name__icontains='credit',
    ).aggregate(total=Sum('amount'))['total'] or Decimal('0')

    # Dana yang dialokasikan untuk member (member_services_weight %)
    member_pool = period.total_profit * (period.member_services_weight / Decimal('100'))
    savings_pool = member_pool * (period.total_savings_weight / Decimal('100'))
    transaction_pool = member_pool * (period.total_transaction_weight / Decimal('100'))

    created = 0
    updated = 0
    for member in members:
        member_savings = SavingWallets.objects.filter(
            member=member, deleted_at__isnull=True
        ).aggregate(total=Sum('balance'))['total'] or Decimal('0')

        member_transactions = SavingTransactions.objects.filter(
            member=member,
            transaction_date__year=period.year,
            transaction_type__name__icontains='credit',
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0')

        savings_share = (
            savings_pool * (member_savings / total_savings)
            if total_savings > 0 else Decimal('0')
        )
        transaction_share = (
            transaction_pool * (member_transactions / total_transactions)
            if total_transactions > 0 else Decimal('0')
        )
        total_shu = savings_share + transaction_share

        dist, is_new = ShuMemberDistributions.objects.update_or_create(
            period=period,
            member=member,
            defaults={
                'total_savings': member_savings,
                'total_transactions': member_transactions,
                'savings_share': savings_share.quantize(Decimal('0.01')),
                'transaction_share': transaction_share.quantize(Decimal('0.01')),
                'total_shu': total_shu.quantize(Decimal('0.01')),
                'status': 'pending',
            },
        )
        if is_new:
            created += 1
        else:
            updated += 1

    period.status = 'calculated'
    period.save(update_fields=['status', 'updated_at'])

    return Response({
        'message': f'SHU tahun {period.year} berhasil dihitung',
        'created': created,
        'updated': updated,
        'total_member_pool': float(member_pool),
    }, status=200)


# ── ADMIN: DISTRIBUTIONS ─────────────────────────────────────────

@api_view(['GET'])
def admin_shu_distributions(request, period_pk):
    """
    Daftar distribusi SHU per member untuk satu periode.
    Query params: ?search=<nama/nik> ?status=pending|approved|paid
    """
    qs = ShuMemberDistributions.objects.filter(period_id=period_pk).select_related('member', 'period')

    search = request.query_params.get('search')
    if search:
        qs = qs.filter(
            Q(member__full_name__icontains=search) |
            Q(member__nik_employee__icontains=search)
        )

    status_filter = request.query_params.get('status')
    if status_filter:
        qs = qs.filter(status=status_filter)

    return Response(AdminShuDistributionSerializer(qs.order_by('member__full_name'), many=True).data)


@api_view(['PATCH'])
def admin_shu_distribution_update(request, pk):
    """
    Update status distribusi SHU satu member.
    Body: { status: 'approved'|'paid'|'cancelled', notes? }
    """
    try:
        dist = ShuMemberDistributions.objects.get(pk=pk)
    except ShuMemberDistributions.DoesNotExist:
        return Response({'error': 'Distribusi tidak ditemukan'}, status=404)

    serializer = ShuDistributionUpdateSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=400)

    new_status = serializer.validated_data['status']
    dist.status = new_status
    if new_status == 'paid':
        dist.paid_at = timezone.now()
    if 'notes' in serializer.validated_data:
        dist.notes = serializer.validated_data['notes']
    dist.save()

    return Response(AdminShuDistributionSerializer(dist).data)


@api_view(['POST'])
def admin_shu_bulk_approve(request, period_pk):
    """Approve semua distribusi SHU yang masih pending untuk satu periode."""
    updated = ShuMemberDistributions.objects.filter(
        period_id=period_pk, status='pending'
    ).update(status='approved', updated_at=timezone.now())

    return Response({'message': f'{updated} distribusi berhasil di-approve'})


@api_view(['POST'])
def admin_shu_bulk_pay(request, period_pk):
    """Tandai semua distribusi SHU yang sudah approved menjadi paid."""
    now = timezone.now()
    updated = ShuMemberDistributions.objects.filter(
        period_id=period_pk, status='approved'
    ).update(status='paid', paid_at=now, updated_at=now)

    if updated > 0:
        ShuPeriods.objects.filter(pk=period_pk).update(status='distributed', updated_at=now)

    return Response({'message': f'{updated} distribusi berhasil dibayarkan'})


# ── ADMIN: OUTCOME TRANSACTION (income_expenses) ─────────────────

@api_view(['GET'])
def admin_shu_outcome_categories(request):
    """Daftar semua kategori dari income_expense_categories."""
    categories = IncomeExpenseCategories.objects.filter(
        deleted_at__isnull=True
    ).order_by('category_name')
    return Response(IncomeExpenseCategorySerializer(categories, many=True).data)


@api_view(['GET', 'POST'])
def admin_shu_outcome_transactions(request):
    """
    GET  → daftar transaksi outcome dari income_expenses (type='expense').
           Query params: ?search= ?month= ?year=
    POST → tambah transaksi outcome baru ke income_expenses.
    """
    if request.method == 'POST':
        serializer = IncomeExpenseOutcomeCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)
        transaction = serializer.save()
        return Response(IncomeExpenseOutcomeSerializer(transaction).data, status=201)

    qs = IncomeExpenses.objects.filter(
        deleted_at__isnull=True,
    ).select_related('category').order_by('-transaction_date')

    search = request.query_params.get('search')
    if search:
        qs = qs.filter(
            Q(invoice_number__icontains=search) |
            Q(supplier_customer__icontains=search)
        )

    month = request.query_params.get('month')
    year = request.query_params.get('year')
    day = request.query_params.get('day')
    if month:
        qs = qs.filter(transaction_date__month=month)
    if year:
        qs = qs.filter(transaction_date__year=year)
    if day:
        qs = qs.filter(transaction_date__day=day)

    agg = qs.aggregate(
        total_income=Sum('amount', filter=Q(category__type__iexact=IncomeExpenses.TYPE_INCOME)),
        total_expense=Sum('amount', filter=Q(category__type__iexact=IncomeExpenses.TYPE_EXPENSE)),
    )
    return Response({
        'count': qs.count(),
        'total_income': float(agg['total_income'] or 0),
        'total_expense': float(agg['total_expense'] or 0),
        'results': IncomeExpenseOutcomeSerializer(qs, many=True).data,
    })


@api_view(['GET', 'PATCH', 'DELETE'])
def admin_shu_outcome_transaction_detail(request, pk):
    """GET / PATCH / DELETE satu transaksi outcome dari income_expenses."""
    try:
        transaction = IncomeExpenses.objects.select_related('category').get(
            pk=pk, type=IncomeExpenses.TYPE_EXPENSE, deleted_at__isnull=True
        )
    except IncomeExpenses.DoesNotExist:
        return Response({'error': 'Transaksi tidak ditemukan'}, status=404)

    if request.method == 'GET':
        return Response(IncomeExpenseOutcomeSerializer(transaction).data)

    if request.method == 'DELETE':
        transaction.delete()
        return Response(status=204)

    serializer = IncomeExpenseOutcomeCreateSerializer(transaction, data=request.data, partial=True)
    if not serializer.is_valid():
        return Response(serializer.errors, status=400)
    serializer.save()
    return Response(IncomeExpenseOutcomeSerializer(transaction).data)


@api_view(['GET'])
def admin_shu_member_bases(request):
    """
    Daftar anggota beserta simpanan wajib, sukarela, total, dan SHU Jasa Modal
    untuk satu bulan tertentu (default: bulan berjalan) atau ringkasan tahunan.
    Query params: ?search=<nama/nik> ?summary=<month|year> ?month=<1-12> ?year=<yyyy>
    """
    from api.models import Departments
    from api.saving.models import SavingTransactions

    now = timezone.now()
    search = request.query_params.get('search', '')
    summary = request.query_params.get('summary', 'month').lower()
    try:
        year = int(request.query_params.get('year', now.year))
    except (ValueError, TypeError):
        year = now.year

    month_param = request.query_params.get('month')
    try:
        month = int(month_param) if month_param not in (None, '') else None
    except (ValueError, TypeError):
        month = None

    members_qs = Members.objects.filter(deleted_at__isnull=True)
    if search:
        members_qs = members_qs.filter(
            Q(full_name__icontains=search) |
            Q(nik_employee__icontains=search)
        )
    members_qs = members_qs.order_by('full_name')

    departments = {d.id: d.department_name for d in Departments.objects.all()}

    from datetime import date as date_cls
    if summary == 'year':
        period_start = date_cls(year, 1, 1)
        period_end = date_cls(year, 12, 31)
        # Jumlah bulan yang dihitung: Januari s/d bulan sekarang (jika tahun berjalan)
        # atau 12 (jika tahun sudah lewat).
        if year < now.year:
            months_multiplier = Decimal('12')
        elif year == now.year:
            months_multiplier = Decimal(str(now.month))
        else:
            months_multiplier = Decimal('0')
    else:
        period_month = month or now.month
        period_start = date_cls(year, period_month, 1)
        period_end = date_cls(year, period_month, 28)
        months_multiplier = Decimal('1')

    # If obligation values are defined on the member_saving_obligations table,
    # use those monthly amounts directly for mandatory/voluntary savings.
    obligations = MemberSavingObligations.objects.filter(
        member_id__in=members_qs.values_list('id', flat=True),
        saving_type_id__in=[1, 2],
        is_active=True,
        deleted_at__isnull=True,
    ).values('member_id', 'saving_type_id', 'monthly_amount')

    member_savings = {}
    for o in obligations:
        mid = o['member_id']
        if mid not in member_savings:
            member_savings[mid] = {'mandatory': Decimal('0'), 'voluntary': Decimal('0')}
        if o['saving_type_id'] == 1:
            member_savings[mid]['mandatory'] += o['monthly_amount'] * months_multiplier
        elif o['saving_type_id'] == 2:
            member_savings[mid]['voluntary'] += o['monthly_amount'] * months_multiplier

    # Total simpanan semua member aktif (denominator untuk proporsi jasa modal)
    all_obligations_agg = MemberSavingObligations.objects.filter(
        saving_type_id__in=[1, 2],
        is_active=True,
        deleted_at__isnull=True,
        member__deleted_at__isnull=True,
    ).aggregate(total=Sum('monthly_amount'))
    total_all_savings = (all_obligations_agg['total'] or Decimal('0')) * months_multiplier

    # Hitung jasa modal pool: net_profit periode × persentase komponen "Jasa Modal"
    jasa_modal_pool = None
    try:
        period_month_for_result = (month or now.month) if summary == 'month' else 13
        shu_result = ShuResults.objects.get(
            period_year=year,
            period_month=period_month_for_result,
            deleted_at__isnull=True,
        )
        jasa_modal_cfg = MasterConfiguration.objects.filter(
            component_name__icontains='jasa modal',
            deleted_at__isnull=True,
        ).first()
        if jasa_modal_cfg:
            jasa_modal_pool = (
                shu_result.net_profit * jasa_modal_cfg.percentage / Decimal('100')
            ).quantize(Decimal('0.01'))
    except ShuResults.DoesNotExist:
        pass

    results = []
    for m in members_qs:
        savings = member_savings.get(m.id, {'mandatory': Decimal('0'), 'voluntary': Decimal('0')})
        total = savings['mandatory'] + savings['voluntary']

        shu_jasa_modal = None
        if jasa_modal_pool is not None and total_all_savings > 0:
            shu_jasa_modal = float(
                (total / total_all_savings * jasa_modal_pool).quantize(Decimal('0.01'))
            )

        results.append({
            'member_id': m.id,
            'full_name': m.full_name,
            'nik_employee': m.nik_employee or '-',
            'department_name': departments.get(m.department_id, '-'),
            'mandatory_saving_monthly': float(savings['mandatory']),
            'voluntary_saving_monthly': float(savings['voluntary']),
            'total_saving_amount': float(total),
            'shu_jasa_modal': shu_jasa_modal,
        })

    return Response({
        'count': len(results),
        'month': month,
        'year': year,
        'summary': summary,
        'months_count': int(months_multiplier),
        'jasa_modal_pool': float(jasa_modal_pool) if jasa_modal_pool is not None else None,
        'total_all_savings': float(total_all_savings),
        'results': results,
    })


@api_view(['POST'])
def admin_shu_member_bases_distribute(request):
    """
    Persist current calculated `shu_jasa_modal` and `total_saving_amount` per member
    into the `shu_member_bases` table linked to a `shu_result` (by year/month).
    Body: { year: <yyyy>, month?: <1-12> }
    """
    from api.models import Departments

    now = timezone.now()
    try:
        year = int(request.data.get('year', now.year))
    except (TypeError, ValueError):
        return Response({'error': 'year tidak valid'}, status=400)

    month_param = request.data.get('month')
    try:
        month = int(month_param) if month_param not in (None, '') else None
    except (ValueError, TypeError):
        return Response({'error': 'month tidak valid'}, status=400)

    # find shu_result
    try:
        shu_result = ShuResults.objects.get(period_year=year, period_month=month, deleted_at__isnull=True)
    except ShuResults.DoesNotExist:
        return Response({'error': 'ShuResults untuk periode tidak ditemukan'}, status=404)

    # Build obligations and totals (same logic as admin_shu_member_bases)
    obligations = MemberSavingObligations.objects.filter(
        saving_type_id__in=[1, 2],
        is_active=True,
        deleted_at__isnull=True,
        member__deleted_at__isnull=True,
    ).values('member_id', 'saving_type_id', 'monthly_amount')

    member_savings = {}
    for o in obligations:
        mid = o['member_id']
        if mid not in member_savings:
            member_savings[mid] = {'mandatory': Decimal('0'), 'voluntary': Decimal('0')}
        if o['saving_type_id'] == 1:
            member_savings[mid]['mandatory'] += o['monthly_amount']
        elif o['saving_type_id'] == 2:
            member_savings[mid]['voluntary'] += o['monthly_amount']

    total_all_savings = MemberSavingObligations.objects.filter(
        saving_type_id__in=[1, 2],
        is_active=True,
        deleted_at__isnull=True,
        member__deleted_at__isnull=True,
    ).aggregate(total=Sum('monthly_amount'))['total'] or Decimal('0')

    jasa_modal_cfg = MasterConfiguration.objects.filter(
        component_name__icontains='jasa modal',
        deleted_at__isnull=True,
    ).first()

    if not jasa_modal_cfg:
        return Response({'error': 'Konfigurasi komponen "Jasa Modal" belum diset'}, status=400)

    jasa_modal_pool = (shu_result.net_profit * jasa_modal_cfg.percentage / Decimal('100')).quantize(Decimal('0.01'))

    members = Members.objects.filter(deleted_at__isnull=True)

    created = 0
    updated = 0
    with transaction.atomic():
        for m in members:
            savings = member_savings.get(m.id, {'mandatory': Decimal('0'), 'voluntary': Decimal('0')})
            total = savings['mandatory'] + savings['voluntary']

            shu_jasa_modal = Decimal('0')
            if total_all_savings > 0:
                shu_jasa_modal = (total / total_all_savings * jasa_modal_pool).quantize(Decimal('0.01'))

            try:
                obj, is_new = ShuMemberBases.objects.update_or_create(
                    shu_result=shu_result,
                    member=m,
                    defaults={
                        'total_saving_amount': total,
                        'shu_jasa_modal': shu_jasa_modal,
                    },
                )
                if is_new:
                    created += 1
                else:
                    updated += 1
            except IntegrityError as exc:
                # Try to recover from Postgres sequence mismatch (duplicate PK)
                msg = str(exc)
                if 'duplicate key value violates unique constraint' in msg and 'pkey' in msg:
                    try:
                        seq_sql = "SELECT pg_get_serial_sequence('shu_member_bases','id')"
                        with connection.cursor() as cur:
                            cur.execute(seq_sql)
                            seq = cur.fetchone()[0]
                            if seq:
                                # set sequence to max(id)
                                cur.execute(
                                    "SELECT setval(%s, COALESCE((SELECT MAX(id) FROM shu_member_bases), 0))",
                                    [seq],
                                )
                        # retry once
                        obj, is_new = ShuMemberBases.objects.update_or_create(
                            shu_result=shu_result,
                            member=m,
                            defaults={
                                'total_saving_amount': total,
                                'shu_jasa_modal': shu_jasa_modal,
                            },
                        )
                        if is_new:
                            created += 1
                        else:
                            updated += 1
                        continue
                    except Exception as exc2:
                        return Response({'error': 'IntegrityError', 'details': msg, 'recovery_error': str(exc2)}, status=500)
                return Response({'error': 'IntegrityError', 'details': msg}, status=500)

    return Response({'message': 'Data shu_member_bases disimpan', 'created': created, 'updated': updated})


@api_view(['GET', 'POST'])
def admin_shu_results(request):
    """
    GET  → cek hasil SHU tersimpan untuk periode tertentu.
           Query params: ?year=<yyyy> &month=<1-12>
    POST → simpan/update hasil SHU ke tabel shu_results.
           Body: { period_year, period_month?, total_revenue, total_expense, net_profit }
    """
    if request.method == 'GET':
        qs = ShuResults.objects.filter(deleted_at__isnull=True)
        year = request.query_params.get('year')
        month = request.query_params.get('month')
        if year:
            qs = qs.filter(period_year=year)
        if month:
            qs = qs.filter(period_month=month)
        else:
            qs = qs.filter(period_month=13)
        result = qs.first()
        if result:
            return Response(ShuResultsSerializer(result).data)
        return Response({})

    # POST
    year = request.data.get('period_year')
    month = request.data.get('period_month') or None

    if not year:
        return Response({'error': 'period_year wajib diisi'}, status=400)

    # Try to read provided totals; if not provided (or zero), compute from IncomeExpenses
    provided_revenue = request.data.get('total_revenue', None)
    provided_expense = request.data.get('total_expense', None)
    provided_net = request.data.get('net_profit', None)

    try:
        if provided_revenue is not None:
            total_revenue = Decimal(str(provided_revenue))
        else:
            total_revenue = None
        if provided_expense is not None:
            total_expense = Decimal(str(provided_expense))
        else:
            total_expense = None
        if provided_net is not None:
            net_profit = Decimal(str(provided_net))
        else:
            net_profit = None
    except (InvalidOperation, TypeError):
        return Response({'error': 'Nilai total_revenue/total_expense/net_profit tidak valid'}, status=400)

    if total_revenue is None or total_expense is None or net_profit is None:
        # Compute aggregates from IncomeExpenses for the given period
        qs = IncomeExpenses.objects.filter(deleted_at__isnull=True)
        if month:
            qs = qs.filter(transaction_date__year=int(year), transaction_date__month=int(month))
        else:
            qs = qs.filter(transaction_date__year=int(year))

        agg = qs.aggregate(
            total_income=Sum('amount', filter=Q(category__type__iexact=IncomeExpenseCategories.TYPE_INCOME)),
            total_expense=Sum('amount', filter=Q(category__type__iexact=IncomeExpenseCategories.TYPE_EXPENSE)),
        )

        computed_income = agg['total_income'] or 0
        computed_expense = agg['total_expense'] or 0

        if total_revenue is None:
            total_revenue = Decimal(str(computed_income))
        if total_expense is None:
            total_expense = Decimal(str(computed_expense))
        if net_profit is None:
            net_profit = (total_revenue - total_expense).quantize(Decimal('0.01'))

    with transaction.atomic():
        result, created = ShuResults.objects.update_or_create(
            period_year=int(year),
            period_month=int(month) if month else 13,
            defaults={
                'total_revenue': total_revenue,
                'total_expense': total_expense,
                'net_profit': net_profit,
                'distributed_status': True,
            },
        )

        # Clear existing allocations and rebuild them from MasterConfiguration
        ShuComponentAllocation.objects.filter(shu_result=result).delete()
        active_configs = MasterConfiguration.objects.filter(deleted_at__isnull=True).order_by('id')
        allocations = []
        for config in active_configs:
            allocated_amount = (result.net_profit * config.percentage / Decimal('100')).quantize(Decimal('0.01'))
            allocations.append(ShuComponentAllocation(
                shu_result=result,
                master_configuration=config,
                component_name=config.component_name,
                percentage=config.percentage,
                allocated_amount=allocated_amount,
                period_month=result.period_month,
                period_year=result.period_year,
            ))
        if allocations:
            ShuComponentAllocation.objects.bulk_create(allocations)

    return Response(ShuResultsSerializer(result).data, status=201 if created else 200)


def _build_month_labels(year, month, count):
    labels = []
    values = []
    total_months = year * 12 + month - 1
    for offset in range(count - 1, -1, -1):
        index = total_months - offset
        y = index // 12
        m = index % 12 + 1
        labels.append(f'{y}-{m:02d}')
        values.append((y, m))
    return labels, values


@api_view(['GET'])
def admin_shu_net_sales(request):
    """Return net sales series from shu_member_distributions_monthly grouped by year/month."""
    from datetime import date
    from django.db import connection

    range_option = request.query_params.get('range', '3month')
    range_map = {
        '1month': 1,
        '3month': 3,
        '6month': 6,
        '1year': 12,
        '3year': 36,
    }
    months = range_map.get(range_option, 6)
    today = timezone.now().date()
    labels, month_pairs = _build_month_labels(today.year, today.month, months)
    start_year, start_month = month_pairs[0]
    start_code = start_year * 100 + start_month

    query = """
        SELECT 
            sr.period_year, 
            sr.period_month, 
            COALESCE(SUM(smdm.total_shu), 0) AS total_shu
        FROM shu_member_distributions_monthly smdm
        INNER JOIN shu_results sr ON smdm.period_id = sr.id
        WHERE sr.deleted_at IS NULL
          AND sr.period_month <= 12
          AND (sr.period_year * 100 + sr.period_month) >= %s
        GROUP BY sr.period_year, sr.period_month
        ORDER BY sr.period_year, sr.period_month
    """
    
    with connection.cursor() as cursor:
        cursor.execute(query, [start_code])
        rows = cursor.fetchall()

    result_map = {
        f'{row[0]}-{row[1]:02d}': float(row[2])
        for row in rows
    }

    data = [result_map.get(key, 0) for key in labels]
    readable_labels = []
    for key in labels:
        year_str, month_str = key.split('-')
        readable_labels.append(f'{date(int(year_str), int(month_str), 1):%b %Y}')

    return Response({
        'range': range_option,
        'labels': readable_labels,
        'data': data,
    })


@api_view(['GET'])
def admin_shu_weekly_cashflow(request):
    """
    Return weekly money-in / money-out cashflow using the same data sources
    as the transaction_history endpoint:
      Money IN  → saving_transactions (deposits) + loan_payments (installments)
      Money OUT → withdrawals + shu_member_distributions (SHU distributions)
    """
    from datetime import timedelta

    range_option = request.query_params.get('range', '3month')
    range_map = {
        '7days': 7,
        '30days': 30,
        'weekly': 28,
        '3month': 90,
        '6month': 180,
        '1year': 365,
        '3year': 1095,
    }
    days = range_map.get(range_option, 90)
    today = timezone.now().date()
    start_date = today - timedelta(days=days)

    if range_option in ['7days', '30days']:
        trunc_unit = 'day'
        step_days = 1
        start_period = start_date
    else:
        trunc_unit = 'week'
        step_days = 7
        start_period = start_date - timedelta(days=start_date.weekday())

    query = f"""
        SELECT
            DATE_TRUNC('{trunc_unit}', transaction_date)::date AS period_start,
            SUM(CASE WHEN flow = 'IN'  THEN amount ELSE 0 END) AS total_income,
            SUM(CASE WHEN flow = 'OUT' THEN amount ELSE 0 END) AS total_expense
        FROM (
            -- MONEY IN: saving deposits (MANDATORY / VOLUNTARY / PRINCIPLE / DEPOSIT)
            SELECT
                st.transaction_date::date AS transaction_date,
                st.amount,
                'IN' AS flow
            FROM saving_transactions st
            INNER JOIN transaction_types tt ON tt.id = st.transaction_type_id
            INNER JOIN statuses s ON s.id = st.status_id
            WHERE st.transaction_date::date >= %s
              AND st.transaction_date::date <= %s
              AND UPPER(tt.name) IN ('MANDATORY', 'VOLUNTARY', 'PRINCIPLE', 'DEPOSIT', 'CREDIT')
              AND UPPER(s.status_code) IN ('COMPLETED', 'PAID', 'SUCCESS')

            UNION ALL

            -- MONEY IN: loan installment payments
            SELECT
                lp.payment_date::date AS transaction_date,
                lp.amount_paid AS amount,
                'IN' AS flow
            FROM loan_payments lp
            INNER JOIN statuses s ON s.id = lp.status_id
            WHERE lp.payment_date::date >= %s
              AND lp.payment_date::date <= %s
              AND UPPER(s.status_code) IN ('COMPLETED', 'PAID', 'LATE_PAID', 'SUCCESS')

            UNION ALL

            -- MONEY OUT: withdrawals
            SELECT
                w.request_date::date AS transaction_date,
                w.amount,
                'OUT' AS flow
            FROM withdrawals w
            INNER JOIN statuses s ON s.id = w.status_id
            WHERE w.request_date::date >= %s
              AND w.request_date::date <= %s
              AND UPPER(s.status_code) IN ('COMPLETED', 'PAID', 'SUCCESS')

            UNION ALL

            -- MONEY OUT: SHU distributions
             SELECT
                smd.paid_at::date AS transaction_date,
                smd.total_shu AS amount,
                'OUT' AS flow
            FROM shu_member_distributions smd
            WHERE smd.paid_at::date >= %s
                AND smd.paid_at::date <= %s
                AND smd.distributed_status = TRUE
                AND smd.status_shu = TRUE

        ) combined
        WHERE transaction_date IS NOT NULL
        GROUP BY DATE_TRUNC('{trunc_unit}', transaction_date)::date
        ORDER BY period_start
    """

    params = [
        start_period, today,  # saving deposits
        start_period, today,  # installments
        start_period, today,  # withdrawals
        start_period, today,  # SHU distributions
    ]

    period_map = {}
    try:
        with connection.cursor() as cursor:
            cursor.execute(query, params)
            for row in cursor.fetchall():
                period_start_date, total_in, total_out = row
                if period_start_date:
                    period_map[period_start_date] = {
                        'income': float(total_in or 0),
                        'expense': float(total_out or 0),
                    }
    except Exception as e:
        print("ERROR IN admin_shu_weekly_cashflow:", e)
        pass

    labels = []
    income_data = []
    expense_data = []
    cursor_date = start_period
    while cursor_date <= today:
        labels.append(cursor_date.strftime('%d %b'))
        totals = period_map.get(cursor_date, {'income': 0, 'expense': 0})
        income_data.append(totals['income'])
        expense_data.append(totals['expense'])
        cursor_date += timedelta(days=step_days)

    return Response({
        'range': range_option,
        'labels': labels,
        'income': income_data,
        'expense': expense_data,
    })


@api_view(['GET'])
def admin_shu_outcome_excel_template(request):
    """Generate dan return Excel template untuk upload transaksi ke income_expenses."""
    try:
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment
    except ImportError:
        return Response({'error': 'openpyxl belum terinstall. Jalankan: pip install openpyxl'}, status=500)

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'Template'

    header_labels = [
        'transaction_date (YYYY-MM-DD)',
        'category_id',
        'invoice_number',
        'supplier_customer',
        'quantity',
        'amount',
    ]
    header_fill = PatternFill(start_color='3B82F6', end_color='3B82F6', fill_type='solid')
    for col, label in enumerate(header_labels, 1):
        cell = ws.cell(row=1, column=col, value=label)
        cell.font = Font(bold=True, color='FFFFFF')
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal='center')

    # Contoh baris
    sample_row = ['2025-01-15', 1, 'INV-31012025001', 'PT. Supplier ABC', 10, 500000]
    for col, val in enumerate(sample_row, 1):
        ws.cell(row=2, column=col, value=val)

    for col, width in enumerate([28, 12, 22, 30, 12, 18], 1):
        ws.column_dimensions[ws.cell(row=1, column=col).column_letter].width = width

    # Sheet daftar kategori sebagai referensi
    ws2 = wb.create_sheet('Daftar Kategori')
    for col, label in enumerate(['ID', 'Nama Kategori', 'Type (INCOME/EXPENSE)'], 1):
        cell = ws2.cell(row=1, column=col, value=label)
        cell.font = Font(bold=True)
        cell.fill = PatternFill(start_color='E5E7EB', end_color='E5E7EB', fill_type='solid')

    categories = IncomeExpenseCategories.objects.filter(deleted_at__isnull=True).order_by('type', 'category_name')
    for row_num, cat in enumerate(categories, 2):
        ws2.cell(row=row_num, column=1, value=cat.id)
        ws2.cell(row=row_num, column=2, value=cat.category_name)
        ws2.cell(row=row_num, column=3, value=cat.type)

    ws2.column_dimensions['A'].width = 8
    ws2.column_dimensions['B'].width = 35
    ws2.column_dimensions['C'].width = 22

    response = HttpResponse(
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    response['Content-Disposition'] = 'attachment; filename="template_transaksi_shu.xlsx"'
    wb.save(response)
    return response


@api_view(['POST'])
def admin_shu_outcome_upload_excel(request):
    """
    Upload file Excel dan bulk-insert ke tabel income_expenses.
    Field per baris: transaction_date, category_id, invoice_number, supplier_customer, quantity, amount.
    """
    try:
        import openpyxl
    except ImportError:
        return Response({'error': 'openpyxl belum terinstall. Jalankan: pip install openpyxl'}, status=500)

    file = request.FILES.get('file')
    if not file:
        return Response({'error': 'File tidak ditemukan dalam request.'}, status=400)

    try:
        wb = openpyxl.load_workbook(file, data_only=True)
        ws = wb.active
    except Exception as exc:
        return Response({'error': f'File Excel tidak dapat dibaca: {exc}'}, status=400)

    errors = []
    records = []

    for row_num, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        if not any(cell is not None for cell in row):
            continue

        cells = list(row) + [None] * 6
        raw_date, raw_cat_id, raw_invoice, raw_supcust, raw_qty, raw_amount = cells[:6]

        # Validasi kolom wajib
        if raw_date is None or raw_cat_id is None or raw_amount is None:
            errors.append(f'Baris {row_num}: kolom transaction_date, category_id, dan amount wajib diisi.')
            continue

        # Parse tanggal — bisa datetime (dari Excel) atau string
        try:
            if isinstance(raw_date, datetime):
                parsed_date = raw_date.date()
            else:
                parsed_date = datetime.strptime(str(raw_date).strip(), '%Y-%m-%d').date()
        except ValueError:
            errors.append(f'Baris {row_num}: format tanggal tidak valid "{raw_date}" (harus YYYY-MM-DD).')
            continue

        # Validasi category
        try:
            category = IncomeExpenseCategories.objects.get(pk=int(raw_cat_id), deleted_at__isnull=True)
        except (IncomeExpenseCategories.DoesNotExist, ValueError, TypeError):
            errors.append(f'Baris {row_num}: category_id "{raw_cat_id}" tidak ditemukan.')
            continue

        # Parse amount & quantity
        try:
            amount = Decimal(str(raw_amount))
        except InvalidOperation:
            errors.append(f'Baris {row_num}: nilai amount "{raw_amount}" tidak valid.')
            continue

        try:
            quantity = Decimal(str(raw_qty)) if raw_qty is not None else None
        except InvalidOperation:
            quantity = None

        records.append(IncomeExpenses(
            transaction_date=parsed_date,
            category=category,
            type=category.type,
            invoice_number=str(raw_invoice).strip() if raw_invoice is not None else None,
            supplier_customer=str(raw_supcust).strip() if raw_supcust is not None else None,
            quantity=quantity,
            amount=amount,
            created_at=timezone.now(),
            updated_at=timezone.now(),
        ))

    if not records and errors:
        return Response({'inserted': 0, 'errors': errors}, status=400)

    IncomeExpenses.objects.bulk_create(records)

    return Response({
        'inserted': len(records),
        'errors': errors,
    }, status=201)


# ── ADMIN: ANNUAL JASA MODAL DISTRIBUTION ────────────────────────

@api_view(['GET'])
def admin_shu_jasa_modal_list(request):
    """
    Daftar distribusi SHU Jasa Modal tahunan per member beserta info bank.
    Query params: ?year=<yyyy> &search=<nama/nik>
    """
    year_param = request.query_params.get('year')
    if not year_param:
        return Response({'error': 'year wajib diisi'}, status=400)

    try:
        year_int = int(year_param)
    except ValueError:
        return Response({'error': 'year tidak valid'}, status=400)

    try:
        period = ShuResults.objects.get(period_year=year_int, period_month=13, deleted_at__isnull=True)
    except ShuResults.DoesNotExist:
        return Response({'distributed': False, 'results': []})

    qs = ShuMemberDistributions.objects.filter(
        period=period
    ).select_related('member', 'period', 'status').order_by('member__full_name')

    search = request.query_params.get('search', '')
    if search:
        qs = qs.filter(
            Q(member__full_name__icontains=search) |
            Q(member__nik_employee__icontains=search)
        )

    member_ids = list(qs.values_list('member_id', flat=True))
    bank_accounts = MemberBankAccounts.objects.filter(
        member_id__in=member_ids, deleted_at__isnull=True
    ).select_related('bank')
    bank_map = {ba.member_id: ba for ba in bank_accounts}

    return Response({
        'distributed': True,
        'period_id': period.id,
        'results': AdminAnnualJasaModalSerializer(qs, many=True, context={'bank_map': bank_map}).data,
    })


@api_view(['POST'])
def admin_shu_jasa_modal_distribute(request):
    """
    Distribusikan SHU Jasa Modal tahunan ke seluruh member.
    Membuat AccountingPeriods (annual) jika belum ada, lalu create/update ShuMemberDistributions.
    Body: { year: <yyyy> }
    """
    now = timezone.now()
    try:
        year = int(request.data.get('year', 0))
    except (TypeError, ValueError):
        return Response({'error': 'year tidak valid'}, status=400)

    if not year:
        return Response({'error': 'year wajib diisi'}, status=400)

    if year > now.year:
        return Response({'error': 'Tidak dapat mendistribusikan SHU untuk tahun yang akan datang'}, status=400)

    months_multiplier = Decimal('12') if year < now.year else Decimal(str(now.month))

    obligations = MemberSavingObligations.objects.filter(
        saving_type_id__in=[1, 2],
        is_active=True,
        deleted_at__isnull=True,
        member__deleted_at__isnull=True,
    ).values('member_id', 'saving_type_id', 'monthly_amount')

    member_savings = {}
    for o in obligations:
        mid = o['member_id']
        if mid not in member_savings:
            member_savings[mid] = Decimal('0')
        member_savings[mid] += o['monthly_amount'] * months_multiplier

    total_all_savings = sum(member_savings.values()) or Decimal('0')

    try:
        shu_result = ShuResults.objects.get(
            period_year=year, period_month=13, deleted_at__isnull=True
        )
    except ShuResults.DoesNotExist:
        return Response(
            {'error': f'SHU Result tahunan untuk tahun {year} belum ada. Buat SHU Result terlebih dahulu.'},
            status=404,
        )

    jasa_modal_cfg = MasterConfiguration.objects.filter(
        component_name__icontains='jasa modal', deleted_at__isnull=True
    ).first()
    if not jasa_modal_cfg:
        return Response({'error': 'Konfigurasi komponen "Jasa Modal" belum diset'}, status=400)

    jasa_modal_pool = (
        shu_result.net_profit * jasa_modal_cfg.percentage / Decimal('100')
    ).quantize(Decimal('0.01'))

    members = Members.objects.filter(deleted_at__isnull=True)
    created = updated = 0
    now_ts = timezone.now()

    try:
        with transaction.atomic():
            for m in members:
                total = member_savings.get(m.id, Decimal('0'))
                shu_jasa_modal = (
                    (total / total_all_savings * jasa_modal_pool).quantize(Decimal('0.01'))
                    if total_all_savings > 0 else Decimal('0')
                )
                try:
                    dist = ShuMemberDistributions.objects.get(period=shu_result, member=m)
                    dist.total_savings = total
                    dist.total_shu = shu_jasa_modal
                    dist.updated_at = now_ts
                    dist.save(update_fields=['total_savings', 'total_shu', 'updated_at'])
                    updated += 1
                except ShuMemberDistributions.DoesNotExist:
                    ShuMemberDistributions.objects.create(
                        period=shu_result,
                        member=m,
                        total_savings=total,
                        total_shu=shu_jasa_modal,
                        status_id=STATUS_PENDING_ID,
                        created_at=now_ts,
                        updated_at=now_ts,
                    )
                    created += 1
    except Exception as exc:
        return Response({'error': f'[shu_member_distributions] {type(exc).__name__}: {exc}'}, status=500)

    return Response({
        'message': f'SHU Jasa Modal tahun {year} berhasil didistribusikan',
        'created': created,
        'updated': updated,
        'jasa_modal_pool': float(jasa_modal_pool),
    })


@api_view(['PATCH'])
@parser_classes([MultiPartParser, FormParser])
def admin_shu_jasa_modal_proof_upload(request, pk):
    """
    Upload bukti transfer untuk satu distribusi SHU Jasa Modal.
    Menyimpan URL ke kolom transfer_proof dan mengubah status menjadi PAID (id=39).
    """
    import os
    import uuid
    import boto3

    try:
        dist = ShuMemberDistributions.objects.select_related('member', 'period', 'status').get(pk=pk)
    except ShuMemberDistributions.DoesNotExist:
        return Response({'error': 'Distribusi tidak ditemukan'}, status=404)

    file = request.FILES.get('file')
    if not file:
        return Response({'error': 'File tidak ditemukan dalam request'}, status=400)

    SUPABASE_URL = os.getenv('SUPABASE_URL', '').rstrip('/')
    S3_BUCKET = os.getenv('AWS_STORAGE_BUCKET_NAME', 'koperasi')
    S3_FOLDER = 'shu/proofs'

    ext = os.path.splitext(file.name)[1].lower()
    s3_key = f"{S3_FOLDER}/{uuid.uuid4().hex}{ext}"

    try:
        s3 = boto3.client(
            's3',
            endpoint_url=os.getenv('AWS_S3_ENDPOINT_URL'),
            aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
            aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
            region_name=os.getenv('AWS_S3_REGION_NAME', 'ap-northeast-1'),
        )
        s3.upload_fileobj(
            file,
            S3_BUCKET,
            s3_key,
            ExtraArgs={'ContentType': file.content_type or 'application/octet-stream'},
        )
    except Exception as exc:
        return Response({'error': f'Gagal upload file: {exc}'}, status=500)

    public_url = f"{SUPABASE_URL}/storage/v1/object/public/{S3_BUCKET}/{s3_key}"
    dist.transfer_proof = public_url
    dist.transfer_proof_url = public_url
    dist.transfer_proof_name = file.name
    dist.status_id = STATUS_PAID_ID
    dist.paid_at = timezone.now()
    dist.save(update_fields=['transfer_proof', 'transfer_proof_url', 'transfer_proof_name', 'status', 'paid_at', 'updated_at'])

    bank_accounts = MemberBankAccounts.objects.filter(
        member_id=dist.member_id, deleted_at__isnull=True
    ).select_related('bank')
    bank_map = {ba.member_id: ba for ba in bank_accounts}

    return Response(AdminAnnualJasaModalSerializer(dist, context={'bank_map': bank_map}).data)


@api_view(['POST'])
def admin_shu_monthly_distribute(request):
    """
    Distribusikan SHU Jasa Modal bulanan ke seluruh anggota aktif.
    Hasil disimpan ke tabel shu_member_distributions_monthly.
    Body: { year: <yyyy>, month: <1-12> }

    Mapping:
      period_id  → shu_results.id  (period_year=year, period_month=month)
      member_id  → members.id
      total_savings → total simpanan (wajib + sukarela) per anggota bulan itu
      total_shu     → SHU jasa modal per anggota
    """
    now = timezone.now()
    try:
        year = int(request.data.get('year', now.year))
    except (TypeError, ValueError):
        return Response({'error': 'year tidak valid'}, status=400)

    try:
        month_raw = request.data.get('month')
        month = int(month_raw) if month_raw not in (None, '') else now.month
    except (TypeError, ValueError):
        return Response({'error': 'month tidak valid'}, status=400)

    if not (1 <= month <= 12):
        return Response({'error': 'month harus antara 1 dan 12'}, status=400)

    # Pastikan ShuResults untuk bulan ini sudah ada
    try:
        shu_result = ShuResults.objects.get(
            period_year=year,
            period_month=month,
            deleted_at__isnull=True,
        )
    except ShuResults.DoesNotExist:
        return Response(
            {'error': f'SHU Result untuk {month}/{year} belum ada. Buat SHU Result terlebih dahulu.'},
            status=404,
        )

    # Konfigurasi komponen Jasa Modal
    jasa_modal_cfg = MasterConfiguration.objects.filter(
        component_name__icontains='jasa modal',
        deleted_at__isnull=True,
    ).first()
    if not jasa_modal_cfg:
        return Response({'error': 'Konfigurasi komponen "Jasa Modal" belum diset'}, status=400)

    jasa_modal_pool = (
        shu_result.net_profit * jasa_modal_cfg.percentage / Decimal('100')
    ).quantize(Decimal('0.01'))

    # Hitung simpanan per anggota untuk bulan ini (1 bulan)
    obligations = MemberSavingObligations.objects.filter(
        saving_type_id__in=[1, 2],
        is_active=True,
        deleted_at__isnull=True,
        member__deleted_at__isnull=True,
    ).values('member_id', 'saving_type_id', 'monthly_amount')

    member_savings = {}
    for o in obligations:
        mid = o['member_id']
        if mid not in member_savings:
            member_savings[mid] = Decimal('0')
        member_savings[mid] += o['monthly_amount']

    total_all_savings = sum(member_savings.values()) or Decimal('0')

    members = Members.objects.filter(deleted_at__isnull=True)
    created = updated = 0
    now_ts = timezone.now()

    try:
        with transaction.atomic():
            for m in members:
                total = member_savings.get(m.id, Decimal('0'))
                shu_jasa_modal = (
                    (total / total_all_savings * jasa_modal_pool).quantize(Decimal('0.01'))
                    if total_all_savings > 0 else Decimal('0')
                )
                try:
                    dist = ShuMemberDistributionsMonthly.objects.get(period=shu_result, member=m)
                    dist.total_savings = total
                    dist.total_shu = shu_jasa_modal
                    dist.updated_at = now_ts
                    dist.save(update_fields=['total_savings', 'total_shu', 'updated_at'])
                    updated += 1
                except ShuMemberDistributionsMonthly.DoesNotExist:
                    ShuMemberDistributionsMonthly.objects.create(
                        period=shu_result,
                        member=m,
                        total_savings=total,
                        total_shu=shu_jasa_modal,
                        created_at=now_ts,
                        updated_at=now_ts,
                    )
                    created += 1
    except Exception as exc:
        return Response(
            {'error': f'[shu_member_distributions_monthly] {type(exc).__name__}: {exc}'},
            status=500,
        )

    MONTH_NAMES = [
        '', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
        'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
    ]
    return Response({
        'message': f'SHU Jasa Modal {MONTH_NAMES[month]} {year} berhasil didistribusikan',
        'period_id': shu_result.id,
        'year': year,
        'month': month,
        'jasa_modal_pool': float(jasa_modal_pool),
        'created': created,
        'updated': updated,
        'total_members': created + updated,
    })


@api_view(['GET'])
def admin_shu_stats(request):
    """
    Ringkasan statistik SHU.
    - Jumlah periode
    - Total SHU yang sudah didistribusikan
    - Jumlah member yang sudah menerima SHU
    """
    total_periods = ShuPeriods.objects.count()
    distributed = ShuMemberDistributions.objects.filter(status='paid')
    return Response({
        'total_periods': total_periods,
        'total_distributed': distributed.aggregate(total=Sum('total_shu'))['total'] or 0,
        'total_recipients': distributed.values('member_id').distinct().count(),
        'latest_year': ShuPeriods.objects.order_by('-year').values_list('year', flat=True).first(),
    })


@api_view(['GET'])
def get_component_allocations(request):
    """
    GET  → list component allocations for a given period_year and period_month (13 for annual).
    """
    year_param = request.query_params.get('year')
    month_param = request.query_params.get('month')

    if not year_param:
        return Response({'error': 'year parameter is required'}, status=400)

    try:
        year = int(year_param)
        month = int(month_param) if month_param else 13
    except ValueError:
        return Response({'error': 'Invalid year or month value'}, status=400)

    try:
        shu_result = ShuResults.objects.get(period_year=year, period_month=month, deleted_at__isnull=True)
    except ShuResults.DoesNotExist:
        return Response({'error': f'SHU Result not found for period {month}/{year}'}, status=404)

    allocs = ShuComponentAllocation.objects.filter(shu_result=shu_result, deleted_at__isnull=True).order_by('id')
    
    # If no allocations exist but SHU result exists, initialize them
    if not allocs.exists():
        active_configs = MasterConfiguration.objects.filter(deleted_at__isnull=True).order_by('id')
        allocations = []
        for config in active_configs:
            allocated_amount = (shu_result.net_profit * config.percentage / Decimal('100')).quantize(Decimal('0.01'))
            allocations.append(ShuComponentAllocation(
                shu_result=shu_result,
                master_configuration=config,
                component_name=config.component_name,
                percentage=config.percentage,
                allocated_amount=allocated_amount,
                period_month=shu_result.period_month,
                period_year=shu_result.period_year,
            ))
        if allocations:
            ShuComponentAllocation.objects.bulk_create(allocations)
            allocs = ShuComponentAllocation.objects.filter(shu_result=shu_result, deleted_at__isnull=True).order_by('id')

    data = []
    for a in allocs:
        data.append({
            'id': a.id,
            'master_configuration_id': a.master_configuration_id,
            'component_name': a.component_name,
            'percentage': float(a.percentage),
            'allocated_amount': float(a.allocated_amount),
            'period_month': a.period_month,
            'period_year': a.period_year,
        })

    return Response({
        'net_profit': float(shu_result.net_profit),
        'results': data
    })


@api_view(['POST'])
def save_component_allocations(request):
    """
    POST → update component allocations for a given period and recalculate member distributions.
    Body: { year, month, allocations: [ { id, percentage }, ... ] }
    """
    year_param = request.data.get('year')
    month_param = request.data.get('month')
    allocations_data = request.data.get('allocations', [])

    if not year_param:
        return Response({'error': 'year is required'}, status=400)

    try:
        year = int(year_param)
        month = int(month_param) if month_param else 13
    except ValueError:
        return Response({'error': 'Invalid year or month value'}, status=400)

    try:
        shu_result = ShuResults.objects.get(period_year=year, period_month=month, deleted_at__isnull=True)
    except ShuResults.DoesNotExist:
        return Response({'error': 'SHU Result not found for this period'}, status=404)

    # Validate that total percentage sums to 100%
    try:
        total_pct = sum(Decimal(str(a.get('percentage', 0))) for a in allocations_data)
    except (TypeError, ValueError, InvalidOperation):
        return Response({'error': 'Nilai persentase tidak valid'}, status=400)

    if total_pct != Decimal('100'):
        return Response({'error': f'Total persentase harus 100%. Saat ini: {total_pct}%'}, status=400)

    jasa_modal_pool = Decimal('0')

    with transaction.atomic():
        for alloc_item in allocations_data:
            alloc_id = alloc_item.get('id')
            try:
                pct = Decimal(str(alloc_item.get('percentage', 0)))
            except (TypeError, ValueError, InvalidOperation):
                return Response({'error': 'Nilai persentase tidak valid'}, status=400)

            allocated_amount = (shu_result.net_profit * pct / Decimal('100')).quantize(Decimal('0.01'))

            try:
                alloc = ShuComponentAllocation.objects.get(id=alloc_id, shu_result=shu_result)
                alloc.percentage = pct
                alloc.allocated_amount = allocated_amount
                alloc.save(update_fields=['percentage', 'allocated_amount', 'updated_at'])
                
                if 'jasa modal' in alloc.component_name.lower():
                    jasa_modal_pool = allocated_amount
            except ShuComponentAllocation.DoesNotExist:
                return Response({'error': f'Allocation item with ID {alloc_id} not found for this period'}, status=404)

        # ── Recalculate Member Distributions ──
        from api.saving.models import MemberSavingObligations
        obligations = MemberSavingObligations.objects.filter(
            saving_type_id__in=[1, 2],
            is_active=True,
            deleted_at__isnull=True,
            member__deleted_at__isnull=True,
        ).values('member_id', 'saving_type_id', 'monthly_amount')

        now = timezone.now()
        if shu_result.period_month == 13:
            months_multiplier = Decimal('12') if year < now.year else Decimal(str(now.month))
        else:
            months_multiplier = Decimal('1')

        member_savings = {}
        for o in obligations:
            mid = o['member_id']
            if mid not in member_savings:
                member_savings[mid] = Decimal('0')
            member_savings[mid] += o['monthly_amount'] * months_multiplier

        total_all_savings = sum(member_savings.values()) or Decimal('0')
        members = Members.objects.filter(deleted_at__isnull=True)

        if shu_result.period_month == 13:
            # Update or create ShuMemberDistributions (annual)
            for m in members:
                total = member_savings.get(m.id, Decimal('0'))
                shu_jasa_modal = (
                    (total / total_all_savings * jasa_modal_pool).quantize(Decimal('0.01'))
                    if total_all_savings > 0 else Decimal('0')
                )
                try:
                    dist = ShuMemberDistributions.objects.get(period=shu_result, member=m)
                    dist.total_savings = total
                    dist.total_shu = shu_jasa_modal
                    dist.updated_at = now
                    dist.save(update_fields=['total_savings', 'total_shu', 'updated_at'])
                except ShuMemberDistributions.DoesNotExist:
                    ShuMemberDistributions.objects.create(
                        period=shu_result,
                        member=m,
                        total_savings=total,
                        total_shu=shu_jasa_modal,
                        status_id=STATUS_PENDING_ID,
                        created_at=now,
                        updated_at=now,
                    )
        else:
            # Update or create ShuMemberDistributionsMonthly
            for m in members:
                total = member_savings.get(m.id, Decimal('0'))
                shu_jasa_modal = (
                    (total / total_all_savings * jasa_modal_pool).quantize(Decimal('0.01'))
                    if total_all_savings > 0 else Decimal('0')
                )
                try:
                    dist = ShuMemberDistributionsMonthly.objects.get(period=shu_result, member=m)
                    dist.total_savings = total
                    dist.total_shu = shu_jasa_modal
                    dist.updated_at = now
                    dist.save(update_fields=['total_savings', 'total_shu', 'updated_at'])
                except ShuMemberDistributionsMonthly.DoesNotExist:
                    ShuMemberDistributionsMonthly.objects.create(
                        period=shu_result,
                        member=m,
                        total_savings=total,
                        total_shu=shu_jasa_modal,
                        created_at=now,
                        updated_at=now,
                    )

    return Response({'message': 'Alokasi SHU dan distribusi anggota berhasil diperbarui'})
