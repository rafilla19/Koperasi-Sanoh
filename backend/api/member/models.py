from django.db import models


class EmailOTP(models.Model):
    email = models.EmailField(max_length=255, unique=True)
    code = models.CharField(max_length=10, db_column='otp_code')
    is_verified = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'email_otps'
        managed = True

    def __str__(self):
        return f"{self.email} - {self.code}"


class Member(models.Model):
    user = models.ForeignKey('member.User', on_delete=models.RESTRICT, db_column='user_id', null=True, blank=True)
    nik_ktp = models.CharField(max_length=50)
    nik_employee = models.CharField(max_length=50, null=True, blank=True)
    full_name = models.CharField(max_length=100)
    phone_number = models.CharField(max_length=30, null=True, blank=True)
    place_of_birth = models.CharField(max_length=100, null=True, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    address = models.TextField(null=True, blank=True)
    gender = models.CharField(max_length=10, null=True, blank=True)
    department_id = models.IntegerField(null=True, blank=True)
    employee_status_id = models.IntegerField(null=True, blank=True)
    member_status_id = models.IntegerField(null=True, blank=True)
    join_date = models.DateField(null=True, blank=True)
    ktp_file_path = models.CharField(max_length=500, null=True, blank=True)
    npwp_file = models.CharField(max_length=500, null=True, blank=True)
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    npwp_number = models.CharField(max_length=50, null=True, blank=True)
    contract_end = models.DateField(null=True, blank=True)

    class Meta:
        db_table = 'members'
        managed = False


class StatusCategory(models.Model):
    category_name = models.CharField(max_length=50)

    class Meta:
        db_table = 'status_categories'
        managed = False


class Role(models.Model):
    role_name = models.CharField(max_length=50)

    class Meta:
        db_table = 'roles'
        managed = False


class User(models.Model):
    email = models.EmailField()
    password = models.CharField(max_length=255)
    role = models.ForeignKey('member.Role', on_delete=models.RESTRICT)
    is_active = models.BooleanField()
    created_at = models.DateTimeField()

    class Meta:
        db_table = 'users'
        managed = False


class MemberBankAccount(models.Model):
    member = models.ForeignKey('member.Member', on_delete=models.RESTRICT, db_column='member_id')
    bank_id = models.IntegerField(null=True, blank=True)
    account_holder_name = models.CharField(max_length=255, null=True, blank=True)
    account_number = models.CharField(max_length=100, null=True, blank=True)

    class Meta:
        db_table = 'member_bank_accounts'
        managed = False


class MemberSavingObligation(models.Model):
    member = models.ForeignKey('member.Member', on_delete=models.RESTRICT, db_column='member_id')
    saving_type_id = models.IntegerField()
    monthly_amount = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    effective_until = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(null=True, blank=True)

    class Meta:
        db_table = 'member_saving_obligations'
        managed = False


# class Notification(models.Model):
#     member = models.ForeignKey('member.Member', on_delete=models.CASCADE)
#     title = models.CharField(max_length=255)
#     message = models.TextField()
#     notification_type = models.CharField(max_length=50)
#     is_read = models.BooleanField(default=False)
#     created_at = models.DateTimeField(auto_now_add=True)

#     class Meta:
#         db_table = 'notifications'
#         managed = False


class Withdrawal(models.Model):
    member = models.ForeignKey('member.Member', on_delete=models.RESTRICT)
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    status = models.ForeignKey('master.Status', on_delete=models.RESTRICT)
    proof_file_path = models.CharField(max_length=500, null=True, blank=True)
    request_date = models.DateTimeField()
    paid_date = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'withdrawals'
        managed = False


class SHUComponent(models.Model):
    component_name = models.CharField(max_length=100, unique=True)
    percentage = models.DecimalField(max_digits=5, decimal_places=2)
    distributed_member = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'master_configurations'
        managed = False


class PaymentChannel(models.Model):
    channel_code = models.CharField(max_length=50)
    channel_name = models.CharField(max_length=100)
    fee_percentage = models.DecimalField(max_digits=5, decimal_places=2)
    fee_fixed = models.DecimalField(max_digits=15, decimal_places=2)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'payment_channels'
        managed = False


class IncomeExpenseCategory(models.Model):
    TYPE_CHOICES = [
        ('INCOME', 'Income'),
        ('EXPENSE', 'Outcome'),
    ]

    category_name = models.CharField(max_length=100)
    type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'income_expense_categories'
        managed = False
