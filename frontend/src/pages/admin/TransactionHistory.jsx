import React, { useState, useEffect } from 'react';
import { Search, Filter, Calendar, ArrowRight, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { apiUrl } from '../../services/api';
import './TransactionHistory.css';

const TransactionHistory = () => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    member_name: '',
    transaction_type: '',
    start_date: '',
    end_date: ''
  });

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams(filters).toString();
      const res = await fetch(apiUrl(`/loan/loans/transaction_history/?${queryParams}`));
      if (res.ok) {
        const data = await res.json();
        setTransactions(data);
        setCurrentPage(1);
      }
    } catch (err) {
      console.error('Error fetching transactions:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const handleExport = () => {
    if (transactions.length === 0) {
      alert('Tidak ada data untuk diekspor');
      return;
    }

    const headers = ['Tanggal', 'Nama Anggota', 'Jenis Transaksi', 'Metode', 'Nomor Referensi', 'Jumlah', 'Status'];

    // Map transactions to CSV rows
    const rows = transactions.map(t => [
      t.transaction_date,
      `"${t.full_name}"`, // Quote names to handle commas
      `"${t.transaction_type}"`,
      t.payment_method,
      t.reference_number,
      t.amount,
      t.status
    ]);

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    // Create Blob and Download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    const dateStr = new Date().toISOString().split('T')[0];

    link.setAttribute('href', url);
    link.setAttribute('download', `transaction_history_${dateStr}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatRupiah = (number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(number || 0).replace(',00', '');
  };

  const formatDate = (dateString) => {
    if (!dateString) return '—';
    // Normalize dateString if it is naive UTC (missing timezone suffix)
    let normalized = dateString;
    if (typeof dateString === 'string') {
      const hasZ = dateString.endsWith('Z');
      const hasOffset = /([+-]\d{2}:?\d{2})$/.test(dateString);
      if (!hasZ && !hasOffset) {
        if (dateString.includes('T')) {
          normalized = dateString + 'Z';
        } else if (dateString.includes(' ')) {
          normalized = dateString.replace(' ', 'T') + 'Z';
        }
      }
    }
    const d = new Date(normalized);
    const dateStr = d.toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' });
    const timeStr = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${dateStr} ${timeStr}`;
  };

  const getStatusClass = (status) => {
    const s = status?.toLowerCase() || '';
    if (['completed', 'paid', 'late_paid'].includes(s)) return 'th-status-completed';
    if (s === 'pending') return 'th-status-pending';
    if (['failed', 'macet'].includes(s)) return 'th-status-failed';
    return '';
  };

  // Pagination Logic
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = transactions.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(transactions.length / itemsPerPage);

  const paginate = (pageNumber) => setCurrentPage(pageNumber);

  return (
    <div className="th-container">
      <div className="th-header">
        <div>
          <h1 className="th-title">Riwayat Transaksi</h1>
          <p className="th-subtitle">Pantau dan filter semua transaksi anggota meliputi simpanan, penarikan, dan pinjaman.</p>
        </div>
        <button className="th-export-btn" onClick={handleExport}>
          <Download size={18} /> Ekspor CSV
        </button>
      </div>

      <div className="th-filters-card">
        <div className="th-filters-grid">
          <div className="th-input-group">
            <label>Cari Anggota</label>
            <div className="th-search-box">
              <Search size={18} className="th-search-icon" />
              <input
                type="text"
                name="member_name"
                placeholder="Masukkan nama..."
                value={filters.member_name}
                onChange={handleFilterChange}
              />
            </div>
          </div>

          <div className="th-input-group">
            <label>Jenis Transaksi</label>
            <select name="transaction_type" value={filters.transaction_type} onChange={handleFilterChange}>
              <option value="">Semua Jenis</option>
              <option value="deposit">Setoran</option>
              <option value="INSTALLMENT PAYMENT">Angsuran Pinjaman</option>
              <option value="withdrawals">Penarikan</option>
              <option value="SHU DISTRIBUTION">Distribusi SHU</option>
            </select>
          </div>

          <div className="th-input-group">
            <label>Tanggal Mulai</label>
            <input type="date" name="start_date" value={filters.start_date} onChange={handleFilterChange} />
          </div>

          <div className="th-input-group">
            <label>Tanggal Akhir</label>
            <input type="date" name="end_date" value={filters.end_date} onChange={handleFilterChange} />
          </div>

          <div className="th-filter-actions">
            <button className="th-btn-apply" onClick={fetchTransactions}>Terapkan Filter</button>
            <button className="th-btn-reset" onClick={() => {
              const reset = { member_name: '', transaction_type: '', start_date: '', end_date: '' };
              setFilters(reset);
              setTimeout(() => fetchTransactions(), 0);
            }}>Atur Ulang</button>
          </div>
        </div>
      </div>

      <div className="th-table-wrap">
        <table className="th-table">
          <thead>
            <tr>
              <th>Tanggal</th>
              <th>Nama Anggota</th>
              <th>Jenis</th>
              <th>Metode</th>
              <th>No. Referensi</th>
              <th>Jumlah</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="7" className="th-empty">Memuat transaksi...</td></tr>
            ) : currentItems.length === 0 ? (
              <tr><td colSpan="7" className="th-empty">Tidak ada transaksi ditemukan sesuai kriteria.</td></tr>
            ) : (
              currentItems.map((row, idx) => (
                <tr key={idx}>
                  <td>{formatDate(row.transaction_date)}</td>
                  <td className="th-member-cell">{row.full_name}</td>
                  <td>
                    <span className="th-type-badge">{row.transaction_type}</span>
                  </td>
                  <td>{row.payment_method}</td>
                  <td className="th-ref-cell">{row.reference_number}</td>
                  <td className="th-amount-cell">{formatRupiah(row.amount)}</td>
                  <td>
                    <span className={`th-status-badge ${getStatusClass(row.status)}`}>
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="th-pagination">
          <button
            className="th-page-btn"
            disabled={currentPage === 1}
            onClick={() => paginate(currentPage - 1)}
          >
            <ChevronLeft size={18} />
          </button>

          {[...Array(totalPages)].map((_, i) => {
            const pageNum = i + 1;
            if (pageNum === 1 || pageNum === totalPages || (pageNum >= currentPage - 1 && pageNum <= currentPage + 1)) {
              return (
                <button
                  key={pageNum}
                  className={`th-page-num ${currentPage === pageNum ? 'active' : ''}`}
                  onClick={() => paginate(pageNum)}
                >
                  {pageNum}
                </button>
              );
            } else if (pageNum === currentPage - 2 || pageNum === currentPage + 2) {
              return <span key={pageNum} className="th-page-dots">...</span>;
            }
            return null;
          })}

          <button
            className="th-page-btn next"
            disabled={currentPage === totalPages}
            onClick={() => paginate(currentPage + 1)}
          >
            SLNJT <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
};

export default TransactionHistory;
