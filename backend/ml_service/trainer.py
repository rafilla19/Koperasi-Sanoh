"""
Trainer - Core module untuk prediksi kelayakan pinjaman dan rekomendasi bunga
XGBoost + SMOTE model with 5-tier interest rate system
"""
import os
import pandas as pd
import numpy as np
from django.conf import settings
import logging

from ml_service.utils import DataLoader, ModelManager
from ml_service.config import (
    PREDICTION_QUERY, INTEREST_RATE_TIERS, MODEL_DIR, FEATURE_NAMES
)

logger = logging.getLogger(__name__)

model_manager = ModelManager(MODEL_DIR)


def fetch_member_features(member_id):
    """Mengambil fitur member secara real-time dari database untuk prediksi."""
    try:
        features = DataLoader.fetch_member_features(member_id, PREDICTION_QUERY)
        if features is None:
            logger.warning(f"No features found for member {member_id}, using defaults")
            return get_default_member_features()
        return features
    except Exception as e:
        logger.error(f"Error fetching member features: {str(e)}")
        return get_default_member_features()


def get_default_member_features():
    """Default features untuk member baru."""
    return {
        'age': 30,
        'member_tenure_months': 0,
        'employee_status_id': 1,
        'is_male': 0,
        'balance_mandatory': 0,
        'balance_voluntary': 0,
        'monthly_voluntary_obligation': 0,
        'savings_to_total_obligation_ratio': 0,
        'total_withdrawal_count': 0,
        'total_withdrawal_amount': 0,
        'total_past_loans_count': 0,
        'total_historical_late_installments': 0,
        'absolute_max_delay_days': 0,
        'full_name': 'Unknown',
    }


def create_prediction_input(principal, duration, member_features):
    """
    Membuat input untuk model prediksi.

    Args:
        principal (float): Jumlah pinjaman yang diminta
        duration (int): Durasi pinjaman dalam bulan
        member_features (dict): Fitur member dari database (PREDICTION_QUERY)

    Returns:
        pd.DataFrame: Input data untuk model
    """
    requested_principal_amount = float(principal)
    duration_months = int(duration)

    monthly_installment_estimation = round(requested_principal_amount / max(duration_months, 1), 2)

    balance_voluntary = float(member_features.get('balance_voluntary', 0))
    voluntary_to_installment_ratio = round(
        balance_voluntary / monthly_installment_estimation, 2
    ) if monthly_installment_estimation > 0 else 0

    input_dict = {
        'age': int(member_features.get('age', 30)),
        'member_tenure_months': int(member_features.get('member_tenure_months', 0)),
        'employee_status_id': int(member_features.get('employee_status_id', 1) or 1),
        'is_male': int(member_features.get('is_male', 0)),
        'balance_mandatory': float(member_features.get('balance_mandatory', 0)),
        'balance_voluntary': balance_voluntary,
        'monthly_voluntary_obligation': float(member_features.get('monthly_voluntary_obligation', 0)),
        'savings_to_total_obligation_ratio': float(member_features.get('savings_to_total_obligation_ratio', 0)),
        'total_withdrawal_count': int(member_features.get('total_withdrawal_count', 0)),
        'total_withdrawal_amount': float(member_features.get('total_withdrawal_amount', 0)),
        'total_past_loans_count': int(member_features.get('total_past_loans_count', 0)),
        'total_historical_late_installments': int(member_features.get('total_historical_late_installments', 0)),
        'absolute_max_delay_days': int(member_features.get('absolute_max_delay_days', 0)),
        'requested_principal_amount': requested_principal_amount,
        'monthly_installment_estimation': monthly_installment_estimation,
        'voluntary_to_installment_ratio': voluntary_to_installment_ratio,
    }

    df = pd.DataFrame([input_dict])
    return df


def get_eligibility_result(prob_eligible):
    """
    Menentukan status kelayakan, risk level, dan bunga berdasarkan probabilitas.

    Returns:
        dict: {status, risk_level, interest_rate_monthly, interest_rate_yearly}
    """
    for tier in INTEREST_RATE_TIERS:
        if prob_eligible >= tier['min_prob']:
            return {
                'status': tier['status'],
                'risk_level': tier['risk_level'],
                'interest_rate_monthly': tier['interest_monthly'],
                'interest_rate_yearly': tier['interest_monthly'] * 12 if tier['interest_monthly'] else None,
            }
    last = INTEREST_RATE_TIERS[-1]
    return {
        'status': last['status'],
        'risk_level': last['risk_level'],
        'interest_rate_monthly': last['interest_monthly'],
        'interest_rate_yearly': last['interest_monthly'] * 12 if last['interest_monthly'] else None,
    }


