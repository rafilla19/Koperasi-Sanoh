"""
Trainer - Core module untuk prediksi kelayakan pinjaman dan saran bunga
Menggunakan model terlatih untuk memberikan rekomendasi saat loan application dan approval
"""
import os
import pandas as pd
import numpy as np
from django.conf import settings
import logging

from ml_service.utils import DataLoader, ModelManager, DataPreprocessor
from ml_service.config import (
    PREDICTION_QUERY, INTEREST_RATE_RANGES, MODEL_DIR
)

logger = logging.getLogger(__name__)

# Initialize utilities
model_manager = ModelManager(MODEL_DIR)
preprocessor = DataPreprocessor()


def fetch_member_features(member_id):
    """
    Mengambil fitur member secara real-time dari database untuk prediksi.
    
    Args:
        member_id (int): ID member
        
    Returns:
        dict: Dictionary berisi semua fitur member
    """
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
    """
    Mendapatkan default features untuk member baru.
    
    Returns:
        dict: Default member features
    """
    return {
        'member_id': None,
        'current_savings': 0,
        'on_time_payments': 0,
        'late_payments': 0,
        'total_loans_completed': 0,
        'total_loans_active': 0,
        'member_tenure_months': 0,
        'total_active_debt': 0
    }


def create_prediction_input(principal, duration, member_features):
    """
    Membuat input untuk model prediksi dengan fitur yang diminta user.
    
    Args:
        principal (float): Jumlah pinjaman yang diminta
        duration (int): Durasi pinjaman dalam bulan
        member_features (dict): Fitur member dari database (PREDICTION_QUERY)
        
    Returns:
        pd.DataFrame: Input data untuk model
    """
    from ml_service.utils import DataPreprocessor
    
    amount_requested = float(principal)
    duration_months = int(duration)
    
    # Estimasi cicilan per bulan
    # Asumsi sementara total_amount = principal (base) untuk fitur ML jika blm tau bunga final
    monthly_installment_estimation = round(amount_requested / max(duration_months, 1), 2)
    
    total_savings_amount = float(member_features.get('total_savings_amount', 0))
    savings_loan_ratio = round(total_savings_amount / max(amount_requested, 1), 2)
    
    # Create base features matching the query output
    input_dict = {
        'age': int(member_features.get('age', 30)),
        'member_tenure_months': int(member_features.get('member_tenure_months', 0)),
        'employee_status_id': int(member_features.get('employee_status_id', 1) or 1),
        'amount_requested': amount_requested,
        'duration_months': duration_months,
        'monthly_installment_estimation': monthly_installment_estimation,
        'total_savings_amount': total_savings_amount,
        'savings_loan_ratio': savings_loan_ratio,
        'saving_payment_ratio': float(member_features.get('saving_payment_ratio', 1.0))
    }
    
    df = pd.DataFrame([input_dict])
    
    # Run through preprocessor to create derived overall_risk_score
    df = DataPreprocessor.create_features(df)
    
    return df


def get_eligibility_level(probability):
    """
    Menentukan level kelayakan berdasarkan probability.
    
    Args:
        probability (float): Probabilitas dari classifier (0-1)
        
    Returns:
        str: Eligibility level (High/Medium/Low)
    """
    if probability >= 0.75:
        return 'High'
    elif probability >= 0.50:
        return 'Medium'
    else:
        return 'Low'


