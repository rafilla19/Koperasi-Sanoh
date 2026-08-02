import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Printer, CheckCircle, AlertTriangle, User, Calendar, CreditCard, DollarSign, ExternalLink, FileText, X, Eye, Download } from 'lucide-react';
import { apiUrl, API_ORIGIN, getAuthHeaders } from '../../services/api';
import './AdminActiveLoanDetail.css';

const AdminActiveLoanDetail = () => {
  const navigate = useNavigate();
  const { id } = useParams();

  const [loanData, setLoanData] = useState(null);
  const [schedule, setSchedule] = useState([]);
  const [loading, setLoading] = useState(true);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [gatewayDetail, setGatewayDetail] = useState(null);

  const resolveFileUrl = (filePath) => {
    if (!filePath) return '';
    const path = String(filePath).trim();
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    const base = API_ORIGIN || window.location.origin;
    if (path.startsWith('/')) return `${base}${path}`;
    return `${base}/${path}`;
  };

  const isImageFile = (url) => /\.(jpg|jpeg|png|gif|bmp|webp|svg)(\?|$)/i.test(url || '');

  const handleDownloadFile = async (url, name) => {
    if (!url) return;
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = name || url.split('/').filter(Boolean).pop() || 'document';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Download failed:', error);
      window.open(url, '_blank');
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch active loan summary (admin version)
        const activeRes = await fetch(apiUrl('/loan/loans/admin_loans_list/'), { headers: getAuthHeaders() });
        if (activeRes.ok) {
          const activeData = await activeRes.json();
          const match = activeData.find(item => String(item.loan_id) === id);
          if (match) {
            setLoanData(match);

            // Fetch schedule
            const schedRes = await fetch(apiUrl(`/loan/loans/${id}/schedule/`), { headers: getAuthHeaders() });
            if (schedRes.ok) {
              const schedData = await schedRes.json();
              setSchedule(schedData);
            }
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const formatRupiah = (number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(number || 0).replace(',00', '');
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('id-ID', { month: 'short', day: '2-digit', year: 'numeric' });
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return '-';
    const d = new Date(dateString);
    return d.toLocaleDateString('id-ID', { month: 'long', day: 'numeric', year: 'numeric' }) + ' ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) return <div className="aald-page"><h2>Memuat...</h2></div>;
  if (!loanData) return <div className="aald-page"><h2>Pinjaman tidak ditemukan</h2></div>;

  return (
    <div className="aald-page">
      <div className="aald-header">
        <div className="aald-header-left">
          <button className="aald-back-btn" onClick={() => navigate(-1)}>
            <ArrowLeft size={16} /> Kembali
          </button>
          <h1>Manajemen Pinjaman Aktif</h1>
          <div className="aald-status-pill active">
            <span className="dot"></span> Aktif
          </div>
        </div>
        {/* <div className="aald-header-actions">
          <button className="aald-btn-outline"><Printer size={16} /> Print Report</button>
        </div> */}
      </div>

      <div className="aald-grid-top">
        {/* Member Profile Info */}
        <div className="aald-card profile-card">
          <div className="card-header">
            <h3>Informasi Peminjam</h3>
            <button className="view-profile" onClick={() => navigate(`/dashboard/admin/members/${loanData.member_id}`)}>Lihat Profil Lengkap</button>
          </div>
          <div className="profile-content">
            <div className="profile-avatar">
              <User size={32} color="#4f7df3" />
            </div>
            <div className="profile-details">
              <div className="name">{loanData.full_name}</div>
              <div className="meta">
                <span>NIK: {loanData.nik_employee}</span>
                <span>Dept.: {loanData.department_name}</span>
              </div>
              <div className="meta">
                <span>ID Anggota: {loanData.member_id}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Loan Financial Stats */}
        <div className="aald-card stats-card">
          <div className="stats-grid">
            <div className="stat-item">
              <div className="label">Total Pokok</div>
              <div className="value">{formatRupiah(loanData.principal_amount)}</div>
            </div>
            <div className="stat-item">
              <div className="label">Sisa Saldo</div>
              <div className="value highlight">{formatRupiah(loanData.remaining_balance)}</div>
            </div>
            <div className="stat-item">
              <div className="label">Total Terbayar</div>
              <div className="value">{formatRupiah(loanData.amount - loanData.remaining_balance)}</div>
            </div>
            <div className="stat-item">
              <div className="label">Suku Bunga</div>
              <div className="value">{(loanData.interest_amount / loanData.principal_amount * 100).toFixed(1)}% Total</div>
            </div>
          </div>
        </div>
      </div>

      <div className="aald-layout">
        <div className="aald-main">
          {/* Progress Section */}
          <div className="aald-card progress-card">
            <div className="prog-header">
              <h3>Progres Pembayaran</h3>
              <span className="pct">{Math.round(loanData.progress_percent)}%</span>
            </div>
            <div className="prog-bar">
              <div className="prog-fill" style={{ width: `${loanData.progress_percent}%` }}></div>
            </div>
            <div className="prog-footer">
              <span>{loanData.paid_installment} dari {loanData.total_installment} Angsuran Terbayar</span>
              <span>Jatuh Tempo: {formatDate(loanData.current_month_due_date)}</span>
            </div>
          </div>

          {/* Schedule Table */}
          <div className="aald-card table-card">
            <h3>Jadwal Pembayaran</h3>
            <div className="table-wrap">
              <table className="aald-table">
                <thead>
                  <tr>
                    <th>NO.</th>
                    <th>JATUH TEMPO</th>
                    <th>POKOK</th>
                    <th>BUNGA</th>
                    <th>TOTAL</th>
                    <th>STATUS</th>
                    <th>BUKTI</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.map(s => (
                    <tr key={s.installment_number}>
                      <td>#{s.installment_number}</td>
                      <td style={(s.status_code === 'PAID' || s.status_code === 'OVERDUE') ? { color: '#16a34a', fontWeight: 600 } : undefined}>
                        {formatDate(s.due_date)}
                      </td>
                      <td>{formatRupiah(s.amount_principal)}</td>
                      <td>{formatRupiah(s.amount_interest)}</td>
                      <td className="bold">{formatRupiah(s.amount_total)}</td>
                      <td>
                        <span className={`status-badge ${s.status_code?.toLowerCase()}`}>
                          {s.status_code}
                        </span>
                      </td>
                      <td>
                        {s.payment_method_name === 'MANUAL' && s.payment_proof ? (
                          <button
                            onClick={() => setPreviewDoc({ url: resolveFileUrl(s.payment_proof), name: `Bukti Pembayaran #${s.installment_number}` })}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#4f7df3', padding: 0, fontSize: 12, fontWeight: 600 }}
                            title="Lihat bukti transfer manual"
                          >
                            <Eye size={16} /> Manual
                          </button>
                        ) : s.payment_method_name === 'GATEWAY' ? (
                          <button
                            onClick={() => setGatewayDetail({
                              installmentNumber: s.installment_number,
                              reference: s.gateway_reference,
                              status: s.gateway_status,
                              paymentDate: s.payment_date,
                            })}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#4f7df3', padding: 0, fontSize: 12, fontWeight: 600 }}
                            title="Lihat detail transaksi Midtrans"
                          >
                            <ExternalLink size={14} /> Midtrans
                          </button>
                        ) : s.payment_method_name === 'PAYROLL_DEDUCTION' && s.payment_proof ? (
                          <button
                            onClick={() => setPreviewDoc({ url: resolveFileUrl(s.payment_proof), name: `Bukti Transfer Payroll #${s.installment_number}` })}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#4f7df3', padding: 0, fontSize: 12, fontWeight: 600 }}
                            title="Lihat bukti transfer payroll"
                          >
                            <Eye size={16} /> Payroll
                          </button>
                        ) : s.payment_method_name === 'PAYROLL_DEDUCTION' ? (
                          <span style={{ color: '#94a3b8', fontSize: 12, fontStyle: 'italic' }} title="Dipotong otomatis dari gaji, belum ada bukti transfer yang diunggah untuk konfirmasi ini">
                            Payroll (tanpa bukti)
                          </span>
                        ) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="aald-sidebar">
          {/* Loan Info */}
          <div className="aald-card info-card">
            <h3>Detail Pinjaman</h3>
            <div className="info-list">
              <div className="info-item">
                <label>Jenis Pinjaman</label>
                <span>{loanData.type_name}</span>
              </div>
              <div className="info-item">
                <label>Tujuan</label>
                <span>{loanData.purpose}</span>
              </div>
              <div className="info-item">
                <label>Tanggal Mulai</label>
                <span>{formatDate(loanData.start_date)}</span>
              </div>
              <div className="info-item">
                <label>Tanggal Jatuh Tempo</label>
                <span>{formatDate(loanData.due_date)}</span>
              </div>
              <div className="info-item" style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #eee' }}>
                <label>Dokumen</label>
                {loanData.salary_statement_file ? (
                  <button
                    onClick={() => setPreviewDoc({ url: resolveFileUrl(loanData.salary_statement_file), name: 'Slip Gaji' })}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      color: '#4f7df3',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '500',
                      marginTop: '8px',
                      padding: 0,
                    }}
                  >
                    <Eye size={16} />
                    Slip Gaji
                  </button>
                ) : (
                  <span style={{ color: '#94a3b8', fontSize: '13px', fontStyle: 'italic' }}>Belum ada slip gaji</span>
                )}
              </div>
            </div>
          </div>

          {/* Admin Actions */}
          {/* <div className="aald-card actions-card">
            <h3>Admin Actions</h3>
            <div className="action-btns">
              <button className="btn-action primary">Record Manual Payment</button>
              <button className="btn-action secondary">Adjust Schedule</button>
              <button className="btn-action danger">Write Off Loan</button>
            </div>
          </div> */}
        </div>
      </div>

      {previewDoc && createPortal(
        <div className="aald-preview-overlay" onClick={() => setPreviewDoc(null)}>
          <div className="aald-preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="aald-preview-header">
              <h3>{previewDoc.name}</h3>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button className="aald-preview-action" onClick={() => handleDownloadFile(previewDoc.url, previewDoc.name)}>
                  <Download size={14} /> Unduh
                </button>
                <button className="aald-preview-close" onClick={() => setPreviewDoc(null)}>
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="aald-preview-body">
              {isImageFile(previewDoc.url) ? (
                <img src={previewDoc.url} alt={previewDoc.name} className="aald-preview-img" />
              ) : (
                <iframe src={previewDoc.url} title={previewDoc.name} className="aald-preview-iframe" />
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {gatewayDetail && createPortal(
        <div className="aald-preview-overlay" onClick={() => setGatewayDetail(null)}>
          <div className="aald-preview-modal" onClick={(e) => e.stopPropagation()} style={{ height: 'auto', maxWidth: 420 }}>
            <div className="aald-preview-header">
              <h3>Detail Pembayaran Midtrans #{gatewayDetail.installmentNumber}</h3>
              <button className="aald-preview-close" onClick={() => setGatewayDetail(null)}>
                <X size={20} />
              </button>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>No. Referensi / Order ID</div>
                <div style={{ fontSize: 14, color: '#0f172a', fontWeight: 600 }}>{gatewayDetail.reference || '-'}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Status Gateway</div>
                <div style={{ fontSize: 14, color: '#0f172a', fontWeight: 600 }}>{gatewayDetail.status || '-'}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Tanggal Pembayaran</div>
                <div style={{ fontSize: 14, color: '#0f172a', fontWeight: 600 }}>{formatDateTime(gatewayDetail.paymentDate)}</div>
              </div>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
                Pembayaran via Midtrans diverifikasi otomatis oleh payment gateway — tidak ada file bukti transfer yang diunggah untuk jalur ini.
              </p>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default AdminActiveLoanDetail;
