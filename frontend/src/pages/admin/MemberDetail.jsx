import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Pen, Handshake } from 'lucide-react';
import './MemberDetail.css';

const MemberDetail = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    fetch(`http://127.0.0.1:8000/api/loan/loan-applications/admin_member_profile/?member_id=${id}`)
      .then(res => res.json())
      .then(data => {
        if (!data.error) {
          setProfile(data);
        }
      })
      .catch(err => console.error(err));
  }, [id]);

  if (!profile) return <div style={{ padding: '24px' }}>Loading...</div>;

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
    return date.toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  return (
    <div className="md-container">
      <h1 className="md-title">Detail Member</h1>

      <div className="md-banner">
        <div className="md-banner-top">
          <div className="md-banner-logo">
            <div className="icon"><Handshake size={20} /></div>
            Koperasi Sanoh Sinergi Bersama
          </div>
          <div className="md-banner-badge">{profile.active_status}</div>
        </div>
        <div className="md-user-info">
          <div>
            <h2>{profile.full_name}</h2>
            <p>{profile.nik_employee}</p>
          </div>
          <div className="account-number">{profile.account_number}</div>
        </div>
      </div>

      <div className="md-content">
        <div className="md-form-column">
          <div className="md-form-group">
            <label className="lbl">Full Name</label>
            <input type="text" className="md-input" value={profile.full_name || ''} disabled />
          </div>

          <div className="md-form-group">
            <label className="lbl">Phone Number</label>
            <input type="text" className="md-input" value={profile.phone_number || ''} disabled />
          </div>

          <div className="md-form-group">
            <label className="lbl">Email</label>
            <input type="email" className="md-input" value={profile.email || ''} disabled />
          </div>

          <div className="md-form-group">
            <label className="lbl">Address</label>
            <textarea className="md-input" rows={4} disabled value={profile.address || ''} />
          </div>

          <div className="md-form-group">
            <label className="lbl">Department</label>
            <input type="text" className="md-input" value={profile.department_name || ''} disabled />
          </div>

          <div className="md-form-group">
            <label className="lbl">Gender</label>
            <input type="text" className="md-input" value={profile.gender || ''} disabled />
          </div>

          <div className="md-form-group">
            <label className="lbl">Employee Status</label>
            <input type="text" className="md-input" value={profile.employee_status || ''} disabled />
          </div>

          <div className="md-form-group">
            <label className="lbl">Total Current Loan</label>
            <div className="md-input-group">
              <span className="md-input-prefix">Rp</span>
              <input type="text" className="md-input" value={formatRupiah(profile.current_loan)} disabled />
            </div>
          </div>

          <div className="md-form-group">
            <label className="lbl">Current SHU</label>
            <div className="md-input-group">
              <span className="md-input-prefix">Rp</span>
              <input type="text" className="md-input" value="100.000,00" disabled />
            </div>
          </div>
        </div>

        <div className="md-form-column">
          <div className="md-form-group">
            <label className="lbl">Destination Bank Account</label>
            <select className="md-input" disabled value={profile.bank_name || ''}>
              <option value={profile.bank_name || ''}>{profile.bank_name || 'No Bank Account'}</option>
            </select>
          </div>

          <div className="md-form-group">
            <label className="lbl">Account Name</label>
            <input type="text" className="md-input" value={profile.account_holder_name || ''} disabled />
          </div>

          <div className="md-form-group">
            <label className="lbl">Account Number</label>
            <input type="text" className="md-input" value={profile.account_number || ''} disabled />
          </div>

          <div className="md-form-group" style={{ marginTop: 16 }}>
            <label className="lbl">Voluntary Saving</label>
            <div className="md-input-group">
              <span className="md-input-prefix">Rp</span>
              <input type="text" className="md-input" value={formatRupiah(profile.saving_balance)} disabled />
            </div>
          </div>

          <div className="md-form-group">
            <label className="lbl">Registration Date</label>
            <input type="text" className="md-input" value={formatDate(profile.join_date)} disabled />
          </div>

          <div className="md-form-group">
            <label className="lbl">KTP</label>
            {profile.ktp_file_path ? (
              <a href={profile.ktp_file_path} className="md-file-link" target="_blank" rel="noopener noreferrer">View KTP</a>
            ) : (
              <span className="md-input" style={{ display: 'inline-block', lineHeight: '40px' }}>Not Uploaded</span>
            )}
          </div>

          <div className="md-form-group">
            <label className="lbl">NIK Employee</label>
            <input type="text" className="md-input" value={profile.nik_employee || ''} disabled style={{ background: 'transparent', border: '1px solid #CBD5E1' }} />
          </div>
        </div>

        <div className="md-actions">
          <button className="btn-md" onClick={() => navigate(-1)}>Back</button>
        </div>
      </div>
    </div>
  );
};

export default MemberDetail;
