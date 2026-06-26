import os
import json
import logging
import joblib
import numpy as np
import pandas as pd
from datetime import datetime
from django.conf import settings
from django.db import connection
from xgboost import XGBRegressor
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

from .shu_admin_config import (
    TRAINING_DATA_QUERY, AGGREGATE_QUERY,
    FEATURE_NAMES, MODEL_CONFIG, encode_month,
)

logger = logging.getLogger(__name__)

MODEL_DIR = os.path.join(settings.BASE_DIR, 'ml_service', 'models')
PREFIX = MODEL_CONFIG['model_prefix']
FORECAST_MONTHS = MODEL_CONFIG['forecast_months']


def _month_to_ordinal(year, month):
    return year * 12 + month


def _next_months(last_year, last_month, count):
    result = []
    y, m = last_year, last_month
    for _ in range(count):
        m += 1
        if m > 12:
            m = 1
            y += 1
        result.append((y, m))
    return result


# ── DATA ───────────────────────────────────────────────────────

def fetch_training_data():
    with connection.cursor() as cursor:
        cursor.execute(TRAINING_DATA_QUERY)
        columns = [col[0] for col in cursor.description]
        rows = cursor.fetchall()
    return pd.DataFrame(rows, columns=columns)


def fetch_aggregate_data():
    with connection.cursor() as cursor:
        cursor.execute(AGGREGATE_QUERY)
        columns = [col[0] for col in cursor.description]
        rows = cursor.fetchall()
    return pd.DataFrame(rows, columns=columns)


def prepare_features(df):
    df = df.copy()
    df['month'] = df['period_month'].astype(int)
    df['year_ordinal'] = df.apply(
        lambda r: _month_to_ordinal(int(r['period_year']), int(r['period_month'])), axis=1
    )
    encoded = df['month'].apply(lambda m: pd.Series(encode_month(m)))
    df['month_sin'] = encoded['month_sin']
    df['month_cos'] = encoded['month_cos']

    for col in ['total_savings', 'simp_wajib', 'simp_sukarela']:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)

    return df


# ── TRAINING ───────────────────────────────────────────────────

