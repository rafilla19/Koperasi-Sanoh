from rest_framework import viewsets, status as drf_status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import connection, transaction
from django.utils import timezone
from django.core.mail import send_mail, EmailMessage
from django.conf import settings
from django.utils.html import strip_tags
from decimal import Decimal
import datetime
import calendar
import os
import re
import json
from .models import LoanApplication, LoanType, Loan, LoanInstallment
from api.master.models import Status
from .serializers import LoanApplicationSerializer, LoanTypeSerializer, LoanSerializer, LoanInstallmentSerializer

def add_months(sourcedate, months):
    month = sourcedate.month - 1 + months
    year = sourcedate.year + month // 12
    month = month % 12 + 1
    day = min(sourcedate.day, calendar.monthrange(year, month)[1])
    return datetime.date(year, month, day)

class LoanApplicationViewSet(viewsets.ModelViewSet):
    serializer_class = LoanApplicationSerializer

    def get_queryset(self):
        if self.request.user.is_authenticated and hasattr(self.request.user, 'member'):
            return LoanApplication.objects.filter(member=self.request.user.member)
        return LoanApplication.objects.all()

    def perform_create(self, serializer):
        status = Status.objects.get(
            status_category__category_name='LOAN_APPLICATION',
            status_code='SUBMITTED'
        )
        instance = serializer.save(status=status)
        
        # Notify Admin about new loan request
        try:
            member_name = instance.member.full_name if hasattr(instance, 'member') else "A member"
            amount = instance.amount_requested
            
            subject = f"New Loan Request - {member_name}"
            
            html_message = f"""
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
                <h2 style="color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px;">New Loan Request</h2>
                <p style="font-size: 16px; color: #34495e;">Hello Admin,</p>
                <p style="font-size: 15px; color: #34495e;"><strong>{member_name}</strong> has submitted a new loan request for your review.</p>
                
                <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
                    <h3 style="margin-top: 0; color: #2c3e50; font-size: 18px;">Application Details</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr><td style="padding: 8px 0; color: #7f8c8d;">Amount</td><td style="padding: 8px 0; text-align: right;"><strong>Rp {amount:,.0f}</strong></td></tr>
                        <tr><td style="padding: 8px 0; color: #7f8c8d;">Purpose</td><td style="padding: 8px 0; text-align: right;"><strong>{instance.purpose}</strong></td></tr>
                        <tr><td style="padding: 8px 0; color: #7f8c8d;">Duration</td><td style="padding: 8px 0; text-align: right;"><strong>{instance.duration_months} months</strong></td></tr>
                    </table>
                </div>
                
                <p style="font-size: 14px; color: #7f8c8d; margin-top: 30px;">This is an automated notification from Koperasi Sanoh System.</p>
            </div>
            """
            
            send_mail(
                subject,
                "", # Plain text fallback
                settings.DEFAULT_FROM_EMAIL,
                [settings.ADMIN_EMAIL],
                fail_silently=True,
                html_message=html_message
            )

            # Notify Member about their new loan request
            try:
                member_email = instance.member.user.email if hasattr(instance.member, 'user') else None
                if member_email:
                    member_subject = "Loan Application Received - Koperasi Sanoh"
                    member_html = f"""
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
                        <h2 style="color: #0F172A; text-align: center;">Loan Application Received</h2>
                        <p>Dear <strong>{instance.member.full_name}</strong>,</p>
                        <p>Your loan application has been successfully submitted and is currently being reviewed by our administration team.</p>
                        
                        <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #0284C7;">
                            <h3 style="margin-top: 0; font-size: 16px; color: #0284C7;">Application Summary:</h3>
                            <ul style="list-style-type: none; padding: 0;">
                                <li><strong>Amount:</strong> Rp {amount:,.0f}</li>
                                <li><strong>Duration:</strong> {instance.duration_months} months</li>
                                <li><strong>Status:</strong> PENDING REVIEW</li>
                            </ul>
                        </div>
                        
                        <p>We will notify you via email once a decision has been made.</p>
                        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
                        <p style="font-size: 12px; color: #64748b; text-align: center;">
                            Koperasi Sanoh Sinergi Bersama - Professional Financial Management
                        </p>
                    </div>
                    """
                    send_mail(
                        member_subject,
                        strip_tags(member_html),
                        settings.DEFAULT_FROM_EMAIL,
                        [member_email],
                        fail_silently=True,
                        html_message=member_html
                    )
            except Exception as e:
                print(f"Failed to send member notification: {str(e)}")
        except Exception as e:
            print(f"Failed to send notifications: {str(e)}")

    @action(detail=False, methods=['get'])
    def admin_pending_list(self, request):
        query = """
        SELECT m.full_name, m.id AS employee_id, 
        d.department_name, la.purpose, la.duration_months, la.amount_requested, la.id as application_id
        FROM loan_applications la 
        INNER JOIN members m ON la.member_id = m.id
        INNER JOIN departments d ON m.department_id = d.id
        INNER JOIN users u ON m.user_id = u.id
        WHERE la.status_id = 21 AND u.is_active = true
        """
        
        with connection.cursor() as cursor:
            cursor.execute(query)
            columns = [col[0] for col in cursor.description]
            results = [dict(zip(columns, row)) for row in cursor.fetchall()]
            
        return Response(results)

    @action(detail=True, methods=['get'])
    def admin_application_detail(self, request, pk=None):
        query = """
        SELECT m.full_name, m.id as member_id, 
        d.department_name, la.purpose, la.duration_months, la.amount_requested, 
        m.nik_employee, m.phone_number, u.email, la.applied_at, la.reject_reason, 
        la.salary_statement_file, lt.name as loan_type_name,
        adm.email as admin_email
        FROM loan_applications la 
        JOIN members m ON la.member_id = m.id
        JOIN departments d ON m.department_id = d.id
        JOIN users u ON m.user_id = u.id
        LEFT JOIN loan_types lt ON la.loan_type_id = lt.id
        LEFT JOIN users adm ON la.admin_id = adm.id
        WHERE la.id = %s AND u.is_active = true
        """
        with connection.cursor() as cursor:
            cursor.execute(query, [pk])
            columns = [col[0] for col in cursor.description]
            row = cursor.fetchone()
            if row:
                result = dict(zip(columns, row))
                return Response(result)
            return Response({'error': 'Application not found'}, status=404)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        try:
            application = self.get_object()
            repayment_term = int(request.data.get('repayment_term', application.duration_months))
            interest_rate_percent = Decimal(str(request.data.get('interest_rate', '0.5')))
            updated_amount = Decimal(str(request.data.get('amount_requested', application.amount_requested)))
            
            with transaction.atomic():
                # 1. Update Application Status to APPROVED (status_id 23)
                # Hardcoded admin_id to 1 for testing as requested
                admin_user_id = 1
                
                with connection.cursor() as cursor:
                    cursor.execute(
                        "UPDATE loan_applications SET status_id = %s, duration_months = %s, amount_requested = %s, admin_id = %s WHERE id = %s",
                        [23, repayment_term, updated_amount, admin_user_id, application.id]
                    )
                
                # Refresh object to make sure it has the new status for later logic
                application.refresh_from_db()
                
                # 2. Calculate values
                principal = updated_amount
                interest_amount = principal * (interest_rate_percent / 100) * repayment_term
                total_amount = principal + interest_amount
                
                start_date = datetime.date.today()
                end_date = add_months(start_date, repayment_term)
                
                active_loan_status = Status.objects.get(id=25) 
                
                # 3. Create Loan
                loan = Loan.objects.create(
                    application=application,
                    member=application.member,
                    principal_amount=principal,
                    interest_amount=interest_amount,
                    total_amount=total_amount,
                    remaining_balance=total_amount,
                    start_date=start_date,
                    due_date=end_date,
                    status=active_loan_status,
                    created_at=timezone.now(),
                    updated_at=timezone.now()
                )
                
                # 4. Generate Installments
                unpaid_status = Status.objects.get(id=28) 
                inst_principal = principal / repayment_term
                inst_interest = interest_amount / repayment_term
                inst_total = inst_principal + inst_interest
                
                installments = []
                for i in range(1, repayment_term + 1):
                    due_date = add_months(start_date, i)
                    installments.append(LoanInstallment(
                        loan=loan,
                        installment_number=i,
                        due_date=due_date,
                        amount_principal=inst_principal,
                        amount_interest=inst_interest,
                        amount_total=inst_total,
                        status=unpaid_status,
                        created_at=timezone.now(),
                        updated_at=timezone.now()
                    ))
                
                LoanInstallment.objects.bulk_create(installments)
                
                # Notify Member about approval
                try:
                    member_email = application.member.user.email
                    member_name = application.member.full_name
                    
                    subject = "Loan Application Approved"
                    
                    html_message = f"""
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
                        <h2 style="color: #27ae60; border-bottom: 2px solid #27ae60; padding-bottom: 10px;">Loan Approved!</h2>
                        <p style="font-size: 16px; color: #34495e;">Dear {member_name},</p>
                        <p style="font-size: 15px; color: #34495e;">Congratulations! Your loan application has been <strong>Approved</strong>.</p>
                        
                        <div style="background-color: #f4fbf7; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #27ae60;">
                            <h3 style="margin-top: 0; color: #2c3e50; font-size: 18px;">Loan Summary</h3>
                            <table style="width: 100%; border-collapse: collapse;">
                                <tr><td style="padding: 8px 0; color: #7f8c8d;">Amount</td><td style="padding: 8px 0; text-align: right;"><strong>Rp {updated_amount:,.0f}</strong></td></tr>
                                <tr><td style="padding: 8px 0; color: #7f8c8d;">Duration</td><td style="padding: 8px 0; text-align: right;"><strong>{repayment_term} months</strong></td></tr>
                                <tr><td style="padding: 8px 0; color: #7f8c8d;">Interest Rate</td><td style="padding: 8px 0; text-align: right;"><strong>{interest_rate_percent}% / month</strong></td></tr>
                                <tr><td style="padding: 8px 0; color: #7f8c8d; border-top: 1px solid #dcdde1; font-weight: bold;">Total Repayment</td><td style="padding: 8px 0; text-align: right; border-top: 1px solid #dcdde1;"><strong>Rp {total_amount:,.0f}</strong></td></tr>
                            </table>
                        </div>
                        
                        <p style="font-size: 15px; color: #34495e;">You can now view your repayment schedule in the dashboard.</p>
                        <p style="font-size: 14px; color: #7f8c8d; margin-top: 30px;">Best regards,<br><strong>Koperasi Sanoh Admin</strong></p>
                    </div>
                    """
                    
                    send_mail(
                        subject,
                        "", # Plain text fallback
                        settings.DEFAULT_FROM_EMAIL,
                        [member_email],
                        fail_silently=True,
                        html_message=html_message
                    )
                except Exception as e:
                    print(f"Failed to send member approval notification: {str(e)}")
                
            return Response({'message': 'Loan approved and installments generated successfully'})
        except Exception as e:
            return Response({'error': str(e)}, status=400)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        try:
            application = self.get_object()
            reject_reason = request.data.get('reject_reason', 'No reason provided')
            
            # Hardcoded admin_id to 1 for testing as requested
            admin_user_id = 1
            
            with connection.cursor() as cursor:
                cursor.execute(
                    "UPDATE loan_applications SET status_id = %s, reject_reason = %s, admin_id = %s WHERE id = %s",
                    [24, reject_reason, admin_user_id, application.id]
                )
            
            # Notify Member about rejection
            try:
                member_email = application.member.user.email
                member_name = application.member.full_name
                
                subject = "Loan Application Update"
                
                html_message = f"""
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
                    <h2 style="color: #e74c3c; border-bottom: 2px solid #e74c3c; padding-bottom: 10px;">Loan Application Update</h2>
                    <p style="font-size: 16px; color: #34495e;">Dear {member_name},</p>
                    <p style="font-size: 15px; color: #34495e;">We have reviewed your loan application and unfortunately, it has been <strong>Rejected</strong> at this time.</p>
                    
                    <div style="background-color: #fef4f3; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #e74c3c;">
                        <h3 style="margin-top: 0; color: #2c3e50; font-size: 17px;">Reason for Rejection</h3>
                        <p style="color: #34495e; font-style: italic;">"{reject_reason}"</p>
                    </div>
                    
                    <p style="font-size: 15px; color: #34495e;">If you have any questions, please contact the cooperative administration.</p>
                    <p style="font-size: 14px; color: #7f8c8d; margin-top: 30px;">Best regards,<br><strong>Koperasi Sanoh Admin</strong></p>
                </div>
                """
                
                send_mail(
                    subject,
                    "", # Plain text fallback
                    settings.DEFAULT_FROM_EMAIL,
                    [member_email],
                    fail_silently=True,
                    html_message=html_message
                )
            except Exception as e:
                print(f"Failed to send member rejection notification: {str(e)}")
            
            return Response({'message': 'Loan application rejected', 'admin_id_updated': admin_user_id})
        except Exception as e:
            return Response({'error': str(e)}, status=400)

    @action(detail=False, methods=['get'])
    def admin_member_profile(self, request):
        member_id = request.query_params.get('member_id')
        if not member_id:
            return Response({'error': 'member_id query param is required'}, status=400)
            
        query = """
        SELECT 
            m.full_name, 
            m.id as member_id, 
            d.department_name,
            m.nik_employee, 
            m.phone_number, 
            u.email,
            m.address,
            m.gender,
            l.remaining_balance as current_loan,
            m.join_date, 
            m.ktp_file_path, 
            st.name as saving_type_name, 
            sw.balance as saving_balance,
            es.status_name as employee_status,
            CASE 
                WHEN u.is_active = true THEN 'ACTIVE'
                WHEN u.is_active = false THEN 'INACTIVE'
                ELSE 'UNKNOWN'
            END AS active_status,
            mb.account_number, 
            mb.account_holder_name, 
            b.bank_name
        FROM members m 
        JOIN departments d ON m.department_id = d.id
        JOIN users u ON m.user_id = u.id
        LEFT JOIN member_bank_accounts mb ON mb.member_id = m.id
        LEFT JOIN banks b ON b.id = mb.bank_id
        LEFT JOIN loans l ON l.member_id = m.id
        LEFT JOIN saving_wallets sw ON sw.member_id = m.id 
        LEFT JOIN saving_types st ON sw.saving_type_id = st.id
        LEFT JOIN employee_statuses es ON es.id = m.employee_status_id
        WHERE m.id = %s AND u.is_active = true 
        LIMIT 1
        """
        with connection.cursor() as cursor:
            cursor.execute(query, [member_id])
            row = cursor.fetchone()
            if row:
                columns = [col[0] for col in cursor.description]
                result = dict(zip(columns, row))
                return Response(result)
            return Response({'error': 'Member not found'}, status=404)

    @action(detail=False, methods=['get'])
    def pending_summary(self, request):
        member_id = 1 # default for testing
        if request.user.is_authenticated and hasattr(request.user, 'member'):
            member_id = request.user.member.id

        query = """
        SELECT 
            la.id,
            lt.name AS type_name,
            la.amount_requested,
            la.purpose,
            la.applied_at,
            la.duration_months,
            s.status_code
        FROM loan_applications la
        INNER JOIN loan_types lt
            ON la.loan_type_id = lt.id
        INNER JOIN statuses s 
            ON s.id = la.status_id 
        WHERE la.status_id = 21 
          AND la.member_id = %s;
        """
        
        with connection.cursor() as cursor:
            cursor.execute(query, [member_id])
            columns = [col[0] for col in cursor.description]
            results = [dict(zip(columns, row)) for row in cursor.fetchall()]
            
        return Response(results)

    @action(detail=False, methods=['get'])
    def rejected_summary(self, request):
        member_id = 1 # default for testing
        if request.user.is_authenticated and hasattr(request.user, 'member'):
            member_id = request.user.member.id

        query = """
        SELECT 
            la.id,
            lt.name AS type_name,
            la.amount_requested,
            la.purpose,
            la.applied_at,
            la.duration_months,
            la.reject_reason,
            la.updated_at AS admin_update
        FROM loan_applications la
        INNER JOIN loan_types lt
            ON la.loan_type_id = lt.id
        WHERE la.status_id = 24 
          AND la.member_id = %s;
        """
        
        with connection.cursor() as cursor:
            cursor.execute(query, [member_id])
            columns = [col[0] for col in cursor.description]
            results = [dict(zip(columns, row)) for row in cursor.fetchall()]
            
        return Response(results)
        
        
