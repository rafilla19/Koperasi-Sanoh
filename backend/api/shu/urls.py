# shu/urls.py
from django.urls import path
from . import views

urlpatterns = [
    # ── Master Configuration ─────────────────────────────────────
    # GET  → list | POST → create
    path('admin/shu/master-configurations/', views.admin_master_configurations, name='admin-shu-master-configurations'),
    # PATCH / DELETE → update or remove one item
    path('admin/shu/master-configurations/<int:pk>/', views.admin_master_configuration_detail, name='admin-shu-master-configuration-detail'),

    # ── Member ──────────────────────────────────────────────────
    # GET  → SHU Analytics chart dan ringkasan
    path('my-shu/analytics/', views.my_shu_analytics, name='my-shu-analytics'),
    # GET  → daftar SHU yang diterima member
    path('my-shu/', views.my_shu_distributions, name='my-shu-distributions'),
    # GET  → detail SHU satu periode
    path('my-shu/<int:pk>/', views.my_shu_detail, name='my-shu-detail'),

    # ── Admin: Periode ───────────────────────────────────────────
    # GET  → daftar semua periode SHU
    path('admin/shu/periods/', views.admin_shu_periods, name='admin-shu-periods'),
    # POST → buat periode SHU baru
    path('admin/shu/periods/create/', views.admin_shu_period_create, name='admin-shu-period-create'),
    # GET / PATCH → detail atau update periode
    path('admin/shu/periods/<int:pk>/', views.admin_shu_period_detail, name='admin-shu-period-detail'),
    # POST → hitung SHU per member untuk periode ini
    path('admin/shu/periods/<int:pk>/calculate/', views.admin_shu_calculate, name='admin-shu-calculate'),

    # ── Admin: Distribusi ────────────────────────────────────────
    # GET  ?search= ?status= → daftar distribusi per member dalam satu periode
    path('admin/shu/periods/<int:period_pk>/distributions/', views.admin_shu_distributions, name='admin-shu-distributions'),
    # POST → approve semua distribusi pending dalam satu periode
    path('admin/shu/periods/<int:period_pk>/bulk-approve/', views.admin_shu_bulk_approve, name='admin-shu-bulk-approve'),
    # POST → tandai semua distribusi approved menjadi paid
    path('admin/shu/periods/<int:period_pk>/bulk-pay/', views.admin_shu_bulk_pay, name='admin-shu-bulk-pay'),
    # PATCH → update status distribusi satu member
    path('admin/shu/distributions/<int:pk>/', views.admin_shu_distribution_update, name='admin-shu-distribution-update'),

    # ── Admin: Member Bases (Daftar Pembagian SHU Anggota) ───────────
    # GET ?search= → daftar anggota + simpanan wajib/sukarela/total + SHU Jasa Modal
    path('admin/shu/member-bases/', views.admin_shu_member_bases, name='admin-shu-member-bases'),
    # POST → simpan hasil per-anggota ke tabel shu_member_bases untuk periode tertentu
    path('admin/shu/member-bases/distribute/', views.admin_shu_member_bases_distribute, name='admin-shu-member-bases-distribute'),

    # ── Admin: SHU Results ───────────────────────────────────────
    # GET ?year= ?month= → cek hasil | POST → simpan distribusi SHU
    path('admin/shu/results/', views.admin_shu_results, name='admin-shu-results'),
    # GET ?year= ?month= → list allocations | POST → save modified allocations
    path('admin/shu/component-allocations/', views.get_component_allocations, name='admin-shu-component-allocations'),
    path('admin/shu/component-allocations/save/', views.save_component_allocations, name='admin-shu-component-allocations-save'),
    # GET ?range=1month|3month|6month|1year|3year → series data dari shu_results.net_profit
    path('admin/shu/net-sales/', views.admin_shu_net_sales, name='admin-shu-net-sales'),
    # GET ?range=weekly|3month|6month|1year|3year → weekly income/expense cashflow
    path('admin/shu/weekly-cashflow/', views.admin_shu_weekly_cashflow, name='admin-shu-weekly-cashflow'),

    # ── Admin: Monthly Jasa Modal Distribution ─────────────────
    # POST { year, month } → distribusikan SHU Jasa Modal bulanan ke shu_member_distributions_monthly
    path('admin/shu/jasa-modal-monthly/distribute/', views.admin_shu_monthly_distribute, name='admin-shu-monthly-distribute'),
    # GET ?year= &month= &search= → list distribusi bulanan
    path('admin/shu/jasa-modal-monthly/', views.admin_shu_monthly_distributions, name='admin-shu-monthly-distributions'),
    # PATCH / DELETE → edit atau hapus satu record distribusi bulanan
    path('admin/shu/jasa-modal-monthly/<int:pk>/', views.admin_shu_monthly_distribution_detail, name='admin-shu-monthly-distribution-detail'),

    # ── Admin: Annual Jasa Modal Distribution ──────────────────
    # GET ?year= ?search= → agregasi dari shu_member_distributions_monthly per tahun
    path('admin/shu/annual-from-monthly/', views.admin_shu_annual_from_monthly, name='admin-shu-annual-from-monthly'),
    # GET ?year= ?search= → daftar distribusi tahunan + info bank
    path('admin/shu/jasa-modal-annual/', views.admin_shu_jasa_modal_list, name='admin-shu-jasa-modal-list'),
    # POST { year } → buat/update distribusi di shu_member_distributions
    path('admin/shu/jasa-modal-annual/distribute/', views.admin_shu_jasa_modal_distribute, name='admin-shu-jasa-modal-distribute'),
    # PATCH multipart → upload bukti transfer, otomatis set status=paid dan distributed_status=true
    path('admin/shu/jasa-modal-annual/<int:pk>/proof/', views.admin_shu_jasa_modal_proof_upload, name='admin-shu-jasa-modal-proof'),
    # PATCH { notes } → update catatan distribusi
    path('admin/shu/jasa-modal-annual/<int:pk>/notes/', views.admin_shu_jasa_modal_update_notes, name='admin-shu-jasa-modal-notes'),

    # ── Admin: Statistik ─────────────────────────────────────────
    # GET  → KPI stats SHU
    path('admin/shu/stats/', views.admin_shu_stats, name='admin-shu-stats'),

    # ── Admin: Outcome Transaction ────────────────────────────────
    # GET  → daftar kategori outcome
    path('admin/shu/outcome/categories/', views.admin_shu_outcome_categories, name='admin-shu-outcome-categories'),
    # GET ?search= ?month= ?year= → daftar transaksi | POST → tambah transaksi
    path('admin/shu/outcome/transactions/', views.admin_shu_outcome_transactions, name='admin-shu-outcome-transactions'),
    # GET / PATCH / DELETE → detail satu transaksi
    path('admin/shu/outcome/transactions/<int:pk>/', views.admin_shu_outcome_transaction_detail, name='admin-shu-outcome-transaction-detail'),
    # GET  → download template Excel
    path('admin/shu/outcome/template/', views.admin_shu_outcome_excel_template, name='admin-shu-outcome-excel-template'),
    # POST → upload Excel bulk insert
    path('admin/shu/outcome/upload/', views.admin_shu_outcome_upload_excel, name='admin-shu-outcome-upload-excel'),
    # POST { year? } → auto-sync shu_results from income_expenses
    path('admin/shu/outcome/sync-results/', views.admin_shu_sync_results, name='admin-shu-sync-results'),
]
