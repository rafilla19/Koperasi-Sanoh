# api/models.py
from django.db import models

from api.member.models import (
    Member as Members,
    MemberBankAccount as MemberBankAccounts,
    IncomeExpenseCategory as IncomeExpenseCategories,
)
from api.master.models import (
    Department as Departments,
    PaymentMethod as PaymentMethods,
    Status as Statuses,
)


class WAConfig(models.Model):
    phone_number = models.CharField(max_length=20)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = False
        db_table = 'wa_config'


class WAQuestion(models.Model):
    label = models.CharField(max_length=100)
    message = models.TextField()
    sort_order = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = False
        db_table = 'wa_questions'
        ordering = ['sort_order', 'id']


class TransactionTypes(models.Model):
    name = models.CharField(max_length=100)
    created_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(blank=True, null=True)
    deleted_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'transaction_types'


class IncomeExpenses(models.Model):
    TYPE_INCOME = 'income'
    TYPE_EXPENSE = 'expense'

    TYPE_CHOICES = [
        (TYPE_INCOME, 'Income'),
        (TYPE_EXPENSE, 'Expense'),
    ]

    transaction_date = models.DateTimeField()
    category = models.ForeignKey(IncomeExpenseCategories, models.DO_NOTHING)
    type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    invoice_number = models.CharField(max_length=100, blank=True, null=True)
    supplier_customer = models.CharField(max_length=255, blank=True, null=True)
    quantity = models.DecimalField(max_digits=15, decimal_places=2, blank=True, null=True)
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    created_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(blank=True, null=True)
    deleted_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'income_expenses'


Departments = Departments
IncomeExpenseCategories = IncomeExpenseCategories
