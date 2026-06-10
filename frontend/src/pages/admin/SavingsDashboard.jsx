import { useState, useEffect, useRef } from "react";
import { apiUrl, getAuthHeaders } from "../../services/api";
import "./SavingsDashboard.css";
import SavingsTabNav from "../../components/SavingsTabNav";
import {
  Chart as ChartJS,
  ArcElement, Tooltip, Legend,
  CategoryScale, LinearScale, BarElement,
} from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);


export default function SavingsDashboard() {
  const [amount, setAmount] = useState(0);
  const [tempAmount, setTempAmount] = useState(0);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loadingAmount, setLoadingAmount] = useState(true);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [updateMsg, setUpdateMsg] = useState('');
  const [showUpdateConfirm, setShowUpdateConfirm] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(true);
  const [trendPeriod, setTrendPeriod] = useState(6);
  const [approveModal, setApproveModal] = useState(null);
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState(null);
  const approveGuard = useRef(false);
  const rejectGuard  = useRef(false);

  const formatRupiah = (value) => "Rp " + Number(value).toLocaleString("id-ID");

  // Fetch current mandatory amount
  useEffect(() => {
    fetch(apiUrl('/admin/savings/mandatory-amount/'))
      .then(r => r.json())
      .then(data => {
        const val = Number(data.current_amount) || 0;
        setAmount(val);
        setTempAmount(val);
      })
      .catch(() => {})
      .finally(() => setLoadingAmount(false));
  }, []);

  // Fetch pending voluntary change requests
  const fetchPendingRequests = () => {
    setLoadingRequests(true);
    fetch(apiUrl('/admin/savings/voluntary-requests/?status=pending'))
      .then(r => r.json())
      .then(data => setPendingRequests(Array.isArray(data) ? data : []))
      .catch(() => setPendingRequests([]))
      .finally(() => setLoadingRequests(false));
  };

  useEffect(() => { fetchPendingRequests(); }, []);

  useEffect(() => {
    setLoadingAnalytics(true);
    fetch(apiUrl(`/admin/savings/analytics/?months=${trendPeriod}`), { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(data => setAnalytics(data))
      .catch(() => setAnalytics(null))
      .finally(() => setLoadingAnalytics(false));
  }, [trendPeriod]);

  const handleChange = (e) => {
    const value = e.target.value.replace(/\D/g, "");
    setTempAmount(value ? Number(value) : 0);
  };

  const handleDiscard = () => {
    setTempAmount(amount);
    setUpdateMsg('');
  };

  const handleUpdate = async () => {
    setUpdating(true);
    setUpdateMsg('');
    try {
      const res = await fetch(apiUrl('/admin/savings/mandatory-amount/'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_amount: tempAmount }),
      }).then(r => r.json());

      if (res.new_amount !== undefined) {
        setAmount(Number(res.new_amount));
        setUpdateMsg('✓ Jumlah simpanan wajib berhasil diperbarui untuk semua member');
      } else {
        setUpdateMsg(res.error || 'Gagal memperbarui');
      }
    } catch {
      setUpdateMsg('Terjadi kesalahan, coba lagi');
    } finally {
      setUpdating(false);
    }
  };

  const handleApprove = (id) => {
    approveGuard.current = true;
    setTimeout(() => { approveGuard.current = false; }, 300);
    setApproveModal(id);
  };

  const doApprove = async () => {
    const id = approveModal;
    setApproveModal(null);
    try {
      const res = await fetch(apiUrl(`/admin/savings/voluntary-requests/${id}/approve/`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).then(r => r.json());
      setFeedbackMsg({ type: 'success', text: res.message || 'Pengajuan berhasil disetujui' });
      fetchPendingRequests();
    } catch {
      setFeedbackMsg({ type: 'error', text: 'Gagal approve, coba lagi' });
    }
  };

  const handleReject = (id) => {
    rejectGuard.current = true;
    setTimeout(() => { rejectGuard.current = false; }, 300);
    setRejectReason('');
    setRejectModal(id);
  };

  const doReject = async () => {
    const id = rejectModal;
    setRejectModal(null);
    try {
      const res = await fetch(apiUrl(`/admin/savings/voluntary-requests/${id}/reject/`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reject_reason: rejectReason }),
      }).then(r => r.json());
      setFeedbackMsg({ type: 'success', text: res.message || 'Pengajuan berhasil ditolak' });
      fetchPendingRequests();
    } catch {
      setFeedbackMsg({ type: 'error', text: 'Gagal reject, coba lagi' });
    }
  };

  const donutData = analytics ? {
    labels: ['Simp. Wajib', 'Simp. Sukarela', 'Simp. Pokok'],
    datasets: [{
      data: [analytics.total_wajib, analytics.total_sukarela, analytics.total_pokok],
      backgroundColor: ['#3b82f6', '#f59e0b', '#9333ea'],
      borderWidth: 2,
      borderColor: '#fff',
      hoverOffset: 8,
    }],
  } : null;

  const barData = analytics?.monthly_trend ? {
    labels: analytics.monthly_trend.map(m => m.month),
    datasets: [
      { label: 'Simp. Wajib', data: analytics.monthly_trend.map(m => m.wajib), backgroundColor: 'rgba(59,130,246,0.85)', borderRadius: 6, borderSkipped: false },
      { label: 'Simp. Sukarela', data: analytics.monthly_trend.map(m => m.sukarela), backgroundColor: 'rgba(245,158,11,0.85)', borderRadius: 6, borderSkipped: false },
      { label: 'Simp. Pokok', data: analytics.monthly_trend.map(m => m.pokok), backgroundColor: 'rgba(147,51,234,0.85)', borderRadius: 6, borderSkipped: false },
    ],
  } : null;

  const donutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '72%',
    plugins: {
      legend: { position: 'bottom', labels: { usePointStyle: true, padding: 14, font: { size: 12 } } },
      tooltip: { callbacks: { label: ctx => ` Rp ${Number(ctx.parsed).toLocaleString('id-ID')}` } },
    },
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', labels: { usePointStyle: true, padding: 14, font: { size: 12 } } },
      tooltip: { callbacks: { label: ctx => ` Rp ${Number(ctx.parsed.y).toLocaleString('id-ID')}` } },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#64748b' } },
      y: {
        grid: { color: '#f1f5f9' },
        border: { display: false },
        ticks: {
          font: { size: 11 }, color: '#64748b',
          callback: v => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(0)}Jt` : v.toLocaleString('id-ID'),
        },
      },
    },
  };

  return (
    <div className="savings-container">
      {/* HEADER */}
      <div className="savings-header">
        <h2>Savings Dashboard</h2>
        <SavingsTabNav />
      </div>

      {/* MONTHLY MANDATORY */}
      <div className="mandatory-section">
        <div className="mandatory-card">
          <div className="rate-box">
            <div className="placeholder"></div>
            <p className="amount">{loadingAmount ? '...' : formatRupiah(amount)}</p>
            <span>CURRENT RATE</span>
          </div>

          <div className="mandatory-form">
            <h3>Monthly Mandatory Amount</h3>
            <p>Define amount mandatory for all members</p>

            <label>Amount (Rupiah)</label>
            <input
              type="text"
              value={formatRupiah(tempAmount)}
              onChange={handleChange}
              disabled={updating}
            />

            {updateMsg && (
              <p style={{
                fontSize: 12,
                marginTop: 8,
                color: updateMsg.startsWith('✓') ? '#16a34a' : '#dc2626',
              }}>
                {updateMsg}
              </p>
            )}

            <div className="actions">
              <button className="btn primary" onClick={() => setShowUpdateConfirm(true)} disabled={updating}>
                {updating ? 'Menyimpan...' : 'Update All Members'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* SAVINGS ANALYTICS */}
      <div className="analytics-section">
        <div className="analytics-header">
          <h3>Savings Analytics</h3>
          <span className="analytics-badge">Overview</span>
        </div>

        <div className="analytics-cards">
          {[
            // { label: 'Total Anggota', key: 'total_members', icon: '👥', bg: '#dbeafe', color: '#2563eb', format: (v) => v },
            { label: 'Total Simp. Wajib', key: 'total_wajib', icon: '💳', bg: '#dcfce7', color: '#16a34a', format: formatRupiah },
            { label: 'Total Simp. Sukarela', key: 'total_sukarela', icon: '📊', bg: '#fef9c3', color: '#ca8a04', format: formatRupiah },
            { label: 'Total Simp. Pokok', key: 'total_pokok', icon: '🏦', bg: '#f3e8ff', color: '#9333ea', format: formatRupiah },
            { label: 'Total Penarikan', key: 'total_withdrawal', icon: '📤', bg: '#fee2e2', color: '#dc2626', format: formatRupiah },
            { label: 'Balance Saving Used', key: 'remaining_saving_used', icon: '💸', bg: '#eef2ff', color: '#1e40af', format: formatRupiah },
          ].map(({ label, key, icon, bg, color, format }) => (
            <div className="analytics-card" key={key}>
              <span className="analytics-icon" style={{ background: bg, color }}>{icon}</span>
              <div>
                <p className="analytics-label">{label}</p>
                <p className="analytics-value">
                  {loadingAnalytics ? '...' : analytics ? format(analytics[key] ?? 0) : '—'}
                </p>
              </div>
            </div>
          ))}
        </div>

        {loadingAnalytics && (
          <div className="analytics-loading">Memuat data analitik...</div>
        )}

        {analytics && !loadingAnalytics && (
          <div className="analytics-charts">
            <div className="chart-card">
              <h4>Distribusi Simpanan</h4>
              <div className="chart-donut-wrapper">
                {donutData && <Doughnut data={donutData} options={donutOptions} />}
              </div>
            </div>

            <div className="chart-card">
              <div className="chart-card-header">
                <h4>Tren Bulanan</h4>
                <div className="trend-tabs">
                  {[3, 6, 12].map(n => (
                    <button
                      key={n}
                      className={`trend-tab${trendPeriod === n ? ' active' : ''}`}
                      onClick={() => setTrendPeriod(n)}
                    >
                      {n}M
                    </button>
                  ))}
                </div>
              </div>
              <div className="chart-bar-wrapper">
                {barData && <Bar data={barData} options={barOptions} />}
              </div>
            </div>
          </div>
        )}

        {!analytics && !loadingAnalytics && (
          <p className="analytics-empty">Data analitik akan tersedia setelah backend dikonfigurasi.</p>
        )}
      </div>

      {/* PENDING APPROVALS */}
      <div className="pending-section">
        <div className="pending-header">
          <div>
            <h3>Pending Approvals</h3>
            <p className="pending-subtitle">Pengajuan perubahan jumlah simpanan sukarela dari anggota</p>
          </div>
          {!loadingRequests && (
            <span style={{ fontSize: 13, color: '#64748b' }}>
              {pendingRequests.length} pengajuan
            </span>
          )}
        </div>

        <div className="card-list">
          {loadingRequests ? (
            <p style={{ color: '#94a3b8', fontSize: 13, padding: '16px 0' }}>Memuat...</p>
          ) : pendingRequests.length === 0 ? (
            <p style={{ color: '#94a3b8', fontSize: 13, padding: '16px 0' }}>
              Tidak ada pengajuan yang menunggu persetujuan
            </p>
          ) : (
            pendingRequests.map((req) => (
              <div className="approval-card" key={req.id}>
                <div className="user-info">
                  <div className="avatar"></div>
                  <div>
                    <h4>{req.member_name}</h4>
                    <span>{req.member_nik || '-'}</span>
                  </div>
                </div>

                <p className="highlight">Changed Voluntary Saving Amount</p>

                <div className="details">
                  <div>
                    <p>Current Amount</p>
                    <span>{formatRupiah(req.current_amount)}</span>
                  </div>
                  <div>
                    <p>Requested Amount</p>
                    <span style={{ color: '#2D6BE4', fontWeight: 600 }}>
                      {formatRupiah(req.requested_amount)}
                    </span>
                  </div>
                </div>

                <div className="actions">
                  <button className="btn reject" onClick={() => handleReject(req.id)}>Reject</button>
                  <button className="btn approve" onClick={() => handleApprove(req.id)}>Approve</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      {/* FEEDBACK MESSAGE */}
      {feedbackMsg && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          background: feedbackMsg.type === 'success' ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${feedbackMsg.type === 'success' ? '#86efac' : '#fca5a5'}`,
          color: feedbackMsg.type === 'success' ? '#166534' : '#991b1b',
          padding: '14px 20px', borderRadius: 12, fontSize: 14, fontWeight: 500,
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span>{feedbackMsg.type === 'success' ? '✓' : '✕'}</span>
          <span>{feedbackMsg.text}</span>
          <button
            onClick={() => setFeedbackMsg(null)}
            style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'inherit', lineHeight: 1 }}
          >×</button>
        </div>
      )}

      {/* APPROVE MODAL */}
      {approveModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}
          onClick={(e) => { if (e.target === e.currentTarget && !approveGuard.current) setApproveModal(null); }}>
          <div style={{ background: '#fff', borderRadius: 20, padding: '32px 28px', maxWidth: 400, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.18)', textAlign: 'center' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 24 }}>✓</div>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 10px', color: '#1e293b' }}>Setujui Pengajuan?</h3>
            <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 24px', lineHeight: 1.6 }}>
              Pengajuan perubahan jumlah simpanan sukarela ini akan disetujui.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setApproveModal(null)} style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: '1px solid #e5e7eb', background: '#f3f4f6', color: '#374151', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Batal</button>
              <button onClick={doApprove} style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Setujui</button>
            </div>
          </div>
        </div>
      )}

      {/* REJECT MODAL */}
      {rejectModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}
          onClick={(e) => { if (e.target === e.currentTarget && !rejectGuard.current) setRejectModal(null); }}>
          <div style={{ background: '#fff', borderRadius: 20, padding: '32px 28px', maxWidth: 420, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.18)', textAlign: 'center' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 24 }}>✕</div>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 10px', color: '#1e293b' }}>Tolak Pengajuan?</h3>
            <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 14px', lineHeight: 1.6 }}>
              Pengajuan ini akan ditolak. Berikan alasan penolakan (opsional):
            </p>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="Alasan penolakan..."
              rows={3}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 13, resize: 'vertical', outline: 'none', boxSizing: 'border-box', marginBottom: 20, fontFamily: 'inherit' }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setRejectModal(null)} style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: '1px solid #e5e7eb', background: '#f3f4f6', color: '#374151', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Batal</button>
              <button onClick={doReject} style={{ flex: 1, padding: '11px 0', borderRadius: 12, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Tolak</button>
            </div>
          </div>
        </div>
      )}

      {showUpdateConfirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: '#fff', borderRadius: 16, padding: '32px 28px', maxWidth: 420, width: '90%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
            <h3 style={{ marginBottom: 10, fontSize: 18, fontWeight: 700 }}>Konfirmasi Update</h3>
            <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 8 }}>
              Apakah Anda yakin ingin memperbarui jumlah simpanan wajib menjadi:
            </p>
            <p style={{ fontSize: 20, fontWeight: 700, color: '#1e3a5f', marginBottom: 20 }}>
              {formatRupiah(tempAmount)}
            </p>
            <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 24 }}>
              Perubahan ini akan diterapkan untuk <strong>semua member</strong> aktif.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowUpdateConfirm(false)}
                style={{
                  padding: '10px 20px', borderRadius: 10, border: '1px solid #d1d5db',
                  background: '#f3f4f6', cursor: 'pointer', fontWeight: 500, fontSize: 14,
                }}
              >
                Batal
              </button>
              <button
                onClick={async () => { setShowUpdateConfirm(false); await handleUpdate(); }}
                style={{
                  padding: '10px 24px', borderRadius: 10, border: 'none',
                  background: '#3b82f6', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14,
                }}
              >
                Ya, Update
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
