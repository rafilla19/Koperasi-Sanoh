import logging
from django.conf import settings
from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger
from django.core.management.base import BaseCommand
from django_apscheduler.jobstores import DjangoJobStore
from django_apscheduler.models import DjangoJobExecution
from django.core.management import call_command

logger = logging.getLogger(__name__)

def send_daily_reminders():
    logger.info("Running daily general reminders...")
    call_command('send_auto_reminders')

def send_outsourcing_reminders():
    logger.info("Running daily outsourcing reminders (3 days before)...")
    call_command('send_outsourcing_reminders')

def delete_old_job_executions(max_age=604_800):
    """This job deletes all apscheduler job executions older than `max_age` from the database."""
    DjangoJobExecution.objects.delete_old_job_executions(max_age)

class Command(BaseCommand):
    help = "Runs apscheduler."

    def handle(self, *args, **options):
        scheduler = BlockingScheduler(timezone=settings.TIME_ZONE)
        scheduler.add_jobstore(DjangoJobStore(), "default")

        # Job 1: General Overdue Reminders - Every day at 08:00
        scheduler.add_job(
            send_daily_reminders,
            trigger=CronTrigger(hour="08", minute="00"), 
            id="send_daily_reminders",
            max_instances=1,
            replace_existing=True,
        )
        logger.info("Added job 'send_daily_reminders'.")

        # Job 2: Outsourcing Reminders (3 days before) - Every day at 08:30
        scheduler.add_job(
            send_outsourcing_reminders,
            trigger=CronTrigger(hour="08", minute="30"),
            id="send_outsourcing_reminders",
            max_instances=1,
            replace_existing=True,
        )
        logger.info("Added job 'send_outsourcing_reminders'.")

        # Cleanup Job: Weekly on Monday
        scheduler.add_job(
            delete_old_job_executions,
            trigger=CronTrigger(day_of_week="mon", hour="00", minute="00"),
            id="delete_old_job_executions",
            max_instances=1,
            replace_existing=True,
        )
        logger.info("Added weekly job: 'delete_old_job_executions'.")

        try:
            logger.info("Starting scheduler...")
            scheduler.start()
        except KeyboardInterrupt:
            logger.info("Stopping scheduler...")
            scheduler.shutdown()
            logger.info("Scheduler shut down successfully!")
