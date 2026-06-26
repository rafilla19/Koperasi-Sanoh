from django.core.management.base import BaseCommand
from api.utils.email import send_styled_email
from django.conf import settings
from django.db import connection
import datetime

class Command(BaseCommand):
    help = 'Send automatic payment reminders to all members with overdue installments'

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('Starting automatic reminder process...'))
        
        try:
            # Query for overdue installments (Unpaid 28 or Macet 27)
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
            WHERE li.status_id IN (27, 28)
              AND li.due_date <= CURRENT_DATE
              AND u.is_active = true
            """
            
            with connection.cursor() as cursor:
                cursor.execute(query)
                columns = [col[0] for col in cursor.description]
                results = [dict(zip(columns, row)) for row in cursor.fetchall()]
            
            if not results:
                self.stdout.write('No overdue installments found.')
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
                
                subject = "PENGINGAT OTOMATIS SISTEM - Angsuran Pinjaman Jatuh Tempo"

                details = []
                for inst in installments:
                    details.append((f"Angsuran #{inst['installment_number']} ({inst['due_date']})", f"Rp {inst['amount_total']:,.0f}"))

                try:
                    send_styled_email(
                        subject=subject,
                        recipient=email,
                        intro=f"Halo {full_name}, ini adalah pengingat otomatis mengenai angsuran pinjaman Anda yang belum dibayar.",
                        details=details,
                        highlight=("Angsuran Jatuh Tempo", "Segera lunasi pembayaran ini."),
                        footer_note="Jika Anda memiliki pertanyaan, hubungi pengurus koperasi."
                    )
                    success_count += 1
                    self.stdout.write(self.style.SUCCESS(f"Successfully sent to {email}"))
                except Exception as e:
                    self.stdout.write(self.style.ERROR(f"Failed to send to {email}: {str(e)}"))
            
            self.stdout.write(self.style.SUCCESS(f"Process finished. Total emails sent: {success_count}"))
            
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Error occurred: {str(e)}"))
