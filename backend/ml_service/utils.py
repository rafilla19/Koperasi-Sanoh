"""
ML Service Utilities - Data Loading, Validation, Preprocessing, and Model Management
XGBoost + SMOTE pipeline with 16 behavioral features
"""
import os
import json
import logging
import joblib
import pandas as pd
import numpy as np
from datetime import datetime
from django.db import connection
from django.conf import settings

from ml_service.config import DATA_QUALITY_CONFIG, IMBALANCE_CONFIG, FEATURE_NAMES

logger = logging.getLogger(__name__)


class DataLoader:
    """Loader untuk mengambil data dari database."""

    @staticmethod
    def fetch_training_data(query):
        """Mengambil data untuk training dari database."""
        try:
            df = pd.read_sql(query, connection)
            logger.info(f"Successfully fetched {len(df)} records for training")
            return df
        except Exception as e:
            logger.error(f"Error fetching training data: {str(e)}")
            raise

    @staticmethod
    def fetch_member_features(member_id, query):
        """Mengambil fitur member untuk prediksi real-time."""
        try:
            df = pd.read_sql(query, connection, params=[member_id, member_id, member_id, member_id])
            if df.empty:
                logger.warning(f"No data found for member {member_id}")
                return None

            features_dict = df.iloc[0].to_dict()
            logger.info(f"Successfully fetched features for member {member_id}")
            return features_dict
        except Exception as e:
            logger.error(f"Error fetching member features: {str(e)}")
            raise


class DataValidator:
    """Validasi data quality untuk training."""

    @staticmethod
    def validate_complete(df, stage='training'):
        """Comprehensive data validation."""
        result = {
            'is_valid': True,
            'issues': [],
            'warnings': [],
            'statistics': {}
        }

        if df is None or df.empty:
            result['is_valid'] = False
            result['issues'].append("DataFrame is empty")
            return result

        min_samples = DATA_QUALITY_CONFIG['min_training_samples']
        if len(df) < min_samples:
            result['is_valid'] = False
            result['issues'].append(f"Insufficient samples: {len(df)} < {min_samples}")

        missing_ratio = df.isnull().sum() / len(df)
        max_missing = DATA_QUALITY_CONFIG['max_missing_ratio']

        bad_columns = missing_ratio[missing_ratio > max_missing]
        if len(bad_columns) > 0:
            result['is_valid'] = False
            for col, ratio in bad_columns.items():
                result['issues'].append(f"Column '{col}' has {ratio*100:.1f}% missing values")

        target_col = 'is_eligible'
        if target_col in df.columns:
            class_dist = df[target_col].value_counts()
            if len(class_dist) < 2:
                result['is_valid'] = False
                result['issues'].append("Only one class in target variable")
            else:
                eligible_ratio = class_dist.get(1, 0) / len(df)
                threshold = IMBALANCE_CONFIG['sampling_ratio']

                if eligible_ratio < threshold or eligible_ratio > (1 - threshold):
                    result['warnings'].append(
                        f"Class imbalance: {eligible_ratio*100:.1f}% eligible. "
                        f"Will use SMOTE for oversampling."
                    )

                result['statistics']['class_distribution'] = {
                    'eligible_count': int(class_dist.get(1, 0)),
                    'risky_count': int(class_dist.get(0, 0)),
                    'eligible_ratio': float(eligible_ratio)
                }

        result['statistics'].update({
            'total_samples': len(df),
            'total_features': len(df.columns),
            'missing_features_count': int((df.isnull().sum() > 0).sum()),
            'numeric_features': len(df.select_dtypes(include=[np.number]).columns),
        })
        return result

    @staticmethod
    def check_data_leakage(df):
        """Check untuk potential data leakage."""
        leakage_issues = []
        if 'created_at' in df.columns and 'loan_date' in df.columns:
            future_mask = df['created_at'] > df['loan_date']
            if future_mask.any():
                leakage_issues.append({
                    'type': 'FUTURE_DATA',
                    'count': int(future_mask.sum()),
                    'severity': 'HIGH'
                })
        return leakage_issues

    @staticmethod
    def check_class_imbalance(y):
        """Analyze class imbalance."""
        value_counts = y.value_counts()
        total = len(y)
        return {
            'class_0_count': int(value_counts.get(0, 0)),
            'class_1_count': int(value_counts.get(1, 0)),
            'class_0_ratio': float(value_counts.get(0, 0) / total),
            'class_1_ratio': float(value_counts.get(1, 0) / total),
            'imbalance_ratio': max(
                value_counts.get(0, 1) / max(value_counts.get(1, 1), 1),
                value_counts.get(1, 1) / max(value_counts.get(0, 1), 1)
            ),
            'needs_balancing': (
                value_counts.get(1, 0) / total < IMBALANCE_CONFIG['sampling_ratio'] or
                value_counts.get(1, 0) / total > (1 - IMBALANCE_CONFIG['sampling_ratio'])
            )
        }

    @staticmethod
    def validate_prediction_input(member_features):
        """Validate features untuk prediksi real-time."""
        required_fields = ['age', 'balance_voluntary', 'savings_to_total_obligation_ratio']
        missing_fields = [f for f in required_fields if f not in member_features]
        if missing_fields:
            return False, f"Missing required fields: {missing_fields}"
        return True, "Validation passed"


