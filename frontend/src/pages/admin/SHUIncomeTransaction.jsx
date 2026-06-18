import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, PiggyBank, TrendingUp, Pencil, Trash2, X, Check, Upload, FileText } from 'lucide-react';
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

  const [members, setMembers]             = useState([]);
  const [jasaModalPool, setJasaModalPool] = useState(null);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState('');

  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  // Monthly distributions
  const [monthlyDists, setMonthlyDists]               = useState([]);
  const [monthlyDistsLoading, setMonthlyDistsLoading] = useState(false);

  // Annual distribution state
  const [distributions, setDistributions]             = useState([]);
  const [distributionLoading, setDistributionLoading] = useState(false);
  const [distributing, setDistributing]               = useState(false);
  const [distributeError, setDistributeError]         = useState('');

  // Checkbox selection for annual distribute
  const [selectedIds, setSelectedIds]   = useState(new Set());
  const [statusFilter, setStatusFilter] = useState('all');

  // Action modal state (annual — upload proof + notes)
  const [actionModal, setActionModal] = useState(null);
  const [actionFile, setActionFile] = useState(null);
  const [actionNotes, setActionNotes] = useState('');
  const [actionSaving, setActionSaving] = useState(false);
  const [actionError, setActionError] = useState('');

  // Edit modal state (monthly)
  const [editModal, setEditModal]               = useState(null);
  const [editSimpWajib, setEditSimpWajib]       = useState('');
  const [editSimpSukarela, setEditSimpSukarela] = useState('');
  const [editSaving, setEditSaving]             = useState(false);
  const [editError, setEditError]               = useState('');

  const fetchMonthlyDists = useCallback((m, y) => {
    setMonthlyDistsLoading(true);
    shuApi.getMonthlyDistributions({ month: m, year: y })
      .then(data => setMonthlyDists(data.results ?? []))
      .catch(() => setMonthlyDists([]))
      .finally(() => setMonthlyDistsLoading(false));
  }, []);

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
    if (summaryMode === 'year') {
      shuApi.getAnnualFromMonthly({ search: s, year: y })
        .then(data => {
          const normalized = (data.results ?? []).map(r => ({
            ...r,
            mandatory_saving_monthly: r.simp_wajib,
            voluntary_saving_monthly: r.simp_sukarela,
            total_saving_amount: r.total_savings,
            shu_jasa_modal: r.total_shu,
          }));
          setMembers(normalized);
          setJasaModalPool(data.has_data ? (data.total_shu_pool ?? 0) : null);
          setCurrentPage(1);
        })
        .catch(() => setError('Gagal memuat data anggota.'))
        .finally(() => setLoading(false));
    } else {
      shuApi.getShuMemberBases({ search: s, summary: summaryMode, month: m, year: y })
        .then(data => {
          setMembers(data.results ?? []);
          setJasaModalPool(data.jasa_modal_pool ?? null);
          setCurrentPage(1);
        })
        .catch(() => setError('Gagal memuat data anggota.'))
        .finally(() => setLoading(false));
    }
  }, []);

  useEffect(() => {
    fetchData('', 'month', CURRENT_MONTH, String(CURRENT_YEAR));
    fetchMonthlyDists(CURRENT_MONTH, String(CURRENT_YEAR));
  }, []); // eslint-disable-line

  useEffect(() => {
    setSelectedIds(new Set());
    if (summary === 'year') {
      fetchData(search, 'year', month, year);
      fetchDistributions(year);
      setMonthlyDists([]);
    } else {
      fetchData(search, 'month', month, year);
      fetchMonthlyDists(month, year);
      setDistributions([]);
      setDistributeError('');
    }
  }, [summary, year]); // eslint-disable-line

  const handleApply = () => {
    setCurrentPage(1);
    fetchData(search, summary, month, year);
    if (summary === 'year') {
      fetchDistributions(year);
    } else {
      fetchMonthlyDists(month, year);
    }
  };

  const handleClear = () => {
    setSearch('');
    setSummary('month');
    setMonth(CURRENT_MONTH);
    setYear(String(CURRENT_YEAR));
    setCurrentPage(1);
    setSelectedIds(new Set());
    setStatusFilter('all');
    setDistributions([]);
    setDistributeError('');
    fetchData('', 'month', CURRENT_MONTH, String(CURRENT_YEAR));
    fetchMonthlyDists(CURRENT_MONTH, String(CURRENT_YEAR));
  };

  // Annual dist map: member_id → distribution record
  const annualDistMap = summary === 'year'
    ? Object.fromEntries(distributions.map(d => [d.member_id, d]))
    : {};

  // Selection helpers (only undistributed members can be selected)
  const undistributedMembers = members.filter(m => !annualDistMap[m.member_id]);
  const allUndistributedSelected =
    undistributedMembers.length > 0 &&
    undistributedMembers.every(m => selectedIds.has(m.member_id));

  const handleToggleSelect = (memberId) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (allUndistributedSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(undistributedMembers.map(m => m.member_id)));
    }
  };

  const handleDistribute = async () => {
    const isSelective = selectedIds.size > 0;
    const confirmed = await window.appConfirm({
      title: isSelective ? `Distribusikan ${selectedIds.size} Anggota Terpilih?` : 'Distribusikan SHU tahunan?',
      message: isSelective
        ? `Distribusikan SHU Jasa Modal tahun ${year} ke ${selectedIds.size} anggota yang dipilih?`
        : `Distribusikan SHU Jasa Modal tahun ${year} ke semua anggota?\n\nData distribusi yang sudah ada akan diupdate jumlahnya (status PAID tidak akan berubah).`,
      confirmText: 'Distribusikan',
      cancelText: 'Batal',
    });
    if (!confirmed) return;
    setDistributing(true);
    setDistributeError('');
    try {
      await shuApi.distributeAnnualJasaModal({
        year: parseInt(year),
        ...(isSelective ? { member_ids: [...selectedIds] } : {}),
      });
      await fetchDistributions(year);
      setSelectedIds(new Set());
    } catch (err) {
      setDistributeError(err?.error || 'Gagal mendistribusikan SHU. Pastikan SHU Result tahunan sudah dibuat.');
    } finally {
      setDistributing(false);
    }
  };

  const handleOpenAction = (dist) => {
    setActionModal(dist);
    setActionFile(null);
    setActionNotes(dist.notes || '');
    setActionError('');
  };

  const handleSubmitAction = async () => {
    if (!actionModal) return;
    setActionSaving(true);
    setActionError('');
    try {
      let updatedDist = actionModal;
      if (actionFile) {
        updatedDist = await shuApi.uploadJasaModalProof(actionModal.id, actionFile);
      }
      const originalNotes = actionModal.notes || '';
      if (actionNotes !== originalNotes) {
        updatedDist = await shuApi.updateJasaModalNotes(updatedDist.id, actionNotes);
      }
      setDistributions(prev => prev.map(d => d.id === actionModal.id ? updatedDist : d));
      setActionModal(null);
    } catch (err) {
      setActionError(err?.error || 'Gagal menyimpan. Coba lagi.');
    } finally {
      setActionSaving(false);
    }
  };

  // Monthly edit / delete handlers
  const handleOpenEdit = (dist) => {
    setEditModal(dist);
    setEditSimpWajib(String(dist.simp_wajib ?? 0));
    setEditSimpSukarela(String(dist.simp_sukarela ?? 0));
    setEditError('');
  };

  const handleSaveEdit = async () => {
    if (!editModal) return;
    setEditSaving(true);
    setEditError('');
    try {
      const updated = await shuApi.updateMonthlyDistribution(editModal.id, {
        simp_wajib: parseFloat(editSimpWajib) || 0,
        simp_sukarela: parseFloat(editSimpSukarela) || 0,
      });
      setMonthlyDists(prev => prev.map(d => d.id === updated.id ? updated : d));
      setEditModal(null);
    } catch (err) {
      setEditError(err?.error || 'Gagal menyimpan perubahan.');
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (dist) => {
    const confirmed = await window.appConfirm({
      title: 'Hapus data distribusi?',
      message: `Hapus data SHU Jasa Modal untuk ${dist.member_name}? Tindakan ini tidak bisa dibatalkan.`,
      confirmText: 'Hapus',
      cancelText: 'Batal',
    });
    if (!confirmed) return;
    try {
      await shuApi.deleteMonthlyDistribution(dist.id);
      setMonthlyDists(prev => prev.filter(d => d.id !== dist.id));
    } catch {
      // silent
    }
  };

  const distMap = Object.fromEntries(monthlyDists.map(d => [d.member_id, d]));

  const filteredMembers = summary === 'year' && statusFilter !== 'all'
    ? members.filter(m => {
        const dist = annualDistMap[m.member_id];
        if (statusFilter === 'selesai') return dist && dist.status_shu;
        if (statusFilter === 'pending') return dist && !dist.status_shu;
        if (statusFilter === 'belum') return !dist;
        return true;
      })
    : members;

  const totalPages = Math.max(1, Math.ceil(filteredMembers.length / rowsPerPage));
  const paginated  = filteredMembers.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);
  const rangeStart = filteredMembers.length === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1;
  const rangeEnd   = Math.min(currentPage * rowsPerPage, filteredMembers.length);

  const totalSavings   = members.reduce((sum, r) => sum + (r.total_saving_amount ?? 0), 0);
  const totalMandatory = members.reduce((sum, r) => sum + (r.mandatory_saving_monthly ?? 0), 0);
  const totalVoluntary = members.reduce((sum, r) => sum + (r.voluntary_saving_monthly ?? 0), 0);

  const selectedMonthLabel = MONTHS.find(m => m.value === Number(month))?.label ?? '';

  const filterSelect = {
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid #e5e7eb',
    fontSize: 13,
    cursor: 'pointer',
    background: '#fff',
    color: '#374151',
  };

  // Annual table column count (for colSpan)
  const annualColCount = 12;
  const monthlyColCount = 9;

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
            <p className="shu-stat-title">
              {summary === 'year' ? `Total SHU Jasa Modal ${year}` : `Pool Jasa Modal ${year}`}
            </p>
          </div>
          <h3 className="shu-stat-value" style={{ color: jasaModalPool !== null ? '#7c3aed' : '#9ca3af' }}>
            {jasaModalPool !== null ? `Rp ${formatCurrency(jasaModalPool)}` : summary === 'year' ? '— (belum ada distribusi bulanan)' : '— (belum ada periode SHU)'}
          </h3>
          {jasaModalPool !== null && summary === 'month' && (
            <p style={{ margin: '4px 0 0', fontSize: 11, color: '#6b7280' }}>
              Total SHU Jasa Modal: Rp {formatCurrency(members.reduce((s, r) => s + (r.shu_jasa_modal ?? 0), 0))}
            </p>
          )}
          {jasaModalPool !== null && summary === 'year' && (
            <p style={{ margin: '4px 0 0', fontSize: 11, color: '#6b7280' }}>
              Akumulasi dari distribusi bulanan tahun {year}
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
        {summary === 'year' && (
          <select style={filterSelect} value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }}>
            <option value="all">Semua Status</option>
            <option value="selesai">Selesai</option>
            <option value="pending">Pending</option>
            <option value="belum">Belum</option>
          </select>
        )}
        <button className="shu-pill-button" onClick={handleClear}>
          Reset
        </button>
        <button className="shu-pill-button active" onClick={handleApply}>
          Tampilkan
        </button>
      </div>

      {/* Annual distribution header — lives OUTSIDE the data panel */}
      {summary === 'year' && (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#374151', margin: 0 }}>
              Distribusi SHU Jasa Modal Tahunan {year}
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6b7280' }}>
              Centang anggota yang ingin didistribusikan, lalu klik tombol distribusi. Upload bukti TF setelah pembayaran.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {distributionLoading && (
              <span style={{ fontSize: 12, color: '#9ca3af' }}>Memuat distribusi...</span>
            )}
            {selectedIds.size > 0 && (
              <span style={{ fontSize: 12, color: '#7c3aed', fontWeight: 600 }}>
                {selectedIds.size} dipilih
              </span>
            )}
            <button
              onClick={handleDistribute}
              disabled={distributing || jasaModalPool === null}
              title={jasaModalPool === null ? 'SHU Result tahunan belum tersedia' : ''}
              style={{
                padding: '9px 16px',
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
              {distributing
                ? 'Memproses...'
                : selectedIds.size > 0
                  ? `Distribusikan Terpilih (${selectedIds.size})`
                  : `Distribusikan Semua`}
            </button>
          </div>
        </div>
      )}
      {summary === 'year' && distributeError && (
        <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 8 }}>{distributeError}</p>
      )}

      {/* Table */}
      <div className="shu-data-panel shu-section-block">
        {error && (
          <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 8 }}>{error}</p>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            background: '#f9fafb',
            borderRadius: 12,
            overflow: 'hidden',
            minWidth: summary === 'year' ? 1350 : 900,
          }}>
            <thead style={{ background: summary === 'year' ? 'linear-gradient(135deg, #7c3aed, #6d28d9)' : 'linear-gradient(135deg, #3b82f6, #2563eb)' }}>
              <tr>
                {summary === 'year' ? (
                  <>
                    {/* Select-all checkbox */}
                    <th style={{ padding: '12px 10px', textAlign: 'center', color: '#fff', width: 44 }}>
                      <input
                        type="checkbox"
                        checked={allUndistributedSelected}
                        onChange={handleSelectAll}
                        disabled={undistributedMembers.length === 0}
                        style={{ cursor: undistributedMembers.length === 0 ? 'not-allowed' : 'pointer', width: 15, height: 15 }}
                        title="Pilih semua yang belum distribusi"
                      />
                    </th>
                    {['No.', 'Nama Anggota', 'NIK', 'Department', 'Bank', 'Simpanan Wajib', 'Simpanan Sukarela', 'Total Simpanan', 'SHU Jasa Modal', 'Status', 'Aksi'].map(h => (
                      <th key={h} style={{ padding: '12px 12px', textAlign: 'left', color: '#fff', fontWeight: 600, fontSize: 13, letterSpacing: '0.3px', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </>
                ) : (
                  ['No.', 'Nama Anggota', 'NIK', 'Department', 'Simpanan Wajib', 'Simpanan Sukarela', 'Total Simpanan', 'SHU Jasa Modal', 'Aksi'].map(h => (
                    <th key={h} style={{ padding: 12, textAlign: 'left', color: '#fff', fontWeight: 600, fontSize: 13, letterSpacing: '0.3px', whiteSpace: 'nowrap' }}>{h}</th>
                  ))
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={summary === 'year' ? annualColCount : monthlyColCount} style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Memuat...</td></tr>
              ) : paginated.length === 0 ? (
                <tr><td colSpan={summary === 'year' ? annualColCount : monthlyColCount} style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                  {summary === 'year'
                    ? `Tidak ada data simpanan untuk tahun ${year}.`
                    : `Tidak ada data simpanan untuk periode ${selectedMonthLabel} ${year}.`}
                </td></tr>
              ) : summary === 'year' ? (
                // ── ANNUAL TABLE ROWS ──
                paginated.map((row, idx) => {
                  const dist = annualDistMap[row.member_id];
                  const isDistributed = Boolean(dist);
                  const isStatusDone = isDistributed && dist.status_shu;
                  const isSelected = selectedIds.has(row.member_id);
                  const bankInfo = row.bank_info || (isDistributed && dist.bank_info) || null;

                  return (
                    <tr key={row.member_id} style={{
                      borderBottom: '1px solid #e5e7eb',
                      background: isStatusDone ? '#f0fdf4' : isDistributed ? '#fefce8' : isSelected ? '#f5f3ff' : (idx % 2 === 0 ? '#fff' : '#f9fafb'),
                    }}>
                      {/* Checkbox cell */}
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        {isDistributed ? (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 22, height: 22, borderRadius: '50%',
                            background: isStatusDone ? '#dcfce7' : '#fef9c3',
                            color: isStatusDone ? '#16a34a' : '#ca8a04',
                          }}>
                            <Check size={13} />
                          </span>
                        ) : (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelect(row.member_id)}
                            style={{ cursor: 'pointer', width: 15, height: 15 }}
                          />
                        )}
                      </td>

                      <td style={{ padding: '12px 12px', fontSize: 13, color: '#374151' }}>{(currentPage - 1) * rowsPerPage + idx + 1}</td>

                      <td style={{ padding: '12px 12px', fontSize: 13, color: '#0f172a', fontWeight: 500 }}>{row.full_name}</td>

                      <td style={{ padding: '12px 12px', fontSize: 13, color: '#374151' }}>{row.nik_employee}</td>

                      <td style={{ padding: '12px 12px', fontSize: 13, color: '#374151' }}>{row.department_name}</td>

                      {/* Bank */}
                      <td style={{ padding: '12px 12px', fontSize: 12, color: '#374151' }}>
                        {bankInfo ? (
                          <div>
                            <div style={{ fontWeight: 500 }}>{bankInfo.bank_name}</div>
                            <div style={{ color: '#6b7280', marginTop: 1 }}>{bankInfo.account_number}</div>
                            {bankInfo.account_holder_name && bankInfo.account_holder_name !== row.full_name && (
                              <div style={{ color: '#9ca3af', marginTop: 1 }}>{bankInfo.account_holder_name}</div>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: '#d1d5db' }}>—</span>
                        )}
                      </td>

                      <td style={{ padding: '12px 12px', fontSize: 13, color: '#374151' }}>
                        Rp {formatCurrency(row.mandatory_saving_monthly)}
                      </td>

                      <td style={{ padding: '12px 12px', fontSize: 13, color: '#374151' }}>
                        Rp {formatCurrency(row.voluntary_saving_monthly)}
                      </td>

                      <td style={{ padding: '12px 12px', fontSize: 13, color: '#374151', fontWeight: 600 }}>
                        Rp {formatCurrency(row.total_saving_amount)}
                      </td>

                      <td style={{ padding: '12px 12px', fontSize: 13, fontWeight: 600, color: '#7c3aed' }}>
                        Rp {formatCurrency(dist ? dist.total_shu : row.shu_jasa_modal)}
                      </td>

                      {/* Status */}
                      <td style={{ padding: '12px 12px', fontSize: 13 }}>
                        {isStatusDone ? (
                          <span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: '#dcfce7', color: '#16a34a' }}>
                            Selesai
                          </span>
                        ) : isDistributed ? (
                          <span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: '#fef9c3', color: '#ca8a04' }}>
                            Pending
                          </span>
                        ) : (
                          <span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: '#f3f4f6', color: '#6b7280' }}>
                            Belum
                          </span>
                        )}
                      </td>

                      {/* Aksi */}
                      <td style={{ padding: '10px 12px', fontSize: 13 }}>
                        {isDistributed ? (
                          <div>
                            <button
                              onClick={() => handleOpenAction(dist)}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                padding: '6px 12px', borderRadius: 8,
                                border: '1px solid #d1d5db', background: '#fff',
                                cursor: 'pointer', fontSize: 12, fontWeight: 500, color: '#374151',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {(dist.transfer_proof_url || dist.transfer_proof) ? (
                                <>
                                  <FileText size={13} color="#16a34a" />
                                  <span style={{ color: '#16a34a' }}>Lihat</span>
                                </>
                              ) : (
                                <>
                                  <Upload size={13} />
                                  <span>Upload</span>
                                </>
                              )}
                            </button>
                            {dist.tf_reference_id && (
                              <div style={{ marginTop: 4, fontSize: 10, color: '#6b7280', fontFamily: 'monospace' }}>
                                {dist.tf_reference_id}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: '#d1d5db', fontSize: 12 }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                // ── MONTHLY TABLE ROWS ──
                paginated.map((row, idx) => {
                  const savedDist = distMap[row.member_id];
                  const displayShu = savedDist ? savedDist.total_shu : row.shu_jasa_modal;
                  const isSaved = Boolean(savedDist);

                  return (
                    <tr key={row.member_id} style={{
                      borderBottom: '1px solid #e5e7eb',
                      background: isSaved ? '#f0fdf4' : (idx % 2 === 0 ? '#fff' : '#f9fafb'),
                    }}>
                      <td style={{ padding: 12, fontSize: 13, color: '#374151' }}>{(currentPage - 1) * rowsPerPage + idx + 1}</td>
                      <td style={{ padding: 12, fontSize: 13, color: '#0f172a', fontWeight: 500 }}>{row.full_name}</td>
                      <td style={{ padding: 12, fontSize: 13, color: '#374151' }}>{row.nik_employee}</td>
                      <td style={{ padding: 12, fontSize: 13, color: '#374151' }}>{row.department_name}</td>
                      <td style={{ padding: 12, fontSize: 13, color: '#374151' }}>Rp {formatCurrency(savedDist ? savedDist.simp_wajib : row.mandatory_saving_monthly)}</td>
                      <td style={{ padding: 12, fontSize: 13, color: '#374151' }}>Rp {formatCurrency(savedDist ? savedDist.simp_sukarela : row.voluntary_saving_monthly)}</td>
                      <td style={{ padding: 12, fontSize: 13, color: '#374151', fontWeight: 600 }}>Rp {formatCurrency(savedDist ? savedDist.total_savings : row.total_saving_amount)}</td>
                      <td style={{ padding: 12, fontSize: 13, color: displayShu !== null ? '#7c3aed' : '#9ca3af', fontWeight: displayShu !== null ? 600 : 400, fontStyle: displayShu !== null ? 'normal' : 'italic' }}>
                        {displayShu !== null ? `Rp ${formatCurrency(displayShu)}` : '—'}
                        {isSaved && (
                          <span style={{ marginLeft: 6, fontSize: 10, background: '#dcfce7', color: '#15803d', borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>DB</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {isSaved ? (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              onClick={() => handleOpenEdit(savedDist)}
                              title="Edit SHU"
                              style={{
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                width: 30, height: 30, borderRadius: 6,
                                border: '1px solid #d1d5db', background: '#fff',
                                cursor: 'pointer', color: '#3b82f6',
                              }}
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              onClick={() => handleDelete(savedDist)}
                              title="Hapus"
                              style={{
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                width: 30, height: 30, borderRadius: 6,
                                border: '1px solid #fecaca', background: '#fff',
                                cursor: 'pointer', color: '#dc2626',
                              }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>Belum disimpan</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && filteredMembers.length > 0 && (
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
              <span>{rangeStart}–{rangeEnd} dari {filteredMembers.length}</span>
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

      {/* Action Modal (annual — upload proof + notes) */}
      {actionModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setActionModal(null)}
        >
          <div
            style={{ background: '#fff', borderRadius: 16, padding: 28, width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>Upload & Catatan</h3>
              <button onClick={() => setActionModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}>
                <X size={20} />
              </button>
            </div>

            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#374151' }}>
              <strong>Anggota:</strong> {actionModal.member_name || actionModal.member?.full_name || '-'}
            </p>

            {/* Existing proof */}
            {(actionModal.transfer_proof_url || actionModal.transfer_proof) && (
              <div style={{ marginBottom: 12, padding: '8px 12px', background: '#f0fdf4', borderRadius: 8, fontSize: 12 }}>
                <span style={{ color: '#16a34a', fontWeight: 600 }}>Bukti saat ini: </span>
                <a
                  href={actionModal.transfer_proof_url || actionModal.transfer_proof}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: '#3b82f6', textDecoration: 'underline' }}
                >
                  {actionModal.transfer_proof_name || 'Lihat Bukti'}
                </a>
              </div>
            )}

            {actionModal.tf_reference_id && (
              <div style={{ marginBottom: 12, padding: '6px 10px', background: '#f5f3ff', borderRadius: 8, fontSize: 11, color: '#6b7280' }}>
                <span style={{ fontWeight: 600, color: '#7c3aed' }}>Ref: </span>
                <span style={{ fontFamily: 'monospace' }}>{actionModal.tf_reference_id}</span>
              </div>
            )}

            {/* Upload file */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#4b5563', marginBottom: 6 }}>
                Upload Bukti Transfer
              </label>
              <label style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '14px 16px', borderRadius: 10,
                border: `2px dashed ${actionFile ? '#7c3aed' : '#d1d5db'}`,
                background: actionFile ? '#f5f3ff' : '#f9fafb',
                cursor: 'pointer', fontSize: 13, color: actionFile ? '#7c3aed' : '#6b7280',
              }}>
                <Upload size={16} />
                {actionFile ? actionFile.name : 'Pilih file gambar atau PDF...'}
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  style={{ display: 'none' }}
                  onChange={e => { if (e.target.files[0]) setActionFile(e.target.files[0]); }}
                />
              </label>
            </div>

            {/* Notes */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#4b5563', marginBottom: 6 }}>
                Catatan <span style={{ fontWeight: 400, color: '#9ca3af' }}>(opsional)</span>
              </label>
              <textarea
                value={actionNotes}
                onChange={e => setActionNotes(e.target.value)}
                placeholder="Tambah catatan..."
                rows={3}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8,
                  border: '1px solid #d1d5db', fontSize: 13, outline: 'none',
                  boxSizing: 'border-box', resize: 'vertical', color: '#374151',
                }}
              />
            </div>

            {actionError && (
              <p style={{ margin: '0 0 12px', fontSize: 12, color: '#dc2626' }}>{actionError}</p>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setActionModal(null)}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #d1d5db', background: '#f3f4f6', fontSize: 13, cursor: 'pointer' }}
              >
                Batal
              </button>
              <button
                onClick={handleSubmitAction}
                disabled={actionSaving || (!actionFile && actionNotes === (actionModal.notes || ''))}
                style={{
                  padding: '8px 20px', borderRadius: 8, border: 'none',
                  background: actionSaving || (!actionFile && actionNotes === (actionModal.notes || '')) ? '#c4b5fd' : '#7c3aed',
                  color: '#fff', fontSize: 13, fontWeight: 600,
                  cursor: actionSaving || (!actionFile && actionNotes === (actionModal.notes || '')) ? 'not-allowed' : 'pointer',
                }}
              >
                {actionSaving ? 'Menyimpan...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal (monthly) */}
      {editModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setEditModal(null)}
        >
          <div
            style={{ background: '#fff', borderRadius: 16, padding: 28, width: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>Edit Simpanan</h3>
              <button onClick={() => setEditModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}>
                <X size={20} />
              </button>
            </div>

            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#374151' }}>
              <strong>Anggota:</strong> {editModal.member_name}
            </p>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#4b5563', marginBottom: 6 }}>
                Simpanan Wajib (Rp)
              </label>
              <input
                type="number"
                value={editSimpWajib}
                onChange={e => setEditSimpWajib(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#4b5563', marginBottom: 6 }}>
                Simpanan Sukarela (Rp)
              </label>
              <input
                type="number"
                value={editSimpSukarela}
                onChange={e => setEditSimpSukarela(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: 16, padding: '8px 12px', background: '#f9fafb', borderRadius: 8, fontSize: 12, color: '#6b7280' }}>
              Total Simpanan: <strong style={{ color: '#374151' }}>Rp {formatCurrency((parseFloat(editSimpWajib) || 0) + (parseFloat(editSimpSukarela) || 0))}</strong>
              <span style={{ marginLeft: 12, color: '#9ca3af' }}>(SHU Jasa Modal dihitung ulang otomatis)</span>
            </div>

            {editError && (
              <p style={{ margin: '0 0 12px', fontSize: 12, color: '#dc2626' }}>{editError}</p>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setEditModal(null)}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #d1d5db', background: '#f3f4f6', fontSize: 13, cursor: 'pointer' }}
              >
                Batal
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={editSaving}
                style={{
                  padding: '8px 20px', borderRadius: 8, border: 'none',
                  background: editSaving ? '#93c5fd' : '#3b82f6',
                  color: '#fff', fontSize: 13, fontWeight: 600,
                  cursor: editSaving ? 'not-allowed' : 'pointer',
                }}
              >
                {editSaving ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SHUIncomeTransaction;
