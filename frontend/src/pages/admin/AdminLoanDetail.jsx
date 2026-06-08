import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { User, Printer, UploadCloud, Edit2 } from 'lucide-react';
import { API_ORIGIN, apiUrl } from '../../services/api';
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
    fetch(apiUrl(`/loan/loan-applications/${id}/admin_application_detail/`))
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
    fetch(apiUrl(`/loan/loan-applications/${id}/get_ai_suggestion/`))
      .then(res => res.json())
      .then(data => {
        if (!data.error) {
          setAiSuggestion(data);
          // Auto-suggest interest if needed, or just display it
          setInterestRate(String(data.suggested_interest_rate));
        }
      })
      .catch(err => console.error('AI Suggestion Error:', err));
  }, [id]);

  const handleProfileClick = () => {
    if (detail && detail.member_id) {
      navigate(`/dashboard/admin/members/${detail.member_id}`);
    }
  };

  const [rejectReason, setRejectReason] = useState('');

  const decisionNote = rejectReason.trim();
  const isDecisionLocked = decisionNote.length === 0;

  const handleApprove = async () => {
    if (isDecisionLocked) {
      alert('Silakan isi catatan keputusan sebelum menyetujui pinjaman.');
      return;
    }
    if (!proofFile) {
      alert('Silakan unggah bukti transfer sebelum menyetujui pinjaman.');
      return;
    }
    if (!window.confirm('Apakah Anda yakin ingin menyetujui pinjaman ini?')) return;
    
    try {
      // Get admin_id from user in localStorage
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
    if (!window.confirm('Apakah Anda yakin ingin menolak pengajuan ini?')) return;

    try {
      // Get admin_id from user in localStorage
      const userStr = localStorage.getItem('user');
      const user = userStr ? JSON.parse(userStr) : null;
      const adminId = user?.id || 1;

      const response = await fetch(apiUrl(`/loan/loan-applications/${id}/reject/`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  if (!detail) return <div style={{ padding: '24px' }}>Memuat...</div>;

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
    <div className="admin-loan-detail">
      <div className="aldet-header-area">
        <div className="aldet-header-left">
          <h1>Detail Pinjaman</h1>
          <span className="aldet-badge active">Menunggu</span>
        </div>
        <p className="aldet-submitted">Diajukan pada {formatDate(detail.applied_at)}</p>
      </div>

      <div className="aldet-profile-card">
        <div className="aldet-profile-top">
          <div className="aldet-profile-avatar">
            <User size={32} color="white" />
          </div>
          <div className="aldet-profile-info-grid">
            <div className="aldet-pi-col">
              <div className="aldet-pi-name">{detail.full_name}</div>
              <div className="aldet-pi-sub">Departement: {detail.department_name}</div>
              <div className="aldet-pi-sub">NIK: {detail.nik_employee}</div>
            </div>
            <div className="aldet-pi-col">
              <div className="aldet-pi-sub">Email: {detail.email}</div>
              <div className="aldet-pi-sub">Phone: {detail.phone_number}</div>
            </div>
          </div>
        </div>
        <button className="aldet-view-profile-btn" onClick={handleProfileClick}>
          Lihat profil
        </button>
      </div>

      <div className="aldet-layout">
        <div className="aldet-left-col">
          <h2 className="aldet-section-title">Detail Pinjaman</h2>
          <div className="aldet-loan-info-grid">
            <div className="aldet-info-box">
              <div className="aldet-ib-header">
                <div className="aldet-ib-label">Jumlah Pinjaman</div>
                <button className="aldet-edit-btn" onClick={() => setIsEditingAmount(!isEditingAmount)}>
                  <Edit2 size={14} />
                </button>
              </div>
              
              {isEditingAmount ? (
                <div className="aldet-edit-row">
                  <span style={{ fontSize: '14px', fontWeight: '700' }}>Rp</span>
                  <input
                    type="number"
                    value={amountRequested}
                    onChange={(e) => setAmountRequested(e.target.value)}
                    className="aldet-input"
                    style={{ width: '120px' }}
                  />
                </div>
              ) : (
                <div className="aldet-ib-value lg">{formatRupiah(amountRequested)}</div>
              )}

              <div className="aldet-ib-label mt">Jenis Pinjaman</div>
              <div className="aldet-ib-value">{detail.loan_type_name || 'Tidak ada'}</div>
              
              <div className="aldet-ib-label mt">Tujuan Pinjaman</div>
              <div className="aldet-ib-value">{detail.purpose || 'Tidak ada'}</div>
            </div>

            <div className="aldet-info-box">
              <div className="aldet-ib-header">
                <div className="aldet-ib-label">Jangka Waktu Cicilan</div>
                <button className="aldet-edit-btn" onClick={() => setIsEditingTerm(!isEditingTerm)}>
                  <Edit2 size={14} />
                </button>
              </div>
              {isEditingTerm ? (
                <div className="aldet-edit-row">
                  <input
                    type="number"
                    value={repaymentTerm}
                    onChange={(e) => setRepaymentTerm(e.target.value)}
                    className="aldet-input"
                  />
                  <span>bulan</span>
                </div>
              ) : (
                <div className="aldet-ib-value mb">{repaymentTerm} bulan</div>
              )}

              <div className="aldet-ib-header mt">
                <div className="aldet-ib-label">Bunga</div>
                <button className="aldet-edit-btn" onClick={() => setIsEditingInterest(!isEditingInterest)}>
                  <Edit2 size={14} />
                </button>
              </div>
              <div className="aldet-ib-recommend">Rekomendasi: {aiSuggestion?.suggested_interest_rate || '0.5'}%</div>
              {isEditingInterest ? (
                <div className="aldet-edit-row">
                  <input
                    type="number"
                    step="0.1"
                    value={interestRate}
                    onChange={(e) => setInterestRate(e.target.value)}
                    className="aldet-input"
                  />
                  <span>%/bulan (flat)</span>
                </div>
              ) : (
                <div className="aldet-ib-value">{interestRate}%/bulan (flat)</div>
              )}
            </div>
          </div>

          <div className="aldet-risk">
            <span className="aldet-risk-label">Kelayakan Pinjaman</span>
            <span className={`aldet-risk-val ${aiSuggestion?.eligibility?.toLowerCase() || 'low'}`}>
              {aiSuggestion?.eligibility || 'Sedang dihitung...'}
            </span>
            {aiSuggestion && (
              <span className="aldet-risk-conf">Keyakinan: {aiSuggestion.confidence_score}%</span>
            )}
          </div>

          <div className="aldet-decision">
            <h3 className="aldet-section-title">Catatan Keputusan Admin</h3>
            <textarea 
              placeholder="Tulis catatan penolakan atau catatan keputusan di sini"
              className="aldet-textarea"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            ></textarea>
            {isDecisionLocked && (
              <div style={{ marginTop: '8px', color: '#b91c1c', fontSize: '13px' }}>
                Catatan keputusan wajib diisi sebelum menyetujui atau menolak.
              </div>
            )}
          </div>

          <div className="aldet-upload">
            <h3 className="aldet-section-title">Bukti Transfer</h3>
            <label className="aldet-dropzone" htmlFor="proof_of_transfer_input">
              <UploadCloud size={30} color="#4f7df3" />
              <strong>Unggah bukti transfer</strong>
              <p>Format PNG, JPG, JPEG, atau PDF. File akan disimpan ke bucket loan/bukti_transfer.</p>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#4f7df3' }}>Klik untuk memilih file</span>
            </label>
            <input
              id="proof_of_transfer_input"
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setProofFile(file);
                setProofFileName(file ? file.name : '');
              }}
              style={{ display: 'none' }}
            />
            {proofFileName && (
              <div style={{ marginTop: 10, fontSize: 13, color: '#4b5563', fontWeight: 600 }}>
                File terpilih: {proofFileName}
              </div>
            )}
          </div>

          <div className="aldet-upload">
            <h3 className="aldet-section-title">Dokumen Slip Gaji</h3>
            <div className="aldet-doc-preview" style={{ marginBottom: '24px' }}>
              {detail.salary_statement_file ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', background: '#fcfcfc', border: '1px dashed #cbd5e1', borderRadius: '8px' }}>
                  <Printer size={24} color="#4f7df3" />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a1a' }}>{getDocumentName(detail.salary_statement_file)}</div>
                    <a
                      href={resolveDocumentUrl(detail.salary_statement_file)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: '13px', color: '#4f7df3', textDecoration: 'none' }}
                    >
                      Klik untuk melihat dokumen
                    </a>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '16px', color: '#666', background: '#fcfcfc', border: '1px dashed #cbd5e1', borderRadius: '8px', textAlign: 'center' }}>
                  Belum ada dokumen yang diunggah
                </div>
              )}
            </div>
          </div>

          <div className="aldet-actions">
            <button className="aldet-action-btn reject" onClick={handleReject} disabled={isDecisionLocked} aria-disabled={isDecisionLocked}>TOLAK</button>
            <button className="aldet-action-btn approve" onClick={handleApprove} disabled={isDecisionLocked || !proofFile} aria-disabled={isDecisionLocked || !proofFile}>SETUJUI</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminLoanDetail;
