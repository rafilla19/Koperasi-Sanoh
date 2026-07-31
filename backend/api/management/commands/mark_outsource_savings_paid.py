from django.core.management.base import BaseCommand
from django.db.models import Count, F
from django.utils import timezone
from api.saving.models import MonthlySavingBills

OUTSOURCE_EMPLOYEE_STATUS_ID = 3
PAID_STATUS_ID = 39


class Command(BaseCommand):
    help = (
        'One-time fix: mark existing monthly_saving_bills (pokok/wajib/sukarela) '
        'for OUTSOURCE members (employee_status_id=3) as PAID (status_id=39). '
        'Runs as a dry-run by default; pass --apply to actually update the records.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--apply',
            action='store_true',
            help='Actually update the records. Without this flag, only a dry-run summary is printed.',
        )

    def handle(self, *args, **options):
        qs = MonthlySavingBills.objects.filter(
            member__employee_status_id=OUTSOURCE_EMPLOYEE_STATUS_ID,
            deleted_at__isnull=True,
        ).exclude(status_id=PAID_STATUS_ID)

        total = qs.count()
        if total == 0:
            self.stdout.write(self.style.SUCCESS('No unpaid bills found for OUTSOURCE members. Nothing to do.'))
            return

        by_type = qs.values('saving_type__name').annotate(count=Count('id')).order_by('saving_type__name')
        self.stdout.write(f'Found {total} bill(s) for OUTSOURCE members not yet marked PAID (status_id=39):')
        for row in by_type:
            self.stdout.write(f"  - {row['saving_type__name']}: {row['count']}")

        if not options['apply']:
            self.stdout.write(self.style.WARNING('Dry run only — no changes made. Re-run with --apply to update these records.'))
            return

        updated = qs.update(
            status_id=PAID_STATUS_ID,
            amount_paid=F('amount_due'),
            paid_at=timezone.now(),
            updated_at=timezone.now(),
        )
        self.stdout.write(self.style.SUCCESS(f'Updated {updated} bill(s) to PAID (status_id=39).'))
