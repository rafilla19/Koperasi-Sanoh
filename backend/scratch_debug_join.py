import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.db import connection

def run():
    with connection.cursor() as cursor:
        cursor.execute("SELECT COUNT(*) FROM loan_payments")
        print("Step 1 (payments):", cursor.fetchone()[0])
        
        cursor.execute("SELECT COUNT(*) FROM loan_payments lp INNER JOIN statuses s ON s.id = lp.status_id")
        print("Step 2 (+statuses):", cursor.fetchone()[0])
        
        cursor.execute("SELECT COUNT(*) FROM loan_payments lp INNER JOIN statuses s ON s.id = lp.status_id INNER JOIN loan_installments li ON li.id = lp.installment_id")
        print("Step 3 (+installments):", cursor.fetchone()[0])
        
        cursor.execute("SELECT COUNT(*) FROM loan_payments lp INNER JOIN statuses s ON s.id = lp.status_id INNER JOIN loan_installments li ON li.id = lp.installment_id INNER JOIN loans l ON l.id = li.loan_id")
        print("Step 4 (+loans):", cursor.fetchone()[0])
        
        cursor.execute("SELECT COUNT(*) FROM loan_payments lp INNER JOIN statuses s ON s.id = lp.status_id INNER JOIN loan_installments li ON li.id = lp.installment_id INNER JOIN loans l ON l.id = li.loan_id WHERE l.member_id = 23")
        print("Step 5 (+member_id=23):", cursor.fetchone()[0])

if __name__ == '__main__':
    run()
