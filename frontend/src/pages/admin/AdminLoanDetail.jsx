import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { User, Printer, UploadCloud, Edit2 } from 'lucide-react';
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

  useEffect(() => {
    // 1. Fetch Application Details
    fetch(`http://127.0.0.1:8000/api/loan/loan-applications/${id}/admin_application_detail/`)
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
    fetch(`http://127.0.0.1:8000/api/loan/loan-applications/${id}/get_ai_suggestion/`)
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

  const handleApprove = async () => {
    if (!window.confirm('Are you sure you want to approve this loan?')) return;
    
    try {
      // Get admin_id from user in localStorage
      const userStr = localStorage.getItem('user');
      const user = userStr ? JSON.parse(userStr) : null;
      const adminId = user?.id || 1;

      const response = await fetch(`http://127.0.0.1:8000/api/loan/loan-applications/${id}/approve/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repayment_term: repaymentTerm,
          interest_rate: interestRate,
          amount_requested: amountRequested,
          admin_id: adminId
        })
      });
      
      const data = await response.json();
      if (response.ok) {
        alert(data.message);
        navigate('/dashboard/admin/ls-loans');
      } else {
        alert(data.error || 'Failed to approve');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to approve loan');
    }
  };

  const handleReject = async () => {
    if (!rejectReason) {
      alert('Please provide a reason for rejection in the decision notes');
      return;
    }
    if (!window.confirm('Are you sure you want to reject this application?')) return;

    try {
      // Get admin_id from user in localStorage
      const userStr = localStorage.getItem('user');
      const user = userStr ? JSON.parse(userStr) : null;
      const adminId = user?.id || 1;

      const response = await fetch(`http://127.0.0.1:8000/api/loan/loan-applications/${id}/reject/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reject_reason: rejectReason,
          admin_id: adminId
        })
      });
      
      const data = await response.json();
      if (response.ok) {
        alert(data.message);
        navigate('/dashboard/admin/ls-loans');
      } else {
        alert(data.error || 'Failed to reject');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to reject loan');
    }
  };

  if (!detail) return <div style={{ padding: '24px' }}>Loading...</div>;

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
    return date.toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="admin-loan-detail">
      <div className="aldet-header-area">
        <div className="aldet-header-left">
          <h1>Loan Details</h1>
          <span className="aldet-badge active">Pending</span>
        </div>
        <p className="aldet-submitted">Submitted on {formatDate(detail.applied_at)}</p>
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
          View profile
        </button>
      </div>

      <div className="aldet-layout">
        <div className="aldet-left-col">
          <h2 className="aldet-section-title">Detail Pinjaman</h2>
          <div className="aldet-loan-info-grid">
            <div className="aldet-info-box">
              <div className="aldet-ib-header">
                <div className="aldet-ib-label">Amount Requested</div>
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

              <div className="aldet-ib-label mt">Loan Type</div>
              <div className="aldet-ib-value">{detail.loan_type_name || 'N/A'}</div>
              
              <div className="aldet-ib-label mt">Purpose</div>
              <div className="aldet-ib-value">{detail.purpose}</div>
            </div>

            <div className="aldet-info-box">
              <div className="aldet-ib-header">
                <div className="aldet-ib-label">Repayment Term</div>
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
                  <span>Bulan</span>
                </div>
              ) : (
                <div className="aldet-ib-value mb">{repaymentTerm} Bulan</div>
              )}

              <div className="aldet-ib-header mt">
                <div className="aldet-ib-label">Bunga</div>
                <button className="aldet-edit-btn" onClick={() => setIsEditingInterest(!isEditingInterest)}>
                  <Edit2 size={14} />
                </button>
              </div>
              <div className="aldet-ib-recommend">AI Recommended: {aiSuggestion?.suggested_interest_rate || '0.5'}%</div>
              {isEditingInterest ? (
                <div className="aldet-edit-row">
                  <input
                    type="number"
                    step="0.1"
                    value={interestRate}
                    onChange={(e) => setInterestRate(e.target.value)}
                    className="aldet-input"
                  />
                  <span>%/Month(Flat)</span>
                </div>
              ) : (
                <div className="aldet-ib-value">{interestRate}%/Month(Flat)</div>
              )}
            </div>
          </div>

          <div className="aldet-risk">
            <span className="aldet-risk-label">AI Eligibility Rating</span>
            <span className={`aldet-risk-val ${aiSuggestion?.eligibility?.toLowerCase() || 'low'}`}>
              {aiSuggestion?.eligibility || 'Calculating...'}
            </span>
            {aiSuggestion && (
              <span className="aldet-risk-conf">Confidence: {aiSuggestion.confidence_score}%</span>
            )}
          </div>

          <div className="aldet-decision">
            <h3 className="aldet-section-title">Admin Decision</h3>
            <textarea 
              placeholder="Type rejection reason or notes here" 
              className="aldet-textarea"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            ></textarea>
          </div>

          <div className="aldet-upload">
            <h3 className="aldet-section-title">Document Slip Gaji</h3>
            <div className="aldet-doc-preview" style={{ marginBottom: '24px' }}>
              {detail.salary_statement_file ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', background: '#fcfcfc', border: '1px dashed #cbd5e1', borderRadius: '8px' }}>
                  <Printer size={24} color="#4f7df3" />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a1a' }}>Slip_Gaji_Document</div>
                    <a href={`http://127.0.0.1:8000/media/${detail.salary_statement_file}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px', color: '#4f7df3', textDecoration: 'none' }}>Click to view document</a>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '16px', color: '#666', background: '#fcfcfc', border: '1px dashed #cbd5e1', borderRadius: '8px', textAlign: 'center' }}>
                  No document uploaded
                </div>
              )}
            </div>
          </div>

          <div className="aldet-actions">
            <button className="aldet-action-btn reject" onClick={handleReject}>REJECT</button>
            <button className="aldet-action-btn approve" onClick={handleApprove}>APPROVE</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminLoanDetail;
