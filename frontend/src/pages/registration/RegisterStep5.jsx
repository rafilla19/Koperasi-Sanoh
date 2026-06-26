import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Eye, EyeOff, Loader } from 'lucide-react';
import { apiUrl } from '../../services/api';
import './RegistrationPages.css';

const RegisterStep5 = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const hasMinLength = password.length >= 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSymbol = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+/.test(password);
  const allCriteriaMet = hasMinLength && hasUpperCase && hasNumber && hasSymbol;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setErrorMsg('');

    if (!allCriteriaMet) {
      setErrorMsg('Password harus memenuhi semua persyaratan keamanan.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Password dan konfirmasi password tidak cocok.');
      return;
    }

    const step1 = JSON.parse(sessionStorage.getItem('regStep1') || '{}');
    const step2 = JSON.parse(sessionStorage.getItem('regStep2') || '{}');
    const step3 = JSON.parse(sessionStorage.getItem('regStep3') || '{}');

    if (!step2.npwpPath || !step2.ktpPath) {
      setErrorMsg('File dokumen (NPWP/KTP) tidak ditemukan. Silakan kembali ke Step 2 dan upload ulang.');
      return;
    }

    if (!step1.nik || !step2.email) {
      setErrorMsg('Data registrasi tidak lengkap. Silakan mulai ulang registrasi.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(apiUrl('/member/members/register_member/'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nik: step1.nik,
          fullName: step1.fullName,
          nikEmployee: step1.nikEmployee,
          noNpwp: step1.npwp || '',
          placeOfBirth: step1.placeOfBirth || '',
          dateOfBirth: step1.dob || '',
          gender: step1.gender || '',
          address: step1.address || '',
          phoneNumber: step2.mobilePhone,
          email: step2.email,
          employeeStatusId: String(step2.employeeStatus),
          departmentId: String(step2.department),
          voluntarySaving: String(step2.voluntarySaving || 0),
          contractEndDate: step2.contractEndDate || '',
          payrollAgreement: step2.payrollAgree || false,
          tncAgreement: step3.tncAgreement || false,
          password: password,
          npwpPath: step2.npwpPath || '',
          ktpPath: step2.ktpPath || ''
        })
      });

      const result = await response.json();
      if (!response.ok) {
        const msg = result.message || result.error || result.detail;
        if (typeof msg === 'string') {
          setErrorMsg(msg);
        } else if (typeof result === 'object') {
          const firstError = Object.values(result).flat().join(', ');
          setErrorMsg(firstError || 'Registrasi gagal. Silakan coba lagi.');
        } else {
          setErrorMsg('Registrasi gagal. Silakan coba lagi.');
        }
        return;
      }

      sessionStorage.removeItem('regStep1');
      sessionStorage.removeItem('regStep2');
      sessionStorage.removeItem('regStep3');
      sessionStorage.removeItem('verifyEmail');
      navigate('/register/under-review');
    } catch (error) {
      console.error('Registration failed', error);
      setErrorMsg('Koneksi gagal. Silakan coba lagi.');
    } finally {
      setSubmitting(false);
    }
  };

  const togglePassword = () => setShowPassword(!showPassword);
  const toggleConfirm = () => setShowConfirm(!showConfirm);

  return (
    <div>
      <div className="reg-icon-header">
         <div className="reg-logo-icon-large bg-accent mx-auto">
           <ShieldCheck size={40} color="white" />
         </div>
      </div>
      <h2 className="reg-page-title text-center" style={{marginBottom: "0.5rem", marginTop: "1rem"}}>Welcome! Let's secure your account.</h2>
      <p className="reg-page-subtitle text-center">
        Please create a unique and strong password to<br/> access your savings safely
      </p>

      {errorMsg && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginTop: '12px', marginBottom: '4px' }}>
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="reg-form mt-6">
        <div className="reg-form-group relative">
          <label className="reg-form-label">Password</label>
          <div className="password-input-wrapper relative flex items-center">
             <span className="input-icon-left" style={{ position: 'absolute', left: '12px', zIndex: 1, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center' }}><ShieldCheck size={18} /></span>
             <input
               type={showPassword ? "text" : "password"}
               className="reg-form-input pl-10 pr-10"
               style={{ paddingLeft: '35px', paddingRight: '40px', width: '100%', boxSizing: 'border-box' }}
               placeholder="Password"
               value={password}
               onChange={(e) => setPassword(e.target.value)}
               required
             />
             <button type="button" onClick={togglePassword} className="password-toggle absolute text-gray-400" style={{ position: 'absolute', right: '12px', zIndex: 1, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', padding: 0, display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
               {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
             </button>
          </div>
        </div>

        <div className="password-criteria grid-2-col mt-2 mb-2">
          <div className={`criteria-item ${hasMinLength ? 'met' : ''}`}><span className="check-box">{hasMinLength ? '☑' : '☐'}</span> Minimal 8 karakter</div>
          <div className={`criteria-item ${hasUpperCase ? 'met' : ''}`}><span className="check-box">{hasUpperCase ? '☑' : '☐'}</span> Satu huruf kapital</div>
          <div className={`criteria-item ${hasNumber ? 'met' : ''}`}><span className="check-box">{hasNumber ? '☑' : '☐'}</span> Satu angka</div>
          <div className={`criteria-item ${hasSymbol ? 'met' : ''}`}><span className="check-box">{hasSymbol ? '☑' : '☐'}</span> Satu simbol khusus</div>
        </div>

        <div className="reg-form-group relative mt-2">
          <label className="reg-form-label">Konfirmasi Password</label>
          <div className="password-input-wrapper relative flex items-center">
             <span className="input-icon-left" style={{ position: 'absolute', left: '12px', zIndex: 1, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center' }}><ShieldCheck size={18} /></span>
             <input
               type={showConfirm ? "text" : "password"}
               className="reg-form-input pl-10 pr-10"
               style={{ paddingLeft: '35px', paddingRight: '40px', width: '100%', boxSizing: 'border-box' }}
               placeholder="Masukkan ulang password Anda"
               value={confirmPassword}
               onChange={(e) => setConfirmPassword(e.target.value)}
               required
             />
             <button type="button" onClick={toggleConfirm} className="password-toggle absolute text-gray-400" style={{ position: 'absolute', right: '12px', zIndex: 1, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', padding: 0, display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
               {showConfirm ? <EyeOff size={20} /> : <Eye size={20} />}
             </button>
          </div>
        </div>

        <div className="reg-actions full-width mt-6">
          <button type="submit" className="btn-primary-full" disabled={submitting || !allCriteriaMet}>
            {submitting ? <><Loader size={16} className="spinner" /> Memproses...</> : 'Selesaikan Pembuatan Akun →'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default RegisterStep5;
