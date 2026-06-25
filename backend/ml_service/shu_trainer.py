import os
import json
import logging
import joblib
import numpy as np
import pandas as pd
from datetime import datetime
from django.conf import settings
from django.db import connection
from sklearn.linear_model import LinearRegression

from .shu_config import TRAINING_DATA_QUERY, FEATURE_NAMES, MODEL_CONFIG

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


# ── TRAINING ────────────────────────────────────────────────────

def fetch_training_data():
    with connection.cursor() as cursor:
        cursor.execute(TRAINING_DATA_QUERY)
        columns = [col[0] for col in cursor.description]
        rows = cursor.fetchall()
    return pd.DataFrame(rows, columns=columns)


def train_model(dry_run=False):
    df = fetch_training_data()
    if len(df) < MODEL_CONFIG['min_training_samples']:
        raise ValueError(
            f"Data terlalu sedikit: {len(df)} rows "
            f"(min {MODEL_CONFIG['min_training_samples']})"
        )

    df['month_ordinal'] = df.apply(
        lambda r: _month_to_ordinal(r['period_year'], r['period_month']), axis=1
    )

    X = df[FEATURE_NAMES].copy()
    y = df['total_shu'].astype(float).values

    X = X.fillna(X.median())
    y = np.nan_to_num(y, 0.0)

    model = LinearRegression()
    model.fit(X, y)

    r_squared = model.score(X, y)
    y_pred = model.predict(X)
    mae = float(np.mean(np.abs(y - y_pred)))
    rmse = float(np.sqrt(np.mean((y - y_pred) ** 2)))

    model_data = {
        'model': model,
        'feature_names': FEATURE_NAMES,
        'training_date': datetime.now().isoformat(),
        'model_info': {
            'r_squared': round(r_squared, 4),
            'mae': round(mae, 2),
            'rmse': round(rmse, 2),
            'training_samples': len(X),
            'coef': {name: round(float(c), 4) for name, c in zip(FEATURE_NAMES, model.coef_)},
            'intercept': round(float(model.intercept_), 4),
        },
    }

    if dry_run:
        return model_data

    os.makedirs(MODEL_DIR, exist_ok=True)
    version = datetime.now().strftime("%Y%m%d_%H%M%S")
    pkl_name = f"{PREFIX}_{version}.pkl"
    pkl_path = os.path.join(MODEL_DIR, pkl_name)

    joblib.dump(model_data, pkl_path)
    logger.info(f"SHU model saved to {pkl_path}")

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
    }
    meta_path = os.path.join(MODEL_DIR, f"shu_metadata_{version}.json")
    with open(meta_path, 'w') as f:
        json.dump(meta, f, indent=2)

    _cleanup_old(keep=5)
    return model_data


def _cleanup_old(keep=5):
    files = sorted(
        [f for f in os.listdir(MODEL_DIR) if f.startswith(PREFIX) and f != f"{PREFIX}_latest.pkl"],
        key=lambda f: os.path.getmtime(os.path.join(MODEL_DIR, f)),
        reverse=True,
    )
    for f in files[keep:]:
        os.remove(os.path.join(MODEL_DIR, f))


# ── LOADING ─────────────────────────────────────────────────────

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
    logger.info("SHU model loaded (cached)")
    return _cached_model


# ── PREDICTION ──────────────────────────────────────────────────

