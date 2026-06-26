import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Wallet, UploadCloud, X } from 'lucide-react';
import { apiUrl, getAuthHeaders } from '../../services/api';
import './LoanApplication.css';

const LoanApplication = () => {
  const navigate = useNavigate();
  const [showSimulation, setShowSimulation] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [loanTypes, setLoanTypes] = useState([]);
  const [hasActiveLoan, setHasActiveLoan] = useState(false);
  const [checkingLoan, setCheckingLoan] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [bankComplete, setBankComplete] = useState(true);
  const [showBankPopup, setShowBankPopup] = useState(false);
  const [banksList, setBanksList] = useState([]);
  const [bankFormData, setBankFormData] = useState({ bank_id: '', account_number: '', account_holder_name: '' });
  const [bankFormError, setBankFormError] = useState('');
  const [bankFormLoading, setBankFormLoading] = useState(false);

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
          const res = await fetch(apiUrl(`/loan/loans/dashboard_summary/?member_id=${user.member_id}`));
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
        const response = await fetch(apiUrl('/loan/loan-types/'));
        if (response.ok) {
          const data = await response.json();
          setLoanTypes(data);
        }
      } catch (error) {
        console.error('Failed to fetch loan types:', error);
      }
    };

    const checkBankAccount = async () => {
      try {
        const res = await fetch(apiUrl('/my-savings/bank-account-status/'), { headers: getAuthHeaders() });
        const data = await res.json();
        setBankComplete(!!data?.is_complete);
        if (!data?.is_complete) {
          setBankFormData({
            bank_id: data?.bank_id || '',
            account_number: data?.account_number || '',
            account_holder_name: data?.account_holder_name || '',
          });
          setShowBankPopup(true);
          const banksRes = await fetch(apiUrl('/banks/'), { headers: getAuthHeaders() });
          const banksData = await banksRes.json();
          setBanksList(Array.isArray(banksData) ? banksData : []);
        }
      } catch (e) {
        console.error('Failed to check bank account:', e);
      }
    };

    checkActiveLoan();
    fetchLoanTypes();
    checkBankAccount();
  }, []);

  const handleContinue = async (e) => {
    e.preventDefault();
    setLoadingAi(true);

    try {
      const userStr = localStorage.getItem('user');
      const user = userStr ? JSON.parse(userStr) : null;
      const memberId = user?.member_id || 1;

      const res = await fetch(apiUrl('/loan/loan-applications/get_prediction_pre_submit/'), {
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

      const response = await fetch(apiUrl('/loan/loan-applications/'), {
        method: 'POST',
        body: formData, 
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(errorText);
        throw new Error('Gagal mengirim pengajuan. Silakan periksa data Anda.');
      }

      const data = await response.json();
      console.log('Success:', data);
      
      alert('Pengajuan Pinjaman Berhasil Dikirim!');
      navigate('/dashboard/loans'); // Adjust if you have a different route for the loan dashboard

    } catch (error) {
      console.error(error);
      alert('Kesalahan: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };


  const handleBankFormSubmit = async () => {
    setBankFormError('');
    if (!bankFormData.bank_id || !bankFormData.account_number.trim() || !bankFormData.account_holder_name.trim()) {
      setBankFormError('Semua field wajib diisi');
      return;
    }
    setBankFormLoading(true);
    try {
      const res = await fetch(apiUrl('/my-savings/bank-account-status/'), {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, getAuthHeaders()),
        body: JSON.stringify(bankFormData),
      });
      const data = await res.json();
      if (res.ok) {
        setBankComplete(true);
        setShowBankPopup(false);
      } else {
        setBankFormError(data?.error || 'Gagal menyimpan data bank');
      }
    } catch {
      setBankFormError('Gagal menyimpan. Coba lagi.');
    } finally {
      setBankFormLoading(false);
    }
  };

  return (
    <div className="la-page">
      <div className="la-header">
        <button className="la-back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} /> Kembali
        </button>
        <div className="la-header-content">
          <h1>Pengajuan Pinjaman</h1>
          <p>Ajukan pinjaman baru</p>
        </div>
      </div>

      <div className="la-content-grid">
        <form className="la-form" onSubmit={handleContinue}>
          <div className="la-form-group">
            <label>JENIS ANGSURAN</label>
            <select
              required
              value={form.loan_type}
              onChange={(e) => {
                const val = e.target.value;
                setForm({ ...form, loan_type: val, duration_months: val === '1' ? '4' : '' });
              }}
            >
              <option value="" disabled>Pilih jenis...</option>
              {loanTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </div>

          <div className="la-form-group">
            <label>JUMLAH PINJAMAN</label>
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
            <label>JANGKA WAKTU (BULAN)</label>
            <select
              required
              value={form.duration_months}
              onChange={(e) => setForm({ ...form, duration_months: e.target.value })}
            >
              <option value="" disabled>Pilih jangka waktu...</option>
              {(() => {
                // If loan type is installments (id === '1'), only allow 4 months.
                // Otherwise (goods or other), allow 6, 12, 24 months as requested.
                const durations = form.loan_type === '1' ? [4] : [6, 12, 24];
                return durations.map((d) => (
                  <option key={d} value={String(d)}>{d} Bulan</option>
                ));
              })()}
            </select>
          </div>

          <div className="la-form-group">
            <label>TUJUAN</label>
            <input
              type="text"
              required
              value={form.purpose}
              onChange={(e) => setForm({ ...form, purpose: e.target.value })}
            />
          </div>

          <div className="la-form-group">
            <label>SLIP GAJI</label>
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
                  : 'Unggah slip gaji'}
              </span>
            </div>
          </div>

          <button type="submit" className="la-btn-continue" disabled={loadingAi || checkingLoan || !form.salary_statement_file || !bankComplete}>
            {loadingAi ? 'Memproses...' : (checkingLoan ? 'Memeriksa Profil...' : (!bankComplete ? 'Lengkapi Data Bank Terlebih Dahulu' : (!form.salary_statement_file ? 'Unggah Slip Gaji Terlebih Dahulu' : 'Lanjutkan')))}
          </button>
        </form>

        {showSimulation && (
          <div className="la-simulation-card fade-in">
            <div className="la-sim-header">
              <h2>Simulasi Angsuran</h2>
              <p className="la-sim-sub">Estimasi Pembayaran Bulanan</p>
            </div>
            
            <div className="la-sim-main">
              <div className="la-sim-amount">
                {formatRupiah(((form.amount_raw * (1 + (aiData?.suggested_interest_rate || 0.5) / 100 * parseInt(form.duration_months, 10))) / parseInt(form.duration_months, 10)))}
              </div>
              <p className="la-sim-desc">Berdasarkan {form.duration_months} bulan @ {aiData?.suggested_interest_rate || '0.5'}% bunga/bulan</p>
            </div>

            <div className="la-sim-details">
              <div className="la-sim-row">
                <span>Pokok Pinjaman</span>
                <span>{formatRupiah(form.amount_raw)}</span>
              </div>
              <div className="la-sim-row">
                <span>Prediksi Total Bunga</span>
                <span>{formatRupiah(form.amount_raw * (aiData?.suggested_interest_rate || 0.5) / 100 * parseInt(form.duration_months, 10))}</span>
              </div>
              <div className="la-sim-row total">
                <span>Total Pembayaran</span>
                <span>{formatRupiah(form.amount_raw * (1 + (aiData?.suggested_interest_rate || 0.5) / 100 * parseInt(form.duration_months, 10)))}</span>
              </div>
            </div>

            <p className="la-sim-disclaimer">
              Suku bunga yang ditampilkan adalah rekomendasi AI berdasarkan profil Anda. Persetujuan akhir bergantung pada tinjauan admin.
            </p>

            <label className="la-checkbox">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              <span>Saya memverifikasi bahwa informasi di atas sudah benar dan menyetujui syarat dan ketentuan.</span>
            </label>

            <button
              className="la-btn-submit"
              disabled={!agreed || submitting}
              onClick={handleSubmit}
            >
              {submitting ? 'Mengirim Pengajuan...' : 'Kirim'}
            </button>
          </div>
        )}
      </div>

      {showBankPopup && (
        <div className="la-bank-overlay" onClick={() => {}}>
          <div className="la-bank-popup" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Lengkapi Data Rekening Bank</h3>
            </div>
            <p style={{ color: '#64748b', fontSize: 13, marginBottom: 16 }}>
              Data rekening bank wajib diisi sebelum mengajukan pinjaman.
            </p>
            {bankFormError && <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 10 }}>{bankFormError}</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <select
                value={bankFormData.bank_id}
                onChange={(e) => setBankFormData({ ...bankFormData, bank_id: e.target.value })}
                style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14 }}
              >
                <option value="">Pilih Bank...</option>
                {banksList.map((b) => (
                  <option key={b.id} value={b.id}>{b.bank_name}</option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Nomor Rekening"
                value={bankFormData.account_number}
                onChange={(e) => setBankFormData({ ...bankFormData, account_number: e.target.value })}
                style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14 }}
              />
              <input
                type="text"
                placeholder="Nama Pemilik Rekening"
                value={bankFormData.account_holder_name}
                onChange={(e) => setBankFormData({ ...bankFormData, account_holder_name: e.target.value })}
                style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14 }}
              />
              <button
                onClick={handleBankFormSubmit}
                disabled={bankFormLoading}
                style={{
                  padding: '10px 16px', borderRadius: 8, border: 'none',
                  background: '#1d4ed8', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer',
                  opacity: bankFormLoading ? 0.6 : 1,
                }}
              >
                {bankFormLoading ? 'Menyimpan...' : 'Simpan & Lanjutkan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoanApplication;
