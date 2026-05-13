from django.db import models
from api.master.models import Status, PaymentMethod, Member, StatusCategory, Role, User
# Create your models here.

#Loan Member 
class LoanType(models.Model):
    name = models.CharField(max_length=50)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'loan_types'
        managed = False
        
class LoanApplication(models.Model):
    member = models.ForeignKey('Member', on_delete=models.RESTRICT)
    loan_type = models.ForeignKey('LoanType', on_delete=models.RESTRICT)
    amount_requested = models.DecimalField(max_digits=15, decimal_places=2)
    duration_months = models.SmallIntegerField()
    purpose = models.CharField(max_length=255)
    # description = models.TextField()
    status = models.ForeignKey('Status', on_delete=models.RESTRICT)
    # approval_date = models.DateField(null=True, blank=True)
    salary_statement_file = models.FileField(null=True, blank=True)
    # salary_statement_file = models.CharField(max_length=500)
    admin = models.ForeignKey('User', on_delete=models.RESTRICT, null=True, blank=True)

    reject_reason = models.CharField(max_length=255, null=True, blank=True)

    deleted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    applied_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'loan_applications'
        managed = False
        
class Loan(models.Model):
    application = models.ForeignKey('LoanApplication', on_delete=models.RESTRICT)
    member = models.ForeignKey('Member', on_delete=models.RESTRICT)

    principal_amount = models.DecimalField(max_digits=15, decimal_places=2)
    interest_amount = models.DecimalField(max_digits=15, decimal_places=2)
    total_amount = models.DecimalField(max_digits=15, decimal_places=2)

    start_date = models.DateField()
    due_date = models.DateField()
    remaining_balance = models.DecimalField(max_digits=15, decimal_places=2)

    status = models.ForeignKey('Status', on_delete=models.RESTRICT)

    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'loans'
        managed = False
        
class LoanInstallment(models.Model):
    loan = models.ForeignKey('Loan', on_delete=models.RESTRICT)

    installment_number = models.SmallIntegerField()
    due_date = models.DateField()

    amount_principal = models.DecimalField(max_digits=15, decimal_places=2)
    amount_interest = models.DecimalField(max_digits=15, decimal_places=2)
    amount_total = models.DecimalField(max_digits=15, decimal_places=2)

    status = models.ForeignKey('Status', on_delete=models.RESTRICT)

    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'loan_installments'
        managed = False
        
class LoanPayment(models.Model):
    installment = models.ForeignKey('LoanInstallment', on_delete=models.RESTRICT)

    amount_paid = models.DecimalField(max_digits=15, decimal_places=2)
    payment_date = models.DateTimeField()

    payment_method = models.ForeignKey('PaymentMethod', on_delete=models.CASCADE)
    payment_reference_id = models.IntegerField()

    status = models.ForeignKey('Status', on_delete=models.RESTRICT)

    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'loan_payments'
        managed = False
        