def predict_member_shu(member_id):
    from api.shu.models import ShuMemberDistributionsMonthly, ShuResults
    from django.db.models import F, Sum

    monthly_data = (
        ShuMemberDistributionsMonthly.objects.filter(
            member_id=member_id,
            period__deleted_at__isnull=True,
            period__period_month__gte=1,
            period__period_month__lte=12,
        )
        .values(
            p_year=F('period__period_year'),
            p_month=F('period__period_month'),
        )
        .annotate(
            total_shu=Sum('total_shu'),
            total_savings=Sum('total_savings'),
        )
        .order_by('p_year', 'p_month')
    )

    if not monthly_data:
        return None

    profit_map = {}
    for r in ShuResults.objects.filter(
        period_month__gte=1, period_month__lte=12, deleted_at__isnull=True
    ):
        profit_map[_month_to_ordinal(r.period_year, r.period_month)] = float(r.net_profit)

    chart_data = []
    for row in monthly_data:
        ordinal = _month_to_ordinal(row['p_year'], row['p_month'])
        chart_data.append({
            'month': f"{row['p_year']}-{row['p_month']:02d}",
            'total_shu': float(row['total_shu'] or 0),
            'total_savings': float(row['total_savings'] or 0),
            'net_profit': profit_map.get(ordinal, 0.0),
            'month_ordinal': ordinal,
            'p_year': row['p_year'],
            'p_month': row['p_month'],
        })

    if len(chart_data) < 2:
        return None

    model_data = load_model()
    last = chart_data[-1]
    future_months = _next_months(last['p_year'], last['p_month'], FORECAST_MONTHS)

    if model_data is not None:
        model = model_data['model']
        recent_savings = np.mean([d['total_savings'] for d in chart_data[-3:]])
        recent_profit = np.mean([d['net_profit'] for d in chart_data[-3:]])

        X_future = pd.DataFrame([{
            'month_ordinal': _month_to_ordinal(y, m),
            'total_savings': recent_savings,
            'net_profit': recent_profit,
        } for y, m in future_months])

        predictions = model.predict(X_future)
        predictions = np.maximum(predictions, 0.0)

        X_hist = pd.DataFrame([{
            'month_ordinal': d['month_ordinal'],
            'total_savings': d['total_savings'],
            'net_profit': d['net_profit'],
        } for d in chart_data])
        r_squared = model.score(X_hist, [d['total_shu'] for d in chart_data])
        method = 'linear_regression_pkl'
    else:
        y_vals = np.array([d['total_shu'] for d in chart_data])
        if len(chart_data) >= 3:
            X_simple = np.array([d['month_ordinal'] for d in chart_data]).reshape(-1, 1)
            fallback = LinearRegression().fit(X_simple, y_vals)
            X_fut = np.array([_month_to_ordinal(y, m) for y, m in future_months]).reshape(-1, 1)
            predictions = np.maximum(fallback.predict(X_fut), 0.0)
            r_squared = fallback.score(X_simple, y_vals)
        else:
            avg = float(np.mean(y_vals))
            predictions = np.full(FORECAST_MONTHS, max(0.0, avg))
            r_squared = 0.0
        method = 'inline_fallback'

    forecast_data = [
        {'month': f"{y}-{m:02d}", 'total_shu': round(float(v), 2)}
        for (y, m), v in zip(future_months, predictions)
    ]

    y_hist = np.array([d['total_shu'] for d in chart_data])
    hist_sum = float(np.sum(y_hist[-6:])) if len(y_hist) >= 6 else float(np.mean(y_hist)) * 6
    estimated_annual = round(hist_sum + float(np.sum(predictions)), 2)

    if r_squared >= 0.7:
        confidence = 'high'
    elif r_squared >= 0.4:
        confidence = 'medium'
    else:
        confidence = 'low'

    recent_avg = float(np.mean(y_hist[-3:])) if len(y_hist) >= 3 else float(np.mean(y_hist))
    forecast_avg = float(np.mean(predictions))
    growth_6m_pct = round((forecast_avg - recent_avg) / recent_avg * 100, 1) if recent_avg > 0 else 0.0
    slope = (float(predictions[-1]) - float(predictions[0])) / max(FORECAST_MONTHS - 1, 1)

    return {
        'chart_data': [{'month': d['month'], 'total_shu': d['total_shu']} for d in chart_data],
        'forecast': {
            'forecast_data': forecast_data,
            'estimated_annual_return': estimated_annual,
            'confidence': confidence,
            'method': method,
            'data_points_used': len(chart_data),
            'trend': {
                'slope_per_month': round(slope, 2),
                'direction': 'up' if slope > 0 else ('down' if slope < 0 else 'stable'),
                'growth_6m_pct': growth_6m_pct,
            },
        },
    }
