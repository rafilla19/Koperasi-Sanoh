"""
Configuration untuk ML Service - Database Queries dan Model Settings
XGBoost + SMOTE model with 16 behavioral features
"""
import os
from django.conf import settings

# Path untuk menyimpan model
MODEL_DIR = os.path.join(settings.BASE_DIR, 'ml_service', 'models')
MODEL_PATH = os.path.join(MODEL_DIR, 'loan_model_combined.pkl')
MODEL_INFO_PATH = os.path.join(MODEL_DIR, 'model_metadata.json')

# Database Query untuk Training Data
TRAINING_DATA_QUERY = """
WITH loan_labels AS (
    SELECT
        l.id AS loan_id,
        l.member_id,
        CASE
            WHEN MAX(
                CASE
                    WHEN lp.payment_date IS NOT NULL THEN
                        GREATEST(lp.payment_date::date - li.due_date, 0)
                    ELSE
                        GREATEST(CURRENT_DATE - li.due_date, 0)
                END
            ) > 30 THEN 0
            ELSE 1
        END AS is_successful,
        COUNT(CASE WHEN lp.payment_date::date > li.due_date THEN 1 END) AS late_payments_in_this_loan,
        MAX(CASE WHEN lp.payment_date::date > li.due_date THEN lp.payment_date::date - li.due_date ELSE 0 END) AS max_delay_days_in_this_loan
    FROM loans l
    JOIN loan_installments li ON l.id = li.loan_id
    LEFT JOIN loan_payments lp ON li.id = lp.installment_id
    GROUP BY l.id, l.member_id
),
historical_loan_metrics AS (
    SELECT
        l.member_id,
        COUNT(l.id) AS total_past_loans_count,
        SUM(ll.late_payments_in_this_loan) AS total_historical_late_installments,
        MAX(ll.max_delay_days_in_this_loan) AS absolute_max_delay_days
    FROM loans l
    JOIN loan_labels ll ON l.id = ll.loan_id
    WHERE l.status_id = 26
    GROUP BY l.member_id
),
saving_pivot AS (
    SELECT
        m.id AS member_id,
        COALESCE(SUM(CASE WHEN sw.saving_type_id = 1 THEN sw.balance END), 0) AS balance_mandatory,
        COALESCE(SUM(CASE WHEN sw.saving_type_id = 2 THEN sw.balance END), 0) AS balance_voluntary,
        COALESCE(SUM(CASE WHEN sw.saving_type_id = 3 THEN sw.balance END), 0) AS balance_principle,
        COALESCE(SUM(sw.balance), 0) AS total_saving_balance,
        COALESCE(MAX(CASE WHEN mso.saving_type_id = 1 THEN mso.monthly_amount END), 0) AS monthly_mandatory_obligation,
        COALESCE(MAX(CASE WHEN mso.saving_type_id = 2 THEN mso.monthly_amount END), 0) AS monthly_voluntary_obligation
    FROM members m
    LEFT JOIN saving_wallets sw ON m.id = sw.member_id
    LEFT JOIN member_saving_obligations mso ON m.id = mso.member_id AND mso.is_active = true
    GROUP BY m.id
),
withdrawal_summary AS (
    SELECT
        member_id,
        COUNT(id) AS total_withdrawal_count,
        COALESCE(SUM(amount), 0) AS total_withdrawal_amount
    FROM withdrawals
    WHERE status_id = 19
    GROUP BY member_id
),
raw_data AS (
    SELECT
        l.id AS loan_id,
        m.id AS member_id,
        EXTRACT(YEAR FROM AGE(CURRENT_DATE, m.date_of_birth)) AS age,
        (EXTRACT(YEAR FROM AGE(l.created_at, m.join_date)) * 12 + EXTRACT(MONTH FROM AGE(l.created_at, m.join_date))) AS member_tenure_months,
        m.employee_status_id,
        CASE WHEN m.gender = 'MALE' THEN 1 ELSE 0 END AS is_male,
        sp.balance_mandatory,
        sp.balance_voluntary,
        sp.balance_principle,
        sp.total_saving_balance,
        sp.monthly_mandatory_obligation,
        sp.monthly_voluntary_obligation,
        ROUND(sp.total_saving_balance / NULLIF(sp.monthly_mandatory_obligation + sp.monthly_voluntary_obligation, 0), 2) AS savings_to_total_obligation_ratio,
        COALESCE(w.total_withdrawal_count, 0) AS total_withdrawal_count,
        COALESCE(w.total_withdrawal_amount, 0) AS total_withdrawal_amount,
        COALESCE(hlm.total_past_loans_count, 0) AS total_past_loans_count,
        COALESCE(hlm.total_historical_late_installments, 0) AS total_historical_late_installments,
        COALESCE(hlm.absolute_max_delay_days, 0) AS absolute_max_delay_days,
        l.principal_amount AS requested_principal_amount,
        ROUND(l.total_amount / NULLIF(EXTRACT(MONTH FROM AGE(l.due_date, l.start_date)), 0), 2) AS monthly_installment_estimation,
        ROUND(sp.balance_voluntary / NULLIF(l.total_amount / NULLIF(EXTRACT(MONTH FROM AGE(l.due_date, l.start_date)), 0), 2), 2) AS voluntary_to_installment_ratio,
        ll.is_successful AS is_eligible
    FROM loans l
    JOIN members m ON l.member_id = m.id
    LEFT JOIN saving_pivot sp ON m.id = sp.member_id
    LEFT JOIN withdrawal_summary w ON m.id = w.member_id
    LEFT JOIN historical_loan_metrics hlm ON m.id = hlm.member_id
    LEFT JOIN loan_labels ll ON l.id = ll.loan_id
    WHERE m.member_status_id = 8 AND ll.is_successful IS NOT NULL
)
SELECT
    loan_id, member_id, age, member_tenure_months, employee_status_id, is_male,
    balance_mandatory, balance_voluntary, balance_principle, total_saving_balance,
    monthly_mandatory_obligation, monthly_voluntary_obligation, savings_to_total_obligation_ratio,
    total_withdrawal_count, total_withdrawal_amount,
    total_past_loans_count, total_historical_late_installments, absolute_max_delay_days,
    requested_principal_amount,
    COALESCE(monthly_installment_estimation, ROUND(AVG(monthly_installment_estimation) OVER(), 2)) AS monthly_installment_estimation,
    COALESCE(voluntary_to_installment_ratio, ROUND(AVG(voluntary_to_installment_ratio) OVER(), 2)) AS voluntary_to_installment_ratio,
    is_eligible
FROM raw_data;
"""

