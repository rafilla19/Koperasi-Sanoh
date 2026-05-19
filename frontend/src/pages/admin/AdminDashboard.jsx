import React, { useState } from 'react';
import { ShoppingBag, Users, Calendar, ArrowUp } from 'lucide-react';
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

const AdminDashboard = () => {
  const navigate = useNavigate();

  // Chart Data
  const shuData = {
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sun', 'Sat'],
    datasets: [
      {
        fill: true,
        label: 'SHU',
        data: [100, 220, 430, 320, 540, 580, 420],
        borderColor: '#FFC107',
        backgroundColor: 'rgba(255, 193, 7, 0.1)',
        tension: 0.4,
        pointRadius: 0,
      },
    ],
  };

  const netSalesData = {
    labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
    datasets: [
      {
        fill: true,
        label: 'Net Sales',
        data: [650, 460, 950, 750, 1050, 850, 980],
        borderColor: '#4CAF50',
        backgroundColor: 'rgba(76, 175, 80, 0.1)',
        tension: 0.4,
        pointRadius: 0,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: { border: { dash: [4, 4] }, grid: { color: '#F1F4F9' } },
      x: { grid: { display: false } },
    },
  };

  return (
    <div className="ad-container">

      {/* 4 Stats Cards */}
      <div className="ad-stats">
        <div className="ad-stat-card">
          <div className="ad-stat-icon" style={{ background: '#4880F0' }}>
            <ShoppingBag size={24} />
          </div>
          <div className="ad-stat-info">
            <h4>Total Assets</h4>
            <div className="ad-stat-val">
              <strong>Rp 126.500</strong>
              <span className="ad-stat-trend"><ArrowUp size={12} /> 34.7%</span>
            </div>
          </div>
        </div>

        <div className="ad-stat-card">
          <div className="ad-stat-icon" style={{ background: '#4880F0' }}>
            <ShoppingBag size={24} />
          </div>
          <div className="ad-stat-info">
            <h4>Current Month SHU</h4>
            <div className="ad-stat-val">
              <strong>Rp 126.500</strong>
              <span className="ad-stat-trend"><ArrowUp size={12} /> 34.7%</span>
            </div>
          </div>
        </div>

        <div className="ad-stat-card">
          <div className="ad-stat-icon" style={{ background: '#4880F0' }}>
            <ShoppingBag size={24} />
          </div>
          <div className="ad-stat-info">
            <h4>Active Members</h4>
            <div className="ad-stat-val">
              <strong>78</strong>
            </div>
          </div>
        </div>

        <div className="ad-stat-card">
          <div className="ad-stat-icon" style={{ background: '#4880F0' }}>
            <ShoppingBag size={24} />
          </div>
          <div className="ad-stat-info">
            <h4>Pending Approvals</h4>
            <div className="ad-stat-val">
              <strong>5</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Pending Approvals List */}
      <div className="ad-section-title">
        <h2>Pending Approvals</h2>
      </div>

      <div className="ad-approvals-row">
        {[1, 2, 3].map((item) => (
          <div className="ad-approval-card" key={item} onDoubleClick={() => navigate(`/dashboard/admin/ls-loans/${item}`)} style={{ cursor: 'pointer' }}>
            <div className="ad-ac-header">
              <div className="ad-ac-avatar"></div>
              <div className="ad-ac-info">
                <h4>Rafilla Shalwa</h4>
                <p>HRD & GA</p>
                <strong>Loan</strong>
              </div>
            </div>

            <div className="ad-ac-body">
              <div className="ad-col">
                <span className="lbl">Purpose</span>
                <span className="val" style={{ maxWidth: 160 }}>Kebutuhan mendadak untuk renovasi rumah</span>
              </div>
              <div className="ad-col">
                <span className="lbl">Term</span>
                <span className="val">6 Bulan</span>
              </div>
            </div>

            <div className="ad-ac-amount">
              <span className="lbl">Amount</span>
              <span className="val">Rp 5.000.000</span>
            </div>

            <div className="ad-ac-actions">
              <button className="ad-btn-reject">REJECT</button>
              <button className="ad-btn-approve">APPROVE</button>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="ad-charts-row">
        <div className="ad-chart-card">
          <div className="ad-chart-header">
            <h3>SHU</h3>
            <select className="ad-chart-select" defaultValue="1month">
              <option value="1month">Last 1 month</option>
              <option value="3month">Last 3 months</option>
              <option value="6month">Last 6 months</option>
              <option value="1year">Last 1 year</option>
              <option value="3year">Last 3 years</option>
            </select>
          </div>
          <div className="ad-chart-body">
            <Line data={shuData} options={chartOptions} />
          </div>
        </div>

        <div className="ad-chart-card">
          <div className="ad-chart-header">
            <h3>Net sales</h3>
            <select className="ad-chart-select" defaultValue="1month">
              <option value="1month">Last 1 month</option>
              <option value="3month">Last 3 months</option>
              <option value="6month">Last 6 months</option>
              <option value="1year">Last 1 year</option>
              <option value="3year">Last 3 years</option>
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
