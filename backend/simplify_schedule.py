import re

file_path = r"c:\Users\Asus\Documents\Koperasi-Sanoh\backend\api\loan\view.py"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

new_schedule_method = """    @action(detail=True, methods=['get'])
    def schedule(self, request, pk=None):
        query = \"\"\"
        SELECT  
            li.id,
            li.installment_number, 
            li.due_date, 
            li.amount_principal, 
            li.amount_interest, 
            li.amount_total, 
            COALESCE(s.status_code, 'UNPAID') as status_code,
            NULL as payment_proof
        FROM loan_installments li 
        LEFT JOIN statuses s ON s.id = li.status_id 
        WHERE li.loan_id = %s
        ORDER BY li.installment_number ASC;
        \"\"\"
        params = [pk]
        
        with connection.cursor() as cursor:
            cursor.execute(query, params)
            columns = [col[0] for col in cursor.description]
            results = [dict(zip(columns, row)) for row in cursor.fetchall()]
            
        return Response(results)"""

# Regex to replace the whole schedule method
# We look for:
#     @action(detail=True, methods=['get'])
#     def schedule(self, request, pk=None):
# ... until the end of the method (next @action or end of class)
pattern = re.compile(r"    @action\(detail=True, methods=\['get'\]\)\n    def schedule\(self, request, pk=None\):.*?(?=    @action|$)", re.DOTALL)
content = pattern.sub(new_schedule_method + "\n\n", content)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Simplified schedule method.")
