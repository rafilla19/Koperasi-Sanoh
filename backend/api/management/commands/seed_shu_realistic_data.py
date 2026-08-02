import calendar
import random
from datetime import date, datetime, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction
from django.utils import timezone

from api.models import Members, IncomeExpenses, IncomeExpenseCategories
from api.saving.models import MonthlySavingBills
from api.shu.models import (
    ShuResults, ShuComponentAllocation, ShuMemberDistributionsMonthly,
    ShuMemberDistributions,
)
from api.shu.views import (
    _auto_recalculate_shu_results, _auto_sync_monthly_distribution, _sync_annual_distributions,
)

STATUS_PAID = 39
STATUS_UNPAID = 38
LOAN_PAYMENT_SUCCESS = 34

JUNK_CATEGORY_NAMES = ['otherss', 'others', 'test']
LOAN_INCOME_CATEGORY_NAME = 'Pendapatan Jasa Pinjaman Anggota'
RETAIL_INCOME_CATEGORY_NAMES = [
    'Pendapatan Penjualan ATK',
    'Pendapatan Penjualan Supplies',
    'Pendapatan Penjualan Pantry',
    'Pendapatan Penjualan Air',
]
EXPENSE_CATEGORY_NAMES = [
    'Gaji engelola',
    'Biaya Operasional Koperasi',
    'Biaya tagihan Koperasi',
    'Biaya Peralatan Administrasi',
]

SUKARELA_BASE_CHOICES = [50000, 70000, 100000, 150000, 200000, 250000, 300000]
WAJIB_AMOUNT = Decimal('100000')


def _month_range(start_year, start_month, end_year, end_month):
    y, m = start_year, start_month
    while (y, m) <= (end_year, end_month):
        yield y, m
        m += 1
        if m > 12:
            m = 1
            y += 1


