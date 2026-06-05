import logging
from django.conf import settings
from django.core.mail import send_mail
from api.models import Members
from api.utils.email import send_styled_email

logger = logging.getLogger(__name__)


def send_member_notification_email(member_id, subject, message):
    """Send notification email to the member's email address stored in the users table."""
    try:
        member = Members.objects.select_related('user').get(id=member_id)
    except Members.DoesNotExist:
        logger.warning('Cannot send email: member %s does not exist', member_id)
        return False

    email = None
    if hasattr(member, 'user') and member.user:
        email = member.user.email
    elif getattr(member, 'user_id', None):
        from django.db import connection
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT email FROM users WHERE id = %s', [member.user_id])
                row = cursor.fetchone()
                email = row[0] if row else None
        except Exception as exc:
            logger.warning('Failed to load user email for member %s: %s', member_id, exc)
            return False

    if not email:
        logger.warning('Member %s has no email address configured', member_id)
        return False

    recipient = email

    try:
        send_styled_email(
            subject=subject,
            recipient=recipient,
            intro=message,
            plain_fallback=message,
        )
        return True
    except Exception as exc:
        logger.error('Failed to send email to %s: %s', recipient, exc)
        return False
