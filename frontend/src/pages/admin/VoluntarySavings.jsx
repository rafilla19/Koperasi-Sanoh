import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { apiUrl } from "../../services/api";
import "./VoluntarySavings.css";


const formatRupiah = (num) => "Rp " + Number(num || 0).toLocaleString("id-ID") + ",00";

export default function VoluntarySavings() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const fetchTransactions = (status, date) => {
    setLoading(true);
    const params = new URLSearchParams({ is_mandatory: 'false' });
    if (status) params.append('status', status);
    if (date) {
      params.append('start', date);
      params.append('end', date);
    }
    fetch(apiUrl(`/admin/savings/transactions/?${params}`))
      .then(r => r.json())
      .then(d => setTransactions(Array.isArray(d) ? d : []))
      .catch(() => setTransactions([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchTransactions('', ''); }, []);

  const handleSearch = () => { setCurrentPage(1); fetchTransactions(statusFilter, dateFilter); };

  const handleClear = () => {
    setStatusFilter('');
    setDateFilter('');
    setCurrentPage(1);
    fetchTransactions('', '');
  };

  const totalPages = Math.ceil(transactions.length / rowsPerPage);
  const paginatedTransactions = transactions.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  // Summary stats computed from fetched data
  const pendingCount = transactions.filter(t => t.status_code === 'pending').length;
  const pendingTotal = transactions
    .filter(t => t.status_code === 'pending')
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const activeMemberCount = new Set(transactions.map(t => t.member_nik).filter(Boolean)).size;

  return (
    <div className="card">
      <div className="breadcrumb">
        <NavLink to="/dashboard/admin/ls-savings">← Kembali ke Savings Dashboard</NavLink>
      </div>

      <h2>Voluntary Savings & Withdrawal</h2>

      {/* TABS */}
      <div className="tabs">
        <NavLink to="/dashboard/admin/savings-management" end className={({ isActive }) => `tab ${isActive ? "active" : ""}`}>
          Savings Management
        </NavLink>
        <NavLink to="/dashboard/admin/mandatory-savings" end className={({ isActive }) => `tab ${isActive ? "active" : ""}`}>
          Mandatory &amp; Voluntary Savings
        </NavLink>
        <NavLink to="/dashboard/admin/withdrawal-requests" end className={({ isActive }) => `tab ${isActive ? "active" : ""}`}>
          Withdrawal Requests
        </NavLink>
      </div>

      {/* SUMMARY CARDS */}
      <div className="summary-cards">
        <div className="card-box">
          <p>Active Members</p>
          <h3>{loading ? '...' : activeMemberCount}</h3>
        </div>
        <div className="card-box">
          <p>Transaction Pending</p>
          <h3 className="red">{loading ? '...' : pendingCount}</h3>
        </div>
        <div className="card-box">
          <p>Total Amount Pending</p>
          <h3>{loading ? '...' : formatRupiah(pendingTotal)}</h3>
        </div>
      </div>

      {/* FILTER */}
      <div className="filter-bar">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Semua Status</option>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
        </select>

        <input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
        />

        <button className="btn-clear" onClick={handleClear}>Clear</button>
        <button className="btn-search" onClick={handleSearch}>Search</button>

        <button
          disabled={loading || transactions.length === 0}
          onClick={() => {
            const html = [
              '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">',
              '<head><meta charset="UTF-8"></head><body><table>',
              '<tr><th>No</th><th>Member Name</th><th>NIK</th><th>Type</th><th>Date</th><th>Amount</th><th>Status</th></tr>',
              ...transactions.map((item, i) => `<tr><td>${i + 1}</td><td>${item.member_name ?? ''}</td><td>${item.member_nik ?? ''}</td><td>${item.transaction_type_name ?? ''}</td><td>${item.transaction_date ? new Date(item.transaction_date).toLocaleDateString('id-ID') : ''}</td><td>${item.amount ?? ''}</td><td>${item.status_name ?? item.status_code ?? ''}</td></tr>`),
              '</table></body></html>',
            ].join('');
            const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'voluntary_savings.xls';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }}
          style={{
            padding: '8px 14px', borderRadius: 8, border: '1px solid #d1d5db',
            background: transactions.length === 0 ? '#f3f4f6' : '#fff',
            color: transactions.length === 0 ? '#9ca3af' : '#374151',
            fontSize: 13, fontWeight: 500, cursor: transactions.length === 0 ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          ⬇ Export Excel
        </button>
      </div>

      {/* TABLE */}
      <table>
        <thead>
          <tr>
            <th style={{ width: 40 }}>No</th>
            <th>Member Name</th>
            <th>Type</th>
            <th>Date</th>
            <th>Amount</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan="6" className="empty">Memuat...</td></tr>
          ) : transactions.length === 0 ? (
            <tr><td colSpan="6" className="empty">Data tidak ditemukan</td></tr>
          ) : (
            paginatedTransactions.map((item, index) => (
              <tr key={item.id}>
                <td style={{ color: '#94a3b8', fontSize: 12 }}>{(currentPage - 1) * rowsPerPage + index + 1}</td>
                <td>
                  {item.member_name}
                  <br />
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>{item.member_nik}</span>
                </td>
                <td>{item.transaction_type_name || '-'}</td>
                <td>
                  {item.transaction_date
                    ? new Date(item.transaction_date).toLocaleDateString('id-ID')
                    : '-'}
                </td>
                <td>{formatRupiah(item.amount)}</td>
                <td className={item.status_code === 'pending' ? 'pending' : 'success'}>
                  {item.status_name || item.status_code}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* PAGINATION */}
      {!loading && transactions.length > 0 && (
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
            <span>{(currentPage - 1) * rowsPerPage + 1}–{Math.min(currentPage * rowsPerPage, transactions.length)} dari {transactions.length}</span>
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