class Command(BaseCommand):
    help = (
        'Wipes existing shu_results / shu_component_allocations / shu_member_distributions(_monthly) / '
        'income_expenses (all years -- this data is leftover test junk) and regenerates a realistic, '
        'internally-consistent dataset for a chosen month window (default: Sep 2025 - Jun 2026), including '
        'regenerating monthly_saving_bills (wajib+sukarela) for that same window since SHU jasa modal is '
        'computed directly from paid bills. Reuses the app\'s own _auto_recalculate_shu_results / '
        '_auto_sync_monthly_distribution / _sync_annual_distributions instead of reimplementing that logic. '
        'Runs as a dry-run by default (rolled back at the end); pass --apply to actually write.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--start', default='2025-09', help='YYYY-MM, first month to seed (default 2025-09).')
        parser.add_argument('--end', default='2026-06', help='YYYY-MM, last month to seed (default 2026-06).')
        parser.add_argument('--apply', action='store_true', help='Actually write. Without this, dry-run only (rolled back).')
        parser.add_argument(
            '--no-mark-2025-annual-paid', action='store_true',
            help='Skip marking period_year=2025 annual distributions as already paid out.',
        )
        parser.add_argument('--seed', type=int, default=42, help='Random seed, for reproducible output (default 42).')

    def handle(self, *args, **options):
        apply_changes = options['apply']
        rng = random.Random(options['seed'])

        try:
            start_year, start_month = (int(x) for x in options['start'].split('-'))
            end_year, end_month = (int(x) for x in options['end'].split('-'))
        except ValueError:
            raise CommandError('--start/--end must be in YYYY-MM format')

        months = list(_month_range(start_year, start_month, end_year, end_month))
        if not months:
            raise CommandError('empty month range')
        years = sorted({y for y, m in months})

        self.stdout.write(self.style.NOTICE(
            f"{'APPLY' if apply_changes else 'DRY RUN'} -- seeding "
            f"{months[0][1]:02d}/{months[0][0]} .. {months[-1][1]:02d}/{months[-1][0]} ({len(months)} months)"
        ))

        def _run_all_steps():
            self._step1_wipe_shu_tables()
            self._step2_regen_monthly_saving_bills(months, rng)
            self._step3_gen_income_expenses(months, rng)
            self._step4_recalculate_shu_results(months)
            self._step5_sync_distributions(months, years)
            if not options['no_mark_2025_annual_paid'] and 2025 in years:
                self._step6_mark_2025_paid()

        if apply_changes:
            # Commit incrementally (each step/month already wraps its own small
            # transaction internally) instead of one long-lived transaction -- the
            # pooled DB connection can get dropped mid-way on a multi-minute single
            # transaction. Safe to just re-run on failure: step 1 always wipes first.
            _run_all_steps()
        else:
            with transaction.atomic():
                _run_all_steps()
                transaction.set_rollback(True)

        if apply_changes:
            self.stdout.write(self.style.SUCCESS('\nSeed complete. Next, retrain the ML models:'))
            self.stdout.write('  python manage.py train_shu_model')
            self.stdout.write('  python manage.py train_shu_admin_model')
        else:
            self.stdout.write(self.style.WARNING(
                '\nDry run only (all changes rolled back). Re-run with --apply to write these changes.'
            ))

    # -- Step 1 ------------------------------------------------------------

    def _step1_wipe_shu_tables(self):
        self.stdout.write('\n[1/7] Wiping old shu_* tables (all years)...')
        n1 = ShuMemberDistributions.objects.all().delete()[0]
        n2 = ShuMemberDistributionsMonthly.objects.all().delete()[0]
        n3 = ShuComponentAllocation.objects.all().delete()[0]
        # shu_distributions: legacy table with no Django model and no code references
        # anywhere in the app, but it FK's to shu_results so it blocks deleting those.
        with connection.cursor() as cur:
            cur.execute('DELETE FROM shu_distributions')
            n_legacy = cur.rowcount
        n5 = ShuResults.objects.all().delete()[0]
        n6 = IncomeExpenses.objects.all().delete()[0]
        self.stdout.write(
            f'  deleted: annual_dist={n1} monthly_dist={n2} allocations={n3} '
            f'legacy_shu_distributions={n_legacy} shu_results={n5} income_expenses={n6}'
        )

        junk_qs = IncomeExpenseCategories.objects.filter(category_name__in=JUNK_CATEGORY_NAMES)
        n_junk = junk_qs.count()
        junk_qs.delete()
        self.stdout.write(f'  deleted {n_junk} junk income_expense_categories ({JUNK_CATEGORY_NAMES})')

        self.loan_income_category, created = IncomeExpenseCategories.objects.get_or_create(
            category_name=LOAN_INCOME_CATEGORY_NAME,
            defaults={'type': 'INCOME'},
        )
        self.stdout.write(
            f'  income category "{LOAN_INCOME_CATEGORY_NAME}" {"created" if created else "reused"}'
        )

    # -- Step 2 ------------------------------------------------------------

    def _sukarela_amount(self, profile, rng):
        base = profile['sukarela_base']
        noise = rng.uniform(0.8, 1.2)
        amount = round(base * noise / 10000) * 10000
        return Decimal(str(max(amount, 20000)))

    def _step2_regen_monthly_saving_bills(self, months, rng):
        self.stdout.write('\n[2/7] Regenerating monthly_saving_bills for the window...')
        members = list(Members.objects.filter(deleted_at__isnull=True).order_by('id'))
        self.stdout.write(f'  {len(members)} member(s) in scope')

        # Fixed per-member profile, stable across the whole window -- gives the
        # per-member ML model real learnable signal instead of pure per-row noise.
        profiles = {
            m.id: {
                'reliability': rng.uniform(0.75, 0.98),
                'sukarela_base': rng.choice(SUKARELA_BASE_CHOICES),
            }
            for m in members
        }

        total_deleted_txn = 0
        total_deleted_bills = 0
        total_created = 0

        for year, month in months:
            _, last_day = calendar.monthrange(year, month)
            period_start = date(year, month, 1)
            period_end = date(year, month, last_day)
            due_date = period_end

            existing_ids = list(MonthlySavingBills.objects.filter(
                bill_period_start=period_start
            ).values_list('id', flat=True))
            if existing_ids:
                with connection.cursor() as cur:
                    cur.execute(
                        'DELETE FROM saving_transactions WHERE monthly_saving_bill_id = ANY(%s)',
                        [existing_ids],
                    )
                    total_deleted_txn += cur.rowcount
                n_deleted, _ = MonthlySavingBills.objects.filter(id__in=existing_ids).delete()
                total_deleted_bills += n_deleted

            bills = []
            for m in members:
                profile = profiles[m.id]
                for saving_type_id, amount_due in ((1, WAJIB_AMOUNT), (2, self._sukarela_amount(profile, rng))):
                    if rng.random() < profile['reliability']:
                        status_id = STATUS_PAID
                        amount_paid = amount_due
                        paid_at = timezone.make_aware(
                            datetime.combine(due_date, datetime.min.time())
                        ) - timedelta(days=rng.randint(0, 5))
                    else:
                        status_id = STATUS_UNPAID
                        amount_paid = Decimal('0')
                        paid_at = None
                    bills.append(MonthlySavingBills(
                        member_id=m.id,
                        saving_type_id=saving_type_id,
                        bill_period_start=period_start,
                        bill_period_end=period_end,
                        amount_due=amount_due,
                        amount_paid=amount_paid,
                        status_id=status_id,
                        due_date=due_date,
                        paid_at=paid_at,
                        created_at=timezone.now(),
                        updated_at=timezone.now(),
                    ))
            MonthlySavingBills.objects.bulk_create(bills)
            total_created += len(bills)
            self.stdout.write(
                f'  {month:02d}/{year}: deleted {len(existing_ids)} old bill(s) '
                f'({total_deleted_txn if existing_ids else 0} linked txns so far), created {len(bills)} new bill(s)'
            )

        self.stdout.write(
            f'  totals: deleted {total_deleted_bills} bill(s) / {total_deleted_txn} linked txn(s), '
            f'created {total_created} bill(s)'
        )

    # -- Step 3 --------------------------------------------------------------

    def _real_loan_interest(self, year, month):
        with connection.cursor() as cur:
            cur.execute('''
                SELECT COALESCE(SUM(li.amount_interest), 0)
                FROM loan_payments lp
                JOIN loan_installments li ON li.id = lp.installment_id
                WHERE lp.status_id = %s
                  AND EXTRACT(YEAR FROM lp.payment_date) = %s
                  AND EXTRACT(MONTH FROM lp.payment_date) = %s
            ''', [LOAN_PAYMENT_SUCCESS, year, month])
            row = cur.fetchone()
            return Decimal(row[0]) if row and row[0] is not None else Decimal('0')

    def _ie_row(self, category, type_, amount, year, month, last_day, rng):
        day = rng.randint(1, last_day)
        dt = timezone.make_aware(datetime(year, month, day, rng.randint(8, 17), 0))
        return IncomeExpenses(
            transaction_date=dt,
            category=category,
            type=type_,
            amount=amount,
            created_at=timezone.now(),
            updated_at=timezone.now(),
        )

    def _step3_gen_income_expenses(self, months, rng):
        self.stdout.write('\n[3/7] Generating income_expenses...')
        categories = {c.category_name: c for c in IncomeExpenseCategories.objects.all()}
        retail_cats = [categories[n] for n in RETAIL_INCOME_CATEGORY_NAMES if n in categories]
        expense_cats = {n: categories[n] for n in EXPENSE_CATEGORY_NAMES if n in categories}

        total_rows = 0
        for year, month in months:
            _, last_day = calendar.monthrange(year, month)
            rows = []

            interest = self._real_loan_interest(year, month)
            if interest <= 0:
                interest = Decimal(rng.randint(2500000, 4000000))
            rows.append(self._ie_row(self.loan_income_category, 'income', interest, year, month, last_day, rng))

            total_income = interest
            if retail_cats:
                for cat in rng.sample(retail_cats, k=rng.randint(1, min(3, len(retail_cats)))):
                    amount = Decimal(rng.randint(200000, 1500000))
                    total_income += amount
                    rows.append(self._ie_row(cat, 'income', amount, year, month, last_day, rng))

            # Expenses are a bounded fraction of THIS month's actual income, not fixed
            # ranges -- guarantees net_profit stays positive every month (required for
            # the admin ML model, which drops non-positive months) while still varying
            # naturally with income.
            expense_budget = (total_income * Decimal(str(rng.uniform(0.55, 0.75)))).quantize(Decimal('1'))
            weights = {
                'Gaji engelola': Decimal('0.60'),
                'Biaya Operasional Koperasi': Decimal('0.22'),
                'Biaya tagihan Koperasi': Decimal('0.08'),
                'Biaya Peralatan Administrasi': Decimal('0.10'),
            }
            include_peralatan = rng.random() < 0.4
            active_weights = {
                name: w for name, w in weights.items()
                if name in expense_cats and (name != 'Biaya Peralatan Administrasi' or include_peralatan)
            }
            weight_sum = sum(active_weights.values()) or Decimal('1')
            for name, w in active_weights.items():
                jitter = Decimal(str(rng.uniform(0.85, 1.15)))
                amount = (expense_budget * w / weight_sum * jitter).quantize(Decimal('1'))
                if amount > 0:
                    rows.append(self._ie_row(expense_cats[name], 'expense', amount, year, month, last_day, rng))

            IncomeExpenses.objects.bulk_create(rows)
            total_rows += len(rows)
            total_expense = sum((r.amount for r in rows if r.type == 'expense'), Decimal('0'))
            self.stdout.write(
                f'  {month:02d}/{year}: {len(rows)} row(s) -- income={total_income} expense={total_expense}'
            )

        self.stdout.write(f'  total: {total_rows} income_expenses row(s) created')

    # -- Step 4 --------------------------------------------------------------

    def _step4_recalculate_shu_results(self, months):
        self.stdout.write('\n[4/7] Recalculating shu_results + shu_component_allocations...')
        for year, month in months:
            _auto_recalculate_shu_results(year, month)
        for year, month in months:
            r = ShuResults.objects.get(period_year=year, period_month=month)
            self.stdout.write(
                f'  {month:02d}/{year}: revenue={r.total_revenue} expense={r.total_expense} net_profit={r.net_profit}'
            )

    # -- Step 5 & 6 ------------------------------------------------------------

    def _step5_sync_distributions(self, months, years):
        self.stdout.write('\n[5/7] Syncing shu_member_distributions_monthly...')
        for year, month in months:
            _auto_sync_monthly_distribution(year, month)
            count = ShuMemberDistributionsMonthly.objects.filter(period_year=year, period_month=month).count()
            self.stdout.write(f'  {month:02d}/{year}: {count} member distribution row(s)')

        self.stdout.write('\n[6/7] Syncing annual shu_member_distributions...')
        for year in years:
            _sync_annual_distributions(year)
            count = ShuMemberDistributions.objects.filter(period_year=year).count()
            self.stdout.write(f'  {year}: {count} member annual distribution row(s)')

    # -- Step 7 --------------------------------------------------------------

    def _step6_mark_2025_paid(self):
        self.stdout.write('\n[7/7] Marking 2025 annual distributions as already paid out (RAT presumed Jan 2026)...')
        paid_at = timezone.make_aware(datetime(2026, 1, 15, 10, 0))
        n = ShuMemberDistributions.objects.filter(period_year=2025).update(
            status_shu=True, distributed_status=True, paid_at=paid_at, updated_at=timezone.now(),
        )
        self.stdout.write(f'  marked {n} row(s) as paid (period_year=2025)')
