import logging
from django.core.management.base import BaseCommand
from ml_service.shu_trainer import train_model

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Train model Linear Regression untuk prediksi SHU anggota"

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Validasi dan training tanpa menyimpan .pkl',
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS("=" * 60))
        self.stdout.write(self.style.SUCCESS("  SHU Forecasting Model Training"))
        self.stdout.write(self.style.SUCCESS("=" * 60))

        try:
            dry_run = options['dry_run']
            result = train_model(dry_run=dry_run)
            info = result['model_info']

            self.stdout.write("")
            self.stdout.write(self.style.SUCCESS("Training Results:"))
            self.stdout.write(f"  Samples      : {info['training_samples']}")
            self.stdout.write(f"  R-squared    : {info['r_squared']}")
            self.stdout.write(f"  MAE          : Rp {info['mae']:,.0f}")
            self.stdout.write(f"  RMSE         : Rp {info['rmse']:,.0f}")
            self.stdout.write("")
            self.stdout.write("  Coefficients:")
            for name, val in info['coef'].items():
                self.stdout.write(f"    {name:25s} : {val}")
            self.stdout.write(f"    {'intercept':25s} : {info['intercept']}")

            if dry_run:
                self.stdout.write(self.style.WARNING("\n  Dry-run mode — model NOT saved"))
            else:
                self.stdout.write(self.style.SUCCESS("\n  Model saved to ml_service/models/"))

            self.stdout.write(self.style.SUCCESS("=" * 60))

        except Exception as e:
            logger.error(f"SHU training failed: {e}", exc_info=True)
            self.stdout.write(self.style.ERROR(f"\n  Training failed: {e}"))
            raise
