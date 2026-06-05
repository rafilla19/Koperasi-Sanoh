import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiUrl } from "../../services/api";
import "./WithdrawalRequests.css";

const formatRupiah = (num) => "Rp " + Number(num || 0).toLocaleString("id-ID");

const formatDate = (val) =>
  val ? new Date(val).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "-";

const STATUS_CONFIG = {
  REQUESTED:            { label: 'Menunggu',   bg: '#fef9c3', color: '#854d0e', dot: '#eab308' },
  PENDING_VERIFICATION: { label: 'Verifikasi', bg: '#fff7ed', color: '#9a3412', dot: '#f97316' },
  APPROVED:             { label: 'Disetujui',  bg: '#dcfce7', color: '#166534', dot: '#22c55e' },
  REJECTED:             { label: 'Ditolak',    bg: '#fee2e2', color: '#991b1b', dot: '#ef4444' },
  PAID:                 { label: 'Lunas',      bg: '#dbeafe', color: '#1e40af', dot: '#3b82f6' },
  CANCELLED:            { label: 'Dibatalkan', bg: '#f1f5f9', color: '#475569', dot: '#94a3b8' },
};

export default function WithdrawalRequestsDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectLoading, setRejectLoading] = useState(false);
  const [rejectError, setRejectError] = useState("");

  const [approveError, setApproveError] = useState("");
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [approveLoading, setApproveLoading] = useState(false);

  const fetchDetail = () => {
    setLoading(true);
    fetch(apiUrl(`/admin/savings/withdrawals/${id}/`))
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); setData(null); }
        else { setData(d); setError(""); }
      })
      .catch(() => setError("Gagal memuat data"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchDetail(); }, [id]);

  const handleApprove = async () => {
    setApproveError("");
    setApproveLoading(true);
    try {
      const res = await fetch(apiUrl(`/admin/savings/withdrawals/${id}/approve/`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }).then((r) => r.json());

      if (res.message) {
        setUploadMsg("Withdrawal berhasil disetujui. Silakan upload bukti transfer.");
        fetchDetail();
      } else {
        setApproveError(res.error || "Gagal menyetujui withdrawal");
      }
    } catch {
      setApproveError("Terjadi kesalahan saat menyetujui");
    } finally {
      setApproveLoading(false);
    }
  };

  const handleRejectClick = () => {
    setShowRejectForm(true);
    setRejectError("");
  };

  const handleRejectSubmit = async () => {
    setRejectError("");
    if (!rejectReason.trim()) { setRejectError("Alasan penolakan wajib diisi"); return; }
    setRejectLoading(true);
    try {
      const res = await fetch(apiUrl(`/admin/savings/withdrawals/${id}/reject/`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reject_reason: rejectReason }),
      }).then((r) => r.json());
      if (res.message) {
        setShowRejectForm(false);
        setRejectReason("");
        fetchDetail();
      } else {
        setRejectError(res.error || "Gagal menolak");
      }
    } catch {
      setRejectError("Terjadi kesalahan saat menolak");
    } finally {
      setRejectLoading(false);
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadMsg("");
    setUploadLoading(true);
    const formData = new FormData();
    formData.append("proof_file", file);
    try {
      const res = await fetch(apiUrl(`/admin/savings/withdrawals/${id}/upload-transfer/`), {
        method: "POST",
        body: formData,
      }).then((r) => r.json());
      if (res.message) {
        setUploadMsg("Bukti transfer berhasil diupload");
        fetchDetail();
      } else {
        setUploadMsg(res.error || "Gagal upload");
      }
    } catch {
      setUploadMsg("Terjadi kesalahan saat upload");
    } finally {
      setUploadLoading(false);
      e.target.value = "";
    }
  };

  const statusCode = String(data?.status_code || '').toUpperCase();
  const isPending = ['REQUESTED', 'PENDING_VERIFICATION', 'PENDING'].includes(statusCode);
  const isApproved = statusCode === 'APPROVED';
  const isFinal = ['REJECTED', 'PAID', 'CANCELLED'].includes(statusCode);
  const statusInfo = STATUS_CONFIG[statusCode] || { label: data?.status_name, bg: '#f1f5f9', color: '#475569', dot: '#94a3b8' };
  const remaining = Number(data?.wallet_balance || 0) - Number(data?.amount || 0);

  if (loading) {
    return (
      <div className="card">
        <div style={{ padding: '60px 0', textAlign: 'center' }}>
          <div className="detail-spinner" />
          <p style={{ marginTop: 14, fontSize: 13, color: '#94a3b8' }}>Memuat data...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card">
        <div style={{ padding: '48px 0', textAlign: 'center' }}>
          <p style={{ color: '#ef4444', marginBottom: 16, fontSize: 14 }}>{error || "Data tidak ditemukan"}</p>
          <button className="btn-back" onClick={() => navigate(-1)}>← Kembali</button>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      {/* HEADER */}
      <div className="detail-header">
        <div>
          <button className="btn-back-inline" onClick={() => navigate(-1)}>← Kembali</button>
          <h2 style={{ margin: '6px 0 0', fontSize: 22, fontWeight: 700, color: '#0f172a' }}>
            Withdrawal Request <span style={{ color: '#94a3b8', fontWeight: 400 }}>#{id}</span>
          </h2>
        </div>
        <span className="status-badge" style={{ background: statusInfo.bg, color: statusInfo.color }}>
          <span className="status-dot" style={{ background: statusInfo.dot }} />
          {statusInfo.label}
        </span>
      </div>

      {/* SUMMARY CARDS */}
      <div className="summary-cards">
        <div className="card-box card-box--blue">
          <p className="card-box__label">Total {data.saving_type_name || 'Simpanan'}</p>
          <h3 className="card-box__value card-box__value--blue">{formatRupiah(data.wallet_balance)}</h3>
          <p className="card-box__sub">Saldo aktif</p>
        </div>
        <div className="card-box card-box--red">
          <p className="card-box__label">Jumlah Request</p>
          <h3 className="card-box__value card-box__value--red">{formatRupiah(data.amount)}</h3>
          <p className="card-box__sub">Nominal penarikan</p>
        </div>
        <div className="card-box card-box--green">
          <p className="card-box__label">Sisa Saldo</p>
          <h3 className="card-box__value" style={{ color: remaining < 0 ? '#dc2626' : '#16a34a' }}>
            {formatRupiah(remaining)}
          </h3>
          <p className="card-box__sub">Setelah penarikan</p>
        </div>
      </div>

      {/* REJECT REASON BANNER */}
      {data.reject_reason && (
        <div className="reject-banner">
          <span>Alasan penolakan:</span> {data.reject_reason}
        </div>
      )}

      {/* UPLOAD MESSAGE */}
      {uploadMsg && (
        <div className={`upload-msg ${uploadMsg.includes('berhasil') ? 'upload-msg--ok' : 'upload-msg--err'}`}>
          {uploadMsg}
        </div>
      )}

      {/* DETAIL GRID */}
      <div className="detail-grid">
        {/* Member Info */}
        <div className="detail-card">
          <div className="detail-card__header">
            <span className="detail-card__icon">👤</span>
            <h4>Informasi Member</h4>
          </div>
          <div className="detail-rows">
            <div className="detail-row">
              <span className="detail-row__label">Nama</span>
              <span className="detail-row__value">{data.member?.full_name || '-'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-row__label">ID Karyawan</span>
              <span className="detail-row__value">{data.member?.nik_employee || data.member?.nik_ktp || '-'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-row__label">Bergabung</span>
              <span className="detail-row__value">{formatDate(data.member?.join_date)}</span>
            </div>
          </div>
        </div>

        {/* Bank Destination */}
        <div className="detail-card">
          <div className="detail-card__header">
            <span className="detail-card__icon">🏦</span>
            <h4>Rekening Tujuan</h4>
          </div>
          {data.bank_account ? (
            <div className="detail-rows">
              <div className="detail-row">
                <span className="detail-row__label">Nama Pemilik</span>
                <span className="detail-row__value">{data.bank_account.account_holder_name}</span>
              </div>
              <div className="detail-row">
                <span className="detail-row__label">No. Rekening</span>
                <span className="detail-row__value detail-row__value--mono">{data.bank_account.account_number}</span>
              </div>
              <div className="detail-row">
                <span className="detail-row__label">Bank</span>
                <span className="detail-row__value">{data.bank_account.bank_name}</span>
              </div>
            </div>
          ) : (
            <p className="detail-empty">Tidak ada data rekening terdaftar</p>
          )}
        </div>

        {/* Notes */}
        <div className="detail-card">
          <div className="detail-card__header">
            <span className="detail-card__icon">📝</span>
            <h4>Alasan Penarikan</h4>
          </div>
          <div className="notes-box">
            {data.notes || <span style={{ color: '#94a3b8' }}>Tidak ada catatan</span>}
          </div>
        </div>

        {/* Timeline */}
        <div className="detail-card">
          <div className="detail-card__header">
            <span className="detail-card__icon">🕐</span>
            <h4>Timeline</h4>
          </div>
          <div className="timeline">
            {[
              { label: 'Pengajuan', date: data.request_date },
              { label: 'Disetujui', date: data.approved_date },
              { label: 'Dibayar',   date: data.paid_date },
            ].map((step, i) => (
              <div key={i} className={`timeline-item ${step.date ? 'done' : ''}`}>
                <div className="timeline-dot" />
                <div>
                  <p className="timeline-label">{step.label}</p>
                  <p className="timeline-date">{formatDate(step.date)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ACTION BUTTONS */}
      {!isFinal && (
        <>
          <div className="action-bar">
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg" style={{ display: 'none' }} onChange={handleUpload} />

            {isApproved && (
              <button className="btn-action btn-action--upload" onClick={() => fileInputRef.current?.click()} disabled={uploadLoading}>
                {uploadLoading ? 'Mengupload...' : '↑ Upload Bukti Transfer'}
              </button>
            )}
            {isPending && (
              <button className="btn-action btn-action--approve" onClick={handleApprove} disabled={approveLoading}>
                {approveLoading ? 'Memproses...' : '✓ Setujui'}
              </button>
            )}
            {isPending && (
              <button className="btn-action btn-action--reject" onClick={handleRejectClick} disabled={rejectLoading}>
                ✕ Tolak
              </button>
            )}
          </div>

          {approveError && <p className="modal-error" style={{ marginTop: 8 }}>{approveError}</p>}

          {showRejectForm && (
            <div className="reject-inline-form" style={{ marginTop: 16 }}>
              <label className="modal-label">Alasan Penolakan</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Masukkan alasan penolakan..."
                className="modal-textarea"
              />
              {rejectError && <p className="modal-error">{rejectError}</p>}
              <div className="modal-actions">
                <button
                  className="modal-btn modal-btn--cancel"
                  onClick={() => { setShowRejectForm(false); setRejectReason(""); setRejectError(""); }}
                  disabled={rejectLoading}
                >
                  Batal
                </button>
                <button className="modal-btn modal-btn--confirm" onClick={handleRejectSubmit} disabled={rejectLoading}>
                  {rejectLoading ? 'Menyimpan...' : 'Konfirmasi Tolak'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
