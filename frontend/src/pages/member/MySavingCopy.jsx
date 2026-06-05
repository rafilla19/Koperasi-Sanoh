import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check } from 'lucide-react';
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
import './MySaving.css';

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

const MySaving = () => {
  const [activeTab, setActiveTab] = useState('saving'); // 'saving' or 'withdraws'
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showWithdrawForm, setShowWithdrawForm] = useState(false);

  // Toggle sub-tabs
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setShowWithdrawForm(false);
  };

  // Chart data setup for "Savings Growth" showing 2 lines (Saving & Withdrawals)
  const chartData = {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    datasets: [
      {
        label: 'Saving',
        data: [1200000, 1900000, 1500000, 2200000, 3100000, 2800000],
        borderColor: '#2D6BE4',
        backgroundColor: 'rgba(45, 107, 228, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: 0,
      },
      {
        label: 'Withdrawals',
        data: [0, 500000, 200000, 800000, 0, 400000],
        borderColor: '#E11D48',
        backgroundColor: 'rgba(225, 29, 72, 0.05)',
        borderWidth: 2,
        borderDash: [5, 5],
        fill: true,
        tension: 0.4,
        pointRadius: 0,
      }
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: '#0A1628',
        callbacks: {
          label: (ctx) => `Rp ${(ctx.raw).toLocaleString('id-ID')}`
        }
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#94A3B8', font: { size: 11 } } },
      y: { display: false, min: 0 } // Hide Y axis like design
    },
    interaction: { mode: 'nearest', axis: 'x', intersect: false }
  };

  return (
    <div className="sv-page">
      {/* TABS */}
      <div className="sv-tabs">
        <button 
          className={`sv-tab ${activeTab === 'saving' ? 'active' : ''}`}
          onClick={() => handleTabChange('saving')}
        >
          Saving
        </button>
        <button 
          className={`sv-tab ${activeTab === 'withdraws' ? 'active' : ''}`}
          onClick={() => handleTabChange('withdraws')}
        >
          Withdraws
        </button>
      </div>

      <h1 className="sv-title">{activeTab === 'saving' ? 'Saving' : 'Withdraws Voluntary Saving'}</h1>

      {/* ─── SAVING VIEW ─── */}
      {activeTab === 'saving' && (
        <>
          <div className="sv-banner-grid">
            {/* Voluntary Balance */}
            <div className="sv-banner navy">
              <div className="sv-banner-left">
                <span className="sv-banner-title">Current Balance Voluntary Saving</span>
                <h2 className="sv-banner-amount">RP 700.000,00</h2>
              </div>
            </div>

            {/* Mandatory Balance */}
            <div className="sv-banner green">
              <div className="sv-banner-left">
                <span className="sv-banner-title">Current Balance Mandatory Saving</span>
                <h2 className="sv-banner-amount">RP 700.000,00</h2>
              </div>
              <div className="sv-banner-right">
                <button className="btn-banner" onClick={() => setShowPaymentModal(true)}>
                  $ Pay Saving
                </button>
                <span className="sv-banner-desc">Next saving on Dec 23, 2025</span>
              </div>
            </div>
          </div>

          <div className="sv-content-grid">
            {/* Transactions */}
            <div className="sv-card">
              <div className="sv-card-header">
                <h3 className="sv-card-title">Transaction</h3>
                <div className="sv-filters">
                  <input type="date" className="sv-date-input" defaultValue="2025-12-01" />
                  <span style={{color: '#94A3B8'}}>-</span>
                  <input type="date" className="sv-date-input" defaultValue="2025-12-31" />
                </div>
              </div>
              
              <div className="sv-table-wrapper">
                <table className="sv-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Saving Category</th>
                      <th>Cost</th>
                      <th>Payment</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>20-12-<br/>2025</td>
                      <td>Mandatory</td>
                      <td>Rp 100.000,00</td>
                      <td>0</td>
                    </tr>
                    <tr>
                      <td>20-12-<br/>2025</td>
                      <td>Mandatory</td>
                      <td>0</td>
                      <td>Rp 100.000,00</td>
                    </tr>
                    <tr>
                      <td>20-12-<br/>2025</td>
                      <td>Voluntry</td>
                      <td>Rp 50.000,00</td>
                      <td>0</td>
                    </tr>
                    <tr>
                      <td>20-12-<br/>2025</td>
                      <td>Voluntry</td>
                      <td>0</td>
                      <td>Rp 50.000,00</td>
                    </tr>
                    <tr>
                      <td className="text-red">20-12-<br/>2025</td>
                      <td className="text-red">Voluntry<br/>Withdraws</td>
                      <td className="text-red">Rp<br/>(-50.000,00)</td>
                      <td className="text-red">Rp<br/>(-50.000,00)</td>
                    </tr>
                    <tr className="total-row">
                      <td colSpan="2">Total</td>
                      <td>Rp 150.000,00</td>
                      <td className="text-red">Rp 150.000,00</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Payment Schedule */}
            <div className="sv-card">
              <div className="sv-card-header">
                <h3 className="sv-card-title">Payment Schedule</h3>
                <a href="#" className="sv-card-link">View All</a>
              </div>
              <div className="sv-timeline">
                <div className="sv-tl-item paid">
                  <div className="sv-tl-icon"><Check size={12} strokeWidth={3} /></div>
                  <div className="sv-tl-content">
                    <span className="sv-tl-status">Paid</span>
                    <h4 className="sv-tl-title">October 2026</h4>
                    <p className="sv-tl-desc">Oct 23 — Rp 100.000</p>
                  </div>
                </div>
                <div className="sv-tl-item upcoming">
                  <div className="sv-tl-icon"></div>
                  <div className="sv-tl-content">
                    <span className="sv-tl-status">Upcoming</span>
                    <h4 className="sv-tl-title">October 2026</h4>
                    <p className="sv-tl-desc">Oct 23 — Rp 100.000</p>
                  </div>
                </div>
                <div className="sv-tl-item scheduled">
                  <div className="sv-tl-icon"></div>
                  <div className="sv-tl-content">
                    <span className="sv-tl-status">Scheduled</span>
                    <h4 className="sv-tl-title">October 2026</h4>
                    <p className="sv-tl-desc">Oct 23 — Rp 100.000</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ─── WITHDRAWS VIEW ─── */}
      {activeTab === 'withdraws' && (
        <div className="wd-layout wd-layout-refactored">
          {/* Top Left (Banner & Chart) */}
          <div className="wd-left">
            <div className="sv-banner navy">
              <div className="sv-banner-left">
                <span className="sv-banner-title">Current Balance Voluntary Saving</span>
                <h2 className="sv-banner-amount">RP 500.000,00</h2>
              </div>
              <div className="sv-banner-right">
                <button 
                  className="btn-banner" 
                  onClick={() => setShowWithdrawForm(true)}
                  style={{ display: showWithdrawForm ? 'none' : 'inline-flex' }}
                >
                  $ Withdraw
                </button>
              </div>
            </div>

            <div className="sv-card">
              <div className="sv-card-header">
                <div>
                  <h3 className="sv-card-title">Savings Growth</h3>
                  <p style={{fontSize: 12, color: '#64748B', margin: '4px 0 0'}}>Last 6 Months Performance</p>
                </div>
                <span className="appr-badge complete">+12% Overall</span>
              </div>
              <div style={{ position: 'relative', height: '240px', width: '100%' }}>
                <Line data={chartData} options={chartOptions} />
              </div>
            </div>
          </div>

          {/* Right Side Withdraw Form (Appears when clicked) */}
          {showWithdrawForm && (
            <div className="sv-card slide-in-right wd-form-panel">
              <div className="sv-card-header">
                <h3 className="sv-card-title">Withdraw Amount</h3>
                <button onClick={() => setShowWithdrawForm(false)} style={{background: 'none', border:'none', cursor:'pointer', color:'#94A3B8'}}>
                  <X size={18} />
                </button>
              </div>
              
              <div className="inp-group" style={{ marginBottom: 16 }}>
                <label className="inp-label">AMOUNT (IDR)</label>
                <div className="input-with-prefix">
                  <div className="prefix" style={{background: '#fff', borderRight: 'none', color: '#94A3B8'}}>Rp</div>
                  <input type="number" placeholder="0" style={{borderLeft: 'none', paddingLeft: 0}} />
                </div>
                <span className="inp-desc" style={{marginTop: 6}}>Minimum deposit amount is Rp 50.000,00</span>
              </div>

              <div className="inp-group">
                <label className="inp-label">NOTES</label>
                <textarea className="prof-input" placeholder="Reason for withdrawal..." style={{minHeight: 120}}></textarea>
              </div>

              <div style={{display:'flex', gap: 12, margin: '20px 0'}}>
                <input type="checkbox" id="wd-agree" style={{marginTop: 4, cursor:'pointer'}} />
                <label htmlFor="wd-agree" style={{fontSize: 12, color: '#475569', lineHeight: 1.5, cursor: 'pointer'}}>
                  I hereby declare that the information I have provided is correct, and I am submitting my request to withdraw my voluntary savings in a conscious state and without coercion.
                </label>
              </div>

              <button className="btn btn-navy" style={{width: '100%', padding: '14px', borderRadius: 10}}>Submit</button>
            </div>
          )}

          {/* Bottom Left (Approvals) */}
          <div className="wd-left-bottom wd-left" style={{ gridColumn: '1 / 2' }}>
            <h3 style={{fontSize: 18, margin: '8px 0', fontFamily: 'Syne', fontWeight: 700}}>Approvals</h3>
            <div className="appr-list">
              <div className="appr-item">
                <p>Kebutuhan mendadak untuk renovasi rumah<br/><strong>8.000.000</strong></p>
                <div className="appr-badge pending">Pending</div>
              </div>
              <div className="appr-item">
                <p>Kebutuhan mendadak untuk renovasi rumah<br/><strong>8.000.000</strong></p>
                <div className="appr-badge complete">Complete</div>
              </div>
            </div>
          </div>
        </div>
      )}



      {/* ─── PAYMENT MODAL ─── */}
      {showPaymentModal && createPortal(
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowPaymentModal(false)}>
          <div className="closure-modal" style={{maxWidth: 480}}>
            <div className="cm-header" style={{paddingBottom: 0}}>
              <h2 style={{justifyContent: 'center', display: 'flex', width: '100%'}}>Payment Saving</h2>
              <button className="cm-close" onClick={() => setShowPaymentModal(false)} style={{position: 'absolute', right: 24, top: 24}}>
                <X size={16} />
              </button>
            </div>
            <div className="cm-body" style={{paddingTop: 16}}>
              <div className="inp-group">
                <label className="inp-label">PAYMENT METHOD</label>
                <select className="prof-input">
                  <option>Bank Transfer</option>
                  <option>E-Wallet</option>
                  <option>Virtual Account</option>
                </select>
              </div>
              <div className="pay-modal-inner">
                <div className="pay-row">
                  <span>Mandatory Saving</span>
                  <strong>Rp 50.000,00</strong>
                </div>
                <div className="pay-row">
                  <span>Voluntary Saving</span>
                  <strong>Rp 50.000,00</strong>
                </div>
              </div>
              <button className="btn btn-navy" style={{width: '100%', padding: '14px', borderRadius: 10}}>Payment</button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
};

export default MySaving;
