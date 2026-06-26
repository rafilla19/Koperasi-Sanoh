"""
Management Command: Train Loan Model
XGBoost classifier with SMOTE oversampling for loan eligibility prediction
"""
import pandas as pd
import numpy as np
import logging
from datetime import datetime
from django.core.management.base import BaseCommand
from xgboost import XGBClassifier
from sklearn.model_selection import train_test_split, StratifiedKFold, cross_validate
from sklearn.metrics import classification_report, roc_auc_score, f1_score
from imblearn.over_sampling import SMOTE
from imblearn.pipeline import Pipeline as ImbPipeline

from ml_service.config import (
    TRAINING_DATA_QUERY, MODEL_CONFIG, FEATURE_NAMES, TRAIN_TEST_CONFIG
)
from ml_service.utils import DataLoader, DataPreprocessor, ModelManager, DataValidator

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Train XGBoost + SMOTE model untuk prediksi kelayakan pinjaman"

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
        self.stdout.write(self.style.SUCCESS("Starting XGBoost + SMOTE Loan Model Training"))
        self.stdout.write(self.style.SUCCESS("=" * 70))

        try:
            # 1. Load data
            self.stdout.write("\n[1/7] Loading training data from database...")
            df = DataLoader.fetch_training_data(TRAINING_DATA_QUERY)
            self.stdout.write(f"  Data loaded: {df.shape[0]} rows, {df.shape[1]} columns")
            self.stdout.write(f"  Missing values: {df.isnull().sum().sum()}")

            # 2. Validation
            if not options['skip_validation']:
                self.stdout.write("\n[2/7] Data validation...")
                validation_result = DataValidator.validate_complete(df, stage='training')

                if validation_result['issues']:
                    self.stdout.write(self.style.ERROR("[X] CRITICAL ISSUES:"))
                    for issue in validation_result['issues']:
                        self.stdout.write(f"   - {issue}")
                    self.stdout.write(self.style.ERROR("Training aborted"))
                    return

                if validation_result['warnings']:
                    self.stdout.write(self.style.WARNING("[!] WARNINGS:"))
                    for warning in validation_result['warnings']:
                        self.stdout.write(f"   - {warning}")

                stats = validation_result['statistics']
                self.stdout.write(f"  Total samples: {stats['total_samples']}")
                if 'class_distribution' in stats:
                    dist = stats['class_distribution']
                    self.stdout.write(f"  Eligible: {dist['eligible_count']} | Risky: {dist['risky_count']}")
                    self.stdout.write(f"  Eligible ratio: {dist['eligible_ratio']*100:.1f}%")
            else:
                self.stdout.write("\n[2/7] Skipping validation (--skip-validation)")

            # 3. Data leakage check
            self.stdout.write("\n[3/7] Checking for data leakage...")
            leakage_issues = DataValidator.check_data_leakage(df)
            if leakage_issues:
                for issue in leakage_issues:
                    self.stdout.write(self.style.ERROR(f"   [!] {issue.get('type')}: {issue.get('count')} records"))
            else:
                self.stdout.write(self.style.SUCCESS("   No data leakage detected"))

            # 4. Prepare features
            self.stdout.write("\n[4/7] Preparing features...")
            X, y, df_processed = DataPreprocessor.prepare_training_data(df)
            self.stdout.write(f"  Features: {X.shape[1]} | Samples: {X.shape[0]}")
            self.stdout.write(f"  Distribusi target:")
            self.stdout.write(f"    Eligible (1): {(y==1).sum()}")
            self.stdout.write(f"    Risky (0): {(y==0).sum()}")
            self.stdout.write(f"    Rasio eligible: {y.mean():.2%}")

            # 5. Cross-validation with SMOTE pipeline
            self.stdout.write("\n[5/7] 5-Fold Stratified Cross Validation (SMOTE in each fold)...")

            smote_pipeline = ImbPipeline([
                ('smote', SMOTE(**MODEL_CONFIG['smote'])),
                ('model', XGBClassifier(**MODEL_CONFIG['classifier']))
            ])

            cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
            scoring = {
                'accuracy': 'accuracy',
                'f1_macro': 'f1_macro',
            }

            cv_results = cross_validate(smote_pipeline, X, y, cv=cv, scoring=scoring, return_train_score=True)

            self.stdout.write(self.style.SUCCESS("  Cross-validation results:"))
            for metric in scoring:
                train_mean = cv_results[f'train_{metric}'].mean()
                test_mean = cv_results[f'test_{metric}'].mean()
                test_std = cv_results[f'test_{metric}'].std()
                self.stdout.write(f"    {metric}: Train={train_mean:.4f} | Test={test_mean:.4f} (+/- {test_std:.4f})")

            # 6. Hold-out test evaluation
            self.stdout.write("\n[6/7] Hold-out test evaluation...")
            test_split = options['test_split']
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=test_split,
                random_state=TRAIN_TEST_CONFIG['random_state'],
                stratify=y
            )

            smote_train = SMOTE(**MODEL_CONFIG['smote'])
            X_train_sm, y_train_sm = smote_train.fit_resample(X_train, y_train)

            self.stdout.write(f"  Train BEFORE SMOTE: {len(y_train)} ({(y_train==0).sum()} risky, {(y_train==1).sum()} eligible)")
            self.stdout.write(f"  Train AFTER SMOTE:  {len(y_train_sm)} ({(y_train_sm==0).sum()} risky, {(y_train_sm==1).sum()} eligible)")
            self.stdout.write(f"  Test set (no SMOTE): {len(y_test)} ({(y_test==0).sum()} risky, {(y_test==1).sum()} eligible)")

            model = XGBClassifier(**MODEL_CONFIG['classifier'])
            model.fit(X_train_sm, y_train_sm)

            y_pred = model.predict(X_test)
            y_proba = model.predict_proba(X_test)[:, 1]

            try:
                auc = roc_auc_score(y_test, y_proba)
            except Exception:
                auc = 0.0
            f1 = f1_score(y_test, y_pred, average='macro', zero_division=0)

            self.stdout.write(f"\n  Hold-out metrics:")
            self.stdout.write(f"    AUC-ROC: {auc:.4f}")
            self.stdout.write(f"    F1 Macro: {f1:.4f}")

            self.stdout.write("\n  Classification Report:")
            clf_report = classification_report(
                y_test, y_pred,
                target_names=['Risky (0)', 'Eligible (1)'],
                zero_division=0
            )
            for line in clf_report.split('\n'):
                if line.strip():
                    self.stdout.write(f"    {line}")

            # Feature importance
            importances = model.feature_importances_
            feat_imp = sorted(zip(X.columns, importances), key=lambda x: x[1], reverse=True)
            self.stdout.write("\n  Top 5 Important Features:")
            for i, (feat, imp) in enumerate(feat_imp[:5], 1):
                self.stdout.write(f"    {i}. {feat}: {imp:.4f}")

            # 7. Train final model on all data + SMOTE
            self.stdout.write("\n[7/7] Training final model on all data + SMOTE...")
            smote_final = SMOTE(**MODEL_CONFIG['smote'])
            X_final, y_final = smote_final.fit_resample(X, y)

            final_model = XGBClassifier(**MODEL_CONFIG['classifier'])
            final_model.fit(X_final, y_final)

            self.stdout.write(f"  Final model trained on {len(y_final)} samples (after SMOTE)")
            self.stdout.write(f"    Eligible: {(y_final==1).sum()} | Risky: {(y_final==0).sum()}")

            if not options['dry_run']:
                self.stdout.write("\n  Saving model...")

                manager = ModelManager()
                model_data = {
                    'classifier': final_model,
                    'feature_names': X.columns.tolist(),
                    'training_date': datetime.now().isoformat(),
                    'model_info': {
                        'algorithm': 'XGBoost + SMOTE',
                        'cv_accuracy': float(cv_results['test_accuracy'].mean()),
                        'cv_f1_macro': float(cv_results['test_f1_macro'].mean()),
                        'holdout_roc_auc': float(auc),
                        'holdout_f1_macro': float(f1),
                        'training_samples_original': len(y),
                        'training_samples_smote': len(y_final),
                        'test_samples': len(y_test),
                        'n_features': len(X.columns),
                        'feature_names': X.columns.tolist(),
                    }
                }

                model_path = manager.save_model(model_data)
                manager.cleanup_old_models(keep_latest=5)

                self.stdout.write(self.style.SUCCESS(f"  Model saved: {model_path}"))

                logger.info(
                    f"Model Training Complete: "
                    f"Holdout AUC={auc:.4f}, F1={f1:.4f}, "
                    f"Features={len(X.columns)}"
                )
            else:
                self.stdout.write("\n  Dry-run mode - model not saved")

            self.stdout.write("\n" + self.style.SUCCESS("=" * 70))
            self.stdout.write(self.style.SUCCESS("Training completed successfully!"))
            self.stdout.write(self.style.SUCCESS("=" * 70))

        except Exception as e:
            logger.error(f"Training failed: {str(e)}", exc_info=True)
            self.stdout.write(self.style.ERROR(f"\n[X] Training failed: {str(e)}"))
            raise
