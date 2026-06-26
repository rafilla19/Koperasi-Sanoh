import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Wallet,
  Users,
  BadgeDollarSign,
  Calendar,
  Clock3,
  Search,
  Printer,
  TrendingUp,
  BarChart3,
  AlertCircle,
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
    { icon: <Clock3 size={22} />, bg: 'linear-gradient(135deg, #f59e0b, #d97706)', shadow: 'rgba(245,158,11,0.35)' },
    { icon: <BarChart3 size={22} />, bg: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', shadow: 'rgba(139,92,246,0.35)' },
    { icon: <PiggyBank size={22} />, bg: 'linear-gradient(135deg, #ec4899, #db2777)', shadow: 'rgba(236,72,153,0.35)' },
    { icon: <AlertCircle size={22} />, bg: 'linear-gradient(135deg, #ef4444, #dc2626)', shadow: 'rgba(239,68,68,0.35)' },
    { icon: <TrendingUp size={22} />, bg: 'linear-gradient(135deg, #14b8a6, #0d9488)', shadow: 'rgba(20,184,166,0.35)' },
  ];

  const [stats, setStats] = useState([
    { title: 'Total Outstanding', value: 'Loading...', up: '', tooltip: 'Total outstanding loan amount across all active loans.' },
    { title: 'Active Borrowers', value: 'Loading...', up: '', tooltip: 'Number of members with active loans.' },
    { title: 'Interest Achieved', value: 'Loading...', up: '', tooltip: 'Total interest collected from all loans.' },
    { title: 'Pending Approvals', value: 'Loading...', up: '', tooltip: 'Number of loan applications currently pending approval.' }
  ]);

  const [pendingList, setPendingList] = useState([]);
  const [activeLoans, setActiveLoans] = useState([]);

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
  const [isAutoSending, setIsAutoSending] = useState(false);
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
          { title: 'Total Outstanding', value: formatRupiah(data.total_outstanding), up: data.outstanding_trend },
          { title: 'Active Borrowers', value: formatRupiah(data.active_borrowers), up: data.borrowers_trend },
          { title: 'Interest Achieved', value: formatRupiah(data.interest_achieved), up: data.interest_trend },
          { title: 'Pending Approvals', value: (data.pending_approvals || 0).toString(), up: '' }
        ];
      }

      if (response2.ok) {
        const data = await response2.json();
        row2Stats = [
          { title: 'Total Active Loan', value: `${data.active_loans}/${data.total_members} Members`, up: '' },
          { title: 'Collected This Month', value: `${formatRupiah(data.collected_this_month)}`, up: '' },
          { title: 'Total Overdue Loans This Month', value: formatRupiah(data.total_overdue), up: '' },
          { title: 'Remaining Loan Allocation This Month', value: formatRupiah(data.remaining_allocation || data.monthly_limit || 0), up: '' }
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
        setFundingError(error.error || 'Failed to load funding settings');
      }
      setShowFundingModal(true);
    } catch (error) {
      console.error('Failed to load funding settings:', error);
      setFundingError('Failed to load funding settings');
      setShowFundingModal(true);
    }
  };

  const handleFundingFieldChange = (field, value) => {
    setFundingSetting(prev => ({ ...prev, [field]: value }));
  };

  const saveFundingSettings = async () => {
    setFundingError('');
    if (!fundingSetting.monthly_limit || !fundingSetting.effective_date) {
      setFundingError('Monthly limit and effective date are required.');
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
        setFundingError(error.error || 'Failed to save funding settings');
        return;
      }

      await fetchDashboardData();
      setShowFundingModal(false);
    } catch (error) {
      console.error('Failed to save funding settings:', error);
      setFundingError('Failed to save funding settings');
    } finally {
      setIsSavingFunding(false);
    }
  };

  // Month/year options
  const MONTHS = [
    { value: 1, label: 'January' }, { value: 2, label: 'February' },
    { value: 3, label: 'March' }, { value: 4, label: 'April' },
    { value: 5, label: 'May' }, { value: 6, label: 'June' },
    { value: 7, label: 'July' }, { value: 8, label: 'August' },
    { value: 9, label: 'September' }, { value: 10, label: 'October' },
    { value: 11, label: 'November' }, { value: 12, label: 'December' },
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

    // Status Filter
    if (statusFilter !== 'All' && loanStatus !== statusFilter) {
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
          NEXT &gt;
        </button>
      </div>
    );
  };

  const handleSelectAll = (e) => {
    const isChecked = e.target.checked;
    setSelectAll(isChecked);
    if (isChecked) {
      const allLoanIds = currentLoans.map(loan => loan.member_id);
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
      alert('Please select at least one loan to send reminder');
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
        alert(`✓ Reminder emails sent successfully!\nSuccessful: ${data.success_count}\nFailed: ${data.failed_count || 0}`);
        setSelectedLoans([]);
        setSelectAll(false);
      } else {
        const error = await response.json();
        alert(`Error: ${error.error || 'Failed to send reminders'}`);
      }
    } catch (error) {
      console.error('Error sending reminder:', error);
      alert('Error sending reminders. Please try again.');
    } finally {
      setIsSendingReminder(false);
    }
  };

  const handleAutoSendAll = async () => {
    if (isAutoSending) return;
    const confirmed = await window.appConfirm({
      title: 'Send all reminders?',
      message: 'This will send reminder emails to all members with overdue installments. Continue?',
      confirmText: 'Send Reminders',
      cancelText: 'Cancel',
    });
    if (!confirmed) return;

    setIsAutoSending(true);
    try {
      const response = await fetch(apiUrl('/loan/loans/send_auto_all_reminders/'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        const data = await response.json();
        alert(`Auto-reminders process completed!\nEmails Sent: ${data.success_count}`);
      } else {
        alert('Failed to trigger auto-reminders');
      }
    } catch (error) {
      console.error(error);
      alert('Error triggering auto-reminders');
    } finally {
      setIsAutoSending(false);
    }
  };

  const handleExportExcel = () => {
    if (isExporting) return;
    setIsExporting(true);
    const headers = ['ID', 'Name', 'NIK', 'Purpose', 'Type', 'Department', 'Start Date', 'End Date', 'Principal', 'Interest', 'Total Amount', 'Remaining Balance', 'Progress', 'Current Month Due Date', 'Current Month Installment', 'Status'];
    const csvRows = [headers.join(',')];

    filteredLoans.forEach(loan => {
      let statusDisplay = 'Active';
      if (loan.current_month_status_id === 27) {
        statusDisplay = 'Macet';
      } else if (loan.current_month_status_id === 30) {
        statusDisplay = 'Terlambat (Late Paid)';
      } else if (loan.status_code && (loan.status_code.toLowerCase().includes('paid') || loan.status_code.toLowerCase() === 'paid_off')) {
        statusDisplay = 'Paid Off';
      }

      const dueDate = loan.current_month_due_date
        ? new Date(loan.current_month_due_date).toLocaleDateString('id-ID')
        : '-';

      const installmentInfo = loan.current_month_installment > 0
        ? `#${loan.current_month_installment} (Rp ${loan.current_month_amount})`
        : '-';

      const row = [
        loan.member_id,
        `"${loan.full_name}"`,
        `"${loan.nik_employee}"`,
        `"${loan.purpose}"`,
        `"${loan.type_name}"`,
        `"${loan.department_name}"`,
        loan.start_date,
        loan.due_date,
        loan.principal_amount,
        loan.interest_amount,
        loan.amount,
        loan.remaining_balance,
        `"${Math.round(loan.progress_percent)}%"`,
        `"${dueDate}"`,
        `"${installmentInfo}"`,
        statusDisplay
      ];
      csvRows.push(row.join(','));
    });

    const csvContent = "data:text/csv;charset=utf-8," + csvRows.join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "admin_loans_export.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => setIsExporting(false), 1000);
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
          const isEditableStat = stat.title === 'Remaining Loan Allocation This Month';
          return (
            <div
              key={i}
              className="ald-stat-card"
              onDoubleClick={isEditableStat ? openFundingModal : undefined}
              style={{ cursor: isEditableStat ? 'pointer' : 'default' }}
              title={isEditableStat ? 'Double click to edit funding settings' : stat.tooltip}
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
                <h3>Edit Loan Funding Settings</h3>
                <p>Update the active monthly limit and effective date.</p>
              </div>
              <button className="ald-modal-close" onClick={() => setShowFundingModal(false)}>
                ×
              </button>
            </div>
            <div className="ald-modal-body">
              <label>
                Monthly Limit
                <input
                  type="number"
                  value={fundingSetting.monthly_limit}
                  onChange={(e) => handleFundingFieldChange('monthly_limit', e.target.value)}
                  placeholder="Enter monthly limit"
                />
              </label>
              <label>
                Effective Date
                <input
                  type="date"
                  value={fundingSetting.effective_date}
                  onChange={(e) => handleFundingFieldChange('effective_date', e.target.value)}
                />
              </label>
              {fundingError && <div className="ald-modal-error">{fundingError}</div>}
            </div>
            <div className="ald-modal-actions">
              <button className="ald-modal-cancel" onClick={() => setShowFundingModal(false)}>Cancel</button>
              <button className="ald-modal-save" onClick={saveFundingSettings} disabled={isSavingFunding}>
                {isSavingFunding ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="ald-pending-section">
        <div className="ald-pending-header">
          <h2>Pending Approvals</h2>
          <Link to="/dashboard/admin/ls-loans/pending" className="ald-view-more">
            View More &rarr;
          </Link>
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
                  <div className="ald-pc-label">Purpose</div>
                  <div className="ald-pc-desc">{item.purpose}</div>
                </div>
                <div className="ald-pc-col term">
                  <div className="ald-pc-label">Term</div>
                  <div className="ald-pc-desc">{item.duration_months} Bulan</div>
                </div>
              </div>
              <div className="ald-pc-amount">
                <span>Amount</span>
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
              placeholder="Search by name or ID..."
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
              <option value="All">All</option>
              <option value="Active">Active</option>
              <option value="Close">Close</option>
            </select>
          </div>
          <button className="ald-print-btn" onClick={handleExportExcel} title="Export to Excel (CSV)" disabled={isExporting}>
            {isExporting ? <Loader size={16} className="spinner" /> : <Printer size={16} />}
          </button>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="ald-send-reminder-btn" onClick={handleSendReminder} title="Kirim reminder overdue & upcoming ke member terpilih" disabled={isSendingReminder}>
              {isSendingReminder ? <><Loader size={14} className="spinner" /> Sending...</> : 'Send Reminder'}
            </button>
            <button className="ald-send-reminder-btn" onClick={handleAutoSendAll} title="Kirim otomatis ke semua member yang overdue" style={{ background: '#f59e0b' }} disabled={isAutoSending}>
              {isAutoSending ? <><Loader size={14} className="spinner" /> Sending...</> : 'Auto-Send Overdue'}
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
                  { label: 'Name', key: 'name' },
                  { label: 'NIK', key: 'nik' },
                  { label: 'Purpose', key: 'purpose' },
                  { label: 'Type', key: 'type' },
                  { label: 'Department', key: 'dept' },
                  { label: 'Start Date', key: 'start' },
                  { label: 'End Date', key: 'end' },
                  { label: 'Principal', key: 'principal' },
                  { label: 'Interest', key: 'interest' },
                  { label: 'Total Amount', key: 'total' },
                  { label: 'Remaining Balance', key: 'remaining' },
                  { label: 'Progress', key: 'progress' },
                  { label: 'Current Month Due Date', key: 'due' },
                  { label: 'Current Month Installment', key: 'inst' },
                  { label: 'Status', key: 'status' },
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
                // Determine status display
                let statusDisplay = 'Active';
                let statusClass = 'active';

                // Check if it's Macet (status_id = 27)
                if (loan.current_month_status_id === 27) {
                  statusDisplay = 'Macet';
                  statusClass = 'macet';
                }
                // Check if it's Late Paid (status_id = 30)
                else if (loan.current_month_status_id === 30) {
                  statusDisplay = 'Terlambat (Late Paid)';
                  statusClass = 'late-paid';
                }
                // Check if it's paid off
                else if (loan.status_code && (loan.status_code.toLowerCase().includes('paid') || loan.status_code.toLowerCase() === 'paid_off')) {
                  statusDisplay = 'Paid Off';
                  statusClass = 'close';
                }

                return (
                  <tr
                    key={idx}
                    onDoubleClick={() => handleActiveLoanDetails(loan.loan_id)}
                    style={{ cursor: 'pointer' }}
                    title="Double click to view loan details"
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
                    <td>
                      {loan.current_month_due_date ? new Date(loan.current_month_due_date).toLocaleDateString('id-ID') : '-'}
                    </td>
                    <td>
                      {loan.current_month_installment > 0
                        ? `#${loan.current_month_installment} (Rp ${new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0 }).format(loan.current_month_amount)})`
                        : '-'
                      }
                    </td>
                    <td>
                      <span className={`ald-status ${statusClass}`}>
                        {statusDisplay}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {renderPagination()}
        </div>
      </div>
    </div>
  );
};

export default AdminLoansDashboard;
