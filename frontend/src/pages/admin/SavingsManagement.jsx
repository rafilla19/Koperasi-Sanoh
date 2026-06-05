import { useState, useEffect } from "react";
import { apiUrl } from "../../services/api";
import "./SavingsManagement.css";
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

// saving_type_id: 1 = wajib, 2 = sukarela, 3 = pokok
const getWalletBalance = (wallets, typeId) => {
  const w = (wallets || []).find(w => w.saving_type_id === typeId);
  return w ? Number(w.balance) : 0;
};

export default function SavingsManagement() {
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [departments, setDepartments] = useState([]);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    fetch(apiUrl('/admin/departments/'))
      .then(r => r.json())
      .then(d => setDepartments(Array.isArray(d) ? d : []))
      .catch(() => setDepartments([]));
  }, []);

  const fetchData = (searchVal, deptId) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (searchVal) params.append('search', searchVal);
    if (deptId) params.append('department_id', deptId);
    fetch(apiUrl(`/admin/savings/member-wallets/?${params}`))
      .then(r => r.json())
      .then(d => setData(Array.isArray(d) ? d : []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData('', ''); }, []);

  const handleSearch = () => { setCurrentPage(1); fetchData(search, department); };
  const handleClear = () => { setSearch(''); setDepartment(''); setCurrentPage(1); fetchData('', ''); };

  const totalPages = Math.ceil(data.length / rowsPerPage);
  const paginatedData = data.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  const handleDepartmentChange = (e) => {
    const val = e.target.value;
    setDepartment(val);
    fetchData(search, val);
  };

  return (
    <div className="card">
      <div className="savings-header">
        <h2>Savings Management</h2>
        <SavingsTabNav />
      </div>

      {/* SEARCH & FILTER */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          style={{
            flex: 1,
            minWidth: 180,
            padding: '10px 14px',
            borderRadius: 10,
            border: '1px solid #e5e7eb',
            fontSize: 13,
            outline: 'none',
          }}
          placeholder="Search by name, NIK, or Loan ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <select
          style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 13, cursor: 'pointer' }}
          value={department}
          onChange={handleDepartmentChange}
        >
          <option value="">Semua Department</option>
          {departments.map(d => (
            <option key={d.id} value={d.id}>{d.department_name || d.name}</option>
          ))}
        </select>
        <button
          disabled={loading || data.length === 0}
          onClick={() => {
            const headers = ['No', 'Nama Anggota', 'NIK', 'Department', 'Withdrawal', 'Simp. Pokok', 'Simp. Wajib', 'Simp. Sukarela', 'Total'];
            const rows = data.map((item, i) => {
              const wajib      = getWalletBalance(item.wallets, 1);
              const sukarela   = getWalletBalance(item.wallets, 2);
              const pokok      = getWalletBalance(item.wallets, 3);
              const withdrawal = Number(item.total_withdrawal || 0);
              const total      = pokok + wajib + sukarela - withdrawal;
              return [
                i + 1, item.member_name, item.member_nik || '-', item.department_name || '-',
                withdrawal, pokok, wajib, sukarela, total,
              ];
            });
            exportToExcel(headers, rows, 'savings_management');
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

      {/* TABLE */}
      <table>
        <thead>
          <tr>
            <th style={{ width: 40 }}>No</th>
            <th>Anggota</th>
            <th>Department</th>
            <th>Withdraw</th>
            <th>Simp Pokok</th>
            <th>Simp Wajib</th>
            <th>Simp Sukarela</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan="8" className="empty">Memuat...</td></tr>
          ) : data.length === 0 ? (
            <tr><td colSpan="8" className="empty">Data tidak ditemukan</td></tr>
          ) : (
            paginatedData.map((item, index) => {
              const wajib      = getWalletBalance(item.wallets, 1);
              const sukarela   = getWalletBalance(item.wallets, 2);
              const pokok      = getWalletBalance(item.wallets, 3);
              const withdrawal = Number(item.total_withdrawal || 0);
              const total      = pokok + wajib + sukarela - withdrawal;

              return (
                <tr key={item.member_id}>
                  <td style={{ color: '#94a3b8', fontSize: 12 }}>{(currentPage - 1) * rowsPerPage + index + 1}</td>
                  <td>
                    {item.member_name}<br />
                    <span className="sub">{item.member_nik || '-'}</span>
                  </td>
                  <td>{item.department_name || '-'}</td>
                  <td>{formatRupiah(withdrawal)}</td>
                  <td>{formatRupiah(pokok)}</td>
                  <td>{formatRupiah(wajib)}</td>
                  <td>{formatRupiah(sukarela)}</td>
                  <td className="total">{formatRupiah(total)}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

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
    </div>
  );
}
