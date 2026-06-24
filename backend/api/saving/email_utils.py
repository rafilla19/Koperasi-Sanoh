import logging
from django.conf import settings
from django.db import connection
from api.models import Members, MemberBankAccounts
from api.utils.email import send_styled_email

logger = logging.getLogger(__name__)

def _get_member_email(member):
    """Resolve email address from a Member instance."""
    if hasattr(member, 'user') and member.user:
        return member.user.email
    if getattr(member, 'user_id', None):
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT email FROM users WHERE id = %s', [member.user_id])
                row = cursor.fetchone()
                return row[0] if row else None
        except Exception as exc:
            logger.warning('Failed to load user email for member %s: %s', member.id, exc)
    return None


def send_member_notification_email(member_id, subject, message):
    """Send notification email to the member's email address stored in the users table."""
    try:
        member = Members.objects.select_related('user').get(id=member_id)
    except Members.DoesNotExist:
        logger.warning('Cannot send email: member %s does not exist', member_id)
        return False

    email = _get_member_email(member)
    if not email:
        logger.warning('Member %s has no email address configured', member_id)
        return False

    try:
        send_styled_email(
            subject=subject,
            recipient=email,
            intro=message,
            plain_fallback=message,
        )
        return True
    except Exception as exc:
        logger.error('Failed to send email to %s: %s', email, exc)
        return False


def send_withdrawal_paid_email(withdrawal, proof_url):
    """Send a detailed withdrawal payment notification email to the member."""
    member = withdrawal.member
    email = _get_member_email(member)
    if not email:
        logger.warning('Member %s has no email address configured', member.id)
        return False

    amount_formatted = f"Rp {int(withdrawal.amount):,}".replace(',', '.')

    bank_account = MemberBankAccounts.objects.filter(member=member).first()
    bank_name = '-'
    account_number = '-'
    account_holder = '-'
    if bank_account:
        account_number = bank_account.account_number or '-'
        account_holder = bank_account.account_holder_name or '-'
        if getattr(bank_account, 'bank_id', None):
            try:
                with connection.cursor() as cursor:
                    cursor.execute('SELECT bank_name FROM banks WHERE id = %s', [bank_account.bank_id])
                    row = cursor.fetchone()
                    bank_name = row[0] if row else '-'
            except Exception:
                pass

    paid_date = '-'
    if withdrawal.paid_date:
        paid_date = withdrawal.paid_date.strftime('%d %B %Y, %H:%M WIB')

    request_date = '-'
    if withdrawal.request_date:
        request_date = withdrawal.request_date.strftime('%d %B %Y')

    subject = 'Penarikan Simpanan Anda Telah Dibayar'
    intro = (
        f'Halo {member.full_name},\n\n'
        f'Penarikan simpanan sukarela Anda telah berhasil dibayarkan. '
        f'Berikut adalah detail pembayarannya:'
    )

    details = [
        ('ID Penarikan', f'#{withdrawal.id}'),
        ('Tanggal Pengajuan', request_date),
        ('Tanggal Pembayaran', paid_date),
        ('Bank Tujuan', bank_name),
        ('No. Rekening', account_number),
        ('Atas Nama', account_holder),
    ]
    if withdrawal.notes:
        details.append(('Catatan', withdrawal.notes))

    highlight = ('Jumlah Dibayarkan', amount_formatted)

    frontend_url = getattr(settings, 'FRONTEND_BASE_URL', '') or ''
    cta_url = f'{frontend_url}/dashboard/saving' if frontend_url else None
    cta_label = 'Lihat Status Penarikan' if cta_url else None

    footer_note = (
        'Jika Anda merasa tidak melakukan pengajuan penarikan ini, '
        'segera hubungi pengurus koperasi.'
    )

    plain_fallback = (
        f'Halo {member.full_name},\n\n'
        f'Penarikan simpanan sukarela Anda telah dibayarkan.\n\n'
        f'ID Penarikan: #{withdrawal.id}\n'
        f'Jumlah: {amount_formatted}\n'
        f'Tanggal Pengajuan: {request_date}\n'
        f'Tanggal Pembayaran: {paid_date}\n'
        f'Bank Tujuan: {bank_name}\n'
        f'No. Rekening: {account_number}\n'
        f'Atas Nama: {account_holder}\n'
        f'Bukti Transfer: {proof_url}\n\n'
        f'Silakan cek status penarikan Anda di dashboard.'
    )

    try:
        send_styled_email(
            subject=subject,
            recipient=email,
            intro=intro,
            details=details,
            highlight=highlight,
            cta_label=cta_label,
            cta_url=cta_url,
            footer_note=footer_note,
            plain_fallback=plain_fallback,
            image_url=proof_url,
            image_label='Bukti Transfer',
        )
        logger.info('Withdrawal paid email sent to %s for withdrawal #%s', email, withdrawal.id)
        return True
    except Exception as exc:
        logger.error('Failed to send withdrawal paid email to %s: %s', email, exc)
        return False


