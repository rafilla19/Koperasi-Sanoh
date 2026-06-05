import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingBag, Search, Printer, MoreHorizontal, Calendar } from 'lucide-react';
import { apiUrl } from '../../services/api';
import './AdminLoansDashboard.css';

const AdminLoansDashboard = () => {
  const navigate = useNavigate();

  const [stats, setStats] = useState([
    { title: 'Total Outstanding', value: 'Rp 0', up: '34.7%' },
    { title: 'Active Borrowers', value: 'Rp 0', up: '34.7%' },
    { title: 'Interest Achieved', value: 'Rp 0', up: '34.7%' },
    { title: 'Current Month Installment', value: 'Rp 0', up: '34.7%' },
    { title: 'Pending Approvals', value: '0', up: '' }
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

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

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

  useEffect(() => {
    const fetchData = async () => {
      try {
        const formatRupiah = (number) => {
          return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0
          }).format(number || 0).replace(',00', '');
        };

        // Fetch both stats endpoints
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
            { title: 'Total Overdue Loans This Month', value: formatRupiah(data.total_overdue), up: '' }
          ];
        }

        // Combine both rows into one setStats call
        setStats([...row1Stats, ...row2Stats]);

        const pendingRes = await fetch(apiUrl('/loan/loan-applications/admin_pending_list/'));
        if (pendingRes.ok) {
          const pendingData = await pendingRes.json();
          setPendingList(pendingData);
        }

        const activeLoansRes = await fetch(
          apiUrl(`/loan/loans/admin_loans_list/?month=${selectedMonth}&year=${selectedYear}`)
        );
        if (activeLoansRes.ok) {
          const activeLoansData = await activeLoansRes.json();
          setActiveLoans(activeLoansData);
        }
      } catch (error) {
        console.error('Failed to fetch data:', error);
      }
    };
    fetchData();
  }, [selectedMonth, selectedYear]);

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
    if (selectedLoans.length === 0) {
      alert('Please select at least one loan to send reminder');
      return;
    }

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
    }
  };

  const handleAutoSendAll = async () => {
    if (!window.confirm('This will send reminder emails to ALL members with overdue installments. Continue?')) return;

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
    }
  };

  const handleExportExcel = () => {
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
  };

  return (
    <div className="admin-loans-dash">
      <div className="ald-header">
        <h1>Loan Management</h1>
        {/* <div className="ald-breadcrumb">Home &gt; Loan Management</div> */}
      </div>

      <div className="ald-stats">
        {stats.map((stat, i) => (
          <div key={i} className="ald-stat-card">
            <div className="ald-stat-top">
              <div className="ald-stat-title">{stat.title}</div>
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
        ))}
      </div>

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
          <button className="ald-print-btn" onClick={handleExportExcel} title="Export to Excel (CSV)">
            <Printer size={16} />
          </button>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="ald-send-reminder-btn" onClick={handleSendReminder} title="Send Selected Reminder">
              Send Reminder
            </button>
            <button className="ald-send-reminder-btn" onClick={handleAutoSendAll} title="Auto-Send All Overdue" style={{ background: '#f59e0b' }}>
              Auto-Send All
            </button>
          </div>
        </div>

        <div className="ald-table-container">
          <table className="ald-table">
            <thead>
              <tr>
                <th>
                  <input
                    id="select-all-loans"
                    name="select-all-loans"
                    type="checkbox"
                    checked={selectAll}
                    onChange={handleSelectAll}
                    className="ald-checkbox-header"
                  />
                </th>
                <th>ID</th>
                <th>Name</th>
                <th>NIK</th>
                <th>Purpose</th>
                <th>Type</th>
                <th>Department</th>
                <th>Start Date</th>
                <th>End Date</th>
                <th>Principal</th>
                <th>Interest</th>
                <th>Total Amount</th>
                <th>Remaining Balance</th>
                <th>Progress</th>
                <th>Current Month Due Date</th>
                <th>Current Month Installment</th>
                <th>Status</th>
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
