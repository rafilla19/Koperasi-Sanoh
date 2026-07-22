from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("shu", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="ShuPeriods",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("year", models.IntegerField(unique=True)),
                (
                    "total_profit",
                    models.DecimalField(decimal_places=2, default=0, max_digits=20),
                ),
                (
                    "total_savings_weight",
                    models.DecimalField(decimal_places=2, default=0, max_digits=5),
                ),
                (
                    "total_transaction_weight",
                    models.DecimalField(decimal_places=2, default=0, max_digits=5),
                ),
                (
                    "member_services_weight",
                    models.DecimalField(decimal_places=2, default=0, max_digits=5),
                ),
                (
                    "reserve_fund_weight",
                    models.DecimalField(decimal_places=2, default=0, max_digits=5),
                ),
                (
                    "social_fund_weight",
                    models.DecimalField(decimal_places=2, default=0, max_digits=5),
                ),
                (
                    "education_fund_weight",
                    models.DecimalField(decimal_places=2, default=0, max_digits=5),
                ),
                (
                    "management_weight",
                    models.DecimalField(decimal_places=2, default=0, max_digits=5),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("draft", "Draft"),
                            ("calculated", "Calculated"),
                            ("distributed", "Distributed"),
                            ("closed", "Closed"),
                        ],
                        default="draft",
                        max_length=20,
                    ),
                ),
                ("notes", models.TextField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "db_table": "shu_periods",
                "managed": True,
            },
        ),
    ]
