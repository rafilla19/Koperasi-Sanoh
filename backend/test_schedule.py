import os
import django
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

def test_query(pk):
    query = """
    SELECT  
        li.installment_number, 
        li.due_date, 
        li.amount_principal, 
        li.amount_interest, 
        li.amount_total, 
        s.status_code  
    FROM loan_installments li 
    INNER JOIN loans la ON la.id = li.loan_id 
    INNER JOIN statuses s ON s.id = li.status_id 
    WHERE la.id = %s
    ORDER BY li.installment_number ASC;
    """
    with connection.cursor() as cursor:
        cursor.execute(query, [pk])
        columns = [col[0] for col in cursor.description]
        results = [dict(zip(columns, row)) for row in cursor.fetchall()]
        print(f"Results for pk={pk}:")
        for r in results:
            print(r)

if __name__ == "__main__":
    test_query(26)
