import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, Eye, EyeOff, ArrowLeft, CheckCircle2, Loader } from 'lucide-react';
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

  const hasMinLength = password.length >= 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSymbol = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+/.test(password);
  const allCriteriaMet = hasMinLength && hasUpperCase && hasNumber && hasSymbol;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isLoading) return;
    setError('');
    setMessage('');

    if (!token) {
      setError('Token reset tidak ditemukan atau tidak valid.');
      return;
    }

    if (!allCriteriaMet) {
      setError('Password harus memenuhi semua persyaratan keamanan.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Password dan konfirmasi password tidak cocok.');
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
        setMessage(data.message || 'Password berhasil diperbarui. Mengalihkan ke halaman login...');
        setTimeout(() => navigate('/login'), 1800);
      } else {
        setError(data.error || 'Gagal mengatur ulang password.');
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
        <h1 className="auth-title">Atur Ulang Password</h1>
        <p className="auth-subtitle">
          Buat password baru untuk akun Anda.
        </p>
      </div>

      <form className="auth-form" onSubmit={handleSubmit}>
        {message && <div className="auth-error-msg" style={{ color: '#166534', background: '#ecfdf5', border: '1px solid #bbf7d0', marginBottom: '1rem', textAlign: 'center', fontSize: '0.9rem', padding: '0.75rem 1rem', borderRadius: '0.75rem' }}>{message}</div>}
        {error && <div className="auth-error-msg" style={{ color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', marginBottom: '1rem', textAlign: 'center', fontSize: '0.9rem', padding: '0.75rem 1rem', borderRadius: '0.75rem' }}>{error}</div>}

        <div className="form-group">
          <label className="form-label" htmlFor="password">Password Baru</label>
          <div className="input-container">
            <Lock className="input-icon" size={20} />
            <input
              type={showPassword ? 'text' : 'password'}
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="form-input"
              placeholder="Masukkan password baru"
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

        <div className="pw-criteria-grid">
          <div className={`pw-criteria-item ${hasMinLength ? 'pw-met' : ''}`}>
            <span className="pw-check">{hasMinLength ? '☑' : '☐'}</span> Minimal 8 karakter
          </div>
          <div className={`pw-criteria-item ${hasUpperCase ? 'pw-met' : ''}`}>
            <span className="pw-check">{hasUpperCase ? '☑' : '☐'}</span> Satu huruf kapital
          </div>
          <div className={`pw-criteria-item ${hasNumber ? 'pw-met' : ''}`}>
            <span className="pw-check">{hasNumber ? '☑' : '☐'}</span> Satu angka
          </div>
          <div className={`pw-criteria-item ${hasSymbol ? 'pw-met' : ''}`}>
            <span className="pw-check">{hasSymbol ? '☑' : '☐'}</span> Satu simbol khusus
          </div>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="confirmPassword">Konfirmasi Password</label>
          <div className="input-container">
            <Lock className="input-icon" size={20} />
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="form-input"
              placeholder="Ulangi password baru"
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

        <button type="submit" className="btn-primary" style={{ marginTop: '0.5rem' }} disabled={isLoading || !allCriteriaMet}>
          {isLoading ? <><Loader size={16} className="spinner" /> Memperbarui...</> : <><CheckCircle2 size={18} /> Perbarui Password</>}
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

export default ResetPassword;