def calculate_suggested_interest(probability, regressor_prediction=None, 
                                member_features=None, config=None, risk_scores=None):
    """
    Kalkulasi interest rate menggunakan konsep Risk-Based Pricing (Pricing Layer).
    
    Formula:
    Recommended Rate = Base Rate + Behavioral Adjustment
    
    Base Rate = Rata-rata bunga historis atau ML regressor baseline (default 1.25%).
    Behavioral Adjustment didapat dari overall_risk_score (0-100).
    
    Tiers (berdasarkan permintaan bisnis):
    - Score 0-20   : +0.0%
    - Score 20-40  : +0.2%
    - Score 40-60  : +0.5%
    - Score 60-80  : +1.0%
    - Score 80-100 : +1.5%
    
    Args:
        probability (float): Probability dari classifier (0-1)
        regressor_prediction (float): Output dari regressor sebagai info tambahan
        member_features (dict): Fitur dasar member
        config (dict): Configuration untuk rate calculation
        risk_scores (dict): Dictionary berisi skor risiko (payment, financial, overall)
        
    Returns:
        float: Final suggested interest rate (flat rate per periode)
    """
    # 1. Tentukan Base Rate
    # Idealnya menggunakan base rate standar koperasi. Kita ambil 1.0% jika tidak ada data historis.
    if member_features and 'avg_historical_interest_rate' in member_features:
        base_rate = float(member_features['avg_historical_interest_rate'])
    elif regressor_prediction is not None and not np.isnan(regressor_prediction):
        base_rate = float(regressor_prediction)
    else:
        base_rate = 1.0 
        
    # Minimum base rate safeguard
    if base_rate <= 0:
        base_rate = 1.0

    # 2. Dapatkan Overall Risk Score
    overall_score = 50 # Default middle ground jika tidak tersedia
    if risk_scores and 'overall_risk_score' in risk_scores:
        overall_score = float(risk_scores['overall_risk_score'])
        
    # 3. Terapkan Pricing Layer (Behavioral Adjustment)
    adjustment = 0.0
    if overall_score <= 20:
        adjustment = 0.0
    elif overall_score <= 40:
        adjustment = 0.2
    elif overall_score <= 60:
        adjustment = 0.5
    elif overall_score <= 80:
        adjustment = 1.0
    else:
        adjustment = 1.5
        
    # 4. Hitung Final Recommended Rate
    recommended_rate = base_rate + adjustment
    
    return round(recommended_rate, 2)


def get_prediction(principal, duration, member_id):
    """
    Melakukan prediksi kelayakan pinjaman dan saran bunga untuk member tertentu.
    
    Digunakan saat:
    1. Member membuat loan application
    2. Admin melakukan review/approval loan
    
    Uses ML-Driven approach:
    - Classifier: prediksi eligibility (High/Medium/Low)
    - Regressor: prediksi interest rate
    - Risk Scores: comprehensive risk analysis
    
    Args:
        principal (float): Jumlah pinjaman yang diminta
        duration (int): Durasi pinjaman dalam bulan
        member_id (int): ID member
        
    Returns:
        dict: {
            'eligibility': str (High/Medium/Low),
            'probability': float (0-1),
            'suggested_interest_rate': float (percent per year),
            'member_features': dict,
            'recommendation': str,
            'risk_scores': dict with payment, financial, overall scores,
            'risk_factors': list,
            'success': bool
        }
    """
    result = {
        'eligibility': 'Medium',
        'probability': 0.5,
        'suggested_interest_rate': 1.25,
        'member_features': {},
        'recommendation': '',
        'risk_scores': {},
        'risk_factors': [],
        'success': False
    }
    
    try:
        # 1. Fetch member features
        member_features = fetch_member_features(member_id)
        result['member_features'] = member_features
        
        # 2. Prepare input untuk model
        prediction_input = create_prediction_input(principal, duration, member_features)
        
        # 3. Load model
        try:
            model_data = model_manager.load_model()
        except FileNotFoundError:
            logger.warning("Model not found, using default predictions")
            result['recommendation'] = "Model belum tersedia. Menggunakan nilai default."
            return result
        
        classifier = model_data.get('classifier')
        regressor = model_data.get('regressor')
        
        if classifier is None:
            logger.warning("Classifier not found in model")
            return result
        
        # 4. Get feature names dari training
        feature_names = model_data.get('feature_names', [])
        if feature_names:
            # Ensure features match training order
            prediction_input = prediction_input[feature_names]
        
        # 5. Predict Eligibility (Classifier)
        probability = float(classifier.predict_proba(prediction_input)[0][1])
        result['probability'] = probability
        
        # 6. Predict Interest Rate (Regressor) - ML-DRIVEN
        regressor_rate = None
        if regressor is not None:
            try:
                regressor_rate = float(regressor.predict(prediction_input)[0])
            except:
                regressor_rate = None
        
        # 7. Determine eligibility level
        eligibility = get_eligibility_level(probability)
        result['eligibility'] = eligibility
        
        # 8. Extract risk scores dari features (dilakukan lebih awal untuk Pricing Layer)
        risk_scores = {
            'payment_risk_score': prediction_input['payment_risk_score'].values[0] if 'payment_risk_score' in prediction_input.columns else 0,
            'financial_risk_score': prediction_input['financial_risk_score'].values[0] if 'financial_risk_score' in prediction_input.columns else 0,
            'overall_risk_score': prediction_input['overall_risk_score'].values[0] if 'overall_risk_score' in prediction_input.columns else 0,
        }
        result['risk_scores'] = risk_scores
        
        # 9. Calculate suggested interest rate (Menggunakan Pricing Layer Baru)
        suggested_rate = calculate_suggested_interest(
            probability,
            regressor_prediction=regressor_rate,
            member_features=member_features,
            risk_scores=risk_scores
        )
        result['suggested_interest_rate'] = suggested_rate
        
        # 10. Analyze detailed risk factors
        risk_factors = analyze_risk_factors(member_features, principal, duration)
        result['risk_factors'] = risk_factors
        
        # 11. Generate comprehensive recommendation
        recommendation = generate_recommendation(
            eligibility, 
            probability, 
            risk_factors,
            risk_scores
        )
        result['recommendation'] = recommendation
        
        result['success'] = True
        logger.info(f"Prediction successful for member {member_id}: {eligibility} @ {suggested_rate}%")
        
    except Exception as e:
        logger.error(f"Error during prediction: {str(e)}")
        result['recommendation'] = f"Error dalam prediksi: {str(e)}"
    
    return result


