import calendar
from datetime import date
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from api.models import Members
from api.shu.models import (
    MasterConfiguration, ShuComponentAllocation, ShuMemberDistributionsMonthly, ShuResults,
)
from api.shu.views import _member_savings_by_period, _sync_annual_distributions

JASA_MODAL_CONFIG_ID = 1


class Command(BaseCommand):
    help = (
        'One-time fix: recalculate existing shu_member_distributions_monthly (and the derived '
        'annual shu_member_distributions) using actual saving_transactions (status_id 34/39) '
        'instead of the old member_saving_obligations logic. Overwrites simp_wajib, simp_sukarela, '
        'total_savings and total_shu for every active member on each period that already has data. '
        'Runs as a dry-run by default; pass --apply to actually update the records.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--apply',
            action='store_true',
            help='Actually update the records. Without this flag, only a dry-run summary is printed.',
        )
        parser.add_argument(
            '--year',
            type=int,
            default=None,
            help='Limit recalculation to a single year (default: all years present in shu_member_distributions_monthly).',
        )

    def _resolve_jasa_modal_pool(self, shu_result):
        try:
            alloc = ShuComponentAllocation.objects.get(
                shu_result=shu_result, master_configuration_id=JASA_MODAL_CONFIG_ID, deleted_at__isnull=True,
            )
            return alloc.allocated_amount
        except ShuComponentAllocation.DoesNotExist:
            cfg = MasterConfiguration.objects.filter(pk=JASA_MODAL_CONFIG_ID, deleted_at__isnull=True).first()
            if not cfg:
                return None
            return (shu_result.net_profit * cfg.percentage / Decimal('100')).quantize(Decimal('0.01'))

    def handle(self, *args, **options):
        apply_changes = options['apply']
        year_filter = options['year']

        periods_qs = ShuMemberDistributionsMonthly.objects.values_list(
            'period_year', 'period_month'
        ).distinct().order_by('period_year', 'period_month')
        if year_filter:
            periods_qs = periods_qs.filter(period_year=year_filter)

        periods = [(y, m) for y, m in periods_qs if y and m]
        if not periods:
            self.stdout.write(self.style.WARNING('No existing shu_member_distributions_monthly periods found.'))
            return

        members = list(Members.objects.filter(deleted_at__isnull=True))
        now_ts = timezone.now()
        total_updated = 0
        affected_years = set()

        for year, month in periods:
            try:
                shu_result = ShuResults.objects.get(period_year=year, period_month=month, deleted_at__isnull=True)
            except ShuResults.DoesNotExist:
                self.stdout.write(self.style.WARNING(f'  {month}/{year}: ShuResults not found, skipped.'))
                continue

            jasa_modal_pool = self._resolve_jasa_modal_pool(shu_result)
            if jasa_modal_pool is None:
                self.stdout.write(self.style.WARNING(f'  {month}/{year}: Jasa Modal allocation not found, skipped.'))
                continue

            _, last_day = calendar.monthrange(year, month)
            period_start = date(year, month, 1)
            period_end = date(year, month, last_day)

            member_savings = _member_savings_by_period(
                period_start, period_end, member_ids=[m.id for m in members]
            )

            total_all_savings = sum(
                (v['wajib'] + v['sukarela']) for v in member_savings.values()
            ) or Decimal('0')

            period_updated = 0
            with transaction.atomic():
                for m in members:
                    sv = member_savings.get(m.id, {'wajib': Decimal('0'), 'sukarela': Decimal('0')})
                    simp_wajib = sv['wajib']
                    simp_sukarela = sv['sukarela']
                    total = simp_wajib + simp_sukarela
                    shu_jasa_modal = (
                        (total / total_all_savings * jasa_modal_pool).quantize(Decimal('0.01'))
                        if total_all_savings > 0 else Decimal('0')
                    )
                    dist = ShuMemberDistributionsMonthly.objects.filter(period=shu_result, member=m).first()
                    if dist is None:
                        continue  # only recalculate periods/members that already have a snapshot row
                    changed = (
                        dist.simp_wajib != simp_wajib or dist.simp_sukarela != simp_sukarela
                        or dist.total_savings != total or dist.total_shu != shu_jasa_modal
                    )
                    if changed:
                        period_updated += 1
                    if apply_changes and changed:
                        dist.simp_wajib = simp_wajib
                        dist.simp_sukarela = simp_sukarela
                        dist.total_savings = total
                        dist.total_shu = shu_jasa_modal
                        dist.updated_at = now_ts
                        dist.save(update_fields=['simp_wajib', 'simp_sukarela', 'total_savings', 'total_shu', 'updated_at'])
                if not apply_changes:
                    transaction.set_rollback(True)

            self.stdout.write(f'  {month}/{year}: {period_updated} member row(s) {"updated" if apply_changes else "would change"}.')
            total_updated += period_updated
            affected_years.add(year)

        if apply_changes:
            for year in sorted(affected_years):
                _sync_annual_distributions(year)
            self.stdout.write(self.style.SUCCESS(
                f'Done. {total_updated} monthly row(s) updated across {len(periods)} period(s); '
                f'annual shu_member_distributions re-synced for year(s): {sorted(affected_years)}.'
            ))
        else:
            self.stdout.write(self.style.WARNING(
                f'Dry run only — {total_updated} monthly row(s) would change across {len(periods)} period(s). '
                'Re-run with --apply to update these records.'
            ))
