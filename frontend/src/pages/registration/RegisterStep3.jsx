import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileText, CheckCircle, ChevronRight, ArrowLeft, Loader2, ShieldCheck, ExternalLink } from 'lucide-react';
import { apiUrl } from '../../services/api';
import './RegistrationPages.css';

const RegisterStep3 = () => {
  const [agreed, setAgreed] = useState(false);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchTnc = async () => {
      try {
        const res = await fetch(apiUrl('/member/members/tnc_document/'));
        const data = await res.json();
        if (res.ok) {
          setPdfUrl(data.file_path || data.document_url || null);
        }
      } catch (error) {
        console.error('Failed to load TnC document', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchTnc();
  }, []);

  const handleFinish = async (e) => {
    e.preventDefault();
    if (!agreed) return;

    // Save T&C agreement to sessionStorage
    sessionStorage.setItem('regStep3', JSON.stringify({ tncAgreement: true }));

    setIsSending(true);
    try {
      // Get user data from previous steps
      const step1Data = JSON.parse(sessionStorage.getItem('regStep1') || '{}');
      const step2Data = JSON.parse(sessionStorage.getItem('regStep2') || '{}');
      
      const response = await fetch(apiUrl('/member/members/send_verification_email/'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Important to send/receive cookies
        body: JSON.stringify({
          email: step2Data.email,
          fullName: step1Data.fullName
        })
      });

      const data = await response.json();
      
      if (response.ok) {
        // Save the verification target to session so Step 4 knows which email to verify
        sessionStorage.setItem('verifyEmail', step2Data.email);
        navigate('/register/step-4');
      } else {
        alert(data.error || 'Gagal mengirim email verifikasi');
      }
    } catch (error) {
      console.error('Verification error:', error);
      alert('Kesalahan koneksi. Silakan periksa koneksi internet Anda.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="registration-step-container">
      <div className="reg-icon-header">
        <div className="reg-logo-icon-large" style={{ backgroundColor: '#f0f9ff' }}>
          <ShieldCheck size={40} color="#0369a1" />
        </div>
      </div>
      
      <h2 className="reg-page-title text-center">Terms & Conditions</h2>
      <p className="reg-page-subtitle text-center">
        Please read our membership agreement carefully before proceeding with your application.
      </p>

      <div className="terms-box">
        <div className="terms-header">
          <div className="terms-header-title">
            <FileText size={18} />
            <span>MEMBERSHIP_AGREEMENT_2024.PDF</span>
          </div>
          {pdfUrl && (
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="terms-header-title" style={{ color: '#2563eb', textDecoration: 'none' }}>
              <ExternalLink size={16} />
              <span>Full View</span>
            </a>
          )}
        </div>

        <div className="terms-content">
          {isLoading ? (
            <div className="pdf-loading">
              <div className="spinner"></div>
              <span>Securing document connection...</span>
            </div>
          ) : pdfUrl ? (
            <iframe 
              src={pdfUrl} 
              title="Terms and Conditions"
              style={{ width: '100%', height: '100%', border: 'none' }}
              onLoad={() => setIsLoading(false)}
            />
          ) : (
            <div className="terms-placeholder">
              <div style={{ textAlign: 'center', marginBottom: '1.5rem', color: '#64748b' }}>
                <FileText size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                <p>Standard Member Guidelines</p>
              </div>

              <h3>1. Membership Eligibility</h3>
              <p>Membership is open to all permanent and contract employees of PT Sanoh Indonesia. By registering, you confirm your employment status is active.</p>
              
              <h3>2. Deposits and Savings</h3>
              <p><strong>2.1 Principal Deposit:</strong> A one-time principal deposit is required upon registration. The amount is determined by the cooperative's bylaws.</p>
              <p><strong>2.2 Mandatory Savings:</strong> Members are required to contribute a monthly mandatory savings amount of IDR 100,000, which will be automatically deducted from the monthly payroll.</p>
              <p><strong>2.3 Voluntary Savings:</strong> Members may opt to contribute additional voluntary savings, with a minimum amount of IDR 50,000 per month.</p>

              <h3>3. Loans and Credit</h3>
              <p>Members who have been active for at least 3 months are eligible to apply for loans. All loan applications are subject to approval based on the member's financial standing and savings balance.</p>

              <h3>4. Privacy Policy</h3>
              <p>All personal and financial information provided during registration will be kept confidential and used solely for the administration of cooperative activities and payroll deductions.</p>
            </div>
          )}
        </div>
      </div>

      <form onSubmit={handleFinish} className="agreement-card">
        <label className={`custom-checkbox-container ${agreed ? 'active' : ''}`}>
          <input 
            type="checkbox" 
            className="hidden-input"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            required
            style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
          />
          <div className="checkbox-visual">
            {agreed && <CheckCircle size={14} fill="currentColor" color="white" />}
          </div>
          <div className="checkbox-label">
            <strong>I acknowledge and agree to the membership terms.</strong>
            <span style={{ fontSize: '0.8rem' }}>
              By checking this, I authorize Koperasi PT Sanoh Indonesia to process my membership and agree to the monthly savings deductions as specified in the bylaws.
            </span>
          </div>
        </label>

        <div className="terms-actions">
          <Link to="/register/step-2" className="btn-professional-outline">
            <ArrowLeft size={18} style={{ marginRight: '8px' }} />
            Back
          </Link>
          <button 
            type="submit" 
            className="btn-professional-primary"
            disabled={!agreed || isSending}
          >
            {isSending ? (
              <>
                <Loader2 className="spinner" size={18} />
                Sending Code...
              </>
            ) : (
              <>
                Setuju & Lanjutkan
                <ChevronRight size={18} />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default RegisterStep3;
