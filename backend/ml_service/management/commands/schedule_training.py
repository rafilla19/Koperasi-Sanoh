"""
Management Command: Schedule Model Training
Automatic retraining trigger berdasarkan kondisi:
1. Waktu tertentu (misal: daily, weekly)
2. Jumlah data baru mencapai threshold
"""
import logging
from datetime import datetime, timedelta
from django.core.management.base import BaseCommand
from django.db import connection
from django.conf import settings

from ml_service.config import AUTO_RETRAIN_CONFIG
from ml_service.utils import ModelManager

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Schedule atau check kapan model perlu di-retrain"

    def add_arguments(self, parser):
        parser.add_argument(
            '--force',
            action='store_true',
            help='Force retraining regardless of conditions'
        )
        parser.add_argument(
            '--check-only',
            action='store_true',
            help='Only check if retraining is needed, do not retrain'
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS("Checking model retraining requirements..."))
        
        try:
            should_retrain = options['force']
            
            if not should_retrain:
                should_retrain, reason = self.check_retrain_conditions()
                if reason:
                    self.stdout.write(f"Reason: {reason}")
            else:
                self.stdout.write("Force retrain mode enabled")
            
            if options['check_only']:
                self.stdout.write(f"\n✓ Check complete")
                self.stdout.write(f"  - Retrain needed: {'YES' if should_retrain else 'NO'}")
                return
            
            if should_retrain:
                self.stdout.write("\n[RETRAINING] Starting model training...")
                from django.core.management import call_command
                call_command('train_loan_model')
                
                # Update last training timestamp
                self.update_training_timestamp()
                logger.info("Model retrained successfully")
            else:
                self.stdout.write("\n✓ Model is up-to-date, no retraining needed")
        
        except Exception as e:
            logger.error(f"Error in schedule_training: {str(e)}")
            self.stdout.write(self.style.ERROR(f"Error: {str(e)}"))

    def check_retrain_conditions(self):
        """
        Check apakah retraining diperlukan berdasarkan kondisi.
        
        Returns:
            tuple: (should_retrain, reason_message)
        """
        # 1. Check if model exists
        manager = ModelManager()
        models = manager.list_models()
        
        if not models:
            return True, "No trained model found"
        
        # 2. Check last training time
        last_training_date = self.get_last_training_timestamp()
        if last_training_date is None:
            return True, "Never trained"
        
        days_since_training = (datetime.now() - last_training_date).days
        retrain_interval = AUTO_RETRAIN_CONFIG['retrain_interval_days']
        
        if days_since_training >= retrain_interval:
            return True, f"Last training was {days_since_training} days ago (threshold: {retrain_interval})"
        
        # 3. Check new data count
        new_records_count = self.get_new_data_count(last_training_date)
        min_new_records = AUTO_RETRAIN_CONFIG['min_new_records']
        
        if new_records_count >= min_new_records:
            return True, f"Found {new_records_count} new loan records (threshold: {min_new_records})"
        
        # 4. Check data quality
        is_quality_ok = self.check_data_quality()
        if not is_quality_ok:
            return True, "Data quality issues detected"
        
        return False, None

    def get_new_data_count(self, since_date):
        """
        Hitung jumlah data baru sejak training terakhir.
        
        Args:
            since_date (datetime): Tanggal training terakhir
            
        Returns:
            int: Jumlah loan baru
        """
        try:
            query = """
            SELECT COUNT(*) as count
            FROM loans
            WHERE created_at > %s
                AND status_id IN (26, 27)
                AND deleted_at IS NULL
            """
            
            with connection.cursor() as cursor:
                cursor.execute(query, [since_date])
                result = cursor.fetchone()
                count = result[0] if result else 0
            
            return count
        except Exception as e:
            logger.error(f"Error counting new data: {str(e)}")
            return 0

    def check_data_quality(self):
        """
        Check kondisi data untuk training.
        
        Returns:
            bool: Data quality OK
        """
        try:
            query = """
            SELECT 
                COUNT(*) as total_loans,
                COUNT(CASE WHEN principal_amount > 0 THEN 1 END) as valid_principal,
                COUNT(CASE WHEN interest_amount >= 0 THEN 1 END) as valid_interest
            FROM loans
            WHERE status_id IN (26, 27)
                AND deleted_at IS NULL
            """
            
            with connection.cursor() as cursor:
                cursor.execute(query)
                result = cursor.fetchone()
                
                if not result:
                    return False
                
                total, valid_principal, valid_interest = result
                
                # At least 80% data harus valid
                if total > 0:
                    quality_score = (valid_principal + valid_interest) / (2 * total)
                    return quality_score >= 0.8
                
                return False
        except Exception as e:
            logger.error(f"Error checking data quality: {str(e)}")
            return False

    def get_last_training_timestamp(self):
        """
        Ambil timestamp training terakhir dari model metadata.
        
        Returns:
            datetime atau None
        """
        try:
            manager = ModelManager()
            metadata = manager.get_model_info()
            
            if metadata and 'training_date' in metadata:
                from dateutil import parser
                return parser.parse(metadata['training_date'])
            
            return None
        except Exception as e:
            logger.error(f"Error getting last training time: {str(e)}")
            return None

    def update_training_timestamp(self):
        """
        Update timestamp training untuk tracking.
        """
        try:
            # Simpan ke file untuk reference
            import json
            import os
            
            timestamp_file = os.path.join(
                settings.BASE_DIR,
                'ml_service',
                'models',
                'last_training_timestamp.json'
            )
            
            with open(timestamp_file, 'w') as f:
                json.dump({
                    'last_training': datetime.now().isoformat()
                }, f)
        except Exception as e:
            logger.warning(f"Could not update training timestamp: {str(e)}")
