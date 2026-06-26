from django.core.management.base import BaseCommand
from api.utils.email import send_styled_email
from django.conf import settings
from django.db import connection
import datetime

class Command(BaseCommand):
    help = 'Send payment reminders to OUTSOURCE members 3 days before their due date'

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('Starting Outsourcing reminder process (3 days before due)...'))
        
        try:
            # Query for installments due in exactly 3 days for OUTSOURCE members (ID 3)
            # Logic: due_date = CURRENT_DATE + 3 days
            query = """
            SELECT DISTINCT
                m.id as member_id,
                m.full_name,
                u.email,
                li.installment_number,
                li.due_date,
                li.amount_total
            FROM loans l
            INNER JOIN members m ON l.member_id = m.id
            INNER JOIN users u ON m.user_id = u.id
            INNER JOIN loan_installments li ON li.loan_id = l.id
            INNER JOIN employee_statuses es ON m.employee_status_id = es.id
            WHERE li.status_id = 28 -- Unpaid
              AND li.due_date = CURRENT_DATE + INTERVAL '3 days'
              AND (es.status_name = 'OUTSOURCE' OR es.status_name = 'OUTSOURCING')
              AND u.is_active = true
            """
            
            with connection.cursor() as cursor:
                cursor.execute(query)
                columns = [col[0] for col in cursor.description]
                results = [dict(zip(columns, row)) for row in cursor.fetchall()]
            
            if not results:
                self.stdout.write('No installments found due in 3 days for Outsource members.')
                return
            
            # Group by member
            members_map = {}
            for row in results:
                mid = row['member_id']
                if mid not in members_map:
                    members_map[mid] = {
                        'email': row['email'],
                        'full_name': row['full_name'],
                        'installments': []
                    }
                members_map[mid]['installments'].append(row)
            
            success_count = 0
            for mid, data in members_map.items():
                email = data['email']
                full_name = data['full_name']
                installments = data['installments']
                
                subject = "PENGINGAT - Pembayaran Pinjaman Jatuh Tempo 3 Hari Lagi"

                details = []
                for inst in installments:
                    details.append((f"Angsuran #{inst['installment_number']} ({inst['due_date']})", f"Rp {inst['amount_total']:,.0f}"))

                try:
                    send_styled_email(
                        subject=subject,
                        recipient=email,
                        intro=f"Halo {full_name}, ini adalah pengingat bahwa angsuran pinjaman Anda akan jatuh tempo dalam 3 hari.",
                        details=details,
                        highlight=("Angsuran Akan Datang", "Pastikan Anda memiliki dana yang cukup untuk menghindari denda keterlambatan."),
                        footer_note="Terima kasih atas kerja sama Anda."
                    )
                    success_count += 1
                    self.stdout.write(self.style.SUCCESS(f"Successfully sent to {email}"))
                except Exception as e:
                    self.stdout.write(self.style.ERROR(f"Failed to send to {email}: {str(e)}"))
            
            self.stdout.write(self.style.SUCCESS(f"Process finished. Total emails sent: {success_count}"))
            
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Error occurred: {str(e)}"))
