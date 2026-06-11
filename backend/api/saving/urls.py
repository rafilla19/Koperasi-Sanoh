# savings/urls.py
from django.urls import path
from . import views

urlpatterns = [
    # ── Member ──────────────────────────────────────────────────
    path('my-profile/', views.my_member_profile, name='my-profile'),
    path('my-savings/wallets/', views.my_saving_wallets, name='my-saving-wallets'),
    path('my-savings/transactions/', views.my_saving_transactions, name='my-saving-transactions'),
    path('my-savings/withdrawals/', views.my_withdrawals, name='my-withdrawals'),
    path('my-savings/voluntary-request/', views.my_voluntary_request, name='my-voluntary-request'),
    path('my-savings/notifications/', views.my_notifications, name='my-notifications'),
    path('my-savings/obligations/', views.my_saving_obligations, name='my-saving-obligations'),
    path('my-savings/payment-schedule/', views.my_payment_schedule, name='my-payment-schedule'),
    path('my-savings/monthly-trend/', views.my_savings_monthly_trend, name='my-savings-monthly-trend'),
    path('my-savings/timeline/', views.my_savings_timeline, name='my-savings-timeline'),
    path('my-savings/paid-bills/', views.my_paid_bills, name='my-paid-bills'),

    # ── Admin: dashboard ────────────────────────────────────────
    # GET  → current mandatory amount
    # PATCH → update mandatory amount (body: { new_amount })
    path('admin/savings/mandatory-amount/', views.admin_mandatory_amount, name='admin-mandatory-amount'),
    # PUT  → bulk-update all active member obligations + saving_types (body: { amount })
    path('savings/mandatory/update-all/', views.admin_mandatory_update_all, name='admin-mandatory-update-all'),

    # ── Admin: pending approvals ────────────────────────────────
    # GET  ?status=pending|approved|rejected  ?search=
    path('admin/savings/voluntary-requests/', views.admin_voluntary_requests, name='admin-voluntary-requests'),
    # POST → approve
    path('admin/savings/voluntary-requests/<int:pk>/approve/', views.admin_approve_voluntary_request, name='admin-approve-voluntary'),
    # POST → reject  (body: { reject_reason })
    path('admin/savings/voluntary-requests/<int:pk>/reject/', views.admin_reject_voluntary_request, name='admin-reject-voluntary'),

    # ── Admin: savings management ───────────────────────────────
    # GET  ?search=  ?month=  ?year=  ?saving_type=  ?status=
    path('admin/savings/transactions/', views.admin_all_transactions, name='admin-all-transactions'),
    # GET  ?search=  ?status=  ?month=  ?year=
    path('admin/savings/withdrawals/', views.admin_all_withdrawals, name='admin-all-withdrawals'),
    # GET  → single withdrawal detail with member + bank info
    path('admin/savings/withdrawals/<int:pk>/', views.admin_withdrawal_detail, name='admin-withdrawal-detail'),
    # POST → approve
    path('admin/savings/withdrawals/<int:pk>/approve/', views.admin_approve_withdrawal, name='admin-approve-withdrawal'),
    # POST body: { reject_reason }
    path('admin/savings/withdrawals/<int:pk>/reject/', views.admin_reject_withdrawal, name='admin-reject-withdrawal'),
    # POST multipart: proof_file
    path('admin/savings/withdrawals/<int:pk>/upload-transfer/', views.admin_upload_transfer, name='admin-upload-transfer'),
    # GET  ?month= ?year= ?search= ?status= → per-member obligation amounts + bill status
    path('admin/savings/member-obligations/', views.admin_member_obligations, name='admin-member-obligations'),
    # POST → generate bills (body: { month, year, include_mandatory, include_voluntary, member_ids? })
    path('admin/savings/bills/generate/', views.admin_generate_bills, name='admin-generate-bills'),
    # GET  → KPI stats (savings active, pending count, pending total)
    path('admin/dashboard/overview/', views.admin_dashboard_overview, name='admin-dashboard-overview'),
    path('admin/savings/stats/', views.admin_savings_stats, name='admin-savings-stats'),
    # GET  ?months=<3|6|12>  → analytics overview + monthly trend
    path('admin/savings/analytics/', views.admin_savings_analytics, name='admin-savings-analytics'),
    # GET  → list all departments for dropdown filter
    path('admin/departments/', views.admin_departments_list, name='admin-departments-list'),
    # GET  ?search= ?department_id= → per-member savings wallet summary
    path('admin/savings/member-wallets/', views.admin_member_wallets, name='admin-member-wallets'),

]
