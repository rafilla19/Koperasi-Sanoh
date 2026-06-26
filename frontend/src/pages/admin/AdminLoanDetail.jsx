import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { User, Printer, UploadCloud, Edit2, AlertCircle, CheckCircle, XCircle, Loader, X, Eye, Download } from 'lucide-react';
import { API_ORIGIN, apiUrl, getAuthHeaders } from '../../services/api';
import './AdminLoanDetail.css';

const AdminLoanDetail = () => {
  const navigate = useNavigate();
  const { id } = useParams();

  const [detail, setDetail] = useState(null);
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [repaymentTerm, setRepaymentTerm] = useState('12');
  const [interestRate, setInterestRate] = useState('0.5');
  const [amountRequested, setAmountRequested] = useState('0');
  const [isEditingTerm, setIsEditingTerm] = useState(false);
  const [isEditingInterest, setIsEditingInterest] = useState(false);
  const [isEditingAmount, setIsEditingAmount] = useState(false);
  const [proofFile, setProofFile] = useState(null);
  const [proofFileName, setProofFileName] = useState('');
  
  // State for Allocation Block
  const [remainingAllocation, setRemainingAllocation] = useState(null);
  const [allocationLoading, setAllocationLoading] = useState(true);

  const resolveDocumentUrl = (filePath) => {
    if (!filePath) return '';
    const path = String(filePath).trim();
    if (!path) return '';
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    if (path.startsWith('/')) return `${API_ORIGIN}${path}`;
    if (path.startsWith('media/')) return `${API_ORIGIN}/${path}`;
    return `${API_ORIGIN}/media/${path}`;
  };

  const getDocumentName = (filePath) => {
    if (!filePath) return 'Slip Gaji';
    try {
      const url = String(filePath).trim();
      return url.split('/').filter(Boolean).pop() || 'Slip Gaji';
    } catch (e) {
      return 'Slip Gaji';
    }
  };

  useEffect(() => {
    // 1. Fetch Application Details
    fetch(apiUrl(`/loan/loan-applications/${id}/admin_application_detail/`), { headers: getAuthHeaders() })
      .then(res => res.json())
      .then(data => {
        if (!data.error) {
          setDetail(data);
          setRepaymentTerm(data.duration_months);
          setAmountRequested(data.amount_requested);
        }
      })
      .catch(err => console.error(err));

    // 2. Fetch AI Suggestion
    fetch(apiUrl(`/loan/loan-applications/${id}/get_ai_suggestion/`), { headers: getAuthHeaders() })
      .then(res => res.json())
      .then(data => {
        if (!data.error) {
          setAiSuggestion(data);
          setInterestRate(String(data.suggested_interest_rate));
        }
      })
      .catch(err => console.error('AI Suggestion Error:', err));
      
    // 3. Fetch Remaining Allocation
    fetch(apiUrl('/loan/loans/admin_pending_stats/'), { headers: getAuthHeaders() })
      .then(res => res.json())
      .then(data => {
        if (data && data.remaining_allocation !== undefined) {
          setRemainingAllocation(data.remaining_allocation);
        } else {
          setRemainingAllocation(0);
        }
      })
      .catch(err => {
        console.error('Allocation Fetch Error:', err);
        setRemainingAllocation(0);
      })
      .finally(() => setAllocationLoading(false));

  }, [id]);

  const handleProfileClick = () => {
    if (detail && detail.member_id) {
      navigate(`/dashboard/admin/members/${detail.member_id}`);
    }
  };

  const [rejectReason, setRejectReason] = useState('');
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(null);

  const isImageFile = (url) => /\.(jpg|jpeg|png|gif|bmp|webp|svg)(\?|$)/i.test(url || '');

  const decisionNote = rejectReason.trim();
  const isDecisionLocked = decisionNote.length === 0;

  // Compute allocation status
  const parsedAmount = parseFloat(amountRequested) || 0;
  const isOverLimit = remainingAllocation !== null && parsedAmount > remainingAllocation;

  const handleApprove = async () => {
    if (isApproving) return;
    if (isOverLimit) {
      alert('Gagal: Jumlah pengajuan melebihi sisa alokasi bulan ini.');
      return;
    }
    if (isDecisionLocked) {
      alert('Silakan isi catatan keputusan sebelum menyetujui pinjaman.');
      return;
    }
    if (!proofFile) {
      alert('Silakan unggah bukti transfer sebelum menyetujui pinjaman.');
      return;
    }
    const confirmed = await window.appConfirm({
      title: 'Setujui pinjaman?',
      message: 'Apakah Anda yakin ingin menyetujui pinjaman ini?',
      confirmText: 'Setujui',
      cancelText: 'Batal',
      variant: 'success',
    });
    if (!confirmed) return;

    setIsApproving(true);
    try {
      const userStr = localStorage.getItem('user');
      const user = userStr ? JSON.parse(userStr) : null;
      const adminId = user?.id || 1;

      const formData = new FormData();
      formData.append('repayment_term', repaymentTerm);
      formData.append('interest_rate', interestRate);
      formData.append('amount_requested', amountRequested);
      formData.append('admin_id', adminId);
      formData.append('reason', rejectReason.trim());
      formData.append('proof_of_transfer', proofFile);

      const response = await fetch(apiUrl(`/loan/loan-applications/${id}/approve/`), {
        method: 'POST',
        headers: getAuthHeaders(true),
        body: formData
      });

      const data = await response.json();
      if (response.ok) {
        alert(data.message || 'Pinjaman berhasil disetujui');
        navigate('/dashboard/admin/ls-loans');
      } else {
        alert(data.error || 'Gagal menyetujui pinjaman');
      }
    } catch (err) {
      console.error(err);
      alert('Gagal menyetujui pinjaman');
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    if (isRejecting) return;
    if (isDecisionLocked) {
      alert('Silakan isi catatan keputusan sebelum menolak pinjaman');
      return;
    }
    const confirmed = await window.appConfirm({
      title: 'Tolak pengajuan?',
      message: 'Apakah Anda yakin ingin menolak pengajuan ini?',
      confirmText: 'Tolak',
      cancelText: 'Batal',
      variant: 'danger',
    });
    if (!confirmed) return;

    setIsRejecting(true);
    try {
      const userStr = localStorage.getItem('user');
      const user = userStr ? JSON.parse(userStr) : null;
      const adminId = user?.id || 1;

      const response = await fetch(apiUrl(`/loan/loan-applications/${id}/reject/`), {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reject_reason: rejectReason,
          admin_id: adminId
        })
      });

      const data = await response.json();
      if (response.ok) {
        alert(data.message || 'Pinjaman berhasil ditolak');
        navigate('/dashboard/admin/ls-loans');
      } else {
        alert(data.error || 'Gagal menolak pinjaman');
      }
    } catch (err) {
      console.error(err);
      alert('Gagal menolak pinjaman');
    } finally {
      setIsRejecting(false);
    }
  };

  if (!detail) return <div className="aldet-loader">Memuat...</div>;

  const formatRupiah = (number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(number || 0).replace(',00', '');
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleString('id-ID', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="admin-loan-detail-modern">
      <div className="aldet-m-header">
        <div className="aldet-m-header-left">
          <h1>Tinjauan Pengajuan Pinjaman</h1>
          <span className="aldet-m-badge-pending">Menunggu Keputusan</span>
        </div>
        <p className="aldet-m-date">Diajukan pada {formatDate(detail.applied_at)}</p>
      </div>

      <div className="aldet-m-grid">
        {/* Left Column: Member Profile & AI Suggestion */}
        <div className="aldet-m-left">
          <div className="aldet-m-card profile-card">
            <h2 className="aldet-m-card-title">Profil Anggota</h2>
            <div className="profile-card-content">
              <div className="profile-avatar-large">
                <User size={40} color="#ffffff" />
              </div>
              <div className="profile-details">
                <h3>{detail.full_name}</h3>
                <p><strong>NIK:</strong> {detail.nik_employee}</p>
                <p><strong>Departemen:</strong> {detail.department_name}</p>
                <p><strong>Email:</strong> {detail.email}</p>
                <p><strong>Telepon:</strong> {detail.phone_number}</p>
              </div>
            </div>
            <button className="aldet-m-btn-outline" onClick={handleProfileClick}>
              Lihat Riwayat Lengkap
            </button>
          </div>

          <div className="aldet-m-card ai-card">
            <h2 className="aldet-m-card-title">Sistem Analisa Risiko (AI)</h2>
            <div className="ai-risk-status">
              <span className="ai-risk-label">Kelayakan:</span>
              <span className={`ai-risk-badge ${aiSuggestion?.eligibility?.toLowerCase() || 'low'}`}>
                {aiSuggestion?.eligibility || 'Menghitung...'}
              </span>
            </div>
            {aiSuggestion && (
              <div className="ai-risk-confidence">
                Tingkat Keyakinan: <strong>{aiSuggestion.confidence_score}%</strong>
              </div>
            )}
            <div className="ai-risk-suggestion">
              Rekomendasi Bunga: <strong>{aiSuggestion?.suggested_interest_rate || '0.5'}%</strong> flat
            </div>
          </div>
          
          {/* Document Preview */}
          <div className="aldet-m-card doc-card">
            <h2 className="aldet-m-card-title">Dokumen Pendukung</h2>
            {detail.salary_statement_file ? (
              <button
                className="doc-preview-link"
                onClick={() => setPreviewDoc({ url: resolveDocumentUrl(detail.salary_statement_file), name: getDocumentName(detail.salary_statement_file) })}
                style={{ background: 'none', border: '1px solid #e2e8f0', cursor: 'pointer', width: '100%', textAlign: 'left' }}
              >
                <Eye size={20} color="#4f46e5" />
                <span>{getDocumentName(detail.salary_statement_file)}</span>
              </button>
            ) : (
              <p className="doc-empty">Belum ada dokumen slip gaji.</p>
            )}
          </div>
        </div>

        {/* Right Column: Loan Configuration & Actions */}
        <div className="aldet-m-right">
          <div className="aldet-m-card config-card">
            <h2 className="aldet-m-card-title">Konfigurasi Pinjaman</h2>
            
            <div className="config-grid">
              <div className="config-item">
                <div className="config-label">
                  Tujuan Pinjaman
                </div>
                <div className="config-value static-val">{detail.purpose || '-'}</div>
              </div>
              <div className="config-item">
                <div className="config-label">
                  Jenis Pinjaman
                </div>
                <div className="config-value static-val">{detail.loan_type_name || '-'}</div>
              </div>
            </div>

            <div className="config-grid mt-4">
              <div className="config-item">
                <div className="config-label">
                  Jumlah Pengajuan
                  <button className="icon-btn" onClick={() => setIsEditingAmount(!isEditingAmount)}>
                    <Edit2 size={14} />
                  </button>
                </div>
                {isEditingAmount ? (
                  <div className="input-with-prefix">
                    <span>Rp</span>
                    <input
                      type="number"
                      value={amountRequested}
                      onChange={(e) => setAmountRequested(e.target.value)}
                      className="m-input"
                    />
                  </div>
                ) : (
                  <div className="config-value highlight-val">{formatRupiah(amountRequested)}</div>
                )}
              </div>
              
              <div className="config-item">
                <div className="config-label">
                  Jangka Waktu
                  <button className="icon-btn" onClick={() => setIsEditingTerm(!isEditingTerm)}>
                    <Edit2 size={14} />
                  </button>
                </div>
                {isEditingTerm ? (
                  <div className="input-with-suffix">
                    <input
                      type="number"
                      value={repaymentTerm}
                      onChange={(e) => setRepaymentTerm(e.target.value)}
                      className="m-input"
                    />
                    <span>bln</span>
                  </div>
                ) : (
                  <div className="config-value">{repaymentTerm} bulan</div>
                )}
              </div>
              
              <div className="config-item">
                <div className="config-label">
                  Bunga
                  <button className="icon-btn" onClick={() => setIsEditingInterest(!isEditingInterest)}>
                    <Edit2 size={14} />
                  </button>
                </div>
                {isEditingInterest ? (
                  <div className="input-with-suffix">
                    <input
                      type="number"
                      step="0.1"
                      value={interestRate}
                      onChange={(e) => setInterestRate(e.target.value)}
                      className="m-input"
                    />
                    <span>%</span>
                  </div>
                ) : (
                  <div className="config-value">{interestRate}% flat</div>
                )}
              </div>
            </div>

            {/* Allocation Checking Panel */}
            <div className={`allocation-panel ${isOverLimit ? 'over-limit' : 'safe'}`}>
              <h3 className="alloc-title">Pengecekan Kuota Dana (Bulan Ini)</h3>
              {allocationLoading ? (
                <p className="alloc-loader">Menghitung sisa alokasi...</p>
              ) : (
                <div className="alloc-details">
                  <div className="alloc-row">
                    <span>Sisa Kuota Sistem:</span>
                    <strong>{formatRupiah(remainingAllocation)}</strong>
                  </div>
                  <div className="alloc-row">
                    <span>Dibutuhkan:</span>
                    <strong>{formatRupiah(parsedAmount)}</strong>
                  </div>
                  <div className={`alloc-status ${isOverLimit ? 'error' : 'success'}`}>
                    {isOverLimit ? (
                      <><XCircle size={18} /> Dana tidak mencukupi untuk persetujuan</>
                    ) : (
                      <><CheckCircle size={18} /> Kuota dana mencukupi</>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="aldet-m-card decision-card">
            <h2 className="aldet-m-card-title">Tindak Lanjut & Keputusan</h2>
            
            <div className="upload-section">
              <label className="upload-label" htmlFor="proof_upload">
                <UploadCloud size={24} color="#6366f1" />
                <div className="upload-text">
                  <span className="upload-title">Unggah Bukti Transfer (Wajib untuk Setuju)</span>
                  <span className="upload-sub">Format: JPG, PNG, PDF.</span>
                </div>
              </label>
              <input
                id="proof_upload"
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setProofFile(file);
                  setProofFileName(file ? file.name : '');
                }}
                style={{ display: 'none' }}
              />
              {proofFileName && <div className="file-selected">✓ {proofFileName} terpilih</div>}
            </div>

            <div className="note-section">
              <label>Catatan Admin (Wajib)</label>
              <textarea 
                className="m-textarea"
                placeholder="Tuliskan catatan alasan persetujuan atau penolakan..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </div>

            <div className="action-buttons">
              <button
                className="btn-reject"
                onClick={handleReject}
                disabled={isDecisionLocked || isRejecting || isApproving}
              >
                {isRejecting ? <><Loader size={14} className="spinner" /> Memproses...</> : 'Tolak Pengajuan'}
              </button>
              <button
                className={`btn-approve ${isOverLimit ? 'disabled' : ''}`}
                onClick={handleApprove}
                disabled={isDecisionLocked || !proofFile || isOverLimit || isApproving || isRejecting}
              >
                {isApproving ? <><Loader size={14} className="spinner" /> Memproses...</> : isOverLimit ? 'Dana Kurang' : 'Setujui Pinjaman'}
              </button>
            </div>
            {(isDecisionLocked || (!proofFile && !isOverLimit)) && (
              <div className="validation-msg">
                <AlertCircle size={14} />
                <span>Harap lengkapi catatan keputusan dan bukti transfer.</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {previewDoc && createPortal(
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999 }} onClick={() => setPreviewDoc(null)}>
          <div style={{ background:'#fff',borderRadius:12,width:'90vw',maxWidth:900,height:'85vh',display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'0 25px 60px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 20px',borderBottom:'1px solid #e2e8f0',background:'#f8fafc' }}>
              <h3 style={{ margin:0,fontSize:16,fontWeight:700,color:'#0f172a' }}>{previewDoc.name}</h3>
              <div style={{ display:'flex',gap:8,alignItems:'center' }}>
                <button onClick={() => window.open(previewDoc.url,'_blank')} style={{ display:'flex',alignItems:'center',gap:6,padding:'8px 12px',border:'1px solid #e2e8f0',background:'#fff',borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer',color:'#334155' }}>
                  <Download size={14} /> Unduh
                </button>
                <button onClick={() => setPreviewDoc(null)} style={{ display:'flex',alignItems:'center',justifyContent:'center',width:36,height:36,border:'none',background:'#f1f5f9',borderRadius:8,cursor:'pointer',color:'#64748b' }}>
                  <X size={20} />
                </button>
              </div>
            </div>
            <div style={{ flex:1,overflow:'auto',display:'flex',alignItems:'center',justifyContent:'center',background:'#f1f5f9',padding:16 }}>
              {isImageFile(previewDoc.url)
                ? <img src={previewDoc.url} alt={previewDoc.name} style={{ maxWidth:'100%',maxHeight:'100%',objectFit:'contain',borderRadius:4,boxShadow:'0 2px 8px rgba(0,0,0,0.1)' }} />
                : <iframe src={previewDoc.url} title={previewDoc.name} style={{ width:'100%',height:'100%',border:'none',borderRadius:4 }} />
              }
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default AdminLoanDetail;
