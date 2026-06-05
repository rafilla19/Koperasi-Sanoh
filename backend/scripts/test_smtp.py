import os
import django
import smtplib
import sys
from django.conf import settings
from dotenv import load_dotenv

# Force UTF-8 for Windows Console
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# 1. Load .env with override
load_dotenv(override=True)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

# 2. Manual settings sync (in case Django already initialized)
try:
    django.setup()
except Exception:
    pass

def debug_smtp():
    print("=== STARTING DEEP SMTP DEBUG ===")
    host = os.getenv('EMAIL_HOST', 'smtp-relay.brevo.com')
    port = int(os.getenv('EMAIL_PORT', 587))
    user = os.getenv('EMAIL_HOST_USER')
    password = os.getenv('EMAIL_HOST_PASSWORD')
    use_tls = os.getenv('EMAIL_USE_TLS', 'False') == 'True'
    use_ssl = os.getenv('EMAIL_USE_SSL', 'False') == 'True'

    print(f"Connecting to: {host}:{port}")
    print(f"TLS: {use_tls}, SSL: {use_ssl}")
    print(f"User: {user}")
    print("---------------------------------")

    try:
        # Create server connection
        if use_ssl:
            print("Initiating SSL connection...")
            server = smtplib.SMTP_SSL(host, port, timeout=10)
        else:
            print("Initiating standard SMTP connection...")
            server = smtplib.SMTP(host, port, timeout=10)
        
        # Set debug level to see everything
        server.set_debuglevel(1)
        
        # Say hello to server
        server.ehlo()
        
        if use_tls:
            print("Upgrading to TLS...")
            if server.has_extn('STARTTLS'):
                server.starttls()
                server.ehlo() # re-identify after TLS
            else:
                print("Server does not support STARTTLS but EMAIL_USE_TLS is True")

        print("Attempting Login...")
        server.login(user, password)
        print("\nSUCCESS! Authentication successful.")
        
        # Attempt to send a small test message
        from_email = os.getenv('DEFAULT_FROM_EMAIL', user)
        to_email = os.getenv('ADMIN_EMAIL', user)
        msg = f"Subject: SMTP Test\n\nThis is a test from the debug script."
        
        server.sendmail(from_email, [to_email], msg)
        print(f"SUCCESS! Test email sent from {from_email} to {to_email}")
        
        server.quit()
        
    except Exception as e:
        print("\n!!! ERROR ENCOUNTERED !!!")
        print(f"Type: {type(e).__name__}")
        print(f"Message: {str(e)}")
        
        if "535" in str(e):
            print("\nSUGGESTION: '535 Authentication Failed' means your SMTP Key or Login is wrong.")
            print("Check Brevo -> SMTP & API -> SMTP for the 'Login' and 'SMTP Key'.")
        elif "10060" in str(e):
            print("\nSUGGESTION: Connection timeout. Your IP might be blocked or Port is wrong.")
            print("Check the 'Unauthorized IP' tab in Brevo.")
        elif "10061" in str(e):
            print("\nSUGGESTION: Connection refused. Check if HOST and PORT are correct.")

if __name__ == "__main__":
    debug_smtp()
