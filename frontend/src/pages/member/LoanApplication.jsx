import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Wallet, UploadCloud } from 'lucide-react';
import './LoanApplication.css';

const LoanApplication = () => {
  const navigate = useNavigate();
  const [showSimulation, setShowSimulation] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [loanTypes, setLoanTypes] = useState([]);
  const [hasActiveLoan, setHasActiveLoan] = useState(false);
  const [checkingLoan, setCheckingLoan] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [form, setForm] = useState({
    loan_type: '',
    amount_requested: '',
    amount_raw: 0,
    duration_months: '',
    purpose: '',
    salary_statement_file: null,
  });

  const [aiData, setAiData] = useState(null);
  const [loadingAi, setLoadingAi] = useState(false);

  const formatRupiah = (number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(number || 0).replace(',00', '');
  };

  const handleAmountChange = (e) => {
    const value = e.target.value.replace(/\D/g, '');
    const numValue = parseInt(value, 10) || 0;
    setForm({
      ...form,
      amount_raw: numValue,
      amount_requested: formatRupiah(numValue).replace('Rp', '').trim()
    });
  };

  useEffect(() => {
    const checkActiveLoan = async () => {
      try {
        const userStr = localStorage.getItem('user');
        const user = userStr ? JSON.parse(userStr) : null;
        if (user?.member_id) {
          const res = await fetch(`http://127.0.0.1:8000/api/loan/loans/dashboard_summary/?member_id=${user.member_id}`);
          if (res.ok) {
            const data = await res.json();
            // Use explicit boolean flag from backend
            if (data.has_active_loan) {
              setHasActiveLoan(true);
            }
          }
        }
      } catch (err) {
        console.error('Failed to check active loan:', err);
      } finally {
        setCheckingLoan(false);
      }
    };

    const fetchLoanTypes = async () => {
      try {
        const response = await fetch('http://127.0.0.1:8000/api/loan/loan-types/');
        if (response.ok) {
          const data = await response.json();
          setLoanTypes(data);
        }
      } catch (error) {
        console.error('Failed to fetch loan types:', error);
      }
    };

    checkActiveLoan();
    fetchLoanTypes();
  }, []);

  const handleContinue = async (e) => {
    e.preventDefault();
    setLoadingAi(true);

    try {
      const userStr = localStorage.getItem('user');
      const user = userStr ? JSON.parse(userStr) : null;
      const memberId = user?.member_id || 1;

      const res = await fetch('http://127.0.0.1:8000/api/loan/loan-applications/get_prediction_pre_submit/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: form.amount_raw,
          duration: form.duration_months,
          member_id: memberId
        })
      });

      if (res.ok) {
        const data = await res.json();
        setAiData(data);
      }
    } catch (err) {
      console.error('AI Prediction Error:', err);
    } finally {
      setLoadingAi(false);
      setShowSimulation(true);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files.length > 0) {
      setForm({ ...form, salary_statement_file: e.target.files[0] });
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const formData = new FormData();

      // Get member_id from user in localStorage
      const userStr = localStorage.getItem('user');
      const user = userStr ? JSON.parse(userStr) : null;
      const memberId = user?.member_id || 1;

      formData.append('member', memberId); 
      formData.append('loan_type', parseInt(form.loan_type, 10));
      formData.append('amount_requested', form.amount_raw);
      formData.append('duration_months', parseInt(form.duration_months, 10));
      formData.append('purpose', form.purpose);

      if (form.salary_statement_file) {
        formData.append('salary_statement_file', form.salary_statement_file);
      }

      const response = await fetch('http://127.0.0.1:8000/api/loan/loan-applications/', {
        method: 'POST',
        body: formData, 
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(errorText);
        throw new Error('Failed to submit application. Please check your data.');
      }

      const data = await response.json();
      console.log('Success:', data);
      
      alert('Loan Application Submitted Successfully!');
      navigate('/dashboard/loans'); // Adjust if you have a different route for the loan dashboard

    } catch (error) {
      console.error(error);
      alert('Error: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <div className="la-page">
      <div className="la-header">
        <button className="la-back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} /> Back
        </button>
        <div className="la-header-content">
          <h1>Loan Application</h1>
          <p>Submit a new loan application</p>
        </div>
      </div>

      <div className="la-content-grid">
        <form className="la-form" onSubmit={handleContinue}>
          <div className="la-form-group">
            <label>TYPE OF INSTALLMENT</label>
            <select
              required
              value={form.loan_type}
              onChange={(e) => setForm({ ...form, loan_type: e.target.value })}
            >
              <option value="" disabled>Select type...</option>
              {loanTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </div>

          <div className="la-form-group">
            <label>TOTAL OF INSTALLMENT</label>
            <div className="la-input-with-prefix">
              <span className="la-prefix">Rp</span>
              <input
                type="text"
                required
                placeholder="0"
                className="la-amount-input"
                value={form.amount_requested}
                onChange={handleAmountChange}
              />
            </div>
          </div>

          <div className="la-form-group">
            <label>DURATION (MONTHS)</label>
            <select
              required
              value={form.duration_months}
              onChange={(e) => setForm({ ...form, duration_months: e.target.value })}
            >
              <option value="" disabled>Select duration...</option>
              <option value="6">6 Months</option>
              <option value="12">12 Months</option>
              <option value="18">18 Months</option>
              <option value="24">24 Months</option>
            </select>
          </div>

          <div className="la-form-group">
            <label>PURPOSE</label>
            <input
              type="text"
              required
              value={form.purpose}
              onChange={(e) => setForm({ ...form, purpose: e.target.value })}
            />
          </div>

          <div className="la-form-group">
            <label>SALARY STATEMENT</label>
            <div className="la-upload-box" style={{ position: 'relative' }}>
              <input
                type="file"
                style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }}
                onChange={handleFileChange}
              />
              <UploadCloud size={20} className="u-icon" />
              <span>
                {form.salary_statement_file
                  ? form.salary_statement_file.name
                  : 'Upload salary statement'}
              </span>
            </div>
          </div>

          <button type="submit" className="la-btn-continue" disabled={loadingAi || checkingLoan}>
            {loadingAi ? 'Processing...' : (checkingLoan ? 'Checking Profile...' : 'Continue')}
          </button>
        </form>

        {showSimulation && (
          <div className="la-simulation-card fade-in">
            <div className="la-sim-header">
              <h2>Angsuran Simulation</h2>
              <p className="la-sim-sub">Estimated Monthly Payment</p>
            </div>
            
            <div className="la-sim-main">
              <div className="la-sim-amount">
                {formatRupiah(((form.amount_raw * (1 + (aiData?.suggested_interest_rate || 0.5) / 100 * parseInt(form.duration_months, 10))) / parseInt(form.duration_months, 10)))}
              </div>
              <p className="la-sim-desc">Based on {form.duration_months} months @ {aiData?.suggested_interest_rate || '0.5'}% interest/month</p>
            </div>

            <div className="la-sim-details">
              <div className="la-sim-row">
                <span>Principal</span>
                <span>{formatRupiah(form.amount_raw)}</span>
              </div>
              <div className="la-sim-row">
                <span>Total Interest Prediction</span>
                <span>{formatRupiah(form.amount_raw * (aiData?.suggested_interest_rate || 0.5) / 100 * parseInt(form.duration_months, 10))}</span>
              </div>
              <div className="la-sim-row total">
                <span>Total Repayment</span>
                <span>{formatRupiah(form.amount_raw * (1 + (aiData?.suggested_interest_rate || 0.5) / 100 * parseInt(form.duration_months, 10)))}</span>
              </div>
            </div>

            {aiData && (
              <div className={`la-ai-badge ${aiData.eligibility.toLowerCase()}`}>
                Potential Eligibility: <strong>{aiData.eligibility}</strong>
              </div>
            )}

            <p className="la-sim-disclaimer">
              The interest rate and eligibility shown are AI recommendations based on your profile. Final approval is subject to admin review.
            </p>

            <label className="la-checkbox">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              <span>I verify that the information above is correct and agree to the term and service.</span>
            </label>

            <button
              className="la-btn-submit"
              disabled={!agreed || submitting}
              onClick={handleSubmit}
            >
              {submitting ? 'Submitting Application...' : 'Submit'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default LoanApplication;
