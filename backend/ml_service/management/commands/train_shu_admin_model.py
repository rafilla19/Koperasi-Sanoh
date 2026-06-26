import logging
from django.core.management.base import BaseCommand
from ml_service.shu_admin_trainer import train_model

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Train model XGBoost untuk prediksi SHU admin dashboard"

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Validasi dan training tanpa menyimpan .pkl',
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write(self.style.SUCCESS("  SHU Admin XGBoost Model Training"))
        self.stdout.write(self.style.SUCCESS("=" * 60))

        try:
            dry_run = options['dry_run']
            result = train_model(dry_run=dry_run)
            info = result['model_info']

            self.stdout.write("")
            self.stdout.write(self.style.SUCCESS("Training Results:"))
            self.stdout.write(f"  Algorithm    : {info['algorithm']}")
            self.stdout.write(f"  Samples      : {info['training_samples']}")
            self.stdout.write(f"  R-squared    : {info['r_squared']}")
            self.stdout.write(f"  MAE          : Rp {info['mae']:,.0f}")
            self.stdout.write(f"  RMSE         : Rp {info['rmse']:,.0f}")

            if info.get('cv_scores'):
                self.stdout.write(f"  CV Scores    : {info['cv_scores']}")
                self.stdout.write(f"  CV Mean      : {info['cv_mean']}")

            self.stdout.write("")
            self.stdout.write("  Feature Importance:")
            for name, val in info['feature_importance'].items():
                bar = '#' * int(val * 40)
                self.stdout.write(f"    {name:20s} : {val:.4f}  {bar}")

            if dry_run:
                self.stdout.write(self.style.WARNING("\n  Dry-run mode - model NOT saved"))
            else:
                self.stdout.write(self.style.SUCCESS("\n  Model saved to ml_service/models/"))

            self.stdout.write(self.style.SUCCESS("=" * 60))

        except Exception as e:
            logger.error(f"SHU admin training failed: {e}", exc_info=True)
            self.stdout.write(self.style.ERROR(f"\n  Training failed: {e}"))
            raise
