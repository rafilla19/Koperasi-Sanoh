from django.db import models

class Department(models.Model):
    department_name = models.CharField(max_length=100)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'departments'
        managed = False

class Status(models.Model):
    status_category = models.ForeignKey('api.StatusCategory', on_delete=models.RESTRICT)
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
    
    
    
#member module
class Member(models.Model):
    full_name = models.CharField(max_length=100)
    employee_status_id = models.IntegerField()

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
    role = models.ForeignKey('api.Role', on_delete=models.RESTRICT)
    is_active = models.BooleanField()
    created_at = models.DateTimeField()

    class Meta:
        db_table = 'users'
        managed = False

class Notification(models.Model):
    member = models.ForeignKey('api.Member', on_delete=models.CASCADE)
    title = models.CharField(max_length=255)
    message = models.TextField()
    notification_type = models.CharField(max_length=50) # e.g., 'LOAN', 'WITHDRAWAL', 'PAYMENT'
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'notifications'
        managed = False

class Withdrawal(models.Model):
    member = models.ForeignKey('api.Member', on_delete=models.RESTRICT)
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    status = models.ForeignKey('api.Status', on_delete=models.RESTRICT)
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