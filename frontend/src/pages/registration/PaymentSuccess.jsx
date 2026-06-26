import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, BadgeCheck, ArrowRight } from 'lucide-react';
import { apiUrl } from '../../services/api';
import './RegistrationPages.css';

const PaymentSuccess = () => {
  const navigate = useNavigate();
  const [principalAmount, setPrincipalAmount] = useState(100000);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(apiUrl('/member/members/saving_types_info/'));
        if (res.ok) {
          const data = await res.json();
          const principalType = data.find(st => st.id === 3);
          if (principalType) {
            setPrincipalAmount(principalType.minimum_amount);
          }
        }
      } catch (error) {
        console.error('Error fetching principal amount:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const handleDashboard = () => {
    navigate('/login');
  };

  return (
    <div className="payment-success-page">
      <div className="payment-success-backdrop payment-success-backdrop-left" />
      <div className="payment-success-backdrop payment-success-backdrop-right" />

      <div className="payment-success-shell">
        <div className="payment-success-card">
          <div className="payment-success-hero">
            <div className="payment-success-icon-wrap">
              <CheckCircle2 size={34} />
            </div>
            <div className="payment-success-hero-copy">
              <span className="payment-success-pill">
                <BadgeCheck size={14} />
                Pembayaran Terverifikasi
              </span>
              <h2>Akun Diaktifkan</h2>
              <p>
                Pembayaran simpanan pokok Anda telah diterima dan keanggotaan Anda sekarang aktif.
              </p>
            </div>
          </div>

          <div className="payment-success-message">
            Selamat bergabung di koperasi. Anda sekarang dapat mengakses dashboard untuk mengelola simpanan dan aktivitas akun Anda.
          </div>

          <div className="payment-success-summary">
            <div className="payment-success-summary-header">
              <div>
                <span className="payment-success-label">Ringkasan Pembayaran</span>
                <h3>Konfirmasi Simpanan Pokok</h3>
              </div>
              <span className="payment-success-status">Terverifikasi & Diproses</span>
            </div>

            <div className="payment-success-rows">
              <div className="payment-success-row">
                <span>Jumlah Dibayar</span>
                <strong>{!loading ? formatCurrency(principalAmount) : 'Memuat...'}</strong>
              </div>
              <div className="payment-success-row">
                <span>Jenis Pembayaran</span>
                <strong>Simpanan Pokok Wajib</strong>
              </div>
              <div className="payment-success-row">
                <span>Status</span>
                <strong className="payment-success-status-text">Berhasil Diselesaikan</strong>
              </div>
            </div>
          </div>

          <div className="payment-success-agreement">
            <h4>Perjanjian Keanggotaan</h4>
            <p>
              Dengan mendaftar sebagai anggota koperasi, Anda setuju untuk mempertahankan simpanan pokok wajib sebesar{' '}
              <span>{!loading ? formatCurrency(principalAmount) : 'Rp 100.000'}</span>
              {' '}selama masa keanggotaan aktif.
            </p>
          </div>

          <div className="payment-success-actions">
            <button className="payment-success-btn" onClick={handleDashboard}>
              Ke Halaman Login
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentSuccess;
