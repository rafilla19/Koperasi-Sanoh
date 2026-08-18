from rest_framework import serializers
from .models import LoanApplication, LoanType, Loan, LoanInstallment, LoanFundingSetting

class LoanTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = LoanType
        fields = ('id', 'name')

class LoanFundingSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = LoanFundingSetting
        fields = ('id', 'description', 'monthly_limit', 'daily_limit', 'is_active', 'created_at', 'updated_at')
        read_only_fields = ('is_active', 'created_at', 'updated_at')

class LoanApplicationSerializer(serializers.ModelSerializer):
    class Meta:
        model = LoanApplication
        fields = ('id', 'amount_requested', 'duration_months', 'loan_type', 'purpose','member','salary_statement_file', 'status', 'admin', 'reject_reason') 
        read_only_fields = [
            'id',
            'status'
        ]

class LoanSerializer(serializers.ModelSerializer):
    class Meta:
        model = Loan
        fields = ('id', 'member_id', 'status', 'remaining_balance', 'due_date')

class LoanInstallmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = LoanInstallment
        fields = ('id', 'loan', 'due_date', 'status', 'amount_total')