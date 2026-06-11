import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Edit2, AlertTriangle, XCircle, CheckCircle, X, ShieldAlert, ChevronRight } from 'lucide-react';
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
          hasPendingClosure: data.has_pending_closure || false
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
  const canProcess = isNotMinus && !hasOutstandingMonthlySavingDue && isAgreed;

  const handleProcessClosure = async () => {
    if (!canProcess) return;
    
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
        alert("Account closure request submitted successfully! Your account status is now pending review.");
      } else {
        alert(resData.error || "Failed to submit closure request.");
      }
    } catch (error) {
      console.error('Error processing closure:', error);
      alert('Network error. Failed to submit request.');
    }
  };

  const handleVerifyAccount = async () => {
    if (!profile.destBank || !profile.accNo) {
      alert("Please select a bank and enter the account number first.");
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
        alert(`Account successfully verified!\nOwner Name: ${resData.account_name}`);
      } else {
        alert(resData.error || "Failed to verify bank account. Please check the account number and try again.");
        setIsValidated(false);
      }
    } catch (error) {
      console.error('Error validating bank account:', error);
      alert('Network error. Failed to verify bank account.');
      setIsValidated(false);
    } finally {
      setIsValidating(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!profile.phone || !profile.email || !profile.destBank || !profile.accName || !profile.accNo) {
      alert("All profile fields must be filled before saving.");
      return;
    }

    // Removed mandatory bank validation as requested
    
    const selectedBankObj = banks.find(b => b.bank_name === profile.destBank);
    const bankId = selectedBankObj ? selectedBankObj.id : profile.bankId;
    
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
        alert("Profile saved successfully!");
      } else {
        const errorData = await response.json();
        alert(`Failed to save profile: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error saving profile:', error);
      alert('Error connecting to the server. Please try again.');
    }
  };

  const handleSubmitVoluntaryRequest = async () => {
    if (!profile.volRequestSaving) {
      alert("Please enter a voluntary saving amount first.");
      return;
    }
    
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
        alert("Voluntary saving change request submitted successfully and is pending admin approval!");
      } else {
        alert(resData.error || "Failed to submit request.");
      }
    } catch (error) {
      console.error('Error submitting voluntary request:', error);
      alert('Network error. Failed to submit request.');
    }
  };

  return (
    <div className="prof-page">
      {/* HEADER */}
      <div className="prof-header">
        <h1>My Profile</h1>
        <p>Manage your personal information and account settings</p>
      </div>

      {/* BANNER */}
      <div className="prof-banner">
        <div className="pb-top">
          <div className="pb-logo">
            <div className="pb-logo-icon">🤝</div>
            <span>KOPERASI SANOH SINERGI BERSAMA</span>
          </div>
          <div className="pb-badge">ACTIVE</div>
        </div>
        <div className="pb-content">
          <span className="pb-label">MEMBER NAME</span>
          <h2 className="pb-name">{profile.fullName || '...'}</h2>
          <div className="pb-meta-grid">
            <div>
              <span className="pb-label">NIK Employee</span>
              <div className="pb-meta-val">{profile.nik || '...'}</div>
            </div>
            <div>
              <span className="pb-label">MEMBER SINCE</span>
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
              <label className="inp-label">FULL NAME</label>
              <input type="text" className="prof-input" value={profile.fullName} disabled />
            </div>
            <div className="inp-group">
              <label className="inp-label">PHONE NUMBER</label>
              <input type="text" className="prof-input" value={profile.phone} onChange={e => setProfile({...profile, phone: e.target.value})} disabled={!isEditing} placeholder="+62 812 xxxx xxxx" />
            </div>
            <div className="inp-group">
              <label className="inp-label">EMAIL</label>
              <input type="email" className="prof-input" value={profile.email} onChange={e => setProfile({...profile, email: e.target.value})} disabled={!isEditing} placeholder="riska@email.com" />
            </div>
            <div className="inp-group">
              <label className="inp-label">ADDRESS</label>
              <textarea className="prof-input" disabled value={profile.address || '...'} />
            </div>
          </div>

          {/* Column 2 */}
          <div className="pf-col">
            <div className="inp-group">
              <label className="inp-label">DESTINATION BANK ACCOUNT</label>
              <select 
                className="prof-input" 
                value={profile.destBank} 
                onChange={e => { setProfile({...profile, destBank: e.target.value, accName: ''}); setIsValidated(false); }} 
                disabled={!isEditing}
              >
                <option value="">Select Bank</option>
                {banks.map(b => (
                  <option key={b.id} value={b.bank_name}>{b.bank_name}</option>
                ))}
              </select>
            </div>
            <div className="inp-group">
              <label className="inp-label">ACCOUNT NAME</label>
              <input 
                type="text" 
                className="prof-input" 
                placeholder="Account holder name" 
                value={profile.accName} 
                onChange={e => setProfile({...profile, accName: e.target.value})}
                disabled={!isEditing} 
              />
            </div>
            <div className="inp-group">
              <label className="inp-label">ACCOUNT NUMBER</label>
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
                  VOLUNTARY SAVING OBLIGATION
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
                    Pending Approval: Rp {parseFloat(pendingVoluntaryAmount).toLocaleString('id-ID')}
                  </span>
                )}
              </div>
              <span className="inp-desc">Current active amount: Rp {parseFloat(profile.volSaving || 0).toLocaleString('id-ID')}</span>
              <span className="inp-desc">Editable only on the 22nd–23rd of each month (book closing period)</span>
              
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
                    style={{
                      padding: '0 16px',
                      backgroundColor: '#0a1628',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      fontSize: '12px',
                      whiteSpace: 'nowrap',
                      transition: 'background-color 0.2s'
                    }}
                  >
                    Request Change
                  </button>
                )}
              </div>

              {isEditing && !(new Date().getDate() === 22 || new Date().getDate() === 23 || demoBypass) && (
                <span style={{ fontSize: '11px', color: '#ef4444', marginTop: '4px', display: 'block' }}>
                  Modification locked. Access period is restricted to dates 22-23 of each month.
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="pf-actions">
          <button className="btn btn-outline" onClick={() => setIsEditing(!isEditing)}>
            <Edit2 size={16} /> {isEditing ? 'Cancel Edit' : 'Edit Profile'}
          </button>
          <button className="btn btn-navy" onClick={handleSaveProfile} disabled={!isEditing} style={{ opacity: isEditing ? 1 : 0.6, cursor: isEditing ? 'pointer' : 'not-allowed' }}>Save</button>
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
              <h3>Account Closure</h3>
              <p>Closing your account will permanently terminate all access and cooperative services. All member rights and outstanding obligations will be settled in accordance with applicable cooperative regulations.</p>
            </div>
          </div>
          {profile.hasPendingClosure ? (
            <button className="btn-close-account" style={{ background: '#e11d48', color: 'white', borderColor: '#e11d48', cursor: 'pointer' }} onClick={() => setShowClosureModal(true)}>
              Closure Pending Approval
              <ChevronRight size={16} />
            </button>
          ) : (
            <button className="btn-close-account" onClick={() => setShowClosureModal(true)}>
              Close Account
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
                <h2>Account Closure Summary</h2>
                <p>Review eligibility, settlement, and closure impact before submitting.</p>
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
                  <h4>Eligibility Check</h4>
                  <div className="eligibility-list">
                    <div className="eli-item">
                      <div className={`eli-icon ${profile.loanBal > 0 ? 'red' : 'green'}`}>
                        {profile.loanBal > 0 ? <XCircle size={14} strokeWidth={3} /> : <CheckCircle size={14} strokeWidth={3} />}
                      </div>
                      <div className="eli-text">
                        <strong>Loan Balance</strong>
                        {profile.loanBal > 0 ? (
                          <span>Outstanding Rp {parseFloat(profile.loanBal).toLocaleString('id-ID')}.</span>
                        ) : (
                          <span>Clear.</span>
                        )}
                      </div>
                    </div>
                    <div className="eli-item">
                      <div className={`eli-icon ${hasOutstandingMonthlySavingDue ? 'red' : 'green'}`}>
                        {hasOutstandingMonthlySavingDue ? <XCircle size={14} strokeWidth={3} /> : <CheckCircle size={14} strokeWidth={3} />}
                      </div>
                      <div className="eli-text">
                        <strong>Monthly Saving Bill</strong>
                        {hasOutstandingMonthlySavingDue ? (
                          <span>Outstanding Rp {parseFloat(profile.outstandingMonthlySavingDue).toLocaleString('id-ID')}.</span>
                        ) : (
                          <span>Clear.</span>
                        )}
                      </div>
                    </div>
                    <div className="eli-item">
                      <div className={`eli-icon ${profile.loanBal > 0 ? 'red' : 'green'}`}>
                        {profile.loanBal > 0 ? <XCircle size={14} strokeWidth={3} /> : <CheckCircle size={14} strokeWidth={3} />}
                      </div>
                      <div className="eli-text">
                        <strong>Loan Installments</strong>
                        {profile.loanBal > 0 ? (
                          <span>
                            <span
                              className="eli-link"
                              onClick={() => { setShowClosureModal(false); navigate('/dashboard/loans'); }}
                            >
                              Review active installments
                            </span>
                          </span>
                        ) : (
                          <span>Clear.</span>
                        )}
                      </div>
                    </div>
                    <div className="eli-item">
                      <div className="eli-icon green"><CheckCircle size={14} strokeWidth={3} /></div>
                      <div className="eli-text">
                        <strong>Pending Transactions</strong>
                        <span>None.</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Balance Summary */}
                <div className="cm-card">
                  <h4>Balance Summary</h4>
                  <div className="bal-list">
                    <div className="bal-item">
                      <span>Mandatory Saving</span>
                      <strong>Rp {parseFloat(profile.mandatoryBal).toLocaleString('id-ID')}</strong>
                    </div>
                    <div className="bal-item">
                      <span>Voluntary Saving</span>
                      <strong>Rp {parseFloat(profile.voluntaryBal).toLocaleString('id-ID')}</strong>
                    </div>
                    <div className="bal-item">
                      <span>Accrued SHU</span>
                      <strong>Rp {parseFloat(profile.accruedShu).toLocaleString('id-ID')}</strong>
                    </div>
                  </div>
                  <div className="bal-total">
                    <span>Total Amount To Be Received</span>
                    <span>Rp {netBalance.toLocaleString('id-ID')}</span>
                  </div>
                </div>
              </div>

              {/* Reason Textarea */}
              <div className="inp-group">
                <label className="inp-label" style={{ color: '#94A3B8' }}>
                  Reason for Closure
                </label>
                <textarea
                  className="prof-input"
                  style={{ minHeight: '120px' }}
                  placeholder="Briefly explain your reason..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>

              {(netBalance < 0 || hasOutstandingMonthlySavingDue) && (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', backgroundColor: '#fff1f2', border: '1px solid #fecaca', padding: '12px 16px', borderRadius: '8px', color: '#be123c', fontSize: '13px', fontWeight: '500', marginBottom: '15px' }}>
                  <AlertTriangle size={18} strokeWidth={2.5} style={{ flexShrink: 0 }} />
                  <span>Closure is blocked until loans and monthly saving bills are settled.</span>
                </div>
              )}

              {profile.hasPendingClosure && (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', padding: '12px 16px', borderRadius: '8px', color: '#1d4ed8', fontSize: '13px', fontWeight: '500', marginBottom: '15px' }}>
                  <ShieldAlert size={18} strokeWidth={2.5} style={{ flexShrink: 0 }} />
                  <span>Your account closure request has been submitted and is currently pending review by the administrator.</span>
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
                    I have read the consequence and agree to the account closure terms and conditions.
                  </label>
                </div>
                <div className="cm-agree-right">
                  <button
                    className="btn btn-outline"
                    style={{ background: '#F8FAFC', border: '1px solid #0A1628', color: '#0A1628' }}
                    onClick={() => setShowClosureModal(false)}
                  >
                    Cancel
                  </button>
                  {profile.hasPendingClosure ? (
                    <button
                      className="btn"
                      style={{ background: '#cbd5e1', color: '#64748b', cursor: 'not-allowed', fontWeight: 'bold' }}
                      disabled
                    >
                      Pending Approval
                    </button>
                  ) : (
                    <button
                      className={`btn btn-red`}
                      style={{ opacity: canProcess ? 1 : 0.6, cursor: canProcess ? 'pointer' : 'not-allowed' }}
                      disabled={!canProcess}
                      onClick={handleProcessClosure}
                    >
                      Process
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