# Query untuk Prediksi Real-time (member tertentu)
PREDICTION_QUERY = """
WITH saving_pivot AS (
    SELECT
        m.id AS member_id,
        COALESCE(SUM(CASE WHEN sw.saving_type_id = 1 THEN sw.balance END), 0) AS balance_mandatory,
        COALESCE(SUM(CASE WHEN sw.saving_type_id = 2 THEN sw.balance END), 0) AS balance_voluntary,
        COALESCE(SUM(sw.balance), 0) AS total_saving_balance,
        COALESCE(MAX(CASE WHEN mso.saving_type_id = 2 THEN mso.monthly_amount END), 0) AS monthly_voluntary_obligation,
        COALESCE(
            ROUND(SUM(sw.balance) / NULLIF(
                COALESCE(MAX(CASE WHEN mso.saving_type_id = 1 THEN mso.monthly_amount END), 0) +
                COALESCE(MAX(CASE WHEN mso.saving_type_id = 2 THEN mso.monthly_amount END), 0)
            , 0), 2)
        , 0) AS savings_to_total_obligation_ratio
    FROM members m
    LEFT JOIN saving_wallets sw ON m.id = sw.member_id
    LEFT JOIN member_saving_obligations mso ON m.id = mso.member_id AND mso.is_active = true
    WHERE m.id = %s
    GROUP BY m.id
),
withdrawal_summary AS (
    SELECT
        member_id,
        COUNT(id) AS total_withdrawal_count,
        COALESCE(SUM(amount), 0) AS total_withdrawal_amount
    FROM withdrawals
    WHERE status_id = 19 AND member_id = %s
    GROUP BY member_id
),
historical_loan_metrics AS (
    SELECT
        l.member_id,
        COUNT(l.id) AS total_past_loans_count,
        COALESCE(SUM(
            (SELECT COUNT(*) FROM loan_installments li2
             LEFT JOIN loan_payments lp2 ON li2.id = lp2.installment_id
             WHERE li2.loan_id = l.id AND lp2.payment_date::date > li2.due_date)
        ), 0) AS total_historical_late_installments,
        COALESCE(MAX(
            (SELECT MAX(GREATEST(lp2.payment_date::date - li2.due_date, 0))
             FROM loan_installments li2
             LEFT JOIN loan_payments lp2 ON li2.id = lp2.installment_id
             WHERE li2.loan_id = l.id)
        ), 0) AS absolute_max_delay_days
    FROM loans l
    WHERE l.member_id = %s AND l.status_id = 26
    GROUP BY l.member_id
)
SELECT
    EXTRACT(YEAR FROM AGE(CURRENT_DATE, m.date_of_birth)) AS age,
    (EXTRACT(YEAR FROM AGE(CURRENT_DATE, m.join_date)) * 12 +
     EXTRACT(MONTH FROM AGE(CURRENT_DATE, m.join_date))) AS member_tenure_months,
    m.employee_status_id,
    CASE WHEN m.gender = 'MALE' THEN 1 ELSE 0 END AS is_male,
    sp.balance_mandatory,
    sp.balance_voluntary,
    sp.monthly_voluntary_obligation,
    sp.savings_to_total_obligation_ratio,
    COALESCE(w.total_withdrawal_count, 0) AS total_withdrawal_count,
    COALESCE(w.total_withdrawal_amount, 0) AS total_withdrawal_amount,
    COALESCE(hlm.total_past_loans_count, 0) AS total_past_loans_count,
    COALESCE(hlm.total_historical_late_installments, 0) AS total_historical_late_installments,
    COALESCE(hlm.absolute_max_delay_days, 0) AS absolute_max_delay_days,
    m.full_name
FROM members m
LEFT JOIN saving_pivot sp ON m.id = sp.member_id
LEFT JOIN withdrawal_summary w ON m.id = w.member_id
LEFT JOIN historical_loan_metrics hlm ON m.id = hlm.member_id
WHERE m.id = %s;
"""

