import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Search, ChevronRight, ChevronLeft, Upload, CheckCircle,
  Calendar, TrendingUp, DollarSign, Users, AlertCircle, X, Loader2,
  RefreshCw, FileText, RotateCcw
} from 'lucide-react';
import './PayrollSummary.css';

// --- Toast Notification Component ---
const Toast = ({ message, type, onClose }) => (
  <div className={`pl-toast pl-toast-${type}`}>
    {type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
    <span>{message}</span>
    <button onClick={onClose}><X size={14} /></button>
  </div>
);

// --- Stat Card Component ---
const StatCard = ({ icon: Icon, label, value, sub, color, progress }) => (
  <div className="pl-stat-card">
    <div className="pl-stat-header">
      <div className={`pl-stat-icon pl-stat-icon--${color}`}>
        <Icon size={20} />
      </div>
      <span className="pl-stat-label">{label}</span>
    </div>
    <div className="pl-stat-value">{value}</div>
    {sub && <div className="pl-stat-sub">{sub}</div>}
    {progress !== undefined && (
      <div className="pl-stat-progress-bar">
        <div className="pl-stat-progress-fill" style={{ width: `${Math.min(progress, 100)}%`, backgroundColor: progress === 100 ? '#10b981' : '#4880F0' }} />
      </div>
    )}
  </div>
);

// --- Status Badge Component ---
const StatusBadge = ({ statusId }) => {
  const config = {
    29: { label: 'Paid', cls: 'paid' },
    30: { label: 'Overdue', cls: 'overdue' },
    28: { label: 'Unpaid', cls: 'unpaid' },
  };
  const c = config[statusId] || { label: 'Unknown', cls: 'unpaid' };
  return <span className={`pl-badge pl-badge--${c.cls}`}>{c.label}</span>;
};

// --- Rollback Dialog Component ---
const RollbackDialog = ({ isOpen, onClose, onConfirm, row, loading }) => {
  if (!isOpen || !row) return null;
  return (
    <div className="pl-dialog-overlay" onClick={onClose}>
      <div className="pl-dialog" onClick={e => e.stopPropagation()}>
        <div className="pl-dialog-icon" style={{ background: '#fff7ed' }}>
          <RotateCcw size={28} style={{ color: '#f59e0b' }} />
        </div>
        <h3>Rollback Payment?</h3>
        <p>You are about to revert the payment for <strong>{row.name}</strong> (Installment #{row.installment_number}) back to <strong>Unpaid</strong>.</p>
        <p className="pl-dialog-note" style={{ background: '#fff7ed', borderColor: '#fde68a', color: '#92400e' }}>
          ⚠ This will delete the payroll payment record and revert the installment to <strong>Unpaid</strong>.
        </p>
        <div className="pl-dialog-actions">
          <button className="pl-dialog-btn-cancel" onClick={onClose} disabled={loading}>Cancel</button>
          <button
            className="pl-dialog-btn-confirm"
            style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', boxShadow: '0 4px 16px rgba(245,158,11,0.3)' }}
            onClick={() => onConfirm(row)}
            disabled={loading}
          >
            {loading ? <><Loader2 size={16} className="pl-spin" /> Processing...</> : <><RotateCcw size={16} /> Rollback</>}
          </button>
        </div>
      </div>
    </div>
  );
};

const ConfirmDialog = ({ isOpen, onClose, onConfirm, count, period, loading }) => {
  if (!isOpen) return null;
  return (
    <div className="pl-dialog-overlay" onClick={onClose}>
      <div className="pl-dialog" onClick={e => e.stopPropagation()}>
        <div className="pl-dialog-icon"><CheckCircle size={32} /></div>
        <h3>Confirm Payroll Payments</h3>
        <p>You are about to confirm <strong>{count}</strong> payment deduction(s) for the <strong>{period}</strong> payroll cycle.</p>
        <p className="pl-dialog-note">This action will mark the selected installments as <strong>Paid</strong> in the system. This cannot be undone.</p>
        <div className="pl-dialog-actions">
          <button className="pl-dialog-btn-cancel" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="pl-dialog-btn-confirm" onClick={onConfirm} disabled={loading}>
            {loading ? <><Loader2 size={16} className="pl-spin" /> Processing...</> : <><CheckCircle size={16} /> Confirm Payments</>}
          </button>
        </div>
      </div>
    </div>
  );
};

// ========================
// Main Component
// ========================
const PayrollLoans = () => {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(String(now.getMonth() + 1).padStart(2, '0'));
  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear()));
  const reportingMonth = `${selectedYear}-${selectedMonth}`;

  const [searchQuery, setSearchQuery] = useState('');
  const [filterDept, setFilterDept] = useState('all');
  const [filterStatus, setFilterStatus] = useState('unpaid');
  const [selectedIds, setSelectedIds] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [data, setData] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [rollbacking, setRollbacking] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [rollbackTarget, setRollbackTarget] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchDepartments = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/master/departments/');
      if (res.ok) setDepartments(await res.json());
    } catch (err) { console.error('Failed to fetch departments:', err); }
  };

  const fetchPayrollLoans = useCallback(async () => {
    setLoading(true);
    setSelectedIds([]);
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/loan/loans/payroll_loans_list/?period=${reportingMonth}`);
      if (res.ok) {
        const result = await res.json();
        setData(result.map(item => ({
          id: item.loan_id,
          inst_id: item.current_month_inst_id,
          name: item.full_name,
          nik: item.nik_employee,
          department: item.department_name,
          type: item.type_name,
          progressStr: `${item.paid_installment}/${item.total_installment}`,
          cicilan: item.current_month_amount,
          sisa: item.remaining_balance,
          status_id: item.current_month_status_id,
          installment_number: item.current_month_installment,
          duration: item.duration_months,
          paid_installment: item.paid_installment,
          total_installment: item.total_installment,
        })));
      }
    } catch (err) { console.error('Failed to fetch payroll loans:', err); }
    finally { setLoading(false); }
  }, [reportingMonth]);

  useEffect(() => { fetchDepartments(); }, []);
  useEffect(() => { fetchPayrollLoans(); }, [fetchPayrollLoans]);

  // --- Computed Stats ---
  const totalItems = data.length;
  const processedItems = data.filter(d => d.status_id === 29 || d.status_id === 30).length;
  const outstandingItems = data.filter(d => d.status_id === 28).length;
  const allConfirmed = totalItems > 0 && processedItems === totalItems;
  const progressPct = totalItems > 0 ? Math.round((processedItems / totalItems) * 100) : 0;

  const formatRupiah = (number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 })
      .format(number || 0).replace(',00', '');

  const totalPayrollAmount = useMemo(() => data.reduce((s, i) => s + parseFloat(i.cicilan || 0), 0), [data]);
  const totalProcessedAmount = useMemo(() =>
    data.filter(i => i.status_id === 29 || i.status_id === 30)
      .reduce((s, i) => s + parseFloat(i.cicilan || 0), 0), [data]);

  const formattedPeriod = useMemo(() => {
    const [year, month] = reportingMonth.split('-');
    return new Date(year, parseInt(month) - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
  }, [reportingMonth]);

  // --- Filters ---
  const filteredData = useMemo(() => data.filter(item => {
    const matchSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.nik.includes(searchQuery) ||
      String(item.id).includes(searchQuery);
    const matchDept = filterDept === 'all' || item.department === filterDept;
    const matchStatus = filterStatus === 'all' ||
      (filterStatus === 'paid' && item.status_id === 29) ||
      (filterStatus === 'unpaid' && item.status_id === 28) ||
      (filterStatus === 'overdue' && item.status_id === 30);
    return matchSearch && matchDept && matchStatus;
  }), [data, searchQuery, filterDept, filterStatus]);

  const totalPages = Math.max(1, Math.ceil(filteredData.length / itemsPerPage));
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredData.slice(start, start + itemsPerPage);
  }, [filteredData, currentPage]);

  // --- Handlers ---
  const handleSelectAll = (e) => setSelectedIds(e.target.checked ? filteredData.map(i => i.id) : []);
  const handleSelectOne = (id) => setSelectedIds(prev =>
    prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
  );

  const doConfirm = async () => {
    setConfirming(true);
    // Collect the installment IDs (inst_id) from the selected loan IDs
    const installmentIds = data
      .filter(item => selectedIds.includes(item.id) && item.inst_id)
      .map(item => item.inst_id);

    if (installmentIds.length === 0) {
      showToast('No valid installment IDs found for selected records.', 'error');
      setConfirming(false);
      return;
    }

    try {
      const res = await fetch('http://127.0.0.1:8000/api/loan/loans/confirm_payroll_payments/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ installment_ids: installmentIds, period: reportingMonth })
      });
      if (res.ok) {
        showToast(`Successfully confirmed ${installmentIds.length} payment(s) for ${formattedPeriod}.`, 'success');
        setShowConfirmDialog(false);
        await fetchPayrollLoans();
      } else if (res.status === 207) {
        // Partial success
        const data = await res.json();
        showToast(`${data.message} — check console for details.`, 'error');
        console.warn('Partial failures:', data.failed);
        setShowConfirmDialog(false);
        await fetchPayrollLoans();
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to confirm payments.', 'error');
      }
    } catch { showToast('Network error. Please try again.', 'error'); }
    finally { setConfirming(false); }
  };

  const handleRollback = (row) => setRollbackTarget(row);

  const doRollback = async (row) => {
    setRollbacking(true);
    try {
      const res = await fetch('http://127.0.0.1:8000/api/loan/loans/rollback_payroll_payment/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          installment_id: row.inst_id,
          period: reportingMonth
        })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Rollback successful for ${row.name} (Installment #${row.installment_number}).`, 'success');
        setRollbackTarget(null);
        await fetchPayrollLoans();
      } else {
        showToast(data.error || 'Rollback failed.', 'error');
      }
    } catch {
      showToast('Network error during rollback.', 'error');
    } finally {
      setRollbacking(false);
    }
  };

  const handleExport = () => {
    const rows = selectedIds.length > 0
      ? data.filter(i => selectedIds.includes(i.id))
      : filteredData;
    if (rows.length === 0) { showToast('No data to export.', 'error'); return; }
    const headers = ['Loan ID', 'Member', 'NIK', 'Department', 'Type', 'Installment No', 'Deduction', 'Remaining', 'Status'];
    const statusLabel = (id) => id === 29 ? 'Paid' : id === 30 ? 'Overdue' : 'Unpaid';
    const csv = "data:text/csv;charset=utf-8,"
      + headers.join(',') + '\n'
      + rows.map(r => `${r.id},"${r.name}","${r.nik}","${r.department}","${r.type}",${r.installment_number},${r.cicilan},${r.sisa},"${statusLabel(r.status_id)}"`).join('\n');
    const link = document.createElement('a');
    link.href = encodeURI(csv);
    link.download = `payroll_${reportingMonth}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Exported ${rows.length} records.`, 'success');
  };

  const months = [
    { val: '01', label: 'January' }, { val: '02', label: 'February' }, { val: '03', label: 'March' },
    { val: '04', label: 'April' }, { val: '05', label: 'May' }, { val: '06', label: 'June' },
    { val: '07', label: 'July' }, { val: '08', label: 'August' }, { val: '09', label: 'September' },
    { val: '10', label: 'October' }, { val: '11', label: 'November' }, { val: '12', label: 'December' }
  ];
  const years = Array.from({ length: now.getFullYear() - 2020 + 3 }, (_, i) => String(2020 + i));

  return (
    <div className="pl-container">

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Rollback Dialog */}
      <RollbackDialog
        isOpen={!!rollbackTarget}
        onClose={() => !rollbacking && setRollbackTarget(null)}
        onConfirm={doRollback}
        row={rollbackTarget}
        loading={rollbacking}
      />

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={showConfirmDialog}
        onClose={() => setShowConfirmDialog(false)}
        onConfirm={doConfirm}
        count={selectedIds.length}
        period={formattedPeriod}
        loading={confirming}
      />

      {/* ── Header ── */}
      <div className="pl-header">
        <div className="pl-header-left">
          <div className="pl-header-badge">Payroll Cycle</div>
          <h1 className="pl-header-title">Loan Payroll Deduction</h1>
          <p className="pl-header-sub">Manage and confirm monthly loan repayment deductions from employee payroll.</p>
        </div>
        <div className="pl-header-right">
          {/* Period Picker */}
          <div className="pl-period-picker">
            <Calendar size={16} className="pl-period-icon" />
            <select className="pl-period-select" value={selectedMonth}
              onChange={e => { setSelectedMonth(e.target.value); setCurrentPage(1); }}>
              {months.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
            </select>
            <select className="pl-period-select" value={selectedYear}
              onChange={e => { setSelectedYear(e.target.value); setCurrentPage(1); }}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="pl-header-actions">
            <button className="pl-btn pl-btn--ghost" onClick={fetchPayrollLoans} disabled={loading}>
              <RefreshCw size={15} className={loading ? 'pl-spin' : ''} />
              Refresh
            </button>
            <button className="pl-btn pl-btn--secondary" onClick={handleExport}>
              <Upload size={15} /> Export CSV
            </button>
            <button
              className={`pl-btn pl-btn--primary ${selectedIds.length === 0 ? 'pl-btn--disabled' : ''}`}
              onClick={() => selectedIds.length > 0 && setShowConfirmDialog(true)}
              disabled={selectedIds.length === 0}
            >
              <CheckCircle size={15} />
              Confirm {selectedIds.length > 0 ? `(${selectedIds.length})` : 'Selected'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Period Banner ── */}
      <div className="pl-period-banner">
        <span className="pl-period-text">
          <Calendar size={16} /> Reporting Period: <strong>{formattedPeriod}</strong>
        </span>
        <span className={`pl-cycle-badge ${allConfirmed ? 'ready' : outstandingItems > 0 ? 'pending' : 'partial'}`}>
          {allConfirmed ? '✓ Cycle Ready to Close' : `${outstandingItems} Outstanding Remaining`}
        </span>
      </div>

      {/* ── Stat Cards ── */}
      <div className="pl-stats">
        <StatCard
          icon={TrendingUp} color="blue" label="Confirmation Progress"
          value={`${processedItems} / ${totalItems}`}
          sub={`${progressPct}% of records processed`}
          progress={progressPct}
        />
        {/* <StatCard
          icon={AlertCircle} color="orange" label="Outstanding Loans"
          value={`${outstandingItems} Records`}
          sub={outstandingItems === 0 ? 'All deductions confirmed' : 'Pending confirmation'}
        /> */}
        <StatCard
          icon={DollarSign} color="purple" label="Total Payroll Amount"
          value={formatRupiah(totalPayrollAmount)}
          sub={`For ${formattedPeriod}`}
        />
        <StatCard
          icon={CheckCircle} color="green" label="Processed Amount"
          value={formatRupiah(totalProcessedAmount)}
          sub={`${processedItems} deductions confirmed`}
        />
      </div>

      {/* ── Table ── */}
      <div className="pl-table-card">

        {/* Controls */}
        <div className="pl-table-header">
          <div className="pl-table-title">
            <FileText size={18} />
            <span>Deduction Records</span>
            <span className="pl-table-count">{filteredData.length} records</span>
          </div>
          <div className="pl-table-controls">
            <div className="pl-search-box">
              <Search size={16} />
              <input
                type="text"
                placeholder="Search by name or NIK…"
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              />
              {searchQuery && (
                <button className="pl-search-clear" onClick={() => setSearchQuery('')}><X size={14} /></button>
              )}
            </div>
            <select className="pl-select" value={filterDept}
              onChange={e => { setFilterDept(e.target.value); setCurrentPage(1); }}>
              <option value="all">All Departments</option>
              {departments.map(d => <option key={d.id} value={d.department_name}>{d.department_name}</option>)}
            </select>
            <div className="pl-status-tabs">
              {['all', 'unpaid', 'overdue', 'paid'].map(s => (
                <button key={s} className={`pl-status-tab ${filterStatus === s ? 'active-' + (s === 'paid' ? 'green' : s === 'overdue' ? 'orange' : s === 'unpaid' ? 'red' : 'blue') : ''} ${filterStatus === s ? 'pl-status-tab--active' : ''}`}
                  onClick={() => { setFilterStatus(s); setCurrentPage(1); }}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Selection bar */}
        {selectedIds.length > 0 && (
          <div className="pl-selection-bar">
            <span><CheckCircle size={16} /> {selectedIds.length} record(s) selected</span>
            <div>
              <button className="pl-sel-btn" onClick={() => setSelectedIds([])}>Clear</button>
              <button className="pl-sel-btn pl-sel-btn--confirm" onClick={() => setShowConfirmDialog(true)}>
                Confirm Selected
              </button>
            </div>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="pl-loading">
            <Loader2 size={32} className="pl-spin" />
            <span>Loading payroll data for {formattedPeriod}…</span>
          </div>
        ) : (
          <div className="pl-table-wrap">
            <table className="pl-table">
              <thead>
                <tr>
                  <th style={{ width: 44 }}>
                    <input type="checkbox" className="pl-checkbox"
                      checked={filteredData.length > 0 && selectedIds.length === filteredData.length}
                      onChange={handleSelectAll} />
                  </th>
                  <th>Inst. ID</th>
                  <th>Member</th>
                  <th>Department</th>
                  <th>Loan Type</th>
                  <th>Installment</th>
                  <th>Deduction</th>
                  <th>Remaining</th>
                  <th>Progress</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedData.length > 0 ? paginatedData.map(row => (
                  <tr key={row.id} className={selectedIds.includes(row.id) ? 'pl-row--selected' : ''}>
                    <td>
                      <input type="checkbox" className="pl-checkbox"
                        checked={selectedIds.includes(row.id)}
                        onChange={() => handleSelectOne(row.id)} />
                    </td>
                    <td>
                      <span className="pl-inst-id-badge">
                        #{row.inst_id ?? '—'}
                      </span>
                    </td>
                    <td>
                      <div className="pl-member-cell">
                        <div className="pl-member-avatar">{row.name.charAt(0)}</div>
                        <div>
                          <div className="pl-member-name">{row.name}</div>
                          <div className="pl-member-nik">{row.nik}</div>
                        </div>
                      </div>
                    </td>
                    <td><span className="pl-dept-tag">{row.department}</span></td>
                    <td>{row.type}</td>
                    <td>
                      <span className="pl-inst-badge">#{row.installment_number}</span>
                      <span className="pl-inst-of"> of {row.total_installment}</span>
                    </td>
                    <td><strong className="pl-amount">{formatRupiah(row.cicilan)}</strong></td>
                    <td><span className="pl-remaining">{formatRupiah(row.sisa)}</span></td>
                    <td>
                      <div className="pl-progress-cell">
                        <div className="pl-mini-bar">
                          <div className="pl-mini-bar-fill"
                            style={{ width: `${row.total_installment > 0 ? (row.paid_installment / row.total_installment) * 100 : 0}%` }} />
                        </div>
                        <span className="pl-progress-text">{row.progressStr}</span>
                      </div>
                    </td>
                    <td><StatusBadge statusId={row.status_id} /></td>
                    <td>
                      {(row.status_id === 29 || row.status_id === 30) ? (
                        <button
                          className="pl-rollback-btn"
                          title="Rollback to Unpaid"
                          onClick={() => handleRollback(row)}
                        >
                          <RotateCcw size={14} /> Rollback
                        </button>
                      ) : (
                        <span className="pl-action-none">—</span>
                      )}
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="10">
                      <div className="pl-empty">
                        <FileText size={40} />
                        <p>No records found for the selected filters.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="pl-pagination">
            <span className="pl-page-info">
              Page {currentPage} of {totalPages} · {filteredData.length} total records
            </span>
            <div className="pl-page-btns">
              <button className="pl-page-btn" disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => p - 1)}>
                <ChevronLeft size={16} />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                .reduce((acc, p, idx, arr) => {
                  if (idx > 0 && arr[idx - 1] !== p - 1) acc.push('...');
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) => typeof p === 'string'
                  ? <span key={i} className="pl-page-ellipsis">…</span>
                  : <button key={p} className={`pl-page-btn ${currentPage === p ? 'active' : ''}`}
                    onClick={() => setCurrentPage(p)}>{p}</button>
                )}
              <button className="pl-page-btn" disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(p => p + 1)}>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PayrollLoans;
