# savings/models.py
from django.db import models
from api.models import Members, Statuses, PaymentMethods, TransactionTypes

class SavingTypes(models.Model):
    name = models.CharField(max_length=50)
    minimum_amount = models.DecimalField(max_digits=15, decimal_places=2, blank=True, null=True)
    is_mandatory = models.BooleanField(blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(blank=True, null=True)
    deleted_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'saving_types'


class MonthlySavingBills(models.Model):
    member = models.ForeignKey(Members, models.DO_NOTHING)
    saving_type = models.ForeignKey(SavingTypes, models.DO_NOTHING)
    bill_period_start = models.DateField()
    bill_period_end = models.DateField()
    amount_due = models.DecimalField(max_digits=15, decimal_places=2)
    amount_paid = models.DecimalField(max_digits=15, decimal_places=2, blank=True, null=True, default=0)
    status = models.ForeignKey(Statuses, models.DO_NOTHING)
    due_date = models.DateField(blank=True, null=True)
    paid_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(blank=True, null=True)
    deleted_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'monthly_saving_bills'

class SavingWallets(models.Model):
    member = models.ForeignKey(Members, models.DO_NOTHING)  # ← langsung pakai class
    saving_type = models.ForeignKey(SavingTypes, models.DO_NOTHING)
    balance = models.DecimalField(max_digits=15, decimal_places=2, blank=True, null=True)
    last_updated = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)
    deleted_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'saving_wallets'
        unique_together = (('member', 'saving_type'),)

class SavingTransactions(models.Model):
    transaction_code = models.CharField(unique=True, max_length=50)
    member = models.ForeignKey(Members, models.DO_NOTHING)
    saving_type = models.ForeignKey(SavingTypes, models.DO_NOTHING)
    transaction_type = models.ForeignKey(TransactionTypes, models.DO_NOTHING)
    payment_method = models.ForeignKey(PaymentMethods, models.DO_NOTHING, blank=True, null=True)
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    status = models.ForeignKey(Statuses, models.DO_NOTHING)
    transaction_date = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'saving_transactions'

class Withdrawals(models.Model):
    member = models.ForeignKey(Members, models.DO_NOTHING)
    saving_type = models.ForeignKey(SavingTypes, models.DO_NOTHING)
    payment_method = models.ForeignKey(PaymentMethods, models.DO_NOTHING, blank=True, null=True)
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    status = models.ForeignKey(Statuses, models.DO_NOTHING)
    notes = models.TextField(blank=True, null=True)
    payment_reference_id = models.CharField(max_length=255, blank=True, null=True)
    proof_file_path = models.CharField(max_length=255, blank=True, null=True)
    request_date = models.DateTimeField(blank=True, null=True)
    approved_date = models.DateTimeField(blank=True, null=True)
    paid_date = models.DateTimeField(blank=True, null=True)
    reject_reason = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(blank=True, null=True)
    deleted_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'withdrawals'


class MemberSavingsConfig(models.Model):
    member = models.OneToOneField(Members, models.DO_NOTHING, related_name='savings_config')
    voluntary_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    is_payroll = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = True
        db_table = 'member_savings_configs'


class VoluntarySavingsRequests(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]

    member = models.ForeignKey(Members, models.DO_NOTHING)
    current_amount = models.DecimalField(max_digits=15, decimal_places=2)
    requested_amount = models.DecimalField(max_digits=15, decimal_places=2)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    status_id = models.IntegerField(blank=True, null=True)
    reject_reason = models.CharField(max_length=255, blank=True, null=True)
    processed_date = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = True
        db_table = 'voluntary_savings_requests'


class ManualPayments(models.Model):
    payable_type_id = models.IntegerField(blank=True, null=True)
    payment_method = models.ForeignKey(PaymentMethods, models.DO_NOTHING, blank=True, null=True)
    receipt_number = models.CharField(max_length=100, blank=True, null=True)
    proof_file_path = models.CharField(max_length=255, blank=True, null=True)
    notes = models.TextField(blank=True, null=True)
    verified_by = models.IntegerField(blank=True, null=True)
    verified_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'manual_payments'


class MemberSavingObligations(models.Model):
    member = models.ForeignKey(Members, models.DO_NOTHING)
    saving_type = models.ForeignKey(SavingTypes, models.DO_NOTHING)
    monthly_amount = models.DecimalField(max_digits=15, decimal_places=2)
    is_active = models.BooleanField(blank=True, null=True)
    effective_from = models.DateField(blank=True, null=True)
    effective_until = models.DateField(blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(blank=True, null=True)
    deleted_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'member_saving_obligations'


class Notifications(models.Model):
    NOTIF_TYPES = [
        ('voluntary_approved', 'Voluntary Savings Approved'),
        ('voluntary_rejected', 'Voluntary Savings Rejected'),
        ('bill_generated', 'Bill Generated'),
    ]

    member = models.ForeignKey(Members, models.DO_NOTHING)
    title = models.CharField(max_length=100)
    message = models.TextField()
    notification_type = models.CharField(max_length=50, choices=NOTIF_TYPES)
    reference_id = models.IntegerField(blank=True, null=True)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        managed = True
        db_table = 'notifications'
