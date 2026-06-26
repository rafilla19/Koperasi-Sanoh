import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { TrendingUp, TrendingDown, ArrowUpRight, ArrowRight, PiggyBank, Calendar, X, AlertCircle, Brain, Activity, Zap, BarChart3 } from 'lucide-react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
  Legend,
} from 'chart.js';
import './SHUManagement.css';
import { shuApi } from '../../api/shuApi';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Filler, Legend);

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
  const [componentAllocations, setComponentAllocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingsStats, setSavingsStats] = useState({ mandatory: 0, voluntary: 0, total: 0 });
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  // Forecast state
  const [forecastData, setForecastData] = useState(null);
  const [forecastLoading, setForecastLoading] = useState(true);

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [modalPeriodType, setModalPeriodType] = useState('tahunan'); // 'bulanan' or 'tahunan'
  const [modalMonth, setModalMonth] = useState('');
  const [modalYear, setModalYear] = useState(String(currentYear));
  const [modalNetProfit, setModalNetProfit] = useState(0);
  const [modalAllocations, setModalAllocations] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState('');
  const [modalSuccess, setModalSuccess] = useState('');
  const [savingAllocations, setSavingAllocations] = useState(false);

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
        
        let allocs = [];
        try {
          if (result && result.id) {
            const allocsRes = await shuApi.getComponentAllocations({
              year: selectedYear,
              month: selectedMonth || undefined
            });
            allocs = allocsRes.results || [];
          }
        } catch (allocError) {
          console.error("Gagal memuat detail alokasi SHU dari DB, fallback ke konfigurasi master", allocError);
        }
        setComponentAllocations(allocs);

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
  }, [selectedMonth, selectedYear, refetchTrigger]);

  useEffect(() => {
    const fetchForecast = async () => {
      setForecastLoading(true);
      try {
        const data = await shuApi.getShuForecast({ months: 6 });
        setForecastData(data);
      } catch (e) {
        console.error('Gagal memuat forecast SHU', e);
        setForecastData(null);
      } finally {
        setForecastLoading(false);
      }
    };
    fetchForecast();
  }, []);

  const netProfit = Number(shuResult?.net_profit || 0);

  const allocations = componentAllocations.length > 0
    ? componentAllocations.map((alloc, i) => ({
        id: alloc.id,
        label: alloc.component_name,
        percentage: Number(alloc.percentage),
        amount: Number(alloc.allocated_amount),
        color: ALLOC_COLORS[i % ALLOC_COLORS.length],
      }))
    : masterConfigs.map((cfg, i) => ({
        label: cfg.component_name,
        percentage: Number(cfg.percentage),
        amount: netProfit * (Number(cfg.percentage) / 100),
        color: ALLOC_COLORS[i % ALLOC_COLORS.length],
      }));

  // Modal logic handlers
  const handleOpenEditModal = () => {
    setModalPeriodType(selectedMonth ? 'bulanan' : 'tahunan');
    setModalMonth(selectedMonth || '1');
    setModalYear(selectedYear);
    setModalError('');
    setModalSuccess('');
    setShowEditModal(true);
  };

  useEffect(() => {
    if (!showEditModal) return;

    const fetchAllocationsForModal = async () => {
      setModalLoading(true);
      setModalError('');
      setModalAllocations([]);
      setModalNetProfit(0);
      try {
        const monthParam = modalPeriodType === 'tahunan' ? undefined : modalMonth;
        const res = await shuApi.getComponentAllocations({
          year: modalYear,
          month: monthParam || undefined,
        });
        setModalAllocations(res.results || []);
        setModalNetProfit(res.net_profit || 0);
      } catch (err) {
        setModalError(err?.detail || err?.error || 'Belum ada data SHU untuk periode ini. Silakan buat hasil SHU terlebih dahulu di halaman Outcome Transaction.');
      } finally {
        setModalLoading(false);
      }
    };

    fetchAllocationsForModal();
  }, [showEditModal, modalPeriodType, modalMonth, modalYear]);

  const handlePercentageChange = (id, rawValue) => {
    setModalAllocations(prev =>
      prev.map(alloc => {
        if (alloc.id === id) {
          const valNum = Number(rawValue) || 0;
          return {
            ...alloc,
            percentage: rawValue,
            allocated_amount: modalNetProfit * (valNum / 100),
          };
        }
        return alloc;
      })
    );
  };

  const handleSaveAllocations = async () => {
    setSavingAllocations(true);
    setModalError('');
    setModalSuccess('');
    try {
      const monthParam = modalPeriodType === 'tahunan' ? undefined : modalMonth;
      
      const payload = {
        year: Number(modalYear),
        month: monthParam ? Number(monthParam) : null,
        allocations: modalAllocations.map(alloc => ({
          id: alloc.id,
          percentage: Number(alloc.percentage)
        }))
      };

      await shuApi.saveComponentAllocations(payload);
      setModalSuccess('Alokasi SHU berhasil diperbarui dan total SHU anggota telah disesuaikan.');
      setRefetchTrigger(prev => prev + 1);
    } catch (err) {
      setModalError(err?.detail || err?.error || 'Gagal menyimpan alokasi.');
    } finally {
      setSavingAllocations(false);
    }
  };

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
          {!loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                onClick={handleOpenEditModal}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: '1px solid #d1d5db',
                  background: '#fff',
                  color: '#374151',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}
              >
                Edit Alokasi
              </button>
              {shuResult && (
                <div style={{ fontSize: 13, color: '#374151', fontWeight: 600, background: '#f9fafb', padding: '6px 12px', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                  Total SHU: <span style={{ color: '#2563eb' }}>Rp {fmt(netProfit)}</span>
                </div>
              )}
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

      {/* ML Forecast Section */}
      <div className="shu-section-block">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Brain size={18} color="#7c3aed" />
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#111827', margin: 0 }}>Prediksi SHU - Machine Learning</h2>
            </div>
            <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
              Forecast 6 bulan ke depan menggunakan model XGBoost
            </p>
          </div>
          {forecastData?.metrics && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: forecastData.metrics.confidence === 'high' ? '#ecfdf5' : forecastData.metrics.confidence === 'medium' ? '#fffbeb' : '#fef2f2',
              color: forecastData.metrics.confidence === 'high' ? '#065f46' : forecastData.metrics.confidence === 'medium' ? '#92400e' : '#991b1b',
              padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600,
            }}>
              <Activity size={12} />
              Confidence: {forecastData.metrics.confidence?.toUpperCase()} (R² = {forecastData.metrics.r_squared})
            </div>
          )}
        </div>

        {forecastLoading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af', fontSize: 13 }}>
            Memuat prediksi ML...
          </div>
        ) : forecastData?.error ? (
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '14px 18px', fontSize: 13, color: '#92400e' }}>
            {forecastData.error}
          </div>
        ) : forecastData ? (
          <>
            {/* Insight Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${forecastData.insights?.length || 1}, 1fr)`, gap: 12, marginBottom: 16 }}>
              {forecastData.insights?.map((insight, i) => (
                <div key={i} style={{
                  background: insight.sentiment === 'positive' ? '#f0fdf4' : insight.sentiment === 'negative' ? '#fef2f2' : '#f0f9ff',
                  border: `1px solid ${insight.sentiment === 'positive' ? '#bbf7d0' : insight.sentiment === 'negative' ? '#fecaca' : '#bfdbfe'}`,
                  borderRadius: 10, padding: '12px 16px',
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                    background: insight.sentiment === 'positive' ? '#dcfce7' : insight.sentiment === 'negative' ? '#fee2e2' : '#dbeafe',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {insight.type === 'trend' ? (
                      <TrendingUp size={14} color={insight.sentiment === 'positive' ? '#16a34a' : insight.sentiment === 'negative' ? '#dc2626' : '#2563eb'} />
                    ) : (
                      <Zap size={14} color="#2563eb" />
                    )}
                  </div>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', margin: '0 0 2px', textTransform: 'uppercase' }}>
                      {insight.type === 'trend' ? 'Tren Prediksi' : 'Faktor Utama'}
                    </p>
                    <p style={{ fontSize: 13, fontWeight: 500, color: '#1f2937', margin: 0 }}>{insight.message}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Forecast Chart */}
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
                <BarChart3 size={14} color="#6b7280" />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Grafik SHU: Historis vs Prediksi</span>
              </div>
              <div style={{ height: 320 }}>
                <Line
                  data={{
                    labels: [
                      ...forecastData.historical.map(h => {
                        const [y, m] = h.month.split('-');
                        return new Date(y, m - 1).toLocaleDateString('id-ID', { month: 'short', year: '2-digit' });
                      }),
                      ...forecastData.forecast.map(f => {
                        const [y, m] = f.month.split('-');
                        return new Date(y, m - 1).toLocaleDateString('id-ID', { month: 'short', year: '2-digit' });
                      }),
                    ],
                    datasets: [
                      {
                        label: 'SHU Aktual',
                        data: [
                          ...forecastData.historical.map(h => h.profit),
                          ...Array(forecastData.forecast.length).fill(null),
                        ],
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        fill: true,
                        tension: 0.3,
                        pointRadius: 3,
                        borderWidth: 2,
                      },
                      {
                        label: 'Prediksi SHU',
                        data: [
                          ...Array(forecastData.historical.length - 1).fill(null),
                          forecastData.historical[forecastData.historical.length - 1]?.profit,
                          ...forecastData.forecast.map(f => f.predicted_profit),
                        ],
                        borderColor: '#8b5cf6',
                        backgroundColor: 'rgba(139, 92, 246, 0.08)',
                        fill: true,
                        borderDash: [6, 4],
                        tension: 0.3,
                        pointRadius: 3,
                        borderWidth: 2,
                      },
                      {
                        label: 'Revenue Prediksi',
                        data: [
                          ...Array(forecastData.historical.length - 1).fill(null),
                          forecastData.historical[forecastData.historical.length - 1]?.revenue,
                          ...forecastData.forecast.map(f => f.predicted_revenue),
                        ],
                        borderColor: '#10b981',
                        borderDash: [4, 3],
                        tension: 0.3,
                        pointRadius: 2,
                        borderWidth: 1.5,
                        fill: false,
                      },
                      {
                        label: 'Expense Prediksi',
                        data: [
                          ...Array(forecastData.historical.length - 1).fill(null),
                          forecastData.historical[forecastData.historical.length - 1]?.expense,
                          ...forecastData.forecast.map(f => f.predicted_expense),
                        ],
                        borderColor: '#ef4444',
                        borderDash: [4, 3],
                        tension: 0.3,
                        pointRadius: 2,
                        borderWidth: 1.5,
                        fill: false,
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                      legend: { position: 'bottom', labels: { usePointStyle: true, padding: 16, font: { size: 11 } } },
                      tooltip: {
                        callbacks: {
                          label: (ctx) => ctx.raw != null ? `${ctx.dataset.label}: Rp ${fmt(ctx.raw)}` : '',
                        },
                      },
                    },
                    scales: {
                      y: {
                        beginAtZero: true,
                        ticks: {
                          callback: (v) => `Rp ${(v / 1_000_000).toFixed(0)}jt`,
                          font: { size: 10 },
                        },
                        grid: { color: '#f3f4f6' },
                      },
                      x: {
                        ticks: { font: { size: 10 }, maxRotation: 45 },
                        grid: { display: false },
                      },
                    },
                  }}
                />
              </div>
            </div>

          </>
        ) : (
          <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '20px', textAlign: 'center', color: '#6b7280', fontSize: 13 }}>
            Model ML belum tersedia. Jalankan <code>python manage.py train_shu_admin_model</code> untuk melatih model.
          </div>
        )}
      </div>

      {/* Edit Allocation Modal */}
      {showEditModal && (
        <div className="shu-modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="shu-modal-content" style={{ maxWidth: 620 }} onClick={e => e.stopPropagation()}>
            <div className="shu-modal-header">
              <div className="shu-modal-title">Edit Alokasi SHU Komponen</div>
              <button className="shu-modal-close" onClick={() => setShowEditModal(false)}><X size={20} /></button>
            </div>
            
            <div className="shu-form-container" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Period Type Selection */}
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', borderBottom: '1px solid #f3f4f6', paddingBottom: 12 }}>
                <label style={{ fontWeight: 600, fontSize: 13, color: '#374151' }}>Tipe Periode:</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setModalPeriodType('bulanan')}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 20,
                      border: '1px solid #d1d5db',
                      background: modalPeriodType === 'bulanan' ? '#3b82f6' : '#fff',
                      color: modalPeriodType === 'bulanan' ? '#fff' : '#374151',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Bulanan
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalPeriodType('tahunan')}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 20,
                      border: '1px solid #d1d5db',
                      background: modalPeriodType === 'tahunan' ? '#3b82f6' : '#fff',
                      color: modalPeriodType === 'tahunan' ? '#fff' : '#374151',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Tahunan
                  </button>
                </div>
              </div>

              {/* Period Selection Controls */}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {modalPeriodType === 'bulanan' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 120 }}>
                    <label style={{ fontWeight: 600, fontSize: 12, color: '#4b5563' }}>Bulan</label>
                    <select
                      value={modalMonth}
                      onChange={e => setModalMonth(e.target.value)}
                      className="shu-filter-select"
                      style={{ width: '100%' }}
                    >
                      {MONTHS.filter(m => m.value !== '').map(m => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 120 }}>
                  <label style={{ fontWeight: 600, fontSize: 12, color: '#4b5563' }}>Tahun</label>
                  <select
                    value={modalYear}
                    onChange={e => setModalYear(e.target.value)}
                    className="shu-filter-select"
                    style={{ width: '100%' }}
                  >
                    {YEARS.map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Error messages */}
              {modalError && (
                <div style={{
                  padding: '10px 14px',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: 8,
                  fontSize: 12,
                  color: '#dc2626',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}>
                  <AlertCircle size={14} style={{ flexShrink: 0 }} />
                  <span>{modalError}</span>
                </div>
              )}

              {/* Success message */}
              {modalSuccess && (
                <div style={{
                  padding: '10px 14px',
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: 8,
                  fontSize: 12,
                  color: '#15803d',
                  fontWeight: 600
                }}>
                  {modalSuccess}
                </div>
              )}

              {/* Allocation Editing Form */}
              {modalLoading ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: '#9ca3af', fontSize: 13 }}>
                  Memuat data alokasi...
                </div>
              ) : modalAllocations.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#eff6ff', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#2563eb' }}>
                    <span>Total SHU (Net Profit):</span>
                    <span>Rp {fmt(modalNetProfit)}</span>
                  </div>

                  <table style={{ display: 'table', width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ display: 'table-row', borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                        <th style={{ display: 'table-cell', padding: '8px 4px', color: '#4b5563', fontWeight: 600 }}>Komponen</th>
                        <th style={{ display: 'table-cell', padding: '8px 4px', color: '#4b5563', fontWeight: 600, width: '100px' }}>Persentase (%)</th>
                        <th style={{ display: 'table-cell', padding: '8px 4px', color: '#4b5563', fontWeight: 600, textAlign: 'right', width: '150px' }}>Nilai Alokasi (Rp)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modalAllocations.map(alloc => (
                        <tr key={alloc.id} style={{ display: 'table-row', borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ display: 'table-cell', padding: '8px 4px', color: '#1f2937', fontWeight: 500 }}>{alloc.component_name}</td>
                          <td style={{ display: 'table-cell', padding: '8px 4px' }}>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              max="100"
                              value={alloc.percentage}
                              onChange={e => handlePercentageChange(alloc.id, e.target.value)}
                              style={{
                                width: '80px',
                                padding: '4px 8px',
                                borderRadius: 6,
                                border: '1px solid #d1d5db',
                                outline: 'none',
                                fontSize: 13,
                                color: '#1f2937',
                                background: '#fff'
                              }}
                            />
                          </td>
                          <td style={{ display: 'table-cell', padding: '8px 4px', textAlign: 'right', color: '#374151', fontWeight: 600 }}>
                            {fmt(alloc.allocated_amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Summary check */}
                  {(() => {
                    const sumPct = modalAllocations.reduce((sum, a) => sum + (Number(a.percentage) || 0), 0);
                    const isCorrect = Math.abs(sumPct - 100) < 0.001;
                    return (
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginTop: 8,
                        padding: '10px 12px',
                        background: isCorrect ? '#ecfdf5' : '#fffbeb',
                        border: `1px solid ${isCorrect ? '#a7f3d0' : '#fef3c7'}`,
                        borderRadius: 8,
                        fontSize: 12,
                        color: isCorrect ? '#065f46' : '#b45309',
                        fontWeight: 600
                      }}>
                        <span>Total Persentase:</span>
                        <span>{sumPct.toFixed(2)}% (Harus 100.00%)</span>
                      </div>
                    );
                  })()}
                </div>
              ) : null}

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16, borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: '1px solid #d1d5db',
                    background: '#f3f4f6',
                    fontSize: 13,
                    cursor: 'pointer'
                  }}
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveAllocations}
                  disabled={
                    savingAllocations ||
                    modalLoading ||
                    modalAllocations.length === 0 ||
                    Math.abs(modalAllocations.reduce((sum, a) => sum + (Number(a.percentage) || 0), 0) - 100) > 0.001
                  }
                  style={{
                    padding: '8px 24px',
                    borderRadius: 8,
                    background:
                      savingAllocations ||
                      modalLoading ||
                      modalAllocations.length === 0 ||
                      Math.abs(modalAllocations.reduce((sum, a) => sum + (Number(a.percentage) || 0), 0) - 100) > 0.001
                        ? '#93c5fd'
                        : '#3b82f6',
                    color: '#fff',
                    border: 'none',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor:
                      savingAllocations ||
                      modalLoading ||
                      modalAllocations.length === 0 ||
                      Math.abs(modalAllocations.reduce((sum, a) => sum + (Number(a.percentage) || 0), 0) - 100) > 0.001
                        ? 'not-allowed'
                        : 'pointer'
                  }}
                >
                  {savingAllocations ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SHUDashboard;
