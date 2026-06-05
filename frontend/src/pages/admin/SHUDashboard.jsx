import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Download, TrendingUp, TrendingDown, ArrowUpRight, ArrowRight, PiggyBank, Calendar } from 'lucide-react';
import './SHUManagement.css';
import { shuApi } from '../../api/shuApi';

const MONTHS = [
  { value: '', label: 'Semua (Tahunan)' },
  { value: '1', label: 'Januari' },
  { value: '2', label: 'Februari' },
  { value: '3', label: 'Maret' },
  { value: '4', label: 'April' },
  { value: '5', label: 'Mei' },
  { value: '6', label: 'Juni' },
  { value: '7', label: 'Juli' },
  { value: '8', label: 'Agustus' },
  { value: '9', label: 'September' },
  { value: '10', label: 'Oktober' },
  { value: '11', label: 'November' },
  { value: '12', label: 'Desember' },
];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => currentYear - i);

const ALLOC_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#f97316'];

const fmt = (val) => new Intl.NumberFormat('id-ID').format(Math.round(val || 0));

const KpiCard = ({ label, value, loading, color, bgColor, icon: Icon, period }) => (
  <div style={{
    background: '#fff',
    borderRadius: 12,
    padding: '20px 24px',
    border: '1px solid #e5e7eb',
    borderLeft: `4px solid ${color}`,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <p style={{ fontSize: 13, color: '#6b7280', fontWeight: 500, margin: 0 }}>{label}</p>
      <div style={{
        width: 34, height: 34, borderRadius: 8,
        background: bgColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={16} color={color} />
      </div>
    </div>
    <p style={{ fontSize: 24, fontWeight: 700, color: '#111827', margin: 0, letterSpacing: '-0.3px' }}>
      {loading ? <span style={{ color: '#d1d5db' }}>—</span> : `Rp ${fmt(value)}`}
    </p>
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#9ca3af' }}>
      <Calendar size={11} />
      {period}
    </div>
  </div>
);

const SHUDashboard = () => {
  const navigate = useNavigate();

  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedYear, setSelectedYear] = useState(String(currentYear));
  const [shuResult, setShuResult] = useState(null);
  const [masterConfigs, setMasterConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingsStats, setSavingsStats] = useState({ mandatory: 0, voluntary: 0, total: 0 });

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [result, configs, memberBases] = await Promise.all([
          shuApi.getShuResult({ year: selectedYear, month: selectedMonth || undefined }),
          shuApi.getMasterConfigurations(),
          shuApi.getShuMemberBases({
            summary: selectedMonth ? 'month' : 'year',
            month: selectedMonth || undefined,
            year: selectedYear,
          }),
        ]);
        setShuResult(result);
        setMasterConfigs(configs.results || []);
        const rows = memberBases.results || [];
        setSavingsStats({
          mandatory: rows.reduce((s, r) => s + (r.mandatory_saving_monthly ?? 0), 0),
          voluntary: rows.reduce((s, r) => s + (r.voluntary_saving_monthly ?? 0), 0),
          total: rows.reduce((s, r) => s + (r.total_saving_amount ?? 0), 0),
        });
      } catch (e) {
        console.error('Gagal memuat data SHU dashboard', e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [selectedMonth, selectedYear]);

  const netProfit = Number(shuResult?.net_profit || 0);
  const allocations = masterConfigs.map((cfg, i) => ({
    label: cfg.component_name,
    percentage: Number(cfg.percentage),
    amount: netProfit * (Number(cfg.percentage) / 100),
    color: ALLOC_COLORS[i % ALLOC_COLORS.length],
  }));

  const periodLabel = selectedMonth
    ? `${MONTHS.find(m => m.value === selectedMonth)?.label} ${selectedYear}`
    : `Tahun ${selectedYear}`;

  const mandatoryPct = savingsStats.total > 0 ? (savingsStats.mandatory / savingsStats.total) * 100 : 0;
  const voluntaryPct = savingsStats.total > 0 ? (savingsStats.voluntary / savingsStats.total) * 100 : 0;

  return (
    <div className="shu-container shu-page-shell">
      {/* Nav Tabs */}
      <div className="shu-nav-tabs">
        <NavLink to="/dashboard/admin/shu-dashboard" end className={({ isActive }) => `shu-tab ${isActive ? 'active' : ''}`}>
          SHU MANAGEMENT
        </NavLink>
        <NavLink to="/dashboard/admin/shu-income" className={({ isActive }) => `shu-tab ${isActive ? 'active' : ''}`}>
          REKAP SHU JASA MODAL ANGGOTA
        </NavLink>
        <NavLink to="/dashboard/admin/shu-outcome" className={({ isActive }) => `shu-tab ${isActive ? 'active' : ''}`}>
          OUTCOME INCOME TRANSACTION
        </NavLink>
      </div>

      {/* Header */}
      <div className="shu-hero-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: 12, color: '#9ca3af', fontWeight: 500, marginBottom: 4, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
            SHU Management
          </p>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0 }}>Halaman Utama SHU</h1>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8,
            background: '#eff6ff', color: '#2563eb', padding: '4px 10px',
            borderRadius: 20, fontSize: 12, fontWeight: 600,
          }}>
            <Calendar size={11} /> Periode: {periodLabel}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select className="shu-filter-select" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>
            {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <select className="shu-filter-select" value={selectedYear} onChange={e => setSelectedYear(e.target.value)}>
            {YEARS.map(y => <option key={y} value={String(y)}>{y}</option>)}
          </select>
          <button className="shu-btn-icon"><Download size={16} /></button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="shu-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, width: '100%' }}>
        <KpiCard
          label="Total Pendapatan"
          value={shuResult?.total_revenue}
          loading={loading}
          color="#16a34a"
          bgColor="#dcfce7"
          icon={TrendingUp}
          period={periodLabel}
        />
        <KpiCard
          label="Total Pengeluaran Operasi"
          value={shuResult?.total_expense}
          loading={loading}
          color="#dc2626"
          bgColor="#fee2e2"
          icon={TrendingDown}
          period={periodLabel}
        />
        <KpiCard
          label="Sisa Hasil Usaha (SHU)"
          value={netProfit}
          loading={loading}
          color="#2563eb"
          bgColor="#dbeafe"
          icon={ArrowUpRight}
          period={periodLabel}
        />
      </div>

      {/* Allocation of SHU */}
      <div className="shu-section-block">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#111827', margin: 0 }}>Alokasi SHU</h2>
            <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
              Distribusi penggunaan Sisa Hasil Usaha
            </p>
          </div>
          {!loading && shuResult && (
            <div style={{ fontSize: 13, color: '#374151', fontWeight: 600, background: '#f9fafb', padding: '6px 12px', borderRadius: 8, border: '1px solid #e5e7eb' }}>
              Total SHU: <span style={{ color: '#2563eb' }}>Rp {fmt(netProfit)}</span>
            </div>
          )}
        </div>

        {!loading && !shuResult ? (
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '14px 18px', fontSize: 13, color: '#92400e' }}>
            Belum ada data SHU untuk {periodLabel}. Simpan hasil SHU melalui halaman Outcome Transaction.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, width: '100%' }}>
            {allocations.length === 0 && !loading ? (
              <p style={{ fontSize: 13, color: '#9ca3af', gridColumn: '1/-1' }}>
                Belum ada konfigurasi komponen SHU.
              </p>
            ) : (
              allocations.map((alloc, i) => (
                <div key={i} style={{
                  background: '#fff', borderRadius: 10, padding: '16px 18px',
                  border: '1px solid #e5e7eb', borderTop: `3px solid ${alloc.color}`,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>{alloc.label}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
                      background: `${alloc.color}18`, color: alloc.color,
                    }}>{alloc.percentage}%</span>
                  </div>
                  <p style={{ fontSize: 17, fontWeight: 700, color: '#111827', margin: '0 0 12px' }}>
                    {loading ? '—' : `Rp ${fmt(alloc.amount)}`}
                  </p>
                  <div style={{ height: 4, background: '#f1f5f9', borderRadius: 2 }}>
                    <div style={{ height: '100%', background: alloc.color, borderRadius: 2, width: `${alloc.percentage}%`, transition: 'width 0.4s ease' }} />
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Total Simpanan Anggota */}
      <div className="shu-section-block">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div className="shu-section-block">
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#111827', margin: 0 }}>Total Simpanan Anggota</h2>
            <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Akumulasi simpanan periode {periodLabel}</p>
          </div>
          <button
            onClick={() => navigate('/dashboard/admin/shu-income')}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'transparent', border: '1px solid #d1d5db',
              color: '#374151', borderRadius: 8, padding: '6px 12px',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Lihat Detail <ArrowRight size={12} />
          </button>
        </div>

        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
            {/* Simpanan Wajib */}
            <div style={{ padding: '22px 28px', borderRight: '1px solid #f3f4f6' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6', flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>Simpanan Wajib</span>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: '#9ca3af' }}>
                  {mandatoryPct.toFixed(1)}%
                </span>
              </div>
              <p style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: '0 0 10px' }}>
                {loading ? '—' : `Rp ${fmt(savingsStats.mandatory)}`}
              </p>
              <div style={{ height: 5, background: '#eff6ff', borderRadius: 3 }}>
                <div style={{ height: '100%', background: '#3b82f6', borderRadius: 3, width: `${mandatoryPct}%`, transition: 'width 0.4s ease' }} />
              </div>
            </div>

            {/* Simpanan Sukarela */}
            <div style={{ padding: '22px 28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>Simpanan Sukarela</span>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: '#9ca3af' }}>
                  {voluntaryPct.toFixed(1)}%
                </span>
              </div>
              <p style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: '0 0 10px' }}>
                {loading ? '—' : `Rp ${fmt(savingsStats.voluntary)}`}
              </p>
              <div style={{ height: 5, background: '#ecfdf5', borderRadius: 3 }}>
                <div style={{ height: '100%', background: '#10b981', borderRadius: 3, width: `${voluntaryPct}%`, transition: 'width 0.4s ease' }} />
              </div>
            </div>
          </div>

          {/* Total row */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '16px 28px', background: '#f9fafb', borderTop: '1px solid #e5e7eb',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <PiggyBank size={16} color="#6b7280" />
              <span style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>Total Simpanan</span>
            </div>
            <span style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>
              {loading ? '—' : `Rp ${fmt(savingsStats.total)}`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SHUDashboard;
