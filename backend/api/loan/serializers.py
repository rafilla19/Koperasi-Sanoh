from rest_framework import serializers
from .models import LoanApplication, LoanType, Loan, LoanInstallment

class LoanTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = LoanType
        fields = ('id', 'name')

class LoanApplicationSerializer(serializers.ModelSerializer):
    class Meta:
        model = LoanApplication
        # exclude = ['created_at', 'updated_at', 'applied_at']
        fields = ('id', 'amount_requested', 'duration_months', 'loan_type', 'purpose','member','salary_statement_file', 'status') 
        read_only_fields = [
            'id',
            # 'created_at',
            # 'updated_at',
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