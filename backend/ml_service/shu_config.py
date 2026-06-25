TRAINING_DATA_QUERY = """
SELECT
    dm.id                          AS distribution_id,
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
ORDER BY dm.member_id, sr.period_year, sr.period_month
"""

FEATURE_NAMES = [
    'month_ordinal',
    'total_savings',
    'net_profit',
]

MODEL_CONFIG = {
    'model_prefix': 'shu_model',
    'forecast_months': 6,
    'min_training_samples': 20,
}
