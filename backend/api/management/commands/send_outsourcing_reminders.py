from django.core.management.base import BaseCommand
from django.core.mail import send_mail
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
                
                subject = "REMINDER - Loan Payment Due in 3 Days"
                
                # Group installments in HTML table
                inst_rows = ""
                for inst in installments:
                    inst_rows += f"<tr><td style='padding: 8px 0;'>#{inst['installment_number']}</td><td style='padding: 8px 0;'>{inst['due_date']}</td><td style='padding: 8px 0; text-align: right;'><strong>Rp {inst['amount_total']:,.0f}</strong></td></tr>"

                html_message = f"""
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
                    <h2 style="color: #3498db; border-bottom: 2px solid #3498db; padding-bottom: 10px;">Upcoming Payment Reminder</h2>
                    <p style="font-size: 16px; color: #34495e;">Dear {full_name},</p>
                    <p style="font-size: 15px; color: #34495e;">This is a friendly reminder that your loan installment is due in <strong>3 days</strong>.</p>
                    
                    <div style="background-color: #f0f7fd; padding: 15px; border-radius: 5px; margin: 20px 0; border: 1px solid #3498db;">
                        <h3 style="margin-top: 0; color: #2c3e50; font-size: 17px;">Upcoming Installments</h3>
                        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                            <tr style="border-bottom: 1px solid #3498db;"><th style="text-align: left; padding: 5px 0;">No</th><th style="text-align: left; padding: 5px 0;">Due Date</th><th style="text-align: right; padding: 5px 0;">Amount</th></tr>
                            {inst_rows}
                        </table>
                    </div>
                    
                    <p style="font-size: 15px; color: #34495e;">Please ensure you have sufficient funds to avoid late fees. Thank you for your cooperation.</p>
                    <p style="font-size: 14px; color: #7f8c8d; margin-top: 30px;">Best regards,<br><strong>Koperasi Sanoh System</strong></p>
                </div>
                """
                
                try:
                    send_mail(
                        subject, 
                        "", 
                        settings.DEFAULT_FROM_EMAIL, 
                        [email], 
                        fail_silently=False,
                        html_message=html_message
                    )
                    success_count += 1
                    self.stdout.write(self.style.SUCCESS(f"Successfully sent to {email}"))
                except Exception as e:
                    self.stdout.write(self.style.ERROR(f"Failed to send to {email}: {str(e)}"))
            
            self.stdout.write(self.style.SUCCESS(f"Process finished. Total emails sent: {success_count}"))
            
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Error occurred: {str(e)}"))