def get_prediction(principal, duration, member_id):
    """
    Melakukan prediksi kelayakan pinjaman dan rekomendasi bunga.

    Digunakan saat:
    1. Member membuat loan application (pre-submit simulation)
    2. Admin melakukan review/approval loan (AI suggestion)

    Returns:
        dict: {
            'eligibility': str,
            'probability': float,
            'suggested_interest_rate': float,
            'member_features': dict,
            'recommendation': str,
            'risk_level': str,
            'risk_factors': list,
            'success': bool
        }
    """
    result = {
        'eligibility': 'PERLU REVIEW MANUAL',
        'probability': 0.5,
        'suggested_interest_rate': 2.0,
        'member_features': {},
        'recommendation': '',
        'risk_level': 'TINGGI',
        'risk_factors': [],
        'success': False
    }

    try:
        member_features = fetch_member_features(member_id)
        result['member_features'] = member_features

        prediction_input = create_prediction_input(principal, duration, member_features)

        try:
            model_data = model_manager.load_model()
        except FileNotFoundError:
            logger.warning("Model not found, using default predictions")
            result['recommendation'] = "Model belum tersedia. Menggunakan nilai default."
            return result

        classifier = model_data.get('classifier')
        if classifier is None:
            logger.warning("Classifier not found in model")
            return result

        feature_names = model_data.get('feature_names', [])
        if feature_names:
            prediction_input = prediction_input[feature_names]

        proba = classifier.predict_proba(prediction_input)[0]
        prob_eligible = float(proba[1])
        prob_risky = float(proba[0])

        result['probability'] = prob_eligible

        eligibility = get_eligibility_result(prob_eligible)
        result['eligibility'] = eligibility['status']
        result['risk_level'] = eligibility['risk_level']

        if eligibility['interest_rate_monthly'] is not None:
            result['suggested_interest_rate'] = eligibility['interest_rate_monthly']
        else:
            result['suggested_interest_rate'] = None

        risk_factors = analyze_risk_factors(member_features, principal, duration)
        result['risk_factors'] = risk_factors

        recommendation = generate_recommendation(
            eligibility['status'],
            prob_eligible,
            prob_risky,
            eligibility['risk_level'],
            eligibility['interest_rate_monthly'],
            risk_factors
        )
        result['recommendation'] = recommendation

        result['success'] = True
        logger.info(
            f"Prediction for member {member_id}: "
            f"{eligibility['status']} (prob={prob_eligible:.2%}, risk={eligibility['risk_level']})"
        )

    except Exception as e:
        logger.error(f"Error during prediction: {str(e)}")
        result['recommendation'] = f"Error dalam prediksi: {str(e)}"

    return result


def analyze_risk_factors(member_features, principal, duration):
    """Menganalisis faktor risiko dari aplikasi pinjaman."""
    risk_factors = []

    late_installments = member_features.get('total_historical_late_installments', 0)
    if late_installments > 10:
        risk_factors.append({
            'factor': 'Riwayat keterlambatan tinggi',
            'details': f'{late_installments} cicilan terlambat dari pinjaman sebelumnya',
            'severity': 'HIGH'
        })
    elif late_installments > 3:
        risk_factors.append({
            'factor': 'Ada riwayat keterlambatan',
            'details': f'{late_installments} cicilan terlambat dari pinjaman sebelumnya',
            'severity': 'MEDIUM'
        })

    max_delay = member_features.get('absolute_max_delay_days', 0)
    if max_delay > 60:
        risk_factors.append({
            'factor': 'Keterlambatan maksimum sangat tinggi',
            'details': f'Pernah terlambat hingga {max_delay} hari',
            'severity': 'HIGH'
        })
    elif max_delay > 30:
        risk_factors.append({
            'factor': 'Keterlambatan maksimum cukup tinggi',
            'details': f'Pernah terlambat hingga {max_delay} hari',
            'severity': 'MEDIUM'
        })

    balance_voluntary = float(member_features.get('balance_voluntary', 0))
    if balance_voluntary < float(principal) * 0.05:
        risk_factors.append({
            'factor': 'Tabungan sukarela sangat rendah',
            'details': f'Tabungan sukarela hanya Rp {balance_voluntary:,.0f} vs pinjaman Rp {float(principal):,.0f}',
            'severity': 'HIGH'
        })

    savings_ratio = float(member_features.get('savings_to_total_obligation_ratio', 0))
    if savings_ratio < 5:
        risk_factors.append({
            'factor': 'Rasio tabungan terhadap kewajiban rendah',
            'details': f'Rasio: {savings_ratio:.1f}',
            'severity': 'MEDIUM'
        })

    tenure = int(member_features.get('member_tenure_months', 0))
    if tenure < 6:
        risk_factors.append({
            'factor': 'Anggota baru',
            'details': f'Masa keanggotaan hanya {tenure} bulan',
            'severity': 'MEDIUM'
        })

    withdrawal_count = int(member_features.get('total_withdrawal_count', 0))
    withdrawal_amount = float(member_features.get('total_withdrawal_amount', 0))
    if withdrawal_count > 5 and withdrawal_amount > float(principal) * 0.5:
        risk_factors.append({
            'factor': 'Aktivitas penarikan tinggi',
            'details': f'{withdrawal_count} penarikan senilai Rp {withdrawal_amount:,.0f}',
            'severity': 'MEDIUM'
        })

    if duration > 60:
        risk_factors.append({
            'factor': 'Durasi pinjaman panjang',
            'details': f'Durasi {duration} bulan (> 5 tahun)',
            'severity': 'MEDIUM'
        })

    return risk_factors


