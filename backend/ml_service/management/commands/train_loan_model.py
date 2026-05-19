"""
Management Command: Train Loan Model
Training model untuk prediksi kelayakan pinjaman dan saran bunga
Menggunakan data dari database secara real-time dengan comprehensive validation
"""
import pandas as pd
import numpy as np
import logging
from datetime import datetime
from django.core.management.base import BaseCommand
from django.conf import settings
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.model_selection import train_test_split, StratifiedKFold
from sklearn.metrics import (
    classification_report, confusion_matrix, roc_auc_score,
    mean_squared_error, mean_absolute_error, precision_recall_curve, f1_score
)
from sklearn.utils.class_weight import compute_sample_weight

from ml_service.config import (
    TRAINING_DATA_QUERY, MODEL_CONFIG, FEATURE_NAMES,
    DATA_QUALITY_CONFIG, IMBALANCE_CONFIG, TRAIN_TEST_CONFIG
)
from ml_service.utils import DataLoader, DataPreprocessor, ModelManager, DataValidator

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Train ML models untuk prediksi kelayakan pinjaman dan saran bunga dengan validasi komprehensif"

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Perform validation tanpa menyimpan model'
        )
        parser.add_argument(
            '--test-split',
            type=float,
            default=0.2,
            help='Test split ratio (default: 0.2)'
        )
        parser.add_argument(
            '--skip-validation',
            action='store_true',
            help='Skip comprehensive validation'
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS("=" * 70))
        self.stdout.write(self.style.SUCCESS("Starting Comprehensive Loan Model Training"))
        self.stdout.write(self.style.SUCCESS("=" * 70))
        
        try:
            # 1. Load data
            self.stdout.write("\n[1/8] Loading training data from database...")
            df = DataLoader.fetch_training_data(TRAINING_DATA_QUERY)
            
            # 2. Comprehensive Data Validation
            if not options['skip_validation']:
                self.stdout.write("\n[2/8] Comprehensive data validation...")
                validation_result = DataValidator.validate_complete(df, stage='training')
                
                self.stdout.write(self.style.SUCCESS(f"[CHECK] Data validation results:"))
                if validation_result['issues']:
                    self.stdout.write(self.style.ERROR("[X] CRITICAL ISSUES:"))
                    for issue in validation_result['issues']:
                        self.stdout.write(f"   - {issue}")
                    self.stdout.write(self.style.ERROR("Training aborted due to critical issues"))
                    return
                
                if validation_result['warnings']:
                    self.stdout.write(self.style.WARNING("[WARNING] WARNINGS:"))
                    for warning in validation_result['warnings']:
                        self.stdout.write(f"   - {warning}")
                
                # Display statistics
                stats = validation_result['statistics']
                self.stdout.write(f"Data split complete")
                self.stdout.write(f"  * Total samples: {stats['total_samples']}")
                self.stdout.write(f"  * Total features: {stats['total_features']}")
                
                if 'class_distribution' in stats:
                    dist = stats['class_distribution']
                    self.stdout.write(f"  * Success ratio: {dist['success_ratio']*100:.1f}%")
                    self.stdout.write(f"    - Successful: {dist['success_count']}, Failed: {dist['failure_count']}")
            else:
                self.stdout.write("\n[2/8] Skipping data validation (--skip-validation)")
            
            # 3. Data Leakage Check
            self.stdout.write("\n[3/8] Checking for data leakage...")
            leakage_issues = DataValidator.check_data_leakage(df)
            if leakage_issues:
                for issue in leakage_issues:
                    severity = issue.get('severity', 'INFO')
                    if severity == 'HIGH':
                        self.stdout.write(self.style.ERROR(
                            f"   [WARNING] {issue.get('type')}: {issue.get('message', '')}"
                        ))
            else:
                self.stdout.write(self.style.SUCCESS("   [CHECK] No data leakage detected"))
            
            # 4. Feature Engineering & Preprocessing
            self.stdout.write("\n[4/8] Feature engineering...")
            df = DataPreprocessor.create_features(df)
            X, y_clf, y_reg, df_processed = DataPreprocessor.prepare_training_data(df)
            self.stdout.write(self.style.SUCCESS(f"Features created successfully: {X.shape[1]} features, {X.shape[0]} rows"))
            # 5. Check Class Imbalance
            self.stdout.write("\n[5/8] Analyzing class imbalance...")
            imbalance_info = DataValidator.check_class_imbalance(y_clf)
            
            self.stdout.write(f"  • Class 1 (Success): {imbalance_info['class_1_count']} ({imbalance_info['class_1_ratio']*100:.1f}%)")
            self.stdout.write(f"  • Imbalance ratio: {imbalance_info['imbalance_ratio']:.2f}x")
            
            if imbalance_info['needs_balancing']:
                self.stdout.write(self.style.WARNING(
                    f"  [!]  Class imbalance detected - will use class_weight='balanced'"
                ))
            else:
                self.stdout.write(self.style.SUCCESS("  [OK] Classes relatively balanced"))
            
            # 6. Train-Test Split (dengan stratification untuk preserve class distribution)
            self.stdout.write("\n[6/8] Splitting data...")
            test_split = options['test_split']
            
            X_train, X_test, y_clf_train, y_clf_test, y_reg_train, y_reg_test = train_test_split(
                X, y_clf, y_reg,
                test_size=test_split,
                random_state=TRAIN_TEST_CONFIG['random_state'],
                stratify=y_clf if TRAIN_TEST_CONFIG['stratify'] else None
            )
            
            self.stdout.write(self.style.SUCCESS(f"[OK] Data split complete"))
            self.stdout.write(f"  • Train set: {len(X_train)} samples ({(1-test_split)*100:.0f}%)")
            self.stdout.write(f"  • Test set: {len(X_test)} samples ({test_split*100:.0f}%)")
            
            # 7. Train Models
            self.stdout.write("\n[7/8] Training models...")
            
            # Train Classifier
            self.stdout.write("  • Training Classifier (RandomForest with class_weight='balanced')...")
            classifier = RandomForestClassifier(**MODEL_CONFIG['classifier'])
            classifier.fit(X_train, y_clf_train)
            
            # Evaluate Classifier
            y_pred_clf = classifier.predict(X_test)
            y_pred_proba = classifier.predict_proba(X_test)[:, 1]
            clf_score = roc_auc_score(y_clf_test, y_pred_proba)
            f1 = f1_score(y_clf_test, y_pred_clf)
            
            self.stdout.write(f"    Classifier trained")
            self.stdout.write(f"      • ROC-AUC: {clf_score:.4f}")
            self.stdout.write(f"      • F1-Score: {f1:.4f}")
            
            # Show Classification Report
            self.stdout.write("\n    [INFO] Classification Report:")
            clf_report = classification_report(y_clf_test, y_pred_clf, 
                                              target_names=['Failed', 'Success'],
                                              digits=3)
            for line in clf_report.split('\n'):
                if line.strip():
                    self.stdout.write(f"    {line}")
            
            # Feature Importance
            self.stdout.write("\n    [INFO] Top 5 Important Features:")
            feature_importance = sorted(
                zip(X.columns, classifier.feature_importances_),
                key=lambda x: x[1],
                reverse=True
            )[:5]
            for i, (feat, importance) in enumerate(feature_importance, 1):
                self.stdout.write(f"    {i}. {feat}: {importance:.4f}")
            
            # Train Regressor
            self.stdout.write("\n  • Training Regressor (RandomForest for Interest Rate)...")
            regressor = RandomForestRegressor(**MODEL_CONFIG['regressor'])
            regressor.fit(X_train, y_reg_train)
            
            # Evaluate Regressor
            y_pred_reg = regressor.predict(X_test)
            reg_mae = mean_absolute_error(y_reg_test, y_pred_reg)
            reg_rmse = np.sqrt(mean_squared_error(y_reg_test, y_pred_reg))
            reg_mape = np.mean(np.abs((y_reg_test - y_pred_reg) / (y_reg_test + 0.001))) * 100
            
            self.stdout.write(f"    Regressor trained")
            self.stdout.write(f"      • MAE: {reg_mae:.4f}%")
            self.stdout.write(f"      • RMSE: {reg_rmse:.4f}%")
            self.stdout.write(f"      • MAPE: {reg_mape:.2f}%")
            
            # 8. Save Model
            if not options['dry_run']:
                self.stdout.write("\n[8/8] Saving model...")
                
                manager = ModelManager()
                model_data = {
                    'classifier': classifier,
                    'regressor': regressor,
                    'feature_names': X.columns.tolist(),
                    'training_date': datetime.now().isoformat(),
                    'model_info': {
                        'classifier_roc_auc': float(clf_score),
                        'classifier_f1': float(f1),
                        'regressor_mae': float(reg_mae),
                        'regressor_rmse': float(reg_rmse),
                        'regressor_mape': float(reg_mape),
                        'training_samples': len(X_train),
                        'test_samples': len(X_test),
                        'imbalance_ratio': float(imbalance_info['imbalance_ratio']),
                        'class_distribution': {
                            'success_ratio': float(imbalance_info['class_1_ratio']),
                            'fail_ratio': float(imbalance_info['class_0_ratio'])
                        }
                    }
                }
                
                model_path = manager.save_model(model_data)
                manager.cleanup_old_models(keep_latest=5)
                
                self.stdout.write(self.style.SUCCESS(f"Model saved successfully"))
                self.stdout.write(f"  • Path: {model_path}")
                
                # Log training summary
                logger.info(f"""
                [OK] Model Training Complete:
                - Samples: {len(X_train)} train, {len(X_test)} test
                - Classifier ROC-AUC: {clf_score:.4f}, F1: {f1:.4f}
                - Regressor MAE: {reg_mae:.4f}%, RMSE: {reg_rmse:.4f}%
                - Features: {len(X.columns)}, Imbalance ratio: {imbalance_info['imbalance_ratio']:.2f}x
                """)
            else:
                self.stdout.write("\n[8/8] Dry-run mode - model not saved")
            
            self.stdout.write("\n" + self.style.SUCCESS("=" * 70))
            self.stdout.write(self.style.SUCCESS("[OK] Training completed successfully!"))
            self.stdout.write(self.style.SUCCESS("=" * 70))
            
        except Exception as e:
            logger.error(f"Training failed: {str(e)}", exc_info=True)
            self.stdout.write(self.style.ERROR(f"\n[X] Training failed: {str(e)}"))
            raise
