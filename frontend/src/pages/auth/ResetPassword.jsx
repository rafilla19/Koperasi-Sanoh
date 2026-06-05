import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, Eye, EyeOff, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { apiUrl } from '../../services/api';
import './AuthPages.css';

const ResetPassword = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get('token') || '', [searchParams]);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!token) {
      setError('Reset token is missing or invalid.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(apiUrl('/master/auth/reset_password/'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token, password }),
      });

      const data = await response.json();
      if (response.ok) {
        setMessage(data.message || 'Password updated successfully. Redirecting to login...');
        setTimeout(() => navigate('/login'), 1800);
      } else {
        setError(data.error || 'Failed to reset password.');
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
        <h1 className="auth-title">Reset Password</h1>
        <p className="auth-subtitle">
          Create a new password for your account.
        </p>
      </div>

      <form className="auth-form" onSubmit={handleSubmit}>
        {message && <div className="auth-error-msg" style={{ color: '#166534', background: '#ecfdf5', border: '1px solid #bbf7d0', marginBottom: '1rem', textAlign: 'center', fontSize: '0.9rem', padding: '0.75rem 1rem', borderRadius: '0.75rem' }}>{message}</div>}
        {error && <div className="auth-error-msg" style={{ color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', marginBottom: '1rem', textAlign: 'center', fontSize: '0.9rem', padding: '0.75rem 1rem', borderRadius: '0.75rem' }}>{error}</div>}

        <div className="form-group">
          <label className="form-label" htmlFor="password">New Password</label>
          <div className="input-container">
            <Lock className="input-icon" size={20} />
            <input
              type={showPassword ? 'text' : 'password'}
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="form-input"
              placeholder="Enter new password"
              required
            />
            <button
              type="button"
              className="input-icon-right"
              onClick={() => setShowPassword(!showPassword)}
              style={{ background: 'none', border: 'none', padding: 0 }}
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="confirmPassword">Confirm Password</label>
          <div className="input-container">
            <Lock className="input-icon" size={20} />
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="form-input"
              placeholder="Repeat new password"
              required
            />
            <button
              type="button"
              className="input-icon-right"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              style={{ background: 'none', border: 'none', padding: 0 }}
            >
              {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </div>

        <button type="submit" className="btn-primary" style={{ marginTop: '0.5rem' }} disabled={isLoading}>
          {isLoading ? 'Updating...' : <><CheckCircle2 size={18} /> Update Password</>}
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

export default ResetPassword;
