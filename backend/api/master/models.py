from django.db import models

from api.member.models import (
    Member,
    StatusCategory,
    Role,
    User,
    MemberBankAccount,
    MemberSavingObligation,
    # Notification,
    Withdrawal,
    SHUComponent,
    PaymentChannel,
    IncomeExpenseCategory,
)

class Department(models.Model):
    department_name = models.CharField(max_length=100)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'departments'
        managed = False

class Status(models.Model):
    status_category = models.ForeignKey('member.StatusCategory', on_delete=models.RESTRICT)
    status_code = models.CharField(max_length=50)
    status_name = models.CharField(max_length=100)

    is_active = models.BooleanField()
    can_login = models.BooleanField()
    is_final = models.BooleanField()

    sort_order = models.SmallIntegerField()
    description = models.TextField(null=True, blank=True)

    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'statuses'
        managed = False
        
class PaymentMethod(models.Model):
    name = models.CharField(max_length=50)

    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'payment_methods'
        managed = False

class DocumentType(models.Model):
    name = models.CharField(max_length=100)

    class Meta:
        db_table = 'document_types'
        managed = False
        ordering = ['name']

    def __str__(self):
        return self.name


class DocumentArchive(models.Model):
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    type_id = models.IntegerField(blank=True, null=True)
    document_url = models.URLField(max_length=1000, blank=True, null=True)
    file_name = models.CharField(max_length=500, blank=True, null=True)
    file_size = models.BigIntegerField(null=True, blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'document_archives'
        ordering = ['-uploaded_at']

    def __str__(self):
        return self.title
