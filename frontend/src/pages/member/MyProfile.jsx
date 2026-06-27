import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Edit2, AlertTriangle, XCircle, CheckCircle, X, ShieldAlert, ChevronRight, Loader } from 'lucide-react';
import { apiUrl } from '../../services/api';
import './MyProfile.css';

const MyProfile = () => {
  const navigate = useNavigate();
  const [showClosureModal, setShowClosureModal] = useState(false);
  const [isAgreed, setIsAgreed] = useState(false);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);

  // Get user data from localStorage
  const userStr = localStorage.getItem('user');
  const userLocal = userStr ? JSON.parse(userStr) : null;
  const memberId = userLocal?.member_id || 1;

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRequestingVoluntary, setIsRequestingVoluntary] = useState(false);
  const [isProcessingClosure, setIsProcessingClosure] = useState(false);
  const [banks, setBanks] = useState([]);
  const [isValidated, setIsValidated] = useState(true);
  const [isValidating, setIsValidating] = useState(false);
  const [demoBypass, setDemoBypass] = useState(false);
  const [pendingVoluntaryAmount, setPendingVoluntaryAmount] = useState(0);
  const [profile, setProfile] = useState({
    fullName: '',
    nik: '',
    joinDate: '',
    phone: '',
    email: '',
    address: '',
    destBank: '',
    bankId: '',
    accName: '',
    accNo: '',
    volSaving: '',
    volRequestSaving: '',
    mandatoryBal: 0,
    voluntaryBal: 0,
    loanBal: 0,
    accruedShu: 0,
    outstandingMonthlySavingDue: 0,
    hasPendingClosure: false
  });

  const fetchProfile = async ({ showLoading = false } = {}) => {
    if (showLoading) setLoading(true);

    try {
      const response = await fetch(apiUrl(`/member/members/profile_detail/?member_id=${memberId}`));
      if (response.ok) {
        const data = await response.json();
        const currentVoluntaryAmount = String(data.voluntary_amount ?? data.monthly_amount ?? 0);
        const pendingRequestAmount = Number(data.pending_voluntary_amount || 0);

        setProfile({
          fullName: data.full_name,
          nik: data.nik_employee,
          joinDate: data.join_date,
          phone: data.phone_number || '',
          email: data.email || '',
          address: data.address,
          destBank: data.bank_name || '',
          bankId: data.bank_id || '',
          accName: data.account_holder_name || '',
          accNo: data.account_number || '',
          volSaving: currentVoluntaryAmount,
          volRequestSaving: pendingRequestAmount > 0 ? String(pendingRequestAmount) : currentVoluntaryAmount,
          mandatoryBal: data.mandatory_balance || 0,
          voluntaryBal: data.voluntary_balance || 0,
          loanBal: data.loan_balance || data.current_loan || 0,
          accruedShu: data.accrued_shu || data.current_shu || 0,
          outstandingMonthlySavingDue: data.outstanding_monthly_saving_due || 0,
          hasPendingClosure: (data.pending_closure_count || 0) > 0
        });
        setPendingVoluntaryAmount(pendingRequestAmount);
        setIsValidated(true);
      }
    } catch (error) {
      console.error('Failed to fetch profile:', error);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  React.useEffect(() => {
    const fetchBanks = async () => {
      try {
        const response = await fetch(apiUrl('/master/banks/'));
        if (response.ok) {
          const data = await response.json();
          setBanks(data);
        }
      } catch (error) {
        console.error('Failed to fetch banks:', error);
      }
    };
    fetchBanks();
  }, []);

  React.useEffect(() => {
    fetchProfile({ showLoading: true });
  }, [memberId]);

  const reasonLength = reason.length;
  const netBalance = (parseFloat(profile.mandatoryBal) + parseFloat(profile.voluntaryBal) + parseFloat(profile.accruedShu)) - parseFloat(profile.loanBal) - parseFloat(profile.outstandingMonthlySavingDue);
  const hasOutstandingMonthlySavingDue = parseFloat(profile.outstandingMonthlySavingDue) > 0;
  const isNotMinus = netBalance >= 0;
  const hasNoBankAccount = !profile.bankId || !profile.accNo;
  const canProcess = isNotMinus && !hasOutstandingMonthlySavingDue && !hasNoBankAccount && isAgreed;

  const handleProcessClosure = async () => {
    if (!canProcess || isProcessingClosure) return;

    setIsProcessingClosure(true);
    try {
      const response = await fetch(apiUrl('/member/members/request_account_closure/'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          member_id: memberId,
          reason: reason
        })
      });

      const resData = await response.json();
      if (response.ok) {
        setProfile(prev => ({ ...prev, hasPendingClosure: true }));
        setShowClosureModal(false);
        alert("Permintaan penutupan akun berhasil dikirim! Status akun Anda sedang menunggu tinjauan.");
      } else {
        alert(resData.error || "Gagal mengirim permintaan penutupan.");
      }
    } catch (error) {
      console.error('Error processing closure:', error);
      alert('Kesalahan jaringan. Gagal mengirim permintaan.');
    } finally {
      setIsProcessingClosure(false);
    }
  };

  const handleVerifyAccount = async () => {
    if (!profile.destBank || !profile.accNo) {
      alert("Silakan pilih bank dan masukkan nomor rekening terlebih dahulu.");
      return;
    }
    
    setIsValidating(true);
    try {
      const response = await fetch(apiUrl('/master/banks/validate_account/'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          member_id: memberId,
          bank_code: profile.destBank,
          account_number: profile.accNo
        })
      });
      
      const resData = await response.json();
      if (response.ok && resData.status === 'valid') {
        setProfile(prev => ({ ...prev, accName: resData.account_name }));
        setIsValidated(true);
        alert(`Rekening berhasil diverifikasi!\nNama Pemilik: ${resData.account_name}`);
      } else {
        alert(resData.error || "Gagal memverifikasi rekening bank. Silakan periksa nomor rekening dan coba lagi.");
        setIsValidated(false);
      }
    } catch (error) {
      console.error('Error validating bank account:', error);
      alert('Kesalahan jaringan. Gagal memverifikasi rekening bank.');
      setIsValidated(false);
    } finally {
      setIsValidating(false);
    }
  };

  const handleSaveProfile = async () => {
    if (isSaving) return;
    if (!profile.phone || !profile.email || !profile.destBank || !profile.accName || !profile.accNo) {
      alert("Semua kolom profil harus diisi sebelum menyimpan.");
      return;
    }

    const selectedBankObj = banks.find(b => b.bank_name === profile.destBank);
    const bankId = selectedBankObj ? selectedBankObj.id : profile.bankId;

    setIsSaving(true);
    try {
      const response = await fetch(apiUrl('/member/members/update_profile/'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          member_id: memberId,
          phone: profile.phone,
          email: profile.email,
          bank_id: bankId,
          acc_name: profile.accName,
          acc_no: profile.accNo
        })
      });

      if (response.ok) {
        await fetchProfile();
        setIsEditing(false);
        alert("Profil berhasil disimpan!");
      } else {
        const errorData = await response.json();
        alert(`Gagal menyimpan profil: ${errorData.error || 'Kesalahan tidak diketahui'}`);
      }
    } catch (error) {
      console.error('Error saving profile:', error);
      alert('Gagal terhubung ke server. Silakan coba lagi.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmitVoluntaryRequest = async () => {
    if (isRequestingVoluntary) return;
    if (!profile.volRequestSaving) {
      alert("Silakan masukkan jumlah simpanan sukarela terlebih dahulu.");
      return;
    }

    setIsRequestingVoluntary(true);
    try {
      const response = await fetch(apiUrl('/member/members/request_voluntary_saving/'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          member_id: memberId,
          requested_amount: Number(profile.volRequestSaving),
          demo_bypass: demoBypass
        })
      });

      const resData = await response.json();
      if (response.ok) {
        await fetchProfile();
        alert("Permintaan perubahan simpanan sukarela berhasil dikirim dan menunggu persetujuan admin!");
      } else {
        alert(resData.error || "Gagal mengirim permintaan.");
      }
    } catch (error) {
      console.error('Error submitting voluntary request:', error);
      alert('Kesalahan jaringan. Gagal mengirim permintaan.');
    } finally {
      setIsRequestingVoluntary(false);
    }
  };

  return (
    <div className="prof-page">
      {/* HEADER */}
      <div className="prof-header">
        <h1>Profil Saya</h1>
        <p>Kelola informasi pribadi dan pengaturan akun Anda</p>
      </div>

      {/* BANNER */}
      <div className="prof-banner">
        <div className="pb-top">
          <div className="pb-logo">
            <div className="pb-logo-icon">🤝</div>
            <span>KOPERASI SANOH SINERGI BERSAMA</span>
          </div>
          <div className="pb-badge">AKTIF</div>
        </div>
        <div className="pb-content">
          <span className="pb-label">NAMA ANGGOTA</span>
          <h2 className="pb-name">{profile.fullName || '...'}</h2>
          <div className="pb-meta-grid">
            <div>
              <span className="pb-label">NIK Karyawan</span>
              <div className="pb-meta-val">{profile.nik || '...'}</div>
            </div>
            <div>
              <span className="pb-label">ANGGOTA SEJAK</span>
              <div className="pb-meta-val">
                {profile.joinDate ? new Date(profile.joinDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '...'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* FORM CARD */}
      <div className="prof-form-card">
        <div className="pf-grid">
          {/* Column 1 */}
          <div className="pf-col">
            <div className="inp-group">
              <label className="inp-label">NAMA LENGKAP</label>
              <input type="text" className="prof-input" value={profile.fullName} disabled />
            </div>
            <div className="inp-group">
              <label className="inp-label">NOMOR TELEPON</label>
              <input type="text" className="prof-input" value={profile.phone} onChange={e => setProfile({...profile, phone: e.target.value})} disabled={!isEditing} placeholder="+62 812 xxxx xxxx" />
            </div>
            <div className="inp-group">
              <label className="inp-label">EMAIL</label>
              <input type="email" className="prof-input" value={profile.email} onChange={e => setProfile({...profile, email: e.target.value})} disabled={!isEditing} placeholder="riska@email.com" />
            </div>
            <div className="inp-group">
              <label className="inp-label">ALAMAT</label>
              <textarea className="prof-input" disabled value={profile.address || '...'} />
            </div>
          </div>

          {/* Column 2 */}
          <div className="pf-col">
            <div className="inp-group">
              <label className="inp-label">REKENING BANK TUJUAN</label>
              <select 
                className="prof-input" 
                value={profile.destBank} 
                onChange={e => { setProfile({...profile, destBank: e.target.value, accName: ''}); setIsValidated(false); }} 
                disabled={!isEditing}
              >
                <option value="">Pilih Bank</option>
                {banks.map(b => (
                  <option key={b.id} value={b.bank_name}>{b.bank_name}</option>
                ))}
              </select>
            </div>
            <div className="inp-group">
              <label className="inp-label">NAMA PEMILIK REKENING</label>
              <input
                type="text"
                className="prof-input"
                placeholder="Nama pemilik rekening" 
                value={profile.accName} 
                onChange={e => setProfile({...profile, accName: e.target.value})}
                disabled={!isEditing} 
              />
            </div>
            <div className="inp-group">
              <label className="inp-label">NOMOR REKENING</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input 
                  type="text" 
                  className="prof-input" 
                  style={{ flex: 1 }}
                  placeholder="xxxx xxxx xxxx" 
                  value={profile.accNo} 
                  onChange={e => { setProfile({...profile, accNo: e.target.value, accName: ''}); setIsValidated(false); }} 
                  disabled={!isEditing} 
                />
                {/* {isEditing && (
                  <button 
                    type="button" 
                    onClick={handleVerifyAccount} 
                    disabled={isValidating || !profile.destBank || !profile.accNo}
                    style={{
                      padding: '0 16px',
                      backgroundColor: isValidated ? '#10b981' : '#2563eb',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontWeight: '600',
                      cursor: (isValidating || !profile.destBank || !profile.accNo) ? 'not-allowed' : 'pointer',
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      opacity: (isValidating || !profile.destBank || !profile.accNo) ? 0.6 : 1,
                      transition: 'all 0.2s'
                    }}
                  >
                    {isValidating ? 'Checking...' : (isValidated ? 'Verified' : 'Verify')}
                  </button>
                )} */}
              </div>
              {/* Validation warning removed */}
            </div>
            <div className="inp-group" style={{ marginTop: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="inp-label">
                  KEWAJIBAN SIMPANAN SUKARELA
                </label>
                {pendingVoluntaryAmount > 0 && (
                  <span style={{
                    fontSize: '11px',
                    backgroundColor: '#fef3c7',
                    color: '#d97706',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontWeight: '600'
                  }}>
                    Menunggu Persetujuan: Rp {parseFloat(pendingVoluntaryAmount).toLocaleString('id-ID')}
                  </span>
                )}
              </div>
              <span className="inp-desc">Jumlah aktif saat ini: Rp {parseFloat(profile.volSaving || 0).toLocaleString('id-ID')}</span>
              <span className="inp-desc">Hanya dapat diubah pada tanggal 22–23 setiap bulan (periode tutup buku)</span>
              
              {isEditing && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', marginTop: '4px' }}>
                  <input 
                    type="checkbox" 
                    id="demo-bypass" 
                    checked={demoBypass} 
                    onChange={e => setDemoBypass(e.target.checked)} 
                    style={{ cursor: 'pointer' }}
                  />
                  <label htmlFor="demo-bypass" style={{ fontSize: '11px', color: '#64748b', cursor: 'pointer', fontWeight: '500' }}>
                    🔧 Presentation Demo Mode (Bypass 22nd-23rd lock)
                  </label>
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px' }}>
                <div className="input-with-prefix" style={{ flex: 1, display: 'flex' }}>
                  <div className="prefix" style={{
                    backgroundColor: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    borderRight: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 12px',
                    borderTopLeftRadius: '8px',
                    borderBottomLeftRadius: '8px',
                    color: '#64748b',
                    fontSize: '14px',
                    fontWeight: '600'
                  }}>Rp</div>
                  <input 
                    type="text" 
                    placeholder="0" 
                    value={profile.volRequestSaving} 
                    onChange={e => setProfile({...profile, volRequestSaving: e.target.value})} 
                    disabled={!isEditing || !(new Date().getDate() === 22 || new Date().getDate() === 23 || demoBypass)} 
                    style={{
                      flex: 1,
                      borderTopLeftRadius: 0,
                      borderBottomLeftRadius: 0
                    }}
                  />
                </div>
                {isEditing && (new Date().getDate() === 22 || new Date().getDate() === 23 || demoBypass) && (
                  <button
                    type="button"
                    onClick={handleSubmitVoluntaryRequest}
                    disabled={isRequestingVoluntary}
                    style={{
                      padding: '0 16px',
                      backgroundColor: '#0a1628',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontWeight: '600',
                      cursor: isRequestingVoluntary ? 'not-allowed' : 'pointer',
                      fontSize: '12px',
                      whiteSpace: 'nowrap',
                      transition: 'background-color 0.2s',
                      opacity: isRequestingVoluntary ? 0.7 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    {isRequestingVoluntary ? <><Loader size={12} className="spinner" /> Mengirim...</> : 'Ajukan Perubahan'}
                  </button>
                )}
              </div>

              {isEditing && !(new Date().getDate() === 22 || new Date().getDate() === 23 || demoBypass) && (
                <span style={{ fontSize: '11px', color: '#ef4444', marginTop: '4px', display: 'block' }}>
                  Perubahan dikunci. Periode akses dibatasi pada tanggal 22-23 setiap bulan.
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="pf-actions">
          <button className="btn btn-outline" onClick={() => setIsEditing(!isEditing)}>
            <Edit2 size={16} /> {isEditing ? 'Batal Edit' : 'Edit Profil'}
          </button>
          <button className="btn btn-navy" onClick={handleSaveProfile} disabled={!isEditing || isSaving} style={{ opacity: (isEditing && !isSaving) ? 1 : 0.6, cursor: (isEditing && !isSaving) ? 'pointer' : 'not-allowed' }}>
            {isSaving ? <><Loader size={14} className="spinner" /> Menyimpan...</> : 'Simpan'}
          </button>
        </div>
      </div>

      {/* ─── ACCOUNT CLOSURE SECTION ─── */}
      <div className="closure-section">
        <div className="closure-section-inner">
          <div className="closure-left">
            <div className="closure-icon-wrap">
              <ShieldAlert size={22} />
            </div>
            <div className="closure-text">
              <h3>Penutupan Akun</h3>
              <p>Menutup akun akan menghentikan semua akses dan layanan koperasi secara permanen. Semua hak anggota dan kewajiban yang belum diselesaikan akan diproses sesuai dengan peraturan koperasi yang berlaku.</p>
            </div>
          </div>
          {profile.hasPendingClosure ? (
            <button className="btn-close-account" style={{ background: '#94a3b8', color: '#f1f5f9', borderColor: '#94a3b8', cursor: 'not-allowed' }} disabled>
              Menunggu Persetujuan
              <ChevronRight size={16} />
            </button>
          ) : (
            <button className="btn-close-account" onClick={() => setShowClosureModal(true)}>
              Tutup Akun
              <ChevronRight size={16} />
            </button>
          )}
        </div>
      </div>

      {/* ─── MODAL ─── */}
      {showClosureModal && createPortal(
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowClosureModal(false)}>
          <div className="closure-modal">

            {/* Modal Header */}
            <div className="cm-header">
              <div>
                <h2>Ringkasan Penutupan Akun</h2>
                <p>Tinjau kelayakan, penyelesaian, dan dampak penutupan sebelum mengirim.</p>
              </div>
              <button className="cm-close" onClick={() => setShowClosureModal(false)} aria-label="Close modal">
                <X size={16} />
              </button>
            </div>

            <div className="cm-body">

              {/* Two-column grid */}
              <div className="cm-grid">

                {/* Eligibility */}
                <div className="cm-card">
                  <h4>Pengecekan Kelayakan</h4>
                  <div className="eligibility-list">
                    <div className="eli-item">
                      <div className={`eli-icon ${profile.loanBal > 0 ? 'red' : 'green'}`}>
                        {profile.loanBal > 0 ? <XCircle size={14} strokeWidth={3} /> : <CheckCircle size={14} strokeWidth={3} />}
                      </div>
                      <div className="eli-text">
                        <strong>Saldo Pinjaman</strong>
                        {profile.loanBal > 0 ? (
                          <span>Tertunggak Rp {parseFloat(profile.loanBal).toLocaleString('id-ID')}.</span>
                        ) : (
                          <span>Lunas.</span>
                        )}
                      </div>
                    </div>
                    <div className="eli-item">
                      <div className={`eli-icon ${hasOutstandingMonthlySavingDue ? 'red' : 'green'}`}>
                        {hasOutstandingMonthlySavingDue ? <XCircle size={14} strokeWidth={3} /> : <CheckCircle size={14} strokeWidth={3} />}
                      </div>
                      <div className="eli-text">
                        <strong>Tagihan Simpanan Bulanan</strong>
                        {hasOutstandingMonthlySavingDue ? (
                          <span>Tertunggak Rp {parseFloat(profile.outstandingMonthlySavingDue).toLocaleString('id-ID')}.</span>
                        ) : (
                          <span>Lunas.</span>
                        )}
                      </div>
                    </div>
                    <div className="eli-item">
                      <div className={`eli-icon ${profile.loanBal > 0 ? 'red' : 'green'}`}>
                        {profile.loanBal > 0 ? <XCircle size={14} strokeWidth={3} /> : <CheckCircle size={14} strokeWidth={3} />}
                      </div>
                      <div className="eli-text">
                        <strong>Angsuran Pinjaman</strong>
                        {profile.loanBal > 0 ? (
                          <span>
                            <span
                              className="eli-link"
                              onClick={() => { setShowClosureModal(false); navigate('/dashboard/loans'); }}
                            >
                              Tinjau angsuran aktif
                            </span>
                          </span>
                        ) : (
                          <span>Lunas.</span>
                        )}
                      </div>
                    </div>
                    <div className="eli-item">
                      <div className="eli-icon green"><CheckCircle size={14} strokeWidth={3} /></div>
                      <div className="eli-text">
                        <strong>Transaksi Tertunda</strong>
                        <span>Tidak ada.</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Balance Summary */}
                <div className="cm-card">
                  <h4>Ringkasan Saldo</h4>
                  <div className="bal-list">
                    <div className="bal-item">
                      <span>Simpanan Wajib</span>
                      <strong>Rp {parseFloat(profile.mandatoryBal).toLocaleString('id-ID')}</strong>
                    </div>
                    <div className="bal-item">
                      <span>Simpanan Sukarela</span>
                      <strong>Rp {parseFloat(profile.voluntaryBal).toLocaleString('id-ID')}</strong>
                    </div>
                    <div className="bal-item">
                      <span>SHU Terakumulasi</span>
                      <strong>Rp {parseFloat(profile.accruedShu).toLocaleString('id-ID')}</strong>
                    </div>
                  </div>
                  <div className="bal-total">
                    <span>Total Yang Akan Diterima</span>
                    <span>Rp {netBalance.toLocaleString('id-ID')}</span>
                  </div>
                </div>
              </div>

              {/* Reason Textarea */}
              <div className="inp-group">
                <label className="inp-label" style={{ color: '#94A3B8' }}>
                  Alasan Penutupan
                </label>
                <textarea
                  className="prof-input"
                  style={{ minHeight: '120px' }}
                  placeholder="Jelaskan alasan Anda secara singkat..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>

              {(netBalance < 0 || hasOutstandingMonthlySavingDue) && (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', backgroundColor: '#fff1f2', border: '1px solid #fecaca', padding: '12px 16px', borderRadius: '8px', color: '#be123c', fontSize: '13px', fontWeight: '500', marginBottom: '15px' }}>
                  <AlertTriangle size={18} strokeWidth={2.5} style={{ flexShrink: 0 }} />
                  <span>Penutupan diblokir sampai pinjaman dan tagihan simpanan bulanan dilunasi.</span>
                </div>
              )}

              {hasNoBankAccount && (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', backgroundColor: '#fff7ed', border: '1px solid #fed7aa', padding: '12px 16px', borderRadius: '8px', color: '#c2410c', fontSize: '13px', fontWeight: '500', marginBottom: '15px' }}>
                  <AlertTriangle size={18} strokeWidth={2.5} style={{ flexShrink: 0 }} />
                  <span>Lengkapi data rekening bank Anda terlebih dahulu sebelum mengajukan penutupan akun.</span>
                </div>
              )}

              {profile.hasPendingClosure && (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', padding: '12px 16px', borderRadius: '8px', color: '#1d4ed8', fontSize: '13px', fontWeight: '500', marginBottom: '15px' }}>
                  <ShieldAlert size={18} strokeWidth={2.5} style={{ flexShrink: 0 }} />
                  <span>Permintaan penutupan akun Anda telah dikirim dan sedang menunggu tinjauan dari administrator.</span>
                </div>
              )}

              {/* Agreement Box */}
              <div className="cm-agree-box">
                <div className="cm-agree-left">
                  <input
                    type="checkbox"
                    id="agree-closure"
                    checked={isAgreed}
                    onChange={(e) => setIsAgreed(e.target.checked)}
                    disabled={profile.hasPendingClosure}
                  />
                  <label htmlFor="agree-closure">
                    Saya telah membaca konsekuensi dan menyetujui syarat dan ketentuan penutupan akun.
                  </label>
                </div>
                <div className="cm-agree-right">
                  <button
                    className="btn btn-outline"
                    style={{ background: '#F8FAFC', border: '1px solid #0A1628', color: '#0A1628' }}
                    onClick={() => setShowClosureModal(false)}
                  >
                    Batal
                  </button>
                  {profile.hasPendingClosure ? (
                    <button
                      className="btn"
                      style={{ background: '#cbd5e1', color: '#64748b', cursor: 'not-allowed', fontWeight: 'bold' }}
                      disabled
                    >
                      Menunggu Persetujuan
                    </button>
                  ) : (
                    <button
                      className={`btn btn-red`}
                      style={{ opacity: (canProcess && !isProcessingClosure) ? 1 : 0.6, cursor: (canProcess && !isProcessingClosure) ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '6px' }}
                      disabled={!canProcess || isProcessingClosure}
                      onClick={handleProcessClosure}
                    >
                      {isProcessingClosure ? <><Loader size={14} className="spinner" /> Memproses...</> : 'Proses'}
                    </button>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default MyProfile;