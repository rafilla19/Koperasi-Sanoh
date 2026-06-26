import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { apiUrl } from "../../services/api";
import "./WithdrawalRequests.css";
import SavingsTabNav from "../../components/SavingsTabNav";

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

export default function WithdrawalRequests() {
  const navigate = useNavigate();
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [filterDate, setFilterDate] = useState('');
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const fetchWithdrawals = (status) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    fetch(apiUrl(`/admin/savings/withdrawals/?${params}`))
      .then(r => r.json())
      .then(d => setWithdrawals(Array.isArray(d) ? d : []))
      .catch(() => setWithdrawals([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchWithdrawals('pending'); }, []);

  const handleFilterChange = (val) => {
    setStatusFilter(val);
    setCurrentPage(1);
    fetchWithdrawals(val);
  };

  const filteredWithdrawals = withdrawals.filter(item => {
    if (!filterDate) return true;
    const d = item.request_date ? new Date(item.request_date) : null;
    if (!d) return true;
    const itemDate = d.toISOString().slice(0, 10);
    return itemDate === filterDate;
  });

  const totalPages = Math.ceil(filteredWithdrawals.length / rowsPerPage);
  const paginatedWithdrawals = filteredWithdrawals.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  return (
    <div className="card">
      <div className="savings-header">
        <h2>Permintaan Penarikan</h2>
        <SavingsTabNav />
      </div>

      {/* FILTER */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        {/* Status filter */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { key: 'pending',  label: 'Menunggu' },
            { key: 'approved', label: 'Disetujui' },
            { key: 'paid',     label: 'Dibayar' },
            { key: 'rejected', label: 'Ditolak' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => handleFilterChange(key)}
              style={{
                padding: '7px 16px',
                borderRadius: 8,
                fontSize: 13,
                border: '1px solid #e2e8f0',
                cursor: 'pointer',
                background: statusFilter === key
                  ? key === 'paid' ? '#16a34a'
                  : key === 'approved' ? '#2563eb'
                  : key === 'rejected' ? '#dc2626'
                  : '#1e3a5f'
                  : '#fff',
                color: statusFilter === key ? '#fff' : '#374151',
                fontWeight: statusFilter === key ? 600 : 400,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Separator */}
        <div style={{ width: 1, height: 28, background: '#e2e8f0' }} />

        {/* Date filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: '#6b7280', whiteSpace: 'nowrap' }}>Tanggal:</span>
          <input
            type="date"
            value={filterDate}
            onChange={e => { setFilterDate(e.target.value); setCurrentPage(1); }}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, cursor: 'pointer' }}
          />
          {filterDate && (
            <button
              onClick={() => { setFilterDate(''); setCurrentPage(1); }}
              style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#f9fafb', fontSize: 12, cursor: 'pointer', color: '#6b7280' }}
            >
              Atur Ulang
            </button>
          )}
        </div>

        {/* Export */}
        <div style={{ marginLeft: 'auto' }}>
          <button
            disabled={filteredWithdrawals.length === 0}
            onClick={() => {
              const headers = ['Nama Member', 'NIK', 'Jenis Simpanan', 'Tanggal Request', 'Jumlah', 'Status', 'Catatan'];
              const rows = filteredWithdrawals.map(item => [
                item.member_name,
                item.member_nik || '-',
                item.saving_type_name || '-',
                item.request_date ? new Date(item.request_date).toLocaleDateString('id-ID') : '-',
                Number(item.amount || 0),
                item.status_name || item.status_code || '-',
                item.notes || '-',
              ]);
              exportToExcel(headers, rows, `withdrawals_${statusFilter}`);
            }}
            style={{
              padding: '7px 16px', borderRadius: 8, border: '1px solid #d1d5db',
              background: filteredWithdrawals.length === 0 ? '#f3f4f6' : '#fff',
              color: filteredWithdrawals.length === 0 ? '#9ca3af' : '#374151',
              fontSize: 13, fontWeight: 500,
              cursor: filteredWithdrawals.length === 0 ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            ⬇ Ekspor Excel
          </button>
        </div>
      </div>

      {/* LIST */}
      <div className="request-list">
        {loading ? (
          <p style={{ color: '#94a3b8', fontSize: 13 }}>Memuat...</p>
        ) : filteredWithdrawals.length === 0 ? (
          <p style={{ color: '#94a3b8', fontSize: 13 }}>
            Tidak ada data{filterDate ? ` pada tanggal ${new Date(filterDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}` : statusFilter ? ` dengan status "${statusFilter}"` : ''}
          </p>
        ) : (
          paginatedWithdrawals.map((item) => (
            <div key={item.id} className="request-card">
              <div className="profile">
                <div className="avatar">👤</div>
                <div>
                  <h4>{item.member_name}</h4>
                  <p>{item.saving_type_name}</p>
                  <b>{item.member_nik || '-'}</b>
                </div>
              </div>

              <div className="info">
                <p className="label">Catatan</p>
                <p>{item.notes || 'Tidak ada catatan'}</p>
              </div>

              <div className="info">
                <p className="label">Tanggal Pengajuan</p>
                <p>{item.request_date ? new Date(item.request_date).toLocaleDateString('id-ID') : '-'}</p>
              </div>

              <div className="info">
                <p className="label">Jumlah Diajukan</p>
                <p style={{ fontWeight: 600 }}>{formatRupiah(item.amount)}</p>
              </div>

              <div className="info">
                <p className="label">Status</p>
                <p style={{
                  color: item.status_code === 'pending' ? '#d97706'
                    : item.status_code === 'approved' ? '#16a34a'
                    : '#94a3b8',
                  fontWeight: 600,
                }}>
                  {item.status_name || item.status_code}
                </p>
              </div>

              <button
                className="btn-detail"
                onClick={() => navigate(`/dashboard/admin/withdrawal-requests/${item.id}`)}
              >
                Detail →
              </button>
            </div>
          ))
        )}
      </div>

      {/* PAGINATION */}
      {!loading && filteredWithdrawals.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#6b7280' }}>
            <span>Item per halaman:</span>
            <select
              value={rowsPerPage}
              onChange={e => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
              style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
            >
              {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#6b7280' }}>
            <span>{(currentPage - 1) * rowsPerPage + 1}–{Math.min(currentPage * rowsPerPage, filteredWithdrawals.length)} dari {filteredWithdrawals.length}</span>
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
    </div>
  );
}
