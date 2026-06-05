import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiUrl } from '../../services/api';
import { X, Check, Banknote, CalendarCheck, Wallet } from 'lucide-react';
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

const getAuthHeaders = () => {
  try {
    const userStr = localStorage.getItem('user');
    if (!userStr) return {};
    const user = JSON.parse(userStr);
    const headers = {};
    if (user.member_id) headers['X-MEMBER-ID'] = String(user.member_id);
    if (user.email) headers['X-USER-EMAIL'] = String(user.email);
    return headers;
  } catch (e) {
    return {};
  }
};

const savingsApi = {
  getMemberProfile: () =>
    fetch(apiUrl('/my-profile/'), { headers: getAuthHeaders() }).then(r => r.json()),

  getWallets: () =>
    fetch(apiUrl('/my-savings/wallets/'), { headers: getAuthHeaders() }).then(r => r.json()),

  getPaidBills: () =>
    fetch(apiUrl('/my-savings/paid-bills/'), { headers: getAuthHeaders() }).then(r => r.json()),

  getWithdrawals: () =>
    fetch(apiUrl('/my-savings/withdrawals/'), { headers: getAuthHeaders() }).then(r => r.json()),

  getObligations: () =>
    fetch(apiUrl('/my-savings/obligations/'), { headers: getAuthHeaders() }).then(r => r.json()),

  getVoluntaryRequests: () =>
    fetch(apiUrl('/my-savings/voluntary-request/'), { headers: getAuthHeaders() }).then(r => r.json()),

  getPaymentSchedule: () =>
    fetch(apiUrl('/my-savings/payment-schedule/'), { headers: getAuthHeaders() }).then(r => r.json()),

  submitWithdrawal: (amount, notes) =>
    fetch(apiUrl('/my-savings/withdrawals/'), {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, getAuthHeaders()),
      body: JSON.stringify({ amount, notes }),
    }).then(r => r.json()),

  submitVoluntaryRequest: (requestedAmount) =>
    fetch(apiUrl('/my-savings/voluntary-request/'), {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, getAuthHeaders()),
      body: JSON.stringify({ requested_amount: requestedAmount }),
    }).then(r => r.json()),
};

const formatRp = (value) => {
  if (!value && value !== 0) return '0';
  return Number(value).toLocaleString('id-ID');
};

