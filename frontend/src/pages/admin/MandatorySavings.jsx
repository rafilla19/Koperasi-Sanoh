import { useState, useEffect, useCallback, useRef } from "react";
import { apiUrl } from "../../services/api";
import "./MandatorySavings.css";
import SavingsTabNav from "../../components/SavingsTabNav";

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const YEARS = ['2024', '2025', '2026'];

const formatRupiah = (num) => "Rp " + Number(num || 0).toLocaleString("id-ID");

const exportToExcel = (headers, rows, filename) => {
  const html = [
    '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">',
    '<head><meta charset="UTF-8"></head><body><table>',
    '<tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr>',
    ...rows.map(r => '<tr>' + r.map(c => `<td>${c ?? ''}</td>`).join('') + '</tr>'),
    '</table></body></html>',
  ].join('');
  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const statusLabel = { not_generated: 'Belum Generate', pending: 'Unpaid', overdue: 'Overdue', paid: 'Lunas' };
const statusStyle = {
  not_generated: { background: '#f3f4f6', color: '#6b7280' },
  pending:       { background: '#fef3c7', color: '#d97706' },
  overdue:       { background: '#fee2e2', color: '#991b1b' },
  paid:          { background: '#d1fae5', color: '#065f46' },
};

const EMPLOYEE_STATUS_OPTIONS = [
  { value: '',  label: 'Semua Status Karyawan' },
  { value: '1', label: 'Fulltime' },
  { value: '2', label: 'Contract' },
  { value: '3', label: 'Outsource' },
];

export default function MandatorySavings() {
  const now = new Date();
  const [search, setSearch]                       = useState('');
  const [month, setMonth]                         = useState(MONTH_NAMES[now.getMonth()]);
  const [year, setYear]                           = useState(String(now.getFullYear()));
  const [statusFilter, setStatusFilter]           = useState('');
  const [employeeStatusFilter, setEmployeeStatusFilter] = useState('');
  const [data, setData]                           = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');
  const [selectedIds, setSelectedIds]   = useState([]);
  const [generating, setGenerating]     = useState(false);
  const [generateResult, setGenerateResult] = useState(null);
  const [confirmModal, setConfirmModal]  = useState(null);
  const confirmModalGuard = useRef(false);
  const [rowsPerPage, setRowsPerPage]   = useState(10);
  const [currentPage, setCurrentPage]   = useState(1);

  const monthNum = MONTH_NAMES.indexOf(month) + 1;

  const fetchData = useCallback((searchVal, monthVal, yearVal, statusVal, empStatusVal) => {
    setLoading(true);
    setError('');
    setGenerateResult(null);
    const params = new URLSearchParams();
    params.set('month', monthVal);
    params.set('year', yearVal);
    if (searchVal) params.set('search', searchVal);
    if (statusVal) params.set('status', statusVal);
    if (empStatusVal) params.set('employee_status', empStatusVal);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    fetch(apiUrl(`/admin/savings/member-obligations/?${params}`), { signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => { setData(Array.isArray(d) ? d : []); setSelectedIds([]); })
      .catch(err => {
        setData([]);
        if (err.name === 'AbortError')
          setError('Request timeout. Pastikan backend Django sudah berjalan.');
        else
          setError(`Gagal memuat data: ${err.message}`);
      })
      .finally(() => { clearTimeout(timer); setLoading(false); });
  }, []);

  useEffect(() => { fetchData(search, monthNum, year, statusFilter, employeeStatusFilter); }, []);  // eslint-disable-line

  const handleApply = () => { setCurrentPage(1); fetchData(search, monthNum, year, statusFilter, employeeStatusFilter); };
  const handleClear = () => {
    setSearch(''); setStatusFilter(''); setEmployeeStatusFilter(''); setCurrentPage(1);
    fetchData('', MONTH_NAMES.indexOf(month) + 1, year, '', '');
  };

  const totalPages = Math.ceil(data.length / rowsPerPage);
  const paginatedData = data.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  // Checkbox logic
  const allIds    = data.map(d => d.member_id);
  const allChecked = allIds.length > 0 && allIds.every(id => selectedIds.includes(id));
  const someChecked = selectedIds.length > 0;

  const toggleAll = () =>
    setSelectedIds(allChecked ? [] : allIds);

  const toggleOne = (id) =>
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);

  const handleGenerateBills = () => {
    if (selectedIds.length === 0) return;
    confirmModalGuard.current = true;
    setTimeout(() => { confirmModalGuard.current = false; }, 300);
    setConfirmModal({ count: selectedIds.length, month, year });
  };

  const doGenerateBills = async () => {
    setConfirmModal(null);
    setGenerating(true);
    setGenerateResult(null);
    try {
      const res = await fetch(apiUrl('/admin/savings/bills/generate/'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: monthNum,
          year: Number(year),
          include_mandatory: true,
          include_voluntary: true,
          member_ids: selectedIds,
        }),
      });
      const json = await res.json();
      setGenerateResult(json);
      // Refresh data to reflect new bill statuses
      fetchData(search, monthNum, year, statusFilter);
    } catch {
      setGenerateResult({ error: 'Gagal generate bills, coba lagi' });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="card mandatory-savings">
      <div className="savings-header">
        <h2>Savings Obligations</h2>
        <SavingsTabNav />
      </div>

      {/* FILTER BAR */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          style={{ flex: 1, minWidth: 180, padding: '10px 14px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 13, outline: 'none' }}
          placeholder="Cari nama atau NIK..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleApply()}
        />
        <select
          style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 13, cursor: 'pointer' }}
          value={month}
          onChange={e => setMonth(e.target.value)}
        >
          {MONTH_NAMES.map(m => <option key={m}>{m}</option>)}
        </select>
        <select
          style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 13, cursor: 'pointer' }}
          value={year}
          onChange={e => setYear(e.target.value)}
        >
          {YEARS.map(y => <option key={y}>{y}</option>)}
        </select>
        <select
          style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 13, cursor: 'pointer' }}
          value={employeeStatusFilter}
          onChange={e => setEmployeeStatusFilter(e.target.value)}
        >
          {EMPLOYEE_STATUS_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <select
          style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 13, cursor: 'pointer' }}
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="">Semua Status</option>
          <option value="not_generated">Belum Generate</option>
          <option value="pending">Unpaid</option>
          <option value="overdue">Overdue</option>
          <option value="paid">Lunas</option>
        </select>
        <button
          style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid #d1d5db', background: '#f3f4f6', fontSize: 13, cursor: 'pointer' }}
          onClick={handleClear}
        >
          Clear
        </button>
        <button
          style={{ padding: '10px 18px', borderRadius: 10, background: '#3b82f6', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          onClick={handleApply}
        >
          Cari
        </button>
        <button
          disabled={loading || data.length === 0}
          onClick={() => {
            const headers = ['No', 'NIK', 'Nama Member', 'Department', 'Status Karyawan', 'Simp. Pokok', 'Simp. Wajib', 'Simp. Sukarela', 'Total', 'Status'];
            const rows = data.map((row, i) => [
              i + 1, row.nik_employee || '-', row.member_name,
              row.department_name || '-', row.employee_status_name || '-',
              row.is_new_member ? row.pokok_amount : '-',
              row.wajib_amount, row.sukarela_amount, row.total_amount,
              statusLabel[row.bill_status] || row.bill_status,
            ]);
            exportToExcel(headers, rows, `mandatory_savings_${month}_${year}`);
          }}
          style={{
            padding: '10px 16px', borderRadius: 10, border: '1px solid #d1d5db',
            background: data.length === 0 ? '#f3f4f6' : '#fff',
            color: data.length === 0 ? '#9ca3af' : '#374151',
            fontSize: 13, fontWeight: 500, cursor: data.length === 0 ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          ⬇ Export Excel
        </button>
      </div>

      {/* ACTION BAR */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, justifyContent: 'space-between' }}>
        <button
          onClick={handleGenerateBills}
          disabled={!someChecked || generating}
          style={{
            padding: '10px 20px',
            borderRadius: 10,
            border: 'none',
            background: someChecked && !generating ? '#16a34a' : '#d1d5db',
            color: someChecked && !generating ? '#fff' : '#9ca3af',
            fontWeight: 700,
            fontSize: 13,
            cursor: someChecked && !generating ? 'pointer' : 'not-allowed',
            transition: 'background 0.2s',
          }}
        >
          {generating ? 'Generating...' : `Generate Bills${someChecked ? ` (${selectedIds.length})` : ''}`}
        </button>
        {!someChecked && !loading && data.length > 0 && (
          <span style={{ fontSize: 12, color: '#9ca3af' }}>Centang member untuk mengaktifkan Generate Bills</span>
        )}
        {generateResult && (
          <span style={{ fontSize: 13, color: generateResult.error ? '#dc2626' : '#16a34a' }}>
            {generateResult.error
              ? generateResult.error
              : `✓ ${generateResult.bills_created} tagihan dibuat, ${generateResult.skipped_existing} di-skip`}
          </span>
        )}
      </div>

      {/* TABLE */}
      <div className="table-wrapper">
      <table>
        <thead style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}>
          <tr>
            <th style={{ width: 36, padding: '1rem', borderBottom: 'none' }}>
              <input
                type="checkbox"
                checked={allChecked}
                onChange={toggleAll}
                disabled={loading || data.length === 0}
                style={{ cursor: 'pointer' }}
              />
            </th>
            <th style={{ color: '#ffffff', background: 'transparent', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', fontSize: '0.75rem', padding: '1rem', borderBottom: 'none', width: 40 }}>No</th>
            <th style={{ color: '#ffffff', background: 'transparent', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', fontSize: '0.75rem', padding: '1rem', borderBottom: 'none' }}>Nama Member</th>
            <th style={{ color: '#ffffff', background: 'transparent', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', fontSize: '0.75rem', padding: '1rem', borderBottom: 'none' }}>NIK</th>
            <th style={{ color: '#ffffff', background: 'transparent', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', fontSize: '0.75rem', padding: '1rem', borderBottom: 'none' }}>Department</th>
            <th style={{ color: '#ffffff', background: 'transparent', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', fontSize: '0.75rem', padding: '1rem', borderBottom: 'none' }}>Status Karyawan</th>
            <th style={{ color: '#ffffff', background: 'transparent', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', fontSize: '0.75rem', padding: '1rem', borderBottom: 'none' }}>Simp. Pokok</th>
            <th style={{ color: '#ffffff', background: 'transparent', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', fontSize: '0.75rem', padding: '1rem', borderBottom: 'none' }}>Simp. Wajib</th>
            <th style={{ color: '#ffffff', background: 'transparent', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', fontSize: '0.75rem', padding: '1rem', borderBottom: 'none' }}>Simp. Sukarela</th>
            <th style={{ color: '#ffffff', background: 'transparent', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', fontSize: '0.75rem', padding: '1rem', borderBottom: 'none' }}>Total</th>
            <th style={{ color: '#ffffff', background: 'transparent', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', fontSize: '0.75rem', padding: '1rem', borderBottom: 'none' }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan="11" className="empty">Memuat...</td></tr>
          ) : error ? (
            <tr><td colSpan="11" className="empty" style={{ color: '#dc2626' }}>{error}</td></tr>
          ) : data.length === 0 ? (
            <tr><td colSpan="11" className="empty">Tidak ada data ditemukan</td></tr>
          ) : (
            paginatedData.map((row, index) => (
              <tr key={row.member_id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(row.member_id)}
                    onChange={() => toggleOne(row.member_id)}
                    style={{ cursor: 'pointer' }}
                  />
                </td>
                <td style={{ color: '#94a3b8', fontSize: 12 }}>{(currentPage - 1) * rowsPerPage + index + 1}</td>
                <td style={{ fontWeight: 500 }}>{row.member_name}</td>
                <td style={{ fontSize: 13, color: '#374151' }}>{row.nik_employee || '-'}</td>
                <td style={{ fontSize: 13, color: '#374151' }}>{row.department_name || '-'}</td>
                <td>
                  <span style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 500,
                    background: row.employee_status_name === 'Fulltime' ? '#dbeafe'
                      : row.employee_status_name === 'Contract' ? '#fef9c3'
                      : row.employee_status_name === 'Outsource' ? '#f3e8ff'
                      : '#f3f4f6',
                    color: row.employee_status_name === 'Fulltime' ? '#1d4ed8'
                      : row.employee_status_name === 'Contract' ? '#a16207'
                      : row.employee_status_name === 'Outsource' ? '#7e22ce'
                      : '#6b7280',
                  }}>
                    {row.employee_status_name || '-'}
                  </span>
                </td>
                <td style={{ color: row.is_new_member ? '#0f172a' : '#cbd5e1' }}>
                  {row.is_new_member ? formatRupiah(row.pokok_amount) : '-'}
                </td>
                <td>{formatRupiah(row.wajib_amount)}</td>
                <td>{formatRupiah(row.sukarela_amount)}</td>
                <td style={{ fontWeight: 600 }}>{formatRupiah(row.total_amount)}</td>
                <td>
                  <span style={{
                    display: 'inline-block',
                    padding: '3px 10px',
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 600,
                    ...(statusStyle[row.bill_status] || statusStyle.not_generated),
                  }}>
                    {statusLabel[row.bill_status] || row.bill_status}
                  </span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      </div>

      {/* PAGINATION */}
      {!loading && data.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#6b7280' }}>
            <span>Baris per halaman:</span>
            <select
              value={rowsPerPage}
              onChange={e => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
              style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
            >
              {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#6b7280' }}>
            <span>{(currentPage - 1) * rowsPerPage + 1}–{Math.min(currentPage * rowsPerPage, data.length)} dari {data.length}</span>
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
              style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #d1d5db', background: currentPage === 1 ? '#f3f4f6' : '#fff', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}>
              Prev
            </button>
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
              style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #d1d5db', background: currentPage === totalPages ? '#f3f4f6' : '#fff', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}>
              Next
            </button>
          </div>
        </div>
      )}

      {/* CONFIRM MODAL */}
      {confirmModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget && !confirmModalGuard.current) setConfirmModal(null); }}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="#3b82f6" strokeWidth="2"/>
                <path d="M12 7v5M12 16h.01" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <h3 className="modal-title">Konfirmasi Generate</h3>
            <p className="modal-message">
              Generate tagihan untuk <strong>{confirmModal.count} member</strong> di periode{' '}
              <strong>{confirmModal.month} {confirmModal.year}</strong>?
            </p>
            <p className="modal-sub">Proses ini akan membuat tagihan pending untuk member yang dipilih.</p>
            <div className="modal-actions">
              <button className="modal-btn modal-btn-cancel" onClick={() => setConfirmModal(null)}>
                Batal
              </button>
              <button className="modal-btn modal-btn-confirm" onClick={doGenerateBills}>
                Ya, Generate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