def train_model(dry_run=False):
    df = fetch_training_data()
    if len(df) < MODEL_CONFIG['min_training_samples']:
        raise ValueError(
            f"Data terlalu sedikit: {len(df)} rows "
            f"(min {MODEL_CONFIG['min_training_samples']})"
        )

    df = prepare_features(df)
    X = df[FEATURE_NAMES].copy()
    y = df['total_shu'].astype(float).values

    X = X.fillna(X.median())
    y = np.nan_to_num(y, nan=0.0)

    model = XGBRegressor(
        n_estimators=150,
        max_depth=4,
        learning_rate=0.1,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_weight=3,
        reg_alpha=0.1,
        reg_lambda=1.0,
        random_state=42,
    )

    tscv = TimeSeriesSplit(n_splits=min(4, max(2, len(df) // 50)))
    cv_scores = []
    for train_idx, val_idx in tscv.split(X):
        X_tr, X_val = X.iloc[train_idx], X.iloc[val_idx]
        y_tr, y_val = y[train_idx], y[val_idx]
        model.fit(X_tr, y_tr)
        cv_scores.append(model.score(X_val, y_val))

    model.fit(X, y)

    y_pred = model.predict(X)
    r_squared = r2_score(y, y_pred)
    mae = mean_absolute_error(y, y_pred)
    rmse = float(np.sqrt(mean_squared_error(y, y_pred)))

    importances = model.feature_importances_
    feature_importance = {
        name: round(float(imp), 4)
        for name, imp in sorted(
            zip(FEATURE_NAMES, importances), key=lambda x: -x[1]
        )
    }

    agg_df = fetch_aggregate_data()
    agg_df = prepare_features(agg_df)
    rev_expense_ratios = None
    if len(agg_df) >= 3:
        recent = agg_df.tail(6)
        avg_revenue = float(recent['total_revenue'].astype(float).mean())
        avg_expense = float(recent['total_expense'].astype(float).mean())
        avg_profit = float(recent['net_profit'].astype(float).mean())
        if avg_profit > 0:
            rev_expense_ratios = {
                'revenue_to_profit': round(avg_revenue / avg_profit, 4),
                'expense_to_profit': round(avg_expense / avg_profit, 4),
                'avg_revenue': round(avg_revenue, 2),
                'avg_expense': round(avg_expense, 2),
                'avg_profit': round(avg_profit, 2),
            }

    model_data = {
        'model': model,
        'feature_names': FEATURE_NAMES,
        'training_date': datetime.now().isoformat(),
        'rev_expense_ratios': rev_expense_ratios,
        'model_info': {
            'algorithm': 'XGBRegressor',
            'r_squared': round(r_squared, 4),
            'mae': round(mae, 2),
            'rmse': round(rmse, 2),
            'training_samples': len(X),
            'cv_scores': [round(s, 4) for s in cv_scores],
            'cv_mean': round(float(np.mean(cv_scores)), 4) if cv_scores else None,
            'feature_importance': feature_importance,
        },
    }

    if dry_run:
        return model_data

    os.makedirs(MODEL_DIR, exist_ok=True)
    version = datetime.now().strftime("%Y%m%d_%H%M%S")
    pkl_name = f"{PREFIX}_{version}.pkl"
    pkl_path = os.path.join(MODEL_DIR, pkl_name)

    joblib.dump(model_data, pkl_path)
    logger.info(f"SHU admin model saved to {pkl_path}")

    latest_path = os.path.join(MODEL_DIR, f"{PREFIX}_latest.pkl")
    if os.path.exists(latest_path):
        os.remove(latest_path)
    import shutil
    shutil.copy(pkl_path, latest_path)

    meta = {
        'version': version,
        'model_file': pkl_name,
        'saved_at': datetime.now().isoformat(),
        'feature_names': FEATURE_NAMES,
        'model_info': model_data['model_info'],
        'rev_expense_ratios': rev_expense_ratios,
    }
    meta_path = os.path.join(MODEL_DIR, f"shu_admin_metadata_{version}.json")
    with open(meta_path, 'w') as f:
        json.dump(meta, f, indent=2)

    _cleanup_old(keep=5)
    return model_data


def _cleanup_old(keep=5):
    if not os.path.exists(MODEL_DIR):
        return
    files = sorted(
        [f for f in os.listdir(MODEL_DIR)
         if f.startswith(PREFIX) and f != f"{PREFIX}_latest.pkl"],
        key=lambda f: os.path.getmtime(os.path.join(MODEL_DIR, f)),
        reverse=True,
    )
    for f in files[keep:]:
        os.remove(os.path.join(MODEL_DIR, f))


# ── LOADING ────────────────────────────────────────────────────

_cached_model = None
_cached_mtime = None


def load_model():
    global _cached_model, _cached_mtime
    latest_path = os.path.join(MODEL_DIR, f"{PREFIX}_latest.pkl")
    if not os.path.exists(latest_path):
        return None

    mtime = os.path.getmtime(latest_path)
    if _cached_model is not None and _cached_mtime == mtime:
        return _cached_model

    _cached_model = joblib.load(latest_path)
    _cached_mtime = mtime
    logger.info("SHU admin XGBoost model loaded (cached)")
    return _cached_model


# ── PREDICTION ─────────────────────────────────────────────────

def _filter_complete_months(agg_df):
    df = agg_df.copy()
    df['net_profit_f'] = df['net_profit'].astype(float)
    valid = df[df['net_profit_f'] > 0]
    if len(valid) < 3:
        return valid
    median_profit = valid['net_profit_f'].median()
    threshold = median_profit * 0.05
    return valid[valid['net_profit_f'] >= threshold]


def _forecast_aggregate_trend(agg_df, future_months):
    from sklearn.linear_model import LinearRegression

    valid = _filter_complete_months(agg_df)
    if len(valid) < 3:
        return None

    X = valid['year_ordinal'].values.reshape(-1, 1)
    future_X = np.array([
        _month_to_ordinal(y, m) for y, m in future_months
    ]).reshape(-1, 1)

    results = {}
    for target in ['total_revenue', 'total_expense', 'net_profit']:
        y_vals = valid[target].astype(float).values
        reg = LinearRegression().fit(X, y_vals)
        preds = np.maximum(reg.predict(future_X), 0.0)
        results[target] = preds

    return results


def predict_admin_shu(months=6):
    from api.shu.models import ShuMemberDistributionsMonthly

    model_data = load_model()
    if model_data is None:
        return None

    model = model_data['model']

    agg_df = fetch_aggregate_data()
    if len(agg_df) < 2:
        return None

    agg_df = prepare_features(agg_df)

    valid_agg = agg_df[agg_df['net_profit'].astype(float) > 0]
    if len(valid_agg) < 2:
        return None

    last_row = valid_agg.iloc[-1]
    last_year = int(last_row['period_year'])
    last_month = int(last_row['period_month'])
    future_months = _next_months(last_year, last_month, months)

    latest_periods = valid_agg.tail(3)
    latest_period_keys = set()
    for _, r in latest_periods.iterrows():
        latest_period_keys.add((int(r['period_year']), int(r['period_month'])))

    member_data = ShuMemberDistributionsMonthly.objects.filter(
        period__deleted_at__isnull=True,
        period__period_month__gte=1,
        period__period_month__lte=12,
    ).select_related('period')

    member_recent = {}
    for md in member_data:
        key = (md.period.period_year, md.period.period_month)
        if key in latest_period_keys:
            mid = md.member_id
            if mid not in member_recent:
                member_recent[mid] = []
            member_recent[mid].append({
                'total_savings': float(md.total_savings or 0),
                'simp_wajib': float(md.simp_wajib or 0),
                'simp_sukarela': float(md.simp_sukarela or 0),
            })

    if not member_recent:
        return None

    member_averages = {}
    for mid, records in member_recent.items():
        member_averages[mid] = {
            'total_savings': np.mean([r['total_savings'] for r in records]),
            'simp_wajib': np.mean([r['simp_wajib'] for r in records]),
            'simp_sukarela': np.mean([r['simp_sukarela'] for r in records]),
        }

    member_shu_forecast = []
    for year, month in future_months:
        month_total_shu = 0.0
        enc = encode_month(month)

        for mid, avg in member_averages.items():
            features = pd.DataFrame([{
                'month': month,
                'month_sin': enc['month_sin'],
                'month_cos': enc['month_cos'],
                'year_ordinal': _month_to_ordinal(year, month),
                'total_savings': avg['total_savings'],
                'simp_wajib': avg['simp_wajib'],
                'simp_sukarela': avg['simp_sukarela'],
            }])
            pred = model.predict(features)[0]
            month_total_shu += max(0.0, float(pred))
        member_shu_forecast.append(month_total_shu)

    agg_trend = _forecast_aggregate_trend(agg_df, future_months)

    forecast_data = []
    for i, (year, month) in enumerate(future_months):
        if agg_trend is not None:
            pred_revenue = float(agg_trend['total_revenue'][i])
            pred_expense = float(agg_trend['total_expense'][i])
            pred_profit = float(agg_trend['net_profit'][i])
        else:
            recent = valid_agg.tail(3)
            pred_revenue = float(recent['total_revenue'].astype(float).mean())
            pred_expense = float(recent['total_expense'].astype(float).mean())
            pred_profit = float(recent['net_profit'].astype(float).mean())

        forecast_data.append({
            'month': f"{year}-{month:02d}",
            'predicted_shu_members': round(member_shu_forecast[i], 2),
            'predicted_revenue': round(pred_revenue, 2),
            'predicted_expense': round(pred_expense, 2),
            'predicted_profit': round(pred_profit, 2),
        })

    historical = []
    for _, row in agg_df.iterrows():
        historical.append({
            'month': f"{int(row['period_year'])}-{int(row['period_month']):02d}",
            'revenue': float(row['total_revenue']),
            'expense': float(row['total_expense']),
            'profit': float(row['net_profit']),
        })

    info = model_data.get('model_info', {})
    r_sq = info.get('r_squared', 0)
    if r_sq >= 0.7:
        confidence = 'high'
    elif r_sq >= 0.4:
        confidence = 'medium'
    else:
        confidence = 'low'

    all_profits = [h['profit'] for h in historical if h['profit'] > 0]
    median_p = float(np.median(all_profits)) if all_profits else 0
    threshold = median_p * 0.05
    recent_profits = [p for p in all_profits[-6:] if p >= threshold]
    forecast_profits = [f['predicted_profit'] for f in forecast_data]
    recent_avg = np.mean(recent_profits) if recent_profits else 0
    forecast_avg = np.mean(forecast_profits) if forecast_profits else 0
    growth_pct = round((forecast_avg - recent_avg) / recent_avg * 100, 1) if recent_avg > 0 else 0.0

    slope = 0.0
    if len(forecast_profits) >= 2:
        slope = (forecast_profits[-1] - forecast_profits[0]) / max(len(forecast_profits) - 1, 1)

    insights = []

    if growth_pct > 5:
        insights.append({
            'type': 'trend',
            'message': f'SHU diprediksi naik {growth_pct}% dalam {months} bulan ke depan',
            'sentiment': 'positive',
        })
    elif growth_pct < -5:
        insights.append({
            'type': 'trend',
            'message': f'SHU diprediksi turun {abs(growth_pct)}% dalam {months} bulan ke depan',
            'sentiment': 'negative',
        })
    else:
        insights.append({
            'type': 'trend',
            'message': f'SHU diprediksi stabil ({growth_pct:+.1f}%) dalam {months} bulan ke depan',
            'sentiment': 'neutral',
        })

    top_features = sorted(
        info.get('feature_importance', {}).items(), key=lambda x: -x[1]
    )[:3]
    feature_labels = {
        'total_savings': 'total simpanan',
        'simp_wajib': 'simpanan wajib',
        'simp_sukarela': 'simpanan sukarela',
        'month_sin': 'pola musiman',
        'month_cos': 'pola musiman',
        'month': 'bulan',
        'year_ordinal': 'tren waktu',
    }
    if top_features:
        top_name = feature_labels.get(top_features[0][0], top_features[0][0])
        insights.append({
            'type': 'driver',
            'message': f'Faktor utama yang mempengaruhi SHU: {top_name}',
            'sentiment': 'info',
        })

    return {
        'historical': historical,
        'forecast': forecast_data,
        'metrics': {
            'algorithm': 'XGBoost',
            'r_squared': r_sq,
            'mae': info.get('mae', 0),
            'rmse': info.get('rmse', 0),
            'confidence': confidence,
            'training_samples': info.get('training_samples', 0),
            'cv_mean': info.get('cv_mean'),
        },
        'feature_importance': info.get('feature_importance', {}),
        'insights': insights,
        'trend': {
            'direction': 'up' if slope > 0 else ('down' if slope < 0 else 'stable'),
            'growth_pct': growth_pct,
            'slope_per_month': round(slope, 2),
        },
    }
