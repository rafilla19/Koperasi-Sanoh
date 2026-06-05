# shu/serializers.py
from rest_framework import serializers
from api.models import IncomeExpenseCategories, IncomeExpenses, MemberBankAccounts
from .models import MasterConfiguration, ShuPeriods, ShuMemberDistributions, ShuResults, ShuMemberBases


# ── MASTER CONFIGURATION ─────────────────────────────────────────

class MasterConfigurationSerializer(serializers.ModelSerializer):
    class Meta:
        model = MasterConfiguration
        fields = ['id', 'component_name', 'percentage', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


# ── SHARED ────────────────────────────────────────────────────────

class ShuPeriodsSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShuPeriods
        fields = [
            'id', 'year', 'total_profit',
            'total_savings_weight', 'total_transaction_weight',
            'member_services_weight', 'reserve_fund_weight',
            'social_fund_weight', 'education_fund_weight', 'management_weight',
            'status', 'notes', 'created_at', 'updated_at',
        ]


# ── MEMBER ────────────────────────────────────────────────────────

class MemberShuDistributionSerializer(serializers.ModelSerializer):
    year = serializers.IntegerField(source='period.period_year', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = ShuMemberDistributions
        fields = [
            'id', 'year', 'total_savings', 'total_transactions',
            'savings_share', 'transaction_share', 'total_shu',
            'status', 'status_display', 'paid_at',
        ]


# ── ADMIN ─────────────────────────────────────────────────────────

class ShuPeriodCreateSerializer(serializers.Serializer):
    year = serializers.IntegerField(min_value=2000, max_value=2100)
    total_profit = serializers.DecimalField(max_digits=20, decimal_places=2)
    total_savings_weight = serializers.DecimalField(max_digits=5, decimal_places=2, default=40)
    total_transaction_weight = serializers.DecimalField(max_digits=5, decimal_places=2, default=40)
    member_services_weight = serializers.DecimalField(max_digits=5, decimal_places=2, default=20)
    reserve_fund_weight = serializers.DecimalField(max_digits=5, decimal_places=2, default=25)
    social_fund_weight = serializers.DecimalField(max_digits=5, decimal_places=2, default=5)
    education_fund_weight = serializers.DecimalField(max_digits=5, decimal_places=2, default=5)
    management_weight = serializers.DecimalField(max_digits=5, decimal_places=2, default=5)
    notes = serializers.CharField(required=False, allow_blank=True)

    def validate_total_profit(self, value):
        if value <= 0:
            raise serializers.ValidationError('Total profit harus lebih dari 0')
        return value


class AdminShuDistributionSerializer(serializers.ModelSerializer):
    member_name = serializers.CharField(source='member.full_name', read_only=True)
    member_nik = serializers.CharField(source='member.nik_employee', read_only=True)
    year = serializers.IntegerField(source='period.period_year', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = ShuMemberDistributions
        fields = [
            'id', 'year', 'member_name', 'member_nik',
            'total_savings', 'total_transactions',
            'savings_share', 'transaction_share', 'total_shu',
            'status', 'status_display', 'paid_at', 'notes',
        ]


class ShuDistributionUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=['approved', 'paid', 'cancelled'])
    notes = serializers.CharField(required=False, allow_blank=True)


class AdminAnnualJasaModalSerializer(serializers.ModelSerializer):
    member_name = serializers.CharField(source='member.full_name', read_only=True)
    member_nik = serializers.CharField(source='member.nik_employee', read_only=True)
    year = serializers.IntegerField(source='period.period_year', read_only=True)
    status_id = serializers.IntegerField(source='status.id', read_only=True)
    status_display = serializers.SerializerMethodField()
    bank_info = serializers.SerializerMethodField()

    class Meta:
        model = ShuMemberDistributions
        fields = [
            'id', 'year', 'member_name', 'member_nik',
            'total_savings', 'total_shu',
            'status_id', 'status_display', 'paid_at', 'notes',
            'transfer_proof', 'transfer_proof_url', 'transfer_proof_name',
            'bank_info',
        ]

    def get_status_display(self, obj):
        from .models import STATUS_PAID_ID
        return 'PAID' if obj.status_id == STATUS_PAID_ID else 'PENDING'

    def get_bank_info(self, obj):
        bank_map = self.context.get('bank_map', {})
        account = bank_map.get(obj.member_id)
        if account:
            return {
                'bank_name': account.bank.bank_name,
                'account_number': account.account_number,
                'account_holder_name': account.account_holder_name,
            }
        return None


# ── OUTCOME TRANSACTION (income_expenses table) ───────────────────

class IncomeExpenseCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = IncomeExpenseCategories
        fields = ['id', 'category_name', 'type']


class IncomeExpenseOutcomeSerializer(serializers.ModelSerializer):
    transaction_date = serializers.DateField()
    category_name = serializers.CharField(source='category.category_name', read_only=True)
    type = serializers.CharField(source='category.type', read_only=True)

    class Meta:
        model = IncomeExpenses
        fields = [
            'id', 'transaction_date', 'category', 'category_name',
            'type', 'invoice_number', 'supplier_customer',
            'quantity', 'amount',
        ]


class IncomeExpenseOutcomeCreateSerializer(serializers.ModelSerializer):
    transaction_date = serializers.DateField()

    class Meta:
        model = IncomeExpenses
        fields = [
            'transaction_date', 'category',
            'invoice_number', 'supplier_customer', 'quantity', 'amount',
        ]


# ── SHU RESULTS ───────────────────────────────────────────────────

class ShuResultsSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShuResults
        fields = [
            'id', 'period_year', 'period_month',
            'total_revenue', 'total_expense', 'net_profit',
            'distributed_status', 'created_at', 'updated_at',
        ]


class ShuMemberBasesSerializer(serializers.ModelSerializer):
    member_id = serializers.IntegerField(source='member.id', read_only=True)
    shu_result_id = serializers.IntegerField(source='shu_result.id', read_only=True)

    class Meta:
        model = ShuMemberBases
        fields = [
            'id', 'shu_result_id', 'member_id', 'total_saving_amount', 'shu_jasa_modal',
            'created_at', 'updated_at', 'deleted_at',
        ]
