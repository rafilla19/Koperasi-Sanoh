import numpy as np
from sklearn.linear_model import LinearRegression
import logging

logger = logging.getLogger(__name__)

MIN_DATA_POINTS_FOR_REGRESSION = 3
FORECAST_MONTHS = 6


def _month_to_ordinal(month_str):
    year, month = map(int, month_str.split('-'))
    return year * 12 + month


def _next_months(last_month_str, count):
    year, month = map(int, last_month_str.split('-'))
    result = []
    for _ in range(count):
        month += 1
        if month > 12:
            month = 1
            year += 1
        result.append(f"{year}-{month:02d}")
    return result


def forecast_shu(chart_data, net_profit_series=None):
    if not chart_data or len(chart_data) < 2:
        return None

    n = len(chart_data)
    y = np.array([row['total_shu'] for row in chart_data], dtype=np.float64)
    last_month = chart_data[-1]['month']
    future_months = _next_months(last_month, FORECAST_MONTHS)
    avg_shu = float(np.mean(y))

    if n < MIN_DATA_POINTS_FOR_REGRESSION:
        avg = float(np.mean(y))
        forecast_values = [max(0.0, avg)] * FORECAST_MONTHS
        forecast_data = [
            {'month': m, 'total_shu': round(v, 2)}
            for m, v in zip(future_months, forecast_values)
        ]
        historical_sum = float(np.sum(y[-6:])) if n >= 6 else avg * 6
        estimated_annual = round(historical_sum + sum(forecast_values), 2)
        return {
            'forecast_data': forecast_data,
            'estimated_annual_return': estimated_annual,
            'confidence': 'low',
            'method': 'moving_average',
            'data_points_used': n,
            'trend': {
                'slope_per_month': 0.0,
                'direction': 'stable',
                'growth_6m_pct': 0.0,
            },
        }

    base_ordinal = _month_to_ordinal(chart_data[0]['month'])
    X = np.array(
        [_month_to_ordinal(row['month']) - base_ordinal for row in chart_data],
        dtype=np.float64,
    ).reshape(-1, 1)

    last_ordinal = _month_to_ordinal(last_month) - base_ordinal
    X_future = np.arange(
        last_ordinal + 1, last_ordinal + 1 + FORECAST_MONTHS, dtype=np.float64
    ).reshape(-1, 1)

    model = LinearRegression()
    model.fit(X, y)
    r_squared = model.score(X, y)

    predictions = model.predict(X_future)
    predictions = np.maximum(predictions, 0.0)

    forecast_data = [
        {'month': m, 'total_shu': round(float(v), 2)}
        for m, v in zip(future_months, predictions)
    ]

    if n >= 6:
        historical_sum = float(np.sum(y[-6:]))
    else:
        historical_sum = avg_shu * 6
    forecast_sum = float(np.sum(predictions))
    estimated_annual = round(historical_sum + forecast_sum, 2)

    if r_squared >= 0.7:
        confidence = 'high'
    elif r_squared >= 0.4:
        confidence = 'medium'
    else:
        confidence = 'low'

    # Trend from regression slope
    slope = float(model.coef_[0])
    current_fitted = float(model.predict([[last_ordinal]])[0])
    future_fitted = float(predictions[-1])
    if current_fitted > 0:
        growth_6m_pct = round((future_fitted - current_fitted) / current_fitted * 100, 1)
    else:
        growth_6m_pct = 0.0

    if slope > 0:
        direction = 'up'
    elif slope < 0:
        direction = 'down'
    else:
        direction = 'stable'

    return {
        'forecast_data': forecast_data,
        'estimated_annual_return': estimated_annual,
        'confidence': confidence,
        'method': 'linear_regression',
        'data_points_used': n,
        'trend': {
            'slope_per_month': round(slope, 2),
            'direction': direction,
            'growth_6m_pct': growth_6m_pct,
        },
    }