def send_shu_paid_email(dist, proof_url):
    """Send SHU Jasa Modal transfer notification email to the member."""
    member = dist.member
    email = _get_member_email(member)
    if not email:
        logger.warning('Member %s has no email address configured', member.id)
        return False

    shu_formatted = f"Rp {int(dist.total_shu):,}".replace(',', '.')

    bank_name = '-'
    account_number = '-'
    account_holder = '-'
    bank_account = MemberBankAccounts.objects.filter(member=member).first()
    if bank_account:
        account_number = bank_account.account_number or '-'
        account_holder = bank_account.account_holder_name or '-'
        if getattr(bank_account, 'bank_id', None):
            try:
                with connection.cursor() as cursor:
                    cursor.execute('SELECT bank_name FROM banks WHERE id = %s', [bank_account.bank_id])
                    row = cursor.fetchone()
                    bank_name = row[0] if row else '-'
            except Exception:
                pass

    paid_date = '-'
    if dist.paid_at:
        paid_date = dist.paid_at.strftime('%d %B %Y, %H:%M WIB')

    subject = 'SHU Jasa Modal Anda Telah Ditransfer'
    intro = (
        f'Halo {member.full_name},\n\n'
        f'SHU Jasa Modal periode {dist.period_year} Anda telah berhasil ditransfer. '
        f'Berikut adalah detail transfer:'
    )

    details = [
        ('No. Referensi', dist.tf_reference_id or '-'),
        ('Periode', str(dist.period_year or '-')),
        ('Total Simpanan', f"Rp {int(dist.total_savings):,}".replace(',', '.')),
        ('Tanggal Transfer', paid_date),
        ('Bank Tujuan', bank_name),
        ('No. Rekening', account_number),
        ('Atas Nama', account_holder),
    ]
    if dist.notes:
        details.append(('Catatan', dist.notes))

    highlight = ('SHU Jasa Modal Diterima', shu_formatted)

    frontend_url = getattr(settings, 'FRONTEND_BASE_URL', '') or ''
    cta_url = f'{frontend_url}/dashboard/shu' if frontend_url else None
    cta_label = 'Lihat Detail SHU' if cta_url else None

    footer_note = (
        'Jika Anda merasa ada kesalahan pada informasi di atas, '
        'segera hubungi pengurus koperasi.'
    )

    plain_fallback = (
        f'Halo {member.full_name},\n\n'
        f'SHU Jasa Modal periode {dist.period_year} Anda telah ditransfer.\n\n'
        f'No. Referensi: {dist.tf_reference_id or "-"}\n'
        f'SHU Jasa Modal: {shu_formatted}\n'
        f'Total Simpanan: {f"Rp {int(dist.total_savings):,}".replace(",", ".")}\n'
        f'Tanggal Transfer: {paid_date}\n'
        f'Bank Tujuan: {bank_name}\n'
        f'No. Rekening: {account_number}\n'
        f'Atas Nama: {account_holder}\n'
        f'Bukti Transfer: {proof_url}\n\n'
        f'Silakan cek detail SHU Anda di dashboard.'
    )

    try:
        send_styled_email(
            subject=subject,
            recipient=email,
            intro=intro,
            details=details,
            highlight=highlight,
            cta_label=cta_label,
            cta_url=cta_url,
            footer_note=footer_note,
            plain_fallback=plain_fallback,
            image_url=proof_url,
            image_label='Bukti Transfer',
        )
        logger.info('SHU paid email sent to %s for distribution #%s', email, dist.id)
        return True
    except Exception as exc:
        logger.error('Failed to send SHU paid email to %s: %s', email, exc)
        return False
