import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { Download, FileText, Loader2, Upload, CheckCircle, XCircle, X, Eye } from 'lucide-react';
import { apiUrl, API_ORIGIN } from '../../services/api';
import './ApprovalDetail.css';

const ApprovalDetail = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const searchParams = new URLSearchParams(window.location.search);
  const type = searchParams.get('type') || 'new';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [approvalStatus, setApprovalStatus] = useState(null);
  const [comment, setComment] = useState('');
  const [uploadLoading, setUploadLoading] = useState(false);
  const [transferFile, setTransferFile] = useState(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewDoc, setPreviewDoc] = useState(null);

  useEffect(() => {
    fetchData();
  }, [id, type]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const endpoint = type === 'close' 
        ? apiUrl('/member/members/pending_close_accounts/')
        : apiUrl('/member/members/pending_registrations/');
      
      const res = await fetch(endpoint);
      if (res.ok) {
        const allData = await res.json();
        const item = allData.find(d => d.id == id);
        if (item) {
          setData(item);
              // populate transferFile state if already present
              setTransferFile(item.transfer_file || item.transfer_file_path || null);
        }
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('id-ID');
  };

  const formatRupiah = (number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(number || 0);
  };

  const getFileName = (urlOrPath, prefix) => {
    if (!urlOrPath) return '-';
    try {
      const url = String(urlOrPath);
      const last = url.split('/').filter(Boolean).pop();
      return prefix ? `${prefix} • ${last}` : last;
    } catch (e) {
      return String(urlOrPath).slice(0, 30) + '...';
    }
  };

  const resolveFileUrl = (filePath) => {
    if (!filePath) return '';
    const path = String(filePath).trim();
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    const baseOrigin = API_ORIGIN || window.location.origin;
    if (path.startsWith('/')) return `${baseOrigin}${path}`;
    return `${baseOrigin}/${path}`;
  };

  const handleDownloadFile = (filePath) => {
    if (filePath) {
      window.open(resolveFileUrl(filePath), '_blank');
    }
  };

  const handlePreviewDoc = (filePath, docName) => {
    if (filePath) {
      setPreviewDoc({ url: resolveFileUrl(filePath), name: docName || 'Document' });
    }
  };

  const isImageFile = (url) => {
    if (!url) return false;
    return /\.(jpg|jpeg|png|gif|bmp|webp|svg)(\?|$)/i.test(url);
  };

  const handleTransferFileUpload = async (event) => {
    // Defer upload: just keep selected file in state until Approve/Reject
    const file = event.target.files?.[0];
    if (!file) return;
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_SIZE) {
      alert('File size exceeds 10MB limit');
      return;
    }
    setSelectedFile(file);
    // clear any previous upload flags
    setUploadSuccess(false);
    setTransferFile(null);
  };

  const handleApprove = async () => {
    setActionLoading(true);
    try {
      let endpoint, body;
      
      if (type === 'close') {
        // Call close account approve endpoint
        endpoint = apiUrl('/master/auth/approve_close_account/');
        // If a file was selected but not yet uploaded, send multipart form data
        if (selectedFile) {
          const formData = new FormData();
          formData.append('transfer_file', selectedFile);
          formData.append('id', data.id);
          formData.append('comment', comment || '');
          formData.append('admin_id', parseInt(sessionStorage.getItem('user_id')) || 1);
          body = formData;
        } else {
          body = JSON.stringify({
            id: data.id,
            comment: comment || '',
            admin_id: parseInt(sessionStorage.getItem('user_id')) || 1,
            transfer_file: transferFile || ''
          });
        }
        if (!selectedFile && !transferFile) {
          alert('Silakan unggah bukti transfer sebelum menyetujui penutupan akun.');
          setActionLoading(false);
          return;
        }
        if (!comment?.trim()) {
          alert('Silakan isi komentar sebelum menyetujui penutupan akun.');
          setActionLoading(false);
          return;
        }
      } else {
        endpoint = apiUrl(`/member/members/${id}/approve_registration/`);
        if (!comment?.trim()) {
          alert('Silakan isi komentar sebelum menyetujui pendaftaran.');
          setActionLoading(false);
          return;
        }
        body = JSON.stringify({ comment: comment || '' });
      }

      const fetchOpts = { method: 'POST' };
      if (body instanceof FormData) {
        fetchOpts.body = body;
      } else {
        fetchOpts.headers = { 'Content-Type': 'application/json' };
        fetchOpts.body = body;
      }
      const res = await fetch(endpoint, fetchOpts);

      if (res.ok) {
        setApprovalStatus('approved');
        setTimeout(() => navigate(-1), 2000);
      } else {
        const error = await res.json();
        alert(`Approval failed: ${error.error || error.message}`);
      }
    } catch (error) {
      console.error('Approval failed:', error);
      alert('Approval error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    setActionLoading(true);
    try {
      let endpoint, body;
      
      if (type === 'close') {
        endpoint = apiUrl('/master/auth/reject_close_account/');
        if (!comment?.trim()) {
          alert('Silakan masukkan komentar penolakan.');
          setActionLoading(false);
          return;
        }
        body = JSON.stringify({
          id: data.id,
          comment: comment || '',
          admin_id: parseInt(sessionStorage.getItem('user_id')) || 1
        });
      } else {
        endpoint = apiUrl(`/member/members/${id}/reject_registration/`);
        if (!comment?.trim()) {
          alert('Silakan isi komentar penolakan.');
          setActionLoading(false);
          return;
        }
        body = JSON.stringify({ comment: comment || '' });
      }

      const fetchOpts2 = { method: 'POST' };
      if (body instanceof FormData) {
        fetchOpts2.body = body;
      } else {
        fetchOpts2.headers = { 'Content-Type': 'application/json' };
        fetchOpts2.body = body;
      }
      const res = await fetch(endpoint, fetchOpts2);

      if (res.ok) {
        setApprovalStatus('rejected');
        setTimeout(() => navigate(-1), 2000);
      } else {
        const error = await res.json();
        alert(`Rejection failed: ${error.error || error.message}`);
      }
    } catch (error) {
      console.error('Rejection failed:', error);
      alert('Rejection error');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <Loader2 className="spinner" size={32} />
        <p>Loading approval details...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <p>No data found</p>
        <button onClick={() => navigate(-1)} style={{ marginTop: '1rem' }}>Back</button>
      </div>
    );
  }

  const isNewRegistration = type !== 'close';

  const hasComment = !!(comment && comment.trim());
  const hasTransferFile = !!transferFile || !!selectedFile;
  const canApprove = type === 'close' ? (hasComment && hasTransferFile) : hasComment;
  const canReject = hasComment;

  return (
    <div className="ad-detail-container">
      {/* Status Alert */}
      {approvalStatus && (
        <div className={`approval-alert ${approvalStatus}`}>
          {approvalStatus === 'approved' ? (
            <>
              <CheckCircle size={20} />
              <span>Approval berhasil diproses!</span>
            </>
          ) : (
            <>
              <XCircle size={20} />
              <span>Rejection berhasil diproses!</span>
            </>
          )}
        </div>
      )}

      {/* Header */}
      <div className="add-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 className="add-title">
            {isNewRegistration ? 'Permintaan Pendaftaran Akun Baru' : 'Permintaan Close Akun'}
          </h1>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '32px' }}>
        {/* Left Column - Form Data */}
        <div>
          <div className="form-section">
            <h3 className="section-title">Informasi Pribadi</h3>
            <div className="add-form">
              <div className="add-form-group">
                <label className="lbl">Nama Lengkap</label>
                <input type="text" className="add-input" value={data.full_name || ''} disabled />
              </div>
              <div className="add-form-group">
                <label className="lbl">NIK (Nomor Induk Kependudukan)</label>
                <input type="text" className="add-input" value={isNewRegistration ? (data.nik || '') : (data.nik_ktp || '')} disabled />
              </div>

              {isNewRegistration && (
                <>
                  <div className="add-form-group">
                    <label className="lbl">Tempat Lahir</label>
                    <input type="text" className="add-input" value={data.place_of_birth || ''} disabled />
                  </div>
                  <div className="add-form-group">
                    <label className="lbl">Tanggal Lahir</label>
                    <input type="date" className="add-input" value={data.date_of_birth || ''} disabled />
                  </div>
                  <div className="add-form-group">
                    <label className="lbl">Jenis Kelamin</label>
                    <input type="text" className="add-input" value={data.gender || ''} disabled />
                  </div>
                  <div className="add-form-group">
                    <label className="lbl">NPWP</label>
                    <input type="text" className="add-input" value={data.npwp_number || ''} disabled />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Contact Information */}
          <div className="form-section">
            <h3 className="section-title">Informasi Kontak & Alamat</h3>
            <div className="add-form">
              <div className="add-form-group">
                <label className="lbl">Email</label>
                <input type="email" className="add-input" value={data.email || ''} disabled />
              </div>
              <div className="add-form-group">
                <label className="lbl">Nomor Telepon</label>
                <div className="add-input-group">
                  <span className="add-input-prefix">+62</span>
                  <input type="text" className="add-input" value={data.phone_number?.replace(/^62/, '') || ''} disabled />
                </div>
              </div>
              {data.address && (
                <div className="add-form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="lbl">Alamat</label>
                  <textarea className="add-input" rows={4} value={data.address || ''} disabled></textarea>
                </div>
              )}
            </div>
          </div>

          {/* Employment Information */}
          {isNewRegistration && (
            <div className="form-section">
              <h3 className="section-title">Informasi Pekerjaan</h3>
              <div className="add-form">
                <div className="add-form-group">
                  <label className="lbl">NIK Karyawan</label>
                  <input type="text" className="add-input" value={data.employee_nik || ''} disabled />
                </div>
                <div className="add-form-group">
                  <label className="lbl">Status Karyawan</label>
                  <input type="text" className="add-input" value={data.employee_status || ''} disabled />
                </div>
                <div className="add-form-group">
                  <label className="lbl">Departemen</label>
                  <input type="text" className="add-input" value={data.department_name || ''} disabled />
                </div>
                {data.contract_end && (
                  <div className="add-form-group">
                    <label className="lbl">Tanggal Akhir Kontrak</label>
                    <input type="date" className="add-input" value={data.contract_end?.split('T')[0] || ''} disabled />
                  </div>
                )}
              </div>

              {/* Financial Information */}
              <h3 className="section-title">Informasi Keuangan</h3>
              <div className="add-form">
                {data.voluntary_saving && (
                  <div className="add-form-group">
                    <label className="lbl">Tabungan Sukarela</label>
                    <div className="add-input-group">
                      <span className="add-input-prefix">Rp</span>
                      <input type="text" className="add-input" value={formatRupiah(data.voluntary_saving)} disabled />
                    </div>
                  </div>
                )}
              </div>

              {/* Agreement Information */}
              <h3 className="section-title">Perjanjian</h3>
              <div className="add-form">
                <div className="add-form-group">
                  <label className="lbl">Agreement Sudah Dicek</label>
                  <input type="text" className="add-input" value={data.agreement_checked ? 'Ya' : 'Tidak'} disabled />
                </div>
                {data.payroll_agreement && (
                  <div className="add-form-group">
                    <label className="lbl">Perjanjian Gaji Sudah Dicek</label>
                    <input type="text" className="add-input" value={'Ya'} disabled />
                  </div>
                )}
              </div>

              {/* Registration Date */}
              <h3 className="section-title">Data Pendaftaran</h3>
              <div className="add-form">
                <div className="add-form-group">
                  <label className="lbl">Tanggal Pendaftaran</label>
                  <input type="text" className="add-input" value={formatDate(data.created_at)} disabled />
                </div>
                <div className="add-form-group">
                  <label className="lbl">Email Terverifikasi</label>
                  <input type="text" className="add-input" value={data.email_verified ? 'Ya' : 'Tidak'} disabled />
                </div>
              </div>
            </div>
          )}

          {/* Close Account Info */}
          {!isNewRegistration && (
            <div className="form-section">
              <h3 className="section-title">Informasi Tutup Akun</h3>
              <div className="add-form">
                <div className="add-form-group">
                  <label className="lbl">NIK Karyawan</label>
                  <input type="text" className="add-input" value={data.nik_employee || ''} disabled />
                </div>
                <div className="add-form-group">
                  <label className="lbl">Alasan</label>
                  <textarea className="add-input" rows={4} value={data.reason || ''} disabled></textarea>
                </div>
                <div className="add-form-group">
                  <label className="lbl">Tanggal Permintaan</label>
                  <input type="text" className="add-input" value={formatDate(data.request_date)} disabled />
                </div>
                <div className="add-form-group">
                  <label className="lbl">Status</label>
                  <input type="text" className="add-input" value={data.status || 'Pending'} disabled />
                </div>
                {data.status_code && (
                  <div className="add-form-group">
                    <label className="lbl">Status Code</label>
                    <input type="text" className="add-input" value={data.status_code || ''} disabled />
                  </div>
                )}
              </div>

              {/* Financial Information */}
              <h3 className="section-title">Informasi Keuangan</h3>
              <div className="add-form">
                <div className="add-form-group">
                  <label className="lbl">Tabungan Wajib</label>
                  <input type="text" className="add-input" value={formatRupiah(data.mandatory_saving_balance || data.mandatory_savings_balance)} disabled />
                </div>
                <div className="add-form-group">
                  <label className="lbl">Tabungan Sukarela</label>
                  <input type="text" className="add-input" value={formatRupiah(data.voluntary_saving_balance || data.voluntary_savings_balance)} disabled />
                </div>
                <div className="add-form-group">
                  <label className="lbl">SHU Terakumulasi</label>
                  <input type="text" className="add-input" value={formatRupiah(data.accrued_shu_amount || data.accrued_shu)} disabled />
                </div>
                <div className="add-form-group">
                  <label className="lbl">Pinjaman Tertunda</label>
                  <input type="text" className="add-input" value={formatRupiah(data.outstanding_loan_balance || data.outstanding_loans)} disabled />
                </div>
                <div className="add-form-group">
                  <label className="lbl">Total Piutang</label>
                  <input type="text" className="add-input" value={formatRupiah(data.total_amount_to_receive)} disabled style={{ background: '#E8F5E9' }} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column - Documents & Actions */}
        <div>
          {/* Document Section */}
          <div className="form-section">
            <h3 className="section-title">Dokumen</h3>
            <div className="documents-list">
              {isNewRegistration && data.npwp_file && (
                <div className="document-item">
                  <div className="doc-icon">
                    <FileText size={20} />
                  </div>
                  <div className="doc-info">
                    <p className="doc-name">NPWP</p>
                    <p className="doc-path">{getFileName(data.npwp_file)}</p>
                  </div>
                  <div className="doc-actions">
                    <button className="doc-action-btn" onClick={() => handleDownloadFile(data.npwp_file)}>
                      <span className="doc-action-icon"><Download size={14} /></span>
                      Unduh
                    </button>
                    <button className="doc-action-btn" onClick={() => handlePreviewDoc(data.npwp_file, 'NPWP')}>
                      <span className="doc-action-icon"><Eye size={14} /></span>
                      Lihat
                    </button>
                  </div>
                </div>
              )}

              {isNewRegistration && data.ktp_file && (
                <div className="document-item">
                  <div className="doc-icon">
                    <FileText size={20} />
                  </div>
                  <div className="doc-info">
                    <p className="doc-name">KTP</p>
                    <p className="doc-path">{getFileName(data.ktp_file)}</p>
                  </div>
                  <div className="doc-actions">
                    <button className="doc-action-btn" onClick={() => handleDownloadFile(data.ktp_file)}>
                      <span className="doc-action-icon"><Download size={14} /></span>
                      Unduh
                    </button>
                    <button className="doc-action-btn" onClick={() => handlePreviewDoc(data.ktp_file, 'KTP')}>
                      <span className="doc-action-icon"><Eye size={14} /></span>
                      Lihat
                    </button>
                  </div>
                </div>
              )}

              {/* {isNewRegistration && data.payroll_agreement && (
                <div className="document-item">
                  <div className="doc-icon">
                    <FileText size={20} />
                  </div>
                  <div className="doc-info">
                    <p className="doc-name">Payroll Agreement</p>
                    <p className="doc-path">{data.payroll_agreement}</p>
                  </div>
                  <button className="doc-download" onClick={() => handleDownloadFile(data.payroll_agreement)}>
                    <Download size={16} />
                  </button>
                </div>
              )} */}

              {!isNewRegistration && (data.transfer_file_path || data.transfer_file || transferFile) && (
                <div className="document-item">
                  <div className="doc-icon">
                    <FileText size={20} />
                  </div>
                  <div className="doc-info">
                    <p className="doc-name">Transfer Bukti</p>
                    <p className="doc-path">{getFileName(data.transfer_file_path || data.transfer_file || transferFile)}</p>
                  </div>
                  <div className="doc-actions">
                    <button className="doc-action-btn" onClick={() => handleDownloadFile(data.transfer_file_path || data.transfer_file || transferFile)}>
                      <span className="doc-action-icon"><Download size={14} /></span>
                      Unduh
                    </button>
                    <button className="doc-action-btn" onClick={() => handlePreviewDoc(data.transfer_file_path || data.transfer_file || transferFile, 'Bukti Transfer')}>
                      <span className="doc-action-icon"><Eye size={14} /></span>
                      Lihat
                    </button>
                  </div>
                </div>
              )}

              {/* File Upload for Close Account - always show upload box; show uploaded file info when present */}
              {!isNewRegistration && (
                <div className="upload-file-container">
                  { (data.transfer_file_path || data.transfer_file || transferFile || selectedFile) ? (
                    <div className="uploaded-file-box" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '14px', fontWeight: 700 }}>
                          {selectedFile ? selectedFile.name : getFileName(data.transfer_file_path || data.transfer_file || transferFile, 'Transfer')}
                        </div>
                        <div style={{ fontSize: '13px', color: '#64748b' }}>
                          {selectedFile ? 'File dipilih — akan tersimpan saat Anda klik Setujui/Tolak' : 'File sudah terunggah'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn" onClick={() => handleDownloadFile(data.transfer_file_path || data.transfer_file || transferFile)}>
                          <Download size={14} /> Lihat
                        </button>
                        <label className="btn" style={{ cursor: uploadLoading ? 'not-allowed' : 'pointer' }}>
                          Ganti File
                          <input type="file" onChange={handleTransferFileUpload} disabled={uploadLoading} accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" style={{ display: 'none' }} />
                        </label>
                      </div>
                    </div>
                  ) : (
                    <label className="upload-file-label">
                      <div className="upload-file-box">
                        {uploadLoading ? (
                          <>
                            <Loader2 size={24} className="spinner" />
                            <p>Uploading...</p>
                          </>
                        ) : (
                          <>
                            <Upload size={24} />
                            <p>Upload Transfer File</p>
                            <span>Click to upload or drag file (Max 10MB)</span>
                          </>
                        )}
                      </div>
                      <input
                        type="file"
                        onChange={handleTransferFileUpload}
                        disabled={uploadLoading}
                        style={{ display: 'none' }}
                        accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                      />
                    </label>
                  )}
                </div>
              )}

              {uploadSuccess && (
                <div style={{ 
                  padding: '12px', 
                  background: '#DCFCE7', 
                  border: '1px solid #86EFAC',
                  borderRadius: '8px',
                  color: '#166534',
                  fontSize: '14px',
                  fontWeight: '600'
                }}>
                  ✓ File berhasil diupload
                </div>
              )}
            </div>
          </div>

          {/* Approval Section - Display Status and Notes */}
          <div className="form-section approval-section">
            <h3 className="section-title">Status Keputusan</h3>
            
            <div className="status-display-container">
              {/* Status Code Badge */}
              <div className="status-code-badge" style={{
                background: data?.status_id === 7 ? '#16A34A' : 
                           data?.status_id === 45 ? '#16A34A' :
                           data?.status_id === 5 ? '#DC2626' : 
                           data?.status_id === 46 ? '#DC2626' :
                           data?.status_id === 6 ? '#F59E0B' : '#94A3B8',
                color: '#fff'
              }}>
                {data?.status || 'NO STATUS'}
              </div>

              {/* Approval Buttons - Conditional Display */}
              {((type === 'new' && data?.status_id === 3) || (type === 'close' && data?.status_id === 44)) && !approvalStatus && (
                <div className="approval-actions">
                  <div style={{ marginBottom: '12px' }}>
                    <label className="lbl">Komentar / Catatan</label>
                    <textarea
                      className="comment-input"
                      placeholder="Masukkan komentar (wajib)"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      rows={3}
                    />
                    {type === 'close' && !canApprove && (
                      <div style={{ marginTop: '8px', color: '#B91C1C', fontSize: '13px' }}>
                        {!hasTransferFile && !hasComment
                          ? 'Unggah bukti transfer dan isi komentar untuk menyetujui.'
                          : !hasTransferFile
                          ? 'Unggah bukti transfer untuk dapat menyetujui penutupan akun.'
                          : 'Komentar diperlukan untuk menyetujui penutupan akun.'}
                      </div>
                    )}
                    {type !== 'close' && !canApprove && (
                      <div style={{ marginTop: '8px', color: '#B91C1C', fontSize: '13px' }}>
                        Komentar diperlukan untuk menyetujui pendaftaran.
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '12px', flexDirection: 'column' }}>
                    <button 
                      className="btn-approve"
                      onClick={handleApprove}
                      disabled={actionLoading || !canApprove}
                    >
                      {actionLoading ? <Loader2 size={16} /> : <CheckCircle size={16} />}
                      Setujui
                    </button>
                    <button 
                      className="btn-reject"
                      onClick={handleReject}
                      disabled={actionLoading || !canReject}
                    >
                      {actionLoading ? <Loader2 size={16} /> : <XCircle size={16} />}
                      Tolak
                    </button>
                  </div>
                </div>
              )}

              {/* Display Notes if already processed */}
              {((type === 'new' && data?.notes) || (type === 'close' && (data?.admin_reason || data?.reject_reason))) && (
                <div className="notes-display">
                  <label className="notes-label">Catatan:</label>
                  <div className="notes-content">
                    {type === 'close' ? (data?.admin_reason || data?.reject_reason) : data?.notes}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Back Button */}
          <button className="btn-back" onClick={() => navigate(-1)}>
            Kembali
          </button>
        </div>
      </div>

      {previewDoc && createPortal(
        <div className="doc-preview-overlay" onClick={() => setPreviewDoc(null)}>
          <div className="doc-preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="doc-preview-header">
              <h3>{previewDoc.name}</h3>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button className="doc-action-btn" onClick={() => handleDownloadFile(previewDoc.url)} style={{ margin: 0 }}>
                  <Download size={14} /> Unduh
                </button>
                <button className="doc-preview-close" onClick={() => setPreviewDoc(null)}>
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="doc-preview-body">
              {isImageFile(previewDoc.url) ? (
                <img src={previewDoc.url} alt={previewDoc.name} className="doc-preview-img" />
              ) : (
                <iframe src={previewDoc.url} title={previewDoc.name} className="doc-preview-iframe" />
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default ApprovalDetail;
