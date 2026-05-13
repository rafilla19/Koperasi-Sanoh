import React from 'react';
import { NavLink } from 'react-router-dom';
import { Calendar, Download, TrendingUp, DollarSign } from 'lucide-react';
import './SHUManagement.css';

const SHUDashboard = () => {
  return (
    <div className="shu-container">
      {/* SHU Nav Tabs */}
      <div className="shu-nav-tabs">
        <NavLink to="/dashboard/admin/shu-dashboard" end className={({ isActive }) => `shu-tab ${isActive ? 'active' : ''}`}>
          Member SHU
        </NavLink>
        <NavLink to="/dashboard/admin/shu-income" className={({ isActive }) => `shu-tab ${isActive ? 'active' : ''}`}>
          Income Transaction
        </NavLink>
        <NavLink to="/dashboard/admin/shu-outcome" className={({ isActive }) => `shu-tab ${isActive ? 'active' : ''}`}>
          Outcome Transaction
        </NavLink>
      </div>

      {/* Header */}
      <div className="shu-header">
        <div>
          <h1 className="shu-page-title">Halaman Utama SHU</h1>
          <p className="shu-page-subtitle">Report for the 2025 Financial Year</p>
        </div>
        <div className="shu-header-actions">
          <button className="shu-btn-year">
            <Calendar size={16} />
            2025
          </button>
          <button className="shu-btn-icon">
            <Download size={18} />
          </button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="shu-overview-cards">
        <div className="shu-card blue-theme">
          <DollarSign className="shu-card-bg-icon" size={80} strokeWidth={1} />
          <div className="shu-card-title">Total Pendapatan</div>
          <div className="shu-card-value">
            <small>Rp</small>106.700.000
          </div>
          <div className="shu-card-growth up">
            <TrendingUp size={14} /> +12% vs 2024
          </div>
        </div>

        <div className="shu-card white-theme">
          <div className="shu-card-title">Total Pengeluaran operasi</div>
          <div className="shu-card-value">
            <small>Rp</small>78.000.000
          </div>
          <div className="shu-card-growth down">
            <TrendingUp size={14} /> 5% vs 2024
          </div>
        </div>

        <div className="shu-card blue-theme">
          <DollarSign className="shu-card-bg-icon" size={80} strokeWidth={1} />
          <div className="shu-card-title">Sisa Hasil Usaha</div>
          <div className="shu-card-value">
            <small>Rp</small>28.700.000
          </div>
          <div className="shu-card-growth up">
            <TrendingUp size={14} /> +12% vs 2024
          </div>
        </div>
      </div>

      {/* Allocation of SHU */}
      <div className="shu-section-title">Allocation of SHU</div>
      <div className="shu-allocation-grid">
        <div className="shu-alloc-card">
          <div className="shu-alloc-card-top">
            <span className="shu-alloc-label">Jasa Modal</span>
            <span className="shu-alloc-badge">20%</span>
          </div>
          <div className="shu-alloc-value">
            <small>Rp</small> 5.740.000
          </div>
          <div className="shu-alloc-bar-container">
            <div className="shu-alloc-bar" style={{ width: '20%' }}></div>
          </div>
        </div>

        <div className="shu-alloc-card">
          <div className="shu-alloc-card-top">
            <span className="shu-alloc-label">Jasa Usaha</span>
            <span className="shu-alloc-badge">25%</span>
          </div>
          <div className="shu-alloc-value">
            <small>Rp</small> 7.175.000
          </div>
          <div className="shu-alloc-bar-container">
            <div className="shu-alloc-bar" style={{ width: '25%' }}></div>
          </div>
        </div>

        <div className="shu-alloc-card">
          <div className="shu-alloc-card-top">
            <span className="shu-alloc-label">Dana Cadangan</span>
            <span className="shu-alloc-badge">50%</span>
          </div>
          <div className="shu-alloc-value">
            <small>Rp</small> 14.350.000
          </div>
          <div className="shu-alloc-bar-container">
            <div className="shu-alloc-bar" style={{ width: '50%' }}></div>
          </div>
        </div>

        <div className="shu-alloc-card">
          <div className="shu-alloc-card-top">
            <span className="shu-alloc-label">Dana Sosial</span>
            <span className="shu-alloc-badge">5%</span>
          </div>
          <div className="shu-alloc-value">
            <small>Rp</small> 1.435.000
          </div>
          <div className="shu-alloc-bar-container">
            <div className="shu-alloc-bar" style={{ width: '5%' }}></div>
          </div>
        </div>
      </div>

      {/* Total Simpanan Anggota */}
      <div className="shu-section-title">
        Total Simpanan Anggota
        {/* <span className="shu-link-detail">Lihat Detail</span> */}
      </div>
      <div className="shu-savings-card">
        <div className="shu-savings-grid">
          <div className="shu-saving-item">
            <div className="shu-saving-label">Simpanan Wajib</div>
            <div className="shu-saving-value">Rp 1.000.000</div>
            <div className="shu-alloc-bar-container">
              <div className="shu-alloc-bar" style={{ width: '15%', background: '#3B82F6' }}></div>
            </div>
          </div>

          <div className="shu-saving-item">
            <div className="shu-saving-label">Simpanan Sukarela</div>
            <div className="shu-saving-value">Rp 4.950.000</div>
            <div className="shu-alloc-bar-container">
              <div className="shu-alloc-bar" style={{ width: '85%', background: '#3B82F6' }}></div>
            </div>
          </div>
        </div>

        <div className="shu-savings-total-row">
          <span>Total Simpanan</span>
          <span className="val">Rp 5.950.000</span>
        </div>
      </div>
    </div>
  );
};

export default SHUDashboard;
