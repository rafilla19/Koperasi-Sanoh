import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Search, ChevronRight, ChevronLeft, Upload, CheckCircle,
  Calendar, TrendingUp, DollarSign, Users, AlertCircle, X, Loader2,
  RefreshCw, FileText, RotateCcw, Paperclip, Eye
} from 'lucide-react';
import './PayrollSummary.css';
import { apiUrl, getAuthHeaders } from '../../services/api';

const isImageFile = (url) => /\.(jpg|jpeg|png|gif|bmp|webp|svg)(\?|$)/i.test(url || '');

// --- Toast Notification Component ---
const Toast = ({ message, type, onClose }) => (
  <div className={`pl-toast pl-toast-${type}`}>
    {type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
    <span>{message}</span>
    <button onClick={onClose}><X size={14} /></button>
  </div>
);

// --- Stat Card Component ---
const StatCard = ({ icon, label, value, sub, color, progress }) => {
  const Icon = icon;

  return (
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
};

// --- Status Badge Component ---
const StatusBadge = ({ statusId }) => {
  const config = {
    29: { label: 'Lunas', cls: 'paid' },
    30: { label: 'Terlambat', cls: 'overdue' },
    28: { label: 'Belum Bayar', cls: 'unpaid' },
  };
  const c = config[statusId] || { label: 'Tidak Diketahui', cls: 'unpaid' };
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
        <h3>Batalkan Pembayaran?</h3>
        <p>Anda akan membatalkan pembayaran untuk <strong>{row.name}</strong> (Angsuran #{row.installment_number}) kembali ke <strong>Belum Bayar</strong>.</p>
        <p className="pl-dialog-note" style={{ background: '#fff7ed', borderColor: '#fde68a', color: '#92400e' }}>
          ⚠ Ini akan menghapus catatan pembayaran penggajian dan mengembalikan angsuran ke <strong>Belum Bayar</strong>.
        </p>
        <div className="pl-dialog-actions">
          <button className="pl-dialog-btn-cancel" onClick={onClose} disabled={loading}>Batal</button>
          <button
            className="pl-dialog-btn-confirm"
            style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', boxShadow: '0 4px 16px rgba(245,158,11,0.3)' }}
            onClick={() => onConfirm(row)}
            disabled={loading}
          >
            {loading ? <><Loader2 size={16} className="pl-spin" /> Memproses...</> : <><RotateCcw size={16} /> Batalkan</>}
          </button>
        </div>
      </div>
    </div>
  );
};

const ConfirmDialog = ({ isOpen, onClose, onConfirm, count, period, loading, proofFile, onProofFileChange }) => {
  if (!isOpen) return null;
  return (
    <div className="pl-dialog-overlay" onClick={onClose}>
      <div className="pl-dialog" onClick={e => e.stopPropagation()}>
        <div className="pl-dialog-icon"><CheckCircle size={32} /></div>
        <h3>Konfirmasi Pembayaran Penggajian</h3>
        <p>Anda akan mengkonfirmasi <strong>{count}</strong> potongan pembayaran untuk siklus penggajian <strong>{period}</strong>.</p>
        <p className="pl-dialog-note">Tindakan ini akan menandai angsuran terpilih sebagai <strong>Lunas</strong> di sistem. Tindakan ini tidak dapat dibatalkan.</p>

        <label style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
          border: '1.5px dashed #cbd5e1', borderRadius: 10, cursor: 'pointer',
          background: proofFile ? '#f0fdf4' : '#f8fafc', margin: '4px 0 16px',
        }}>
          <Paperclip size={18} style={{ color: proofFile ? '#16a34a' : '#64748b', flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: proofFile ? '#166534' : '#475569', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {proofFile ? proofFile.name : 'Unggah bukti transfer payroll dari HRD (wajib)'}
          </span>
          <input
            type="file"
            accept="image/*,.pdf"
            style={{ display: 'none' }}
            onChange={e => onProofFileChange(e.target.files?.[0] || null)}
          />
        </label>

        <div className="pl-dialog-actions">
          <button className="pl-dialog-btn-cancel" onClick={onClose} disabled={loading}>Batal</button>
          <button className="pl-dialog-btn-confirm" onClick={onConfirm} disabled={loading || !proofFile}>
            {loading ? <><Loader2 size={16} className="pl-spin" /> Memproses...</> : <><CheckCircle size={16} /> Konfirmasi Pembayaran</>}
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
  const [proofFile, setProofFile] = useState(null);
  const [previewDoc, setPreviewDoc] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchDepartments = async () => {
    try {
      const res = await fetch(apiUrl('/master/departments/'));
      if (res.ok) setDepartments(await res.json());
    } catch (err) { console.error('Failed to fetch departments:', err); }
  };

  const fetchPayrollLoans = useCallback(async () => {
    setLoading(true);
    setSelectedIds([]);
    try {
      const res = await fetch(apiUrl(`/loan/loans/payroll_loans_list/?period=${reportingMonth}`));
      if (res.ok) {
        const result = await res.json();
        setData(result.map(item => ({
          id: item.loan_id,
          inst_id: item.current_month_inst_id,
          name: item.full_name,
          nik: item.nik_employee,
          department: item.department_name,
          employeeStatus: item.employee_status,
          type: item.type_name,
          progressStr: `${item.paid_installment}/${item.total_installment}`,
          cicilan: item.current_month_amount,
          penalty: item.current_month_penalty,
          sisa: item.remaining_balance,
          status_id: item.current_month_status_id,
          installment_number: item.current_month_installment,
          duration: item.duration_months,
          paid_installment: item.paid_installment,
          total_installment: item.total_installment,
          payment_proof: item.payment_proof,
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
    return new Date(year, parseInt(month) - 1).toLocaleString('id-ID', { month: 'long', year: 'numeric' });
  }, [reportingMonth]);

  // --- Filters ---
  const filteredData = useMemo(() => data.filter(item => {
    const matchSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.nik.includes(searchQuery) ||
      String(item.id).includes(searchQuery);
    const matchDept = filterDept === 'all' || item.department === filterDept;
    const matchStatus = filterStatus === 'all' ||
      (filterStatus === 'paid' && (item.status_id === 29 || item.status_id === 30)) ||
      (filterStatus === 'unpaid' && item.status_id === 28);
    return matchSearch && matchDept && matchStatus;
  }), [data, searchQuery, filterDept, filterStatus]);

  const totalPages = Math.max(1, Math.ceil(filteredData.length / itemsPerPage));
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredData.slice(start, start + itemsPerPage);
  }, [filteredData, currentPage]);

  // --- Handlers ---
  const handleSelectAll = (e) => setSelectedIds(e.target.checked ? filteredData.filter(i => i.status_id !== 29 && i.status_id !== 30).map(i => i.id) : []);
  const handleSelectOne = (id) => setSelectedIds(prev =>
    prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
  );

  const doConfirm = async () => {
    if (!proofFile) {
      showToast('Bukti transfer payroll wajib diunggah sebelum konfirmasi.', 'error');
      return;
    }
    setConfirming(true);
    // Collect the installment IDs (inst_id) from the selected loan IDs
    const installmentIds = data
      .filter(item => selectedIds.includes(item.id) && item.inst_id)
      .map(item => item.inst_id);

    if (installmentIds.length === 0) {
      showToast('Tidak ada ID angsuran yang valid untuk data terpilih.', 'error');
      setConfirming(false);
      return;
    }

    try {
      const formData = new FormData();
      formData.append('installment_ids', JSON.stringify(installmentIds));
      formData.append('period', reportingMonth);
      formData.append('proof_file', proofFile);

      const res = await fetch(apiUrl('/loan/loans/confirm_payroll_payments/'), {
        method: 'POST',
        headers: { ...getAuthHeaders() },
        body: formData
      });
      if (res.status === 207) {
        const data = await res.json();
        showToast(`${data.message} — periksa konsol untuk detail.`, 'error');
        console.warn('Partial failures:', data.failed);
        setShowConfirmDialog(false);
        setProofFile(null);
        await fetchPayrollLoans();
      } else if (res.ok) {
        showToast(`Berhasil mengkonfirmasi ${installmentIds.length} pembayaran untuk ${formattedPeriod}.`, 'success');
        setShowConfirmDialog(false);
        setProofFile(null);
        await fetchPayrollLoans();
      } else {
        const responseText = await res.text();
        let err = {};
        try {
          err = responseText ? JSON.parse(responseText) : {};
        } catch {
          err = { error: responseText || `HTTP ${res.status}` };
        }
        showToast(err.error || 'Gagal mengkonfirmasi pembayaran.', 'error');
      }
    } catch { showToast('Kesalahan jaringan. Silakan coba lagi.', 'error'); }
    finally { setConfirming(false); }
  };

  const handleRollback = (row) => setRollbackTarget(row);

  const doRollback = async (row) => {
    setRollbacking(true);
    try {
      const res = await fetch(apiUrl('/loan/loans/rollback_payroll_payment/'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          installment_id: row.inst_id,
          period: reportingMonth
        })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Pembatalan berhasil untuk ${row.name} (Angsuran #${row.installment_number}).`, 'success');
        setRollbackTarget(null);
        await fetchPayrollLoans();
      } else {
        showToast(data.error || 'Pembatalan gagal.', 'error');
      }
    } catch {
      showToast('Kesalahan jaringan saat pembatalan.', 'error');
    } finally {
      setRollbacking(false);
    }
  };

  const handleExport = () => {
    const rows = selectedIds.length > 0
      ? data.filter(i => selectedIds.includes(i.id))
      : filteredData;
    if (rows.length === 0) { showToast('Tidak ada data untuk diekspor.', 'error'); return; }
    const headers = ['ID Pinjaman', 'Anggota', 'NIK', 'Departemen', 'Status Karyawan', 'Jenis', 'No Angsuran', 'Potongan', 'Pinalti', 'Total Payment', 'Sisa', 'Status'];
    const statusLabel = (id) => id === 29 ? 'Lunas' : id === 30 ? 'Terlambat' : 'Belum Bayar';
    const csv = "data:text/csv;charset=utf-8,"
      + headers.join(',') + '\n'
      + rows.map(r => `${r.id},"${r.name}","${r.nik}","${r.department}","${r.employeeStatus || '-'}","${r.type}",${r.installment_number},${r.cicilan},${r.penalty || 0},${(parseFloat(r.cicilan) || 0) + (parseFloat(r.penalty) || 0)},${r.sisa},"${statusLabel(r.status_id)}"`).join('\n');
    const link = document.createElement('a');
    link.href = encodeURI(csv);
    link.download = `payroll_${reportingMonth}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Berhasil mengekspor ${rows.length} data.`, 'success');
  };

  const months = [
    { val: '01', label: 'Januari' }, { val: '02', label: 'Februari' }, { val: '03', label: 'Maret' },
    { val: '04', label: 'April' }, { val: '05', label: 'Mei' }, { val: '06', label: 'Juni' },
    { val: '07', label: 'Juli' }, { val: '08', label: 'Agustus' }, { val: '09', label: 'September' },
    { val: '10', label: 'Oktober' }, { val: '11', label: 'November' }, { val: '12', label: 'Desember' }
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
        onClose={() => { if (!confirming) { setShowConfirmDialog(false); setProofFile(null); } }}
        onConfirm={doConfirm}
        count={selectedIds.length}
        period={formattedPeriod}
        loading={confirming}
        proofFile={proofFile}
        onProofFileChange={setProofFile}
      />

      {/* ── Header ── */}
      <div className="pl-header">
        <div className="pl-header-left">
          <div className="pl-header-badge">Siklus Penggajian</div>
          <h1 className="pl-header-title">Potongan Pinjaman Penggajian</h1>
          <p className="pl-header-sub">Kelola dan konfirmasi potongan cicilan pinjaman bulanan dari gaji karyawan.</p>
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
              Muat Ulang
            </button>
            <button className="pl-btn pl-btn--secondary" onClick={handleExport}>
              <Upload size={15} /> Ekspor CSV
            </button>
            <button
              className={`pl-btn pl-btn--primary ${selectedIds.length === 0 ? 'pl-btn--disabled' : ''}`}
              onClick={() => selectedIds.length > 0 && setShowConfirmDialog(true)}
              disabled={selectedIds.length === 0}
            >
              <CheckCircle size={15} />
              Konfirmasi {selectedIds.length > 0 ? `(${selectedIds.length})` : 'Terpilih'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Period Banner ── */}
      <div className="pl-period-banner">
        <span className="pl-period-text">
          <Calendar size={16} /> Periode Pelaporan: <strong>{formattedPeriod}</strong>
        </span>
        <span className={`pl-cycle-badge ${allConfirmed ? 'ready' : outstandingItems > 0 ? 'pending' : 'partial'}`}>
          {allConfirmed ? '✓ Siklus Siap Ditutup' : `${outstandingItems} Belum Diproses`}
        </span>
      </div>

      {/* ── Stat Cards ── */}
      <div className="pl-stats">
        <StatCard
          icon={TrendingUp} color="blue" label="Progres Konfirmasi"
          value={`${processedItems} / ${totalItems}`}
          sub={`${progressPct}% data diproses`}
          progress={progressPct}
        />
        {/* <StatCard
          icon={AlertCircle} color="orange" label="Outstanding Loans"
          value={`${outstandingItems} Records`}
          sub={outstandingItems === 0 ? 'All deductions confirmed' : 'Pending confirmation'}
        /> */}
        <StatCard
          icon={DollarSign} color="purple" label="Total Potongan Gaji"
          value={formatRupiah(totalPayrollAmount)}
          sub={`Untuk ${formattedPeriod}`}
        />
        <StatCard
          icon={CheckCircle} color="green" label="Jumlah Diproses"
          value={formatRupiah(totalProcessedAmount)}
          sub={`${processedItems} potongan dikonfirmasi`}
        />
      </div>

      {/* ── Table ── */}
      <div className="pl-table-card">

        {/* Controls */}
        <div className="pl-table-header">
          <div className="pl-table-title">
            <FileText size={18} />
            <span>Data Potongan</span>
            <span className="pl-table-count">{filteredData.length} data</span>
          </div>
          <div className="pl-table-controls">
            <div className="pl-search-box">
              <Search size={16} />
              <input
                type="text"
                placeholder="Cari berdasarkan nama atau NIK…"
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              />
              {searchQuery && (
                <button className="pl-search-clear" onClick={() => setSearchQuery('')}><X size={14} /></button>
              )}
            </div>
            <select className="pl-select" value={filterDept}
              onChange={e => { setFilterDept(e.target.value); setCurrentPage(1); }}>
              <option value="all">Semua Departemen</option>
              {departments.map(d => <option key={d.id} value={d.department_name}>{d.department_name}</option>)}
            </select>
            <div className="pl-status-tabs">
              {[{key:'all',label:'Semua'},{key:'unpaid',label:'Belum Bayar'},{key:'paid',label:'Lunas'}].map(({key,label}) => (
                <button key={key} className={`pl-status-tab ${filterStatus === key ? 'active-' + (key === 'paid' ? 'green' : key === 'unpaid' ? 'red' : 'blue') : ''} ${filterStatus === key ? 'pl-status-tab--active' : ''}`}
                  onClick={() => { setFilterStatus(key); setCurrentPage(1); }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="pl-loading">
            <Loader2 size={32} className="pl-spin" />
            <span>Memuat data penggajian untuk {formattedPeriod}…</span>
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
                  <th>ID Angsuran</th>
                  <th>Anggota</th>
                  <th>Departemen</th>
                  <th>Jenis Pinjaman</th>
                  <th>Angsuran</th>
                  <th>Potongan</th>
                  <th>Pinalti</th>
                  <th>Total Payment</th>
                  <th>Sisa</th>
                  <th>Progres</th>
                  <th>Status</th>
                  <th>Dokumen</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {paginatedData.length > 0 ? paginatedData.map(row => (
                  <tr key={row.id} className={selectedIds.includes(row.id) ? 'pl-row--selected' : ''}>
                    <td>
                      <input type="checkbox" className="pl-checkbox"
                        checked={selectedIds.includes(row.id)}
                        disabled={row.status_id === 29 || row.status_id === 30}
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
                      <span className="pl-inst-of"> dari {row.total_installment}</span>
                    </td>
                    <td><strong className="pl-amount">{formatRupiah(row.cicilan)}</strong></td>
                    <td>
                      <span style={Number(row.penalty) > 0 ? { color: '#dc2626', fontWeight: 600 } : undefined}>
                        {Number(row.penalty) > 0 ? formatRupiah(row.penalty) : '-'}
                      </span>
                    </td>
                    <td><strong className="pl-amount">{formatRupiah((parseFloat(row.cicilan) || 0) + (parseFloat(row.penalty) || 0))}</strong></td>
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
                      {(row.status_id === 29 || row.status_id === 30) && row.payment_proof ? (
                        <button
                          onClick={() => setPreviewDoc({ url: row.payment_proof, name: `Bukti Payroll — ${row.name} #${row.installment_number}` })}
                          style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#4f7df3', padding: 0, fontSize: 13, fontWeight: 600 }}
                          title="Lihat bukti transfer payroll"
                        >
                          <Eye size={14} /> Lihat
                        </button>
                      ) : (
                        <span className="pl-action-none">—</span>
                      )}
                    </td>
                    <td>
                      {(row.status_id === 29 || row.status_id === 30) ? (
                        <button
                          className="pl-rollback-btn"
                          title="Batalkan ke Belum Bayar"
                          onClick={() => handleRollback(row)}
                        >
                          <RotateCcw size={14} /> Batalkan
                        </button>
                      ) : (
                        <span className="pl-action-none">—</span>
                      )}
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="13">
                      <div className="pl-empty">
                        <FileText size={40} />
                        <p>Tidak ada data ditemukan untuk filter yang dipilih.</p>
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
              Halaman {currentPage} dari {totalPages} · {filteredData.length} total data
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

      {previewDoc && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={() => setPreviewDoc(null)}>
          <div style={{ background: '#fff', borderRadius: 12, width: '90vw', maxWidth: 900, height: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 60px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{previewDoc.name}</h3>
              <button onClick={() => setPreviewDoc(null)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, border: 'none', background: '#f1f5f9', borderRadius: 8, cursor: 'pointer', color: '#64748b' }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', padding: 16 }}>
              {isImageFile(previewDoc.url)
                ? <img src={previewDoc.url} alt={previewDoc.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 4, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }} />
                : <iframe src={previewDoc.url} title={previewDoc.name} style={{ width: '100%', height: '100%', border: 'none', borderRadius: 4 }} />
              }
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default PayrollLoans;
