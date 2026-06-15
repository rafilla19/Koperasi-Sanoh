import re

file_path = r"c:\Users\Asus\Documents\Koperasi-Sanoh\backend\api\loan\view.py"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Add helper function at the top if it doesn't exist
helper_code = """
def is_user_admin(user):
    if not user or not user.is_authenticated:
        return False
    from django.db import connection
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT role_id FROM users WHERE email = %s", [user.email])
            row = cursor.fetchone()
            return row and row[0] == 1
    except Exception:
        return False
"""

if "def is_user_admin(user):" not in content:
    # insert it after imports
    import_match = re.search(r'(from.*?import.*?\n)+', content)
    if import_match:
        end_idx = import_match.end()
        content = content[:end_idx] + helper_code + content[end_idx:]

# Replace the conditions
content = content.replace("getattr(request.user, 'role_id', None) != 1", "not is_user_admin(request.user)")
content = content.replace("getattr(self.request.user, 'role_id', None) == 1", "is_user_admin(self.request.user)")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Replaced successfully.")