const MySaving = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('saving');
  const [showWithdrawForm, setShowWithdrawForm] = useState(false);

  const [memberProfile, setMemberProfile] = useState(null);
  const [wallets, setWallets] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [obligations, setObligations] = useState({ mandatory_amount: 0, voluntary_amount: 0 });
  const [expandVR, setExpandVR] = useState(false);
  const [expandApprovals, setExpandApprovals] = useState(false);

  const BILLS_PER_PAGE = 10;
  const [billsPage, setBillsPage] = useState(1);

  const [wdAmount, setWdAmount] = useState('');
  const [wdNotes, setWdNotes] = useState('');
  const [wdAgreed, setWdAgreed] = useState(false);
  const [wdLoading, setWdLoading] = useState(false);
  const [wdError, setWdError] = useState('');
  const [vrAmount, setVrAmount] = useState('');
  const [vrLoading, setVrLoading] = useState(false);
  const [vrError, setVrError] = useState('');
  const [vrMessage, setVrMessage] = useState('');
  const [showVoluntaryForm, setShowVoluntaryForm] = useState(false);
  const [voluntaryRequests, setVoluntaryRequests] = useState([]);
  const [loadingVR, setLoadingVR] = useState(true);
  const [paymentSchedule, setPaymentSchedule] = useState({ paid: [], upcoming: [] });
  const [loadingSchedule, setLoadingSchedule] = useState(true);

  const [paidBills, setPaidBills] = useState([]);
  const [loadingBills, setLoadingBills] = useState(true);
  const [loadingWallets, setLoadingWallets] = useState(true);
  const [loadingWd, setLoadingWd] = useState(true);
  const [loadingObligations, setLoadingObligations] = useState(true);

  useEffect(() => {
    savingsApi.getMemberProfile()
      .then(data => setMemberProfile(data))
      .catch(() => setMemberProfile(null));
  }, []);

  useEffect(() => {
    setLoadingWallets(true);
    savingsApi.getWallets()
      .then(data => setWallets(Array.isArray(data) ? data : []))
      .catch(() => setWallets([]))
      .finally(() => setLoadingWallets(false));
  }, []);

  useEffect(() => {
    setLoadingWd(true);
    savingsApi.getWithdrawals()
      .then(data => setWithdrawals(Array.isArray(data) ? data : []))
      .catch(() => setWithdrawals([]))
      .finally(() => setLoadingWd(false));
  }, []);

  useEffect(() => {
    setLoadingObligations(true);
    savingsApi.getObligations()
      .then(data => setObligations(data && typeof data === 'object' ? data : { mandatory_amount: 0, voluntary_amount: 0 }))
      .catch(() => setObligations({ mandatory_amount: 0, voluntary_amount: 0 }))
      .finally(() => setLoadingObligations(false));
  }, []);

  const fetchVoluntaryRequests = () => {
    setLoadingVR(true);
    savingsApi.getVoluntaryRequests()
      .then(data => setVoluntaryRequests(Array.isArray(data) ? data : []))
      .catch(() => setVoluntaryRequests([]))
      .finally(() => setLoadingVR(false));
  };

  useEffect(() => { fetchVoluntaryRequests(); }, []);

  useEffect(() => {
    setLoadingSchedule(true);
    savingsApi.getPaymentSchedule()
      .then(data => setPaymentSchedule({
        paid: Array.isArray(data?.paid) ? data.paid : [],
        upcoming: Array.isArray(data?.upcoming) ? data.upcoming : [],
      }))
      .catch(() => setPaymentSchedule({ paid: [], upcoming: [] }))
      .finally(() => setLoadingSchedule(false));
  }, []);

  useEffect(() => {
    setLoadingBills(true);
    savingsApi.getPaidBills()
      .then(data => setPaidBills(Array.isArray(data) ? data : []))
      .catch(() => setPaidBills([]))
      .finally(() => setLoadingBills(false));
  }, []);

  const getBalance = (isMandatory) => {
    const wallet = wallets.find(w => w.saving_type?.is_mandatory === isMandatory);
    return wallet ? formatRp(wallet.balance) : '0';
  };

  const getPokokBalance = () => {
    const wallet = wallets.find(w =>
      w.saving_type_id === 3 ||
      w.saving_type?.saving_type_name?.toLowerCase().includes('pokok')
    );
    return wallet ? formatRp(wallet.balance) : '0';
  };

  const getTotalBalance = () => {
    const total = wallets.reduce((acc, w) => acc + Number(w.balance || 0), 0);
    return formatRp(total);
  };

  const latestWithdrawal = withdrawals[0];
  const memberName = memberProfile?.full_name || memberProfile?.username || 'Member';
  const memberEmail = memberProfile?.email || '-';

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setShowWithdrawForm(false);
    setWdError('');
  };

  const handleWithdrawSubmit = async () => {
    setWdError('');
    if (!wdAmount || Number(wdAmount) < 50000) {
      setWdError('Minimum withdrawal is Rp 50.000');
      return;
    }
    if (!wdAgreed) {
      setWdError('Harap centang pernyataan persetujuan');
      return;
    }
    setWdLoading(true);
    try {
      const res = await savingsApi.submitWithdrawal(wdAmount, wdNotes);
      if (res.message) {
        setShowWithdrawForm(false);
        setWdAmount('');
        setWdNotes('');
        setWdAgreed(false);
        savingsApi.getWithdrawals().then(data => setWithdrawals(Array.isArray(data) ? data : []));
        savingsApi.getWallets().then(data => setWallets(Array.isArray(data) ? data : []));
      } else {
        setWdError(res.error || 'Gagal submit withdrawal');
      }
    } catch {
      setWdError('Terjadi kesalahan, coba lagi');
    } finally {
      setWdLoading(false);
    }
  };

  const handleVoluntarySubmit = async () => {
    setVrError('');
    setVrMessage('');
    const requested = Number(vrAmount);
    if (!requested || requested <= 0) {
      setVrError('Masukkan jumlah yang valid');
      return;
    }
    if (requested === Number(obligations.voluntary_amount)) {
      setVrError('Jumlah baru harus berbeda dari jumlah saat ini');
      return;
    }
    setVrLoading(true);
    try {
      const res = await savingsApi.submitVoluntaryRequest(requested);
      if (res.message) {
        setShowVoluntaryForm(false);
        setVrAmount('');
        setVrMessage(res.message);
        fetchVoluntaryRequests();
      } else {
        setVrError(res.error || 'Gagal mengajukan permintaan');
      }
    } catch {
      setVrError('Terjadi kesalahan, coba lagi');
    } finally {
      setVrLoading(false);
    }
  };

  const billsTotalPages = Math.ceil(paidBills.length / BILLS_PER_PAGE);
  const paginatedBills = paidBills.slice((billsPage - 1) * BILLS_PER_PAGE, billsPage * BILLS_PER_PAGE);

  const chartLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
  const chartData = {
    labels: chartLabels,
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
        data: withdrawals.slice(0, 6).map(w => Number(w.amount) || 0),
        borderColor: '#E11D48',
        backgroundColor: 'rgba(225, 29, 72, 0.05)',
        borderWidth: 2,
        borderDash: [5, 5],
        fill: true,
        tension: 0.4,
        pointRadius: 0,
      },
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
        callbacks: { label: (ctx) => `Rp ${formatRp(ctx.raw)}` },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#94A3B8', font: { size: 11 } } },
      y: { display: false, min: 0 },
    },
    interaction: { mode: 'nearest', axis: 'x', intersect: false },
  };

  const getBadgeClass = (statusCode) => {
    switch (statusCode?.toLowerCase()) {
      case 'pending': return 'pending';
      case 'approved':
      case 'paid':
      case 'completed': return 'complete';
      default: return 'pending';
    }
  };

  return (
    <div className="sv-page">
      <section className="sv-hero">
        <div>
          <span className="sv-hero-kicker">Member Savings</span>
          <h1 className="sv-hero-title">Saving</h1>
          <p className="sv-hero-subtitle">
            Monitor balances, voluntary requests, and payment schedules in one clean dashboard.
          </p>
        </div>
        <div className="sv-hero-profile">
          <span className="sv-hero-profile-label">Current Member</span>
          <strong>{memberName}</strong>
          <span>{memberEmail}</span>
        </div>
      </section>

      <section className="sv-stat-grid">
        <div className="sv-stat-card sv-stat-card--dark">
          <span className="sv-stat-label">Total Simpanan</span>
          <strong className="sv-stat-value">{loadingWallets ? '—' : `Rp ${getTotalBalance()}`}</strong>
          <span className="sv-stat-note">All cooperative savings combined</span>
        </div>
        <div className="sv-stat-card">
          <span className="sv-stat-label">Simpanan Wajib</span>
          <strong className="sv-stat-value">{loadingWallets ? '—' : `Rp ${getBalance(true)}`}</strong>
          <span className="sv-stat-note">Per month target: {loadingObligations ? '—' : `Rp ${formatRp(obligations.mandatory_amount)}`}</span>
        </div>
        <div className="sv-stat-card">
          <span className="sv-stat-label">Simpanan Sukarela</span>
          <strong className="sv-stat-value">{loadingWallets ? '—' : `Rp ${getBalance(false)}`}</strong>
          <span className="sv-stat-note">Current request: {loadingObligations ? '—' : `Rp ${formatRp(obligations.voluntary_amount)}`}</span>
        </div>
        <div className="sv-stat-card sv-stat-card--accent">
          <span className="sv-stat-label">Last Withdrawal</span>
          <strong className="sv-stat-value">{latestWithdrawal ? `Rp ${formatRp(latestWithdrawal.amount)}` : '—'}</strong>
          <span className="sv-stat-note">{latestWithdrawal?.status_name || latestWithdrawal?.status_code || 'No withdrawal yet'}</span>
        </div>
      </section>

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

      <h2 className="sv-section-title">
        {activeTab === 'saving' ? 'Saving Details' : 'Withdraws Voluntary Saving'}
      </h2>

      {/* ─── SAVING VIEW ─── */}
      {activeTab === 'saving' && (
        <>
          {/* Unified Savings Card */}
          <div className="sv-unified-card">
            <div className="sv-uc-bg-circle sv-uc-bg-circle--1" />
            <div className="sv-uc-bg-circle sv-uc-bg-circle--2" />
            <div className="sv-uc-bg-circle sv-uc-bg-circle--3" />

            <div className="sv-uc-top">
              <div className="sv-uc-top-left">
                <span className="sv-uc-label">Total Simpanan</span>
                <p className="sv-uc-total">
                  {loadingWallets ? '—' : `Rp ${getTotalBalance()}`}
                </p>
                <span className="sv-uc-member">
                  {memberProfile?.full_name || memberProfile?.username || '—'}
                </span>
              </div>
            </div>

            <div className="sv-uc-grid">
              {/* Pokok */}
              <div className="sv-uc-item">
                <div className="sv-uc-item-icon sv-uc-item-icon--purple">
                  <Banknote size={16} />
                </div>
                <p className="sv-uc-item-label">Simpanan Pokok</p>
                <p className="sv-uc-item-amount">
                  {loadingWallets ? '—' : `Rp ${getPokokBalance()}`}
                </p>
                <p className="sv-uc-item-sub">Iuran awal keanggotaan</p>
              </div>

              <div className="sv-uc-divider" />

              {/* Wajib */}
              <div className="sv-uc-item">
                <div className="sv-uc-item-icon sv-uc-item-icon--green">
                  <CalendarCheck size={16} />
                </div>
                <p className="sv-uc-item-label">Simpanan Wajib</p>
                <p className="sv-uc-item-amount">
                  {loadingWallets ? '—' : `Rp ${getBalance(true)}`}
                </p>
                <p className="sv-uc-item-sub">
                  /bln &nbsp;
                  {loadingObligations ? '—' : `Rp ${formatRp(obligations.mandatory_amount)}`}
                </p>
              </div>

              <div className="sv-uc-divider" />

              {/* Sukarela */}
              <div className="sv-uc-item">
                <div className="sv-uc-item-icon sv-uc-item-icon--blue">
                  <Wallet size={16} />
                </div>
                <p className="sv-uc-item-label">Simpanan Sukarela</p>
                <p className="sv-uc-item-amount">
                  {loadingWallets ? '—' : `Rp ${getBalance(false)}`}
                </p>
                <p className="sv-uc-item-sub">
                  /bln &nbsp;
                  {loadingObligations ? '—' : `Rp ${formatRp(obligations.voluntary_amount)}`}
                </p>
                <button
                  className="sv-uc-request-btn"
                  onClick={() => { setShowVoluntaryForm(v => !v); setVrError(''); setVrMessage(''); setVrAmount(''); }}
                >
                  {showVoluntaryForm ? 'Batal' : '+ Request Perubahan'}
                </button>
              </div>
            </div>

            {vrMessage && (
              <div className="sv-uc-success-msg">
                <Check size={14} /> {vrMessage}
              </div>
            )}
          </div>

          {/* Inline Voluntary Change Form */}
          {showVoluntaryForm && (
            <div className="sv-vr-form-inline">
              <div className="sv-vr-form-header">
                <div>
                  <h3 className="sv-vr-form-title">Request Perubahan Simpanan Sukarela</h3>
                  <p className="sv-vr-form-subtitle">
                    Nominal saat ini:{' '}
                    <strong>Rp {formatRp(obligations.voluntary_amount)},00</strong>
                  </p>
                </div>
                <button
                  className="sv-vr-close"
                  onClick={() => { setShowVoluntaryForm(false); setVrError(''); setVrAmount(''); }}
                >
                  <X size={16} />
                </button>
              </div>

              <div className="sv-vr-form-body">
                <div className="inp-group">
                  <label className="inp-label">Nominal Baru per Bulan (IDR)</label>
                  <div className="input-with-prefix">
                    <div className="prefix">Rp</div>
                    <input
                      type="number"
                      placeholder="0"
                      value={vrAmount}
                      onChange={e => setVrAmount(e.target.value)}
                      style={{ borderLeft: 'none', paddingLeft: 0 }}
                    />
                  </div>
                  <span className="inp-desc">Masukkan jumlah baru yang ingin diajukan.</span>
                </div>

                {vrError && (
                  <p className="sv-vr-error">{vrError}</p>
                )}

                <button
                  className="btn btn-navy sv-vr-submit"
                  onClick={handleVoluntarySubmit}
                  disabled={vrLoading}
                >
                  {vrLoading ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </div>
          )}

          {/* Voluntary Change Requests */}
          <div className="sv-card" style={{ marginTop: 20 }}>
            <div className="sv-card-header">
              <h3 className="sv-card-title">Voluntary Change Requests</h3>
            </div>
            {loadingVR ? (
              <p style={{ color: '#94a3b8', fontSize: 13, padding: '16px 0' }}>Loading...</p>
            ) : voluntaryRequests.length === 0 ? (
              <p style={{ color: '#94a3b8', fontSize: 13, padding: '16px 0' }}>
                Belum ada permintaan perubahan simpanan sukarela
              </p>
            ) : (
              <>
                {(expandVR ? voluntaryRequests : voluntaryRequests.slice(0, 2)).map((req) => (
                  <div key={req.id} style={{ padding: 16, borderBottom: '1px solid #E2E8F0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <div>
                        <strong>Rp {formatRp(req.requested_amount)},00</strong>
                        <p style={{ margin: '8px 0 0', color: '#64748B', fontSize: 13 }}>
                          Requested at {req.created_at ? new Date(req.created_at).toLocaleDateString('id-ID', {
                            day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                          }) : '-'}
                        </p>
                      </div>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        padding: '6px 12px', borderRadius: 999,
                        fontSize: 12, fontWeight: 700,
                        background: req.status === 'approved' ? '#D1FAE5' : req.status === 'rejected' ? '#FEE2E2' : '#FEF3C7',
                        color: req.status === 'approved' ? '#059669' : req.status === 'rejected' ? '#B91C1C' : '#D97706',
                      }}>
                        {req.status?.charAt(0).toUpperCase() + req.status?.slice(1)}
                      </span>
                    </div>
                    {req.status === 'rejected' && (
                      <p style={{ marginTop: 10, color: '#B91C1C', fontSize: 13 }}>
                        Alasan: {req.reject_reason || 'Tidak ada alasan'}
                      </p>
                    )}
                  </div>
                ))}
                {voluntaryRequests.length > 2 && (
                  <div style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <button
                      onClick={() => setExpandVR(!expandVR)}
                      style={{
                        background: 'none', border: 'none', color: '#2D6BE4', cursor: 'pointer',
                        fontSize: 13, fontWeight: 600, textDecoration: 'underline',
                      }}
                    >
                      {expandVR ? 'View Less' : `View More (${voluntaryRequests.length - 2} more)`}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="sv-content-grid">
            {/* Transaksi (paid bills) */}
            <div className="sv-card">
              <div className="sv-card-header">
                <h3 className="sv-card-title">Transaksi</h3>
                {!loadingBills && paidBills.length > 0 && (
                  <span style={{ fontSize: 12, color: '#94A3B8' }}>{paidBills.length} transaksi</span>
                )}
              </div>

              <div className="sv-table-wrapper">
                {loadingBills ? (
                  <p style={{ color: '#94A3B8', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Loading...</p>
                ) : paidBills.length === 0 ? (
                  <p style={{ color: '#94A3B8', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
                    Belum ada transaksi simpanan
                  </p>
                ) : (
                  <>
                    <table className="sv-table">
                      <thead>
                        <tr>
                          <th>No</th>
                          <th>Periode</th>
                          <th>Kategori Simpanan</th>
                          <th style={{ textAlign: 'right' }}>Nominal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedBills.map((bill, idx) => {
                          const periode = bill.bill_period_start
                            ? new Date(bill.bill_period_start).toLocaleDateString('id-ID', {
                                month: 'long', year: 'numeric',
                              })
                            : '-';
                          return (
                            <tr key={bill.id}>
                              <td style={{ color: '#94a3b8', fontSize: 12, width: 36 }}>
                                {(billsPage - 1) * BILLS_PER_PAGE + idx + 1}
                              </td>
                              <td className="sv-td-date">{periode}</td>
                              <td>{bill.saving_type_name || '-'}</td>
                              <td style={{ textAlign: 'right' }}>
                                <span className="sv-trx-amount credit">Rp {formatRp(bill.amount_due)}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {billsTotalPages > 1 && (
                      <div className="sv-pagination">
                        <span className="sv-pagination-info">
                          {(billsPage - 1) * BILLS_PER_PAGE + 1}–{Math.min(billsPage * BILLS_PER_PAGE, paidBills.length)} dari {paidBills.length}
                        </span>
                        <div className="sv-pagination-btns">
                          <button
                            className="sv-page-btn"
                            onClick={() => setBillsPage(p => Math.max(1, p - 1))}
                            disabled={billsPage === 1}
                          >
                            Prev
                          </button>
                          <button
                            className="sv-page-btn"
                            onClick={() => setBillsPage(p => Math.min(billsTotalPages, p + 1))}
                            disabled={billsPage === billsTotalPages}
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Payment Schedule */}
            <div className="sv-card">
              <div className="sv-card-header">
                <h3 className="sv-card-title">Jadwal Pembayaran</h3>
              </div>
              {loadingSchedule ? (
                <p style={{ color: '#94A3B8', fontSize: 13, padding: '16px 0' }}>Loading...</p>
              ) : (paymentSchedule.paid.length === 0 && paymentSchedule.upcoming.length === 0) ? (
                <p style={{ color: '#94A3B8', fontSize: 13, padding: '16px 0' }}>
                  Belum ada jadwal pembayaran
                </p>
              ) : (
                <div className="sv-timeline">
                  {paymentSchedule.paid.map((bill) => {
                    const period = new Date(bill.bill_period_start);
                    const label = period.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
                    const dueLabel = bill.paid_at
                      ? new Date(bill.paid_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })
                      : bill.due_date
                        ? new Date(bill.due_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })
                        : '-';
                    return (
                      <div key={bill.id} className="sv-tl-item paid">
                        <div className="sv-tl-icon"><Check size={12} strokeWidth={3} /></div>
                        <div className="sv-tl-content">
                          <span className="sv-tl-status">Paid</span>
                          <h4 className="sv-tl-title">{label}</h4>
                          <p className="sv-tl-desc">{dueLabel} — Rp {formatRp(bill.amount_due)}</p>
                        </div>
                      </div>
                    );
                  })}
                  {paymentSchedule.upcoming.map((bill) => {
                    const period = new Date(bill.bill_period_start);
                    const label = period.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
                    const dueLabel = bill.due_date
                      ? new Date(bill.due_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })
                      : '-';
                    return (
                      <div key={bill.id} className="sv-tl-item upcoming">
                        <div className="sv-tl-icon"></div>
                        <div className="sv-tl-content">
                          <span className="sv-tl-status">Upcoming</span>
                          <h4 className="sv-tl-title">{label}</h4>
                          <p className="sv-tl-desc">{dueLabel} — Rp {formatRp(bill.amount_due)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ─── WITHDRAWS VIEW ─── */}
      {activeTab === 'withdraws' && (
        <div className="wd-layout wd-layout-refactored">
          <div className="wd-left">
            <div className="sv-banner navy">
              <div className="sv-banner-left">
                <span className="sv-banner-title">Current Balance Voluntary Saving</span>
                <h2 className="sv-banner-amount">
                  {loadingWallets ? '...' : `RP ${getBalance(false)},00`}
                </h2>
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
                  <p style={{ fontSize: 12, color: '#64748B', margin: '4px 0 0' }}>
                    Last 6 Months Performance
                  </p>
                </div>
                <span className="appr-badge complete">+12% Overall</span>
              </div>
              <div style={{ position: 'relative', height: '240px', width: '100%' }}>
                <Line data={chartData} options={chartOptions} />
              </div>
            </div>
          </div>

          {showWithdrawForm && (
            <div className="sv-card slide-in-right wd-form-panel">
              <div className="sv-card-header">
                <h3 className="sv-card-title">Withdraw Amount</h3>
                <button
                  onClick={() => { setShowWithdrawForm(false); setWdError(''); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="inp-group" style={{ marginBottom: 16 }}>
                <label className="inp-label">AMOUNT (IDR)</label>
                <div className="input-with-prefix">
                  <div className="prefix" style={{ background: '#fff', borderRight: 'none', color: '#94A3B8' }}>Rp</div>
                  <input
                    type="number"
                    placeholder="0"
                    value={wdAmount}
                    onChange={e => setWdAmount(e.target.value)}
                    style={{ borderLeft: 'none', paddingLeft: 0 }}
                  />
                </div>
                <span className="inp-desc" style={{ marginTop: 6 }}>
                  Minimum deposit amount is Rp 50.000,00
                </span>
              </div>

              <div className="inp-group">
                <label className="inp-label">NOTES</label>
                <textarea
                  className="prof-input"
                  placeholder="Reason for withdrawal..."
                  value={wdNotes}
                  onChange={e => setWdNotes(e.target.value)}
                  style={{ minHeight: 120 }}
                />
              </div>

              <div style={{ display: 'flex', gap: 12, margin: '20px 0' }}>
                <input
                  type="checkbox"
                  id="wd-agree"
                  checked={wdAgreed}
                  onChange={e => setWdAgreed(e.target.checked)}
                  style={{ marginTop: 4, cursor: 'pointer' }}
                />
                <label htmlFor="wd-agree" style={{ fontSize: 12, color: '#475569', lineHeight: 1.5, cursor: 'pointer' }}>
                  I hereby declare that the information I have provided is correct, and I am submitting
                  my request to withdraw my voluntary savings in a conscious state and without coercion.
                </label>
              </div>

              {wdError && (
                <p style={{ color: '#E11D48', fontSize: 12, marginBottom: 12 }}>{wdError}</p>
              )}

              <button
                className="btn btn-navy"
                style={{ width: '100%', padding: '14px', borderRadius: 10 }}
                onClick={handleWithdrawSubmit}
                disabled={wdLoading}
              >
                {wdLoading ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          )}

          <div className="wd-left-bottom wd-left" style={{ gridColumn: '1 / 2' }}>
            <h3 style={{ fontSize: 18, margin: '8px 0', fontFamily: 'Syne', fontWeight: 700 }}>
              Approvals
            </h3>
            <div className="appr-list">
              {loadingWd ? (
                <p style={{ color: '#94A3B8', fontSize: 13 }}>Loading...</p>
              ) : withdrawals.length === 0 ? (
                <p style={{ color: '#94A3B8', fontSize: 13 }}>Belum ada riwayat penarikan</p>
              ) : (
                <>
                  {(expandApprovals ? withdrawals : withdrawals.slice(0, 3)).map((w) => (
                    <div
                      className="appr-item appr-item--clickable"
                      key={w.id}
                      onClick={() => navigate(`/dashboard/saving/withdrawal/${w.id}`, { state: { withdrawal: w } })}
                    >
                      <p>
                        {w.notes || 'Tidak ada catatan'}
                        <br />
                        <strong>Rp {formatRp(w.amount)},00</strong>
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className={`appr-badge ${getBadgeClass(w.status_code)}`}>
                          {w.status_name || w.status_code}
                        </div>
                        <span style={{ color: '#94A3B8', fontSize: 14 }}>›</span>
                      </div>
                    </div>
                  ))}
                  {withdrawals.length > 3 && (
                    <div style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <button
                        onClick={() => setExpandApprovals(!expandApprovals)}
                        style={{
                          background: 'none', border: 'none', color: '#2D6BE4', cursor: 'pointer',
                          fontSize: 13, fontWeight: 600, textDecoration: 'underline',
                        }}
                      >
                        {expandApprovals ? 'View Less' : `View More (${withdrawals.length - 3} more)`}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MySaving;