class DataPreprocessor:
    """Feature Engineering dan data preparation."""

    @staticmethod
    def prepare_training_data(df):
        """Prepare training data - select and clean features."""
        df = df.copy()

        available_features = [col for col in FEATURE_NAMES if col in df.columns]
        logger.info(f"Using {len(available_features)} features for model training")

        X = df[available_features].copy()
        y = df['is_eligible'].copy()

        for col in X.columns:
            X[col] = pd.to_numeric(X[col], errors='coerce')

        X = X.fillna(X.median())
        X = X.replace([np.inf, -np.inf], np.nan)
        X = X.fillna(X.median())

        logger.info(f"Prepared {len(X)} training samples with {len(available_features)} features")
        return X, y, df


class ModelManager:
    """Manager untuk lifecycle model."""

    def __init__(self, model_dir=None):
        self.model_dir = model_dir or os.path.join(settings.BASE_DIR, 'ml_service', 'models')
        os.makedirs(self.model_dir, exist_ok=True)

    def save_model(self, model_data, version=None):
        """Menyimpan model dengan versioning."""
        if version is None:
            version = datetime.now().strftime("%Y%m%d_%H%M%S")

        model_filename = f"loan_model_{version}.pkl"
        model_path = os.path.join(self.model_dir, model_filename)

        try:
            joblib.dump(model_data, model_path)
            logger.info(f"Model saved to {model_path}")
        except Exception as e:
            logger.error(f"Error saving model: {str(e)}")
            raise

        self._update_latest_model(model_path, version)

        metadata = {
            'version': version,
            'model_file': model_filename,
            'saved_at': datetime.now().isoformat(),
            'feature_names': model_data.get('feature_names', []),
            'training_date': model_data.get('training_date'),
            'model_info': model_data.get('model_info', {})
        }
        self._save_metadata(metadata, version)
        return model_path

    def load_model(self, version=None):
        """Load model dari file."""
        if version is None:
            model_path = self._get_latest_model_path()
        else:
            model_filename = f"loan_model_{version}.pkl"
            model_path = os.path.join(self.model_dir, model_filename)

        if not os.path.exists(model_path):
            logger.error(f"Model not found at {model_path}")
            raise FileNotFoundError(f"Model not found: {model_path}")

        try:
            model_data = joblib.load(model_path)
            logger.info(f"Model loaded from {model_path}")
            return model_data
        except Exception as e:
            logger.error(f"Error loading model: {str(e)}")
            raise

    def _get_latest_model_path(self):
        """Mendapatkan path dari latest model."""
        pkl_files = [f for f in os.listdir(self.model_dir) if f.endswith('.pkl')]
        if not pkl_files:
            default_path = os.path.join(self.model_dir, 'loan_model_combined.pkl')
            if os.path.exists(default_path):
                return default_path
            raise FileNotFoundError("No models found in model directory")

        pkl_files.sort(key=lambda x: os.path.getmtime(os.path.join(self.model_dir, x)), reverse=True)
        return os.path.join(self.model_dir, pkl_files[0])

    def _update_latest_model(self, model_path, version):
        """Update latest model reference."""
        latest_path = os.path.join(self.model_dir, 'loan_model_combined.pkl')
        try:
            if os.path.exists(latest_path):
                os.remove(latest_path)
            import shutil
            shutil.copy(model_path, latest_path)
            logger.info("Updated latest model reference")
        except Exception as e:
            logger.warning(f"Could not update latest model reference: {str(e)}")

    def _save_metadata(self, metadata, version):
        """Menyimpan metadata model."""
        metadata_filename = f"model_metadata_{version}.json"
        metadata_path = os.path.join(self.model_dir, metadata_filename)
        try:
            with open(metadata_path, 'w') as f:
                json.dump(metadata, f, indent=2)
            logger.info(f"Metadata saved to {metadata_path}")
        except Exception as e:
            logger.error(f"Error saving metadata: {str(e)}")

    def get_model_info(self, version=None):
        """Mendapatkan informasi model."""
        if version is None:
            metadata_files = [f for f in os.listdir(self.model_dir)
                            if f.startswith('model_metadata_') and f.endswith('.json')]
            if not metadata_files:
                return None
            metadata_files.sort(reverse=True)
            metadata_file = metadata_files[0]
        else:
            metadata_file = f"model_metadata_{version}.json"

        metadata_path = os.path.join(self.model_dir, metadata_file)
        try:
            with open(metadata_path, 'r') as f:
                metadata = json.load(f)
            return metadata
        except Exception as e:
            logger.error(f"Error reading metadata: {str(e)}")
            return None

    def list_models(self):
        """List semua available models."""
        pkl_files = [f for f in os.listdir(self.model_dir) if f.endswith('.pkl')]
        models = [f.replace('loan_model_', '').replace('.pkl', '') for f in pkl_files]
        models = [m for m in models if m != 'combined']
        return sorted(models, reverse=True)

    def delete_model(self, version):
        """Hapus model tertentu."""
        model_filename = f"loan_model_{version}.pkl"
        model_path = os.path.join(self.model_dir, model_filename)
        try:
            if os.path.exists(model_path):
                os.remove(model_path)
            metadata_file = f"model_metadata_{version}.json"
            metadata_path = os.path.join(self.model_dir, metadata_file)
            if os.path.exists(metadata_path):
                os.remove(metadata_path)
            logger.info(f"Model version {version} deleted")
            return True
        except Exception as e:
            logger.error(f"Error deleting model: {str(e)}")
            return False

    def cleanup_old_models(self, keep_latest=5):
        """Hapus model lama, keep only latest N versions."""
        models = self.list_models()
        if len(models) > keep_latest:
            for version in models[keep_latest:]:
                self.delete_model(version)
            logger.info(f"Cleaned up old models, keeping {keep_latest} latest versions")
