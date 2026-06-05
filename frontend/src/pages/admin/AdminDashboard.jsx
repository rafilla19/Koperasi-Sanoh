import React, { useState, useEffect } from 'react';
import { Wallet, TrendingUp, Users, Clock, CalendarDays } from 'lucide-react';
import {
  fetchAdminDashboardOverview,
  fetchAdminDashboardNetSales,
  fetchAdminDashboardWeeklyCashflow,
} from '../../services/api';
import { Line } from 'react-chartjs-2';
import { useNavigate } from 'react-router-dom';
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
import './AdminDashboard.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
  Legend
);

const getTodayLabel = () => {
  const now = new Date();
  return now.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [dashboardData, setDashboardData] = useState(null);
  const [dashboardError, setDashboardError] = useState('');
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [netSalesRange, setNetSalesRange] = useState('3month');
  const [weeklyRange, setWeeklyRange] = useState('weekly');
  const [netSalesChart, setNetSalesChart] = useState({ labels: [], data: [] });
  const [weeklyCashflowChart, setWeeklyCashflowChart] = useState({ labels: [], income: [], expense: [] });

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const data = await fetchAdminDashboardOverview();
        setDashboardData(data);
      } catch (error) {
        setDashboardError(error.message || 'Gagal memuat data dashboard.');
      } finally {
        setDashboardLoading(false);
      }
    };
    loadDashboard();
  }, []);

  useEffect(() => {
    const loadNetSales = async () => {
      try {
        const data = await fetchAdminDashboardNetSales(netSalesRange);
        setNetSalesChart({ labels: data.labels || [], data: data.data || [] });
      } catch (error) {
        console.error('Failed to load net sales chart data', error);
      }
    };
    loadNetSales();
  }, [netSalesRange]);

  useEffect(() => {
    const loadWeeklyCashflow = async () => {
      try {
        const data = await fetchAdminDashboardWeeklyCashflow(weeklyRange);
        setWeeklyCashflowChart({
          labels: data.labels || [],
          income: data.income || [],
          expense: data.expense || [],
        });
      } catch (error) {
        console.error('Failed to load SHU flow chart data', error);
      }
    };
    loadWeeklyCashflow();
  }, [weeklyRange]);

  const formatRupiah = (value) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(value || 0);
  };

  const totalAssets = dashboardData?.total_assets || 0;
  const currentMonthShu = dashboardData?.current_month_shu || 0;
  const activeMembers = dashboardData?.active_members || 0;
  const pendingApprovals = dashboardData?.pending_approvals || 0;
  const pendingRequests = dashboardData?.pending_requests || [];

  const kpiCards = [
    {
      label: 'Total Aset',
      sublabel: 'Aset koperasi keseluruhan',
      value: formatRupiah(totalAssets),
      icon: <Wallet size={22} />,
      gradient: 'linear-gradient(135deg, #2563EB, #60A5FA)',
    },
    {
      label: 'SHU Bulan Ini',
      sublabel: 'Sisa Hasil Usaha bulan berjalan',
      value: formatRupiah(currentMonthShu),
      icon: <TrendingUp size={22} />,
      gradient: 'linear-gradient(135deg, #10B981, #6EE7B7)',
    },
    {
      label: 'Anggota Aktif',
      sublabel: 'Total anggota terdaftar & aktif',
      value: activeMembers,
      icon: <Users size={22} />,
      gradient: 'linear-gradient(135deg, #8B5CF6, #C4B5FD)',
    },
    {
      label: 'Persetujuan Tertunda',
      sublabel: 'Permintaan menunggu tindakan',
      value: pendingApprovals,
      icon: <Clock size={22} />,
      gradient: 'linear-gradient(135deg, #F59E0B, #FCD34D)',
    },
  ];

  const shuData = {
    labels: weeklyCashflowChart.labels,
    datasets: [
      {
        fill: false,
        label: 'Pemasukan',
        data: weeklyCashflowChart.income,
        borderColor: '#4CAF50',
        backgroundColor: 'rgba(76, 175, 80, 0.15)',
        tension: 0.4,
        pointRadius: 3,
      },
      {
        fill: false,
        label: 'Pengeluaran',
        data: weeklyCashflowChart.expense,
        borderColor: '#F87171',
        backgroundColor: 'rgba(248, 113, 113, 0.15)',
        tension: 0.4,
        pointRadius: 3,
      },
    ],
  };

  const netSalesData = {
    labels: netSalesChart.labels,
    datasets: [
      {
        fill: true,
        label: 'Net Sales',
        data: netSalesChart.data,
        borderColor: '#4CAF50',
        backgroundColor: 'rgba(76, 175, 80, 0.1)',
        tension: 0.4,
        pointRadius: 3,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: true } },
    scales: {
      y: { border: { dash: [4, 4] }, grid: { color: '#F1F4F9' } },
      x: { grid: { display: false } },
    },
  };

  return (
    <div className="ad-container">
      {/* Header */}
      <div className="ad-page-header">
        <div>
          <h1>Admin Dashboard</h1>
          <p>Ringkasan aset, SHU, dan permintaan persetujuan terbaru.</p>
        </div>
        <div className="ad-date-badge">
          <CalendarDays size={16} />
          <span>{getTodayLabel()}</span>
        </div>
      </div>

      {dashboardLoading && (
        <div className="ad-banner ad-banner-loading">
          <span>Memuat data dashboard...</span>
        </div>
      )}
      {dashboardError && (
        <div className="ad-banner ad-banner-error">
          <span>⚠️ {dashboardError}</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="ad-stats">
        {kpiCards.map((card) => (
          <div className="ad-stat-card" key={card.label}>
            <div className="ad-stat-icon" style={{ background: card.gradient }}>
              {card.icon}
            </div>
            <div className="ad-stat-info">
              <span className="ad-stat-sublabel">{card.sublabel}</span>
              <h4>{card.label}</h4>
              <div className="ad-stat-val">
                <strong>{card.value}</strong>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Pending Approvals List */}
      <div className="ad-section-header">
        <div>
          <h2>Persetujuan Tertunda</h2>
          <p className="ad-section-desc">Permintaan anggota yang memerlukan tindakan segera</p>
        </div>
        {pendingRequests.length > 0 && (
          <span className="ad-badge-count">{pendingRequests.length} permintaan</span>
        )}
      </div>

      <div className="ad-approvals-row">
        {pendingRequests.length > 0 ? (
          pendingRequests.map((request) => (
            <div
              className="ad-approval-card"
              key={`${request.request_type}-${request.request_id}`}
              onClick={() => request.link && navigate(request.link)}
              style={{ cursor: request.link ? 'pointer' : 'default' }}
            >
              <div className="ad-ac-header">
                <div className="ad-ac-avatar">
                  <span>{(request.member_name || '?')[0].toUpperCase()}</span>
                </div>
                <div className="ad-ac-info">
                  <h4>{request.member_name}</h4>
                  <p>{request.request_type}</p>
                </div>
                <span className={`ad-ac-status status-${String(request.status || '').toLowerCase().replace(/\s+/g, '-')}`}>
                  {request.status}
                </span>
              </div>

              <div className="ad-ac-body">
                <div className="ad-col">
                  <span className="lbl">Detail</span>
                  <span className="val" style={{ maxWidth: 160 }}>{request.details || '-'}</span>
                </div>
                {request.amount != null && (
                  <div className="ad-col">
                    <span className="lbl">Jumlah</span>
                    <span className="val">{formatRupiah(request.amount)}</span>
                  </div>
                )}
              </div>

              <div className="ad-ac-amount">
                <span className="lbl">Tanggal Permintaan</span>
                <span className="val">
                  {request.request_date
                    ? new Date(request.request_date).toLocaleDateString('id-ID', {
                        day: 'numeric', month: 'long', year: 'numeric',
                      })
                    : '-'}
                </span>
              </div>
            </div>
          ))
        ) : (
          <div className="ad-empty-state">
            <Clock size={32} strokeWidth={1.5} />
            <p>Tidak ada permintaan persetujuan saat ini.</p>
          </div>
        )}
      </div>

      {/* Charts Row */}
      <div className="ad-charts-row">
        <div className="ad-chart-card">
          <div className="ad-chart-header">
            <div>
              <h3>Analitik Transaksi</h3>
              <p className="ad-chart-sub">Arus kas pemasukan & pengeluaran</p>
            </div>
            <select
              className="ad-chart-select"
              value={weeklyRange}
              onChange={(e) => setWeeklyRange(e.target.value)}
            >
              <option value="weekly">Mingguan</option>
              <option value="3month">3 Bulan Terakhir</option>
              <option value="6month">6 Bulan Terakhir</option>
              <option value="1year">1 Tahun Terakhir</option>
              <option value="3year">3 Tahun Terakhir</option>
            </select>
          </div>
          <div className="ad-chart-body">
            <Line data={shuData} options={chartOptions} />
          </div>
        </div>

        <div className="ad-chart-card">
          <div className="ad-chart-header">
            <div>
              <h3>Net Sales</h3>
              <p className="ad-chart-sub">Penjualan bersih dalam periode terpilih</p>
            </div>
            <select
              className="ad-chart-select"
              value={netSalesRange}
              onChange={(e) => setNetSalesRange(e.target.value)}
            >
              <option value="3month">3 Bulan Terakhir</option>
              <option value="6month">6 Bulan Terakhir</option>
              <option value="1year">1 Tahun Terakhir</option>
              <option value="3year">3 Tahun Terakhir</option>
            </select>
          </div>
          <div className="ad-chart-body">
            <Line data={netSalesData} options={chartOptions} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
