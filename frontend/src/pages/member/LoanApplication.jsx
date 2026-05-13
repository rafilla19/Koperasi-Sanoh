import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Wallet, UploadCloud } from 'lucide-react';
import './LoanApplication.css';

const LoanApplication = () => {
  const navigate = useNavigate();
  const [showSimulation, setShowSimulation] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [loanTypes, setLoanTypes] = useState([]);

  // Form state
  const [form, setForm] = useState({
    loan_type: '',
    amount_requested: '',
    amount_raw: 0,
    duration_months: '',
    purpose: '',
    salary_statement_file: null,
  });

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

    fetchLoanTypes();
  }, []);

  const handleContinue = (e) => {
    e.preventDefault();
    setShowSimulation(true);
  };

  const handleFileChange = (e) => {
    if (e.target.files.length > 0) {
      setForm({ ...form, salary_statement_file: e.target.files[0] });
    }
  };

  const handleSubmit = async () => {
    try {
      const formData = new FormData();

      formData.append('member', 1); // TODO: Replace with dynamic member ID from auth
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
    }
  };


  return (
    <div className="la-page">
      <div className="la-header">
        <button className="la-back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} /> Back
        </button>
        <h1>Loan Application</h1>
        <p>Submit a new loan application</p>
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

          <button type="submit" className="la-btn-continue">Continue</button>
        </form>

        {showSimulation && (
          <div className="la-simulation-card fade-in">
            <h2>Angsuran Simulation</h2>
            <p className="la-sim-sub">Estimated Monthly Payment</p>
            <div className="la-sim-amount">
              {formatRupiah(((form.amount_raw * 1.06) / parseInt(form.duration_months, 10)))}
            </div>
            <p className="la-sim-desc">Based on {form.duration_months} months @ 0.5% interest/month</p>

            <div className="la-sim-details">
              <div className="la-sim-row">
                <span>Principal</span>
                <span>{formatRupiah(form.amount_raw)}</span>
              </div>
              <div className="la-sim-row">
                <span>Total Interest (Est. 6% p.a)</span>
                <span>{formatRupiah(form.amount_raw * 0.06 * (parseInt(form.duration_months, 10) / 12))}</span>
              </div>
              <div className="la-sim-row total">
                <span>Total Repayment</span>
                <span>{formatRupiah(form.amount_raw * (1 + 0.06 * (parseInt(form.duration_months, 10) / 12)))}</span>
              </div>
            </div>

            <p className="la-sim-disclaimer">
              The interest rate shown is a system estimate and is not binding. Final rates are set by the cooperative.
            </p>

            <label className="la-checkbox">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              <span>I verify that the information above is correct and agree to the term and service.</span>
            </label>

            <button
              className="la-btn-submit"
              disabled={!agreed}
              onClick={handleSubmit}
            >
              Submit
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default LoanApplication;
