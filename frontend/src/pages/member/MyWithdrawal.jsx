import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { apiUrl } from '../../services/api';

const MEDIA_BASE_URL = apiUrl('').replace(/\/$/, '').replace('/api/v1', '/media');

const fmt = (n) => Number(n || 0).toLocaleString('id-ID');
const fmtDate = (v) =>
  v ? new Date(v).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '-';
const fmtDateTime = (v) =>
  v ? new Date(v).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';

const STATUS_MAP = {
  REQUESTED:            { label: 'Menunggu',        bg: '#FEF3C7', color: '#D97706', icon: '⏳' },
  PENDING_VERIFICATION: { label: 'Verifikasi',      bg: '#FFF7ED', color: '#EA580C', icon: '🔍' },
  APPROVED:             { label: 'Disetujui',       bg: '#D1FAE5', color: '#059669', icon: '✓' },
  REJECTED:             { label: 'Ditolak',         bg: '#FEE2E2', color: '#DC2626', icon: '✕' },
  PAID:                 { label: 'Sudah Dibayar',   bg: '#DBEAFE', color: '#2563EB', icon: '✓' },
  CANCELLED:            { label: 'Dibatalkan',      bg: '#F1F5F9', color: '#64748B', icon: '—' },
};

export default function MyWithdrawalDetail() {
  const { id } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();

  const [data, setData] = useState(state?.withdrawal || null);
  const [loading, setLoading] = useState(!state?.withdrawal);
  const [imgError, setImgError] = useState(false);
  const [imgLoading, setImgLoading] = useState(true);

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

  const status = STATUS_MAP[data?.status_code] || { label: data?.status_name || '-', bg: '#F1F5F9', color: '#64748B', icon: '—' };

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

  const hasAdminResponse = data.approved_date || data.paid_date || data.reject_reason || proofUrl;

  const timelineSteps = [
    { key: 'requested', label: 'Diajukan', date: data.request_date, done: true },
    { key: 'approved', label: 'Disetujui', date: data.approved_date, done: !!data.approved_date },
    { key: 'paid', label: 'Dibayar', date: data.paid_date, done: !!data.paid_date },
  ];

  if (data.status_code === 'REJECTED') {
    timelineSteps.splice(1, 2, { key: 'rejected', label: 'Ditolak', date: data.approved_date, done: true, isReject: true });
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', paddingBottom: 40 }}>
      <button onClick={() => navigate(-1)} style={backBtnStyle}>← Kembali</button>

      {/* Header card */}
      <div style={headerCardStyle}>
        <p style={kickerStyle}>Penarikan #{data.id}</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={amountStyle}>Rp {fmt(data.amount)},00</h2>
          <span style={{ background: status.bg, color: status.color, padding: '6px 14px', borderRadius: 99, fontSize: 12, fontWeight: 700 }}>
            {status.label}
          </span>
        </div>
      </div>

      {/* Timeline */}
      <div style={cardStyle}>
        <p style={sectionTitleStyle}>Status Penarikan</p>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, padding: '4px 0' }}>
          {timelineSteps.map((step, i) => (
            <div key={step.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
              {i > 0 && (
                <div style={{
                  position: 'absolute', top: 12, right: '50%', width: '100%', height: 2,
                  background: step.done ? (step.isReject ? '#FCA5A5' : '#86EFAC') : '#E2E8F0',
                }} />
              )}
              <div style={{
                width: 24, height: 24, borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, position: 'relative', zIndex: 1,
                background: step.done ? (step.isReject ? '#FEE2E2' : '#D1FAE5') : '#F1F5F9',
                color: step.done ? (step.isReject ? '#DC2626' : '#059669') : '#94A3B8',
                border: `2px solid ${step.done ? (step.isReject ? '#FCA5A5' : '#86EFAC') : '#E2E8F0'}`,
              }}>
                {step.done ? (step.isReject ? '✕' : '✓') : (i + 1)}
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: step.done ? '#0F172A' : '#94A3B8', marginTop: 6, textAlign: 'center' }}>
                {step.label}
              </span>
              {step.date && (
                <span style={{ fontSize: 10, color: '#94A3B8', marginTop: 2, textAlign: 'center' }}>
                  {fmtDate(step.date)}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Info Penarikan */}
      <div style={cardStyle}>
        <p style={sectionTitleStyle}>Informasi Penarikan</p>
        {[
          { label: 'Jenis Simpanan', value: data.saving_type_name || '-' },
          { label: 'Jumlah', value: `Rp ${fmt(data.amount)},00` },
          { label: 'Tanggal Pengajuan', value: fmtDateTime(data.request_date) },
          data.notes && { label: 'Alasan Penarikan', value: data.notes },
          data.payment_reference_id && { label: 'Referensi Pembayaran', value: data.payment_reference_id },
        ].filter(Boolean).map((row, i, arr) => (
          <div key={row.label} style={{ ...infoRowStyle, borderBottom: i < arr.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
            <span style={infoLabelStyle}>{row.label}</span>
            <span style={infoValueStyle}>{row.value}</span>
          </div>
        ))}
      </div>

      {/* Reject reason */}
      {data.reject_reason && (
        <div style={rejectBoxStyle}>
          <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: 13 }}>Alasan Penolakan</p>
          <p style={{ margin: 0, fontSize: 13 }}>{data.reject_reason}</p>
        </div>
      )}

      {/* Admin Response Section */}
      {hasAdminResponse && (
        <div style={cardStyle}>
          <p style={sectionTitleStyle}>Respon Admin</p>
          {[
            data.approved_date && { label: 'Tanggal Disetujui', value: fmtDateTime(data.approved_date) },
            data.paid_date && { label: 'Tanggal Dibayar', value: fmtDateTime(data.paid_date) },
          ].filter(Boolean).map((row, i, arr) => (
            <div key={row.label} style={{ ...infoRowStyle, borderBottom: i < arr.length - 1 || proofUrl ? '1px solid #F1F5F9' : 'none' }}>
              <span style={infoLabelStyle}>{row.label}</span>
              <span style={infoValueStyle}>{row.value}</span>
            </div>
          ))}

          {/* Bukti Transfer */}
          {proofUrl && !imgError && (
            <div style={{ padding: '16px 20px' }}>
              <p style={{ ...sectionTitleStyle, margin: '0 0 12px', padding: 0 }}>Bukti Transfer</p>
              {imgLoading && (
                <div style={{ textAlign: 'center', padding: '24px 0', color: '#94A3B8', fontSize: 13 }}>
                  Memuat gambar...
                </div>
              )}
              <img
                src={proofUrl}
                alt="Bukti transfer"
                onLoad={() => setImgLoading(false)}
                onError={() => { setImgError(true); setImgLoading(false); }}
                style={{
                  width: '100%', borderRadius: 10, border: '1px solid #E2E8F0',
                  objectFit: 'contain', maxHeight: 400, background: '#F8FAFC',
                  display: imgLoading ? 'none' : 'block', cursor: 'pointer',
                }}
                onClick={() => window.open(proofUrl, '_blank')}
              />
              <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 8, textAlign: 'center' }}>
                Klik gambar untuk melihat ukuran penuh
              </p>
            </div>
          )}

          {proofUrl && imgError && (
            <div style={{ padding: '16px 20px' }}>
              <p style={{ ...sectionTitleStyle, margin: '0 0 12px', padding: 0 }}>Bukti Transfer</p>
              <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: '#9A3412' }}>
                Gambar tidak dapat dimuat.{' '}
                <a href={proofUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#2563EB', textDecoration: 'underline' }}>
                  Buka link langsung
                </a>
              </div>
            </div>
          )}
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

const headerCardStyle = {
  background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16,
  padding: '24px 24px 20px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
};

const cardStyle = {
  background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16,
  overflow: 'hidden', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
};

const kickerStyle = {
  fontSize: 11, fontWeight: 700, color: '#94A3B8',
  textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px',
};

const amountStyle = {
  margin: 0, fontSize: 28, fontWeight: 800, color: '#0A1628',
  fontFamily: 'var(--font-family)',
};

const sectionTitleStyle = {
  fontSize: 11, fontWeight: 700, color: '#64748B',
  textTransform: 'uppercase', letterSpacing: '0.08em',
  margin: 0, padding: '16px 20px 8px',
};

const infoRowStyle = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
  padding: '12px 20px', gap: 16,
};

const infoLabelStyle = { fontSize: 13, color: '#94A3B8', flexShrink: 0 };
const infoValueStyle = { fontSize: 13, color: '#0F172A', fontWeight: 500, textAlign: 'right', wordBreak: 'break-word' };

const rejectBoxStyle = {
  background: '#FFF1F2', border: '1px solid #FECDD3', borderRadius: 12,
  padding: '14px 16px', marginBottom: 16, color: '#991B1B',
};