def analyze_risk_factors(member_features, principal, duration):
    """
    Menganalisis faktor risiko yang komprehensif dari aplikasi pinjaman.
    
    Args:
        member_features (dict): Fitur member
        principal (float): Jumlah pinjaman
        duration (int): Durasi pinjaman
        
    Returns:
        list: List faktor risiko dengan severity
    """
    risk_factors = []
    
    # 1. PAYMENT HISTORY RISK
    late_payments = member_features.get('late_payments', 0)
    total_history = member_features.get('total_payment_history', 0)
    
    if total_history > 0:
        late_ratio = late_payments / total_history
        if late_ratio > 0.3:
            risk_factors.append({
                'factor': 'High payment default ratio',
                'details': f'{late_ratio*100:.0f}% of payments were late',
                'severity': 'HIGH'
            })
        elif late_ratio > 0.1:
            risk_factors.append({
                'factor': 'Some payment delays',
                'details': f'{late_ratio*100:.0f}% of payments were late',
                'severity': 'MEDIUM'
            })
    
    # 2. SAVINGS & LIQUIDITY RISK
    current_savings = member_features.get('current_savings', 0)
    total_active_debt = member_features.get('total_active_debt_before', 0)
    
    if current_savings < principal * 0.1:
        risk_factors.append({
            'factor': 'Low savings buffer',
            'details': f'Savings only {current_savings/principal*100:.0f}% of requested loan',
            'severity': 'HIGH'
        })
    
    debt_to_savings = total_active_debt / (current_savings + 1)
    if debt_to_savings > 3:
        risk_factors.append({
            'factor': 'High existing debt burden',
            'details': f'Existing debt {debt_to_savings:.1f}x current savings',
            'severity': 'HIGH'
        })
    
    # 3. EXISTING LOANS RISK
    active_loans = member_features.get('total_loans_active_before', 0)
    if active_loans > 3:
        risk_factors.append({
            'factor': 'Multiple active loans',
            'details': f'Already has {active_loans} active loans',
            'severity': 'MEDIUM'
        })
    
    # 4. DURATION & LOAN AMOUNT RISK
    if duration > 60:  # > 5 tahun
        risk_factors.append({
            'factor': 'Extended loan duration',
            'details': f'Duration {duration} months (> 5 years)',
            'severity': 'MEDIUM'
        })
    
    # 5. MEMBER TENURE RISK
    tenure = member_features.get('member_tenure_months', 0)
    if tenure < 6:
        risk_factors.append({
            'factor': 'New member',
            'details': f'Member tenure only {tenure} months',
            'severity': 'MEDIUM'
        })
    elif tenure < 12:
        risk_factors.append({
            'factor': 'Limited member history',
            'details': f'Member tenure {tenure} months',
            'severity': 'LOW'
        })
    
    # 6. LOAN HISTORY & COMPLETION RATE
    completed = member_features.get('total_loans_completed_before', 0)
    total_loans = completed + active_loans
    if total_loans > 0:
        completion_rate = completed / total_loans
        if completion_rate < 0.5:
            risk_factors.append({
                'factor': 'Low loan completion rate',
                'details': f'Only {completion_rate*100:.0f}% of loans completed',
                'severity': 'HIGH'
            })
    
    return risk_factors