def generate_recommendation(status, prob_eligible, prob_risky, risk_level,
                           interest_rate_monthly, risk_factors):
    """Generate rekomendasi lengkap."""
    rec = "=" * 50 + "\n"
    rec += "  HASIL PREDIKSI KELAYAKAN PINJAMAN\n"
    rec += "=" * 50 + "\n\n"
    rec += f"  Probabilitas Eligible : {prob_eligible:.2%}\n"
    rec += f"  Probabilitas Risky    : {prob_risky:.2%}\n\n"
    rec += f"  Status Kelayakan : {status}\n"
    rec += f"  Tingkat Risiko   : {risk_level}\n\n"

    if interest_rate_monthly is not None:
        rec += f"  Rekomendasi Bunga: {interest_rate_monthly}% per bulan ({interest_rate_monthly * 12}% per tahun)\n"
    else:
        rec += f"  Rekomendasi Bunga: PINJAMAN TIDAK DIREKOMENDASIKAN\n"

    if risk_factors:
        rec += "\n  Faktor Risiko:\n"
        for factor in risk_factors:
            severity_icon = 'HIGH' if factor.get('severity') == 'HIGH' else 'MED' if factor.get('severity') == 'MEDIUM' else 'LOW'
            rec += f"  [{severity_icon}] {factor.get('factor', '')}\n"
            if 'details' in factor:
                rec += f"         {factor['details']}\n"
    else:
        rec += "\n  Tidak ada faktor risiko signifikan.\n"

    rec += "\n" + "-" * 50 + "\n"
    rec += "  Tabel Referensi Suku Bunga:\n"
    rec += "-" * 50 + "\n"
    rec += f"  {'Prob. Eligible':<20} {'Risiko':<18} {'Bunga/Bulan':<15} {'Bunga/Tahun'}\n"
    rec += f"  {'>= 85%':<20} {'Sangat Rendah':<18} {'0.8%':<15} {'9.6%'}\n"
    rec += f"  {'70% - 84%':<20} {'Rendah':<18} {'1.0%':<15} {'12.0%'}\n"
    rec += f"  {'55% - 69%':<20} {'Sedang':<18} {'1.5%':<15} {'18.0%'}\n"
    rec += f"  {'40% - 54%':<20} {'Tinggi':<18} {'2.0%':<15} {'24.0%'}\n"
    rec += f"  {'< 40%':<20} {'Sangat Tinggi':<18} {'DITOLAK':<15} {'DITOLAK'}\n"

    if status == 'LAYAK':
        rec += "\n  Rekomendasi: SETUJUI dengan suku bunga sesuai tier.\n"
    elif status == 'LAYAK (DENGAN CATATAN)':
        rec += "\n  Rekomendasi: SETUJUI dengan persyaratan tambahan atau jaminan.\n"
    elif status == 'PERLU REVIEW MANUAL':
        rec += "\n  Rekomendasi: PERTIMBANGKAN KEMBALI, perlu review manual lebih lanjut.\n"
    else:
        rec += "\n  Rekomendasi: TIDAK DIREKOMENDASIKAN untuk disetujui.\n"

    return rec


def trigger_model_training():
    """Memicu retraining model."""
    try:
        from django.core.management import call_command
        call_command('train_loan_model')
        return True
    except Exception as e:
        logger.error(f"Error triggering model training: {str(e)}")
        return False
