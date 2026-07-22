import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("saving", "0001_initial"),
        ("member", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="MemberSavingsConfig",
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
                (
                    "voluntary_amount",
                    models.DecimalField(decimal_places=2, default=0, max_digits=15),
                ),
                ("is_payroll", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "member",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.DO_NOTHING,
                        related_name="savings_config",
                        to="member.member",
                    ),
                ),
            ],
            options={
                "db_table": "member_savings_configs",
                "managed": True,
            },
        ),
        migrations.CreateModel(
            name="Notifications",
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
                ("title", models.CharField(max_length=100)),
                ("message", models.TextField()),
                (
                    "notification_type",
                    models.CharField(
                        choices=[
                            ("voluntary_approved", "Voluntary Savings Approved"),
                            ("voluntary_rejected", "Voluntary Savings Rejected"),
                            ("bill_generated", "Bill Generated"),
                        ],
                        max_length=50,
                    ),
                ),
                ("reference_id", models.IntegerField(blank=True, null=True)),
                ("is_read", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "member",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.DO_NOTHING,
                        to="member.member",
                    ),
                ),
            ],
            options={
                "db_table": "notifications",
                "managed": True,
            },
        ),
    ]