def generate_recommendation(eligibility, probability, risk_factors, risk_scores=None):
    """
    Generate rekomendasi yang comprehensive dan user-friendly.
    
    Args:
        eligibility (str): Eligibility level (High/Medium/Low)
        probability (float): Probability score
        risk_factors (list): List of risk factors
        risk_scores (dict): Risk scores (payment, financial, overall)
        
    Returns:
        str: Rekomendasi teks
    """
    confidence_level = {
        'High': 'sangat tinggi',
        'Medium': 'sedang',
        'Low': 'rendah'
    }
    
    # Base recommendation
    base_recs = {
        'High': f'✓ DIREKOMENDASIKAN untuk disetujui\n  Kelayakan: Sangat Baik (Confidence: {probability*100:.1f}%)',
        'Medium': f'⊘ MEMERLUKAN REVIEW tambahan\n  Kelayakan: Cukup (Confidence: {probability*100:.1f}%)',
        'Low': f'✗ TIDAK DIREKOMENDASIKAN\n  Kelayakan: Rendah (Confidence: {probability*100:.1f}%)'
    }
    
    rec = base_recs.get(eligibility, "Pinjaman perlu review lebih lanjut")
    
    # Add risk scores info
    if risk_scores:
        rec += f'\n\n📊 Skor Risiko:\n'
        rec += f'  • Risiko Pembayaran: {risk_scores.get("payment_risk_score", 0):.0f}/100\n'
        rec += f'  • Risiko Finansial: {risk_scores.get("financial_risk_score", 0):.0f}/100\n'
        rec += f'  • Risiko Keseluruhan: {risk_scores.get("overall_risk_score", 0):.0f}/100'
    
    # Add risk factors
    if risk_factors:
        rec += '\n\n⚠️  Faktor Risiko:'
        for factor in risk_factors:
            if isinstance(factor, dict):
                severity_icon = '🔴' if factor.get('severity') == 'HIGH' else '🟡' if factor.get('severity') == 'MEDIUM' else '🟢'
                rec += f'\n  {severity_icon} {factor.get("factor", "")}'
                if 'details' in factor:
                    rec += f'\n     → {factor["details"]}'
            else:
                rec += f'\n  • {factor}'
    else:
        rec += '\n\n✓ Tidak ada faktor risiko signifikan'
    
    # Add action recommendation
    if eligibility == 'High':
        rec += '\n\n✓ Rekomendasi: SETUJUI dengan suku bunga kompetitif'
    elif eligibility == 'Medium':
        rec += '\n\n⊘ Rekomendasi: SETUJUI dengan persyaratan tambahan atau jaminan'
    else:
        rec += '\n\n✗ Rekomendasi: PERTIMBANGKAN KEMBALI atau minta dokumen tambahan'
    
    return rec


def trigger_model_training():
    """
    Memicu retraining model (dipanggil dari management command).
    
    Returns:
        bool: Success status
    """
    try:
        from django.core.management import call_command
        call_command('train_loan_model')
        return True
    except Exception as e:
        logger.error(f"Error triggering model training: {str(e)}")
        return False
