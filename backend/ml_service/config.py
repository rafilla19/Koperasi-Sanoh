"""
Configuration untuk ML Service - Database Queries dan Model Settings
"""
import os
from django.conf import settings

# Path untuk menyimpan model
MODEL_DIR = os.path.join(settings.BASE_DIR, 'ml_service', 'models')
MODEL_PATH = os.path.join(MODEL_DIR, 'loan_model_combined.pkl')
MODEL_INFO_PATH = os.path.join(MODEL_DIR, 'model_metadata.json')

# Database Query untuk Training Data - REALISTIC BEHAVIORAL MODELING
# Fixes: No status ID hardcoding, uses transaction history for savings, captures saving discipline
TRAINING_DATA_QUERY = """
WITH loan_labels AS (
    -- TARGET LABEL
    -- 1 = GOOD LOAN
    -- 0 = RISKY LOAN
    SELECT
        l.id AS loan_id,
        CASE
            WHEN MAX(
                CASE
                    WHEN lp.payment_date IS NOT NULL THEN
                        GREATEST(
                            lp.payment_date::date - li.due_date,
                            0
                        )
                    ELSE
                        GREATEST(
                            CURRENT_DATE - li.due_date,
                            0
                        )
                END
            ) > 30
            THEN 0
            ELSE 1
        END AS is_successful
    FROM loans l
    JOIN loan_installments li
        ON l.id = li.loan_id
    LEFT JOIN loan_payments lp
        ON li.id = lp.installment_id
    GROUP BY l.id
),
saving_transactions_summary AS (
    SELECT
        member_id,
        COUNT(*) AS total_saving_transactions,
        COALESCE(
            SUM(amount),
            0
        ) AS total_savings_amount
    FROM saving_transactions
    GROUP BY member_id
),
saving_bills_summary AS (
    SELECT
        member_id,
        COUNT(*) AS total_saving_bills,
        COUNT(
            CASE
                WHEN paid_at IS NOT NULL THEN 1
            END
        ) AS paid_saving_bills
    FROM monthly_saving_bills
    GROUP BY member_id
)
SELECT
    -- IDENTIFIER (JANGAN DIPAKAI SEBAGAI FEATURE MODEL)
    l.id AS loan_id,
    m.id AS member_id,

    -- AGE
    EXTRACT(
        YEAR FROM AGE(CURRENT_DATE, m.date_of_birth)
    ) AS age,

    -- MEMBER TENURE
    (
        EXTRACT(YEAR FROM AGE(l.created_at, m.join_date)) * 12
        +
        EXTRACT(MONTH FROM AGE(l.created_at, m.join_date))
    ) AS member_tenure_months,

    -- EMPLOYMENT STATUS
    m.employee_status_id,

    -- LOAN FEATURES
    la.amount_requested,
    la.duration_months,
    l.principal_amount,
    l.interest_amount,

    -- MONTHLY INSTALLMENT ESTIMATION
    ROUND(
        l.total_amount / NULLIF(la.duration_months, 0),
        2
    ) AS monthly_installment_estimation,

    -- TOTAL SAVINGS
    sts.total_savings_amount,

    -- SAVINGS VS LOAN RATIO
    LEAST(
        ROUND(
            sts.total_savings_amount /
            NULLIF(la.amount_requested, 0),
            2
        ),
        10
    ) AS savings_loan_ratio,

    -- SAVING DISCIPLINE
    ROUND(
        sbs.paid_saving_bills::numeric /
        NULLIF(sbs.total_saving_bills, 0),
        2
    ) AS saving_payment_ratio,

    -- TARGET
    ll.is_successful
FROM loans l
JOIN loan_applications la
    ON l.application_id = la.id
JOIN members m
    ON l.member_id = m.id
LEFT JOIN saving_transactions_summary sts
    ON m.id = sts.member_id
LEFT JOIN saving_bills_summary sbs
    ON m.id = sbs.member_id
LEFT JOIN loan_labels ll
    ON l.id = ll.loan_id
WHERE ll.is_successful IS NOT NULL
ORDER BY l.created_at DESC
"""

