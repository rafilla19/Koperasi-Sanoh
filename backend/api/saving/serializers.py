# savings/serializers.py
from rest_framework import serializers
from .models import (
    MemberSavingObligations, MonthlySavingBills, SavingWallets, SavingTransactions, Withdrawals,
    SavingTypes, VoluntarySavingsRequests, Notifications,
)


# ── SHARED ───────────────────────────────────────────────────────

class SavingTypesSerializer(serializers.ModelSerializer):
    class Meta:
        model = SavingTypes
        fields = ['id', 'name', 'minimum_amount', 'is_mandatory']


class SavingWalletsSerializer(serializers.ModelSerializer):
    saving_type = SavingTypesSerializer(read_only=True)
    saving_type_id = serializers.IntegerField(source='saving_type.id', read_only=True)

    class Meta:
        model = SavingWallets
        fields = ['id', 'saving_type', 'saving_type_id', 'balance', 'last_updated']


# ── MEMBER ───────────────────────────────────────────────────────

class SavingTransactionsSerializer(serializers.ModelSerializer):
    saving_type_name = serializers.CharField(source='saving_type.name', read_only=True)
    transaction_type_name = serializers.CharField(source='transaction_type.name', read_only=True)
    status_name = serializers.CharField(source='status.status_name', read_only=True)

    class Meta:
        model = SavingTransactions
        fields = [
            'id', 'transaction_code', 'saving_type_name',
            'transaction_type_name', 'amount', 'status_name', 'transaction_date',
        ]


class WithdrawalSerializer(serializers.ModelSerializer):
    saving_type_name = serializers.CharField(source='saving_type.name', read_only=True)
    status_name = serializers.CharField(source='status.status_name', read_only=True)
    status_code = serializers.CharField(source='status.status_code', read_only=True)

    class Meta:
        model = Withdrawals
        fields = [
            'id', 'saving_type_name', 'amount', 'status_name',
            'status_code', 'notes', 'request_date', 'approved_date', 'paid_date',
            'reject_reason', 'proof_file_path',
        ]


class WithdrawalCreateSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=15, decimal_places=2)
    notes = serializers.CharField(required=False, allow_blank=True)

    def validate_amount(self, value):
        if value < 50000:
            raise serializers.ValidationError('Minimum withdrawal is Rp 50.000')
        return value


class VoluntarySavingsRequestCreateSerializer(serializers.Serializer):
    requested_amount = serializers.DecimalField(max_digits=15, decimal_places=2)

    def validate_requested_amount(self, value):
        if value < 0:
            raise serializers.ValidationError('Amount cannot be negative')
        return value


class MemberSavingObligationsSerializer(serializers.ModelSerializer):
    saving_type_name = serializers.CharField(source='saving_type.name', read_only=True)
    is_mandatory = serializers.BooleanField(source='saving_type.is_mandatory', read_only=True)

    class Meta:
        model = MemberSavingObligations
        fields = ['id', 'saving_type_name', 'is_mandatory', 'monthly_amount', 'effective_from', 'effective_until']


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notifications
        fields = ['id', 'title', 'message', 'notification_type', 'reference_id', 'is_read', 'created_at']


# ── ADMIN ────────────────────────────────────────────────────────

class AdminSavingsTransactionSerializer(serializers.ModelSerializer):
    member_name = serializers.CharField(source='member.full_name', read_only=True)
    member_nik = serializers.CharField(source='member.nik_employee', read_only=True)
    department_name = serializers.SerializerMethodField()
    saving_type_name = serializers.CharField(source='saving_type.name', read_only=True)
    transaction_type_name = serializers.CharField(source='transaction_type.name', read_only=True)
    payment_method_name = serializers.SerializerMethodField()
    status_name = serializers.CharField(source='status.status_name', read_only=True)
    status_code = serializers.CharField(source='status.status_code', read_only=True)

    class Meta:
        model = SavingTransactions
        fields = [
            'id', 'transaction_code', 'member_name', 'member_nik', 'department_name',
            'saving_type_name', 'transaction_type_name', 'payment_method_name',
            'amount', 'status_name', 'status_code', 'transaction_date',
        ]

    def get_department_name(self, obj):
        # Lookup via context cache to avoid N+1 queries
        dept_map = self.context.get('dept_map', {})
        return dept_map.get(obj.member_id, '-')

    def get_payment_method_name(self, obj):
        return obj.payment_method.name if obj.payment_method_id else None