class LoanTypeViewSet(viewsets.ModelViewSet):
    queryset = LoanType.objects.filter(deleted_at__isnull=True).order_by('id')
    serializer_class = LoanTypeSerializer

    def perform_create(self, serializer):
        serializer.save(created_at=timezone.now(), updated_at=timezone.now())

    def perform_update(self, serializer):
        serializer.save(updated_at=timezone.now())

    def perform_destroy(self, instance):
        instance.deleted_at = timezone.now()
        instance.save()
    
class LoanViewSet(viewsets.ModelViewSet):
    serializer_class = LoanSerializer

    def get_queryset(self):
        if self.request.user.is_authenticated and hasattr(self.request.user, 'member'):
            return Loan.objects.filter(member_id=self.request.user.member)
        return Loan.objects.all()

    @action(detail=False, methods=['get'])
    def active_summary(self, request):
        member_id = 1 # default for testing
        if request.user.is_authenticated and hasattr(request.user, 'member'):
            member_id = request.user.member.id

        query = """
        SELECT 
            la.id AS loan_application_id,
            l.id AS loan_id,
            l.status_id,
            l.remaining_balance,
            l.principal_amount,
            la.purpose,
            la.admin_update,
            (l.interest_amount / NULLIF(l.principal_amount, 0)) * 100 AS bunga,
            li_summary.total_installment,
            li_summary.paid_installment,
            (li_summary.total_installment - li_summary.paid_installment) AS remaining_installment,
            ni.id AS next_installment_id,
            ni.amount_total AS next_installment_balance,
            ni.due_date AS next_installment_due_date,
            lt.name AS type_name
        FROM loans l
        JOIN loan_applications la ON l.application_id = la.id
        LEFT JOIN loan_types lt ON la.loan_type_id = lt.id
        LEFT JOIN (
            SELECT 
                li.loan_id,
                COUNT(*) AS total_installment,
                SUM(CASE WHEN li.status_id = 29 THEN 1 ELSE 0 END) AS paid_installment
            FROM loan_installments li
            GROUP BY li.loan_id
        ) li_summary ON li_summary.loan_id = l.id
        LEFT JOIN LATERAL (
            SELECT li2.id, li2.amount_total, li2.due_date
            FROM loan_installments li2
            WHERE li2.loan_id = l.id
              AND li2.status_id = 28
            ORDER BY li2.id ASC
            LIMIT 1
        ) ni ON TRUE
        WHERE l.member_id = %s 
          AND l.status_id = 25;
        """
        
        with connection.cursor() as cursor:
            cursor.execute(query, [member_id])
            columns = [col[0] for col in cursor.description]
            results = [dict(zip(columns, row)) for row in cursor.fetchall()]
            
        return Response(results)

    @action(detail=False, methods=['get'])
    def completed_summary(self, request):
        member_id = 1 # default for testing
        if request.user.is_authenticated and hasattr(request.user, 'member'):
            member_id = request.user.member.id

        query = """
        SELECT 
            la.id AS loan_application_id,
            l.id AS loan_id,
            l.status_id,
            l.remaining_balance,
            l.principal_amount,
            la.purpose,
            la.admin_update,
            (l.interest_amount / NULLIF(l.principal_amount, 0)) * 100 AS bunga,
            li_summary.total_installment,
            li_summary.paid_installment,
            (li_summary.total_installment - li_summary.paid_installment) AS remaining_installment,
            ni.id AS next_installment_id,
            ni.amount_total AS next_installment_balance,
            lt.name AS type_name,
            last_payment.payment_date AS last_payment_date
        FROM loans l
        JOIN loan_applications la ON l.application_id = la.id
        LEFT JOIN loan_types lt ON la.loan_type_id = lt.id
        LEFT JOIN (
            SELECT 
                li.loan_id,
                COUNT(*) AS total_installment,
                SUM(CASE WHEN li.status_id in (29,30) THEN 1 ELSE 0 END) AS paid_installment
            FROM loan_installments li
            GROUP BY li.loan_id
        ) li_summary ON li_summary.loan_id = l.id
        LEFT JOIN LATERAL (
            SELECT li2.id, li2.amount_total
            FROM loan_installments li2
            WHERE li2.loan_id = l.id
              AND li2.status_id = 28
            ORDER BY li2.id ASC
            LIMIT 1
        ) ni ON TRUE
        LEFT JOIN LATERAL (
            SELECT lp.payment_date
            FROM loan_payments lp
            JOIN loan_installments li3 ON li3.id = lp.installment_id
            WHERE li3.loan_id = l.id
            ORDER BY lp.payment_date DESC
            LIMIT 1
        ) last_payment ON TRUE
        WHERE l.member_id = %s 
          AND l.status_id = 26;
        """
        
        with connection.cursor() as cursor:
            cursor.execute(query, [member_id])
            columns = [col[0] for col in cursor.description]
            results = [dict(zip(columns, row)) for row in cursor.fetchall()]
        return Response(results)

    # @action(detail=True, methods=['get'])
    # def schedule(self, request, pk=None):
    #     member_id = 1 # default for testing
    #     if request.user.is_authenticated and hasattr(request.user, 'member'):
    #         member_id = request.user.member.id

    #     query = """
    #     SELECT  
    #         li.installment_number, 
    #         li.due_date, 
    #         li.amount_principal, 
    #         li.amount_interest, 
    #         li.amount_total, 
    #         s.status_code  
    #     FROM loan_installments li 
    #     INNER JOIN loans la ON la.id = li.loan_id 
    #     INNER JOIN statuses s ON s.id = li.status_id 
    #     WHERE la.member_id = %s AND la.id = %s 
    #     ORDER BY li.installment_number ASC;
    #     """
        
    #     with connection.cursor() as cursor:
    #         cursor.execute(query, [member_id, pk])
    #         columns = [col[0] for col in cursor.description]
    #         results = [dict(zip(columns, row)) for row in cursor.fetchall()]
            
    #     return Response(results)

    @action(detail=True, methods=['get'])
    def schedule(self, request, pk=None):
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
        """
        params = [pk]
        
        # If not staff, filter by member_id for security
        if not request.user.is_staff:
            member_id = 1 # default for testing
            if hasattr(request.user, 'member'):
                member_id = request.user.member.id
            query += " AND la.member_id = %s"
            params.append(member_id)
            
        query += " ORDER BY li.installment_number ASC;"
        
        with connection.cursor() as cursor:
            cursor.execute(query, params)
            columns = [col[0] for col in cursor.description]
            results = [dict(zip(columns, row)) for row in cursor.fetchall()]
            
        return Response(results)

    @action(detail=True, methods=['get'])
    def payment_invoice(self, request, pk=None):
        query = """
        SELECT  
            pm.name AS payment_method,
            pgt.gateway_status,
            lp.amount_paid,
            lp.payment_date,
            li.installment_number,
            l.member_id,
            s.status_code
        FROM loan_payments lp
        INNER JOIN statuses s ON s.id = lp.status_id 
        JOIN payment_methods pm ON pm.id = lp.payment_method_id
        JOIN loan_installments li ON li.id = lp.installment_id
        JOIN loans l ON l.id = li.loan_id
        LEFT JOIN payment_gateway_transactions pgt ON pgt.id = lp.id
        WHERE l.id = %s
        """
        params = [pk]

        if not request.user.is_staff:
            member_id = 1
            if hasattr(request.user, 'member'):
                member_id = request.user.member.id
            query += " AND l.member_id = %s"
            params.append(member_id)

        with connection.cursor() as cursor:
            cursor.execute(query, params)
            columns = [col[0] for col in cursor.description]
            results = [dict(zip(columns, row)) for row in cursor.fetchall()]
            
        return Response(results)

    @action(detail=True, methods=['get'])
    def receipts(self, request, pk=None):
        query = """
        SELECT  
            pm.name AS payment_method,
            pgt.gateway_status,
            lp.amount_paid,
            lp.payment_date,
            li.installment_number,
            l.member_id,
            s.status_code,
            lp.id
        FROM loan_payments lp
        INNER JOIN statuses s ON s.id = lp.status_id 
        JOIN payment_methods pm ON pm.id = lp.payment_method_id
        JOIN loan_installments li ON li.id = lp.installment_id
        JOIN loans l ON l.id = li.loan_id
        LEFT JOIN payment_gateway_transactions pgt ON pgt.id = lp.id
        WHERE l.id = %s
        """
        params = [pk]

        if not request.user.is_staff:
            member_id = 1
            if hasattr(request.user, 'member'):
                member_id = request.user.member.id
            query += " AND l.member_id = %s"
            params.append(member_id)

        with connection.cursor() as cursor:
            cursor.execute(query, params)
            columns = [col[0] for col in cursor.description]
            results = [dict(zip(columns, row)) for row in cursor.fetchall()]
            
        return Response(results)

    @action(detail=False, methods=['get'])
    def admin_dashboard_stats(self, request):
        pending_query = """
        SELECT COUNT(id) as submit_application FROM loan_applications WHERE status_id=21
        """
        
        loans_query = """
        SELECT 
            SUM(l.remaining_balance) AS total_outstanding,
            SUM(l.principal_amount) AS active_borrowers,
            SUM(CASE 
                WHEN li.status_id = 29 THEN li.amount_interest
                ELSE 0
            END) AS interest_achieved
        FROM loans l
        INNER JOIN loan_installments li 
            ON li.loan_id = l.id 
        WHERE l.status_id = 25;
        """
        
        # Trend analytics query
        trend_query = """
        SELECT
            -- Interest Trends
            (SELECT COALESCE(SUM(amount_interest), 0) FROM loan_installments WHERE status_id = 29 AND DATE_TRUNC('month', updated_at) = DATE_TRUNC('month', CURRENT_DATE)) as int_curr,
            (SELECT COALESCE(SUM(amount_interest), 0) FROM loan_installments WHERE status_id = 29 AND DATE_TRUNC('month', updated_at) = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')) as int_prev,
            
            -- Outstanding Trends
            (SELECT COALESCE(SUM(remaining_balance), 0) FROM loans WHERE status_id = 25) as out_curr,
            (
                (SELECT COALESCE(SUM(remaining_balance), 0) FROM loans WHERE status_id = 25) + 
                (SELECT COALESCE(SUM(amount_paid), 0) FROM loan_payments WHERE DATE_TRUNC('month', payment_date) = DATE_TRUNC('month', CURRENT_DATE)) - 
                (SELECT COALESCE(SUM(principal_amount), 0) FROM loans WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE))
            ) as out_prev,
            
            -- Borrowers Trends (Principal sum)
            (SELECT COALESCE(SUM(principal_amount), 0) FROM loans WHERE status_id = 25) as bor_curr,
            (SELECT COALESCE(SUM(principal_amount), 0) FROM loans WHERE status_id = 25 AND created_at < DATE_TRUNC('month', CURRENT_DATE)) as bor_prev
        """

        # Current month installment query
        current_month_query = """
        SELECT SUM(li.amount_total) 
        FROM loan_installments li 
        WHERE li.status_id = 28 AND li.due_date = %s
        """
        
        import datetime
        today = datetime.date.today()
        if today.day <= 25:
            current_period_due_date = datetime.date(today.year, today.month, 25)
        else:
            if today.month == 12:
                current_period_due_date = datetime.date(today.year + 1, 1, 25)
            else:
                current_period_due_date = datetime.date(today.year, today.month + 1, 25)
                
        def calculate_trend(curr, prev):
            if not prev or prev == 0:
                return "+0.0%" if not curr or curr == 0 else "+100.0%"
            change = ((float(curr) - float(prev)) / float(prev)) * 100
            return f"{'+' if change >= 0 else ''}{change:.1f}%"

        with connection.cursor() as cursor:
            cursor.execute(pending_query)
            pending_row = cursor.fetchone()
            submit_application = pending_row[0] if pending_row and pending_row[0] else 0
            
            cursor.execute(loans_query)
            loans_row = cursor.fetchone()
            total_outstanding = loans_row[0] if loans_row and loans_row[0] else 0
            active_borrowers = loans_row[1] if loans_row and loans_row[1] else 0
            interest_achieved = loans_row[2] if loans_row and loans_row[2] else 0

            cursor.execute(trend_query)
            trend_row = cursor.fetchone()
            # [int_curr, int_prev, out_curr, out_prev, bor_curr, bor_prev]
            interest_trend = calculate_trend(trend_row[0], trend_row[1])
            outstanding_trend = calculate_trend(trend_row[2], trend_row[3])
            borrowers_trend = calculate_trend(trend_row[4], trend_row[5])
            
            cursor.execute(current_month_query, [current_period_due_date])
            current_month_row = cursor.fetchone()
            current_month_installment = current_month_row[0] if current_month_row and current_month_row[0] else 0
            
        data = {
            'pending_approvals': submit_application,
            'total_outstanding': total_outstanding,
            'outstanding_trend': outstanding_trend,
            'active_borrowers': active_borrowers,
            'borrowers_trend': borrowers_trend,
            'interest_achieved': interest_achieved,
            'interest_trend': interest_trend,
            'current_month_installment': current_month_installment
        }
        return Response(data)

    @action(detail=False, methods=['get'])
    def transaction_history(self, request):
        """
        Combined transaction history from savings, withdrawals, and loan payments.
        """
        member_name = request.query_params.get('member_name', '')
        transaction_type = request.query_params.get('transaction_type', '')
        start_date = request.query_params.get('start_date', '')
        end_date = request.query_params.get('end_date', '')
        query = f"""
        SELECT *
            FROM (

                ----------------------------------------------------------------
                -- SAVING TRANSACTIONS
                ----------------------------------------------------------------
                SELECT 
                    st.transaction_date AS transaction_date,
                    m.full_name,
                    tt.name AS transaction_type,
                    pm.name AS payment_method,
                    st.amount,
                    s.status_code AS status,
                    st.payment_reference_id AS reference_number

                FROM saving_transactions st

                INNER JOIN members m
                    ON m.id = st.member_id

                INNER JOIN transaction_types tt
                    ON tt.id = st.transaction_type_id

                INNER JOIN payment_methods pm
                    ON pm.id = st.payment_method_id

                INNER JOIN statuses s
                    ON s.id = st.status_id

                LEFT JOIN manual_payments mp
                    ON pm.name = 'MANUAL'
                AND mp.payment_reference_id = st.payment_reference_id


                UNION ALL


                ----------------------------------------------------------------
                -- WITHDRAWALS
                ----------------------------------------------------------------
                SELECT 
                    w.request_date AS transaction_date,
                    m.full_name,
                    'WITHDRAWAL' AS transaction_type,
                    pm.name AS payment_method,
                    w.amount,
                    s.status_code AS status,
                    w.payment_reference_id AS reference_number

                FROM withdrawals w

                INNER JOIN members m
                    ON m.id = w.member_id

                INNER JOIN payment_methods pm
                    ON pm.id = w.payment_method_id

                INNER JOIN statuses s
                    ON s.id = w.status_id

                LEFT JOIN manual_payments mp
                    ON pm.name = 'MANUAL'
                AND mp.payment_reference_id = w.payment_reference_id


                UNION ALL


                ----------------------------------------------------------------
                -- LOAN PAYMENTS
                ----------------------------------------------------------------
                SELECT 
                    lp.payment_date AS transaction_date,
                    m.full_name,
                    'INSTALLMENT PAYMENT' AS transaction_type,
                    pm.name AS payment_method,
                    lp.amount_paid AS amount,
                    s.status_code AS status,
                    lp.payment_reference_id AS reference_number

                FROM loan_payments lp

                INNER JOIN payment_methods pm
                    ON pm.id = lp.payment_method_id

                INNER JOIN statuses s
                    ON s.id = lp.status_id

                INNER JOIN loan_installments li
                    ON li.id = lp.installment_id

                INNER JOIN loans l
                    ON l.id = li.loan_id

                INNER JOIN members m
                    ON m.id = l.member_id

                LEFT JOIN manual_payments mp
                    ON pm.name = 'MANUAL'
                AND mp.payment_reference_id = lp.payment_reference_id

            ) combined_transactions

            WHERE 1=1
        """
        # Base query with placeholders for filtering
        # query = f"""
        # SELECT * FROM (
        #     SELECT 
        #         st.transaction_date AS transaction_date,
        #         m.full_name,
        #         tt.name AS transaction_type,
        #         pm.name AS payment_method,
        #         st.amount,
        #         s.status_code AS status,
        #         CASE
        #             WHEN pm.name = 'GATEWAY' THEN pgt.gateway_transaction_id
        #             ELSE '-'
        #         END AS reference_number
        #     FROM saving_transactions st
        #     INNER JOIN members m ON m.id = st.member_id
        #     INNER JOIN transaction_types tt ON tt.id = st.transaction_type_id
        #     INNER JOIN payment_methods pm ON pm.id = st.payment_method_id
        #     INNER JOIN statuses s ON s.id = st.status_id
        #     LEFT JOIN manual_payments mp ON pm.name = 'MANUAL' AND mp.id = st.payment_reference_id
        #     LEFT JOIN payment_gateway_transactions pgt ON pm.name = 'GATEWAY' AND pgt.id = st.payment_reference_id

        #     UNION ALL

        #     SELECT 
        #         w.request_date AS transaction_date,
        #         m.full_name,
        #         'WITHDRAWAL' AS transaction_type,
        #         pm.name AS payment_method,
        #         w.amount,
        #         s.status_code AS status,
        #         CASE
        #             WHEN pm.name = 'GATEWAY' THEN pgt.gateway_transaction_id
        #             ELSE '-'
        #         END AS reference_number
        #     FROM withdrawals w
        #     INNER JOIN members m ON m.id = w.member_id
        #     INNER JOIN payment_methods pm ON pm.id = w.payment_method_id
        #     INNER JOIN statuses s ON s.id = w.status_id
        #     LEFT JOIN manual_payments mp ON pm.name = 'MANUAL' AND mp.id = w.payment_reference_id
        #     LEFT JOIN payment_gateway_transactions pgt ON pm.name = 'GATEWAY' AND pgt.id = w.payment_reference_id

        #     UNION ALL

        #     SELECT 
        #         lp.payment_date AS transaction_date,
        #         m.full_name,
        #         'INSTALLMENT PAYMENT' AS transaction_type,
        #         pm.name AS payment_method,
        #         lp.amount_paid AS amount,
        #         s.status_code AS status,
        #         CASE
        #             WHEN pm.name = 'GATEWAY' THEN pgt.gateway_transaction_id
        #             ELSE '-'
        #         END AS reference_number
        #     FROM loan_payments lp
        #     INNER JOIN payment_methods pm ON pm.id = lp.payment_method_id
        #     INNER JOIN statuses s ON s.id = lp.status_id
        #     INNER JOIN loan_installments li ON li.id = lp.installment_id
        #     INNER JOIN loans l ON l.id = li.loan_id
        #     INNER JOIN members m ON m.id = l.member_id
        #     LEFT JOIN manual_payments mp ON pm.name = 'MANUAL' AND mp.id = lp.payment_reference_id
        #     LEFT JOIN payment_gateway_transactions pgt ON pm.name = 'GATEWAY' AND pgt.id = lp.payment_reference_id
        # ) combined_transactions
        # WHERE 1=1
        # """
        
        params = []
        if member_name and member_name.strip():
            query += " AND full_name ILIKE %s"
            params.append(f"%{member_name}%")
            
        if transaction_type and transaction_type.strip():
            type_lower = transaction_type.lower()
            if type_lower == 'deposit':
                query += " AND transaction_type IN ('MANDATORY', 'VOLUNTARY', 'PRINCIPLE', 'DEPOSIT')"
            elif type_lower == 'loan-installment':
                query += " AND transaction_type = 'INSTALLMENT PAYMENT'"
            elif type_lower == 'withdrawals':
                query += " AND transaction_type = 'WITHDRAWAL'"
            else:
                query += " AND transaction_type = %s"
                params.append(transaction_type)
                
        if start_date and start_date.strip():
            query += " AND transaction_date >= %s"
            params.append(start_date)
        if end_date and end_date.strip():
            query += " AND transaction_date <= %s"
            params.append(end_date)
            
        query += " ORDER BY transaction_date DESC"

        try:
            with connection.cursor() as cursor:
                cursor.execute(query, params)
                columns = [col[0] for col in cursor.description]
                results = [dict(zip(columns, row)) for row in cursor.fetchall()]
            return Response(results)
        except Exception as e:
            return Response({'error': str(e)}, status=400)

    @action(detail=False, methods=['get'])
    def admin_loans_list(self, request):
        import datetime

        # Accept month/year filter, default to current month
        month_param = request.query_params.get('month')
        year_param = request.query_params.get('year')
        today = datetime.date.today()
        try:
            sel_month = int(month_param) if month_param else today.month
            sel_year = int(year_param) if year_param else today.year
        except ValueError:
            sel_month = today.month
            sel_year = today.year

        period_str = f"{sel_year}-{sel_month:02d}"  # e.g. '2026-05'

        query = """  
        SELECT 
                    m.id as member_id, 
                    m.full_name,
                    m.nik_employee,
                    d.department_name, 
                    la.purpose,
                    la.duration_months,
                    la.amount_requested, 
                    l.principal_amount,
                    l.interest_amount,
                    l.total_amount as amount,
                    lt.name as type_name,
                    s.status_code,
                    s.id as status_id,
                    l.id as loan_id,
                    l.remaining_balance,
                    u.email,
                    l.start_date,
                    l.due_date,
                    COALESCE(li_summary.total_installment, 0) AS total_installment,
                    COALESCE(li_summary.paid_installment, 0) AS paid_installment,
                    COALESCE(current_month_inst.installment_number, 0) AS current_month_installment,
                    COALESCE(current_month_inst.due_date, NULL) AS current_month_due_date,
                    COALESCE(current_month_inst.amount_total, 0) AS current_month_amount,
                    COALESCE(current_month_inst.inst_status_id, NULL) AS current_month_status_id,
                
                    CASE 
                        WHEN COALESCE(li_summary.total_installment, 0) > 0 
                        THEN (li_summary.paid_installment * 100.0 / li_summary.total_installment)
                        ELSE 0
                    END AS progress_percent
                
                FROM loan_applications la 
                INNER JOIN members m ON la.member_id = m.id
                INNER JOIN departments d ON m.department_id = d.id
                INNER JOIN users u ON m.user_id = u.id
                INNER JOIN loan_types lt ON la.loan_type_id = lt.id
                INNER JOIN loans l ON l.application_id = la.id   
                INNER JOIN statuses s on s.id = l.status_id
                JOIN (
                    SELECT 
                        loan_id,
                        COUNT(*) AS total_installment,
                        SUM(CASE WHEN status_id IN (29,30) THEN 1 ELSE 0 END) AS paid_installment
                    FROM loan_installments
                    GROUP BY loan_id
                ) li_summary ON li_summary.loan_id = l.id
                LEFT JOIN LATERAL (
            SELECT 
                li.id as inst_id,
                li.installment_number,
                li.due_date,
                li.amount_total,
                li.status_id as inst_status_id
            FROM loan_installments li
            WHERE li.loan_id = l.id
            AND DATE_TRUNC('month', li.due_date) = DATE_TRUNC('month', TO_DATE(%s || '-25', 'YYYY-MM-DD'))
            LIMIT 1
        ) current_month_inst ON TRUE
                WHERE 
                    l.status_id in (25,26) 
            AND u.is_active = true
        """
        with connection.cursor() as cursor:
            cursor.execute(query, [period_str])
            columns = [col[0] for col in cursor.description]
            results = [dict(zip(columns, row)) for row in cursor.fetchall()]
            
        return Response(results)

    @action(detail=False, methods=['get'])
    def payroll_loans_list(self, request):
        period = request.query_params.get('period')
        if not period:
            from datetime import datetime
            period = datetime.now().strftime('%Y-%m')
            
        try:
            year, month = period.split('-')
        except ValueError:
            return Response({'error': 'Invalid period format. Use YYYY-MM'}, status=400)

        query = """  
        SELECT 
            m.id as member_id, 
            m.full_name,
            m.nik_employee,
            d.department_name, 
            la.duration_months,
            l.total_amount as amount,
            lt.name as type_name,
            s.id as status_id,
            l.id as loan_id,
            l.remaining_balance,
            u.email,
            l.start_date,
            l.due_date,
            COALESCE(li_summary.total_installment, 0) AS total_installment,
            COALESCE(li_summary.paid_installment, 0) AS paid_installment,
            COALESCE(current_month_inst.inst_id, NULL) AS current_month_inst_id,
            COALESCE(current_month_inst.installment_number, 0) AS current_month_installment,
            COALESCE(current_month_inst.due_date, NULL) AS current_month_due_date,
            COALESCE(current_month_inst.amount_total, 0) AS current_month_amount,
            COALESCE(current_month_inst.inst_status_id, NULL) AS current_month_status_id,
        
            CASE 
                WHEN COALESCE(li_summary.total_installment, 0) > 0 
                THEN (li_summary.paid_installment * 100.0 / li_summary.total_installment)
                ELSE 0
            END AS progress_percent
        
        FROM loan_applications la 
        INNER JOIN members m ON la.member_id = m.id
        INNER JOIN departments d ON m.department_id = d.id
        INNER JOIN users u ON m.user_id = u.id
        INNER JOIN loan_types lt ON la.loan_type_id = lt.id
        INNER JOIN loans l ON l.application_id = la.id   
        INNER JOIN statuses s on s.id = l.status_id
        JOIN (
            SELECT 
                loan_id,
                COUNT(*) AS total_installment,
                SUM(CASE WHEN status_id IN (29,30) THEN 1 ELSE 0 END) AS paid_installment
            FROM loan_installments
            GROUP BY loan_id
        ) li_summary ON li_summary.loan_id = l.id
        LEFT JOIN LATERAL (
            SELECT 
                li.id as inst_id,
                li.installment_number,
                li.due_date,
                li.amount_total,
                li.status_id as inst_status_id
            FROM loan_installments li
            WHERE li.loan_id = l.id
            AND EXTRACT(YEAR FROM li.due_date) = %s
            AND EXTRACT(MONTH FROM li.due_date) = %s
            LIMIT 1
        ) current_month_inst ON TRUE
        WHERE 
            l.status_id = 25 
            AND u.is_active = true 
            AND m.employee_status_id IN (1,2)
            AND current_month_inst.inst_id IS NOT NULL
        """
        with connection.cursor() as cursor:
            cursor.execute(query, [year, month])
            columns = [col[0] for col in cursor.description]
            results = [dict(zip(columns, row)) for row in cursor.fetchall()]
            
        return Response(results)

    @action(detail=False, methods=['post'])
    def confirm_payroll_payments(self, request):
        installment_ids = request.data.get('installment_ids', [])
        period = request.data.get('period')

        if not installment_ids or not period:
            return Response({'error': 'installment_ids and period are required'}, status=400)

        results = []
        failed = []

        with connection.cursor() as cursor:
            for inst_id in installment_ids:
                cursor.execute("SELECT loan_payroll_installment(%s)", [inst_id])
                result_msg = cursor.fetchone()[0]
                if result_msg == 'SUCCESS':
                    results.append(inst_id)
                else:
                    failed.append({'installment_id': inst_id, 'reason': result_msg})

        if failed:
            return Response({
                'message': f'Processed {len(results)} payments. {len(failed)} failed.',
                'success': results,
                'failed': failed
            }, status=207)  # 207 Multi-Status

        return Response({'message': f'Successfully processed {len(results)} payments.'})

    @action(detail=False, methods=['post'])
    def rollback_payroll_payment(self, request):
        installment_id = request.data.get('installment_id')
        period = request.data.get('period')

        if not installment_id:
            return Response({'error': 'installment_id is required'}, status=400)

        with connection.cursor() as cursor:
            cursor.execute("SELECT rollback_loan_payroll_installment(%s)", [installment_id])
            result_msg = cursor.fetchone()[0]

        if result_msg == 'ROLLBACK SUCCESS':
            return Response({'message': result_msg})
        else:
            return Response({'error': result_msg}, status=400)

    @action(detail=False, methods=['get'])
    def admin_pending_stats(self, request):
        import datetime

        # Accept month/year filter, default to current period
        month_param = request.query_params.get('month')
        year_param = request.query_params.get('year')

        today = datetime.date.today()
        try:
            sel_month = int(month_param) if month_param else today.month
            sel_year = int(year_param) if year_param else today.year
        except ValueError:
            sel_month = today.month
            sel_year = today.year

        # Due date is always the 25th of the selected month
        try:
            period_due_date = datetime.date(sel_year, sel_month, 25)
        except ValueError:
            period_due_date = datetime.date(today.year, today.month, 25)

        member_query = """
        SELECT 
            COUNT(DISTINCT m.id) AS member,
            SUM(CASE WHEN l.status_id = 25 THEN 1 ELSE 0 END) AS active_loan
        FROM members m  
        JOIN users u ON u.id = m.user_id 
        LEFT JOIN loans l ON l.member_id = m.id 
        WHERE u.is_active = true;
        """
        
        collected_query = """
        SELECT SUM(amount_total) FROM loan_installments WHERE status_id IN (29,30) AND due_date = %s
        """
        
        overdue_query = """
        SELECT SUM(amount_total) FROM loan_installments WHERE status_id = 28 AND due_date = %s
        """
                
        with connection.cursor() as cursor:
            cursor.execute(member_query)
            member_row = cursor.fetchone()
            total_members = member_row[0] if member_row and member_row[0] else 0
            active_loans = member_row[1] if member_row and member_row[1] else 0
            
            cursor.execute(collected_query, [period_due_date])
            collected_row = cursor.fetchone()
            collected = collected_row[0] if collected_row and collected_row[0] else 0
            
            cursor.execute(overdue_query, [period_due_date])
            overdue_row = cursor.fetchone()
            overdue = overdue_row[0] if overdue_row and overdue_row[0] else 0
            
        return Response({
            'total_members': total_members,
            'active_loans': active_loans,
            'collected_this_month': collected,
            'total_overdue': overdue
        })

    @action(detail=False, methods=['post'])
    def send_reminder_email(self, request):
        from django.core.mail import send_mail
        from django.conf import settings
        
        member_ids = request.data.get('member_ids', [])
        
        if not member_ids or len(member_ids) == 0:
            return Response({'error': 'member_ids is required and cannot be empty'}, status=400)
        
        success_count = 0
        failed_count = 0
        errors = []
        
        try:
            # Build query with proper parameter placeholders
            placeholders = ','.join(['%s'] * len(member_ids))
            query = f"""
            SELECT 
                m.id as member_id,
                m.full_name,
                u.email,
                l.id as loan_id,
                li.installment_number,
                li.due_date,
                li.amount_total,
                lt.name as loan_type
            FROM loans l
            INNER JOIN members m ON l.member_id = m.id
            INNER JOIN users u ON m.user_id = u.id
            INNER JOIN loan_applications la ON l.application_id = la.id
            INNER JOIN loan_types lt ON la.loan_type_id = lt.id
            INNER JOIN loan_installments li ON li.loan_id = l.id
            WHERE m.id IN ({placeholders})
              AND li.status_id IN (27, 28)
              AND li.due_date <= CURRENT_DATE
              AND u.is_active = true
            """
            
            with connection.cursor() as cursor:
                cursor.execute(query, member_ids)
                columns = [col[0] for col in cursor.description]
                results = [dict(zip(columns, row)) for row in cursor.fetchall()]
            
            if not results:
                return Response({
                    'success_count': 0,
                    'failed_count': 0,
                    'errors': [],
                    'message': 'No overdue installments found for selected members'
                }, status=200)
            
            # Group by member for efficient emailing
            members_email_map = {}
            for row in results:
                member_id = row['member_id']
                if member_id not in members_email_map:
                    members_email_map[member_id] = {
                        'email': row['email'],
                        'full_name': row['full_name'],
                        'installments': []
                    }
                members_email_map[member_id]['installments'].append(row)
            
            # Send emails
            for member_id, data in members_email_map.items():
                try:
                    email = data['email']
                    full_name = data['full_name']
                    installments = data['installments']
                    
                    # Format installment details
                    installment_details = []
                    for inst in installments:
                        detail = f"Installment #{inst['installment_number']} - Due: {inst['due_date']} - Amount: Rp {inst['amount_total']:,.0f}"
                        installment_details.append(detail)
                    
                    subject = "Payment Reminder - Overdue Loan Installment"
                    
                    # Group installments in HTML table
                    inst_rows = ""
                    for inst in installments:
                        inst_rows += f"<tr><td style='padding: 8px 0;'>#{inst['installment_number']}</td><td style='padding: 8px 0;'>{inst['due_date']}</td><td style='padding: 8px 0; text-align: right;'><strong>Rp {inst['amount_total']:,.0f}</strong></td></tr>"

                    html_message = f"""
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
                        <h2 style="color: #f39c12; border-bottom: 2px solid #f39c12; padding-bottom: 10px;">Payment Reminder</h2>
                        <p style="font-size: 16px; color: #34495e;">Dear {full_name},</p>
                        <p style="font-size: 15px; color: #34495e;">This is a reminder that you have <strong>overdue</strong> loan payment(s) that require your attention.</p>
                        
                        <div style="background-color: #fffaf0; padding: 15px; border-radius: 5px; margin: 20px 0; border: 1px solid #f39c12;">
                            <h3 style="margin-top: 0; color: #2c3e50; font-size: 17px;">Outstanding Installments</h3>
                            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                                <tr style="border-bottom: 1px solid #f39c12;"><th style="text-align: left; padding: 5px 0;">No</th><th style="text-align: left; padding: 5px 0;">Due Date</th><th style="text-align: right; padding: 5px 0;">Amount</th></tr>
                                {inst_rows}
                            </table>
                        </div>
                        
                        <p style="font-size: 15px; color: #34495e;">Please make your payment as soon as possible to avoid additional penalties. If you have already made this payment, please disregard this message.</p>
                        <p style="font-size: 14px; color: #7f8c8d; margin-top: 30px;">Best regards,<br><strong>Koperasi Sanoh Admin</strong></p>
                    </div>
                    """
                        
                    send_mail(
                        subject,
                        "", # Plain text fallback
                        settings.DEFAULT_FROM_EMAIL,
                        [email],
                        fail_silently=False,
                        html_message=html_message
                    )
                    success_count += 1
                except Exception as e:
                    failed_count += 1
                    errors.append(f"Member {member_id}: {str(e)}")
            
            return Response({
                'success_count': success_count,
                'failed_count': failed_count,
                'errors': errors,
                'message': f'Reminder emails sent to {success_count} member(s)'
            })
        
        except Exception as e:
            return Response({'error': str(e)}, status=400)

    @action(detail=False, methods=['post'])
    def send_auto_all_reminders(self, request):
        """
        Automatically find and send reminders to ALL members with overdue installments.
        """
        from django.core.mail import send_mail
        from django.conf import settings
        
        try:
            # Find all members with overdue installments (Unpaid or Macet)
            query = """
            SELECT DISTINCT
                m.id as member_id,
                m.full_name,
                u.email,
                l.id as loan_id,
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
                return Response({
                    'message': 'No overdue installments found',
                    'success_count': 0
                })
            
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
                
                subject = "AUTOMATIC REMINDER - Overdue Loan Installment"
                
                # Group installments in HTML table
                inst_rows = ""
                for inst in installments:
                    inst_rows += f"<tr><td style='padding: 8px 0;'>#{inst['installment_number']}</td><td style='padding: 8px 0;'>{inst['due_date']}</td><td style='padding: 8px 0; text-align: right;'><strong>Rp {inst['amount_total']:,.0f}</strong></td></tr>"

                html_message = f"""
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
                    <h2 style="color: #f39c12; border-bottom: 2px solid #f39c12; padding-bottom: 10px;">Automatic System Reminder</h2>
                    <p style="font-size: 16px; color: #34495e;">Dear {full_name},</p>
                    <p style="font-size: 15px; color: #34495e;">This is an <strong>automated system reminder</strong> regarding your outstanding loan installments.</p>
                    
                    <div style="background-color: #fffaf0; padding: 15px; border-radius: 5px; margin: 20px 0; border: 1px solid #f39c12;">
                        <h3 style="margin-top: 0; color: #2c3e50; font-size: 17px;">Overdue Installments</h3>
                        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                            <tr style="border-bottom: 1px solid #f39c12;"><th style="text-align: left; padding: 5px 0;">No</th><th style="text-align: left; padding: 5px 0;">Due Date</th><th style="text-align: right; padding: 5px 0;">Amount</th></tr>
                            {inst_rows}
                        </table>
                    </div>
                    
                    <p style="font-size: 15px; color: #34495e;">Please settle these payments immediately. If you have any questions, contact the cooperative administration.</p>
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
                except:
                    pass
            
            return Response({
                'message': f'Auto-reminders sent to {success_count} member(s)',
                'success_count': success_count
            })
        except Exception as e:
            return Response({'error': str(e)}, status=400)

    @action(detail=False, methods=['get', 'post'])
    def test_send_email(self, request):
        """
        Test endpoint to send reminder email to member_id 1
        GET: returns member info
        POST: sends test email
        """
        from django.core.mail import send_mail
        from django.conf import settings
        
        member_id = 1
        
        try:
            # Get member and overdue installments
            query = """
            SELECT 
                m.id as member_id,
                m.full_name,
                u.email,
                l.id as loan_id,
                li.installment_number,
                li.due_date,
                li.amount_total,
                lt.name as loan_type
            FROM loans l
            INNER JOIN members m ON l.member_id = m.id
            INNER JOIN users u ON m.user_id = u.id
            INNER JOIN loan_applications la ON l.application_id = la.id
            INNER JOIN loan_types lt ON la.loan_type_id = lt.id
            INNER JOIN loan_installments li ON li.loan_id = l.id
            WHERE m.id = %s
              AND li.status_id IN (27, 28)
              AND li.due_date <= CURRENT_DATE
              AND u.is_active = true
            """
            
            with connection.cursor() as cursor:
                cursor.execute(query, [member_id])
                columns = [col[0] for col in cursor.description]
                results = [dict(zip(columns, row)) for row in cursor.fetchall()]
            
            if not results:
                return Response({
                    'message': f'No overdue installments found for member_id {member_id}',
                    'member_id': member_id
                }, status=404)
            
            # Prepare member data
            member_data = results[0]
            email = member_data['email']
            full_name = member_data['full_name']
            
            if request.method == 'GET':
                # Return member info
                return Response({
                    'member_id': member_id,
                    'full_name': full_name,
                    'email': email,
                    'installments': results,
                    'message': 'Ready to send test email. Use POST to send.'
                })
            
            # POST: Send email
            installment_details = []
            for inst in results:
                detail = f"Installment #{inst['installment_number']} - Due: {inst['due_date']} - Amount: Rp {inst['amount_total']:,.0f}"
                installment_details.append(detail)
            
            subject = "Payment Reminder - Overdue Loan Installment (TEST)"
            message = f"""
Dear {full_name},

This is a test reminder email that you have overdue loan payment(s).

Outstanding Installments:
{chr(10).join(installment_details)}

Please make your payment as soon as possible to avoid additional penalties.

If you have already made this payment, please disregard this message.

Best regards,
Sanoh Koperasi Admin
            """
            
            send_mail(
                subject,
                message,
                settings.DEFAULT_FROM_EMAIL,
                [email],
                fail_silently=False,
            )
            
            return Response({
                'success': True,
                'message': f'Test email sent successfully to {email}',
                'member_id': member_id,
                'full_name': full_name,
                'email': email,
                'installments_count': len(results)
            })
        
        except Exception as e:
            return Response({'error': str(e)}, status=400)


    @action(detail=False, methods=['get'])
    def member_list_manual_payment(self, request):
        """
        Get list of active members for dropdown selection.
        """
        query = """
        SELECT m.id, m.full_name, m.nik_employee 
        FROM members m
        INNER JOIN users u ON m.user_id = u.id
        WHERE u.is_active = true
        ORDER BY m.full_name ASC
        """
        with connection.cursor() as cursor:
            cursor.execute(query)
            columns = [col[0] for col in cursor.description]
            results = [dict(zip(columns, row)) for row in cursor.fetchall()]
        return Response(results)

    @action(detail=False, methods=['get'])
    def get_member_outstanding_detail(self, request):
        """
        Execute the complex outstanding query for a specific member with dynamic date range.
        Includes loans, mandatory and voluntary saving information.
        Accepts optional ?month=M&year=Y to filter by a specific billing period.
        """
        member_id = request.query_params.get('member_id')
        if not member_id:
            return Response({'error': 'member_id is required'}, status=400)

        month_param = request.query_params.get('month')
        year_param = request.query_params.get('year')
        today = datetime.date.today()

        if month_param and year_param:
            try:
                sel_month = int(month_param)
                sel_year = int(year_param)
                # Billing cycle: 25th of previous month → 25th of selected month
                end_date = datetime.date(sel_year, sel_month, 25)
                start_date = add_months(end_date, -1)
            except (ValueError, TypeError):
                # Fallback to current period
                end_date = today.replace(day=25)
                start_date = add_months(end_date, -1)
        else:
            # Default: current billing period based on today
            if today.day >= 25:
                start_date = today.replace(day=25)
                end_date = add_months(start_date, 1)
            else:
                end_date = today.replace(day=25)
                start_date = add_months(end_date, -1)

        query = f"""
        WITH params AS (
            SELECT 
                DATE '{start_date}' AS start_date,
                DATE '{end_date}' AS end_date
        )
        SELECT 
            m.id,
            m.full_name,
            u.email,
            m.phone_number,
            d.department_name,
            m.nik_employee,

            COALESCE(s.remaining_balance, 0) AS loans_balance,

            mba.account_number,
            mba.account_holder_name,
            b.bank_name,

            -- Mandatory Monthly Obligation
            MAX(
                CASE
                    WHEN st.name = 'MANDATORY'
                    THEN mso.monthly_amount
                    ELSE 0
                END
            ) AS mandatory_monthly_amount,

            -- Voluntary Monthly Obligation
            MAX(
                CASE
                    WHEN st.name = 'VOLUNTARY'
                    THEN mso.monthly_amount
                    ELSE 0
                END
            ) AS voluntary_monthly_amount,

            -- Mandatory Outstanding
            MAX(
                CASE
                    WHEN st.name = 'MANDATORY'
                    THEN (
                        SELECT COALESCE(
                            SUM(
                                msb2.amount_due - COALESCE(msb2.amount_paid, 0)
                            ),
                            0
                        )
                        FROM monthly_saving_bills msb2
                        CROSS JOIN params p
                        WHERE msb2.member_id = m.id and msb2.status_id=38
                          AND msb2.saving_type_id = st.id
                          AND msb2.bill_period_start <= p.end_date
                          AND msb2.bill_period_end >= p.start_date
                          AND (
                                msb2.amount_due - COALESCE(msb2.amount_paid, 0)
                              ) > 0
                    )
                    ELSE 0
                END
            ) AS mandatory_outstanding,

            -- Voluntary Outstanding
            MAX(
                CASE
                    WHEN st.name = 'VOLUNTARY'
                    THEN (
                        SELECT COALESCE(
                            SUM(
                                msb2.amount_due - COALESCE(msb2.amount_paid, 0)
                            ),
                            0
                        )
                        FROM monthly_saving_bills msb2
                        CROSS JOIN params p
                        WHERE msb2.member_id = m.id and msb2.status_id=38
                          AND msb2.saving_type_id = st.id
                          AND msb2.bill_period_start <= p.end_date
                          AND msb2.bill_period_end >= p.start_date
                          AND (
                                msb2.amount_due - COALESCE(msb2.amount_paid, 0)
                              ) > 0
                    )
                    ELSE 0
                END
            ) AS voluntary_outstanding,

            -- Total Saving Balance (Independent Subquery for accuracy)
            (SELECT COALESCE(SUM(balance), 0) FROM saving_wallets WHERE member_id = m.id) AS amount_saving_balance,

            -- Loan Deduction
            CASE
                WHEN EXISTS (
                    SELECT 1
                    FROM loan_installments li
                    CROSS JOIN params p
                    WHERE li.loan_id = s.id
                      AND li.status_id = 28
                      AND li.due_date >= p.start_date
                      AND li.due_date < p.end_date
                )
                THEN (
                    SELECT COALESCE(
                        SUM(li.amount_total),
                        0
                    )
                    FROM loan_installments li
                    CROSS JOIN params p
                    WHERE li.loan_id = s.id
                      AND li.status_id = 28
                      AND li.due_date >= p.start_date
                      AND li.due_date < p.end_date
                )
                ELSE 0
            END AS loan_deduction

        FROM members m
        INNER JOIN users u ON u.id = m.user_id
        LEFT JOIN loans s ON s.member_id = m.id AND s.status_id = 25
        LEFT JOIN saving_wallets sw ON sw.member_id = m.id
        LEFT JOIN member_bank_accounts mba ON mba.member_id = m.id
        LEFT JOIN banks b ON b.id = mba.bank_id
        INNER JOIN departments d ON d.id = m.department_id
        INNER JOIN member_saving_obligations mso ON mso.member_id = m.id
        INNER JOIN saving_types st ON st.id = mso.saving_type_id
        WHERE u.is_active = true
          AND m.id = %s
        GROUP BY
            m.id,
            m.full_name,
            u.email,
            m.phone_number,
            d.department_name,
            m.nik_employee,
            s.remaining_balance,
            s.id,
            mba.account_number,
            mba.account_holder_name,
            b.bank_name
        """
        
        try:
            with connection.cursor() as cursor:
                cursor.execute(query, [member_id])
                columns = [col[0] for col in cursor.description]
                row = cursor.fetchone()
                if row:
                    result = dict(zip(columns, row))
                    return Response(result)
                return Response({'error': 'Member not found or no active loan/bank account'}, status=404)
        except Exception as e:
            return Response({'error': str(e)}, status=400)

    @action(detail=False, methods=['post'])
    def process_manual_payments(self, request):
        """
        Process multiple manual payments (Savings, Loans) or a single Withdrawal.
        Invokes stored procedures: manual_loan_installment, manual_savings_transaction, 
        or manual_withdrawal_transaction.
        """
        member_id = request.data.get('member_id')
        notes = request.data.get('notes', '')
        admin_id = request.user.id if request.user.is_authenticated else 1 # Fallback for dev
        
        # Parse payments JSON string
        import json
        try:
            payments_data = json.loads(request.data.get('payments', '[]'))
        except:
            return Response({'error': 'Invalid payments data format'}, status=400)

        if not member_id or not payments_data:
            return Response({'error': 'Member and payment details are required'}, status=400)

        # Handle File Upload
        proof_file = request.FILES.get('proof_file')
        file_path = None
        if proof_file:
            from django.core.files.storage import FileSystemStorage
            import os
            fs = FileSystemStorage(location=os.path.join(settings.MEDIA_ROOT, 'manual_payments'))
            filename = fs.save(proof_file.name, proof_file)
            file_path = os.path.join('manual_payments', filename)

        results = []
        errors = []

        try:
            with transaction.atomic():
                with connection.cursor() as cursor:
                    for p in payments_data:
                        p_type = p.get('type')
                        p_amount = p.get('amount')
                        
                        if not p_type or not p_amount: continue

                        try:
                            # 1. LOAN REPAYMENT
                            if p_type == 'loan':
                                # Find oldest unpaid installment
                                cursor.execute("""
                                    SELECT li.id FROM loan_installments li
                                    INNER JOIN loans l ON l.id = li.loan_id
                                    WHERE l.member_id = %s AND l.status_id = 25 
                                      AND li.status_id IN (27, 28)
                                    ORDER BY li.due_date ASC LIMIT 1
                                """, [member_id])
                                inst = cursor.fetchone()
                                if inst:
                                    cursor.execute("SELECT manual_loan_installment(%s, %s, %s, %s, %s)", 
                                                 [inst[0], member_id, file_path, admin_id, notes])
                                    res_msg = cursor.fetchone()[0]
                                    if 'SUCCESS' in res_msg: 
                                        results.append(f"Loan: {res_msg}")
                                    else: 
                                        errors.append(f"Loan: {res_msg}")
                                        raise Exception(f"Loan SP failed: {res_msg}")
                                else:
                                    errors.append("Loan: No unpaid installments found")

                            # 2. SAVINGS
                            elif p_type in ['mandatory', 'voluntary']:
                                s_type_id = 1 if p_type == 'mandatory' else 2
                                cursor.execute("""
                                    SELECT id FROM monthly_saving_bills 
                                    WHERE member_id = %s AND saving_type_id = %s AND status_id = 38
                                    ORDER BY bill_period_start ASC LIMIT 1
                                """, [member_id, s_type_id])
                                bill = cursor.fetchone()
                                if bill:
                                    cursor.execute("SELECT manual_savings_transaction(%s, %s, %s, %s, %s, %s)", 
                                                 [bill[0], member_id, s_type_id, file_path, admin_id, notes])
                                    res_msg = cursor.fetchone()[0]
                                    if 'SUCCESS' in res_msg: 
                                        results.append(f"{p_type.capitalize()}: {res_msg}")
                                    else: 
                                        errors.append(f"{p_type.capitalize()}: {res_msg}")
                                        raise Exception(f"{p_type.capitalize()} SP failed: {res_msg}")
                                else:
                                    errors.append(f"{p_type.capitalize()}: No pending bills found")

                            # 3. WITHDRAWAL
                            elif p_type == 'withdrawal':
                                cursor.execute("SELECT manual_withdrawal_transaction(%s, %s, %s, %s, %s)", 
                                             [member_id, admin_id, p_amount, file_path, notes])
                                res_msg = cursor.fetchone()[0]
                                if 'SUCCESS' in res_msg or 'SUCCESS' in res_msg.upper(): 
                                    results.append(f"Withdrawal: {res_msg}")
                                else: 
                                    errors.append(f"Withdrawal: {res_msg}")
                                    raise Exception(f"Withdrawal SP failed: {res_msg}")

                        except Exception as e:
                            # If it's not our raised Exception, it's a DB/System error
                            if "SP failed" not in str(e):
                                errors.append(f"{p_type}: {str(e)}")
                            raise # Re-raise to trigger transaction rollback

            return Response({
                'message': 'All payments processed successfully',
                'results': results
            })

        except Exception as e:
            # Atomic transaction rolled back everything
            return Response({
                'error': 'One or more payments failed. All changes rolled back.',
                'details': errors if errors else [str(e)]
            }, status=400)
        finally:
            # Send Email Notification if successful
            if not errors and results:
                try:
                    with connection.cursor() as cursor:
                        cursor.execute("""
                            SELECT u.email, m.full_name 
                            FROM members m
                            INNER JOIN users u ON u.id = m.user_id
                            WHERE m.id = %s
                        """, [member_id])
                        user_info = cursor.fetchone()
                        
                    if user_info and user_info[0]:
                        member_email = user_info[0]
                        member_name = user_info[1]
                        
                        subject = 'Payment Confirmation - Koperasi Sanoh'
                        
                        from django.utils import timezone
                        new_date_str = timezone.now().strftime('%d %B %Y, %H:%M')
                        
                        # Calculate total amount directly from payments_data
                        total_processed = 0
                        for p in payments_data:
                            try:
                                raw_amt = p.get('amount', 0)
                                if raw_amt:
                                    clean_amt = re.sub(r'[^\d]', '', str(raw_amt))
                                    if clean_amt:
                                        total_processed += int(clean_amt)
                            except:
                                pass

                        html_message = f"""
                        <html>
                        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                            <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                                <h2 style="color: #0F172A; text-align: center;">Payment Confirmation</h2>
                                <p>Dear <strong>{member_name}</strong>,</p>
                                <p>This is to confirm that your payment has been successfully processed by the administrator.</p>
                                
                                <div style="text-align: center; margin: 25px 0; padding: 20px; background-color: #F8FAFC; border-radius: 12px; border: 1px dashed #CBD5E1;">
                                    <span style="display: block; font-size: 14px; color: #64748B; text-transform: uppercase; letter-spacing: 1px;">Total Amount Processed</span>
                                    <span style="display: block; font-size: 32px; font-weight: 800; color: #0F172A; margin-top: 5px;">Rp {total_processed:,.0f}</span>
                                </div>

                                <div style="margin: 20px 0;">
                                    <h4 style="color: #475569; margin-bottom: 10px; font-size: 14px; text-transform: uppercase;">Transaction Details:</h4>
                                    <ul style="list-style-type: none; padding: 0;">
                                        { "".join([f'<li style="padding: 10px; margin-bottom: 5px; background: #fff; border: 1px solid #F1F5F9; border-radius: 6px; display: flex; align-items: center;"><span style="color: #10B981; margin-right: 10px;">✔</span> {r}</li>' for r in results]) }
                                    </ul>
                                </div>
                                <p><strong>Notes:</strong> {notes if notes else '-'}</p>
                                <p><strong>Date:</strong> {new_date_str}</p>
                                { f'<p style="color: #0284C7;"><i>*Proof of payment has been attached to this email.</i></p>' if file_path else '' }
                                <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
                                <p style="font-size: 12px; color: #64748b; text-align: center;">
                                    This is an automated message from <strong>Koperasi Sanoh Sinergi Bersama</strong>. Please do not reply to this email.
                                </p>
                            </div>
                        </body>
                        </html>
                        """
                        
                        plain_message = strip_tags(html_message)
                        
                        email = EmailMessage(
                            subject,
                            plain_message,
                            settings.DEFAULT_FROM_EMAIL,
                            [member_email],
                        )
                        email.content_subtype = "html"
                        email.body = html_message
                        
                        # Attach proof file if exists
                        if file_path:
                            absolute_file_path = os.path.join(settings.MEDIA_ROOT, file_path)
                            if os.path.exists(absolute_file_path):
                                email.attach_file(absolute_file_path)

                        email.send(fail_silently=True)
                except Exception as mail_err:
                    print(f"Failed to send manual payment email: {str(mail_err)}")
    @action(detail=False, methods=['post'])
    def update_loan_status(self, request):
        """
        Update loan status based on payment status.
        If member hasn't paid by due date -> status 27 (Macet/Delinquent)
        If member has paid late -> status 30 (Terlambat/Late Paid)
        """
        try:
            # Get all overdue unpaid installments
            query = """
            SELECT 
                l.id as loan_id,
                m.id as member_id,
                li.id as installment_id,
                li.due_date,
                li.status_id as current_status_id,
                CASE 
                    WHEN li.status_id IN (29) THEN 'PAID'
                    WHEN li.status_id IN (30) THEN 'LATE_PAID'
                    WHEN li.status_id = 27 THEN 'MACET'
                    WHEN li.status_id IN (27, 28) AND li.due_date < CURRENT_DATE THEN 'OVERDUE_UNPAID'
                    ELSE 'PENDING'
                END as payment_status
            FROM loans l
            INNER JOIN members m ON l.member_id = m.id
            INNER JOIN users u ON m.user_id = u.id
            INNER JOIN loan_installments li ON li.loan_id = l.id
            WHERE u.is_active = true AND l.status_id IN (25, 26)
            """
            
            with connection.cursor() as cursor:
                cursor.execute(query)
                columns = [col[0] for col in cursor.description]
                results = [dict(zip(columns, row)) for row in cursor.fetchall()]
            
            # Update statuses
            updates = []
            from django.db import connection as db_connection
            
            for row in results:
                installment_id = row['installment_id']
                current_status_id = row['current_status_id']
                payment_status = row['payment_status']
                
                # If overdue unpaid, set to status 27 (Macet)
                if payment_status == 'OVERDUE_UNPAID' and current_status_id not in [27, 30]:
                    with db_connection.cursor() as cursor:
                        update_query = """
                        UPDATE loan_installments 
                        SET status_id = 27, updated_at = NOW()
                        WHERE id = %s
                        """
                        cursor.execute(update_query, [installment_id])
                    updates.append({'installment_id': installment_id, 'new_status': 27})
            
            return Response({
                'updates_count': len(updates),
                'updates': updates,
                'message': f'Successfully updated {len(updates)} loan status(es)'
            })
        except Exception as e:
            return Response({'error': str(e)}, status=400)

    @action(detail=False, methods=['get'])
    def dashboard_summary(self, request):
        """
        Get financial summary for the logged-in member dashboard.
        Includes saving balances, remaining loan, and total outstanding bills/installments.
        """
        if not request.user.is_authenticated or not hasattr(request.user, 'member'):
            # Fallback member_id for development/testing if not logged in
            member_id = request.query_params.get('member_id', 1)
        else:
            member_id = request.user.member.id

        query = """
        WITH member_info AS (
            SELECT full_name FROM members WHERE id = %s
        ),
        saving_data AS (
            SELECT 
                SUM(CASE WHEN saving_type_id = 1 THEN balance ELSE 0 END) as mandatory_balance,
                SUM(CASE WHEN saving_type_id = 2 THEN balance ELSE 0 END) as voluntary_balance,
                SUM(CASE WHEN saving_type_id = 3 THEN balance ELSE 0 END) as principle_balance,
                SUM(balance) as total_saving_balance
            FROM saving_wallets 
            WHERE member_id = %s
        ),
        saving_growth AS (
            -- Simplified growth: (Total Transactions This Month / Total Balance) * 100
            SELECT
                COALESCE(SUM(CASE WHEN saving_type_id = 1 AND transaction_date >= date_trunc('month', current_date) THEN amount ELSE 0 END), 0) as mandatory_month_inc,
                COALESCE(SUM(CASE WHEN saving_type_id = 2 AND transaction_date >= date_trunc('month', current_date) THEN amount ELSE 0 END), 0) as voluntary_month_inc,
                COALESCE(SUM(CASE WHEN saving_type_id = 3 AND transaction_date >= date_trunc('month', current_date) THEN amount ELSE 0 END), 0) as principle_month_inc
            FROM saving_transactions
            WHERE member_id = %s AND transaction_type_id IN (SELECT id FROM transaction_types WHERE name IN ('DEPOSIT', 'MANDATORY', 'VOLUNTARY', 'PRINCIPLE'))
        ),
        active_loan AS (
            SELECT id, principal_amount, remaining_balance 
            FROM loans 
            WHERE member_id = %s AND status_id = 25 
            LIMIT 1
        ),
        loan_stats AS (
            SELECT 
                COALESCE(al.principal_amount, 0) as principal_amount,
                COALESCE(al.remaining_balance, 0) as total_loan_remaining,
                (SELECT COUNT(*) FROM loan_installments WHERE loan_id = al.id) as total_installments,
                (SELECT COUNT(*) FROM loan_installments WHERE loan_id = al.id AND status_id = 29) as paid_installments
            FROM active_loan al
        ),
        next_payment AS (
            SELECT 
                li.due_date as next_due_date,
                li.amount_total as next_due_amount
            FROM loan_installments li
            JOIN active_loan al ON al.id = li.loan_id
            WHERE li.status_id IN (27, 28)
            ORDER BY li.due_date ASC
            LIMIT 1
        ),
        outstanding_bills AS (
            SELECT 
                COALESCE(SUM(amount_due - COALESCE(amount_paid, 0)), 0) as total_unpaid_bills
            FROM monthly_saving_bills 
            WHERE member_id = %s AND status_id = 38 -- Pending/Unpaid
        ),
        outstanding_installments AS (
            SELECT 
                COALESCE(SUM(amount_total), 0) as total_unpaid_installments
            FROM loan_installments li
            JOIN loans l ON l.id = li.loan_id
            WHERE l.member_id = %s AND li.status_id IN (27, 28) -- Unpaid/Macet
        )
        SELECT 
            mi.full_name,
            sd.*, 
            sg.*,
            COALESCE(ls.principal_amount, 0) as principal_amount,
            COALESCE(ls.total_loan_remaining, 0) as total_loan_remaining,
            COALESCE(ls.total_installments, 0) as total_installments,
            COALESCE(ls.paid_installments, 0) as paid_installments,
            np.next_due_date,
            np.next_due_amount,
            ob.total_unpaid_bills,
            oi.total_unpaid_installments,
            (COALESCE(ls.total_loan_remaining, 0) + ob.total_unpaid_bills + oi.total_unpaid_installments) as grand_total_outstanding
        FROM member_info mi
        CROSS JOIN saving_data sd
        CROSS JOIN saving_growth sg
        LEFT JOIN loan_stats ls ON true
        LEFT JOIN next_payment np ON true
        CROSS JOIN outstanding_bills ob
        CROSS JOIN outstanding_installments oi
        """

        try:
            with connection.cursor() as cursor:
                cursor.execute(query, [member_id, member_id, member_id, member_id, member_id, member_id])
                columns = [col[0] for col in cursor.description]
                row = cursor.fetchone()
                result = dict(zip(columns, row)) if row else {}
                return Response(result)
        except Exception as e:
            return Response({'error': str(e)}, status=400)

    @action(detail=False, methods=['get'])
    def my_transactions(self, request):
        """
        Get recent transactions specifically for the logged-in member with filtering.
        """
        if not request.user.is_authenticated or not hasattr(request.user, 'member'):
            member_id = request.query_params.get('member_id', 1)
        else:
            member_id = request.user.member.id

        tx_type = request.query_params.get('type', 'all')
        
        # Build individual queries
        savings_q = """
            SELECT st.transaction_date, tt.name AS transaction_type, st.amount, s.status_name AS status, st.payment_reference_id AS reference
            FROM saving_transactions st
            INNER JOIN transaction_types tt ON tt.id = st.transaction_type_id
            INNER JOIN statuses s ON s.id = st.status_id
            WHERE st.member_id = %s
        """
        
        withdrawal_q = """
            SELECT w.request_date AS transaction_date, 'WITHDRAWAL' AS transaction_type, w.amount, s.status_name AS status, w.payment_reference_id AS reference
            FROM withdrawals w
            INNER JOIN statuses s ON s.id = w.status_id
            WHERE w.member_id = %s
        """
        
        loan_q = """
            SELECT lp.payment_date AS transaction_date, 'LOAN INSTALLMENT' AS transaction_type, lp.amount_paid AS amount, s.status_name AS status, lp.payment_reference_id AS reference
            FROM loan_payments lp
            INNER JOIN statuses s ON s.id = lp.status_id
            INNER JOIN loan_installments li ON li.id = lp.installment_id
            INNER JOIN loans l ON l.id = li.loan_id
            WHERE l.member_id = %s
        """

        queries = []
        params = []

        if tx_type == 'all' or tx_type == 'deposit':
            queries.append(savings_q)
            params.append(member_id)
        
        if tx_type == 'all' or tx_type == 'withdrawal':
            queries.append(withdrawal_q)
            params.append(member_id)
            
        if tx_type == 'all' or tx_type == 'loan':
            queries.append(loan_q)
            params.append(member_id)

        # Still keep support for specific ones just in case
        if tx_type in ['mandatory', 'voluntary', 'principal']:
            if tx_type == 'mandatory': st_name = 'MANDATORY'
            elif tx_type == 'voluntary': st_name = 'VOLUNTARY'
            else: st_name = 'PRINCIPLE'
            queries = [savings_q + " AND tt.name = %s"]
            params = [member_id, st_name]

        full_query = " UNION ALL ".join(queries) + " ORDER BY transaction_date DESC LIMIT 10"

        try:
            with connection.cursor() as cursor:
                cursor.execute(full_query, params)
                columns = [col[0] for col in cursor.description]
                rows = cursor.fetchall()
                results = [dict(zip(columns, row)) for row in rows]
                return Response(results)
        except Exception as e:
            return Response({'error': str(e)}, status=400)

class LoanInstallmentViewSet(viewsets.ModelViewSet):
    serializer_class = LoanInstallmentSerializer

    def get_queryset(self):
        if self.request.user.is_authenticated and hasattr(self.request.user, 'member'):
            return LoanInstallment.objects.filter(loan__member=self.request.user.member)
        return LoanInstallment.objects.all()