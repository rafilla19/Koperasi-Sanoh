# shu/models.py
from django.db import models
from api.models import Members, Statuses  # noqa: F401

# Status IDs from the `statuses` table
STATUS_PENDING_ID = 41
STATUS_PAID_ID = 39


class AccountingPeriods(models.Model):
    year = models.IntegerField()
    month = models.IntegerField(blank=True, null=True)
    is_closed = models.BooleanField(default=False)
    created_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(blank=True, null=True)
    deleted_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'accounting_periods'


class ShuPeriods(models.Model):
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('calculated', 'Calculated'),
        ('distributed', 'Distributed'),
        ('closed', 'Closed'),
    ]

    year = models.IntegerField(unique=True)
    total_profit = models.DecimalField(max_digits=20, decimal_places=2, default=0)
    total_savings_weight = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    total_transaction_weight = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    member_services_weight = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    reserve_fund_weight = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    social_fund_weight = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    education_fund_weight = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    management_weight = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = True
        db_table = 'shu_periods'


class MasterConfiguration(models.Model):
    component_name = models.CharField(max_length=255)
    percentage = models.DecimalField(max_digits=10, decimal_places=2)
    distributed_member = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'master_configurations'


class ShuMemberDistributions(models.Model):
    period = models.ForeignKey('ShuResults', models.DO_NOTHING)
    member = models.ForeignKey(Members, models.DO_NOTHING)
    total_savings = models.DecimalField(max_digits=20, decimal_places=2, default=0)
    total_shu = models.DecimalField(max_digits=20, decimal_places=2, default=0)
    status = models.ForeignKey(Statuses, models.DO_NOTHING, db_column='status')
    paid_at = models.DateTimeField(blank=True, null=True)
    notes = models.TextField(blank=True, null=True)
    transfer_proof = models.TextField(blank=True, null=True)
    transfer_proof_url = models.TextField(blank=True, null=True)
    transfer_proof_name = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'shu_member_distributions'
        unique_together = (('period', 'member'),)


class ShuResults(models.Model):
    period_year = models.IntegerField()
    period_month = models.IntegerField(null=True, blank=True)
    total_revenue = models.DecimalField(max_digits=20, decimal_places=2, default=0)
    total_expense = models.DecimalField(max_digits=20, decimal_places=2, default=0)
    net_profit = models.DecimalField(max_digits=20, decimal_places=2, default=0)
    distributed_status = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'shu_results'
        unique_together = (('period_year', 'period_month'),)


class ShuMemberDistributionsMonthly(models.Model):
    period = models.ForeignKey('ShuResults', models.DO_NOTHING)
    member = models.ForeignKey(Members, models.DO_NOTHING)
    total_savings = models.DecimalField(max_digits=20, decimal_places=2, default=0)
    total_shu = models.DecimalField(max_digits=20, decimal_places=2, default=0)
    distributed_status = models.BooleanField(default=False)
    created_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'shu_member_distributions_monthly'
        unique_together = (('period', 'member'),)


class ShuMemberBases(models.Model):
    shu_result = models.ForeignKey('ShuResults', models.DO_NOTHING, db_column='shu_result_id')
    member = models.ForeignKey(Members, models.DO_NOTHING)
    total_saving_amount = models.DecimalField(max_digits=20, decimal_places=2, default=0)
    shu_jasa_modal = models.DecimalField(max_digits=20, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = 'shu_member_bases'
        unique_together = (('shu_result', 'member'),)


class ShuComponentAllocation(models.Model):
    shu_result = models.ForeignKey('ShuResults', models.DO_NOTHING, db_column='shu_result_id')
    master_configuration = models.ForeignKey('MasterConfiguration', models.DO_NOTHING, db_column='master_configuration_id')
    component_name = models.CharField(max_length=255)
    percentage = models.DecimalField(max_digits=10, decimal_places=2)
    allocated_amount = models.DecimalField(max_digits=20, decimal_places=2)
    period_month = models.IntegerField()
    period_year = models.IntegerField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'shu_component_allocations'
