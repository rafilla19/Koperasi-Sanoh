"""Shared penalty-accrual helpers for overdue loan installments and savings bills.

Penalty now accrues per calendar day late (funding_settings.daily_limit),
capped at funding_settings.monthly_limit — instead of the old behavior of
setting the full monthly_limit the instant something went overdue. Once the
accrued amount reaches the monthly_limit cap, it stops growing. Accrual stops
entirely once the penalty has actually been paid (penalty_paid set), so
already-settled history is never rewritten.
"""
from django.db import connection

_ACCRUAL_EXPR = (
    "LEAST(COALESCE(fs.daily_limit, 0) * GREATEST((CURRENT_DATE - {alias}.due_date), 0), fs.monthly_limit)"
)


def accrue_loan_penalties(member_id=None, loan_id=None):
    """Recompute penalty_due on overdue loan_installments using funding_settings id=2."""
    accrual = _ACCRUAL_EXPR.format(alias="li")
    extra_from = ""
    extra_where = ""
    params = []

    if member_id is not None:
        extra_from = ", loans l2"
        extra_where = "AND l2.id = li.loan_id AND l2.member_id = %s"
        params.append(member_id)
    elif loan_id is not None:
        extra_where = "AND li.loan_id = %s"
        params.append(loan_id)

    query = f"""
        UPDATE loan_installments li
        SET penalty_due = {accrual},
            updated_at = NOW()
        FROM funding_settings fs
        {extra_from}
        WHERE fs.id = 2
          AND fs.is_active = TRUE
          {extra_where}
          AND (li.status_id = 30 OR (li.status_id IN (27, 28) AND li.due_date < CURRENT_DATE))
          AND (li.penalty_paid IS NULL OR li.penalty_paid = 0)
          AND (li.penalty_due IS NULL OR li.penalty_due < {accrual})
    """
    with connection.cursor() as cursor:
        cursor.execute(query, params)


def accrue_savings_penalties(member_id=None, bill_ids=None):
    """Recompute penalty_due on overdue Simpanan Wajib bills using funding_settings id=3."""
    accrual = _ACCRUAL_EXPR.format(alias="msb")
    extra_where = ""
    params = []

    if member_id is not None:
        extra_where += "AND msb.member_id = %s "
        params.append(member_id)
    if bill_ids is not None:
        extra_where += "AND msb.id IN %s "
        params.append(tuple(bill_ids))

    query = f"""
        UPDATE monthly_saving_bills msb
        SET penalty_due = {accrual},
            updated_at = NOW()
        FROM funding_settings fs
        WHERE fs.id = 3
          AND fs.is_active = TRUE
          AND msb.saving_type_id = 1
          AND msb.status_id = 38
          AND msb.due_date < CURRENT_DATE
          AND msb.deleted_at IS NULL
          {extra_where}
          AND (msb.penalty_paid IS NULL OR msb.penalty_paid = 0)
          AND (msb.penalty_due IS NULL OR msb.penalty_due < {accrual})
    """
    with connection.cursor() as cursor:
        cursor.execute(query, params)
