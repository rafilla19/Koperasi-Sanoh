import numpy as np

TRAINING_DATA_QUERY = """
SELECT
    dm.member_id,
    dm.total_shu,
    dm.total_savings,
    dm.simp_wajib,
    dm.simp_sukarela,
    sr.period_year,
    sr.period_month,
    sr.net_profit,
    sr.total_revenue,
    sr.total_expense
FROM shu_member_distributions_monthly dm
JOIN shu_results sr ON dm.period_id = sr.id
WHERE sr.deleted_at IS NULL
  AND sr.period_month BETWEEN 1 AND 12
  AND dm.total_shu IS NOT NULL
  AND sr.net_profit > 0
ORDER BY sr.period_year, sr.period_month, dm.member_id
"""

AGGREGATE_QUERY = """
SELECT
    period_year,
    period_month,
    total_revenue,
    total_expense,
    net_profit
FROM shu_results
WHERE deleted_at IS NULL
  AND period_month BETWEEN 1 AND 12
  AND net_profit > 0
ORDER BY period_year, period_month
"""

FEATURE_NAMES = [
    'month',
    'month_sin',
    'month_cos',
    'year_ordinal',
    'total_savings',
    'simp_wajib',
    'simp_sukarela',
]

MODEL_CONFIG = {
    'model_prefix': 'shu_admin_xgb',
    'forecast_months': 6,
    'min_training_samples': 30,
}


def encode_month(month):
    return {
        'month_sin': np.sin(2 * np.pi * month / 12),
        'month_cos': np.cos(2 * np.pi * month / 12),
    }
