import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Link, useNavigate } from 'react-router-dom';
import {
  Wallet,
  Users,
  BadgeDollarSign,
  Calendar,
  Search,
  Printer,
  TrendingUp,
  AlertCircle,
  AlertTriangle,
  PiggyBank,
  Loader
} from "lucide-react";
import { apiUrl, getAuthHeaders } from '../../services/api';
import './AdminLoansDashboard.css';

const AdminLoansDashboard = () => {
  const navigate = useNavigate();

  // Icon config per stat card: icon, gradient bg, icon color
  const STAT_ICONS = [
    { icon: <Wallet size={22} />, bg: 'linear-gradient(135deg, #6366f1, #4f46e5)', shadow: 'rgba(99,102,241,0.35)' },
    { icon: <Users size={22} />, bg: 'linear-gradient(135deg, #0ea5e9, #0284c7)', shadow: 'rgba(14,165,233,0.35)' },
    { icon: <BadgeDollarSign size={22} />, bg: 'linear-gradient(135deg, #10b981, #059669)', shadow: 'rgba(16,185,129,0.35)' },
    { icon: <AlertCircle size={22} />, bg: 'linear-gradient(135deg, #f43f5e, #e11d48)', shadow: 'rgba(244,63,94,0.35)' },
    { icon: <PiggyBank size={22} />, bg: 'linear-gradient(135deg, #ec4899, #db2777)', shadow: 'rgba(236,72,153,0.35)' },
    { icon: <AlertTriangle size={22} />, bg: 'linear-gradient(135deg, #ef4444, #dc2626)', shadow: 'rgba(239,68,68,0.35)' },
    { icon: <TrendingUp size={22} />, bg: 'linear-gradient(135deg, #14b8a6, #0d9488)', shadow: 'rgba(20,184,166,0.35)' },
  ];

  const [stats, setStats] = useState([
    { title: 'Total Tertunggak', value: 'Memuat...', up: '', tooltip: 'Total saldo pinjaman tertunggak dari semua pinjaman aktif.' },
    { title: 'Peminjam Aktif', value: 'Memuat...', up: '', tooltip: 'Jumlah anggota dengan pinjaman aktif.' },
    { title: 'Bunga Tercapai', value: 'Memuat...', up: '', tooltip: 'Total bunga terkumpul dari semua pinjaman.' },
    { title: 'Pinalti Terkumpul', value: 'Memuat...', up: '', tooltip: 'Total pinalti yang sudah dibayar dari semua angsuran pinjaman.' },
  ]);

  const [pendingList, setPendingList] = useState([]);
  const [activeLoans, setActiveLoans] = useState([]);
  const [activeLoanSummary, setActiveLoanSummary] = useState({ active_loans: 0, total_members: 0 });

  // Period filter state — default to current month/year
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1); // 1-12
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());

  // Search and Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('Active');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedLoans, setSelectedLoans] = useState([]);
  const [selectAll, setSelectAll] = useState(false);
  const [showFundingModal, setShowFundingModal] = useState(false);
  const [fundingSetting, setFundingSetting] = useState({ id: null, monthly_limit: '', effective_date: '' });
  const [fundingError, setFundingError] = useState('');
  const [isSavingFunding, setIsSavingFunding] = useState(false);
  const [isSendingReminder, setIsSendingReminder] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  const formatRupiah = (number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(number || 0).replace(',00', '');
  };

  const fetchDashboardData = async () => {
    try {
      const response = await fetch(apiUrl('/loan/loans/admin_dashboard_stats/'));
      const response2 = await fetch(
        apiUrl(`/loan/loans/admin_pending_stats/?month=${selectedMonth}&year=${selectedYear}`)
      );

      let row1Stats = [];
      let row2Stats = [];

      if (response.ok) {
        const data = await response.json();
        row1Stats = [
          { title: 'Total Tertunggak', value: formatRupiah(data.total_outstanding), up: data.outstanding_trend },
          { title: 'Peminjam Aktif', value: formatRupiah(data.active_borrowers), up: data.borrowers_trend },
          { title: 'Bunga Tercapai', value: formatRupiah(data.interest_achieved), up: data.interest_trend },
          { title: 'Pinalti Terkumpul', value: formatRupiah(data.penalty_collected), up: data.penalty_trend },
        ];
      }

      if (response2.ok) {
        const data = await response2.json();
        setActiveLoanSummary({ active_loans: data.active_loans || 0, total_members: data.total_members || 0 });
        row2Stats = [
          { title: 'Terkumpul Bulan Ini', value: `${formatRupiah(data.collected_this_month)}`, up: '' },
          { title: 'Total Pinjaman Macet Bulan Ini', value: formatRupiah(data.total_overdue), up: '' },
          { title: 'Sisa Alokasi Pinjaman Bulan Ini', value: formatRupiah(data.remaining_allocation || data.monthly_limit || 0), up: '' }
        ];
      }

      setStats([...row1Stats, ...row2Stats]);

      const pendingRes = await fetch(apiUrl('/loan/loan-applications/admin_pending_list/'), { headers: getAuthHeaders() });
      if (pendingRes.ok) {
        const pendingData = await pendingRes.json();
        setPendingList(pendingData);
      }

      const activeLoansRes = await fetch(
        apiUrl(`/loan/loans/admin_loans_list/?month=${selectedMonth}&year=${selectedYear}`),
        { headers: getAuthHeaders() }
      );
      if (activeLoansRes.ok) {
        const activeLoansData = await activeLoansRes.json();
        setActiveLoans(activeLoansData);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [selectedMonth, selectedYear]);

  const openFundingModal = async () => {
    setFundingError('');
    try {
      const response = await fetch(apiUrl('/loan/loans/loan-funding-settings/'), { headers: getAuthHeaders() });
      if (response.ok) {
        const data = await response.json();
        setFundingSetting({
          id: data.id,
          monthly_limit: data.monthly_limit || '',
          effective_date: data.effective_date || ''
        });
      } else if (response.status === 404) {
        setFundingSetting({ id: null, monthly_limit: '', effective_date: '' });
      } else {
        const error = await response.json();
        setFundingError(error.error || 'Gagal memuat pengaturan dana');
      }
      setShowFundingModal(true);
    } catch (error) {
      console.error('Failed to load funding settings:', error);
      setFundingError('Gagal memuat pengaturan dana');
      setShowFundingModal(true);
    }
  };

  const handleFundingFieldChange = (field, value) => {
    setFundingSetting(prev => ({ ...prev, [field]: value }));
  };

  const saveFundingSettings = async () => {
    setFundingError('');
    if (!fundingSetting.monthly_limit || !fundingSetting.effective_date) {
      setFundingError('Batas bulanan dan tanggal efektif wajib diisi.');
      return;
    }

    setIsSavingFunding(true);
    try {
      const response = await fetch(apiUrl('/loan/loans/loan-funding-settings/'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          monthly_limit: fundingSetting.monthly_limit,
          effective_date: fundingSetting.effective_date
        })
      });

      if (!response.ok) {
        const error = await response.json();
        setFundingError(error.error || 'Gagal menyimpan pengaturan dana');
        return;
      }

      await fetchDashboardData();
      setShowFundingModal(false);
    } catch (error) {
      console.error('Failed to save funding settings:', error);
      setFundingError('Gagal menyimpan pengaturan dana');
    } finally {
      setIsSavingFunding(false);
    }
  };

  // Month/year options
  const MONTHS = [
    { value: 1, label: 'Januari' }, { value: 2, label: 'Februari' },
    { value: 3, label: 'Maret' }, { value: 4, label: 'April' },
    { value: 5, label: 'Mei' }, { value: 6, label: 'Juni' },
    { value: 7, label: 'Juli' }, { value: 8, label: 'Agustus' },
    { value: 9, label: 'September' }, { value: 10, label: 'Oktober' },
    { value: 11, label: 'November' }, { value: 12, label: 'Desember' },
  ];
  const currentYear = new Date().getFullYear();
  const YEARS = Array.from({ length: currentYear - 2020 + 3 }, (_, i) => 2020 + i);

  const handlePendingDetails = (id) => {
    navigate(`/dashboard/admin/ls-loans/${id}`);
  };

  const handleActiveLoanDetails = (loanId) => {
    navigate(`/dashboard/admin/ls-loans/active/${loanId}`);
  };

  const filteredLoans = activeLoans.filter((loan) => {
    const isPaid = loan.status_code && (loan.status_code.toLowerCase().includes('paid') || loan.status_code.toLowerCase() === 'paid_off');
    const loanStatus = isPaid ? 'Close' : 'Active';
    const isPaidThisMonth = loan.current_month_status_id === 29 || loan.current_month_status_id === 30;

    // Status Filter
    if (statusFilter === 'PaidThisMonth' && !isPaidThisMonth) {
      return false;
    }
    if (statusFilter === 'UnpaidThisMonth' && isPaidThisMonth) {
      return false;
    }
    if ((statusFilter === 'Active' || statusFilter === 'Close') && loanStatus !== statusFilter) {
      return false;
    }

    // Search Filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchName = loan.full_name && loan.full_name.toLowerCase().includes(query);
      const matchId = loan.member_id && loan.member_id.toString().includes(query);
      const matchNIK = loan.nik_employee && loan.nik_employee.toLowerCase().includes(query);
      if (!matchName && !matchId && !matchNIK) {
        return false;
      }
    }
    return true;
  });

  const itemsPerPage = 10;
  const totalPages = Math.ceil(filteredLoans.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentLoans = filteredLoans.slice(indexOfFirstItem, indexOfLastItem);

  // Update selectAll based on selected loans
  useEffect(() => {
    if (currentLoans.length > 0) {
      const allSelected = currentLoans.every(loan => selectedLoans.includes(loan.member_id));
      setSelectAll(allSelected);
    }
  }, [selectedLoans, currentLoans]);

  const handlePageChange = (pageNumber) => {
    setCurrentPage(pageNumber);
  };

  const renderPagination = () => {
    if (totalPages <= 1) return null;

    let pages = [];
    // Basic logic for a simplified pagination like 1 2 3 4 ... 10
    // To match the exact image precisely we'll show up to 4 pages, then ellipsis, then last page if many pages
    if (totalPages <= 6) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(
          <button key={i} className={currentPage === i ? 'active' : ''} onClick={() => handlePageChange(i)}>
            {i}
          </button>
        );
      }
    } else {
      for (let i = 1; i <= 4; i++) {
        pages.push(
          <button key={i} className={currentPage === i ? 'active' : ''} onClick={() => handlePageChange(i)}>
            {i}
          </button>
        );
      }
      pages.push(<span key="ellipsis">...</span>);
      pages.push(
        <button key={totalPages} className={currentPage === totalPages ? 'active' : ''} onClick={() => handlePageChange(totalPages)}>
          {totalPages}
        </button>
      );
    }

    return (
      <div className="ald-pagination">
        {pages}
        <button
          onClick={() => currentPage < totalPages && handlePageChange(currentPage + 1)}
          style={{ opacity: currentPage >= totalPages ? 0.5 : 1, pointerEvents: currentPage >= totalPages ? 'none' : 'auto' }}
        >
          Next &gt;
        </button>
      </div>
    );
  };

  const handleSelectAll = (e) => {
    const isChecked = e.target.checked;
    setSelectAll(isChecked);
    if (isChecked) {
      const allLoanIds = filteredLoans.map(loan => loan.member_id);
      setSelectedLoans(allLoanIds);
    } else {
      setSelectedLoans([]);
    }
  };

  const handleSelectLoan = (loanId) => {
    setSelectedLoans(prevState => {
      if (prevState.includes(loanId)) {
        return prevState.filter(id => id !== loanId);
      } else {
        return [...prevState, loanId];
      }
    });
  };

  const handleSendReminder = async () => {
    if (isSendingReminder) return;
    if (selectedLoans.length === 0) {
      alert('Silakan pilih minimal satu pinjaman untuk mengirim pengingat');
      return;
    }

    setIsSendingReminder(true);
    try {
      const response = await fetch(apiUrl('/loan/loans/send_reminder_email/'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          member_ids: selectedLoans
        })
      });

      if (response.ok) {
        const data = await response.json();
        alert(`✓ Email pengingat berhasil dikirim!\nBerhasil: ${data.success_count}\nGagal: ${data.failed_count || 0}`);
        setSelectedLoans([]);
        setSelectAll(false);
      } else {
        const error = await response.json();
        alert(`Kesalahan: ${error.error || 'Gagal mengirim pengingat'}`);
      }
    } catch (error) {
      console.error('Kesalahan saat mengirim pengingat:', error);
      alert('Kesalahan saat mengirim pengingat. Silakan coba lagi.');
    } finally {
      setIsSendingReminder(false);
    }
  };

  const handleExportExcel = () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const headers = ['ID', 'Nama', 'NIK', 'Tujuan', 'Jenis', 'Departemen', 'Tgl Mulai', 'Tgl Akhir', 'Pokok', 'Bunga', 'Total', 'Sisa Saldo', 'Progres (%)', 'Jatuh Tempo Bulan Ini', 'Angsuran Bulan Ini', 'Total Pinalti', 'Status'];

      const rows = filteredLoans.map(loan => {
        let statusDisplay = 'Aktif';
        if (loan.current_month_status_id === 27) {
          statusDisplay = 'Macet';
        } else if (loan.current_month_status_id === 30) {
          statusDisplay = 'Terlambat';
        } else if (loan.status_code && (loan.status_code.toLowerCase().includes('paid') || loan.status_code.toLowerCase() === 'paid_off')) {
          statusDisplay = 'Lunas';
        }

        const dueDate = loan.current_month_due_date
          ? new Date(loan.current_month_due_date).toLocaleDateString('id-ID')
          : '-';

        const installmentInfo = loan.current_month_installment > 0
          ? `#${loan.current_month_installment} (Rp ${new Intl.NumberFormat('id-ID').format(loan.current_month_amount)})`
          : '-';

        return [
          loan.member_id,
          loan.full_name || '',
          loan.nik_employee || '',
          loan.purpose || '',
          loan.type_name || '',
          loan.department_name || '',
          loan.start_date ? new Date(loan.start_date).toLocaleDateString('id-ID') : '-',
          loan.due_date ? new Date(loan.due_date).toLocaleDateString('id-ID') : '-',
          Number(loan.principal_amount) || 0,
          Number(loan.interest_amount) || 0,
          Number(loan.amount) || 0,
          Number(loan.remaining_balance) || 0,
          Math.round(loan.progress_percent) || 0,
          dueDate,
          installmentInfo,
          Number(loan.penalty_due) || 0,
          statusDisplay,
        ];
      });

      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      worksheet['!cols'] = headers.map(h => ({ wch: Math.max(h.length + 2, 14) }));

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Pinjaman');

      const monthLabel = MONTHS.find(m => m.value === selectedMonth)?.label || selectedMonth;
      XLSX.writeFile(workbook, `admin_loans_export_${monthLabel}_${selectedYear}.xlsx`);
    } finally {
      setTimeout(() => setIsExporting(false), 500);
    }
  };

  return (
    <div className="admin-loans-dash">
      <div className="ald-header">
        {/* <h1>Loan Management</h1> */}
        {/* <div className="ald-breadcrumb">Home &gt; Loan Management</div> */}
      </div>

      <div className="ald-stats">
        {stats.map((stat, i) => {
          const iconCfg = STAT_ICONS[i] || STAT_ICONS[0];
          const isEditableStat = stat.title === 'Sisa Alokasi Pinjaman Bulan Ini';
          return (
            <div
              key={i}
              className="ald-stat-card"
              onDoubleClick={isEditableStat ? openFundingModal : undefined}
              style={{ cursor: isEditableStat ? 'pointer' : 'default' }}
              title={isEditableStat ? 'Klik dua kali untuk edit pengaturan dana' : stat.tooltip}
            >
              <div className="ald-stat-top">
                <div className="ald-stat-title">{stat.title}</div>
                <div
                  className="ald-stat-icon-wrapper"
                  title={stat.tooltip}
                  style={{
                    background: iconCfg.bg,
                    boxShadow: `0 6px 16px ${iconCfg.shadow}`,
                  }}
                >
                  <span className="ald-stat-icon">{iconCfg.icon}</span>
                </div>
              </div>
              <div className="ald-stat-body">
                <div className="ald-stat-value">{stat.value}</div>
                {stat.up && (
                  <div className={`ald-stat-trend ${stat.up.startsWith('+') ? 'up' : 'down'}`}>
                    {stat.up.startsWith('+') ? '↑' : '↓'} {stat.up.replace('+', '').replace('-', '')}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showFundingModal && (
        <div className="ald-modal-overlay" onClick={() => setShowFundingModal(false)}>
          <div className="ald-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="ald-modal-header">
              <div>
                <h3>Edit Pengaturan Dana Pinjaman</h3>
                <p>Perbarui batas bulanan aktif dan tanggal efektif.</p>
              </div>
              <button className="ald-modal-close" onClick={() => setShowFundingModal(false)}>
                ×
              </button>
            </div>
            <div className="ald-modal-body">
              <label>
                Batas Bulanan
                <input
                  type="number"
                  value={fundingSetting.monthly_limit}
                  onChange={(e) => handleFundingFieldChange('monthly_limit', e.target.value)}
                  placeholder="Masukkan batas bulanan"
                />
              </label>
              <label>
                Tanggal Efektif
                <input
                  type="date"
                  value={fundingSetting.effective_date}
                  onChange={(e) => handleFundingFieldChange('effective_date', e.target.value)}
                />
              </label>
              {fundingError && <div className="ald-modal-error">{fundingError}</div>}
            </div>
            <div className="ald-modal-actions">
              <button className="ald-modal-cancel" onClick={() => setShowFundingModal(false)}>Batal</button>
              <button className="ald-modal-save" onClick={saveFundingSettings} disabled={isSavingFunding}>
                {isSavingFunding ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="ald-pending-section">
        <div className="ald-pending-header">
          <div>
            <h2>Menunggu Persetujuan</h2>
            <p className="ald-pending-desc">Permintaan anggota yang memerlukan tindakan segera</p>
          </div>
          <div className="ald-pending-header-right">
            {pendingList.length > 0 && (
              <span className="ald-badge-count">{pendingList.length} permintaan</span>
            )}
            <Link to="/dashboard/admin/ls-loans/pending" className="ald-view-more">
              Lihat Semua &rarr;
            </Link>
          </div>
        </div>

        <div className="ald-pending-list">
          {pendingList.map((item, idx) => (
            <div key={idx} className="ald-pending-card" onClick={() => handlePendingDetails(item.application_id)} style={{ cursor: 'pointer' }}>
              <div className="ald-pc-top">
                <div className="ald-pc-info">
                  <div className="ald-pc-name">{item.full_name}</div>
                  <div className="ald-pc-dept">{item.department_name}</div>
                  <div className="ald-pc-id">ID : {item.employee_id}</div>
                </div>
              </div>
              <div className="ald-pc-mid">
                <div className="ald-pc-col">
                  <div className="ald-pc-label">Tujuan</div>
                  <div className="ald-pc-desc">{item.purpose}</div>
                </div>
                <div className="ald-pc-col term">
                  <div className="ald-pc-label">Jangka Waktu</div>
                  <div className="ald-pc-desc">{item.duration_months} Bulan</div>
                </div>
              </div>
              <div className="ald-pc-amount">
                <span>Jumlah</span>
                <span>
                  {new Intl.NumberFormat('id-ID', {
                    style: 'currency',
                    currency: 'IDR',
                    minimumFractionDigits: 0
                  }).format(item.amount_requested || 0).replace(',00', '')}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="ald-table-section">
        <div className="ald-table-controls">
          {/* Period Filter — affects Collected, Overdue stats & loan list */}
          <div className="ald-period-filter">
            <Calendar size={16} style={{ color: '#6b7280' }} />
            <select
              id="filter-month"
              value={selectedMonth}
              onChange={(e) => { setSelectedMonth(Number(e.target.value)); setCurrentPage(1); }}
            >
              {MONTHS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <select
              id="filter-year"
              value={selectedYear}
              onChange={(e) => { setSelectedYear(Number(e.target.value)); setCurrentPage(1); }}
            >
              {YEARS.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div className="ald-search">
            <Search size={16} />
            <input
              id="search-loans"
              name="search-loans"
              type="text"
              placeholder="Cari berdasarkan nama atau ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="ald-filter">
            <select
              id="status-filter"
              name="status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="All">Semua</option>
              <option value="Active">Aktif</option>
              <option value="Close">Tutup</option>
              <option value="PaidThisMonth">Sudah Bayar (Bulan Ini)</option>
              <option value="UnpaidThisMonth">Belum Bayar (Bulan Ini)</option>
            </select>
          </div>
          <button className="ald-print-btn" onClick={handleExportExcel} title="Ekspor ke Excel (.xlsx)" disabled={isExporting}>
            {isExporting ? <Loader size={16} className="spinner" /> : <Printer size={16} />}
          </button>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="ald-send-reminder-btn" onClick={handleSendReminder} title="Kirim pengingat ke anggota terpilih" disabled={isSendingReminder}>
              {isSendingReminder ? <><Loader size={14} className="spinner" /> Mengirim...</> : 'Kirim Pengingat'}
            </button>
          </div>
        </div>

        <div className="ald-table-container">
          <table className="ald-table">
        <thead style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}>
              <tr>
                {[
                  { label: <input id="select-all-loans" name="select-all-loans" type="checkbox" checked={selectAll} onChange={handleSelectAll} className="ald-checkbox-header" />, key: 'cb' },
                  { label: 'ID', key: 'id' },
                  { label: 'Nama', key: 'name' },
                  { label: 'NIK', key: 'nik' },
                  { label: 'Tujuan', key: 'purpose' },
                  { label: 'Jenis', key: 'type' },
                  { label: 'Departemen', key: 'dept' },
                  { label: 'Tgl Mulai', key: 'start' },
                  { label: 'Tgl Akhir', key: 'end' },
                  { label: 'Pokok', key: 'principal' },
                  { label: 'Bunga', key: 'interest' },
                  { label: 'Total', key: 'total' },
                  { label: 'Sisa Saldo', key: 'remaining' },
                  { label: 'Progres', key: 'progress' },
                  { label: 'Jatuh Tempo Bulan Ini', key: 'due' },
                  { label: 'Angsuran Bulan Ini', key: 'inst' },
                  { label: 'Total Pinalti', key: 'penalty' },
                  ...(statusFilter === 'All' ? [{ label: 'Status', key: 'status' }] : []),
                ].map(({ label, key }) => (
                  <th
                    key={key}
                    style={{
                      color: '#ffffff',
                      fontWeight: 600,
                      fontSize: 13,
                      letterSpacing: '0.4px',
                      padding: '13px 12px',
                      background: 'transparent',
                      textShadow: '0 1px 2px rgba(0,0,0,0.2)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {currentLoans.map((loan, idx) => {
                // Row highlight + the status-filter dropdown above the table
                // (Sudah Bayar/Belum Bayar options) now cover what a dedicated
                // Status column used to show — no separate column needed.
                const isPaidThisMonth = loan.current_month_status_id === 29 || loan.current_month_status_id === 30;

                return (
                  <tr
                    key={idx}
                    onDoubleClick={() => handleActiveLoanDetails(loan.loan_id)}
                    style={{ cursor: 'pointer', background: isPaidThisMonth ? '#f0fdf4' : undefined }}
                    title="Klik dua kali untuk lihat detail pinjaman"
                  >
                    <td className="ald-checkbox-cell">
                      <input
                        id={`loan-checkbox-${loan.member_id}`}
                        name={`loan-checkbox-${loan.member_id}`}
                        type="checkbox"
                        checked={selectedLoans.includes(loan.member_id)}
                        onChange={() => handleSelectLoan(loan.member_id)}
                        className="ald-checkbox-row"
                      />
                    </td>
                    <td>{loan.loan_id}</td>
                    <td>{loan.full_name}</td>
                    <td>{loan.nik_employee}</td>
                    <td>{loan.purpose}</td>
                    <td>{loan.type_name}</td>
                    <td>{loan.department_name}</td>
                    <td>{loan.start_date ? new Date(loan.start_date).toLocaleDateString('id-ID') : '-'}</td>
                    <td>{loan.due_date ? new Date(loan.due_date).toLocaleDateString('id-ID') : '-'}</td>
                    <td>
                      {new Intl.NumberFormat('id-ID', {
                        style: 'currency',
                        currency: 'IDR',
                        minimumFractionDigits: 0
                      }).format(loan.principal_amount).replace(',00', '')}
                    </td>
                    <td>
                      {new Intl.NumberFormat('id-ID', {
                        style: 'currency',
                        currency: 'IDR',
                        minimumFractionDigits: 0
                      }).format(loan.interest_amount).replace(',00', '')}
                    </td>
                    <td style={{ fontWeight: 'bold' }}>
                      {new Intl.NumberFormat('id-ID', {
                        style: 'currency',
                        currency: 'IDR',
                        minimumFractionDigits: 0
                      }).format(loan.amount).replace(',00', '')}
                    </td>
                    <td>
                      {new Intl.NumberFormat('id-ID', {
                        style: 'currency',
                        currency: 'IDR',
                        minimumFractionDigits: 0
                      }).format(loan.remaining_balance).replace(',00', '')}
                    </td>
                    <td>
                      <div style={{ fontSize: '12px' }}>{loan.paid_installment}/{loan.total_installment}</div>
                      <div style={{ fontWeight: 'bold', color: '#10b981' }}>{Math.round(loan.progress_percent)}%</div>
                    </td>
                    <td style={(loan.current_month_status_id === 29 || loan.current_month_status_id === 30) ? { color: '#16a34a', fontWeight: 600 } : undefined}>
                      {loan.current_month_due_date ? new Date(loan.current_month_due_date).toLocaleDateString('id-ID') : '-'}
                    </td>
                    <td>
                      {loan.current_month_installment > 0
                        ? `#${loan.current_month_installment} (Rp ${new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0 }).format(loan.current_month_amount)})`
                        : '-'
                      }
                    </td>
                    <td style={loan.penalty_due > 0 ? { color: '#dc2626', fontWeight: 600 } : undefined}>
                      {loan.penalty_due > 0
                        ? new Intl.NumberFormat('id-ID', {
                            style: 'currency',
                            currency: 'IDR',
                            minimumFractionDigits: 0
                          }).format(loan.penalty_due).replace(',00', '')
                        : '-'
                      }
                    </td>
                    {statusFilter === 'All' && (
                      <td>
                        <span className={`ald-status ${loan.status_code && (loan.status_code.toLowerCase().includes('paid') || loan.status_code.toLowerCase() === 'paid_off') ? 'unpaid' : 'active'}`}>
                          {loan.status_code && (loan.status_code.toLowerCase().includes('paid') || loan.status_code.toLowerCase() === 'paid_off') ? 'Tidak Aktif' : 'Aktif'}
                        </span>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="ald-table-footer">
          <div className="ald-total-active-loans">
            <span className="ald-tal-label">Total Pinjaman Aktif</span>
            <span className="ald-tal-value">{activeLoanSummary.active_loans}/{activeLoanSummary.total_members} Anggota</span>
          </div>
          {renderPagination()}
        </div>
      </div>
    </div>
  );
};

export default AdminLoansDashboard;
