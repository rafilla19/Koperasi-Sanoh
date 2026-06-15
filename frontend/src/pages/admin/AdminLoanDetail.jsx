import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { User, Printer, UploadCloud, Edit2, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
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

  const decisionNote = rejectReason.trim();
  const isDecisionLocked = decisionNote.length === 0;

  // Compute allocation status
  const parsedAmount = parseFloat(amountRequested) || 0;
  const isOverLimit = remainingAllocation !== null && parsedAmount > remainingAllocation;

  const handleApprove = async () => {
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
        headers: getAuthHeaders(true), // passing true for FormData if your api.js supports it, else default headers without Content-Type
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
    }
  };

  const handleReject = async () => {
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

    try {
      const userStr = localStorage.getItem('user');
      const user = userStr ? JSON.parse(userStr) : null;
      const adminId = user?.id || 1;

      const response = await fetch(apiUrl(`/loan/loan-applications/${id}/reject/`), {
        method: 'POST',
        headers: getAuthHeaders(),
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
                <p><strong>Phone:</strong> {detail.phone_number}</p>
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
              <a 
                className="doc-preview-link" 
                href={resolveDocumentUrl(detail.salary_statement_file)} 
                target="_blank" 
                rel="noopener noreferrer"
              >
                <Printer size={20} color="#4f46e5" />
                <span>{getDocumentName(detail.salary_statement_file)}</span>
              </a>
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
                disabled={isDecisionLocked}
              >
                Tolak Pengajuan
              </button>
              <button 
                className={`btn-approve ${isOverLimit ? 'disabled' : ''}`} 
                onClick={handleApprove} 
                disabled={isDecisionLocked || !proofFile || isOverLimit}
              >
                {isOverLimit ? 'Dana Kurang' : 'Setujui Pinjaman'}
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
    </div>
  );
};

export default AdminLoanDetail;
