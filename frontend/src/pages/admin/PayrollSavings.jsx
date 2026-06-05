// PayrollSavings.jsx - Updated to match PayrollLoans UI with process, rollback, and calendar filter
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Search, Calendar, RefreshCw, Upload, CheckCircle, AlertCircle, X, Loader2, RotateCcw, ChevronRight, ChevronLeft, TrendingUp, DollarSign, FileText } from 'lucide-react';
import './PayrollSummary.css';
import { apiUrl } from '../../services/api';

// Toast Notification Component
const Toast = ({ message, type, onClose }) => (
  <div className={`pl-toast pl-toast-${type}`}> 
    {type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
    <span>{message}</span>
    <button onClick={onClose}><X size={14} /></button>
  </div>
);

// Stat Card Component
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

// Status Badge Component
const StatusBadge = ({ statusId }) => {
  const config = {
    29: { label: 'Paid', cls: 'paid' },
    39: { label: 'Paid', cls: 'paid' },
    30: { label: 'Overdue', cls: 'overdue' },
    28: { label: 'Unpaid', cls: 'unpaid' },
    38: { label: 'Unpaid', cls: 'unpaid' },
  };
  const c = config[statusId] || { label: 'Unknown', cls: 'unpaid' };
  return <span className={`pl-badge pl-badge--${c.cls}`}>{c.label}</span>;
};

// Confirm Dialog Component
const ConfirmDialog = ({ isOpen, onClose, onConfirm, count, period, loading }) => {
  if (!isOpen) return null;
  return (
    <div className="pl-dialog-overlay" onClick={onClose}>
      <div className="pl-dialog" onClick={e => e.stopPropagation()}>
        <div className="pl-dialog-icon"><CheckCircle size={32} /></div>
        <h3>Confirm Savings Payments</h3>
        <p>You are about to confirm <strong>{count}</strong> savings deduction(s) for the <strong>{period}</strong> payroll cycle.</p>
        <p className="pl-dialog-note">This action will mark the selected records as <strong>Paid</strong> and cannot be undone.</p>
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

// Rollback Dialog Component
const RollbackDialog = ({ isOpen, onClose, onConfirm, row, loading }) => {
  if (!isOpen || !row) return null;
  return (
    <div className="pl-dialog-overlay" onClick={onClose}>
      <div className="pl-dialog" onClick={e => e.stopPropagation()}>
        <div className="pl-dialog-icon" style={{ background: '#fff7ed' }}><RotateCcw size={28} style={{ color: '#f59e0b' }} /></div>
        <h3>Rollback Payment?</h3>
        <p>You are about to revert the payment for <strong>{row.name}</strong> (Saving ID #{row.id}) back to <strong>Unpaid</strong>.</p>
        <p className="pl-dialog-note" style={{ background: '#fff7ed', borderColor: '#fde68a', color: '#92400e' }}>
          ⚠ This will delete the payment record and revert the status to Unpaid.
        </p>
        <div className="pl-dialog-actions">
          <button className="pl-dialog-btn-cancel" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="pl-dialog-btn-confirm" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', boxShadow: '0 4px 16px rgba(245,158,11,0.3)' }} onClick={() => onConfirm(row)} disabled={loading}>
            {loading ? <><Loader2 size={16} className="pl-spin" /> Processing...</> : <><RotateCcw size={16} /> Rollback</>}
          </button>
        </div>
      </div>
    </div>
  );
};

const PayrollSavings = () => {
  // Period state
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(String(now.getMonth() + 1).padStart(2, '0'));
  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear()));
  const reportingMonth = `${selectedYear}-${selectedMonth}`;

  // UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDept, setFilterDept] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
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

  const showToast = (msg, type = 'success') => {
    setToast({ message: msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Fetch departments for filter dropdown
  const fetchDepartments = async () => {
    try {
      const res = await fetch(apiUrl('/master/departments/'));
      if (res.ok) setDepartments(await res.json());
    } catch (e) { console.error('Failed to fetch departments', e); }
  };

  // Fetch savings data
  const fetchSavings = useCallback(async () => {
    setLoading(true);
    setSelectedIds([]);
    try {
      const res = await fetch(apiUrl(`/loan/loans/payroll_savings_list/?period=${reportingMonth}`));
      if (res.ok) {
        const result = await res.json();
        // Expected fields: id, member_id, full_name, nik_employee, department_name, pokok, wajib, sukarela, bulat, total, is_paid, status_id
        setData(result.map(item => ({
          id: item.id,
          name: item.full_name,
          nik: item.nik_employee,
          department: item.department_name,
          employeeStatus: item.employee_status,
          pokok: parseFloat(item.pokok || 0),
          wajib: parseFloat(item.wajib || 0),
          sukarela: parseFloat(item.sukarela || 0),
          bulat: parseFloat(item.bulat || 0),
          total: parseFloat(item.total || 0),
          totalOutstanding: parseFloat(item.total_outstanding || 0),
          totalPaid: parseFloat(item.total_paid || 0),
          isPaid: item.is_paid,
          status_id: item.status_id,
        })));
      }
    } catch (e) { console.error('Failed to fetch savings', e); }
    finally { setLoading(false); }
  }, [reportingMonth]);

  useEffect(() => { fetchDepartments(); }, []);
  useEffect(() => { fetchSavings(); }, [fetchSavings]);

  // Computed stats
  const totalItems = data.length;
  const processedItems = data.filter(d => d.isPaid).length;
  const outstandingItems = totalItems - processedItems;
  const allConfirmed = totalItems > 0 && processedItems === totalItems;
  const progressPct = totalItems > 0 ? Math.round((processedItems / totalItems) * 100) : 0;
  const formatRupiah = n => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n || 0).replace(',00', '');
  const totalSavingsAmount = useMemo(() => data.reduce((s, i) => s + i.total, 0), [data]);
  const totalProcessedAmount = useMemo(() => data.filter(i => i.isPaid).reduce((s, i) => s + i.total, 0), [data]);

  const formattedPeriod = useMemo(() => {
    const [y, m] = reportingMonth.split('-');
    return new Date(y, parseInt(m) - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
  }, [reportingMonth]);

  // Filters
  const filteredData = useMemo(() => data.filter(item => {
    const matchSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || item.nik.includes(searchQuery);
    const matchDept = filterDept === 'all' || item.department === filterDept;
    const matchStat = filterStatus === 'all' || (filterStatus === 'paid' && item.isPaid) || (filterStatus === 'unpaid' && !item.isPaid);
    return matchSearch && matchDept && matchStat;
  }), [data, searchQuery, filterDept, filterStatus]);

  const totalPages = Math.max(1, Math.ceil(filteredData.length / itemsPerPage));
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredData.slice(start, start + itemsPerPage);
  }, [filteredData, currentPage]);

  // Selection handlers
  const handleSelectAll = e => setSelectedIds(e.target.checked ? filteredData.map(i => i.id) : []);
  const handleSelectOne = id => setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);

  // Confirm action
  const doConfirm = async () => {
    setConfirming(true);
    const ids = data.filter(item => selectedIds.includes(item.id) && !item.isPaid).map(item => item.id);
    if (ids.length === 0) { showToast('No unpaid records selected.', 'error'); setConfirming(false); return; }
    try {
      const res = await fetch(apiUrl('/loan/loans/confirm_payroll_savings/'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saving_ids: ids, period: reportingMonth })
      });
      if (res.ok) {
        showToast(`Successfully confirmed ${ids.length} savings.`);
        setShowConfirmDialog(false);
        await fetchSavings();
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to confirm.', 'error');
      }
    } catch { showToast('Network error during confirm.', 'error'); }
    finally { setConfirming(false); }
  };

  // Rollback action per row
  const handleRollback = row => setRollbackTarget(row);
  const doRollback = async row => {
    setRollbacking(true);
    try {
      const res = await fetch(apiUrl('/loan/loans/rollback_payroll_savings/'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saving_id: row.id, period: reportingMonth })
      });
      const dataRes = await res.json();
      if (res.ok) {
        showToast(`Rollback successful for ${row.name}.`);
        setRollbackTarget(null);
        await fetchSavings();
      } else {
        showToast(dataRes.error || 'Rollback failed.', 'error');
      }
    } catch { showToast('Network error during rollback.', 'error'); }
    finally { setRollbacking(false); }
  };

  // Export CSV
  const handleExport = () => {
    const rows = selectedIds.length > 0 ? data.filter(i => selectedIds.includes(i.id)) : filteredData;
    if (rows.length === 0) { showToast('No data to export.', 'error'); return; }
    const headers = ['Member', 'Department', 'Employee Status', 'Pokok', 'Wajib', 'Sukarela', 'Total Outstanding', 'Total Paid', 'Status'];
    const csv = "data:text/csv;charset=utf-8," + headers.join(',') + "\n" +
      rows.map(r => `"${r.name}","${r.department}","${r.employeeStatus || '-'}","${r.pokok}","${r.wajib}","${r.sukarela}","${r.totalOutstanding}","${r.totalPaid}","${r.isPaid ? 'Paid' : 'Unpaid'}"`).join('\n');
    const link = document.createElement('a');
    link.href = encodeURI(csv);
    link.download = `payroll_savings_${reportingMonth}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Exported ${rows.length} records.`);
  };

  // Month/Year options
  const months = [{val:'01',label:'January'},{val:'02',label:'February'},{val:'03',label:'March'},{val:'04',label:'April'},{val:'05',label:'May'},{val:'06',label:'June'},{val:'07',label:'July'},{val:'08',label:'August'},{val:'09',label:'September'},{val:'10',label:'October'},{val:'11',label:'November'},{val:'12',label:'December'}];
  const years = Array.from({length: now.getFullYear() - 2020 + 3}, (_,i) => String(2020 + i));

  return (
    <div className="pl-container">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <RollbackDialog isOpen={!!rollbackTarget} onClose={() => !rollbacking && setRollbackTarget(null)} onConfirm={doRollback} row={rollbackTarget} loading={rollbacking} />
      <ConfirmDialog isOpen={showConfirmDialog} onClose={() => setShowConfirmDialog(false)} onConfirm={doConfirm} count={selectedIds.length} period={formattedPeriod} loading={confirming} />
      {/* Header */}
      <div className="pl-header">
        <div className="pl-header-left">
          <div className="pl-header-badge">Payroll Cycle</div>
          <h1 className="pl-header-title">Savings Payroll Deduction</h1>
          <p className="pl-header-sub">Manage and confirm monthly savings deductions from employee payroll.</p>
        </div>
        <div className="pl-header-right">
          <div className="pl-period-picker">
            <Calendar size={16} className="pl-period-icon" />
            <select className="pl-period-select" value={selectedMonth} onChange={e => { setSelectedMonth(e.target.value); setCurrentPage(1); }}>
              {months.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
            </select>
            <select className="pl-period-select" value={selectedYear} onChange={e => { setSelectedYear(e.target.value); setCurrentPage(1); }}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="pl-header-actions">
            <button className="pl-btn pl-btn--ghost" onClick={fetchSavings} disabled={loading}>
              <RefreshCw size={15} className={loading ? 'pl-spin' : ''} /> Refresh
            </button>
            <button className="pl-btn pl-btn--secondary" onClick={handleExport}>
              <Upload size={15} /> Export CSV
            </button>
            <button className={`pl-btn pl-btn--primary ${selectedIds.length===0?'pl-btn--disabled':''}`} onClick={() => selectedIds.length>0 && setShowConfirmDialog(true)} disabled={selectedIds.length===0}>
              <CheckCircle size={15} /> Confirm {selectedIds.length>0 ? `(${selectedIds.length})` : 'Selected'}
            </button>
          </div>
        </div>
      </div>
      {/* Period Banner */}
      <div className="pl-period-banner"><span className="pl-period-text"><Calendar size={16} /> Reporting Period: <strong>{formattedPeriod}</strong></span>
        <span className={`pl-cycle-badge ${allConfirmed ? 'ready' : outstandingItems>0 ? 'pending' : 'partial'}`}>{allConfirmed ? '✓ Cycle Ready to Close' : `${outstandingItems} Outstanding Remaining`}</span>
      </div>
      {/* Stats */}
      <div className="pl-stats">
        <StatCard icon={TrendingUp} color="blue" label="Confirmation Progress" value={`${processedItems} / ${totalItems}`} sub={`${progressPct}% processed`} progress={progressPct} />
        <StatCard icon={DollarSign} color="purple" label="Total Savings Amount" value={formatRupiah(totalSavingsAmount)} sub={`For ${formattedPeriod}`} />
        <StatCard icon={CheckCircle} color="green" label="Processed Amount" value={formatRupiah(totalProcessedAmount)} sub={`${processedItems} deductions confirmed`} />
      </div>
      {/* Table Card */}
      <div className="pl-table-card">
        <div className="pl-table-header">
          <div className="pl-table-title">
            <FileText size={18} />
            <span>Savings Records</span>
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
                <button className="pl-search-clear" onClick={() => setSearchQuery('')}>
                  <X size={14} />
                </button>
              )}
            </div>
            <select
              className="pl-select"
              value={filterDept}
              onChange={e => { setFilterDept(e.target.value); setCurrentPage(1); }}
            >
              <option value="all">All Departments</option>
              {departments.map(d => (
                <option key={d.id} value={d.department_name}>{d.department_name}</option>
              ))}
            </select>
            <div className="pl-status-tabs">
              {['all', 'unpaid', 'paid'].map(s => (
                <button
                  key={s}
                  className={`pl-status-tab ${filterStatus === s ? 'active-' + (s === 'paid' ? 'green' : s === 'unpaid' ? 'red' : 'blue') : ''} ${filterStatus === s ? 'pl-status-tab--active' : ''}`}
                  onClick={() => { setFilterStatus(s); setCurrentPage(1); }}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {selectedIds.length > 0 && (
          <div className="pl-selection-bar">
            <span>
              <CheckCircle size={16} /> {selectedIds.length} record(s) selected
            </span>
            <div>
              <button className="pl-sel-btn" onClick={() => setSelectedIds([])}>Clear</button>
              <button className="pl-sel-btn pl-sel-btn--confirm" onClick={() => setShowConfirmDialog(true)}>
                Confirm Selected
              </button>
            </div>
          </div>
        )}
        {loading ? (
          <div className="pl-loading"><Loader2 size={32} className="pl-spin" /><span>Loading payroll data for {formattedPeriod}…</span></div>
        ) : (
          <div className="pl-table-wrap">
            <table className="pl-table">
              <thead>
                <tr>
                  <th style={{ width:44 }}><input type="checkbox" className="pl-checkbox" checked={filteredData.length>0 && selectedIds.length===filteredData.length} onChange={handleSelectAll} /></th>
                  <th>Member</th>
                  <th>Department</th>
                  <th>Pokok</th>
                  <th>Wajib</th>
                  <th>Sukarela</th>
                  <th>Total Outstanding</th>
                  <th>Total Paid</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedData.length>0 ? paginatedData.map(row => (
                  <tr key={row.id} className={selectedIds.includes(row.id) ? 'pl-row--selected' : ''}>
                    <td><input type="checkbox" className="pl-checkbox" checked={selectedIds.includes(row.id)} onChange={() => handleSelectOne(row.id)} /></td>
                    <td>
                      <div className="pl-member-cell">
                        <div className="pl-member-avatar">{row.name ? row.name.charAt(0) : 'M'}</div>
                        <div>
                          <div className="pl-member-name">{row.name}</div>
                          <div className="pl-member-nik">{row.nik}</div>
                        </div>
                      </div>
                    </td>
                    <td>{row.department}</td>
                    <td>{formatRupiah(row.pokok)}</td>
                    <td>{formatRupiah(row.wajib)}</td>
                    <td>{formatRupiah(row.sukarela)}</td>
                    <td className="pl-amount" style={{ color: '#ef4444' }}><strong>{formatRupiah(row.totalOutstanding)}</strong></td>
                    <td className="pl-amount" style={{ color: '#22c55e' }}><strong>{formatRupiah(row.totalPaid)}</strong></td>
                    <td><StatusBadge statusId={row.status_id} /></td>
                    <td>{(row.isPaid) ? (<button className="pl-rollback-btn" title="Rollback to Unpaid" onClick={() => handleRollback(row)}><RotateCcw size={14} /> Rollback</button>) : (<span className="pl-action-none">—</span>)}</td>
                  </tr>
                )) : (
                  <tr><td colSpan="10" style={{ textAlign:'center', padding:'24px' }}>No records found for the selected filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {/* Pagination */}
        {!loading && totalPages>1 && (
          <div className="pl-pagination">
            <span className="pl-page-info">Page {currentPage} of {totalPages} · {filteredData.length} total records</span>
            <div className="pl-page-btns">
              <button className="pl-page-btn" disabled={currentPage===1} onClick={() => setCurrentPage(p=>p-1)}><ChevronLeft size={16} /></button>
              {Array.from({length: totalPages }, (_, i)=>i+1).filter(p=>p===1||p===totalPages||Math.abs(p-currentPage)<=1).reduce((acc,p,idx,arr)=>{ if(idx>0 && arr[idx-1]!==p-1) acc.push('...'); acc.push(p); return acc; },[]).map((p,i)=> typeof p==='string' ? <span key={i} className="pl-page-ellipsis">…</span> : <button key={p} className={`pl-page-btn ${currentPage===p?'active':''}`} disabled={currentPage===p} onClick={()=>setCurrentPage(p)}>{p}</button>)}
              <button className="pl-page-btn" disabled={currentPage===totalPages} onClick={() => setCurrentPage(p=>p+1)}><ChevronRight size={16} /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PayrollSavings;

