import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, PiggyBank, TrendingUp } from 'lucide-react';
import { shuApi } from '../../api/shuApi';
import './SHUManagement.css';

const formatCurrency = (val) =>
  new Intl.NumberFormat('id-ID').format(val ?? 0);

const CURRENT_YEAR  = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;
const YEARS  = Array.from({ length: 5 }, (_, i) => String(CURRENT_YEAR - i));
const MONTHS = [
  { value: 1,  label: 'Januari' },
  { value: 2,  label: 'Februari' },
  { value: 3,  label: 'Maret' },
  { value: 4,  label: 'April' },
  { value: 5,  label: 'Mei' },
  { value: 6,  label: 'Juni' },
  { value: 7,  label: 'Juli' },
  { value: 8,  label: 'Agustus' },
  { value: 9,  label: 'September' },
  { value: 10, label: 'Oktober' },
  { value: 11, label: 'November' },
  { value: 12, label: 'Desember' },
];

const SHUIncomeTransaction = () => {
  const navigate = useNavigate();

  const [search, setSearch]   = useState('');
  const [summary, setSummary] = useState('month');
  const [month, setMonth]     = useState(CURRENT_MONTH);
  const [year, setYear]       = useState(String(CURRENT_YEAR));

  const [members, setMembers]         = useState([]);
  const [jasaModalPool, setJasaModalPool] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  // Annual distribution state
  const [distributions, setDistributions]         = useState([]);
  const [distributionLoading, setDistributionLoading] = useState(false);
  const [distributing, setDistributing]           = useState(false);
  const [uploadingId, setUploadingId]             = useState(null);
  const [distributeError, setDistributeError]     = useState('');
  const [proofError, setProofError]               = useState('');

  // Monthly distribution state
  const [distributingMonthly, setDistributingMonthly] = useState(false);
  const [monthlyDistributeMsg, setMonthlyDistributeMsg] = useState('');
  const [monthlyDistributeError, setMonthlyDistributeError] = useState('');

  const fetchDistributions = useCallback((y) => {
    setDistributionLoading(true);
    shuApi.getAnnualJasaModalDistributions({ year: y })
      .then(data => setDistributions(data.results ?? []))
      .catch(() => setDistributions([]))
      .finally(() => setDistributionLoading(false));
  }, []);

  const fetchData = useCallback((s, summaryMode, m, y) => {
    setLoading(true);
    setError('');
    shuApi.getShuMemberBases({ search: s, summary: summaryMode, month: m, year: y })
      .then(data => {
        setMembers(data.results ?? []);
        setJasaModalPool(data.jasa_modal_pool ?? null);
        setCurrentPage(1);
      })
      .catch(() => setError('Gagal memuat data anggota.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData('', 'month', CURRENT_MONTH, String(CURRENT_YEAR));
  }, []); // eslint-disable-line

  // Fetch distributions whenever switching to year mode or year changes
  useEffect(() => {
    if (summary === 'year') {
      fetchDistributions(year);
    } else {
      setDistributions([]);
      setDistributeError('');
      setProofError('');
    }
  }, [summary, year]); // eslint-disable-line

  const handleApply = () => {
    setCurrentPage(1);
    fetchData(search, summary, month, year);
    if (summary === 'year') fetchDistributions(year);
  };

  const handleClear = () => {
    setSearch('');
    setSummary('month');
    setMonth(CURRENT_MONTH);
    setYear(String(CURRENT_YEAR));
    setCurrentPage(1);
    setDistributions([]);
    setDistributeError('');
    setProofError('');
    fetchData('', 'month', CURRENT_MONTH, String(CURRENT_YEAR));
  };

  const handleDistributeMonthly = async () => {
    const monthLabel = MONTHS.find(m => m.value === Number(month))?.label ?? month;
    const confirmed = await window.appConfirm({
      title: 'Distribusikan SHU bulanan?',
      message: `Distribusikan SHU Jasa Modal bulan ${monthLabel} ${year} ke semua anggota?\n\nData yang sudah ada akan diperbarui jumlahnya.`,
      confirmText: 'Distribusikan',
      cancelText: 'Batal',
    });
    if (!confirmed) return;
    setDistributingMonthly(true);
    setMonthlyDistributeMsg('');
    setMonthlyDistributeError('');
    try {
      const result = await shuApi.distributeMonthlyJasaModal({ year: parseInt(year), month: Number(month) });
      setMonthlyDistributeMsg(result.message || `Berhasil: ${result.total_members} anggota didistribusikan.`);
    } catch (err) {
      setMonthlyDistributeError(err?.error || 'Gagal mendistribusikan SHU. Pastikan SHU Result untuk periode ini sudah dibuat.');
    } finally {
      setDistributingMonthly(false);
    }
  };

  const handleDistribute = async () => {
    const confirmed = await window.appConfirm({
      title: 'Distribusikan SHU tahunan?',
      message: `Distribusikan SHU Jasa Modal tahun ${year} ke semua anggota?\n\nData distribusi yang sudah ada akan diupdate jumlahnya (status PAID tidak akan berubah).`,
      confirmText: 'Distribusikan',
      cancelText: 'Batal',
    });
    if (!confirmed) return;
    setDistributing(true);
    setDistributeError('');
    try {
      await shuApi.distributeAnnualJasaModal({ year: parseInt(year) });
      await fetchDistributions(year);
    } catch (err) {
      setDistributeError(err?.error || 'Gagal mendistribusikan SHU. Pastikan SHU Result tahunan sudah dibuat.');
    } finally {
      setDistributing(false);
    }
  };

  const handleUploadProof = async (distId, file) => {
    setUploadingId(distId);
    setProofError('');
    try {
      const updated = await shuApi.uploadJasaModalProof(distId, file);
      setDistributions(prev => prev.map(d => d.id === distId ? updated : d));
    } catch {
      setProofError('Gagal upload bukti transfer. Coba lagi.');
    } finally {
      setUploadingId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(members.length / rowsPerPage));
  const paginated  = members.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);
  const rangeStart = members.length === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1;
  const rangeEnd   = Math.min(currentPage * rowsPerPage, members.length);

  const totalSavings    = members.reduce((sum, r) => sum + (r.total_saving_amount ?? 0), 0);
  const totalMandatory  = members.reduce((sum, r) => sum + (r.mandatory_saving_monthly ?? 0), 0);
  const totalVoluntary  = members.reduce((sum, r) => sum + (r.voluntary_saving_monthly ?? 0), 0);

  const selectedMonthLabel = MONTHS.find(m => m.value === Number(month))?.label ?? '';

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
      <button className="shu-btn-back" onClick={() => navigate('/dashboard/admin/shu-dashboard')}>
        <ArrowLeft size={16} /> Back to Dashboard
      </button>

      <h1 className="shu-page-title" style={{ fontSize: '20px', marginBottom: 0 }}>
        SHU MANAGEMENT &gt; REKAP SHU JASA MODAL ANGGOTA
      </h1>
      <p className="shu-page-subtitle" style={{ borderBottom: '1px solid #e5e7eb', paddingBottom: '20px' }}>
        Periode: {summary === 'year' ? `Tahun ${year}` : `${selectedMonthLabel} ${year}`}
      </p>

      {/* KPI Cards */}
      <div className="shu-card-grid shu-section-block">
        <div className="shu-stat-card" style={{ borderTop: '4px solid #3b82f6' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Users size={16} color="#3b82f6" />
            <p className="shu-stat-title">Total Anggota</p>
          </div>
          <h3 className="shu-stat-value" style={{ color: '#0f172a' }}>
            {members.length} anggota
          </h3>
        </div>

        <div className="shu-stat-card" style={{ borderTop: '4px solid #16a34a' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <PiggyBank size={16} color="#16a34a" />
            <p className="shu-stat-title">
              {summary === 'year' ? `Total Simpanan Tahun ${year}` : 'Total Simpanan Bulan Ini'}
            </p>
          </div>
          <h3 className="shu-stat-value" style={{ color: '#16a34a' }}>
            Rp {formatCurrency(totalSavings)}
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: 11, color: '#6b7280' }}>
            Wajib: Rp {formatCurrency(totalMandatory)} &nbsp;|&nbsp; Sukarela: Rp {formatCurrency(totalVoluntary)}
          </p>
        </div>

        <div className="shu-stat-card" style={{ borderTop: '4px solid #7c3aed' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <TrendingUp size={16} color="#7c3aed" />
            <p className="shu-stat-title">Pool Jasa Modal {year}</p>
          </div>
          <h3 className="shu-stat-value" style={{ color: jasaModalPool !== null ? '#7c3aed' : '#9ca3af' }}>
            {jasaModalPool !== null ? `Rp ${formatCurrency(jasaModalPool)}` : '— (belum ada periode SHU)'}
          </h3>
          {jasaModalPool !== null && (
            <p style={{ margin: '4px 0 0', fontSize: 11, color: '#6b7280' }}>
              Total SHU Jasa Modal: Rp {formatCurrency(members.reduce((s, r) => s + (r.shu_jasa_modal ?? 0), 0))}
            </p>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div className="shu-toolbar shu-section-block">
        <input
          className="shu-search-input"
          style={{ flex: 1, minWidth: 200 }}
          placeholder="Cari nama anggota atau NIK..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleApply()}
        />
        <div className="shu-pill-group">
          {['month', 'year'].map(mode => (
            <button
              key={mode}
              type="button"
              onClick={() => setSummary(mode)}
              className={`shu-pill-button ${summary === mode ? 'active' : ''}`}
            >
              {mode === 'month' ? 'Per Bulan' : 'Tahunan'}
            </button>
          ))}
        </div>
        {summary === 'month' && (
          <select style={filterSelect} value={month} onChange={e => setMonth(Number(e.target.value))}>
            {MONTHS.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        )}
        <select style={filterSelect} value={year} onChange={e => setYear(e.target.value)}>
          {YEARS.map(y => <option key={y}>{y}</option>)}
        </select>
        <button className="shu-pill-button" onClick={handleClear}>
          Reset
        </button>
        <button
          className="shu-pill-button active"
          onClick={handleApply}
        >
          Tampilkan
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
              {[
                'No.', 'Nama Anggota', 'NIK', 'Department',
                summary === 'year' ? 'Simpanan Wajib (Tahunan)' : 'Simpanan Wajib',
                summary === 'year' ? 'Simpanan Sukarela (Tahunan)' : 'Simpanan Sukarela',
                summary === 'year' ? 'Total Simpanan (Tahunan)' : 'Total Simpanan',
                'SHU Jasa Modal',
              ].map(h => (
                <th key={h} style={{ padding: 12, textAlign: 'left', color: '#fff', fontWeight: 600, fontSize: 13, letterSpacing: '0.3px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Memuat...</td></tr>
            ) : paginated.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                {summary === 'year'
                  ? `Tidak ada data simpanan untuk tahun ${year}.`
                  : `Tidak ada data simpanan untuk periode ${selectedMonthLabel} ${year}.`}
              </td></tr>
            ) : (
              paginated.map((row, idx) => (
                <tr key={row.member_id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: 12, fontSize: 13, color: '#374151' }}>{(currentPage - 1) * rowsPerPage + idx + 1}</td>
                  <td style={{ padding: 12, fontSize: 13, color: '#0f172a', fontWeight: 500 }}>{row.full_name}</td>
                  <td style={{ padding: 12, fontSize: 13, color: '#374151' }}>{row.nik_employee}</td>
                  <td style={{ padding: 12, fontSize: 13, color: '#374151' }}>{row.department_name}</td>
                  <td style={{ padding: 12, fontSize: 13, color: '#374151' }}>Rp {formatCurrency(row.mandatory_saving_monthly)}</td>
                  <td style={{ padding: 12, fontSize: 13, color: '#374151' }}>Rp {formatCurrency(row.voluntary_saving_monthly)}</td>
                  <td style={{ padding: 12, fontSize: 13, color: '#374151', fontWeight: 600 }}>Rp {formatCurrency(row.total_saving_amount)}</td>
                  <td style={{ padding: 12, fontSize: 13, color: row.shu_jasa_modal !== null ? '#7c3aed' : '#9ca3af', fontWeight: row.shu_jasa_modal !== null ? 600 : 400, fontStyle: row.shu_jasa_modal !== null ? 'normal' : 'italic' }}>
                    {row.shu_jasa_modal !== null ? `Rp ${formatCurrency(row.shu_jasa_modal)}` : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {!loading && members.length > 0 && (
          <div className="shu-table-footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, flexWrap: 'wrap', gap: 10 }}>
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
              <span>{rangeStart}–{rangeEnd} dari {members.length}</span>
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

      {/* Monthly SHU Jasa Modal Distribution Section */}
      {summary === 'month' && (
        <div style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: 16,
          padding: '20px 24px',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
        }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#374151', margin: '0 0 4px' }}>
              Distribusi SHU Jasa Modal — {MONTHS.find(m => m.value === Number(month))?.label} {year}
            </h2>
            <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>
              Simpan perhitungan SHU Jasa Modal bulan ini ke tabel distribusi per anggota.
            </p>
            {monthlyDistributeMsg && (
              <p style={{ margin: '8px 0 0', fontSize: 13, color: '#16a34a', fontWeight: 600 }}>
                ✓ {monthlyDistributeMsg}
              </p>
            )}
            {monthlyDistributeError && (
              <p style={{ margin: '8px 0 0', fontSize: 13, color: '#dc2626' }}>
                ⚠ {monthlyDistributeError}
              </p>
            )}
          </div>
          <button
            onClick={handleDistributeMonthly}
            disabled={distributingMonthly || jasaModalPool === null || members.length === 0}
            title={jasaModalPool === null ? 'SHU Result untuk periode ini belum tersedia' : ''}
            style={{
              padding: '10px 20px',
              borderRadius: 10,
              background: distributingMonthly || jasaModalPool === null || members.length === 0
                ? '#e5e7eb'
                : 'linear-gradient(135deg, #3b82f6, #2563eb)',
              color: distributingMonthly || jasaModalPool === null || members.length === 0
                ? '#9ca3af'
                : '#fff',
              border: 'none',
              fontSize: 13,
              fontWeight: 600,
              cursor: distributingMonthly || jasaModalPool === null || members.length === 0
                ? 'not-allowed'
                : 'pointer',
              whiteSpace: 'nowrap',
              boxShadow: jasaModalPool !== null && members.length > 0
                ? '0 4px 12px rgba(37,99,235,0.25)'
                : 'none',
            }}
          >
            {distributingMonthly
              ? 'Memproses...'
              : `Distribusikan SHU Bulan ${MONTHS.find(m => m.value === Number(month))?.label} ${year}`}
          </button>
        </div>
      )}

      {/* Annual SHU Jasa Modal Distribution Section */}
      {summary === 'year' && (
        <div style={{ marginTop: 40 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#374151', margin: 0 }}>
                Distribusi SHU Jasa Modal Tahunan {year}
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>
                Bukti transfer ke rekening anggota diunggah di sini setelah pembayaran dilakukan.
              </p>
            </div>
            <button
              onClick={handleDistribute}
              disabled={distributing || jasaModalPool === null}
              title={jasaModalPool === null ? 'SHU Result tahunan belum tersedia' : ''}
              style={{
                padding: '10px 18px',
                borderRadius: 10,
                background: distributing || jasaModalPool === null ? '#e5e7eb' : '#7c3aed',
                color: distributing || jasaModalPool === null ? '#9ca3af' : '#fff',
                border: 'none',
                fontSize: 13,
                fontWeight: 600,
                cursor: distributing || jasaModalPool === null ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {distributing ? 'Memproses...' : `Distribusikan SHU Jasa Modal ${year}`}
            </button>
          </div>

          {distributeError && (
            <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{distributeError}</p>
          )}

          {distributionLoading ? (
            <p style={{ color: '#9ca3af', fontSize: 13 }}>Memuat data distribusi...</p>
          ) : distributions.length === 0 ? (
            <div style={{ background: '#f9fafb', borderRadius: 12, padding: '28px 20px', textAlign: 'center', border: '1px dashed #d1d5db' }}>
              <p style={{ color: '#9ca3af', fontSize: 13, margin: 0 }}>
                {jasaModalPool === null
                  ? `SHU Result tahunan ${year} belum tersedia. Buat SHU Result terlebih dahulu agar bisa mendistribusikan.`
                  : `Belum ada distribusi untuk tahun ${year}. Klik tombol "Distribusikan SHU Jasa Modal ${year}" untuk memulai.`}
              </p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', background: '#f9fafb', borderRadius: 12, overflow: 'hidden', minWidth: 1000 }}>
                <thead style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)' }}>
                  <tr>
                    {['No.', 'Nama Anggota', 'NIK', 'Bank', 'No. Rekening', 'Total Simpanan', 'SHU Jasa Modal', 'Status', 'Aksi'].map(h => (
                      <th key={h} style={{ padding: '12px 14px', textAlign: 'left', color: '#fff', fontWeight: 600, fontSize: 13, letterSpacing: '0.3px', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {distributions.map((dist, idx) => (
                    <tr key={dist.id} style={{ borderBottom: '1px solid #e5e7eb', background: idx % 2 === 0 ? '#fff' : '#f9fafb' }}>
                      <td style={{ padding: '12px 14px', fontSize: 13, color: '#374151' }}>{idx + 1}</td>
                      <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{dist.member_name}</td>
                      <td style={{ padding: '12px 14px', fontSize: 13, color: '#374151' }}>{dist.member_nik}</td>
                      <td style={{ padding: '12px 14px', fontSize: 13, color: '#374151' }}>
                        {dist.bank_info
                          ? dist.bank_info.bank_name
                          : <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>—</span>}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 13, color: '#374151' }}>
                        {dist.bank_info ? (
                          <div>
                            <div style={{ fontWeight: 600 }}>{dist.bank_info.account_number}</div>
                            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{dist.bank_info.account_holder_name}</div>
                          </div>
                        ) : <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>—</span>}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 13, color: '#374151' }}>Rp {formatCurrency(dist.total_savings)}</td>
                      <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600, color: '#7c3aed' }}>Rp {formatCurrency(dist.total_shu)}</td>
                      <td style={{ padding: '12px 14px', fontSize: 13 }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '4px 10px',
                          borderRadius: 20,
                          fontSize: 12,
                          fontWeight: 700,
                          background: dist.status_display === 'PAID' ? '#dcfce7' : '#fef3c7',
                          color: dist.status_display === 'PAID' ? '#16a34a' : '#d97706',
                        }}>
                          {dist.status_display}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        {(dist.transfer_proof_url || dist.transfer_proof) ? (
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <a
                              href={dist.transfer_proof_url || dist.transfer_proof}
                              target="_blank"
                              rel="noreferrer"
                              style={{ fontSize: 12, color: '#3b82f6', textDecoration: 'underline', whiteSpace: 'nowrap' }}
                            >
                              {dist.transfer_proof_name || 'Lihat Bukti'}
                            </a>
                            <label style={{ cursor: uploadingId === dist.id ? 'not-allowed' : 'pointer' }}>
                              <span style={{ fontSize: 12, color: '#6b7280', textDecoration: 'underline', whiteSpace: 'nowrap' }}>
                                {uploadingId === dist.id ? 'Uploading...' : 'Ganti'}
                              </span>
                              <input
                                type="file"
                                accept="image/*,application/pdf"
                                style={{ display: 'none' }}
                                disabled={uploadingId === dist.id}
                                onChange={e => { if (e.target.files[0]) handleUploadProof(dist.id, e.target.files[0]); e.target.value = ''; }}
                              />
                            </label>
                          </div>
                        ) : (
                          <label style={{ cursor: uploadingId === dist.id ? 'not-allowed' : 'pointer' }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '6px 12px',
                              borderRadius: 8,
                              background: uploadingId === dist.id ? '#f3f4f6' : '#f0fdf4',
                              border: `1px solid ${uploadingId === dist.id ? '#d1d5db' : '#16a34a'}`,
                              color: uploadingId === dist.id ? '#9ca3af' : '#16a34a',
                              fontSize: 12,
                              fontWeight: 600,
                              whiteSpace: 'nowrap',
                            }}>
                              {uploadingId === dist.id ? 'Uploading...' : 'Upload Bukti TF'}
                            </span>
                            <input
                              type="file"
                              accept="image/*,application/pdf"
                              style={{ display: 'none' }}
                              disabled={uploadingId === dist.id}
                              onChange={e => { if (e.target.files[0]) handleUploadProof(dist.id, e.target.files[0]); e.target.value = ''; }}
                            />
                          </label>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {proofError && (
            <p style={{ color: '#dc2626', fontSize: 13, marginTop: 10 }}>{proofError}</p>
          )}
        </div>
      )}
    </div>
  );
};

export default SHUIncomeTransaction;