class AdminWithdrawalSerializer(serializers.ModelSerializer):
    member_name = serializers.CharField(source='member.full_name', read_only=True)
    member_nik = serializers.CharField(source='member.nik_employee', read_only=True)
    saving_type_name = serializers.CharField(source='saving_type.name', read_only=True)
    status_name = serializers.CharField(source='status.status_name', read_only=True)
    status_code = serializers.CharField(source='status.status_code', read_only=True)
    payment_method_name = serializers.SerializerMethodField()

    class Meta:
        model = Withdrawals
        fields = [
            'id', 'member_name', 'member_nik', 'saving_type_name',
            'amount', 'status_name', 'status_code', 'notes',
            'payment_method_name', 'request_date', 'approved_date',
            'paid_date', 'reject_reason',
        ]

    def get_payment_method_name(self, obj):
        return obj.payment_method.name if obj.payment_method_id else None


class VoluntarySavingsRequestAdminSerializer(serializers.ModelSerializer):
    member_name = serializers.CharField(source='member.full_name', read_only=True)
    member_nik = serializers.CharField(source='member.nik_employee', read_only=True)

    class Meta:
        model = VoluntarySavingsRequests
        fields = [
            'id', 'member_name', 'member_nik',
            'current_amount', 'requested_amount',
            'status', 'status_id', 'reject_reason', 'processed_date', 'created_at',
        ]


class GenerateBillsSerializer(serializers.Serializer):
    month = serializers.IntegerField(min_value=1, max_value=12)
    year = serializers.IntegerField(min_value=2000, max_value=2100)
    include_mandatory = serializers.BooleanField(default=True)
    include_voluntary = serializers.BooleanField(default=True)
    member_ids = serializers.ListField(
        child=serializers.IntegerField(), required=False, allow_empty=True
    )


# ── Payroll Deduction Summary ─────────────────────────────────────────────────

class MonthlySavingBillSerializer(serializers.ModelSerializer):
    saving_type_name = serializers.CharField(source='saving_type.name', read_only=True)
    status_name = serializers.CharField(source='status.status_name', read_only=True)

    class Meta:
        model = MonthlySavingBills
        fields = [
            'id', 'saving_type_name', 'bill_period_start', 'bill_period_end',
            'amount_due', 'amount_paid', 'status_name', 'due_date', 'paid_at',
        ]


class PayrollPeriodSerializer(serializers.Serializer):
    month = serializers.IntegerField(min_value=1, max_value=12)
    year  = serializers.IntegerField(min_value=2000, max_value=2100)


class PayrollSummaryRowSerializer(serializers.Serializer):
    member_id         = serializers.IntegerField()
    full_name         = serializers.CharField()
    nik_employee      = serializers.CharField(allow_null=True)
    department_name   = serializers.CharField()
    principal_amount  = serializers.IntegerField()
    mandatory_amount  = serializers.IntegerField()
    voluntary_amount  = serializers.IntegerField()
    rounding_amount   = serializers.IntegerField()
    total_amount      = serializers.IntegerField()
    status            = serializers.CharField()


class PayrollSummaryCardSerializer(serializers.Serializer):
    total_members           = serializers.IntegerField()
    total_payroll_amount    = serializers.IntegerField()
    confirmed_count         = serializers.IntegerField()
    verification_percentage = serializers.IntegerField()
    cycle_status            = serializers.CharField()
