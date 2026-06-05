import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MailCheck, Loader2, ArrowLeft, RefreshCw, ChevronRight } from 'lucide-react';
import { apiUrl } from '../../services/api';
import './RegistrationPages.css';

const RegisterStep4 = () => {
  const navigate = useNavigate();
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [targetEmail, setTargetEmail] = useState('');

  useEffect(() => {
    const email = sessionStorage.getItem('verifyEmail');
    if (!email) {
      // If no email found in session, they shouldn't be here
      navigate('/register/step-2');
    } else {
      setTargetEmail(email);
    }
  }, [navigate]);

  const handleChange = (index, value) => {
    // allow only numbers
    if (value && !/^\d+$/.test(value)) return;
    
    // reset error when typing
    if (errorMessage) setErrorMessage('');

    const newCode = [...code];
    // handle paste
    if (value.length > 1) {
      const pasted = value.slice(0, 6).split('');
      const updatedCode = [...code];
      for (let i = 0; i < pasted.length && i < 6; i++) {
        updatedCode[i] = pasted[i];
      }
      setCode(updatedCode);
      // focus next empty or last
      const nextIdx = Math.min(pasted.length, 5);
      const el = document.getElementById(`code-${nextIdx}`);
      if (el) el.focus();
      return;
    }

    newCode[index] = value;
    setCode(newCode);

    // move to next
    if (value && index < 5) {
      const next = document.getElementById(`code-${index + 1}`);
      if (next) next.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      const prev = document.getElementById(`code-${index - 1}`);
      if (prev) prev.focus();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const fullCode = code.join('');
    if (fullCode.length !== 6) return;

    setIsVerifying(true);
    setErrorMessage('');
    
    try {
      const response = await fetch(apiUrl('/member/members/verify_code/'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Important to send/receive cookies
        body: JSON.stringify({
          email: targetEmail,
          code: fullCode
        })
      });

      const data = await response.json();

      if (response.ok) {
        navigate('/register/step-5');
      } else {
        setErrorMessage(data.message || 'Invalid verification code');
      }
    } catch (error) {
      setErrorMessage('Connection failed. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async (e) => {
    e.preventDefault();
    if (isResending) return;

    setIsResending(true);
    setErrorMessage('');
    
    try {
      const step1Data = JSON.parse(sessionStorage.getItem('regStep1') || '{}');
      const response = await fetch(apiUrl('/member/members/send_verification_email/'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: targetEmail,
          fullName: step1Data.fullName
        })
      });

      if (response.ok) {
        alert('Verification code resent successfully!');
        setCode(['', '', '', '', '', '']);
        document.getElementById('code-0')?.focus();
      } else {
        setErrorMessage('Failed to resend code');
      }
    } catch (error) {
      setErrorMessage('Netwok error during resend');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="registration-step-container">
      <div className="reg-icon-header">
        <div className="reg-logo-icon-large" style={{ backgroundColor: '#f0fdf4' }}>
          <MailCheck size={40} color="#15803d" />
        </div>
      </div>
      
      <h2 className="reg-page-title text-center">Verify Your Email</h2>
      <p className="reg-page-subtitle text-center">
        We've sent a 6-digit verification code to:<br/>
        <strong style={{ color: '#1e293b' }}>{targetEmail}</strong>
      </p>

      <form onSubmit={handleSubmit} className="agreement-card" style={{ maxWidth: '450px', margin: '0 auto' }}>
        <div className="reg-form-group">
          <div className="flex justify-center gap-2 mt-4" style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            {code.map((digit, index) => (
              <input
                key={index}
                id={`code-${index}`}
                type="text"
                autoComplete="off"
                className={`reg-form-input text-center ${errorMessage ? 'error-border' : ''}`}
                style={{ 
                  width: '3.5rem', 
                  height: '4rem', 
                  fontSize: '1.75rem', 
                  fontWeight: 'bold',
                  padding: '0', 
                  borderRadius: '12px',
                  backgroundColor: 'white',
                  border: errorMessage ? '2px solid #ef4444' : '2px solid #e2e8f0',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                }}
                maxLength={6}
                value={digit}
                onChange={(e) => handleChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                required
                autoFocus={index === 0}
              />
            ))}
          </div>
          {errorMessage && (
            <p style={{ color: '#ef4444', fontSize: '0.875rem', textAlign: 'center', marginTop: '1rem', fontWeight: '500' }}>
              {errorMessage}
            </p>
          )}
        </div>

        <div className="terms-actions mt-8">
          <button type="button" className="btn-professional-outline" onClick={() => navigate('/register/step-3')}>
            <ArrowLeft size={18} style={{ marginRight: '8px' }} />
            Back
          </button>
          <button 
            type="submit" 
            className="btn-professional-primary" 
            disabled={code.join('').length < 6 || isVerifying}
          >
            {isVerifying ? (
              <>
                <Loader2 className="spinner" size={18} />
                Verifying...
              </>
            ) : (
              <>
                Verify & Next
                <ChevronRight size={18} />
              </>
            )}
          </button>
        </div>
        
        <div className="text-center mt-6">
          <button 
            type="button" 
            onClick={handleResend}
            disabled={isResending}
            style={{ 
              background: 'none', 
              border: 'none', 
              color: '#2563eb', 
              cursor: isResending ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              margin: '0 auto',
              fontWeight: '600'
            }}
          >
            {isResending ? <Loader2 size={16} className="spinner" /> : <RefreshCw size={16} />}
            Didn't receive code? Resend
          </button>
        </div>
      </form>
    </div>
  );
};

export default RegisterStep4;
