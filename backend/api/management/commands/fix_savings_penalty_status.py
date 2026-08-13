from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from api.saving.models import MonthlySavingBills
from api.loan.models import LoanFundingSetting

MANDATORY_SAVING_TYPE_ID = 1
VOLUNTARY_SAVING_TYPE_ID = 2
STATUS_UNPAID = 38
STATUS_OVERDUE = 40
PENALTY_SETTING_ID = 3  # funding_settings: "Penalti Simpanan Wajib"


class Command(BaseCommand):
    help = (
        'One-time fix for bills that sp_generate_bills previously (incorrectly) '
        'created as OVERDUE (status_id=40) with nothing paid, which made them '
        'permanently un-payable through the payroll/manual/gateway payment flows '
        '(those treat status_id IN (39,40) as "already paid"). Resets those bills '
        'back to UNPAID (status_id=38) and, for Simpanan Wajib bills already past '
        'their due date, seeds penalty_due so they immediately reflect the denda '
        'they would have accrued. Runs as a dry-run by default; pass --apply to '
        'actually update the records.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--apply',
            action='store_true',
            help='Actually update the records. Without this flag, only a dry-run summary is printed.',
        )

    def handle(self, *args, **options):
        today = timezone.now().date()

        stuck_qs = MonthlySavingBills.objects.filter(
            status_id=STATUS_OVERDUE,
            deleted_at__isnull=True,
        ).filter(Q(amount_paid__isnull=True) | Q(amount_paid=0))
        stuck = list(stuck_qs.values_list('id', 'saving_type_id'))
        stuck_wajib_ids = [i for i, t in stuck if t == MANDATORY_SAVING_TYPE_ID]
        stuck_other_ids = [i for i, t in stuck if t != MANDATORY_SAVING_TYPE_ID]

        settled_count = MonthlySavingBills.objects.filter(
            status_id=STATUS_OVERDUE,
            deleted_at__isnull=True,
            amount_paid__gt=0,
        ).count()

        setting = LoanFundingSetting.objects.filter(pk=PENALTY_SETTING_ID, is_active=True).first()
        penalty_amount = setting.monthly_limit if setting else None

        self.stdout.write(f"Stuck OVERDUE-but-unpaid bills found: {len(stuck)} "
                           f"({len(stuck_wajib_ids)} Simpanan Wajib, {len(stuck_other_ids)} other types)")
        self.stdout.write(f"Legitimately paid-late bills (status_id=40, amount_paid>0) — left untouched: {settled_count}")
        self.stdout.write(f"Current denda Simpanan Wajib setting (funding_settings id={PENALTY_SETTING_ID}): "
                           f"{penalty_amount if penalty_amount is not None else 'NOT FOUND / inactive'}")

        preexisting_qs = MonthlySavingBills.objects.filter(
            status_id=STATUS_UNPAID,
            deleted_at__isnull=True,
            penalty_due__gt=0,
        )
        preexisting = list(preexisting_qs.values_list('id', 'penalty_due'))
        mismatched = [(i, p) for i, p in preexisting if penalty_amount is None or p != penalty_amount]
        self.stdout.write(f"Pre-existing unpaid bills with penalty_due already set: {len(preexisting)} "
                           f"({len(mismatched)} with a value different from the current setting — left untouched either way)")
        if mismatched:
            sample = ', '.join(f'id={i} penalty_due={p}' for i, p in mismatched[:10])
            self.stdout.write(self.style.WARNING(f"  Mismatched sample: {sample}"))

        if not stuck:
            self.stdout.write(self.style.SUCCESS('No stuck bills found. Nothing to do.'))
            return

        if not options['apply']:
            self.stdout.write(self.style.WARNING('Dry run only — no changes made. Re-run with --apply to update these records.'))
            return

        with transaction.atomic():
            now = timezone.now()
            all_stuck_ids = stuck_wajib_ids + stuck_other_ids
            reset_count = MonthlySavingBills.objects.filter(id__in=all_stuck_ids).update(
                status_id=STATUS_UNPAID,
                amount_paid=0,
                updated_at=now,
            )

            penalty_seeded = 0
            if penalty_amount:
                penalty_seeded = MonthlySavingBills.objects.filter(
                    id__in=stuck_wajib_ids,
                    due_date__lt=today,
                ).filter(Q(penalty_due__isnull=True) | Q(penalty_due=0)).update(
                    penalty_due=penalty_amount,
                    updated_at=now,
                )

        self.stdout.write(self.style.SUCCESS(
            f'Reset {reset_count} bill(s) to UNPAID (status_id=38). '
            f'Seeded penalty_due on {penalty_seeded} Simpanan Wajib bill(s).'
        ))