# XGBoost Hyperparameters with SMOTE
MODEL_CONFIG = {
    'classifier': {
        'n_estimators': 50,
        'max_depth': 3,
        'learning_rate': 0.1,
        'reg_alpha': 1.0,
        'reg_lambda': 2.0,
        'min_child_weight': 3,
        'subsample': 0.8,
        'colsample_bytree': 0.8,
        'random_state': 42,
        'eval_metric': 'logloss',
    },
    'smote': {
        'random_state': 42,
        'k_neighbors': 3,
    }
}

# 16 Behavioral Features
FEATURE_NAMES = [
    'age',
    'member_tenure_months',
    'employee_status_id',
    'is_male',
    'balance_mandatory',
    'balance_voluntary',
    'monthly_voluntary_obligation',
    'savings_to_total_obligation_ratio',
    'total_withdrawal_count',
    'total_withdrawal_amount',
    'total_past_loans_count',
    'total_historical_late_installments',
    'absolute_max_delay_days',
    'requested_principal_amount',
    'monthly_installment_estimation',
    'voluntary_to_installment_ratio',
]

# Data Quality & Validation Config
DATA_QUALITY_CONFIG = {
    'min_training_samples': 10,
    'max_missing_ratio': 0.95,
    'imbalance_ratio_threshold': 0.15,
    'outlier_iqr_multiplier': 1.5,
    'min_feature_variance': 0.01,
}

# Class Imbalance Handling - now uses SMOTE
IMBALANCE_CONFIG = {
    'strategy': 'smote',
    'sampling_ratio': 0.5,
    'random_state': 42
}

# 5-Tier Interest Rate based on probability
INTEREST_RATE_TIERS = [
    {'min_prob': 0.85, 'risk_level': 'SANGAT RENDAH', 'interest_monthly': 0.8, 'status': 'LAYAK'},
    {'min_prob': 0.70, 'risk_level': 'RENDAH', 'interest_monthly': 1.0, 'status': 'LAYAK'},
    {'min_prob': 0.55, 'risk_level': 'SEDANG', 'interest_monthly': 1.5, 'status': 'LAYAK (DENGAN CATATAN)'},
    {'min_prob': 0.40, 'risk_level': 'TINGGI', 'interest_monthly': 2.0, 'status': 'PERLU REVIEW MANUAL'},
    {'min_prob': 0.00, 'risk_level': 'SANGAT TINGGI', 'interest_monthly': None, 'status': 'TIDAK LAYAK'},
]

# Training Trigger Events & Monitoring
AUTO_RETRAIN_CONFIG = {
    'min_new_records': 15,
    'retrain_interval_days': 7,
    'max_training_time_minutes': 20,
    'data_drift_threshold': 0.10,
    'model_performance_threshold': 0.80,
}

# Train-Test Split Configuration
TRAIN_TEST_CONFIG = {
    'test_size': 0.2,
    'random_state': 42,
    'stratify': True,
}

# Logging & Monitoring
LOGGING_CONFIG = {
    'log_file': 'ml_service_training.log',
    'log_level': 'INFO',
    'save_model_metrics': True,
    'save_feature_importance': True,
    'save_confusion_matrix': True,
}
