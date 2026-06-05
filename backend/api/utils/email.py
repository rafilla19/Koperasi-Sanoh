from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.utils.html import strip_tags
from html import escape

def build_email_html(title, intro, details=None, highlight=None, cta_label=None, cta_url=None, footer_note=None):
    details = details or []
    detail_rows = ''.join(
        f'''
        <tr>
            <td style="padding: 9px 0; color: #64748b; width: 38%; vertical-align: top;">{escape(str(label))}</td>
            <td style="padding: 9px 0; color: #0f172a; font-weight: 600; vertical-align: top;">{escape(str(value))}</td>
        </tr>
        '''
        for label, value in details
    )
    highlight_html = ''
    if highlight:
        highlight_label, highlight_value = highlight
        highlight_html = f'''
        <div style="margin: 22px 0; padding: 16px 18px; border-radius: 14px; background: linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%); border: 1px solid #dbeafe;">
            <div style="font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: #2563eb; font-weight: 700; margin-bottom: 4px;">{escape(str(highlight_label))}</div>
            <div style="font-size: 18px; font-weight: 800; color: #0f172a;">{escape(str(highlight_value))}</div>
        </div>
        '''
    cta_html = ''
    if cta_label and cta_url:
        cta_html = f'''
        <div style="margin-top: 28px; text-align: center;">
            <a href="{escape(str(cta_url))}" style="display: inline-block; background: linear-gradient(135deg, #1d4ed8, #0f172a); color: #ffffff; text-decoration: none; padding: 12px 22px; border-radius: 10px; font-weight: 700; font-size: 14px;">{escape(str(cta_label))}</a>
        </div>
        '''
    footer_html = f'<p style="margin: 26px 0 0; color: #94a3b8; font-size: 12px; line-height: 1.6;">{escape(str(footer_note))}</p>' if footer_note else ''
    return f'''
    <!doctype html>
    <html>
        <body style="margin: 0; padding: 0; background: #f1f5f9; font-family: Arial, Helvetica, sans-serif; color: #0f172a;">
            <div style="max-width: 640px; margin: 0 auto; padding: 32px 16px;">
                <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 18px; overflow: hidden; box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);">
                    <div style="background: linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%); padding: 24px 28px; color: #ffffff;">
                        <div style="font-size: 12px; letter-spacing: .14em; text-transform: uppercase; opacity: .75;">Koperasi Sanoh Sinergi Bersama</div>
                        <h1 style="margin: 10px 0 0; font-size: 22px; line-height: 1.3;">{escape(str(title))}</h1>
                    </div>
                    <div style="padding: 28px;">
                        <p style="margin: 0 0 18px; font-size: 15px; line-height: 1.7; color: #334155;">{escape(str(intro))}</p>
                        {highlight_html}
                        <table style="width: 100%; border-collapse: collapse; margin-top: 8px;">
                            {detail_rows}
                        </table>
                        {cta_html}
                        {footer_html}
                    </div>
                </div>
            </div>
        </body>
    </html>
    '''

def send_styled_email(subject, recipient, intro, details=None, highlight=None, cta_label=None, cta_url=None, footer_note=None, plain_fallback='', reply_to=None):
    html_message = build_email_html(subject, intro, details=details, highlight=highlight, cta_label=cta_label, cta_url=cta_url, footer_note=footer_note)
    text_content = plain_fallback or strip_tags(html_message)
    msg = EmailMultiAlternatives(
        subject,
        text_content,
        getattr(settings, 'DEFAULT_FROM_EMAIL', None),
        [recipient],
        reply_to=reply_to if reply_to else None
    )
    msg.attach_alternative(html_message, "text/html")
    msg.send(fail_silently=True)
