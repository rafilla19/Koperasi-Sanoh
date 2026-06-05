import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { apiUrl } from '../../services/api';

const MEDIA_BASE_URL = apiUrl('').replace(/\/$/, '').replace('/api/v1', '/media');

const fmt = (n) => Number(n || 0).toLocaleString('id-ID');
const fmtDate = (v) =>
  v ? new Date(v).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '-';

const STATUS_MAP = {
  REQUESTED:            { label: 'Menunggu',   bg: '#FEF3C7', color: '#D97706' },
  PENDING_VERIFICATION: { label: 'Verifikasi', bg: '#FFF7ED', color: '#EA580C' },
  APPROVED:             { label: 'Disetujui',  bg: '#D1FAE5', color: '#059669' },
  REJECTED:             { label: 'Ditolak',    bg: '#FEE2E2', color: '#DC2626' },
  PAID:                 { label: 'Sudah Dibayar', bg: '#DBEAFE', color: '#2563EB' },
  CANCELLED:            { label: 'Dibatalkan', bg: '#F1F5F9', color: '#64748B' },
};

export default function MyWithdrawalDetail() {
  const { id } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();

  const [data, setData] = useState(state?.withdrawal || null);
  const [loading, setLoading] = useState(!state?.withdrawal);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    if (data) return;
    setLoading(true);
    fetch(apiUrl('/my-savings/withdrawals/'))
      .then((r) => r.json())
      .then((list) => {
        const found = Array.isArray(list) ? list.find((w) => String(w.id) === String(id)) : null;
        setData(found || null);
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [id]);

  const status = STATUS_MAP[data?.status_code] || { label: data?.status_name || '-', bg: '#F1F5F9', color: '#64748B' };

  if (loading) {
    return (
      <div style={{ padding: '60px 0', textAlign: 'center', color: '#94A3B8', fontSize: 14 }}>
        Memuat...
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ padding: '48px 0', textAlign: 'center' }}>
        <p style={{ color: '#EF4444', marginBottom: 16 }}>Data tidak ditemukan</p>
        <button onClick={() => navigate(-1)} style={backBtnStyle}>← Kembali</button>
      </div>
    );
  }

  const proofUrl = data.proof_file_path
    ? (data.proof_file_path.startsWith('http') ? data.proof_file_path : `${MEDIA_BASE_URL}${data.proof_file_path}`)
    : null;

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', paddingBottom: 40 }}>
      {/* Back */}
      <button onClick={() => navigate(-1)} style={backBtnStyle}>← Kembali</button>

      {/* Header card */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: '24px 24px 20px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>
          Penarikan #{data.id}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: '#0A1628', fontFamily: 'Syne, sans-serif' }}>
            Rp {fmt(data.amount)},00
          </h2>
          <span style={{ background: status.bg, color: status.color, padding: '6px 14px', borderRadius: 99, fontSize: 12, fontWeight: 700 }}>
            {status.label}
          </span>
        </div>
      </div>

      {/* Info rows */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, overflow: 'hidden', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        {[
          { label: 'Jenis Simpanan', value: data.saving_type_name || '-' },
          { label: 'Tanggal Request', value: fmtDate(data.request_date) },
          data.approved_date && { label: 'Tanggal Disetujui', value: fmtDate(data.approved_date) },
          data.paid_date && { label: 'Tanggal Dibayar', value: fmtDate(data.paid_date) },
          data.notes && { label: 'Alasan Penarikan', value: data.notes },
        ].filter(Boolean).map((row, i, arr) => (
          <div
            key={row.label}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              padding: '14px 20px', gap: 16,
              borderBottom: i < arr.length - 1 ? '1px solid #F1F5F9' : 'none',
            }}
          >
            <span style={{ fontSize: 13, color: '#94A3B8', flexShrink: 0 }}>{row.label}</span>
            <span style={{ fontSize: 13, color: '#0F172A', fontWeight: 500, textAlign: 'right' }}>{row.value}</span>
          </div>
        ))}
      </div>

      {/* Reject reason */}
      {data.reject_reason && (
        <div style={{ background: '#FFF1F2', border: '1px solid #FECDD3', borderRadius: 12, padding: '14px 16px', marginBottom: 16, fontSize: 13, color: '#991B1B' }}>
          <strong>Alasan Penolakan:</strong> {data.reject_reason}
        </div>
      )}

      {/* Proof photo */}
      {proofUrl && !imgError && (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 14px' }}>
            Bukti Transfer
          </p>
          <img
            src={proofUrl}
            alt="Bukti transfer"
            onError={() => setImgError(true)}
            style={{ width: '100%', borderRadius: 10, border: '1px solid #E2E8F0', objectFit: 'contain', maxHeight: 360, background: '#F8FAFC' }}
          />
        </div>
      )}
    </div>
  );
}

const backBtnStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  background: 'none', border: 'none', cursor: 'pointer',
  color: '#64748B', fontSize: 13, fontWeight: 500, padding: '0 0 20px',
  transition: 'color 0.2s',
};
