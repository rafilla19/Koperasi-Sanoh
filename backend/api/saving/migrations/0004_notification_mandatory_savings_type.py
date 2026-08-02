from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("saving", "0003_add_missing_models"),
    ]

    operations = [
        migrations.AlterField(
            model_name="notifications",
            name="notification_type",
            field=models.CharField(
                choices=[
                    ("voluntary_approved", "Voluntary Savings Approved"),
                    ("voluntary_rejected", "Voluntary Savings Rejected"),
                    ("bill_generated", "Bill Generated"),
                    ("mandatory_savings_updated", "Mandatory Savings Amount Updated"),
                ],
                max_length=50,
            ),
        ),
    ]
