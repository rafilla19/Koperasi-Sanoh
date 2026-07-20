import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  Pen, 
  Handshake, 
  Loader2, 
  Save, 
  X, 
  ArrowLeft, 
  FileText, 
  User, 
  Building2, 
  CreditCard, 
  Wallet, 
  PiggyBank,
  CheckCircle,
  XCircle,
  Calendar,
  Phone,
  Mail,
  MapPin,
  ShieldCheck
} from 'lucide-react';
import { apiUrl, API_ORIGIN } from '../../services/api';
import './MemberDetail.css';
import '../../styles/members.css';

const MemberDetail = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const searchParams = new URLSearchParams(window.location.search);
  const source = searchParams.get('source') || 'loan-approval';
  const userStr = localStorage.getItem('user');
  const userLocal = userStr ? JSON.parse(userStr) : null;
  const roleId = parseInt(userLocal?.role_id || userLocal?.role?.id || userLocal?.roleId || 0, 10);
  
  const isAdmin = roleId === 1;
  const isEditMode = isAdmin || source === 'member-management';
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState(null);
  const [formData, setFormData] = useState(null);
  const [ktpUploadPath, setKtpUploadPath] = useState('');
  const [npwpUploadPath, setNpwpUploadPath] = useState('');
  const [uploadingDoc, setUploadingDoc] = useState({ ktp: false, npwp: false });
  const [departments, setDepartments] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [banks, setBanks] = useState([]);
  const [viewerDoc, setViewerDoc] = useState(null);

  useEffect(() => {
    fetchDropdowns();
    fetchMemberDetail();
  }, [id]);

  const fetchDropdowns = async () => {
    try {
      const [deptsRes, statusesRes, banksRes] = await Promise.all([
        fetch(apiUrl('/member/members/departments/')),
        fetch(apiUrl('/member/members/employee_statuses/')),
        fetch(apiUrl('/member/members/banks/'))
      ]);

      if (deptsRes.ok) setDepartments(await deptsRes.json());
      if (statusesRes.ok) setStatuses(await statusesRes.json());
      if (banksRes.ok) setBanks(await banksRes.json());
    } catch (error) {
      console.error('Failed to fetch dropdowns:', error);
    }
  };

  const fetchMemberDetail = async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl(`/member/members/${id}/member_full_detail/`));
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
        setFormData(data);
      } else {
        throw new Error('Failed to fetch member detail');
      }
    } catch (error) {
      console.error('Failed to fetch member detail:', error);
      alert('Failed to load member details');
    } finally {
      setLoading(false);
    }
  };

  const onlyNumeric = (val, maxLen = 999) => val.replace(/[^0-9]/g, '').slice(0, maxLen);

  const handleInputChange = (field, value) => {
    const normalizedValue = field === 'nik_employee' ? onlyNumeric(value, 12) : value;
    setFormData(prev => {
      const nextState = {
        ...prev,
        [field]: normalizedValue
      };

      if (field === 'employee_status_id' && value !== 2) {
        nextState.contract_end = '';
      }

      return nextState;
    });
  };

  const uploadDocument = async (field, file) => {
    if (!file) return;
    setUploadingDoc(prev => ({ ...prev, [field]: true }));

    const documentForm = new FormData();
    documentForm.append('file', file);
    documentForm.append('type', field);

    try {
      const res = await fetch(apiUrl('/member/members/upload_temp_document/'), {
        method: 'POST',
        body: documentForm,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      if (field === 'ktp') {
        setKtpUploadPath(data.file_path || '');
        setFormData(prev => ({ ...prev, ktp_file_path: data.file_path || prev.ktp_file_path }));
      } else {
        setNpwpUploadPath(data.file_path || '');
        setFormData(prev => ({ ...prev, npwp_file: data.file_path || prev.npwp_file }));
      }
    } catch (error) {
      console.error('Upload document failed:', error);
      alert('Gagal mengupload dokumen. Silakan coba lagi.');
    } finally {
      setUploadingDoc(prev => ({ ...prev, [field]: false }));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = new FormData();
      payload.append('full_name', formData.full_name || '');
      payload.append('nik_employee', formData.nik_employee || '');
      payload.append('phone_number', formData.phone_number || '');
      payload.append('email', formData.email || '');
      payload.append('address', formData.address || '');
      payload.append('gender', formData.gender || '');
      if (formData.department_id) payload.append('department_id', formData.department_id);
      if (formData.employee_status_id) payload.append('employee_status_id', formData.employee_status_id);
      if (formData.employee_status_id === 2 && formData.contract_end) {
        payload.append('contract_end', formData.contract_end);
      } else {
        payload.append('contract_end', '');
      }
      if (formData.account_number) payload.append('account_number', formData.account_number);
      if (formData.account_holder_name) payload.append('account_holder_name', formData.account_holder_name);
      if (formData.bank_id) payload.append('bank_id', formData.bank_id);
      if (ktpUploadPath) payload.append('ktpPath', ktpUploadPath);
      if (npwpUploadPath) payload.append('npwpPath', npwpUploadPath);

      const res = await fetch(apiUrl(`/member/members/${id}/update_member_profile/`), {
        method: 'PUT',
        body: payload
      });

      if (res.ok) {
        const updated = await res.json();
        setProfile(updated);
        setFormData(updated);
        setKtpUploadPath('');
        setNpwpUploadPath('');
        setIsEditing(false);
        alert('Profil anggota berhasil diperbarui');
      } else {
        alert('Gagal memperbarui profil');
      }
    } catch (error) {
      console.error('Save failed:', error);
      alert('Terjadi kesalahan saat menyimpan profil');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setFormData(profile);
    setKtpUploadPath('');
    setNpwpUploadPath('');
    setIsEditing(false);
  };

  const formatRupiah = (number, decimals = 0) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(number || 0);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('id-ID', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const resolveDocumentUrl = (filePath) => {
    if (!filePath) return '';
    const path = String(filePath).trim();
    if (!path) return '';
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    if (path.startsWith('/')) return `${API_ORIGIN}${path}`;
    if (path.startsWith('media/')) return `${API_ORIGIN}/${path}`;
    return `${API_ORIGIN}/media/${path}`;
  };

  const handlePreviewDocument = (filePath, title) => {
    const url = resolveDocumentUrl(filePath);
    if (!url) return;
    setViewerDoc({ title, url });
  };

  const getInitials = (name) => {
    if (!name) return 'U';
    return name
      .trim()
      .split(/\s+/)
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (loading) {
    return (
      <div className="md-loading-container">
        <Loader2 className="spinner md-spinner" size={36} />
        <p>Memuat rincian data anggota...</p>
      </div>
    );
  }

  if (!profile || !formData) {
    return (
      <div className="md-error-container">
        <p>Anggota tidak ditemukan</p>
        <button className="btn-back-error" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} /> Kembali
        </button>
      </div>
    );
  }

  const isStatusActive = profile.active_status === 'ACTIVE';

  return (
    <div className="md-container">
      {viewerDoc && (
        <div className="md-doc-viewer-overlay" onClick={() => setViewerDoc(null)}>
          <div className="md-doc-viewer-modal" onClick={(e) => e.stopPropagation()}>
            <div className="md-doc-viewer-header">
              <div className="md-doc-viewer-title">{viewerDoc.title}</div>
              <button className="md-doc-viewer-close" onClick={() => setViewerDoc(null)}>
                <X size={16} /> Tutup
              </button>
            </div>
            <iframe
              src={`${viewerDoc.url}#toolbar=1&navpanes=0&scrollbar=1`}
              className="md-doc-viewer-frame"
              title={viewerDoc.title}
            />
          </div>
        </div>
      )}
      {/* Header and Edit Button Section */}
      <div className="md-title-section">
        <div className="md-title-info">
          <h1 className="md-title">Detail Informasi Anggota</h1>
        </div>
        {isEditMode && !isEditing && (
          <button 
            className="btn-edit-mode"
            onClick={() => setIsEditing(true)}
          >
            <Pen size={15} /> Edit Profil
          </button>
        )}
      </div>

      {/* Premium ID Card Banner */}
      <div className="md-banner">
        <div className="md-banner-glow"></div>
        <div className="md-banner-top">
          <div className="md-banner-logo">
            <div className="icon"><Handshake size={18} /></div>
            <span>Koperasi Sanoh Sinergi Bersama</span>
          </div>
          <div className={`md-banner-badge ${isStatusActive ? 'active' : 'inactive'}`}>
            <span className="dot"></span>
            <span>{profile.active_status || 'ACTIVE'}</span>
          </div>
        </div>
        <div className="md-user-info-layout">
          <div className="md-user-avatar">
            {getInitials(profile.full_name)}
          </div>
          <div className="md-user-text">
            <h2>{profile.full_name}</h2>
            <div className="md-user-subfields">
              {/* <span className="nik-badge">{profile.nik_employee || 'Tidak ada NIK'}</span> */}
              <span className="separator">•</span>
              <span className="join-date-meta">Bergabung sejak {formatDate(profile.join_date)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Details Forms divided in Cards */}
      <div className="md-grid-layout">
        
        {/* Card 1: Personal & Contacts */}
        <div className="md-card">
          <div className="md-card-header">
            <User size={18} className="md-card-header-icon" />
            <h3>Informasi Pribadi & Kontak</h3>
          </div>
          <div className="md-card-body">
            <div className="md-form-group">
              <label className="lbl">Nama Lengkap</label>
              {isEditing ? (
                <input
                  type="text"
                  className="md-input"
                  value={formData.full_name || ''}
                  onChange={(e) => handleInputChange('full_name', e.target.value)}
                />
              ) : (
                <div className="md-value-box text-bold">{profile.full_name || '-'}</div>
              )}
            </div>

            <div className="md-form-group">
              <label className="lbl">NIK Employee</label>
              {isEditing ? (
                <input
                  type="text"
                  className="md-input"
                  value={formData.nik_employee  || ''}
                  maxLength={12}
                  onChange={(e) => handleInputChange('nik_employee', e.target.value)}
                />
              ) : (
                <div className="md-value-box text-bold">{profile.nik_employee || '-'}</div>
              )}
            </div>

            <div className="md-form-group">
              <label className="lbl">Jenis Kelamin</label>
              {isEditing ? (
                <select
                  className="md-input"
                  value={formData.gender || ''}
                  onChange={(e) => handleInputChange('gender', e.target.value)}
                >
                  <option value="">Pilih Jenis Kelamin</option>
                  <option value="M">Laki-laki (Male)</option>
                  <option value="F">Perempuan (Female)</option>
                </select>
              ) : (
                <div className="md-value-box">
                  {profile.gender === 'M' ? 'Laki-laki' : profile.gender === 'F' ? 'Perempuan' : profile.gender || '-'}
                </div>
              )}
            </div>

            <div className="md-form-group">
              <label className="lbl">Alamat Email</label>
              {isEditing ? (
                <div className="md-input-with-icon">
                  <Mail size={16} />
                  <input
                    type="email"
                    className="md-input input-icon-pad"
                    value={formData.email || ''}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                  />
                </div>
              ) : (
                <div className="md-value-box flex-align gap-2">
                  <Mail size={14} className="text-muted" />
                  <span>{profile.email || '-'}</span>
                </div>
              )}
            </div>

            <div className="md-form-group">
              <label className="lbl">Nomor Telepon</label>
              {isEditing ? (
                <div className="md-input-with-icon">
                  <Phone size={16} />
                  <input
                    type="text"
                    className="md-input input-icon-pad"
                    value={formData.phone_number || ''}
                    onChange={(e) => handleInputChange('phone_number', e.target.value)}
                  />
                </div>
              ) : (
                <div className="md-value-box flex-align gap-2">
                  <Phone size={14} className="text-muted" />
                  <span>{profile.phone_number || '-'}</span>
                </div>
              )}
            </div>

            <div className="md-form-group">
              <label className="lbl">Alamat Domisili</label>
              {isEditing ? (
                <textarea
                  className="md-input"
                  rows={3}
                  value={formData.address || ''}
                  onChange={(e) => handleInputChange('address', e.target.value)}
                />
              ) : (
                <div className="md-value-box address-box">
                  <MapPin size={14} className="text-muted flex-shrink-0" style={{ marginTop: '2px' }} />
                  <span>{profile.address || '-'}</span>
                </div>
              )}
            </div>

            <div className="md-form-group">
              <label className="lbl">Dokumen KTP</label>
              <div className="md-ktp-display-box">
                {profile.ktp_file_path ? (
                  <div className="md-file-attachment">
                    <FileText size={18} />
                    <div className="file-info">
                      <span className="file-name">KTP_{profile.full_name}.jpg</span>
                      <a 
                        href={resolveDocumentUrl(profile.ktp_file_path)} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="md-file-download-link"
                        onClick={(e) => {
                          e.preventDefault();
                          handlePreviewDocument(profile.ktp_file_path, `KTP - ${profile.full_name}`);
                        }}
                      >
                        Lihat Dokumen
                      </a>
                    </div>
                  </div>
                ) : (
                  <span className="no-file">Belum ada dokumen KTP terunggah</span>
                )}
                {isEditing && (
                  <input
                    type="file"
                    className="md-input mt-2"
                    accept="image/*,.pdf"
                    disabled={uploadingDoc.ktp}
                    onChange={(e) => uploadDocument('ktp', e.target.files?.[0] || null)}
                  />
                )}
                {uploadingDoc.ktp && <div className="uploading-note">Mengupload KTP...</div>}
              </div>
            </div>

            <div className="md-form-group">
              <label className="lbl">Dokumen NPWP</label>
              <div className="md-ktp-display-box">
                {profile.npwp_file ? (
                  <div className="md-file-attachment">
                    <FileText size={18} />
                    <div className="file-info">
                      <span className="file-name">NPWP_{profile.full_name}.jpg</span>
                      <a 
                        href={resolveDocumentUrl(profile.npwp_file)} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="md-file-download-link"
                        onClick={(e) => {
                          e.preventDefault();
                          handlePreviewDocument(profile.npwp_file, `NPWP - ${profile.full_name}`);
                        }}
                      >
                        Lihat Dokumen
                      </a>
                    </div>
                  </div>
                ) : (
                  <span className="no-file">Belum ada dokumen NPWP terunggah</span>
                )}
                {isEditing && (
                  <input
                    type="file"
                    className="md-input mt-2"
                    accept="image/*,.pdf"
                    disabled={uploadingDoc.npwp}
                    onChange={(e) => uploadDocument('npwp', e.target.files?.[0] || null)}
                  />
                )}
                {uploadingDoc.npwp && <div className="uploading-note">Mengupload NPWP...</div>}
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Employment & Banking */}
        <div className="md-card">
          <div className="md-card-header">
            <Building2 size={18} className="md-card-header-icon" />
            <h3>Kepegawaian & Rekening Bank</h3>
          </div>
          <div className="md-card-body">
            <div className="md-form-group">
              <label className="lbl">Departemen / Divisi</label>
              {isEditing ? (
                <select
                  className="md-input"
                  value={formData.department_id || ''}
                  onChange={(e) => handleInputChange('department_id', parseInt(e.target.value))}
                >
                  <option value="">Pilih Departemen</option>
                  {departments.map(dept => (
                    <option key={dept.id} value={dept.id}>
                      {dept.department_name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="md-value-box font-semibold">{profile.department_name || '-'}</div>
              )}
            </div>

            <div className="md-form-group">
              <label className="lbl">Status Kepegawaian</label>
              {isEditing ? (
                <select
                  className="md-input"
                  value={formData.employee_status_id || ''}
                  onChange={(e) => handleInputChange('employee_status_id', parseInt(e.target.value))}
                >
                  <option value="">Pilih Status</option>
                  {statuses.map(status => (
                    <option key={status.id} value={status.id}>
                      {status.status_name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="md-value-box">{profile.employee_status || '-'}</div>
              )}
            </div>

                {(formData && formData.employee_status_id === 2) && (
              <div className="md-form-group">
                <label className="lbl">Tanggal Berakhir Kontrak</label>
                {isEditing ? (
                  <div className="md-input-with-icon">
                    <Calendar size={16} />
                    <input
                      type="date"
                      className="md-input input-icon-pad"
                      value={formData.contract_end || ''}
                      onChange={(e) => handleInputChange('contract_end', e.target.value)}
                    />
                  </div>
                ) : (
                  <div className="md-value-box flex-align gap-2">
                    <Calendar size={14} className="text-muted" />
                    <span>{formatDate(profile.contract_end)}</span>
                  </div>
                )}
              </div>
            )}

            <div className="md-form-group" style={{ marginTop: '8px' }}>
              <div className="bank-section-title">
                <CreditCard size={15} />
                <span>Informasi Rekening Pencairan</span>
              </div>
            </div>

            <div className="md-form-group">
              <label className="lbl">Nama Bank</label>
              {isEditing ? (
                <select
                  className="md-input"
                  value={formData.bank_id || ''}
                  onChange={(e) => handleInputChange('bank_id', parseInt(e.target.value))}
                >
                  <option value="">Pilih Bank</option>
                  {banks.map(bank => (
                    <option key={bank.id} value={bank.id}>
                      {bank.bank_name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="md-value-box font-semibold">{profile.bank_name || '-'}</div>
              )}
            </div>

            <div className="md-form-group">
              <label className="lbl">Nama Pemilik Rekening</label>
              {isEditing ? (
                <input
                  type="text"
                  className="md-input"
                  value={formData.account_holder_name || ''}
                  onChange={(e) => handleInputChange('account_holder_name', e.target.value)}
                />
              ) : (
                <div className="md-value-box">{profile.account_holder_name || '-'}</div>
              )}
            </div>

            <div className="md-form-group">
              <label className="lbl">Nomor Rekening</label>
              {isEditing ? (
                <input
                  type="text"
                  className="md-input"
                  value={formData.account_number || ''}
                  onChange={(e) => handleInputChange('account_number', e.target.value)}
                />
              ) : (
                <div className="md-value-box font-mono font-semibold">{profile.account_number || '-'}</div>
              )}
            </div>
          </div>
        </div>

        {/* Card 3: Financial & Savings Details (Takes full width below) */}
        <div className="md-card full-width">
          <div className="md-card-header">
            <PiggyBank size={18} className="md-card-header-icon" />
            <h3>Informasi Saldo & Kewajiban Tabungan</h3>
          </div>
          <div className="md-card-body financial-grid">
            <div className="md-form-group">
              <label className="lbl text-accent">Total Saldo Tabungan</label>
              <div className="md-finance-badge saving">
                <span className="currency-label">Rp</span>
                <span className="balance-value">{formatRupiah(profile.saving_balance).replace('Rp', '').trim()}</span>
              </div>
            </div>

            <div className="md-form-group">
              <label className="lbl text-danger">Outstanding Pinjaman</label>
              <div className="md-finance-badge loan">
                <span className="currency-label">Rp</span>
                <span className="balance-value">{formatRupiah(profile.current_loan).replace('Rp', '').trim()}</span>
              </div>
            </div>

            <div className="md-form-group">
              <label className="lbl">Current SHU</label>
              <div className="md-finance-badge obligation-vol">
                <span className="currency-label">Rp</span>
                <span className="balance-value">{formatRupiah(profile.current_shu || profile.accrued_shu || 0, 2).replace('Rp', '').trim()}</span>
              </div>
            </div>

            <div className="md-form-group">
              <label className="lbl">Simpanan Wajib Bulanan</label>
              <div className="md-finance-badge obligation">
                <span className="currency-label">Rp</span>
                <span className="balance-value">{formatRupiah(profile.mandatory_amount).replace('Rp', '').trim()}</span>
              </div>
            </div>

            <div className="md-form-group">
              <label className="lbl">Simpanan Sukarela Bulanan</label>
              <div className="md-finance-badge obligation-vol">
                <span className="currency-label">Rp</span>
                <span className="balance-value">{formatRupiah(profile.voluntary_amount).replace('Rp', '').trim()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Action Footer */}
      <div className="md-footer-actions">
        {isEditing ? (
          <div className="md-edit-actions">
            <button
              className="btn-action-save"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? <Loader2 className="spinner" size={16} /> : <Save size={16} />}
              <span>Simpan Perubahan</span>
            </button>
            <button
              className="btn-action-cancel"
              onClick={handleCancel}
              disabled={saving}
            >
              <X size={16} />
              <span>Batal</span>
            </button>
          </div>
        ) : (
          <button 
            className="btn-action-back" 
            onClick={() => navigate(-1)}
          >
            <ArrowLeft size={16} />
            <span>Kembali ke Halaman Sebelumnya</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default MemberDetail;
