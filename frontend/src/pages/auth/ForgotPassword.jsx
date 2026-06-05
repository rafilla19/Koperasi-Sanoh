import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { User, ArrowLeft } from 'lucide-react';
import { apiUrl } from '../../services/api';
import './AuthPages.css';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleReset = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setIsLoading(true);

    try {
      const response = await fetch(apiUrl('/master/auth/forgot_password/'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();
      if (response.ok) {
        setMessage(data.message || 'If the email exists, a reset link has been sent.');
      } else {
        setError(data.error || 'Failed to send reset link.');
      }
    } catch (err) {
      setError('Connection error. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-header">
        <h1 className="auth-title">Forgot Password?</h1>
        <p className="auth-subtitle">
          Enter your email address and we will send you a link to reset your password.
        </p>
      </div>

      <form className="auth-form" onSubmit={handleReset}>
        {message && <div className="auth-error-msg" style={{ color: '#166534', background: '#ecfdf5', border: '1px solid #bbf7d0', marginBottom: '1rem', textAlign: 'center', fontSize: '0.9rem', padding: '0.75rem 1rem', borderRadius: '0.75rem' }}>{message}</div>}
        {error && <div className="auth-error-msg" style={{ color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', marginBottom: '1rem', textAlign: 'center', fontSize: '0.9rem', padding: '0.75rem 1rem', borderRadius: '0.75rem' }}>{error}</div>}
        <div className="form-group">
          <label className="form-label" htmlFor="email">Email</label>
          <div className="input-container">
            <User className="input-icon" size={20} />
            <input 
              type="email" 
              id="email" 
              className="form-input" 
              placeholder="Enter your registered email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
        </div>

        <button type="submit" className="btn-primary" style={{ marginTop: '0.5rem' }} disabled={isLoading}>
          {isLoading ? 'Sending...' : 'Send Reset Link'}
        </button>
      </form>

      <div style={{ textAlign: 'center', marginTop: '2rem' }}>
        <Link to="/login" className="auth-link" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
          <ArrowLeft size={16} /> Back to Login
        </Link>
      </div>

      <div className="auth-footer" style={{ marginTop: '3rem' }}>
        Not a member yet? <Link to="/register">Register Account</Link>
      </div>
    </div>
  );
};

export default ForgotPassword;