# Query untuk Prediksi Real-time (member tertentu) - MIRRORING TRAINING LOGIC
PREDICTION_QUERY = """
WITH saving_transactions_summary AS (
    SELECT
        member_id,
        COUNT(*) AS total_saving_transactions,
        COALESCE(SUM(amount), 0) AS total_savings_amount
    FROM saving_transactions
    WHERE member_id = %s
    GROUP BY member_id
),
saving_bills_summary AS (
    SELECT
        member_id,
        COUNT(*) AS total_saving_bills,
        COUNT(CASE WHEN paid_at IS NOT NULL THEN 1 END) AS paid_saving_bills
    FROM monthly_saving_bills
    WHERE member_id = %s
    GROUP BY member_id
)
SELECT
    m.id AS member_id,
    EXTRACT(YEAR FROM AGE(CURRENT_DATE, m.date_of_birth)) AS age,
    (EXTRACT(YEAR FROM AGE(CURRENT_DATE, m.join_date)) * 12 + EXTRACT(MONTH FROM AGE(CURRENT_DATE, m.join_date))) AS member_tenure_months,
    m.employee_status_id,
    COALESCE(sts.total_savings_amount, 0) AS total_savings_amount,
    COALESCE(ROUND(sbs.paid_saving_bills::numeric / NULLIF(sbs.total_saving_bills, 0), 2), 1.0) AS saving_payment_ratio
FROM members m
LEFT JOIN saving_transactions_summary sts ON m.id = sts.member_id
LEFT JOIN saving_bills_summary sbs ON m.id = sbs.member_id
WHERE m.id = %s
"""

# Model Hyperparameters - Optimized dengan Class Weight untuk Imbalance
MODEL_CONFIG = {
    'classifier': {
        'n_estimators': 150, #pohon keputusan
        'max_depth': 12, #kedalaman pohon keputusan
        'min_samples_split': 8, #jumlah sampel minimum untuk membagi node
        'min_samples_leaf': 4, #jumlah sampel minimum di daun
        'class_weight': 'balanced',  # IMPORTANT: Handle imbalanced data
        'random_state': 42,
        'n_jobs': -1
    },
    'regressor': {
        'n_estimators': 150,
        'max_depth': 12,
        'min_samples_split': 8,
        'min_samples_leaf': 4,
        'random_state': 42,
        'n_jobs': -1
    }
}

# Enhanced Feature Names
FEATURE_NAMES = [
    'age',
    'member_tenure_months',
    'employee_status_id',
    'amount_requested',
    'duration_months',
    'monthly_installment_estimation',
    'total_savings_amount',
    'savings_loan_ratio',
    'saving_payment_ratio',
    'overall_risk_score'
]

# Data Quality & Validation Config
DATA_QUALITY_CONFIG = {
    'min_training_samples': 10,        # Relaxed untuk development (asalnya 30)
    'max_missing_ratio': 0.95,         # Relaxed untuk development (asalnya 0.3)
    'imbalance_ratio_threshold': 0.15, 
    'outlier_iqr_multiplier': 1.5,     
    'min_feature_variance': 0.01,      
}

# Class Imbalance Handling
IMBALANCE_CONFIG = {
    'strategy': 'balanced',  # 'balanced' atau 'smote'
    'sampling_ratio': 0.5,   # Untuk undersampling majority class
    'random_state': 42
}

# Interest Rate Ranges berdasarkan Risk Level (ML-Driven)
INTEREST_RATE_RANGES = {
    'High': {'min': 0.50, 'max': 0.85},     # Very low risk - very competitive
    'Medium': {'min': 0.85, 'max': 1.25},   # Moderate risk - normal rate
    'Low': {'min': 1.25, 'max': 2.00}       # High risk - premium rate
}

# Interest Rate Calculation Method
INTEREST_RATE_METHOD = 'ml_regressor'  # 'ml_regressor', 'historical_avg', atau 'hybrid'

# Training Trigger Events & Monitoring
AUTO_RETRAIN_CONFIG = {
    'min_new_records': 15,              # Trigger jika ada 15+ record baru
    'retrain_interval_days': 7,         # Minimum interval antar training
    'max_training_time_minutes': 20,
    'data_drift_threshold': 0.10,       # Alert jika feature distribution drift > 10%
    'model_performance_threshold': 0.80, # Alert jika ROC-AUC < 0.80
}

# Feature Scaling & Preprocessing
PREPROCESSING_CONFIG = {
    'scaler_type': 'standard',  # 'standard' atau 'minmax'
    'outlier_method': 'iqr',    # 'iqr' atau 'zscore'
    'handle_missing': 'median',  # 'mean', 'median', atau 'forward_fill'
    'normalize_categorical': True,
}

# Train-Test Split Configuration (Prevent Data Leakage)
TRAIN_TEST_CONFIG = {
    'test_size': 0.2,
    'random_state': 42,
    'stratify': True,  # Preserve class distribution
    'time_based': False,  # Set True jika ingin temporal split
}

# Logging & Monitoring
LOGGING_CONFIG = {
    'log_file': 'ml_service_training.log',
    'log_level': 'INFO',
    'save_model_metrics': True,
    'save_feature_importance': True,
    'save_confusion_matrix': True,
}
