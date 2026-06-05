import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Upload, X, UploadCloud, Download, AlertCircle, ArrowLeft, TrendingUp, TrendingDown, Database, Scale, CheckCircle2, Send } from 'lucide-react';
import { shuApi } from '../../api/shuApi';
import './SHUManagement.css';

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const formatCurrency = (val) =>
  new Intl.NumberFormat('id-ID').format(val ?? 0);

const parseAmount = (val) => {
  const num = Number(String(val ?? '').replace(/[^0-9.-]+/g, ''));
  return Number.isFinite(num) ? num : 0;
};

const MONTH_NAMES = [
  'Januari','Februari','Maret','April','Mei','Juni',
  'Juli','Agustus','September','Oktober','November','Desember',
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => String(CURRENT_YEAR - i));
const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1));

const emptyForm = {
  transaction_date: '',
  category: '',
  invoice_number: '',
  supplier_customer: '',
  quantity: '',
  amount: '',
};

const SHUOutcomeTransaction = () => {
  const navigate = useNavigate();
  const now = new Date();

  // filter state (pending — applied on "Cari")
  const [search, setSearch]   = useState('');
  const [day, setDay]         = useState('');
  const [month, setMonth]     = useState('');
  const [year, setYear]       = useState(String(CURRENT_YEAR));

  // data state
  const [transactions, setTransactions] = useState([]);
  const [apiTotalIncome, setApiTotalIncome]   = useState(0);
  const [apiTotalExpense, setApiTotalExpense] = useState(0);
  const [categories, setCategories]     = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');

  // pagination
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [filterType, setFilterType] = useState('');

  // distribusi SHU state
  const [shuResult, setShuResult]               = useState(null);
  const [showDistribusiModal, setShowDistribusiModal] = useState(false);
  const [distributing, setDistributing]         = useState(false);
  const [distribusiSuccess, setDistribusiSuccess] = useState('');

  // modals
  const [showManualModal, setShowManualModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [form, setForm]         = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError]   = useState(null);

  // upload excel state
  const [uploadFile, setUploadFile]       = useState(null);
  const [uploading, setUploading]         = useState(false);
  const [uploadResult, setUploadResult]   = useState(null); // { inserted, errors }
  const [uploadError, setUploadError]     = useState(null);
  const [dragOver, setDragOver]           = useState(false);
  const fileInputRef = React.useRef(null);

  const fetchTransactions = useCallback((s, d, m, y) => {
    setLoading(true);
    setError('');
    shuApi.getOutcomeTransactions({ search: s, day: d, month: m, year: y })
      .then(data => {
        setTransactions(data.results ?? []);
        setApiTotalIncome(data.total_income ?? 0);
        setApiTotalExpense(data.total_expense ?? 0);
        setCurrentPage(1);
      })
      .catch(err => setError('Gagal memuat data: ' + (err?.detail || err?.error || JSON.stringify(err) || 'Unknown error')))
      .finally(() => setLoading(false));
  }, []);

  const fetchShuResult = useCallback((m, y) => {
    setShuResult(null);
    setDistribusiSuccess('');
    shuApi.getShuResult({ year: y || '', month: m || '' })
      .then(data => setShuResult(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    shuApi.getOutcomeCategories().then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    fetchTransactions('', '', '', String(CURRENT_YEAR));
    fetchShuResult('', String(CURRENT_YEAR));
  }, []); // eslint-disable-line

  const handleApply = () => {
    setCurrentPage(1);
    const monthParam = month === '' ? '' : String(MONTH_NAMES.indexOf(month) + 1);
    const yearParam = year === '' ? '' : year;
    fetchTransactions(search, day, monthParam, yearParam);
    fetchShuResult(monthParam, yearParam);
  };

  const handleClear = () => {
    setSearch(''); setDay('');
    setMonth('');
    setYear(String(CURRENT_YEAR));
    setFilterType('');
    setCurrentPage(1);
    fetchTransactions('', '', '', String(CURRENT_YEAR));
    fetchShuResult('', String(CURRENT_YEAR));
  };

  const handleDistribusi = async () => {
    setDistributing(true);
    const monthNum = month === '' ? 13 : MONTH_NAMES.indexOf(month) + 1;
    const yearNum  = year === '' ? null : Number(year);
    try {
      const res = await shuApi.distributeShu({
        period_year:   yearNum,
        period_month:  monthNum,
        total_revenue: totalIncome,
        total_expense: totalExpense,
        net_profit:    shu,
      });
      setShuResult(res);

      // Setelah ShuResults tersimpan, persist per-member bases ke tabel shu_member_bases
      try {
        await shuApi.distributeMemberBases({ year: yearNum, month: monthNum });
        setDistribusiSuccess(`SHU berhasil didistribusikan untuk periode ${month || 'semua bulan'} ${year}.`);
      } catch (err2) {
        setError('SHU tersimpan, namun gagal menyimpan member bases: ' + (err2.message || err2));
      }
    } catch {
      setError('Gagal menyimpan distribusi SHU.');
    } finally {
      setDistributing(false);
      setShowDistribusiModal(false);
    }
  };

  // apply client-side type filter — type now comes from category.type (INCOME/EXPENSE)
  const filteredTransactions = transactions.filter(r => {
    if (!filterType) return true;
    return String(r.type || '').toUpperCase() === String(filterType).toUpperCase();
  });

  // pagination calc (based on filtered set)
  const totalPages    = Math.max(1, Math.ceil(filteredTransactions.length / rowsPerPage));
  const paginatedRows = filteredTransactions.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);
  const rangeStart    = filteredTransactions.length === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1;
  const rangeEnd      = Math.min(currentPage * rowsPerPage, filteredTransactions.length);

  const totalIncome = filterType
    ? filteredTransactions.reduce(
        (sum, row) => sum + (String(row.type || '').trim().toUpperCase() === 'INCOME' ? parseAmount(row.amount) : 0),
        0,
      )
    : apiTotalIncome;
  const totalExpense = filterType
    ? filteredTransactions.reduce(
        (sum, row) => sum + (String(row.type || '').trim().toUpperCase() === 'EXPENSE' ? parseAmount(row.amount) : 0),
        0,
      )
    : apiTotalExpense;
  const count = filteredTransactions.length;
  const shu = totalIncome - totalExpense;

  const handleFormChange = (e) =>
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    const res = await shuApi.createOutcomeTransaction({
      ...form,
      category: Number(form.category),
      quantity:  Number(form.quantity),
      amount:    Number(form.amount),
    });
    setSubmitting(false);
    if (res.id) {
      setShowManualModal(false);
      setForm(emptyForm);
      const monthParam = month === '' ? '' : String(MONTH_NAMES.indexOf(month) + 1);
      const yearParam = year === '' ? '' : year;
      fetchTransactions(search, day, monthParam, yearParam);
    } else {
      setFormError(Object.values(res).flat().join(' '));
    }
  };

  const handleOpenUpload = () => {
    setUploadFile(null);
    setUploadResult(null);
    setUploadError(null);
    setShowUploadModal(true);
  };

  const handleFileSelect = (file) => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls'].includes(ext)) {
      setUploadError('Hanya file .xlsx atau .xls yang didukung.');
      return;
    }
    setUploadFile(file);
    setUploadError(null);
    setUploadResult(null);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFileSelect(e.dataTransfer.files[0]);
  };

  const handleUploadSubmit = async () => {
    if (!uploadFile) { setUploadError('Pilih file Excel terlebih dahulu.'); return; }
    setUploading(true);
    setUploadError(null);
    setUploadResult(null);
    try {
      const res = await shuApi.uploadOutcomeExcel(uploadFile);
      if (res.error) { setUploadError(res.error); return; }
      setUploadResult(res);
      if (res.inserted > 0) {
        const monthParam = month === '' ? '' : String(MONTH_NAMES.indexOf(month) + 1);
        fetchTransactions(search, day, monthParam, year === '' ? '' : year);
      }
    } catch {
      setUploadError('Gagal menghubungi server.');
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const blob = await shuApi.downloadOutcomeTemplate();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'template_transaksi_shu.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Gagal mengunduh template.');
    }
  };

  // shared input/select style — matches MandatorySavings
  const filterInput = {
    padding: '10px 14px',
    borderRadius: 10,
    border: '1px solid #e5e7eb',
    fontSize: 13,
    outline: 'none',
    background: '#fff',
    color: '#374151',
  };

  const filterSelect = {
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid #e5e7eb',
    fontSize: 13,
    cursor: 'pointer',
    background: '#fff',
    color: '#374151',
  };

  return (
    <div className="shu-container shu-page-shell">
      {/* Breadcrumb / back */}
      <button className="shu-btn-back" onClick={() => navigate('/dashboard/admin/shu-dashboard')}>
        <ArrowLeft size={16} /> Back to Dashboard
      </button>

      <h1 className="shu-page-title" style={{ fontSize: '20px', marginBottom: 0 }}>
        SHU MANAGEMENT &gt; OUTCOME INCOME TRANSACTION
      </h1>
      <p className="shu-page-subtitle" style={{ borderBottom: '1px solid #e5e7eb', paddingBottom: '20px' }}>
        Report for the {year} Financial Year
      </p>

      {/* KPI Summary Cards — card-box style dari MandatorySavings */}
      <div className="shu-card-grid shu-section-block">
        <div className="shu-stat-card" style={{ borderTop: '4px solid #16a34a' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <TrendingUp size={16} color="#16a34a" />
            <p className="shu-stat-title">Total Income</p>
          </div>
          <h3 className="shu-stat-value" style={{ color: '#16a34a' }}>
            Rp {formatCurrency(totalIncome)}
          </h3>
        </div>

        <div className="shu-stat-card" style={{ borderTop: '4px solid #dc2626' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <TrendingDown size={16} color="#dc2626" />
            <p className="shu-stat-title">Total Expense</p>
          </div>
          <h3 className="shu-stat-value" style={{ color: '#dc2626' }}>
            Rp {formatCurrency(totalExpense)}
          </h3>
        </div>

        <div className="shu-stat-card" style={{ borderTop: `4px solid ${shu >= 0 ? '#16a34a' : '#dc2626'}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Scale size={16} color={shu >= 0 ? '#16a34a' : '#dc2626'} />
            <p className="shu-stat-title">Sisa Hasil Usaha</p>
          </div>
          <h3 className="shu-stat-value" style={{ color: shu >= 0 ? '#16a34a' : '#dc2626' }}>
            {shu < 0 ? '-' : ''}Rp {formatCurrency(Math.abs(shu))}
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: 11, color: '#9ca3af' }}>Total Income − Total Expense</p>
        </div>

        <div className="shu-stat-card" style={{ borderTop: '4px solid #475569' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Database size={16} color="#374151" />
            <p className="shu-stat-title">Transaction Records</p>
          </div>
          <h3 className="shu-stat-value" style={{ color: '#374151' }}>
            {count} records
          </h3>
        </div>
      </div>

      {/* Filter bar — sama persis dengan MandatorySavings */}
      <div className="shu-toolbar shu-section-block">
        <input
          className="shu-search-input"
          style={{ flex: 1, minWidth: 180 }}
          placeholder="Cari Invoice No. atau Supplier/Customer..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleApply()}
        />
        <select style={filterSelect} value={day} onChange={e => setDay(e.target.value)}>
          <option value="">Semua Tanggal</option>
          {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select style={filterSelect} value={month} onChange={e => setMonth(e.target.value)}>
          <option value="">Semua Bulan</option>
          {MONTH_NAMES.map(m => <option key={m}>{m}</option>)}
        </select>
        <select style={filterSelect} value={year} onChange={e => setYear(e.target.value)}>
          <option value="">Semua Tahun</option>
          {YEARS.map(y => <option key={y}>{y}</option>)}
        </select>
        <select style={filterSelect} value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">Semua Tipe</option>
          <option value="INCOME">INCOME</option>
          <option value="EXPENSE">EXPENSE</option>
        </select>
        <button className="shu-pill-button" onClick={handleClear}>
          Clear
        </button>
        <button
          className="shu-pill-button active"
          onClick={handleApply}
        >
          Cari
        </button>
      </div>

      {/* Success banner */}
      {distribusiSuccess && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 16px' }}>
          <CheckCircle2 size={16} color="#16a34a" />
          <span style={{ fontSize: 13, color: '#15803d', fontWeight: 500 }}>{distribusiSuccess}</span>
        </div>
      )}

      {/* Action bar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, alignItems: 'center' }}>
        {shuResult?.distributed_status ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: 13, color: '#15803d', fontWeight: 600 }}>
            <CheckCircle2 size={14} color="#16a34a" />
            Sudah Didistribusikan
          </div>
        ) : (
          <button
            onClick={() => setShowDistribusiModal(true)}
            disabled={!year}
            style={{ padding: '8px 18px', borderRadius: 10, border: 'none', background: year ? '#7c3aed' : '#e5e7eb', color: year ? '#fff' : '#9ca3af', fontSize: 13, fontWeight: 600, cursor: year ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Send size={14} /> Distribusi SHU
          </button>
        )}
        <button
          onClick={() => { setForm(emptyForm); setFormError(null); setShowManualModal(true); }}
          style={{ padding: '8px 18px', borderRadius: 10, border: '1px solid #d1d5db', background: '#fff', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Plus size={14} /> Add Manually
        </button>
        <button
          onClick={handleOpenUpload}
          style={{ padding: '8px 18px', borderRadius: 10, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Upload size={14} /> Upload Excel
        </button>
      </div>

      {/* Table */}
      <div className="shu-data-panel shu-section-block">
        {error && (
            <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 8 }}>{error}</p>
        )}
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#f9fafb', borderRadius: 12, overflow: 'hidden' }}>
          <thead style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}>
            <tr>
              {['No','Transaction Date','Jenis Transaksi','Type','Invoice Number','Supplier/Customer','Quantity','Amount Payment'].map(h => (
                <th key={h} style={{ padding: 12, textAlign: 'left', color: '#fff', fontWeight: 600, fontSize: 13, letterSpacing: '0.3px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Memuat...</td></tr>
            ) : paginatedRows.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Tidak ada data transaksi.</td></tr>
            ) : (
              paginatedRows.map((row, idx) => (
                <tr key={row.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: 12, fontSize: 13, color: '#374151' }}>{(currentPage - 1) * rowsPerPage + idx + 1}</td>
                  <td style={{ padding: 12, fontSize: 13, color: '#0f172a' }}>{formatDate(row.transaction_date)}</td>
                  <td style={{ padding: 12, fontSize: 13, color: '#374151' }}>{row.category_name}</td>
                  <td style={{ padding: 12, fontSize: 13 }}>
                    {row.type ? (
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 10px',
                        borderRadius: 12,
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: '0.5px',
                        background: String(row.type).toLowerCase() === 'income' ? '#d1fae5' : '#fee2e2',
                        color: String(row.type).toLowerCase() === 'income' ? '#065f46' : '#991b1b',
                      }}>
                        {String(row.type).toUpperCase()}
                      </span>
                    ) : <span style={{ color: '#9ca3af', fontSize: 12 }}>-</span>}
                  </td>
                  <td style={{ padding: 12, fontSize: 13, color: '#374151' }}>{row.invoice_number}</td>
                  <td style={{ padding: 12, fontSize: 13, color: '#374151' }}>{row.supplier_customer}</td>
                  <td style={{ padding: 12, fontSize: 13, color: '#374151' }}>{row.quantity}</td>
                  <td style={{ padding: 12, fontSize: 13, color: '#374151', fontWeight: 600 }}>Rp {formatCurrency(row.amount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination — sama persis dengan MandatorySavings */}
        {!loading && filteredTransactions.length > 0 && (
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
              <span>{rangeStart}–{rangeEnd} dari {filteredTransactions.length}</span>
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #d1d5db', background: currentPage === 1 ? '#f3f4f6' : '#fff', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', fontSize: 13 }}
              >
                Prev
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #d1d5db', background: currentPage === totalPages ? '#f3f4f6' : '#fff', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', fontSize: 13 }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Distribusi SHU Confirmation Modal */}
      {showDistribusiModal && (
        <div className="shu-modal-overlay" onClick={() => setShowDistribusiModal(false)}>
          <div className="shu-modal-content" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="shu-modal-header">
              <div className="shu-modal-title">Konfirmasi Distribusi SHU</div>
              <button className="shu-modal-close" onClick={() => setShowDistribusiModal(false)}><X size={20} /></button>
            </div>
            <div className="shu-form-container">
              <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 20 }}>
                Data berikut akan disimpan ke database sebagai hasil SHU periode ini.
              </p>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 24 }}>
                <tbody>
                  {[
                    { label: 'Tahun', value: year || '-' },
                    { label: 'Bulan', value: month || 'Semua Bulan' },
                    { label: 'Total Revenue', value: `Rp ${formatCurrency(totalIncome)}`, color: '#16a34a' },
                    { label: 'Total Expense', value: `Rp ${formatCurrency(totalExpense)}`, color: '#dc2626' },
                    { label: 'Net Profit (SHU)', value: `${shu < 0 ? '-' : ''}Rp ${formatCurrency(Math.abs(shu))}`, color: shu >= 0 ? '#16a34a' : '#dc2626', bold: true },
                  ].map(({ label, value, color, bold }) => (
                    <tr key={label} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '10px 0', color: '#6b7280', width: '45%' }}>{label}</td>
                      <td style={{ padding: '10px 0', color: color || '#0f172a', fontWeight: bold ? 700 : 500 }}>{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  onClick={() => setShowDistribusiModal(false)}
                  style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid #d1d5db', background: '#f3f4f6', fontSize: 13, cursor: 'pointer' }}
                >
                  Batal
                </button>
                <button
                  onClick={handleDistribusi}
                  disabled={distributing}
                  style={{ padding: '10px 24px', borderRadius: 10, background: '#7c3aed', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: distributing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <Send size={14} />
                  {distributing ? 'Menyimpan...' : 'Ya, Distribusikan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Entry Modal */}
      {showManualModal && (
        <div className="shu-modal-overlay" onClick={() => setShowManualModal(false)}>
          <div className="shu-modal-content" onClick={e => e.stopPropagation()}>
            <div className="shu-modal-header">
              <div className="shu-modal-title">SHU MANAGEMENT &gt; OUTCOME INCOME TRANSACTION &gt; Add Manually</div>
              <button className="shu-modal-close" onClick={() => setShowManualModal(false)}><X size={20} /></button>
            </div>
            <div className="shu-form-container">
              <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 24, borderBottom: '1px solid #e5e7eb', paddingBottom: 16 }}>
                Laporan Periode Tahun Buku {year}
              </p>
              {formError && (
                <div style={{ color: '#dc2626', marginBottom: 16, fontSize: 13 }}>{formError}</div>
              )}
              <form onSubmit={handleSubmit}>
                {[
                  { label: 'Transaction Date', name: 'transaction_date', type: 'date' },
                ].map(({ label, name, type }) => (
                  <div key={name} className="shu-form-grid">
                    <label style={{ fontWeight: 700, color: '#374151', fontSize: 14 }}>{label}</label>
                    <input type={type} name={name} className="shu-form-input" value={form[name]} onChange={handleFormChange} required />
                  </div>
                ))}

                <div className="shu-form-grid">
                  <label style={{ fontWeight: 700, color: '#374151', fontSize: 14 }}>Jenis Transaksi</label>
                  <select name="category" className="shu-form-input" value={form.category} onChange={handleFormChange} required>
                    <option value="">-- Pilih Kategori --</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.category_name}</option>)}
                  </select>
                </div>

                {[
                  { label: 'Invoice Number', name: 'invoice_number', type: 'text', placeholder: 'e.g. INV-31122025001' },
                  { label: 'Supplier/Customer', name: 'supplier_customer', type: 'text' },
                  { label: 'Quantity', name: 'quantity', type: 'number' },
                  { label: 'Amount Payment', name: 'amount', type: 'number' },
                ].map(({ label, name, type, placeholder }) => (
                  <div key={name} className="shu-form-grid">
                    <label style={{ fontWeight: 700, color: '#374151', fontSize: 14 }}>{label}</label>
                    <input type={type} name={name} className="shu-form-input" value={form[name]} onChange={handleFormChange} required placeholder={placeholder} min={type === 'number' ? 0 : undefined} step={type === 'number' ? '0.01' : undefined} />
                  </div>
                ))}

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 32 }}>
                  <button type="submit" disabled={submitting}
                    style={{ padding: '10px 48px', borderRadius: 10, background: '#3b82f6', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer' }}>
                    {submitting ? 'Menyimpan...' : 'Submit'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Upload Excel Modal */}
      {showUploadModal && (
        <div className="shu-modal-overlay" onClick={() => setShowUploadModal(false)}>
          <div className="shu-modal-content" onClick={e => e.stopPropagation()}>
            <div className="shu-modal-header" style={{ paddingBottom: 0, borderBottom: 'none' }}>
              <div className="shu-modal-title">SHU MANAGEMENT &gt; OUTCOME INCOME TRANSACTION &gt; Upload Excel</div>
              <button className="shu-modal-close" onClick={() => setShowUploadModal(false)}><X size={20} /></button>
            </div>
            <div className="shu-form-container">
              <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 24, borderBottom: '1px solid #e5e7eb', paddingBottom: 16, marginTop: 0 }}>
                Report for the {year} Financial Year
              </p>
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 24 }}>

                {/* Download template */}
                <button
                  onClick={handleDownloadTemplate}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#3b82f6', fontWeight: 600, fontSize: 13, cursor: 'pointer', background: 'none', border: 'none', padding: 0, marginBottom: 16 }}
                >
                  <Download size={14} />
                  <span style={{ textDecoration: 'underline' }}>Download Excel Template</span>
                </button>

                {/* Instruction */}
                <div className="shu-upload-instruction">
                  <AlertCircle size={18} color="#3b82f6" style={{ flexShrink: 0 }} />
                  <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6 }}>
                    <strong style={{ display: 'block', color: '#374151', marginBottom: 4 }}>Instructions</strong>
                    Kolom yang diperlukan: <strong>transaction_date</strong> (YYYY-MM-DD), <strong>category_id</strong>, invoice_number, supplier_customer, quantity, amount.
                    Lihat sheet <em>Daftar Kategori</em> di template untuk daftar category_id yang tersedia.
                  </div>
                </div>

                {/* Drop zone */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  style={{ display: 'none' }}
                  onChange={e => handleFileSelect(e.target.files[0])}
                />
                <div
                  className="shu-drop-zone"
                  style={{ border: `2px dashed ${dragOver ? '#3b82f6' : '#d1d5db'}`, background: dragOver ? '#eff6ff' : '#fafafa', transition: 'all 0.2s', cursor: 'pointer' }}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="shu-drop-icon"><UploadCloud size={32} color={dragOver ? '#3b82f6' : '#9ca3af'} /></div>
                  {uploadFile ? (
                    <>
                      <h3 style={{ fontSize: 15, color: '#16a34a', marginBottom: 4, fontWeight: 700 }}>{uploadFile.name}</h3>
                      <p style={{ color: '#6b7280', fontSize: 12, margin: 0 }}>
                        {(uploadFile.size / 1024).toFixed(1)} KB — klik untuk ganti file
                      </p>
                    </>
                  ) : (
                    <>
                      <h3 style={{ fontSize: 15, color: '#374151', marginBottom: 8 }}>Drag & drop file Excel di sini</h3>
                      <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 20 }}>
                        atau <span style={{ color: '#3b82f6', fontWeight: 600 }}>browse file</span> dari komputer
                      </p>
                    </>
                  )}
                  <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', marginBottom: 10 }}>Supported Format</div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                    <span style={{ background: '#d1fae5', color: '#065f46', padding: '4px 12px', borderRadius: 12, fontSize: 10, fontWeight: 700 }}>XLSX</span>
                    <span style={{ background: '#d1fae5', color: '#065f46', padding: '4px 12px', borderRadius: 12, fontSize: 10, fontWeight: 700 }}>XLS</span>
                  </div>
                </div>

                {/* Error */}
                {uploadError && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginTop: 12 }}>
                    <AlertCircle size={15} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
                    <span style={{ fontSize: 13, color: '#dc2626' }}>{uploadError}</span>
                  </div>
                )}

                {/* Upload result */}
                {uploadResult && (
                  <div style={{ marginTop: 12 }}>
                    {uploadResult.inserted > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', marginBottom: 8 }}>
                        <CheckCircle2 size={15} color="#16a34a" />
                        <span style={{ fontSize: 13, color: '#15803d', fontWeight: 600 }}>
                          {uploadResult.inserted} transaksi berhasil diimpor.
                        </span>
                      </div>
                    )}
                    {uploadResult.errors?.length > 0 && (
                      <div style={{ background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px' }}>
                        <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: '#92400e' }}>
                          {uploadResult.errors.length} baris dilewati:
                        </p>
                        <ul style={{ margin: 0, paddingLeft: 16 }}>
                          {uploadResult.errors.map((err, i) => (
                            <li key={i} style={{ fontSize: 12, color: '#78350f', marginBottom: 2 }}>{err}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                <div className="shu-upload-footer">
                  <button
                    onClick={() => setShowUploadModal(false)}
                    style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid #d1d5db', background: '#f3f4f6', fontSize: 13, cursor: 'pointer' }}
                  >
                    {uploadResult?.inserted > 0 ? 'Tutup' : 'Cancel'}
                  </button>
                  <button
                    onClick={handleUploadSubmit}
                    disabled={uploading || !uploadFile}
                    style={{ padding: '10px 24px', borderRadius: 10, background: uploading || !uploadFile ? '#93c5fd' : '#3b82f6', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: uploading || !uploadFile ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <UploadCloud size={14} /> {uploading ? 'Mengupload...' : 'Upload Data'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SHUOutcomeTransaction;
