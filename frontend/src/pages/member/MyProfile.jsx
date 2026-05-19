import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Edit2, AlertTriangle, XCircle, CheckCircle, X, ShieldAlert, ChevronRight } from 'lucide-react';
import './MyProfile.css';

const MyProfile = () => {
  const [showClosureModal, setShowClosureModal] = useState(false);
  const [isAgreed, setIsAgreed] = useState(false);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);

  // Get user data from localStorage
  const userStr = localStorage.getItem('user');
  const userLocal = userStr ? JSON.parse(userStr) : null;
  const memberId = userLocal?.member_id || 1;

  const [isEditing, setIsEditing] = useState(false);
  const [profile, setProfile] = useState({
    fullName: '',
    nik: '',
    joinDate: '',
    phone: '',
    email: '',
    address: '',
    destBank: '',
    accName: '',
    accNo: '',
    volSaving: '',
    mandatoryBal: 0,
    voluntaryBal: 0,
    loanBal: 0
  });

  React.useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await fetch(`http://127.0.0.1:8000/api/loan/loan-applications/admin_member_profile/?member_id=${memberId}`);
        if (response.ok) {
          const data = await response.json();
          setProfile({
            fullName: data.full_name,
            nik: data.nik_employee,
            joinDate: data.join_date,
            phone: data.phone_number,
            email: data.email,
            address: data.address,
            destBank: data.bank_name || '',
            accName: data.account_holder_name || '',
            accNo: data.account_number || '',
            volSaving: '0', // This would need a separate endpoint for the set value
            mandatoryBal: data.saving_balance || 0,
            voluntaryBal: 0, // Placeholder
            loanBal: data.current_loan || 0
          });
        }
      } catch (error) {
        console.error('Failed to fetch profile:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [memberId]);

  const reasonLength = reason.length;
  const isReasonValid = reasonLength >= 500;
  const canProcess = isAgreed && isReasonValid;

  const handleSaveProfile = () => {
    if (!profile.phone || !profile.email || !profile.destBank || !profile.accName || !profile.accNo || !profile.volSaving) {
      alert("All profile fields must be filled before saving.");
      return;
    }
    setIsEditing(false);
    alert("Profile saved successfully!");
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
              <span className="pb-label">ID NUMBER</span>
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
              <select className="prof-input" value={profile.destBank} onChange={e => setProfile({...profile, destBank: e.target.value})} disabled={!isEditing}>
                <option value="">Select Bank</option>
                <option value="BCA">BCA</option>
                <option value="Mandiri">Mandiri</option>
                <option value="BNI">BNI</option>
                <option value="BRI">BRI</option>
              </select>
            </div>
            <div className="inp-group">
              <label className="inp-label">ACCOUNT NAME</label>
              <input type="text" className="prof-input" placeholder="Account holder name" value={profile.accName} onChange={e => setProfile({...profile, accName: e.target.value})} disabled={!isEditing} />
            </div>
            <div className="inp-group">
              <label className="inp-label">ACCOUNT NUMBER</label>
              <input type="text" className="prof-input" placeholder="xxxx xxxx xxxx" value={profile.accNo} onChange={e => setProfile({...profile, accNo: e.target.value})} disabled={!isEditing} />
            </div>
            <div className="inp-group" style={{ marginTop: '24px' }}>
              <label className="inp-label">
                VOLUNTARY SAVING <span className="badge-blue">SEND/APPROVED</span>
              </label>
              <span className="inp-desc">Editable only on the 22nd–23rd of each month (book closing period)</span>
              <div className="input-with-prefix">
                <div className="prefix">Rp</div>
                <input type="text" placeholder="0" value={profile.volSaving} onChange={e => setProfile({...profile, volSaving: e.target.value})} disabled={!isEditing} />
              </div>
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
          <button className="btn-close-account" onClick={() => setShowClosureModal(true)}>
            Close Account
            <ChevronRight size={16} />
          </button>
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
                <p>Please carefully review the details below. This summary explains your eligibility, the funds that must be returned, and the consequences of closing your account.</p>
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
                      <div className="eli-icon red"><XCircle size={14} strokeWidth={3} /></div>
                      <div className="eli-text">
                        <strong>Loan Balance is Fully Clear</strong>
                        <span>You have an outstanding loan balance of Rp {parseFloat(profile.loanBal).toLocaleString('id-ID')}</span>
                      </div>
                    </div>
                    <div className="eli-item">
                      <div className="eli-icon red"><XCircle size={14} strokeWidth={3} /></div>
                      <div className="eli-text">
                        <strong>No Overdue Loan Installments</strong>
                        <a href="#">Check here..</a>
                      </div>
                    </div>
                    <div className="eli-item">
                      <div className="eli-icon green"><CheckCircle size={14} strokeWidth={3} /></div>
                      <div className="eli-text">
                        <strong>No Pending Transaction</strong>
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
                      <strong>Rp 3.000.000,00</strong>
                    </div>
                    <div className="bal-item">
                      <span>Voluntary Saving</span>
                      <strong>Rp 3.000.000,00</strong>
                    </div>
                    <div className="bal-item">
                      <span>Accrued SHU</span>
                      <strong>Rp 3.000.000,00</strong>
                    </div>
                  </div>
                  <div className="bal-total">
                    <span>Total Amount To Be Received</span>
                    <span>Rp 9.000.000,00</span>
                  </div>
                </div>
              </div>

              {/* Reason Textarea */}
              <div className="inp-group">
                <label className="inp-label" style={{ color: '#94A3B8' }}>
                  REASON OF ACCOUNT CLOSURE (MIN 500 CHAR)
                </label>
                <textarea
                  className="prof-input"
                  style={{ minHeight: '120px' }}
                  placeholder="Please explain your reason for closing the account..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>

              {/* Agreement Box */}
              <div className="cm-agree-box">
                <div className="cm-agree-left">
                  <input
                    type="checkbox"
                    id="agree-closure"
                    checked={isAgreed}
                    onChange={(e) => setIsAgreed(e.target.checked)}
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
                  <button
                    className={`btn btn-red`}
                    style={{ opacity: isAgreed ? 1 : 0.6, cursor: isAgreed ? 'pointer' : 'not-allowed' }}
                    disabled={!isAgreed}
                  >
                    Process
                  </button>
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