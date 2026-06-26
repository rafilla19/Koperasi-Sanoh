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
        setMessage(data.message || 'Jika email terdaftar, tautan reset telah dikirim.');
      } else {
        setError(data.error || 'Gagal mengirim tautan reset.');
      }
    } catch (err) {
      setError('Kesalahan koneksi. Silakan coba lagi nanti.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-header">
        <h1 className="auth-title">Lupa Password?</h1>
        <p className="auth-subtitle">
          Masukkan alamat email Anda dan kami akan mengirimkan tautan untuk mengatur ulang password.
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
              placeholder="Masukkan email terdaftar Anda" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
        </div>

        <button type="submit" className="btn-primary" style={{ marginTop: '0.5rem' }} disabled={isLoading}>
          {isLoading ? 'Mengirim...' : 'Kirim Tautan Reset'}
        </button>
      </form>

      <div style={{ textAlign: 'center', marginTop: '2rem' }}>
        <Link to="/login" className="auth-link" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
          <ArrowLeft size={16} /> Kembali ke Login
        </Link>
      </div>

      <div className="auth-footer" style={{ marginTop: '3rem' }}>
        Belum menjadi anggota? <Link to="/register">Daftar Akun</Link>
      </div>
    </div>
  );
};

export default ForgotPassword;
